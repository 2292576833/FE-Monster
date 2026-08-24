import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'client-ai-source-coupling');
const classes = path.join(scratch, 'classes');
const suffix = process.platform === 'win32' ? '.exe' : '';
const homes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const javac = homes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';
const java = homes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
const sources = [
  'src/main/java/com/femonster/json/SimpleJson.java',
  'src/main/java/com/femonster/ai/AiProviderCatalog.java',
  'src/main/java/com/femonster/ai/tts/DoubaoV3Config.java',
  'src/main/java/com/femonster/core/ClientAiException.java',
  'src/main/java/com/femonster/core/ClientAiGateway.java',
  'src/test/java/com/femonster/core/ClientAiSourceCouplingProbe.java',
].map((file) => path.join(root, file));
const env = { ...process.env, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp') };
const compile = spawnSync(javac, ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...sources], {
  cwd: root, encoding: 'utf8', windowsHide: true, env,
});
assert.equal(compile.error, undefined, compile.error?.message);
assert.equal(compile.status, 0, [compile.stdout, compile.stderr].filter(Boolean).join('\n'));
const run = spawnSync(java, ['-cp', classes, 'com.femonster.core.ClientAiSourceCouplingProbe'], {
  cwd: root, encoding: 'utf8', windowsHide: true, env, timeout: 30_000,
});
assert.equal(run.error, undefined, run.error?.message);
assert.equal(run.status, 0, [run.stdout, run.stderr].filter(Boolean).join('\n'));

const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const service = readFileSync(path.join(root, 'web', 'client-ai-service.js'), 'utf8');
assert.match(html, /id="aiServiceTtsModeSelect"[^>]*disabled/,
  'TTS source selector is still independently editable');
assert.match(app, /ttsMode:\s*modelMode/,
  'settings submission does not derive TTS source from model source');
assert.match(service, /const modelMode = normalizeMode\(source\.modelMode\)/,
  'client snapshot does not normalize source coupling');

rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
console.log(JSON.stringify({ ok: true, modelOwnsTtsSource: true, restartSafe: true, ttsSelectorLocked: true }, null, 2));
