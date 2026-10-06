import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'web');
const require=createRequire(import.meta.url);let chromium;
for(const candidate of ['playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]){
  try{({chromium}=require(candidate));break;}catch{}
}
assert.ok(chromium);
const out=path.join(root,'output/playwright/audio-source-existing-library');mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const source={id:'fixture-source',name:'自建测试音源',supportedProviders:['netease','qq'],capabilities:{wy:{actions:['musicUrl'],qualitys:['128k']},tx:{actions:['musicUrl'],qualitys:['128k']}}};
const requests=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local'),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/api/app/preferences/bootstrap.js'){res.setHeader('Content-Type','application/javascript');res.end('');return;}
  if(pathname.startsWith('/api/')){
    requests.push(pathname);
    const fixtures={
      '/api/music-apis':{ok:true,providers:['netease','qq'].map(id=>({id,enabled:true,configured:true,apiStatus:'ready'}))},
      '/api/audio-sources':{ok:true,selected:source.id,runtimeReady:true,custom:[source],builtins:[]},
      '/api/user-cursors':{ok:true,cursors:[]},
      '/api/app/runtime':{ok:true,clientMode:'browser',renderBackend:'webgl',settings:{gpuAcceleration:true}},
      '/api/player/state':{ok:true,playing:false,paused:true,volume:.8,position:0,duration:0,queue:[],queueLength:0,queueRevision:0,queueIndex:-1},
      '/api/player/queue':{ok:true,queueLength:30,queueRevision:1},
      '/api/visual-bridge/state':{ok:true,audio:{}},'/api/sandbox/presets':{ok:true,presets:[]},'/api/sandbox/components':{ok:true,components:[]},
      '/api/community/status':{ok:true,authenticated:false},'/api/community/pet/status':{ok:true,pet:{state:'idle',voices:[]},sessions:[]}
    };
    let result=fixtures[pathname]||{ok:true};
    const provider=url.searchParams.get('provider')||pathname.split('/')[2];
    if(pathname.endsWith('/playlists')) result={ok:true,loggedIn:true,playlists:[{id:`${provider}-list`,name:`${provider} 音源歌单`,provider,trackCount:30}]};
    if(pathname.endsWith('/playlist/tracks')) result={ok:true,songs:Array.from({length:30},(_,i)=>({id:`${provider}-song-${i}`,title:`${provider} 歌曲 ${i}`,artist:'自编夹具',provider,duration:180,sourceRef:{songmid:`mid-${i}`}}))};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  const file=path.resolve(pathname.startsWith('/components/')?root:web,pathname==='/'?'index.html':pathname.replace(/^\//,''));
  if(!file.startsWith(root+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',`${mime[path.extname(file)]||'application/octet-stream'}; charset=utf-8`);res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{}),args:['--mute-audio','--use-angle=d3d11','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin||route.request().url().startsWith('data:')?route.continue():route.abort());
  await page.goto(origin);
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(()=>document.getElementById('bootScreen')?.hidden&&typeof browseAudioSourceLibrary==='function',null,{timeout:30000});
  // Only replace the physical audio operation; actual playlist, queue, selection,
  // existing DOM/event handlers and manager callbacks remain production code.
  await page.evaluate(()=>{
    window.__played=[];
    loadSong=async song=>{state.currentSong=song;window.__played.push(song);return true;};
    refreshPlayerState=async()=>({});
    window.__originalPreset=state.diyPreset;
  });
  await page.evaluate(()=>showLoginDialog());
  await page.click('#audioSourceManagerButton');
  await page.waitForFunction(()=>!document.getElementById('audioSourceBrowse').disabled);
  await page.click('#audioSourceBrowse');
  await page.waitForSelector('#orbPlaylistCards [data-playlist-id="netease-list"]');
  assert.equal(await page.locator('#audioSourceDialog').isHidden(),true);
  assert.equal(await page.locator('#playlistSourceBar, #playlistSourceProvider, #playlistSourceManage').count(),0,'playlist area contains no platform/source controls');
  assert.equal(await page.locator('#neteaseLoginDialog #audioSourceManagerButton').count(),1,'source management remains on the login page');
  assert.equal(await page.evaluate(()=>state.diyPreset===__originalPreset),true,'source browsing preserves current scene preset');
  await page.screenshot({path:path.join(out,'existing-playlists.png')});
  await page.locator('#orbPlaylistCards [data-playlist-id="netease-list"]').click();
  await page.waitForSelector('#playlistSongStack .shelf-song-button');
  const button=page.locator('#playlistSongStack [data-song-index="0"]');
  await button.click();
  await page.waitForFunction(()=>__played.length===1);
  assert.equal(await page.evaluate(()=>__played[0].id),'netease-song-0');
  assert.equal(await page.locator('#playlistShelf').isVisible(),true,'song choice retains the existing song shelf');
  assert.equal(await page.locator('#playlistShelfTitle').textContent(),'netease 音源歌单');
  assert.equal(await page.evaluate(()=>state.activePlaylistSongs.length),30);
  await page.screenshot({path:path.join(out,'existing-songs.png')});
  await page.click('#playlistShelfBack');
  await page.evaluate(()=>showLoginDialog());
  const qqShortcut=page.locator('[data-pixel-provider-shortcut="qq"]');
  await qqShortcut.focus();
  await qqShortcut.press('Enter');
  await page.waitForFunction(()=>state.activeProvider==='qq');
  await page.click('#audioSourceManagerButton');
  await page.waitForFunction(()=>!document.getElementById('audioSourceBrowse').disabled);
  await page.click('#audioSourceBrowse');
  await page.waitForSelector('#orbPlaylistCards [data-playlist-id="qq-list"]');
  assert.equal(await page.evaluate(()=>state.activeProvider),'qq');
  await page.locator('#orbPlaylistCards [data-playlist-id="qq-list"]').click();
  await page.waitForSelector('#playlistSongStack [data-song-id="qq-song-0"]');
  await page.locator('#playlistSongStack [data-song-id="qq-song-0"]').click();
  await page.waitForFunction(()=>__played.length===2);
  assert.equal(await page.evaluate(()=>__played[1].provider),'qq');
  assert.equal(await page.evaluate(()=>__played[1].sourceRef.songmid),'mid-0','provider resolution metadata survives existing shelf playback');
  await page.click('#playlistShelfBack');
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    const ringTop=await page.locator('#orbPlaylistCards').evaluate(el=>parseFloat(getComputedStyle(el).top));
    assert.ok(ringTop<100,`original playlist spacing is restored at ${width}: ${ringTop}`);
    assert.equal(await page.locator('#orbPlaylists select, #playlistSourceBar').count(),0);
    await page.screenshot({path:path.join(out,`existing-playlists-${width}.png`)});
  }
  assert.equal(await page.locator('#audioSourceCatalog').count(),0,'there is no separate source library dialog');
  assert.deepEqual(errors,[]);
  assert.ok(requests.includes('/api/netease/playlist/tracks')&&requests.includes('/api/qq/playlist/tracks'));
  console.log('PASS actual app: login source manager → original cards → existing song shelf → exact selected playback; login-only platform switch, no source strip, sourceRef and preset preserved, original responsive spacing');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
