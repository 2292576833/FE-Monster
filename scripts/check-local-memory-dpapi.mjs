import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const powershell = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
const paths = {
  native: join(root, 'native', 'windows', 'fe_monster_wincrypto.cpp'),
  builder: join(root, 'scripts', 'build-wincrypto.ps1'),
  contract: join(root, 'src', 'main', 'java', 'com', 'femonster', 'memory', 'KeyProtector.java'),
  implementation: join(root, 'src', 'main', 'java', 'com', 'femonster', 'memory', 'WindowsDpapiKeyProtector.java'),
  probe: join(root, 'src', 'test', 'java', 'com', 'femonster', 'memory', 'WindowsDpapiKeyProtectorProbe.java'),
  dll: join(root, 'native', 'windows', 'build', 'fe-monster-wincrypto.dll'),
};

for (const path of [paths.native, paths.builder, paths.contract, paths.implementation, paths.probe]) {
  assert.ok(existsSync(path), `missing DPAPI contract file: ${basename(path)}`);
}

const nativeSource = readFileSync(paths.native, 'utf8');
assert.match(nativeSource, /CryptProtectData/);
assert.match(nativeSource, /CryptUnprotectData/);
assert.ok((nativeSource.match(/CRYPTPROTECT_UI_FORBIDDEN/g) || []).length >= 2);
assert.doesNotMatch(nativeSource, /CRYPTPROTECT_LOCAL_MACHINE/);
assert.match(nativeSource, /FE Monster Local AI Memory v1/);
assert.match(nativeSource, /LocalFree/);
assert.match(nativeSource, /SecureZeroMemory/);
assert.match(nativeSource, /BCryptHashData/);
assert.match(nativeSource, /Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeProtect/);
assert.match(nativeSource, /Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeUnprotect/);
assert.match(nativeSource, /65\s*\*\s*1024|65536|65_536/);
assert.deepEqual(
  [...nativeSource.matchAll(/Java_com_femonster_memory_WindowsDpapiKeyProtector_native[A-Za-z0-9_]+/g)]
    .map((match) => match[0])
    .sort(),
  [
    'Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeProtect',
    'Java_com_femonster_memory_WindowsDpapiKeyProtector_nativeUnprotect',
  ],
  'WinCrypto source must expose exactly the two dedicated JNI entry points',
);

const javaSource = readFileSync(paths.implementation, 'utf8');
assert.match(javaSource, /fe-monster-wincrypto\.dll/);
assert.match(javaSource, /System\.load\(/);
assert.match(javaSource, /Arrays\.fill/);
assert.match(javaSource, /\.clone\(\)/);
assert.doesNotMatch(javaSource, /getMessage\(\)/);

const buildSource = readFileSync(paths.builder, 'utf8');
assert.match(buildSource, /Find-JavaDevelopmentKit/);
assert.match(buildSource, /crypt32\.lib/i);
assert.match(buildSource, /bcrypt\.lib/i);
assert.match(buildSource, /MACHINE:X64/i);
assert.match(buildSource, /['"]\/MT['"]/i);

const build = spawnSync(
  powershell,
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', paths.builder],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(build.status, 0, `WinCrypto build failed:\n${build.stdout}\n${build.stderr}`);
assert.ok(existsSync(paths.dll), 'WinCrypto build did not produce the dedicated DLL');
const jdkMatch = String(build.stdout || '').match(/Using JDK:\s*(.+)\r?$/m);
assert.ok(jdkMatch, 'WinCrypto build did not report the resolved JDK');
const jdk = jdkMatch[1].trim();
const javac = join(jdk, 'bin', 'javac.exe');
const java = join(jdk, 'bin', 'java.exe');
assert.ok(existsSync(javac) && existsSync(java), 'resolved JDK is incomplete');

const image = readFileSync(paths.dll);
assert.equal(image.subarray(0, 2).toString('ascii'), 'MZ', 'WinCrypto output is not a PE image');
const peOffset = image.readUInt32LE(0x3c);
assert.equal(image.subarray(peOffset, peOffset + 4).toString('binary'), 'PE\u0000\u0000', 'WinCrypto PE signature is invalid');
assert.equal(image.readUInt16LE(peOffset + 4), 0x8664, 'WinCrypto DLL must be AMD64');

const classes = mkdtempSync(join(tmpdir(), 'fe-monster-dpapi-classes-'));
try {
  const compile = spawnSync(
    javac,
    ['-encoding', 'UTF-8', '--release', '17', '-d', classes, paths.contract, paths.implementation, paths.probe],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(compile.status, 0, `DPAPI Java compile failed:\n${compile.stdout}\n${compile.stderr}`);
  const run = spawnSync(
    java,
    ['-cp', classes, 'com.femonster.memory.WindowsDpapiKeyProtectorProbe', paths.dll],
    { cwd: root, encoding: 'utf8' },
  );
  const output = `${run.stdout || ''}\n${run.stderr || ''}`;
  assert.equal(run.status, 0, `DPAPI behavior probe failed:\n${output}`);
  assert.match(output, /PASS Windows DPAPI key protector/);
  assert.doesNotMatch(output, /FE_DPAPI_SECRET_CANARY_7A91/);
  assert.doesNotMatch(output, /FE_DPAPI_ENTROPY_CANARY_4C28/);
  const lowerOutput = output.toLowerCase();
  assert.equal(lowerOutput.includes(root.toLowerCase()), false, 'DPAPI output leaked the workspace path');
  assert.equal(lowerOutput.includes(root.toLowerCase().replaceAll('\\', '/')), false, 'DPAPI output leaked the workspace path');
} finally {
  rmSync(classes, { recursive: true, force: true });
}

console.log('PASS local memory DPAPI contract');
