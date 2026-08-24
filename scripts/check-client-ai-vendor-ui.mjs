import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const servicePath = path.join(root, 'web', 'client-ai-service.js');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

const catalog = {
  schema: 'fe-monster.ai-provider-catalog/v1',
  revision: 1,
  providers: [
    {
      id: 'deepseek', kind: 'chat', displayName: 'DeepSeek', protocol: 'openai-compatible',
      implementationStatus: 'ready', capabilities: ['chat.stream'], authModes: ['api-key'],
      links: { console: 'https://platform.deepseek.com/api_keys', docs: 'https://platform.deepseek.com/api-docs' },
    },
    {
      id: 'volcengine-doubao-tts-v3', kind: 'tts', displayName: '豆包实时语音',
      protocol: 'volcengine-tts-v3', implementationStatus: 'ready',
      capabilities: ['tts.stream-output', 'tts.duplex-text', 'tts.emotion'],
      authModes: ['api-key', 'legacy-app-access'],
      links: {
        console: 'https://console.volcengine.com/speech/new/setting/apikeys?projectName=default',
        docs: 'https://www.volcengine.com/docs/6561/2532486?lang=zh',
      },
    },
    {
      id: 'azure-speech', kind: 'tts', displayName: 'Azure AI Speech', protocol: 'azure-speech',
      implementationStatus: 'planned', capabilities: ['tts.one-shot'], authModes: ['provider-specific'],
      links: { console: 'https://ai.azure.com/', docs: 'https://ai.azure.com/' },
    },
  ],
};

const snapshot = {
  ok: true,
  configState: 'ready',
  revision: 3,
  modelMode: 'custom',
  ttsMode: 'custom',
  model: {
    provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
    voice: '', hasApiKey: true, keyLast4: 'ture', ready: true,
  },
  tts: {
    provider: 'volcengine-doubao-tts-v3', providerId: 'volcengine-doubao-tts-v3',
    protocol: 'volcengine-tts-v3', resourceId: 'seed-tts-2.0', modelVariant: 'seed-tts-2.0-standard',
    model: 'seed-tts-2.0-standard', voice: 'doubao:fixture-speaker', authMode: 'api-key',
    hasCredential: true, hasApiKey: true, keyLast4: '', ready: true,
    output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
    prosody: { emotion: '', emotionScale: 4, speechRate: 0, loudnessRate: 0 },
  },
};

const requests = [];
async function fakeFetch(url, options = {}) {
  requests.push({ url: String(url), method: String(options.method || 'GET').toUpperCase() });
  if (url === '/api/client-ai/config') {
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url === '/api/client-ai/providers') {
    return new Response(JSON.stringify(catalog), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`unexpected ${options.method || 'GET'} ${url}`);
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
    localStorage: { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('must not persist catalog'); } },
    dispatchEvent: () => {},
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.crypto = crypto;
vm.runInContext(serviceSource, vm.createContext(sandbox), { filename: servicePath });

const service = sandbox.window.FeMonsterClientAiService;
await service.ready();
assert.ok(requests.some((request) => request.url === '/api/client-ai/providers'), 'provider catalog was not requested');
assert.equal(service.catalog().schema, catalog.schema);
assert.deepEqual(
  Array.from(service.providers('tts'), (provider) => provider.id),
  ['volcengine-doubao-tts-v3', 'azure-speech'],
  'TTS provider catalog is incomplete or reordered',
);
assert.equal(service.provider('volcengine-doubao-tts-v3').protocol, 'volcengine-tts-v3');
assert.equal(
  service.officialLink('volcengine-doubao-tts-v3', 'console'),
  catalog.providers[1].links.console,
  'official console link was not exposed',
);
assert.equal(service.officialLink('unknown', 'console'), '', 'unknown provider produced a link');
function assertNoSecretFields(value) {
  if (Array.isArray(value)) return value.forEach(assertNoSecretFields);
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:apiKey|accessKey|Authorization|secret|credential)$/i,
      `public provider catalog contains credential field ${key}`);
    assertNoSecretFields(item);
  }
}
assertNoSecretFields(service.catalog());

for (const id of [
  'aiServiceModelConsoleLink', 'aiServiceModelDocsLink',
  'aiServiceTtsConsoleLink', 'aiServiceTtsDocsLink',
  'aiServiceTtsAuthModeSelect', 'aiServiceTtsResourceId',
  'aiServiceTtsAppId', 'aiServiceTtsAccessKey',
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `settings UI is missing ${id}`);
}
assert.match(html, /豆包(?:\s*V3)?(?:\s*双向)?\s*实时语音/);
assert.match(appSource, /ai\.providers\.query/);
assert.match(appSource, /ai\.model\.config\.query/);
assert.match(appSource, /ai\.tts\.config\.query/);
assert.match(appSource, /ai\.model\.select/);
assert.match(appSource, /ai\.tts\.provider\.select/);
assert.match(appSource, /ai\.tts\.voice\.select/);
assert.match(appSource, /ai\.tts\.prosody\.set/);
assert.doesNotMatch(appSource, /command:\s*['"]ai\.[^'"]*(?:key|token|credential|base-url|endpoint)/i,
  'command catalog exposes credential or endpoint mutation');

console.log(JSON.stringify({
  ok: true,
  providerCatalog: true,
  officialLinks: true,
  doubaoSettings: true,
  controlledCommands: true,
}));
