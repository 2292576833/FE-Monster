(function createAudioMixerUi(global) {
  'use strict';

  const MIXER_ENDPOINT = '/api/audio/mixer';
  const PRESETS_ENDPOINT = '/api/audio/mixer/presets';
  const CHANNELS_ENDPOINT = '/api/audio/mixer/channels';
  const CHANNEL_TEST_ENDPOINT = '/api/audio/mixer/channels/test';
  const PATCH_DEBOUNCE_MS = 150;
  const KEYBOARD_PATCH_DEBOUNCE_MS = 320;
  const FAMILY_LAYOUT_STORAGE_KEY = 'fe.audioMixer.familyLayout.v1';
  const FAMILY_DENSITIES = Object.freeze(['normal', 'compact', 'wide']);
  const CHANNEL_LAYOUTS = Object.freeze({
    '5.1': Object.freeze(['FL', 'FR', 'FC', 'LFE', 'SL', 'SR']),
    '7.1': Object.freeze(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'SL', 'SR'])
  });
  const CHANNEL_LABELS = Object.freeze({
    FL: '左前', FR: '右前', FC: '中置', LFE: '低频',
    BL: '左后', BR: '右后', SL: '左侧环绕', SR: '右侧环绕'
  });
  const CHANNEL_ALGORITHMS = Object.freeze([
    Object.freeze({ value: 'front-only', label: 'Pass-through（前置直达）' }),
    Object.freeze({ value: 'matrix-decode', label: 'Matrix 矩阵解码' }),
    Object.freeze({ value: 'ambient-extract', label: 'Ambient Extract 环境提取' }),
    Object.freeze({ value: 'custom-matrix', label: 'Custom Matrix 自定义矩阵' }),
    Object.freeze({ value: 'passive', label: 'Passive FFT（实验说明，不在此面板切换）', disabled: true }),
    Object.freeze({ value: 'dolby-pro-logic-iix', label: 'Dolby Pro Logic II/IIx（需授权）', disabled: true }),
    Object.freeze({ value: 'dts-neural-x', label: 'DTS Neural:X（需授权）', disabled: true })
  ]);
  const SELECTABLE_CHANNEL_ALGORITHMS = new Set(
    CHANNEL_ALGORITHMS.filter((entry) => entry.disabled !== true).map((entry) => entry.value)
  );
  const CHANNEL_ARRAY_PARAMETERS = Object.freeze({
    channelGainDb: Object.freeze({ key: 'gainDb', label: '增益', min: -60, max: 12, step: 0.1, unit: 'dB' }),
    channelDelayMs: Object.freeze({ key: 'delayMs', label: '延迟', min: 0, max: 250, step: 0.1, unit: 'ms' }),
    channelAzimuthDeg: Object.freeze({ key: 'azimuthDeg', label: '方位角', min: -180, max: 180, step: 1, unit: '°' })
  });
  const CHANNEL_PATCH_KEYS = new Set([
    'layout', 'algorithm', 'lfeCrossoverHz',
    'channelGainDb', 'channelDelayMs', 'channelAzimuthDeg', 'customMatrix'
  ]);
  const CHANNEL_OUTPUTS = new Set([
    'binaural-2ch-headphones',
    'energy-matched-stereo-fold-down',
    'virtual-bed-to-binaural-2ch'
  ]);
  const EQ_FREQUENCIES = Object.freeze([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
  const PRESET_IDENTITIES = Object.freeze([
    Object.freeze({ id: 'clean', label: '纯净' }),
    Object.freeze({ id: 'bathroom', label: '浴室' }),
    Object.freeze({ id: 'hall', label: '大厅' }),
    Object.freeze({ id: 'surround-3d', label: '3D环绕' }),
    Object.freeze({ id: 'cinema', label: '影院' }),
    Object.freeze({ id: 'vocal-clear', label: '人声清晰' }),
    Object.freeze({ id: 'bass-boost', label: '低频增强' }),
    Object.freeze({ id: 'night', label: '夜间' })
  ]);
  const PRESET_IDS = new Set(PRESET_IDENTITIES.map((preset) => preset.id));
  const BOOLEAN_PARAMETERS = new Set([
    'enabled',
    'compressorEnabled',
    'limiterEnabled',
    'reverbEnabled',
    'upmixEnabled',
    'obrEnabled'
  ]);
  const NUMERIC_PARAMETERS = Object.freeze({
    inputGainDb: Object.freeze({ label: '输入增益', min: -24, max: 24, step: 0.1, unit: 'dB' }),
    outputGainDb: Object.freeze({ label: '输出增益', min: -24, max: 24, step: 0.1, unit: 'dB' }),
    balance: Object.freeze({ label: '左右平衡', min: -1, max: 1, step: 0.01, unit: '' }),
    stereoWidth: Object.freeze({ label: '立体声宽度', min: 0, max: 2, step: 0.01, unit: '×' }),
    centerGain: Object.freeze({ label: '中置增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    surroundGain: Object.freeze({ label: '环绕增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    lfeGain: Object.freeze({ label: '低频声道增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    compressorThresholdDb: Object.freeze({ label: '压缩阈值', min: -60, max: 0, step: 0.1, unit: 'dB' }),
    compressorRatio: Object.freeze({ label: '压缩比', min: 1, max: 20, step: 0.1, unit: ':1' }),
    compressorAttackMs: Object.freeze({ label: '启动时间', min: 0.1, max: 200, step: 0.1, unit: 'ms' }),
    compressorReleaseMs: Object.freeze({ label: '释放时间', min: 10, max: 2000, step: 1, unit: 'ms' }),
    compressorKneeDb: Object.freeze({ label: '拐点宽度', min: 0, max: 24, step: 0.1, unit: 'dB' }),
    compressorMakeupDb: Object.freeze({ label: '补偿增益', min: 0, max: 24, step: 0.1, unit: 'dB' }),
    limiterCeilingDb: Object.freeze({ label: '限制上限', min: -12, max: 0, step: 0.1, unit: 'dB' }),
    limiterReleaseMs: Object.freeze({ label: '限制器释放', min: 10, max: 1000, step: 1, unit: 'ms' }),
    reverbRoomSize: Object.freeze({ label: '空间大小', min: 0, max: 1, step: 0.01, unit: '' }),
    reverbDecayMs: Object.freeze({ label: '衰减时间', min: 50, max: 5000, step: 10, unit: 'ms' }),
    reverbDamping: Object.freeze({ label: '高频阻尼', min: 0, max: 1, step: 0.01, unit: '' }),
    reverbPreDelayMs: Object.freeze({ label: '预延迟', min: 0, max: 200, step: 1, unit: 'ms' }),
    reverbWet: Object.freeze({ label: '湿声', min: 0, max: 1, step: 0.01, unit: '' }),
    reverbDry: Object.freeze({ label: '干声', min: 0, max: 1, step: 0.01, unit: '' }),
    upmixCenterWidthHz: Object.freeze({ label: '中置提取宽度', min: 20, max: 20000, step: 10, unit: 'Hz' }),
    upmixLfeCrossoverHz: Object.freeze({ label: 'LFE 分频点', min: 20, max: 500, step: 1, unit: 'Hz' }),
    upmixCenterGain: Object.freeze({ label: '上混中置增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    upmixSurroundGain: Object.freeze({ label: '上混环绕增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    upmixLfeGain: Object.freeze({ label: '上混 LFE 增益', min: 0, max: 2, step: 0.01, unit: '×' }),
    upmixDecorrelation: Object.freeze({ label: '去相关量', min: 0, max: 1, step: 0.01, unit: '' }),
    obrWet: Object.freeze({ label: 'OBR 湿声', min: 0, max: 1, step: 0.01, unit: '' }),
    obrDry: Object.freeze({ label: 'OBR 干声', min: 0, max: 1, step: 0.01, unit: '' }),
    obrOutputGainDb: Object.freeze({ label: 'OBR 输出增益', min: -12, max: 0, step: 0.1, unit: 'dB' }),
    obrSpatialWidth: Object.freeze({ label: 'OBR 空间宽度', min: 0, max: 2, step: 0.01, unit: '×' })
  });
  const ENUM_PARAMETERS = Object.freeze({
    upmixAlgorithm: Object.freeze({
      label: '上混算法',
      options: Object.freeze([
        Object.freeze({ value: 'passive', label: 'Passive FFT（实验）' }),
        Object.freeze({ value: 'matrix-decode', label: '矩阵解码（保真）' }),
        Object.freeze({ value: 'ambient-extract', label: '环境提取' })
      ])
    }),
    upmixOutputLayout: Object.freeze({
      label: '虚拟声床布局',
      options: Object.freeze([
        Object.freeze({ value: '5.1', label: '虚拟 5.1' }),
        Object.freeze({ value: '7.1', label: '虚拟 7.1' })
      ])
    }),
    obrFilterProfile: Object.freeze({
      label: 'OBR 滤波配置',
      options: Object.freeze([
        Object.freeze({ value: 'direct', label: '直达声（保真）' }),
        Object.freeze({ value: 'ambient', label: '环境声' }),
        Object.freeze({ value: 'reverberant', label: '混响声' })
      ])
    })
  });
  const FAMILIES = Object.freeze([
    Object.freeze({
      id: 'master',
      label: '主控',
      description: '控制调音链总开关、输入与输出电平。',
      controls: Object.freeze([
        Object.freeze({ key: 'enabled', label: '启用调音台', type: 'boolean' }),
        Object.freeze({ key: 'inputGainDb', type: 'number' }),
        Object.freeze({ key: 'outputGainDb', type: 'number' }),
        Object.freeze({ key: 'balance', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'equalizer',
      label: '十段均衡器',
      description: '从 31 Hz 到 16 kHz 调节各频段，范围为 ±12 dB。',
      controls: Object.freeze([Object.freeze({ key: 'eqDb', type: 'equalizer' })])
    }),
    Object.freeze({
      id: 'spatial',
      label: '声场与声道',
      description: '在上混后调整宽度及中置、环绕、低频声道电平。',
      controls: Object.freeze([
        Object.freeze({ key: 'stereoWidth', type: 'number' }),
        Object.freeze({ key: 'centerGain', type: 'number' }),
        Object.freeze({ key: 'surroundGain', type: 'number' }),
        Object.freeze({ key: 'lfeGain', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'upmix',
      label: '上混',
      description: '独立控制立体声到虚拟 5.1/7.1 声床；关闭时仍保留 Mixer 处理。',
      controls: Object.freeze([
        Object.freeze({ key: 'upmixEnabled', label: '启用上混', type: 'boolean' }),
        Object.freeze({ key: 'upmixAlgorithm', type: 'enum' }),
        Object.freeze({ key: 'upmixOutputLayout', type: 'enum' }),
        Object.freeze({ key: 'upmixCenterWidthHz', type: 'number' }),
        Object.freeze({ key: 'upmixLfeCrossoverHz', type: 'number' }),
        Object.freeze({ key: 'upmixCenterGain', type: 'number' }),
        Object.freeze({ key: 'upmixSurroundGain', type: 'number' }),
        Object.freeze({ key: 'upmixLfeGain', type: 'number' }),
        Object.freeze({ key: 'upmixDecorrelation', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'obr',
      label: 'OBR 双耳渲染',
      description: '独立控制 OBR 与 FE Monster 干湿声包装；关闭时走非 OBR 干声输出。',
      controls: Object.freeze([
        Object.freeze({ key: 'obrEnabled', label: '启用 OBR', type: 'boolean' }),
        Object.freeze({ key: 'obrFilterProfile', type: 'enum' }),
        Object.freeze({ key: 'obrWet', type: 'number' }),
        Object.freeze({ key: 'obrDry', type: 'number' }),
        Object.freeze({ key: 'obrOutputGainDb', type: 'number' }),
        Object.freeze({ key: 'obrSpatialWidth', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'compressor',
      label: '压缩器',
      description: '收窄动态范围并平滑响度变化。',
      controls: Object.freeze([
        Object.freeze({ key: 'compressorEnabled', label: '启用压缩器', type: 'boolean' }),
        Object.freeze({ key: 'compressorThresholdDb', type: 'number' }),
        Object.freeze({ key: 'compressorRatio', type: 'number' }),
        Object.freeze({ key: 'compressorAttackMs', type: 'number' }),
        Object.freeze({ key: 'compressorReleaseMs', type: 'number' }),
        Object.freeze({ key: 'compressorKneeDb', type: 'number' }),
        Object.freeze({ key: 'compressorMakeupDb', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'limiter',
      label: '限制器',
      description: '约束峰值，避免最终输出削波。',
      controls: Object.freeze([
        Object.freeze({ key: 'limiterEnabled', label: '启用限制器', type: 'boolean' }),
        Object.freeze({ key: 'limiterCeilingDb', type: 'number' }),
        Object.freeze({ key: 'limiterReleaseMs', type: 'number' })
      ])
    }),
    Object.freeze({
      id: 'reverb',
      label: '混响',
      description: '调节空间、衰减、阻尼和干湿声比例。',
      controls: Object.freeze([
        Object.freeze({ key: 'reverbEnabled', label: '启用混响', type: 'boolean' }),
        Object.freeze({ key: 'reverbRoomSize', type: 'number' }),
        Object.freeze({ key: 'reverbDecayMs', type: 'number' }),
        Object.freeze({ key: 'reverbDamping', type: 'number' }),
        Object.freeze({ key: 'reverbPreDelayMs', type: 'number' }),
        Object.freeze({ key: 'reverbWet', type: 'number' }),
        Object.freeze({ key: 'reverbDry', type: 'number' })
      ])
    })
  ]);
  const SIMPLE_PARAMETER_KEYS = Object.freeze(FAMILIES
    .flatMap((family) => family.controls)
    .filter((control) => control.key !== 'eqDb')
    .map((control) => control.key));
  const ALLOWED_PARAMETER_KEYS = new Set([...SIMPLE_PARAMETER_KEYS, 'eqDb']);
  const mounted = new WeakMap();
  let mountSequence = 0;

  function normalizeChannelLayout(value) {
    return value === '7.1' ? '7.1' : '5.1';
  }

  function normalizeEffectiveChannelLayout(value) {
    return value === 'stereo' ? 'stereo' : normalizeChannelLayout(value);
  }

  function normalizeFixedArray(value, length, minimum, maximum, name) {
    if (!Array.isArray(value) || value.length !== length) {
      throw new TypeError(`Invalid channel router array: ${name}`);
    }
    return value.map((entry) => finiteNumber(entry, minimum, maximum, name));
  }

  function optionalTelemetryArray(value, length, minimum, maximum) {
    if (!Array.isArray(value) || value.length !== length) return null;
    const result = value.map(Number);
    if (result.some((entry) => !Number.isFinite(entry) || entry < minimum || entry > maximum)) return null;
    return result;
  }

  function normalizeChannelRouterSnapshot(value) {
    if (!isRecord(value)) throw new TypeError('Invalid channel router response');
    const revision = Number(value.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Invalid channel router revision');
    const layout = value.layout === '7.1' ? '7.1' : value.layout === '5.1' ? '5.1' : '';
    if (!layout) throw new TypeError('Invalid channel router layout');
    const expectedOrder = CHANNEL_LAYOUTS[layout];
    if (
      !Array.isArray(value.channelOrder)
      || value.channelOrder.length !== expectedOrder.length
      || value.channelOrder.some((entry, index) => entry !== expectedOrder[index])
    ) {
      throw new TypeError('Invalid channel router order');
    }
    const algorithm = String(value.algorithm || '');
    if (!SELECTABLE_CHANNEL_ALGORITHMS.has(algorithm) && algorithm !== 'passive') {
      throw new TypeError('Invalid channel router algorithm');
    }
    const channelGainDb = normalizeFixedArray(value.channelGainDb, 8, -60, 12, 'channelGainDb');
    const channelDelayMs = normalizeFixedArray(value.channelDelayMs, 8, 0, 250, 'channelDelayMs');
    const channelAzimuthDeg = normalizeFixedArray(value.channelAzimuthDeg, 8, -180, 180, 'channelAzimuthDeg');
    const customMatrix = normalizeFixedArray(value.customMatrix, 16, -2, 2, 'customMatrix');
    const telemetry = isRecord(value.telemetry) ? value.telemetry : {};
    const channelPeak = optionalTelemetryArray(
      value.channelPeak ?? telemetry.channelPeak ?? telemetry.peak,
      8,
      0,
      4
    );
    const channelRms = optionalTelemetryArray(
      value.channelRms ?? telemetry.channelRms ?? telemetry.rms,
      8,
      0,
      4
    );
    const telemetryAzimuth = optionalTelemetryArray(
      value.channelTelemetryAzimuthDeg
        ?? telemetry.channelAzimuthDeg
        ?? telemetry.azimuthDeg
        ?? channelAzimuthDeg,
      8,
      -180,
      180
    );
    const actual = value.actual === true;
    const available = value.available === true;
    const configState = safeDiagnosticToken(value.configState, 'ready');
    const activeRevision = safeCounter(value.activeRevision);
    const stagedRevision = safeCounter(value.stagedRevision);
    const lastResultNumber = Number(value.lastResult);
    const lastResult = Number.isSafeInteger(lastResultNumber)
      && lastResultNumber >= -1_000_000
      && lastResultNumber <= 1_000_000
      ? lastResultNumber
      : 0;
    const layoutPending = value.layoutPending === true;
    const transitionPending = value.transitionPending === true || layoutPending;
    const output = CHANNEL_OUTPUTS.has(value.output) ? value.output : '';
    return Object.freeze({
      revision,
      layout,
      effectiveLayout: value.effectiveLayout === '7.1'
        ? '7.1'
        : value.effectiveLayout === '5.1'
          ? '5.1'
          : '',
      algorithm,
      lfeCrossoverHz: finiteNumber(value.lfeCrossoverHz, 20, 500, 'lfeCrossoverHz'),
      channelOrder: Object.freeze([...expectedOrder]),
      channelGainDb: Object.freeze(channelGainDb),
      channelDelayMs: Object.freeze(channelDelayMs),
      channelAzimuthDeg: Object.freeze(channelAzimuthDeg),
      customMatrix: Object.freeze(customMatrix),
      available,
      actual,
      active: value.active === true,
      controlAvailable: value.controlAvailable === true
        || (value.controlAvailable !== false && configState !== 'corrupt'),
      configState,
      nativeBackendAvailable: value.nativeBackendAvailable === true,
      nativeChainActive: value.nativeChainActive === true,
      availability: safeDiagnosticToken(value.availability, actual ? 'available' : 'native-route-not-connected'),
      outputChannels: [0, 6, 8].includes(Number(value.outputChannels)) ? Number(value.outputChannels) : 0,
      activeRevision,
      stagedRevision,
      lastResult,
      layoutPending,
      transitionPending,
      output,
      processCalls: safeCounter(value.processCalls),
      channelPeak: available && actual && channelPeak && channelRms ? Object.freeze(channelPeak) : null,
      channelRms: available && actual && channelPeak && channelRms ? Object.freeze(channelRms) : null,
      channelTelemetryAzimuthDeg: available && actual && channelPeak && channelRms && telemetryAzimuth
        ? Object.freeze(telemetryAzimuth)
        : null,
      physicalMultichannel: false
    });
  }

  function defaultFamilyLayout() {
    return FAMILIES.map((family, order) => ({
      id: family.id,
      order,
      visible: true,
      collapsed: false,
      density: 'normal'
    }));
  }

  function normalizeFamilyLayout(value) {
    const fallback = defaultFamilyLayout();
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.families)) return fallback;
    const known = new Set(FAMILIES.map((family) => family.id));
    const received = new Map();
    value.families.slice(0, FAMILIES.length * 2).forEach((entry) => {
      if (!isRecord(entry) || !known.has(entry.id) || received.has(entry.id)) return;
      const order = Number(entry.order);
      received.set(entry.id, {
        id: entry.id,
        order: Number.isSafeInteger(order) ? Math.max(0, Math.min(FAMILIES.length - 1, order)) : FAMILIES.length - 1,
        visible: entry.visible !== false,
        collapsed: entry.collapsed === true,
        density: FAMILY_DENSITIES.includes(entry.density) ? entry.density : 'normal'
      });
    });
    fallback.forEach((entry) => {
      if (!received.has(entry.id)) received.set(entry.id, entry);
    });
    return [...received.values()]
      .sort((left, right) => left.order - right.order
        || FAMILIES.findIndex((family) => family.id === left.id)
          - FAMILIES.findIndex((family) => family.id === right.id))
      .map((entry, order) => ({ ...entry, order }));
  }

  class MixerHttpError extends Error {
    constructor(status, payload) {
      super('audio mixer request failed');
      this.name = 'MixerHttpError';
      this.status = status;
      this.payload = payload;
    }
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteNumber(value, minimum, maximum, name) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new TypeError(`Invalid audio mixer parameter: ${name}`);
    }
    return number;
  }

  function normalizeParameters(value) {
    if (!isRecord(value)) throw new TypeError('Invalid audio mixer parameters');
    const normalized = {};
    SIMPLE_PARAMETER_KEYS.forEach((key) => {
      if (!Object.hasOwn(value, key)) throw new TypeError(`Missing audio mixer parameter: ${key}`);
      if (BOOLEAN_PARAMETERS.has(key)) {
        if (typeof value[key] !== 'boolean') throw new TypeError(`Invalid audio mixer parameter: ${key}`);
        normalized[key] = value[key];
        return;
      }
      const enumDefinition = ENUM_PARAMETERS[key];
      if (enumDefinition) {
        if (!enumDefinition.options.some((option) => option.value === value[key])) {
          throw new TypeError(`Invalid audio mixer parameter: ${key}`);
        }
        normalized[key] = value[key];
        return;
      }
      const definition = NUMERIC_PARAMETERS[key];
      if (!definition) throw new TypeError(`Invalid audio mixer parameter: ${key}`);
      normalized[key] = finiteNumber(value[key], definition.min, definition.max, key);
    });
    if (!Array.isArray(value.eqDb) || value.eqDb.length !== EQ_FREQUENCIES.length) {
      throw new TypeError('Invalid audio mixer parameter: eqDb');
    }
    normalized.eqDb = value.eqDb.map((entry) => finiteNumber(entry, -12, 12, 'eqDb'));
    return normalized;
  }

  function normalizeSnapshot(value) {
    if (!isRecord(value) || value.ok !== true) throw new TypeError('Invalid audio mixer response');
    if (value.version !== 1 || value.presetVersion !== 1) {
      throw new TypeError('Unsupported audio mixer state version');
    }
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
      throw new TypeError('Invalid audio mixer revision');
    }
    const selectedPreset = PRESET_IDS.has(value.selectedPreset) || value.selectedPreset === 'custom'
      ? value.selectedPreset
      : 'custom';
    const nativeChainActive = value.nativeChainActive === true;
    return {
      version: 1,
      presetVersion: 1,
      revision: value.revision,
      selectedPreset,
      configState: typeof value.configState === 'string' ? value.configState : 'unknown',
      parameters: normalizeParameters(value.parameters),
      nativeBackendAvailable: value.nativeBackendAvailable === true,
      nativeChainActive,
      mixerAvailable: value.mixerAvailable === true,
      mixerActive: value.mixerActive === true,
      mixerEnabled: value.mixerEnabled !== false,
      mixerFailureDisabled: value.mixerFailureDisabled === true,
      bypassReason: typeof value.bypassReason === 'string' ? value.bypassReason : '',
      lastResult: Number.isFinite(Number(value.lastResult)) ? Number(value.lastResult) : 0,
      processCalls: safeCounter(value.processCalls),
      bypassedBlocks: safeCounter(value.bypassedBlocks),
      processFailures: safeCounter(value.processFailures),
      consecutiveFailures: safeCounter(value.consecutiveFailures),
      partialFailureBypasses: safeCounter(value.partialFailureBypasses),
      activeRevision: safeCounter(value.activeRevision),
      stagedRevision: safeCounter(value.stagedRevision),
      spatialMigrationNeeded: value.spatialMigrationNeeded === true,
      spatialRoute: [
        'stereo-mixer-out',
        'upmix-mixer-non-obr-out',
        'stereo-mixer-obr',
        'upmix-mixer-x3d-obr'
      ].includes(value.spatialRoute) ? value.spatialRoute : 'stereo-mixer-out',
      upmix: normalizeDiagnostic(value.upmix, 'upmix', nativeChainActive),
      obr: normalizeDiagnostic(value.obr, 'obr', nativeChainActive),
      order: normalizeOrder(value.order),
      playbackState: ['native-mixer', 'native-mixer-bypassed', 'browser-compatible']
        .includes(value.playbackState)
        ? value.playbackState
        : 'browser-compatible'
    };
  }

  function safeCounter(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function safeDiagnosticToken(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 48 && /^[\w .+()-]+$/u.test(trimmed) ? trimmed : fallback;
  }

  function normalizeDiagnostic(value, kind, chainActive) {
    if (!isRecord(value)) {
      return Object.freeze({
        available: false,
        enabled: false,
        active: false,
        label: '',
        algorithm: '',
        outputLayout: '',
        outputChannels: 0,
        filterProfile: '',
        bypassReason: kind === 'obr' ? 'dry-through' : 'disabled',
        processCalls: 0,
        fallbackBlocks: 0,
        lastResult: 0
      });
    }
    const enabled = value.enabled === true;
    const reportedActive = kind === 'obr'
      ? (typeof value.active === 'boolean' ? value.active : value.rendererReady === true)
      : value.active === true;
    const active = enabled && reportedActive;
    const outputChannels = Number(value.outputChannels);
    return Object.freeze({
      available: value.available === true || active || (chainActive && Object.keys(value).length > 0),
      enabled,
      active,
      label: safeDiagnosticToken(value.algorithm || value.backend),
      algorithm: safeDiagnosticToken(value.algorithm),
      outputLayout: value.outputLayout === '7.1' ? '7.1' : value.outputLayout === '5.1' ? '5.1' : '',
      outputChannels: Number.isSafeInteger(outputChannels) && outputChannels > 0
        ? outputChannels
        : 0,
      filterProfile: safeDiagnosticToken(value.filterProfile),
      bypassReason: safeDiagnosticToken(
        value.bypassReason,
        enabled ? '' : kind === 'obr' ? 'dry-through' : 'disabled'
      ),
      processCalls: safeCounter(value.processCalls),
      fallbackBlocks: safeCounter(value.fallbackBlocks),
      lastResult: Number.isFinite(Number(value.lastResult)) ? Math.trunc(Number(value.lastResult)) : 0
    });
  }

  function normalizeOrder(value) {
    if (!isRecord(value)) return Object.freeze({});
    const result = {};
    ['upmix', 'mixer', 'obr'].forEach((key) => {
      const ordinal = Number(value[key]);
      if (Number.isSafeInteger(ordinal) && ordinal >= 0) result[key] = ordinal;
    });
    return Object.freeze(result);
  }

  function frozenParametersSnapshot(value) {
    return Object.freeze({
      ...value,
      eqDb: Object.freeze([...(value?.eqDb || [])])
    });
  }

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

  function formatValue(value, definition) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    const digits = definition.step < 0.1 ? 2 : definition.step < 1 ? 1 : 0;
    const rendered = numeric.toFixed(digits).replace(/\.0$/, '');
    return definition.unit ? `${rendered} ${definition.unit}` : rendered;
  }

  function playbackCopy(state) {
    if (state === 'native-mixer') return '原生调音链已生效';
    if (state === 'native-mixer-bypassed') return '原生调音链已旁路，当前调音设置未生效';
    return '兼容播放：未进入原生调音链，调音设置未生效';
  }

  function bypassCopy(reason) {
    const messages = {
      disabled: '调音台已关闭',
      'dll-unavailable': '调音组件不可用',
      'abi-mismatch': '调音组件版本不匹配',
      'symbol-missing': '调音组件不完整',
      'create-failed': '调音台初始化失败',
      'scratch-unavailable': '调音缓冲区不可用',
      'process-failed': '调音处理失败',
      'failure-disabled': '连续处理失败后已安全旁路',
      'process-failure-disabled': '连续处理失败后已安全旁路',
      'native-backend-unavailable': '原生音频后端不可用',
      'pipeline-inactive': '原生音频链尚未启动',
      'commit-busy': '调音参数正在等待音频线程接收',
      'parameter-submit-failed': '调音参数提交失败'
    };
    return messages[reason] || '调音链当前未生效';
  }

  function safeErrorCopy(error, action) {
    if (error instanceof MixerHttpError) {
      if (error.status === 409) return '设置版本发生冲突，正在刷新最新状态';
      if (error.status === 400) return `${action}失败：参数未通过校验`;
      if (error.status === 403) return `${action}失败：当前页面无权访问本地调音台`;
      if (error.status === 500) return `${action}失败：调音台状态暂不可用`;
      return `${action}失败（HTTP ${error.status}）`;
    }
    return `${action}失败，请稍后重试`;
  }

  async function requestJson(path, options = {}) {
    const response = await global.fetch(path, {
      method: options.method || 'GET',
      cache: 'no-store',
      credentials: 'omit',
      ...(options.body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(options.body)
      })
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok) throw new MixerHttpError(response.status, payload);
    if (!isRecord(payload)) throw new TypeError('Invalid audio mixer response');
    return payload;
  }

  function mount(container, options = {}) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new TypeError('Audio mixer UI container is required');
    }
    const previous = mounted.get(container);
    if (previous) return previous;

    const document = container.ownerDocument || global.document;
    const ensureNativeChain = typeof options.ensureNativeChain === 'function'
      ? options.ensureNativeChain
      : null;
    const getNativeChannelLayout = typeof options.getNativeChannelLayout === 'function'
      ? options.getNativeChannelLayout
      : () => '5.1';
    const setNativeChannelLayout = typeof options.setNativeChannelLayout === 'function'
      ? options.setNativeChannelLayout
      : null;
    const instanceId = `fe-audio-mixer-${++mountSequence}`;
    const controls = new Map();
    const valueOutputs = new Map();
    const numericInputs = new Map();
    const presetButtons = new Map();
    const availablePresets = new Set();
    const familySections = new Map();
    const familyBodies = new Map();
    const familyVisibilityControls = new Map();
    const familyCollapseControls = new Map();
    const familyDensityControls = new Map();
    let familyStorage = null;
    try {
      familyStorage = options.familyLayoutStorage || global.localStorage || null;
      if (typeof familyStorage?.getItem !== 'function' || typeof familyStorage?.setItem !== 'function') {
        familyStorage = null;
      }
    } catch {
      familyStorage = null;
    }
    let familyLayout = defaultFamilyLayout();
    try {
      const serializedLayout = familyStorage?.getItem(FAMILY_LAYOUT_STORAGE_KEY);
      familyLayout = serializedLayout
        ? normalizeFamilyLayout(JSON.parse(serializedLayout))
        : defaultFamilyLayout();
    } catch {
      familyLayout = defaultFamilyLayout();
    }
    let dragFamilyId = '';
    let serverState = null;
    let localParameters = null;
    let pendingPatch = {};
    let debounceTimer = 0;
    let keyboardPatchDeadline = 0;
    let operationTail = Promise.resolve();
    let operationCount = 0;
    let passiveRefreshPromise = null;
    let passiveRefreshQueued = false;
    let destroyed = false;
    let readyState = 'loading';
    let lastStatus = '正在读取调音台设置…';
    let automaticPatchRetryBudget = 1;
    let initialMigrationNotified = false;
    let visualsController = null;
    let ownedTelemetrySource = null;
    let ownedTelemetryActive = true;
    let telemetryActivationTimer = 0;
    let settingsTelemetryListener = null;
    let channelRouterState = null;
    let channelDraft = null;
    let channelPendingPatch = {};
    let channelDebounceTimer = 0;
    let channelOperationTail = Promise.resolve();
    let channelOperationCount = 0;
    let channelReadyState = 'loading';

    const root = node(document, 'div', {
      className: 'audio-mixer-ui',
      dataset: { mixerReady: 'false', selectedPreset: '' }
    });
    root.setAttribute('aria-busy', 'true');

    const overview = node(document, 'section', {
      className: 'audio-mixer-overview',
      attributes: { 'aria-labelledby': `${instanceId}-title` }
    });
    const title = node(document, 'h2', { text: '调音台', attributes: { id: `${instanceId}-title` } });
    const description = node(document, 'p', {
      text: '音频按“立体声（可选上混）→ 调音台 → 可选 OBR”处理；关闭任一空间模块不会关闭调音台。'
    });
    const playback = node(document, 'p', {
      className: 'audio-mixer-playback-state',
      text: '正在检测原生音频链…',
      dataset: { mixerPlaybackState: '', playbackState: 'loading' }
    });
    const revision = node(document, 'span', {
      className: 'audio-mixer-revision',
      text: '修订 —',
      dataset: { mixerRevision: '' }
    });
    const channelLayoutControl = node(document, 'label', {
      className: 'audio-mixer-channel-layout'
    });
    const channelLayoutLabel = node(document, 'span', { text: '旧版声道切换（兼容）' });
    const channelLayoutSelect = node(document, 'select', {
      attributes: { 'aria-label': '选择原生调音链声道布局' },
      dataset: { mixerChannelLayout: '' }
    });
    ['5.1', '7.1'].forEach((layout) => {
      const option = node(document, 'option', { text: layout });
      option.value = layout;
      channelLayoutSelect.appendChild(option);
    });
    channelLayoutSelect.value = normalizeChannelLayout(getNativeChannelLayout());
    channelLayoutSelect.disabled = true;
    channelLayoutControl.append(channelLayoutLabel, channelLayoutSelect);
    const status = node(document, 'p', {
      className: 'audio-mixer-status',
      text: lastStatus,
      attributes: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      dataset: { mixerStatus: '', tone: 'neutral' }
    });
    const retryButton = node(document, 'button', {
      className: 'audio-mixer-retry',
      text: '重试原生链',
      attributes: { type: 'button', 'aria-label': '重新提交当前设置并重试原生调音链' },
      dataset: { mixerRetry: '' }
    });
    retryButton.disabled = true;
    overview.append(title, description, playback, revision, channelLayoutControl, status, retryButton);

    const presetsSection = node(document, 'section', {
      className: 'audio-mixer-presets',
      attributes: { 'aria-labelledby': `${instanceId}-presets-title` }
    });
    presetsSection.appendChild(node(document, 'h3', {
      text: '效果预设',
      attributes: { id: `${instanceId}-presets-title` }
    }));
    const presetGrid = node(document, 'div', {
      className: 'audio-mixer-preset-grid',
      attributes: { role: 'group', 'aria-label': '调音台效果预设' }
    });
    PRESET_IDENTITIES.forEach((preset) => {
      const button = node(document, 'button', {
        className: 'audio-mixer-preset',
        text: preset.label,
        attributes: {
          type: 'button',
          'aria-label': preset.label,
          'aria-pressed': 'false'
        },
        dataset: { mixerPresetId: preset.id }
      });
      button.disabled = true;
      button.addEventListener('click', () => applyPreset(preset.id));
      presetButtons.set(preset.id, button);
      presetGrid.appendChild(button);
    });
    const customState = node(document, 'p', {
      className: 'audio-mixer-custom-state',
      text: '当前：等待载入',
      dataset: { mixerCustomState: '' }
    });
    presetsSection.append(presetGrid, customState);

    const visualsHost = node(document, 'div', {
      className: 'audio-mixer-visuals-host',
      dataset: { mixerVisualsHost: '' }
    });
    const familyToolbar = node(document, 'fieldset', {
      className: 'audio-mixer-family-toolbar',
      attributes: { 'aria-label': '显示或隐藏调音参数模块' }
    });
    familyToolbar.appendChild(node(document, 'legend', { text: '参数模块' }));
    const familyChooser = node(document, 'div', {
      className: 'audio-mixer-family-chooser',
      attributes: { role: 'group', 'aria-label': '参数模块显示选择' }
    });
    FAMILIES.forEach((family) => {
      const chooserLabel = node(document, 'label', {
        className: 'audio-mixer-family-visibility',
        attributes: { title: `显示或隐藏${family.label}参数模块` }
      });
      const chooserInput = node(document, 'input', {
        attributes: { type: 'checkbox', 'aria-label': `显示${family.label}参数模块` },
        dataset: { mixerFamilyVisibility: family.id }
      });
      chooserInput.type = 'checkbox';
      chooserInput.checked = true;
      chooserInput.addEventListener('change', () => setFamilyVisibility(family.id, chooserInput.checked));
      chooserLabel.append(chooserInput, node(document, 'span', { text: family.label }));
      familyChooser.appendChild(chooserLabel);
      familyVisibilityControls.set(family.id, chooserInput);
    });
    familyToolbar.appendChild(familyChooser);

    const parameters = node(document, 'div', { className: 'audio-mixer-parameters' });
    FAMILIES.forEach((family) => {
      const familyTitleId = `${instanceId}-${family.id}-title`;
      const section = node(document, 'section', {
        className: `audio-mixer-family audio-mixer-family-${family.id}`,
        attributes: { 'aria-labelledby': familyTitleId },
        dataset: { mixerFamily: family.id, collapsed: 'false', density: 'normal' }
      });
      const familyHeader = node(document, 'header', { className: 'audio-mixer-family-header' });
      const familyHeading = node(document, 'div', { className: 'audio-mixer-family-heading' });
      familyHeading.append(
        node(document, 'h3', { text: family.label, attributes: { id: familyTitleId } }),
        node(document, 'p', { className: 'audio-mixer-family-description', text: family.description })
      );
      const familyTools = node(document, 'div', {
        className: 'audio-mixer-family-tools',
        attributes: { role: 'group', 'aria-label': `${family.label}模块布局操作` }
      });
      const dragButton = node(document, 'button', {
        className: 'audio-mixer-family-tool audio-mixer-family-drag',
        text: '⋮⋮',
        attributes: {
          type: 'button',
          draggable: 'true',
          title: `拖拽移动${family.label}；Alt+方向键可排序`,
          'aria-label': `移动${family.label}参数模块，按 Alt 加上下方向键排序`
        },
        dataset: { mixerFamilyDrag: family.id }
      });
      dragButton.draggable = true;
      dragButton.addEventListener('dragstart', (event) => {
        dragFamilyId = family.id;
        section.dataset.dragging = 'true';
        event.dataTransfer?.setData('text/plain', family.id);
      });
      dragButton.addEventListener('dragend', () => {
        dragFamilyId = '';
        section.dataset.dragging = 'false';
      });
      dragButton.addEventListener('keydown', (event) => {
        if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        moveFamily(family.id, event.key === 'ArrowUp' ? -1 : 1);
      });
      const densityButton = node(document, 'button', {
        className: 'audio-mixer-family-tool audio-mixer-family-density',
        text: '密度',
        attributes: {
          type: 'button',
          title: `切换${family.label}模块密度`,
          'aria-label': `切换${family.label}参数模块密度`
        },
        dataset: { mixerFamilyDensity: family.id }
      });
      densityButton.addEventListener('click', () => cycleFamilyDensity(family.id));
      const collapseButton = node(document, 'button', {
        className: 'audio-mixer-family-tool audio-mixer-family-collapse',
        text: '⌃',
        attributes: {
          type: 'button',
          title: `折叠${family.label}参数模块`,
          'aria-label': `折叠${family.label}参数模块`,
          'aria-expanded': 'true'
        },
        dataset: { mixerFamilyCollapse: family.id }
      });
      collapseButton.addEventListener('click', () => toggleFamilyCollapsed(family.id));
      familyTools.append(dragButton, densityButton, collapseButton);
      familyHeader.append(familyHeading, familyTools);
      const grid = node(document, 'div', {
        className: 'audio-mixer-control-grid',
        dataset: { mixerFamilyBody: family.id }
      });
      family.controls.forEach((definition) => {
        if (definition.type === 'equalizer') {
          EQ_FREQUENCIES.forEach((frequency, index) => {
            const label = frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
            grid.appendChild(createRangeControl({
              key: 'eqDb',
              label,
              min: -12,
              max: 12,
              step: 0.1,
              unit: 'dB',
              eqIndex: index,
              frequency
            }));
          });
          return;
        }
        if (definition.type === 'boolean') {
          grid.appendChild(createBooleanControl(definition.key, definition.label));
          return;
        }
        if (definition.type === 'enum') {
          grid.appendChild(createEnumControl(definition.key, ENUM_PARAMETERS[definition.key]));
          return;
        }
        grid.appendChild(createRangeControl({ key: definition.key, ...NUMERIC_PARAMETERS[definition.key] }));
      });
      section.append(familyHeader, grid);
      section.addEventListener('dragover', (event) => event.preventDefault());
      section.addEventListener('drop', (event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer?.getData('text/plain') || dragFamilyId;
        reorderFamily(sourceId, family.id);
      });
      familySections.set(family.id, section);
      familyBodies.set(family.id, grid);
      familyCollapseControls.set(family.id, collapseButton);
      familyDensityControls.set(family.id, densityButton);
      parameters.appendChild(section);
    });

    function saveFamilyLayout() {
      if (!familyStorage) return false;
      try {
        familyStorage.setItem(FAMILY_LAYOUT_STORAGE_KEY, JSON.stringify({
          version: 1,
          families: familyLayout.map((entry, order) => ({ ...entry, order }))
        }));
        return true;
      } catch {
        return false;
      }
    }

    function applyFamilyLayout({ persist = false } = {}) {
      familyLayout = normalizeFamilyLayout({ version: 1, families: familyLayout });
      familyLayout.forEach((entry) => {
        const section = familySections.get(entry.id);
        const body = familyBodies.get(entry.id);
        const chooser = familyVisibilityControls.get(entry.id);
        const collapse = familyCollapseControls.get(entry.id);
        const density = familyDensityControls.get(entry.id);
        if (!section || !body) return;
        parameters.appendChild(section);
        section.hidden = !entry.visible;
        section.dataset.collapsed = String(entry.collapsed);
        section.dataset.density = entry.density;
        body.hidden = entry.collapsed;
        if (chooser) chooser.checked = entry.visible;
        if (collapse) {
          collapse.textContent = entry.collapsed ? '⌄' : '⌃';
          collapse.setAttribute('aria-expanded', String(!entry.collapsed));
          collapse.setAttribute('title', `${entry.collapsed ? '展开' : '折叠'}${FAMILIES.find((item) => item.id === entry.id)?.label || ''}参数模块`);
        }
        if (density) {
          const densityCopy = entry.density === 'compact' ? '紧凑' : entry.density === 'wide' ? '宽幅' : '标准';
          density.textContent = densityCopy;
          density.setAttribute('aria-label', `切换${FAMILIES.find((item) => item.id === entry.id)?.label || ''}参数模块密度，当前${densityCopy}`);
          density.setAttribute('title', `当前${densityCopy}密度；点击切换`);
        }
      });
      if (persist) saveFamilyLayout();
    }

    function setFamilyVisibility(id, visible) {
      if (!familySections.has(id)) return false;
      familyLayout = familyLayout.map((entry) => entry.id === id ? { ...entry, visible: visible === true } : entry);
      applyFamilyLayout({ persist: true });
      return true;
    }

    function toggleFamilyCollapsed(id) {
      const current = familyLayout.find((entry) => entry.id === id);
      if (!current) return false;
      familyLayout = familyLayout.map((entry) => entry.id === id
        ? { ...entry, collapsed: !entry.collapsed }
        : entry);
      applyFamilyLayout({ persist: true });
      return true;
    }

    function cycleFamilyDensity(id) {
      const current = familyLayout.find((entry) => entry.id === id);
      if (!current) return false;
      const nextIndex = (FAMILY_DENSITIES.indexOf(current.density) + 1) % FAMILY_DENSITIES.length;
      familyLayout = familyLayout.map((entry) => entry.id === id
        ? { ...entry, density: FAMILY_DENSITIES[nextIndex] }
        : entry);
      applyFamilyLayout({ persist: true });
      return true;
    }

    function reorderFamily(sourceId, targetId) {
      if (sourceId === targetId || !familySections.has(sourceId) || !familySections.has(targetId)) return false;
      const ordered = familyLayout.map((entry) => ({ ...entry }));
      const sourceIndex = ordered.findIndex((entry) => entry.id === sourceId);
      const targetIndex = ordered.findIndex((entry) => entry.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return false;
      const [source] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, source);
      familyLayout = ordered.map((entry, order) => ({ ...entry, order }));
      applyFamilyLayout({ persist: true });
      return true;
    }

    function moveFamily(id, delta) {
      const sourceIndex = familyLayout.findIndex((entry) => entry.id === id);
      if (sourceIndex < 0) return false;
      const targetIndex = Math.max(0, Math.min(familyLayout.length - 1, sourceIndex + Math.sign(delta)));
      if (targetIndex === sourceIndex) return false;
      return reorderFamily(id, familyLayout[targetIndex].id);
    }

    applyFamilyLayout();

    const channelPanel = node(document, 'section', {
      className: 'audio-mixer-channel-panel',
      attributes: { 'aria-labelledby': `${instanceId}-channel-panel-title` },
      dataset: { mixerChannelPanel: '', state: 'loading' }
    });
    const channelPanelHeader = node(document, 'header', { className: 'audio-mixer-channel-panel__header' });
    const channelPanelHeading = node(document, 'div', { className: 'audio-mixer-channel-panel__heading' });
    channelPanelHeading.append(
      node(document, 'h3', {
        text: '独立逐声道路由',
        attributes: { id: `${instanceId}-channel-panel-title` }
      }),
      node(document, 'p', {
        text: '逐声道参数作用于虚拟 5.1 / 7.1 声床；OBR 将声床渲染为耳机双声道。'
      })
    );
    const channelPhysicalOutput = node(document, 'p', {
      className: 'audio-mixer-channel-physical-output',
      text: '物理输出：双声道 / 耳机（不声称物理多声道）',
      dataset: { mixerChannelPhysicalOutput: '' }
    });
    channelPanelHeader.append(channelPanelHeading, channelPhysicalOutput);

    const channelToolbar = node(document, 'div', {
      className: 'audio-mixer-channel-toolbar',
      attributes: { role: 'group', 'aria-label': '逐声道路由设置' }
    });
    const channelRouterLayout = node(document, 'select', {
      attributes: { 'aria-label': '选择虚拟声床布局' },
      dataset: { mixerChannelRouterLayout: '' }
    });
    ['stereo', '5.1', '7.1'].forEach((layout) => {
      const option = node(document, 'option', { text: layout === 'stereo' ? 'Stereo 2.0（关闭上混）' : `虚拟 ${layout}` });
      option.value = layout;
      channelRouterLayout.appendChild(option);
    });
    const channelLayoutLabelControl = node(document, 'label', { className: 'audio-mixer-channel-toolbar__control' });
    channelLayoutLabelControl.append(node(document, 'span', { text: '声床布局' }), channelRouterLayout);

    const channelAlgorithm = node(document, 'select', {
      attributes: { 'aria-label': '选择逐声道上混算法' },
      dataset: { mixerChannelAlgorithm: '' }
    });
    CHANNEL_ALGORITHMS.forEach((definition) => {
      const option = node(document, 'option', { text: definition.label });
      option.value = definition.value;
      option.disabled = definition.disabled === true;
      if (option.disabled) option.setAttribute('aria-disabled', 'true');
      channelAlgorithm.appendChild(option);
    });
    const channelAlgorithmLabelControl = node(document, 'label', { className: 'audio-mixer-channel-toolbar__control' });
    channelAlgorithmLabelControl.append(node(document, 'span', { text: '上混算法' }), channelAlgorithm);

    const lfeCrossoverRange = node(document, 'input', {
      attributes: {
        type: 'range', min: '20', max: '500', step: '1',
        'aria-label': 'LFE 低通分频点滑杆', title: 'LFE 低通分频点，20 到 500 Hz'
      },
      dataset: { mixerChannelLfeCrossoverRange: '' }
    });
    lfeCrossoverRange.type = 'range';
    const lfeCrossoverNumber = node(document, 'input', {
      attributes: {
        type: 'number', min: '20', max: '500', step: '1',
        'aria-label': '手动输入 LFE 低通分频点'
      },
      dataset: { mixerChannelLfeCrossover: '' }
    });
    lfeCrossoverNumber.type = 'number';
    const lfeCrossoverControl = node(document, 'label', { className: 'audio-mixer-channel-toolbar__control audio-mixer-channel-toolbar__control--number' });
    lfeCrossoverControl.append(
      node(document, 'span', { text: 'LFE 分频' }),
      lfeCrossoverRange,
      lfeCrossoverNumber,
      node(document, 'span', { text: 'Hz', attributes: { 'aria-hidden': 'true' } })
    );
    channelToolbar.append(channelLayoutLabelControl, channelAlgorithmLabelControl, lfeCrossoverControl);

    const channelStrips = node(document, 'div', {
      className: 'audio-mixer-channel-strips',
      attributes: { 'aria-label': '逐声道增益、延迟和方位角' }
    });

    const matrixSection = node(document, 'section', {
      className: 'audio-mixer-custom-matrix',
      attributes: { 'aria-labelledby': `${instanceId}-matrix-title` }
    });
    matrixSection.append(
      node(document, 'h4', { text: 'Custom Matrix · L/R → 8 声道', attributes: { id: `${instanceId}-matrix-title` } }),
      node(document, 'p', { text: '16 个系数按输出声道逐行排列；仅 Custom Matrix 算法会消费这些值。' })
    );
    const matrixGrid = node(document, 'div', { className: 'audio-mixer-custom-matrix__grid' });
    const matrixInputs = [];
    for (let index = 0; index < 16; index += 1) {
      const row = Math.floor(index / 2);
      const column = index % 2 === 0 ? 'L' : 'R';
      const label = node(document, 'label', { className: 'audio-mixer-custom-matrix__cell' });
      const input = node(document, 'input', {
        attributes: {
          type: 'number', min: '-2', max: '2', step: '0.01',
          'aria-label': `矩阵第 ${row + 1} 行 ${column} 输入系数`,
          title: '自定义矩阵系数，范围 -2 到 2'
        },
        dataset: { mixerChannelMatrixCell: String(index) }
      });
      input.type = 'number';
      input.disabled = true;
      input.addEventListener('input', () => recordChannelMatrixValue(index, input.value));
      label.append(node(document, 'span', { text: `${row + 1}${column}` }), input);
      matrixGrid.appendChild(label);
      matrixInputs.push(input);
    }
    matrixSection.appendChild(matrixGrid);

    const channelStatus = node(document, 'p', {
      className: 'audio-mixer-channel-status',
      text: '正在读取逐声道路由…',
      attributes: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
      dataset: { mixerChannelStatus: '', tone: 'neutral' }
    });
    channelPanel.append(channelPanelHeader, channelToolbar, channelStrips, matrixSection, channelStatus);

    channelRouterLayout.addEventListener('change', () => {
      changeEffectiveChannelLayout(normalizeEffectiveChannelLayout(channelRouterLayout.value));
    });
    channelAlgorithm.addEventListener('change', () => {
      if (!channelRouterState || !SELECTABLE_CHANNEL_ALGORITHMS.has(channelAlgorithm.value)) {
        channelAlgorithm.value = channelRouterState?.algorithm || 'matrix-decode';
        return;
      }
      submitImmediateChannelPatch({ algorithm: channelAlgorithm.value });
    });
    const recordLfeCrossover = (source, counterpart) => {
      if (!channelRouterState) return;
      const value = Math.min(500, Math.max(20, Number(source.value)));
      if (!Number.isFinite(value)) return;
      source.value = String(value);
      counterpart.value = String(value);
      recordChannelPatchValue('lfeCrossoverHz', value);
    };
    lfeCrossoverRange.addEventListener('input', () => recordLfeCrossover(lfeCrossoverRange, lfeCrossoverNumber));
    lfeCrossoverNumber.addEventListener('input', () => recordLfeCrossover(lfeCrossoverNumber, lfeCrossoverRange));

    const diagnostics = node(document, 'section', {
      className: 'audio-mixer-diagnostics',
      attributes: { 'aria-labelledby': `${instanceId}-diagnostics-title` }
    });
    diagnostics.appendChild(node(document, 'h3', {
      text: '音频链诊断',
      attributes: { id: `${instanceId}-diagnostics-title` }
    }));
    const upmixDiagnostic = node(document, 'p', {
      text: '上混：等待状态',
      dataset: { mixerDiagnostic: 'upmix' }
    });
    const obrDiagnostic = node(document, 'p', {
      text: 'OBR：等待状态',
      dataset: { mixerDiagnostic: 'obr' }
    });
    const mixerDiagnostic = node(document, 'p', {
      text: 'Mixer：等待状态',
      dataset: { mixerDiagnostic: 'mixer' }
    });
    diagnostics.append(upmixDiagnostic, mixerDiagnostic, obrDiagnostic);
    root.append(overview, visualsHost, presetsSection, familyToolbar, parameters, channelPanel, diagnostics);
    container.appendChild(root);

    if (global.FeAudioMixerVisuals?.mount) {
      try {
        let telemetrySource = options.telemetrySource;
        if (!telemetrySource && global.FeAudioMixerVisuals.createMediaElementTelemetrySource) {
          const mediaElement = document.getElementById?.('audio');
          if (mediaElement) {
            const settingsPanel = visualsHost.closest?.('.settings-center');
            ownedTelemetryActive = !settingsPanel;
            ownedTelemetrySource = global.FeAudioMixerVisuals.createMediaElementTelemetrySource(mediaElement, {
              isActive: () => ownedTelemetryActive
            });
            if (settingsPanel && typeof document.addEventListener === 'function') {
              settingsTelemetryListener = (event) => {
                const shouldActivate = event.detail?.open === true && event.detail?.selectedPage === 'mixer';
                if (telemetryActivationTimer) global.clearTimeout(telemetryActivationTimer);
                telemetryActivationTimer = 0;
                if (!shouldActivate) {
                  ownedTelemetryActive = false;
                  ownedTelemetrySource?.sleep?.('settings-closed');
                  return;
                }
                telemetryActivationTimer = global.setTimeout(() => {
                  telemetryActivationTimer = 0;
                  ownedTelemetryActive = true;
                  ownedTelemetrySource?.wake?.();
                }, 220);
              };
              document.addEventListener('fe-settings-center:change', settingsTelemetryListener);
            }
            telemetrySource = ownedTelemetrySource;
            visualsHost.dataset.mixerTelemetrySource = 'media-element';
          }
        } else if (telemetrySource) {
          visualsHost.dataset.mixerTelemetrySource = 'injected';
        }
        visualsController = global.FeAudioMixerVisuals.mount(visualsHost, {
          telemetrySource,
          storage: options.visualStorage,
          onSeek: options.onSeek,
          requestTestSignal: requestVisualChannelTestSignal,
          onAutomationChange: options.onAutomationChange,
          onChannelRouterChange: (patch) => (
            Object.hasOwn(patch || {}, 'layout')
              ? changeEffectiveChannelLayout(normalizeEffectiveChannelLayout(patch.layout))
              : submitImmediateChannelPatch(patch)
          ),
          onParameterChange: (key, value) => recordVisualParameter(key, value)
        });
      } catch {
        visualsHost.hidden = true;
      }
    } else {
      visualsHost.hidden = true;
    }

    function setChannelStatus(copy, tone = 'neutral') {
      channelStatus.textContent = copy;
      channelStatus.dataset.tone = tone;
    }

    function requestVisualChannelTestSignal(payload) {
      if (typeof options.requestTestSignal === 'function') return options.requestTestSignal(payload);
      const aliases = { L: 'FL', R: 'FR', C: 'FC', LFE: 'LFE', Lb: 'BL', Rb: 'BR', Ls: 'SL', Rs: 'SR' };
      return requestChannelTestSignal(aliases[payload?.channel] || '');
    }

    function channelCanEdit() {
      return channelRouterState?.controlAvailable === true;
    }

    function channelCanTest() {
      return channelRouterState?.available === true
        && channelRouterState.actual === true
        && channelRouterState.active === true
        && channelRouterState.transitionPending !== true;
    }

    function channelCommitState(snapshot) {
      if (!snapshot?.controlAvailable) return 'failure';
      if (snapshot.transitionPending || snapshot.layoutPending) return 'staged';
      if (snapshot.lastResult < 0 && /fail|error|disabled/u.test(snapshot.availability)) return 'failure';
      if (
        (snapshot.activeRevision >= snapshot.revision && snapshot.lastResult >= 0)
        || (snapshot.available && snapshot.active && snapshot.actual)
      ) return 'committed';
      return 'saved';
    }

    function renderChannelOutputCopy(snapshot) {
      if (!snapshot) return;
      if (snapshot.physicalMultichannel) {
        channelPhysicalOutput.textContent = '物理输出：多声道';
        return;
      }
      const output = snapshot.output || (localParameters?.obrEnabled
        ? 'binaural-2ch-headphones'
        : 'energy-matched-stereo-fold-down');
      channelPhysicalOutput.textContent = output === 'binaural-2ch-headphones'
        || output === 'virtual-bed-to-binaural-2ch'
        ? '物理输出：双声道 / 耳机（虚拟声床经 OBR 双耳渲染）'
        : '物理输出：双声道 / 耳机（能量匹配立体声折叠）';
    }

    function renderChannelCommitStatus(snapshot) {
      const state = channelCommitState(snapshot);
      if (state === 'staged') {
        setChannelStatus(
          `逐声道设置已保存，等待音频线程提交 · 修订 ${snapshot.revision}`
            + ` · active ${snapshot.activeRevision} / staged ${snapshot.stagedRevision}`,
          'warning'
        );
        return state;
      }
      if (state === 'failure') {
        setChannelStatus(
          `逐声道设置已保存，但音频线程提交失败 · 结果 ${snapshot.lastResult}；配置仍可调整。`,
          'error'
        );
        return state;
      }
      if (state === 'committed') {
        setChannelStatus(
          `逐声道设置已提交到音频线程 · 修订 ${snapshot.revision} · 处理 ${snapshot.processCalls} 块`
            + (snapshot.actual ? '' : '；当前暂停，实时电平不可用。'),
          snapshot.actual ? 'success' : 'warning'
        );
        return state;
      }
      setChannelStatus(
        `逐声道设置已保存 · 修订 ${snapshot.revision}；原生音频链尚未连接，实时电平不可用。`,
        'warning'
      );
      return state;
    }

    function channelControlInput(definition, channelId, index, value, kind) {
      const input = node(document, 'input', {
        attributes: {
          type: kind,
          min: definition.min,
          max: definition.max,
          step: definition.step,
          'aria-label': `${channelId} ${definition.label}${kind === 'range' ? '滑杆' : '数值'}`,
          title: `${CHANNEL_LABELS[channelId] || channelId}${definition.label}，范围 ${definition.min} 到 ${definition.max} ${definition.unit}`
        },
        dataset: kind === 'range'
          ? { mixerChannelRange: definition.key, mixerChannelIndex: String(index) }
          : { mixerChannelNumber: definition.key, mixerChannelIndex: String(index) }
      });
      input.type = kind;
      input.min = String(definition.min);
      input.max = String(definition.max);
      input.step = String(definition.step);
      input.value = String(value);
      return input;
    }

    function renderChannelStrips(snapshot) {
      channelStrips.replaceChildren();
      snapshot.channelOrder.forEach((channelId, index) => {
        const strip = node(document, 'article', {
          className: 'audio-mixer-channel-strip',
          attributes: { 'aria-label': `${channelId} ${CHANNEL_LABELS[channelId] || ''}声道` },
          dataset: { mixerChannelStrip: channelId, telemetry: snapshot.channelPeak ? 'live' : 'unavailable' }
        });
        const stripHeader = node(document, 'header', { className: 'audio-mixer-channel-strip__header' });
        const identity = node(document, 'div', { className: 'audio-mixer-channel-strip__identity' });
        identity.append(
          node(document, 'strong', { text: channelId }),
          node(document, 'span', { text: CHANNEL_LABELS[channelId] || channelId })
        );
        const peak = snapshot.channelPeak?.[index];
        const rms = snapshot.channelRms?.[index];
        const telemetryCopy = peak === undefined || rms === undefined
          ? 'Peak — · RMS —'
          : `Peak ${formatDbfs(peak)} · RMS ${formatDbfs(rms)}`;
        const meter = node(document, 'output', {
          className: 'audio-mixer-channel-strip__meter',
          text: telemetryCopy,
          dataset: { mixerChannelMeter: channelId }
        });
        const overload = node(document, 'span', {
          className: `audio-mixer-channel-strip__overload${Number(peak) >= 1 ? ' is-over' : ''}`,
          text: Number(peak) >= 1 ? 'OVER' : 'OK',
          attributes: { title: '逐声道过载指示' },
          dataset: { mixerChannelOverload: channelId }
        });
        stripHeader.append(identity, meter, overload);
        strip.appendChild(stripHeader);

        Object.entries(CHANNEL_ARRAY_PARAMETERS).forEach(([parameterKey, definition]) => {
          const row = node(document, 'label', { className: 'audio-mixer-channel-strip__control' });
          const current = channelDraft?.[parameterKey]?.[index] ?? snapshot[parameterKey][index];
          const range = channelControlInput(definition, channelId, index, current, 'range');
          const number = channelControlInput(definition, channelId, index, current, 'number');
          range.disabled = !channelCanEdit();
          number.disabled = !channelCanEdit();
          const commit = (source, counterpart) => {
            const numeric = Math.min(definition.max, Math.max(definition.min, Number(source.value)));
            if (!Number.isFinite(numeric) || !channelDraft) return;
            source.value = String(numeric);
            counterpart.value = String(numeric);
            const next = [...channelDraft[parameterKey]];
            next[index] = numeric;
            channelDraft[parameterKey] = next;
            recordChannelPatchValue(parameterKey, next);
          };
          range.addEventListener('input', () => commit(range, number));
          number.addEventListener('input', () => commit(number, range));
          row.append(
            node(document, 'span', { text: definition.label }),
            range,
            number,
            node(document, 'span', { text: definition.unit, attributes: { 'aria-hidden': 'true' } })
          );
          strip.appendChild(row);
        });

        const testButton = node(document, 'button', {
          className: 'audio-mixer-channel-test',
          text: '测试声道',
          attributes: {
            type: 'button',
            title: `${channelId} 有界 997 Hz / −18 dBFS / 500 ms 测试信号`,
            'aria-label': `播放 ${channelId} 声道测试信号`
          },
          dataset: { mixerChannelTest: channelId }
        });
        testButton.disabled = !channelCanTest();
        testButton.addEventListener('click', () => requestChannelTestSignal(channelId));
        strip.appendChild(testButton);
        channelStrips.appendChild(strip);
      });
    }

    function formatDbfs(value) {
      const amplitude = Number(value);
      if (!Number.isFinite(amplitude) || amplitude <= 0) return '−∞ dBFS';
      return `${Math.max(-120, 20 * Math.log10(amplitude)).toFixed(1)} dBFS`;
    }

    function effectiveChannelLayout() {
      if (localParameters && localParameters.upmixEnabled !== true) return 'stereo';
      if (localParameters?.upmixOutputLayout === '5.1' || localParameters?.upmixOutputLayout === '7.1') {
        return localParameters.upmixOutputLayout;
      }
      return channelRouterState?.layout || '5.1';
    }

    function syncEffectiveChannelLayout() {
      channelRouterLayout.value = effectiveChannelLayout();
      if (!channelRouterState) return;
      renderChannelOutputCopy(channelRouterState);
      visualsController?.updateChannelRouter?.({
        ...channelRouterState,
        active: localParameters?.upmixEnabled === true && channelRouterState.active === true
      });
    }

    function renderChannelRouter(snapshot) {
      if (destroyed) return false;
      if (channelRouterState && snapshot.revision < channelRouterState.revision) return false;
      channelRouterState = snapshot;
      channelDraft = {
        layout: snapshot.layout,
        algorithm: snapshot.algorithm,
        lfeCrossoverHz: snapshot.lfeCrossoverHz,
        channelGainDb: [...snapshot.channelGainDb],
        channelDelayMs: [...snapshot.channelDelayMs],
        channelAzimuthDeg: [...snapshot.channelAzimuthDeg],
        customMatrix: [...snapshot.customMatrix]
      };
      const commitState = channelCommitState(snapshot);
      channelPanel.dataset.state = commitState === 'committed' ? 'ready' : commitState;
      channelRouterLayout.value = snapshot.layout;
      channelAlgorithm.value = snapshot.algorithm;
      lfeCrossoverRange.value = String(snapshot.lfeCrossoverHz);
      lfeCrossoverNumber.value = String(snapshot.lfeCrossoverHz);
      matrixInputs.forEach((input, index) => {
        input.value = String(snapshot.customMatrix[index]);
        input.disabled = !channelCanEdit() || snapshot.algorithm !== 'custom-matrix';
      });
      renderChannelStrips(snapshot);
      channelRouterLayout.disabled = !channelCanEdit();
      channelAlgorithm.disabled = !channelCanEdit();
      lfeCrossoverRange.disabled = !channelCanEdit();
      lfeCrossoverNumber.disabled = !channelCanEdit();
      syncEffectiveChannelLayout();
      renderChannelCommitStatus(snapshot);
      return true;
    }

    function changeEffectiveChannelLayout(rawLayout) {
      if (destroyed || !serverState || !channelRouterState || !channelCanEdit()) return false;
      const layout = normalizeEffectiveChannelLayout(rawLayout);
      if (debounceTimer) global.clearTimeout(debounceTimer);
      debounceTimer = 0;
      keyboardPatchDeadline = 0;
      const mainPatch = {
        ...pendingPatch,
        upmixEnabled: layout !== 'stereo'
      };
      if (layout !== 'stereo') mainPatch.upmixOutputLayout = layout;
      pendingPatch = {};
      enqueueMutation(async () => {
        const mainCommitted = await submitPatch(mainPatch, false, { retryOnFailure: false });
        const mainApplied = mainCommitted
          && serverState?.parameters?.upmixEnabled === (layout !== 'stereo')
          && (layout === 'stereo' || serverState?.parameters?.upmixOutputLayout === layout);
        if (!mainApplied) {
          await Promise.allSettled([refreshFromServer(), refreshChannelRouter()]);
          syncEffectiveChannelLayout();
          setChannelStatus('主上混布局未能生效，逐声道路由未提交。', 'error');
          return;
        }
        if (layout === 'stereo') {
          syncEffectiveChannelLayout();
          setChannelStatus('已切换到 Stereo 2.0；逐声道声床设置保留但当前旁路。', 'success');
          return;
        }
        const channelApplied = await enqueueChannelMutation(() => submitChannelPatch({ layout }));
        if (!channelApplied) {
          await Promise.allSettled([refreshFromServer(), refreshChannelRouter()]);
          syncEffectiveChannelLayout();
          setChannelStatus('主上混已切换，但逐声道路由提交失败；已刷新有效状态。', 'error');
          return;
        }
        try {
          await Promise.all([refreshFromServer(), refreshChannelRouter()]);
        } catch {
          // Both successful commits are already rendered; a follow-up read is diagnostic only.
        }
        syncEffectiveChannelLayout();
      });
      return true;
    }

    function recordChannelMatrixValue(index, rawValue) {
      if (!channelDraft || channelDraft.algorithm !== 'custom-matrix') return false;
      const value = Math.min(2, Math.max(-2, Number(rawValue)));
      if (!Number.isFinite(value) || index < 0 || index >= 16) return false;
      matrixInputs[index].value = String(value);
      const next = [...channelDraft.customMatrix];
      next[index] = value;
      channelDraft.customMatrix = next;
      recordChannelPatchValue('customMatrix', next);
      return true;
    }

    function recordChannelPatchValue(key, value) {
      if (!channelRouterState || !CHANNEL_PATCH_KEYS.has(key) || !channelCanEdit()) return false;
      channelPendingPatch[key] = Array.isArray(value) ? [...value] : value;
      setChannelStatus('正在合并本次逐声道调整…');
      scheduleChannelPatch();
      return true;
    }

    function scheduleChannelPatch() {
      if (channelDebounceTimer) global.clearTimeout(channelDebounceTimer);
      channelDebounceTimer = global.setTimeout(() => {
        channelDebounceTimer = 0;
        const patch = channelPendingPatch;
        channelPendingPatch = {};
        if (Object.keys(patch).length) enqueueChannelMutation(() => submitChannelPatch(patch));
      }, PATCH_DEBOUNCE_MS);
    }

    function submitImmediateChannelPatch(patch) {
      if (!channelRouterState || !channelCanEdit()) return false;
      if (channelDebounceTimer) global.clearTimeout(channelDebounceTimer);
      channelDebounceTimer = 0;
      const combined = { ...channelPendingPatch, ...patch };
      channelPendingPatch = {};
      enqueueChannelMutation(() => submitChannelPatch(combined));
      return true;
    }

    function sanitizeChannelPatch(patch) {
      const safe = {};
      if (Object.hasOwn(patch, 'layout')) {
        if (!Object.hasOwn(CHANNEL_LAYOUTS, patch.layout)) throw new TypeError('Invalid channel router layout patch');
        safe.layout = patch.layout;
      }
      if (Object.hasOwn(patch, 'algorithm')) {
        if (!SELECTABLE_CHANNEL_ALGORITHMS.has(patch.algorithm)) throw new TypeError('Invalid channel router algorithm patch');
        safe.algorithm = patch.algorithm;
      }
      if (Object.hasOwn(patch, 'lfeCrossoverHz')) {
        safe.lfeCrossoverHz = finiteNumber(patch.lfeCrossoverHz, 20, 500, 'lfeCrossoverHz');
      }
      Object.entries(CHANNEL_ARRAY_PARAMETERS).forEach(([key, definition]) => {
        if (!Object.hasOwn(patch, key)) return;
        safe[key] = normalizeFixedArray(patch[key], 8, definition.min, definition.max, key);
      });
      if (Object.hasOwn(patch, 'customMatrix')) {
        safe.customMatrix = normalizeFixedArray(patch.customMatrix, 16, -2, 2, 'customMatrix');
      }
      return safe;
    }

    function enqueueChannelMutation(operation) {
      channelOperationCount += 1;
      const run = async () => {
        if (destroyed) return;
        channelPanel.setAttribute('aria-busy', 'true');
        try {
          return await operation();
        } finally {
          channelOperationCount -= 1;
          channelPanel.setAttribute('aria-busy', String(channelOperationCount > 0));
        }
      };
      const queued = channelOperationTail.then(run, run);
      channelOperationTail = queued.catch(() => {});
      return queued;
    }

    async function refreshChannelRouter() {
      const payload = await requestJson(CHANNELS_ENDPOINT);
      const snapshot = normalizeChannelRouterSnapshot(payload);
      renderChannelRouter(snapshot);
      channelReadyState = 'ready';
      return snapshot;
    }

    async function submitChannelPatch(patch) {
      if (!channelRouterState || destroyed) return false;
      const safePatch = sanitizeChannelPatch(patch);
      if (!Object.keys(safePatch).length) return false;
      try {
        const payload = await requestJson(CHANNELS_ENDPOINT, {
          method: 'PATCH',
          body: { expectedRevision: channelRouterState.revision, parameters: safePatch }
        });
        renderChannelRouter(normalizeChannelRouterSnapshot(payload));
        return true;
      } catch (error) {
        if (error instanceof MixerHttpError && error.status === 409) {
          try {
            await refreshChannelRouter();
            setChannelStatus('逐声道版本冲突，已刷新最新设置，请重新调整。', 'warning');
          } catch {
            setChannelStatus('逐声道版本冲突，且最新状态暂不可用。', 'error');
          }
          return false;
        }
        setChannelStatus(safeErrorCopy(error, '保存逐声道设置'), 'error');
        return false;
      }
    }

    async function requestChannelTestSignal(channelId) {
      if (
        !channelRouterState
        || !channelCanTest()
        || !channelRouterState.channelOrder.includes(channelId)
        || destroyed
      ) return false;
      return enqueueChannelMutation(async () => {
        setChannelStatus(`正在请求 ${channelId} 声道测试信号…`);
        try {
          const payload = await requestJson(CHANNEL_TEST_ENDPOINT, {
            method: 'POST',
            body: {
              layout: channelRouterState.layout,
              channel: channelId,
              kind: 'tone',
              durationMs: 500,
              frequencyHz: 997,
              gainDb: -18
            }
          });
          if (payload.accepted !== true) {
            setChannelStatus(`${channelId} 测试信号未进入可听链路；未伪报播放成功。`, 'warning');
            return false;
          }
          setChannelStatus(`${channelId} 测试信号已接受并发送。`, 'success');
          return true;
        } catch (error) {
          setChannelStatus(safeErrorCopy(error, '发送声道测试信号'), 'error');
          return false;
        }
      });
    }

    async function loadChannelRouter() {
      channelReadyState = 'loading';
      channelPanel.dataset.state = 'loading';
      channelPanel.setAttribute('aria-busy', 'true');
      setChannelStatus('正在读取逐声道路由…');
      try {
        const snapshot = await refreshChannelRouter();
        channelReadyState = 'ready';
        channelPanel.setAttribute('aria-busy', 'false');
        return snapshot;
      } catch {
        channelReadyState = 'unavailable';
        channelPanel.dataset.state = 'unavailable';
        channelPanel.setAttribute('aria-busy', 'false');
        channelRouterState = null;
        channelDraft = null;
        channelRouterLayout.disabled = true;
        channelAlgorithm.disabled = true;
        lfeCrossoverRange.disabled = true;
        lfeCrossoverNumber.disabled = true;
        matrixInputs.forEach((input) => { input.disabled = true; });
        channelStrips.replaceChildren();
        setChannelStatus('逐声道路由接口不可用；当前未显示或生成模拟声道值。', 'warning');
        visualsController?.updateChannelRouter?.({});
        return null;
      }
    }

    function createBooleanControl(key, labelText) {
      const id = `${instanceId}-${key}`;
      const label = node(document, 'label', {
        className: 'audio-mixer-control audio-mixer-control-switch',
        attributes: { for: id }
      });
      const input = node(document, 'input', {
        attributes: { id, type: 'checkbox' },
        dataset: { mixerParam: key }
      });
      input.type = 'checkbox';
      input.disabled = true;
      input.addEventListener('change', () => recordControlValue(key, input.checked));
      label.append(input, node(document, 'span', { text: labelText }));
      controls.set(key, input);
      return label;
    }

    function createEnumControl(key, definition) {
      const id = `${instanceId}-${key}`;
      const label = node(document, 'label', {
        className: 'audio-mixer-control audio-mixer-control-select',
        attributes: { for: id }
      });
      label.appendChild(node(document, 'span', {
        className: 'audio-mixer-control-label',
        text: definition.label
      }));
      const select = node(document, 'select', {
        attributes: { id, 'aria-label': definition.label },
        dataset: { mixerParam: key }
      });
      definition.options.forEach((entry) => {
        const option = node(document, 'option', { text: entry.label });
        option.value = entry.value;
        select.appendChild(option);
      });
      select.disabled = true;
      select.addEventListener('change', () => recordControlValue(key, select.value));
      label.appendChild(select);
      controls.set(key, select);
      return label;
    }

    function createRangeControl(definition) {
      const suffix = definition.eqIndex === undefined ? '' : `-${definition.eqIndex}`;
      const id = `${instanceId}-${definition.key}${suffix}`;
      const label = node(document, 'label', {
        className: 'audio-mixer-control audio-mixer-control-range',
        attributes: {
          for: id,
          title: `${definition.label}：可拖动推子，也可在数值框中精确输入`
        }
      });
      const heading = node(document, 'span', {
        className: 'audio-mixer-control-label',
        text: definition.label
      });
      const output = node(document, 'output', {
        className: 'audio-mixer-control-value',
        text: '—',
        attributes: { for: id, 'aria-hidden': 'true' }
      });
      const dataset = { mixerParam: definition.key };
      if (definition.eqIndex !== undefined) {
        dataset.mixerEqIndex = definition.eqIndex;
        dataset.mixerEqFrequency = definition.frequency;
      }
      const input = node(document, 'input', {
        attributes: {
          id,
          type: 'range',
          min: definition.min,
          max: definition.max,
          step: definition.step,
          'aria-label': definition.label,
          title: `${definition.label}推子，范围 ${definition.min} 到 ${definition.max}${definition.unit ? ` ${definition.unit}` : ''}`
        },
        dataset
      });
      input.type = 'range';
      input.min = String(definition.min);
      input.max = String(definition.max);
      input.step = String(definition.step);
      input.disabled = true;
      input.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
        keyboardPatchDeadline = Date.now() + KEYBOARD_PATCH_DEBOUNCE_MS;
      });
      const numericDataset = { mixerNumericInput: definition.key };
      if (definition.eqIndex !== undefined) numericDataset.mixerNumericEqIndex = definition.eqIndex;
      const numericInput = node(document, 'input', {
        className: 'audio-mixer-control-number',
        attributes: {
          type: 'number',
          min: definition.min,
          max: definition.max,
          step: definition.step,
          inputmode: 'decimal',
          'aria-label': `${definition.label}数值输入`,
          title: `直接输入 ${definition.min} 到 ${definition.max}${definition.unit ? ` ${definition.unit}` : ''}`
        },
        dataset: numericDataset
      });
      numericInput.type = 'number';
      numericInput.min = String(definition.min);
      numericInput.max = String(definition.max);
      numericInput.step = String(definition.step);
      numericInput.disabled = true;
      const commitNumericValue = () => {
        const value = Math.min(definition.max, Math.max(definition.min, Number(numericInput.value)));
        if (!Number.isFinite(value)) {
          numericInput.value = input.value;
          return;
        }
        numericInput.value = String(value);
        input.value = String(value);
        output.textContent = formatValue(value, definition);
        if (definition.eqIndex === undefined) recordControlValue(definition.key, value);
        else recordEqValue(definition.eqIndex, value);
      };
      input.addEventListener('input', () => {
        const value = Math.min(definition.max, Math.max(definition.min, Number(input.value)));
        if (!Number.isFinite(value)) return;
        input.value = String(value);
        numericInput.value = String(value);
        output.textContent = formatValue(value, definition);
        if (definition.eqIndex === undefined) recordControlValue(definition.key, value);
        else recordEqValue(definition.eqIndex, value);
      });
      numericInput.addEventListener('change', commitNumericValue);
      numericInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commitNumericValue();
      });
      label.append(heading, output, numericInput, input);
      if (definition.eqIndex === undefined) {
        controls.set(definition.key, input);
        numericInputs.set(definition.key, numericInput);
        valueOutputs.set(definition.key, { output, numericInput, definition });
      } else {
        if (!controls.has('eqDb')) controls.set('eqDb', []);
        if (!numericInputs.has('eqDb')) numericInputs.set('eqDb', []);
        if (!valueOutputs.has('eqDb')) valueOutputs.set('eqDb', []);
        controls.get('eqDb')[definition.eqIndex] = input;
        numericInputs.get('eqDb')[definition.eqIndex] = numericInput;
        valueOutputs.get('eqDb')[definition.eqIndex] = { output, numericInput, definition };
      }
      return label;
    }

    function setStatus(message, tone = 'neutral') {
      if (destroyed) return;
      lastStatus = message;
      status.textContent = message;
      status.dataset.tone = tone;
    }

    function setBusy(busy) {
      root.dataset.mixerBusy = String(busy);
      root.setAttribute('aria-busy', String(readyState === 'loading' || busy));
      const reconnecting = readyState === 'error' || !serverState;
      retryButton.textContent = reconnecting ? '重新连接调音台' : '重试原生链';
      retryButton.setAttribute(
        'aria-label',
        reconnecting ? '重新连接调音台并重新读取完整设置' : '重新提交当前设置并重试原生调音链'
      );
      retryButton.disabled = busy || (readyState !== 'error' && !serverState);
      presetButtons.forEach((button, id) => {
        button.disabled = !serverState || !availablePresets.has(id) || busy;
      });
      channelLayoutSelect.disabled = !serverState || !setNativeChannelLayout || busy;
    }

    function setControlsEnabled(enabled) {
      controls.forEach((control) => {
        if (Array.isArray(control)) control.forEach((entry) => { entry.disabled = !enabled; });
        else control.disabled = !enabled;
      });
      numericInputs.forEach((control) => {
        if (Array.isArray(control)) control.forEach((entry) => { entry.disabled = !enabled; });
        else control.disabled = !enabled;
      });
      channelLayoutSelect.disabled = !enabled || !setNativeChannelLayout;
    }

    function renderPresetState(selectedPreset) {
      root.dataset.selectedPreset = selectedPreset;
      presetButtons.forEach((button, id) => {
        const selected = id === selectedPreset;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-selected', selected);
      });
      const identity = PRESET_IDENTITIES.find((preset) => preset.id === selectedPreset);
      customState.textContent = selectedPreset === 'custom'
        ? '当前：自定义'
        : `当前：${identity?.label || '自定义'}`;
    }

    function renderParameters(nextParameters) {
      SIMPLE_PARAMETER_KEYS.forEach((key) => {
        const control = controls.get(key);
        const value = nextParameters[key];
        if (BOOLEAN_PARAMETERS.has(key)) {
          control.checked = value;
          return;
        }
        if (ENUM_PARAMETERS[key]) {
          control.value = value;
          return;
        }
        control.value = String(value);
        const rendered = valueOutputs.get(key);
        rendered.numericInput.value = String(value);
        rendered.output.textContent = formatValue(value, rendered.definition);
      });
      nextParameters.eqDb.forEach((value, index) => {
        controls.get('eqDb')[index].value = String(value);
        const rendered = valueOutputs.get('eqDb')[index];
        rendered.numericInput.value = String(value);
        rendered.output.textContent = formatValue(value, rendered.definition);
      });
    }

    function renderDiagnostics(snapshot) {
      const upmix = snapshot.upmix;
      const obr = snapshot.obr;
      const virtualBed = upmix.outputLayout ? `虚拟 ${upmix.outputLayout}` : '虚拟声床';
      const finalChannels = upmix.outputChannels > 0
        ? ` · 最终输出 ${upmix.outputChannels} 声道`
        : '';
      let upmixState = '已关闭（立体声直达 Mixer）';
      if (upmix.enabled && upmix.active) {
        upmixState = obr.enabled
          ? `已启用（${virtualBed}）`
          : `已启用（${virtualBed} 上混后折叠为双声道）`;
      } else if (upmix.enabled) {
        upmixState = upmix.available ? '已请求，尚未生效' : '已请求，但模块不可用';
      }
      let obrState = '已关闭（干声直通）';
      if (obr.enabled && obr.active) obrState = '已启用';
      else if (obr.enabled) obrState = obr.available ? '已请求，尚未生效' : '已请求，但模块不可用';
      upmixDiagnostic.textContent = `上混：${upmixState}`
        + `${upmix.label ? ` · ${upmix.label}` : ''}`
        + finalChannels
        + ` · 处理 ${upmix.processCalls} 块 · 回退 ${upmix.fallbackBlocks} 块`;
      obrDiagnostic.textContent = `OBR：${obrState}`
        + `${obr.label ? ` · ${obr.label}` : ''}`
        + `${obr.filterProfile ? ` · ${obr.filterProfile}` : ''}`
        + ` · 处理 ${obr.processCalls} 块`;
      const order = snapshot.order;
      const orderText = ['upmix', 'mixer', 'obr'].every((key) => (
        Number.isSafeInteger(order[key]) && order[key] > 0
      ))
        ? ` · 顺序 ${order.upmix} → ${order.mixer} → ${order.obr}`
        : '';
      mixerDiagnostic.textContent = `Mixer：${snapshot.mixerActive ? '处理中' : bypassCopy(snapshot.bypassReason)}`
        + ` · 处理 ${snapshot.processCalls} 块 · 旁路 ${snapshot.bypassedBlocks} 块`
        + ` · 路由 ${snapshot.spatialRoute}`
        + orderText;
    }

    function renderSnapshot(snapshot) {
      if (destroyed) return false;
      if (serverState && snapshot.revision < serverState.revision) return false;
      serverState = snapshot;
      localParameters = {
        ...snapshot.parameters,
        eqDb: [...snapshot.parameters.eqDb]
      };
      renderParameters(localParameters);
      if (Object.keys(pendingPatch).length) {
        Object.entries(pendingPatch).forEach(([key, value]) => {
          localParameters[key] = Array.isArray(value) ? [...value] : value;
        });
        renderParameters(localParameters);
        renderPresetState('custom');
      } else {
        renderPresetState(snapshot.selectedPreset);
      }
      revision.textContent = `修订 ${snapshot.revision}`;
      channelLayoutSelect.value = normalizeChannelLayout(
        snapshot.parameters.upmixOutputLayout || getNativeChannelLayout()
      );
      playback.dataset.playbackState = snapshot.playbackState;
      playback.textContent = playbackCopy(snapshot.playbackState);
      renderDiagnostics(snapshot);
      visualsController?.updateParameters(localParameters);
      syncEffectiveChannelLayout();
      return true;
    }

    function changeNativeChannelLayout(value) {
      if (destroyed || !serverState || !setNativeChannelLayout) return false;
      const requestedLayout = normalizeChannelLayout(value);
      enqueueMutation(async () => {
        setStatus(`正在切换到 ${requestedLayout} 原生声道…`);
        try {
          const changed = await setNativeChannelLayout(requestedLayout);
          if (changed !== true) throw new Error('native channel layout did not activate');
          channelLayoutSelect.value = normalizeChannelLayout(getNativeChannelLayout());
          await refreshFromServer();
          setStatus(`原生声道已切换为 ${requestedLayout}，调音链会按该布局处理。`, 'success');
        } catch (error) {
          channelLayoutSelect.value = normalizeChannelLayout(getNativeChannelLayout());
          setStatus('原生声道切换失败，已保留上一组有效布局。', 'error');
        }
      });
      return true;
    }

    channelLayoutSelect.addEventListener('change', () => {
      changeNativeChannelLayout(channelLayoutSelect.value);
    });

    function recordVisualParameter(key, rawValue) {
      if (!ALLOWED_PARAMETER_KEYS.has(key) || key === 'eqDb') return false;
      let value = rawValue;
      if (BOOLEAN_PARAMETERS.has(key)) {
        if (typeof value !== 'boolean') return false;
        controls.get(key).checked = value;
      } else if (ENUM_PARAMETERS[key]) {
        if (!ENUM_PARAMETERS[key].options.some((option) => option.value === value)) return false;
        controls.get(key).value = value;
      } else {
        const definition = NUMERIC_PARAMETERS[key];
        const numeric = Number(value);
        if (!definition || !Number.isFinite(numeric)) return false;
        value = Math.min(definition.max, Math.max(definition.min, numeric));
        controls.get(key).value = String(value);
        numericInputs.get(key).value = String(value);
        valueOutputs.get(key).output.textContent = formatValue(value, definition);
      }
      recordControlValue(key, value);
      return true;
    }

    function recordControlValue(key, value) {
      if (destroyed || !serverState || !ALLOWED_PARAMETER_KEYS.has(key)) return;
      localParameters[key] = value;
      visualsController?.updateParameters(localParameters);
      pendingPatch[key] = value;
      automaticPatchRetryBudget = 1;
      renderPresetState('custom');
      setStatus('正在等待合并本次调整…');
      schedulePatch();
    }

    function recordEqValue(index, value) {
      if (destroyed || !serverState || !Number.isInteger(index) || index < 0 || index >= 10) return;
      localParameters.eqDb[index] = value;
      pendingPatch.eqDb = [...localParameters.eqDb];
      automaticPatchRetryBudget = 1;
      renderPresetState('custom');
      setStatus('正在等待合并本次均衡器调整…');
      schedulePatch();
    }

    function schedulePatch() {
      if (debounceTimer) global.clearTimeout(debounceTimer);
      const delay = Math.max(PATCH_DEBOUNCE_MS, keyboardPatchDeadline - Date.now());
      debounceTimer = global.setTimeout(() => {
        debounceTimer = 0;
        keyboardPatchDeadline = 0;
        const patch = pendingPatch;
        pendingPatch = {};
        if (!Object.keys(patch).length) return;
        enqueueMutation(() => submitPatch(patch, false));
      }, delay);
    }

    function enqueueMutation(operation) {
      operationCount += 1;
      const run = async () => {
        if (destroyed) return;
        setBusy(true);
        try {
          return await operation();
        } finally {
          operationCount -= 1;
          setBusy(operationCount > 0);
        }
      };
      const queued = operationTail.then(run, run);
      operationTail = queued.catch(() => {});
      return queued;
    }

    async function refreshFromServer() {
      const payload = await requestJson(MIXER_ENDPOINT);
      const snapshot = normalizeSnapshot(payload);
      if (serverState && snapshot.revision < serverState.revision) return serverState;
      renderSnapshot(snapshot);
      return snapshot;
    }

    function requestPassiveRefresh() {
      if (destroyed) return Promise.resolve(false);
      passiveRefreshQueued = true;
      if (passiveRefreshPromise) return passiveRefreshPromise;
      const run = (async () => {
        let refreshed = false;
        let completedFetches = 0;
        do {
          passiveRefreshQueued = false;
          const observedMutationTail = operationTail;
          const observedChannelTail = channelOperationTail;
          await Promise.all([observedMutationTail, observedChannelTail]);
          if (destroyed) break;
          if (
            debounceTimer
            || channelDebounceTimer
            || Object.keys(pendingPatch).length > 0
            || Object.keys(channelPendingPatch).length > 0
            || operationCount > 0
            || channelOperationCount > 0
          ) {
            passiveRefreshQueued = true;
            await new Promise((resolve) => global.setTimeout(resolve, PATCH_DEBOUNCE_MS + 10));
            continue;
          }
          const refreshes = await Promise.allSettled([
            refreshFromServer(),
            refreshChannelRouter()
          ]);
          refreshed = refreshes.some((result) => result.status === 'fulfilled') || refreshed;
          completedFetches += 1;
        } while (passiveRefreshQueued && completedFetches < 2 && !destroyed);
        return refreshed;
      })();
      passiveRefreshPromise = run.finally(() => {
        passiveRefreshPromise = null;
        if (passiveRefreshQueued && !destroyed) requestPassiveRefresh();
      });
      return passiveRefreshPromise;
    }

    async function ensureAudibleNativeChain(reason) {
      if (!serverState || !ensureNativeChain) {
        return Object.freeze({ attempted: false, ok: false });
      }
      let ok = false;
      try {
        const parametersSnapshot = frozenParametersSnapshot(serverState.parameters);
        ok = await ensureNativeChain(Object.freeze({
          enabled: parametersSnapshot.enabled,
          reason,
          revision: serverState.revision,
          spatialMigrationNeeded: serverState.spatialMigrationNeeded,
          parameters: parametersSnapshot
        })) === true;
      } catch {
        ok = false;
      }
      try {
        await refreshFromServer();
      } catch {
        // The persisted mixer mutation remains valid. Keep its last safe snapshot
        // and report that audible activation could not be verified.
      }
      return Object.freeze({ attempted: true, ok });
    }

    function setMutationStatus(successCopy, activation) {
      if (!activation.attempted) {
        setStatus(successCopy, 'success');
        return;
      }
      if (!activation.ok) {
        setStatus(`${successCopy.replace(/[。！]$/u, '')}，但原生音频链未能启动，当前效果未生效。`, 'warning');
        return;
      }
      if (serverState?.playbackState === 'native-mixer') {
        setStatus(`${successCopy.replace(/[。！]$/u, '')}并已进入原生音频链，效果正在生效。`, 'success');
        return;
      }
      setStatus(`${successCopy.replace(/[。！]$/u, '')}；原生音频链已待命，播放音乐后生效。`, 'warning');
    }

    async function handleConflict(action) {
      setStatus('设置版本发生冲突，正在刷新最新状态…', 'warning');
      try {
        await refreshFromServer();
        setStatus('设置冲突：已刷新为最新状态，请按需重新调整。', 'warning');
      } catch (error) {
        setStatus(`${safeErrorCopy(error, action)}；最新状态也未能刷新。`, 'error');
      }
    }

    async function submitPatch(patch, retryOnly, options = {}) {
      if (!serverState || destroyed) return false;
      const retryOnFailure = options.retryOnFailure !== false;
      const safePatch = {};
      Object.entries(patch).forEach(([key, value]) => {
        if (!ALLOWED_PARAMETER_KEYS.has(key)) return;
        safePatch[key] = Array.isArray(value) ? [...value] : value;
      });
      try {
        const payload = await requestJson(MIXER_ENDPOINT, {
          method: 'PATCH',
          body: { expectedRevision: serverState.revision, parameters: safePatch }
        });
        renderSnapshot(normalizeSnapshot(payload));
        const activation = await ensureAudibleNativeChain(retryOnly ? 'retry' : 'parameter');
        const hasUnacknowledgedChanges = Boolean(debounceTimer)
          || Object.keys(pendingPatch).length > 0
          || operationCount > 1;
        if (hasUnacknowledgedChanges) {
          setStatus('仍有未保存设置，正在继续提交…', 'warning');
        } else {
          setMutationStatus(
            retryOnly ? '已重新提交当前设置。' : '调音设置已保存。',
            activation
          );
        }
        return true;
      } catch (error) {
        if (error instanceof MixerHttpError && error.status === 409) {
          await handleConflict(retryOnly ? '重试' : '保存');
          return false;
        }
        if (!retryOnly && retryOnFailure) {
          pendingPatch = { ...safePatch, ...pendingPatch };
          if (automaticPatchRetryBudget > 0) {
            automaticPatchRetryBudget -= 1;
            schedulePatch();
          }
        }
        setStatus(safeErrorCopy(error, retryOnly ? '重试' : '保存'), 'error');
        return false;
      }
    }

    function retryNativeChain() {
      if (!serverState || destroyed) return false;
      enqueueMutation(() => submitPatch({}, true));
      return true;
    }

    function applyPreset(id) {
      if (!serverState || destroyed || !PRESET_IDS.has(id) || !availablePresets.has(id)) return false;
      if (debounceTimer) {
        global.clearTimeout(debounceTimer);
        debounceTimer = 0;
      }
      keyboardPatchDeadline = 0;
      pendingPatch = {};
      enqueueMutation(async () => {
        try {
          const payload = await requestJson(`${PRESETS_ENDPOINT}/${encodeURIComponent(id)}/apply`, {
            method: 'POST',
            body: { expectedRevision: serverState.revision }
          });
          renderSnapshot(normalizeSnapshot(payload));
          const activation = await ensureAudibleNativeChain('preset');
          setMutationStatus('效果预设已应用。', activation);
        } catch (error) {
          if (error instanceof MixerHttpError && error.status === 409) {
            await handleConflict('应用预设');
            return;
          }
          setStatus(safeErrorCopy(error, '应用预设'), 'error');
        }
      });
      return true;
    }

    async function loadInitial() {
      readyState = 'loading';
      root.dataset.mixerReady = 'false';
      root.setAttribute('aria-busy', 'true');
      setControlsEnabled(false);
      availablePresets.clear();
      setStatus('正在读取调音台设置…');
      setBusy(true);
      try {
        const [snapshotPayload, presetPayload] = await Promise.all([
          requestJson(MIXER_ENDPOINT),
          requestJson(PRESETS_ENDPOINT)
        ]);
        if (
          !isRecord(presetPayload)
          || presetPayload.ok !== true
          || presetPayload.presetVersion !== 1
          || !Array.isArray(presetPayload.presets)
        ) {
          throw new TypeError('Invalid audio mixer presets response');
        }
        const received = new Map();
        presetPayload.presets.forEach((preset) => {
          if (!isRecord(preset) || !PRESET_IDS.has(preset.id) || received.has(preset.id)) return;
          normalizeParameters(preset.parameters);
          received.set(preset.id, true);
        });
        if (received.size !== PRESET_IDENTITIES.length) {
          throw new TypeError('Audio mixer presets are incomplete');
        }
        received.forEach((_, id) => availablePresets.add(id));
        const snapshot = normalizeSnapshot(snapshotPayload);
        renderSnapshot(snapshot);
        readyState = 'ready';
        root.dataset.audioMixerUi = '';
        root.dataset.mixerReady = 'true';
        root.setAttribute('aria-busy', 'false');
        setControlsEnabled(true);
        setBusy(operationCount > 0);
        if (
          snapshot.spatialMigrationNeeded
          && snapshot.parameters.enabled
          && ensureNativeChain
          && !initialMigrationNotified
        ) {
          initialMigrationNotified = true;
          await ensureAudibleNativeChain('migration');
        }
        if (serverState?.playbackState === 'native-mixer') {
          setStatus('调音台已连接到原生音频链。', 'success');
        } else {
          setStatus(`${bypassCopy(serverState?.bypassReason)}；可使用“重试原生链”重新提交当前设置。`, 'warning');
        }
        return snapshot;
      } catch (error) {
        readyState = 'error';
        root.dataset.audioMixerUi = '';
        root.dataset.mixerReady = 'error';
        root.setAttribute('aria-busy', 'false');
        setControlsEnabled(false);
        setBusy(operationCount > 0);
        playback.dataset.playbackState = 'unavailable';
        playback.textContent = '调音台状态不可用；音频继续使用兼容播放。';
        setStatus(safeErrorCopy(error, '读取调音台'), 'error');
        return null;
      }
    }

    function reconnectOrRetry() {
      if (destroyed) return false;
      if (readyState === 'error' || !serverState) {
        enqueueMutation(() => loadInitial());
        return true;
      }
      return retryNativeChain();
    }

    retryButton.addEventListener('click', reconnectOrRetry);

    const mixerReady = loadInitial();
    const channelReady = loadChannelRouter();
    const ready = (async () => {
      const snapshot = await mixerReady;
      await channelReady;
      return snapshot;
    })();
    const controller = Object.freeze({
      ready,
      refresh() {
        if (destroyed) return Promise.resolve(false);
        if (readyState === 'error' || !serverState) {
          return Promise.allSettled([
            enqueueMutation(() => loadInitial()),
            loadChannelRouter()
          ]).then((results) => results.some((result) => (
            result.status === 'fulfilled' && result.value !== null
          )));
        }
        return requestPassiveRefresh();
      },
      flush() {
        if (destroyed || !Object.keys(pendingPatch).length) return Promise.resolve(false);
        if (debounceTimer) {
          global.clearTimeout(debounceTimer);
          debounceTimer = 0;
        }
        const patch = pendingPatch;
        pendingPatch = {};
        return enqueueMutation(() => submitPatch(patch, false));
      },
      retry: retryNativeChain,
      async settled() {
        await ready;
        while (!destroyed) {
          if (debounceTimer) {
            await new Promise((resolve) => global.setTimeout(resolve, PATCH_DEBOUNCE_MS + 10));
          }
          if (channelDebounceTimer) {
            await new Promise((resolve) => global.setTimeout(resolve, PATCH_DEBOUNCE_MS + 10));
          }
          const observedTail = operationTail;
          const observedChannelTail = channelOperationTail;
          await observedTail;
          await observedChannelTail;
          const observedRefresh = passiveRefreshPromise;
          if (observedRefresh) await observedRefresh;
          await Promise.resolve();
          if (
            !debounceTimer
            && !channelDebounceTimer
            && operationCount === 0
            && channelOperationCount === 0
            && observedTail === operationTail
            && observedChannelTail === channelOperationTail
            && !passiveRefreshPromise
          ) break;
        }
      },
      snapshot() {
        return Object.freeze({
          ready: readyState,
          revision: serverState?.revision ?? null,
          selectedPreset: root.dataset.selectedPreset || '',
          playbackState: serverState?.playbackState || 'unavailable',
          channelLayout: normalizeChannelLayout(getNativeChannelLayout()),
          pendingKeys: Object.freeze(Object.keys(pendingPatch)),
          busy: operationCount > 0 || channelOperationCount > 0,
          channelRouter: channelRouterState
            ? Object.freeze({
                ready: channelReadyState,
                revision: channelRouterState.revision,
                layout: channelRouterState.layout,
                algorithm: channelRouterState.algorithm,
                available: channelRouterState.available,
                actual: channelRouterState.actual,
                active: channelRouterState.active,
                controlAvailable: channelRouterState.controlAvailable,
                configState: channelRouterState.configState,
                nativeBackendAvailable: channelRouterState.nativeBackendAvailable,
                nativeChainActive: channelRouterState.nativeChainActive,
                availability: channelRouterState.availability,
                outputChannels: channelRouterState.outputChannels,
                activeRevision: channelRouterState.activeRevision,
                stagedRevision: channelRouterState.stagedRevision,
                lastResult: channelRouterState.lastResult,
                layoutPending: channelRouterState.layoutPending,
                transitionPending: channelRouterState.transitionPending,
                output: channelRouterState.output,
                physicalMultichannel: false,
                processCalls: channelRouterState.processCalls,
                channelOrder: Object.freeze([...channelRouterState.channelOrder]),
                pendingKeys: Object.freeze(Object.keys(channelPendingPatch))
              })
            : Object.freeze({
                ready: channelReadyState,
                revision: null,
                available: false,
                actual: false,
                physicalMultichannel: false,
                pendingKeys: Object.freeze(Object.keys(channelPendingPatch))
              }),
          status: lastStatus
        });
      },
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        passiveRefreshQueued = false;
        if (debounceTimer) global.clearTimeout(debounceTimer);
        debounceTimer = 0;
        if (channelDebounceTimer) global.clearTimeout(channelDebounceTimer);
        channelDebounceTimer = 0;
        keyboardPatchDeadline = 0;
        pendingPatch = {};
        channelPendingPatch = {};
        if (telemetryActivationTimer) global.clearTimeout(telemetryActivationTimer);
        telemetryActivationTimer = 0;
        if (settingsTelemetryListener) {
          document.removeEventListener?.('fe-settings-center:change', settingsTelemetryListener);
          settingsTelemetryListener = null;
        }
        visualsController?.destroy();
        visualsController = null;
        ownedTelemetrySource?.destroy?.();
        ownedTelemetrySource = null;
        root.remove();
        mounted.delete(container);
        return true;
      }
    });
    mounted.set(container, controller);
    return controller;
  }

  global.FeAudioMixerUi = Object.freeze({ mount });
})(window);
