import assert from 'node:assert/strict';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const powershell = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
const production = [
  'MemoryCrypto.java',
  'MemorySanitizer.java',
  'MemoryTokenizer.java',
  'MemoryVaultKeyManager.java',
  'MemoryFileSecurity.java',
].map((name) => join(root, 'src', 'main', 'java', 'com', 'femonster', 'memory', name));
const probes = [
  join(root, 'src', 'test', 'java', 'com', 'femonster', 'memory', 'MemoryCryptoProbe.java'),
  join(root, 'src', 'test', 'java', 'com', 'femonster', 'memory', 'MemorySanitizerProbe.java'),
];

for (const path of [...production, ...probes]) {
  assert.ok(existsSync(path), `missing local-memory crypto contract: ${path}`);
}

const cryptoSource = readFileSync(production[0], 'utf8');
assert.match(cryptoSource, /AES\/GCM\/NoPadding/);
assert.match(cryptoSource, /HmacSHA256/);
assert.match(cryptoSource, /HKDF|hkdf/i);
assert.match(cryptoSource, /GCMParameterSpec\(128/);
assert.match(cryptoSource, /new byte\[12\]|NONCE_BYTES\s*=\s*12/);
assert.match(cryptoSource, /MessageDigest\.isEqual/);

const sanitizerSource = readFileSync(production[1], 'utf8');
assert.match(sanitizerSource, /NFKC/);
assert.match(sanitizerSource, /32_?768/);
assert.match(sanitizerSource, /1_?000/);
assert.match(sanitizerSource, /MAX_DEPTH\s*=\s*12|depth\s*>\s*12/);

const tokenizerSource = readFileSync(production[2], 'utf8');
assert.match(tokenizerSource, /NFKC/);
assert.match(tokenizerSource, /2_?048/);
assert.match(tokenizerSource, /64/);

const build = spawnSync(
  powershell,
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'build-java.ps1')],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(build.status, 0, `Java build failed:\n${build.stdout}\n${build.stderr}`);
const jdkMatch = String(build.stdout || '').match(/Using JDK:\s*(.+)\r?$/m);
assert.ok(jdkMatch, 'Java build did not report the resolved JDK');
const jdk = jdkMatch[1].trim();
const javac = join(jdk, 'bin', 'javac.exe');
const java = join(jdk, 'bin', 'java.exe');
const appJar = join(root, 'out', 'fe-monster-java.jar');
const classes = mkdtempSync(join(tmpdir(), 'fe-monster-memory-crypto-'));
try {
  const compile = spawnSync(
    javac,
    ['-encoding', 'UTF-8', '--release', '17', '-cp', appJar, '-d', classes, ...probes],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(compile.status, 0, `Memory probes failed to compile:\n${compile.stdout}\n${compile.stderr}`);
  for (const probe of ['MemoryCryptoProbe', 'MemorySanitizerProbe']) {
    const run = spawnSync(
      java,
      ['-cp', `${classes}${delimiter}${appJar}`, `com.femonster.memory.${probe}`],
      { cwd: root, encoding: 'utf8' },
    );
    const output = `${run.stdout || ''}\n${run.stderr || ''}`;
    assert.equal(run.status, 0, `${probe} failed:\n${output}`);
    assert.doesNotMatch(output, /FE_MEMORY_(?:MASTER_KEY|PLAINTEXT)_CANARY/);
    assert.equal(output.toLowerCase().includes(root.toLowerCase()), false, `${probe} leaked a workspace path`);
  }
} finally {
  rmSync(classes, { recursive: true, force: true });
}

console.log('PASS local memory crypto boundary');
