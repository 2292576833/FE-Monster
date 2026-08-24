import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'web', 'audio-mixer-visuals.js'), 'utf8');
const renderWorkerSource = readFileSync(path.join(root, 'web', 'audio-mixer-render-worker.js'), 'utf8');
const index = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const mixerUiSource = readFileSync(path.join(root, 'web', 'audio-mixer-ui.js'), 'utf8');

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return this.element.className.split(/\s+/u).filter(Boolean); }
  add(...tokens) { this.element.className = [...new Set([...this.values(), ...tokens])].join(' '); }
  remove(...tokens) {
    const removed = new Set(tokens);
    this.element.className = this.values().filter((token) => !removed.has(token)).join(' ');
  }
  toggle(token, force) {
    const enabled = force === undefined ? !this.contains(token) : Boolean(force);
    if (enabled) this.add(token); else this.remove(token);
    return enabled;
  }
  contains(token) { return this.values().includes(token); }
}

class FakeCanvasContext {
  constructor() { this.drawCalls = 0; }
  count() { this.drawCalls += 1; }
  clearRect() { this.count(); }
  fillRect() { this.count(); }
  strokeRect() { this.count(); }
  beginPath() { this.count(); }
  closePath() { this.count(); }
  moveTo() { this.count(); }
  lineTo() { this.count(); }
  arc() { this.count(); }
  stroke() { this.count(); }
  fill() { this.count(); }
  fillText() { this.count(); }
  save() { this.count(); }
  restore() { this.count(); }
  translate() { this.count(); }
  rotate() { this.count(); }
  setTransform() { this.count(); }
  createLinearGradient() { return { addColorStop() {} }; }
  set lineWidth(_) {}
  set strokeStyle(_) {}
  set fillStyle(_) {}
  set font(_) {}
  set textAlign(_) {}
  set textBaseline(_) {}
  set globalAlpha(_) {}
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
    this.style = {};
    this.draggable = false;
    this.width = 640;
    this.height = 240;
    this.clientWidth = 640;
    this.clientHeight = 240;
    this.context = this.tagName === 'CANVAS' ? new FakeCanvasContext() : null;
  }
  append(...nodes) { nodes.forEach((child) => this.appendChild(child)); }
  appendChild(node) {
    if (node.parentElement) {
      const index = node.parentElement.children.indexOf(node);
      if (index >= 0) node.parentElement.children.splice(index, 1);
    }
    node.parentElement = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, before) {
    if (!before || !this.children.includes(before)) return this.appendChild(node);
    if (node.parentElement) {
      const oldIndex = node.parentElement.children.indexOf(node);
      if (oldIndex >= 0) node.parentElement.children.splice(oldIndex, 1);
    }
    node.parentElement = this;
    this.children.splice(this.children.indexOf(before), 0, node);
    return node;
  }
  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name === 'type') this.type = text;
    if (name === 'draggable') this.draggable = text === 'true';
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => {};
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return event.defaultPrevented !== true;
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  getContext() {
    if (this.wasTransferred) throw new Error('canvas-control-transferred');
    return this.context;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

class FakeDocument {
  constructor() { this.body = new FakeElement('body', this); }
  createElement(tagName) { return new FakeElement(tagName, this); }
}

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.setCalls = 0;
  }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) {
    this.setCalls += 1;
    this.map.set(key, String(value));
  }
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

function byDataset(node, key, value) {
  return descendants(node).filter((element) => (
    Object.hasOwn(element.dataset, key)
      && (value === undefined || element.dataset[key] === value)
  ));
}

assert.match(
  index,
  /audio-mixer-visuals\.js[^<]*<\/script>[\s\S]*audio-mixer-ui\.js/u,
  'visuals must load before the mixer UI integration'
);
assert.match(mixerUiSource, /FeAudioMixerVisuals\?\.mount/u, 'the mixer page must mount the professional visuals');
assert.match(mixerUiSource, /visualsController\?\.updateParameters\(localParameters\)/u, 'visual controls must follow persisted mixer parameters');
assert.match(mixerUiSource, /visualsController\?\.destroy\(\)/u, 'destroying the mixer page must release visualization resources');
assert.match(mixerUiSource, /mixerNumericInput/u, 'every range control must expose a synchronized numeric-entry input');

const document = new FakeDocument();
const frameQueue = new Map();
let nextFrame = 1;
const window = {
  document,
  URL,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame(callback) {
    const id = nextFrame++;
    frameQueue.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) { frameQueue.delete(id); },
  setTimeout,
  clearTimeout
};

function flushFrames(startTimestamp = 0, maximum = 32) {
  let timestamp = startTimestamp;
  let count = 0;
  while (frameQueue.size && count < maximum) {
    const [id, callback] = frameQueue.entries().next().value;
    frameQueue.delete(id);
    timestamp += 17;
    callback(timestamp);
    count += 1;
  }
  assert.ok(count < maximum, 'visual rendering must settle within a bounded frame cycle');
  return count;
}
window.window = window;
vm.runInNewContext(source, window, { filename: 'web/audio-mixer-visuals.js' });

assert.ok(window.FeAudioMixerVisuals?.mount, 'visuals module must expose mount');
assert.ok(window.FeAudioMixerVisuals?.normalizeTelemetry, 'telemetry normalizer must be reusable by producers');
assert.ok(window.FeAudioMixerVisuals?.snapshot, 'mounted production telemetry must expose a bounded read-only diagnostic snapshot');
assert.ok(
  window.FeAudioMixerVisuals?.createMediaElementTelemetrySource,
  'production must expose a real HTMLMediaElement/Web Audio telemetry adapter'
);

class FakeAnalyser {
  constructor(index) {
    this.index = index;
    this.fftSize = 1024;
    this.frequencyBinCount = 512;
    this.smoothingTimeConstant = 0;
  }
  connect() {}
  disconnect() {}
  getFloatFrequencyData(target) {
    target.fill(-48);
  }
  getFloatTimeDomainData(target) {
    for (let index = 0; index < target.length; index += 1) {
      const sample = Math.sin((index / target.length) * Math.PI * 8) * 0.5;
      target[index] = this.index === 2 ? sample * 0.8 : sample;
    }
  }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = {};
    this.analysers = [];
    this.closed = false;
  }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createAnalyser() {
    const analyser = new FakeAnalyser(this.analysers.length);
    this.analysers.push(analyser);
    return analyser;
  }
  createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closed = true; }
}

const adapterMedia = {
  paused: false,
  ended: false,
  currentTime: 30,
  duration: 120,
  readyState: 4,
  captureStream() { return { getAudioTracks: () => [{}] }; },
  addEventListener() {},
  removeEventListener() {}
};
let adapterContext = null;
const adapter = window.FeAudioMixerVisuals.createMediaElementTelemetrySource(adapterMedia, {
  audioContextFactory() {
    adapterContext = new FakeAudioContext();
    return adapterContext;
  },
  isActive: () => true
});
let adapterFrame = null;
adapter.subscribe((frame) => { adapterFrame = frame; });
assert.equal(await adapter.sampleNow(), true);
assert.equal(adapterFrame.available, true);
assert.equal(adapterFrame.stage, 'media-input', 'captureStream analysis must identify itself as pre-mixer media input');
assert.equal(adapterFrame.spectrum.length, 128);
assert.equal(adapterFrame.waveform.length, 512);
assert.ok(adapterFrame.stereo.peak[0] > adapterFrame.stereo.rms[0]);
assert.ok(adapterFrame.stereo.correlation > 0.99);
assert.equal(adapterFrame.stereo.gainReductionDb, null, 'media input cannot claim post-mixer gain reduction');
assert.equal(
  window.FeAudioMixerVisuals.normalizeTelemetry(adapterFrame).stereo.gainReductionDb,
  null,
  'normalizing an already-normalized media frame must not coerce null gain reduction to 0 dB'
);
assert.deepEqual([...adapterFrame.channels], [], 'stereo analysis must never invent surround-channel telemetry');
assert.equal(adapterFrame.playback.positionSeconds, 30);
adapter.destroy();
assert.equal(adapterContext.closed, true);

let warmupSignalReady = false;
class WarmupAnalyser extends FakeAnalyser {
  getFloatTimeDomainData(target) {
    if (!warmupSignalReady) {
      target.fill(0);
      return;
    }
    super.getFloatTimeDomainData(target);
  }
}
class WarmupAudioContext extends FakeAudioContext {
  createAnalyser() {
    const analyser = new WarmupAnalyser(this.analysers.length);
    this.analysers.push(analyser);
    return analyser;
  }
}
const warmupAdapter = window.FeAudioMixerVisuals.createMediaElementTelemetrySource(adapterMedia, {
  audioContextFactory: () => new WarmupAudioContext(),
  isActive: () => true
});
let warmupFrame = null;
warmupAdapter.subscribe((frame) => { warmupFrame = frame; });
assert.equal(await warmupAdapter.sampleNow(), false, 'analyser zero-fill must not be announced as live telemetry');
assert.equal(warmupFrame.available, false);
assert.equal(warmupFrame.stage, 'media-input');
assert.equal(warmupFrame.reason, 'media-analysis-warming');
warmupSignalReady = true;
assert.equal(await warmupAdapter.sampleNow(), true, 'first measured audio frame should transition telemetry to live');
assert.ok(warmupFrame.stereo.peak.every((value) => value > 0));
warmupAdapter.destroy();

class SwitchingAnalyser extends FakeAnalyser {
  constructor(index, context) {
    super(index);
    this.context = context;
  }
  getFloatTimeDomainData(target) {
    const sourceScale = this.context.streamId === 2 ? 0.72 : 0.24;
    const channelScale = this.index === 2 ? 0.55 : 1;
    for (let index = 0; index < target.length; index += 1) {
      target[index] = Math.sin((index / target.length) * Math.PI * 8) * sourceScale * channelScale;
    }
  }
}
class SwitchingAudioContext extends FakeAudioContext {
  constructor() {
    super();
    this.streamId = 0;
  }
  createMediaStreamSource(stream) {
    this.streamId = stream.id;
    return { connect() {}, disconnect() {} };
  }
  createAnalyser() {
    const analyser = new SwitchingAnalyser(this.analysers.length, this);
    this.analysers.push(analyser);
    return analyser;
  }
}
const switchingListeners = new Map();
let switchingCaptureCalls = 0;
const switchingMedia = {
  paused: false,
  ended: false,
  currentTime: 1,
  duration: 30,
  readyState: 4,
  captureStream() {
    switchingCaptureCalls += 1;
    return { id: switchingCaptureCalls, getAudioTracks: () => [{}] };
  },
  addEventListener(type, listener) {
    if (!switchingListeners.has(type)) switchingListeners.set(type, new Set());
    switchingListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { switchingListeners.get(type)?.delete(listener); },
  dispatch(type) { switchingListeners.get(type)?.forEach((listener) => listener({ type })); }
};
const switchingContexts = [];
const switchingAdapter = window.FeAudioMixerVisuals.createMediaElementTelemetrySource(switchingMedia, {
  audioContextFactory() {
    const context = new SwitchingAudioContext();
    switchingContexts.push(context);
    return context;
  },
  isActive: () => true
});
let switchingFrame = null;
switchingAdapter.subscribe((frame) => { switchingFrame = frame; });
assert.equal(await switchingAdapter.sampleNow(), true);
const firstTrackPeak = switchingFrame.stereo.peak[0];
switchingMedia.dispatch('loadstart');
switchingMedia.dispatch('emptied');
assert.equal(await switchingAdapter.sampleNow(), true, 'a second media source must become live after source reset');
assert.equal(switchingCaptureCalls, 2, 'source reset must capture the second track stream instead of reusing the first');
assert.ok(switchingFrame.stereo.peak[0] > firstTrackPeak * 2, 'second-track telemetry must come from its new stream');
assert.equal(switchingContexts[0].closed, true, 'the first track analysis graph must be closed on source reset');
switchingMedia.paused = true;
switchingMedia.dispatch('pause');
await Promise.resolve();
assert.equal(switchingFrame.available, false, 'pause must immediately replace the last live meter frame');
assert.equal(switchingFrame.reason, 'media-not-playing');
assert.equal(switchingContexts[1].state, 'suspended', 'pause must suspend Web Audio analysis while the mixer is closed');
switchingMedia.paused = false;
switchingMedia.dispatch('play');
assert.equal(await switchingAdapter.sampleNow(), true, 'resuming playback must restart the suspended analyser graph');
switchingAdapter.destroy();
assert.equal(switchingListeners.get('loadstart')?.size || 0, 0, 'destroy must remove the loadstart reset listener');
assert.equal(switchingListeners.get('emptied')?.size || 0, 0, 'destroy must remove the emptied reset listener');

class DeferredSwitchingAudioContext extends SwitchingAudioContext {
  constructor(deferred) {
    super();
    this.deferred = deferred;
    if (deferred) this.state = 'suspended';
    this.releaseResume = null;
  }
  async resume() {
    if (!this.deferred) {
      this.state = 'running';
      return;
    }
    await new Promise((resolve) => {
      this.releaseResume = () => {
        this.state = 'running';
        resolve();
      };
    });
  }
}
const generationListeners = new Map();
let generationCaptureCalls = 0;
const generationMedia = {
  ...switchingMedia,
  captureStream() {
    generationCaptureCalls += 1;
    return { id: generationCaptureCalls, getAudioTracks: () => [{}] };
  },
  addEventListener(type, listener) {
    if (!generationListeners.has(type)) generationListeners.set(type, new Set());
    generationListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { generationListeners.get(type)?.delete(listener); },
  dispatch(type) { generationListeners.get(type)?.forEach((listener) => listener({ type })); }
};
const generationContexts = [];
const generationAdapter = window.FeAudioMixerVisuals.createMediaElementTelemetrySource(generationMedia, {
  audioContextFactory() {
    const context = new DeferredSwitchingAudioContext(generationContexts.length === 0);
    generationContexts.push(context);
    return context;
  },
  isActive: () => true
});
let generationFrame = null;
generationAdapter.subscribe((frame) => { generationFrame = frame; });
const staleGenerationSample = generationAdapter.sampleNow();
while (typeof generationContexts[0]?.releaseResume !== 'function') await Promise.resolve();
generationMedia.dispatch('loadstart');
assert.equal(await generationAdapter.sampleNow(), true, 'new generation must not wait for the stale graph promise');
const currentGenerationPeak = generationFrame.stereo.peak[0];
generationContexts[0].releaseResume();
assert.equal(await staleGenerationSample, false, 'a stale graph completion must not publish into the new source generation');
assert.equal(generationFrame.stereo.peak[0], currentGenerationPeak);
assert.equal(generationCaptureCalls, 2);
assert.equal(generationContexts[0].closed, true, 'stale graph must close when its deferred construction completes');
generationAdapter.destroy();

const pauseRaceListeners = new Map();
const pauseRaceMedia = {
  ...switchingMedia,
  paused: false,
  captureStream() { return { id: 3, getAudioTracks: () => [{}] }; },
  addEventListener(type, listener) {
    if (!pauseRaceListeners.has(type)) pauseRaceListeners.set(type, new Set());
    pauseRaceListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) { pauseRaceListeners.get(type)?.delete(listener); },
  dispatch(type) { pauseRaceListeners.get(type)?.forEach((listener) => listener({ type })); }
};
const pauseRaceContext = new DeferredSwitchingAudioContext(true);
const pauseRaceAdapter = window.FeAudioMixerVisuals.createMediaElementTelemetrySource(pauseRaceMedia, {
  audioContextFactory: () => pauseRaceContext,
  isActive: () => true
});
let pauseRaceFrame = null;
pauseRaceAdapter.subscribe((frame) => { pauseRaceFrame = frame; });
const pauseRaceSample = pauseRaceAdapter.sampleNow();
while (typeof pauseRaceContext.releaseResume !== 'function') await Promise.resolve();
pauseRaceMedia.paused = true;
pauseRaceMedia.dispatch('pause');
pauseRaceContext.releaseResume();
assert.equal(await pauseRaceSample, false, 'an in-flight analyser sample must be discarded when playback pauses');
assert.equal(pauseRaceFrame.available, false, 'an in-flight sample must not overwrite the paused state with stale live data');
assert.equal(pauseRaceContext.state, 'suspended', 'the graph created during a pause race must finish suspended');
pauseRaceAdapter.destroy();

const oversizedTelemetry = window.FeAudioMixerVisuals.normalizeTelemetry({
  available: true,
  stage: 'made-up-output',
  sequence: 7,
  timestampMs: 50,
  sampleRate: 48000,
  stereo: {
    peak: [9, -4],
    rms: [3, -1],
    peakHold: [10, 2],
    correlation: 9,
    gainReductionDb: 99
  },
  spectrum: Array.from({ length: 400 }, (_, index) => index / 10),
  waveform: Array.from({ length: 1200 }, (_, index) => index % 2 ? -7 : 7),
  playback: { positionSeconds: 999, durationSeconds: 100 },
  channels: Array.from({ length: 30 }, (_, index) => ({ id: index ? 'R' : 'L', peak: 9, rms: -4 }))
});
assert.equal(oversizedTelemetry.spectrum.length, 128, 'spectrum data must be bounded');
assert.equal(oversizedTelemetry.waveform.length, 512, 'waveform data must be bounded');
assert.equal(oversizedTelemetry.channels.length, 2, 'channels must be de-duplicated and restricted to known ids');
assert.deepEqual([...oversizedTelemetry.stereo.peak], [4, 0]);
assert.equal(oversizedTelemetry.stereo.correlation, 1);
assert.equal(oversizedTelemetry.stereo.gainReductionDb, 60);
assert.equal(oversizedTelemetry.stage, 'unknown', 'untrusted telemetry stage names must not pass the whitelist');
assert.equal(oversizedTelemetry.playback.positionSeconds, 100);

const storage = new FakeStorage();
const parameterChanges = [];
const channelRouterChanges = [];
const seekRequests = [];
let telemetrySink = null;
let unsubscribed = false;
const host = document.createElement('section');
document.body.appendChild(host);
const controller = window.FeAudioMixerVisuals.mount(host, {
  storage,
  telemetrySource: {
    subscribe(listener) {
      telemetrySink = listener;
      return () => { unsubscribed = true; };
    }
  },
  onParameterChange(key, value) { parameterChanges.push([key, value]); },
  onChannelRouterChange(patch) { channelRouterChanges.push({ ...patch }); },
  onSeek(ratio) { seekRequests.push(ratio); }
});

const visualRoot = byDataset(host, 'audioMixerVisuals')[0];
assert.ok(visualRoot, 'mount must render the professional visual workspace');
const cards = byDataset(visualRoot, 'mixerVisualModule');
assert.deepEqual(
  cards.map((card) => card.dataset.mixerVisualModule),
  ['meters', 'spectrum', 'stereo-field', 'surround', 'waveform', 'spatial'],
  'all required visualization modules must be present in a deterministic default order'
);
assert.equal(visualRoot.dataset.telemetryState, 'unavailable');
assert.ok(
  byDataset(visualRoot, 'visualUnavailable').every((status) => /不可用/u.test(status.textContent)),
  'missing telemetry must be stated honestly instead of drawing invented levels'
);
assert.equal(byDataset(visualRoot, 'channelMeter').length, 8, 'the spatial panel must expose all 7.1 channel meters');
assert.equal(byDataset(visualRoot, 'routeNode').length, 12, 'the route graph must expose input, upmix, mixer, OBR and eight outputs');
assert.equal(byDataset(visualRoot, 'testSignalButton').length, 8, 'every virtual speaker needs a test-signal seam');
assert.ok(
  byDataset(visualRoot, 'testSignalButton').every((button) => button.disabled),
  'test signals must be disabled when no audio backend callback is connected'
);
assert.match(byDataset(visualRoot, 'testSignalState')[0].textContent, /不可用/u);
assert.equal(byDataset(visualRoot, 'automationState')[0].dataset.automationState, 'preview-only');
assert.match(byDataset(visualRoot, 'automationState')[0].textContent, /仅预览.*未启用/u);
assert.equal(typeof controller.updateChannelRouter, 'function', 'real channel telemetry needs an explicit bounded adapter');
assert.deepEqual(
  byDataset(visualRoot, 'spatialAlgorithm')[0].children.map((option) => ({
    value: option.value,
    disabled: option.disabled
  })),
  [
    { value: 'front-only', disabled: false },
    { value: 'matrix-decode', disabled: false },
    { value: 'ambient-extract', disabled: false },
    { value: 'custom-matrix', disabled: false },
    { value: 'passive', disabled: true },
    { value: 'dolby-pro-logic-iix', disabled: true },
    { value: 'dts-neural-x', disabled: true }
  ]
);

telemetrySink({
  available: true,
  stage: 'media-input',
  sequence: 2,
  sampleRate: 48000,
  stereo: { peak: [0.4, 0.3], rms: [0.2, 0.15] },
  spectrum: [0.1, 0.2],
  waveform: [0, 0.2, -0.2, 0],
  playback: { positionSeconds: 1, durationSeconds: 10 },
  channels: []
});
controller.updateChannelRouter({
  revision: 3,
  layout: '5.1',
  algorithm: 'matrix-decode',
  lfeCrossoverHz: 120,
  channelOrder: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  channelGainDb: [0, 0, 0, 0, 0, 0, 0, 0],
  channelDelayMs: [0, 0, 0, 0, 5, 5, 0, 0],
  channelAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  customMatrix: [1, 0, 0, 1, 0.707, 0.707, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  available: true,
  actual: true,
  active: true,
  processCalls: 44,
  channelPeak: [0.6, 0.5, 0.4, 0.1, 0.3, 0.25, 0, 0],
  channelRms: [0.3, 0.25, 0.2, 0.05, 0.15, 0.12, 0, 0],
  channelTelemetryAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  physicalMultichannel: false
});
flushFrames(90);
assert.equal(controller.snapshot().channelRouter.channelCount, 6);
assert.equal(controller.snapshot().channelRouter.physicalMultichannel, false);
assert.equal(byDataset(visualRoot, 'channelMeter', 'Ls')[0].dataset.telemetry, 'live');
assert.equal(byDataset(visualRoot, 'channelMeter', 'Lb')[0].dataset.telemetry, 'unavailable');
assert.equal(
  byDataset(visualRoot, 'mixerVisualModule', 'surround')[0].dataset.dataState,
  'live',
  'real channel-router telemetry must make the surround radar live even when media analysis is stereo-only'
);
controller.updateChannelRouter({
  revision: 4,
  layout: '5.1',
  algorithm: 'matrix-decode',
  lfeCrossoverHz: 120,
  channelOrder: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
  channelGainDb: [0, 0, 0, 0, 0, 0, 0, 0],
  channelDelayMs: [0, 0, 0, 0, 0, 0, 0, 0],
  channelAzimuthDeg: [30, -30, 0, 0, 90, -90, 0, 0],
  customMatrix: Array(16).fill(0),
  available: true,
  actual: false,
  active: false,
  controlAvailable: true,
  availability: 'transition-pending',
  activeRevision: 3,
  stagedRevision: 4,
  lastResult: -3,
  layoutPending: true,
  transitionPending: true,
  output: 'energy-matched-stereo-fold-down',
  processCalls: 0,
  channelPeak: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0, 0],
  channelRms: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0],
  physicalMultichannel: false
});
assert.equal(controller.snapshot().channelRouter.channelCount, 0, 'non-actual levels must never appear as real radar telemetry');
assert.equal(controller.snapshot().channelRouter.controlAvailable, true);
assert.equal(controller.snapshot().channelRouter.transitionPending, true);
assert.equal(controller.snapshot().channelRouter.layoutPending, true);
assert.equal(controller.snapshot().channelRouter.lastResult, -3);
assert.equal(controller.snapshot().channelRouter.availability, 'transition-pending');
assert.equal(controller.snapshot().channelRouter.output, 'energy-matched-stereo-fold-down');
controller.updateChannelRouter(null);

controller.updateParameters({
  upmixEnabled: true,
  obrEnabled: true,
  upmixAlgorithm: 'matrix-decode',
  upmixOutputLayout: '7.1',
  obrFilterProfile: 'direct',
  balance: 0
});
assert.equal(byDataset(visualRoot, 'spatialLayout')[0].value, '7.1');
assert.equal(byDataset(visualRoot, 'spatialAlgorithm')[0].value, 'matrix-decode');
assert.match(byDataset(visualRoot, 'routeSummary')[0].textContent, /7\.1.*上混.*Mixer.*OBR/u);

const automationEnabled = byDataset(visualRoot, 'automationEnabled')[0];
const automationCanvas = byDataset(visualRoot, 'automationCanvas')[0];
automationEnabled.checked = true;
automationEnabled.dispatchEvent({ type: 'change' });
automationCanvas.clientWidth = 200;
automationCanvas.clientHeight = 100;
const storageWritesBeforeDrag = storage.setCalls;
automationCanvas.dispatchEvent({ type: 'pointerdown', pointerId: 4, clientX: 50, clientY: 25 });
automationCanvas.dispatchEvent({ type: 'pointermove', pointerId: 4, clientX: 150, clientY: 75 });
assert.equal(storage.setCalls, storageWritesBeforeDrag, 'pointermove must not synchronously write localStorage');
automationCanvas.dispatchEvent({ type: 'pointerup', pointerId: 4, clientX: 150, clientY: 75 });
assert.equal(storage.setCalls, storageWritesBeforeDrag + 1, 'one completed automation gesture must persist exactly once');
assert.match(storage.getItem('fe.audioMixer.automation.v1'), /"enabled":true[\s\S]*"points"/u);
assert.ok(controller.snapshot().automation.points.length >= 2, 'automation preview must preserve a bounded normalized curve');
byDataset(visualRoot, 'automationClear')[0].click();
assert.equal(controller.snapshot().automation.points.length, 0, 'automation curve can be explicitly cleared');
const automationTimeInput = byDataset(visualRoot, 'automationTimeInput')[0];
const automationValueInput = byDataset(visualRoot, 'automationValueInput')[0];
assert.ok(automationTimeInput && automationValueInput, 'automation editing must have a keyboard-accessible numeric path');
automationTimeInput.value = '0.5';
automationValueInput.value = '3';
byDataset(visualRoot, 'automationAdd')[0].click();
assert.deepEqual({ ...controller.snapshot().automation.points[0] }, { time: 0.5, value: 3 });

telemetrySink({
  available: true,
  sequence: 8,
  timestampMs: 100,
  sampleRate: 48000,
  stereo: {
    peak: [1.03, 0.76],
    rms: [0.42, 0.31],
    peakHold: [1.08, 0.81],
    correlation: 0.25,
    gainReductionDb: 4.5
  },
  spectrum: Array.from({ length: 64 }, (_, index) => index / 64),
  waveform: Array.from({ length: 256 }, (_, index) => Math.sin(index / 12)),
  playback: { positionSeconds: 37.5, durationSeconds: 150 },
  channels: ['L', 'R', 'C', 'LFE', 'Ls', 'Rs', 'Lb', 'Rb'].map((id, index) => ({
    id,
    peak: 0.9 - index * 0.05,
    rms: 0.5 - index * 0.03
  }))
});
assert.equal(visualRoot.dataset.telemetryState, 'live');
const boundedSnapshot = window.FeAudioMixerVisuals.snapshot(host);
assert.deepEqual([...boundedSnapshot.telemetry.stereo.peak], [1.03, 0.76]);
assert.deepEqual([...boundedSnapshot.telemetry.stereo.rms], [0.42, 0.31]);
assert.equal(boundedSnapshot.telemetry.channelCount, 8);
assert.equal(boundedSnapshot.telemetry.spectrumBins, 64);
assert.equal(Object.hasOwn(boundedSnapshot.telemetry, 'waveform'), false, 'diagnostics must not expose unbounded sample arrays');
assert.equal(frameQueue.size, 1, 'one shared animation frame must service every visible visualization');
assert.ok(flushFrames(116) >= 1, 'visible modules must be rendered over a bounded frame cycle');
assert.match(byDataset(visualRoot, 'peakReadout', 'L')[0].textContent, /OVER|\+0\.3/u);
assert.match(byDataset(visualRoot, 'rmsReadout', 'L')[0].textContent, /-7\.5/u);
assert.match(byDataset(visualRoot, 'gainReduction')[0].textContent, /4\.5/u);
assert.match(byDataset(visualRoot, 'correlationReadout')[0].textContent, /0\.25/u);
assert.match(byDataset(visualRoot, 'playbackReadout')[0].textContent, /0:37.*2:30/u);
assert.ok(byDataset(visualRoot, 'overloadLamp', 'L')[0].classList.contains('is-over'));

const spectrumCard = cards.find((card) => card.dataset.mixerVisualModule === 'spectrum');
const spectrumVector = byDataset(spectrumCard, 'visualVector', 'spectrum')[0];
const spectrumDrawsBefore = spectrumVector.children.at(-1).getAttribute('d');
controller.setModuleVisibility('spectrum', false);
controller.pushTelemetry({
  available: true,
  sequence: 9,
  spectrum: [0.2, 0.4, 0.6],
  stereo: { peak: [0.5, 0.5], rms: [0.2, 0.2] },
  waveform: [0, 0.2, -0.2, 0],
  playback: { positionSeconds: 37.5, durationSeconds: 150 },
  channels: ['L', 'R'].map((id) => ({ id, peak: 0.5, rms: 0.2 }))
});
flushFrames(132);
assert.equal(spectrumCard.hidden, true);
assert.equal(
  spectrumVector.children.at(-1).getAttribute('d'),
  spectrumDrawsBefore,
  'hidden modules must not consume rendering work'
);
assert.match(storage.getItem('fe.audioMixer.visualLayout.v1'), /"spectrum"[\s\S]*"visible":false/u);

const metersCollapse = byDataset(visualRoot, 'visualCollapse', 'meters')[0];
metersCollapse.click();
assert.equal(cards[0].dataset.collapsed, 'true');
assert.equal(metersCollapse.getAttribute('aria-expanded'), 'false');

const metersSize = byDataset(visualRoot, 'visualSize', 'meters')[0];
metersSize.click();
assert.equal(cards[0].dataset.size, 'wide');

const dragTransfer = {
  value: '',
  setData(_type, value) { this.value = value; },
  getData() { return this.value; }
};
const spatialCard = cards.find((card) => card.dataset.mixerVisualModule === 'spatial');
byDataset(spatialCard, 'visualDrag')[0].dispatchEvent({ type: 'dragstart', dataTransfer: dragTransfer });
cards[0].dispatchEvent({ type: 'dragover' });
cards[0].dispatchEvent({ type: 'drop', dataTransfer: dragTransfer });
assert.equal(
  byDataset(visualRoot, 'mixerVisualModule')[0].dataset.mixerVisualModule,
  'spatial',
  'drag and drop must reorder modules'
);

const layoutSelect = byDataset(visualRoot, 'spatialLayout')[0];
layoutSelect.value = '5.1';
layoutSelect.dispatchEvent({ type: 'change' });
assert.equal(byDataset(visualRoot, 'routeNode', 'Lb')[0].dataset.routeState, 'bypass');
assert.equal(byDataset(visualRoot, 'routeNode', 'Rb')[0].dataset.routeState, 'bypass');
assert.equal(byDataset(visualRoot, 'routeNode', 'Ls')[0].dataset.routeState, 'active');
assert.equal(byDataset(visualRoot, 'routeNode', 'Rs')[0].dataset.routeState, 'active');
const algorithmSelect = byDataset(visualRoot, 'spatialAlgorithm')[0];
algorithmSelect.value = 'ambient-extract';
algorithmSelect.dispatchEvent({ type: 'change' });
assert.deepEqual(channelRouterChanges.slice(-2), [
  { layout: '5.1' },
  { algorithm: 'ambient-extract' }
]);

const pan = byDataset(visualRoot, 'spatialPanSurface')[0];
pan.clientWidth = 200;
pan.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 150, clientY: 60 });
pan.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 180, clientY: 60 });
pan.dispatchEvent({ type: 'pointerup', pointerId: 1, clientX: 180, clientY: 60 });
assert.deepEqual(parameterChanges.at(-1), ['balance', 0.8]);
const panHandle = byDataset(visualRoot, 'spatialPanHandle')[0];
panHandle.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', preventDefault() {} });
assert.deepEqual(parameterChanges.at(-1), ['balance', 0.75]);

const waveformCanvas = byDataset(
  cards.find((card) => card.dataset.mixerVisualModule === 'waveform'),
  'visualCanvas'
)[0];
waveformCanvas.clientWidth = 400;
waveformCanvas.dispatchEvent({ type: 'pointerdown', clientX: 100, clientY: 20 });
assert.deepEqual(seekRequests, [0.25]);

const beforeDestroyFrameCount = frameQueue.size;
assert.equal(controller.destroy(), true);
assert.equal(unsubscribed, true);
assert.equal(host.children.length, 0);
assert.ok(frameQueue.size <= beforeDestroyFrameCount, 'destroy must cancel pending visual work');

document.baseURI = 'http://127.0.0.1:19876/';
const workerInstances = [];
class DelayedWorker {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
    workerInstances.push(this);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  emit(type, data = {}) {
    this.listeners.get(type)?.forEach((listener) => listener({ type, data }));
  }
}
window.Worker = DelayedWorker;
FakeElement.prototype.transferControlToOffscreen = function transferControlToOffscreen() {
  if (this.tagName !== 'CANVAS') throw new Error('not-a-canvas');
  this.wasTransferred = true;
  return { width: this.width, height: this.height };
};

const workerHost = document.createElement('section');
document.body.appendChild(workerHost);
const workerController = window.FeAudioMixerVisuals.mount(workerHost, { storage: new FakeStorage() });
const workerRoot = byDataset(workerHost, 'audioMixerVisuals')[0];
assert.equal(workerRoot.dataset.canvasRenderer, 'worker-starting');
assert.equal(workerInstances.length, 1);
assert.equal(workerInstances[0].messages[0]?.type, 'init');
workerController.pushTelemetry({
  available: true,
  sequence: 21,
  stereo: { peak: [0.5, 0.4], rms: [0.2, 0.18], leftSamples: [0, 0.3], rightSamples: [0, -0.2] },
  waveform: [0, 0.3, -0.2, 0],
  playback: { positionSeconds: 5, durationSeconds: 30 },
  channels: [
    { id: 'L', peak: 0.5, rms: 0.2 },
    { id: 'R', peak: 0.4, rms: 0.18 }
  ]
});
flushFrames(150);
workerInstances[0].emit('error');
assert.equal(workerInstances[0].terminated, true, 'worker failure must terminate the failed renderer');
assert.equal(workerRoot.dataset.canvasRenderer, 'main-thread-fallback');
flushFrames(180);
for (const id of ['stereo-field', 'surround']) {
  const recoveredCanvas = byDataset(workerRoot, 'visualCanvas', id)[0];
  assert.ok(recoveredCanvas, `${id} canvas must be recreated after transfer failure`);
  assert.ok(recoveredCanvas.context.drawCalls > 0, `${id} must resume drawing on the main thread after worker failure`);
}
assert.equal(workerController.destroy(), true);

let partialTransferCount = 0;
FakeElement.prototype.transferControlToOffscreen = function failSecondTransfer() {
  partialTransferCount += 1;
  if (partialTransferCount === 2) throw new Error('partial-transfer-failure');
  this.wasTransferred = true;
  return { width: this.width, height: this.height };
};
const partialHost = document.createElement('section');
document.body.appendChild(partialHost);
const partialController = window.FeAudioMixerVisuals.mount(partialHost, { storage: new FakeStorage() });
const partialRoot = byDataset(partialHost, 'audioMixerVisuals')[0];
assert.equal(workerInstances.length, 2);
assert.equal(workerInstances[1].terminated, true, 'synchronous partial transfer failure must not leak its worker');
assert.equal(partialRoot.dataset.canvasRenderer, 'main-thread-fallback');
assert.equal(byDataset(partialRoot, 'visualCanvas', 'stereo-field')[0].wasTransferred, undefined);
partialController.pushTelemetry({
  available: true,
  sequence: 22,
  stereo: { peak: [0.3, 0.3], rms: [0.1, 0.1], leftSamples: [0, 0.1], rightSamples: [0, 0.1] },
  channels: [{ id: 'L', peak: 0.3, rms: 0.1 }, { id: 'R', peak: 0.3, rms: 0.1 }]
});
flushFrames(210);
assert.ok(byDataset(partialRoot, 'visualCanvas', 'stereo-field')[0].context.drawCalls > 0);
partialController.destroy();
delete window.Worker;
delete FakeElement.prototype.transferControlToOffscreen;

const workerMessages = [];
const renderWorkerScope = {
  setTimeout,
  clearTimeout,
  postMessage(message) { workerMessages.push(message); }
};
renderWorkerScope.self = renderWorkerScope;
vm.runInNewContext(renderWorkerSource, renderWorkerScope, { filename: 'web/audio-mixer-render-worker.js' });
renderWorkerScope.onmessage({
  data: {
    type: 'init',
    surfaces: [{ id: 'surround', canvas: { getContext: () => null }, width: 640, height: 220, ratio: 1 }]
  }
});
assert.deepEqual(
  JSON.parse(JSON.stringify(workerMessages.at(-1))),
  { type: 'init-error', failed: ['surround'] },
  'a worker that cannot acquire every transferred canvas must request a recoverable main-thread fallback'
);

console.log(JSON.stringify({
  pass: true,
  modules: cards.map((card) => card.dataset.mixerVisualModule),
  parameterChanges,
  channelRouterChanges,
  seekRequests
}, null, 2));
