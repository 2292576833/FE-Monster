import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

assert.equal(process.platform, 'darwin', 'Real macOS is required for the native Keychain/SQLite test');
const root = path.resolve(import.meta.dirname, '..');
const app = process.env.FE_TEST_MAC_APP || path.join(root, 'FE moster苹果端', 'dist', 'FE Monster.app');
const resources = path.join(app, 'Contents', 'Resources', 'App');
const java = path.join(resources, 'runtime', 'java', 'bin', 'java');
const jdk = process.env.FE_JAVA_HOME || process.env.JAVA_HOME
  || spawnSync('/usr/libexec/java_home', ['-v', '17+'], { encoding: 'utf8' }).stdout.trim();
const scratch = mkdtempSync(path.join(tmpdir(), 'fe-macos-keychain-'));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, `${path.basename(command)} failed: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const jar = path.join(resources, 'fe-monster-java.jar');
  const classpath = [scratch, jar, path.join(resources, 'lib', '*')].join(path.delimiter);
  run(path.join(jdk, 'bin', 'javac'), ['--release', '17', '-encoding', 'UTF-8', '-cp', jar, '-d', scratch,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'memory', 'MacKeychainKeyProtectorProbe.java')]);
  const args = ['-cp', classpath, 'com.femonster.memory.MacKeychainKeyProtectorProbe',
    path.join(resources, 'native', 'macos', 'libfe-monster-keychain.dylib'), path.join(scratch, 'reference')];
  run(java, [...args, 'write']);
  process.stdout.write(run(java, [...args, 'read']));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
