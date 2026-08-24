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
const profile = path.join(tempRoot, `fe-monster-text-readiness-${process.pid}-${Date.now().toString(36)}`);
const visualPreferencesKey = 'fe-monster-visual-settings-v1';
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
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

function apiFixture(url) {
  if (url.pathname === '/api/player/state') {
    return { queue: [], queueIndex: -1, position: 0, duration: 0, playing: false, volume: 0.8 };
  }
  if (url.pathname === '/api/visual-bridge/state') return { audio: {} };
  if (url.pathname === '/api/audio/sample') return {};
  if (url.pathname === '/api/community/state') {
    return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  }
  if (url.pathname === '/api/community/listen/state') return { ok: false };
  if (url.pathname === '/api/community/listening') return { ok: false };
  if (url.pathname === '/api/sandbox/presets') return { presets: [] };
  if (url.pathname === '/api/sandbox/components') return { components: [] };
  if (url.pathname === '/api/app/runtime') return {};
  if (url.pathname.endsWith('/login/status')) return { loggedIn: false };
  if (url.pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  return { ok: false };
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
  if (url.pathname === '/api/app/preferences/bootstrap.js') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8'
    });
    response.end('window.__feTextReadinessProbePreferencesLoaded = true;');
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
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      }
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

async function reloadWithPreferences(preferences) {
  await evaluate(`localStorage.setItem(${JSON.stringify(visualPreferencesKey)}, ${JSON.stringify(JSON.stringify(preferences))})`);
  const previousTimeOrigin = await evaluate('performance.timeOrigin');
  try {
    await command('Page.reload', { ignoreCache: true });
  } catch (error) {
    if (!/Inspected target navigated or closed/i.test(error.message)) throw error;
  }
  await waitFor(`performance.timeOrigin !== ${previousTimeOrigin}
    && document.readyState === 'complete'
    && typeof enterPlaybackPage === 'function'
    && document.documentElement.dataset.interactiveServices
    && !!document.querySelector('#qishuiPlaybackTools [data-playback-tool="text"]')`);
  return evaluate(`(() => ({
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(visualPreferencesKey)}) || '{}'),
    diyPreset: state.diyPreset,
    textPreset: state.textPreset,
    lastSelectableTextPreset: state.lastSelectableTextPreset
  }))()`);
}

async function clickTextAndInspect() {
  return evaluate(`(async () => {
    document.getElementById('bootScreen').hidden = true;
    enterPlaybackPage();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const button = document.querySelector('#qishuiPlaybackTools [data-playback-tool="text"]');
    const before = {
      diyPreset: state.diyPreset,
      textPreset: state.textPreset,
      lastSelectableTextPreset: state.lastSelectableTextPreset,
      ready: document.getElementById('diyTextPage')?.dataset.parametersReady || ''
    };
    button?.click();
    const deadline = performance.now() + 1200;
    while (performance.now() < deadline) {
      const page = document.getElementById('diyTextPage');
      if (!page?.hidden && page.dataset.parametersReady === 'true') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 220));
    const page = document.getElementById('diyTextPage');
    const composer = document.getElementById('textComposerControl');
    const font = document.getElementById('textFontSelect');
    const range = document.getElementById('textDepth');
    const select = document.getElementById('textLayoutMode');
    const toggle = document.getElementById('textLyricsToggle');
    const representative = [font, range, select, toggle].map((control) => {
      const style = control ? getComputedStyle(control) : null;
      const rect = control?.getBoundingClientRect();
      return {
        id: control?.id || '',
        exists: !!control,
        disabled: !!control?.disabled,
        visible: !!control && !control.hidden && style?.display !== 'none'
          && style?.visibility === 'visible' && Number(style?.opacity || 0) > 0
          && rect.width > 0 && rect.height > 0,
        width: rect?.width || 0,
        height: rect?.height || 0
      };
    });
    return {
      before,
      after: {
        diyPreset: state.diyPreset,
        textPreset: state.textPreset,
        lastSelectableTextPreset: state.lastSelectableTextPreset,
        ready: page?.dataset.parametersReady || '',
        pageVisible: !!page && !page.hidden && getComputedStyle(page).display !== 'none',
        buttonActive: button?.classList.contains('is-active') || false,
        buttonPressed: button?.getAttribute('aria-pressed') === 'true',
        composerDisabled: !!composer?.disabled,
        composerAriaDisabled: composer?.getAttribute('aria-disabled') || '',
        fontOptionCount: font?.options.length || 0,
        representative,
        uniqueControls: ['diyTextPage', 'textComposerControl', 'textFontSelect', 'textDepth', 'textLayoutMode', 'textLyricsToggle']
          .every((id) => document.querySelectorAll('#' + id).length === 1)
      },
      persisted: JSON.parse(localStorage.getItem(${JSON.stringify(visualPreferencesKey)}) || '{}')
    };
  })()`, true);
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
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails || {};
      browserErrors.push(`${details.exception?.description || details.text || 'Uncaught exception'} @ ${details.url || 'inline'}:${Number(details.lineNumber || 0) + 1}:${Number(details.columnNumber || 0) + 1}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push(message.params.args?.map((arg) => arg.value || arg.description || '').join(' ') || 'console.error');
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete' && typeof enterPlaybackPage === 'function'`);

  const outsideBookPreferences = {
    version: 1,
    diyPage: 'preset',
    diyPreset: 'cube',
    scenePreset: 'cube',
    textPreset: 'book',
    lastSelectableTextPreset: 'focus-echo'
  };
  const outsideBookBoot = await reloadWithPreferences(outsideBookPreferences);
  const outsideBook = await clickTextAndInspect();

  const trueBookPreferences = {
    version: 1,
    diyPage: 'preset',
    diyPreset: 'book',
    scenePreset: 'book',
    textPreset: 'book',
    lastSelectableTextPreset: 'depth'
  };
  const trueBookBoot = await reloadWithPreferences(trueBookPreferences);
  const trueBook = await clickTextAndInspect();

  const checks = {
    persistedBookStateExercisedOutsideBookScene: outsideBookBoot.stored.textPreset === 'book'
      && outsideBook.before.textPreset === 'book' && outsideBook.before.diyPreset !== 'book',
    textEnteredThroughPlaybackTool: outsideBook.after.pageVisible
      && outsideBook.after.buttonActive && outsideBook.after.buttonPressed,
    outsideBookFallsBackToEditableRealPreset: outsideBook.after.textPreset === 'focus-echo'
      && outsideBook.after.textPreset !== 'book' && outsideBook.after.diyPreset !== 'book'
      && !outsideBook.after.composerDisabled,
    parametersReadyPublishedAfterSynchronization: outsideBook.after.ready === 'true',
    fontsAndRepresentativeControlsReady: outsideBook.after.fontOptionCount >= 6
      && outsideBook.after.uniqueControls
      && outsideBook.after.representative.length === 4
      && outsideBook.after.representative.every((control) => control.exists && control.visible && !control.disabled),
    fallbackPersistsAsRealPreset: outsideBook.persisted.textPreset === 'focus-echo'
      && outsideBook.persisted.lastSelectableTextPreset === 'focus-echo',
    trueBookSceneRemainsDisabled: trueBookBoot.stored.textPreset === 'book'
      && trueBook.before.diyPreset === 'book' && trueBook.before.textPreset === 'book'
      && trueBook.after.ready === 'true' && trueBook.after.pageVisible
      && trueBook.after.textPreset === 'book' && trueBook.after.composerDisabled
      && trueBook.after.representative.every((control) => control.exists && control.visible && control.disabled),
    noBrowserExceptions: browserErrors.length === 0
  };
  const result = {
    outsideBookBoot,
    outsideBook,
    trueBookBoot,
    trueBook,
    browserErrors,
    checks,
    pass: Object.values(checks).every(Boolean)
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(200);
  const resolvedProfile = path.resolve(profile);
  if (resolvedProfile.startsWith(`${path.resolve(tempRoot)}${path.sep}`)) {
    // Edge can hold a transient lock on its profile after the process tree is
    // gone. Profile cleanup is best-effort test hygiene and must not turn a
    // successful browser assertion into a product failure.
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
    } catch {}
  }
}
