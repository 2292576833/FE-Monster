import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function normalizeCoverParticleFloatSpeed(');
const end = app.indexOf('function loadCoverParticlePreferences(', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ clamp: (value, min, max) => Math.max(min, Math.min(max, value)) });
vm.runInContext(app.slice(start, end), context);
const normalize = source => JSON.parse(JSON.stringify(context.normalizeCoverParticlePreferences(source)));
const defaults = normalize({});
assert.equal(defaults.renderMode, 'particles', 'existing users retain particle mode');
assert.equal(defaults.imageMotionMode, 'parallax', 'image motion defaults to the clear parallax-flow preset');
assert.equal(normalize({ imageMotionMode: 'dissolve' }).imageMotionMode, 'dissolve');
assert.equal(normalize({ imageMotionMode: 'unknown' }).imageMotionMode, 'parallax');
assert.equal(defaults.depthMapEnabled, false, 'existing covers retain their original color until the depth-map button is used');
assert.equal(normalize({ depthMapEnabled: true }).depthMapEnabled, true);
assert.equal(normalize({ depthMapEnabled: 'false' }).depthMapEnabled, false);
assert.equal(normalize({ depthMapEnabled: true, depthEnabled: false, depthStrength: 0 }).depthMapEnabled, true,
  'the depth-map display mode is independent of relief geometry strength');
assert.equal(defaults.sketchLayers, 8);
assert.equal(defaults.depthEnabled, true);
assert.equal(defaults.depthStrength, 1, 'default depth preserves existing relief');
assert.equal(defaults.sketchFlowSpeed, .65, 'sketch starts with idle flow');
assert.equal(defaults.depthLightingEnabled, true);
assert.equal(defaults.depthLightAngle, 315);
assert.equal(defaults.depthLightSpeed, .25);
assert.deepEqual(normalize(null), defaults, 'malformed null preferences recover defaults');

const legacy = normalize({ backgroundEnabled: false, motionAmplitude: .4, floatSpeed: 1.5 });
assert.equal(legacy.backgroundEnabled, false);
assert.equal(legacy.motionAmplitude, .4);
assert.equal(legacy.floatSpeed, 1.5);
assert.equal(legacy.renderMode, 'particles');
assert.equal(legacy.sketchLayers, defaults.sketchLayers);

const limits = {
  sketchLayers: [2, 16], sketchDensity: [.4, 1.6], sketchLineWidth: [.4, 2],
  sketchFlowSpeed: [0, 2], sketchFlowAmplitude: [0, 2],
  depthStrength: [0, 3], depthContrast: [.25, 3],
  depthLightStrength: [0, 2], depthAmbient: [.05, 1], depthLightAngle: [0, 360],
  depthLightSpeed: [0, 2], depthHighlight: [0, 2]
};
for (const [key, [min, max]] of Object.entries(limits)) {
  assert.equal(normalize({ [key]: -100 })[key], min, `${key}: lower bound`);
  assert.equal(normalize({ [key]: 1000 })[key], max, `${key}: upper bound`);
  for (const value of [null, undefined, 'broken', NaN, Infinity]) {
    assert.equal(normalize({ [key]: value })[key], defaults[key], `${key}: invalid persisted value`);
  }
}
assert.equal(normalize({ sketchLayers: 3.6 }).sketchLayers, 4);
const still = normalize({ renderMode: 'sketch', sketchFlowSpeed: 0, sketchFlowAmplitude: 0, depthStrength: 0, depthEnabled: false, depthInvert: true });
assert.equal(still.sketchFlowSpeed, 0);
assert.equal(still.sketchFlowAmplitude, 0);
assert.equal(still.depthStrength, 0);
assert.equal(still.depthEnabled, false);
assert.equal(still.depthInvert, true);
const unlit = normalize({ depthLightingEnabled: false, depthLightStrength: 0, depthLightSpeed: 0, depthHighlight: 0, depthLightAngle: 0 });
assert.equal(unlit.depthLightingEnabled, false);
for (const key of ['depthLightStrength', 'depthLightSpeed', 'depthHighlight', 'depthLightAngle']) assert.equal(unlit[key], 0);
assert.equal(normalize({ renderMode: 'unknown' }).renderMode, 'particles');
assert.equal(normalize({ renderMode: 'sketch', unexpected: '/private/path' }).unexpected, undefined);
const oldImport = { depthMapDataUrl: 'data:image/png;base64,AAAA', depthMapName: 'old.png', depthMapSource: 'old-cover' };
assert.deepEqual(normalize(oldImport), defaults, 'legacy imported maps cannot override automatic cover depth');
const importKeys = Object.keys(oldImport);
for (const key of importKeys) assert.equal(normalize(oldImport)[key], undefined);
const loaderEnd = app.indexOf('const INITIAL_COVER_PARTICLE_PREFERENCES', end);
let storedPrefs = JSON.stringify({ ...oldImport, renderMode: 'sketch', depthStrength: 1.8 });
context.COVER_PARTICLE_PREFS_KEY = 'test-cover-preferences';
context.window = { localStorage: {
  getItem: () => storedPrefs,
  setItem: (_key, value) => { storedPrefs = value; }
} };
vm.runInContext(app.slice(end, loaderEnd), context);
const migrated = context.loadCoverParticlePreferences();
assert.equal(migrated.renderMode, 'sketch');
assert.equal(migrated.depthStrength, 1.8);
for (const key of importKeys) assert.equal(Object.hasOwn(JSON.parse(storedPrefs), key), false, 'obsolete import data is removed from saved preferences');
context.window.localStorage.setItem = () => { throw new Error('Read-only storage'); };
storedPrefs = JSON.stringify({ ...oldImport, sketchLayers: 12 });
assert.equal(context.loadCoverParticlePreferences().sketchLayers, 12, 'cleanup failure must retain valid visual settings');
console.log('Cover settings checks passed: legacy defaults, finite bounds, zero values and shared-field allowlist.');
