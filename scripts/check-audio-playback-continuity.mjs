import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const playerServiceSource = readFileSync(
  path.resolve('src/main/java/com/femonster/core/PlayerService.java'),
  'utf8'
);
const webAppSource = readFileSync(path.resolve('web/app.js'), 'utf8');
const playerLoadStart = playerServiceSource.search(
  /public(?:\s+synchronized)?\s+Map<String,\s*Object>\s+load\(/
);
const playerLoadEnd = playerServiceSource.indexOf(
  'public synchronized Map<String, Object> setQueue(',
  playerLoadStart
);
const playerLoadSource = playerServiceSource.slice(playerLoadStart, playerLoadEnd);
const providerResolutionIndex = Math.max(
  playerLoadSource.indexOf('music.resolvePlayback('),
  playerLoadSource.indexOf('url = music.songUrl(')
);
const playbackClockStartIndex = playerLoadSource.indexOf('clockStartedAt = System.currentTimeMillis()', providerResolutionIndex);
const backendClockStartsAfterUrlResolution = providerResolutionIndex >= 0
  && playbackClockStartIndex > providerResolutionIndex;
const waitingAndStalledHandlersBound = [
  /els\.audio\.addEventListener\(['"]waiting['"],\s*\(\)\s*=>\s*markAudioPlaybackStallHint\(\)\)/,
  /els\.audio\.addEventListener\(['"]stalled['"],\s*\(\)\s*=>\s*markAudioPlaybackStallHint\(\)\)/
].every((pattern) => pattern.test(webAppSource));
const continuityMonitorIntervalBound = /every\(\(\)\s*=>\s*monitorAudioPlaybackContinuity\(\)\.catch\(\(\)\s*=>\s*\{\s*\}\),\s*100\s*\)/
  .test(webAppSource);
const profile = path.resolve(tmpdir(), `fe-monster-audio-continuity-${randomUUID()}`);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const isComponentAsset = requestedPath.startsWith('/components/');
  const staticRoot = isComponentAsset ? componentsRoot : webRoot;
  const relativePath = isComponentAsset
    ? requestedPath.slice('/components/'.length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check',
  '--disk-cache-size=1048576',
  '--media-cache-size=1048576',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => {
  browserError += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;
let evaluationIndex = 0;

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(50);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 20_000);
    pending.set(id, { resolve, reject, timer, method });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

async function evaluate(expression, awaitPromise = false) {
  const stage = ++evaluationIndex;
  process.stderr.write(`[audio-continuity] evaluate ${stage} start\n`);
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  process.stderr.write(`[audio-continuity] evaluate ${stage} done\n`);
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const debugPort = await activeDebugPort();
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((entry) => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const rejectPending = () => {
    for (const [id, request] of pending) {
      clearTimeout(request.timer);
      request.reject(new Error(`DevTools socket closed while waiting for ${request.method}: ${browserError.trim()}`));
      pending.delete(id);
    }
  };
  socket.addEventListener('close', rejectPending);
  socket.addEventListener('error', rejectPending);

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete'
    && typeof refreshPlayerState === 'function'
    && typeof setAudioPlaybackPosition === 'function'
    && typeof els !== 'undefined'
    && els.audio
    && typeof state !== 'undefined'`);

  const result = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    let mediaTime = 10;
    let mediaReadyState = 4;
    const writes = [];
    let payload = {
      song: { id: 'continuity-test', title: 'Continuity Test', duration: 240 },
      queue: [],
      queueIndex: -1,
      position: 11.4,
      duration: 240,
      playing: true,
      paused: false,
      volume: 0.8,
      url: 'https://example.invalid/continuity.mp3'
    };
    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => {
          writes.push(Number(value));
          mediaTime = Number(value);
        }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => mediaReadyState },
      src: { configurable: true, get: () => 'https://example.invalid/continuity.mp3', set: () => {} }
    });
    apiJson = async (url) => url === '/api/player/state' ? payload : {};
    state.currentSong = { ...payload.song, position: 10, playing: true };
    state.localQueueActive = false;

    await refreshPlayerState();
    const smallDriftWrites = writes.slice();
    const smallDriftRate = Number(audio.playbackRate) || 1;
    const rateResetScheduled = state.audioPositionSync.rateResetTimer > 0;
    resetSyncedAudioPlaybackRate();
    const rateAfterReset = Number(audio.playbackRate) || 1;

    payload = { ...payload, position: 18 };
    await refreshPlayerState();
    const largeDriftWrites = writes.slice(smallDriftWrites.length);

    mediaReadyState = 2;
    payload = { ...payload, position: 31 };
    await refreshPlayerState();
    const bufferingDriftWrites = writes.slice(smallDriftWrites.length + largeDriftWrites.length);

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;

    return {
      pass: smallDriftWrites.length === 0
        && Math.abs(smallDriftRate - 1) < 0.001
        && !rateResetScheduled
        && Math.abs(rateAfterReset - 1) < 0.001
        && largeDriftWrites.length === 0
        && bufferingDriftWrites.length === 0,
      smallDriftWrites,
      smallDriftRate,
      rateResetScheduled,
      rateAfterReset,
      largeDriftWrites,
      bufferingDriftWrites
    };
  })()`, true);

  const staleSameSongPollContinuity = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    const previousPlayerClock = { ...state.playerClock };
    const startingMediaTime = 90;
    const priorAcceptedClock = 89.8;
    const staleServerPosition = 84;
    let mediaTime = startingMediaTime;
    const currentTimeWrites = [];

    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => {
          currentTimeWrites.push(Number(value));
          mediaTime = Number(value);
        }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 4 },
      src: {
        configurable: true,
        get: () => 'https://example.invalid/continuous-playback.mp3',
        set: () => {}
      }
    });

    state.currentSong = {
      id: 'same-song-stale-poll-test',
      title: 'Same Song Stale Poll Test',
      duration: 240,
      position: priorAcceptedClock,
      playing: true
    };
    state.localQueueActive = false;
    updatePlayerClock(priorAcceptedClock, 240, true);
    apiJson = async (url) => url === '/api/player/state'
      ? {
          song: {
            id: 'same-song-stale-poll-test',
            title: 'Same Song Stale Poll Test',
            duration: 240
          },
          queue: [],
          queueIndex: -1,
          position: staleServerPosition,
          duration: 240,
          playing: true,
          paused: false,
          volume: 0.8,
          url: 'https://example.invalid/continuous-playback.mp3'
        }
      : {};

    await refreshPlayerState();

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    state.playerClock = previousPlayerClock;
    resetSyncedAudioPlaybackRate();

    return {
      pass: currentTimeWrites.length === 0
        && Math.abs(mediaTime - startingMediaTime) < 0.001,
      trigger: [
        'same song is already playing at 90.0s',
        'last accepted player clock is 89.8s',
        'one /api/player/state poll returns stale 84.0s',
        'refreshPlayerState applies the poll'
      ],
      expected: {
        currentTimeWrites: [],
        mediaTime: startingMediaTime
      },
      actual: {
        currentTimeWrites,
        mediaTime
      }
    };
  })()`, true);

  const inFlightLoadPollContinuity = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    const previousPlayerClock = { ...state.playerClock };
    const previousSourceGeneration = state.audioPlaybackContinuity.sourceGeneration;
    const previousPendingLoadGeneration = state.audioPlaybackContinuity.pendingLoadGeneration;
    const startingMediaTime = 13.277;
    let mediaTime = startingMediaTime;
    const currentTimeWrites = [];

    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => {
          currentTimeWrites.push(Number(value));
          mediaTime = Number(value);
        }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 4 },
      src: {
        configurable: true,
        get: () => 'https://example.invalid/current-song.mp3',
        set: () => {}
      }
    });

    const pendingGeneration = previousSourceGeneration + 1;
    state.currentSong = {
      id: 'current-song-before-slow-load',
      title: 'Current Song Before Slow Load',
      duration: 240,
      position: startingMediaTime,
      playing: true
    };
    state.localQueueActive = false;
    state.audioPlaybackContinuity.sourceGeneration = pendingGeneration;
    state.audioPlaybackContinuity.pendingLoadGeneration = pendingGeneration;
    apiJson = async (url) => url === '/api/player/state'
      ? {
          song: {
            id: 'backend-song-resolving',
            title: 'Backend Song Resolving',
            duration: 260
          },
          queue: [],
          queueIndex: -1,
          position: 0,
          duration: 260,
          playing: true,
          paused: false,
          volume: 0.8,
          url: 'https://example.invalid/backend-song-resolving.mp3'
        }
      : {};

    await refreshPlayerState();
    const songIdDuringPendingLoad = String(state.currentSong?.id || '');
    const pendingGenerationAfterPoll = state.audioPlaybackContinuity.pendingLoadGeneration;

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    state.playerClock = previousPlayerClock;
    state.audioPlaybackContinuity.sourceGeneration = previousSourceGeneration;
    state.audioPlaybackContinuity.pendingLoadGeneration = previousPendingLoadGeneration;
    resetSyncedAudioPlaybackRate();

    return {
      pass: currentTimeWrites.length === 0
        && Math.abs(mediaTime - startingMediaTime) < 0.001
        && songIdDuringPendingLoad === 'current-song-before-slow-load'
        && pendingGenerationAfterPoll === pendingGeneration,
      trigger: [
        'the current media is playing at 13.277s',
        'a slow replacement load has already changed backend state to a different song at 0s',
        'the 5s /api/player/state poll resolves before the replacement media source is installed'
      ],
      expected: {
        currentTimeWrites: [],
        mediaTime: startingMediaTime,
        songId: 'current-song-before-slow-load'
      },
      actual: {
        currentTimeWrites,
        mediaTime,
        songId: songIdDuringPendingLoad,
        pendingGeneration: pendingGenerationAfterPoll
      }
    };
  })()`, true);

  const outOfOrderStatePollContinuity = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    const previousPlayerClock = { ...state.playerClock };
    const startingMediaTime = 100.2;
    let mediaTime = startingMediaTime;
    const currentTimeWrites = [];
    const pendingStateResponses = [];

    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => {
          currentTimeWrites.push(Number(value));
          mediaTime = Number(value);
        }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 4 },
      src: {
        configurable: true,
        get: () => 'https://example.invalid/out-of-order-poll.mp3',
        set: () => {}
      }
    });

    const payloadAt = (position) => ({
      song: {
        id: 'out-of-order-state-poll-test',
        title: 'Out Of Order State Poll Test ' + position,
        duration: 240
      },
      queue: [],
      queueIndex: -1,
      position,
      duration: 240,
      playing: true,
      paused: false,
      volume: 0.8,
      url: 'https://example.invalid/out-of-order-poll.mp3'
    });

    state.currentSong = {
      id: 'out-of-order-state-poll-test',
      title: 'Out Of Order State Poll Test',
      duration: 240,
      position: 99.8,
      playing: true
    };
    state.localQueueActive = false;
    updatePlayerClock(99.8, 240, true);
    apiJson = async (url) => {
      if (url !== '/api/player/state') return {};
      return await new Promise((resolve) => pendingStateResponses.push(resolve));
    };

    const olderRequest = refreshPlayerState();
    const newerRequest = refreshPlayerState();
    pendingStateResponses[1](payloadAt(100));
    await newerRequest;
    pendingStateResponses[0](payloadAt(94));
    await olderRequest;
    const appliedSongTitle = state.currentSong?.title || '';
    const appliedSongPosition = Number(state.currentSong?.position);
    const appliedClockPosition = Number(state.playerClock?.position);

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    state.playerClock = previousPlayerClock;
    resetSyncedAudioPlaybackRate();

    return {
      pass: currentTimeWrites.length === 0
        && Math.abs(mediaTime - startingMediaTime) < 0.001
        && appliedSongTitle === 'Out Of Order State Poll Test 100'
        && Math.abs(appliedSongPosition - startingMediaTime) < 0.001
        && Math.abs(appliedClockPosition - startingMediaTime) < 0.001,
      trigger: [
        'two refreshPlayerState calls start for the same playing song',
        'the newer request resolves first at 100.0s',
        'the older request resolves last at 94.0s'
      ],
      expected: {
        currentTimeWrites: [],
        mediaTime: startingMediaTime,
        songTitle: 'Out Of Order State Poll Test 100',
        songPosition: startingMediaTime,
        clockPosition: startingMediaTime
      },
      actual: {
        currentTimeWrites,
        mediaTime,
        songTitle: appliedSongTitle,
        songPosition: appliedSongPosition,
        clockPosition: appliedClockPosition
      }
    };
  })()`, true);

  const explicitUserSeekMayMoveBackward = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    const previousPlayerClock = { ...state.playerClock };
    const previousRangeValue = els.qishuiPlaybackProgressRange.value;
    const previousProgressDragging = state.qishuiPlaybackCard.progressDragging;
    const previousSeekRequestId = state.qishuiPlaybackCard.seekRequestId;
    const previousSeekPending = state.qishuiPlaybackCard.seekPending;
    const previousPendingSeekTarget = state.qishuiPlaybackCard.pendingSeekTarget;
    const previousPendingAudioSeekTarget = state.qishuiPlaybackCard.pendingAudioSeekTarget;
    const startingMediaTime = 100;
    const expectedSeekTarget = 60;
    let mediaTime = startingMediaTime;
    const currentTimeWrites = [];
    const apiCalls = [];

    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => {
          currentTimeWrites.push(Number(value));
          mediaTime = Number(value);
        }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 4 },
      src: {
        configurable: true,
        get: () => 'https://example.invalid/explicit-user-seek.mp3',
        set: () => {}
      }
    });

    state.currentSong = {
      id: 'explicit-user-seek-test',
      title: 'Explicit User Seek Test',
      duration: 240,
      position: startingMediaTime,
      playing: true
    };
    state.localQueueActive = false;
    state.qishuiPlaybackCard.progressDragging = true;
    state.qishuiPlaybackCard.seekPending = false;
    state.qishuiPlaybackCard.pendingSeekTarget = expectedSeekTarget;
    state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
    els.qishuiPlaybackProgressRange.value = '250';
    apiJson = async (url) => {
      apiCalls.push(String(url));
      return {};
    };

    const committed = await commitQishuiPlaybackSeek();
    const resultingSeekRequestId = state.qishuiPlaybackCard.seekRequestId;

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    state.playerClock = previousPlayerClock;
    els.qishuiPlaybackProgressRange.value = previousRangeValue;
    state.qishuiPlaybackCard.progressDragging = previousProgressDragging;
    state.qishuiPlaybackCard.seekRequestId = previousSeekRequestId;
    state.qishuiPlaybackCard.seekPending = previousSeekPending;
    state.qishuiPlaybackCard.pendingSeekTarget = previousPendingSeekTarget;
    state.qishuiPlaybackCard.pendingAudioSeekTarget = previousPendingAudioSeekTarget;

    return {
      pass: committed === true
        && currentTimeWrites.length === 1
        && Math.abs(currentTimeWrites[0] - expectedSeekTarget) < 0.001
        && Math.abs(mediaTime - expectedSeekTarget) < 0.001
        && resultingSeekRequestId === previousSeekRequestId + 1
        && apiCalls.some((url) => url.includes('/api/player/seek?') && url.includes('position=60')),
      trigger: [
        'user drags the playback progress from 100.0s back to 60.0s',
        'commitQishuiPlaybackSeek advances seekRequestId',
        'the explicit backward seek is applied'
      ],
      expected: {
        currentTimeWrites: [expectedSeekTarget],
        mediaTime: expectedSeekTarget,
        seekRequestId: previousSeekRequestId + 1
      },
      actual: {
        committed,
        currentTimeWrites,
        mediaTime,
        seekRequestId: resultingSeekRequestId,
        apiCalls
      }
    };
  })()`, true);

  const stalledPlaybackRecovery = await evaluate(`(async () => {
    if (
      typeof monitorAudioPlaybackContinuity !== 'function'
      || typeof resetAudioPlaybackContinuity !== 'function'
      || !state.audioPlaybackContinuity
    ) {
      return {
        pass: false,
        monitorPresent: typeof monitorAudioPlaybackContinuity === 'function',
        resetPresent: typeof resetAudioPlaybackContinuity === 'function',
        statePresent: !!state.audioPlaybackContinuity
      };
    }

    const audio = els.audio;
    const originalLoadSong = loadSong;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    let mediaTime = 42;
    let paused = false;
    const recoveries = [];
    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => { mediaTime = Number(value); }
      },
      paused: { configurable: true, get: () => paused },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 2 },
      src: {
        configurable: true,
        get: () => 'http://127.0.0.1/api/audio/stream?url=stall-fixture',
        set: () => {}
      }
    });
    loadSong = async (song, options) => {
      recoveries.push({ song: { ...song }, options: { ...options } });
      return true;
    };
    state.currentSong = {
      id: 'stalled-playback-test',
      title: 'Stalled Playback Test',
      duration: 240,
      position: mediaTime,
      playing: true
    };
    state.localQueueActive = false;

    resetAudioPlaybackContinuity(mediaTime, 1_000);
    state.audioPlaybackContinuity.playingIntent = true;
    const beforeLimitResult = await monitorAudioPlaybackContinuity(1_300);
    const recoveryResult = await monitorAudioPlaybackContinuity(1_400);
    const recovery = recoveries[0];

    mediaTime = 43;
    const advancingResult = await monitorAudioPlaybackContinuity(1_500);
    paused = true;
    const pausedResult = await monitorAudioPlaybackContinuity(10_000);

    loadSong = originalLoadSong;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    resetAudioPlaybackContinuity();

    return {
      pass: recoveries.length === 1
        && beforeLimitResult === 'watching'
        && recoveryResult === 'recovered'
        && recovery?.song?.id === 'stalled-playback-test'
        && Math.abs(Number(recovery?.options?.position) - 42) < 0.001
        && recovery?.options?.autoplay === true
        && recovery?.options?.silent === true
        && recovery?.options?.recovery === true
        && advancingResult === 'advanced'
        && pausedResult === 'idle',
      recoveries,
      beforeLimitResult,
      recoveryResult,
      advancingResult,
      pausedResult
    };
  })()`, true);

  const transientBufferingContinuity = await evaluate(`(async () => {
    if (
      typeof monitorAudioPlaybackContinuity !== 'function'
      || typeof resetAudioPlaybackContinuity !== 'function'
      || typeof markAudioPlaybackStallHint !== 'function'
      || !state.audioPlaybackContinuity
    ) {
      return {
        pass: false,
        monitorPresent: typeof monitorAudioPlaybackContinuity === 'function',
        resetPresent: typeof resetAudioPlaybackContinuity === 'function',
        hintPresent: typeof markAudioPlaybackStallHint === 'function',
        statePresent: !!state.audioPlaybackContinuity
      };
    }

    const audio = els.audio;
    const originalLoadSong = loadSong;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    let mediaTime = 72;
    let mediaReadyState = 2;
    const recoveries = [];
    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => { mediaTime = Number(value); }
      },
      duration: { configurable: true, get: () => 240 },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => mediaReadyState },
      src: {
        configurable: true,
        get: () => 'http://127.0.0.1/api/audio/stream?url=transient-buffer-fixture',
        set: () => {}
      }
    });
    loadSong = async (song, options) => {
      recoveries.push({ song: { ...song }, options: { ...options } });
      return true;
    };
    state.currentSong = {
      id: 'transient-buffer-test',
      title: 'Transient Buffer Test',
      duration: 240,
      position: mediaTime,
      playing: true
    };
    state.localQueueActive = false;

    const base = performance.now();
    resetAudioPlaybackContinuity(mediaTime, base);
    state.audioPlaybackContinuity.playingIntent = true;
    markAudioPlaybackStallHint(base + 100);
    const bufferingResult = await monitorAudioPlaybackContinuity(base + 300);

    mediaReadyState = 4;
    mediaTime += 0.08;
    const resumedResult = await monitorAudioPlaybackContinuity(base + 325);

    loadSong = originalLoadSong;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    resetAudioPlaybackContinuity();

    return {
      pass: bufferingResult === 'watching'
        && resumedResult === 'advanced'
        && recoveries.length === 0,
      bufferingResult,
      resumedResult,
      recoveryCount: recoveries.length
    };
  })()`, true);

  const failedRecoveryBackoff = await evaluate(`(async () => {
    if (
      typeof monitorAudioPlaybackContinuity !== 'function'
      || typeof resetAudioPlaybackContinuity !== 'function'
      || typeof loadSong !== 'function'
      || !state.audioPlaybackContinuity
    ) {
      return {
        pass: false,
        monitorPresent: typeof monitorAudioPlaybackContinuity === 'function',
        resetPresent: typeof resetAudioPlaybackContinuity === 'function',
        loadSongPresent: typeof loadSong === 'function',
        statePresent: !!state.audioPlaybackContinuity
      };
    }

    const audio = els.audio;
    const originalApiJson = apiJson;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    let mediaTime = 57;
    let paused = false;
    const playerLoadCalls = [];
    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => { mediaTime = Number(value); }
      },
      paused: { configurable: true, get: () => paused },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 2 },
      src: {
        configurable: true,
        get: () => 'http://127.0.0.1/api/audio/stream?url=failed-renewal-fixture',
        set: () => {}
      }
    });
    apiJson = async (url) => {
      if (String(url).startsWith('/api/player/load?')) {
        playerLoadCalls.push(String(url));
        return { playable: false, url: '', error: 'fixture renewal failed' };
      }
      return {};
    };
    state.currentSong = {
      id: 'failed-recovery-backoff-test',
      title: 'Failed Recovery Backoff Test',
      provider: 'netease',
      duration: 240,
      position: mediaTime,
      playing: true
    };
    state.localQueueActive = false;

    const base = performance.now();
    resetAudioPlaybackContinuity(mediaTime, base);
    state.audioPlaybackContinuity.playingIntent = true;
    const beforeLimitResult = await monitorAudioPlaybackContinuity(base + 300);
    const firstFailureAt = base + 400;
    const firstResult = await monitorAudioPlaybackContinuity(firstFailureAt);
    const callsInsideBackoff = playerLoadCalls.length;
    const insideBackoffResult = await monitorAudioPlaybackContinuity(firstFailureAt + 1_000);
    const retryAt = firstFailureAt + AUDIO_PLAYBACK_RECOVERY_RETRY_MS + 100;
    const retryResult = await monitorAudioPlaybackContinuity(retryAt);
    const afterRetryResult = await monitorAudioPlaybackContinuity(retryAt + 100);
    const totalCalls = playerLoadCalls.length;

    apiJson = originalApiJson;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    paused = true;
    resetAudioPlaybackContinuity();

    return {
      pass: beforeLimitResult === 'watching'
        && firstResult === 'failed'
        && insideBackoffResult === 'backoff'
        && callsInsideBackoff === 1
        && retryResult === 'failed'
        && afterRetryResult === 'backoff'
        && totalCalls === 2,
      beforeLimitResult,
      firstResult,
      insideBackoffResult,
      retryResult,
      afterRetryResult,
      callsInsideBackoff,
      totalCalls
    };
  })()`, true);

  const productionStallWiring = await evaluate(`(async () => {
    if (
      typeof startBackgroundPolling !== 'function'
      || typeof clearBackgroundPolling !== 'function'
      || typeof resetAudioPlaybackContinuity !== 'function'
      || typeof monitorAudioPlaybackContinuity !== 'function'
      || !state.audioPlaybackContinuity
    ) {
      return {
        pass: false,
        startPollingPresent: typeof startBackgroundPolling === 'function',
        clearPollingPresent: typeof clearBackgroundPolling === 'function',
        resetPresent: typeof resetAudioPlaybackContinuity === 'function',
        monitorPresent: typeof monitorAudioPlaybackContinuity === 'function',
        statePresent: !!state.audioPlaybackContinuity
      };
    }

    const audio = els.audio;
    const originalLoadSong = loadSong;
    const previousSong = state.currentSong;
    const previousLocalQueueActive = state.localQueueActive;
    let mediaTime = 27;
    const recoveries = [];
    Object.defineProperties(audio, {
      currentTime: {
        configurable: true,
        get: () => mediaTime,
        set: (value) => { mediaTime = Number(value); }
      },
      paused: { configurable: true, get: () => false },
      ended: { configurable: true, get: () => false },
      seeking: { configurable: true, get: () => false },
      readyState: { configurable: true, get: () => 4 },
      src: {
        configurable: true,
        get: () => 'http://127.0.0.1/api/audio/stream?url=production-stall-fixture',
        set: () => {}
      }
    });
    loadSong = async (song, options) => {
      recoveries.push({ song: { ...song }, options: { ...options } });
      return true;
    };
    state.currentSong = {
      id: 'production-stall-wiring-test',
      title: 'Production Stall Wiring Test',
      duration: 240,
      position: mediaTime,
      playing: true
    };
    state.localQueueActive = false;

    resetAudioPlaybackContinuity(mediaTime);
    state.audioPlaybackContinuity.playingIntent = true;
    clearBackgroundPolling();
    startBackgroundPolling();
    audio.dispatchEvent(new Event('waiting'));
    audio.dispatchEvent(new Event('stalled'));
    const stallHintRegistered = state.audioPlaybackContinuity.stallHintAt > 0;
    const confirmedStallAt = Math.max(
      state.audioPlaybackContinuity.lastAdvanceAt,
      state.audioPlaybackContinuity.stallHintAt
    ) + 400;
    const recoveryResult = await monitorAudioPlaybackContinuity(confirmedStallAt);
    clearBackgroundPolling();

    const recovery = recoveries[0];
    loadSong = originalLoadSong;
    state.currentSong = previousSong;
    state.localQueueActive = previousLocalQueueActive;
    resetAudioPlaybackContinuity();

    return {
      pass: stallHintRegistered
        && recoveryResult === 'recovered'
        && recoveries.length === 1
        && recovery?.song?.id === 'production-stall-wiring-test'
        && Math.abs(Number(recovery?.options?.position) - 27) < 0.001
        && recovery?.options?.recovery === true,
      stallHintRegistered,
      recoveryResult,
      recoveryCount: recoveries.length,
      recoveryPosition: Number(recovery?.options?.position)
    };
  })()`, true);

  result.backendClockStartsAfterUrlResolution = backendClockStartsAfterUrlResolution;
  result.staleSameSongPollContinuity = staleSameSongPollContinuity;
  result.inFlightLoadPollContinuity = inFlightLoadPollContinuity;
  result.outOfOrderStatePollContinuity = outOfOrderStatePollContinuity;
  result.explicitUserSeekMayMoveBackward = explicitUserSeekMayMoveBackward;
  result.stalledPlaybackRecovery = stalledPlaybackRecovery;
  result.transientBufferingContinuity = transientBufferingContinuity;
  result.failedRecoveryBackoff = failedRecoveryBackoff;
  result.productionContinuityWiring = {
    pass: waitingAndStalledHandlersBound
      && continuityMonitorIntervalBound
      && productionStallWiring.pass,
    waitingAndStalledHandlersBound,
    continuityMonitorIntervalBound,
    runtime: productionStallWiring
  };
  result.pass = result.pass
    && backendClockStartsAfterUrlResolution
    && staleSameSongPollContinuity.pass
    && inFlightLoadPollContinuity.pass
    && outOfOrderStatePollContinuity.pass
    && explicitUserSeekMayMoveBackward.pass
    && stalledPlaybackRecovery.pass
    && transientBufferingContinuity.pass
    && failedRecoveryBackoff.pass
    && result.productionContinuityWiring.pass;

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try {
    if (socket?.readyState === 1) {
      await Promise.race([
        command('Browser.close').catch(() => {}),
        delay(500)
      ]);
    }
  } catch {
  }
  if (socket && socket.readyState <= 1) socket.close();
  if (browser.exitCode === null) {
    const browserExited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([browserExited, delay(1000)]);
  }
  browser.stderr?.destroy();
  server.closeAllConnections?.();
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    delay(1000)
  ]);
  await delay(250);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
  }
}
