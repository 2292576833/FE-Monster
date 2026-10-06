import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../runtime.mjs';
import { SourceError } from '../network.mjs';

const init=`lx.send('inited',{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});`;
const resolving=(handler,hosts=['api.example.org','media.example.org'])=>({
  op:'resolve',script:init+`lx.on('request',${handler});`,allowedHosts:hosts,
  request:{source:'wy',action:'musicUrl',info:{type:'128k',musicInfo:{songmid:'fixture'}}}
});
const viaRequest=`()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/song?token=SECRET',{},(error,response,body)=>error?reject(new Error('upstream failed')):resolve(body.url)))`;

test('missing request and media permissions report only the exact hostname without networking',async()=>{
  let connections=0;
  const network={request(){connections++;throw Error('unexpected');},async validateUrl(){connections++;},close(){}};
  const api=await execute(resolving(viaRequest,[]),{network});
  assert.equal(api.code,'HOST_BLOCKED');
  assert.deepEqual(api.requiredHosts,['api.example.org']);
  assert.doesNotMatch(JSON.stringify(api),/SECRET|token|\/song/);
  const media=await execute(resolving(`()=>'https://cdn.example.org/private/path?token=SECRET'`),{network});
  assert.equal(media.code,'MEDIA_HOST_BLOCKED');
  assert.deepEqual(media.requiredHosts,['cdn.example.org']);
  assert.doesNotMatch(JSON.stringify(media),/SECRET|token|private/);
  assert.equal(connections,0);
});

test('failed resolution retains bounded network reasons instead of generic guest error text',async()=>{
  for(const code of ['NETWORK_TIMEOUT','DNS_FAILED','NETWORK_FAILED','REQUEST_UNSUPPORTED','ENCODING_UNSUPPORTED','REDIRECT_BLOCKED','ADDRESS_BLOCKED']) {
    const result=await execute(resolving(viaRequest),{network:{async request(){throw new SourceError(code);},close(){}}});
    assert.equal(result.code,code);
    assert.doesNotMatch(JSON.stringify(result),/SECRET|upstream failed|\/song|token/);
  }
  const result=await execute(resolving(viaRequest),{network:{async request(){throw Error('SECRET https://private/?token=SECRET');},close(){}}});
  assert.equal(result.code,'NETWORK_FAILED');
  assert.doesNotMatch(JSON.stringify(result),/SECRET|token|private/);
});

test('a script may recover from a network failure without a false failure result',async()=>{
  const fallback=`()=>new Promise(resolve=>lx.request('https://api.example.org/song',{},()=>resolve('https://media.example.org/fixture.mp3')))`;
  const result=await execute(resolving(fallback),{network:{async request(){throw new SourceError('NETWORK_FAILED');},async validateUrl(){},close(){}}});
  assert.deepEqual(result,{ok:true,url:'https://media.example.org/fixture.mp3'});
});

test('recovered initialization failures do not replace unrelated resolution script errors',async()=>{
  const script=`lx.request('https://api.example.org/init',{},()=>{${init}});lx.on('request',()=>{throw Error('SECRET');});`;
  const input=resolving('()=>{}');input.script=script;
  const result=await execute(input,{network:{async request(){throw new SourceError('NETWORK_FAILED');},close(){}}});
  assert.equal(result.code,'SCRIPT_ERROR');
  assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});

test('unusable HTTP status retains only the numeric status when the source rejects its body',async()=>{
  const rejecting=`()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/song',{},()=>reject(new Error('SECRET_SERVER_BODY'))))`;
  const result=await execute(resolving(rejecting),{network:{async request(){return {statusCode:503,headers:{},body:'SECRET_SERVER_BODY'};},close(){}}});
  assert.equal(result.code,'HTTP_STATUS');
  assert.equal(result.httpStatus,503);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|api\.example|\/song/);
});

test('an HTTP failure recovered by a later request does not attach stale status diagnostics',async()=>{
  let calls=0;
  const handler=`()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/optional',{},()=>{
    lx.request('https://api.example.org/song',{},()=>reject(Error('PRIVATE_NO_SONG')));
  }))`;
  const result=await execute(resolving(handler),{network:{async request(){
    return {statusCode:++calls===1?502:200,headers:{},body:{}};
  },close(){}}});
  assert.equal(result.code,'SOURCE_REJECTED');
  assert.equal(result.httpStatus,undefined);
});

test('initialization transport failure is distinct from a broken script',async()=>{
  const script=`lx.request('https://api.example.org/init',{},error=>{if(error)throw Error('SECRET');${init}});`;
  const result=await execute({op:'inspect',script,allowedHosts:['api.example.org']},{network:{async request(){throw new SourceError('NETWORK_TIMEOUT');},close(){}}});
  assert.equal(result.code,'NETWORK_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result),/SECRET/);
});

test('an initialized source rejecting a song is not reported as initialization failure',async()=>{
  const result=await execute(resolving(`async()=>{throw Error('PRIVATE_RESPONSE https://api.example.org/?secret=TOKEN');}`));
  assert.equal(result.code,'SOURCE_REJECTED');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TOKEN|secret|api\.example/);
});

test('a recovered optional request cannot mask a later successful response rejecting the song',async()=>{
  let calls=0;
  const handler=`()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/optional',{},()=>{
    lx.request('https://api.example.org/song',{},()=>reject(Error('PRIVATE_NO_SONG')));
  }))`;
  const result=await execute(resolving(handler),{network:{async request(){
    if(++calls===1)throw new SourceError('NETWORK_FAILED');
    return {statusCode:200,headers:{},body:{code:404}};
  },close(){}}});
  assert.equal(calls,2);
  assert.equal(result.code,'SOURCE_REJECTED');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|optional|\/song/);
});
