import assert from 'node:assert/strict';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const powershell = process.env.SystemRoot
  ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
const productionNames = [
  'LocalMemoryEvent.java',
  'LocalMemoryStore.java',
  'SqliteEncryptedMemoryStore.java',
  'LocalMemoryException.java',
];
const production = productionNames.map((name) =>
  join(root, 'src', 'main', 'java', 'com', 'femonster', 'memory', name));
const probe = join(
  root,
  'src',
  'test',
  'java',
  'com',
  'femonster',
  'memory',
  'SqliteEncryptedMemoryStoreProbe.java',
);

const missing = [...production, probe].filter((path) => !existsSync(path));
if (missing.length > 0) {
  process.stderr.write(`FAIL local encrypted memory store: store missing: ${missing.join(', ')}\n`);
  process.exit(1);
}

const storeSource = readFileSync(production[2], 'utf8');
for (const required of [
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?vault_state/i,
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?chat_records/i,
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?operation_records/i,
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?knowledge_records/i,
  /chat_records[\s\S]{0,4000}\btype\s+TEXT\s+NOT\s+NULL/i,
  /knowledge_records[\s\S]{0,4000}\bsource_sequence\s+INTEGER\s+NOT\s+NULL/i,
  /journal_mode\s*=\s*WAL/i,
  /foreign_keys\s*=\s*ON/i,
  /synchronous\s*=\s*FULL/i,
  /(?:busy_timeout\s*=\s*5000|BUSY_TIMEOUT_MILLIS\s*=\s*5_?000)/i,
  /temp_store\s*=\s*MEMORY/i,
  /createdAt\s*\(\)/,
  /MemoryFileSecurity\.hardenOwnerOnly/,
]) {
  assert.match(storeSource, required, `missing encrypted-store source contract: ${required}`);
}
assert.doesNotMatch(
  storeSource,
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:memory_)?records\b/i,
  'chat, operation, and knowledge records must not share a generic records table',
);

const eventSource = readFileSync(production[0], 'utf8');
assert.match(eventSource, /eventId/);
assert.match(eventSource, /sourceSequence/);
assert.match(eventSource, /MemorySanitizer\.Stream/);
assert.match(eventSource, /messageId/);

const build = spawnSync(
  powershell,
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'build-java.ps1')],
  { cwd: root, encoding: 'utf8', timeout: 180_000 },
);
assert.equal(build.status, 0, `Java build failed:\n${build.stdout}\n${build.stderr}`);
const jdkMatch = String(build.stdout || '').match(/Using JDK:\s*(.+)\r?$/m);
assert.ok(jdkMatch, 'Java build did not report the resolved JDK');
const jdk = jdkMatch[1].trim();
const javac = join(jdk, 'bin', 'javac.exe');
const java = join(jdk, 'bin', 'java.exe');
const appJar = join(root, 'out', 'fe-monster-java.jar');
const libraries = readdirSync(join(root, 'out', 'lib'))
  .filter((name) => name.endsWith('.jar'))
  .sort()
  .map((name) => join(root, 'out', 'lib', name));
const appClassPath = [appJar, ...libraries].join(delimiter);
const classes = mkdtempSync(join(tmpdir(), 'fe-monster-memory-store-classes-'));
const fixture = mkdtempSync(join(tmpdir(), 'fe-monster-memory-store-fixture-'));

try {
  const compile = spawnSync(
    javac,
    ['-encoding', 'UTF-8', '--release', '17', '-cp', appClassPath, '-d', classes, probe],
    { cwd: root, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(
    compile.status,
    0,
    `Encrypted-memory store probe failed to compile:\n${compile.stdout}\n${compile.stderr}`,
  );

  const run = spawnSync(
    java,
    [
      '-Dfile.encoding=UTF-8',
      '-cp',
      [classes, appJar, ...libraries].join(delimiter),
      'com.femonster.memory.SqliteEncryptedMemoryStoreProbe',
      fixture,
    ],
    { cwd: root, encoding: 'utf8', timeout: 180_000 },
  );
  const output = `${run.stdout || ''}\n${run.stderr || ''}`;
  assert.equal(run.status, 0, `Encrypted-memory store probe failed:\n${output}`);
  assert.match(output, /PASS local encrypted sqlite memory store/);
  assert.doesNotMatch(output, /FE_STORE_(?:CHAT|OPERATION|KNOWLEDGE)_PLAINTEXT/);
  assert.equal(output.toLowerCase().includes(root.toLowerCase()), false, 'probe leaked the workspace path');

  const markers = [
    Buffer.from('FE_STORE_CHAT_PLAINTEXT_8F2A', 'utf8'),
    Buffer.from('FE_STORE_OPERATION_PLAINTEXT_91C4', 'utf8'),
    Buffer.from('FE_STORE_KNOWLEDGE_PLAINTEXT_37D6', 'utf8'),
    Buffer.from('音乐区密语', 'utf8'),
    Buffer.from('星海回声', 'utf8'),
  ];
  for (const path of walkFiles(fixture)) {
    const name = path.toLowerCase();
    if (!/(?:memory\.db(?:-wal|-shm)?|\.fememory|\.next|\.tmp|\.restore|\.backup)/i.test(name)) continue;
    const bytes = readFileSync(path);
    for (const marker of markers) {
      assert.equal(bytes.includes(marker), false, `plaintext marker persisted in ${path}`);
    }
  }
} finally {
  rmSync(classes, { recursive: true, force: true });
  rmSync(fixture, { recursive: true, force: true });
}

console.log('PASS local encrypted memory store contract');

function walkFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const status = statSync(path);
    if (status.isDirectory()) files.push(...walkFiles(path));
    else if (status.isFile()) files.push(path);
  }
  return files;
}
