(function attachFeSoundscapeRuntime(global) {
  'use strict';

  const CHANNEL = 'fe-soundscape:v1';
  const STORAGE_KEY = 'fe-monster-soundscape-workshop-settings-v3';
  const LEGACY_STORAGE_KEYS = Object.freeze([
    'fe-monster.soundscape-workshop.settings.v2',
    'fe-monster.soundscape-workshop.settings.v1'
  ]);
  const AUDIO_INTERVAL_MS = 1000 / 30;
  const MEDIA_INTERVAL_MS = 250;
  const READY_TIMEOUT_MS = 4500;
  const HEARTBEAT_STALE_MS = 1800;
  // A grid rebuild can legitimately block the first compositor frame for a
  // little over one second on software WebGL / integrated GPUs. Observe long
  // enough to receive that first post-change heartbeat; the existing
  // consecutive-frame budget still rejects sustained slow rendering.
  const HEALTH_OBSERVATION_MS = 750;
  const HIGH_IMPACT_HEALTH_OBSERVATION_MS = 1500;
  const MAX_READY_RETRIES = 1;
  const MAX_FRAME_TIME_MS = 1000;
  const OVER_BUDGET_FRAME_MS = 80;
  const OVER_BUDGET_LIMIT = 3;
  const MANIFEST = deepFreeze({
    id: 'soundscape-workshop', presetId: 'soundscape-workshop', title: '音域回响', name: 'Sonic Topography',
    author: 'CmZya', platform: 'Wallpaper Engine', workshopId: '3747222633', version: 1,
    resource: { kind: 'sandboxed-web', entryUrl: 'assets/soundscape-workshop/runtime.html', previewUrl: 'assets/soundscape-workshop/preview.gif' },
    attribution: '原作：CmZya · 平台：Wallpaper Engine · Workshop 3747222633',
    sourceHashes: {
      'assets/index-CSU_B_T9.js': 'E84063E440609AAE4DAD2B728FB8E419F78ABC7E37D8E030F3067DBD90183FEB',
      'assets/index-DgmMz9-g.css': 'F9C0AC4D4B38D2F257F21A9521D697E2BDB872023C170786AFC79D073F58A7F0',
      'index.html': '7F7D820A6A8128B9298D4C8A93B12226852E67E4F45DE898A77DEDAC3BD69C9B',
      'preview.gif': '46A00ED397AAF9B97C5D17879EF00597DF99D73051D2F27F196AF0240454610B',
      'project.json': 'D8114CE1871F051B29817B89D463F0D7A60CEE04954864BE19487027352753AD'
    }
  });

  // WebView2 runtimes can expose a non-configurable global `gc`, which breaks
  // the Workshop bundle's top-level `class gc` at global scope. The child then
  // requests the unchanged bundle source over the channel; this side fetches it
  // same-origin, verifies the SHA-256 against the manifest, and posts it back.
  const BUNDLE_SOURCE_URL = 'assets/soundscape-workshop/assets/index-CSU_B_T9.js?v=20260819-soundscape-gc-fallback-1';
  const BUNDLE_SOURCE_HASH = MANIFEST.sourceHashes['assets/index-CSU_B_T9.js'];
  let bundleSourcePromise = null;

  const THEME_OPTIONS = [
    ['cycle', '自动轮询 / Auto Cycle'], ['nocturnal', '霁紫 / Violet'], ['ocean-deep', '沧蓝 / Deep Blue'],
    ['arctic-aurora', '冰蓝 / Ice Blue'], ['cyber-forest', '碧翠 / Emerald'], ['golden-hour', '流金 / Gold'],
    ['ember-fire', '余烬 / Ember'], ['crimson-sunset', '赤焰 / Crimson'], ['coral-mirage', '霞粉 / Coral'],
    ['neon-tokyo', '幻紫 / Neon'], ['minimal-monochrome', '水墨 / Ink'], ['teal-depth', '幽青 / Teal'],
    ['lavender-dream', '薰衣草 / Lavender'], ['cherry-blossom', '樱 / Cherry Blossom'],
    ['copper-forge', '锻铜 / Copper'], ['mint-fresh', '薄荷 / Mint']
  ].map(([value, label]) => ({ value, label }));
  const GRID_OPTIONS = [
    { value: 120, label: '120×120', loadTier: 'standard', highImpact: false },
    { value: 160, label: '160×160', loadTier: 'standard', highImpact: false },
    { value: 320, label: '320×320', loadTier: 'elevated', highImpact: false },
    { value: 640, label: '640×640', loadTier: 'high', highImpact: true, requiresExplicitSelection: true },
    { value: 1080, label: '1080×1080', loadTier: 'very-high', highImpact: true, requiresExplicitSelection: true },
    { value: 4096, label: '4096×4096', loadTier: 'extreme', highImpact: true, requiresExplicitSelection: true }
  ];
  const SAFE_STARTUP_GRID_SIZE = 160;
  const GRID_PROGRESSION = GRID_OPTIONS.map((option) => option.value);
  const SAFE_STARTUP_GRID_VALUES = new Set(
    GRID_OPTIONS.filter((option) => option.loadTier === 'standard' || option.loadTier === 'elevated')
      .map((option) => option.value)
  );
  const HIGH_IMPACT_GRID_VALUES = new Set(
    GRID_OPTIONS.filter((option) => option.highImpact).map((option) => option.value)
  );

  function parameterBase(sourceProperty, name, purpose, group, defaultValue) {
    return { key: sourceProperty, sourceProperty, name, purpose, group, scope: 'scene', category: group, impact: 'low', default: defaultValue };
  }
  function boolean(sourceProperty, name, purpose, group, defaultValue) {
    return Object.assign(parameterBase(sourceProperty, name, purpose, group, defaultValue), { type: 'boolean' });
  }
  function number(sourceProperty, name, purpose, group, defaultValue, min, max, step) {
    return Object.assign(parameterBase(sourceProperty, name, purpose, group, defaultValue), { type: 'number', range: { min, max, step }, min, max, step });
  }
  function choice(sourceProperty, name, purpose, group, defaultValue, options, extra) {
    return Object.assign(parameterBase(sourceProperty, name, purpose, group, defaultValue), {
      type: 'enum', options, enumValues: options.map((option) => option.value)
    }, extra || {});
  }

  const PARAMETER_DEFINITIONS = deepFreeze([
    choice('gridSize', '渲染精度', '渲染方块数量；高档位会显著增加显存与功耗', 'render', 160, GRID_OPTIONS, {
      impact: 'high', highImpact: true, highImpactValues: [640, 1080, 4096], requiresExplicitSelection: true
    }),
    choice('theme', '颜色主题', '切换音域回响的整体配色', 'appearance', 'nocturnal', THEME_OPTIONS),
    number('themeCycleInterval', '主题轮询间隔', '自动轮询主题的间隔秒数', 'appearance', 60, 10, 300, 10),
    boolean('peakColorEnabled', '强调色', '显示频谱峰值强调色', 'appearance', true),
    number('peakColorIntensity', '强调色强度', '调整峰值强调色亮度', 'appearance', 1, 0, 2, 0.1),
    number('audioIntensity', '音频响应强度', '调整方块跟随音乐起伏的幅度', 'audio', 1, 0.3, 2.5, 0.1),
    number('responseRange', '频段响应范围', '调整各频段影响场景的范围', 'audio', 1, 0.3, 2, 0.1),
    boolean('pulseEnabled', '波纹效果', '让节拍触发扩散波纹', 'ripple', true),
    number('pulseSensitivity', '波纹灵敏度', '调整波纹触发灵敏度', 'ripple', 0.2, 0.05, 0.5, 0.01),
    number('pulseCooldown', '波纹冷却', '限制连续波纹的触发频率', 'ripple', 0, 0, 200, 5),
    boolean('meteorEnabled', '流星效果', '让高频瞬态触发流星', 'meteor', true),
    number('meteorSensitivity', '流星灵敏度', '调整流星触发灵敏度', 'meteor', 0.35, 0.1, 0.8, 0.05),
    number('meteorCooldown', '流星冷却', '限制连续流星的触发频率', 'meteor', 60, 0, 400, 10),
    boolean('meteorClickEnabled', '点击流星', '允许点击场景触发流星', 'meteor', true),
    boolean('idleWaveEnabled', '空闲波浪', '无音乐时显示柔和波浪', 'idle', true),
    number('idleWaveDebounce', '空闲波浪防抖', '等待音乐停止后再进入空闲波浪', 'idle', 1, 0.5, 5, 0.5),
    number('idleWaveFadeDuration', '空闲波浪过渡', '调整空闲波浪淡入淡出时长', 'idle', 1, 0.5, 5, 0.5),
    number('cameraDistance', '视角距离', '调整镜头与方块场的距离', 'camera', 85, 20, 100, 5),
    number('cameraAngleX', '水平角度', '调整镜头水平环绕角度', 'camera', 120, 0, 360, 5),
    number('cameraAngleY', '垂直仰角', '调整镜头垂直观察角度', 'camera', 25, 10, 70, 5),
    boolean('autoRotateEnabled', '自动旋转', '让镜头自动环绕方块场', 'camera', false),
    number('autoRotateSpeed', '旋转速度', '调整镜头自动旋转速度', 'camera', 10, 1, 60, 1),
    boolean('showPlayerController', '播放器信息', '显示当前音乐信息卡片', 'player', true),
    boolean('showAlbumCover', '专辑封面', '在播放器信息中显示专辑封面', 'player', true),
    choice('controllerSize', '播放器尺寸', '调整播放器信息卡片尺寸', 'player', 'large', [
      { value: 'small', label: '小 / Small' }, { value: 'medium', label: '中 / Medium' }, { value: 'large', label: '大 / Large' }
    ]),
    number('controllerX', '播放器水平位置', '调整播放器距右侧的位置百分比', 'player', 2, 0, 80, 1),
    number('controllerY', '播放器垂直位置', '调整播放器距顶部的位置百分比', 'player', 3, 0, 90, 1)
  ]);
  const DEFINITIONS_BY_KEY = new Map(PARAMETER_DEFINITIONS.map((definition) => [definition.sourceProperty, definition]));

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function defaultParameters() {
    const result = {};
    PARAMETER_DEFINITIONS.forEach((definition) => { result[definition.sourceProperty] = definition.default; });
    return result;
  }
  function sanitizeOne(definition, value, strict) {
    if (definition.type === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (!strict && (value === 'true' || value === 1)) return true;
      if (!strict && (value === 'false' || value === 0)) return false;
      if (strict) throw new TypeError(`${definition.name} 必须是布尔值`);
      return undefined;
    }
    if (definition.type === 'enum') {
      const option = definition.options.find((candidate) => String(candidate.value) === String(value));
      if (option) return option.value;
      if (strict) throw new RangeError(`${definition.name} 不支持 ${String(value)}`);
      return undefined;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      if (strict) throw new TypeError(`${definition.name} 必须是有限数字`);
      return undefined;
    }
    const { min, max, step } = definition.range;
    if (numeric < min || numeric > max) {
      if (strict) throw new RangeError(`${definition.name} 必须在 ${min} 到 ${max} 之间`);
      return undefined;
    }
    const snapped = min + Math.round((numeric - min) / step) * step;
    const precision = Math.max(0, String(step).split('.')[1]?.length || 0);
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(precision));
  }
  function sanitizeChanges(changes, strict) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      if (strict) throw new TypeError('音域回响参数必须是对象');
      return {};
    }
    const result = {};
    Object.entries(changes).forEach(([sourceProperty, value]) => {
      const definition = DEFINITIONS_BY_KEY.get(sourceProperty);
      if (!definition) {
        if (strict) throw new RangeError(`未知的音域回响参数：${sourceProperty}`);
        return;
      }
      const sanitized = sanitizeOne(definition, value, strict);
      if (sanitized !== undefined) result[sourceProperty] = sanitized;
    });
    return result;
  }
  function safeStartupGrid(value, fallback = SAFE_STARTUP_GRID_SIZE) {
    const numeric = Number(value);
    if (SAFE_STARTUP_GRID_VALUES.has(numeric)) return numeric;
    const fallbackNumeric = Number(fallback);
    return SAFE_STARTUP_GRID_VALUES.has(fallbackNumeric) ? fallbackNumeric : SAFE_STARTUP_GRID_SIZE;
  }
  function persistenceSnapshot(source = {}, preserveEffectiveHigh = false) {
    const defaults = defaultParameters();
    const requestedParameters = Object.assign(
      defaults,
      sanitizeChanges(source.requestedParameters, false)
    );
    let lastKnownSafeGridSize = safeStartupGrid(
      source.lastKnownSafeGridSize,
      source.effectiveParameters?.gridSize
    );
    if (!HIGH_IMPACT_GRID_VALUES.has(requestedParameters.gridSize)) {
      lastKnownSafeGridSize = safeStartupGrid(requestedParameters.gridSize, lastKnownSafeGridSize);
    }
    const sanitizedEffective = sanitizeChanges(source.effectiveParameters, false);
    const effectiveParameters = Object.assign(
      {},
      requestedParameters,
      sanitizedEffective,
      {
        gridSize: HIGH_IMPACT_GRID_VALUES.has(requestedParameters.gridSize)
          ? preserveEffectiveHigh && GRID_PROGRESSION.includes(sanitizedEffective.gridSize)
            ? sanitizedEffective.gridSize
            : lastKnownSafeGridSize
          : requestedParameters.gridSize
      }
    );
    const controllerSource = source.controllerPosition && typeof source.controllerPosition === 'object'
      ? source.controllerPosition
      : {};
    const controllerX = sanitizeOne(DEFINITIONS_BY_KEY.get('controllerX'), controllerSource.x, false);
    const controllerY = sanitizeOne(DEFINITIONS_BY_KEY.get('controllerY'), controllerSource.y, false);
    if (controllerX !== undefined) requestedParameters.controllerX = effectiveParameters.controllerX = controllerX;
    if (controllerY !== undefined) requestedParameters.controllerY = effectiveParameters.controllerY = controllerY;
    return {
      version: 2,
      requestedParameters,
      effectiveParameters,
      lastKnownSafeGridSize,
      controllerPosition: {
        x: effectiveParameters.controllerX,
        y: effectiveParameters.controllerY
      },
      updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : Date.now()
    };
  }
  function loadPersistedState() {
    const defaults = defaultParameters();
    try {
      if (!global.localStorage) {
        return persistenceSnapshot({ requestedParameters: defaults, effectiveParameters: defaults });
      }
      const readStoredValue = (key) => JSON.parse(global.localStorage.getItem(key) || 'null');
      const savedV2 = readStoredValue(STORAGE_KEY) || readStoredValue(LEGACY_STORAGE_KEYS[0]);
      let restored;
      if (savedV2?.version === 2) {
        restored = persistenceSnapshot(savedV2);
      } else {
        const savedV1 = readStoredValue(LEGACY_STORAGE_KEYS[1]);
        const requestedParameters = Object.assign(defaults, sanitizeChanges(savedV1, false));
        const lastKnownSafeGridSize = safeStartupGrid(requestedParameters.gridSize);
        restored = persistenceSnapshot({
          requestedParameters,
          effectiveParameters: { ...requestedParameters, gridSize: lastKnownSafeGridSize },
          lastKnownSafeGridSize,
          controllerPosition: { x: requestedParameters.controllerX, y: requestedParameters.controllerY }
        });
      }
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      LEGACY_STORAGE_KEYS.forEach((key) => {
        try { global.localStorage.removeItem(key); } catch (_error) { /* Migration cleanup is optional. */ }
      });
      return restored;
    } catch (_error) {
      return persistenceSnapshot({ requestedParameters: defaults, effectiveParameters: defaults });
    }
  }
  let sharedState = loadPersistedState();
  function persistSharedState(state) {
    sharedState = persistenceSnapshot({
      requestedParameters: state.requestedParameters,
      effectiveParameters: state.effectiveParameters,
      lastKnownSafeGridSize: state.lastKnownSafeGridSize,
      controllerPosition: state.controllerPosition,
      updatedAt: Date.now()
    }, true);
    try { global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(sharedState)); } catch (_error) { /* Optional storage. */ }
    return sharedState;
  }
  function catalog() {
    const result = clone(PARAMETER_DEFINITIONS);
    Object.defineProperty(result, 'parameters', { configurable: false, enumerable: false, writable: false, value: clone(PARAMETER_DEFINITIONS) });
    return result;
  }
  function randomNonce() {
    try {
      if (global.crypto?.randomUUID) return global.crypto.randomUUID();
      if (global.crypto?.getRandomValues) {
        const bytes = new Uint32Array(4);
        global.crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(8, '0')).join('');
      }
    } catch (_error) { /* Use the uniqueness fallback below. */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
  function now() { return typeof global.performance?.now === 'function' ? global.performance.now() : Date.now(); }
  function isRuntime(value) { return !!value && value.__feSoundscapeRuntime === true; }
  function assertRuntime(value) {
    if (!isRuntime(value)) throw new TypeError('无效的音域回响运行实例');
    if (value.disposed) throw new Error('音域回响运行实例已释放');
    return value;
  }
  function recoverySnapshot(state, requestedGridSize, effectiveGridSize, reason = '') {
    return { state, requestedGridSize, effectiveGridSize, reason: String(reason || '') };
  }
  function create(host, options = {}) {
    if (!host || host.nodeType !== 1 || typeof host.appendChild !== 'function') throw new TypeError('音域回响需要有效的场景容器');
    const initial = sanitizeChanges(options.initialParameters, false);
    // App bootstrap code may pass the runtime's effective safe grid back as an
    // initial UI value. Treat that idempotent value as a snapshot, not as a new
    // user request that erases a persisted high-impact requested grid.
    if (
      Object.prototype.hasOwnProperty.call(initial, 'gridSize')
      && initial.gridSize === sharedState.effectiveParameters.gridSize
      && sharedState.requestedParameters.gridSize !== sharedState.effectiveParameters.gridSize
    ) delete initial.gridSize;
    const requestedParameters = Object.assign({}, sharedState.requestedParameters, initial);
    let lastKnownSafeGridSize = sharedState.lastKnownSafeGridSize;
    const effectiveParameters = Object.assign({}, sharedState.effectiveParameters);
    Object.entries(initial).forEach(([key, value]) => {
      if (key !== 'gridSize') effectiveParameters[key] = value;
    });
    if (Object.prototype.hasOwnProperty.call(initial, 'gridSize')) {
      if (HIGH_IMPACT_GRID_VALUES.has(initial.gridSize)) {
        effectiveParameters.gridSize = lastKnownSafeGridSize;
      } else {
        effectiveParameters.gridSize = initial.gridSize;
        lastKnownSafeGridSize = safeStartupGrid(initial.gridSize, lastKnownSafeGridSize);
      }
    } else if (HIGH_IMPACT_GRID_VALUES.has(requestedParameters.gridSize)) {
      effectiveParameters.gridSize = lastKnownSafeGridSize;
    }
    const startupRecovery = requestedParameters.gridSize === effectiveParameters.gridSize
      ? recoverySnapshot('idle', requestedParameters.gridSize, effectiveParameters.gridSize)
      : recoverySnapshot('pending', requestedParameters.gridSize, effectiveParameters.gridSize, 'awaiting-trusted-first-frame');
    return {
      __feSoundscapeRuntime: true, host,
      options: {
        entryUrl: String(options.entryUrl || MANIFEST.resource.entryUrl),
        onReady: typeof options.onReady === 'function' ? options.onReady : null,
        onTerminalError: typeof options.onTerminalError === 'function' ? options.onTerminalError : null,
        onGesture: typeof options.onGesture === 'function' ? options.onGesture : null,
        onPlayerIntent: typeof options.onPlayerIntent === 'function' ? options.onPlayerIntent : null
      },
      requestedParameters,
      effectiveParameters,
      parameters: effectiveParameters,
      lastKnownSafeGridSize,
      controllerPosition: { x: effectiveParameters.controllerX, y: effectiveParameters.controllerY },
      startupRecovery,
      pendingParameters: {}, parameterRevision: 0,
      active: false, mounted: false, ready: false, runtimeReady: false, firstFrame: false,
      disposed: false, iframe: null, nonce: '', messageListener: null,
      lifecycleState: 'idle', retryCount: 0, attemptGeneration: 0, attemptFailureScheduled: false,
      readyTimer: null, heartbeatTimer: null,
      recoveryTimer: null, recoveryPlan: [], recoveryCandidate: null, recoveryHeartbeatBaseline: -Infinity,
      lastHeartbeatAt: -Infinity, overBudgetFrames: 0, pendingGestureMove: null, gestureFrame: null,
      latestAudio: null, latestAudioMeta: null, audioTimer: null, lastAudioAt: -Infinity,
      latestMedia: null, lastMediaSignature: '', mediaTimer: null, lastMediaAt: -Infinity,
      diagnosticsState: {
        createdAt: now(), readyAt: 0, propertyBatchesSent: 0, audioFramesSent: 0, audioFramesDropped: 0,
        mediaUpdatesSent: 0, framePacing: 'vrr-driver-managed', requestedFps: 0, fixedFpsLimit: null,
        lastChildDiagnostics: null, lastHeartbeat: null, lastError: ''
      }
    };
  }
  function makeMessage(instance, type, payload) { return Object.assign({ channel: CHANNEL, nonce: instance.nonce, type }, payload || {}); }
  const CHILD_MESSAGE_TYPES = new Set([
    'runtime-ready', 'frame-heartbeat', 'runtime-error', 'context-lost',
    'bundle-request', 'diagnostics', 'gesture', 'player-intent'
  ]);
  const GESTURE_KINDS = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'dblclick', 'wheel']);
  const PLAYER_INTENT_KINDS = new Set(['seek', 'previous', 'next', 'controller-drag']);
  const FORBIDDEN_MESSAGE_KEY = /(?:command|url|path|html)/i;
  function hasForbiddenMessageField(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 3) return false;
    return Object.entries(value).some(([key, child]) => (
      FORBIDDEN_MESSAGE_KEY.test(key) || hasForbiddenMessageField(child, depth + 1)
    ));
  }
  function finiteInRange(value, min, max) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
  }
  function sanitizeHeartbeat(message) {
    const timestamp = finiteInRange(message.timestamp, 0, Number.MAX_SAFE_INTEGER);
    const frameTimeMs = finiteInRange(message.frameTimeMs, 0, MAX_FRAME_TIME_MS);
    const width = finiteInRange(message.width, 1, 32768);
    const height = finiteInRange(message.height, 1, 32768);
    if (timestamp === null || frameTimeMs === null || width === null || height === null) return null;
    return {
      timestamp,
      frameTimeMs,
      width,
      height,
      nonBlack: message.nonBlack === true,
      frameCount: Math.max(1, Math.floor(finiteInRange(message.frameCount ?? 1, 1, Number.MAX_SAFE_INTEGER) || 1))
    };
  }
  function sanitizeGesture(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const kind = String(value.kind || '');
    if (!GESTURE_KINDS.has(kind)) return null;
    const pointerId = finiteInRange(value.pointerId, 0, 0x7fffffff);
    const x = finiteInRange(value.x, 0, 1);
    const y = finiteInRange(value.y, 0, 1);
    const button = finiteInRange(value.button ?? 0, -1, 5);
    const buttons = finiteInRange(value.buttons ?? 0, 0, 31);
    if (pointerId === null || x === null || y === null || button === null || buttons === null) return null;
    const gesture = {
      kind,
      pointerId: Math.floor(pointerId),
      x,
      y,
      button: Math.floor(button),
      buttons: Math.floor(buttons),
      isPrimary: value.isPrimary !== false,
      altKey: value.altKey === true,
      ctrlKey: value.ctrlKey === true,
      metaKey: value.metaKey === true,
      shiftKey: value.shiftKey === true
    };
    if (kind === 'wheel') {
      const deltaX = finiteInRange(value.deltaX ?? 0, -10000, 10000);
      const deltaY = finiteInRange(value.deltaY ?? 0, -10000, 10000);
      const deltaZ = finiteInRange(value.deltaZ ?? 0, -10000, 10000);
      if (deltaX === null || deltaY === null || deltaZ === null) return null;
      Object.assign(gesture, { deltaX, deltaY, deltaZ });
    }
    return gesture;
  }
  function sanitizePlayerIntent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const kind = String(value.kind || '');
    if (!PLAYER_INTENT_KINDS.has(kind)) return null;
    if (kind === 'seek') {
      const ratio = finiteInRange(value.ratio, 0, 1);
      return ratio === null ? null : { kind, ratio };
    }
    if (kind === 'controller-drag') {
      const x = finiteInRange(value.x, 0, 1);
      const y = finiteInRange(value.y, 0, 1);
      return x === null || y === null ? null : { kind, x, y };
    }
    return { kind };
  }
  function sanitizeChildDiagnostics(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = {};
    ['ready', 'bundleFallbackActive', 'bundleBooted', 'nativeIntervalPreserved'].forEach((key) => {
      if (typeof value[key] === 'boolean') result[key] = value[key];
    });
    ['audioFramesReceived', 'propertyBatchesReceived', 'frameCount', 'canvasWidth', 'canvasHeight'].forEach((key) => {
      const numeric = finiteInRange(value[key], 0, Number.MAX_SAFE_INTEGER);
      if (numeric !== null) result[key] = numeric;
    });
    if (value.framePacing === 'vrr-driver-managed') result.framePacing = value.framePacing;
    if (Number(value.requestedFps) === 0) result.requestedFps = 0;
    if (value.fixedFpsLimit === null) result.fixedFpsLimit = null;
    return result;
  }
  function hexBytes(bytes) {
    let hex = '';
    for (let index = 0; index < bytes.length; index += 1) {
      hex += bytes[index].toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
  }
  function ensureBundleSource() {
    if (bundleSourcePromise) return bundleSourcePromise;
    bundleSourcePromise = (async () => {
      const entry = new URL(BUNDLE_SOURCE_URL, global.document?.baseURI || global.location?.href || 'http://localhost/');
      const response = await global.fetch(entry.href);
      if (!response.ok) throw new Error(`bundle source fetch failed: HTTP ${response.status}`);
      const source = await response.text();
      if (BUNDLE_SOURCE_HASH) {
        const digest = await global.crypto?.subtle?.digest?.('SHA-256', new TextEncoder().encode(source));
        if (digest && hexBytes(new Uint8Array(digest)) !== BUNDLE_SOURCE_HASH) {
          throw new Error('bundle source hash mismatch');
        }
      }
      return source;
    })().catch((error) => {
      bundleSourcePromise = null;
      throw error;
    });
    return bundleSourcePromise;
  }
  function deliverBundleSource(instance) {
    ensureBundleSource()
      .then((source) => {
        if (instance.active && !instance.disposed) post(instance, 'bundle-source', { source });
      })
      .catch((error) => {
        instance.diagnosticsState.lastError = String(error?.message || 'bundle source unavailable');
      });
  }
  function post(instance, type, payload) {
    if (!instance.iframe?.contentWindow || !instance.active || !instance.mounted) return false;
    try { instance.iframe.contentWindow.postMessage(makeMessage(instance, type, payload), '*'); return true; }
    catch (error) { instance.diagnosticsState.lastError = error?.message || String(error); return false; }
  }
  function propertyEnvelope(parameters) {
    const envelope = {};
    Object.entries(parameters).forEach(([sourceProperty, value]) => { envelope[sourceProperty] = { value }; });
    return envelope;
  }
  function sendProperties(instance, parameters) {
    if (!instance.ready || Object.keys(parameters).length === 0) return false;
    if (!post(instance, 'properties', { properties: propertyEnvelope(parameters) })) return false;
    instance.diagnosticsState.propertyBatchesSent += 1;
    return true;
  }
  function sendFramePacing(instance) {
    // Wallpaper Engine treats fps=0 as requestAnimationFrame instead of its
    // fixed setTimeout limiter. The compositor/graphics driver can then manage
    // VRR where the user's hardware and OS already support it. This does not
    // claim to enable FreeSync itself.
    if (instance.ready) post(instance, 'general-properties', { properties: { fps: 0 } });
  }
  function updateRecovery(instance, state, reason = '') {
    instance.startupRecovery = recoverySnapshot(
      state,
      instance.requestedParameters.gridSize,
      instance.effectiveParameters.gridSize,
      reason
    );
  }
  function clearReadyTimer(instance) {
    if (instance.readyTimer !== null) global.clearTimeout(instance.readyTimer);
    instance.readyTimer = null;
  }
  function clearHeartbeatTimer(instance) {
    if (instance.heartbeatTimer !== null) global.clearTimeout(instance.heartbeatTimer);
    instance.heartbeatTimer = null;
  }
  function clearRecoveryTimer(instance) {
    if (instance.recoveryTimer !== null) global.clearTimeout(instance.recoveryTimer);
    instance.recoveryTimer = null;
    instance.recoveryPlan = [];
    instance.recoveryCandidate = null;
  }
  function clearGestureFrame(instance) {
    if (instance.gestureFrame !== null) global.cancelAnimationFrame?.(instance.gestureFrame);
    instance.gestureFrame = null;
    instance.pendingGestureMove = null;
  }
  function persistInstance(instance) {
    const persisted = persistSharedState(instance);
    instance.controllerPosition = clone(persisted.controllerPosition);
  }
  function setEffectiveGrid(instance, value) {
    const gridSize = sanitizeOne(DEFINITIONS_BY_KEY.get('gridSize'), value, true);
    if (instance.effectiveParameters.gridSize === gridSize) return false;
    instance.effectiveParameters.gridSize = gridSize;
    instance.parameters = instance.effectiveParameters;
    instance.parameterRevision += 1;
    if (!sendProperties(instance, { gridSize })) instance.pendingParameters.gridSize = gridSize;
    sendFramePacing(instance);
    persistInstance(instance);
    return true;
  }
  function rollbackGrid(instance, reason) {
    clearRecoveryTimer(instance);
    setEffectiveGrid(instance, instance.lastKnownSafeGridSize);
    updateRecovery(instance, 'rolled-back', reason);
    persistInstance(instance);
  }
  function healthIsFresh(instance) {
    return now() - instance.lastHeartbeatAt <= HEARTBEAT_STALE_MS
      && instance.diagnosticsState.lastHeartbeat?.nonBlack === true
      && instance.overBudgetFrames < OVER_BUDGET_LIMIT;
  }
  function scheduleRecoveryObservation(instance, candidate = null) {
    if (!instance.active || !instance.ready || instance.disposed) return;
    if (instance.recoveryTimer !== null) global.clearTimeout(instance.recoveryTimer);
    instance.recoveryCandidate = candidate;
    instance.recoveryHeartbeatBaseline = instance.lastHeartbeatAt;
    const highImpactObservation = (candidate !== null && HIGH_IMPACT_GRID_VALUES.has(candidate))
      || (candidate === null && HIGH_IMPACT_GRID_VALUES.has(instance.requestedParameters.gridSize));
    const observationMs = highImpactObservation
      ? HIGH_IMPACT_HEALTH_OBSERVATION_MS
      : HEALTH_OBSERVATION_MS;
    instance.recoveryTimer = global.setTimeout(() => {
      instance.recoveryTimer = null;
      if (!instance.active || !instance.ready || instance.disposed) return;
      const heartbeatAdvanced = instance.lastHeartbeatAt > instance.recoveryHeartbeatBaseline;
      if (!heartbeatAdvanced || !healthIsFresh(instance)) {
        rollbackGrid(instance, heartbeatAdvanced ? 'frame-time-over-budget' : 'heartbeat-observation-timeout');
        return;
      }
      if (candidate !== null && SAFE_STARTUP_GRID_VALUES.has(candidate)) {
        instance.lastKnownSafeGridSize = candidate;
        persistInstance(instance);
      }
      const nextGrid = instance.recoveryPlan.shift();
      if (nextGrid === undefined) {
        updateRecovery(instance, 'recovered', 'healthy-observation-complete');
        persistInstance(instance);
        return;
      }
      setEffectiveGrid(instance, nextGrid);
      updateRecovery(instance, 'promoting', `observing-grid-${nextGrid}`);
      scheduleRecoveryObservation(instance, nextGrid);
    }, observationMs);
  }
  function beginStartupRecovery(instance) {
    clearRecoveryTimer(instance);
    const requested = instance.requestedParameters.gridSize;
    if (!HIGH_IMPACT_GRID_VALUES.has(requested)) {
      setEffectiveGrid(instance, requested);
      instance.lastKnownSafeGridSize = safeStartupGrid(requested, instance.lastKnownSafeGridSize);
      updateRecovery(instance, 'idle');
      persistInstance(instance);
      return;
    }
    if (instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) {
      setEffectiveGrid(instance, instance.lastKnownSafeGridSize);
    }
    const startIndex = GRID_PROGRESSION.indexOf(instance.lastKnownSafeGridSize);
    const targetIndex = GRID_PROGRESSION.indexOf(requested);
    instance.recoveryPlan = GRID_PROGRESSION.slice(startIndex + 1, targetIndex + 1);
    updateRecovery(instance, 'observing', 'observing-last-known-safe-grid');
    persistInstance(instance);
    scheduleRecoveryObservation(instance, null);
  }
  function armHeartbeatWatchdog(instance) {
    clearHeartbeatTimer(instance);
    const attemptGeneration = instance.attemptGeneration;
    instance.heartbeatTimer = global.setTimeout(() => {
      instance.heartbeatTimer = null;
      if (
        !instance.active || !instance.ready || instance.disposed
        || attemptGeneration !== instance.attemptGeneration
      ) return;
      rollbackGrid(instance, 'heartbeat-timeout');
      scheduleAttemptFailure(instance, 'heartbeat-timeout', attemptGeneration);
    }, HEARTBEAT_STALE_MS);
  }
  function markInstanceReady(instance) {
    if (!instance.active || instance.disposed || instance.ready || !instance.runtimeReady || !instance.firstFrame) return;
    clearReadyTimer(instance);
    instance.ready = true;
    instance.lifecycleState = 'ready';
    instance.diagnosticsState.readyAt = now();
    const initialBatch = Object.assign({}, instance.effectiveParameters, instance.pendingParameters);
    instance.pendingParameters = {};
    sendProperties(instance, initialBatch);
    sendFramePacing(instance);
    armHeartbeatWatchdog(instance);
    instance.options.onReady?.(get(instance));
    beginStartupRecovery(instance);
  }
  function handleHeartbeat(instance, heartbeat) {
    instance.lastHeartbeatAt = now();
    instance.diagnosticsState.lastHeartbeat = clone(heartbeat);
    instance.overBudgetFrames = heartbeat.frameTimeMs > OVER_BUDGET_FRAME_MS
      ? instance.overBudgetFrames + 1
      : 0;
    // A heartbeat proves the child is alive even while a grid/canvas rebuild
    // has invalidated its first-render proof. Re-arm liveness before judging
    // pixels; otherwise one expected false heartbeat leaves the old watchdog
    // armed and tears down an otherwise healthy WebView during recovery.
    if (instance.ready) armHeartbeatWatchdog(instance);
    if (!heartbeat.nonBlack) {
      // Grid changes intentionally invalidate the proof before the next draw.
      // Let the bounded observation window wait for that draw instead of
      // rolling back on the first heartbeat emitted between rebuild and paint.
      if (instance.ready && instance.recoveryTimer === null) {
        scheduleRecoveryObservation(instance, null);
      }
      return;
    }
    if (!instance.firstFrame) instance.firstFrame = true;
    markInstanceReady(instance);
    if (instance.ready) {
      if (instance.overBudgetFrames >= OVER_BUDGET_LIMIT
        && instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) {
        rollbackGrid(instance, 'frame-time-over-budget');
      }
    }
  }
  function finishTerminalError(instance, reason) {
    clearReadyTimer(instance);
    clearHeartbeatTimer(instance);
    clearRecoveryTimer(instance);
    clearGestureFrame(instance);
    instance.ready = false;
    instance.runtimeReady = false;
    instance.firstFrame = false;
    instance.active = false;
    instance.attemptGeneration += 1;
    instance.attemptFailureScheduled = true;
    instance.mounted = false;
    instance.lifecycleState = 'terminal-error';
    instance.diagnosticsState.lastError = String(reason || 'soundscape runtime failed');
    instance.iframe?.remove();
    instance.iframe = null;
    instance.nonce = '';
    updateRecovery(instance, 'terminal-error', instance.diagnosticsState.lastError);
    persistInstance(instance);
    if (instance.messageListener) global.removeEventListener('message', instance.messageListener);
    instance.messageListener = null;
    instance.options.onTerminalError?.(diagnostics(instance));
  }
  function mountAttempt(instance) {
    clearReadyTimer(instance);
    clearHeartbeatTimer(instance);
    clearRecoveryTimer(instance);
    clearGestureFrame(instance);
    instance.attemptGeneration += 1;
    instance.attemptFailureScheduled = false;
    const attemptGeneration = instance.attemptGeneration;
    instance.iframe?.remove();
    instance.ready = false;
    instance.runtimeReady = false;
    instance.firstFrame = false;
    instance.lastHeartbeatAt = -Infinity;
    instance.overBudgetFrames = 0;
    instance.lifecycleState = instance.retryCount ? 'retrying' : 'loading';
    if (instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) {
      instance.effectiveParameters.gridSize = instance.lastKnownSafeGridSize;
      instance.parameters = instance.effectiveParameters;
    }
    updateRecovery(
      instance,
      instance.retryCount ? 'retrying' : (instance.requestedParameters.gridSize === instance.effectiveParameters.gridSize ? 'idle' : 'pending'),
      instance.retryCount ? instance.diagnosticsState.lastError : 'awaiting-trusted-first-frame'
    );
    persistInstance(instance);
    const iframe = global.document.createElement('iframe');
    instance.nonce = randomNonce();
    const entry = new URL(instance.options.entryUrl, global.document?.baseURI || global.location?.href || 'http://localhost/');
    entry.searchParams.set('nonce', instance.nonce);
    iframe.src = entry.href;
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', '音域回响 · CmZya · Wallpaper Engine');
    iframe.setAttribute('aria-label', '音域回响实时音频场景');
    iframe.setAttribute('loading', 'eager');
    iframe.style.width = '100%'; iframe.style.height = '100%'; iframe.style.border = '0'; iframe.style.display = 'block';
    instance.iframe = iframe;
    instance.mounted = true;
    instance.host.appendChild(iframe);
    instance.readyTimer = global.setTimeout(() => {
      instance.readyTimer = null;
      if (!instance.ready) {
        scheduleAttemptFailure(instance, 'trusted-ready-and-first-frame-timeout', attemptGeneration);
      }
    }, READY_TIMEOUT_MS);
  }
  function scheduleAttemptFailure(instance, reason, attemptGeneration = instance.attemptGeneration) {
    if (
      !instance.active || instance.disposed
      || attemptGeneration !== instance.attemptGeneration
      || instance.attemptFailureScheduled
    ) return false;
    instance.attemptFailureScheduled = true;
    global.setTimeout(() => handleAttemptFailure(instance, reason, attemptGeneration), 0);
    return true;
  }
  function handleAttemptFailure(instance, reason, attemptGeneration = instance.attemptGeneration) {
    if (
      !instance.active || instance.disposed
      || attemptGeneration !== instance.attemptGeneration
    ) return;
    instance.diagnosticsState.lastError = String(reason || 'soundscape runtime failed');
    if (instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) rollbackGrid(instance, reason);
    if (instance.retryCount < MAX_READY_RETRIES) {
      instance.retryCount += 1;
      mountAttempt(instance);
      return;
    }
    finishTerminalError(instance, reason);
  }
  function deliverGesture(instance, gesture) {
    if (!instance.ready || !instance.active) return;
    if (gesture.kind !== 'pointermove') {
      if (
        (gesture.kind === 'pointerup' || gesture.kind === 'pointercancel')
        && instance.pendingGestureMove?.pointerId === gesture.pointerId
      ) {
        if (instance.gestureFrame !== null) global.cancelAnimationFrame?.(instance.gestureFrame);
        instance.gestureFrame = null;
        const pending = instance.pendingGestureMove;
        instance.pendingGestureMove = null;
        instance.options.onGesture?.(clone(pending));
      }
      instance.options.onGesture?.(clone(gesture));
      return;
    }
    instance.pendingGestureMove = gesture;
    if (instance.gestureFrame !== null) return;
    instance.gestureFrame = global.requestAnimationFrame(() => {
      instance.gestureFrame = null;
      const pending = instance.pendingGestureMove;
      instance.pendingGestureMove = null;
      if (pending && instance.ready && instance.active) instance.options.onGesture?.(clone(pending));
    });
  }
  function activate(runtime) {
    const instance = assertRuntime(runtime);
    if (instance.active) return instance;
    instance.active = true;
    instance.retryCount = 0;
    instance.messageListener = (event) => {
      const message = event?.data;
      if (event?.source !== instance.iframe?.contentWindow) return;
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.channel !== CHANNEL || message.nonce !== instance.nonce) return;
      if (!CHILD_MESSAGE_TYPES.has(message.type) || hasForbiddenMessageField(message)) return;
      if (message.type === 'runtime-ready') {
        instance.runtimeReady = true;
        markInstanceReady(instance);
      } else if (message.type === 'frame-heartbeat') {
        const heartbeat = sanitizeHeartbeat(message);
        if (heartbeat) handleHeartbeat(instance, heartbeat);
      } else if (message.type === 'bundle-request') {
        deliverBundleSource(instance);
      } else if (message.type === 'diagnostics') {
        const childDiagnostics = sanitizeChildDiagnostics(message.diagnostics);
        if (childDiagnostics) instance.diagnosticsState.lastChildDiagnostics = childDiagnostics;
      } else if (message.type === 'runtime-error') {
        const reason = String(message.message || '音域回响子运行时错误').slice(0, 1000);
        if (instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) rollbackGrid(instance, reason);
        scheduleAttemptFailure(instance, reason);
      } else if (message.type === 'context-lost') {
        const reason = String(message.reason || 'webgl-context-lost').slice(0, 160);
        rollbackGrid(instance, reason);
        scheduleAttemptFailure(instance, reason);
      } else if (message.type === 'gesture') {
        const gesture = sanitizeGesture(message.gesture);
        if (gesture) deliverGesture(instance, gesture);
      } else if (message.type === 'player-intent') {
        const intent = sanitizePlayerIntent(message.intent);
        if (intent && instance.ready && instance.active) instance.options.onPlayerIntent?.(clone(intent));
      }
    };
    global.addEventListener('message', instance.messageListener);
    mountAttempt(instance);
    return instance;
  }
  function cancelPending(instance) {
    if (instance.audioTimer !== null) { global.clearTimeout(instance.audioTimer); instance.audioTimer = null; }
    if (instance.mediaTimer !== null) { global.clearTimeout(instance.mediaTimer); instance.mediaTimer = null; }
    instance.latestAudio = null; instance.latestAudioMeta = null; instance.latestMedia = null;
  }
  function deactivate(runtime) {
    if (!isRuntime(runtime) || runtime.disposed) return runtime;
    cancelPending(runtime);
    clearReadyTimer(runtime);
    clearHeartbeatTimer(runtime);
    clearRecoveryTimer(runtime);
    clearGestureFrame(runtime);
    if (runtime.messageListener) global.removeEventListener('message', runtime.messageListener);
    runtime.messageListener = null;
    runtime.iframe?.remove();
    runtime.iframe = null; runtime.nonce = ''; runtime.active = false; runtime.mounted = false; runtime.ready = false;
    runtime.runtimeReady = false; runtime.firstFrame = false; runtime.lifecycleState = 'inactive';
    runtime.attemptGeneration += 1; runtime.attemptFailureScheduled = false;
    return runtime;
  }
  function apply(runtime, changes) {
    const sanitized = sanitizeChanges(changes, true);
    if (Object.keys(sanitized).length === 0) return {};
    if (runtime == null) {
      const next = {
        requestedParameters: { ...sharedState.requestedParameters },
        effectiveParameters: { ...sharedState.effectiveParameters },
        lastKnownSafeGridSize: sharedState.lastKnownSafeGridSize,
        controllerPosition: { ...sharedState.controllerPosition }
      };
      Object.entries(sanitized).forEach(([key, value]) => {
        next.requestedParameters[key] = value;
        if (key === 'gridSize') {
          if (HIGH_IMPACT_GRID_VALUES.has(value)) next.effectiveParameters.gridSize = next.lastKnownSafeGridSize;
          else {
            next.effectiveParameters.gridSize = value;
            next.lastKnownSafeGridSize = safeStartupGrid(value, next.lastKnownSafeGridSize);
          }
        } else next.effectiveParameters[key] = value;
      });
      next.controllerPosition = {
        x: next.effectiveParameters.controllerX,
        y: next.effectiveParameters.controllerY
      };
      persistSharedState(next);
      return clone(sanitized);
    }
    const instance = assertRuntime(runtime);
    const changedRequested = {};
    const changedEffective = {};
    let gridRequested = null;
    Object.entries(sanitized).forEach(([sourceProperty, value]) => {
      if (instance.requestedParameters[sourceProperty] !== value) {
        instance.requestedParameters[sourceProperty] = value;
        changedRequested[sourceProperty] = value;
      }
      if (sourceProperty === 'gridSize') {
        gridRequested = value;
      } else if (instance.effectiveParameters[sourceProperty] !== value) {
        instance.effectiveParameters[sourceProperty] = value;
        changedEffective[sourceProperty] = value;
      }
    });
    if (gridRequested !== null && !HIGH_IMPACT_GRID_VALUES.has(gridRequested)) {
      clearRecoveryTimer(instance);
      instance.lastKnownSafeGridSize = safeStartupGrid(gridRequested, instance.lastKnownSafeGridSize);
      if (instance.effectiveParameters.gridSize !== gridRequested) {
        instance.effectiveParameters.gridSize = gridRequested;
        changedEffective.gridSize = gridRequested;
      }
      updateRecovery(instance, 'idle');
    } else if (gridRequested !== null) {
      if (instance.effectiveParameters.gridSize !== instance.lastKnownSafeGridSize) {
        instance.effectiveParameters.gridSize = instance.lastKnownSafeGridSize;
        changedEffective.gridSize = instance.lastKnownSafeGridSize;
      }
      updateRecovery(instance, 'pending', instance.ready ? 'awaiting-healthy-observation' : 'awaiting-trusted-first-frame');
    }
    if (!Object.keys(changedRequested).length && !Object.keys(changedEffective).length) {
      if (gridRequested !== null && instance.ready && HIGH_IMPACT_GRID_VALUES.has(gridRequested)) beginStartupRecovery(instance);
      return clone(sanitized);
    }
    instance.parameters = instance.effectiveParameters;
    instance.controllerPosition = {
      x: instance.effectiveParameters.controllerX,
      y: instance.effectiveParameters.controllerY
    };
    instance.parameterRevision += 1;
    persistInstance(instance);
    if (!sendProperties(instance, changedEffective)) Object.assign(instance.pendingParameters, changedEffective);
    if (gridRequested !== null) sendFramePacing(instance);
    if (gridRequested !== null && instance.ready && HIGH_IMPACT_GRID_VALUES.has(gridRequested)) beginStartupRecovery(instance);
    return clone(changedRequested);
  }
  function get(runtime, sourceProperty) {
    if (typeof runtime === 'string' && sourceProperty === undefined) { sourceProperty = runtime; runtime = null; }
    const parameters = isRuntime(runtime) ? runtime.effectiveParameters : sharedState.effectiveParameters;
    if (sourceProperty !== undefined) return clone(parameters[sourceProperty]);
    if (!isRuntime(runtime)) return clone(parameters);
    return {
      id: MANIFEST.id, active: runtime.active, mounted: runtime.mounted, ready: runtime.ready, disposed: runtime.disposed,
      lifecycleState: runtime.lifecycleState,
      retryCount: runtime.retryCount,
      parameterRevision: runtime.parameterRevision,
      parameters: clone(runtime.effectiveParameters),
      requestedParameters: clone(runtime.requestedParameters),
      effectiveParameters: clone(runtime.effectiveParameters),
      lastKnownSafeGridSize: runtime.lastKnownSafeGridSize,
      controllerPosition: clone(runtime.controllerPosition),
      startupRecovery: clone(runtime.startupRecovery),
      pendingParameters: clone(runtime.pendingParameters)
    };
  }
  function normalizeAudio(input) {
    if (!input || typeof input.length !== 'number') return new Float32Array(0);
    const inputLength = Math.max(0, Math.floor(Number(input.length) || 0));
    const outputLength = Math.min(512, inputLength);
    const result = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const sourceIndex = inputLength > outputLength ? Math.floor(index * inputLength / outputLength) : index;
      const raw = Number(input[sourceIndex]) || 0;
      result[index] = Math.max(0, Math.min(1, raw > 1 ? raw / 255 : raw));
    }
    return result;
  }
  function sendLatestAudio(instance) {
    instance.audioTimer = null;
    if (!instance.active || !instance.ready || !instance.latestAudio || global.document?.visibilityState === 'hidden') return false;
    const values = normalizeAudio(instance.latestAudio);
    const meta = instance.latestAudioMeta || {};
    instance.latestAudio = null; instance.latestAudioMeta = null;
    if (!post(instance, 'audio-frame', { values, meta })) return false;
    instance.lastAudioAt = now(); instance.diagnosticsState.audioFramesSent += 1;
    return true;
  }
  function updateAudio(runtime, values, meta = {}) {
    if (!isRuntime(runtime) || runtime.disposed || !runtime.active || !runtime.ready || global.document?.visibilityState === 'hidden') {
      if (isRuntime(runtime)) runtime.diagnosticsState.audioFramesDropped += 1;
      return false;
    }
    runtime.latestAudio = values; runtime.latestAudioMeta = meta;
    if (runtime.audioTimer !== null) return true;
    const delay = Math.max(0, AUDIO_INTERVAL_MS - (now() - runtime.lastAudioAt));
    runtime.audioTimer = global.setTimeout(() => sendLatestAudio(runtime), delay);
    return true;
  }
  function cleanMedia(media) {
    const source = media && typeof media === 'object' ? media : {};
    return {
      title: String(source.title || '').slice(0, 512), artist: String(source.artist || '').slice(0, 512),
      thumbnail: String(source.thumbnail || '').slice(0, 2_000_000), primaryColor: String(source.primaryColor || '').slice(0, 64),
      textColor: String(source.textColor || '').slice(0, 64), isPlaying: source.isPlaying === true,
      position: Math.max(0, Number(source.position) || 0), duration: Math.max(0, Number(source.duration) || 0)
    };
  }
  function sendLatestMedia(instance) {
    instance.mediaTimer = null;
    if (!instance.active || !instance.ready || !instance.latestMedia) return false;
    // Sanitize only at the 4 Hz send boundary. The app can report progress every
    // animation frame, and repeatedly slicing artwork strings on those calls is wasteful.
    const media = cleanMedia(instance.latestMedia); instance.latestMedia = null;
    const signature = JSON.stringify(media);
    if (signature === instance.lastMediaSignature) return false;
    if (!post(instance, 'media-state', { media })) return false;
    instance.lastMediaSignature = signature; instance.lastMediaAt = now(); instance.diagnosticsState.mediaUpdatesSent += 1;
    return true;
  }
  function updateMedia(runtime, media) {
    if (!isRuntime(runtime) || runtime.disposed || !runtime.active || !runtime.ready) return false;
    runtime.latestMedia = media;
    if (runtime.mediaTimer !== null) return true;
    const delay = Math.max(0, MEDIA_INTERVAL_MS - (now() - runtime.lastMediaAt));
    runtime.mediaTimer = global.setTimeout(() => sendLatestMedia(runtime), delay);
    return true;
  }
  function diagnostics(runtime) {
    if (!isRuntime(runtime)) {
      return { id: MANIFEST.id, active: false, mounted: false, ready: false, disposed: false, parameterRevision: 0,
        lifecycleState: 'idle', retryCount: 0,
        parameters: clone(sharedState.effectiveParameters),
        requestedParameters: clone(sharedState.requestedParameters),
        effectiveParameters: clone(sharedState.effectiveParameters),
        lastKnownSafeGridSize: sharedState.lastKnownSafeGridSize,
        controllerPosition: clone(sharedState.controllerPosition),
        startupRecovery: recoverySnapshot(
          sharedState.requestedParameters.gridSize === sharedState.effectiveParameters.gridSize ? 'idle' : 'pending',
          sharedState.requestedParameters.gridSize,
          sharedState.effectiveParameters.gridSize,
          sharedState.requestedParameters.gridSize === sharedState.effectiveParameters.gridSize ? '' : 'awaiting-trusted-first-frame'
        ),
        performance: {
          audioHz: 30, mediaHz: 4, framePacing: 'vrr-driver-managed', requestedFps: 0, fixedFpsLimit: null
        } };
    }
    const snapshot = get(runtime);
    snapshot.performance = {
      audioHz: 30, mediaHz: 4,
      framePacing: runtime.diagnosticsState.framePacing,
      requestedFps: runtime.diagnosticsState.requestedFps,
      fixedFpsLimit: runtime.diagnosticsState.fixedFpsLimit,
      propertyBatchesSent: runtime.diagnosticsState.propertyBatchesSent, audioFramesSent: runtime.diagnosticsState.audioFramesSent,
      audioFramesDropped: runtime.diagnosticsState.audioFramesDropped, mediaUpdatesSent: runtime.diagnosticsState.mediaUpdatesSent
    };
    snapshot.readyAt = runtime.diagnosticsState.readyAt;
    snapshot.lastHeartbeatAt = Number.isFinite(runtime.lastHeartbeatAt) ? runtime.lastHeartbeatAt : null;
    snapshot.lastHeartbeat = clone(runtime.diagnosticsState.lastHeartbeat);
    snapshot.lastChildDiagnostics = clone(runtime.diagnosticsState.lastChildDiagnostics);
    snapshot.lastError = runtime.diagnosticsState.lastError;
    return snapshot;
  }
  function dispose(runtime) {
    if (!isRuntime(runtime) || runtime.disposed) return;
    deactivate(runtime); runtime.disposed = true; runtime.host = null;
    runtime.options.onReady = null;
    runtime.options.onTerminalError = null;
    runtime.options.onGesture = null;
    runtime.options.onPlayerIntent = null;
  }

  global.FeSoundscapeRuntime = Object.freeze({
    manifest: MANIFEST, catalog, create, activate, deactivate, apply, get, dispose, diagnostics, updateAudio, updateMedia
  });
})(typeof window !== 'undefined' ? window : globalThis);
