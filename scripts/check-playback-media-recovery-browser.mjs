import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/27736/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(import.meta.dirname, '..');
const counts = new Map();
let current = null;
let navigation = 0;
const song = (id, provider = 'netease') => ({ id, title: id, artist: 'Fixture', provider, duration: 8 });
const wav = Buffer.alloc(44 + 8000 * 2 * 8);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const playback = (track, source) => ({ playable: true, song: track, url: source, quality: 'standard' });
  if (url.pathname === '/api/player/load') {
    const id = url.searchParams.get('id');
    const n = (counts.get(id) || 0) + 1; counts.set(id, n);
    if (id === 'api-failure') return json({ error: '音源服务器暂时不可用' }, 503);
    current = song(id, url.searchParams.get('provider') || 'netease');
    const expired = id.startsWith('retry-') && n === 1;
    return json(playback(current, id === 'bad-format' ? '/broken.wav' : expired ? '/expired.wav' : '/fixture.wav'));
  }
  if (url.pathname === '/api/player/next') {
    navigation++; current = song('transport');
    return json(playback(current, '/expired.wav'));
  }
  if (url.pathname === '/api/player/state') return json({ song: current, position: 0, duration: 8, playing: true, volume: 0, queueLength: 2, queueIndex: 0 });
  if (url.pathname === '/api/login/status') return json({ ok: true, loggedIn: true, account: { vipType: 1 } });
  if (url.pathname === '/api/audio-sources') return json({ ok: true, selected: 'builtin', selectedSource: { id: 'builtin', name: '内置音源', builtin: true }, builtins: [], custom: [] });
  if (url.pathname === '/fixture.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav); return; }
  if (url.pathname === '/broken.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end('invalid audio fixture'); return; }
  if (url.pathname === '/expired.wav') { res.writeHead(404); res.end('expired'); return; }
  if (url.pathname.startsWith('/api/')) return json({});
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(root, requested.startsWith('/components/') ? requested.slice(1) : `web/${requested.slice(1)}`);
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const checks = {};
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof loadSong === 'function' && typeof state !== 'undefined');
  await page.evaluate(() => {
    clearBackgroundPolling(); els.audio.muted = true;
    window.__toasts = []; toast = value => window.__toasts.push(value);
    state.queue = [{ id: 'a' }, { id: 'b' }];
  });
  for (const provider of ['netease', 'qq', 'kugou']) {
    const track = song(`retry-${provider}`, provider);
    assert.equal(await page.evaluate(track => loadSong(track), track), true);
    await page.waitForFunction(() => !els.audio.paused && els.audio.currentTime > 0);
    assert.equal(counts.get(track.id), 2);
    assert.deepEqual(await page.evaluate(() => window.__toasts), []);
    checks[`${provider}_expired_source_recovers_once`] = true;
  }
  assert.equal(await page.evaluate(() => transport('/api/player/next', { completed: true, maxAttempts: 1 })), true);
  assert.equal(navigation, 1); assert.equal(counts.get('transport'), 1);
  checks.navigation_renews_selected_song = true;

  await page.evaluate(async track => {
    cancelStalledAudioPlaybackRecovery(); els.audio.pause();
    state.audioPlaybackContinuity.pendingLoadGeneration = state.audioPlaybackContinuity.sourceGeneration;
    state.currentSong = track; state.playerClock.playing = false;
    await new Promise(resolve => { els.audio.addEventListener('error', resolve, { once: true }); els.audio.src = '/expired.wav'; });
    state.audioPlaybackContinuity.pendingLoadGeneration = 0;
    await togglePlay();
  }, song('toggle'));
  assert.equal(counts.get('toggle'), 1);
  await page.waitForFunction(() => !els.audio.paused && els.audio.currentTime > 0);
  checks.play_button_replaces_failed_source = true;
  assert.deepEqual(await page.evaluate(() => window.__toasts), []);

  for (const [id, expected] of [['api-failure', /音源服务器暂时不可用/], ['bad-format', /音源无法加载或格式不受支持/]]) {
    const failure = await page.evaluate(async track => {
      state.activeProvider = 'netease';
      state.audioSourceSelection = { id: 'builtin', builtin: true };
      try { await playPlaylistTracks({ id: 'fixture', provider: 'netease' }, [track]); return ''; }
      catch (error) { return error.message; }
    }, song(id));
    assert.match(failure, expected); assert.doesNotMatch(failure, /VIP|会员|无播放权限/);
    checks[`${id}_keeps_accurate_error`] = true;
  }
  assert.equal(counts.get('api-failure'), 1);
  assert.equal(counts.get('bad-format'), 2);
  assert.deepEqual(await page.evaluate(() => window.__toasts), []);
  console.log(JSON.stringify({ ok: true, realSilentAudio: true, checks, requests: Object.fromEntries(counts) }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
