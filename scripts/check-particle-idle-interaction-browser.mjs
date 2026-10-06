import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'output/playwright/particle-idle-interaction');
mkdirSync(output,{recursive:true});
const require=createRequire(import.meta.url);let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(candidate));break;}catch{}
}
assert.ok(chromium,'Playwright is required');
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())&&edge?{executablePath:edge}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
const errors=[],evidence={};
try{
  const page=await browser.newPage({viewport:{width:1080,height:720},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050b12}#outside{position:absolute;left:8px;top:8px;width:120px;height:40px}</style><button id="outside">外部操作</button><div class="particle-lyrics-scene"><div id="host" class="particle-lyrics-core"></div></div>');
  await page.addStyleTag({content:readFileSync(path.join(root,'web/particle-lyrics.css'),'utf8')});
  for(const file of ['vendor/three.r128.min.js','particle-lyrics-settings.js','particle-lyrics-runtime.js'])await page.addScriptTag({content:readFileSync(path.join(root,'web',file),'utf8')});
  await page.evaluate(()=>{
    const api=FeParticleLyricsRuntime,commits=[];let invalidations=0;
    const runtime=api.create(document.getElementById('host'),{pixelRatio:1,onInvalidate:()=>invalidations++,onTransformChange:transform=>commits.push(transform),settings:{bloomStrength:0,idle:'float',floatAmount:5,scatter:1,depth:0,particleSize:2.2,material:'stardust',twinkle:0,grain:0,halo:0,laser:0,chromatic:0,fresnel:0,rimLight:0,sweepStrength:0,movingLight:0,sparkleStrength:0,breathingLight:0,pulseLight:0,trail:0,volumeLight:0,shadow:0,environment:0,completionHalo:0},createRenderer:options=>new THREE.WebGLRenderer({...options,preserveDrawingBuffer:true})});
    const frame={now:1000,playing:false,hasLyric:false,text:'',lyricKey:'idle',audioTime:0,lineStart:0,lineEnd:6,bass:0,beat:0,reducedMotion:true};
    const gl=runtime.renderer.getContext(),samples=new Map();let outsideClicks=0;
    document.getElementById('outside').addEventListener('click',()=>outsideClicks++);
    function step(count=1,changes={}){Object.assign(frame,changes);for(let i=0;i<count;i++){frame.now+=1000/60;api.update(runtime,frame);}return api.diagnostics(runtime);}
    function configure(changes){api.setSettings(runtime,{...runtime.settings,...changes});return step();}
    function snapshot(){return {transform:Object.fromEntries(['positionX','positionY','rotationX','rotationY','gestureScale'].map(key=>[key,runtime.settings[key]])),commits:commits.length,invalidations,clock:runtime.clock,count:runtime.activeCount,colors:['A','B','C'].map(key=>runtime.uniforms[`uColor${key}`].value.getHexString()),gradient:runtime.uniforms.uGradient.value,min:runtime.uniforms.uTextMin.value,width:runtime.uniforms.uTextWidth.value,bounds:{...runtime.idleBounds}};}
    function pixels(name){
      const width=runtime.renderer.domElement.width,height=runtime.renderer.domElement.height,result=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,result);
      const channels=[0,0,0],left=[0,0,0],right=[0,0,0];let visible=0;
      for(let i=0;i<result.length;i+=4){const x=(i/4)%width,y=Math.floor(i/4/width),sum=result[i]+result[i+1]+result[i+2];if(sum>30)visible++;
        for(let c=0;c<3;c++){channels[c]+=result[i+c];if(y>height*.3&&y<height*.7){if(x>width*.3&&x<width*.45)left[c]+=result[i+c];if(x>width*.55&&x<width*.7)right[c]+=result[i+c];}}}
      samples.set(name,result);return {visible,channels,left,right,glError:gl.getError()};
    }
    function compare(a,b){const first=samples.get(a),second=samples.get(b);let changed=0,difference=0;for(let i=0;i<first.length;i+=4){const value=Math.abs(first[i]-second[i])+Math.abs(first[i+1]-second[i+1])+Math.abs(first[i+2]-second[i+2]);difference+=value;if(value>12)changed++;}return {changed,difference};}
    window.idleTest={runtime,frame,step,configure,snapshot,pixels,compare,outsideClicks:()=>outsideClicks,activePositions:()=>Array.from(runtime.positions).filter((_,i)=>runtime.enabled[Math.floor(i/3)])};step();
  });
  const hit=page.locator('.particle-lyrics-interaction');
  evidence.shapes=[];
  const custom=Array.from({length:512},(_,i)=>[Math.cos(i*Math.PI/256),Math.sin(i*Math.PI/256)*.6]);
  for(const [label,settings]of [...['circle','square','star','spot','snowflake','note'].map(shape=>[shape,{shape}]),['text',{shape:'text',idleText:'等待音乐'}],['custom',{shape:'custom',customShape:custom}],['empty-text',{shape:'text',idleText:'   '}],['empty-custom',{shape:'custom',customShape:[]}]] ){
    await page.evaluate(settings=>idleTest.configure({...settings,positionX:0,positionY:0,rotationX:0,rotationY:0,gestureScale:1}),settings);
    assert.equal(await hit.isVisible(),true,`${label}: idle has a pointer target`);
    const bounds=await hit.boundingBox();assert.ok(bounds.width>35&&bounds.height>35&&bounds.width<1080&&bounds.height<720,`${label}: only the main shape captures input`);
    const before=await page.evaluate(()=>idleTest.snapshot());
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+36,bounds.y+bounds.height/2-24,{steps:4});
    assert.equal(await page.evaluate(()=>idleTest.snapshot().commits),before.commits,`${label}: no preference writes during pointermove`);
    assert.ok(await page.evaluate(()=>idleTest.snapshot().invalidations)>before.invalidations,`${label}: pointermove requests an immediate render without waiting for release`);
    await page.mouse.up();const after=await page.evaluate(()=>idleTest.snapshot());
    assert.equal(after.commits,before.commits+1,`${label}: one completed gesture commits once`);
    assert.ok(Math.abs(after.transform.positionX-36/1080)<1e-6&&Math.abs(after.transform.positionY-24/720)<1e-6,`${label}: center drag moves idle geometry`);
    await page.locator('#outside').click();evidence.shapes.push({label,bounds,transform:after.transform});
  }
  assert.equal(await page.evaluate(()=>idleTest.outsideClicks()),10,'ambient particles never swallow the outside button');
  await page.evaluate(()=>idleTest.configure({shape:'square',positionX:0,positionY:0}));
  let bounds=await hit.boundingBox();await page.mouse.move(bounds.x+bounds.width*.1,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.1+30,bounds.y+bounds.height/2+20,{steps:4});await page.mouse.up();
  let transform=await page.evaluate(()=>idleTest.snapshot().transform);assert.ok(transform.rotationX>0&&transform.rotationY>0,'idle edges rotate');
  bounds=await hit.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,-120);await page.waitForFunction(()=>idleTest.runtime.settings.gestureScale>1);
  await hit.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('+');
  evidence.gestures=await page.evaluate(()=>idleTest.snapshot());assert.ok(evidence.gestures.transform.positionX>0&&evidence.gestures.transform.gestureScale>1);
  evidence.color=await page.evaluate(()=>{
    idleTest.configure({shape:'square',positionX:0,positionY:0,rotationX:0,rotationY:0,gestureScale:1,colorMode:'custom',colorA:'#00ff00',colorB:'#00ff00',colorC:'#00ff00',gradientMode:'single',idlePaletteEnabled:false});
    const inherited={state:idleTest.snapshot(),pixels:idleTest.pixels('inherited')};
    idleTest.configure({idlePaletteEnabled:true,idleColorMode:'custom',idleColorA:'#ff0000',idleColorB:'#00ff00',idleColorC:'#0000ff',idleGradientMode:'single'});
    const single={state:idleTest.snapshot(),pixels:idleTest.pixels('single')};
    idleTest.configure({idleGradientMode:'linear'});const linear={state:idleTest.snapshot(),pixels:idleTest.pixels('linear'),difference:idleTest.compare('single','linear')};
    idleTest.configure({idleGradientMode:'segmented',idleGradientSegments:3});const segmented={state:idleTest.snapshot(),pixels:idleTest.pixels('segmented'),difference:idleTest.compare('linear','segmented')};
    return {inherited,single,linear,segmented};
  });
  const color=evidence.color;
  assert.deepEqual(color.inherited.state.colors,['00ff00','00ff00','00ff00']);assert.ok(color.inherited.pixels.channels[1]>color.inherited.pixels.channels[0]*3,'inherited palette colors actual pixels');
  assert.deepEqual(color.single.state.colors,['ff0000','00ff00','0000ff']);assert.ok(color.single.pixels.channels[0]>color.single.pixels.channels[1]*3,'independent single color reaches the GPU');
  assert.ok(color.linear.difference.changed>1000,'linear gradient changes actual pixels');assert.ok(color.linear.pixels.left[0]>color.linear.pixels.left[2]*2&&color.linear.pixels.right[2]>color.linear.pixels.right[0]*2,'shape gradient spans red to blue across its visible width');
  assert.ok(color.segmented.difference.changed>500,'segmented distribution differs from the continuous gradient');
  await page.evaluate(()=>idleTest.configure({idleGradientMode:'linear'}));await page.screenshot({path:path.join(output,'idle-three-color-gradient.png')});
  evidence.lyricIsolation=await page.evaluate(()=>{
    idleTest.configure({positionX:.13,positionY:.09,rotationX:8,rotationY:-11,gestureScale:1.15,presentation:'line'});
    const idleTransform=idleTest.snapshot().transform;idleTest.step(100,{hasLyric:true,text:'星光汇聚成歌',lyricKey:'line-one',playing:true,reducedMotion:false,audioTime:2});
    idleTest.step(1,{playing:false});const before=idleTest.snapshot(),positions=idleTest.activePositions();
    idleTest.configure({idleColorA:'#ffff00',idleGradientMode:'flow',idleGradientSpeed:.6});idleTest.step(30);
    const after=idleTest.snapshot();return {idleTransform,before,after,positionsStable:JSON.stringify(positions)===JSON.stringify(idleTest.activePositions())};
  });
  assert.ok(evidence.lyricIsolation.before.count>500);assert.deepEqual(evidence.lyricIsolation.after.transform,evidence.lyricIsolation.idleTransform,'formed lyrics retain the idle transform');
  assert.deepEqual(evidence.lyricIsolation.before.colors,['00ff00','00ff00','00ff00']);assert.deepEqual(evidence.lyricIsolation.after.colors,evidence.lyricIsolation.before.colors,'editing idle palette never recolors paused lyrics');
  assert.ok(evidence.lyricIsolation.after.clock>evidence.lyricIsolation.before.clock+.4,'paused lyrics keep decorating with the running animation clock');assert.ok(evidence.lyricIsolation.positionsStable,'paused formed lyrics keep exact positions');
  evidence.flow=await page.evaluate(()=>{
    idleTest.configure({positionX:0,positionY:0,rotationX:0,rotationY:0,gestureScale:1,idleColorA:'#ff0000',idleGradientSpeed:.3});
    idleTest.step(1,{hasLyric:false,text:'',lyricKey:'back-to-idle',playing:false,reducedMotion:false});
    const before=idleTest.snapshot();idleTest.pixels('flow-start');idleTest.step(90);const after=idleTest.snapshot();idleTest.pixels('flow-end');
    idleTest.step(1,{reducedMotion:true});const reducedBefore=idleTest.snapshot();idleTest.pixels('reduced-start');idleTest.step(30);const reducedAfter=idleTest.snapshot();idleTest.pixels('reduced-end');
    return {before,after,difference:idleTest.compare('flow-start','flow-end'),reducedBefore,reducedAfter,reducedDifference:idleTest.compare('reduced-start','reduced-end')};
  });
  assert.equal(evidence.flow.before.count,0);assert.ok(evidence.flow.after.clock>evidence.flow.before.clock+1,'decorative idle clock continues after earlier playback');assert.ok(evidence.flow.difference.changed>1000,'flowing colors keep changing after returning to paused idle');
  assert.equal(evidence.flow.reducedAfter.clock,evidence.flow.reducedBefore.clock);assert.equal(evidence.flow.reducedDifference.changed,0,'reduced motion freezes the visible idle frame');
  evidence.characterInheritance=await page.evaluate(()=>{
    idleTest.configure({shape:'text',idleText:'待机',idlePaletteEnabled:false,gradientMode:'character',colorA:'#ff0000',colorB:'#00ff00',colorC:'#0000ff'});
    const inherited=idleTest.snapshot();idleTest.pixels('character-inherited');idleTest.configure({gradientMode:'linear'});idleTest.pixels('character-linear');
    return {inherited,difference:idleTest.compare('character-inherited','character-linear')};
  });
  assert.equal(evidence.characterInheritance.inherited.gradient,1);assert.equal(evidence.characterInheritance.difference.changed,0,'inherited character colors use current idle spatial coordinates');
  const inherited=evidence.characterInheritance.inherited;assert.ok(Math.abs(inherited.min-inherited.bounds.minX)<1e-5&&Math.abs(inherited.width-(inherited.bounds.maxX-inherited.bounds.minX))<1e-5,'idle gradient uses current shape bounds rather than stale lyric layout');
  evidence.cover=await page.evaluate(()=>{idleTest.configure({idlePaletteEnabled:true,idleColorMode:'cover'});FeParticleLyricsRuntime.setPalette(idleTest.runtime,[{r:255,g:16,b:0},{r:0,g:255,b:16},{r:16,g:0,b:255}]);idleTest.step();return idleTest.snapshot();});
  assert.deepEqual(evidence.cover.colors,['ff1000','00ff10','1000ff'],'independent idle can follow the current cover palette');
  evidence.disposal=await page.evaluate(()=>{FeParticleLyricsRuntime.dispose(idleTest.runtime);return {canvases:document.querySelectorAll('#host canvas').length,targets:document.querySelectorAll('.particle-lyrics-interaction').length};});
  assert.deepEqual(evidence.disposal,{canvases:0,targets:0});assert.deepEqual(errors,[],'production shaders and interactions have no browser errors');
  evidence.freshPaused=await page.evaluate(()=>{
    const runtime=FeParticleLyricsRuntime.create(document.getElementById('host'),{pixelRatio:1,settings:{presentation:'line',bloomStrength:0}});
    const frame={now:1000,playing:false,hasLyric:true,text:'暂停的星光',lyricKey:'fresh-paused',audioTime:2,lineStart:0,lineEnd:6,reducedMotion:false};
    FeParticleLyricsRuntime.update(runtime,frame);const before={clock:runtime.clock,time:runtime.uniforms.uTime.value,count:runtime.activeCount},positions=runtime.positions.slice();
    for(let i=0;i<30;i++){frame.now+=1000/60;FeParticleLyricsRuntime.update(runtime,frame);}
    const after={clock:runtime.clock,time:runtime.uniforms.uTime.value,count:runtime.activeCount},changed={active:0,ambient:0};
    for(let i=0;i<positions.length;i++)if(positions[i]!==runtime.positions[i])changed[runtime.enabled[Math.floor(i/3)]?'active':'ambient']++;
    FeParticleLyricsRuntime.dispose(runtime);return {before,after,changed};
  });
  assert.ok(evidence.freshPaused.before.count>500);assert.ok(evidence.freshPaused.after.clock>evidence.freshPaused.before.clock+.4,'a paused runtime keeps animating its light instead of freezing the frame');assert.equal(evidence.freshPaused.after.time,evidence.freshPaused.after.clock);assert.equal(evidence.freshPaused.changed.active,0,'a freshly loaded paused lyric preserves its active glyph positions');
  console.log('PASS idle particle interaction: all shapes/fallbacks, bounded mouse and keyboard gestures, one-write commits, shared transforms, independent/cover/gradient GPU colors, paused lyric isolation, continued idle flow, reduced motion and disposal');
}finally{writeFileSync(path.join(output,'result.json'),JSON.stringify({errors,evidence},null,2));await browser.close();}
