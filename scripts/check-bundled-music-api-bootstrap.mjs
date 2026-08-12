import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratchBase = path.join(root, '.tmp');
mkdirSync(scratchBase, { recursive: true });
const suffix = process.platform === 'win32' ? '.exe' : '';

function firstExecutable(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  path.join(root, 'runtime', 'java'),
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);
const java = firstExecutable(javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)));
const javac = firstExecutable(javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)));
const jar = firstExecutable(javaHomes.map((home) => path.join(home, 'bin', `jar${suffix}`)));
assert.ok(java && javac && jar, 'Java 17+ tools are required');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
    env: { ...process.env, ...(options.env || {}) }
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result;
}

const providers = [
  { id: 'netease', version: '4.32.0', file: 'FE-Monster-Netease-API-Plugin-4.32.0.zip', port: 41100 },
  { id: 'qq', version: '2.4.1', file: 'FE-Monster-QQ-API-Plugin-2.4.1.zip', port: 41101 },
  { id: 'kugou', version: '2.0.7', file: 'FE-Monster-Kugou-API-Plugin-2.0.7.zip', port: 41102 },
  { id: 'qishui', version: '3.1.1', file: 'FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip', port: 41103 }
];

async function occupyDefaultSlotPort(port) {
  const server = createServer((socket) => socket.destroy());
  const listening = await new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => resolve(true));
  });
  return listening ? server : null;
}

const scenarioRoot = mkdtempSync(path.join(scratchBase, 'bundled-provider-bootstrap-'));
const defaultSlotPortBlocker = await occupyDefaultSlotPort(3010);
try {
  const pluginRoot = path.join(scenarioRoot, 'plugins', 'music-api');
  const dataRoot = path.join(scenarioRoot, 'data');
  const classes = path.join(scenarioRoot, 'test-classes');
  mkdirSync(pluginRoot, { recursive: true });
  mkdirSync(classes, { recursive: true });

  for (const provider of providers) {
    const source = path.join(scenarioRoot, `package-${provider.id}`);
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, 'server.cjs'), "'use strict';\n", 'utf8');
    writeFileSync(path.join(source, 'music-api-package.json'), JSON.stringify({
      schema: 'fe-monster.music-api-package/v1',
      id: provider.id,
      version: provider.version,
      label: `${provider.id} fixture`,
      appName: `${provider.id} fixture`,
      baseUrl: `http://127.0.0.1:${provider.port}`,
      healthPath: '/health',
      enabled: true,
      configured: true,
      autostart: true,
      loginQr: false,
      launcher: { runtime: 'node', entry: 'server.cjs', args: [] }
    }), 'utf8');
    run(jar, ['cf', path.join(pluginRoot, provider.file), '-C', source, '.']);
  }

  const mainClasses = path.join(root, 'out', 'classes');
  assert.ok(existsSync(path.join(mainClasses, 'com', 'femonster', 'music', 'MusicApiConfigService.class')),
    'Run scripts/build-java.ps1 before this check');
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', mainClasses, '-d', classes,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'music', 'MusicApiBundledBootstrapProbe.java')
  ]);
  const result = run(java, [
    '-cp', `${classes}${path.delimiter}${mainClasses}`,
    'com.femonster.music.MusicApiBundledBootstrapProbe'
  ], {
    env: {
      FE_MONSTER_ROOT: scenarioRoot,
      FE_MONSTER_DATA_DIR: dataRoot,
      FE_MONSTER_NODE: process.execPath,
      FE_MUSIC_API_AUTOSTART: '0'
    }
  });
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  const persisted = JSON.parse(readFileSync(path.join(dataRoot, 'music-api', 'providers.json'), 'utf8'));

  for (const provider of providers) {
    const first = report.first.providers.find((item) => item.id === provider.id);
    const restarted = report.restarted.providers.find((item) => item.id === provider.id);
    const stored = persisted.providers.find((item) => item.id === provider.id);
    assert.equal(first?.configured, true, `${provider.id} was not configured on a clean install`);
    assert.equal(first?.source, 'imported-zip', `${provider.id} did not use its bundled package`);
    assert.equal(first?.version, provider.version, `${provider.id} bundled version mismatch`);
    assert.equal(restarted?.package, first.package, `${provider.id} was unnecessarily reimported on restart`);
    assert.equal(stored?.package, first.package, `${provider.id} package was not persisted`);
    assert.ok(existsSync(path.join(dataRoot, 'music-api', 'packages', first.package)),
      `${provider.id} extracted package is missing`);
  }

  console.log(JSON.stringify({
    passed: true,
    providers: providers.map(({ id, version }) => ({ id, version })),
    restartReusedPackages: true,
    unrelatedDefaultPortListenerIgnored: true
  }, null, 2));
} finally {
  defaultSlotPortBlocker?.close();
  rmSync(scenarioRoot, { recursive: true, force: true });
}
