import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const jarPath = path.resolve(process.env.FE_TEST_JAR || process.argv[2] || path.join(workspaceRoot, 'out', 'fe-monster-java.jar'));
const dataDirectory = mkdtempSync(path.join(tmpdir(), 'fe-monster-achievement-persistence-'));
const expectedState = Object.freeze({
  version: 2,
  unlocked: Object.freeze({
    'world-peace': Object.freeze({ unlockedAt: 1712345678901 }),
    'first-danmaku': Object.freeze({ unlockedAt: 1712345679901 }),
    completionist: Object.freeze({ unlockedAt: 1712345680901 })
  }),
  themes: Object.freeze({ page: 'frost', toast: 'void' }),
  settings: Object.freeze({ soundEnabled: false })
});

const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA_HOME ? path.join(process.env.FE_JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : '',
  process.env.FE_JAVA26_HOME ? path.join(process.env.FE_JAVA26_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : '',
  process.env.FE_JAVA17_HOME ? path.join(process.env.FE_JAVA17_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : '',
  path.join(workspaceRoot, 'runtime', 'java', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  process.platform === 'win32' ? 'java.exe' : 'java'
].filter(Boolean);

function canRun(candidate) {
  if (path.isAbsolute(candidate) && !existsSync(candidate)) return false;
  const result = spawnSync(candidate, ['-version'], { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

const java = javaCandidates.find(canRun);
if (!java) throw new Error('Java 17+ runtime was not found; set FE_TEST_JAVA to java.exe');
if (!existsSync(jarPath)) throw new Error(`FE Monster jar was not found: ${jarPath}`);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort(excluded = new Set()) {
  for (;;) {
    const server = createServer();
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

async function stopBackend(instance) {
  if (!instance || instance.process.exitCode !== null) return;
  const exited = once(instance.process, 'exit').catch(() => []);
  try {
    await fetch(`http://127.0.0.1:${instance.port}/api/app/quit`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    });
  } catch {
    // Fall through to the process-level cleanup when the listener is already gone.
  }
  let exitObserved = await Promise.race([
    exited.then(() => true),
    delay(6000).then(() => false)
  ]);
  if (!exitObserved && instance.process.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(instance.process.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      instance.process.kill('SIGKILL');
    }
    exitObserved = await Promise.race([
      exited.then(() => true),
      delay(3000).then(() => false)
    ]);
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
    if (exitObserved || listenerAlive) {
      throw new Error(`Backend on port ${instance.port} did not stop`);
    }
  }
}

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
  const appendOutput = (chunk) => {
    instance.output = `${instance.output}${String(chunk)}`.slice(-12000);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`backend exited with code ${child.exitCode}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(750)
        });
        if (response.ok) return instance;
      } catch {
        // The listener is not ready yet.
      }
      await delay(100);
    }
    throw new Error('backend did not become healthy within ten seconds');
  } catch (error) {
    await stopBackend(instance);
    const output = instance.output.trim();
    throw new Error(`Failed to start backend on port ${port}: ${error.message}${output ? `\n${output}` : ''}`);
  }
}

async function requestState(port, method, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/app/achievements`, {
    method,
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Status assertions below include the raw response for diagnosis.
  }
  assert.ok(
    response.ok,
    `${method} /api/app/achievements on port ${port} expected HTTP 2xx, got ${response.status}: ${text || '<empty>'}`
  );
  assert.ok(payload && typeof payload === 'object', `${method} /api/app/achievements did not return JSON`);
  return payload;
}

function assertState(actual, label) {
  assert.equal(actual.version, expectedState.version, `${label}: version was not preserved`);
  assert.equal(
    actual.unlocked?.['world-peace']?.unlockedAt,
    expectedState.unlocked['world-peace'].unlockedAt,
    `${label}: world-peace unlock timestamp was not preserved`
  );
  assert.equal(
    actual.unlocked?.['first-danmaku']?.unlockedAt,
    expectedState.unlocked['first-danmaku'].unlockedAt,
    `${label}: first-danmaku unlock timestamp was not preserved`
  );
  assert.equal(
    actual.unlocked?.completionist?.unlockedAt,
    expectedState.unlocked.completionist.unlockedAt,
    `${label}: completionist unlock timestamp was not preserved`
  );
  assert.deepEqual(actual.themes, expectedState.themes, `${label}: achievement themes were not preserved`);
  assert.deepEqual(actual.settings, expectedState.settings, `${label}: achievement sound setting was not preserved`);
}

const firstPort = await freePort();
const secondPort = await freePort(new Set([firstPort]));
let backend = null;

console.log(`Achievement persistence regression: ports ${firstPort} -> ${secondPort}`);

try {
  backend = await startBackend(firstPort);
  assertState(await requestState(firstPort, 'POST', expectedState), 'POST response');
  assertState(await requestState(firstPort, 'GET'), 'same-process GET response');

  await stopBackend(backend);
  backend = null;

  backend = await startBackend(secondPort);
  assertState(await requestState(secondPort, 'GET'), 'post-restart GET response');

  console.log('Achievement persistence regression PASS');
} finally {
  await stopBackend(backend);
  rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
