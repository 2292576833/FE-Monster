import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes
  .map((home) => path.join(home, 'bin', `java${suffix}`))
  .find(existsSync) || `java${suffix}`;

const appSource = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'FeMonsterJavaApp.java'),
  'utf8',
);
const contextSource = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'AppContext.java'),
  'utf8',
);

assert.match(appSource, /System\.getenv\("FE_MONSTER_MAIN_PID"\)/,
  'Java backend must read the desktop client pid');
assert.match(appSource, /ProcessHandle\.of\(pid\)[\s\S]{0,160}?filter\(ProcessHandle::isAlive\)/,
  'Java backend must resolve and validate the desktop process handle');
assert.match(appSource, /desktopParent\.onExit\(\)\.thenRun\(lifetime::close\)/,
  'desktop lifetime monitoring must use ProcessHandle.onExit instead of polling');
assert.match(appSource, /server\.stop\(1\)[\s\S]{0,520}?context\.close\(\)[\s\S]{0,160}?stopped\.countDown\(\)/,
  'parent exit must stop HTTP, close services, and release the main latch');
assert.match(contextSource, /class AppContext implements AutoCloseable/,
  'AppContext must expose explicit service cleanup');
assert.match(contextSource, /if \(!closed\.compareAndSet\(false, true\)\) return;/,
  'AppContext cleanup must be idempotent across parent-exit and JVM hooks');

const runJarFile = path.join(root, 'out', 'run-jar.txt');
assert.ok(existsSync(runJarFile), 'Run scripts/build-java.ps1 before this test');
const jar = readFileSync(runJarFile, 'utf8').trim();
assert.ok(existsSync(jar), `Built Java jar does not exist: ${jar}`);

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function waitForHttp(port, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ host: '127.0.0.1', port, path: '/', timeout: 500 }, (response) => {
        response.resume();
        resolve();
      });
      request.on('timeout', () => request.destroy());
      request.on('error', () => {
        if (child.exitCode !== null) {
          reject(new Error(
            `Java backend exited with ${child.exitCode} before listening on port ${port}\n`
            + child.probeOutput.stderr + child.probeOutput.stdout,
          ));
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(
            `Java backend did not listen on port ${port}\n`
            + child.probeOutput.stderr + child.probeOutput.stdout,
          ));
        } else {
          setTimeout(attempt, 100);
        }
      });
    };
    attempt();
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    const onExit = (code) => {
      cleanup();
      resolve(code);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function launchBackend(port, parentPid) {
  const env = { ...process.env, FE_MONSTER_PORT: String(port), FE_MONSTER_BIND: '127.0.0.1' };
  if (parentPid == null) delete env.FE_MONSTER_MAIN_PID;
  else env.FE_MONSTER_MAIN_PID = String(parentPid);
  const child = spawn(java, ['-jar', jar, '--server'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.probeOutput = { stdout: '', stderr: '' };
  child.stdout.on('data', (chunk) => { child.probeOutput.stdout += chunk; });
  child.stderr.on('data', (chunk) => { child.probeOutput.stderr += chunk; });
  return child;
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  try {
    await waitForExit(child, 5_000);
  } catch {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGKILL');
    }
  }
}

let parent;
let watchedBackend;
let serverOnlyBackend;
try {
  const watchedPort = await freePort();
  parent = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  watchedBackend = launchBackend(watchedPort, parent.pid);
  await waitForHttp(watchedPort, watchedBackend);
  assert.equal(watchedBackend.exitCode, null, 'watched backend exited before its parent');

  parent.kill();
  await waitForExit(parent, 5_000);
  const watchedExitCode = await waitForExit(watchedBackend, 10_000);
  assert.equal(watchedExitCode, 0, 'watched backend should shut down cleanly after its parent exits');

  const serverOnlyPort = await freePort();
  serverOnlyBackend = launchBackend(serverOnlyPort, null);
  await waitForHttp(serverOnlyPort, serverOnlyBackend);
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(serverOnlyBackend.exitCode, null,
    'server-only mode without FE_MONSTER_MAIN_PID must remain running');

  console.log(JSON.stringify({
    pass: true,
    parentExitStopsBackend: true,
    parentMonitor: 'ProcessHandle.onExit',
    serverOnlyWithoutParentPid: 'remains-running',
  }, null, 2));
} finally {
  await terminate(serverOnlyBackend);
  await terminate(watchedBackend);
  await terminate(parent);
}
