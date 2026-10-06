import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = name => readFileSync(path.join(root, 'web', name), 'utf8');
const html = read('index.html');
const start = html.indexOf('<div class="audio-source-dialog"');
const end = html.indexOf('<section class="pet-assistant"', start);
assert.ok(start >= 0 && end > start);
const managerMarkup = html.slice(start, end);
const require = createRequire(import.meta.url);
let chromium;
for (const name of ['playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { ({ chromium } = require(name)); break; } catch {}
}
assert.ok(chromium, 'bundled browser runtime required');
const fixture = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>
body{margin:0;background:#08141d}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
${read('audio-source-manager.css')}</style>
<section id="neteaseLoginDialog"><button id="audioSourceManagerButton" type="button">音源管理</button></section>
${managerMarkup}<script>${read('audio-source-manager.js')}</script><script>
window.selectionChanges=[];window.browseObservation=null;window.libraryProvider='netease';window.delaySelection='';window.rejectProvider=false;window.testRequestedQuality='128k';
window.libraryProviders=[{id:'netease',label:'网易云',configured:true},{id:'qq',label:'QQ',configured:true},{id:'kugou',label:'酷狗',configured:false},{id:'qishui',label:'汽水',configured:false}];
feAudioSources.configure({getCurrentSong:()=>({provider:'netease',song:{id:'own-track'},quality:testRequestedQuality}),getLibraryContext:()=>({provider:libraryProvider,providers:libraryProviders}),onLibraryProviderChanged:async provider=>{if(rejectProvider)throw new Error('平台切换失败，请重试');libraryProvider=provider;},onSelectionChanged:async source=>{selectionChanges.push(source);if(source?.id===delaySelection)await new Promise(resolve=>{window.finishSelection=resolve;});const available=libraryProviders.filter(item=>item.configured&&source?.supportedProviders?.includes(item.id));if(!available.some(item=>item.id===libraryProvider)&&available.length)libraryProvider=available[0].id;},onBrowseRequested:source=>{browseObservation={closed:document.querySelector('#audioSourceDialog').hidden,focus:document.activeElement.id,loginInert:document.querySelector('#neteaseLoginDialog').inert,provider:libraryProvider,source};}});
</script></html>`;
const requests = [];
let selected = 'builtin';
const sources = [];
let failImport = false;
let failSelect = false;
let initializationError = '';
let failHosts = false;
let testError = 'AUDIO_SOURCE_HOST_NOT_ALLOWED';
let testHttpFailure = false;
let testQualityMetadata = {};
const preview = {token:'fixture-token',name:'<img src=x onerror=alert(1)>',version:'1.0',author:'Self authored',bytes:256,sourceHost:'scripts.example.org',supportedProviders:['netease'],capabilities:{wy:{actions:['musicUrl'],qualitys:['128k']}}};
const initializationPreview = {...preview,token:'initialization-token',initializationRequired:true,status:'awaiting-network-consent',requiredHosts:['www.hibai.cn','<img src=x onerror=alert(2)>','https://private.example.org/path?secret=hidden'],supportedProviders:[],capabilities:{}};
const payload = () => ({ok:true,selected,runtimeReady:true,builtins:[{id:'netease',name:'网易云',status:'ready'}],custom:sources});
const server = createServer(async(req,res)=>{
  const url = new URL(req.url,'http://127.0.0.1');
  const respond = (status,body) => { if (res.destroyed) return; res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body)); };
  if (url.pathname === '/') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fixture);return;}
  let body = ''; for await (const part of req) body += part;
  const input = body ? JSON.parse(body) : null;
  requests.push({path:url.pathname,input});
  if (url.pathname === '/api/audio-sources') respond(200,payload());
  else if (url.pathname === '/api/audio-sources/preview-url') {
    if (input.url.endsWith('slow.js')) setTimeout(()=>respond(200,{ok:true,preview}),350);
    else if (input.url.endsWith('initialization.js')) respond(200,{ok:true,preview:initializationPreview});
    else if (input.url.endsWith('fail.js')) respond(400,{ok:false,error:'AUDIO_SOURCE_DOWNLOAD_REDIRECT'});
    else respond(200,{ok:true,preview});
  } else if (['/api/audio-sources/import-preview','/api/audio-sources/import'].includes(url.pathname)) {
    if (initializationError) { respond(400,{ok:false,error:initializationError,message:'https://private.example.org/path?secret=hidden',stack:'at privateScript:1:1'}); return; }
    if (failImport) { respond(400,{ok:false,error:'AUDIO_SOURCE_STORAGE'}); return; }
    const item = {...preview,id:`source-${sources.length+1}`,allowedHosts:input.allowedHosts};sources.push(item);
    if (input.apply) selected=item.id;
    respond(200,payload());
  } else if (url.pathname === '/api/audio-sources/select') {
    if (failSelect) { respond(400,{ok:false,error:'AUDIO_SOURCE_NOT_FOUND'}); return; }
    selected=input.id;
    respond(200,payload());
  } else if (url.pathname === '/api/audio-sources/test') {
    const item = sources.find(source => source.id === input.id);
    if (testError) respond(testHttpFailure?400:200,{ok:!testHttpFailure,resolved:false,playable:false,error:testError,requiredHosts:['resolver.example.org','<img src=x onerror=alert(1)>','https://private.example.org/?token=hidden','localhost'],message:'https://private.example.org/?token=hidden',...testQualityMetadata});
    else respond(200,{ok:true,resolved:Boolean(item?.allowedHosts.includes('resolver.example.org')),playable:false,...testQualityMetadata});
  } else if (/^\/api\/audio-sources\/source-\d+\/hosts$/.test(url.pathname)) {
    if (failHosts) { respond(400,{ok:false,error:'AUDIO_SOURCE_STORAGE'}); return; }
    const item=sources.find(source=>url.pathname===`/api/audio-sources/${source.id}/hosts`);
    item.allowedHosts=input.allowedHosts;
    respond(200,payload());
  } else if (url.pathname.endsWith('/playlists')) respond(200,{playlists:[{id:'own-list',name:'测试歌单'}]});
  else if (url.pathname.endsWith('/tracks')) respond(200,{songs:[{id:'own-track',title:'自编夹具歌曲'}]});
  else respond(404,{ok:false});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath}:{} )});
  const page=await browser.newPage({viewport:{width:1024,height:900}});
  page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const warnings=[];page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text());});
  const output=path.join(root,'output/playwright/audio-source-manager');mkdirSync(output,{recursive:true});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.click('#audioSourceManagerButton');
  await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  assert.equal(await page.locator('#neteaseLoginDialog').evaluate(el=>el.inert),true);
  await page.fill('#audioSourceHosts','existing.example.org');await page.uncheck('#audioSourceApply');await page.check('#audioSourceConsent');
  const beforeInitializationPreview=requests.length;
  await page.fill('#audioSourceUrl','https://scripts.example.org/initialization.js');await page.click('#audioSourceUrlRead');
  await page.waitForSelector('#audioSourcePreview:not([hidden])');
  assert.match(await page.locator('#audioSourcePreview').innerText(),/脚本需要联网初始化；支持的平台和音质将在确认导入后检测/);
  assert.match(await page.locator('#audioSourcePreview').innerText(),/需确认的联网域名：www\.hibai\.cn/);
  assert.match(await page.locator('#audioSourcePreview').innerText(),/复制.*允许联网/);
  assert.doesNotMatch(await page.locator('#audioSourcePreview').innerText(),/未声明支持的平台|预览只声明播放解析能力|private\.example|secret=hidden/);
  assert.equal(await page.locator('#audioSourcePreview img').count(),0);
  assert.equal(await page.locator('#audioSourcePreview a').count(),0,'initialization hosts are plain text, not navigable links');
  assert.equal(await page.locator('#audioSourceHosts').inputValue(),'existing.example.org');
  assert.equal(await page.locator('#audioSourceApply').isChecked(),false);
  assert.equal(await page.locator('#audioSourceConsent').isChecked(),false);
  assert.equal(requests.length,beforeInitializationPreview+1,'preview itself cannot import or authorize network requests');
  assert.deepEqual(requests.at(-1).input,{url:'https://scripts.example.org/initialization.js'});
  for (const width of [320,1024]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.locator('#audioSourcePanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`pending initialization has no horizontal overflow at ${width}`);
    await page.screenshot({path:path.join(output,`manager-initialization-${width}.png`)});
  }
  await page.click('#audioSourceImportSubmit');
  assert.ok(!requests.some(req=>req.path.endsWith('/import-preview')),'pending initialization still requires explicit consent');
  await page.check('#audioSourceConsent');initializationError='AUDIO_SOURCE_INIT_NETWORK_REQUIRED';
  await page.click('#audioSourceImportSubmit');
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').dataset.kind==='error'&&!document.querySelector('#audioSourceImportSubmit').disabled);
  assert.match(await page.locator('#audioSourceLiveStatus').innerText(),/初始化.*联网.*允许.*域名/);
  assert.doesNotMatch(await page.locator('#audioSourceLiveStatus').innerText(),/private|secret|https:|at /);
  assert.equal(await page.locator('#audioSourcePreview').isVisible(),true);
  assert.equal(await page.locator('#audioSourceHosts').inputValue(),'existing.example.org');
  assert.deepEqual(requests.at(-1).input,{token:'initialization-token',allowedHosts:['existing.example.org'],consent:true,apply:false});
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'builtin');
  initializationError='AUDIO_SOURCE_PREVIEW_EXPIRED';await page.click('#audioSourceImportSubmit');
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('预览已过期或取消'));
  assert.equal(await page.locator('#audioSourceUrlRead').isEnabled(),true);
  initializationError='';await page.click('#audioSourceCancelPreview');
  assert.equal(await page.locator('#audioSourcePreview').isVisible(),false);
  assert.equal(await page.locator('#audioSourceConsent').isChecked(),false);
  assert.equal(await page.locator('#audioSourceHosts').inputValue(),'existing.example.org');
  assert.equal(await page.locator('#audioSourceApply').isChecked(),false);
  await page.check('#audioSourceApply');
  await page.fill('#audioSourceUrl','https://scripts.example.org/slow.js');await page.click('#audioSourceUrlRead');
  assert.equal(await page.locator('#audioSourceCancelPreview').isVisible(),true,'cancel preview must be visible while URL request runs');
  await page.click('#audioSourceCancelPreview');
  await page.fill('#audioSourceUrl','https://scripts.example.org/own.js');await page.click('#audioSourceUrlRead');
  await page.waitForSelector('#audioSourcePreview:not([hidden])');
  assert.equal(await page.locator('#audioSourcePreview img').count(),0);
  assert.match(await page.locator('#audioSourcePreview').innerText(),/网易云：播放解析 · 128k/);
  assert.doesNotMatch(await page.locator('#audioSourcePreview').innerText(),/需要联网初始化/);
  assert.equal(await page.locator('#audioSourceApply').isChecked(),true);
  const beforeOfflineConsent=requests.filter(req=>req.path.endsWith('/import-preview')).length;
  await page.click('#audioSourceImportSubmit');
  assert.equal(requests.filter(req=>req.path.endsWith('/import-preview')).length,beforeOfflineConsent,'unchecked consent cannot submit import');
  await page.fill('#audioSourceHosts','audio.example.org');await page.check('#audioSourceConsent');
  failImport=true;await page.click('#audioSourceImportSubmit');
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('无法安全读写'));
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'builtin');
  assert.equal(await page.locator('#audioSourcePreview').isVisible(),true);
  failImport=false;await page.click('#audioSourceImportSubmit');
  await page.waitForFunction(()=>feAudioSources.getSelectedSource()?.id==='source-1');
  assert.deepEqual(requests.filter(req=>req.path.endsWith('/import-preview')).at(-1).input,{token:'fixture-token',allowedHosts:['audio.example.org'],consent:true,apply:true});
  assert.equal(await page.locator('#audioSourcePreview').isVisible(),false);
  await page.click('#audioSourceBrowse');
  const browse=await page.evaluate(()=>browseObservation);
  assert.equal(browse.closed,true);assert.equal(browse.focus,'audioSourceManagerButton');assert.equal(browse.loginInert,false);assert.equal(browse.source.id,'source-1');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'audioSourceManagerButton');
  await page.click('#audioSourceManagerButton');await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  await page.fill('#audioSourceUrl','not a valid URL');
  await page.setInputFiles('#audioSourceScriptInput',{name:'self-authored.js',mimeType:'text/javascript',buffer:Buffer.from('// own local fixture')});
  await page.fill('#audioSourceHosts','audio.example.org');await page.check('#audioSourceConsent');await page.uncheck('#audioSourceApply');
  await page.click('#audioSourceImportSubmit');
  await page.waitForFunction(()=>document.querySelector('#audioSourceCustomCount').textContent==='2 / 20');
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'source-1','local import-only preserves current source');
  const secondCard=page.locator('.audio-source-card').nth(1);
  const mutationsBeforeRepair=requests.filter(req=>/\/(?:import|import-preview|select)$/.test(req.path)).length;
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('resolver.example.org'));
  assert.match(await secondCard.innerText(),/需确认的联网域名：resolver\.example\.org/);
  assert.doesNotMatch(await secondCard.innerText(),/private|token=hidden|localhost/);
  assert.equal(await secondCard.locator('a,img').count(),0);
  assert.equal(await page.locator('.audio-source-card').first().locator('.audio-source-card-test').count(),0,'diagnostics belong to the tested source');
  const beforeSettings=requests.length;
  await secondCard.getByRole('button',{name:'联网设置',exact:true}).click();
  const hostEditor=secondCard.locator('.audio-source-host-editor');
  const hostsInput=hostEditor.getByRole('textbox',{name:'允许联网的精确域名'});
  const hostConsent=hostEditor.getByRole('checkbox');
  assert.equal(await hostsInput.inputValue(),'audio.example.org','only existing approvals are prefilled');
  assert.equal(await hostConsent.isChecked(),false,'opening existing hosts needs fresh consent');
  assert.equal(requests.length,beforeSettings,'opening settings must not save or grant access');
  await hostEditor.getByRole('button',{name:'保存联网设置'}).click();
  assert.equal(requests.length,beforeSettings,'unchecked consent must not save');
  await hostConsent.check();await hostsInput.fill('*.example.org');
  assert.equal(await hostConsent.isChecked(),false,'editing domains invalidates earlier consent');
  await hostConsent.check();await hostEditor.getByRole('button',{name:'保存联网设置'}).click();
  assert.equal(requests.length,beforeSettings,'invalid domains must not reach backend');
  await hostsInput.fill('audio.example.org\nresolver.example.org');await hostConsent.check();
  for (const width of [320,1024]) {
    await page.setViewportSize({width,height:900});
    await hostEditor.scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#audioSourcePanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`host editor has no horizontal overflow at ${width}`);
    assert.ok(await hostEditor.evaluate(el=>el.scrollWidth<=el.clientWidth+1),`host fields have no horizontal overflow at ${width}`);
    await page.screenshot({path:path.join(output,`manager-host-settings-${width}.png`)});
  }
  failHosts=true;await hostEditor.getByRole('button',{name:'保存联网设置'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('无法安全读写'));
  assert.equal(await hostsInput.inputValue(),'audio.example.org\nresolver.example.org','failed save preserves reviewable draft');
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'source-1');
  failHosts=false;await hostEditor.getByRole('button',{name:'保存联网设置'}).click();
  await page.waitForFunction(()=>!document.querySelector('.audio-source-host-editor'));
  assert.deepEqual(requests.filter(req=>req.path.endsWith('/hosts')).at(-1).input,{allowedHosts:['audio.example.org','resolver.example.org'],consent:true});
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'source-1','editing a different source never changes selection');
  assert.equal(requests.filter(req=>/\/(?:import|import-preview|select)$/.test(req.path)).length,mutationsBeforeRepair,'host repair never reimports or selects');
  assert.doesNotMatch(await secondCard.innerText(),/需确认的联网域名/,'old failed test is cleared after permission changes');
  assert.match(await secondCard.innerText(),/重新检测/,'changed hosts do not imply a successful parse');
  testError='';await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('已解析'));
  assert.match(await secondCard.locator('.audio-source-card-test').innerText(),/已解析.*未确认可播放/);
  await page.evaluate(()=>{testRequestedQuality='lossless';});
  testQualityMetadata={requestedQuality:'lossless',effectiveQuality:'standard',qualityFallback:true};
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('调整为 128k'));
  assert.match(await secondCard.locator('.audio-source-card-test').innerText(),/调整为 128k.*已解析.*未确认可播放/);
  assert.deepEqual(requests.filter(request=>request.path.endsWith('/test')).at(-1).input,{id:'source-2',provider:'netease',song:{id:'own-track'},quality:'lossless'},'test sends the original preference to the tested source for server negotiation');
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'source-1','testing a different source cannot change selection');
  testError='AUDIO_SOURCE_NETWORK_TIMEOUT';
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceDialog').getAttribute('aria-busy')==='false');
  assert.match(await secondCard.locator('.audio-source-card-test').innerText(),/调整为 128k.*解析检测未通过/,'quality fallback must not conceal a subsequent network error');
  testError='';testQualityMetadata={requestedQuality:'lossless',effectiveQuality:'<img src=x onerror=alert(9)>',qualityFallback:true};
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceDialog').getAttribute('aria-busy')==='false');
  assert.doesNotMatch(await secondCard.locator('.audio-source-card-test').innerText(),/调整为|onerror|<img/,'only recognized quality labels may be shown');
  assert.equal(await secondCard.locator('img').count(),0);
  testQualityMetadata={};await page.evaluate(()=>{testRequestedQuality='128k';});
  testError='AUDIO_SOURCE_HTTP_ERROR';testQualityMetadata={httpStatus:502};
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceDialog').getAttribute('aria-busy')==='false');
  assert.match(await secondCard.locator('.audio-source-card-test').innerText(),/音源服务器.*HTTP 502/,'upstream HTTP failure is distinct from a local network failure');
  assert.doesNotMatch(await secondCard.innerText(),/private|token=hidden|需确认的联网域名/,'server errors cannot suggest changing host permissions or expose upstream details');
  for (const invalidStatus of ['502','https://private.example.org/?token=hidden',700,502.5]) {
    testQualityMetadata={httpStatus:invalidStatus};
    await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
    await page.waitForFunction(()=>document.querySelector('#audioSourceDialog').getAttribute('aria-busy')==='false');
    assert.doesNotMatch(await secondCard.locator('.audio-source-card-test').innerText(),/HTTP [0-9]|private|token=hidden/,'only bounded numeric HTTP status codes are displayed');
  }
  testQualityMetadata={};
  for (const code of ['AUDIO_SOURCE_NETWORK_TIMEOUT','AUDIO_SOURCE_NETWORK_FAILED','AUDIO_SOURCE_REQUEST_UNSUPPORTED','AUDIO_SOURCE_RESPONSE_UNSUPPORTED','AUDIO_SOURCE_REDIRECT_BLOCKED','AUDIO_SOURCE_REJECTED']) {
    testError=code;await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
    await page.waitForFunction(()=>document.querySelector('#audioSourceDialog').getAttribute('aria-busy')==='false');
    assert.doesNotMatch(await secondCard.locator('.audio-source-card-test').innerText(),/AUDIO_SOURCE|private|token|resolver\.example|音源服务拒绝/);
  }
  testHttpFailure=true;testError='AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED';
  await secondCard.getByRole('button',{name:'检测当前歌曲'}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('音频 CDN'));
  assert.match(await secondCard.innerText(),/需确认的联网域名：resolver\.example\.org/,'HTTP failures also retain safe host suggestions');
  assert.doesNotMatch(await secondCard.innerText(),/private|token=hidden|localhost/);
  await secondCard.getByRole('button',{name:'联网设置',exact:true}).click();
  assert.equal(await hostConsent.isChecked(),false,'each reopening resets consent');
  await hostsInput.fill('unsaved.example.org');
  const beforeCancel=requests.length;
  await hostEditor.getByRole('button',{name:'取消'}).click();
  assert.equal(requests.length,beforeCancel,'cancel is local only');
  await secondCard.getByRole('button',{name:'联网设置',exact:true}).click();
  assert.equal(await hostsInput.inputValue(),'audio.example.org\nresolver.example.org','cancel discards the local draft');
  await hostEditor.getByRole('button',{name:'取消'}).click();
  for (const width of [320,640,1024,1440]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.locator('#audioSourcePanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`panel has no horizontal overflow at ${width}`);
    if(width===320||width===1024) await page.screenshot({path:path.join(output,`manager-${width}.png`)});
  }
  assert.deepEqual(await page.locator('#audioSourceLibraryProvider option').evaluateAll(items=>items.map(item=>item.value)),['netease'],'custom source only exposes supported providers');
  sources[1].supportedProviders=['qq','kugou'];
  sources[1].capabilities={tx:{actions:['musicUrl'],qualitys:['128k']},kg:{actions:['musicUrl'],qualitys:['128k']}};
  await page.evaluate(()=>feAudioSources.refresh());
  failSelect=true;
  await secondCard.getByRole('button',{name:'使用此音源',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('该音源不存在或已被移除'));
  assert.equal(await page.locator('#audioSourceDialog').isVisible(),true,'failed selection preserves the manager and old source');
  assert.equal(await page.evaluate(()=>feAudioSources.getSelectedSource().id),'source-1');
  assert.equal(await page.locator('#audioSourceLibraryProvider').inputValue(),'netease');
  failSelect=false;
  await page.evaluate(()=>{delaySelection='source-2';browseObservation=null;});
  await secondCard.getByRole('button',{name:'使用此音源',exact:true}).click();
  await page.waitForFunction(()=>typeof finishSelection==='function');
  assert.equal(await page.locator('#audioSourceDialog').isVisible(),true,'source selection waits for the app provider transition before browsing');
  assert.equal(await page.locator('#audioSourceLibraryProvider').isEnabled(),false,'provider selection is locked during the source transition');
  assert.equal(await page.evaluate(()=>browseObservation),null);
  await page.evaluate(()=>{delaySelection='';finishSelection();});
  await page.waitForFunction(()=>browseObservation?.source.id==='source-2');
  assert.equal(await page.evaluate(()=>browseObservation.provider),'qq','browse observes the completed source provider fallback');
  assert.equal(await page.evaluate(()=>browseObservation.closed),true);
  assert.equal(await page.evaluate(()=>browseObservation.loginInert),false);
  await page.click('#audioSourceManagerButton');
  await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  assert.deepEqual(await page.locator('#audioSourceLibraryProvider option').evaluateAll(items=>items.map(item=>({id:item.value,disabled:item.disabled}))),[{id:'qq',disabled:false},{id:'kugou',disabled:true}]);
  assert.match(await page.locator('#audioSourceLibraryProvider').innerText(),/酷狗（未配置）/);
  const beforeSelectedBrowse=requests.filter(request=>request.path.endsWith('/select')).length;
  await secondCard.getByRole('button',{name:'正在使用',exact:true}).click();
  assert.equal(await page.locator('#audioSourceDialog').isVisible(),false);
  assert.equal(requests.filter(request=>request.path.endsWith('/select')).length,beforeSelectedBrowse,'browsing the selected source never reselects it');
  await page.click('#audioSourceManagerButton');await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  await page.click('#audioSourceSelectBuiltin');
  await page.waitForFunction(()=>browseObservation?.source.id==='builtin');
  assert.equal(await page.locator('#audioSourceDialog').isVisible(),false,'using builtins also browses immediately');
  await page.click('#audioSourceManagerButton');await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  assert.equal(await page.locator('#audioSourceLibraryProvider option').count(),4);
  await page.evaluate(()=>{rejectProvider=true;});
  await page.selectOption('#audioSourceLibraryProvider','netease');
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent.includes('平台切换失败'));
  assert.equal(await page.locator('#audioSourceLibraryProvider').inputValue(),'qq','failed provider changes restore the actual app value');
  await page.evaluate(()=>{rejectProvider=false;});
  await page.selectOption('#audioSourceLibraryProvider','netease');
  await page.waitForFunction(()=>document.querySelector('#audioSourceLiveStatus').textContent==='歌单平台已切换。');
  assert.equal(await page.evaluate(()=>libraryProvider),'netease');
  await page.evaluate(()=>{delaySelection='source-2';finishSelection=null;browseObservation=null;});
  await secondCard.getByRole('button',{name:'使用此音源',exact:true}).click();
  await page.waitForFunction(()=>typeof finishSelection==='function');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#audioSourceDialog').isVisible(),false);
  await page.evaluate(async()=>{delaySelection='';finishSelection();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await page.evaluate(()=>browseObservation),null,'closing during a selection transition cancels its pending browse');
  await page.click('#audioSourceManagerButton');await page.waitForFunction(()=>!document.querySelector('#audioSourceUrlRead').disabled);
  assert.equal(await page.locator('#audioSourceDialog').getAttribute('aria-busy'),'false','closing during a transition must not leave the manager locked');
  assert.equal(await page.locator('#audioSourceLibraryProvider').inputValue(),'qq');
  await page.evaluate(()=>{libraryProviders.forEach(provider=>{provider.configured=false;});return feAudioSources.refresh();});
  assert.equal(await page.locator('#audioSourceLibraryProvider').isEnabled(),false);
  assert.match(await page.locator('#audioSourceLibraryStatus').innerText(),/暂无已配置.*目录服务/);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'audioSourceManagerButton');
  assert.deepEqual(errors,[]);
  assert.deepEqual(warnings,[]);
  console.log('PASS manager browser: direct source use/failure/retry, awaited provider fallback, supported/configured provider switching, selected-source browse, empty catalog state, network initialization preview, explicit hosts/consent, per-source missing-host diagnosis, quality fallback success/failure/label safety, manual host repair/failure/retry/cancel, fixed network errors, expiry/retry, inert metadata, browse callback close/focus order, narrow layouts, no page errors');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
