import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const modulePath = new URL('../web/harmonic-orbital-core.js', import.meta.url);
assert.ok(existsSync(modulePath), 'the new orbital core must exist');
const scope = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), scope);
vm.runInNewContext(readFileSync(modulePath, 'utf8'), scope);
const core = scope.window.FeHarmonicOrbitalCore.create(scope.THREE);
const defaults = { ringsEnabled:true,ringSpeed:.35,ringScale:1,ringGlow:.7,cubeEnabled:true,cubeSize:1,
  floatSpeed:.65,floatAmount:.55,surfaceRiseEnabled:true,rippleStrength:.8,bassRiseStrength:.8,shakeStrength:.6,bassGain:1,midGain:1,trebleGain:1,
  raysEnabled:true,rayDensity:1,raySpeed:.8,rayShake:.65,audioReactive:true,colorSpeed:.35 };
const frame = { delta:.05,playing:true,reducedMotion:false,bass:0,mid:0,treble:0,beat:0,settings:defaults };
const initial = core.diagnostics();
assert.ok(initial.ringCount >= 4, 'several independently tilted rings make the spherical silhouette');
assert.equal(initial.faceCount, 6);
assert.ok(initial.tileCount >= 1500, 'six faces retain a fine raised-tile grid');
assert.ok(initial.rayCount >= 16, 'each corner sends more than one particle ray');
assert.ok(initial.beamStrands >= 7, 'beams have a volumetric cross-section, not coincident thin lines');
assert.equal(core.rays.children.some(child=>child.isLineSegments),false,'particle beams do not render thin line segments');
assert.equal(core.dotGeometry.drawRange.count,initial.rayCount*initial.beamSamples*initial.beamStrands);
function checkBeamVolume(sample) {
  const info=sample.diagnostics(),positions=sample.dotGeometry.attributes.position;
  let spread=0;
  for(let j=0;j<info.beamSamples;j++){
    const center=new scope.THREE.Vector3().fromBufferAttribute(positions,j*info.beamStrands);
    for(let strand=1;strand<info.beamStrands;strand++){
      const edge=new scope.THREE.Vector3().fromBufferAttribute(positions,j*info.beamStrands+strand);
      const width=center.distanceTo(edge);spread=Math.max(spread,width);
      assert.ok(width<=info.beamRadius+1e-5,'bundle radius stays bounded');
      if(j===0||j===info.beamSamples-1)assert.ok(width<1e-5,'beam cross-section converges exactly at its attachment');
    }
  }
  assert.ok(spread>.1,'particles occupy a visible 3D bundle around the centerline');
}
checkBeamVolume(core);
for (let i=0;i<20;i++) core.update(frame);
assert.notEqual(core.diagnostics().ringPhase, initial.ringPhase);
assert.notDeepEqual(core.diagnostics().cubePosition, initial.cubePosition, 'silent playback retains gentle breathing float');
assert.ok(core.diagnostics().rayAnchorError < 1e-5, 'rays remain attached to both moving endpoints');
function checkStickyCorners(sample) {
  const positions=sample.lineGeometry.attributes.position;
  for(let i=0;i<sample.diagnostics().rayCount;i++){
    const start=new scope.THREE.Vector3().fromBufferAttribute(positions,i*80);
    const end=new scope.THREE.Vector3().fromBufferAttribute(positions,i*80+79);
    assert.ok(start.distanceTo(sample.sources[i])<1e-5,'each line starts exactly on the moving corner');
    assert.ok(end.distanceTo(sample.targets[i])<1e-5,'each line ends exactly on its rotating ring');
  }
  assert.ok(sample.diagnostics().adhesionLag>=0,'elastic curve lag is explicitly observable');
}
checkStickyCorners(core);
function decorativeState() {
  const { rippleAmplitude, surface, ...motion } = core.diagnostics();
  const { rippleStrength, bassRiseStrength, surfaceRiseEnabled, ...radiance } = surface;
  return JSON.stringify({ ...motion, surface: radiance });
}
const held=decorativeState();
const heldParticles=core.dotGeometry.attributes.position.array.slice();
core.update({...frame,playing:false,bass:1,mid:1,treble:1});
assert.equal(decorativeState(),held,'pause freezes decorative motion while selecting idle surface height');
assert.deepEqual(core.dotGeometry.attributes.position.array,heldParticles,'pause freezes particle transport and beam width');
core.update({...frame,reducedMotion:true,bass:1,mid:1,treble:1});
assert.equal(decorativeState(),held,'reduced motion freezes decorative motion');
const visibleParticles=core.dotGeometry.attributes.position.array.slice();
core.update({...frame,delta:0,settings:{...defaults,ringsEnabled:false}});
assert.equal(core.rings.visible,false);
assert.equal(core.cube.visible,true,'hiding rings keeps the cube');
assert.equal(core.rays.visible,true,'hiding rings keeps independent particle beams');
assert.deepEqual(core.dotGeometry.attributes.position.array,visibleParticles,'ring visibility does not move beam anchors or particles');
for (const band of ['bass','mid','treble']) {
  const sample=scope.window.FeHarmonicOrbitalCore.create(scope.THREE);
  for(let i=0;i<30;i++) sample.update({...frame,[band]:1});
  assert.ok(sample.diagnostics()[band]>.9, `${band} reaches the actual core`);
  assert.ok(sample.diagnostics().rayAnchorError<1e-5);
  checkStickyCorners(sample);
  if(band==='bass') {
    assert.ok(sample.diagnostics().rippleAmplitude>.1,'audio bass uses the independent music height control');
    sample.update({...frame,bass:1,settings:{...defaults,surfaceRiseEnabled:false}});
    assert.equal(sample.diagnostics().rippleAmplitude,0,'the separate rise switch can still keep the surface flat');
  }
  sample.dispose();
}
core.update({...frame,settings:{...defaults,ringsEnabled:false,cubeEnabled:false,raysEnabled:false},delta:0});
assert.equal(core.rings.visible,false);assert.equal(core.cube.visible,false);assert.equal(core.rays.visible,false);
core.update({...frame,settings:{...defaults,ringScale:1.3,cubeSize:1.2,rayDensity:2}});
assert.equal(core.diagnostics().ringRadius,11.36*1.3);
assert.equal(core.diagnostics().rayCount,48);
core.setPalette([{r:255,g:120,b:45},{r:10,g:240,b:200},{r:80,g:100,b:255}]);
for(let i=0;i<4000;i++)core.update({...frame,bass:.9,mid:.5,treble:.8});
checkBeamVolume(core);
const resources=new Set([core.lineGeometry]);core.group.updateMatrixWorld(true);
core.group.traverse(o=>{
  assert.ok(o.matrixWorld.elements.every(Number.isFinite));
  if(o.geometry)resources.add(o.geometry);
  for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat){resources.add(mat);for(const u of Object.values(mat.uniforms||{})){if(typeof u.value==='number')assert.ok(Number.isFinite(u.value));if(u.value?.isTexture)resources.add(u.value);}}
  if(o.isInstancedMesh)resources.add(o);
});
const calls=new Map([...resources].map(r=>[r,0]));
for(const r of resources)r.addEventListener('dispose',()=>calls.set(r,calls.get(r)+1));
core.dispose();core.dispose();
assert.ok([...calls.values()].every(n=>n===1),'all core GPU resources release exactly once');
assert.equal(core.group.children.length,0);
console.log('PASS orbital core: rotating/hidden rings, six tiled faces, volumetric corner particle beams, audio bands, freeze and disposal');
