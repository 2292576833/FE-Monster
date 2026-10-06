import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'output/playwright/particle-idle-controls'),require=createRequire(import.meta.url);
let chromium;for(const module of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(module));break;}catch{}
}
assert.ok(chromium);mkdirSync(output,{recursive:true});
const assets=['particle-lyrics.css','particle-lyrics-shape-editor.js','particle-lyrics-settings.js'];
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/particle-lyrics.css"><style>body{margin:20px;background:#111923;color:#ecf6fa;font-family:Arial,sans-serif}#controls{width:380px}</style><div id="controls"></div><script src="/particle-lyrics-shape-editor.js"></script><script src="/particle-lyrics-settings.js"></script><script>
const settingsApi=FeParticleLyricsSettings;let settings=settingsApi.normalize(JSON.parse(localStorage.getItem('fixture-settings')||'{}'));const changes=[];
function change(key,value){changes.push({key,value});settings=key==='reset'?settingsApi.normalize():settingsApi.change(settings,key,value);localStorage.setItem('fixture-settings',JSON.stringify(settings));settingsApi.syncControls(document.getElementById('controls'),settings);}
settingsApi.renderControls(document.getElementById('controls'),settings,change);
window.fixture={get:()=>settings,changes,change,sync:()=>settingsApi.syncControls(document.getElementById('controls'),settings),api:settingsApi};
</script>`;
const server=createServer((request,response)=>{const pathname=new URL(request.url,'http://local').pathname;
  if(pathname==='/'){response.setHeader('Content-Type','text/html;charset=utf-8');response.end(html);return;}
  if(!assets.includes(pathname.slice(1))){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'application/javascript');response.end(readFileSync(path.join(root,'web',pathname.slice(1))));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[],requests=[];
try{
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&existsSync(edge)?{executablePath:edge}:{})});
  const page=await browser.newPage({viewport:{width:920,height:1000},hasTouch:true});
  page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const normalized=await page.evaluate(()=>{const points=Array.from({length:1300},(_,i)=>[i/1000-.7,i/2000-.4]);const value=fixture.api.normalize({shape:'custom',idleShapeScale:100,customShape:points,idleText:'😀'.repeat(90)+'\n二\n三\n四'});
    const invalid=fixture.api.normalize({customShape:[[.123456789,-.987654321],[NaN,1],['0',0],[1,2,3],[-2,2],null]});
    return{count:value.customShape.length,scale:value.idleShapeScale,chars:Array.from(value.idleText).length,invalid:invalid.customShape,
      schema:fixture.api.schema.length,markers:document.querySelectorAll('[data-particle-setting]').length,unique:new Set([...document.querySelectorAll('[data-particle-setting]')].map(el=>el.dataset.particleSetting)).size};});
  assert.equal(normalized.count,1024);assert.equal(normalized.scale,1.8);assert.equal(normalized.chars,80);
  assert.deepEqual(normalized.invalid,[[.123456789,-.987654321],[-1,1]]);assert.equal(normalized.schema,normalized.markers);assert.equal(normalized.unique,normalized.schema);
  await page.locator('summary').filter({hasText:/^待机$/}).click();
  const idleParticleSize=page.locator('[data-particle-setting="idleParticleSize"]');
  assert.equal(await idleParticleSize.isVisible(),true,'待机粒子大小 appears in the idle settings group');
  assert.equal(await idleParticleSize.inputValue(),'2');
  await idleParticleSize.evaluate(control=>{control.value='4.1';control.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>({idle:fixture.get().idleParticleSize,lyric:fixture.get().particleSize})),{idle:4.1,lyric:2},'editing idle particle size leaves lyric particle size unchanged');
  const idleScale=page.locator('[data-particle-setting="idleScale"]');
  assert.equal(await idleScale.isVisible(),true,'待机整体尺寸 appears in the idle settings group');
  assert.equal(await idleScale.inputValue(),'1');
  await idleScale.evaluate(control=>{control.value='1.65';control.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.deepEqual(await page.evaluate(()=>({idle:fixture.get().idleScale,lyric:fixture.get().textScale})),{idle:1.65,lyric:1},'editing idle overall size leaves lyric text scale unchanged');
  await page.locator('summary').filter({hasText:/^待机色彩$/}).click();
  const idlePalette=page.locator('[data-particle-setting="idlePaletteEnabled"]'),idleMode=page.locator('[data-particle-setting="idleGradientMode"]');
  assert.equal(await idlePalette.isChecked(),false);assert.equal(await idleMode.isVisible(),false,'independent controls are hidden while inheriting lyric colors');
  await idlePalette.check();assert.equal(await idleMode.isVisible(),true);assert.equal(await idleMode.inputValue(),'linear');
  assert.deepEqual(await idleMode.locator('option').evaluateAll(options=>options.map(option=>option.value)),['single','linear','flow','segmented']);
  const idleSpeed=page.locator('[data-particle-setting="idleGradientSpeed"]'),idleSegments=page.locator('[data-particle-setting="idleGradientSegments"]');
  assert.equal(await idleSpeed.isVisible(),false);assert.equal(await idleSegments.isVisible(),false);
  await idleMode.selectOption('flow');assert.equal(await idleSpeed.isVisible(),true);assert.equal(await idleSegments.isVisible(),false);
  await idleSpeed.evaluate(control=>{control.value='0.42';control.dispatchEvent(new Event('input',{bubbles:true}));});
  const originalLyricColors=await page.evaluate(()=>Object.fromEntries(['colorA','colorB','colorC','animationColors'].map(key=>[key,fixture.get()[key]])));
  for(const [key,value]of [['idleColorA','#ed1631'],['idleColorB','#44bd87'],['idleColorC','#276bfe']]){
    await page.locator(`[data-particle-setting="${key}"]`).evaluate((control,value)=>{control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));},value);
  }
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(['colorA','colorB','colorC','animationColors'].map(key=>[key,fixture.get()[key]]))),originalLyricColors,'idle color inputs never overwrite lyric or aggregation palettes');
  await idleMode.selectOption('segmented');assert.equal(await idleSpeed.isVisible(),false);assert.equal(await idleSegments.isVisible(),true);
  await idleSegments.evaluate(control=>{control.value='5';control.dispatchEvent(new Event('input',{bubbles:true}));});
  await idlePalette.uncheck();assert.equal(await idleMode.isVisible(),false);assert.equal(await idleSegments.isVisible(),false);
  await idlePalette.check();assert.equal(await idleMode.inputValue(),'segmented');assert.equal(await idleSegments.inputValue(),'5','re-enabling retains custom gradient settings');
  const idleColorSettings=await page.evaluate(()=>Object.fromEntries(['idlePaletteEnabled','idleColorMode','idleColorA','idleColorB','idleColorC','idleGradientMode','idleGradientSpeed','idleGradientSegments'].map(key=>[key,fixture.get()[key]])));
  await page.reload();assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,fixture.get()[key]])),Object.keys(idleColorSettings)),idleColorSettings);
  await page.locator('[data-particle-setting="shape"]').selectOption('text');
  const text=page.locator('[data-particle-setting="idleText"]');await text.focus();
  const ime=await page.evaluate(()=>{const control=document.querySelector('[data-particle-setting="idleText"]'),before=fixture.changes.length;
    control.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));control.value='你好';control.setSelectionRange(1,1);
    control.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'你好'}));fixture.sync();
    const during={value:control.value,changes:fixture.changes.length-before};
    control.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你好'}));control.dispatchEvent(new InputEvent('input',{bubbles:true,data:'你好'}));
    control.setSelectionRange(1,1);fixture.change('brightness',1.4);
    return{during,text:fixture.get().idleText,commits:fixture.changes.filter(e=>e.key==='idleText').length,caret:control.selectionStart};});
  assert.deepEqual(ime.during,{value:'你好',changes:0});assert.equal(ime.text,'你好');assert.equal(ime.commits,1);assert.equal(ime.caret,1);
  await text.fill('第一行\n第二行\n第三行\n第四行');assert.equal(await text.inputValue(),'第一行\n第二行\n第三行');
  await text.fill('😀'.repeat(85));assert.equal(Array.from(await text.inputValue()).length,80);
  await page.locator('[data-particle-setting="shape"]').selectOption('circle');assert.equal(await text.isVisible(),false);
  assert.equal(await page.locator('[data-particle-setting="idleShapeScale"]').isVisible(),false);
  await page.locator('[data-particle-setting="shape"]').selectOption('custom');
  const canvas=page.locator('.particle-shape-canvas');await canvas.scrollIntoViewIfNeeded();let box=await canvas.boundingBox();
  const start=await page.evaluate(()=>fixture.changes.length);await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:18});
  assert.equal(await page.evaluate(()=>fixture.changes.length),start,'drawing never persists on pointermove');
  await page.mouse.up();const drawn=await page.evaluate(()=>({points:fixture.get().customShape,changes:fixture.changes.length,shape:fixture.get().shape}));
  assert.equal(drawn.changes,start+1);assert.equal(drawn.shape,'custom');assert.ok(drawn.points.length>40&&drawn.points.length<=1024);
  const cdp=await page.context().newCDPSession(page);box=await canvas.boundingBox();const touchBefore=await page.evaluate(()=>fixture.changes.length);
  for(const [type,x,y]of[['touchStart',.25,.65],['touchMove',.5,.25],['touchMove',.8,.6],['touchEnd',0,0]]){
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:box.x+box.width*x,y:box.y+box.height*y}],modifiers:0});}
  assert.equal(await page.evaluate(()=>fixture.changes.length),touchBefore+1,'touch drawing commits one completed stroke');
  await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),drawn.points);
  await page.getByRole('button',{name:'清空',exact:true}).click();assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),[]);
  await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),drawn.points);
  const generated=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,128,64);const blank=canvas.toDataURL('image/png');ctx.fillStyle='black';ctx.fillRect(16,16,96,32);
    const small={blank,png:canvas.toDataURL('image/png'),jpeg:canvas.toDataURL('image/jpeg'),webp:canvas.toDataURL('image/webp')};
    canvas.width=2048;canvas.height=1024;ctx.fillStyle='white';ctx.fillRect(0,0,2048,1024);ctx.fillStyle='black';ctx.fillRect(256,256,1536,512);
    small.large=canvas.toDataURL('image/png');window.sampleReads=[];const getImageData=CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){sampleReads.push({width:args[2],height:args[3]});return getImageData.apply(this,args);};
    return small;});
  const file=page.locator('.particle-shape-tools input[type="file"]'),status=page.locator('.particle-shape-status');
  const upload=async(kind,data=generated[kind])=>{await file.setInputFiles({name:`shape.${kind}`,mimeType:`image/${kind}`,buffer:Buffer.from(data.split(',')[1],'base64')});
    await page.waitForFunction(()=>!document.querySelector('.particle-shape-tools button').disabled);};
  await page.getByRole('combobox',{name:'图片提取方式'}).selectOption('outline');await upload('png');
  const outlined=await page.evaluate(()=>fixture.get().customShape);assert.ok(outlined.length>40&&outlined.length<1024);
  const spanY=Math.max(...outlined.map(p=>p[1]))-Math.min(...outlined.map(p=>p[1]));assert.ok(spanY<.8&&spanY>.5,'wide image keeps its aspect ratio');
  await page.getByRole('combobox',{name:'图片提取方式'}).selectOption('solid');await upload('png');
  const solid=await page.evaluate(()=>fixture.get().customShape);assert.equal(solid.length,1024);assert.ok(solid.length>outlined.length);
  assert.ok(new Set(solid.map(point=>point[0])).size>80,'dense image samples do not collapse into periodic vertical stripes');
  await upload('png',generated.large);const sampleReads=await page.evaluate(()=>window.sampleReads);
  assert.ok(sampleReads.length&&sampleReads.every(sample=>sample.width<=128&&sample.height<=128),'large images only read bounded 128px raster data');
  await upload('jpeg');await upload('webp');const retained=await page.evaluate(()=>fixture.get().customShape);
  await upload('png',generated.blank);assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),retained);assert.match(await status.textContent(),/未找到清晰图案/);
  await file.setInputFiles({name:'unsafe.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="window.UNSAFE=true"></svg>')});
  await page.waitForFunction(()=>!document.querySelector('.particle-shape-tools button').disabled);
  assert.equal(await page.evaluate(()=>window.UNSAFE),undefined);assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),retained);
  await page.evaluate(()=>{const decode=window.createImageBitmap;window.decodeGate={};window.decodeGate.promise=new Promise(resolve=>window.decodeGate.resolve=resolve);
    window.createImageBitmap=async(...args)=>{await window.decodeGate.promise;return decode(...args);};});
  await file.setInputFiles({name:'delayed.png',mimeType:'image/png',buffer:Buffer.from(generated.png.split(',')[1],'base64')});
  await page.locator('[data-particle-setting="shape"]').selectOption('text');await page.evaluate(()=>decodeGate.resolve());
  await page.waitForFunction(()=>!document.querySelector('.particle-shape-tools button').disabled);
  assert.equal(await page.evaluate(()=>fixture.get().shape),'text','late image import cannot switch the user back to custom mode');
  await page.locator('[data-particle-setting="shape"]').selectOption('custom');
  await page.evaluate(()=>fixture.change('customShape',[]));assert.equal(await page.getByRole('button',{name:'撤销',exact:true}).isEnabled(),false,'external replacement clears old undo history');
  await page.evaluate(points=>fixture.change('customShape',points),retained);
  const serialized=await page.evaluate(()=>localStorage.getItem('fixture-settings'));assert.ok(serialized.length<65000&&!serialized.includes('data:image'));
  const persisted=JSON.parse(serialized);await page.reload();assert.deepEqual(await page.evaluate(()=>fixture.get().customShape),persisted.customShape);
  await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'custom-editor.png')});
  assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(`http://127.0.0.1:${server.address().port}/`)),'image import stays local');
  const evidence={normalized,idleColorSettings,ime,drawnPoints:drawn.points.length,outlinePoints:outlined.length,solidPoints:solid.length,sampleReads,persistedBytes:serialized.length,requests};
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log('PASS particle custom idle controls: independent color/gradient controls and persistence, Unicode/IME/caret, conditional controls, mouse/touch stroke commits, undo/clear, PNG/JPEG/WebP aspect-preserving bounded sampling, blank/unsafe/stale imports, persistence');
  console.log(JSON.stringify(evidence));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
