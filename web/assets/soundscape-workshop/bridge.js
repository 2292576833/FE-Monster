(function attachSoundscapeWorkshopBridge(global) {
  'use strict';

  const CHANNEL = 'fe-soundscape:v1';
  const BUNDLE_SCRIPT_URL = 'assets/index-CSU_B_T9.js';
  const nonce = new URLSearchParams(global.location.search).get('nonce') || '';
  const nativeSetInterval = global.setInterval;
  const nativeRequestAnimationFrame = typeof global.requestAnimationFrame === 'function'
    ? global.requestAnimationFrame.bind(global)
    : null;
  let audioListener = null;
  let lastAudioFrame = null;
  let pendingProperties = {};
  let pendingGeneralProperties = {};
  let ready = false;
  let audioFramesReceived = 0;
  let propertyBatchesReceived = 0;
  let bundleBooted = false;
  let healthFrame = null;
  let healthFrameCount = 0;
  let lastFrameAt = 0;
  let lastHeartbeatAt = -Infinity;
  let lastHeartbeat = null;
  let firstRenderedFrameProven = false;
  let renderObservationGeneration = 1;
  let renderedObservationGeneration = 0;
  let lastCanvasSignature = '';
  let activeRenderCanvas = null;
  let activeRenderContext = null;
  const renderProbeContexts = new WeakSet();
  const lostRenderContexts = new WeakSet();
  let renderProbeInstalled = false;
  let renderProbeContextsObserved = 0;
  let pendingGestureMove = null;
  let gestureFrame = null;
  let playerHold = null;
  let lastPlayerWheelAt = -Infinity;
  const pointerModes = new Map();
  const MAX_TRACKED_POINTERS = 16;

  // Some WebView2 runtimes expose a non-configurable global `gc` (e.g. the
  // V8 --expose-gc helper). The verified Workshop bundle declares a top-level
  // `class gc`, which is a SyntaxError when a non-configurable global property
  // with that name already exists, so the bundle never boots and the scene
  // stays black. Detect that case and fall back to evaluating the unchanged
  // bundle source inside a function scope, where its top-level declarations
  // cannot collide with the global lexical environment.
  function globalGcConflict() {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(global, 'gc');
      return !!descriptor && descriptor.configurable === false;
    } catch (_error) { return false; }
  }
  // A direct `eval` inside a Function-created (sloppy) runner keeps every
  // top-level declaration of the bundle (`var`, `function`, `let`, `const`,
  // `class`, including `class gc`) inside the runner's function scope, so it
  // cannot collide with the non-configurable global `gc`. `this` stays bound
  // to the window, matching classic-script top-level behavior.
  let evalFallbackAvailable = false;
  try {
    evalFallbackAvailable = typeof new Function('return 1') === 'function';
  } catch (_error) { evalFallbackAvailable = false; }
  let bundleFallbackActive = false;
  let bundleLoadStarted = false;
  function bootBundleSource(source) {
    if (bundleBooted) return;
    bundleBooted = true;
    try {
      const runner = new Function('source', 'eval(source);');
      runner.call(global, source);
    } catch (_error) {
      send('runtime-error', { message: String(_error?.message || _error || 'bundle boot failed').slice(0, 1000) });
    }
  }

  function bootClassicBundle() {
    if (bundleLoadStarted || bundleBooted) return;
    bundleLoadStarted = true;
    const document = global.document;
    if (!document?.createElement || !document?.head?.appendChild) {
      send('runtime-error', { message: 'Workshop bundle host is unavailable' });
      return;
    }
    const script = document.createElement('script');
    script.src = BUNDLE_SCRIPT_URL;
    script.async = false;
    script.addEventListener?.('load', () => { bundleBooted = true; }, { once: true });
    script.addEventListener?.('error', () => {
      send('runtime-error', { message: 'Workshop bundle failed to load' });
    }, { once: true });
    document.head.appendChild(script);
  }

  global.__mediaState = {
    title: '', artist: '', thumbnail: '', primaryColor: '', textColor: '',
    isPlaying: false, position: 0, duration: 0, _callbacks: []
  };
  global.__notifyMediaChange = function notifyMediaChange() {
    const state = global.__mediaState;
    const snapshot = {
      title: state.title, artist: state.artist, thumbnail: state.thumbnail,
      primaryColor: state.primaryColor, textColor: state.textColor,
      isPlaying: state.isPlaying, position: state.position, duration: state.duration
    };
    state._callbacks.slice().forEach((callback) => {
      try { callback(snapshot); } catch (_error) { /* Isolate media consumers. */ }
    });
  };
  global.wallpaperMediaIntegration = Object.freeze({ PLAYBACK_PLAYING: 0, PLAYBACK_PAUSED: 1, PLAYBACK_STOPPED: 2 });

  global.wallpaperRegisterAudioListener = function registerAudioListener(callback) {
    audioListener = typeof callback === 'function' ? callback : null;
    if (audioListener && lastAudioFrame) audioListener(lastAudioFrame);
  };
  global.wallpaperRegisterMediaPropertiesListener = function registerMediaPropertiesListener(callback) {
    if (typeof callback === 'function') global.__mediaState._callbacks.push((media) => callback({ title: media.title, artist: media.artist }));
  };
  global.wallpaperRegisterMediaThumbnailListener = function registerMediaThumbnailListener(callback) {
    if (typeof callback === 'function') global.__mediaState._callbacks.push((media) => callback({
      thumbnail: media.thumbnail, primaryColor: media.primaryColor, textColor: media.textColor
    }));
  };
  global.wallpaperRegisterMediaPlaybackListener = function registerMediaPlaybackListener(callback) {
    if (typeof callback === 'function') global.__mediaState._callbacks.push((media) => callback({
      state: media.isPlaying ? global.wallpaperMediaIntegration.PLAYBACK_PLAYING : global.wallpaperMediaIntegration.PLAYBACK_PAUSED
    }));
  };
  global.wallpaperRegisterMediaTimelineListener = function registerMediaTimelineListener(callback) {
    if (typeof callback === 'function') global.__mediaState._callbacks.push((media) => callback({ position: media.position, duration: media.duration }));
  };

  function send(type, payload) {
    if (!nonce || global.parent === global) return;
    global.parent.postMessage(Object.assign({ channel: CHANNEL, nonce, type }, payload || {}), '*');
  }

  function clockNow() {
    const value = typeof global.performance?.now === 'function' ? global.performance.now() : Date.now();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  function wrapFirstRenderMethods(context, canvas) {
    if (!context || renderProbeContexts.has(context)) return;
    let wrappedMethodCount = 0;
    ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'].forEach((name) => {
      const nativeMethod = context[name];
      if (typeof nativeMethod !== 'function') return;
      const wrapped = function firstRenderedDraw(...args) {
        const result = nativeMethod.apply(context, args);
        if (
          context === activeRenderContext
          && canvas === activeRenderCanvas
          && !lostRenderContexts.has(context)
          && renderedObservationGeneration !== renderObservationGeneration
        ) {
          renderedObservationGeneration = renderObservationGeneration;
          firstRenderedFrameProven = true;
        }
        return result;
      };
      try {
        Object.defineProperty(context, name, { configurable: true, writable: true, value: wrapped });
        if (context[name] === wrapped) wrappedMethodCount += 1;
      } catch (_error) { /* Some hardened WebViews expose non-extensible contexts. */ }
    });
    if (wrappedMethodCount > 0) {
      renderProbeContexts.add(context);
      renderProbeContextsObserved += 1;
    }
  }
  function activateRenderContext(canvas, context) {
    if (!canvas) return;
    const canvasChanged = activeRenderCanvas !== canvas;
    if (canvasChanged) {
      activeRenderCanvas = canvas;
      activeRenderContext = null;
      invalidateFirstRenderProof();
    }
    if (!context) return;
    if (activeRenderContext !== context) {
      activeRenderContext = context;
      if (!canvasChanged) invalidateFirstRenderProof();
    }
    wrapFirstRenderMethods(context, canvas);
  }
  function invalidateFirstRenderProof() {
    if (renderObservationGeneration >= Number.MAX_SAFE_INTEGER) {
      renderObservationGeneration = 1;
      renderedObservationGeneration = 0;
    } else renderObservationGeneration += 1;
    firstRenderedFrameProven = false;
  }
  function installFirstRenderProbe() {
    const prototype = global.HTMLCanvasElement?.prototype;
    const nativeGetContext = prototype?.getContext;
    if (typeof nativeGetContext !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getContext');
    const wrapped = function observedGetContext(...args) {
      const context = nativeGetContext.apply(this, args);
      const kind = String(args[0] || '').toLowerCase();
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
        activateRenderContext(this, context);
      }
      return context;
    };
    try {
      Object.defineProperty(prototype, 'getContext', {
        ...(descriptor || {}), configurable: true, writable: true, value: wrapped
      });
      renderProbeInstalled = prototype.getContext === wrapped;
    } catch (_error) { /* Fail closed: no observed draw means no trusted first frame. */ }
  }
  function observeCanvasDraws(canvas) {
    if (!canvas?.getContext) return;
    try {
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      activateRenderContext(canvas, context);
    } catch (_error) { /* Fail closed until a later heartbeat can observe the context. */ }
  }
  function currentCanvasSize() {
    const canvas = global.document?.querySelector?.('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect?.();
    const width = Math.round(Number(canvas.width));
    const height = Math.round(Number(canvas.height));
    const cssWidth = Number(rect?.width);
    const cssHeight = Number(rect?.height);
    const viewportWidth = Number(global.innerWidth) || Number(global.document?.documentElement?.clientWidth) || 0;
    const viewportHeight = Number(global.innerHeight) || Number(global.document?.documentElement?.clientHeight) || 0;
    if (
      !Number.isFinite(width) || !Number.isFinite(height)
      || !Number.isFinite(cssWidth) || !Number.isFinite(cssHeight)
      || width <= 0 || height <= 0 || cssWidth <= 0 || cssHeight <= 0
      || width / cssWidth < 0.5 || height / cssHeight < 0.5
      || width / cssWidth > 4 || height / cssHeight > 4
      || (viewportWidth > 0 && cssWidth < viewportWidth * 0.5)
      || (viewportHeight > 0 && cssHeight < viewportHeight * 0.5)
    ) return null;
    return { canvas, width, height, cssWidth, cssHeight };
  }
  function healthTick(timestamp) {
    healthFrame = null;
    if (!ready || !nativeRequestAnimationFrame) return;
    const frameAt = Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : clockNow();
    const frameTimeMs = lastFrameAt > 0 ? Math.min(1000, Math.max(0, frameAt - lastFrameAt)) : 0;
    lastFrameAt = frameAt;
    healthFrameCount += 1;
    const canvas = currentCanvasSize();
    if (canvas && (lastHeartbeat === null || frameAt - lastHeartbeatAt >= 500)) {
      const canvasSignature = `${canvas.width}x${canvas.height}:${Math.round(canvas.cssWidth)}x${Math.round(canvas.cssHeight)}`;
      if (lastCanvasSignature && canvasSignature !== lastCanvasSignature) invalidateFirstRenderProof();
      lastCanvasSignature = canvasSignature;
      observeCanvasDraws(canvas.canvas);
      lastHeartbeatAt = frameAt;
      lastHeartbeat = {
        timestamp: frameAt,
        frameTimeMs,
        width: canvas.width,
        height: canvas.height,
        frameCount: healthFrameCount,
        // Probe only during startup, a backing-size change, or a grid change.
        // Once a rendered pixel is proven, the steady-state rAF path performs
        // no GPU readback and remains paced by the compositor/VRR driver.
        nonBlack: firstRenderedFrameProven,
        renderedFrame: firstRenderedFrameProven
      };
      send('frame-heartbeat', lastHeartbeat);
    }
    healthFrame = nativeRequestAnimationFrame(healthTick);
  }
  function startHealthLoop() {
    if (!nativeRequestAnimationFrame || healthFrame !== null) return;
    lastFrameAt = 0;
    lastHeartbeatAt = -Infinity;
    healthFrame = nativeRequestAnimationFrame(healthTick);
  }

  function elementFromTarget(target) {
    return target && target.nodeType === 1 ? target : target?.parentElement || null;
  }
  function classText(element) {
    const value = element?.className;
    return typeof value === 'string' ? value.toLowerCase() : String(value?.baseVal || '').toLowerCase();
  }
  function elementRect(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return null;
    const width = Number(rect.width);
    const height = Number(rect.height);
    return Number.isFinite(width) && Number.isFinite(height) ? rect : null;
  }
  function isPlayerRoot(element) {
    const rect = elementRect(element);
    if (!rect || rect.width < 180 || rect.width > 620 || rect.height < 40 || rect.height > 320) return false;
    const classes = classText(element);
    const role = String(element.getAttribute?.('role') || '').toLowerCase();
    const label = String(element.getAttribute?.('aria-label') || '').toLowerCase();
    const marked = classes.includes('select-none')
      && (classes.includes('z-50') || classes.includes('absolute'));
    const semantic = /player|media|controller/.test(`${role} ${label} ${classes}`);
    if (!marked && !semantic) return false;
    const style = global.getComputedStyle?.(element);
    const positioned = !style || style.position === 'absolute' || style.position === 'fixed';
    // The original player deliberately renders an empty cover placeholder when
    // the current track has no artwork. Requiring img/svg made the exact same
    // player stop being a player in that state, so none of its host-owned
    // controls could be reached. The z-50/select-none/absolute geometry is the
    // stable Workshop contract; semantic descendants remain useful for less
    // distinctive future variants.
    const hasMediaSemantics = !!element.querySelector?.(
      'img, [role="progressbar"], [role="slider"], svg, [class*="progress"], [class*="timeline"]'
    );
    return positioned && (semantic ? hasMediaSemantics || element.childElementCount > 0 : marked);
  }
  function findPlayerRoot(target) {
    let element = elementFromTarget(target);
    let candidate = null;
    while (element && element !== global.document?.documentElement) {
      if (isPlayerRoot(element)) candidate = element;
      element = element.parentElement;
    }
    return candidate;
  }
  function isInteractivePlayerTarget(target) {
    const element = elementFromTarget(target);
    return !!element?.closest?.('button,input,select,textarea,a,[role="button"],[role="slider"]');
  }
  function findProgressRegion(target, playerRoot) {
    let element = elementFromTarget(target);
    let candidate = null;
    while (element && element !== playerRoot?.parentElement) {
      const role = String(element.getAttribute?.('role') || '').toLowerCase();
      const rect = elementRect(element);
      const style = global.getComputedStyle?.(element);
      const classes = classText(element);
      const semantic = role === 'slider' || role === 'progressbar' || /progress|timeline|seek/.test(classes);
      const barLike = rect && rect.width >= 40 && rect.height > 0 && rect.height <= 18
        && (String(style?.borderRadius || '').includes('999') || classes.includes('rounded-full'));
      if (semantic || barLike) {
        if (!candidate || Number(rect?.width || 0) > Number(elementRect(candidate)?.width || 0)) candidate = element;
      }
      if (element === playerRoot) break;
      element = element.parentElement;
    }
    return candidate;
  }
  function normalizedPoint(event) {
    const width = Math.max(1, Number(global.innerWidth) || Number(global.document?.documentElement?.clientWidth) || 1);
    const height = Math.max(1, Number(global.innerHeight) || Number(global.document?.documentElement?.clientHeight) || 1);
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return {
      x: Math.min(1, Math.max(0, clientX / width)),
      y: Math.min(1, Math.max(0, clientY / height))
    };
  }
  function gesturePayload(kind, event) {
    const point = normalizedPoint(event);
    if (!point) return null;
    const pointerId = Number(event?.pointerId ?? 0);
    const button = Number(event?.button ?? 0);
    const buttons = Number(event?.buttons ?? 0);
    if (!Number.isFinite(pointerId) || !Number.isFinite(button) || !Number.isFinite(buttons)) return null;
    const payload = {
      kind,
      pointerId: Math.max(0, Math.min(0x7fffffff, Math.floor(pointerId))),
      x: point.x,
      y: point.y,
      button: Math.max(-1, Math.min(5, Math.floor(button))),
      buttons: Math.max(0, Math.min(31, Math.floor(buttons))),
      isPrimary: event?.isPrimary !== false,
      altKey: event?.altKey === true,
      ctrlKey: event?.ctrlKey === true,
      metaKey: event?.metaKey === true,
      shiftKey: event?.shiftKey === true
    };
    if (kind === 'wheel') {
      for (const key of ['deltaX', 'deltaY', 'deltaZ']) {
        const value = Number(event?.[key] || 0);
        if (!Number.isFinite(value)) return null;
        payload[key] = Math.max(-10000, Math.min(10000, value));
      }
    }
    return payload;
  }
  function sendGesture(kind, event) {
    const gesture = gesturePayload(kind, event);
    if (!gesture) return;
    if (kind !== 'pointermove' || !nativeRequestAnimationFrame) {
      send('gesture', { gesture });
      return;
    }
    pendingGestureMove = gesture;
    if (gestureFrame !== null) return;
    gestureFrame = nativeRequestAnimationFrame(() => {
      gestureFrame = null;
      const latest = pendingGestureMove;
      pendingGestureMove = null;
      if (latest) send('gesture', { gesture: latest });
    });
  }
  function flushPendingGestureMove(pointerId = null) {
    const latest = pendingGestureMove;
    if (!latest || (pointerId !== null && latest.pointerId !== pointerId)) return;
    if (gestureFrame !== null) global.cancelAnimationFrame?.(gestureFrame);
    gestureFrame = null;
    pendingGestureMove = null;
    send('gesture', { gesture: latest });
  }
  function seekFromEvent(event, region) {
    const rect = elementRect(region);
    const clientX = Number(event?.clientX);
    if (!rect || !Number.isFinite(clientX) || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    send('player-intent', { intent: { kind: 'seek', ratio } });
  }
  function clearPlayerHold(pointerId = null) {
    if (!playerHold || (pointerId !== null && playerHold.pointerId !== pointerId)) return;
    if (playerHold.timer !== null) global.clearTimeout?.(playerHold.timer);
    playerHold = null;
  }
  function pointerIdFromEvent(event) {
    return Math.max(0, Math.min(0x7fffffff, Math.floor(Number(event?.pointerId) || 0)));
  }
  function rememberPointerMode(pointerId, mode) {
    if (!pointerModes.has(pointerId) && pointerModes.size >= MAX_TRACKED_POINTERS) return false;
    pointerModes.set(pointerId, mode);
    return true;
  }
  function clearPointerState() {
    pointerModes.clear();
    clearPlayerHold();
    pendingGestureMove = null;
    if (gestureFrame !== null) global.cancelAnimationFrame?.(gestureFrame);
    gestureFrame = null;
  }
  function onPointerDown(event) {
    const pointerId = pointerIdFromEvent(event);
    const playerRoot = findPlayerRoot(event.target);
    if (!playerRoot) {
      if (rememberPointerMode(pointerId, 'gesture')) sendGesture('pointerdown', event);
      return;
    }
    const progress = findProgressRegion(event.target, playerRoot);
    if (progress) {
      rememberPointerMode(pointerId, 'player');
      seekFromEvent(event, progress);
      return;
    }
    if (isInteractivePlayerTarget(event.target) || Number(event.button) !== 0) {
      rememberPointerMode(pointerId, 'ignored');
      return;
    }
    if (!rememberPointerMode(pointerId, 'player')) return;
    const point = normalizedPoint(event);
    if (!point) return;
    clearPlayerHold();
    const hold = {
      pointerId,
      originX: Number(event.clientX) || 0,
      originY: Number(event.clientY) || 0,
      latest: point,
      dragging: false,
      timer: null
    };
    hold.timer = global.setTimeout?.(() => {
      if (playerHold !== hold) return;
      hold.dragging = true;
      hold.timer = null;
      send('player-intent', { intent: { kind: 'controller-drag', x: hold.latest.x, y: hold.latest.y } });
    }, 360) ?? null;
    playerHold = hold;
  }
  function onPointerMove(event) {
    const pointerId = pointerIdFromEvent(event);
    const mode = pointerModes.get(pointerId);
    if (mode === 'gesture') {
      sendGesture('pointermove', event);
      return;
    }
    if (mode !== 'player' || !playerHold || playerHold.pointerId !== pointerId) {
      return;
    }
    const point = normalizedPoint(event);
    if (!point) return;
    playerHold.latest = point;
    if (!playerHold.dragging) {
      const distance = Math.hypot(
        (Number(event.clientX) || 0) - playerHold.originX,
        (Number(event.clientY) || 0) - playerHold.originY
      );
      if (distance > 12) clearPlayerHold(pointerId);
      return;
    }
    send('player-intent', { intent: { kind: 'controller-drag', x: point.x, y: point.y } });
    event.preventDefault?.();
  }
  function onPointerEnd(event, kind) {
    const pointerId = pointerIdFromEvent(event);
    const mode = pointerModes.get(pointerId);
    pointerModes.delete(pointerId);
    if (playerHold?.pointerId === pointerId) {
      clearPlayerHold(pointerId);
      return;
    }
    if (mode === 'gesture') {
      // A coalesced move must cross the bridge before its terminating event.
      // Otherwise a quick down/move/up is observed by the parent as down/up/move
      // and the existing lyric transform state machine correctly ignores it.
      flushPendingGestureMove(pointerId);
      sendGesture(kind, event);
    }
  }
  function onDoubleClick(event) {
    if (!findPlayerRoot(event.target)) sendGesture('dblclick', event);
  }
  function onWheel(event) {
    const playerRoot = findPlayerRoot(event.target);
    if (!playerRoot) {
      sendGesture('wheel', event);
      return;
    }
    const deltaY = Number(event.deltaY);
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    event.preventDefault?.();
    const current = clockNow();
    if (current - lastPlayerWheelAt < 420) return;
    lastPlayerWheelAt = current;
    send('player-intent', { intent: { kind: deltaY < 0 ? 'previous' : 'next' } });
  }
  function installInputBridge() {
    const document = global.document;
    if (!document?.addEventListener) return;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', (event) => onPointerEnd(event, 'pointerup'), true);
    document.addEventListener('pointercancel', (event) => onPointerEnd(event, 'pointercancel'), true);
    document.addEventListener('dblclick', onDoubleClick, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    document.addEventListener('webglcontextlost', (event) => {
      event.preventDefault?.();
      clearPointerState();
      if (event.target === activeRenderCanvas && activeRenderContext) {
        lostRenderContexts.add(activeRenderContext);
      }
      invalidateFirstRenderProof();
      lastCanvasSignature = '';
      send('context-lost', { reason: 'webgl-context-lost' });
    }, true);
    document.addEventListener('webglcontextrestored', (event) => {
      if (event.target !== activeRenderCanvas || !activeRenderContext) return;
      lostRenderContexts.delete(activeRenderContext);
      invalidateFirstRenderProof();
      observeCanvasDraws(activeRenderCanvas);
    }, true);
  }
  function applyProperties(properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return;
    const safe = Object.fromEntries(Object.entries(properties).slice(0, 64));
    if (Object.prototype.hasOwnProperty.call(safe, 'gridSize')) {
      invalidateFirstRenderProof();
      const canvas = currentCanvasSize();
      if (canvas) observeCanvasDraws(canvas.canvas);
    }
    if (typeof global.wallpaperPropertyListener?.applyUserProperties === 'function') {
      global.wallpaperPropertyListener.applyUserProperties(safe);
      propertyBatchesReceived += 1;
    } else Object.assign(pendingProperties, safe);
  }
  function applyGeneralProperties(properties) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return;
    const safe = Object.fromEntries(Object.entries(properties).slice(0, 16));
    if (typeof global.wallpaperPropertyListener?.applyGeneralProperties === 'function') {
      global.wallpaperPropertyListener.applyGeneralProperties(safe);
    } else Object.assign(pendingGeneralProperties, safe);
  }
  function applyMedia(media) {
    if (!media || typeof media !== 'object' || Array.isArray(media)) return;
    const state = global.__mediaState;
    state.title = String(media.title || '').slice(0, 512);
    state.artist = String(media.artist || '').slice(0, 512);
    state.thumbnail = String(media.thumbnail || '').slice(0, 2_000_000);
    state.primaryColor = String(media.primaryColor || '').slice(0, 64);
    state.textColor = String(media.textColor || '').slice(0, 64);
    state.isPlaying = media.isPlaying === true;
    state.position = Math.max(0, Number(media.position) || 0);
    state.duration = Math.max(0, Number(media.duration) || 0);
    global.__notifyMediaChange();
  }

  global.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== global.parent) return;
    if (!message || message.channel !== CHANNEL || message.nonce !== nonce) return;
    if (message.type === 'properties') applyProperties(message.properties);
    else if (message.type === 'general-properties') applyGeneralProperties(message.properties);
    else if (message.type === 'audio-frame') {
      const values = message.values;
      if (!values || typeof values.length !== 'number' || values.length > 512) return;
      lastAudioFrame = values;
      audioFramesReceived += 1;
      if (audioListener) audioListener(values);
    } else if (message.type === 'media-state') applyMedia(message.media);
    else if (message.type === 'bundle-source') {
      if (globalGcConflict() && typeof message.source === 'string' && message.source.length > 0) {
        bootBundleSource(message.source);
      }
    }
  });

  installFirstRenderProbe();
  installInputBridge();

  global.wallpaperReady = function wallpaperReady() {
    if (ready) return;
    ready = true;
    applyProperties(pendingProperties);
    pendingProperties = {};
    applyGeneralProperties(pendingGeneralProperties);
    pendingGeneralProperties = {};
    send('runtime-ready');
    startHealthLoop();
  };
  global.addEventListener('error', (event) => {
    send('runtime-error', { message: String(event?.message || 'Workshop runtime error').slice(0, 1000) });
  });
  global.addEventListener('unhandledrejection', (event) => {
    send('runtime-error', { message: String(event?.reason?.message || event?.reason || 'Workshop runtime rejection').slice(0, 1000) });
  });
  global.__feSoundscapeBridgeDiagnostics = function bridgeDiagnostics() {
    const canvas = currentCanvasSize();
    return {
      ready,
      audioFramesReceived,
      propertyBatchesReceived,
      bundleFallbackActive,
      bundleBooted,
      nativeIntervalPreserved: global.setInterval === nativeSetInterval,
      framePacing: 'vrr-driver-managed',
      requestedFps: 0,
      fixedFpsLimit: null,
      frameCount: healthFrameCount,
      renderedFrameProven: firstRenderedFrameProven,
      renderProbeInstalled,
      renderProbeContextsObserved,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0
    };
  };

  // Choose exactly one bundle boot path. FE Monster's real WebView2 renderer
  // runs with --expose-gc, so a parser-owned classic script would throw before
  // the fallback can act. The bridge owns loading and never schedules both.
  if (globalGcConflict()) {
    if (evalFallbackAvailable) {
      bundleFallbackActive = true;
      send('bundle-request', {});
    } else {
      send('runtime-error', { message: 'Workshop bundle fallback is unavailable' });
    }
  } else {
    bootClassicBundle();
  }
})(window);
