import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

// Regression probe for the user-visible hitch when opening the mixer while music
// is already playing.  This intentionally measures the real browser modules and
// keeps the audio/service fixtures inert: merely opening settings must not mutate
// or restart the native chain.

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 31_000 + Math.floor(Math.random() * 7_000);
const profile = path.join(root, '.tmp', `fe-mixer-open-perf-${process.pid}-${Date.now().toString(36)}`);
const browserErrors = [];
const requests = [];
const pending = new Map();
let nextId = 1;
let browser;
let socket;

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);
mkdirSync(profile, { recursive: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cleanParameters() {
  return {
    enabled: true,
    inputGainDb: 0,
    outputGainDb: 0,
    balance: 0,
    eqDb: Array(10).fill(0),
    stereoWidth: 1,
    centerGain: 1,
    surroundGain: 1,
    lfeGain: 1,
    compressorEnabled: false,
    compressorThresholdDb: -18,
    compressorRatio: 2,
    compressorAttackMs: 10,
    compressorReleaseMs: 150,
    compressorKneeDb: 6,
    compressorMakeupDb: 0,
    limiterEnabled: true,
    limiterCeilingDb: -0.3,
    limiterReleaseMs: 100,
    reverbEnabled: false,
    reverbRoomSize: 0.35,
    reverbDecayMs: 800,
    reverbDamping: 0.5,
    reverbPreDelayMs: 12,
    reverbWet: 0,
    reverbDry: 1,
    upmixEnabled: true,
    upmixAlgorithm: 'matrix-decode',
    upmixOutputLayout: '7.1',
    upmixCenterWidthHz: 300,
    upmixLfeCrossoverHz: 120,
    upmixCenterGain: 0.707,
    upmixSurroundGain: 0.5,
    upmixLfeGain: 0.707,
    upmixDecorrelation: 0.7,
    obrEnabled: true,
    obrFilterProfile: 'direct',
    obrWet: 1,
    obrDry: 0,
    obrOutputGainDb: 0,
    obrSpatialWidth: 1
  };
}

const presetIds = [
  ['clean', '纯净'],
  ['bathroom', '浴室'],
  ['hall', '大厅'],
  ['surround-3d', '3D环绕'],
  ['cinema', '影院'],
  ['vocal-clear', '人声清晰'],
  ['bass-boost', '低频增强'],
  ['night', '夜间']
];
const parameters = cleanParameters();

function mixerSnapshot() {
  return {
    ok: true,
    version: 1,
    presetVersion: 1,
    revision: 11,
    selectedPreset: 'surround-3d',
    configState: 'ready',
    parameters,
    nativeBackendAvailable: true,
    nativeChainActive: true,
    mixerAvailable: true,
    mixerActive: true,
    mixerEnabled: true,
    mixerFailureDisabled: false,
    bypassReason: '',
    lastResult: 0,
    processCalls: 200,
    bypassedBlocks: 0,
    processFailures: 0,
    consecutiveFailures: 0,
    partialFailureBypasses: 0,
    activeRevision: 11,
    stagedRevision: 11,
    upmix: { available: true, enabled: true, active: true, algorithm: 'rust-upmix-v1' },
    obr: { available: true, enabled: true, active: true, backend: 'google-obr' },
    order: { upmix: 1, mixer: 2, obr: 3 },
    playbackState: 'native-mixer'
  };
}

function channelSnapshot() {
  return {
    revision: 8,
    layout: '7.1',
    algorithm: 'matrix-decode',
    lfeCrossoverHz: 120,
    channelOrder: ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'],
    channelGainDb: [0, 0, -1, -3, -2, -2, -2, -2],
    channelDelayMs: [0, 0, 1, 0, 7, 7, 5, 5],
    channelAzimuthDeg: [30, -30, 0, 0, 135, -135, 90, -90],
    customMatrix: [1, 0, 0, 1, 0.707, 0.707, 0.2, 0.2, 0.2, -0.2, -0.2, 0.2, 0.1, -0.1, -0.1, 0.1],
    configState: 'ready',
    controlAvailable: true,
    nativeBackendAvailable: true,
    nativeChainActive: true,
    available: true,
    actual: true,
    active: true,
    availability: 'available',
    effectiveLayout: '7.1',
    layoutPending: false,
    transitionPending: false,
    outputChannels: 8,
    activeRevision: 8,
    stagedRevision: 8,
    lastResult: 0,
    output: 'virtual-bed-to-binaural-2ch',
    processCalls: 200,
    channelPeak: [0.45, 0.36, 0.3, 0.1, 0.24, 0.22, 0.2, 0.19],
    channelRms: [0.22, 0.18, 0.15, 0.05, 0.12, 0.11, 0.1, 0.09],
    channelTelemetryAzimuthDeg: [30, -30, 0, 0, 135, -135, 90, -90],
    physicalMultichannel: false
  };
}

function makeWav(sampleRate = 48_000, durationSeconds = 8) {
  const frames = sampleRate * durationSeconds;
  const dataBytes = frames * 4;
  const output = Buffer.allocUnsafe(44 + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 4, 28);
  output.writeUInt16LE(4, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / sampleRate;
    const left = Math.sin(2 * Math.PI * 440 * time) * 0.42;
    const right = Math.sin(2 * Math.PI * 660 * time + 0.6) * 0.28;
    output.writeInt16LE(Math.round(left * 32767), 44 + frame * 4);
    output.writeInt16LE(Math.round(right * 32767), 46 + frame * 4);
  }
  return output;
}

const wav = makeWav();

const perfBootstrap = String.raw`
(() => {
  const counters = {
    rafRequested: 0, rafFired: 0, rafSyncWorkMs: 0, rafCallbacksOver16: 0,
    timeoutsRequested: 0, timeoutsFired: 0, intervalsRequested: 0,
    fetches: [], audioContexts: 0, analysers: 0, captures: 0,
    canvasContextRequests: 0, canvasCalls: {}, longTasks: [], frameGaps: [],
    mutationRecords: 0, mutationAttributes: 0, mutationChildren: 0, rafWork: [],
    measurementStartedAt: 0, ensureNativeChainCalls: 0
  };
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    counters.rafRequested += 1;
    return nativeRaf((timestamp) => {
      counters.rafFired += 1;
      const started = performance.now();
      callback(timestamp);
      const elapsed = performance.now() - started;
      counters.rafSyncWorkMs += elapsed;
      if (elapsed > 16) counters.rafCallbacksOver16 += 1;
      if (elapsed > 4) counters.rafWork.push({
        at: started,
        duration: elapsed,
        callback: callback.name || 'anonymous',
        source: Function.prototype.toString.call(callback).slice(0, 180)
      });
    });
  };
  window.cancelAnimationFrame = nativeCancelRaf;
  const nativeTimeout = window.setTimeout.bind(window);
  window.setTimeout = (callback, milliseconds, ...args) => {
    counters.timeoutsRequested += 1;
    return nativeTimeout((...callbackArgs) => {
      counters.timeoutsFired += 1;
      callback(...callbackArgs);
    }, milliseconds, ...args);
  };
  const nativeInterval = window.setInterval.bind(window);
  window.setInterval = (callback, milliseconds, ...args) => {
    counters.intervalsRequested += 1;
    return nativeInterval(callback, milliseconds, ...args);
  };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    counters.fetches.push({
      method: String(init.method || 'GET').toUpperCase(),
      path: new URL(typeof input === 'string' ? input : input.url, location.href).pathname,
      at: performance.now()
    });
    return nativeFetch(input, init);
  };

  const NativeContext = window.AudioContext || window.webkitAudioContext;
  if (NativeContext) {
    const WrappedContext = new Proxy(NativeContext, {
      construct(Target, args) {
        counters.audioContexts += 1;
        const context = Reflect.construct(Target, args, Target);
        const createAnalyser = context.createAnalyser.bind(context);
        context.createAnalyser = (...analyserArgs) => {
          counters.analysers += 1;
          return createAnalyser(...analyserArgs);
        };
        return context;
      }
    });
    window.AudioContext = WrappedContext;
    if (window.webkitAudioContext) window.webkitAudioContext = WrappedContext;
  }

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const countedMethods = [
    'arc', 'beginPath', 'clearRect', 'closePath', 'createLinearGradient',
    'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'setTransform',
    'stroke', 'strokeRect'
  ];
  HTMLCanvasElement.prototype.getContext = function (...args) {
    counters.canvasContextRequests += 1;
    const context = nativeGetContext.apply(this, args);
    if (!context || context.__fePerfWrapped) return context;
    try { Object.defineProperty(context, '__fePerfWrapped', { value: true }); } catch { return context; }
    countedMethods.forEach((method) => {
      if (typeof context[method] !== 'function') return;
      const nativeMethod = context[method].bind(context);
      try {
        context[method] = (...methodArgs) => {
          counters.canvasCalls[method] = (counters.canvasCalls[method] || 0) + 1;
          return nativeMethod(...methodArgs);
        };
      } catch {}
    });
    return context;
  };

  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => counters.longTasks.push({
        startTime: entry.startTime,
        duration: entry.duration
      }));
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {}

  let mutationObserver = null;
  let frameMonitorActive = false;
  let previousFrame = 0;
  function monitorFrame(timestamp) {
    if (!frameMonitorActive) return;
    if (previousFrame) counters.frameGaps.push(timestamp - previousFrame);
    previousFrame = timestamp;
    window.requestAnimationFrame(monitorFrame);
  }
  window.__beginMixerOpenMeasure = () => {
    counters.measurementStartedAt = performance.now();
    counters.frameGaps.length = 0;
    counters.mutationRecords = 0;
    counters.mutationAttributes = 0;
    counters.mutationChildren = 0;
    mutationObserver?.disconnect();
    mutationObserver = new MutationObserver((entries) => {
      counters.mutationRecords += entries.length;
      entries.forEach((entry) => {
        if (entry.type === 'attributes') counters.mutationAttributes += 1;
        if (entry.type === 'childList') counters.mutationChildren += entry.addedNodes.length + entry.removedNodes.length;
      });
    });
    mutationObserver.observe(document.getElementById('runtimeSettingsPanel'), {
      attributes: true, childList: true, characterData: true, subtree: true
    });
    frameMonitorActive = true;
    previousFrame = 0;
    window.requestAnimationFrame(monitorFrame);
    return performance.now();
  };
  window.__endMixerOpenMeasure = () => {
    frameMonitorActive = false;
    mutationObserver?.disconnect();
  };
  window.__mixerPerfCounters = counters;
})();
`;

const fixtureHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/styles.css">
  <script>${perfBootstrap}</script>
</head>
<body>
  <div class="app-shell"><button id="runtimeSettingsButton" type="button">settings</button></div>
  <audio id="audio" loop preload="auto" src="/fixture.wav"></audio>
  <section class="runtime-settings-panel settings-center" id="runtimeSettingsPanel" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1" hidden>
    <header class="settings-center-titlebar"><strong id="runtimeSettingsTitle">设置中心</strong><button data-settings-center-close type="button">×</button></header>
    <div class="settings-center-body">
      <nav class="settings-center-nav" role="tablist"><button id="settingsNavMixer" data-settings-page-id="mixer" type="button">调音台</button></nav>
      <div class="settings-center-content"><section class="settings-center-page" id="settingsCenterPageMixer" data-settings-page="mixer"></section></div>
    </div>
  </section>
  <script src="/settings-center.js"></script>
  <script src="/audio-mixer-visuals.js"></script>
  <script src="/audio-mixer-ui.js"></script>
  <script>
    const audio = document.getElementById('audio');
    const nativeCapture = audio.captureStream || audio.mozCaptureStream;
    if (nativeCapture) {
      const wrappedCapture = (...args) => {
        window.__mixerPerfCounters.captures += 1;
        return nativeCapture.apply(audio, args);
      };
      if (audio.captureStream) audio.captureStream = wrappedCapture;
      else audio.mozCaptureStream = wrappedCapture;
    }
    const page = document.getElementById('settingsCenterPageMixer');
    window.FeSettingsCenter.registerPage({ id: 'mixer', label: '调音台', node: page });
    window.__mixerController = window.FeAudioMixerUi.mount(page, {
      ensureNativeChain() {
        window.__mixerPerfCounters.ensureNativeChainCalls += 1;
        return Promise.resolve(true);
      },
      getNativeChannelLayout: () => '7.1',
      setNativeChannelLayout: () => Promise.resolve(true)
    });
    window.__mixerProbeReady = window.__mixerController.ready;
  </script>
</body>
</html>`;

function sendJson(response, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requests.push({ method: request.method || 'GET', path: url.pathname, at: Date.now() });
  if (url.pathname === '/') {
    const body = Buffer.from(fixtureHtml);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length });
    response.end(body);
    return;
  }
  if (url.pathname === '/fixture.wav') {
    response.writeHead(200, {
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'content-type': 'audio/wav',
      'content-length': wav.length
    });
    response.end(wav);
    return;
  }
  if (url.pathname === '/api/audio/mixer') {
    sendJson(response, mixerSnapshot());
    return;
  }
  if (url.pathname === '/api/audio/mixer/presets') {
    sendJson(response, {
      ok: true,
      presetVersion: 1,
      presets: presetIds.map(([id, label]) => ({ id, label, parameters }))
    });
    return;
  }
  if (url.pathname === '/api/audio/mixer/channels') {
    sendJson(response, channelSnapshot());
    return;
  }
  const relative = url.pathname.slice(1);
  const candidate = path.resolve(webRoot, relative);
  if (!candidate.startsWith(path.resolve(webRoot) + path.sep) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  const body = readFileSync(candidate);
  const extension = path.extname(candidate).toLowerCase();
  const contentType = extension === '.js'
    ? 'text/javascript; charset=utf-8'
    : extension === '.css'
      ? 'text/css; charset=utf-8'
      : 'application/octet-stream';
  response.writeHead(200, { 'cache-control': 'no-store', 'content-type': contentType, 'content-length': body.length });
  response.end(body);
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function retryJson(url, timeout = 7_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}, timeout = 20_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out`));
    }, timeout);
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolve(value); },
      reject(error) { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(expression, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression, true)) return;
    } catch (error) {
      if (!/Inspected target navigated|Cannot find context/i.test(error.message)) throw error;
    }
    await delay(80);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

function sum(object) {
  return Object.values(object || {}).reduce((total, value) => total + Number(value || 0), 0);
}

try {
  await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'uncaught');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push(message.params.args?.map((item) => item.value || item.description || '').join(' ') || 'console.error');
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: baseUrl });
  await command('Page.bringToFront');
  await waitFor("document.readyState === 'complete' && window.__mixerProbeReady");
  await evaluate('window.__mixerProbeReady', true);

  const result = await evaluate(`(async () => {
    const audio = document.getElementById('audio');
    audio.volume = 0.01;
    await audio.play();
    const playDeadline = performance.now() + 1600;
    while (performance.now() < playDeadline && audio.currentTime < 0.18) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await new Promise((resolve) => setTimeout(resolve, 650));
    const visualsHost = document.querySelector('[data-mixer-visuals-host]');
    const visualBefore = window.FeAudioMixerVisuals.snapshot(visualsHost);
    const counters = window.__mixerPerfCounters;
    const before = structuredClone(counters);
    const audioBefore = audio.currentTime;
    const startedAt = window.__beginMixerOpenMeasure();
    const opened = window.FeSettingsCenter.open('mixer');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstPaintAt = performance.now();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const secondPaintAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 2400));
    const endedAt = performance.now();
    window.__endMixerOpenMeasure();
    const visualAfter = window.FeAudioMixerVisuals.snapshot(visualsHost);
    const after = structuredClone(counters);
    const root = document.querySelector('[data-audio-mixer-ui]');
    const primary = {
      opened,
      measurementStartedAt: startedAt,
      elapsedMs: endedAt - startedAt,
      firstPaintMs: firstPaintAt - startedAt,
      secondPaintMs: secondPaintAt - startedAt,
      audioAdvancedSeconds: audio.currentTime - audioBefore,
      audioPaused: audio.paused,
      domNodes: root?.querySelectorAll('*').length || 0,
      canvases: root?.querySelectorAll('canvas').length || 0,
      controls: root?.querySelectorAll('button,input,select').length || 0,
      telemetrySequenceDelta: (visualAfter?.telemetrySequence || 0) - (visualBefore?.telemetrySequence || 0),
      visualDrawDelta: (visualAfter?.drawCount || 0) - (visualBefore?.drawCount || 0),
      delta: {
        rafRequested: after.rafRequested - before.rafRequested,
        rafFired: after.rafFired - before.rafFired,
        rafSyncWorkMs: after.rafSyncWorkMs - before.rafSyncWorkMs,
        rafCallbacksOver16: after.rafCallbacksOver16 - before.rafCallbacksOver16,
        rafWork: after.rafWork.slice(before.rafWork.length),
        timeoutsRequested: after.timeoutsRequested - before.timeoutsRequested,
        intervalsRequested: after.intervalsRequested - before.intervalsRequested,
        fetches: after.fetches.slice(before.fetches.length),
        audioContexts: after.audioContexts - before.audioContexts,
        analysers: after.analysers - before.analysers,
        captures: after.captures - before.captures,
        canvasContextRequests: after.canvasContextRequests - before.canvasContextRequests,
        canvasCalls: Object.fromEntries(Object.keys(after.canvasCalls).map((key) => [
          key, (after.canvasCalls[key] || 0) - (before.canvasCalls[key] || 0)
        ])),
        longTasks: after.longTasks.slice(before.longTasks.length),
        frameGaps: [...after.frameGaps],
        mutationRecords: after.mutationRecords,
        mutationAttributes: after.mutationAttributes,
        mutationChildren: after.mutationChildren,
        ensureNativeChainCalls: after.ensureNativeChainCalls - before.ensureNativeChainCalls
      }
    };
    async function measureAblation(name, prepare) {
      window.FeSettingsCenter.close(name);
      await new Promise((resolve) => setTimeout(resolve, 420));
      prepare();
      const beforeAblation = structuredClone(counters);
      const ablationStartedAt = window.__beginMixerOpenMeasure();
      window.FeSettingsCenter.open('mixer');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const ablationSecondPaintAt = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const ablationEndedAt = performance.now();
      window.__endMixerOpenMeasure();
      const afterAblation = structuredClone(counters);
      return {
        name,
        elapsedMs: ablationEndedAt - ablationStartedAt,
        secondPaintMs: ablationSecondPaintAt - ablationStartedAt,
        rafFired: afterAblation.rafFired - beforeAblation.rafFired,
        rafSyncWorkMs: afterAblation.rafSyncWorkMs - beforeAblation.rafSyncWorkMs,
        longTasks: afterAblation.longTasks.slice(beforeAblation.longTasks.length),
        frameGaps: [...afterAblation.frameGaps],
        mutationRecords: afterAblation.mutationRecords,
        canvasCalls: Object.fromEntries(Object.keys(afterAblation.canvasCalls).map((key) => [
          key, (afterAblation.canvasCalls[key] || 0) - (beforeAblation.canvasCalls[key] || 0)
        ]))
      };
    }
    const noSpectrum = await measureAblation('no-spectrum', () => {
      window.__mixerController.setVisualModuleVisibility?.('spectrum', false);
      const spectrumCard = visualsHost.querySelector('[data-mixer-visual-module="spectrum"]');
      if (spectrumCard) spectrumCard.hidden = true;
    });
    const noWorkerCanvases = await measureAblation('no-worker-canvases', () => {
      ['stereo-field', 'surround', 'waveform'].forEach((id) => {
        const card = visualsHost.querySelector('[data-mixer-visual-module="' + id + '"]');
        if (card) card.hidden = true;
      });
    });
    const noMeters = await measureAblation('no-meters', () => {
      const card = visualsHost.querySelector('[data-mixer-visual-module="meters"]');
      if (card) card.hidden = true;
    });
    const noSpatial = await measureAblation('no-spatial', () => {
      const card = visualsHost.querySelector('[data-mixer-visual-module="spatial"]');
      if (card) card.hidden = true;
    });
    const noVisuals = await measureAblation('no-visuals', () => { visualsHost.hidden = true; });
    const noMixerSurface = await measureAblation('no-mixer-surface', () => { root.hidden = true; });
    window.FeSettingsCenter.close('done');
    return {
      ...primary,
      ablations: { noSpectrum, noWorkerCanvases, noMeters, noSpatial, noVisuals, noMixerSurface }
    };
  })()`, true);

  const seconds = result.elapsedMs / 1000;
  const maxFrameGapMs = Math.max(0, ...result.delta.frameGaps);
  const canvasCalls = sum(result.delta.canvasCalls);
  const mixerRequestsDuringOpen = result.delta.fetches.filter((entry) => entry.path.startsWith('/api/audio/mixer'));
  const metrics = {
    ...result,
    telemetryHz: result.telemetrySequenceDelta / seconds,
    visualDrawsPerSecond: result.visualDrawDelta / seconds,
    canvasCallsPerSecond: canvasCalls / seconds,
    maxFrameGapMs,
    longTaskCount: result.delta.longTasks.length,
    maxLongTaskMs: Math.max(0, ...result.delta.longTasks.map((entry) => entry.duration)),
    mixerRequestsDuringOpen: mixerRequestsDuringOpen.length,
    serverMutationsDuringOpen: requests.filter((entry) => (
      entry.at >= Date.now() - result.elapsedMs - 300
      && ['PATCH', 'POST'].includes(entry.method)
      && entry.path.startsWith('/api/audio/mixer')
    )).length,
    browserErrors
  };
  Object.values(metrics.ablations).forEach((entry) => {
    entry.maxFrameGapMs = Math.max(0, ...entry.frameGaps);
    entry.longTaskCount = entry.longTasks.length;
    entry.maxLongTaskMs = Math.max(0, ...entry.longTasks.map((task) => task.duration));
    entry.canvasCallCount = sum(entry.canvasCalls);
  });

  // Budgets are intentionally interaction-oriented. Real-time meters do not
  // need display-refresh-rate sampling; 30 Hz is already smooth for audio UI.
  // One compositor monitor RAF is included, hence a 75 callbacks/s allowance.
  // The settings body is deliberately revealed on the frame after modal focus
  // so Chromium cannot merge focus-tree discovery with the whole mixer layout.
  // Count that single bounded reveal task as part of opening, but reject any
  // recurring visual/telemetry long tasks after the short reveal window.
  const openingTasks = metrics.delta.longTasks.filter((entry) => (
    entry.startTime - result.measurementStartedAt <= 80
  ));
  const checks = {
    interactionPaintUnder120ms: metrics.secondPaintMs <= 120,
    noSustainedLongTasks: metrics.longTaskCount === openingTasks.length
      && openingTasks.length <= 1
      && openingTasks.every((entry) => entry.duration <= 120),
    noFrameGapOver120ms: metrics.maxFrameGapMs <= 120,
    telemetryCappedAt30Hz: metrics.telemetryHz <= 32,
    noAudioChainMutationOnOpen: metrics.delta.ensureNativeChainCalls === 0
      && metrics.mixerRequestsDuringOpen === 0
      && metrics.serverMutationsDuringOpen === 0,
    noIntervalsCreatedOnOpen: metrics.delta.intervalsRequested === 0,
    playbackContinues: !metrics.audioPaused && metrics.audioAdvancedSeconds >= seconds * 0.75,
    browserClean: browserErrors.length === 0
  };

  const compactSeries = (values) => ({
    count: values.length,
    max: Math.max(0, ...values),
    over50: values.filter((value) => value > 50).length
  });
  metrics.delta.longTaskDurationsMs = metrics.delta.longTasks.map((entry) => entry.duration);
  metrics.delta.longTaskOffsetsMs = metrics.delta.longTasks.map((entry) => entry.startTime - result.measurementStartedAt);
  metrics.delta.frameGapSummary = compactSeries(metrics.delta.frameGaps);
  delete metrics.delta.longTasks;
  delete metrics.delta.frameGaps;
  Object.values(metrics.ablations).forEach((entry) => {
    entry.longTaskDurationsMs = entry.longTasks.map((task) => task.duration);
    entry.frameGapSummary = compactSeries(entry.frameGaps);
    delete entry.longTasks;
    delete entry.frameGaps;
  });

  console.log(JSON.stringify({ pass: Object.values(checks).every(Boolean), checks, metrics }, null, 2));
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
} finally {
  for (const request of pending.values()) request.reject(new Error('probe closed'));
  pending.clear();
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  await new Promise((resolve) => server.close(resolve));
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
