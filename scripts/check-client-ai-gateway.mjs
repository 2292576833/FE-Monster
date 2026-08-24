import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'client-ai-gateway-probe');
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

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });

function run(command, args, timeout = 20_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: path.join(root, 'tmp'),
      TMP: path.join(root, 'tmp'),
    },
  });
  assert.equal(result.error?.code, undefined, `probe process error: ${result.error?.message || ''}`);
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-d', classes,
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'json', 'SimpleJson.java'),
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'ai', 'AiProviderCatalog.java'),
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'ai', 'tts', 'DoubaoV3Config.java'),
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'ClientAiException.java'),
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'ClientAiGateway.java'),
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'ClientAiGatewayProbe.java'),
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'ClientAiTtsProviderPolicyProbe.java'),
  ]);
  const output = run(java, ['-cp', classes, 'com.femonster.core.ClientAiGatewayProbe']);
  assert.match(output, /ClientAiGatewayProbe passed/);
  const policyOutput = run(java, [
    '-cp', classes,
    'com.femonster.core.ClientAiTtsProviderPolicyProbe',
    path.join(scratch, 'tts-provider-policy-data'),
  ]);
  assert.match(policyOutput, /ClientAiTtsProviderPolicyProbe passed/);
  const appContext = readFileSync(path.join(root, 'src/main/java/com/femonster/core/AppContext.java'), 'utf8');
  const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
  const clientAiHttpModule = readFileSync(
    path.join(root, 'src/main/java/com/femonster/api/ClientAiHttpModule.java'),
    'utf8',
  );
  assert.match(appContext, /public final ClientAiGateway clientAi;/,
    'AppContext does not own ClientAiGateway');
  assert.match(routes, /clientAiHttpModule\.tryHandle\(exchange\)/,
    'ApiRoutes does not delegate the client-AI namespace to its deep HTTP module');
  assert.match(clientAiHttpModule, /"\/api\/client-ai\/config"\.equals\(path\)/,
    'redacted client-AI config route is missing from ClientAiHttpModule');
  assert.match(clientAiHttpModule, /gateway\.execute\(/,
    'client-AI chat/TTS routes do not delegate to the Java-owned gateway');
  assert.doesNotMatch(`${routes}\n${clientAiHttpModule}`,
    /root\.get\("baseUrl"\)|root\.get\("apiKey"\)/,
    'client-AI proxy still trusts browser endpoint or secret fields');
  console.log([output, policyOutput].join('\n'));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
