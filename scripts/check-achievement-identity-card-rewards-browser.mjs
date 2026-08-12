import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, 'tmp', `.achievement-card-rewards-${process.pid}`);
assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
const production = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
function extract(startMarker, endMarker) {
  const start = production.indexOf(startMarker);
  const end = production.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `production markup is missing: ${startMarker}`);
  return production.slice(start, end);
}
const identityTrigger = extract('<button class="community-identity-card-trigger"', '<button class="community-broadcast-button"');
const identityDialog = extract('<section class="fe-identity-card-dialog"', '<section class="update-dialog"');

const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/pixel-adventure.css">
<link rel="stylesheet" href="/fe-identity-card.css">
<style>html,body{margin:0;min-height:100%;background:#0f1115;color:white}.community-profile-panel{width:min(1080px,calc(100vw - 48px));margin:24px}.community-profile-page{display:grid}.community-card{position:fixed;left:8px;bottom:8px}.community-card__head,.community-profile{display:grid}</style>
</head><body>
<section class="community-profile-panel is-achievement-page" id="communityProfilePanel" data-achievement-page-theme="void">
  <div class="community-profile-page community-achievement-page" id="communityProfileAchievementPage">
    <div class="community-achievement-head"><span><strong>冒险成就</strong><small id="communityAchievementMeta">正在同步</small></span></div>
    <div class="community-achievement-grid" id="communityAchievementGrid" role="group" aria-label="成就路径" aria-live="polite"></div>
  </div>
</section>
<section class="community-card"><div class="community-card__head"><span class="community-avatar">FE</span><span class="community-profile"><strong id="communityName"><span>星潮</span></strong></span>${identityTrigger}</div><strong id="communityFeId">12345678</strong></section>
${identityDialog}
<aside class="achievement-toast" id="achievementToast" hidden><canvas id="achievementToastIcon"></canvas><span><strong id="achievementToastName"></strong></span></aside>
<script>
localStorage.setItem('fe-monster-active-provider-v1','qq');
window.__requests=[];
window.__identityOwned=['classic'];
const emptyState={version:2,progress:{},unlocked:{},themes:{page:'void',toast:'classic'},settings:{soundEnabled:false},ornaments:{claimed:{},equipped:{achievementId:null,changedAt:0}},_sync:{provider:'qq',scope:'qq:music-user-7',serverSynced:true}};
const reward=(achievementId,identityCard)=>({achievementId,identityCard});
const classicCard={id:'classic',label:'经典黄金',material:'polished-gold',finish:'polished',primaryColor:'#D79A24',secondaryColor:'#6A3308',accentColor:'#FFF1A8',borderColor:'#FFF1A8',nicknameEditable:true};
const platinumCard={id:'platinum-echo',label:'铂金回声',material:'silver',finish:'mirror',primaryColor:'#DCE7F1',secondaryColor:'#536477',accentColor:'#FFFFFF',borderColor:'#BDE8FF',issuedByServer:true,nicknameEditable:false,nicknamePolicy:'locked',engravedNickname:'百曲回声'};
const identityState=()=>({ok:true,feId:'12345678',nickname:'星潮',equippedId:'classic',owned:window.__identityOwned.map((id)=>id==='classic'?classicCard:platinumCard)});
window.__challengePayload={ok:true,state:emptyState,challenges:[
  {id:'marathon-listener',title:'声海马拉松',description:'累计聆听六十小时，由服务器按真实播放时长核验。',tier:'mythic',serverVerified:true,progress:{current:72000,target:216000,unit:'seconds'},eligible:false,claimed:false},
  {id:'track-centurion',title:'五百首不跳站',description:'完整播放五百首不同歌曲。',tier:'legendary',serverVerified:true,progress:{current:500,target:500,unit:'tracks'},eligible:true,claimed:false},
  {id:'social-constellation',title:'社交星图',description:'完成二百次社区互动。',tier:'epic',serverVerified:true,progress:{current:80,target:200,unit:'interactions'},eligible:false,claimed:false},
  {id:'lyric-archivist',title:'歌词典藏家',description:'完成一百次有效歌词校准。',tier:'legendary',serverVerified:true,progress:{current:32,target:100,unit:'calibrations'},eligible:false,claimed:false},
  {id:'night-owl-legend',title:'午夜传说',description:'深夜完整播放一百首歌曲。',tier:'mythic',serverVerified:true,progress:{current:12,target:100,unit:'tracks'},eligible:false,claimed:false},
  {id:'master-collector',title:'身份卡主宰',description:'领取前五张高难度身份卡。',tier:'mythic',serverVerified:true,progress:{current:1,target:5,unit:'cards'},eligible:false,claimed:false}
],identityCardRewards:[
  reward('marathon-listener',{id:'aurora-velocity',label:'极光流速',material:'titanium',finish:'brushed',primaryColor:'#4AA8D8',secondaryColor:'#132E4D',accentColor:'#C9F7FF',borderColor:'#80E8FF',issuedByServer:true,nicknameEditable:false,engravedNickname:'极光行者'}),
  reward('track-centurion',platinumCard),
  reward('social-constellation',{id:'nebula-covenant',label:'星云盟约',material:'rose-gold',finish:'hammered',primaryColor:'#92526D',secondaryColor:'#261927',accentColor:'#FFD388'}),
  reward('lyric-archivist',{id:'rose-script',label:'玫瑰谱页',material:'rose-gold',finish:'satin',primaryColor:'#B76D81',secondaryColor:'#39223B',accentColor:'#FFE0C2'}),
  reward('night-owl-legend',{id:'obsidian-midnight',label:'黑曜午夜',material:'obsidian',finish:'mirror',primaryColor:'#111522',secondaryColor:'#020307',accentColor:'#8CAFFF'}),
  reward('master-collector',{id:'prismatic-sovereign',label:'棱镜君主',material:'ceramic',finish:'satin',primaryColor:'#D8D7E2',secondaryColor:'#4E3868',accentColor:'#A2FAFF'})
]};
window.fetch=async(url,options={})=>{
  const href=String(url); const method=options.method||'GET'; const body=options.body?JSON.parse(options.body):null;
  window.__requests.push({href,method,body});
  if(href.includes('/api/app/machine')) return {ok:true,status:200,json:async()=>({computerId:'computer-achievement-7'})};
  if(href.includes('/api/community/achievements/claim')) {
    const challenge=window.__challengePayload.challenges.find((item)=>item.id===body.achievementId);
    if(!challenge.eligible) return {ok:false,status:409,json:async()=>({ok:false,error:'尚未达成'})};
    challenge.claimed=true; challenge.claimedAt=1786586400000; window.__identityOwned=['classic','platinum-echo'];
    return {ok:true,status:200,json:async()=>({ok:true,duplicate:false,challenge:structuredClone(challenge),reward:reward(challenge.id,platinumCard),identityCards:identityState()})};
  }
  if(href.includes('/api/community/identity-cards')) return {ok:true,status:200,json:async()=>structuredClone(identityState())};
  if(href.includes('/api/community/achievements')) return {ok:true,status:200,json:async()=>structuredClone(window.__challengePayload)};
  return {ok:true,status:200,json:async()=>structuredClone(emptyState)};
};
</script>
<script src="/fe-identity-card.js"></script>
<script src="/pixel-achievements.js"></script>
<pre id="result">pending</pre>
<script>
(async()=>{try{
  const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  for(let i=0;i<100&&!document.querySelector('[data-achievement-challenge-id]');i+=1) await wait(25);
  const nodes=[...document.querySelectorAll('[data-achievement-challenge-id]')];
  const before=nodes.map((node)=>({
    id:node.dataset.achievementChallengeId,
    tier:node.querySelector('.achievement-challenge-tier')?.textContent||'',
    verified:node.querySelector('.achievement-challenge-verified')?.textContent||'',
    progressText:node.querySelector('.achievement-challenge-progress-copy')?.textContent||'',
    value:Number(node.querySelector('progress')?.value),max:Number(node.querySelector('progress')?.max),
    rewardName:node.querySelector('.achievement-card-reward-name')?.textContent||'',
    rewardMaterial:node.querySelector('.achievement-card-reward-preview')?.dataset.material||'',
    rewardFinish:node.querySelector('.achievement-card-reward-preview')?.dataset.finish||'',
    rewardPrimary:node.querySelector('.achievement-card-reward-preview')?.style.getPropertyValue('--reward-card-primary')||'',
    buttonText:node.querySelector('.achievement-challenge-claim')?.textContent||'',
    buttonDisabled:node.querySelector('.achievement-challenge-claim')?.disabled
  }));
  nodes.find((node)=>node.dataset.achievementChallengeId==='marathon-listener').querySelector('.achievement-challenge-claim').click();
  nodes.find((node)=>node.dataset.achievementChallengeId==='track-centurion').querySelector('.achievement-challenge-claim').click();
  for(let i=0;i<100&&window.FeMonsterIdentityCard.snapshot().cards.length<2;i+=1) await wait(25);
  await wait(80);
  const claimedNode=document.querySelector('[data-achievement-challenge-id="track-centurion"]');
  claimedNode.querySelector('.achievement-challenge-claim').click();
  await wait(30);
  const identity=window.FeMonsterIdentityCard.snapshot();
  const lockedCard=identity.cards.find((card)=>card.id==='platinum-echo');
  document.getElementById('communityIdentityCardButton').click();
  await wait(20);
  document.getElementById('result').textContent=JSON.stringify({ok:true,cards:before,claim:{
    buttonText:claimedNode.querySelector('.achievement-challenge-claim').textContent,
    buttonDisabled:claimedNode.querySelector('.achievement-challenge-claim').disabled,
    claimPosts:window.__requests.filter((request)=>request.href.includes('/achievements/claim')).length,
    claimBody:window.__requests.find((request)=>request.href.includes('/achievements/claim'))?.body,
    identityCardIds:identity.cards.map((card)=>card.id),
    pickerCardIds:[...document.querySelectorAll('[data-identity-card-id]')].map((node)=>node.dataset.identityCardId),
    pickerOpen:document.getElementById('communityIdentityCardMenu').hidden===false,
    lockedNicknameEditable:lockedCard?.nicknameEditable,
    lockedNicknamePolicy:lockedCard?.nicknamePolicy,
    lockedEngraving:lockedCard?.engravedNickname,
    dialogOpen:identity.open
  },requests:window.__requests});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error?.stack||error)});}})();
</script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  if (['/pixel-adventure.css', '/pixel-achievements.js', '/fe-identity-card.css', '/fe-identity-card.js'].includes(url.pathname)) {
    const file = path.join(webRoot, url.pathname.slice(1));
    response.writeHead(200, {
      'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(readFileSync(file));
    return;
  }
  response.writeHead(404); response.end('not found');
});

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
mkdirSync(profile, { recursive: true });
const browser = spawn(edge, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--dump-dom',
  '--virtual-time-budget=7000', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`
], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let stdout=''; let stderr='';
browser.stdout.on('data',(chunk)=>{stdout+=String(chunk);});
browser.stderr.on('data',(chunk)=>{stderr+=String(chunk);});
const exitCode=await new Promise((resolve)=>browser.once('exit',resolve));
server.closeAllConnections?.(); await new Promise((resolve)=>server.close(resolve));
rmSync(profile,{recursive:true,force:true});
assert.equal(exitCode,0,stderr);
const match=stdout.match(/<pre id="result">([^<]+)<\/pre>/);
assert.ok(match,`browser result was not rendered:\n${stdout.slice(-2000)}\n${stderr.slice(-1000)}`);
const result=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
assert.equal(result.ok,true,result.error);
assert.equal(result.cards.length,6,'the generic high-difficulty achievement rail did not render all six server challenges');
assert.deepEqual(result.cards[0],{
  id:'marathon-listener',tier:'神话难度',verified:'服务器核验',progressText:'20 小时 / 60 小时',value:72000,max:216000,
  rewardName:'极光流速',rewardMaterial:'titanium',rewardFinish:'brushed',rewardPrimary:'#4AA8D8',buttonText:'尚未达成',buttonDisabled:true
});
assert.deepEqual(result.cards[1],{
  id:'track-centurion',tier:'传奇难度',verified:'服务器核验',progressText:'500 首 / 500 首',value:500,max:500,
  rewardName:'铂金回声',rewardMaterial:'silver',rewardFinish:'mirror',rewardPrimary:'#DCE7F1',buttonText:'领取身份卡',buttonDisabled:false
});
assert.deepEqual(result.cards.slice(2).map((card)=>card.id),[
  'social-constellation','lyric-archivist','night-owl-legend','master-collector'
]);
assert.ok(result.requests.some(({href,method})=>href.includes('/api/community/achievements')&&method==='GET'),
  'the client never loaded server-authoritative achievement challenges');
assert.equal(result.claim.buttonText,'已领取');
assert.equal(result.claim.buttonDisabled,true);
assert.equal(result.claim.claimPosts,1,'a high-difficulty reward was claimed more than once');
assert.deepEqual(result.claim.claimBody,{
  feId:'12345678',achievementId:'track-centurion',computerId:'computer-achievement-7',computerIdSource:'app-machine'
});
assert.deepEqual(result.claim.identityCardIds,['classic','platinum-echo']);
assert.ok(result.claim.pickerCardIds.includes('platinum-echo'),'claimed card did not appear in the community card picker');
assert.equal(result.claim.pickerOpen,true,'single-clicking 换卡 did not open the updated card list');
assert.equal(result.claim.lockedNicknameEditable,false);
assert.equal(result.claim.lockedNicknamePolicy,'locked');
assert.equal(result.claim.lockedEngraving,'百曲回声');
assert.equal(result.claim.dialogOpen,true,'claimed identity card did not open for immediate display');
console.log('Achievement identity-card reward browser contract PASS');
