import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const scope = { window: {}, console };
vm.runInNewContext(readFileSync(path.join(root, 'web/vendor/three.r128.min.js'), 'utf8'), scope);
vm.runInNewContext(readFileSync(path.join(root, 'web/harmonic-state-settings.js'), 'utf8'), scope);
vm.runInNewContext(readFileSync(path.join(root, 'web/harmonic-orbital-core.js'), 'utf8'), scope);

const THREE = scope.THREE;
const settingsApi = scope.window.FeHarmonicSettings;
const coreApi = scope.window.FeHarmonicOrbitalCore;
assert.equal(THREE.REVISION, '128', 'the regression uses the production Three r128 build');
assert.ok(settingsApi && coreApi, 'harmonic settings and orbital core are available');
const flashColorCField = settingsApi.schema.find(field => field.key === 'flashColorC');
assert.ok(flashColorCField, 'the settings schema exposes a third surface flash color');
assert.equal(flashColorCField.type, 'color');
const surfaceRiseField = settingsApi.schema.find(field => field.key === 'surfaceRiseEnabled');
assert.ok(surfaceRiseField, 'the settings schema exposes the independent surface rise switch');
assert.equal(surfaceRiseField.defaultValue, true,
  'surface flashing defaults to raised tiles in the current harmonic preset');

const defaults = settingsApi.normalize({
  ...settingsApi.defaults,
  ringsEnabled: false,
  raysEnabled: false,
  glowStrength: 0,
  floatAmount: 0,
  flashEnabled: true,
  flashMode: 'shake',
  flashIntensity: 1.35,
  flashDensity: .48,
  flashSoftness: .6,
  flashAudioStrength: .8,
  flashColorA: '#102030',
  flashColorB: '#405060',
  flashColorC: '#708090',
  surfaceRiseEnabled: true,
  rippleStrength: 2
});
const frame = { delta: .05, playing: true, bass: .9, mid: .25, treble: .15 };

function makeCore() {
  const core = coreApi.create(THREE);
  core.update({ ...frame, delta: 0, settings: defaults });
  return core;
}

const core = makeCore();
const uniforms = core.tiles.material.uniforms;
const fragmentShader = core.tiles.material.fragmentShader;
const matricesBefore = core.tiles.instanceMatrix.array.slice();

// Flashing uses the new raised-surface default. An explicit false preference
// still keeps the tiles flat without disabling radiance.
core.update({ ...frame, settings: defaults });
const raised = core.diagnostics();
assert.equal(raised.surface.surfaceRiseEnabled, true, 'surface rise defaults to on with flashing');
assert.ok(raised.rippleAmplitude > 0, 'surface flashing uses the default ripple displacement');
assert.equal(uniforms.uRipple.value, 0, 'playing tiles exclude the idle ripple control');
assert.equal(uniforms.uBassRise.value, defaults.bassRiseStrength, 'music height reaches the tile shader independently');
assert.deepEqual(core.tiles.instanceMatrix.array, matricesBefore, 'surface animation does not rewrite tile transforms');

// The requested default is shake-synchronized random flashing. It follows
// the same frequency-controlled oscillator used by the cube shake.
assert.equal(uniforms.uFlashMode.value, 2, 'shake is the default flash mode');
assert.match(fragmentShader, /uShakeSignal/);
assert.match(fragmentShader, /uShakeCycles/);
assert.match(fragmentShader, /tileHash\(tileId\+vec3\(cycle\*3\.71/,
  'shake mode re-seeds tile selection at oscillator cycles');
assert.match(fragmentShader, /step\(selected,uFlashDensity\)/,
  'shake mode selects a random subset of tiles per cycle');
const slow = makeCore();
const fast = makeCore();
slow.update({ ...frame, settings: { ...defaults, shakeFrequency: .25 } });
fast.update({ ...frame, settings: { ...defaults, shakeFrequency: 2.5 } });
assert.ok(fast.diagnostics().shakePhase > slow.diagnostics().shakePhase,
  'higher shake frequency advances the synchronized flash oscillator faster');
const phaseBeforePause = fast.diagnostics();
fast.update({ ...frame, playing: false, settings: { ...defaults, shakeFrequency: 2.5 } });
for (const key of ['shakePhase', 'flashClock', 'cubePosition', 'cubeRotation']) {
  assert.deepEqual(fast.diagnostics()[key], phaseBeforePause[key],
    `pausing freezes synchronized flash motion ${key} while height changes to idle`);
}

// All three configurable colors reach the actual shader uniforms and the
// interpolation branch includes the third color as its upper half endpoint.
assert.equal(uniforms.uFlashColorA.value.getHexString(), '102030');
assert.equal(uniforms.uFlashColorB.value.getHexString(), '405060');
assert.equal(uniforms.uFlashColorC.value.getHexString(), '708090');
assert.match(fragmentShader, /uFlashColorA,uFlashColorB,uFlashColorC/);
assert.match(fragmentShader, /mix\(uFlashColorB,uFlashColorC/,
  'three-color flashing interpolates through the new third color');

// The explicit rise switch remains independently testable and does not alter
// the meaning of flashEnabled.
core.update({ ...frame, settings: { ...defaults, surfaceRiseEnabled: true, bassRiseStrength: 1.25 } });
assert.equal(core.diagnostics().surface.surfaceRiseEnabled, true);
assert.ok(core.diagnostics().rippleAmplitude > 0, 'explicit rise switch enables displacement');
assert.equal(uniforms.uBassRise.value, 1.25);
assert.equal(uniforms.uRipple.value, 0);
core.update({ ...frame, settings: { ...defaults, surfaceRiseEnabled: false, flashEnabled: true } });
assert.equal(core.diagnostics().surface.surfaceRiseEnabled, false);
assert.equal(core.diagnostics().rippleAmplitude, 0);
assert.equal(uniforms.uRipple.value, 0, 'turning rise back off keeps flashing enabled without lifting tiles');
assert.equal(uniforms.uBassRise.value, 0, 'turning rise back off also disables bass height');

const evidence = {
  pass: true,
  defaults: {
    flashMode: uniforms.uFlashMode.value,
    surfaceRiseEnabled: raised.surface.surfaceRiseEnabled,
    rippleAmplitudeWithDefaultFlash: raised.rippleAmplitude,
    explicitFlatSurfaceRiseEnabled: core.diagnostics().surface.surfaceRiseEnabled,
    explicitFlatRippleAmplitude: core.diagnostics().rippleAmplitude
  },
  synchronizedShake: {
    slowPhase: slow.diagnostics().shakePhase,
    fastPhase: phaseBeforePause.shakePhase,
    pausedPhase: fast.diagnostics().shakePhase
  },
  flashColors: {
    a: uniforms.uFlashColorA.value.getHexString(),
    b: uniforms.uFlashColorB.value.getHexString(),
    c: uniforms.uFlashColorC.value.getHexString()
  },
  shaderFeatures: {
    usesShakeSignals: /uShakeSignal/.test(fragmentShader),
    reseedsTilesPerCycle: /tileHash\(tileId\+vec3\(cycle\*3\.71/.test(fragmentShader),
    interpolatesThirdColor: /mix\(uFlashColorB,uFlashColorC/.test(fragmentShader)
  }
};

const output = path.join(root, 'output/playwright/harmonic-surface-flicker-regression');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'result.json'), JSON.stringify(evidence, null, 2));
for (const instance of [core, slow, fast]) instance.dispose();
console.log('PASS harmonic surface flicker regression: default flash raises tiles, explicit flat mode stays flat, shake mode re-seeds random tiles with frequency, and three configurable flash colors reach the shader');
