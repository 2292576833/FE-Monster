import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..'),source=readFileSync(path.join(root,'web/app.js'),'utf8');
const baseline=process.argv.includes('--baseline'),out=path.join(root,'output/audio-discontinuity');
mkdirSync(out,{recursive:true});
function extract(name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);
  const signatureEnd=source.indexOf(') {',start),bodyStart=source.indexOf('{',signatureEnd);
  let depth=0;
  for(let i=bodyStart;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(source.slice(start-6,start)==='async '?start-6:start,i+1);}
  throw new Error(`Missing ${name}`);
}
const names=['recycleNativeSpatialBlock','discardNativeSpatialBlocks','enqueueNativeSpatialBlock','pumpNativeSpatialBlocks','beginNativeSpatialTimelineTransition'];
let releaseFirst;const firstGate=new Promise(resolve=>{releaseFirst=resolve;}),sent=[],recycled=[],transitions=[];
const ids=new WeakMap();
const context=vm.createContext({AbortController,DOMException,Float32Array,Number,Math,URLSearchParams,performance,Promise,
  GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES:4096,GOOGLE_OBR_NATIVE_MAX_PENDING_BLOCKS:4,GOOGLE_OBR_NATIVE_UPLOAD_RETRY_DELAYS:[20,50],GOOGLE_OBR_NATIVE_UPLOAD_TIMEOUT_MS:750,
  window:{setTimeout,clearTimeout},state:{obrSpatialAudio:{requested:true}},
  safeText:(value,fallback)=>String(value||fallback),setAudioParamSmoothly(){},setAudioParamEqualPower(){},
  resetNativeSpatialTimeline:async graph=>{transitions.push(graph.timelineResetReason);return true;},
  failGoogleObr:error=>{throw error;},
  fetch:async(url,options)=>{const sequence=Number(new URL(url,'http://local').searchParams.get('sequence'));sent.push({id:ids.get(options.body),generation:graph.generation,first:options.body[0],last:options.body.at(-2)});if(sent.length===1)await firstGate;return{ok:true,json:async()=>({ok:true,sequence})};}
});
vm.runInContext(`${names.map(extract).join('\n')}\nglobalThis.api={enqueueNativeSpatialBlock,pumpNativeSpatialBlocks};`,context);
const graph={disposed:false,nativeStream:true,session:11,generation:7,captureTimelineEpoch:1,appliedTimelineEpoch:1,context:{currentTime:0,sampleRate:48000},streamAbort:new AbortController(),blockQueue:[],blockUploadActive:false,nextBlockSequence:0,uploadedBlocks:0,transportDroppedBlocks:0,transportSeekDiscardedBlocks:0,transportRetryAttempts:0,transportRecoveredBlocks:0,transportRecoveryCount:0,poolStarvedFrames:0,node:{port:{postMessage:message=>recycled.push(message.type)}}};
context.state.obrSpatialAudio.graph=graph;
for(let block=0;block<6;block++){
  const pcm=new Float32Array(4096*2);
  for(let frame=0;frame<4096;frame++)pcm[frame*2]=pcm[frame*2+1]=.8*Math.sin(2*Math.PI*440*(block*4096+frame)/48000+.7);
  ids.set(pcm,block);context.api.enqueueNativeSpatialBlock(graph,pcm,{bufferId:block,poolEpoch:1,timelineEpoch:1});
}
releaseFirst();
for(let i=0;i<20&&graph.blockUploadActive;i++)await new Promise(resolve=>setTimeout(resolve,1));
const seams=sent.slice(1).map((block,i)=>({from:sent[i].id,to:block.id,delta:Math.abs(block.first-sent[i].last)}));
const queue={sent:sent.map(({id,generation})=>({id,generation})),seams,transitions,epoch:graph.captureTimelineEpoch,dropped:graph.transportDroppedBlocks,recoveryCount:graph.transportRecoveryCount};

// Counters remain cumulative for diagnostics; only new loss after the reset
// baseline may reject preroll/health in the replacement timeline.
const healthyStatus={active:true,session:11,generation:8,voiceStarted:true,buffersQueued:24,spatialRevisionCommitted:true,spatialActiveRevision:0,mixerProcessCalls:1,queueUnderruns:0};
const healthFailures=[];
const healthContext=vm.createContext({Number,Math,Promise,performance,window:{setTimeout,clearTimeout},document:{hidden:false},
  GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES:4096,GOOGLE_OBR_NATIVE_RENDER_FRAMES:256,GOOGLE_OBR_NATIVE_REQUEST_TIMEOUT_MS:2000,GOOGLE_OBR_NATIVE_UNDERRUN_FAILURE_THRESHOLD:3,
  apiJson:async()=>healthyStatus,updateNativeGoogleObrMetrics(){},failGoogleObr:error=>healthFailures.push(error.message),state:{obrSpatialAudio:{requested:true,enabled:true}}
});
vm.runInContext(`${extract('waitForNativeGoogleObrPreroll')}\n${extract('refreshNativeGoogleObrHealth')}`,healthContext);
const recovered={nativeStream:true,disposed:false,session:11,generation:8,captureTimelineEpoch:2,transportDroppedBlocks:5,timelineDroppedBlocksBaseline:5,poolStarvedFrames:128,timelineStarvedFramesBaseline:128,mixerControlRevision:0};
healthContext.state.obrSpatialAudio.graph=recovered;
if(!baseline){
  await healthContext.waitForNativeGoogleObrPreroll(recovered,2);await healthContext.refreshNativeGoogleObrHealth();
  assert.deepEqual(healthFailures,[],'completed recovery must not be rejected by historical loss counters');
  recovered.transportDroppedBlocks++;
  await assert.rejects(healthContext.waitForNativeGoogleObrPreroll(recovered,2),/丢失 1 块/);
  await healthContext.refreshNativeGoogleObrHealth();assert.equal(healthFailures.length,1,'new loss remains observable');
}

const lifecycle=[];
if(!baseline){
  for(const status of ['running','suspended','closed']){
    const scheduled=[],disconnected=[],calls=[];
    const param=value=>({value,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},linearRampToValueAtTime(value){calls.push(value);this.value=value;}});
    const sharedDry={gain:param(0)},context={state:status,currentTime:0};
    const makeGraph=()=>({nativeStream:false,context,dryGain:sharedDry,wetGain:{gain:param(1)},ready:true,connected:true,node:{port:{postMessage(){},close(){}}}});
    const old=makeGraph(),state={obrSpatialAudio:{graph:old}};
    const f=vm.createContext({Promise,Number,Math,state,window:{clearTimeout(){},setTimeout(callback){scheduled.push(callback);}},disconnectOfficialGoogleObrGraph:graph=>{graph.connected=false;disconnected.push(graph);}});
    vm.runInContext(`${extract('setAudioParamSmoothly')}\n${extract('disposeOfficialGoogleObrGraph')}`,f);
    const disposing=f.disposeOfficialGoogleObrGraph(old);
    assert.equal(f.disposeOfficialGoogleObrGraph(old),disposing,'repeat disposal is idempotent');
    if(status==='running')assert.equal(old.connected,true,'wet audio remains connected during its fade');
    else assert.equal(old.connected,false,'inaudible contexts release immediately');
    const replacement=makeGraph();state.obrSpatialAudio.graph=replacement;sharedDry.gain.value=.25;
    scheduled.splice(0).forEach(callback=>callback());await disposing;
    assert.deepEqual(disconnected,[old]);assert.equal(replacement.connected,true);assert.equal(sharedDry.gain.value,.25,'old cleanup must not alter a replacement graph');
    const stale=makeGraph(),staleDisposing=f.disposeOfficialGoogleObrGraph(stale);
    scheduled.splice(0).forEach(callback=>callback());
    await staleDisposing;
    assert.equal(sharedDry.gain.value,.25,'disposing a stale graph must not restore shared dry output');
    lifecycle.push({status,preciseOldCleanup:true,repeatDisposal:true,sharedDryUnaffected:true});
  }
}

const require=createRequire(import.meta.url);let chromium;
for(const p of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{({chromium}=require(p));break;}catch{}}
assert.ok(chromium);let browser;
try{
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  const page=await browser.newPage();
  const gain=await page.evaluate(async sources=>{
    const results=[];
    for(const signal of ['constant','sine']){
      const context=new OfflineAudioContext(1,24000,48000),buffer=context.createBuffer(1,24000,48000),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=signal==='constant'?.8:.8*Math.sin(2*Math.PI*440*i/48000+.7);
      const source=context.createBufferSource(),dry=context.createGain(),wet=context.createGain();source.buffer=buffer;dry.gain.value=0;wet.gain.value=0;source.connect(dry);dry.connect(context.destination);source.start();
      const state={obrSpatialAudio:{graph:null}},events=[];
      // Offline rendering is deliberately suspended at an exact sample so the
      // command is deterministic; model the production context as running.
      const runningContext={get currentTime(){return context.currentTime;},state:'running',sampleRate:context.sampleRate};
      // Native dual-route disposal is covered by check-native-spatial-handoff;
      // this isolated waveform probe verifies the browser wet/dry release edge.
      const graph={nativeStream:false,context:runningContext,dryGain:dry,wetGain:wet,disposed:false,blockQueue:[],node:{port:{postMessage(){},close(){}}},streamAbort:new AbortController(),session:1,generation:1};state.obrSpatialAudio.graph=graph;
      const dispose=new Function('state','window','nativeSpatialRequest','discardNativeSpatialBlocks','disconnectOfficialGoogleObrGraph',`${sources.smooth}\n${sources.equal}\n${sources.dispose}\nreturn disposeOfficialGoogleObrGraph;`)(state,window,async()=>({ok:true}),()=>{},()=>{events.push({event:'disconnect',at:context.currentTime});});
      const paused=context.suspend(.2),rendered=context.startRendering();await paused;
      const cutFrame=Math.round(context.currentTime*context.sampleRate);const disposing=dispose(graph);await context.resume();
      const output=(await rendered).getChannelData(0);await disposing;
      let maxDelta=0;for(let i=cutFrame;i<cutFrame+2500;i++)maxDelta=Math.max(maxDelta,Math.abs(output[i]-output[i-1]));
      results.push({signal,cutFrame,first:output[cutFrame],maxDelta,expectedSineStep:.8*2*Math.sin(Math.PI*440/48000),events});
    }
    return results;
  },{smooth:extract('setAudioParamSmoothly'),equal:extract('setAudioParamEqualPower'),dispose:extract('disposeOfficialGoogleObrGraph')});
  const result={baseline,queue,gain,lifecycle,recoveryCountersChecked:!baseline};writeFileSync(path.join(out,baseline?'before.json':'after.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  if(!baseline){
    assert.deepEqual(queue.transitions,['transport-overflow'],'overflow must rotate the native generation instead of splicing across lost PCM');
    assert.equal(queue.epoch,2);assert.equal(queue.recoveryCount,1);
    assert.ok(queue.seams.every(seam=>seam.to===seam.from+1),'one generation must never contain missing-block seams');
    for(const row of gain)assert.ok(row.maxDelta<(row.signal==='constant'?.01:row.expectedSineStep*1.1),`${row.signal}: disposal must not create a hard gain edge (${row.maxDelta})`);
  }
}finally{await browser?.close();}
