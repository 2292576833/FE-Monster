(() => {
  'use strict';

  if (window.__feMonsterAndroidMobileRuntime) return;
  window.__feMonsterAndroidMobileRuntime = true;

  const root = document.documentElement;
  const bridge = window.FeMonsterAndroid;
  const nativeFetch = window.fetch.bind(window);
  const storageKey = 'fe-monster.android.local-runtime/v1';
  const providerLabels = {
    netease: '网易云音乐',
    qq: 'QQ音乐',
    kugou: '酷狗音乐'
  };

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
    root.dataset.feOrientation = innerWidth > innerHeight ? 'landscape' : 'portrait';
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

  function providerFrom(url) {
    const pathMatch = url.pathname.match(/^\/api\/(netease|qq|kugou)(?:\/|$)/);
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
    if (path === '/api/providers') {
      return jsonResponse({
        ok: true,
        mode: 'android-local',
        providers: Object.entries(providerLabels).map(([id, label]) => ({ id, label, baseUrl: '' }))
      });
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
    if (path === '/api/search' || /^\/api\/(netease|qq|kugou)\/search$/.test(path)) {
      return jsonResponse({
        ok: true,
        provider,
        songs: [],
        localOnly: true,
        message: '本机模式不会把搜索发送到电脑或 FE Monster 服务器。'
      });
    }
    if (path === '/api/login/status' || /^\/api\/(netease|qq|kugou)\/login\/status$/.test(path)) {
      return jsonResponse({ ok: true, provider, loggedIn: false, account: {}, mode: 'android-local' });
    }
    if (/^\/api\/(netease|qq|kugou)\/login\/qr\/(key|create|check)$/.test(path)) {
      return localOnly(`${providerLabels[provider] || '音乐平台'}账号不会经过 FE Monster 服务器；本机模式暂不绑定平台账号。`, { provider });
    }
    if (path === '/api/user/playlists' || /^\/api\/(netease|qq|kugou)\/user\/playlists$/.test(path)) {
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

  function syncLocalImportUi() {
    const loginButton = document.getElementById('neteaseLoginButton');
    const loginLabel = document.getElementById('neteaseLoginLabel');
    if (loginLabel && loginLabel.textContent !== '导入音乐') loginLabel.textContent = '导入音乐';
    if (loginButton) {
      if (loginButton.getAttribute('aria-label') !== '从手机导入本地音乐') {
        loginButton.setAttribute('aria-label', '从手机导入本地音乐');
      }
      if (loginButton.getAttribute('title') !== '从手机导入本地音乐') {
        loginButton.setAttribute('title', '从手机导入本地音乐');
      }
    }
    const searchInput = document.getElementById('topSearchInput');
    if (searchInput && searchInput.placeholder !== '本机模式 · 使用导入按钮添加音乐') {
      searchInput.placeholder = '本机模式 · 使用导入按钮添加音乐';
    }
  }

  function applyLocalUi() {
    root.dataset.feRuntime = 'local';
    root.dataset.feServerState = 'local';
    document.getElementById('runtimeSettingsButton')?.setAttribute('title', 'Android 本机运行 · 不连接电脑端');
    syncLocalImportUi();
    const communityStatus = document.getElementById('communityStatus');
    if (communityStatus) communityStatus.textContent = '本机模式：已与电脑端隔离';
    const loginLabel = document.getElementById('neteaseLoginLabel');
    const loginButton = document.getElementById('neteaseLoginButton');
    const observer = new MutationObserver(syncLocalImportUi);
    if (loginLabel) observer.observe(loginLabel, { childList: true, characterData: true, subtree: true });
    if (loginButton) observer.observe(loginButton, { attributes: true, attributeFilter: ['aria-label', 'title'] });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#neteaseLoginButton')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById('localPlaylistInput')?.click();
      return;
    }
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
    showMessage('本机模式不把搜索发送到电脑端；请使用“导入音乐”选择手机文件。');
  }, true);

  document.addEventListener('DOMContentLoaded', applyLocalUi, { once: true });
  window.addEventListener('resize', syncOrientation, { passive: true });
  window.addEventListener('orientationchange', syncOrientation, { passive: true });
  window.dispatchEvent(new CustomEvent('fe-monster-runtime-ready', {
    detail: { platform: 'android', mode: 'local', serverRequired: false }
  }));
})();
