import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = readFileSync(
  path.join(root, 'src', 'community-proprietary', 'java', 'com', 'femonster', 'core', 'CommunityService.java'),
  'utf8'
);
assert.match(
  source,
  /buildEventStreamRequest\(requestPath\)[\s\S]*catch \(IOException first\)[\s\S]*buildEventStreamRequest\(requestPath\)/,
  'event stream transport retry must rebuild its signed request'
);
assert.match(
  source,
  /communitySignatureHeaders\("GET", "\/api\/community\/events", ""\)/,
  'event stream signature must use the query-free canonical path'
);

const scratch = path.join(root, '.tmp', `community-event-signature-${process.pid}`);
const mainClasses = path.join(root, 'out', 'classes');
const testClasses = path.join(scratch, 'classes');
const serviceDirectory = path.join(testClasses, 'META-INF', 'services');
const candidates = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = candidates.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = candidates.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';

assert.ok(existsSync(mainClasses), 'Run scripts/build-java.ps1 before the event signature fixture');
rmSync(scratch, { recursive: true, force: true });
mkdirSync(serviceDirectory, { recursive: true });
writeFileSync(
  path.join(serviceDirectory, 'com.femonster.community.CommunityModule'),
  'com.femonster.core.CommunityEventSignatureProbe$SigningModule\n',
  'utf8'
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
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
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityEventSignatureProbe.java')
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityEventSignatureProbe'
  ]);
  assert.match(output, /CommunityEventSignatureProbe passed/);
  process.stdout.write(`${output}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
