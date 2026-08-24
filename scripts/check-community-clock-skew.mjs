import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-community-clock-skew-'));
const clientRoot = path.join(scratch, 'client');
const clientData = path.join(clientRoot, 'data');
const testClasses = path.join(scratch, 'classes');
const mainClasses = path.join(root, 'out', 'classes');
mkdirSync(clientData, { recursive: true });
mkdirSync(testClasses, { recursive: true });

const homes = [
  process.env.FE_TEST_JAVA_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = homes.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = homes.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

try {
  assert.ok(existsSync(mainClasses), 'compiled application classes are missing; run build.cmd first');
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', mainClasses, '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityClockSkewProbe.java')
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityClockSkewProbe',
    clientData
  ], {
    ...process.env,
    FE_MONSTER_ROOT: clientRoot,
    FE_MONSTER_DATA_DIR: clientData,
    FE_MONSTER_COMMUNITY_URL: ''
  });
  assert.match(output, /CommunityClockSkewProbe passed/);
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
