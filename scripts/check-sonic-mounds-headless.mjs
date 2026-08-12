import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `fe-monster-sonic-mounds-${process.pid}`);
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
    } catch {
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

const probeExpression = (label) => `(async () => {
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
  while (!state.sonicTopography?.renderer && performance.now() - startedAt < 10000) await wait(80);
  await wait(320);
  const topo = state.sonicTopography;
  if (!topo?.renderer || !topo.terrain || !topo.uniforms?.uGroundMoundHeight) {
    throw new Error('Sonic mound renderer did not start');
  }

  if (state.orb.animationFrame) cancelAnimationFrame(state.orb.animationFrame);
  state.orb.animationFrame = -1;
  const renderer = topo.renderer;
  const gl = renderer.getContext();
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const width = drawingBuffer.x;
  const height = drawingBuffer.y;
  const pixelCount = width * height;
  const defaultHeight = topo.settings.groundMoundHeight;
  const defaultEnabled = topo.settings.groundMoundsEnabled === true;
  topo.camera.position.set(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  topo.camera.fov = SONIC_TOPOGRAPHY_CAMERA.fov;
  topo.camera.aspect = width / Math.max(1, height);
  topo.camera.lookAt(0, SONIC_TOPOGRAPHY_CAMERA.targetY, 0);
  topo.camera.updateProjectionMatrix();
  topo.camera.updateMatrixWorld(true);
  topo.uniforms.uTime.value = 12.5;
  topo.uniforms.uGroundEntrance.value = 1;
  if (topo.uniforms.uIdleBreath) topo.uniforms.uIdleBreath.value = 0;
  if (topo.uniforms.uAudioPulse) topo.uniforms.uAudioPulse.value = 0;
  if (topo.uniforms.uSubBass) topo.uniforms.uSubBass.value = 0;
  if (topo.uniforms.uBass) topo.uniforms.uBass.value = 0;
  if (topo.uniforms.uLowMid) topo.uniforms.uLowMid.value = 0;
  if (topo.uniforms.uMid) topo.uniforms.uMid.value = 0;
  if (topo.uniforms.uHighMid) topo.uniforms.uHighMid.value = 0;
  if (topo.uniforms.uEnergy) topo.uniforms.uEnergy.value = 0;
  if (topo.lowFrequencySpectrumData) {
    topo.lowFrequencySpectrumData.fill(0);
    topo.lowFrequencySpectrum.needsUpdate = true;
  }
  for (const ripple of topo.ripples || []) ripple.isActive = 0;

  const cameraSignature = () => [
    ...topo.camera.position.toArray(),
    ...topo.camera.quaternion.toArray(),
    topo.camera.fov,
    topo.camera.aspect
  ].map((value) => Number(value.toFixed(8)));
  const scalarUniformSignature = () => Object.fromEntries(
    Object.entries(topo.uniforms)
      .filter(([name, uniform]) => name !== 'uGroundMoundHeight' && typeof uniform?.value === 'number')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, uniform]) => [name, Number(uniform.value.toFixed(8))])
  );
  const frozenCamera = cameraSignature();
  const frozenUniforms = scalarUniformSignature();
  while (gl.getError() !== gl.NO_ERROR) {}

  const capture = (moundHeight) => {
    topo.uniforms.uGroundMoundHeight.value = moundHeight;
    renderer.setRenderTarget(null);
    renderer.info.reset();
    renderer.render(topo.scene, topo.camera);
    gl.finish();
    const pixels = new Uint8Array(pixelCount * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return {
      pixels,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      glError: gl.getError()
    };
  };

  // Warm the production shader once, then compare the exact same camera and
  // frame in off -> on -> off order. The only changed value is this uniform.
  capture(0);
  const offA = capture(0);
  const on = capture(defaultHeight);
  const offB = capture(0);

  const diffFrames = (left, right, threshold = 12) => {
    let changedPixels = 0;
    let highDeltaPixels = 0;
    let totalRgbDelta = 0;
    let peakRgbDelta = 0;
    const terrainTiles = new Uint32Array(12);
    const horizontalBands = new Uint32Array(12);
    const columnMinimumY = new Int32Array(width);
    const columnMaximumY = new Int32Array(width);
    columnMinimumY.fill(height);
    columnMaximumY.fill(-1);
    for (let offset = 0, pixel = 0; offset < left.length; offset += 4, pixel += 1) {
      const rgbDelta = Math.abs(left[offset] - right[offset])
        + Math.abs(left[offset + 1] - right[offset + 1])
        + Math.abs(left[offset + 2] - right[offset + 2]);
      peakRgbDelta = Math.max(peakRgbDelta, rgbDelta);
      if (rgbDelta < threshold) continue;
      changedPixels += 1;
      totalRgbDelta += rgbDelta;
      if (rgbDelta >= 48) highDeltaPixels += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      columnMinimumY[x] = Math.min(columnMinimumY[x], y);
      columnMaximumY[x] = Math.max(columnMaximumY[x], y);
      if (y < height * 0.72) {
        const tileX = Math.min(3, Math.floor(x / width * 4));
        const tileY = Math.min(2, Math.floor(y / (height * 0.72) * 3));
        terrainTiles[tileY * 4 + tileX] += 1;
        horizontalBands[Math.min(11, Math.floor(x / width * 12))] += 1;
      }
    }
    const verticalSpans = [];
    for (let x = 0; x < width; x += 1) {
      if (columnMaximumY[x] >= columnMinimumY[x]) verticalSpans.push(columnMaximumY[x] - columnMinimumY[x] + 1);
    }
    verticalSpans.sort((a, b) => a - b);
    const percentile = (ratio) => verticalSpans[Math.min(verticalSpans.length - 1, Math.floor(verticalSpans.length * ratio))] || 0;
    const activeBandFlags = [...horizontalBands].map((count) => count >= 80);
    const firstActiveBand = activeBandFlags.indexOf(true);
    const lastActiveBand = activeBandFlags.lastIndexOf(true);
    const inactiveInteriorHorizontalBands = firstActiveBand < 0
      ? activeBandFlags.length
      : activeBandFlags.slice(firstActiveBand, lastActiveBand + 1).filter((active) => !active).length;
    return {
      changedPixels,
      pixelCoverage: changedPixels / Math.max(1, pixelCount),
      highDeltaPixels,
      highDeltaCoverage: highDeltaPixels / Math.max(1, pixelCount),
      meanRgbDelta: totalRgbDelta / Math.max(1, changedPixels),
      peakRgbDelta,
      activeTerrainTiles: [...terrainTiles].filter((count) => count >= 48).length,
      terrainTiles: [...terrainTiles],
      activeHorizontalBands: [...horizontalBands].filter((count) => count >= 80).length,
      inactiveInteriorHorizontalBands,
      horizontalBands: [...horizontalBands],
      medianVerticalSpan: percentile(0.5),
      p90VerticalSpan: percentile(0.9)
    };
  };

  const visibleCenterPatches = [];
  const onOffPixels = diffFrames(on.pixels, offA.pixels);
  for (const center of SONIC_GROUND_MOUND_CENTERS) {
    // The shader deliberately feathers the circular terrain edge. Keep this
    // framebuffer probe inside the fully rendered radius; world-grid coverage
    // below still validates the full fixed peak field through x/z = +/-60.
    if (Math.hypot(center.x, center.z) > 68) continue;
    const projected = new THREE.Vector3(center.x, 0, center.z).project(topo.camera);
    const px = Math.round((projected.x * 0.5 + 0.5) * width);
    const py = Math.round((projected.y * 0.5 + 0.5) * height);
    if (projected.z < -1 || projected.z > 1 || px < 18 || px >= width - 18 || py < 18 || py >= height - 18) continue;
    let changed = 0;
    let peak = 0;
    for (let y = py - 18; y <= py + 18; y += 1) {
      for (let x = px - 18; x <= px + 18; x += 1) {
        const offset = (y * width + x) * 4;
        const delta = Math.abs(on.pixels[offset] - offA.pixels[offset])
          + Math.abs(on.pixels[offset + 1] - offA.pixels[offset + 1])
          + Math.abs(on.pixels[offset + 2] - offA.pixels[offset + 2]);
        if (delta >= 12) changed += 1;
        peak = Math.max(peak, delta);
      }
    }
    visibleCenterPatches.push({ x: center.x, z: center.z, changed, peak });
  }

  const centers = SONIC_GROUND_MOUND_CENTERS.map((center) => ({ ...center }));
  const baseRadius = topo.settings.groundMoundRadius;
  const effectiveRadii = centers.map((center) => baseRadius * center.radiusScale);
  const overlappingNeighbors = centers.map((center, index) => {
    let nearestGap = Infinity;
    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (otherIndex === index) continue;
      const other = centers[otherIndex];
      const distance = Math.hypot(center.x - other.x, center.z - other.z);
      nearestGap = Math.min(nearestGap, distance - effectiveRadii[index] - effectiveRadii[otherIndex]);
    }
    return nearestGap;
  });
  const worldRegions = Array.from({ length: 9 }, (_, index) => ({
    id: String(index),
    samples: 0,
    covered: 0,
    strongMask: 0
  }));
  let worldSamples = 0;
  let worldCovered = 0;
  let worldStrongMask = 0;
  let maximumUncoveredDistance = 0;
  for (let z = -60; z <= 60; z += 3) {
    for (let x = -60; x <= 60; x += 3) {
      const regionX = Math.min(2, Math.floor((x + 60) / 40));
      const regionZ = Math.min(2, Math.floor((z + 60) / 40));
      const region = worldRegions[regionZ * 3 + regionX];
      const mask = sonicGroundMoundMaskAt(x, z, topo.settings);
      let signedDistance = Infinity;
      for (let index = 0; index < centers.length; index += 1) {
        signedDistance = Math.min(
          signedDistance,
          Math.hypot(x - centers[index].x, z - centers[index].z) - effectiveRadii[index]
        );
      }
      const covered = signedDistance <= 0;
      const strong = mask >= 0.22;
      worldSamples += 1;
      region.samples += 1;
      if (covered) {
        worldCovered += 1;
        region.covered += 1;
      } else {
        maximumUncoveredDistance = Math.max(maximumUncoveredDistance, signedDistance);
      }
      if (strong) {
        worldStrongMask += 1;
        region.strongMask += 1;
      }
    }
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const angleRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
  const programsRunnable = (renderer.info.programs || []).every((program) => program.diagnostics?.runnable !== false);
  const scalarUniformsStayedFrozen = JSON.stringify(frozenUniforms) === JSON.stringify(scalarUniformSignature());
  const cameraStayedFrozen = JSON.stringify(frozenCamera) === JSON.stringify(cameraSignature());
  const moundUniformRecovered = topo.uniforms.uGroundMoundHeight.value === 0;
  const visibleCenterHits = visibleCenterPatches.filter((patch) => patch.changed >= 18 && patch.peak >= 36);
  const weakVisibleCenters = visibleCenterPatches
    .filter((patch) => patch.changed < 18 || patch.peak < 36)
    .slice(0, 12);
  const result = {
    label: ${JSON.stringify(label)},
    reducedMotion: reducedMotion === true,
    mediaReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    defaultEnabled,
    defaultHeight,
    baseRadius,
    fixedPeakCount: centers.length,
    effectiveRadiusMinimum: Math.min(...effectiveRadii),
    effectiveRadiusMedian: [...effectiveRadii].sort((a, b) => a - b)[Math.floor(effectiveRadii.length / 2)],
    overlappingCenterRatio: overlappingNeighbors.filter((gap) => gap <= 0).length / Math.max(1, centers.length),
    largestNearestNeighborGap: Math.max(...overlappingNeighbors),
    worldPeakCoverage: worldCovered / Math.max(1, worldSamples),
    worldStrongMaskCoverage: worldStrongMask / Math.max(1, worldSamples),
    maximumUncoveredDistance,
    worldRegions: worldRegions.map((region) => ({
      id: region.id,
      peakCoverage: region.covered / Math.max(1, region.samples),
      strongMaskCoverage: region.strongMask / Math.max(1, region.samples)
    })),
    drawingBuffer: [width, height],
    onOff: onOffPixels,
    recovery: diffFrames(offA.pixels, offB.pixels, 3),
    visibleCenterCount: visibleCenterPatches.length,
    visibleCenterHitCount: visibleCenterHits.length,
    visibleCenterHitRatio: visibleCenterHits.length / Math.max(1, visibleCenterPatches.length),
    weakVisibleCenters,
    drawCalls: [offA.drawCalls, on.drawCalls, offB.drawCalls],
    triangles: [offA.triangles, on.triangles, offB.triangles],
    points: [offA.points, on.points, offB.points],
    lines: [offA.lines, on.lines, offB.lines],
    glErrors: [offA.glError, on.glError, offB.glError],
    programsRunnable,
    angleRenderer,
    webglVersion: gl.getParameter(gl.VERSION),
    scalarUniformsStayedFrozen,
    cameraStayedFrozen,
    moundUniformRecovered,
    terrainInstanceCount: topo.terrain.count
  };
  disposeSonicTopography();
  return result;
})()`;

let normal = null;
let reduced = null;
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
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-mounds-framebuffer` });
  await delay(2200);
  normal = await evaluate(probeExpression('default-motion'));

  await command('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-mounds-framebuffer-reduced` });
  await delay(2200);
  reduced = await evaluate(probeExpression('reduced-motion'));
} catch (error) {
  browserErrors.push(error instanceof Error ? error.message : String(error));
} finally {
  try { socket?.close(); } catch {
  }
  try { browser.kill(); } catch {
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(120);
  const resolvedProfile = path.resolve(profile);
  const resolvedTemp = path.resolve(root, '.tmp');
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) {
    try { rmSync(resolvedProfile, { recursive: true, force: true }); } catch {
    }
  }
}

const modeChecks = (runtime, expectReducedMotion) => ({
  rendererStarted: !!runtime,
  usesDx11Angle: /ANGLE/i.test(runtime?.angleRenderer || '') && /(?:D3D11|Direct3D11)/i.test(runtime?.angleRenderer || ''),
  requestedMotionModeLoaded:
    runtime?.reducedMotion === expectReducedMotion
      && runtime?.mediaReducedMotion === expectReducedMotion,
  defaultsExposeMounds: runtime?.defaultEnabled === true && runtime?.defaultHeight >= 1.25,
  frameDifferenceIsPerceptibleAndHigh:
    runtime?.onOff?.pixelCoverage >= 0.012
      && runtime?.onOff?.highDeltaCoverage >= 0.004
      && runtime?.onOff?.meanRgbDelta >= 24
      && runtime?.onOff?.peakRgbDelta >= 90,
  frameDifferenceCoversTheTerrainContinuously:
    runtime?.onOff?.activeTerrainTiles >= 10
      && runtime?.onOff?.activeHorizontalBands >= 10
      && runtime?.onOff?.inactiveInteriorHorizontalBands === 0
      && runtime?.onOff?.medianVerticalSpan >= 8
      && runtime?.onOff?.p90VerticalSpan >= 18,
  fixedPeakCentersReachTheFramebuffer:
    runtime?.visibleCenterCount >= 9 && runtime?.visibleCenterHitRatio >= 0.75,
  peaksAreLargeAndOverlapTheirNeighbors:
    runtime?.baseRadius >= 12
      && runtime?.effectiveRadiusMedian >= 11
      && runtime?.overlappingCenterRatio >= 0.9
      && runtime?.largestNearestNeighborGap <= 1,
  worldGridHasNoBroadMoundHoles:
    runtime?.worldPeakCoverage >= 0.78
      && runtime?.worldStrongMaskCoverage >= 0.72
      && runtime?.maximumUncoveredDistance <= 6
      && runtime?.worldRegions?.every((region) => (
        region.peakCoverage >= 0.58 && region.strongMaskCoverage >= 0.58
      )),
  offSwitchRecoversTheFrozenBaseline:
    runtime?.recovery?.changedPixels <= 32
      && runtime?.recovery?.pixelCoverage <= 0.00005
      && runtime?.recovery?.peakRgbDelta <= 6
      && runtime?.moundUniformRecovered === true,
  noExtraDrawsOrGpuErrors:
    runtime?.drawCalls?.every((value) => value === runtime.drawCalls[0])
      && runtime?.triangles?.every((value) => value === runtime.triangles[0])
      && runtime?.points?.every((value) => value === runtime.points[0])
      && runtime?.lines?.every((value) => value === runtime.lines[0])
      && runtime?.glErrors?.every((value) => value === 0)
      && runtime?.programsRunnable === true,
  comparisonChangedOnlyTheMoundUniform:
    runtime?.scalarUniformsStayedFrozen === true
      && runtime?.cameraStayedFrozen === true
});

const checks = {
  edgeCompletedWithoutBrowserErrors: browserErrors.length === 0 && !!normal && !!reduced,
  defaultMotion: modeChecks(normal, false),
  reducedMotion: modeChecks(reduced, true)
};
const failures = [];
if (!checks.edgeCompletedWithoutBrowserErrors) failures.push('edgeCompletedWithoutBrowserErrors');
for (const [mode, results] of [['defaultMotion', checks.defaultMotion], ['reducedMotion', checks.reducedMotion]]) {
  for (const [name, passed] of Object.entries(results)) {
    if (!passed) failures.push(`${mode}.${name}`);
  }
}

console.log(JSON.stringify({
  pass: failures.length === 0,
  skipped: false,
  checks,
  failures,
  browserErrors,
  runtime: {
    defaultMotion: normal,
    reducedMotion: reduced
  }
}, null, 2));
if (failures.length) process.exitCode = 1;
