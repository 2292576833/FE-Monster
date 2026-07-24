(() => {
  'use strict';

  if (window.__feMonsterIOSRuntime) return;
  window.__feMonsterIOSRuntime = true;

  const root = document.documentElement;
  const nativeFetch = window.fetch.bind(window);
  const nativeRequests = new Map();
  const storageKey = 'fe-monster.ios.local-runtime/v1';
  const providerNames = Object.freeze({
    netease: '网易云音乐',
    qq: 'QQ音乐',
    kugou: '酷狗音乐'
  });
  let requestSequence = 0;
  let viewportFrame = 0;

  root.dataset.fePlatform = 'ios';
  root.dataset.feFormFactor = 'phone';
  root.dataset.feClientSource = 'ios-bundled';
  root.dataset.feRuntime = 'local';
  root.dataset.feServerState = 'local';
  window.feMonsterPlatform = 'ios';
  window.feMonsterClientSource = 'ios-bundled';
  window.feMonsterRuntime = 'local';

  function errorFrom(value, fallback = 'iOS 原生桥接请求失败') {
    if (value instanceof Error) return value;
    const message = typeof value === 'string'
      ? value
      : String(value?.message || value?.error || fallback);
    const error = new Error(message);
    if (value && typeof value === 'object') {
      error.code = String(value.code || '');
      error.details = value;
    }
    return error;
  }

  function settleNativeRequest(requestId, kind, envelope) {
    const id = String(requestId || '');
    const pending = nativeRequests.get(id);
    if (!pending) return;
    nativeRequests.delete(id);
    window.clearTimeout(pending.timeout);

    if (kind === 'reject' || envelope?.ok === false) {
      pending.reject(errorFrom(envelope, 'iOS 原生桥接请求失败'));
      return;
    }

    const value = envelope
      && typeof envelope === 'object'
      && Object.prototype.hasOwnProperty.call(envelope, 'value')
      ? envelope.value
      : envelope;
    pending.resolve(value);
  }

  const bridgeApi = window.FEIOSNativeBridge && typeof window.FEIOSNativeBridge === 'object'
    ? window.FEIOSNativeBridge
    : {};

  bridgeApi._resolve = (requestId, envelope) => {
    settleNativeRequest(requestId, 'resolve', envelope);
  };
  bridgeApi._reject = (requestId, error) => {
    settleNativeRequest(requestId, 'reject', error);
  };
  bridgeApi.request = (action, payload = {}, options = {}) => {
    const handler = window.webkit?.messageHandlers?.feMonsterIOS;
    if (!handler || typeof handler.postMessage !== 'function') {
      return Promise.reject(errorFrom({
        code: 'IOS_BRIDGE_UNAVAILABLE',
        message: 'iOS 原生桥接尚未就绪'
      }));
    }

    const requestId = `ios-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        nativeRequests.delete(requestId);
        reject(errorFrom({
          code: 'IOS_BRIDGE_TIMEOUT',
          message: 'iOS 原生桥接请求超时'
        }));
      }, timeoutMs);
      nativeRequests.set(requestId, { resolve, reject, timeout });
      try {
        handler.postMessage({ requestId, action, payload });
      } catch (error) {
        nativeRequests.delete(requestId);
        window.clearTimeout(timeout);
        reject(errorFrom(error));
      }
    });
  };
  window.FEIOSNativeBridge = bridgeApi;

  function scheduleViewportSync() {
    if (viewportFrame) return;
    viewportFrame = window.requestAnimationFrame(() => {
      viewportFrame = 0;
      const viewport = window.visualViewport;
      const width = Math.max(1, Number(viewport?.width) || window.innerWidth || 1);
      const height = Math.max(1, Number(viewport?.height) || window.innerHeight || 1);
      const keyboardInset = Math.max(0, (window.innerHeight || height) - height - (Number(viewport?.offsetTop) || 0));
      root.style.setProperty('--ios-viewport-width', `${width}px`);
      root.style.setProperty('--ios-viewport-height', `${height}px`);
      root.style.setProperty('--ios-keyboard-inset', `${keyboardInset}px`);
      root.dataset.feOrientation = width > height ? 'landscape' : 'portrait';
      root.dataset.iosKeyboard = keyboardInset > 96 ? 'open' : 'closed';
    });
  }

  scheduleViewportSync();
  window.addEventListener('resize', scheduleViewportSync, { passive: true });
  window.addEventListener('orientationchange', scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewportSync, { passive: true });

  function jsonResponse(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload ?? {}), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-FE-Runtime': 'ios-local',
        ...extraHeaders
      }
    });
  }

  function loadLocalState() {
    const fallback = {
      volume: 0.8,
      position: 0,
      playing: false,
      queue: [],
      queueIndex: -1,
      presets: [],
      components: [],
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
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
      return {
        ...fallback,
        ...saved,
        queue: Array.isArray(saved.queue) ? saved.queue : [],
        presets: Array.isArray(saved.presets) ? saved.presets : [],
        components: Array.isArray(saved.components) ? saved.components : [],
        runtimeSettings: {
          ...fallback.runtimeSettings,
          ...(saved.runtimeSettings && typeof saved.runtimeSettings === 'object'
            ? saved.runtimeSettings
            : {})
        }
      };
    } catch (_) {
      return fallback;
    }
  }

  const state = loadLocalState();
  const transientWallpapers = [];

  function saveLocalState() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        volume: state.volume,
        position: state.position,
        playing: state.playing,
        queue: state.queue,
        queueIndex: state.queueIndex,
        presets: state.presets,
        components: state.components,
        runtimeSettings: state.runtimeSettings
      }));
    } catch (_) {
      // The runtime continues in memory when WebKit storage is full.
    }
  }

  function audioElement() {
    return document.getElementById('audio');
  }

  function currentQueueSong() {
    return state.queue[state.queueIndex] || null;
  }

  function playerPayload(extra = {}) {
    const audio = audioElement();
    const hasAudio = Boolean(audio?.currentSrc || audio?.getAttribute('src'));
    const position = Number.isFinite(audio?.currentTime) ? audio.currentTime : state.position;
    const duration = Number.isFinite(audio?.duration) ? audio.duration : Number(currentQueueSong()?.duration) || 0;
    const playing = hasAudio ? !audio.paused && !audio.ended : state.playing;
    state.position = Math.max(0, Number(position) || 0);
    state.playing = playing;
    return {
      ok: true,
      mode: 'ios-local',
      playing,
      paused: !playing,
      position: state.position,
      duration: Math.max(0, Number(duration) || 0),
      volume: state.volume,
      queue: state.queue,
      queueIndex: state.queueIndex,
      song: currentQueueSong(),
      url: audio?.currentSrc || '',
      quality: 'standard',
      ...extra
    };
  }

  function localOnly(message, extra = {}, status = 503) {
    return jsonResponse({
      ok: false,
      mode: 'ios-local',
      localOnly: true,
      serverRequired: false,
      error: message,
      ...extra
    }, status);
  }

  function apiTarget(input) {
    const raw = input instanceof Request ? input.url : String(input || '');
    let parsed;
    try {
      parsed = new URL(raw, window.location.href);
    } catch (_) {
      return null;
    }
    const path = parsed.pathname || '';
    if (path !== '/health' && path !== '/api' && !path.startsWith('/api/')) return null;

    const rawIsRelative = raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../');
    const sameDocumentOrigin = parsed.origin === window.location.origin;
    const bundledFileRequest = parsed.protocol === 'file:';
    const loopbackRequest = (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (!rawIsRelative && !sameDocumentOrigin && !bundledFileRequest && !loopbackRequest) return null;
    return { url: parsed, pathAndQuery: `${path}${parsed.search}` };
  }

  function isNativeMusicPath(path) {
    return path === '/api/providers'
      || path === '/api/music-apis'
      || path.startsWith('/api/music-apis/')
      || path === '/api/login/status'
      || path.startsWith('/api/login/')
      || /^\/api\/(netease|qq|kugou)(?:\/|$)/.test(path)
      || path === '/api/search'
      || path === '/api/player/load'
      || path === '/api/lyric'
      || path === '/api/song/url'
      || path === '/api/user/playlists';
  }

  function mergeHeaders(input, options = {}) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers || undefined).forEach((value, name) => headers.set(name, value));
    const output = {};
    headers.forEach((value, name) => {
      const normalized = name.toLowerCase();
      if (['authorization', 'cookie', 'host', 'connection', 'content-length'].includes(normalized)) return;
      output[name] = value;
    });
    return output;
  }

  function bytesToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
  }

  async function encodedRequestBody(input, options = {}) {
    let body;
    if (Object.prototype.hasOwnProperty.call(options, 'body')) {
      body = options.body;
    } else if (input instanceof Request && !['GET', 'HEAD'].includes(input.method.toUpperCase())) {
      body = await input.clone().blob();
    }

    if (body == null) return { body: '', bodyEncoding: 'utf8' };
    if (typeof body === 'string') return { body, bodyEncoding: 'utf8' };
    if (body instanceof URLSearchParams) return { body: body.toString(), bodyEncoding: 'utf8' };
    if (body instanceof Blob) {
      return {
        body: bytesToBase64(new Uint8Array(await body.arrayBuffer())),
        bodyEncoding: 'base64'
      };
    }
    if (body instanceof ArrayBuffer) {
      return { body: bytesToBase64(new Uint8Array(body)), bodyEncoding: 'base64' };
    }
    if (ArrayBuffer.isView(body)) {
      return {
        body: bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
        bodyEncoding: 'base64'
      };
    }
    if (body instanceof FormData) {
      throw errorFrom({
        code: 'IOS_UNSUPPORTED_FORM_DATA',
        message: 'iOS 本机接口暂不接受 multipart 表单'
      });
    }
    return { body: JSON.stringify(body), bodyEncoding: 'utf8' };
  }

  function responseBody(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  async function requestNativeFetch(target, input, options = {}) {
    const method = String(
      options.method
      || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const encoded = await encodedRequestBody(input, options);
    const value = await bridgeApi.request('nativeFetch', {
      path: target.pathAndQuery,
      method,
      headers: mergeHeaders(input, options),
      ...encoded
    }, { timeoutMs: 45000 });

    const result = value && typeof value === 'object' ? value : { body: value };
    const statusValue = Number(result.status ?? result.statusCode);
    const status = Number.isInteger(statusValue) && statusValue >= 200 && statusValue <= 599
      ? statusValue
      : 200;
    const headers = new Headers(result.headers && typeof result.headers === 'object'
      ? result.headers
      : {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('X-FE-Runtime', 'ios-node-mobile');
    return new Response(responseBody(
      Object.prototype.hasOwnProperty.call(result, 'body') ? result.body : result
    ), { status, headers });
  }

  async function requestJsonBody(input, options = {}) {
    let body;
    if (Object.prototype.hasOwnProperty.call(options, 'body')) {
      body = options.body;
    } else if (input instanceof Request && !['GET', 'HEAD'].includes(input.method.toUpperCase())) {
      try {
        return await input.clone().json();
      } catch (_) {
        return {};
      }
    }
    if (typeof body === 'string') {
      try {
        return JSON.parse(body);
      } catch (_) {
        return {};
      }
    }
    return body && typeof body === 'object' && !(body instanceof Blob) ? body : {};
  }

  function providerFrom(url) {
    const match = url.pathname.match(/^\/api\/(netease|qq|kugou)(?:\/|$)/);
    return match?.[1] || url.searchParams.get('provider') || 'netease';
  }

  async function routeLocalApi(target, input, options = {}) {
    const { url } = target;
    const path = url.pathname;
    const method = String(
      options.method
      || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    if (isNativeMusicPath(path)) {
      try {
        return await requestNativeFetch(target, input, options);
      } catch (error) {
        return localOnly(error.message || 'iOS 本机音乐服务尚未就绪', {
          code: error.code || 'IOS_MUSIC_GATEWAY_UNAVAILABLE',
          provider: providerFrom(url),
          gatewayUnavailable: true
        });
      }
    }

    const body = await requestJsonBody(input, options);
    if (path === '/health') {
      return jsonResponse({ ok: true, mode: 'ios-local', serverRequired: false });
    }
    if (path === '/api/app/runtime') {
      return jsonResponse({
        ok: true,
        clientMode: 'ios-local',
        renderPreset: 'balanced',
        renderBackend: 'webgl',
        audioBackend: 'web-audio',
        audioSpatialBackend: 'web-audio',
        audioDecoder: 'avfoundation-webkit',
        nativeAudio: { active: false },
        settings: state.runtimeSettings,
        serverRequired: false
      });
    }
    if (path === '/api/app/runtime/settings') {
      if (method !== 'GET') {
        Object.assign(state.runtimeSettings, body.settings || body);
        saveLocalState();
      }
      return jsonResponse({ ok: true, settings: state.runtimeSettings, restartRequired: false });
    }
    if (path === '/api/app/gesture') {
      return jsonResponse({ ok: true, enabled: false, running: false, state: 'ios-local' });
    }
    if (path === '/api/player/state') return jsonResponse(playerPayload());
    if (path === '/api/player/volume') {
      state.volume = Math.max(0, Math.min(1, Number(url.searchParams.get('value')) || 0));
      const audio = audioElement();
      if (audio) audio.volume = state.volume;
      saveLocalState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/seek') {
      state.position = Math.max(0, Number(url.searchParams.get('position')) || 0);
      const audio = audioElement();
      if (audio && Number.isFinite(audio.duration)) {
        try {
          audio.currentTime = Math.min(state.position, audio.duration || state.position);
        } catch (_) {}
      }
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/play' || path === '/api/player/pause' || path === '/api/player/toggle') {
      const audio = audioElement();
      const shouldPlay = path.endsWith('/toggle')
        ? !(audio ? !audio.paused : state.playing)
        : path.endsWith('/play');
      state.playing = shouldPlay;
      if (audio) {
        if (shouldPlay) audio.play().catch(() => {});
        else audio.pause();
      }
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/previous' || path === '/api/player/next') {
      if (state.queue.length) {
        const step = path.endsWith('/next') ? 1 : -1;
        state.queueIndex = (state.queueIndex + step + state.queue.length) % state.queue.length;
      }
      state.position = 0;
      saveLocalState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/player/queue' || path === '/api/player/queue/merge') {
      const songs = Array.isArray(body.songs)
        ? body.songs
        : Array.isArray(body.queue) ? body.queue : [];
      state.queue = path.endsWith('/merge') ? [...state.queue, ...songs] : songs;
      state.queueIndex = state.queue.length
        ? Math.max(0, Math.min(state.queue.length - 1, Number(body.currentIndex ?? body.queueIndex) || 0))
        : -1;
      saveLocalState();
      return jsonResponse(playerPayload());
    }
    if (path === '/api/audio/sample') {
      return jsonResponse({
        ok: true,
        source: 'web-audio',
        energy: 0,
        bass: 0,
        lowFrequencyAmplitude: 0,
        beat: 0
      });
    }
    if (path === '/api/visual-bridge/state') {
      return jsonResponse({
        ok: true,
        audio: {
          source: 'web-audio',
          energy: 0,
          bass: 0,
          lowFrequencyAmplitude: 0,
          beat: 0
        }
      });
    }
    if (path === '/api/sandbox/presets') {
      if (method === 'POST' && body.preset?.id) {
        const index = state.presets.findIndex((item) => String(item.id) === String(body.preset.id));
        if (index >= 0) state.presets[index] = body.preset;
        else state.presets.push(body.preset);
        saveLocalState();
      }
      return jsonResponse({
        ok: true,
        folder: 'iPhone 本地场景预设',
        presets: state.presets
      });
    }
    if (path === '/api/sandbox/presets/delete') {
      const id = String(body.id || body.presetId || '');
      const before = state.presets.length;
      state.presets = state.presets.filter((item) => String(item.id) !== id);
      saveLocalState();
      return jsonResponse({
        ok: true,
        deleted: state.presets.length !== before,
        folder: 'iPhone 本地场景预设',
        presets: state.presets
      });
    }
    if (path === '/api/sandbox/components') {
      if (method === 'POST' && body.component?.id) {
        const index = state.components.findIndex((item) => String(item.id) === String(body.component.id));
        if (index >= 0) state.components[index] = body.component;
        else state.components.push(body.component);
        saveLocalState();
        return jsonResponse({ ok: true, component: body.component, components: state.components });
      }
      return jsonResponse({
        ok: true,
        folder: 'iPhone 本地组件',
        components: state.components
      });
    }
    if (path === '/api/wallpapers') {
      return jsonResponse({ ok: true, wallpapers: transientWallpapers });
    }
    if (path === '/api/wallpapers/import') {
      const rawBody = Object.prototype.hasOwnProperty.call(options, 'body')
        ? options.body
        : input instanceof Request ? await input.clone().blob() : null;
      if (!(rawBody instanceof Blob)) {
        return localOnly('iOS 壁纸导入没有收到有效文件', {}, 400);
      }
      const name = url.searchParams.get('name') || `wallpaper-${Date.now()}`;
      const wallpaper = {
        id: `ios-wallpaper-${Date.now().toString(36)}-${transientWallpapers.length}`,
        name,
        kind: rawBody.type.startsWith('video/') ? 'video' : 'image',
        source: 'imported',
        url: URL.createObjectURL(rawBody)
      };
      transientWallpapers.push(wallpaper);
      return jsonResponse({ ok: true, wallpaper });
    }
    if (path === '/api/community/state') {
      return jsonResponse({
        ok: true,
        serverOnline: false,
        localRuntime: true,
        loggedIn: false
      });
    }
    if (path.startsWith('/api/community/')) {
      return localOnly('iPhone 本机模式暂未连接社区服务器');
    }
    if (path === '/api/update/latest' || path === '/api/update/progress') {
      return jsonResponse({ ok: true, updateAvailable: false, mode: 'ios-local' });
    }
    if (path.startsWith('/api/update/')) {
      return localOnly('iOS 更新由 App Store 或 TestFlight 管理');
    }
    if (path.startsWith('/api/app/window/')) {
      return jsonResponse({ ok: false, mode: 'ios-local', error: 'iOS 由系统管理应用窗口' }, 400);
    }
    if (path === '/api/cover') {
      return localOnly('封面资源应直接从原地址加载', {}, 404);
    }
    if (path.startsWith('/api/sandbox/') || path.includes('-market')) {
      return localOnly('该桌面协作功能尚未接入 iPhone 本机运行时');
    }
    return localOnly('该接口尚未接入 iPhone 本机运行时', { path });
  }

  window.fetch = async (input, options = {}) => {
    const target = apiTarget(input);
    if (!target) return nativeFetch(input, options);
    return routeLocalApi(target, input, options);
  };

  window.feMonsterIOSLocalRuntime = Object.freeze({
    mode: 'local',
    serverRequired: false,
    fetch: window.fetch,
    nativeRequest: bridgeApi.request
  });

  function showMessage(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 2200);
    }
  }

  function activeProvider() {
    const tab = document.querySelector('#loginProviderTabs [data-login-provider].is-active')
      || document.querySelector('#loginProviderTabs [data-login-provider][aria-pressed="true"]');
    const id = String(tab?.dataset.loginProvider || 'netease');
    return Object.prototype.hasOwnProperty.call(providerNames, id) ? id : 'netease';
  }

  function qrSource() {
    const image = document.getElementById('neteaseQrImage');
    return String(image?.currentSrc || image?.getAttribute('src') || '');
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('无法读取二维码'));
      reader.readAsDataURL(blob);
    });
  }

  async function qrNativePayload() {
    const source = qrSource();
    if (!source) throw new Error('二维码尚未生成，请先刷新二维码');
    const provider = activeProvider();
    const payload = { provider, filename: `fe-monster-${provider}-login-qr.png` };
    if (source.startsWith('data:')) return { ...payload, dataUrl: source };
    if (source.startsWith('blob:')) {
      const response = await nativeFetch(source);
      if (!response.ok) throw new Error(`二维码读取失败 (${response.status})`);
      return { ...payload, dataUrl: await blobToDataUrl(await response.blob()) };
    }
    throw new Error('二维码不是受信任的本机 PNG 数据');
  }

  function setQrStatus(message) {
    const status = document.getElementById('neteaseQrStatus');
    if (status) status.textContent = message;
  }

  async function runQrAction(action) {
    const provider = activeProvider();
    try {
      if (action === 'openProviderApp') {
        await bridgeApi.request(action, { provider }, { timeoutMs: 10000 });
        setQrStatus(`已尝试打开${providerNames[provider]}，请进入扫一扫并从相册选择二维码`);
        return;
      }
      const payload = await qrNativePayload();
      await bridgeApi.request(action, payload, { timeoutMs: 30000 });
      const verb = action === 'shareQrCode' ? '已打开系统分享' : '二维码已保存到相册';
      setQrStatus(`${verb}；请在${providerNames[provider]}扫一扫中从相册选择`);
      showMessage(verb);
    } catch (error) {
      const message = error.message || '二维码操作失败';
      setQrStatus(message);
      showMessage(message);
    }
  }

  function syncQrControls() {
    const workflow = document.getElementById('androidLoginWorkflow');
    if (!workflow) return;
    workflow.hidden = false;
    workflow.classList.add('ios-login-workflow');

    const provider = activeProvider();
    const help = document.getElementById('androidQrHelp');
    const save = document.getElementById('androidQrSaveButton');
    const open = document.getElementById('androidMusicAppButton');
    const actions = workflow.querySelector('.android-login-actions');
    if (help) {
      help.textContent = `保存或分享二维码后，打开${providerNames[provider]}，进入扫一扫并从相册选择。`;
    }
    if (save) {
      save.textContent = '保存二维码';
      save.disabled = !qrSource();
      if (save.dataset.iosBound !== 'true') {
        save.dataset.iosBound = 'true';
        save.addEventListener('click', (event) => {
          event.preventDefault();
          runQrAction('saveQrCode');
        }, true);
      }
    }
    if (open) {
      open.textContent = `打开${providerNames[provider]}`;
      open.disabled = false;
      if (open.dataset.iosBound !== 'true') {
        open.dataset.iosBound = 'true';
        open.addEventListener('click', (event) => {
          event.preventDefault();
          runQrAction('openProviderApp');
        }, true);
      }
    }
    if (actions && !document.getElementById('iosQrShareButton')) {
      const share = document.createElement('button');
      share.id = 'iosQrShareButton';
      share.type = 'button';
      share.textContent = '分享二维码';
      share.disabled = !qrSource();
      share.addEventListener('click', (event) => {
        event.preventDefault();
        runQrAction('shareQrCode');
      });
      actions.appendChild(share);
    }
    const share = document.getElementById('iosQrShareButton');
    if (share) share.disabled = !qrSource();
  }

  function enablePlaybackAccountLogin() {
    const account = document.getElementById('qishuiPlaybackAccount');
    const loginButton = document.getElementById('neteaseLoginButton');
    if (!account || !loginButton || account.dataset.iosLoginEntry === 'true') return;
    account.dataset.iosLoginEntry = 'true';
    account.setAttribute('role', 'button');
    account.setAttribute('tabindex', '0');
    account.setAttribute('title', '登录或切换音乐平台账号');
    account.addEventListener('click', () => loginButton.click());
    account.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      loginButton.click();
    });
  }

  function bindAudioState() {
    const audio = audioElement();
    if (!audio || audio.dataset.iosStateBound === 'true') return;
    audio.dataset.iosStateBound = 'true';
    audio.addEventListener('play', () => {
      state.playing = true;
    });
    audio.addEventListener('pause', () => {
      state.playing = false;
      state.position = Number(audio.currentTime) || 0;
      saveLocalState();
    });
    audio.addEventListener('timeupdate', () => {
      state.position = Number(audio.currentTime) || 0;
    });
    audio.addEventListener('volumechange', () => {
      state.volume = Number(audio.volume) || 0;
    });
  }

  function rewriteCoverProxy(element) {
    if (!(element instanceof HTMLImageElement)) return;
    const raw = element.getAttribute('src') || '';
    let parsed;
    try {
      parsed = new URL(raw, window.location.href);
    } catch (_) {
      return;
    }
    if (parsed.pathname !== '/api/cover') return;
    const direct = parsed.searchParams.get('url');
    if (!direct) return;
    element.src = direct;
  }

  function applyIOSUi() {
    root.dataset.feRuntime = 'local';
    root.dataset.feServerState = 'local';
    const subtitle = document.getElementById('loginProviderSubtitle');
    if (subtitle) subtitle.textContent = '选择平台后，用对应音乐 App 扫码确认';
    const importPanel = document.getElementById('musicApiImportPanel');
    if (importPanel) importPanel.hidden = true;
    enablePlaybackAccountLogin();
    bindAudioState();
    syncQrControls();
    document.querySelectorAll('img[src*="/api/cover"]').forEach(rewriteCoverProxy);

    const qrImage = document.getElementById('neteaseQrImage');
    if (qrImage && qrImage.dataset.iosObserved !== 'true') {
      qrImage.dataset.iosObserved = 'true';
      new MutationObserver(syncQrControls).observe(qrImage, {
        attributes: true,
        attributeFilter: ['src', 'class']
      });
      qrImage.addEventListener('load', syncQrControls);
    }

    const tabs = document.getElementById('loginProviderTabs');
    if (tabs && tabs.dataset.iosObserved !== 'true') {
      tabs.dataset.iosObserved = 'true';
      new MutationObserver(syncQrControls).observe(tabs, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-pressed']
      });
      tabs.addEventListener('click', () => window.setTimeout(syncQrControls, 0));
    }

    if (document.body?.dataset.iosObserved !== 'true') {
      document.body.dataset.iosObserved = 'true';
      new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLImageElement) rewriteCoverProxy(node);
            if (node instanceof Element) {
              node.querySelectorAll?.('img[src*="/api/cover"]').forEach(rewriteCoverProxy);
            }
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyIOSUi, { once: true });
  } else {
    applyIOSUi();
  }

  window.dispatchEvent(new CustomEvent('fe-monster-runtime-ready', {
    detail: {
      platform: 'ios',
      mode: 'local',
      serverRequired: false,
      providers: Object.keys(providerNames)
    }
  }));
})();
