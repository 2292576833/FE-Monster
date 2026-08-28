# Local AI Encrypted Memory Store Design

**Date:** 2026-08-26  
**Status:** Approved for direct implementation; the user explicitly waived further section-by-section review.  
**Batch:** 1 of 4 — local durable memory. FEID server replication, multi-device recovery, and model recall injection remain follow-on batches. Command-manifest parity is being delivered alongside this batch as an independent transport contract and does not widen memory authority.

## Goal

Give the Windows desktop client a durable, searchable, local-authoritative memory vault for complete chat messages and timestamps, separately auditable operation history, playback events, playlists/favorites, music-scene presets, and explicit user facts. The vault must make it possible to reconstruct what was said, what subsequently happened, when each event occurred, and which message/turn caused an operation—without mixing chat rows with operation rows. It must never persist credentials, must fail closed when its key cannot be recovered, and must expose a narrow same-origin API instead of exposing storage details to the browser.

## Decisions

- Use ordinary SQLite through Xerial SQLite JDBC 3.53.2.1 for transactions and indexes. It is not SQLCipher and is never described as full-database encryption.
- Encrypt every sensitive record payload with AES-256-GCM before SQLite receives it. Bind `schemaVersion`, immutable vault ID, scope hash, record ID, type, and occurrence time as authenticated additional data.
- Store searchable terms only as HMAC-SHA-256 blind tokens derived from a separate key. SQLite never receives chat text, song names, preset names, or unhashed search terms.
- Generate one random 256-bit vault master key. At rest it exists only as a Windows CurrentUser DPAPI blob protected with fixed application entropy. A dedicated `fe-monster-wincrypto.dll` JNI module performs `CryptProtectData` and `CryptUnprotectData`; audio DLLs are not reused.
- Keep a replaceable `LocalMemoryStore` interface so a properly licensed official SQLCipher JDBC implementation can be added later without changing callers.
- Use stable UUID event IDs and a per-install immutable `memoryVaultId`. FEID is renameable and must not be key material or authenticated-data identity.
- Keep chat messages, operation/audit lifecycle events, and derived knowledge/snapshots in physically separate tables and separate query result collections. Shared random `traceId`, `turnId`, `messageId`, and `operationId` fields provide correlation without collapsing the records into one timeline blob.
- Preserve both `occurredAt` (when the source says it happened) and vault-owned `recordedAt` (when it was durably accepted), plus a bounded per-source sequence. New chat and operation events require a trusted occurrence time; legacy imports with unknown time remain explicitly `timeAccuracy=unknown` and are never assigned a fabricated timestamp.
- Do not store copyrighted stream bytes. Optional encrypted user-imported attachments belong to a later batch.

Official dependency references:

- Xerial SQLite JDBC release 3.53.2.1: https://github.com/xerial/sqlite-jdbc/releases/tag/3.53.2.1
- Xerial Apache-2.0 license declaration: https://github.com/xerial/sqlite-jdbc/blob/3.53.2.1/pom.xml
- Windows DPAPI `CryptProtectData`: https://learn.microsoft.com/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata
- Windows DPAPI `CryptUnprotectData`: https://learn.microsoft.com/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata

## Scope and non-goals

Batch 1 includes:

- dependency pinning, checksum enforcement, notices, runtime classpath, jlink, installer staging, and clean-install probing;
- DPAPI key creation/recovery and fail-closed health reporting;
- encrypted SQLite schema, migrations, idempotent event writes, blind-token search, bounded retrieval, deletion, encrypted backup, and atomic restore;
- capture of new chat events, playback lifecycle events, playlist/favorite snapshots, and scene preset save/apply events;
- local-memory HTTP routes and a temporary-conversation mode that never calls the durable sink.

Batch 1 does not upload anything, does not call the FEID server, does not inject memories into either AI model, and does not change the canonical command library. Those boundaries prevent a local-storage change from silently widening network or model authority.

## Threat model and privacy boundary

The design protects memory at rest from casual file inspection, copied SQLite/WAL files, installer-directory access, and an offline attacker who does not have the logged-in Windows user context. DPAPI does not protect against malicious software already running as the same Windows user. The data directory keeps owner-only ACLs in addition to DPAPI.

The following are always rejected recursively by normalized key name and value shape:

- API keys, access/refresh tokens, cookies, authorization headers, passwords, credentials, sessions, private keys, payment data;
- playback URLs, signed/query URLs, server/model/base URLs, blob URLs, local absolute paths, file handles, raw headers, raw HTTP requests or responses;
- authentication JSON files, browser login profiles, `client-ai-state.json`, and raw `PlayerService.url` values.

Temporary conversations are held only in browser memory. They do not enter localStorage, the local-memory API, backups, or later sync outboxes.

## Component boundaries

`com.femonster.memory` owns the subsystem:

- `LocalMemoryEvent`: validated immutable event input (`eventId`, `stream`, `scope`, `type`, `occurredAt`, `sourceSequence`, trace/correlation IDs, payload).
- `LocalMemoryStore`: separate `appendChats`, `appendOperations`, `appendKnowledge`, `queryChats`, `queryOperations`, and `queryKnowledge` methods plus bounded batch, forget, backup, restore, health, and close operations.
- `SqliteEncryptedMemoryStore`: transaction and schema implementation; callers never receive JDBC objects.
- `MemoryCrypto`: HKDF-SHA-256 key derivation, AES-256-GCM envelopes, HMAC tokens, nonce generation, and best-effort byte clearing.
- `KeyProtector`: small interface with production `WindowsDpapiKeyProtector` and deterministic test implementation.
- `MemoryVaultKeyManager`: creates or unwraps the master key and immutable vault metadata without overwriting unrecoverable state.
- `MemorySanitizer`: allowlist-based payload shaping and recursive secret/URL/path rejection.
- `MemoryTokenizer`: Unicode normalization plus word, prefix, and CJK bigram/trigram tokenization; only HMAC output reaches SQLite.
- `LocalAiMemoryService`: serialized lifecycle, bounded API DTOs, scope isolation, and structured redacted errors.
- `LocalMemoryHttpModule`: same-origin, bounded-body HTTP adapter for `/api/local-memory/*`.

`AppContext` constructs one `LocalAiMemoryService` under `data/local-ai-memory/` and closes it before the AI gateway and player. If DPAPI or SQLite is unavailable, the app remains usable but durable memory reports `available=false`; it never falls back to plaintext.

## Storage layout and key lifecycle

```text
data/local-ai-memory/
  vault-meta.json             # schema, immutable vault ID, key purpose; no secret
  vault-key.dpapi             # DPAPI ciphertext only
  memory.db                   # SQLite metadata + encrypted payloads + blind tokens
  memory.db-wal / -shm        # treated as one recovery unit with memory.db
  backups/*.fememory          # already encrypted record envelopes + authenticated manifest
  .memory-restore-intent.json # signed crash-recovery state; absent outside an active restore
  .memory-quarantine-lock.json # durable fail-closed marker after verified corruption
  quarantine/<timestamp>/     # complete corrupt db/wal/shm evidence set
```

On first startup, generate the vault ID and 32 random key bytes, protect the key with DPAPI CurrentUser plus fixed entropy, durably write the DPAPI blob, then initialize SQLite. On later startup, unwrap before opening SQLite. A missing/tampered/unrecoverable key while any vault file exists is a locked-vault error; no replacement vault is generated. If the JNI DLL is absent or wrong-architecture, the vault stays unavailable and no plaintext files are created.

HKDF labels derive distinct 32-byte keys for record encryption, blind search, backup authentication, and future sync encryption. AES-GCM nonces are 96 random bits and stored beside ciphertext. No nonce is reused by design because every encryption uses `SecureRandom`; tests also assert distinct ciphertext for equal plaintext.

## Schema

Schema version 1 uses WAL, `foreign_keys=ON`, `busy_timeout=5000`, and `synchronous=FULL` for vault mutations. Chat and operation history are not stored in a shared generic record table.

```sql
CREATE TABLE vault_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  schema_version INTEGER NOT NULL,
  vault_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE chat_records (
  message_id TEXT PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  conversation_token BLOB NOT NULL,
  type TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  turn_id TEXT,
  occurred_at INTEGER,
  recorded_at INTEGER NOT NULL,
  source_sequence INTEGER NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  aad_version INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX chat_records_scope_time
  ON chat_records(scope_hash, occurred_at DESC, recorded_at DESC, source_sequence DESC, message_id DESC);
CREATE INDEX chat_records_scope_type
  ON chat_records(scope_hash, type, occurred_at DESC, message_id DESC);
CREATE INDEX chat_records_trace
  ON chat_records(scope_hash, trace_id, turn_id);

CREATE TABLE chat_search_tokens (
  message_id TEXT NOT NULL REFERENCES chat_records(message_id) ON DELETE CASCADE,
  token BLOB NOT NULL,
  PRIMARY KEY(message_id, token)
);
CREATE INDEX chat_search_lookup ON chat_search_tokens(token, message_id);

CREATE TABLE operation_records (
  event_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  scope_hash TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  turn_id TEXT,
  caused_by_message_id TEXT,
  type TEXT NOT NULL,
  phase TEXT NOT NULL,
  actor TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  source_sequence INTEGER NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  aad_version INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX operation_records_scope_time
  ON operation_records(scope_hash, occurred_at DESC, recorded_at DESC, source_sequence DESC, event_id DESC);
CREATE INDEX operation_records_trace
  ON operation_records(scope_hash, trace_id, operation_id, occurred_at);
CREATE INDEX operation_records_operation
  ON operation_records(scope_hash, operation_id, occurred_at DESC, event_id DESC);

CREATE TABLE operation_search_tokens (
  event_id TEXT NOT NULL REFERENCES operation_records(event_id) ON DELETE CASCADE,
  token BLOB NOT NULL,
  PRIMARY KEY(event_id, token)
);
CREATE INDEX operation_search_lookup ON operation_search_tokens(token, event_id);

CREATE TABLE knowledge_records (
  event_id TEXT PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER,
  recorded_at INTEGER NOT NULL,
  source_sequence INTEGER NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  aad_version INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX knowledge_records_scope_time
  ON knowledge_records(scope_hash, type, occurred_at DESC, recorded_at DESC, source_sequence DESC, event_id DESC);

CREATE TABLE knowledge_search_tokens (
  event_id TEXT NOT NULL REFERENCES knowledge_records(event_id) ON DELETE CASCADE,
  token BLOB NOT NULL,
  PRIMARY KEY(event_id, token)
);
CREATE INDEX knowledge_search_lookup ON knowledge_search_tokens(token, event_id);
```

Payloads retain domain fields inside the encrypted JSON envelope. Chat `eventId` is exactly its immutable `messageId`/`chat_records.message_id`; it is not a second identifier. Chat types are `chat.message` and `legacy.chat_snapshot`. Operation types are namespaced lifecycle records such as `command.requested`, `command.confirmed`, `command.started`, `command.succeeded`, `command.failed`, `command.cancelled`, `command.reverted`, `playback.started`, `playback.completed`, `playback.skipped`, `playback.replayed`, `library.favorite_changed`, `scene.preset_saved`, and `scene.preset_applied`. Knowledge types are `library.playlist_snapshot` and `user.fact`.

Canonical event JSON recursively sorts object keys and normalizes numeric representations before encryption and duplicate comparison. Ingress accepts only JSON-round-trippable Java numeric wrappers (`Byte`/`Short`/`Integer`/`Long`/`Float`/`Double`); Java-only arbitrary-precision `Number` instances are rejected instead of being committed into a form the strict JSON reader cannot reconstruct exactly. The authenticated-data tuple binds `schemaVersion`, immutable vault ID, stream, scope hash, record ID, type, and the exact SQL occurrence-time value; therefore every one of those fields needed before decryption is also present in the matching physical table. `vault_state.created_at` is derived from the same `MemoryVaultKeyManager.KeyLease.createdAt` value as `vault-meta.json`, represented as epoch milliseconds, and is checked on every open.

Chat payloads include the exact sanitized message text, conversation ID, message ID, role, source/model origin, trace ID, turn ID, trusted occurrence time, vault receipt time, source sequence, and explicit time accuracy. Operation payloads include the registered command/event name, actor (`user`, `local-ai`, `server-ai`, `app`, or `system`), phase/status, bounded sanitized arguments, outcome, before/after summary, command receipt, undo reference, and failure code. They carry the same trace/turn IDs and `causedByMessageId` when a chat turn caused the operation. Playback payloads include stable provider/song IDs, semantic metadata, position/duration totals, and action; never media URLs. Scene payloads include stable preset/component IDs and finite bounded position/rotation/scale values; never asset URLs or local paths.

## Query, deletion, backup, and recovery

Every open performs SQLite integrity/foreign-key checks plus a complete authenticated audit of all envelopes, public projections, tombstones, blind-token sets, and cross-stream event-ID uniqueness before any filtered read is served. This prevents a tampered public filter or removed blind token from making a record silently disappear. Queries require a scope, one explicit stream (`chat`, `operation`, or `knowledge`), a type allowlist, a limit from 1 through 100, and an optional before cursor. Chat and operation endpoints never return a merged array. A trace lookup may return `{ chats: [...], operations: [...] }`, preserving the separation while showing causality. Text search normalizes and tokenizes on the client, HMACs each token, intersects only that stream's token table in SQL, then decrypts at most the requested bounded candidate set. Results are sorted deterministically by occurrence time, vault receipt time, source sequence, then record ID. Decryption/authentication failure stops that query and reports a redacted vault integrity error.

`eventId` makes append idempotent. A duplicate with identical authenticated content succeeds as `duplicate=true`; a duplicate ID with different content is a conflict and changes nothing. Batch append is all-or-nothing.

Local deletion writes a tombstone timestamp and removes search tokens in one transaction. Physical SQLite erasure is not claimed. Scope deletion additionally rotates a scope data key in later sync work; batch 1 runs checkpoint plus secure-delete vacuum only from an explicit maintenance operation. Permanent cross-device tombstones are added in batch 2.

Backup first repeats the complete authenticated database audit and checkpoint, then streams the encrypted SQLite body behind a bounded canonical manifest containing vault ID, schema version, DB length, and DB SHA-256. The backup-key HMAC authenticates the small format header and manifest, while the authenticated digest covers the complete body without the 1 MiB MAC-input ceiling or whole-archive heap buffering. Backup and restore paths are confined to the pinned, owner-only vault tree.

Restore streams into a sibling temporary database and validates the manifest, body digest, vault ID, schema version, exact schema SQL, SQLite integrity/foreign keys, every envelope tag, public projection, token set, and event uniqueness. Before publication it checkpoints the live DB, creates a durable old-DB recovery copy, and atomically publishes a signed fsynced restore intent from a same-directory staging file. The intent authenticates both old/new physical SHA-256 values and deterministic logical roots over `vault_state`, every column of every chat/operation/knowledge row, and every blind-token row in stable order. Publication uses one atomic same-volume replace of the existing `memory.db`, so the live filename is never deliberately absent. A likewise atomically published signed marker lets startup reconcile crash points before schema initialization, including the physical hash transition when SQLite switches the restored database from DELETE journaling back to WAL; the selected live database must still match the signed logical root after its complete audit, so deleting an entire row plus its cascading tokens cannot disappear from verification. Startup retains the old DB before publication, retains the verified new DB after publication, or republishes the recovery copy if the live name is unexpectedly missing. Half-written marker staging files are inert and safely discarded. Recovery artifacts and intent are removed only after the selected DB has reopened, passed the full audit and logical-root check, and had its ACLs hardened.

Verified corruption writes a signed durable quarantine manifest and root lock before recoverable staged moves of the `db/-wal/-shm` evidence set; any incomplete replacement or quarantine state stays locked and never creates a new database. A foreign machine cannot unwrap `vault-key.dpapi`; cross-device recovery requires batch 3's authorized recovery key flow.

Corruption handling checkpoints and closes connections, then atomically moves the complete `db/-wal/-shm` set into one quarantine directory. If quarantine cannot be completed, the service stays locked and does not create or overwrite a database. Disk-full, read-only, busy, and migration failures propagate as redacted structured errors and leave the previous committed state readable.

## HTTP contract

- `GET /api/local-memory/health`
- `POST /api/local-memory/events` — one event or a batch of at most 100, body at most 1 MiB, idempotent event IDs.
- `GET /api/local-memory/chats?provider=...&conversation=...&limit=...&before=...&q=...`
- `GET /api/local-memory/operations?provider=...&traceId=...&operationId=...&types=...&limit=...&before=...&q=...`
- `GET /api/local-memory/trace?provider=...&traceId=...` — returns separate `chats` and `operations` collections.
- `GET /api/local-memory/context?provider=...&types=...&limit=...&before=...&q=...` — model-facing bounded projection; it keeps source stream labels and never rewrites operations as chat.
- `POST /api/local-memory/forget` — an explicit stream plus exact record IDs, a conversation ID, an operation ID/type range, or a complete scope.
- `POST /api/local-memory/backup`
- `POST /api/local-memory/restore` — raw `.fememory` archive body streamed into a fixed vault-owned temporary path, with a 64 MiB hard limit; browser callers never supply filesystem paths.

All routes are loopback/same-origin, return structured error codes, and never include exception messages, SQL, filesystem paths, key state, ciphertext, or rejected values. The browser supplies only a provider hint; Java reads the provider account itself and derives the authenticated scope from an immutable server account-subject ID. Renameable FEID remains a user-facing alias and server-backup lookup attribute, never AAD/key identity; Task 5 must add an explicit alias migration if the server cannot yet expose an immutable subject. A separate device-local anonymous scope is used when no account is authenticated. Browser-provided `scope`, `feId`, or account IDs are rejected. JSON request bodies use a 1 MiB bounded reader rather than the existing unbounded `readAllBytes` helper; restore is the sole 64 MiB streaming exception and never buffers the complete archive in heap.

## Event capture

- `pet-assistant.js` assigns stable conversation/message/trace/turn IDs, a trusted wall-clock occurrence time, source sequence, role, and model origin at the unified message insertion point. Successful local and server-model replies use the same chat sink. Existing last-48 localStorage data is imported once as a sanitized `legacy.chat_snapshot` with `timeAccuracy=unknown`; it is not rewritten as fake individual history.
- The shared command bus emits operation lifecycle events at inspect/request, confirmation, start, terminal result, cancellation, replay, and undo boundaries. Each lifecycle event retains one stable `operationId`, its own event ID and time, the initiating trace/turn/message IDs, actor/model origin, command manifest revision, and the real command receipt. These events use only the operation sink and never become chat messages.
- `playback-intelligence.js` emits durable events from its narrow `notify(event, payload)` boundary for start, complete, skip, replay, and bounded duration summaries; high-frequency progress ticks are excluded.
- `app.js` records logged-in playlist snapshots only after a successful provider response, favorite changes at their actual success point, and scene preset saved/applied after the existing API succeeds.
- Browser sinks batch briefly, retry idempotently, and never block animation, audio, or UI. A failed memory write changes only the memory health indicator.

## Build, license, and installer contract

Pin and verify these artifacts before use:

- `sqlite-jdbc-3.53.2.1-without-natives.jar`, SHA-256 `4baeeb32cfb8ac3e5922e0fe50b8f78e4fe39d00f68824ce677a9477c686715b`;
- `sqlite-jdbc-3.53.2.1-natives-windows.jar`, SHA-256 `05c622ecd7337d96f7ccbd0599fee00cf62af81364fd188a848eb3469f4e17a2`;
- `slf4j-api-1.7.36.jar`, SHA-256 `d3ef575e3e4979678dc01bf1dcce51021493b4d11fb7f1be8ad982877c16a1c0`.

The repository vendors the verified artifacts and Apache/MIT notices so production builds are offline and reproducible. `build-java.ps1` stages them under `out/lib` and writes a stable manifest `Class-Path`, preserving every existing `java -jar` launcher. `build-installer.ps1` includes `java.sql`, stages the dependency jars, WinCrypto DLL, receipts, and licenses, and requires them in payload/integrity checks. Clean-install QA must create a vault, restart, retrieve the encrypted record, and scan db/wal/shm/temp files to prove the plaintext marker is absent.

## Acceptance criteria

- A fresh Windows user can create, restart, query, search, delete, back up, and restore memories from the installed app.
- Exact chat text/time/source and separately queryable operation time/actor/status survive restart. A trace query can prove which message led to which operation without merging the chat and operation records; temporary conversation content never appears.
- Equal plaintext produces different ciphertext; tampering with nonce, ciphertext, tag, AAD, DPAPI blob, or blind token fails closed.
- A byte scan of SQLite, WAL, SHM, backups, logs, HTTP responses, and temporary files finds neither the test plaintext nor the search terms.
- Duplicate IDs are idempotent; conflicting duplicates, invalid scopes/types, oversized bodies, non-finite geometry, secrets, URLs, and absolute paths are rejected.
- Scope isolation, concurrent writers, database lock, disk-full/read-only behavior, corrupt database quarantine, missing key, missing/wrong DLL, migration rollback, and future-schema refusal have automated probes.
- Existing Java build, `java -jar` launch, jlink runtime, WinForms client, Android/public server launch paths, audio pipeline, and installer contracts remain green.
