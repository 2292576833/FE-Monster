import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'web', 'assets', 'soundscape-workshop');
const plain = (value) => JSON.parse(JSON.stringify(value));

const expectedAssets = Object.freeze({
  'assets/index-CSU_B_T9.js': 'E84063E440609AAE4DAD2B728FB8E419F78ABC7E37D8E030F3067DBD90183FEB',
  'assets/index-DgmMz9-g.css': 'F9C0AC4D4B38D2F257F21A9521D697E2BDB872023C170786AFC79D073F58A7F0',
  'index.html': '7F7D820A6A8128B9298D4C8A93B12226852E67E4F45DE898A77DEDAC3BD69C9B',
  'preview.gif': '46A00ED397AAF9B97C5D17879EF00597DF99D73051D2F27F196AF0240454610B',
  'project.json': 'D8114CE1871F051B29817B89D463F0D7A60CEE04954864BE19487027352753AD'
});

for (const [relativePath, expectedHash] of Object.entries(expectedAssets)) {
  const bytes = fs.readFileSync(path.join(assetRoot, relativePath));
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  assert.equal(actualHash, expectedHash, `${relativePath} must remain byte-for-byte identical to the Workshop source`);
}

const windowListeners = new Map();
const animationFrames = new Map();
let animationFrameId = 0;
const createdIframes = [];
const storedSettings = new Map();

function addWindowListener(type, listener) {
  if (!windowListeners.has(type)) windowListeners.set(type, new Set());
  windowListeners.get(type).add(listener);
}

function removeWindowListener(type, listener) {
  if (windowListeners.has(type)) windowListeners.get(type).delete(listener);
}

function dispatchWindowMessage(source, data) {
  for (const listener of windowListeners.get('message') || []) {
    listener({ source, data, origin: 'null' });
  }
}

function flushAnimationFrames() {
  const pending = [...animationFrames.values()];
  animationFrames.clear();
  pending.forEach((callback) => callback(1000));
}

function createFakeIframe() {
  const attributes = new Map();
  const contentWindow = {
    messages: [],
    postMessage(message, targetOrigin) {
      this.messages.push({ message, targetOrigin });
    }
  };
  const iframe = {
    tagName: 'IFRAME',
    style: {},
    attributes,
    contentWindow,
    isConnected: false,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
  };
  createdIframes.push(iframe);
  return iframe;
}

function createFakeHost() {
  return {
    nodeType: 1,
    isConnected: true,
    hidden: false,
    children: [],
    appendChild(node) {
      node.parentNode = this;
      node.isConnected = true;
      this.children.push(node);
      return node;
    },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index >= 0) this.children.splice(index, 1);
      node.parentNode = null;
      node.isConnected = false;
      return node;
    }
  };
}

const runtimeSource = fs.readFileSync(path.join(root, 'web', 'soundscape-runtime.js'), 'utf8');
assert.doesNotMatch(
  runtimeSource,
  /(?:amd|radeon|nvidia|geforce)/iu,
  'VRR frame pacing must remain GPU-vendor neutral for AMD and NVIDIA hardware'
);
const runtimeContext = {
  console,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem(key) {
      return storedSettings.has(key) ? storedSettings.get(key) : null;
    },
    setItem(key, value) {
      storedSettings.set(key, String(value));
    }
  },
  performance: { now: () => 1000 },
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
  location: { href: 'http://127.0.0.1:3081/', origin: 'http://127.0.0.1:3081' },
  addEventListener: addWindowListener,
  removeEventListener: removeWindowListener,
  requestAnimationFrame(callback) {
    const id = ++animationFrameId;
    animationFrames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) {
    animationFrames.delete(id);
  },
  document: {
    baseURI: 'http://127.0.0.1:3081/',
    currentScript: { src: 'http://127.0.0.1:3081/soundscape-runtime.js' },
    visibilityState: 'visible',
    createElement(tagName) {
      if (String(tagName).toLowerCase() !== 'iframe') throw new Error(`unexpected element ${tagName}`);
      return createFakeIframe();
    }
  }
};
runtimeContext.window = runtimeContext;
runtimeContext.globalThis = runtimeContext;
vm.createContext(runtimeContext);
vm.runInContext(runtimeSource, runtimeContext, { filename: 'soundscape-runtime.js' });

const runtime = runtimeContext.FeSoundscapeRuntime;
assert.ok(runtime, 'the public FeSoundscapeRuntime interface must exist');
assert.equal(runtime.manifest.id, 'soundscape-workshop');
assert.equal(runtime.manifest.title, '音域回响');
assert.equal(runtime.manifest.author, 'CmZya');
assert.equal(runtime.manifest.platform, 'Wallpaper Engine');
assert.deepEqual(
  JSON.parse(JSON.stringify(runtime.manifest.resource)),
  {
    kind: 'sandboxed-web',
    entryUrl: 'assets/soundscape-workshop/runtime.html',
    previewUrl: 'assets/soundscape-workshop/preview.gif'
  }
);

function loadRuntimeWithPersistedSettings(settingsStore) {
  const listeners = new Map();
  const context = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) {
        return settingsStore.has(key) ? settingsStore.get(key) : null;
      },
      setItem(key, value) {
        settingsStore.set(key, String(value));
      },
      removeItem(key) {
        settingsStore.delete(key);
      }
    },
    performance: { now: () => 1000 },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000002' },
    location: { href: 'http://127.0.0.1:3081/', origin: 'http://127.0.0.1:3081' },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    document: {
      baseURI: 'http://127.0.0.1:3081/',
      currentScript: { src: 'http://127.0.0.1:3081/soundscape-runtime.js' },
      visibilityState: 'visible',
      createElement(tagName) {
        if (String(tagName).toLowerCase() !== 'iframe') throw new Error(`unexpected element ${tagName}`);
        return createFakeIframe();
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(runtimeSource, context, { filename: 'soundscape-runtime-seeded.js' });
  return context.FeSoundscapeRuntime;
}

function createManualRuntimeHarness(settingsStore = new Map()) {
  const listeners = new Map();
  const timers = new Map();
  const iframes = [];
  let clock = 1000;
  let timerId = 0;
  let nonceId = 0;
  const schedule = (callback, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { callback, at: clock + Math.max(0, Number(delay) || 0) });
    return id;
  };
  const cancel = (id) => timers.delete(id);
  const advance = (milliseconds) => {
    const target = clock + Math.max(0, Number(milliseconds) || 0);
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      clock = timer.at;
      timer.callback();
    }
    clock = target;
  };
  const makeIframe = () => {
    const iframe = createFakeIframe();
    iframes.push(iframe);
    return iframe;
  };
  const context = {
    console,
    URL,
    URLSearchParams,
    setTimeout: schedule,
    clearTimeout: cancel,
    requestAnimationFrame(callback) { return schedule(() => callback(clock), 16); },
    cancelAnimationFrame: cancel,
    localStorage: {
      getItem(key) { return settingsStore.has(key) ? settingsStore.get(key) : null; },
      setItem(key, value) { settingsStore.set(key, String(value)); },
      removeItem(key) { settingsStore.delete(key); }
    },
    performance: { now: () => clock },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++nonceId).padStart(12, '0')}` },
    location: { href: 'http://127.0.0.1:3081/', origin: 'http://127.0.0.1:3081' },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    document: {
      baseURI: 'http://127.0.0.1:3081/',
      currentScript: { src: 'http://127.0.0.1:3081/soundscape-runtime.js' },
      visibilityState: 'visible',
      createElement(tagName) {
        if (String(tagName).toLowerCase() !== 'iframe') throw new Error(`unexpected element ${tagName}`);
        return makeIframe();
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(runtimeSource, context, { filename: 'soundscape-runtime-manual.js' });
  return {
    api: context.FeSoundscapeRuntime,
    context,
    settingsStore,
    iframes,
    advance,
    dispatch(source, data) {
      for (const listener of listeners.get('message') || []) listener({ source, data, origin: 'null' });
    }
  };
}

const highImpactStorageKey = 'fe-monster.soundscape-workshop.settings.v1';
const versionTwoStorageKey = 'fe-monster.soundscape-workshop.settings.v2';
const canonicalStorageKey = 'fe-monster-soundscape-workshop-settings-v3';
const exactOrdinaryParameters = {
  theme: 'ember-fire',
  themeCycleInterval: 110,
  peakColorEnabled: false,
  peakColorIntensity: 1.7,
  audioIntensity: 1.2,
  responseRange: 1.4,
  pulseEnabled: false,
  pulseSensitivity: 0.31,
  pulseCooldown: 75,
  meteorEnabled: false,
  meteorSensitivity: 0.55,
  meteorCooldown: 230,
  meteorClickEnabled: false,
  idleWaveEnabled: false,
  idleWaveDebounce: 2.5,
  idleWaveFadeDuration: 3.5,
  cameraDistance: 70,
  cameraAngleX: 215,
  cameraAngleY: 45,
  autoRotateEnabled: true,
  autoRotateSpeed: 27,
  showPlayerController: false,
  showAlbumCover: false,
  controllerSize: 'medium',
  controllerX: 19,
  controllerY: 27
};
const highImpactStoredSettings = new Map([[
  highImpactStorageKey,
  JSON.stringify({ gridSize: 4096, ...exactOrdinaryParameters })
]]);
const recoveredRuntime = loadRuntimeWithPersistedSettings(highImpactStoredSettings);
const recoveredInstance = recoveredRuntime.create(createFakeHost());
const recoveredSnapshot = recoveredRuntime.get(recoveredInstance);
assert.equal(recoveredSnapshot.parameters.gridSize, 160, 'startup must render from the safe grid');
assert.equal(
  recoveredSnapshot.requestedParameters.gridSize,
  4096,
  'migration must preserve the requested high-impact grid'
);
assert.equal(recoveredSnapshot.effectiveParameters.gridSize, 160);
for (const [key, value] of Object.entries(exactOrdinaryParameters)) {
  assert.equal(recoveredSnapshot.requestedParameters[key], value, `requested ${key} must migrate exactly`);
  assert.equal(recoveredSnapshot.effectiveParameters[key], value, `effective ${key} must migrate exactly`);
}
const migratedState = JSON.parse(highImpactStoredSettings.get(canonicalStorageKey));
assert.equal(migratedState.version, 2);
assert.equal(migratedState.requestedParameters.gridSize, 4096);
assert.equal(migratedState.effectiveParameters.gridSize, 160);
assert.equal(migratedState.lastKnownSafeGridSize, 160);
assert.deepEqual(migratedState.controllerPosition, { x: 19, y: 27 });
assert.equal(
  highImpactStoredSettings.has(highImpactStorageKey),
  false,
  'migration must remove the obsolete local-only key after the canonical copy is durable'
);
recoveredRuntime.apply(recoveredInstance, { gridSize: 4096 });
assert.equal(
  recoveredRuntime.get(recoveredInstance).requestedParameters.gridSize,
  4096,
  'an explicit request must remain durable while the effective grid is health-gated'
);

const versionTwoStoredSettings = new Map([[
  versionTwoStorageKey,
  JSON.stringify({
    version: 2,
    requestedParameters: { gridSize: 1080, ...exactOrdinaryParameters },
    effectiveParameters: { gridSize: 320, ...exactOrdinaryParameters },
    lastKnownSafeGridSize: 320,
    controllerPosition: { x: 19, y: 27 },
    updatedAt: 77
  })
]]);
const versionTwoRuntime = loadRuntimeWithPersistedSettings(versionTwoStoredSettings);
const versionTwoSnapshot = versionTwoRuntime.get(versionTwoRuntime.create(createFakeHost()));
assert.equal(versionTwoSnapshot.requestedParameters.gridSize, 1080);
assert.equal(versionTwoSnapshot.effectiveParameters.gridSize, 320);
assert.equal(versionTwoSnapshot.parameters.gridSize, 320, 'legacy parameters must alias effective values');
assert.equal(versionTwoSnapshot.lastKnownSafeGridSize, 320);
assert.deepEqual(plain(versionTwoSnapshot.controllerPosition), { x: 19, y: 27 });
assert.equal(versionTwoStoredSettings.has(versionTwoStorageKey), false);
assert.equal(
  JSON.parse(versionTwoStoredSettings.get(canonicalStorageKey)).requestedParameters.gridSize,
  1080,
  'v2 settings must migrate to the backend-compatible canonical key'
);

// A fresh app execution context may still hold default-valued controls while
// mounting the scene. Those bootstrap defaults must not overwrite durable user
// preferences recovered by the runtime.
const appBootstrapStoredSettings = new Map(versionTwoStoredSettings);
const appBootstrapRuntime = loadRuntimeWithPersistedSettings(appBootstrapStoredSettings);
const appBootstrapInstance = appBootstrapRuntime.create(createFakeHost(), {
  initialParameters: appBootstrapRuntime.get(null)
});
const appBootstrapSnapshot = appBootstrapRuntime.get(appBootstrapInstance);
for (const [key, value] of Object.entries(exactOrdinaryParameters)) {
  assert.equal(
    appBootstrapSnapshot.requestedParameters[key],
    value,
    `fresh app bootstrap must preserve persisted requested ${key}`
  );
  assert.equal(
    appBootstrapSnapshot.effectiveParameters[key],
    value,
    `fresh app bootstrap must preserve persisted effective ${key}`
  );
}
assert.equal(appBootstrapSnapshot.requestedParameters.gridSize, 1080);
assert.equal(appBootstrapSnapshot.effectiveParameters.gridSize, 320);
assert.deepEqual(plain(appBootstrapSnapshot.controllerPosition), { x: 19, y: 27 });

const parameterCatalog = runtime.catalog().parameters;
const parameterCatalogPlain = JSON.parse(JSON.stringify(parameterCatalog));
const expectedParameterKeys = [
  'gridSize',
  'theme',
  'themeCycleInterval',
  'peakColorEnabled',
  'peakColorIntensity',
  'audioIntensity',
  'responseRange',
  'pulseEnabled',
  'pulseSensitivity',
  'pulseCooldown',
  'meteorEnabled',
  'meteorSensitivity',
  'meteorCooldown',
  'meteorClickEnabled',
  'idleWaveEnabled',
  'idleWaveDebounce',
  'idleWaveFadeDuration',
  'cameraDistance',
  'cameraAngleX',
  'cameraAngleY',
  'autoRotateEnabled',
  'autoRotateSpeed',
  'showPlayerController',
  'showAlbumCover',
  'controllerSize',
  'controllerX',
  'controllerY'
];
assert.deepEqual(parameterCatalogPlain.map((item) => item.key), expectedParameterKeys);
assert.ok(parameterCatalogPlain.every((item) => item.sourceProperty === item.key));

const gridParameter = parameterCatalogPlain.find((item) => item.key === 'gridSize');
assert.equal(gridParameter.default, 160);
assert.deepEqual(gridParameter.options.map((item) => item.value), [120, 160, 320, 640, 1080, 4096]);
assert.deepEqual(gridParameter.highImpactValues, [640, 1080, 4096]);
assert.equal(gridParameter.options.find((item) => item.value === 120).loadTier, 'standard');
assert.equal(gridParameter.options.find((item) => item.value === 320).loadTier, 'elevated');
assert.equal(gridParameter.options.find((item) => item.value === 4096).loadTier, 'extreme');
assert.equal(gridParameter.options.find((item) => item.value === 4096).highImpact, true);

for (const method of ['create', 'activate', 'deactivate', 'apply', 'get', 'dispose', 'diagnostics', 'updateAudio', 'updateMedia']) {
  assert.equal(typeof runtime[method], 'function', `FeSoundscapeRuntime.${method} must be public`);
}

const host = createFakeHost();
const instance = runtime.create(host, { initialParameters: { audioIntensity: 1.2 } });
const createdSnapshot = JSON.parse(JSON.stringify(runtime.get(instance)));
assert.equal(createdSnapshot.id, 'soundscape-workshop');
assert.equal(createdSnapshot.active, false);
assert.equal(createdSnapshot.mounted, false);
assert.equal(createdSnapshot.ready, false);
assert.equal(createdSnapshot.disposed, false);
assert.equal(createdSnapshot.parameterRevision, 0);
assert.equal(createdSnapshot.parameters.gridSize, 160);
assert.equal(createdSnapshot.parameters.audioIntensity, 1.2);
assert.deepEqual(plain(createdSnapshot.parameters), plain(createdSnapshot.effectiveParameters));
assert.deepEqual(plain(createdSnapshot.requestedParameters), plain(createdSnapshot.effectiveParameters));
assert.equal(createdSnapshot.lastKnownSafeGridSize, 160);
assert.deepEqual(plain(createdSnapshot.controllerPosition), { x: 2, y: 3 });
assert.deepEqual(plain(createdSnapshot.startupRecovery), {
  state: 'idle',
  requestedGridSize: 160,
  effectiveGridSize: 160,
  reason: ''
});
assert.deepEqual(plain(createdSnapshot.pendingParameters), {});

runtime.activate(instance);
assert.equal(host.children.length, 1);
const activeIframe = host.children[0];
assert.equal(activeIframe.getAttribute('sandbox'), 'allow-scripts');
assert.doesNotMatch(activeIframe.getAttribute('sandbox'), /allow-same-origin/);
assert.equal(activeIframe.getAttribute('referrerpolicy'), 'no-referrer');
const activeUrl = new URL(activeIframe.src);
assert.equal(activeUrl.pathname, '/assets/soundscape-workshop/runtime.html');
const activeNonce = activeUrl.searchParams.get('nonce');
assert.ok(activeNonce);
assert.equal(runtime.get(instance).ready, false);

dispatchWindowMessage({}, { channel: 'fe-soundscape:v1', nonce: activeNonce, type: 'runtime-ready' });
assert.equal(runtime.get(instance).ready, false, 'a forged event.source must be ignored');
dispatchWindowMessage(activeIframe.contentWindow, { channel: 'fe-soundscape:v1', nonce: 'wrong', type: 'runtime-ready' });
assert.equal(runtime.get(instance).ready, false, 'a forged nonce must be ignored');
dispatchWindowMessage(activeIframe.contentWindow, { channel: 'fe-soundscape:v1', nonce: activeNonce, type: 'runtime-ready' });
assert.equal(runtime.get(instance).ready, false, 'runtime-ready alone must not claim a rendered frame');
dispatchWindowMessage(activeIframe.contentWindow, {
  channel: 'fe-soundscape:v1', nonce: activeNonce, type: 'frame-heartbeat',
  timestamp: Number.POSITIVE_INFINITY, frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
});
assert.equal(runtime.get(instance).ready, false, 'non-finite health fields must be ignored');
dispatchWindowMessage(activeIframe.contentWindow, {
  channel: 'fe-soundscape:v1', nonce: activeNonce, type: 'frame-heartbeat',
  timestamp: 1000, frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
});
assert.equal(runtime.get(instance).ready, true, 'trusted ready plus first-frame heartbeat must mark ready');

const initialPropertyMessages = activeIframe.contentWindow.messages.filter(({ message }) => message.type === 'properties');
assert.equal(initialPropertyMessages.length, 1, 'all initial properties should cross the sandbox in one batch');
assert.equal(Object.keys(initialPropertyMessages[0].message.properties).length, 27);
assert.equal(
  activeIframe.contentWindow.messages.find(({ message }) => message.type === 'general-properties').message.properties.fps,
  0,
  'the scene should use requestAnimationFrame so the graphics driver can manage VRR without a fixed cap'
);

runtime.apply(instance, { audioIntensity: 1.5, gridSize: 320 });
assert.equal(runtime.get(instance, 'audioIntensity'), 1.5);
assert.equal(runtime.get(instance, 'gridSize'), 320);
assert.equal(runtime.get(instance).parameterRevision, 1);
const propertyMessagesAfterApply = activeIframe.contentWindow.messages.filter(({ message }) => message.type === 'properties');
assert.equal(propertyMessagesAfterApply.length, 2, 'a multi-property change should remain one bridge batch');
assert.deepEqual(
  JSON.parse(JSON.stringify(propertyMessagesAfterApply.at(-1).message.properties)),
  { audioIntensity: { value: 1.5 }, gridSize: { value: 320 } }
);
assert.equal(
  activeIframe.contentWindow.messages.filter(({ message }) => message.type === 'general-properties').at(-1).message.properties.fps,
  0,
  'changing grid density must not introduce a fixed frame-rate limit'
);
const storedVersionTwo = JSON.parse(storedSettings.get(canonicalStorageKey));
assert.equal(storedVersionTwo.version, 2);
assert.equal(storedVersionTwo.requestedParameters.gridSize, 320);
assert.equal(storedVersionTwo.effectiveParameters.gridSize, 320);

assert.throws(
  () => runtime.apply(instance, { cameraDistance: 500, theme: 'not-a-theme' }),
  /必须在|不支持/,
  'invalid batches must be rejected before changing any setting'
);
assert.equal(runtime.get(instance, 'cameraDistance'), 85);
assert.equal(runtime.get(instance, 'theme'), 'nocturnal');

const audioMessagesBefore = activeIframe.contentWindow.messages.filter(({ message }) => message.type === 'audio-frame').length;
assert.equal(runtime.updateAudio(instance, new Uint8Array([0, 128, 255]), { playing: true }), true);
assert.equal(runtime.updateAudio(instance, new Uint8Array([255, 64, 0]), { playing: true }), true);
await new Promise((resolve) => setTimeout(resolve, 10));
const audioMessages = activeIframe.contentWindow.messages.filter(({ message }) => message.type === 'audio-frame');
assert.equal(audioMessages.length, audioMessagesBefore + 1, 'same-frame audio updates should coalesce at the 30 Hz boundary');
assert.equal(audioMessages.at(-1).message.values.length, 3);
assert.ok(Math.abs(audioMessages.at(-1).message.values[0] - 1) < 0.0001, 'the newest normalized frame should be delivered');

assert.equal(runtime.updateMedia(instance, { title: 'Signal', artist: 'CmZya', isPlaying: true, position: 12, duration: 180 }), true);
await new Promise((resolve) => setTimeout(resolve, 10));
const mediaMessage = activeIframe.contentWindow.messages.find(({ message }) => message.type === 'media-state');
assert.equal(mediaMessage.message.media.title, 'Signal');
assert.equal(mediaMessage.message.media.isPlaying, true);

const diagnostics = runtime.diagnostics(instance);
assert.equal(diagnostics.performance.audioHz, 30);
assert.equal(diagnostics.performance.mediaHz, 4);
assert.equal(diagnostics.performance.framePacing, 'vrr-driver-managed');
assert.equal(diagnostics.performance.requestedFps, 0);
assert.equal(diagnostics.performance.fixedFpsLimit, null);
assert.equal('fpsLimit' in diagnostics.performance, false, 'fixed grid-to-FPS tiers must not leak into diagnostics');
assert.equal(diagnostics.performance.propertyBatchesSent, 2);

const healthyStore = new Map([[
  versionTwoStorageKey,
  JSON.stringify({
    version: 2,
    requestedParameters: { ...runtime.get(null), gridSize: 640 },
    effectiveParameters: { ...runtime.get(null), gridSize: 160 },
    lastKnownSafeGridSize: 160,
    controllerPosition: { x: 2, y: 3 },
    updatedAt: 1
  })
]]);
const healthyHarness = createManualRuntimeHarness(healthyStore);
const healthyHost = createFakeHost();
const receivedGestures = [];
const receivedPlayerIntents = [];
const readySnapshots = [];
const terminalSnapshots = [];
const healthyInstance = healthyHarness.api.create(healthyHost, {
  onReady: (snapshot) => readySnapshots.push(snapshot),
  onTerminalError: (snapshot) => terminalSnapshots.push(snapshot),
  onGesture: (gesture) => receivedGestures.push(gesture),
  onPlayerIntent: (intent) => receivedPlayerIntents.push(intent)
});
healthyHarness.api.activate(healthyInstance);
const healthyFrame = healthyHost.children[0];
const healthyNonce = new URL(healthyFrame.src).searchParams.get('nonce');
const healthyMessage = (type, payload = {}) => ({ channel: 'fe-soundscape:v1', nonce: healthyNonce, type, ...payload });
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('runtime-ready'));
assert.equal(healthyHarness.api.get(healthyInstance).ready, false);
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('frame-heartbeat', {
  timestamp: healthyHarness.context.performance.now(), frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
}));
assert.equal(healthyHarness.api.get(healthyInstance).ready, true);
assert.equal(readySnapshots.length, 1);
for (let index = 0; index < 80; index += 1) {
  healthyHarness.advance(50);
  healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('frame-heartbeat', {
    timestamp: healthyHarness.context.performance.now(), frameTimeMs: 12 + index % 3, width: 1280, height: 800, nonBlack: true
  }));
}
const promotedSnapshot = healthyHarness.api.get(healthyInstance);
assert.equal(promotedSnapshot.requestedParameters.gridSize, 640);
assert.equal(promotedSnapshot.effectiveParameters.gridSize, 640, 'healthy startup must promote to the requested grid');
assert.equal(promotedSnapshot.lastKnownSafeGridSize, 320, 'startup always retains a standard/elevated recovery grid');
assert.equal(promotedSnapshot.startupRecovery.state, 'recovered');
const promotedGrids = healthyFrame.contentWindow.messages
  .filter(({ message }) => message.type === 'properties' && message.properties?.gridSize)
  .map(({ message }) => Number(message.properties.gridSize.value))
  .filter((value, index, values) => index === 0 || value !== values[index - 1]);
assert.deepEqual(promotedGrids, [160, 320, 640], 'recovery must follow catalog progression without jumping');
const promotedStoredState = JSON.parse(healthyStore.get(canonicalStorageKey));
assert.equal(promotedStoredState.requestedParameters.gridSize, 640);
assert.equal(promotedStoredState.effectiveParameters.gridSize, 640);

const delayedHeartbeatStore = new Map([[
  versionTwoStorageKey,
  JSON.stringify({
    version: 2,
    requestedParameters: { ...runtime.get(null), gridSize: 640 },
    effectiveParameters: { ...runtime.get(null), gridSize: 320 },
    lastKnownSafeGridSize: 320,
    controllerPosition: { x: 2, y: 3 },
    updatedAt: 1
  })
]]);
const delayedHeartbeatHarness = createManualRuntimeHarness(delayedHeartbeatStore);
const delayedHeartbeatHost = createFakeHost();
const delayedHeartbeatInstance = delayedHeartbeatHarness.api.create(delayedHeartbeatHost);
delayedHeartbeatHarness.api.activate(delayedHeartbeatInstance);
const delayedHeartbeatFrame = delayedHeartbeatHost.children[0];
const delayedHeartbeatNonce = new URL(delayedHeartbeatFrame.src).searchParams.get('nonce');
const delayedHeartbeatMessage = (type, payload = {}) => ({
  channel: 'fe-soundscape:v1', nonce: delayedHeartbeatNonce, type, ...payload
});
delayedHeartbeatHarness.dispatch(delayedHeartbeatFrame.contentWindow, delayedHeartbeatMessage('runtime-ready'));
delayedHeartbeatHarness.dispatch(delayedHeartbeatFrame.contentWindow, delayedHeartbeatMessage('frame-heartbeat', {
  timestamp: delayedHeartbeatHarness.context.performance.now(), frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
}));
delayedHeartbeatHarness.advance(1000);
assert.equal(
  delayedHeartbeatHarness.api.get(delayedHeartbeatInstance).startupRecovery.state,
  'observing',
  'a high-impact startup must tolerate a healthy one-second heartbeat cadence before rollback'
);
delayedHeartbeatHarness.dispatch(delayedHeartbeatFrame.contentWindow, delayedHeartbeatMessage('frame-heartbeat', {
  timestamp: delayedHeartbeatHarness.context.performance.now(), frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
}));
delayedHeartbeatHarness.advance(500);
assert.equal(
  delayedHeartbeatHarness.api.get(delayedHeartbeatInstance).effectiveParameters.gridSize,
  640,
  'a delayed but healthy startup heartbeat must allow the requested high grid to begin observation'
);

const pointerBase = {
  pointerId: 7, x: 0.4, y: 0.5, button: 0, buttons: 1, isPrimary: true,
  altKey: false, ctrlKey: false, metaKey: false, shiftKey: false
};
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointerdown', ...pointerBase }
}));
assert.equal(receivedGestures.length, 1, 'trusted pointerdown should be delivered immediately');
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointermove', ...pointerBase, x: 0.45 }
}));
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointermove', ...pointerBase, x: 0.52 }
}));
assert.equal(receivedGestures.length, 1, 'pointer moves must wait for one animation frame');
healthyHarness.advance(16);
assert.equal(receivedGestures.length, 2, 'coalesced pointer moves must deliver once per animation frame');
assert.equal(receivedGestures.at(-1).x, 0.52, 'the newest coalesced pointer position must win');
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointermove', ...pointerBase, x: 0.56 }
}));
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointerup', ...pointerBase, x: 0.56, buttons: 0 }
}));
assert.deepEqual(
  receivedGestures.slice(-2).map((gesture) => gesture.kind),
  ['pointermove', 'pointerup'],
  'a terminating event must flush its coalesced move first so host gesture state stays ordered'
);
const orderedGestureCount = receivedGestures.length;
healthyHarness.advance(16);
assert.equal(receivedGestures.length, orderedGestureCount, 'a flushed pointer move must not be delivered twice');
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  gesture: { kind: 'pointermove', ...pointerBase, x: 4 }
}));
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('gesture', {
  command: 'playback.next', gesture: { kind: 'pointerup', ...pointerBase }
}));
healthyHarness.advance(20);
assert.equal(receivedGestures.length, orderedGestureCount, 'out-of-range or command-bearing gestures must be ignored');
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('player-intent', {
  intent: { kind: 'previous' }
}));
assert.equal(receivedPlayerIntents.length, 1);
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('player-intent', {
  intent: { kind: 'seek', ratio: 2 }
}));
healthyHarness.dispatch(healthyFrame.contentWindow, healthyMessage('player-intent', {
  url: 'https://example.invalid/', intent: { kind: 'next' }
}));
assert.equal(receivedPlayerIntents.length, 1, 'invalid ranges and URL-bearing intents must be ignored');
assert.equal(terminalSnapshots.length, 0);

const rollbackStore = new Map([[
  versionTwoStorageKey,
  JSON.stringify({
    version: 2,
    requestedParameters: { ...runtime.get(null), gridSize: 1080 },
    effectiveParameters: { ...runtime.get(null), gridSize: 160 },
    lastKnownSafeGridSize: 160,
    controllerPosition: { x: 2, y: 3 },
    updatedAt: 2
  })
]]);
const rollbackHarness = createManualRuntimeHarness(rollbackStore);
const rollbackHost = createFakeHost();
const rollbackInstance = rollbackHarness.api.create(rollbackHost);
rollbackHarness.api.activate(rollbackInstance);
const rollbackFrame = rollbackHost.children[0];
const rollbackNonce = new URL(rollbackFrame.src).searchParams.get('nonce');
const rollbackMessage = (type, payload = {}) => ({ channel: 'fe-soundscape:v1', nonce: rollbackNonce, type, ...payload });
rollbackHarness.dispatch(rollbackFrame.contentWindow, rollbackMessage('runtime-ready'));
rollbackHarness.dispatch(rollbackFrame.contentWindow, rollbackMessage('frame-heartbeat', {
  timestamp: rollbackHarness.context.performance.now(), frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
}));
for (let index = 0; index < 80 && rollbackHarness.api.get(rollbackInstance).effectiveParameters.gridSize === 160; index += 1) {
  rollbackHarness.advance(25);
  rollbackHarness.dispatch(rollbackFrame.contentWindow, rollbackMessage('frame-heartbeat', {
    timestamp: rollbackHarness.context.performance.now(), frameTimeMs: 16, width: 1280, height: 800, nonBlack: true
  }));
}
assert.equal(rollbackHarness.api.get(rollbackInstance).effectiveParameters.gridSize, 320);
rollbackHarness.dispatch(rollbackFrame.contentWindow, rollbackMessage('context-lost', { reason: 'webgl-context-lost' }));
const rolledBackSnapshot = rollbackHarness.api.get(rollbackInstance);
assert.equal(rolledBackSnapshot.requestedParameters.gridSize, 1080);
assert.equal(rolledBackSnapshot.effectiveParameters.gridSize, 160);
assert.equal(rolledBackSnapshot.startupRecovery.state, 'rolled-back');
assert.match(rolledBackSnapshot.startupRecovery.reason, /context/i);

const timeoutHarness = createManualRuntimeHarness();
const timeoutHost = createFakeHost();
const timeoutTerminal = [];
const timeoutInstance = timeoutHarness.api.create(timeoutHost, {
  onTerminalError: (snapshot) => timeoutTerminal.push(snapshot)
});
timeoutHarness.api.activate(timeoutInstance);
const firstTimeoutFrame = timeoutHost.children[0];
for (let index = 0; index < 100 && timeoutHost.children[0] === firstTimeoutFrame; index += 1) {
  timeoutHarness.advance(250);
}
assert.notEqual(timeoutHost.children[0], firstTimeoutFrame, 'a missing handshake must retry with a fresh iframe');
assert.notEqual(
  new URL(timeoutHost.children[0].src).searchParams.get('nonce'),
  new URL(firstTimeoutFrame.src).searchParams.get('nonce'),
  'the retry must use a new nonce'
);
assert.equal(timeoutHarness.api.get(timeoutInstance).ready, false, 'a timeout must never fake ready');
for (let index = 0; index < 100 && timeoutTerminal.length === 0; index += 1) timeoutHarness.advance(250);
assert.equal(timeoutTerminal.length, 1, 'the second failed attempt must report one terminal error');
const timeoutSnapshot = timeoutHarness.api.get(timeoutInstance);
assert.equal(timeoutSnapshot.ready, false);
assert.equal(timeoutSnapshot.active, false);
assert.equal(timeoutSnapshot.startupRecovery.state, 'terminal-error');
assert.ok(timeoutSnapshot.startupRecovery.reason);

const duplicateFailureHarness = createManualRuntimeHarness();
const duplicateFailureHost = createFakeHost();
const duplicateFailureTerminal = [];
const duplicateFailureInstance = duplicateFailureHarness.api.create(duplicateFailureHost, {
  onTerminalError: (snapshot) => duplicateFailureTerminal.push(snapshot)
});
duplicateFailureHarness.api.activate(duplicateFailureInstance);
const duplicateFailureFrame = duplicateFailureHost.children[0];
const duplicateFailureNonce = new URL(duplicateFailureFrame.src).searchParams.get('nonce');
const duplicateFailureMessage = (type, payload = {}) => ({
  channel: 'fe-soundscape:v1', nonce: duplicateFailureNonce, type, ...payload
});
duplicateFailureHarness.dispatch(
  duplicateFailureFrame.contentWindow,
  duplicateFailureMessage('runtime-error', { message: 'first failure from one attempt' })
);
duplicateFailureHarness.dispatch(
  duplicateFailureFrame.contentWindow,
  duplicateFailureMessage('context-lost', { reason: 'duplicate failure from the same attempt' })
);
duplicateFailureHarness.advance(0);
assert.equal(
  duplicateFailureHost.children.length,
  1,
  'duplicate failures from one iframe must leave exactly one fresh retry mounted'
);
assert.notEqual(
  duplicateFailureHost.children[0],
  duplicateFailureFrame,
  'the first failure must still replace the failed iframe'
);
assert.equal(
  duplicateFailureHarness.api.get(duplicateFailureInstance).lifecycleState,
  'retrying',
  'a stale duplicate callback must not terminate the fresh retry'
);
assert.equal(duplicateFailureTerminal.length, 0, 'one failed attempt must not consume both retry slots');

runtime.deactivate(instance);
assert.equal(host.children.length, 0);
assert.equal(runtime.get(instance).active, false);
assert.equal(runtime.get(instance).mounted, false);
assert.equal(runtime.get(instance).ready, false);
const messageCountAfterDeactivate = activeIframe.contentWindow.messages.length;
assert.equal(runtime.updateAudio(instance, new Uint8Array([255]), { playing: true }), false);
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(activeIframe.contentWindow.messages.length, messageCountAfterDeactivate, 'inactive scenes must not receive audio frames');

const runtimeHtml = fs.readFileSync(path.join(assetRoot, 'runtime.html'), 'utf8');
assert.match(runtimeHtml, /<script\s+src="bridge\.js\?v=20260820-webview-gc-loader-2"><\/script>/);
assert.doesNotMatch(
  runtimeHtml,
  /<script[^>]+src="assets\/index-CSU_B_T9\.js"/,
  'the parser must not schedule a second Workshop bundle before the bridge chooses the WebView-safe boot path'
);
assert.doesNotMatch(runtimeHtml, /type="module"/, 'the opaque sandbox must load the verified IIFE without module CORS');

const bridgeSource = fs.readFileSync(path.join(assetRoot, 'bridge.js'), 'utf8');
const childListeners = new Map();
const childDocumentListeners = new Map();
const parentMessages = [];
const intervalDelays = [];
const childAnimationFrames = new Map();
let childAnimationFrameId = 0;
let childFrameTimestamp = 1000;
let fakeCanvasWidth = 0;
let fakeCanvasHeight = 0;
let fakeCanvasCssWidth = 0;
let fakeCanvasCssHeight = 0;
let fakeCanvasNonBlack = false;
const fakePixels = new Uint8Array(4);
const fakeWebGl = {
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
  get drawingBufferWidth() { return fakeCanvasWidth; },
  get drawingBufferHeight() { return fakeCanvasHeight; },
  drawArrays() {},
  readPixels(_x, _y, _width, _height, _format, _type, output) {
    output.fill(0);
    if (fakeCanvasNonBlack) output[1] = 32;
  }
};
class FakeChildCanvas {
  constructor(context = fakeWebGl) {
    this.width = 0;
    this.height = 0;
    this.context = context;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: fakeCanvasCssWidth, height: fakeCanvasCssHeight };
  }
  getContext(kind) {
    return kind === 'webgl2' || kind === 'webgl' ? this.context : null;
  }
}
const fakeCanvas = new FakeChildCanvas();
let activeFakeCanvas = fakeCanvas;
let sampledBitmap = null;
const fakeSampleContext = {
  clearRect() { sampledBitmap = null; },
  drawImage(bitmap) { sampledBitmap = bitmap; },
  getImageData() {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    if (sampledBitmap?.nonBlack) data[1] = 32;
    return { data };
  }
};
const childDocumentElement = { nodeType: 1, parentElement: null, clientWidth: 1000, clientHeight: 500 };
const flushChildAnimationFrame = (timestamp = childFrameTimestamp) => {
  childFrameTimestamp = timestamp;
  const pending = [...childAnimationFrames.entries()];
  childAnimationFrames.clear();
  pending.forEach(([, callback]) => callback(timestamp));
};
const fakeParent = {
  postMessage(message, targetOrigin) {
    parentMessages.push({ message, targetOrigin });
  }
};
const childContext = {
  console,
  URLSearchParams,
  Object,
  Float32Array,
  location: { search: '?nonce=bridge-nonce' },
  parent: fakeParent,
  innerWidth: 1000,
  innerHeight: 500,
  performance: { now: () => childFrameTimestamp },
  HTMLCanvasElement: FakeChildCanvas,
  createImageBitmap: async () => ({ nonBlack: fakeCanvasNonBlack, close() {} }),
  setInterval(_callback, delay) {
    intervalDelays.push(delay);
    return intervalDelays.length;
  },
  setTimeout() { return 1; },
  clearTimeout() {},
  requestAnimationFrame(callback) {
    const id = ++childAnimationFrameId;
    childAnimationFrames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) { childAnimationFrames.delete(id); },
  getComputedStyle(element) {
    return element?.computedStyle || { position: 'static', borderRadius: '0px' };
  },
  document: {
    documentElement: childDocumentElement,
    querySelector(selector) {
      if (selector === 'canvas') {
        activeFakeCanvas.width = fakeCanvasWidth;
        activeFakeCanvas.height = fakeCanvasHeight;
        return activeFakeCanvas;
      }
      return null;
    },
    createElement(tagName) {
      if (String(tagName).toLowerCase() !== 'canvas') throw new Error(`unexpected child element ${tagName}`);
      return { width: 0, height: 0, getContext: () => fakeSampleContext };
    },
    addEventListener(type, listener) {
      if (!childDocumentListeners.has(type)) childDocumentListeners.set(type, new Set());
      childDocumentListeners.get(type).add(listener);
    }
  },
  addEventListener(type, listener) {
    if (!childListeners.has(type)) childListeners.set(type, new Set());
    childListeners.get(type).add(listener);
  }
};
childContext.window = childContext;
const nativeChildSetInterval = childContext.setInterval;
vm.createContext(childContext);
vm.runInContext(bridgeSource, childContext, { filename: 'soundscape-workshop/bridge.js' });
childContext.setInterval(() => {}, 1);
assert.equal(intervalDelays.at(-1), 1, 'the bridge must not monkey-patch native setInterval timing');
assert.equal(childContext.setInterval, nativeChildSetInterval, 'the native interval function must remain installed');
assert.doesNotMatch(bridgeSource, /intervalFloorMs\s*:\s*(?:16|8|6\.94)/, 'the bridge must not report a fixed visual cap');

let appliedPropertyBatch = null;
childContext.wallpaperPropertyListener = {
  applyUserProperties(properties) { appliedPropertyBatch = properties; },
  applyGeneralProperties() {}
};
for (const listener of childListeners.get('message') || []) {
  listener({ source: {}, data: { channel: 'fe-soundscape:v1', nonce: 'bridge-nonce', type: 'properties', properties: { theme: { value: 'ember-fire' } } } });
  listener({ source: fakeParent, data: { channel: 'fe-soundscape:v1', nonce: 'wrong', type: 'properties', properties: { theme: { value: 'ember-fire' } } } });
}
assert.equal(appliedPropertyBatch, null, 'forged child messages must be ignored');
for (const listener of childListeners.get('message') || []) {
  listener({ source: fakeParent, data: { channel: 'fe-soundscape:v1', nonce: 'bridge-nonce', type: 'properties', properties: { theme: { value: 'ember-fire' } } } });
}
assert.equal(appliedPropertyBatch.theme.value, 'ember-fire');

let bridgedAudio = null;
childContext.wallpaperRegisterAudioListener((values) => { bridgedAudio = values; });
for (const listener of childListeners.get('message') || []) {
  listener({ source: fakeParent, data: { channel: 'fe-soundscape:v1', nonce: 'bridge-nonce', type: 'audio-frame', values: new Float32Array([0.2, 0.8]) } });
}
assert.deepEqual(Array.from(bridgedAudio), Array.from(new Float32Array([0.2, 0.8])));
childContext.wallpaperReady();
assert.equal(parentMessages.at(-1).message.type, 'runtime-ready');
assert.equal(parentMessages.at(-1).message.nonce, 'bridge-nonce');

flushChildAnimationFrame(1000);
assert.equal(
  parentMessages.some(({ message }) => message.type === 'frame-heartbeat' && message.nonBlack === true),
  false,
  'a zero-sized canvas must not be promoted to a fake 1x1 healthy frame'
);
fakeCanvasWidth = 1280;
fakeCanvasHeight = 800;
fakeCanvasCssWidth = 1280;
fakeCanvasCssHeight = 800;
flushChildAnimationFrame(1510);
assert.equal(
  parentMessages.at(-1).message.type,
  'frame-heartbeat',
  'a sized canvas should emit a truthful health heartbeat'
);
assert.equal(parentMessages.at(-1).message.nonBlack, false, 'a black framebuffer must not satisfy first-frame readiness');
fakeCanvas.getContext('webgl2').drawArrays(4, 0, 3);
flushChildAnimationFrame(2020);
flushChildAnimationFrame(2530);
assert.equal(parentMessages.at(-1).message.nonBlack, true, 'an observed WebGL draw should satisfy first-render readiness');
for (const listener of childListeners.get('message') || []) {
  listener({
    source: fakeParent,
    data: {
      channel: 'fe-soundscape:v1', nonce: 'bridge-nonce', type: 'properties',
      properties: { gridSize: { value: 640 } }
    }
  });
}
assert.equal(
  childContext.__feSoundscapeBridgeDiagnostics().renderedFrameProven,
  false,
  'a grid change must invalidate the previous grid generation draw proof before forwarding the property'
);
flushChildAnimationFrame(3040);
assert.equal(parentMessages.at(-1).message.nonBlack, false, 'the previous safe-grid frame must not prove the new grid healthy');
fakeCanvas.getContext('webgl2').drawArrays(4, 0, 3);
flushChildAnimationFrame(3550);
assert.equal(parentMessages.at(-1).message.nonBlack, true, 'a draw from the new grid generation must restore readiness');
fakeCanvasWidth = 1920;
fakeCanvasHeight = 1080;
fakeCanvasCssWidth = 1920;
fakeCanvasCssHeight = 1080;
childContext.innerWidth = 1920;
childContext.innerHeight = 1080;
childDocumentElement.clientWidth = 1920;
childDocumentElement.clientHeight = 1080;
flushChildAnimationFrame(4060);
assert.equal(parentMessages.at(-1).message.nonBlack, false, 'a backing-size change must invalidate the old canvas draw proof');
fakeCanvas.getContext('webgl2').drawArrays(4, 0, 3);
flushChildAnimationFrame(4570);
assert.equal(parentMessages.at(-1).message.nonBlack, true, 'the resized canvas must produce a fresh draw before readiness returns');
const replacementWebGl = {
  drawArrays() {},
  drawElements() {}
};
const replacementCanvas = new FakeChildCanvas(replacementWebGl);
activeFakeCanvas = replacementCanvas;
replacementCanvas.getContext('webgl2');
assert.equal(
  childContext.__feSoundscapeBridgeDiagnostics().renderedFrameProven,
  false,
  'a different same-size canvas/context must invalidate the previous context proof'
);
flushChildAnimationFrame(5080);
assert.equal(parentMessages.at(-1).message.nonBlack, false, 'a replacement context without a draw must stay unready');
replacementWebGl.drawArrays(4, 0, 3);
flushChildAnimationFrame(5590);
assert.equal(parentMessages.at(-1).message.nonBlack, true, 'the active replacement context can prove its own first draw');
const unavailableCanvas = new FakeChildCanvas(null);
activeFakeCanvas = unavailableCanvas;
unavailableCanvas.getContext('webgl2');
assert.equal(
  childContext.__feSoundscapeBridgeDiagnostics().renderedFrameProven,
  false,
  'a same-size replacement canvas whose WebGL context cannot be created must fail closed'
);
flushChildAnimationFrame(6100);
assert.equal(parentMessages.at(-1).message.nonBlack, false);
activeFakeCanvas = replacementCanvas;
replacementCanvas.getContext('webgl2');
replacementWebGl.drawArrays(4, 0, 3);
flushChildAnimationFrame(6610);
assert.equal(parentMessages.at(-1).message.nonBlack, true);
for (const listener of childDocumentListeners.get('webglcontextlost') || []) {
  listener({ target: replacementCanvas, preventDefault() {} });
}
assert.equal(childContext.__feSoundscapeBridgeDiagnostics().renderedFrameProven, false);
replacementWebGl.drawArrays(4, 0, 3);
assert.equal(
  childContext.__feSoundscapeBridgeDiagnostics().renderedFrameProven,
  false,
  'draw calls from a lost context must never revive readiness'
);

function childElement({ parentElement = childDocumentElement, className = '', rect = null, role = '', label = '', style = null } = {}) {
  return {
    nodeType: 1,
    parentElement,
    className,
    childElementCount: 1,
    computedStyle: style || { position: 'static', borderRadius: '0px' },
    getBoundingClientRect() { return rect; },
    getAttribute(name) {
      if (name === 'role') return role;
      if (name === 'aria-label') return label;
      return '';
    },
    querySelector() { return {}; },
    closest() { return null; }
  };
}
const ordinaryTarget = childElement();
const playerRoot = childElement({
  className: 'select-none z-50 absolute',
  rect: { left: 500, top: 350, width: 320, height: 100 },
  style: { position: 'absolute', borderRadius: '20px' }
});
const playerTarget = childElement({ parentElement: playerRoot });
const dispatchChildPointer = (type, target, overrides = {}) => {
  const event = {
    target,
    pointerId: 17,
    clientX: 100,
    clientY: 120,
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    isPrimary: true,
    preventDefault() {},
    ...overrides
  };
  for (const listener of childDocumentListeners.get(type) || []) listener(event);
};
const gestureStart = parentMessages.length;
dispatchChildPointer('pointerdown', ordinaryTarget);
dispatchChildPointer('pointermove', playerTarget, { clientX: 160 });
dispatchChildPointer('pointerup', playerTarget, { clientX: 160 });
assert.deepEqual(
  parentMessages.slice(gestureStart)
    .filter(({ message }) => message.type === 'gesture')
    .map(({ message }) => message.gesture.kind),
  ['pointerdown', 'pointermove', 'pointerup'],
  'a gesture mode chosen on pointerdown must survive crossing into the player until pointerup'
);

console.log('soundscape Workshop assets, isolated lifecycle, batching, persistence, and performance guards are valid');
