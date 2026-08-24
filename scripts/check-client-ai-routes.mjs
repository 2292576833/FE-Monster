import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', `client-ai-routes-${process.pid}`);
const jar = path.join(root, 'out', 'fe-monster-java.jar');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  'C:\\Program Files\\Java\\jdk-17',
  path.join(root, 'runtime', 'java'),
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes
  .map((home) => path.join(home, 'bin', `java${suffix}`))
  .find(existsSync) || 'java';
const javac = javaHomes
  .map((home) => path.join(home, 'bin', `javac${suffix}`))
  .find(existsSync) || 'javac';

function runIsolated(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  assert.equal(result.error?.code, undefined, `isolated probe process error: ${result.error?.message || ''}`);
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function runHttpModuleProbe() {
  const classes = path.join(scratch, 'http-module-classes');
  const mainSources = path.join(root, 'src', 'main', 'java');
  const testSources = path.join(root, 'src', 'test', 'java');
  const moduleSource = path.join(mainSources, 'com', 'femonster', 'api', 'ClientAiHttpModule.java');
  const probeSource = path.join(testSources, 'com', 'femonster', 'api', 'ClientAiHttpModuleProbe.java');
  mkdirSync(classes, { recursive: true });
  runIsolated(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-sourcepath', `${mainSources}${path.delimiter}${testSources}`,
    '-d', classes,
    moduleSource,
    probeSource,
  ]);
  const output = runIsolated(java, ['-cp', classes, 'com.femonster.api.ClientAiHttpModuleProbe']);
  assert.match(output, /ClientAiHttpModuleProbe passed/);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  response.end(body);
}

async function waitForJavaUrl(child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = output().match(/URL:\s+http:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) return `http://127.0.0.1:${match[1]}`;
    if (child.exitCode !== null) {
      throw new Error(`Java backend exited before listening (${child.exitCode})\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for isolated Java backend\n${output()}`);
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function sameOriginHeaders(base) {
  return {
    Origin: base,
    Referer: `${base}/`,
    'Sec-Fetch-Site': 'same-origin',
  };
}

async function postJson(base, pathname, payload) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: {
      ...sameOriginHeaders(base),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function assertStatus(response, expected, label) {
  if (response.status === expected) return;
  const body = await response.text();
  assert.fail(`${label}: expected HTTP ${expected}, got ${response.status}: ${body}`);
}

function assertNoCredentialFields(value) {
  if (Array.isArray(value)) return value.forEach(assertNoCredentialFields);
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:apiKey|accessKey|authorization|secret|credential)$/i,
      `public provider catalog exposed ${key}`);
    assertNoCredentialFields(item);
  }
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(path.join(scratch, 'data'), { recursive: true });
mkdirSync(path.join(scratch, 'temp'), { recursive: true });

let upstreamHits = 0;
let lastAuthorization = '';
let lastChatBody = null;
let lastTtsBody = null;
let slowAborted = false;
let slowStartedResolve;
const slowStarted = new Promise((resolve) => { slowStartedResolve = resolve; });
const upstream = http.createServer(async (request, response) => {
  upstreamHits += 1;
  lastAuthorization = String(request.headers.authorization || '');
  const body = await readJsonBody(request);
  if (request.url === '/v1/chat/completions') {
    lastChatBody = body;
    if (body.scenario === 'slow') {
      slowStartedResolve();
      request.once('aborted', () => { slowAborted = true; });
      response.once('close', () => {
        if (!response.writableEnded) slowAborted = true;
      });
      setTimeout(() => {
        if (!response.destroyed) sendJson(response, 200, {
          choices: [{ message: { role: 'assistant', content: 'too late' } }],
        });
      }, 5_000).unref();
      return;
    }
    sendJson(response, 200, {
      choices: [{ message: { role: 'assistant', content: 'route-chain-ok' } }],
    });
    return;
  }
  if (request.url === '/v1/audio/speech') {
    lastTtsBody = body;
    const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x05, 0x06]);
    response.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
    });
    response.end(audio);
    return;
  }
  sendJson(response, 404, { error: 'not found' });
});

let child;
try {
  runHttpModuleProbe();
  assert.ok(existsSync(jar), 'Run scripts/build-java.ps1 before the client AI route check');
  const upstreamPort = await listen(upstream);
  const preferredPort = await reservePort();
  let javaOutput = '';
  child = spawn(java, ['-jar', jar, '--server'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: path.join(scratch, 'temp'),
      TMP: path.join(scratch, 'temp'),
      FE_MONSTER_ROOT: root,
      FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
      FE_MONSTER_DATA_DIR: path.join(scratch, 'data'),
      FE_MONSTER_PORT: String(preferredPort),
      FE_MONSTER_BIND: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { javaOutput += chunk; });
  child.stderr.on('data', (chunk) => { javaOutput += chunk; });

  const base = await waitForJavaUrl(child, () => javaOutput);
  const headers = sameOriginHeaders(base);
  const versionResponse = await fetch(`${base}/api/app/version`, { headers });
  assert.equal(versionResponse.status, 200, `isolated backend health failed: ${javaOutput}`);

  const providersResponse = await fetch(`${base}/api/client-ai/providers`, { headers });
  await assertStatus(providersResponse, 200, 'provider catalog');
  assert.match(providersResponse.headers.get('cache-control') || '', /no-store/i);
  const providers = await providersResponse.json();
  assert.equal(providers.schema, 'fe-monster.ai-provider-catalog/v1');
  const doubaoDescriptor = providers.providers.find((item) => item.id === 'volcengine-doubao-tts-v3');
  assert.ok(doubaoDescriptor, 'provider catalog omitted Doubao V3');
  assert.equal(doubaoDescriptor.protocol, 'volcengine-tts-v3');
  assert.equal(doubaoDescriptor.implementationStatus, 'ready');
  assert.match(doubaoDescriptor.links.console, /^https:\/\/console\.volcengine\.com\//);
  assert.match(doubaoDescriptor.links.docs, /^https:\/\/www\.volcengine\.com\//);
  assertNoCredentialFields(providers);

  const upstreamBase = `http://127.0.0.1:${upstreamPort}/v1`;
  const configureResponse = await postJson(base, '/api/client-ai/config', {
    modelMode: 'custom',
    ttsMode: 'custom',
    model: {
      provider: 'custom',
      baseUrl: upstreamBase,
      model: 'fixture-chat-model',
      clearApiKey: true,
    },
  });
  await assertStatus(configureResponse, 200, 'configure');
  const configured = await configureResponse.json();
  assert.equal(configured.model.ready, true);
  assert.equal(JSON.stringify(configured).includes('apiKey'), false, 'public config exposed apiKey');

  const configResponse = await fetch(`${base}/api/client-ai/config`, { headers });
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.equal(config.model.hasApiKey, false);
  assert.equal(config.tts.hasApiKey, false);

  const chatResponse = await postJson(base, '/api/client-ai/chat', {
    requestId: 'route-chat-1',
    payload: {
      model: 'browser-must-not-own-model',
      stream: false,
      messages: [{ role: 'user', content: 'hello' }],
    },
  });
  await assertStatus(chatResponse, 200, 'chat');
  assert.equal((await chatResponse.json()).choices[0].message.content, 'route-chain-ok');
  assert.equal(lastChatBody.model, 'fixture-chat-model');
  assert.equal(lastAuthorization, '', 'keyless loopback emitted Authorization');

  const hitsBeforeLoopbackTts = upstreamHits;
  const loopbackTtsResponse = await postJson(base, '/api/client-ai/config', {
    tts: {
      provider: 'custom-openai-compatible-tts',
      baseUrl: upstreamBase,
      model: 'fixture-tts-model',
      voice: 'fixture-voice',
      clearApiKey: true,
    },
  });
  await assertStatus(loopbackTtsResponse, 400, 'reject loopback client TTS');
  assert.equal((await loopbackTtsResponse.json()).errorCode, 'client_ai_bad_request');
  assert.equal(upstreamHits, hitsBeforeLoopbackTts,
    'a loopback client TTS configuration reached the local Python/HTTP service');

  const hitsBeforeProtected = upstreamHits;
  const protectedResponse = await postJson(base, '/api/client-ai/chat', {
    baseUrl: `http://127.0.0.1:${upstreamPort}`,
    payload: { messages: [] },
  });
  assert.equal(protectedResponse.status, 400);
  assert.equal((await protectedResponse.json()).errorCode, 'client_ai_bad_request');
  assert.equal(upstreamHits, hitsBeforeProtected, 'browser routing field reached upstream');

  const slowResponsePromise = postJson(base, '/api/client-ai/chat', {
    requestId: 'route-cancel-1',
    payload: { messages: [], scenario: 'slow' },
  });
  await Promise.race([
    slowStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('slow upstream did not start')), 3_000)),
  ]);
  const cancelResponse = await postJson(base, '/api/client-ai/cancel', { requestId: 'route-cancel-1' });
  await assertStatus(cancelResponse, 200, 'cancel');
  assert.equal((await cancelResponse.json()).cancelled, true);
  const slowResponse = await slowResponsePromise;
  await assertStatus(slowResponse, 499, 'cancelled chat');
  assert.equal((await slowResponse.json()).errorCode, 'client_ai_cancelled');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(slowAborted, true, 'Java cancellation did not close the upstream request');

  const doubaoConfigureResponse = await postJson(base, '/api/client-ai/config', {
    ttsMode: 'custom',
    tts: {
      provider: 'volcengine-doubao-tts-v3',
      resourceId: 'seed-tts-2.0',
      modelVariant: 'seed-tts-2.0-standard',
      voice: '',
      output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
      prosody: { emotion: '温柔', emotionScale: 4, speechRate: 0, loudnessRate: 0 },
      clearCredential: true,
    },
  });
  await assertStatus(doubaoConfigureResponse, 200, 'configure keyless Doubao');
  const doubaoConfig = await doubaoConfigureResponse.json();
  assert.equal(doubaoConfig.tts.provider, 'volcengine-doubao-tts-v3');
  assert.equal(doubaoConfig.tts.protocol, 'volcengine-tts-v3');
  assert.equal(doubaoConfig.tts.hasCredential, false);
  assert.equal(doubaoConfig.tts.ready, false);
  assert.equal(doubaoConfig.tts.voice, '', 'incomplete Doubao draft must remain editable after provider selection');
  assert.equal(JSON.stringify(doubaoConfig).includes('fixture-secret'), false);

  const unreadySession = await postJson(base, '/api/client-ai/tts/sessions', {
    requestId: 'route-doubao-unready-1',
  });
  await assertStatus(unreadySession, 409, 'unconfigured Doubao realtime session');
  assert.equal((await unreadySession.json()).errorCode, 'client_ai_not_ready');

  const missingSessionId = '11111111-1111-4111-8111-111111111111';
  const deleteMissingSession = await fetch(`${base}/api/client-ai/tts/sessions/${missingSessionId}`, {
    method: 'DELETE',
    headers,
  });
  await assertStatus(deleteMissingSession, 200, 'delete missing realtime session');
  assert.deepEqual(await deleteMissingSession.json(), {
    ok: true,
    sessionId: missingSessionId,
    deleted: false,
  });

  console.log(JSON.stringify({
    ok: true,
    javaPort: Number(new URL(base).port),
    keylessLoopback: true,
    browserRoutingRejected: true,
    clientTtsCloudOnly: true,
    cancelClosedUpstream: true,
    providerCatalog: true,
    doubaoUnreadyFailsClosed: true,
    clientAiHttpModuleSeam: true,
  }, null, 2));
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await waitForExit(child);
  }
  if (upstream.listening) await closeServer(upstream);
  rmSync(scratch, { recursive: true, force: true });
}
