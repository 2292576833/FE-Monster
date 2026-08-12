(function initializePetClientContext(global) {
  'use strict';

  const OMIT = Symbol('omit');
  const SENSITIVE_KEY = /(?:password|passwd|secret|credential|token|cookie|authorization|api.?key|private.?key|device.?key|access.?key|refresh.?key|session.?key)/i;
  const SENSITIVE_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:set-cookie|cookie|api[_ -]?key)\s*[:=]|[?&](?:access_?token|refresh_?token|token|api_?key|secret|password|device_?key)=[^&#\s]+)/i;
  const LOCAL_PATH_KEY = /(?:^|_)(?:local|file|install|working|workspace|cache|temp|root|home)?(?:path|dir|directory)$/i;
  const LOCAL_PATH_VALUE = /(?:^file:|\b[A-Za-z]:[\\/]|^\\\\|^\/(?:Users|home|var|tmp|opt)\/)/i;
  const CONTEXT_EVENTS = Object.freeze([
    'fe-monster-app-command-complete',
    'fe-monster-app-command-error',
    'fe-monster-pet-stream-state',
    'fe-monster-pet-emotion-change',
    'fe-monster-pet-proactive',
    'fe-monster-pet-companion-state',
    'fe-monster-pet-companion-reaction',
    'fe-monster-pet-weekly-summary',
    'fe-monster-pet-desktop-state',
    'fe-achievement-ornament-change',
    'fe-achievement-unlock',
    'fe-creative-community-event',
    'fe-monster-client-context-dirty'
  ]);

  function sensitiveKey(key) {
    return SENSITIVE_KEY.test(String(key || '').replace(/[^A-Za-z0-9]/g, ''));
  }

  function sanitize(value, depth = 0, limits = {}) {
    const maxDepth = limits.maxDepth ?? 7;
    const maxArray = limits.maxArray ?? 64;
    const maxObject = limits.maxObject ?? 80;
    const maxString = limits.maxString ?? 1_000;
    if (value === null) return null;
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return OMIT;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      if (SENSITIVE_VALUE.test(value) || LOCAL_PATH_VALUE.test(value)) return '[redacted]';
      return value.slice(0, maxString);
    }
    if (depth >= maxDepth) return null;
    if (Array.isArray(value)) {
      return value.slice(0, maxArray)
        .map((item) => sanitize(item, depth + 1, limits))
        .filter((item) => item !== OMIT);
    }
    if (typeof value !== 'object') return String(value).slice(0, maxString);
    const output = {};
    Object.entries(value).slice(0, maxObject).forEach(([key, item]) => {
      if (!/^[A-Za-z0-9_.-]{1,96}$/.test(key)) return;
      if (key === '__proto__' || key === 'prototype' || key === 'constructor'
        || sensitiveKey(key) || LOCAL_PATH_KEY.test(key)) return;
      const safeItem = sanitize(item, depth + 1, limits);
      if (safeItem !== OMIT) output[key] = safeItem;
    });
    return output;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function emotionContext(host) {
    const runtime = host.FeMonsterPetEmotionRuntime;
    if (!runtime) return null;
    try {
      const value = runtime.context?.() ?? runtime.snapshot?.();
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }

  function companionContext(host) {
    const companion = host.FeMonsterPetCompanionP2;
    if (!companion) return null;
    try {
      return {
        status: companion.status?.() || null,
        weekly: companion.weeklySummary?.() || null
      };
    } catch (_) {
      return null;
    }
  }

  function assistantContext(host, document) {
    const assistant = host.FeMonsterPetAssistant;
    const root = document?.getElementById?.('petAssistant');
    let visibility = null;
    let desktop = null;
    try { visibility = assistant?.visibility?.() || null; } catch (_) {}
    try { desktop = host.FeMonsterNativePetBridge?.state?.() || null; } catch (_) {}
    return {
      state: String(assistant?.state || root?.dataset?.state || 'idle').slice(0, 40),
      visible: visibility?.visible ?? (root ? root.hidden !== true : true),
      desktopMode: visibility?.desktopMode
        ?? document?.documentElement?.getAttribute?.('data-fe-client') === 'desktop-pet',
      desktop
    };
  }

  function buildFullContext(host, options = {}) {
    const document = host.document;
    let appContext = {};
    try {
      appContext = host.FeMonsterPetActionBridge?.clientContextSnapshot?.(options) || {};
    } catch (_) {
      appContext = {};
    }
    return {
      ...appContext,
      schema: 'fe-monster.pet-client-context/v1',
      emotion: emotionContext(host),
      companion: companionContext(host),
      assistant: assistantContext(host, document)
    };
  }

  function compactContext(fullContext, revision) {
    const playback = fullContext.playback && typeof fullContext.playback === 'object'
      ? { ...fullContext.playback }
      : {};
    const queue = playback.queue && typeof playback.queue === 'object'
      ? { ...playback.queue, items: (playback.queue.items || []).slice(0, 12) }
      : null;
    if (queue) playback.queue = queue;

    const activePresets = new Set([
      'global',
      fullContext.preset?.active?.id,
      fullContext.preset?.diy,
      fullContext.preset?.scene,
      fullContext.preset?.text,
      fullContext.preset?.sandboxPresetId
    ].filter(Boolean));
    const parameters = fullContext.parameters && typeof fullContext.parameters === 'object'
      ? {
        total: fullContext.parameters.total,
        truncated: fullContext.parameters.truncated,
        values: (fullContext.parameters.values || [])
          .filter((entry) => entry?.available !== false)
          .sort((left, right) => Number(activePresets.has(right?.preset)) - Number(activePresets.has(left?.preset)))
          .slice(0, 24)
      }
      : null;
    const compact = {
      schema: 'fe-monster.pet-client-context/v1',
      revision,
      capturedAt: Date.now(),
      page: fullContext.page,
      playback,
      preset: fullContext.preset,
      parameters,
      lyrics: fullContext.lyrics,
      community: fullContext.community,
      accounts: fullContext.accounts,
      ui: fullContext.ui,
      achievements: fullContext.achievements,
      commands: fullContext.commands,
      settings: fullContext.settings,
      runtime: fullContext.runtime,
      emotion: fullContext.emotion,
      companion: fullContext.companion,
      assistant: fullContext.assistant
    };
    const limits = { maxDepth: 7, maxArray: 32, maxObject: 64, maxString: 500 };
    let safe = sanitize(compact, 0, limits);
    if (JSON.stringify(safe).length > 16_000) {
      if (safe.playback?.queue?.items) safe.playback.queue.items = safe.playback.queue.items.slice(0, 6);
      if (safe.parameters?.values) safe.parameters.values = safe.parameters.values.slice(0, 12);
    }
    if (JSON.stringify(safe).length > 16_000) {
      safe = sanitize(safe, 0, { maxDepth: 6, maxArray: 12, maxObject: 32, maxString: 240 });
    }
    if (JSON.stringify(safe).length > 16_000) {
      safe = sanitize({
        schema: safe.schema,
        revision: safe.revision,
        capturedAt: safe.capturedAt,
        page: safe.page,
        playback: {
          song: safe.playback?.song,
          playing: safe.playback?.playing,
          positionSeconds: safe.playback?.positionSeconds,
          durationSeconds: safe.playback?.durationSeconds,
          queueIndex: safe.playback?.queueIndex,
          queueLength: safe.playback?.queueLength,
          volume: safe.playback?.volume
        },
        preset: safe.preset,
        lyrics: safe.lyrics,
        community: safe.community,
        ui: safe.ui,
        achievements: safe.achievements,
        commands: safe.commands,
        runtime: safe.runtime,
        emotion: safe.emotion,
        companion: safe.companion,
        assistant: safe.assistant
      }, 0, { maxDepth: 5, maxArray: 8, maxObject: 24, maxString: 160 });
    }
    return safe;
  }

  function createClientContextBridge(host = global) {
    const document = host.document;
    const listeners = new Set();
    const disposers = [];
    let revision = 0;
    let cachedFull = null;
    let cachedCompact = null;
    let refreshTimer = 0;
    let pendingReason = '';
    let lastRefreshAt = 0;

    const addListener = (target, type, listener, options) => {
      if (!target?.addEventListener) return;
      target.addEventListener(type, listener, options);
      disposers.push(() => target.removeEventListener?.(type, listener, options));
    };

    const publish = (reason = 'manual') => {
      if (refreshTimer) {
        host.clearTimeout?.(refreshTimer);
        refreshTimer = 0;
      }
      pendingReason = '';
      revision += 1;
      lastRefreshAt = Date.now();
      const lightweight = reason === 'media:timeupdate' || reason === 'playback:progress';
      const nextFull = buildFullContext(host, { includeParameters: !lightweight });
      if (lightweight && cachedFull?.parameters && !nextFull.parameters) {
        nextFull.parameters = cachedFull.parameters;
      }
      cachedFull = deepFreeze(sanitize(nextFull));
      cachedCompact = deepFreeze(compactContext(cachedFull, revision));
      listeners.forEach((listener) => {
        try { listener(cachedCompact, { reason, revision }); } catch (_) {}
      });
      try {
        const EventConstructor = host.CustomEvent || global.CustomEvent;
        if (EventConstructor) {
          host.dispatchEvent?.(new EventConstructor('fe-monster-pet-context-change', {
            detail: { reason, revision, context: cachedCompact }
          }));
        }
      } catch (_) {}
      return cachedCompact;
    };

    const schedule = (reason = 'event', delay = 0) => {
      pendingReason = reason;
      if (refreshTimer) {
        if (delay > 0) return;
        host.clearTimeout?.(refreshTimer);
        refreshTimer = 0;
      }
      refreshTimer = host.setTimeout?.(() => {
        refreshTimer = 0;
        publish(pendingReason || reason);
      }, Math.max(0, delay)) || 0;
      if (!refreshTimer) publish(reason);
    };

    const media = document?.getElementById?.('audio') || document?.querySelector?.('audio');
    ['play', 'pause', 'loadedmetadata', 'durationchange', 'seeked', 'volumechange', 'ended', 'emptied']
      .forEach((eventName) => addListener(media, eventName, () => schedule(`media:${eventName}`)));
    addListener(media, 'timeupdate', () => {
      const elapsed = Date.now() - lastRefreshAt;
      schedule('media:timeupdate', Math.max(0, 750 - elapsed));
    });
    addListener(host, 'fe-monster-playback-state', (event) => {
      const playbackEvent = String(event?.detail?.event || '').trim().toLowerCase();
      if (playbackEvent === 'progress') {
        const elapsed = Date.now() - lastRefreshAt;
        schedule('playback:progress', Math.max(0, 750 - elapsed));
        return;
      }
      schedule(`playback:${playbackEvent || 'state'}`);
    });
    ['online', 'offline', 'popstate', 'hashchange']
      .forEach((eventName) => addListener(host, eventName, () => schedule(`window:${eventName}`)));
    CONTEXT_EVENTS.forEach((eventName) => addListener(host, eventName, () => schedule(eventName)));
    addListener(document, 'visibilitychange', () => schedule('document:visibilitychange'));
    addListener(document, 'click', () => schedule('document:click'), true);
    addListener(document, 'change', () => schedule('document:change'), true);

    if (typeof host.MutationObserver === 'function' && document?.documentElement) {
      const observer = new host.MutationObserver(() => schedule('document:client-mode'));
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-fe-client']
      });
      disposers.push(() => observer.disconnect());
    }

    publish('initialize');
    return Object.freeze({
      schema: 'fe-monster.pet-client-context/v1',
      create: createClientContextBridge,
      get revision() { return revision; },
      snapshot(options = {}) {
        const full = sanitize(buildFullContext(host));
        return deepFreeze(options.compact === true ? compactContext(full, revision) : full);
      },
      compact() {
        return deepFreeze(compactContext(sanitize(buildFullContext(host)), revision));
      },
      current(options = {}) {
        if (!cachedFull || !cachedCompact) publish('current');
        return options.compact === false ? deepFreeze(cachedFull) : deepFreeze(cachedCompact);
      },
      refresh: publish,
      subscribe(listener, options = {}) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        if (options.immediate !== false) listener(cachedCompact, { reason: 'subscribe', revision });
        return () => listeners.delete(listener);
      },
      destroy() {
        if (refreshTimer) host.clearTimeout?.(refreshTimer);
        refreshTimer = 0;
        disposers.splice(0).forEach((dispose) => dispose());
        listeners.clear();
      }
    });
  }

  if (global.FeMonsterPetClientContext) return;
  global.FeMonsterPetClientContext = createClientContextBridge(global);
})(window);
