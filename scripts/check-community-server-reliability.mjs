import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverFile = path.resolve(root, '..', 'FE moster server', 'server.js');
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'fe-community-reliability-'));

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  probe.close();
  await once(probe, 'close');
  return port;
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(2_000),
  });
  const body = await response.json();
  return { status: response.status, headers: response.headers, body };
}

function postJson(baseUrl, pathname, payload, headers = {}) {
  return requestJson(baseUrl, pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

function heldPost(baseUrl, pathname, payload, headers = {}) {
  const url = new URL(pathname, baseUrl);
  const body = JSON.stringify(payload);
  const splitAt = Math.max(1, body.length - 1);
  let request;
  const result = new Promise((resolve, reject) => {
    request = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.write(body.slice(0, splitAt));
  });
  return {
    finish() {
      request.end(body.slice(splitAt));
      return result;
    },
  };
}

async function waitForHealth(baseUrl, child, output) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`community server exited before health check\n${output()}`);
    }
    try {
      const result = await requestJson(baseUrl, '/health');
      if (result.status === 200 && result.body.ok === true) return result;
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`community server did not become healthy\n${output()}`);
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let stdout = '';
let stderr = '';
const child = spawn(process.execPath, [serverFile], {
  cwd: path.dirname(serverFile),
  env: {
    ...process.env,
    PORT: String(port),
    FE_MONSTER_COMMUNITY_HOST: '127.0.0.1',
    FE_MONSTER_COMMUNITY_DATA: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
child.stdout.on('data', (chunk) => { stdout += String(chunk); });
child.stderr.on('data', (chunk) => { stderr += String(chunk); });

try {
  const health = await waitForHealth(baseUrl, child, () => `${stdout}\n${stderr}`);
  assert.equal(health.body.protocolVersion, 2, '/health must identify community protocol version 2');
  assert.equal(
    health.body.capabilities?.avatarOrnament,
    true,
    '/health must advertise avatar ornament support',
  );
  console.log('Community server health protocol reliability PASS');

  const computerId = 'reliability-device-001';
  const registration = await postJson(baseUrl, '/api/community/register', {
    provider: 'fixture',
    platformUserId: 'parallel-profile-001',
    username: 'Initial Profile',
    computerId,
    computerIdSource: 'test',
  });
  assert.equal(registration.status, 200, registration.body.error);
  const feId = registration.body.profile.feId;
  const ornament = {
    id: 'achievement-ornament-reliability',
    achievementId: 'reliability',
    name: 'Reliability Ring',
    accent: '#12a4ef',
    equippedAt: 123456,
  };

  const registerMutation = heldPost(baseUrl, '/api/community/register', {
    provider: 'fixture',
    platformUserId: 'parallel-profile-001',
    username: 'Concurrent Register',
    computerId,
    computerIdSource: 'test',
  });
  const profileMutation = heldPost(baseUrl, '/api/community/profile', {
    feId,
    bio: 'profile mutation survived',
    avatarOrnament: ornament,
    computerId,
    computerIdSource: 'test',
  });
  const listeningMutation = heldPost(baseUrl, '/api/community/listening', {
    feId,
    listenMsDelta: 17_321,
    computerId,
    computerIdSource: 'test',
  });

  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal((await profileMutation.finish()).status, 200);
  assert.equal((await listeningMutation.finish()).status, 200);
  assert.equal((await registerMutation.finish()).status, 200);

  const userResult = await requestJson(baseUrl, `/api/community/users/${feId}`);
  assert.equal(userResult.status, 200, userResult.body.error);
  assert.equal(userResult.body.user.username, 'Concurrent Register');
  assert.equal(userResult.body.user.bio, 'profile mutation survived');
  assert.equal(userResult.body.user.listenMs, 17_321);
  assert.deepEqual(userResult.body.user.avatarOrnament, ornament);
  console.log('Community register/profile/listening concurrency reliability PASS');

  const retryHeaders = { 'Idempotency-Key': 'listening-retry-001' };
  const listeningRetryPayload = {
    feId,
    listenMsDelta: 4_321,
    computerId,
    computerIdSource: 'test',
  };
  const firstListeningAttempt = await postJson(
    baseUrl,
    '/api/community/listening',
    listeningRetryPayload,
    retryHeaders,
  );
  const repeatedListeningAttempt = await postJson(
    baseUrl,
    '/api/community/listening',
    listeningRetryPayload,
    retryHeaders,
  );
  assert.equal(firstListeningAttempt.status, 200, firstListeningAttempt.body.error);
  assert.equal(repeatedListeningAttempt.status, 200, repeatedListeningAttempt.body.error);
  assert.deepEqual(
    repeatedListeningAttempt.body,
    firstListeningAttempt.body,
    'a retried successful mutation must return its original response',
  );
  const afterRetry = await requestJson(baseUrl, `/api/community/users/${feId}`);
  assert.equal(
    afterRetry.body.user.listenMs,
    21_642,
    'one Idempotency-Key must apply an additive listening mutation only once',
  );
  const conflictingRetry = await postJson(
    baseUrl,
    '/api/community/listening',
    { ...listeningRetryPayload, listenMsDelta: 999 },
    retryHeaders,
  );
  assert.equal(conflictingRetry.status, 409,
    'reusing an Idempotency-Key with a different payload must be rejected');
  const afterConflict = await requestJson(baseUrl, `/api/community/users/${feId}`);
  assert.equal(afterConflict.body.user.listenMs, 21_642,
    'a conflicting idempotency replay must not mutate listening time');
  const preflight = await fetch(`${baseUrl}/api/community/listening`, {
    method: 'OPTIONS',
    signal: AbortSignal.timeout(2_000),
  });
  assert.match(
    preflight.headers.get('access-control-allow-headers') || '',
    /(?:^|,)\s*Idempotency-Key\s*(?:,|$)/i,
    'CORS preflight must allow the Idempotency-Key header',
  );
  console.log('Community mutation idempotency reliability PASS');
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  rmSync(dataDir, { recursive: true, force: true });
}
