import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const executable = path.resolve(process.env.FE_TEST_CLIENT_EXE
  || path.join(root, 'native', 'windows', 'build', 'winforms', 'FE Monster.exe'));
const inputScript = path.join(root, 'scripts', 'pet-native-window-input.ps1');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(process.platform === 'win32', 'native desktop pet runtime check requires Windows');
assert.ok(existsSync(executable), `build the WinForms client first: ${executable}`);
assert.ok(existsSync(inputScript), `native input helper is missing: ${inputScript}`);

let receivedMessage = '';
let receivedInput = '';
let pageReady = false;
let pageError = '';
let nativeResult = null;
let desktopGeometry = null;
const pointerTrace = [];
const requestTrace = [];
const page = `<!doctype html><html><head><meta charset="utf-8"><script>
const requestedClient=new URLSearchParams(location.search).get('client');
if(requestedClient)document.documentElement.setAttribute('data-fe-client',requestedClient);
</script><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:Segoe UI,sans-serif}
#panel{position:fixed;left:28px;top:34px;width:390px;height:190px;padding:20px;background:#eaeef2;border-radius:24px;box-sizing:border-box}
#panel[hidden]{display:none}#message{width:330px;height:52px;font-size:18px}#send{position:absolute;left:200px;top:104px;width:210px;height:86px}
#character{position:fixed;right:26px;bottom:16px;width:168px;height:190px;border:0;border-radius:45%;background:#70eeff;cursor:grab;touch-action:none;z-index:3}
#character:active{cursor:grabbing}
</style></head><body><section id="panel" hidden><form id="form"><textarea id="message"></textarea><button id="send" type="submit">send</button></form></section><button id="character">PET</button><script>
const bridge=window.chrome.webview;const panel=document.getElementById('panel');const character=document.getElementById('character');let drag=null;let suppress=false;
bridge.addEventListener('message',(event)=>{if(event.data?.type==='fe-pet-desktop-result')fetch('/probe-native-result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event.data)})});
function post(action,payload={}){bridge.postMessage({type:'fe-pet-desktop',action,...payload})}
function toggle(){panel.hidden=!panel.hidden;post('panel',{open:!panel.hidden})}
character.addEventListener('pointerdown',(event)=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.screenX,y:event.screenY,lastX:event.screenX,lastY:event.screenY,moved:false};character.setPointerCapture(event.pointerId)});
character.addEventListener('pointermove',(event)=>{if(!drag||event.pointerId!==drag.id)return;const total=Math.hypot(event.screenX-drag.x,event.screenY-drag.y);if(total>5)drag.moved=true;const dx=Math.round(event.screenX-drag.lastX),dy=Math.round(event.screenY-drag.lastY);drag.lastX=event.screenX;drag.lastY=event.screenY;if(drag.moved&&(dx||dy))post('move',{dx,dy})});
character.addEventListener('pointerup',(event)=>{if(!drag||event.pointerId!==drag.id)return;if(drag.moved){post('move-end');suppress=true;setTimeout(()=>suppress=false,0)}drag=null});
for(const eventName of ['pointerdown','pointerup','click'])character.addEventListener(eventName,()=>fetch('/probe-pointer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventName,client:document.documentElement.getAttribute('data-fe-client'),href:location.href})}));
character.addEventListener('click',()=>{if(!suppress)toggle()});
document.getElementById('form').addEventListener('submit',async(event)=>{event.preventDefault();await fetch('/probe-message',{method:'POST',headers:{'content-type':'text/plain'},body:document.getElementById('message').value})});
document.getElementById('message').addEventListener('input',(event)=>fetch('/probe-input',{method:'POST',headers:{'content-type':'text/plain'},body:event.target.value}));
setTimeout(async()=>{try{await fetch('/probe-geometry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client:document.documentElement.getAttribute('data-fe-client'),href:location.href,innerWidth,innerHeight,character:(()=>{const r=character.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()})});await fetch('/probe-ready',{method:'POST'});post('enable')}catch(error){fetch('/probe-error?message='+encodeURIComponent(error.message),{method:'POST'})}},50);
</script></body></html>`;

const server = createServer((request, response) => {
  requestTrace.push(`${request.method || 'GET'} ${request.url || '/'}`);
  if (requestTrace.length > 24) requestTrace.shift();
  if (request.url === '/probe-ready' && request.method === 'POST') {
    pageReady = true;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  if (request.url?.startsWith('/probe-error') && request.method === 'POST') {
    pageError = new URL(request.url, 'http://127.0.0.1').searchParams.get('message') || 'unknown page error';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  if (request.url === '/probe-native-result' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try { nativeResult = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { nativeResult = { error: 'invalid native result' }; }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url === '/probe-geometry' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (value.client === 'desktop-pet') desktopGeometry = value;
      } catch {}
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url === '/probe-pointer' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try { pointerTrace.push(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch {}
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url === '/probe-message' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      receivedMessage = Buffer.concat(chunks).toString('utf8');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url === '/probe-input' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      receivedInput = Buffer.concat(chunks).toString('utf8');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(page);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const registryPath = `Software\\FE Monster\\DesktopPetTest\\runtime-${process.pid}`;
const client = spawn(executable, ['--url', `http://127.0.0.1:${port}/`], {
  cwd: root,
  windowsHide: true,
  stdio: 'ignore',
  env: { ...process.env, FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH: registryPath }
});

function nativeInput(action, values = {}) {
  const args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', inputScript,
    '-RootProcessId', String(client.pid), '-Action', action];
  for (const [key, value] of Object.entries(values)) args.push(`-${key}`, String(value));
  const result = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `native ${action} failed`);
  return JSON.parse(result.stdout.trim());
}

async function waitForSnapshot(predicate, label) {
  let lastError = null;
  let lastSnapshot = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (client.exitCode !== null) throw new Error(`${label}: client exited with code ${client.exitCode}`);
    try {
      const snapshot = nativeInput('snapshot');
      lastSnapshot = snapshot;
      if (predicate(snapshot)) return snapshot;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`${label}: ${lastError?.message || 'timed out'}; lastSnapshot=${JSON.stringify(lastSnapshot)}; pageReady=${pageReady}; pageError=${pageError || 'none'}; nativeResult=${JSON.stringify(nativeResult)}; desktopGeometry=${JSON.stringify(desktopGeometry)}; pointerTrace=${JSON.stringify(pointerTrace)}; requestTrace=${JSON.stringify(requestTrace)}`);
}

const point = (snapshot, logicalX, logicalY, logicalWidth) => {
  const scale = snapshot.width / logicalWidth;
  return { X: Math.round(snapshot.left + logicalX * scale), Y: Math.round(snapshot.top + logicalY * scale) };
};

try {
  const dpiScale = (value) => Math.max(1, Number(value.windowDpi || 96) / 96);
  const closed = await waitForSnapshot((value) => value.visible
    && value.width >= 250 * dpiScale(value)
    && value.width < 350 * dpiScale(value), 'desktop pet did not enter closed native mode');
  await waitForSnapshot(() => desktopGeometry?.character?.width > 0, 'desktop pet page did not report its character geometry');
  const scaleX = closed.clientWidth / desktopGeometry.innerWidth;
  const scaleY = closed.clientHeight / desktopGeometry.innerHeight;
  const clickPoint = {
    X: Math.round(closed.clientLeft + (desktopGeometry.character.x + desktopGeometry.character.width / 2) * scaleX),
    Y: Math.round(closed.clientTop + (desktopGeometry.character.y + desktopGeometry.character.height / 2) * scaleY)
  };
  const clickProbe = nativeInput('click', clickPoint);
  let opened;
  try {
    opened = await waitForSnapshot((value) => value.visible
      && value.width >= 600 * dpiScale(value)
      && value.height >= 500 * dpiScale(value), 'native mascot click did not open chat panel');
  } catch (error) {
    throw new Error(`${error.message}; clickProbe=${JSON.stringify(clickProbe)}`);
  }

  const typeProbe = nativeInput('type', { ...point(opened, 170, 86, 720), Text: '123456789{TAB}{ENTER}' });
  for (let attempt = 0; attempt < 50 && !receivedMessage; attempt += 1) await delay(80);
  assert.equal(receivedMessage, '123456789',
    `native desktop message was not submitted to the server; input=${JSON.stringify(receivedInput)}; typeProbe=${JSON.stringify(typeProbe)}`);

  nativeInput('click', point(opened, 542, 486, 720));
  const beforeDrag = await waitForSnapshot((value) => value.visible
    && value.width >= 250 * dpiScale(value)
    && value.width < 350 * dpiScale(value), 'chat panel did not close');
  const dragStart = point(beforeDrag, 150, 180, 300);
  nativeInput('drag', { ...dragStart, ToX: dragStart.X - 80, ToY: dragStart.Y - 50 });
  const afterDrag = await waitForSnapshot(
    (value) => Math.abs(value.left - beforeDrag.left) >= 50 || Math.abs(value.top - beforeDrag.top) >= 35,
    'native desktop pet did not move after a real pointer drag'
  );

  process.stdout.write(JSON.stringify({
    ok: true,
    clickOpenedPanel: { before: [closed.width, closed.height], after: [opened.width, opened.height] },
    message: receivedMessage,
    dragDelta: [afterDrag.left - beforeDrag.left, afterDrag.top - beforeDrag.top]
  }, null, 2) + '\n');
} finally {
  client.kill();
  server.close();
  const registryLiteral = `HKCU:\\${registryPath}`.replaceAll("'", "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `if (Test-Path -LiteralPath '${registryLiteral}') { Remove-Item -LiteralPath '${registryLiteral}' -Recurse -Force }`], {
    windowsHide: true,
    stdio: 'ignore'
  });
}
