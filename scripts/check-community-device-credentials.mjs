import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, '.tmp', 'community-device-credentials');
const mainClasses = path.join(root, 'out', 'classes');
const testClasses = path.join(scratch, 'classes');
const homes = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = homes.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = homes.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';

assert.ok(existsSync(mainClasses), 'Run scripts/build-java.ps1 before the device credential fixture');
rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-cp', mainClasses,
    '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityDeviceCredentialsProbe.java')
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityDeviceCredentialsProbe'
  ]);
  assert.match(output, /CommunityDeviceCredentialsProbe passed/);
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
