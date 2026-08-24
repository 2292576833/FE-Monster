import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 31000 + Math.floor(Math.random() * 7000);
const tempRoot = path.join(root, '.tmp');
const profile = path.join(tempRoot, 'fe-monster-audio-mixer-ui-' + process.pid + '-' + Date.now().toString(36));
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PARAMETER_FAMILIES = {
  master: ['enabled', 'inputGainDb', 'outputGainDb', 'balance'],
  equalizer: ['eqDb'],
  spatial: ['stereoWidth', 'centerGain', 'surroundGain', 'lfeGain'],
  upmix: [
    'upmixEnabled',
    'upmixAlgorithm',
    'upmixOutputLayout',
    'upmixCenterWidthHz',
    'upmixLfeCrossoverHz',
    'upmixCenterGain',
    'upmixSurroundGain',
    'upmixLfeGain',
    'upmixDecorrelation'
  ],
  obr: [
    'obrEnabled',
    'obrFilterProfile',
    'obrWet',
    'obrDry',
    'obrOutputGainDb',
    'obrSpatialWidth'
  ],
  compressor: [
    'compressorEnabled',
    'compressorThresholdDb',
    'compressorRatio',
    'compressorAttackMs',
    'compressorReleaseMs',
    'compressorKneeDb',
    'compressorMakeupDb'
  ],
  limiter: ['limiterEnabled', 'limiterCeilingDb', 'limiterReleaseMs'],
  reverb: [
    'reverbEnabled',
    'reverbRoomSize',
    'reverbDecayMs',
    'reverbDamping',
    'reverbPreDelayMs',
    'reverbWet',
    'reverbDry'
  ]
};
const BOOLEAN_PARAMETERS = new Set([
  'enabled',
  'compressorEnabled',
  'limiterEnabled',
  'reverbEnabled',
  'upmixEnabled',
  'obrEnabled'
]);
const SIMPLE_PARAMETER_KEYS = Object.values(PARAMETER_FAMILIES)
  .flat()
  .filter((key) => key !== 'eqDb');
const ALLOWED_PARAMETER_KEYS = new Set([...SIMPLE_PARAMETER_KEYS, 'eqDb']);
const ALLOWED_CHANNEL_PARAMETER_KEYS = new Set([
  'layout', 'algorithm', 'lfeCrossoverHz',
  'channelGainDb', 'channelDelayMs', 'channelAzimuthDeg', 'customMatrix'
]);
const PRESET_IDENTITIES = [
  ['clean', '纯净'],
  ['bathroom', '浴室'],
  ['hall', '大厅'],
  ['surround-3d', '3D环绕'],
  ['cinema', '影院'],
  ['vocal-clear', '人声清晰'],
  ['bass-boost', '低频增强'],
  ['night', '夜间']
];
const FORBIDDEN_MUTATION_DATA = /(?:api[_-]?key|access[_-]?token|secret|password|authorization|dll[_-]?path|native[_-]?path|native[_-]?buffer|dsp[_-]?module|[a-z]:\\|file:\/\/|\.dll\b)/i;

function createAsymmetricStereoWav({ sampleRate = 48000, durationSeconds = 4 } = {}) {
  const frameCount = sampleRate * durationSeconds;
  const channelCount = 2;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  wav.writeUInt16LE(channelCount * bytesPerSample, 32);
  wav.writeUInt16LE(bytesPerSample * 8, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const left = 0.56 * Math.sin(2 * Math.PI * 440 * time);
    const right = 0.19 * Math.sin(2 * Math.PI * 660 * time + Math.PI / 2);
    const offset = 44 + frame * channelCount * bytesPerSample;
    wav.writeInt16LE(Math.round(left * 32767), offset);
    wav.writeInt16LE(Math.round(right * 32767), offset + bytesPerSample);
  }
  return wav;
}

const asymmetricStereoWav = createAsymmetricStereoWav();

if (!existsSync(edge)) throw new Error('Microsoft Edge was not found: ' + edge);
mkdirSync(tempRoot, { recursive: true });

function cleanParameters() {
  return {
    enabled: true,
    inputGainDb: 0,
    outputGainDb: 0,
    balance: 0,
    eqDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
    upmixEnabled: false,
    upmixAlgorithm: 'matrix-decode',
    upmixOutputLayout: '5.1',
    upmixCenterWidthHz: 300,
    upmixLfeCrossoverHz: 120,
    upmixCenterGain: 0.707,
    upmixSurroundGain: 0.5,
    upmixLfeGain: 0.707,
    upmixDecorrelation: 0.7,
    obrEnabled: false,
    obrFilterProfile: 'direct',
    obrWet: 1,
    obrDry: 0,
    obrOutputGainDb: 0,
    obrSpatialWidth: 1
  };
}

function completePreset(id, label, patch = {}, eqPatch = {}) {
  const parameters = { ...cleanParameters(), ...patch };
  parameters.eqDb = [...parameters.eqDb];
  Object.entries(eqPatch).forEach(([index, value]) => {
    parameters.eqDb[Number(index)] = value;
  });
  return { id, label, parameters };
}

const PRESETS = [
  completePreset('clean', '纯净'),
  completePreset('bathroom', '浴室', {
    reverbEnabled: true,
    reverbRoomSize: 0.22,
    reverbDecayMs: 650,
    reverbDamping: 0.35,
    reverbPreDelayMs: 8,
    reverbWet: 0.32,
    reverbDry: 0.82
  }, { 7: 1.5 }),
  completePreset('hall', '大厅', {
    reverbEnabled: true,
    reverbRoomSize: 0.82,
    reverbDecayMs: 2800,
    reverbDamping: 0.62,
    reverbPreDelayMs: 28,
    reverbWet: 0.36,
    reverbDry: 0.88
  }),
  completePreset('surround-3d', '3D环绕', {
    inputGainDb: -6,
    stereoWidth: 1.2,
    upmixEnabled: true,
    upmixAlgorithm: 'matrix-decode',
    upmixOutputLayout: '7.1',
    upmixCenterGain: 0.68,
    upmixSurroundGain: 0.52,
    upmixLfeGain: 0.48,
    obrEnabled: true,
    obrFilterProfile: 'direct',
    obrSpatialWidth: 1.3
  }),
  completePreset('cinema', '影院', {
    inputGainDb: -1.5,
    centerGain: 1.12,
    surroundGain: 1.18,
    lfeGain: 1.22,
    compressorEnabled: true,
    compressorThresholdDb: -16,
    compressorRatio: 2.2,
    compressorMakeupDb: 1
  }, { 1: 2, 2: 1.5, 6: 1 }),
  completePreset('vocal-clear', '人声清晰', {
    centerGain: 1.15,
    compressorEnabled: true,
    compressorThresholdDb: -20,
    compressorRatio: 2,
    compressorMakeupDb: 1
  }, { 0: -2, 1: -1.5, 5: 2, 6: 3, 7: 1.5 }),
  completePreset('bass-boost', '低频增强', {
    inputGainDb: -1,
    lfeGain: 1.3,
    limiterCeilingDb: -0.8
  }, { 0: 4, 1: 4.5, 2: 3 }),
  completePreset('night', '夜间', {
    inputGainDb: -3,
    outputGainDb: -2,
    compressorEnabled: true,
    compressorThresholdDb: -28,
    compressorRatio: 6,
    compressorAttackMs: 5,
    compressorReleaseMs: 350,
    compressorKneeDb: 10,
    compressorMakeupDb: 3,
    limiterCeilingDb: -3
  })
];
const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));

let mixerState = {
  revision: 12,
  selectedPreset: 'clean',
  parameters: structuredClone(PRESET_BY_ID.get('clean').parameters)
};
let playbackMode = 'native-mixer-bypassed';
let patchAttemptCount = 0;
let mixerGetCount = 0;
const mixerRequests = [];
let channelRouterState = {
  revision: 7,
  layout: '5.1',
  algorithm: 'matrix-decode',
  lfeCrossoverHz: 120,
  channelOrder: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  channelGainDb: [0, 0, -1, -3, -2, -2, 0, 0],
  channelDelayMs: [0, 0, 1, 0, 7, 7, 0, 0],
  channelAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  customMatrix: [1, 0, 0, 1, 0.707, 0.707, 0.2, 0.2, 0.2, -0.2, -0.2, 0.2, 0, 0, 0, 0],
  configState: 'ready',
  controlAvailable: true,
  nativeBackendAvailable: true,
  nativeChainActive: false,
  available: false,
  actual: false,
  active: false,
  availability: 'native-route-not-connected',
  effectiveLayout: '',
  layoutPending: false,
  transitionPending: false,
  outputChannels: 0,
  activeRevision: 7,
  stagedRevision: 7,
  lastResult: -3,
  output: 'energy-matched-stereo-fold-down',
  processCalls: 321,
  channelPeak: [0.45, 0.36, 0.3, 0.1, 0.24, 0.22, 0, 0],
  channelRms: [0.22, 0.18, 0.15, 0.05, 0.12, 0.11, 0, 0],
  channelTelemetryAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  physicalMultichannel: false
};

function channelRouterSnapshot() {
  return structuredClone(channelRouterState);
}

function mixerSnapshot() {
  const nativeAvailable = playbackMode !== 'browser-compatible';
  return {
    ok: true,
    version: 1,
    presetVersion: 1,
    revision: mixerState.revision,
    selectedPreset: mixerState.selectedPreset,
    configState: 'ready',
    parameters: structuredClone(mixerState.parameters),
    nativeBackendAvailable: nativeAvailable,
    nativeChainActive: nativeAvailable,
    mixerAvailable: nativeAvailable,
    mixerActive: false,
    mixerEnabled: mixerState.parameters.enabled,
    mixerFailureDisabled: nativeAvailable,
    bypassReason: nativeAvailable ? 'process-failure-disabled' : 'native-backend-unavailable',
    lastResult: nativeAvailable ? -7 : 0,
    processCalls: 91,
    bypassedBlocks: nativeAvailable ? 4 : 0,
    processFailures: nativeAvailable ? 3 : 0,
    consecutiveFailures: nativeAvailable ? 3 : 0,
    partialFailureBypasses: nativeAvailable ? 1 : 0,
    activeRevision: Math.max(0, mixerState.revision - 1),
    stagedRevision: mixerState.revision,
    upmix: {
      available: nativeAvailable,
      enabled: mixerState.parameters.upmixEnabled,
      active: nativeAvailable && mixerState.parameters.upmixEnabled,
      algorithm: nativeAvailable ? 'rust-upmix-v1' : 'browser-dry'
    },
    obr: {
      available: nativeAvailable,
      enabled: mixerState.parameters.obrEnabled,
      active: nativeAvailable && mixerState.parameters.obrEnabled,
      backend: 'google-obr'
    },
    order: nativeAvailable ? { upmix: 1, mixer: 2, obr: 3 } : {},
    playbackState: playbackMode
  };
}

function genericApiFixture(url) {
  if (url.pathname === '/api/player/state') {
    return { queue: [], queueIndex: -1, position: 0, duration: 0, playing: false, volume: 0.8 };
  }
  if (url.pathname === '/api/visual-bridge/state') return { audio: {} };
  if (url.pathname === '/api/audio/sample') return {};
  if (url.pathname === '/api/community/state') {
    return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  }
  if (url.pathname === '/api/community/listen/state') return { ok: false };
  if (url.pathname === '/api/community/listening') return { ok: false };
  if (url.pathname === '/api/sandbox/presets') return { presets: [] };
  if (url.pathname === '/api/sandbox/components') return { components: [] };
  if (url.pathname === '/api/app/runtime') return {};
  if (url.pathname.endsWith('/login/status')) return { loggedIn: false };
  if (url.pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  return { ok: false };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: componentsRoot, relative: decoded.slice('/components/'.length) }
    : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(base + path.sep) ? candidate : '';
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': body.length,
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(body);
}

async function readRequestBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 64 * 1024) throw new Error('Mixer fixture request exceeded 64 KiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function recordMixerRequest(request, url, bodyText, body) {
  const recorded = {
    method: request.method || '',
    path: url.pathname,
    search: url.search,
    headers: { ...request.headers },
    bodyText,
    body,
    receivedAt: Date.now()
  };
  mixerRequests.push(recorded);
  return recorded;
}

function revisionConflict(response) {
  sendJson(response, 409, {
    ok: false,
    error: 'audio mixer revision conflict',
    errorCode: 'audio_mixer_revision_conflict',
    currentRevision: mixerState.revision
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const method = request.method || 'GET';
    if (url.pathname === '/fixtures/mixer-asymmetric-stereo.wav' && method === 'GET') {
      response.writeHead(200, {
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-length': asymmetricStereoWav.length,
        'content-type': 'audio/wav'
      });
      response.end(asymmetricStereoWav);
      return;
    }
    if (url.pathname === '/api/app/preferences/bootstrap.js') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'application/javascript; charset=utf-8'
      });
      response.end('window.__feAudioMixerUiProbePreferencesLoaded = true;');
      return;
    }
    if (url.pathname === '/api/audio/mixer' && method === 'GET') {
      mixerGetCount += 1;
      recordMixerRequest(request, url, '', null);
      sendJson(response, 200, mixerSnapshot());
      return;
    }
    if (url.pathname === '/api/audio/mixer/presets' && method === 'GET') {
      recordMixerRequest(request, url, '', null);
      sendJson(response, 200, {
        ok: true,
        presetVersion: 1,
        presets: structuredClone(PRESETS)
      });
      return;
    }
    if (url.pathname === '/api/audio/mixer/channels' && method === 'GET') {
      recordMixerRequest(request, url, '', null);
      sendJson(response, 200, channelRouterSnapshot());
      return;
    }
    if (url.pathname === '/api/audio/mixer/channels' && method === 'PATCH') {
      const bodyText = await readRequestBody(request);
      const body = JSON.parse(bodyText);
      recordMixerRequest(request, url, bodyText, body);
      if (body.expectedRevision !== channelRouterState.revision) {
        sendJson(response, 409, {
          ok: false,
          errorCode: 'audio_mixer_channel_revision_conflict',
          currentRevision: channelRouterState.revision
        });
        return;
      }
      const nextLayout = body.parameters?.layout || channelRouterState.layout;
      const nextRevision = channelRouterState.revision + 1;
      channelRouterState = {
        ...channelRouterState,
        ...structuredClone(body.parameters || {}),
        revision: nextRevision,
        layout: nextLayout,
        nativeChainActive: true,
        available: true,
        actual: true,
        active: true,
        availability: 'available',
        effectiveLayout: nextLayout,
        layoutPending: false,
        transitionPending: false,
        outputChannels: nextLayout === '7.1' ? 8 : 6,
        activeRevision: nextRevision,
        stagedRevision: nextRevision,
        lastResult: 0,
        channelOrder: nextLayout === '7.1'
          ? ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
          : ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR']
      };
      sendJson(response, 200, channelRouterSnapshot());
      return;
    }
    if (url.pathname === '/api/audio/mixer/channels/test' && method === 'POST') {
      const bodyText = await readRequestBody(request);
      const body = JSON.parse(bodyText);
      recordMixerRequest(request, url, bodyText, body);
      sendJson(response, 200, {
        ok: true,
        accepted: false,
        ...body,
        generated: true,
        queued: false,
        audible: false,
        transport: 'memory-pcm-not-queued',
        physicalMultichannel: false,
        output: 'virtual-bed-to-binaural-2ch'
      });
      return;
    }
    if (url.pathname === '/api/audio/mixer' && method === 'PATCH') {
      const bodyText = await readRequestBody(request);
      const body = JSON.parse(bodyText);
      recordMixerRequest(request, url, bodyText, body);
      patchAttemptCount += 1;
      if (patchAttemptCount === 3) {
        mixerState = {
          revision: mixerState.revision + 1,
          selectedPreset: 'custom',
          parameters: { ...mixerState.parameters, outputGainDb: -6 }
        };
        playbackMode = 'browser-compatible';
        revisionConflict(response);
        return;
      }
      if (body.expectedRevision !== mixerState.revision) {
        revisionConflict(response);
        return;
      }
      mixerState = {
        revision: mixerState.revision + 1,
        selectedPreset: 'custom',
        parameters: { ...mixerState.parameters, ...body.parameters }
      };
      sendJson(response, 200, mixerSnapshot());
      return;
    }
    if (url.pathname.startsWith('/api/audio/mixer/presets/')
      && url.pathname.endsWith('/apply')
      && method === 'POST') {
      const bodyText = await readRequestBody(request);
      const body = JSON.parse(bodyText);
      recordMixerRequest(request, url, bodyText, body);
      const prefix = '/api/audio/mixer/presets/';
      const id = decodeURIComponent(url.pathname.slice(prefix.length, -'/apply'.length));
      const preset = PRESET_BY_ID.get(id);
      if (!preset) {
        sendJson(response, 400, { ok: false, error: 'unknown audio mixer preset' });
        return;
      }
      if (body.expectedRevision !== mixerState.revision) {
        revisionConflict(response);
        return;
      }
      mixerState = {
        revision: mixerState.revision + 1,
        selectedPreset: id,
        parameters: structuredClone(preset.parameters)
      };
      sendJson(response, 200, mixerSnapshot());
      return;
    }
    if (url.pathname.startsWith('/api/audio/mixer')) {
      recordMixerRequest(request, url, '', null);
      sendJson(response, 405, { ok: false, error: 'method not allowed' });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 200, genericApiFixture(url));
      return;
    }
    const filePath = safeFilePath(url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const body = readFileSync(filePath);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || 'fixture failure' });
  }
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const browserErrors = [];
let browser;
let socket;
let nextId = 1;

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
}

async function retryJson(url, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start within ' + timeout + 'ms');
}

function command(method, params = {}, timeout = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP ' + method + ' timed out after ' + timeout + 'ms'));
    }, timeout);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function evaluateFunction(fn, ...args) {
  const expression = '(' + fn.toString() + ')(' + args.map((value) => JSON.stringify(value)).join(',') + ')';
  return evaluate(expression, true);
}

async function waitFor(expression, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression, true)) return;
    } catch (error) {
      if (!/Inspected target navigated or closed|Cannot find context/i.test(error.message)) throw error;
    }
    await delay(80);
  }
  throw new Error('Timed out waiting for: ' + expression);
}

async function waitUntil(predicate, timeout = 1800) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(40);
  }
  return predicate();
}

async function key(keyValue, code = keyValue, modifiers = 0) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: keyValue, code, modifiers });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: keyValue, code, modifiers });
}

function mutationRequestIsBoundedAndRedacted(entry) {
  if (!entry || !['PATCH', 'POST'].includes(entry.method)) return false;
  if (entry.search || entry.bodyText.length > 8192 || FORBIDDEN_MUTATION_DATA.test(entry.bodyText)) return false;
  if (entry.headers.authorization || entry.headers['proxy-authorization']) return false;
  if (!String(entry.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return false;
  const body = entry.body;
  if (entry.path === '/api/audio/mixer/channels/test') {
    return Object.keys(body || {}).sort().join(',')
      === 'channel,durationMs,frequencyHz,gainDb,kind,layout'
      && ['5.1', '7.1'].includes(body.layout)
      && ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'].includes(body.channel)
      && body.kind === 'tone'
      && Number.isFinite(body.durationMs) && body.durationMs > 0 && body.durationMs <= 2000
      && Number.isFinite(body.frequencyHz) && body.frequencyHz >= 20 && body.frequencyHz <= 20000
      && Number.isFinite(body.gainDb) && body.gainDb >= -60 && body.gainDb <= 0;
  }
  if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) return false;
  if (entry.method === 'POST') return Object.keys(body).sort().join(',') === 'expectedRevision';
  if (Object.keys(body).sort().join(',') !== 'expectedRevision,parameters') return false;
  if (!body.parameters || typeof body.parameters !== 'object' || Array.isArray(body.parameters)) return false;
  const allowed = entry.path === '/api/audio/mixer/channels'
    ? ALLOWED_CHANNEL_PARAMETER_KEYS
    : ALLOWED_PARAMETER_KEYS;
  return Object.keys(body.parameters).every((key) => allowed.has(key));
}

try {
  await listen(server);
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/';
  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const targets = await retryJson('http://127.0.0.1:' + debugPort + '/json');
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
      const details = message.params?.exceptionDetails || {};
      browserErrors.push(
        (details.exception?.description || details.text || 'Uncaught exception')
        + ' @ ' + (details.url || 'inline')
        + ':' + (Number(details.lineNumber || 0) + 1)
        + ':' + (Number(details.columnNumber || 0) + 1)
      );
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push(message.params.args?.map((arg) => arg.value || arg.description || '').join(' ') || 'console.error');
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
  await waitFor(
    "document.readyState === 'complete'"
    + " && typeof enterPlaybackPage === 'function'"
    + " && window.FeSettingsCenter"
    + " && document.getElementById('runtimeSettingsPanel')?.dataset.settingsCenterInitialized === 'true'"
  );

  const opened = await evaluateFunction(async () => {
    document.getElementById('bootScreen').hidden = true;
    enterPlaybackPage();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = window.FeSettingsCenter.open('mixer');
    const deadline = performance.now() + 900;
    while (performance.now() < deadline && !document.querySelector('[data-audio-mixer-ui]')) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return {
      result,
      snapshot: window.FeSettingsCenter.snapshot(),
      activeId: document.activeElement?.id || ''
    };
  });

  const inspectUi = (presetIdentities, families, simpleKeys, booleanKeys, eqFrequencies) => {
    const panel = document.getElementById('runtimeSettingsPanel');
    const page = panel?.querySelector('[data-settings-page="mixer"]');
    const ui = page?.querySelector('[data-audio-mixer-ui]');
    const accessibleName = (control) => {
      if (!control) return '';
      const direct = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby');
      if (direct) return direct.trim();
      const byFor = control.id
        ? document.querySelector('label[for="' + CSS.escape(control.id) + '"]')
        : null;
      return (byFor?.textContent || control.closest('label')?.textContent || '').trim();
    };
    const presetResults = presetIdentities.map(([id, label]) => {
      const control = ui?.querySelector('[data-mixer-preset-id="' + id + '"]');
      return {
        id,
        label,
        exists: !!control,
        isButton: control?.tagName === 'BUTTON',
        labelMatches: control?.textContent?.trim() === label || control?.getAttribute('aria-label') === label,
        accessibleName: accessibleName(control),
        pressed: control?.getAttribute('aria-pressed') || ''
      };
    });
    const familyResults = Object.entries(families).map(([family, keys]) => {
      const section = ui?.querySelector('[data-mixer-family="' + family + '"]');
      return {
        family,
        exists: !!section,
        labelled: !!section && !!(
          section.getAttribute('aria-label')
          || section.getAttribute('aria-labelledby')
          || section.querySelector('h2,h3,legend')
        ),
        expectedKeys: keys
      };
    });
    const controlResults = simpleKeys.map((key) => {
      const control = ui?.querySelector('[data-mixer-param="' + key + '"]');
      const family = control?.closest('[data-mixer-family]')?.dataset.mixerFamily || '';
      return {
        key,
        exists: !!control,
        family,
        type: control?.getAttribute('type') || control?.tagName?.toLowerCase() || '',
        disabled: !!control?.disabled,
        tabIndex: control?.tabIndex ?? -1,
        accessibleName: accessibleName(control),
        booleanShape: !booleanKeys.includes(key)
          || control?.matches('input[type="checkbox"],button[role="switch"],button[aria-pressed]')
      };
    });
    const eqResults = eqFrequencies.map((frequency, index) => {
      const control = ui?.querySelector(
        '[data-mixer-param="eqDb"][data-mixer-eq-index="' + index + '"]'
      );
      return {
        index,
        frequency,
        exists: !!control,
        frequencyMatches: Number(control?.dataset.mixerEqFrequency) === frequency,
        family: control?.closest('[data-mixer-family]')?.dataset.mixerFamily || '',
        disabled: !!control?.disabled,
        tabIndex: control?.tabIndex ?? -1,
        accessibleName: accessibleName(control)
      };
    });
    const playback = ui?.querySelector('[data-mixer-playback-state]');
    const status = ui?.querySelector('[data-mixer-status],[role="alert"]');
    const revision = ui?.querySelector('[data-mixer-revision]');
    const upmix = ui?.querySelector('[data-mixer-diagnostic="upmix"]');
    const obr = ui?.querySelector('[data-mixer-diagnostic="obr"]');
    const visuals = ui?.querySelector('[data-audio-mixer-visuals]');
    const visualModules = [...(visuals?.querySelectorAll('[data-mixer-visual-module]') || [])];
    const licensedAlgorithms = [...(visuals?.querySelectorAll('[data-spatial-algorithm] option') || [])]
      .filter((option) => /Dolby|Neural:X/.test(option.textContent || ''));
    const channelPanel = ui?.querySelector('[data-mixer-channel-panel]');
    const channelStrips = [...(channelPanel?.querySelectorAll('[data-mixer-channel-strip]') || [])];
    const channelAlgorithmOptions = [...(channelPanel?.querySelectorAll('[data-mixer-channel-algorithm] option') || [])];
    const rangeControls = [...(ui?.querySelectorAll('[data-mixer-param][type="range"]') || [])];
    const numericControls = [...(ui?.querySelectorAll('[data-mixer-numeric-input]') || [])];
    return {
      panelVisible: !!panel && !panel.hidden,
      pageVisible: !!page && !page.hidden && getComputedStyle(page).display !== 'none',
      uiExists: !!ui,
      ready: ui?.dataset.mixerReady || '',
      selectedPreset: ui?.dataset.selectedPreset || '',
      presetResults,
      familyResults,
      controlResults,
      eqResults,
      playback: {
        state: playback?.dataset.playbackState || '',
        text: playback?.textContent?.trim() || ''
      },
      statusText: status?.textContent?.trim() || '',
      revisionText: revision?.textContent?.trim() || '',
      diagnostics: {
        upmix: upmix?.textContent?.trim() || '',
        obr: obr?.textContent?.trim() || ''
      },
      channelRouter: {
        exists: !!channelPanel,
        state: channelPanel?.dataset.state || '',
        layout: channelPanel?.querySelector('[data-mixer-channel-router-layout]')?.value || '',
        algorithms: channelAlgorithmOptions.map((option) => ({
          value: option.value,
          disabled: option.disabled
        })),
        strips: channelStrips.map((strip) => ({
          id: strip.dataset.mixerChannelStrip,
          gainRange: !!strip.querySelector('[data-mixer-channel-range="gainDb"]'),
          gainNumber: !!strip.querySelector('[data-mixer-channel-number="gainDb"]'),
          delayRange: !!strip.querySelector('[data-mixer-channel-range="delayMs"]'),
          delayNumber: !!strip.querySelector('[data-mixer-channel-number="delayMs"]'),
          azimuthRange: !!strip.querySelector('[data-mixer-channel-range="azimuthDeg"]'),
          azimuthNumber: !!strip.querySelector('[data-mixer-channel-number="azimuthDeg"]'),
          testButton: !!strip.querySelector('[data-mixer-channel-test]')
        })),
        matrixCellCount: channelPanel?.querySelectorAll('[data-mixer-channel-matrix-cell]').length || 0,
        physicalOutputText: channelPanel?.querySelector('[data-mixer-channel-physical-output]')?.textContent?.trim() || '',
        statusText: channelPanel?.querySelector('[data-mixer-channel-status]')?.textContent?.trim() || '',
        disabledConfigControlCount: [...(channelPanel?.querySelectorAll(
          '[data-mixer-channel-router-layout], [data-mixer-channel-algorithm], [data-mixer-channel-lfe-crossover], [data-mixer-channel-range], [data-mixer-channel-number]'
        ) || [])].filter((control) => control.disabled).length,
        enabledTestCount: [...(channelPanel?.querySelectorAll('[data-mixer-channel-test]') || [])]
          .filter((button) => !button.disabled).length
      },
      visuals: {
        exists: !!visuals,
        productionTelemetrySource: ui?.querySelector('[data-mixer-visuals-host]')?.dataset.mixerTelemetrySource || '',
        telemetryState: visuals?.dataset.telemetryState || '',
        telemetryStage: visuals?.dataset.telemetryStage || '',
        meterTitle: visuals?.querySelector('[data-mixer-visual-module="meters"] h4')?.textContent?.trim() || '',
        misleadingOutputCopy: /主输出|引擎后级/.test(
          visuals?.querySelector('[data-mixer-visual-module="meters"]')?.textContent || ''
        ),
        moduleIds: visualModules.map((module) => module.dataset.mixerVisualModule),
        unavailableIsExplicit: [...(visuals?.querySelectorAll('[data-visual-unavailable]') || [])]
          .every((entry) => /不可用/.test(entry.textContent || '')),
        rangeCount: rangeControls.length,
        numericCount: numericControls.length,
        physicalOutput: visuals?.querySelector('[data-physical-output]')?.dataset.physicalOutput || '',
        testSignalEnabledCount: [...(visuals?.querySelectorAll('[data-test-signal-button]') || [])]
          .filter((button) => !button.disabled).length,
        automationState: visuals?.querySelector('[data-automation-state]')?.dataset.automationState || '',
        licensedAlgorithmsDisabled: licensedAlgorithms.length === 2
          && licensedAlgorithms.every((option) => option.disabled)
      }
    };
  };

  const initialUi = await evaluateFunction(
    inspectUi,
    PRESET_IDENTITIES,
    PARAMETER_FAMILIES,
    SIMPLE_PARAMETER_KEYS,
    [...BOOLEAN_PARAMETERS],
    EQ_FREQUENCIES
  );
  const initialObrRoute = await evaluateFunction(() => ({
    backend: document.documentElement.dataset.obrSpatialBackend || '',
    enabled: document.documentElement.dataset.obrSpatialEnabled || '',
    requested: document.getElementById('x3DAudioToggle')?.checked === true
  }));

  const channelLayoutChanged = await evaluateFunction(() => {
    const select = document.querySelector(
      '[data-mixer-channel-panel] [data-mixer-channel-router-layout]'
    );
    if (!select || select.disabled) return false;
    select.value = '7.1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  await waitUntil(() => mixerRequests.some((entry) => (
    entry.path === '/api/audio/mixer/channels'
      && entry.method === 'PATCH'
      && entry.body?.parameters?.layout === '7.1'
  )));
  await delay(320);
  const channelBackGainEdited = await evaluateFunction(() => {
    const input = document.querySelector(
      '[data-mixer-channel-strip="BL"] [data-mixer-channel-number="gainDb"]'
    );
    if (!input || input.disabled) return false;
    input.value = '-4.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  await waitUntil(() => mixerRequests.some((entry) => (
    entry.path === '/api/audio/mixer/channels'
      && entry.method === 'PATCH'
      && Array.isArray(entry.body?.parameters?.channelGainDb)
      && entry.body.parameters.channelGainDb[4] === -4.5
  )));
  const channelTestClicked = await evaluateFunction(() => {
    const button = document.querySelector(
      '[data-mixer-channel-strip="FL"] [data-mixer-channel-test]'
    );
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  await waitUntil(() => mixerRequests.some((entry) => (
    entry.path === '/api/audio/mixer/channels/test' && entry.method === 'POST'
  )));
  await evaluateFunction(() => new Promise((resolve) => {
    const status = document.querySelector('[data-mixer-channel-status]');
    if (!status || !/正在请求/.test(status.textContent || '')) {
      resolve(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (/正在请求/.test(status.textContent || '')) return;
      observer.disconnect();
      resolve(true);
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, 1600);
  }));
  const afterChannelInteraction = await evaluateFunction(() => {
    const panel = document.querySelector('[data-mixer-channel-panel]');
    return {
      layout: panel?.querySelector('[data-mixer-channel-router-layout]')?.value || '',
      stripIds: [...(panel?.querySelectorAll('[data-mixer-channel-strip]') || [])]
        .map((strip) => strip.dataset.mixerChannelStrip),
      statusText: panel?.querySelector('[data-mixer-channel-status]')?.textContent?.trim() || '',
      blGain: panel?.querySelector(
        '[data-mixer-channel-strip="BL"] [data-mixer-channel-number="gainDb"]'
      )?.value || ''
    };
  });
  const afterChannelObrRoute = await evaluateFunction(() => ({
    backend: document.documentElement.dataset.obrSpatialBackend || '',
    enabled: document.documentElement.dataset.obrSpatialEnabled || '',
    requested: document.getElementById('x3DAudioToggle')?.checked === true
  }));

  const familyModularity = await evaluateFunction(() => {
    const ui = document.querySelector('[data-audio-mixer-ui]');
    const parameters = ui?.querySelector('.audio-mixer-parameters');
    const families = () => [...(parameters?.querySelectorAll(':scope > [data-mixer-family]') || [])];
    const master = ui?.querySelector('[data-mixer-family="master"]');
    const collapse = ui?.querySelector('[data-mixer-family-collapse="master"]');
    const density = ui?.querySelector('[data-mixer-family-density="master"]');
    const drag = ui?.querySelector('[data-mixer-family-drag="master"]');
    const visibility = ui?.querySelector('[data-mixer-family-visibility="master"]');
    const controlsBefore = families().map((family) => family.dataset.mixerFamily);
    collapse?.click();
    const collapsed = master?.dataset.collapsed === 'true'
      && collapse?.getAttribute('aria-expanded') === 'false';
    collapse?.click();
    density?.click();
    const densityChanged = master?.dataset.density === 'compact';
    drag?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    const reordered = families()[1]?.dataset.mixerFamily === 'master';
    drag?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    visibility?.click();
    const hidden = master?.hidden === true;
    visibility?.click();
    const restored = master?.hidden === false;
    const persisted = localStorage.getItem('fe.audioMixer.familyLayout.v1') || '';
    return {
      chooserCount: ui?.querySelectorAll('[data-mixer-family-visibility]').length || 0,
      dragCount: ui?.querySelectorAll('[data-mixer-family-drag]').length || 0,
      collapseCount: ui?.querySelectorAll('[data-mixer-family-collapse]').length || 0,
      densityCount: ui?.querySelectorAll('[data-mixer-family-density]').length || 0,
      controlsBefore,
      collapsed,
      densityChanged,
      reordered,
      hidden,
      restored,
      persisted: /"master"[\s\S]*"density":"compact"/.test(persisted)
    };
  });

  async function collectRealEdgeTelemetry() {
    const mixerGetsBeforePlayback = mixerGetCount;
    await evaluateFunction(() => {
      document.querySelector('[data-mixer-visual-module="meters"]')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await delay(120);
    const telemetryPlayback = await evaluateFunction(async () => {
    const audio = document.getElementById('audio');
    if (!audio) return { captureStreamSupported: false, played: false, reason: 'audio-element-missing' };
    const captureStreamSupported = typeof (audio.captureStream || audio.mozCaptureStream) === 'function';
    if (!captureStreamSupported) {
      return { captureStreamSupported: false, played: false, reason: 'html-media-capture-stream-unavailable' };
    }
    audio.loop = true;
    audio.volume = 0.01;
    audio.src = '/fixtures/mixer-asymmetric-stereo.wav';
    audio.load();
    try {
      await audio.play();
      return {
        captureStreamSupported: true,
        played: !audio.paused,
        reason: audio.paused ? 'media-remained-paused' : ''
      };
    } catch (error) {
      return {
        captureStreamSupported: true,
        played: false,
        reason: String(error?.name || error?.message || 'media-play-rejected').slice(0, 96)
      };
    }
    });

    const inspectRealEdgeTelemetry = () => {
    const visuals = document.querySelector('[data-audio-mixer-visuals]');
    const numberFrom = (value) => {
      const match = String(value || '').match(/[+-]?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };
    const canvasHasInk = (id) => {
      const vector = visuals?.querySelector('[data-visual-vector="' + id + '"]');
      if (vector?.dataset.vectorRendered === 'true') return true;
      if (visuals?.dataset.canvasRenderer === 'worker') {
        const rendered = String(visuals.dataset.canvasWorkerModules || '').split(',');
        if (rendered.includes(id)) {
          return Number(visuals.dataset.canvasWorkerSequence || 0) > 0;
        }
      }
      const canvas = visuals?.querySelector('[data-visual-canvas="' + id + '"]');
      if (!canvas) return false;
      try {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) return true;
        }
      } catch {}
      return false;
    };
    const peak = ['L', 'R'].map((id) => numberFrom(
      visuals?.querySelector('[data-peak-readout="' + id + '"]')?.textContent
    ));
    const rms = ['L', 'R'].map((id) => numberFrom(
      visuals?.querySelector('[data-rms-readout="' + id + '"]')?.textContent
    ));
    const channelLevels = [...(visuals?.querySelectorAll('[data-channel-level]') || [])]
      .map((output) => output.textContent?.trim() || '');
    const visualSnapshot = window.FeAudioMixerVisuals.snapshot(visuals?.parentElement);
    const sourceFrame = visualSnapshot?.telemetry || null;
    const channelRouter = visualSnapshot?.channelRouter || null;
    return {
      telemetryState: visuals?.dataset.telemetryState || '',
      stage: visuals?.dataset.telemetryStage || '',
      statusText: visuals?.querySelector('[data-telemetry-status]')?.textContent?.trim() || '',
      meterState: visuals?.querySelector('[data-mixer-visual-module="meters"]')?.dataset.dataState || '',
      spectrumState: visuals?.querySelector('[data-mixer-visual-module="spectrum"]')?.dataset.dataState || '',
      waveformState: visuals?.querySelector('[data-mixer-visual-module="waveform"]')?.dataset.dataState || '',
      surroundState: visuals?.querySelector('[data-mixer-visual-module="surround"]')?.dataset.dataState || '',
      peak,
      rms,
      sourceStage: sourceFrame?.stage || '',
      sourcePeak: Array.isArray(sourceFrame?.stereo?.peak) ? [...sourceFrame.stereo.peak] : [],
      sourceRms: Array.isArray(sourceFrame?.stereo?.rms) ? [...sourceFrame.stereo.rms] : [],
      sourceGainReductionDb: sourceFrame?.stereo?.gainReductionDb ?? null,
      sourceChannelCount: Number.isFinite(sourceFrame?.channelCount) ? sourceFrame.channelCount : -1,
      routerActual: channelRouter?.actual === true,
      routerChannelCount: Number(channelRouter?.channelCount || 0),
      routerPhysicalMultichannel: channelRouter?.physicalMultichannel === true,
      gainReductionText: visuals?.querySelector('[data-gain-reduction]')?.textContent?.trim() || '',
      spectrumDrawn: canvasHasInk('spectrum'),
      waveformDrawn: canvasHasInk('waveform'),
      surroundDrawn: canvasHasInk('surround'),
      surroundUnavailableIsExplicit: /不可用/.test(
        visuals?.querySelector('[data-visual-unavailable="surround"]')?.textContent || ''
      ),
      channelLevels,
      nativeChannelsAreReal: channelLevels.length === 8
        && channelLevels.every((value) => value !== '—'),
      disabledParameterCount: visuals?.closest('[data-audio-mixer-ui]')
        ?.querySelectorAll('[data-mixer-param]:disabled').length || 0,
      disabledPresetCount: visuals?.closest('[data-audio-mixer-ui]')
        ?.querySelectorAll('[data-mixer-preset-id]:disabled').length || 0
    };
    };

    let realEdgeTelemetry;
    if (!telemetryPlayback.captureStreamSupported) {
      realEdgeTelemetry = {
      status: 'environment-limited',
      limitation: telemetryPlayback.reason,
      ...telemetryPlayback
    };
    } else if (!telemetryPlayback.played) {
      realEdgeTelemetry = {
        status: 'failed',
        limitation: telemetryPlayback.reason,
        ...telemetryPlayback
      };
    } else {
      const observeUntil = async (predicate, timeout = 2200) => {
        const deadline = Date.now() + timeout;
        let current = await evaluateFunction(inspectRealEdgeTelemetry);
        while (Date.now() < deadline && !predicate(current)) {
          await delay(70);
          current = await evaluateFunction(inspectRealEdgeTelemetry);
        }
        return current;
      };
      const revealModule = async (moduleId) => {
        await evaluateFunction((id) => {
          const card = document.querySelector('[data-mixer-visual-module="' + id + '"]');
          const scroller = card?.closest('.settings-center-content');
          if (scroller) scroller.style.scrollBehavior = 'auto';
          card?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }, moduleId);
        await delay(140);
      };

      const signalObservation = await observeUntil((current) => (
        current.telemetryState === 'live'
        && current.stage === 'media-input'
        && current.sourceStage === 'media-input'
        && current.sourcePeak.length === 2
        && current.sourceRms.length === 2
        && current.sourcePeak.every((value) => Number.isFinite(value) && value > 0)
        && current.sourceRms.every((value) => Number.isFinite(value) && value > 0)
        && Math.abs(current.sourcePeak[0] - current.sourcePeak[1]) >= 0.2
        && Math.abs(current.sourceRms[0] - current.sourceRms[1]) >= 0.1
      ));
      await revealModule('meters');
      await revealModule('spectrum');
      const spectrumObservation = await observeUntil((current) => current.spectrumDrawn);
      await revealModule('waveform');
      const waveformObservation = await observeUntil((current) => current.waveformDrawn);
      await revealModule('surround');
      const surroundObservation = await observeUntil((current) => current.surroundDrawn);
      await revealModule('spatial');
      const channelObservation = await observeUntil((current) => current.nativeChannelsAreReal);
      realEdgeTelemetry = {
        status: signalObservation.telemetryState === 'live' ? 'live' : 'failed',
        ...telemetryPlayback,
        ...signalObservation,
        spectrumDrawn: spectrumObservation.spectrumDrawn,
        waveformDrawn: waveformObservation.waveformDrawn,
        surroundDrawn: surroundObservation.surroundDrawn,
        nativeChannelsAreReal: channelObservation.nativeChannelsAreReal,
        channelLevels: channelObservation.channelLevels
      };
    }

    await evaluateFunction(() => {
      const audio = document.getElementById('audio');
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
    realEdgeTelemetry.refreshGetCount = mixerGetCount - mixerGetsBeforePlayback;
    return realEdgeTelemetry;
  }

  const hallClicked = await evaluateFunction(() => {
    const control = document.querySelector(
      '[data-audio-mixer-ui] [data-mixer-preset-id="hall"]'
    );
    if (!control) return false;
    control.click();
    return true;
  });
  if (hallClicked) {
    await waitUntil(() => mixerRequests.some((entry) => (
      entry.method === 'POST' && entry.path === '/api/audio/mixer/presets/hall/apply'
    )));
    await delay(180);
  }
  const afterPreset = await evaluateFunction(
    inspectUi,
    PRESET_IDENTITIES,
    PARAMETER_FAMILIES,
    SIMPLE_PARAMETER_KEYS,
    [...BOOLEAN_PARAMETERS],
    EQ_FREQUENCIES
  );
  const afterPresetObrRoute = await evaluateFunction(() => ({
    backend: document.documentElement.dataset.obrSpatialBackend || '',
    enabled: document.documentElement.dataset.obrSpatialEnabled || '',
    requested: document.getElementById('x3DAudioToggle')?.checked === true
  }));

  const burstSetup = await evaluateFunction(async () => {
    const control = document.querySelector(
      '[data-audio-mixer-ui] [data-mixer-param="inputGainDb"]'
    );
    if (!control) return { exists: false, before: '', active: false };
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    control.focus();
    return {
      exists: true,
      before: control.value,
      active: document.activeElement === control,
      type: control.getAttribute('type') || ''
    };
  });
  if (burstSetup.exists) {
    for (let index = 0; index < 5; index += 1) await key('ArrowRight', 'ArrowRight');
    await delay(760);
  }
  const patchRequestsAfterBurst = mixerRequests.filter((entry) => (
    entry.method === 'PATCH'
      && entry.path === '/api/audio/mixer'
      && !Object.hasOwn(entry.body?.parameters || {}, 'upmixOutputLayout')
  )).length;
  const afterBurst = await evaluateFunction(() => {
    const ui = document.querySelector('[data-audio-mixer-ui]');
    const control = ui?.querySelector('[data-mixer-param="inputGainDb"]');
    const selected = ui?.dataset.selectedPreset || '';
    return {
      exists: !!control,
      value: control?.value || '',
      active: document.activeElement === control,
      selectedPreset: selected,
      customVisible: selected === 'custom'
        || !!ui?.querySelector('[data-mixer-preset-id="custom"][aria-pressed="true"]')
        || /自定义/.test(ui?.textContent || '')
    };
  });

  const getsBeforeConflict = mixerGetCount;
  const conflictSetup = await evaluateFunction(async () => {
    const control = document.querySelector(
      '[data-audio-mixer-ui] [data-mixer-param="outputGainDb"]'
    );
    if (!control) return { exists: false, before: '' };
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    control.focus();
    return { exists: true, before: control.value, active: document.activeElement === control };
  });
  if (conflictSetup.exists) {
    await key('ArrowLeft', 'ArrowLeft');
    await waitUntil(() => mixerRequests.filter((entry) => entry.method === 'PATCH').length >= 2);
    await waitUntil(() => mixerGetCount > getsBeforeConflict);
    await delay(180);
  }
  const afterConflict = await evaluateFunction(() => {
    const ui = document.querySelector('[data-audio-mixer-ui]');
    const output = ui?.querySelector('[data-mixer-param="outputGainDb"]');
    const playback = ui?.querySelector('[data-mixer-playback-state]');
    const status = ui?.querySelector('[data-mixer-status],[role="alert"]');
    const revision = ui?.querySelector('[data-mixer-revision]');
    return {
      uiExists: !!ui,
      outputValue: output?.value || '',
      selectedPreset: ui?.dataset.selectedPreset || '',
      playbackState: playback?.dataset.playbackState || '',
      playbackText: playback?.textContent?.trim() || '',
      statusText: status?.textContent?.trim() || '',
      revisionText: revision?.textContent?.trim() || ''
    };
  });

  const viewportResults = [];
  for (const [width, height] of [[320, 720], [768, 720], [1440, 900]]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
    const measurement = await evaluateFunction(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = document.getElementById('runtimeSettingsPanel');
      const content = panel?.querySelector('.settings-center-content');
      const ui = panel?.querySelector('[data-audio-mixer-ui]');
      const channelGrid = ui?.querySelector('.audio-mixer-channel-strips');
      const channelStrip = channelGrid?.querySelector('[data-mixer-channel-strip]');
      const channelControl = channelStrip?.querySelector('.audio-mixer-channel-strip__control');
      const rect = panel?.getBoundingClientRect();
      const overflowOffenders = ui
        ? [...ui.querySelectorAll('*')]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => ({
              tag: element.tagName,
              className: typeof element.className === 'string' ? element.className : '',
              mixerFamily: element.dataset?.mixerFamily || '',
              channelStrip: element.dataset?.mixerChannelStrip || '',
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              overflow: element.scrollWidth - element.clientWidth
            }))
            .sort((left, right) => right.overflow - left.overflow)
            .slice(0, 12)
        : [];
      return {
        viewport: [innerWidth, innerHeight],
        rect: rect ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        } : null,
        withinViewport: !!rect
          && rect.left >= -1
          && rect.top >= -1
          && rect.right <= innerWidth + 1
          && rect.bottom <= innerHeight + 1,
        panelNoHorizontalOverflow: !!panel && panel.scrollWidth <= panel.clientWidth + 1,
        contentNoHorizontalOverflow: !!content && content.scrollWidth <= content.clientWidth + 1,
        mixerUiExists: !!ui,
        mixerUiNoHorizontalOverflow: !!ui && ui.scrollWidth <= ui.clientWidth + 1,
        mixerUiWidth: ui ? [ui.clientWidth, ui.scrollWidth] : [0, 0],
        channelPanelSizing: channelGrid && channelStrip && channelControl ? {
          grid: channelGrid.clientWidth,
          strip: channelStrip.clientWidth,
          control: channelControl.clientWidth,
          stripCss: {
            width: getComputedStyle(channelStrip).width,
            padding: getComputedStyle(channelStrip).padding,
            columns: getComputedStyle(channelStrip).gridTemplateColumns
          },
          controlCss: {
            width: getComputedStyle(channelControl).width,
            display: getComputedStyle(channelControl).display,
            columns: getComputedStyle(channelControl).gridTemplateColumns,
            justifySelf: getComputedStyle(channelControl).justifySelf,
            gridColumn: getComputedStyle(channelControl).gridColumn
          },
          stripChildren: [...channelStrip.children].map((element) => ({
            className: element.className,
            clientWidth: element.clientWidth,
            cssWidth: getComputedStyle(element).width,
            gridColumn: getComputedStyle(element).gridColumn
          })),
          fillsGrid: innerWidth > 560 || channelStrip.clientWidth >= channelGrid.clientWidth - 2,
          controlUsable: channelControl.clientWidth >= Math.min(88, channelGrid.clientWidth - 24)
        } : null,
        overflowOffenders,
        documentNoHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
      };
    });
    viewportResults.push(measurement);
  }

  const realEdgeTelemetry = await collectRealEdgeTelemetry();

  const presetApplyRequest = mixerRequests.find((entry) => (
    entry.method === 'POST' && entry.path === '/api/audio/mixer/presets/hall/apply'
  ));
  const patchRequests = mixerRequests.filter((entry) => (
    entry.method === 'PATCH' && entry.path === '/api/audio/mixer'
  ));
  const effectiveLayoutPatch = patchRequests.find((entry) => (
    entry.body?.parameters?.upmixEnabled === true
      && entry.body?.parameters?.upmixOutputLayout === '7.1'
  ));
  const firstPatch = patchRequests.find((entry) => (
    Object.hasOwn(entry.body?.parameters || {}, 'inputGainDb')
  ));
  const conflictPatch = patchRequests.find((entry) => (
    Object.hasOwn(entry.body?.parameters || {}, 'outputGainDb')
  ));
  const mixerMutationRequests = mixerRequests.filter((entry) => ['PATCH', 'POST'].includes(entry.method));
  const channelPatchRequests = mixerRequests.filter((entry) => (
    entry.method === 'PATCH' && entry.path === '/api/audio/mixer/channels'
  ));
  const channelTestRequest = mixerRequests.find((entry) => (
    entry.method === 'POST' && entry.path === '/api/audio/mixer/channels/test'
  ));
  const expectedFamilyForKey = new Map();
  Object.entries(PARAMETER_FAMILIES).forEach(([family, keys]) => {
    keys.forEach((key) => expectedFamilyForKey.set(key, family));
  });

  const checks = {
    settingsCenterOpensMixerPage: opened.result === true
      && opened.snapshot?.open === true
      && opened.snapshot?.selectedPage === 'mixer'
      && initialUi.panelVisible
      && initialUi.pageVisible,
    eightVersionedPresetControls: initialUi.uiExists
      && initialUi.ready === 'true'
      && initialUi.presetResults.length === 8
      && initialUi.presetResults.every((item) => (
        item.exists && item.isButton && item.labelMatches && item.accessibleName
      )),
    everyParameterFamilyAndControlRendered: initialUi.familyResults.length === 8
      && initialUi.familyResults.every((family) => family.exists && family.labelled)
      && initialUi.controlResults.length === SIMPLE_PARAMETER_KEYS.length
      && initialUi.controlResults.every((control) => (
        control.exists
        && control.family === expectedFamilyForKey.get(control.key)
        && !control.disabled
        && control.tabIndex >= 0
        && control.accessibleName
        && control.booleanShape
      ))
      && initialUi.eqResults.length === 10
      && initialUi.eqResults.every((control) => (
        control.exists
        && control.frequencyMatches
        && control.family === 'equalizer'
        && !control.disabled
        && control.tabIndex >= 0
        && control.accessibleName
      )),
    nativeBypassAndReadOnlyDiagnosticsAreHonest: initialUi.playback.state === 'native-mixer-bypassed'
      && /旁路|未生效/.test(initialUi.playback.text)
      && initialUi.diagnostics.upmix.length > 0
      && initialUi.diagnostics.obr.length > 0,
    professionalVisualsAreHonestAndAccessible: initialUi.visuals.exists
      && initialUi.visuals.productionTelemetrySource === 'media-element'
      && initialUi.visuals.telemetryState === 'unavailable'
      && initialUi.visuals.telemetryStage === 'media-input'
      && /播放源前级/.test(initialUi.visuals.meterTitle)
      && !initialUi.visuals.misleadingOutputCopy
      && initialUi.visuals.moduleIds.join(',') === 'meters,spectrum,stereo-field,surround,waveform,spatial'
      && initialUi.visuals.unavailableIsExplicit
      && initialUi.visuals.rangeCount > 0
      && initialUi.visuals.numericCount === initialUi.visuals.rangeCount
      && initialUi.visuals.physicalOutput === '2'
      && initialUi.visuals.testSignalEnabledCount === 0
      && initialUi.visuals.automationState === 'preview-only'
      && initialUi.visuals.licensedAlgorithmsDisabled,
    independentChannelRouterIsRealAccessibleAndVersioned: initialUi.channelRouter.exists
      && initialUi.channelRouter.state === 'saved'
      && initialUi.channelRouter.layout === 'stereo'
      && initialUi.channelRouter.disabledConfigControlCount === 0
      && initialUi.channelRouter.enabledTestCount === 0
      && initialUi.channelRouter.strips.map((strip) => strip.id).join(',') === 'FL,FR,FC,LFE,SL,SR'
      && initialUi.channelRouter.strips.every((strip) => (
        strip.gainRange && strip.gainNumber
        && strip.delayRange && strip.delayNumber
        && strip.azimuthRange && strip.azimuthNumber
        && strip.testButton
      ))
      && initialUi.channelRouter.matrixCellCount === 16
      && initialUi.channelRouter.algorithms.filter((entry) => !entry.disabled)
        .map((entry) => entry.value).join(',')
        === 'front-only,matrix-decode,ambient-extract,custom-matrix'
      && initialUi.channelRouter.algorithms.filter((entry) => entry.disabled)
        .map((entry) => entry.value).join(',')
        === 'passive,dolby-pro-logic-iix,dts-neural-x'
      && /双声道|耳机/.test(initialUi.channelRouter.physicalOutputText)
      && /折叠/.test(initialUi.channelRouter.physicalOutputText)
      && !/OBR/.test(initialUi.channelRouter.physicalOutputText)
      && /已保存/.test(initialUi.channelRouter.statusText)
      && channelLayoutChanged
      && channelBackGainEdited
      && channelTestClicked
      && afterChannelInteraction.layout === '7.1'
      && afterChannelInteraction.stripIds.join(',') === 'FL,FR,FC,LFE,BL,BR,SL,SR'
      && Number(afterChannelInteraction.blGain) === -4.5
      && /未进入可听链|未接受/.test(afterChannelInteraction.statusText)
      && !/已发送|已播放/.test(afterChannelInteraction.statusText)
      && effectiveLayoutPatch?.body?.expectedRevision === 12
      && effectiveLayoutPatch?.body?.parameters?.upmixEnabled === true
      && effectiveLayoutPatch?.body?.parameters?.upmixOutputLayout === '7.1'
      && channelPatchRequests[0]?.body?.expectedRevision === 7
      && channelPatchRequests[0]?.body?.parameters?.layout === '7.1'
      && channelPatchRequests[1]?.body?.expectedRevision === 8
      && channelPatchRequests[1]?.body?.parameters?.channelGainDb?.length === 8
      && channelPatchRequests[1]?.body?.parameters?.channelGainDb?.[4] === -4.5
      && channelTestRequest?.body?.layout === '7.1'
      && channelTestRequest?.body?.channel === 'FL'
      && channelTestRequest?.body?.kind === 'tone'
      && channelTestRequest?.body?.durationMs === 500
      && channelTestRequest?.body?.frequencyHz === 997
      && channelTestRequest?.body?.gainDb === -18,
    parameterFamiliesAreModularAndPersistent: familyModularity.chooserCount === 8
      && familyModularity.dragCount === 8
      && familyModularity.collapseCount === 8
      && familyModularity.densityCount === 8
      && familyModularity.controlsBefore.length === 8
      && familyModularity.collapsed
      && familyModularity.densityChanged
      && familyModularity.reordered
      && familyModularity.hidden
      && familyModularity.restored
      && familyModularity.persisted,
    realEdgeMediaInputTelemetryIsHonest: realEdgeTelemetry.status === 'environment-limited'
      ? realEdgeTelemetry.captureStreamSupported === false
        && typeof realEdgeTelemetry.limitation === 'string'
        && realEdgeTelemetry.limitation.length > 0
      : realEdgeTelemetry.status === 'live'
        && realEdgeTelemetry.captureStreamSupported === true
        && realEdgeTelemetry.played === true
        && realEdgeTelemetry.stage === 'media-input'
        && /播放源前级/.test(realEdgeTelemetry.statusText)
        && realEdgeTelemetry.meterState === 'live'
        && realEdgeTelemetry.spectrumState === 'live'
        && realEdgeTelemetry.waveformState === 'live'
        && realEdgeTelemetry.surroundState === 'live'
        && realEdgeTelemetry.sourceStage === 'media-input'
        && realEdgeTelemetry.sourcePeak.length === 2
        && realEdgeTelemetry.sourceRms.length === 2
        && realEdgeTelemetry.sourcePeak.every((value) => Number.isFinite(value) && value > 0)
        && realEdgeTelemetry.sourceRms.every((value) => Number.isFinite(value) && value > 0)
        && Math.abs(realEdgeTelemetry.sourcePeak[0] - realEdgeTelemetry.sourcePeak[1]) >= 0.2
        && Math.abs(realEdgeTelemetry.sourceRms[0] - realEdgeTelemetry.sourceRms[1]) >= 0.1
        && realEdgeTelemetry.sourceGainReductionDb === null
        && realEdgeTelemetry.sourceChannelCount === 0
        && realEdgeTelemetry.routerActual === true
        && realEdgeTelemetry.routerChannelCount === 8
        && realEdgeTelemetry.routerPhysicalMultichannel === false
        && realEdgeTelemetry.spectrumDrawn
        && realEdgeTelemetry.waveformDrawn
        && realEdgeTelemetry.surroundDrawn
        && realEdgeTelemetry.nativeChannelsAreReal
        && realEdgeTelemetry.gainReductionText === 'GR —'
        && realEdgeTelemetry.disabledParameterCount === 0
        && realEdgeTelemetry.disabledPresetCount === 0
        && realEdgeTelemetry.refreshGetCount <= 6,
    presetApplyUsesCurrentRevision: !!presetApplyRequest
      && presetApplyRequest.body?.expectedRevision === 13
      && afterPreset.selectedPreset === 'hall'
      && afterPreset.presetResults.find((item) => item.id === 'hall')?.pressed === 'true',
    explicitMixerChangeActivatesNativeRoute: afterChannelObrRoute.requested === true
      && afterPresetObrRoute.requested === true
      && afterPresetObrRoute.backend === 'waiting-for-audio'
      && afterPresetObrRoute.enabled === 'false',
    rapidKeyboardEditsAreBoundedAndDebounced: burstSetup.exists
      && burstSetup.active
      && afterBurst.exists
      && afterBurst.active
      && afterBurst.value !== burstSetup.before
      && patchRequestsAfterBurst === 1
      && !!firstPatch
      && firstPatch.body?.expectedRevision === 14
      && Object.keys(firstPatch.body?.parameters || {}).length >= 1
      && Object.keys(firstPatch.body?.parameters || {}).length <= 3,
    manualChangeBecomesCustom: afterBurst.customVisible
      && afterBurst.selectedPreset === 'custom',
    revisionConflictRefreshesLatestSnapshot: !!conflictPatch
      && conflictPatch.body?.expectedRevision === 15
      && mixerGetCount > getsBeforeConflict
      && afterConflict.selectedPreset === 'custom'
      && Number(afterConflict.outputValue) === -6
      && /16/.test(afterConflict.revisionText)
      && /冲突|刷新|已更新/.test(afterConflict.statusText),
    compatiblePlaybackStateIsExplicit: afterConflict.playbackState === 'browser-compatible'
      && /兼容播放/.test(afterConflict.playbackText)
      && /未生效/.test(afterConflict.playbackText),
    mutationRequestsExcludeCredentialsAndNativePaths: mixerMutationRequests.length >= 3
      && mixerMutationRequests.every(mutationRequestIsBoundedAndRedacted),
    allViewportsAvoidHorizontalOverflow: viewportResults.every((item) => (
      item.withinViewport
      && item.panelNoHorizontalOverflow
      && item.contentNoHorizontalOverflow
      && item.mixerUiExists
      && item.mixerUiNoHorizontalOverflow
      && item.channelPanelSizing?.fillsGrid
      && item.channelPanelSizing?.controlUsable
      && item.documentNoHorizontalOverflow
    )),
    consoleClean: browserErrors.length === 0
  };

  const result = {
    apiFixture: {
      initialRevision: 12,
      finalRevision: mixerState.revision,
      patchAttempts: patchAttemptCount,
      mixerGets: mixerGetCount,
      requests: mixerRequests.map((entry) => ({
        method: entry.method,
        path: entry.path,
        search: entry.search,
        body: entry.body
      }))
    },
    opened,
    initialUi,
    familyModularity,
    realEdgeTelemetry,
    initialObrRoute,
    interaction: {
      channelRouter: {
        channelLayoutChanged,
        channelBackGainEdited,
        channelTestClicked,
        afterChannelInteraction,
        beforeObrRoute: initialObrRoute,
        afterObrRoute: afterChannelObrRoute
      },
      hallClicked,
      afterPreset: {
        selectedPreset: afterPreset.selectedPreset,
        revisionText: afterPreset.revisionText,
        obrRoute: afterPresetObrRoute
      },
      burstSetup,
      patchRequestsAfterBurst,
      afterBurst,
      conflictSetup,
      afterConflict
    },
    viewportResults,
    browserErrors,
    checks,
    pass: Object.values(checks).every(Boolean)
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(200);
  const resolvedProfile = path.resolve(profile);
  if (resolvedProfile.startsWith(path.resolve(tempRoot) + path.sep)) {
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
    } catch {}
  }
}
