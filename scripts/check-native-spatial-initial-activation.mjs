import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const extract=name=>source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function fixture(){
  let now=0,nextTimer=0;const timers=new Map(),failures=[],dryChanges=[];
  const graph={nativeStream:true,disposed:false,session:7,generation:1,captureTimelineEpoch:1,appliedTimelineEpoch:1,
    nativeGainSequence:1,nativeGainCeiling:0,outputOwner:'browser',
    timelineTransitionActive:false,timelineResetPromise:null,streamAbort:new AbortController(),context:{},
    dryGain:{gain:{value:1}},wetGain:{gain:{value:0}},node:{port:{postMessage(){}}}};
  const spatial={graph,requested:true,enabled:false,loading:false,operationId:0};
  const gainReply=url=>{const values=new URL(url,'http://fixture').searchParams;return {ok:true,session:7,
    generation:Number(values.get('generation')),gainSequence:Number(values.get('sequence')),
    outputGain:Number(values.get('gain')),gainLeaseExpiresAt:Number(values.get('expiresAt'))};};
  const context=vm.createContext({AbortController,DOMException,URLSearchParams,Date:class extends Date{static now(){return 1700000000000+now;}},
    performance:{now:()=>now},Promise,Math,Number,encodeURIComponent,
    window:{setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)},
    state:{obrSpatialAudio:spatial,audioAnalysis:{sourceMode:'media'}},GOOGLE_OBR_NATIVE_REQUEST_TIMEOUT_MS:2000,
    GOOGLE_OBR_NATIVE_UPLOAD_TIMEOUT_MS:750,
    ensureOfficialGoogleObrGraph:async()=>graph,connectOfficialGoogleObrGraph(){},
    disposeOfficialGoogleObrGraph:async(target)=>{
      target.disposed=true;target.dryGain.gain.value=1;target.wetGain.gain.value=0;target.streamAbort.abort();
      if(spatial.graph===target)spatial.graph=null;
    },
    setAudioParamSmoothly(parameter,value){parameter.value=value;if(parameter===graph.dryGain.gain)dryChanges.push(value);},
    // Envelope timing is covered by the handoff suite; acknowledge the audio
    // thread immediately here, while retaining production command fencing.
    async waitForNativeSpatialDryGain(target,value,isCurrent){
      if(!isCurrent())throw new DOMException('obsolete fixture gain','AbortError');
      target.dryGain.gain.value=value;dryChanges.push(value);
    },
    GOOGLE_OBR_BACKEND:'google-obr-official',GOOGLE_OBR_NATIVE_BACKEND:'native-rust-x3d-obr-xaudio2',
    syncGoogleObrToggle(){},clearGoogleObrRecovery(){},scheduleGoogleObrRecovery(){},setGoogleObrRuntimeBackend(){},saveGoogleObrPreference(){},syncRealtimePolling(){},
    notifyNativeAudioChainChanged(reason){if(reason==='failed')failures.push(new Error(spatial.error));},
    safeText:(value,fallback)=>String(value||fallback),
    waitForNativeGoogleObrPreroll:async()=>({ready:true}),nativeSpatialRequest:async url=>gainReply(url)
  });
  for(const name of ['nativeSpatialLeaseDeadline','setNativeSpatialOutputGain','handoffNativeSpatialOutput',
    'failGoogleObr','waitForGoogleObrProcessedBlock','waitForNativeGoogleObrActivationStep','activateOfficialGoogleObr']){
    const fn=extract(name);if(fn)vm.runInContext(fn,context);
  }
  return {graph,spatial,context,failures,dryChanges,timers,gainReply,async advance(ms){const end=now+ms;await drain();
    for(;;){const entry=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;
      now=entry[1].at;timers.delete(entry[0]);entry[1].callback();await drain();}now=end;await drain();}};
}

for(const phase of ['preroll','activate'])test(`initial ${phase} reply crossed by seek waits for latest timeline before muting dry audio`,async()=>{
  const f=fixture(),old=deferred(),reset=deferred();const requests=[];let prerolls=0;
  f.context.waitForNativeGoogleObrPreroll=async(graph,epoch)=>{
    prerolls++;if(phase==='preroll'&&prerolls===1)return old.promise;
    return {ready:true,epoch};
  };
  f.context.nativeSpatialRequest=async url=>{requests.push(url);if(phase==='activate'&&requests.length===1)return old.promise;return f.gainReply(url);};
  const pending=f.context.activateOfficialGoogleObr({announce:false});await drain();
  f.graph.captureTimelineEpoch=2;f.graph.timelineTransitionActive=true;f.graph.timelineResetPromise=reset.promise;
  if(phase==='preroll')old.reject(new Error('obsolete old status'));
  else old.resolve({ok:true,ignored:true,stale:true});
  await drain();
  assert.equal(f.failures.length,0,'obsolete reply cannot fail the latest timeline');
  assert.ok(f.graph.dryGain.gain.value>=.5,'dry path retains headroom audio while the seek owns recovery');
  f.graph.generation=2;f.graph.appliedTimelineEpoch=2;f.graph.timelineTransitionActive=false;f.graph.timelineResetPromise=null;
  reset.resolve(true);
  assert.equal(await pending,true);
  assert.equal(f.spatial.enabled,true);assert.equal(f.spatial.loading,false);
  assert.equal(f.failures.length,0);assert.equal(f.dryChanges.filter(value=>value===0).length,1);
  assert.match(requests.at(-1),/generation=2/);
  assert.equal(f.timers.size,0);
});

test('initial preroll forwards a captured epoch to native status checks',async()=>{
  const f=fixture();let epoch;
  f.context.waitForNativeGoogleObrPreroll=async(graph,value)=>{epoch=value;return {ready:true};};
  await f.context.activateOfficialGoogleObr({announce:false});
  assert.equal(epoch,1);
});

test('continuous seek recovery cannot leave initial activation loading indefinitely',async()=>{
  const f=fixture(),old=deferred();let first=true;
  f.context.waitForNativeGoogleObrPreroll=()=>{if(first){first=false;return old.promise;}return new Promise(()=>{});};
  const pending=f.context.activateOfficialGoogleObr({announce:false});await drain();
  f.graph.captureTimelineEpoch=2;f.graph.timelineTransitionActive=true;f.graph.timelineResetPromise=new Promise(()=>{});
  old.resolve(null);await drain();await f.advance(10000);
  assert.equal(f.spatial.loading,false,'activation deadline must settle spinner');
  assert.equal(await pending,false);assert.equal(f.failures.length,1);assert.equal(f.graph.dryGain.gain.value,1);
  assert.equal(f.timers.size,0);
});

test('a current-generation activation rejection preserves browser fallback',async()=>{
  const f=fixture();f.context.nativeSpatialRequest=async()=>({ok:true,ignored:true,stale:true});
  const result=await f.context.activateOfficialGoogleObr({announce:false});
  assert.equal(result,false);assert.equal(f.graph.dryGain.gain.value,1);assert.equal(f.failures.length,1);
});

for(const field of ['outputGain','gainLeaseExpiresAt'])test(`an acknowledgement without finite ${field} cannot take browser output`,async()=>{
  const f=fixture();
  f.context.nativeSpatialRequest=async url=>{const reply=f.gainReply(url);delete reply[field];return reply;};
  assert.equal(await f.context.activateOfficialGoogleObr({announce:false}),false);
  assert.equal(f.spatial.enabled,false);assert.equal(f.graph.dryGain.gain.value,1);
  assert.equal(f.failures.length,1);
  assert.equal(f.dryChanges.filter(value=>value===0).length,0,'unconfirmed native output must not mute browser audio');
});

test('a timed-out activation disposes its graph so a late production reset cannot mute browser fallback',async()=>{
  const f=fixture(),old=deferred(),lateReset=deferred();let first=true,activations=0;
  Object.assign(f.graph,{blockQueue:[],timelineResetCount:0,timelineResetFailures:0});
  Object.assign(f.context,{
    els:{audio:{src:'fixture',paused:false,ended:false}},
    pumpNativeSpatialBlocks(){},recycleNativeSpatialBlock(){},
    setAudioParamEqualPower(parameter,value){parameter.value=value;if(parameter===f.graph.dryGain.gain)f.dryChanges.push(value);}
  });
  vm.runInContext(extract('resetNativeSpatialTimeline'),f.context);
  f.context.waitForNativeGoogleObrPreroll=()=>{if(first){first=false;return old.promise;}return Promise.resolve({ready:true});};
  f.context.nativeSpatialRequest=async url=>{
    if(url.includes('/timeline?'))return lateReset.promise; // Deliberately ignores abort, as a late transport may.
    activations++;return f.gainReply(url);
  };
  const pending=f.context.activateOfficialGoogleObr({announce:false});await drain();
  f.graph.captureTimelineEpoch=2;f.graph.timelineTransitionActive=true;
  const resetting=f.context.resetNativeSpatialTimeline(f.graph);
  old.resolve(null);await drain();await f.advance(10000);
  assert.equal(await pending,false);assert.equal(f.spatial.loading,false);
  assert.equal(f.graph.dryGain.gain.value,1);
  lateReset.resolve({ok:true,session:7,generation:2});
  await resetting;await drain();
  assert.equal(f.graph.dryGain.gain.value,1,'late reset must never reclaim browser fallback after activation failure');
  assert.equal(activations,0,'disposed reset must not issue native activation');
  assert.equal(f.graph.disposed,true);assert.equal(f.graph.streamAbort.signal.aborted,true);
  assert.equal(f.dryChanges.filter(value=>value===0).length,0);
});
