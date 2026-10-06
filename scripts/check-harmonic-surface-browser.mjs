import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const location of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(location)); break; } catch { /* Try the local bundled runtime. */ }
}
assert.ok(chromium, 'Playwright is required for real WebGL surface verification');
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/playwright/harmonic-surface');
mkdirSync(output, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true,
  ...(!existsSync(chromium.executablePath()) && edge ? { executablePath: edge } : {}),
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
});
const errors = [], evidence = {};
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#02050a}canvas{display:block}</style>');
  for (const file of ['vendor/three.r128.min.js', 'harmonic-state-settings.js', 'harmonic-orbital-core.js']) {
    await page.addScriptTag({ content: readFileSync(path.join(root, 'web', file), 'utf8') });
  }
  await page.evaluate(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(720, 720); renderer.setClearColor(0x02050a, 0);
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
    camera.position.set(0, 0, 19); camera.lookAt(0, 0, 0);
    const core = FeHarmonicOrbitalCore.create(THREE); scene.add(core.group);
    const defaults = { ...FeHarmonicSettings.defaults, surfaceRiseEnabled: false, ringsEnabled: false, raysEnabled: false, glowStrength: 0,
      floatAmount: 0, flashDensity: 1, flashIntensity: 1.4, shakeStrength: 1 };
    const frame = { delta: .05, playing: true, bass: .85, mid: .3, treble: .15 };
    for (let i = 0; i < 24; i++) core.update({ ...frame, settings: defaults });
    const gl = renderer.getContext(), samples = new Map();
    function draw(changes = {}, name, playback = {}, settleSeconds = 0) {
      const settings = { ...defaults, ...changes };
      let remaining = settleSeconds;
      // Rise levels move with real frame deltas, so paused comparisons run the
      // transition out before sampling the independent steady state.
      while (remaining > 1e-9) {
        const delta = Math.min(1 / 60, remaining);
        core.update({ ...frame, ...playback, delta, settings });
        remaining -= delta;
      }
      core.update({ ...frame, ...playback, delta: 0, settings });
      renderer.render(scene, camera);
      const pixels = new Uint8Array(720 * 720 * 4); gl.readPixels(0, 0, 720, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (name) samples.set(name, pixels);
      return { diagnostics: core.diagnostics(), glError: gl.getError(), triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls, memory: { ...renderer.info.memory } };
    }
    function compare(a, b) {
      const first = samples.get(a), second = samples.get(b);
      let colorDifference = 0, changed = 0, alphaChanged = 0, brightA = 0, brightB = 0;
      for (let i = 0; i < first.length; i += 4) {
        const d = Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]);
        colorDifference += d; if (d > 8) changed++;
        if (first[i + 3] !== second[i + 3]) alphaChanged++;
        brightA += first[i] + first[i + 1] + first[i + 2]; brightB += second[i] + second[i + 1] + second[i + 2];
      }
      return { colorDifference, changed, alphaChanged, brightA, brightB };
    }
    function synchronizedSelection() {
      const settings = { ...defaults, cubeColorMode: 'custom', cubeColor: '#386978', floatSpeed: 0,
        flashMode: 'shake', flashDensity: .32, flashSoftness: .65 };
      const advanceSeconds = seconds => {
        while (seconds > 1e-10) {
          const delta = Math.min(.05, seconds);
          core.update({ ...frame, delta, settings }); seconds -= delta;
        }
      };
      // Stabilize audio; a 2π phase advance repeats all three exact motion
      // oscillators and the old decorative glow while keeping the view fixed.
      advanceSeconds(6);
      const phase = core.diagnostics().shakePhase % (Math.PI * 2);
      advanceSeconds((Math.PI * 2 + Math.PI / 2 - phase) % (Math.PI * 2));
      const masks = [], diagnostics = [], frameDifferences = [];
      const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), normal = new THREE.Vector3(), eye = new THREE.Vector3();
      for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle) advanceSeconds(Math.PI * 2);
        draw({ ...settings, flashEnabled: false }, 'cycle-base-' + cycle);
        diagnostics.push(draw(settings, 'cycle-lit-' + cycle).diagnostics);
        const base = samples.get('cycle-base-' + cycle), lit = samples.get('cycle-lit-' + cycle), mask = {};
        for (let tile = 0; tile < core.tiles.count; tile++) {
          core.tiles.getMatrixAt(tile, matrix);
          point.set(0, 0, .5).applyMatrix4(matrix).applyMatrix4(core.tiles.matrixWorld);
          normal.set(0, 0, 1).transformDirection(matrix).transformDirection(core.tiles.matrixWorld);
          eye.copy(camera.position).sub(point).normalize();
          if (normal.dot(eye) < .15) continue;
          point.project(camera);
          const x = Math.floor((point.x + 1) * 360), y = Math.floor((point.y + 1) * 360);
          if (x < 1 || x >= 719 || y < 1 || y >= 719) continue;
          const i = (y * 720 + x) * 4;
          mask[tile] = lit[i] + lit[i + 1] + lit[i + 2] - base[i] - base[i + 1] - base[i + 2] > 45;
        }
        masks.push(mask);
        if (cycle) frameDifferences.push(compare('cycle-base-0', 'cycle-base-' + cycle));
      }
      const changes = masks.slice(1).map((mask, index) => {
        const before = masks[index]; let newlyLit = 0, newlyDark = 0, stayedLit = 0;
        for (const tile of Object.keys(mask)) {
          if (mask[tile] && !before[tile]) newlyLit++;
          if (!mask[tile] && before[tile]) newlyDark++;
          if (mask[tile] && before[tile]) stayedLit++;
        }
        return { newlyLit, newlyDark, stayedLit, sampledTiles: Object.keys(mask).length };
      });
      draw(settings, 'selection-frozen');
      for (let i = 0; i < 20; i++) core.update({ ...frame, playing: false, settings });
      draw(settings, 'selection-paused');
      for (let i = 0; i < 20; i++) core.update({ ...frame, bass: 1, reducedMotion: true, settings });
      draw(settings, 'selection-reduced');
      return { changes, frameDifferences, diagnostics,
        paused: compare('selection-frozen', 'selection-paused'), reducedMotion: compare('selection-frozen', 'selection-reduced') };
    }
    window.surface = { draw, compare, synchronizedSelection, advance(count = 1) { for (let i = 0; i < count; i++) core.update({ ...frame, settings: defaults }); },
      finish() { const before = { ...renderer.info.memory }; core.dispose(); renderer.render(scene, camera);
        const after = { ...renderer.info.memory }; renderer.dispose(); return { before, after, contextLost: gl.isContextLost() }; } };
  });
  const capture = async (changes, name, playback = {}, settleSeconds = 0) => page.evaluate(
    ({ changes, name, playback, settleSeconds }) => surface.draw(changes, name, playback, settleSeconds),
    { changes, name, playback, settleSeconds });
  assert.equal(await page.evaluate(() => FeHarmonicSettings.defaults.surfaceRiseEnabled), true,
    'new harmonic defaults enable the raised surface while flashing');
  evidence.initial = await capture({ flashEnabled: false }, 'plain');
  assert.equal(evidence.initial.glError, 0);
  assert.equal(evidence.initial.diagnostics.rippleAmplitude, 0, 'this flat comparison baseline opts out explicitly');
  evidence.modes = {};
  for (const mode of ['shake', 'random', 'gradient']) {
    await capture({ flashMode: mode }, mode);
    const difference = await page.evaluate(mode => surface.compare('plain', mode), mode);
    assert.ok(difference.changed > 300, `${mode} changes actual framebuffer radiance across surface tiles`);
    assert.equal(difference.alphaChanged, 0, `${mode} preserves the exact flat surface silhouette`);
    evidence.modes[mode] = difference;
    await page.screenshot({ path: path.join(output, mode + '.png') });
  }
  for (const [name, changes] of [['zero-intensity', { flashIntensity: 0 }], ['zero-density', { flashDensity: 0 }]]) {
    await capture(changes, name);
    assert.equal((await page.evaluate(name => surface.compare('plain', name), name)).changed, 0, `${name} disables all flash radiance`);
  }
  evidence.parameters = [];
  for (const [key, low, high] of [
    ['flashIntensity', .15, 1.8], ['flashDensity', .1, 1], ['flashSoftness', .05, 1], ['flashAudioStrength', 0, 2],
    ['flashColorA', '#ff1600', '#0016ff'], ['flashColorB', '#ff1600', '#0016ff'], ['flashColorC', '#20ff76', '#ff20d9']
  ]) {
    const colorProbe = key.startsWith('flashColor')
      ? { flashMode: 'gradient', flashDensity: 1, flashIntensity: 1.5 }
      : {};
    await capture({ ...colorProbe, [key]: low }, 'low'); await capture({ ...colorProbe, [key]: high }, 'high');
    const difference = await page.evaluate(() => surface.compare('low', 'high'));
    assert.ok(difference.changed > 200, `${key} visibly changes rendered surface pixels`);
    assert.equal(difference.alphaChanged, 0, `${key} never displaces geometry`);
    evidence.parameters.push({ key, ...difference });
  }
  await capture({ flashEnabled: false, cubeColorMode: 'custom', cubeColor: '#dd2200' }, 'red');
  await capture({ flashEnabled: false, cubeColorMode: 'custom', cubeColor: '#0022dd' }, 'blue');
  evidence.cubeColor = await page.evaluate(() => surface.compare('red', 'blue'));
  assert.ok(evidence.cubeColor.changed > 20000, 'independent cube paint reaches the real flat tiled surface');
  await capture({ flashEnabled: false, surfaceRiseEnabled: true, bassRiseStrength: 2 }, 'raised');
  evidence.optInRise = await page.evaluate(() => surface.compare('plain', 'raised'));
  assert.ok(evidence.optInRise.alphaChanged > 100, 'only the explicit rise switch changes the rendered silhouette');
  const heightSettings = { flashEnabled: false, surfaceRiseEnabled: true };
  const maximumHeight = await capture({ ...heightSettings, bassRiseStrength: 5 }, 'raised-five');
  assert.equal(maximumHeight.diagnostics.surface.bassRiseStrength, 5, 'the extended height reaches the rendered core');
  const extendedHeight = await page.evaluate(() => surface.compare('raised', 'raised-five'));
  assert.ok(extendedHeight.alphaChanged > 100, 'raising bass height from two to five changes the actual silhouette');
  await capture({ ...heightSettings, bassRiseStrength: 6 }, 'raised-capped');
  const cappedHeight = await page.evaluate(() => surface.compare('raised-five', 'raised-capped'));
  assert.equal(cappedHeight.colorDifference, 0, 'out-of-range height renders exactly like the new maximum');
  assert.equal(cappedHeight.alphaChanged, 0, 'the shader respects the new maximum height');
  await capture({ ...heightSettings, bassRiseStrength: .9, rippleStrength: 0 }, 'music-idle-low');
  await capture({ ...heightSettings, bassRiseStrength: .9, rippleStrength: 2 }, 'music-idle-high');
  const musicIgnoresIdle = await page.evaluate(() => surface.compare('music-idle-low', 'music-idle-high'));
  assert.equal(musicIgnoresIdle.colorDifference, 0, 'idle height cannot change any rendered playing pixel');
  assert.equal(musicIgnoresIdle.alphaChanged, 0, 'idle height cannot change the playing silhouette');
  await capture({ ...heightSettings, bassRiseStrength: 0, rippleStrength: 2 }, 'music-flat');
  const musicHeight = await page.evaluate(() => surface.compare('music-flat', 'raised'));
  assert.ok(musicHeight.alphaChanged > 100, 'bass height changes the actual playing geometry');
  assert.equal((await page.evaluate(() => surface.compare('plain', 'music-flat'))).colorDifference, 0,
    'zero bass height renders the flat reference despite maximum idle height');
  await capture({ ...heightSettings, bassRiseStrength: 0, rippleStrength: .8 }, 'idle-bass-low', { playing: false }, 2);
  await capture({ ...heightSettings, bassRiseStrength: 5, rippleStrength: .8 }, 'idle-bass-high', { playing: false }, 2);
  const idleIgnoresMusic = await page.evaluate(() => surface.compare('idle-bass-low', 'idle-bass-high'));
  assert.equal(idleIgnoresMusic.colorDifference, 0, 'bass height cannot change any rendered idle pixel');
  assert.equal(idleIgnoresMusic.alphaChanged, 0, 'bass height cannot change the idle silhouette');
  await capture({ ...heightSettings, bassRiseStrength: 5, rippleStrength: 0 }, 'idle-flat', { playing: false }, 2);
  await capture({ ...heightSettings, bassRiseStrength: 0, rippleStrength: 2 }, 'idle-raised', { playing: false }, 2);
  const idleHeight = await page.evaluate(() => surface.compare('idle-flat', 'idle-raised'));
  assert.ok(idleHeight.alphaChanged > 20, 'idle ripple height changes actual paused geometry');
  // Pausing must retract the raised surface with a transition: the pause frame
  // keeps the raised silhouette, the retraction progresses over the following
  // frames, and it settles exactly on the idle ripple surface.
  await capture({ ...heightSettings, bassRiseStrength: 2, rippleStrength: 2 }, 'pause-playing', { playing: true }, 1);
  await capture({ ...heightSettings, bassRiseStrength: 2, rippleStrength: 2 }, 'pause-frame', { playing: false });
  await capture({ ...heightSettings, bassRiseStrength: 2, rippleStrength: 2 }, 'pause-midway', { playing: false }, .2);
  const pauseSettledCapture = await capture({ ...heightSettings, bassRiseStrength: 2, rippleStrength: 2 }, 'pause-settled', { playing: false }, 2);
  const pauseFrame = await page.evaluate(() => surface.compare('pause-playing', 'pause-frame'));
  const pauseMidway = await page.evaluate(() => surface.compare('pause-playing', 'pause-midway'));
  const pauseProgress = await page.evaluate(() => surface.compare('pause-midway', 'pause-settled'));
  const pauseRetracted = await page.evaluate(() => surface.compare('pause-playing', 'pause-settled'));
  assert.equal(pauseFrame.alphaChanged, 0, 'the pause frame keeps the raised silhouette instead of snapping flat');
  assert.equal(pauseFrame.colorDifference, 0, 'the pause frame leaves the raised surface pixels untouched');
  assert.ok(pauseMidway.alphaChanged > 20, 'the raised surface starts retracting after the pause');
  assert.ok(pauseProgress.alphaChanged > 20, 'the retraction keeps progressing instead of switching in one frame');
  assert.ok(pauseRetracted.alphaChanged > 20, 'the pause transition ends on the retracted idle surface');
  assert.ok(Math.abs(pauseSettledCapture.diagnostics.rippleAmplitude - 2 * .055) < 1e-9,
    'the settled pause keeps no residual music lift, only the idle ripple height');
  evidence.pauseTransition = { pauseFrame, pauseMidway, pauseProgress, pauseRetracted,
    settledRippleAmplitude: pauseSettledCapture.diagnostics.rippleAmplitude };
  evidence.independentRise = { extendedHeight, cappedHeight, musicIgnoresIdle, musicHeight, idleIgnoresMusic, idleHeight };
  evidence.synchronizedSelection = await page.evaluate(() => surface.synchronizedSelection());
  for (const change of evidence.synchronizedSelection.changes) {
    assert.ok(change.newlyLit > 20 && change.newlyDark > 20,
      'returning to the same oscillation phase selects new tile positions, instead of only changing fixed tiles in brightness');
  }
  for (const difference of evidence.synchronizedSelection.frameDifferences) {
    assert.ok(difference.changed < 50 && difference.alphaChanged < 5, 'same-phase comparisons hold geometry, paint and lighting stable');
  }
  assert.equal(evidence.synchronizedSelection.paused.colorDifference, 0, 'pause freezes randomized synchronized flashing exactly');
  assert.equal(evidence.synchronizedSelection.reducedMotion.colorDifference, 0, 'reduced motion freezes the current tile selection and pulse');
  const resources = await capture({}, 'resources');
  await page.evaluate(() => surface.advance(80));
  const later = await capture({}, 'later');
  assert.deepEqual(later.memory, resources.memory, 'animation reuses all GPU resources');
  assert.equal(later.calls, resources.calls, 'surface flashing adds no render passes');
  evidence.renderCalls = later.calls; evidence.gpuMemory = later.memory;
  evidence.disposal = await page.evaluate(() => surface.finish());
  assert.equal(evidence.disposal.after.geometries, 0, 'all surface geometries release after disposal');
  assert.equal(evidence.disposal.after.textures, 0);
  assert.deepEqual(errors, [], 'production Three r128 shaders compile and render without errors');
  console.log('PASS harmonic surface WebGL: all three modes, synchronized pulses reselect tile positions, pause/reduced freeze, shared flat silhouette, three flash colors, every brightness parameter, independent paint, explicit rise and stable GPU memory');
} finally {
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ errors, evidence }, null, 2));
  await browser.close();
}
