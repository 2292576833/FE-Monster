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
  'Run build.cmd before this migration check'
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

function fixtureServerSource(version) {
  return `'use strict';
const http = require('node:http');
const raw = process.argv.find((value) => value.startsWith('--port=')) || '--port=0';
const port = Number(raw.slice('--port='.length));
const payload = ${JSON.stringify(JSON.stringify({
    ok: true,
    provider: 'kugou',
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

async function waitForHealth(port, version, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      const payload = await response.json();
      if (payload.provider === 'kugou' && payload.version === version) return payload;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Kugou fixture ${version} did not become ready: ${lastError?.message || 'timeout'}`);
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

function makeReleasePackage(scenarioRoot, port) {
  const packageRoot = path.join(scenarioRoot, 'release-kugou');
  const releaseDir = path.join(scenarioRoot, 'dist', 'plugins');
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(path.join(packageRoot, 'server.cjs'), fixtureServerSource('2.0.7'));
  writeFileSync(path.join(packageRoot, 'music-api-package.json'), JSON.stringify({
    schema: 'fe-monster.music-api-package/v1',
    id: 'kugou',
    version: '2.0.7',
    label: 'Kugou migration fixture',
    appName: 'Kugou fixture',
    baseUrl: `http://127.0.0.1:${port}`,
    healthPath: '/health',
    enabled: true,
    autostart: true,
    loginQr: false,
    launcher: {
      runtime: 'node',
      entry: 'server.cjs',
      args: ['--port=${port}', '--data-dir=${data}/kugou-music-api']
    }
  }, null, 2));
  const zip = path.join(releaseDir, 'FE-Monster-Kugou-API-Plugin-2.0.7.zip');
  run(jar, ['cf', zip, '-C', packageRoot, '.']);
}

function writeLegacyState(scenarioRoot, dataDir, port) {
  const apiRoot = path.join(dataDir, 'music-api');
  const packageRoot = path.join(apiRoot, 'packages', 'kugou-legacy');
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(path.join(apiRoot, 'logs'), { recursive: true });
  writeFileSync(path.join(packageRoot, 'server.cjs'), fixtureServerSource('1.5.1'));
  writeFileSync(path.join(packageRoot, 'music-api-package.json'), JSON.stringify({
    schema: 'fe-monster.music-api-package/v1',
    id: 'kugou',
    label: 'Legacy Kugou fixture',
    appName: 'Legacy Kugou',
    baseUrl: `http://127.0.0.1:${port}`,
    healthPath: '/health',
    enabled: true,
    autostart: true,
    loginQr: true,
    launcher: {
      runtime: 'node',
      entry: 'server.cjs',
      args: ['--port=${port}']
    }
  }, null, 2));

  const providers = {
    schema: 'fe-monster.music-apis/v1',
    version: 1,
    providers: [
      {
        id: 'netease',
        label: 'Netease sentinel',
        appName: 'Netease sentinel',
        baseUrl: 'http://127.0.0.1:43110',
        healthPath: '/sentinel',
        enabled: false,
        configured: true,
        autostart: false,
        loginQr: true,
        source: 'imported-json'
      },
      {
        id: 'qq',
        label: 'QQ sentinel',
        appName: 'QQ sentinel',
        baseUrl: 'http://127.0.0.1:43111',
        healthPath: '/sentinel',
        enabled: false,
        configured: true,
        autostart: false,
        loginQr: true,
        source: 'imported-json'
      },
      {
        id: 'kugou',
        label: 'Legacy Kugou fixture',
        appName: 'Legacy Kugou',
        baseUrl: `http://127.0.0.1:${port}`,
        healthPath: '/health',
        enabled: true,
        configured: true,
        autostart: true,
        loginQr: true,
        source: 'imported-zip',
        package: 'kugou-legacy',
        launcher: {
          runtime: 'node',
          entry: 'server.cjs',
          args: ['--port=${port}']
        }
      },
      {
        id: 'qishui',
        label: 'Removed provider sentinel',
        appName: 'Removed provider sentinel',
        baseUrl: 'http://127.0.0.1:43113',
        healthPath: '/sentinel',
        enabled: true,
        configured: true,
        autostart: true,
        loginQr: false,
        source: 'imported-zip',
        package: 'removed-provider-sentinel',
        launcher: {
          runtime: 'node',
          entry: 'server.cjs',
          args: ['--port=${port}']
        }
      }
    ]
  };
  writeFileSync(path.join(apiRoot, 'providers.json'), JSON.stringify(providers));
  return packageRoot;
}

function compileProbe(scenarioRoot) {
  const testClasses = path.join(scenarioRoot, 'test-classes');
  mkdirSync(testClasses, { recursive: true });
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-cp', mainClasses,
    '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'music', 'MusicApiKugouBundledMigrationProbe.java')
  ]);
  return testClasses;
}

const scenarioRoot = mkdtempSync(path.join(scratchRoot, 'kugou-bundled-migration-'));
const dataDir = path.join(scenarioRoot, 'data');
const port = await freePort();
let legacy;
try {
  makeReleasePackage(scenarioRoot, port);
  const legacyPackage = writeLegacyState(scenarioRoot, dataDir, port);
  legacy = spawn(process.execPath, [path.join(legacyPackage, 'server.cjs'), `--port=${port}`], {
    cwd: legacyPackage,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  await waitForHealth(port, '1.5.1');

  const testClasses = compileProbe(scenarioRoot);
  const probe = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.music.MusicApiKugouBundledMigrationProbe'
  ], {
    timeout: 35000,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: scenarioRoot,
      FE_MONSTER_DATA_DIR: dataDir,
      FE_MONSTER_NODE: process.execPath
    }
  });
  const report = JSON.parse(String(probe.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1));
  const stored = JSON.parse(readFileSync(path.join(dataDir, 'music-api', 'providers.json'), 'utf8'));
  const storedKugou = stored.providers.find((provider) => provider.id === 'kugou');
  const storedNetease = stored.providers.find((provider) => provider.id === 'netease');
  const storedQq = stored.providers.find((provider) => provider.id === 'qq');
  const storedQishuiSlot = stored.providers.find((provider) => provider.id === 'qishui');

  assert.equal(report.firstStatus.status, 'ready', 'first startup did not migrate and start bundled Kugou');
  assert.equal(report.restartedStatus.status, 'ready', 'restart did not retain the migrated Kugou package');
  assert.equal(report.health.provider, 'kugou');
  assert.equal(report.health.version, '2.0.7', 'restart still served the legacy Kugou version');
  assert.equal(storedKugou.version, '2.0.7', 'migrated Kugou version was not persisted');
  assert.notEqual(storedKugou.package, 'kugou-legacy', 'providers.json still references the legacy package');
  assert.equal(existsSync(legacyPackage), false, 'legacy Kugou package was not removed after migration');
  assert.equal(storedNetease.baseUrl, 'http://127.0.0.1:43110', 'Netease provider was overwritten');
  assert.equal(storedNetease.healthPath, '/sentinel', 'Netease provider fields changed');
  assert.equal(storedQq.baseUrl, 'http://127.0.0.1:43111', 'QQ provider was overwritten');
  assert.equal(storedQq.healthPath, '/sentinel', 'QQ provider fields changed');
  assert.equal(storedQishuiSlot?.configured, false, 'missing Qishui provider must remain an inert plugin slot');
  assert.equal(storedQishuiSlot?.source, 'plugin-slot', 'missing Qishui provider was unexpectedly activated');
  console.log(JSON.stringify({
    passed: true,
    firstStatus: report.firstStatus.status,
    restartedStatus: report.restartedStatus.status,
    version: report.health.version,
    package: storedKugou.package,
    legacyRemoved: true,
    unrelatedProvidersPreserved: true
  }, null, 2));
} finally {
  await terminate(legacy);
  rmSync(scenarioRoot, { recursive: true, force: true });
}
