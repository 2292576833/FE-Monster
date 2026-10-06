import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const projectRoot = path.resolve(import.meta.dirname, '..');
const resolverPath = path.join(projectRoot, 'web', 'lyric-timeline-resolver.js');
const appPath = path.join(projectRoot, 'web', 'app.js');
const indexPath = path.join(projectRoot, 'web', 'index.html');
const source = fs.readFileSync(resolverPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const window = {};
vm.runInNewContext(source, { window, console, Date, JSON, Map, Set, Promise }, {
  filename: resolverPath
});

const api = window.FeLyricTimelineResolver;
assert.ok(api && typeof api.create === 'function', 'the browser resolver API is missing');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values
  };
}

function parsePayload(payload) {
  const lyric = String(payload?.yrc?.lyric || payload?.klyric?.lyric || payload?.lrc?.lyric || '');
  const text = lyric.includes('慢慢唱') ? '慢慢唱直到夜色降临' : lyric.includes('完全不同') ? '完全不同的歌词内容' : '慢慢唱直到夜色降临';
  const detailed = /(?:\(\d+,\d+,\d+\)|<\d+,\d+,\d+>)/u.test(lyric);
  return [{
    time: 10,
    endTime: 18,
    text,
    karaokeSegments: detailed
      ? [
          { startTime: 10, endTime: 12, textStart: 0, textEnd: 2 },
          { startTime: 14.5, endTime: 18, textStart: 2, textEnd: text.length }
        ]
      : []
  }];
}

const song = {
  id: 'primary-1',
  provider: 'netease',
  title: '慢慢唱',
  artist: '歌手甲',
  album: '同名专辑',
  duration: 238
};
const primaryPlain = {
  provider: 'netease',
  lrc: { lyric: '[00:10.000]慢慢唱直到夜色降临\n[00:18.000]下一句' },
  tlyric: { lyric: '[00:10.000]Sing slowly until night falls' }
};
const exactCandidate = {
  id: 'qq-exact',
  provider: 'qq',
  title: '慢慢唱',
  artist: '歌手甲',
  album: '同名专辑',
  duration: 239
};
const liveCandidate = {
  id: 'kg-live',
  provider: 'kugou',
  title: '慢慢唱（Live）',
  artist: '歌手甲',
  album: '现场版',
  duration: 286
};
const detailedPayload = {
  provider: 'qq',
  klyric: { lyric: '[10000,8000](10000,2000,0)慢慢(14500,3500,0)唱直到夜色降临' }
};

const storage = memoryStorage();
const calls = { primary: 0, searches: [], lyrics: [] };
const resolver = api.create({
  storage,
  allowCrossProvider: true,
  parsePayload,
  providerIds: () => ['netease', 'qq', 'kugou'],
  isProviderConfigured: () => true,
  loadPrimary: async () => {
    calls.primary += 1;
    return primaryPlain;
  },
  searchProvider: async (provider) => {
    calls.searches.push(provider);
    if (provider === 'qq') return [exactCandidate];
    if (provider === 'kugou') return [liveCandidate];
    return [];
  },
  loadLyrics: async (provider, candidate) => {
    calls.lyrics.push(`${provider}:${candidate.id}`);
    if (candidate.id === exactCandidate.id) return detailedPayload;
    return {
      provider,
      klyric: { lyric: '[10000,8000]<0,1000,0>完全不同的歌词内容' }
    };
  }
});

const resolved = await resolver.resolve(song, 'netease');
assert.equal(resolved.detailed, true, 'a verified word-level timeline was not selected');
assert.equal(resolved.sourceProvider, 'qq', 'the exact recording was not selected');
assert.equal(resolved.strategy, 'cross-provider-word-timeline');
assert.equal(resolved.cacheHit, false);
assert.equal(
  resolved.payload.tlyric.lyric,
  primaryPlain.tlyric.lyric,
  'cross-provider timing replacement discarded the primary translation track'
);
assert.equal(calls.primary, 1);
assert.deepEqual([...calls.searches].sort(), ['kugou', 'qq']);
assert.deepEqual(calls.lyrics, ['qq:qq-exact'], 'a duration-mismatched live recording was queried');
assert.ok(storage.values.size > 0, 'the resolved word timeline was not persisted');

const cachedResolver = api.create({
  storage,
  allowCrossProvider: true,
  parsePayload,
  providerIds: () => ['netease', 'qq', 'kugou'],
  isProviderConfigured: () => true,
  loadPrimary: async () => {
    throw new Error('a cache hit must not request the primary provider');
  },
  searchProvider: async () => {
    throw new Error('a cache hit must not search another provider');
  },
  loadLyrics: async () => {
    throw new Error('a cache hit must not request lyrics');
  }
});
const cached = await cachedResolver.resolve(song, 'netease');
assert.equal(cached.cacheHit, true, 'the cross-session word timeline cache was not used');
assert.equal(cached.sourceProvider, 'qq');
assert.equal(cached.lines[0].karaokeSegments.length, 2);

const primaryDetailedStorage = memoryStorage();
let unexpectedSearches = 0;
const primaryDetailedResolver = api.create({
  storage: primaryDetailedStorage,
  parsePayload,
  providerIds: () => ['netease', 'qq'],
  isProviderConfigured: () => true,
  loadPrimary: async () => ({
    provider: 'netease',
    yrc: { lyric: '[10000,8000](10000,2000,0)慢慢(14500,3500,0)唱直到夜色降临' }
  }),
  searchProvider: async () => {
    unexpectedSearches += 1;
    return [];
  },
  loadLyrics: async () => ({})
});
const primaryDetailed = await primaryDetailedResolver.resolve(song, 'netease');
assert.equal(primaryDetailed.sourceProvider, 'netease');
assert.equal(primaryDetailed.strategy, 'provider-word-timeline');
assert.equal(unexpectedSearches, 0, 'a detailed primary timeline triggered unnecessary fallback searches');

const unrelatedStorage = memoryStorage();
const unrelatedResolver = api.create({
  storage: unrelatedStorage,
  allowCrossProvider: true,
  parsePayload,
  providerIds: () => ['netease', 'qq'],
  isProviderConfigured: () => true,
  loadPrimary: async () => primaryPlain,
  searchProvider: async () => [exactCandidate],
  loadLyrics: async () => ({
    provider: 'qq',
    klyric: { lyric: '[10000,8000](10000,8000,0)完全不同的歌词内容' }
  })
});
const unrelated = await unrelatedResolver.resolve(song, 'netease');
assert.equal(unrelated.detailed, false, 'an unrelated lyric body was accepted as the same recording');
assert.equal(unrelated.sourceProvider, 'netease');
assert.equal(unrelated.strategy, 'provider-line-timeline');

const directOnlyCalls = { searches: 0, lyrics: 0 };
const directOnlyResolver = api.create({
  storage,
  allowCrossProvider: false,
  parsePayload,
  providerIds: () => ['netease', 'qq'],
  isProviderConfigured: () => true,
  loadPrimary: async () => primaryPlain,
  searchProvider: async () => {
    directOnlyCalls.searches += 1;
    return [exactCandidate];
  },
  loadLyrics: async () => {
    directOnlyCalls.lyrics += 1;
    return detailedPayload;
  }
});
const directOnly = await directOnlyResolver.resolve(song, 'netease');
assert.equal(directOnly.sourceProvider, 'netease',
  'direct mode reused a cached timeline belonging to another platform');
assert.equal(directOnly.strategy, 'provider-line-timeline');
assert.deepEqual(directOnlyCalls, { searches: 0, lyrics: 0 },
  'direct mode queried another platform for lyrics');

const resolverScriptIndex = indexSource.indexOf('lyric-timeline-resolver.js?v=');
const appScriptIndex = indexSource.indexOf('app.js?v=');
assert.ok(resolverScriptIndex >= 0, 'the timeline resolver is not loaded by the desktop page');
assert.ok(appScriptIndex > resolverScriptIndex, 'the timeline resolver must load before app.js');
assert.match(appSource, /window\.FeLyricTimelineResolver/u,
  'app.js does not consume the cross-provider timeline resolver');
assert.match(appSource, /allowCrossProvider:\s*false/u,
  'desktop playback must default to the selected platform\'s own native lyric timeline');
assert.match(appSource, /await\s+playbackLyricTimelineResolver\(\)\.resolve\(song,\s*provider\)/u,
  'loadPlaybackLyrics does not resolve and cache the best available word timeline');

console.log(JSON.stringify({
  ok: true,
  selected: {
    provider: resolved.sourceProvider,
    strategy: resolved.strategy,
    segmentCount: resolved.lines[0].karaokeSegments.length
  },
  crossSessionCacheHit: cached.cacheHit,
  primaryDetailedSearches: unexpectedSearches,
  unrelatedTimelineRejected: !unrelated.detailed
}, null, 2));
