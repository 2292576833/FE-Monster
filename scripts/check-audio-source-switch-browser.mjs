import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is installed');
const out = path.join(root, 'output/playwright/audio-source-switch');
mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const source = (id, name, supportedProviders) => ({ id, name, supportedProviders, capabilities: Object.fromEntries(supportedProviders.map(provider => [{ netease: 'wy', qq: 'tx', kugou: 'kg' }[provider], { actions: ['musicUrl'], qualitys: ['128k'] }])) });
const custom = [source('qq-a', 'QQ 音源 A', ['qq']), source('netease-b', '网易音源 B', ['netease']), source('qq-b', 'QQ 音源 B', ['qq']), source('multi', '双平台音源', ['netease', 'qq']), source('unconfigured', '未配置平台音源', ['kugou'])];
let selected = 'builtin';
let failSelect = '';
const requests = [];
const gates = [];
const gate = (sourceId, kind) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const entry = { sourceId, kind, hits: 0, pending, release };
  gates.push(entry);
  return entry;
};
const payload = () => ({ ok: true, selected, runtimeReady: true, custom, builtins: [] });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/app/preferences/bootstrap.js') {
    res.setHeader('Content-Type', 'application/javascript'); res.end(''); return;
  }
  if (pathname.startsWith('/api/')) {
    requests.push({ pathname, selected, method: req.method });
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/audio-sources/select') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const id = JSON.parse(raw).id;
      if (id === failSelect) { res.writeHead(503); res.end(JSON.stringify({ ok: false, error: 'AUDIO_SOURCE_RUNTIME_UNAVAILABLE', message: '测试音源切换失败' })); return; }
      assert.ok(id === 'builtin' || custom.some(item => item.id === id));
      selected = id; res.end(JSON.stringify(payload())); return;
    }
    const fixtures = {
      '/api/music-apis': { ok: true, providers: ['netease', 'qq', 'kugou'].map(id => ({ id, enabled: id !== 'kugou', configured: id !== 'kugou', apiStatus: id === 'kugou' ? 'missing' : 'ready' })) },
      '/api/audio-sources': payload(),
      '/api/user-cursors': { ok: true, cursors: [] },
      '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
      '/api/player/state': { ok: true, playing: false, paused: true, volume: .8, position: 0, duration: 0, queue: [], queueLength: 0, queueRevision: 0, queueIndex: -1 },
      '/api/player/queue': { ok: true, queueLength: 6, queueRevision: 1 },
      '/api/visual-bridge/state': { ok: true, audio: {} }, '/api/sandbox/presets': { ok: true, presets: [] }, '/api/sandbox/components': { ok: true, components: [] },
      '/api/community/status': { ok: true, authenticated: false }, '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
    };
    let result = fixtures[pathname] || { ok: true };
    const provider = url.searchParams.get('provider') || pathname.split('/')[2];
    const requestSource = selected;
    const kind = pathname.endsWith('/playlist/tracks') ? 'tracks' : pathname.endsWith('/playlists') ? 'catalog' : '';
    if (kind === 'catalog') result = { ok: true, loggedIn: true, playlists: [
      { id: `${provider}-list`, name: `${requestSource} · ${provider} 歌单`, provider, trackCount: 6 },
      { id: 'foreign-list', name: '不应显示的其他平台歌单', provider: provider === 'qq' ? 'netease' : 'qq', trackCount: 6 },
      { id: 'foreign-local', name: '不应显示的本地歌单', provider: 'local', local: true, trackCount: 6 }
    ] };
    if (kind === 'tracks') result = { ok: true, songs: [
      ...Array.from({ length: 6 }, (_, index) => ({ id: `${requestSource}-${provider}-song-${index}`, title: `${requestSource} · ${provider} 歌曲 ${index}`, artist: '测试夹具', provider, duration: 180, sourceRef: { songmid: `${requestSource}-mid-${index}` } })),
      { id: 'foreign-song', title: '不应显示的其他平台歌曲', provider: provider === 'qq' ? 'netease' : 'qq' },
      { id: 'foreign-local-song', title: '不应显示的本地歌曲', provider: 'local', local: true }
    ] };
    const blocked = gates.find(entry => entry.sourceId === requestSource && entry.kind === kind && !entry.released);
    if (blocked) { blocked.hits += 1; await blocked.pending; }
    res.end(JSON.stringify(result)); return;
  }
  const file = path.resolve(pathname.startsWith('/components/') ? root : web, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}), args: ['--mute-audio', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  // Deliberately emulate a transport which delivers a response despite abort.
  // This exercises the actual app's source revision guards, not only fetch cancellation.
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.__deliveredCatalogResponses = 0;
    window.fetch = async (input, options) => {
      const pathname = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
      const catalog = /\/(?:playlists|playlist\/tracks)$/.test(pathname);
      const response = await originalFetch(input, catalog && window.__nonAbortable ? { ...options, signal: undefined } : options);
      if (catalog) window.__deliveredCatalogResponses += 1;
      return response;
    };
  });
  async function boot() {
    await page.waitForSelector('#bootLogoButton');
    if (await page.locator('#bootLogoButton').isVisible()) await page.locator('#bootLogoButton').click();
    await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden && typeof browseAudioSourceLibrary === 'function' && state.audioSourceSelectionKnown, null, { timeout: 30000 });
    // Keep source management, catalog requests, rendering and event handlers real.
    await page.evaluate(() => { window.__played = []; loadSong = async song => { state.currentSong = song; window.__played.push(song); return true; }; refreshPlayerState = async () => ({}); });
  }
  async function manager() {
    await page.evaluate(() => showLoginDialog());
    await page.click('#audioSourceManagerButton');
    try {
      await page.waitForFunction(() => !document.getElementById('audioSourceBrowse').disabled);
    } catch (error) {
      console.error('Manager readiness failure', await page.evaluate(() => ({ source: state.audioSourceSelection, activeProvider: state.activeProvider, loading: state.playlistsLoading, status: document.getElementById('audioSourceLiveStatus').textContent, busy: document.getElementById('audioSourceBusy').textContent })), requests.slice(-15));
      await page.screenshot({ path: path.join(out, 'failure.png') });
      throw error;
    }
  }
  const useButton = id => id === 'builtin' ? page.locator('#audioSourceSelectBuiltin') : page.locator(`.audio-source-card[data-source-id="${id}"] [data-selected-action]`);
  async function use(id) {
    await manager(); await useButton(id).click();
    await page.waitForFunction(id => state.audioSourceSelection?.id === id && document.getElementById('audioSourceDialog').hidden, id);
  }
  async function catalog(id, provider) {
    await page.waitForFunction(({ id, provider }) => state.audioSourceSelection?.id === id && state.activeProvider === provider && !state.playlistsLoading && document.querySelector(`#orbPlaylistCards [data-playlist-id="${provider}-list"]`)?.textContent.includes(`${id} ·`), { id, provider });
    const cards = await page.locator('#orbPlaylistCards [data-playlist-id]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.playlistId, provider: node.dataset.playlistProvider, source: node.dataset.audioSourceId, text: node.textContent })));
    assert.ok(cards.length > 0);
    if (id !== 'builtin') assert.ok(cards.every(card => card.provider === provider && card.source === id), JSON.stringify(cards));
    assert.equal(cards.some(card => card.id.startsWith('foreign-')), false, 'foreign provider payloads are filtered');
    assert.equal(cards.some(card => card.id === 'local-import'), id === 'builtin', 'local catalog appears only with builtin source');
    return cards;
  }
  async function songs(id, provider) {
    await page.locator(`#orbPlaylistCards [data-playlist-id="${provider}-list"]`).click();
    await page.waitForSelector(`#playlistSongStack [data-song-id="${id}-${provider}-song-0"]`);
    assert.deepEqual(await page.evaluate(() => state.activePlaylistSongs.map(song => song.provider)), Array(6).fill(provider));
    assert.equal(await page.locator('#playlistSongStack [data-song-id^="foreign-"]').count(), 0);
  }
  async function assertCleared() {
    assert.equal(await page.locator('#playlistSongStack .shelf-song-button, #playlistSongStackBack .shelf-song-button').count(), 0, 'source switch clears both song faces immediately');
    assert.equal(await page.evaluate(() => state.activePlaylistSongs.length), 0);
    assert.equal(await page.locator('#playlistShelf').isHidden(), true);
  }
  const release = entry => { entry.released = true; entry.release(); };
  const waitHit = async entry => { for (let i = 0; i < 100 && !entry.hits; i += 1) await page.waitForTimeout(25); assert.ok(entry.hits, `delayed ${entry.kind} request reached fixture`); };

  await page.goto(origin); await boot();
  await manager(); await page.click('#audioSourceBrowse'); await catalog('builtin', 'netease');
  await use('qq-a'); await catalog('qq-a', 'qq'); await songs('qq-a', 'qq');
  await page.screenshot({ path: path.join(out, '01-qq-only-songs.png') });

  const beforeFailure = await page.evaluate(() => ({ source: state.audioSourceSelection.id, provider: state.activeProvider, songs: state.activePlaylistSongs.map(song => song.id), title: document.getElementById('playlistShelfTitle').textContent }));
  failSelect = 'netease-b'; await manager(); await useButton('netease-b').click();
  await page.waitForFunction(() => document.getElementById('audioSourceLiveStatus').dataset.kind === 'error');
  assert.deepEqual(await page.evaluate(() => ({ source: state.audioSourceSelection.id, provider: state.activeProvider, songs: state.activePlaylistSongs.map(song => song.id), title: document.getElementById('playlistShelfTitle').textContent })), beforeFailure, 'failed selection preserves prior source and shelf');
  assert.equal(await page.locator('#audioSourceDialog').isVisible(), true);
  failSelect = '';
  const switching = gate('netease-b', 'catalog'); await useButton('netease-b').click(); await waitHit(switching);
  await page.waitForFunction(() => state.audioSourceSelection?.id === 'netease-b'); await assertCleared();
  assert.equal(await page.locator('#orbPlaylistCards [data-playlist-provider="qq"], #orbPlaylistCards [data-playlist-id="local-import"]').count(), 0);
  release(switching); await page.waitForFunction(() => document.getElementById('audioSourceDialog').hidden); await catalog('netease-b', 'netease'); await songs('netease-b', 'netease');
  await use('builtin'); await catalog('builtin', 'netease'); await assertCleared();

  await use('qq-a'); await catalog('qq-a', 'qq');
  await page.evaluate(() => { window.__nonAbortable = true; });
  const oldTracks = gate('qq-a', 'tracks');
  await page.locator('#orbPlaylistCards [data-playlist-id="qq-list"]').click(); await waitHit(oldTracks);
  await use('qq-b'); await catalog('qq-b', 'qq'); await assertCleared();
  let delivered = await page.evaluate(() => window.__deliveredCatalogResponses);
  release(oldTracks); await page.waitForFunction(count => window.__deliveredCatalogResponses > count, delivered); await page.waitForTimeout(100); await assertCleared();
  await songs('qq-b', 'qq');
  assert.equal(await page.locator('#playlistSongStack [data-song-id^="qq-a-"]').count(), 0, 'late tracks from same provider and old source cannot repopulate shelf');
  await page.click('#playlistShelfBack');
  await manager();
  const oldCatalog = gate('qq-b', 'catalog');
  await page.evaluate(() => { window.__pendingRefresh = refreshUserPlaylists({ force: true }); }); await waitHit(oldCatalog);
  await useButton('qq-a').click();
  await page.waitForFunction(() => state.audioSourceSelection?.id === 'qq-a' && document.getElementById('audioSourceDialog').hidden);
  await catalog('qq-a', 'qq');
  delivered = await page.evaluate(() => window.__deliveredCatalogResponses);
  release(oldCatalog); await page.waitForFunction(count => window.__deliveredCatalogResponses >= count + 2, delivered); await page.evaluate(() => window.__pendingRefresh); await catalog('qq-a', 'qq');
  assert.equal(await page.locator('#orbPlaylistCards').textContent().then(text => text.includes('qq-b ·')), false, 'late same-provider catalog cannot replace current source catalog');

  await use('multi'); await catalog('multi', 'qq');
  await manager();
  assert.deepEqual(await page.locator('#audioSourceLibraryProvider option').evaluateAll(nodes => nodes.map(node => node.value)), ['netease', 'qq']);
  await page.selectOption('#audioSourceLibraryProvider', 'netease');
  await page.waitForFunction(() => state.activeProvider === 'netease' && !state.playlistsLoading);
  if (await page.locator('#audioSourceDialog').isVisible()) await page.click('#audioSourceBrowse');
  await catalog('multi', 'netease');
  await page.screenshot({ path: path.join(out, '02-multi-platform-switch.png') });
  await page.reload(); await boot();
  assert.equal(await page.evaluate(() => state.audioSourceSelection.id), 'multi');
  assert.equal(await page.evaluate(() => state.activeProvider), 'netease', 'manager platform selection survives reload');
  await manager(); await useButton('multi').click(); await page.waitForFunction(() => document.getElementById('audioSourceDialog').hidden); await catalog('multi', 'netease');

  await songs('multi', 'netease'); await use('unconfigured'); await assertCleared();
  await page.waitForSelector('#orbPlaylistCards .audio-source-library-empty');
  assert.equal(await page.locator('#orbPlaylistCards [data-playlist-id]').count(), 0, 'unconfigured supported platform leaks no local or old catalog');
  assert.match(await page.locator('#orbPlaylistCards .audio-source-library-empty').textContent(), /配置|可用平台/);
  await page.screenshot({ path: path.join(out, '03-unconfigured-empty.png') });
  await use('builtin'); await catalog('builtin', 'netease');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ ok: true, checks: ['direct manager selection', 'automatic supported platform', 'local and foreign catalog isolation', 'song provider isolation', 'selection failure preserves view', 'immediate two-face shelf reset', 'same-provider stale tracks rejected despite non-abortable transport', 'same-provider stale catalog rejected despite non-abortable transport', 'builtin restores local', 'manager platform switch', 'source/platform restored after reload', 'unconfigured platform explicit empty state'], requestCount: requests.length, errors }, null, 2));
  console.log('PASS actual app: direct source selection, scoped catalogs/songs, failure preservation, immediate reset, stale same-provider responses, builtin restoration, manager platform switch, reload and unconfigured empty state.');
} finally {
  for (const entry of gates) entry.release();
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
