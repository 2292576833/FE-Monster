import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign as ed25519Sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const serverEntry = path.resolve(root, '..', 'FE moster server', 'server.js');
assert.ok(existsSync(serverEntry), `community server source was not found: ${serverEntry}`);

function mockModelServer() {
  const sampleRate = 16_000;
  const sampleCount = 800;
  const dataBytes = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(dataBytes, 40);

  return http.createServer(async (request, response) => {
    if (request.url === '/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-v4-flash' }] }));
      return;
    }
    if (request.url === '/tts' && request.method === 'POST') {
      for await (const _chunk of request) {}
      response.writeHead(200, {
        'content-type': 'audio/wav',
        'content-length': wave.length
      });
      response.end(wave);
      return;
    }
    if (request.url !== '/chat/completions' || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    for await (const _chunk of request) {}
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Remote pet chat is connected.' } }] })}\n\n`);
    response.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
}

async function configuredRemoteEndpoint() {
  const configPath = path.join(root, 'data', 'community-server-url.txt');
  const pinPath = path.join(root, 'data', 'community-server-tls-pin.txt');
  assert.ok(existsSync(configPath), 'release community URL configuration is missing');
  assert.ok(existsSync(pinPath), 'release community TLS pin configuration is missing');

  const baseUrl = new URL((await readFile(configPath, 'utf8')).replace(/^\uFEFF/, '').trim());
  assert.equal(baseUrl.protocol, 'https:', 'installed clients must use a public HTTPS community endpoint');
  assert.ok(!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname.toLowerCase()),
    'installed clients must not use a loopback community endpoint');
  const pins = (await readFile(pinPath, 'utf8'))
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith('#'))
    .map((value) => value.replace(/^sha256:/i, '').replace(/[^a-f0-9]/gi, '').toUpperCase());
  assert.ok(pins.length > 0, 'release community TLS pin list is empty');
  for (const pin of pins) assert.match(pin, /^[A-F0-9]{64}$/, 'release community TLS pin is invalid');
  return { baseUrl, pins };
}

function requestPinnedHealth({ baseUrl, pins }) {
  const healthUrl = new URL(`${baseUrl.href.replace(/\/$/, '')}/health`);
  return new Promise((resolve, reject) => {
    const request = https.get(healthUrl, {
      rejectUnauthorized: false,
      timeout: 8_000,
      headers: { Accept: 'application/json' }
    }, (response) => {
      try {
        const certificate = response.socket.getPeerCertificate(true);
        assert.ok(certificate?.raw, 'remote community endpoint did not expose a peer certificate');
        const fingerprint = createHash('sha256').update(certificate.raw).digest('hex').toUpperCase();
        assert.ok(pins.includes(fingerprint),
          `remote community certificate ${fingerprint} does not match the release pin list`);
        const validFrom = Date.parse(certificate.valid_from || '');
        const validTo = Date.parse(certificate.valid_to || '');
        assert.ok(Number.isFinite(validFrom) && validFrom <= Date.now(), 'remote community certificate is not active');
        assert.ok(Number.isFinite(validTo) && validTo > Date.now(), 'remote community certificate has expired');
      } catch (error) {
        response.resume();
        reject(error);
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(text || '{}');
          assert.equal(response.statusCode, 200, text);
          assert.equal(payload.ok, true, text);
          assert.equal(payload.service, 'fe-monster-community', text);
          resolve({ healthUrl: healthUrl.href, status: response.statusCode, service: payload.service });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('remote pinned health request timed out')));
    request.once('error', reject);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function lanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const ipv4 = entry.family === 'IPv4' || entry.family === 4;
      if (ipv4 && !entry.internal && !entry.address.startsWith('169.254.')) return entry.address;
    }
  }
  throw new Error('no non-loopback IPv4 address is available for the remote-client test');
}

function request(hostname, port, pathname, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body == null ? '' : JSON.stringify(body);
    const request = http.request({
      hostname,
      port,
      path: pathname,
      method,
      headers: {
        ...(encoded ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(encoded)
        } : {}),
        ...headers
      },
      timeout: 5_000
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch {}
        resolve({ status: response.statusCode, payload, text });
      });
    });
    request.once('timeout', () => request.destroy(new Error('request timed out')));
    request.once('error', reject);
    if (encoded) request.write(encoded);
    request.end();
  });
}

function deviceFixture(computerId) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return {
    computerId,
    keyId: `device-${createHash('sha256').update(publicKeyDer).digest('base64url')}`,
    privateKey,
    publicKey: publicKeyDer.toString('base64url')
  };
}

function signedHeaders(device, method, pathname, signedContent) {
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const contentHash = createHash('sha256').update(String(signedContent || ''), 'utf8').digest('hex');
  const base = [String(method).toUpperCase(), pathname, timestamp, nonce, contentHash].join('\n');
  return {
    'X-FE-Device-Key': device.keyId,
    'X-FE-Computer-Id': device.computerId,
    'X-FE-Timestamp': timestamp,
    'X-FE-Nonce': nonce,
    'X-FE-Signature': ed25519Sign(null, Buffer.from(base, 'utf8'), device.privateKey).toString('base64url')
  };
}

async function waitForHealth(hostname, port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(hostname, port, '/health');
      if (response.status === 200 && response.payload.ok === true) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('temporary community server did not become reachable through the LAN address');
}

const releaseEndpoint = await configuredRemoteEndpoint();
const releaseHealth = await requestPinnedHealth(releaseEndpoint);
const port = await freePort();
const modelPort = await freePort();
const host = lanAddress();
const scratchParent = path.join(root, 'tmp');
await mkdir(scratchParent, { recursive: true });
const dataDir = await mkdtemp(path.join(scratchParent, 'fe-pet-remote-install-'));
const model = mockModelServer();
await new Promise((resolve, reject) => {
  model.once('error', reject);
  model.listen(modelPort, '127.0.0.1', resolve);
});
const child = spawn(process.execPath, [serverEntry], {
  cwd: path.dirname(serverEntry),
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    FE_MONSTER_COMMUNITY_HOST: '0.0.0.0',
    FE_MONSTER_COMMUNITY_PORT: String(port),
    FE_MONSTER_COMMUNITY_DATA: dataDir,
    FE_DEEPSEEK_BASE_URL: `http://127.0.0.1:${modelPort}`,
    FE_DEEPSEEK_API_KEY: 'remote-install-test-key',
    FE_DEEPSEEK_MODEL: 'remote-install-fixture-model',
    DEEPSEEK_TTS_ENABLED: 'true',
    DEEPSEEK_TTS_URL: `http://127.0.0.1:${modelPort}/tts`,
    DEEPSEEK_TTS_API_KEY: 'remote-install-fixture-tts-key',
    DEEPSEEK_TTS_MODEL: 'remote-install-fixture-tts',
    DEEPSEEK_TTS_VOICE: 'remote-install-fixture-voice'
  }
});

try {
  await waitForHealth(host, port);
  const computerId = 'remote-install-computer-qa';
  const device = deviceFixture(computerId);
  const enrollmentPath = '/api/community/device/enroll';
  const enrollmentBody = {
    computerId,
    computerIdSource: 'fixture',
    keyId: device.keyId,
    publicKey: device.publicKey
  };
  const enrollmentText = JSON.stringify(enrollmentBody);
  const enrollment = await request(host, port, enrollmentPath, {
    method: 'POST',
    body: enrollmentBody,
    headers: signedHeaders(device, 'POST', enrollmentPath, enrollmentText)
  });
  assert.equal(enrollment.status, 200, enrollment.text);

  const registrationPath = '/api/community/register';
  const registrationBody = {
    provider: 'netease',
    platformLabel: 'NetEase Cloud Music',
    platformUserId: 'remote-install-account-qa',
    username: 'Remote install QA',
    computerId,
    computerIdSource: 'fixture'
  };
  const registration = await request(host, port, '/api/community/register', {
    method: 'POST',
    body: registrationBody,
    headers: signedHeaders(device, 'POST', registrationPath, JSON.stringify(registrationBody))
  });
  assert.equal(registration.status, 200, registration.text);
  assert.equal(registration.payload.ok, true, registration.text);
  const feId = String(registration.payload.profile?.feId || '');
  assert.match(feId, /^\d{8}$/);

  const query = new URLSearchParams({ feId, computerId }).toString();
  const petStatusPath = '/api/community/pet/status';
  const status = await request(host, port, `${petStatusPath}?${query}`, {
    headers: signedHeaders(device, 'GET', petStatusPath, `feId=${feId}`)
  });
  assert.equal(status.status, 200,
    `remote installed client could not reach pet status: ${status.text}`);
  assert.equal(status.payload.ok, true, status.text);

  const sessionPath = '/api/community/pet/sessions';
  const sessionBody = { feId, computerId, title: 'Remote install QA session' };
  const session = await request(host, port, sessionPath, {
    method: 'POST',
    body: sessionBody,
    headers: signedHeaders(device, 'POST', sessionPath, JSON.stringify(sessionBody))
  });
  assert.equal(session.status, 200,
    `remote installed client could not create a pet session: ${session.text}`);
  assert.equal(session.payload.ok, true, session.text);
  const sessionId = String(
    session.payload.session?.id
    || session.payload.sessionId
    || session.payload.session?.sessionId
    || session.payload.id
    || ''
  );
  assert.ok(sessionId, `remote installed client did not receive a pet session id: ${session.text}`);

  const chatPath = '/api/community/pet/chat';
  const chatBody = {
    feId,
    computerId,
    sessionId,
    text: 'Confirm the remote desktop pet chat path in one short sentence.',
    replyWithVoice: false,
    voiceReply: false,
    realtimeVoice: false
  };
  const chat = await request(host, port, chatPath, {
    method: 'POST',
    body: chatBody,
    headers: signedHeaders(device, 'POST', chatPath, JSON.stringify(chatBody))
  });
  assert.equal(chat.status, 202,
    `remote installed client could not submit pet chat: ${chat.text}`);
  assert.equal(chat.payload.ok, true, chat.text);
  assert.match(String(chat.payload.requestId || ''), /^pet-request-/,
    `remote pet chat did not return a request id: ${chat.text}`);
  assert.equal(chat.payload.state, 'thinking',
    `remote pet chat was not accepted for asynchronous delivery: ${chat.text}`);

  const historyPath = '/api/community/pet/history';
  let history;
  const historyDeadline = Date.now() + 15_000;
  while (Date.now() < historyDeadline) {
    const historyQuery = new URLSearchParams({ feId, computerId, sessionId }).toString();
    history = await request(host, port, `${historyPath}?${historyQuery}`, {
      headers: signedHeaders(device, 'GET', historyPath, `feId=${feId}`)
    });
    assert.equal(history.status, 200, history.text);
    const messages = Array.isArray(history.payload.session?.messages)
      ? history.payload.session.messages
      : [];
    if (messages.some((message) => message?.role === 'assistant'
      && String(message?.content || '').includes('Remote pet chat is connected.'))) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  assert.ok(history, 'remote pet chat history was never requested');
  assert.equal(history.payload.session?.state, 'idle', history.text);
  assert.ok(history.payload.session.messages.some((message) => message?.role === 'assistant'
    && String(message?.content || '').includes('Remote pet chat is connected.')),
  `remote pet chat did not complete through the model fixture: ${history.text}`);

  const narratePath = '/api/community/pet/narrate';
  const narrateBody = {
    feId,
    computerId,
    requestId: 'remote-install-narrate-qa',
    text: 'Welcome to FE Monster.'
  };
  const narrate = await request(host, port, narratePath, {
    method: 'POST',
    body: narrateBody,
    headers: signedHeaders(device, 'POST', narratePath, JSON.stringify(narrateBody))
  });
  assert.equal(narrate.status, 200,
    `remote installed client could not reach pet narration: ${narrate.text}`);
  assert.equal(narrate.payload.ok, true, narrate.text);
  assert.match(String(narrate.payload.audioId || ''), /^pet-audio-/,
    `remote pet narration did not return an audio id: ${narrate.text}`);

  const strict = await request('127.0.0.1', port, '/api/admin/security', {
    method: 'POST',
    body: { requireOfficialSignature: true }
  });
  assert.equal(strict.status, 200, strict.text);
  assert.equal(strict.payload.security?.requireOfficialSignature, true);
  const unsignedStrictStatus = await request(host, port, `/api/community/pet/status?${query}`);
  assert.equal(unsignedStrictStatus.status, 401,
    'strict signature mode accepted an unsigned remote pet request');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    releaseHealth,
    releaseTlsPins: releaseEndpoint.pins.length,
    remoteHost: host,
    compatibleModeStatus: status.status,
    compatibleModeSession: session.status,
    compatibleModeChat: chat.status,
    compatibleModeChatCompleted: history.payload.session?.state,
    compatibleModeNarrate: narrate.status,
    strictModeUnsignedStatus: unsignedStrictStatus.status
  }, null, 2)}\n`);
} finally {
  if (!child.killed) child.kill();
  model.closeAllConnections?.();
  await new Promise((resolve) => model.close(resolve));
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ]);
  await rm(dataDir, { recursive: true, force: true });
}
