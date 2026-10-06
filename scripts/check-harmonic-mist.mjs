import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), sandbox);
const source = readFileSync(new URL('../web/harmonic-state-runtime.js', import.meta.url), 'utf8');
vm.runInNewContext(source.replace('    create,', '    buildMistAtmosphere,\n    create,'), sandbox);
const anchors = [
  { x: -8, z: -9, baseY: -7, height: 20, radius: .85 },
  { x: -5, z: -13, baseY: -7, height: 25, radius: .75 },
  { x: 7, z: -11, baseY: -7, height: 22, radius: .9 },
  { x: 11, z: -16, baseY: -7, height: 17, radius: .7 }
];
const mist = sandbox.window.FeHarmonicStateRuntime.buildMistAtmosphere(sandbox.THREE, anchors);
const settings = { fogEnabled: true, fogDensity: .55, fogSpeed: .45,
  fogHeight: 1, fogSpread: 1, waterEnabled: true, towersEnabled: true, audioReactive: true };
const frame = { delta: .08, playing: true, reducedMotion: false, bass: .4, settings };
mist.update(frame);
assert.ok(mist.diagnostics().time > 0, 'flowing fog advances independently of the carousel');
assert.equal(mist.diagnostics().layerCount, 11, 'eight tower plumes and three low mist layers');
assert.equal(mist.group.children.length, 2, 'fog layers share a single draw plus one water plane');
const before = mist.diagnostics().time;
mist.update({ ...frame, playing: false });
mist.update({ ...frame, reducedMotion: true });
mist.update({ ...frame, settings: { ...settings, fogSpeed: 0 } });
assert.equal(mist.diagnostics().time, before, 'pause, reduced motion, and speed zero all freeze fog');
mist.update({ ...frame, reducedMotion: true, bass: 1 });
assert.equal(mist.fogMaterial.uniforms.uEnergy.value, 0, 'reduced motion disables audio shimmer as well as drift');
assert.equal(mist.waterMaterial.uniforms.uEnergy.value, 0, 'reduced motion also freezes water brightness');
mist.update({ ...frame, settings: { ...settings, fogSpeed: 2 } });
assert.ok(Math.abs(mist.diagnostics().time - before - .16) < 1e-8, 'speed changes integrate without a phase jump');
mist.update({ ...frame, settings: { ...settings, fogDensity: .9, fogHeight: 1.6, fogSpread: 1.5 } });
assert.equal(mist.fogMaterial.uniforms.uDensity.value, .9);
assert.equal(mist.fogMaterial.uniforms.uHeight.value, 1.6);
assert.equal(mist.fogMaterial.uniforms.uSpread.value, 1.5);
mist.update({ ...frame, settings: { ...settings, fogEnabled: false, waterEnabled: false } });
assert.ok(mist.group.children.every(mesh => !mesh.visible), 'mist and water can be disabled independently');
const oldColor = mist.fogMaterial.uniforms.uColorA.value.clone();
mist.setPalette([{ r: 255, g: 70, b: 120 }, { r: 80, g: 255, b: 180 }, { r: 60, g: 120, b: 255 }]);
assert.notDeepEqual(mist.fogMaterial.uniforms.uColorA.value, oldColor, 'mist tint follows selected lighting colors');
for (let i = 0; i < 4000; i++) mist.update(frame);
mist.group.updateMatrixWorld(true);
const resources = new Set();
mist.group.traverse(object => {
  assert.ok(object.matrixWorld.elements.every(Number.isFinite));
  if (object.geometry) {
    resources.add(object.geometry);
    assert.ok(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite));
  }
  if (object.material) {
    resources.add(object.material);
    for (const uniform of Object.values(object.material.uniforms)) {
      if (typeof uniform.value === 'number') assert.ok(Number.isFinite(uniform.value));
      if (uniform.value?.isTexture) resources.add(uniform.value);
    }
  }
});
const counts = new Map([...resources].map(item => [item, 0]));
for (const item of resources) item.addEventListener('dispose', () => counts.set(item, counts.get(item) + 1));
mist.dispose();
mist.dispose();
for (const count of counts.values()) assert.equal(count, 1, 'shared noise, geometry and materials release once');
assert.equal(mist.group.children.length, 0);
console.log('PASS harmonic flowing mist: layers, independent time, parameters, palette, bounded geometry and complete disposal');
