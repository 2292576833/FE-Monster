import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { downloadScript } from '../download.mjs';

function fixture({body=Buffer.from('/** @name Own fixture */\nconst fixture = true;'), status=200, addresses=[{address:'8.8.8.8',family:4}], headers={}, never=false}={}) {
  const state={lookups:0,requests:[],destroyed:false};
  return {state, options:{
    lookup:async()=>{state.lookups++;return addresses;},
    request:(options,callback)=>{
      state.requests.push(options);const req=new EventEmitter();
      req.destroy=()=>{state.destroyed=true;};
      req.end=()=>{if(never)return;queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.destroy=()=>{};callback(res);res.emit('data',body);res.emit('end');});};
      return req;
    }
  }};
}

test('script URL requires public HTTPS .js and rejects credentials, ports and fragments before DNS',async()=>{
  const {state,options}=fixture();
  for(const url of ['http://api.example.org/a.js','https://api.example.org/a.txt','https://u:p@api.example.org/a.js','https://api.example.org:444/a.js','https://api.example.org/a.js#x','https://127.0.0.1/a.js','https://[::1]/a.js','file:///a.js']) await assert.rejects(downloadScript(url,options));
  assert.equal(state.lookups,0);
});
test('download pins only validated DNS and never sends inherited credentials',async()=>{
  const {state,options}=fixture();
  const result=await downloadScript('https://api.example.org/fixture.js?version=1',options);
  assert.match(result.script,/Own fixture/);assert.equal(state.lookups,1);
  const sent=state.requests[0];assert.equal(sent.method,'GET');assert.equal(sent.rejectUnauthorized,true);
  assert.deepEqual(Object.keys(sent.headers),['accept-encoding']);
  sent.lookup('api.example.org',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
});
test('download blocks mixed private DNS, redirects, unsuccessful status, oversized and invalid UTF-8 bodies',async()=>{
  for(const values of [{addresses:[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]},{status:302},{status:404},{body:Buffer.alloc(512*1024+1)},{body:Buffer.from([0xc3,0x28])},{body:Buffer.from('  ')},{headers:{'content-encoding':'gzip'}}]) {
    const {options}=fixture(values);await assert.rejects(downloadScript('https://api.example.org/a.js',options));
  }
});
test('download returns exact script bytes as UTF-8, including JSON-looking scripts',async()=>{
  const {options}=fixture({body:Buffer.from('"a quoted JS expression"')});
  assert.equal((await downloadScript('https://api.example.org/a.js',options)).script,'"a quoted JS expression"');
});
test('download deadline aborts request without exposing URL query secrets',async()=>{
  const {state,options}=fixture({never:true});
  await assert.rejects(downloadScript('https://api.example.org/a.js?key=SECRET',{...options,limits:{requestMs:20,totalMs:30}}),error=>!error.message.includes('SECRET'));
  assert.equal(state.destroyed,true);
});
