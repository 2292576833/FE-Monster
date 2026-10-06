import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = new URL('../web/harmonic-orbital-atmosphere.js', import.meta.url);
assert.ok(existsSync(file), 'the orbital mist/rain factory must exist');
const scope = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), scope);
vm.runInNewContext(readFileSync(file, 'utf8'), scope);
const effect = scope.window.FeHarmonicOrbitalAtmosphere.create(scope.THREE);
const settings = { fogEnabled:true,fogDensity:.4,fogSpeed:.45,fogHeight:1,fogSpread:1,
  rainEnabled:true,rainDensity:.65,rainSpeed:.65,splashStrength:.75,audioReactive:true };
const frame = { settings,delta:.05,playing:true,ringRadius:7.1,pixelRatio:1,bass:.6 };
effect.update(frame);
assert.ok(effect.diagnostics().layerCount >= 20);
assert.ok(effect.diagnostics().rainCount > 100);
assert.equal(effect.diagnostics().impactCount, effect.diagnostics().rainCount);
assert.equal(effect.mist.material.uniforms.uRadius.value,7.1);
effect.update({...frame,ringRadius:11.36*1.35});
assert.equal(effect.mist.material.uniforms.uRadius.value,11.36*1.35,'mist follows the enlarged ring even at maximum scale');
// All three rain phases share the same origin, seed and cycle: no unrelated random impacts.
for (const key of ['aOrigin','aSeed']) {
  assert.deepEqual(Array.from(effect.rain.geometry.getAttribute(key).array),Array.from(effect.impacts.geometry.getAttribute(key).array));
}
for(let i=0;i<100;i++)effect.update(frame);
const hold=JSON.stringify(effect.diagnostics());
effect.update({...frame,playing:false,bass:1});assert.equal(JSON.stringify(effect.diagnostics()),hold);
effect.update({...frame,reducedMotion:true,bass:1});assert.equal(JSON.stringify(effect.diagnostics()),hold);
effect.update({...frame,delta:0,settings:{...settings,fogEnabled:false,rainEnabled:false}});
assert.equal(effect.mist.visible,false);assert.equal(effect.rain.visible,false);assert.equal(effect.impacts.visible,false);
effect.update({...frame,settings:{...settings,rainDensity:1,fogSpeed:0,rainSpeed:0,splashStrength:0},ringRadius:9});
const stopped=JSON.stringify(effect.diagnostics());
for(let i=0;i<100;i++)effect.update({...frame,settings:{...settings,rainDensity:1,fogSpeed:0,rainSpeed:0,splashStrength:0},ringRadius:9});
assert.equal(effect.diagnostics().time,JSON.parse(stopped).time);
assert.equal(effect.diagnostics().rainTime,JSON.parse(stopped).rainTime);
assert.equal(effect.splashes.visible,false);assert.equal(effect.mist.material.uniforms.uRadius.value,9);
assert.equal(effect.diagnostics().rainCount,180);
effect.setPalette([{r:20,g:230,b:240},{r:120,g:80,b:255},{r:240,g:80,b:180}]);
const resources=new Set();effect.group.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
const released=new Map([...resources].map(r=>[r,0]));
for(const r of resources)r.addEventListener('dispose',()=>released.set(r,released.get(r)+1));
effect.dispose();effect.dispose();assert.ok([...released.values()].every(n=>n===1));
assert.equal(effect.group.children.length,0);
console.log('PASS orbital atmosphere: ring-local mist, coherent rain/impact/splash seeds, controls, frozen clocks and disposal');
