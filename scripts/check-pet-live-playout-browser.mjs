import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temporaryRoot = path.join(root, 'tmp', 'edge-live-playout');
const profile = path.join(temporaryRoot, `profile-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(temporaryRoot, { recursive: true });

function makeWave(durationMs, frequency = 330) {
  const sampleRate = 16_000;
  const samples = Math.round(sampleRate * durationMs / 1_000);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 160, (samples - index) / 160);
    const value = Math.sin(index / sampleRate * Math.PI * 2 * frequency) * 0.08 * envelope;
    buffer.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  return buffer;
}

const audio = new Map([
  ['/audio-0.wav', makeWave(420, 300)],
  ['/audio-1.wav', makeWave(420, 420)]
]);

const fixture = `<!doctype html><html><body><script src="/pet-live-playout.js"></script><script>
window.__playoutProbe = { state: 'starting', error: '', started: [], ended: [], cursors: [] };
(async () => {
  try {
    const context = new AudioContext({ latencyHint: 'interactive' });
    await context.resume();
    const playout = FeMonsterPetLivePlayout.createLivePlayout({
      audioContext: context,
      fetchAudio: async (segment, { signal }) => {
        const response = await fetch(segment.url, { signal });
        if (!response.ok) throw new Error('audio fetch failed');
        return response.arrayBuffer();
      },
      onStarted: (segment, detail) => window.__playoutProbe.started.push({ sequence: segment.audioSequence, ...detail }),
      onEnded: (segment, detail) => {
        window.__playoutProbe.ended.push({ sequence: segment.audioSequence, ...detail });
        if (window.__playoutProbe.ended.filter((entry) => entry.reason === 'ended').length === 2) {
          window.__playoutProbe.snapshot = playout.snapshot();
          window.__playoutProbe.state = 'complete';
          setTimeout(() => { playout.close(); context.close(); }, 0);
        }
      },
      onCursor: (cursor) => window.__playoutProbe.cursors.push(cursor),
      onError: (error, detail) => {
        window.__playoutProbe.state = 'error';
        window.__playoutProbe.error = String(error?.stack || error) + ' ' + JSON.stringify(detail || {});
      }
    });
    playout.enqueue({ requestId: 'edge', audioSequence: 1, url: '/audio-1.wav', final: true });
    playout.enqueue({ requestId: 'edge', audioSequence: 0, url: '/audio-0.wav' });
    window.__playoutProbe.state = 'running';
  } catch (error) {
    window.__playoutProbe.state = 'error';
    window.__playoutProbe.error = String(error?.stack || error);
  }
})();
</script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  if (url.pathname === '/pet-live-playout.js') {
    response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(root, 'web', 'pet-live-playout.js')));
    return;
  }
  if (audio.has(url.pathname)) {
    response.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'no-store' });
    response.end(audio.get(url.pathname));
    return;
  }
  response.writeHead(404);
  response.end('Not found');
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;

const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();

async function resolveDebugPort() {
  const debugPortFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(debugPortFile)) {
      try {
        const value = Number.parseInt(readFileSync(debugPortFile, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch (error) {
        if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) throw error;
      }
    }
    await delay(50);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(50);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

try {
  const debugPort = await resolveDebugPort();
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });

  let probe;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    probe = await evaluate('window.__playoutProbe');
    if (probe?.state === 'complete' || probe?.state === 'error') break;
    await delay(50);
  }
  assert.equal(probe?.state, 'complete', `real Edge playout failed: ${probe?.error || probe?.state}`);
  assert.deepEqual(probe.started.map((entry) => entry.sequence), [0, 1]);
  assert.deepEqual(probe.ended.map((entry) => entry.sequence), [0, 1]);
  assert.ok(probe.cursors.length >= 2, 'real Edge did not publish played-audio cursors');
  const joinSeconds = probe.started[1].scheduledAt - probe.started[0].scheduledAt;
  assert.ok(joinSeconds > 0.38 && joinSeconds < 0.43, `real Edge join was not continuous: ${joinSeconds}s`);
  assert.equal(probe.snapshot.metrics.fetchFailures, 0);
  assert.equal(probe.snapshot.metrics.decodeFailures, 0);
  console.log(JSON.stringify({
    ok: true,
    edgeUserAgent: await evaluate('navigator.userAgent'),
    sequences: probe.started.map((entry) => entry.sequence),
    joinSeconds,
    cursorEvents: probe.cursors.length,
    metrics: probe.snapshot.metrics
  }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ id: nextId++, method: 'Browser.close', params: {} })); } catch {}
    await delay(250);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
  if (browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, delay(1_000)]);
  }
  if (browser.exitCode === null && browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  if (profile.startsWith(`${temporaryRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
  }
}
