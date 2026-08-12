import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, '.tmp', 'community-avatar-ornament-compatibility');
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

const serviceSource = readFileSync(
  path.join(root, 'src', 'community-proprietary', 'java', 'com', 'femonster', 'core', 'CommunityService.java'),
  'utf8',
);
const resolveStart = serviceSource.indexOf('private static String resolveBaseUrl(Path configPath)');
const resolveEnd = serviceSource.indexOf('private static String cleanUrlValue', resolveStart);
assert.ok(resolveStart >= 0 && resolveEnd > resolveStart, 'resolveBaseUrl must remain inspectable');
const resolveSource = serviceSource.slice(resolveStart, resolveEnd);
const explicitConfig = resolveSource.indexOf('Files.isRegularFile(configPath)');
const loopbackProbe = resolveSource.indexOf('if (isCommunityServer(local, 250)) return local;');
const lanDiscovery = resolveSource.indexOf('String discovered = discoverCommunityServer();');
assert.ok(explicitConfig >= 0 && explicitConfig < loopbackProbe,
  'explicit community server configuration must remain highest priority');
assert.ok(loopbackProbe >= 0 && loopbackProbe < lanDiscovery,
  'healthy loopback 3020 must be preferred before LAN discovery');
assert.match(
  serviceSource,
  /String idempotencyKey = UUID\.randomUUID\(\)\.toString\(\);/,
  'each logical community POST must receive one idempotency key',
);
assert.match(
  serviceSource,
  /catch \(IOException first\)[\s\S]{0,320}?buildPostRequest\(path, requestBody, timeout, idempotencyKey\)/,
  'a transport retry must reuse the logical POST idempotency key',
);
assert.match(
  serviceSource,
  /\.header\("Idempotency-Key", idempotencyKey\)[\s\S]{0,520}?communitySignatureHeaders\("POST", path, requestBody\)/,
  'each retry must rebuild the request with the same idempotency key and a fresh official signature',
);

assert.ok(
  existsSync(path.join(mainClasses, 'com', 'femonster', 'core', 'CommunityService.class')),
  'Run scripts/build-java.ps1 before this compatibility check',
);

rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
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
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityAvatarOrnamentCompatibilityProbe.java'),
  ]);
  console.log(run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityAvatarOrnamentCompatibilityProbe',
  ]));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
