import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const root = process.cwd();
const webRoot = path.join(root, 'web');
const profile = path.join(root, 'artifacts', `.tmp-pet-in-app-edge-${process.pid}`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);

const sourceHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const petStart = sourceHtml.indexOf('<section class="pet-assistant" id="petAssistant"');
const petEnd = sourceHtml.indexOf('<section class="update-dialog"', petStart);
assert.ok(petStart >= 0 && petEnd > petStart, 'production pet markup was not found');
const petMarkup = sourceHtml.slice(petStart, petEnd);
const fixture = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script>
    const mode = new URLSearchParams(location.search).get('client');
    if (mode) document.documentElement.setAttribute('data-fe-client', mode);
    window.FeMonsterCreativeBridge = { getContext: () => ({ provider: 'netease', profile: { feId: '11111111' } }) };
    window.fetch = async () => new Response(JSON.stringify({ ok: true, computerId: 'edge-fixture', sessions: [], pet: {} }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  </script>
  <link rel="stylesheet" href="/pet-assistant.css">
</head><body>${petMarkup}<script src="/pet-assistant.js"></script></body></html>`;

const mime = new Map([['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8']]);
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'content-type': mime.get(path.extname(file)) || 'application/octet-stream' });
  response.end(readFileSync(file));
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
mkdirSync(profile, { recursive: true });
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new', '--no-sandbox', '--remote-allow-origins=*', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();

async function debugPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(file)) {
      try {
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (value > 0) return value;
      } catch {}
    }
    await delay(50);
  }
  throw new Error(`Edge did not start: ${browserError.trim()}`);
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(expression, label, timeout = 3500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function navigate(client = 'embedded') {
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/?client=${client}` });
  await waitFor('Boolean(window.FeMonsterPetAssistant)', `${client} pet initialization`, 6000);
}

async function place(x, y, client = 'embedded') {
  await evaluate(`localStorage.setItem('fe-monster-pet-assistant-v1', JSON.stringify({visible:true,collapsed:false,x:${x},y:${y}}))`);
  await navigate(client);
}

async function mouse(x, y) {
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
}

async function snapshot() {
  return evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    const rect = root.getBoundingClientRect();
    return { hidden: root.getAttribute('data-in-app-edge-hidden') || '', docked: root.getAttribute('data-in-app-edge-docked') || '',
      state: root.dataset.state, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      edgeX: getComputedStyle(root).getPropertyValue('--pet-edge-x').trim(), edgeY: getComputedStyle(root).getPropertyValue('--pet-edge-y').trim() };
  })()`);
}

const dimensions = { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false };
const results = {};
try {
  const devtoolsPort = await debugPort();
  const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json`)).json();
  const page = targets.find((entry) => entry.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Edge page target missing');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', dimensions);
  await navigate();

  const cases = {
    left: { x: 8, y: 220, far: [500, 650], near: [3, 320] },
    right: { x: 816, y: 220, far: [500, 650], near: [997, 320] },
    top: { x: 400, y: 8, far: [500, 650], near: [480, 3] },
    bottom: { x: 400, y: 474, far: [500, 100], near: [480, 697] }
  };
  for (const [edgeName, item] of Object.entries(cases)) {
    await place(item.x, item.y);
    await mouse(...item.far);
    await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === '${edgeName}'`, `${edgeName} hide`, 2600);
    await delay(380);
    const hidden = await snapshot();
    assert.equal(hidden.docked, edgeName);
    const visibleStrip = edgeName === 'left' ? hidden.right
      : edgeName === 'right' ? dimensions.width - hidden.left
        : edgeName === 'top' ? hidden.bottom
          : dimensions.height - hidden.top;
    assert.ok(Math.abs(visibleStrip - 24) <= 1, `${edgeName} final wake strip was ${visibleStrip}px, expected 24px`);
    await mouse(...item.near);
    await waitFor(`!document.getElementById('petAssistant').hasAttribute('data-in-app-edge-hidden')`, `${edgeName} reveal`);
    await delay(340);
    const revealed = await snapshot();
    assert.equal(revealed.edgeX, '0px');
    assert.equal(revealed.edgeY, '0px');
    results[edgeName] = { hidden, visibleStrip, revealed };
  }

  await place(8, 220, 'browser');
  await mouse(500, 650); await delay(1900);
  const isolated = await snapshot();
  assert.equal(isolated.hidden, ''); assert.equal(isolated.docked, '');
  results.browserIsolation = isolated;

  await place(8, 220);
  await evaluate(`window.FeMonsterPetAssistant.open()`);
  await mouse(500, 650); await delay(1900);
  assert.equal((await snapshot()).hidden, '', 'open text panel must prevent hiding');
  await evaluate(`window.FeMonsterPetAssistant.close()`);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'hide after panel closes');
  results.panelProtected = true;

  await place(8, 220);
  await evaluate(`document.getElementById('petAssistant').classList.add('is-pet-tour-guide'); window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-start'))`);
  await mouse(500, 650); await delay(1900);
  assert.equal((await snapshot()).hidden, '', 'active product tour must prevent hiding');
  await evaluate(`document.getElementById('petAssistant').classList.remove('is-pet-tour-guide'); window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-end'))`);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'hide after product tour');
  results.tourProtected = true;

  await place(8, 220);
  await evaluate(`(() => { const c=document.getElementById('petAssistantCharacter'); c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:71,clientX:80,clientY:300})); c.dispatchEvent(new PointerEvent('lostpointercapture',{bubbles:true,pointerId:71,clientX:80,clientY:300})); })()`);
  assert.notEqual((await snapshot()).state, 'dragging', 'lost pointer capture must end dragging');
  await mouse(500, 650);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'hide after lost pointer capture');
  results.lostPointerCapture = true;

  await command('Emulation.setDeviceMetricsOverride', dimensions);
  await place(8, 220); await mouse(500, 650);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'pre-resize hide');
  await command('Emulation.setDeviceMetricsOverride', { ...dimensions, width: 900, height: 640 });
  await waitFor(`!document.getElementById('petAssistant').hasAttribute('data-in-app-edge-hidden')`, 'resize reveal');
  await mouse(450, 600);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'resize re-arm', 2600);
  results.resizeRearmed = true;

  await command('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await command('Emulation.setDeviceMetricsOverride', dimensions);
  await place(8, 220); await mouse(500, 650);
  await waitFor(`document.getElementById('petAssistant').getAttribute('data-in-app-edge-hidden') === 'left'`, 'reduced-motion hide');
  const reducedDuration = await evaluate(`getComputedStyle(document.getElementById('petAssistant')).transitionDuration`);
  assert.ok(reducedDuration === '0s' || reducedDuration === '1e-06s' || Number.parseFloat(reducedDuration) <= 0.001, `unexpected reduced transition: ${reducedDuration}`);
  results.reducedMotionDuration = reducedDuration;

  console.log(JSON.stringify({ pass: true, results }, null, 2));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  server.close();
  await delay(150);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
