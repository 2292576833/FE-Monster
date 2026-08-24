import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 30000 + Math.floor(Math.random() * 8000);
const tempRoot = path.join(root, '.tmp');
const profile = path.join(tempRoot, `fe-monster-soundscape-search-${process.pid}-${Date.now().toString(36)}`);
const visualPreferencesKey = 'fe-monster-visual-settings-v1';
const requestLog = [];
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);
mkdirSync(tempRoot, { recursive: true });

function fixtureWav() {
  const sampleRate = 8000;
  const samples = sampleRate / 4;
  const body = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    body.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / sampleRate) * 900), index * 2);
  }
  const wav = Buffer.alloc(44 + body.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + body.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(body.length, 40);
  body.copy(wav, 44);
  return wav;
}

const wav = fixtureWav();

function apiFixture(url) {
  if (url.pathname === '/api/music-apis') {
    return {
      ok: true,
      providers: [{ id: 'netease', label: '网易云音乐', enabled: true, configured: true, status: 'ready' }]
    };
  }
  if (url.pathname === '/api/search') {
    return {
      songs: [{
        id: 'edge-search-song',
        title: '真实搜索结果',
        artist: 'Edge QA',
        album: 'CDP',
        duration: 1,
        provider: 'netease'
      }]
    };
  }
  if (url.pathname === '/api/player/load') {
    return {
      playable: true,
      url: '/fixture.wav',
      quality: 'standard',
      song: {
        id: 'edge-search-song',
        title: '真实搜索结果',
        artist: 'Edge QA',
        album: 'CDP',
        duration: 1,
        provider: 'netease'
      }
    };
  }
  if (url.pathname === '/api/player/state') {
    return { queue: [], queueIndex: -1, position: 0, duration: 0, playing: false, volume: 0.8 };
  }
  if (url.pathname === '/api/visual-bridge/state') return { audio: {} };
  if (url.pathname === '/api/audio/sample') return {};
  if (url.pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (url.pathname === '/api/community/listen/state') return { ok: false };
  if (url.pathname === '/api/community/listening') return { ok: false };
  if (url.pathname === '/api/sandbox/presets') return { presets: [] };
  if (url.pathname === '/api/sandbox/components') return { components: [] };
  if (url.pathname === '/api/app/runtime') return {};
  if (url.pathname.endsWith('/login/status')) return { loggedIn: false };
  if (url.pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  return { ok: true };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: componentsRoot, relative: decoded.slice('/components/'.length) }
    : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : '';
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requestLog.push(`${request.method || 'GET'} ${url.pathname}${url.search}`);
  if (url.pathname === '/fixture.wav') {
    response.writeHead(200, {
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'content-length': wav.length,
      'content-type': 'audio/wav'
    });
    response.end(wav);
    return;
  }
  if (url.pathname === '/api/app/preferences/bootstrap.js') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8'
    });
    response.end('window.__feSoundscapeSearchProbePreferencesLoaded = true;');
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const body = Buffer.from(JSON.stringify(apiFixture(url)));
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': 'application/json; charset=utf-8'
    });
    response.end(body);
    return;
  }
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-length': body.length,
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(body);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const browserErrors = [];
let browser;
let socket;
let nextId = 1;

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
}

async function retryJson(url, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`Edge debugging endpoint did not start within ${timeout}ms`);
}

function command(method, params = {}, timeout = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out after ${timeout}ms`));
    }, timeout);
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolve(value); },
      reject(error) { clearTimeout(timer); reject(error); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression, true)) return;
    } catch (error) {
      if (!/Inspected target navigated or closed|Cannot find context/i.test(error.message)) throw error;
    }
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function waitForChildExit(child, timeout = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(timeout)
  ]);
}

async function reload() {
  const previousTimeOrigin = await evaluate('performance.timeOrigin');
  try {
    await command('Page.reload', { ignoreCache: true });
  } catch (error) {
    if (!/Inspected target navigated or closed/i.test(error.message)) throw error;
  }
  await waitFor(`performance.timeOrigin !== ${previousTimeOrigin}
    && document.readyState === 'complete'
    && typeof enterPresetPlaybackPage === 'function'
    && document.documentElement.dataset.interactiveServices`);
}

function visibleExpression(selector) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible'
      && Number(style.opacity || 0) > 0 && rect.width > 0 && rect.height > 0;
  })()`;
}

async function clickSelector(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Missing click target: ${selector}`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

try {
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,800',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'unknown');
    }
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete'
    && typeof enterPresetPlaybackPage === 'function'
    && document.documentElement.dataset.interactiveServices`);

  const soundscapePreferences = {
    version: 1,
    diyPage: 'preset',
    diyPreset: 'soundscape-workshop',
    scenePreset: 'soundscape-workshop',
    textPreset: 'depth',
    lastSelectableTextPreset: 'depth'
  };
  await evaluate(`localStorage.setItem(${JSON.stringify(visualPreferencesKey)}, ${JSON.stringify(JSON.stringify(soundscapePreferences))})`);
  await reload();
  await waitFor(`document.getElementById('bootLogoButton')?.disabled === false`);
  await clickSelector('#bootLogoButton');
  await waitFor(`document.getElementById('bootScreen')?.hidden === true`);
  await waitFor(`state.diyPreset === 'soundscape-workshop'`);

  const soundscapeParameterBeforeRestart = await evaluate(`(async () => {
    await applySoundscapeWorkshopProperty('audioIntensity', 1.4);
    const saved = JSON.parse(localStorage.getItem('fe-monster-soundscape-workshop-settings-v3') || 'null');
    return {
      runtime: window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime, 'audioIntensity'),
      stored: saved?.requestedParameters?.audioIntensity ?? null
    };
  })()`, true);

  const switchAway = await evaluate(`(() => {
    enterPresetPlaybackPage('chladni');
    return {
      active: state.diyPreset,
      stored: JSON.parse(localStorage.getItem(${JSON.stringify(visualPreferencesKey)}) || '{}')
    };
  })()`);

  await reload();
  await waitFor(`document.getElementById('bootLogoButton')?.disabled === false`);
  await clickSelector('#bootLogoButton');
  await waitFor(`document.getElementById('bootScreen')?.hidden === true && state.diyPreset === 'chladni'`);
  const restoredScene = await evaluate(`({
    active: state.diyPreset,
    scenePreset: state.scenePreset,
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(visualPreferencesKey)}) || '{}').diyPreset || ''
  })`);

  await evaluate(`enterPresetPlaybackPage('soundscape-workshop')`);
  await delay(80);
  const soundscapeParameterAfterRestart = await evaluate(`(() => {
    const saved = JSON.parse(localStorage.getItem('fe-monster-soundscape-workshop-settings-v3') || 'null');
    return {
      runtime: window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime, 'audioIntensity'),
      stored: saved?.requestedParameters?.audioIntensity ?? null
    };
  })()`);
  const soundscapeSearchBeforeHover = await evaluate(`({
    active: state.diyPreset,
    searchVisible: ${visibleExpression('#topSearchForm')},
    searchPeek: document.querySelector('.app-shell')?.classList.contains('is-search-peek') || false
  })`);
  const soundscapeWindowDragBridge = await evaluate(`(async () => {
    const runtime = state.soundscapeWorkshop.runtime;
    const iframe = runtime?.iframe;
    if (!runtime?.options?.onGesture || !iframe) return { available: false, actions: [] };
    const rect = iframe.getBoundingClientRect();
    const actions = [];
    const original = postNativeWindowAction;
    postNativeWindowAction = (action, payload = {}) => {
      actions.push({ action, ...payload });
      return true;
    };
    try {
      const x = 0.5;
      const y = Math.min(1, 12 / Math.max(1, rect.height));
      runtime.options.onGesture({
        kind: 'pointerdown', pointerId: 91, x, y,
        button: 0, buttons: 1, isPrimary: true
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      runtime.options.onGesture({
        kind: 'pointermove', pointerId: 91, x: Math.min(1, x + 0.04), y,
        button: 0, buttons: 1, isPrimary: true
      });
      runtime.options.onGesture({
        kind: 'pointerup', pointerId: 91, x: Math.min(1, x + 0.04), y,
        button: 0, buttons: 0, isPrimary: true
      });
      return { available: true, actions };
    } finally {
      postNativeWindowAction = original;
      endWindowDragGesture();
    }
  })()`, true);
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 34 });
  await delay(180);
  const soundscapeSearch = await evaluate(`({
    active: state.diyPreset,
    searchVisible: ${visibleExpression('#topSearchForm')},
    searchPeek: document.querySelector('.app-shell')?.classList.contains('is-search-peek') || false
  })`);

  if (!soundscapeSearch.searchVisible) {
    await evaluate(`setPlaybackChromeVisibility({ searchVisible: true })`);
  }
  await waitFor(visibleExpression('#topSearchForm'));
  await delay(320);
  const inputBox = await evaluate(`(() => {
    const rect = document.getElementById('topSearchInput').getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, width: rect.width, height: rect.height, hitId: hit?.id || '', hitClass: hit?.className || '', hitTag: hit?.tagName || '' };
  })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: inputBox.x, y: inputBox.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: inputBox.x, y: inputBox.y, button: 'left', clickCount: 1 });
  await command('Input.insertText', { text: '真实搜索' });
  try {
    await waitFor(`document.querySelectorAll('#searchSuggestions .search-suggestion-play').length === 1`, 3500);
  } catch {}
  const searchState = await evaluate(`({
    activeElement: document.activeElement?.id || '',
    inputValue: document.getElementById('topSearchInput')?.value || '',
    provider: state.activeProvider,
    providerConfigured: providerConfigured(state.activeProvider),
    query: state.searchSuggestions.query,
    songCount: state.searchSuggestions.songs.length,
    suggestionCount: document.querySelectorAll('#searchSuggestions .search-suggestion-play').length,
    suggestionText: document.getElementById('searchSuggestions')?.textContent || ''
  })`);
  const resultBox = await evaluate(`(() => {
    const button = document.querySelector('#searchSuggestions .search-suggestion-play');
    if (!button) return { title: '', x: 0, y: 0 };
    const rect = button.getBoundingClientRect();
    return {
      title: button.querySelector('strong')?.textContent || '',
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  })()`);
  if (resultBox.title) {
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: resultBox.x, y: resultBox.y, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resultBox.x, y: resultBox.y, button: 'left', clickCount: 1 });
    try { await waitFor(`state.currentSong?.id === 'edge-search-song'`, 8000); } catch {}
  }
  const selection = await evaluate(`({
    songId: state.currentSong?.id || '',
    title: state.currentSong?.title || '',
    suggestionsHidden: document.getElementById('searchSuggestions')?.hidden === true
  })`);

  const checks = {
    soundscapeParametersPersistAcrossRestart: soundscapeParameterBeforeRestart.runtime === 1.4
      && soundscapeParameterBeforeRestart.stored === 1.4
      && soundscapeParameterAfterRestart.runtime === 1.4
      && soundscapeParameterAfterRestart.stored === 1.4,
    sceneSwitchPersistsSynchronously: switchAway.active === 'chladni' && switchAway.stored.diyPreset === 'chladni',
    restartRestoresSelectedScene: restoredScene.active === 'chladni'
      && restoredScene.scenePreset === 'chladni'
      && restoredScene.stored === 'chladni',
    soundscapeSearchVisibleWithoutHover: soundscapeSearchBeforeHover.active === 'soundscape-workshop'
      && soundscapeSearchBeforeHover.searchVisible === true
      && soundscapeSearchBeforeHover.searchPeek === false,
    soundscapeSearchVisible: soundscapeSearch.active === 'soundscape-workshop'
      && soundscapeSearch.searchVisible === true
      && soundscapeSearch.searchPeek === true,
    soundscapeTopStripCanDragNativeWindow: soundscapeWindowDragBridge.available === true
      && soundscapeWindowDragBridge.actions.some((entry) => entry.action === 'drag' || entry.action === 'move'),
    soundscapeSearchReturnsResult: resultBox.title === '真实搜索结果',
    liveSearchRequest: requestLog.some((entry) => entry.startsWith('GET /api/search?') && entry.includes('q=')),
    searchSelectionLoadsSong: selection.songId === 'edge-search-song'
      && selection.title === '真实搜索结果'
      && requestLog.some((entry) => entry.startsWith('GET /api/player/load?')),
    noPageErrors: browserErrors.length === 0
  };
  const report = {
    soundscapeParameters: {
      beforeRestart: soundscapeParameterBeforeRestart,
      afterRestart: soundscapeParameterAfterRestart
    },
    pass: Object.values(checks).every(Boolean),
    checks,
    switchAway,
    restoredScene,
    soundscapeSearchBeforeHover,
    soundscapeWindowDragBridge,
    soundscapeSearch,
    inputBox,
    searchState,
    resultBox,
    selection,
    requests: requestLog.filter((entry) => /\/api\/(?:search|player\/load)/.test(entry)),
    browserErrors
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  // Kill the complete Edge process tree while its parent PID is still alive.
  // Killing only the parent first can orphan a renderer that keeps the profile
  // locked on Windows and turns an otherwise green browser test into EPERM.
  if (browser?.pid && browser.exitCode === null) {
    const treeKill = spawnSync(
      'taskkill',
      ['/PID', String(browser.pid), '/T', '/F'],
      { stdio: 'ignore', windowsHide: true }
    );
    if (treeKill.status !== 0 && browser.exitCode === null) browser.kill();
    await waitForChildExit(browser);
  }
  const serverClosed = new Promise((resolve) => server.close(resolve));
  // A force-killed browser can leave a keep-alive socket behind briefly.
  // Close it explicitly so teardown cannot hang after all assertions pass.
  try { server.closeAllConnections?.(); } catch {}
  await serverClosed;
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100
  });
}
