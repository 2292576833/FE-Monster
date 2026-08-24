import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mainClasses = path.join(root, 'out', 'classes');
const scratch = path.join(root, 'tmp', 'community-pet-java-proxy-check');
const testClasses = path.join(scratch, 'classes');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  'D:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';

const routesSource = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'),
  'utf8',
);
const petCasesStart = routesSource.indexOf('case "/api/community/pet/sessions"');
const petCasesEnd = routesSource.indexOf('handleCommunityPetMutation(exchange, path, query, root);', petCasesStart);
assert.ok(petCasesStart >= 0 && petCasesEnd > petCasesStart, 'pet mutation route group must remain inspectable');
const petCases = routesSource.slice(petCasesStart, petCasesEnd);
for (const route of ['habits', 'narrate', 'narrate/cancel', 'cancel', 'live-stt']) {
  assert.ok(
    petCases.includes(`"/api/community/pet/${route}"`),
    `ApiRoutes does not proxy /api/community/pet/${route}`,
  );
}

assert.ok(
  existsSync(path.join(mainClasses, 'com', 'femonster', 'core', 'CommunityService.class')),
  'Run scripts/build-java.ps1 before this proxy check',
);

rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: path.join(root, 'tmp'),
      TMP: path.join(root, 'tmp'),
      FE_MONSTER_ROOT: root,
      FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
      FE_MONSTER_DATA_DIR: path.join(scratch, 'data'),
    },
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
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityPetProxyContractProbe.java'),
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityPetProxyContractProbe',
  ]);
  assert.match(output, /CommunityPetProxyContractProbe passed/);
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
