(function installClientAiService() {
  'use strict';

  const LEGACY_STORAGE_KEY = 'fe-monster.client-ai-service.v1';
  const CONFIG_ENDPOINT = '/api/client-ai/config';
  const PROVIDERS_ENDPOINT = '/api/client-ai/providers';
  const DEFAULT_MODEL = Object.freeze({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    voice: '',
    hasApiKey: false,
    keyLast4: '',
    ready: false,
    keylessLoopback: false
  });
  const DEFAULT_TTS = Object.freeze({
    provider: 'openai-tts',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    hasApiKey: false,
    keyLast4: '',
    ready: false,
    keylessLoopback: false
  });

  let state = normalizeSnapshot({});
  let providerCatalog = Object.freeze({
    schema: 'fe-monster.ai-provider-catalog/v1',
    revision: 0,
    providers: Object.freeze([])
  });
  let initializePromise = null;
  let saveQueue = Promise.resolve();

  function boundedRaw(value, maxLength, fallback = '') {
    const text = value == null ? String(fallback || '') : String(value);
    return text.slice(0, Math.max(0, maxLength));
  }

  function boundedText(value, maxLength, fallback = '') {
    return boundedRaw(value, maxLength, fallback).trim();
  }

  function normalizeMode(value) {
    return value === 'custom' ? 'custom' : 'server';
  }

  function isLoopbackEndpoint(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
    } catch (_) {
      return false;
    }
  }

  function normalizeProvider(value, fallback, tts) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const provider = boundedText(source.provider, 48, fallback.provider) || fallback.provider;
    const baseUrl = boundedText(source.baseUrl, 800, fallback.baseUrl).replace(/\/+$/, '');
    const model = boundedText(source.model, 240, fallback.model);
    const voice = tts ? boundedText(source.voice, 240, fallback.voice) : '';
    const hasApiKey = source.hasApiKey === true;
    const keyLast4 = hasApiKey ? boundedText(source.keyLast4, 4) : '';
    const keylessLoopback = !tts && (source.keylessLoopback === true
      || (!hasApiKey && isLoopbackEndpoint(baseUrl)));
    const ready = source.ready === true || Boolean(
      baseUrl && model && (!tts || voice) && (hasApiKey || keylessLoopback)
    );
    const result = {
      provider,
      baseUrl,
      model,
      voice,
      hasApiKey,
      keyLast4,
      ready,
      keylessLoopback
    };
    if (!tts) return result;
    const numberInRange = (raw, fallbackValue, min, max) => {
      const number = Number(raw);
      return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallbackValue;
    };
    const output = source.output && typeof source.output === 'object' ? source.output : {};
    const prosody = source.prosody && typeof source.prosody === 'object' ? source.prosody : {};
    return {
      ...result,
      providerId: boundedText(source.providerId, 80, provider) || provider,
      protocol: boundedText(source.protocol, 80),
      resourceId: boundedText(source.resourceId, 64),
      modelVariant: boundedText(source.modelVariant, 240, model),
      authMode: boundedText(source.authMode, 32),
      hasCredential: source.hasCredential === true || hasApiKey,
      output: {
        format: boundedText(output.format, 24, 'mp3'),
        sampleRate: numberInRange(output.sampleRate, 24000, 8000, 48000),
        bitRate: numberInRange(output.bitRate, 128000, 0, 160000)
      },
      prosody: {
        emotion: boundedText(prosody.emotion, 64),
        emotionScale: numberInRange(prosody.emotionScale, 4, 1, 5),
        speechRate: numberInRange(prosody.speechRate, 0, -50, 100),
        loudnessRate: numberInRange(prosody.loudnessRate, 0, -50, 100)
      }
    };
  }

  function normalizeSnapshot(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const modelMode = normalizeMode(source.modelMode);
    return {
      ok: source.ok !== false,
      configState: boundedText(source.configState, 32, 'missing') || 'missing',
      errorCode: boundedText(source.errorCode, 80),
      revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0,
      modelMode,
      ttsMode: modelMode,
      ttsEnabled: source.ttsEnabled !== false,
      model: normalizeProvider(source.model, DEFAULT_MODEL, false),
      tts: normalizeProvider(source.tts, DEFAULT_TTS, true)
    };
  }

  function normalizeProviderDescriptor(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const id = boundedText(source.id, 80).toLowerCase();
    const kind = boundedText(source.kind, 16).toLowerCase();
    const protocol = boundedText(source.protocol, 80).toLowerCase();
    const implementationStatus = boundedText(source.implementationStatus, 24, 'planned').toLowerCase();
    if (!/^[a-z0-9][a-z0-9._:-]{1,79}$/.test(id) || !['chat', 'tts'].includes(kind)) return null;
    const safeHttpsLink = (raw) => {
      const text = boundedText(raw, 800);
      if (!text) return '';
      try {
        const parsed = new URL(text);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        return parsed.href;
      } catch (_) {
        return '';
      }
    };
    const capabilities = Array.isArray(source.capabilities)
      ? source.capabilities.map((item) => boundedText(item, 80)).filter(Boolean).slice(0, 32)
      : [];
    const authModes = Array.isArray(source.authModes)
      ? source.authModes.map((item) => boundedText(item, 40)).filter(Boolean).slice(0, 8)
      : [];
    return Object.freeze({
      id,
      kind,
      displayName: boundedText(source.displayName, 120, id),
      protocol,
      implementationStatus,
      capabilities: Object.freeze(capabilities),
      authModes: Object.freeze(authModes),
      links: Object.freeze({
        console: safeHttpsLink(source.links?.console),
        docs: safeHttpsLink(source.links?.docs),
        voices: safeHttpsLink(source.links?.voices)
      })
    });
  }

  function normalizeProviderCatalog(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const descriptors = Array.isArray(source.providers)
      ? source.providers.map(normalizeProviderDescriptor).filter(Boolean)
      : [];
    const seen = new Set();
    const providers = descriptors.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return Object.freeze({
      schema: boundedText(source.schema, 80, 'fe-monster.ai-provider-catalog/v1'),
      revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0,
      providers: Object.freeze(providers)
    });
  }

  function cloneSnapshot(value = state) {
    return {
      ...value,
      model: { ...value.model },
      tts: { ...value.tts }
    };
  }

  function publicSnapshot(value) {
    return cloneSnapshot(normalizeSnapshot(value === undefined ? state : value));
  }

  function emitChange(reason, options = {}) {
    const detail = publicSnapshot();
    try {
      window.dispatchEvent(new CustomEvent('fe-monster-client-ai-service-change', { detail }));
      window.FeMonsterPetClientContext?.refresh?.(reason || 'ai-service-change');
      if (options.syncControls !== false && typeof window.clientAiServiceSyncControls === 'function') {
        window.clientAiServiceSyncControls(detail);
      }
    } catch (_) {}
  }

  async function responseError(response) {
    let body = {};
    try { body = await response.json(); } catch (_) {}
    const message = boundedText(body.error || body.message, 500, `HTTP ${response.status}`);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    error.errorCode = boundedText(body.errorCode, 80);
    return error;
  }

  async function fetchSnapshot() {
    const response = await window.fetch(CONFIG_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw await responseError(response);
    return normalizeSnapshot(await response.json());
  }

  async function fetchProviderCatalog() {
    const response = await window.fetch(PROVIDERS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw await responseError(response);
    return normalizeProviderCatalog(await response.json());
  }

  async function postConfig(patch, options = {}) {
    const response = await window.fetch(CONFIG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(patch),
      cache: 'no-store',
      keepalive: options.keepalive === true
    });
    if (!response.ok) throw await responseError(response);
    return normalizeSnapshot(await response.json());
  }

  function legacyPatch(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const modelMode = normalizeMode(source.modelMode);
    const providerPatch = (input, tts) => {
      const item = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const patch = {
        provider: boundedText(item.provider, 48),
        baseUrl: boundedText(item.baseUrl, 800),
        model: boundedText(item.model, 240)
      };
      if (tts) patch.voice = boundedText(item.voice, 240);
      const apiKey = boundedRaw(item.apiKey, 4096);
      if (apiKey) patch.apiKey = apiKey;
      return patch;
    };
    return {
      modelMode,
      ttsMode: modelMode,
      ttsEnabled: source.ttsEnabled !== false,
      model: providerPatch(source.model, false),
      tts: providerPatch(source.tts, true)
    };
  }

  async function initialize() {
    try {
      [state, providerCatalog] = await Promise.all([fetchSnapshot(), fetchProviderCatalog()]);
      const legacyRaw = window.localStorage?.getItem?.(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        if (state.configState === 'missing') {
          try {
            const legacy = JSON.parse(legacyRaw);
            state = await postConfig(legacyPatch(legacy));
            window.localStorage?.removeItem?.(LEGACY_STORAGE_KEY);
          } catch (error) {
            if (error instanceof SyntaxError) {
              // A corrupt legacy browser value has no recoverable settings and
              // must not disable the Java-owned configuration service.
              window.localStorage?.removeItem?.(LEGACY_STORAGE_KEY);
            }
          }
        } else if (state.configState === 'ready') {
          // Java is authoritative after the first successful migration. A stale
          // WebView profile must never roll a newer endpoint or key backwards.
          window.localStorage?.removeItem?.(LEGACY_STORAGE_KEY);
        }
      }
      emitChange('ai-service-ready');
    } catch (error) {
      state = {
        ...state,
        ok: false,
        configState: 'unavailable',
        errorCode: boundedText(error?.errorCode, 80, 'client_ai_unavailable')
      };
      emitChange('ai-service-unavailable');
    }
    return publicSnapshot();
  }

  function ready() {
    if (!initializePromise) initializePromise = initialize();
    return initializePromise;
  }

  function load() {
    return publicSnapshot();
  }

  function catalog() {
    return providerCatalog;
  }

  function providers(kind = '') {
    const expected = boundedText(kind, 16).toLowerCase();
    return providerCatalog.providers.filter((item) => !expected || item.kind === expected);
  }

  function provider(providerId) {
    const id = boundedText(providerId, 80).toLowerCase();
    return providerCatalog.providers.find((item) => item.id === id) || null;
  }

  function officialLink(providerId, type = 'console') {
    const key = ['console', 'docs', 'voices'].includes(type) ? type : '';
    return key ? provider(providerId)?.links?.[key] || '' : '';
  }

  function providerPatch(value, options = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const patch = {};
    if (Object.hasOwn(source, 'provider')) patch.provider = boundedText(source.provider, 80);
    const doubao = options.tts && patch.provider === 'volcengine-doubao-tts-v3';
    if (doubao) {
      if (Object.hasOwn(source, 'resourceId')) patch.resourceId = boundedText(source.resourceId, 64);
      if (Object.hasOwn(source, 'modelVariant') || Object.hasOwn(source, 'model')) {
        patch.modelVariant = boundedText(source.modelVariant || source.model, 240);
      }
      if (Object.hasOwn(source, 'voice')) patch.voice = boundedText(source.voice, 240);
      if (source.output && typeof source.output === 'object') {
        patch.output = {
          format: boundedText(source.output.format, 24),
          sampleRate: Number(source.output.sampleRate),
          bitRate: Number(source.output.bitRate)
        };
      }
      if (source.prosody && typeof source.prosody === 'object') {
        patch.prosody = {
          emotion: boundedText(source.prosody.emotion, 64),
          emotionScale: Number(source.prosody.emotionScale),
          speechRate: Number(source.prosody.speechRate),
          loudnessRate: Number(source.prosody.loudnessRate)
        };
      }
      if (source.credentialPatch && typeof source.credentialPatch === 'object') {
        const credential = { authMode: boundedText(source.credentialPatch.authMode, 32) };
        for (const key of ['apiKey', 'appId', 'accessKey']) {
          const secret = boundedRaw(source.credentialPatch[key], 4096);
          if (secret) credential[key] = secret;
        }
        patch.credentialPatch = credential;
      }
      if (options.clear === true) patch.clearCredential = true;
      return patch;
    }
    if (Object.hasOwn(source, 'baseUrl')) patch.baseUrl = boundedText(source.baseUrl, 800);
    if (Object.hasOwn(source, 'model')) patch.model = boundedText(source.model, 240);
    if (options.tts && Object.hasOwn(source, 'voice')) patch.voice = boundedText(source.voice, 240);
    const apiKey = boundedRaw(source.apiKey, 4096);
    if (apiKey) patch.apiKey = apiKey;
    if (options.clear === true) patch.clearApiKey = true;
    return patch;
  }

  async function saveNow(updates, options = {}) {
    await ready();
    const source = updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : {};
    const modelMode = Object.hasOwn(source, 'modelMode')
      ? normalizeMode(source.modelMode)
      : normalizeMode(state.modelMode);
    const patch = { modelMode, ttsMode: modelMode };
    if (Object.hasOwn(source, 'ttsEnabled')) patch.ttsEnabled = source.ttsEnabled !== false;
    if (source.model && typeof source.model === 'object') {
      patch.model = providerPatch(source.model, { clear: options.clearModelApiKey === true });
    }
    if (source.tts && typeof source.tts === 'object') {
      patch.tts = providerPatch(source.tts, { tts: true, clear: options.clearTtsApiKey === true });
    }
    state = await postConfig(patch, { keepalive: options.keepalive === true });
    emitChange('ai-service-change', { syncControls: options.syncControls !== false });
    return publicSnapshot();
  }

  function save(updates, options = {}) {
    const operation = saveQueue.catch(() => {}).then(() => saveNow(updates, options));
    saveQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function isCustomModel(value) {
    const config = normalizeSnapshot(value === undefined ? state : value);
    return config.modelMode === 'custom' && config.model.ready === true;
  }

  function isCustomTts(value) {
    const config = normalizeSnapshot(value === undefined ? state : value);
    return config.ttsEnabled === true && config.ttsMode === 'custom' && config.tts.ready === true;
  }

  function requestId(value) {
    const supplied = boundedText(value, 128);
    if (supplied && /^[A-Za-z0-9._:-]+$/.test(supplied)) return supplied;
    return `client-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function notifyCancel(id) {
    return window.fetch('/api/client-ai/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id }),
      keepalive: true
    }).catch(() => {});
  }

  async function upstreamRequest(kind, payload, options = {}) {
    const id = requestId(options.requestId);
    const signal = options.signal;
    const onAbort = () => { notifyCancel(id); };
    if (signal?.aborted) onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    try {
      const response = await window.fetch(`/api/client-ai/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: kind === 'tts' ? 'audio/*' : '*/*' },
        body: JSON.stringify({ requestId: id, payload }),
        signal,
        cache: 'no-store'
      });
      if (!response.ok) throw await responseError(response);
      return { response, requestId: id };
    } finally {
      signal?.removeEventListener?.('abort', onAbort);
    }
  }

  function extractText(payload) {
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    return boundedRaw(choices[0]?.message?.content || choices[0]?.text || payload?.output_text || '', 8000);
  }

  function extractDelta(payload) {
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    return boundedRaw(choices[0]?.delta?.content || choices[0]?.text || '', 8000);
  }

  function mergeToolCall(toolCallMap, item) {
    if (!item || typeof item !== 'object') return;
    const index = Number.isFinite(Number(item.index)) ? Number(item.index) : 0;
    const call = toolCallMap.get(index) || { id: '', name: '', arguments: '' };
    if (item.id) call.id = boundedText(item.id, 160, call.id);
    if (item.function?.name) call.name = boundedText(item.function.name, 96, call.name);
    if (item.function?.arguments) {
      call.arguments = boundedRaw(call.arguments + String(item.function.arguments), 12_000);
    }
    toolCallMap.set(index, call);
  }

  function finalToolCalls(toolCallMap) {
    return Array.from(toolCallMap.values()).map((call) => {
      let args = boundedRaw(call.arguments || '{}', 12_000) || '{}';
      try { args = JSON.stringify(JSON.parse(args)); } catch (_) {}
      return {
        id: call.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: boundedText(call.name, 96),
        arguments: args
      };
    }).filter((call) => call.name);
  }

  function extractToolCalls(payload) {
    const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
    const message = choice?.message && typeof choice.message === 'object' ? choice.message : null;
    const delta = choice?.delta && typeof choice.delta === 'object' ? choice.delta : null;
    const toolCallMap = new Map();
    const calls = Array.isArray(message?.tool_calls)
      ? message.tool_calls
      : Array.isArray(choice?.tool_calls)
        ? choice.tool_calls
        : Array.isArray(payload?.tool_calls)
          ? payload.tool_calls
          : [];
    calls.slice(0, 32).forEach((call, index) => mergeToolCall(toolCallMap, {
      ...call,
      index: Number.isFinite(Number(call?.index)) ? Number(call.index) : index
    }));
    const legacy = message?.function_call || delta?.function_call || choice?.function_call;
    if (legacy && typeof legacy === 'object') {
      mergeToolCall(toolCallMap, {
        index: toolCallMap.size,
        id: choice?.id || message?.id || '',
        function: legacy
      });
    }
    return finalToolCalls(toolCallMap);
  }

  async function completeChat(_value, messages, options = {}) {
    if (!isCustomModel()) throw new Error('请先保存可用的自备模型配置');
    const payload = {
      messages,
      stream: false,
      ...(options.body || {})
    };
    const { response } = await upstreamRequest('chat', payload, options);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) throw new Error('自备模型没有返回 JSON');
    return extractText(await response.json());
  }

  async function chatStream(_value, messages, options = {}) {
    if (!isCustomModel()) throw new Error('请先保存可用的自备模型配置');
    const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {};
    const onToolCalls = typeof options.onToolCalls === 'function' ? options.onToolCalls : () => {};
    const tools = Array.isArray(options.tools) && options.tools.length ? options.tools.slice(0, 32) : null;
    const payload = {
      messages,
      stream: true,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
      ...(options.body || {})
    };
    const { response, requestId: upstreamRequestId } = await upstreamRequest('chat', payload, options);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('application/json')) {
      const json = await response.json();
      if (json?.error) throw new Error(boundedText(json.error?.message || json.error, 500, '自备模型返回错误'));
      const text = extractText(json);
      const toolCalls = extractToolCalls(json);
      if (text) onDelta(text);
      if (toolCalls.length) onToolCalls(toolCalls);
      return { text, streamed: false, toolCalls };
    }
    if (!contentType.startsWith('text/event-stream') || !response.body?.getReader) {
      throw new Error('自备模型没有返回兼容的流式响应');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCallMap = new Map();
    let buffer = '';
    let text = '';
    let doneEvent = false;
    const consumeEvent = (eventText) => {
      const data = eventText.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => {
          const value = line.slice(5);
          return value.startsWith(' ') ? value.slice(1) : value;
        })
        .join('\n');
      if (!data) return;
      if (data === '[DONE]') {
        doneEvent = true;
        return;
      }
      let packet;
      try { packet = JSON.parse(data); } catch (_) { throw new Error('自备模型返回了损坏的 SSE 数据'); }
      if (packet?.error) throw new Error(boundedText(packet.error?.message || packet.error, 500, '自备模型返回错误'));
      const delta = extractDelta(packet);
      if (delta) {
        text = boundedRaw(text + delta, 8000);
        onDelta(delta);
      }
      const choice = Array.isArray(packet?.choices) ? packet.choices[0] : null;
      const calls = Array.isArray(choice?.delta?.tool_calls)
        ? choice.delta.tool_calls
        : Array.isArray(choice?.message?.tool_calls)
          ? choice.message.tool_calls
          : Array.isArray(choice?.tool_calls)
            ? choice.tool_calls
            : [];
      calls.forEach((call, index) => mergeToolCall(toolCallMap, {
        ...call,
        index: Number.isFinite(Number(call?.index)) ? Number(call.index) : index
      }));
      const legacy = choice?.delta?.function_call || choice?.message?.function_call || choice?.function_call;
      if (legacy && typeof legacy === 'object') {
        mergeToolCall(toolCallMap, { index: 0, id: choice?.id || '', function: legacy });
      }
    };
    const drain = (final = false) => {
      while (!doneEvent) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match) break;
        const eventText = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consumeEvent(eventText);
        if (doneEvent) buffer = '';
      }
      if (final && !doneEvent && buffer.trim()) {
        consumeEvent(buffer);
        buffer = '';
      }
    };

    const onBodyAbort = () => { notifyCancel(upstreamRequestId); };
    options.signal?.addEventListener?.('abort', onBodyAbort, { once: true });
    try {
      while (!doneEvent) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 17 * 1024 * 1024) throw new Error('自备模型流式响应过大');
        drain(false);
      }
      if (!doneEvent) {
        buffer += decoder.decode();
        drain(true);
      }
      if (!doneEvent) {
        const error = new Error('自备模型 SSE 在完整终止事件前结束');
        error.errorCode = 'client_ai_incomplete_stream';
        throw error;
      }
      const toolCalls = finalToolCalls(toolCallMap);
      if (toolCalls.length) onToolCalls(toolCalls);
      return { text, streamed: true, toolCalls };
    } catch (error) {
      if ((text || toolCallMap.size > 0) && error && typeof error === 'object') {
        try { error.receivedOutput = true; } catch (_) {}
      }
      throw error;
    } finally {
      options.signal?.removeEventListener?.('abort', onBodyAbort);
      try { await reader.cancel(); } catch (_) {}
      await notifyCancel(upstreamRequestId);
    }
  }

  async function ttsSessionMutation(path, body = {}, options = {}) {
    const response = await window.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw await responseError(response);
    return response.json();
  }

  async function createTtsSession(options = {}) {
    const id = requestId(options.requestId);
    const prosodyOverride = options.prosodyOverride && typeof options.prosodyOverride === 'object'
      && !Array.isArray(options.prosodyOverride)
      && Object.keys(options.prosodyOverride).length > 0
      ? options.prosodyOverride
      : null;
    return ttsSessionMutation('/api/client-ai/tts/sessions', {
      requestId: id,
      ...(prosodyOverride ? { prosodyOverride } : {})
    }, options);
  }

  async function appendTtsText(sessionId, sequence, text, options = {}) {
    const id = boundedText(sessionId, 80);
    if (!id) throw new Error('豆包实时语音会话不存在');
    return ttsSessionMutation(`/api/client-ai/tts/sessions/${encodeURIComponent(id)}/text`, {
      sequence: Number(sequence),
      text: boundedRaw(text, 4000)
    }, options);
  }

  async function finishTtsSession(sessionId, options = {}) {
    const id = boundedText(sessionId, 80);
    if (!id) throw new Error('豆包实时语音会话不存在');
    return ttsSessionMutation(`/api/client-ai/tts/sessions/${encodeURIComponent(id)}/finish`, {}, options);
  }

  async function deleteTtsSession(sessionId) {
    const id = boundedText(sessionId, 80);
    if (!id) return false;
    try {
      const response = await window.fetch(`/api/client-ai/tts/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        keepalive: true
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  function ttsSessionAudioUrl(sessionId) {
    const id = boundedText(sessionId, 80);
    if (!id) throw new Error('豆包实时语音会话不存在');
    return `/api/client-ai/tts/sessions/${encodeURIComponent(id)}/audio`;
  }

  async function synthesizeSpeech(_value, text, options = {}) {
    const current = load();
    if (current.ttsEnabled === false) throw new Error('客户端 TTS 已关闭');
    if (!isCustomTts(current)) throw new Error('请先保存可用的自备语音配置');
    const input = boundedText(text, 4000);
    if (!input) throw new Error('没有可合成的语音文本');
    const affectRuntime = window.FeMonsterPetAffectPlan;
    const appliedAffectPlan = options.affectPlan && affectRuntime?.normalize
      ? affectRuntime.normalize(options.affectPlan)
      : null;
    const prosodyOverride = appliedAffectPlan && affectRuntime?.ttsOverrides
      ? affectRuntime.ttsOverrides(appliedAffectPlan, current.tts.provider)
      : {};
    if (current.tts.provider === 'volcengine-doubao-tts-v3') {
      const session = await createTtsSession({ ...options, prosodyOverride });
      const sessionId = session.sessionId;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        options.signal?.removeEventListener?.('abort', release);
        void deleteTtsSession(sessionId);
      };
      options.signal?.addEventListener?.('abort', release, { once: true });
      try {
        await appendTtsText(sessionId, 1, input, options);
        await finishTtsSession(sessionId, options);
      } catch (error) {
        release();
        throw error;
      }
      return {
        blob: null,
        url: ttsSessionAudioUrl(sessionId),
        bytes: 0,
        type: session.contentType || 'audio/mpeg',
        streaming: true,
        sessionId,
        appliedAffectPlan,
        appliedProsodyOverride: session.prosodyOverride || prosodyOverride,
        release
      };
    }
    const { response } = await upstreamRequest('tts', {
      input,
      response_format: 'mp3',
      ...prosodyOverride
    }, options);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/')) throw new Error('自备语音服务没有返回音频');
    const blob = await response.blob();
    if (!blob.size) throw new Error('自备语音服务返回了空音频');
    return {
      blob,
      url: URL.createObjectURL(blob),
      bytes: blob.size,
      type: blob.type,
      streaming: false,
      appliedAffectPlan,
      appliedProsodyOverride: prosodyOverride
    };
  }

  async function testModel(value) {
    const reply = await completeChat(value, [
      { role: 'system', content: 'You are a concise connectivity test.' },
      { role: 'user', content: 'Reply with the word OK.' }
    ], { requestId: `model-test-${Date.now()}` });
    const config = load();
    return { ok: true, reply: boundedText(reply, 500), provider: config.model.provider, model: config.model.model };
  }

  async function testTts(value) {
    const result = await synthesizeSpeech(value, '这是 FE Monster 的语音连接测试。', {
      requestId: `tts-test-${Date.now()}`
    });
    if (result.streaming === true) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      let reader = null;
      try {
        const response = await window.fetch(result.url, {
          method: 'GET',
          headers: { Accept: 'audio/*' },
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw await responseError(response);
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.startsWith('audio/')) throw new Error('豆包实时语音没有返回音频');
        reader = response.body?.getReader?.();
        if (!reader) throw new Error('当前客户端无法读取实时音频流');
        const first = await reader.read();
        const bytes = first.value?.byteLength || 0;
        if (first.done || !bytes) throw new Error('豆包实时语音返回了空音频');
        return { ok: true, bytes, type: contentType, streaming: true };
      } finally {
        window.clearTimeout(timeout);
        try { await reader?.cancel?.(); } catch (_) {}
        controller.abort();
        result.release?.();
      }
    }
    URL.revokeObjectURL(result.url);
    return { ok: true, bytes: result.bytes, type: result.type, streaming: false };
  }

  window.FeMonsterClientAiService = Object.freeze({
    LEGACY_STORAGE_KEY,
    ready,
    refresh: async () => {
      await ready();
      [state, providerCatalog] = await Promise.all([fetchSnapshot(), fetchProviderCatalog()]);
      emitChange('ai-service-refresh');
      return publicSnapshot();
    },
    catalog,
    providers,
    provider,
    officialLink,
    defaults: () => normalizeSnapshot({}),
    load,
    save,
    isCustomModel,
    isCustomTts,
    completeChat,
    chatStream,
    synthesizeSpeech,
    createTtsSession,
    appendTtsText,
    finishTtsSession,
    deleteTtsSession,
    ttsSessionAudioUrl,
    testModel,
    testTts,
    publicSnapshot,
    redactKey: (last4) => boundedText(last4, 4) ? `••••${boundedText(last4, 4)}` : ''
  });

  window.setTimeout(() => { ready(); }, 0);
})();
