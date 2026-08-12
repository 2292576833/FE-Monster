import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, '.tmp', 'community-provider-recovery');
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
  existsSync(path.join(mainClasses, 'com', 'femonster', 'music', 'MusicProviderRegistry.class')),
  'Run scripts/build-java.ps1 before this recovery check',
);

rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
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
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'music', 'MusicProviderRegistryRecoveryProbe.java'),
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.music.MusicProviderRegistryRecoveryProbe',
  ]);
  const communityService = readFileSync(path.join(
    root,
    'src',
    'community-proprietary',
    'java',
    'com',
    'femonster',
    'core',
    'CommunityService.java',
  ), 'utf8');
  const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  const appContext = readFileSync(path.join(
    root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'AppContext.java',
  ), 'utf8');
  const apiRoutes = readFileSync(path.join(
    root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java',
  ), 'utf8');
  assert.match(
    communityService,
    /accountPayload\.get\("error"\)/,
    'community state drops provider startup errors',
  );
  assert.match(app, /provider-unavailable/, 'community UI has no provider-unavailable state');
  assert.match(
    app,
    /api unavailable\|closedchannel/,
    'provider startup failures are not retryable',
  );
  assert.match(
    app,
    /音乐平台服务正在恢复，社区会自动重连/,
    'community UI does not explain automatic provider recovery',
  );
  assert.match(
    appContext,
    /activateInteractiveServices\(String provider\)[\s\S]*?musicApis\.awaitReady\(identityProvider, Duration\.ofSeconds\(7\)\)/,
    'interactive activation must wait for the selected identity provider to become ready',
  );
  assert.match(
    appContext,
    /new MusicProviderRegistry\(provider -> \{[\s\S]{0,240}?musicApis\.awaitReady\(provider, Duration\.ofSeconds\(7\)\)/,
    'lazy provider access must wait through the managed startup window',
  );
  assert.match(
    apiRoutes,
    /api\/app\/interactive\/activate[\s\S]{0,220}?SimpleJson\.asString\(root\.get\("provider"\)/,
    'interactive activation must forward the selected provider',
  );
  assert.match(
    app,
    /async function activateInteractiveBackend\(provider = state\.activeProvider\)[\s\S]{0,420}?JSON\.stringify\(\{ provider: providerInfo\(provider\)\.id \}\)/,
    'the client must normalize and activate the backend with its selected provider',
  );
  assert.match(
    app,
    /function communityStateNeedsRetry\([^)]*\)[\s\S]{0,260}?loginStatusNeedsRetry\(payload\)/,
    'community state must recognize an identity provider that is still recovering',
  );
  assert.match(
    app,
    /const retryPending = communityStateNeedsRetry\(payload\);[\s\S]{0,520}?if \(retryPending\)[\s\S]{0,820}?scheduleCommunityRefresh\([\s\S]{0,260}?\{ backoff: true \}/,
    'a successful HTTP response with a recovering provider must still schedule a community retry',
  );
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
