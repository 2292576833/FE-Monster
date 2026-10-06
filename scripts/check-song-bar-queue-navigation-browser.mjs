import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// Manually playing a song from the song bar plays that song bar only, and the
// tray queue keeps describing its own items. The playback queue's explicit
// play button plays only queue songs. This runs the real page: shelf clicks, queue
// panel clicks, the playback-bar next button and the dock next button all have
// to agree on which list is playing.
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/playwright/song-bar-queue-navigation');
mkdirSync(output, { recursive: true });

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [
  process.env.PLAYWRIGHT_MODULE_PATH,
  'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');

const rate = 8000;
const samples = rate * 8;
const tone = Buffer.alloc(44 + samples * 2);
tone.write('RIFF', 0); tone.writeUInt32LE(tone.length - 8, 4);
tone.write('WAVEfmt ', 8); tone.writeUInt32LE(16, 16);
tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
tone.writeUInt32LE(rate, 24); tone.writeUInt32LE(rate * 2, 28);
tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
tone.write('data', 36); tone.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index += 1) {
  tone.writeInt16LE(Math.round(Math.sin(index / rate * Math.PI * 2 * 220) * 3000), 44 + index * 2);
}

const shelf = [0, 1, 2, 3].map((index) => ({
  id: `shelf-${index}`,
  title: `歌曲栏歌曲 ${index}`,
  artist: `歌曲栏歌手 ${index}`,
  album: `歌曲栏专辑 ${index}`,
  provider: 'netease',
  duration: 8
}));
const queue = [0, 1, 2].map((index) => ({
  id: `queue-${index}`,
  title: `队列歌曲 ${index}`,
  artist: `队列歌手 ${index}`,
  album: `队列专辑 ${index}`,
  provider: 'netease',
  duration: 8
}));
const requests = { loads: [], transports: [], queueMerges: 0 };
const queueState = queue.slice();
let queueIndex = -1;
let currentSong = null;

const fixtures = {
  '/api/music-apis': {
    ok: true,
    providers: [{
      id: 'netease', label: '网易云', appName: '网易云音乐',
      enabled: true, configured: true, status: 'ready', baseUrl: 'http://127.0.0.1:1/netease'
    }]
  },
  '/api/login/status': { ok: true, provider: 'netease', loggedIn: true, account: { userId: '456', nickname: '审计账号' } },
  '/api/app/achievements': {
    version: 2, progress: {}, unlocked: {}, themes: { page: 'classic', toast: 'classic' },
    settings: { soundEnabled: true },
    ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } },
    _sync: { scope: 'netease:456', provider: 'netease', accountId: '456', remoteRequired: false, serverSynced: true }
  },
  '/api/lyric': { lrc: { lyric: '[00:00.00]第一句歌词\n[00:02.50]第二句歌词\n[00:05.00]第三句歌词' } }
};
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav'
};

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const pathname = decodeURIComponent(url.pathname);
  const json = (value) => {
    if (response.destroyed) return;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(value));
  };
  if (pathname === '/fixture-tone.wav') {
    response.setHeader('Content-Type', 'audio/wav');
    response.end(tone);
    return;
  }
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end('');
    return;
  }
  if (pathname === '/api/app/preferences' && request.method === 'POST') return json({ ok: true });
  if (pathname === '/api/app/preferences/cloud-sync' && request.method === 'POST') {
    return json({ ok: true, preferences: null });
  }
  if (pathname === '/api/player/state') {
    return json({
      ok: true, song: currentSong, volume: 0.8, playing: false, paused: true,
      position: 0, duration: currentSong?.duration || 8, queue: queueState,
      queueLength: queueState.length, queueRevision: 1, queueIndex
    });
  }
  if (pathname === '/api/fixture/queue-add') {
    const id = url.searchParams.get('id');
    const song = shelf.find((item) => item.id === id);
    if (song && !queueState.some((item) => item.id === id)) queueState.push({ ...song });
    return json({ ok: true, length: queueState.length });
  }
  if (pathname === '/api/player/load') {
    const id = url.searchParams.get('id');
    const song = [...shelf, ...queue].find((item) => item.id === id);
    if (!song) return json({ playable: false, error: 'fixture song was not found' });
    requests.loads.push(id);
    currentSong = song;
    const index = queueState.findIndex((item) => item.id === song.id);
    if (index >= 0) queueIndex = index;
    json({ playable: true, url: `/fixture-tone.wav?id=${encodeURIComponent(song.id)}`, song, quality: 'fixture' });
    return;
  }
  if (pathname === '/api/player/next' || pathname === '/api/player/previous') {
    const step = pathname.endsWith('/previous') ? -1 : 1;
    requests.transports.push(step);
    if (!queueState.length) return json({ playable: false, error: 'fixture queue is empty' });
    queueIndex = (Math.max(0, queueIndex) + step + queueState.length) % queueState.length;
    currentSong = queueState[queueIndex];
    json({
      playable: true,
      url: `/fixture-tone.wav?id=${encodeURIComponent(currentSong.id)}`,
      song: currentSong,
      quality: 'fixture',
      queueIndex
    });
    return;
  }
  if (pathname === '/api/player/queue/merge') {
    requests.queueMerges += 1;
    return json({ ok: true, queueLength: queue.length, queueIndex });
  }
  if (pathname === '/api/player/seek' || pathname === '/api/player/volume'
    || pathname === '/api/player/pause' || pathname === '/api/player/resume') {
    return json({ ok: true });
  }
  if (pathname.startsWith('/api/')) return json(fixtures[pathname] || { ok: true });
  if (pathname === '/data/android-bundled-library.json') return json({ playlists: [], songs: [] });
  const file = path.resolve(
    pathname.startsWith('/components/') ? root : path.join(root, 'web'),
    pathname === '/' ? 'index.html' : pathname.slice(1)
  );
  if (!file.startsWith(root + path.sep) || !existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);

const errors = [];
const evidence = {};
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(!existsSync(chromium.executablePath()) && edge ? { executablePath: edge } : {}),
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(`fixture ${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof playShelfSong === 'function', null, { timeout: 30000 });
  const boot = page.locator('#bootLogoButton');
  if (await boot.count() && await boot.isVisible()) {
    await page.waitForFunction(() => !document.getElementById('bootLogoButton')?.disabled, null, { timeout: 20000 });
    await boot.click();
  }
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    if (typeof clearBackgroundPolling === 'function') clearBackgroundPolling();
    if (typeof clearRealtimePolling === 'function') clearRealtimePolling();
    // The fixture owns the audio-source selection: keep the asynchronous
    // reconciliation from replacing it mid-contract.
    if (typeof reconcileAudioSourceLibrary === 'function') {
      reconcileAudioSourceLibrary = () => Promise.resolve();
    }
    if (typeof enterPresetPlaybackPage === 'function') enterPresetPlaybackPage('lyric');
  });
  await page.waitForTimeout(500);
  await page.evaluate(([shelfSongs, queueSongs]) => {
    els.audio.muted = true;
    window.__toasts = [];
    if (typeof toast === 'function') toast = (message) => window.__toasts.push(String(message));
    state.audioSourceSelectionKnown = true;
    state.audioSourceSelection = { id: 'builtin', builtin: true, name: '内置音源', supportedProviders: [] };
    state.activePlaylist = { id: 'fixture-playlist', name: '夹具歌单', provider: 'netease' };
    state.activePlaylistId = 'fixture-playlist';
    state.activePlaylistSongs = shelfSongs.slice();
    state.queue = queueSongs.slice();
    if (typeof renderPlaylistShelf === 'function') renderPlaylistShelf(state.activePlaylist, state.activePlaylistSongs, { open: true, focus: 0 });
    renderShelfSongs();
  }, [shelf, queue]);

  const snapshot = () => page.evaluate(() => ({
    song: state.currentSong?.id || '',
    queueIndex: state.queueIndex,
    queue: state.queue.map((item) => item.id),
    source: state.playbackSelection?.kind || '',
    shelfFocus: state.songFocusIndex,
    queuePanelMeta: document.getElementById('qishuiPlaybackQueuePanelMeta')?.textContent || '',
    cardQueueLabel: document.getElementById('qishuiPlaybackQueue')?.textContent || ''
  }));
  // Fixture playback settles through the real media element; wait for the
  // actual song change instead of guessing a fixed delay so the contract does
  // not depend on this machine's load time.
  const waitForSongChange = async (previousId) => {
    try {
      await page.waitForFunction((id) => (state.currentSong?.id || '') !== id, previousId, { timeout: 6000 });
    } catch {}
    try {
      await page.waitForFunction(
        () => (state.audioPlaybackContinuity?.pendingLoadGeneration || 0) === 0,
        null,
        { timeout: 6000 }
      );
    } catch {}
    await page.waitForTimeout(350);
  };
  // The play path refreshes the player state and re-syncs the queue position
  // after the media element reports the new song, so allow that settling
  // window before sampling instead of asserting on a fixed delay.
  const waitForQueueIndex = async (value, timeout = 4000) => {
    try {
      await page.waitForFunction((expected) => state.queueIndex === expected, value, { timeout });
    } catch {}
  };
  const clickShelfSong = async (index, expectedQueueIndex = -1) => {
    const previous = await page.evaluate(() => state.currentSong?.id || '');
    await page.evaluate((songIndex) => {
      const button = document.querySelector(`#playlistSongStack .shelf-song-button[data-song-index="${songIndex}"]`);
      assert_fixture(Boolean(button), `shelf card ${songIndex} was not rendered`);
      button.click();
      function assert_fixture(condition, message) { if (!condition) throw new Error(message); }
    }, index);
    await waitForSongChange(previous);
    await waitForQueueIndex(expectedQueueIndex);
    return snapshot();
  };
  const selectQueueItem = async (index) => {
    const previous = await page.evaluate(() => state.currentSong?.id || '');
    await page.evaluate(() => document.getElementById('qishuiPlaybackQueueButton')?.click());
    await page.waitForTimeout(200);
    await page.evaluate((itemIndex) => {
      const item = document.querySelector(`#qishuiPlaybackQueueList .qishui-playback-queue-item[data-queue-index="${itemIndex}"]`);
      if (!item) throw new Error(`queue item ${itemIndex} was not rendered`);
      item.click();
      if (item.getAttribute('aria-selected') !== 'true') throw new Error('Queue row was not selected');
    }, index);
    await page.locator(`#qishuiPlaybackQueueList [data-queue-index="${index}"]`).hover();
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(250);
    assert.equal((await snapshot()).song, previous, 'selecting or scrolling the queue must not start playback');
    await page.evaluate((itemIndex) => {
      document.querySelector(`#qishuiPlaybackQueueList [data-queue-index="${itemIndex}"] [data-queue-action="play"]`).click();
    }, index);
    await waitForSongChange(previous);
    await waitForQueueIndex(index);
    return snapshot();
  };
  const pressNext = async () => {
    const previous = await page.evaluate(() => state.currentSong?.id || '');
    await page.evaluate(() => document.getElementById('qishuiPlaybackNextButton')?.click());
    await waitForSongChange(previous);
    return snapshot();
  };
  const pressDockNext = async () => {
    const previous = await page.evaluate(() => state.currentSong?.id || '');
    await page.evaluate(() => document.getElementById('nextButton')?.click());
    await waitForSongChange(previous);
    return snapshot();
  };

  const shelfFirst = await clickShelfSong(0);
  assert.equal(shelfFirst.song, 'shelf-0', 'playing a song bar card must play that song');
  assert.equal(shelfFirst.source, 'playlist', 'the song bar must own the active playback source');
  assert.equal(shelfFirst.queueIndex, -1, 'a song outside the queue must not claim a queue position');
  assert.deepEqual(shelfFirst.queue, queue.map((item) => item.id), 'playing from the song bar must not change the queue');
  assert.match(shelfFirst.queuePanelMeta, /不在队列中/, 'the queue panel must not mark an unrelated queue song as playing');
  assert.equal(shelfFirst.cardQueueLabel, '移动播放页', 'the playback bar must not show a queue position for a song bar song');

  const shelfNext = await pressNext();
  assert.equal(shelfNext.song, 'shelf-1', 'next inside the song bar must play the next song bar song');
  assert.equal(shelfNext.source, 'playlist');
  assert.equal(shelfNext.queueIndex, -1);

  const dockNext = await pressDockNext();
  assert.equal(dockNext.song, 'shelf-2', 'the dock next button must follow the song bar as well');
  assert.equal(dockNext.source, 'playlist');

  const queueFirst = await selectQueueItem(1);
  assert.equal(queueFirst.song, 'queue-1', 'selecting a queue item must play that queue song');
  assert.equal(queueFirst.source, 'queue', 'the queue must own the active playback source');
  assert.equal(queueFirst.queueIndex, 1, 'the queue position must follow the selected queue item');

  const queueLocalNext = await pressNext();
  assert.equal(queueLocalNext.song, 'queue-2', 'next in the queue must play the next queue song');
  assert.equal(queueLocalNext.source, 'queue');
  assert.equal(queueLocalNext.queueIndex, 2);

  const beforeDock = requests.transports.length;
  const queueDockNext = await pressDockNext();
  assert.equal(requests.transports.length, beforeDock + 1,
    'the dock next button must advance the queue through the player service');
  assert.equal(queueDockNext.song, 'queue-0', 'the backend queue advance must stay inside the queue');
  assert.equal(queueDockNext.source, 'queue');
  // The player service owns the remote queue position; the client mirrors it on
  // its next state poll instead of guessing the advanced index locally.
  const serviceQueue = await page.evaluate(async () => {
    const response = await fetch('/api/player/state', { cache: 'no-store' });
    return response.json();
  });
  assert.equal(serviceQueue.queueIndex, 0, 'the player service advanced its own queue position');
  assert.equal(serviceQueue.song?.id, 'queue-0', 'the player service plays the advanced queue entry');

  // The same song bar entry that also exists in the queue reports that exact
  // queue position instead of an unrelated one, and still plays from the bar.
  await page.evaluate(async () => {
    await fetch('/api/fixture/queue-add?id=shelf-3');
    // Mirror the service queue before selecting the queued song bar entry.
    if (typeof refreshPlayerState === 'function') await refreshPlayerState();
  });
  const queuedShelfSong = await clickShelfSong(3, 3);
  assert.equal(queuedShelfSong.song, 'shelf-3', 'a queued song bar entry still plays from the song bar');
  assert.equal(queuedShelfSong.queueIndex, 3, 'a song bar entry that is queued reports its queue position');
  assert.equal(queuedShelfSong.source, 'playlist');

  assert.equal(requests.queueMerges, 0, 'song bar navigation must never mutate the playback queue');
  // A renewed source for the same song is legitimate (the fixture media element
  // can reject the first play attempt), so compare the load order with
  // consecutive duplicates collapsed instead of the raw request log.
  const loadOrder = requests.loads.filter((id, index) => requests.loads[index - 1] !== id);
  assert.deepEqual(
    loadOrder,
    ['shelf-0', 'shelf-1', 'shelf-2', 'queue-1', 'queue-2', 'shelf-3'],
    'song bar navigation and queue selection must only load their own songs'
  );
  assert.deepEqual(errors, [], 'the playback surfaces reported no page errors');

  evidence.shelfFirst = shelfFirst;
  evidence.shelfNext = shelfNext;
  evidence.dockNext = dockNext;
  evidence.queuedShelfSong = queuedShelfSong;
  evidence.queueFirst = queueFirst;
  evidence.queueLocalNext = queueLocalNext;
  evidence.queueDockNext = queueDockNext;
  evidence.requests = requests;
  await page.screenshot({ path: path.join(output, 'song-bar-queue-navigation.png') });
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, ...evidence }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
