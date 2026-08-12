import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const appSource = readFileSync(path.join(webRoot, 'app.js'), 'utf8');
const indexSource = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const identitySource = readFileSync(path.join(webRoot, 'fe-identity-card.js'), 'utf8');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, 'tmp', `.community-reward-browser-${process.pid}`);
assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
assert.match(indexSource, /community-reward-runtime\.css\?v=[^"']+/, 'the reward stage stylesheet is not shipped by index.html');
assert.match(indexSource, /community-reward-runtime\.js\?v=[^"']+[\s\S]*?app\.js\?v=/, 'the reward runtime must load before app.js');
assert.match(appSource, /grant\.attachmentAnimations[\s\S]*?attachment\.id/, 'mailbox claim does not resolve animations by attachment id');
assert.match(appSource, /FeMonsterRewardRuntime[\s\S]*?runtime\.play\s*\(/, 'mailbox claim does not invoke the three-phase reward runtime');
assert.match(appSource, /mailAnimation[\s\S]*?claimAnimation[\s\S]*?displayAnimation/, 'mailbox claim does not pass all three independent animations');
assert.match(identitySource, /detail\.phase\s*!==\s*'display'/, 'identity-card rewards do not open with their independent display animation');
assert.match(identitySource, /detail\.phase\s*===\s*'claim'[\s\S]*?detail\.sequenceManaged\s*!==\s*true/, 'managed identity-card claims can double-play the card animation');
assert.match(readFileSync(path.join(webRoot, 'community-reward-runtime.js'), 'utf8'), /delegatedIdentityDisplay[\s\S]*?view\.root\.hidden\s*=\s*delegatedIdentityDisplay/, 'identity-card display must hand the center stage to the real card');
mkdirSync(profile, { recursive: true });

function extract(startMarker, endMarker) {
  const start = indexSource.indexOf(startMarker);
  const end = indexSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `production markup is missing: ${startMarker}`);
  return indexSource.slice(start, end);
}

const identityTrigger = extract('<button class="community-identity-card-trigger"', '<button class="community-broadcast-button"');
const identityDialog = extract('<section class="fe-identity-card-dialog"', '<section class="update-dialog"');

const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="/community-reward-runtime.css">
<link rel="stylesheet" href="/fe-identity-card.css">
<style>html,body{margin:0;width:100%;height:100%;background:#12100d;color:white}.community-card{position:fixed;left:20px;top:20px}.community-card__head,.community-profile{display:grid}</style>
</head><body>
<section class="community-card"><div class="community-card__head"><span class="community-avatar">FE</span><span class="community-profile"><strong id="communityName"><span>Tester</span></strong></span>${identityTrigger}</div><strong id="communityFeId">12345678</strong></section>
${identityDialog}
<pre id="result">pending</pre>
<script>
window.__rewardEvents=[];
window.__rewardAnimationEvents=[];
window.__identityMotionEvents=[];
window.addEventListener('fe-monster-reward-phase',(event)=>window.__rewardEvents.push(event.detail));
window.addEventListener('fe-monster-reward-animation',(event)=>window.__rewardAnimationEvents.push(event.detail));
window.addEventListener('fe-monster-identity-card-animation',(event)=>window.__identityMotionEvents.push(event.detail));
localStorage.setItem('fe-monster-active-provider-v1','qq');
localStorage.setItem('fe-monster-identity-card-muted-v1','1');
window.__identityInventoryPhase=0;
const identityAnimation=(id,scope,soundCue)=>({id,scope,preset:'soft-reveal',soundCue,stages:[{kind:'item-rise',durationMs:24},{kind:'settle',durationMs:20}]});
const identityBase={finish:'satin',metalness:.37,roughness:.73,bevel:7.25,sweepIntensity:1.41,engravingDepth:.29};
const classicCard={...identityBase,id:'classic',label:'Classic',material:'polished-gold',primaryColor:'#D79A24',secondaryColor:'#6A3308',accentColor:'#FFF1A8',frontColor:'#D79A24',backColor:'#6A3308',borderColor:'#FFF1A8',entranceAnimationId:'classic-display',claimAnimationId:'classic-claim',displayAnimationId:'classic-display',mailAnimationId:'mail-open'};
const ordinaryCard={...identityBase,id:'ordinary',label:'Ordinary',material:'rose-gold',primaryColor:'#C88774',secondaryColor:'#704036',accentColor:'#FFD8C6',frontColor:'#C88774',backColor:'#704036',borderColor:'#FFD8C6',entranceAnimationId:'ordinary-display',claimAnimationId:'ordinary-claim',displayAnimationId:'ordinary-display',mailAnimationId:'mail-open'};
const limitedCard={...identityBase,id:'limited',label:'Limited',material:'black-gold',primaryColor:'#13579B',secondaryColor:'#2468AC',accentColor:'#F05A7E',frontColor:'#0B3D91',backColor:'#7A1F5B',borderColor:'#19E6C3',entranceAnimationId:'limited-display',claimAnimationId:'limited-claim',displayAnimationId:'limited-display',mailAnimationId:'mail-open',issuedByServer:true,nicknameEditable:false,engravedNickname:'LOCKED'};
const identityState=()=>{
  const cards=window.__identityInventoryPhase===0?[classicCard]:window.__identityInventoryPhase===1?[classicCard,ordinaryCard]:[classicCard,ordinaryCard,limitedCard];
  return {ok:true,feId:'12345678',nickname:'Tester',equippedId:'classic',equipped:classicCard,owned:cards,animations:[
    identityAnimation('mail-open','mail-claim','royal-chime'),identityAnimation('classic-claim','identity-card-claim','noble-metal'),identityAnimation('classic-display','identity-card-display','platinum-ring'),
    identityAnimation('ordinary-claim','identity-card-claim','noble-metal'),identityAnimation('ordinary-display','identity-card-display','platinum-ring'),
    identityAnimation('limited-claim','identity-card-claim','noble-metal'),identityAnimation('limited-display','identity-card-display','platinum-ring')
  ]};
};
window.fetch=async()=>({ok:true,status:200,json:async()=>identityState()});
</script>
<script src="/community-reward-runtime.js"></script>
<script src="/fe-identity-card.js"></script>
<script>
(async()=>{
  const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  try {
    const api=window.FeMonsterRewardRuntime;
    if(!api) throw new Error('FeMonsterRewardRuntime is missing');
    const task=api.play({
      attachmentId:'attachment-gold', itemType:'avatar-frame', itemId:'meteor-gold', label:'流星金头像框',
      mailAnimation:{id:'mail-gold',scope:'mail-claim',soundCue:'royal-chime',stages:[{kind:'mail-open',durationMs:24},{kind:'light-burst',durationMs:22}]},
      claimAnimation:{id:'claim-gold',scope:'item-claim',soundCue:'noble-metal',stages:[{kind:'item-rise',durationMs:26},{kind:'settle',durationMs:20}]},
      displayAnimation:{id:'display-gold',scope:'item-display',soundCue:'platinum-ring',stages:[{kind:'gold-sweep',durationMs:22},{kind:'slow-showcase',durationMs:28}]}
    });
    await task.started;
    await task.finished;
    const phases=window.__rewardEvents.filter((event)=>event.phase==='started');
    const completed=window.__rewardEvents.filter((event)=>event.phase==='completed');
    const stage=document.querySelector('.community-reward-stage');
    const first={
      phaseOrder:phases.map((event)=>event.name),
      soundOrder:phases.map((event)=>event.soundCue),
      ids:phases.map((event)=>event.animationId),
      completed:completed.map((event)=>event.name),
      label:stage?.querySelector('.community-reward-stage__label')?.textContent||'',
      hidden:!!stage?.hidden,
      networkUrls:performance.getEntriesByType('resource').map((entry)=>entry.name).filter((url)=>/^https?:/i.test(url)&&!url.startsWith(location.origin))
    };
    window.dispatchEvent(new CustomEvent('fe-monster-community-profile',{detail:{loggedIn:true,hasCommunityIdentity:true,provider:'qq',profile:{feId:'12345678',username:'Tester'}}}));
    await window.FeMonsterIdentityCard.refresh();
    window.__identityInventoryPhase=1;
    window.__rewardAnimationEvents.length=0;
    await window.FeMonsterIdentityCard.refresh();
    await wait(40);
    const ordinaryClaimEvents=window.__rewardAnimationEvents.filter((event)=>event.itemId==='ordinary'&&event.phase==='claim'&&event.sequenceManaged!==true);
    window.FeMonsterIdentityCard.close();
    await wait(20);
    window.__identityInventoryPhase=2;
    window.__rewardAnimationEvents.length=0;
    window.__identityMotionEvents.length=0;
    await window.FeMonsterIdentityCard.refresh({suppressAnnouncement:true});
    await wait(30);
    const identityTask=api.play({
      attachmentId:'limited-attachment',itemType:'identity-card',itemId:'limited',label:'Limited',
      mailAnimation:identityAnimation('mail-open','mail-claim','royal-chime'),
      claimAnimation:identityAnimation('limited-claim','identity-card-claim','noble-metal'),
      displayAnimation:identityAnimation('limited-display','identity-card-display','platinum-ring')
    });
    await identityTask.started;
    await identityTask.finished;
    await wait(40);
    const identitySequence={
      normalAnnouncementCount:ordinaryClaimEvents.length,
      phaseOrder:window.__rewardAnimationEvents.filter((event)=>event.sequenceManaged===true).map((event)=>event.phase),
      animationIds:window.__rewardAnimationEvents.filter((event)=>event.sequenceManaged===true).map((event)=>event.animationId),
      unmanagedClaimIds:window.__rewardAnimationEvents.filter((event)=>event.phase==='claim'&&event.sequenceManaged!==true).map((event)=>event.animationId),
      entranceIds:window.__identityMotionEvents.filter((event)=>event.phase==='entrance').map((event)=>event.animationId)
    };
    const longTask=api.play({
      attachmentId:'attachment-cancel',itemType:'points',itemId:'points-9',label:'积分 9',
      mailAnimation:{id:'mail-cancel',scope:'mail-claim',soundCue:'mail-chime',stages:[{kind:'mail-open',durationMs:900}]},
      claimAnimation:{id:'claim-cancel',scope:'item-claim',soundCue:'item-reveal',stages:[{kind:'item-rise',durationMs:900}]},
      displayAnimation:{id:'display-cancel',scope:'item-display',soundCue:'none',stages:[{kind:'slow-showcase',durationMs:900}]}
    });
    await longTask.started;
    await wait(30);
    const cancelled=longTask.cancel('test-cancel');
    const cancelResult=await longTask.finished;
    await wait(20);
    document.getElementById('result').textContent=JSON.stringify({
      ok:true, first, identitySequence, cancelled, cancelResult,
      snapshot:api.snapshot(),
      stageHiddenAfterCancel:!!document.querySelector('.community-reward-stage')?.hidden
    });
  }catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error?.stack||error)});}
})();
</script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  if (['/community-reward-runtime.js','/community-reward-runtime.css','/fe-identity-card.js','/fe-identity-card.css'].includes(url.pathname)) {
    const file = path.join(webRoot, url.pathname.slice(1));
    if (!existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('missing');
      return;
    }
    response.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--autoplay-policy=no-user-gesture-required', '--dump-dom', '--virtual-time-budget=8000',
  `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`
], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let stdout = '';
let stderr = '';
browser.stdout.on('data', (chunk) => { stdout += String(chunk); });
browser.stderr.on('data', (chunk) => { stderr += String(chunk); });
const exitCode = await new Promise((resolve) => browser.once('exit', resolve));
server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));
rmSync(profile, { recursive: true, force: true });
assert.equal(exitCode, 0, stderr);
const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
assert.ok(match, `browser result was not rendered:\n${stdout.slice(-2000)}\n${stderr.slice(-1000)}`);
const result = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
assert.equal(result.ok, true, result.error);
assert.deepEqual(result.first.phaseOrder, ['mail', 'claim', 'display']);
assert.deepEqual(result.first.soundOrder, ['royal-chime', 'noble-metal', 'platinum-ring']);
assert.deepEqual(result.first.ids, ['mail-gold', 'claim-gold', 'display-gold']);
assert.deepEqual(result.first.completed, ['mail', 'claim', 'display']);
assert.equal(result.first.label, '流星金头像框');
assert.equal(result.first.hidden, true);
assert.deepEqual(result.first.networkUrls, []);
assert.equal(result.identitySequence.normalAnnouncementCount, 1, 'ordinary background refresh stopped announcing newly received identity cards');
assert.deepEqual(result.identitySequence.phaseOrder, ['mail', 'claim', 'display']);
assert.deepEqual(result.identitySequence.animationIds, ['mail-open', 'limited-claim', 'limited-display']);
assert.deepEqual(result.identitySequence.unmanagedClaimIds, [], 'mailbox refresh emitted a second unmanaged identity-card claim');
assert.deepEqual(result.identitySequence.entranceIds, ['limited-display'], 'mailbox identity card must open exactly once, using only its display animation');
assert.equal(result.cancelled, true);
assert.equal(result.cancelResult.status, 'cancelled');
assert.equal(result.cancelResult.reason, 'test-cancel');
assert.equal(result.snapshot.active, false);
assert.equal(result.stageHiddenAfterCancel, true);
console.log('Community reward animation browser contract PASS');
