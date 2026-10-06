import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), web = path.join(root, 'web');
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of ['playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Local browser runtime required; no download is attempted.');
const output = path.join(root, 'output/playwright/lx-playlists');
mkdirSync(output, { recursive: true });
const source = { id: 'fixture-source', name: '离线测试音源', supportedProviders: ['netease', 'qq'], capabilities: {
  wy: { actions: ['musicUrl'], qualitys: ['128k'] }, tx: { actions: ['musicUrl'], qualitys: ['128k'] } } };
const requests = [];
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://local'), pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/app/preferences/bootstrap.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(''); return; }
  if (pathname.startsWith('/api/')) {
    requests.push(pathname);
    const fixtures = {
      '/api/music-apis': { ok: true, providers: ['netease', 'qq', 'kugou'].map(id => ({ id, enabled: id === 'netease', configured: id === 'netease', apiStatus: 'ready' })) },
      '/api/audio-sources': { ok: true, selected: source.id, runtimeReady: true, custom: [source], builtins: [] },
      '/api/user-cursors': { ok: true, cursors: [] },
      '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
      '/api/player/state': { ok: true, playing: false, paused: true, volume: .8, position: 0, duration: 0, queue: [], queueLength: 0, queueRevision: 0, queueIndex: -1 },
      '/api/player/queue': { ok: true, queueLength: 1, queueRevision: 1 },
      '/api/visual-bridge/state': { ok: true, audio: {} }, '/api/sandbox/presets': { ok: true, presets: [] }, '/api/sandbox/components': { ok: true, components: [] },
      '/api/community/status': { ok: true, authenticated: false }, '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
    };
    let result = fixtures[pathname] || { ok: true };
    if (pathname.endsWith('/playlists')) result = { ok: true, playlists: [], loggedIn: false };
    if (pathname.endsWith('/playlist/tracks')) result = { ok: false, error: 'Imported list must not request platform tracks' };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
  }
  const file = path.resolve(pathname.startsWith('/components/') ? root : web, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`); res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}), args: ['--mute-audio', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin || route.request().url().startsWith('data:') ? route.continue() : route.abort());
  await page.goto(origin);
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden && state.audioSourceSelectionKnown, null, { timeout: 30000 });
  // Production import/UI/selection; only physical audio is stubbed.
  await page.evaluate(() => {
    window.__played = [];
    loadSong = async song => { state.currentSong = song; __played.push(song); return true; };
    refreshPlayerState = async () => ({});
    window.__originalPreset = state.diyPreset;
    showLoginDialog();
  });
  await page.click('#audioSourceManagerButton');
  await page.waitForFunction(() => !document.getElementById('audioSourceBrowse').disabled);
  const payload = { type: 'playList', version: '2.0.0', data: [{ id: 'fixture', name: '离线歌单 <img src=x onerror=alert(1)>', list: [
    { name: '网易歌曲', source: 'wy', interval: '03:01', meta: { songId: '123' } },
    { name: 'QQ 歌曲', source: 'tx', interval: '02:10', meta: { songId: 'TRACK', id: 777, strMediaMid: 'MEDIA' } },
    { name: '酷狗歌曲', source: 'kg', hash: '0123456789abcdef0123456789abcdef' },
    { name: '未接入歌曲', source: 'kw', songmid: '42' }
  ] }] };
  await page.setInputFiles('#lxPlaylistFile', { name: 'fixture.lxmc', mimeType: 'application/octet-stream', buffer: gzipSync(Buffer.from(JSON.stringify(payload))) });
  await page.waitForFunction(() => !document.getElementById('lxPlaylistImport').disabled);
  assert.equal(await page.evaluate(() => feLxPlaylists.getPlaylists().length), 0);
  assert.equal(await page.locator('#lxPlaylistPreview img').count(), 0);
  assert.match(await page.locator('#lxPlaylistStatus').textContent(), /kw: 1/);
  await page.screenshot({ path: path.join(output, 'preview.png'), fullPage: true });
  await page.click('#lxPlaylistImport');
  await page.waitForFunction(() => feLxPlaylists.getPlaylists().length === 3);
  assert.equal(await page.evaluate(() => state.diyPreset === __originalPreset && __played.length === 0), true);
  assert.equal(await page.evaluate(() => state.audioSourceSelection.id), source.id);
  assert.equal(await page.evaluate(() => providerConfigured('qq')), false);
  const importedCard = label => page.locator('#lxPlaylistSaved .audio-source-card').filter({ hasText: label });
  await importedCard('酷狗').getByRole('button', { name: '打开歌单' }).click();
  assert.match(await page.locator('#lxPlaylistStatus').textContent(), /不支持此歌单/);
  await importedCard('QQ 音乐').getByRole('button', { name: '打开歌单' }).click();
  await page.waitForSelector('#playlistSongStack .shelf-song-button');
  assert.equal(await page.locator('#audioSourceDialog').isHidden(), true);
  assert.equal(await page.evaluate(() => state.activeProvider), 'qq');
  assert.equal(await page.evaluate(() => state.activePlaylistSongs[0].sourceRef.mediaMid), 'MEDIA');
  assert.equal(requests.some(item => item.endsWith('/playlist/tracks')), false);
  await page.locator('#playlistSongStack .shelf-song-button').first().click();
  await page.waitForFunction(() => __played.length === 1);
  assert.equal(await page.evaluate(() => __played[0].id), 'TRACK');
  assert.equal(await page.evaluate(() => __played[0].sourceRef.qqId), '777');
  assert.equal(await page.locator('#playlistShelf').isVisible(), true);
  await page.screenshot({ path: path.join(output, 'songs.png'), fullPage: true });
  await page.evaluate(() => feAudioSources.open());
  await page.waitForSelector('#lxPlaylistSaved');
  page.once('dialog', dialog => dialog.accept());
  await importedCard('QQ 音乐').getByRole('button', { name: '移除副本' }).click();
  assert.equal(await page.evaluate(() => feLxPlaylists.getPlaylists().length), 2);
  assert.equal(await page.evaluate(() => state.currentSong.id === 'TRACK' && __played.length === 1), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.reload();
  await page.waitForFunction(() => window.feLxPlaylists?.getPlaylists().length === 2);
  assert.deepEqual(errors, []);
  console.log('LX playlist browser PASS: preview, import, source restrictions, unconfigured platform, song selection, removal, reload, mobile. Physical audio is stubbed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
