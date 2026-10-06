import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
// Measured baseline: 120ms per asset produced 240ms ready time in all three
// cold trials. 120 visible frames with 800 particles issued 96,000 drawImage
// calls and 120 fills/clears. Keep the network and canvas gains separate.
const measureOnly = process.argv.includes('--measure-only');
const extract = (name) => {
  const source = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];
  assert.ok(source, `${name} exists`);
  return source;
};
const descriptorStart = app.indexOf('const PRESET_RUNTIME_SOURCES =');
const descriptorEnd = app.indexOf('let presetRuntimeActivationToken', descriptorStart);
const descriptorSource = app.slice(descriptorStart, descriptorEnd);
const drain = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };

async function measureLoader() {
  let now = 0;
  let mountedAt = null;
  const scripts = [];
  const requests = [];
  const events = [];
  const window = {};
  let context;
  const document = {
    scripts,
    createElement() {
      const listeners = new Map();
      return {
        dataset: {}, getAttribute(name) { return this[name]; },
        addEventListener(name, callback) {
          if (!listeners.has(name)) listeners.set(name, []);
          listeners.get(name).push(callback);
        },
        emit(name) { for (const callback of listeners.get(name) || []) callback(); }
      };
    },
    head: { appendChild(script) {
      scripts.push(script);
      requests.push({ source: script.src.split('?')[0], startedAt: now });
      events.push({ at: now + 120, sequence: requests.length, run() {
        // Evaluate the real modules in request-completion order. This also
        // checks that they register without reading each other's factories.
        vm.runInContext(readFileSync(new URL(`../web/${script.src.split('?')[0]}`, import.meta.url), 'utf8'), context);
        script.emit('load');
      } });
    } }
  };
  context = vm.createContext({ window, document, removeElement() {} });
  vm.runInContext(`${descriptorSource}\n${extract('loadScriptOnce')}\n${extract('ensurePresetRuntime')}`, context);
  const pending = context.ensurePresetRuntime('harmonic-state');
  assert.equal(context.ensurePresetRuntime('harmonic-state'), pending, 'Simultaneous loads share one activation');
  const loaded = pending.then((runtime) => {
    assert.equal(typeof runtime.create, 'function');
    assert.equal(typeof window.FeHarmonicOrbitalCore.create, 'function');
    assert.equal(typeof window.FeHarmonicOrbitalAtmosphere.create, 'function');
    mountedAt = now;
  });
  while (events.length) {
    // Resolve equal-deadline requests backwards, including runtime-first after
    // parallelization, so real module evaluation cannot rely on append order.
    events.sort((a, b) => a.at - b.at || b.sequence - a.sequence);
    const next = events.shift();
    now = next.at;
    next.run();
    await drain();
  }
  await loaded;
  const beforeReentry = requests.length;
  await context.ensurePresetRuntime('harmonic-state');
  assert.equal(requests.length, beforeReentry);
  return { assetDelayMs: 120, readyMs: mountedAt, requests };
}

function measureCanvas() {
  const counts = { draws: 0, fills: 0, clears: 0, motion: 0, raf: 0 };
  const canvasContext = {
    drawImage() { counts.draws += 1; }, fillRect() { counts.fills += 1; },
    clearRect() { counts.clears += 1; }, save() {}, restore() {}
  };
  const canvas = { width: 1280, height: 720, getContext: () => canvasContext };
  const state = {
    playbackPage: true, diyPreset: 'harmonic-state', textPreset: 'lyric', lyricLines: [], lyricSpeed: 1,
    sandbox: { open: false }, harmonicState: { runtime: {} },
    visual: { energy: 0.5, bass: 0.5 },
    orb: { animationFrame: 0, coveredCanvasKey: '', context: canvasContext },
    playbackVisual: {
      quality: 1, zoom: 1, yaw: 0, pitch: 0, mouseX: -1, mouseY: -1,
      particles: Array.from({ length: 800 }, () => ({
        x: 0, y: 0, z: 0, speed: 0.5, phase: 0, drift: 0, size: 1,
        phaseYawCos: 1, phaseYawSin: 0
      }))
    }
  };
  const document = { hidden: false };
  const context = vm.createContext({
    Math, Number, performance: { now: () => 1000 }, state, document,
    window: { requestAnimationFrame() { counts.raf += 1; return counts.raf; } },
    els: { canvas, audio: { paused: false }, harmonicStateScene: { hidden: false } },
    bootVisual: {}, RENDER_PROFILE: { playbackParticleFloor: 0 },
    sandboxPlaybackActive: () => false,
    isFreeCubePreset: () => state.diyPreset === 'free-cubes',
    isVoidPrismPreset: () => false, isChladniPreset: () => false,
    isSonicTopographyPreset: () => false, isSoundscapeWorkshopPreset: () => false,
    isCoverParticlePreset: () => false, isRainGlassPreset: () => false,
    isHarmonicStatePreset: () => state.diyPreset === 'harmonic-state',
    consumeOrbFrameBudget: () => true, resetOrbFrameBudget() {},
    syncBookLyricFrame() {}, observeRenderClarityFrame() {}, updateAudioSpectrum() {},
    updatePlaybackSceneMotion() { counts.motion += 1; },
    updatePlaybackQuality() {}, playbackParticleSprites: () => [{}, {}, {}],
    coverParticleNeedsContinuousFrame: () => true,
    orbCanvasMetrics: () => ({ width: 1280, height: 720 }), renderPixelRatio: () => 1,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value))
  });
  for (const name of ['coveredPlaybackCanvasKey', 'clearCoveredPlaybackCanvas', 'requestOrbFrame', 'drawPlaybackParticles', 'drawOrb']) {
    vm.runInContext(extract(name), context);
  }
  for (let frame = 0; frame < 120; frame += 1) context.drawOrb(frame * 16.67);
  const visible = { ...counts };
  document.hidden = true;
  for (let frame = 0; frame < 120; frame += 1) { context.drawOrb(frame * 16.67); context.requestOrbFrame(); }
  assert.deepEqual(counts, visible, 'A hidden document must not draw, update motion or request frames');
  document.hidden = false;
  state.diyPreset = 'lyric';
  context.drawOrb(3000);
  assert.equal(counts.draws, visible.draws + 800, 'Returning to a 2D preset resumes particle drawing');
  assert.equal(counts.motion, visible.motion + 1);
  state.diyPreset = 'harmonic-state';
  state.harmonicState.runtime = null;
  context.drawOrb(3017);
  assert.equal(counts.draws, visible.draws + 1600, 'Loading or failed harmonic runtime keeps its 2D fallback');
  state.harmonicState.runtime = {};
  context.els.harmonicStateScene.hidden = true;
  context.drawOrb(3034);
  assert.equal(counts.draws, visible.draws + 2400, 'A hidden harmonic surface cannot cover the 2D fallback');
  return { frames: 120, particlesPerFrame: 800, ...visible, hiddenFrames: 120, hiddenNewRaf: 0 };
}

const loaderTrials = [];
for (let index = 0; index < 3; index += 1) loaderTrials.push(await measureLoader());
const canvas = measureCanvas();
console.log(JSON.stringify({ model: 'actual application functions and actual module registration, fixed per-asset delay, counted real Canvas2D particle loop', loaderTrials, canvas }, null, 2));
if (!measureOnly) {
  assert.ok(loaderTrials.every((trial) => trial.readyMs === 120), 'Harmonic modules should load in one independent 120ms request stage');
  assert.ok(loaderTrials.every((trial) => trial.requests.every((request) => request.startedAt === 0)));
  assert.equal(canvas.draws, 0, 'Opaque harmonic rendering must skip covered 2D particle draws');
  assert.equal(canvas.fills, 0);
  assert.equal(canvas.clears, 1, 'The covered canvas only needs clearing once');
  assert.equal(canvas.motion, 120, 'Scene and lyric motion updates must remain active');
  assert.equal(canvas.raf, 120, 'Visible scene motion keeps its existing animation schedule');
}
