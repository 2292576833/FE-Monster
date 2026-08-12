import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const defaultMatch = app.match(/\bfluorescenceScatter\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
const defaultValue = Number(defaultMatch?.[1]);
const scatterReferences = app.match(/\b(?:fluorescenceScatter|uFluorescenceScatter|sonicFluorescenceScatter(?:Range|Value)?)\b/g) || [];

const updateStart = app.indexOf('function updateSonicTopographyMotion');
const updateEnd = updateStart >= 0 ? app.indexOf('\nfunction ', updateStart + 40) : -1;
const updateRuntime = updateStart >= 0
  ? app.slice(updateStart, updateEnd > updateStart ? updateEnd : updateStart + 32_000)
  : '';

const terrainShaderStart = app.indexOf('function createSonicTopographyMaterial');
const terrainShaderEnd = terrainShaderStart >= 0 ? app.indexOf('\nfunction ', terrainShaderStart + 40) : -1;
const terrainShader = terrainShaderStart >= 0
  ? app.slice(terrainShaderStart, terrainShaderEnd > terrainShaderStart ? terrainShaderEnd : terrainShaderStart + 32_000)
  : '';

const scatterMentionsExistingFog = (
  /fogLayers[\s\S]{0,1800}(?:settings\.)?fluorescenceScatter/.test(updateRuntime)
  || /(?:settings\.)?fluorescenceScatter[\s\S]{0,1800}fogLayers/.test(updateRuntime)
);
const scatterMentionsExistingHalo = (
  /(?:tyndallHalos|haloTargetOpacity|halo\.material)[\s\S]{0,1800}(?:settings\.)?fluorescenceScatter/.test(updateRuntime)
  || /(?:settings\.)?fluorescenceScatter[\s\S]{0,1800}(?:tyndallHalos|haloTargetOpacity|halo\.material)/.test(updateRuntime)
);

const forbiddenStandaloneOwner = /\b(?:fluorescenceScatterMesh|scatterMesh|fluorescenceScatterGroup|scatterGroup|FluorescenceScatterPass|scatterComposer|scatterCanvas)\b/i;
const forbiddenResidentScheduling = /(?:requestAnimationFrame|setInterval)\s*\([\s\S]{0,260}(?:fluorescenceScatter|FluorescenceScatter)|(?:fluorescenceScatter|FluorescenceScatter)[\s\S]{0,260}(?:requestAnimationFrame|setInterval)\s*\(/;
const forbiddenStandaloneDraw = /(?:renderer\.render|renderQuality\.render)\s*\([\s\S]{0,220}(?:fluorescenceScatter|scatterMesh)|(?:fluorescenceScatter|scatterMesh)[\s\S]{0,220}(?:renderer\.render|renderQuality\.render)\s*\(/i;

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function headlessScatterProbe() {
  if (!existsSync(edge)) return { pass: true, skipped: true, reason: 'Microsoft Edge is unavailable' };
  const webRoot = path.join(root, 'web');
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
  const safeFilePath = (pathname) => {
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
  };
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
  const profile = path.join(root, '.tmp', `fe-monster-fluorescence-scatter-${process.pid}`);
  const debugPort = 21000 + Math.floor(Math.random() * 6000);
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
  const retryJson = async (url) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) return response.json();
      } catch {}
      await delay(100);
    }
    throw new Error('Edge debugging endpoint did not start');
  };
  const command = (method, params = {}) => {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
    }
    return response.result?.value;
  };
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
    await wait(220);
    const topo = state.sonicTopography;
    if (!topo?.renderer || !topo.scene || !topo.camera || !topo.uniforms) {
      throw new Error('Sonic renderer did not start');
    }
    state.playbackVisual.dragging = true;
    topo.settings.rainEnabled = false;
    topo.settings.starfieldEnabled = false;
    topo.settings.galaxyEnabled = false;
    topo.settings.fountainEnabled = false;
    topo.settings.atmosphereEnabled = false;
    topo.settings.fluorescence = 0.72;
    topo.settings.fluorescenceScatter = 0;
    applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
    resetSonicTopographyAudioMotion(topo);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      topo.lastMotionAt = performance.now() - 40;
      updateSonicTopographyMotion();
    }

    const cameraPosition = topo.camera.position.clone();
    const cameraQuaternion = topo.camera.quaternion.clone();
    const baselineAutoYaw = topo.autoYaw;
    const fogBaseline = topo.fogLayers.map((layer) => ({
      position: layer.position.clone(),
      scale: layer.scale.clone(),
      rotation: layer.material.rotation,
      opacity: layer.material.opacity,
      color: layer.material.color.clone()
    }));
    const beamBaseline = topo.tyndallBeams.map((beam) => ({
      opacity: beam.material.uniforms.uOpacity.value,
      haloOpacity: beam.userData.halo.material.uniforms.uOpacity.value,
      haloStrength: beam.userData.halo.material.uniforms.uHaloStrength.value
    }));
    const restoreBaseline = () => {
      topo.autoYaw = baselineAutoYaw;
      topo.camera.position.copy(cameraPosition);
      topo.camera.quaternion.copy(cameraQuaternion);
      topo.fogLayers.forEach((layer, index) => {
        const saved = fogBaseline[index];
        layer.position.copy(saved.position);
        layer.scale.copy(saved.scale);
        layer.material.rotation = saved.rotation;
        layer.material.opacity = saved.opacity;
        layer.material.color.copy(saved.color);
      });
      topo.tyndallBeams.forEach((beam, index) => {
        const saved = beamBaseline[index];
        beam.material.uniforms.uOpacity.value = saved.opacity;
        beam.userData.halo.material.uniforms.uOpacity.value = saved.haloOpacity;
        beam.userData.halo.material.uniforms.uHaloStrength.value = saved.haloStrength;
      });
    };
    const settleScatter = (value) => {
      restoreBaseline();
      topo.settings.atmosphereEnabled = false;
      topo.settings.fluorescenceScatter = value;
      applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
      for (let iteration = 0; iteration < 120; iteration += 1) {
        topo.lastMotionAt = performance.now() - 40;
        updateSonicTopographyMotion();
      }
      topo.settings.atmosphereEnabled = true;
      applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
      topo.autoYaw = baselineAutoYaw;
      topo.camera.position.copy(cameraPosition);
      topo.camera.quaternion.copy(cameraQuaternion);
      if (topo.uniforms.uTime) topo.uniforms.uTime.value = 42;
      if (topo.uniforms.uGroundEntrance) topo.uniforms.uGroundEntrance.value = 1;
      topo.tyndallBeams.forEach((beam) => {
        if (beam.material.uniforms.uTime) beam.material.uniforms.uTime.value = 42;
        const halo = beam.userData.halo;
        if (halo.material.uniforms.uTime) halo.material.uniforms.uTime.value = 42;
      });
    };
    const drawingBufferSize = topo.renderer.getDrawingBufferSize(new THREE.Vector2());
    const pixelCount = drawingBufferSize.x * drawingBufferSize.y;
    const capture = () => {
      topo.renderer.info.reset();
      topo.renderer.setRenderTarget(null);
      topo.renderer.render(topo.scene, topo.camera);
      const calls = topo.renderer.info.render.calls;
      const pixels = new Uint8Array(pixelCount * 4);
      const gl = topo.renderer.getContext();
      gl.readPixels(0, 0, drawingBufferSize.x, drawingBufferSize.y, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { pixels, calls };
    };
    const meanFogOpacity = () => topo.fogLayers.reduce((sum, layer) => sum + layer.material.opacity, 0)
      / Math.max(1, topo.fogLayers.length);
    const meanHaloOpacity = () => topo.tyndallBeams.reduce(
      (sum, beam) => sum + beam.userData.halo.material.uniforms.uOpacity.value,
      0
    ) / Math.max(1, topo.tyndallBeams.length);

    settleScatter(0);
    const offFogOpacity = meanFogOpacity();
    const offHaloOpacity = meanHaloOpacity();
    const offFrame = capture();
    settleScatter(1.2);
    const onFogOpacity = meanFogOpacity();
    const onHaloOpacity = meanHaloOpacity();
    const onFrame = capture();

    let totalLuminanceGain = 0;
    let totalAbsoluteLuminanceGain = 0;
    let brightenedPixels = 0;
    let visiblyChangedPixels = 0;
    const positiveGains = [];
    for (let offset = 0; offset < onFrame.pixels.length; offset += 4) {
      const offLuminance = (
        offFrame.pixels[offset] * 0.2126
          + offFrame.pixels[offset + 1] * 0.7152
          + offFrame.pixels[offset + 2] * 0.0722
      ) / 255;
      const onLuminance = (
        onFrame.pixels[offset] * 0.2126
          + onFrame.pixels[offset + 1] * 0.7152
          + onFrame.pixels[offset + 2] * 0.0722
      ) / 255;
      const gain = onLuminance - offLuminance;
      totalLuminanceGain += gain;
      totalAbsoluteLuminanceGain += Math.abs(gain);
      if (gain >= 3 / 255) {
        brightenedPixels += 1;
        positiveGains.push(gain);
      }
      if (Math.abs(gain) >= 3 / 255) visiblyChangedPixels += 1;
    }
    positiveGains.sort((left, right) => left - right);
    const percentile = (ratio) => positiveGains.length
      ? positiveGains[Math.min(positiveGains.length - 1, Math.floor(positiveGains.length * ratio))]
      : 0;
    const gl = topo.renderer.getContext();
    const glError = gl.getError();
    const programsRunnable = (topo.renderer.info.programs || [])
      .every((program) => program.diagnostics?.runnable !== false);
    const result = {
      reducedMotion: reducedMotion === true,
      mediaQueryMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      hardwareAntialias: gl.getContextAttributes?.()?.antialias === true,
      drawingBuffer: [drawingBufferSize.x, drawingBufferSize.y],
      pixelCount,
      meanLuminanceGain: totalLuminanceGain / Math.max(1, pixelCount),
      meanAbsoluteLuminanceGain: totalAbsoluteLuminanceGain / Math.max(1, pixelCount),
      brightenedPixelRatio: brightenedPixels / Math.max(1, pixelCount),
      visiblyChangedPixelRatio: visiblyChangedPixels / Math.max(1, pixelCount),
      p90PositiveGain: percentile(0.9),
      p98PositiveGain: percentile(0.98),
      offFogOpacity,
      onFogOpacity,
      fogOpacityGain: onFogOpacity - offFogOpacity,
      offHaloOpacity,
      onHaloOpacity,
      haloOpacityGain: onHaloOpacity - offHaloOpacity,
      offDrawCalls: offFrame.calls,
      onDrawCalls: onFrame.calls,
      uniformValue: topo.uniforms.uFluorescenceScatter?.value ?? null,
      glError,
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
      if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') {
        browserErrors.push((payload.params.args || [])
          .map((argument) => argument.value || argument.description || '')
          .join(' '));
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
    await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-fluorescence-scatter` });
    await delay(2200);
    normal = await evaluate(probeExpression);

    await command('Runtime.evaluate', { expression: 'localStorage.clear()' });
    await command('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await command('Page.navigate', { url: `${baseUrl}/?qa=sonic-fluorescence-scatter-reduced` });
    await delay(2200);
    reduced = await evaluate(probeExpression);
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
  return {
    pass: browserErrors.length === 0 && !!normal && !!reduced,
    skipped: false,
    browserErrors,
    normal,
    reduced
  };
}

const headless = await headlessScatterProbe();

function visiblyScatters(mode, reduced = false) {
  if (headless.skipped) return true;
  // Native MSAA distributes edge energy across neighbouring samples, so fewer
  // final pixels cross the hard 3/255 threshold even when mean gain and the
  // p90/p98 signal remain the same. 0.3% still covers almost four thousand
  // pixels at 1440x900; non-antialiased fallback rendering keeps the stricter
  // historical 0.4% requirement.
  const minimumMeanGain = reduced ? 0.0012 : 0.0015;
  const minimumBrightenedRatio = mode?.hardwareAntialias ? 0.003 : 0.004;
  return !!mode
    && mode.meanLuminanceGain >= minimumMeanGain
    && mode.meanAbsoluteLuminanceGain >= minimumMeanGain
    && mode.brightenedPixelRatio >= minimumBrightenedRatio
    && mode.visiblyChangedPixelRatio >= minimumBrightenedRatio
    && mode.p90PositiveGain >= 0.012
    && mode.p98PositiveGain >= 0.014;
}

function reusesOwnersWithoutDrawGrowth(mode) {
  if (headless.skipped) return true;
  return !!mode
    && mode.fogOpacityGain >= 0.0004
    && mode.onFogOpacity >= mode.offFogOpacity * 1.04
    && mode.haloOpacityGain >= 0.004
    && mode.offDrawCalls > 0
    && mode.onDrawCalls === mode.offDrawCalls
    && Math.abs((mode.uniformValue ?? -1) - 1.2) < 0.001
    && mode.glError === 0
    && mode.programsRunnable === true;
}

const checks = {
  independentDefaultIsExplicitAndNonZero:
    Number.isFinite(defaultValue)
      && defaultValue >= 0.05
      && defaultValue <= 1.5,
  normalizationKeepsIndependentPersistedRange:
    /fluorescenceScatter\s*:\s*bounded\(\s*source\?\.fluorescenceScatter\s*,\s*DEFAULT_SONIC_SETTINGS\.fluorescenceScatter\s*,\s*0\s*,\s*1\.5\s*\)/.test(app),
  htmlExposesIndependentAccessibleControl:
    /<label\s+for="sonicFluorescenceScatterRange"[^>]*>[\s\S]{0,140}(?:荧光散射|Fluorescence scatter)/i.test(html)
      && /<output\s+id="sonicFluorescenceScatterValue"\s+for="sonicFluorescenceScatterRange"/.test(html)
      && /<input\s+id="sonicFluorescenceScatterRange"\s+type="range"[^>]*min="0"[^>]*max="150"[^>]*step="1"/.test(html),
  domRegistryOwnsRangeAndValue:
    /sonicFluorescenceScatterRange\s*:\s*\$\(['"]#sonicFluorescenceScatterRange['"]\)/.test(app)
      && /sonicFluorescenceScatterValue\s*:\s*\$\(['"]#sonicFluorescenceScatterValue['"]\)/.test(app),
  controlSynchronizesFromNormalizedSettings:
    /syncRange\(\s*els\.sonicFluorescenceScatterRange\s*,\s*els\.sonicFluorescenceScatterValue\s*,[\s\S]{0,220}?settings\.fluorescenceScatter/.test(app),
  inputBindingUsesSharedSonicPercentPath:
    /bindSonicPercentRange\(\s*els\.sonicFluorescenceScatterRange\s*,\s*['"]fluorescenceScatter['"]\s*\)/.test(app),
  runtimeDebugStateReportsIndependentValue:
    /sonicFluorescenceScatter\s*:\s*['"][^'"]+['"]/.test(app)
      && /runtimeControls\.sonicFluorescenceScatter\s*=\s*`[^`]*settings\.fluorescenceScatter/.test(app),
  terrainShaderReceivesAndUsesScatter:
    /uFluorescenceScatter\s*:\s*\{\s*value:\s*DEFAULT_SONIC_SETTINGS\.fluorescenceScatter\s*\}/.test(terrainShader)
      && /uniform\s+float\s+uFluorescenceScatter\s*;/.test(terrainShader)
      && (terrainShader.match(/\buFluorescenceScatter\b/g) || []).length >= 3
      && /(?:fluorescentEmission|fluorescenceEnergy|fluorescenceHalo)[\s\S]{0,520}uFluorescenceScatter|uFluorescenceScatter[\s\S]{0,520}(?:fluorescentEmission|fluorescenceEnergy|fluorescenceHalo)/.test(terrainShader),
  runtimeSyncsTerrainUniformWithoutRebuild:
    /if\s*\(\s*topo\.uniforms\.uFluorescenceScatter\s*\)\s*topo\.uniforms\.uFluorescenceScatter\.value\s*=\s*settings\.fluorescenceScatter\s*;/.test(app),
  runtimeReusesExistingFogLayers:
    updateRuntime.includes('settings.fluorescenceScatter')
      && scatterMentionsExistingFog,
  runtimeReusesExistingTyndallHalos:
    updateRuntime.includes('settings.fluorescenceScatter')
      && scatterMentionsExistingHalo,
  scatterHasEnoughIndependentRuntimeReferences:
    scatterReferences.length >= 14,
  scatterAddsNoStandaloneOwnerDrawOrResidentLoop:
    !forbiddenStandaloneOwner.test(app)
      && !forbiddenResidentScheduling.test(app)
      && !forbiddenStandaloneDraw.test(app),
  normalDx11FramebufferShowsPerceptibleScatter:
    headless.pass === true
      && headless.normal?.reducedMotion === false
      && headless.normal?.mediaQueryMatches === false
      && visiblyScatters(headless.normal, false),
  normalRuntimeReusesFogAndHaloWithoutDrawGrowth:
    reusesOwnersWithoutDrawGrowth(headless.normal),
  reducedMotionDx11FramebufferStillShowsPerceptibleScatter:
    headless.pass === true
      && headless.reduced?.reducedMotion === true
      && headless.reduced?.mediaQueryMatches === true
      && visiblyScatters(headless.reduced, true),
  reducedMotionReusesFogAndHaloWithoutDrawGrowth:
    reusesOwnersWithoutDrawGrowth(headless.reduced)
};

const failures = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  checks,
  failures,
  runtime: {
    defaultValue: Number.isFinite(defaultValue) ? defaultValue : null,
    scatterReferences: scatterReferences.length,
    updateRuntimeFound: updateStart >= 0,
    terrainShaderFound: terrainShaderStart >= 0,
    reusesFogLayers: scatterMentionsExistingFog,
    reusesTyndallHalos: scatterMentionsExistingHalo,
    standaloneOwnerFound: forbiddenStandaloneOwner.test(app),
    residentSchedulingFound: forbiddenResidentScheduling.test(app),
    standaloneDrawFound: forbiddenStandaloneDraw.test(app)
  },
  headless
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
