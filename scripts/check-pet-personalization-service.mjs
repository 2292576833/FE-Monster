import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'pet-personalization-service-check');
const classes = path.join(scratch, 'classes');
const suffix = process.platform === 'win32' ? '.exe' : '';
const homes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = homes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = homes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    env: { ...process.env, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp') },
  });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-d', classes,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/PetPersonalizationSnapshot.java'),
    path.join(root, 'src/main/java/com/femonster/core/PetPersonalizationService.java'),
    path.join(root, 'src/test/java/com/femonster/core/PetPersonalizationServiceProbe.java'),
  ]);
  const output = run(java, ['-cp', classes, 'com.femonster.core.PetPersonalizationServiceProbe']);
  assert.match(output, /PetPersonalizationServiceProbe passed/);
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
