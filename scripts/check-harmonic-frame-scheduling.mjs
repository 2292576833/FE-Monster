import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const extract = (name) => {
  const source = app.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
  assert.ok(source, `${name} exists`);
  return source;
};

function fixture({ playing = false, reducedMotion = false, dragging = false, targetFrameMs = 1000 / 60 } = {}) {
  const counts = { sceneFrames: 0, raf: 0 };
  const state = {
    playbackPage: true, diyPreset: 'harmonic-state', sandbox: { open: false },
    harmonicState: { runtime: {}, effects: { idleAnimation: true } },
    renderClarity: { targetFrameMs },
    orb: { animationFrame: 0, frameBudgetAt: 0, frameBudgetCarryMs: 0 },
    playbackVisual: { dragging }
  };
  const document = { hidden: false };
  const els = { harmonicStateScene: { hidden: false }, bootScreen: { hidden: true } };
  const context = vm.createContext({
    state, document, els, reducedMotion, bootVisual: { entering: false },
    RENDER_PROFILE: { targetFrameMs }, performance: { now: () => 1000 },
    window: { requestAnimationFrame() { counts.raf += 1; return counts.raf; } },
    isPlaybackClockRunning: () => playing,
    isHarmonicStatePreset: () => state.diyPreset === 'harmonic-state',
    isFreeCubePreset: () => state.diyPreset === 'free-cubes',
    isVoidPrismPreset: () => false, isChladniPreset: () => false,
    isSonicTopographyPreset: () => false, sandboxPlaybackActive: () => false,
    syncBookLyricFrame() {}, observeRenderClarityFrame() {}, updateAudioSpectrum() {},
    updatePlaybackSceneMotion() { counts.sceneFrames += 1; },
    clearCoveredPlaybackCanvas() {},
    clamp: (value, min, max) => Math.max(min, Math.min(max, value))
  });
  for (const name of ['requestOrbFrame', 'orbFrameBudgetMs', 'resetOrbFrameBudget',
    'playbackFrameRateUncapped', 'consumeOrbFrameBudget', 'coveredPlaybackCanvasKey', 'drawOrb']) {
    vm.runInContext(extract(name), context);
  }
  return { context, counts, state, document, els };
}

function presentFrames(test, hz, seconds = 2) {
  const frames = hz * seconds;
  for (let index = 0; index < frames; index += 1) test.context.drawOrb(1000 + index * 1000 / hz);
  return frames;
}

const cadence = [];
for (const hz of [60, 120, 144, 240]) {
  for (const [label, options] of [
    ['playing', { playing: true }],
    ['paused idle', {}],
    ['paused camera drag', { dragging: true }],
    ['reduced motion', { reducedMotion: true }],
    ['mobile budget', { targetFrameMs: 42 }]
  ]) {
    const test = fixture(options);
    const frames = presentFrames(test, hz);
    assert.equal(test.counts.sceneFrames, frames, `${label}: visible harmonic must update on every ${hz}Hz frame`);
    assert.equal(test.counts.raf, frames, `${label}: visible harmonic keeps requesting frames`);
    cadence.push({ hz, label, sceneFrames: test.counts.sceneFrames });
  }
}

const idleOff = fixture();
idleOff.state.harmonicState.effects.idleAnimation = false;
assert.equal(presentFrames(idleOff, 240), idleOff.counts.sceneFrames,
  'A visible static scene still presents every frame for camera and settings changes');

for (const [label, mutate] of [
  ['hidden document', test => { test.document.hidden = true; }],
  ['boot cover', test => { test.els.bootScreen.hidden = false; }],
  ['sandbox', test => { test.state.sandbox.open = true; }]
]) {
  const test = fixture();
  mutate(test);
  test.context.requestOrbFrame();
  presentFrames(test, 240);
  assert.deepEqual(test.counts, { sceneFrames: 0, raf: 0 }, `${label}: no rendering or scheduling`);
}

const entering = fixture();
entering.els.bootScreen.hidden = false;
entering.context.bootVisual.entering = true;
assert.equal(presentFrames(entering, 240), entering.counts.sceneFrames,
  'The entering boot animation retains its existing scene reveal behavior');

for (const [label, mutate] of [
  ['hidden harmonic surface', test => { test.els.harmonicStateScene.hidden = true; }],
  ['unmounted runtime', test => { test.state.harmonicState.runtime = null; }],
  ['outside playback page', test => { test.state.playbackPage = false; }],
  ['other preset', test => { test.state.diyPreset = 'free-cubes'; }]
]) {
  const test = fixture();
  mutate(test);
  assert.equal(test.context.consumeOrbFrameBudget(1000), true);
  assert.equal(test.context.consumeOrbFrameBudget(1000 + 1000 / 240), false,
    `${label}: paused non-visible harmonic must retain the normal frame budget`);
}

for (const [label, options, expectedHz] of [
  ['idle', {}, 60],
  ['camera drag', { dragging: true, targetFrameMs: 1000 / 144 }, 120],
  ['reduced motion', { reducedMotion: true }, 30],
  ['playing', { playing: true }, 240]
]) {
  const test = fixture(options);
  test.state.diyPreset = 'free-cubes';
  presentFrames(test, 240);
  assert.ok(Math.abs(test.counts.sceneFrames - expectedHz * 2) <= 1,
    `Other preset ${label} must retain its existing ${expectedHz}Hz cadence; got ${test.counts.sceneFrames} frames`);
}

const duplicate = fixture();
duplicate.context.requestOrbFrame();
duplicate.context.requestOrbFrame();
assert.equal(duplicate.counts.raf, 1, 'Only one pending rAF may be scheduled');

console.log(JSON.stringify({ ok: true, cadence, guards: 'hidden, boot, sandbox, mount, preset and duplicate-rAF protections retained' }, null, 2));
