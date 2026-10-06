import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), scope);
vm.runInNewContext(readFileSync(new URL('../web/harmonic-orbital-atmosphere.js', import.meta.url), 'utf8'), scope);
const THREE = scope.THREE;
const effect = scope.window.FeHarmonicOrbitalAtmosphere.create(THREE);
assert.equal(THREE.REVISION, '128');
assert.ok(effect.diagnostics().lighting, 'atmosphere exposes the live directional fog and approximate floor lighting');
const floor = effect.group.getObjectByName('HarmonicAtmosphereFloorLight');
assert.ok(floor?.isMesh, 'floor lighting uses one independently controlled mesh');
assert.equal(floor.geometry.getAttribute('position').count, 4);
assert.equal(floor.material.blending, THREE.NormalBlending, 'one alpha-composited plane supports soft light and shadow');
assert.equal(floor.material.depthWrite, false);
assert.equal(effect.diagnostics().layerCount, 28);
assert.equal(effect.diagnostics().lighting.floorDrawCalls, 1);
const u = effect.mist.material.uniforms;
const settings = { fogEnabled: true, rainEnabled: true, rainDensity: .65, fogDensity: .4,
  fogLightStrength: .55, floorLightEnabled: true, floorLightStrength: .45,
  floorLightSpread: 1, floorShadowStrength: .3, lightAudioStrength: .35,
  glowStrength: .45, glowSoftness: .65, keyLightIntensity: 1,
  ambientLightIntensity: .65, keyLightAzimuth: 30, keyLightElevation: 45, audioReactive: true };
const frame = { settings, delta: .05, playing: true, ringRadius: 11.36, bass: 0 };
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, label);
effect.update(frame);
const parent = new THREE.Group(); parent.rotation.set(.13, -.8, .17); parent.scale.setScalar(.72);
parent.add(effect.group); effect.group.position.set(0, 0, -4); parent.updateMatrixWorld(true);
const localDirection = new THREE.Vector3(Math.sin(Math.PI / 6) * Math.cos(Math.PI / 4),
  Math.sin(Math.PI / 4), Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4));
const expectedDirection = localDirection.clone().transformDirection(effect.group.matrixWorld);
const camera = new THREE.PerspectiveCamera(); camera.position.set(6, 3, 15);
camera.lookAt(0, 0, -4); camera.updateMatrixWorld(true);
effect.update({ ...frame, delta: 0, camera, keyDirectionWorld: expectedDirection });
assert.ok(u.uKeyDirectionWorld.value.distanceTo(expectedDirection) < 1e-8, 'fog receives the same world light as the scene');
assert.ok(u.uCameraPositionWorld.value.distanceTo(camera.position) < 1e-8, 'scattering uses the actual camera position');
camera.position.set(-5, 2, 10); camera.lookAt(0, 0, -4); camera.updateMatrixWorld(true);
effect.update({ ...frame, delta: 0, camera, keyDirectionWorld: expectedDirection });
assert.ok(u.uKeyDirectionWorld.value.distanceTo(expectedDirection) < 1e-8, 'orbiting the camera never rotates the light');
effect.update({ ...frame, delta: 0, settings: { ...settings, keyLightAzimuth: -90, keyLightElevation: 0 } });
const fallbackDirection = new THREE.Vector3(-1, 0, 0).transformDirection(effect.group.matrixWorld);
assert.ok(u.uKeyDirectionWorld.value.distanceTo(fallbackDirection) < 1e-8, 'standalone fallback transforms local azimuth/elevation into world space');
assert.ok(floor.material.uniforms.uFloorShadowOffset.value.x > 0, 'the approximate shadow extends away from the light');

for (const [name, value, uniform] of [
  ['fogLightStrength', 1.2, 'uFogLightStrength'], ['floorLightStrength', .8, 'uFloorLightStrength'],
  ['floorShadowStrength', .65, 'uFloorShadowStrength'], ['glowStrength', 1.1, 'uGlowStrength'],
  ['glowSoftness', .25, 'uGlowSoftness'], ['keyLightIntensity', 1.8, 'uKeyLightIntensity'],
  ['ambientLightIntensity', .2, 'uAmbientLightIntensity']
]) {
  effect.update({ ...frame, playing: false, delta: 0, settings: { ...settings, [name]: value } });
  near(u[uniform].value, value, `${name} updates immediately while paused`);
}
effect.update({ ...frame, playing: false, ringRadius: 10, settings: { ...settings, floorLightSpread: 1.5 } });
const wide = floor.scale.x;
effect.update({ ...frame, playing: false, ringRadius: 5, settings: { ...settings, floorLightSpread: 1.5 } });
near(floor.scale.x, wide / 2, 'floor footprint follows ring scale exactly');
effect.update({ ...frame, playing: false, ringRadius: 10, settings: { ...settings, floorLightSpread: .75 } });
near(floor.scale.x, wide / 2, 'floor spread remains independently adjustable');
effect.update({ ...frame, settings: { ...settings, ringsEnabled: false } });
assert.equal(floor.visible, true, 'hidden rings leave independently enabled floor lighting visible');
effect.update({ ...frame, settings: { ...settings, floorLightEnabled: false } });
assert.equal(floor.visible, false);
assert.equal(effect.mist.visible, true);
assert.equal(effect.rain.visible, true);
assert.equal(effect.diagnostics().rainCount, 117, 'adding floor lighting does not alter rain density');
effect.update({ ...frame, playing: false, settings: { ...settings, floorShadowStrength: 0 } });
assert.equal(u.uFloorShadowStrength.value, 0, 'zero shadow strength is preserved as a true off value');
assert.equal(effect.diagnostics().lighting.floorShadowEnabled, false);
effect.update({ ...frame, playing: false, settings: { ...settings, floorShadowStrength: 0, floorLightStrength: 0 } });
assert.equal(floor.visible, false, 'zero shadow and light skip the floor draw');
effect.setPalette([{ r: 30, g: 200, b: 250 }, { r: 150, g: 80, b: 240 }, { r: 250, g: 90, b: 180 }]);
near(floor.material.uniforms.uCyan.value.g, 200 / 255, 'the floor uses the current scene palette');
near(floor.material.uniforms.uPink.value.r, 250 / 255, 'the second light lobe follows the third palette color');

for (let i = 0; i < 100; i++) effect.update({ ...frame, bass: 1, settings: { ...settings, lightAudioStrength: 1 } });
assert.ok(effect.diagnostics().lighting.audio > .9 && effect.diagnostics().lighting.audio <= 1);
near(u.uLightAudio.value, effect.diagnostics().lighting.audio, 'lighting audio strength one uses the bounded envelope');
const frozen = JSON.stringify(effect.diagnostics());
effect.update({ ...frame, playing: false, settings: { ...settings, lightAudioStrength: 1 } });
assert.equal(JSON.stringify(effect.diagnostics()), frozen, 'pause freezes lighting and motion');
effect.update({ ...frame, reducedMotion: true, settings: { ...settings, lightAudioStrength: 1 } });
assert.equal(JSON.stringify(effect.diagnostics()), frozen, 'reduced motion freezes lighting and motion');
effect.update({ ...frame, playing: false, settings: { ...settings, lightAudioStrength: 0 } });
assert.equal(u.uLightAudio.value, 0, 'audio modulation can be turned off immediately while paused');
const idleBefore = effect.diagnostics().time;
effect.update({ ...frame, playing: false, idleMotion: true });
assert.ok(effect.diagnostics().time > idleBefore, 'existing idle-motion policy remains effective');
effect.update({ ...frame, settings: { ...settings, audioReactive: false, lightAudioStrength: 1 } });
assert.equal(u.uLightAudio.value, 0);

const resources = new Set(); let draws = 0;
effect.group.traverse(object => {
  if (object.isMesh || object.isPoints) draws++;
  if (object.geometry) resources.add(object.geometry);
  if (object.material) resources.add(object.material);
});
assert.equal(draws, 7, 'the atmosphere has seven batched surfaces including cold air and separately captured water');
assert.equal(resources.size, 14, 'seven stable geometries/materials; the reflection target is allocated lazily when rendered');
for (let i = 0; i < 50; i++) effect.update({ ...frame, camera });
effect.group.traverse(object => {
  if (object.geometry) assert.ok(resources.has(object.geometry));
  if (object.material) assert.ok(resources.has(object.material));
});
const released = new Map([...resources].map(resource => [resource, 0]));
for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
effect.dispose(); effect.dispose();
assert.ok([...released.values()].every(count => count === 1));
assert.equal(effect.group.parent, null);
assert.equal(effect.group.children.length, 0);
console.log('PASS harmonic atmosphere lighting: r128 world-light scattering, independent floor pool/shadow and water, live controls, freeze, 28 fog layers, stable resources, exact disposal');
