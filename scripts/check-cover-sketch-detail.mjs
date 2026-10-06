import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'output/cover-sketch-detail');mkdirSync(out,{recursive:true});
const require=createRequire(import.meta.url);
let chromium;
for(const module of ['playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]){try{({chromium}=require(module));break;}catch{}}
assert(chromium);
const executablePath=!existsSync(chromium.executablePath())?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1250,height:800}});
const mountain=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="sky" x2=".8" y2="1"><stop stop-color="#102d2a"/><stop offset="1" stop-color="#d0b77b"/></linearGradient></defs><rect width="512" height="512" fill="url(#sky)"/><circle cx="350" cy="136" r="80" fill="#f3ddbc"/><path d="M0 452 96 214 216 402 318 264 512 470V512H0Z" fill="#173c30"/><path d="M58 512 272 298 396 512" fill="#7e8170"/><path d="M0 464Q160 362 256 434T512 386" stroke="#ffe8b7" stroke-width="6" fill="none"/></svg>`;
const detail=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#e6dcc4"/><path d="M120 332V170Q124 64 254 61Q388 64 393 184L365 337 257 402Z" fill="#233c45"/><path d="M155 177Q201 149 236 182M273 182Q322 147 365 177" fill="none" stroke="#d7ba80" stroke-width="6"/><ellipse cx="200" cy="217" rx="31" ry="17" fill="#f6ede0"/><ellipse cx="319" cy="217" rx="31" ry="17" fill="#f6ede0"/><circle cx="200" cy="217" r="9" fill="#b04b37"/><circle cx="319" cy="217" r="9" fill="#b04b37"/><path d="M255 224 239 286 270 287M211 326Q253 345 300 326" fill="none" stroke="#e6dcc4" stroke-width="5"/><path d="M72 420H440M72 429H440" stroke="#233c45" stroke-width="2"/><text x="73" y="471" fill="#233c45" font-family="monospace" font-size="28" letter-spacing="2">COVER / 2026</text></svg>`;
const fixtures=[['mountain',mountain],['detail',detail]].map(([name,svg])=>[name,'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')]);
const skippedReferences=[];
const skipLocalReferences=process.env.COVER_SKETCH_SKIP_LOCAL_REFERENCES==='1';
// User-provided video frames are optional; the regression still runs on a clean checkout.
for(const [name,file] of [['reference','reference-0.png'],['playing','playing-2.png']]){
 const reference=path.join(root,'output/cover-reference',file);
 if(!skipLocalReferences&&existsSync(reference))fixtures.push([name,'data:image/png;base64,'+readFileSync(reference).toString('base64')]);
 else skippedReferences.push({name,file,reason:skipLocalReferences?'COVER_SKETCH_SKIP_LOCAL_REFERENCES=1':'local reference file unavailable'});
}
if(skippedReferences.length)console.log('Skipped optional local references:',JSON.stringify(skippedReferences));
try{
 await page.setContent('<body style="margin:0;background:#14171b;display:flex;gap:16px;color:white;font:15px sans-serif"><div>原图<canvas id="original" width="600" height="720"></canvas></div><div>素描 · 局部笔触<canvas id="sketch" width="600" height="720"></canvas></div></body>');
 await page.addScriptTag({content:readFileSync(path.join(root,'web/cover-depth-light.js'),'utf8')});
 await page.evaluate(()=>{
  window.__automaticDepthBuilds=[];
  const build=FeCoverDepthLight.buildField;
  FeCoverDepthLight.buildField=(pixels,width,height)=>{
   const field=build(pixels,width,height);let hash=2166136261;
   for(let i=0;i<field.heights.length;i+=31)hash=Math.imul(hash^Math.round(field.heights[i]*1000000),16777619);
   window.__automaticDepthBuilds.push({width,height,heightHash:hash>>>0});
   return field;
  };
 });
 await page.addScriptTag({content:readFileSync(path.join(root,'web/cover-sketch-runtime.js'),'utf8')});
 const results={skippedReferences};
 for(const [name,url] of fixtures){
  results[name]=await page.evaluate(async({url})=>{
   const image=new Image();image.src=url;await image.decode();
   window.renderer?.destroy();
   const original=document.getElementById('original');const sketch=document.getElementById('sketch');
   const ctx=original.getContext('2d');ctx.clearRect(0,0,600,720);
   const size=600*.76*1.28;const scale=size/Math.max(image.width,image.height);ctx.drawImage(image,300-image.width*scale/2,720*.48-image.height*scale/2,image.width*scale,image.height*scale);
   window.renderer=FeCoverSketch.create(sketch);
   const frame={width:600,height:720,dpr:1,image,imageSignature:url.slice(-25),settings:{depthEnabled:false,sketchFlowAmplitude:0},now:0,deltaMs:16};
   window.frame=frame;
   const start=performance.now();renderer.render(frame);const buildMs=performance.now()-start;
   const timings=[];for(let i=0;i<10;i++){const start=performance.now();renderer.render({...frame,now:i*16,settings:{depthEnabled:false,sketchFlowAmplitude:.65}});timings.push(performance.now()-start);}
   renderer.render(frame);
   const src=ctx.getImageData(0,0,600,720).data;const dst=sketch.getContext('2d').getImageData(0,0,600,720).data;
   let abs=0,count=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
   for(let i=0;i<src.length;i+=4){if(src[i+3]<250)continue; const a=(src[i]+src[i+1]+src[i+2])/3;const b=(dst[i]+dst[i+1]+dst[i+2])/3*dst[i+3]/255;abs+=Math.abs(a-b);count++;sx+=a;sy+=b;sxx+=a*a;syy+=b*b;sxy+=a*b;}
   let edges=0,retained=0;
   const luma=(data,index)=>(data[index]+data[index+1]+data[index+2])/3*data[index+3]/255;
   for(let y=2;y<718;y++){for(let x=2;x<598;x++){const i=(y*600+x)*4;if(src[i-4+3]<250||src[i+4+3]<250||src[i-2400+3]<250||src[i+2400+3]<250)continue;const gx=luma(src,i+4)-luma(src,i-4),gy=luma(src,i+2400)-luma(src,i-2400),magnitude=Math.hypot(gx,gy);if(magnitude<25)continue;const dx=luma(dst,i+4)-luma(dst,i-4),dy=luma(dst,i+2400)-luma(dst,i-2400);edges++;if((dx*gx+dy*gy)/magnitude>magnitude*.35)retained++;}}
   let blockCount=0,bx=0,by=0,bxx=0,byy=0,bxy=0;
   for(let y=0;y<720;y+=12){for(let x=0;x<600;x+=12){let sa=0,sb=0,n=0;for(let yy=y;yy<Math.min(y+12,720);yy++){for(let xx=x;xx<Math.min(x+12,600);xx++){const i=(yy*600+xx)*4;if(src[i+3]<250)continue;sa+=luma(src,i);sb+=luma(dst,i);n++;}}if(n<50)continue;const a=sa/n,b=sb/n;blockCount++;bx+=a;by+=b;bxx+=a*a;byy+=b*b;bxy+=a*b;}}
   const blockLumaCorrelation=(blockCount*bxy-bx*by)/Math.sqrt((blockCount*bxx-bx*bx)*(blockCount*byy-by*by));
   return {stats:renderer.getStats(),automaticDepth:window.__automaticDepthBuilds.at(-1),buildMs,frameMs:timings.reduce((a,b)=>a+b)/timings.length,meanAbsoluteLumaError:abs/count,lumaCorrelation:(count*sxy-sx*sy)/Math.sqrt((count*sxx-sx*sx)*(count*syy-sy*sy)),blockLumaCorrelation,edgeRetention:retained/edges};
  },{url});
  await page.screenshot({path:path.join(out,`${name}-comparison.png`)});
  // Sparse layers intentionally leave paper/background visible. Assess coherent
  // image structure after local integration, not a dense photo-like pixel match.
  assert(results[name].blockLumaCorrelation>.9,`${name}: interleaved sparse layers retain the cover's forms and tonal structure`);
  assert.equal(results[name].stats.depthImageStatus,'generated',`${name}: depth is generated from the cover without an import`);
  assert.equal(results[name].stats.depthSampleBuilds,1,`${name}: animation reuses automatic cover depth`);
  results[name].layering=await page.evaluate(()=>{
   document.getElementById('layerPreview')?.remove();
   const section=document.createElement('section');section.id='layerPreview';section.style.cssText='position:absolute;top:800px;left:0;width:1240px;display:flex;gap:12px;background:#14171b;padding:12px 0';document.body.append(section);
   const layerCanvases=[];const directions=[];
   for(let i=0;i<8;i++){
    const canvas=document.createElement('canvas');renderer.drawLayerPreview(i,canvas);layerCanvases.push(canvas);
    const rgba=canvas.getContext('2d').getImageData(0,0,512,512).data;
    let xx=0,yy=0,xy=0;for(let y=1;y<511;y++){for(let x=1;x<511;x++){const index=(y*512+x)*4+3;const gx=rgba[index+4]-rgba[index-4],gy=rgba[index+2048]-rgba[index-2048];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}}
    directions.push(.5*Math.atan2(2*xy,xx-yy));
   }
   const coverage={};
   for(const [label,count] of [['原封面',0],['单层 · 大面积留白',1],['4 层 · 交错叠加',4],['8 层 · 完整封面',8]]){
    const panel=document.createElement('div');panel.style.width='300px';panel.append(document.createTextNode(label));const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;canvas.style.cssText='display:block;width:300px;height:300px;margin-top:12px';panel.append(canvas);section.append(panel);const ctx=canvas.getContext('2d');
    if(!count){const image=frame.image;const scale=512/Math.max(image.width,image.height);ctx.drawImage(image,(512-image.width*scale)/2,(512-image.height*scale)/2,image.width*scale,image.height*scale);}
    else{for(let i=0;i<count;i++)ctx.drawImage(layerCanvases[i],0,0);const rgba=ctx.getImageData(0,0,512,512).data;let alpha=0;for(let i=3;i<rgba.length;i+=4)alpha+=rgba[i]/255;coverage[count]=alpha/(512*512);}
   }
   return {coverage,directions,layers:renderer.getStats({includeLayerCoverage:true}).layerDetails};
  });
  const layering=results[name].layering;
  assert(layering.layers.every(layer=>layer.alphaCoverage<.18&&layer.transparentFraction>.7),`${name}: every individual layer must leave substantial transparent space`);
  assert(layering.coverage[4]>layering.coverage[1]+.1&&layering.coverage[8]>layering.coverage[4]+.1,`${name}: image coverage must accumulate across independent layers`);
  assert(new Set(layering.directions.map(angle=>Math.round(angle/.3))).size>=5,`${name}: actual raster strokes must have distinct layer directions`);
  await page.locator('#layerPreview').screenshot({path:path.join(out,`${name}-layers-1-4-8.png`)});
  await page.evaluate(()=>document.getElementById('layerPreview').remove());
 }
 assert.equal(new Set(fixtures.map(([name])=>results[name].automaticDepth.heightHash)).size,fixtures.length,'Distinct covers produce distinct automatic depth fields');
 results.lighting=await page.evaluate(()=>{
  const hash=()=>{const data=document.getElementById('sketch').getContext('2d').getImageData(0,0,600,720).data;let value=2166136261;for(let i=0;i<data.length;i+=4)value=Math.imul(value^data[i],16777619);return value>>>0;};
  const settings={depthEnabled:true,sketchFlowSpeed:0,sketchFlowAmplitude:0,depthLightSpeed:1,depthLightStrength:1.3,depthAmbient:.3,depthHighlight:.8};
  const base={...frame,settings,lightTime:0};renderer.render(base);const first=hash();
  const textureBuilds=renderer.getStats().textureBuilds;
  const initialDepthBuilds=renderer.getStats().depthSampleBuilds;
  const initialFieldHash=window.__automaticDepthBuilds.at(-1).heightHash;
  const start=performance.now();renderer.render({...base,lightTime:12});const frameMs=performance.now()-start;const moved=hash();
  renderer.render({...base,settings:{...settings,depthLightSpeed:0},lightTime:25});const stationary=hash();const builds=renderer.getStats().lightingBuilds;
  renderer.render({...base,settings:{...settings,depthLightSpeed:0},lightTime:26});const stationaryLater=hash();const cached=renderer.getStats().lightingBuilds===builds;
  const alternate=document.createElement('canvas');alternate.width=256;alternate.height=256;const m=alternate.getContext('2d');const gradient=m.createRadialGradient(128,128,0,128,128,160);gradient.addColorStop(0,'white');gradient.addColorStop(1,'black');m.fillStyle=gradient;m.fillRect(0,0,256,256);
  renderer.render({...base,yaw:.2,pitch:-.1,settings:{...settings,depthStrength:2,depthContrast:1.7,depthLightAngle:90,depthInvert:true}});
  renderer.render({...base,depthImage:alternate,depthImageSignature:'ignored-legacy-import',lightTime:0});const legacy=hash();
  const parameterDepthBuilds=renderer.getStats().depthSampleBuilds;
  const afterTextureBuilds=renderer.getStats().textureBuilds;
  renderer.render({...base,image:alternate,imageSignature:'alternate-cover-auto-depth'});
  const changedDepthBuilds=renderer.getStats().depthSampleBuilds;
  const changedFieldHash=window.__automaticDepthBuilds.at(-1).heightHash;
  renderer.render(base);
  window.litFrame=base;
  return {first,moved,stationary,stationaryLater,legacy,cached,frameMs,textureBuilds,afterTextureBuilds,initialDepthBuilds,parameterDepthBuilds,changedDepthBuilds,initialFieldHash,changedFieldHash,stats:renderer.getStats()};
 });
 assert.notEqual(results.lighting.first,results.lighting.moved,'Moving light must change the line texture with geometry flow disabled');
 assert.equal(results.lighting.stationary,results.lighting.stationaryLater,'Zero light speed must produce stationary illumination');
 assert(results.lighting.cached,'Stationary light reuses its shaded pencil texture');
 assert.equal(results.lighting.textureBuilds,results.lighting.afterTextureBuilds,'Depth and lighting parameters preserve the original pencil reconstruction');
 assert.equal(results.lighting.stats.depthImageStatus,'generated');
 assert.equal(results.lighting.legacy,results.lighting.first,'Legacy imported depth fields have no effect on the renderer');
 assert.equal(results.lighting.parameterDepthBuilds,results.lighting.initialDepthBuilds,'Depth, light, camera and legacy import changes reuse the generated field');
 assert.equal(results.lighting.changedDepthBuilds,results.lighting.initialDepthBuilds+1,'A new cover automatically generates a fresh depth field');
 assert.notEqual(results.lighting.changedFieldHash,results.lighting.initialFieldHash,'Generated depth follows the new cover');
 const lightingFixture=fixtures.at(-1)[0];
 results.lighting.fixture=lightingFixture;
 await page.screenshot({path:path.join(out,`${lightingFixture}-automatic-depth.png`)});
 await page.evaluate(()=>renderer.render({...litFrame,lightTime:0}));
 await page.screenshot({path:path.join(out,`${lightingFixture}-light-left.png`)});
 await page.evaluate(()=>renderer.render({...litFrame,lightTime:12}));
 await page.screenshot({path:path.join(out,`${lightingFixture}-light-right.png`)});
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({skippedReferences,fixtures:Object.fromEntries(fixtures.map(([name])=>[name,{layers:results[name].stats.layers,blockLumaCorrelation:results[name].blockLumaCorrelation,coverage:results[name].layering.coverage,frameMs:results[name].frameMs}])),lighting:{fixture:results.lighting.fixture,cached:results.lighting.cached,frameMs:results.lighting.frameMs}},null,2));
}finally{await browser.close();}
