import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'web');
const serverRoot = path.resolve(root, '..', 'FE moster server');
const requireFromServer = createRequire(path.join(serverRoot, 'package.json'));
const sharp = requireFromServer('sharp');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temporaryRoot = path.join(root, 'tmp');
mkdirSync(temporaryRoot, { recursive: true });
assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);

const production = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
function extract(id, tag) {
  const idAt = production.indexOf(`id="${id}"`);
  const start = idAt >= 0 ? production.lastIndexOf(`<${tag}`, idAt) : -1;
  const end = start >= 0 ? production.indexOf(`</${tag}>`, start) : -1;
  assert.ok(start >= 0 && end > start, `production markup missing: ${id}`);
  return production.slice(start, end + tag.length + 3);
}
const trigger = extract('communityIdentityCardButton', 'button');
const dialog = extract('feIdentityCardDialog', 'section');
const fixture = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/fe-identity-card.css">
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17130f}
.community-card{position:fixed;left:16px;top:16px}.community-card__head,.community-profile{display:grid}
#feIdentityCardDialog{display:block!important}
#feIdentityCardStage{perspective:none!important}
#feIdentityCardShell{animation:none!important;transform:none!important;transition:none!important}
#feIdentityCard{transform:none!important;transition:none!important}
.fe-identity-card__shadow,.fe-identity-card__aura{display:none!important}
.fe-identity-card__front::after{animation:none!important;opacity:0!important}
</style></head><body>
<section class="community-card"><div class="community-card__head"><span class="community-profile"><strong id="communityName">PIXEL</strong></span>${trigger}</div><strong id="communityFeId">12345678</strong></section>
${dialog}
<script>window.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,owned:[],animations:[]})});</script>
<script src="/fe-identity-card.js"></script></body></html>`;

const fixtureServer = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'text/javascript', 'cache-control': 'no-store' });
  response.end(readFileSync(file));
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}
async function waitFor(check, label, timeout = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const result = await check(); if (result) return result; } catch {}
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const operation = this.pending.get(message.id);
      if (!operation) return;
      this.pending.delete(message.id);
      clearTimeout(operation.timer);
      if (message.error) operation.reject(new Error(message.error.message));
      else operation.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.socket.close(); } catch {} }
}
async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

function stats(raw, info) {
  const channels = info.channels;
  const width = info.width;
  const height = info.height;
  const lum = new Float64Array(width * height);
  let sum = 0;
  const values = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const value = raw[offset] * 0.2126 + raw[offset + 1] * 0.7152 + raw[offset + 2] * 0.0722;
      lum[y * width + x] = value;
      sum += value;
      values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  const p95 = values[Math.floor(values.length * 0.95)];
  let horizontal = 0, vertical = 0, laplacian = 0, samples = 0, highlights = 0;
  let highlights220 = 0, highlights245 = 0;
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const index = y * width + x;
      horizontal += Math.abs(lum[index + 1] - lum[index - 1]);
      vertical += Math.abs(lum[index + width] - lum[index - width]);
      laplacian += Math.abs(lum[index] * 4 - lum[index - 1] - lum[index + 1] - lum[index - width] - lum[index + width]);
      highlights += lum[index] >= p95 ? 1 : 0;
      highlights220 += lum[index] >= 220 ? 1 : 0;
      highlights245 += lum[index] >= 245 ? 1 : 0;
      samples += 1;
    }
  }
  return {
    meanLuminance: sum / lum.length,
    horizontalEnergy: horizontal / samples,
    verticalEnergy: vertical / samples,
    directionality: horizontal / Math.max(1, vertical),
    laplacianEnergy: laplacian / samples,
    highlightArea: highlights / samples,
    highlightArea220: highlights220 / samples,
    highlightArea245: highlights245 / samples
  };
}
function difference(left, right) {
  assert.equal(left.raw.length, right.raw.length);
  let sum = 0, changed = 0;
  const deltas = [];
  for (let index = 0; index < left.raw.length; index += left.info.channels) {
    const delta = (Math.abs(left.raw[index] - right.raw[index]) + Math.abs(left.raw[index + 1] - right.raw[index + 1]) + Math.abs(left.raw[index + 2] - right.raw[index + 2])) / 3;
    sum += delta;
    changed += delta >= 3 ? 1 : 0;
    deltas.push(delta);
  }
  deltas.sort((a, b) => a - b);
  return { mae: sum / deltas.length, p95: deltas[Math.floor(deltas.length * 0.95)], changedRatio: changed / deltas.length };
}
async function decode(data) {
  const result = await sharp(Buffer.from(data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { ...result, metrics: stats(result.data, result.info), raw: result.data };
}

const palette = {
  primaryColor: '#B97812', secondaryColor: '#4A2106', accentColor: '#F7D77C',
  frontColor: '#C88B18', backColor: '#341804', borderColor: '#FFE7A0', inkColor: '#321A03',
  metalness: 0.8, roughness: 0.5, bevel: 10, sweepIntensity: 0.9, engravingDepth: 0.65,
  issuedByServer: true, nicknameEditable: false, engravedNickname: 'PIXEL AUDIT'
};
const materials = ['polished-gold', 'brushed-gold', 'rose-gold', 'black-gold', 'silver', 'titanium', 'obsidian', 'ceramic'];
const finishes = ['polished', 'brushed', 'satin', 'hammered', 'mirror'];

async function captureNode(client, selector) {
  const rect = await evaluate(client, `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
  const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { ...rect, scale: 1 } });
  return decode(shot.data);
}

const fixturePort = await freePort();
const adminPort = await freePort();
const debugPort = await freePort();
const profileDir = mkdtempSync(path.join(temporaryRoot, 'identity-material-pixel-edge-'));
const adminDataDir = mkdtempSync(path.join(temporaryRoot, 'identity-material-pixel-data-'));
fixtureServer.listen(fixturePort, '127.0.0.1');
await once(fixtureServer, 'listening');
const adminServer = spawn(process.execPath, [path.join(serverRoot, 'server.js')], {
  cwd: serverRoot,
  env: { ...process.env, TEMP: temporaryRoot, TMP: temporaryRoot, PORT: String(adminPort), FE_MONSTER_COMMUNITY_HOST: '127.0.0.1', FE_MONSTER_COMMUNITY_DATA: adminDataDir },
  stdio: 'ignore', windowsHide: true
});
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--disable-background-networking', '--remote-allow-origins=*',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, '--window-size=1200,900', 'about:blank'
], { stdio: 'ignore', windowsHide: true });
let client;

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${adminPort}/health`)).ok, 'admin server');
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  }, 'Edge target');
  client = new Cdp(target.webSocketDebuggerUrl);
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

  await client.send('Page.navigate', { url: `http://127.0.0.1:${fixturePort}/` });
  await waitFor(() => evaluate(client, 'Boolean(window.FeMonsterIdentityCard)'), 'client identity runtime');
  const clientSamples = {};
  async function clientSample(material, finish) {
    await evaluate(client, `(() => {
      const card=${JSON.stringify(palette)};
      window.FeMonsterIdentityCard.showExternal({owner:{feId:'87654321',username:'PIXEL'},card:{...card,id:'pixel-${material}-${finish}',label:'PIXEL',material:${JSON.stringify(material)},finish:${JSON.stringify(finish)}}});
      const stage=document.getElementById('feIdentityCardStage');
      stage.classList.remove('is-entering','is-landed','is-lifting','is-showcasing');
      document.getElementById('feIdentityCard').setAttribute('aria-pressed','false');
    })()`);
    await delay(50);
    return captureNode(client, '#feIdentityCardFront');
  }
  for (const material of materials) clientSamples[`material:${material}`] = await clientSample(material, 'polished');
  for (const finish of finishes) clientSamples[`finish:${finish}`] = await clientSample('polished-gold', finish);

  await client.send('Page.navigate', { url: `http://127.0.0.1:${adminPort}/admin` });
  await waitFor(() => evaluate(client, 'document.getElementById("syncIndicator")?.classList.contains("is-ok")'), 'admin identity preview');
  await evaluate(client, `(() => {
    const view=document.querySelector('[data-view="operations"]');view?.click();
    const studio=document.getElementById('identityCardStudio');studio.hidden=false;studio.style.display='block';
    const preview=document.querySelector('.identity-card-preview');preview.style.position='fixed';preview.style.left='360px';preview.style.top='110px';preview.style.width='430px';preview.style.zIndex='99999';preview.style.display='block';
    document.querySelector('.identity-card-preview__stage').style.minHeight='300px';
    const values=${JSON.stringify({
      identityCardPrimary: palette.primaryColor, identityCardSecondary: palette.secondaryColor,
      identityCardAccent: palette.accentColor, identityCardFrontColor: palette.frontColor,
      identityCardBackColor: palette.backColor, identityCardBorderColor: palette.borderColor,
      identityCardMetalness: String(palette.metalness), identityCardRoughness: String(palette.roughness),
      identityCardBevel: String(palette.bevel), identityCardSweepIntensity: String(palette.sweepIntensity),
      identityCardEngravingDepth: String(palette.engravingDepth), identityCardEngravedNickname: palette.engravedNickname
    })};
    for(const [id,value] of Object.entries(values)){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
    const style=document.createElement('style');style.textContent='#identityCardLivePreview{animation:none!important;transform:none!important;transition:none!important}.identity-card-preview__front::after{animation:none!important;opacity:0!important}';document.head.append(style);
  })()`);
  const adminSamples = {};
  async function adminSample(material, finish) {
    await evaluate(client, `(() => { for(const [id,value] of Object.entries({identityCardMaterial:${JSON.stringify(material)},identityCardFinish:${JSON.stringify(finish)}})){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));} })()`);
    await delay(50);
    return captureNode(client, '.identity-card-preview__front');
  }
  for (const material of materials) adminSamples[`material:${material}`] = await adminSample(material, 'polished');
  for (const finish of finishes) adminSamples[`finish:${finish}`] = await adminSample('polished-gold', finish);

  function report(samples) {
    const materialBase = samples['material:polished-gold'];
    const finishBase = samples['finish:polished'];
    return {
      materials: {
        ...Object.fromEntries(materials.slice(1).map((name) => [name, difference(materialBase, samples[`material:${name}`])]))
      },
      finishes: Object.fromEntries(finishes.slice(1).map((name) => [name, {
        difference: difference(finishBase, samples[`finish:${name}`]),
        texture: samples[`finish:${name}`].metrics
      }])),
      polishedTexture: finishBase.metrics
    };
  }
  const result = { client: report(clientSamples), admin: report(adminSamples) };
  console.log(JSON.stringify(result, null, 2));

  for (const [surface, data] of Object.entries(result)) {
    for (const [material, measurement] of Object.entries(data.materials)) {
      assert.ok(measurement.mae >= 2.5 && measurement.changedRatio >= 0.2,
        `${surface}: ${material} is visually indistinguishable from polished gold (${JSON.stringify(measurement)})`);
    }
    for (const [finish, measurement] of Object.entries(data.finishes)) {
      assert.ok(measurement.difference.mae >= 2.5 && measurement.difference.changedRatio >= 0.2,
        `${surface}: ${finish} finish is visually indistinguishable from polished (${JSON.stringify(measurement.difference)})`);
    }
  }
  console.log('Identity card material pixel contract PASS');
} finally {
  try { await client?.send('Browser.close'); } catch {}
  client?.close();
  if (browser.exitCode === null) browser.kill();
  if (adminServer.exitCode === null) adminServer.kill();
  await new Promise((resolve) => fixtureServer.close(resolve));
  await delay(350);
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 }); } catch {}
  try { rmSync(adminDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 }); } catch {}
}
