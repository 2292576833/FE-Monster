import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const extract = (name) => app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0] || '';
const drain = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
function fixture() {
  const requests = [];
  const calls = [];
  const element = () => ({ textContent: '', value: '', hidden: false, disabled: false, dataset: {}, children: [],
    replaceChildren(...children) { this.children = children; }, appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this[name] = value; }, focus() { calls.push('focus'); } });
  const providers = Object.fromEntries(['netease', 'qq', 'kugou', 'qishui'].map(id => [id, { id, label: id, enabled: true, configured: true }]));
  const state = { activeProvider: 'netease', providers, userPlaylists: [], recommendedPlaylists: [],
    playlistsLoading: false, playlistsLoggedIn: false, playlistRefreshRequestId: 0, playlistRefreshAbortController: null,
    playlistRefreshError: '', audioSourceSelection: { id: 'builtin', name: '内置音源', builtin: true }, audioSourceSelectionKnown: true, audioSourceLibraryRevision: 0,
    searchSuggestions: { songs: [], query: '', requestId: 0, cache: new Map() },
    playlistFavorite: { requestId: 0, loading: false, playlistsByProvider: {}, loadedAtByProvider: {} },
    currentSong: { id: 'playing' }, diyPreset: 'harmonic-state', playbackPage: false, playbackPlaylistPickerOpen: false };
  const els = { playlistCards: element(), loginDialog: { hidden: true } };
  let context;
  const env = { state, els, MUSIC_PROVIDERS: providers, LOCAL_PLAYLIST_ID: 'local', AbortController, console,
    document: { hidden: false, createElement: element }, COMMUNITY_API_TIMEOUT_MS: 1000,
    window: { clearTimeout() {}, feAudioSources: { getSelectedSource: () => state.audioSourceSelection, refresh: async () => calls.push('source-refresh') } },
    safeText: (value, fallback = '') => typeof value === 'string' && value ? value : fallback,
    providerInfo: id => state.providers[id || state.activeProvider], providerConfigured: id => state.providers[id || state.activeProvider]?.configured === true,
    localPlaylistDescriptor: () => ({ id: 'local', local: true, provider: 'local' }),
    closePlaylistShelf: () => { calls.push('close-shelf'); state.activePlaylist = null; state.activePlaylistSongs = []; },
    setSearchSuggestionsOpen() {}, setPlaylistFavoriteOpen() {}, setFavoriteLibraryOpen() {},
    renderPlaylistOrbit: () => calls.push('render'),
    renderDockQualityMenu: () => calls.push('quality-menu'),
    toast: message => calls.push(`toast:${message}`),
    providerPath: (path, provider) => `/api/${provider}${path}`, query: args => new URLSearchParams(args).toString(),
    recordPlaylistSnapshotMemory: () => calls.push('snapshot'),
    setActiveProvider: id => { calls.push(`provider:${id}`); if (id !== state.activeProvider) {
      context.cancelPlaylistRefresh?.(); state.activeProvider = id; state.playbackPlaylistPickerOpen = false;
    } return true; },
    closeLoginDialog: () => calls.push('close-login'),
    enterPlaybackPage: () => { calls.push('playback-page'); state.playbackPage = true; },
    setPlaybackPlaylistPickerOpen: value => { calls.push(`picker:${value}`); state.playbackPlaylistPickerOpen = value; },
    apiJson: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
  };
  context = vm.createContext(env);
  vm.runInContext(['cancelPlaylistRefresh', 'audioSourceLibraryProviders', 'audioSourceLibraryAllows', 'audioSourceLibrarySongs', 'playbackPlaylists',
    'reconcileAudioSourceLibrary', 'onAudioSourceSelectionChanged',
    'browseAudioSourceLibrary', 'refreshUserPlaylists'].map(extract).join('\n'), context);
  return { context, state, requests, calls, els, providers };
}
const reply = (requests, offset, id) => {
  requests[offset].resolve({ loggedIn: true, playlists: [{ id: `${id}-mine` }] });
  requests[offset + 1].resolve({ playlists: [{ id: `${id}-recommended` }] });
};

test('forced platform refresh supersedes an in-flight request, even when aborted response arrives late', async () => {
  const f = fixture();
  const old = f.context.refreshUserPlaylists({ force: true });
  f.state.activeProvider = 'qq';
  const latest = f.context.refreshUserPlaylists({ force: true });
  assert.equal(f.requests.length, 4, 'new platform must start immediately instead of being dropped by global loading');
  assert.equal(f.requests[0].options.signal.aborted, true);
  reply(f.requests, 0, 'old'); await old;
  assert.equal(f.state.playlistsLoading, true, 'old finally must not clear the latest loading state');
  reply(f.requests, 2, 'new'); await latest;
  assert.equal(f.state.userPlaylists[0].id, 'new-mine');
  assert.equal(f.state.userPlaylists[0].provider, 'qq');
  assert.equal(f.state.playlistsLoading, false);
  assert.equal(f.state.playlistRefreshAbortController, null);
});

test('same-provider source change invalidates stale results and preserves playing song and preset', async () => {
  const f = fixture(); const playing = f.state.currentSong;
  const old = f.context.refreshUserPlaylists({ force: true });
  const latest = f.context.onAudioSourceSelectionChanged({ id: 'lx', name: '<source>', supportedProviders: ['netease', 'qq'] });
  assert.equal(f.requests.length, 4);
  reply(f.requests, 2, 'selected'); await latest;
  reply(f.requests, 0, 'stale'); await old;
  assert.equal(f.state.userPlaylists[0].id, 'selected-mine');
  assert.equal(f.state.currentSong, playing);
  assert.equal(f.state.diyPreset, 'harmonic-state');
  assert.equal(f.state.audioSourceSelection.name, '<source>');
});

test('source restoration selects a supported configured platform and preserves an open picker', async () => {
  const f = fixture(); f.state.playbackPlaylistPickerOpen = true; f.state.playbackPage = true;
  f.providers.kugou.configured = false;
  const pending = f.context.onAudioSourceSelectionChanged({ id: 'restored', name: 'Restored', supportedProviders: ['kugou', 'qq', 'unknown', 'qq'] });
  assert.equal(f.state.activeProvider, 'qq');
  assert.equal(f.state.playbackPlaylistPickerOpen, true);
  assert.deepEqual(Array.from(f.context.audioSourceLibraryProviders()), ['kugou', 'qq']);
  assert.equal(f.requests.length, 2, 'supported configured platform starts loading immediately');
  reply(f.requests, 0, 'qq');
  await pending;
  assert.equal(f.context.playbackPlaylists().every(playlist => playlist.provider === 'qq'), true);
});

test('no supported configured platform exposes an empty source library without local songs', async () => {
  const f = fixture(); f.providers.qq.configured = false;
  await f.context.onAudioSourceSelectionChanged({ id: 'only-qq', name: 'QQ Source', supportedProviders: ['qq'] });
  assert.equal(f.requests.length, 0);
  assert.equal(f.state.activeProvider, 'netease', 'do not switch to an unavailable API');
  assert.equal(f.state.userPlaylists.length, 0);
  assert.equal(f.context.playbackPlaylists().length, 0);
  assert.match(f.state.playlistRefreshError, /音源管理|配置/);
  await f.context.onAudioSourceSelectionChanged({ id: 'unknown', name: 'Unknown', supportedProviders: ['not-a-platform'] });
  assert.deepEqual(Array.from(f.context.audioSourceLibraryProviders()), []);
  await f.context.onAudioSourceSelectionChanged(null);
  assert.equal(f.state.audioSourceSelection, null);
});

test('scoped catalogs hide local, foreign-provider and previous-source entries, and builtin restores local', () => {
  const f = fixture();
  f.state.audioSourceSelection = { id: 'source-b', supportedProviders: ['netease', 'qq'] };
  f.state.userPlaylists = [
    { id: 'current', provider: 'netease', audioSourceId: 'source-b' },
    { id: 'old-source', provider: 'netease', audioSourceId: 'source-a' },
    { id: 'other-platform', provider: 'qq', audioSourceId: 'source-b' }
  ];
  assert.deepEqual(Array.from(f.context.playbackPlaylists(), playlist => playlist.id), ['current']);
  f.state.audioSourceSelection = { id: 'builtin', builtin: true };
  assert.equal(f.context.playbackPlaylists()[0].id, 'local');
  assert.deepEqual(Array.from(f.context.audioSourceLibrarySongs([{ id: 'a' }, { id: 'b', provider: 'qq' }], 'netease'), song => `${song.id}:${song.provider}`), ['a:netease']);
});

test('a late favorite-target response cannot replace the newly selected source catalog', async () => {
  const f = fixture();
  Object.assign(f.context, { favoriteTargetPlaylists: () => [], normalizePlatformPlaylist: value => value,
    renderPlaylistFavoritePopover() {}, PLAYLIST_FAVORITE_CACHE_MS: 1000 });
  vm.runInContext(extract('loadFavoriteTargetPlaylists'), f.context);
  const old = f.context.loadFavoriteTargetPlaylists('netease', true);
  f.state.audioSourceLibraryRevision += 1;
  f.state.audioSourceSelection = { id: 'new', supportedProviders: ['netease'] };
  f.state.userPlaylists = [{ id: 'new-list', provider: 'netease', audioSourceId: 'new' }];
  const current = f.context.loadFavoriteTargetPlaylists('netease', true);
  f.requests[0].resolve({ playlists: [{ id: 'old-list' }] }); await old;
  assert.equal(f.state.userPlaylists[0].id, 'new-list');
  assert.equal(f.state.playlistFavorite.loading, true, 'old finally cannot clear the newer loading flag');
  f.requests[1].resolve({ playlists: [{ id: 'current-list' }] }); await current;
  assert.equal(f.state.userPlaylists[0].audioSourceId, 'new');
  assert.equal(f.state.userPlaylists[0].provider, 'netease');
});

test('a queued click cannot start its old song when a source switch occurs before queue reply', async () => {
  const f = fixture(), loaded = [];
  Object.assign(f.context, { clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isLocalSong: () => false, isQishuiMetadataSong: () => false, loadSong: async song => { loaded.push(song); return true; } });
  vm.runInContext(extract('playPlaylistTracks'), f.context);
  const pending = f.context.playPlaylistTracks({ id: 'playlist', provider: 'netease', audioSourceId: 'builtin' }, [{ id: 'old-song', provider: 'netease' }]);
  const rejected = assert.rejects(pending, /音源已切换/);
  assert.equal(f.requests.length, 1);
  f.state.audioSourceLibraryRevision += 1;
  f.state.audioSourceSelection = { id: 'new', supportedProviders: ['netease'] };
  f.requests[0].resolve({ queueLength: 1 }); await rejected;
  assert.equal(loaded.length, 0);
  assert.equal(f.state.currentSong.id, 'playing');
});

test('successive login platform choices refresh the same playlist area and latest result wins', async () => {
  const f = fixture();
  f.state.audioSourceSelectionKnown = true;
  f.state.audioSourceSelection = { id: 'multi', name: 'Multi', supportedProviders: ['netease', 'qq'] };
  f.context.setActiveProvider('qq');
  const first = f.context.refreshUserPlaylists({ force: true });
  f.context.setActiveProvider('netease');
  const last = f.context.refreshUserPlaylists({ force: true });
  reply(f.requests, 2, 'netease'); await last;
  reply(f.requests, 0, 'qq'); await first;
  assert.equal(f.state.userPlaylists[0].id, 'netease-mine');
});

test('partial failure retains available platform results and provides retry state', async () => {
  const f = fixture(); const pending = f.context.refreshUserPlaylists({ force: true });
  f.requests[0].reject(new Error('offline'));
  f.requests[1].resolve({ playlists: [{ id: 'recommendation' }] }); await pending;
  assert.equal(f.state.recommendedPlaylists[0].id, 'recommendation');
  assert.match(f.state.playlistRefreshError, /部分|重试/);
  const retry = f.context.refreshUserPlaylists({ force: true });
  reply(f.requests, 2, 'retry'); await retry;
  assert.equal(f.state.playlistRefreshError, '');
});

test('browse opens the existing playlist picker without selecting a preset or starting playback', () => {
  const f = fixture(); f.context.browseAudioSourceLibrary();
  assert.deepEqual(f.calls.filter(item => item !== 'render'), ['close-login', 'playback-page', 'picker:true', 'focus']);
  assert.equal(f.state.currentSong.id, 'playing'); assert.equal(f.state.diyPreset, 'harmonic-state');
});

test('actual existing platform switch invalidates pending catalog work without changing media or preset', async () => {
  const f = fixture(); const playing = f.state.currentSong;
  Object.assign(f.state, { loginStatusByProvider: {}, playbackQuality: 'old' });
  Object.assign(f.context, {
    loginProviderVisible: () => true, clearOfficialBrowserLoginTimer() {}, saveActiveProviderPreference() {},
    OFFICIAL_BROWSER_LOGIN_PROVIDERS: new Set(), ANDROID_CLIENT: false, bootVisual: { servicesStarted: false },
    syncBrowserLoginSurface() {}, syncMusicApiProviderTabs() {}, preferredPlaybackQuality: () => '128k',
    closePlaylistShelf() {}, setSearchSuggestionsOpen() {}, setFavoriteLibraryOpen() {}, setPlaylistFavoriteOpen() {},
    setDockQualityMenuOpen() {}, stopCommunityEventStream() {}, syncQishuiPlaybackCard() {}
  });
  vm.runInContext(extract('setActiveProvider'), f.context);
  const old = f.context.refreshUserPlaylists({ force: true });
  f.state.playlistFavorite.loading = true;
  const previousFavoriteRequest = f.state.playlistFavorite.requestId;
  assert.equal(f.context.setActiveProvider('qq'), true);
  assert.equal(f.state.playlistFavorite.loading, false);
  assert.equal(f.state.playlistFavorite.requestId, previousFavoriteRequest + 1);
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(f.state.playlistsLoading, false);
  const latest = f.context.refreshUserPlaylists();
  reply(f.requests, 2, 'qq'); await latest;
  reply(f.requests, 0, 'old'); await old;
  assert.equal(f.state.userPlaylists[0].provider, 'qq');
  assert.equal(f.state.currentSong, playing); assert.equal(f.state.diyPreset, 'harmonic-state');
});

test('API configuration restoration respects the platform previously chosen on the login page', async () => {
  const f = fixture();
  f.state.activeProvider = 'qq';
  for (const provider of Object.values(f.providers)) provider.configured = false;
  await f.context.onAudioSourceSelectionChanged({ id: 'restored', name: 'Restored', supportedProviders: ['qq'] });
  assert.equal(f.requests.length, 0);
  Object.assign(f.context, { syncMusicApiProviderTabs() {}, loginProviderVisible: () => true });
  vm.runInContext(extract('mergeMusicApiProviders'), f.context);
  f.context.mergeMusicApiProviders({ providers: [{ id: 'qq', enabled: true, configured: true }] });
  assert.equal(f.state.activeProvider, 'qq'); assert.equal(f.requests.length, 2);
  reply(f.requests, 0, 'restored'); await drain();
  assert.equal(f.state.userPlaylists[0].id, 'restored-mine');
  assert.equal(f.state.providers.qq.configured, true);
});

test('background API configuration cannot silently switch the active platform', async () => {
  const f = fixture(); f.state.audioSourceSelectionKnown = false;
  Object.assign(f.context, { syncMusicApiProviderTabs() {}, loginProviderVisible: provider => provider?.configured === true });
  vm.runInContext(extract('mergeMusicApiProviders'), f.context);
  f.context.mergeMusicApiProviders({ providers: [{ id: 'qq', enabled: true, configured: true }] });
  assert.equal(f.state.activeProvider, 'netease');
  assert.equal(f.calls.some(call => call.startsWith('provider:')), false);
});

test('API configuration fallback remains available while the login page is visible', () => {
  const f = fixture(); f.state.audioSourceSelectionKnown = false; f.els.loginDialog.hidden = false;
  Object.assign(f.context, { syncMusicApiProviderTabs() {}, loginProviderVisible: provider => provider?.configured === true });
  vm.runInContext(extract('mergeMusicApiProviders'), f.context);
  f.context.mergeMusicApiProviders({ providers: [{ id: 'qq', enabled: true, configured: true }] });
  assert.equal(f.state.activeProvider, 'qq');
});

for (const scenario of [
  { name: 'background import preserves platform', visible: false, expected: 'netease' },
  { name: 'login import may select imported platform', visible: true, expected: 'qq' },
  { name: 'login closed before import completes preserves platform', visible: true, closeDuringImport: true, expected: 'netease' },
  { name: 'source-manager package bridge preserves its explicit import preference', visible: true, preserve: true, expected: 'netease' }
]) test(scenario.name, async () => {
  const f = fixture(); f.els.loginDialog.hidden = !scenario.visible;
  const inspection = { packageType: 'json', providers: [{ id: 'qq', label: 'QQ' }] };
  f.context.window.feMusicApiPackageClient = { inspect: async () => inspection };
  Object.assign(f.context, {
    setMusicApiImportStatus() {}, normalizeMusicApiClientInspection: value => value,
    assertMusicApiApplyMatches() {}, mergeMusicApiProviders() {}, refreshMusicApiProviders: async () => ({ ok: true })
  });
  vm.runInContext(extract('importMusicApiFile'), f.context);
  const pending = f.context.importMusicApiFile({ name: 'fixture.json', type: 'application/json', size: 2 }, { preserveActiveProvider: scenario.preserve });
  await drain();
  if (scenario.closeDuringImport) f.els.loginDialog.hidden = true;
  f.requests[0].resolve({ ok: true, importedProviders: ['qq'] });
  assert.equal((await pending).ok, true);
  assert.equal(f.state.activeProvider, scenario.expected);
});

test('unsupported-source warning does not repeat during unchanged background refreshes', async () => {
  const f = fixture();
  f.providers.qq.configured = false;
  await f.context.onAudioSourceSelectionChanged({ id: 'qq-only', name: 'QQ only', supportedProviders: ['qq'] });
  await f.context.refreshUserPlaylists({ force: true });
  assert.equal(f.calls.filter(call => call.startsWith('toast:')).length, 1);
  assert.equal(f.state.activeProvider, 'netease');
});

test('repeat source notifications do not restart a live refresh; hidden periodic work stays dormant', async () => {
  const f = fixture(); const source = { id: 'multi', name: 'Multi', supportedProviders: ['qq'] };
  f.state.activeProvider = 'qq';
  const pending = f.context.onAudioSourceSelectionChanged(source);
  f.context.onAudioSourceSelectionChanged(source);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].options.signal.aborted, false);
  reply(f.requests, 0, 'qq'); await pending;
  f.context.document.hidden = true;
  await f.context.refreshUserPlaylists();
  assert.equal(f.requests.length, 2);
});

test('playlist area has no source controls and login page retains source and platform selection', () => {
  const start = html.indexOf('id="orbPlaylists"'); const end = html.indexOf('</section>', start);
  assert.equal(html.slice(start, end).includes('playlistSource'), false);
  assert.equal(html.includes('audio-source-library.css'), false);
  assert.equal(app.includes('selectAudioSourceLibraryProvider'), false);
  assert.equal(app.includes('playlistSourceManage'), false);
  assert.ok(html.includes('id="audioSourceManagerButton"'));
  assert.ok(html.includes('id="loginProviderTabs"'));
  assert.match(app, /onSelectionChanged:\s*onAudioSourceSelectionChanged/);
  assert.match(app, /onBrowseRequested:\s*browseAudioSourceLibrary/);
  assert.match(extract('init'), /feAudioSources\?\.refresh\?\.\(/);
  assert.match(extract('bindEvents'), /loadPlaylistFromCard\(card\)/);
  assert.match(extract('loadPlaylistFromCard'), /renderPlaylistShelf\(playlist, songs\)/);
  assert.match(extract('playShelfSong'), /playPlaylistTracks/);
});
