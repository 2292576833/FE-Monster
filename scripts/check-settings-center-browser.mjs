import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 32000 + Math.floor(Math.random() * 7000);
const tempRoot = path.join(root, '.tmp');
const profile = path.join(tempRoot, `fe-monster-settings-center-${process.pid}-${Date.now().toString(36)}`);
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
    response.end('window.__feSettingsCenterProbePreferencesLoaded = true;');
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
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function key(keyValue, code = keyValue, modifiers = 0) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: keyValue, code, modifiers });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: keyValue, code, modifiers });
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
  await command('Page.bringToFront');
  await waitFor(`document.readyState === 'complete'
    && typeof enterPlaybackPage === 'function'
    && document.documentElement.dataset.interactiveServices
    && !!document.getElementById('qishuiPlaybackPhone')
    && document.querySelectorAll('#qishuiPlaybackTools [data-playback-tool]').length === 5`);

  const initial = await evaluate(`(async () => {
    document.getElementById('bootScreen').hidden = true;
    const noMotion = document.createElement('style');
    noMotion.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.append(noMotion);
    returnHomePage();
    enterPlaybackPage();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const phone = document.getElementById('qishuiPlaybackPhone');
    const card = document.getElementById('qishuiPlaybackCard');
    const button = document.getElementById('runtimeSettingsButton');
    const tools = document.getElementById('qishuiPlaybackTools');
    const pose = () => {
      const matrix = new DOMMatrix(getComputedStyle(phone).transform);
      const yaw = Math.asin(Math.max(-1, Math.min(1, matrix.m13))) * 180 / Math.PI;
      return {
        yaw: Number(yaw.toFixed(2)),
        rotationEnergy: Number((Math.abs(matrix.m12) + Math.abs(matrix.m13)
          + Math.abs(matrix.m21) + Math.abs(matrix.m23)
          + Math.abs(matrix.m31) + Math.abs(matrix.m32)).toFixed(5))
      };
    };
    const buttonStyle = button ? getComputedStyle(button) : null;
    const toolItems = Array.from(tools?.querySelectorAll('[data-playback-tool]') || []).map((tool) => {
      const style = getComputedStyle(tool);
      const rect = tool.getBoundingClientRect();
      return {
        id: tool.dataset.playbackTool,
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none'
      };
    });
    const trayStyle = tools ? getComputedStyle(tools) : null;
    const phoneRect = phone?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    const settingsInset = phoneRect && buttonRect ? {
      phone: {
        left: phoneRect.left, top: phoneRect.top, right: phoneRect.right, bottom: phoneRect.bottom,
        width: phoneRect.width, height: phoneRect.height
      },
      button: {
        left: buttonRect.left, top: buttonRect.top, right: buttonRect.right, bottom: buttonRect.bottom,
        width: buttonRect.width, height: buttonRect.height
      },
      fullyInsidePhone: buttonRect.left >= phoneRect.left - 0.5
        && buttonRect.top >= phoneRect.top - 0.5
        && buttonRect.right <= phoneRect.right + 0.5
        && buttonRect.bottom <= phoneRect.bottom + 0.5
    } : null;
    button?.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const focusOutline = button ? getComputedStyle(button).outlineStyle : 'none';
    const focusActiveId = document.activeElement?.id || '';
    const beforeOpen = pose();
    button?.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      placement: {
        count: document.querySelectorAll('#runtimeSettingsButton').length,
        underPlaybackCard: !!button && card.contains(button),
        absentFromTopbar: !document.querySelector('.runtime-topbar #runtimeSettingsButton'),
        settingsInset
      },
      button: {
        width: button?.getBoundingClientRect().width || 0,
        height: button?.getBoundingClientRect().height || 0,
        backgroundColor: buttonStyle?.backgroundColor || '',
        backgroundImage: buttonStyle?.backgroundImage || '',
        borderWidth: buttonStyle?.borderTopWidth || '',
        boxShadow: buttonStyle?.boxShadow || '',
        color: buttonStyle?.color || '',
        focusOutline,
        focusActiveId,
        phoneInert: !!phone?.inert,
        expanded: button?.getAttribute('aria-expanded') || ''
      },
      tray: {
        backgroundColor: trayStyle?.backgroundColor || '',
        backgroundImage: trayStyle?.backgroundImage || '',
        borderWidth: trayStyle?.borderTopWidth || '',
        boxShadow: trayStyle?.boxShadow || ''
      },
      toolItems,
      beforeOpen,
      afterOpen: pose()
    };
  })()`, true);

  // Keep this lifecycle assertion deterministic on machines whose OS-level
  // accessibility preference already requests reduced motion. The reduced
  // motion branch is exercised explicitly below.
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });

  const animation = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const center = window.FeSettingsCenter;
    const panel = document.getElementById('runtimeSettingsPanel');
    center?.close('animation-reset');
    await wait(240);
    center?.open('general');
    const entering = {
      state: panel?.dataset.settingsMotionState || '',
      hidden: !!panel?.hidden
    };
    await wait(240);
    const opened = {
      state: panel?.dataset.settingsMotionState || '',
      hidden: !!panel?.hidden
    };
    center?.close('animation-probe');
    const exiting = {
      state: panel?.dataset.settingsMotionState || '',
      hidden: !!panel?.hidden
    };
    await wait(240);
    const closed = {
      state: panel?.dataset.settingsMotionState || '',
      hidden: !!panel?.hidden
    };
    center?.open('general');
    await wait(240);
    center?.close('rapid-reopen');
    const rapidExitState = panel?.dataset.settingsMotionState || '';
    center?.open('visual');
    await wait(240);
    const rapidReopen = {
      state: panel?.dataset.settingsMotionState || '',
      hidden: !!panel?.hidden,
      selectedPage: center?.snapshot?.().selectedPage || ''
    };
    center?.select('general');
    return { entering, opened, exiting, closed, rapidExitState, rapidReopen };
  })()`, true);

  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  const reducedMotion = await evaluate(`(() => {
    const center = window.FeSettingsCenter;
    const panel = document.getElementById('runtimeSettingsPanel');
    center?.close('reduced-motion');
    const closed = { state: panel?.dataset.settingsMotionState || '', hidden: !!panel?.hidden };
    center?.open('general');
    const opened = { state: panel?.dataset.settingsMotionState || '', hidden: !!panel?.hidden };
    return { closed, opened };
  })()`);
  await command('Emulation.setEmulatedMedia', { features: [] });
  await delay(240);

  const dialog = await evaluate(`(async () => {
    const center = window.FeSettingsCenter;
    const panel = document.getElementById('runtimeSettingsPanel');
    const expected = [
      ['general', '常规'], ['visual', '画面与场景'], ['lyrics', '歌词'], ['pet', '桌宠'],
      ['ai-tts', '模型与 TTS'], ['mixer', '调音台'], ['cursor', '光标']
    ];
    const navResults = [];
    for (const [id, label] of expected) {
      const nav = panel?.querySelector('[data-settings-page-id="' + id + '"]');
      nav?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const page = panel?.querySelector('[data-settings-page="' + id + '"]');
      navResults.push({
        id,
        label,
        exists: !!nav,
        labelMatches: nav?.textContent?.trim() === label,
        selected: nav?.getAttribute('aria-selected') === 'true',
        pageVisible: !!page && !page.hidden && getComputedStyle(page).display !== 'none',
        pageNonempty: !!page?.textContent?.trim(),
        mixerSurface: id !== 'mixer' || (
          !!page?.querySelector('.audio-mixer-ui')
          && !/等待原生调音台接入/.test(page?.textContent || '')
        )
      });
    }
    center?.select('general');
    const title = document.getElementById('runtimeSettingsTitle');
    const titleStyle = title ? getComputedStyle(title) : null;
    const panelStyle = panel ? getComputedStyle(panel) : null;
    return {
      api: !!center && ['registerPage', 'open', 'select', 'close', 'snapshot']
        .every((name) => typeof center[name] === 'function'),
      snapshot: center?.snapshot?.() || null,
      visible: !!panel && !panel.hidden && panelStyle?.display !== 'none',
      role: panel?.getAttribute('role') || '',
      ariaModal: panel?.getAttribute('aria-modal') || '',
      labelledBy: panel?.getAttribute('aria-labelledby') || '',
      titleText: title?.textContent?.trim() || '',
      navResults,
      uniqueNavAndPages: expected.every(([id]) => (
        panel?.querySelectorAll('[data-settings-page-id="' + id + '"]').length === 1
        && panel?.querySelectorAll('[data-settings-page="' + id + '"]').length === 1
      )),
      background: {
        color: panelStyle?.backgroundColor || '',
        image: panelStyle?.backgroundImage || ''
      },
      text: {
        display: titleStyle?.display || 'none',
        visibility: titleStyle?.visibility || 'hidden',
        opacity: titleStyle?.opacity || '0',
        color: titleStyle?.color || '',
        transform: titleStyle?.transform || '',
        filter: titleStyle?.filter || '',
        backdropFilter: titleStyle?.backdropFilter || titleStyle?.webkitBackdropFilter || '',
        fontFamily: titleStyle?.fontFamily || ''
      }
    };
  })()`, true);

  const viewportResults = [];
  for (const [width, height] of [[390, 844], [1280, 800], [1920, 1080]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const measurement = await evaluate(`(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = document.getElementById('runtimeSettingsPanel');
      const content = panel?.querySelector('.settings-center-content');
      const rect = panel?.getBoundingClientRect();
      return {
        viewport: [innerWidth, innerHeight],
        rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        withinViewport: !!rect && rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        panelNoHorizontalOverflow: !!panel && panel.scrollWidth <= panel.clientWidth + 1,
        contentNoHorizontalOverflow: !!content && content.scrollWidth <= content.clientWidth + 1
      };
    })()`, true);
    viewportResults.push(measurement);
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  const aiTtsDetailsSetup = await evaluate(`(async () => {
    const center = window.FeSettingsCenter;
    const panel = document.getElementById('runtimeSettingsPanel');
    const page = document.getElementById('settingsCenterPageAiTts');
    const nav = document.getElementById('settingsNavAiTts');
    const details = document.getElementById('aiServiceSettingsGroup');
    const summary = details?.querySelector(':scope > summary');
    center?.open('ai-tts');
    if (details) details.open = false;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    nav?.focus();
    return {
      pageSelected: center?.snapshot?.().selectedPage === 'ai-tts',
      pageVisible: !!page && !page.hidden && getComputedStyle(page).display !== 'none',
      detailsCollapsed: !!details && !details.open,
      summaryNativeFocusable: !!summary && summary.tabIndex === 0 && summary.getClientRects().length > 0,
      navFocused: document.activeElement === nav,
      summaryText: summary?.textContent?.trim() || '',
      panelContainsSummary: !!panel && !!summary && panel.contains(summary)
    };
  })()`, true);
  await key('Tab', 'Tab');
  const aiTtsSummaryReached = await evaluate(`(() => {
    const summary = document.querySelector('#aiServiceSettingsGroup > summary');
    return document.activeElement === summary;
  })()`);
  await key('Tab', 'Tab');
  const aiTtsForwardLoop = await evaluate(`(() => ({
    wrappedToClose: document.activeElement?.id === 'runtimeSettingsCloseButton',
    activeId: document.activeElement?.id || ''
  }))()`);
  await key('Tab', 'Tab', 8);
  const aiTtsReverseLoop = await evaluate(`(() => {
    const summary = document.querySelector('#aiServiceSettingsGroup > summary');
    return {
      wrappedToSummary: document.activeElement === summary,
      activeTag: document.activeElement?.tagName || ''
    };
  })()`);
  await evaluate(`window.FeSettingsCenter?.select('general')`);

  const trapSetup = await evaluate(`(() => {
    const panel = document.getElementById('runtimeSettingsPanel');
    const focusables = Array.from(panel?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])
      .filter((node) => !node.hidden && !node.closest('[hidden]'));
    focusables.at(-1)?.focus();
    return { firstId: focusables[0]?.id || '', lastId: focusables.at(-1)?.id || '', activeId: document.activeElement?.id || '' };
  })()`);
  await key('Tab', 'Tab');
  const trappedActiveId = await evaluate('document.activeElement?.id || ""');
  await key('Escape', 'Escape');
  await delay(260);
  const afterEscape = await evaluate(`(() => {
    const panel = document.getElementById('runtimeSettingsPanel');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const matrix = new DOMMatrix(getComputedStyle(phone).transform);
    const yaw = Math.asin(Math.max(-1, Math.min(1, matrix.m13))) * 180 / Math.PI;
    return {
      closed: !!panel?.hidden,
      focusReturned: document.activeElement?.id === 'runtimeSettingsButton',
      activeId: document.activeElement?.id || '',
      restoredYaw: Number(yaw.toFixed(2))
    };
  })()`);

  const playbackVisibilityCoupling = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const card = document.getElementById('qishuiPlaybackCard');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const settings = document.getElementById('runtimeSettingsButton');
    const visibilityToggle = document.getElementById('qishuiPlaybackVisibilityToggle');
    visibilityToggle?.click();
    await wait(300);
    const hiddenStyle = settings ? getComputedStyle(settings) : null;
    const hiddenRect = settings?.getBoundingClientRect();
    const hidden = {
      cardHiddenByUser: !!card?.classList.contains('is-user-hidden'),
      display: hiddenStyle?.display || '',
      visibility: hiddenStyle?.visibility || '',
      pointerEvents: hiddenStyle?.pointerEvents || '',
      width: hiddenRect?.width || 0,
      height: hiddenRect?.height || 0,
      activeId: document.activeElement?.id || ''
    };
    visibilityToggle?.click();
    await wait(80);
    const restoredStyle = settings ? getComputedStyle(settings) : null;
    const restoredRect = settings?.getBoundingClientRect();
    const phoneRect = phone?.getBoundingClientRect();
    const restored = {
      cardHiddenByUser: !!card?.classList.contains('is-user-hidden'),
      display: restoredStyle?.display || '',
      visibility: restoredStyle?.visibility || '',
      width: restoredRect?.width || 0,
      height: restoredRect?.height || 0,
      fullyInsidePhone: !!(restoredRect && phoneRect
        && restoredRect.left >= phoneRect.left - 0.5
        && restoredRect.top >= phoneRect.top - 0.5
        && restoredRect.right <= phoneRect.right + 0.5
        && restoredRect.bottom <= phoneRect.bottom + 0.5)
    };
    return { hidden, restored };
  })()`, true);

  const settingsButtonCenter = await evaluate(`(() => {
    const button = document.getElementById('runtimeSettingsButton');
    const rect = button?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  if (!settingsButtonCenter) throw new Error('The playback settings button has no clickable bounds');
  await command('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: settingsButtonCenter.x,
    y: settingsButtonCenter.y
  });
  await command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: settingsButtonCenter.x,
    y: settingsButtonCenter.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  const pointerSettingsFocus = await evaluate(`(() => {
    const button = document.getElementById('runtimeSettingsButton');
    const style = button ? getComputedStyle(button) : null;
    return {
      active: document.activeElement === button,
      focusVisible: !!button?.matches(':focus-visible'),
      outlineStyle: style?.outlineStyle || '',
      outlineWidth: style?.outlineWidth || '',
      outlineColor: style?.outlineColor || '',
      borderWidth: style?.borderTopWidth || '',
      backgroundColor: style?.backgroundColor || '',
      boxShadow: style?.boxShadow || ''
    };
  })()`);
  await command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: settingsButtonCenter.x,
    y: settingsButtonCenter.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
  await delay(80);
  await key('Escape', 'Escape');
  await delay(260);
  const keyboardSettingsFocus = await evaluate(`(() => {
    const button = document.getElementById('runtimeSettingsButton');
    const style = button ? getComputedStyle(button) : null;
    return {
      active: document.activeElement === button,
      focusVisible: !!button?.matches(':focus-visible'),
      outlineStyle: style?.outlineStyle || '',
      outlineWidth: style?.outlineWidth || ''
    };
  })()`);

  const checks = {
    uniquePlaybackSurfaceSettingsIcon: initial.placement.count === 1
      && initial.placement.underPlaybackCard && initial.placement.absentFromTopbar
      && initial.placement.settingsInset?.fullyInsidePhone === true,
    settingsIconIsWhiteBareFortyPixelControl: initial.button.width >= 40 && initial.button.height >= 40
      && initial.button.backgroundColor === 'rgba(0, 0, 0, 0)'
      && initial.button.backgroundImage === 'none'
      && initial.button.borderWidth === '0px'
      && initial.button.boxShadow === 'none'
      && initial.button.color !== 'rgba(0, 0, 0, 0)'
      && initial.button.focusOutline !== 'none',
    pointerSelectionHasNoGreenSquareAndKeyboardFocusRemainsVisible: pointerSettingsFocus.active
      && !pointerSettingsFocus.focusVisible
      && (pointerSettingsFocus.outlineStyle === 'none' || pointerSettingsFocus.outlineWidth === '0px')
      && pointerSettingsFocus.borderWidth === '0px'
      && pointerSettingsFocus.backgroundColor === 'rgba(0, 0, 0, 0)'
      && pointerSettingsFocus.boxShadow === 'none'
      && keyboardSettingsFocus.active
      && keyboardSettingsFocus.focusVisible
      && keyboardSettingsFocus.outlineStyle !== 'none'
      && keyboardSettingsFocus.outlineWidth !== '0px',
    publicControllerAndModalSemantics: dialog.api && dialog.visible && dialog.role === 'dialog'
      && dialog.ariaModal === 'true' && dialog.labelledBy === 'runtimeSettingsTitle'
      && dialog.titleText.length > 0,
    controllerOwnsBoundedMotionLifecycle: animation.entering.state === 'entering'
      && !animation.entering.hidden
      && animation.opened.state === 'open'
      && !animation.opened.hidden
      && animation.exiting.state === 'exiting'
      && !animation.exiting.hidden
      && animation.closed.state === 'closed'
      && animation.closed.hidden
      && animation.rapidExitState === 'exiting'
      && animation.rapidReopen.state === 'open'
      && !animation.rapidReopen.hidden
      && animation.rapidReopen.selectedPage === 'visual'
      && reducedMotion.closed.state === 'closed'
      && reducedMotion.closed.hidden
      && reducedMotion.opened.state === 'open'
      && !reducedMotion.opened.hidden,
    sevenPagesSelectCorrectNonemptyContent: dialog.uniqueNavAndPages
      && dialog.navResults.length === 7
      && dialog.navResults.every((item) => item.exists && item.labelMatches && item.selected
        && item.pageVisible && item.pageNonempty && item.mixerSurface),
    focusTrapped: !!trapSetup.firstId && trapSetup.activeId === trapSetup.lastId
      && trappedActiveId === trapSetup.firstId,
    aiTtsDetailsSummaryIsTabReachableAndLoopsWithinDialog: aiTtsDetailsSetup.pageSelected
      && aiTtsDetailsSetup.pageVisible
      && aiTtsDetailsSetup.detailsCollapsed
      && aiTtsDetailsSetup.summaryNativeFocusable
      && aiTtsDetailsSetup.navFocused
      && aiTtsDetailsSetup.summaryText.includes('AI')
      && aiTtsDetailsSetup.summaryText.includes('TTS')
      && aiTtsDetailsSetup.panelContainsSummary
      && aiTtsSummaryReached
      && aiTtsForwardLoop.wrappedToClose
      && aiTtsReverseLoop.wrappedToSummary,
    escapeClosesAndRestoresFocus: afterEscape.closed && afterEscape.focusReturned,
    allViewportsContained: viewportResults.every((item) => item.withinViewport
      && item.panelNoHorizontalOverflow && item.contentNoHorizontalOverflow),
    approvedDarkCrispPresentation: dialog.background.image.includes('linear-gradient')
      && /rgb\((?:0|[1-3]?\d),\s*(?:0|[1-3]?\d),\s*(?:0|[1-3]?\d)\)/.test(dialog.background.color)
      && dialog.text.display !== 'none' && dialog.text.visibility === 'visible'
      && Number(dialog.text.opacity) > 0 && dialog.text.transform === 'none'
      && dialog.text.filter === 'none' && (dialog.text.backdropFilter === 'none' || dialog.text.backdropFilter === '')
      && /Segoe UI|system-ui/i.test(dialog.text.fontFamily),
    playbackToolsAreBareAccessibleTargets: initial.tray.backgroundColor === 'rgba(0, 0, 0, 0)'
      && initial.tray.backgroundImage === 'none' && initial.tray.borderWidth === '0px'
      && initial.tray.boxShadow === 'none' && initial.toolItems.length === 5
      && initial.toolItems.every((item) => item.width >= 40 && item.height >= 40
        && item.backgroundColor === 'rgba(0, 0, 0, 0)' && item.backgroundImage === 'none'
        && item.borderWidth === '0px' && item.boxShadow === 'none' && item.backdropFilter === 'none'),
    playbackTiltStraightensAndRestores: Math.abs(Math.abs(initial.beforeOpen.yaw) - 10) <= 0.6
      && initial.afterOpen.rotationEnergy < 0.002
      && Math.abs(Math.abs(afterEscape.restoredYaw) - 10) <= 0.6,
    settingsIconFollowsPlaybackVisibility: playbackVisibilityCoupling.hidden.cardHiddenByUser
      && playbackVisibilityCoupling.hidden.display === 'none'
      && playbackVisibilityCoupling.hidden.width === 0
      && playbackVisibilityCoupling.hidden.height === 0
      && playbackVisibilityCoupling.hidden.activeId !== 'runtimeSettingsButton'
      && !playbackVisibilityCoupling.restored.cardHiddenByUser
      && playbackVisibilityCoupling.restored.display !== 'none'
      && playbackVisibilityCoupling.restored.visibility === 'visible'
      && playbackVisibilityCoupling.restored.width >= 40
      && playbackVisibilityCoupling.restored.height >= 40
      && playbackVisibilityCoupling.restored.fullyInsidePhone,
    consoleClean: browserErrors.length === 0
  };
  const result = {
    initial,
    animation,
    reducedMotion,
    dialog,
    viewportResults,
    playbackVisibilityCoupling,
    settingsButtonFocus: { pointer: pointerSettingsFocus, keyboard: keyboardSettingsFocus },
    focus: {
      aiTtsDetailsSetup,
      aiTtsSummaryReached,
      aiTtsForwardLoop,
      aiTtsReverseLoop,
      trapSetup,
      trappedActiveId,
      afterEscape
    },
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
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
    } catch {}
  }
}
