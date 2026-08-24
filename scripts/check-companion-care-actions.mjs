import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const appSource = read('web/app.js');
const html = read('web/index.html');

class FixtureCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const window = { dispatchEvent() {} };
const context = vm.createContext({ window, CustomEvent: FixtureCustomEvent, Date });
vm.runInContext(read('web/app-command.js'), context, { filename: 'app-command.js' });
vm.runInContext(read('web/companion-care-actions.js'), context, { filename: 'companion-care-actions.js' });

let pauseUndoCalls = 0;
window.FeMonsterAppCommands.register({
  command: 'playback.pause',
  category: 'playback',
  title: 'Pause playback fixture',
  handler() {
    pauseUndoCalls += 1;
    playbackSnapshot = { ...playbackSnapshot, playing: false };
    return { status: 'paused' };
  }
});
window.FeMonsterAppCommands.register({
  command: 'playback.volume.set',
  category: 'playback',
  title: 'Set playback volume fixture',
  parameters: { volume: 'number 0..100' },
  requiredParameterGroups: [['volume']],
  handler(parameters) { return { volume: parameters.volume }; }
});

const loadedWallpapers = [
  {
    id: 'imported:aurora',
    name: '极光湖',
    description: '安静的绿色极光',
    kind: 'image',
    source: 'imported',
    url: 'file:///C:/private/aurora.png'
  },
  {
    id: 'wallpaper-engine:rain-city',
    name: '雨夜城市',
    description: '有缓慢雨滴的动态场景',
    kind: 'video',
    source: 'wallpaper-engine',
    url: '/api/wallpapers/file?path=C%3A%2Fprivate%2Frain.mp4'
  },
  {
    id: 'server-only:should-not-leak',
    name: '服务端候选',
    kind: 'image',
    source: 'server'
  }
];

let activeWallpaperId = 'imported:aurora';
const appliedWallpaperIds = [];
const playbackCalls = [];
const carePreference = {};
let carePreferenceFails = false;
let carePreferenceReadCount = 0;
let currentVolume = 68;
let habitProfile = { volumeBuckets: { quiet: 6, balanced: 3, loud: 1 } };
let localNow = new Date('2026-08-15T21:00:00+08:00');
let playbackSnapshot = { playing: false, song: null };
const memoryCalls = [];
let storedMemories = [
  {
    id: 'memory-care-explicit',
    category: 'care_preference',
    value: '难过时自动放治愈音乐',
    source: 'explicit',
    confidence: 1,
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
    expiresAt: '',
    feId: '87654321',
    secret: 'must-not-leak'
  },
  {
    id: 'memory-sensitive-token',
    category: 'api_token',
    value: 'must-not-leak',
    source: 'explicit',
    confidence: 1
  },
  {
    id: 'memory-sensitive-value',
    category: 'note',
    value: 'password: hunter2',
    source: 'explicit',
    confidence: 1
  }
];
const realComfortSongs = [
  { id: 'song-real-1', title: '夜风', artist: '现有歌手', album: '真实搜索结果' },
  { id: 'song-real-2', title: '湖光', artist: '现有歌手', album: '真实搜索结果' }
];

const companionCareRuntime = window.FeMonsterCompanionCareActions.create({
  commandBus: window.FeMonsterAppCommands,
  catalog: () => loadedWallpapers,
  wallpaper: {
    currentId: () => activeWallpaperId,
    apply(item) {
      appliedWallpaperIds.push(item.id);
      activeWallpaperId = item.id;
    }
  },
  playback: {
    async search(parameters) {
      playbackCalls.push({ command: 'music.search', parameters: { ...parameters } });
      return { query: parameters.query, songs: realComfortSongs };
    },
    async playSearch(parameters) {
      playbackCalls.push({ command: 'music.search.play', parameters: { ...parameters } });
      return { matched: realComfortSongs[0], playing: true };
    },
    async playSimilar(parameters) {
      playbackCalls.push({ command: 'music.play.similar', parameters: { ...parameters } });
      return { matched: realComfortSongs[1], playing: true };
    },
    snapshot() {
      return playbackSnapshot;
    },
    volume() {
      return currentVolume;
    },
    async setVolume(volume) {
      playbackCalls.push({ command: 'playback.volume.set', parameters: { volume } });
      currentVolume = volume;
    }
  },
  habits: async () => habitProfile,
  memory: {
    async query(parameters) {
      memoryCalls.push({ command: 'query', parameters: { ...parameters } });
      return { ok: true, feId: '12345678', memories: storedMemories };
    },
    async forget(parameters) {
      memoryCalls.push({ command: 'forget', parameters: { ...parameters } });
      const before = storedMemories.length;
      storedMemories = storedMemories.filter((item) => item.id !== parameters.memoryId);
      return { ok: true, feId: '12345678', removed: before - storedMemories.length, memories: storedMemories };
    }
  },
  carePreference: () => {
    carePreferenceReadCount += 1;
    if (carePreferenceFails) throw new Error('preference transport unavailable');
    return carePreference;
  },
  clock: () => localNow
});

const lateNightProactiveContext = await companionCareRuntime.proactiveContext({ type: 'late-night' });
assert.deepEqual(JSON.parse(JSON.stringify(lateNightProactiveContext)), {
  volumeHabitEvidenceCount: 10
}, 'late-night proactive context did not use the real aggregated volume habit buckets');
assert.deepEqual(
  JSON.parse(JSON.stringify(await companionCareRuntime.proactiveContext({ type: 'spontaneous' }))),
  {},
  'volume habit evidence should only be disclosed for the late-night care trigger'
);
habitProfile = { volumeBuckets: { quiet: 95, balanced: 17, loud: 8 } };
assert.equal(
  (await companionCareRuntime.proactiveContext({ type: 'late-night' })).volumeHabitEvidenceCount,
  100,
  'proactive volume habit evidence must be clamped to the 0..100 payload contract'
);
habitProfile = { volumeBuckets: { quiet: 6, balanced: 3, loud: 1 } };

const careContext = await window.FeMonsterAppCommands.execute('care.context.query');
assert.deepEqual(JSON.parse(JSON.stringify(careContext)), {
  timeOfDay: 'evening',
  localHour: 21,
  playback: { playing: false, song: null, volume: 68 },
  habits: {
    volumeEvidenceCount: 10,
    volumeProfile: { quiet: 6, balanced: 3, loud: 1 }
  }
}, 'bounded care context does not reflect local time, playback and aggregate habits');
const careContextDefinition = window.FeMonsterAppCommands.resolve('care.context.query');
assert.equal(careContextDefinition.readOnly, true);
assert.equal(careContextDefinition.automaticAllowed, true);

const catalog = await window.FeMonsterAppCommands.execute('wallpaper.catalog.query', { limit: 10 });
assert.equal(catalog.total, 2, 'only the loaded imported/Wallpaper Engine catalog may be exposed');
assert.deepEqual(
  catalog.items.map((item) => item.id),
  ['imported:aurora', 'wallpaper-engine:rain-city']
);
assert.equal(catalog.items[0].current, true);
assert.equal(catalog.items[1].current, false);
assert.ok(catalog.items.every((item) => !('url' in item) && !('path' in item)),
  'wallpaper catalog summaries leaked arbitrary local locations');

const nameSearch = await window.FeMonsterAppCommands.execute('wallpaper.search', { query: '极光湖' });
assert.deepEqual(nameSearch.items.map((item) => item.id), ['imported:aurora']);
assert.ok(nameSearch.items[0].confidence >= 0.9, 'an exact loaded wallpaper name was not high confidence');

const descriptionSearch = await window.FeMonsterAppCommands.execute('wallpaper.search', { query: '缓慢雨滴' });
assert.equal(descriptionSearch.items[0]?.id, 'wallpaper-engine:rain-city',
  'wallpaper descriptions are not searchable');

const kindSearch = await window.FeMonsterAppCommands.execute('wallpaper.search', { query: '动态' });
assert.deepEqual(kindSearch.items.map((item) => item.id), ['wallpaper-engine:rain-city'],
  'wallpaper type aliases are not searchable');
assert.ok(!kindSearch.items.some((item) => item.id === 'server-only:should-not-leak'));

const currentWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.current.query');
assert.equal(currentWallpaper.status, 'active');
assert.equal(currentWallpaper.wallpaper.id, 'imported:aurora');
assert.ok(!('url' in currentWallpaper.wallpaper), 'current wallpaper leaked its local URL');

const appliedWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  id: 'wallpaper-engine:rain-city',
  automatic: true,
  operationId: 'apply-rain-once'
});
assert.equal(appliedWallpaper.status, 'applied');
assert.equal(appliedWallpaper.before.id, 'imported:aurora');
assert.equal(appliedWallpaper.after.id, 'wallpaper-engine:rain-city');
assert.deepEqual(appliedWallpaperIds, ['wallpaper-engine:rain-city']);
assert.deepEqual(JSON.parse(JSON.stringify(appliedWallpaper.undo)), {
  command: 'wallpaper.apply',
  parameters: { id: 'imported:aurora' }
}, 'automatic wallpaper switching did not return the exact loaded previous wallpaper as undo');
assert.deepEqual(JSON.parse(JSON.stringify(appliedWallpaper.receipt)), {
  command: 'wallpaper.apply',
  operationId: 'apply-rain-once',
  status: 'applied',
  replayed: false,
  at: '2026-08-15T13:00:00.000Z'
});

activeWallpaperId = '';
const rejectedUnrestorableWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  id: 'imported:aurora',
  automatic: true,
  operationId: 'reject-unrestorable-wallpaper'
});
assert.equal(rejectedUnrestorableWallpaper.status, 'rejected');
assert.equal(rejectedUnrestorableWallpaper.applied, false);
assert.equal(rejectedUnrestorableWallpaper.reason, 'automatic_requires_reversible_wallpaper');
assert.deepEqual(appliedWallpaperIds, ['wallpaper-engine:rain-city'],
  'automatic wallpaper switching ran without a loaded previous wallpaper to restore');
activeWallpaperId = 'wallpaper-engine:rain-city';

const replayedWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  id: 'wallpaper-engine:rain-city',
  operationId: 'apply-rain-once'
});
assert.equal(replayedWallpaper.receipt.replayed, true);
assert.deepEqual(appliedWallpaperIds, ['wallpaper-engine:rain-city'],
  'an idempotent wallpaper operation was applied twice');

const unchangedWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  id: 'wallpaper-engine:rain-city',
  operationId: 'apply-rain-again'
});
assert.equal(unchangedWallpaper.status, 'unchanged');
assert.deepEqual(appliedWallpaperIds, ['wallpaper-engine:rain-city']);

const rejectedLocation = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  id: 'imported:aurora',
  url: 'file:///C:/untrusted/arbitrary.png',
  operationId: 'reject-arbitrary-location'
});
assert.equal(rejectedLocation.status, 'rejected');
assert.equal(rejectedLocation.reason, 'arbitrary_location_not_allowed');
assert.deepEqual(appliedWallpaperIds, ['wallpaper-engine:rain-city']);

const fuzzyApplied = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  query: '极光',
  operationId: 'apply-fuzzy-aurora'
});
assert.equal(fuzzyApplied.status, 'applied');
assert.equal(fuzzyApplied.after.id, 'imported:aurora');

loadedWallpapers.push(
  { id: 'imported:star-lake', name: '星空湖', description: '湖面星光', kind: 'image', source: 'imported' },
  { id: 'imported:star-field', name: '星空原野', description: '草地星空', kind: 'image', source: 'imported' },
  {
    id: 'wallpaper-engine:void-scene',
    name: '虚空原生场景',
    description: 'Wallpaper Engine native scene',
    kind: 'scene',
    source: 'wallpaper-engine',
    requiresNativeEngine: true
  }
);

const ambiguousWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  query: '星空',
  operationId: 'ambiguous-stars'
});
assert.equal(ambiguousWallpaper.status, 'ambiguous');
assert.deepEqual(
  ambiguousWallpaper.candidates.map((item) => item.id),
  ['imported:star-lake', 'imported:star-field']
);
assert.equal(appliedWallpaperIds.length, 2, 'an ambiguous wallpaper query guessed a candidate');

assert.equal(
  window.FeMonsterAppCommands.inspect('wallpaper.apply', { id: 'wallpaper-engine:void-scene' }).requiresConfirmation,
  false,
  'an exact already-loaded native wallpaper should remain a reversible low-risk switch'
);
await window.FeMonsterAppCommands.execute(
  'wallpaper.apply',
  { id: 'wallpaper-engine:void-scene', operationId: 'loaded-native-scene' }
);
assert.equal(appliedWallpaperIds.at(-1), 'wallpaper-engine:void-scene');

const approximateLoadedWallpaper = await window.FeMonsterAppCommands.execute('wallpaper.apply', {
  query: '极光湖畔',
  operationId: 'apply-unique-approximate-aurora'
});
assert.equal(approximateLoadedWallpaper.status, 'applied');
assert.equal(approximateLoadedWallpaper.after.id, 'imported:aurora');

const comfortRecommendation = await window.FeMonsterAppCommands.execute(
  'care.music.comfort.recommend',
  { query: '安静的音乐' }
);
assert.equal(comfortRecommendation.status, 'recommended');
assert.equal(comfortRecommendation.sourceCommand, 'music.search');
assert.deepEqual(
  comfortRecommendation.songs.map((song) => song.id),
  ['song-real-1', 'song-real-2']
);
assert.deepEqual(playbackCalls.map((call) => call.command), ['music.search']);

const privateContextRecommendation = await window.FeMonsterAppCommands.execute(
  'care.music.comfort.recommend',
  {
    selectionContext: {
      conversation: '我叫张三，手机号13800138000，邮箱zhangsan@example.com，今天和某个人吵架后非常难过，这是不应离开客户端的原始对话',
      emotion: '难过',
      habitHints: ['lofi', '手机号13800138000', '爵士'],
      timeOfDay: 'late-night',
      account: 'FE12345678'
    }
  }
);
assert.equal(privateContextRecommendation.status, 'recommended');
assert.equal(playbackCalls.at(-1).parameters.query, '难过 lofi 爵士 late-night');
assert.doesNotMatch(playbackCalls.at(-1).parameters.query, /13800138000|zhangsan|example\.com|FE12345678/i,
  'identifying conversation text leaked to the music provider');
playbackCalls.pop();

const shortSentenceRecommendation = await window.FeMonsterAppCommands.execute(
  'care.music.comfort.recommend',
  {
    selectionContext: {
      conversation: '我叫张三今天想听雨夜钢琴',
      emotion: '我叫张三今天很难过',
      timeOfDay: 'late-night'
    }
  }
);
assert.equal(shortSentenceRecommendation.status, 'recommended');
assert.equal(playbackCalls.at(-1).parameters.query, '雨夜 钢琴 难过 late-night');
assert.doesNotMatch(playbackCalls.at(-1).parameters.query, /我叫|张三|今天|\u60f3\u542c/,
  'a short natural-language sentence leaked alongside its allowed descriptors');
playbackCalls.pop();

const explicitQueryRecommendation = await window.FeMonsterAppCommands.execute(
  'care.music.comfort.recommend',
  { query: '张三的雨夜钢琴' }
);
assert.equal(playbackCalls.at(-1).parameters.query, '张三的雨夜钢琴',
  'an explicit user query was unexpectedly reduced to descriptor tokens');
playbackCalls.pop();

const personalizedContextRecommendation = await window.FeMonsterAppCommands.execute(
  'care.music.comfort.recommend',
  {
    selectionContext: {
      emotion: 'joy',
      habitHints: ['习惯测试歌手', '习惯测试歌曲', 'token=abc123'],
      timeOfDay: 'late-night'
    }
  }
);
assert.equal(personalizedContextRecommendation.status, 'recommended');
assert.equal(
  playbackCalls.at(-1).parameters.query,
  '开心 习惯测试歌手 习惯测试歌曲 late-night',
  'safe real listening habits and seven-emotion keys were not used for flexible selection'
);
assert.doesNotMatch(playbackCalls.at(-1).parameters.query, /token|abc123/i,
  'a credential-shaped habit hint leaked to the music provider');
playbackCalls.pop();

const dynamicSelectionPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  selectionContext: {
    conversation: '雨夜钢琴',
    emotion: '想被安慰',
    timeOfDay: 'late-night'
  },
  operationId: 'comfort-dynamic-selection'
});
assert.equal(dynamicSelectionPlayback.status, 'played');
assert.deepEqual(
  playbackCalls.slice(-2).map((call) => call.command),
  ['music.search', 'music.search.play'],
  'comfort playback must search the live provider before playing an exact result'
);
assert.equal(
  playbackCalls.at(-2).parameters.query,
  '雨夜 钢琴 安慰 late-night',
  'the server-provided selection context was replaced by a fixed comfort query'
);
assert.deepEqual(
  playbackCalls.at(-1).parameters,
  { songId: 'song-real-1' },
  'comfort playback did not play the exact song returned by the live search'
);
playbackCalls.splice(-2, 2);

const comfortPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '安静的音乐',
  operationId: 'comfort-play-once'
});
assert.equal(comfortPlayback.status, 'played');
assert.equal(comfortPlayback.sourceCommand, 'music.search.play');
assert.equal(comfortPlayback.matched.id, 'song-real-1');
assert.equal(comfortPlayback.receipt.replayed, false);

const replayedComfortPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '安静的音乐',
  operationId: 'comfort-play-once'
});
assert.equal(replayedComfortPlayback.receipt.replayed, true);
assert.deepEqual(
  playbackCalls.map((call) => call.command),
  ['music.search', 'music.search', 'music.search.play'],
  'an idempotent comfort playback command started music twice'
);

const guardedSadPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '治愈音乐',
  proactive: true,
  carePreference: { autoComfortMusicWhenSad: true },
  operationId: 'sad-auto-without-local-preference'
});
assert.equal(guardedSadPlayback.status, 'played');
assert.equal(guardedSadPlayback.played, true);
assert.deepEqual(JSON.parse(JSON.stringify(guardedSadPlayback.undo)), {
  command: 'playback.pause',
  parameters: {}
}, 'automatic comfort playback did not return an executable pause undo');
assert.deepEqual(
  playbackCalls.slice(-2).map((call) => call.command),
  ['music.search', 'music.search.play'],
  'an idle low-risk proactive care action was downgraded instead of executing'
);
assert.equal(carePreferenceReadCount, 0,
  'the client added a second care-preference authorization gate after the trusted policy decision');

carePreference.autoComfortMusicWhenSad = true;
const preferredSadPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '治愈音乐',
  proactive: true,
  operationId: 'sad-auto-with-local-preference'
});
assert.equal(preferredSadPlayback.status, 'played');
assert.equal(playbackCalls.at(-1).command, 'music.search.play');

const similarComfortPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  similar: true,
  operationId: 'comfort-similar-once'
});
assert.equal(similarComfortPlayback.sourceCommand, 'music.play.similar');
assert.equal(similarComfortPlayback.matched.id, 'song-real-2');
assert.equal(playbackCalls.at(-1).command, 'music.play.similar');

carePreferenceFails = true;
const failedPreferencePlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '治愈音乐',
  proactive: true,
  operationId: 'sad-auto-preference-read-failed'
});
assert.equal(failedPreferencePlayback.status, 'played');
assert.equal(failedPreferencePlayback.played, true);
assert.deepEqual(playbackCalls.slice(-2).map((call) => call.command), ['music.search', 'music.search.play']);
assert.equal(carePreferenceReadCount, 0);
carePreferenceFails = false;

playbackSnapshot = { playing: true, song: realComfortSongs[0] };
const defaultPlaybackGuard = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '不应打断当前歌曲',
  operationId: 'comfort-default-playback-guard'
});
assert.equal(defaultPlaybackGuard.status, 'unchanged');
assert.equal(defaultPlaybackGuard.reason, 'playback_active');
assert.notEqual(playbackCalls.at(-1).parameters?.query, '不应打断当前歌曲');

const callsBeforeIdleOnlyPlayback = playbackCalls.length;
const idleOnlyPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: '舒缓治愈音乐',
  onlyIfIdle: true,
  operationId: 'comfort-only-when-idle'
});
assert.equal(idleOnlyPlayback.status, 'unchanged');
assert.equal(idleOnlyPlayback.reason, 'playback_active');
assert.equal(playbackCalls.length, callsBeforeIdleOnlyPlayback,
  'idle-only care playback interrupted the currently playing song');
playbackSnapshot = { playing: false, song: null };

const rejectedMusicLocation = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  query: 'file:///C:/private/comfort.mp3',
  operationId: 'reject-arbitrary-music-location'
});
assert.equal(rejectedMusicLocation.status, 'rejected');
assert.equal(rejectedMusicLocation.reason, 'arbitrary_location_not_allowed');
assert.equal(rejectedMusicLocation.played, false);
assert.notEqual(playbackCalls.at(-1).parameters?.query, 'file:///C:/private/comfort.mp3');

const callsBeforeMissingSelection = playbackCalls.length;
const missingSelectionPlayback = await window.FeMonsterAppCommands.execute('care.music.comfort.play', {
  operationId: 'comfort-missing-dynamic-selection'
});
assert.equal(missingSelectionPlayback.status, 'missing_selection_context');
assert.equal(missingSelectionPlayback.played, false);
assert.equal(playbackCalls.length, callsBeforeMissingSelection,
  'comfort playback silently substituted a fixed fallback query');

assert.equal(
  window.FeMonsterAppCommands.inspect('care.music.comfort.play', { query: '真实搜索' }).requiresConfirmation,
  false,
  'idle comfort playback is a low-risk reversible command and should execute without confirmation'
);
assert.equal(
  window.FeMonsterAppCommands.inspect('wallpaper.apply', { id: 'imported:aurora' }).requiresConfirmation,
  false,
  'switching to an exact already-loaded image wallpaper should not require confirmation'
);

const adaptedVolume = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  operationId: 'evening-volume-once'
});
assert.equal(adaptedVolume.status, 'adjusted');
assert.equal(adaptedVolume.before, 68);
assert.equal(adaptedVolume.after, 60);
assert.equal(adaptedVolume.reason, 'habit_time_guard');
assert.equal(adaptedVolume.timeBucket, 'evening');
assert.deepEqual(JSON.parse(JSON.stringify(adaptedVolume.undo)), {
  command: 'playback.volume.set',
  parameters: { volume: 68 }
});
assert.equal(playbackCalls.at(-1).command, 'playback.volume.set');
assert.equal(playbackCalls.at(-1).parameters.volume, 60);

const replayedVolume = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  operationId: 'evening-volume-once'
});
assert.equal(replayedVolume.receipt.replayed, true);
assert.equal(playbackCalls.filter((call) => call.command === 'playback.volume.set').length, 1,
  'an idempotent adaptive-volume operation changed master volume twice');

currentVolume = 20;
habitProfile = { volumeBuckets: { quiet: 0, balanced: 0, loud: 10 } };
localNow = new Date('2026-08-16T01:00:00+08:00');
const neverRaisedVolume = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  operationId: 'late-night-never-raise'
});
assert.equal(neverRaisedVolume.status, 'unchanged');
assert.equal(neverRaisedVolume.before, 20);
assert.equal(neverRaisedVolume.after, 20);
assert.equal(neverRaisedVolume.timeBucket, 'late-night');
assert.equal(playbackCalls.filter((call) => call.command === 'playback.volume.set').length, 1,
  'adaptive care raised a quiet master volume');

currentVolume = 60;
habitProfile = { volumeBuckets: { quiet: 1, balanced: 1, loud: 0 } };
const insufficientHabitVolume = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  operationId: 'insufficient-volume-evidence'
});
assert.equal(insufficientHabitVolume.status, 'unchanged');
assert.equal(insufficientHabitVolume.before, 60);
assert.equal(insufficientHabitVolume.after, 60);
assert.equal(insufficientHabitVolume.reason, 'insufficient_volume_habit_evidence');
assert.equal(playbackCalls.filter((call) => call.command === 'playback.volume.set').length, 1);

currentVolume = 60;
habitProfile = { volumeBuckets: { quiet: 0, balanced: 0, loud: 0 } };
localNow = new Date('2026-08-16T02:00:00+08:00');
const proactiveLowEvidenceVolume = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  type: 'late-night',
  proactive: true,
  automatic: true,
  volume: 5,
  operationId: 'late-night-low-evidence-down'
});
assert.equal(proactiveLowEvidenceVolume.status, 'adjusted');
assert.equal(proactiveLowEvidenceVolume.before, 60);
assert.equal(proactiveLowEvidenceVolume.after, 52,
  'a proactive adjustment exceeded the maximum eight-point downward step');
assert.equal(proactiveLowEvidenceVolume.habitEvidence, 0);
assert.equal(playbackCalls.at(-1).parameters.volume, 52);

currentVolume = 20;
const proactiveRaiseAttempt = await window.FeMonsterAppCommands.execute('care.volume.adapt', {
  reason: 'late-night',
  proactive: true,
  automatic: true,
  volume: 90,
  operationId: 'late-night-never-follow-raise-target'
});
assert.equal(proactiveRaiseAttempt.status, 'unchanged');
assert.equal(proactiveRaiseAttempt.before, 20);
assert.equal(proactiveRaiseAttempt.after, 20,
  'a server-supplied target raised the local master volume');

const memoryPage = await window.FeMonsterAppCommands.execute('pet.memory.query', { limit: 10 });
assert.equal(memoryPage.total, 1, 'sensitive memory categories were exposed to the assistant');
assert.equal(memoryPage.items[0].id, 'memory-care-explicit');
assert.equal(memoryPage.items[0].category, 'care_preference');
assert.ok(!('feId' in memoryPage) && !('feId' in memoryPage.items[0]));
assert.ok(!('secret' in memoryPage.items[0]));
assert.deepEqual(JSON.parse(JSON.stringify(memoryCalls[0].parameters)), {},
  'client-provided account scope reached the memory adapter');

const rejectedScopedForget = await window.FeMonsterAppCommands.execute('pet.memory.forget', {
  memoryId: 'memory-care-explicit',
  feId: '87654321',
  computerId: 'other-computer'
});
assert.equal(rejectedScopedForget.status, 'rejected');
assert.equal(memoryCalls.filter((call) => call.command === 'forget').length, 0);

assert.equal(
  window.FeMonsterAppCommands.inspect('pet.memory.forget', { memoryId: 'memory-care-explicit' }).requiresConfirmation,
  true,
  'forgetting an account memory is irreversible and must retain confirmation'
);
assert.throws(
  () => window.FeMonsterAppCommands.inspect('pet.memory.forget', { category: 'care_preference' }),
  (error) => error?.code === 'missing_parameters',
  'memory deletion must require one exact server-issued memory ID'
);

await assert.rejects(
  () => window.FeMonsterAppCommands.execute('pet.memory.forget', {
    memoryId: 'memory-care-explicit',
    operationId: 'forget-one-memory'
  }),
  (error) => error?.code === 'confirmation_required'
);
assert.equal(memoryCalls.filter((call) => call.command === 'forget').length, 0,
  'an irreversible memory deletion bypassed local confirmation');
const forgottenMemory = await window.FeMonsterAppCommands.execute(
  'pet.memory.forget',
  { memoryId: 'memory-care-explicit', operationId: 'forget-one-memory' },
  { confirmed: true }
);
assert.equal(forgottenMemory.status, 'forgotten');
assert.equal(forgottenMemory.removed, 1);
assert.equal(forgottenMemory.remaining, 0);
assert.deepEqual(JSON.parse(JSON.stringify(memoryCalls.at(-1).parameters)), {
  memoryId: 'memory-care-explicit'
});

const registeredCommands = window.FeMonsterAppCommands.catalog().map((definition) => definition.command);
for (const command of [
  'wallpaper.catalog.query', 'wallpaper.search', 'wallpaper.apply', 'wallpaper.current.query',
  'care.music.comfort.play', 'care.music.comfort.recommend', 'care.volume.adapt',
  'pet.memory.query', 'pet.memory.forget'
]) {
  assert.ok(registeredCommands.includes(command), `structured client catalog is missing ${command}`);
}
const comfortPlayDefinition = window.FeMonsterAppCommands.catalog()
  .find((definition) => definition.command === 'care.music.comfort.play');
assert.equal(comfortPlayDefinition.reversible, true);
assert.equal(comfortPlayDefinition.automaticAllowed, true);
assert.match(comfortPlayDefinition.description, /directly|直接|空闲/i);
assert.doesNotMatch(comfortPlayDefinition.description, /care preference|关怀偏好|only recommends/i,
  'the command catalog still advertises the removed care-preference gate');
assert.ok(
  html.indexOf('companion-care-actions.js') > html.indexOf('app-command.js')
  && html.indexOf('companion-care-actions.js') < html.indexOf('app.js'),
  'companion care actions must load after the command bus and before app registration'
);
assert.match(
  appSource,
  /wallpaperCatalogs:\s*\{\s*imported:\s*\[\],\s*live:\s*\[\]\s*\}/,
  'the real app does not retain a controlled catalog for both loaded wallpaper sources'
);
assert.match(
  appSource,
  /function\s+replaceLoadedWallpaperCatalogs[\s\S]{0,1600}state\.wallpaperCatalogs\.imported[\s\S]{0,600}state\.wallpaperCatalogs\.live[\s\S]{0,800}state\.wallpapers\s*=/,
  'wallpaper refreshes do not rebuild the stable imported + Wallpaper Engine command catalog'
);
assert.match(
  appSource,
  /async\s+function\s+applyCompanionWallpaper[\s\S]{0,500}await\s+setWallpaperSource\(source\)[\s\S]{0,500}await\s+waitForWallpaperRefresh[\s\S]{0,500}selectWallpaper\(loaded\.id\)/,
  'the real wallpaper adapter does not await cross-source refresh before selecting the loaded ID'
);
assert.match(appSource, /commands\.execute\(['"]music\.search['"]/);
assert.match(appSource, /commands\.execute\(['"]music\.search\.play['"]/);
assert.match(appSource, /commands\.execute\(['"]music\.play\.similar['"]/);
assert.match(appSource, /ensurePlaybackIntelligence\(\)\.execute\(['"]habit\.summary['"]\)/);
assert.match(appSource, /snapshot:\s*\(\)\s*=>\s*petAssistantPlaybackSnapshot\(\)/);
assert.match(
  appSource,
  /FeMonsterCompanionCareBridge[\s\S]{0,260}proactiveContext[\s\S]{0,260}companionCareRuntime\.proactiveContext/,
  'the real app does not expose the local habit-backed proactive context bridge'
);

console.log(JSON.stringify({ ok: true, commands: window.FeMonsterAppCommands.catalog().length }, null, 2));
