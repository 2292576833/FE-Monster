import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const appSource = readFileSync(path.join(webRoot, 'app.js'), 'utf8');
const LOW_FREQUENCY_BAND_COUNT = 512;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `fe-monster-sonic-center-disorder-${process.pid}`);
const debugPort = 23000 + Math.floor(Math.random() * 5000);
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

const probeExpression = `(async () => {
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
  if (!topo?.renderer || !topo.terrain || !topo.bassColumnBandAttribute || !topo.terrainSeedAttribute) {
    throw new Error('Sonic center-column runtime did not start');
  }

  const originalSonicSettings = { ...topo.settings };
  if (state.orb.animationFrame) cancelAnimationFrame(state.orb.animationFrame);
  state.orb.animationFrame = -1;
  state.playbackVisual.dragging = true;
  topo.settings.groundMoundsEnabled = false;
  topo.settings.rainEnabled = false;
  topo.settings.starfieldEnabled = false;
  topo.settings.galaxyEnabled = false;
  topo.settings.fountainEnabled = false;
  topo.settings.atmosphereEnabled = false;
  topo.settings.columnHeight = 1;
  applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
  topo.uniforms.uGroundEntrance.value = 1;
  topo.uniforms.uIdleBreath.value = 0;
  topo.uniforms.uAudioPulse.value = 0;
  for (const ripple of topo.ripples || []) ripple.isActive = 0;

  const matrix = topo.terrain.instanceMatrix.array;
  const bands = topo.bassColumnBandAttribute.array;
  const columns = [];
  const byGrid = new Map();
  for (let index = 0; index < topo.terrain.count; index += 1) {
    const offset = index * 16;
    const x = matrix[offset + 12];
    const z = matrix[offset + 14];
    const gridX = Math.round(x / SONIC_TOPOGRAPHY_SPACING);
    const gridZ = Math.round(z / SONIC_TOPOGRAPHY_SPACING);
    const radiusSquared = gridX * gridX + gridZ * gridZ;
    if (radiusSquared > SONIC_BASS_COLUMN_CLUSTER.radius ** 2) continue;
    const column = { index, x, z, gridX, gridZ, radiusSquared, radius: Math.sqrt(radiusSquared), band: Math.round(bands[index]) };
    columns.push(column);
    byGrid.set(gridX + ',' + gridZ, column);
  }

  const adjacentBandDeltas = [];
  for (const column of columns) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const neighbor = byGrid.get((column.gridX + dx) + ',' + (column.gridZ + dz));
      if (neighbor) adjacentBandDeltas.push(Math.abs(column.band - neighbor.band));
    }
  }
  adjacentBandDeltas.sort((left, right) => left - right);
  const percentile = (values, ratio) => values.length
    ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))]
    : 0;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const pearson = (left, right) => {
    const leftMean = mean(left);
    const rightMean = mean(right);
    let covariance = 0;
    let leftVariance = 0;
    let rightVariance = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftDelta = left[index] - leftMean;
      const rightDelta = right[index] - rightMean;
      covariance += leftDelta * rightDelta;
      leftVariance += leftDelta * leftDelta;
      rightVariance += rightDelta * rightDelta;
    }
    return covariance / Math.max(0.000001, Math.sqrt(leftVariance * rightVariance));
  };

  const audio = topo.frameAudio;
  const zeroAudio = () => {
    audio.lowFrequencyAmplitude = 0;
    audio.subBass = 0;
    audio.bass = 0;
    audio.lowMid = 0;
    audio.mid = 0;
    audio.highMid = 0;
    audio.energy = 0;
    audio.smoothness = 1;
    audio.density = 0;
    audio.lowFrequencyBands.fill(0);
    topo.lowFrequencySpectrumData.fill(0);
    topo.lowFrequencySpectrum.needsUpdate = true;
  };
  const sampleHeights = (timeSeconds) => columns.map((column) =>
    sonicRainCollisionHeight(topo, column.x, column.z, timeSeconds)
  );

  zeroAudio();
  const flatHeights = sampleHeights(42);
  audio.lowFrequencyBands.fill(1);
  topo.lowFrequencySpectrumData.fill(255);
  topo.lowFrequencySpectrum.needsUpdate = true;
  const uniformHeightsA = sampleHeights(42);
  const uniformHeightsB = sampleHeights(42);

  const ringHeightRatios = [];
  const ringBandCounts = [];
  const ringMap = new Map();
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column.radiusSquared < 5 || column.radiusSquared > 520) continue;
    if (!ringMap.has(column.radiusSquared)) ringMap.set(column.radiusSquared, []);
    ringMap.get(column.radiusSquared).push({
      height: uniformHeightsA[index] - 1,
      band: column.band
    });
  }
  for (const samples of ringMap.values()) {
    if (samples.length < 8) continue;
    const heights = samples.map((sample) => sample.height).sort((left, right) => left - right);
    ringHeightRatios.push(percentile(heights, 0.9) / Math.max(0.0001, percentile(heights, 0.1)));
    ringBandCounts.push(new Set(samples.map((sample) => sample.band)).size);
  }
  ringHeightRatios.sort((left, right) => left - right);
  ringBandCounts.sort((left, right) => left - right);

  zeroAudio();
  const baselineHeights = sampleHeights(43);
  const driveByBand = new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT);
  for (let band = 0; band < driveByBand.length; band += 1) {
    driveByBand[band] = ((band * 73 + 19) % SONIC_LOW_FREQUENCY_BAND_COUNT)
      / (SONIC_LOW_FREQUENCY_BAND_COUNT - 1);
    topo.lowFrequencySpectrumData[band] = Math.round(driveByBand[band] * 255);
    audio.lowFrequencyBands[band] = driveByBand[band];
  }
  topo.lowFrequencySpectrum.needsUpdate = true;
  const drivenHeights = sampleHeights(43);
  const drivenSpectrumData = new Uint8Array(topo.lowFrequencySpectrumData);
  audio.lowFrequencyBands.fill(1);
  topo.lowFrequencySpectrumData.fill(255);
  topo.lowFrequencySpectrum.needsUpdate = true;
  const fullBandHeights = sampleHeights(43);
  const bandTargets = [];
  const bandHeightDeltas = [];
  const normalizedBandHeightDeltas = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (columns[index].gridX === 0 && columns[index].gridZ === 0) continue;
    bandTargets.push(drivenSpectrumData[columns[index].band] / 255);
    const heightDelta = drivenHeights[index] - baselineHeights[index];
    const fullHeightDelta = fullBandHeights[index] - baselineHeights[index];
    bandHeightDeltas.push(heightDelta);
    // Core amplification intentionally gives each radius a different dynamic
    // range. Normalize against that column's own full-band response so this
    // check measures frequency independence rather than radial gain equality.
    normalizedBandHeightDeltas.push(heightDelta / Math.max(0.000001, fullHeightDelta));
  }

  const zoneHeights = { core: [], middle: [], outer: [] };
  for (let index = 0; index < columns.length; index += 1) {
    const height = uniformHeightsA[index] - 1;
    const radius = columns[index].radius;
    if (radius <= 4) zoneHeights.core.push(height);
    else if (radius >= 10 && radius <= 14) zoneHeights.middle.push(height);
    else if (radius >= 21 && radius <= 24) zoneHeights.outer.push(height);
  }
  const zoneMeans = {
    core: mean(zoneHeights.core),
    middle: mean(zoneHeights.middle),
    outer: mean(zoneHeights.outer)
  };

  const directDrawCalls = () => {
    topo.renderer.info.reset();
    topo.renderer.setRenderTarget(null);
    topo.renderer.render(topo.scene, topo.camera);
    return topo.renderer.info.render.calls;
  };
  zeroAudio();
  const flatDrawCalls = directDrawCalls();
  audio.lowFrequencyBands.fill(1);
  topo.lowFrequencySpectrumData.fill(255);
  topo.lowFrequencySpectrum.needsUpdate = true;
  const drivenDrawCalls = directDrawCalls();
  let instancedMeshCount = 0;
  let extraCenterMeshCount = 0;
  topo.scene.traverse((object) => {
    if (object.isInstancedMesh) instancedMeshCount += 1;
    if (object !== topo.terrain && /(?:center|bass).*(?:column|pillar)|(?:column|pillar).*(?:center|bass)/i.test(object.name || '')) {
      extraCenterMeshCount += 1;
    }
  });

  zeroAudio();
  const originalClock = isPlaybackClockRunning;
  let forcedClockRunning = true;
  isPlaybackClockRunning = () => forcedClockRunning;
  let mediaSource = location.origin + '/qa-audio/source-a.mp3';
  let mediaPaused = false;
  let mediaEnded = false;
  Object.defineProperties(els.audio, {
    src: {
      configurable: true,
      get: () => mediaSource,
      set: (value) => { mediaSource = String(value || ''); }
    },
    currentSrc: { configurable: true, get: () => mediaSource },
    paused: { configurable: true, get: () => mediaPaused },
    ended: { configurable: true, get: () => mediaEnded }
  });
  state.audioAnalysis.live = false;
  state.visual.lowFrequencyAmplitude = 0;
  state.visual.subBass = 0;
  state.visual.bass = 0;
  state.visual.lowMid = 0;
  state.visual.mid = 0;
  state.visual.highMid = 0;
  state.visual.energy = 0;
  state.visual.beat = 0;
  state.visual.fluxPulse = 0;
  state.visual.fluxMeteor = 0;
  state.visual.lowFrequencyBands.fill(1);
  const smoothingBand = 317;
  const attackSequence = [];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    topo.lastMotionAt = performance.now() - 16;
    updateSonicTopographyMotion();
    attackSequence.push(topo.lowFrequencySpectrumData[smoothingBand]);
  }
  state.visual.lowFrequencyBands.fill(0);
  const releaseSequence = [];
  for (let iteration = 0; iteration < 8; iteration += 1) {
    topo.lastMotionAt = performance.now() - 16;
    updateSonicTopographyMotion();
    releaseSequence.push(topo.lowFrequencySpectrumData[smoothingBand]);
  }

  const stepMotion = () => {
    topo.lastMotionAt = performance.now() - 16;
    updateSonicTopographyMotion();
  };
  const armPlayingSource = (source = location.origin + '/qa-audio/source-a.mp3') => {
    mediaSource = source;
    mediaPaused = false;
    mediaEnded = false;
    forcedClockRunning = true;
    state.visual.lowFrequencyBands.fill(1);
    for (let iteration = 0; iteration < 8; iteration += 1) stepMotion();
  };
  const heightUniformValues = () => [
    topo.uniforms.uLowFrequencyAmplitude.value,
    topo.uniforms.uSubBass.value,
    topo.uniforms.uBass.value,
    topo.uniforms.uLowMid.value,
    topo.uniforms.uMid.value,
    topo.uniforms.uHighMid.value,
    topo.uniforms.uEnergy.value,
    topo.uniforms.uAudioPulse.value,
    topo.uniforms.uIdleBreath.value
  ];
  const maximumAbsoluteDifference = (left, right) => {
    let maximum = 0;
    for (let index = 0; index < left.length; index += 1) {
      maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
    }
    return maximum;
  };
  const clearedAudioState = () => ({
    spectrumMaximum: Math.max(...topo.lowFrequencySpectrumData),
    frameBandMaximum: Math.max(...topo.frameAudio.lowFrequencyBands),
    uniformMaximum: Math.max(
      topo.uniforms.uLowFrequencyAmplitude.value,
      topo.uniforms.uSubBass.value,
      topo.uniforms.uBass.value,
      topo.uniforms.uLowMid.value,
      topo.uniforms.uMid.value,
      topo.uniforms.uHighMid.value,
      topo.uniforms.uAudioPulse.value
    )
  });

  // Pausing the same source must preserve the exact last audio-driven terrain
  // state. The sample time is fixed so this specifically measures the frozen
  // column envelope rather than unrelated atmosphere/scene clock motion.
  armPlayingSource();
  const pauseSpectrumBefore = new Uint8Array(topo.lowFrequencySpectrumData);
  const pauseFrameBandsBefore = new Float32Array(topo.frameAudio.lowFrequencyBands);
  const pauseUniformsBefore = heightUniformValues();
  const pauseHeightSampleTime = 47.25;
  const pauseHeightsBefore = sampleHeights(pauseHeightSampleTime);
  const pausedRetainedBandBefore = topo.lowFrequencySpectrumData[smoothingBand];
  mediaPaused = true;
  forcedClockRunning = false;
  stepMotion();
  const pauseHeightsAfter = sampleHeights(pauseHeightSampleTime);
  const pauseSpectrumMaximumError = maximumAbsoluteDifference(
    pauseSpectrumBefore,
    topo.lowFrequencySpectrumData
  );
  const pauseFrameBandMaximumError = maximumAbsoluteDifference(
    pauseFrameBandsBefore,
    topo.frameAudio.lowFrequencyBands
  );
  const pauseUniformMaximumError = maximumAbsoluteDifference(
    pauseUniformsBefore,
    heightUniformValues()
  );
  const pauseHeightMaximumError = maximumAbsoluteDifference(
    pauseHeightsBefore,
    pauseHeightsAfter
  );

  // Ended, changed and absent sources are terminal/discontinuous states, so
  // each must clear the frozen audio envelope instead of carrying it forward.
  mediaEnded = true;
  stepMotion();
  const endedClearState = clearedAudioState();

  armPlayingSource(location.origin + '/qa-audio/source-a.mp3');
  mediaSource = location.origin + '/qa-audio/source-b.mp3';
  mediaPaused = true;
  forcedClockRunning = false;
  stepMotion();
  const changedSourceClearState = clearedAudioState();

  armPlayingSource(location.origin + '/qa-audio/source-a.mp3');
  mediaSource = '';
  mediaPaused = true;
  forcedClockRunning = false;
  stepMotion();
  const absentSourceClearState = clearedAudioState();

  // A live analyser can briefly report an all-zero band array while the
  // bridge/scalar low-frequency envelope is still healthy. That must not
  // strand 511/512 Sonic columns at zero until the analyser reconnects.
  zeroAudio();
  audio.lowFrequencyBandTargets.fill(0);
  mediaSource = location.origin + '/qa-audio/source-a.mp3';
  mediaPaused = false;
  mediaEnded = false;
  forcedClockRunning = true;
  state.audioAnalysis.live = true;
  state.audioAnalysis.lowFrequencyAmplitude = 0.9;
  state.audioAnalysis.subBass = 0.84;
  state.audioAnalysis.bass = 0.8;
  state.audioAnalysis.energy = 0.82;
  state.audioAnalysis.lowFrequencyBands.fill(0);
  state.visual.lowFrequencyAmplitude = 0.9;
  state.visual.subBass = 0.84;
  state.visual.bass = 0.8;
  state.visual.energy = 0.82;
  state.visual.lowFrequencyBands.fill(0.88);
  for (let iteration = 0; iteration < 8; iteration += 1) stepMotion();
  const analyserDropoutFallback = {
    spectrumMinimum: Math.min(...topo.lowFrequencySpectrumData),
    spectrumMaximum: Math.max(...topo.lowFrequencySpectrumData),
    activeBandRatio: topo.lowFrequencySpectrumData.filter((value) => value >= 24).length
      / topo.lowFrequencySpectrumData.length,
    targetBandMinimum: Math.min(...audio.lowFrequencyBandTargets),
    targetBandMaximum: Math.max(...audio.lowFrequencyBandTargets)
  };
  state.audioAnalysis.live = false;

  // Exercise the production terrain shader itself under a frozen camera and
  // clock. Reading alpha as well as RGB distinguishes a black material flash
  // from a missing/zero-scale column, while consecutive-frame comparison
  // catches a one-frame collapse during the low-frequency attack.
  const savedVisibility = new Map();
  topo.scene.traverse((object) => savedVisibility.set(object, object.visible));
  const restoreSonicVisibility = () => {
    savedVisibility.forEach((visible, object) => { object.visible = visible; });
  };
  const setTerrainOnlyVisibility = () => {
    topo.scene.traverse((object) => {
      if (object !== topo.scene) object.visible = false;
    });
    for (let owner = topo.terrain; owner; owner = owner.parent) owner.visible = true;
  };
  setTerrainOnlyVisibility();
  const renderer = topo.renderer;
  const gl = renderer.getContext();
  const savedClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const savedClearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  topo.camera.position.set(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  topo.camera.lookAt(0, SONIC_TOPOGRAPHY_CAMERA.targetY, 0);
  topo.camera.updateProjectionMatrix();
  topo.camera.updateMatrixWorld(true);
  topo.uniforms.uGroundMoundHeight.value = 0;
  topo.uniforms.uGroundEntrance.value = 1;
  topo.uniforms.uIdleBreath.value = 0;
  for (const ripple of topo.ripples || []) ripple.isActive = 0;
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const framebufferWidth = drawingBuffer.x;
  const framebufferHeight = drawingBuffer.y;
  const framebufferPixelCount = framebufferWidth * framebufferHeight;
  const probeRadius = (SONIC_BASS_COLUMN_CLUSTER.radius + SONIC_BASS_COLUMN_CLUSTER.feather)
    * SONIC_TOPOGRAPHY_SPACING;
  const projectedProbePoints = [];
  for (const x of [-probeRadius, probeRadius]) {
    for (const y of [0, SONIC_CENTER_COLUMN_MAX_LIFT + SONIC_CENTER_COLUMN_PEDESTAL_MAX_LIFT + 3]) {
      for (const z of [-probeRadius, probeRadius]) {
        const projected = new THREE.Vector3(x, y, z).project(topo.camera);
        projectedProbePoints.push({
          x: (projected.x * 0.5 + 0.5) * framebufferWidth,
          y: (projected.y * 0.5 + 0.5) * framebufferHeight
        });
      }
    }
  }
  const probeBounds = {
    left: Math.max(0, Math.floor(Math.min(...projectedProbePoints.map((point) => point.x)) - 12)),
    right: Math.min(framebufferWidth - 1, Math.ceil(Math.max(...projectedProbePoints.map((point) => point.x)) + 12)),
    bottom: Math.max(0, Math.floor(Math.min(...projectedProbePoints.map((point) => point.y)) - 12)),
    top: Math.min(framebufferHeight - 1, Math.ceil(Math.max(...projectedProbePoints.map((point) => point.y)) + 12))
  };
  const productionTerrainMaterial = topo.terrain.material;
  const columnMaskMaterial = productionTerrainMaterial.clone();
  columnMaskMaterial.fragmentShader = [
    'varying float vBassColumnBlend;',
    'void main() {',
    '  if (vBassColumnBlend < 0.5) discard;',
    '  gl_FragColor = vec4(1.0);',
    '}'
  ].join('\\n');
  columnMaskMaterial.transparent = false;
  columnMaskMaterial.depthWrite = true;
  columnMaskMaterial.toneMapped = false;
  const captureTerrainFrame = ({ label, level, inputLevel = level, phase = 'direct' }) => {
    while (gl.getError() !== gl.NO_ERROR) {}
    renderer.setRenderTarget(null);
    renderer.render(topo.scene, topo.camera);
    gl.finish();
    const pixels = new Uint8Array(framebufferPixelCount * 4);
    gl.readPixels(0, 0, framebufferWidth, framebufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    topo.terrain.material = columnMaskMaterial;
    renderer.render(topo.scene, topo.camera);
    gl.finish();
    const maskPixels = new Uint8Array(framebufferPixelCount * 4);
    gl.readPixels(0, 0, framebufferWidth, framebufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, maskPixels);
    topo.terrain.material = productionTerrainMaterial;
    let opaquePixels = 0;
    let darkOpaquePixels = 0;
    let luminanceTotal = 0;
    const opaqueLuminances = [];
    for (let y = probeBounds.bottom; y <= probeBounds.top; y += 1) {
      for (let x = probeBounds.left; x <= probeBounds.right; x += 1) {
        const offset = (y * framebufferWidth + x) * 4;
        if (pixels[offset + 3] < 96 || maskPixels[offset] < 128) continue;
        const luminance = pixels[offset] * 0.2126
          + pixels[offset + 1] * 0.7152
          + pixels[offset + 2] * 0.0722;
        opaquePixels += 1;
        luminanceTotal += luminance;
        opaqueLuminances.push(luminance);
        if (luminance <= 18) darkOpaquePixels += 1;
      }
    }
    opaqueLuminances.sort((left, right) => left - right);
    const luminancePercentile = (ratio) => opaqueLuminances.length
      ? opaqueLuminances[Math.min(
          opaqueLuminances.length - 1,
          Math.floor((opaqueLuminances.length - 1) * ratio)
        )]
      : 0;
    return {
      label,
      phase,
      level,
      inputLevel,
      pixels,
      maskPixels,
      opaquePixels,
      meanOpaqueLuminance: luminanceTotal / Math.max(1, opaquePixels),
      darkOpaqueRatio: darkOpaquePixels / Math.max(1, opaquePixels),
      p01OpaqueLuminance: luminancePercentile(0.01),
      p05OpaqueLuminance: luminancePercentile(0.05),
      centerHeight: sonicRainCollisionHeight(topo, 0, 0, 42),
      spectrumMinimum: Math.min(...topo.lowFrequencySpectrumData),
      spectrumMaximum: Math.max(...topo.lowFrequencySpectrumData),
      glError: gl.getError()
    };
  };
  const captureTerrainPulseFrame = (level) => {
    audio.lowFrequencyAmplitude = level;
    audio.subBass = level;
    audio.bass = level;
    audio.lowMid = 0;
    audio.mid = 0;
    audio.highMid = 0;
    audio.energy = level;
    audio.lowFrequencyBands.fill(level);
    topo.lowFrequencySpectrumData.fill(Math.round(level * 255));
    topo.lowFrequencySpectrum.needsUpdate = true;
    topo.uniforms.uLowFrequencyAmplitude.value = level;
    topo.uniforms.uSubBass.value = level;
    topo.uniforms.uBass.value = level;
    topo.uniforms.uLowMid.value = 0;
    topo.uniforms.uMid.value = 0;
    topo.uniforms.uHighMid.value = 0;
    topo.uniforms.uEnergy.value = level;
    topo.uniforms.uAudioPulse.value = level;
    topo.uniforms.uTime.value = 42;
    topo.uniforms.uAudioTime.value = 17;
    return captureTerrainFrame({ label: 'direct-' + level, level });
  };
  const pulseLevels = [0.08, 0.32, 0.62, 1, 0.62, 0.32, 0.08];
  const terrainPulseFrames = pulseLevels.map(captureTerrainPulseFrame);
  const compareTerrainFrames = (previous, current) => {
    let stableOpaquePixels = 0;
    let collapsedPixels = 0;
    for (let y = probeBounds.bottom; y <= probeBounds.top; y += 1) {
      for (let x = probeBounds.left; x <= probeBounds.right; x += 1) {
        const offset = (y * framebufferWidth + x) * 4;
        if (previous.pixels[offset + 3] < 96 || current.pixels[offset + 3] < 96
            || previous.maskPixels[offset] < 128 || current.maskPixels[offset] < 128) continue;
        const previousLuminance = previous.pixels[offset] * 0.2126
          + previous.pixels[offset + 1] * 0.7152
          + previous.pixels[offset + 2] * 0.0722;
        if (previousLuminance < 10) continue;
        const currentLuminance = current.pixels[offset] * 0.2126
          + current.pixels[offset + 1] * 0.7152
          + current.pixels[offset + 2] * 0.0722;
        stableOpaquePixels += 1;
        if (currentLuminance <= 4 || currentLuminance < previousLuminance * 0.22) {
          collapsedPixels += 1;
        }
      }
    }
    return {
      from: previous.label,
      to: current.label,
      phase: current.phase,
      inputFrom: previous.inputLevel,
      inputTo: current.inputLevel,
      collapseRatio: collapsedPixels / Math.max(1, stableOpaquePixels),
      meanLuminanceRatio: current.meanOpaqueLuminance
        / Math.max(0.001, previous.meanOpaqueLuminance),
      heightDelta: current.centerHeight - previous.centerHeight
    };
  };
  const pulseTransitions = [];
  for (let frameIndex = 1; frameIndex < terrainPulseFrames.length; frameIndex += 1) {
    const previous = terrainPulseFrames[frameIndex - 1];
    const current = terrainPulseFrames[frameIndex];
    pulseTransitions.push(compareTerrainFrames(previous, current));
  }

  // Drive the exact production motion update for repeated bass attacks. The
  // previous probe wrote uniforms directly, which could not catch a transient
  // introduced while CPU audio state is copied/smoothed into the shader.
  const setRuntimeAudioInput = ({ level, analyserZero = false, paused = false }) => {
    mediaSource = location.origin + '/qa-audio/source-a.mp3';
    mediaPaused = paused;
    mediaEnded = false;
    forcedClockRunning = !paused;
    state.audioAnalysis.live = true;
    for (const source of [state.audioAnalysis, state.visual]) {
      source.lowFrequencyAmplitude = level;
      source.subBass = level;
      source.bass = level;
      source.lowMid = level * 0.28;
      source.mid = level * 0.18;
      source.highMid = 0;
      source.energy = level;
      source.beat = level;
      source.fluxPulse = 0;
      source.fluxMeteor = 0;
    }
    state.audioAnalysis.lowFrequencyBands.fill(analyserZero ? 0 : level);
    state.visual.lowFrequencyBands.fill(level);
    stepMotion();
  };
  const runtimePulseFrames = [];
  const captureRuntimeFrame = (frame) => {
    setRuntimeAudioInput(frame);
    runtimePulseFrames.push(captureTerrainFrame({
      ...frame,
      inputLevel: frame.level,
      level: topo.uniforms.uLowFrequencyAmplitude.value
    }));
  };
  for (let index = 0; index < 8; index += 1) {
    setRuntimeAudioInput({ level: 0.08 });
  }
  runtimePulseFrames.push(captureTerrainFrame({
    label: 'runtime-baseline',
    phase: 'baseline',
    inputLevel: 0.08,
    level: topo.uniforms.uLowFrequencyAmplitude.value
  }));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const [step, level] of [0.32, 0.7, 1].entries()) {
      captureRuntimeFrame({ label: 'cycle-' + cycle + '-attack-' + step, phase: 'attack', level });
    }
    for (const [step, level] of [0.58, 0.24, 0.08, 0.08, 0.08].entries()) {
      captureRuntimeFrame({ label: 'cycle-' + cycle + '-release-' + step, phase: 'release', level });
    }
  }
  captureRuntimeFrame({ label: 'dropout-before', phase: 'steady', level: 0.82 });
  captureRuntimeFrame({ label: 'dropout-zero-band-frame', phase: 'dropout', level: 0.82, analyserZero: true });
  captureRuntimeFrame({ label: 'dropout-recovered', phase: 'recovery', level: 0.82 });
  captureRuntimeFrame({ label: 'pause-held-frame', phase: 'pause', level: 0.82, paused: true });
  captureRuntimeFrame({ label: 'resume-frame', phase: 'resume', level: 0.82 });
  const runtimePulseTransitions = [];
  for (let frameIndex = 1; frameIndex < runtimePulseFrames.length; frameIndex += 1) {
    runtimePulseTransitions.push(compareTerrainFrames(
      runtimePulseFrames[frameIndex - 1],
      runtimePulseFrames[frameIndex]
    ));
  }
  const runtimeAttackTransitions = runtimePulseTransitions.filter((transition) => transition.phase === 'attack');
  const runtimeDropoutTransition = runtimePulseTransitions.find((transition) => transition.phase === 'dropout');
  const runtimePauseTransition = runtimePulseTransitions.find((transition) => transition.phase === 'pause');
  const runtimeResumeTransition = runtimePulseTransitions.find((transition) => transition.phase === 'resume');
  const runtimeBlackFlashProbe = {
    frames: runtimePulseFrames.map(({ pixels, maskPixels, ...frame }) => frame),
    transitions: runtimePulseTransitions,
    attackCount: runtimeAttackTransitions.length,
    maximumAttackCollapseRatio: Math.max(...runtimeAttackTransitions.map((transition) => transition.collapseRatio)),
    minimumAttackLuminanceRatio: Math.min(...runtimeAttackTransitions.map((transition) => transition.meanLuminanceRatio)),
    minimumAttackHeightDelta: Math.min(...runtimeAttackTransitions.map((transition) => transition.heightDelta)),
    maximumDarkOpaqueRatio: Math.max(...runtimePulseFrames.map((frame) => frame.darkOpaqueRatio)),
    dropout: runtimeDropoutTransition,
    pause: runtimePauseTransition,
    resume: runtimeResumeTransition
  };

  // The isolated terrain probe above deliberately removes every transparent
  // overlay. Repeat the regression through the complete production scene so
  // a terrain/atmosphere/rain ordering fault cannot hide behind that setup.
  restoreSonicVisibility();
  Object.assign(topo.settings, originalSonicSettings);
  applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
  topo.uniforms.uGroundEntrance.value = 1;
  topo.groundEntranceProgress = 1;
  for (const ripple of topo.ripples || []) {
    ripple.isActive = 0;
    ripple.strength = 0;
    ripple.time = -100;
  }
  topo.audioPulse = 0;
  topo.lastBeat = 0;
  topo.pulseCooldown = 0;
  const fullSceneVisibility = new Map();
  topo.scene.traverse((object) => fullSceneVisibility.set(object, object.visible));
  const restoreFullSceneVisibility = () => {
    fullSceneVisibility.forEach((visible, object) => { object.visible = visible; });
  };
  const pixelLuminance = (pixels, offset) => pixels[offset] * 0.2126
    + pixels[offset + 1] * 0.7152
    + pixels[offset + 2] * 0.0722;
  const collectPixelStats = (pixels, bounds, maskPixels = null, stride = 1) => {
    let visiblePixels = 0;
    let darkPixels = 0;
    let luminanceTotal = 0;
    const luminances = [];
    for (let y = bounds.bottom; y <= bounds.top; y += stride) {
      for (let x = bounds.left; x <= bounds.right; x += stride) {
        const offset = (y * framebufferWidth + x) * 4;
        if (pixels[offset + 3] < 96 || (maskPixels && maskPixels[offset] < 128)) continue;
        const luminance = pixelLuminance(pixels, offset);
        visiblePixels += 1;
        luminanceTotal += luminance;
        luminances.push(luminance);
        if (luminance <= 18) darkPixels += 1;
      }
    }
    luminances.sort((left, right) => left - right);
    const samplePercentile = (ratio) => luminances.length
      ? luminances[Math.min(
          luminances.length - 1,
          Math.floor((luminances.length - 1) * ratio)
        )]
      : 0;
    return {
      visiblePixels,
      meanLuminance: luminanceTotal / Math.max(1, visiblePixels),
      darkRatio: darkPixels / Math.max(1, visiblePixels),
      p01Luminance: samplePercentile(0.01),
      p05Luminance: samplePercentile(0.05),
      p95Luminance: samplePercentile(0.95),
      p99Luminance: samplePercentile(0.99)
    };
  };
  const frameGeometryIsFinite = () => {
    const matrices = topo.terrain.instanceMatrix.array;
    const colors = topo.terrain.instanceColor?.array;
    let minimumScale = Infinity;
    let maximumScale = 0;
    let matricesFinite = true;
    for (let index = 0; index < topo.terrain.count; index += 1) {
      const offset = index * 16;
      const scaleX = Math.hypot(matrices[offset], matrices[offset + 1], matrices[offset + 2]);
      const scaleY = Math.hypot(matrices[offset + 4], matrices[offset + 5], matrices[offset + 6]);
      const scaleZ = Math.hypot(matrices[offset + 8], matrices[offset + 9], matrices[offset + 10]);
      minimumScale = Math.min(minimumScale, scaleX, scaleY, scaleZ);
      maximumScale = Math.max(maximumScale, scaleX, scaleY, scaleZ);
      if (![scaleX, scaleY, scaleZ, matrices[offset + 12], matrices[offset + 13], matrices[offset + 14]].every(Number.isFinite)) {
        matricesFinite = false;
        break;
      }
    }
    return {
      matricesFinite,
      colorsFinite: !colors || [...colors].every(Number.isFinite),
      minimumScale,
      maximumScale,
      matrixVersion: topo.terrain.instanceMatrix.version,
      colorVersion: topo.terrain.instanceColor?.version || 0
    };
  };
  const terrainUniformsAreFinite = () => Object.values(productionTerrainMaterial.uniforms || {})
    .every((uniform) => {
      const value = uniform?.value;
      if (typeof value === 'number') return Number.isFinite(value);
      if (value?.isColor) return [value.r, value.g, value.b].every(Number.isFinite);
      if (value?.isVector2) return [value.x, value.y].every(Number.isFinite);
      if (value?.isVector3) return [value.x, value.y, value.z].every(Number.isFinite);
      if (value?.isVector4) return [value.x, value.y, value.z, value.w].every(Number.isFinite);
      return true;
    });
  const fullFrameBounds = {
    left: 0,
    right: framebufferWidth - 1,
    bottom: 0,
    top: framebufferHeight - 1
  };
  const captureFullSonicFrame = ({ label, phase, inputLevel }) => {
    restoreFullSceneVisibility();
    while (gl.getError() !== gl.NO_ERROR) {}
    renderer.info.reset();
    renderer.setRenderTarget(null);
    renderer.render(topo.scene, topo.camera);
    const drawCalls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    gl.finish();
    const pixels = new Uint8Array(framebufferPixelCount * 4);
    gl.readPixels(0, 0, framebufferWidth, framebufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    setTerrainOnlyVisibility();
    topo.terrain.material = columnMaskMaterial;
    renderer.render(topo.scene, topo.camera);
    gl.finish();
    const maskPixels = new Uint8Array(framebufferPixelCount * 4);
    gl.readPixels(0, 0, framebufferWidth, framebufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, maskPixels);
    topo.terrain.material = productionTerrainMaterial;
    restoreFullSceneVisibility();

    return {
      label,
      phase,
      inputLevel,
      level: topo.uniforms.uLowFrequencyAmplitude.value,
      pixels,
      maskPixels,
      column: collectPixelStats(pixels, probeBounds, maskPixels),
      sceneCore: collectPixelStats(pixels, probeBounds),
      scene: collectPixelStats(pixels, fullFrameBounds, null, 2),
      centerHeight: sonicRainCollisionHeight(topo, 0, 0, 42),
      spectrumMinimum: Math.min(...topo.lowFrequencySpectrumData),
      spectrumMaximum: Math.max(...topo.lowFrequencySpectrumData),
      activeRippleCount: (topo.ripples || []).filter((ripple) => ripple.isActive > 0).length,
      audioPulse: topo.uniforms.uAudioPulse.value,
      atmosphereBass: topo.backgroundMaterial?.uniforms?.uAtmosphereBass?.value || 0,
      rainAudioLight: topo.uniforms.uRainAudioLight?.value || 0,
      drawCalls,
      triangles,
      materialTransparent: productionTerrainMaterial.transparent,
      materialDepthWrite: productionTerrainMaterial.depthWrite,
      materialDepthTest: productionTerrainMaterial.depthTest,
      materialBlending: productionTerrainMaterial.blending,
      materialOpacity: productionTerrainMaterial.opacity,
      terrainRenderOrder: topo.terrain.renderOrder,
      rendererSortObjects: renderer.sortObjects,
      rendererExposure: renderer.toneMappingExposure,
      uniformsFinite: terrainUniformsAreFinite(),
      geometry: frameGeometryIsFinite(),
      glError: gl.getError()
    };
  };
  const compareFullSonicFrames = (previous, current) => {
    const compareRegion = (bounds, maskRequired, stride = 1) => {
      let stablePixels = 0;
      let collapsedPixels = 0;
      let flashedPixels = 0;
      for (let y = bounds.bottom; y <= bounds.top; y += stride) {
        for (let x = bounds.left; x <= bounds.right; x += stride) {
          const offset = (y * framebufferWidth + x) * 4;
          if (previous.pixels[offset + 3] < 96 || current.pixels[offset + 3] < 96) continue;
          if (maskRequired && (previous.maskPixels[offset] < 128 || current.maskPixels[offset] < 128)) continue;
          const previousLuminance = pixelLuminance(previous.pixels, offset);
          if (previousLuminance < 10) continue;
          const currentLuminance = pixelLuminance(current.pixels, offset);
          stablePixels += 1;
          if (currentLuminance <= 4 || currentLuminance < previousLuminance * 0.22) collapsedPixels += 1;
          if (currentLuminance >= previousLuminance * 2.5 && currentLuminance - previousLuminance >= 60) flashedPixels += 1;
        }
      }
      return {
        stablePixels,
        collapseRatio: collapsedPixels / Math.max(1, stablePixels),
        flashRatio: flashedPixels / Math.max(1, stablePixels)
      };
    };
    return {
      from: previous.label,
      to: current.label,
      phase: current.phase,
      inputFrom: previous.inputLevel,
      inputTo: current.inputLevel,
      column: {
        ...compareRegion(probeBounds, true),
        meanLuminanceRatio: current.column.meanLuminance
          / Math.max(0.001, previous.column.meanLuminance),
        heightDelta: current.centerHeight - previous.centerHeight
      },
      sceneCore: {
        ...compareRegion(probeBounds, false, 2),
        meanLuminanceRatio: current.sceneCore.meanLuminance
          / Math.max(0.001, previous.sceneCore.meanLuminance)
      },
      scene: {
        ...compareRegion(fullFrameBounds, false, 4),
        meanLuminanceRatio: current.scene.meanLuminance
          / Math.max(0.001, previous.scene.meanLuminance)
      }
    };
  };
  const fullSceneFrameSummaries = [];
  const fullSceneTransitions = [];
  let previousFullSceneFrame = null;
  const recordFullSceneFrame = (frame) => {
    if (previousFullSceneFrame) {
      fullSceneTransitions.push(compareFullSonicFrames(previousFullSceneFrame, frame));
    }
    const { pixels, maskPixels, ...summary } = frame;
    fullSceneFrameSummaries.push(summary);
    previousFullSceneFrame = frame;
  };

  // Exercise the analyser-to-scene path, including its own smoothing and
  // derivative state. This is intentionally not a direct uniform mutation.
  const analysis = state.audioAnalysis;
  const savedNativeAudioActive = state.clientRuntime.nativeAudioActive;
  const savedXAudio2 = state.clientRuntime.settings.xAudio2;
  state.clientRuntime.nativeAudioActive = false;
  state.clientRuntime.settings.xAudio2 = false;
  const analyserBytes = new Uint8Array(2048);
  analysis.analyser = {
    context: { sampleRate: 48000 },
    getByteFrequencyData: (target) => target.set(analyserBytes.subarray(0, target.length))
  };
  analysis.data = new Uint8Array(analyserBytes.length);
  analysis.previousData = new Float32Array(analyserBytes.length);
  analysis.lowFrequencyLookupDataLength = 0;
  analysis.lowFrequencyLookupSampleRate = 0;
  analysis.lowFrequencyBands.fill(0);
  for (const key of [
    'lowFrequencyAmplitude', 'subBass', 'bass', 'lowMid', 'mid', 'highMid',
    'presence', 'brilliance', 'air', 'energy', 'warmth', 'brightness',
    'sharpness', 'density', 'spectralCentroid', 'fluxPulse', 'fluxMeteor', 'beat'
  ]) analysis[key] = 0;
  analysis.previousBass = 0;
  analysis.previousBrightness = 0;
  analysis.silenceFrames = 0;
  analysis.lastUpdateAt = 0;
  mediaSource = location.origin + '/qa-audio/source-a.mp3';
  mediaPaused = false;
  mediaEnded = false;
  forcedClockRunning = true;
  topo.audioTerrainSource = mediaSource;
  topo.wasAudioDriving = true;
  topo.audioTerrainTime = 0;
  zeroAudio();
  const driveAnalyserFrame = ({ byteLevel, label, phase, capture = true }) => {
    analyserBytes.fill(0);
    if (byteLevel > 0) {
      analyserBytes.fill(byteLevel, 0, 24);
      analyserBytes.fill(Math.round(byteLevel * 0.18), 24, 80);
    }
    analysis.lastUpdateAt = performance.now() - 16;
    updateAudioSpectrum();
    stepMotion();
    if (capture) {
      recordFullSceneFrame(captureFullSonicFrame({
        label,
        phase,
        inputLevel: byteLevel / 255
      }));
    }
  };
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (let settle = 0; settle < 18; settle += 1) {
      driveAnalyserFrame({ byteLevel: 0, label: '', phase: 'settle', capture: false });
    }
    driveAnalyserFrame({
      byteLevel: 0,
      label: 'full-cycle-' + cycle + '-released',
      phase: 'release-baseline'
    });
    driveAnalyserFrame({
      byteLevel: 96,
      label: 'full-cycle-' + cycle + '-attack-0',
      phase: 'attack'
    });
    driveAnalyserFrame({
      byteLevel: 184,
      label: 'full-cycle-' + cycle + '-attack-1',
      phase: 'attack'
    });
    driveAnalyserFrame({
      byteLevel: 255,
      label: 'full-cycle-' + cycle + '-attack-2',
      phase: 'attack'
    });
  }
  for (let settle = 0; settle < 8; settle += 1) {
    driveAnalyserFrame({ byteLevel: 224, label: '', phase: 'settle-high', capture: false });
  }
  driveAnalyserFrame({ byteLevel: 224, label: 'full-dropout-before', phase: 'steady' });
  driveAnalyserFrame({ byteLevel: 0, label: 'full-dropout-zero', phase: 'dropout' });
  driveAnalyserFrame({ byteLevel: 224, label: 'full-dropout-recovered', phase: 'recovery' });
  mediaPaused = true;
  forcedClockRunning = false;
  updateAudioSpectrum();
  stepMotion();
  recordFullSceneFrame(captureFullSonicFrame({
    label: 'full-pause-held',
    phase: 'pause',
    inputLevel: 224 / 255
  }));
  mediaPaused = false;
  forcedClockRunning = true;
  driveAnalyserFrame({ byteLevel: 224, label: 'full-resume', phase: 'resume' });

  const fullSceneAttackTransitions = fullSceneTransitions.filter((transition) => transition.phase === 'attack');
  const fullSceneDropoutTransition = fullSceneTransitions.find((transition) => transition.phase === 'dropout');
  const fullScenePauseTransition = fullSceneTransitions.find((transition) => transition.phase === 'pause');
  const fullSceneResumeTransition = fullSceneTransitions.find((transition) => transition.phase === 'resume');
  const fullSceneBlackFlashProbe = {
    frames: fullSceneFrameSummaries,
    transitions: fullSceneTransitions,
    attackCount: fullSceneAttackTransitions.length,
    maximumAttackColumnCollapseRatio: Math.max(...fullSceneAttackTransitions.map((transition) => transition.column.collapseRatio)),
    maximumAttackSceneCoreCollapseRatio: Math.max(...fullSceneAttackTransitions.map((transition) => transition.sceneCore.collapseRatio)),
    maximumAttackSceneCollapseRatio: Math.max(...fullSceneAttackTransitions.map((transition) => transition.scene.collapseRatio)),
    maximumAttackColumnFlashRatio: Math.max(...fullSceneAttackTransitions.map((transition) => transition.column.flashRatio)),
    minimumAttackColumnLuminanceRatio: Math.min(...fullSceneAttackTransitions.map((transition) => transition.column.meanLuminanceRatio)),
    minimumAttackSceneCoreLuminanceRatio: Math.min(...fullSceneAttackTransitions.map((transition) => transition.sceneCore.meanLuminanceRatio)),
    minimumAttackSceneLuminanceRatio: Math.min(...fullSceneAttackTransitions.map((transition) => transition.scene.meanLuminanceRatio)),
    maximumColumnDarkRatio: Math.max(...fullSceneFrameSummaries.map((frame) => frame.column.darkRatio)),
    dropout: fullSceneDropoutTransition,
    pause: fullScenePauseTransition,
    resume: fullSceneResumeTransition
  };
  state.clientRuntime.nativeAudioActive = savedNativeAudioActive;
  state.clientRuntime.settings.xAudio2 = savedXAudio2;
  const terrainMaterial = topo.terrain.material;
  const instanceMatrices = topo.terrain.instanceMatrix.array;
  let minimumInstanceScale = Infinity;
  let instanceMatricesFinite = true;
  for (let index = 0; index < topo.terrain.count; index += 1) {
    const offset = index * 16;
    const scaleX = Math.hypot(instanceMatrices[offset], instanceMatrices[offset + 1], instanceMatrices[offset + 2]);
    const scaleY = Math.hypot(instanceMatrices[offset + 4], instanceMatrices[offset + 5], instanceMatrices[offset + 6]);
    const scaleZ = Math.hypot(instanceMatrices[offset + 8], instanceMatrices[offset + 9], instanceMatrices[offset + 10]);
    minimumInstanceScale = Math.min(minimumInstanceScale, scaleX, scaleY, scaleZ);
    if (![scaleX, scaleY, scaleZ, instanceMatrices[offset + 12], instanceMatrices[offset + 13], instanceMatrices[offset + 14]].every(Number.isFinite)) {
      instanceMatricesFinite = false;
      break;
    }
  }
  const instanceColorsFinite = !topo.terrain.instanceColor
    || [...topo.terrain.instanceColor.array].every(Number.isFinite);
  const terrainBlackFlashProbe = {
    bounds: probeBounds,
    materialOpacity: terrainMaterial.opacity,
    materialTransparent: terrainMaterial.transparent,
    materialVisible: topo.terrain.visible,
    instanceColorPresent: !!topo.terrain.instanceColor,
    instanceColorsFinite,
    instanceMatricesFinite,
    minimumInstanceScale,
    rendererExposure: renderer.toneMappingExposure,
    frames: terrainPulseFrames.map(({ pixels, maskPixels, ...frame }) => frame),
    transitions: pulseTransitions,
    maximumDarkOpaqueRatio: Math.max(...terrainPulseFrames.map((frame) => frame.darkOpaqueRatio)),
    maximumCollapseRatio: Math.max(...pulseTransitions.map((transition) => transition.collapseRatio)),
    minimumAttackLuminanceRatio: Math.min(...pulseTransitions
      .filter((transition) => transition.to > transition.from)
      .map((transition) => transition.meanLuminanceRatio)),
    minimumAttackHeightDelta: Math.min(...pulseTransitions
      .filter((transition) => transition.to > transition.from)
      .map((transition) => transition.heightDelta))
  };
  columnMaskMaterial.dispose();
  restoreSonicVisibility();
  renderer.setClearColor(savedClearColor, savedClearAlpha);
  isPlaybackClockRunning = originalClock;

  const debugInfo = topo.renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const angleRenderer = debugInfo
    ? topo.renderer.getContext().getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : '';
  const result = {
    angleRenderer,
    webglVersion: topo.renderer.getContext().getParameter(topo.renderer.getContext().VERSION),
    glError: topo.renderer.getContext().getError(),
    programsRunnable: (topo.renderer.info.programs || []).every((program) => program.diagnostics?.runnable !== false),
    centerColumnCount: columns.length,
    terrainInstanceCount: topo.terrain.count,
    instancedMeshCount,
    extraCenterMeshCount,
    flatDrawCalls,
    drivenDrawCalls,
    bandRange: [Math.min(...columns.map((column) => column.band)), Math.max(...columns.map((column) => column.band))],
    adjacentPairCount: adjacentBandDeltas.length,
    adjacentBandMedianDelta: percentile(adjacentBandDeltas, 0.5),
    adjacentBandP75Delta: percentile(adjacentBandDeltas, 0.75),
    adjacentBandNearRatio: adjacentBandDeltas.filter((delta) => delta <= 4).length / Math.max(1, adjacentBandDeltas.length),
    adjacentBandBroadRatio: adjacentBandDeltas.filter((delta) => delta >= 32).length / Math.max(1, adjacentBandDeltas.length),
    sameRadiusRingCount: ringHeightRatios.length,
    sameRadiusMedianHighLowRatio: percentile(ringHeightRatios, 0.5),
    sameRadiusP25HighLowRatio: percentile(ringHeightRatios, 0.25),
    sameRadiusStrongDisorderRatio: ringHeightRatios.filter((ratio) => ratio >= 1.9).length / Math.max(1, ringHeightRatios.length),
    sameRadiusMedianUniqueBandCount: percentile(ringBandCounts, 0.5),
    deterministicHeightMaximumError: Math.max(...uniformHeightsA.map((height, index) => Math.abs(height - uniformHeightsB[index]))),
    differentBandHeightCorrelation: pearson(bandTargets, normalizedBandHeightDeltas),
    differentBandHeightDeltaRange: [Math.min(...bandHeightDeltas), Math.max(...bandHeightDeltas)],
    zoneMeans,
    attackSequence,
    releaseSequence,
    pausedRetainedBandBefore,
    pauseSpectrumMaximumError,
    pauseFrameBandMaximumError,
    pauseUniformMaximumError,
    pauseHeightMaximumError,
    endedClearState,
    changedSourceClearState,
    absentSourceClearState,
    analyserDropoutFallback,
    terrainBlackFlashProbe,
    runtimeBlackFlashProbe,
    fullSceneBlackFlashProbe
  };
  disposeSonicTopography();
  return result;
})()`;

let runtime = null;
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
  await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-center-column-disorder` });
  await delay(2200);
  runtime = await evaluate(probeExpression);
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

const monotonicIncrease = (values) => values.length >= 4
  && values[0] > 0
  && values[0] < 255
  && values.every((value, index) => index === 0 || value >= values[index - 1])
  && values.at(-1) > values[0];
const monotonicRelease = (values, attackEnd) => values.length >= 4
  && values[0] > 0
  && values[0] < attackEnd
  && values.every((value, index) => index === 0 || value <= values[index - 1])
  && values.at(-1) < values[0];
const audioStateIsCleared = (state) => !!state
  && state.spectrumMaximum === 0
  && state.frameBandMaximum === 0
  && state.uniformMaximum === 0;

const checks = {
  centerColumnMaterialKeepsOriginalPerColumnLighting:
    !/centerColumnHighlightShoulder/.test(appSource)
      && !/finalColor\s*\*=\s*mix\(\s*1\.0\s*,[^;]*vBassColumnBlend\s*\)/s.test(appSource),
  edgeCompletedWithoutBrowserErrors: browserErrors.length === 0 && !!runtime,
  actualDx11WebglRuntime: /Direct3D11|D3D11/i.test(runtime?.angleRenderer || '')
    && /WebGL 2/i.test(runtime?.webglVersion || '')
    && runtime?.glError === 0
    && runtime?.programsRunnable === true,
  existingTerrainRemainsTheOnlyCenterColumnOwner: runtime?.centerColumnCount === 1793
    && runtime?.terrainInstanceCount > runtime.centerColumnCount
    && runtime?.extraCenterMeshCount === 0,
  audioDriveAddsNoMeshOrDrawCall: runtime?.flatDrawCalls > 0
    && runtime?.drivenDrawCalls === runtime.flatDrawCalls,
  allLowFrequencyBandsRemainRepresented: runtime?.bandRange?.[0] === 0
    && runtime?.bandRange?.[1] === LOW_FREQUENCY_BAND_COUNT - 1,
  neighboringColumnsUseDecorrelatedBands: runtime?.adjacentPairCount > 3000
    && runtime?.adjacentBandMedianDelta >= 12
    && runtime?.adjacentBandNearRatio <= 0.35
    && runtime?.adjacentBandBroadRatio >= 0.12,
  sameRadiusLayersHaveStrongDeterministicHighLowContrast: runtime?.sameRadiusRingCount >= 100
    && runtime?.sameRadiusMedianHighLowRatio >= 2.05
    && runtime?.sameRadiusP25HighLowRatio >= 1.75
    && runtime?.sameRadiusStrongDisorderRatio >= 0.6
    && runtime?.deterministicHeightMaximumError === 0,
  sameRadiusLayersStillUseSeveralFrequencyBands: runtime?.sameRadiusMedianUniqueBandCount >= 4,
  independentBandsActuallyDriveIndependentHeights: runtime?.differentBandHeightCorrelation >= 0.82
    && runtime?.differentBandHeightDeltaRange?.[0] <= 0.01
    && runtime?.differentBandHeightDeltaRange?.[1] >= 0.5,
  coreMiddleAndOuterLayersStayReadable: runtime?.zoneMeans?.core > runtime?.zoneMeans?.middle * 1.2
    && runtime?.zoneMeans?.middle > runtime?.zoneMeans?.outer * 1.2,
  attackAndReleaseStaySmooth: monotonicIncrease(runtime?.attackSequence || [])
    && monotonicRelease(runtime?.releaseSequence || [], runtime?.attackSequence?.at(-1) || 0),
  lowFrequencyAttackHasImmediateWeight: runtime?.attackSequence?.[0] >= 90
    && runtime?.attackSequence?.[2] >= 180,
  sameSourcePauseFreezesLastCenterColumnFrame: runtime?.pausedRetainedBandBefore > 0
    && runtime?.pauseSpectrumMaximumError === 0
    && runtime?.pauseFrameBandMaximumError <= 1e-7
    && runtime?.pauseUniformMaximumError <= 1e-7
    && runtime?.pauseHeightMaximumError <= 1e-6,
  endedSourceClearsFrozenCenterColumnDrive: audioStateIsCleared(runtime?.endedClearState),
  changedSourceClearsFrozenCenterColumnDrive: audioStateIsCleared(runtime?.changedSourceClearState),
  absentSourceClearsFrozenCenterColumnDrive: audioStateIsCleared(runtime?.absentSourceClearState),
  liveAnalyserDropoutFallsBackWithoutStoppingColumns:
    runtime?.analyserDropoutFallback?.activeBandRatio >= 0.95
      && runtime?.analyserDropoutFallback?.spectrumMinimum >= 96
      && runtime?.analyserDropoutFallback?.targetBandMinimum >= 0.75,
  terrainColumnStateStaysFiniteAndVisible:
    runtime?.terrainBlackFlashProbe?.materialOpacity === 1
      && runtime?.terrainBlackFlashProbe?.materialVisible === true
      && runtime?.terrainBlackFlashProbe?.instanceColorsFinite === true
      && runtime?.terrainBlackFlashProbe?.instanceMatricesFinite === true
      && runtime?.terrainBlackFlashProbe?.minimumInstanceScale >= 0.99
      && runtime?.terrainBlackFlashProbe?.rendererExposure > 0
      && runtime?.terrainBlackFlashProbe?.frames?.every((frame) => frame.glError === 0),
  lowFrequencyAttackNeverBlackensColumnBodies:
    runtime?.terrainBlackFlashProbe?.maximumDarkOpaqueRatio <= 0.01
      && runtime?.terrainBlackFlashProbe?.maximumCollapseRatio <= 0.03
      && runtime?.terrainBlackFlashProbe?.minimumAttackLuminanceRatio >= 1.03
      && runtime?.terrainBlackFlashProbe?.frames
        ?.filter((frame) => frame.level >= 0.32)
        .every((frame) => frame.p01OpaqueLuminance >= 22),
  everyLowFrequencyRiseMovesTheCenterColumn:
    runtime?.terrainBlackFlashProbe?.minimumAttackHeightDelta >= 2.8,
  repeatedProductionAttacksNeverBlackenOrCollapseColumns:
    runtime?.runtimeBlackFlashProbe?.attackCount === 9
      && runtime?.runtimeBlackFlashProbe?.maximumAttackCollapseRatio <= 0.03
      && runtime?.runtimeBlackFlashProbe?.minimumAttackLuminanceRatio >= 0.97
      && runtime?.runtimeBlackFlashProbe?.maximumDarkOpaqueRatio <= 0.01
      && runtime?.runtimeBlackFlashProbe?.frames?.every((frame) => frame.glError === 0)
      && runtime?.runtimeBlackFlashProbe?.frames
        ?.filter((frame) => frame.phase === 'attack')
        .every((frame) => frame.p01OpaqueLuminance >= 22),
  oneFrameAnalyserZeroDoesNotFlashOrStopColumns:
    runtime?.runtimeBlackFlashProbe?.dropout?.collapseRatio <= 0.03
      && runtime?.runtimeBlackFlashProbe?.dropout?.meanLuminanceRatio >= 0.95
      && runtime?.runtimeBlackFlashProbe?.dropout?.heightDelta >= 0,
  pauseResumeDoesNotFlashOrJump:
    runtime?.runtimeBlackFlashProbe?.pause?.collapseRatio <= 0.03
      && runtime?.runtimeBlackFlashProbe?.pause?.meanLuminanceRatio >= 0.95
      && runtime?.runtimeBlackFlashProbe?.resume?.collapseRatio <= 0.03
      && runtime?.runtimeBlackFlashProbe?.resume?.meanLuminanceRatio >= 0.95,
  completeSonicSceneUsesFiniteStableRenderState:
    runtime?.fullSceneBlackFlashProbe?.frames?.length >= 17
      && runtime?.fullSceneBlackFlashProbe?.frames?.every((frame) => (
        frame.glError === 0
        && frame.uniformsFinite === true
        && frame.geometry?.matricesFinite === true
        && frame.geometry?.colorsFinite === true
        && frame.geometry?.minimumScale >= 0.99
        && frame.materialOpacity === 1
        && frame.rendererExposure > 0
        && frame.drawCalls > 1
      )),
  repeatedAnalyserAttacksDoNotBlackenCompleteSonicScene:
    runtime?.fullSceneBlackFlashProbe?.attackCount === 9
      && runtime?.fullSceneBlackFlashProbe?.maximumAttackColumnCollapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.maximumAttackSceneCoreCollapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.maximumAttackSceneCollapseRatio <= 0.02
      && runtime?.fullSceneBlackFlashProbe?.minimumAttackColumnLuminanceRatio >= 0.94
      && runtime?.fullSceneBlackFlashProbe?.minimumAttackSceneCoreLuminanceRatio >= 0.94
      && runtime?.fullSceneBlackFlashProbe?.minimumAttackSceneLuminanceRatio >= 0.97,
  originalColumnLightingKeepsBrightRevealBounded:
    runtime?.fullSceneBlackFlashProbe?.attackCount === 9
      // Stronger vertical travel intentionally reveals more lit column area;
      // keep it below 2.2% while the independent black/collapse guards remain strict.
      && runtime?.fullSceneBlackFlashProbe?.maximumAttackColumnFlashRatio <= 0.022,
  completeSceneAnalyserDropoutDoesNotFlashOrStopColumns:
    runtime?.fullSceneBlackFlashProbe?.dropout?.column?.collapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.dropout?.column?.meanLuminanceRatio >= 0.94
      && runtime?.fullSceneBlackFlashProbe?.dropout?.sceneCore?.collapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.dropout?.scene?.collapseRatio <= 0.02,
  completeScenePauseResumeDoesNotFlashOrJump:
    runtime?.fullSceneBlackFlashProbe?.pause?.column?.collapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.pause?.column?.meanLuminanceRatio >= 0.94
      && runtime?.fullSceneBlackFlashProbe?.resume?.column?.collapseRatio <= 0.03
      && runtime?.fullSceneBlackFlashProbe?.resume?.column?.meanLuminanceRatio >= 0.94
  };

const failures = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  regressionCoversSonicColumnBlackFlashAndDropout: true,
  checks,
  failures,
  browserErrors,
  runtime,
  thresholds: {
    adjacentBandMedianDelta: 12,
    adjacentBandNearRatioMaximum: 0.35,
    adjacentBandBroadRatioMinimum: 0.12,
    sameRadiusMedianHighLowRatio: 2.05,
    sameRadiusP25HighLowRatio: 1.75,
    sameRadiusStrongDisorderRatio: 0.6,
    pauseSpectrumMaximumError: 0,
    pauseFrameBandMaximumError: 1e-7,
    pauseUniformMaximumError: 1e-7,
    pauseHeightMaximumError: 1e-6,
    attackFirstEncodedBandMinimum: 90,
    analyserDropoutActiveBandRatioMinimum: 0.95,
    columnBodyMaximumDarkOpaqueRatio: 0.01,
    columnBodyP01LuminanceMinimum: 22,
    minimumAttackHeightDelta: 2.8,
    repeatedAttackMinimumLuminanceRatio: 0.97,
    maximumAttackColumnFlashRatio: 0.022,
    oneFrameDropoutMinimumLuminanceRatio: 0.95,
    pauseResumeMinimumLuminanceRatio: 0.95
  }
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
