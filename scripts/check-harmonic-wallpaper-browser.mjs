import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const packageRoot=path.resolve(process.argv.find(arg=>arg.startsWith('--package='))?.slice(10)||path.join(root,'output/wallpaper-engine/harmonic-realm'));
const output=path.join(root,'output/playwright/harmonic-wallpaper');
const require=createRequire(import.meta.url);let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(module));break;}catch{}
}
assert.ok(chromium,'Playwright is required');assert.ok(existsSync(path.join(packageRoot,'project.json')),'Build the Wallpaper Engine package first');
mkdirSync(output,{recursive:true});
const project=JSON.parse(readFileSync(path.join(packageRoot,'project.json'),'utf8'));
const server=createServer((request,response)=>{
  const name=decodeURIComponent(new URL(request.url,'http://local').pathname);
  const file=path.resolve(packageRoot,name==='/'?'index.html':name.slice(1));
  if(!file.startsWith(packageRoot+path.sep)||!existsSync(file)){response.writeHead(404);response.end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
  response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');response.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[],requests=[],evidence={};

function installProbe(withEngine){
  const probe=window.__weProbe={registrations:{},callbacks:{},runtime:null,lastFrame:null,frameCount:0,disposed:false,microphoneCalls:0};
  let runtimeApi;
  Object.defineProperty(window,'FeHarmonicStateRuntime',{configurable:true,get:()=>runtimeApi,set:api=>{
    runtimeApi={...api,
      create(...args){probe.runtime=api.create(...args);return probe.runtime;},
      update(runtime,frame){probe.lastFrame={...frame};probe.frameCount++;return api.update(runtime,frame);},
      dispose(runtime){probe.disposed=true;return api.dispose(runtime);}
    };
  }});
  if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{probe.microphoneCalls++;return Promise.reject(new Error('A wallpaper must not request microphone access'));};
  if(withEngine){
    for(const name of ['Audio','MediaStatus','MediaProperties','MediaThumbnail','MediaPlayback','MediaTimeline']){
      window[`wallpaperRegister${name}Listener`]=callback=>{probe.registrations[name]=(probe.registrations[name]||0)+1;probe.callbacks[name]=callback;};
    }
    window.wallpaperMediaIntegration={PLAYBACK_PLAYING:1,PLAYBACK_PAUSED:2,PLAYBACK_STOPPED:0};
  }
  window.__weSnapshot=()=>{
    const r=probe.runtime;
    let finite=true;r?.scene.traverse(object=>{finite&&=object.matrix.elements.every(Number.isFinite);});
    return {frames:probe.frameCount,frame:probe.lastFrame,effects:r?.effects,bass:r?.bass,mid:r?.mid,treble:r?.treble,energy:r?.energy,
      cards:r?.gallery.visible,canvasCount:document.querySelectorAll('#wallpaperHost canvas').length,
      dimensions:r?{width:r.width,height:r.height,pixelRatio:r.pixelRatio}:null,
      registrations:probe.registrations,finite,disposed:probe.disposed,
      scene:r?runtimeApi.diagnostics(r):null,adapter:window.FeHarmonicWallpaper?.diagnostics?.()};
  };
  window.__weFeed=(band='silence',level=.8,channel='both')=>{
    const samples=new Array(128).fill(0),bounds={bass:[0,8],mid:[12,28],treble:[42,64]};
    if(bounds[band])for(let i=bounds[band][0];i<bounds[band][1];i++){
      if(channel!=='right')samples[i]=level;if(channel!=='left')samples[i+64]=level;
    }
    probe.callbacks.Audio?.(samples);
  };
}

try{
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),args:['--use-angle=d3d11','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(installProbe,true);
  await page.goto(origin);await page.waitForFunction(()=>__weProbe.frameCount>2);
  evidence.start=await page.evaluate(()=>__weSnapshot());
  assert.equal(evidence.start.canvasCount,1);assert.ok(evidence.start.finite);
  assert.equal(evidence.start.registrations.Audio,1,'WE audio listener is registered once');
  assert.equal(evidence.start.effects.flashMode,'shake');assert.equal(evidence.start.effects.surfaceRiseEnabled,true);
  assert.equal(evidence.start.frame.playing,false,'silence has no simulated audio');
  const defaults=Object.fromEntries(Object.entries(project.general.properties).filter(([,field])=>'value'in field).map(([key,field])=>[key,{value:field.value}]));
  await page.evaluate(properties=>wallpaperPropertyListener.applyUserProperties(properties),defaults);
  const feed=async(band,channel='both',duration=450)=>{
    await page.evaluate(({band,channel})=>{clearInterval(window.__feedTimer);__weFeed(band,.9,channel);window.__feedTimer=setInterval(()=>__weFeed(band,.9,channel),25);},{band,channel});
    await page.waitForTimeout(duration);const result=await page.evaluate(()=>__weSnapshot());
    await page.evaluate(()=>clearInterval(window.__feedTimer));return result;
  };
  evidence.bass=await feed('bass');evidence.mid=await feed('mid');evidence.treble=await feed('treble');
  assert.ok(evidence.bass.frame.bass>.1&&evidence.bass.frame.bass>evidence.bass.frame.treble,'low frequency energy reaches the scene');
  assert.ok(evidence.mid.frame.mid>.1&&evidence.mid.frame.mid>evidence.mid.frame.bass,'middle frequencies have an independent response');
  assert.ok(evidence.treble.frame.treble>.1&&evidence.treble.frame.treble>evidence.treble.frame.bass,'high frequencies have an independent response');
  assert.equal(evidence.bass.frame.playing,true,'system audio works without media metadata');
  evidence.left=await feed('bass','left');evidence.right=await feed('bass','right');
  assert.ok(Math.abs(evidence.left.frame.bass-evidence.right.frame.bass)<.06,'left and right channels receive equal weight');
  await page.waitForTimeout(1800);evidence.stale=await page.evaluate(()=>__weSnapshot());
  assert.ok(evidence.stale.frame.bass<.03&&evidence.stale.frame.energy<.03,'stopped audio callbacks decay to silence');
  await page.evaluate(()=>{__weProbe.callbacks.Audio([NaN,Infinity,-4]);__weProbe.callbacks.Audio(new Array(128).fill(NaN));});
  await page.waitForTimeout(100);evidence.invalid=await page.evaluate(()=>__weSnapshot());
  for(const key of ['bass','mid','treble','energy','beat'])assert.ok(Number.isFinite(evidence.invalid.frame[key]),`invalid audio cannot poison ${key}`);
  assert.ok(evidence.invalid.finite);

  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({cubeColorMode:{value:'custom'},cubeColor:{value:'1 0.2 0.4'},fogColorMode:{value:'custom'},fogColor:{value:'0.2 0.8 1'},lyricCardsEnabled:{value:false},waterClarity:{value:.91},wallpaperQuality:{value:'low'}}));
  await page.waitForTimeout(120);evidence.properties=await page.evaluate(()=>__weSnapshot());
  assert.equal(evidence.properties.effects.cubeColor,'#ff3366');assert.equal(evidence.properties.effects.fogColor,'#33ccff');
  assert.equal(evidence.properties.effects.waterClarity,.91);assert.equal(evidence.properties.cards,false);
  assert.equal(evidence.properties.effects.ringsEnabled,true,'partial updates preserve other settings');
  assert.ok(evidence.properties.dimensions.pixelRatio<=.75);
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({wallpaperYaw:{value:20},wallpaperPitch:{value:10},wallpaperZoom:{value:.8},wallpaperSensitivity:{value:.5}}));
  evidence.view=await page.evaluate(()=>({yaw:__weProbe.runtime.group.rotation.y,pitch:__weProbe.runtime.group.rotation.x,zoom:__weProbe.runtime.camera.zoom}));
  evidence.sensitivity=await feed('bass');
  assert.ok(Math.abs(evidence.sensitivity.frame.bass-.45)<.001,'audio sensitivity changes the input strength');
  evidence.view=await page.evaluate(()=>({yaw:__weProbe.runtime.group.rotation.y,pitch:__weProbe.runtime.group.rotation.x,zoom:__weProbe.runtime.camera.zoom}));
  assert.ok(Math.abs(evidence.view.yaw-20*Math.PI/180)<.00001);assert.ok(Math.abs(evidence.view.pitch-10*Math.PI/180)<.00001);assert.equal(evidence.view.zoom,.8);
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({wallpaperYaw:{value:0},wallpaperPitch:{value:0},wallpaperZoom:{value:1},wallpaperSensitivity:{value:1}}));
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({wallpaperCardTitle:{value:'自定义壁纸标题'},wallpaperCardArtist:{value:'本地文案'},wallpaperCardHint:{value:'粒子随声而动'},lyricCardsEnabled:{value:true},wallpaperQuality:{value:'balanced'}}));
  await page.waitForTimeout(100);evidence.customText=await page.evaluate(()=>__weSnapshot());
  assert.ok(JSON.stringify(evidence.customText.frame).includes('自定义壁纸标题'));
  await page.evaluate(()=>{
    __weProbe.callbacks.MediaStatus?.({enabled:true});
    __weProbe.callbacks.MediaProperties?.({title:'群星之间',artist:'测试歌手',albumTitle:'夜色'});
    __weProbe.callbacks.MediaPlayback?.({state:wallpaperMediaIntegration.PLAYBACK_PLAYING});
    __weProbe.callbacks.MediaTimeline?.({position:30,duration:180});
    const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='#76cbea';ctx.fillRect(0,0,16,16);
    __weProbe.callbacks.MediaThumbnail?.({thumbnail:c.toDataURL('image/png'),primaryColor:'0.1 0.7 0.9',secondaryColor:'0.4 0.2 0.8',tertiaryColor:'0.8 0.3 0.6'});
  });
  await page.waitForTimeout(180);evidence.media=await page.evaluate(()=>__weSnapshot());
  assert.equal(evidence.media.frame.title,'群星之间');assert.equal(evidence.media.frame.subtitle,'测试歌手');
  assert.ok(evidence.media.frame.coverUrl.startsWith('data:image/png'));
  await page.evaluate(()=>__weProbe.callbacks.MediaProperties({title:'封面先到的新歌曲',artist:'测试歌手'}));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>__weProbe.lastFrame.coverUrl),evidence.media.frame.coverUrl,'metadata ordering does not discard the latest thumbnail');
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({wallpaperMediaEnabled:{value:false}}));
  await page.waitForTimeout(100);evidence.mediaDisabled=await page.evaluate(()=>__weSnapshot());
  assert.equal(evidence.mediaDisabled.frame.title,'自定义壁纸标题');assert.ok(!evidence.mediaDisabled.frame.coverUrl);

  await page.evaluate(()=>{
    wallpaperPropertyListener.applyGeneralProperties({fps:15});
    wallpaperPropertyListener.applyUserProperties({wallpaperFps:{value:120}});
  });
  const unlimitedStart=await page.evaluate(()=>__weProbe.frameCount);await page.waitForTimeout(450);
  evidence.unlimited=await page.evaluate(start=>({frames:__weProbe.frameCount-start,adapter:FeHarmonicWallpaper.diagnostics()}),unlimitedStart);
  assert.equal(evidence.unlimited.adapter.quality.effectiveFps,0,'default mode does not inherit the host 15 FPS cap or the obsolete saved property');
  assert.equal(evidence.unlimited.adapter.quality.uncapped,true);assert.ok(evidence.unlimited.frames>0);
  await page.evaluate(()=>{
    wallpaperPropertyListener.applyUserProperties({wallpaperFrameLimit:{value:30}});
    wallpaperPropertyListener.applyGeneralProperties({fps:24});
  });
  const before=await page.evaluate(()=>__weProbe.frameCount);await page.waitForTimeout(1000);
  evidence.fps=await page.evaluate(start=>({frames:__weProbe.frameCount-start,adapter:FeHarmonicWallpaper.diagnostics()}),before);
  assert.ok(evidence.fps.frames<=28&&evidence.fps.frames>=8,'WE frame limit is honored');
  await page.evaluate(()=>wallpaperPropertyListener.setPaused(true));
  const paused=await page.evaluate(()=>__weProbe.frameCount);await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>__weProbe.frameCount),paused,'WE pause stops rendering');
  await page.evaluate(()=>{wallpaperPropertyListener.applyUserProperties({wallpaperFrameLimit:{value:0}});wallpaperPropertyListener.applyGeneralProperties({fps:60});wallpaperPropertyListener.setPaused(false);});
  await page.waitForFunction(count=>__weProbe.frameCount>count,paused);
  evidence.resume=await page.evaluate(()=>__weSnapshot());assert.ok(evidence.resume.finite);

  await page.setViewportSize({width:2560,height:1080});await page.waitForFunction(()=>__weProbe.runtime.width===2560);
  evidence.ultrawide=await page.evaluate(()=>__weSnapshot());assert.equal(evidence.ultrawide.dimensions.height,1080);
  await page.evaluate(properties=>wallpaperPropertyListener.applyUserProperties(properties),defaults);
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({lyricCardsEnabled:{value:false}}));
  await feed('bass');await page.screenshot({path:path.join(output,'ultrawide.png')});
  await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>__weProbe.runtime.width===1440);
  await feed('mid');await page.screenshot({path:path.join(output,'wallpaper.png')});
  if(process.argv.includes('--write-preview'))await page.screenshot({path:path.join(packageRoot,'preview.jpg'),type:'jpeg',quality:90});
  await page.evaluate(()=>wallpaperPropertyListener.applyUserProperties({lyricCardsEnabled:{value:true},wallpaperMediaEnabled:{value:false}}));
  await page.waitForTimeout(150);await page.screenshot({path:path.join(output,'information-cards.png')});
  assert.equal(await page.evaluate(()=>__weProbe.microphoneCalls),0);
  for(const count of Object.values(await page.evaluate(()=>__weProbe.registrations)))assert.equal(count,1);
  const canLoseContext=await page.evaluate(()=>{
    window.__contextExtension=__weProbe.runtime.renderer.getContext().getExtension('WEBGL_lose_context');
    if(__contextExtension)__contextExtension.loseContext();return !!__contextExtension;
  });
  assert.ok(canLoseContext,'the test GPU supports context-loss simulation');
  await page.waitForFunction(()=>FeHarmonicWallpaper.diagnostics().contextLost);
  const lostFrames=await page.evaluate(()=>__weProbe.frameCount);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>__weProbe.frameCount),lostFrames,'lost contexts stop rendering');
  await page.evaluate(()=>__contextExtension.restoreContext());
  await page.waitForFunction(count=>!FeHarmonicWallpaper.diagnostics().contextLost&&__weProbe.frameCount>count,lostFrames);
  evidence.contextRecovery=await page.evaluate(()=>__weSnapshot());assert.ok(evidence.contextRecovery.finite);assert.equal(evidence.contextRecovery.canvasCount,1);
  assert.equal(await page.locator('#errorMessage').isVisible(),false);
  await page.evaluate(()=>FeHarmonicWallpaper.dispose());await page.waitForTimeout(100);
  evidence.disposal=await page.evaluate(()=>__weSnapshot());assert.equal(evidence.disposal.canvasCount,0);assert.equal(evidence.disposal.disposed,true);
  const afterDispose=evidence.disposal.frames;await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>__weProbe.frameCount),afterDispose);

  // A browser/file preview must work without any WE globals or an HTTP server.
  const local=await browser.newPage({viewport:{width:1280,height:720}});local.on('pageerror',error=>errors.push(error.message));
  await local.addInitScript(installProbe,false);await local.goto(pathToFileURL(path.join(packageRoot,'index.html')).href);
  await local.waitForFunction(()=>__weProbe.frameCount>2);evidence.filePreview=await local.evaluate(()=>__weSnapshot());
  assert.ok(evidence.filePreview.finite);assert.equal(evidence.filePreview.frame.playing,false);
  await local.evaluate(()=>FeHarmonicWallpaper.dispose());await local.close();
  assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(origin)||url.startsWith('data:')),'the wallpaper loads no network or app API resources');
  console.log('PASS harmonic Wallpaper Engine: standalone file/WebGL, stereo frequency bands, silence/invalid samples, all property defaults, partial/color changes, media/text fallback, FPS/pause/resume, ultrawide, offline resources and disposal');
}finally{
  writeFileSync(path.join(output,'results.json'),JSON.stringify({evidence,errors,requests},null,2));
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
