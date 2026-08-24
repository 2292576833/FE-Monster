(function createAudioMixerVisuals(global) {
  'use strict';

  const LAYOUT_STORAGE_KEY = 'fe.audioMixer.visualLayout.v1';
  const AUTOMATION_STORAGE_KEY = 'fe.audioMixer.automation.v1';
  const MIXER_RENDER_WORKER_URL = 'audio-mixer-render-worker.js?v=20260824-mixer-render-4';
  const MIXER_RENDER_WORKER_READY_TIMEOUT_MS = 1500;
  const TELEMETRY_INTERVAL_MS = 1000 / 30;
  const MAX_SPECTRUM_BINS = 128;
  const MAX_WAVEFORM_SAMPLES = 512;
  const CHANNELS = Object.freeze([
    Object.freeze({ id: 'L', label: 'FL / L', angle: -30 }),
    Object.freeze({ id: 'R', label: 'FR / R', angle: 30 }),
    Object.freeze({ id: 'C', label: 'FC / C', angle: 0 }),
    Object.freeze({ id: 'LFE', label: 'LFE', angle: 0 }),
    Object.freeze({ id: 'Lb', label: 'BL / Lb', angle: -135 }),
    Object.freeze({ id: 'Rb', label: 'BR / Rb', angle: 135 }),
    Object.freeze({ id: 'Ls', label: 'SL / Ls', angle: -90 }),
    Object.freeze({ id: 'Rs', label: 'SR / Rs', angle: 90 })
  ]);
  const CHANNEL_IDS = new Set(CHANNELS.map((channel) => channel.id));
  const CHANNELS_5_1 = new Set(['L', 'R', 'C', 'LFE', 'Ls', 'Rs']);
  const ROUTER_CHANNEL_IDS = Object.freeze({
    FL: 'L', FR: 'R', FC: 'C', LFE: 'LFE', BL: 'Lb', BR: 'Rb', SL: 'Ls', SR: 'Rs'
  });
  const ROUTER_LAYOUTS = Object.freeze({
    '5.1': Object.freeze(['FL', 'FR', 'FC', 'LFE', 'SL', 'SR']),
    '7.1': Object.freeze(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'])
  });
  const ROUTER_ALGORITHMS = new Set(['front-only', 'matrix-decode', 'ambient-extract', 'custom-matrix', 'passive']);
  const ROUTER_OUTPUTS = new Set([
    'binaural-2ch-headphones',
    'energy-matched-stereo-fold-down',
    'virtual-bed-to-binaural-2ch'
  ]);
  const TELEMETRY_STAGES = new Set(['media-input', 'post-mixer', 'native-output']);
  const MODULES = Object.freeze([
    Object.freeze({
      id: 'meters',
      title: '播放源前级电平',
      description: '进入 Rust 调音链之前的峰值、RMS 与峰值保持；不代表调音台后级输出'
    }),
    Object.freeze({ id: 'spectrum', title: '频谱分析仪', description: '20 Hz–20 kHz 实时频域能量' }),
    Object.freeze({ id: 'stereo-field', title: '声像 / 声场', description: '立体声相关度与相位分布' }),
    Object.freeze({ id: 'surround', title: '环绕声场雷达', description: '虚拟 5.1 / 7.1 声道能量分布' }),
    Object.freeze({ id: 'waveform', title: '波形与播放进度', description: '有界波形预览与精确定位入口' }),
    Object.freeze({ id: 'spatial', title: 'OBR / 上混设置', description: '路由、声道电平与声像控制' })
  ]);
  const MODULE_IDS = new Set(MODULES.map((module) => module.id));
  const SIZE_STATES = Object.freeze(['normal', 'wide', 'tall']);
  const AUTOMATION_PARAMETERS = Object.freeze([
    Object.freeze({ key: 'inputGainDb', label: '输入增益', min: -24, max: 24, step: 0.1, unit: 'dB' }),
    Object.freeze({ key: 'outputGainDb', label: '输出增益', min: -24, max: 24, step: 0.1, unit: 'dB' }),
    Object.freeze({ key: 'balance', label: '左右平衡', min: -1, max: 1, step: 0.01, unit: '' }),
    Object.freeze({ key: 'stereoWidth', label: '立体声宽度', min: 0, max: 2, step: 0.01, unit: '×' }),
    Object.freeze({ key: 'centerGain', label: '中置增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    Object.freeze({ key: 'surroundGain', label: '环绕增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    Object.freeze({ key: 'lfeGain', label: 'LFE 增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    Object.freeze({ key: 'upmixSurroundGain', label: '上混环绕增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    Object.freeze({ key: 'obrSpatialWidth', label: 'OBR 空间宽度', min: 0, max: 2, step: 0.01, unit: '×' })
  ]);
  const AUTOMATION_PARAMETER_KEYS = new Set(AUTOMATION_PARAMETERS.map((entry) => entry.key));
  const mounted = new WeakMap();
  const publishers = new Set();
  let instanceSequence = 0;

  function node(document, tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    Object.entries(options.attributes || {}).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });
    Object.entries(options.dataset || {}).forEach(([name, value]) => {
      element.dataset[name] = String(value);
    });
    return element;
  }

  function vectorNode(document, tagName) {
    return typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
      : document.createElement(tagName);
  }

  function setText(element, value) {
    if (!element) return false;
    const next = String(value);
    if (element.textContent === next) return false;
    element.textContent = next;
    return true;
  }

  function setDataset(element, key, value) {
    if (!element) return false;
    const next = String(value);
    if (element.dataset[key] === next) return false;
    element.dataset[key] = next;
    return true;
  }

  function setHidden(element, value) {
    if (!element) return false;
    const next = value === true;
    if (element.hidden === next) return false;
    element.hidden = next;
    return true;
  }

  function setAttributeIfChanged(element, name, value) {
    if (!element) return false;
    const next = String(value);
    if (element.getAttribute(name) === next) return false;
    element.setAttribute(name, next);
    return true;
  }

  function setStyleIfChanged(element, property, value) {
    if (!element) return false;
    const next = String(value);
    if (element.style[property] === next) return false;
    element.style[property] = next;
    return true;
  }

  function clamp(value, minimum, maximum, fallback = minimum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function boundedArray(value, maximumLength, minimum, maximum) {
    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return null;
    const length = Math.min(maximumLength, value.length);
    if (length <= 0) return null;
    const output = new Array(length);
    for (let index = 0; index < length; index += 1) {
      output[index] = clamp(value[index], minimum, maximum, 0);
    }
    return Object.freeze(output);
  }

  function normalizeStereo(value) {
    if (!value || typeof value !== 'object') return null;
    const peakInput = boundedArray(value.peak, 2, 0, 4);
    const rmsInput = boundedArray(value.rms, 2, 0, 4);
    if (peakInput?.length !== 2 || rmsInput?.length !== 2) return null;
    const peak = Object.freeze([...peakInput]);
    const rms = Object.freeze([...rmsInput]);
    const holdInput = boundedArray(value.peakHold, 2, 0, 4);
    const peakHold = Object.freeze(holdInput?.length === 2
      ? [Math.max(peak[0], holdInput[0]), Math.max(peak[1], holdInput[1])]
      : [...peak]);
    const leftSamples = boundedArray(value.leftSamples, MAX_WAVEFORM_SAMPLES, -1, 1);
    const rightSamples = boundedArray(value.rightSamples, MAX_WAVEFORM_SAMPLES, -1, 1);
    return Object.freeze({
      peak,
      rms,
      peakHold,
      correlation: value.correlation !== null
        && value.correlation !== undefined
        && Number.isFinite(Number(value.correlation))
        ? clamp(value.correlation, -1, 1, 0)
        : null,
      gainReductionDb: value.gainReductionDb !== null
        && value.gainReductionDb !== undefined
        && Number.isFinite(Number(value.gainReductionDb))
        ? clamp(value.gainReductionDb, 0, 60, 0)
        : null,
      leftSamples,
      rightSamples
    });
  }

  function normalizeChannels(value) {
    if (!Array.isArray(value)) return Object.freeze([]);
    const received = new Set();
    const channels = [];
    value.slice(0, 64).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const id = String(entry.id || '');
      if (
        !CHANNEL_IDS.has(id)
        || received.has(id)
        || !Number.isFinite(Number(entry.peak))
        || !Number.isFinite(Number(entry.rms))
      ) return;
      received.add(id);
      channels.push(Object.freeze({
        id,
        peak: clamp(entry.peak, 0, 4, 0),
        rms: clamp(entry.rms, 0, 4, 0),
        peakHold: clamp(entry.peakHold, 0, 4, clamp(entry.peak, 0, 4, 0)),
        azimuthDeg: Number.isFinite(Number(entry.azimuthDeg))
          ? clamp(entry.azimuthDeg, -180, 180, 0)
          : null
      }));
    });
    channels.sort((left, right) => (
      CHANNELS.findIndex((channel) => channel.id === left.id)
        - CHANNELS.findIndex((channel) => channel.id === right.id)
    ));
    return Object.freeze(channels);
  }

  function unavailableChannelRouter() {
    return Object.freeze({
      revision: null,
      layout: '',
      algorithm: '',
      available: false,
      actual: false,
      active: false,
      controlAvailable: false,
      availability: 'unavailable',
      activeRevision: 0,
      stagedRevision: 0,
      lastResult: 0,
      layoutPending: false,
      transitionPending: false,
      output: '',
      processCalls: 0,
      physicalMultichannel: false,
      channels: Object.freeze([])
    });
  }

  function strictRouterArray(value, length, minimum, maximum) {
    if (!Array.isArray(value) || value.length !== length) return null;
    const numbers = value.map(Number);
    if (numbers.some((entry) => !Number.isFinite(entry) || entry < minimum || entry > maximum)) return null;
    return numbers;
  }

  function normalizeChannelRouter(value) {
    if (!value || typeof value !== 'object') return unavailableChannelRouter();
    const revision = Number(value.revision);
    const layout = value.layout === '7.1' ? '7.1' : value.layout === '5.1' ? '5.1' : '';
    const expectedOrder = ROUTER_LAYOUTS[layout];
    if (
      !Number.isSafeInteger(revision)
      || revision < 0
      || !expectedOrder
      || !Array.isArray(value.channelOrder)
      || value.channelOrder.length !== expectedOrder.length
      || value.channelOrder.some((entry, index) => entry !== expectedOrder[index])
      || !ROUTER_ALGORITHMS.has(value.algorithm)
      || !strictRouterArray(value.channelGainDb, 8, -60, 12)
      || !strictRouterArray(value.channelDelayMs, 8, 0, 250)
      || !strictRouterArray(value.channelAzimuthDeg, 8, -180, 180)
      || !strictRouterArray(value.customMatrix, 16, -2, 2)
    ) return unavailableChannelRouter();
    const available = value.available === true;
    const actual = value.actual === true;
    const availability = typeof value.availability === 'string'
      && /^[a-z0-9-]{1,64}$/u.test(value.availability)
      ? value.availability
      : (actual ? 'available' : 'native-route-not-connected');
    const activeRevision = Number.isSafeInteger(Number(value.activeRevision)) && Number(value.activeRevision) >= 0
      ? Number(value.activeRevision)
      : 0;
    const stagedRevision = Number.isSafeInteger(Number(value.stagedRevision)) && Number(value.stagedRevision) >= 0
      ? Number(value.stagedRevision)
      : 0;
    const lastResult = Number.isSafeInteger(Number(value.lastResult))
      && Number(value.lastResult) >= -1_000_000
      && Number(value.lastResult) <= 1_000_000
      ? Number(value.lastResult)
      : 0;
    const layoutPending = value.layoutPending === true;
    const transitionPending = value.transitionPending === true || layoutPending;
    const peak = strictRouterArray(value.channelPeak, 8, 0, 4);
    const rms = strictRouterArray(value.channelRms, 8, 0, 4);
    const azimuth = strictRouterArray(
      value.channelTelemetryAzimuthDeg || value.channelAzimuthDeg,
      8,
      -180,
      180
    );
    const channels = available && actual && peak && rms && azimuth
      ? expectedOrder.map((apiId, index) => Object.freeze({
          id: ROUTER_CHANNEL_IDS[apiId],
          peak: peak[index],
          rms: rms[index],
          peakHold: peak[index],
          azimuthDeg: azimuth[index]
        }))
      : [];
    return Object.freeze({
      revision,
      layout,
      algorithm: value.algorithm,
      available,
      actual,
      active: value.active === true,
      controlAvailable: value.controlAvailable !== false,
      availability,
      activeRevision,
      stagedRevision,
      lastResult,
      layoutPending,
      transitionPending,
      output: ROUTER_OUTPUTS.has(value.output) ? value.output : '',
      processCalls: Number.isSafeInteger(Number(value.processCalls)) && Number(value.processCalls) >= 0
        ? Number(value.processCalls)
        : 0,
      physicalMultichannel: false,
      channels: Object.freeze(channels)
    });
  }

  function normalizePlayback(value) {
    if (!value || typeof value !== 'object') return null;
    const durationSeconds = clamp(value.durationSeconds, 0, 60 * 60 * 24, 0);
    if (durationSeconds <= 0) return null;
    return Object.freeze({
      durationSeconds,
      positionSeconds: clamp(value.positionSeconds, 0, durationSeconds, 0),
      seeking: value.seeking === true
    });
  }

  function normalizeTelemetryStage(value, fallback = 'unknown') {
    return TELEMETRY_STAGES.has(value) ? value : fallback;
  }

  function unavailableTelemetry(reason = 'telemetry-unavailable', stage = 'unavailable') {
    return Object.freeze({
      available: false,
      reason,
      stage: normalizeTelemetryStage(stage, stage === 'unavailable' ? 'unavailable' : 'unknown'),
      sequence: 0,
      timestampMs: 0,
      sampleRate: 0,
      stereo: null,
      spectrum: null,
      waveform: null,
      playback: null,
      channels: Object.freeze([])
    });
  }

  function normalizeTelemetry(value) {
    if (!value || typeof value !== 'object' || value.available !== true) {
      const reason = typeof value?.reason === 'string' && value.reason.length <= 64
        ? value.reason
        : 'telemetry-unavailable';
      return unavailableTelemetry(reason, value?.stage);
    }
    const sequence = Number(value.sequence);
    const sampleRate = Number(value.sampleRate);
    return Object.freeze({
      available: true,
      reason: '',
      stage: normalizeTelemetryStage(value.stage),
      sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0,
      timestampMs: clamp(value.timestampMs, 0, Number.MAX_SAFE_INTEGER, 0),
      sampleRate: Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 384000
        ? sampleRate
        : 0,
      stereo: normalizeStereo(value.stereo),
      spectrum: boundedArray(value.spectrum, MAX_SPECTRUM_BINS, 0, 1),
      waveform: boundedArray(value.waveform, MAX_WAVEFORM_SAMPLES, -1, 1),
      playback: normalizePlayback(value.playback),
      channels: normalizeChannels(value.channels)
    });
  }

  function safeStorage(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
    return storage;
  }

  function defaultLayout() {
    return MODULES.map((module, order) => ({
      id: module.id,
      order,
      visible: true,
      collapsed: false,
      size: 'normal'
    }));
  }

  function normalizeLayout(value) {
    const fallback = defaultLayout();
    if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.modules)) {
      return fallback;
    }
    const received = new Map();
    value.modules.slice(0, MODULES.length * 2).forEach((entry) => {
      if (!entry || typeof entry !== 'object' || !MODULE_IDS.has(entry.id) || received.has(entry.id)) return;
      received.set(entry.id, {
        id: entry.id,
        order: clamp(entry.order, 0, MODULES.length - 1, MODULES.length - 1),
        visible: entry.visible !== false,
        collapsed: entry.collapsed === true,
        size: SIZE_STATES.includes(entry.size) ? entry.size : 'normal'
      });
    });
    fallback.forEach((entry) => {
      if (!received.has(entry.id)) received.set(entry.id, entry);
    });
    return [...received.values()]
      .sort((left, right) => left.order - right.order || MODULES.findIndex((entry) => entry.id === left.id)
        - MODULES.findIndex((entry) => entry.id === right.id))
      .map((entry, order) => ({ ...entry, order }));
  }

  function loadLayout(storage) {
    if (!storage) return defaultLayout();
    try {
      const serialized = storage.getItem(LAYOUT_STORAGE_KEY);
      return serialized ? normalizeLayout(JSON.parse(serialized)) : defaultLayout();
    } catch {
      return defaultLayout();
    }
  }

  function normalizeAutomationPoint(value, definition) {
    if (!value || typeof value !== 'object') return null;
    const time = clamp(value.time, 0, 1, -1);
    if (time < 0) return null;
    const raw = clamp(value.value, definition.min, definition.max, definition.min);
    const stepped = Math.round(raw / definition.step) * definition.step;
    return Object.freeze({
      time: Math.round(time * 10000) / 10000,
      value: Math.round(stepped * 10000) / 10000
    });
  }

  function normalizeAutomation(value) {
    const selectedParameter = AUTOMATION_PARAMETER_KEYS.has(value?.selectedParameter)
      ? value.selectedParameter
      : AUTOMATION_PARAMETERS[0].key;
    const tracks = {};
    if (value?.version === 1 && Array.isArray(value.tracks)) {
      value.tracks.slice(0, AUTOMATION_PARAMETERS.length).forEach((track) => {
        if (!track || !AUTOMATION_PARAMETER_KEYS.has(track.parameter) || tracks[track.parameter]) return;
        const definition = AUTOMATION_PARAMETERS.find((entry) => entry.key === track.parameter);
        const points = Array.isArray(track.points)
          ? track.points.slice(0, 128).map((point) => normalizeAutomationPoint(point, definition)).filter(Boolean)
          : [];
        tracks[track.parameter] = points.sort((left, right) => left.time - right.time);
      });
    }
    return {
      enabled: value?.enabled === true,
      selectedParameter,
      tracks
    };
  }

  function loadAutomation(storage) {
    if (!storage) return normalizeAutomation(null);
    try {
      const serialized = storage.getItem(AUTOMATION_STORAGE_KEY);
      return normalizeAutomation(serialized ? JSON.parse(serialized) : null);
    } catch {
      return normalizeAutomation(null);
    }
  }

  function dbfs(amplitude) {
    if (!(amplitude > 0)) return '−∞';
    const value = 20 * Math.log10(amplitude);
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  }

  function timecode(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function createMediaElementTelemetrySource(mediaElement, options = {}) {
    if (!mediaElement || typeof mediaElement.addEventListener !== 'function') {
      throw new TypeError('HTMLMediaElement telemetry source requires a media element');
    }
    const listeners = new Set();
    const requestFrame = typeof options.requestAnimationFrame === 'function'
      ? options.requestAnimationFrame
      : global.requestAnimationFrame?.bind(global);
    const cancelFrame = typeof options.cancelAnimationFrame === 'function'
      ? options.cancelAnimationFrame
      : global.cancelAnimationFrame?.bind(global);
    const isActive = typeof options.isActive === 'function' ? options.isActive : () => true;
    const audioContextFactory = typeof options.audioContextFactory === 'function'
      ? options.audioContextFactory
      : () => {
          const Context = global.AudioContext || global.webkitAudioContext;
          if (typeof Context !== 'function') throw new Error('web-audio-unavailable');
          return new Context({ latencyHint: 'playback' });
        };
    let graph = null;
    let graphPromise = null;
    let graphGeneration = 0;
    let destroyed = false;
    let frameId = 0;
    let idleTimer = 0;
    let sequence = 0;
    let lastHoldUpdateMs = 0;
    let lastAutomaticSampleMs = 0;
    let signalWaitStartedMs = 0;
    let signalObserved = false;
    const peakHold = [0, 0];

    function mediaCanPlay() {
      return !destroyed
        && mediaElement.paused !== true
        && mediaElement.ended !== true
        && Number(mediaElement.readyState) >= 2;
    }

    function publish(value) {
      const telemetry = normalizeTelemetry(value);
      listeners.forEach((listener) => {
        try { listener(telemetry); } catch {}
      });
      return telemetry.available;
    }

    function disposeGraph(target) {
      if (!target || target.disposed === true) return false;
      target.disposed = true;
      ['source', 'splitter', 'spectrumAnalyser', 'leftAnalyser', 'rightAnalyser', 'silentSink']
        .forEach((key) => { try { target[key]?.disconnect?.(); } catch {} });
      try { target.context?.close?.(); } catch {}
      return true;
    }

    async function suspendGraph() {
      const current = graph;
      if (!current || current.disposed === true || current.context?.state !== 'running') return false;
      try {
        await current.context.suspend?.();
        return true;
      } catch {
        return false;
      }
    }

    function resetSourceGraph() {
      if (destroyed) return false;
      graphGeneration += 1;
      const previousGraph = graph;
      graph = null;
      graphPromise = null;
      disposeGraph(previousGraph);
      signalWaitStartedMs = 0;
      signalObserved = false;
      lastHoldUpdateMs = 0;
      peakHold[0] = 0;
      peakHold[1] = 0;
      clearScheduled();
      publish({ available: false, reason: 'media-source-changing', stage: 'media-input' });
      schedule();
      return true;
    }

    async function ensureGraph() {
      if (graph) return graph;
      if (graphPromise) return graphPromise;
      const requestedGeneration = graphGeneration;
      const pendingGraph = (async () => {
        const capture = mediaElement.captureStream || mediaElement.mozCaptureStream;
        if (typeof capture !== 'function') throw new Error('media-capture-unavailable');
        const stream = capture.call(mediaElement);
        if (!stream || !stream.getAudioTracks?.().length) throw new Error('media-audio-track-unavailable');
        const context = audioContextFactory();
        let candidate = null;
        try {
          const source = context.createMediaStreamSource(stream);
          const splitter = context.createChannelSplitter(2);
          const spectrumAnalyser = context.createAnalyser();
          spectrumAnalyser.fftSize = 256;
          spectrumAnalyser.smoothingTimeConstant = 0.72;
          const leftAnalyser = context.createAnalyser();
          const rightAnalyser = context.createAnalyser();
          leftAnalyser.fftSize = 1024;
          rightAnalyser.fftSize = 1024;
          leftAnalyser.smoothingTimeConstant = 0;
          rightAnalyser.smoothingTimeConstant = 0;
          const silentSink = context.createGain();
          silentSink.gain.value = 0;
          candidate = {
            generation: requestedGeneration,
            disposed: false,
            context,
            source,
            splitter,
            spectrumAnalyser,
            leftAnalyser,
            rightAnalyser,
            silentSink,
            spectrumDb: new Float32Array(MAX_SPECTRUM_BINS),
            leftSamples: new Float32Array(MAX_WAVEFORM_SAMPLES),
            rightSamples: new Float32Array(MAX_WAVEFORM_SAMPLES)
          };
          source.connect(spectrumAnalyser);
          source.connect(splitter);
          splitter.connect(leftAnalyser, 0);
          splitter.connect(rightAnalyser, 1);
          spectrumAnalyser.connect(silentSink);
          leftAnalyser.connect(silentSink);
          rightAnalyser.connect(silentSink);
          silentSink.connect(context.destination);
          if (context.state === 'suspended') await context.resume();
          if (destroyed || requestedGeneration !== graphGeneration) {
            disposeGraph(candidate);
            throw new Error('media-source-generation-changed');
          }
          graph = candidate;
          return candidate;
        } catch (error) {
          if (candidate) disposeGraph(candidate);
          else {
            try { context?.close?.(); } catch {}
          }
          throw error;
        }
      })();
      graphPromise = pendingGraph;
      try {
        return await pendingGraph;
      } finally {
        if (graphPromise === pendingGraph) graphPromise = null;
      }
    }

    function analyseStereo(left, right) {
      let leftPeak = 0;
      let rightPeak = 0;
      let leftEnergy = 0;
      let rightEnergy = 0;
      let crossEnergy = 0;
      const waveform = new Array(Math.min(left.length, right.length));
      for (let index = 0; index < waveform.length; index += 1) {
        const leftValue = clamp(left[index], -1, 1, 0);
        const rightValue = clamp(right[index], -1, 1, 0);
        leftPeak = Math.max(leftPeak, Math.abs(leftValue));
        rightPeak = Math.max(rightPeak, Math.abs(rightValue));
        leftEnergy += leftValue * leftValue;
        rightEnergy += rightValue * rightValue;
        crossEnergy += leftValue * rightValue;
        waveform[index] = (leftValue + rightValue) * 0.5;
      }
      const divisor = Math.max(1, waveform.length);
      const leftRms = Math.sqrt(leftEnergy / divisor);
      const rightRms = Math.sqrt(rightEnergy / divisor);
      const correlationDenominator = Math.sqrt(leftEnergy * rightEnergy);
      const correlation = correlationDenominator > 1e-12
        ? clamp(crossEnergy / correlationDenominator, -1, 1, 0)
        : 0;
      const now = Date.now();
      const elapsedSeconds = lastHoldUpdateMs ? Math.min(1, (now - lastHoldUpdateMs) / 1000) : 0;
      lastHoldUpdateMs = now;
      peakHold[0] = Math.max(leftPeak, peakHold[0] - elapsedSeconds * 0.7);
      peakHold[1] = Math.max(rightPeak, peakHold[1] - elapsedSeconds * 0.7);
      return {
        peak: [leftPeak, rightPeak],
        rms: [leftRms, rightRms],
        peakHold: [...peakHold],
        correlation,
        leftSamples: Array.from(left),
        rightSamples: Array.from(right),
        waveform
      };
    }

    async function sampleNow() {
      if (!mediaCanPlay()) {
        publish({ available: false, reason: 'media-not-playing', stage: 'media-input' });
        await suspendGraph();
        return false;
      }
      if (!isActive()) return false;
      const sampleGeneration = graphGeneration;
      try {
        const current = await ensureGraph();
        if (destroyed || sampleGeneration !== graphGeneration || current.generation !== graphGeneration) return false;
        if (current.context.state === 'suspended') await current.context.resume();
        if (
          destroyed || !isActive() || !mediaCanPlay()
          || sampleGeneration !== graphGeneration || current.generation !== graphGeneration
        ) {
          if (!destroyed && !mediaCanPlay()) {
            publish({ available: false, reason: 'media-not-playing', stage: 'media-input' });
          }
          await suspendGraph();
          return false;
        }
        current.spectrumAnalyser.getFloatFrequencyData(current.spectrumDb);
        current.leftAnalyser.getFloatTimeDomainData(current.leftSamples);
        current.rightAnalyser.getFloatTimeDomainData(current.rightSamples);
        const stereo = analyseStereo(current.leftSamples, current.rightSamples);
        if (!signalObserved) {
          const strongestPeak = Math.max(stereo.peak[0], stereo.peak[1]);
          if (strongestPeak > 0.00001) {
            signalObserved = true;
          } else {
            const now = Date.now();
            if (!signalWaitStartedMs) signalWaitStartedMs = now;
            publish({
              available: false,
              reason: now - signalWaitStartedMs < 1000
                ? 'media-analysis-warming'
                : 'media-signal-unavailable',
              stage: 'media-input'
            });
            return false;
          }
        }
        const spectrum = Array.from(current.spectrumDb, (value) => clamp((value + 100) / 88, 0, 1, 0));
        const durationSeconds = Number(mediaElement.duration);
        const playback = Number.isFinite(durationSeconds) && durationSeconds > 0
          ? {
              positionSeconds: clamp(mediaElement.currentTime, 0, durationSeconds, 0),
              durationSeconds,
              seeking: mediaElement.seeking === true
            }
          : null;
        if (
          destroyed || !isActive() || !mediaCanPlay()
          || sampleGeneration !== graphGeneration || current.generation !== graphGeneration
        ) {
          if (!destroyed && !mediaCanPlay()) {
            publish({ available: false, reason: 'media-not-playing', stage: 'media-input' });
          }
          await suspendGraph();
          return false;
        }
        return publish({
          available: true,
          stage: 'media-input',
          sequence: ++sequence,
          timestampMs: Date.now(),
          sampleRate: current.context.sampleRate,
          stereo: {
            peak: stereo.peak,
            rms: stereo.rms,
            peakHold: stereo.peakHold,
            correlation: stereo.correlation,
            leftSamples: stereo.leftSamples,
            rightSamples: stereo.rightSamples
          },
          spectrum,
          waveform: stereo.waveform,
          playback,
          channels: []
        });
      } catch {
        if (!destroyed && !mediaCanPlay()) {
          publish({ available: false, reason: 'media-not-playing', stage: 'media-input' });
        } else if (!destroyed && sampleGeneration === graphGeneration) {
          publish({ available: false, reason: 'media-analysis-unavailable', stage: 'media-input' });
        }
        return false;
      }
    }

    async function prepare(allowInactive = false) {
      if (!mediaCanPlay() || (!allowInactive && !isActive())) return false;
      try {
        const current = await ensureGraph();
        if (destroyed || !mediaCanPlay()) {
          await suspendGraph();
          return false;
        }
        if (!isActive()) {
          await suspendGraph();
          return false;
        }
        return current?.disposed !== true;
      } catch {
        return false;
      }
    }

    function clearScheduled() {
      if (frameId && typeof cancelFrame === 'function') cancelFrame(frameId);
      if (idleTimer) global.clearTimeout(idleTimer);
      frameId = 0;
      idleTimer = 0;
    }

    function schedule() {
      if (destroyed || listeners.size === 0 || frameId || idleTimer) return;
      if (!isActive() || !mediaCanPlay()) {
        void suspendGraph();
        return;
      }
      const now = global.performance?.now?.() ?? Date.now();
      const remaining = TELEMETRY_INTERVAL_MS - (now - lastAutomaticSampleMs);
      if (remaining > 1) {
        idleTimer = global.setTimeout(() => {
          idleTimer = 0;
          schedule();
        }, remaining);
        return;
      }
      const run = async () => {
        frameId = 0;
        lastAutomaticSampleMs = global.performance?.now?.() ?? Date.now();
        await sampleNow();
        schedule();
      };
      if (typeof requestFrame === 'function') frameId = requestFrame(run);
      else idleTimer = global.setTimeout(() => {
        idleTimer = 0;
        run();
      }, 33);
    }

    function wake() {
      clearScheduled();
      if (!isActive() || !mediaCanPlay()) {
        void suspendGraph();
        return false;
      }
      schedule();
      void prepare();
      return true;
    }

    function wakeForPlayableMedia() {
      clearScheduled();
      if (isActive()) wake();
      else void prepare(true);
    }

    function sleep(reason = 'visual-inactive') {
      clearScheduled();
      if (!destroyed) publish({ available: false, reason, stage: 'media-input' });
      void suspendGraph();
      return true;
    }

    function handlePause() {
      sleep('media-not-playing');
    }

    function handleEnded() {
      sleep('media-not-playing');
    }

    function subscribe(listener) {
      if (destroyed || typeof listener !== 'function') return () => {};
      listeners.add(listener);
      if (isActive() && mediaCanPlay()) schedule();
      else {
        try { listener(unavailableTelemetry('media-not-playing', 'media-input')); } catch {}
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) clearScheduled();
      };
    }

    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      clearScheduled();
      mediaElement.removeEventListener('play', wake);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
      mediaElement.removeEventListener('loadedmetadata', wakeForPlayableMedia);
      mediaElement.removeEventListener('loadeddata', wakeForPlayableMedia);
      mediaElement.removeEventListener('canplay', wakeForPlayableMedia);
      mediaElement.removeEventListener('playing', wakeForPlayableMedia);
      mediaElement.removeEventListener('loadstart', resetSourceGraph);
      mediaElement.removeEventListener('emptied', resetSourceGraph);
      listeners.clear();
      graphGeneration += 1;
      graphPromise = null;
      disposeGraph(graph);
      graph = null;
      return true;
    }

    mediaElement.addEventListener('play', wake);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);
    mediaElement.addEventListener('loadedmetadata', wakeForPlayableMedia);
    mediaElement.addEventListener('loadeddata', wakeForPlayableMedia);
    mediaElement.addEventListener('canplay', wakeForPlayableMedia);
    mediaElement.addEventListener('playing', wakeForPlayableMedia);
    mediaElement.addEventListener('loadstart', resetSourceGraph);
    mediaElement.addEventListener('emptied', resetSourceGraph);
    return Object.freeze({ subscribe, sampleNow, prepare, wake, sleep, destroy });
  }

  function mount(container, options = {}) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new TypeError('Audio mixer visuals container is required');
    }
    const previous = mounted.get(container);
    if (previous) return previous;

    const document = container.ownerDocument || global.document;
    const storage = safeStorage(options.storage || global.localStorage);
    const requestFrame = typeof options.requestAnimationFrame === 'function'
      ? options.requestAnimationFrame
      : global.requestAnimationFrame?.bind(global);
    const cancelFrame = typeof options.cancelAnimationFrame === 'function'
      ? options.cancelAnimationFrame
      : global.cancelAnimationFrame?.bind(global);
    const onParameterChange = typeof options.onParameterChange === 'function'
      ? options.onParameterChange
      : null;
    const onChannelRouterChange = typeof options.onChannelRouterChange === 'function'
      ? options.onChannelRouterChange
      : null;
    const onSeek = typeof options.onSeek === 'function' ? options.onSeek : null;
    const requestTestSignal = typeof options.requestTestSignal === 'function'
      ? options.requestTestSignal
      : null;
    const onAutomationChange = typeof options.onAutomationChange === 'function'
      ? options.onAutomationChange
      : null;
    const instanceId = `fe-mixer-visuals-${++instanceSequence}`;
    const cards = new Map();
    const bodies = new Map();
    const titleNodes = new Map();
    const canvases = new Map();
    const unavailable = new Map();
    const visibilityControls = new Map();
    const channelMeters = new Map();
    const testSignalButtons = new Map();
    const visibleInViewport = new Map(MODULES.map((module) => [module.id, true]));
    const canvasTargets = new Map();
    let layout = loadLayout(storage);
    let automationState = loadAutomation(storage);
    let telemetry = unavailableTelemetry();
    let channelRouter = null;
    let parameters = Object.freeze({
      upmixEnabled: false,
      obrEnabled: false,
      upmixAlgorithm: 'matrix-decode',
      upmixOutputLayout: '5.1',
      obrFilterProfile: 'direct',
      balance: 0
    });
    let frameId = 0;
    let destroyed = false;
    let unsubscribeTelemetry = null;
    let intersectionObserver = null;
    let resizeObserver = null;
    let canvasWorker = null;
    let canvasWorkerReady = false;
    let canvasWorkerReadyTimer = 0;
    const transferredCanvasIds = new Set();
    let panPointerId = null;
    let dragModuleId = '';
    let automationPointerId = null;
    let drawCount = 0;
    let lastSpectrumVectorAt = 0;
    let renderCursor = 0;
    let renderCycleRemaining = 0;
    let automationCanvasTarget = null;

    const root = node(document, 'section', {
      className: 'audio-mixer-visuals',
      attributes: {
        'aria-labelledby': `${instanceId}-title`,
        'aria-describedby': `${instanceId}-telemetry-status`
      },
      dataset: { audioMixerVisuals: '', telemetryState: 'unavailable', telemetryStage: 'unavailable' }
    });
    const header = node(document, 'header', { className: 'audio-mixer-visuals__header' });
    const headingGroup = node(document, 'div', { className: 'audio-mixer-visuals__heading' });
    headingGroup.append(
      node(document, 'h3', { text: '专业监看与空间路由', attributes: { id: `${instanceId}-title` } }),
      node(document, 'p', {
        text: '所有图表只绘制音频引擎提供的实时遥测；未接收到数据时不会生成模拟电平。'
      })
    );
    const telemetryStatus = node(document, 'p', {
      className: 'audio-mixer-visuals__telemetry-status',
      text: '实时遥测不可用',
      attributes: { id: `${instanceId}-telemetry-status`, role: 'status', 'aria-live': 'polite' },
      dataset: { telemetryStatus: '' }
    });
    header.append(headingGroup, telemetryStatus);

    const moduleToolbar = node(document, 'div', {
      className: 'audio-mixer-visuals__toolbar',
      attributes: { role: 'group', 'aria-label': '显示或隐藏监看模块' }
    });
    MODULES.forEach((definition) => {
      const label = node(document, 'label', {
        className: 'audio-mixer-visuals__visibility',
        attributes: { title: `显示或隐藏${definition.title}` }
      });
      const input = node(document, 'input', {
        attributes: { type: 'checkbox', 'aria-label': `显示${definition.title}` },
        dataset: { visualVisibility: definition.id }
      });
      input.type = 'checkbox';
      input.checked = true;
      input.addEventListener('change', () => setModuleVisibility(definition.id, input.checked));
      label.append(input, node(document, 'span', { text: definition.title }));
      moduleToolbar.appendChild(label);
      visibilityControls.set(definition.id, input);
    });

    const grid = node(document, 'div', {
      className: 'audio-mixer-visuals__grid',
      attributes: { 'aria-label': '可拖拽调音监看模块' }
    });

    function makeCanvas(moduleId, label) {
      const canvas = node(document, 'canvas', {
        className: 'audio-mixer-visual-canvas',
        attributes: { role: 'img', 'aria-label': label },
        dataset: { visualCanvas: moduleId }
      });
      canvas.width = 640;
      canvas.height = 240;
      canvases.set(moduleId, canvas);
      return canvas;
    }

    function createModule(definition) {
      const card = node(document, 'section', {
        className: `audio-mixer-visual-card audio-mixer-visual-card--${definition.id}`,
        attributes: { 'aria-labelledby': `${instanceId}-${definition.id}-title` },
        dataset: {
          mixerVisualModule: definition.id,
          collapsed: 'false',
          size: 'normal'
        }
      });
      const cardHeader = node(document, 'header', { className: 'audio-mixer-visual-card__header' });
      const titleGroup = node(document, 'div', { className: 'audio-mixer-visual-card__title' });
      const titleNode = node(document, 'h4', {
        text: definition.title,
        attributes: { id: `${instanceId}-${definition.id}-title` }
      });
      titleGroup.append(
        titleNode,
        node(document, 'p', { text: definition.description })
      );
      const tools = node(document, 'div', {
        className: 'audio-mixer-visual-card__tools',
        attributes: { role: 'group', 'aria-label': `${definition.title}布局操作` }
      });
      const drag = node(document, 'button', {
        className: 'audio-mixer-visual-card__tool audio-mixer-visual-card__drag',
        text: '⋮⋮',
        attributes: {
          type: 'button',
          draggable: 'true',
          title: `拖拽移动${definition.title}`,
          'aria-label': `拖拽移动${definition.title}`
        },
        dataset: { visualDrag: definition.id }
      });
      drag.draggable = true;
      drag.addEventListener('dragstart', (event) => {
        dragModuleId = definition.id;
        event.dataTransfer?.setData('text/plain', definition.id);
        card.dataset.dragging = 'true';
      });
      drag.addEventListener('dragend', () => {
        dragModuleId = '';
        card.dataset.dragging = 'false';
      });
      drag.addEventListener('keydown', (event) => {
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        moveModule(definition.id, event.key === 'ArrowUp' ? -1 : 1);
      });
      const size = node(document, 'button', {
        className: 'audio-mixer-visual-card__tool',
        text: '↔',
        attributes: { type: 'button', title: `调整${definition.title}尺寸`, 'aria-label': `调整${definition.title}尺寸` },
        dataset: { visualSize: definition.id }
      });
      size.addEventListener('click', () => cycleModuleSize(definition.id));
      const collapse = node(document, 'button', {
        className: 'audio-mixer-visual-card__tool',
        text: '⌃',
        attributes: {
          type: 'button',
          title: `折叠${definition.title}`,
          'aria-label': `折叠${definition.title}`,
          'aria-expanded': 'true'
        },
        dataset: { visualCollapse: definition.id }
      });
      collapse.addEventListener('click', () => toggleModuleCollapsed(definition.id));
      tools.append(drag, size, collapse);
      cardHeader.append(titleGroup, tools);
      const body = node(document, 'div', {
        className: 'audio-mixer-visual-card__body',
        dataset: { visualBody: definition.id }
      });
      const unavailableText = node(document, 'p', {
        className: 'audio-mixer-visual-unavailable',
        text: '实时遥测不可用',
        attributes: { role: 'status' },
        dataset: { visualUnavailable: definition.id }
      });
      body.appendChild(unavailableText);
      card.append(cardHeader, body);
      card.addEventListener('dragover', (event) => event.preventDefault());
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer?.getData('text/plain') || dragModuleId;
        reorderModule(sourceId, definition.id);
      });
      cards.set(definition.id, card);
      bodies.set(definition.id, body);
      titleNodes.set(definition.id, titleNode);
      unavailable.set(definition.id, unavailableText);
      return card;
    }

    MODULES.forEach((definition) => grid.appendChild(createModule(definition)));
    root.append(header, moduleToolbar, grid);
    container.appendChild(root);

    const metersBody = bodies.get('meters');
    const meterRack = node(document, 'div', { className: 'audio-mixer-meter-rack' });
    const meterViews = new Map();
    ['L', 'R'].forEach((channelId) => {
      const strip = node(document, 'div', {
        className: 'audio-mixer-meter-strip',
        attributes: { 'aria-label': `${channelId} 声道峰值与 RMS` }
      });
      const label = node(document, 'strong', { text: channelId });
      const overloadLamp = node(document, 'span', {
        className: 'audio-mixer-overload-lamp',
        text: 'CLIP',
        attributes: { title: '过载指示，峰值达到或超过 0 dBFS 时点亮' },
        dataset: { overloadLamp: channelId }
      });
      const track = node(document, 'div', { className: 'audio-mixer-meter-track', attributes: { 'aria-hidden': 'true' } });
      const rmsFill = node(document, 'i', { className: 'audio-mixer-meter-fill audio-mixer-meter-fill--rms' });
      const peakFill = node(document, 'i', { className: 'audio-mixer-meter-fill audio-mixer-meter-fill--peak' });
      const hold = node(document, 'i', { className: 'audio-mixer-meter-hold' });
      track.append(rmsFill, peakFill, hold);
      const values = node(document, 'div', { className: 'audio-mixer-meter-values' });
      const peakReadout = node(document, 'span', { text: 'Peak —', dataset: { peakReadout: channelId } });
      const rmsReadout = node(document, 'span', { text: 'RMS —', dataset: { rmsReadout: channelId } });
      values.append(peakReadout, rmsReadout);
      strip.append(label, overloadLamp, track, values);
      meterRack.appendChild(strip);
      meterViews.set(channelId, { overloadLamp, rmsFill, peakFill, hold, peakReadout, rmsReadout });
    });
    const reduction = node(document, 'div', {
      className: 'audio-mixer-gain-reduction',
      attributes: { title: '动态处理器当前增益衰减' }
    });
    const reductionBar = node(document, 'i', { className: 'audio-mixer-gain-reduction__bar' });
    const reductionText = node(document, 'span', { text: 'GR —', dataset: { gainReduction: '' } });
    reduction.append(reductionBar, reductionText);
    metersBody.append(meterRack, reduction);

    const spectrumBody = bodies.get('spectrum');
    const spectrumVector = vectorNode(document, 'svg');
    spectrumVector.setAttribute('class', 'audio-mixer-visual-vector');
    spectrumVector.setAttribute('viewBox', '0 0 640 240');
    spectrumVector.setAttribute('preserveAspectRatio', 'none');
    spectrumVector.setAttribute('role', 'img');
    spectrumVector.setAttribute('aria-label', '实时频谱，横轴 20 Hz 到 20 kHz，纵轴为归一化能量');
    spectrumVector.dataset.visualVector = 'spectrum';
    const spectrumVectorGrid = vectorNode(document, 'path');
    spectrumVectorGrid.setAttribute('class', 'audio-mixer-spectrum-vector__grid');
    spectrumVectorGrid.setAttribute('vector-effect', 'non-scaling-stroke');
    spectrumVectorGrid.setAttribute('d', [
      'M 64 0 V 240', 'M 128 0 V 240', 'M 192 0 V 240', 'M 256 0 V 240',
      'M 320 0 V 240', 'M 384 0 V 240', 'M 448 0 V 240', 'M 512 0 V 240',
      'M 576 0 V 240', 'M 0 60 H 640', 'M 0 120 H 640', 'M 0 180 H 640'
    ].join(' '));
    const spectrumVectorPath = vectorNode(document, 'path');
    spectrumVectorPath.setAttribute('class', 'audio-mixer-spectrum-vector__path');
    spectrumVectorPath.setAttribute('vector-effect', 'non-scaling-stroke');
    spectrumVector.append(spectrumVectorGrid, spectrumVectorPath);
    spectrumBody.append(
      spectrumVector,
      node(document, 'div', { className: 'audio-mixer-visual-scale', text: '20 Hz · 100 · 1k · 10k · 20 kHz' })
    );

    const stereoBody = bodies.get('stereo-field');
    const correlation = node(document, 'output', {
      className: 'audio-mixer-correlation',
      text: '相关度 —',
      attributes: { 'aria-live': 'polite' },
      dataset: { correlationReadout: '' }
    });
    stereoBody.append(makeCanvas('stereo-field', '实时立体声声像与相位图'), correlation);

    const surroundBody = bodies.get('surround');
    surroundBody.append(
      makeCanvas('surround', '环绕声场雷达，显示虚拟声道实时能量'),
      node(document, 'p', {
        className: 'audio-mixer-channel-order-note',
        text: '路由顺序：FL · FR · FC · LFE · BL · BR · SL · SR（界面别名 L/R/C/LFE/Lb/Rb/Ls/Rs）'
      })
    );

    const waveformBody = bodies.get('waveform');
    const waveformCanvas = makeCanvas('waveform', '波形与播放进度预览');
    waveformCanvas.setAttribute('tabindex', '0');
    if (onSeek) {
      waveformCanvas.setAttribute('role', 'slider');
      waveformCanvas.setAttribute('aria-label', '拖动或点击波形定位播放进度');
      waveformCanvas.setAttribute('aria-valuemin', '0');
      waveformCanvas.setAttribute('aria-valuemax', '100');
    }
    const playbackReadout = node(document, 'output', {
      className: 'audio-mixer-playback-readout',
      text: '— / —',
      attributes: { 'aria-live': 'polite' },
      dataset: { playbackReadout: '' }
    });
    waveformCanvas.addEventListener('pointerdown', (event) => {
      if (!onSeek || !telemetry.playback) return;
      const bounds = waveformCanvas.getBoundingClientRect();
      const ratio = clamp((Number(event.clientX) - bounds.left) / Math.max(1, bounds.width), 0, 1, 0);
      onSeek(ratio);
    });
    waveformCanvas.addEventListener('keydown', (event) => {
      if (!onSeek || !telemetry.playback || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = telemetry.playback.positionSeconds / telemetry.playback.durationSeconds;
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? 1
          : clamp(current + (event.key === 'ArrowRight' ? 0.01 : -0.01), 0, 1, 0);
      onSeek(next);
    });
    waveformBody.append(waveformCanvas, playbackReadout);

    const spatialBody = bodies.get('spatial');
    const physicalOutput = node(document, 'p', {
      className: 'audio-mixer-spatial-boundary',
      text: 'OBR：虚拟 5.1 / 7.1 channel bed → 双耳 2.0；物理输出为 2ch，建议使用耳机。',
      attributes: { role: 'note' },
      dataset: { physicalOutput: '2', renderer: 'headphones' }
    });
    const spatialControls = node(document, 'div', { className: 'audio-mixer-spatial-controls' });

    function createSpatialToggle(key, labelText, datasetKey) {
      const label = node(document, 'label', { className: 'audio-mixer-spatial-toggle', attributes: { title: labelText } });
      const input = node(document, 'input', {
        attributes: { type: 'checkbox', 'aria-label': labelText },
        dataset: { [datasetKey]: '' }
      });
      input.type = 'checkbox';
      input.addEventListener('change', () => {
        updateParameters({ ...parameters, [key]: input.checked });
        onParameterChange?.(key, input.checked);
      });
      label.append(input, node(document, 'span', { text: labelText }));
      spatialControls.appendChild(label);
      return input;
    }

    function createSpatialSelect(labelText, datasetKey, entries, parameterKey, channelPatchKey = '') {
      const label = node(document, 'label', {
        className: 'audio-mixer-spatial-select',
        attributes: { title: labelText }
      });
      label.appendChild(node(document, 'span', { text: labelText }));
      const select = node(document, 'select', {
        attributes: { 'aria-label': labelText },
        dataset: { [datasetKey]: '' }
      });
      entries.forEach((entry) => {
        const option = node(document, 'option', {
          text: entry.label,
          attributes: entry.title ? { title: entry.title } : {}
        });
        option.value = entry.value;
        option.disabled = entry.disabled === true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        if (channelPatchKey && onChannelRouterChange) {
          const nextParameters = channelPatchKey === 'layout'
            ? { ...parameters, upmixOutputLayout: select.value }
            : { ...parameters, upmixAlgorithm: select.value };
          parameters = Object.freeze(nextParameters);
          updateRoute();
          onChannelRouterChange(Object.freeze({ [channelPatchKey]: select.value }));
          return;
        }
        updateParameters({ ...parameters, [parameterKey]: select.value });
        onParameterChange?.(parameterKey, select.value);
      });
      label.appendChild(select);
      spatialControls.appendChild(label);
      return select;
    }

    const upmixToggle = createSpatialToggle('upmixEnabled', '启用上混', 'spatialUpmixEnabled');
    const obrToggle = createSpatialToggle('obrEnabled', '启用 OBR', 'spatialObrEnabled');
    const layoutSelect = createSpatialSelect('虚拟声床', 'spatialLayout', [
      { value: '5.1', label: '5.1（L/R/C/LFE/Ls/Rs）' },
      { value: '7.1', label: '7.1（增加 Lb/Rb）' }
    ], 'upmixOutputLayout', 'layout');
    const algorithmSelect = createSpatialSelect('上混算法', 'spatialAlgorithm', [
      { value: 'front-only', label: 'Pass-through（前置直达）' },
      { value: 'matrix-decode', label: 'Matrix Decode（保真）' },
      { value: 'ambient-extract', label: 'Ambient Extract' },
      { value: 'custom-matrix', label: 'Custom Matrix' },
      { value: 'passive', label: 'Passive FFT（实验说明）', disabled: true, title: 'Passive FFT 是实验上混，不等同前置直达' },
      { value: 'dolby-pro-logic-iix', label: 'Dolby Pro Logic II/IIx（需授权）', disabled: true, title: '专有授权算法，FE Monster 未内置' },
      { value: 'dts-neural-x', label: 'DTS Neural:X（需授权）', disabled: true, title: '专有授权算法，FE Monster 未内置' }
    ], 'upmixAlgorithm', 'algorithm');
    const obrProfileSelect = createSpatialSelect('OBR 滤波', 'spatialObrProfile', [
      { value: 'direct', label: 'Direct（保真）' },
      { value: 'ambient', label: 'Ambient' },
      { value: 'reverberant', label: 'Reverberant' }
    ], 'obrFilterProfile');

    const routeSummary = node(document, 'p', {
      className: 'audio-mixer-route-summary',
      text: 'Stereo → Mixer → 2ch',
      attributes: { role: 'status', 'aria-live': 'polite' },
      dataset: { routeSummary: '' }
    });
    const routeGraph = node(document, 'div', {
      className: 'audio-mixer-route-graph',
      attributes: { role: 'img', 'aria-label': '上混、Mixer、OBR 与输出声道的连接路由' }
    });
    const routeCore = node(document, 'div', { className: 'audio-mixer-route-core' });
    const routeNodes = new Map();
    [
      ['input', 'Stereo in'],
      ['upmix', 'Upmix'],
      ['mixer', 'Mixer'],
      ['obr', 'OBR → 2ch']
    ].forEach(([id, label]) => {
      const routeNode = node(document, 'span', {
        className: 'audio-mixer-route-node',
        text: label,
        dataset: { routeNode: id }
      });
      routeCore.appendChild(routeNode);
      routeNodes.set(id, routeNode);
    });
    const routeOutputs = node(document, 'div', { className: 'audio-mixer-route-outputs' });
    CHANNELS.forEach((channel) => {
      const routeNode = node(document, 'span', {
        className: 'audio-mixer-route-node audio-mixer-route-node--channel',
        text: channel.label,
        dataset: { routeNode: channel.id }
      });
      routeOutputs.appendChild(routeNode);
      routeNodes.set(channel.id, routeNode);
    });
    routeGraph.append(routeCore, routeOutputs);

    const channelRack = node(document, 'div', {
      className: 'audio-mixer-channel-meter-rack',
      attributes: { role: 'group', 'aria-label': '5.1 与 7.1 虚拟声道实时电平' }
    });
    CHANNELS.forEach((channel) => {
      const strip = node(document, 'div', {
        className: 'audio-mixer-channel-meter',
        attributes: { title: `${channel.label} 峰值与 RMS` },
        dataset: { channelMeter: channel.id }
      });
      const peak = node(document, 'i', { className: 'audio-mixer-channel-meter__peak' });
      const rms = node(document, 'i', { className: 'audio-mixer-channel-meter__rms' });
      const levelOutput = node(document, 'output', { text: '—', dataset: { channelLevel: channel.id } });
      const testButton = node(document, 'button', {
        className: 'audio-mixer-channel-test',
        text: 'TEST',
        attributes: {
          type: 'button',
          title: requestTestSignal ? `播放 ${channel.label} 有界测试信号` : '测试信号后端不可用',
          'aria-label': `测试 ${channel.label} 声道`
        },
        dataset: { testSignalButton: channel.id }
      });
      testButton.disabled = true;
      testButton.addEventListener('click', async () => {
        if (!requestTestSignal || testButton.disabled) return;
        const previousText = testButton.textContent;
        testButton.disabled = true;
        testButton.textContent = '…';
        testSignalState.textContent = `正在请求 ${channel.label} 测试信号…`;
        try {
          const accepted = await requestTestSignal(Object.freeze({
            channel: channel.id,
            layout: parameters.upmixOutputLayout,
            durationMs: 500,
            levelDb: -18
          }));
          testSignalState.textContent = accepted === true
            ? `${channel.label} 测试信号已交给音频后端`
            : `${channel.label} 测试信号未被音频后端接受`;
        } catch {
          testSignalState.textContent = `${channel.label} 测试信号请求失败，音频链保持原状态`;
        } finally {
          testButton.textContent = previousText;
          updateRoute();
        }
      });
      strip.append(
        node(document, 'span', { text: channel.label }),
        node(document, 'b', { className: 'audio-mixer-channel-meter__track', attributes: { 'aria-hidden': 'true' } }),
        peak,
        rms,
        levelOutput,
        testButton
      );
      channelRack.appendChild(strip);
      channelMeters.set(channel.id, { strip, peak, rms, output: levelOutput });
      testSignalButtons.set(channel.id, testButton);
    });
    const testSignalState = node(document, 'p', {
      className: 'audio-mixer-test-signal-state',
      text: requestTestSignal
        ? '等待真实逐声道路由；测试入口暂不可用。'
        : '多声道测试信号不可用：音频后端未提供测试入口。',
      attributes: { role: 'status', 'aria-live': 'polite' },
      dataset: { testSignalState: 'unavailable' }
    });

    const panGroup = node(document, 'div', { className: 'audio-mixer-pan-group' });
    panGroup.appendChild(node(document, 'span', { className: 'audio-mixer-pan-label', text: '声像位置（平衡）' }));
    const panSurface = node(document, 'div', {
      className: 'audio-mixer-pan-surface',
      attributes: {
        role: 'presentation',
        title: '拖拽调整左右声像；纵向只用于视觉定位，不提交虚构的深度参数'
      },
      dataset: { spatialPanSurface: '' }
    });
    const panHandle = node(document, 'button', {
      className: 'audio-mixer-pan-handle',
      text: '●',
      attributes: {
        type: 'button',
        role: 'slider',
        'aria-label': '左右声像位置',
        'aria-valuemin': '-1',
        'aria-valuemax': '1',
        'aria-valuenow': '0',
        title: '拖拽或使用左右方向键调整声像'
      },
      dataset: { spatialPanHandle: '' }
    });
    panSurface.appendChild(panHandle);
    const panReadout = node(document, 'output', { text: 'C 0.00', dataset: { spatialPanReadout: '' } });
    panGroup.append(panSurface, panReadout);

    function submitPanFromPointer(event) {
      const bounds = panSurface.getBoundingClientRect();
      const balance = Math.round(clamp(((Number(event.clientX) - bounds.left) / Math.max(1, bounds.width)) * 2 - 1, -1, 1, 0) * 100) / 100;
      parameters = Object.freeze({ ...parameters, balance });
      updatePan(balance);
      onParameterChange?.('balance', balance);
    }
    panSurface.addEventListener('pointerdown', (event) => {
      panPointerId = event.pointerId;
      panSurface.setPointerCapture?.(event.pointerId);
      submitPanFromPointer(event);
    });
    panSurface.addEventListener('pointermove', (event) => {
      if (panPointerId === null || event.pointerId !== panPointerId) return;
      submitPanFromPointer(event);
    });
    const finishPan = (event) => {
      if (panPointerId === null || event.pointerId !== panPointerId) return;
      panSurface.releasePointerCapture?.(event.pointerId);
      panPointerId = null;
    };
    panSurface.addEventListener('pointerup', finishPan);
    panSurface.addEventListener('pointercancel', finishPan);
    panHandle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = clamp(parameters.balance, -1, 1, 0);
      const next = event.key === 'Home' ? -1
        : event.key === 'End' ? 1
          : Math.round(clamp(current + (event.key === 'ArrowRight' ? 0.05 : -0.05), -1, 1, 0) * 100) / 100;
      parameters = Object.freeze({ ...parameters, balance: next });
      updatePan(next);
      onParameterChange?.('balance', next);
    });

    const automation = node(document, 'section', {
      className: 'audio-mixer-automation-state',
      attributes: { role: 'note', 'aria-label': '参数自动化状态' }
    });
    const automationHeader = node(document, 'div', { className: 'audio-mixer-automation-state__header' });
    const automationStatus = node(document, 'span', {
      text: onAutomationChange
        ? '自动化接口已连接；曲线会提交给宿主音频引擎'
        : '仅预览：实时自动化未启用，不会影响当前音频',
      dataset: { automationState: onAutomationChange ? 'ready' : 'preview-only' }
    });
    automationHeader.append(node(document, 'strong', { text: '参数自动化曲线' }), automationStatus);
    const automationControls = node(document, 'div', { className: 'audio-mixer-automation-controls' });
    const automationEnabledLabel = node(document, 'label', {
      attributes: { title: onAutomationChange ? '启用或禁用当前自动化曲线' : '仅启用曲线预览，不会驱动音频参数' }
    });
    const automationEnabled = node(document, 'input', {
      attributes: { type: 'checkbox', 'aria-label': '启用自动化曲线' },
      dataset: { automationEnabled: '' }
    });
    automationEnabled.type = 'checkbox';
    automationEnabled.checked = automationState.enabled;
    automationEnabledLabel.append(automationEnabled, node(document, 'span', { text: onAutomationChange ? '启用' : '启用预览' }));
    const automationParameter = node(document, 'select', {
      attributes: { 'aria-label': '选择自动化参数', title: '选择要编辑的参数自动化轨道' },
      dataset: { automationParameter: '' }
    });
    AUTOMATION_PARAMETERS.forEach((definition) => {
      const option = node(document, 'option', { text: definition.label });
      option.value = definition.key;
      automationParameter.appendChild(option);
    });
    automationParameter.value = automationState.selectedParameter;
    const automationTimeLabel = node(document, 'label', { attributes: { title: '归一化时间，范围 0 到 1' } });
    const automationTimeInput = node(document, 'input', {
      attributes: {
        type: 'number', min: '0', max: '1', step: '0.01', inputmode: 'decimal',
        'aria-label': '自动化控制点时间'
      },
      dataset: { automationTimeInput: '' }
    });
    automationTimeInput.type = 'number';
    automationTimeInput.min = '0';
    automationTimeInput.max = '1';
    automationTimeInput.step = '0.01';
    automationTimeInput.value = '0.5';
    automationTimeLabel.append(node(document, 'span', { text: '时间' }), automationTimeInput);
    const automationValueLabel = node(document, 'label', { attributes: { title: '当前参数的控制点数值' } });
    const automationValueInput = node(document, 'input', {
      attributes: { type: 'number', inputmode: 'decimal', 'aria-label': '自动化控制点数值' },
      dataset: { automationValueInput: '' }
    });
    automationValueInput.type = 'number';
    automationValueLabel.append(node(document, 'span', { text: '数值' }), automationValueInput);
    const automationAdd = node(document, 'button', {
      text: '添加点',
      attributes: { type: 'button', title: '按输入的时间和值添加一个控制点' },
      dataset: { automationAdd: '' }
    });
    const automationClear = node(document, 'button', {
      text: '清除曲线',
      attributes: { type: 'button', title: '清除当前参数的自动化预览点' },
      dataset: { automationClear: '' }
    });
    automationControls.append(
      automationEnabledLabel,
      automationParameter,
      automationTimeLabel,
      automationValueLabel,
      automationAdd,
      automationClear
    );
    const automationCanvas = node(document, 'canvas', {
      className: 'audio-mixer-automation-canvas',
      attributes: {
        role: 'application',
        tabindex: '0',
        'aria-label': '参数自动化曲线编辑器，横轴为归一化时间 0 到 1，纵轴为参数值',
        title: '拖拽绘制：时间 0..1 → 当前参数值'
      },
      dataset: { automationCanvas: '' }
    });
    automationCanvas.width = 640;
    automationCanvas.height = 180;
    const automationReadout = node(document, 'output', {
      text: '暂无控制点',
      attributes: { 'aria-live': 'polite' },
      dataset: { automationReadout: '' }
    });
    automation.append(automationHeader, automationControls, automationCanvas, automationReadout);

    automationEnabled.addEventListener('change', () => {
      automationState.enabled = automationEnabled.checked;
      saveAutomation();
      notifyAutomationChange();
    });
    automationParameter.addEventListener('change', () => {
      if (!AUTOMATION_PARAMETER_KEYS.has(automationParameter.value)) return;
      automationState.selectedParameter = automationParameter.value;
      saveAutomation();
      syncAutomationNumericInputs();
      drawAutomation();
    });
    automationAdd.addEventListener('click', () => {
      if (!addAutomationPoint(automationTimeInput.value, automationValueInput.value)) return;
      notifyAutomationChange();
    });
    automationClear.addEventListener('click', () => {
      automationState.tracks[automationState.selectedParameter] = [];
      saveAutomation();
      drawAutomation();
      notifyAutomationChange();
    });
    automationCanvas.addEventListener('pointerdown', (event) => {
      automationPointerId = event.pointerId;
      automationCanvas.setPointerCapture?.(event.pointerId);
      recordAutomationPoint(event, false);
    });
    automationCanvas.addEventListener('pointermove', (event) => {
      if (automationPointerId === null || event.pointerId !== automationPointerId) return;
      recordAutomationPoint(event, false);
    });
    const finishAutomation = (event) => {
      if (automationPointerId === null || event.pointerId !== automationPointerId) return;
      automationCanvas.releasePointerCapture?.(event.pointerId);
      automationPointerId = null;
      saveAutomation();
      notifyAutomationChange();
    };
    automationCanvas.addEventListener('pointerup', finishAutomation);
    automationCanvas.addEventListener('pointercancel', finishAutomation);
    spatialBody.append(
      physicalOutput,
      spatialControls,
      routeSummary,
      routeGraph,
      channelRack,
      testSignalState,
      panGroup,
      automation
    );

    function currentAutomationDefinition() {
      return AUTOMATION_PARAMETERS.find((entry) => entry.key === automationState.selectedParameter)
        || AUTOMATION_PARAMETERS[0];
    }

    function currentAutomationPoints() {
      const points = automationState.tracks[automationState.selectedParameter];
      return Array.isArray(points) ? points : [];
    }

    function syncAutomationNumericInputs() {
      const definition = currentAutomationDefinition();
      automationValueInput.min = String(definition.min);
      automationValueInput.max = String(definition.max);
      automationValueInput.step = String(definition.step);
      if (!Number.isFinite(Number(automationValueInput.value))) {
        automationValueInput.value = String(clamp(parameters[definition.key], definition.min, definition.max, 0));
      } else {
        automationValueInput.value = String(clamp(
          automationValueInput.value,
          definition.min,
          definition.max,
          clamp(parameters[definition.key], definition.min, definition.max, 0)
        ));
      }
    }

    function serializedAutomation() {
      return {
        version: 1,
        enabled: automationState.enabled,
        selectedParameter: automationState.selectedParameter,
        tracks: AUTOMATION_PARAMETERS
          .filter((definition) => Array.isArray(automationState.tracks[definition.key]))
          .map((definition) => ({
            parameter: definition.key,
            points: automationState.tracks[definition.key].slice(0, 128).map((point) => ({
              time: point.time,
              value: point.value
            }))
          }))
      };
    }

    function saveAutomation() {
      if (!storage) return;
      try {
        storage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(serializedAutomation()));
      } catch {
        // Storage is optional; editing remains available for this session.
      }
    }

    function notifyAutomationChange() {
      if (!onAutomationChange) return;
      const points = currentAutomationPoints().map((point) => Object.freeze({ ...point }));
      try {
        onAutomationChange(Object.freeze({
          version: 1,
          enabled: automationState.enabled,
          parameter: automationState.selectedParameter,
          points: Object.freeze(points)
        }));
      } catch {
        automationStatus.textContent = '自动化提交失败；已保留本地曲线，当前音频参数不变';
        automationStatus.dataset.automationState = 'error';
      }
    }

    function drawAutomation() {
      const width = Math.max(1, Number(automationCanvas.clientWidth) || 640);
      const height = Math.max(1, Number(automationCanvas.clientHeight) || 180);
      const ratio = clamp(global.devicePixelRatio, 1, 2, 1);
      let target = automationCanvasTarget;
      if (!target || target.width !== width || target.height !== height || target.ratio !== ratio) {
        automationCanvas.width = Math.round(width * ratio);
        automationCanvas.height = Math.round(height * ratio);
        let nextContext = null;
        try { nextContext = automationCanvas.getContext?.('2d', { alpha: true, desynchronized: true }); }
        catch { return; }
        if (!nextContext) return;
        target = { context: nextContext, width, height, ratio };
        automationCanvasTarget = target;
      }
      const { context } = target;
      context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
      drawGrid(context, width, height, 10, 4);
      const definition = currentAutomationDefinition();
      const points = currentAutomationPoints();
      if (points.length) {
        context.beginPath();
        points.forEach((point, index) => {
          const x = point.time * width;
          const y = height - ((point.value - definition.min) / (definition.max - definition.min)) * height;
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        });
        context.strokeStyle = 'rgba(139, 244, 199, 0.94)';
        context.lineWidth = 1.5;
        context.stroke();
        points.forEach((point) => {
          const x = point.time * width;
          const y = height - ((point.value - definition.min) / (definition.max - definition.min)) * height;
          context.beginPath();
          context.arc(x, y, 3, 0, Math.PI * 2);
          context.fillStyle = 'rgba(224, 255, 242, 0.96)';
          context.fill();
        });
      }
      automationReadout.textContent = points.length
        ? `${definition.label} · ${points.length} 个控制点 · 时间 0..1 · ${definition.min}–${definition.max} ${definition.unit}`
        : `${definition.label} · 暂无控制点 · 时间 0..1`;
    }

    function addAutomationPoint(time, value, persist = true) {
      const definition = currentAutomationDefinition();
      const point = normalizeAutomationPoint({ time, value }, definition);
      if (!point) return false;
      const points = currentAutomationPoints().filter((entry) => Math.abs(entry.time - point.time) > 0.005);
      points.push(point);
      points.sort((left, right) => left.time - right.time);
      automationState.tracks[automationState.selectedParameter] = points.slice(-128).sort((left, right) => left.time - right.time);
      if (persist) saveAutomation();
      drawAutomation();
      return true;
    }

    function recordAutomationPoint(event, persist = true) {
      const bounds = automationCanvas.getBoundingClientRect();
      const definition = currentAutomationDefinition();
      const time = clamp((Number(event.clientX) - bounds.left) / Math.max(1, bounds.width), 0, 1, 0);
      const normalizedValue = 1 - clamp((Number(event.clientY) - bounds.top) / Math.max(1, bounds.height), 0, 1, 0);
      const value = definition.min + normalizedValue * (definition.max - definition.min);
      return addAutomationPoint(time, value, persist);
    }

    function saveLayout() {
      if (!storage) return;
      try {
        const modules = [...grid.children]
          .filter((card) => MODULE_IDS.has(card.dataset.mixerVisualModule))
          .map((card, order) => ({
            id: card.dataset.mixerVisualModule,
            order,
            visible: !card.hidden,
            collapsed: card.dataset.collapsed === 'true',
            size: SIZE_STATES.includes(card.dataset.size) ? card.dataset.size : 'normal'
          }));
        storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ version: 1, modules }));
        layout = modules;
      } catch {
        // Storage may be disabled by the host. Layout still works for this session.
      }
    }

    function setModuleVisibility(id, visible) {
      const card = cards.get(id);
      if (!card) return false;
      card.hidden = !visible;
      visibilityControls.get(id).checked = visible;
      saveLayout();
      if (visible) scheduleFrame();
      return true;
    }

    function toggleModuleCollapsed(id) {
      const card = cards.get(id);
      const body = bodies.get(id);
      if (!card || !body) return false;
      const collapsed = card.dataset.collapsed !== 'true';
      card.dataset.collapsed = String(collapsed);
      body.hidden = collapsed;
      const button = card.children[0].children[1].children[2];
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? '⌄' : '⌃';
      button.setAttribute('title', `${collapsed ? '展开' : '折叠'}${MODULES.find((entry) => entry.id === id)?.title || ''}`);
      saveLayout();
      if (!collapsed) scheduleFrame();
      return true;
    }

    function cycleModuleSize(id) {
      const card = cards.get(id);
      if (!card) return false;
      const current = SIZE_STATES.indexOf(card.dataset.size);
      card.dataset.size = SIZE_STATES[(current + 1) % SIZE_STATES.length];
      saveLayout();
      scheduleFrame();
      return true;
    }

    function reorderModule(sourceId, targetId) {
      if (sourceId === targetId || !cards.has(sourceId) || !cards.has(targetId)) return false;
      const source = cards.get(sourceId);
      const target = cards.get(targetId);
      grid.insertBefore(source, target);
      saveLayout();
      return true;
    }

    function moveModule(id, delta) {
      const ordered = [...grid.children].filter((card) => MODULE_IDS.has(card.dataset.mixerVisualModule));
      const sourceIndex = ordered.findIndex((card) => card.dataset.mixerVisualModule === id);
      if (sourceIndex < 0) return false;
      const targetIndex = Math.max(0, Math.min(ordered.length - 1, sourceIndex + Math.sign(delta)));
      if (targetIndex === sourceIndex) return false;
      [ordered[sourceIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[sourceIndex]];
      ordered.forEach((card) => grid.appendChild(card));
      saveLayout();
      return true;
    }

    function applyLayout() {
      layout.forEach((entry) => {
        const card = cards.get(entry.id);
        if (!card) return;
        grid.appendChild(card);
        card.hidden = !entry.visible;
        card.dataset.collapsed = String(entry.collapsed);
        card.dataset.size = entry.size;
        bodies.get(entry.id).hidden = entry.collapsed;
        visibilityControls.get(entry.id).checked = entry.visible;
        const collapse = card.children[0].children[1].children[2];
        collapse.setAttribute('aria-expanded', String(!entry.collapsed));
        collapse.textContent = entry.collapsed ? '⌄' : '⌃';
      });
    }

    function effectiveChannels() {
      return channelRouter ? channelRouter.channels : telemetry.channels;
    }

    function hasAnyTelemetry() {
      return telemetry.available || effectiveChannels().length > 0;
    }

    function moduleHasTelemetry(id) {
      if (id === 'meters' || id === 'stereo-field') return telemetry.available && Boolean(telemetry.stereo);
      if (id === 'spectrum') return telemetry.available && Boolean(telemetry.spectrum?.length);
      if (id === 'surround' || id === 'spatial') return effectiveChannels().length > 0;
      if (id === 'waveform') return telemetry.available && Boolean(telemetry.waveform?.length && telemetry.playback);
      return false;
    }

    function updateAvailability() {
      const anyTelemetry = hasAnyTelemetry();
      setDataset(root, 'telemetryState', anyTelemetry ? 'live' : 'unavailable');
      setDataset(root, 'telemetryStage', telemetry.stage);
      const stageCopy = telemetry.stage === 'media-input'
        ? '播放源前级'
        : telemetry.stage === 'post-mixer'
          ? 'Rust 调音台后级'
          : telemetry.stage === 'native-output'
            ? '物理设备输出'
            : '实时';
      const meterTitle = telemetry.stage === 'post-mixer'
        ? 'Rust 调音台后级电平'
        : telemetry.stage === 'native-output'
          ? '物理设备输出电平'
          : telemetry.stage === 'media-input'
            ? '播放源前级电平'
            : MODULES.find((entry) => entry.id === 'meters').title;
      setText(titleNodes.get('meters'), meterTitle);
      setText(telemetryStatus, telemetry.available
        ? `${stageCopy}遥测已连接${telemetry.sampleRate ? ` · ${Math.round(telemetry.sampleRate / 100) / 10} kHz` : ''}`
        : effectiveChannels().length
          ? `原生逐声道遥测已连接 · ${channelRouter.layout} 虚拟声床`
        : telemetry.stage === 'media-input'
          ? '播放源前级遥测暂不可用'
          : '实时遥测不可用');
      MODULES.forEach((definition) => {
        const availableForModule = moduleHasTelemetry(definition.id);
        const status = unavailable.get(definition.id);
        setHidden(status, availableForModule);
        setText(status, anyTelemetry
          ? `${definition.id === 'meters' ? meterTitle : definition.title}遥测不可用`
          : '实时遥测不可用');
        setDataset(cards.get(definition.id), 'dataState', availableForModule ? 'live' : 'unavailable');
      });
    }

    function updatePan(value) {
      const balance = clamp(value, -1, 1, 0);
      panHandle.style.left = `${(balance + 1) * 50}%`;
      panHandle.setAttribute('aria-valuenow', balance.toFixed(2));
      panReadout.textContent = Math.abs(balance) < 0.005
        ? 'C 0.00'
        : `${balance < 0 ? 'L' : 'R'} ${Math.abs(balance).toFixed(2)}`;
    }

    function updateRoute() {
      const layoutValue = channelRouter?.layout || (parameters.upmixOutputLayout === '7.1' ? '7.1' : '5.1');
      const upmix = channelRouter ? channelRouter.active === true : parameters.upmixEnabled === true;
      const obr = parameters.obrEnabled === true;
      routeSummary.textContent = `${upmix ? `${layoutValue} 上混` : 'Stereo'} → Mixer → ${obr ? 'OBR → 双耳 2.0（耳机）' : (upmix ? '能量匹配折叠 2.0' : 'Stereo 2.0')}`;
      routeNodes.get('upmix').dataset.routeState = upmix ? 'active' : 'bypass';
      routeNodes.get('mixer').dataset.routeState = 'active';
      routeNodes.get('obr').dataset.routeState = obr ? 'active' : 'bypass';
      routeNodes.get('input').dataset.routeState = 'active';
      CHANNELS.forEach((channel) => {
        const partOfLayout = layoutValue === '7.1' || CHANNELS_5_1.has(channel.id);
        const active = upmix && partOfLayout;
        routeNodes.get(channel.id).dataset.routeState = active ? 'active' : 'bypass';
        channelMeters.get(channel.id).strip.dataset.routeState = active ? 'active' : 'bypass';
        testSignalButtons.get(channel.id).disabled = !requestTestSignal
          || !partOfLayout
          || !(
            channelRouter?.available
            && channelRouter.actual
            && channelRouter.active
            && !channelRouter.transitionPending
          );
      });
    }

    function updateParameters(next) {
      if (!next || typeof next !== 'object') return false;
      parameters = Object.freeze({
        ...parameters,
        upmixEnabled: next.upmixEnabled === true,
        obrEnabled: next.obrEnabled === true,
        upmixAlgorithm: ['passive', 'matrix-decode', 'ambient-extract'].includes(next.upmixAlgorithm)
          ? next.upmixAlgorithm
          : parameters.upmixAlgorithm,
        upmixOutputLayout: next.upmixOutputLayout === '7.1' ? '7.1' : '5.1',
        obrFilterProfile: ['direct', 'ambient', 'reverberant'].includes(next.obrFilterProfile)
          ? next.obrFilterProfile
          : parameters.obrFilterProfile,
        balance: clamp(next.balance, -1, 1, parameters.balance)
      });
      const automationValues = {};
      AUTOMATION_PARAMETERS.forEach((definition) => {
        if (Number.isFinite(Number(next[definition.key]))) {
          automationValues[definition.key] = clamp(next[definition.key], definition.min, definition.max, 0);
        }
      });
      parameters = Object.freeze({ ...parameters, ...automationValues });
      upmixToggle.checked = parameters.upmixEnabled;
      obrToggle.checked = parameters.obrEnabled;
      layoutSelect.value = channelRouter?.layout || parameters.upmixOutputLayout;
      algorithmSelect.value = channelRouter?.algorithm || parameters.upmixAlgorithm;
      obrProfileSelect.value = parameters.obrFilterProfile;
      updatePan(parameters.balance);
      updateRoute();
      return true;
    }

    function updateChannelRouter(next) {
      if (destroyed) return false;
      channelRouter = next && typeof next === 'object' ? normalizeChannelRouter(next) : null;
      if (channelRouter?.layout) layoutSelect.value = channelRouter.layout;
      if (channelRouter?.algorithm) algorithmSelect.value = channelRouter.algorithm;
      const canTest = Boolean(
        requestTestSignal
        && channelRouter?.available
        && channelRouter.actual
        && channelRouter.active
        && !channelRouter.transitionPending
      );
      testSignalState.dataset.testSignalState = canTest ? 'ready' : 'unavailable';
      testSignalState.textContent = canTest
        ? '声道测试后端与真实路由已连接；测试电平固定为 −18 dBFS / 500 ms。'
        : requestTestSignal
          ? '真实逐声道路由未激活；测试入口不可用。'
          : '多声道测试信号不可用：音频后端未提供测试入口。';
      updateRoute();
      updateAvailability();
      scheduleFrame();
      return Boolean(channelRouter?.channels.length);
    }

    function canvasContext(moduleId) {
      const canvas = canvases.get(moduleId);
      if (!canvas) return null;
      const ratio = clamp(global.devicePixelRatio, 1, 2, 1);
      const cached = canvasTargets.get(moduleId);
      if (cached && cached.ratio === ratio) return cached;
      const cssWidth = Math.max(1, Number(canvas.clientWidth) || 640);
      const cssHeight = Math.max(1, Number(canvas.clientHeight) || 240);
      const width = Math.round(cssWidth * ratio);
      const height = Math.round(cssHeight * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      let context = null;
      try {
        context = canvas.getContext?.('2d', { alpha: true, desynchronized: true });
      } catch {
        return null;
      }
      if (!context) return null;
      context.setTransform?.(ratio, 0, 0, ratio, 0, 0);
      const target = { canvas, context, width: cssWidth, height: cssHeight, ratio };
      canvasTargets.set(moduleId, target);
      return target;
    }

    function canvasSurfaceSizes() {
      const ratio = clamp(global.devicePixelRatio, 1, 2, 1);
      return [...canvases].filter(([id]) => transferredCanvasIds.has(id)).map(([id, canvas]) => ({
        id,
        width: Math.max(1, Number(canvas.clientWidth) || 640),
        height: Math.max(1, Number(canvas.clientHeight) || 220),
        ratio
      }));
    }

    function clearCanvasWorkerReadyTimer() {
      if (!canvasWorkerReadyTimer) return;
      global.clearTimeout(canvasWorkerReadyTimer);
      canvasWorkerReadyTimer = 0;
    }

    function restoreTransferredCanvases() {
      transferredCanvasIds.forEach((id) => {
        const previous = canvases.get(id);
        const parent = previous?.parentElement;
        if (!previous || !parent) return;
        const replacement = node(document, 'canvas', {
          className: previous.className || 'audio-mixer-visual-canvas',
          attributes: {
            role: previous.getAttribute?.('role') || 'img',
            'aria-label': previous.getAttribute?.('aria-label') || `${id} 实时可视化`
          },
          dataset: { visualCanvas: id }
        });
        replacement.width = 640;
        replacement.height = 240;
        resizeObserver?.unobserve?.(previous);
        if (typeof previous.replaceWith === 'function') previous.replaceWith(replacement);
        else {
          parent.insertBefore(replacement, previous);
          previous.remove();
        }
        canvases.set(id, replacement);
        canvasTargets.delete(id);
        resizeObserver?.observe?.(replacement);
      });
      transferredCanvasIds.clear();
    }

    function disableCanvasWorker(reason = 'worker-error', target = canvasWorker) {
      clearCanvasWorkerReadyTimer();
      try { target?.terminate?.(); } catch {}
      if (canvasWorker === target) canvasWorker = null;
      canvasWorkerReady = false;
      restoreTransferredCanvases();
      setDataset(root, 'canvasRenderer', reason);
      setDataset(root, 'canvasWorkerModules', '');
      delete root.dataset.canvasWorkerSequence;
      scheduleFrame();
      return false;
    }

    function initializeCanvasWorker() {
      if (typeof global.Worker !== 'function') return false;
      // Keep the interactive waveform on the main thread so seek/focus
      // listeners never need to be rebound during a worker recovery.
      const entries = [...canvases].filter(([id]) => id !== 'waveform');
      if (!entries.length || entries.some(([, canvas]) => typeof canvas.transferControlToOffscreen !== 'function')) return false;
      let worker = null;
      try {
        const workerUrl = new URL(MIXER_RENDER_WORKER_URL, document.baseURI).href;
        worker = new global.Worker(workerUrl);
        const surfaces = entries.map(([id, canvas]) => ({
          id,
          canvas: (() => {
            const transferred = canvas.transferControlToOffscreen();
            transferredCanvasIds.add(id);
            return transferred;
          })(),
          width: 640,
          height: 220,
          ratio: 1
        }));
        canvasWorker = worker;
        worker.addEventListener('message', (event) => {
          if (destroyed || worker !== canvasWorker) return;
          if (event.data?.type === 'ready') {
            const readyModules = new Set(Array.isArray(event.data.modules) ? event.data.modules : []);
            if ([...transferredCanvasIds].some((id) => !readyModules.has(id))) {
              disableCanvasWorker('main-thread-fallback', worker);
              return;
            }
            clearCanvasWorkerReadyTimer();
            canvasWorkerReady = true;
            setDataset(root, 'canvasRenderer', 'worker');
            try {
              worker.postMessage({ type: 'resize', surfaces: canvasSurfaceSizes() });
            } catch {
              disableCanvasWorker('main-thread-fallback', worker);
              return;
            }
            scheduleFrame();
          } else if (event.data?.type === 'init-error') {
            disableCanvasWorker('main-thread-fallback', worker);
          } else if (event.data?.type === 'rendered') {
            // Keep the worker acknowledgement observable for diagnostics without
            // invalidating the full settings surface on every telemetry frame.
            if (!root.dataset.canvasWorkerSequence) {
              setDataset(root, 'canvasWorkerSequence', Number(event.data.sequence) || 1);
            }
            const renderedModules = new Set(String(root.dataset.canvasWorkerModules || '')
              .split(',').filter((id) => MODULE_IDS.has(id)));
            if (Array.isArray(event.data.active)) {
              event.data.active.forEach((id) => { if (MODULE_IDS.has(id)) renderedModules.add(id); });
            }
            const activeModules = MODULES.map((entry) => entry.id)
              .filter((id) => renderedModules.has(id)).join(',');
            setDataset(root, 'canvasWorkerModules', activeModules);
          }
        });
        worker.addEventListener('error', () => disableCanvasWorker('main-thread-fallback', worker));
        worker.addEventListener('messageerror', () => disableCanvasWorker('main-thread-fallback', worker));
        setDataset(root, 'canvasRenderer', 'worker-starting');
        worker.postMessage({ type: 'init', surfaces }, surfaces.map((entry) => entry.canvas));
        if (!canvasWorkerReady) {
          canvasWorkerReadyTimer = global.setTimeout(() => {
            if (!destroyed && worker === canvasWorker && !canvasWorkerReady) {
              disableCanvasWorker('main-thread-fallback', worker);
            }
          }, MIXER_RENDER_WORKER_READY_TIMEOUT_MS);
        }
        return true;
      } catch {
        return disableCanvasWorker('main-thread-fallback', worker);
      }
    }

    function renderCanvasesInWorker(active) {
      if (!canvasWorker || !canvasWorkerReady || !active.length) return false;
      const channels = effectiveChannels().map((entry) => ({
        id: entry.id,
        peak: entry.peak,
        rms: entry.rms,
        azimuthDeg: entry.azimuthDeg
      }));
      try {
        canvasWorker.postMessage({
          type: 'frame',
          sequence: telemetry.sequence,
          active,
          channels,
          telemetry: {
            spectrum: telemetry.spectrum,
            stereo: telemetry.stereo ? {
              correlation: telemetry.stereo.correlation,
              leftSamples: telemetry.stereo.leftSamples,
              rightSamples: telemetry.stereo.rightSamples
            } : null,
            waveform: telemetry.waveform,
            playback: telemetry.playback
          }
        });
      } catch {
        disableCanvasWorker('main-thread-fallback', canvasWorker);
        return false;
      }
      drawCount += active.length;
      return true;
    }

    function drawGrid(context, width, height, columns = 8, rows = 4) {
      context.clearRect(0, 0, width, height);
      context.beginPath();
      for (let column = 1; column < columns; column += 1) {
        const x = (column / columns) * width;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let row = 1; row < rows; row += 1) {
        const y = (row / rows) * height;
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.strokeStyle = 'rgba(139, 216, 187, 0.11)';
      context.lineWidth = 1;
      context.stroke();
    }

    function drawSpectrum() {
      const target = canvasContext('spectrum');
      if (!target || !telemetry.spectrum?.length) return;
      const { context, width, height } = target;
      drawGrid(context, width, height, 10, 4);
      const bins = telemetry.spectrum;
      const barWidth = Math.max(1, width / bins.length);
      const gradient = context.createLinearGradient?.(0, height, 0, 0);
      gradient?.addColorStop?.(0, 'rgba(76, 190, 145, 0.42)');
      gradient?.addColorStop?.(0.72, 'rgba(124, 240, 190, 0.9)');
      gradient?.addColorStop?.(1, 'rgba(255, 130, 121, 0.96)');
      context.fillStyle = gradient || 'rgba(124, 240, 190, 0.86)';
      if (typeof context.rect === 'function') {
        context.beginPath();
        for (let index = 0; index < bins.length; index += 1) {
          const magnitude = clamp(bins[index], 0, 1, 0);
          const barHeight = magnitude * height;
          context.rect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
        }
        context.fill();
      } else {
        for (let index = 0; index < bins.length; index += 1) {
          const magnitude = clamp(bins[index], 0, 1, 0);
          const barHeight = magnitude * height;
          context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
        }
      }
      drawCount += 1;
    }

    function drawSpectrumVector() {
      if (!telemetry.spectrum?.length) return;
      const now = global.performance?.now?.() ?? Date.now();
      if (lastSpectrumVectorAt && now - lastSpectrumVectorAt < (1000 / 15)) return;
      lastSpectrumVectorAt = now;
      const bins = telemetry.spectrum;
      const points = Math.min(48, bins.length);
      const commands = ['M 0 240'];
      for (let point = 0; point < points; point += 1) {
        const from = Math.floor((point / points) * bins.length);
        const to = Math.max(from + 1, Math.floor(((point + 1) / points) * bins.length));
        let energy = 0;
        for (let index = from; index < to; index += 1) {
          energy = Math.max(energy, clamp(bins[index], 0, 1, 0));
        }
        const x = (point / Math.max(1, points - 1)) * 640;
        commands.push(`L ${x.toFixed(1)} ${(240 - energy * 240).toFixed(1)}`);
      }
      commands.push('L 640 240 Z');
      setAttributeIfChanged(spectrumVectorPath, 'd', commands.join(' '));
      if (!spectrumVector.dataset.vectorRendered) setDataset(spectrumVector, 'vectorRendered', 'true');
      drawCount += 1;
    }

    function drawStereoField() {
      const target = canvasContext('stereo-field');
      if (!target || !telemetry.stereo) return;
      const { context, width, height } = target;
      drawGrid(context, width, height, 4, 4);
      const stereo = telemetry.stereo;
      const count = Math.min(stereo.leftSamples?.length || 0, stereo.rightSamples?.length || 0);
      context.strokeStyle = 'rgba(132, 241, 194, 0.9)';
      context.lineWidth = 1.1;
      context.beginPath();
      if (count > 1) {
        for (let index = 0; index < count; index += 1) {
          const left = stereo.leftSamples[index];
          const right = stereo.rightSamples[index];
          const x = width / 2 + ((right - left) * width * 0.22);
          const y = height / 2 - ((right + left) * height * 0.22);
          if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
      } else {
        const spread = ((stereo.correlation + 1) / 2) * width * 0.4;
        context.moveTo(width / 2 - spread, height / 2 + spread * 0.25);
        context.lineTo(width / 2 + spread, height / 2 - spread * 0.25);
      }
      context.stroke();
      drawCount += 1;
    }

    function drawSurround() {
      const target = canvasContext('surround');
      const channels = effectiveChannels();
      if (!target || !channels.length) return;
      const { context, width, height } = target;
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.max(10, Math.min(width, height) * 0.38);
      context.strokeStyle = 'rgba(139, 216, 187, 0.2)';
      [0.33, 0.66, 1].forEach((scale) => {
        context.beginPath();
        context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
        context.stroke();
      });
      channels.forEach((level) => {
        const channel = CHANNELS.find((entry) => entry.id === level.id);
        if (!channel) return;
        const azimuth = Number.isFinite(level.azimuthDeg) ? level.azimuthDeg : channel.angle;
        const angle = ((azimuth - 90) * Math.PI) / 180;
        const energyRadius = radius * clamp(level.rms, 0, 1, 0);
        const x = centerX + Math.cos(angle) * energyRadius;
        const y = centerY + Math.sin(angle) * energyRadius;
        context.beginPath();
        context.arc(x, y, 4 + clamp(level.peak, 0, 1, 0) * 7, 0, Math.PI * 2);
        context.fillStyle = level.peak >= 1 ? 'rgba(255, 112, 105, 0.95)' : 'rgba(126, 241, 192, 0.86)';
        context.fill();
        context.fillStyle = 'rgba(225, 247, 237, 0.78)';
        context.font = '11px "Segoe UI", sans-serif';
        context.textAlign = 'center';
        context.fillText(channel.id, centerX + Math.cos(angle) * (radius + 14), centerY + Math.sin(angle) * (radius + 14));
      });
      drawCount += 1;
    }

    function drawWaveform() {
      const target = canvasContext('waveform');
      if (!target || !telemetry.waveform?.length || !telemetry.playback) return;
      const { context, width, height } = target;
      drawGrid(context, width, height, 8, 2);
      const samples = telemetry.waveform;
      context.strokeStyle = 'rgba(129, 238, 193, 0.88)';
      context.lineWidth = 1.2;
      context.beginPath();
      samples.forEach((sample, index) => {
        const x = (index / Math.max(1, samples.length - 1)) * width;
        const y = height / 2 - sample * height * 0.44;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      const progress = telemetry.playback.positionSeconds / telemetry.playback.durationSeconds;
      context.fillStyle = 'rgba(111, 232, 181, 0.13)';
      context.fillRect(0, 0, width * progress, height);
      context.strokeStyle = 'rgba(215, 255, 238, 0.88)';
      context.beginPath();
      context.moveTo(width * progress, 0);
      context.lineTo(width * progress, height);
      context.stroke();
      drawCount += 1;
    }

    function renderMeters() {
      if (!telemetry.stereo) return;
      ['L', 'R'].forEach((id, index) => {
        const view = meterViews.get(id);
        const peak = telemetry.stereo.peak[index];
        const rms = telemetry.stereo.rms[index];
        const hold = telemetry.stereo.peakHold[index];
        const peakScale = Math.round(clamp(peak, 0, 1, 0) * 200) / 200;
        const rmsScale = Math.round(clamp(rms, 0, 1, 0) * 200) / 200;
        const holdScale = Math.round(clamp(hold, 0, 1, 0) * 200) / 200;
        setStyleIfChanged(view.peakFill, 'transform', `scaleY(${peakScale})`);
        setStyleIfChanged(view.rmsFill, 'transform', `scaleY(${rmsScale})`);
        setStyleIfChanged(view.hold, 'transform', `translateY(${-holdScale * 148}px)`);
        const over = peak >= 1;
        view.overloadLamp.classList.toggle('is-over', over);
        setText(view.peakReadout, `${over ? 'OVER ' : 'Peak '}${dbfs(peak)} dBFS`);
        setText(view.rmsReadout, `RMS ${dbfs(rms)} dBFS`);
      });
      const gainReduction = telemetry.stereo.gainReductionDb;
      const reductionScale = Number.isFinite(gainReduction)
        ? Math.round(clamp(gainReduction / 24, 0, 1, 0) * 200) / 200
        : 0;
      setStyleIfChanged(reductionBar, 'transform', `scaleX(${reductionScale})`);
      setText(reductionText, Number.isFinite(gainReduction) ? `GR ${gainReduction.toFixed(1)} dB` : 'GR —');
      drawCount += 1;
    }

    function renderChannelMeters() {
      const byId = new Map(effectiveChannels().map((entry) => [entry.id, entry]));
      CHANNELS.forEach((channel) => {
        const view = channelMeters.get(channel.id);
        const level = byId.get(channel.id);
        if (!level) {
          setDataset(view.strip, 'telemetry', 'unavailable');
          setText(view.output, '—');
          return;
        }
        setDataset(view.strip, 'telemetry', 'live');
        view.strip.classList.toggle('is-over', level.peak >= 1);
        const peakScale = Math.round(clamp(level.peak, 0, 1, 0) * 200) / 200;
        const rmsScale = Math.round(clamp(level.rms, 0, 1, 0) * 200) / 200;
        setStyleIfChanged(view.peak, 'transform', `scaleX(${peakScale})`);
        setStyleIfChanged(view.rms, 'transform', `scaleX(${rmsScale})`);
        setText(view.output, `${dbfs(level.peak)} dBFS`);
      });
      drawCount += 1;
    }

    function renderFrame() {
      frameId = 0;
      if (destroyed || !hasAnyTelemetry()) return;
      const workerCanvases = [];
      const renderable = MODULES.filter((definition) => {
        const card = cards.get(definition.id);
        const notRenderedByLayout = card.hidden
          || card.dataset.collapsed === 'true'
          || visibleInViewport.get(definition.id) === false;
        return !notRenderedByLayout && moduleHasTelemetry(definition.id);
      });
      if (!renderable.length) return;
      if (renderCycleRemaining <= 0 || renderCycleRemaining > renderable.length) {
        renderCycleRemaining = renderable.length;
      }
      const definition = renderable[renderCursor % renderable.length];
      renderCursor = (renderCursor + 1) % Math.max(1, renderable.length);
      if (definition.id === 'meters') renderMeters();
      else if (definition.id === 'spectrum') drawSpectrumVector();
      else if (transferredCanvasIds.has(definition.id)) {
        if (canvasWorkerReady) workerCanvases.push(definition.id);
      }
      else if (definition.id === 'stereo-field') drawStereoField();
      else if (definition.id === 'surround') drawSurround();
      else if (definition.id === 'waveform') drawWaveform();
      else if (definition.id === 'spatial') renderChannelMeters();
      renderCanvasesInWorker(workerCanvases);
      if (definition.id === 'stereo-field' && telemetry.stereo) {
        setText(correlation, Number.isFinite(telemetry.stereo.correlation)
          ? `相关度 ${telemetry.stereo.correlation.toFixed(2)}`
          : '相关度 —');
      }
      if (definition.id === 'waveform' && telemetry.playback) {
        setText(playbackReadout, `${timecode(telemetry.playback.positionSeconds)} / ${timecode(telemetry.playback.durationSeconds)}`);
        setAttributeIfChanged(waveformCanvas,
          'aria-valuenow',
          String(Math.round((telemetry.playback.positionSeconds / telemetry.playback.durationSeconds) * 1000) / 10)
        );
      }
      renderCycleRemaining -= 1;
      if (renderCycleRemaining > 0 && typeof requestFrame === 'function') {
        frameId = requestFrame(renderFrame);
      }
    }

    function scheduleFrame() {
      if (destroyed || !hasAnyTelemetry() || typeof requestFrame !== 'function') return;
      renderCycleRemaining = 0;
      if (frameId) return;
      frameId = requestFrame(renderFrame);
    }

    function pushTelemetry(value) {
      if (destroyed) return false;
      telemetry = normalizeTelemetry(value);
      updateAvailability();
      if (telemetry.available) scheduleFrame();
      return telemetry.available;
    }

    function setUnavailable(reason) {
      return pushTelemetry({ available: false, reason });
    }

    function snapshot() {
      const stereoSummary = telemetry.stereo
        ? Object.freeze({
            peak: Object.freeze([...telemetry.stereo.peak]),
            rms: Object.freeze([...telemetry.stereo.rms]),
            peakHold: Object.freeze([...telemetry.stereo.peakHold]),
            correlation: telemetry.stereo.correlation,
            gainReductionDb: telemetry.stereo.gainReductionDb
          })
        : null;
      return Object.freeze({
        telemetryAvailable: telemetry.available,
        telemetrySequence: telemetry.sequence,
        telemetryStage: telemetry.stage,
        telemetry: Object.freeze({
          available: telemetry.available,
          stage: telemetry.stage,
          sampleRate: telemetry.sampleRate,
          stereo: stereoSummary,
          spectrumBins: telemetry.spectrum?.length || 0,
          waveformSamples: telemetry.waveform?.length || 0,
          channelCount: telemetry.channels.length,
          playbackAvailable: telemetry.playback !== null
        }),
        channelRouter: Object.freeze({
          revision: channelRouter?.revision ?? null,
          layout: channelRouter?.layout || '',
          algorithm: channelRouter?.algorithm || '',
          available: channelRouter?.available === true,
          actual: channelRouter?.actual === true,
          active: channelRouter?.active === true,
          controlAvailable: channelRouter?.controlAvailable === true,
          availability: channelRouter?.availability || 'unavailable',
          activeRevision: channelRouter?.activeRevision || 0,
          stagedRevision: channelRouter?.stagedRevision || 0,
          lastResult: channelRouter?.lastResult || 0,
          layoutPending: channelRouter?.layoutPending === true,
          transitionPending: channelRouter?.transitionPending === true,
          output: channelRouter?.output || '',
          processCalls: channelRouter?.processCalls || 0,
          channelCount: channelRouter?.channels.length || 0,
          physicalMultichannel: false
        }),
        layout: Object.freeze([...grid.children].map((card, order) => Object.freeze({
          id: card.dataset.mixerVisualModule,
          order,
          visible: !card.hidden,
          collapsed: card.dataset.collapsed === 'true',
          size: card.dataset.size
        }))),
        drawCount,
        framePending: frameId !== 0,
        physicalOutputChannels: 2,
        automation: Object.freeze({
          enabled: automationState.enabled,
          parameter: automationState.selectedParameter,
          points: Object.freeze(currentAutomationPoints().map((point) => Object.freeze({ ...point })))
        })
      });
    }

    function destroy() {
      if (destroyed) return false;
      destroyed = true;
      publishers.delete(pushTelemetry);
      try { unsubscribeTelemetry?.(); } catch {}
      intersectionObserver?.disconnect?.();
      resizeObserver?.disconnect?.();
      if (frameId && typeof cancelFrame === 'function') cancelFrame(frameId);
      frameId = 0;
      clearCanvasWorkerReadyTimer();
      canvasWorker?.terminate?.();
      canvasWorker = null;
      canvasWorkerReady = false;
      root.remove();
      mounted.delete(container);
      return true;
    }

    applyLayout();
    updateParameters(parameters);
    updateAvailability();
    syncAutomationNumericInputs();
    drawAutomation();
    initializeCanvasWorker();

    if (typeof global.IntersectionObserver === 'function') {
      intersectionObserver = new global.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const id = entry.target?.dataset?.mixerVisualModule;
          if (MODULE_IDS.has(id)) {
            visibleInViewport.set(id, entry.isIntersecting === true);
            if (id === 'spatial' && entry.isIntersecting === true) drawAutomation();
          }
        });
        scheduleFrame();
      }, { root: null, threshold: 0 });
      cards.forEach((card) => intersectionObserver.observe(card));
    }
    if (typeof global.ResizeObserver === 'function') {
      resizeObserver = new global.ResizeObserver((entries) => {
        let automationResized = false;
        entries.forEach((entry) => {
          const id = entry.target?.dataset?.visualCanvas || '';
          if (id) canvasTargets.delete(id);
          if (entry.target === automationCanvas) automationResized = true;
        });
        if (automationResized) {
          automationCanvasTarget = null;
          if (visibleInViewport.get('spatial') !== false) drawAutomation();
        }
        if (canvasWorkerReady) {
          const ratio = clamp(global.devicePixelRatio, 1, 2, 1);
          const surfaces = entries.map((entry) => ({
            id: entry.target?.dataset?.visualCanvas || '',
            width: Math.max(1, Number(entry.contentRect?.width) || 640),
            height: Math.max(1, Number(entry.contentRect?.height) || 220),
            ratio
          })).filter((entry) => transferredCanvasIds.has(entry.id));
          if (surfaces.length) {
            try { canvasWorker.postMessage({ type: 'resize', surfaces }); }
            catch { disableCanvasWorker('main-thread-fallback', canvasWorker); }
          }
        }
        scheduleFrame();
      });
      canvases.forEach((canvas) => resizeObserver.observe(canvas));
      resizeObserver.observe(automationCanvas);
    }

    const telemetrySource = options.telemetrySource;
    if (telemetrySource && typeof telemetrySource.subscribe === 'function') {
      try {
        const unsubscribe = telemetrySource.subscribe(pushTelemetry);
        if (typeof unsubscribe === 'function') unsubscribeTelemetry = unsubscribe;
      } catch {
        setUnavailable('telemetry-subscribe-failed');
      }
    }
    publishers.add(pushTelemetry);

    const controller = Object.freeze({
      pushTelemetry,
      setUnavailable,
      updateParameters,
      updateChannelRouter,
      setModuleVisibility,
      toggleModuleCollapsed,
      cycleModuleSize,
      snapshot,
      destroy
    });
    mounted.set(container, controller);
    return controller;
  }

  function publishTelemetry(value) {
    let accepted = 0;
    publishers.forEach((publish) => {
      if (publish(value)) accepted += 1;
    });
    return accepted;
  }

  function snapshot(container) {
    return mounted.get(container)?.snapshot?.() || null;
  }

  global.FeAudioMixerVisuals = Object.freeze({
    mount,
    publishTelemetry,
    snapshot,
    normalizeTelemetry,
    createMediaElementTelemetrySource,
    moduleIds: Object.freeze(MODULES.map((module) => module.id)),
    channelIds: Object.freeze(CHANNELS.map((channel) => channel.id))
  });
})(window);
