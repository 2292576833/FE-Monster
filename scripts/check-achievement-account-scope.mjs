import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Achievements follow the signed-in music-platform account. The local service
// remembers the last confirmed account per provider so a restart that cannot
// reach the music-API plugin yet still answers with the account partition
// instead of the empty anonymous one. Without that memory every launch looked
// like the player's progress had been reset.
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const jarPath = path.resolve(
  process.env.FE_TEST_JAR || process.argv[2] || path.join(workspaceRoot, 'out', 'fe-monster-java.jar')
);
if (!existsSync(jarPath)) throw new Error(`FE Monster jar was not found: ${jarPath}`);

const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA_HOME
    ? path.join(process.env.FE_JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : '',
  path.join(workspaceRoot, 'runtime', 'java', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  process.platform === 'win32' ? 'java.exe' : 'java'
].filter(Boolean);
const canRun = (candidate) => {
  if (path.isAbsolute(candidate) && !existsSync(candidate)) return false;
  const result = spawnSync(candidate, ['-version'], { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
};
const java = javaCandidates.find(canRun);
if (!java) throw new Error('Java 17+ runtime was not found; set FE_TEST_JAVA to java.exe');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort(excluded = new Set()) {
  for (;;) {
    const server = createTcpServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise((resolve) => server.close(resolve));
    if (port > 0 && !excluded.has(port)) return port;
  }
}

// Minimal music-API plugin stand-in: only the account probe matters here.
let loginUserId = '1234567890';
let pluginMode = 'ok';
const plugin = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const json = (value) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/login/status') {
    if (pluginMode === 'unavailable') {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 503, msg: 'plugin starting' }));
      return;
    }
    if (pluginMode === 'signed-out') return json({ data: { code: 200, account: {} } });
    return json({ data: { profile: { userId: Number(loginUserId), nickname: 'fixture', avatarUrl: '' } } });
  }
  return json({ ok: true, data: {} });
});
await new Promise((resolve) => plugin.listen(0, '127.0.0.1', resolve));
const pluginPort = plugin.address().port;

const dataDirectory = mkdtempSync(path.join(tmpdir(), 'fe-achievement-account-scope-'));
mkdirSync(path.join(dataDirectory, 'music-api'), { recursive: true });
writeFileSync(path.join(dataDirectory, 'music-api', 'providers.json'), JSON.stringify({
  schema: 'fe-monster.music-apis/v1',
  version: 1,
  providers: [{
    id: 'netease',
    label: '网易云音乐',
    appName: '网易云音乐 App',
    baseUrl: `http://127.0.0.1:${pluginPort}`,
    healthPath: '/health',
    version: '4.32.0',
    enabled: true,
    configured: true,
    autostart: false,
    loginQr: false,
    source: 'imported-json'
  }]
}, null, 2));

const expectedState = {
  version: 2,
  progress: { 'first-play': 42 },
  unlocked: { 'first-play': { unlockedAt: 1712345678000 } },
  themes: { page: 'frost', toast: 'void' },
  settings: { soundEnabled: false },
  ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } }
};

async function startBackend(port) {
  const child = spawn(java, ['-jar', jarPath, '--no-client'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: workspaceRoot,
      FE_MONSTER_WEB_ROOT: path.join(workspaceRoot, 'web'),
      FE_MONSTER_DATA_DIR: dataDirectory,
      FE_MONSTER_BIND: '127.0.0.1',
      FE_MONSTER_PORT: String(port),
      FE_MUSIC_API_AUTOSTART: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const instance = { process: child, port, output: '' };
  const append = (chunk) => { instance.output = `${instance.output}${chunk}`.slice(-12000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`backend exited with code ${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(700)
        });
        if (response.ok) return instance;
      } catch {
        // The listener is not ready yet.
      }
      await delay(100);
    }
    throw new Error('backend did not become healthy within twelve seconds');
  } catch (error) {
    await stopBackend(instance);
    const output = instance.output.trim();
    throw new Error(`Failed to start backend on port ${port}: ${error.message}${output ? `\n${output}` : ''}`);
  }
}

async function stopBackend(instance) {
  if (!instance || instance.process.exitCode !== null) return;
  const exited = once(instance.process, 'exit').catch(() => []);
  try {
    await fetch(`http://127.0.0.1:${instance.port}/api/app/quit`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500)
    });
  } catch {
    // Fall through to process-level cleanup.
  }
  let observed = await Promise.race([exited.then(() => true), delay(6000).then(() => false)]);
  if (!observed && instance.process.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(instance.process.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      instance.process.kill('SIGKILL');
    }
    observed = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
  }
  if (instance.process.exitCode === null) {
    let listenerAlive = false;
    try {
      const response = await fetch(`http://127.0.0.1:${instance.port}/api/app/version`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(500)
      });
      listenerAlive = response.ok;
    } catch {
      listenerAlive = false;
    }
    if (observed || listenerAlive) throw new Error(`Backend on port ${instance.port} did not stop`);
  }
}

async function requestState(port, method, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/app/achievements?provider=netease`, {
    method,
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000)
  });
  const text = await response.text();
  assert.ok(response.ok, `${method} /api/app/achievements expected HTTP 2xx, got ${response.status}: ${text}`);
  return JSON.parse(text);
}

function assertStatePreserved(payload, label) {
  assert.equal(payload.progress?.['first-play'], expectedState.progress['first-play'],
    `${label}: progress was not preserved`);
  assert.equal(payload.unlocked?.['first-play']?.unlockedAt,
    expectedState.unlocked['first-play'].unlockedAt,
    `${label}: unlock timestamp was not preserved`);
  assert.deepEqual(payload.themes, expectedState.themes, `${label}: themes were not preserved`);
  assert.deepEqual(payload.settings, expectedState.settings, `${label}: settings were not preserved`);
}

let backend = null;
const usedPorts = new Set();
const nextPort = async () => {
  const port = await freePort(usedPorts);
  usedPorts.add(port);
  return port;
};
const accountScope = `netease:${loginUserId}`;

console.log(`Achievement account-scope regression: plugin on 127.0.0.1:${pluginPort}`);

try {
  backend = await startBackend(await nextPort());
  const posted = await requestState(backend.port, 'POST', expectedState);
  assert.equal(posted._sync?.scope, accountScope, 'a signed-in account must own its own partition');
  assert.equal(posted._sync?.confirmed, true, 'a live account probe must be reported as confirmed');
  assert.equal(posted._sync?.remembered, false);
  assertStatePreserved(posted, 'first launch');
  await stopBackend(backend);
  backend = null;

  backend = await startBackend(await nextPort());
  const restarted = await requestState(backend.port, 'GET');
  assert.equal(restarted._sync?.scope, accountScope, 'the account partition was not restored after a restart');
  assertStatePreserved(restarted, 'restart with the plugin reachable');
  await stopBackend(backend);
  backend = null;

  // The reported defect: the music-API plugin is still starting when the client
  // asks for its achievements, so the answer fell back to the anonymous state.
  pluginMode = 'unavailable';
  backend = await startBackend(await nextPort());
  const pending = await requestState(backend.port, 'GET');
  assert.equal(pending._sync?.scope, accountScope,
    'an unavailable music-API plugin reset the achievements to another account scope');
  assert.equal(pending._sync?.remembered, true,
    'a remembered account scope must be reported so the client can keep it');
  assert.equal(pending._sync?.confirmed, false);
  assertStatePreserved(pending, 'restart while the plugin is starting');
  await stopBackend(backend);
  backend = null;

  // A signed-out probe keeps following the remembered account instead of
  // silently discarding the player's progress.
  pluginMode = 'signed-out';
  backend = await startBackend(await nextPort());
  const signedOut = await requestState(backend.port, 'GET');
  assert.equal(signedOut._sync?.scope, accountScope, 'a signed-out probe lost the remembered account');
  assertStatePreserved(signedOut, 'signed-out probe');
  await stopBackend(backend);
  backend = null;

  // A different music-platform account takes over its own partition.
  pluginMode = 'ok';
  loginUserId = '777777';
  backend = await startBackend(await nextPort());
  const other = await requestState(backend.port, 'GET');
  assert.equal(other._sync?.scope, `netease:${loginUserId}`,
    'another account did not switch to its own partition');
  assert.equal(other.progress?.['first-play'], undefined,
    'another account inherited the previous account progress');
  await stopBackend(backend);
  backend = null;

  // Without any remembered account the anonymous partition is still correct.
  pluginMode = 'unavailable';
  rmSync(path.join(dataDirectory, 'achievement-scope.json'), { force: true });
  backend = await startBackend(await nextPort());
  const anonymous = await requestState(backend.port, 'GET');
  assert.equal(anonymous._sync?.scope, 'anonymous',
    'a profile with no remembered account must stay anonymous');
  await stopBackend(backend);
  backend = null;

  console.log('Achievement account-scope regression PASS');
} finally {
  await stopBackend(backend);
  await new Promise((resolve) => plugin.close(resolve));
  rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
