import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'doubao-v3-tts-probe');
const classes = path.join(scratch, 'classes');
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

function javaFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? javaFiles(target) : entry.name.endsWith('.java') ? [target] : [];
  });
}

function run(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp') },
  });
  assert.equal(result.error?.code, undefined, `probe process error: ${result.error?.message || ''}`);
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
try {
  const sources = [
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/ClientAiException.java'),
    path.join(root, 'src/main/java/com/femonster/core/ClientAiGateway.java'),
    ...javaFiles(path.join(root, 'src/main/java/com/femonster/ai')),
    ...javaFiles(path.join(root, 'src/test/java/com/femonster/ai')),
  ];
  run(javac, ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...sources]);
  const output = run(java, ['-cp', classes, 'com.femonster.ai.tts.DoubaoV3TtsProbe']);
  assert.match(output, /DoubaoV3TtsProbe passed/);
  console.log(output);
  const migrationOutput = run(java, ['-cp', classes, 'com.femonster.ai.ClientAiStateV2MigrationProbe']);
  assert.match(migrationOutput, /ClientAiStateV2MigrationProbe passed/);
  console.log(migrationOutput);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
