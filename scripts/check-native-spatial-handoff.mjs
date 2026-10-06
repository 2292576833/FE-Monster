import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),baseline=process.argv.includes('--baseline');
const app=readFileSync(path.join(root,'web/app.js'),'utf8');
const native=readFileSync(path.join(root,'native/windows/audio/fe_audio_pipeline.cpp'),'utf8');
const out=path.join(root,'output/audio-discontinuity');mkdirSync(out,{recursive:true});
const extract=name=>{const source=app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];assert.ok(source,name);return source;};
const appConstant=name=>{const match=app.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));assert.ok(match,name);return Number(match[1]);};
const uploadTimeoutMs=appConstant('GOOGLE_OBR_NATIVE_UPLOAD_TIMEOUT_MS'),requestTimeoutMs=appConstant('GOOGLE_OBR_NATIVE_REQUEST_TIMEOUT_MS');
const nativeConstant=name=>{const match=native.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));assert.ok(match,name);return Number(match[1]);};
const nativeSteps=nativeConstant('kSourceVoiceFadeSteps'),nativeStepMs=nativeConstant('kSourceVoiceFadeStepMilliseconds');
const timelineSteps=nativeConstant('kTimelineResetFadeSteps');
const timelineStepMs=nativeConstant('kTimelineResetFadeStepHundredNanoseconds')/10000;
const nativeSettle=native.match(/\*milliseconds = std::max<DWORD>\((\d+)u, static_cast<DWORD>\(latency_ms\) \+ (\d+)u\)/);
assert.ok(nativeSettle,'native gain acknowledgement must include output settling');
const nativeLeaseFadeMs=Number(native.match(/const float lease_step[^\n]*sample_rate_ \* (\d+)u \/ 1000u/)?.[1]);
assert.ok(nativeLeaseFadeMs>0,'native lease fade duration');
const drain=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};

class GainTimeline {
  constructor(initial,clock){this.initial=initial;this.clock=clock;this.events=[];}
  get value(){return this.at(this.clock()/1000);}
  set value(value){this.setValueAtTime(value,this.clock()/1000);}
  setValueAtTime(value,time){this.events.push({type:'set',value,time});this.sort();}
  linearRampToValueAtTime(value,time){this.events.push({type:'linear',value,time});this.sort();}
  setValueCurveAtTime(curve,time,duration){this.events.push({type:'curve',curve:Array.from(curve),time,duration});this.sort();}
  cancelScheduledValues(time){this.events=this.events.filter(event=>event.time<time);}
  sort(){this.events.sort((a,b)=>a.time-b.time);}
  at(time){let value=this.initial,previousTime=0;
    for(const event of this.events){
      if(event.time>time){
        if(event.type==='linear'&&event.time>previousTime)return value+(event.value-value)*(time-previousTime)/(event.time-previousTime);
        return value;
      }
      if(event.type==='curve'){
        if(time<event.time+event.duration){const phase=Math.max(0,(time-event.time)/event.duration)*(event.curve.length-1),index=Math.floor(phase),next=Math.min(index+1,event.curve.length-1);return event.curve[index]+(event.curve[next]-event.curve[index])*(phase-index);}
        value=event.curve.at(-1);previousTime=event.time+event.duration;
      }else{value=event.value;previousTime=event.time;}
    }
    return value;
  }
}

function fixture(config){
  let now=0,nextTimer=0;const timers=new Map(),calls=[],failures=[];
  const wallOrigin=1800000000000;
  class ClockDate extends Date {static now(){return wallOrigin+now;}}
  const schedule=(callback,delay=0)=>{const id=++nextTimer;timers.set(id,{callback,at:now+Math.max(0,delay)});return id;};
  const delay=ms=>new Promise(resolve=>schedule(resolve,ms));
  const initialNative=config.mode==='activate'?0:1;
  const audioTimeAt=milliseconds=>Math.max(0,milliseconds-(config.frozenAudioUntilMs||0));
  const dry=new GainTimeline(1-initialNative,()=>audioTimeAt(now)),wet=new GainTimeline(0,()=>audioTimeAt(now)),nativeGain=new GainTimeline(initialNative,()=>now);
  const context={state:'running',sampleRate:48000,baseLatency:(config.browserPipelineMs||0)/1000,outputLatency:0,get currentTime(){return audioTimeAt(now)/1000;}};
  const graph={nativeStream:true,disposed:false,ready:true,session:7,generation:1,captureTimelineEpoch:1,appliedTimelineEpoch:1,
    timelineTransitionActive:false,timelineResetPromise:null,timelineResetCount:0,timelineResetFailures:0,
    transportDroppedBlocks:0,poolStarvedFrames:0,blockQueue:[],streamAbort:new AbortController(),context,
    nativeGainSequence:1,nativeGainCeiling:initialNative,nativeLeaseDeadline:initialNative?wallOrigin+1000:0,nativeLeaseMonotonicDeadline:initialNative?1000:0,outputOwner:initialNative?'native':'browser',
    dryGain:{gain:dry},wetGain:{gain:wet},node:{port:{postMessage(){},close(){}}}};
  const spatial={graph,requested:true,enabled:initialNative===1,loading:false,operationId:0};
  let controlTail=Promise.resolve(),nativeGeneration=1,gainSequence=1,leaseExpiresAt=initialNative?wallOrigin+1000:0;
  // Native effects are modeled from the production control-thread fade. Calls
  // serialize like the native mutex; response latency is separate from effects.
  let gainRequests=0;
  const performNativeRequest=async (url,options={})=>{
    const action=new URL(url,'http://local').pathname.split('/').at(-1);
    const query=new URL(url,'http://local').searchParams;
    const requestedGeneration=Number(query.get('generation'));
    const record={action,requestedAt:now,requestedGeneration,audioTime:context.currentTime,timeoutMs:options.timeoutMs??requestTimeoutMs};calls.push(record);
    const delayedGain=action==='gain'&&++gainRequests>1&&config.lateGainDeliveryMs;
    await delay(delayedGain||config.requestDelayMs);
    if(config.hangStop&&(action==='stop'||action==='pause'))return new Promise(()=>{});
    if(config.dropStop&&(action==='stop'||action==='pause'))throw new Error('simulated lost stop command');
    const previousControl=controlTail;let releaseControl;
    controlTail=new Promise(resolve=>{releaseControl=resolve;});
    await previousControl;
    if(requestedGeneration!==nativeGeneration){record.responseAt=now;releaseControl();return{ok:false,stale:true};}
    const requestedSequence=Number(query.get('sequence')),requestedExpiry=Number(query.get('expiresAt'));
    if(action==='gain'&&(requestedSequence<=gainSequence||requestedExpiry<=ClockDate.now())){
      record.rejectedAt=now;record.expired=requestedExpiry<=ClockDate.now();record.responseAt=now;releaseControl();return{ok:false,stale:true,session:7,generation:nativeGeneration};
    }
    const initial=nativeGain.value,target=action==='gain'?Number(query.get('gain')):action==='activate'?1:0;
    if(action==='gain'){
      assert.ok(Number.isFinite(target)&&target>=0&&target<=1,'production gain request stays bounded');
      gainSequence=requestedSequence;leaseExpiresAt=requestedExpiry;
      record.sequence=gainSequence;record.target=target;record.expiresAt=leaseExpiresAt;
      const leaseAtSchedule=leaseExpiresAt;
      schedule(()=>{
        if(leaseAtSchedule!==leaseExpiresAt)return;
        const current=nativeGain.value;
        nativeGain.setValueAtTime(current,now/1000);
        nativeGain.linearRampToValueAtTime(0,(now+nativeLeaseFadeMs)/1000);
        calls.push({action:'audio-thread-lease-expired',effectAt:now,sequence:gainSequence});
      },leaseExpiresAt-ClockDate.now());
    }
    const steps=action==='timeline'?timelineSteps:nativeSteps;
    const stepMs=action==='timeline'?timelineStepMs:nativeStepMs;
    const duration=initial===target?0:action==='timeline'?(steps-1)*stepMs:steps*stepMs;
    record.effectAt=now;
    for(let step=1;step<=steps&&duration;step++)nativeGain.setValueAtTime(action==='timeline'?initial*Math.cos(step/steps*Math.PI*.5):initial+(target-initial)*step/steps,(now+(step-1)*stepMs)/1000);
    if(duration)await delay(duration);
    if(action==='gain')await delay(Math.max(Number(nativeSettle[1]),(config.nativePipelineMs||0)+Number(nativeSettle[2])));
    if(action==='timeline'){nativeGeneration++;gainSequence=0;leaseExpiresAt=0;}
    record.nativeDoneAt=now;
    const reply={ok:true,session:7,generation:nativeGeneration,gainSequence,outputGain:target,gainLeaseExpiresAt:leaseExpiresAt};
    releaseControl();
    await delay(config.responseDelayMs);
    record.responseAt=now;
    if(config.failActivation&&(action==='activate'||action==='gain'&&target>0)||config.failGainResponses&&action==='gain')throw new Error('simulated activation response failure after native applied');
    return reply;
  };
  // An HTTP timeout cannot retract a command already sent. Keep processing its
  // delayed native effect after the browser's request promise has rejected.
  const nativeRequest=(url,options={})=>new Promise((resolve,reject)=>{
    const timeoutMs=options.timeoutMs??requestTimeoutMs;
    const timeout=schedule(()=>{
      calls.push({action:'http-timeout',path:new URL(url,'http://local').pathname,effectAt:now});
      reject(new DOMException('simulated native request timeout','TimeoutError'));
    },timeoutMs);
    performNativeRequest(url,options).then(value=>{timers.delete(timeout);resolve(value);},error=>{timers.delete(timeout);reject(error);});
  });
  const sandbox=vm.createContext({Number,Math,Promise,Float32Array,AbortController,DOMException,URLSearchParams,encodeURIComponent,Date:ClockDate,
    performance:{now:()=>now},window:{setTimeout:schedule,clearTimeout:id=>timers.delete(id)},
    state:{obrSpatialAudio:spatial,audioAnalysis:{sourceMode:'media'}},els:{audio:{src:'fixture',paused:false,ended:false,currentTime:0}},
    GOOGLE_OBR_BACKEND:'google-obr-official',GOOGLE_OBR_NATIVE_BACKEND:'native-rust-x3d-obr-xaudio2',
    GOOGLE_OBR_NATIVE_UPLOAD_TIMEOUT_MS:uploadTimeoutMs,
    ensureOfficialGoogleObrGraph:async()=>graph,connectOfficialGoogleObrGraph(){},disconnectOfficialGoogleObrGraph(){},
    discardNativeSpatialBlocks(){graph.blockQueue=[];},pumpNativeSpatialBlocks(){},recycleNativeSpatialBlock(){},
    syncGoogleObrToggle(){},clearGoogleObrRecovery(){},scheduleGoogleObrRecovery(){},setGoogleObrRuntimeBackend(){},saveGoogleObrPreference(){},syncRealtimePolling(){},
    notifyNativeAudioChainChanged(reason){if(reason==='failed')failures.push(spatial.error);},safeText:(value,fallback)=>String(value||fallback),
    waitForNativeGoogleObrPreroll:async()=>{await delay(config.prerollMs);return{ready:true};},nativeSpatialRequest:nativeRequest
  });
  for(const name of ['setAudioParamSmoothly','setAudioParamEqualPower',
    ...(['nativeSpatialLeaseDeadline','waitForNativeSpatialDryGain','setNativeSpatialOutputGain','handoffNativeSpatialOutput','disposeNativeSpatialGraph'].filter(name=>app.includes(`function ${name}(`))),
    'disposeOfficialGoogleObrGraph','failGoogleObr','waitForGoogleObrProcessedBlock','waitForNativeGoogleObrActivationStep','activateOfficialGoogleObr','beginNativeSpatialTimelineTransition','resetNativeSpatialTimeline'])vm.runInContext(extract(name),sandbox);
  return {sandbox,graph,spatial,dry,nativeGain,calls,failures,schedule,audioTimeAt,get now(){return now;},async advance(ms){const until=now+ms;await drain();
    for(;;){const entry=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;
      now=entry[1].at;timers.delete(entry[0]);entry[1].callback();await drain();}
    now=until;await drain();
  }};
}

const configs=[
  {name:'activate',mode:'activate'},
  {name:'activate-late-response',mode:'activate',responseDelayMs:120},
  {name:'reported-browser-and-native-device-latencies',mode:'activate',browserPipelineMs:35,nativePipelineMs:64},
  {name:'dispose',mode:'dispose'},
  {name:'seek-reset',mode:'reset'},
  {name:'cancel-before-activation-response',mode:'activate',responseDelayMs:120,cancelAtMs:60},
  {name:'activation-response-failure',mode:'activate',failActivation:true},
  {name:'unknown-gain-and-stop-expire-before-dry-restored',mode:'activate',failGainResponses:true,dropStop:true,durationMs:2400},
  {name:'gain-and-stop-timeout-late-expired-command-cannot-revive',mode:'activate',responseDelayMs:1000,lateGainDeliveryMs:1400,hangStop:true,durationMs:4500},
  {name:'frozen-audio-clock-cannot-acknowledge-headroom',mode:'activate',frozenAudioUntilMs:2500,durationMs:4000},
  {name:'dispose-replaced-graph-cannot-change-new-shared-dry',mode:'dispose',replaceAtMs:50}
].map(config=>({requestDelayMs:8,responseDelayMs:20,prerollMs:0,durationMs:800,...config}));
const cases=[];
for(const config of configs){
  const f=fixture(config);let finished=false,result,error;
  const pending=config.mode==='activate'?f.sandbox.activateOfficialGoogleObr({announce:false}):config.mode==='reset'?f.sandbox.beginNativeSpatialTimelineTransition('test-seek'):f.sandbox.disposeOfficialGoogleObrGraph(f.graph);
  pending.then(value=>{finished=true;result=value;},value=>{finished=true;error=String(value);});
  if(config.cancelAtMs)f.schedule(()=>{f.spatial.operationId++;f.spatial.requested=false;void f.sandbox.disposeOfficialGoogleObrGraph(f.graph);},config.cancelAtMs);
  if(config.replaceAtMs)f.schedule(()=>{f.spatial.graph={...f.graph,session:8,disposed:false,disposing:false,disposePromise:null,outputOwner:'browser'};f.dry.value=.25;},config.replaceAtMs);
  await f.advance(config.durationMs);
  assert.equal(finished,true,`${config.name}: production handoff must settle`);
  if(!config.failActivation&&!config.failGainResponses&&!config.hangStop&&!config.cancelAtMs&&!config.replaceAtMs&&!config.frozenAudioUntilMs&&config.mode==='activate'){
    const callCount=f.calls.length;await f.sandbox.handoffNativeSpatialOutput(f.graph,'native');assert.equal(f.calls.length,callCount,'an idempotent settled activation performs no new gain stages');
  }
  const drySamples=Array.from({length:config.durationMs*48},(_,frame)=>f.dry.at(f.audioTimeAt(Math.max(0,frame/48-(config.browserPipelineMs||0)))/1000));
  const nativeSamples=Array.from({length:config.durationMs*48},(_,frame)=>f.nativeGain.at(Math.max(0,frame/48-(config.nativePipelineMs||0))/1000));
  const gain=drySamples.map((value,frame)=>value+nativeSamples[frame]);
  cases.push({name:config.name,config,result,error,finished,calls:f.calls,failures:f.failures,disposed:f.graph.disposed,
    finalDry:f.dry.at(f.audioTimeAt(config.durationMs-1)/1000),finalNative:f.nativeGain.at((config.durationMs-1)/1000),maxGain:gain.reduce((max,value)=>Math.max(max,value),0),minGain:gain.reduce((min,value)=>Math.min(min,value),1),overUnityFrames:gain.filter(value=>value>1.00001).length,
    dry:f.dry.events,native:f.nativeGain.events,drySamples,nativeSamples});
}

const require=createRequire(import.meta.url);let chromium;
for(const module of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{({chromium}=require(module));break;}catch{}}
assert.ok(chromium);let browser;
try{
  browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  const page=await browser.newPage();
  for(const row of cases){
    row.pcm=await page.evaluate(async({drySamples,nativeSamples})=>{
      const results=[];
      for(const signal of ['constant','sine']){
        const context=new OfflineAudioContext(1,drySamples.length,48000),buffer=context.createBuffer(1,drySamples.length,48000),pcm=buffer.getChannelData(0);
        for(let frame=0;frame<pcm.length;frame++)pcm[frame]=signal==='constant'?.8:.8*Math.sin(2*Math.PI*440*frame/48000+.7);
        for(const envelope of [drySamples,nativeSamples]){
          const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
          gain.gain.setValueCurveAtTime(new Float32Array(envelope),0,(envelope.length-1)/48000);
          source.connect(gain);gain.connect(context.destination);source.start();
        }
        const output=(await context.startRendering()).getChannelData(0);let peak=0,overFullScaleFrames=0;
        for(const sample of output){peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>1)overFullScaleFrames++;}
        results.push({signal,peak,overFullScaleFrames});
      }
      return results;
    },{drySamples:row.drySamples,nativeSamples:row.nativeSamples});delete row.drySamples;delete row.nativeSamples;
  }
}finally{await browser?.close();}
const report={baseline,model:'Production browser handoff functions, deterministic native control fade/IPC and reported device latency timing, coherent two-route PCM rendered in OfflineAudioContext; over-full-scale is clipping risk at the final device, not physical loopback proof',appSha256:createHash('sha256').update(app).digest('hex'),nativeSteps,nativeStepMs,nativeLeaseFadeMs,cases};
writeFileSync(path.join(out,baseline?'handoff-before.json':'handoff-after.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({baseline,nativeSteps,nativeStepMs,cases:cases.map(({name,maxGain,overUnityFrames,pcm,finalDry,finalNative})=>({name,maxGain,overUnityFrames,pcm,finalDry,finalNative}))},null,2));
if(!baseline){
  for(const row of cases){
    assert.ok(row.maxGain<=1.0001,`${row.name}: actual production handoff overlaps routes with gain sum ${row.maxGain.toFixed(4)}`);
    assert.ok(row.pcm.every(result=>result.overFullScaleFrames===0),`${row.name}: coherent audio exceeds device full scale`);
    assert.ok(!row.error,`${row.name}: unhandled handoff error`);
    if(!row.config.cancelAtMs&&!row.config.failActivation&&!row.config.failGainResponses&&!row.config.hangStop&&!row.config.frozenAudioUntilMs&&!row.config.replaceAtMs)assert.ok(row.minGain>=.4999,`${row.name}: normal handoff must retain at least half total gain`);
    if(row.config.frozenAudioUntilMs)assert.ok(row.calls.filter(call=>call.action==='gain'&&call.target>0).every(call=>call.requestedAt>=row.config.frozenAudioUntilMs),'a frozen WebAudio clock must never release headroom for native gain');
    if(row.config.replaceAtMs){assert.equal(row.finalDry,.25,'old disposal may not change replacement shared dry output');continue;}
    if(row.config.hangStop){
      assert.ok(row.calls.some(call=>call.action==='http-timeout'&&call.path.endsWith('/gain')),'gain timeout must be exercised');
      assert.ok(row.calls.some(call=>call.action==='http-timeout'&&call.path.endsWith('/stop')),'stop timeout must be exercised');
      assert.ok(row.calls.some(call=>call.action==='gain'&&call.expired&&call.rejectedAt>call.requestedAt+1000),'late native commands must reach and fail the lease check');
    }
    if(row.config.cancelAtMs||row.config.failActivation||row.config.failGainResponses||row.config.hangStop||row.config.frozenAudioUntilMs||row.config.mode==='dispose'){
      assert.equal(row.finalDry,1);assert.equal(row.finalNative,0,'failure/cancel must release native output');
    }
  }
}
