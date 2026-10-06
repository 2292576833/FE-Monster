import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},Intl};vm.createContext(context);
for(const file of ['particle-lyrics-settings','particle-lyrics-runtime']){
  let source=readFileSync(new URL(`../web/${file}.js`,import.meta.url),'utf8');
  // Expose the pure position function only inside this test context.
  if(file==='particle-lyrics-runtime')source=source.replace('global.FeParticleLyricsRuntime=Object.freeze({','global.FeParticleLyricsRuntime=Object.freeze({idlePosition,prepareIdleShape,');
  vm.runInContext(source,context);
}
const s=context.window.FeParticleLyricsSettings,r=context.window.FeParticleLyricsRuntime;
const plain=x=>JSON.parse(JSON.stringify(x));
assert.equal(s.schema.length,new Set(s.schema.map(f=>f.key)).size);
for (const key of ['idleDisabled','skipIdleForLyrics']) {
  const field = s.schema.find(item => item.key === key);
  assert.deepEqual({ type: field?.type, group: field?.group, defaultValue: field?.defaultValue },
    { type: 'checkbox', group: '待机', defaultValue: false }, `${key} is an opt-in idle suppression control`);
  assert.equal(s.normalize({ [key]: true })[key], true, `${key} persists true`);
  assert.equal(s.change(s.normalize(), key, true)[key], true, `${key} changes through the settings API`);
}
for(const bad of [null,[],42,'bad',undefined])assert.deepEqual(plain(s.normalize(bad)),plain(s.normalize()));
assert.equal(s.normalize({opacity:0,density:12,particleSize:NaN,material:'bad'}).opacity,0.05);
assert.equal(s.normalize({density:12}).density,1);
assert.equal(s.normalize({material:'bad'}).material,'stardust');
{
  const idleSizeField=s.schema.find(field=>field.key==='idleParticleSize');
  assert.deepEqual(
    {type:idleSizeField?.type,group:idleSizeField?.group,defaultValue:idleSizeField?.defaultValue},
    {type:'range',group:'待机',defaultValue:2},
    '待机粒子大小 is an independent range control'
  );
  const configured=s.normalize({particleSize:1.25,idleParticleSize:4.4});
  assert.equal(r.particleSizeForPhase(configured,false),1.25,'歌词阶段继续使用粒子大小');
  assert.equal(r.particleSizeForPhase(configured,true),4.4,'待机阶段使用待机粒子大小');
  const changed=s.change(configured,'idleParticleSize',3.6);
  assert.equal(r.particleSizeForPhase(changed,true),3.6,'待机粒子大小修改立即作用于待机阶段');
  assert.equal(r.particleSizeForPhase(changed,false),1.25,'待机粒子大小修改不改变歌词阶段');
}
{
  const idleScaleField=s.schema.find(field=>field.key==='idleScale');
  assert.deepEqual(
    {type:idleScaleField?.type,group:idleScaleField?.group,defaultValue:idleScaleField?.defaultValue,min:idleScaleField?.min,max:idleScaleField?.max},
    {type:'range',group:'待机',defaultValue:1,min:.5,max:2.5},
    '待机整体尺寸 is an independent range control'
  );
  assert.equal(r.idleScaleForShape(s.normalize({idleScale:9})),2.5,'待机整体尺寸 is clamped to its safe maximum');
  assert.equal(r.idleScaleForShape(s.normalize({idleScale:.1})),.5,'待机整体尺寸 is clamped to its safe minimum');
  const runtime={settings:s.normalize({shape:'circle',idle:'rotate',idleScale:2}),lastFrame:{},viewWidth:1600,bass:0,beat:0};
  const large=[],base=[];
  r.idlePosition(runtime,50,0,false,large);
  runtime.settings.idleScale=1;
  r.idlePosition(runtime,50,0,false,base);
  assert.equal(large[0],base[0]*2,'待机整体尺寸 scales the idle shape footprint');
  assert.equal(large[1],base[1]*2,'待机整体尺寸 scales the idle shape height');
  assert.equal(large[2],base[2]*2,'待机整体尺寸 scales idle depth without changing playback');
}
let state=s.change(s.normalize(),'animationColorEnabled',true);
state=s.change(state,'colorA','#abcdef');
assert.equal(state.animationColors.vortex.colorA,'#abcdef');
state=s.change(state,'aggregation','rain');assert.equal(state.animationColorEnabled,false,'new animations keep global colors until independently enabled');
state=s.change(state,'animationColorEnabled',true);state=s.change(state,'colorA','#123456');
assert.equal(state.animationColors.vortex.colorA,'#abcdef');assert.equal(state.animationColors.rain.colorA,'#123456');
assert.equal(state.colorA,s.defaults.colorA,'animation-scoped edits preserve global colors');
assert.equal(s.change(state,'colorFlow',1.2).colorFlow,1.2,'material color-flow is not mistaken for a palette edit');
assert.deepEqual(plain(s.normalize(JSON.parse(JSON.stringify(state)))),plain(state));
state=s.change(state,'animationColorEnabled',false);
assert.equal(state.animationPaletteEnabled.vortex,true);assert.equal(state.animationPaletteEnabled.rain,false);
state=s.change(state,'aggregation','vortex');assert.equal(state.animationColorEnabled,true,'independent enable states survive switching');
const legacy=s.normalize({animationColorEnabled:true,aggregation:'rain',animationColors:{vortex:{colorA:'#112233',colorB:'#445566',colorC:'#778899'}}});
assert.equal(legacy.animationPaletteEnabled.vortex,true);assert.equal(legacy.animationPaletteEnabled.rain,true);assert.equal(legacy.animationPaletteEnabled.direct,false);
const invalid=s.change(state,'colorA','invalid');assert.match(invalid.animationColors.vortex.colorA,/^#[a-f0-9]{6}$/);
assert.equal(s.normalize({colorMode:'custom',colorA:'#112233'}).idlePaletteEnabled,false,'old preferences continue sharing the lyric palette');
const idlePaletteState=s.change(s.change(state,'idlePaletteEnabled',true),'idleColorA','#A1B2C3');
assert.equal(idlePaletteState.idleColorMode,'custom');assert.equal(idlePaletteState.idleColorA,'#a1b2c3');
assert.deepEqual(plain(idlePaletteState.animationColors),plain(state.animationColors),'idle edits leave scoped lyric palettes intact');
assert.equal(idlePaletteState.colorA,state.colorA,'idle edits leave the global lyric palette intact');
assert.deepEqual(plain(s.normalize(JSON.parse(JSON.stringify(idlePaletteState)))),plain(idlePaletteState),'idle colors survive persisted settings');
assert.equal(s.change(idlePaletteState,'idlePaletteEnabled',false).idleColorA,'#a1b2c3','turning off idle colors preserves them for reuse');
const malformedIdle=s.normalize({idleColorA:'bad',idleColorMode:'bad',idleGradientMode:'bad',idleGradientSpeed:Infinity,idleGradientSegments:90});
assert.equal(malformedIdle.idleColorA,s.defaults.idleColorA);assert.equal(malformedIdle.idleColorMode,'custom');
assert.equal(malformedIdle.idleGradientMode,'linear');assert.equal(malformedIdle.idleGradientSpeed,.15);assert.equal(malformedIdle.idleGradientSegments,8);
assert.equal(s.change(state,'idlePreset','strong').rotationSpeed,60);
assert.equal(Object.keys(s.idlePresets).length,15);
for(const [mode,presets] of Object.entries(s.idlePresets)){
  assert.equal(new Set(Object.values(presets).map(preset=>JSON.stringify(preset.values))).size,3,`${mode}: three distinct presets`);
  assert.equal(new Set(Object.values(presets).map(preset=>preset.label)).size,3,`${mode}: useful preset names`);
  for(const [level,preset] of Object.entries(presets)){
    const configured=s.change(s.change(s.normalize(),'idle',mode),'idlePreset',level);
    for(const [key,value] of Object.entries(preset.values))assert.equal(configured[key],value,`${mode}/${level}: ${key}`);
    assert.deepEqual(plain(s.normalize(configured)),plain(configured),'preset ranges and persistence stay valid');
  }
}
assert.equal(s.change(s.change(s.normalize(),'idlePreset','strong'),'idle','flow').flowLayers,3,'switching mode applies the corresponding level');
assert.equal(Object.keys(s.lightingPresets).length,5);
const protectedSettings=s.change(s.normalize({material:'glass',presentation:'sung',aggregation:'rain',positionX:0.42,rotationY:24,aggregateDuration:1.3,colorA:'#102030',colorMode:'custom'}),'animationColorEnabled',true);
for(const [name,preset] of Object.entries(s.lightingPresets)){
  const configured=s.change(protectedSettings,'lightingPreset',name);
  assert.equal(configured.lightingPreset,name);
  for(const [key,value] of Object.entries(preset.values))assert.equal(configured[key],value,`${name}: ${key}`);
  for(const field of s.schema.filter(field=>!field.group.startsWith('光影')))assert.deepEqual(plain(configured[field.key]),plain(protectedSettings[field.key]),`${name} preserves ${field.key}`);
  assert.deepEqual(plain(configured.animationColors),plain(protectedSettings.animationColors));
  assert.deepEqual(plain(s.normalize(JSON.parse(JSON.stringify(configured)))),plain(configured),'lighting presets stay valid after persistence');
  assert.equal(s.change(configured,'rimLight',0.7).lightingPreset,'custom','manual lighting edits leave the preset without overwriting other fields');
  assert.equal(s.change(configured,'rimColor','#112233').lightingPreset,'custom','effect colors count as manual lighting edits');
  assert.equal(s.change(configured,'colorA','#112233').lightingPreset,name,'text colors do not reset the lighting preset');
}
assert.equal(s.normalize({lightingPreset:'prism',rimLight:0.37}).rimLight,0.37,'loading a preset label never reapplies its values');
assert.equal(s.change(protectedSettings,'rimColor','#ffeedd').rimColor,'#ffeedd','effect colors are independent of animation palettes');
assert.deepEqual(plain(s.change(protectedSettings,'trailColor','#112244').animationColors),plain(protectedSettings.animationColors));
for(const field of s.schema.filter(field=>field.group.startsWith('光影')&&field.type==='range')){
  assert.equal(s.normalize({[field.key]:-Infinity})[field.key],field.defaultValue);
  assert.equal(s.normalize({[field.key]:field.min-10})[field.key],field.min);
  assert.equal(s.normalize({[field.key]:field.max+10})[field.key],field.max);
}
const effectColorControls=Object.fromEntries(['colorA','rimColor','trailColor'].map(key=>[key,{value:'',dataset:{},closest:()=>({hidden:false,querySelector:()=>null})}]));
s.syncControls({querySelector:selector=>effectColorControls[selector.match(/="([^"]+)"/)[1]]},s.change(protectedSettings,'rimColor','#ddccbb'));
assert.equal(effectColorControls.colorA.value,protectedSettings.animationColors.rain.colorA);
assert.equal(effectColorControls.rimColor.value,'#ddccbb');
assert.equal(effectColorControls.trailColor.value,s.defaults.trailColor,'effect colors remain visible while animation colors are scoped');
const transform=s.normalize({positionX:2,positionY:-2,rotationX:99,rotationY:-99,gestureScale:10});
assert.equal(transform.positionX,1);assert.equal(transform.positionY,-1);assert.equal(transform.rotationX,70);assert.equal(transform.rotationY,-70);assert.equal(transform.gestureScale,3);
const chars=r.graphemes('听见星光');
const cueCache={};
const mutableTiming={lineStart:10,lineEnd:14,audioTime:10.3,glyphTimings:[{char:'听',start:10,end:10.5},{char:'见',start:11,end:11.5}]};
const firstCue=r.resolveCue(mutableTiming,chars,cueCache);
assert.equal(r.resolveCue({...mutableTiming,audioTime:11.2},chars,cueCache).windows,firstCue.windows,'media-clock changes reuse normalized glyph windows');
mutableTiming.glyphTimings[0].start=10.4;
const replacedCue=r.resolveCue(mutableTiming,chars,cueCache);
assert.notEqual(replacedCue.windows,firstCue.windows,'in-place provider timing changes invalidate cached windows');
assert.equal(replacedCue.active,-1,'changed vocal boundary is observed immediately');
mutableTiming.glyphTimings[0].trackId='translation';
assert.equal(r.resolveCue(mutableTiming,chars,cueCache).windows.length,1,'track changes invalidate main-track filtering');
assert.equal(r.resolveCue({...mutableTiming,glyphTimings:[],lineEnd:18},chars,cueCache).windows.at(-1).end,18,'fallback windows follow edited line bounds');
const frame={lineStart:10,lineEnd:14,displayTime:11.3,glyphTimings:[{char:'听',start:10,end:10.5},{char:'见',start:11,end:11.5},{char:'星',start:12,end:12.5},{char:'光',start:13,end:13.5}]};
assert.equal(r.resolveCue(frame,chars).active,1);
assert.equal(r.resolveCue({...frame,displayTime:10.8},chars).active,-1);
assert.equal(r.resolveCue({...frame,displayTime:10.1},chars).active,0,'seek backward must resolve original glyph');
assert.equal(r.resolveCue({...frame,glyphTimings:[],displayTime:12.3},chars).active,2);
assert.equal(r.resolveCue({...frame,glyphTimings:[]},chars).exact,false);
assert.equal(r.resolveCue({lineStart:10,lineEnd:14,displayTime:10.2,glyphTimings:[{char:'听',startTime:10,duration:.5}]},chars).active,0,'startTime/duration timestamps are accepted');
assert.equal(r.resolveCue({...frame,audioTime:0},chars).active,-1,'zero media time takes priority over a stale display time');
assert.equal(r.resolveCue({...frame,audioTime:NaN},chars).active,1,'invalid optional media time falls back to the effective display clock');
assert.equal(r.resolveCue({lineStart:10,lineEnd:14,displayTime:10.2,glyphTimings:[null,{char:'听',startTime:10,endTime:10.5}]},chars).active,0,'endTime aliases preserve absolute seconds');
assert.equal(r.graphemes('A👩‍🚀好').length,3,'graphemes include joined emoji');
for(const shape of ['circle','square','star','spot','snowflake','note']){
  const runtime={settings:s.normalize({shape,idle:'rotate',rotationSpeed:30}),lastFrame:{},viewWidth:1600,bass:0,beat:0};
  const slow=[],fast=[];
  r.idlePosition(runtime,50,2,false,slow);
  runtime.settings.rotationSpeed=60;
  r.idlePosition(runtime,50,2,false,fast);
  assert.ok(Math.hypot(slow[0]-fast[0],slow[1]-fast[1])>1,`${shape}: speed changes overall orientation`);
  assert.ok(Math.abs(Math.hypot(slow[0],slow[1])-Math.hypot(fast[0],fast[1]))<1e-6,`${shape}: rotation preserves the shape's radius`);
}
for(const idle of ['rotate','flow']){
  const runtime={settings:s.normalize({shape:'note',idle}),lastFrame:{},viewWidth:1600,bass:0,beat:0};
  const clockwise=[],counter=[];
  r.idlePosition(runtime,50,2,false,clockwise);
  runtime.settings.direction='counter';
  r.idlePosition(runtime,50,2,false,counter);
  assert.ok(Math.hypot(clockwise[0]-counter[0],clockwise[1]-counter[1])>1,`${idle}: direction reverses particle travel`);
}
{
  const runtime={settings:{...s.normalize(),shape:'custom',customShape:[[-1,-.25],[1,-.25],[1,.25],[-1,.25]],idleShapeScale:1},
    lastFrame:{reducedMotion:true},viewWidth:1600,bass:0,beat:0,idleCacheBuildCount:0};
  r.prepareIdleShape(runtime,{});
  assert.equal(runtime.idleShapeResolved,'custom');assert.equal(runtime.idleShapePoints.length,8);
  const points=runtime.idleShapePoints;
  for(let i=0;i<80;i++)r.prepareIdleShape(runtime,{});
  assert.equal(runtime.idleShapePoints,points,'unchanged idle frames reuse the sampled typed array');
  assert.equal(runtime.idleCacheBuildCount,1,'unchanged frames never rebuild the idle shape');
  assert.equal(points[2]/points[5],4,'custom drawings retain their aspect ratio');
  const full=[],half=[];r.idlePosition(runtime,0,2,false,full);runtime.settings.idleShapeScale=.5;
  r.prepareIdleShape(runtime,{});r.idlePosition(runtime,0,2,false,half);
  assert.equal(full[0],half[0]*2);assert.equal(full[1],half[1]*2);
  assert.equal(runtime.idleShapePoints,points,'idle sizing changes do not rasterize or rebuild points');
  runtime.settings={...runtime.settings,customShape:runtime.settings.customShape.map(point=>[...point])};
  r.prepareIdleShape(runtime,{});assert.equal(runtime.idleShapePoints,points,'equal normalized arrays reuse the cached target');
  runtime.settings.customShape=[[0,0],[.2,.7]];r.prepareIdleShape(runtime,{});
  assert.equal(runtime.idleCacheBuildCount,2,'changed drawing coordinates rebuild exactly once');
  runtime.settings.customShape=[];r.prepareIdleShape(runtime,{});
  assert.equal(runtime.idleShapeResolved,'circle');assert.equal(runtime.idleShapePoints,null,'empty custom drawings fall back safely');
  const fallback=[];r.idlePosition(runtime,0,2,false,fallback);assert.ok(fallback.every(Number.isFinite));
}
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
assert.match(app,/setPlaybackLyricVisible\(state.playbackPage && enabled && state.textPreset !== 'particle-lyrics'\)/);
assert.match(app,/particleLyricsEffects: state.particleLyrics.effects/);
assert.match(app,/effectivePlaybackLyricTime\(position\)/);
assert.match(app,/frame\.hasLyrics\s*=\s*Boolean/,'the app supplies track-level lyric availability');
assert.match(app,/frame\.fallbackText\s*=|frame\.fallbackLyricKey\s*=/,'the app supplies explicit intro/interlude fallback lyrics');
console.log(`Particle lyrics: ${s.schema.length} settings, persistence, timing gaps, seeking, six rotating shapes, flow direction and integration contracts passed.`);
