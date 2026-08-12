import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, '.tmp', 'community-lan-discovery');
const mainClasses = path.join(root, 'out', 'classes');
const testClasses = path.join(scratch, 'classes');
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const suffix = process.platform === 'win32' ? '.exe' : '';
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';

assert.ok(
  existsSync(path.join(mainClasses, 'com', 'femonster', 'core', 'CommunityService.class')),
  'Run scripts/build-java.ps1 before this discovery check',
);

rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FE_MONSTER_COMMUNITY_URL: '' },
    timeout,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-cp', mainClasses,
    '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityServiceLanDiscoveryProbe.java'),
  ]);
  console.log(run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityServiceLanDiscoveryProbe',
  ], 45_000));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
