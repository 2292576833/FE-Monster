import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratchRoot = path.join(root, '.tmp');
mkdirSync(scratchRoot, { recursive: true });

function firstExecutable(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

const javaHomeCandidates = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
const java = firstExecutable(javaHomeCandidates.map((home) => path.join(home, 'bin', `java${executableSuffix}`)));
const javac = firstExecutable(javaHomeCandidates.map((home) => path.join(home, 'bin', `javac${executableSuffix}`)));
const jar = firstExecutable(javaHomeCandidates.map((home) => path.join(home, 'bin', `jar${executableSuffix}`)));
assert.ok(java && javac && jar, 'Java 17+ compiler/runtime tools are required');

const mainClasses = path.join(root, 'out', 'classes');
assert.ok(
  existsSync(path.join(mainClasses, 'com', 'femonster', 'music', 'MusicApiConfigService.class')),
  'Run build.cmd before this lifecycle check'
);

function run(command, args, options = {}) {
  const { env = {}, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...spawnOptions,
    env: {
      ...process.env,
      TEMP: scratchRoot,
      TMP: scratchRoot,
      ...env
    }
  });
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(command)} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, version, provider = 'kugou', timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      const payload = await response.json();
      if (payload.provider === provider && payload.version === version) return payload;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`fixture health ${version} did not become ready: ${lastError?.message || 'timeout'}`);
}

function fixtureServerSource(version, provider = 'kugou') {
  return `'use strict';
const http = require('node:http');
const raw = process.argv.find((value) => value.startsWith('--port=')) || '--port=0';
const port = Number(raw.slice('--port='.length));
const payload = ${JSON.stringify(JSON.stringify({
    ok: true,
    provider,
    version,
    contract: 'fe-monster.music-api/v1'
  }))};
const server = http.createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404, {'content-type':'application/json'});
  response.end(request.url === '/health' ? payload : '{"ok":false}');
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
`;
}

function makePackageZip(scenarioRoot) {
  const packageRoot = path.join(scenarioRoot, 'current-package');
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(path.join(packageRoot, 'server.cjs'), fixtureServerSource('2.0.0'));
  writeFileSync(path.join(packageRoot, 'music-api-package.json'), JSON.stringify({
    schema: 'fe-monster.music-api-package/v1',
    id: 'kugou',
    version: '2.0.0',
    label: 'Kugou lifecycle fixture',
    appName: 'Kugou fixture',
    baseUrl: 'http://127.0.0.1:3012',
    healthPath: '/health',
    enabled: true,
    autostart: true,
    loginQr: false,
    launcher: {
      runtime: 'node',
      entry: 'server.cjs',
      args: ['--port=${port}']
    }
  }, null, 2));
  const zip = path.join(scenarioRoot, 'kugou-current.zip');
  run(jar, ['cf', zip, '-C', packageRoot, '.']);
  return zip;
}

function compileProbe(scenarioRoot) {
  const testClasses = path.join(scenarioRoot, 'test-classes');
  mkdirSync(testClasses, { recursive: true });
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-cp', mainClasses,
    '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'music', 'MusicApiConfigServiceLifecycleProbe.java')
  ]);
  return testClasses;
}

function parseProbeResult(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length, 'lifecycle probe produced no output');
  return JSON.parse(lines.at(-1));
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 1200))
  ]);
  if (!exited && child.exitCode === null) child.kill('SIGKILL');
}

async function waitForExit(child, timeoutMs = 3000) {
  if (!child || child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
  ]);
}

function runProbe(scenarioRoot, dataDir, port) {
  const zip = makePackageZip(scenarioRoot);
  const testClasses = compileProbe(scenarioRoot);
  return parseProbeResult(run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.music.MusicApiConfigServiceLifecycleProbe',
    zip
  ], {
    timeout: 30000,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: scenarioRoot,
      FE_MONSTER_DATA_DIR: dataDir,
      FE_MONSTER_NODE: process.execPath,
      FE_KUGOU_BASE_URL: `http://127.0.0.1:${port}`
    }
  }).stdout);
}

async function checkForeignPortConflict({ provider, version, scenario }) {
  const scenarioRoot = mkdtempSync(path.join(scratchRoot, `music-api-foreign-${scenario}-`));
  const dataDir = path.join(scenarioRoot, 'data');
  const foreignRoot = path.join(scenarioRoot, 'foreign-service');
  const port = await freePort();
  mkdirSync(foreignRoot, { recursive: true });
  const foreignEntry = path.join(foreignRoot, 'server.cjs');
  writeFileSync(foreignEntry, fixtureServerSource(version, provider));
  const foreign = spawn(process.execPath, [foreignEntry, `--port=${port}`], {
    cwd: foreignRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  try {
    await waitForHealth(port, version, provider);
    const report = runProbe(scenarioRoot, dataDir, port);
    assert.equal(report.status.status, 'port-conflict-unmanaged', 'foreign listener was not reported as a conflict');
    assert.equal(report.health.provider, provider, 'foreign listener identity was replaced or altered');
    assert.equal(report.health.version, version, 'foreign listener version was replaced or altered');
    assert.equal(
      report.providers.providers.find((item) => item.id === 'kugou')?.version,
      '2.0.0',
      'imported manifest version was not persisted in provider state'
    );
    assert.equal(foreign.exitCode, null, 'foreign listener was killed');
    return { status: report.status.status, provider, version, foreignAlive: true };
  } finally {
    await terminate(foreign);
    rmSync(scenarioRoot, { recursive: true, force: true });
  }
}

async function checkManagedPackageReplacement() {
  const scenarioRoot = mkdtempSync(path.join(scratchRoot, 'music-api-managed-'));
  const dataDir = path.join(scenarioRoot, 'data');
  const managedRoot = path.join(dataDir, 'music-api', 'packages', 'old-kugou');
  const port = await freePort();
  mkdirSync(managedRoot, { recursive: true });
  const managedEntry = path.join(managedRoot, 'server.cjs');
  writeFileSync(managedEntry, fixtureServerSource('1.0.0'));
  const managed = spawn(process.execPath, [managedEntry, `--port=${port}`], {
    cwd: managedRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  try {
    await waitForHealth(port, '1.0.0');
    const report = runProbe(scenarioRoot, dataDir, port);
    assert.equal(report.status.status, 'ready', 'managed stale package listener was not replaced');
    assert.equal(report.health.version, '2.0.0', 'current package did not become the healthy listener');
    assert.equal(await waitForExit(managed), true, 'managed stale listener was not stopped');
    return { status: report.status.status, version: report.health.version, staleStopped: true };
  } finally {
    await terminate(managed);
    rmSync(scenarioRoot, { recursive: true, force: true });
  }
}

const foreignVersion = await checkForeignPortConflict({ provider: 'kugou', version: '1.0.0', scenario: 'version' });
const foreignProvider = await checkForeignPortConflict({ provider: 'qq', version: '2.0.0', scenario: 'provider' });
const managed = await checkManagedPackageReplacement();
console.log(JSON.stringify({ passed: true, foreignVersion, foreignProvider, managed }, null, 2));
