import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export class SourceError extends Error {
  constructor(code) { super(code); this.code=code; }
}
export const fail = code => { throw new SourceError(code); };
export function isPublicIP(address) {
  try {
    if (!isIP(address) || address.includes('%')) return false;
    const ip=ipaddr.parse(address);
    if (ip.kind()==='ipv6' && !ip.match(ipaddr.parse('2000::'),3)) return false;
    return ip.range()==='unicast';
  } catch { return false; }
}
export function normalizeHosts(hosts) {
  if (!Array.isArray(hosts) || hosts.length>32) fail('INVALID_HOSTS');
  return [...new Set(hosts.map(host=>{
    if(typeof host!=='string' || host.length>253 || host!==host.trim()) fail('INVALID_HOSTS');
    const value=host.toLowerCase();
    if(isIP(value) || !value.includes('.') || !value.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s))) fail('INVALID_HOSTS');
    return value;
  }))];
}
export function parsePublicUrl(raw) {
  if(typeof raw!=='string' || raw.length>8192 || /[\u0000-\u0020\u007f\\]/.test(raw)) fail('URL_BLOCKED');
  let url;try {url=new URL(raw);}catch {fail('URL_BLOCKED');}
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || url.hash) fail('URL_BLOCKED');
  if (url.hostname.startsWith('[') || isIP(url.hostname)) fail('URL_BLOCKED');
  normalizeHosts([url.hostname]);
  return url;
}
const defaults={requestBytes:128*1024,responseBytes:1024*1024,totalResponseBytes:4*1024*1024,maxRequests:12,requestMs:6000,totalMs:12000};
class VerifiedAddressAgent extends https.Agent {
  getName(options={}) {
    // Node's key already isolates hostname and TLS settings. Partition again by
    // the complete DNS result validated for this request, including on reuse.
    return `${super.getName(options)}:dns=${options.verifiedAddressKey || ''}`;
  }
}
export function createNetwork(allowedHosts, options={}) {
  const hosts=new Set(normalizeHosts(allowedHosts));
  const limits={...defaults,...options.limits};
  const lookup=options.lookup || dnsLookup;
  const transport=options.request || https.request;
  const deadline=Date.now()+limits.totalMs;
  const active=new Set();let count=0,totalBytes=0,closed=false,agent=null;
  const bounded = async (promise,ms) => {
    let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new SourceError('NETWORK_TIMEOUT')),Math.max(1,ms));})]);}finally{clearTimeout(timer);}
  };
  async function validateUrl(raw,requireAllowed=false) {
    if(closed || Date.now()>=deadline) fail('NETWORK_TIMEOUT');
    const url=parsePublicUrl(raw);
    if(requireAllowed && !hosts.has(url.hostname)) fail('HOST_BLOCKED');
    let answers;
    try {answers=await bounded(lookup(url.hostname,{all:true,verbatim:true}),Math.min(limits.requestMs,deadline-Date.now()));}
    catch {fail('DNS_FAILED');}
    if(!Array.isArray(answers) || !answers.length || answers.some(a=>!isPublicIP(a.address) || isIP(a.address)!==a.family)) fail('ADDRESS_BLOCKED');
    return {url,addresses:answers.map(({address,family})=>({address,family}))};
  }
  async function request(raw,opts={},signal) {
    if(signal?.aborted)fail('NETWORK_CANCELLED');
    if(++count>limits.maxRequests) fail('REQUEST_LIMIT');
    if(!opts || typeof opts!=='object' || Array.isArray(opts)) fail('REQUEST_INVALID');
    if(Object.keys(opts).some(k=>!['method','headers','body','form','timeout','follow_max'].includes(k))) fail('REQUEST_UNSUPPORTED');
    // LX/Needle sources routinely include this hint even for direct endpoints.
    // Accept bounded syntax, but our transport still follows zero redirects.
    if(opts.follow_max!==undefined && (!Number.isSafeInteger(opts.follow_max)||opts.follow_max<0||opts.follow_max>10))fail('REQUEST_UNSUPPORTED');
    const method=opts.method || 'GET';if(!['GET','POST'].includes(method)) fail('REQUEST_UNSUPPORTED');
    let body=opts.body;const headers=Object.create(null);
    if(opts.headers) {
      if(typeof opts.headers!=='object' || Array.isArray(opts.headers) || Object.keys(opts.headers).length>32) fail('REQUEST_INVALID');
      for(const [key,value] of Object.entries(opts.headers)) {
        if(!/^[a-zA-Z0-9-]{1,64}$/.test(key) || typeof value!=='string' || value.length>4096 || /[\r\n]/.test(value)) fail('REQUEST_INVALID');
        if(['host','connection','content-length','transfer-encoding','upgrade','proxy-authorization','proxy-connection','accept-encoding'].includes(key.toLowerCase())) fail('HEADER_BLOCKED');
        headers[key.toLowerCase()]=value;
      }
    }
    if(opts.form!==undefined) {
      if(body!==undefined || !opts.form || typeof opts.form!=='object' || Array.isArray(opts.form)) fail('REQUEST_INVALID');
      body=new URLSearchParams(opts.form).toString();headers['content-type']='application/x-www-form-urlencoded';
    } else if(body!==undefined && typeof body!=='string') {body=JSON.stringify(body);headers['content-type'] ||= 'application/json';}
    if(body!==undefined && (method==='GET' || Buffer.byteLength(body)>limits.requestBytes)) fail('REQUEST_SIZE');
    if(Buffer.byteLength(JSON.stringify(headers))>16384) fail('REQUEST_SIZE');
    headers['accept-encoding']='identity';if(body!==undefined) headers['content-length']=String(Buffer.byteLength(body));
    const {url,addresses}=await validateUrl(raw,true);
    const verifiedAddressKey=[...new Set(addresses.map(({address,family})=>`${family}:${address}`))].sort().join(',');
    const timeout=Math.min(limits.requestMs,deadline-Date.now(),Number.isFinite(opts.timeout) && opts.timeout>0 ? opts.timeout : limits.requestMs);
    if(timeout<=0 || closed) fail('NETWORK_TIMEOUT');
    if(signal?.aborted)fail('NETWORK_CANCELLED');
    agent ||= new VerifiedAddressAgent({keepAlive:true,maxSockets:12,maxTotalSockets:12,maxFreeSockets:2,
      maxCachedSessions:12,scheduling:'lifo',timeout:Math.min(5000,limits.requestMs)});
    return new Promise((resolve,reject)=>{
      let req,timer,finished=false;
      const finish=(code,value)=>{
        if(finished)return;finished=true;clearTimeout(timer);active.delete(cancel);signal?.removeEventListener('abort',cancel);
        if(code){req?.destroy();reject(new SourceError(code));}else resolve(value);
      };
      const cancel=()=>finish('NETWORK_CANCELLED');active.add(cancel);
      signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>finish('NETWORK_TIMEOUT'),timeout);
      try {
        req=transport({protocol:'https:',hostname:url.hostname,port:443,path:url.pathname+url.search,method,headers,
          servername:url.hostname,rejectUnauthorized:true,agent,verifiedAddressKey,maxHeaderSize:16384,
          // Try both address families without resolving again or replaying HTTP requests.
          autoSelectFamily:true,autoSelectFamilyAttemptTimeout:250,
          lookup:(_hostname,lookupOptions,callback)=>lookupOptions?.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family),
        },res=>{
          if(res.statusCode>=300 && res.statusCode<400) {res.destroy();finish('REDIRECT_BLOCKED');return;}
          if(res.headers['content-encoding'] && res.headers['content-encoding']!=='identity') {res.destroy();finish('ENCODING_UNSUPPORTED');return;}
          const chunks=[];let bytes=0;
          res.on('data',chunk=>{
            if(finished)return;bytes+=chunk.length;totalBytes+=chunk.length;
            if(bytes>limits.responseBytes || totalBytes>limits.totalResponseBytes){res.destroy();finish('RESPONSE_SIZE');return;}
            chunks.push(chunk);
          });
          res.on('error',()=>finish('NETWORK_FAILED'));res.on('aborted',()=>finish('NETWORK_FAILED'));
          res.on('end',()=>{
            if(finished)return;
            let body=Buffer.concat(chunks);
            if(options.responseType!=='bytes'){body=body.toString('utf8');try{body=JSON.parse(body);}catch{}}
            finish(null,{statusCode:res.statusCode,headers:res.headers,body});
          });
        });
        req.on('error',()=>finish('NETWORK_FAILED'));req.end(body);
      } catch {finish('NETWORK_FAILED');}
    });
  }
  return {request,validateUrl,close(){closed=true;for(const cancel of [...active])cancel();agent?.destroy();}};
}
