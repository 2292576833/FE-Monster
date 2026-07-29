import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');

function functionBlock(name) {
  const candidates = [`function ${name}(`, `async function ${name}(`];
  const starts = candidates
    .map((candidate) => app.indexOf(candidate))
    .filter((index) => index >= 0);
  assert.ok(starts.length, `missing ${name}`);
  const start = Math.min(...starts);
  const parametersEnd = app.indexOf(')', start);
  const bodyStart = app.indexOf('{', parametersEnd + 1);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function fakeClassList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    toggle(item, force) {
      if (force === undefined) {
        if (values.has(item)) values.delete(item);
        else values.add(item);
      } else if (force) values.add(item);
      else values.delete(item);
      return values.has(item);
    },
    contains: (item) => values.has(item)
  };
}

function fakeElement() {
  return {
    hidden: false,
    disabled: false,
    src: '',
    textContent: '',
    title: '',
    className: '',
    children: [],
    classList: fakeClassList(),
    dataset: {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    }
  };
}

{
  const profile = fakeElement();
  profile.hidden = true;
  const avatar = fakeElement();
  const name = fakeElement();
  const meta = fakeElement();
  const collections = fakeElement();
  collections.hidden = true;
  const state = {
    activeProvider: 'qishui',
    loginStatusByProvider: { qishui: { playbackAuthorized: false } }
  };
  const context = {
    URL,
    document: { createElement: () => fakeElement() },
    window: { location: { href: 'http://127.0.0.1:50271/' } },
    els: {
      qishuiLocalProfile: profile,
      qishuiLocalProfileAvatar: avatar,
      qishuiLocalProfileName: name,
      qishuiLocalProfileMeta: meta,
      qishuiLocalCollections: collections
    },
    state,
    safeText: (value, fallback = '') => value == null || value === '' ? fallback : String(value),
    proxiedImageUrl: (value) => `proxy:${value}`,
    renderLoginStatus: () => {},
    playbackCardProvider: () => ({ id: 'qishui' }),
    playbackCardSong: () => ({}),
    providerInfo: () => ({ id: 'qishui', label: '\u6c7d\u6c34\u97f3\u4e50' }),
    renderQishuiPlaybackIdentity: () => {}
  };
  vm.runInNewContext([
    functionBlock('qishuiPublicAvatarUrl'),
    functionBlock('renderQishuiLocalProfile'),
    'this.render = renderQishuiLocalProfile;'
  ].join('\n'), context, { filename: 'qishui-profile-ui.vm.js' });

  context.render({
    loginDetected: true,
    displayName: '\u672c\u5730\u6c7d\u6c34\u7528\u6237',
    avatar: 'https://media.example.test/avatar.jpg',
    isVip: true,
    metadataState: 'ready',
    collections: [
      {
        id: 'sodamusic-local-liked',
        name: '\u6211\u559c\u6b22\u7684\u97f3\u4e50',
        trackCount: 12,
        metadataState: 'ready',
        playable: true
      },
      {
        id: 'sodamusic-local-douyin',
        name: '\u6296\u97f3\u6536\u85cf\u7684\u97f3\u4e50',
        trackCount: 0,
        metadataState: 'summary',
        playable: false
      }
    ]
  });

  assert.equal(profile.hidden, false, 'detected local login profile must be visible');
  assert.equal(name.textContent, '\u672c\u5730\u6c7d\u6c34\u7528\u6237');
  assert.equal(avatar.src, 'proxy:https://media.example.test/avatar.jpg');
  assert.equal(collections.hidden, false, 'ready collections and safe summaries must be visible');
  assert.equal(collections.children.length, 2);
  assert.match(collections.children[0].textContent, /\u6211\u559c\u6b22/);
  assert.match(collections.children[1].textContent, /\u6296\u97f3\u6536\u85cf/);
}

{
  const networkCalls = [];
  const sourceSong = {
    id: 'private-local-song-id-must-not-leak',
    title: 'Public Title',
    artist: 'Public Artist',
    album: 'private-local-album-must-not-leak',
    duration: 217,
    provider: 'qishui',
    sourceRef: {
      metadataOnly: true,
      providerSongId: 'private-provider-id-must-not-leak',
      accessToken: 'private-token-must-not-leak',
      audioUrl: 'https://private.example.test/must-not-leak.m4a'
    }
  };
  const publicMatch = {
    id: 'public-provider-song-id',
    title: 'Public Title',
    artist: 'Public Artist',
    album: 'Public Album',
    duration: 216,
    provider: 'netease'
  };
  const context = {
    QISHUI_GUEST_MATCH_CACHE_MS: 10 * 60 * 1000,
    QISHUI_GUEST_FALLBACK_PROVIDERS: Object.freeze(['netease', 'qq', 'kugou']),
    state: {
      qishuiGuestMatches: { cache: new Map(), requests: new Map() }
    },
    safeText: (value, fallback = '') => value == null || value === '' ? fallback : String(value),
    providerConfigured: (provider) => provider === 'netease',
    preferredPlaybackQuality: () => 'standard',
    query: (value) => new URLSearchParams(
      Object.entries(value).filter(([, item]) => item !== undefined && item !== null)
    ).toString(),
    normalizedSong: (song, provider) => ({ ...song, provider }),
    songParams: (song, extra = {}) => new URLSearchParams({
      provider: song.provider,
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: String(song.duration || 0),
      ...extra
    }).toString(),
    apiJson: async (url) => {
      networkCalls.push(url);
      if (url.startsWith('/api/search?')) return { songs: [publicMatch] };
      if (url.startsWith('/api/song/url?')) {
        return { playable: true, url: 'https://public.example.test/audio.m4a' };
      }
      throw new Error(`unexpected URL: ${url}`);
    }
  };
  vm.runInNewContext([
    functionBlock('normalizeQishuiMatchText'),
    functionBlock('qishuiGuestMatchScore'),
    functionBlock('qishuiGuestMatchCacheKey'),
    functionBlock('qishuiGuestCandidateIsPlayable'),
    functionBlock('resolveQishuiMetadataViaGuestSearch'),
    'this.resolve = resolveQishuiMetadataViaGuestSearch;'
  ].join('\n'), context, { filename: 'qishui-guest-search.vm.js' });

  const matched = await context.resolve(sourceSong);
  assert.equal(matched.provider, 'netease');
  assert.equal(matched.id, 'public-provider-song-id');
  const searchCall = networkCalls.find((url) => url.startsWith('/api/search?'));
  assert.ok(searchCall, 'metadata click must perform a visitor search');
  const searchParams = new URLSearchParams(searchCall.split('?')[1]);
  assert.deepEqual(
    [...searchParams.keys()].sort(),
    ['limit', 'provider', 'q'],
    'visitor search must receive only query, limit, and public provider'
  );
  assert.equal(searchParams.get('q'), 'Public Title Public Artist');
  for (const forbidden of [
    sourceSong.id,
    sourceSong.album,
    sourceSong.sourceRef.providerSongId,
    sourceSong.sourceRef.accessToken,
    sourceSong.sourceRef.audioUrl
  ]) {
    assert.equal(networkCalls.some((url) => url.includes(forbidden)), false, `leaked ${forbidden}`);
  }
  assert.ok(
    networkCalls.some((url) => url.startsWith('/api/song/url?provider=netease')),
    'the matched public candidate must pass the normal playable-source probe'
  );
}

{
  const sourceSong = {
    id: 'private-local-song-id-must-not-enter-queue',
    title: 'Public Title',
    artist: 'Public Artist',
    provider: 'qishui',
    sourceRef: {
      metadataOnly: true,
      providerSongId: 'private-provider-id-must-not-enter-queue'
    }
  };
  const publicMatch = {
    id: 'public-provider-song-id',
    title: 'Public Title',
    artist: 'Public Artist',
    provider: 'netease',
    guestSearchMatched: true
  };
  const requests = [];
  const loaded = [];
  const state = {
    activePlaylistSongs: [sourceSong],
    songFocusIndex: 0,
    queue: [],
    queueIndex: -1,
    localQueueActive: false,
    currentSong: null
  };
  const button = {
    dataset: { songIndex: '0' },
    disabled: false,
    classList: fakeClassList()
  };
  const context = {
    state,
    isLocalSong: () => false,
    isQishuiMetadataSong: (song) => song?.sourceRef?.metadataOnly === true,
    resolveQishuiMetadataViaGuestSearch: async () => publicMatch,
    setSongFocus: () => {},
    apiJson: async (url, options = {}) => {
      requests.push({ url, options });
      return {};
    },
    loadSong: async (song) => {
      loaded.push(song);
      state.currentSong = song;
      return true;
    },
    transport: async () => false,
    refreshPlayerState: async () => {},
    updateShelfCurrentSong: () => {},
    closePlaylistShelf: () => {},
    toast: () => {},
    safeText: (value, fallback = '') => value || fallback
  };
  vm.runInNewContext([
    functionBlock('playShelfSong'),
    'this.play = playShelfSong;'
  ].join('\n'), context, { filename: 'qishui-shelf-playback.vm.js' });

  await context.play(button);
  const queueRequest = requests.find((request) => request.url === '/api/player/queue');
  assert.ok(queueRequest, 'matched public song must enter the normal player queue');
  const queue = JSON.parse(queueRequest.options.body);
  assert.deepEqual(queue.songs.map((song) => `${song.provider}:${song.id}`), [
    'netease:public-provider-song-id'
  ]);
  assert.equal(queue.currentIndex, 0);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].provider, 'netease');
  assert.equal(
    queueRequest.options.body.includes('private-local-song-id-must-not-enter-queue'),
    false,
    'local SodaMusic IDs must not enter the player queue'
  );
}

console.log(JSON.stringify({
  ok: true,
  checks: [
    'local SodaMusic avatar is rendered through the HTTPS proxy',
    'liked tracks and the Douyin safe summary are both visible',
    'visitor search receives title plus artist only',
    'candidate uses the normal playable-source probe',
    'only the public matched song enters the normal player queue'
  ]
}, null, 2));
