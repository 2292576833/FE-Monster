import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = { window: {}, console };
const read = name => readFileSync(new URL('../web/' + name, import.meta.url), 'utf8');
for (const name of ['vendor/three.r128.min.js', 'harmonic-state-settings.js']) vm.runInNewContext(read(name), scope);
const source = read('harmonic-state-runtime.js');
vm.runInNewContext(source.replace('    create,', '    buildLightTowers, syncLightingDirection,\n    create,'), scope);
const THREE = scope.THREE;
const api = scope.window.FeHarmonicStateRuntime;
const normalize = scope.window.FeHarmonicSettings.normalize;
const tower = api.buildLightTowers(THREE);
const body = tower.group.getObjectByName('LightTowerWetBodies');
const halo = tower.group.getObjectByName('LightTowerSoftHalos');
const fields = {
  keyLightIntensity: ['uKeyIntensity', 2], ambientLightIntensity: ['uAmbientIntensity', 1.2],
  rimLightIntensity: ['uRimIntensity', 1.8], towerReflectivity: ['uReflectivity', 1.3],
  glowStrength: ['uGlowStrength', 1.4], glowSoftness: ['uGlowSoftness', 0.2]
};
for (const [key, [uniform, value]] of Object.entries(fields)) {
  assert.ok(body.material.uniforms[uniform], `${key} must reach a real tower shader uniform`);
  tower.update({ delta: 0, playing: false, settings: normalize({ [key]: value }) });
  assert.equal(body.material.uniforms[uniform].value, value, `${key} updates immediately while paused`);
}
const camera = new THREE.PerspectiveCamera(48, 1, .1, 180);
camera.position.set(0, .45, 17.5); camera.lookAt(0, .2, 0);
const group = new THREE.Group(); group.rotation.set(.2, -.4, .1); group.scale.setScalar(.65);
const runtime = { group, camera, effects: normalize({ keyLightAzimuth: 90, keyLightElevation: 0 }), keyDirectionWorld: new THREE.Vector3() };
const identity = runtime.keyDirectionWorld;
api.syncLightingDirection(runtime);
const expected = new THREE.Vector3(1, 0, 0).transformDirection(group.matrixWorld);
assert.ok(runtime.keyDirectionWorld.distanceTo(expected) < 1e-9, 'light direction follows the current scene transform');
tower.update({ delta: 0, settings: runtime.effects, keyDirectionWorld: runtime.keyDirectionWorld });
assert.ok(body.material.uniforms.uKeyDirectionWorld.value.distanceTo(expected) < 1e-9, 'tower world normals use the same world light vector');
group.rotation.y = .7;
api.syncLightingDirection(runtime);
assert.equal(runtime.keyDirectionWorld, identity, 'lighting does not allocate a new vector per frame');
assert.ok(runtime.keyDirectionWorld.distanceTo(expected) > .1, 'same-frame camera drag updates lighting, without a stale matrix');
tower.update({ delta: 0, settings: normalize({ keyLightAzimuth: -90, keyLightElevation: 0 }) });
assert.ok(body.material.uniforms.uKeyDirectionWorld.value.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-9);
group.add(tower.group);
tower.update({ delta: 0, settings: normalize({ keyLightAzimuth: -90, keyLightElevation: 0 }) });
assert.ok(body.material.uniforms.uKeyDirectionWorld.value.distanceTo(new THREE.Vector3(-1, 0, 0).transformDirection(group.matrixWorld)) < 1e-9,
  'standalone tower lighting respects its rotated parent too');

const settings = normalize({ lightAudioStrength: 1 });
for (let i = 0; i < 30; i++) tower.update({ delta: .05, playing: true, bass: 1, beat: 1, energy: 1, settings });
assert.ok(body.material.uniforms.uLightPulse.value > 1 && body.material.uniforms.uLightPulse.value <= 1.35, 'music gives bounded soft light modulation');
tower.update({ delta: 0, settings: normalize({ lightAudioStrength: 0 }) });
assert.equal(body.material.uniforms.uLightPulse.value, 1, 'zero lighting response disables only the new light pulse');
tower.update({ delta: 0, settings: normalize({ audioReactive: false, lightAudioStrength: 1 }) });
assert.equal(body.material.uniforms.uLightPulse.value, 1, 'global audio off disables lighting response too');
tower.update({ delta: 0, settings: normalize({ glowStrength: 0 }) });
assert.equal(halo.visible, false, 'zero glow does not draw an invisible halo');
tower.update({ delta: 0, settings: normalize() });
assert.equal(halo.visible, true);
const resources = tower.group.children.map(object => [object.geometry, object.material]);
for (let i = 0; i < 1000; i++) tower.update({ delta: .016, playing: true, settings });
assert.deepEqual(tower.group.children.map(object => [object.geometry, object.material]), resources, 'parameter and time changes do not rebuild GPU resources');
assert.equal(tower.diagnostics().drawCalls, 3, 'tower lighting adds no draw passes');
assert.equal((source.match(/toneMappingExposure\s*=/g) || []).length, 1, 'lighting controls do not alter global exposure or lyric tone mapping');
tower.dispose();
console.log('PASS harmonic lighting: live tower uniforms, shared world-space light, bounded audio, zero glow, stable resources and lyric exposure');
