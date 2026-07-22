import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const width = Math.max(960, Number.parseInt(process.argv[2] || '1440', 10) || 1440);
const height = Math.max(540, Number.parseInt(process.argv[3] || '900', 10) || 900);
const debugPort = 15000 + (process.pid % 12000);
const profile = path.resolve(tmpdir(), `fe-monster-void-prism-${process.pid}`);
const artifactDir = path.resolve('artifacts');
const screenshotPath = path.join(artifactDir, `void-prism-${width}x${height}.png`);
const mirrorOnlyScreenshotPath = path.join(artifactDir, `void-prism-mirror-only-${width}x${height}.png`);
mkdirSync(artifactDir, { recursive: true });

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2']
]);

function apiFixture(pathname) {
  if (pathname === '/api/player/state') return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (pathname === '/api/visual-bridge/state') return { audio: {} };
  if (pathname === '/api/audio/sample') return {};
  if (pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname === '/api/community/listen/state') return { ok: false };
  if (pathname === '/api/community/listening') return { ok: false };
  if (pathname === '/api/sandbox/presets') return { presets: [] };
  if (pathname === '/api/sandbox/components') return { components: [] };
  if (pathname === '/api/app/runtime') return {};
  if (pathname === '/api/login/status') return { loggedIn: false };
  if (pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
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

let server = null;
let baseUrl = String(process.env.FE_TEST_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const body = Buffer.from(JSON.stringify(apiFixture(url.pathname)));
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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const browser = spawn(edge, [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--force-prefers-reduced-motion=no-preference',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result?.value;
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
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || '').join(' '));
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=void-prism` });
  await delay(1800);

  const scene = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const poll = async (read, timeout = 12000) => {
      const started = performance.now();
      while (performance.now() - started < timeout) {
        const value = read();
        if (value) return value;
        await wait(100);
      }
      return null;
    };
    const boot = document.querySelector('#bootScreen');
    if (boot) boot.hidden = true;
    state.currentSong = { id: 'qa-void-prism', title: '虚空棱镜', artist: 'FE Monster' };
    setPlaybackLyricLine('光穿过虚空留下回声', 'FE Monster', 0.42);
    enterPresetPlaybackPage('void-prism');
    requestOrbFrame();
    const active = await poll(() => {
      const value = window.FeSandboxDiagnostics?.voidPrism?.();
      return value?.active
        && value.reflectionPasses >= 4
        && value.surfaceTexture?.ready
        && value.lyricOnlyReflection
        && value.lyricReflectionMirrorCount === 4
        && value.surfaceTexture?.failedLayers?.length === 0
        ? value
        : null;
    });
    if (!active) {
      throw new Error('虚空棱镜运行时未启动 runtime=' + typeof window.FeVoidPrismRuntime
        + ' preset=' + state.diyPreset
        + ' core=' + Boolean(els.voidPrismCore)
        + ' diagnostics=' + typeof window.FeSandboxDiagnostics?.voidPrism
        + ' stateRuntime=' + Boolean(state.voidPrism?.runtime)
        + ' canvas=' + document.querySelectorAll('#voidPrismCore canvas').length
        + ' snapshot=' + JSON.stringify(window.FeSandboxDiagnostics?.voidPrism?.()));
    }
    const card = document.querySelector('#diyVoidPrismPreset');
    const cardInSceneList = Boolean(card && document.querySelector('#diyScenePresetList')?.contains(card));
    const runtime = state.voidPrism.runtime;
    const originalRendererClear = runtime.renderer.clear;
    const originalProjectionUpdate = runtime.camera.updateProjectionMatrix;
    let reflectionClearCalls = 0;
    let projectionMatrixUpdates = 0;
    runtime.renderer.clear = function (...args) {
      reflectionClearCalls += 1;
      return originalRendererClear.apply(this, args);
    };
    runtime.camera.updateProjectionMatrix = function (...args) {
      projectionMatrixUpdates += 1;
      return originalProjectionUpdate.apply(this, args);
    };
    const fontBefore = window.FeSandboxDiagnostics.voidPrism();
    setTextPreset('depth');
    setTextFontPreference('source-han-heavy');
    requestOrbFrame();
    await wait(260);
    const fontAfter = window.FeSandboxDiagnostics.voidPrism();
    reflectionClearCalls = 0;
    projectionMatrixUpdates = 0;
    const first = fontAfter;
    state.playbackVisual.yaw = 0.34;
    state.playbackVisual.pitch = -0.22;
    state.playbackVisual.zoom = 1.06;
    updatePlaybackSceneTransform();
    setPlaybackLyricLine('镜中的歌词随时间继续延伸', '实时平面反射', 0.18);
    requestOrbFrame();
    await wait(520);
    const second = window.FeSandboxDiagnostics.voidPrism();
    runtime.renderer.clear = originalRendererClear;
    runtime.camera.updateProjectionMatrix = originalProjectionUpdate;
    const lyricGlyph = document.querySelector('.playback-lyric-glyph')
      || document.querySelector('.lyric-depth-0');
    return {
      first,
      second,
      fontBefore,
      fontAfter,
      cardInSceneList,
      cardLabel: card?.querySelector('strong')?.textContent.trim() || '',
      sceneVisible: document.querySelector('#voidPrismScene')?.hidden === false,
      appClass: document.querySelector('.app-shell')?.classList.contains('has-void-prism') === true,
      canvasCount: document.querySelectorAll('#voidPrismCore canvas').length,
      lyricPrimary: getComputedStyle(els.playbackLyricScene).getPropertyValue('--lyric-primary').trim(),
      lyricComputedColor: getComputedStyle(document.querySelector('.lyric-depth-0')).color,
      lyricGlyphColor: lyricGlyph ? getComputedStyle(lyricGlyph).color : '',
      selectedTextFont: document.documentElement.dataset.textFont || '',
      selectedTextFontStack: document.documentElement.style.getPropertyValue('--text-preset-font-family'),
      fontStackCachedInFrameLoop: /activeTextFontFamilyStack/.test(updateVoidPrismMotion.toString())
        && !/\btextFontFamilyStack\(\)/.test(updateVoidPrismMotion.toString()),
      lyricSceneClasses: els.playbackLyricScene.className,
      performanceSample: {
        reflectionClearCalls,
        projectionMatrixUpdates,
        reflectionPassDelta: second.reflectionPasses - first.reflectionPasses,
        frameDelta: second.frameCount - first.frameCount
      }
    };
  })()`);

  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  await evaluate(`(() => {
    const style = document.createElement('style');
    style.id = 'qa-void-prism-mirror-only';
    style.textContent = [
      '.app-shell > :not(.stage) { visibility: hidden !important; }',
      '.stage > :not(#voidPrismScene) { visibility: hidden !important; }',
      '#voidPrismScene { visibility: visible !important; opacity: 1 !important; }'
    ].join('\\n');
    document.head.appendChild(style);
    return true;
  })()`);
  await delay(80);
  const mirrorOnlyScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(mirrorOnlyScreenshotPath, Buffer.from(mirrorOnlyScreenshot.data, 'base64'));

  const cleanup = await evaluate(`(async () => {
    setDiyPreset('lyric');
    await new Promise((resolve) => setTimeout(resolve, 220));
    return window.FeSandboxDiagnostics.voidPrism();
  })()`);

  const shaderErrors = browserErrors.filter((message) => /shader|webgl|gl_invalid|program/i.test(message));
  const checks = {
    presetCard: scene.cardInSceneList && scene.cardLabel === '虚空棱镜',
    sceneVisible: scene.sceneVisible && scene.appClass && scene.canvasCount === 1,
    cyclesAuthoringProvenance: scene.second.authoringRenderer === 'blender-cycles-5.1.2'
      && scene.second.liveRenderer === 'three-webgl-planar-reflection'
      && scene.second.usesCyclesAuthoringReference === true,
    cyclesRuntimeEnvironmentExcluded: scene.second.cyclesEnvironmentRequested === false
      && scene.second.cyclesEnvironmentReady === false
      && scene.second.cyclesEnvironmentFailed === false
      && scene.second.cyclesEnvironmentResolution?.[0] === 0
      && scene.second.cyclesEnvironmentResolution?.[1] === 0
      && scene.second.usesCyclesOutput === false,
    fourMirrors: scene.second.mirrorCount === 4,
    fourSeams: scene.second.seamCount === 4,
    depth: scene.second.tunnelDepth >= 90,
    planarReflection: scene.second.planarReflections === true
      && scene.second.mirrorMaterial.type === 'principled-bsdf-tutorial-planar-mirror'
      && scene.second.mirrorMaterial.fresnel === true
      && scene.second.mirrorMaterial.proceduralBase === false
      && scene.second.mirrorMaterial.materialBlend === 0
      && scene.second.mirrorMaterial.microtextureInfluence === 0
      && scene.second.mirrorMaterial.silverBacking === false
      && scene.second.mirrorMaterial.glassFrontLayer === false
      && scene.second.mirrorMaterial.clearcoatSheen === false
      && scene.second.mirrorMaterial.chromeFinish === true
      && scene.second.mirrorMaterial.fresnelEdgeBoost === true
      && scene.second.mirrorMaterial.opticallySmooth === true
      && scene.second.mirrorMaterial.shadowFloor === 0
      && scene.second.mirrorMaterial.mirrorDefinition === 'tutorial-pure-white-metallic-zero-roughness'
      && scene.second.mirrorMaterial.metallic === 1
      && scene.second.mirrorMaterial.reflectivity === 1
      && scene.second.mirrorMaterial.gloss === 1
      && scene.second.mirrorMaterial.normalStrength === 0
      && scene.second.mirrorMaterial.displacementAmplitude === 0
      && scene.second.mirrorMaterial.polishLevel === 1
      && scene.second.mirrorMaterial.reflectionClarity === 'optical-mirror'
      && scene.second.mirrorMaterial.roughnessRange?.[0] === 0
      && scene.second.mirrorMaterial.roughnessRange?.[1] === 0
      && scene.second.mirrorMaterial.roughness === 0,
    tutorialMirror: scene.second.mirrorMaterial.shaderModel === 'principled-bsdf-tutorial-equivalent'
      && scene.second.mirrorMaterial.baseColor?.[0] === 1
      && scene.second.mirrorMaterial.baseColor?.[1] === 1
      && scene.second.mirrorMaterial.baseColor?.[2] === 1
      && scene.second.mirrorMaterial.metallic === 1
      && scene.second.mirrorMaterial.roughness === 0
      && scene.second.mirrorMaterial.ior === 1.5
      && scene.second.mirrorMaterial.alpha === 1
      && scene.second.mirrorMaterial.reflectionContrast === 1
      && scene.second.mirrorMaterial.textureInfluence === 0,
    lyricOnlyEnvironment: scene.second.cyclesEnvironmentUrl === null
      && scene.second.cyclesEnvironmentMapping === 'disabled-for-lyric-only-reflection'
      && scene.second.cyclesEnvironmentContent === 'lyric-canvas-only'
      && scene.second.backgroundMode === 'transparent-lyric-reflection-target'
      && scene.second.reflectionBackgroundTransparent === true
      && scene.second.surfaceTexture?.reflectionParallax === false,
    lyricOnlyReflection: scene.second.recursiveReflectionFrames === false
      && scene.second.lyricOnlyReflection === true
      && scene.second.lyricReflectionPolicy === 'all-four-mirrors-only'
      && scene.second.lyricReflectionMirrorCount === 4
      && scene.second.lyricReflectionOpacity === 1
      && scene.second.nonRecursiveStudioReflection === true
      && scene.second.reflectionSceneObjectCount === 1
      && scene.second.darkScenePanels === false
      && scene.second.blackMirrorBorders === false
      && scene.second.seamTone === 'neutral-silver'
      && scene.second.backgroundMode === 'transparent-lyric-reflection-target'
      && scene.second.seamStrength === 'reference-hairline'
      && scene.second.lyricColorMode === 'graphite-on-neutral-silver'
      && scene.second.foregroundLyricProfile === 'single-layer-clean-graphite'
      && scene.second.reflectionStrength === 'true-planar-studio-mirror',
    tutorialTextureFree: scene.second.surfaceTexture?.source === 'none-principled-tutorial'
      && scene.second.surfaceTexture?.layers === 0
      && scene.second.surfaceTexture?.loadedLayers === 0
      && scene.second.surfaceTexture?.ready === true
      && scene.second.surfaceTexture?.failedLayers?.length === 0
      && scene.second.surfaceTexture?.channels?.color === false
      && scene.second.surfaceTexture?.channels?.roughness === false
      && scene.second.surfaceTexture?.channels?.normalGL === false
      && scene.second.surfaceTexture?.channels?.displacement === false
      && scene.second.surfaceTexture?.channels?.metalness === 'uniform-1.0'
      && scene.second.surfaceTexture?.coordinateSpace === 'none'
      && scene.second.surfaceTexture?.screenSpaceNoise === false
      && scene.second.surfaceTexture?.surfaceNoise === 'none-visible'
      && scene.second.surfaceTexture?.scratches === false
      && scene.second.surfaceTexture?.stains === false
      && scene.second.surfaceTexture?.bump === 'disabled-for-optical-polish'
      && scene.second.surfaceTexture?.displacement === 'disabled-for-optical-polish'
      && scene.second.surfaceTexture?.textureTiling === null
      && scene.second.surfaceTexture?.studioEnvironment === 'none-lyric-only'
      && scene.second.surfaceTexture?.ovalReflectionAccentCount === 0
      && scene.second.surfaceTexture?.stripReflectionCount === 0
      && scene.second.surfaceTexture?.stripObjectsRemoved === true
      && scene.second.surfaceTexture?.reflectionContrastStructure === 'lyric-alpha-on-continuous-silver-field'
      && scene.second.surfaceTexture?.luminanceProfile === 'clean-neutral-midrange'
      && scene.second.surfaceTexture?.silverToneProfile === 'view-directed-field-with-broad-soft-key'
      && scene.second.surfaceTexture?.specularLightProfile === 'single-broad-elliptical-lobe'
      && scene.second.surfaceTexture?.specularObjectCount === 0
      && scene.second.surfaceTexture?.highlightClipping === false
      && scene.second.surfaceTexture?.environmentLightingShape === 'none'
      && scene.second.surfaceTexture?.referenceSource === 'user-video-blender-principled-mirror-tutorial'
      && scene.second.surfaceTexture?.chromeF0?.every((value) => value === 1)
      && scene.second.surfaceTexture?.environmentReflection === false
      && scene.second.surfaceTexture?.environmentBackdrop === 'transparent-reflection-target'
      && scene.second.surfaceTexture?.environmentBackdropResolution?.[0] === 0
      && scene.second.surfaceTexture?.environmentBackdropResolution?.[1] === 0
      && scene.second.surfaceTexture?.reflectionParallax === false
      && scene.second.surfaceTexture?.orientationAwareLighting === true
      && scene.second.surfaceTexture?.renderProfile === 'tutorial-principled-lyric-only-planar-mirror'
      && scene.second.surfaceTexture?.backPanelProfile === 'blended-neutral-silver'
      && scene.second.surfaceTexture?.targetAspect === '16:9',
    independentLyricRotation: scene.second.cameraMotionMode === 'locked'
      && scene.second.interactionTarget === 'lyric-only'
      && Math.abs(scene.second.lyricRotation?.[0] + 0.22) < 0.02
      && Math.abs(scene.second.lyricRotation?.[1] - 0.34) < 0.02
      && Math.abs(scene.second.lyricScale - 1.06) < 0.02,
    controlledExposure: scene.second.toneMappingExposure >= 0.84
      && scene.second.toneMappingExposure <= 0.92,
    textFontPropagation: scene.selectedTextFont === 'source-han-heavy'
      && scene.selectedTextFontStack.includes('思源粗宋')
      && scene.fontAfter.lyricFontFamily.includes('思源粗宋')
      && scene.fontAfter.lyricFontFamily !== scene.fontBefore.lyricFontFamily
      && scene.fontAfter.lyricUpdates > scene.fontBefore.lyricUpdates,
    textFontFrameEfficiency: scene.fontStackCachedInFrameLoop === true,
    lyricReflection: scene.second.lyricText === '镜中的歌词随时间继续延伸'
      && scene.second.lyricUpdates > scene.first.lyricUpdates
      && scene.lyricPrimary === 'rgba(92, 99, 103, 1)'
      && scene.lyricComputedColor === 'rgb(92, 99, 103)'
      && scene.lyricGlyphColor === 'rgb(92, 99, 103)',
    reflectionResolution: scene.second.reflectionResolution[0] >= 512
      && scene.second.reflectionResolution[1] >= 320
      && scene.second.lyricTextureResolution?.[0] === 4096
      && scene.second.lyricTextureResolution?.[1] === 1024
      && scene.second.reflectionSampling === 'optical-single-tap-planar'
      && scene.second.reflectionColorPipeline === 'linear-planar-alpha-mask-srgb-output',
    reflectionPassEfficiency: scene.performanceSample.reflectionClearCalls
        === scene.performanceSample.reflectionPassDelta + scene.performanceSample.frameDelta
      && scene.performanceSample.projectionMatrixUpdates === 0
      && scene.performanceSample.reflectionPassDelta === 4,
    disposal: cleanup.active === false
      && cleanup.canvasCount === 0
      && cleanup.disposeCount >= 1
      && cleanup.materialTextureCount === 0
      && cleanup.materialTexturesDisposed === true,
    shaderErrors: shaderErrors.length === 0
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    viewport: `${width}x${height}`,
    checks,
    diagnostics: scene,
    cleanup,
    browserErrors,
    screenshotPath,
    mirrorOnlyScreenshotPath
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  if (process.platform === 'win32' && browser.pid) {
    spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await delay(180);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
  } catch {
    // A delayed Edge utility process can hold the temporary profile briefly on Windows.
  }
}
