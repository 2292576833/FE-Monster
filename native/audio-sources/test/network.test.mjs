import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { createNetwork, isPublicIP, normalizeHosts } from '../network.mjs';

test('IPv4/IPv6 private, special, mapped, multicast, reserved and documentation addresses blocked',()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.1.1','0.0.0.0','100.64.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.1.1.1','::1','::','fc00::1','fe80::1','ff02::1','::ffff:8.8.8.8','2001:db8::1','2002:0808:0808::1']) assert.equal(isPublicIP(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(isPublicIP(ip),true,ip);
});
test('allowlist accepts exact ASCII hostnames only',()=>{
  assert.deepEqual(normalizeHosts(['Api.Example.org']),['api.example.org']);
  for(const host of ['*.example.org','https://example.org','127.0.0.1','localhost','x..test','example.org.','user@example.org','example.org:443']) assert.throws(()=>normalizeHosts([host]));
});
function fixture({addresses=[{address:'8.8.8.8',family:4}],status=200,body='{"url":"ok"}',limit={},never=false}={}) {
  const state={lookups:0,requests:[],destroyed:false};
  const network=createNetwork(['api.example.org'],{
    limits:limit,
    lookup:async()=>{state.lookups++;return addresses;},
    request:(options,callback)=>{
      state.requests.push(options); const req=new EventEmitter(); req.end=()=>{if(never)return;queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':'application/json'};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(body));res.emit('end');});};
      req.destroy=()=>{state.destroyed=true;};return req;
    }
  });return {network,state};
}
test('scheme, host, credentials and ports rejected before DNS',async()=>{
  const {network,state}=fixture();
  for(const url of ['http://api.example.org','https://sub.api.example.org','https://api.example.org.evil.test','https://u:p@api.example.org','https://api.example.org:444','https://127.0.0.1']) await assert.rejects(network.request(url,{}));
  assert.equal(state.lookups,0); network.close();
});
test('every DNS answer checked and selected address pinned into connection',async()=>{
  const bad=fixture({addresses:[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]});
  await assert.rejects(bad.network.request('https://api.example.org',{}));assert.equal(bad.state.requests.length,0);bad.network.close();
  const {network,state}=fixture(); await network.request('https://api.example.org/path',{});
  assert.equal(state.lookups,1); assert.equal(state.requests[0].servername,'api.example.org');
  state.requests[0].lookup('api.example.org',{},(err,address,family)=>{assert.equal(err,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
  assert.equal(state.requests[0].rejectUnauthorized,true);assert.ok(state.requests[0].agent instanceof https.Agent);network.close();
});

test('IPv6/IPv4 connection fallback uses only the already verified DNS answers',async()=>{
  const addresses=[{address:'2606:4700:4700::1111',family:6},{address:'8.8.8.8',family:4},{address:'1.1.1.1',family:4}];
  const {network,state}=fixture({addresses});
  try {
    await network.request('https://api.example.org/path',{method:'POST',body:'once'});
    const sent=state.requests[0];
    assert.equal(sent.autoSelectFamily,true,'an unreachable first address must not prevent trying the other validated addresses');
    assert.equal(sent.autoSelectFamilyAttemptTimeout,250);
    sent.lookup('api.example.org',{all:true},(error,candidates)=>{
      assert.equal(error,null);
      assert.deepEqual(candidates,addresses);
    });
    assert.equal(state.lookups,1,'connection fallback must not perform another unchecked DNS lookup');
    assert.equal(state.requests.length,1,'connection fallback must not replay the HTTP request body');
  } finally {network.close();}
  const mixed=fixture({addresses:[...addresses,{address:'::1',family:6}]});
  try {
    await assert.rejects(mixed.network.request('https://api.example.org',{}),error=>error.code==='ADDRESS_BLOCKED');
    assert.equal(mixed.state.requests.length,0,'a private candidate must reject the entire DNS result before connecting');
  } finally {mixed.network.close();}
});
test('redirects, oversized response/body and excessive counts rejected',async()=>{
  for(const options of [{status:302},{body:'x'.repeat(100),limit:{responseBytes:20}}]) {const {network}=fixture(options);await assert.rejects(network.request('https://api.example.org',{}));network.close();}
  const {network,state}=fixture({limit:{requestBytes:20,maxRequests:1}});
  await assert.rejects(network.request('https://api.example.org',{method:'POST',body:'x'.repeat(100)}));
  await assert.rejects(network.request('https://api.example.org',{})); assert.equal(state.requests.length,0);network.close();
});
test('request timeout destroys socket and redacts remote errors',async()=>{
  const {network,state}=fixture({never:true,limit:{requestMs:30}});
  await assert.rejects(network.request('https://api.example.org/?token=SECRET',{}),err=>!err.message.includes('SECRET'));
  assert.equal(state.destroyed,true);network.close();
});
test('cancellation destroys the active request',async()=>{
  const {network,state}=fixture({never:true});const controller=new AbortController();
  const result=network.request('https://api.example.org',{},controller.signal);
  await new Promise(resolve=>setImmediate(resolve));controller.abort();
  await assert.rejects(result);assert.equal(state.destroyed,true);network.close();
});
test('forbidden HTTP headers and unsupported options cannot alter transport',async()=>{
  const {network,state}=fixture();
  for(const opts of [{headers:{Host:'localhost'}},{headers:{'proxy-authorization':'secret'}},{formData:{}},{method:'CONNECT'},{agent:'custom'}]) await assert.rejects(network.request('https://api.example.org',opts));
  assert.equal(state.requests.length,0);network.close();
});
test('LX follow_max hints do not reject ordinary requests or enable redirects',async()=>{
  const {network,state}=fixture();
  try {
    const result=await network.request('https://api.example.org/path',{method:'GET',follow_max:5});
    assert.equal(result.statusCode,200);
    assert.equal(state.requests.length,1);
    assert.equal(state.requests[0].follow_max,undefined,'guest hint must not reach native transport');
  } finally {network.close();}
  const redirect=fixture({status:302});
  try {
    await assert.rejects(redirect.network.request('https://api.example.org/path',{follow_max:5}),error=>error.code==='REDIRECT_BLOCKED');
    assert.equal(redirect.state.requests.length,1,'never follow the response Location');
  } finally {redirect.network.close();}
  for(const value of [-1,1.5,'5',{},true,1000]) {
    const invalid=fixture();
    try {
      await assert.rejects(invalid.network.request('https://api.example.org/path',{follow_max:value}));
      assert.equal(invalid.state.lookups,0);
    } finally {invalid.network.close();}
  }
});
test('hanging DNS lookup is bounded',async()=>{
  const network=createNetwork(['api.example.org'],{lookup:()=>new Promise(()=>{}),limits:{requestMs:20}});
  await assert.rejects(network.request('https://api.example.org',{}));network.close();
});
