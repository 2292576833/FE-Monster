import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, 'artifacts', `.tmp-pet-live-particle-glow-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
const production = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const cssSource = readFileSync(path.join(webRoot, 'pet-assistant.css'), 'utf8');
assert.match(cssSource,
  /@media\s*\(prefers-reduced-transparency:\s*reduce\)[\s\S]*?#petAssistant\[data-live-conversation="active"\][\s\S]*?#petAssistantParticleOrb[\s\S]*?drop-shadow\(0 0 1px currentColor\)/,
  'reduced-transparency live glow fallback is missing');
const petStart = production.indexOf('<section class="pet-assistant" id="petAssistant"');
const petEnd = production.indexOf('<button class="pet-assistant-restore"', petStart);
assert.ok(petStart >= 0 && petEnd > petStart, 'production pet markup is missing');
const petMarkup = production.slice(petStart, petEnd);

const fixture = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <link rel="stylesheet" href="/pet-assistant.css">
  <style>html,body{margin:0;width:100%;height:100%;background:transparent}</style>
</head><body>${petMarkup}<script>
  const root = document.getElementById('petAssistant');
  root.hidden = false;
  root.dataset.liveConversation = 'inactive';
  root.dataset.state = 'idle';
  root.dataset.petMood = '3';
</script></body></html>`;

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
    const character = document.getElementById('petAssistantCharacter');
    const orb = document.getElementById('petAssistantParticleOrb');
    const panel = document.getElementById('petAssistantPanel');
    const speech = document.getElementById('petAssistantSpeech');
    const rect = (node) => { const value = node.getBoundingClientRect(); return {
      left:value.left, top:value.top, right:value.right, bottom:value.bottom,
      width:value.width, height:value.height
    }; };
    const rootStyle = getComputedStyle(root);
    const characterStyle = getComputedStyle(character);
    const orbStyle = getComputedStyle(orb);
    return {
      viewport:{width:innerWidth,height:innerHeight},
      root:rect(root), character:rect(character),
      characterHit:{width:character.offsetWidth,height:character.offsetHeight},
      rootBackground:rootStyle.backgroundColor,
      characterBackground:characterStyle.backgroundColor,
      characterColor:characterStyle.color,
      characterTransition:characterStyle.transitionDuration,
      orbBackground:orbStyle.backgroundColor,
      orbFilter:orbStyle.filter,
      orbAnimation:orbStyle.animationName,
      orbTransition:orbStyle.transitionDuration,
      reducedTransparency:matchMedia('(prefers-reduced-transparency: reduce)').matches,
      panelDisplay:getComputedStyle(panel).display,
      speechDisplay:getComputedStyle(speech).display
    };
  })()`);
}

function assertRectInside(rect, viewport, label) {
  assert.ok(rect.left >= -0.5 && rect.top >= -0.5
    && rect.right <= viewport.width + 0.5 && rect.bottom <= viewport.height + 0.5,
  `${label} is clipped: ${JSON.stringify({ rect, viewport })}`);
}

function dropShadowCount(filter) {
  return (String(filter).match(/drop-shadow\(/g) || []).length;
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
  // Keep the normal-motion assertions independent from the host Windows
  // accessibility preference. Reduced motion is exercised explicitly below.
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });
  await command('Emulation.setDeviceMetricsOverride', {
    width: 800, height: 640, deviceScaleFactor: 1, mobile: false
  });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`document.readyState === 'complete' && Boolean(document.getElementById('petAssistantParticleOrb'))`)) break;
    await delay(40);
  }
  await delay(280);

  const idle = await snapshot();
  assert.equal(idle.rootBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(idle.characterBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(idle.orbBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(dropShadowCount(idle.orbFilter), 0, `idle should keep each shader pearl separate: ${idle.orbFilter}`);

  await evaluate(`(() => {
    const root=document.getElementById('petAssistant');
    root.dataset.liveConversation='active';
    root.dataset.state='listening';
  })()`);
  await delay(300);
  const listening = await snapshot();
  assert.equal(listening.panelDisplay, 'none');
  assert.equal(listening.speechDisplay, 'none');
  assert.equal(dropShadowCount(listening.orbFilter), 0, `live glow must not blur neighboring pearls: ${listening.orbFilter}`);
  assert.notEqual(listening.orbFilter, idle.orbFilter);
  assert.equal(listening.orbAnimation, 'pet-live-particle-breathe');
  assert.deepEqual(listening.root, idle.root, 'live glow changed the root hit region');
  assert.deepEqual(listening.characterHit, idle.characterHit, 'live glow changed the character hit region');

  await evaluate(`document.getElementById('petAssistant').dataset.state='thinking'`);
  await delay(260);
  const thinking = await snapshot();
  await evaluate(`document.getElementById('petAssistant').dataset.state='speaking'`);
  await delay(260);
  const speaking = await snapshot();
  assert.notEqual(thinking.orbFilter, listening.orbFilter, 'thinking must have its own glow intensity');
  assert.notEqual(speaking.orbFilter, thinking.orbFilter, 'speaking must have its own glow intensity');
  assert.equal(dropShadowCount(speaking.orbFilter), 0);

  await evaluate(`document.getElementById('petAssistant').style.setProperty('--pet-particle-emotion-color','rgb(158 184 255)')`);
  await delay(1000);
  const calmColor = (await snapshot()).characterColor;
  await evaluate(`document.getElementById('petAssistant').style.setProperty('--pet-particle-emotion-color','rgb(255 184 237)')`);
  await delay(80);
  const transitioningColor = (await snapshot()).characterColor;
  await delay(1000);
  const playfulColor = (await snapshot()).characterColor;
  assert.equal(calmColor, 'rgb(158, 184, 255)');
  assert.notEqual(transitioningColor, calmColor, 'emotion color did not start transitioning');
  assert.notEqual(transitioningColor, playfulColor, 'emotion color snapped instead of transitioning');
  assert.equal(playfulColor, 'rgb(255, 184, 237)');

  await command('Emulation.setDeviceMetricsOverride', {
    width: 420, height: 700, deviceScaleFactor: 1.25, mobile: false
  });
  await delay(80);
  const narrow = await snapshot();
  assertRectInside(narrow.character, narrow.viewport, '420px live particle character');
  assert.equal(dropShadowCount(narrow.orbFilter), 0);

  await evaluate(`document.documentElement.dataset.feClient='desktop-pet'`);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 420, height: 420, deviceScaleFactor: 1.25, mobile: false
  });
  await delay(80);
  const detached = await snapshot();
  assertRectInside(detached.root, detached.viewport, 'desktop-pet root');
  assertRectInside(detached.character, detached.viewport, 'desktop-pet character');
  assert.equal(detached.rootBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(detached.characterBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(detached.orbBackground, 'rgba(0, 0, 0, 0)');

  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await delay(30);
  const reducedMotion = await snapshot();
  assert.equal(reducedMotion.orbAnimation, 'none');
  assert.match(reducedMotion.orbTransition, /(?:0s|1e-06s)/);

  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }]
  });
  await delay(30);
  const reducedTransparency = await snapshot();
  if (reducedTransparency.reducedTransparency) {
    assert.equal(reducedTransparency.orbAnimation, 'none');
    assert.equal(dropShadowCount(reducedTransparency.orbFilter), 1);
  }

  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: 'active' }]
  });
  await delay(30);
  const forcedColors = await snapshot();
  assert.equal(forcedColors.orbFilter, 'none');
  assert.equal(forcedColors.orbAnimation, 'none');

  console.log(JSON.stringify({
    ok:true,
    states:{ idle:idle.orbFilter, listening:listening.orbFilter,
      thinking:thinking.orbFilter, speaking:speaking.orbFilter },
    emotion:{ calmColor, transitioningColor, playfulColor },
    narrow:{ viewport:narrow.viewport, character:narrow.character },
    detached:{ viewport:detached.viewport, character:detached.character },
    reducedMotion:{ animation:reducedMotion.orbAnimation, transition:reducedMotion.orbTransition },
    reducedTransparency:reducedTransparency.orbFilter,
    forcedColors:forcedColors.orbFilter
  }, null, 2));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  server.close();
  await delay(450);
  rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
