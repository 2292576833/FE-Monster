import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), scope);
vm.runInNewContext(readFileSync(new URL('../web/harmonic-orbital-core.js', import.meta.url), 'utf8'), scope);
const THREE = scope.THREE;
assert.equal(THREE.REVISION, '128', 'test the production Three version');
const core = scope.window.FeHarmonicOrbitalCore.create(THREE);
const settings = { keyLightIntensity: 1, keyLightAzimuth: 30, keyLightElevation: 45,
  ambientLightIntensity: .65, rimLightIntensity: 1, lightAudioStrength: .35,
  ringMetalness: .88, ringRoughness: .27, cubeEdgeGlow: .45, cubeOcclusion: .5,
  glowStrength: .45, glowSoftness: .65, audioReactive: true, surfaceRiseEnabled: true, rippleStrength: .8, bassRiseStrength: .8 };
const frame = { delta: .05, playing: true, bass: 0, mid: 0, treble: 0, settings };
const initial = core.diagnostics();
assert.ok(initial.lighting, 'core exposes the actual lighting state');
const key = core.group.getObjectByName('HarmonicKeyLight');
const ambient = core.group.getObjectByName('HarmonicAmbientLight');
const rim = core.group.getObjectByName('HarmonicRimLight');
const halo = core.group.getObjectByName('HarmonicCoreHalo');
const ringMaterial = core.pivots[0].children[0].material;
const u = core.tiles.material.uniforms;
const near = (value, expected, label) => assert.ok(Math.abs(value - expected) < 1e-8, label);
near(key.intensity, 2.1, 'main-light setting is a multiplier');
near(ambient.intensity, .65, 'ambient setting is direct intensity');
near(rim.intensity, .8, 'rim setting is a multiplier');
assert.equal(key.target.parent, core.group, 'light aims at the translated core origin');
assert.equal(halo.geometry.attributes.position.count, 4, 'soft halo is one quad');
assert.equal(halo.material.depthWrite, false);
assert.equal(halo.material.blending, THREE.AdditiveBlending);

const parent = new THREE.Group();
parent.rotation.set(.2, .8, -.3); parent.scale.setScalar(.72); parent.position.set(4, 1, -2);
parent.add(core.group); core.group.position.set(0, 0, -4); parent.updateMatrixWorld(true);
const localDirection = new THREE.Vector3(Math.sin(Math.PI / 6) * Math.cos(Math.PI / 4),
  Math.sin(Math.PI / 4), Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4));
const worldDirection = localDirection.clone().transformDirection(core.group.matrixWorld);
core.update({ ...frame, delta: 0, keyDirectionWorld: worldDirection });
parent.updateMatrixWorld(true);
const physicalDirection = key.getWorldPosition(new THREE.Vector3()).sub(key.target.getWorldPosition(new THREE.Vector3())).normalize();
assert.ok(physicalDirection.distanceTo(worldDirection) < 1e-8, 'scene light follows rotated/scaled core');
assert.ok(u.uKeyDirectionWorld.value.distanceTo(physicalDirection) < 1e-8, 'tile shader and real light share world-space direction');
const camera = new THREE.PerspectiveCamera(); camera.position.set(7, 3, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
core.update({ ...frame, delta: 0, camera, keyDirectionWorld: worldDirection });
assert.ok(u.uKeyDirectionWorld.value.distanceTo(physicalDirection) < 1e-8, 'moving the camera does not rotate the world light');
core.update({ ...frame, delta: 0, settings: { ...settings, keyLightAzimuth: -90, keyLightElevation: 0 } });
parent.updateMatrixWorld(true);
const expectedFallback = new THREE.Vector3(-1, 0, 0).transformDirection(core.group.matrixWorld);
assert.ok(u.uKeyDirectionWorld.value.distanceTo(expectedFallback) < 1e-8, 'standalone core derives world direction from local controls');

const parameters = [
  ['keyLightIntensity', 1.7, () => key.intensity, 3.57],
  ['ambientLightIntensity', .2, () => ambient.intensity, .2],
  ['rimLightIntensity', 1.6, () => rim.intensity, 1.28],
  ['ringMetalness', .32, () => ringMaterial.metalness, .32],
  ['ringRoughness', .68, () => ringMaterial.roughness, .68],
  ['cubeEdgeGlow', 1.2, () => u.uEdgeGlow.value, 1.2],
  ['cubeOcclusion', .85, () => u.uOcclusion.value, .85],
  ['glowStrength', 1.1, () => halo.material.uniforms.uGlowStrength.value, 1.1],
  ['glowSoftness', .25, () => halo.material.uniforms.uGlowSoftness.value, .25]
];
for (const [name, value, read, expected] of parameters) {
  core.update({ ...frame, delta: 0, settings: { ...settings, [name]: value } });
  near(read(), expected, `${name} changes a live material or light`);
}
core.update({ ...frame, settings: { ...settings, keyLightIntensity: 0, ambientLightIntensity: 0, rimLightIntensity: 0, glowStrength: 0 } });
assert.equal(key.intensity + ambient.intensity + rim.intensity, 0, 'zero intensity remains a valid off value');
assert.equal(halo.visible, false, 'zero glow skips the transparent draw');
core.update({ ...frame, settings: { ...settings, cubeEnabled: false } });
assert.equal(halo.visible, false, 'a hidden cube leaves no floating halo');

core.update({ ...frame, settings: { ...settings, lightAudioStrength: 1 } });
for (let i = 0; i < 100; i++) core.update({ ...frame, bass: 1, mid: 1, treble: 1, settings: { ...settings, lightAudioStrength: 1 } });
const sounding = core.diagnostics().lighting;
assert.ok(sounding.audio > .9 && sounding.audio <= 1, 'lighting uses a bounded smoothed audio envelope');
assert.ok(key.intensity > 2.1 && key.intensity <= 2.1 * 1.18 + 1e-8, 'audio brightening is limited to eighteen percent');
const frozen = JSON.stringify(core.diagnostics().lighting);
core.update({ ...frame, playing: false, settings: { ...settings, lightAudioStrength: 1 } });
assert.equal(JSON.stringify(core.diagnostics().lighting), frozen, 'pause freezes lighting while surface height switches to idle');
core.update({ ...frame, reducedMotion: true, settings: { ...settings, lightAudioStrength: 1 } });
assert.equal(JSON.stringify(core.diagnostics().lighting), frozen, 'reduced motion freezes lighting');
core.update({ ...frame, settings: { ...settings, lightAudioStrength: 0 } });
near(key.intensity, 2.1, 'audio amount zero removes modulation immediately');
core.update({ ...frame, settings: { ...settings, audioReactive: false, lightAudioStrength: 1 } });
near(key.intensity, 2.1, 'global audio-reactive off disables the new response');

// Surface flashing must be genuinely independent from geometry displacement.
core.update({ ...frame, bass: 1, settings: { ...settings, rippleStrength: 2, floatAmount: 0 } });
assert.ok(u.uBassRise.value > 0, 'playing surface rise uses the independent bass height');
assert.equal(u.uRipple.value, 0, 'playing surface excludes the idle ripple channel');
assert.equal(u.uFlashMode.value, 2, 'omitted flash mode defaults to the shared shake oscillators');
assert.ok(core.diagnostics().rippleAmplitude > 0);
const tileMatrices = core.tiles.instanceMatrix.array.slice();
for (const [name, value, uniform, expected] of [
  ['flashMode', 'random', 'uFlashMode', 0], ['flashMode', 'gradient', 'uFlashMode', 1], ['flashMode', 'shake', 'uFlashMode', 2],
  ['flashIntensity', 1.35, 'uFlashIntensity', 1.35], ['flashDensity', .82, 'uFlashDensity', .82],
  ['flashSoftness', .24, 'uFlashSoftness', .24], ['flashAudioStrength', 1.6, 'uFlashAudioStrength', 1.6],
  ['flashEnabled', false, 'uFlashIntensity', 0]
]) {
  core.update({ ...frame, bass: 1, settings: { ...settings, [name]: value } });
  assert.equal(u[uniform].value, expected, `${name} reaches the existing instanced tile shader`);
  assert.ok(u.uBassRise.value > 0, `${name} keeps independent bass rise enabled`);
}
assert.deepEqual(core.tiles.instanceMatrix.array, tileMatrices, 'flashing never rewrites or reallocates tile transforms');
core.update({ ...frame, settings: { ...settings, surfaceRiseEnabled: true, bassRiseStrength: 1.25 } });
assert.equal(u.uBassRise.value, 1.25, 'bass rise remains independent of flashing');
core.update({ ...frame, settings: { ...settings, surfaceRiseEnabled: false, flashIntensity: 2 } });
assert.equal(u.uRipple.value, 0, 'rise can be disabled with flashing still enabled');
assert.equal(u.uBassRise.value, 0, 'the same rise switch disables music height');
assert.equal(u.uFlashIntensity.value, 2);

const syncSettings = { ...settings, floatAmount: 0, shakeStrength: 1, flashMode: 'shake' };
for (const frequency of [.25, 1, 2.5]) {
  const phase = core.diagnostics().shakePhase;
  core.update({ ...frame, bass: 1, settings: { ...syncSettings, shakeFrequency: frequency } });
  const d = core.diagnostics();
  near(d.shakePhase - phase, frame.delta * frequency, 'shared shake oscillator respects frequency control');
  near(d.cubePosition[0], d.surface.shakeSignal[0] * d.bass * .085, 'horizontal motion uses the same signal passed to the flash shader');
  near(d.cubePosition[1], d.surface.shakeSignal[1] * d.bass * .085, 'vertical motion uses the same signal passed to the flash shader');
  near(d.cubePosition[2], d.surface.shakeSignal[2] * d.bass * .085 * .4, 'depth motion uses the same signal passed to the flash shader');
  assert.deepEqual(Array.from(d.surface.shakeCycles), [Math.floor(d.shakePhase * 31 / Math.PI),
    Math.floor((d.shakePhase * 37 + Math.PI / 2) / Math.PI), Math.floor(d.shakePhase * 29 / Math.PI)],
  'random selection cycles use the exact XYZ oscillators, including the cosine offset');
}
for (const [axis, firstZero] of [[0, Math.PI / 31], [1, Math.PI / 74], [2, Math.PI / 29]]) {
  const boundary = scope.window.FeHarmonicOrbitalCore.create(THREE), epsilon = 1e-5;
  let remaining = firstZero - epsilon;
  while (remaining > 1e-12) {
    const delta = Math.min(.05, remaining);
    boundary.update({ ...frame, delta, bass: 1, settings: syncSettings }); remaining -= delta;
  }
  const before = boundary.diagnostics().surface;
  boundary.update({ ...frame, delta: epsilon * 2, bass: 1, settings: syncSettings });
  const after = boundary.diagnostics().surface;
  assert.equal(after.shakeCycles[axis], before.shakeCycles[axis] + 1, 'each new pulse receives a new deterministic random tile seed');
  assert.ok(Math.abs(before.shakeSignal[axis]) < .001 && Math.abs(after.shakeSignal[axis]) < .001,
    'tile selection changes only as the shared oscillator passes through zero, avoiding a bright mid-pulse jump');
  boundary.dispose();
}
core.update({ ...frame, settings: { ...syncSettings, shakeStrength: 0 } });
assert.equal(u.uShakeAmount.value, 0, 'synchronized flashing stops when actual shaking is disabled');
for (const speed of [.1, 3]) {
  const clock = core.diagnostics().flashClock;
  core.update({ ...frame, settings: { ...settings, flashMode: 'random', flashSpeed: speed } });
  near(core.diagnostics().flashClock - clock, frame.delta * speed, 'random and gradient flashing use the configurable independent clock');
}
core.update({ ...frame, delta: 0, settings: { ...settings, cubeColorMode: 'custom', cubeColor: '#e63683',
  flashColorA: '#f7aa33', flashColorB: '#37bbed', flashColorC: '#7cff52' } });
for (const name of ['uColorA', 'uColorB', 'uColorC']) assert.equal(u[name].value.getHexString(), 'e63683', 'custom cube paint has no unrelated palette blend');
assert.equal(halo.material.uniforms.uColor.value.getHexString(), 'e63683', 'local cube halo follows its own paint');
assert.equal(u.uFlashColorA.value.getHexString(), 'f7aa33');
assert.equal(u.uFlashColorB.value.getHexString(), '37bbed');
assert.equal(u.uFlashColorC.value.getHexString(), '7cff52');
const cubePaint = u.uColorA.value.getHexString();
core.setPalette([{ r: 1, g: 255, b: 2 }, { r: 3, g: 4, b: 255 }, { r: 255, g: 6, b: 7 }]);
core.update({ ...frame, delta: 0, settings: { ...settings, cubeColorMode: 'custom', cubeColor: '#e63683' } });
assert.equal(u.uColorA.value.getHexString(), cubePaint, 'cover/global palette changes leave custom cube paint intact');
core.update({ ...frame, delta: 0, settings });
assert.notEqual(u.uColorA.value.getHexString(), cubePaint, 'returning to palette mode restores the scene palette');
assert.equal(u.uFlashColorA.value.getHexString(), 'b8f5ff', 'missing old preferences restore the flash color defaults');
assert.equal(u.uFlashColorC.value.getHexString(), 'ff8fca', 'missing old preferences restore the third flash color default');

const resources = new Set([core.lineGeometry]); let meshCount = 0, instancedCount = 0;
core.group.traverse(o => {
  if (o.isMesh || o.isPoints || o.isLine) meshCount++;
  if (o.isInstancedMesh) { instancedCount++; resources.add(o); }
  if (o.geometry) resources.add(o.geometry);
  for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (material) resources.add(material);
});
assert.equal(instancedCount, 6, 'lighting does not add ring or tile instances');
assert.equal(core.diagnostics().tileCount, 1944);
assert.equal(core.diagnostics().lighting.haloDrawCalls, 1);
const beforeResources = new Set(resources);
for (let i = 0; i < 80; i++) core.update({ ...frame, idleMotion: true, playing: false });
core.group.traverse(o => {
  if (o.geometry) assert.ok(beforeResources.has(o.geometry), 'updates reuse geometry');
  for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (material) assert.ok(beforeResources.has(material), 'updates reuse materials');
});
const calls = new Map([...resources].map(r => [r, 0]));
for (const r of resources) r.addEventListener('dispose', () => calls.set(r, calls.get(r) + 1));
core.dispose(); core.dispose();
assert.ok([...calls.values()].every(count => count === 1), 'all original and halo resources release once');
console.log(`PASS harmonic core lighting: real r128 lights, world-space shader direction, all controls, bounded audio, freeze, ${meshCount} renderables, exact disposal`);
