(function audioSourceManagerModule() {
  'use strict';

  const API_BASE = '/api/audio-sources';
  const MAX_SCRIPT_BYTES = 512 * 1024;
  const MAX_SOURCES = 20;
  const MAX_HOSTS = 32;
  const INITIALIZATION_REQUIRED_MESSAGE = '脚本需要联网初始化；支持的平台和音质将在确认导入后检测。';
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
  const STATUS_MESSAGES = Object.freeze({
    configured: '配置已保存；尚未确认服务就绪',
    'bundled-upgraded': '已更新内置版本；正在等待服务检查',
    starting: '服务正在启动',
    'startup-timeout': '服务启动超时',
    unreachable: '服务无法连接',
    ready: '服务就绪，播放取决于授权',
    'initialized-unverified': '初始化通过，尚未检测歌曲',
    running: '服务正在运行，播放取决于授权',
    ok: '服务检查通过，播放取决于授权',
    available: '服务已响应，播放取决于授权'
  });
  const ERROR_MESSAGES = Object.freeze({
    AUDIO_SOURCE_HOSTS_INVALID: '允许域名无效：请填写公开的精确域名，且不要使用通配符、IP 或内网地址。',
    AUDIO_SOURCE_HOST_NOT_ALLOWED: '脚本请求的域名不在允许列表中。',
    AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED: '解析得到的音频 CDN 域名不在允许列表中。',
    AUDIO_SOURCE_NETWORK_TIMEOUT: '音源联网请求超时，请稍后重试。',
    AUDIO_SOURCE_NETWORK_FAILED: '音源联网请求失败，请检查网络或服务状态后重试。',
    AUDIO_SOURCE_HTTP_ERROR: '音源服务器返回错误响应，请稍后重试或切换音源。',
    AUDIO_SOURCE_REQUEST_UNSUPPORTED: '脚本使用了当前尚不支持的联网请求方式。',
    AUDIO_SOURCE_RESPONSE_UNSUPPORTED: '音源服务返回了当前无法处理的响应。',
    AUDIO_SOURCE_REDIRECT_BLOCKED: '音源请求发生了不允许的重定向，已停止访问。',
    AUDIO_SOURCE_ADDRESS_BLOCKED: '目标地址不是允许访问的公网地址。',
    AUDIO_SOURCE_RUNTIME_UNAVAILABLE: '隔离脚本运行环境未就绪。',
    AUDIO_SOURCE_SCRIPT_INVALID: '脚本为空、过大或不是有效的 UTF-8 内容。',
    AUDIO_SOURCE_SCRIPT_FAILED: '脚本初始化或解析执行失败。',
    AUDIO_SOURCE_INIT_NETWORK_REQUIRED: '脚本初始化需要联网，请检查并明确确认允许访问的域名后重试。',
    AUDIO_SOURCE_DOWNLOAD_URL_INVALID: '链接必须是公网域名的 HTTPS .js 地址，不能包含账号、密码、非标准端口或片段。',
    AUDIO_SOURCE_DOWNLOAD_FAILED: '未能下载脚本，请检查链接是否直接返回有效的 JavaScript 文件。',
    AUDIO_SOURCE_DOWNLOAD_REDIRECT: '脚本链接发生了重定向，请填写最终的 HTTPS .js 直链。',
    AUDIO_SOURCE_DOWNLOAD_TIMEOUT: '下载脚本超时，请稍后重试。',
    AUDIO_SOURCE_PREVIEW_EXPIRED: '此预览已过期或取消，请重新读取链接。',
    AUDIO_SOURCE_UNSUPPORTED: '此脚本使用了当前 LX 子集尚不支持的能力。',
    AUDIO_SOURCE_UNSUPPORTED_PROVIDER: '当前歌曲平台暂不支持此音源解析。',
    AUDIO_SOURCE_UNSUPPORTED_QUALITY_OR_PROVIDER: '脚本未声明支持当前平台或音质。',
    AUDIO_SOURCE_JSON_REQUIRED: '请求必须使用 JSON 格式。',
    AUDIO_SOURCE_BAD_JSON: '请求 JSON 无效或无法解析。',
    AUDIO_SOURCE_INVALID_REQUEST: '请求 JSON 无效或字段格式不正确。',
    AUDIO_SOURCE_INVALID_UTF8: '请求内容不是有效的 UTF-8。',
    AUDIO_SOURCE_BODY_LIMIT: '请求内容超过大小限制。',
    AUDIO_SOURCE_FIELDS_INVALID: '请求包含缺失或不支持的字段。',
    AUDIO_SOURCE_CONSENT_REQUIRED: '导入前必须明确确认脚本信任与联网范围。',
    AUDIO_SOURCE_LIMIT: '最多只能保存 20 个自定义音源。',
    AUDIO_SOURCE_NOT_FOUND: '该音源不存在或已被移除。',
    AUDIO_SOURCE_TIMEOUT: '脚本执行超时，已停止本次操作。',
    AUDIO_SOURCE_BUSY: '脚本运行环境正忙，请稍后重试。',
    AUDIO_SOURCE_CLOSED: '音源服务正在关闭，请重新打开应用后重试。',
    AUDIO_SOURCE_STORAGE: '本机音源配置无法安全读写。',
    AUDIO_SOURCE_STORAGE_INVALID: '本机音源配置已损坏，无法载入。',
    AUDIO_SOURCE_RESOLVE_FAILED: '未能解析当前歌曲的播放地址。',
    AUDIO_SOURCE_REJECTED: '音源未返回当前歌曲的可用播放地址；请尝试其他音质或音源，或稍后重试。',
    AUDIO_SOURCE_SONG_REQUIRED: '当前没有可检测的歌曲。',
    AUDIO_SOURCE_SONG_INVALID: '当前歌曲元数据无效。',
    AUDIO_SOURCE_SONG_ID_UNSUPPORTED: '当前歌曲缺少此平台所需的标识；酷狗歌曲需要有效 hash。',
    AUDIO_SOURCE_INVALID_URL: '脚本请求或返回的地址不受支持：需使用公网域名的 HTTPS 地址，不能使用数字 IP、特殊端口或带账号密码的地址。',
    AUDIO_SOURCE_MEDIA_UNAVAILABLE: '音频中继当前不可用。',
    AUDIO_SOURCE_FORBIDDEN: '此请求不允许访问本机音源服务。',
    AUDIO_SOURCE_METHOD: '音源服务不支持此请求方式。',
    AUDIO_SOURCE_INTERNAL: '音源服务发生内部错误。',
    AUDIO_SOURCE_INTERRUPTED: '脚本解析已中断。',
    AUDIO_SOURCE_PORT_INVALID: '本机音频中继端口无效。'
  });
  const PROVIDER_DETAILS = Object.freeze({
    netease: Object.freeze({ label: '网易云', source: 'wy' }),
    qq: Object.freeze({ label: 'QQ', source: 'tx' }),
    kugou: Object.freeze({ label: '酷狗', source: 'kg' }),
    qishui: Object.freeze({ label: '汽水', source: 'qishui' })
  });

  let dom = null;
  let initialized = false;
  let openState = false;
  let returnFocus = null;
  let requestController = null;
  let requestRevision = 0;
  let mutationInFlight = false;
  let previewReadInFlight = false;
  let latestPayload = null;
  let pendingScript = '';
  let pendingPreview = null;
  let fileReadRevision = 0;
  let callbacks = {
    getCurrentSong: null,
    importPlatformPackage: null,
    onSelectionChanged: null,
    onBrowseRequested: null,
    getLibraryContext: null,
    onLibraryProviderChanged: null
  };
  let coveredLoginState = null;
  let hostEditor = null;
  const sourceTests = new Map();

  function errorMessage(value, fallback = '操作失败，请稍后重试') {
    const candidate = typeof value === 'string'
      ? value
      : value && typeof value.error === 'string'
        ? value.error
        : value && typeof value.message === 'string'
          ? value.message
          : '';
    const compact = candidate.replace(/[\r\n\t]+/g, ' ').trim();
    if (ERROR_MESSAGES[compact]) return ERROR_MESSAGES[compact];
    if (/^AUDIO_SOURCE_[A-Z_]{1,60}$/.test(compact)) {
      return '音源服务拒绝了该操作，请检查输入后重试。';
    }
    return (compact || fallback).slice(0, 360);
  }

  function normalizeAllowedHosts(value) {
    const rawHosts = String(value || '')
      .split(/[\s,]+/)
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean);
    const hosts = Array.from(new Set(rawHosts));
    if (!hosts.length) throw new Error('请至少填写一个允许联网的精确公网域名。');
    if (hosts.length > MAX_HOSTS) throw new Error(`最多允许填写 ${MAX_HOSTS} 个域名。`);

    hosts.forEach((host) => {
      if (host.includes('*')) throw new Error('允许联网的域名不能包含通配符。');
      if (host.includes('://') || /[\/:?#@]/.test(host)) {
        throw new Error('请只填写精确域名，不要填写协议、端口、路径或查询参数。');
      }
      if (host === 'localhost' || /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(host) || !host.includes('.') || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) {
        throw new Error('只接受精确的公网域名，不接受本机名称或 IP 地址。');
      }
      if (host.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
        throw new Error(`域名格式无效：${host.slice(0, 80)}`);
      }
    });
    return hosts;
  }

  function diagnosticHosts(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.slice(0, MAX_HOSTS).flatMap((host) => {
      if (typeof host !== 'string' || host.length > 254 || !/^[a-z0-9.-]+$/i.test(host)) return [];
      try { return normalizeAllowedHosts(host); } catch (_error) { return []; }
    })));
  }

  function serviceErrorMessage(value, fallback = '音源服务未能完成该操作，请稍后重试。') {
    const code = typeof value === 'string' ? value : value && value.error;
    const status = value && value.httpStatus;
    if (code === 'AUDIO_SOURCE_HTTP_ERROR' && Number.isInteger(status) && status >= 400 && status <= 599) {
      if (status >= 500) return `音源服务器异常（HTTP ${status}），请等待音源服务恢复，或切换其他音源。`;
      if (status === 429) return '音源服务器请求过于频繁（HTTP 429），请稍后重试。';
      if (status === 401 || status === 403) return `音源服务器拒绝访问（HTTP ${status}），请检查音源要求或切换其他音源。`;
      if (status === 404 || status === 410) return `音源接口不存在或已移除（HTTP ${status}），请更新脚本或切换其他音源。`;
      return `音源服务器拒绝了请求（HTTP ${status}），请检查音源脚本或稍后重试。`;
    }
    return typeof code === 'string' && typeof ERROR_MESSAGES[code] === 'string' ? ERROR_MESSAGES[code] : fallback;
  }

  function requiredTestHosts(value) {
    const code = value && (value.error || value.code);
    return code === 'AUDIO_SOURCE_HOST_NOT_ALLOWED' || code === 'AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED'
      ? diagnosticHosts(value.requiredHosts) : [];
  }

  async function readScriptFile(file) {
    if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.js')) {
      throw new Error('请选择一个 .js 音源脚本。');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('音源脚本为空。');
    if (file.size > MAX_SCRIPT_BYTES) throw new Error('音源脚本不能超过 512 KiB。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_SCRIPT_BYTES) throw new Error('音源脚本不能超过 512 KiB。');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_error) {
      throw new Error('音源脚本必须使用有效的 UTF-8 编码。');
    }
  }

  async function requestJson(path, body, signal) {
    const options = {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal
    };
    if (body !== undefined) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await window.fetch(`${API_BASE}${path}`, options);
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error('本地音源服务未连接，暂时无法读取或更改音源。');
    }
    // These routes do not identify a saved source. Older backends can return
    // AUDIO_SOURCE_NOT_FOUND for the missing URL-import route itself.
    const urlImportEndpoint = path === '/preview-url' || path === '/import-preview';
    if (response.status === 404 && (urlImportEndpoint || path === '' && body === undefined)) {
      const mismatch = new Error(urlImportEndpoint
        ? '当前后台版本不含音源链接导入接口，请更新并重启客户端，再重新读取链接。'
        : '当前后台版本不含音源管理接口，请更新并重启客户端，再点击“重新连接”。');
      mismatch.code = 'AUDIO_SOURCE_BACKEND_OUTDATED';
      throw mismatch;
    }
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`本地音源服务返回了无法识别的响应（HTTP ${response.status}）。`);
    }
    if (!response.ok || !payload || payload.ok !== true) {
      const error = new Error(serviceErrorMessage(payload, `音源服务请求失败（HTTP ${response.status}）`));
      if (payload && typeof payload.error === 'string' && /^AUDIO_SOURCE_[A-Z_]{1,60}$/.test(payload.error)) error.code = payload.error;
      error.requiredHosts = requiredTestHosts(payload);
      throw error;
    }
    return payload;
  }

  function importSource(script, allowedHosts, signal, apply = false) {
    return requestJson('/import', { script, allowedHosts, consent: true, ...(apply ? { apply: true } : {}) }, signal);
  }

  function previewSourceUrl(url, signal) {
    return requestJson('/preview-url', { url }, signal);
  }

  function importPreviewSource(token, allowedHosts, apply, signal) {
    return requestJson('/import-preview', { token, allowedHosts, consent: true, apply }, signal);
  }

  function getSelectedSource() {
    if (!latestPayload) return null;
    if (latestPayload.selected === 'builtin') {
      return { id: 'builtin', name: '内置音源', builtin: true, supportedProviders: Object.keys(PROVIDER_DETAILS), capabilities: {} };
    }
    const item = asItems(latestPayload.custom).find((source) => source.id === latestPayload.selected);
    if (!item) return null;
    return JSON.parse(JSON.stringify({ ...item, builtin: false }));
  }

  async function notifySelectionChanged() {
    if (callbacks.onSelectionChanged) {
      await callbacks.onSelectionChanged(getSelectedSource());
    }
  }

  function libraryProviders() {
    const source = getSelectedSource();
    let context = null;
    try { context = callbacks.getLibraryContext && callbacks.getLibraryContext(); } catch (_error) {}
    const supported = new Set(source && Array.isArray(source.supportedProviders) ? source.supportedProviders : []);
    const providers = context && Array.isArray(context.providers) ? context.providers : [];
    return {
      provider: context && context.provider,
      providers: providers.filter((item) => item && PROVIDER_DETAILS[item.id] && supported.has(item.id))
    };
  }

  function renderLibraryContext() {
    if (!dom || !dom.libraryProvider) return;
    const source = getSelectedSource();
    const context = libraryProviders();
    dom.libraryProvider.replaceChildren();
    context.providers.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${bounded(item.label, PROVIDER_DETAILS[item.id].label, 40)}${item.configured ? '' : item.localLibraryAvailable ? '（洛雪导入）' : '（未配置）'}`;
      option.disabled = !item.configured && !item.localLibraryAvailable;
      dom.libraryProvider.appendChild(option);
    });
    const available = context.providers.some((item) => item.configured || item.localLibraryAvailable);
    if (!context.providers.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = source ? '没有支持的平台' : '尚未读取音源';
      dom.libraryProvider.appendChild(option);
    }
    if (context.providers.some((item) => item.id === context.provider)) dom.libraryProvider.value = context.provider;
    else dom.libraryProvider.selectedIndex = available ? -1 : 0;
    dom.libraryStatus.textContent = !source ? '连接音源服务后可选择歌单平台。'
      : !available ? '此音源暂无已配置的歌单平台，请先配置对应平台的目录服务。'
        : `正在使用：${bounded(source.name, '当前音源', 100)}。歌单栏与歌曲栏仅显示所选平台的内容；LX 脚本负责播放解析，歌单来自平台服务或本机导入的洛雪歌单。`;
    updateOperationAvailability();
  }

  async function handleLibraryProviderChange() {
    if (mutationInFlight || !callbacks.onLibraryProviderChanged) return;
    const provider = dom.libraryProvider.value;
    if (!libraryProviders().providers.some((item) => item.id === provider && item.configured)) {
      renderLibraryContext();
      return;
    }
    const task = beginRequest('正在切换歌单平台…', true);
    setLiveStatus('正在切换歌单平台…');
    try {
      await callbacks.onLibraryProviderChanged(provider);
      if (!requestIsCurrent(task.revision)) return;
      renderLibraryContext();
      setLiveStatus('歌单平台已切换。', 'success');
    } catch (error) {
      if (!requestIsCurrent(task.revision)) return;
      renderLibraryContext();
      setLiveStatus(errorMessage(error, '无法切换歌单平台，请稍后重试。'), 'error');
    } finally {
      finishRequest(task.revision);
    }
  }

  function browseSelectedSource() {
    if (!callbacks.onBrowseRequested || mutationInFlight || !getSelectedSource()) return;
    const source = getSelectedSource();
    close();
    try { Promise.resolve(callbacks.onBrowseRequested(source)).catch(() => {}); } catch (_error) {}
  }

  function selectSource(id, signal) {
    return requestJson('/select', { id }, signal);
  }

  function removeSource(id, signal) {
    return requestJson('/remove', { id }, signal);
  }

  function updateSourceHosts(id, allowedHosts, signal) {
    return requestJson(`/${encodeURIComponent(id)}/hosts`, { allowedHosts, consent: true }, signal);
  }

  function testSource(id, current, signal) {
    if (!current || typeof current !== 'object' || !current.provider || !current.song) {
      return Promise.reject(new Error('当前没有可用于检测的歌曲。'));
    }
    return requestJson('/test', {
      id,
      provider: current.provider,
      song: current.song,
      quality: current.quality
    }, signal);
  }

  function asItems(value) {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).map(([id, entry]) => {
      if (entry && typeof entry === 'object') return { id, ...entry };
      return { id, status: entry };
    });
  }

  function bounded(value, fallback, max = 120) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    return (text || fallback).slice(0, max);
  }

  function appendText(parent, tagName, text, className) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function isReadyStatus(item) {
    const status = bounded(item && item.status, '', 48).toLowerCase();
    return item && item.ready === true || ['ready', 'running', 'ok', 'available'].includes(status);
  }

  function statusMessage(value, fallback) {
    const status = bounded(value, '', 120).toLowerCase();
    return STATUS_MESSAGES[status] || bounded(value, fallback, 160);
  }

  function builtinStatus(item) {
    const normalizedStatus = bounded(item && item.status, '', 120).toLowerCase();
    if (STATUS_MESSAGES[normalizedStatus]) return STATUS_MESSAGES[normalizedStatus];
    const detail = item && (item.detail || item.error);
    if (detail) return errorMessage(detail, statusMessage(item.status, '尚未确认服务就绪'));
    return statusMessage(item && item.status, item && item.ready === true
      ? '服务就绪，播放取决于授权'
      : '尚未确认服务就绪');
  }

  function customStatus(item) {
    return statusMessage(item && item.status, '状态未报告');
  }

  function customCapabilityLines(item) {
    const capabilities = item && item.capabilities && typeof item.capabilities === 'object' && !Array.isArray(item.capabilities)
      ? item.capabilities
      : {};
    const declaredProviders = Array.isArray(item && item.supportedProviders)
      ? item.supportedProviders.map((value) => bounded(value, '', 30)).filter(Boolean)
      : [];
    const inferredProviders = Object.entries(PROVIDER_DETAILS)
      .filter(([, details]) => capabilities[details.source] && typeof capabilities[details.source] === 'object')
      .map(([provider]) => provider);
    const providers = Array.from(new Set([...declaredProviders, ...inferredProviders]));
    return providers.map((provider) => {
      const details = PROVIDER_DETAILS[provider] || { label: bounded(provider, '未知平台', 30), source: provider };
      const capability = capabilities[details.source] && typeof capabilities[details.source] === 'object'
        ? capabilities[details.source]
        : {};
      const actions = Array.isArray(capability.actions) ? capability.actions : [];
      const qualitys = Array.isArray(capability.qualitys)
        ? capability.qualitys.map((value) => bounded(value, '', 24)).filter(Boolean)
        : [];
      const features = [];
      if (actions.includes('musicUrl')) features.push('播放解析');
      if (!features.length) features.push('未声明播放能力');
      if (qualitys.length) features.push(qualitys.join(' / '));
      return `${details.label}：${features.join(' · ')}`;
    });
  }

  function setLiveStatus(message, kind = '') {
    if (!dom) return;
    dom.liveStatus.textContent = message;
    dom.liveStatus.dataset.kind = kind;
  }

  function setBusy(busy, message) {
    if (!dom) return;
    dom.dialog.setAttribute('aria-busy', String(busy));
    dom.busy.hidden = !busy;
    dom.busy.textContent = busy ? message : '';
    updateOperationAvailability(busy);
    // Disabling the focused submit button can move focus to the document body.
    if (openState && typeof dom.dialog.contains === 'function' && !dom.dialog.contains(document.activeElement)) {
      dom.panel.focus({ preventScroll: true });
    }
  }

  function updateOperationAvailability(busy = false) {
    if (!dom) return;
    busy = busy || Boolean(requestController) || mutationInFlight;
    const backendAvailable = latestPayload !== null;
    const runtimeReady = latestPayload && latestPayload.runtimeReady === true;
    const customCount = latestPayload ? asItems(latestPayload.custom).length : 0;
    dom.reconnect.disabled = busy;
    dom.importSubmit.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES || !(pendingScript || pendingPreview);
    dom.scriptChoose.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES;
    dom.hosts.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES;
    dom.consent.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES;
    if (dom.url) dom.url.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES;
    if (dom.urlRead) dom.urlRead.disabled = busy || !backendAvailable || !runtimeReady || customCount >= MAX_SOURCES;
    if (dom.apply) dom.apply.disabled = busy || !backendAvailable || !runtimeReady;
    if (dom.cancelPreview) {
      dom.cancelPreview.hidden = !(pendingScript || pendingPreview || previewReadInFlight);
      dom.cancelPreview.disabled = mutationInFlight || !busy && !(pendingScript || pendingPreview);
    }
    if (dom.browse) dom.browse.disabled = busy || !backendAvailable || !callbacks.onBrowseRequested;
    if (dom.libraryProvider) dom.libraryProvider.disabled = busy || !backendAvailable
      || !callbacks.onLibraryProviderChanged || !libraryProviders().providers.some((item) => item.configured);
    dom.importSubmit.textContent = dom.apply && dom.apply.checked ? '导入并应用' : '仅导入';
    dom.platformImport.disabled = busy;
    dom.dialog.querySelectorAll('[data-audio-source-host-field]').forEach((field) => {
      field.disabled = busy || !backendAvailable;
    });
    dom.dialog.querySelectorAll('[data-audio-source-operation]').forEach((button) => {
      const customOnly = button.dataset.customOnly === 'true';
      const testOnly = button.dataset.testAction === 'true';
      button.disabled = operationDisabled({
        busy,
        backendAvailable,
        runtimeReady,
        selected: button.dataset.selectedAction === 'true',
        customOnly,
        testOnly,
        hasCurrentSong: Boolean(callbacks.getCurrentSong)
      });
      if (testOnly && !callbacks.getCurrentSong) button.title = '进入播放器后可检测当前歌曲';
    });
  }

  function operationDisabled(options) {
    return options.busy || !options.backendAvailable
      || options.customOnly && !options.runtimeReady
      || options.testOnly && !options.hasCurrentSong;
  }

  function createActionButton(label, action, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.audioSourceOperation = 'true';
    if (options.className) button.className = options.className;
    if (options.customOnly) button.dataset.customOnly = 'true';
    if (options.testAction) button.dataset.testAction = 'true';
    button.addEventListener('click', action);
    return button;
  }

  function renderBuiltins(payload) {
    dom.builtinList.replaceChildren();
    const items = asItems(payload.builtins);
    if (!items.length) {
      appendText(dom.builtinList, 'p', '服务未返回内置平台状态，当前不能确认平台是否就绪。', 'audio-source-empty');
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('li');
      const copy = document.createElement('span');
      appendText(copy, 'strong', bounded(item.name || item.label || item.id, '未命名平台', 80));
      appendText(copy, 'small', builtinStatus(item));
      row.appendChild(copy);
      const badge = appendText(row, 'em', isReadyStatus(item) ? '服务就绪' : '未就绪');
      badge.dataset.ready = String(isReadyStatus(item));
      dom.builtinList.appendChild(row);
    });
  }

  function renderCustom(payload) {
    dom.customList.replaceChildren();
    const items = asItems(payload.custom);
    dom.customCount.textContent = `${items.length} / ${MAX_SOURCES}`;
    if (!items.length) {
      appendText(dom.customList, 'p', '还没有导入自定义音源。勾选“导入后立即应用”可在导入时启用。', 'audio-source-empty');
      return;
    }
    items.forEach((item) => {
      const id = bounded(item.id, '', 180);
      if (!id || id === 'builtin') return;
      const card = document.createElement('article');
      card.className = 'audio-source-card';
      card.dataset.sourceId = id;
      card.dataset.selected = String(payload.selected === id);
      const head = document.createElement('header');
      const copy = document.createElement('span');
      appendText(copy, 'strong', bounded(item.name, '未命名 LX 音源', 100));
      const byline = [bounded(item.version, '', 40), bounded(item.author, '', 80)].filter(Boolean).join(' · ');
      appendText(copy, 'small', byline || '未提供版本与作者');
      head.appendChild(copy);
      appendText(head, 'em', payload.selected === id ? '正在使用' : '未使用');
      card.appendChild(head);

      const capabilityLines = customCapabilityLines(item);
      appendText(card, 'p', capabilityLines.length ? capabilityLines.join('；') : '播放能力：未声明', 'audio-source-card-capabilities');
      const allowedHosts = Array.isArray(item.allowedHosts)
        ? item.allowedHosts.map((value) => bounded(value, '', 253)).filter(Boolean).slice(0, MAX_HOSTS)
        : [];
      appendText(card, 'p', `联网域名：${allowedHosts.length ? allowedHosts.join(' / ') : '未声明'}`, 'audio-source-card-hosts');
      appendText(card, 'p', `状态：${customStatus(item)}`, 'audio-source-card-status');
      const test = sourceTests.get(id);
      if (test) {
        const result = appendText(card, 'p', test.message, 'audio-source-card-test');
        result.dataset.kind = test.kind;
        if (test.requiredHosts.length) {
          appendText(card, 'p', `需确认的联网域名：${test.requiredHosts.join(' / ')}。请通过“联网设置”核实并手动填写。`, 'audio-source-card-required-hosts');
        }
      }

      const actions = document.createElement('div');
      actions.className = 'audio-source-card-actions';
      const selectButton = createActionButton(payload.selected === id ? '正在使用' : '使用此音源', () => handleSelect(id), { customOnly: payload.selected !== id });
      selectButton.dataset.selectedAction = String(payload.selected === id);
      if (payload.selected === id) selectButton.title = '浏览此音源的歌单与歌曲';
      actions.appendChild(selectButton);
      actions.appendChild(createActionButton('检测当前歌曲', () => handleTest(id), { customOnly: true, testAction: true }));
      const settingsButton = createActionButton('联网设置', () => handleHostSettings(item));
      settingsButton.dataset.hostSettings = 'true';
      settingsButton.setAttribute('aria-expanded', String(hostEditor && hostEditor.id === id || false));
      actions.appendChild(settingsButton);
      actions.appendChild(createActionButton('移除', () => handleRemove(id, bounded(item.name, '该脚本', 100)), { className: 'is-danger' }));
      card.appendChild(actions);
      if (hostEditor && hostEditor.id === id) renderHostEditor(card, id);
      dom.customList.appendChild(card);
    });
  }

  function focusHostSettings(id) {
    const card = Array.from(dom.customList.querySelectorAll('.audio-source-card')).find((node) => node.dataset.sourceId === id);
    const button = card && card.querySelector('[data-host-settings]');
    if (button) button.focus();
  }

  function handleHostSettings(item) {
    const id = bounded(item.id, '', 180);
    hostEditor = { id, value: diagnosticHosts(item.allowedHosts).join('\n'), consent: false };
    renderCustom(latestPayload);
    updateOperationAvailability(false);
    const field = dom.customList.querySelector('.audio-source-host-editor textarea');
    if (field) field.focus();
  }

  function renderHostEditor(card, id) {
    const form = document.createElement('form');
    form.className = 'audio-source-host-editor';
    appendText(form, 'strong', '联网设置');
    appendText(form, 'p', '只预填已批准的域名。请核实脚本请求的域名，手动修改后重新确认授权。保存后需重新检测歌曲。');
    const label = document.createElement('label');
    label.className = 'audio-source-field';
    appendText(label, 'span', '允许联网的精确域名');
    const hosts = document.createElement('textarea');
    hosts.value = hostEditor.value;
    hosts.rows = 3;
    hosts.maxLength = MAX_HOSTS * 255;
    hosts.spellcheck = false;
    hosts.dataset.audioSourceHostField = 'true';
    label.appendChild(hosts);
    appendText(label, 'small', '每行一个域名，最多 32 个；不接受 URL、通配符、IP 或内网地址。');
    form.appendChild(label);
    const consentLabel = document.createElement('label');
    consentLabel.className = 'audio-source-consent';
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    consent.checked = hostEditor.consent;
    consent.dataset.audioSourceHostField = 'true';
    consentLabel.appendChild(consent);
    appendText(consentLabel, 'span', '我信任此脚本，并同意它仅访问以上所列域名。');
    form.appendChild(consentLabel);
    hosts.addEventListener('input', () => {
      hostEditor.value = hosts.value;
      hostEditor.consent = false;
      consent.checked = false;
    });
    consent.addEventListener('change', () => { hostEditor.consent = consent.checked; });
    const actions = document.createElement('div');
    actions.className = 'audio-source-card-actions';
    const save = createActionButton('保存联网设置', () => {}, { className: 'is-primary' });
    save.type = 'submit';
    actions.appendChild(save);
    actions.appendChild(createActionButton('取消', () => {
      hostEditor = null;
      renderCustom(latestPayload);
      updateOperationAvailability(false);
      focusHostSettings(id);
    }));
    form.appendChild(actions);
    form.addEventListener('submit', (event) => handleSaveHosts(event, id, hosts, consent));
    card.appendChild(form);
  }

  async function handleSaveHosts(event, id, hosts, consent) {
    event.preventDefault();
    if (mutationInFlight || !hostEditor || hostEditor.id !== id) return;
    if (!consent.checked) {
      setLiveStatus('请重新确认你信任该脚本，并同意它仅访问以上所列域名。', 'error');
      consent.focus();
      return;
    }
    let allowedHosts;
    try { allowedHosts = normalizeAllowedHosts(hosts.value); }
    catch (error) { setLiveStatus(errorMessage(error), 'error'); hosts.focus(); return; }
    const completed = await runPayloadAction('正在保存联网设置…', (signal) => updateSourceHosts(id, allowedHosts, signal),
      '联网设置已保存。请重新检测当前歌曲以确认解析结果。', () => {
        hostEditor = null;
        sourceTests.set(id, { message: '联网设置已更新，请重新检测当前歌曲。', kind: 'warning', requiredHosts: [] });
      });
    if (completed) focusHostSettings(id);
  }

  async function renderPayload(payload) {
    latestPayload = payload;
    dom.runtimeState.dataset.ready = String(payload.runtimeReady === true);
    dom.runtimeState.textContent = payload.runtimeReady === true
      ? '自定义脚本隔离运行环境已就绪。内置服务就绪也不代表每首歌曲都能播放。'
      : '自定义脚本运行环境未就绪；内置音源仍按各平台实际状态工作。';
    dom.builtinCard.dataset.selected = String(payload.selected === 'builtin');
    dom.builtinSelected.textContent = payload.selected === 'builtin' ? '正在使用' : '未使用';
    dom.builtinSelect.dataset.selectedAction = String(payload.selected === 'builtin');
    dom.builtinSelect.textContent = payload.selected === 'builtin' ? '正在使用' : '使用内置音源';
    dom.builtinSelect.title = payload.selected === 'builtin' ? '浏览内置音源的歌单与歌曲' : '';
    renderBuiltins(payload);
    renderCustom(payload);
    updateOperationAvailability(false);
    await notifySelectionChanged();
    renderLibraryContext();
  }

  function beginRequest(message, mutation = false, previewRead = false) {
    if (requestController) requestController.abort();
    requestController = new AbortController();
    const revision = ++requestRevision;
    mutationInFlight = mutation;
    previewReadInFlight = previewRead;
    setBusy(true, message);
    return { controller: requestController, revision };
  }

  function requestIsCurrent(revision, allowClosed = false) {
    return (openState || allowClosed) && revision === requestRevision;
  }

  function finishRequest(revision) {
    if (!requestIsCurrent(revision, true)) return;
    requestController = null;
    mutationInFlight = false;
    previewReadInFlight = false;
    setBusy(false, '');
  }

  async function refresh() {
    if (!initialize()) return null;
    const task = beginRequest('正在读取音源配置…');
    setLiveStatus('正在连接本地音源服务…');
    try {
      const payload = await requestJson('', undefined, task.controller.signal);
      if (!requestIsCurrent(task.revision, true)) return null;
      await renderPayload(payload);
      if (!requestIsCurrent(task.revision, true)) return null;
      setLiveStatus('音源配置已同步。');
      return getSelectedSource();
    } catch (error) {
      if (!requestIsCurrent(task.revision, true) || error && error.name === 'AbortError') return null;
      latestPayload = null;
      try { await notifySelectionChanged(); } catch (_error) {}
      if (!requestIsCurrent(task.revision, true)) return null;
      renderLibraryContext();
      dom.runtimeState.dataset.ready = 'false';
      dom.runtimeState.textContent = error && error.code === 'AUDIO_SOURCE_BACKEND_OUTDATED'
        ? '页面与后台版本不匹配：当前后台没有音源管理接口。更新并重启后，可点击“重新连接”。'
        : '本地音源服务未连接。列表仅作说明，选择、导入、移除和检测均已停用。';
      dom.builtinList.replaceChildren();
      dom.customList.replaceChildren();
      appendText(dom.builtinList, 'p', '无法读取内置平台状态。', 'audio-source-empty');
      appendText(dom.customList, 'p', '无法读取已导入脚本。', 'audio-source-empty');
      dom.customCount.textContent = `— / ${MAX_SOURCES}`;
      setLiveStatus(errorMessage(error, '本地音源服务未连接。'), 'error');
    } finally {
      finishRequest(task.revision);
    }
  }

  async function runPayloadAction(message, action, successMessage, onSuccess) {
    const task = beginRequest(message, true);
    setLiveStatus(message);
    try {
      const payload = await action(task.controller.signal);
      if (!requestIsCurrent(task.revision)) return false;
      if (onSuccess) onSuccess();
      await renderPayload(payload);
      if (!requestIsCurrent(task.revision)) return false;
      setLiveStatus(successMessage, 'success');
      return true;
    } catch (error) {
      if (!requestIsCurrent(task.revision) || error && error.name === 'AbortError') return false;
      setLiveStatus(errorMessage(error), 'error');
      return false;
    } finally {
      finishRequest(task.revision);
    }
  }

  async function handleSelect(id) {
    if (mutationInFlight || requestController) return false;
    if (latestPayload && latestPayload.selected === id) {
      browseSelectedSource();
      return true;
    }
    const completed = await runPayloadAction('正在切换音源…', (signal) => selectSource(id, signal),
      id === 'builtin' ? '已恢复使用内置音源。' : '已使用此音源，歌单与歌曲已同步。');
    if (completed && openState) browseSelectedSource();
    return completed;
  }

  async function handleRemove(id, name) {
    if (!window.confirm(`确定移除“${name}”的导入副本吗？不会删除你原来的文件。`)) return false;
    return runPayloadAction('正在移除音源…', (signal) => removeSource(id, signal), '已移除导入副本。');
  }

  async function handleTest(id) {
    if (!callbacks.getCurrentSong) {
      setLiveStatus('进入播放器后才可检测当前歌曲。', 'error');
      return false;
    }
    let current;
    try {
      current = await callbacks.getCurrentSong();
    } catch (error) {
      setLiveStatus(errorMessage(error, '无法读取当前歌曲。'), 'error');
      return false;
    }
    const task = beginRequest('正在检测当前歌曲…');
    setLiveStatus('正在检测当前歌曲的解析结果…');
    try {
      const result = await testSource(id, current, task.controller.signal);
      if (!requestIsCurrent(task.revision)) return false;
      const effectiveQuality = testQualityLabel(result.effectiveQuality);
      const qualityNote = result.qualityFallback === true && effectiveQuality
        ? `已按此音源支持的音质调整为 ${effectiveQuality}。` : '';
      if (result.resolved === true && result.playable === true) {
        showTestResult(id, `${qualityNote}仅完成解析检测：服务报告地址可播放，但不代表已实际播放。`, 'success');
      } else if (result.resolved === true) {
        showTestResult(id, `${qualityNote}仅完成解析检测：已解析，但服务未确认可播放。${result.error ? ` ${serviceErrorMessage(result)}` : ''}`, 'warning', requiredTestHosts(result));
      } else {
        showTestResult(id, `${qualityNote}解析检测未通过：${serviceErrorMessage(result, '未获得播放地址')}`, 'error', requiredTestHosts(result));
      }
      return result.resolved === true;
    } catch (error) {
      if (!requestIsCurrent(task.revision) || error && error.name === 'AbortError') return false;
      showTestResult(id, errorMessage(error), 'error', requiredTestHosts(error));
      return false;
    } finally {
      finishRequest(task.revision);
    }
  }

  function testQualityLabel(quality) {
    return ({ standard: '128k', normal: '128k', '128': '128k', '128k': '128k', higher: '192k', '192': '192k', '192k': '192k',
      exhigh: '320k', high: '320k', '320': '320k', '320k': '320k', lossless: 'FLAC', flac: 'FLAC',
      hires: 'Hi-Res', flac24bit: 'Hi-Res', wav: 'WAV', ape: 'APE', full: '完整音源' })[quality] || '';
  }

  function showTestResult(id, message, kind, requiredHosts = []) {
    sourceTests.set(id, { message, kind, requiredHosts });
    setLiveStatus(message + (requiredHosts.length ? ` 需确认的联网域名：${requiredHosts.join(' / ')}。请打开该音源的“联网设置”。` : ''), kind);
    renderCustom(latestPayload);
  }

  async function handleScriptChoice() {
    const [file] = Array.from(dom.scriptInput.files || []);
    clearPendingImport();
    if (file && dom.url) dom.url.value = '';
    const revision = ++fileReadRevision;
    dom.scriptInput.value = '';
    updateOperationAvailability(false);
    if (!file) {
      dom.fileState.textContent = '尚未选择脚本';
      updateOperationAvailability(false);
      return;
    }
    dom.fileState.textContent = '正在检查文件…';
    try {
      const script = await readScriptFile(file);
      if (!openState || revision !== fileReadRevision) return;
      pendingScript = script;
      dom.fileState.textContent = `${bounded(file.name, '音源脚本', 120)} · ${file.size} 字节 · UTF-8`;
      setLiveStatus('脚本已在本地读取；确认信任范围后方可导入。');
    } catch (error) {
      if (!openState || revision !== fileReadRevision) return;
      dom.fileState.textContent = errorMessage(error);
      setLiveStatus(errorMessage(error), 'error');
    }
    updateOperationAvailability(false);
  }

  function clearPendingImport() {
    fileReadRevision += 1;
    pendingScript = '';
    pendingPreview = null;
    if (!dom) return;
    dom.consent.checked = false;
    dom.fileState.textContent = '尚未选择脚本';
    if (dom.preview) { dom.preview.replaceChildren(); dom.preview.hidden = true; }
  }

  function cancelPendingImport(message = '已取消预览，当前音源未更改。') {
    if (mutationInFlight) return;
    requestRevision += 1;
    if (requestController) requestController.abort();
    requestController = null;
    previewReadInFlight = false;
    clearPendingImport();
    setBusy(false, '');
    if (message) setLiveStatus(message);
  }

  async function handleUrlRead() {
    const url = dom.url && dom.url.value.trim();
    clearPendingImport();
    if (!url) { updateOperationAvailability(false); setLiveStatus('请填写 HTTPS .js 脚本直链。', 'error'); return; }
    const task = beginRequest('正在读取链接并预览脚本…', false, true);
    setLiveStatus('正在下载与检查脚本；预览不会授予联网权限。');
    try {
      const result = await previewSourceUrl(url, task.controller.signal);
      if (!requestIsCurrent(task.revision)) return;
      if (!result.preview || typeof result.preview.token !== 'string') throw new Error('服务返回的脚本预览无效。');
      pendingPreview = result.preview;
      const initializationRequired = pendingPreview.initializationRequired === true || pendingPreview.status === 'awaiting-network-consent';
      dom.fileState.textContent = `链接脚本 · ${Number(pendingPreview.bytes) || 0} 字节 · UTF-8`;
      if (dom.preview) {
        dom.preview.hidden = false;
        appendText(dom.preview, 'strong', bounded(pendingPreview.name, '未命名 LX 音源'));
        appendText(dom.preview, 'p', [bounded(pendingPreview.version, '', 40), bounded(pendingPreview.author, '', 80)].filter(Boolean).join(' · ') || '未提供版本与作者');
        appendText(dom.preview, 'p', initializationRequired
          ? INITIALIZATION_REQUIRED_MESSAGE
          : customCapabilityLines(pendingPreview).join('；') || '未声明支持的平台');
        appendText(dom.preview, 'p', `下载域名：${bounded(pendingPreview.sourceHost, '未知', 253)}；预览十分钟内有效。`);
        if (initializationRequired) {
          const requiredHosts = diagnosticHosts(pendingPreview.requiredHosts);
          appendText(dom.preview, 'p', requiredHosts.length
            ? `初始化需确认的联网域名：${requiredHosts.join(' / ')}`
            : '初始化需要的联网域名尚未确定，请向脚本提供者核实。');
          appendText(dom.preview, 'p', '如同意，可将上述域名复制到“允许联网的精确域名”中；请同时核实脚本使用的解析服务与音频域名，再勾选信任确认。下载域名不会自动获得权限。');
        } else {
          appendText(dom.preview, 'p', '预览只声明播放解析能力。请填写脚本实际访问的解析服务与音频域名；下载域名不会自动获得权限。');
        }
      }
      setLiveStatus(initializationRequired
        ? `${INITIALIZATION_REQUIRED_MESSAGE}请确认域名与信任范围后再导入。`
        : '预览已就绪。检查平台与音质后，确认信任范围再导入。', initializationRequired ? 'warning' : 'success');
    } catch (error) {
      if (!requestIsCurrent(task.revision) || error && error.name === 'AbortError') return;
      clearPendingImport();
      setLiveStatus(errorMessage(error), 'error');
    } finally { finishRequest(task.revision); }
  }

  async function handleImport(event) {
    event.preventDefault();
    if (!pendingScript && !pendingPreview) {
      setLiveStatus('请先读取脚本链接，或选择一个有效的 UTF-8 .js 文件。', 'error');
      return;
    }
    if (!dom.consent.checked) {
      setLiveStatus('请明确确认你信任该脚本，并同意它仅访问所列域名。', 'error');
      return;
    }
    let hosts;
    try {
      hosts = normalizeAllowedHosts(dom.hosts.value);
    } catch (error) {
      setLiveStatus(errorMessage(error), 'error');
      dom.hosts.focus();
      return;
    }
    const apply = Boolean(dom.apply && dom.apply.checked);
    const preview = pendingPreview;
    const script = pendingScript;
    const completed = await runPayloadAction(apply ? '正在导入并应用音源…' : '正在导入音源脚本…',
      (signal) => preview ? importPreviewSource(preview.token, hosts, apply, signal) : importSource(script, hosts, signal, apply),
      apply ? '脚本已导入并应用。可以打开“浏览歌单与歌曲”查看支持的平台。' : '脚本已导入，但不会自动切换；仍需手动选择后才用于播放。');
    if (completed) {
      clearPendingImport();
      dom.hosts.value = '';
      dom.consent.checked = false;
      updateOperationAvailability(false);
    }
  }

  async function handlePlatformImport() {
    if (!callbacks.importPlatformPackage) return;
    dom.platformInput.click();
  }

  async function handlePlatformFileChoice() {
    const [file] = Array.from(dom.platformInput.files || []);
    dom.platformInput.value = '';
    if (!file || !callbacks.importPlatformPackage) return;
    dom.platformImport.disabled = true;
    setLiveStatus('正在导入平台配置…');
    try {
      const result = await callbacks.importPlatformPackage(file);
      if (result && result.ok === false) {
        if (result.cancelled === true) {
          if (openState) setLiveStatus(errorMessage(result, '已取消平台配置导入。'), 'warning');
          return;
        }
        throw new Error(errorMessage(result, '平台配置导入失败。'));
      }
      if (openState) setLiveStatus('平台配置已导入；它不会更改当前音源选择。', 'success');
    } catch (error) {
      if (openState) setLiveStatus(errorMessage(error, '平台配置导入失败。'), 'error');
    } finally {
      if (openState) updateOperationAvailability(false);
    }
  }

  function trapFocus(event) {
    if (!openState) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dom.dialog.querySelectorAll(FOCUSABLE)).filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dom.panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function initialize() {
    if (initialized) return true;
    const dialog = document.getElementById('audioSourceDialog');
    const launch = document.getElementById('audioSourceManagerButton');
    if (!dialog || !launch) return false;
    dom = {
      dialog,
      launch,
      panel: document.getElementById('audioSourcePanel'),
      close: document.getElementById('audioSourceClose'),
      reconnect: document.getElementById('audioSourceReconnect'),
      busy: document.getElementById('audioSourceBusy'),
      liveStatus: document.getElementById('audioSourceLiveStatus'),
      runtimeState: document.getElementById('audioSourceRuntimeState'),
      libraryProvider: document.getElementById('audioSourceLibraryProvider'),
      libraryStatus: document.getElementById('audioSourceLibraryStatus'),
      builtinCard: document.getElementById('audioSourceBuiltinCard'),
      builtinSelected: document.getElementById('audioSourceBuiltinSelected'),
      builtinSelect: document.getElementById('audioSourceSelectBuiltin'),
      builtinList: document.getElementById('audioSourceBuiltinList'),
      customList: document.getElementById('audioSourceCustomList'),
      customCount: document.getElementById('audioSourceCustomCount'),
      scriptChoose: document.getElementById('audioSourceScriptChoose'),
      scriptInput: document.getElementById('audioSourceScriptInput'),
      fileState: document.getElementById('audioSourceFileState'),
      url: document.getElementById('audioSourceUrl'),
      urlRead: document.getElementById('audioSourceUrlRead'),
      preview: document.getElementById('audioSourcePreview'),
      apply: document.getElementById('audioSourceApply'),
      cancelPreview: document.getElementById('audioSourceCancelPreview'),
      browse: document.getElementById('audioSourceBrowse'),
      hosts: document.getElementById('audioSourceHosts'),
      consent: document.getElementById('audioSourceConsent'),
      importForm: document.getElementById('audioSourceImportForm'),
      importSubmit: document.getElementById('audioSourceImportSubmit'),
      platformImport: document.getElementById('audioSourcePlatformImport'),
      platformInput: document.getElementById('audioSourcePlatformInput')
    };
    dom.launch.addEventListener('click', () => open(dom.launch));
    dom.close.addEventListener('click', close);
    dom.reconnect.addEventListener('click', refresh);
    dom.dialog.querySelector('[data-audio-source-close]').addEventListener('click', close);
    dom.dialog.addEventListener('click', (event) => event.stopPropagation());
    dom.dialog.addEventListener('keydown', trapFocus);
    dom.scriptChoose.addEventListener('click', () => dom.scriptInput.click());
    dom.scriptInput.addEventListener('change', handleScriptChoice);
    if (dom.urlRead) dom.urlRead.addEventListener('click', handleUrlRead);
    if (dom.url) dom.url.addEventListener('input', () => cancelPendingImport(''));
    if (dom.cancelPreview) dom.cancelPreview.addEventListener('click', () => cancelPendingImport());
    if (dom.apply) dom.apply.addEventListener('change', () => updateOperationAvailability(false));
    dom.hosts.addEventListener('input', () => { dom.consent.checked = false; });
    if (dom.browse) dom.browse.addEventListener('click', browseSelectedSource);
    if (dom.libraryProvider) dom.libraryProvider.addEventListener('change', handleLibraryProviderChange);
    dom.importForm.addEventListener('submit', handleImport);
    dom.platformImport.addEventListener('click', handlePlatformImport);
    dom.platformInput.addEventListener('change', handlePlatformFileChoice);
    document.getElementById('audioSourceSelectBuiltin').addEventListener('click', () => handleSelect('builtin'));
    document.getElementById('audioSourceTestBuiltin').addEventListener('click', () => handleTest('builtin'));
    initialized = true;
    dom.platformImport.hidden = !callbacks.importPlatformPackage;
    updateOperationAvailability(false);
    return true;
  }

  function open(opener) {
    if (!initialize() || openState) return;
    openState = true;
    returnFocus = opener && typeof opener.focus === 'function' ? opener : document.activeElement;
    const loginDialog = document.getElementById('neteaseLoginDialog');
    if (loginDialog && !loginDialog.hidden) {
      coveredLoginState = {
        ariaHidden: loginDialog.getAttribute('aria-hidden'),
        inert: loginDialog.inert
      };
      loginDialog.setAttribute('aria-hidden', 'true');
      loginDialog.inert = true;
    }
    dom.dialog.hidden = false;
    dom.dialog.setAttribute('aria-hidden', 'false');
    dom.panel.focus();
    refresh();
  }

  function close() {
    if (!initialize() || !openState) return;
    openState = false;
    requestRevision += 1;
    if (requestController) requestController.abort();
    requestController = null;
    mutationInFlight = false;
    previewReadInFlight = false;
    hostEditor = null;
    clearPendingImport();
    setBusy(false, '');
    dom.dialog.hidden = true;
    dom.dialog.setAttribute('aria-hidden', 'true');
    const loginDialog = document.getElementById('neteaseLoginDialog');
    if (loginDialog && coveredLoginState) {
      if (coveredLoginState.ariaHidden === null) loginDialog.removeAttribute('aria-hidden');
      else loginDialog.setAttribute('aria-hidden', coveredLoginState.ariaHidden);
      loginDialog.inert = coveredLoginState.inert;
    }
    coveredLoginState = null;
    const target = returnFocus;
    returnFocus = null;
    if (target && typeof target.focus === 'function' && target.isConnected !== false) target.focus();
  }

  function configure(options = {}) {
    Object.keys(callbacks).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(options, key)) callbacks[key] = typeof options[key] === 'function' ? options[key] : null;
    });
    if (initialize()) {
      dom.platformImport.hidden = !callbacks.importPlatformPackage;
      updateOperationAvailability(false);
    }
    if (latestPayload) notifySelectionChanged().then(renderLibraryContext).catch(() => {});
  }

  window.feAudioSources = Object.freeze({ open, close, configure, getSelectedSource, refresh });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
