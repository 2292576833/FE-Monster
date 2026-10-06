import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'output/playwright/harmonic-water-hd');
const args=process.argv.slice(2),baselineIndex=args.indexOf('--baseline');
const baseline=path.resolve(baselineIndex>=0?args[baselineIndex+1]:path.join(output,'atmosphere-before.js'));
assert.ok(existsSync(baseline),'Save the before-version atmosphere module and pass --baseline <path> for A/B evidence');
const oldSource=readFileSync(baseline,'utf8'),require=createRequire(import.meta.url);
let chromium;for(const mod of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(mod));break;}catch{}
}
assert.ok(chromium);mkdirSync(output,{recursive:true});
const modules=['vendor/three.r128.min.js','harmonic-state-settings.js','harmonic-orbital-core.js','harmonic-orbital-atmosphere.js','harmonic-state-runtime.js'];
const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://local'),variant=url.searchParams.get('variant')||'after';
  if(url.pathname==='/'){
    response.setHeader('Content-Type','text/html;charset=utf-8');response.end(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#020907}#host{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style><div id="host"></div>${modules.map(file=>`<script src="/web/${file}?variant=${variant}"></script>`).join('')}`);return;
  }
  if(!modules.some(file=>'/web/'+file===url.pathname)){response.writeHead(404);response.end();return;}
  let content=readFileSync(path.join(root,url.pathname),'utf8');
  if(url.pathname.endsWith('/harmonic-orbital-atmosphere.js')){
    if(variant==='before')content=oldSource;
    if(variant==='reference'){
      const allocation='const width=captureWidth,height=captureHeight;';
      assert.ok(content.includes(allocation),'reference overrides only render-target sampling, not water appearance');
      content=content.replace(allocation,'const width=captureWidth*2,height=captureHeight*2;');
    }
  }
  response.setHeader('Content-Type','application/javascript');response.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
try{
  const fallback=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&fallback?{executablePath:fallback}:{}),args:['--use-angle=d3d11']});
  const pages={},pixels={},results={};
  for(const variant of ['before','after','reference']){
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});pages[variant]=page;
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}`);
    results[variant]=await page.evaluate(async()=>{
      await document.fonts.ready;let target,reflectionCalls=0,reflectionTriangles=0;
      const runtime=FeHarmonicStateRuntime.create(document.getElementById('host'),{THREE,pixelRatio:1,
        createRenderer(options){const renderer=new THREE.WebGLRenderer({...options,preserveDrawingBuffer:true}),render=renderer.render;
          renderer.render=function(scene,camera){const t=this.getRenderTarget();const result=render.call(this,scene,camera);
            if(t?.texture.name==='HarmonicWaterReflection'){target=t;reflectionCalls=this.info.render.calls;reflectionTriangles=this.info.render.triangles;}return result;};return renderer;}});
      const frame={now:1000,playing:false,reducedMotion:true,pixelRatio:1,zoom:2.35,songKey:'quality',lyricKey:'one',
        lines:{previous:'月光沿着玻璃流淌',current:'听见星光落在海面',next:'海浪回应每次呼吸'}};
      FeHarmonicStateRuntime.update(runtime,frame);runtime.renderer.getContext().finish();
      window.qualityFixture={runtime,frame,getTarget:()=>target,measure:()=>({calls:reflectionCalls,triangles:reflectionTriangles})};
      return{water:runtime.atmosphere.diagnostics().water,calls:reflectionCalls,triangles:reflectionTriangles};
    });
    pixels[variant]=await page.evaluate(()=>{const gl=qualityFixture.runtime.renderer.getContext(),p=new Uint8Array(1440*240*4);gl.readPixels(0,0,1440,240,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p);});
    await page.screenshot({path:path.join(output,`${variant}-full.png`)});
    await page.screenshot({path:path.join(output,`${variant}-reflection.png`),clip:{x:180,y:640,width:1100,height:250}});
  }
  const samples={before:[],after:[]};
  for(let round=0;round<4;round++)for(const variant of round%2?['after','before']:['before','after']){
    samples[variant].push(...await pages[variant].evaluate(()=>{
      const {runtime}=qualityFixture,renderer=runtime.renderer,gl=renderer.getContext(),durations=[];
      for(let i=0;i<24;i++){
        gl.finish();runtime.atmosphere.invalidateReflection();const start=performance.now();
        runtime.atmosphere.renderReflection(renderer,runtime.scene,runtime.camera,2000+i*50,i);gl.finish();
        if(i>=4)durations.push(performance.now()-start);
      }return durations;
    }));
  }
  const error=p=>{let sum=0,squared=0,n=0;for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++){
    const d=p[i+c]-pixels.reference[i+c];sum+=Math.abs(d);squared+=d*d;n++;}return{mae:sum/n,rmse:Math.sqrt(squared/n)};};
  for(const variant of ['before','after']){
    const sorted=samples[variant].sort((a,b)=>a-b);
    results[variant].gpuSynchronizedMs={median:sorted[Math.floor(sorted.length*.5)],p90:sorted[Math.floor(sorted.length*.9)],samples:sorted.length};
    results[variant].errorAgainstFullResolution=error(pixels[variant]);
    results[variant].pixels=results[variant].water.width*results[variant].water.height;
  }
  assert.ok(results.after.water.width>=1400,'default capture preserves native horizontal detail');
  assert.ok(results.after.pixels>results.before.pixels*3,'allocate actual additional detail, not just sharpening');
  assert.ok(results.after.errorAgainstFullResolution.rmse<results.before.errorAgainstFullResolution.rmse*.8,
    'native-density reflection is closer to the supersampled reference');
  const edges=await pages.after.evaluate(()=>{
    const {runtime,frame}=qualityFixture,records=[];
    for(const [yaw,pitch,zoom] of [[-5,-5,.58],[5,5,.58],[-5,5,2.35],[5,-5,2.35],[0,0,2.35]]){
      runtime.atmosphere.invalidateReflection();FeHarmonicStateRuntime.update(runtime,{...frame,yaw,pitch,zoom,now:20000+records.length*100});
      records.push({yaw,pitch,zoom,water:runtime.atmosphere.diagnostics().water,glError:runtime.renderer.getContext().getError()});
    }return records;
  });
  await pages.after.setViewportSize({width:480,height:900});
  const portrait=await pages.after.evaluate(()=>{const {runtime,frame}=qualityFixture;FeHarmonicStateRuntime.resize(runtime,1);runtime.atmosphere.invalidateReflection();
    FeHarmonicStateRuntime.update(runtime,{...frame,now:22000});return{water:runtime.atmosphere.diagnostics().water,error:runtime.renderer.getContext().getError()};});
  await pages.after.screenshot({path:path.join(output,'after-portrait.png')});
  assert.ok(edges.every(e=>e.glError===0));assert.equal(portrait.error,0);assert.ok(portrait.water.ready);
  assert.deepEqual(errors,[]);const evidence={results,edges,portrait};writeFileSync(path.join(output,'quality-evidence.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
  console.log('PASS native-density reflection: A/B screenshots, synchronized GPU timing, supersampled reference error, camera/portrait coverage');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
