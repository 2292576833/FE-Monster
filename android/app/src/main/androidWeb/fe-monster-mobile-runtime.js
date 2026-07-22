(() => {
  'use strict';

  if (window.__feMonsterAndroidMobileRuntime) return;
  window.__feMonsterAndroidMobileRuntime = true;

  const root = document.documentElement;
  const bridge = window.FeMonsterAndroid;
  const nativeFetch = window.fetch.bind(window);
  const storageKey = 'fe-monster.android.local-runtime/v1';
  const providerLabels = {
    netease: '\u7f51\u6613\u4e91\u97f3\u4e50',
    qq: 'QQ\u97f3\u4e50',
    kugou: '\u9177\u72d7\u97f3\u4e50',
    qishui: '\u6c7d\u6c34\u97f3\u4e50'
  };
  const nativeMusicRequests = new Map();
  let nativeMusicRequestSequence = 0;

  const nativeTier = (() => {
    try {
      return String(bridge?.getPerformanceTier?.() || '').toLowerCase();
    } catch (_) {
      return '';
    }
  })();
  const memory = Math.max(0, Number(navigator.deviceMemory) || 0);
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 2);
  const performanceTier = nativeTier === 'low' || nativeTier === 'high'
    ? nativeTier
    : memory > 0 && memory <= 3 || cores <= 4
      ? 'low'
      : memory >= 8 && cores >= 8
        ? 'high'
        : 'balanced';

  function loadState() {
    const fallback = {
      volume: 0.8,
      position: 0,
      playing: false,
      queue: [],
      queueIndex: -1,
      presets: [],
      runtimeSettings: {
        gpuAcceleration: true,
        directX11: false,
        xAudio2: false,
        x3DAudio: false,
        gestureControl: false,
        gestureCameraSource: 'camera'
      }
    };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return {
        ...fallback,
        ...saved,
        queue: Array.isArray(saved.queue) ? saved.queue : [],
        presets: Array.isArray(saved.presets) ? saved.presets : [],
        runtimeSettings: { ...fallback.runtimeSettings, ...(saved.runtimeSettings || {}) }
      };
    } catch (_) {
      return fallback;
    }
  }

  const state = loadState();

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      // The in-memory runtime continues when storage is full or unavailable.
    }
  }

  function syncOrientation() {
    root.dataset.feOrientation = 'landscape';
  }

  root.dataset.fePlatform = 'android';
  root.dataset.feClientSource = 'apk-bundled';
  root.dataset.feRuntime = 'local';
  root.dataset.feServerState = 'local';
  root.dataset.androidPerformance = performanceTier;
  window.feMonsterPlatform = 'android';
  window.feMonsterClientSource = 'apk-bundled';
  window.feMonsterRuntime = 'local';
  window.feMonsterAndroidPerformanceTier = performanceTier;
  syncOrientation();

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-FE-Runtime': 'android-local'
      }
    });
  }

  function nativeMusicBridgeAvailable() {
    return typeof bridge?.requestMusicApi === 'function';
  }

  function nativeMusicGatewayState() {
    try {
      return String(bridge?.getMusicGatewayState?.() || (nativeMusicBridgeAvailable() ? 'starting' : 'unavailable'));
    } catch (_) {
      return nativeMusicBridgeAvailable() ? 'starting' : 'unavailable';
    }
  }

  function androidProviderCatalog() {
    const gatewayState = nativeMusicGatewayState();
    return {
      ok: true,
      mode: 'android-local',
      gatewayState,
      providers: Object.entries(providerLabels).map(([id, label]) => ({
        id,
        label,
        appName: label,
        baseUrl: `android://on-device/${id}`,
        enabled: true,
        configured: true,
        loginQr: id !== 'qishui',
        phoneLogin: id === 'qishui',
        status: gatewayState
      }))
    };
  }

  function isNativeMusicApiPath(path) {
    if (path === '/api/providers' || path === '/api/music-apis' || path === '/api/login/status') return true;
    return /^\/api\/(netease|qq|kugou|qishui)\/(login\/(qr\/(key|create|check)|status|phone\/(send|verify))|user\/playlists)$/.test(path);
  }

  window.feMonsterAndroidMusicResult = (requestId, status, rawPayload) => {
    const key = String(requestId || '');
    const pending = nativeMusicRequests.get(key);
    if (!pending) return;
    nativeMusicRequests.delete(key);
    clearTimeout(pending.timeout);

    let payload = rawPayload;
    if (typeof rawPayload === 'string') {
      try {
        payload = JSON.parse(rawPayload);
      } catch (_) {
        payload = { ok: false, error: 'Android music gateway returned invalid JSON.' };
      }
    }
    if (!payload || typeof payload !== 'object') {
      payload = { ok: false, error: String(payload || 'Empty Android music gateway response.') };
    }
    const numericStatus = Number(status);
    const responseStatus = Number.isInteger(numericStatus) && numericStatus >= 200 && numericStatus <= 599
      ? numericStatus
      : 503;
    if (responseStatus === 503 && /^ANDROID_GATEWAY_/.test(String(payload.code || ''))) {
      const failed = payload.code === 'ANDROID_GATEWAY_UNAVAILABLE' || payload.gatewayState === 'failed';
      payload = {
        ...payload,
        error: failed
          ? '\u672c\u673a\u97f3\u4e50\u767b\u5f55\u670d\u52a1\u6682\u65f6\u65e0\u6cd5\u542f\u52a8\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u5e94\u7528\u3002'
          : '\u672c\u673a\u97f3\u4e50\u767b\u5f55\u670d\u52a1\u6b63\u5728\u542f\u52a8\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0\u3002'
      };
    }
    pending.resolve(jsonResponse(payload, responseStatus));
  };

  function requestNativeMusicApi(url, method = 'GET', body = {}) {
    if (!nativeMusicBridgeAvailable()) {
      return Promise.resolve(localOnly('Android music gateway is unavailable.', {
        provider: providerFrom(url),
        gatewayUnavailable: true
      }));
    }

    const requestId = `music-${Date.now().toString(36)}-${(++nativeMusicRequestSequence).toString(36)}`;
    const pathAndQuery = `${url.pathname}${url.search}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        nativeMusicRequests.delete(requestId);
        resolve(localOnly('Android music gateway request timed out.', {
          provider: providerFrom(url),
          gatewayTimeout: true
        }));
      }, 25000);
      nativeMusicRequests.set(requestId, { resolve, timeout });

      try {
        bridge.requestMusicApi(requestId, method, pathAndQuery, JSON.stringify(body || {}));
      } catch (error) {
        nativeMusicRequests.delete(requestId);
        clearTimeout(timeout);
        resolve(localOnly(error instanceof Error ? error.message : 'Android music gateway request failed.', {
          provider: providerFrom(url),
          gatewayUnavailable: true
        }));
      }
    });
  }

  function providerFrom(url) {
    const pathMatch = url.pathname.match(/^\/api\/(netease|qq|kugou|qishui)(?:\/|$)/);
    return pathMatch?.[1] || url.searchParams.get('provider') || 'netease';
  }

  async function requestBody(input, options) {
    const direct = options?.body;
    if (typeof direct === 'string') {
      try { return JSON.parse(direct); } catch (_) { return {}; }
    }
    if (direct && typeof direct === 'object') return direct;
    if (input instanceof Request && !['GET', 'HEAD'].includes(input.method.toUpperCase())) {
      try { return await input.clone().json(); } catch (_) { return {}; }
    }
    return {};
  }

  function playerPayload(extra = {}) {
    return {
      ok: true,
      mode: 'android-local',
      playing: state.playing,
      paused: !state.playing,
      position: state.position,
      duration: 0,
      volume: state.volume,
      queue: state.queue,
      queueIndex: state.queueIndex,
      song: state.queue[state.queueIndex] || null,
      url: '',
      quality: 'local',
      ...extra
    };
  }

  function localOnly(message, extra = {}) {
    return jsonResponse({
      ok: false,
      mode: 'android-local',
      serverRequired: false,
      localOnly: true,
      error: message,
      ...extra
    });
  }

  async function routeLocalApi(url, input, options = {}) {
    const path = url.pathname;
    const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = await requestBody(input, options);
    const provider = providerFrom(url);

    if (path === '/api/providers' || path === '/api/music-apis') {
      return jsonResponse(androidProviderCatalog());
    }

    if (isNativeMusicApiPath(path) && nativeMusicBridgeAvailable()) {
      return requestNativeMusicApi(url, method, body);
    }

    if (path === '/health') {
      return jsonResponse({ ok: true, mode: 'android-local', serverRequired: false });
    }
    if (path === '/api/app/runtime') {
      return jsonResponse({
        ok: true,
        clientMode: 'android-local',
        renderPreset: performanceTier === 'low' ? 'economy' : 'balanced',
        renderBackend: 'webgl',
        audioBackend: 'web-audio',
        audioSpatialBackend: 'web-audio',
        audioDecoder: 'android-webview',
        nativeAudio: { active: false },
        settings: state.runtimeSettings,
        serverRequired: false
      });
    }
    if (path === '/api/app/runtime/settings') {
      if (method !== 'GET') {
        Object.assign(state.runtimeSettings, body.settings || body);
        saveState();
      }
      return jsonResponse({ ok: true, settings: state.runtimeSettings, restartRequired: false });
    }
    if (path === '/api/app/gesture') {
      return jsonResponse({ ok: true, enabled: false, running: false, state: 'local' });
    }
    if (path === '/api/player/state') return jsonResponse(playerPayload());
    if (path === '/api/player/volume') {
      state.volume = Math.max(0, Math.min(1, Number(url.searchParams.get('value')) || 0));
      saveState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/seek') {
      state.position = Math.max(0, Number(url.searchParams.get('position')) || 0);
      saveState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/play' || path === '/api/player/pause' || path === '/api/player/toggle') {
      state.playing = path.endsWith('/toggle') ? !state.playing : path.endsWith('/play');
      saveState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/previous' || path === '/api/player/next') {
      if (state.queue.length) {
        const step = path.endsWith('/next') ? 1 : -1;
        state.queueIndex = (state.queueIndex + step + state.queue.length) % state.queue.length;
      }
      state.position = 0;
      saveState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/queue' || path === '/api/player/queue/merge') {
      const songs = Array.isArray(body.songs) ? body.songs : Array.isArray(body.queue) ? body.queue : [];
      state.queue = path.endsWith('/merge') ? [...state.queue, ...songs] : songs;
      state.queueIndex = state.queue.length ? Math.max(0, Number(body.queueIndex) || 0) : -1;
      saveState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/load' || /\/song\/url$/.test(path) || path === '/api/song/url') {
      return localOnly('本机模式请导入手机中的音乐文件播放。', { playable: false, provider });
    }
    if (path === '/api/audio/sample') {
      return jsonResponse({ ok: true, source: 'web-audio', energy: 0, bass: 0, beat: 0 });
    }
    if (path === '/api/visual-bridge/state') {
      return jsonResponse({ ok: true, audio: { source: 'web-audio', energy: 0, bass: 0, beat: 0 } });
    }
    if (path === '/api/search' || /^\/api\/(netease|qq|kugou|qishui)\/search$/.test(path)) {
      return jsonResponse({
        ok: true,
        provider,
        songs: [],
        localOnly: true,
        message: '本机模式不会把搜索发送到电脑或 FE Monster 服务器。'
      });
    }
    if (path === '/api/login/status' || /^\/api\/(netease|qq|kugou|qishui)\/login\/status$/.test(path)) {
      return jsonResponse({ ok: true, provider, loggedIn: false, account: {}, mode: 'android-local' });
    }
    if (/^\/api\/(netease|qq|kugou|qishui)\/login\/qr\/(key|create|check)$/.test(path)) {
      return localOnly(`${providerLabels[provider] || '音乐平台'}账号不会经过 FE Monster 服务器；本机模式暂不绑定平台账号。`, { provider });
    }
    if (/^\/api\/qishui\/login\/phone\/(send|verify)$/.test(path)) {
      return localOnly('Android music gateway is unavailable.', { provider });
    }
    if (path === '/api/user/playlists' || /^\/api\/(netease|qq|kugou|qishui)\/user\/playlists$/.test(path)) {
      return jsonResponse({ ok: true, provider, loggedIn: false, playlists: [] });
    }
    if (path === '/api/sandbox/presets') {
      if (method === 'POST' && body.preset?.id) {
        const index = state.presets.findIndex((item) => item.id === body.preset.id);
        if (index >= 0) state.presets[index] = body.preset;
        else state.presets.push(body.preset);
        saveState();
      }
      return jsonResponse({ ok: true, folder: 'Android 本机存储', presets: state.presets });
    }
    if (path === '/api/sandbox/presets/delete') {
      const id = String(body.id || body.presetId || '');
      state.presets = state.presets.filter((item) => String(item.id) !== id);
      saveState();
      return jsonResponse({ ok: true, folder: 'Android 本机存储', presets: state.presets });
    }
    if (path === '/api/sandbox/components') {
      return jsonResponse({ ok: true, folder: 'APK 内置组件', components: [] });
    }
    if (path === '/api/wallpapers') return jsonResponse({ ok: true, wallpapers: [] });
    if (path === '/api/community/state') {
      return jsonResponse({ ok: true, serverOnline: false, localRuntime: true, provider, loggedIn: false });
    }
    if (path.startsWith('/api/community/')) {
      return localOnly('本机模式不连接电脑端，社区联机功能已隔离。', { provider });
    }
    if (path === '/api/update/latest' || path === '/api/update/progress') {
      return jsonResponse({ ok: true, updateAvailable: false, mode: 'android-local' });
    }
    if (path.startsWith('/api/app/window/')) {
      return jsonResponse({ ok: false, mode: 'android-local', error: 'Android 由系统管理窗口。' });
    }
    return localOnly('该功能未接入 Android 本机运行时。', { path });
  }

  async function androidLocalFetch(input, options = {}) {
    const rawUrl = input instanceof Request ? input.url : String(input || '');
    const url = new URL(rawUrl, location.href);
    const localApi = url.origin === location.origin
      && (url.pathname === '/health' || url.pathname === '/api' || url.pathname.startsWith('/api/'));
    if (!localApi) return nativeFetch(input, options);
    return routeLocalApi(url, input, options);
  }

  window.fetch = androidLocalFetch;
  window.feMonsterAndroidLocalRuntime = Object.freeze({
    mode: 'local',
    serverRequired: false,
    fetch: androidLocalFetch
  });

  function showMessage(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    try { bridge?.showMessage?.(message); } catch (_) {}
  }

  function enablePlaybackAccountLogin() {
    const account = document.getElementById('qishuiPlaybackAccount');
    const loginButton = document.getElementById('neteaseLoginButton');
    if (!account || !loginButton || account.dataset.androidLoginEntry === 'true') return;
    account.dataset.androidLoginEntry = 'true';
    account.setAttribute('role', 'button');
    account.setAttribute('tabindex', '0');
    account.setAttribute('title', '\u767b\u5f55\u6216\u5207\u6362\u97f3\u4e50\u5e73\u53f0\u8d26\u53f7');
    account.addEventListener('click', () => loginButton.click());
    account.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      loginButton.click();
    });
  }

  function applyLocalUi() {
    root.dataset.feRuntime = 'local';
    root.dataset.feServerState = 'local';
    document.getElementById('runtimeSettingsButton')?.setAttribute('title', 'Android 本机运行 · 不连接电脑端');
    document.querySelectorAll([
      '.top-favorites-button',
      '.top-search-submit',
      '#qishuiPlaybackVisibilityToggle',
      '#qishuiPlaybackScaleToggle',
      '#qishuiPlaybackTools button',
      '#qishuiPlaybackQuality',
      '#qishuiPlaybackPreviousButton',
      '#qishuiPlaybackPlayButton',
      '#qishuiPlaybackNextButton'
    ].join(',')).forEach((button) => button.classList.add('glass-button-native'));
    enablePlaybackAccountLogin();
    const communityStatus = document.getElementById('communityStatus');
    if (communityStatus) communityStatus.textContent = '本机模式：已与电脑端隔离';
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('#communityCard, #communityMessageDialog, #communityProfileDialog')) return;
    if (target.closest('#communityCollapseButton')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage('本机模式已与电脑端隔离，社区联机功能不运行。');
  }, true);

  document.addEventListener('submit', (event) => {
    if (!(event.target instanceof Element) || !event.target.matches('#topSearchForm')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage('本机模式不把搜索发送到电脑端；请从歌单页选择手机中的本地音乐。');
  }, true);

  document.addEventListener('DOMContentLoaded', applyLocalUi, { once: true });
  window.dispatchEvent(new CustomEvent('fe-monster-runtime-ready', {
    detail: { platform: 'android', mode: 'local', serverRequired: false }
  }));
})();
