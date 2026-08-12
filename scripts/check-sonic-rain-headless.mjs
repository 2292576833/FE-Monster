import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `fe-monster-sonic-rain-${process.pid}`);
const debugPort = 19000 + Math.floor(Math.random() * 8000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(edge)) {
  console.log(JSON.stringify({ pass: true, skipped: true, reason: 'Microsoft Edge is unavailable' }, null, 2));
  process.exit(0);
}

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
  if (pathname === '/api/app/preferences/bootstrap.js') return null;
  if (pathname === '/api/player/state') return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (pathname === '/api/visual-bridge/state') return { audio: {} };
  if (pathname === '/api/audio/sample') return {};
  if (pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  if (pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname === '/api/community/listen/state') return { ok: false };
  if (pathname === '/api/community/listening') return { ok: false };
  if (pathname === '/api/sandbox/presets') return { presets: [] };
  if (pathname === '/api/sandbox/components') return { components: [] };
  if (pathname === '/api/app/runtime') return {};
  if (pathname === '/api/login/status') return { loggedIn: false };
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
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return '';
  return candidate;
}

const server = createServer((request, response) => {
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
  const file = safeFilePath(url.pathname);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(file);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
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
  '--use-angle=d3d11',
  '--disable-background-timer-throttling',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket = null;
let nextId = 1;
const pending = new Map();
const browserErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
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
  const response = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
  }
  return response.result?.value;
}

let result = null;
let reducedMotionResult = null;
try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page' && item.url === 'about:blank')
    || targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      const request = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) request.reject(new Error(payload.error.message));
      else request.resolve(payload.result || {});
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      browserErrors.push(payload.params?.exceptionDetails?.exception?.description
        || payload.params?.exceptionDetails?.text
        || 'Runtime exception');
    }
    if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') {
      browserErrors.push((payload.params.args || []).map((argument) => argument.value || argument.description || '').join(' '));
    }
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-rain` });
  await delay(2200);

  result = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const boot = document.querySelector('#bootScreen');
    const bootButton = document.querySelector('#bootLogoButton');
    if (boot && !boot.hidden && bootButton) {
      bootButton.disabled = false;
      bootButton.click();
      await wait(650);
    }
    if (typeof enterPresetPlaybackPage !== 'function') throw new Error('Preset entry helper is unavailable');
    enterPresetPlaybackPage('topography');
    requestOrbFrame();
    const startedAt = performance.now();
    while (!state.sonicTopography?.rain && performance.now() - startedAt < 10000) await wait(80);
    const topo = state.sonicTopography;
    const rain = topo?.rain;
    if (!rain || !topo.renderer) throw new Error('Sonic rain renderer did not start');

    // A compiled rain shader is not enough: the default Sonic view must expose
    // a perceptible rain curtain in the actual DX11/ANGLE framebuffer. Render
    // the same frozen scene twice and isolate only the streak batch so moving
    // terrain, ripples and post-processing cannot create a false positive.
    const defaultRainEnabled = topo.settings.rainEnabled === true;
    const defaultRainIntensity = topo.settings.rainIntensity;
    const defaultRainDropCount = rain.activeDropCount;
    const drawingBufferSize = topo.renderer.getDrawingBufferSize(new THREE.Vector2());
    const defaultRainPixelCount = drawingBufferSize.x * drawingBufferSize.y;
    const readDefaultRainFrame = () => {
      topo.renderer.setRenderTarget(null);
      topo.renderer.render(topo.scene, topo.camera);
      const pixels = new Uint8Array(defaultRainPixelCount * 4);
      topo.renderer.getContext().readPixels(
        0,
        0,
        drawingBufferSize.x,
        drawingBufferSize.y,
        topo.renderer.getContext().RGBA,
        topo.renderer.getContext().UNSIGNED_BYTE,
        pixels
      );
      return pixels;
    };
    const rippleWasVisible = rain.rippleMesh.visible;
    const splashWasVisible = rain.splashMesh.visible;
    const streakWasVisible = rain.streakMesh.visible;
    rain.rippleMesh.visible = false;
    rain.splashMesh.visible = false;
    rain.streakMesh.visible = true;
    const defaultRainOnPixels = readDefaultRainFrame();
    rain.streakMesh.visible = false;
    const defaultRainOffPixels = readDefaultRainFrame();
    rain.streakMesh.visible = streakWasVisible;
    rain.rippleMesh.visible = rippleWasVisible;
    rain.splashMesh.visible = splashWasVisible;
    let defaultRainChangedPixels = 0;
    let defaultRainTotalRgbDelta = 0;
    let defaultRainPeakRgbDelta = 0;
    for (let offset = 0; offset < defaultRainOnPixels.length; offset += 4) {
      const rgbDelta = Math.abs(defaultRainOnPixels[offset] - defaultRainOffPixels[offset])
        + Math.abs(defaultRainOnPixels[offset + 1] - defaultRainOffPixels[offset + 1])
        + Math.abs(defaultRainOnPixels[offset + 2] - defaultRainOffPixels[offset + 2]);
      if (rgbDelta < 9) continue;
      defaultRainChangedPixels += 1;
      defaultRainTotalRgbDelta += rgbDelta;
      defaultRainPeakRgbDelta = Math.max(defaultRainPeakRgbDelta, rgbDelta);
    }
    const defaultRainPixelCoverage = defaultRainChangedPixels / Math.max(1, defaultRainPixelCount);
    const defaultRainMeanRgbDelta = defaultRainTotalRgbDelta / Math.max(1, defaultRainChangedPixels);

    topo.settings.rainEnabled = true;
    topo.settings.rainIntensity = 1.5;
    topo.settings.rainRippleIntensity = 0.9;
    topo.settings.rainWind = 0;
    applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
    rain.activeDropCount = 2;
    rain.streakMesh.count = 2;
    rain.dropData[0] = 0;
    rain.dropData[1] = -0.2;
    rain.dropData[2] = 0;
    rain.dropData[SONIC_RAIN_DROP_STRIDE] = rain.groundRadius + 4;
    rain.dropData[SONIC_RAIN_DROP_STRIDE + 1] = -0.2;
    rain.dropData[SONIC_RAIN_DROP_STRIDE + 2] = 0;
    updateSonicRain(topo, 1 / 60, performance.now() / 1000, 0.5);
    await wait(180);
    let activeRipples = 0;
    for (let index = 0; index < SONIC_RAIN_QUALITY.ripples; index += 1) {
      if (rain.rippleData[index * SONIC_RAIN_RIPPLE_STRIDE + 4] > 0) activeRipples += 1;
    }
    let activeSplashes = 0;
    for (let index = 0; index < SONIC_RAIN_QUALITY.splashes; index += 1) {
      if (rain.splashData[index * SONIC_RAIN_SPLASH_STRIDE + 7] > 0) activeSplashes += 1;
    }
    let resetDropsOnRenderedGround = true;
    for (let index = 0; index < rain.activeDropCount; index += 1) {
      const offset = index * SONIC_RAIN_DROP_STRIDE;
      if (!sonicRainGroundSurfaceAt(rain.dropData[offset], rain.dropData[offset + 2])
          || !sonicRainGroundVisibleAt(rain, rain.dropData[offset], 1, rain.dropData[offset + 2])) {
        resetDropsOnRenderedGround = false;
      }
    }
    const centerGroundAccepted = sonicRainGroundSurfaceAt(0, 0)
      && sonicRainGroundVisibleAt(rain, 0, 1, 0);
    const cellGapRejected = !sonicRainGroundSurfaceAt(SONIC_TOPOGRAPHY_SIZE * 0.5 + 0.03, 0);
    const terrainEdgeRejected = !sonicRainGroundFootprintAt(rain.groundRadius + 1, 0);
    for (let index = 0; index < topo.ripples.length; index += 1) {
      topo.ripples[index].isActive = 0;
    }
    const tallSurfaceTime = performance.now() / 1000;
    const tallSurfaceRipple = topo.ripples[0];
    tallSurfaceRipple.pos.set(0, 0);
    tallSurfaceRipple.time = tallSurfaceTime;
    tallSurfaceRipple.strength = 3;
    tallSurfaceRipple.isActive = 1;
    tallSurfaceRipple.rippleType = 0;
    rain.activeDropCount = 1;
    rain.streakMesh.count = 1;
    rain.dropData[0] = 0;
    rain.dropData[1] = 10.5;
    rain.dropData[2] = 0;
    rain.dropData[3] = 1;
    rain.dropData[4] = 1;
    const impactSequenceBeforeTallSurface = rain.impactSequence;
    updateSonicRain(topo, 1 / 120, tallSurfaceTime, 0.5);
    const tallTerrainRippleCaughtRain = rain.impactSequence > impactSequenceBeforeTallSurface;
    const terrainWetUniformsWired = !!topo.uniforms.uRainEnabled
      && !!topo.uniforms.uRainWetReflectance
      && !!topo.uniforms.uRainWetGlow
      && topo.uniforms.uRainEnabled.value === 1;
    const detachedWetPlaneAbsent = !rain.wetPlane && !topo.scene.getObjectByName('SonicRainWetGround');

    topo.settings.rainEnabled = false;
    applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
    const clearedRippleMatrixY = rain.rippleMesh.instanceMatrix.array[13];
    const clearedSplashMatrixY = rain.splashMesh.instanceMatrix.array[13];
    topo.settings.rainEnabled = true;
    applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
    const staleImpactVisible = rain.rippleData.some((value, index) => index % SONIC_RAIN_RIPPLE_STRIDE === 4 && value > 0)
      || rain.splashData.some((value, index) => index % SONIC_RAIN_SPLASH_STRIDE === 7 && value > 0);

    topo.uniforms.uIdleBreath.value = 0;
    topo.frameAudio.subBass = 0;
    topo.frameAudio.bass = 0;
    topo.frameAudio.lowFrequencyAmplitude = 0;
    topo.frameAudio.lowMid = 0;
    topo.frameAudio.mid = 0;
    topo.frameAudio.highMid = 0;
    topo.frameAudio.energy = 0;
    topo.frameAudio.lowFrequencyBands.fill(0);
    topo.lowFrequencySpectrumData.fill(0);
    for (let index = 0; index < topo.ripples.length; index += 1) {
      topo.ripples[index].isActive = 0;
    }
    const collisionTime = performance.now() / 1000;
    const flatCollisionHeight = sonicRainCollisionHeight(topo, 0, 0, collisionTime);
    const terrainRipple = topo.ripples[0];
    terrainRipple.pos.set(0, 0);
    terrainRipple.time = collisionTime;
    terrainRipple.strength = 0.5;
    terrainRipple.isActive = 1;
    terrainRipple.rippleType = 0;
    const rippledCollisionHeight = sonicRainCollisionHeight(topo, 0, 0, collisionTime);
    const terrainRippleHeightTracksGpu = Math.abs(
      rippledCollisionHeight - flatCollisionHeight - 2
    ) < 0.001;
    topo.settings.columnHeight = 1.35;
    topo.settings.groundMoundHeight = 2;
    topo.uniforms.uGroundEntrance.value = 1;
    topo.uniforms.uIdleBreath.value = 0.14;
    topo.frameAudio.subBass = 1;
    topo.frameAudio.bass = 1;
    topo.frameAudio.lowFrequencyAmplitude = 1;
    topo.frameAudio.lowMid = 1;
    topo.frameAudio.mid = 1;
    topo.frameAudio.highMid = 1;
    topo.frameAudio.energy = 1;
    topo.frameAudio.smoothness = 1;
    topo.frameAudio.density = 1;
    topo.frameAudio.lowFrequencyBands.fill(1);
    topo.lowFrequencySpectrumData.fill(255);
    const ordinaryCollisionCeiling = sonicRainCollisionCeiling(topo, collisionTime);
    const centerCollisionCeiling = ordinaryCollisionCeiling
      + (SONIC_CENTER_COLUMN_MAX_LIFT + 1.05) * Math.min(topo.settings.columnHeight, 1.35);
    const centerCollisionHeight = sonicRainCollisionHeight(topo, 0, 0, collisionTime);
    const collisionCeilingCoversCenterColumn = centerCollisionCeiling >= centerCollisionHeight;
    let tallestOrdinaryCollisionHeight = 0;
    const centerCollisionRadius = SONIC_BASS_COLUMN_CLUSTER.radius
      + SONIC_BASS_COLUMN_CLUSTER.feather;
    const terrainGridHalf = Math.floor(SONIC_TOPOGRAPHY_GRID / 2);
    for (let gridX = -terrainGridHalf; gridX < terrainGridHalf; gridX += 1) {
      for (let gridZ = -terrainGridHalf; gridZ < terrainGridHalf; gridZ += 1) {
        if (gridX * gridX + gridZ * gridZ <= centerCollisionRadius * centerCollisionRadius + 0.5) continue;
        const worldX = gridX * SONIC_TOPOGRAPHY_SPACING;
        const worldZ = gridZ * SONIC_TOPOGRAPHY_SPACING;
        if (!sonicRainGroundSurfaceAt(worldX, worldZ)) continue;
        tallestOrdinaryCollisionHeight = Math.max(
          tallestOrdinaryCollisionHeight,
          sonicRainCollisionHeight(topo, worldX, worldZ, collisionTime)
        );
      }
    }
    const collisionCeilingCoversTerrainMounds = ordinaryCollisionCeiling
      >= tallestOrdinaryCollisionHeight;
    rain.activeDropCount = 1;
    rain.streakMesh.count = 1;
    rain.dropData[0] = 0;
    rain.dropData[1] = centerCollisionHeight + 0.08;
    rain.dropData[2] = 0;
    rain.dropData[3] = 1;
    rain.dropData[4] = 1;
    const impactSequenceBeforeCenterColumn = rain.impactSequence;
    updateSonicRain(topo, 1 / 60, collisionTime, 0.5);
    const centerColumnCaughtRain = rain.impactSequence > impactSequenceBeforeCenterColumn;
    for (let index = 0; index < topo.ripples.length; index += 1) {
      const worstRipple = topo.ripples[index];
      worstRipple.pos.set((index % 5 - 2) * 4, (Math.floor(index / 5) - 0.5) * 6);
      worstRipple.time = collisionTime;
      worstRipple.strength = 4;
      worstRipple.isActive = 1;
      worstRipple.rippleType = 0;
    }
    const collisionBenchmarkFrames = 30;
    const collisionBenchmarkDrops = SONIC_RAIN_QUALITY.streaks;
    let collisionBenchmarkChecksum = 0;
    const collisionBenchmarkStartedAt = performance.now();
    for (let frame = 0; frame < collisionBenchmarkFrames; frame += 1) {
      for (let index = 0; index < collisionBenchmarkDrops; index += 1) {
        const gridX = index % 31 - 15;
        const gridZ = Math.floor(index / 31) % 31 - 15;
        collisionBenchmarkChecksum += sonicRainCollisionHeight(
          topo,
          gridX * SONIC_TOPOGRAPHY_SPACING,
          gridZ * SONIC_TOPOGRAPHY_SPACING,
          collisionTime + frame / 60
        );
      }
    }
    const collisionSolveMsPerMaxFrame = (
      performance.now() - collisionBenchmarkStartedAt
    ) / collisionBenchmarkFrames;

    const intensityInput = document.querySelector('#sonicRainIntensityRange');
    intensityInput.value = '63';
    intensityInput.dispatchEvent(new Event('input', { bubbles: true }));
    flushSonicSettingsPreferences();
    const stored = JSON.parse(localStorage.getItem(SONIC_SETTINGS_PREFS_KEY) || '{}');
    const sharedTerrainSeeds = topo.terrainSeedAttribute?.normalized === true
      && topo.terrainSmallLocalAttribute?.normalized === true
      && topo.terrainSeedAttribute.array instanceof Uint8Array
      && topo.terrainSmallLocalAttribute.array instanceof Uint8Array
      && topo.terrain.geometry.getAttribute('aTerrainSeed') === topo.terrainSeedAttribute
      && topo.terrain.geometry.getAttribute('aTerrainSmallLocal') === topo.terrainSmallLocalAttribute
      && topo.material.vertexShader.includes('float rnd = aTerrainSeed.x');
    const gl = topo.renderer.getContext();
    const glError = gl.getError();
    const programsRunnable = (topo.renderer.info.programs || []).every((program) => program.diagnostics?.runnable !== false);
    const beforeScene = topo.scene;
    disposeSonicTopography();
    const disposed = !state.sonicTopography.rain
      && !state.sonicTopography.renderer
      && beforeScene !== state.sonicTopography.scene;
    return {
      threeBatches: [rain.streakMesh, rain.rippleMesh, rain.splashMesh].every((mesh) => mesh.isInstancedMesh),
      defaultRainEnabled,
      defaultRainIntensity,
      defaultRainDropCount,
      defaultRainDrawingBuffer: [drawingBufferSize.x, drawingBufferSize.y],
      defaultRainPixelCoverage,
      defaultRainChangedPixels,
      defaultRainMeanRgbDelta,
      defaultRainPeakRgbDelta,
      streakGridMaskWired:
        rain.streakMaterial.uniforms.uGroundSpacing.value === SONIC_TOPOGRAPHY_SPACING
          && rain.streakMaterial.uniforms.uGroundHalfCell.value === SONIC_TOPOGRAPHY_SIZE * 0.5
          && rain.streakMaterial.fragmentShader.includes('if (groundCellMask <= 0.001) discard'),
      sharedTerrainSeeds,
      activeDropCount: rain.activeDropCount,
      activeRipples,
      activeSplashes,
      resetDropsOnRenderedGround,
      centerGroundAccepted,
      cellGapRejected,
      terrainEdgeRejected,
      tallTerrainRippleCaughtRain,
      terrainWetUniformsWired,
      detachedWetPlaneAbsent,
      terrainRippleHeightTracksGpu,
      collisionCeilingCoversCenterColumn,
      collisionCeilingCoversTerrainMounds,
      centerColumnCaughtRain,
      collisionBenchmarkDrops,
      collisionBenchmarkChecksum,
      collisionSolveMsPerMaxFrame,
      rippleUsesQuad: rain.rippleMesh.geometry.type === 'PlaneGeometry',
      rippleUsesNormalBlending: rain.rippleMaterial.blending === window.THREE.NormalBlending,
      persistedIntensity: stored.rainIntensity,
      clearedRippleMatrixY,
      clearedSplashMatrixY,
      staleImpactVisible,
      glError,
      programsRunnable,
      disposed
    };
  })()`);

  // Reboot the same real app under the accessibility media query. The global
  // reducedMotion flag and rain pool sizes are fixed during script startup, so
  // changing the media feature without a navigation would be a false probe.
  await command('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-rain-reduced-motion` });
  await delay(2200);
  reducedMotionResult = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const boot = document.querySelector('#bootScreen');
    const bootButton = document.querySelector('#bootLogoButton');
    if (boot && !boot.hidden && bootButton) {
      bootButton.disabled = false;
      bootButton.click();
      await wait(650);
    }
    if (typeof enterPresetPlaybackPage !== 'function') throw new Error('Preset entry helper is unavailable');
    enterPresetPlaybackPage('topography');
    requestOrbFrame();
    const startedAt = performance.now();
    while (!state.sonicTopography?.rain && performance.now() - startedAt < 10000) await wait(80);
    await wait(240);
    const topo = state.sonicTopography;
    const rain = topo?.rain;
    if (!rain || !topo.renderer) throw new Error('Reduced-motion Sonic rain renderer did not start');

    const mediaQueryMatches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const globalReducedMotion = reducedMotion === true;
    const rainEnabled = topo.settings.rainEnabled === true;
    const rainIntensity = topo.settings.rainIntensity;
    const activeDropCount = rain.activeDropCount;
    const quality = { ...SONIC_RAIN_QUALITY };
    const drawingBufferSize = topo.renderer.getDrawingBufferSize(new THREE.Vector2());
    const pixelCount = drawingBufferSize.x * drawingBufferSize.y;
    const readFrame = () => {
      topo.renderer.setRenderTarget(null);
      topo.renderer.render(topo.scene, topo.camera);
      const pixels = new Uint8Array(pixelCount * 4);
      const gl = topo.renderer.getContext();
      gl.readPixels(
        0,
        0,
        drawingBufferSize.x,
        drawingBufferSize.y,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      return pixels;
    };
    const rippleWasVisible = rain.rippleMesh.visible;
    const splashWasVisible = rain.splashMesh.visible;
    const streakWasVisible = rain.streakMesh.visible;
    rain.rippleMesh.visible = false;
    rain.splashMesh.visible = false;
    rain.streakMesh.visible = true;
    const rainOnPixels = readFrame();
    rain.streakMesh.visible = false;
    const rainOffPixels = readFrame();
    rain.streakMesh.visible = streakWasVisible;
    rain.rippleMesh.visible = rippleWasVisible;
    rain.splashMesh.visible = splashWasVisible;

    let changedPixels = 0;
    let totalRgbDelta = 0;
    let peakRgbDelta = 0;
    for (let offset = 0; offset < rainOnPixels.length; offset += 4) {
      const rgbDelta = Math.abs(rainOnPixels[offset] - rainOffPixels[offset])
        + Math.abs(rainOnPixels[offset + 1] - rainOffPixels[offset + 1])
        + Math.abs(rainOnPixels[offset + 2] - rainOffPixels[offset + 2]);
      if (rgbDelta < 9) continue;
      changedPixels += 1;
      totalRgbDelta += rgbDelta;
      peakRgbDelta = Math.max(peakRgbDelta, rgbDelta);
    }
    const pixelCoverage = changedPixels / Math.max(1, pixelCount);
    const meanRgbDelta = totalRgbDelta / Math.max(1, changedPixels);

    let dropsStayInsideTerrainFootprint = true;
    for (let index = 0; index < activeDropCount; index += 1) {
      const offset = index * SONIC_RAIN_DROP_STRIDE;
      const x = rain.dropData[offset];
      const z = rain.dropData[offset + 2];
      if (!sonicRainGroundFootprintAt(x, z)) {
        dropsStayInsideTerrainFootprint = false;
        break;
      }
    }
    const groundMaskWired = rain.streakMaterial.uniforms.uGroundSpacing.value === SONIC_TOPOGRAPHY_SPACING
      && rain.streakMaterial.uniforms.uGroundHalfCell.value === SONIC_TOPOGRAPHY_SIZE * 0.5
      && rain.streakMaterial.fragmentShader.includes('if (groundCellMask <= 0.001) discard');
    const centerGroundAccepted = sonicRainGroundSurfaceAt(0, 0)
      && sonicRainGroundVisibleAt(rain, 0, 1, 0);
    const cellGapRejected = !sonicRainGroundSurfaceAt(SONIC_TOPOGRAPHY_SIZE * 0.5 + 0.03, 0);
    const terrainEdgeRejected = !sonicRainGroundFootprintAt(rain.groundRadius + 1, 0);
    // Prove the shader mask in the framebuffer too: a single streak placed in
    // the transparent seam between two terrain columns must contribute zero
    // visible pixels even in the reduced-motion rendering branch.
    const savedFirstMatrix = new THREE.Matrix4();
    rain.streakMesh.getMatrixAt(0, savedFirstMatrix);
    const savedStreakCount = rain.streakMesh.count;
    const gapX = SONIC_TOPOGRAPHY_SPACING * 0.5;
    rain.dummy.position.set(gapX, 24, 0);
    rain.dummy.rotation.set(0, 0, 0);
    rain.dummy.scale.set(0.18 * topo.settings.rainWidth, 2.1 * topo.settings.rainLength, 0.18 * topo.settings.rainWidth);
    rain.dummy.updateMatrix();
    rain.streakMesh.setMatrixAt(0, rain.dummy.matrix);
    rain.streakMesh.instanceMatrix.needsUpdate = true;
    rain.streakMesh.count = 1;
    rain.streakMesh.visible = true;
    const gapRainOnPixels = readFrame();
    rain.streakMesh.visible = false;
    const gapRainOffPixels = readFrame();
    let gapChangedPixels = 0;
    for (let offset = 0; offset < gapRainOnPixels.length; offset += 4) {
      const rgbDelta = Math.abs(gapRainOnPixels[offset] - gapRainOffPixels[offset])
        + Math.abs(gapRainOnPixels[offset + 1] - gapRainOffPixels[offset + 1])
        + Math.abs(gapRainOnPixels[offset + 2] - gapRainOffPixels[offset + 2]);
      if (rgbDelta >= 9) gapChangedPixels += 1;
    }
    rain.streakMesh.setMatrixAt(0, savedFirstMatrix);
    rain.streakMesh.instanceMatrix.needsUpdate = true;
    rain.streakMesh.count = savedStreakCount;
    rain.streakMesh.visible = streakWasVisible;
    const gl = topo.renderer.getContext();
    const glError = gl.getError();
    const programsRunnable = (topo.renderer.info.programs || [])
      .every((program) => program.diagnostics?.runnable !== false);
    disposeSonicTopography();
    return {
      mediaQueryMatches,
      globalReducedMotion,
      rainEnabled,
      rainIntensity,
      activeDropCount,
      quality,
      drawingBuffer: [drawingBufferSize.x, drawingBufferSize.y],
      pixelCoverage,
      changedPixels,
      meanRgbDelta,
      peakRgbDelta,
      dropsStayInsideTerrainFootprint,
      groundMaskWired,
      centerGroundAccepted,
      cellGapRejected,
      terrainEdgeRejected,
      gapChangedPixels,
      splashDisabled: rain.splashMesh.visible === false,
      glError,
      programsRunnable
    };
  })()`);
} catch (error) {
  browserErrors.push(error instanceof Error ? error.message : String(error));
} finally {
  try { socket?.close(); } catch {}
  try { browser.kill(); } catch {}
  await new Promise((resolve) => server.close(resolve));
  await delay(120);
  const resolvedProfile = path.resolve(profile);
  const resolvedTemp = path.resolve(root, '.tmp');
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) {
    try { rmSync(resolvedProfile, { recursive: true, force: true }); } catch {}
  }
}

const checks = {
  rendererStartedWithoutBrowserErrors: browserErrors.length === 0 && !!result,
  allRainLayersCompiled: result?.programsRunnable === true && result?.glError === 0,
  threeGpuBatchesAreInstanced: result?.threeBatches === true,
  defaultViewProducesPerceptibleRainPixels:
    result?.defaultRainEnabled === true
      && result?.defaultRainIntensity >= 0.7
      && result?.defaultRainDropCount > 0
      && result?.defaultRainPixelCoverage >= 0.002
      && result?.defaultRainMeanRgbDelta >= 18
      && result?.defaultRainPeakRgbDelta >= 60,
  reducedMotionViewStillProducesPerceptibleRainPixels:
    reducedMotionResult?.mediaQueryMatches === true
      && reducedMotionResult?.globalReducedMotion === true
      && reducedMotionResult?.rainEnabled === true
      && reducedMotionResult?.rainIntensity >= 0.7
      && reducedMotionResult?.activeDropCount > 0
      && reducedMotionResult?.quality?.streaks === 160
      && reducedMotionResult?.pixelCoverage >= 0.00025
      && reducedMotionResult?.meanRgbDelta >= 18
      && reducedMotionResult?.peakRgbDelta >= 60,
  reducedMotionRainKeepsTerrainMaskAndDropsOnGround:
    reducedMotionResult?.groundMaskWired === true
      && reducedMotionResult?.dropsStayInsideTerrainFootprint === true
      && reducedMotionResult?.centerGroundAccepted === true
      && reducedMotionResult?.cellGapRejected === true
      && reducedMotionResult?.terrainEdgeRejected === true
      && reducedMotionResult?.gapChangedPixels === 0,
  reducedMotionKeepsGpuProgramsHealthyAndDisablesSplashes:
    reducedMotionResult?.programsRunnable === true
      && reducedMotionResult?.glError === 0
      && reducedMotionResult?.splashDisabled === true,
  streakShaderRejectsTerrainCellGaps: result?.streakGridMaskWired === true,
  collisionAndGpuUseSharedQuantizedSeeds: result?.sharedTerrainSeeds === true,
  onlyGroundBoundDropProducedPooledImpacts: result?.activeRipples === 1 && result?.activeSplashes > 0,
  resetRainStaysOnVisibleTerrain:
    result?.resetDropsOnRenderedGround === true
      && result?.centerGroundAccepted === true
      && result?.cellGapRejected === true
      && result?.terrainEdgeRejected === true,
  tallInteractiveTerrainCatchesRainBeforeY8: result?.tallTerrainRippleCaughtRain === true,
  wetOpticsUseTerrainWithoutDetachedVoidPlane:
    result?.terrainWetUniformsWired === true && result?.detachedWetPlaneAbsent === true,
  collisionHeightTracksGpuTerrainRipple: result?.terrainRippleHeightTracksGpu === true,
  collisionGateCoversCenterColumnsAndTerrainMounds:
    result?.collisionCeilingCoversCenterColumn === true
      && result?.collisionCeilingCoversTerrainMounds === true
      && result?.centerColumnCaughtRain === true,
  collisionHeightMaxPoolCpuBudget:
    result?.collisionBenchmarkDrops > 0
      && result?.collisionBenchmarkChecksum > 0
      && result?.collisionSolveMsPerMaxFrame < 8,
  realisticRippleShaderUsesBoundedQuadAndNormalBlend:
    result?.rippleUsesQuad === true && result?.rippleUsesNormalBlending === true,
  settingPersisted: Math.abs((result?.persistedIntensity ?? -1) - 0.63) < 0.001,
  offOnClearedOldInstances:
    result?.staleImpactVisible === false
      && result?.clearedRippleMatrixY < -900
      && result?.clearedSplashMatrixY < -900,
  sceneTeardownReleasedRainOwner: result?.disposed === true
};
const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  skipped: false,
  checks,
  failures,
  browserErrors,
  runtime: result,
  reducedMotionRuntime: reducedMotionResult
}, null, 2));
if (failures.length) process.exitCode = 1;
