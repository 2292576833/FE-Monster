import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { once } from 'node:events';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(root, 'output', 'pet-memory-roundtrip-'));
const classes = join(scratch, 'classes');
mkdirSync(classes);
const jdk = process.env.FE_TEST_JAVA_HOME || 'C:/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot';
const cp = [classes, join(root, 'out/fe-monster-java.jar'), join(root, 'out/lib/*')].join(';');
const compile = spawnSync(join(jdk, 'bin/javac.exe'), ['-encoding', 'UTF-8', '--release', '17', '-cp', cp,
  '-d', classes, 'src/test/java/com/femonster/memory/LocalMemoryRoundtripFixture.java'], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(compile.status, 0, compile.stderr);

async function start() {
  const child = spawn(join(jdk, 'bin/java.exe'), ['-cp', cp, 'com.femonster.memory.LocalMemoryRoundtripFixture', join(scratch, 'vault')],
    { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture startup timed out')), 15000);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; const port = /PORT=(\d+)/.exec(output)?.[1]; if (port) { clearTimeout(timeout); resolvePort(port); } });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(errors)); });
  });
  const base = `http://127.0.0.1:${port}`;
  return { base, async stop() { const exit = once(child, 'exit'); child.stdin.end(); await exit; } };
}
function browserClient(base) {
  const window = { addEventListener() {}, dispatchEvent() {}, crypto: webcrypto };
  const sandbox = vm.createContext({ window, crypto: webcrypto, console, URL, TextEncoder, AbortController,
    setTimeout, clearTimeout, document: { addEventListener() {} },
    fetch: async (path, options = {}) => {
      const response = await fetch(base + path, { ...options, headers: { ...options.headers, Origin: base } });
      if (!response.ok) console.error('Fixture HTTP failure', path, response.status, await response.clone().text(), options.body);
      return response;
    } });
  for (const file of ['local-memory-client.js', 'pet-preference-policy.js', 'pet-preference-memory.js']) {
    vm.runInContext(readFileSync(join(root, 'web', file), 'utf8'), sandbox, { filename: file });
  }
  return window;
}
const deadline = (promise) => Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Durable receipt timeout')), 10000); timer.unref(); })]);
let server = await start();
try {
  let browser = browserClient(server.base);
  const provider = 'netease';
  const health = await browser.FeLocalMemory.vaultHealth({ provider });
  assert.equal(health.available, true, 'cold account failed to unlock');
  const occurredAt = new Date().toISOString();
  const handle = browser.FeLocalMemory.append({ provider, stream: 'chat', type: 'chat.message', occurredAt,
    payload: { messageId: webcrypto.randomUUID(), conversationId: 'roundtrip-conversation', traceId: 'roundtrip-trace',
      turnId: 'roundtrip-turn', role: 'user', text: '我喜欢听爵士', source: 'test', modelOrigin: 'local-custom', timeAccuracy: 'exact' } });
  assert.equal(handle.accepted, true);
  const receipt = await deadline(handle.receipt);
  assert.ok(receipt.recordedAt && receipt.accepted !== false, JSON.stringify(receipt));
  const learned = await deadline(browser.FeMonsterPetPreferenceMemory.observeChat({ provider, role: 'user', text: '我喜欢听爵士', occurredAt }));
  assert.equal(learned.written, 1, 'real encrypted store rejected learned preference');
  const operation = browser.FeLocalMemory.append({ provider, stream: 'operation', type: 'command.succeeded', occurredAt,
    payload: { operationId: 'roundtrip-op', traceId: 'roundtrip-trace', turnId: 'roundtrip-turn', actor: 'app',
      phase: 'complete', status: 'succeeded', commandId: 'playback.pause', commandManifestRevision: 'test' } });
  assert.ok((await deadline(operation.receipt)).recordedAt);
  await server.stop();
  server = await start();
  browser = browserClient(server.base);
  assert.equal((await browser.FeLocalMemory.vaultHealth({ provider })).available, true);
  const history = await browser.FeLocalMemory.chats({ provider, limit: 10 });
  assert.equal(history.records.length, 1);
  assert.equal(history.records[0].occurredAt, occurredAt);
  assert.equal(history.records[0].payload.text, '我喜欢听爵士');
  assert.equal((await browser.FeMonsterPetPreferenceMemory.recall({ provider, message: '喜欢什么音乐' })).preferences[0].subject, '爵士');
  assert.equal((await browser.FeLocalMemory.context({ provider, limit: 10 })).operations.length, 1);
  assert.equal((await browser.FeLocalMemory.chats({ provider: 'qq', limit: 10 })).records.length, 0, 'account isolation failed');
  console.log(JSON.stringify({ ok: true, realHttp: true, dpapiSqlite: true, exactChatTime: true,
    separateOperationLog: true, preferenceLearning: true, backendAndBrowserRestart: true, accountIsolation: true }));
} finally { await server.stop(); }
