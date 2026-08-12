import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const installRoot = path.resolve(
  process.env.FE_TEST_INSTALL_ROOT
    || path.join(process.env.LOCALAPPDATA || os.homedir(), 'FE Monster'),
);
const dataDirectory = path.resolve(
  process.env.FE_TEST_DATA_DIR || path.join(installRoot, 'data'),
);
const provider = String(process.env.FE_TEST_PROVIDER || 'qq').trim().toLowerCase();
const javaCandidates = [
  path.join(installRoot, 'runtime', 'java', 'bin', 'FE Monster Backend.exe'),
  path.join(installRoot, 'runtime', 'java', 'bin', 'java.exe'),
];
const java = javaCandidates.find(existsSync);
const node = path.join(installRoot, 'runtime', 'node', 'node.exe');
const jar = path.join(installRoot, 'out', 'fe-monster-java.jar');
const credentialFile = path.join(dataDirectory, 'community-device-credentials.json');
const authFile = path.join(dataDirectory, `${provider}-auth.json`);

for (const required of [java, node, jar, credentialFile]) {
  if (!required || !existsSync(required)) throw new Error(`installed restart probe is missing ${required || 'Java'}`);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function json(url, options = {}, timeout = 4_000) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload;
}

async function waitFor(check, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch {
      // The child and its provider sidecar have independent startup phases.
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error('installed restart probe timed out');
}

async function runOnce(iteration) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let diagnostics = '';
  const child = spawn(java, ['-jar', jar, '--server'], {
    cwd: installRoot,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: installRoot,
      FE_MONSTER_WEB_ROOT: path.join(installRoot, 'web'),
      FE_MONSTER_DATA_DIR: dataDirectory,
      FE_MONSTER_PORT: String(port),
      FE_MONSTER_NODE: node,
      FE_MUSIC_API_AUTOSTART: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const remember = (chunk) => {
    diagnostics = (diagnostics + String(chunk)).slice(-32_000);
  };
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);

  try {
    await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`backend exited ${child.exitCode}`);
      const version = await json(`${baseUrl}/api/app/version`, {}, 1_200);
      return version?.version ? version : null;
    });
    const activation = await json(`${baseUrl}/api/app/interactive/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    }, 15_000);
    assert.equal(activation.active, true, `restart ${iteration} did not activate ${provider}`);

    const login = await waitFor(async () => {
      const status = await json(`${baseUrl}/api/login/status?provider=${encodeURIComponent(provider)}`, {}, 3_000);
      return status?.loggedIn === true ? status : null;
    }, 25_000);
    const community = await json(
      `${baseUrl}/api/community/state?provider=${encodeURIComponent(provider)}`,
      {},
      20_000,
    );
    const error = String(community?.error || '');
    assert.equal(login.loggedIn, true, `restart ${iteration} lost the provider login`);
    assert.equal(community.serverOnline, true, `restart ${iteration} could not reach the community server`);
    assert.doesNotMatch(error, /active device credential/i, `restart ${iteration} replaced the device key`);
    assert.equal(community.loggedIn, true, `restart ${iteration} did not hydrate the community identity`);
    assert.match(String(community.profile?.feId || ''), /^[1-9]\d{7}$/);
    return {
      feId: String(community.profile.feId),
      credentialHash: sha256(credentialFile),
      authHash: existsSync(authFile) ? sha256(authFile) : '',
    };
  } catch (error) {
    const category = /active device credential/i.test(`${error?.message || ''}\n${diagnostics}`)
      ? 'device-credential'
      : /login|authenticated/i.test(String(error?.message || ''))
        ? 'provider-login'
        : 'runtime';
    throw new Error(`installed restart ${iteration} failed (${category}): ${error?.message || error}`);
  } finally {
    try {
      await fetch(`${baseUrl}/api/app/quit`, { signal: AbortSignal.timeout(1_500) });
    } catch {
      // A process-tree fallback below handles an unavailable graceful route.
    }
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_500)),
    ]);
    if (child.exitCode === null) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    }
  }
}

const first = await runOnce(1);
const second = await runOnce(2);
assert.equal(second.feId, first.feId, 'community FE ID changed across restart');
assert.equal(second.credentialHash, first.credentialHash, 'device credential changed across restart');
if (first.authHash || second.authHash) {
  assert.equal(second.authHash, first.authHash, `${provider} auth state changed across restart`);
}

console.log(JSON.stringify({
  pass: true,
  provider,
  restarts: 2,
  sameFeId: true,
  sameDeviceCredential: true,
  sameProviderAuth: first.authHash ? true : 'sidecar-managed',
}));
