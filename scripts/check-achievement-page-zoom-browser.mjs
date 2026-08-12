import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `fe-achievement-zoom-${process.pid}`);
const debugPort = 19000 + Math.floor(Math.random() * 9000);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), 'Microsoft Edge is required for the achievement zoom check');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf']
]);

function apiFixture(pathname) {
  if (pathname === '/api/app/preferences/bootstrap.js') return null;
  if (pathname === '/api/player/state') return { queue: [], queueIndex: -1, playing: false, volume: 0.8 };
  if (pathname === '/api/visual-bridge/state') return { audio: {} };
  if (pathname === '/api/audio/sample') return {};
  if (pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  if (pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname.startsWith('/api/community/achievement-state')) return { ok: false };
  if (pathname.startsWith('/api/community/')) return { ok: false };
  if (pathname === '/api/app/runtime') return {};
  if (pathname === '/api/login/status') return { loggedIn: false };
  if (pathname === '/api/sandbox/presets') return { presets: [] };
  if (pathname === '/api/sandbox/components') return { components: [] };
  return { ok: false };
}

function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: path.join(root, 'components'), relative: decoded.slice('/components/'.length) }
    : decoded.startsWith('/node_modules/')
      ? { base: path.join(root, 'node_modules'), relative: decoded.slice('/node_modules/'.length) }
      : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return '';
  return candidate;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const fixture = apiFixture(url.pathname);
    const body = Buffer.from(fixture === null ? '' : JSON.stringify(fixture));
    response.writeHead(200, {
      'Content-Type': fixture === null ? 'application/javascript; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }
  const filePath = resolveFile(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is starting.
    }
    await wait(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed');
  }
  return result.result?.value;
}

async function measure(width, height, deviceScaleFactor) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  await wait(280);
  return evaluate(`(() => {
    window.dispatchEvent(new Event('resize'));
    const panel = document.querySelector('#communityProfilePanel');
    const page = document.querySelector('#communityProfileAchievementPage');
    const grid = document.querySelector('#communityAchievementGrid');
    const tabs = Array.from(document.querySelectorAll('.community-profile-tabs .community-profile-tab'));
    const canvases = Array.from(grid?.querySelectorAll('canvas[data-achievement-icon]') || []);
    const panelRect = panel?.getBoundingClientRect();
    const pageRect = page?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    const cssIconWidth = canvases[0]?.getBoundingClientRect().width || 0;
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve({
      devicePixelRatio,
      panelTransform: panel ? getComputedStyle(panel).transform : '',
      panelWithinViewport: !!panelRect && panelRect.left >= -0.5 && panelRect.right <= innerWidth + 0.5
        && panelRect.top >= -0.5 && panelRect.bottom <= innerHeight + 0.5,
      tabsVisible: tabs.length === 8 && tabs.every((tab) => {
        const rect = tab.getBoundingClientRect();
        return rect.width > 0 && rect.left >= panelRect.left - 0.5 && rect.right <= panelRect.right + 0.5;
      }),
      horizontalScrollbarSuppressed: !!page && ['hidden', 'clip'].includes(getComputedStyle(page).overflowX),
      visibleContentContained: !!gridRect && !!pageRect
        && gridRect.left >= pageRect.left - 0.5 && gridRect.right <= pageRect.right + 0.5
        && Array.from(grid.querySelectorAll('.achievement-path, .achievement-path-lane, .achievement-path-secret, .community-achievement-node'))
          .every((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= gridRect.left - 0.5 && rect.right <= gridRect.right + 0.5;
          }),
      panelScrollable: !!panel && panel.scrollHeight >= panel.clientHeight,
      iconCount: canvases.length,
      iconCssWidth: cssIconWidth,
      iconBackingWidth: canvases[0]?.width || 0,
      iconBackingHeight: canvases[0]?.height || 0,
      iconRatio: cssIconWidth ? (canvases[0]?.width || 0) / cssIconWidth : 0,
        fontReady: document.fonts?.check?.('400 12px "FE AWei Pixel"') !== false
      });
    })));
  })()`);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page' && item.url === 'about:blank')
    || targets.find((item) => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl, 'Edge page target was not found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1.5, mobile: false });
  await command('Page.navigate', { url: `${baseUrl}/?qa=achievement-zoom` });
  await wait(1900);
  await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const boot = document.querySelector('#bootScreen');
    const button = document.querySelector('#bootLogoButton');
    if (boot && !boot.hidden && button) {
      button.disabled = false;
      button.click();
      await wait(650);
    }
    window.feAchievements?.render?.();
    setCommunityProfileOpen(true, 'achievement');
    await wait(320);
  })()`);

  const dpi125 = await measure(1152, 720, 1.25);
  const dpi150 = await measure(960, 600, 1.5);
  const dpi200 = await measure(720, 450, 2);
  const checks = {
    noBrowserErrors: browserErrors.length === 0,
    flatTextSurface: /^matrix\(1, 0, 0, 1, (?:0|0\.\d+), (?:0|0\.\d+)\)$|^none$/.test(dpi150.panelTransform),
    allTabsVisibleAt125Percent: dpi125.tabsVisible && dpi125.panelWithinViewport,
    allTabsVisibleAt150Percent: dpi150.tabsVisible && dpi150.panelWithinViewport,
    allContentReachableAt200Percent: dpi200.tabsVisible && dpi200.panelWithinViewport
      && dpi200.horizontalScrollbarSuppressed && dpi200.visibleContentContained && dpi200.panelScrollable,
    dpi125IconBacking: dpi125.iconCount > 0 && dpi125.iconBackingWidth === 40 && dpi125.iconBackingHeight === 40,
    dpi150IconBacking: dpi150.iconCount > 0 && dpi150.iconBackingWidth === 48 && dpi150.iconBackingHeight === 48,
    dpi200IconBacking: dpi200.iconCount > 0 && dpi200.iconBackingWidth === 64 && dpi200.iconBackingHeight === 64,
    fontLoaded: dpi125.fontReady && dpi150.fontReady && dpi200.fontReady
  };
  const result = { ok: Object.values(checks).every(Boolean), checks, dpi125, dpi150, dpi200, browserErrors };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  if (browser.pid) spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => server.close(resolve));
  await wait(160);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
