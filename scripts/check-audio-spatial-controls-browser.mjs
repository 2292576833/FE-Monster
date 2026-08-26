import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edge = edgeCandidates.find(existsSync);
if (!edge) throw new Error('Microsoft Edge was not found');

const tempRoot = path.join(root, 'tmp');
const profile = path.join(tempRoot, `audio-spatial-controls-browser-${process.pid}-${Date.now()}`);
const debugPort = 38000 + Math.floor(Math.random() * 1500);
mkdirSync(profile, { recursive: true });

const SPATIAL_KEYS = [
  'upmixEnabled',
  'upmixAlgorithm',
  'upmixOutputLayout',
  'upmixCenterWidthHz',
  'upmixLfeCrossoverHz',
  'upmixCenterGain',
  'upmixSurroundGain',
  'upmixLfeGain',
  'upmixDecorrelation',
  'obrEnabled',
  'obrFilterProfile',
  'obrWet',
  'obrDry',
  'obrOutputGainDb',
  'obrSpatialWidth',
];
const BOOLEAN_KEYS = new Set(['upmixEnabled', 'obrEnabled']);
const SELECT_KEYS = new Set(['upmixAlgorithm', 'upmixOutputLayout', 'obrFilterProfile']);
function mixerParameters(patch = {}) {
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
    obrSpatialWidth: 1,
    chorusEnabled: false, chorusRateHz: 0.30, chorusDepth: 0.35, chorusCenterDelayMs: 18, chorusFeedback: 0, chorusMix: 0,
    flangerEnabled: false, flangerRateHz: 0.18, flangerDepth: 0.50, flangerCenterDelayMs: 1.5, flangerFeedback: 0.35, flangerMix: 0,
    phaserEnabled: false, phaserRateHz: 0.20, phaserDepth: 0.50, phaserCenterFrequencyHz: 900, phaserFeedback: 0.20, phaserMix: 0,
    delayEnabled: false, delayMs: 320, delayFeedback: 0.30, delayPingPong: 0.75, delayDampingHz: 8000, delayMix: 0,
    earlyReflectionsEnabled: false, earlyReflectionsRoomSize: 0.35, earlyReflectionsDiffusion: 0.55, earlyReflectionsDamping: 0.45, earlyReflectionsMix: 0,
    ...patch,
  };
}

function completePreset(id, label, patch = {}) {
  return { id, label, parameters: mixerParameters(patch) };
}

const presetPayload = [
  completePreset('clean', '纯净'),
  completePreset('bathroom', '浴室', { reverbEnabled: true, reverbRoomSize: 0.22, reverbDecayMs: 650, reverbDamping: 0.35, reverbPreDelayMs: 8, reverbWet: 0.32, reverbDry: 0.82 }),
  completePreset('hall', '大厅', { reverbEnabled: true, reverbRoomSize: 0.82, reverbDecayMs: 2800, reverbDamping: 0.62, reverbPreDelayMs: 28, reverbWet: 0.36, reverbDry: 0.88 }),
  completePreset('surround-3d', '3D环绕', { inputGainDb: -6, stereoWidth: 1.2, upmixEnabled: true, upmixOutputLayout: '7.1', upmixCenterGain: 0.68, upmixSurroundGain: 0.52, upmixLfeGain: 0.48, obrEnabled: true, obrSpatialWidth: 1.3 }),
  completePreset('cinema', '影院', { inputGainDb: -1.5, centerGain: 1.12, surroundGain: 1.18, lfeGain: 1.22, compressorEnabled: true, compressorThresholdDb: -16, compressorRatio: 2.2, compressorMakeupDb: 1 }),
  completePreset('vocal-clear', '人声清晰', { centerGain: 1.15, compressorEnabled: true, compressorThresholdDb: -20, compressorRatio: 2, compressorMakeupDb: 1 }),
  completePreset('bass-boost', '低频增强', { inputGainDb: -1, lfeGain: 1.3, limiterCeilingDb: -0.8 }),
  completePreset('night', '夜间', { inputGainDb: -3, outputGainDb: -2, compressorEnabled: true, compressorThresholdDb: -28, compressorRatio: 6, compressorAttackMs: 5, compressorReleaseMs: 350, compressorKneeDb: 10, compressorMakeupDb: 3, limiterCeilingDb: -3 }),
  completePreset('wide-chorus', '宽阔合唱', { stereoWidth: 1.15, chorusEnabled: true, chorusRateHz: 0.32, chorusDepth: 0.42, chorusCenterDelayMs: 18, chorusFeedback: 0.08, chorusMix: 0.30 }),
  completePreset('classic-flanger', '经典镶边', { flangerEnabled: true, flangerRateHz: 0.18, flangerDepth: 0.65, flangerCenterDelayMs: 1.6, flangerFeedback: 0.55, flangerMix: 0.32 }),
  completePreset('flowing-phaser', '流动移相', { phaserEnabled: true, phaserRateHz: 0.22, phaserDepth: 0.55, phaserCenterFrequencyHz: 900, phaserFeedback: 0.25, phaserMix: 0.34 }),
  completePreset('ping-pong-delay', '乒乓回声', { delayEnabled: true, delayMs: 320, delayFeedback: 0.38, delayPingPong: 0.85, delayDampingHz: 8000, delayMix: 0.28 }),
  completePreset('nearfield-studio', '近场工作室', { earlyReflectionsEnabled: true, earlyReflectionsRoomSize: 0.28, earlyReflectionsDiffusion: 0.48, earlyReflectionsDamping: 0.42, earlyReflectionsMix: 0.16 }),
  completePreset('immersive-live', '沉浸现场', { earlyReflectionsEnabled: true, earlyReflectionsRoomSize: 0.72, earlyReflectionsDiffusion: 0.75, earlyReflectionsDamping: 0.55, earlyReflectionsMix: 0.22, reverbEnabled: true, reverbRoomSize: 0.75, reverbDecayMs: 2200, reverbDamping: 0.60, reverbPreDelayMs: 25, reverbWet: 0.20, reverbDry: 1, upmixEnabled: true, upmixAlgorithm: 'music-detail', upmixOutputLayout: '7.1', obrEnabled: true, obrFilterProfile: 'direct', obrSpatialWidth: 1.15 })
];

let state = {
  revision: 21,
  selectedPreset: 'custom',
  spatialMigrationNeeded: true,
  parameters: mixerParameters(),
};
let forceConflict = false;
let mixerGets = 0;
const mutations = [];

function spatialRoute(parameters) {
  if (parameters.upmixEnabled && parameters.obrEnabled) return 'upmix-mixer-x3d-obr';
  if (parameters.upmixEnabled) return 'upmix-mixer-non-obr-out';
  if (parameters.obrEnabled) return 'stereo-mixer-obr';
  return 'stereo-mixer-out';
}

function snapshot() {
  const { parameters } = state;
  const upmixOrdinal = parameters.upmixEnabled ? 1 : 0;
  const mixerOrdinal = parameters.upmixEnabled ? 2 : 1;
  const obrOrdinal = parameters.obrEnabled ? (parameters.upmixEnabled ? 4 : 3) : 0;
  return {
    ok: true,
    version: 1,
    presetVersion: 1,
    revision: state.revision,
    selectedPreset: state.selectedPreset,
    configState: 'ready',
    spatialMigrationNeeded: state.spatialMigrationNeeded === true,
    parameters: structuredClone(parameters),
    nativeBackendAvailable: true,
    nativeChainActive: true,
    mixerAvailable: true,
    mixerActive: true,
    mixerEnabled: true,
    mixerFailureDisabled: false,
    bypassReason: '',
    lastResult: 0,
    processCalls: 73,
    bypassedBlocks: 0,
    processFailures: 0,
    consecutiveFailures: 0,
    partialFailureBypasses: 0,
    activeRevision: state.revision,
    stagedRevision: state.revision,
    spatialRoute: spatialRoute(parameters),
    upmix: {
      available: true,
      enabled: parameters.upmixEnabled,
      active: parameters.upmixEnabled,
      algorithm: parameters.upmixAlgorithm,
      outputLayout: parameters.upmixOutputLayout,
      processCalls: parameters.upmixEnabled ? 70 : 0,
      fallbackBlocks: 0,
      bypassReason: parameters.upmixEnabled ? '' : 'disabled',
      lastResult: 0,
    },
    obr: {
      available: true,
      enabled: parameters.obrEnabled,
      active: parameters.obrEnabled,
      rendererReady: parameters.obrEnabled,
      backend: 'google-obr',
      filterProfile: parameters.obrFilterProfile,
      wet: parameters.obrWet,
      dry: parameters.obrDry,
      outputGainDb: parameters.obrOutputGainDb,
      spatialWidth: parameters.obrSpatialWidth,
      processCalls: parameters.obrEnabled ? 70 : 0,
      bypassReason: parameters.obrEnabled ? '' : 'dry-through',
      lastResult: 0,
    },
    order: { upmix: upmixOrdinal, mixer: mixerOrdinal, obr: obrOrdinal },
    playbackState: 'native-mixer',
  };
}

function send(response, status, type, body) {
  const bytes = Buffer.from(body);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': type,
    'content-length': bytes.length,
  });
  response.end(bytes);
}

function sendJson(response, status, body) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

async function requestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const pageHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>spatial controls probe</title></head>
<body><main id="host"></main><script src="/audio-mixer-ui.js"></script><script>
window.__ensureNativeChainCalls = [];
window.__probeController = window.FeAudioMixerUi.mount(document.getElementById('host'), {
  ensureNativeChain(payload) {
    window.__ensureNativeChainCalls.push({
      payload: structuredClone(payload),
      parametersFrozen: Object.isFrozen(payload?.parameters)
    });
    return Promise.resolve(true);
  }
});
</script></body></html>`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/') {
      send(response, 200, 'text/html; charset=utf-8', pageHtml);
      return;
    }
    if (url.pathname === '/audio-mixer-ui.js') {
      send(
        response,
        200,
        'text/javascript; charset=utf-8',
        readFileSync(path.join(root, 'web/audio-mixer-ui.js')),
      );
      return;
    }
    if (url.pathname === '/api/audio/mixer' && request.method === 'GET') {
      mixerGets += 1;
      sendJson(response, 200, snapshot());
      return;
    }
    if (url.pathname === '/api/audio/mixer/presets' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, presetVersion: 1, presets: presetPayload });
      return;
    }
    if (url.pathname === '/api/audio/mixer' && request.method === 'PATCH') {
      const body = await requestJson(request);
      mutations.push(structuredClone(body));
      if (forceConflict) {
        forceConflict = false;
        state = {
          revision: state.revision + 1,
          selectedPreset: 'custom',
          parameters: { ...state.parameters, obrSpatialWidth: 1.08 },
        };
        sendJson(response, 409, {
          ok: false,
          error: 'audio mixer revision conflict',
          errorCode: 'audio_mixer_revision_conflict',
          currentRevision: state.revision,
        });
        return;
      }
      if (body.expectedRevision !== state.revision) {
        sendJson(response, 409, {
          ok: false,
          errorCode: 'audio_mixer_revision_conflict',
          currentRevision: state.revision,
        });
        return;
      }
      state = {
        revision: state.revision + 1,
        selectedPreset: 'custom',
        parameters: { ...state.parameters, ...body.parameters },
      };
      sendJson(response, 200, snapshot());
      return;
    }
    sendJson(response, 404, { ok: false });
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || 'fixture failed' });
  }
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const browserErrors = [];
let browser;
let socket;
let nextId = 1;

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function retryJson(url, timeout = 8_000) {
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

function command(method, params = {}, timeout = 15_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeout);
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolve(value); },
      reject(error) { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluateFunction(fn, ...args) {
  const expression = `(${fn})(${args.map((arg) => JSON.stringify(arg)).join(',')})`;
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(fn, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return true;
    } catch {}
    await delay(60);
  }
  return false;
}

try {
  await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--disable-extensions',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((entry) => entry.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('Edge page target missing');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || 'browser exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push(message.params.args?.map((arg) => arg.value || arg.description || '').join(' '));
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: baseUrl });
  const ready = await waitFor(() => evaluateFunction(() => (
    document.querySelector('[data-audio-mixer-ui]')?.dataset.mixerReady === 'true'
  )));

  const initial = await evaluateFunction((keys, booleanKeys, selectKeys) => {
    const rootNode = document.querySelector('[data-audio-mixer-ui]');
    const name = (control) => (
      control?.getAttribute('aria-label')
      || control?.closest('label')?.textContent
      || ''
    ).trim();
    return {
      ready: rootNode?.dataset.mixerReady || '',
      presets: rootNode?.querySelectorAll('[data-mixer-preset-id]').length || 0,
      families: ['upmix', 'obr'].map((id) => ({
        id,
        exists: !!rootNode?.querySelector(`[data-mixer-family="${id}"]`),
      })),
      controls: keys.map((key) => {
        const control = rootNode?.querySelector(`[data-mixer-param="${key}"]`);
        return {
          key,
          exists: !!control,
          family: control?.closest('[data-mixer-family]')?.dataset.mixerFamily || '',
          type: control?.tagName === 'SELECT' ? 'select' : control?.getAttribute('type') || '',
          expectedType: booleanKeys.includes(key) ? 'checkbox' : selectKeys.includes(key) ? 'select' : 'range',
          disabled: !!control?.disabled,
          accessibleName: name(control),
        };
      }),
      playbackState: rootNode?.querySelector('[data-mixer-playback-state]')?.dataset.playbackState || '',
      playbackText: rootNode?.querySelector('[data-mixer-playback-state]')?.textContent || '',
      upmixDiagnostic: rootNode?.querySelector('[data-mixer-diagnostic="upmix"]')?.textContent || '',
      obrDiagnostic: rootNode?.querySelector('[data-mixer-diagnostic="obr"]')?.textContent || '',
    };
  }, SPATIAL_KEYS, [...BOOLEAN_KEYS], [...SELECT_KEYS]);

  const interaction = await evaluateFunction((values) => {
    const missing = [];
    Object.entries(values).forEach(([key, value]) => {
      const control = document.querySelector(`[data-mixer-param="${key}"]`);
      if (!control) {
        missing.push(key);
        return;
      }
      if (control.type === 'checkbox') {
        control.checked = value;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        control.value = String(value);
        control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
    });
    return { missing };
  }, {
    upmixEnabled: true,
    upmixAlgorithm: 'ambient-extract',
    upmixOutputLayout: '7.1',
    upmixCenterWidthHz: 520,
    upmixLfeCrossoverHz: 90,
    upmixCenterGain: 0.82,
    upmixSurroundGain: 0.74,
    upmixLfeGain: 0.61,
    upmixDecorrelation: 0.88,
    obrEnabled: false,
    obrFilterProfile: 'reverberant',
    obrWet: 0.76,
    obrDry: 0.24,
    obrOutputGainDb: -3.5,
    obrSpatialWidth: 1.35,
  });
  await waitFor(() => Promise.resolve(mutations.length >= 1), 1_500);
  await delay(300);

  const firstPatch = mutations[0] || null;
  const inspectRoute = () => ({
    playback: document.querySelector('[data-mixer-playback-state]')?.dataset.playbackState || '',
    upmix: document.querySelector('[data-mixer-diagnostic="upmix"]')?.textContent || '',
    obr: document.querySelector('[data-mixer-diagnostic="obr"]')?.textContent || '',
  });
  const routeOnOff = await evaluateFunction(inspectRoute);

  const offOnStarted = await evaluateFunction(() => {
    const upmix = document.querySelector('[data-mixer-param="upmixEnabled"]');
    const obr = document.querySelector('[data-mixer-param="obrEnabled"]');
    if (!upmix || !obr) return false;
    upmix.checked = false;
    upmix.dispatchEvent(new Event('change', { bubbles: true }));
    obr.checked = true;
    obr.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (offOnStarted) {
    await waitFor(() => Promise.resolve(mutations.length >= 2), 1_500);
    await delay(250);
  }
  const routeOffOn = await evaluateFunction(inspectRoute);

  const onOnStarted = await evaluateFunction(() => {
    const upmix = document.querySelector('[data-mixer-param="upmixEnabled"]');
    if (!upmix) return false;
    upmix.checked = true;
    upmix.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  if (onOnStarted) {
    await waitFor(() => Promise.resolve(mutations.length >= 3), 1_500);
    await delay(250);
  }
  const routeOnOn = await evaluateFunction(inspectRoute);

  forceConflict = true;
  const getsBeforeConflict = mixerGets;
  const conflictStarted = await evaluateFunction(() => {
    const control = document.querySelector('[data-mixer-param="obrSpatialWidth"]');
    if (!control) return false;
    control.value = '1.55';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  if (conflictStarted) {
    await waitFor(() => Promise.resolve(mutations.length >= 4 && mixerGets > getsBeforeConflict), 2_000);
    await delay(250);
  }
  const afterConflict = await evaluateFunction(() => ({
    revision: document.querySelector('[data-mixer-revision]')?.textContent || '',
    width: document.querySelector('[data-mixer-param="obrSpatialWidth"]')?.value || '',
    status: document.querySelector('[data-mixer-status]')?.textContent || '',
  }));
  const ensureNativeChainCalls = await evaluateFunction(() => (
    structuredClone(window.__ensureNativeChainCalls || [])
  ));

  const expectedPatch = {
    upmixEnabled: true,
    upmixAlgorithm: 'ambient-extract',
    upmixOutputLayout: '7.1',
    upmixCenterWidthHz: 520,
    upmixLfeCrossoverHz: 90,
    upmixCenterGain: 0.82,
    upmixSurroundGain: 0.74,
    upmixLfeGain: 0.61,
    upmixDecorrelation: 0.88,
    obrEnabled: false,
    obrFilterProfile: 'reverberant',
    obrWet: 0.76,
    obrDry: 0.24,
    obrOutputGainDb: -3.5,
    obrSpatialWidth: 1.35,
  };
  const checks = {
    mountedInRealBrowser: ready && initial.ready === 'true',
    fourteenServerPresetsRemain: initial.presets === 14,
    twoIndependentFamiliesRender: initial.families.every((family) => family.exists),
    everyRealControlIsAccessible: initial.controls.length === SPATIAL_KEYS.length
      && initial.controls.every((control) => (
        control.exists
        && control.family === (control.key.startsWith('upmix') ? 'upmix' : 'obr')
        && control.type === control.expectedType
        && !control.disabled
        && control.accessibleName
      )),
    offOffIsHonestAndMixerRemainsActive: initial.playbackState === 'native-mixer'
      && /生效/.test(initial.playbackText)
      && /关闭|旁路/.test(initial.upmixDiagnostic)
      && /关闭|干声|直通/.test(initial.obrDiagnostic),
    allControlsShareOneRevisionedPatch: interaction.missing.length === 0
      && firstPatch?.expectedRevision === 21
      && Object.keys(firstPatch?.parameters || {}).length >= SPATIAL_KEYS.length - 1
      && Object.entries(firstPatch?.parameters || {}).every(([key, value]) => (
        Object.hasOwn(expectedPatch, key) && Object.is(value, expectedPatch[key])
      )),
    onOffDiagnosticsAreIndependent: offOnStarted
      && routeOnOff.playback === 'native-mixer'
      && /已启用|处理中/.test(routeOnOff.upmix)
      && /关闭|旁路|直通/.test(routeOnOff.obr),
    offOnDiagnosticsAreIndependent: onOnStarted
      && routeOffOn.playback === 'native-mixer'
      && /关闭|旁路/.test(routeOffOn.upmix)
      && /已启用|处理中/.test(routeOffOn.obr),
    onOnDiagnosticsShowBothModules: routeOnOn.playback === 'native-mixer'
      && /已启用|处理中/.test(routeOnOn.upmix)
      && !/未启用|关闭|旁路/.test(routeOnOn.upmix)
      && /已启用|处理中/.test(routeOnOn.obr)
      && !/未启用|关闭|旁路/.test(routeOnOn.obr),
    fourStatesKeepOneMixerRevisionResource: mutations[1]?.expectedRevision === 22
      && mutations[1]?.parameters?.upmixEnabled === false
      && mutations[1]?.parameters?.obrEnabled === true
      && mutations[2]?.expectedRevision === 23
      && mutations[2]?.parameters?.upmixEnabled === true,
    nativeActivationReceivesCompleteFrozenParameters: ensureNativeChainCalls.length >= 4
      && ensureNativeChainCalls.some((call) => call.payload?.reason === 'migration')
      && ensureNativeChainCalls.every((call) => (
        call?.parametersFrozen === true
        && call.payload?.enabled === true
        && Number.isSafeInteger(call.payload.revision)
        && call.payload.parameters
        && typeof call.payload.parameters === 'object'
        && typeof call.payload.parameters.enabled === 'boolean'
        && typeof call.payload.parameters.upmixEnabled === 'boolean'
        && ['5.1', '7.1'].includes(call.payload.parameters.upmixOutputLayout)
        && ['passive', 'matrix-decode', 'ambient-extract', 'music-detail'].includes(call.payload.parameters.upmixAlgorithm)
        && typeof call.payload.parameters.obrEnabled === 'boolean'
        && ['direct', 'ambient', 'reverberant'].includes(call.payload.parameters.obrFilterProfile)
      )),
    spatialConflictRefreshesLatestState: conflictStarted
      && mutations[3]?.expectedRevision === 24
      && mixerGets > getsBeforeConflict
      && Number(afterConflict.width) === 1.08
      && /25/.test(afterConflict.revision)
      && /冲突|刷新/.test(afterConflict.status),
    consoleClean: browserErrors.length === 0,
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    checks,
    initial,
    interaction,
    mutations,
    routes: { routeOnOff, routeOffOn, routeOnOn },
    ensureNativeChainCalls,
    afterConflict,
    browserErrors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(500);
  const resolved = path.resolve(profile);
  if (resolved.startsWith(path.resolve(tempRoot) + path.sep)) {
    try {
      rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    } catch {
      // Edge can retain transient profile handles after taskkill on Windows.
      // Cleanup failure is not an audio/UI contract failure.
    }
  }
}
