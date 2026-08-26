import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const powershell = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
const artifacts = [
  {
    coordinate: 'org.xerial:sqlite-jdbc:3.53.2.1:without-natives',
    file: 'sqlite-jdbc-3.53.2.1-without-natives.jar',
    url: 'https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-without-natives.jar',
    sha256: '4baeeb32cfb8ac3e5922e0fe50b8f78e4fe39d00f68824ce677a9477c686715b',
  },
  {
    coordinate: 'org.xerial:sqlite-jdbc:3.53.2.1:natives-windows',
    file: 'sqlite-jdbc-3.53.2.1-natives-windows.jar',
    url: 'https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-natives-windows.jar',
    sha256: '05c622ecd7337d96f7ccbd0599fee00cf62af81364fd188a848eb3469f4e17a2',
  },
  {
    coordinate: 'org.slf4j:slf4j-api:1.7.36',
    file: 'slf4j-api-1.7.36.jar',
    url: 'https://repo.maven.apache.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar',
    sha256: 'd3ef575e3e4979678dc01bf1dcce51021493b4d11fb7f1be8ad982877c16a1c0',
  },
];
const licenses = [
  {
    file: 'LICENSE-SQLITE-JDBC.txt',
    source: 'https://github.com/xerial/sqlite-jdbc/blob/3.53.2.1/LICENSE',
    sha256: 'c978e501e690550f7e63203f501e68041f41d450cd7eb56ac7750e4ae2597885',
  },
  {
    file: 'LICENSE-SLF4J.txt',
    source: 'https://github.com/qos-ch/slf4j/blob/v_1.7.36/LICENSE.txt',
    sha256: 'c3c2680463d10ba992c002451e94f6018e4096d6d632334731a93cd97cb74aaa',
  },
];
const classPath = artifacts.map(({ file }) => `lib/${file}`).join(' ');

function runPowerShell(script, args, options = {}) {
  return spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalizedTextSha256(path) {
  const normalized = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

const receiptPath = join(root, 'third_party', 'java', 'local-memory', 'dependencies.json');
assert.ok(existsSync(receiptPath), 'missing local-memory dependency receipt');
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
assert.deepEqual(receipt.artifacts, artifacts, 'dependency receipt must pin the exact runtime artifacts');
assert.deepEqual(receipt.licenses, licenses, 'dependency receipt must pin the exact license texts');

for (const license of licenses) {
  const path = join(root, 'third_party', 'java', 'local-memory', license.file);
  assert.ok(existsSync(path), `missing vendored ${license.file}`);
  assert.equal(normalizedTextSha256(path), license.sha256, `${license.file} hash mismatch`);
}

const provisioner = join(root, 'scripts', 'provision-local-memory-dependencies.ps1');
const checker = join(root, 'scripts', 'check-local-memory-dependencies.ps1');
const builder = join(root, 'scripts', 'build-java.ps1');
for (const script of [provisioner, checker, builder]) {
  assert.ok(existsSync(script), `missing ${basename(script)}`);
}
const provisionerSource = readFileSync(provisioner, 'utf8');
const receiptIntegrityIndex = provisionerSource.indexOf('$actualReceiptSha256 = Get-LocalMemoryNormalizedTextSha256');
const networkAccessIndex = provisionerSource.indexOf('Invoke-WebRequest');
assert.ok(receiptIntegrityIndex >= 0, 'provisioner must pin the dependency receipt itself');
assert.ok(networkAccessIndex > receiptIntegrityIndex, 'receipt integrity must be checked before any network access');

const vendoredLib = join(root, 'third_party', 'java', 'local-memory', 'lib');
for (const artifact of artifacts) {
  const path = join(vendoredLib, artifact.file);
  assert.ok(existsSync(path), `missing vendored artifact ${artifact.file}`);
  assert.equal(sha256(path), artifact.sha256, `${artifact.file} hash mismatch`);
}
assert.deepEqual(
  readdirSync(vendoredLib).sort(),
  artifacts.map(({ file }) => file).sort(),
  'vendored dependency directory contains an unpinned artifact',
);

const checkerResult = runPowerShell(checker, []);
assert.equal(checkerResult.status, 0, `dependency checker failed:\n${checkerResult.stdout}\n${checkerResult.stderr}`);

const buildResult = runPowerShell(builder, []);
assert.equal(buildResult.status, 0, `Java build failed:\n${buildResult.stdout}\n${buildResult.stderr}`);
const jdkMatch = String(buildResult.stdout || '').match(/Using JDK:\s*(.+)\r?$/m);
assert.ok(jdkMatch, 'Java build did not report the resolved JDK');
const java = join(jdkMatch[1].trim(), 'bin', 'java.exe');
const javac = join(jdkMatch[1].trim(), 'bin', 'javac.exe');
const jar = join(jdkMatch[1].trim(), 'bin', 'jar.exe');
assert.ok(existsSync(java) && existsSync(javac) && existsSync(jar), 'resolved JDK is incomplete');

const manifest = execFileSync(jar, ['--describe-module', '--file', join(root, 'out', 'fe-monster-java.jar')], {
  cwd: root,
  encoding: 'utf8',
});
assert.match(manifest, /com\.femonster/, 'built application jar must remain inspectable');
for (const artifact of artifacts) {
  const staged = join(root, 'out', 'lib', artifact.file);
  assert.ok(existsSync(staged), `missing staged artifact ${artifact.file}`);
  assert.equal(sha256(staged), artifact.sha256, `staged ${artifact.file} hash mismatch`);
}
const manifestFixture = mkdtempSync(join(tmpdir(), 'fe-monster-manifest-'));
try {
  execFileSync(jar, ['--extract', '--file', join(root, 'out', 'fe-monster-java.jar'), 'META-INF/MANIFEST.MF'], {
    cwd: manifestFixture,
    encoding: 'utf8',
  });
  const extractedManifest = readFileSync(join(manifestFixture, 'META-INF', 'MANIFEST.MF'), 'utf8');
  assert.match(extractedManifest.replace(/\r?\n /g, ''), new RegExp(`Class-Path: ${classPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
} finally {
  rmSync(manifestFixture, { recursive: true, force: true });
}

const fixture = mkdtempSync(join(tmpdir(), 'fe-monster-local-memory-'));
try {
  cpSync(join(root, 'third_party', 'java', 'local-memory'), join(fixture, 'third_party', 'java', 'local-memory'), { recursive: true });
  const tampered = join(fixture, 'third_party', 'java', 'local-memory', 'lib', artifacts[0].file);
  const bytes = readFileSync(tampered);
  bytes[0] ^= 0x01;
  writeFileSync(tampered, bytes);
  const tamperResult = runPowerShell(checker, ['-Root', fixture]);
  assert.notEqual(tamperResult.status, 0, 'checker must reject a one-byte tampered fixture');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const licenseFixture = mkdtempSync(join(tmpdir(), 'fe-monster-local-memory-license-'));
try {
  cpSync(join(root, 'third_party', 'java', 'local-memory'), join(licenseFixture, 'third_party', 'java', 'local-memory'), { recursive: true });
  const tampered = join(licenseFixture, 'third_party', 'java', 'local-memory', licenses[0].file);
  writeFileSync(tampered, `${readFileSync(tampered, 'utf8')}tampered\n`);
  const tamperResult = runPowerShell(checker, ['-Root', licenseFixture]);
  assert.notEqual(tamperResult.status, 0, 'checker must reject a tampered license');
  assert.match(`${tamperResult.stdout}\n${tamperResult.stderr}`, /license integrity check failed/i);
} finally {
  rmSync(licenseFixture, { recursive: true, force: true });
}

const receiptFixture = mkdtempSync(join(tmpdir(), 'fe-monster-local-memory-receipt-'));
try {
  cpSync(join(root, 'third_party', 'java', 'local-memory'), join(receiptFixture, 'third_party', 'java', 'local-memory'), { recursive: true });
  const copiedReceipt = join(receiptFixture, 'third_party', 'java', 'local-memory', 'dependencies.json');
  const changedReceipt = readFileSync(copiedReceipt, 'utf8').replace('repo.maven.apache.org', 'example.invalid');
  writeFileSync(copiedReceipt, changedReceipt);
  const receiptTamperResult = runPowerShell(provisioner, ['-Root', receiptFixture]);
  assert.notEqual(receiptTamperResult.status, 0, 'provisioner must reject a modified dependency receipt');
  assert.match(
    `${receiptTamperResult.stdout}\n${receiptTamperResult.stderr}`,
    /receipt failed its integrity check before network access/i,
    'provisioner must reject a modified receipt before processing artifacts',
  );
} finally {
  rmSync(receiptFixture, { recursive: true, force: true });
}

const crlfFixture = mkdtempSync(join(tmpdir(), 'fe-monster-local-memory-crlf-'));
try {
  cpSync(join(root, 'third_party', 'java', 'local-memory'), join(crlfFixture, 'third_party', 'java', 'local-memory'), { recursive: true });
  mkdirSync(join(crlfFixture, 'scripts'), { recursive: true });
  cpSync(checker, join(crlfFixture, 'scripts', 'check-local-memory-dependencies.ps1'));
  const copiedReceipt = join(crlfFixture, 'third_party', 'java', 'local-memory', 'dependencies.json');
  writeFileSync(copiedReceipt, readFileSync(copiedReceipt, 'utf8').replace(/\r?\n/g, '\r\n'));
  const crlfResult = runPowerShell(provisioner, ['-Root', crlfFixture]);
  assert.equal(crlfResult.status, 0, `provisioner receipt pin must survive Git CRLF checkout:\n${crlfResult.stdout}\n${crlfResult.stderr}`);
} finally {
  rmSync(crlfFixture, { recursive: true, force: true });
}

const runtimeFixture = mkdtempSync(join(tmpdir(), 'fe-monster-sqlite-runtime-'));
const probeJar = join(root, 'out', 'sqlite-runtime-probe.jar');
try {
  const classes = join(runtimeFixture, 'classes');
  const source = join(runtimeFixture, 'SqliteRuntimeProbe.java');
  const probeManifest = join(runtimeFixture, 'MANIFEST.MF');
  mkdirSync(classes, { recursive: true });
  writeFileSync(source, [
    'import java.sql.DriverManager;',
    'public class SqliteRuntimeProbe {',
    '  public static void main(String[] args) throws Exception {',
    '    Class.forName("org.sqlite.JDBC");',
    '    try (var connection = DriverManager.getConnection("jdbc:sqlite::memory:");',
    '         var statement = connection.createStatement();',
    '         var result = statement.executeQuery("SELECT 1")) {',
    '      if (!result.next() || result.getInt(1) != 1) throw new IllegalStateException("SQLITE_QUERY_FAILED");',
    '      System.out.println(result.getInt(1));',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n'));
  writeFileSync(probeManifest, `Manifest-Version: 1.0\r\nMain-Class: SqliteRuntimeProbe\r\nClass-Path: ${classPath}\r\n\r\n`);
  execFileSync(javac, ['-encoding', 'UTF-8', '--release', '17', '-d', classes, source], { encoding: 'utf8' });
  execFileSync(jar, ['--create', '--file', probeJar, '--manifest', probeManifest, '-C', classes, '.'], { encoding: 'utf8' });
  const probeOutput = execFileSync(java, ['-jar', probeJar], { cwd: join(root, 'out'), encoding: 'utf8' });
  assert.equal(probeOutput.trim(), '1', 'SQLite runtime probe must execute SELECT 1 through manifest Class-Path');
} finally {
  rmSync(probeJar, { force: true });
  rmSync(runtimeFixture, { recursive: true, force: true });
}

console.log('PASS local memory dependency and build contract');
