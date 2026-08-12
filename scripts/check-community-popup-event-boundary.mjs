import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const artifactRoot = path.resolve('artifacts');
const profile = path.join(artifactRoot, `.tmp-community-boundary-${process.pid}`);
const viewport = { width: 980, height: 720 };
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

async function pointerSequence(point, moves = []) {
  await command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  for (const move of moves) {
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: move.x,
      y: move.y,
      button: 'left',
      buttons: 1
    });
  }
  const release = moves.at(-1) || point;
  await command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: release.x,
    y: release.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
}

async function pointFor(id, offsetX = 0.5, offsetY = 0.5) {
  const point = await evaluate(`(() => {
    const element = document.getElementById(${JSON.stringify(id)});
    const rect = element?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: rect.left + rect.width * ${offsetX},
      y: rect.top + rect.height * ${offsetY}
    };
  })()`);
  assert.ok(point, `No clickable point was found for #${id}`);
  return point;
}

async function runScenario({ name, rootId, interactiveId, targetId, openExpression }) {
  await evaluate(`(() => {
    ${openExpression}
    const root = document.getElementById(${JSON.stringify(rootId)});
    root?.getAnimations({ subtree: true }).forEach((animation) => {
      try { animation.finish(); } catch { animation.cancel(); }
    });
    if (${JSON.stringify(targetId)} === 'communityProfileClose') {
      window.__alignCommunityProfileCloseForQa();
    }
    window.__communityBoundaryTrace = { outer: [], playback: [] };
  })()`);
  await delay(100);
  const geometry = await evaluate(`(() => {
    const root = document.getElementById(${JSON.stringify(rootId)});
    const interactive = document.getElementById(${JSON.stringify(interactiveId)});
    const target = document.getElementById(${JSON.stringify(targetId)});
    const playback = document.getElementById('qishuiPlaybackCard');
    const rect = target?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : -1;
    const y = rect ? rect.top + rect.height / 2 : -1;
    const hit = document.elementFromPoint(x, y);
    const zIndex = (element) => Number.parseInt(getComputedStyle(element).zIndex, 10);
    return {
      rootVisible: Boolean(root && !root.hidden && getComputedStyle(root).display !== 'none'),
      rootIsStageChild: root?.parentElement === els.stage,
      rootZ: zIndex(root),
      playbackZ: zIndex(playback),
      rootPointerEvents: getComputedStyle(root).pointerEvents,
      interactivePointerEvents: getComputedStyle(interactive).pointerEvents,
      targetHit: Boolean(hit && (hit === target || target?.contains(hit))),
      hitId: hit?.id || '',
      stageIsolation: getComputedStyle(els.stage).isolation
    };
  })()`);
  const point = await pointFor(targetId);
  await pointerSequence(point);
  await delay(100);
  const outcome = await evaluate(`(() => ({
    trace: window.__communityBoundaryTrace,
    rootHidden: document.getElementById(${JSON.stringify(rootId)})?.hidden || false,
    rootClasses: Array.from(document.getElementById(${JSON.stringify(rootId)})?.classList || []),
    targetPressed: document.getElementById(${JSON.stringify(targetId)})?.getAttribute('aria-pressed') || ''
  }))()`);
  return { name, geometry, point, ...outcome };
}

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
    ...viewport,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', {
    url: `${baseUrl}/?client=embedded&community-boundary-qa=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof setPlaybackChromeVisibility === 'function'
    && typeof setCommunityProfileOpen === 'function'
    && typeof setCommunityMessageOpen === 'function'
    && document.getElementById('qishuiPlaybackBilingualToggle')`);

  const mode = await evaluate(`(() => {
    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    document.documentElement.dataset.fePlatform = 'desktop';
    els.appShell.classList.remove('is-window-fullscreen');
    state.playbackPage = true;
    setPlaybackChromeVisibility({ communityVisible: false });
    const playbackEvents = ['pointerdown', 'pointerup', 'click'];
    document.querySelectorAll('#qishuiPlaybackCard button').forEach((button) => {
      playbackEvents.forEach((type) => button.addEventListener(type, (event) => {
        window.__communityBoundaryTrace?.playback.push({
          type,
          targetId: event.target?.id || '',
          currentTargetId: button.id
        });
      }));
    });
    playbackEvents.forEach((type) => els.stage.addEventListener(type, (event) => {
      window.__communityBoundaryTrace?.outer.push({
        type,
        targetId: event.target?.id || '',
        targetTag: event.target?.tagName || ''
      });
    }));
    window.__alignCommunityProfileCloseForQa = () => {
      const close = document.getElementById('communityProfileClose');
      const playback = document.getElementById('qishuiPlaybackBilingualToggle');
      if (!close || !playback) return;
      state.community.profilePanelRotateX = 0;
      state.community.profilePanelRotateY = 0;
      setCommunityFloatingPanelPosition('profile');
      const closeRect = close.getBoundingClientRect();
      const playbackRect = playback.getBoundingClientRect();
      state.community.profilePanelX += playbackRect.left + playbackRect.width / 2
        - closeRect.left - closeRect.width / 2;
      state.community.profilePanelY += playbackRect.top + playbackRect.height / 2
        - closeRect.top - closeRect.height / 2;
      setCommunityFloatingPanelPosition('profile');
    };
    return {
      width: innerWidth,
      height: innerHeight,
      platform: document.documentElement.dataset.fePlatform,
      fullscreen: els.appShell.classList.contains('is-window-fullscreen')
    };
  })()`);
  await delay(240);

  const drawer = await runScenario({
    name: 'drawer',
    rootId: 'communityCard',
    interactiveId: 'communityCard',
    targetId: 'communityDndButton',
    openExpression: `setPlaybackChromeVisibility({ communityVisible: true });`
  });
  const profilePopup = await runScenario({
    name: 'profile',
    rootId: 'communityProfileDialog',
    interactiveId: 'communityProfilePanel',
    targetId: 'communityProfileClose',
    openExpression: `setCommunityProfileOpen(true, 'achievement');`
  });
  const messagePopup = await runScenario({
    name: 'message',
    rootId: 'communityMessageDialog',
    interactiveId: 'communityMessagePanel',
    targetId: 'communityMessageClose',
    openExpression: `setCommunityMessageOpen(true);`
  });
  const listenPopup = await runScenario({
    name: 'listen',
    rootId: 'listenMini',
    interactiveId: 'listenMini',
    targetId: 'listenMiniCollapse',
    openExpression: `
      state.community.activeSession = { id: 'community-boundary-qa', song: {} };
      els.listenMini.hidden = false;
      setListenMiniCollapsed(false);
    `
  });

  await evaluate(`(() => {
    setCommunityProfileOpen(true, 'self');
    window.__communityBoundaryTrace = { outer: [], playback: [] };
  })()`);
  await delay(80);
  const dragStart = await pointFor('communityProfileHead', 0.18, 0.45);
  const dragBefore = await evaluate(`({
    x: state.community.profilePanelX,
    y: state.community.profilePanelY
  })`);
  await pointerSequence(dragStart, [{ x: dragStart.x + 34, y: dragStart.y + 28 }]);
  await delay(60);
  const dragAfter = await evaluate(`({
    x: state.community.profilePanelX,
    y: state.community.profilePanelY,
    playback: window.__communityBoundaryTrace.playback
  })`);

  await evaluate(`(() => {
    setCommunityProfileOpen(true, 'self');
    document.getElementById('communityProfileClose').focus();
    window.__communityBoundaryTrace = { outer: [], playback: [] };
  })()`);
  await command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  });
  await command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  });
  await delay(80);
  const keyboard = await evaluate(`({
    profileHidden: els.communityProfileDialog.hidden,
    playback: window.__communityBoundaryTrace.playback,
    outer: window.__communityBoundaryTrace.outer
  })`);

  const fullscreenPopup = await runScenario({
    name: 'fullscreen-profile',
    rootId: 'communityProfileDialog',
    interactiveId: 'communityProfilePanel',
    targetId: 'communityProfileSelfTab',
    openExpression: `
      els.appShell.classList.add('is-window-fullscreen');
      setCommunityProfileOpen(true, 'achievement');
    `
  });
  await evaluate(`setCommunityProfileOpen(false); els.appShell.classList.remove('is-window-fullscreen');`);

  const scenarios = [drawer, profilePopup, messagePopup, listenPopup, fullscreenPopup];
  const boundaryFailures = scenarios.flatMap((scenario) => {
    const failures = [];
    const outerLeak = scenario.trace.outer.filter((event) => (
      event.type === 'pointerdown' || event.type === 'click'
    ));
    if (scenario.trace.playback.length) failures.push(`${scenario.name}: playback received input`);
    if (outerLeak.length) failures.push(`${scenario.name}: input escaped the community root`);
    if (!scenario.geometry.targetHit) failures.push(`${scenario.name}: target lost hit testing`);
    if (scenario.geometry.interactivePointerEvents !== 'auto') {
      failures.push(`${scenario.name}: interactive surface has pointer-events ${scenario.geometry.interactivePointerEvents}`);
    }
    if (!(scenario.geometry.rootZ > scenario.geometry.playbackZ)) {
      failures.push(`${scenario.name}: z-index ${scenario.geometry.rootZ} is not above playback ${scenario.geometry.playbackZ}`);
    }
    if (!scenario.geometry.rootIsStageChild || scenario.geometry.stageIsolation !== 'isolate') {
      failures.push(`${scenario.name}: unexpected stacking context`);
    }
    return failures;
  });

  const result = {
    ok: boundaryFailures.length === 0,
    mode,
    boundaryFailures,
    scenarios,
    drag: { before: dragBefore, after: dragAfter },
    keyboard
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  assert.deepEqual(mode, {
    width: viewport.width,
    height: viewport.height,
    platform: 'desktop',
    fullscreen: false
  });
  assert.equal(profilePopup.rootHidden, true, 'Profile close did not execute');
  assert.equal(messagePopup.rootHidden, true, 'Message close did not execute');
  assert.ok(
    listenPopup.rootClasses.includes('is-left-collapsed'),
    'Together-listen collapse action did not execute'
  );
  assert.notEqual(drawer.targetPressed, '', 'Community drawer button did not execute');
  assert.ok(
    Math.hypot(dragAfter.x - dragBefore.x, dragAfter.y - dragBefore.y) >= 20,
    'Community profile drag stopped working'
  );
  assert.deepEqual(dragAfter.playback, [], 'Profile drag reached playback controls');
  assert.equal(keyboard.profileHidden, true, 'Enter did not activate the focused profile close button');
  assert.deepEqual(keyboard.playback, [], 'Keyboard activation reached playback controls');
  assert.deepEqual(boundaryFailures, [], boundaryFailures.join('\n'));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(250);
  if (profile.startsWith(`${artifactRoot}${path.sep}`) && existsSync(profile)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch (error) {
      process.stderr.write(`Community boundary profile cleanup deferred: ${error.code || error.message}\n`);
    }
  }
}
