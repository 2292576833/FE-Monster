import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, 'web');
const artifactRoot = path.join(projectRoot, 'artifacts');
const profile = path.join(artifactRoot, `.tmp-pet-bounds-${process.pid}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(artifactRoot, { recursive: true });

const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111; }
</style><link rel="stylesheet" href="/pet-assistant.css"></head><body>
<section class="pet-assistant" id="petAssistant" data-state="idle">
  <div class="pet-assistant__dock">
    <button class="pet-assistant__character" id="petAssistantCharacter" type="button">
      <canvas class="pet-assistant__particle-orb" id="petAssistantParticleOrb"></canvas>
    </button>
  </div>
  <audio id="petAssistantAudio"></audio>
</section>
<script>
window.__particleBoundsAudio = null;
window.FeMonsterPetActionBridge = { snapshot: () => window.__particleBoundsAudio };
</script>
<script src="/vendor/three.r128.min.js"></script>
<script src="/pet-particle-orb.js"></script>
</body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const contentType = file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
  response.writeHead(200, { 'content-type': contentType });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
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

async function debugPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) {
      try {
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch (error) {
        if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) throw error;
      }
    }
    await delay(60);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(60);
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
  const result = await command('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'browser evaluation failed');
  }
  return result.result?.value;
}

const sampleExpression = `(() => {
  const canvas = document.getElementById('petAssistantParticleOrb');
  const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
  if (!gl) return null;
  window.FeMonsterPetParticleOrb?.renderOnce?.();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let edgePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 4) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) edgePixels += 1;
    }
  }
  const status = window.FeMonsterPetParticleOrb?.status?.() || null;
  return {
    width, height, edgePixels, status,
    margins: {
      left: minX,
      right: maxX < 0 ? width : width - 1 - maxX,
      bottom: minY,
      top: maxY < 0 ? height : height - 1 - maxY
    }
  };
})()`;

async function assertSafeSequence(label, sampleCount, advanceFrames = 0) {
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    if (advanceFrames > 0) {
      await evaluate(`(() => {
        const start = performance.now();
        for (let frame = 0; frame < ${advanceFrames}; frame += 1) {
          window.FeMonsterPetParticleOrb.renderOnce(start + frame * (1000 / 60));
        }
      })()`);
    }
    const sample = await evaluate(sampleExpression);
    assert.ok(sample, `${label}: Edge did not expose a WebGL particle surface`);
    samples.push(sample);
    await delay(90);
  }
  for (const sample of samples) {
    const dpr = Number(sample.status?.dpr || 1);
    // The reference close-up reaches within about 2.2% of its crop edge
    // during the largest lobe. Four CSS pixels preserves that silhouette at
    // the 190px compact pet size while still forbidding framebuffer clipping.
    const minimumPhysicalMargin = Math.ceil(4 * dpr);
    assert.ok(Math.min(...Object.values(sample.margins)) >= minimumPhysicalMargin,
      `${label}: particle field lost its 4 CSS-pixel video-reference safe area: ${JSON.stringify(sample)}`);
    assert.equal(sample.edgePixels, 0,
      `${label}: visible particle pixels reached the canvas boundary: ${JSON.stringify(sample)}`);
    assert.equal(sample.status?.particleCount, 8192, `${label}: particle count changed`);
    assert.equal(sample.status?.drawCalls, 1, `${label}: particle field is no longer one GPU draw call`);
  }
  return samples.reduce((worst, sample) => ({
    dpr: sample.status.dpr,
    left: Math.min(worst.left, sample.margins.left),
    right: Math.min(worst.right, sample.margins.right),
    top: Math.min(worst.top, sample.margins.top),
    bottom: Math.min(worst.bottom, sample.margins.bottom)
  }), { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity, dpr: 1 });
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
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
  await command('Emulation.setDeviceMetricsOverride', {
    width: 640, height: 480, deviceScaleFactor: 1, mobile: false
  });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(window.FeMonsterPetParticleOrb?.status?.().ready)`)) break;
    await delay(50);
  }
  await delay(250);
  await evaluate(`window.FeMonsterPetParticleOrb?.stop?.()`);
  const idle = await assertSafeSequence('idle@1x', 12, 60);

  await evaluate(`(() => {
    window.__particleBoundsAudio = { playing: true, energy: 1, bass: 1, mid: 1, treble: 1, beat: 1 };
    document.getElementById('petAssistant').dataset.state = 'speaking';
  })()`);
  await delay(80);
  const active1x = await assertSafeSequence('max-active@1x', 24, 60);

  await command('Emulation.setDeviceMetricsOverride', {
    width: 640, height: 480, deviceScaleFactor: 1.25, mobile: false
  });
  await evaluate(`window.FeMonsterPetParticleOrb.resize()`);
  await delay(180);
  const active125x = await assertSafeSequence('max-active@1.25x', 24, 60);

  await command('Emulation.setDeviceMetricsOverride', {
    width: 640, height: 480, deviceScaleFactor: 1.5, mobile: false
  });
  await evaluate(`window.FeMonsterPetParticleOrb.resize()`);
  await delay(180);
  const active15x = await assertSafeSequence('max-active@1.5x', 24, 60);

  await command('Emulation.setDeviceMetricsOverride', {
    width: 640, height: 480, deviceScaleFactor: 2, mobile: false
  });
  await evaluate(`window.FeMonsterPetParticleOrb.resize()`);
  await delay(180);
  const active2x = await assertSafeSequence('max-active@2x', 24, 60);

  process.stdout.write(`${JSON.stringify({ ok: true, idle, active1x, active125x, active15x, active2x }, null, 2)}\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ id: nextId++, method: 'Browser.close', params: {} })); } catch {}
    await delay(250);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
  if (browser?.pid) {
    if (browser.exitCode === null) browser.kill();
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  await delay(120);
  if (profile.startsWith(`${artifactRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
}
