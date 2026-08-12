import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const executable = path.resolve(process.env.FE_TEST_CLIENT_EXE
  || path.join(root, 'native', 'windows', 'build', 'winforms', 'FE Monster.exe'));
const inputScript = path.join(root, 'scripts', 'pet-native-window-input.ps1');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const artifactRoot = path.join(root, 'artifacts');
const productionMode = process.env.FE_PET_TRANSPARENCY_PRODUCTION === '1';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedBackdrop = { r: 36, g: 96, b: 156 };

assert.equal(process.platform, 'win32', 'native desktop pet transparency check requires Windows');
assert.ok(existsSync(executable), `build the WinForms client first: ${executable}`);
assert.ok(existsSync(inputScript), `native input helper is missing: ${inputScript}`);

const minimalPage = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/pet-assistant.css"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent!important}
</style></head><body>
<section class="pet-assistant" id="petAssistant" data-state="idle">
  <div class="pet-assistant__dock">
    <button class="pet-assistant__character" id="petAssistantCharacter" type="button">
      <canvas class="pet-assistant__particle-orb" id="petAssistantParticleOrb"></canvas>
    </button>
  </div>
  <audio id="petAssistantAudio"></audio>
</section>
<script>window.FeMonsterPetActionBridge={snapshot:()=>null};</script>
<script src="/vendor/three.r128.min.js"></script>
<script src="/pet-particle-orb.js"></script>
<script>setTimeout(()=>window.chrome.webview.postMessage({type:'fe-pet-desktop',action:'enable'}),50);</script>
</body></html>`;

const productionProbe = `<script>
(() => {
  const report = (phase) => {
    const root = document.getElementById('petAssistant');
    const character = document.getElementById('petAssistantCharacter');
    const canvas = document.getElementById('petAssistantParticleOrb');
    const gl = canvas?.getContext?.('webgl2') || canvas?.getContext?.('webgl') || null;
    const corner = new Uint8Array(4);
    if (gl && canvas?.width && canvas?.height) {
      try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner); } catch {}
    }
    const styleHrefs = Array.from(document.styleSheets, (sheet) => sheet.href || 'inline');
    const rect = (element) => {
      const value = element?.getBoundingClientRect?.();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
    };
    fetch('/probe-production-page', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phase,
        title: document.title,
        clientMode: document.documentElement.getAttribute('data-fe-client'),
        rootHidden: root?.hidden === true,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        rootRect: rect(root),
        characterRect: rect(character),
        canvasRect: rect(canvas),
        canvasBuffer: canvas ? { width: canvas.width, height: canvas.height } : null,
        styleHrefs,
        characterBackground: character ? getComputedStyle(character).backgroundColor : '',
        canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : '',
        htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        bodyBeforeDisplay: getComputedStyle(document.body, '::before').display,
        webglAttributes: gl?.getContextAttributes?.() || null,
        webglCornerRgba: Array.from(corner),
        renderer: canvas?.dataset?.renderer || ''
      })
    }).catch(() => {});
  };
  const enable = () => {
    const bridge = window.chrome?.webview;
    if (!bridge || !document.getElementById('petAssistant') || !window.FeMonsterPetAssistant) {
      setTimeout(enable, 80);
      return;
    }
    report('before-enable');
    bridge.postMessage({ type: 'fe-pet-desktop', action: 'enable', requestId: 'production-transparency-enable' });
    setTimeout(() => {
      window.FeMonsterPetAssistant.open();
      setTimeout(() => {
        window.FeMonsterPetAssistant.close();
        setTimeout(() => report('after-panel-region-cycle'), 420);
      }, 420);
    }, 320);
  };
  setTimeout(enable, 120);
})();
</script>`;

const productionIndex = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const page = productionMode
  ? productionIndex.replace('</body>', `${productionProbe}</body>`)
  : minimalPage;

let productionReport = null;
const productionReports = [];
const requestTrace = [];

const mime = (file) => {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.js' || extension === '.mjs') return 'text/javascript; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.woff2') return 'font/woff2';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.mp3') return 'audio/mpeg';
  return 'application/octet-stream';
};

const server = createServer((request, response) => {
  requestTrace.push(`${request.method || 'GET'} ${request.url || '/'}`);
  if (requestTrace.length > 80) requestTrace.shift();
  if (request.url === '/probe-production-page' && request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        productionReports.push(value);
        if (value.clientMode === 'desktop-pet'
            && (productionReport?.phase !== 'after-panel-region-cycle'
              || value.phase === 'after-panel-region-cycle')) {
          productionReport = value;
        }
      }
      catch { productionReport = { invalid: true }; }
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{"ok":true}');
    });
    return;
  }
  if (productionMode && request.url?.startsWith('/api/app/preferences/bootstrap.js')) {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end('window.__fePreferenceBootstrap={};');
    return;
  }
  if (productionMode && request.url?.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end('{"ok":false,"offline":true}');
    return;
  }
  if (productionMode) {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
    const roots = urlPath.startsWith('/components/')
      ? [{ base: componentsRoot, relative: urlPath.slice('/components/'.length) }]
      : [{ base: webRoot, relative: urlPath.replace(/^\/+/, '') }];
    for (const candidate of roots) {
      const file = path.resolve(candidate.base, candidate.relative);
      const base = path.resolve(candidate.base);
      if (file.startsWith(base + path.sep) && existsSync(file)) {
        response.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' });
        response.end(readFileSync(file));
        return;
      }
    }
  }
  if (request.url === '/pet-assistant.css') {
    response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(root, 'web', 'pet-assistant.css')));
    return;
  }
  if (request.url === '/vendor/three.r128.min.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(root, 'web', 'vendor', 'three.r128.min.js')));
    return;
  }
  if (request.url === '/pet-particle-orb.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(path.join(root, 'web', 'pet-particle-orb.js')));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(page);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const backdropScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FeBackdropDpi {
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
}
'@
[void][FeBackdropDpi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$form.BackColor = [System.Drawing.Color]::FromArgb(36, 96, 156)
$form.TopMost = $false
$form.ShowInTaskbar = $false
$form.Add_Shown({
  $form.Activate()
  $form.BringToFront()
  [Console]::Out.WriteLine('READY ' + $form.Handle.ToInt64().ToString('X'))
  [Console]::Out.Flush()
})
[System.Windows.Forms.Application]::Run($form)
`;
const encodedBackdrop = Buffer.from(backdropScript, 'utf16le').toString('base64');
const backdrop = spawn('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encodedBackdrop], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'ignore']
});

let backdropHandle = '';
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('solid-color backdrop did not become ready')), 5_000);
  backdrop.once('error', reject);
  backdrop.stdout.on('data', (chunk) => {
    const match = String(chunk).match(/READY\s+([0-9A-F]+)/i);
    if (!match) return;
    backdropHandle = `0x${match[1]}`;
    clearTimeout(timeout);
    resolve();
  });
});

const port = server.address().port;
const registryPath = `Software\\FE Monster\\DesktopPetTest\\transparent-backing-${process.pid}`;
const pageUrl = productionMode
  ? `http://127.0.0.1:${port}/?client=embedded&qa=production-pet-transparency`
  : `http://127.0.0.1:${port}/`;
const client = spawn(executable, ['--url', pageUrl], {
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

async function waitForWindow() {
  let last = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (client.exitCode !== null) throw new Error(`desktop pet client exited with code ${client.exitCode}`);
    try { last = nativeInput('snapshot'); } catch {}
    if (last?.visible && last.width >= 250 && last.width < 400) return last;
    await delay(100);
  }
  throw new Error(`desktop pet did not enter closed native mode: ${JSON.stringify(last)}`);
}

function samplePixels(points) {
  const pointLiteral = points.map((point) => `@{ x = ${point.x}; y = ${point.y} }`).join(',');
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetScreenSampleDpi {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
}
'@
[void][FePetScreenSampleDpi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName System.Drawing
$points = @(${pointLiteral})
$values = foreach ($point in $points) {
  $bitmap = New-Object System.Drawing.Bitmap 1, 1
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen([int]$point.x, [int]$point.y, 0, 0, [System.Drawing.Size]::new(1, 1))
  $color = $bitmap.GetPixel(0, 0)
  $graphics.Dispose()
  $bitmap.Dispose()
  @{ r = [int]$color.R; g = [int]$color.G; b = [int]$color.B }
}
$values | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'screen pixel sampling failed');
  const parsed = JSON.parse(result.stdout.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function captureWindow(windowState, destination) {
  const escaped = destination.replaceAll("'", "''");
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetScreenCaptureDpi {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
}
'@
[void][FePetScreenCaptureDpi]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName System.Drawing
$width = ${Math.max(1, Number(windowState.width) || 1)}
$height = ${Math.max(1, Number(windowState.height) || 1)}
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(${Number(windowState.left) || 0}, ${Number(windowState.top) || 0}, 0, 0, [System.Drawing.Size]::new($width, $height))
$bitmap.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'desktop pet screenshot failed');
}

function colorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function raiseWindow(handle) {
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetWindowOrder {
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
[void][FePetWindowOrder]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$window = [IntPtr]([Convert]::ToInt64('${handle.slice(2)}', 16))
$raised = [FePetWindowOrder]::SetWindowPos($window, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0043)
if (-not $raised) { throw "SetWindowPos(HWND_TOPMOST) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `could not raise window ${handle}`);
}

function moveWindow(handle, left, top) {
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetWindowMove {
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
[void][FePetWindowMove]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$window = [IntPtr]([Convert]::ToInt64('${handle.slice(2)}', 16))
[void][FePetWindowMove]::SetWindowPos($window, [IntPtr]::Zero, ${Math.round(left)}, ${Math.round(top)}, 0, 0, 0x0015)
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'could not move desktop pet to primary-screen probe');
}

function placeBackdrop(handle, bounds) {
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetBackdropOrder {
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
[void][FePetBackdropOrder]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$window = [IntPtr]([Convert]::ToInt64('${handle.slice(2)}', 16))
$placed = [FePetBackdropOrder]::SetWindowPos(
  $window,
  [IntPtr]::Zero,
  ${Math.round(bounds.left)},
  ${Math.round(bounds.top)},
  ${Math.round(bounds.width)},
  ${Math.round(bounds.height)},
  0x0050
)
if (-not $placed) { throw "SetWindowPos(backdrop) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'could not place transparency-test backdrop');
}

function inspectWindowRect(handle) {
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetBackdropRect {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out RECT rect);
}
'@
[void][FePetBackdropRect]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$window = [IntPtr]([Convert]::ToInt64('${handle.slice(2)}', 16))
$rect = New-Object FePetBackdropRect+RECT
[void][FePetBackdropRect]::GetWindowRect($window, [ref]$rect)
@{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom } | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'could not inspect backdrop bounds');
  return JSON.parse(result.stdout.trim());
}

function attachBackdropOwner(petHandle, ownerHandle) {
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FePetBackdropOwner {
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)]
  public static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr GetWindow(IntPtr window, uint command);
}
'@
$pet = [IntPtr]([Convert]::ToInt64('${petHandle.slice(2)}', 16))
$owner = [IntPtr]([Convert]::ToInt64('${ownerHandle.slice(2)}', 16))
[void][FePetBackdropOwner]::SetWindowLongPtr($pet, -8, $owner)
$actualOwner = [FePetBackdropOwner]::GetWindow($pet, 4)
if ($actualOwner -ne $owner) {
  throw "desktop-pet owner verification failed: expected=$owner actual=$actualOwner error=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
$ownerRaised = [FePetBackdropOwner]::SetWindowPos($owner, [IntPtr]::new(-2), 0, 0, 0, 0, 0x0043)
if (-not $ownerRaised) { throw "SetWindowPos(backdrop HWND_NOTOPMOST) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$petRaised = [FePetBackdropOwner]::SetWindowPos($pet, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0043)
if (-not $petRaised) { throw "SetWindowPos(desktop pet) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'could not attach transparency-test backdrop owner');
}

async function stabilizeBackdrop(windowState, bounds) {
  let lastProbe = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    placeBackdrop(backdropHandle, bounds);
    // Rebuild ownership after positioning. Two independent TopMost windows can
    // otherwise be reordered by DWM between SetWindowPos and screen sampling.
    attachBackdropOwner(windowState.handle, backdropHandle);
    raiseWindow(windowState.handle);
    await delay(80 + attempt * 30);

    const rect = inspectWindowRect(backdropHandle);
    const referencePoint = {
      x: rect.left + 20,
      y: rect.top + 20
    };
    const transparentCorner = {
      x: windowState.clientLeft + 2,
      y: windowState.clientTop + 2
    };
    const [referencePixel, transparentPixel] = samplePixels([referencePoint, transparentCorner]);
    lastProbe = { attempt: attempt + 1, rect, referencePoint, referencePixel, transparentCorner, transparentPixel };
    if (colorDistance(referencePixel, expectedBackdrop) <= 4
      && colorDistance(transparentPixel, referencePixel) <= 4) {
      return lastProbe;
    }
  }
  throw new Error(`transparency-test backdrop did not stabilize: ${JSON.stringify(lastProbe)}`);
}

try {
  let windowState = await waitForWindow();
  moveWindow(windowState.handle, 420, 220);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(80);
    const moved = nativeInput('snapshot');
    if (moved?.visible && moved.left >= 390 && moved.left <= 450 && moved.top >= 190 && moved.top <= 250) {
      windowState = moved;
      break;
    }
  }
  assert.ok(windowState.left >= 390 && windowState.left <= 450,
    `desktop pet could not be moved onto the primary-screen transparency probe: ${JSON.stringify(windowState)}`);
  let backdropProbe = await stabilizeBackdrop(windowState, {
    left: windowState.left - 80,
    top: windowState.top - 80,
    width: windowState.width + 160,
    height: windowState.height + 160
  });
  let backdropRect = backdropProbe.rect;
  await delay(productionMode ? 1_800 : 850);
  if (productionMode) {
    for (let attempt = 0; attempt < 35 && productionReport?.phase !== 'after-panel-region-cycle'; attempt += 1) {
      await delay(80);
    }
    assert.equal(productionReport?.phase, 'after-panel-region-cycle',
      `the complete production page did not reach desktop-pet mode: ${JSON.stringify({ productionReport, productionReports, requestTrace })}`);
    assert.equal(productionReport.clientMode, 'desktop-pet',
      `the native host did not reparent the production page as desktop-pet: ${JSON.stringify(productionReport)}`);
    assert.ok(productionReport.styleHrefs.some((href) => /\/styles\.css(?:\?|$)/.test(href)),
      `production styles.css was not loaded: ${JSON.stringify(productionReport)}`);
    assert.ok(productionReport.styleHrefs.some((href) => /\/pet-assistant\.css(?:\?|$)/.test(href)),
      `production pet-assistant.css was not loaded: ${JSON.stringify(productionReport)}`);
    // Opening a 720-DIP panel near the probe's top-left corner can clamp the
    // host to the working area; closing then preserves that clamped anchor.
    // Refresh physical bounds before sampling so the probe follows the actual
    // pet instead of reading the desktop position it occupied before the cycle.
    windowState = nativeInput('snapshot');
    backdropProbe = await stabilizeBackdrop(windowState, {
      left: windowState.left - 80,
      top: windowState.top - 80,
      width: windowState.width + 160,
      height: windowState.height + 160
    });
    backdropRect = backdropProbe.rect;
    await delay(180);
  }
  const center = {
    x: Math.round(windowState.clientLeft + (windowState.regionLeft + windowState.regionRight) / 2),
    y: Math.round(windowState.clientTop + (windowState.regionTop + windowState.regionBottom) / 2)
  };
  const radius = Math.min(
    windowState.regionRight - windowState.regionLeft,
    windowState.regionBottom - windowState.regionTop
  ) / 2;
  const probeRadius = Math.round(radius * (productionMode ? .84 : .76));
  const insidePoints = productionMode
    ? Array.from({ length: 24 }, (_, index) => {
        const angle = Math.PI * 2 * index / 24;
        return {
          x: Math.round(center.x + Math.cos(angle) * probeRadius),
          y: Math.round(center.y + Math.sin(angle) * probeRadius)
        };
      })
    : [
        { x: center.x + probeRadius, y: center.y },
        { x: center.x - probeRadius, y: center.y },
        { x: center.x, y: center.y + probeRadius },
        { x: center.x, y: center.y - probeRadius }
      ];
  const outside = {
    x: windowState.clientLeft + 2,
    y: windowState.clientTop + 2
  };
  const pixels = samplePixels([...insidePoints, outside, backdropProbe.referencePoint]);
  const outsidePixel = pixels.at(-2);
  const backdropReferencePixel = pixels.at(-1);
  mkdirSync(artifactRoot, { recursive: true });
  captureWindow(windowState, path.join(artifactRoot, 'pet-native-transparency-debug.png'));
  assert.ok(colorDistance(backdropReferencePixel, expectedBackdrop) <= 4,
    `transparency test backdrop reference is not visible: ${JSON.stringify({ backdropReferencePixel, expectedBackdrop, backdropProbe, backdropHandle, backdropRect, windowState })}`);
  assert.ok(colorDistance(outsidePixel, backdropReferencePixel) <= 4,
    `transparency test backdrop is not visible through the pet corner: ${JSON.stringify({ outsidePixel, backdropReferencePixel, expectedBackdrop, backdropProbe, backdropHandle, backdropRect, windowState })}`);
  const insidePixels = pixels.slice(0, -2);
  const distances = insidePixels.map((pixel) => colorDistance(pixel, backdropReferencePixel));
  const transparentCount = distances.filter((distance) => distance <= 18).length;
  const darkCount = insidePixels.filter((pixel) => pixel.r <= 20 && pixel.g <= 20 && pixel.b <= 20).length;
  const evidence = {
    ok: false,
    mode: productionMode ? 'complete-production-index' : 'minimal-pet-fixture',
    pageUrl,
    productionReport,
    sample: {
      center,
      radius,
      probeRadius,
      insidePoints,
      insidePixels,
      outsidePixel,
      backdropReferencePoint: backdropProbe.referencePoint,
      backdropReferencePixel,
      distances,
      transparentCount,
      darkCount,
      total: insidePixels.length
    },
    windowState,
    requestTrace
  };
  if (productionMode) {
    mkdirSync(artifactRoot, { recursive: true });
    const screenshot = path.join(artifactRoot, 'pet-native-production-transparent-backing.png');
    const report = path.join(artifactRoot, 'pet-native-production-transparent-backing.json');
    captureWindow(windowState, screenshot);
    evidence.screenshot = screenshot;
    const transparentSurface = transparentCount >= Math.ceil(insidePixels.length * .75) && darkCount <= 2;
    evidence.ok = transparentSurface;
    writeFileSync(report, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    assert.ok(transparentSurface,
      `production desktop pet paints the user's opaque black backing disk instead of revealing the colored desktop: ${JSON.stringify(evidence)}`);
  } else {
    assert.ok(distances.every((distance) => distance <= 18),
      `desktop pet paints an opaque backing disk instead of revealing the desktop: ${JSON.stringify(evidence)}`);
  }
  evidence.ok = true;
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  if (client.exitCode === null) client.kill();
  if (backdrop.exitCode === null) backdrop.kill();
  server.close();
  const registryLiteral = `HKCU:\\${registryPath}`.replaceAll("'", "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `if (Test-Path -LiteralPath '${registryLiteral}') { Remove-Item -LiteralPath '${registryLiteral}' -Recurse -Force }`], {
    windowsHide: true,
    stdio: 'ignore'
  });
}
