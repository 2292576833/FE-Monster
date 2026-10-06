import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const scope={window:{},console};
for(const file of ['vendor/three.r128.min.js','harmonic-state-settings.js','harmonic-orbital-core.js','harmonic-orbital-atmosphere.js'])
  vm.runInNewContext(readFileSync(new URL('../web/'+file,import.meta.url),'utf8'),scope);
const runtime=readFileSync(new URL('../web/harmonic-state-runtime.js',import.meta.url),'utf8');
vm.runInNewContext(runtime.replace('    create,','    buildLightTowers,\n    create,'),scope);
assert.equal(scope.window.FeHarmonicSettings.defaults.idleAnimation,true,'idle animation is enabled for new and migrated settings');
const objects=[scope.window.FeHarmonicOrbitalCore.create(scope.THREE),scope.window.FeHarmonicOrbitalAtmosphere.create(scope.THREE),scope.window.FeHarmonicStateRuntime.buildLightTowers(scope.THREE)];
const settings=scope.window.FeHarmonicSettings.normalize();
for(const effect of objects){
  for(let i=0;i<30;i++)effect.update({delta:.05,playing:true,bass:1,mid:1,treble:1,settings});
  const before=effect.diagnostics();
  for(let i=0;i<120;i++)effect.update({delta:.05,playing:false,idleMotion:true,bass:1,mid:1,treble:1,settings});
  const idle=effect.diagnostics();
  const clock='ringPhase' in idle?'ringPhase':'rainTime' in idle?'rainTime':'breathPhase';
  assert.notEqual(idle[clock],before[clock],`${clock} continues gently when not playing`);
  const level=idle.bass??idle.audio??effect.mist.material.uniforms.uAudio.value;
  assert.ok(level<.001,'idle animation discards stale music energy instead of shaking forever');
  const frozen=JSON.stringify(idle);
  effect.update({delta:.05,playing:false,idleMotion:false,settings});
  assert.equal(JSON.stringify(effect.diagnostics()),frozen,'explicit idle off freezes decorations');
  effect.update({delta:.05,playing:false,idleMotion:true,reducedMotion:true,settings});
  assert.equal(JSON.stringify(effect.diagnostics()),frozen,'reduced motion overrides idle animation');
  effect.dispose();
}
console.log('PASS harmonic idle: default on, all decorations move, stale music decays, idle off and reduced motion freeze');
