import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const executable = path.resolve(process.env.FE_TEST_CLIENT_EXE
  || path.join(root, 'native', 'windows', 'build', 'winforms', 'FE Monster.exe'));
const inputScript = path.join(root, 'scripts', 'pet-native-window-input.ps1');
const webRoot = path.join(root, 'web');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.equal(process.platform, 'win32', 'native desktop pet DPI layout check requires Windows');
assert.ok(existsSync(executable), `build the WinForms client first: ${executable}`);
assert.ok(existsSync(inputScript), `native window probe is missing: ${inputScript}`);

const index = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const petStart = index.indexOf('<section class="pet-assistant" id="petAssistant"');
const petEnd = index.indexOf('<button class="pet-assistant-restore"', petStart);
assert.ok(petStart >= 0 && petEnd > petStart, 'could not extract the production #petAssistant markup');
const petMarkup = index.slice(petStart, petEnd);

let geometry = null;
let pageError = '';
let allowPanelClose = false;
let panelClosed = false;
const page = `<!doctype html>
<html data-fe-client="embedded"><head><meta charset="utf-8"><script>
const requestedClient=new URLSearchParams(location.search).get('client');
if(requestedClient)document.documentElement.setAttribute('data-fe-client',requestedClient);
</script>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/pet-assistant.css">
<style>
html[data-fe-client="desktop-pet"] #petAssistant,
html[data-fe-client="desktop-pet"] #petAssistant * { animation: none !important; transition: none !important; }
</style>
</head><body>${petMarkup}<script>
(() => {
  const bridge = window.chrome?.webview;
  const root = document.getElementById('petAssistant');
  const panel = document.getElementById('petAssistantPanel');
  const character = document.getElementById('petAssistantCharacter');
  const particleOrb = document.getElementById('petAssistantParticleOrb');
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
      width: value.width, height: value.height };
  };
  let panelSyncFrame = 0;
  let closeAnnounced = false;
  const panelPayload = (open) => {
    const style = open ? getComputedStyle(panel) : null;
    const radius = open ? (Number.parseFloat(style.borderTopLeftRadius) || 16) : null;
    const bounds = open ? { ...rect(panel), radius } : null;
    return {
      type: 'fe-pet-desktop',
      action: 'panel',
      open,
      surface: 'text-bubble',
      bounds,
      radius,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      requestId: open ? 'dpi-open' : 'dpi-close'
    };
  };
  const syncPanel = (open) => bridge?.postMessage(panelPayload(open));
  const queuePanelSync = () => {
    if (panelSyncFrame || panel.hidden) return;
    panelSyncFrame = requestAnimationFrame(() => {
      panelSyncFrame = 0;
      syncPanel(true);
    });
  };
  const pollPanelClose = async () => {
    if (closeAnnounced) return;
    try {
      const command = await fetch('/panel-close-command', { cache: 'no-store' }).then((response) => response.json());
      if (!command.close) return;
      closeAnnounced = true;
      panel.hidden = true;
      syncPanel(false);
      await fetch('/probe-panel-closed', { method: 'POST' });
    } catch (error) {
      fetch('/probe-error?message=' + encodeURIComponent(error?.stack || error?.message || String(error)), { method: 'POST' });
    }
  };
  const report = async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      // Font/layout settling can move an auto-height bubble by one physical
      // pixel at 125% DPI. Send the final DOMRect before inspecting the HWND.
      syncPanel(true);
      await new Promise((resolve) => setTimeout(resolve, 120));
      const panelStyle = getComputedStyle(panel);
      const bodyStyle = getComputedStyle(document.body);
      const payload = {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          scale: window.visualViewport.scale
        } : null,
        documentClient: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight
        },
        root: rect(root),
        panel: rect(panel),
        character: rect(character),
        particleOrb: rect(particleOrb),
        panelBorderRadius: Number.parseFloat(panelStyle.borderTopLeftRadius) || 0,
        panelComputedWidth: Number.parseFloat(panelStyle.width) || 0,
        panelScroll: {
          width: panel.scrollWidth,
          height: panel.scrollHeight,
          clientWidth: panel.clientWidth,
          clientHeight: panel.clientHeight
        },
        bodyBackgroundColor: bodyStyle.backgroundColor,
        htmlClientMode: document.documentElement.getAttribute('data-fe-client')
      };
      await fetch('/probe-geometry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (error) {
      fetch('/probe-error?message=' + encodeURIComponent(error?.stack || error?.message || String(error)), { method: 'POST' });
    }
  };
  bridge?.addEventListener('message', (event) => {
    if (event.data?.type !== 'fe-pet-desktop-result') return;
    if (event.data.requestId === 'dpi-enable') {
      root.hidden = false;
      panel.hidden = false;
      requestAnimationFrame(() => {
        syncPanel(true);
        report();
      });
      return;
    }
  });
  window.addEventListener('resize', queuePanelSync);
  new ResizeObserver(queuePanelSync).observe(panel);
  window.addEventListener('error', (event) => {
    fetch('/probe-error?message=' + encodeURIComponent(event.message || 'page error'), { method: 'POST' });
  });
  setInterval(pollPanelClose, 80);
  setTimeout(() => bridge?.postMessage({ type: 'fe-pet-desktop', action: 'enable', requestId: 'dpi-enable' }), 100);
})();
</script></body></html>`;

const mime = (file) => file.endsWith('.css') ? 'text/css; charset=utf-8'
  : file.endsWith('.png') ? 'image/png'
    : 'application/octet-stream';
const server = createServer((request, response) => {
  if (request.url === '/panel-close-command') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ close: allowPanelClose }));
    return;
  }
  if (request.url === '/probe-panel-closed' && request.method === 'POST') {
    panelClosed = true;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  if (request.url === '/probe-geometry' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (value.htmlClientMode === 'desktop-pet') geometry = value;
      }
      catch (error) { pageError = `invalid geometry JSON: ${error.message}`; }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (request.url?.startsWith('/probe-error') && request.method === 'POST') {
    pageError = new URL(request.url, 'http://127.0.0.1').searchParams.get('message') || 'unknown page error';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  if (request.url === '/pet-assistant.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(webRoot, 'pet-assistant.css')));
    return;
  }
  if (request.url === '/styles.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(webRoot, 'styles.css')));
    return;
  }
  if (request.url?.startsWith('/assets/')) {
    const relative = decodeURIComponent(request.url.slice(1).split('?')[0]);
    const file = path.resolve(webRoot, relative);
    if (file.startsWith(path.resolve(webRoot) + path.sep) && existsSync(file)) {
      response.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' });
      response.end(readFileSync(file));
      return;
    }
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(page);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const registryPath = `Software\\FE Monster\\DesktopPetTest\\dpi-layout-${process.pid}`;
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

const within = (rect, viewport, tolerance = 0.75) => rect.left >= -tolerance && rect.top >= -tolerance
  && rect.right <= viewport.width + tolerance && rect.bottom <= viewport.height + tolerance;
const scaledRect = (rect, scaleX, scaleY) => ({
  left: rect.left * scaleX,
  top: rect.top * scaleY,
  right: rect.right * scaleX,
  bottom: rect.bottom * scaleY
});
const scaledNativeRegionRect = (rect, scaleX, scaleY) => ({
  // The bridge is deserialized into System.Drawing.RectangleF, so its Right
  // and Bottom are recomputed from single-precision left/top + width/height.
  left: Math.floor(Math.fround(rect.left) * scaleX),
  top: Math.floor(Math.fround(rect.top) * scaleY),
  right: Math.ceil(Math.fround(Math.fround(rect.left) + Math.fround(rect.width)) * scaleX),
  bottom: Math.ceil(Math.fround(Math.fround(rect.top) + Math.fround(rect.height)) * scaleY)
});

try {
  let native = null;
  let nativeError = '';
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (client.exitCode !== null) throw new Error(`client exited with code ${client.exitCode}`);
    try { native = nativeInput('snapshot'); } catch (error) { nativeError = error.message; }
    if (geometry && native?.visible && native.width >= 500 && native.height >= 450) break;
    await delay(100);
  }
  assert.ok(geometry, `web geometry was not reported; pageError=${pageError || 'none'}; native=${JSON.stringify(native)}; nativeError=${nativeError || 'none'}`);
  assert.ok(native?.visible, `desktop pet native window was not found; native=${JSON.stringify(native)}; nativeError=${nativeError || 'none'}`);

  const viewport = { width: geometry.innerWidth, height: geometry.innerHeight };
  const scaleX = native.clientWidth / geometry.innerWidth;
  const scaleY = native.clientHeight / geometry.innerHeight;
  // DesktopPetHost intentionally floors the leading edges and ceils the
  // trailing edges so sub-pixel CSS borders are never clipped at 125% DPI.
  const panel = scaledNativeRegionRect(geometry.panel, scaleX, scaleY);
  const character = scaledRect(geometry.character, scaleX, scaleY);
  const haloOverscan = 8 * Math.min(scaleX, scaleY);
  const characterVisualSurface = {
    left: character.left - haloOverscan,
    top: character.top - haloOverscan,
    right: character.right + haloOverscan,
    bottom: character.bottom + haloOverscan
  };
  const analysis = nativeInput('analyze-region', {
    PanelLeft: panel.left,
    PanelTop: panel.top,
    PanelRight: panel.right,
    PanelBottom: panel.bottom,
    PanelRadius: geometry.panelBorderRadius * Math.min(scaleX, scaleY),
    CharacterLeft: characterVisualSurface.left,
    CharacterTop: characterVisualSurface.top,
    CharacterRight: characterVisualSurface.right,
    CharacterBottom: characterVisualSurface.bottom
  });
  const report = { native, web: geometry, mapping: { scaleX, scaleY, panel, character, characterVisualSurface }, regionAnalysis: analysis.regionAnalysis };

  assert.equal(geometry.htmlClientMode, 'desktop-pet', `native host did not switch WebView2 to desktop-pet mode: ${JSON.stringify(report)}`);
  assert.equal(geometry.bodyBackgroundColor, 'rgba(0, 0, 0, 0)', `desktop WebView body is not transparent: ${JSON.stringify(report)}`);
  assert.ok(within(geometry.root, viewport), `#petAssistant is clipped by the WebView viewport: ${JSON.stringify(report)}`);
  assert.ok(within(geometry.panel, viewport), `#petAssistantPanel is clipped by the WebView viewport: ${JSON.stringify(report)}`);
  assert.ok(within(geometry.character, viewport), `#petAssistantCharacter is clipped by the WebView viewport: ${JSON.stringify(report)}`);
  assert.ok(within(geometry.particleOrb, viewport), `desktop pet particle orb is clipped by the WebView viewport: ${JSON.stringify(report)}`);
  assert.ok(geometry.particleOrb.width >= geometry.character.width - 1
      && geometry.particleOrb.height >= geometry.character.height - 1,
    `desktop pet particle canvas does not fill its character surface: ${JSON.stringify(report)}`);
  assert.ok(geometry.panelScroll.width <= geometry.panelScroll.clientWidth + 1,
    `desktop panel content overflows horizontally: ${JSON.stringify(report)}`);
  assert.ok(geometry.panelScroll.height <= geometry.panelScroll.clientHeight + 1,
    `desktop panel content overflows vertically: ${JSON.stringify(report)}`);
  assert.ok(Math.abs(scaleX - scaleY) <= 0.01, `WebView2/native scaling is anisotropic: ${JSON.stringify(report)}`);
  assert.ok(panel.left >= 0 && panel.top >= 0 && panel.right <= native.clientWidth && panel.bottom <= native.clientHeight,
    `mapped panel lies outside the native client bounds: ${JSON.stringify(report)}`);
  assert.ok(character.left >= 0 && character.top >= 0 && character.right <= native.clientWidth && character.bottom <= native.clientHeight,
    `mapped character lies outside the native client bounds: ${JSON.stringify(report)}`);
  assert.ok(characterVisualSurface.left >= 0 && characterVisualSurface.top >= 0
      && characterVisualSurface.right <= native.clientWidth && characterVisualSurface.bottom <= native.clientHeight,
    `DPI-scaled particle halo lies outside the native client bounds: ${JSON.stringify(report)}`);
  assert.ok(analysis.regionAnalysis.missingPanelArea <= analysis.regionAnalysis.expectedPanelArea * 0.005,
    `native interactive region clips visible panel pixels: ${JSON.stringify(report)}`);
  assert.ok(analysis.regionAnalysis.outsideVisibleBoundsArea <= native.regionArea * 0.002,
    `native interactive region exposes an empty/black area outside panel and character: ${JSON.stringify(report)}`);

  const legacyPanelArea = (390 * scaleX) * (570 * scaleY);
  assert.ok(native.regionArea < legacyPanelArea,
    `native region is still large enough to contain the removed 390x570 panel: ${JSON.stringify({ ...report, legacyPanelArea })}`);

  const formerPanelCenter = {
    X: Math.round(native.clientLeft + (panel.left + panel.right) / 2),
    Y: Math.round(native.clientTop + (panel.top + panel.bottom) / 2)
  };
  allowPanelClose = true;
  let closedNative = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (client.exitCode !== null) throw new Error(`client exited while closing text bubble with code ${client.exitCode}`);
    try { closedNative = nativeInput('snapshot'); } catch {}
    if (panelClosed && closedNative?.visible && closedNative.width < 450 && closedNative.height < 550) break;
    await delay(100);
  }
  assert.ok(panelClosed, `text-bubble fixture did not send its null close geometry: ${JSON.stringify({ report, closedNative })}`);
  assert.ok(closedNative?.visible && closedNative.width < 450 && closedNative.height < 550,
    `desktop host did not contract after closing the text bubble: ${JSON.stringify({ report, closedNative })}`);
  const dpiScale = Math.max(1, Number(closedNative.windowDpi || 96) / 96);
  const expectedHaloDiameter = 292 * dpiScale;
  const expectedCircularArea = Math.PI * (expectedHaloDiameter / 2) ** 2;
  assert.ok(Math.abs((closedNative.regionRight - closedNative.regionLeft) - expectedHaloDiameter) <= 2
      && Math.abs((closedNative.regionBottom - closedNative.regionTop) - expectedHaloDiameter) <= 2,
    `closed text bubble left a non-mascot native region: ${JSON.stringify({ report, closedNative, expectedHaloDiameter })}`);
  assert.ok(closedNative.regionArea >= expectedCircularArea * .975
      && closedNative.regionArea <= expectedCircularArea * 1.025,
    `closed text bubble left stale transparent hit pixels: ${JSON.stringify({ report, closedNative, expectedCircularArea })}`);
  const hiddenProbe = nativeInput('click', formerPanelCenter);
  assert.notEqual(hiddenProbe.hitRootHandle, hiddenProbe.handle,
    `closed text bubble still intercepts input at its former center: ${JSON.stringify({ formerPanelCenter, hiddenProbe })}`);

  process.stdout.write(JSON.stringify({ ok: true, ...report, closedNative, formerPanelCenter }, null, 2) + '\n');
} catch (error) {
  const diagnostic = geometry ? `\nwebGeometry=${JSON.stringify(geometry)}` : '';
  throw new Error(`${error.message}${diagnostic}`);
} finally {
  client.kill();
  server.close();
  const registryLiteral = `HKCU:\\${registryPath}`.replaceAll("'", "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `if (Test-Path -LiteralPath '${registryLiteral}') { Remove-Item -LiteralPath '${registryLiteral}' -Recurse -Force }`], {
    windowsHide: true,
    stdio: 'ignore'
  });
}
