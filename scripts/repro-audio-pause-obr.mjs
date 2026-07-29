import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const profile = path.resolve(tmpdir(), `fe-monster-audio-pause-obr-${randomUUID()}`);
const sampleRate = 48_000;
const durationSeconds = 30;
const initialBufferedSeconds = 2;
const normalNetworkPauseMs = 2_400;
const seekResponseDelayMs = 900;
const wav = createStereoWav(sampleRate, durationSeconds);
const initialByteCount = Math.min(
  wav.length,
  44 + (sampleRate * 4 * initialBufferedSeconds)
);
const liveResponses = new Set();
let seekRequestsArmed = false;
let delayedSeekRequests = 0;

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

function createStereoWav(rate, seconds) {
  const frames = rate * seconds;
  const buffer = Buffer.allocUnsafe(44 + frames * 4);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const left = Math.sin((2 * Math.PI * 220 * frame) / rate) * 0.18;
    const right = Math.sin((2 * Math.PI * 330 * frame) / rate) * 0.14;
    buffer.writeInt16LE(Math.round(left * 32767), 44 + frame * 4);
    buffer.writeInt16LE(Math.round(right * 32767), 46 + frame * 4);
  }
  return buffer;
}

function serveAudio(request, response) {
  const range = request.headers.range || '';
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match && match[2] ? Number(match[2]) : wav.length - 1;
  const end = Math.min(wav.length - 1, Math.max(start, requestedEnd));
  const body = wav.subarray(start, end + 1);
  const headers = {
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-type': 'audio/wav',
    'content-length': body.length
  };
  if (match) headers['content-range'] = `bytes ${start}-${end}/${wav.length}`;
  response.writeHead(match ? 206 : 200, headers);
  liveResponses.add(response);
  response.once('close', () => liveResponses.delete(response));

  if (seekRequestsArmed) {
    delayedSeekRequests += 1;
    setTimeout(() => {
      if (!response.destroyed) response.end(body);
    }, seekResponseDelayMs);
    return;
  }

  const relativeInitialBytes = Math.max(0, Math.min(body.length, initialByteCount - start));
  response.write(body.subarray(0, relativeInitialBytes));
  setTimeout(() => {
    if (!response.destroyed) response.end(body.subarray(relativeInitialBytes));
  }, normalNetworkPauseMs);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/fixture.wav') {
    serveAudio(request, response);
    return;
  }
  if (url.pathname === '/arm-seek') {
    seekRequestsArmed = true;
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const componentAsset = requestPath.startsWith('/components/');
  const root = componentAsset ? componentsRoot : webRoot;
  const relative = componentAsset
    ? requestPath.slice('/components/'.length)
    : requestPath.slice(1);
  const file = path.resolve(root, decodeURIComponent(relative));
  if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Fixture server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
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

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const debugPort = await activeDebugPort();
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
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
  await command('Page.navigate', { url: `${baseUrl}/?audio-pause-obr-repro=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'
    && typeof refreshPlayerState === 'function'
    && typeof setGoogleObrSpatialAudioEnabled === 'function'
    && typeof ensureAudioAnalysis === 'function'
    && typeof state !== 'undefined'
    && typeof els !== 'undefined'
    && els.audio`);

  const result = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const originalSong = state.currentSong;
    const originalLocalQueueActive = state.localQueueActive;
    const eventNames = ['play', 'playing', 'timeupdate', 'seeking', 'seeked', 'waiting', 'stalled', 'pause'];
    const events = [];
    const listeners = new Map();
    const record = (type) => {
      events.push({
        type,
        at: performance.now(),
        currentTime: Number(audio.currentTime) || 0,
        readyState: Number(audio.readyState) || 0,
        contextState: state.audioAnalysis.context?.state || ''
      });
    };
    for (const name of eventNames) {
      const listener = () => record(name);
      listeners.set(name, listener);
      audio.addEventListener(name, listener);
    }
    const wait = async (predicate, timeout = 15_000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeout) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return false;
    };

    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    const normalSong = {
      id: 'normal-playback-stall-repro',
      title: 'Normal playback stall repro',
      artist: 'FE Monster QA',
      provider: 'fixture',
      duration: ${durationSeconds},
      playing: true
    };
    apiJson = async (url) => String(url).startsWith('/api/player/load?')
      ? {
          song: normalSong,
          playable: true,
          url: ${JSON.stringify(`${baseUrl}/fixture.wav`)},
          quality: 'standard'
        }
      : {};
    const normalLoadStartedAt = performance.now();
    const normalLoaded = await loadSong(normalSong, { silent: true });
    const normalPlaybackStartedAt = performance.now();
    const normalSamples = [];
    let normalMaximumFrozenMs = 0;
    let normalFrozenStartedAt = Number.NaN;
    let normalPreviousTime = Number(audio.currentTime) || 0;
    while (performance.now() - normalPlaybackStartedAt < 4_500 && Number(audio.currentTime) < 2.2) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const now = performance.now();
      const current = Number(audio.currentTime) || 0;
      normalSamples.push({
        elapsed: Math.round(now - normalPlaybackStartedAt),
        currentTime: Number(current.toFixed(3)),
        readyState: Number(audio.readyState),
        paused: audio.paused
      });
      if (!audio.paused && current <= normalPreviousTime + 0.005 && current > 0.08) {
        if (!Number.isFinite(normalFrozenStartedAt)) normalFrozenStartedAt = now;
        normalMaximumFrozenMs = Math.max(normalMaximumFrozenMs, now - normalFrozenStartedAt);
      } else {
        normalFrozenStartedAt = Number.NaN;
      }
      normalPreviousTime = current;
    }
    const normalPlayback = {
      pass: normalLoaded
        && Number(audio.currentTime) >= 2.2
        && normalMaximumFrozenMs < 300,
      loaded: normalLoaded,
      loadLatencyMs: Math.round(normalPlaybackStartedAt - normalLoadStartedAt),
      finalTime: Number((Number(audio.currentTime) || 0).toFixed(3)),
      maximumFrozenMs: Math.round(normalMaximumFrozenMs),
      waitingEvents: events.filter((event) => event.type === 'waiting').length,
      samples: normalSamples.filter((sample, index) => (
        index % 4 === 0
        || sample.readyState < 3
      )).slice(0, 40)
    };
    audio.pause();
    events.length = 0;

    state.localQueueActive = false;
    state.currentSong = {
      id: 'obr-pause-repro',
      title: 'OBR pause repro',
      artist: 'FE Monster QA',
      provider: 'local',
      duration: ${durationSeconds},
      playing: true
    };
    audio.src = ${JSON.stringify(`${baseUrl}/fixture.wav`)};
    audio.volume = 0.01;
    await audio.play();
    const analysisReady = await ensureAudioAnalysis({ announceObrFailure: false });
    const obrEnabled = await setGoogleObrSpatialAudioEnabled(true, { announce: false });
    const graphReady = await wait(
      () => state.obrSpatialAudio.enabled
        && state.obrSpatialAudio.processedBlocks > 0
        && state.audioAnalysis.context?.state === 'running'
        && Number(audio.currentTime) > 0.2
    );

    const beforePollTime = Number(audio.currentTime);
    const targetPosition = 10.5;
    apiJson = async (url) => String(url) === '/api/player/state'
      ? {
          song: {
            id: 'obr-pause-repro',
            title: 'OBR pause repro',
            artist: 'FE Monster QA',
            provider: 'local',
            duration: ${durationSeconds}
          },
          queue: [],
          queueIndex: -1,
          position: targetPosition,
          duration: ${durationSeconds},
          playing: true,
          paused: false,
          volume: 0.01,
          url: ${JSON.stringify(`${baseUrl}/fixture.wav`)}
        }
      : {};

    await fetch('/arm-seek', { cache: 'no-store' });
    const triggerAt = performance.now();
    await refreshPlayerState();
    const postPollTime = Number(audio.currentTime);
    const postPollLabel = els.currentTime?.textContent || '';
    let firstAdvanceAt = Number.NaN;
    const samples = [];
    while (performance.now() - triggerAt < 1_500) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const now = performance.now();
      const current = Number(audio.currentTime);
      samples.push({
        elapsed: Math.round(now - triggerAt),
        currentTime: Number(current.toFixed(3)),
        label: els.currentTime?.textContent || '',
        readyState: Number(audio.readyState),
        contextState: state.audioAnalysis.context?.state || ''
      });
      if (!Number.isFinite(firstAdvanceAt) && current - postPollTime >= 0.035) {
        firstAdvanceAt = now;
      }
      if (Number.isFinite(firstAdvanceAt)) break;
    }
    const frozenForMs = Number.isFinite(firstAdvanceAt)
      ? Math.round(firstAdvanceAt - triggerAt)
      : Math.round(performance.now() - triggerAt);
    const seamEvents = events.filter((event) => event.at >= triggerAt);
    const seekingEvents = seamEvents.filter((event) => event.type === 'seeking').length;
    const waitingEvents = seamEvents.filter((event) => event.type === 'waiting').length;

    audio.pause();
    apiJson = originalApiJson;
    state.currentSong = originalSong;
    state.localQueueActive = originalLocalQueueActive;
    for (const [name, listener] of listeners) audio.removeEventListener(name, listener);

    return {
      pass: normalPlayback.pass
        && analysisReady
        && obrEnabled
        && graphReady
        && seekingEvents === 0
        && waitingEvents === 0
        && postPollTime < beforePollTime + 1
        && frozenForMs < 250,
      analysisReady,
      obrEnabled,
      graphReady,
      sourceMode: state.audioAnalysis.sourceMode,
      obrBackend: state.obrSpatialAudio.backend,
      processedBlocks: state.obrSpatialAudio.processedBlocks,
      audioContextState: state.audioAnalysis.context?.state || '',
      normalPlayback,
      trigger: {
        beforePollTime: Number(beforePollTime.toFixed(3)),
        polledSameSongPosition: targetPosition,
        postPollTime: Number(postPollTime.toFixed(3)),
        postPollLabel
      },
      symptom: {
        seekingEvents,
        waitingEvents,
        frozenForMs,
        seamEvents,
        samples: samples.slice(0, 12)
      },
      expected: {
        seekingEvents: 0,
        waitingEvents: 0,
        maxFrozenMs: 250,
        maxClockDiscontinuitySeconds: 1,
        noForcedSeekFromOnePoll: true
      }
    };
  })()`, true);

  result.delayedSeekRequests = delayedSeekRequests;
  console.log(JSON.stringify(result, null, 2));
  assert.equal(
    result.pass,
    true,
    `Playback stalled for ${result.normalPlayback?.maximumFrozenMs} ms before the OBR polling seam`
  );
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
  try {
    socket?.close();
  } catch {
  }
  if (browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      delay(2_000)
    ]);
  }
  for (const response of liveResponses) response.destroy();
  await new Promise((resolve) => server.close(resolve));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
  }
}
