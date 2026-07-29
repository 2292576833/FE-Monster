import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve('.');
const packageZip = path.join(root, 'dist', 'plugins', 'FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip');
const mainClasses = path.join(root, 'out', 'classes');
assert.equal(existsSync(packageZip), true, 'build the Qishui OpenAPI plugin package first');
assert.equal(existsSync(path.join(mainClasses, 'com', 'femonster', 'music', 'MusicApiConfigService.class')), true, 'run build.cmd first');

const javaHomeCandidates = [
  process.env.FE_JAVA26_HOME,
  path.join(root, 'runtime', 'java'),
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.JAVA_HOME
].filter(Boolean);
const executable = (name) => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const home of javaHomeCandidates) {
    const candidate = path.join(home, 'bin', `${name}${suffix}`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}${suffix}`;
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return result.stdout.trim();
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-qishui-package-'));
const classes = path.join(scratch, 'classes');
mkdirSync(classes, { recursive: true });
try {
  run(executable('javac'), [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-cp', mainClasses,
    '-d', classes,
    path.join(root, 'scripts', 'java', 'QishuiPackageImportProbe.java')
  ]);
  const port = await freePort();
  const stdout = run(executable('java'), [
    '-cp', `${classes}${path.delimiter}${mainClasses}`,
    'QishuiPackageImportProbe',
    packageZip
  ], {
    timeout: 30000,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: scratch,
      FE_MONSTER_DATA_DIR: path.join(scratch, 'data'),
      FE_MONSTER_NODE: process.execPath,
      FE_QISHUI_BASE_URL: `http://127.0.0.1:${port}`
    }
  });
  const payload = JSON.parse(stdout.split(/\r?\n/).filter(Boolean).at(-1));
  assert.deepEqual(payload, {
    ok: true,
    provider: 'qishui',
    version: '3.1.0',
    status: 'ready',
    configured: true
  });
  console.log('PASS check-qishui-package-import');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
