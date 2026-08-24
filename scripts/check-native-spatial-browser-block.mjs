import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(existsSync);
const runtimeRoot = mkdtempSync(path.join(root, '.tmp-native-spatial-browser-block-'));
const profileDir = path.join(runtimeRoot, 'edge-profile');
const dataDir = path.join(runtimeRoot, 'data');
const tempDir = path.join(runtimeRoot, 'temp');
mkdirSync(profileDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

const javaHomes = [
  path.join(root, 'runtime', 'java'),
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function executable(name) {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function latestJar() {
  const out = path.join(root, 'out');
  if (!existsSync(out)) return '';
  return readdirSync(out)
    .filter((name) => /^fe-monster-java-.*\.jar$/i.test(name))
    .map((name) => path.join(out, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] || '';
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function json(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
  }
  if (!response.ok) {
    throw new Error(payload?.error || `${options.method || 'GET'} ${url} returned HTTP ${response.status}`);
  }
  return payload;
}

async function waitForJson(url, predicate, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const payload = await json(url);
      if (!predicate || predicate(payload)) return payload;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function mixerStatus(baseUrl) {
  return json(`${baseUrl}/api/audio/mixer`, {
    headers: {
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin'
    }
  });
}

async function applyMixerPreset(baseUrl, id) {
  const current = await mixerStatus(baseUrl);
  return json(`${baseUrl}/api/audio/mixer/presets/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
    headers: {
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expectedRevision: current.revision })
  });
}

function terminate(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  child.kill();
}

async function waitForExit(child, timeoutMs = 2000) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(timeoutMs)
  ]);
}

if (!edge) throw new Error('Microsoft Edge is required for the native finite-body PCM regression.');
const jar = latestJar();
if (!jar) throw new Error('Build the Java application before the native finite-body PCM regression.');

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = {
  ...process.env,
  TEMP: tempDir,
  TMP: tempDir
};
const server = spawn(executable('java'), [
  '--enable-native-access=ALL-UNNAMED',
  '-jar',
  jar,
  '--server'
], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...childEnv,
    FE_MONSTER_ROOT: root,
    FE_MONSTER_DATA_DIR: dataDir,
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MUSIC_API_AUTOSTART: '0'
  }
});
let serverStdout = '';
let serverStderr = '';
server.stdout.on('data', (chunk) => { serverStdout += String(chunk); });
server.stderr.on('data', (chunk) => { serverStderr += String(chunk); });

let browser = null;
let browserStderr = '';
let socket = null;
let nextCommandId = 1;
const pendingCommands = new Map();
const spatialRequests = [];
const requestById = new Map();
const pageErrors = [];

function command(method, params = {}) {
  const id = nextCommandId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pendingCommands.set(id, { resolve, reject }));
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

async function waitForExpression(expression, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(expression, true)) return true;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError || new Error(`Timed out waiting for browser expression: ${expression}`);
}

function observeCdpMessage(event) {
  const message = JSON.parse(String(event.data));
  if (message.id && pendingCommands.has(message.id)) {
    const pending = pendingCommands.get(message.id);
    pendingCommands.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params?.exceptionDetails?.exception?.description
      || message.params?.exceptionDetails?.text
      || 'unhandled browser exception');
    return;
  }
  if (message.method === 'Network.requestWillBeSent') {
    const request = message.params?.request;
    if (!request?.url?.includes('/api/audio/spatial/')) return;
    const parsed = new URL(request.url);
    const entry = {
      requestId: message.params.requestId,
      method: request.method,
      path: parsed.pathname,
      search: parsed.search,
      hasPostData: request.hasPostData === true,
      responseStatus: 0,
      protocol: '',
      completed: false,
      failed: ''
    };
    spatialRequests.push(entry);
    requestById.set(entry.requestId, entry);
    return;
  }
  if (message.method === 'Network.responseReceived') {
    const entry = requestById.get(message.params?.requestId);
    if (!entry) return;
    entry.responseStatus = Number(message.params?.response?.status) || 0;
    entry.protocol = String(message.params?.response?.protocol || '');
    return;
  }
  if (message.method === 'Network.loadingFinished') {
    const entry = requestById.get(message.params?.requestId);
    if (entry) entry.completed = true;
    return;
  }
  if (message.method === 'Network.loadingFailed') {
    const entry = requestById.get(message.params?.requestId);
    if (entry) entry.failed = String(message.params?.errorText || 'network request failed');
  }
}

async function activeDebugPort() {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (existsSync(portFile)) {
      const debugPort = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(debugPort) && debugPort > 0) return debugPort;
    }
    if (browser?.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserStderr.trim()}`);
}

function requestNumber(entry, name) {
  return Number(new URLSearchParams(entry.search).get(name)) || 0;
}

async function observeNativePhase(expectedRendererInputChannels, previous = {}, requestOffset = 0) {
  const maxima = {
    framesProcessed: 0,
    rustUpmixProcessCalls: 0,
    x3dCalculateCalls: 0,
    obrProcessCalls: 0,
    buffersQueued: 0,
    mixerProcessCalls: 0
  };
  let session = 0;
  let generation = 0;
  let nativeMixerObserved = false;
  let lastSpatial = {};
  let lastMixer = {};
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    try {
      const [spatial, mixer] = await Promise.all([
        json(`${baseUrl}/api/audio/spatial/status`),
        mixerStatus(baseUrl)
      ]);
      const currentSession = Number(spatial.session) || 0;
      const currentGeneration = Number(spatial.generation) || 0;
      const isExpectedGeneration = spatial.active === true
        && currentSession > 0
        && currentGeneration > 0;
      if (isExpectedGeneration) {
        session = currentSession;
        generation = currentGeneration;
        lastSpatial = spatial;
        lastMixer = mixer;
        maxima.framesProcessed = Math.max(maxima.framesProcessed, Number(spatial.framesProcessed) || 0);
        maxima.rustUpmixProcessCalls = Math.max(
          maxima.rustUpmixProcessCalls,
          Number(spatial.rustUpmixProcessCalls) || 0
        );
        maxima.x3dCalculateCalls = Math.max(
          maxima.x3dCalculateCalls,
          Number(spatial.x3dCalculateCalls) || 0
        );
        maxima.obrProcessCalls = Math.max(
          maxima.obrProcessCalls,
          Number(spatial.obrProcessCalls) || 0
        );
        maxima.buffersQueued = Math.max(maxima.buffersQueued, Number(spatial.buffersQueued) || 0);
        maxima.mixerProcessCalls = Math.max(
          maxima.mixerProcessCalls,
          Number(mixer.processCalls) || 0
        );
        nativeMixerObserved ||= mixer.playbackState === 'native-mixer';
      }
    } catch (error) {
    }
    const completedBlock = spatialRequests.slice(requestOffset).some((entry) =>
      entry.path === '/api/audio/spatial/block'
      && requestNumber(entry, 'session') === session
      && requestNumber(entry, 'generation') === generation
      && entry.completed
      && entry.responseStatus >= 200
      && entry.responseStatus < 300
    );
    if (
      completedBlock
      && Number(lastSpatial.rendererInputChannels) === expectedRendererInputChannels
      && maxima.framesProcessed > Number(previous.maxima?.framesProcessed || 0)
      && maxima.rustUpmixProcessCalls > Number(previous.maxima?.rustUpmixProcessCalls || 0)
      && maxima.x3dCalculateCalls > Number(previous.maxima?.x3dCalculateCalls || 0)
      && maxima.obrProcessCalls > Number(previous.maxima?.obrProcessCalls || 0)
      && maxima.mixerProcessCalls > Number(previous.maxima?.mixerProcessCalls || 0)
      && nativeMixerObserved
    ) break;
    await delay(100);
  }
  const blockRequests = spatialRequests.slice(requestOffset).filter((entry) =>
    entry.path === '/api/audio/spatial/block'
    && requestNumber(entry, 'session') === session
    && requestNumber(entry, 'generation') === generation
  );
  const completedBlocks = blockRequests.filter((entry) =>
    entry.completed && entry.responseStatus >= 200 && entry.responseStatus < 300
  );
  return {
    session,
    generation,
    expectedRendererInputChannels,
    rendererInputChannels: Number(lastSpatial.rendererInputChannels) || 0,
    maxima,
    nativeMixerObserved,
    finiteBodyHttp11: completedBlocks.some((entry) => (
      entry.protocol === 'http/1.1' && entry.hasPostData
    )),
    blockRequestCount: blockRequests.length,
    completedBlockCount: completedBlocks.length,
    lastSpatial,
    lastMixer: {
      playbackState: lastMixer.playbackState,
      processCalls: lastMixer.processCalls,
      bypassReason: lastMixer.bypassReason
    }
  };
}

let report = null;
let thrown = null;
try {
  await waitForJson(`${baseUrl}/api/app/version`, () => true);
  const runtime = await json(`${baseUrl}/api/app/runtime`);
  if (runtime?.nativeAudio?.active !== true || runtime?.nativeAudio?.spatialStreaming !== true) {
    throw new Error(`Native spatial runtime is unavailable: ${JSON.stringify(runtime?.nativeAudio || {})}`);
  }
  const configuredMixer = await applyMixerPreset(baseUrl, 'surround-3d');
  if (
    configuredMixer?.selectedPreset !== 'surround-3d'
    || configuredMixer?.parameters?.enabled !== true
    || configuredMixer?.parameters?.upmixEnabled !== true
    || configuredMixer?.parameters?.obrEnabled !== true
  ) {
    throw new Error(`3D surround mixer preset was not configured: ${JSON.stringify(configuredMixer)}`);
  }

  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: childEnv
  });
  browser.stderr.on('data', (chunk) => { browserStderr += String(chunk); });

  const debugPort = await activeDebugPort();
  const targets = await json(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', observeCdpMessage);
  await Promise.all([
    command('Page.enable'),
    command('Runtime.enable'),
    command('Network.enable')
  ]);
  await command('Page.navigate', { url: `${baseUrl}/?native-pcm-block-red=${Date.now()}` });
  await waitForExpression(`document.readyState === 'complete'
    && typeof setNativeAudioMixerChannelLayout === 'function'
    && typeof patchNativeMixerSpatialControl === 'function'
    && typeof ensureNativeAudioMixerChain === 'function'
    && state?.clientRuntime?.nativeAudioActive === true
    && state?.clientRuntime?.nativeAudio?.spatialStreaming === true
    && document.querySelector('[data-audio-mixer-ui][data-mixer-ready="true"][data-selected-preset="surround-3d"]')`);

  const playbackSetup = await evaluate(`(async () => {
    const createTone = () => {
      const sampleRate = 48000;
      const frames = sampleRate * 24;
      const buffer = new ArrayBuffer(44 + frames * 4);
      const view = new DataView(buffer);
      const text = (offset, value) => {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index));
        }
      };
      text(0, 'RIFF');
      view.setUint32(4, 36 + frames * 4, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      text(36, 'data');
      view.setUint32(40, frames * 4, true);
      for (let frame = 0; frame < frames; frame += 1) {
        const left = Math.sin((2 * Math.PI * 173 * frame) / sampleRate) * 0.2;
        const right = Math.sin((2 * Math.PI * 257 * frame) / sampleRate) * 0.17;
        view.setInt16(44 + frame * 4, Math.round(left * 32767), true);
        view.setInt16(46 + frame * 4, Math.round(right * 32767), true);
      }
      return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    };

    const audio = document.getElementById('audio');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    const armed = await setNativeAudioMixerChannelLayout('5.1');
    const mixerRoot = document.querySelector('[data-audio-mixer-ui]');
    if (
      !armed
      || state.obrSpatialAudio.requested !== true
      || state.obrSpatialAudio.mixerControl?.upmixEnabled !== true
      || state.obrSpatialAudio.mixerControl?.obrEnabled !== true
    ) {
      throw new Error('5.1 native route did not arm before playback.');
    }

    const sourceUrl = createTone();
    state.currentSong = {
      id: 'native-pcm-finite-body-red',
      title: 'Native PCM finite-body regression',
      artist: 'FE Monster QA',
      provider: 'local',
      source: 'local',
      localUrl: sourceUrl,
      duration: 24
    };
    audio.src = sourceUrl;
    audio.volume = 0.01;
    await audio.play();
    const activated = await ensureNativeAudioMixerChain();
    return {
      playing: !audio.paused,
      activated,
      layout: state.obrSpatialAudio.mixerControl?.upmixOutputLayout || '',
      requested: state.obrSpatialAudio.requested,
      upmixEnabled: state.obrSpatialAudio.mixerControl?.upmixEnabled === true,
      obrEnabled: state.obrSpatialAudio.mixerControl?.obrEnabled === true,
      mixerPreset: mixerRoot.dataset.selectedPreset
    };
  })()`, true);

  const phaseFiveOne = await observeNativePhase(6);
  const sevenOneRequestOffset = spatialRequests.length;
  const switchToSevenOne = await evaluate(`(async () => {
    const previous = {
      layout: state.obrSpatialAudio.graph?.channelLayout || '',
      nativeStream: state.obrSpatialAudio.graph?.nativeStream === true
    };
    const switched = await setNativeAudioMixerChannelLayout('7.1');
    return {
      switched,
      previous,
      layout: state.obrSpatialAudio.mixerControl?.upmixOutputLayout || '',
      graphLayout: state.obrSpatialAudio.graph?.channelLayout || '',
      graphNativeStream: state.obrSpatialAudio.graph?.nativeStream === true,
      requested: state.obrSpatialAudio.requested,
      enabled: state.obrSpatialAudio.enabled,
      upmixEnabled: state.obrSpatialAudio.mixerControl?.upmixEnabled === true,
      obrEnabled: state.obrSpatialAudio.mixerControl?.obrEnabled === true,
      audioPlaying: !document.getElementById('audio').paused
    };
  })()`, true);
  const phaseSevenOne = await observeNativePhase(8, {
    session: phaseFiveOne.session,
    generation: phaseFiveOne.generation,
    maxima: phaseFiveOne.maxima
  }, sevenOneRequestOffset);
  const disableDuringGraphPublication = await evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs = 5000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMs) {
        if (await predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return false;
    };

    const stoppedSnapshot = await patchNativeMixerSpatialControl({ enabled: false });
    await ensureNativeAudioMixerChain(stoppedSnapshot);
    const previousStopped = await waitFor(async () => {
      const status = await apiJson('/api/audio/spatial/status');
      return !state.obrSpatialAudio.graph && status?.active !== true;
    });
    if (!previousStopped) throw new Error('race precondition could not stop the previous native graph');

    const raceAudio = document.getElementById('audio');
    if (raceAudio.paused || raceAudio.ended) {
      raceAudio.currentTime = 0;
      await raceAudio.play();
    }

    if (typeof nativeSpatialRequest !== 'function') {
      throw new Error('native race requires the native spatial request seam');
    }
    const originalNativeSpatialRequest = nativeSpatialRequest;
    let notifyStartEntered;
    let releaseStart;
    const startEntered = new Promise((resolve) => { notifyStartEntered = resolve; });
    const startGate = new Promise((resolve) => { releaseStart = resolve; });
    nativeSpatialRequest = async (path) => {
      const result = await originalNativeSpatialRequest(path);
      if (String(path).startsWith('/api/audio/spatial/start?')) {
        notifyStartEntered();
        await startGate;
      }
      return result;
    };

    let activationResult = false;
    try {
      const enabledSnapshot = await patchNativeMixerSpatialControl({
        enabled: true,
        upmixEnabled: true,
        obrEnabled: true,
        upmixOutputLayout: '7.1'
      });
      const activation = ensureNativeAudioMixerChain(enabledSnapshot);
      const entered = await Promise.race([
        startEntered.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 5000))
      ]);
      if (!entered) throw new Error('native start never reached the delayed graph-publication seam');
      const statusAtGate = await apiJson('/api/audio/spatial/status');
      const graphAtGate = state.obrSpatialAudio.graph;
      const graphPromiseAtGate = Boolean(state.obrSpatialAudio.graphPromise);
      const disabledSnapshot = await patchNativeMixerSpatialControl({ enabled: false });
      const disableResult = await ensureNativeAudioMixerChain(disabledSnapshot);
      releaseStart();
      activationResult = await activation;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const finalStatus = await apiJson('/api/audio/spatial/status');
      return {
        entered,
        startActive: statusAtGate?.active === true,
        session: Number(statusAtGate?.session) || 0,
        generation: Number(statusAtGate?.generation) || 0,
        graphAtGate: Boolean(graphAtGate),
        graphPromiseAtGate,
        disableResult,
        activationResult,
        finalStatusActive: finalStatus?.active === true,
        finalSession: Number(finalStatus?.session) || 0,
        finalGeneration: Number(finalStatus?.generation) || 0,
        finalGraphPresent: Boolean(state.obrSpatialAudio.graph),
        finalGraphDisposed: state.obrSpatialAudio.graph?.disposed === true,
        finalRequested: state.obrSpatialAudio.requested === true,
        finalEnabled: state.obrSpatialAudio.enabled === true
      };
    } finally {
      releaseStart?.();
      nativeSpatialRequest = originalNativeSpatialRequest;
    }
  })()`, true);
  const browserState = await evaluate(`({
    requested: state.obrSpatialAudio.requested,
    enabled: state.obrSpatialAudio.enabled,
    backend: state.obrSpatialAudio.backend,
    nativeFallback: state.obrSpatialAudio.nativeFallback,
    nativeError: state.obrSpatialAudio.nativeError,
    processedBlocks: state.obrSpatialAudio.processedBlocks,
    graphNativeStream: state.obrSpatialAudio.graph?.nativeStream === true,
    graphLayout: state.obrSpatialAudio.graph?.channelLayout || '',
    audioPlaying: !document.getElementById('audio').paused,
    mixerLayout: state.obrSpatialAudio.mixerControl?.upmixOutputLayout || '',
    mixerEnabled: state.obrSpatialAudio.mixerControl?.enabled === true
  })`);
  const blockRequests = spatialRequests.filter((entry) => entry.path === '/api/audio/spatial/block');
  const legacyStreamRequests = spatialRequests.filter((entry) => entry.path === '/api/audio/spatial/stream');
  const completedBlocks = blockRequests.filter((entry) =>
    entry.completed && entry.responseStatus >= 200 && entry.responseStatus < 300
  );
  const failures = [];
  if (
    !playbackSetup?.playing
    || playbackSetup?.activated !== true
    || playbackSetup?.layout !== '5.1'
    || playbackSetup?.upmixEnabled !== true
    || playbackSetup?.obrEnabled !== true
  ) {
    failures.push(`precondition failed: ${JSON.stringify(playbackSetup)}`);
  }
  const validatePhase = (label, phase, expectedChannels) => {
    if (!phase.session || !phase.generation) failures.push(`${label} did not publish a native session/generation`);
    if (phase.rendererInputChannels !== expectedChannels) {
      failures.push(`${label} rendererInputChannels was ${phase.rendererInputChannels}, expected ${expectedChannels}`);
    }
    if (!phase.blockRequestCount) failures.push(`${label} emitted no finite PCM block request`);
    if (!phase.completedBlockCount) failures.push(`${label} completed no finite PCM block`);
    if (!phase.finiteBodyHttp11) failures.push(`${label} finite PCM body did not complete over HTTP/1.1`);
    if (phase.maxima.framesProcessed <= 0) failures.push(`${label} processed zero PCM frames`);
    if (phase.maxima.rustUpmixProcessCalls <= 0) failures.push(`${label} Rust upmix processed zero blocks`);
    if (phase.maxima.mixerProcessCalls <= 0) failures.push(`${label} Rust mixer processed zero blocks`);
    if (phase.maxima.x3dCalculateCalls <= 0) failures.push(`${label} X3DAudio processed zero blocks`);
    if (phase.maxima.obrProcessCalls <= 0) failures.push(`${label} OBR processed zero blocks`);
    if (phase.maxima.buffersQueued <= 0) failures.push(`${label} XAudio2 queued zero buffers`);
    if (!phase.nativeMixerObserved) failures.push(`${label} mixer playbackState never reached native-mixer`);
  };
  validatePhase('5.1', phaseFiveOne, 6);
  validatePhase('7.1', phaseSevenOne, 8);
  if (
    phaseSevenOne.session !== phaseFiveOne.session
    || phaseSevenOne.generation !== phaseFiveOne.generation
  ) {
    failures.push('7.1 layout switch unnecessarily replaced the healthy native transport session');
  }
  if (
    switchToSevenOne?.switched !== true
    || switchToSevenOne?.layout !== '7.1'
    || switchToSevenOne?.graphLayout !== '7.1'
    || switchToSevenOne?.graphNativeStream !== true
    || switchToSevenOne?.upmixEnabled !== true
    || switchToSevenOne?.obrEnabled !== true
    || switchToSevenOne?.audioPlaying !== true
  ) {
    failures.push(`7.1 browser switch did not remain on the native graph: ${JSON.stringify(switchToSevenOne)}`);
  }
  if (switchToSevenOne?.layout !== '7.1' || browserState.mixerLayout !== '7.1') {
    failures.push('7.1 channel layout was not retained by the canonical mixer control');
  }
  if (legacyStreamRequests.length) {
    failures.push('legacy unbounded POST /api/audio/spatial/stream was still used');
  }
  const racedStopRequest = spatialRequests.some((entry) => (
    entry.path === '/api/audio/spatial/stop'
    && requestNumber(entry, 'session') === disableDuringGraphPublication.session
    && requestNumber(entry, 'generation') === disableDuringGraphPublication.generation
  ));
  if (
    disableDuringGraphPublication.startActive !== true
    || disableDuringGraphPublication.graphAtGate !== false
    || disableDuringGraphPublication.graphPromiseAtGate !== true
  ) {
    failures.push(`disable-during-publication precondition failed: ${JSON.stringify(disableDuringGraphPublication)}`);
  }
  if (
    disableDuringGraphPublication.finalStatusActive !== false
    || disableDuringGraphPublication.finalGraphPresent !== false
    || racedStopRequest !== true
  ) {
    failures.push(
      `disable after native /start must stop and dispose the unpublished graph: ${JSON.stringify({
        ...disableDuringGraphPublication,
        racedStopRequest
      })}`
    );
  }

  report = {
    pass: failures.length === 0,
    contract: 'real Edge playback must rebuild bounded finite-body PCM transport through canonical mixer controls from 5.1 to 7.1',
    javaServer: {
      url: baseUrl,
      jar: path.basename(jar),
      expectedProtocol: 'http/1.1'
    },
    playbackSetup,
    switchToSevenOne,
    phases: {
      fiveOne: phaseFiveOne,
      sevenOne: phaseSevenOne
    },
    disableDuringGraphPublication: {
      ...disableDuringGraphPublication,
      racedStopRequest
    },
    browserState,
    requests: spatialRequests.map(({ requestId, ...entry }) => entry),
    blockRequests: blockRequests.length,
    completedBlocks: completedBlocks.length,
    pageErrors,
    failures
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) {
    throw new Error(`FINITE_BODY_PCM_RED:\n- ${failures.join('\n- ')}`);
  }
} catch (error) {
  thrown = error;
  if (!report) {
    process.stderr.write(`FINITE_BODY_PCM_SETUP_FAILURE: ${error.stack || error}\n`);
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await command('Browser.close'); } catch (error) {}
    try { socket.close(); } catch (error) {}
  }
  await waitForExit(browser, 1500);
  terminate(browser);
  terminate(server);
  await Promise.all([waitForExit(browser), waitForExit(server)]);
  try {
    rmSync(runtimeRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch (error) {
    process.stderr.write(`Temporary E-drive cleanup warning: ${error.message}\n`);
  }
  if (thrown && serverStderr.trim()) {
    process.stderr.write(`Java stderr:\n${serverStderr.slice(-4000)}\n`);
  }
  if (thrown && browserStderr.trim()) {
    process.stderr.write(`Edge stderr:\n${browserStderr.slice(-3000)}\n`);
  }
  if (thrown && server.exitCode !== null && server.exitCode !== 0 && serverStdout.trim()) {
    process.stderr.write(`Java stdout:\n${serverStdout.slice(-3000)}\n`);
  }
}
