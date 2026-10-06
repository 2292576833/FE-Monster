import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const extract = name => {
  const source = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];
  assert.ok(source, `production function ${name} exists`);
  return source;
};
const constants = [
  app.match(/const PLAYBACK_QUALITY_OPTIONS = \{[^]*?\n};/)?.[0],
  app.match(/const AUDIO_SOURCE_QUALITY_OPTIONS = \[[^]*?\n];/)?.[0]
];
assert.ok(constants.every(Boolean), 'production quality tables exist');

const custom = (qualitys, provider = 'wy') => ({
  id: 'test-source', name: '测试音源', builtin: false,
  supportedProviders: [{ wy: 'netease', tx: 'qq', kg: 'kugou' }[provider]],
  capabilities: { [provider]: { actions: ['musicUrl'], qualitys } }
});
const ids = options => Array.from(options, option => option.id);

function fixture(source = { id: 'builtin', builtin: true }) {
  const element = () => ({ children: [], dataset: {}, classList: { toggle() {} },
    appendChild(child) { this.children.push(child); }, setAttribute(name, value) { this[name] = value; } });
  const state = {
    currentSong: { id: 'playing', provider: 'netease' }, activeProvider: 'netease',
    playbackQuality: 'lossless', playbackQualityPreferences: { netease: 'lossless', qq: 'flac', kugou: 'flac' },
    audioSourceSelection: source, audioSourceSelectionKnown: true, audioSourceLibraryRevision: 0,
    loginStatusByProvider: {}, searchSuggestions: { requestId: 0, cache: new Map() },
    playlistFavorite: { requestId: 0 }, qualityMenuOpen: false
  };
  const els = { dockQualityMenu: element(), dockQualityButton: element() };
  const providers = Object.fromEntries(['netease', 'qq', 'kugou', 'qishui'].map(id => [id, { id, label: id }]));
  const context = vm.createContext({ state, els, console, JSON,
    safeText: (value, fallback = '') => typeof value === 'string' && value ? value : fallback,
    providerInfo: id => providers[id || state.activeProvider], isLocalSong: () => false,
    document: { createElement: element }, clearElement: el => { el.children = []; },
    window: { clearTimeout() {} }, playbackPlaylists: () => [], cancelPlaylistRefresh() {},
    closePlaylistShelf() {}, setSearchSuggestionsOpen() {}, setPlaylistFavoriteOpen() {},
    setFavoriteLibraryOpen() {}, reconcileAudioSourceLibrary: () => [], setPlaybackPlaylistPickerOpen() {}
  });
  vm.runInContext([...constants, ...[
    'playbackQualityProvider', 'qualityDefinitions', 'audioSourceQualityOptions', 'lxPlaybackQualityType',
    'preferredPlaybackQuality', 'valueLooksVip', 'accountVipStatus', 'accountHasVip', 'providerHasPlaybackVip',
    'playbackQualityOptions', 'normalizePlaybackQuality', 'playbackQualityOption', 'updateQualityButton',
    'renderDockQualityMenu', 'onAudioSourceSelectionChanged'
  ].map(extract)].join('\n'), context);
  return { context, state, els };
}

test('a 128k-only source replaces stale lossless preference with standard on every supported platform', () => {
  for (const [provider, sourceKey, expected] of [['netease', 'wy', 'standard'], ['qq', 'tx', '128'], ['kugou', 'kg', '128']]) {
    const f = fixture(custom(['128k'], sourceKey));
    const preference = f.state.playbackQualityPreferences[provider];
    assert.deepEqual(ids(f.context.playbackQualityOptions(provider)), [expected]);
    assert.equal(f.context.normalizePlaybackQuality(provider, preference), expected);
    assert.equal(f.context.preferredPlaybackQuality(provider), preference, 'automatic fallback preserves the saved preference');
    assert.equal(f.state.playbackQualityPreferences[provider], preference);
  }
});

test('custom declared lossless and Hi-Res qualities do not depend on platform VIP login', () => {
  const f = fixture(custom(['128k', 'flac', 'flac24bit']));
  assert.equal(f.context.providerHasPlaybackVip('netease'), false);
  assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), ['standard', 'lossless', 'hires']);
  assert.equal(f.context.normalizePlaybackQuality('netease', 'flac'), 'lossless');
  assert.equal(f.context.normalizePlaybackQuality('netease', 'flac24bit'), 'hires');
});

test('builtin and pending source state retain platform VIP filtering', () => {
  for (const source of [{ id: 'builtin', builtin: true }, null]) {
    const f = fixture(source);
    assert.equal(f.context.audioSourceQualityOptions('netease'), null);
    assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), ['standard', 'higher']);
    assert.equal(f.context.normalizePlaybackQuality('netease', 'lossless'), 'standard');
    f.state.loginStatusByProvider.netease = { loggedIn: true, vipStatus: 'active' };
    assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), ['standard', 'higher', 'exhigh', 'lossless', 'hires']);
    assert.equal(f.context.normalizePlaybackQuality('netease', 'lossless'), 'lossless');
  }
});

test('unsupported providers, actions, and malformed quality declarations expose no custom qualities', () => {
  const f = fixture(custom(['128k']));
  assert.deepEqual(ids(f.context.playbackQualityOptions('qq')), []);
  f.state.audioSourceSelection.capabilities.wy.actions = ['lyric'];
  assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), []);
  f.state.audioSourceSelection.capabilities.wy = { actions: ['musicUrl'], qualitys: '128k' };
  assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), []);
  f.state.audioSourceSelection.capabilities.wy.qualitys = ['unknown-quality'];
  assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), []);
});

test('custom quality negotiation chooses the closest supported lower rank or the lowest available', () => {
  const f = fixture(custom(['128k', '320k']));
  assert.equal(f.context.normalizePlaybackQuality('netease', 'hires'), 'exhigh');
  assert.equal(f.context.normalizePlaybackQuality('netease', 'higher'), 'standard');
  f.state.audioSourceSelection = custom(['320k', 'flac']);
  assert.equal(f.context.normalizePlaybackQuality('netease', 'standard'), 'exhigh');
  assert.equal(f.context.normalizePlaybackQuality('netease', 'unrecognized'), 'exhigh');
});

test('WAV and APE remain exact when declared, and share the lossless fallback rank', () => {
  const f = fixture(custom(['128k', 'flac', 'wav', 'ape']));
  assert.equal(f.context.normalizePlaybackQuality('netease', 'wav'), 'wav');
  assert.equal(f.context.normalizePlaybackQuality('netease', 'ape'), 'ape');
  assert.equal(f.context.normalizePlaybackQuality('netease', 'hires'), 'lossless');
  f.state.audioSourceSelection = custom(['wav', 'ape']);
  assert.equal(f.context.normalizePlaybackQuality('netease', 'lossless'), 'wav');
});

test('qishui keeps its existing full-source path even with a selected LX source', () => {
  const f = fixture(custom(['128k']));
  assert.equal(f.context.audioSourceQualityOptions('qishui'), null);
  assert.deepEqual(ids(f.context.playbackQualityOptions('qishui')), ['full']);
  assert.equal(f.context.normalizePlaybackQuality('qishui', 'lossless'), 'full');
});

test('switching source capabilities immediately rebuilds the menu without changing current song or saved quality', () => {
  const f = fixture();
  const song = f.state.currentSong;
  f.context.onAudioSourceSelectionChanged(custom(['128k']));
  assert.deepEqual(f.els.dockQualityMenu.children.map(child => child.dataset.quality), ['standard']);
  assert.equal(f.els.dockQualityMenu.children[0]['aria-checked'], 'true');
  assert.equal(f.els.dockQualityButton.dataset.quality, 'STD');
  const source = custom(['128k', 'flac']);
  f.context.onAudioSourceSelectionChanged(source);
  assert.deepEqual(f.els.dockQualityMenu.children.map(child => child.dataset.quality), ['standard', 'lossless']);
  assert.equal(f.els.dockQualityMenu.children[1]['aria-checked'], 'true');
  assert.equal(f.els.dockQualityButton.dataset.quality, 'SQ');
  source.capabilities.wy.qualitys.length = 0;
  assert.deepEqual(ids(f.context.playbackQualityOptions('netease')), ['standard', 'lossless'], 'selection keeps a defensive capability snapshot');
  assert.equal(f.state.currentSong, song);
  assert.equal(f.state.playbackQualityPreferences.netease, 'lossless');
  assert.equal(f.state.playbackQuality, 'lossless');
});
