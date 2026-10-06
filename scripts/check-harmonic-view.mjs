import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
function extract(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `find real application code: ${start}`);
  return app.slice(from, to);
}
const constants = ['PLAYBACK_REST_YAW', 'PLAYBACK_REST_PITCH', 'HARMONIC_DEFAULT_ZOOM']
  .map(name => {
    const source = app.match(new RegExp(`^const ${name} = [^;]+;`, 'm'))?.[0];
    assert.ok(source, `view constant ${name} exists`);
    return source;
  }).join('\n');
const harmonicState = vm.runInNewContext(`${constants}\n({
  ${extract('  harmonicState: {', '  soundscapeWorkshop: {')}
}).harmonicState`, { INITIAL_VISUAL_SETTINGS_PREFERENCES: { harmonicEffects: {} } });
assert.equal(harmonicState.zoom, 2.35, 'a new harmonic view starts at the currently reachable farthest zoom');
assert.equal(1 / Math.sqrt(harmonicState.zoom), 1 / Math.sqrt(2.35));

const state = {
  playbackPage: true, diyPreset: 'harmonic-state', harmonicState,
  playbackVisual: { zoom: 1.45, yaw: 0.2, pitch: -0.1, velocityYaw: 1, velocityPitch: 1 },
  orb: { zoom: 1.2 }, freeCube: { runtime: {}, frame: {} },
  visual: {}, audioAnalysis: {}, presetFsr: { lastDiagnostics: {} }, lyricLines: []
};
const calls = { frames: 0, transforms: 0, builds: 0 };
const context = vm.createContext({
  state, console, performance: { now: () => 1000 }, reducedMotion: false,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  isHarmonicStatePreset: () => state.diyPreset === 'harmonic-state',
  isFreeCubePreset: () => state.diyPreset === 'free-cubes',
  isPlaybackClockRunning: () => false,
  requestOrbFrame: () => { calls.frames += 1; },
  updatePlaybackSceneTransform: () => { calls.transforms += 1; },
  resizeDynamicCubeRenderer() {}, resizeFreeCubeRenderer() {}, resizeVoidPrismRenderer() {},
  resizeChladniRenderer() {}, resizeHarmonicStateRenderer() {},
  heavyWebGLRenderingAllowed: () => true,
  ANDROID_CLIENT: false, MOBILE_RENDER_TARGET: false, RENDER_PROFILE: { tier: 'quality' },
  els: { harmonicStateCore: {}, audio: { paused: true, duration: 0 } },
  window: {
    THREE: {},
    FeHarmonicStateRuntime: {
      create: () => { calls.builds += 1; return {}; },
      update: (_runtime, frame) => { calls.harmonicFrame = { ...frame }; }
    },
    FeFreeCubeRuntime: { update: (_runtime, frame) => { calls.freeCubeFrame = { ...frame }; } }
  },
  renderPixelRatio: () => 1, presetFsrOutputPixelRatio: () => 1,
  fallbackLyricPalette: () => [], applyHarmonicStatePalette() {},
  safeText: (value, fallback = '') => value == null ? fallback : String(value),
  harmonicStateSongSignature: () => 'fixture', currentPlaybackLyricTime: () => 0,
  effectivePlaybackLyricTime: value => value,
  harmonicStateLyricWindow: () => ({ index: -1, entries: [] }), proxiedImageUrl: value => value
});
vm.runInContext(`${constants}\n${[
  extract('function updateStageZoom(', 'function bindOrbEvents('),
  extract('function resetPlaybackView(', 'function updateLyricDiyVars('),
  extract('function buildHarmonicState(', 'function applyHarmonicStatePalette('),
  extract('function updateHarmonicStateMotion(', 'function harmonicStateRuntimeSnapshot('),
  extract('function updateFreeCubeMotion(', 'function freeCubeRuntimeSnapshot(')
].join('\n')}`, context);
const run = source => vm.runInContext(source, context);

run('buildHarmonicState(); updateHarmonicStateMotion();');
assert.equal(calls.harmonicFrame.zoom, 2.35, 'harmonic frame receives its own farthest default rather than another scene zoom');
assert.equal(state.playbackVisual.zoom, 1.45, 'opening harmonic preserves other scenes zoom');
run('updateStageZoom(1); updateHarmonicStateMotion();');
assert.ok(state.harmonicState.zoom < 2.35, 'wheel remains usable from the farthest view');
assert.equal(calls.harmonicFrame.zoom, state.harmonicState.zoom);
assert.equal(state.playbackVisual.zoom, 1.45);
assert.equal(calls.frames, 1, 'harmonic wheel requests a fresh frame');
assert.equal(calls.transforms, 0, 'harmonic wheel does not scale shared lyric or scene surfaces');
for (let i = 0; i < 100; i += 1) run('updateStageZoom(1)');
assert.equal(state.harmonicState.zoom, 0.58, 'harmonic retains its nearest bound');
for (let i = 0; i < 100; i += 1) run('updateStageZoom(-1)');
assert.equal(state.harmonicState.zoom, 2.35, 'harmonic retains its farthest bound');

state.harmonicState.zoom = 0.9;
state.diyPreset = 'free-cubes';
run('updateFreeCubeMotion();');
assert.equal(calls.freeCubeFrame.zoom, 1.45, 'free cube continues to use the shared scene zoom');
run('updateStageZoom(-1); updateFreeCubeMotion();');
assert.equal(state.playbackVisual.zoom, 1.45 * 1.12);
assert.equal(calls.freeCubeFrame.zoom, state.playbackVisual.zoom);
assert.equal(state.harmonicState.zoom, 0.9, 'other preset interaction leaves harmonic view unchanged');
state.playbackPage = false;
run('updateStageZoom(-1)');
assert.equal(state.orb.zoom, 1.2 * 1.12, 'home orb keeps its existing zoom behavior');
assert.equal(state.harmonicState.zoom, 0.9);

state.playbackPage = true;
state.diyPreset = 'harmonic-state';
state.harmonicState.runtime = null;
run('buildHarmonicState(); updateHarmonicStateMotion();');
assert.equal(calls.builds, 2);
assert.equal(calls.harmonicFrame.zoom, 0.9, 'renderer recreation and preset reentry preserve the manual view');
run('resetPlaybackView(); updateHarmonicStateMotion();');
assert.equal(calls.harmonicFrame.zoom, 2.35, 'view reset restores the harmonic farthest default');
assert.equal(state.playbackVisual.zoom, 1, 'view reset keeps the existing default for other presets');
assert.equal(state.playbackVisual.velocityYaw, 0);
assert.equal(state.playbackVisual.velocityPitch, 0);

// Execute the actual double-click listener so the reset remains reachable through the UI.
const doubleClickSource = extract("  els.stage.addEventListener('dblclick',", "  els.stage.addEventListener('wheel',");
context.els.stage = { addEventListener: (name, handler) => { assert.equal(name, 'dblclick'); calls.doubleClick = handler; } };
context.resetTextPresetTransform = () => false;
vm.runInContext(doubleClickSource, context);
state.harmonicState.zoom = 1.1;
calls.doubleClick({ button: 0 });
assert.equal(state.harmonicState.zoom, 2.35, 'stage double-click restores the farthest harmonic view');
state.harmonicState.zoom = 1.1;
calls.doubleClick({ button: 2 });
assert.equal(state.harmonicState.zoom, 1.1, 'other pointer buttons do not reset the view');

console.log('PASS harmonic view: default/farthest 2.35, full wheel range, independent frame delivery, other-scene/home isolation, recreation continuity, double-click reset');
