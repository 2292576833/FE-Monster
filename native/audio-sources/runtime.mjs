import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from 'quickjs-emscripten';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createNetwork, normalizeHosts, parsePublicUrl, fail, SourceError } from './network.mjs';

export const LIMITS=Object.freeze({scriptBytes:512*1024,inputBytes:768*1024,outputBytes:2*1024*1024,heapBytes:24*1024*1024,wasmBytes:64*1024*1024,timeoutMs:12000,jobs:10000,bridgeCalls:256,timers:64});
const ERRORS={INVALID_INPUT:'Invalid runtime input.',INVALID_HOSTS:'Invalid allowed host list.',SCRIPT_ERROR:'Script initialization or execution failed.',TIMEOUT:'Script execution timed out.',MISSING_INIT:'Script did not initialize.',INIT_NETWORK_REQUIRED:'Initialization requires approved network access.',INVALID_INIT:'Script declared no supported music URL source.',UNSUPPORTED:'Source, action or quality is not declared.',URL_BLOCKED:'Script returned an unsafe playback URL.',RUNTIME_ERROR:'Audio source runtime failed.',BRIDGE_LIMIT:'Script bridge limit exceeded.',DNS_FAILED:'Destination DNS lookup failed.',ADDRESS_BLOCKED:'Destination address is not public.'};
const NETWORK_ERROR_CODES=new Set(['NETWORK_TIMEOUT','DNS_FAILED','NETWORK_FAILED','REQUEST_UNSUPPORTED','REQUEST_INVALID','HEADER_BLOCKED','REQUEST_SIZE','REQUEST_LIMIT','RESPONSE_SIZE','ENCODING_UNSUPPORTED','REDIRECT_BLOCKED','ADDRESS_BLOCKED','HOST_BLOCKED','URL_BLOCKED']);
const canSuggestHost=host=>/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)&&!/\.(localhost|local|internal|home|lan)$/.test(host);
function scriptHttpsUrl(raw) {
  // Legacy LX sources can spell API or media endpoints as http. Never send plaintext:
  // try only the same host/path over HTTPS, with the original DNS/allowlist checks.
  if(typeof raw==='string' && /^http:\/\//i.test(raw)) {
    if(raw.length>8192 || /[\u0000-\u0020\u007f\\]/.test(raw))fail('URL_BLOCKED');
    let url;try{url=new URL(raw);}catch{fail('URL_BLOCKED');}
    if(url.port && url.port!=='80')fail('URL_BLOCKED');
    url.protocol='https:';url.port='';return parsePublicUrl(url.href);
  }
  return parsePublicUrl(raw);
}
function sanitizeSources(data) {
  if(!data || data.status===false || !data.sources || typeof data.sources!=='object') fail('INVALID_INIT');
  const sources={};
  for(const key of ['wy','tx','kg']) {
    const source=data.sources[key];if(!source || source.type!=='music' || !Array.isArray(source.actions) || !source.actions.includes('musicUrl') || !Array.isArray(source.qualitys))continue;
    const qualitys=[...new Set(source.qualitys.filter(q=>['128k','192k','320k','flac','flac24bit','wav','ape'].includes(q)))];if(!qualitys.length)continue;
    sources[key]={name:typeof source.name==='string'?source.name.slice(0,80):key,type:'music',actions:['musicUrl'],qualitys};
  }
  if(!Object.keys(sources).length) fail('INVALID_INIT');return sources;
}
function scriptInfo(script) {
  // Metadata belongs to this script only; never expose host paths or account state.
  const header=script.match(/^\uFEFF?\s*\/\*[!*]?[\s\S]*?\*\//)?.[0] || '';
  const info={rawScript:script};
  for(const key of ['name','description','version','author','homepage']) {
    info[key]=header.match(new RegExp('^\\s*\\*?\\s*@'+key+'[ \\t]+([^\\r\\n]*)','m'))?.[1].trim() || '';
  }
  return info;
}
// Executed as guest source, never by the Node interpreter. Host capabilities only accept JSON strings.
const BOOTSTRAP=`(()=>{
  const sendHost=globalThis.__sendHost,requestHost=globalThis.__requestHost,utilHost=globalThis.__utilHost,cancelHost=globalThis.__cancelHost;
  const timerHost=globalThis.__timerHost,clearTimerHost=globalThis.__clearTimerHost;
  delete globalThis.__sendHost;delete globalThis.__requestHost;delete globalThis.__utilHost;delete globalThis.__cancelHost;
  delete globalThis.__timerHost;delete globalThis.__clearTimerHost;
  const stringify=JSON.stringify,parse=JSON.parse,PromiseCtor=Promise;
  const currentScriptInfo=Object.freeze(parse(globalThis.__scriptInfo));delete globalThis.__scriptInfo;
  let handler,nextRequest=0,updateAlertSent=false,nextTimer=0;
  const timers=new Map();
  Object.defineProperty(globalThis,'setTimeout',{value:(callback,delay=0,...args)=>{
    if(typeof callback!=='function')throw Error('Timer callback must be a function');
    const id=++nextTimer,ms=Number(delay);timers.set(id,true);
    timerHost(stringify({id,delay:Number.isFinite(ms)?Math.max(0,ms):0})).then(fired=>{
      if(timers.delete(id)&&fired)callback(...args);
    });return id;
  },writable:false,configurable:false});
  Object.defineProperty(globalThis,'clearTimeout',{value:id=>{
    if(timers.delete(id))clearTimerHost(stringify(id));
  },writable:false,configurable:false});
  const util=(name,args)=>parse(utilHost(stringify({name,args})));
  const byteInput=value=>value instanceof Uint8Array?Array.from(value):value instanceof ArrayBuffer?Array.from(new Uint8Array(value)):value;
  const lx={env:'desktop',version:'fe-subset-1',currentScriptInfo,EVENT_NAMES:Object.freeze({inited:'inited',request:'request',updateAlert:'updateAlert'}),
    on(event,fn){if(event!=='request'||typeof fn!=='function')throw Error('Unsupported event');handler=fn;},
    send(event,data){
      // Advisory notices must not fail initialization or open a third-party URL.
      if(event==='updateAlert'){
        if(!updateAlertSent){if(!data||typeof data.log!=='string')throw Error('Invalid update notice');updateAlertSent=true;}
        return PromiseCtor.resolve();
      }
      if(event!=='inited')throw Error('Unsupported event');sendHost(stringify(data));return PromiseCtor.resolve();
    },
    request(url,options,callback){
      if(typeof callback!=='function')throw Error('Callback required');
      let cancelled=false;const id=++nextRequest;
      requestHost(stringify({id,url,options:options||{}})).then(raw=>{if(cancelled)return;const r=parse(raw);if(r.error)callback(Error(r.error),null,null);else callback(null,{statusCode:r.statusCode,headers:r.headers,body:r.body},r.body);});
      return ()=>{cancelled=true;cancelHost(stringify(id));};
    },
    utils:{buffer:{from:(value,encoding)=>new Uint8Array(util('bufferFrom',[byteInput(value),encoding])),bufToString:(value,encoding)=>util('bufferString',[Array.from(value),encoding])},crypto:{
      md5:value=>util('md5',[value]),randomBytes:size=>new Uint8Array(util('randomBytes',[size])),
      aesEncrypt:(data,mode,key,iv)=>new Uint8Array(util('aesEncrypt',[byteInput(data),mode,byteInput(key),byteInput(iv)]))
    }}
  };
  Object.defineProperty(globalThis,'lx',{value:lx,writable:false,configurable:false});
  // Logging remains entirely inside the guest. Desktop LX sources also use groups,
  // timers and counters; these advisory calls must not prevent URL resolution.
  Object.defineProperty(globalThis,'console',{value:Object.freeze({log(){},info(){},warn(){},error(){},debug(){},group(){},groupCollapsed(){},groupEnd(){},assert(){},table(){},time(){},timeLog(){},timeEnd(){},count(){},countReset(){},trace(){},clear(){}}),writable:false,configurable:false});
  return raw=>{if(!handler)throw Error('Missing handler');return PromiseCtor.resolve(handler(parse(raw))).then(value=>{if(typeof value!=='string')throw Error('Invalid URL');return value;});};
})()`;

export async function execute(input,options={}) {
  let context,runtime,startHandle,network;const pending=new Set(),controllers=new Map(),timers=new Map(),requiredHosts=new Set();let closed=false;
  const deadline=Date.now()+Math.min(options.timeoutMs || LIMITS.timeoutMs,LIMITS.timeoutMs);
  let init,sources,fatal,bridgeCalls=0,jobs=0,phase='init',networkFailure=null,networkHttpStatus=0;
  const check=()=>{if(Date.now()>=deadline)fail('TIMEOUT');if(fatal)throw fatal;};
  try {
    if(!input || !['inspect','resolve'].includes(input.op) || typeof input.script!=='string' || Buffer.byteLength(input.script)>LIMITS.scriptBytes || Buffer.byteLength(JSON.stringify(input))>LIMITS.inputBytes)fail('INVALID_INPUT');
    const hosts=normalizeHosts(input.allowedHosts);
    network=options.network || createNetwork(hosts,{lookup:options.lookup,limits:{totalMs:Math.max(1,deadline-Date.now())}});
    const wasmMemory=new WebAssembly.Memory({initial:256,maximum:LIMITS.wasmBytes/65536});
    const engine=await newQuickJSWASMModule(newVariant(RELEASE_SYNC,{wasmMemory,emscriptenModule:{print(){},printErr(){}}}));check();
    if(engine.getWasmMemory()!==wasmMemory)fail('RUNTIME_ERROR');
    runtime=engine.newRuntime();runtime.setMemoryLimit(LIMITS.heapBytes);runtime.setMaxStackSize(512*1024);runtime.setInterruptHandler(()=>Date.now()>=deadline || !!fatal);
    context=runtime.newContext();
    const metadata=context.newString(JSON.stringify(scriptInfo(input.script)));
    try{context.setProp(context.global,'__scriptInfo',metadata);}finally{metadata.dispose();}
    const consume=result=>{if(result.error){result.error.dispose();check();fail('SCRIPT_ERROR');}return result.value;};
    const read=handle=>{
      if(++bridgeCalls>LIMITS.bridgeCalls)fail('BRIDGE_LIMIT');
      if(context.typeof(handle)!=='string')fail('SCRIPT_ERROR');const raw=context.getString(handle);
      if(Buffer.byteLength(raw)>256*1024)fail('BRIDGE_LIMIT');return JSON.parse(raw);
    };
    const register=(name,fn)=>{const h=context.newFunction(name,(...args)=>{try{return fn(...args);}catch(err){fatal=err instanceof SourceError?err:new SourceError('SCRIPT_ERROR');return context.undefined;}});context.setProp(context.global,name,h);h.dispose();};
    register('__sendHost',arg=>{if(init!==undefined)fail('INVALID_INIT');init=read(arg);sources=sanitizeSources(init);return context.undefined;});
    register('__requestHost',arg=>{
      const data=read(arg);if(!Number.isSafeInteger(data.id)||data.id<1||controllers.has(data.id))fail('SCRIPT_ERROR');
      const url=scriptHttpsUrl(data.url);
      if(!hosts.includes(url.hostname)) {
        if(canSuggestHost(url.hostname))requiredHosts.add(url.hostname);
        if(input.op==='inspect' && hosts.length===0 && requiredHosts.size) {
          fail('INIT_NETWORK_REQUIRED');
        }
        fail('HOST_BLOCKED');
      }
      const deferred=context.newPromise(),controller=new AbortController();pending.add(deferred);controllers.set(data.id,controller);
      const requestPhase=phase;
      const recordNetworkResult=(code,status=0)=>{if(!closed&&!controller.signal.aborted&&phase===requestPhase){
        networkFailure=code;
        networkHttpStatus=code==='HTTP_STATUS'&&Number.isInteger(status)&&status>=400&&status<=599?status:0;
      }};
      Promise.resolve().then(()=>network.request(url.href,data.options,controller.signal)).then(value=>{
        // A later successful response recovers earlier optional request failures.
        recordNetworkResult(value.statusCode<200||value.statusCode>=400?'HTTP_STATUS':null,value.statusCode);
        settle(value);
      },error=>{
        recordNetworkResult(error instanceof SourceError&&NETWORK_ERROR_CODES.has(error.code)?error.code:'NETWORK_FAILED');
        settle({error:'HTTP request rejected or failed.'});
      });
      function settle(value){if(closed)return;const h=context.newString(JSON.stringify(value));deferred.resolve(h);h.dispose();pending.delete(deferred);controllers.delete(data.id);deferred.dispose();}
      return deferred.handle;
    });
    register('__cancelHost',arg=>{const id=read(arg);if(!Number.isSafeInteger(id))fail('SCRIPT_ERROR');controllers.get(id)?.abort();return context.undefined;});
    register('__timerHost',arg=>{
      const data=read(arg);
      if(!Number.isSafeInteger(data.id)||data.id<1||timers.has(data.id)||!Number.isFinite(data.delay)||data.delay<0)fail('SCRIPT_ERROR');
      if(timers.size>=LIMITS.timers)fail('BRIDGE_LIMIT');
      const deferred=context.newPromise();pending.add(deferred);
      const finish=fired=>{
        if(closed||!timers.has(data.id))return;
        clearTimeout(timers.get(data.id).timer);timers.delete(data.id);
        deferred.resolve(fired?context.true:context.false);pending.delete(deferred);deferred.dispose();
      };
      // A long guest timer may not extend the invocation deadline.
      const timer=setTimeout(()=>finish(true),Math.min(data.delay,Math.max(1,deadline-Date.now())));
      timers.set(data.id,{timer,finish});return deferred.handle;
    });
    register('__clearTimerHost',arg=>{
      const id=read(arg);if(!Number.isSafeInteger(id))fail('SCRIPT_ERROR');timers.get(id)?.finish(false);return context.undefined;
    });
    register('__utilHost',arg=>{
      const {name,args}=read(arg);if(!Array.isArray(args))fail('SCRIPT_ERROR');let value;
      const encoding=raw=>{if(raw===undefined || raw===null)return 'utf8';if(!['utf8','utf-8','hex','base64','latin1','ascii'].includes(raw))fail('UNSUPPORTED');return raw;};
      const bytes=raw=>{if(!Array.isArray(raw) || raw.length>128*1024 || raw.some(x=>!Number.isInteger(x)||x<0||x>255))fail('BRIDGE_LIMIT');return Buffer.from(raw);};
      const cryptoBytes=raw=>{
        if(typeof raw!=='string')return bytes(raw);
        if(Buffer.byteLength(raw)>128*1024)fail('BRIDGE_LIMIT');return Buffer.from(raw,'utf8');
      };
      switch(name){
        case 'md5':if(typeof args[0]!=='string')fail('UNSUPPORTED');value=createHash('md5').update(args[0]).digest('hex');break;
        case 'randomBytes':if(!Number.isInteger(args[0]) || args[0]<0 || args[0]>4096)fail('BRIDGE_LIMIT');value=[...randomBytes(args[0])];break;
        case 'bufferFrom':value=[...(typeof args[0]==='string'?Buffer.from(args[0],encoding(args[1])):bytes(args[0]))];break;
        case 'bufferString':value=bytes(args[0]).toString(encoding(args[1]));break;
        case 'aesEncrypt':{
          if(typeof args[1]!=='string'||!/^aes-(128|192|256)-(cbc|ecb)$/.test(args[1]))fail('UNSUPPORTED');
          const data=cryptoBytes(args[0]),key=cryptoBytes(args[2]),ecb=args[1].endsWith('-ecb');
          const iv=args[3]===null||args[3]===undefined?Buffer.alloc(0):cryptoBytes(args[3]);
          if(key.length!==Number(args[1].split('-')[1])/8||iv.length!==(ecb?0:16))fail('UNSUPPORTED');
          const cipher=createCipheriv(args[1],key,ecb?null:iv);
          value=[...Buffer.concat([cipher.update(data),cipher.final()])];break;
        }
        default:fail('UNSUPPORTED');
      }
      return context.newString(JSON.stringify(value));
    });
    startHandle=consume(context.evalCode(BOOTSTRAP,'bridge.js'));
    consume(context.evalCode(input.script,'source.js')).dispose();check();
    async function pump(done,missingInit=false){
      while(!done()){
        check();
        if(runtime.hasPendingJob()){
          const result=runtime.executePendingJobs(1);if(result.error){result.error.dispose();check();fail('SCRIPT_ERROR');}
          if(++jobs>LIMITS.jobs)fail('TIMEOUT');
        } else {if(missingInit && pending.size===0)fail('MISSING_INIT');await new Promise(resolve=>setTimeout(resolve,2));}
      }
      check();
    }
    await pump(()=>!!sources,true);
    if(input.op==='inspect')return {ok:true,sources};
    phase='resolve';networkFailure=null;networkHttpStatus=0;
    const request=input.request;
    if(!request || request.action!=='musicUrl' || !Object.hasOwn(sources,request.source) || !sources[request.source].qualitys.includes(request.info?.type) || !request.info?.musicInfo || typeof request.info.musicInfo!=='object')fail('UNSUPPORTED');
    const arg=context.newString(JSON.stringify(request));let result;
    try{result=consume(context.callFunction(startHandle,context.undefined,arg));}finally{arg.dispose();}
    let state;
    try {await pump(()=>{state=context.getPromiseState(result);return state.type!=='pending';});
      if(state.type!=='fulfilled'){state.error?.dispose();fail('SOURCE_REJECTED');}
      const rawUrl=context.getString(state.value);state.value.dispose();const parsed=scriptHttpsUrl(rawUrl),url=parsed.href;
      if(!hosts.includes(parsed.hostname)){
        if(canSuggestHost(parsed.hostname))requiredHosts.add(parsed.hostname);
        fail('MEDIA_HOST_BLOCKED');
      }
      await network.validateUrl?.(url,true);check();return {ok:true,url};
    } finally {result.dispose();}
  } catch(err) {
    let code=err instanceof SourceError?err.code:'RUNTIME_ERROR';
    // Keep only trusted fixed transport reasons when the guest cannot recover.
    // Raw guest/server messages, URLs and headers never cross this boundary.
    if(networkFailure&&['SCRIPT_ERROR','MISSING_INIT','SOURCE_REJECTED'].includes(code))code=networkFailure;
    return {ok:false,code,error:ERRORS[code] || 'Audio source request failed.',
      ...(code==='HTTP_STATUS'&&networkHttpStatus?{httpStatus:networkHttpStatus}:{}),
      ...(['INIT_NETWORK_REQUIRED','HOST_BLOCKED','MEDIA_HOST_BLOCKED'].includes(code)&&requiredHosts.size?{requiredHosts:[...requiredHosts]}:{})};
  } finally {
    closed=true;for(const timer of timers.values())clearTimeout(timer.timer);timers.clear();
    for(const controller of controllers.values())controller.abort();network?.close();for(const deferred of pending)deferred.dispose();
    startHandle?.dispose();context?.dispose();runtime?.dispose();
  }
}
