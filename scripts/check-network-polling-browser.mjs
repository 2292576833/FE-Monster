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
const out=path.join(root,'output/performance-audit');mkdirSync(out,{recursive:true});
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
try {
 browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#bootLogoButton').click();
 await page.waitForFunction(()=>typeof setTextPreset==='function'&&document.getElementById('bootScreen')?.hidden,null,{timeout:30000});
 await page.evaluate(()=>clearBackgroundPolling());
 const samples={};
 for(const [endpoint,delay] of [['visual-bridge/state',2500],['player/state',6500]]){
  const metric=samples[endpoint]={delay,started:0,active:0,maxActive:0,finished:0};
  await page.route(`**/api/${endpoint}`,async route=>{
   metric.started++;metric.active++;metric.maxActive=Math.max(metric.maxActive,metric.active);
   await new Promise(resolve=>setTimeout(resolve,delay));
   metric.active--;metric.finished++;
   try{await route.fulfill({json:endpoint==='player/state'?{ok:true,playing:false,paused:true,position:0,duration:0,queue:[],queueLength:0,queueRevision:7,queueIndex:-1}:{ok:true,audio:{}}});}catch{}
  });
 }
 await page.evaluate(()=>startBackgroundPolling());await page.waitForTimeout(11300);await page.evaluate(()=>clearBackgroundPolling());

 assert.equal(samples['visual-bridge/state'].maxActive,1,'slow bridge polls never overlap');
 assert.equal(samples['player/state'].maxActive,1,'slow player polls never supersede each other');
 assert.ok(samples['visual-bridge/state'].started<=4,'slow polling avoids redundant bridge requests');
 await page.waitForTimeout(800);
 const after=await page.evaluate(()=>({id:state.playerStateSync.requestId,queueRevision:state.queueRevision}));
 assert.equal(after.queueRevision,7,'the slow player response is applied instead of discarded by a later timer tick');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({samples,after}));
 writeFileSync(path.join(out,'polling-after.json'),JSON.stringify({sampleMs:11300,samples,after,errors},null,2));
}finally{await browser?.close();server.close();}
