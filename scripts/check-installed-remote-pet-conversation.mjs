import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const installRoot = path.resolve(process.env.FE_TEST_INSTALL_ROOT || '');
assert.ok(process.env.FE_TEST_INSTALL_ROOT, 'FE_TEST_INSTALL_ROOT is required');
const resultPath = process.env.FE_TEST_RESULT_PATH
  ? path.resolve(process.env.FE_TEST_RESULT_PATH)
  : '';
const installedJava = path.join(installRoot, 'runtime', 'java', 'bin', 'java.exe');
const installedJar = path.join(installRoot, 'out', 'fe-monster-java.jar');
for (const required of [installedJava, installedJar]) {
  assert.ok(existsSync(required), `installed runtime file is missing: ${required}`);
}

const jdkHomes = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_JAVA26_HOME,
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  'E:\\java26',
  'D:\\java26',
].filter(Boolean);
const javac = jdkHomes.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync);
assert.ok(javac, 'workspace JDK javac was not found');

const scratchParent = path.join(workspaceRoot, 'tmp');
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(path.join(scratchParent, 'installed-remote-pet-'));
const classes = path.join(scratch, 'classes');
const dataDir = path.join(scratch, 'data');
mkdirSync(classes, { recursive: true });
mkdirSync(dataDir, { recursive: true });
for (const name of ['community-server-url.txt', 'community-server-tls-pin.txt']) {
  copyFileSync(path.join(installRoot, 'data', name), path.join(dataDir, name));
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: installRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    env,
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
    '-cp', installedJar,
    '-d', classes,
    path.join(workspaceRoot, 'scripts', 'java', 'InstalledRemotePetConversationProbe.java'),
  ], { ...process.env, TEMP: scratch, TMP: scratch });

  const environment = {
    ...process.env,
    FE_MONSTER_ROOT: installRoot,
    FE_MONSTER_DATA_DIR: dataDir,
    FE_MONSTER_COMMUNITY_URL: '',
    TEMP: scratch,
    TMP: scratch,
  };
  const output = run(installedJava, [
    '-cp', `${classes}${path.delimiter}${installedJar}`,
    'com.femonster.core.InstalledRemotePetConversationProbe',
    dataDir,
  ], environment);
  const lines = output.split(/\r?\n/).filter(Boolean);
  const result = JSON.parse(lines.at(-1));
  assert.equal(result.ok, true);
  assert.equal(path.resolve(result.installedJava), path.resolve(path.dirname(path.dirname(installedJava))));
  assert.equal(result.deviceCredentialPersisted, true);
  assert.equal(result.status, 200);
  assert.equal(result.session, 200);
  assert.equal(result.chat, 202);
  assert.equal(result.chatState, 'idle');
  assert.equal(result.chatAssistantReply, true);
  assert.equal(result.narrate, 200);
  if (resultPath) {
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
}
