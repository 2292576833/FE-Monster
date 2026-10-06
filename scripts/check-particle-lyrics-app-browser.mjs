import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'web');
const require=createRequire(import.meta.url);let chromium;
for(const p of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{({chromium}=require(p));break;}catch{}}
assert.ok(chromium);
const out=path.join(root,'output/playwright/particle-lyrics');mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(pathname==='/api/app/preferences/bootstrap.js'){res.setHeader('Content-Type','application/javascript');res.end('');return;}
 if(pathname.startsWith('/api/')){
  const fixtures={'/api/music-apis':{ok:true,providers:[]},'/api/user-cursors':{ok:true,cursors:[]},'/api/app/runtime':{ok:true,clientMode:'browser',renderBackend:'webgl',settings:{gpuAcceleration:true}},'/api/player/state':{ok:true,playing:false,paused:true,volume:.8,position:0,duration:0,queue:[],queueLength:0,queueRevision:0,queueIndex:-1},'/api/visual-bridge/state':{ok:true,audio:{}},'/api/sandbox/presets':{ok:true,presets:[]},'/api/sandbox/components':{ok:true,components:[]},'/api/community/status':{ok:true,authenticated:false},'/api/community/pet/status':{ok:true,pet:{state:'idle',voices:[]},sessions:[]}};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixtures[pathname]||{ok:true}));return;
 }
 const file=path.resolve(pathname.startsWith('/components/')?root:web,pathname==='/'?'index.html':pathname.replace(/^\//,''));
 if(!file.startsWith(root+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',`${mime[path.extname(file)]||'application/octet-stream'}; charset=utf-8`);res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),args:['--use-angle=d3d11','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#bootLogoButton').click();
 await page.waitForFunction(()=>typeof setTextPreset==='function'&&document.getElementById('bootScreen')?.hidden,null,{timeout:30000}).catch(async error=>{
  await page.screenshot({path:path.join(out,'app-boot-failure.png')});
  console.error(JSON.stringify({errors,boot:await page.locator('#bootScreen').textContent(),state:await page.evaluate(()=>({ready:document.readyState,app:typeof setTextPreset,boot:document.getElementById('bootScreen')?.className,services:document.documentElement.dataset.interactiveServices}))},null,2));throw error;
 });
 await page.evaluate(()=>{enterPresetPlaybackPage('lyric');setDiyOpen(true);setDiyPage('text');setDiyCardOpen(true);});
 await page.locator('#diyParticleLyricsPreset').click();
 await page.waitForFunction(()=>particleLyricsRuntimeSnapshot().active);
 assert.equal(await page.evaluate(()=>state.textPreset),'particle-lyrics');
 assert.equal(await page.locator('#particleLyricsScene').isVisible(),true);
 assert.equal(await page.locator('#playbackLyricScene').isVisible(),false);
 assert.equal(await page.locator('[data-particle-setting]').count(),await page.evaluate(()=>FeParticleLyricsSettings.schema.length));
 const uiSettings=await page.evaluate(()=>{
  setParticleLyricsEffect('idle','pulse');setParticleLyricsEffect('idlePreset','strong');
  const select=document.querySelector('[data-particle-setting="idlePreset"]');
  const label=select.selectedOptions[0].textContent,period=state.particleLyrics.effects.pulsePeriod,beatSync=state.particleLyrics.effects.beatSync;
  const hidden=document.querySelector('[data-particle-setting="rotationSpeed"]').closest('.particle-setting').hidden;
  setParticleLyricsEffect('idle','flow');
  const flowLabel=select.selectedOptions[0].textContent,layers=state.particleLyrics.effects.flowLayers;
  setParticleLyricsEffect('aggregation','vortex');setParticleLyricsEffect('animationColorEnabled',true);setParticleLyricsEffect('colorA','#ff8800');
  const vortex=state.particleLyrics.runtime.uniforms.uColorA.value.getHexString();
  setParticleLyricsEffect('aggregation','rain');
  const rainEnabled=document.querySelector('[data-particle-setting="animationColorEnabled"]').checked;
  setParticleLyricsEffect('animationColorEnabled',true);setParticleLyricsEffect('colorA','#00ff88');
  const rain=state.particleLyrics.runtime.uniforms.uColorA.value.getHexString();
  setParticleLyricsEffect('animationColorEnabled',false);setParticleLyricsEffect('aggregation','vortex');
  const restored=state.particleLyrics.runtime.uniforms.uColorA.value.getHexString(),enabled=document.querySelector('[data-particle-setting="animationColorEnabled"]').checked;
  saveVisualSettingsPreferences({immediate:true});
  const persisted=JSON.parse(localStorage.getItem('fe-monster-visual-settings-v1')).particleLyricsEffects;
  setParticleLyricsEffect('reset');
  return {label,period,beatSync,hidden,flowLabel,layers,vortex,rain,rainEnabled,restored,enabled,persisted};
 });
 assert.match(uiSettings.label,/快脉冲/);assert.equal(uiSettings.period,.2);assert.equal(uiSettings.beatSync,false);assert.equal(uiSettings.hidden,true);
 assert.match(uiSettings.flowLabel,/三层/);assert.equal(uiSettings.layers,3);assert.equal(uiSettings.vortex,'ff8800');assert.equal(uiSettings.rain,'00ff88');assert.equal(uiSettings.restored,'ff8800');assert.equal(uiSettings.enabled,true);assert.equal(uiSettings.rainEnabled,false);
 assert.equal(uiSettings.persisted.animationPaletteEnabled.vortex,true);assert.equal(uiSettings.persisted.animationPaletteEnabled.rain,false);
 assert.equal(uiSettings.persisted.animationColors.rain.colorA,'#00ff88');
 // Use the real text control and the normal app save path. Custom point data
 // must survive normalization, preset teardown and reload without truncation.
 const idleText='今夜星河\n听见你的声音 ✨';
 const customShape=Array.from({length:1024},(_,index)=>{
  const angle=index/1024*Math.PI*2,radius=.65+.24*Math.cos(angle*5);
  return [Math.cos(angle)*radius,Math.sin(angle)*radius];
 });
 await page.locator('[data-particle-setting="shape"]').selectOption('text');
 await page.locator('[data-particle-setting="idleText"]').fill(idleText);
 assert.equal(await page.evaluate(()=>state.particleLyrics.effects.idleText),idleText,'idle text is saved through the actual input callback');
 const customIdle=await page.evaluate(points=>{
  setParticleLyricsEffect('customShape',points);setParticleLyricsEffect('idleShapeScale',1.35);
  for(const [key,value]of Object.entries({idlePaletteEnabled:true,idleColorMode:'custom',idleColorA:'#eb304f',idleColorB:'#52d99c',idleColorC:'#465eff',idleGradientMode:'flow',idleGradientSpeed:.38,idleGradientSegments:5}))setParticleLyricsEffect(key,value);
  saveVisualSettingsPreferences({immediate:true});
  const local=JSON.parse(localStorage.getItem('fe-monster-visual-settings-v1')).particleLyricsEffects;
  const client=JSON.parse(collectClientPreferences()['fe-monster-visual-settings-v1']).particleLyricsEffects;
  return {local,client};
 },customShape);
 for(const settings of [customIdle.local,customIdle.client]){
  assert.equal(settings.shape,'custom');assert.equal(settings.idleText,idleText);assert.equal(settings.idleShapeScale,1.35);
  assert.deepEqual(settings.customShape,customShape,'all 1024 normalized shape points are retained');
  assert.equal(settings.idlePaletteEnabled,true);assert.equal(settings.idleColorA,'#eb304f');assert.equal(settings.idleGradientMode,'flow');assert.equal(settings.idleGradientSpeed,.38);assert.equal(settings.idleGradientSegments,5);
 }
 await page.locator('[data-particle-setting="presentation"]').selectOption('sung');
 await page.evaluate(()=>setParticleLyricsEffect('bloomStrength',.7));
 await page.evaluate(()=>saveVisualSettingsPreferences({immediate:true}));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fe-monster-visual-settings-v1')));
 assert.equal(saved.textPreset,'particle-lyrics');assert.equal(saved.particleLyricsEffects.presentation,'sung');assert.equal(saved.particleLyricsEffects.bloomStrength,.7);
 // The real app adapter must use the authoritative clock, not a stale UI index.
 const adapter=await page.evaluate(()=>{
  state.currentSong={id:'particle-fixture',title:'星光',artist:'Fixture',duration:20,position:0};
  state.lyricSignature=lyricSignatureForSong(state.currentSong);state.lyricNoLyricSignature='';
  state.lyricLines=[{time:0,text:'听见星光',glyphTimings:[{char:'听',start:0,end:1},{char:'见',start:1,end:2},{char:'星',start:2,end:3},{char:'光',start:3,end:4}]},{time:5,text:'微尘汇聚成歌'}];
  state.lyricIndex=1;state.playerClock={position:2.2,duration:20,playing:true,updatedAt:performance.now()};
  updateParticleLyricsMotion();
  return {text:state.particleLyrics.frame.text,time:state.particleLyrics.frame.displayTime,glyph:state.particleLyrics.runtime.activeGlyph};
 });
 assert.equal(adapter.text,'听见星光');assert.equal(adapter.glyph,2);
 // Provider display notices are not sung lyrics. Exercise the actual app
 // adapter and particle renderer together, including a vocal -> instrumental switch.
 const standby=await page.evaluate(()=>{
  const original={song:state.currentSong,lines:state.lyricLines,signature:state.lyricSignature,noLyrics:state.lyricNoLyricSignature,clock:state.playerClock,effects:state.particleLyrics.effects};
  try{
   state.particleLyrics.effects=FeParticleLyricsSettings.normalize({...original.effects,skipIdleForLyrics:true,idleDisabled:false,presentation:'line'});
   FeParticleLyricsRuntime.setSettings(state.particleLyrics.runtime,state.particleLyrics.effects);
   const sample=(id,lines)=>{
    state.currentSong={id,title:id,artist:'Fixture',duration:20,position:1};
    state.lyricSignature=lyricSignatureForSong(state.currentSong);state.lyricNoLyricSignature='';
    state.lyricLines=lines;state.playerClock={position:1,duration:20,playing:true,updatedAt:performance.now()};
    updateParticleLyricsMotion();
    return {hasLyrics:state.particleLyrics.frame.hasLyrics,fallback:state.particleLyrics.frame.fallbackText,
     activeCount:state.particleLyrics.runtime.activeCount,drawCount:state.particleLyrics.runtime.geometry.drawRange.count,
     suppressed:FeParticleLyricsRuntime.diagnostics(state.particleLyrics.runtime).idleSuppressed};
   };
   return [sample('vocal-intro',[{time:5,text:'第一句歌词'}]),
    sample('instrumental-notice',[{time:0,text:'纯音乐，请欣赏'}]),
    sample('instrumental-empty',[]),
    sample('instrumental-credits',[{time:0,text:'作曲：某某'},{time:.5,text:'Instrumental'}])];
  }finally{
   state.currentSong=original.song;state.lyricLines=original.lines;state.lyricSignature=original.signature;
   state.lyricNoLyricSignature=original.noLyrics;state.playerClock=original.clock;state.particleLyrics.effects=original.effects;
   FeParticleLyricsRuntime.setSettings(state.particleLyrics.runtime,original.effects);updateParticleLyricsMotion();
  }
 });
 assert.equal(standby[0].hasLyrics,true);assert.equal(standby[0].fallback,'第一句歌词');assert.ok(standby[0].activeCount>0);
 for(const sample of standby.slice(1)){
  assert.equal(sample.hasLyrics,false);assert.equal(sample.fallback,'');assert.equal(sample.activeCount,0);
  assert.equal(sample.suppressed,false);assert.ok(sample.drawCount>0,'instrumentals show the idle particles even when keep-awake is enabled');
 }
 // Decode and play a real media element: wall-clock/render ticks must never
 // replace its timestamp, including paused seeks within the same glyph.
 const mediaClock=await page.evaluate(async()=>{
  const original={audio:els.audio,song:state.currentSong,lines:state.lyricLines,lyricSignature:state.lyricSignature,lyricNoLyricSignature:state.lyricNoLyricSignature,clock:state.playerClock,card:state.qishuiPlaybackCard,presentation:state.particleLyrics.effects.presentation};
  const sampleRate=8000,seconds=20,samples=sampleRate*seconds,buffer=new ArrayBuffer(44+samples*2),view=new DataView(buffer);
  const tag=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  tag(0,'RIFF');view.setUint32(4,36+samples*2,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples*2,true);
  for(let i=0;i<samples;i++)view.setInt16(44+i*2,Math.round(Math.sin(i/sampleRate*Math.PI*440)*1600),true);
  const url=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'})),audio=new Audio();audio.muted=true;
  const mediaEvent=event=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>finish(new Error(`Audio ${event} timed out`)),10000);
   const success=()=>finish(),failure=()=>finish(new Error(`Audio error: ${audio.error?.message||audio.error?.code}`));
   const finish=error=>{clearTimeout(timeout);audio.removeEventListener(event,success);audio.removeEventListener('error',failure);error?reject(error):resolve();};
   audio.addEventListener(event,success,{once:true});audio.addEventListener('error',failure,{once:true});
  });
  const seek=async time=>{const ready=mediaEvent('seeked');audio.currentTime=time;await ready;updateParticleLyricsMotion();};
  const snapshot=()=>Array.from(state.particleLyrics.runtime.positions).filter((_,i)=>state.particleLyrics.runtime.enabled[Math.floor(i/3)]);
  const same=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
  try{
   const ready=mediaEvent('loadeddata');audio.src=url;audio.load();await ready;
   els.audio=audio;
   state.currentSong={id:'particle-media-fixture',title:'星光',artist:'Fixture',duration:seconds,position:18};
   state.lyricSignature=lyricSignatureForSong(state.currentSong);state.lyricNoLyricSignature='';
   state.lyricLines=[{time:0,text:'星光',glyphTimings:[{char:'星',start:0,end:1},{char:'光',start:2,end:3}]},{time:5,text:'下一行'}];
   state.qishuiPlaybackCard={...original.card,progressDragging:false,pendingSeekTarget:null,seekHandoffTarget:null};
   // The deliberately conflicting fallback must not win when audio is loaded.
   state.playerClock={position:18,duration:seconds,playing:true,updatedAt:performance.now()};
   const modes=[];
   for(const presentation of ['sung','progressive']){
    setParticleLyricsEffect('presentation',presentation);
    await seek(.03);const first=snapshot(),firstCount=state.particleLyrics.runtime.activeCount;
    for(let i=0;i<8;i++)updateParticleLyricsMotion();
    const pausedStable=same(first,snapshot()),firstTime=state.particleLyrics.runtime.audioTime;
    await seek(.1);const forwardMoves=!same(first,snapshot()),sameGlyph=state.particleLyrics.runtime.activeGlyph===0;
    await seek(.03);const rewinds=same(first,snapshot());
    await seek(2.03);const secondCount=state.particleLyrics.runtime.activeCount,secondGlyph=state.particleLyrics.runtime.activeGlyph;
    await seek(1.5);const gapCount=state.particleLyrics.runtime.activeCount,gapGlyph=state.particleLyrics.runtime.activeGlyph;
    modes.push({presentation,pausedStable,firstTime,forwardMoves,sameGlyph,rewinds,firstCount,secondCount,secondGlyph,gapCount,gapGlyph,playing:state.particleLyrics.frame.playing});
   }
   setParticleLyricsEffect('presentation','sung');await seek(.03);audio.playbackRate=2;
   await audio.play();
   const startTime=audio.currentTime,startWall=performance.now();
   const samples=[];
   while(audio.currentTime<startTime+.5&&performance.now()-startWall<3000){
    await new Promise(resolve=>setTimeout(resolve,35));updateParticleLyricsMotion();
    samples.push({media:audio.currentTime,effective:effectivePlaybackLyricTime(audio.currentTime),runtime:state.particleLyrics.runtime.audioTime,playing:state.particleLyrics.frame.playing});
   }
   audio.pause();updateParticleLyricsMotion();
   return {duration:audio.duration,playbackRate:audio.playbackRate,startTime,endTime:audio.currentTime,modes,samples};
  }finally{
   audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);
   els.audio=original.audio;state.currentSong=original.song;state.lyricLines=original.lines;state.lyricSignature=original.lyricSignature;state.lyricNoLyricSignature=original.lyricNoLyricSignature;state.playerClock=original.clock;state.qishuiPlaybackCard=original.card;
   setParticleLyricsEffect('presentation',original.presentation);saveVisualSettingsPreferences({immediate:true});updateParticleLyricsMotion();
  }
 });
 assert.equal(mediaClock.duration,20,'the generated WAV is decoded by HTMLAudioElement');
 for(const mode of mediaClock.modes){
  assert.ok(Math.abs(mode.firstTime-.03)<1e-6,`${mode.presentation}: media time wins over the conflicting fallback clock`);
  for(const key of ['pausedStable','forwardMoves','sameGlyph','rewinds'])assert.equal(mode[key],true,`${mode.presentation}: paused media seek ${key}`);
  assert.equal(mode.playing,false,'paused audio wins over stale playerClock.playing');
  assert.equal(mode.secondGlyph,1);assert.equal(mode.gapGlyph,-1);
  if(mode.presentation==='sung')assert.equal(mode.gapCount,0,'sung mode dissolves during a timestamp gap');
  else{assert.ok(mode.secondCount>mode.firstCount,'progressive mode retains the already sung glyph');assert.equal(mode.gapCount,mode.firstCount,'seeking backward removes the future glyph');}
 }
 assert.equal(mediaClock.playbackRate,2);assert.ok(mediaClock.endTime>=mediaClock.startTime+.5,'the real audio clock advances during 2× playback');
 assert.ok(mediaClock.samples.length>0);
 for(const sample of mediaClock.samples){assert.equal(sample.playing,true);assert.ok(Math.abs(sample.runtime-sample.effective)<.03,'runtime tracks the effective media timestamp at 2× playback');}
 await page.evaluate(()=>{
  setDiyOpen(false);setQishuiPlaybackHidden(true);
  state.playerClock={position:.7,duration:20,playing:false,updatedAt:performance.now()};
  setParticleLyricsEffect('presentation','line');updateParticleLyricsMotion();
 });
 const input=page.locator('#particleLyricsCore .particle-lyrics-interaction');
 let bounds=await input.boundingBox();
 if(!bounds)console.error('Missing lyric hit area',await page.evaluate(()=>({frame:state.particleLyrics.frame,diagnostics:particleLyricsRuntimeSnapshot(),page:state.playbackPage,preset:state.textPreset,hidden:document.getElementById('particleLyricsScene').hidden,host:document.getElementById('particleLyricsCore').getBoundingClientRect().toJSON()})));
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2-65,bounds.y+bounds.height/2-45,{steps:5});await page.mouse.up();
 const moved=await page.evaluate(()=>({...state.particleLyrics.effects}));assert.ok(moved.positionX<0&&moved.positionY>0,'real app drag commits position');
 bounds=await input.boundingBox();
 await page.mouse.move(bounds.x+bounds.width*.1,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.1+30,bounds.y+bounds.height/2+20,{steps:5});await page.mouse.up();
 const rotated=await page.evaluate(()=>({...state.particleLyrics.effects}));assert.ok(rotated.rotationX>0&&rotated.rotationY>0,'real app edge drag commits angle');
 bounds=await input.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,-120);
 await page.waitForFunction(()=>state.particleLyrics.effects.gestureScale>1);
 const transform=await page.evaluate(()=>{
  setParticleLyricsEffect('presentation','sung');saveVisualSettingsPreferences({immediate:true});
  return Object.fromEntries(['positionX','positionY','rotationX','rotationY','gestureScale'].map(key=>[key,state.particleLyrics.effects[key]]));
 });
 await page.evaluate(()=>{setQishuiPlaybackHidden(false);setDiyOpen(true);setDiyPage('text');setDiyCardOpen(true);});
 await page.screenshot({path:path.join(out,'06-app-controls.png')});
 await page.locator('#diyLyricPreset').click();
 assert.equal(await page.locator('#particleLyricsCore canvas').count(),0);
 assert.equal(await page.locator('#playbackLyricScene').isVisible(),true);
 await page.locator('#diyParticleLyricsPreset').click();await page.waitForFunction(()=>particleLyricsRuntimeSnapshot().active);
 assert.equal(await page.locator('#particleLyricsCore canvas').count(),1);
 await page.reload();await page.locator('#bootLogoButton').click();await page.waitForFunction(()=>particleLyricsRuntimeSnapshot().active);
 assert.equal(await page.evaluate(()=>state.particleLyrics.effects.presentation),'sung');
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(['positionX','positionY','rotationX','rotationY','gestureScale'].map(key=>[key,state.particleLyrics.effects[key]]))),transform,'gesture settings survive reload');
 const restoredIdle=await page.evaluate(()=>{
  const {shape,idleText,idleShapeScale,customShape}=state.particleLyrics.effects;
  return {shape,idleText,idleShapeScale,customShape};
 });
 assert.deepEqual(restoredIdle,{shape:'custom',idleText,idleShapeScale:1.35,customShape},'custom idle shape and text survive the full app reload');
 const restoredIdleColor=await page.evaluate(()=>Object.fromEntries(['idlePaletteEnabled','idleColorMode','idleColorA','idleColorB','idleColorC','idleGradientMode','idleGradientSpeed','idleGradientSegments'].map(key=>[key,state.particleLyrics.effects[key]])));
 assert.deepEqual(restoredIdleColor,{idlePaletteEnabled:true,idleColorMode:'custom',idleColorA:'#eb304f',idleColorB:'#52d99c',idleColorC:'#465eff',idleGradientMode:'flow',idleGradientSpeed:.38,idleGradientSegments:5},'independent idle colors and gradients survive the full app save and reload');
 const idleScheduleStart=await page.evaluate(()=>{
  setDiyOpen(false);setQishuiPlaybackHidden(true);setDiyPreset('cover-particles');
  Object.assign(state.coverParticle,{renderMode:'particles',depthEnabled:false,motionGate:0,energy:0,wholeJump:0,bassJitter:0});
  Object.assign(state.playbackVisual,{dragging:false,velocityYaw:0,velocityPitch:0});state.orb.mouseActive=false;
  state.currentSong={id:'idle-schedule',title:'待机',artist:'Fixture',duration:20,position:1};state.lyricLines=[];
  state.playerClock={position:1,duration:20,playing:true,updatedAt:performance.now()};updateParticleLyricsMotion();
  const wasPlaying=state.particleLyrics.frame.playing;
  state.playerClock={position:1,duration:20,playing:false,updatedAt:performance.now()};updateParticleLyricsMotion();requestOrbFrame();
  return {wasPlaying,playing:state.particleLyrics.frame.playing,clock:state.particleLyrics.runtime.clock,renderFrame:state.particleLyrics.runtime.renderer.info.render.frame,everPlayed:state.particleLyrics.runtime.everPlayed,activeCount:state.particleLyrics.runtime.activeCount};
 });
 assert.equal(idleScheduleStart.wasPlaying,true);assert.equal(idleScheduleStart.playing,false);assert.equal(idleScheduleStart.everPlayed,true);assert.equal(idleScheduleStart.activeCount,0);
 await page.waitForFunction(start=>state.particleLyrics.runtime.clock>start+.2,idleScheduleStart.clock,{timeout:10000});
 const idleScheduleEnd=await page.evaluate(()=>({clock:state.particleLyrics.runtime.clock,renderFrame:state.particleLyrics.runtime.renderer.info.render.frame,playing:state.particleLyrics.frame.playing,activeCount:state.particleLyrics.runtime.activeCount}));
 assert.equal(idleScheduleEnd.playing,false);assert.equal(idleScheduleEnd.activeCount,0);assert.ok(idleScheduleEnd.renderFrame>idleScheduleStart.renderFrame+2,'the actual cover-particle app scheduler continues rendering paused idle lyrics');
 // Reduced motion legitimately stops the app's animation loop. An in-progress
 // gesture must request a render without prematurely saving the preference.
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.locator('#bootLogoButton').click();await page.waitForFunction(()=>particleLyricsRuntimeSnapshot().active);
 await page.evaluate(()=>{
  setDiyOpen(false);setQishuiPlaybackHidden(true);setDiyPreset('cover-particles');
  Object.assign(state.coverParticle,{renderMode:'particles',depthEnabled:false,motionGate:0,energy:0,wholeJump:0,bassJitter:0});
  Object.assign(state.playbackVisual,{dragging:false,velocityYaw:0,velocityPitch:0});state.orb.mouseActive=false;
  state.currentSong=null;state.lyricLines=[];state.playerClock={position:0,duration:0,playing:false,updatedAt:performance.now()};
  for(const [key,value]of Object.entries({shape:'square',positionX:0,positionY:0,rotationX:0,rotationY:0,gestureScale:1,bloomStrength:0}))setParticleLyricsEffect(key,value);
  updateParticleLyricsMotion();requestOrbFrame();
 });
 assert.equal(await page.evaluate(()=>reducedMotion),true);await page.waitForFunction(()=>state.orb.animationFrame===0);
 const idleHit=page.locator('#particleLyricsCore .particle-lyrics-interaction'),idleBounds=await idleHit.boundingBox();assert.ok(idleBounds);
 await page.mouse.move(idleBounds.x+idleBounds.width/2,idleBounds.y+idleBounds.height/2);await page.mouse.down();
 await page.waitForTimeout(1800);await page.waitForFunction(()=>state.orb.animationFrame===0);
 const dragBefore=await page.evaluate(()=>({renderFrame:state.particleLyrics.runtime.renderer.info.render.frame,savedX:state.particleLyrics.effects.positionX,clock:state.particleLyrics.runtime.clock}));
 await page.mouse.move(idleBounds.x+idleBounds.width/2+60,idleBounds.y+idleBounds.height/2-35,{steps:5});
 await page.waitForFunction(frame=>state.particleLyrics.runtime.renderer.info.render.frame>frame,dragBefore.renderFrame);
 const dragDuring=await page.evaluate(()=>({renderFrame:state.particleLyrics.runtime.renderer.info.render.frame,savedX:state.particleLyrics.effects.positionX,runtimeX:state.particleLyrics.runtime.settings.positionX,clock:state.particleLyrics.runtime.clock,dragging:!!state.particleLyrics.runtime.drag}));
 assert.equal(dragDuring.dragging,true);assert.equal(dragDuring.savedX,dragBefore.savedX,'dragging does not save on every pointermove');assert.ok(dragDuring.runtimeX>dragBefore.savedX,'the pointer changes the actual runtime transform before release');assert.equal(dragDuring.clock,dragBefore.clock,'drag invalidation does not resume reduced-motion animation');
 await page.mouse.up();const dragAfter=await page.evaluate(()=>({savedX:state.particleLyrics.effects.positionX,dragging:!!state.particleLyrics.runtime.drag}));
 assert.equal(dragAfter.dragging,false);assert.equal(dragAfter.savedX,dragDuring.runtimeX,'pointer release persists the transform already rendered while dragging');
 assert.equal(await page.locator('#particleLyricsCore canvas').count(),1);
 assert.deepEqual(errors,[]);
 writeFileSync(path.join(out,'app-results.json'),JSON.stringify({adapter,mediaClock,transform,customIdle:{text:idleText,points:restoredIdle.customShape.length,scale:restoredIdle.idleShapeScale},restoredIdleColor,idleScheduler:{start:idleScheduleStart,end:idleScheduleEnd},reducedMotionDrag:{before:dragBefore,during:dragDuring,after:dragAfter},restored:true,canvasCount:1,errors},null,2));
 console.log('Particle lyrics app: preset controls, custom idle text/1024-point and color persistence, real audio timestamp priority, paused seek/rewind, 2× playback, real mouse drag/rotate/zoom, idle RAF scheduling, immediate reduced-motion drag rendering, persistence/reload and switch lifecycle passed.');
}finally{await browser?.close();server.close();}
