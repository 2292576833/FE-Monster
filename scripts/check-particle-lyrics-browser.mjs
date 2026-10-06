import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);let chromium;
for(const p of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{({chromium}=require(p));break;}catch{}}
assert.ok(chromium,'Playwright required');
const out=path.join(root,'output/playwright/particle-lyrics');mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=pathname==='/'?path.join(root,'scripts/fixtures/particle-lyrics.html'):path.join(root,'web',pathname);if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');res.end(readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
if(process.argv.includes('--serve')){console.log(url);await new Promise(()=>{});}
let browser;
try{
 browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),args:['--use-angle=d3d11','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(url);await page.waitForFunction(()=>window.runtime);
 await page.evaluate(()=>step(120));await page.screenshot({path:path.join(out,'01-idle.png')});
 let result=await page.evaluate(()=>step(90,{playing:true,displayTime:2}));assert.equal(result.settled,true);assert.ok(result.assembledCount>1000);assert.ok(result.finite);
 await page.screenshot({path:path.join(out,'02-line.png')});
 const input=page.locator('.particle-lyrics-interaction');
 assert.equal(await input.count(),1);assert.equal(await input.isVisible(),true);
 await page.evaluate(()=>{window.transformChanges=[];runtime.onTransformChange=value=>transformChanges.push(value);});
 let box=await input.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+75,box.y+box.height/2+40,{steps:5});await page.mouse.up();
 let transform=await page.evaluate(()=>({...runtime.settings}));
 assert.ok(transform.positionX>0&&transform.positionY<0,'central drag moves lyrics');assert.equal(transform.rotationX,0);assert.equal(transform.rotationY,0);
 box=await input.boundingBox();
 await page.mouse.move(box.x+box.width*.9,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.9+45,box.y+box.height/2+20,{steps:5});await page.mouse.up();
 let rotated=await page.evaluate(()=>({...runtime.settings}));
 assert.ok(rotated.rotationY>0&&rotated.rotationX>0,'edge drag rotates lyrics');assert.equal(rotated.positionX,transform.positionX);assert.equal(rotated.positionY,transform.positionY);
 box=await input.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-120);
 await page.waitForFunction(()=>runtime.settings.gestureScale>1);
 const scale=await page.evaluate(()=>runtime.settings.gestureScale);assert.ok(scale>1);
 await page.mouse.move(20,200);await page.mouse.wheel(0,-120);
 assert.equal(await page.evaluate(()=>runtime.settings.gestureScale),scale,'wheel outside lyrics does not resize');
 assert.equal(await page.evaluate(()=>transformChanges.length),3,'gestures notify persistence only on commits');
 assert.ok(await page.evaluate(()=>runtime.content.position.x>0&&runtime.content.rotation.y>0&&runtime.content.scale.x>1));
 await page.evaluate(()=>{configure({positionX:0,positionY:0,rotationX:0,rotationY:0,gestureScale:1});step(1);});
 const before=await page.evaluate(()=>Array.from(runtime.positions.slice(0,runtime.activeCount*3)));
 await page.evaluate(()=>{configure({display:'beat',displayThreshold:.9});step(30,{bass:0,beat:0});});
 assert.deepEqual(await page.evaluate(()=>Array.from(runtime.positions.slice(0,runtime.activeCount*3))),before,'display gate must not deform finished glyphs');
 assert.equal(await page.evaluate(()=>runtime.data[3]),1,'finished glyph remains visible in silence');
 const paused=await page.evaluate(()=>{step(1,{playing:false});const t=runtime.clock,positions=Array.from(runtime.positions.slice(0,runtime.activeCount*3));step(60);return {start:t,clock:runtime.clock,uTime:runtime.uniforms.uTime.value,still:positions.every((value,index)=>value===runtime.positions[index])};});
 assert.ok(paused.clock>paused.start+.5,'the particle lyrics animation keeps running while the music is paused');
 assert.equal(paused.still,true,'a paused formed lyric keeps its assembled positions');
 assert.equal(paused.uTime,paused.clock,'shader time follows the never-pausing decorative clock');
 const pausedFrames=await page.evaluate(()=>{
  configure({presentation:'line',material:'water',movingLight:1,movingLightSpeed:1,sweepStrength:1,sweepSpeed:.6,sweepWidth:.4,sparkleStrength:1,sparkleDensity:.6,breathe:1,beating:0,breathingLight:1,breathingPeriod:2,volumeLight:1,volumeSpeed:.8,gradientMode:'flow',gradientSpeed:.5});
  step(60,{playing:false,text:'暂停仍在流动',lyricKey:'never-pause-frames'});
  const read=()=>{
   runtime.geometry.setDrawRange(0,runtime.activeCount);runtime.renderer.setRenderTarget(null);runtime.renderer.clear();runtime.renderer.render(runtime.scene,runtime.camera);
   const gl=runtime.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
  };
  const first=read(),formedBefore=Array.from(runtime.positions.slice(0,runtime.activeCount*3));
  step(45,{playing:false});
  const second=read();
  let different=0;for(let index=0;index<first.length;index+=1)if(Math.abs(first[index]-second[index])>8)different+=1;
  return {different,formedStable:formedBefore.every((value,index)=>value===runtime.positions[index]),clock:runtime.clock};
 });
 assert.ok(pausedFrames.clock>1,'the paused runtime keeps its decorative clock running');
 assert.ok(pausedFrames.formedStable,'the paused lyric keeps exact assembled positions while its light animates');
 assert.ok(pausedFrames.different>500,'a paused lyric still animates instead of freezing the frame');
 for(const presentation of ['sung','progressive']){
  const clockTest=await page.evaluate(mode=>{
   configure({presentation:mode,aggregation:'vortex',display:'continuous'});
   const snapshot=()=>Array.from(runtime.positions).filter((_,index)=>runtime.enabled[Math.floor(index/3)]);
   const same=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
   step(1,{playing:true,text:'星光',lyricKey:`media-${mode}`,lineStart:40,lineEnd:44,displayTime:0,audioTime:40.03,glyphTimings:[{char:'星',start:40,end:41},{char:'光',start:42,end:43}]});
   const early=snapshot(),active=runtime.activeGlyph;
   step(20);const frozen=same(early,snapshot());
   step(1,{audioTime:40.08});const moved=!same(early,snapshot());
   const beforePause=snapshot();step(10,{playing:false});const pauseStable=same(beforePause,snapshot());
   step(1,{playing:true});const resumeStable=same(beforePause,snapshot());
   step(1,{audioTime:40.7});const caughtUp=runtime.settled;
   step(1,{audioTime:40.03});const rewound=same(early,snapshot())&&!runtime.settled;
   step(1,{glyphTimings:[{char:'星',start:39.5,end:41},{char:'光',start:42,end:43}]});
   const timingReplaced=runtime.settled;
   step(1,{audioTime:42.04,glyphTimings:[{char:'星',start:40,end:41},{char:'光',start:42,end:42.08}]});
   const shortSyllable=runtime.activeGlyph===1&&runtime.settled;
   delete frame.audioTime;
   return {active,frozen,moved,pauseStable,resumeStable,caughtUp,rewound,timingReplaced,shortSyllable};
  },presentation);
  assert.equal(clockTest.active,0,'authoritative media timestamp wins over a stale display sample');
  for(const key of ['frozen','moved','pauseStable','resumeStable','caughtUp','rewound','timingReplaced','shortSyllable'])assert.equal(clockTest[key],true,`${presentation}: media clock invariant ${key}`);
 }
 await page.evaluate(()=>{configure({presentation:'sung',display:'continuous'});step(30,{playing:true,text:'星光',lyricKey:'timed',lineStart:0,lineEnd:4,displayTime:.2,glyphTimings:[{char:'星',start:0,end:1},{char:'光',start:2,end:3}]});});
 assert.equal(await page.evaluate(()=>api.diagnostics(runtime).activeGlyph),0);
 await page.evaluate(()=>step(30,{displayTime:1.5}));assert.equal(await page.evaluate(()=>runtime.activeCount),0,'timestamp gap dissolves all letters');
 await page.evaluate(()=>step(30,{displayTime:2.2}));assert.equal(await page.evaluate(()=>api.diagnostics(runtime).activeGlyph),1);
 await page.screenshot({path:path.join(out,'03-sung.png')});
 const dense=await page.evaluate(()=>{configure({density:1});step(30);return runtime.activeCount;});
 const sparse=await page.evaluate(()=>{configure({density:.3});step(30);return runtime.activeCount;});
 assert.ok(sparse<dense*.4,'density must affect short single-glyph lyrics');
 await page.evaluate(()=>{configure({density:.8});step(30);});
 await page.evaluate(()=>{configure({presentation:'progressive'});step(60,{displayTime:.2});});
 const firstCount=await page.evaluate(()=>runtime.activeCount);await page.evaluate(()=>step(60,{displayTime:2.2}));assert.ok(await page.evaluate(()=>runtime.activeCount)>firstCount);
 const pauseSeek=await page.evaluate(()=>{
  step(1,{playing:false,displayTime:.7});const earlier=runtime.activeCount;
  step(1,{displayTime:2.7});const later=runtime.activeCount;
  return {earlier,later,settled:runtime.settled};
 });assert.ok(pauseSeek.later>pauseSeek.earlier);assert.equal(pauseSeek.settled,true);
 await page.evaluate(()=>{
   configure({presentation:'line',aggregation:'vortex'});
   step(1,{playing:false,lyricKey:'resume',text:'暂停后继续聚合',glyphTimings:[],lineStart:0,lineEnd:4,displayTime:0});
   step(1,{playing:true});
   const before=Array.from(runtime.positions.slice(0,12));
   step(12,{playing:true});
   window.__resumeMoved=before.some((value,index)=>value!==runtime.positions[index]);
 });
 assert.equal(await page.evaluate(()=>window.__resumeMoved),true,'resume must restart aggregation after a paused seek');
 for(const material of ['glass','bubble','metal','neon','stardust','hologram','water','fire','ice','aurora']){await page.evaluate(m=>{configure({material:m});step(3);},material);assert.ok(await page.evaluate(()=>api.diagnostics(runtime).finite));}
 for(const aggregation of ['vortex','corners','burst','breathe','rain','curve','spiral','direct']){await page.evaluate(a=>{configure({aggregation:a});step(15,{lyricKey:a,text:'听见宇宙的回声',glyphTimings:[],lineStart:0,lineEnd:10,displayTime:4});},aggregation);}
 const polish=await page.evaluate(()=>{
  const saved={...runtime.settings};
  configure({presentation:'line',aggregation:'vortex',glyphStyle:'solid',material:'stardust',colorMode:'custom',gradientMode:'linear',colorA:'#ff0000',colorB:'#00ff00',colorC:'#0000ff',bloomStrength:0,halo:0,laser:0,chromatic:0,environment:0,fresnel:0,movingLight:0,breathingLight:0,pulseLight:0,twinkle:0,brightness:1,opacity:1});
  step(90,{text:'MMMMMM',lyricKey:'color-probe',displayTime:2,glyphTimings:[],playing:true});
  const colors=()=>{
   const gl=runtime.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);
   gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   const b=runtime.lyricBounds,left=[0,0,0],right=[0,0,0];
   const x0=Math.ceil((b.minX/runtime.viewWidth+.5)*w),x1=Math.floor((b.maxX/runtime.viewWidth+.5)*w),y0=Math.ceil((b.minY/900+.5)*h),y1=Math.floor((b.maxY/900+.5)*h);
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const side=x<x0+(x1-x0)*.25?left:x>x1-(x1-x0)*.25?right:null;if(!side)continue;
    for(let channel=0;channel<3;channel++)side[channel]+=pixels[(y*w+x)*4+channel];
   }
   return {left,right};
  };
  const linear=colors();
  configure({gradientMode:'segmented',gradientSegments:2});step(1);const segmented=colors();
  configure({gradientMode:'flow'});step(1);const initial=colors();step(60);const flowing=colors();
  const finalPositions=Array.from(runtime.positions.slice(0,runtime.activeCount*3));
  let stable=true;
  for(const display of ['beat','segments','breathe','segmentBreathe']){
   configure({display,displayThreshold:.99});step(4,{bass:0,beat:0});
   stable&&=finalPositions.every((v,i)=>v===runtime.positions[i])&&Array.from(runtime.enabled).every((enabled,i)=>!enabled||runtime.data[i*4+3]===1);
  }
  configure({...saved,display:'continuous',trail:1,presentation:'line'});step(14,{text:'流星汇聚',lyricKey:'trail-probe',playing:true});
  const streaks=runtime.trailMesh.visible&&runtime.trailData.some((value,index)=>index%2===1&&value>0);
  const liveTrail=Math.floor(runtime.trailData.findIndex((value,index)=>index%12===1&&value>0)/12)*18;
  const connected=liveTrail>=0&&[0,1,2].every(axis=>Math.abs(runtime.trailPositions[liveTrail+3+axis]-runtime.trailPositions[liveTrail+6+axis])<.001);
  step(100);const cleanFinish=!runtime.trailMesh.visible&&runtime.trailData.every((value,index)=>index%2===0||value===0);
  return {linear,segmented,flowChanged:JSON.stringify(initial)!==JSON.stringify(flowing),stable,streaks,connected,cleanFinish};
 });
 assert.ok(polish.linear.left[0]>polish.linear.left[2]*2&&polish.linear.right[2]>polish.linear.right[0]*2,'linear gradient spans the text once, from first to last stop');
 assert.ok(polish.segmented.left[1]<polish.segmented.left[0]*.01&&polish.segmented.right[1]<polish.segmented.right[2]*.01,'two gradient sections use the two endpoint colors');
 for(const key of ['flowChanged','stable','streaks','connected','cleanFinish'])assert.equal(polish[key],true,`gradient/trail/display invariant: ${key}`);
 const lighting=await page.evaluate(()=>{
  const saved={...runtime.settings};
  const dark={presentation:'line',material:'stardust',glyphStyle:'solid',colorMode:'custom',gradientMode:'linear',colorA:'#4499cc',colorB:'#8877bb',colorC:'#bb77aa',brightness:1,opacity:1,bloomStrength:0,halo:0,glowRadius:1,laser:0,chromatic:0,environment:0,fresnel:0,movingLight:0,breathingLight:0,pulseLight:0,twinkle:0,rimLight:0,sweepStrength:0,sparkleStrength:0,volumeLight:0,completionHalo:0,shadow:0};
  configure(dark);step(100,{text:'星光落在你的眼里',lyricKey:'lighting-probe',playing:true});step(1,{playing:false});
  const formed=Array.from(runtime.positions.slice(0,runtime.activeCount*3));
  const pixels=()=>{
   runtime.uniforms.uTime.value=2.375;
   runtime.geometry.setDrawRange(0,runtime.activeCount);
   runtime.renderer.setRenderTarget(null);runtime.renderer.clear();runtime.renderer.render(runtime.scene,runtime.camera);
   const gl=runtime.renderer.getContext(),data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;
  };
  const changed=(a,b)=>{let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);return total>100;};
  const compare=(base,key,a,b)=>{configure({...dark,...base,[key]:a});step(1);const first=pixels();configure({[key]:b});step(1);return changed(first,pixels());};
  const differences={
   glowRadius:compare({halo:1},'glowRadius',0.5,2),
   rimLight:compare({},'rimLight',0,1),rimWidth:compare({rimLight:1},'rimWidth',0.05,1),rimColor:compare({rimLight:1},'rimColor','#ff5544','#5588ff'),
   sweepStrength:compare({sweepSpeed:0},'sweepStrength',0,1),sweepSpeed:compare({sweepStrength:1,sweepWidth:0.3},'sweepSpeed',0,0.18),sweepWidth:compare({sweepStrength:1,sweepSpeed:0},'sweepWidth',0.03,0.8),sweepAngle:compare({sweepStrength:1,sweepSpeed:0,sweepWidth:0.15},'sweepAngle',0,90),
   sparkleStrength:compare({sparkleDensity:1},'sparkleStrength',0,1.5),sparkleSpeed:compare({sparkleStrength:1,sparkleDensity:1},'sparkleSpeed',0.2,3),sparkleDensity:compare({sparkleStrength:1},'sparkleDensity',0,1),
   breathingPeriod:compare({breathingLight:1},'breathingPeriod',1,7),movingLightSpeed:compare({movingLight:1},'movingLightSpeed',0,2),
   volumeLight:compare({},'volumeLight',0,1),volumeRadius:compare({volumeLight:1},'volumeRadius',0.4,1.8),volumeSpeed:compare({volumeLight:1},'volumeSpeed',0,0.7)
  };
  configure({...dark,completionHalo:1});runtime.completedAt=runtime.clock-0.4;
  const haloPixels=()=>{step(1);return pixels();};
  for(const [key,a,b] of [['completionDuration',0.25,2],['completionRadius',0.3,1.8],['completionWidth',0.05,1],['completionRings',1,3]]){
   configure({completionDuration:1.5,completionRadius:1,completionWidth:0.35,completionRings:1,[key]:a});const first=haloPixels();configure({[key]:b});differences[key]=changed(first,haloPixels());
  }
  configure({...dark,shadow:1,shadowBlur:1,shadowOffset:0});step(1);const firstShadow=pixels();
  configure({shadowBlur:2});step(1);differences.shadowBlur=changed(firstShadow,pixels());
  configure({shadowOffset:80});step(1);differences.shadowOffset=changed(firstShadow,pixels());
  const stable=formed.every((value,index)=>value===runtime.positions[index]);
  configure({...dark,trail:1,trailDensity:0.1,trailLength:0.5,trailBrightness:1});step(14,{text:'流星划过',lyricKey:'lighting-tail',playing:true});step(1,{playing:false});
  const trailMetrics=()=>{let count=0,length=0;for(let i=0;i<runtime.activeCount;i++){if(runtime.trailData[i*12+1]<=0)continue;count++;const k=i*18;length+=Math.hypot(runtime.trailPositions[k]-runtime.trailPositions[k+15],runtime.trailPositions[k+1]-runtime.trailPositions[k+16]);}return {count,length};};
  const sparseTrail=trailMetrics();configure({trailDensity:0.8});step(1);const denseTrail=trailMetrics();configure({trailLength:2});step(1);const longTrail=trailMetrics();
  const tailBefore=pixels();configure({trailBrightness:0});step(1);differences.trailBrightness=changed(tailBefore,pixels());
  configure({trailBrightness:1,trailColorMix:1,trailColor:'#ff0000'});step(1);const red=pixels();configure({trailColor:'#0000ff'});step(1);differences.trailColor=changed(red,pixels());
  configure({trailColorMix:0});step(1);differences.trailColorMix=changed(red,pixels());
  configure(saved);step(1,{playing:true});
  return {differences,stable,sparseTrail,denseTrail,longTrail};
 });
 for(const [key,changed] of Object.entries(lighting.differences))assert.equal(changed,true,`${key} must alter GPU output`);
 assert.equal(lighting.stable,true,'lighting controls never displace assembled glyphs');
 assert.ok(lighting.denseTrail.count>lighting.sparseTrail.count*3,'trail density changes the fraction of particles with streaks');
 assert.ok(lighting.longTrail.length>lighting.denseTrail.length*2,'trail length changes the streak extent without moving glyphs');
 for(const preset of ['starlight','aurora','prism','ember','moonlight']){
  await page.evaluate(name=>{api.setSettings(runtime,FeParticleLyricsSettings.change(runtime.settings,'lightingPreset',name));step(100,{text:'让星光落在你的眼里',lyricKey:`lighting-${name}`,playing:true});},preset);
  await page.screenshot({path:path.join(out,`07-lighting-${preset}.png`)});
 }
 await page.evaluate(()=>configure(FeParticleLyricsSettings.defaults));
 await page.evaluate(()=>{configure({presentation:'line',trail:1,aggregation:'spiral',aggregateDuration:1.5});step(28,{text:'粒子循声而来',lyricKey:'trail-preview'});});await page.screenshot({path:path.join(out,'06-meteor-gathering.png')});
 await page.evaluate(()=>{configure({presentation:'line',material:'stardust',glyphStyle:'outline',aggregation:'vortex'});step(100);});await page.screenshot({path:path.join(out,'04-outline.png')});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{api.resize(runtime);configure({glyphStyle:'solid'});step(90,{text:'当所有微小的星光在夜空中汇聚我们终于听见彼此心中的声音',lyricKey:'long',displayTime:2});});
 result=await page.evaluate(()=>api.diagnostics(runtime));assert.ok(result.rows>1);assert.ok(result.finite);await page.screenshot({path:path.join(out,'05-mobile-long.png')});
 await page.evaluate(()=>step(5,{reducedMotion:true}));const still=await page.evaluate(()=>{const a=Array.from(runtime.positions.slice(0,runtime.activeCount*3));step(20);return a.every((v,i)=>v===runtime.positions[i]);});assert.ok(still);
 const resources=await page.evaluate(()=>({...runtime.renderer.info.memory}));await page.evaluate(()=>{for(let i=0;i<30;i++)step(2,{lyricKey:`line-${i}`,text:`星光伴随旋律${i}`});});assert.deepEqual(await page.evaluate(()=>({...runtime.renderer.info.memory})),resources);
 const disposed=await page.evaluate(()=>{api.dispose(runtime);api.dispose(runtime);return api.diagnostics(runtime);});assert.equal(disposed.canvasCount,0);assert.equal(disposed.active,false);
 assert.equal(await page.locator('.particle-lyrics-interaction').count(),0,'disposing removes the input surface');
 assert.deepEqual(errors,[]);
 writeFileSync(path.join(out,'results.json'),JSON.stringify({result,lighting,resources,disposed,errors},null,2));console.log('Particle lyrics WebGL: modes, timing gaps, display isolation, 10 materials, 8 transitions, lighting GPU effects, mobile layout, pause, reduced motion, bounded resources and disposal passed.');
}finally{await browser?.close();server.close();}
