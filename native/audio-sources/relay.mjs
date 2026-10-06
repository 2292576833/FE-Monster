import https from 'node:https';
import { createNetwork, fail } from './network.mjs';

export const RELAY_LIMITS=Object.freeze({connectMs:8000,idleMs:15000,totalMs:3600000,maxBytes:8*1024*1024*1024});
function validateRange(value) {
  if(value===undefined)return;
  if(typeof value!=='string' || !/^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/.test(value))fail('RANGE_INVALID');
  const [start,end]=value.slice(6).split('-');
  if((!start && Number(end)===0) || (start && end && Number(start)>Number(end)))fail('RANGE_INVALID');
}
function responseHeaders(headers) {
  const type=headers['content-type'];
  if(typeof type!=='string' || type.length>200 || !/^(?:audio\/[a-z0-9.+-]+|application\/octet-stream)(?:\s*;[^\r\n]*)?$/i.test(type))fail('MEDIA_TYPE_BLOCKED');
  if(headers['content-encoding'] && headers['content-encoding']!=='identity')fail('MEDIA_ENCODING_BLOCKED');
  const result={'content-type':type};
  if(headers['content-length']!==undefined){if(typeof headers['content-length']!=='string'||!/^\d{1,12}$/.test(headers['content-length'])||Number(headers['content-length'])>RELAY_LIMITS.maxBytes)fail('MEDIA_HEADER_BLOCKED');result['content-length']=headers['content-length'];}
  if(headers['content-range']!==undefined){if(typeof headers['content-range']!=='string'||!/^bytes (?:\d{1,15}-\d{1,15}|\*)\/(?:\d{1,15}|\*)$/.test(headers['content-range']))fail('MEDIA_HEADER_BLOCKED');result['content-range']=headers['content-range'];}
  if(headers['accept-ranges']!==undefined){if(!['bytes','none'].includes(headers['accept-ranges']))fail('MEDIA_HEADER_BLOCKED');result['accept-ranges']=headers['accept-ranges'];}
  return result;
}

// Trusted media transport only: no QuickJS, scripts, cookies, account headers or redirects.
export async function relay(input,options={}) {
  const output=options.output || process.stdout,transport=options.request || https.request;
  const limits={...RELAY_LIMITS,...options.limits};
  const connectDeadline=Date.now()+limits.connectMs;
  let headerSent=false,request,response,connectTimer,idleTimer,totalTimer,validator,streamError;
  const writing=new Set();
  const write=bytes=>new Promise((resolve,reject)=>{
    writing.add(reject);output.write(bytes,error=>{writing.delete(reject);error?reject(error):resolve();});
  });
  let rejectTransport;
  const stop=error=>{
    streamError ||= error instanceof Error?error:Error('Media transfer stopped');
    request?.destroy(streamError);response?.destroy(streamError);rejectTransport?.(streamError);
    for(const reject of writing)reject(streamError);
  };
  const idle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(stop,limits.idleMs);};
  output.on('error',stop);output.on('close',stop);
  try {
    if(!input || typeof input!=='object' || Object.keys(input).some(k=>!['url','allowedHosts','method','range'].includes(k)) || !['GET','HEAD'].includes(input.method))fail('RELAY_INPUT');
    validateRange(input.range);
    validator=createNetwork(input.allowedHosts,{lookup:options.lookup,limits:{requestMs:limits.connectMs,totalMs:limits.connectMs}});
    const {url,addresses}=await validator.validateUrl(input.url,true);
    if(streamError)throw streamError;
    const headers={'accept-encoding':'identity'};if(input.range)headers.range=input.range;
    totalTimer=setTimeout(stop,limits.totalMs);
    response=await new Promise((resolve,reject)=>{
      rejectTransport=reject;
      connectTimer=setTimeout(stop,Math.max(1,connectDeadline-Date.now()));
      request=transport({protocol:'https:',hostname:url.hostname,port:443,path:url.pathname+url.search,method:input.method,headers,
        servername:url.hostname,rejectUnauthorized:true,agent:false,maxHeaderSize:16384,
        autoSelectFamily:true,autoSelectFamilyAttemptTimeout:250,
        lookup:(_hostname,opts,callback)=>opts?.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family),
      },res=>{
        // Install this before metadata output: that write can remain blocked
        // while the response fails, before the async iterator owns the stream.
        response=res;
        res.on('error',stop);
        res.once('close',()=>res.removeListener('error',stop));
        if(streamError){res.destroy(streamError);return;}
        clearTimeout(connectTimer);idle();resolve(res);
      });
      request.on('error',stop);
      request.on('socket',socket=>socket.once('secureConnect',()=>{clearTimeout(connectTimer);idle();}));
      request.end();
    });
    if(![200,206].includes(response.statusCode))fail('MEDIA_STATUS_BLOCKED');
    const safeHeaders=responseHeaders(response.headers);
    headerSent=true;await write(Buffer.from(JSON.stringify({ok:true,status:response.statusCode,headers:safeHeaders})+'\n'));
    if(input.method==='HEAD'){response.destroy();return true;}
    let bytes=0;
    for await(const chunk of response){
      if(streamError)throw streamError;idle();bytes+=chunk.length;if(bytes>limits.maxBytes)fail('MEDIA_SIZE');
      await write(chunk);
    }
    if(streamError)throw streamError;
    if(safeHeaders['content-length']!==undefined && bytes!==Number(safeHeaders['content-length']))fail('MEDIA_TRUNCATED');
    return true;
  } catch {
    request?.destroy();response?.destroy();
    if(!headerSent){try{await write(Buffer.from('{"ok":false,"code":"MEDIA_REJECTED","error":"Media destination or response rejected."}\n'));}catch{}}
    return false;
  } finally {
    clearTimeout(connectTimer);clearTimeout(idleTimer);clearTimeout(totalTimer);validator?.close();
    output.removeListener('error',stop);output.removeListener('close',stop);
    request?.destroy();response?.destroy();
  }
}
