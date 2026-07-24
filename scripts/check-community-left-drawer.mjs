import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const artifactRoot = path.resolve('artifacts');
const profile = path.join(artifactRoot, `.tmp-community-drawer-${process.pid}`);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);
mkdirSync(artifactRoot, { recursive: true });

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    });
    response.end('{}');
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const isComponentAsset = requestedPath.startsWith('/components/');
  const staticRoot = isComponentAsset ? componentsRoot : webRoot;
  const relativePath = isComponentAsset
    ? requestedPath.slice('/components/'.length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserStderr = '';
browser.stderr?.on('data', (chunk) => {
  browserStderr += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(
    `Edge debugging endpoint did not start (exit ${browser.exitCode ?? 'running'}): ${browserStderr.trim()}`
  );
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function clickPoint(point) {
  await command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  await command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
}

const snapshotExpression = `(() => {
  const rail = document.getElementById('communityRailButton');
  const card = document.getElementById('communityCard');
  const playbackCard = document.getElementById('qishuiPlaybackCard');
  const close = document.getElementById('communityCollapseButton');
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0.01
      && rect.width > 0
      && rect.height > 0;
  };
  const rectOf = (element) => {
    const rect = element?.getBoundingClientRect();
    return rect ? {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    } : null;
  };
  const cardStyle = card ? getComputedStyle(card) : null;
  const directFilter = card?.querySelector(':scope > .glass-surface__filter') || null;
  const directContent = card?.querySelector(':scope > .glass-surface__content') || null;
  const railRect = rectOf(rail);
  const hit = railRect ? document.elementFromPoint(railRect.x, railRect.y) : null;
  return {
    railVisible: visible(rail),
    railRect,
    railHit: Boolean(hit && (hit === rail || rail?.contains(hit))),
    railControls: rail?.getAttribute('aria-controls') || '',
    railExpanded: rail?.getAttribute('aria-expanded') || '',
    activeElementId: document.activeElement?.id || '',
    cardVisible: visible(card),
    cardRect: rectOf(card),
    cardAriaHidden: card?.getAttribute('aria-hidden') || '',
    cardInert: Boolean(card?.inert),
    closeRect: rectOf(close),
    playbackRect: visible(playbackCard) ? rectOf(playbackCard) : null,
    rootClasses: card ? Array.from(card.classList) : [],
    hasGlassData: Boolean(card?.hasAttribute('data-glass-surface')),
    directFilterCount: card?.querySelectorAll(':scope > .glass-surface__filter').length || 0,
    directContentCount: card?.querySelectorAll(':scope > .glass-surface__content').length || 0,
    filterChain: directFilter ? {
      image: directFilter.querySelectorAll('feImage').length,
      displacement: directFilter.querySelectorAll('feDisplacementMap').length,
      matrix: directFilter.querySelectorAll('feColorMatrix').length,
      blend: directFilter.querySelectorAll('feBlend').length,
      blur: directFilter.querySelectorAll('feGaussianBlur').length
    } : null,
    filterMode: card?.classList.contains('glass-surface--svg')
      ? 'svg'
      : card?.classList.contains('glass-surface--fallback') ? 'fallback' : 'none',
    backdropFilter: cardStyle?.backdropFilter || cardStyle?.webkitBackdropFilter || '',
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
})()`;

try {
  const debugPort = await activeDebugPort();
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', {
    url: `${baseUrl}/?client=embedded&community-drawer-qa=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof setPlaybackChromeVisibility === 'function'
    && document.getElementById('communityRailButton')
    && document.querySelector('#communityCard > .glass-surface__content')`);
  await evaluate(`(() => {
    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    state.playbackPage = true;
    setPlaybackChromeVisibility({ communityVisible: false });
  })()`);
  await delay(280);

  const initial = await evaluate(snapshotExpression);
  const entryScreenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const entryScreenshotPath = path.join(artifactRoot, 'community-left-entry-1440x900.png');
  writeFileSync(entryScreenshotPath, Buffer.from(entryScreenshot.data, 'base64'));
  await clickPoint(initial.railRect);
  await delay(320);
  const opened = await evaluate(snapshotExpression);

  await clickPoint(opened.closeRect);
  await delay(280);
  const closedByButton = await evaluate(snapshotExpression);

  await clickPoint(closedByButton.railRect);
  await delay(320);
  const reopened = await evaluate(snapshotExpression);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await delay(360);
  const closedByEscape = await evaluate(snapshotExpression);

  await clickPoint(closedByEscape.railRect);
  await delay(320);
  await clickPoint({ x: 720, y: 450 });
  await delay(280);
  const closedByOutside = await evaluate(snapshotExpression);

  await clickPoint(closedByOutside.railRect);
  await delay(320);
  const finalOpen = await evaluate(snapshotExpression);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotPath = path.join(artifactRoot, 'community-left-drawer-open-1440x900.png');
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const noPlaybackOverlap = !finalOpen.playbackRect
    || finalOpen.cardRect.right <= finalOpen.playbackRect.left
    || finalOpen.cardRect.left >= finalOpen.playbackRect.right
    || finalOpen.cardRect.bottom <= finalOpen.playbackRect.top
    || finalOpen.cardRect.top >= finalOpen.playbackRect.bottom;
  const materialActive = finalOpen.filterMode === 'svg'
    ? finalOpen.backdropFilter.includes('url(')
    : finalOpen.filterMode === 'fallback' && finalOpen.backdropFilter.includes('blur(');
  const chain = finalOpen.filterChain || {};
  const checks = {
    defaultHidden: !initial.cardVisible && initial.cardAriaHidden === 'true' && initial.cardInert,
    leftEntryReady: initial.railVisible
      && initial.railHit
      && initial.railControls === 'communityCard'
      && initial.railExpanded === 'false'
      && initial.railRect.left >= 0
      && initial.railRect.right < 1440 / 3,
    opensFromRealClick: opened.cardVisible
      && opened.railExpanded === 'true'
      && opened.cardAriaHidden === 'false'
      && !opened.cardInert,
    leftDrawerPlacement: finalOpen.cardRect.left >= 0
      && finalOpen.cardRect.right < 1440 / 2
      && finalOpen.cardRect.bottom <= 900
      && noPlaybackOverlap
      && !finalOpen.horizontalOverflow,
    closesFromButton: !closedByButton.cardVisible
      && closedByButton.railVisible
      && closedByButton.railExpanded === 'false'
      && closedByButton.cardInert,
    closesFromEscape: !closedByEscape.cardVisible
      && closedByEscape.railVisible
      && closedByEscape.railExpanded === 'false'
      && closedByEscape.cardInert,
    closesFromOutsideClick: !closedByOutside.cardVisible
      && closedByOutside.railVisible
      && closedByOutside.railExpanded === 'false'
      && closedByOutside.cardInert,
    keyboardFocusFlow: opened.activeElementId === 'communityCollapseButton'
      && closedByButton.activeElementId === 'communityRailButton'
      && reopened.activeElementId === 'communityCollapseButton'
      && closedByEscape.activeElementId === 'communityRailButton',
    glassContract: finalOpen.rootClasses.includes('glass-surface')
      && finalOpen.rootClasses.includes('glass-surface--react-bits')
      && finalOpen.hasGlassData
      && finalOpen.directFilterCount === 1
      && finalOpen.directContentCount === 1
      && chain.image === 1
      && chain.displacement === 3
      && chain.matrix === 3
      && chain.blend === 2
      && chain.blur === 1
      && materialActive,
    hydrationStable: reopened.directFilterCount === 1 && finalOpen.directFilterCount === 1
  };
  const result = {
    ok: Object.values(checks).every(Boolean),
    checks,
    material: {
      mode: finalOpen.filterMode,
      backdropFilter: finalOpen.backdropFilter,
      filterChain: finalOpen.filterChain
    },
    focusTrace: {
      opened: opened.activeElementId,
      closedByButton: closedByButton.activeElementId,
      reopened: reopened.activeElementId,
      closedByEscape: closedByEscape.activeElementId
    },
    initial,
    finalOpen,
    entryScreenshotPath,
    screenshotPath
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(300);
  if (profile.startsWith(`${artifactRoot}${path.sep}`) && existsSync(profile)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      process.stderr.write(`Community drawer profile cleanup deferred: ${error.code || error.message}\n`);
    }
  }
}
