import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const tempRoot = path.join(root, 'tmp', 'boot-stall-browser-tests');
const profile = path.join(tempRoot, `edge-profile-${process.pid}`);
const screenshotPath = path.join(tempRoot, `main-boot-ready-${process.pid}.png`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found at ${edge}`);
mkdirSync(profile, { recursive: true });

const json = (response, value, status = 200) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(value));
};

function fixtureApi(pathname, response) {
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end('window.__feBootFixturePreferencesLoaded = true;');
    return true;
  }
  if (!pathname.startsWith('/api/')) return false;

  const payloads = {
    '/api/music-apis': { ok: true, providers: [] },
    '/api/user-cursors': { ok: true, cursors: [] },
    '/api/app/runtime': {
      ok: true,
      clientMode: 'embedded',
      renderPreset: 'directx11',
      renderBackend: 'directx11',
      audioBackend: 'xaudio2',
      nativeAudio: { active: false },
      settings: { gpuAcceleration: true, directX11: true, xAudio2: true, x3DAudio: true }
    },
    '/api/player/state': {
      ok: true,
      playing: false,
      paused: true,
      volume: 0.8,
      position: 0,
      duration: 0,
      queue: [],
      queueLength: 0,
      queueRevision: 0,
      queueIndex: -1
    },
    '/api/visual-bridge/state': { ok: true, audio: {} },
    '/api/sandbox/presets': { ok: true, presets: [], folder: 'browser-fixture' },
    '/api/sandbox/components': { ok: true, components: [] },
    '/api/app/interactive/activate': { ok: true },
    '/api/app/version': { ok: true, version: '2.1.1' },
    '/api/update/latest': { ok: true, available: false },
    '/api/community/status': { ok: true, authenticated: false },
    '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
  };
  json(response, payloads[pathname] || { ok: true });
  return true;
}

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const base = relative.startsWith('components/') ? root : webRoot;
  const file = path.resolve(base, relative.startsWith('components/') ? relative : relative);
  const allowedRoot = relative.startsWith('components/') ? componentsRoot : webRoot;
  if (file !== allowedRoot && !file.startsWith(`${allowedRoot}${path.sep}`)) return '';
  return file;
}

const requests = [];
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requests.push(`${request.method || 'GET'} ${url.pathname}`);
  if (fixtureApi(url.pathname, response)) return;
  const file = safeStaticPath(url.pathname);
  if (!file || !existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentType(file),
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
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-sync',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], {
  env: { ...process.env, TEMP: tempRoot, TMP: tempRoot },
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true
});

let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();
const pageErrors = [];
const consoleErrors = [];

async function debugPort() {
  const activePort = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 160; attempt += 1) {
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, label, timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pageErrors.length > 0) {
      throw new Error(`Startup page exception before ${label}: ${pageErrors.join(' | ')}`);
    }
    if (await evaluate(expression)) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const diagnosticsExpression = `(() => {
  const visible = (element) => {
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0.05
      && rect.width > 1
      && rect.height > 1;
  };
  const boot = document.getElementById('bootScreen');
  const appShell = document.querySelector('.app-shell');
  const stage = document.querySelector('.stage');
  const search = document.querySelector('.top-search');
  const dock = document.querySelector('.player-dock');
  const play = document.getElementById('playButton');
  const sandbox = document.getElementById('sandboxModeButton');
  const playbackPage = appShell?.classList.contains('is-playback-page') === true;
  return {
    readyState: document.readyState,
    interactiveServices: document.documentElement.dataset.interactiveServices || '',
    bootHidden: boot?.hidden === true,
    bootClasses: boot?.className || '',
    appShellClasses: appShell?.className || '',
    appShellVisible: visible(appShell),
    stageVisible: visible(stage),
    searchVisible: visible(search),
    dockVisible: visible(dock),
    playVisible: visible(play),
    sandboxVisible: visible(sandbox),
    primarySurfaceReady: visible(search)
      || (playbackPage && visible(stage))
      || (visible(dock) && visible(play)),
    dockStatus: document.getElementById('dockStatus')?.textContent?.trim() || '',
    toast: document.getElementById('toast')?.textContent?.trim() || ''
  };
})()`;

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
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(String(message.params?.exceptionDetails?.exception?.description
        || message.params?.exceptionDetails?.text
        || 'unknown page exception'));
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      consoleErrors.push((message.params.args || []).map((arg) => String(arg.value || arg.description || '')).join(' '));
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 2048,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', {
    url: `http://127.0.0.1:${port}/?client=embedded&render=directx11&audio=xaudio2`
  });
  await waitFor("document.readyState === 'complete'", 'the real index document');
  await waitFor("document.getElementById('bootLogoButton')?.disabled === false", 'the boot entry button');

  await evaluate("document.getElementById('bootLogoButton').click(); true");
  await waitFor("document.getElementById('bootScreen')?.hidden === true", 'the boot overlay to hide');
  await wait(900);

  const diagnostics = await evaluate(diagnosticsExpression);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  assert.equal(diagnostics.bootHidden, true,
    `boot overlay is still covering the app: ${JSON.stringify(diagnostics)}`);
  assert.equal(diagnostics.interactiveServices, 'started',
    `interactive services never started: ${JSON.stringify(diagnostics)}`);
  assert.equal(diagnostics.appShellVisible, true,
    `the main application shell is not visible: ${JSON.stringify(diagnostics)}`);
  assert.equal(diagnostics.stageVisible, true,
    `the main playback stage is not visible: ${JSON.stringify(diagnostics)}`);
  assert.equal(diagnostics.primarySurfaceReady, true,
    `startup stalled at the sandbox-only surface: ${JSON.stringify(diagnostics)}`);
  assert.equal(pageErrors.length, 0,
    `real startup raised page exceptions: ${pageErrors.join(' | ')}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    diagnostics,
    pageErrors,
    consoleErrors,
    requestCount: requests.length,
    screenshot: screenshotPath
  }, null, 2)}\n`);
} catch (error) {
  let diagnostics = null;
  try { diagnostics = await evaluate(diagnosticsExpression); } catch {}
  try {
    const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  } catch {}
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error.message,
    diagnostics,
    pageErrors,
    consoleErrors,
    requestCount: requests.length,
    recentRequests: requests.slice(-20),
    screenshot: screenshotPath
  }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser.exitCode === null) {
    try { browser.kill(); } catch {}
    await wait(300);
  }
  if (browser.exitCode === null && browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  await wait(100);
  if (profile.startsWith(`${tempRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
}
