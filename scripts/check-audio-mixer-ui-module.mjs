import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'web', 'audio-mixer-ui.js'), 'utf8');

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  add(...tokens) {
    const values = new Set(this.element.className.split(/\s+/).filter(Boolean));
    tokens.forEach((token) => values.add(token));
    this.element.className = [...values].join(' ');
  }

  remove(...tokens) {
    const removed = new Set(tokens);
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((token) => token && !removed.has(token))
      .join(' ');
  }

  toggle(token, force) {
    const contains = this.contains(token);
    const enabled = force === undefined ? !contains : !!force;
    if (enabled) this.add(token);
    else this.remove(token);
    return enabled;
  }

  contains(token) {
    return this.element.className.split(/\s+/).includes(token);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.id = '';
    this.type = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.tabIndex = 0;
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node) {
    if (node.parentElement) {
      const index = node.parentElement.children.indexOf(node);
      if (index >= 0) node.parentElement.children.splice(index, 1);
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children.length = 0;
    this.textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name === 'type') this.type = text;
    if (name === 'tabindex') this.tabIndex = Number(text);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }

  getAttribute(name) {
    if (name === 'id' && this.id) return this.id;
    if (name === 'class' && this.className) return this.className;
    if (name === 'type' && this.type) return this.type;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    event.defaultPrevented = false;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function findByDataset(node, key, value) {
  return descendants(node).find((element) => (
    Object.hasOwn(element.dataset, key)
    && (value === undefined || element.dataset[key] === value)
  ));
}

function findAllByDataset(node, key, value) {
  return descendants(node).filter((element) => (
    Object.hasOwn(element.dataset, key)
    && (value === undefined || element.dataset[key] === value)
  ));
}

const cleanParameters = {
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

const presetIdentity = [
  ['clean', '纯净'],
  ['bathroom', '浴室'],
  ['hall', '大厅'],
  ['surround-3d', '3D环绕'],
  ['cinema', '影院'],
  ['vocal-clear', '人声清晰'],
  ['bass-boost', '低频增强'],
  ['night', '夜间']
];

const presets = presetIdentity.map(([id, label], index) => ({
  id,
  label,
  parameters: {
    ...structuredClone(cleanParameters),
    outputGainDb: index === 0 ? 0 : -index / 2
  }
}));

let state = {
  ok: true,
  version: 1,
  presetVersion: 1,
  revision: 12,
  selectedPreset: 'clean',
  configState: 'ready',
  parameters: structuredClone(cleanParameters),
  nativeBackendAvailable: true,
  nativeChainActive: true,
  mixerAvailable: true,
  mixerActive: false,
  mixerEnabled: true,
  mixerFailureDisabled: true,
  bypassReason: 'process-failure-disabled',
  lastResult: -7,
  processCalls: 91,
  bypassedBlocks: 4,
  processFailures: 3,
  consecutiveFailures: 3,
  partialFailureBypasses: 1,
  activeRevision: 11,
  stagedRevision: 12,
  upmix: { enabled: false, processCalls: 91, fallbackBlocks: 2, active: false, lastResult: 0 },
  obr: { enabled: false, processCalls: 91, rendererReady: false, lastResult: 0 },
  order: { upmix: 1, mixer: 2, obr: 3 },
  playbackState: 'native-mixer-bypassed'
};

const requests = [];
let patchAttempt = 0;

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(body);
    }
  };
}

async function fakeFetch(url, options = {}) {
  const method = options.method || 'GET';
  const parsedBody = options.body ? JSON.parse(options.body) : null;
  requests.push({ url: String(url), method, body: parsedBody, headers: options.headers || {} });
  if (url === '/api/audio/mixer' && method === 'GET') return response(200, state);
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (String(url).endsWith('/presets/hall/apply') && method === 'POST') {
    assert.equal(parsedBody.expectedRevision, state.revision);
    state = {
      ...state,
      revision: state.revision + 1,
      selectedPreset: 'hall',
      parameters: structuredClone(presets.find((item) => item.id === 'hall').parameters)
    };
    return response(200, state);
  }
  if (url === '/api/audio/mixer' && method === 'PATCH') {
    patchAttempt += 1;
    if (patchAttempt === 2) {
      state = {
        ...state,
        revision: state.revision + 1,
        selectedPreset: 'custom',
        playbackState: 'browser-compatible',
        nativeBackendAvailable: false,
        nativeChainActive: false,
        mixerAvailable: false,
        parameters: { ...state.parameters, outputGainDb: -6 }
      };
      return response(409, {
        ok: false,
        errorCode: 'audio_mixer_revision_conflict',
        currentRevision: state.revision
      });
    }
    if (parsedBody.expectedRevision !== state.revision) {
      return response(409, {
        ok: false,
        errorCode: 'audio_mixer_revision_conflict',
        currentRevision: state.revision
      });
    }
    state = {
      ...state,
      revision: state.revision + (Object.keys(parsedBody.parameters).length ? 1 : 0),
      selectedPreset: Object.keys(parsedBody.parameters).length ? 'custom' : state.selectedPreset,
      parameters: { ...state.parameters, ...structuredClone(parsedBody.parameters) }
    };
    return response(200, state);
  }
  return response(404, { ok: false, error: 'not found' });
}

const document = new FakeDocument();
const window = {
  document,
  Element: FakeElement,
  fetch: fakeFetch,
  setTimeout,
  clearTimeout,
  console
};
window.window = window;

vm.runInNewContext(source, window, { filename: 'web/audio-mixer-ui.js' });
assert.equal(typeof window.FeAudioMixerUi?.mount, 'function');

const container = document.createElement('section');
document.body.append(container);
const controller = window.FeAudioMixerUi.mount(container);
await controller.ready;

const ui = findByDataset(container, 'audioMixerUi');
assert.ok(ui, 'mount should generate the mixer root');
assert.equal(ui.dataset.mixerReady, 'true');
assert.equal(ui.dataset.selectedPreset, 'clean');
assert.equal(findAllByDataset(ui, 'mixerPresetId').length, 8);
assert.equal(findAllByDataset(ui, 'mixerFamily').length, 8);
assert.equal(findAllByDataset(ui, 'mixerEqIndex').length, 10);
assert.equal(findAllByDataset(ui, 'mixerParam').length, 50);
assert.match(findByDataset(ui, 'mixerPlaybackState').textContent, /旁路|未生效/);
assert.ok(findByDataset(ui, 'mixerDiagnostic', 'upmix').textContent);
assert.ok(findByDataset(ui, 'mixerDiagnostic', 'obr').textContent);
assert.match(findByDataset(ui, 'mixerDiagnostic', 'upmix').textContent, /处理 91 块.*回退 2 块/);
assert.match(findByDataset(ui, 'mixerDiagnostic', 'obr').textContent, /关闭.*处理 91 块/);

findByDataset(ui, 'mixerPresetId', 'hall').click();
await controller.settled();
assert.equal(ui.dataset.selectedPreset, 'hall');
assert.equal(controller.snapshot().revision, 13);

const inputGain = findByDataset(ui, 'mixerParam', 'inputGainDb');
const balance = findByDataset(ui, 'mixerParam', 'balance');
inputGain.value = '1.5';
inputGain.dispatchEvent({ type: 'input' });
inputGain.value = '2';
inputGain.dispatchEvent({ type: 'input' });
balance.value = '-0.25';
balance.dispatchEvent({ type: 'input' });
assert.equal(ui.dataset.selectedPreset, 'custom');
await new Promise((resolve) => setTimeout(resolve, 220));
await controller.settled();

const firstPatch = requests.filter((entry) => entry.method === 'PATCH')[0];
assert.deepEqual(Object.keys(firstPatch.body).sort(), ['expectedRevision', 'parameters']);
assert.equal(firstPatch.body.expectedRevision, 13);
assert.deepEqual(Object.keys(firstPatch.body.parameters).sort(), ['balance', 'inputGainDb']);
assert.equal(firstPatch.body.parameters.inputGainDb, 2);
assert.equal(controller.snapshot().revision, 14);

const outputGain = findByDataset(ui, 'mixerParam', 'outputGainDb');
outputGain.value = '-1';
outputGain.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
await controller.settled();
assert.equal(controller.snapshot().revision, 15);
assert.equal(Number(outputGain.value), -6);
assert.match(findByDataset(ui, 'mixerStatus').textContent, /冲突|刷新|更新/);
assert.equal(findByDataset(ui, 'mixerPlaybackState').dataset.playbackState, 'browser-compatible');
assert.match(findByDataset(ui, 'mixerPlaybackState').textContent, /兼容播放/);

findByDataset(ui, 'mixerRetry').click();
await controller.settled();
const lastPatch = requests.filter((entry) => entry.method === 'PATCH').at(-1);
assert.deepEqual(lastPatch.body, { expectedRevision: 15, parameters: {} });

const allowed = new Set([
  'enabled', 'inputGainDb', 'outputGainDb', 'balance', 'eqDb', 'stereoWidth',
  'centerGain', 'surroundGain', 'lfeGain', 'compressorEnabled',
  'compressorThresholdDb', 'compressorRatio', 'compressorAttackMs',
  'compressorReleaseMs', 'compressorKneeDb', 'compressorMakeupDb',
  'limiterEnabled', 'limiterCeilingDb', 'limiterReleaseMs', 'reverbEnabled',
  'reverbRoomSize', 'reverbDecayMs', 'reverbDamping', 'reverbPreDelayMs',
  'reverbWet', 'reverbDry', 'upmixEnabled', 'upmixAlgorithm',
  'upmixOutputLayout', 'upmixCenterWidthHz', 'upmixLfeCrossoverHz',
  'upmixCenterGain', 'upmixSurroundGain', 'upmixLfeGain', 'upmixDecorrelation',
  'obrEnabled', 'obrFilterProfile', 'obrWet', 'obrDry', 'obrOutputGainDb',
  'obrSpatialWidth'
]);
for (const request of requests.filter((entry) => ['PATCH', 'POST'].includes(entry.method))) {
  assert.equal(/(?:token|secret|password|authorization|path|buffer|module|\.dll)/i.test(JSON.stringify(request.body)), false);
  if (request.method === 'PATCH') {
    assert.ok(Object.keys(request.body.parameters).every((key) => allowed.has(key)));
  } else {
    assert.deepEqual(Object.keys(request.body), ['expectedRevision']);
  }
}

controller.destroy();
assert.equal(findByDataset(container, 'audioMixerUi'), undefined);

window.fetch = async () => response(500, {
  ok: false,
  error: 'C:\\private\\native\\mixer.dll must never be rendered'
});
const errorContainer = document.createElement('section');
document.body.append(errorContainer);
const errorController = window.FeAudioMixerUi.mount(errorContainer);
await errorController.ready;
const errorUi = findByDataset(errorContainer, 'audioMixerUi');
assert.ok(errorUi, 'a failed load should remain visibly inspectable');
assert.equal(errorUi.dataset.mixerReady, 'error');
assert.equal(findByDataset(errorUi, 'mixerStatus').dataset.tone, 'error');
assert.match(findByDataset(errorUi, 'mixerStatus').textContent, /失败|不可用/);
assert.equal(/private|mixer\.dll/i.test(findByDataset(errorUi, 'mixerStatus').textContent), false);
assert.equal(
  await errorController.refresh(),
  false,
  'refresh must report failure when both recovery endpoints return no usable state'
);
await errorController.settled();
errorController.destroy();

let recoveryStateGets = 0;
let recoveryPresetGets = 0;
const recoveryState = {
  ...state,
  revision: 20,
  selectedPreset: 'clean',
  parameters: structuredClone(cleanParameters),
  playbackState: 'native-mixer'
};
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url === '/api/audio/mixer' && method === 'GET') {
    recoveryStateGets += 1;
    if (recoveryStateGets === 1) return response(503, { ok: false, error: 'starting' });
    return response(200, recoveryState);
  }
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    recoveryPresetGets += 1;
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  return response(404, { ok: false });
};
const recoveryContainer = document.createElement('section');
document.body.append(recoveryContainer);
const recoveryController = window.FeAudioMixerUi.mount(recoveryContainer);
await recoveryController.ready;
const recoveryUi = findByDataset(recoveryContainer, 'audioMixerUi');
const recoveryRetry = findByDataset(recoveryUi, 'mixerRetry');
assert.equal(recoveryController.snapshot().ready, 'error');
assert.equal(recoveryRetry.disabled, false, 'initial connection errors must leave a usable reconnect action');
recoveryRetry.click();
await recoveryController.settled();
assert.equal(recoveryStateGets, 2);
assert.equal(recoveryPresetGets, 2, 'recovery must revalidate state and the complete preset catalog together');
assert.equal(recoveryController.snapshot().ready, 'ready');
assert.equal(recoveryUi.dataset.mixerReady, 'true');
assert.equal(findByDataset(recoveryUi, 'mixerParam', 'inputGainDb').disabled, false);
assert.equal(findByDataset(recoveryUi, 'mixerPresetId', 'clean').disabled, false);
assert.match(recoveryController.snapshot().status, /连接|已刷新|原生音频链/);
recoveryController.destroy();

let refreshStateGets = 0;
let refreshPresetGets = 0;
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  if (url === '/api/audio/mixer' && method === 'GET') {
    refreshStateGets += 1;
    if (refreshStateGets === 1) return response(503, { ok: false, error: 'starting' });
    return response(200, { ...recoveryState, revision: 21 });
  }
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    refreshPresetGets += 1;
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  return response(404, { ok: false });
};
const refreshContainer = document.createElement('section');
document.body.append(refreshContainer);
const refreshController = window.FeAudioMixerUi.mount(refreshContainer);
await refreshController.ready;
assert.equal(refreshController.snapshot().ready, 'error');
await refreshController.refresh();
await refreshController.settled();
assert.equal(refreshStateGets, 2);
assert.equal(refreshPresetGets, 2);
assert.equal(refreshController.snapshot().ready, 'ready');
assert.doesNotMatch(refreshController.snapshot().status, /失败|不可用/);
refreshController.destroy();

let queuedState = {
  ...state,
  revision: 30,
  selectedPreset: 'clean',
  parameters: structuredClone(cleanParameters),
  playbackState: 'native-mixer'
};
let queuedPatchAttempt = 0;
let notifyFirstPatchStarted;
let releaseFirstPatch;
const firstPatchStarted = new Promise((resolve) => { notifyFirstPatchStarted = resolve; });
const firstPatchGate = new Promise((resolve) => { releaseFirstPatch = resolve; });
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const parsedBody = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/audio/mixer' && method === 'GET') return response(200, queuedState);
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (url === '/api/audio/mixer' && method === 'PATCH') {
    queuedPatchAttempt += 1;
    if (queuedPatchAttempt === 1) {
      notifyFirstPatchStarted();
      await firstPatchGate;
      return response(500, { ok: false, error: 'transient mixer write failure' });
    }
    assert.equal(parsedBody.expectedRevision, queuedState.revision);
    queuedState = {
      ...queuedState,
      revision: queuedState.revision + (Object.keys(parsedBody.parameters).length ? 1 : 0),
      selectedPreset: 'custom',
      parameters: { ...queuedState.parameters, ...structuredClone(parsedBody.parameters) }
    };
    return response(200, queuedState);
  }
  return response(404, { ok: false });
};
const queuedContainer = document.createElement('section');
document.body.append(queuedContainer);
const queuedController = window.FeAudioMixerUi.mount(queuedContainer);
await queuedController.ready;
const queuedUi = findByDataset(queuedContainer, 'audioMixerUi');
const queuedInputGain = findByDataset(queuedUi, 'mixerParam', 'inputGainDb');
const queuedBalance = findByDataset(queuedUi, 'mixerParam', 'balance');
queuedInputGain.value = '2';
queuedInputGain.dispatchEvent({ type: 'input' });
await firstPatchStarted;
queuedBalance.value = '-0.25';
queuedBalance.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
releaseFirstPatch();
await queuedController.settled();
assert.equal(queuedState.parameters.inputGainDb, 2, 'a failed dirty value must be resubmitted after a later queued success');
assert.equal(queuedState.parameters.balance, -0.25);
assert.deepEqual([...queuedController.snapshot().pendingKeys], [], 'all visible values must be acknowledged before success');
assert.match(queuedController.snapshot().status, /保存|更新/);
assert.doesNotMatch(queuedController.snapshot().status, /失败|未保存|重试/);
queuedController.destroy();

let eqRetryState = {
  ...state,
  revision: 35,
  selectedPreset: 'clean',
  parameters: structuredClone(cleanParameters),
  playbackState: 'native-mixer'
};
let eqRetryAttempt = 0;
const eqRetryBodies = [];
let notifyEqPatchStarted;
let releaseEqPatch;
const eqPatchStarted = new Promise((resolve) => { notifyEqPatchStarted = resolve; });
const eqPatchGate = new Promise((resolve) => { releaseEqPatch = resolve; });
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const parsedBody = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/audio/mixer' && method === 'GET') return response(200, eqRetryState);
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (url === '/api/audio/mixer' && method === 'PATCH') {
    eqRetryAttempt += 1;
    eqRetryBodies.push(structuredClone(parsedBody));
    if (eqRetryAttempt === 1) {
      notifyEqPatchStarted();
      await eqPatchGate;
      return response(500, { ok: false, error: 'transient EQ write failure' });
    }
    assert.equal(parsedBody.expectedRevision, eqRetryState.revision);
    eqRetryState = {
      ...eqRetryState,
      revision: eqRetryState.revision + 1,
      selectedPreset: 'custom',
      parameters: { ...eqRetryState.parameters, ...structuredClone(parsedBody.parameters) }
    };
    return response(200, eqRetryState);
  }
  return response(404, { ok: false });
};
const eqRetryContainer = document.createElement('section');
document.body.append(eqRetryContainer);
const eqRetryController = window.FeAudioMixerUi.mount(eqRetryContainer);
await eqRetryController.ready;
const eqRetryUi = findByDataset(eqRetryContainer, 'audioMixerUi');
const firstEqBand = findAllByDataset(eqRetryUi, 'mixerEqIndex')
  .find((control) => control.dataset.mixerEqIndex === '0');
assert.ok(firstEqBand, 'the EQ retry race requires the first EQ band');
firstEqBand.value = '1';
firstEqBand.dispatchEvent({ type: 'input' });
await eqPatchStarted;
firstEqBand.value = '4';
firstEqBand.dispatchEvent({ type: 'input' });
releaseEqPatch();
await eqRetryController.settled();
assert.equal(eqRetryBodies.length, 2, 'one transient EQ failure should produce one bounded retry');
assert.equal(
  eqRetryBodies[1].parameters.eqDb[0],
  4,
  'an in-flight failed EQ patch must not overwrite the newer pending EQ value'
);
assert.equal(eqRetryState.parameters.eqDb[0], 4, 'the retry must persist the latest visible EQ value');
eqRetryController.destroy();

let activationState = {
  ...state,
  revision: 40,
  selectedPreset: 'clean',
  parameters: structuredClone(cleanParameters),
  nativeBackendAvailable: true,
  nativeChainActive: false,
  mixerAvailable: false,
  mixerActive: false,
  mixerFailureDisabled: false,
  bypassReason: 'pipeline-inactive',
  processCalls: 0,
  upmix: { available: true, processCalls: 0, fallbackBlocks: 0, active: false, lastResult: 0 },
  obr: { available: true, processCalls: 0, rendererReady: false, lastResult: 0 },
  playbackState: 'native-mixer-bypassed'
};
let activationCalls = 0;
let activationStateGets = 0;
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const parsedBody = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/audio/mixer' && method === 'GET') {
    activationStateGets += 1;
    return response(200, activationState);
  }
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (String(url).endsWith('/presets/hall/apply') && method === 'POST') {
    assert.equal(parsedBody.expectedRevision, activationState.revision);
    activationState = {
      ...activationState,
      revision: activationState.revision + 1,
      selectedPreset: 'hall',
      parameters: structuredClone(presets.find((item) => item.id === 'hall').parameters)
    };
    return response(200, activationState);
  }
  return response(404, { ok: false });
};
const activationContainer = document.createElement('section');
document.body.append(activationContainer);
const activationController = window.FeAudioMixerUi.mount(activationContainer, {
  async ensureNativeChain(context) {
    activationCalls += 1;
    assert.deepEqual(Object.keys(context).sort(), [
      'enabled', 'parameters', 'reason', 'revision', 'spatialMigrationNeeded'
    ]);
    assert.equal(context.enabled, true);
    assert.equal(context.reason, 'preset');
    assert.equal(Object.isFrozen(context.parameters), true);
    assert.equal(context.parameters.upmixAlgorithm, 'matrix-decode');
    assert.equal(context.parameters.obrFilterProfile, 'direct');
    activationState = {
      ...activationState,
      nativeChainActive: true,
      mixerAvailable: true,
      mixerActive: true,
      bypassReason: 'none',
      upmix: { ...activationState.upmix, active: true },
      obr: { ...activationState.obr, rendererReady: true },
      order: { upmix: 1, mixer: 2, obr: 3 },
      playbackState: 'native-mixer'
    };
    return true;
  }
});
await activationController.ready;
assert.equal(activationCalls, 0, 'opening the mixer page must not silently change the audio route');
const activationUi = findByDataset(activationContainer, 'audioMixerUi');
assert.match(findByDataset(activationUi, 'mixerDiagnostic', 'upmix').textContent, /关闭/);
assert.match(findByDataset(activationUi, 'mixerDiagnostic', 'obr').textContent, /关闭|干声直通/);
findByDataset(activationUi, 'mixerPresetId', 'hall').click();
await activationController.settled();
assert.equal(activationCalls, 1, 'an explicit effect preset must activate the native audio chain');
assert.ok(activationStateGets >= 2, 'the UI must refresh diagnostics after native-chain activation');
assert.equal(activationController.snapshot().playbackState, 'native-mixer');
assert.match(activationController.snapshot().status, /生效|原生音频链/);
activationController.destroy();

let failedActivationState = {
  ...activationState,
  revision: 50,
  selectedPreset: 'clean',
  nativeChainActive: false,
  mixerAvailable: false,
  mixerActive: false,
  bypassReason: 'pipeline-inactive',
  upmix: { ...activationState.upmix, active: false },
  obr: { ...activationState.obr, rendererReady: false },
  playbackState: 'native-mixer-bypassed'
};
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const parsedBody = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/audio/mixer' && method === 'GET') return response(200, failedActivationState);
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (url === '/api/audio/mixer' && method === 'PATCH') {
    failedActivationState = {
      ...failedActivationState,
      revision: failedActivationState.revision + 1,
      selectedPreset: 'custom',
      parameters: { ...failedActivationState.parameters, ...structuredClone(parsedBody.parameters) }
    };
    return response(200, failedActivationState);
  }
  return response(404, { ok: false });
};
const failedActivationContainer = document.createElement('section');
document.body.append(failedActivationContainer);
const failedActivationController = window.FeAudioMixerUi.mount(failedActivationContainer, {
  async ensureNativeChain() {
    throw new Error('C:\\private\\native\\obr.dll');
  }
});
await failedActivationController.ready;
const failedActivationUi = findByDataset(failedActivationContainer, 'audioMixerUi');
const failedActivationGain = findByDataset(failedActivationUi, 'mixerParam', 'inputGainDb');
failedActivationGain.value = '1';
failedActivationGain.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
await failedActivationController.settled();
assert.match(failedActivationController.snapshot().status, /已保存.*未能启动|未生效/);
assert.doesNotMatch(failedActivationController.snapshot().status, /private|obr\.dll/i);
assert.notEqual(failedActivationController.snapshot().status, '调音设置已保存。');
failedActivationController.destroy();

let selectedChannelLayout = '5.1';
const channelChanges = [];
const channelContainer = document.createElement('section');
document.body.append(channelContainer);
const channelController = window.FeAudioMixerUi.mount(channelContainer, {
  getNativeChannelLayout() {
    return selectedChannelLayout;
  },
  async setNativeChannelLayout(value) {
    channelChanges.push(value);
    selectedChannelLayout = value;
    return true;
  }
});
await channelController.ready;
const channelUi = findByDataset(channelContainer, 'audioMixerUi');
const channelSelect = findByDataset(channelUi, 'mixerChannelLayout');
assert.ok(channelSelect, 'the mixer must expose a native 5.1/7.1 channel selector');
assert.equal(channelSelect.value, '5.1');
assert.deepEqual(channelSelect.children.map((option) => option.value), ['5.1', '7.1']);
channelSelect.value = '7.1';
channelSelect.dispatchEvent({ type: 'change' });
await channelController.settled();
assert.deepEqual(channelChanges, ['7.1']);
assert.equal(channelController.snapshot().channelLayout, '7.1');
channelController.destroy();

let channelRouterState = {
  revision: 7,
  layout: '5.1',
  algorithm: 'matrix-decode',
  lfeCrossoverHz: 120,
  channelOrder: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  channelGainDb: [0, -0.5, -1, -3, -2, -2.5, 0, 0],
  channelDelayMs: [0, 0, 1.5, 0, 8, 8, 0, 0],
  channelAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  customMatrix: [
    1, 0, 0, 1, 0.707, 0.707, 0.5, 0.5,
    0.25, -0.25, -0.25, 0.25, 0, 0, 0, 0
  ],
  available: true,
  actual: true,
  active: true,
  processCalls: 321,
  channelPeak: [0.4, 0.31, 0.25, 0.12, 0.2, 0.18, 0, 0],
  channelRms: [0.2, 0.16, 0.12, 0.06, 0.1, 0.09, 0, 0],
  channelTelemetryAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  physicalMultichannel: false
};
const channelRouterRequests = [];
let failNextChannelLayoutPatch = false;
let failNextMainLayoutPatch = false;
let gateOverlappingChannelPatches = false;
let notifyOverlappingLayoutPatchStarted = null;
let notifyOverlappingLayoutPatchCompleted = null;
let notifyOverlappingEditPatchStarted = null;
let overlappingLayoutPatchGate = Promise.resolve();
let overlappingEditPatchGate = Promise.resolve();
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/audio/mixer' && method === 'GET') {
    channelRouterRequests.push({ url, method, body });
    return response(200, state);
  }
  if (url === '/api/audio/mixer' && method === 'PATCH') {
    channelRouterRequests.push({ url, method, body });
    if (failNextMainLayoutPatch && Object.hasOwn(body?.parameters || {}, 'upmixOutputLayout')) {
      failNextMainLayoutPatch = false;
      return response(500, { ok: false, error: 'main layout commit failed' });
    }
    assert.equal(body.expectedRevision, state.revision);
    state = {
      ...state,
      revision: state.revision + 1,
      selectedPreset: 'custom',
      parameters: { ...state.parameters, ...structuredClone(body.parameters) }
    };
    return response(200, state);
  }
  if (url === '/api/audio/mixer/presets' && method === 'GET') {
    return response(200, { ok: true, presetVersion: 1, presets });
  }
  if (url === '/api/audio/mixer/channels' && method === 'GET') {
    channelRouterRequests.push({ url, method, body });
    return response(200, channelRouterState);
  }
  if (url === '/api/audio/mixer/channels' && method === 'PATCH') {
    channelRouterRequests.push({ url, method, body });
    if (failNextChannelLayoutPatch && body?.parameters?.layout) {
      failNextChannelLayoutPatch = false;
      return response(500, { ok: false, error: 'channel layout commit failed' });
    }
    assert.deepEqual(Object.keys(body).sort(), ['expectedRevision', 'parameters']);
    const parameters = body.parameters;
    if (gateOverlappingChannelPatches && parameters.layout) {
      notifyOverlappingLayoutPatchStarted?.();
      await overlappingLayoutPatchGate;
    } else if (gateOverlappingChannelPatches && Array.isArray(parameters.channelGainDb)) {
      notifyOverlappingEditPatchStarted?.();
      await overlappingEditPatchGate;
    }
    if (body.expectedRevision !== channelRouterState.revision) {
      return response(409, {
        ok: false,
        errorCode: 'audio_mixer_channel_revision_conflict',
        currentRevision: channelRouterState.revision
      });
    }
    const nextLayout = parameters.layout || channelRouterState.layout;
    const nextOrder = nextLayout === '7.1'
      ? ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
      : ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'];
    channelRouterState = {
      ...channelRouterState,
      ...structuredClone(parameters),
      revision: channelRouterState.revision + 1,
      channelOrder: nextOrder,
      channelTelemetryAzimuthDeg: parameters.channelAzimuthDeg
        ? [...parameters.channelAzimuthDeg]
        : channelRouterState.channelTelemetryAzimuthDeg
    };
    if (gateOverlappingChannelPatches && parameters.layout) {
      notifyOverlappingLayoutPatchCompleted?.();
    }
    return response(200, channelRouterState);
  }
  if (url === '/api/audio/mixer/channels/test' && method === 'POST') {
    channelRouterRequests.push({ url, method, body });
    return response(200, {
      ok: true,
      accepted: true,
      layout: body.layout,
      channel: body.channel,
      kind: body.kind,
      durationMs: body.durationMs,
      frequencyHz: body.frequencyHz,
      gainDb: body.gainDb
    });
  }
  return response(404, { ok: false });
};

const stateBeforeLayoutMismatch = structuredClone(state);
state = {
  ...state,
  parameters: {
    ...state.parameters,
    upmixEnabled: true,
    upmixOutputLayout: '7.1'
  }
};
const mismatchContainer = document.createElement('section');
document.body.append(mismatchContainer);
const mismatchController = window.FeAudioMixerUi.mount(mismatchContainer);
await mismatchController.ready;
assert.equal(
  findByDataset(findByDataset(mismatchContainer, 'mixerChannelPanel'), 'mixerChannelRouterLayout').value,
  '7.1',
  'the main mixer effective layout must win when the channel-router snapshot is stale'
);
mismatchController.destroy();
state = stateBeforeLayoutMismatch;
channelRouterRequests.length = 0;

const stateBeforeOverlap = structuredClone(state);
const channelRouterStateBeforeOverlap = structuredClone(channelRouterState);
let releaseOverlappingLayoutPatch;
let releaseOverlappingEditPatch;
const overlappingLayoutPatchStarted = new Promise((resolve) => {
  notifyOverlappingLayoutPatchStarted = resolve;
});
const overlappingLayoutPatchCompleted = new Promise((resolve) => {
  notifyOverlappingLayoutPatchCompleted = resolve;
});
const overlappingEditPatchStarted = new Promise((resolve) => {
  notifyOverlappingEditPatchStarted = resolve;
});
overlappingLayoutPatchGate = new Promise((resolve) => {
  releaseOverlappingLayoutPatch = resolve;
});
overlappingEditPatchGate = new Promise((resolve) => {
  releaseOverlappingEditPatch = resolve;
});
gateOverlappingChannelPatches = true;

const overlapContainer = document.createElement('section');
document.body.append(overlapContainer);
const overlapController = window.FeAudioMixerUi.mount(overlapContainer);
await overlapController.ready;
const overlapPanel = findByDataset(findByDataset(overlapContainer, 'audioMixerUi'), 'mixerChannelPanel');
const overlapLayout = findByDataset(overlapPanel, 'mixerChannelRouterLayout');
overlapLayout.value = '7.1';
overlapLayout.dispatchEvent({ type: 'change' });
await overlappingLayoutPatchStarted;

const overlapFrontLeftGain = findByDataset(
  findByDataset(overlapPanel, 'mixerChannelStrip', 'FL'),
  'mixerChannelNumber',
  'gainDb'
);
overlapFrontLeftGain.value = '-4.25';
overlapFrontLeftGain.dispatchEvent({ type: 'input' });
const editStartedBeforeLayoutCompleted = await Promise.race([
  overlappingEditPatchStarted.then(() => true),
  new Promise((resolve) => setTimeout(() => resolve(false), 260))
]);

releaseOverlappingLayoutPatch();
await overlappingLayoutPatchCompleted;
releaseOverlappingEditPatch();
await overlapController.settled();

assert.equal(
  editStartedBeforeLayoutCompleted,
  false,
  'layout and per-channel writes must share one queue instead of issuing the same expectedRevision concurrently'
);
assert.equal(
  channelRouterState.channelGainDb[0],
  -4.25,
  'a per-channel edit made while layout switching must survive the layout commit'
);
const overlappingChannelWrites = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels' && entry.method === 'PATCH'
));
assert.deepEqual(
  overlappingChannelWrites.map((entry) => entry.body.expectedRevision),
  [channelRouterStateBeforeOverlap.revision, channelRouterStateBeforeOverlap.revision + 1],
  'serialized channel writes must advance expectedRevision for the second mutation'
);

overlapController.destroy();
gateOverlappingChannelPatches = false;
notifyOverlappingLayoutPatchStarted = null;
notifyOverlappingLayoutPatchCompleted = null;
notifyOverlappingEditPatchStarted = null;
state = stateBeforeOverlap;
channelRouterState = channelRouterStateBeforeOverlap;
channelRouterRequests.length = 0;

const channelRouterContainer = document.createElement('section');
document.body.append(channelRouterContainer);
const channelRouterController = window.FeAudioMixerUi.mount(channelRouterContainer);
await channelRouterController.ready;
const channelRouterUi = findByDataset(channelRouterContainer, 'audioMixerUi');
const channelPanel = findByDataset(channelRouterUi, 'mixerChannelPanel');
assert.ok(channelPanel, 'the mixer must render an independent per-channel router panel');
assert.equal(
  channelRouterRequests.filter((entry) => entry.url === '/api/audio/mixer/channels' && entry.method === 'GET').length,
  1,
  'the independent channel snapshot must load once with the mixer'
);
assert.deepEqual(
  findAllByDataset(channelPanel, 'mixerChannelStrip').map((strip) => strip.dataset.mixerChannelStrip),
  ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  '5.1 must expose side surrounds and must not treat back channels as active'
);
for (const strip of findAllByDataset(channelPanel, 'mixerChannelStrip')) {
  assert.ok(findByDataset(strip, 'mixerChannelRange', 'gainDb'));
  assert.ok(findByDataset(strip, 'mixerChannelNumber', 'gainDb'));
  assert.ok(findByDataset(strip, 'mixerChannelRange', 'delayMs'));
  assert.ok(findByDataset(strip, 'mixerChannelNumber', 'delayMs'));
  assert.ok(findByDataset(strip, 'mixerChannelRange', 'azimuthDeg'));
  assert.ok(findByDataset(strip, 'mixerChannelNumber', 'azimuthDeg'));
  assert.ok(findByDataset(strip, 'mixerChannelTest'));
}

const channelAlgorithm = findByDataset(channelPanel, 'mixerChannelAlgorithm');
assert.deepEqual(
  channelAlgorithm.children.map((option) => ({ value: option.value, disabled: option.disabled })),
  [
    { value: 'front-only', disabled: false },
    { value: 'matrix-decode', disabled: false },
    { value: 'ambient-extract', disabled: false },
    { value: 'custom-matrix', disabled: false },
    { value: 'passive', disabled: true },
    { value: 'dolby-pro-logic-iix', disabled: true },
    { value: 'dts-neural-x', disabled: true }
  ],
  'only native, non-proprietary algorithms may be selectable'
);
assert.equal(findAllByDataset(channelPanel, 'mixerChannelMatrixCell').length, 16);
assert.ok(findByDataset(channelPanel, 'mixerChannelLfeCrossover'));
assert.match(findByDataset(channelPanel, 'mixerChannelPhysicalOutput').textContent, /双声道|耳机/);
assert.doesNotMatch(findByDataset(channelPanel, 'mixerChannelPhysicalOutput').textContent, /物理.*(?:5\.1|7\.1)/);

const routerLayout = findByDataset(channelPanel, 'mixerChannelRouterLayout');
assert.deepEqual(routerLayout.children.map((option) => option.value), ['stereo', '5.1', '7.1']);
assert.equal(routerLayout.value, 'stereo', 'effective layout follows the disabled main upmix state');
routerLayout.value = '7.1';
routerLayout.dispatchEvent({ type: 'change' });
await channelRouterController.settled();
assert.deepEqual(
  findAllByDataset(channelPanel, 'mixerChannelStrip').map((strip) => strip.dataset.mixerChannelStrip),
  ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR']
);
const layoutPatch = channelRouterRequests.find((entry) => (
  entry.url === '/api/audio/mixer/channels'
  && entry.method === 'PATCH'
  && entry.body?.parameters?.layout === '7.1'
));
assert.deepEqual(layoutPatch?.body, { expectedRevision: 7, parameters: { layout: '7.1' } });
const effectiveLayoutPatch = channelRouterRequests.find((entry) => (
  entry.url === '/api/audio/mixer'
  && entry.method === 'PATCH'
  && entry.body?.parameters?.upmixOutputLayout === '7.1'
));
assert.deepEqual(effectiveLayoutPatch?.body, {
  expectedRevision: 15,
  parameters: { upmixEnabled: true, upmixOutputLayout: '7.1' }
});
assert.ok(
  channelRouterRequests.indexOf(effectiveLayoutPatch) < channelRouterRequests.indexOf(layoutPatch),
  'the main effective upmix layout must commit before the independent channel-router layout'
);

const mainGetsBeforeFailedLayout = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer' && entry.method === 'GET'
)).length;
const channelGetsBeforeFailedLayout = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels' && entry.method === 'GET'
)).length;
failNextChannelLayoutPatch = true;
routerLayout.value = '5.1';
routerLayout.dispatchEvent({ type: 'change' });
await channelRouterController.settled();
assert.equal(
  routerLayout.value,
  '5.1',
  'after a channel-router failure the selector must report the main mixer layout that actually took effect'
);
assert.ok(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer' && entry.method === 'GET'
  )).length > mainGetsBeforeFailedLayout,
  'a partial layout failure must refresh the main mixer snapshot'
);
assert.ok(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer/channels' && entry.method === 'GET'
  )).length > channelGetsBeforeFailedLayout,
  'a partial layout failure must refresh the channel-router snapshot'
);

const channelPatchesBeforeFailedMain = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels' && entry.method === 'PATCH'
)).length;
failNextMainLayoutPatch = true;
routerLayout.value = '7.1';
routerLayout.dispatchEvent({ type: 'change' });
await new Promise((resolve) => setTimeout(resolve, 260));
await channelRouterController.settled();
assert.equal(
  routerLayout.value,
  '5.1',
  'a failed main layout commit must not be retried out of band and displayed as effective'
);
assert.equal(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer/channels' && entry.method === 'PATCH'
  )).length,
  channelPatchesBeforeFailedMain,
  'the channel-router endpoint must not commit when the main effective layout failed'
);

const backLeftStrip = findByDataset(channelPanel, 'mixerChannelStrip', 'BL');
const backLeftGain = findByDataset(backLeftStrip, 'mixerChannelNumber', 'gainDb');
backLeftGain.value = '-4.5';
backLeftGain.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
await channelRouterController.settled();
const gainPatch = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels'
  && entry.method === 'PATCH'
  && Array.isArray(entry.body?.parameters?.channelGainDb)
)).at(-1);
assert.equal(gainPatch.body.expectedRevision, 8);
assert.equal(gainPatch.body.parameters.channelGainDb.length, 8);
assert.equal(gainPatch.body.parameters.channelGainDb[4], -4.5);

channelAlgorithm.value = 'custom-matrix';
channelAlgorithm.dispatchEvent({ type: 'change' });
await channelRouterController.settled();
const matrixCell = findByDataset(channelPanel, 'mixerChannelMatrixCell', '0');
matrixCell.value = '0.8';
matrixCell.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
await channelRouterController.settled();
const matrixPatch = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels'
  && entry.method === 'PATCH'
  && Array.isArray(entry.body?.parameters?.customMatrix)
)).at(-1);
assert.equal(matrixPatch.body.parameters.customMatrix.length, 16);
assert.equal(matrixPatch.body.parameters.customMatrix[0], 0.8);

findByDataset(findByDataset(channelPanel, 'mixerChannelStrip', 'FL'), 'mixerChannelTest').click();
await channelRouterController.settled();
const testSignalRequest = channelRouterRequests.find((entry) => entry.url === '/api/audio/mixer/channels/test');
assert.deepEqual(testSignalRequest.body, {
  layout: '7.1',
  channel: 'FL',
  kind: 'tone',
  durationMs: 500,
  frequencyHz: 997,
  gainDb: -18
});
assert.match(findByDataset(channelPanel, 'mixerChannelStatus').textContent, /已发送|已接受/);
const channelPatchCountBeforeStereo = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels' && entry.method === 'PATCH'
)).length;
routerLayout.value = 'stereo';
routerLayout.dispatchEvent({ type: 'change' });
await channelRouterController.settled();
const stereoPatch = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer'
  && entry.method === 'PATCH'
  && entry.body?.parameters?.upmixEnabled === false
)).at(-1);
assert.deepEqual(stereoPatch?.body, {
  expectedRevision: 17,
  parameters: { upmixEnabled: false }
});
assert.equal(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer/channels' && entry.method === 'PATCH'
  )).length,
  channelPatchCountBeforeStereo,
  'Stereo bypass must not send an invalid stereo layout to the 5.1/7.1 channel endpoint'
);
assert.equal(routerLayout.value, 'stereo');

channelRouterState = {
  ...channelRouterState,
  configState: 'ready',
  nativeBackendAvailable: true,
  nativeChainActive: false,
  available: false,
  actual: false,
  active: false,
  availability: 'transition-pending',
  effectiveLayout: '5.1',
  layoutPending: true,
  transitionPending: true,
  activeRevision: 10,
  stagedRevision: 11,
  lastResult: -3,
  output: 'energy-matched-stereo-fold-down',
  channelPeak: [],
  channelRms: [],
  channelTelemetryAzimuthDeg: []
};
const mainGetsBeforeNativeRefresh = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer' && entry.method === 'GET'
)).length;
const channelGetsBeforeNativeRefresh = channelRouterRequests.filter((entry) => (
  entry.url === '/api/audio/mixer/channels' && entry.method === 'GET'
)).length;
await channelRouterController.refresh();
await channelRouterController.settled();
assert.ok(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer' && entry.method === 'GET'
  )).length > mainGetsBeforeNativeRefresh,
  'native-chain refresh must re-read the main mixer'
);
assert.ok(
  channelRouterRequests.filter((entry) => (
    entry.url === '/api/audio/mixer/channels' && entry.method === 'GET'
  )).length > channelGetsBeforeNativeRefresh,
  'native-chain refresh must re-read the independent channel router'
);
assert.equal(channelPanel.dataset.state, 'staged');
assert.equal(findByDataset(channelPanel, 'mixerChannelAlgorithm').disabled, false);
assert.equal(findByDataset(channelPanel, 'mixerChannelLfeCrossover').disabled, false);
assert.equal(
  findByDataset(findByDataset(channelPanel, 'mixerChannelStrip', 'FL'), 'mixerChannelNumber', 'gainDb').disabled,
  false,
  'persistable channel controls must stay enabled while audio telemetry is inactive'
);
assert.equal(
  findByDataset(findByDataset(channelPanel, 'mixerChannelStrip', 'FL'), 'mixerChannelTest').disabled,
  true,
  'test signals must remain gated by actual native telemetry/capability'
);
assert.ok(
  findAllByDataset(channelRouterUi, 'testSignalButton').every((button) => button.disabled),
  'the spatial test seam must also stay disabled without an actual native route'
);
assert.match(findByDataset(channelPanel, 'mixerChannelStatus').textContent, /已保存|等待|暂存/);
assert.doesNotMatch(findByDataset(channelPanel, 'mixerChannelStatus').textContent, /已提交到音频线程/);
assert.match(findByDataset(channelPanel, 'mixerChannelPhysicalOutput').textContent, /折叠/);
assert.doesNotMatch(findByDataset(channelPanel, 'mixerChannelPhysicalOutput').textContent, /OBR/);

const stagedGain = findByDataset(
  findByDataset(channelPanel, 'mixerChannelStrip', 'FL'),
  'mixerChannelNumber',
  'gainDb'
);
stagedGain.value = '-1.5';
stagedGain.dispatchEvent({ type: 'input' });
await new Promise((resolve) => setTimeout(resolve, 220));
await channelRouterController.settled();
assert.match(findByDataset(channelPanel, 'mixerChannelStatus').textContent, /已保存|等待|暂存/);
assert.doesNotMatch(
  findByDataset(channelPanel, 'mixerChannelStatus').textContent,
  /已提交到音频线程/,
  'HTTP 200 persistence must not be described as an audio-thread commit while transitionPending'
);
const stagedSnapshot = channelRouterController.snapshot().channelRouter;
assert.equal(stagedSnapshot.transitionPending, true);
assert.equal(stagedSnapshot.layoutPending, true);
assert.equal(stagedSnapshot.lastResult, -3);
assert.equal(stagedSnapshot.availability, 'transition-pending');
assert.equal(stagedSnapshot.output, 'energy-matched-stereo-fold-down');
assert.equal(channelRouterController.snapshot().channelRouter.revision, 12);
assert.equal(channelRouterController.snapshot().channelRouter.physicalMultichannel, false);
channelRouterController.destroy();

console.log(JSON.stringify({
  pass: true,
  requests: requests.map(({ url, method, body }) => ({ url, method, body })),
  finalRevision: state.revision
}, null, 2));
