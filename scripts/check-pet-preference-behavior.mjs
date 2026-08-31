import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const playbackSource = readFileSync(path.join(root, 'web', 'playback-intelligence.js'), 'utf8');
const policySource = readFileSync(path.join(root, 'web', 'pet-preference-policy.js'), 'utf8');
const preferenceMemorySource = readFileSync(path.join(root, 'web', 'pet-preference-memory.js'), 'utf8');
const appSource = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const storageValues = new Map();
const preferenceSummaries = [];
const durablePlaybackEvents = [];
let temporary = false;
let durablePlaybackId = 0;

const window = {
  FeMonsterPetPreferenceMemory: {
    async observePlaybackSummary(value) {
      preferenceSummaries.push(JSON.parse(JSON.stringify(value)));
      return { written: 0 };
    }
  },
  FeLocalMemory: {
    isTemporaryConversation() { return temporary; },
    createId() {
      durablePlaybackId += 1;
      return `00000000-0000-4000-8000-${String(durablePlaybackId).padStart(12, '0')}`;
    },
    append(event) {
      durablePlaybackEvents.push(JSON.parse(JSON.stringify(event)));
      return {
        accepted: true,
        eventId: this.createId(),
        receipt: Promise.resolve({ accepted: true, recordedAt: '2026-09-01T08:00:00.000Z' })
      };
    }
  }
};
window.window = window;
vm.runInNewContext(playbackSource, {
  Date, JSON, Map, Math, Object, Promise, Set, TextEncoder, window
}, { filename: 'playback-intelligence.js' });

const runtime = window.FeMonsterPlaybackIntelligence.create({
  player: {
    snapshot() {
      return {
        song: { id: 'song-sunny', name: '晴天', artist: '周杰伦', provider: 'netease' },
        playing: true,
        positionSeconds: 18,
        durationSeconds: 240
      };
    }
  },
  storage: {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { storageValues.set(key, String(value)); }
  },
  identity: () => 'netease:behavior-fixture'
});

const legacyIdentity = 'netease:behavior-v1';
storageValues.set(`fe-monster-playback-intelligence:${encodeURIComponent(legacyIdentity)}`, JSON.stringify({
  version: 1,
  rules: [],
  habits: {
    version: 1,
    events: 3,
    songs: {
      'song:legacy': { name: '旧版歌曲', artist: '旧版歌手', starts: 3, completes: 2, skips: 0, replays: 1 }
    },
    artists: {}, playlists: {}, providers: {}, timeBuckets: {}, volumeBuckets: {}
  }
}));
const legacyRuntime = window.FeMonsterPlaybackIntelligence.create({
  player: { snapshot: () => ({}) },
  storage: {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { storageValues.set(key, String(value)); }
  },
  identity: () => legacyIdentity
});
assert.equal((await legacyRuntime.execute('habit.summary')).topSongs[0].name, '旧版歌曲',
  'v1 habit state was not accepted by the v2 reader');

const songEvent = {
  song: {
    id: 'song-sunny', name: '晴天', artist: '周杰伦', provider: 'netease',
    genres: ['华语流行']
  },
  playlist: { id: 'daily-mix', name: '每日推荐' }
};

await runtime.notify('track-start', songEvent);
assert.equal(preferenceSummaries.length, 1);
assert.equal(preferenceSummaries.at(-1).summary.topSongs.length, 0,
  'one play became a preference candidate');

const appSongPayloadStart = appSource.indexOf('function playbackIntelligenceSongPayload');
const appSongPayloadEnd = appSource.indexOf('\nfunction ', appSongPayloadStart + 1);
const appSongPayloadContext = {
  state: {
    activeProvider: 'netease',
    currentSong: {
      id: 'production-genre-song', title: '真实载荷歌曲', artist: '真实歌手', provider: 'netease',
      genre: '电子',
      genres: ['华语流行', '电子', 42, '华语流行', '', '氛围', '器乐', '摇滚', '民谣', '爵士']
    }
  },
  safeText(value, fallback = '') { return value === undefined || value === null || value === '' ? fallback : String(value); }
};
vm.runInNewContext(appSource.slice(appSongPayloadStart, appSongPayloadEnd), appSongPayloadContext, {
  filename: 'app-playback-payload.js'
});
const productionSongPayload = appSongPayloadContext.playbackIntelligenceSongPayload();
assert.deepEqual(JSON.parse(JSON.stringify(productionSongPayload.genres)),
  ['华语流行', '电子', '氛围', '器乐', '摇滚', '民谣'],
  'the production playback payload must forward only six de-duplicated string genres');
const productionPayloadRuntime = window.FeMonsterPlaybackIntelligence.create({
  player: { snapshot: () => ({}) },
  storage: {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { storageValues.set(key, String(value)); }
  },
  identity: () => 'netease:app-payload-fixture'
});
for (let index = 0; index < 3; index += 1) {
  await productionPayloadRuntime.notify('track-start', { song: productionSongPayload });
}
assert.ok((await productionPayloadRuntime.execute('habit.summary')).topGenres
  .some((item) => item.name === '华语流行' && item.starts === 3),
  'a production app payload did not reach playback-runtime genre habits');

await runtime.notify('track-start', songEvent);
await runtime.notify('track-start', songEvent);
await runtime.notify('track-complete', songEvent);
await runtime.notify('track-complete', songEvent);
await runtime.notify('track-replay', songEvent);
let summary = await runtime.execute('habit.summary');
assert.ok(summary.topSongs.some((item) => item.name === '晴天'));
assert.ok(summary.topGenres.some((item) => item.name === '华语流行'));
assert.ok(Object.values(summary.timeBuckets).reduce((total, count) => total + count, 0) >= 3);

await runtime.notify('volume-change', { volume: 16 });
await runtime.notify('volume-change', { volume: 16 });
await runtime.notify('volume-change', { volume: 16 });
summary = await runtime.execute('habit.summary');
assert.equal(summary.volumeBuckets.quiet, 3);

const firstTraceSong = { id: 'trace-song-0', name: '起始追踪歌曲', artist: '追踪歌手', provider: 'netease' };
await runtime.notify('track-start', { song: firstTraceSong });
const firstTraceId = durablePlaybackEvents.at(-1).payload.traceId;
for (let index = 1; index <= 72; index += 1) {
  await runtime.notify('track-start', {
    song: { id: `trace-song-${index}`, name: `追踪歌曲 ${index}`, artist: '追踪歌手', provider: 'netease' }
  });
}
await runtime.notify('track-complete', { song: firstTraceSong });
assert.notEqual(durablePlaybackEvents.at(-1).payload.traceId, firstTraceId,
  'expired/LRU durable playback traces must not grow without bound or revive an evicted trace');

temporary = true;
const before = (await runtime.execute('habit.summary')).evidenceEvents;
const suppressed = await runtime.notify('track-start', {
  song: { id: 'temporary-song', name: '临时歌曲', artist: '临时歌手', provider: 'netease', genre: '临时流派' }
});
assert.equal(suppressed.suppressed, true);
assert.equal((await runtime.execute('habit.summary')).evidenceEvents, before,
  'temporary playback leaked into persistent habit evidence');

temporary = false;
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' }, provider: 'netease' });
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' }, provider: 'netease' });
await runtime.notify('scene-apply', { scene: { id: 'night', name: '深夜' }, provider: 'netease' });
summary = await runtime.execute('habit.summary');
assert.equal(summary.topScenes[0].name, '深夜');

const skippedSongEvent = {
  song: { id: 'song-skip', name: '跳过歌曲', artist: '跳过歌手', provider: 'netease', genre: '实验音乐' }
};
for (let index = 0; index < 3; index += 1) await runtime.notify('track-start', skippedSongEvent);
for (let index = 0; index < 3; index += 1) await runtime.notify('track-skip', skippedSongEvent);
summary = await runtime.execute('habit.summary');
assert.ok(summary.topSongs.some((item) => item.name === '跳过歌曲' && item.skips === 3));

const policyWindow = {};
policyWindow.window = policyWindow;
vm.runInNewContext(policySource, {
  Date, JSON, Map, Math, Object, Set, TextEncoder, window: policyWindow
}, { filename: 'pet-preference-policy.js' });
const policy = policyWindow.FeMonsterPetPreferencePolicy;
const inferred = policy.behaviorSignals({
  occurredAt: '2026-09-01T08:00:00.000Z', summary
}).signals;
assert.ok(inferred.some((item) => item.subject === '跳过歌曲' && item.polarity === 'dislike'),
  'repeated early skips did not infer avoidance');
const explicit = policy.extractChatSignals({
  text: '我喜欢听跳过歌曲', occurredAt: '2026-09-01T08:01:00.000Z'
}).signals.find((item) => item.subject === '跳过歌曲');
function record(value, occurredAt, sequence) {
  return {
    type: 'user.fact', occurredAt, recordedAt: occurredAt, sourceSequence: sequence,
    payload: {
      source: 'pet-preference-learning', entityId: value.entityId,
      value: policy.serialize(value)
    }
  };
}
const reduced = policy.reduce([
  record(inferred.find((item) => item.subject === '跳过歌曲'), '2026-09-01T08:00:00.000Z', 1),
  record(explicit, '2026-09-01T08:01:00.000Z', 2)
], { now: '2026-09-01T08:02:00.000Z' });
assert.equal(reduced.find((item) => item.subject === '跳过歌曲').polarity, 'like',
  'an inferred dislike replaced an explicit like');

const recordsByProvider = new Map();
let appendCount = 0;
const memoryClient = {
  async context({ provider }) {
    return { available: true, knowledge: recordsByProvider.get(provider) || [] };
  },
  append(input) {
    appendCount += 1;
    const recordedAt = input.occurredAt;
    const recordValue = {
      eventId: `event-${appendCount}`,
      type: input.type,
      stream: input.stream,
      occurredAt: input.occurredAt,
      recordedAt,
      sourceSequence: appendCount,
      payload: { ...input.payload }
    };
    const providerRecords = recordsByProvider.get(input.provider) || [];
    providerRecords.unshift(recordValue);
    recordsByProvider.set(input.provider, providerRecords);
    return {
      accepted: true,
      eventId: recordValue.eventId,
      receipt: Promise.resolve({ accepted: true, recordedAt, sourceSequence: appendCount })
    };
  }
};
const memoryWindow = { FeMonsterPetPreferencePolicy: policy };
memoryWindow.window = memoryWindow;
vm.runInNewContext(preferenceMemorySource, {
  Date, JSON, Map, Math, Object, Promise, Set, TextEncoder, window: memoryWindow
}, { filename: 'pet-preference-memory.js' });
const preferenceMemory = memoryWindow.FeMonsterPetPreferenceMemory.create({ memoryClient });
const positiveSummary = {
  topSongs: [{ name: '晴天', artist: '周杰伦', starts: 3, completes: 2, replays: 1, skips: 0, evidence: 6, confidence: 0.8 }]
};
assert.equal((await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:10:00.000Z', summary: positiveSummary
})).written, 1);
assert.equal((await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:11:00.000Z', summary: positiveSummary
})).deduplicated, 1,
  'unchanged behavioral evidence produced another encrypted fact');
const advancedSummary = {
  topSongs: [{ name: '晴天', artist: '周杰伦', starts: 4, completes: 3, replays: 1, skips: 0, evidence: 8, confidence: 0.9 }]
};
assert.equal((await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:11:30.000Z', summary: { ...advancedSummary, topSongs: [{ ...advancedSummary.topSongs[0], confidence: 0.8 }] }
})).written, 1,
  'a Fibonacci evidence-bucket change did not persist updated behavioral evidence');
assert.equal((await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:11:45.000Z', summary: advancedSummary
})).written, 1,
  'a confidence-tenth change did not persist updated behavioral evidence');
const contextual = await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:12:00.000Z',
  summary: {
    ...advancedSummary,
    topGenres: [{ name: '华语流行', evidence: 6, confidence: 0.8 }],
    topScenes: [{ name: '深夜', evidence: 3, confidence: 0.65 }],
    timeBuckets: { 'late-night': 3 },
    volumeBuckets: { quiet: 3 }
  }
});
assert.equal(contextual.written, 4,
  'bounded genre, scene, time, and volume candidates were not promoted after three observations');
const contextualPreferences = await preferenceMemory.query({ provider: 'netease' });
assert.ok(contextualPreferences.preferences.some((item) => item.category === 'scene_affinity' && item.subject === '深夜'));
assert.ok(contextualPreferences.preferences.some((item) => item.category === 'listening_routine' && item.subject === '深夜'));
assert.ok(contextualPreferences.preferences.some((item) => item.category === 'listening_volume' && item.subject === '安静'));
const saturatedContext = await preferenceMemory.observePlaybackSummary({
  provider: 'saturation', occurredAt: '2026-09-01T08:12:30.000Z',
  summary: {
    topSongs: ['基础一', '基础二', '基础三', '基础四'].map((name) => ({
      name, starts: 3, completes: 3, skips: 0, replays: 0, evidence: 6, confidence: 0.9
    })),
    topGenres: ['流派一', '流派二', '流派三', '流派四'].map((name) => ({ name, evidence: 6, confidence: 0.8 })),
    topScenes: [{ name: '饱和场景', evidence: 3, confidence: 0.65 }],
    timeBuckets: { morning: 3 },
    volumeBuckets: { balanced: 3 }
  }
});
assert.equal(saturatedContext.written, 8, 'saturated behavior evidence should still remain bounded at eight facts');
const saturatedPreferences = await preferenceMemory.query({ provider: 'saturation' });
assert.ok(saturatedPreferences.preferences.some((item) => item.subject === '流派一'),
  'genre evidence was starved when base behavior filled half of the signal budget');
assert.ok(saturatedPreferences.preferences.some((item) => item.category === 'scene_affinity' && item.subject === '饱和场景'),
  'scene evidence was starved by base and genre behavior');
assert.ok(saturatedPreferences.preferences.some((item) => item.category === 'listening_routine' && item.subject === '早晨'),
  'time evidence was starved by base and genre behavior');
assert.ok(saturatedPreferences.preferences.some((item) => item.category === 'listening_volume' && item.subject === '适中'),
  'volume evidence was starved by base and genre behavior');
let maximumCompactedRecordCount = 0;
let cachedBehaviorCrossedExplicitAuthority = false;
const protectedCapacityEntityId = policy.entityId('music_affinity', '容量保护偏好');
const compactingPolicy = {
  ...policy,
  reduce(records, options) {
    maximumCompactedRecordCount = Math.max(maximumCompactedRecordCount, records.length);
    const normalized = records.map((item) => policy.normalizeRecord(item)).filter(Boolean);
    if (normalized.some((item) => item.entityId === protectedCapacityEntityId
      && item.origin === 'explicit-chat') && normalized.some((item) => (
      item.entityId === protectedCapacityEntityId && item.origin === 'behavior'
    ))) {
      cachedBehaviorCrossedExplicitAuthority = true;
    }
    return policy.reduce(records, options);
  }
};
const compactedPreferenceMemory = memoryWindow.FeMonsterPetPreferenceMemory.create({ memoryClient, policy: compactingPolicy });
await compactedPreferenceMemory.correct({
  provider: 'capacity', category: 'music_affinity', subject: '容量保护偏好', polarity: 'like',
  statement: '用户明确表示喜欢容量保护偏好', occurredAt: '2026-09-01T08:12:40.000Z'
});
await compactedPreferenceMemory.forget({
  provider: 'capacity', entityIds: [protectedCapacityEntityId],
  occurredAt: '2026-09-01T08:12:41.000Z'
});
for (let index = 0; index < 120; index += 1) {
  await compactedPreferenceMemory.observePlaybackSummary({
    provider: 'capacity', occurredAt: `2026-09-01T08:${String(13 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
    summary: {
      topSongs: [{ name: `容量歌曲 ${index}`, starts: 3, completes: 3, skips: 0, replays: 0, evidence: 6, confidence: 0.9 }]
    }
  });
}
assert.ok(maximumCompactedRecordCount <= 96,
  'the per-provider preference cache exceeded its bounded compacted record capacity');
assert.equal((await compactedPreferenceMemory.observePlaybackSummary({
  provider: 'capacity', occurredAt: '2026-09-01T08:16:00.000Z', summary: {
    topSongs: [{ name: '容量保护偏好', starts: 8, completes: 7, skips: 0, replays: 1, evidence: 16, confidence: 0.9 }]
  }
})).written, 0, 'behavioral evidence must not be persisted over an explicit tombstone');
assert.equal(cachedBehaviorCrossedExplicitAuthority, false,
  'a behavior fact remained in the bounded cache beside an explicit tombstone');
assert.ok(!(await compactedPreferenceMemory.query({ provider: 'capacity' })).preferences
  .some((item) => item.subject === '容量保护偏好'),
  'compaction discarded an explicit retraction while noisy behavior accumulated');
await preferenceMemory.observeChat({
  provider: 'netease', role: 'user', text: '我喜欢听晴天', occurredAt: '2026-09-01T08:13:00.000Z'
});
assert.equal((await preferenceMemory.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-09-01T08:14:00.000Z', summary: advancedSummary
})).written, 0,
  'behavioral evidence replaced an explicit preference');
assert.equal((await preferenceMemory.query({ provider: 'netease' })).preferences.find((item) => item.subject === '晴天').origin,
  'explicit-chat');

const sceneMemoryStart = appSource.indexOf('function recordScenePresetMemory');
const sceneMemoryEnd = appSource.indexOf('\nfunction ', sceneMemoryStart + 1);
const sceneMemorySource = appSource.slice(sceneMemoryStart, sceneMemoryEnd);
assert.match(sceneMemorySource, /Promise\.resolve\(handle\.receipt\)/,
  'scene learning must wait for the encrypted operation receipt');
assert.match(sceneMemorySource, /receipt\?\.accepted === false[\s\S]*receipt\?\.suppressed === true[\s\S]*!receipt\?\.recordedAt/,
  'rejected or incomplete encrypted scene receipts must not notify learning');
assert.match(sceneMemorySource, /notifyPlaybackIntelligence\('scene-apply',[\s\S]*scene,[\s\S]*provider/,
  'accepted scene receipts must forward the operation-start scene and provider snapshot');

let resolveSceneReceipt;
const deferredSceneReceipt = new Promise((resolve) => { resolveSceneReceipt = resolve; });
const recordedSceneOperations = [];
const sceneNotifications = [];
const sceneMemoryContext = {
  Promise,
  Number,
  Array,
  Object,
  state: { activeProvider: 'netease' },
  safeText(value, fallback = '') { return value === undefined || value === null || value === '' ? fallback : String(value); },
  recordAppLocalMemoryOperation(type, details) {
    recordedSceneOperations.push({ type, details: JSON.parse(JSON.stringify(details)) });
    return { accepted: true, receipt: deferredSceneReceipt };
  },
  notifyPlaybackIntelligence(event, payload) {
    sceneNotifications.push({ event, payload: JSON.parse(JSON.stringify(payload)) });
  }
};
vm.runInNewContext(sceneMemorySource, sceneMemoryContext, { filename: 'app-scene-memory.js' });
const mutableScene = { id: 'night-stable', name: '深夜稳定场景', sceneItems: [] };
sceneMemoryContext.recordScenePresetMemory('scene.preset_applied', mutableScene, { actor: 'user' });
assert.equal(recordedSceneOperations[0].details.provider, 'netease');
assert.equal(recordedSceneOperations[0].details.presetId, 'night-stable');
mutableScene.id = 'provider-race-scene';
mutableScene.name = '错误场景';
sceneMemoryContext.state.activeProvider = 'qq';
resolveSceneReceipt({ accepted: true, recordedAt: '2026-09-01T09:00:00.000Z' });
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(sceneNotifications, [{
  event: 'scene-apply',
  payload: { scene: { id: 'night-stable', name: '深夜稳定场景' }, provider: 'netease' }
}], 'accepted scene evidence was partitioned by a provider or scene changed after operation start');

function appFunctionSource(name) {
  const asyncStart = appSource.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : appSource.indexOf(`function ${name}`);
  const nextFunction = appSource.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = appSource.indexOf('\nasync function ', start + 1);
  const end = [nextFunction, nextAsyncFunction].filter((index) => index > start)
    .reduce((nearest, index) => Math.min(nearest, index), appSource.length);
  assert.ok(start >= 0 && end > start, `missing app function ${name}`);
  return appSource.slice(start, end);
}

const builtinEntryCalls = [];
const builtinEntryContext = {
  state: { sandbox: {} },
  setDiyOpen() {}, commitDiyPage() {}, setDiyPreset() {}, enterPlaybackPage() {},
  normalizeDiyPreset(value) { return value; }, unlockAppAchievement() {},
  recordScenePresetMemory(type, preset, options) { builtinEntryCalls.push({ type, preset, options }); }
};
vm.runInNewContext(appFunctionSource('enterPresetPlaybackPage'), builtinEntryContext, { filename: 'app-builtin-entry.js' });
builtinEntryContext.enterPresetPlaybackPage('cube', { recordMemory: true, actor: 'user', provider: 'qq' });
assert.deepEqual(JSON.parse(JSON.stringify(builtinEntryCalls[0])), {
  type: 'scene.preset_applied',
  preset: { id: 'cube', name: 'cube', presetType: 'playback', playbackPreset: 'cube', sceneItems: [] },
  options: { recordMemory: true, actor: 'user', provider: 'qq' }
}, 'a real built-in preset application did not carry its memory attribution');
builtinEntryContext.enterPresetPlaybackPage('cube');
assert.equal(builtinEntryCalls.length, 1, 'startup/recovery preset application unexpectedly recorded a memory event');

const builtinClickCalls = [];
let builtinClickHandler = null;
const builtinClickContext = {
  state: { activeProvider: 'qq' },
  els: {
    diyCubePreset: {
      addEventListener(event, handler) {
        assert.equal(event, 'click');
        builtinClickHandler = handler;
      }
    }
  },
  enterPresetPlaybackPage(id, options) { builtinClickCalls.push({ id, options }); }
};
const builtinClickRegistration = appSource.match(
  /if \(els\.diyCubePreset\) els\.diyCubePreset\.addEventListener\('click', \(\) => enterPresetPlaybackPage\('cube', \{ recordMemory: true, actor: 'user', provider: state\.activeProvider \}\)\);/u
);
assert.ok(builtinClickRegistration, 'missing the production built-in cube click registration');
vm.runInNewContext(builtinClickRegistration[0], builtinClickContext, { filename: 'app-builtin-click.js' });
builtinClickHandler();
assert.deepEqual(JSON.parse(JSON.stringify(builtinClickCalls)), [{
  id: 'cube', options: { recordMemory: true, actor: 'user', provider: 'qq' }
}], 'the production built-in click handler lost its memory attribution');

function appArrowHandlerSource(marker) {
  const markerStart = appSource.indexOf(marker);
  const start = markerStart + marker.length;
  assert.ok(markerStart >= 0 && appSource[start] === '{', `missing production click handler ${marker}`);
  let depth = 0;
  for (let index = start; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}' && --depth === 0) return appSource.slice(start, index + 1);
  }
  assert.fail(`unterminated production click handler ${marker}`);
}

const diyClickCalls = [];
const diyClickContext = {
  state: { activeProvider: 'netease' },
  els: { diySidebar: { contains() { return true; } } },
  enterDiyScenePresetPlayback(id, options) { diyClickCalls.push({ id, options }); }
};
const diyHandlerSource = appArrowHandlerSource("els.diySidebar.addEventListener('click', (event) => ");
vm.runInNewContext(`this.__diyClickHandler = (event) => ${diyHandlerSource};`, diyClickContext, {
  filename: 'app-diy-click.js'
});
diyClickContext.__diyClickHandler({
  target: {
    closest(selector) {
      return selector === '[data-diy-sandbox-preset]'
        ? { disabled: false, dataset: { diySandboxPreset: 'clicked-diy-scene' } }
        : null;
    }
  }
});
assert.deepEqual(JSON.parse(JSON.stringify(diyClickCalls)), [{
  id: 'clicked-diy-scene', options: { recordMemory: true, actor: 'user', provider: 'netease' }
}], 'the production DIY sidebar click handler lost its memory attribution');

const diyEntryCalls = [];
const diyEntryContext = {
  state: { sandbox: { presets: [{ id: 'diy-playback', presetType: 'playback', playbackPreset: 'cube' }] } },
  presetSceneSelectionToken: 0,
  enterPresetPlaybackPage(preset, options) { diyEntryCalls.push({ preset, options }); }
};
vm.runInNewContext(appFunctionSource('enterDiyScenePresetPlayback'), diyEntryContext, { filename: 'app-diy-entry.js' });
await diyEntryContext.enterDiyScenePresetPlayback('diy-playback', { recordMemory: true, actor: 'user', provider: 'kugou' });
assert.deepEqual(JSON.parse(JSON.stringify(diyEntryCalls)), [{
  preset: 'cube', options: { recordMemory: true, actor: 'user', provider: 'kugou' }
}], 'a DIY scene application lost its explicit memory attribution');

const marketLoads = [];
const marketPreset = { id: 'market-night', name: '市场深夜场景', sceneItems: [] };
const marketEntryContext = {
  state: { activeProvider: 'qq', sandbox: { presets: [], presetFolder: '' }, community: { marketItems: [], profileOpen: false } },
  async apiJson() { return { preset: marketPreset, presets: [marketPreset], folder: 'fixture' }; },
  normalizeSandboxPreset(value) { return value; }, safeText(value, fallback = '') { return value ?? fallback; },
  saveSandboxPresets() {}, renderSandboxPresets() {}, renderPresetMarket() {}, setCommunityProfileOpen() {}, setSandboxOpen() {}, toast() {},
  loadSandboxPreset(id, options) { marketLoads.push({ id, options }); }
};
vm.runInNewContext(appFunctionSource('downloadMarketPreset'), marketEntryContext, { filename: 'app-market-entry.js' });
await marketEntryContext.downloadMarketPreset('market-night');
assert.deepEqual(JSON.parse(JSON.stringify(marketLoads)), [{
  id: 'market-night', options: { recordMemory: true, actor: 'user', provider: 'qq' }
}], 'downloading and applying a market scene did not record the user/provider attribution');

const petEntryCalls = [];
const petEntryContext = {
  state: { activeProvider: 'kugou' }, PET_SCENE_ALIASES: {},
  petAssistantArguments(value) { return value; },
  petAssistantBoundedText(value) { return String(value || ''); },
  petAssistantNormalizeLookupText(value) { return String(value || '').toLowerCase(); },
  petAssistantPresetCatalog() { return [{ id: 'builtin-cube', name: '内置方块', source: 'builtin', aliases: [] }]; },
  petAssistantPlaybackSnapshot() { return { status: 'before' }; },
  enterPresetPlaybackPage(id, options) { petEntryCalls.push({ id, options }); }
};
vm.runInNewContext(appFunctionSource('petAssistantSwitchPreset'), petEntryContext, { filename: 'app-pet-entry.js' });
await petEntryContext.petAssistantSwitchPreset({ preset: 'builtin-cube' });
assert.deepEqual(JSON.parse(JSON.stringify(petEntryCalls)), [{
  id: 'builtin-cube', options: { recordMemory: true, actor: 'pet', provider: 'kugou' }
}], 'a pet-applied scene did not record the pet/provider attribution');

console.log(JSON.stringify({
  ok: true,
  learnedPositive: true,
  avoidance: true,
  genre: true,
  scene: true,
  time: true,
  volume: true,
  temporarySuppression: true
}, null, 2));
