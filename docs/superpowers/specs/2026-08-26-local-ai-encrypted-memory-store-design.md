# Local AI Encrypted Memory Store Design

**Date:** 2026-08-26  
**Status:** Approved for direct implementation; the user explicitly waived further section-by-section review.  
**Batch:** 1 of 4 — local durable memory only. FEID server replication, multi-device recovery, model recall injection, and command-manifest parity are separate follow-on batches.

## Goal

Give the Windows desktop client a durable, searchable, local-authoritative memory vault for complete chat messages and timestamps, playback events, playlists/favorites, music-scene presets, and explicit user facts. The vault must never persist credentials, must fail closed when its key cannot be recovered, and must expose a narrow same-origin API instead of exposing storage details to the browser.

## Decisions

- Use ordinary SQLite through Xerial SQLite JDBC 3.53.2.1 for transactions and indexes. It is not SQLCipher and is never described as full-database encryption.
- Encrypt every sensitive record payload with AES-256-GCM before SQLite receives it. Bind `schemaVersion`, immutable vault ID, scope hash, record ID, type, and occurrence time as authenticated additional data.
- Store searchable terms only as HMAC-SHA-256 blind tokens derived from a separate key. SQLite never receives chat text, song names, preset names, or unhashed search terms.
- Generate one random 256-bit vault master key. At rest it exists only as a Windows CurrentUser DPAPI blob protected with fixed application entropy. A dedicated `fe-monster-wincrypto.dll` JNI module performs `CryptProtectData` and `CryptUnprotectData`; audio DLLs are not reused.
- Keep a replaceable `LocalMemoryStore` interface so a properly licensed official SQLCipher JDBC implementation can be added later without changing callers.
- Use stable UUID event IDs and a per-install immutable `memoryVaultId`. FEID is renameable and must not be key material or authenticated-data identity.
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

- `LocalMemoryEvent`: validated immutable event input (`eventId`, `scope`, `type`, `occurredAt`, payload).
- `LocalMemoryStore`: `append`, `appendBatch`, `query`, `forget`, `backup`, `restore`, `health`, and `close`.
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
  quarantine/<timestamp>/     # complete corrupt db/wal/shm evidence set
```

On first startup, generate the vault ID and 32 random key bytes, protect the key with DPAPI CurrentUser plus fixed entropy, durably write the DPAPI blob, then initialize SQLite. On later startup, unwrap before opening SQLite. A missing/tampered/unrecoverable key while any vault file exists is a locked-vault error; no replacement vault is generated. If the JNI DLL is absent or wrong-architecture, the vault stays unavailable and no plaintext files are created.

HKDF labels derive distinct 32-byte keys for record encryption, blind search, backup authentication, and future sync encryption. AES-GCM nonces are 96 random bits and stored beside ciphertext. No nonce is reused by design because every encryption uses `SecureRandom`; tests also assert distinct ciphertext for equal plaintext.

## Schema

Schema version 1 uses WAL, `foreign_keys=ON`, `busy_timeout=5000`, and `synchronous=FULL` for vault mutations.

```sql
CREATE TABLE vault_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  schema_version INTEGER NOT NULL,
  vault_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE memory_records (
  event_id TEXT PRIMARY KEY,
  scope_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  occurred_at INTEGER,
  imported_at INTEGER NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  aad_version INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX memory_records_scope_time
  ON memory_records(scope_hash, type, occurred_at DESC, event_id DESC);

CREATE TABLE memory_search_tokens (
  event_id TEXT NOT NULL REFERENCES memory_records(event_id) ON DELETE CASCADE,
  token BLOB NOT NULL,
  PRIMARY KEY(event_id, token)
);
CREATE INDEX memory_search_lookup ON memory_search_tokens(token, event_id);
```

Payloads retain domain fields inside the encrypted JSON envelope. Types are namespaced: `chat.message`, `legacy.chat_snapshot`, `playback.started`, `playback.completed`, `playback.skipped`, `playback.replayed`, `library.playlist_snapshot`, `library.favorite_changed`, `scene.preset_saved`, `scene.preset_applied`, and `user.fact`.

Chat payloads include conversation ID, role, text, source, and trusted occurrence time. Playback payloads include stable provider/song IDs, semantic metadata, position/duration totals, and action; never media URLs. Scene payloads include stable preset/component IDs and finite bounded position/rotation/scale values; never asset URLs or local paths.

## Query, deletion, backup, and recovery

Queries require a scope, a type allowlist, a limit from 1 through 100, and an optional before cursor. Text search normalizes and tokenizes on the client, HMACs each token, intersects tokens in SQL, then decrypts at most the requested bounded candidate set. Results are sorted deterministically by occurrence time then event ID. Decryption/authentication failure stops that query and reports a redacted vault integrity error.

`eventId` makes append idempotent. A duplicate with identical authenticated content succeeds as `duplicate=true`; a duplicate ID with different content is a conflict and changes nothing. Batch append is all-or-nothing.

Local deletion writes a tombstone timestamp and removes search tokens in one transaction. Physical SQLite erasure is not claimed. Scope deletion additionally rotates a scope data key in later sync work; batch 1 runs checkpoint plus secure-delete vacuum only from an explicit maintenance operation. Permanent cross-device tombstones are added in batch 2.

Backup closes/checkpoints a consistent read transaction and exports encrypted record envelopes plus a manifest authenticated by the backup key. Restore validates manifest, vault ID, schema version, every envelope tag, and event uniqueness into a sibling temporary database, then atomically swaps the complete database set. A foreign machine cannot unwrap `vault-key.dpapi`; cross-device recovery requires batch 3's authorized recovery key flow.

Corruption handling checkpoints and closes connections, then atomically moves the complete `db/-wal/-shm` set into one quarantine directory. If quarantine cannot be completed, the service stays locked and does not create or overwrite a database. Disk-full, read-only, busy, and migration failures propagate as redacted structured errors and leave the previous committed state readable.

## HTTP contract

- `GET /api/local-memory/health`
- `POST /api/local-memory/events` — one event or a batch of at most 100, body at most 1 MiB, idempotent event IDs.
- `GET /api/local-memory/context?provider=...&types=...&limit=...&before=...&q=...`
- `POST /api/local-memory/forget` — exact event IDs, a conversation ID, a type range, or a complete scope.
- `POST /api/local-memory/backup`
- `POST /api/local-memory/restore` — raw `.fememory` archive body streamed into a fixed vault-owned temporary path, with a 64 MiB hard limit; browser callers never supply filesystem paths.

All routes are loopback/same-origin, return structured error codes, and never include exception messages, SQL, filesystem paths, key state, ciphertext, or rejected values. The browser supplies only a provider hint; Java reads the provider account itself and derives the internal FEID-backed scope through `CommunityClient.petPersonalizationScope`, with a separate device-local anonymous scope when no FEID is authenticated. Browser-provided `scope`, `feId`, or account IDs are rejected. JSON request bodies use a 1 MiB bounded reader rather than the existing unbounded `readAllBytes` helper; restore is the sole 64 MiB streaming exception and never buffers the complete archive in heap.

## Event capture

- `pet-assistant.js` assigns stable conversation/message IDs and timestamps at the unified message insertion point. Successful local and server-model replies use the same sink. Existing last-48 localStorage data is imported once as a sanitized `legacy.chat_snapshot` with unknown occurrence times; it is not rewritten as fake individual history.
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
- Exact chat time and semantic music/playlist/scene data survive restart; temporary conversation content never appears.
- Equal plaintext produces different ciphertext; tampering with nonce, ciphertext, tag, AAD, DPAPI blob, or blind token fails closed.
- A byte scan of SQLite, WAL, SHM, backups, logs, HTTP responses, and temporary files finds neither the test plaintext nor the search terms.
- Duplicate IDs are idempotent; conflicting duplicates, invalid scopes/types, oversized bodies, non-finite geometry, secrets, URLs, and absolute paths are rejected.
- Scope isolation, concurrent writers, database lock, disk-full/read-only behavior, corrupt database quarantine, missing key, missing/wrong DLL, migration rollback, and future-schema refusal have automated probes.
- Existing Java build, `java -jar` launch, jlink runtime, WinForms client, Android/public server launch paths, audio pipeline, and installer contracts remain green.
