import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const executable = path.resolve(process.env.FE_TEST_CLIENT_EXE
  || path.join(root, 'native', 'windows', 'build', 'winforms', 'FE Monster.exe'));
const inputScript = path.join(root, 'scripts', 'pet-native-window-input.ps1');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.equal(process.platform, 'win32', 'native desktop pet bubble-region check requires Windows');
assert.ok(existsSync(executable), `build the WinForms client first: ${executable}`);
assert.ok(existsSync(inputScript), `native input helper is missing: ${inputScript}`);

let allowBubble = false;
let bubbleShown = null;
let bubbleHidden = false;
let pageError = '';
const page = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
#bubble{position:fixed;left:38px;top:16px;width:224px;height:48px;border:0;border-radius:14px;background:rgba(255,255,255,.3);color:#fff}
#character{position:fixed;right:16px;bottom:8px;width:276px;height:276px;border:0;border-radius:50%;background:rgba(255,255,255,.25)}
</style></head><body><button id="bubble" hidden>主动消息</button><button id="character">PET</button><script>
const bridge=window.chrome.webview;const bubble=document.getElementById('bubble');let announced=false;
function geometry(visible){const rect=bubble.getBoundingClientRect();return{type:'fe-pet-desktop',action:'bubble',visible,bounds:visible?{left:rect.left,top:rect.top,width:rect.width,height:rect.height,radius:14}:null,viewport:{width:innerWidth,height:innerHeight}}}
async function poll(){try{const state=await fetch('/bubble-command').then((value)=>value.json());if(state.show&&!announced){announced=true;bubble.hidden=false;requestAnimationFrame(()=>{bridge.postMessage(geometry(true));fetch('/bubble-shown',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rect:bubble.getBoundingClientRect(),viewport:{width:innerWidth,height:innerHeight}})})})}}catch(error){fetch('/probe-error?message='+encodeURIComponent(error.message),{method:'POST'})}}
bubble.addEventListener('click',()=>{bubble.hidden=true;bridge.postMessage(geometry(false));fetch('/bubble-hidden',{method:'POST'})});
setInterval(poll,80);setTimeout(()=>bridge.postMessage({type:'fe-pet-desktop',action:'enable'}),50);
</script></body></html>`;

const server = createServer((request, response) => {
  if (request.url === '/bubble-command') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ show: allowBubble }));
    return;
  }
  if (request.url === '/bubble-shown' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      bubbleShown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url === '/bubble-hidden' && request.method === 'POST') {
    bubbleHidden = true;
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
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(page);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const registryPath = `Software\\FE Monster\\DesktopPetTest\\bubble-region-${process.pid}`;
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

async function waitFor(predicate, label, attempts = 50) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (client.exitCode !== null) throw new Error(`${label}: client exited with code ${client.exitCode}`);
    try { last = nativeInput('snapshot'); } catch {}
    if (predicate(last)) return last;
    await delay(100);
  }
  throw new Error(`${label}; native=${JSON.stringify(last)}; bubble=${JSON.stringify(bubbleShown)}; pageError=${pageError || 'none'}`);
}

try {
  const baseline = await waitFor((value) => value?.visible && value.width >= 250 && value.width < 400,
    'desktop pet did not enter its closed native mode');
  const dpiScale = Math.max(1, Number(baseline.windowDpi || 96) / 96);
  const expectedHaloDiameter = 292 * dpiScale;
  const actualRegionWidth = baseline.regionRight - baseline.regionLeft;
  const actualRegionHeight = baseline.regionBottom - baseline.regionTop;
  const expectedCircularArea = Math.PI * (expectedHaloDiameter / 2) ** 2;
  assert.ok(Math.abs(actualRegionWidth - expectedHaloDiameter) <= 2
      && Math.abs(actualRegionHeight - expectedHaloDiameter) <= 2,
    `desktop pet native region clips the DPI-scaled particle halo: ${JSON.stringify({ baseline, expectedHaloDiameter })}`);
  assert.ok(baseline.regionArea >= expectedCircularArea * .975
      && baseline.regionArea <= expectedCircularArea * 1.025,
    `desktop pet halo region is not a tight circle (it may be clipped or an oversized transparent rectangle): ${JSON.stringify({ baseline, expectedCircularArea })}`);
  allowBubble = true;
  const expanded = await waitFor((value) => bubbleShown && value?.regionArea > baseline.regionArea + 2_000,
    'visible speech bubble was not added to the native interactive region');

  const scaleX = expanded.clientWidth / bubbleShown.viewport.width;
  const scaleY = expanded.clientHeight / bubbleShown.viewport.height;
  const clickPoint = {
    X: Math.round(expanded.clientLeft + (bubbleShown.rect.left + bubbleShown.rect.width / 2) * scaleX),
    Y: Math.round(expanded.clientTop + (bubbleShown.rect.top + bubbleShown.rect.height / 2) * scaleY)
  };
  const visibleProbe = nativeInput('click', clickPoint);
  assert.equal(visibleProbe.hitRootHandle, visibleProbe.handle,
    `visible bubble point is not owned by the desktop pet window: ${JSON.stringify(visibleProbe)}`);

  const retracted = await waitFor((value) => bubbleHidden
      && Math.abs(value.regionArea - baseline.regionArea) <= Math.max(160, baseline.regionArea * .004),
    'hidden speech bubble left a stale transparent native hit region');
  const hiddenProbe = nativeInput('click', clickPoint);
  assert.notEqual(hiddenProbe.hitRootHandle, hiddenProbe.handle,
    `hidden bubble point still blocks desktop input: ${JSON.stringify(hiddenProbe)}`);

  process.stdout.write(JSON.stringify({
    ok: true,
    baselineArea: baseline.regionArea,
    expandedArea: expanded.regionArea,
    retractedArea: retracted.regionArea,
    bubblePoint: clickPoint
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
