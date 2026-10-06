import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// Run the compact playback-card contract against the real browser app.  The
// fixture deliberately has no network dependencies: queue changes, seeking,
// volume writes, artwork, and preference writes are all deterministic.
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/playwright/playback-card');
mkdirSync(output, { recursive: true });

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [
  process.env.PLAYWRIGHT_MODULE_PATH,
  'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');

const tracks = [
  { id: 'card-0', title: '山间来信', artist: '播放卡片测试', provider: 'netease', duration: 180, cover: '/api/cover?id=0' },
  { id: 'card-1', title: '潮汐之后', artist: '播放卡片测试', provider: 'netease', duration: 210, cover: '/api/cover?id=1' },
  { id: 'card-2', title: '夜航星图', artist: '播放卡片测试', provider: 'netease', duration: 195, cover: '/api/cover?id=2' }
];
let current = tracks[0];
let queuePosition = 0;
let backendVolume = .37;
let seekPosition = 0;
const volumeCommits = [];
const seekCommits = [];
const preferenceCommits = [];

// A short, valid PCM file allows the production media element to construct its
// normal Web Audio graph while the test remains offline and repeatable.
const toneRate = 22050;
const toneSamples = toneRate * 8;
const toneWave = Buffer.alloc(44 + toneSamples * 2);
toneWave.write('RIFF', 0); toneWave.writeUInt32LE(toneWave.length - 8, 4);
toneWave.write('WAVEfmt ', 8); toneWave.writeUInt32LE(16, 16);
toneWave.writeUInt16LE(1, 20); toneWave.writeUInt16LE(1, 22);
toneWave.writeUInt32LE(toneRate, 24); toneWave.writeUInt32LE(toneRate * 2, 28);
toneWave.writeUInt16LE(2, 32); toneWave.writeUInt16LE(16, 34);
toneWave.write('data', 36); toneWave.writeUInt32LE(toneSamples * 2, 40);
for (let index = 0; index < toneSamples; index++) {
  const seconds = index / toneRate;
  const envelope = .08 + .62 * Math.pow(.5 + .5 * Math.sin(seconds * Math.PI * 2), 2);
  const wave = .65 * Math.sin(seconds * Math.PI * 2 * 110)
    + .23 * Math.sin(seconds * Math.PI * 2 * 870)
    + .12 * Math.sin(seconds * Math.PI * 2 * 3900);
  toneWave.writeInt16LE(Math.round(wave * envelope * 32767), 44 + index * 2);
}

const fixtures = {
  '/api/music-apis': { ok: true, providers: [] },
  '/api/user-cursors': { ok: true, cursors: [] },
  '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
  '/api/visual-bridge/state': { ok: true, audio: {} },
  '/api/sandbox/presets': { ok: true, presets: [] },
  '/api/sandbox/components': { ok: true, components: [] },
  '/api/community/status': { ok: true, authenticated: false },
  '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
};

let preferenceBootstrap = null;
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};

const coverSvg = index => {
  const palettes = [
    ['#132a3a', '#d39d67', '#244b57'],
    ['#39224f', '#e07b6f', '#262959'],
    ['#152f31', '#b6d17c', '#355f5e']
  ];
  const [a, b, c] = palettes[index % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><defs><linearGradient id="g" x2=".85" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="640" fill="url(#g)"/><circle cx="480" cy="145" r="74" fill="#ffe4b3" opacity=".9"/><path d="M0 540 134 238 278 460 386 328 640 542V640H0" fill="${c}"/><path d="M34 640 288 385 502 640" fill="#101e2a" opacity=".72"/></svg>`;
};

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const pathname = decodeURIComponent(url.pathname);
  const json = value => {
    if (response.destroyed) return;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(value));
  };
  if (pathname === '/fixture-tone.wav') {
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', toneWave.length);
    response.end(toneWave);
    return;
  }
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end(preferenceBootstrap
      ? `for (const [key, value] of Object.entries(${JSON.stringify(preferenceBootstrap.values || {})})) localStorage.setItem(key, value);`
      : '');
    return;
  }
  if (pathname === '/api/app/preferences' && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        preferenceCommits.push(parsed);
        if (parsed?.values && typeof parsed.values === 'object') preferenceBootstrap = parsed;
      } catch {}
      json({ ok: true });
    });
    return;
  }
  if (pathname === '/api/app/preferences/cloud-sync' && request.method === 'POST') {
    json({ ok: true, preferences: null });
    return;
  }
  if (pathname === '/api/player/state') {
    json({ ok: true, song: current, volume: backendVolume, playing: false, paused: true,
      position: seekPosition, duration: current.duration, queue: tracks,
      queueLength: tracks.length, queueRevision: 1, queueIndex: queuePosition });
    return;
  }
  if (pathname === '/api/player/queue') {
    const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 200));
    const end = Math.min(cursor + limit, tracks.length);
    json({ items: tracks.slice(cursor, end), total: tracks.length, cursor, limit,
      nextCursor: end < tracks.length ? end : null, queueRevision: 1, queueIndex: queuePosition });
    return;
  }
  if (pathname === '/api/player/load') {
    const id = url.searchParams.get('id');
    const next = tracks.find(track => track.id === id) || tracks[0];
    current = next; queuePosition = tracks.indexOf(next); seekPosition = 0;
    json({ playable: true, url: `/fixture-tone.wav?id=${encodeURIComponent(next.id)}`, song: next, quality: 'fixture' });
    return;
  }
  if (pathname === '/api/player/seek') {
    seekPosition = Math.max(0, Math.min(current.duration, Number(url.searchParams.get('position')) || 0));
    seekCommits.push(seekPosition);
    json({ ok: true, position: seekPosition });
    return;
  }
  if (pathname === '/api/player/volume') {
    backendVolume = Math.max(0, Math.min(1, Number(url.searchParams.get('value')) || 0));
    volumeCommits.push(backendVolume);
    json({ ok: true, volume: backendVolume });
    return;
  }
  if (pathname === '/api/cover') {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end(coverSvg(Number(url.searchParams.get('id')) || 0));
    return;
  }
  if (pathname === '/data/android-bundled-library.json') { json({ playlists: [], songs: [] }); return; }
  if (pathname.startsWith('/api/')) { json(fixtures[pathname] || { ok: true }); return; }
  const file = path.resolve(
    pathname.startsWith('/components/') ? root : path.join(root, 'web'),
    pathname === '/' ? 'index.html' : pathname.slice(1)
  );
  if (!file.startsWith(root + path.sep) || !existsSync(file)) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
const errors = [];
const networkErrors = [];

const compactMode = async () => page.evaluate(() => {
  const root = document.getElementById('compactPlaybackCard');
  if (!root) return '';
  try {
    const apiMode = window.FEPlaybackCard?.getPreferences?.().mode;
    if (apiMode === 'card' || apiMode === 'bar') return apiMode;
  } catch {}
  try {
    if (typeof state !== 'undefined' && (state.playbackCardMode === 'card' || state.playbackCardMode === 'bar')) return state.playbackCardMode;
  } catch {}
  const raw = `${root.dataset.mode || ''} ${root.getAttribute('data-mode') || ''} ${root.className || ''}`.toLowerCase();
  if (/\bcard\b/.test(raw) || root.classList.contains('is-card')) return 'card';
  if (/\bbar\b/.test(raw) || root.classList.contains('is-bar')) return 'bar';
  const toggle = document.getElementById('compactPlaybackModeToggle');
  const back = document.getElementById('compactPlaybackReturnButton');
  if (back && !back.hidden && (!toggle || toggle.hidden)) return 'card';
  if (toggle && !toggle.hidden && (!back || back.hidden)) return 'bar';
  return '';
});

const readCardVolume = () => page.evaluate(() => {
  const slider = document.querySelector('#compactPlaybackVolume [role="slider"]')
    || document.querySelector('#compactPlaybackVolume');
  const aria = Number(slider?.getAttribute('aria-valuenow'));
  const value = Number(slider?.value);
  let audio = Number.NaN;
  try { if (typeof els !== 'undefined' && els.audio) audio = Number(els.audio.volume); } catch {}
  return { aria, value, audio, queueIndex: typeof state !== 'undefined' ? state.queueIndex : -1 };
});

const waitForBoot = async () => {
  const boot = page.locator('#bootLogoButton');
  if (await boot.count() && await boot.isVisible()) {
    await boot.waitFor({ state: 'attached' });
    await page.waitForFunction(() => !document.getElementById('bootLogoButton')?.disabled, null, { timeout: 10000 });
    await boot.click();
  }
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden, null, { timeout: 15000 });
  await page.waitForFunction(() => window.FEPlaybackCard && document.getElementById('compactPlaybackCard'), null, { timeout: 15000 });
  await page.evaluate(() => {
    if (typeof clearBackgroundPolling === 'function') clearBackgroundPolling();
    if (typeof clearRealtimePolling === 'function') clearRealtimePolling();
    if (typeof enterPresetPlaybackPage === 'function') enterPresetPlaybackPage('lyric');
  });
  await page.waitForFunction(() => document.getElementById('compactPlaybackCard') && window.FEPlaybackCard?.sync, null, { timeout: 15000 });
  await page.evaluate(() => window.FEPlaybackCard.sync());
};

const waitMode = expected => page.waitForFunction(mode => {
  const root = document.getElementById('compactPlaybackCard');
  if (!root) return false;
  try {
    const apiMode = window.FEPlaybackCard?.getPreferences?.().mode;
    if (apiMode === mode) return true;
  } catch {}
  try {
    if (typeof state !== 'undefined' && state.playbackCardMode === mode) return true;
  } catch {}
  const raw = `${root.dataset.mode || ''} ${root.getAttribute('data-mode') || ''} ${root.className || ''}`.toLowerCase();
  if (mode === 'card') return /\bcard\b/.test(raw) || root.classList.contains('is-card')
    || (!document.getElementById('compactPlaybackReturnButton')?.hidden && document.getElementById('compactPlaybackModeToggle')?.hidden);
  return /\bbar\b/.test(raw) || root.classList.contains('is-bar')
    || (!document.getElementById('compactPlaybackModeToggle')?.hidden && document.getElementById('compactPlaybackReturnButton')?.hidden);
}, expected, { timeout: 6000 });

const byteDifference = (a, b) => {
  const length = Math.min(a.length, b.length);
  let different = Math.abs(a.length - b.length);
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) different += 1;
  return different;
};

async function assertDropdownPointerIsNotCancelled(mode) {
  const result = await page.evaluate(() => {
    const select = document.createElement('select');
    select.id = 'dropdown-pointer-regression';
    select.innerHTML = '<option value="one">One</option><option value="two">Two</option>';
    const card = document.getElementById('compactPlaybackCard');
    const host = card && window.FEPlaybackCard?.getPreferences?.().mode === 'card' ? card : document.body;
    host.appendChild(select);
    let defaultPrevented = false;
    select.addEventListener('pointerdown', (event) => { defaultPrevented = event.defaultPrevented; }, { once: true });
    const dispatched = select.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: 20, clientY: 20
    }));
    select.remove();
    return { dispatched, defaultPrevented, insideCard: host === card, cardMode: window.FEPlaybackCard?.getPreferences?.().mode,
      cardRect: (() => { const rect = document.getElementById('compactPlaybackCard')?.getBoundingClientRect(); return rect ? [rect.width, rect.height] : null; })() };
  });
  console.error(`dropdown probe ${mode}: ${JSON.stringify(result)}`);
  assert.equal(result.dispatched, true, `${mode}: dropdown pointerdown reaches the control`);
  assert.equal(result.defaultPrevented, false, `${mode}: dropdown pointerdown is not cancelled by playback-card drag handling`);
}

async function assertHarmonicSelectIsInteractive() {
  await page.evaluate(() => {
    window.FEPlaybackCard?.setMode?.('bar', { animate: false });
    if (typeof enterPresetPlaybackPage === 'function') enterPresetPlaybackPage('harmonic-state');
    if (typeof setDiyPage === 'function') setDiyPage('preset');
    if (typeof setDiyOpen === 'function') setDiyOpen(true);
    if (typeof setDiyCardOpen === 'function') setDiyCardOpen(true);
  });
  const select = page.locator('#harmonic-effect-towerColorMode');
  await select.waitFor({ state: 'visible' });
  const result = await select.evaluate((node) => {
    let defaultPrevented = null;
    let reached = false;
    node.addEventListener('pointerdown', (event) => {
      reached = true;
      defaultPrevented = event.defaultPrevented;
    }, { once: true });
    const dispatched = node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, pointerId: 17, clientX: 40, clientY: 40
    }));
    return { dispatched, reached, defaultPrevented, active: document.activeElement === node };
  });
  assert.equal(result.dispatched, true, `harmonic select pointerdown dispatches: ${JSON.stringify(result)}`);
  assert.equal(result.reached, true, `harmonic select receives pointerdown: ${JSON.stringify(result)}`);
  assert.equal(result.defaultPrevented, false, `harmonic select pointerdown is not cancelled: ${JSON.stringify(result)}`);
  await select.scrollIntoViewIfNeeded();
  await select.click();
  const opened = await select.evaluate(node => ({
    focused: document.activeElement === node,
    open: node.matches(':open')
  }));
  assert.equal(opened.focused, true, `mouse click focuses harmonic select: ${JSON.stringify(opened)}`);
  assert.equal(opened.open, true, `mouse click opens native harmonic select popup: ${JSON.stringify(opened)}`);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => typeof state !== 'undefined' && state.harmonicState?.effects?.towerColorMode === 'custom');
  assert.equal(await select.inputValue(), 'custom', 'harmonic select change commits to the scene state');
  await page.evaluate(() => {
    if (typeof setDiyOpen === 'function') setDiyOpen(false);
    if (typeof enterPresetPlaybackPage === 'function') enterPresetPlaybackPage('lyric');
    window.FEPlaybackCard?.setMode?.('card', { animate: false });
  });
  await waitMode('card');
}

// The queue affordance belongs to the new playback bar, while its card opens
// outside the bar on the left. Keep this geometry contract here so a future
// layout tweak cannot silently move the queue back inside the lyric surface.
async function assertPlaybackQueueDocking() {
  const button = page.locator('#qishuiPlaybackQueueButton');
  const panel = page.locator('#qishuiPlaybackQueuePanel');
  await button.waitFor({ state: 'visible' });
  await page.evaluate(() => {
    window.FEPlaybackQueue?.render?.(true);
  });
  await button.click();
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackQueuePanel')?.getAttribute('aria-hidden') === 'false');
  await page.mouse.move(10, 10);
  await page.waitForFunction(() => {
    const panel = document.getElementById('qishuiPlaybackQueuePanel');
    const style = getComputedStyle(panel);
    const transform = new DOMMatrixReadOnly(style.transform);
    return Number(style.opacity) > 0.999 && Math.abs(transform.m41) < 0.1
      && Math.abs(transform.m11 - 1) < 0.001;
  });
  const probe = await page.evaluate(() => {
    const phone = document.getElementById('qishuiPlaybackPhone');
    const card = document.getElementById('qishuiPlaybackCard');
    const buttonNode = document.getElementById('qishuiPlaybackQueueButton');
    const panelNode = document.getElementById('qishuiPlaybackQueuePanel');
    const closeNode = document.getElementById('qishuiPlaybackQueueClose');
    const icon = buttonNode?.querySelector('.qishui-playback-queue-button__icon');
    const text = buttonNode?.querySelector(':scope > span:not(.qishui-playback-queue-button__icon)');
    const count = buttonNode?.querySelector(':scope > b');
    const rect = node => {
      const value = node?.getBoundingClientRect?.();
      return value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } : null;
    };
    const phoneRect = rect(phone);
    const buttonRect = rect(buttonNode);
    const panelRect = rect(panelNode);
    const iconRect = rect(icon);
    const textRect = rect(text);
    const countRect = rect(count);
    const textStyle = text ? getComputedStyle(text) : null;
    const clearButtonSurface = node => {
      if (!node) return false;
      const style = getComputedStyle(node);
      return style.backgroundColor === 'rgba(0, 0, 0, 0)'
        && style.borderTopWidth === '0px'
        && style.borderRightWidth === '0px'
        && style.borderBottomWidth === '0px'
        && style.borderLeftWidth === '0px'
        && style.boxShadow === 'none';
    };
    const verticalOverlap = !!(buttonRect && phoneRect
      && buttonRect.top < phoneRect.bottom && buttonRect.bottom > phoneRect.top);
    const buttonLowerLeft = !!(buttonRect && phoneRect
      && buttonRect.left <= phoneRect.left + 40
      && buttonRect.top >= phoneRect.top + phoneRect.height * 0.72);
    const edgeGap = buttonRect && phoneRect
      ? Math.min(Math.abs(buttonRect.right - phoneRect.left), Math.abs(buttonRect.left - phoneRect.left))
      : Infinity;
    const queueList = panelNode?.querySelector('.qishui-playback-queue-list');
    const originalQueueList = queueList?.innerHTML || '';
    if (queueList) {
      for (let i = 0; i < 40; i += 1) {
        const filler = document.createElement('li');
        filler.className = 'qishui-playback-queue-item';
        filler.textContent = `scroll-${i}`;
        queueList.appendChild(filler);
      }
    }
    const queueListStyle = queueList ? getComputedStyle(queueList) : null;
    const listScrollable = !!(queueList && queueList.scrollHeight > queueList.clientHeight
      && queueListStyle?.overflowY === 'auto');
    if (queueList) queueList.innerHTML = originalQueueList;
    return {
      buttonParent: buttonNode?.parentElement?.id || '',
      panelParent: panelNode?.parentElement?.id || '',
      ariaLabel: buttonNode?.getAttribute('aria-label') || '',
      title: buttonNode?.getAttribute('title') || '',
      buttonRect, panelRect, phoneRect, iconRect, textRect, countRect,
      buttonSurfaceClear: clearButtonSurface(buttonNode),
      closeSurfaceClear: clearButtonSurface(closeNode),
      buttonSurfaceStyle: (() => { const style = getComputedStyle(buttonNode); return { backgroundColor: style.backgroundColor, borderTopWidth: style.borderTopWidth, borderRightWidth: style.borderRightWidth, borderBottomWidth: style.borderBottomWidth, borderLeftWidth: style.borderLeftWidth, boxShadow: style.boxShadow }; })(),
      closeSurfaceStyle: (() => { const style = getComputedStyle(closeNode); return { backgroundColor: style.backgroundColor, borderTopWidth: style.borderTopWidth, borderRightWidth: style.borderRightWidth, borderBottomWidth: style.borderBottomWidth, borderLeftWidth: style.borderLeftWidth, boxShadow: style.boxShadow }; })(),
      buttonSelectorMatches: !!buttonNode?.matches('#qishuiPlaybackCard.qishui-playback-card .qishui-playback-queue-button'),
      panelOutsideLeft: !!(panelRect && phoneRect && panelRect.right <= phoneRect.left + 3),
      buttonAttached: verticalOverlap && edgeGap <= 10,
      buttonLowerLeft,
      iconVisible: !!(iconRect && iconRect.width > 0 && iconRect.height > 0),
      textHidden: !text || textStyle?.display === 'none' || textStyle?.visibility === 'hidden'
        || Number(textStyle?.opacity) === 0 || !textRect || textRect.width === 0 || textRect.height === 0,
      countHidden: !count || getComputedStyle(count).display === 'none'
        || !countRect || countRect.width === 0 || countRect.height === 0,
      queueItems: panelNode?.querySelectorAll('.qishui-playback-queue-item').length || 0,
      listScrollable,
      cardContainsButton: !!card?.contains(buttonNode),
      cardContainsPanel: !!card?.contains(panelNode)
    };
  });
  assert.equal(probe.panelOutsideLeft, true, `queue panel should sit outside the playback bar on the left: ${JSON.stringify(probe)}`);
  assert.equal(probe.buttonAttached, true, `queue button should stay attached to the playback bar edge: ${JSON.stringify(probe)}`);
  assert.equal(probe.buttonLowerLeft, true, `queue button should stay at the playback bar lower-left: ${JSON.stringify(probe)}`);
  assert.equal(probe.iconVisible, true, `queue button icon should remain visible: ${JSON.stringify(probe)}`);
  assert.equal(probe.buttonSurfaceClear, true, `queue button should have no dark button container: ${JSON.stringify(probe)}`);
  assert.equal(probe.closeSurfaceClear, true, `queue close button should have no dark button container: ${JSON.stringify(probe)}`);
  assert.equal(probe.textHidden, true, `queue button text label should be visually hidden in icon-only mode: ${JSON.stringify(probe)}`);
  assert.ok(probe.ariaLabel && probe.title, `icon-only queue button keeps an accessible name and tooltip: ${JSON.stringify(probe)}`);
  assert.equal(probe.countHidden, true, `queue button count should be hidden in icon-only mode: ${JSON.stringify(probe)}`);
  assert.equal(probe.buttonParent, 'qishuiPlaybackCard', 'queue button remains anchored to the playback card stage');
  assert.equal(probe.panelParent, 'qishuiPlaybackCard', 'queue panel remains anchored to the playback card stage');
  assert.ok(probe.queueItems >= tracks.length, `queue panel renders the playback queue: ${JSON.stringify(probe)}`);
  assert.equal(probe.listScrollable, true, `queue card list should scroll when it exceeds the panel: ${JSON.stringify(probe)}`);
  const playingBeforeSelect = await page.evaluate(() => FeMonsterPlaybackContext.state.currentSong?.id);
  await page.locator('#qishuiPlaybackQueueList [data-queue-index="1"] strong').click();
  assert.equal(await page.locator('#qishuiPlaybackQueueList [data-queue-index="1"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => FeMonsterPlaybackContext.state.currentSong?.id), playingBeforeSelect);
  await page.mouse.move(10, 10);
  await panel.screenshot({ path: path.join(output, 'queue-selection.png') });
  // Close it so subsequent card mode and drag assertions do not sample a
  // transient panel or accidentally click through its hit target.
  // The panel is intentionally allowed to overlap the queue affordance while
  // it animates from the left; close through the production API so the test
  // does not depend on a transient pointer hit target.
  await page.evaluate(() => window.FEPlaybackQueue?.close?.());
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackQueuePanel')?.getAttribute('aria-hidden') === 'true');
  return probe;
}

try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
    || (!existsSync(chromium.executablePath()) && existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-webgl']
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/*', route => {
    try { return new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await waitForBoot();

  // The default contract is intentionally explicit.  Animation is disabled
  // for all interaction checks so no assertion depends on transition timing.
  const defaults = await page.evaluate(() => window.FEPlaybackCard.getPreferences());
  for (const [key, expected] of Object.entries({ size: 232, radius: 52, opacity: 92, colorMode: 'cover', animation: true, breakStyle: 'center-out', assembleMs: 2400, longPressMs: 400 })) {
    assert.equal(defaults[key], expected, `default playback-card ${key}`);
  }
  await page.evaluate(() => window.FEPlaybackCard.updatePreferences({ animation: false }));
  await page.evaluate(() => window.FEPlaybackCard.setMode('bar', { animate: false }));
  await waitMode('bar');
  await assertDropdownPointerIsNotCancelled('bar');
  const queueDockProbe = await assertPlaybackQueueDocking();

  const toggle = page.locator('#compactPlaybackModeToggle');
  const back = page.locator('#compactPlaybackReturnButton');
  await toggle.waitFor({ state: 'visible' });
  await toggle.click();
  await waitMode('card');
  const card = page.locator('#compactPlaybackCard');
  await card.waitFor({ state: 'visible' });
  await assertDropdownPointerIsNotCancelled('card');
  const settingsButton = page.locator('#runtimeSettingsButton');
  await settingsButton.waitFor({ state: 'visible' });
  assert.ok(await settingsButton.evaluate(node => !node.hidden && getComputedStyle(node).display !== 'none'), 'settings button remains visible in card mode');
  assert.equal((await page.locator('#compactPlaybackTitle').textContent()).trim(), tracks[0].title, 'card title follows current song');
  assert.equal(await page.locator('#compactPlaybackCard [data-lyric], #compactPlaybackCard [data-lyrics], #compactPlaybackLyrics, #compactPlaybackCardLyrics').count(), 0, 'compact card has no lyric surface');

  const canvas = card.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  const webgl = await canvas.evaluate(node => {
    const context = node.getContext('webgl2') || node.getContext('webgl') || node.getContext('experimental-webgl');
    return { context: !!context, width: node.width, height: node.height, three: !!window.THREE };
  });
  assert.equal(webgl.three, true, 'playback card uses the loaded Three.js runtime');
  assert.equal(webgl.context, true, 'playback card canvas has a live WebGL context');
  assert.ok(webgl.width > 0 && webgl.height > 0, 'playback card canvas is painted');

  const style = await card.evaluate(node => {
    const css = getComputedStyle(node);
    return { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, radius: parseFloat(css.borderRadius), opacity: parseFloat(css.opacity) };
  });
  assert.ok(Math.abs(style.width - defaults.size) <= 2 && Math.abs(style.height - defaults.size) <= 2, 'default card size is 232px');
  assert.ok(Math.abs(style.radius - defaults.radius) <= 2, 'default card radius is 52px');
  assert.ok(Math.abs(style.opacity - defaults.opacity / 100) <= .02, 'default card opacity is 92%');

  const volumeRoot = page.locator('#compactPlaybackVolume');
  await volumeRoot.waitFor({ state: 'visible' });
  const slider = volumeRoot.locator('[role="slider"]').first();
  assert.ok(await slider.count() || await volumeRoot.getAttribute('role') === 'slider', 'card border exposes an accessible slider');
  const volumeNode = await (await slider.count() ? slider : volumeRoot).elementHandle();
  const volumeIsSvg = await volumeRoot.evaluate(node => node.tagName.toLowerCase() === 'svg');
  assert.ok(volumeIsSvg || await volumeRoot.locator('svg').count(), 'volume slider is painted as an SVG border');
  assert.ok(await volumeRoot.locator('path').count() || await volumeRoot.locator('rect').count(), 'volume slider has a border path');

  backendVolume = .37;
  await page.evaluate(() => { if (typeof refreshPlayerState === 'function') return refreshPlayerState(); });
  await page.waitForFunction(() => {
    const slider = document.querySelector('#compactPlaybackVolume [role="slider"]') || document.querySelector('#compactPlaybackVolume');
    return Math.abs(Number(slider?.getAttribute('aria-valuenow')) - 37) < .1;
  });
  const synced = await readCardVolume();
  assert.ok(Math.abs(synced.audio - .37) < .01 || Math.abs(synced.aria - 37) < .1, 'card volume syncs an existing player volume');

  // Keyboard control remains native and continuous even though the visual rail
  // is the complete SVG perimeter.
  const keyboardSlider = await slider.count() ? slider : volumeRoot;
  await keyboardSlider.focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => Number((document.querySelector('#compactPlaybackVolume [role="slider"]') || document.querySelector('#compactPlaybackVolume'))?.getAttribute('aria-valuenow')) > 37);
  await page.keyboard.press('End');
  await page.waitForFunction(() => Number((document.querySelector('#compactPlaybackVolume [role="slider"]') || document.querySelector('#compactPlaybackVolume'))?.getAttribute('aria-valuenow')) >= 99.9);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => Number((document.querySelector('#compactPlaybackVolume [role="slider"]') || document.querySelector('#compactPlaybackVolume'))?.getAttribute('aria-valuenow')) < 100);
  await page.keyboard.press('Home');
  await page.waitForFunction(() => Number((document.querySelector('#compactPlaybackVolume [role="slider"]') || document.querySelector('#compactPlaybackVolume'))?.getAttribute('aria-valuenow')) <= .1);

  // Click every straight edge and each rounded corner.  At least six distinct
  // values prove that this is one continuous perimeter control, rather than a
  // decorative rail with a small hidden input in the middle.
  const volumeBox = await volumeRoot.boundingBox();
  assert.ok(volumeBox, 'volume border has a hit target');
  const radius = Math.max(12, Math.min(volumeBox.width, volumeBox.height) * .18);
  const points = [
    [volumeBox.x + volumeBox.width * .18, volumeBox.y + 2],
    [volumeBox.x + volumeBox.width * .50, volumeBox.y + 2],
    [volumeBox.x + volumeBox.width * .82, volumeBox.y + 2],
    [volumeBox.x + volumeBox.width - 2, volumeBox.y + volumeBox.height * .18],
    [volumeBox.x + volumeBox.width - 2, volumeBox.y + volumeBox.height * .50],
    [volumeBox.x + volumeBox.width - 2, volumeBox.y + volumeBox.height * .82],
    [volumeBox.x + volumeBox.width * .82, volumeBox.y + volumeBox.height - 2],
    [volumeBox.x + volumeBox.width * .50, volumeBox.y + volumeBox.height - 2],
    [volumeBox.x + volumeBox.width * .18, volumeBox.y + volumeBox.height - 2],
    [volumeBox.x + 2, volumeBox.y + volumeBox.height * .82],
    [volumeBox.x + 2, volumeBox.y + volumeBox.height * .50],
    [volumeBox.x + 2, volumeBox.y + volumeBox.height * .18],
    [volumeBox.x + radius * .30, volumeBox.y + radius * .30],
    [volumeBox.x + volumeBox.width - radius * .30, volumeBox.y + radius * .30],
    [volumeBox.x + volumeBox.width - radius * .30, volumeBox.y + volumeBox.height - radius * .30],
    [volumeBox.x + radius * .30, volumeBox.y + volumeBox.height - radius * .30]
  ];
  const perimeterValues = [];
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(35);
    perimeterValues.push((await readCardVolume()).audio);
  }
  const finiteValues = perimeterValues.filter(Number.isFinite);
  assert.ok(finiteValues.length >= 12 && new Set(finiteValues.map(value => Math.round(value * 100))).size >= 6, `all border regions should adjust volume: ${JSON.stringify(perimeterValues)}`);

  // Wheel events over the border change only volume; wheel events in the card
  // interior select adjacent queue tracks.
  const queueBeforeBorderWheel = await page.evaluate(() => state.queueIndex);
  const volumeBeforeBorderWheel = (await readCardVolume()).audio;
  await page.mouse.move(volumeBox.x + volumeBox.width / 2, volumeBox.y + 2);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(previous => Math.abs((typeof els !== 'undefined' ? els.audio.volume : 0) - previous) > .001, volumeBeforeBorderWheel, { timeout: 6000 });
  assert.equal(await page.evaluate(() => state.queueIndex), queueBeforeBorderWheel, 'border wheel does not change tracks');

  const cardBox = await card.boundingBox();
  assert.ok(cardBox, 'card has a hit target');
  const queueBeforeInteriorWheel = await page.evaluate(() => state.queueIndex);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(previous => typeof state !== 'undefined' && state.queueIndex !== previous, queueBeforeInteriorWheel, { timeout: 8000 });
  await page.waitForFunction(() => state.currentSong?.id === 'card-1', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => state.currentSong?.id), tracks[1].id, 'card interior wheel advances the queue');
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => state.currentSong?.id === 'card-0', null, { timeout: 8000 });

  // Long press starts a drag and clamps to the viewport.  The resulting
  // position is checked again after a full app reload below.
  const beforeDrag = await card.boundingBox();
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(defaults.longPressMs + 90);
  await page.mouse.move(1270, 810, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(160);
  const afterDrag = await card.boundingBox();
  assert.ok(afterDrag && (Math.abs(afterDrag.x - beforeDrag.x) > 4 || Math.abs(afterDrag.y - beforeDrag.y) > 4), `long press moves the card before=${JSON.stringify(beforeDrag)} after=${JSON.stringify(afterDrag)}`);
  assert.ok(afterDrag.x >= -1 && afterDrag.y >= -1 && afterDrag.x + afterDrag.width <= 1281 && afterDrag.y + afterDrag.height <= 821, 'dragged card is clamped to the viewport');

  // Progress is a 0..1000 range and commits a real player seek.
  const progress = page.locator('#compactPlaybackProgress');
  await progress.waitFor({ state: 'visible' });
  assert.equal(await progress.getAttribute('min'), '0');
  assert.equal(await progress.getAttribute('max'), '1000');
  await progress.dispatchEvent('pointerdown');
  await progress.evaluate(input => { input.value = '500'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
  await progress.dispatchEvent('pointerup');
  const seekDeadline = Date.now() + 6000;
  while (!seekCommits.some(value => Math.abs(value - 90) < 2) && Date.now() < seekDeadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(seekCommits.some(value => Math.abs(value - 90) < 2), `progress seek should reach half duration: ${JSON.stringify(seekCommits)}`);

  const customPreferences = { size: 248, radius: 52, opacity: 84, colorMode: 'gradient', colorStart: '#123456', colorEnd: '#abcdef', animation: false, breakStyle: 'center-out', assembleMs: 2800, longPressMs: 460 };
  await page.evaluate(patch => window.FEPlaybackCard.updatePreferences(patch), customPreferences);
  const changedPreferences = await page.evaluate(() => window.FEPlaybackCard.getPreferences());
  for (const [key, expected] of Object.entries(customPreferences)) assert.equal(changedPreferences[key], expected, `settings update ${key}`);

  // The same values are exposed through the existing Visual settings page,
  // rather than requiring callers to reach into the runtime API directly.
  await page.evaluate(() => window.FEPlaybackCard.setMode('bar', { animate: false }));
  await waitMode('bar');
  assert.equal(await page.locator('#qishuiPlaybackTools [data-playback-tool="diy-toggle"]').count(), 0, 'new playback bar no longer exposes a DIY toggle');
  assert.equal(await page.locator('.app-shell').evaluate(node => node.classList.contains('is-playback-playlist-picker-open')), false, 'playlist picker is closed before its scene tool is used');
  const playbackPlaylistTool = page.locator('#qishuiPlaybackTools [data-playback-tool="playlists"]');
  assert.equal(await playbackPlaylistTool.count(), 1, 'playback bar keeps its playlist launcher');
  await playbackPlaylistTool.click();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.playbackPlaylistPickerOpen === true);
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('is-playback-playlist-picker-open'));
  await page.evaluate(() => setPlaybackPlaylistPickerOpen(false));
  await page.waitForFunction(() => typeof state !== 'undefined' && state.playbackPlaylistPickerOpen === false);
  const sceneTool = page.locator('#qishuiPlaybackTools [data-playback-tool="preset"]');
  await sceneTool.click();
  await page.waitForFunction(() => document.getElementById('diySidebar')?.getAttribute('aria-hidden') === 'false');
  assert.equal(await page.locator('.app-shell').evaluate(node => node.classList.contains('is-playback-diy-panel-open')), true, 'scene tool opens the right sidebar');
  const diyPlaylist = page.locator('#diyPlaylistButton');
  await diyPlaylist.waitFor({ state: 'visible' });
  await diyPlaylist.click();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.playbackPlaylistPickerOpen === true);
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('is-playback-playlist-picker-open'));
  assert.equal(await page.locator('#diyPlaylistButton').getAttribute('aria-pressed'), 'true', 'DIY playlist button reflects the open picker');
  await page.evaluate(() => setPlaybackPlaylistPickerOpen(false));
  await page.waitForFunction(() => typeof state !== 'undefined' && state.playbackPlaylistPickerOpen === false);
  assert.equal(await page.locator('.app-shell').evaluate(node => node.classList.contains('is-playback-playlist-picker-open')), false, 'playlist picker closes cleanly');
  const settingsPlacement = await page.evaluate(() => {
    const button = document.getElementById('runtimeSettingsButton');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const buttonRect = button?.getBoundingClientRect();
    const phoneRect = phone?.getBoundingClientRect();
    return {
      parentId: button?.parentElement?.id,
      position: button && getComputedStyle(button).position,
      rightInset: buttonRect && phoneRect ? phoneRect.right - buttonRect.right : Infinity,
      topOffset: buttonRect && phoneRect ? buttonRect.top - phoneRect.top : Infinity
    };
  });
  assert.equal(settingsPlacement.parentId, 'qishuiPlaybackPhone', 'settings button stays on playback phone');
  assert.equal(settingsPlacement.position, 'absolute', 'settings button uses phone corner positioning');
  assert.ok(settingsPlacement.rightInset >= -3 && settingsPlacement.rightInset < 22 && settingsPlacement.topOffset >= -3 && settingsPlacement.topOffset < 66, `settings button returns to top-right: ${JSON.stringify(settingsPlacement)}`);
  await page.locator('#runtimeSettingsButton').click();
  await page.locator('#runtimeSettingsPanel').waitFor({ state: 'visible' });
  await page.waitForTimeout(220);
  await page.locator('[data-settings-page-id="visual"]').click();
  const settingsGroup = page.locator('#runtimePlaybackCardSettingsGroup');
  await settingsGroup.waitFor({ state: 'visible' });
  if (!(await settingsGroup.evaluate(node => node.open))) await settingsGroup.locator('summary').click();
  const settingsRadius = page.locator('#playbackCardSettingRadius');
  await settingsRadius.fill('54');
  await settingsRadius.dispatchEvent('input');
  await settingsRadius.dispatchEvent('change');
  await page.waitForFunction(() => window.FEPlaybackCard?.getPreferences?.().radius === 54);
  assert.equal(await page.locator('[data-card-output="radius"]').textContent(), '54 px', 'settings page updates card radius');
  await page.evaluate(() => window.FeSettingsCenter?.close?.('playback-card-test'));
  await page.evaluate(patch => window.FEPlaybackCard.updatePreferences(patch), { radius: customPreferences.radius });
  await page.evaluate(() => window.FEPlaybackCard.setMode('card', { animate: false }));
  await waitMode('card');
  await assertHarmonicSelectIsInteractive();

  // Preference values and the dragged screen position survive a real reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForBoot();
  await waitMode('card');
  const reloadedPreferences = await page.evaluate(() => window.FEPlaybackCard.getPreferences());
  for (const [key, expected] of Object.entries(customPreferences)) assert.equal(reloadedPreferences[key], expected, `reloaded preference ${key}`);
  const reloadedBox = await page.locator('#compactPlaybackCard').boundingBox();
  const expectedReloadLeft = Math.min(afterDrag.x, 1280 - (reloadedBox?.width || customPreferences.size) - 8);
  const expectedReloadTop = Math.min(afterDrag.y, 820 - (reloadedBox?.height || customPreferences.size) - 8);
  assert.ok(reloadedBox && Math.abs(reloadedBox.x - expectedReloadLeft) < 8 && Math.abs(reloadedBox.y - expectedReloadTop) < 8, 'drag position persists after reload');

  // Mobile layout keeps the whole rounded card on screen and supports both
  // directions of the explicit mode buttons.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  const mobileBox = await page.locator('#compactPlaybackCard').boundingBox();
  assert.ok(mobileBox && mobileBox.x >= -1 && mobileBox.y >= -1 && mobileBox.x + mobileBox.width <= 391 && mobileBox.y + mobileBox.height <= 845, `mobile card is clipped: ${JSON.stringify(mobileBox)}`);
  await back.click();
  await waitMode('bar');
  await toggle.click();
  await waitMode('card');

  // Exercise the particle transition with animation enabled and reduced
  // motion disabled.  Particles should enter the target-flow assembly phase
  // immediately after shatter; there is no idle float/dwell between modes.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.FEPlaybackCard.updatePreferences({ animation: true, breakStyle: 'center-out', assembleMs: 2400 }));
  const phaseSamples = async (direction, beforeName, duringName, afterName) => {
    const beforePath = path.join(output, beforeName);
    const duringPath = path.join(output, duringName);
    const afterPath = path.join(output, afterName);
    await page.screenshot({ path: beforePath });
    if (direction === 'to-bar') await page.locator('#compactPlaybackReturnButton').click();
    else await page.locator('#compactPlaybackModeToggle').click();
    // Sample inside the page so Playwright round-trip latency cannot collapse
    // the particle flow into a single observation.
    await page.evaluate(() => {
      window.__playbackCardPhaseSamples = [];
      const startedAt = performance.now();
      window.__playbackCardPhaseSampler = (async () => {
        while (performance.now() - startedAt < 5200) {
          const node = document.getElementById('compactPlaybackCard');
          const transition = document.querySelector('.playback-card-transition-canvas');
          const phase = `${node?.dataset.phase || ''} ${node?.dataset.transitionPhase || ''} ${node?.dataset.particlePhase || ''} ${node?.getAttribute('data-animation-phase') || ''} ${node?.className || ''} ${transition?.dataset.phase || ''} ${transition?.dataset.transitionPhase || ''} ${transition?.dataset.particlePhase || ''}`.toLowerCase();
          window.__playbackCardPhaseSamples.push({ t: performance.now(), phase });
          await new Promise(resolve => setTimeout(resolve, 45));
        }
        return window.__playbackCardPhaseSamples;
      })();
    });
    await page.waitForTimeout(550);
    await page.screenshot({ path: duringPath });
    const samples = await page.evaluate(() => window.__playbackCardPhaseSampler);
    const floats = samples.filter(sample => /float|drift/.test(sample.phase));
    const assembles = samples.filter(sample => /assemble/.test(sample.phase));
    await page.waitForTimeout(120);
    await page.screenshot({ path: afterPath });
    assert.equal(floats.length, 0, `${direction} transition should not pause in a float phase`);
    assert.ok(assembles.length > 0, `${direction} transition should flow directly into assembly`);
    assert.ok(byteDifference(readFileSync(beforePath), readFileSync(duringPath)) > 500, `${direction} transition should change rendered pixels during particle flow`);
    assert.ok(byteDifference(readFileSync(duringPath), readFileSync(afterPath)) > 500, `${direction} transition should reassemble rendered pixels`);
  };
  await phaseSamples('to-bar', 'card-transition-before.png', 'card-transition-float.png', 'card-transition-after.png');
  await phaseSamples('to-card', 'bar-transition-before.png', 'bar-transition-float.png', 'bar-transition-after.png');
  await waitMode('card');

  assert.deepEqual(errors, [], 'playback-card browser test has no page errors');
  assert.deepEqual(networkErrors, [], 'playback-card fixture loads without network errors');
  writeFileSync(path.join(output, 'report.json'), JSON.stringify({
    ok: true, defaults, customPreferences, reloadedPreferences, volumeCommits, seekCommits,
    queueDockProbe,
    errors, networkErrors, screenshots: ['card-transition-before.png', 'card-transition-float.png', 'card-transition-after.png', 'bar-transition-before.png', 'bar-transition-float.png', 'bar-transition-after.png']
  }, null, 2));
  console.log(JSON.stringify({ ok: true, output, volumeCommits: volumeCommits.length, seekCommits }));
} finally {
  try {
    if (page) await page.evaluate(() => window.FEPlaybackCard?.updatePreferences({ animation: false }));
  } catch {}
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
