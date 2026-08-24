import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'client-ai-tts-toggle-probe');
const classes = path.join(scratch, 'classes');
const dataDir = path.join(scratch, 'data');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  'D:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(fs.existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(fs.existsSync) || 'javac';

fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(classes, { recursive: true });

function run(command, args, timeout = 20_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp') },
  });
  assert.equal(result.error?.code, undefined, `probe process error: ${result.error?.message || ''}`);
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-d', classes,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/ai/AiProviderCatalog.java'),
    path.join(root, 'src/main/java/com/femonster/ai/tts/DoubaoV3Config.java'),
    path.join(root, 'src/main/java/com/femonster/core/ClientAiException.java'),
    path.join(root, 'src/main/java/com/femonster/core/ClientAiGateway.java'),
    path.join(root, 'src/test/java/com/femonster/core/ClientAiTtsToggleProbe.java'),
  ]);
  const javaOutput = run(java, [
    '-cp', classes,
    'com.femonster.core.ClientAiTtsToggleProbe',
    dataDir,
  ]);
  assert.match(javaOutput, /ClientAiTtsToggleProbe passed/);

  const servicePath = path.join(root, 'web/client-ai-service.js');
  const serviceSource = fs.readFileSync(servicePath, 'utf8');
  const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const posts = [];
  let speechRequests = 0;
  let snapshot = {
    ok: true,
    configState: 'ready',
    revision: 4,
    modelMode: 'custom',
    ttsMode: 'custom',
    ttsEnabled: true,
    model: {
      provider: 'custom', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen-fixture',
      voice: '', hasApiKey: false, keyLast4: '', ready: true, keylessLoopback: true,
    },
    tts: {
      provider: 'openai-tts', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts',
      voice: 'alloy', hasApiKey: true, keyLast4: 'ture', ready: true, keylessLoopback: false,
    },
  };
  const catalog = {
    schema: 'fe-monster.ai-provider-catalog/v1',
    revision: 1,
    providers: [{
      id: 'openai-tts', kind: 'tts', displayName: 'OpenAI TTS', protocol: 'openai-compatible',
      implementationStatus: 'ready', capabilities: ['tts.one-shot'], authModes: ['api-key'], links: {},
    }],
  };
  const json = (body) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const fakeFetch = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (url === '/api/client-ai/config' && method === 'GET') return json(snapshot);
    if (url === '/api/client-ai/providers' && method === 'GET') return json(catalog);
    if (url === '/api/client-ai/config' && method === 'POST') {
      const patch = JSON.parse(options.body);
      posts.push(patch);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        ...(Object.hasOwn(patch, 'ttsEnabled') ? { ttsEnabled: patch.ttsEnabled } : {}),
      };
      return json(snapshot);
    }
    if (url === '/api/client-ai/tts') {
      speechRequests += 1;
      return new Response(new Uint8Array([0x49, 0x44, 0x33]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
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
      localStorage: { getItem: () => null, removeItem: () => {}, setItem: () => assert.fail('must not write localStorage') },
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
  assert.equal(service.load().ttsEnabled, true, 'redacted snapshot dropped the client TTS switch');
  assert.equal(service.isCustomTts(), true, 'enabled configured client TTS is not active');

  const disabled = await service.save({ ttsEnabled: false });
  assert.equal(posts.at(-1)?.ttsEnabled, false, 'browser did not patch the Java-owned TTS switch');
  assert.equal(disabled.ttsEnabled, false, 'disabled state was not reflected to the UI');
  assert.equal(service.isCustomModel(), true, 'disabling TTS disabled text inference');
  assert.equal(service.isCustomTts(), false, 'disabled TTS remained active');
  assert.equal(disabled.tts.voice, 'alloy', 'disabling TTS erased the selected voice');
  assert.equal(disabled.tts.hasApiKey, true, 'disabling TTS erased the credential marker');
  await assert.rejects(
    service.synthesizeSpeech(service.load(), 'must stay text-only', { requestId: 'disabled-browser-probe' }),
    /关闭|disabled/i,
  );
  assert.equal(speechRequests, 0, 'disabled client TTS still sent a synthesis request');

  const enabled = await service.save({ ttsEnabled: true });
  assert.equal(enabled.ttsEnabled, true, 'client TTS could not be re-enabled');
  assert.equal(enabled.tts.voice, 'alloy', 're-enabling TTS changed the selected voice');
  assert.equal(enabled.tts.hasApiKey, true, 're-enabling TTS lost the credential marker');

  assert.match(html, /id=["']aiServiceTtsEnabledToggle["'][^>]*role=["']switch["']/,
    'settings UI is missing an accessible client TTS switch');
  assert.match(html, /aiServiceTtsEnabledToggle[^>]*aria-checked=/,
    'client TTS switch has no accessible checked state');
  assert.match(appSource, /aiServiceTtsEnabledToggle/,
    'client TTS switch is not wired by the settings controller');
  assert.match(appSource, /save\(\{\s*ttsEnabled(?:\s*:|\s*\})/,
    'client TTS switch does not persist through the Java-owned service');

  console.log(JSON.stringify({
    ok: true,
    javaPersisted: true,
    textInferencePreserved: true,
    disabledSynthesisBlocked: true,
    providerStatePreserved: true,
    accessibleControl: true,
  }, null, 2));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
