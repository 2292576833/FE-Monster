import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const installRoot = path.resolve(
  process.env.FE_TEST_INSTALL_ROOT
    || path.join(workspaceRoot, 'out', 'installer', 'work', 'payload', 'FE Monster'),
);
const java = path.join(installRoot, 'runtime', 'java', 'bin', 'java.exe');
const node = path.join(installRoot, 'runtime', 'node', 'node.exe');
const jar = path.resolve(
  process.env.FE_TEST_JAR || path.join(installRoot, 'out', 'fe-monster-java.jar'),
);

for (const required of [java, node, jar]) {
  if (!existsSync(required)) throw new Error(`Installed runtime is missing ${path.basename(required)}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function requestJson(url, timeoutMs = 4_000, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'fe-installed-community-'));
for (const name of ['community-server-url.txt', 'community-server-tls-pin.txt']) {
  const source = path.join(installRoot, 'data', name);
  if (existsSync(source)) copyFileSync(source, path.join(dataDir, name));
}
if (process.env.FE_TEST_COMMUNITY_URL) {
  writeFileSync(
    path.join(dataDir, 'community-server-url.txt'),
    process.env.FE_TEST_COMMUNITY_URL.trim(),
    'utf8',
  );
}
const child = spawn(java, ['-jar', jar, '--server'], {
  cwd: installRoot,
  env: {
    ...process.env,
    FE_MONSTER_ROOT: installRoot,
    FE_MONSTER_DATA_DIR: dataDir,
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_NODE: node,
    FE_MUSIC_API_AUTOSTART: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
let phase = 'startup';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

try {
  const deadline = Date.now() + 25_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Installed backend exited during startup');
    try {
      await requestJson(`${baseUrl}/api/app/version`, 1_000);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  if (!ready) throw new Error('Installed backend did not become ready');

  phase = 'community-state';
  const state = await requestJson(`${baseUrl}/api/community/state?provider=netease`, 20_000);
  const result = {
    pass: state.serverOnline === true,
    serverOnline: state.serverOnline === true,
    loggedIn: state.loggedIn === true,
    hasProfile: Boolean(state.profile?.feId),
    errorClass: state.error
      ? (/certificate|pkix|ssl|tls|handshake/i.test(String(state.error)) ? 'tls' : 'other')
      : 'none',
  };
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    pass: false,
    serverOnline: false,
    phase,
    errorClass: /certificate|pkix|ssl|tls|handshake/i.test(`${error?.message || ''}\n${output}`)
      ? 'tls'
      : 'runtime',
  }));
  process.exitCode = 1;
} finally {
  try {
    await fetch(`${baseUrl}/api/app/quit`, { signal: AbortSignal.timeout(1_500) });
  } catch {
    // The process is terminated below if graceful shutdown is unavailable.
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGKILL');
    }
  }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
