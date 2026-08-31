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
let temporary = false;

const window = {
  FeMonsterPetPreferenceMemory: {
    async observePlaybackSummary(value) {
      preferenceSummaries.push(JSON.parse(JSON.stringify(value)));
      return { written: 0 };
    }
  },
  FeLocalMemory: {
    isTemporaryConversation() { return temporary; }
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
assert.match(sceneMemorySource, /notifyPlaybackIntelligence\('scene-apply',[\s\S]*scene:[\s\S]*id:[\s\S]*name:[\s\S]*provider:/,
  'accepted scene receipts must forward only bounded scene identity and provider evidence');

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
