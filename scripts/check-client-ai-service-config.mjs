import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const servicePath = path.join(root, 'web', 'client-ai-service.js');
assert.ok(fs.existsSync(servicePath), 'web/client-ai-service.js is missing');
const source = fs.readFileSync(servicePath, 'utf8');
const affectSource = fs.readFileSync(path.join(root, 'web', 'pet-affect-plan.js'), 'utf8');
const petSource = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const installerContractSources = [
  'scripts/build-installer.ps1',
  'scripts/install-fe-monster.ps1',
  'scripts/check-windows-installer-contract.ps1',
  'scripts/check-final-installer-isolated-install.ps1',
].map((relative) => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]);

const secret = 'sk-fixture-never-leak';
const legacyKey = 'fe-monster.client-ai-service.v1';
const storage = new Map([[legacyKey, JSON.stringify({
  modelMode: 'custom',
  ttsMode: 'custom',
  model: {
    provider: 'custom',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen-local',
    apiKey: secret,
  },
  tts: {
    provider: 'custom',
    baseUrl: 'http://127.0.0.1:11435/v1',
    model: 'local-tts',
    voice: 'alice',
    apiKey: '',
  },
})]]);
const storageWrites = [];
const requests = [];
const cancellations = [];
const ttsSessionMutations = [];
let modelKey = '';
const providerCatalogFixture = {
  schema: 'fe-monster.ai-provider-catalog/v1',
  revision: 1,
  providers: [
    { id: 'openai', kind: 'chat', displayName: 'OpenAI', protocol: 'openai-compatible', implementationStatus: 'ready', capabilities: [], authModes: ['api-key'], links: {} },
    { id: 'openai-tts', kind: 'tts', displayName: 'OpenAI TTS', protocol: 'openai-compatible', implementationStatus: 'ready', capabilities: [], authModes: ['api-key'], links: {} },
  ],
};
let serverSnapshot = {
  ok: true,
  configState: 'missing',
  revision: 0,
  modelMode: 'server',
  ttsMode: 'server',
  model: { provider: '', baseUrl: '', model: '', voice: '', hasApiKey: false, keyLast4: '', ready: false },
  tts: { provider: '', baseUrl: '', model: '', voice: '', hasApiKey: false, keyLast4: '', ready: false },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function fakeFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const parsed = options.body ? JSON.parse(options.body) : {};
  requests.push({ url: String(url), method, body: parsed });
  if (url === '/api/client-ai/providers' && method === 'GET') return jsonResponse(providerCatalogFixture);
  if (url === '/api/client-ai/config' && method === 'GET') return jsonResponse(serverSnapshot);
  if (url === '/api/client-ai/config' && method === 'POST') {
    const previous = serverSnapshot.model;
    const nextModel = { ...previous, ...(parsed.model || {}) };
    if (parsed.model?.apiKey) modelKey = parsed.model.apiKey;
    if (parsed.model?.clearApiKey === true) modelKey = '';
    serverSnapshot = {
      ...serverSnapshot,
      ok: true,
      configState: 'ready',
      revision: serverSnapshot.revision + 1,
      modelMode: parsed.modelMode || serverSnapshot.modelMode,
      ttsMode: parsed.ttsMode || serverSnapshot.ttsMode,
      model: {
        ...nextModel,
        apiKey: undefined,
        hasApiKey: Boolean(modelKey),
        keyLast4: modelKey.slice(-4),
        ready: Boolean(nextModel.baseUrl && nextModel.model && (modelKey || nextModel.baseUrl.includes('127.0.0.1'))),
      },
      tts: {
        ...serverSnapshot.tts,
        ...(parsed.tts || {}),
        apiKey: undefined,
        hasApiKey: false,
        keyLast4: '',
        ready: true,
      },
    };
    return jsonResponse(serverSnapshot);
  }
  if (url === '/api/client-ai/cancel') {
    cancellations.push(parsed.requestId);
    return jsonResponse({ ok: true, cancelled: true, requestId: parsed.requestId });
  }
  if (url === '/api/client-ai/tts/sessions' && method === 'POST') {
    ttsSessionMutations.push({ action: 'create', body: parsed });
    return jsonResponse({
      ok: true,
      sessionId: '11111111-1111-4111-8111-111111111111',
      requestId: parsed.requestId,
      state: 'connecting',
      contentType: 'audio/mpeg',
    });
  }
  if (url === '/api/client-ai/tts/sessions/11111111-1111-4111-8111-111111111111/text' && method === 'POST') {
    ttsSessionMutations.push({ action: 'text', body: parsed });
    return jsonResponse({ ok: true, sessionId: '11111111-1111-4111-8111-111111111111', state: 'running' });
  }
  if (url === '/api/client-ai/tts/sessions/11111111-1111-4111-8111-111111111111/finish' && method === 'POST') {
    ttsSessionMutations.push({ action: 'finish', body: parsed });
    return jsonResponse({ ok: true, sessionId: '11111111-1111-4111-8111-111111111111', state: 'finishing' });
  }
  if (url === '/api/client-ai/tts/sessions/11111111-1111-4111-8111-111111111111' && method === 'DELETE') {
    ttsSessionMutations.push({ action: 'delete', body: parsed });
    return jsonResponse({ ok: true, sessionId: '11111111-1111-4111-8111-111111111111', deleted: true });
  }
  if (url === '/api/client-ai/chat') {
    assert.equal(Object.hasOwn(parsed, 'baseUrl'), false, 'browser sent baseUrl');
    assert.equal(Object.hasOwn(parsed, 'apiKey'), false, 'browser sent apiKey');
    if (parsed.payload?.scenario === 'wait-for-abort') {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }
    if (parsed.payload?.scenario === 'done-tail') {
      const bytes = new TextEncoder().encode([
        'data: [DONE]',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"late","function":{"name":"community.messages.query","arguments":"{}"}}]}}]}',
        '',
      ].join('\n'));
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          // Deliberately keep the upstream open after DONE. The client must cancel it.
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (parsed.payload?.scenario === 'truncated') {
      const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (parsed.payload?.scenario === 'json-tool-call') {
      return jsonResponse({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'json-command-1',
              type: 'function',
              function: {
                name: 'control_app',
                arguments: '{"command":"playback.mode.set","arguments":{"mode":"spectrum"}}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
    }
    const bytes = new TextEncoder().encode([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"\\n  code"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'));
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }
  if (url === '/api/client-ai/tts') {
    return new Response(new Uint8Array([0x49, 0x44, 0x33, 1]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }
  throw new Error(`unexpected request ${method} ${url}`);
}

const events = [];
const sandbox = {
  AbortController,
  Blob,
  crypto,
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  DOMException,
  Response,
  ReadableStream,
  TextDecoder,
  TextEncoder,
  URL,
  clearTimeout,
  console,
  fetch: fakeFetch,
  setTimeout,
  window: {
    fetch: fakeFetch,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storageWrites.push([key, String(value)]); storage.set(key, String(value)); },
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent: (event) => events.push(event),
    addEventListener: () => {},
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.AbortController = AbortController;
sandbox.window.CustomEvent = sandbox.CustomEvent;
sandbox.window.crypto = crypto;
sandbox.window.URL = URL;
sandbox.window.setTimeout = setTimeout;
sandbox.window.clearTimeout = clearTimeout;
const serviceContext = vm.createContext(sandbox);
vm.runInContext(affectSource, serviceContext, { filename: 'web/pet-affect-plan.js' });
vm.runInContext(source, serviceContext, { filename: servicePath });

const service = sandbox.window.FeMonsterClientAiService;
assert.ok(service, 'client AI service was not installed');
await service.ready();
assert.equal(storage.has(legacyKey), false, 'legacy raw-key localStorage was not removed after migration');
assert.equal(storageWrites.length, 0, 'new service wrote configuration or key to localStorage');
assert.equal(service.isCustomModel(), true, 'migrated keyless/keyed local model is not ready');
assert.equal(service.load().model.hasApiKey, true, 'migration did not reach Java-owned config');
assert.equal(JSON.stringify(service.load()).includes(secret), false, 'public snapshot contains legacy secret');
assert.equal(JSON.stringify(service).includes(secret), false, 'service object contains legacy secret');

await service.save({
  modelMode: 'custom',
  model: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: '' },
});
const switchRequest = requests.filter((entry) => entry.url === '/api/client-ai/config' && entry.method === 'POST').at(-1);
assert.equal(Object.hasOwn(switchRequest.body.model, 'apiKey'), false,
  'provider switch sent the previous or blank key');

const deltas = [];
const streamed = await service.chatStream(service.load(), [{ role: 'user', content: 'hi' }], {
  requestId: 'stream-1',
  onDelta: (delta) => deltas.push(delta),
});
assert.equal(streamed.text, 'Hello world\n  code', 'streamed whitespace/newlines were changed');
assert.deepEqual(deltas, ['Hello', ' world', '\n  code']);
const chatRequest = requests.filter((entry) => entry.url === '/api/client-ai/chat').at(-1);
assert.equal(chatRequest.body.requestId, 'stream-1', 'stable requestId was not forwarded');
assert.equal(Object.hasOwn(chatRequest.body, 'baseUrl'), false);
assert.equal(Object.hasOwn(chatRequest.body, 'apiKey'), false);

const lateToolCalls = [];
const doneTail = await service.chatStream(service.load(), [{ role: 'user', content: 'done' }], {
  requestId: 'done-tail-1',
  onToolCalls: (calls) => lateToolCalls.push(...calls),
  body: { scenario: 'done-tail' },
});
assert.equal(doneTail.toolCalls.length, 0, 'tool call after [DONE] was accepted');
assert.deepEqual(lateToolCalls, [], 'tool callback ran after [DONE]');
assert.ok(cancellations.includes('done-tail-1'), 'open SSE was not cancelled after [DONE]');

const jsonToolCallCallbacks = [];
const jsonToolCallResult = await service.chatStream(service.load(), [{ role: 'user', content: 'switch mode' }], {
  requestId: 'json-tool-call-1',
  onToolCalls: (calls) => jsonToolCallCallbacks.push(...calls),
  body: { scenario: 'json-tool-call' },
});
const expectedJsonToolCalls = [{
  id: 'json-command-1',
  name: 'control_app',
  arguments: '{"command":"playback.mode.set","arguments":{"mode":"spectrum"}}',
}];
assert.deepEqual(structuredClone(jsonToolCallResult.toolCalls), expectedJsonToolCalls,
  'ordinary application/json message.tool_calls were dropped');
assert.deepEqual(structuredClone(jsonToolCallCallbacks), expectedJsonToolCalls,
  'ordinary application/json tool calls did not reach onToolCalls');
assert.equal(jsonToolCallResult.text, '', 'a tool-only JSON response invented assistant text');

await assert.rejects(
  service.chatStream(service.load(), [{ role: 'user', content: 'truncate' }], {
    requestId: 'truncated-1',
    body: { scenario: 'truncated' },
  }),
  /完整|终止|SSE/i,
  'EOF without [DONE] was accepted as a complete response',
);

const audio = await service.synthesizeSpeech(service.load(), 'hello', { requestId: 'tts-1' });
assert.equal(audio.bytes, 4);
assert.equal(audio.type, 'audio/mpeg');

serverSnapshot = {
  ...serverSnapshot,
  ttsMode: 'custom',
  tts: {
    provider: 'volcengine-doubao-tts-v3',
    providerId: 'volcengine-doubao-tts-v3',
    protocol: 'volcengine-tts-v3',
    resourceId: 'seed-tts-2.0',
    modelVariant: 'seed-tts-2.0-standard',
    model: 'seed-tts-2.0-standard',
    voice: 'doubao:fixture-speaker',
    authMode: 'api-key',
    hasCredential: true,
    hasApiKey: true,
    keyLast4: '',
    ready: true,
    output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
    prosody: { emotion: '温柔', emotionScale: 4, speechRate: 0, loudnessRate: 0 },
  },
};
await service.refresh();
const realtimeAudio = await service.synthesizeSpeech(service.load(), '保留 空格', { requestId: 'doubao-route-1' });
assert.equal(realtimeAudio.streaming, true, 'Doubao did not select the realtime session route');
assert.equal(realtimeAudio.url, '/api/client-ai/tts/sessions/11111111-1111-4111-8111-111111111111/audio');
assert.equal(realtimeAudio.type, 'audio/mpeg');
assert.deepEqual(ttsSessionMutations.slice(0, 3), [
  { action: 'create', body: { requestId: 'doubao-route-1' } },
  { action: 'text', body: { sequence: 1, text: '保留 空格' } },
  { action: 'finish', body: {} },
], 'Doubao text was not submitted in create -> text -> finish order');
assert.equal(
  JSON.stringify(ttsSessionMutations).match(/apiKey|accessKey|credential|baseUrl/g),
  null,
  'realtime browser session leaked a credential or endpoint field',
);
realtimeAudio.release();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(ttsSessionMutations.at(-1)?.action, 'delete', 'realtime session release did not cancel the Java bridge');

const affectAudio = await service.synthesizeSpeech(service.load(), '今晚慢慢说', {
  requestId: 'doubao-affect-1',
  affectPlan: {
    schemaVersion: 1,
    primaryEmotion: 'sorrow',
    secondaryEmotion: 'love',
    intensity: 0.86,
    confidence: 0.91,
    speechRate: -18,
    loudnessRate: -9,
    source: 'local-model',
    timeOfDay: 'late-night',
    turnId: 'doubao-affect-1',
    proactive: true,
    automatic: true,
  },
});
const affectCreate = ttsSessionMutations.find((entry) => (
  entry.action === 'create' && entry.body.requestId === 'doubao-affect-1'
));
assert.deepEqual(affectCreate?.body, {
  requestId: 'doubao-affect-1',
  prosodyOverride: {
    emotion: 'sad',
    emotionScale: 4,
    speechRate: -18,
    loudnessRate: -9,
  },
}, 'per-utterance AffectPlan was a no-op at the Java Doubao session boundary');
assert.deepEqual(structuredClone(affectAudio.appliedAffectPlan), {
  schemaVersion: 1,
  primaryEmotion: 'sorrow',
  secondaryEmotion: 'love',
  intensity: 0.86,
  confidence: 0.91,
  speechRate: -18,
  loudnessRate: -9,
  source: 'local-model',
  timeOfDay: 'late-night',
  turnId: 'doubao-affect-1',
  proactive: true,
  automatic: true,
}, 'synthesis did not echo the bounded plan that was applied to this utterance');
affectAudio.release();
await new Promise((resolve) => setTimeout(resolve, 0));

const controller = new AbortController();
const pending = service.chatStream(service.load(), [{ role: 'user', content: 'wait' }], {
  requestId: 'abort-1',
  signal: controller.signal,
  body: { scenario: 'wait-for-abort' },
});
controller.abort();
await assert.rejects(pending, /abort/i);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(cancellations.includes('abort-1'), 'browser abort did not notify Java cancel route');

assert.doesNotMatch(source, /localStorage\.setItem\(/, 'client AI service still persists raw config in localStorage');
assert.doesNotMatch(source, /Authorization\s*:/, 'browser still constructs an Authorization header');
assert.match(petSource, /requestId:\s*stableRequestId/, 'pet requestId is not forwarded to client AI service');
assert.match(petSource, /signal:\s*[^,}\n]+/, 'pet custom model call has no AbortSignal');
assert.match(
  petSource,
  /Object\.hasOwn\(petAiToolCommandMap,\s*toolName\)/,
  'pet custom model accepts commands that were not disclosed in its tool allowlist',
);
assert.doesNotMatch(appSource, /window\.FeMonsterClientAiService = Object\.freeze\(/,
  'app.js still overwrites the Java-backed client AI service');
assert.doesNotMatch(
  appSource,
  /apiKey:\s*config\.(model|tts)\.apiKey/,
  'app.js fallback still lets the browser send a provider credential',
);
const autosaveStart = appSource.indexOf('if (els.aiServiceSaveButton)');
const autosaveEnd = appSource.indexOf("window.addEventListener('pagehide'", autosaveStart);
assert.ok(autosaveStart >= 0 && autosaveEnd > autosaveStart, 'AI autosave binding is not inspectable');
const autosaveBlock = appSource.slice(autosaveStart, autosaveEnd);
assert.doesNotMatch(autosaveBlock, /aiService(?:Model|Tts)ApiKey/,
  'API Key input must only be committed by an explicit save/test action');

const staleStorage = new Map([[legacyKey, JSON.stringify({
  modelMode: 'custom',
  model: {
    provider: 'custom',
    baseUrl: 'http://127.0.0.1:9999/v1',
    model: 'stale-model',
    apiKey: 'sk-stale-must-not-replace-java',
  },
})]]);
let staleMigrationPosts = 0;
const readySnapshot = {
  ok: true,
  configState: 'ready',
  revision: 7,
  modelMode: 'custom',
  ttsMode: 'server',
  model: {
    provider: 'custom',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'current-model',
    hasApiKey: false,
    keyLast4: '',
    ready: true,
  },
  tts: serverSnapshot.tts,
};
const readyFetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (url === '/api/client-ai/providers' && method === 'GET') return jsonResponse(providerCatalogFixture);
  if (url === '/api/client-ai/config' && method === 'GET') return jsonResponse(readySnapshot);
  if (url === '/api/client-ai/config' && method === 'POST') {
    staleMigrationPosts += 1;
    return jsonResponse(readySnapshot);
  }
  throw new Error(`unexpected ready-config request ${method} ${url}`);
};
const readySandbox = {
  AbortController,
  Blob,
  crypto,
  CustomEvent: sandbox.CustomEvent,
  DOMException,
  Response,
  ReadableStream,
  TextDecoder,
  TextEncoder,
  URL,
  clearTimeout,
  console,
  fetch: readyFetch,
  setTimeout,
  window: {
    fetch: readyFetch,
    localStorage: {
      getItem: (key) => staleStorage.get(key) ?? null,
      setItem: () => { throw new Error('client AI must not write localStorage'); },
      removeItem: (key) => staleStorage.delete(key),
    },
    dispatchEvent: () => {},
    addEventListener: () => {},
  },
};
readySandbox.window.window = readySandbox.window;
readySandbox.window.AbortController = AbortController;
readySandbox.window.CustomEvent = readySandbox.CustomEvent;
readySandbox.window.crypto = crypto;
readySandbox.window.URL = URL;
readySandbox.window.setTimeout = setTimeout;
readySandbox.window.clearTimeout = clearTimeout;
vm.runInContext(source, vm.createContext(readySandbox), { filename: `${servicePath}:ready` });
await readySandbox.window.FeMonsterClientAiService.ready();
assert.equal(staleMigrationPosts, 0, 'stale legacy config overwrote an existing Java config');
assert.equal(readySandbox.window.FeMonsterClientAiService.load().model.model, 'current-model');

function createIsolatedService(fetchImpl, localStorageImpl, label) {
  const isolatedSandbox = {
    AbortController,
    Blob,
    crypto,
    CustomEvent: sandbox.CustomEvent,
    DOMException,
    Response,
    ReadableStream,
    TextDecoder,
    TextEncoder,
    URL,
    clearTimeout,
    console,
    fetch: fetchImpl,
    setTimeout,
    window: {
      fetch: fetchImpl,
      localStorage: localStorageImpl,
      dispatchEvent: () => {},
      addEventListener: () => {},
    },
  };
  isolatedSandbox.window.window = isolatedSandbox.window;
  isolatedSandbox.window.AbortController = AbortController;
  isolatedSandbox.window.CustomEvent = isolatedSandbox.CustomEvent;
  isolatedSandbox.window.crypto = crypto;
  isolatedSandbox.window.URL = URL;
  isolatedSandbox.window.setTimeout = setTimeout;
  isolatedSandbox.window.clearTimeout = clearTimeout;
  vm.runInContext(source, vm.createContext(isolatedSandbox), { filename: `${servicePath}:${label}` });
  return isolatedSandbox.window.FeMonsterClientAiService;
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const corruptLegacyStorage = new Map([[legacyKey, '{broken legacy JSON']]);
let corruptLegacyPosts = 0;
const missingSnapshot = {
  ok: true,
  configState: 'missing',
  revision: 0,
  modelMode: 'server',
  ttsMode: 'server',
  model: { provider: '', baseUrl: '', model: '', voice: '', hasApiKey: false, keyLast4: '', ready: false },
  tts: { provider: '', baseUrl: '', model: '', voice: '', hasApiKey: false, keyLast4: '', ready: false },
};
const corruptLegacyFetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (url === '/api/client-ai/providers' && method === 'GET') return jsonResponse(providerCatalogFixture);
  if (url === '/api/client-ai/config' && method === 'GET') return jsonResponse(missingSnapshot);
  if (url === '/api/client-ai/config' && method === 'POST') {
    corruptLegacyPosts += 1;
    return jsonResponse(missingSnapshot);
  }
  throw new Error(`unexpected corrupt-legacy request ${method} ${url}`);
};
const corruptLegacyService = createIsolatedService(corruptLegacyFetch, {
  getItem: (key) => corruptLegacyStorage.get(key) ?? null,
  setItem: () => { throw new Error('client AI must not write localStorage'); },
  removeItem: (key) => corruptLegacyStorage.delete(key),
}, 'corrupt-legacy');
const corruptReady = await corruptLegacyService.ready();
assert.equal(corruptLegacyPosts, 0, 'corrupt legacy JSON was posted to Java');
assert.equal(corruptLegacyStorage.has(legacyKey), false, 'corrupt legacy JSON was not discarded');
assert.equal(corruptReady.configState, 'missing', 'corrupt legacy JSON changed missing Java state to unavailable');
assert.equal(corruptReady.ok, true, 'corrupt legacy JSON disabled the Java-owned configuration service');
assert.equal(corruptLegacyService.load().configState, 'missing');

function orderedSnapshot(revision, model, hasApiKey = false, keyLast4 = '') {
  return {
    ...missingSnapshot,
    configState: 'ready',
    revision,
    modelMode: 'custom',
    model: {
      provider: 'custom',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model,
      voice: '',
      hasApiKey,
      keyLast4,
      ready: true,
    },
  };
}

const orderedPosts = [];
const orderedResponses = [];
const orderedFetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (url === '/api/client-ai/providers' && method === 'GET') return jsonResponse(providerCatalogFixture);
  if (url === '/api/client-ai/config' && method === 'GET') return jsonResponse(missingSnapshot);
  if (url === '/api/client-ai/config' && method === 'POST') {
    orderedPosts.push(JSON.parse(options.body));
    const response = deferred();
    orderedResponses.push(response);
    return response.promise;
  }
  throw new Error(`unexpected ordered-save request ${method} ${url}`);
};
const orderedService = createIsolatedService(orderedFetch, {
  getItem: () => null,
  setItem: () => { throw new Error('client AI must not write localStorage'); },
  removeItem: () => {},
}, 'ordered-save');
await orderedService.ready();
const firstSave = orderedService.save({
  modelMode: 'custom',
  model: { provider: 'custom', baseUrl: 'http://127.0.0.1:11434/v1', model: 'first-model' },
});
const secondSave = orderedService.save({
  modelMode: 'custom',
  model: { provider: 'custom', baseUrl: 'http://127.0.0.1:11434/v1', model: 'second-model' },
});
await waitUntil(() => orderedPosts.length === 1, 'first deferred save never started');
assert.equal(orderedPosts[0].model.model, 'first-model');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(orderedPosts.length, 1, 'second save started before the first response settled');
orderedResponses[0].resolve(jsonResponse(orderedSnapshot(1, 'first-model')));
await firstSave;
await waitUntil(() => orderedPosts.length === 2, 'second deferred save did not start after the first settled');
assert.equal(orderedPosts[1].model.model, 'second-model');
orderedResponses[1].resolve(jsonResponse(orderedSnapshot(2, 'second-model')));
const secondSaveResult = await secondSave;
assert.equal(secondSaveResult.model.model, 'second-model');
assert.equal(orderedService.load().model.model, 'second-model', 'late first response overwrote the second save');

const credentialPosts = [];
const credentialResponses = [];
const credentialFetch = async (url, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  if (url === '/api/client-ai/providers' && method === 'GET') return jsonResponse(providerCatalogFixture);
  if (url === '/api/client-ai/config' && method === 'GET') {
    return jsonResponse(orderedSnapshot(5, 'credential-model', true, 'old1'));
  }
  if (url === '/api/client-ai/config' && method === 'POST') {
    credentialPosts.push(JSON.parse(options.body));
    const response = deferred();
    credentialResponses.push(response);
    return response.promise;
  }
  throw new Error(`unexpected credential-save request ${method} ${url}`);
};
const credentialService = createIsolatedService(credentialFetch, {
  getItem: () => null,
  setItem: () => { throw new Error('client AI must not write localStorage'); },
  removeItem: () => {},
}, 'credential-save');
await credentialService.ready();
const clearCredential = credentialService.save({ model: {} }, { clearModelApiKey: true });
const replaceCredential = credentialService.save({ model: { apiKey: 'sk-replacement-fixture' } });
await waitUntil(() => credentialPosts.length === 1, 'credential clear never started');
assert.equal(credentialPosts[0].model.clearApiKey, true, 'credential clear flag was not sent first');
assert.equal(Object.hasOwn(credentialPosts[0].model, 'apiKey'), false, 'credential clear leaked an API key');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(credentialPosts.length, 1, 'replacement credential POST overtook the pending clear');
credentialResponses[0].resolve(jsonResponse(orderedSnapshot(6, 'credential-model', false, '')));
await clearCredential;
await waitUntil(() => credentialPosts.length === 2, 'replacement credential POST did not start after clear');
assert.equal(credentialPosts[1].model.apiKey, 'sk-replacement-fixture');
assert.equal(Object.hasOwn(credentialPosts[1].model, 'clearApiKey'), false,
  'replacement credential POST retained the earlier clear flag');
credentialResponses[1].resolve(jsonResponse(orderedSnapshot(7, 'credential-model', true, 'ture')));
const replacementResult = await replaceCredential;
assert.equal(replacementResult.model.hasApiKey, true);
assert.equal(replacementResult.model.keyLast4, 'ture');
assert.equal(credentialService.load().model.hasApiKey, true, 'clear response overwrote replacement credential state');

for (const [relative, contractSource] of installerContractSources) {
  assert.match(contractSource, /web\\client-ai-service\.js/,
    `${relative} does not require the Java-backed client AI browser module`);
}

console.log(JSON.stringify({
  ok: true,
  legacySecretMigrated: true,
  browserStoresNoSecret: true,
  streamWhitespacePreserved: true,
  abortPropagated: true,
}, null, 2));
