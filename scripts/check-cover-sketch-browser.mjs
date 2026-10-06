import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// Run the actual app against local fixtures; no music account or backend is required.
const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const output = path.join(root, 'output/playwright/cover-sketch');
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
assert.ok(chromium, 'Install Playwright or set PLAYWRIGHT_MODULE_PATH');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const fixtures = {
  '/api/music-apis': { ok: true, providers: [] },
  '/api/user-cursors': { ok: true, cursors: [] },
  '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
  '/api/player/state': { ok: true, playing: false, paused: true, volume: .8, position: 0, duration: 0, queue: [], queueLength: 0, queueRevision: 0, queueIndex: -1 },
  '/api/visual-bridge/state': { ok: true, audio: {} },
  '/api/sandbox/presets': { ok: true, presets: [] },
  '/api/sandbox/components': { ok: true, components: [] },
  '/api/community/status': { ok: true, authenticated: false },
  '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
};
const coverSvg = (second) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="sky" x2=".8" y2="1"><stop stop-color="${second ? '#153054' : '#102d2a'}"/><stop offset="1" stop-color="${second ? '#e89654' : '#d0b77b'}"/></linearGradient></defs><rect width="256" height="256" fill="url(#sky)"/><circle cx="${second ? 68 : 175}" cy="68" r="40" fill="#f3ddbc"/><path d="M0 226 48 107 108 201 159 132 256 235V256H0Z" fill="${second ? '#402747' : '#173c30'}"/><path d="M29 256 136 149 198 256" fill="#7e8170"/><path d="M0 232Q80 181 128 217T256 193" stroke="#ffe8b7" stroke-width="3" fill="none"/></svg>`;
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.setHeader('Content-Type', 'application/javascript'); response.end(''); return;
  }
  if (pathname === '/api/cover') {
    if (url.searchParams.get('url')?.includes('broken')) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end(coverSvg(url.searchParams.get('url')?.includes('second'))); return;
  }
  if (pathname.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(fixtures[pathname] || { ok: true })); return;
  }
  const file = path.resolve(pathname.startsWith('/components/') ? root : web, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const shaderErrors = [];
let page;
const settings = {
  imageMotionMode: 'dissolve',
  sketchLayers: 6, sketchDensity: 1.25, sketchLineWidth: 1.1, sketchFlowSpeed: .85, sketchFlowAmplitude: .95,
  depthEnabled: true, depthStrength: 1.8, depthContrast: 1.4, depthInvert: true,
  depthLightingEnabled: true, depthLightStrength: 1.2, depthAmbient: .45,
  depthLightAngle: 225, depthLightSpeed: .4, depthHighlight: .65
};
const legacyDepthPreferences = {
  depthMapDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
  depthMapName: 'legacy-depth.png', depthMapSource: 'old-cover-source'
};
const visualKeys = ['renderMode', ...Object.keys(settings)];
async function runChecks() {
try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (!existsSync(chromium.executablePath()) && existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) shaderErrors.push(message.text());
  });
  const boot = async (target) => {
    await target.locator('#bootLogoButton').click();
    await target.waitForFunction(() => typeof setCoverRenderMode === 'function' && document.getElementById('bootScreen')?.hidden, null, { timeout: 30000 });
  };
  const openControls = async () => {
    await page.evaluate(() => { setDiyOpen(true); setDiyPage('preset'); setDiyCardOpen(true); });
    const details = page.locator('#scenePresetSettings');
    if (await details.count()) await details.evaluate(element => { element.open = true; });
    await page.locator('#diyCoverParticleControl').evaluate(element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      element.querySelectorAll('details').forEach(group => { group.open = true; });
    });
  };
  const setInput = async (key, value) => {
    const control = page.locator(`[data-cover-setting="${key}"]`);
    if (typeof value === 'boolean') await control.setChecked(value);
    else await control.evaluate((input, next) => {
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, typeof value === 'string' ? value : value * (key === 'sketchLayers' || key === 'depthLightAngle' ? 1 : 100));
    assert.equal(await page.evaluate(key => state.coverParticle[key], key), value, `${key}: UI event updates runtime`);
  };
  const pixels = () => page.evaluate(() => {
    const canvas = document.getElementById('coverSketchCanvas');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const previous = window.__coverSketchPixelSnapshot;
    let hash = 2166136261, visible = 0, delta = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]) visible++;
      hash = Math.imul(hash ^ data[i], 16777619);
      hash = Math.imul(hash ^ data[i + 1], 16777619);
      hash = Math.imul(hash ^ data[i + 2], 16777619);
      hash = Math.imul(hash ^ data[i + 3], 16777619);
      if (previous?.length === data.length) for (let channel = 0; channel < 4; channel++) delta += Math.abs(data[i + channel] - previous[i + channel]);
    }
    window.__coverSketchPixelSnapshot = data;
    return { hash: hash >>> 0, visible, meanPixelDelta: previous?.length === data.length ? delta / data.length : null, frameAt: state.coverParticle.sketchLastFrameAt, width: canvas.width, height: canvas.height, stats: state.coverParticle.sketchRenderer?.getStats() };
  });
  const setCover = async (name) => {
    await page.evaluate(name => {
      state.currentSong = { id: `sketch-${name}`, title: `Sketch ${name}`, artist: 'Fixture', cover: name === 'empty' ? '' : `fixture-${name}` };
      updateCoverParticleImage(state.currentSong);
    }, name);
    if (name === 'empty' || name === 'broken') await page.waitForFunction(() => !state.coverParticle.image);
    else await page.waitForFunction(() => state.coverParticle.image?.complete && state.coverParticle.image?.naturalWidth > 0);
    await page.waitForTimeout(180);
  };
  await page.goto(baseUrl);
  await boot(page);
  await page.evaluate(() => enterPresetPlaybackPage('cover-particles'));
  await openControls();
  if (process.argv.includes('--image-motion')) {
    await setCover('first');
    await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
    const capture = (label, mode, time) => page.evaluate(({ label, mode, time }) => {
      const cover = state.coverParticle;
      cover.imageMotionMode = mode;
      cover.waveTime = time;
      cover.motionGate = 1;
      cover.energy = .82;
      cover.gpuRenderSignature = '';
      drawCoverParticleScene(720, 720, 1);
      cover.gpuRenderer.render(cover.gpuScene, cover.gpuCamera);
      const gl = cover.gpuRenderer.getContext();
      const rgba = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      let visible = 0, hash = 2166136261;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3]) visible++;
        for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ rgba[i + channel], 16777619);
      }
      return { label, mode, uniform: cover.gpuMaterial.uniforms.uImageMotionMode.value, visible, hash: hash >>> 0, glError: gl.getError() };
    }, { label, mode, time });
    await page.locator('#coverImageMotionMode').selectOption('parallax');
    const parallax = await capture('parallax', 'parallax', 0.35);
    await page.locator('#coverImageMotionMode').selectOption('dissolve');
    const dissolve = await capture('dissolve', 'dissolve', 1.75);
    assert.equal(parallax.uniform, 0, 'parallax mode selects the clear image motion path');
    assert.equal(dissolve.uniform, 1, 'dissolve mode selects the particle reformation path');
    assert.ok(parallax.visible > 500 && dissolve.visible > 500, 'both image motion modes render visible particles');
    assert.notEqual(parallax.hash, dissolve.hash, 'the two image motion modes produce different GPU pixels');
    assert.equal(dissolve.glError, 0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(COVER_PARTICLE_PREFS_KEY)));
    assert.equal(saved.imageMotionMode, 'dissolve', 'selected image motion mode persists');
    assert.deepEqual(errors, []);
    assert.deepEqual(shaderErrors, []);
    writeFileSync(path.join(output, 'image-motion.json'), JSON.stringify({ parallax, dissolve, saved }, null, 2));
    await page.screenshot({ path: path.join(output, 'image-motion.png') });
    console.log('Cover image motion browser checks passed: parallax/flow and dissolve/reform modes render, switch uniforms, persist and compile without WebGL errors.');
    return;
  }
  if (process.argv.includes('--depth-map-toggle')) {
    const toggle = page.locator('#coverDepthMapToggle');
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'the display effect is opt-in');
    await setCover('first');
    await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
    await setInput('depthStrength', 0);
    await setInput('depthContrast', 1.6);
    await setInput('depthInvert', true);
    await setInput('depthLightSpeed', 0);
    await setInput('depthLightingEnabled', false);
    await setInput('depthEnabled', false);
    const preservedKeys = ['renderMode', 'imageMotionMode', 'sketchLayers', 'sketchDensity', 'sketchLineWidth', 'sketchFlowSpeed',
      'sketchFlowAmplitude', 'depthEnabled', 'depthStrength', 'depthContrast', 'depthInvert',
      'depthLightingEnabled', 'depthLightStrength', 'depthAmbient', 'depthLightAngle', 'depthLightSpeed', 'depthHighlight'];
    const preferences = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, state.coverParticle[key]])), preservedKeys);
    const originalPreferences = await preferences();
    const capture = (name, compare = '', cpu = false) => page.evaluate(({ name, compare, cpu }) => {
      const cover = state.coverParticle;
      cover.lightTime = 0;
      cover.waveTime = 0;
      cover.motionGate = cover.energy = cover.wholeJump = cover.bassJitter = 0;
      cover.gpuRenderSignature = '';
      state.orb.mouseActive = false;
      state.playbackVisual.yaw = PLAYBACK_REST_YAW;
      state.playbackVisual.pitch = PLAYBACK_REST_PITCH;
      state.playbackVisual.velocityYaw = state.playbackVisual.velocityPitch = 0;
      state.playbackVisual.zoom = 1;
      let rgba, width = 720, height = 720, glError = 0, programs = [];
      if (cover.renderMode === 'particles' && cpu) {
        // A canvas that already owns WebGL cannot acquire a 2D context. Route
        // the actual scene entry point to a fresh backing canvas for this probe.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const originalEnsureGpu = ensureCoverParticleGpu;
        const originalSyncCanvas = syncCoverParticleCanvas;
        const savedCover = Object.fromEntries(['particles', 'sampleSignature', 'fallbackLastFrameAt',
          'fallbackGlowContext', 'fallbackGlowWidth', 'fallbackGlowHeight', 'fallbackGlowCoverSize',
          'fallbackGlowBase', 'fallbackGlowEnergy'].map(key => [key, cover[key]]));
        const originalQuality = state.playbackVisual.quality;
        try {
          ensureCoverParticleGpu = () => false;
          syncCoverParticleCanvas = () => ({ canvas, width, height, dpr: 1 });
          cover.fallbackLastFrameAt = 0;
          drawCoverParticleScene(width, height, 1);
          rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        } finally {
          ensureCoverParticleGpu = originalEnsureGpu;
          syncCoverParticleCanvas = originalSyncCanvas;
          Object.assign(cover, savedCover);
          state.playbackVisual.quality = originalQuality;
        }
      } else if (cover.renderMode === 'particles') {
        drawCoverParticleScene(720, 720, 1);
        cover.gpuRenderer.render(cover.gpuScene, cover.gpuCamera);
        const gl = cover.gpuRenderer.getContext();
        width = gl.drawingBufferWidth;
        height = gl.drawingBufferHeight;
        rgba = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        glError = gl.getError();
        programs = cover.gpuRenderer.info.programs.map(program => program.diagnostics?.runnable !== false);
      } else {
        cover.sketchRenderer.render({ width: 720, height: 720, dpr: 1, now: 0, deltaMs: 0,
          image: cover.image, imageSignature: cover.imageSignature, settings: cover,
          yaw: 0, pitch: 0, zoom: 1, energy: 0, lightTime: 0, reducedMotion: true, mobile: false });
        const canvas = document.getElementById('coverSketchCanvas');
        rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const saved = window.__coverDepthMapFrames ||= {};
      const previous = saved[compare];
      let hash = 2166136261, visible = 0, chroma = 0, changed = 0, maxDelta = 0, darkened = 0, brightened = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ rgba[i + channel], 16777619);
        if (rgba[i + 3] <= 32) continue;
        visible++;
        chroma += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
        if (previous?.length === rgba.length && previous[i + 3] > 32) {
          const delta = Math.abs(rgba[i] - previous[i]) + Math.abs(rgba[i + 1] - previous[i + 1]) + Math.abs(rgba[i + 2] - previous[i + 2]);
          if (delta > 3) changed++;
          maxDelta = Math.max(maxDelta, delta, Math.abs(rgba[i + 3] - previous[i + 3]));
          const before = previous[i] * .2126 + previous[i + 1] * .7152 + previous[i + 2] * .0722;
          const after = rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722;
          if (before < 90 && after < before - 2) darkened++;
          if (before > 180 && after > before + 2) brightened++;
        }
      }
      saved[name] = rgba;
      (window.__coverDepthMapSizes ||= {})[name] = { width, height, flipY: cover.renderMode === 'particles' && !cpu };
      return { hash: hash >>> 0, visible, meanChroma: chroma / Math.max(1, visible), changed, maxDelta, darkened, brightened,
        glError, programs, cpu, enabled: cover.depthMapEnabled, mode: cover.renderMode, stats: cover.sketchRenderer?.getStats() };
    }, { name, compare, cpu });
    const saveCanvas = async name => {
      const png = await page.evaluate(name => {
        const { width, height, flipY } = window.__coverDepthMapSizes[name];
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        const context = source.getContext('2d');
        const pixels = context.createImageData(width, height);
        pixels.data.set(window.__coverDepthMapFrames[name]);
        context.putImageData(pixels, 0, 0);
        if (!flipY) return source.toDataURL('image/png');
        const flipped = document.createElement('canvas');
        flipped.width = width;
        flipped.height = height;
        const target = flipped.getContext('2d');
        target.translate(0, height);
        target.scale(1, -1);
        target.drawImage(source, 0, 0);
        return flipped.toDataURL('image/png');
      }, name);
      writeFileSync(path.join(output, `depth-map-${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    };
    const assertTransformed = (before, after, label) => {
      assert.ok(before.visible > 500 && after.visible > 500, `${label}: both states render visible cover pixels`);
      assert.ok(before.meanChroma > 10, `${label}: the source fixture really contains color`);
      assert.ok(after.meanChroma < before.meanChroma * .2, `${label}: the effect removes most source color`);
      assert.ok(after.changed > 500 && after.darkened > 500, `${label}: the effect visibly changes and deepens dark regions`);
      assert.ok(after.brightened > 100, `${label}: the effect also changes bright regions`);
      assert.equal(after.glError, 0);
    };
    const particleOff = await capture('particle-off');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await preferences(), originalPreferences, 'one click preserves render mode, depth settings and sketch density');
    const particleOn = await capture('particle-on', 'particle-off');
    assertTransformed(particleOff, particleOn, 'particles with depth disabled and strength zero');
    await saveCanvas('particle-off');
    await saveCanvas('particle-on');
    assert.ok(particleOn.programs.length && particleOn.programs.every(Boolean), 'depth-map particle shader compiles');
    await toggle.focus();
    await page.keyboard.press('Space');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'Space toggles the native button');
    const particleRestored = await capture('particle-restored', 'particle-off');
    assert.equal(particleRestored.hash, particleOff.hash, 'turning the effect off restores exact particle colors at the same frame');
    await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'Enter toggles the native button');
    await page.locator('[data-cover-render-mode="sketch"]').click();
    await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'changing to sketch retains the effect');
    await setInput('sketchLayers', 8);
    await setInput('sketchDensity', .9);
    await setInput('sketchFlowSpeed', 0);
    await setInput('sketchFlowAmplitude', 0);
    await toggle.click();
    await capture('sketch-warmup');
    const sketchOff = await capture('sketch-off');
    const sketchPreferences = await preferences();
    await toggle.click();
    const sketchOn = await capture('sketch-on', 'sketch-off');
    assertTransformed(sketchOff, sketchOn, 'sketch with depth disabled and strength zero');
    await saveCanvas('sketch-off');
    await saveCanvas('sketch-on');
    assert.deepEqual(await preferences(), sketchPreferences, 'sketch toggle preserves all existing settings');
    assert.equal(sketchOn.stats.textureBuilds, sketchOff.stats.textureBuilds, 'switching treatment reuses the sparse pencil layers');
    await toggle.click();
    const sketchRestored = await capture('sketch-restored', 'sketch-off');
    assert.equal(sketchRestored.hash, sketchOff.hash, 'turning the effect off restores exact sketch colors at the same frame');
    await toggle.click();
    await setCover('second');
    const secondSketchOn = await capture('second-sketch-on');
    assert.equal(secondSketchOn.enabled, true);
    assert.notEqual(secondSketchOn.hash, sketchOn.hash, 'the replacement cover is transformed instead of retaining the previous cover');
    await toggle.click();
    const secondSketchOff = await capture('second-sketch-off');
    assert.ok(secondSketchOn.meanChroma < secondSketchOff.meanChroma * .2, 'the replacement cover keeps the grayscale treatment');
    await toggle.click();
    await page.locator('[data-cover-render-mode="particles"]').click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'changing back to particles retains the effect');
    const secondParticleOn = await capture('second-particle-on');
    assert.notEqual(secondParticleOn.hash, particleOn.hash, 'particle treatment follows the replacement cover');
    await toggle.click();
    const secondParticleOff = await capture('second-particle-off');
    assert.ok(secondParticleOn.meanChroma < secondParticleOff.meanChroma * .2);
    await toggle.click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(COVER_PARTICLE_PREFS_KEY)));
    assert.equal(saved.depthMapEnabled, true);
    const beforeReload = await preferences();
    await page.reload();
    await boot(page);
    await page.evaluate(() => enterPresetPlaybackPage('cover-particles'));
    await openControls();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'the effect survives reload');
    assert.deepEqual(await preferences(), beforeReload, 'reload preserves mode, depth parameters and sparse-layer settings');
    await setCover('second');
    await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
    const reloaded = await capture('reloaded');
    assert.equal(reloaded.enabled, true);
    assert.ok(reloaded.visible > 500 && reloaded.meanChroma < 2);
    assert.equal(reloaded.glError, 0);
    await toggle.click();
    const cpuOff = await capture('cpu-off', '', true);
    await toggle.click();
    const cpuOn = await capture('cpu-on', 'cpu-off', true);
    assertTransformed(cpuOff, cpuOn, 'actual Canvas2D particle fallback');
    await toggle.click();
    const cpuRestored = await capture('cpu-restored', 'cpu-off', true);
    assert.equal(cpuRestored.hash, cpuOff.hash, 'CPU fallback restores exact original colors at the same frame');
    assert.equal(cpuRestored.maxDelta, 0);
    await toggle.click();
    const gpuAfterCpu = await capture('gpu-after-cpu');
    assert.equal(gpuAfterCpu.hash, reloaded.hash, 'restoring the original functions and caches leaves GPU rendering unchanged');
    assert.equal(gpuAfterCpu.glError, 0);
    await saveCanvas('cpu-off');
    await saveCanvas('cpu-on');
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    assert.deepEqual(shaderErrors, [], 'no WebGL or shader errors');
    writeFileSync(path.join(output, 'depth-map-toggle.json'), JSON.stringify({ particleOff, particleOn, particleRestored,
      sketchOff, sketchOn, sketchRestored, secondSketchOn, secondSketchOff, secondParticleOn, secondParticleOff, saved, reloaded,
      cpuOff, cpuOn, cpuRestored, gpuAfterCpu }, null, 2));
    await page.screenshot({ path: path.join(output, 'depth-map-toggle.png') });
    console.log('Cover depth-map toggle passed: click/keyboard, actual GPU/CPU/sketch grayscale contrast, exact color restoration, unchanged settings, mode/cover switches, persistence, zero-depth independence and no WebGL errors.');
    return;
  }
  if (process.argv.includes('--depth-recovery')) {
    await setCover('first');
    await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
    await setInput('sketchLayers', 16);
    await setInput('sketchDensity', .4);
    await setInput('depthStrength', 0);
    await setInput('depthAmbient', 1);
    await setInput('depthLightSpeed', 0);
    await setInput('depthHighlight', 2);
    assert.match(await page.locator('#coverDepthStatus').textContent(), /0%.*未生效/,
      'zero depth must be described as inactive even when its switch is enabled');
    const capture = () => page.evaluate(() => {
      const cover = state.coverParticle;
      cover.lightTime = 0;
      cover.motionAmplitude = 0;
      cover.gpuRenderSignature = '';
      state.orb.mouseActive = false;
      state.playbackVisual.yaw = PLAYBACK_REST_YAW;
      state.playbackVisual.pitch = PLAYBACK_REST_PITCH;
      drawCoverParticleScene(720, 720, 1);
      const gl = cover.gpuRenderer.getContext();
      cover.gpuRenderer.render(cover.gpuScene, cover.gpuCamera);
      const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
      const previous = window.__depthRecoveryPixels;
      let delta = 0, changed = 0;
      if (previous?.length === data.length) for (let i = 0; i < data.length; i += 4) {
        const difference = Math.abs(data[i] - previous[i]) + Math.abs(data[i + 1] - previous[i + 1]) + Math.abs(data[i + 2] - previous[i + 2]);
        delta += difference;
        if (difference > 8) changed++;
      }
      window.__depthRecoveryPixels = data;
      return { strength: cover.gpuMaterial.uniforms.uDepthStrength.value, lighting: cover.gpuMaterial.uniforms.uDepthLightingEnabled.value,
        meanDelta: delta / (data.length / 4 * 3), changed, glError: gl.getError() };
    });
    const inactive = await capture();
    assert.equal(inactive.strength, 0);
    assert.equal(inactive.lighting, 0);
    await page.locator('#coverDepthReset').click();
    await page.waitForFunction(() => state.coverParticle.depthStrength === 1 && state.coverParticle.depthLightSpeed === .25);
    const restored = await capture();
    assert.equal(restored.strength, 1);
    assert.equal(restored.lighting, 1);
    assert.equal(restored.glError, 0);
    assert.ok(restored.changed > 1500 && restored.meanDelta > .5, 'restoring depth must change real GPU pixels, not just the controls');
    assert.match(await page.locator('#coverDepthStatus').textContent(), /已启用/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(COVER_PARTICLE_PREFS_KEY)));
    assert.equal(saved.sketchLayers, 16);
    assert.equal(saved.sketchDensity, .4);
    assert.equal(saved.depthStrength, 1);
    assert.equal(saved.depthAmbient, .65);
    assert.equal(saved.depthHighlight, .35);
    await page.locator('[data-cover-render-mode="sketch"]').click();
    await setInput('depthStrength', 0);
    await page.locator('#coverDepthReset').click();
    assert.equal(await page.evaluate(() => state.coverParticle.renderMode), 'sketch', 'depth reset must preserve the selected cover style');
    assert.equal(await page.evaluate(() => state.coverParticle.sketchLayers), 16);
    assert.deepEqual(errors, []);
    assert.deepEqual(shaderErrors, []);
    writeFileSync(path.join(output, 'depth-recovery.json'), JSON.stringify({ inactive, restored, saved }, null, 2));
    console.log('Cover depth recovery passed: zero-state explanation, one-click defaults, actual GPU pixel change, saved settings and sketch preservation.');
    return;
  }
  assert.equal(await page.locator('#diyCoverParticleControl input[type="file"]').count(), 0, 'automatic cover depth needs no file chooser');
  assert.equal(await page.locator('#coverDepthMapFile, #coverDepthMapRemove').count(), 0, 'obsolete depth import and removal controls are absent');
  assert.equal(await page.getByText('导入灰度深度图', { exact: true }).count(), 0, 'automatic depth UI does not ask for an external map');
  if (process.argv.includes('--gpu-depth-off-smoke')) {
    await setCover('first');
    await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
    await setInput('depthEnabled', false);
    await page.waitForFunction(() => state.coverParticle.gpuMaterial.uniforms.uDepthStrength.value === 0
      && state.coverParticle.gpuMaterial.uniforms.uDepthLightingEnabled.value === 0);
    const smoke = await page.evaluate(() => {
      const cover = state.coverParticle;
      cover.gpuRenderer.render(cover.gpuScene, cover.gpuCamera);
      const gl = cover.gpuRenderer.getContext();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      return { visible, glError: gl.getError(), strength: cover.gpuMaterial.uniforms.uDepthStrength.value,
        lighting: cover.gpuMaterial.uniforms.uDepthLightingEnabled.value,
        programs: cover.gpuRenderer.info.programs.map(program => program.diagnostics?.runnable !== false) };
    });
    assert.equal(smoke.strength, 0);
    assert.equal(smoke.lighting, 0);
    assert.ok(smoke.visible > 500, 'disabled depth still renders visible particle cover pixels');
    assert.equal(smoke.glError, 0);
    assert.ok(smoke.programs.length && smoke.programs.every(Boolean));
    const transparent = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const image = new Image();
      image.src = canvas.toDataURL('image/png');
      await image.decode();
      const cover = state.coverParticle;
      cover.image = image;
      cover.imageSignature = 'transparent-cover-fixture';
      resetCoverParticleSamples();
      // Read the backing store immediately after the actual scene entry point draws.
      drawCoverParticleScene(els.canvas.width, els.canvas.height, renderPixelRatio('playback'));
      const gl = cover.gpuRenderer.getContext();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      return { particles: cover.particles.length, gpuFailed: cover.gpuFailed, visible, glError: gl.getError() };
    });
    assert.equal(transparent.particles, 0, 'transparent cover produces an empty particle set');
    assert.equal(transparent.gpuFailed, false, 'empty geometry does not disable GPU rendering');
    assert.equal(transparent.visible, 0, 'transparent cover clears pixels from the previous cover');
    assert.equal(transparent.glError, 0);
    await setCover('first');
    const recovered = await page.evaluate(() => {
      state.coverParticle.gpuRenderSignature = '';
      drawCoverParticleScene(els.canvas.width, els.canvas.height, renderPixelRatio('playback'));
      const cover = state.coverParticle;
      const gl = cover.gpuRenderer.getContext();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++;
      return { particles: cover.particles.length, gpuFailed: cover.gpuFailed, visible, glError: gl.getError() };
    });
    assert.ok(recovered.particles > 500 && recovered.visible > 500, 'normal cover recovers after a transparent cover');
    assert.equal(recovered.gpuFailed, false);
    assert.equal(recovered.glError, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(shaderErrors, []);
    writeFileSync(path.join(output, 'gpu-depth-off-smoke.json'), JSON.stringify({ ...smoke, transparent, recovered }, null, 2));
    console.log('Cover particle GPU smoke passed: depth-off rendering, transparent-cover clearing and recovery, no shader or WebGL errors.');
    return;
  }
  assert.equal(await page.locator('[data-cover-render-mode="particles"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-cover-render-mode="sketch"]').click();
  await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  assert.equal(await page.locator('#coverSketchCanvas').isVisible(), true);
  assert.equal(await page.locator('#coverParticleCanvas').isVisible(), false);
  assert.equal(await page.locator('[data-cover-render-mode="sketch"]').getAttribute('aria-pressed'), 'true');
  const initialLayers = await page.evaluate(() => state.coverParticle.sketchLayers);
  await page.locator('[data-cover-setting="sketchLayers"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => state.coverParticle.sketchLayers), initialLayers + 1, 'keyboard can adjust a labeled native range from its configured default');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => state.coverParticle.sketchLayers), initialLayers, 'keyboard can restore the configured default layer count');
  assert.equal(await page.evaluate(() => isPlaybackClockRunning()), false, 'fixture is paused');
  await setCover('first');
  await page.waitForFunction(() => state.coverParticle.sketchRenderer?.getStats().depthImageStatus === 'generated');
  await page.evaluate(() => setDiyOpen(false));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1800); // Remove scene entrance and interaction inertia from frame checks.
  const first = await pixels();
  await page.waitForTimeout(400);
  const flowing = await pixels();
  assert.ok(first.visible > 500, 'loaded cover produces visible strokes');
  assert.equal(first.stats.depthImageStatus, 'generated', 'cover A automatically generates its depth field');
  assert.ok(first.stats.depthSampleBuilds > 0, 'automatic depth generation records a completed sample');
  assert.equal(first.stats.layers, initialLayers, 'the renderer receives the configured default layer count');
  assert.notEqual(first.hash, flowing.hash, 'paused playback still flows without pointer interaction');
  await page.screenshot({ path: path.join(output, '01-sketch-idle.png') });
  if (initialLayers === 8) await page.screenshot({ path: path.join(output, '01-sketch-sparse-eight-layers.png') });
  await openControls();
  await setInput('sketchFlowSpeed', 0);
  await setInput('depthLightSpeed', 0);
  await page.evaluate(() => setDiyOpen(false));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1800);
  const stopped = await pixels();
  await page.waitForTimeout(450);
  assert.equal((await pixels()).hash, stopped.hash, 'zero flow and light speeds hold a stable paused frame');
  await openControls();
  await setInput('depthLightSpeed', .75);
  await page.evaluate(() => setDiyOpen(false));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1800);
  const lightSweep = await pixels();
  await page.waitForTimeout(450);
  const lightSweepLater = await pixels();
  assert.equal(await page.evaluate(() => state.coverParticle.sketchFlowSpeed), 0);
  assert.notEqual(lightSweepLater.hash, lightSweep.hash, 'depth light sweeps while line flow and playback are stopped');
  assert.ok(lightSweepLater.frameAt > lightSweep.frameAt, 'depth lighting keeps paused frames scheduled');
  await page.screenshot({ path: path.join(output, '01-sketch-depth-light-sweep.png') });
  await openControls();
  await setInput('depthLightingEnabled', false);
  for (const key of ['depthLightStrength', 'depthAmbient', 'depthLightAngle', 'depthLightSpeed', 'depthHighlight']) {
    assert.equal(await page.locator(`[data-cover-setting="${key}"]`).isDisabled(), true, `${key}: disabled when depth lighting is off`);
  }
  await page.evaluate(() => setDiyOpen(false));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1800);
  const unlit = await pixels();
  await page.waitForTimeout(450);
  const unlitLater = await pixels();
  assert.equal(unlitLater.frameAt, unlit.frameAt, 'lighting disabled stops idle scheduling despite nonzero light speed');
  assert.ok(unlitLater.meanPixelDelta < .05, 'lighting disabled leaves a stable paused cover');
  await openControls();
  await setInput('depthLightingEnabled', true);
  await setInput('depthLightSpeed', 0);
  await setInput('depthLightAngle', 45);
  await page.waitForTimeout(120);
  const lightAngleA = await pixels();
  await setInput('depthLightAngle', 225);
  await page.waitForTimeout(120);
  const lightAngleB = await pixels();
  assert.notEqual(lightAngleB.hash, lightAngleA.hash, 'light angle changes real cover shading without line motion');
  assert.equal(await page.locator('[data-cover-setting="depthLightAngle"]').getAttribute('aria-valuetext'), '225°', 'light angle exposes degrees rather than percentages');
  await setInput('depthLightStrength', 1.2);
  await page.waitForTimeout(120);
  const relit = await pixels();
  assert.notEqual(relit.hash, lightAngleB.hash, 'light intensity changes shading without replacing the cover');
  assert.equal(relit.stats.depthSampleBuilds, first.stats.depthSampleBuilds, 'lighting intensity reuses generated depth');
  await openControls();
  await setInput('depthEnabled', false);
  assert.equal(await page.locator('[data-cover-setting="depthStrength"]').isDisabled(), true);
  await page.waitForTimeout(120);
  const flat = await pixels();
  await setInput('depthEnabled', true);
  await setInput('depthStrength', 2.5);
  await setInput('depthContrast', 1.8);
  await page.waitForTimeout(120);
  const deep = await pixels();
  assert.notEqual(flat.hash, deep.hash, 'depth controls change actual rendered pixels');
  assert.equal(deep.stats.depthSampleBuilds, first.stats.depthSampleBuilds, 'light direction, intensity and depth strength reuse the generated depth samples');
  assert.equal(deep.stats.sampleBuilds, first.stats.sampleBuilds, 'lighting and depth controls do not resample the cover image');
  await setInput('depthInvert', true);
  await page.waitForTimeout(120);
  assert.notEqual((await pixels()).hash, deep.hash, 'depth inversion changes actual rendered pixels');
  await page.evaluate(() => setDiyOpen(false));
  const beforeImage = await pixels();
  await setCover('second');
  await page.waitForFunction(() => state.coverParticle.sketchRenderer?.getStats().depthImageStatus === 'generated');
  const secondImage = await pixels();
  assert.notEqual(secondImage.hash, beforeImage.hash, 'newly decoded cover wakes a stopped renderer');
  assert.ok(secondImage.stats.depthSampleBuilds > beforeImage.stats.depthSampleBuilds, 'cover B automatically rebuilds the depth field');
  await setCover('empty');
  const fallback = await pixels();
  assert.ok(fallback.visible > 500, 'missing cover has visible fallback');
  assert.equal(fallback.stats.depthImageStatus, 'placeholder', 'missing cover uses placeholder depth');
  assert.notEqual(fallback.hash, secondImage.hash, 'missing cover does not retain previous cover');
  await setCover('broken');
  const broken = await pixels();
  assert.ok(broken.visible > 500, 'failed cover decoding has visible fallback');
  assert.equal(broken.stats.depthImageStatus, 'placeholder', 'failed cover decoding never retains another cover depth field');
  await setCover('first');
  await openControls();
  await page.waitForFunction(() => state.coverParticle.sketchRenderer?.getStats().depthImageStatus === 'generated');
  const regeneratedDepth = await pixels();
  for (const [key, value] of Object.entries(settings)) await setInput(key, value);
  const expected = { renderMode: 'sketch', ...settings };
  const snapshots = await page.evaluate(async keys => {
    const select = (source, selectedKeys = keys) => Object.fromEntries(selectedKeys.map(key => [key, source[key]]));
    const mapKeys = ['depthMapDataUrl', 'depthMapName', 'depthMapSource'];
    const shared = communitySharedSceneSnapshot();
    const desktop = desktopSceneSnapshot();
    const diy = builtinDiyPresetConfiguration();
    const stored = JSON.parse(localStorage.getItem('fe-monster-cover-particle-v1'));
    const sharedLocalMapKeys = mapKeys.filter(key => Object.hasOwn(shared.coverParticle, key));
    const storedLocalMapKeys = mapKeys.filter(key => Object.hasOwn(stored, key));
    const desktopLocalMapKeys = mapKeys.filter(key => Object.hasOwn(desktop.coverVisualSettings, key));
    setCoverRenderMode('particles');
    await applyCommunitySharedScene(shared);
    saveCoverParticlePreferences();
    saveVisualSettingsPreferences({ immediate: true });
    return {
      stored: select(stored), shared: select(shared.coverParticle, keys.filter(key => !mapKeys.includes(key))),
      desktop: select(desktop.coverVisualSettings), restored: select(state.coverParticle),
      sharedLocalMapKeys, storedLocalMapKeys, desktopLocalMapKeys, diy
    };
  }, visualKeys);
  for (const name of ['stored', 'desktop', 'restored']) assert.deepEqual(snapshots[name], expected, `${name}: complete cover settings round trip`);
  assert.deepEqual(snapshots.shared, { renderMode: 'sketch', ...settings }, 'community sharing preserves scalar cover and light settings');
  for (const key of ['sharedLocalMapKeys', 'storedLocalMapKeys', 'desktopLocalMapKeys']) {
    assert.deepEqual(snapshots[key], [], `${key}: automatic depth persists settings without obsolete image fields`);
  }
  assert.equal(snapshots.diy.runtimeControls.coverRenderMode, '素描封面');
  assert.equal(snapshots.diy.runtimeControls.sketchLayers, 6);
  const desktopSnapshot = await page.evaluate(() => desktopSceneSnapshot());
  const desktopPage = await browser.newPage({ viewport: { width: 1000, height: 720 } });
  desktopPage.on('pageerror', error => errors.push(error.message));
  await desktopPage.goto(`${baseUrl}/?client=desktop-scene`);
  await desktopPage.waitForFunction(() => typeof desktopSceneRuntime !== 'undefined' && desktopSceneRuntime.ready, null, { timeout: 30000 });
  await desktopPage.evaluate(snapshot => applyDesktopSceneSnapshot(snapshot), desktopSnapshot);
  await desktopPage.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  await desktopPage.waitForFunction(() => state.coverParticle.sketchRenderer?.getStats().depthImageStatus === 'generated');
  snapshots.desktopRestored = await desktopPage.evaluate(keys => Object.fromEntries(keys.map(key => [key, state.coverParticle[key]])), visualKeys);
  assert.deepEqual(snapshots.desktopRestored, expected, 'desktop client applies every serialized cover and light parameter');
  await desktopPage.close();
  await openControls();
  await page.screenshot({ path: path.join(output, '02-sketch-controls.png') });
  await page.locator('[data-cover-render-mode="sketch"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '02-sketch-mode-controls.png') });
  await page.evaluate(legacy => {
    const previous = JSON.parse(localStorage.getItem('fe-monster-cover-particle-v1'));
    localStorage.setItem('fe-monster-cover-particle-v1', JSON.stringify({ ...previous, ...legacy }));
  }, legacyDepthPreferences);
  await page.reload();
  await boot(page);
  assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, state.coverParticle[key]])), visualKeys), expected, 'all parameters survive reload');
  const legacyMigration = await page.evaluate(keys => {
    const stored = JSON.parse(localStorage.getItem('fe-monster-cover-particle-v1'));
    const desktop = desktopSceneSnapshot().coverVisualSettings;
    return { runtime: keys.filter(key => Object.hasOwn(state.coverParticle, key)),
      stored: keys.filter(key => Object.hasOwn(stored, key)), desktop: keys.filter(key => Object.hasOwn(desktop, key)) };
  }, Object.keys(legacyDepthPreferences));
  assert.deepEqual(legacyMigration, { runtime: [], stored: [], desktop: [] }, 'reload discards obsolete imported-map preferences from runtime and persistent settings');
  await page.evaluate(() => enterPresetPlaybackPage('cover-particles'));
  await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  await setCover('second');
  await page.waitForFunction(() => state.coverParticle.sketchRenderer?.getStats().depthImageStatus === 'generated');
  const migratedDepth = await pixels();
  assert.ok(migratedDepth.visible > 500, 'legacy preferences do not prevent automatic depth for the current cover');
  await page.screenshot({ path: path.join(output, '04-sketch-automatic-depth.png') });
  await openControls();
  await page.locator('[data-cover-render-mode="particles"]').click();
  assert.equal(await page.locator('#coverParticleCanvas').isVisible(), true);
  assert.equal(await page.locator('#coverSketchCanvas').isVisible(), false);
  await page.waitForFunction(() => !!state.coverParticle.gpuMaterial && !!state.coverParticle.gpuRenderer);
  await setCover('first');
  const particlePixels = () => page.evaluate(() => {
    const cover = state.coverParticle;
    const renderer = cover.gpuRenderer;
    // Read immediately after a draw: the default WebGL backing store is not preserved.
    renderer.render(cover.gpuScene, cover.gpuCamera);
    const gl = renderer.getContext();
    const rgba = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    let visible = 0, hash = 2166136261;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3]) visible++;
      for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ rgba[i + channel], 16777619);
    }
    const normals = cover.gpuGeometry.getAttribute('aNormal');
    const positions = cover.gpuGeometry.getAttribute('position');
    let depthHash = 2166136261, normalHash = 2166136261, minimumDepth = Infinity, maximumDepth = -Infinity;
    let slopedNormals = 0;
    if (normals) for (let i = 0; i < normals.count; i++) {
      if (Math.hypot(normals.getX(i), normals.getY(i)) > .01) slopedNormals++;
      normalHash = Math.imul(normalHash ^ Math.round(normals.getX(i) * 1e6), 16777619);
      normalHash = Math.imul(normalHash ^ Math.round(normals.getY(i) * 1e6), 16777619);
      normalHash = Math.imul(normalHash ^ Math.round(normals.getZ(i) * 1e6), 16777619);
    }
    for (let i = 0; i < positions.count; i++) {
      const depth = positions.getZ(i);
      depthHash = Math.imul(depthHash ^ Math.round(depth * 1e6), 16777619);
      minimumDepth = Math.min(minimumDepth, depth);
      maximumDepth = Math.max(maximumDepth, depth);
    }
    const uniforms = cover.gpuMaterial.uniforms;
    return {
      visible, hash: hash >>> 0, glError: gl.getError(),
      strength: uniforms.uDepthStrength.value,
      contrast: uniforms.uDepthContrast.value,
      invert: uniforms.uDepthInvert.value,
      light: {
        enabled: uniforms.uDepthLightingEnabled.value,
        strength: uniforms.uDepthLightStrength.value,
        ambient: uniforms.uDepthAmbient.value,
        highlight: uniforms.uDepthHighlight.value,
        direction: uniforms.uDepthLightDirection.value.toArray()
      },
      normals: { count: normals?.count, positions: positions.count, sloped: slopedNormals, hash: normalHash >>> 0 },
      depth: { hash: depthHash >>> 0, minimum: minimumDepth, maximum: maximumDepth },
      programs: renderer.info.programs.map(program => ({ runnable: program.diagnostics?.runnable !== false }))
    };
  });
  const particleGpu = await particlePixels();
  assert.ok(particleGpu.visible > 500, 'particle shader renders visible pixels after switching back');
  assert.equal(particleGpu.glError, 0);
  assert.equal(particleGpu.strength, settings.depthStrength);
  assert.equal(particleGpu.contrast, settings.depthContrast);
  assert.equal(particleGpu.invert, 1);
  assert.equal(particleGpu.light.enabled, 1);
  assert.equal(particleGpu.light.strength, settings.depthLightStrength);
  assert.equal(particleGpu.light.ambient, settings.depthAmbient);
  assert.equal(particleGpu.light.highlight, settings.depthHighlight);
  assert.equal(particleGpu.normals.count, particleGpu.normals.positions, 'each particle receives a depth normal');
  assert.ok(particleGpu.normals.sloped > 20, 'cover relief generates nonflat particle normals');
  assert.ok(particleGpu.depth.maximum > particleGpu.depth.minimum, 'automatic cover depth produces nonflat GPU geometry');
  assert.ok(particleGpu.programs.length && particleGpu.programs.every(program => program.runnable), 'particle programs compile');
  let particleDepthGeneration;
  await page.evaluate(() => {
    window.__coverDepthFieldOriginal = window.FeCoverDepthLight.buildField;
    window.__coverDepthFieldCalls = 0;
    window.FeCoverDepthLight.buildField = (...args) => {
      window.__coverDepthFieldCalls++;
      return window.__coverDepthFieldOriginal(...args);
    };
  });
  try {
    await setCover('second');
    const secondGpu = await particlePixels();
    const buildsAfterCoverChange = await page.evaluate(() => window.__coverDepthFieldCalls);
    assert.ok(buildsAfterCoverChange > 0, 'a newly decoded particle cover generates its own depth field');
    assert.notEqual(secondGpu.depth.hash, particleGpu.depth.hash, 'particle cover B has different generated Z coordinates from cover A');
    assert.notEqual(secondGpu.normals.hash, particleGpu.normals.hash, 'particle cover B has different generated normals from cover A');
    await setInput('depthStrength', 2.3);
    await setInput('depthLightAngle', 135);
    await page.waitForTimeout(120);
    const adjustedGpu = await particlePixels();
    const buildsAfterParameters = await page.evaluate(() => window.__coverDepthFieldCalls);
    assert.equal(buildsAfterParameters, buildsAfterCoverChange, 'particle depth strength and light direction reuse the generated field');
    assert.equal(adjustedGpu.depth.hash, secondGpu.depth.hash, 'particle depth parameters act on cached geometry');
    assert.equal(adjustedGpu.normals.hash, secondGpu.normals.hash, 'particle lighting parameters act on cached normals');
    assert.equal(adjustedGpu.strength, 2.3);
    particleDepthGeneration = { secondGpu, adjustedGpu, buildsAfterCoverChange, buildsAfterParameters };
    await setInput('depthStrength', settings.depthStrength);
    await setInput('depthLightAngle', settings.depthLightAngle);
    await setCover('first');
  } finally {
    await page.evaluate(() => {
      window.FeCoverDepthLight.buildField = window.__coverDepthFieldOriginal;
      delete window.__coverDepthFieldOriginal;
      delete window.__coverDepthFieldCalls;
    });
  }
  await page.waitForTimeout(450);
  const particleSweep = await particlePixels();
  assert.notDeepEqual(particleSweep.light.direction, particleGpu.light.direction, 'paused particle light advances independently of playback');
  assert.notEqual(particleSweep.hash, particleGpu.hash, 'particle light sweep changes actual GPU pixels');
  await setInput('depthLightSpeed', 0);
  await setInput('depthLightAngle', 45);
  await page.waitForTimeout(120);
  const particleAngleA = await particlePixels();
  await setInput('depthLightAngle', 225);
  await page.waitForTimeout(120);
  const particleAngleB = await particlePixels();
  assert.notEqual(particleAngleA.hash, particleAngleB.hash, 'stationary particle lighting responds to direction control');
  await setInput('depthLightingEnabled', false);
  await page.waitForFunction(() => state.coverParticle.gpuMaterial.uniforms.uDepthLightingEnabled.value === 0);
  await setInput('depthLightingEnabled', true);
  await setInput('depthEnabled', false);
  await page.waitForFunction(() => state.coverParticle.gpuMaterial.uniforms.uDepthStrength.value === 0);
  await setInput('depthEnabled', true);
  await page.locator('[data-cover-render-mode="sketch"]').click();
  await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  await page.evaluate(() => { setDiyOpen(false); enterPresetPlaybackPage('lyric'); });
  assert.equal(await page.evaluate(() => state.coverParticle.sketchRenderer), null, 'leaving scene releases sketch renderer');
  assert.deepEqual(await page.locator('#coverSketchCanvas').evaluate(canvas => [canvas.width, canvas.height]), [1, 1], 'leaving scene releases canvas backing store');
  await page.evaluate(() => enterPresetPlaybackPage('cover-particles'));
  await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  await setCover('first');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await pixels();
  assert.ok(mobile.visible > 100, 'small viewport retains visible strokes');
  assert.ok(mobile.width < first.width, 'canvas resizes with the viewport');
  await page.screenshot({ path: path.join(output, '03-sketch-mobile.png') });
  page = await browser.newPage({ viewport: { width: 1000, height: 720 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(settings => localStorage.setItem('fe-monster-cover-particle-v1', JSON.stringify(settings)), expected);
  await page.goto(baseUrl);
  await boot(page);
  await page.evaluate(() => enterPresetPlaybackPage('cover-particles'));
  await page.waitForFunction(() => !!state.coverParticle.sketchRenderer);
  await setCover('first');
  await page.waitForTimeout(1800);
  const reduced = await pixels();
  await page.waitForTimeout(450);
  const reducedLater = await pixels();
  assert.equal(reducedLater.frameAt, reduced.frameAt, 'reduced-motion preference stops idle frame scheduling even with nonzero speed');
  // Canvas readback can change subpixel color rounding when Chrome moves its
  // backing store between GPU and CPU; compare visual difference, not exact bits.
  assert.ok(reducedLater.meanPixelDelta < .05, 'reduced-motion canvas remains visually stationary');
  assert.ok(reduced.visible > 500, 'reduced motion retains the cover');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  assert.deepEqual(shaderErrors, [], 'no shader compilation errors');
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ initialLayers, first, flowing, stopped, lightSweep, lightSweepLater, unlit, unlitLater, lightAngleA, lightAngleB, relit, flat, deep, secondImage, fallback, broken, regeneratedDepth, legacyMigration, migratedDepth, mobile, reduced, reducedLater, particleGpu, particleDepthGeneration, particleSweep, particleAngleA, particleAngleB, snapshots, errors, shaderErrors }, null, 2));
  console.log('Cover sketch browser checks passed: automatic current-cover depth generation and resampling cache, no import UI, obsolete-map preference migration, UI/keyboard switching, paused flow and depth light sweep, zero-speed/disabled-light rest, light direction, depth/inversion, cover loading/fallback, all settings persistence, shared and actual desktop-client round trips, resource disposal, small viewport, reduced motion and particle GPU depth shaders.');
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    console.error(JSON.stringify({ errors, state: await page.evaluate(() => ({ mode: typeof state === 'undefined' ? null : state.coverParticle?.renderMode, preset: typeof state === 'undefined' ? null : state.diyPreset, renderer: typeof state === 'undefined' ? null : state.coverParticle?.sketchRenderer?.getStats() })).catch(() => null) }, null, 2));
  }
  throw error;
} finally {
  await browser?.close();
  server.close();
}
}
await runChecks();
