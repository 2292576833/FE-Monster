import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edge = edgeCandidates.find(existsSync);
if (!edge) throw new Error('Microsoft Edge is required for lyric particle browser QA');

const debugPort = 21000 + (process.pid % 10000);
const profile = path.join(tmpdir(), `fe-monster-lyric-particles-${process.pid}`);
const artifactDir = path.join(root, 'artifacts', 'qa');
const screenshotPath = path.join(artifactDir, 'lyric-highlight-particles.png');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2']
]);

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
    ? { base: path.join(root, 'components'), relative: decoded.slice('/components/'.length) }
    : decoded.startsWith('/node_modules/')
      ? { base: path.join(root, 'node_modules'), relative: decoded.slice('/node_modules/'.length) }
      : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : '';
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/api/app/preferences/bootstrap.js') {
    const body = Buffer.from('window.__feLyricParticleQaPreferencesLoaded = true;');
    response.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const body = Buffer.from(JSON.stringify(apiFixture(url)));
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }
  if (url.pathname === '/data/android-bundled-library.json') {
    const body = Buffer.from('[]');
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }
  const filePath = safeFilePath(url.pathname);
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
  '--disable-gpu',
  '--force-prefers-reduced-motion=no-preference',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const runtimeErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function clickSelector(selector) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    return true;
  })()`);
  await delay(180);
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Unable to click missing selector: ${selector}`);
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails || {};
      runtimeErrors.push({
        kind: 'runtime',
        description: details.exception?.description || 'Runtime exception',
        url: details.url || '',
        line: Number(details.lineNumber) || 0
      });
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      runtimeErrors.push({
        kind: 'log',
        description: message.params.entry.text || 'Console error',
        url: message.params.entry.url || '',
        line: Number(message.params.entry.lineNumber) || 0
      });
    }
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  await Promise.all([
    command('Page.enable'),
    command('Runtime.enable'),
    command('Log.enable'),
    command('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    })
  ]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });
  await command('Page.navigate', { url: `${baseUrl}/?lyric-particle-qa=${Date.now()}` });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete'
      && typeof updatePlaybackSceneMotion === 'function'
      && typeof ensureLyricHighlightParticleRenderer === 'function'
      && window.FeMonsterLyricHighlightParticles
      && document.getElementById('lyricHighlightParticlesFront')`);
    if (ready) break;
    if (attempt === 119) throw new Error('FE Monster client did not finish booting');
    await delay(100);
  }

  const lazyBeforePlayback = await evaluate(`({
    rendererCreated: Boolean(state.playbackVisual.lyricHighlightParticleRenderer),
    frontWidth: document.getElementById('lyricHighlightParticlesFront').width
  })`);

  const simulation = await evaluate(`(async () => {
    createDirectX11Renderer = (THREE, options = {}) => new THREE.WebGLRenderer(options);
    document.getElementById('bootScreen')?.setAttribute('hidden', '');
    state.playbackPage = true;
    state.diyPreset = 'wallpaper';
    state.textPreset = 'depth';
    state.multiRowLyricsEnabled = false;
    state.lyricDisplayText = '微光流动';
    if (state.orb.animationFrame) cancelAnimationFrame(state.orb.animationFrame);
    state.orb.animationFrame = 0;
    requestOrbFrame = () => {};
    updatePlaybackPageClass();
    els.appShell.classList.add('is-playback-page');
    els.playbackLyricScene.hidden = false;
    els.playbackLyricScene.style.opacity = '1';
    els.playbackLyricScene.style.visibility = 'visible';
    els.playbackLyricScene.style.background = 'radial-gradient(circle at 50% 46%, rgba(24, 68, 88, .48), rgba(2, 8, 14, .2) 38%, rgba(1, 4, 9, .72) 74%)';
    els.playbackLyricCore.style.setProperty('--lyric-fit-font-size', '58px');
    els.playbackLyricCore.querySelectorAll('.playback-lyric-layer').forEach((layer) => {
      layer.textContent = state.lyricDisplayText;
      layer.dataset.text = state.lyricDisplayText;
    });
    state.textComposerSettings = normalizeTextComposerSettings({
      ...state.textComposerSettings,
      lyricsEnabled: true,
      highlightParticlesEnabled: true,
      highlightParticleSize: 0.75,
      highlightParticleDensity: 78,
      highlightParticleSensitivity: 68,
      highlightParticleSpread: 56,
      highlightParticleColorMode: 'manual',
      highlightParticleColor: '#7ee8ff'
    });
    applyTextComposerSettings({ renderLyrics: false, measureSubtitle: false });
    const renderer = ensureLyricHighlightParticleRenderer();
    renderer.setTarget(els.playbackLyricText);
    renderer.setReducedMotion(false);
    const originalClock = isPlaybackClockRunning;
    const runFrames = (low, count, playing = true) => {
      isPlaybackClockRunning = () => playing;
      state.visual.lowFrequencyAmplitude = low;
      state.visual.bass = low;
      state.visualBridge.lowFrequencyAmplitude = low;
      state.visualBridge.bass = low;
      const startedAt = performance.now();
      for (let frame = 0; frame < count; frame += 1) {
        updateLyricHighlightParticles(playing, 1);
      }
      return {
        ...renderer.diagnostics(),
        averageFrameMs: (performance.now() - startedAt) / Math.max(1, count)
      };
    };

    renderer.clear();
    const firstAttack = runFrames(.92, 1).drive;
    const settledAttack = runFrames(.92, 28).drive;
    renderer.clear();
    const weak = runFrames(.07, 64);
    const paused = runFrames(0, 90, false);
    renderer.clear();
    const strong = runFrames(.92, 64);

    state.textPreset = 'book';
    renderer.clear();
    const book = runFrames(.92, 2);
    state.textPreset = 'depth';

    const threeDiagnostics = renderer.diagnostics();
    const frontStyle = getComputedStyle(els.lyricHighlightParticlesFront);
    const lyricStyle = getComputedStyle(els.playbackLyricText);
    const singleHostPass = els.lyricHighlightParticlesFront.parentElement === els.playbackLyricCore;

    const firstLine = document.createElement('div');
    firstLine.className = 'multi-row-lyric-line is-current';
    const firstMain = document.createElement('span');
    firstMain.className = 'multi-row-lyric-main';
    firstMain.textContent = '重复歌词粒子定位';
    firstLine.appendChild(firstMain);
    const secondLine = document.createElement('div');
    secondLine.className = 'multi-row-lyric-line';
    const secondMain = document.createElement('span');
    secondMain.className = 'multi-row-lyric-main';
    secondMain.textContent = '重复歌词粒子定位';
    secondLine.appendChild(secondMain);
    els.multiRowLyricList.replaceChildren(firstLine, secondLine);
    state.multiRowLyricsEnabled = true;
    state.lyricDisplayText = '重复歌词粒子定位';
    state.lyricIndex = 41;
    state.playbackVisual.lyricHighlightParticleTarget = null;
    const firstRepeatedTarget = lyricHighlightParticleTarget();
    firstLine.classList.remove('is-current');
    secondLine.classList.add('is-current');
    state.lyricIndex = 42;
    const multiTarget = lyricHighlightParticleTarget();
    const repeatedTargetPass = firstRepeatedTarget === firstMain
      && multiTarget === secondMain
      && firstRepeatedTarget !== multiTarget;
    renderer.setTarget(multiTarget, secondLine);
    renderer.markBoundsDirty();
    state.visual.lowFrequencyAmplitude = .72;
    state.visual.bass = .72;
    updateLyricHighlightParticles(true, 1);
    const multiTargetPass = multiTarget === secondMain
      && els.lyricHighlightParticlesFront.parentElement === secondLine;
    const multiHostRect = secondLine.getBoundingClientRect();
    const multiCanvasRect = els.lyricHighlightParticlesFront.getBoundingClientRect();
    const multiHostLayoutPass = getComputedStyle(secondLine).position === 'relative'
      && Math.abs((multiHostRect.left + multiHostRect.width * .5) - (multiCanvasRect.left + multiCanvasRect.width * .5)) < 24
      && Math.abs((multiHostRect.top + multiHostRect.height * .5) - (multiCanvasRect.top + multiCanvasRect.height * .5)) < 24;
    state.multiRowLyricsEnabled = false;
    state.lyricDisplayText = '微光流动';
    state.playbackVisual.lyricHighlightParticleTarget = null;
    renderer.setTarget(els.playbackLyricText, els.playbackLyricCore);
    renderer.clear();
    renderer.markBoundsDirty();
    state.visual.lowFrequencyAmplitude = .92;
    state.visual.bass = .92;
    for (let frame = 0; frame < 48; frame += 1) {
      updateLyricHighlightParticles(true, 1);
    }

    const regularCanvas = [els.lyricHighlightParticlesFront.width, els.lyricHighlightParticlesFront.height];
    const originalText = els.playbackLyricText.textContent;
    els.playbackLyricText.textContent = '沿着很长很长的星光轨迹继续向前飞行探索未知世界';
    renderer.markBoundsDirty();
    updateLyricHighlightParticles(true, 1);
    const wideCanvas = {
      front: [els.lyricHighlightParticlesFront.width, els.lyricHighlightParticlesFront.height],
      diagnostics: renderer.diagnostics()
    };
    els.playbackLyricText.textContent = originalText;
    renderer.markBoundsDirty();
    updateLyricHighlightParticles(true, 1);
    isPlaybackClockRunning = () => true;

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      weak,
      strong,
      paused,
      book,
      firstAttack,
      settledAttack,
      threeDiagnostics,
      singleHostPass,
      multiTargetPass,
      multiHostLayoutPass,
      repeatedTargetPass,
      layers: {
        frontZ: Number(frontStyle.zIndex),
        frontPointerEvents: frontStyle.pointerEvents,
        lyricZ: Number(lyricStyle.zIndex),
        subtitlePosition: getComputedStyle(els.playbackLyricSubtitle).position
      },
      canvas: regularCanvas,
      wideCanvas,
      settings: state.textComposerSettings,
      originalClockWasFunction: typeof originalClock === 'function'
    };
  })()`);

  mkdirSync(artifactDir, { recursive: true });
  const screenshot = await command('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  await evaluate(`(() => {
    setDiyOpen(true);
    setDiyPage('text');
    setDiyCardOpen(true);
    document.getElementById('textColorEffectsGroup').open = true;
  })()`);
  await delay(420);
  const beforeToggle = await evaluate('state.textComposerSettings.highlightParticlesEnabled');
  await clickSelector('#textHighlightParticlesToggle');
  await delay(180);
  const afterToggle = await evaluate('state.textComposerSettings.highlightParticlesEnabled');
  await clickSelector('#textHighlightParticlesToggle');
  await delay(180);
  const restoredToggle = await evaluate('state.textComposerSettings.highlightParticlesEnabled');
  await clickSelector('[data-lyric-particle-palette-color="#ffadc9"]');
  await delay(180);
  const manualPalette = await evaluate(`({
    mode: state.textComposerSettings.highlightParticleColorMode,
    color: state.textComposerSettings.highlightParticleColor,
    status: document.getElementById('lyricParticlePaletteStatus').textContent
  })`);
  await clickSelector('#lyricParticlePaletteAutoButton');
  await delay(180);
  const autoPalette = await evaluate(`({
    mode: state.textComposerSettings.highlightParticleColorMode,
    status: document.getElementById('lyricParticlePaletteStatus').textContent
  })`);

  const fit = await evaluate(`(() => {
    const scene = document.getElementById('playbackLyricScene').getBoundingClientRect();
    const control = document.getElementById('lyricParticlePaletteControl').getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      sceneInside: scene.left >= 0 && scene.top >= 0 && scene.right <= innerWidth && scene.bottom <= innerHeight,
      paletteWidth: control.width,
      pageScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);

  const presetPreservation = await evaluate(`(() => {
    const keys = [
      'highlightParticlesEnabled',
      'highlightParticleSize',
      'highlightParticleDensity',
      'highlightParticleSensitivity',
      'highlightParticleSpread',
      'highlightParticleColorMode',
      'highlightParticleColor'
    ];
    state.textComposerSettings = normalizeTextComposerSettings({
      ...state.textComposerSettings,
      highlightParticlesEnabled: true,
      highlightParticleSize: 1.15,
      highlightParticleDensity: 63,
      highlightParticleSensitivity: 74,
      highlightParticleSpread: 61,
      highlightParticleColorMode: 'manual',
      highlightParticleColor: '#ffadc9'
    });
    const before = Object.fromEntries(keys.map((key) => [key, state.textComposerSettings[key]]));
    setTextPreset('focus-echo', { applyTemplate: true, persist: false });
    const afterFocus = Object.fromEntries(keys.map((key) => [key, state.textComposerSettings[key]]));
    setTextPreset('depth', { applyTemplate: true, persist: false });
    const afterDepth = Object.fromEntries(keys.map((key) => [key, state.textComposerSettings[key]]));
    return {
      before,
      afterFocus,
      afterDepth,
      pass: keys.every((key) => before[key] === afterFocus[key] && before[key] === afterDepth[key])
    };
  })()`);

  await evaluate(`(() => {
    setTextComposerSetting('highlightParticleSize', 1.15, { commit: true });
    setTextComposerSetting('highlightParticleDensity', 63, { commit: true });
    setTextComposerSetting('highlightParticleSensitivity', 74, { commit: true });
    setTextComposerSetting('highlightParticleSpread', 61, { commit: true });
    setLyricParticlePalettePreference('manual', '#ffadc9');
    flushTextComposerSettingsSave();
  })()`);
  await delay(180);
  await command('Page.navigate', { url: `${baseUrl}/?lyric-particle-reload-qa=${Date.now()}` });
  await delay(240);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    let ready = false;
    try {
      ready = await evaluate(`document.readyState === 'complete'
        && typeof updatePlaybackSceneMotion === 'function'
        && Boolean(state?.textComposerSettings)`);
    } catch {}
    if (ready) break;
    if (attempt === 119) throw new Error('FE Monster client did not finish reloading');
    await delay(100);
  }
  const reloadPersistence = await evaluate(`({
    size: state.textComposerSettings.highlightParticleSize,
    density: state.textComposerSettings.highlightParticleDensity,
    sensitivity: state.textComposerSettings.highlightParticleSensitivity,
    spread: state.textComposerSettings.highlightParticleSpread,
    mode: state.textComposerSettings.highlightParticleColorMode,
    color: state.textComposerSettings.highlightParticleColor
  })`);

  const checks = {
    weakHasParticles: simulation.weak.activeCount > 0,
    strongIsDenser: simulation.strong.activeCount > simulation.weak.activeCount * 2,
    attackIsSmooth: simulation.firstAttack > 0
      && simulation.firstAttack < 0.5
      && simulation.settledAttack > simulation.firstAttack,
    pauseDisperses: simulation.paused.activeCount === 0,
    bookModeStopsParticles: simulation.book.activeCount === 0 && simulation.book.suspended === true,
    usesThreeEngine: simulation.threeDiagnostics.engine === 'three',
    createsRendererOnlyWhenPlaybackNeedsIt: lazyBeforePlayback.rendererCreated === false,
    bothDepthLayersDraw: simulation.strong.backCount > 0
      && simulation.strong.frontCount > 0,
    usesSingleWebglRenderer: simulation.strong.rendererCount === 1,
    particleCanvasKeepsLyricsClear: simulation.layers.frontZ < simulation.layers.lyricZ,
    canvasDoesNotCaptureInput: simulation.layers.frontPointerEvents === 'none',
    subtitleLayoutIsPreserved: simulation.layers.subtitlePosition === 'absolute',
    multiRowTargetWorks: simulation.multiTargetPass === true,
    multiRowCanvasFollowsCurrentLine: simulation.multiHostLayoutPass === true,
    repeatedLyricRetargetsByIndex: simulation.repeatedTargetPass === true,
    singleRowHostFollowsTransform: simulation.singleHostPass === true,
    shortLyricUsesTightCanvas: simulation.threeDiagnostics.targetWidth < 520
      && simulation.threeDiagnostics.canvasWidth < fit.viewport[0],
    highDpiIsSharp: simulation.threeDiagnostics.pixelRatio >= 1.5,
    highDpiPixelBudgetIsBounded: simulation.wideCanvas.front[0] * simulation.wideCanvas.front[1] <= 1610000,
    frameCostSupportsSmoothMotion: simulation.strong.averageFrameMs < 16.67,
    toggleRoundTrip: beforeToggle === true && afterToggle === false && restoredToggle === true,
    manualPaletteWorks: manualPalette.mode === 'manual' && manualPalette.color === '#ffadc9',
    autoPaletteWorks: autoPalette.mode === 'auto' && autoPalette.status.includes('跟随'),
    presetSwitchPreservesParticleSettings: presetPreservation.pass === true,
    reloadRestoresParticleSettings: reloadPersistence.size === 1.15
      && reloadPersistence.density === 63
      && reloadPersistence.sensitivity === 74
      && reloadPersistence.spread === 61
      && reloadPersistence.mode === 'manual'
      && reloadPersistence.color === '#ffadc9',
    viewportFits: fit.sceneInside && fit.paletteWidth > 0 && !fit.pageScrollX,
    noRuntimeErrors: runtimeErrors.filter((error) => error.kind === 'runtime').length === 0
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    checks,
    simulation,
    lazyBeforePlayback,
    controls: {
      beforeToggle,
      afterToggle,
      restoredToggle,
      manualPalette,
      autoPalette,
      presetPreservation,
      reloadPersistence
    },
    fit,
    runtimeErrors,
    screenshotPath
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  server.close();
  await delay(200);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {}
}
