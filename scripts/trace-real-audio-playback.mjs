import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const appUrl = process.env.FE_AUDIO_TRACE_URL || 'http://127.0.0.1:3000/';
const traceSeconds = Math.max(8, Number(process.env.FE_AUDIO_TRACE_SECONDS || 35));
const obrEnabled = /^(1|on|true)$/i.test(process.env.FE_AUDIO_TRACE_OBR || 'off');
const externalDebugPort = Math.max(0, Number(process.env.FE_AUDIO_TRACE_DEBUG_PORT || 0));
const switchCount = Math.max(0, Math.min(5, Number(process.env.FE_AUDIO_TRACE_SWITCHES || 0)));
const playbackQuality = String(process.env.FE_AUDIO_TRACE_QUALITY || '').trim();
const outageAtMs = Math.max(0, Number(process.env.FE_AUDIO_TRACE_OUTAGE_AT_MS || 0));
const outageDurationMs = Math.max(0, Number(process.env.FE_AUDIO_TRACE_OUTAGE_MS || 0));
const profile = path.resolve(tmpdir(), `fe-monster-real-audio-${randomUUID()}`);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

async function findRealNeteaseCandidates(limit = 1) {
  const candidates = [];
  try {
    const feed = await fetch('http://127.0.0.1:3010/personalized/newsong?limit=20');
    if (!feed.ok) return null;
    const payload = await feed.json();
    for (const entry of payload?.result || []) {
      const song = entry?.song || entry;
      const id = String(song?.id || '');
      if (!id) continue;
      const playback = await fetch(`http://127.0.0.1:3010/song/url?id=${encodeURIComponent(id)}&level=standard`);
      if (!playback.ok) continue;
      const resolved = (await playback.json())?.data?.[0];
      if (!resolved?.url || Number(resolved?.code) !== 200) continue;
      candidates.push({
        id,
        title: String(song?.name || entry?.name || `NetEase ${id}`),
        artist: (song?.artists || song?.ar || []).map((artist) => artist?.name).filter(Boolean).join(' / ') || 'NetEase',
        album: String(song?.album?.name || song?.al?.name || ''),
        cover: String(song?.album?.picUrl || song?.al?.picUrl || entry?.picUrl || ''),
        provider: 'netease',
        duration: Math.max(0, Number(song?.duration || song?.dt || resolved?.time || 0) / (Number(song?.duration || song?.dt || 0) > 10_000 ? 1000 : 1))
      });
      if (candidates.length >= limit) break;
    }
  } catch {}
  return candidates;
}

const browser = externalDebugPort ? null : spawn(edge, [
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
browser?.stderr?.on('data', (chunk) => { browserError += String(chunk); });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;
const audioNetworkRequests = new Map();

async function activeDebugPort() {
  if (externalDebugPort) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${externalDebugPort}/json/version`);
        if (response.ok) return externalDebugPort;
      } catch {}
      await delay(50);
    }
    throw new Error(`Existing WebView2 debugging endpoint did not respond on ${externalDebugPort}`);
  }
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser?.exitCode !== null) break;
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

const instrumentation = String.raw`(() => {
  const trace = {
    startedAt: performance.now(),
    calls: [],
    events: [],
    samples: [],
    longTasks: [],
    rafGaps: [],
    consoleErrors: [],
    expectedTransitions: []
  };
  const compactStack = () => String(new Error().stack || '')
    .split('\n')
    .slice(2, 8)
    .map((line) => line.trim())
    .join(' | ');
  const audioSnapshot = (audio) => {
    let appState = null;
    try { appState = typeof state !== 'undefined' ? state : null; } catch {}
    return {
      at: performance.now(),
      currentTime: Number(audio?.currentTime || 0),
      duration: Number.isFinite(audio?.duration) ? audio.duration : 0,
      paused: !!audio?.paused,
      ended: !!audio?.ended,
      seeking: !!audio?.seeking,
      readyState: Number(audio?.readyState || 0),
      networkState: Number(audio?.networkState || 0),
      playbackRate: Number(audio?.playbackRate || 0),
      volume: Number(audio?.volume || 0),
      muted: !!audio?.muted,
      src: String(audio?.currentSrc || audio?.src || ''),
      buffered: (() => {
        const ranges = [];
        try {
          for (let i = 0; i < audio.buffered.length; i += 1) {
            ranges.push([audio.buffered.start(i), audio.buffered.end(i)]);
          }
        } catch {}
        return ranges;
      })(),
      playingIntent: !!appState?.audioPlaybackContinuity?.playingIntent,
      sourceGeneration: Number(appState?.audioPlaybackContinuity?.sourceGeneration || 0),
      audioContextState: String(appState?.audioAnalysis?.context?.state || ''),
      obrRequested: !!appState?.obrSpatialAudio?.requested,
      obrEnabled: !!appState?.obrSpatialAudio?.enabled,
      obrStatus: String(appState?.obrSpatialAudio?.status || ''),
      obrBackend: String(appState?.obrSpatialAudio?.backend || ''),
      elementTag: String(audio?.tagName || ''),
      elementId: String(audio?.id || '')
    };
  };
  globalThis.__FE_REAL_AUDIO_TRACE__ = trace;
  globalThis.__FE_AUDIO_SNAPSHOT__ = audioSnapshot;

  const mediaPrototype = HTMLMediaElement.prototype;
  for (const method of ['play', 'pause', 'load']) {
    const original = mediaPrototype[method];
    if (typeof original !== 'function') continue;
    mediaPrototype[method] = function(...args) {
      trace.calls.push({ method, ...audioSnapshot(this), stack: compactStack() });
      try {
        const result = original.apply(this, args);
        if (result?.catch) result.catch((error) => {
          trace.calls.push({ method: method + ':rejected', error: String(error), ...audioSnapshot(this) });
        });
        return result;
      } catch (error) {
        trace.calls.push({ method: method + ':threw', error: String(error), ...audioSnapshot(this) });
        throw error;
      }
    };
  }

  const srcDescriptor = Object.getOwnPropertyDescriptor(mediaPrototype, 'src');
  if (srcDescriptor?.get && srcDescriptor?.set) {
    Object.defineProperty(mediaPrototype, 'src', {
      configurable: srcDescriptor.configurable,
      enumerable: srcDescriptor.enumerable,
      get: srcDescriptor.get,
      set(value) {
        trace.calls.push({ method: 'src=', value: String(value), ...audioSnapshot(this), stack: compactStack() });
        return srcDescriptor.set.call(this, value);
      }
    });
  }

  const currentTimeDescriptor = Object.getOwnPropertyDescriptor(mediaPrototype, 'currentTime');
  if (currentTimeDescriptor?.get && currentTimeDescriptor?.set) {
    Object.defineProperty(mediaPrototype, 'currentTime', {
      configurable: currentTimeDescriptor.configurable,
      enumerable: currentTimeDescriptor.enumerable,
      get: currentTimeDescriptor.get,
      set(value) {
        trace.calls.push({ method: 'currentTime=', value: Number(value), ...audioSnapshot(this), stack: compactStack() });
        return currentTimeDescriptor.set.call(this, value);
      }
    });
  }

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (this instanceof HTMLMediaElement && String(name).toLowerCase() === 'src') {
      trace.calls.push({ method: 'setAttribute(src)', value: String(value), ...audioSnapshot(this), stack: compactStack() });
    }
    return originalSetAttribute.apply(this, arguments);
  };

  const bindAudio = () => {
    const audio = document.querySelector('#audio') || document.querySelector('audio');
    if (!audio || audio.dataset.feTraceBound === 'true') return;
    audio.dataset.feTraceBound = 'true';
    for (const type of [
      'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
      'play', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'emptied',
      'abort', 'error', 'seeking', 'seeked', 'durationchange', 'ratechange',
      'volumechange', 'ended', 'progress', 'timeupdate'
    ]) {
      audio.addEventListener(type, () => {
        trace.events.push({ type, ...audioSnapshot(audio), error: audio.error ? {
          code: audio.error.code,
          message: audio.error.message
        } : null });
      }, true);
    }
  };

  globalThis.__FE_BIND_REAL_AUDIO_TRACE__ = () => {
    const audio = globalThis.els?.audio || document.querySelector('#audio') || document.querySelector('audio');
    if (audio?.dataset) delete audio.dataset.feTraceBound;
    bindAudio();
    trace.playbackStartedAt = performance.now();
  };
  globalThis.__FE_MARK_AUDIO_TRANSITION__ = (songId) => {
    trace.expectedTransitions.push({ at: performance.now(), songId: String(songId || '') });
  };

  document.addEventListener('DOMContentLoaded', bindAudio, { once: true });
  const bindTimer = setInterval(() => {
    bindAudio();
    const audio = document.querySelector('#audio') || document.querySelector('audio');
    if (audio) trace.samples.push(audioSnapshot(audio));
  }, 100);
  globalThis.__FE_STOP_AUDIO_TRACE__ = () => clearInterval(bindTimer);

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        trace.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {}

  let lastFrame = performance.now();
  const frame = (now) => {
    const gap = now - lastFrame;
    if (gap > 100) trace.rafGaps.push({ at: now, gap });
    lastFrame = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  addEventListener('error', (event) => trace.consoleErrors.push(String(event.error || event.message || event)));
  addEventListener('unhandledrejection', (event) => trace.consoleErrors.push(String(event.reason || event)));
})();`;

function analyseTrace(trace) {
  const samples = (trace.samples || []).filter((sample) =>
    !trace.playbackStartedAt || sample.at >= trace.playbackStartedAt
  );
  const freezes = [];
  let runStart = null;
  let runLast = null;
  let maxBufferedAhead = 0;
  let longestFrozenMs = 0;

  const nearExpectedTransition = (at) => (trace.expectedTransitions || []).some((transition) =>
    at >= transition.at - 250 && at <= transition.at + 1800
  );

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const delta = current.currentTime - previous.currentTime;
    const expectedPlaying = !current.paused && !current.ended;
    const bufferedEnd = current.buffered?.find(([start, end]) => current.currentTime >= start - 0.05 && current.currentTime <= end + 0.05)?.[1] || 0;
    maxBufferedAhead = Math.max(maxBufferedAhead, bufferedEnd - current.currentTime);
    const frozen = expectedPlaying && !current.seeking && delta < 0.005;
    if (frozen) {
      if (!runStart) runStart = previous;
      runLast = current;
    } else if (runStart && runLast) {
      const durationMs = runLast.at - runStart.at;
      longestFrozenMs = Math.max(longestFrozenMs, durationMs);
      if (durationMs >= 650) freezes.push({
        startAt: runStart.at,
        endAt: runLast.at,
        durationMs,
        currentTime: runLast.currentTime,
        readyState: runLast.readyState,
        networkState: runLast.networkState,
        buffered: runLast.buffered,
        audioContextState: runLast.audioContextState,
        obrEnabled: runLast.obrEnabled
      });
      runStart = null;
      runLast = null;
    }
  }
  if (runStart && runLast && runLast.at - runStart.at >= 650) {
    longestFrozenMs = Math.max(longestFrozenMs, runLast.at - runStart.at);
    freezes.push({
      startAt: runStart.at,
      endAt: runLast.at,
      durationMs: runLast.at - runStart.at,
      currentTime: runLast.currentTime,
      readyState: runLast.readyState,
      networkState: runLast.networkState,
      buffered: runLast.buffered,
      audioContextState: runLast.audioContextState,
      obrEnabled: runLast.obrEnabled
    });
  }

  const firstPlaying = trace.events?.find((event) =>
    event.type === 'playing' && (!trace.playbackStartedAt || event.at >= trace.playbackStartedAt)
  ) || samples.find((sample) => !sample.paused && sample.currentTime > 0.2);
  const unexpectedPauses = (trace.events || []).filter((event) =>
    event.type === 'pause'
      && (!trace.playbackStartedAt || event.at >= trace.playbackStartedAt)
      && !nearExpectedTransition(event.at)
      && event.playingIntent
      && !event.ended
  );
  const fatalEvents = (trace.events || []).filter((event) =>
    ['error', 'abort', 'emptied'].includes(event.type) && !nearExpectedTransition(event.at)
  );
  return {
    pass: !!firstPlaying && freezes.length === 0 && unexpectedPauses.length === 0 && fatalEvents.length === 0,
    sampleCount: samples.length,
    firstSample: samples[0] || null,
    lastSample: samples.at(-1) || null,
    firstPlaying,
    freezes,
    longestFrozenMs,
    unexpectedPauses,
    fatalEvents,
    waiting: (trace.events || []).filter((event) => event.type === 'waiting'),
    stalled: (trace.events || []).filter((event) => event.type === 'stalled'),
    suspend: (trace.events || []).filter((event) => event.type === 'suspend'),
    maxBufferedAhead,
    sourceChanges: (trace.calls || []).filter((call) => call.elementTag === 'AUDIO' && ['src=', 'setAttribute(src)', 'load'].includes(call.method)),
    pauseCalls: (trace.calls || []).filter((call) => call.elementTag === 'AUDIO' && call.method === 'pause'),
    playCalls: (trace.calls || []).filter((call) => call.elementTag === 'AUDIO' && call.method.startsWith('play')),
    currentTimeWrites: (trace.calls || []).filter((call) => call.elementTag === 'AUDIO' && call.method === 'currentTime='),
    longTasks: trace.longTasks || [],
    rafGaps: trace.rafGaps || [],
    consoleErrors: trace.consoleErrors || []
    ,expectedTransitions: trace.expectedTransitions || []
  };
}

function audioNetworkSummary() {
  return [...audioNetworkRequests.values()].map((entry) => ({
    requestId: entry.requestId,
    url: entry.url,
    range: entry.range,
    requestAt: entry.requestAt,
    responseAt: entry.responseAt,
    finishedAt: entry.finishedAt,
    failedAt: entry.failedAt,
    status: entry.status,
    mimeType: entry.mimeType,
    contentLength: entry.contentLength,
    contentRange: entry.contentRange,
    acceptRanges: entry.acceptRanges,
    encodedBytes: entry.encodedBytes || 0,
    errorText: entry.errorText || ''
  }));
}

try {
  const realNeteaseCandidates = await findRealNeteaseCandidates(Math.max(1, switchCount + 1));
  const realNeteaseCandidate = realNeteaseCandidates[0] || null;
  const port = await activeDebugPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      const params = message.params || {};
      if (message.method === 'Network.requestWillBeSent' && String(params.request?.url || '').includes('/api/audio/stream')) {
        audioNetworkRequests.set(params.requestId, {
          requestId: params.requestId,
          url: String(params.request.url || ''),
          range: String(params.request.headers?.Range || params.request.headers?.range || ''),
          requestAt: Number(params.timestamp) || 0,
          encodedBytes: 0
        });
      } else if (message.method === 'Network.responseReceived' && audioNetworkRequests.has(params.requestId)) {
        const entry = audioNetworkRequests.get(params.requestId);
        const headers = params.response?.headers || {};
        Object.assign(entry, {
          responseAt: Number(params.timestamp) || 0,
          status: Number(params.response?.status) || 0,
          mimeType: String(params.response?.mimeType || ''),
          contentLength: String(headers['Content-Length'] || headers['content-length'] || ''),
          contentRange: String(headers['Content-Range'] || headers['content-range'] || ''),
          acceptRanges: String(headers['Accept-Ranges'] || headers['accept-ranges'] || '')
        });
      } else if (message.method === 'Network.dataReceived' && audioNetworkRequests.has(params.requestId)) {
        const entry = audioNetworkRequests.get(params.requestId);
        entry.encodedBytes += Number(params.encodedDataLength) || Number(params.dataLength) || 0;
      } else if (message.method === 'Network.loadingFinished' && audioNetworkRequests.has(params.requestId)) {
        const entry = audioNetworkRequests.get(params.requestId);
        entry.finishedAt = Number(params.timestamp) || 0;
        entry.encodedBytes = Math.max(entry.encodedBytes || 0, Number(params.encodedDataLength) || 0);
      } else if (message.method === 'Network.loadingFailed' && audioNetworkRequests.has(params.requestId)) {
        const entry = audioNetworkRequests.get(params.requestId);
        entry.failedAt = Number(params.timestamp) || 0;
        entry.errorText = String(params.errorText || '');
      }
      return;
    }
    if (!pending.has(message.id)) return;
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
  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]);
  await command('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  const navigationUrl = new URL(appUrl);
  navigationUrl.searchParams.set('real-audio-trace', String(Date.now()));
  await command('Page.navigate', { url: navigationUrl.toString() });
  await waitFor(`document.readyState === 'complete'
    && typeof loadSong === 'function'
    && typeof setGoogleObrSpatialAudioEnabled === 'function'
    && typeof state !== 'undefined'
    && typeof els !== 'undefined'
    && !!els.audio`, 30_000);

  const launch = await evaluate(`(async () => {
    const backend = await fetch('/api/player/state', { cache: 'no-store' }).then((response) => response.json());
    const queue = Array.isArray(backend.queue) ? backend.queue : [];
    const verifiedNeteaseCandidate = ${JSON.stringify(realNeteaseCandidate)};
    const candidate = verifiedNeteaseCandidate
      || queue.find((song) => song.provider === 'netease' && song.id)
      || queue.find((song) => song.provider === 'qq' && song.id)
      || queue.find((song) => song.id)
      || backend.song;
    if (!candidate?.id) return { ok: false, reason: 'No real song exists in /api/player/state', backend };
    await setGoogleObrSpatialAudioEnabled(${obrEnabled});
    __FE_BIND_REAL_AUDIO_TRACE__?.();
    const loaded = await loadSong(candidate, { autoplay: true, silent: true, quality: ${JSON.stringify(playbackQuality)} });
    return {
      ok: loaded !== false,
      candidate,
      backendPlaying: !!backend.playing,
      obrRequested: !!state.obrSpatialAudio?.requested,
      obrEnabled: !!state.obrSpatialAudio?.enabled,
      audio: __FE_AUDIO_SNAPSHOT__(els.audio)
    };
  })()`, true);
  assert.equal(launch?.ok, true, `Could not launch a real song: ${JSON.stringify(launch)}`);
  await waitFor(`els.audio && !els.audio.paused && els.audio.currentTime > 0.2`, 30_000);
  const traceStartedAt = Date.now();
  if (outageAtMs > 0 && outageDurationMs > 0) {
    await delay(outageAtMs);
    await command('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'none'
    });
    try {
      await delay(outageDurationMs);
    } finally {
      await command('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: 'wifi'
      });
    }
  } else if (switchCount > 0) {
    const switchSpacingMs = Math.max(4_000, Math.floor(traceSeconds * 1000 / (switchCount + 1)));
    for (let index = 0; index < switchCount; index += 1) {
      const targetAt = traceStartedAt + switchSpacingMs * (index + 1);
      await delay(Math.max(0, targetAt - Date.now()));
      const song = realNeteaseCandidates[index + 1];
      assert.ok(song?.id, `No real NetEase song exists for switch ${index + 1}`);
      const switched = await evaluate(`(async () => {
        const song = ${JSON.stringify(song)};
        __FE_MARK_AUDIO_TRANSITION__?.(song.id);
        const loaded = await loadSong(song, { autoplay: true, silent: true, quality: ${JSON.stringify(playbackQuality)} });
        return { loaded, song, audio: __FE_AUDIO_SNAPSHOT__(els.audio) };
      })()`, true);
      assert.equal(switched?.loaded, true, `Real song switch ${index + 1} failed: ${JSON.stringify(switched)}`);
      await waitFor(`els.audio && !els.audio.paused && els.audio.currentTime > 0.12`, 30_000);
    }
  }
  await delay(Math.max(0, traceSeconds * 1000 - (Date.now() - traceStartedAt)));
  const trace = await evaluate(`(() => {
    __FE_STOP_AUDIO_TRACE__?.();
    return __FE_REAL_AUDIO_TRACE__;
  })()`);
  const analysis = analyseTrace(trace);
  const result = {
    pass: analysis.pass,
    url: appUrl,
    runtime: externalDebugPort ? 'winforms-webview2-gpu-xaudio2' : 'headless-edge-disable-gpu',
    traceSeconds,
    switchCount,
    playbackQuality: playbackQuality || 'preferred',
    outage: outageAtMs > 0 && outageDurationMs > 0
      ? { atMs: outageAtMs, durationMs: outageDurationMs }
      : null,
    obrRequested: obrEnabled,
    launch,
    analysis,
    network: audioNetworkSummary()
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try {
    if (!externalDebugPort && socket?.readyState === 1) {
      await Promise.race([
        command('Browser.close').catch(() => {}),
        delay(500)
      ]);
    }
  } catch {
  }
  if (socket && socket.readyState <= 1) socket.close();
  if (browser?.exitCode === null) browser.kill();
  await delay(250);
  if (!externalDebugPort) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {}
  }
}
