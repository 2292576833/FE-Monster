import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'output/playwright/particle-idle');
mkdirSync(output,{recursive:true});
const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(candidate));break;}catch{/* Use the bundled local runtime. */}
}
assert.ok(chromium,'Playwright is required');
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&edge?{executablePath:edge}:{}),
  args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
const errors=[],evidence={};
try{
  const page=await browser.newPage({viewport:{width:1080,height:720},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body,#host{margin:0;width:100%;height:100%;overflow:hidden;background:#050b12}canvas{display:block}button{display:none}</style><div id="host"></div>');
  for(const file of ['vendor/three.r128.min.js','particle-lyrics-settings.js','particle-lyrics-runtime.js'])await page.addScriptTag({content:readFileSync(path.join(root,'web',file),'utf8')});
  await page.evaluate(()=>{
    let reads=0;const original=CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){reads++;return original.apply(this,args);};
    const api=FeParticleLyricsRuntime,host=document.getElementById('host');
    const runtime=api.create(host,{pixelRatio:1,settings:{bloomStrength:0,idle:'float',floatAmount:0,scatter:1,depth:0,particleSize:2.2},
      createRenderer:options=>new THREE.WebGLRenderer({...options,preserveDrawingBuffer:true})});
    const frame={now:1000,playing:false,hasLyric:false,text:'',lyricKey:'idle',audioTime:0,lineStart:0,lineEnd:6,bass:.4,beat:.2,reducedMotion:true};
    const buffers=[runtime.positions,runtime.targets,runtime.from,runtime.geometry.attributes.position.array,runtime.trailPositions];
    const gl=runtime.renderer.getContext(),samples=new Map();
    function step(count=1,changes={}){Object.assign(frame,changes);for(let i=0;i<count;i++){frame.now+=1000/60;api.update(runtime,frame);}return api.diagnostics(runtime);}
    function configure(changes){api.setSettings(runtime,{...runtime.settings,...changes});return step();}
    function pixels(name){
      const width=runtime.renderer.domElement.width,height=runtime.renderer.domElement.height;
      const result=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,result);
      let visible=0,brightness=0;
      for(let i=0;i<result.length;i+=4){const sum=result[i]+result[i+1]+result[i+2];brightness+=sum;if(sum>60)visible++;}
      samples.set(name,result);return {visible,brightness,width,height,glError:gl.getError()};
    }
    function compare(a,b){const first=samples.get(a),second=samples.get(b);let changed=0,difference=0;
      for(let i=0;i<first.length;i+=4){const value=Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2]);difference+=value;if(value>12)changed++;}
      return {changed,difference};}
    function bounds(){let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<4500;i++){minX=Math.min(minX,runtime.positions[i*3]);maxX=Math.max(maxX,runtime.positions[i*3]);minY=Math.min(minY,runtime.positions[i*3+1]);maxY=Math.max(maxY,runtime.positions[i*3+1]);}
      return {width:maxX-minX,height:maxY-minY,minX,maxX,minY,maxY};}
    window.idleTest={runtime,frame,step,configure,pixels,compare,bounds,reads:()=>reads,
      resources:()=>({buffersStable:buffers.every((buffer,index)=>buffer===[runtime.positions,runtime.targets,runtime.from,runtime.geometry.attributes.position.array,runtime.trailPositions][index]),memory:{...runtime.renderer.info.memory},draws:runtime.renderer.info.render.calls}),
      snapshot:()=>Array.from(runtime.positions).filter((_,i)=>runtime.enabled[Math.floor(i/3)]),
      finish(){api.dispose(runtime);return {diagnostics:api.diagnostics(runtime),canvases:host.querySelectorAll('canvas').length};}};
    step();
  });
  evidence.text=await page.evaluate(()=>idleTest.configure({shape:'text',idleText:'星光\nFE MONSTER'}));
  assert.equal(evidence.text.idleShapeResolved,'text');assert.equal(evidence.text.idleRows,2);assert.ok(evidence.text.idlePointCount>500);
  assert.equal(evidence.text.idleMainCount,4500,'short text keeps the original idle budget');
  evidence.textPixels=await page.evaluate(()=>idleTest.pixels('text'));assert.ok(evidence.textPixels.visible>1000);assert.equal(evidence.textPixels.glError,0);
  await page.screenshot({path:path.join(output,'idle-text.png')});
  evidence.cache=await page.evaluate(()=>{
    const points=idleTest.runtime.idleShapePoints,builds=FeParticleLyricsRuntime.diagnostics(idleTest.runtime).idleCacheBuildCount,reads=idleTest.reads(),resources=idleTest.resources();
    idleTest.step(120);idleTest.configure({brightness:1.3,idleShapeScale:1.25});idleTest.step(20);
    return {sameArray:points===idleTest.runtime.idleShapePoints,buildsBefore:builds,buildsAfter:FeParticleLyricsRuntime.diagnostics(idleTest.runtime).idleCacheBuildCount,readsBefore:reads,readsAfter:idleTest.reads(),resourcesBefore:resources,resourcesAfter:idleTest.resources()};
  });
  assert.ok(evidence.cache.sameArray);assert.equal(evidence.cache.buildsBefore,evidence.cache.buildsAfter);assert.equal(evidence.cache.readsBefore,evidence.cache.readsAfter,'unchanged text, animation and size edits never rasterize glyphs again');
  assert.deepEqual(evidence.cache.resourcesAfter.memory,evidence.cache.resourcesBefore.memory);assert.ok(evidence.cache.resourcesAfter.buffersStable);
  evidence.changedText=await page.evaluate(()=>{const before=FeParticleLyricsRuntime.diagnostics(idleTest.runtime).idleCacheBuildCount;const after=idleTest.configure({idleText:'海浪回应每次呼吸',idleShapeScale:1});idleTest.pixels('changed-text');return {before,after,difference:idleTest.compare('text','changed-text')};});
  assert.equal(evidence.changedText.after.idleCacheBuildCount,evidence.changedText.before+1);assert.ok(evidence.changedText.difference.changed>1000,'editing idle words changes actual WebGL pixels immediately');
  evidence.longText=await page.evaluate(()=>idleTest.configure({idleText:'星光'.repeat(40)}));
  assert.equal(evidence.longText.idleMainCount,15000);assert.equal(evidence.longText.idlePointCount,15000,'long text uses the existing particle capacity to keep strokes readable');
  assert.ok(evidence.longText.idleRows<=3,'80 characters fit within the three-row idle layout');
  evidence.longTextCache=await page.evaluate(()=>{
    const points=idleTest.runtime.idleShapePoints,reads=idleTest.reads(),before=FeParticleLyricsRuntime.diagnostics(idleTest.runtime),resources=idleTest.resources();
    idleTest.step(100);idleTest.configure({idleShapeScale:1.1});idleTest.step(20);
    const after=FeParticleLyricsRuntime.diagnostics(idleTest.runtime);
    return {samePoints:points===idleTest.runtime.idleShapePoints,readsBefore:reads,readsAfter:idleTest.reads(),before,after,
      resourcesBefore:resources,resourcesAfter:idleTest.resources(),drawCount:idleTest.runtime.geometry.drawRange.count};
  });
  assert.ok(evidence.longTextCache.samePoints);assert.equal(evidence.longTextCache.readsBefore,evidence.longTextCache.readsAfter);
  assert.equal(evidence.longTextCache.before.idleCacheBuildCount,evidence.longTextCache.after.idleCacheBuildCount);
  assert.equal(evidence.longTextCache.drawCount,16500,'long text has exactly its main budget plus 1,500 ambient particles');
  assert.ok(evidence.longTextCache.drawCount<=evidence.longTextCache.after.particleCount);
  assert.ok(evidence.longTextCache.resourcesAfter.buffersStable);assert.deepEqual(evidence.longTextCache.resourcesAfter.memory,evidence.cache.resourcesBefore.memory);
  await page.evaluate(()=>idleTest.configure({idleShapeScale:1}));
  await page.screenshot({path:path.join(output,'idle-text-80.png')});
  const ellipse=Array.from({length:1024},(_,i)=>[Math.cos(i*Math.PI/512),Math.sin(i*Math.PI/512)*.3]);
  evidence.custom=await page.evaluate(points=>{const diagnostics=idleTest.configure({shape:'custom',customShape:points,idleShapeScale:1});return {diagnostics,bounds:idleTest.bounds(),pixels:idleTest.pixels('custom')};},ellipse);
  assert.equal(evidence.custom.diagnostics.idlePointCount,1024);assert.equal(evidence.custom.diagnostics.idleShapeResolved,'custom');
  assert.equal(evidence.custom.diagnostics.idleMainCount,4500,'switching back to a drawing releases the extra text draw budget');
  assert.ok(Math.abs(evidence.custom.bounds.width/evidence.custom.bounds.height-1/.3)<1e-5,'custom coordinates retain the drawn aspect ratio');assert.ok(evidence.custom.pixels.visible>300);
  evidence.size=await page.evaluate(()=>{const array=idleTest.runtime.idleShapePoints;const before=idleTest.bounds();idleTest.configure({idleShapeScale:.5});return {before,after:idleTest.bounds(),sameArray:array===idleTest.runtime.idleShapePoints};});
  assert.ok(evidence.size.sameArray);assert.ok(Math.abs(evidence.size.before.width/evidence.size.after.width-2)<1e-6);
  const heart=Array.from({length:720},(_,i)=>{const t=i*Math.PI/360;return [16*Math.sin(t)**3/17,(13*Math.cos(t)-5*Math.cos(t*2)-2*Math.cos(t*3)-Math.cos(t*4))/17];});
  await page.evaluate(points=>idleTest.configure({customShape:points,idleShapeScale:1.3}),heart);await page.screenshot({path:path.join(output,'idle-drawing.png')});
  evidence.motion=await page.evaluate(()=>{
    const modes=FeParticleLyricsSettings.schema.find(field=>field.key==='idle').options.map(option=>option.value),result=[];
    const resources=idleTest.resources(),cache=FeParticleLyricsRuntime.diagnostics(idleTest.runtime).idleCacheBuildCount;
    idleTest.frame.reducedMotion=false;
    for(const mode of modes){idleTest.configure({idle:mode});const before=idleTest.runtime.positions.slice(0,300);const diagnostics=idleTest.step(25);result.push({mode,finite:diagnostics.finite,changed:before.some((value,index)=>value!==idleTest.runtime.positions[index])});}
    return {modes:result,cacheBefore:cache,cacheAfter:FeParticleLyricsRuntime.diagnostics(idleTest.runtime).idleCacheBuildCount,resourcesBefore:resources,resourcesAfter:idleTest.resources()};
  });
  assert.ok(evidence.motion.modes.every(mode=>mode.finite));assert.equal(evidence.motion.cacheBefore,evidence.motion.cacheAfter);assert.deepEqual(evidence.motion.resourcesBefore.memory,evidence.motion.resourcesAfter.memory);
  for(const shape of ['text','custom']){
    const empty=await page.evaluate(shape=>idleTest.configure({shape,idleText:'   ',customShape:[]}),shape);
    assert.equal(empty.idleShapeResolved,'circle');assert.equal(empty.idlePointCount,0);assert.ok(empty.finite);
  }
  evidence.suppression=await page.evaluate(()=>{
    idleTest.configure({idleDisabled:true,skipIdleForLyrics:false});
    const disabled=idleTest.step(2,{hasLyrics:false,hasLyric:false,text:'',playing:false});
    const disabledDraw=idleTest.runtime.geometry.drawRange.count;
    idleTest.configure({idleDisabled:false,skipIdleForLyrics:true});
    const lyricGap=idleTest.step(2,{hasLyrics:true,hasLyric:false,text:'',playing:true});
    const lyricGapDraw=idleTest.runtime.geometry.drawRange.count;
    const introFallback=idleTest.step(2,{hasLyrics:true,hasLyric:false,text:'',fallbackText:'第一句歌词',fallbackLyricKey:'suppressed-fallback',fallbackLineStart:0,fallbackLineEnd:4,playing:true});
    const introFallbackDraw=idleTest.runtime.geometry.drawRange.count;
    const pausedGap=idleTest.step(2,{hasLyrics:true,hasLyric:false,text:'',fallbackText:'第一句歌词',fallbackLyricKey:'paused-fallback',fallbackLineStart:0,fallbackLineEnd:4,playing:false});
    const pausedGapDraw=idleTest.runtime.geometry.drawRange.count;
    const pureMusic=idleTest.step(2,{hasLyrics:false,hasLyric:false,text:'',playing:true});
    const pureMusicDraw=idleTest.runtime.geometry.drawRange.count;
    const active=idleTest.step(2,{hasLyrics:true,hasLyric:true,text:'星光',playing:true,lyricKey:'suppressed-active',audioTime:1,lineStart:0,lineEnd:2});
    return {disabled,disabledDraw,lyricGap,lyricGapDraw,introFallback,introFallbackDraw,pausedGap,pausedGapDraw,pureMusic,pureMusicDraw,active,activeDraw:idleTest.runtime.geometry.drawRange.count};
  });
  assert.equal(evidence.suppression.disabled.idleSuppressed,true,'关闭待机 hides the no-lyric idle field');
  assert.equal(evidence.suppression.disabledDraw,0);
  assert.equal(evidence.suppression.lyricGap.idleSuppressed,true,'a lyric track gap does not enter idle');
  assert.equal(evidence.suppression.lyricGapDraw,0);
  assert.equal(evidence.suppression.introFallback.idleSuppressed,false,'an explicit fallback lyric keeps the previous/first line visible');
  assert.ok(evidence.suppression.introFallbackDraw>0);
  assert.equal(evidence.suppression.pausedGap.idleSuppressed,false,'skipping idle never applies while the music is not playing');
  assert.equal(evidence.suppression.pausedGap.assembledCount,0,'a paused lyric track shows the idle shape instead of assembling the fallback line');
  assert.ok(evidence.suppression.pausedGapDraw>0);
  assert.equal(evidence.suppression.pureMusic.idleSuppressed,false,'pure music retains the existing idle field');
  assert.ok(evidence.suppression.pureMusicDraw>0);
  assert.equal(evidence.suppression.active.idleSuppressed,false,'active lyrics remain visible with suppression enabled');
  assert.ok(evidence.suppression.active.assembledCount>0);
  evidence.lyricStability=await page.evaluate(()=>{
    idleTest.configure({shape:'text',idleText:'等待音乐',idle:'float',floatAmount:0,presentation:'line'});
    idleTest.step(100,{hasLyric:true,text:'星光流向海面',playing:true,reducedMotion:false,lyricKey:'main-line',audioTime:2});
    const before=idleTest.snapshot(),selection=idleTest.runtime.selectionKey;
    idleTest.step(1,{playing:false});idleTest.configure({idleText:'暂停后编辑待机文字',idleShapeScale:1.7});idleTest.step(10);
    const afterText=idleTest.snapshot();idleTest.configure({shape:'custom',customShape:[[-1,-1],[1,-1],[1,1],[-1,1]]});idleTest.step(10);
    const afterShape=idleTest.snapshot(),diagnostics=FeParticleLyricsRuntime.diagnostics(idleTest.runtime);
    return {count:diagnostics.assembledCount,settled:diagnostics.settled,unchangedSelection:selection===idleTest.runtime.selectionKey,textStable:JSON.stringify(before)===JSON.stringify(afterText),shapeStable:JSON.stringify(before)===JSON.stringify(afterShape)};
  });
  assert.ok(evidence.lyricStability.count>500&&evidence.lyricStability.settled);assert.ok(evidence.lyricStability.unchangedSelection&&evidence.lyricStability.textStable&&evidence.lyricStability.shapeStable,'idle edits never dissolve or move paused assembled lyrics');
  evidence.timing=await page.evaluate(()=>{
    idleTest.configure({presentation:'sung',shape:'text',idleText:'星海'});
    idleTest.step(1,{text:'星光',lyricKey:'timed-line',playing:true,audioTime:10.4,lineStart:10,lineEnd:12,glyphTimings:[{char:'星',start:10,end:10.8},{char:'光',start:11,end:11.8}]});
    const before=idleTest.snapshot(),glyph=idleTest.runtime.activeGlyph;idleTest.configure({idleText:'新的待机图案'});idleTest.step(1);
    const stable=JSON.stringify(before)===JSON.stringify(idleTest.snapshot());idleTest.step(1,{audioTime:11.4});
    return {glyph,stable,next:idleTest.runtime.activeGlyph};
  });
  assert.equal(evidence.timing.glyph,0);assert.ok(evidence.timing.stable);assert.equal(evidence.timing.next,1,'idle text edits leave exact media-timestamp aggregation intact');
  evidence.disposal=await page.evaluate(()=>idleTest.finish());assert.equal(evidence.disposal.canvases,0);assert.equal(evidence.disposal.diagnostics.idlePointCount,0);
  evidence.mobileBudget=await page.evaluate(()=>{
    const api=FeParticleLyricsRuntime,host=document.getElementById('host');
    const runtime=api.create(host,{mobile:true,pixelRatio:1,settings:{shape:'text',idleText:'星光'.repeat(40),bloomStrength:0}});
    api.update(runtime,{now:5000,playing:false,hasLyric:false,text:'',reducedMotion:true});
    const result={diagnostics:api.diagnostics(runtime),drawCount:runtime.geometry.drawRange.count,bufferLength:runtime.positions.length,glError:runtime.renderer.getContext().getError()};
    api.dispose(runtime);return result;
  });
  assert.equal(evidence.mobileBudget.diagnostics.particleCount,10000);assert.equal(evidence.mobileBudget.diagnostics.idleMainCount,8500);
  assert.equal(evidence.mobileBudget.diagnostics.idlePointCount,8500);assert.equal(evidence.mobileBudget.drawCount,10000);
  assert.equal(evidence.mobileBudget.bufferLength,30000);assert.equal(evidence.mobileBudget.glError,0);
  assert.deepEqual(errors,[],'production shaders render without errors');
  console.log('PASS custom particle idle runtime: real GPU text/drawings, 80 characters/1024 points, aspect/scale, cached raster targets, all idle modes, lyric/pause/timestamp isolation and stable buffers');
}finally{writeFileSync(path.join(output,'result.json'),JSON.stringify({errors,evidence},null,2));await browser.close();}
