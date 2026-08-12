import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(
  root, 'src', 'community-proprietary', 'java', 'com', 'femonster', 'core', 'CommunityService.java'
), 'utf8');
assert.doesNotMatch(source, /TrustAllManager|maybePinSakuraFrpCertificate/, 'TLS pinning must not use trust-on-first-use');
assert.match(source, /requirePinned\(chain, trustError\)/, 'all system-trusted certificates must still match a configured pin');

const scratch = path.join(root, '.tmp', 'community-tls-pin');
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

rmSync(scratch, { recursive: true, force: true });
mkdirSync(testClasses, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', mainClasses, '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityTlsPinProbe.java')
  ]);
  const output = run(java, ['-cp', `${testClasses}${path.delimiter}${mainClasses}`, 'com.femonster.core.CommunityTlsPinProbe']);
  assert.match(output, /CommunityTlsPinProbe passed/);
  console.log(output);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
