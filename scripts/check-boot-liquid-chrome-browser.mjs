import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const artifacts = path.join(root, 'artifacts');
const profile = path.join(artifacts, `.tmp-boot-liquid-chrome-${process.pid}`);
const screenshotPath = path.join(artifacts, 'boot-liquid-chrome-edge.png');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found at ${edge}`);
mkdirSync(artifacts, { recursive: true });

const logo = [...'FE moster'].map((character, index) => character === ' '
  ? `<span class="boot-logo-char is-space" style="--boot-char-index:${index}">&nbsp;</span>`
  : `<span class="boot-logo-char" style="--boot-char-index:${index}">${character}</span>`).join('');

const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/styles.css">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.boot-screen{border-radius:0}</style>
</head><body><section class="boot-screen" id="bootScreen" aria-label="FE moster launch screen">
<div class="boot-lightfall" id="bootLightfallMount" aria-hidden="true"></div>
<button class="boot-logo-button" id="bootLogoButton" type="button" aria-label="Enter FE moster"><span class="boot-logo-text" id="bootLogoText">${logo}</span></button>
</section>
<script>
addEventListener('fe-lightfall-ready',()=>document.getElementById('bootScreen').classList.add('is-bg-ready'),{once:true});
window.__bootMetrics=()=>{
  const canvas=document.querySelector('#bootLightfallMount canvas');
  if(!canvas)return null;
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  if(!gl)return null;
  window.FeMonsterBootLiquidChrome.renderOnce(performance.now());
  const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let sum=0,sumSq=0,chroma=0,bright=0,dark=0;
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const l=r*.2126+g*.7152+b*.0722;
    sum+=l;sumSq+=l*l;chroma+=Math.max(r,g,b)-Math.min(r,g,b);
    if(l>=150)bright++;if(l<=24)dark++;
  }
  const count=pixels.length/4;
  const mean=sum/count;
  let temporalDifference=0;
  if(window.__previousBootPixels&&window.__previousBootPixels.length===pixels.length){
    for(let i=0;i<pixels.length;i+=4){
      temporalDifference+=(Math.abs(pixels[i]-window.__previousBootPixels[i])+Math.abs(pixels[i+1]-window.__previousBootPixels[i+1])+Math.abs(pixels[i+2]-window.__previousBootPixels[i+2]))/3;
    }
    temporalDifference/=count;
  }
  window.__previousBootPixels=pixels;
  const logo=document.getElementById('bootLogoButton').getBoundingClientRect();
  const logoStyle=getComputedStyle(document.getElementById('bootLogoButton'));
  return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,mean,
    deviation:Math.sqrt(Math.max(0,sumSq/count-mean*mean)),chroma:chroma/count,
    brightFraction:bright/count,darkFraction:dark/count,temporalDifference,
    canvasDataset:{...canvas.dataset},mountDataset:{...canvas.parentElement.dataset},
    logo:{left:logo.left,top:logo.top,width:logo.width,height:logo.height,opacity:Number(logoStyle.opacity),filter:logoStyle.filter},
    status:window.FeMonsterBootLiquidChrome.status()};
};
</script><script type="module" src="/boot-lightfall-react.js"></script></body></html>`;

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
    'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
    'cache-control': 'no-store'
  });
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
browser.stderr?.on('data', chunk => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();
const externalRequests = [];
const pageErrors = [];

async function debugPort() {
  const activePort = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(activePort)) {
      try {
        const value = Number.parseInt(readFileSync(activePort, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch {}
    }
    await wait(50);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await wait(50);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function navigate() {
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate('Boolean(window.FeMonsterBootLiquidChrome?.status?.().ready)')) return;
    await wait(50);
  }
  const diagnostics = await evaluate(`({
    status: window.FeMonsterBootLiquidChrome?.status?.(),
    root: {...document.documentElement.dataset},
    mount: {...document.getElementById('bootLightfallMount')?.dataset}
  })`);
  throw new Error(`LiquidChrome did not become ready in Edge: ${pageErrors.join(' | ') || JSON.stringify(diagnostics)}`);
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
  const page = targets.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Network.requestWillBeSent') {
      const url = String(message.params?.request?.url || '');
      if (/^https?:/u.test(url) && !url.startsWith(`http://127.0.0.1:${port}/`)) externalRequests.push(url);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(String(message.params?.exceptionDetails?.exception?.description
        || message.params?.exceptionDetails?.text
        || 'unknown page exception'));
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Network.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate();
  await wait(260);
  const first = await evaluate('window.__bootMetrics()');
  await wait(420);
  const second = await evaluate('window.__bootMetrics()');

  assert.equal(first.status.background, 'liquid-chrome');
  assert.match(first.status.renderer, /^webgl2?$/u);
  assert.equal(first.canvasDataset.bootBackground, 'liquid-chrome');
  assert.equal(first.mountDataset.bootBackground, 'liquid-chrome');
  assert.ok(first.width >= 850 && first.height >= 450, `boot render surface is too soft: ${first.width}x${first.height}`);
  assert.ok(first.deviation >= 18, `LiquidChrome lacks visible metallic relief (${first.deviation})`);
  assert.ok(first.chroma >= 18, `LiquidChrome lost the purple-pink brand tint (${first.chroma})`);
  assert.ok(first.brightFraction >= 0.015 && first.brightFraction <= 0.72,
    `chrome highlights are clipped or missing (${first.brightFraction})`);
  assert.ok(first.darkFraction >= 0.04 && first.darkFraction <= 0.82,
    `chrome shadows are clipped or missing (${first.darkFraction})`);
  assert.ok(second.temporalDifference >= 1.2,
    `LiquidChrome is not visibly flowing (${second.temporalDifference})`);
  assert.ok(second.status.frameCount > first.status.frameCount,
    'the visible boot surface stopped scheduling frames before exit');
  assert.ok(first.logo.opacity >= 0.98 && first.logo.width > 200 && first.logo.height > 50,
    `the preserved FE moster logo is not visible: ${JSON.stringify(first.logo)}`);
  assert.ok(Math.abs((first.logo.left + first.logo.width / 2) - 640) <= 3,
    'the preserved logo moved away from the visual center');
  assert.deepEqual(externalRequests, [], `boot made runtime network requests: ${externalRequests.join(', ')}`);

  await wait(1500);
  const settledLogo = await evaluate(`(() => {
    const characters = [...document.querySelectorAll('.boot-logo-char')];
    return {
      text: document.getElementById('bootLogoText')?.textContent,
      opacities: characters.map(character => Number(getComputedStyle(character).opacity))
    };
  })()`);
  assert.equal(settledLogo.text.replace(/\u00a0/gu, ' '), 'FE moster');
  assert.ok(settledLogo.opacities.every(opacity => opacity >= 0.98),
    `the preserved logo did not finish its existing reveal: ${settledLogo.opacities.join(', ')}`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const beforeStop = second.status.frameCount;
  await evaluate("window.dispatchEvent(new CustomEvent('fe-lightfall-stop'))");
  await wait(120);
  const stopped = await evaluate(`({status:window.FeMonsterBootLiquidChrome.status(),canvas:Boolean(document.querySelector('#bootLightfallMount canvas'))})`);
  assert.equal(stopped.status.contextReleased, true);
  assert.equal(stopped.status.running, false);
  assert.equal(stopped.canvas, false);
  assert.ok(stopped.status.frameCount >= beforeStop);

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate();
  const reducedStart = await evaluate('window.FeMonsterBootLiquidChrome.status()');
  await wait(240);
  const reducedEnd = await evaluate('window.FeMonsterBootLiquidChrome.status()');
  assert.equal(reducedStart.reducedMotion, true);
  assert.equal(reducedEnd.running, false);
  assert.equal(reducedEnd.frameCount, reducedStart.frameCount,
    'reduced-motion mode must keep one static chrome frame instead of animating');
  assert.equal(await evaluate("document.documentElement.dataset.bootRenderState"), 'reduced-static');

  console.log(JSON.stringify({
    ok: true,
    screenshot: screenshotPath,
    renderer: first.status.renderer,
    backend: first.status.backend,
    resolution: `${first.width}x${first.height}`,
    deviation: first.deviation,
    chroma: first.chroma,
    brightFraction: first.brightFraction,
    darkFraction: first.darkFraction,
    temporalDifference: second.temporalDifference,
    frames: [first.status.frameCount, second.status.frameCount],
    reducedMotionFrames: [reducedStart.frameCount, reducedEnd.frameCount],
    externalRequests
  }, null, 2));
} finally {
  try { socket?.close(); } catch {}
  try { browser.kill(); } catch {}
  await new Promise(resolve => server.close(resolve));
  await wait(100);
  rmSync(profile, { recursive: true, force: true });
}
