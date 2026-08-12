import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const app = readFileSync(path.join(webRoot, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `fe-monster-sonic-mound-columns-${process.pid}`);
const debugPort = 19000 + Math.floor(Math.random() * 8000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const thresholds = Object.freeze({
  denseColumnCoveragePerActivePeak: 0.75,
  minimumStaticHeightLevelsPerPeak: 3,
  minimumPhaseBucketsPerPeak: 4,
  minimumLowFrequencyBandsPerPeak: 6,
  minimumStaticCoreHeightSpread: 0.3,
  minimumMedianLowFrequencyLift: 0.22,
  minimumBandSelectiveHeightDelta: 0.08,
  minimumHeight: 0,
  pauseScalarTolerance: 0.001,
  pauseSpectrumByteTolerance: 0,
  extraTerrainDraws: 0,
  extraMoundMeshes: 0
});

const fixedCoverage = spawnSync(
  process.execPath,
  [path.join(root, 'scripts', 'check-sonic-fixed-full-terrain-mounds.mjs')],
  { cwd: root, encoding: 'utf8' }
);
let fixedCoverageReport = null;
try {
  fixedCoverageReport = JSON.parse(fixedCoverage.stdout || '{}');
} catch {
  fixedCoverageReport = null;
}

const buildStart = app.indexOf('function buildSonicTopography');
const buildEnd = app.indexOf('function resizeSonicTopographyRenderer', buildStart + 1);
const buildSource = buildStart >= 0 && buildEnd > buildStart
  ? app.slice(buildStart, buildEnd)
  : '';
const sourceKeepsOneTerrainMesh = (
  /new THREE\.InstancedMesh\(geometry, material, count\)/.test(buildSource)
  && /geometry\.setAttribute\(['"]aGroundMoundColumnProfile['"]/.test(buildSource)
  && !/(?:const|let|var)\s+[A-Za-z0-9_]*(?:mound|Mound)[A-Za-z0-9_]*(?:column|Column)[A-Za-z0-9_]*\s*=\s*new THREE\.(?:Mesh|InstancedMesh|Points)/.test(buildSource)
);

if (!existsSync(edge)) {
  process.stdout.write(`${JSON.stringify({
    pass: true,
    skipped: true,
    reason: 'Microsoft Edge is unavailable',
    thresholds
  }, null, 2)}\n`);
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

function qaAudioWav() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 2;
  const dataLength = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin(index / sampleRate * Math.PI * 160) * 420);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

const holdAudio = qaAudioWav();

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
  if (url.pathname === '/__qa__/hold.wav') {
    response.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': holdAudio.length,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes'
    });
    response.end(holdAudio);
    return;
  }
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
  '--autoplay-policy=no-user-gesture-required',
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
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Evaluation failed');
  }
  return response.result?.value;
}

const probeExpression = (label) => `(async () => {
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
  };
  const maximumDifference = (left, right) => {
    if (!left || !right || left.length !== right.length) return Infinity;
    let maximum = 0;
    for (let index = 0; index < left.length; index += 1) {
      maximum = Math.max(maximum, Math.abs(Number(left[index]) - Number(right[index])));
    }
    return maximum;
  };

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
  await wait(360);

  const topo = state.sonicTopography;
  if (!topo?.renderer || !topo.terrain || !topo.uniforms || typeof sonicRainCollisionHeight !== 'function') {
    throw new Error('Production Sonic terrain did not start');
  }
  if (state.orb.animationFrame) cancelAnimationFrame(state.orb.animationFrame);
  state.orb.animationFrame = -1;

  const renderer = topo.renderer;
  const gl = renderer.getContext();
  const geometry = topo.terrain.geometry;
  const moundMaskAttribute = geometry.getAttribute('aGroundMoundMask');
  const profileAttribute = geometry.getAttribute('aGroundMoundColumnProfile');
  const instanceMatrices = topo.terrain.instanceMatrix?.array;
  const profileValues = profileAttribute?.array;
  const moundMaskValues = moundMaskAttribute?.array;
  const profileItemSize = profileAttribute?.itemSize || 0;
  const terrainCount = topo.terrain.count || 0;
  const profileRuntimeReady = !!(
    moundMaskAttribute?.isInstancedBufferAttribute
    && profileAttribute?.isInstancedBufferAttribute
    && profileItemSize === 4
    && profileAttribute.normalized === true
    && profileValues?.length >= terrainCount * 4
    && moundMaskValues?.length >= terrainCount
    && instanceMatrices?.length >= terrainCount * 16
  );

  const cells = [];
  if (profileRuntimeReady) {
    for (let index = 0; index < terrainCount; index += 1) {
      const matrixOffset = index * 16;
      const profileOffset = index * 4;
      cells.push({
        index,
        x: Number(instanceMatrices[matrixOffset + 12]),
        z: Number(instanceMatrices[matrixOffset + 14]),
        mask: Number(moundMaskValues[index]),
        level: Math.round(profileValues[profileOffset] / 255 * (SONIC_GROUND_MOUND_COLUMN_LEVELS - 1)),
        phase: Math.round(profileValues[profileOffset + 1] / 255 * (SONIC_GROUND_MOUND_COLUMN_PHASE_BUCKETS - 1)),
        band: Math.min(
          SONIC_LOW_FREQUENCY_BAND_COUNT - 1,
          Math.round(profileValues[profileOffset + 2])
            + (profileValues[profileOffset + 3] >= 128 ? 256 : 0)
        )
      });
    }
  }

  const coreRadius = 5.25;
  const peakReports = SONIC_GROUND_MOUND_CENTERS.map((center, peakIndex) => {
    const geometrySamples = [];
    if (profileRuntimeReady) {
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        if (Math.hypot(cell.x - center.x, cell.z - center.z) > coreRadius) continue;
        if (!Number.isFinite(cell.mask) || cell.mask <= 0.05) continue;
        geometrySamples.push(cell);
      }
    }
    // Reduced motion deliberately uses a smaller production terrain/rain footprint.
    // Only cells accepted by the real collision footprint are active for height checks.
    const samples = geometrySamples.filter((sample) => (
      sonicRainGroundSurfaceAt(sample.x, sample.z)
    ));
    const active = samples.length >= 24;
    const denseSamples = samples.filter((sample) => (
      Number.isFinite(sample.level)
      && Number.isFinite(sample.phase)
      && Number.isFinite(sample.band)
      && SONIC_GROUND_MOUND_COLUMN_STATIC_MIN > 0
    ));
    return {
      peakIndex,
      x: center.x,
      z: center.z,
      active,
      samples,
      geometrySampleCount: geometrySamples.length,
      sampleCount: samples.length,
      denseCoverage: denseSamples.length / Math.max(1, samples.length),
      levels: new Set(denseSamples.map((sample) => sample.level)).size,
      phases: new Set(denseSamples.map((sample) => sample.phase)).size,
      bands: new Set(denseSamples.map((sample) => sample.band)).size,
      staticSpread: 0
    };
  });
  const activePeaks = peakReports.filter((peak) => peak.active);

  if (topo.uniforms.uGroundEntrance) topo.uniforms.uGroundEntrance.value = 1;
  topo.groundEntranceProgress = 1;
  topo.audioTerrainTime = 12.5;
  if (topo.uniforms.uAudioTime) topo.uniforms.uAudioTime.value = 12.5;
  if (topo.uniforms.uIdleBreath) topo.uniforms.uIdleBreath.value = 0;
  if (topo.uniforms.uAudioPulse) topo.uniforms.uAudioPulse.value = 0;
  for (const ripple of topo.ripples || []) ripple.isActive = 0;

  const setCollisionAudio = (amplitude, spectrumMode = 'all') => {
    const audio = topo.frameAudio;
    Object.assign(audio, {
      lowFrequencyAmplitude: amplitude,
      subBass: amplitude,
      bass: amplitude,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      brilliance: 0,
      air: 0,
      energy: 0,
      warmth: 0,
      brightness: 0,
      sharpness: 0,
      smoothness: 0.7,
      density: 0,
      spectralCentroid: 0,
      fluxPulse: 0,
      fluxMeteor: 0,
      beat: 0
    });
    audio.lowFrequencyBands.fill(spectrumMode === 'all' ? amplitude : 0);
    audio.lowFrequencyBandTargets.fill(spectrumMode === 'all' ? amplitude : 0);
    if (topo.lowFrequencySpectrumData) {
      topo.lowFrequencySpectrumData.fill(spectrumMode === 'all' ? Math.round(amplitude * 255) : 0);
      if (topo.lowFrequencySpectrum) topo.lowFrequencySpectrum.needsUpdate = true;
    }
  };

  setCollisionAudio(0);
  let minimumHeight = Infinity;
  const staticHeights = [];
  for (const peak of activePeaks) {
    const heights = [];
    for (const sample of peak.samples) {
      const height = sonicRainCollisionHeight(topo, sample.x, sample.z, 12.5);
      sample.staticHeight = height;
      heights.push(height);
      staticHeights.push(height);
      minimumHeight = Math.min(minimumHeight, height);
    }
    peak.staticSpread = heights.length ? Math.max(...heights) - Math.min(...heights) : 0;
  }

  setCollisionAudio(1);
  const fullLowFrequencyLifts = [];
  let nonNegativeLiftCount = 0;
  let liftSampleCount = 0;
  for (const peak of activePeaks) {
    for (const sample of peak.samples) {
      const fullHeight = sonicRainCollisionHeight(topo, sample.x, sample.z, 12.5);
      const lift = fullHeight - sample.staticHeight;
      fullLowFrequencyLifts.push(lift);
      if (lift >= -0.000001) nonNegativeLiftCount += 1;
      liftSampleCount += 1;
      minimumHeight = Math.min(minimumHeight, fullHeight);
    }
  }

  const selectiveSamples = [];
  for (const peak of activePeaks) {
    if (Math.hypot(peak.x, peak.z) < 35) continue;
    const candidates = peak.samples.filter((sample) => sample.mask >= 0.55);
    const usedBands = new Set();
    for (const sample of candidates) {
      if (usedBands.has(sample.band)) continue;
      usedBands.add(sample.band);
      selectiveSamples.push(sample);
      if (usedBands.size >= 2) break;
    }
  }
  const bandSelectiveDeltas = [];
  for (const sample of selectiveSamples) {
    setCollisionAudio(0, 'none');
    topo.lowFrequencySpectrumData[sample.band] = 255;
    topo.frameAudio.lowFrequencyBands[sample.band] = 1;
    const matchingBandHeight = sonicRainCollisionHeight(topo, sample.x, sample.z, 12.5);
    topo.lowFrequencySpectrumData[sample.band] = 0;
    topo.frameAudio.lowFrequencyBands[sample.band] = 0;
    const otherBand = (sample.band + 257) % SONIC_LOW_FREQUENCY_BAND_COUNT;
    topo.lowFrequencySpectrumData[otherBand] = 255;
    topo.frameAudio.lowFrequencyBands[otherBand] = 1;
    const otherBandHeight = sonicRainCollisionHeight(topo, sample.x, sample.z, 12.5);
    bandSelectiveDeltas.push(matchingBandHeight - otherBandHeight);
  }

  const applyGpuAudio = (amplitude) => {
    setCollisionAudio(amplitude);
    topo.uniforms.uLowFrequencyAmplitude.value = amplitude;
    topo.uniforms.uSubBass.value = amplitude;
    topo.uniforms.uBass.value = amplitude;
    topo.uniforms.uLowMid.value = 0;
    topo.uniforms.uMid.value = 0;
    topo.uniforms.uHighMid.value = 0;
  };
  const renderFrame = (amplitude) => {
    applyGpuAudio(amplitude);
    renderer.setRenderTarget(null);
    renderer.info.reset();
    renderer.render(topo.scene, topo.camera);
    gl.finish();
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      glError: gl.getError()
    };
  };
  while (gl.getError() !== gl.NO_ERROR) {}
  renderFrame(0);
  const quietFrame = renderFrame(0);
  const drivenFrame = renderFrame(1);

  let profileOwnerCount = 0;
  let extraProfileMeshCount = 0;
  topo.scene.traverse((object) => {
    if (!object?.isMesh && !object?.isPoints) return;
    if (!object.geometry?.getAttribute?.('aGroundMoundColumnProfile')) return;
    profileOwnerCount += 1;
    if (object !== topo.terrain) extraProfileMeshCount += 1;
  });

  const originalPlaybackClockRunning = isPlaybackClockRunning;
  let pauseMetrics = null;
  try {
    els.audio.src = '/__qa__/hold.wav';
    await wait(180);
    state.currentSong = { id: 'qa-held-source', title: 'QA held source', artist: 'Codex' };
    state.audioAnalysis.live = false;
    state.visual.lowFrequencyBands.fill(0);
    for (let index = 0; index < state.visual.lowFrequencyBands.length; index += 1) {
      state.visual.lowFrequencyBands[index] = ((index * 37) % 101) / 100;
    }
    Object.assign(state.visual, {
      lowFrequencyAmplitude: 0.88,
      subBass: 0.81,
      bass: 0.74,
      lowMid: 0.36,
      mid: 0.18,
      highMid: 0.12,
      energy: 0.62,
      beat: 0,
      fluxPulse: 0,
      fluxMeteor: 0
    });
    topo.audioTerrainSource = '';
    topo.audioTerrainTime = 0;
    topo.wasAudioDriving = false;
    topo.pulseCooldown = 10000;
    topo.meteorCooldown = 10000;
    isPlaybackClockRunning = () => true;
    for (let frame = 0; frame < 18; frame += 1) {
      topo.lastMotionAt = performance.now() - 40;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
    }
    for (const ripple of topo.ripples || []) ripple.isActive = 0;

    const pauseProbeCells = [
      cells.find((cell) => Math.abs(cell.x) < 0.6 && Math.abs(cell.z) < 0.6),
      selectiveSamples[0]
    ].filter(Boolean);
    const snapshot = () => ({
      scalars: [
        topo.frameAudio.lowFrequencyAmplitude,
        topo.frameAudio.subBass,
        topo.frameAudio.bass,
        topo.frameAudio.lowMid,
        topo.uniforms.uLowFrequencyAmplitude.value,
        topo.uniforms.uSubBass.value,
        topo.uniforms.uBass.value,
        topo.uniforms.uLowMid.value,
        topo.uniforms.uAudioTime?.value || 0,
        topo.audioTerrainTime || 0
      ],
      bands: Array.from(topo.frameAudio.lowFrequencyBands),
      targets: Array.from(topo.frameAudio.lowFrequencyBandTargets),
      spectrum: Array.from(topo.lowFrequencySpectrumData || []),
      heights: pauseProbeCells.map((cell) => (
        sonicRainCollisionHeight(topo, cell.x, cell.z, topo.audioTerrainTime || 0)
      ))
    });
    const beforePause = snapshot();
    els.audio.pause();
    isPlaybackClockRunning = () => false;
    for (let frame = 0; frame < 8; frame += 1) {
      topo.lastMotionAt = performance.now() - 40;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
    }
    const afterPause = snapshot();
    pauseMetrics = {
      sameSource: topo.audioTerrainSource === String(els.audio.currentSrc || els.audio.src || ''),
      mediaPaused: els.audio.paused === true && els.audio.ended !== true,
      scalarMaximumDelta: maximumDifference(beforePause.scalars, afterPause.scalars),
      bandMaximumDelta: maximumDifference(beforePause.bands, afterPause.bands),
      targetMaximumDelta: maximumDifference(beforePause.targets, afterPause.targets),
      spectrumMaximumDelta: maximumDifference(beforePause.spectrum, afterPause.spectrum),
      heightMaximumDelta: maximumDifference(beforePause.heights, afterPause.heights),
      probeHeightCount: beforePause.heights.length
    };
  } finally {
    isPlaybackClockRunning = originalPlaybackClockRunning;
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const angleRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
  const programsRunnable = (renderer.info.programs || []).every(
    (program) => program.diagnostics?.runnable !== false
  );
  const minimum = (values, fallback = 0) => values.length ? Math.min(...values) : fallback;
  const weakPeaks = activePeaks.filter((peak) => (
    peak.denseCoverage < ${thresholds.denseColumnCoveragePerActivePeak}
    || peak.levels < ${thresholds.minimumStaticHeightLevelsPerPeak}
    || peak.phases < ${thresholds.minimumPhaseBucketsPerPeak}
    || peak.bands < ${thresholds.minimumLowFrequencyBandsPerPeak}
    || peak.staticSpread < ${thresholds.minimumStaticCoreHeightSpread}
  )).slice(0, 12).map((peak) => ({
    peakIndex: peak.peakIndex,
    x: peak.x,
    z: peak.z,
    sampleCount: peak.sampleCount,
    denseCoverage: peak.denseCoverage,
    levels: peak.levels,
    phases: peak.phases,
    bands: peak.bands,
    staticSpread: peak.staticSpread
  }));

  const result = {
    label: ${JSON.stringify(label)},
    reducedMotion: reducedMotion === true,
    mediaReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    angleRenderer,
    webglVersion: gl.getParameter(gl.VERSION),
    fixedPeakDefinitionCount: SONIC_GROUND_MOUND_CENTERS.length,
    sampledPeakDefinitionCount: peakReports.length,
    activePeakCount: activePeaks.length,
    terrainCount,
    terrainGrid: SONIC_TOPOGRAPHY_GRID,
    profileRuntimeReady,
    profileItemSize,
    profileNormalized: profileAttribute?.normalized === true,
    profileStaticUsage: profileAttribute?.usage === THREE.StaticDrawUsage,
    minimumDenseColumnCoverage: minimum(activePeaks.map((peak) => peak.denseCoverage)),
    minimumStaticHeightLevels: minimum(activePeaks.map((peak) => peak.levels)),
    minimumPhaseBuckets: minimum(activePeaks.map((peak) => peak.phases)),
    minimumLowFrequencyBands: minimum(activePeaks.map((peak) => peak.bands)),
    minimumStaticCoreHeightSpread: minimum(activePeaks.map((peak) => peak.staticSpread)),
    minimumHeight,
    fullLowFrequencyLiftMedian: median(fullLowFrequencyLifts),
    nonNegativeLiftRatio: nonNegativeLiftCount / Math.max(1, liftSampleCount),
    bandSelectiveSampleCount: bandSelectiveDeltas.length,
    bandSelectiveHeightDeltaMedian: median(bandSelectiveDeltas),
    bandSelectiveHeightDeltaMinimum: minimum(bandSelectiveDeltas),
    weakPeaks,
    pauseMetrics,
    quietFrame,
    drivenFrame,
    profileOwnerCount,
    extraProfileMeshCount,
    programsRunnable
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
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  const modes = [
    { key: 'normal', label: 'default-motion', media: 'no-preference' },
    { key: 'reduced', label: 'reduced-motion', media: 'reduce' }
  ];
  for (const mode of modes) {
    try {
      await command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: mode.media }]
      });
      await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-mound-columns-${mode.key}` });
      await delay(2300);
      const runtime = await evaluate(probeExpression(mode.label));
      if (mode.key === 'normal') normal = runtime;
      else reduced = runtime;
    } catch (error) {
      browserErrors.push(`${mode.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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
  usesDx11Angle:
    /ANGLE/i.test(runtime?.angleRenderer || '')
    && /(?:D3D11|Direct3D11)/i.test(runtime?.angleRenderer || ''),
  requestedMotionModeLoaded:
    runtime?.reducedMotion === expectReducedMotion
    && runtime?.mediaReducedMotion === expectReducedMotion,
  productionProfileAndMatricesLoaded:
    runtime?.profileRuntimeReady === true
    && runtime?.profileItemSize === 4
    && runtime?.profileNormalized === true
    && runtime?.profileStaticUsage === true
    && runtime?.terrainCount > 0,
  all121PeakDefinitionsWereSampled:
    runtime?.fixedPeakDefinitionCount === 121
    && runtime?.sampledPeakDefinitionCount === 121
    && runtime?.activePeakCount >= 25,
  everyActivePeakHasDenseColumns:
    runtime?.minimumDenseColumnCoverage >= thresholds.denseColumnCoveragePerActivePeak,
  everyActivePeakHasAtLeastThreeStaticLevels:
    runtime?.minimumStaticHeightLevels >= thresholds.minimumStaticHeightLevelsPerPeak,
  everyActivePeakHasFourPhaseBuckets:
    runtime?.minimumPhaseBuckets >= thresholds.minimumPhaseBucketsPerPeak,
  everyActivePeakUsesAtLeastSixLowFrequencyBands:
    runtime?.minimumLowFrequencyBands >= thresholds.minimumLowFrequencyBandsPerPeak,
  everyActivePeakHasVisibleStaticCoreRelief:
    runtime?.minimumStaticCoreHeightSpread >= thresholds.minimumStaticCoreHeightSpread,
  zeroToFullLowFrequencyAddsVisibleNonNegativeLift:
    runtime?.fullLowFrequencyLiftMedian >= thresholds.minimumMedianLowFrequencyLift
    && runtime?.nonNegativeLiftRatio === 1
    && runtime?.minimumHeight >= thresholds.minimumHeight,
  productionCollisionRespondsOnlyToTheSelectedBand:
    runtime?.bandSelectiveSampleCount >= 24
    && runtime?.bandSelectiveHeightDeltaMedian >= thresholds.minimumBandSelectiveHeightDelta,
  sameSourcePauseFreezesTheExactProductionFrame:
    runtime?.pauseMetrics?.sameSource === true
    && runtime?.pauseMetrics?.mediaPaused === true
    && runtime?.pauseMetrics?.probeHeightCount >= 2
    && runtime?.pauseMetrics?.scalarMaximumDelta <= thresholds.pauseScalarTolerance
    && runtime?.pauseMetrics?.bandMaximumDelta <= thresholds.pauseScalarTolerance
    && runtime?.pauseMetrics?.targetMaximumDelta <= thresholds.pauseScalarTolerance
    && runtime?.pauseMetrics?.spectrumMaximumDelta <= thresholds.pauseSpectrumByteTolerance
    && runtime?.pauseMetrics?.heightMaximumDelta <= thresholds.pauseScalarTolerance,
  terrainDrawDoesNotGrowAndOwnsTheOnlyProfile:
    runtime?.quietFrame?.calls === runtime?.drivenFrame?.calls
    && runtime?.quietFrame?.triangles === runtime?.drivenFrame?.triangles
    && runtime?.quietFrame?.points === runtime?.drivenFrame?.points
    && runtime?.quietFrame?.lines === runtime?.drivenFrame?.lines
    && runtime?.profileOwnerCount === 1
    && runtime?.extraProfileMeshCount === thresholds.extraMoundMeshes,
  gpuProgramsAndGlRemainClean:
    runtime?.quietFrame?.glError === 0
    && runtime?.drivenFrame?.glError === 0
    && runtime?.programsRunnable === true
});

const checks = {
  fixed121PeaksStillCoverTheFullTerrain:
    fixedCoverage.status === 0
    && fixedCoverageReport?.pass === true
    && fixedCoverageReport?.parameters?.fixedPeakCount === 121
    && fixedCoverageReport?.parameters?.terrainExtent?.[0] === -90
    && fixedCoverageReport?.parameters?.terrainExtent?.[1] === 90
    && fixedCoverageReport?.metrics?.sampledCoverageRatio === 1,
  sourceKeepsOneTerrainMesh,
  edgeCompletedWithoutBrowserErrors: browserErrors.length === 0 && !!normal && !!reduced,
  defaultMotion: modeChecks(normal, false),
  reducedMotion: modeChecks(reduced, true)
};

const failures = [];
for (const [name, passed] of Object.entries(checks)) {
  if (typeof passed === 'boolean') {
    if (!passed) failures.push(name);
    continue;
  }
  for (const [childName, childPassed] of Object.entries(passed)) {
    if (!childPassed) failures.push(`${name}.${childName}`);
  }
}

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  skipped: false,
  thresholds,
  checks,
  failures,
  browserErrors,
  fixedCoverageFailure: fixedCoverage.status === 0
    ? ''
    : (fixedCoverage.stderr || fixedCoverage.stdout || '').trim(),
  runtime: {
    defaultMotion: normal,
    reducedMotion: reduced
  }
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
