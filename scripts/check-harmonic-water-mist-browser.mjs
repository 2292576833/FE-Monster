import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'output','playwright','harmonic-water-mist');
const require=createRequire(import.meta.url);
let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(module));break;}catch{}
}
assert.ok(chromium,'Playwright must be installed');mkdirSync(output,{recursive:true});
const scripts=['vendor/three.r128.min.js','harmonic-state-settings.js','harmonic-orbital-core.js','harmonic-orbital-atmosphere.js','harmonic-state-runtime.js'];
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#020907}#host{width:1440px;height:900px}canvas{display:block;width:100%;height:100%}</style><div id="host"></div>${scripts.map(src=>`<script src="/web/${src}"></script>`).join('')}`;
const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://local');
  if(url.pathname==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);return;}
  if(!scripts.some(file=>url.pathname==='/web/'+file)){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type','application/javascript');response.end(readFileSync(path.join(root,url.pathname)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const errors=[];
try{
  const fallback=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&fallback?{executablePath:fallback}:{}),
    args:['--use-angle=d3d11','--disable-background-timer-throttling']});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const initial=await page.evaluate(()=>{
    const api=window.FeHarmonicStateRuntime,settings=window.FeHarmonicSettings;
    let target,now=1000;
    const runtime=api.create(document.getElementById('host'),{THREE,pixelRatio:1,
      createRenderer(options){const renderer=new THREE.WebGLRenderer({...options,preserveDrawingBuffer:true});
        const render=renderer.render;
        renderer.render=function(scene,camera){if(this.getRenderTarget()?.texture.name==='HarmonicWaterReflection')target=this.getRenderTarget();
          return render.call(this,scene,camera);};return renderer;}});
    const base={playing:false,reducedMotion:true,zoom:2.35,pixelRatio:1,songKey:'water-fixture',lyricKey:'one',
      lines:{previous:'月光沿着玻璃流淌',current:'听见星光落在海面',next:'海浪回应每次呼吸'},lyricFraction:.3};
    const tick=(changes={},ms=50)=>{now+=ms;api.update(runtime,{...base,...changes,now});return api.diagnostics(runtime);};
    const capture=()=>{const pixels=new Uint8Array(target.width*target.height*4);runtime.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);return pixels;};
    const diff=(a,b)=>{let sum=0,pixels=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);sum+=d;if(d>12)pixels++;}return{sum,pixels};};
    tick();
    window.fixture={api,settings,runtime,tick,capture,diff,getTarget:()=>target};
    return api.diagnostics(runtime);
  });
  assert.equal(initial.atmosphere.mistSource,'pillar-rings');
  assert.ok(initial.atmosphere.water.ready&&initial.atmosphere.water.width>=1400
    &&initial.atmosphere.water.width<=4096&&initial.atmosphere.water.height<=4096,
    'default reflection samples at viewport density, bounded by texture limits rather than the old 512px budget');
  assert.ok(initial.atmosphere.water.width*initial.atmosphere.water.height<=initial.atmosphere.water.pixelBudget);
  assert.ok(initial.atmosphere.water.cropCoverage<.65,'default reflection captures the visible water region rather than the full scene');
  await page.screenshot({path:path.join(output,'default-water-mist.png')});
  const reflection=await page.evaluate(()=>{
    const {api,runtime,tick,capture,diff,settings}=fixture;
    const baseline=capture();
    api.setEffects(runtime,{...settings.defaults,cubeEnabled:false});tick();const noCube=capture();
    api.setEffects(runtime,{...settings.defaults,ringsEnabled:false});tick();const noRing=capture();
    api.setEffects(runtime,settings.defaults);tick();
    const before=api.diagnostics(runtime).atmosphere.water.passes;
    for(let i=0;i<12;i++)tick();
    const paused=api.diagnostics(runtime).atmosphere.water.passes;
    api.setEffects(runtime,{...settings.defaults,cubeColorMode:'custom',cubeColor:'#ff3322'});tick({},0);
    const immediate=api.diagnostics(runtime).atmosphere.water.passes;
    api.setEffects(runtime,{...settings.defaults,waterEnabled:false});tick();
    for(let i=0;i<20;i++)tick({playing:true,reducedMotion:false,bass:.7});
    const disabled=api.diagnostics(runtime).atmosphere.water.passes;
    api.setEffects(runtime,settings.defaults);tick();
    return {cube:diff(baseline,noCube),ring:diff(baseline,noRing),before,paused,immediate,disabled};
  });
  assert.ok(reflection.cube.pixels>40,`actual cube pixels must be reflected: ${JSON.stringify(reflection)}`);
  assert.ok(reflection.ring.pixels>100,`actual rings must appear in the reflection: ${JSON.stringify(reflection)}`);
  assert.equal(reflection.paused,reflection.before,'unchanged paused scene does not repeat reflection passes');
  assert.equal(reflection.immediate,reflection.paused+1,'paused effect edits refresh reflection immediately');
  assert.equal(reflection.disabled,reflection.immediate,'water disabled means zero reflection passes');
  const state=await page.evaluate(()=>{
    const {runtime}=fixture,renderer=runtime.renderer;
    const target=new THREE.WebGLRenderTarget(80,64);renderer.setRenderTarget(target);
    renderer.setViewport(3,4,53,41);renderer.setScissor(7,8,29,27);renderer.setScissorTest(true);
    renderer.setClearColor('#123456',.37);renderer.autoClear=false;
    const snapshot=()=>({target:renderer.getRenderTarget().texture.uuid,viewport:renderer.getViewport(new THREE.Vector4()).toArray(),
      scissor:renderer.getScissor(new THREE.Vector4()).toArray(),scissorTest:renderer.getScissorTest(),
      color:renderer.getClearColor(new THREE.Color()).getHexString(),alpha:renderer.getClearAlpha(),
      autoClear:renderer.autoClear,toneMapping:renderer.toneMapping,encoding:renderer.outputEncoding,
      xr:renderer.xr.enabled,shadow:renderer.shadowMap.autoUpdate});
    const before=snapshot();runtime.atmosphere.invalidateReflection();
    runtime.atmosphere.renderReflection(renderer,runtime.scene,runtime.camera,20000,20000);
    const after=snapshot();
    const render=renderer.render;let didThrow=false;
    renderer.render=()=>{throw new Error('controlled reflection failure');};runtime.atmosphere.invalidateReflection();
    try{runtime.atmosphere.renderReflection(renderer,runtime.scene,runtime.camera,20001,20001);}catch{didThrow=true;}
    finally{renderer.render=render;}
    const afterFailure=snapshot(),waterRestored=runtime.atmosphere.water.visible;
    renderer.setRenderTarget(null);renderer.setViewport(0,0,1440,900);
    renderer.setScissorTest(false);renderer.setClearColor('#020907',1);renderer.autoClear=true;target.dispose();
    return{before,after,afterFailure,didThrow,waterRestored};
  });
  assert.deepEqual(state.after,state.before,'reflection restores all renderer state');
  assert.deepEqual(state.afterFailure,state.before,'renderer state is restored even if reflection render throws');
  assert.ok(state.didThrow&&state.waterRestored,'a failed capture never hides the water permanently');
  const mist=await page.evaluate(()=>{
    const {runtime,api,settings,tick}=fixture;
    api.setEffects(runtime,{...settings.defaults,towerColorMode:'custom',towerColor:'#ff2200',fogColorMode:'custom',fogColor:'#0055ff'});tick();
    const colored=api.diagnostics(runtime),emitters=colored.atmosphere.mistEmitters;
    const valid=runtime.lightTowers.anchors.every((anchor,index)=>{
      const p=new THREE.Vector3(emitters[index*4],emitters[index*4+1],emitters[index*4+2]);
      return Math.abs(p.x-anchor.x)<1e-4&&Math.abs(p.y-(anchor.baseY+anchor.height*.1))<1e-4
        &&Math.abs(p.z-(anchor.z+4))<1e-4&&Math.abs(emitters[index*4+3]-anchor.radius*1.015)<1e-4;
    });
    api.setEffects(runtime,{...settings.defaults,towersEnabled:false});tick();const fallback=api.diagnostics(runtime).atmosphere.mistSource;
    api.setEffects(runtime,settings.defaults);tick();
    return{valid,fallback,towerColor:colored.towers.customColor,fogColor:colored.atmosphere.fogColor};
  });
  assert.ok(mist.valid,'mist emitters coincide with real pillar ring levels and radii');
  assert.equal(mist.fallback,'central-rings');assert.equal(mist.towerColor,'ff2200');assert.equal(mist.fogColor,'0055ff');
  const trajectory=await page.evaluate(()=>{
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(512,384);renderer.setClearColor(0,1);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-12,12,10,-8,.1,100);camera.position.set(0,0,30);camera.lookAt(0,0,0);
    const effect=FeHarmonicOrbitalAtmosphere.create(THREE);scene.add(effect.group);
    effect.update({settings:{fogDensity:1,fogColorMode:'custom',fogColor:'#ffffff',fogLightStrength:1.5,rainEnabled:false,floorLightEnabled:false,waterEnabled:false}});
    effect.mist.geometry.instanceCount=1;
    const emitter=effect.mist.geometry.getAttribute('aEmitter'),seed=effect.mist.geometry.getAttribute('aFog');
    emitter.setXYZW(0,0,8,0,1);emitter.needsUpdate=true;
    const sample=age=>{seed.setXYZW(0,0,age,.5,.2);seed.needsUpdate=true;renderer.render(scene,camera);
      const gl=renderer.getContext(),pixels=new Uint8Array(512*384*4);gl.readPixels(0,0,512,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let weight=0,x=0,y=0,left=512,right=0;
      for(let i=0;i<pixels.length;i+=4){const w=pixels[i]+pixels[i+1]+pixels[i+2];if(w<8)continue;
        const px=(i/4)%512,py=Math.floor(i/4/512);weight+=w;x+=px*w;y+=py*w;left=Math.min(left,px);right=Math.max(right,px);}
      return{weight,x:x/weight,y:y/weight,width:right-left};};
    const early=sample(.12),late=sample(.78);effect.dispose();renderer.dispose();renderer.forceContextLoss();return{early,late};
  });
  assert.ok(trajectory.early.weight>500&&trajectory.late.weight>500,'mist is visibly rendered through both stages');
  assert.ok(trajectory.early.y-trajectory.late.y>140,`mist descends from ring to ground: ${JSON.stringify(trajectory)}`);
  assert.ok(trajectory.late.width>trajectory.early.width*1.4,'settled mist spreads horizontally');
  const cameraEdges=[];
  for(const pose of [{yaw:-5,pitch:-5,zoom:.58},{yaw:5,pitch:5,zoom:.58},
    {yaw:-5,pitch:5,zoom:2.35},{yaw:5,pitch:-5,zoom:2.35},{yaw:0,pitch:0,zoom:2.35}]){
    const result=await page.evaluate(pose=>{
      const {runtime,api,tick,getTarget}=fixture;runtime.atmosphere.invalidateReflection();tick(pose,100);
      const water=api.diagnostics(runtime).atmosphere.water;let coloredPixels=0;
      if(water.ready){const target=getTarget(),p=new Uint8Array(target.width*target.height*4);
        runtime.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,p);
        for(let i=0;i<p.length;i+=4)if(p[i]+p[i+1]+p[i+2]>8)coloredPixels++;}
      return{...pose,water,coloredPixels,error:runtime.renderer.getContext().getError()};
    },pose);
    cameraEdges.push(result);
    await page.screenshot({path:path.join(output,`camera-${cameraEdges.length}.png`)});
  }
  assert.ok(cameraEdges.every(item=>item.error===0&&(!item.water.ready||item.coloredPixels>100)),'visible reflection never becomes an empty target at extreme poses');
  assert.ok(cameraEdges[1].water.height>cameraEdges[4].water.height,'a large view change rebalances vertical resolution with bounded aspect hysteresis');
  assert.equal(cameraEdges[0].water.ready,false,'a camera beneath the water does not display stale above-water capture');
  const clarity=await page.evaluate(()=>{
    const {runtime,api,settings,tick}=fixture;const states=[];
    for(const waterClarity of [0,1,.75]){api.setEffects(runtime,{...settings.defaults,waterClarity});tick({},0);states.push(api.diagnostics(runtime).atmosphere.water);}
    return states;
  });
  assert.ok(clarity[1].width*clarity[1].height>clarity[0].width*clarity[0].height,'clarity controls real sample density independently of reflection strength');
  assert.equal(clarity[0].reflection,clarity[1].reflection);
  const retina=await page.evaluate(()=>{
    const {runtime,api,tick}=fixture;
    const before=api.diagnostics(runtime).atmosphere.water;
    api.resize(runtime,2);tick({pixelRatio:2},0);
    const after=api.diagnostics(runtime).atmosphere.water;
    const error=runtime.renderer.getContext().getError();
    api.resize(runtime,1);tick({pixelRatio:1},0);
    return{before,after,error};
  });
  assert.equal(retina.error,0);
  assert.equal(retina.after.passes,retina.before.passes+1,'paused device-pixel-ratio changes refresh immediately');
  assert.ok(retina.after.width>=retina.before.width*1.9&&retina.after.height>=retina.before.height*1.9,
    'real WebGL reflection follows physical pixel density');
  const cadence=await page.evaluate(()=>{
    const {api,runtime,tick}=fixture,records=[];
    for(const hz of [60,120,144,240])for(const playing of [true,false]){
      const start=api.diagnostics(runtime).atmosphere.water.passes;
      for(let i=0;i<32;i++)tick({playing,reducedMotion:false},1000/hz);
      records.push({hz,playing,captures:api.diagnostics(runtime).atmosphere.water.passes-start});
    }
    return records;
  });
  assert.ok(cadence.every(row=>row.captures===32),'playing and idle reflections follow every high-refresh scene frame');
  const resources=await page.evaluate(()=>{
    const {runtime,api,tick,getTarget}=fixture;
    for(let i=0;i<8;i++)tick({playing:true,reducedMotion:false});
    const initial={...runtime.renderer.info.memory},start=api.diagnostics(runtime).atmosphere.water.passes;
    for(let i=0;i<100;i++)tick({playing:true,reducedMotion:false},16);
    const final={...runtime.renderer.info.memory},passes=api.diagnostics(runtime).atmosphere.water.passes-start;
    const dragStart=api.diagnostics(runtime).atmosphere.water.passes;
    for(let i=0;i<100;i++)tick({playing:false,reducedMotion:true,yaw:i*.01,pitch:i*.002},16);
    const dragPasses=api.diagnostics(runtime).atmosphere.water.passes-dragStart;
    let released=0;getTarget().addEventListener('dispose',()=>released++);
    api.dispose(runtime);api.dispose(runtime);return{initial,final,passes,dragPasses,released};
  });
  assert.deepEqual(resources.final,resources.initial,'long-running reflection owns stable GPU resources');
  assert.equal(resources.passes,100,'every moving scene frame has a fresh reflection');
  assert.equal(resources.dragPasses,100,'camera dragging refreshes the reflection every frame');
  assert.equal(resources.released,1,'reflection target is disposed exactly once');
  assert.deepEqual(errors,[],'no GPU shader or page errors');
  const evidence={initial,reflection,state,mist,trajectory,cameraEdges,clarity,retina,cadence,resources};
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log('PASS harmonic water/mist GPU: real cube/ring reflection, paused/disabled capture policy, renderer state, pillar-ring emission, downward settling, independent colors, bounded resources');
  console.log(JSON.stringify({reflection,mist,trajectory,cadence,retina,resources,output}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
