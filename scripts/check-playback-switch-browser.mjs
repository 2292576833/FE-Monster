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
const requests = [];
const tracks = Array.from({ length: 4 }, (_, i) => ({ id: `switch-${i}`, title: `Switch ${i}`, artist: 'Test', provider: 'netease', duration: 8 }));
const shelfTracks = Array.from({ length: 3 }, (_, i) => ({ id: `shelf-${i}`, title: `Shelf ${i}`, artist: 'Test', provider: 'netease', duration: 8 }));
let current = tracks[0];
const wav = Buffer.alloc(44 + 8000 * 2 * 8);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let frame = 0; frame < 8000 * 8; frame++) wav.writeInt16LE(Math.round(Math.sin(frame * Math.PI * 2 * 440 / 8000) * 6000), 44 + frame * 2);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = value => { if (!res.destroyed) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); } };
  if (url.pathname === '/api/player/load') {
    const id = url.searchParams.get('id'); requests.push(id);
    const track = [...tracks, ...shelfTracks].find(item => item.id === id);
    setTimeout(() => { if (!res.destroyed) { current = track; json({ playable: true, url: `/fixture.wav?id=${id}`, song: track }); } }, id === 'switch-2' ? 800 : 80);
    return;
  }
  if (url.pathname === '/api/player/state') return json({ song: current, queue: tracks, queueIndex: tracks.indexOf(current), position: 0, duration: 8, playing: true, volume: .5, queueLength: tracks.length });
  if (url.pathname === '/api/music-apis') return json({ ok: true, providers: [{ id: 'netease', enabled: true, configured: true, status: 'ready' }] });
  if (url.pathname === '/api/lyric') return json({ lrc: { lyric: `[00:00.00]Lyric ${url.searchParams.get('id')}\n[00:04.00]Next lyric` } });
  if (url.pathname === '/fixture.wav') { res.setHeader('Content-Type', 'audio/wav'); res.end(wav); return; }
  if (url.pathname.startsWith('/api/')) return json({});
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(root, requested.startsWith('/components/') ? requested.slice(1) : `web/${requested.slice(1)}`);
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof loadSong === 'function');
  await page.evaluate(tracks => {
    clearBackgroundPolling();
    // Retain production media element, load/transport, native invalidation and
    // wheel handlers. Silence output and suppress unrelated scene work.
    els.audio.muted = true;
    state.currentSong = tracks[0]; state.queue = tracks; state.queueIndex = 0;
    state.playbackPage = true; state.qishuiPlaybackCard.hiddenByUser = false;
    window.__switchToasts = []; toast = message => window.__switchToasts.push(message);
    window.__switchStart = performance.now();
    window.__switchSelected = [];
  }, tracks);
  // Real wheel DOM events while the first URL is still loading: next, next,
  // previous. The slow middle request must be cancelled and cannot win later.
  for (const delta of [1, 1, -1]) {
    await page.evaluate(delta => {
      els.qishuiPlaybackCard.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, bubbles: true, cancelable: true }));
      window.__switchSelected.push(state.queueIndex);
    }, delta);
    await page.waitForTimeout(30);
  }
  await page.waitForFunction(() => state.currentSong?.id === 'switch-1' && !els.audio.paused && els.audio.currentTime > 0, { timeout: 10000 });
  const started = await page.evaluate(() => performance.now() - window.__switchStart);
  await page.waitForTimeout(950);
  const result = await page.evaluate(() => ({ selected: window.__switchSelected, song: state.currentSong.id, source: els.audio.src, position: els.audio.currentTime, switching: state.qishuiPlaybackCard.switching, toasts: window.__switchToasts, pending: state.audioPlaybackContinuity.pendingLoadGeneration }));
  assert.deepEqual(result.selected, [1, 2, 1]);
  assert.equal(result.song, 'switch-1'); assert.match(result.source, /id=switch-1/);
  assert.ok(result.position > 0); assert.equal(result.switching, false); assert.equal(result.pending, 0);
  assert.deepEqual(result.toasts, []); assert.ok(started < 1800, `test-source startup too slow: ${started}ms`);
  const sourceChecks = [];
  async function expectSource(songId, kind) {
    await page.waitForFunction(({ songId, kind }) =>
      state.currentSong?.id === songId && state.playbackSelection.kind === kind
      && !state.audioPlaybackContinuity.pendingLoadGeneration
      && !els.audio.paused && els.audio.currentTime > 0
      && state.lyricLines.some(line => line.text === `Lyric ${songId}`),
    { songId, kind }, { timeout: 10000 }).catch(async (error) => {
      const detail = `Expected ${kind}:${songId}; actual ${JSON.stringify(await page.evaluate(() => ({
        song: state.currentSong?.id, selection: state.playbackSelection,
        lyric: state.lyricLines.map(line => line.text), paused: els.audio.paused,
        pending: state.audioPlaybackContinuity.pendingLoadGeneration, toasts: window.__switchToasts
      })))}`;
      throw new Error(detail, { cause: error });
    });
    const snapshot = await page.evaluate(() => ({
      song: state.currentSong.id, kind: state.playbackSelection.kind,
      queue: state.queue.map(song => song.id), lyric: state.lyricLines[0]?.text
    }));
    assert.deepEqual(snapshot.queue, tracks.map(song => song.id), 'song-bar playback must preserve the manual queue');
    sourceChecks.push(snapshot);
  }
  async function playFromShelf(index) {
    await page.evaluate(async ({ songs, index }) => {
      state.activeProvider = 'netease';
      state.audioSourceSelectionKnown = true;
      state.audioSourceSelection = { id: 'builtin', builtin: true, name: 'Fixture', supportedProviders: [] };
      state.activePlaylist = { id: 'fixture-shelf', provider: 'netease' };
      state.activePlaylistSongs = songs;
      const button = document.createElement('button');
      button.dataset.songIndex = String(index);
      await playShelfSong(button);
    }, { songs: shelfTracks, index });
  }
  async function wheel(deltaY) {
    await page.evaluate(deltaY => {
      els.qishuiPlaybackCard.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    }, deltaY);
  }
  await playFromShelf(0);
  await expectSource('shelf-0', 'playlist');
  await wheel(60);
  await expectSource('shelf-1', 'playlist');
  await wheel(-60);
  await expectSource('shelf-0', 'playlist');
  await page.waitForFunction(() => !!window.FEPlaybackQueue);
  await page.evaluate(() => {
    window.FEPlaybackQueue.open();
    document.querySelector('.qishui-playback-queue-item[data-queue-index="0"] [data-queue-action="play"]').click();
  });
  await expectSource('switch-0', 'queue');
  await wheel(60);
  await expectSource('switch-1', 'queue');
  await playFromShelf(1);
  await wheel(60);
  await expectSource('shelf-2', 'playlist');
  // Test the actual output graph, not just the media progress clock. Device
  // output remains silenced by Chromium's --mute-audio flag; the deterministic
  // tone must still reach a downstream analyser after ended -> next.
  await page.evaluate(async () => {
    state.obrSpatialAudio.requested = false;
    state.obrSpatialAudio.mixerControl = { attempted: true, enabled: false };
    els.audio.muted = false; els.audio.volume = .5; els.volumeRange.value = '50';
    await ensureAudioAnalysis();
    window.__outputProbe = state.audioAnalysis.context.createAnalyser();
    window.__outputProbe.fftSize = 256;
    state.audioAnalysis.dryGain.connect(window.__outputProbe);
    const silent = state.audioAnalysis.context.createGain(); silent.gain.value = 0;
    window.__outputProbe.connect(silent); silent.connect(state.audioAnalysis.context.destination);
  });
  const outputChecks = [];
  for (const expected of ['shelf-0', 'shelf-1']) {
    await page.evaluate(() => { els.audio.currentTime = els.audio.duration - .05; });
    await expectSource(expected, 'playlist');
    await page.waitForFunction(() => {
      const data = new Float32Array(256); window.__outputProbe.getFloatTimeDomainData(data);
      return state.audioAnalysis.context.state === 'running' && data.some(value => Math.abs(value) > .01);
    }, null, { timeout: 10000 }).catch(async error => {
      const diagnostic = await page.evaluate(() => {
        const output = new Float32Array(256), input = new Float32Array(4096);
        window.__outputProbe.getFloatTimeDomainData(output); state.audioAnalysis.analyser.getFloatTimeDomainData(input);
        return { song: state.currentSong?.id, paused: els.audio.paused, muted: els.audio.muted, volume: els.audio.volume,
          context: state.audioAnalysis.context.state, shouldRun: state.audioAnalysis.contextShouldRun,
          input: Math.max(...input.map(Math.abs)), output: Math.max(...output.map(Math.abs)),
          gain: state.audioAnalysis.dryGain?.gain.value, mode: state.audioAnalysis.sourceMode, spatial: state.obrSpatialAudio.enabled };
      });
      throw new Error(`Output graph failed: ${JSON.stringify(diagnostic)}`, { cause: error });
    });
    outputChecks.push(await page.evaluate(() => ({ song: state.currentSong.id, context: state.audioAnalysis.context.state, gain: state.audioAnalysis.dryGain.gain.value })));
  }
  // Simulate the output-only failure the user described: HTML time continues,
  // but the context was suspended. The continuity monitor must resume sound.
  await page.evaluate(async () => {
    await state.audioAnalysis.context.suspend();
    state.audioPlaybackContinuity.playingIntent = true;
    await monitorAudioPlaybackContinuity();
  });
  assert.equal(await page.evaluate(() => state.audioAnalysis.context.state), 'running');
  console.log(JSON.stringify({ ok: true, deviceOutputMuted: true, realOutputGraphVerified: true, outputChecks, startupMs: Math.round(started), requests, ...result, sourceChecks }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
