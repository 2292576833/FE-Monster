import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const servicePath = path.join(root, 'web', 'client-ai-service.js');
const source = fs.readFileSync(servicePath, 'utf8');
const sessionId = '22222222-2222-4222-8222-222222222222';
const actions = [];

const snapshot = {
  ok: true,
  configState: 'ready',
  revision: 1,
  modelMode: 'custom',
  ttsMode: 'custom',
  model: { provider: '', baseUrl: '', model: '', ready: false },
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
    ready: true,
    output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
    prosody: { emotion: '', emotionScale: 4, speechRate: 0, loudnessRate: 0 },
  },
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function fakeFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  if (url === '/api/client-ai/config' && method === 'GET') return json(snapshot);
  if (url === '/api/client-ai/providers' && method === 'GET') {
    return json({
      schema: 'fe-monster.ai-provider-catalog/v1',
      revision: 1,
      providers: [{
        id: 'volcengine-doubao-tts-v3',
        kind: 'tts',
        displayName: '豆包实时语音',
        protocol: 'volcengine-tts-v3',
        implementationStatus: 'ready',
        capabilities: ['tts.stream-output'],
        authModes: ['api-key'],
        links: {},
      }],
    });
  }
  if (url === '/api/client-ai/tts/sessions' && method === 'POST') {
    actions.push(['create', body]);
    return json({ ok: true, sessionId, requestId: body.requestId, state: 'connecting', contentType: 'audio/mpeg' });
  }
  if (url === `/api/client-ai/tts/sessions/${sessionId}/text` && method === 'POST') {
    actions.push(['text', body]);
    return json({ ok: true, sessionId, state: 'running' });
  }
  if (url === `/api/client-ai/tts/sessions/${sessionId}/finish` && method === 'POST') {
    actions.push(['finish', body]);
    return json({ ok: true, sessionId, state: 'finishing' });
  }
  if (url === `/api/client-ai/tts/sessions/${sessionId}/audio` && method === 'GET') {
    actions.push(['audio', body]);
    return new Response(new Uint8Array([0x49, 0x44, 0x33, 1]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  }
  if (url === `/api/client-ai/tts/sessions/${sessionId}` && method === 'DELETE') {
    actions.push(['delete', body]);
    return json({ ok: true, sessionId, deleted: true });
  }
  throw new Error(`unexpected request ${method} ${url}`);
}

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
    localStorage: { getItem: () => null, removeItem: () => {}, setItem: () => {} },
    dispatchEvent: () => {},
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.crypto = crypto;
sandbox.window.URL = URL;
vm.runInContext(source, vm.createContext(sandbox), { filename: servicePath });

const service = sandbox.window.FeMonsterClientAiService;
await service.ready();
const result = await service.testTts(service.load());
assert.equal(result.ok, true);
assert.ok(result.bytes > 0, 'Doubao test reported success without reading a single provider audio byte');
assert.deepEqual(actions.map(([action]) => action), ['create', 'text', 'finish', 'audio', 'delete'],
  'TTS test must verify audio before releasing the realtime session');

console.log(JSON.stringify({ ok: true, verifiedAudioBytes: result.bytes }, null, 2));
