import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temporaryRoot = path.join(root, 'tmp', 'edge-live-audio-worklet');
const profile = path.join(temporaryRoot, `profile-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(temporaryRoot, { recursive: true });

const fixture = `<!doctype html><html><body><script>
window.__liveAudioProbe = { state: 'starting', error: '', frames: [] };
(async () => {
  let context;
  let source;
  let processor;
  try {
    window.__liveAudioProbe.contextCreatedAt = performance.now();
    context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    await context.audioWorklet.addModule('/pet-live-audio-worklet.js');
    window.__liveAudioProbe.moduleReadyAt = performance.now();
    processor = new AudioWorkletNode(context, 'fe-pet-live-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { targetSampleRate: 16000, frameSamples: 320 }
    });
    const mute = context.createGain();
    mute.gain.value = 0;
    source = context.createConstantSource();
    source.offset.value = 0.2;
    processor.port.onmessage = (event) => {
      if (event.data?.type !== 'frame') return;
      window.__liveAudioProbe.frames.push({
        receivedAt: performance.now(),
        sampleRate: event.data.sampleRate,
        durationMs: event.data.durationMs,
        samples: event.data.pcm?.length || 0,
        rms: event.data.rms
      });
      if (window.__liveAudioProbe.frames.length >= 12) {
        window.__liveAudioProbe.state = 'complete';
        processor.port.postMessage({ type: 'close' });
        source.stop();
        context.close();
      }
    };
    processor.port.start?.();
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    window.__liveAudioProbe.captureStartedAt = performance.now();
    source.start();
    await context.resume();
    window.__liveAudioProbe.contextSampleRate = context.sampleRate;
    window.__liveAudioProbe.state = 'running';
  } catch (error) {
    window.__liveAudioProbe.state = 'error';
    window.__liveAudioProbe.error = String(error?.stack || error);
    try { source?.stop(); } catch {}
    try { processor?.port?.postMessage({ type: 'close' }); } catch {}
    try { await context?.close(); } catch {}
  }
})();
</script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(fixture);
    return;
  }
  if (url.pathname === '/pet-live-audio-worklet.js') {
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(readFileSync(path.join(webRoot, 'pet-live-audio-worklet.js')));
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
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
    probe = await evaluate('window.__liveAudioProbe');
    if (probe?.state === 'complete' || probe?.state === 'error') break;
    await delay(50);
  }
  assert.equal(probe?.state, 'complete', `real Edge AudioWorklet failed: ${probe?.error || probe?.state}`);
  assert.equal(probe.frames.length, 12);
  for (const frame of probe.frames) {
    assert.equal(frame.sampleRate, 16_000);
    assert.equal(frame.samples, 320);
    assert.equal(frame.durationMs, 20);
    assert.ok(Math.abs(frame.rms - 0.2) < 0.001, `unexpected real Edge RMS: ${frame.rms}`);
  }
  const intervals = probe.frames.slice(1).map((frame, index) => frame.receivedAt - probe.frames[index].receivedAt);
  const sortedIntervals = [...intervals].sort((left, right) => left - right);
  const metrics = {
    ok: true,
    edgeUserAgent: await evaluate('navigator.userAgent'),
    contextSampleRate: probe.contextSampleRate,
    outputSampleRate: probe.frames[0].sampleRate,
    frameSamples: probe.frames[0].samples,
    frameDurationMs: probe.frames[0].durationMs,
    meanRms: probe.frames.reduce((total, frame) => total + frame.rms, 0) / probe.frames.length,
    moduleLoadMs: probe.moduleReadyAt - probe.contextCreatedAt,
    firstFrameLatencyMs: probe.frames[0].receivedAt - probe.captureStartedAt,
    meanArrivalIntervalMs: intervals.reduce((total, value) => total + value, 0) / intervals.length,
    p95ArrivalIntervalMs: sortedIntervals[Math.ceil(sortedIntervals.length * 0.95) - 1],
    frames: probe.frames.length
  };
  assert.ok(metrics.firstFrameLatencyMs > 0 && metrics.firstFrameLatencyMs <= 120,
    `real Edge delayed the first 20 ms capture frame by ${metrics.firstFrameLatencyMs} ms`);
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
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
