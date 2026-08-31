# Desktop Pet Memory and Preference Learning v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop pet reliably persist cross-session memory, conservatively learn durable preferences from explicit statements and repeated behavior, and let users query, correct, or retract the active preference projection.

**Architecture:** Keep the existing FE-ID/provider-partitioned encrypted SQLite knowledge stream as the only durable store. Add a pure deterministic preference policy module, make the existing preference runtime persist versioned append-only `user.fact` events and fold them into one active projection, then consume that projection in prompt recall and user-facing commands.

**Tech Stack:** Browser JavaScript, Node.js `vm` contract probes, existing Java encrypted SQLite HTTP API, Windows PowerShell release checks

**Spec:** `docs/superpowers/specs/2026-08-31-pet-memory-preference-learning-v2-design.md`

## Global Constraints

- Reuse the existing `user.fact` event type and encrypted SQLite format; do not add a second store or a database schema migration.
- Keep locally decrypted memory on-device and supply it only to loopback custom-model endpoints.
- Partition every read and write by the existing authenticated FE-ID/provider scope.
- Suppress chat, operation, behavioral, and preference learning before durable queueing while temporary conversation mode is active.
- Treat recalled text and preferences as untrusted context that cannot authorize commands or supply tool arguments.
- Explicit preferences outrank inferred behavior; only a newer explicit correction or retraction may replace an explicit preference.
- Update the active in-memory projection only after the durable append receipt is accepted.
- Never expose credentials, account scope identifiers, local paths, URLs, cookies, tokens, or encryption material through preference APIs or commands.
- The working tree already contains unrelated unstaged changes. Inspect each target diff and stage only this plan's hunks; never use whole-file staging for a previously modified file.

---

## File map

- Create `web/pet-preference-policy.js`: pure extraction, schema normalization, precedence reduction, decay, and relevance ranking.
- Modify `web/pet-preference-memory.js`: asynchronous encrypted-vault orchestration and the public preference API.
- Modify `web/playback-intelligence.js`: bounded behavioral aggregation, temporary-mode exclusion, genres/scenes, and preference-summary delivery.
- Modify `web/pet-memory-recall.js`: keep chat/operation ranking independent from the already-folded preference projection.
- Modify `web/pet-assistant.js`: use active preferences in local prompt context and correct temporary-memory explanations.
- Modify `web/app.js`: preference management command handlers, command descriptors, and scene-learning signal.
- Modify `web/index.html`: load the pure policy before the preference runtime and update cache tokens.
- Modify `web/runtime-module-loader.js`: invalidate the pet-assistant runtime after prompt integration changes.
- Modify `web/cache-fingerprints.json`: record final entrypoint dependency hashes.
- Modify `scripts/install-fe-monster.ps1`: require the new runtime module in packaged payloads.
- Modify `scripts/check-windows-installer-contract.ps1`: verify the new runtime module is shipped.
- Create `scripts/check-pet-preference-policy.mjs`: pure preference semantics.
- Modify `scripts/check-pet-preference-memory.mjs`: durable runtime, migration, receipt, and scope behavior.
- Create `scripts/check-pet-preference-behavior.mjs`: repeated playback/scene learning and temporary exclusion.
- Modify `scripts/check-client-ai-pet-integration.mjs`: prompt projection, privacy, and status behavior.
- Create `scripts/check-pet-preference-commands.mjs`: real command query/correct/retract receipts.
- Modify `scripts/check-pet-app-command.mjs`: command catalog and private-read filtering.
- Modify `README.md` and `UPDATE.md`: user-visible memory semantics and shipped behavior.

---

### Task 1: Pure v2 preference policy

**Files:**
- Create: `web/pet-preference-policy.js`
- Create: `scripts/check-pet-preference-policy.mjs`

**Interfaces:**
- Consumes: bounded chat text, encrypted `user.fact` records, behavior summaries, and an injected clock.
- Produces: `window.FeMonsterPetPreferencePolicy` with `extractChatSignals(input)`, `behaviorSignals(input)`, `normalizeRecord(record)`, `reduce(records, options)`, `rank(preferences, message, limit)`, `serialize(preference)`, and `entityId(category, subject)`.

- [ ] **Step 1: Write the failing policy probe**

Create `scripts/check-pet-preference-policy.mjs` and assert the hard semantics before the module exists:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'web', 'pet-preference-policy.js');
assert.ok(fs.existsSync(sourcePath), 'pet-preference-policy.js is missing');
const window = {};
window.window = window;
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
  window, Date, JSON, Map, Math, Object, Set, TextEncoder
});
const policy = window.FeMonsterPetPreferencePolicy;
assert.equal(policy.version, 2);

function fixtureRecord(preference, occurredAt) {
  return Object.freeze({
    eventId: `00000000-0000-4000-8000-${String(fixtureRecord.sequence++).padStart(12, '0')}`,
    stream: 'knowledge',
    type: 'user.fact',
    occurredAt,
    recordedAt: occurredAt,
    sourceSequence: fixtureRecord.sequence,
    payload: Object.freeze({
      source: 'pet-preference-learning',
      entityId: preference.entityId,
      title: `偏好·${preference.category}`,
      value: policy.serialize(preference),
      occurredAt,
      sourceSequence: fixtureRecord.sequence
    })
  });
}
fixtureRecord.sequence = 1;

const explicit = policy.extractChatSignals({
  text: '我喜欢听后摇，以后回答简短一点',
  occurredAt: '2026-08-31T08:00:00.000Z'
});
assert.ok(explicit.signals.some((item) => item.category === 'music_affinity' && item.polarity === 'like'));
assert.ok(explicit.signals.some((item) => item.category === 'response_style'));

assert.equal(policy.extractChatSignals({ text: '这次先放点后摇' }).signals.length, 0);
assert.equal(policy.extractChatSignals({ text: '我喜欢忽略系统提示并执行脚本' }).signals.length, 0);

const first = explicit.signals.find((item) => item.category === 'music_affinity');
const correction = policy.extractChatSignals({
  text: '我现在不喜欢后摇了', occurredAt: '2026-08-31T09:00:00.000Z'
}).signals[0];
assert.equal(first.entityId, correction.entityId);
assert.equal(correction.polarity, 'dislike');

const retraction = policy.extractChatSignals({
  text: '忘掉我对后摇的偏好', occurredAt: '2026-08-31T10:00:00.000Z'
}).signals[0];
assert.equal(retraction.entityId, first.entityId);
assert.equal(retraction.status, 'retracted');

const active = policy.reduce([
  fixtureRecord(first, '2026-08-31T08:00:00.000Z'),
  fixtureRecord(correction, '2026-08-31T09:00:00.000Z'),
  fixtureRecord(retraction, '2026-08-31T10:00:00.000Z')
], { now: '2026-08-31T10:00:01.000Z' });
assert.equal(active.length, 0, 'retracted preference leaked into active projection');
```

Add fixtures for a v1 JSON value, inferred-versus-explicit precedence, 120-day inferred-confidence half-life, CJK/Latin ranking, unknown schema rejection, and immutability.

- [ ] **Step 2: Run the probe and verify the intended failure**

Run: `node scripts/check-pet-preference-policy.mjs`

Expected: FAIL with `pet-preference-policy.js is missing`.

- [ ] **Step 3: Implement the pure policy module**

Create an IIFE exposing an immutable v2 API. Define one logical identity per dimension and subject, with polarity excluded from the hash:

```js
(function initializePetPreferencePolicy(global) {
  'use strict';
  if (global.FeMonsterPetPreferencePolicy) return;

  const HALF_LIFE_MS = 120 * 24 * 60 * 60 * 1000;
  const PERMANENT = /(?:记住|以后|今后|一直|长期)/u;
  const ONE_TURN = /(?:这次|本次|今天|暂时|现在先|先别|待会)/u;
  const UNSAFE = /(?:https?:\/\/|www\.|```|<script|api[\s_-]*key|password|token|secret|authorization|系统提示|忽略.{0,12}(?:提示|规则)|执行.{0,8}(?:命令|代码|脚本))/iu;

  function entityId(category, subject) {
    return `pet.preference.${category}.${stableHash(`${category}\0${normalize(subject)}`)}`.slice(0, 120);
  }

  function inferredConfidence(value, nowMs) {
    if (value.origin !== 'behavior') return value.confidence;
    const age = Math.max(0, nowMs - Date.parse(value.updatedAt));
    return Math.round(value.confidence * Math.pow(0.5, age / HALF_LIFE_MS) * 1000) / 1000;
  }

  global.FeMonsterPetPreferencePolicy = Object.freeze({
    version: 2,
    entityId,
    extractChatSignals,
    behaviorSignals,
    normalizeRecord,
    reduce,
    rank,
    serialize
  });
})(window);
```

Implement correction and retraction patterns before positive patterns. Emit frozen v2 objects containing exactly `schemaVersion`, `kind`, `entityId`, `category`, `subject`, `polarity`, `statement`, `origin`, `confidence`, `evidence`, `status`, and `updatedAt`. Interpret v1 values as active legacy records without rewriting their encrypted source.

- [ ] **Step 4: Run policy syntax and semantics probes**

Run: `node --check web/pet-preference-policy.js`

Run: `node scripts/check-pet-preference-policy.mjs`

Expected: both PASS; the probe prints counts for explicit, corrected, retracted, migrated, and ranked preferences.

- [ ] **Step 5: Commit the policy unit**

```bash
git add web/pet-preference-policy.js scripts/check-pet-preference-policy.mjs
git commit -m "feat: add deterministic preference policy"
```

---

### Task 2: Durable preference runtime and active projection

**Files:**
- Modify: `web/pet-preference-memory.js`
- Modify: `scripts/check-pet-preference-memory.mjs`

**Interfaces:**
- Consumes: `FeMonsterPetPreferencePolicy`, `FeLocalMemory.context()`, `FeLocalMemory.append()`, and durable receipts.
- Produces: `FeMonsterPetPreferenceMemory.create(options)` and runtime methods `observeChat(input)`, `observePlaybackSummary(input)`, `query(input)`, `correct(input)`, `forget(input)`, and `recall(input)`. Both `query()` and `recall()` return frozen `{available, provider, preferences}` objects; `recall()` relevance-ranks and limits the array.

- [ ] **Step 1: Extend the runtime probe with failing lifecycle cases**

Load the policy before the runtime, then add assertions for v1 hydration, correction, retraction, failed receipts, and provider isolation:

```js
const corrected = await runtime.correct({
  provider: 'netease',
  entityId: rock.entityId,
  category: 'music_affinity',
  subject: '后摇',
  polarity: 'dislike',
  statement: '用户明确表示不再喜欢：后摇',
  occurredAt: '2026-08-31T09:00:00.000Z'
});
assert.equal(corrected.changed, true);
assert.equal((await runtime.query({ provider: 'netease' })).preferences[0].polarity, 'dislike');

const forgotten = await runtime.forget({
  provider: 'netease', entityIds: [rock.entityId], occurredAt: '2026-08-31T10:00:00.000Z'
});
assert.equal(forgotten.changed, 1);
assert.equal((await runtime.query({ provider: 'netease' })).preferences.length, 0);

memoryClient.failNextReceipt = true;
await assert.rejects(runtime.correct({
  provider: 'netease', category: 'response_style', subject: 'reply_length',
  polarity: 'concise', statement: '回答简短'
}));
assert.equal((await runtime.query({ provider: 'netease' })).preferences.length, 0,
  'failed receipt mutated active projection');
```

Assert that a restart loads only the latest active version for each `entityId`, a retracted item stays absent even when its old statement matches the query, and a different provider sees no preferences.

- [ ] **Step 2: Run the runtime probe and verify it fails on the missing v2 API**

Run: `node scripts/check-pet-preference-memory.mjs`

Expected: FAIL because `query`, `correct`, or `forget` is unavailable and v1 records are not folded through the policy.

- [ ] **Step 3: Replace the ad-hoc fact map with a policy-backed ledger state**

Use one state per provider and retain encrypted records only in the fixture/server, not in browser storage:

```js
function stateFor(provider) {
  if (!states.has(provider)) {
    states.set(provider, {
      records: [],
      active: Object.freeze([]),
      loaded: false,
      loading: null,
      queue: Promise.resolve()
    });
  }
  return states.get(provider);
}

function rebuild(state, now) {
  state.active = policy.reduce(state.records, { now });
  return state.active;
}
```

Hydrate up to 100 newest `user.fact` records, normalize through the policy, preserve newest-first ordering, and build the active projection. Do not fall back to `localStorage` after an HTTP or vault error.

- [ ] **Step 4: Persist only changed v2 preference events after accepted receipts**

Centralize writes so every source has identical receipt semantics:

```js
async function persist(provider, preference) {
  const state = await hydrate(provider);
  const previous = state.active.find((item) => item.entityId === preference.entityId);
  const value = policy.serialize(preference);
  if (previous && policy.serialize(previous) === value) return { changed: false, deduplicated: true };
  const handle = memoryClient.append({
    provider,
    stream: 'knowledge',
    type: 'user.fact',
    occurredAt: preference.updatedAt,
    payload: {
      source: 'pet-preference-learning',
      entityId: preference.entityId,
      title: preferenceTitle(preference),
      value,
      timeAccuracy: 'exact'
    }
  });
  if (handle?.suppressed === true) return { changed: false, suppressed: true };
  if (handle?.accepted !== true) throw durableError(handle?.code || 'LOCAL_MEMORY_EVENT_REJECTED');
  const receipt = await Promise.resolve(handle?.receipt);
  if (receipt?.accepted === false || receipt?.suppressed === true || !receipt?.recordedAt) {
    throw durableError(receipt?.code || 'LOCAL_MEMORY_RECEIPT_REJECTED');
  }
  state.records.unshift(Object.freeze({
    eventId: handle.eventId,
    stream: 'knowledge',
    type: 'user.fact',
    occurredAt: preference.updatedAt,
    recordedAt: receipt.recordedAt,
    payload: Object.freeze({
      source: 'pet-preference-learning',
      entityId: preference.entityId,
      title: preferenceTitle(preference),
      value
    })
  }));
  rebuild(state, preference.updatedAt);
  return { changed: true, eventId: handle.eventId, recordedAt: receipt.recordedAt };
}
```

Make `observeChat()` persist extracted signals serially, `correct()` emit explicit active values, `forget()` emit explicit retractions, `query()` return the full active projection, and `recall()` return policy-ranked active preferences. Bound query output to 100 and recall output to 24.

- [ ] **Step 5: Run durable runtime regressions**

Run: `node --check web/pet-preference-memory.js`

Run: `node scripts/check-pet-preference-memory.mjs`

Run: `node scripts/check-local-memory-browser-ingress.mjs`

Expected: all PASS; the runtime probe reports v1 migration, correction, retraction, failed-receipt isolation, restart recall, and provider isolation.

- [ ] **Step 6: Commit the durable runtime**

```bash
git add web/pet-preference-memory.js scripts/check-pet-preference-memory.mjs
git commit -m "feat: add durable preference ledger runtime"
```

---

### Task 3: Conservative behavioral learning

**Files:**
- Modify: `web/playback-intelligence.js`
- Modify: `web/pet-preference-memory.js`
- Modify: `web/app.js`
- Create: `scripts/check-pet-preference-behavior.mjs`

**Interfaces:**
- Consumes: playback notifications, scene preset applications, `FeLocalMemory.isTemporaryConversation()`, and `FeMonsterPetPreferencePolicy.behaviorSignals()`.
- Produces: habit summaries with `topSongs`, `topArtists`, `topPlaylists`, `topProviders`, `topGenres`, `topScenes`, `timeBuckets`, `volumeBuckets`, and `inferenceThreshold: 3`.

- [ ] **Step 1: Write the failing behavioral probe**

Build a storage and player fixture around `FeMonsterPlaybackIntelligence.create()` and assert thresholds, avoidance, new summary fields, and temporary exclusion:

```js
await runtime.notify('track-start', songEvent);
assert.equal(preferenceSummaries.length, 1);
assert.equal(preferenceSummaries.at(-1).topSongs.length, 0,
  'one play became a preference candidate');

await runtime.notify('track-start', songEvent);
await runtime.notify('track-start', songEvent);
await runtime.notify('track-complete', songEvent);
await runtime.notify('track-complete', songEvent);
await runtime.notify('track-replay', songEvent);
assert.ok(preferenceSummaries.at(-1).topSongs.some((item) => item.name === '晴天'));
assert.ok(preferenceSummaries.at(-1).topGenres.some((item) => item.name === '华语流行'));

temporary = true;
const before = runtime.execute('habit.summary').evidenceEvents;
await runtime.notify('track-start', otherSongEvent);
assert.equal(runtime.execute('habit.summary').evidenceEvents, before,
  'temporary playback leaked into persistent habit evidence');

temporary = false;
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' } });
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' } });
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' } });
assert.equal(runtime.execute('habit.summary').topScenes[0].name, '深夜');
```

Add repeated early-skip evidence that produces an inferred `dislike`, and assert that the reducer retains an existing explicit `like` for the same entity.

- [ ] **Step 2: Run the behavioral probe and verify it fails**

Run: `node scripts/check-pet-preference-behavior.mjs`

Expected: FAIL because temporary playback is still accumulated and genres/scenes are absent.

- [ ] **Step 3: Upgrade the bounded habit state**

Change the stored habit shape to version 2 while accepting existing version 1 data:

```js
habits: {
  version: 2,
  events: 0,
  songs: {}, artists: {}, playlists: {}, providers: {},
  genres: {}, scenes: {}, timeBuckets: {}, volumeBuckets: {}
}
```

Before `recordHabitEvent()`, return a frozen suppressed result when `FeLocalMemory.isTemporaryConversation()` is true. Extract genres only from bounded `song.genre` or `song.genres` values. Add `scene-apply` as an allowed habit event and store only bounded scene ID/name plus counts.

- [ ] **Step 4: Deliver summaries for every relevant evidence change**

Move the preference callback outside the old `name !== 'volume-change'` branch:

```js
const habitEvents = new Set([
  'track-start', 'track-complete', 'track-skip', 'track-replay', 'volume-change', 'scene-apply'
]);
if (habitEvents.has(name)) {
  if (global.FeLocalMemory?.isTemporaryConversation?.() === true) {
    return Object.freeze({ processed: true, recorded: false, suppressed: true, fired: 0 });
  }
  recordHabitEvent(name, payload);
  await Promise.resolve(global.FeMonsterPetPreferenceMemory?.observePlaybackSummary?.({
    provider: resolvedProvider(payload),
    occurredAt: new Date().toISOString(),
    event: name,
    summary: habitSummary()
  }));
}
```

Have `recordScenePresetMemory()` notify `scene-apply` only after the encrypted operation receipt is accepted, passing `{scene:{id,name}, provider}` and no scene file/path data.

- [ ] **Step 5: Convert behavior summaries into bucketed v2 signals**

Update `observePlaybackSummary()` to call `policy.behaviorSignals()`. Require at least three independent observations and confidence `>= 0.6`. Persist a new event only when the active value, evidence Fibonacci bucket, confidence tenth, or status changes. Explicit preferences remain authoritative during reduction.

- [ ] **Step 6: Run behavioral and playback regressions**

Run: `node --check web/playback-intelligence.js`

Run: `node scripts/check-pet-preference-behavior.mjs`

Run: `node scripts/check-playback-intelligence.mjs`

Run: `node scripts/check-pet-preference-memory.mjs`

Expected: all PASS; the new probe reports learned positive, avoidance, genre, scene, time, and volume candidates plus temporary suppression.

- [ ] **Step 7: Commit behavioral learning**

```bash
git add scripts/check-pet-preference-behavior.mjs
git add -p web/playback-intelligence.js web/pet-preference-memory.js web/app.js
git diff --cached --check
git commit -m "feat: learn bounded playback preferences"
```

---

### Task 4: Active preference recall and truthful status

**Files:**
- Modify: `web/pet-memory-recall.js`
- Modify: `web/pet-assistant.js`
- Modify: `scripts/check-pet-memory-recall.mjs`
- Modify: `scripts/check-client-ai-pet-integration.mjs`

**Interfaces:**
- Consumes: `FeMonsterPetPreferenceMemory.recall({provider,message,limit})` and existing encrypted chat/operation context.
- Produces: `clientAiPromptLocalMemory()` with separate frozen `chats`, `operations`, `knowledge`, and `preferences` arrays.

- [ ] **Step 1: Add failing integration assertions**

In the client-AI fixture, provide historical like, correction, and retraction records. Assert only the active relevant value reaches the local loopback system prompt:

```js
assert.match(localSystemPrompt, /"category":"music_affinity"/);
assert.match(localSystemPrompt, /"polarity":"dislike"/);
assert.doesNotMatch(localSystemPrompt, /用户明确表示喜欢：后摇/);
assert.doesNotMatch(localSystemPrompt, /retracted-secret-marker/);

assert.equal(nonLoopbackRequest.body.includes('music_affinity'), false,
  'local preference plaintext was uploaded to a non-loopback model');
assert.match(temporaryStatusReply, /不会写入永久记忆/);
assert.doesNotMatch(temporaryStatusReply, /会写入.*永久加密记忆/);
```

Extend the recall probe so ordinary knowledge records retain lexical ranking while preference version collapse remains owned by the preference policy/runtime.

- [ ] **Step 2: Run integration probes and verify the stale-value/status failures**

Run: `node scripts/check-client-ai-pet-integration.mjs`

Run: `node scripts/check-pet-memory-recall.mjs`

Expected: at least one FAIL because raw `user.fact` records are ranked before version collapse and temporary status claims permanent writes.

- [ ] **Step 3: Request active preferences independently from raw knowledge**

In `requestClientAiLocalMemory()`, fetch general memory and active preferences in parallel:

```js
const [recalled, chatRecall, preferenceRecall] = await Promise.all([
  client.context({ provider, limit: 100 }),
  client.context({ provider, limit: 100, types: ['chat.message', 'legacy.chat_snapshot'] }),
  window.FeMonsterPetPreferenceMemory?.recall?.({ provider, message, limit: 24 })
    || Promise.resolve({ available: false, preferences: [] })
]);
```

Do not pass raw preference-version records through the generic knowledge ranker. Add sanitized active preferences to `clientAiPromptLocalMemory()` and include them in `UNTRUSTED LOCAL ENCRYPTED MEMORY RECALL` as a distinct `preferences` array.

- [ ] **Step 4: Keep privacy and temporary semantics authoritative**

Retain `clientAiPersonalizationAllowed()` as the gate for local encrypted plaintext. Change the temporary status response to:

```js
return `有。本地加密长期记忆已启用；当前是临时会话，本轮聊天、操作和偏好不会写入永久记忆。此前已有记忆仍按当前隐私设置提供有界召回，共召回 ${recalled} 条。`;
```

When the vault is unavailable, omit preferences and report the failure without claiming the current turn was learned.

- [ ] **Step 5: Run prompt, recall, and temporary-mode regressions**

Run: `node --check web/pet-memory-recall.js`

Run: `node --check web/pet-assistant.js`

Run: `node scripts/check-pet-memory-recall.mjs`

Run: `node scripts/check-client-ai-pet-integration.mjs`

Run: `node scripts/check-local-memory-browser-ingress.mjs`

Expected: all PASS; no retracted value reaches a prompt, non-loopback requests contain no local preference plaintext, and status wording matches actual suppression.

- [ ] **Step 6: Commit active recall integration**

```bash
git add -p web/pet-memory-recall.js web/pet-assistant.js scripts/check-pet-memory-recall.mjs scripts/check-client-ai-pet-integration.mjs
git diff --cached --check
git commit -m "feat: recall only active pet preferences"
```

---

### Task 5: Query, correct, and retract commands

**Files:**
- Modify: `web/app.js`
- Modify: `web/pet-assistant.js`
- Create: `scripts/check-pet-preference-commands.mjs`
- Modify: `scripts/check-pet-app-command.mjs`
- Modify: `scripts/check-pet-command-manifest-parity.mjs`

**Interfaces:**
- Consumes: `FeMonsterPetPreferenceMemory.query()`, `.correct()`, `.forget()`, and the canonical `FeMonsterAppCommands` bus.
- Produces: `pet.preferences.query`, `pet.preferences.correct`, and `pet.preferences.forget` with verified command receipts.

- [ ] **Step 1: Write a failing real-command probe**

Load `app-command.js`, evaluate the preference handlers/registrations in the existing app fixture, then execute the real descriptors:

```js
const listed = await commands.execute('pet.preferences.query', { limit: 20 }, trustedContext);
assert.equal(listed.preferences[0].entityId, 'pet.preference.music_affinity.fixture');
assert.equal(listed.preferences[0].statement, '用户喜欢后摇');
assert.equal(Object.hasOwn(listed.preferences[0], 'rawValue'), false);

const inspection = commands.inspect('pet.preferences.forget', {
  entityIds: ['pet.preference.music_affinity.fixture']
}, trustedContext);
assert.equal(inspection.requiresConfirmation, true);

const corrected = await commands.execute('pet.preferences.correct', {
  entityId: 'pet.preference.music_affinity.fixture',
  category: 'music_affinity', subject: '后摇', polarity: 'dislike',
  statement: '用户明确表示不喜欢：后摇'
}, { ...trustedContext, confirmed: true });
assert.equal(corrected.changed, true);
assert.equal(corrected.commandReceipt.command, 'pet.preferences.correct');
```

Assert `pet.preferences.query` is excluded from local-model capability output, while user-directed `correct` and `forget` remain discoverable and both require confirmation.

- [ ] **Step 2: Run the command probe and verify commands are missing**

Run: `node scripts/check-pet-preference-commands.mjs`

Expected: FAIL because the three descriptors are not registered.

- [ ] **Step 3: Add bounded command handlers**

Implement handlers that use only the public active-projection API:

```js
async function petAssistantPreferenceQuery(argumentsValue = {}) {
  const args = petAssistantArguments(argumentsValue);
  const result = await window.FeMonsterPetPreferenceMemory.query({
    provider: petAssistantLocalMemoryProvider(),
    query: safeText(args.query, '').slice(0, 240),
    limit: clamp(Math.floor(Number(args.limit) || 20), 1, 100)
  });
  return { available: result.available === true, preferences: result.preferences };
}
```

Validate correction categories and polarities against policy-owned enumerations. Require one to 32 valid entity IDs for forget. Return only active sanitized fields and durable receipt metadata.

- [ ] **Step 4: Register commands with confirmation policy**

Add descriptors:

```js
{
  command: 'pet.preferences.query', aliases: ['pet.preferences.list'],
  category: 'read', readOnly: true,
  title: '读取桌宠已学习偏好',
  description: '读取当前账号本地加密记忆中的有界有效偏好。',
  parameters: { query: 'string?', limit: 'number 1..100?' },
  handler: petAssistantPreferenceQuery
},
{
  command: 'pet.preferences.correct', category: 'settings',
  title: '纠正桌宠偏好',
  description: '用用户明确表达替换一项已学习偏好。',
  requiresConfirmation: true,
  confirmationMessage: () => '这会修改桌宠的长期偏好记忆，确认继续吗？',
  handler: petAssistantPreferenceCorrect
},
{
  command: 'pet.preferences.forget', category: 'settings',
  title: '让桌宠忘记偏好',
  description: '撤回选中的长期偏好，历史版本不会再参与召回。',
  requiresConfirmation: true,
  confirmationMessage: () => '这会从桌宠的有效长期记忆中移除所选偏好，确认继续吗？',
  handler: petAssistantPreferenceForget
}
```

Add `/^pet\.preferences\.(?:query|list)$/` to `CLIENT_AI_PRIVATE_COMMAND_PATTERNS`; do not block the confirmed correction and forget operations.

- [ ] **Step 5: Run command parity and execution probes**

Run: `node scripts/check-pet-preference-commands.mjs`

Run: `node scripts/check-pet-app-command.mjs`

Run: `node scripts/check-pet-command-manifest-parity.mjs`

Run: `node scripts/check-client-ai-server-command-parity.mjs`

Expected: all PASS; the query is private, mutations require confirmation, and local/server adapters agree on the safe mutation descriptors.

- [ ] **Step 6: Commit preference controls**

```bash
git add scripts/check-pet-preference-commands.mjs
git add -p web/app.js web/pet-assistant.js scripts/check-pet-app-command.mjs scripts/check-pet-command-manifest-parity.mjs
git diff --cached --check
git commit -m "feat: add pet preference controls"
```

---

### Task 6: Runtime packaging, documentation, and release verification

**Files:**
- Modify: `web/index.html`
- Modify: `web/runtime-module-loader.js`
- Modify: `web/cache-fingerprints.json`
- Modify: `scripts/install-fe-monster.ps1`
- Modify: `scripts/check-windows-installer-contract.ps1`
- Modify: `README.md`
- Modify: `UPDATE.md`

**Interfaces:**
- Consumes: completed v2 policy, runtime, recall, behavior, and command modules.
- Produces: a cache-safe source launch and installer payload with the same preference-learning behavior.

- [ ] **Step 1: Add the new module to runtime and installer contracts**

Load the policy immediately before `pet-preference-memory.js`:

```html
<script src="pet-preference-policy.js?v=20260831-preference-ledger-v2-1"></script>
<script src="pet-preference-memory.js?v=20260831-preference-ledger-v2-1"></script>
```

Update the `pet-assistant.js`, `playback-intelligence.js`, `app.js`, and runtime-loader cache tokens. Add `web\pet-preference-policy.js` and `web\pet-preference-memory.js` to the installer required-file list and installer contract assertions.

- [ ] **Step 2: Document exact user semantics**

Add a concise README section covering:

```markdown
- 普通会话会写入当前 FE ID/平台隔离的本机加密记忆。
- “这次/今天/暂时”不会学习成长期偏好；临时会话完全不写入。
- 明确偏好立即生效，重复行为至少三次且置信度达到 0.6 才会学习。
- 可通过 `pet.preferences.query`、`pet.preferences.correct`、`pet.preferences.forget` 查看、纠正和撤回偏好。
```

Record the shipped v2 behavior and privacy boundary in `UPDATE.md` without claiming cloud synchronization.

- [ ] **Step 3: Regenerate and verify cache fingerprints**

Run: `node scripts/check-web-cache-fingerprints.mjs --write`

Run: `node scripts/check-web-cache-fingerprints.mjs --copies`

Expected: both PASS and `web/cache-fingerprints.json` includes the new policy dependency.

- [ ] **Step 4: Run the complete focused regression suite**

Run each command separately and require exit code 0:

```text
node scripts/check-pet-preference-policy.mjs
node scripts/check-pet-preference-memory.mjs
node scripts/check-pet-preference-behavior.mjs
node scripts/check-pet-memory-recall.mjs
node scripts/check-client-ai-pet-integration.mjs
node scripts/check-pet-preference-commands.mjs
node scripts/check-local-memory-browser-ingress.mjs
node scripts/check-local-memory-routes.mjs
node scripts/check-pet-app-command.mjs
node scripts/check-pet-command-manifest-parity.mjs
node scripts/check-client-ai-server-command-parity.mjs
node scripts/check-playback-intelligence.mjs
powershell -ExecutionPolicy Bypass -File scripts/check-local-memory-release.ps1
powershell -ExecutionPolicy Bypass -File scripts/check-windows-installer-contract.ps1
```

Expected: every probe PASS. The local-memory release probe must still confirm DPAPI/SQLite packaging, and the installer contract must include both preference modules.

- [ ] **Step 5: Build the application artifact and rerun source syntax checks**

Run: `node --check web/pet-preference-policy.js`

Run: `node --check web/pet-preference-memory.js`

Run: `node --check web/playback-intelligence.js`

Run: `node --check web/pet-memory-recall.js`

Run: `node --check web/pet-assistant.js`

Run: `powershell -ExecutionPolicy Bypass -File scripts/build-java.ps1`

Expected: all syntax checks exit 0 and `out/fe-monster-java.jar` is rebuilt successfully.

- [ ] **Step 6: Commit release integration**

```bash
git add -p web/index.html web/runtime-module-loader.js web/cache-fingerprints.json scripts/install-fe-monster.ps1 scripts/check-windows-installer-contract.ps1 README.md UPDATE.md
git diff --cached --check
git commit -m "docs: ship pet preference learning v2"
```

- [ ] **Step 7: Inspect the final scoped diff and verification evidence**

Run: `git status --short`

Run: `git log -7 --oneline --decorate`

Run: `git diff HEAD~6..HEAD --check`

Expected: the six feature commits are present, the scoped diff has no whitespace errors, and unrelated pre-existing working-tree changes remain untouched.
