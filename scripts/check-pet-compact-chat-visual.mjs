import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, 'artifacts', `.tmp-pet-compact-visual-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
const production = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const petStart = production.indexOf('<section class="pet-assistant" id="petAssistant"');
const petEnd = production.indexOf('<button class="pet-assistant-restore"', petStart);
assert.ok(petStart >= 0 && petEnd > petStart, 'production pet markup is missing');
const petMarkup = production.slice(petStart, petEnd);

const voiceStart = production.indexOf('<details class="runtime-settings-group runtime-pet-voice-settings"');
const voiceEnd = production.indexOf('</details>', voiceStart);
assert.ok(voiceStart >= 0 && voiceEnd > voiceStart, 'runtime pet voice settings are missing');
const voiceMarkup = production.slice(voiceStart, voiceEnd + '</details>'.length);

const fixture = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/pet-assistant.css">
  <style>html,body{margin:0;width:100%;height:100%;background:#30343a}</style>
</head><body>
  <section class="runtime-settings-panel" id="runtimeSettingsPanel" style="left:12px;right:auto;top:12px;max-height:none">
    ${voiceMarkup}
  </section>
  ${petMarkup}
  <script>
    const root = document.getElementById('petAssistant');
    const panel = document.getElementById('petAssistantPanel');
    root.hidden = false;
    root.style.left = '420px';
    root.style.top = '380px';
    root.classList.add('is-panel-left');
    panel.hidden = false;
    const message = document.createElement('article');
    message.className = 'pet-assistant__message is-assistant';
    message.innerHTML = '<span>小 Fe</span><p>我在，想打字就直接说。</p>';
    document.getElementById('petAssistantMessages').append(message);
    document.getElementById('petAssistantVoiceDisclosure').open = true;
  </script>
</body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
mkdirSync(profile, { recursive: true });
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

let browserError = '';
browser.stderr.on('data', (chunk) => { browserError += String(chunk); });
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
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function snapshot() {
  return evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    const panel = document.getElementById('petAssistantPanel');
    const message = document.querySelector('.pet-assistant__message p');
    const input = document.getElementById('petAssistantInput');
    const send = document.getElementById('petAssistantSend');
    const speech = document.getElementById('petAssistantSpeech');
    const character = document.getElementById('petAssistantCharacter');
    const orb = document.getElementById('petAssistantParticleOrb');
    const runtimeSelect = document.getElementById('petAssistantVoiceSelect');
    const runtimeVoice = document.querySelector('.runtime-pet-voice-settings .pet-assistant__voice-settings');
    const runtimePlayback = document.querySelector('.runtime-pet-voice-settings .pet-assistant__voice-playback');
    const rect = (node) => { const value = node.getBoundingClientRect(); return {
      left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height
    }; };
    const style = (node) => {
      const value = getComputedStyle(node);
      return {
        display:value.display, visibility:value.visibility, background:value.backgroundColor,
        backgroundImage:value.backgroundImage, border:value.borderTopColor,
        borderWidth:value.borderTopWidth, radius:value.borderTopLeftRadius,
        backdrop:value.backdropFilter || value.webkitBackdropFilter,
        boxShadow:value.boxShadow, color:value.color, animation:value.animationName
      };
    };
    return {
      viewport:{width:innerWidth,height:innerHeight}, root:rect(root), panel:rect(panel),
      panelStyle:style(panel), messageStyle:style(message), inputStyle:style(input), sendStyle:style(send),
      speechStyle:style(speech), characterStyle:style(character), orbStyle:style(orb),
      runtimeSelectStyle:style(runtimeSelect), runtimeVoiceStyle:style(runtimeVoice),
      runtimePlaybackStyle:style(runtimePlayback)
    };
  })()`);
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
  await command('Emulation.setDeviceMetricsOverride', { width: 800, height: 640, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`document.readyState === 'complete' && Boolean(document.getElementById('petAssistantPanel'))`)) break;
    await delay(40);
  }
  await delay(260);

  const desktop = await snapshot();
  assert.equal(desktop.panelStyle.background, 'rgba(255, 255, 255, 0.12)');
  assert.equal(desktop.panelStyle.backgroundImage, 'none');
  assert.equal(desktop.panelStyle.radius, '16px');
  assert.match(desktop.panelStyle.backdrop, /blur\(22px\)/);
  assert.ok(desktop.panel.width <= 320.5 && desktop.panel.height <= 360.5);
  assert.ok(desktop.panel.left >= 0 && desktop.panel.top >= 0
    && desktop.panel.right <= desktop.viewport.width && desktop.panel.bottom <= desktop.viewport.height,
  `desktop text bubble is clipped: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.messageStyle.background, 'rgba(0, 0, 0, 0)');
  assert.equal(desktop.messageStyle.borderWidth, '0px');
  assert.equal(desktop.inputStyle.background, 'rgba(255, 255, 255, 0.1)');
  assert.equal(desktop.sendStyle.background, 'rgba(0, 0, 0, 0.2)');
  assert.equal(desktop.characterStyle.background, 'rgba(0, 0, 0, 0)');
  assert.equal(desktop.orbStyle.background, 'rgba(0, 0, 0, 0)');
  assert.equal(desktop.speechStyle.display, 'none');
  assert.equal(desktop.runtimeSelectStyle.background, 'rgb(9, 11, 14)');
  assert.equal(desktop.runtimeVoiceStyle.background, 'rgba(0, 0, 0, 0)');
  assert.equal(desktop.runtimePlaybackStyle.background, 'rgb(17, 19, 22)');

  const proactive = await evaluate(`(() => {
    const root=document.getElementById('petAssistant');
    const speech=document.getElementById('petAssistantSpeech');
    root.dataset.petProactive='true';
    return getComputedStyle(speech).display;
  })()`);
  assert.equal(proactive, 'block');
  const live = await evaluate(`(() => {
    const root=document.getElementById('petAssistant');
    root.dataset.liveConversation='active';
    return {
      panel:getComputedStyle(document.getElementById('petAssistantPanel')).display,
      speech:getComputedStyle(document.getElementById('petAssistantSpeech')).display
    };
  })()`);
  assert.deepEqual(live, { panel: 'none', speech: 'none' });

  await command('Emulation.setDeviceMetricsOverride', { width: 420, height: 700, deviceScaleFactor: 1.25, mobile: false });
  await evaluate(`(() => {
    const root=document.getElementById('petAssistant');
    root.dataset.liveConversation='inactive'; root.dataset.petProactive='false';
  })()`);
  await delay(60);
  const narrow = await snapshot();
  assert.ok(narrow.panel.left >= 11.5 && narrow.panel.right <= narrow.viewport.width - 11.5
    && narrow.panel.top >= 0 && narrow.panel.bottom <= narrow.viewport.height,
  `narrow text bubble is clipped: ${JSON.stringify(narrow)}`);

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedMotion = await evaluate(`getComputedStyle(document.getElementById('petAssistantPanel')).animationName`);
  assert.equal(reducedMotion, 'none');

  console.log(JSON.stringify({
    ok: true,
    desktop: { panel: desktop.panel, material: desktop.panelStyle, runtimeSelect: desktop.runtimeSelectStyle.background },
    live,
    narrow: { viewport: narrow.viewport, panel: narrow.panel },
    reducedMotion
  }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  server.close();
  await delay(450);
  rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
