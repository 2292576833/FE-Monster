# Local AI Encrypted Memory Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production batch of FE Monster's local-authoritative, encrypted, searchable AI memory vault; preserve exact chat history and a separately auditable operation history with causal trace links; and connect new chat, playback, playlist, favorite, command, and scene-preset events to it.

**Architecture:** Xerial SQLite JDBC stores transaction metadata, AES-256-GCM envelopes, and HMAC-SHA-256 blind search tokens. A dedicated Windows DPAPI JNI DLL protects the vault master key, while a narrow Java service and same-origin HTTP module keep JDBC, key material, and internal FEID scopes out of browser code.

**Tech Stack:** Java 17, JDBC, SQLite 3.53.2.1, JCE AES/GCM/HMAC/HKDF, Windows C++/JNI/DPAPI, PowerShell build and installer scripts, browser JavaScript event sinks, Node/Java behavior probes.

**Spec:** `docs/superpowers/specs/2026-08-26-local-ai-encrypted-memory-store-design.md`

## Global Constraints

- Sensitive payloads use AES-256-GCM; SQLite receives no plaintext record body or search term.
- The vault key is random 32-byte material stored only as a Windows CurrentUser DPAPI blob with application entropy.
- Production fails closed when DPAPI, the JNI DLL, the key blob, or SQLite is unavailable; no plaintext fallback exists.
- Browser callers never choose `scope`, `feId`, or account ID; Java derives the internal scope from the authenticated provider account.
- JSON HTTP bodies are at most 1 MiB, restore archives stream to a fixed vault-owned temporary file with a 64 MiB hard limit, batches are at most 100, query results are at most 100, and errors reveal no SQL, path, key state, ciphertext, or rejected value.
- `eventId` writes are idempotent; a conflicting duplicate changes nothing; batch append is transactional.
- Chat, operation/audit, and knowledge/snapshot records use physically separate tables, sinks, selectors, and result collections. Shared trace/turn/message/operation IDs provide causality without mixing chat text with action history.
- New chat and operation records require `occurredAt`, vault-owned `recordedAt`, source/model actor, and a bounded per-source sequence. Unknown legacy times stay explicitly unknown and are never fabricated.
- Credentials, tokens, cookies, authorization values, passwords, sessions, URLs, absolute paths, raw headers, and raw HTTP bodies are rejected recursively.
- `java -jar out/fe-monster-java.jar` remains a supported launch path.
- All dependency versions, hashes, licenses, runtime modules, and installer payloads are pinned and verified.

---

### Task 1: Pin and stage the SQLite runtime

**Files:**
- Create: `third_party/java/local-memory/dependencies.json`
- Create: `third_party/java/local-memory/LICENSE-SQLITE-JDBC.txt`
- Create: `third_party/java/local-memory/LICENSE-SLF4J.txt`
- Create: `scripts/provision-local-memory-dependencies.ps1`
- Create: `scripts/check-local-memory-dependencies.ps1`
- Modify: `scripts/build-java.ps1`
- Test: `scripts/check-local-memory-build-contract.mjs`

**Interfaces:**
- Produces three verified files in `third_party/java/local-memory/lib/` and copies them to `out/lib/`.
- Produces app-manifest `Class-Path` entries for the three relative `lib/*.jar` paths.
- Preserves the existing stable and randomized app jar outputs.

- [x] **Step 1: Write the failing dependency/build contract**

Assert exact coordinates, SHA-256 values from the spec, offline vendored files, license files, manifest `Class-Path`, and rejection after a one-byte tamper in a copied fixture.

- [x] **Step 2: Run the contract and verify it fails**

Run: `node scripts/check-local-memory-build-contract.mjs`  
Expected: FAIL because the receipt, provisioner, and classpath contract do not exist.

- [x] **Step 3: Implement verified provisioning and staging**

The provisioner downloads only when a vendored artifact is absent, writes to a sibling `.download` file, verifies SHA-256, and atomically renames. The checker never downloads and fails on missing, extra, or mismatched artifacts. Build calls the checker, copies jars to `out/lib`, and creates the app jar with this manifest shape:

```text
Manifest-Version: 1.0
Main-Class: com.femonster.FeMonsterJavaApp
Class-Path: lib/sqlite-jdbc-3.53.2.1-without-natives.jar lib/sqlite-jdbc-3.53.2.1-natives-windows.jar lib/slf4j-api-1.7.36.jar
```

- [x] **Step 4: Provision once and run build probes**

Run: `powershell -NoProfile -File scripts/provision-local-memory-dependencies.ps1`  
Run: `powershell -NoProfile -File scripts/check-local-memory-dependencies.ps1`  
Run: `powershell -NoProfile -File scripts/build-java.ps1`  
Run: `node scripts/check-local-memory-build-contract.mjs`  
Expected: all PASS; `jar --describe-module`/manifest inspection shows the classpath and `Class.forName("org.sqlite.JDBC")` succeeds with the built app layout.

- [x] **Step 5: Commit**

```bash
git add third_party/java/local-memory scripts/provision-local-memory-dependencies.ps1 scripts/check-local-memory-dependencies.ps1 scripts/check-local-memory-build-contract.mjs scripts/build-java.ps1
git commit -m "build: pin local memory sqlite runtime"
```

### Task 2: Add the dedicated DPAPI key protector

**Files:**
- Create: `native/windows/fe_monster_wincrypto.cpp`
- Create: `scripts/build-wincrypto.ps1`
- Create: `src/main/java/com/femonster/memory/KeyProtector.java`
- Create: `src/main/java/com/femonster/memory/WindowsDpapiKeyProtector.java`
- Create: `src/test/java/com/femonster/memory/WindowsDpapiKeyProtectorProbe.java`
- Create: `scripts/check-local-memory-dpapi.mjs`

**Interfaces:**
- Produces: `byte[] KeyProtector.protect(byte[] plaintext, byte[] entropy)` and `byte[] unprotect(byte[] protectedBytes, byte[] entropy)`.
- Produces: `native/windows/build/fe-monster-wincrypto.dll` with JNI methods bound only to `WindowsDpapiKeyProtector`.

- [x] **Step 1: Write failing Java and source-contract probes**

The behavior probe asserts same-user round trip, random protected output, wrong entropy rejection, blob-tamper rejection, empty-input rejection, and absence of plaintext in native/Java error messages. The source probe asserts `CRYPTPROTECT_UI_FORBIDDEN`, `LocalFree`, `SecureZeroMemory`, length checks, and a dedicated DLL name.

- [x] **Step 2: Run probes and verify they fail**

Run: `node scripts/check-local-memory-dpapi.mjs`  
Expected: FAIL because the bridge and DLL are absent.

- [x] **Step 3: Implement JNI and Java loading**

Use `CryptProtectData`/`CryptUnprotectData` with CurrentUser default scope, fixed description `FE Monster Local AI Memory v1`, supplied entropy, and `CRYPTPROTECT_UI_FORBIDDEN`. Translate Windows errors to stable codes such as `DPAPI_PROTECT_FAILED`; never include data or filesystem paths. Wipe copied native and Java key buffers in `finally` blocks.

- [x] **Step 4: Build and run the DPAPI probe**

Run: `powershell -NoProfile -File scripts/build-wincrypto.ps1`  
Run: `node scripts/check-local-memory-dpapi.mjs`  
Expected: PASS on Windows x64; tamper/wrong entropy fail without changing the protected file.

- [x] **Step 5: Commit**

```bash
git add native/windows/fe_monster_wincrypto.cpp scripts/build-wincrypto.ps1 src/main/java/com/femonster/memory/KeyProtector.java src/main/java/com/femonster/memory/WindowsDpapiKeyProtector.java src/test/java/com/femonster/memory/WindowsDpapiKeyProtectorProbe.java scripts/check-local-memory-dpapi.mjs
git commit -m "feat: protect local memory keys with dpapi"
```

### Task 3: Implement cryptography, sanitization, and tokenization

**Files:**
- Create: `src/main/java/com/femonster/memory/MemoryCrypto.java`
- Create: `src/main/java/com/femonster/memory/MemoryFileSecurity.java`
- Create: `src/main/java/com/femonster/memory/MemorySanitizer.java`
- Create: `src/main/java/com/femonster/memory/MemoryTokenizer.java`
- Create: `src/main/java/com/femonster/memory/MemoryVaultKeyManager.java`
- Create: `src/test/java/com/femonster/memory/MemoryCryptoProbe.java`
- Create: `src/test/java/com/femonster/memory/MemorySanitizerProbe.java`
- Create: `scripts/check-local-memory-crypto.mjs`

**Interfaces:**
- Produces: `MemoryCrypto.Sealed seal(byte[] plaintext, byte[] aad)` and `byte[] open(Sealed sealed, byte[] aad)`.
- Produces: `byte[] blindToken(String normalizedToken)`, with independent HKDF labels.
- Produces: `Map<String,Object> MemorySanitizer.sanitize(Stream stream, String type, Map<String,Object> payload)` with distinct chat, operation, and knowledge allowlists.
- Produces: `Set<String> MemoryTokenizer.tokens(String text)` using NFKC, lowercasing, word/prefix tokens, and CJK bi/trigrams.

- [x] **Step 1: Write failing behavior probes**

Cover random nonce/ciphertext for equal plaintext, AAD and tag tamper, independent derived keys, Unicode normalization, Chinese 1/2/3-character search tokens, bounded token count, distinct chat/operation allowlists, exact timestamp/correlation validation, non-finite geometry, recursive secret keys, URLs, blob URLs, and absolute Windows/Unix paths.

- [x] **Step 2: Run probes and verify they fail**

Run: `node scripts/check-local-memory-crypto.mjs`  
Expected: FAIL because the memory crypto package is absent.

- [x] **Step 3: Implement the minimal pure-Java core**

Use `AES/GCM/NoPadding`, 12-byte nonces, 128-bit tags, `HmacSHA256`, constant-time byte comparison, `Normalizer.Form.NFKC`, and explicit per-event allowlists. Cap text at 32 KiB, JSON nesting at 12, collection size at 1,000, token length at 64 code points, and generated token count at 2,048.

- [x] **Step 4: Run probes**

Run: `powershell -NoProfile -File scripts/build-java.ps1`  
Run: `node scripts/check-local-memory-crypto.mjs`  
Expected: PASS, including a raw-output scan proving no test key or plaintext appears in errors.

- [x] **Step 5: Commit**

```bash
git add src/main/java/com/femonster/memory src/test/java/com/femonster/memory scripts/check-local-memory-crypto.mjs
git commit -m "feat: add local memory crypto boundary"
```

### Task 4: Implement the transactional encrypted SQLite store

**Files:**
- Create: `src/main/java/com/femonster/memory/LocalMemoryEvent.java`
- Create: `src/main/java/com/femonster/memory/LocalMemoryStore.java`
- Create: `src/main/java/com/femonster/memory/SqliteEncryptedMemoryStore.java`
- Create: `src/main/java/com/femonster/memory/LocalMemoryException.java`
- Create: `src/test/java/com/femonster/memory/SqliteEncryptedMemoryStoreProbe.java`
- Create: `scripts/check-local-encrypted-memory-store.mjs`

**Interfaces:**
- Consumes: `MemoryCrypto`, `MemorySanitizer`, `MemoryTokenizer`, and an unwrapped vault-key lease.
- Produces separate `appendChats`, `appendOperations`, `appendKnowledge`, `queryChats`, `queryOperations`, and `queryKnowledge` paths plus transactional bounded batch, stream-specific forget, backup, restore, and health methods.

- [ ] **Step 1: Write the failing store probe**

Create a temporary vault with a deterministic test protector. Test migration, append/restart/query, physical chat/operation separation, trace lookup returning two collections, exact `occurredAt` plus vault-owned `recordedAt`, actor/model origin, operation lifecycle and undo receipt, scope isolation, Chinese search, cursor ordering, identical duplicate, conflicting duplicate, batch rollback, deletion/search removal, backup/restore, future-schema refusal, locked DB bounded failure, close/reopen, and DB/WAL/SHM/temp byte scans for plaintext and search markers.

- [ ] **Step 2: Run the probe and verify it fails**

Run: `node scripts/check-local-encrypted-memory-store.mjs`  
Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement schema and serial transaction boundary**

Load `org.sqlite.JDBC`, use one serialized write executor, configure WAL/foreign keys/FULL sync/busy timeout, and create the exact v1 tables from the spec. Store canonical encrypted JSON, nonce, AAD version, and HMAC tokens. Recompute token sets after decrypt to detect index tamper. Roll back every failed batch and map SQLite result codes to stable redacted error codes.

- [ ] **Step 4: Implement backup, restore, and quarantine**

Checkpoint before backup; authenticate the manifest and every encrypted envelope. Restore into a sibling temporary DB, fully verify, close, and atomically swap. For verified corruption, close and atomically move the DB/WAL/SHM set into one quarantine directory; if that fails, lock the store without overwriting evidence.

- [ ] **Step 5: Run store and regression probes**

Run: `powershell -NoProfile -File scripts/build-java.ps1`  
Run: `node scripts/check-local-encrypted-memory-store.mjs`  
Expected: PASS with zero plaintext markers and deterministic failure codes.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/femonster/memory src/test/java/com/femonster/memory scripts/check-local-encrypted-memory-store.mjs
git commit -m "feat: add encrypted sqlite memory store"
```

### Task 5: Add the service and protected HTTP API

**Files:**
- Create: `src/main/java/com/femonster/memory/LocalAiMemoryService.java`
- Create: `src/main/java/com/femonster/api/LocalMemoryHttpModule.java`
- Create: `src/test/java/com/femonster/memory/LocalAiMemoryServiceProbe.java`
- Create: `scripts/check-local-memory-routes.mjs`
- Modify: `src/main/java/com/femonster/core/AppContext.java`
- Modify: `src/main/java/com/femonster/api/ApiRoutes.java`
- Modify: `src/main/java/com/femonster/api/LocalPetAssistantGuard.java`

**Interfaces:**
- Consumes: `provider` only, then resolves account data from `MusicProviderRegistry` and internal FEID scope from `CommunityClient.petPersonalizationScope`.
- Produces protected `/api/local-memory/health`, `/events`, `/chats`, `/operations`, `/trace`, `/context`, `/forget`, `/backup`, and `/restore` routes with structured no-store responses. Chat and operation routes never return one merged timeline array.

- [ ] **Step 1: Write failing service/route probes**

Assert server-derived scope, FEID A/B isolation, anonymous device scope, spoofed scope/FEID rejection, same-origin/loopback guard, method matrix, explicit stream selection, separate chat/operation result collections, causal trace lookup, 1 MiB JSON body limit, 64 MiB streamed restore limit, 100-event/100-result limits, idempotency, no-store headers, error status mapping, and post-close database renaming.

- [ ] **Step 2: Run probes and verify they fail**

Run: `node scripts/check-local-memory-routes.mjs`  
Expected: FAIL because the module and AppContext service are absent.

- [ ] **Step 3: Implement service and API adapter**

Construct the vault under `paths.dataDir.resolve("local-ai-memory")`. Keep health available even while locked. Add a strict bounded reader in the module, reject unknown fields, map conflict/locked/full/busy/integrity errors to 409/423/507/503/422, and ensure all other failures return only `LOCAL_MEMORY_INTERNAL`.

- [ ] **Step 4: Eliminate the plaintext personalization projection**

Move `PetPersonalizationSnapshot` persistence behind the encrypted local store or disable its on-disk write when the vault is available. Migrate only sanitized allowlisted records; quarantine the legacy JSON after a successful encrypted commit. Preserve offline read semantics through the encrypted repository.

- [ ] **Step 5: Run API and existing pet probes**

Run: `powershell -NoProfile -File scripts/build-java.ps1`  
Run: `node scripts/check-local-memory-routes.mjs`  
Run: `node scripts/check-pet-memory-client-contract.mjs`  
Run: `node scripts/check-deepseek-pet-assistant.mjs`  
Expected: all PASS; disk scan finds no migrated personalization plaintext.

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/femonster/memory src/main/java/com/femonster/api src/main/java/com/femonster/core/AppContext.java src/test/java/com/femonster/memory scripts/check-local-memory-routes.mjs
git commit -m "feat: expose protected local memory service"
```

### Task 6: Connect browser chat, music, playlists, and scene events

**Files:**
- Create: `web/local-memory-client.js`
- Create: `scripts/check-local-memory-browser-ingress.mjs`
- Modify: `web/pet-assistant.js`
- Modify: `web/playback-intelligence.js`
- Modify: `web/app.js`
- Modify: `web/index.html`

**Interfaces:**
- Produces: `window.FeLocalMemory.append(event)`, `appendBatch(events)`, `setTemporaryConversation(enabled)`, and `health()`.
- Consumes existing user/model message insertion, playback `notify`, playlist/favorite success, and scene preset saved/applied boundaries.

- [ ] **Step 1: Write the failing browser ingress contract**

Assert stable UUID event IDs, exact occurrence timestamps, vault receipt timestamps, source sequence, conversation/message/trace/turn/operation IDs, local-versus-server model actor, all required chat and operation lifecycle types, separate sinks, temporary-mode suppression, URL/path/credential field exclusion, batching away from render/audio loops, idempotent retry, and no replacement of existing UI/localStorage behavior.

- [ ] **Step 2: Run it and verify it fails**

Run: `node scripts/check-local-memory-browser-ingress.mjs`  
Expected: FAIL because the durable client and event calls are absent.

- [ ] **Step 3: Implement the non-blocking client**

Queue at most 100 sanitized event DTOs, flush on a short timer and visibility/page shutdown, retain stable IDs across retry, cap retry delay, and expose health without throwing into callers. Temporary mode keeps its message list in memory and bypasses localStorage plus the durable queue.

- [ ] **Step 4: Wire the audited event boundaries**

Record `chat.message` only through the chat sink at unified insertion plus local/server reply completion. Record command requested/confirmation/start/success/failure/cancel/replay/undo and playback start/complete/skip/replay only through the operation sink, retaining actor, manifest revision, receipt, result, and causal IDs. Record playlist snapshots through the knowledge sink only after logged-in successful refresh; favorite mutations and scene preset save/apply become operation events only after the real action succeeds. Never send media/asset URLs or local paths.

- [ ] **Step 5: Run browser and regression probes**

Run: `node scripts/check-local-memory-browser-ingress.mjs`  
Run: `node scripts/check-client-ai-pet-integration.mjs`  
Run: `node scripts/check-playback-intelligence.mjs`  
Run: `node scripts/check-active-preset-lifecycle.mjs`  
Expected: all PASS and no high-frequency progress event reaches durable memory.

- [ ] **Step 6: Commit**

```bash
git add web/local-memory-client.js web/pet-assistant.js web/playback-intelligence.js web/app.js web/index.html scripts/check-local-memory-browser-ingress.mjs
git commit -m "feat: capture durable local memory events"
```

### Task 7: Ship and verify the complete first batch

**Files:**
- Modify: `scripts/build-installer.ps1`
- Modify: `scripts/check-windows-installer-contract.ps1`
- Modify: `scripts/check-windows-clean-install-runtime.ps1`
- Modify: `native/windows/winforms/Program.cs` only if manifest-classpath probing demonstrates a launcher incompatibility
- Create: `scripts/check-local-memory-release.ps1`
- Modify: `README.md`

**Interfaces:**
- Consumes all previous artifacts.
- Produces an installer payload with app jar, three dependency jars, WinCrypto DLL, receipts/licenses, `java.sql`, and a live encrypted-memory restart probe.

- [ ] **Step 1: Extend installer contract tests first**

Require exact artifacts and hashes, x64 WinCrypto PE, `java.sql` in the jlink runtime, license presence, payload integrity entries, and a clean-install vault write/restart/read/plaintext-scan probe.

- [ ] **Step 2: Run installer contracts and verify they fail**

Run: `powershell -NoProfile -File scripts/check-local-memory-release.ps1`  
Expected: FAIL because staging and runtime checks are incomplete.

- [ ] **Step 3: Implement staging and runtime-module changes**

Build WinCrypto before payload staging, copy `out/lib`, DLL, receipts, and licenses, add `java.sql` to jlink, add every artifact to required/integrity lists, and keep `java -jar` launch behavior. Do not require a compiler or network on an installed machine.

- [ ] **Step 4: Run focused and broad verification**

Run: `powershell -NoProfile -File scripts/check-local-memory-release.ps1`  
Run: `powershell -NoProfile -File scripts/build-installer.ps1 -NoNodeBundle`  
Run: `node scripts/check-app-exit-lifecycle.mjs`  
Run: `node scripts/check-client-ai-gateway.mjs`  
Run: `node scripts/check-audio-mixer-service.mjs`  
Run: `node scripts/check-deep-realtime-performance.mjs`  
Expected: all PASS; the staged app writes and decrypts after restart and no test plaintext exists in persistent artifacts.

- [ ] **Step 5: Update user-facing documentation and commit**

Document local-authoritative encrypted memory, temporary conversations, explicit deletion, backup portability limits, and the fact that FEID replication/model recall arrive in later batches.

```bash
git add scripts/build-installer.ps1 scripts/check-windows-installer-contract.ps1 scripts/check-windows-clean-install-runtime.ps1 scripts/check-local-memory-release.ps1 README.md
git commit -m "build: ship encrypted local memory vault"
```

### Task 8: Bind the local user-configured pet and server pet to one client command protocol

**Files:**
- Modify: `web/app-command.js`
- Modify: `web/app.js`
- Modify: `web/pet-client-context.js`
- Modify: `web/pet-assistant.js`
- Modify: `web/index.html`
- Modify: `web/runtime-module-loader.js`
- Modify: `web/cache-fingerprints.json`
- Create: `scripts/check-pet-command-manifest-parity.mjs`
- Modify in sibling server checkout: `../FE moster server/pet-deepseek.js`
- Modify in sibling server checkout: `../FE moster server/server.js`
- Create in sibling server checkout: `../FE moster server/test-pet-command-manifest.mjs`

**Interfaces:**
- Produces one canonical `fe-monster.pet-command-manifest/v1` from the live client registry, with order-independent SHA-256 revision, command count, protocol/catalog versions, confirmation authority, receipt schema, and undo schema.
- Both the locally configured model and server model receive that same summary through `pet-client-context`; full discovery remains `query_app_capabilities`, and execution remains `control_app` through `FeMonsterPetActionBridge`.
- Every server-origin `pet.ai.tool` action is bound to the manifest revision seen at turn start. The client validates before confirmation/claim/execution; drift cancels without side effects, reports a structured reason, updates the server with the current manifest, and forces rediscovery.

- [x] **Step 1: Add a failing manifest/parity contract**

Cover registration-order independence, functional schema drift, display-only label changes, real SHA-256, capability/context equality, command receipts, local-model prompt inclusion, and pre-execution server-action guarding.

- [x] **Step 2: Implement the canonical runtime manifest**

Generate the hash only from functional command semantics, cache until registry mutation, emit `fe-monster-app-command-catalog-change`, attach the summary to capabilities and receipts, and keep the client registry authoritative for confirmation/undo policy.

- [x] **Step 3: Relay and bind the manifest through the server**

Strictly sanitize the commands context, persist the turn summary, attach it to pending/reconciled tool actions, and support a bounded `command_catalog_changed` cancellation carrying the new manifest. Server-only memory/web tools stay outside the shared client command catalog.

- [x] **Step 4: Verify both model paths and cache delivery**

Run: `node scripts/check-pet-command-manifest-parity.mjs`

Run: `node scripts/check-client-ai-server-command-parity.mjs`

Run in server checkout: `node test-pet-command-manifest.mjs`

Run: `node scripts/check-web-cache-fingerprints.mjs`
Expected: all PASS; local privacy-only read denials remain explicit and both model paths still execute ordinary client functions through the same bridge.
