import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../runtime.mjs';

const init = `lx.send(lx.EVENT_NAMES.inited,{status:true,sources:{wy:{name:'fixture',type:'music',actions:['musicUrl'],qualitys:['128k','320k']}}});`;
const script = `${init} lx.on(lx.EVENT_NAMES.request, async ({source,action,info}) => 'https://media.example.org/'+info.musicInfo.id+'.mp3');`;
const input = (op='inspect', code=script) => ({op,script:code,allowedHosts:['api.example.org','media.example.org'],request:{source:'wy',action:'musicUrl',info:{type:'128k',musicInfo:{id:'fixture'}}}});

test('inspect uses real QuickJS and reports declared source', async () => {
  const result = await execute(input());
  assert.equal(result.ok,true); assert.deepEqual(result.sources.wy.qualitys,['128k','320k']);
});
test('resolve passes song info to asynchronous handler', async () => {
  assert.deepEqual(await execute(input('resolve'),{lookup:async()=>[{address:'8.8.8.8',family:4}]}), {ok:true,url:'https://media.example.org/fixture.mp3'});
});
test('undeclared action, type and source are rejected', async () => {
  for (const alter of [i=>i.request.action='lyric',i=>i.request.info.type='flac',i=>i.request.source='kw']) {
    const i=input('resolve'); alter(i); assert.equal((await execute(i)).code,'UNSUPPORTED');
  }
});
test('missing init, syntax and script errors are sanitized', async () => {
  for (const code of ['', 'let = ;', `throw Error('SECRET https://foo/?token=SECRET C:/private');`]) {
    const result=await execute(input('inspect',code)); assert.equal(result.ok,false);
    assert.doesNotMatch(JSON.stringify(result),/SECRET|private|token/);
  }
});
test('guest has no process, require, environment, DOM or host Function constructor', async () => {
  const code=`if ([typeof process,typeof require,typeof window,typeof document,typeof fetch,typeof Buffer].some(x=>x!=='undefined')) throw Error('escape'); if(lx.send.constructor('return typeof process')()!=='undefined') throw Error('escape'); ${init}`;
  assert.equal((await execute(input('inspect',code))).ok,true);
});
test('infinite loop, promise churn and unresolved promise are bounded', async () => {
  for(const code of ['while(true){}', `${init} lx.on('request',()=>new Promise(()=>{}));`, `${init} lx.on('request',async()=>{while(true) await Promise.resolve();});`]) {
    const started=Date.now(); const result=await execute(input('resolve',code),{timeoutMs:100});
    assert.equal(result.ok,false); assert.ok(Date.now()-started<2500);
  }
});
test('guest heap exhaustion fails without leaking error contents', async () => {
  const result=await execute(input('inspect',`const a=[];for(;;)a.push('x'.repeat(100000));`),{timeoutMs:500});
  assert.equal(result.ok,false); assert.ok(JSON.stringify(result).length<300);
});
test('callback HTTP bridge supports json body and async init', async () => {
  const code=`lx.request('https://api.example.org/init',{method:'GET'},(err,resp,body)=>{if(err)throw err; ${init} }); lx.on('request',()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/song',{method:'POST',body:{id:1}},(err,resp,body)=>err?reject(err):resolve(body.url))));`;
  const network={request:async()=>({statusCode:200,headers:{},body:{url:'https://media.example.org/test.mp3'}}),close(){}};
  assert.deepEqual(await execute(input('resolve',code),{network}),{ok:true,url:'https://media.example.org/test.mp3'});
});
test('result cannot name local or credential URLs', async () => {
  for(const url of ['http://x.test/a','https://127.0.0.1/a','https://u:p@public.test/a','file:///secret']) {
    assert.equal((await execute(input('resolve',`${init} lx.on('request',()=>${JSON.stringify(url)});`))).ok,false);
  }
});
test('official inited envelope does not require legacy status field',async()=>{
  assert.equal((await execute(input('inspect',init.replace('status:true,','')))).ok,true);
});
test('buffer helpers, MD5 and randomBytes run through bounded JSON utility bridge',async()=>{
  const code=`const {buffer,crypto}=lx.utils;if(buffer.bufToString(buffer.from('hello'),'base64')!=='aGVsbG8=')throw Error();if(crypto.md5('hello')!=='5d41402abc4b2a76b9719d911017c592')throw Error();if(crypto.randomBytes(4).length!==4)throw Error();${init}`;
  assert.equal((await execute(input('inspect',code))).ok,true);
});
test('resolved URL checks every DNS answer without making an HTTP request',async()=>{
  const result=await execute(input('resolve'),{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'::1',family:6}]});
  assert.equal(result.code,'ADDRESS_BLOCKED');
});
test('resolved CDN hostname must be explicitly allowed',async()=>{
  const i=input('resolve');i.allowedHosts=['api.example.org'];
  assert.equal((await execute(i)).code,'MEDIA_HOST_BLOCKED');
});
