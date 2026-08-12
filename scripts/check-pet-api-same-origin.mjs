import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();

function javaExecutable() {
  const candidates = [
    'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : '',
    'java'
  ];
  return candidates.find((candidate) => candidate === 'java' || existsSync(candidate)) || 'java';
}

function newestJar() {
  const out = path.join(root, 'out');
  const jars = readdirSync(out)
    .filter((name) => /^fe-monster-java-.*\.jar$/.test(name))
    .map((name) => path.join(out, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  assert.ok(jars.length, 'build the Java client before running this test');
  return jars[0];
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function request(port, pathname, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers
      },
      timeout: 3_000
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('timeout', () => request.destroy(new Error('request timed out')));
    request.once('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitUntilReady(port) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(port, '/api/app/version');
      if (response.status === 200) return;
    } catch (error) {
    }
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  throw new Error('Java client did not become ready');
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const communityStub = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'fe-monster-community' }));
    return;
  }
  if (request.url?.startsWith('/api/community/events')) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    response.end('event: community-ready\ndata: {"ok":true}\n\n');
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ ok: false, error: 'fixture route missing' }));
});
await new Promise((resolve, reject) => {
  communityStub.once('error', reject);
  communityStub.listen(0, '127.0.0.1', resolve);
});
const communityPort = communityStub.address().port;
const child = spawn(javaExecutable(), ['-jar', newestJar(), '--server'], {
  cwd: root,
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    FE_MONSTER_MAIN_PID: '',
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_COMMUNITY_URL: `http://127.0.0.1:${communityPort}`
  }
});

try {
  await waitUntilReady(port);
  const validHeaders = { Origin: origin, 'Sec-Fetch-Site': 'same-origin' };
  const evilHeaders = { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' };

  const validStatus = await request(port, '/api/community/pet/status?provider=netease', { headers: validHeaders });
  assert.equal(validStatus.status, 200, `legitimate app origin failed: ${validStatus.body}`);
  assert.notEqual(validStatus.headers['access-control-allow-origin'], '*');
  assert.equal(validStatus.headers['cross-origin-resource-policy'], 'same-origin');

  const validChat = await request(port, '/api/community/pet/chat?provider=netease', {
    method: 'POST',
    headers: validHeaders,
    body: JSON.stringify({ sessionId: 'session-test', text: 'hello' })
  });
  assert.equal(validChat.status, 200, `legitimate app mutation failed guard: ${validChat.body}`);

  const validEvents = await request(port, '/api/community/events?feId=FE-fixture', { headers: validHeaders });
  assert.equal(validEvents.status, 200, `legitimate app event stream failed: ${validEvents.body}`);
  assert.notEqual(validEvents.headers['access-control-allow-origin'], '*');
  assert.equal(validEvents.headers['cross-origin-resource-policy'], 'same-origin');

  for (const [label, pathname, options] of [
    ['history', '/api/community/pet/history?provider=netease&sessionId=session-test', {}],
    ['audio', '/api/community/pet/audio/audio-test-id?provider=netease', {}],
    ['events', '/api/community/events?feId=FE-fixture', {}],
    ['chat', '/api/community/pet/chat?provider=netease', { method: 'POST', body: JSON.stringify({ text: 'play a song' }) }],
    ['preflight', '/api/community/pet/chat?provider=netease', { method: 'OPTIONS' }]
  ]) {
    const response = await request(port, pathname, { ...options, headers: evilHeaders });
    assert.equal(response.status, 403, `${label} accepted an evil origin: ${response.body}`);
    assert.notEqual(response.headers['access-control-allow-origin'], '*', `${label} exposed wildcard CORS`);
  }

  const missingBrowserProvenance = await request(port, '/api/community/pet/status?provider=netease');
  assert.equal(missingBrowserProvenance.status, 403, 'request without app browser provenance was accepted');

  console.log(JSON.stringify({
    ok: true,
    validOrigin: validStatus.status,
    evilHistory: 403,
    evilAudio: 403,
    evilMutation: 403,
    evilPreflight: 403,
    evilEvents: 403,
    wildcardCors: false
  }, null, 2));
} finally {
  try { await request(port, '/api/app/quit'); } catch (error) {}
  if (!child.killed) child.kill();
  await new Promise((resolve) => communityStub.close(resolve));
}
