import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function fixture(port, service, options = {}) {
  const server = http.createServer((request, response) => {
    if (request.url === '/health' && service === 'fe-monster-community') {
      const payload = JSON.stringify({
        ok: true,
        service,
        protocolVersion: 7,
        capabilities: {
          deviceCredentials: true,
          realtimeCommunity: true
        },
        status: 'running',
        onlineUsers: 23,
        realtimeClients: 17,
        port,
        host: '0.0.0.0',
        internalDiagnostic: 'must-not-cross-the-public-gateway'
      });
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'x-internal-health': 'must-not-cross-the-public-gateway'
      });
      response.end(payload);
      return;
    }

    if (request.url === '/api/community/stream-fixture' && service === 'fe-monster-community') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.write('first-chunk|');
      options.streamStarted?.();
      options.streamRelease.then(() => response.end('second-chunk'));
      return;
    }

    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const payload = JSON.stringify({
        ok: true,
        service,
        method: request.method,
        url: request.url,
        host: request.headers.host,
        forwardedHost: request.headers['x-forwarded-host'] || '',
        forwardedProto: request.headers['x-forwarded-proto'] || '',
        publicAccessForwarded: Boolean(request.headers['x-fe-public-access']),
        body: Buffer.concat(chunks).toString('utf8')
      });
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
      response.end(payload);
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function request(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: { host: 'community.example.test:443', ...(options.headers || {}) }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.once('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function rawRequest(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: { host: 'community.example.test:443', ...(options.headers || {}) }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function streamingRequest(port, pathname, releaseStream) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('community API response was buffered instead of streamed')), 3000);
    const chunks = [];
    let released = false;
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET',
      headers: { host: 'community.example.test:443' }
    }, (response) => {
      response.on('data', (chunk) => {
        chunks.push(chunk);
        if (!released) {
          released = true;
          releaseStream();
        }
      });
      response.on('end', () => {
        clearTimeout(timer);
        resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    request.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

const [webPort, communityPort, proxyPort] = await Promise.all([freePort(), freePort(), freePort()]);
const web = await fixture(webPort, 'web-fixture');
let releaseCommunityStream;
const communityStreamRelease = new Promise((resolve) => {
  releaseCommunityStream = resolve;
});
const community = await fixture(communityPort, 'fe-monster-community', {
  streamRelease: communityStreamRelease
});
const accessKey = 'fixture-public-access-key-that-is-long-enough';
const officialDownloadUrl = 'https://download.example.test/fe-monster/';
const proxy = spawn(process.execPath, [path.join(root, 'scripts', 'public-mobile-proxy.js')], {
  cwd: root,
  env: {
    ...process.env,
    FE_MONSTER_PUBLIC_PROXY_PORT: String(proxyPort),
    FE_MONSTER_PUBLIC_UPSTREAM_PORT: String(webPort),
    FE_MONSTER_PUBLIC_COMMUNITY_PORT: String(communityPort),
    FE_MONSTER_PUBLIC_ACCESS_KEY: accessKey,
    FE_MONSTER_PUBLIC_DOWNLOAD_URL: officialDownloadUrl
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('public proxy startup timed out')), 5000);
    proxy.stdout.on('data', (chunk) => {
      if (!String(chunk).includes('listening')) return;
      clearTimeout(timer);
      resolve();
    });
    proxy.once('exit', (code) => reject(new Error(`public proxy exited early: ${code}`)));
  });

  const health = await request(proxyPort, '/community/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, {
    ok: true,
    service: 'fe-monster-community',
    protocolVersion: 7,
    capabilities: {
      deviceCredentials: true,
      realtimeCommunity: true
    },
    gateway: 'fe-monster-public-community-gateway'
  });
  assert.equal(health.headers['x-internal-health'], undefined);
  assert.equal(Number(health.headers['content-length']), Buffer.byteLength(JSON.stringify(health.body)));

  const publicCommunity = await request(proxyPort, '/community/api/community/register', {
    method: 'POST',
    body: '{"fixture":true}'
  });
  assert.equal(publicCommunity.status, 200);
  assert.equal(publicCommunity.body.url, '/api/community/register');
  assert.equal(publicCommunity.body.publicAccessForwarded, false);

  const streamedCommunity = await streamingRequest(
    proxyPort,
    '/community/api/community/stream-fixture',
    releaseCommunityStream
  );
  assert.equal(streamedCommunity.status, 200);
  assert.equal(streamedCommunity.body, 'first-chunk|second-chunk');

  const blockedAdmin = await request(proxyPort, '/community/api/admin/security');
  assert.equal(blockedAdmin.status, 404);

  const deniedMobileApi = await request(proxyPort, '/api/account');
  assert.equal(deniedMobileApi.status, 401);

  const authorizedMobileApi = await request(proxyPort, '/api/account', {
    headers: { 'x-fe-public-access': accessKey }
  });
  assert.equal(authorizedMobileApi.status, 200);
  assert.equal(authorizedMobileApi.body.service, 'web-fixture');
  assert.equal(authorizedMobileApi.body.publicAccessForwarded, false);

  // The human-facing download route must remain available even when the
  // desktop gateway behind this tunnel is offline.
  await new Promise((resolve) => web.close(resolve));
  const rootDownload = await rawRequest(proxyPort, '/');
  assert.equal(rootDownload.status, 302);
  assert.equal(rootDownload.headers.location, officialDownloadUrl);
  assert.equal(rootDownload.headers['cache-control'], 'no-store');

  const namedDownload = await rawRequest(proxyPort, '/download');
  assert.equal(namedDownload.status, 302);
  assert.equal(namedDownload.headers.location, officialDownloadUrl);

  console.log(JSON.stringify({ ok: true, communityBaseUrl: `https://community.example.test:${proxyPort}/community` }, null, 2));
} finally {
  proxy.kill();
  await Promise.all([
    web.listening ? new Promise((resolve) => web.close(resolve)) : Promise.resolve(),
    new Promise((resolve) => community.close(resolve))
  ]);
}
