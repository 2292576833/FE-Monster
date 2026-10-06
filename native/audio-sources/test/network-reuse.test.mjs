import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createNetwork } from '../network.mjs';

// TEST ONLY: self-signed localhost fixture, not production credentials. The
// client explicitly trusts this certificate and verifies the requested hostname.
const key=readFileSync(new URL('./fixtures/network-key.pem',import.meta.url));
const cert=readFileSync(new URL('./fixtures/network-cert.pem',import.meta.url));
const publicAddresses=[{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(handler=(_req,res)=>res.end('{"ok":true}'),limits={}) {
  const state={lookups:0,requests:0,handshakes:0,reused:[],agents:[],sockets:new Set(),addresses:publicAddresses};
  const server=https.createServer({key,cert},(req,res)=>{state.requests++;handler(req,res);});
  server.on('secureConnection',socket=>{state.handshakes++;state.sockets.add(socket);socket.once('close',()=>state.sockets.delete(socket));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const network=createNetwork(['api.example.org','other.example.org'],{
    limits,
    lookup:async()=>{state.lookups++;return state.addresses;},
    request:(options,callback)=>{
      assert.equal(options.rejectUnauthorized,true);
      state.agents.push(options.agent);
      return https.request({...options,port:server.address().port,ca:cert,
        lookup:(_host,lookupOptions,done)=>lookupOptions?.all?done(null,[{address:'127.0.0.1',family:4}]):done(null,'127.0.0.1',4)
      },response=>{state.reused.push(response.req.reusedSocket);callback(response);});
    }
  });
  return {network,state,async close(){network.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

test('sequential requests reuse verified TLS connections while every request rechecks DNS',async()=>{
  const f=await fixture();
  try {
    for(let i=0;i<4;i++)assert.equal((await f.network.request('https://api.example.org/data')).body.ok,true);
    assert.equal(f.state.lookups,4);
    assert.equal(f.state.handshakes,1);
    assert.deepEqual(f.state.reused,[false,true,true,true]);
    const agent=f.state.agents[0];
    assert.ok(agent instanceof https.Agent);
    assert.equal(agent.maxSockets,12);assert.equal(agent.maxTotalSockets,12);assert.equal(agent.maxFreeSockets,2);
    assert.equal(new Set(f.state.agents).size,1);
    f.network.close();await tick();
    assert.ok([...Object.values(agent.freeSockets),...Object.values(agent.sockets)].flat().every(socket=>socket.destroyed));
    await assert.rejects(f.network.request('https://api.example.org/data'),error=>error.code==='NETWORK_TIMEOUT');
  } finally {await f.close();}
});

test('an idle connection expires within its bounded keep-alive timeout',async()=>{
  const f=await fixture(undefined,{requestMs:120});
  try {
    await f.network.request('https://api.example.org/data');
    assert.equal(f.state.handshakes,1);
    const deadline=Date.now()+1000;
    while(f.state.sockets.size&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(f.state.sockets.size,0,'idle sockets must not survive indefinitely');
    await f.network.request('https://api.example.org/data');
    assert.equal(f.state.handshakes,2,'expired connections are replaced');
    assert.equal(f.state.lookups,2);
  } finally {await f.close();}
});

test('DNS changes partition sockets, reordered equal answers can reuse, private rebinding is rejected before transport',async()=>{
  const f=await fixture();
  try {
    await f.network.request('https://api.example.org/data');
    f.state.addresses=[...publicAddresses].reverse();
    await f.network.request('https://api.example.org/data');
    assert.equal(f.state.handshakes,1,'answer order must not churn the connection');
    f.state.addresses=[{address:'1.1.1.1',family:4}];
    await f.network.request('https://api.example.org/data');
    assert.equal(f.state.handshakes,2,'a changed address set must not use the former socket');
    f.state.addresses=[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}];
    await assert.rejects(f.network.request('https://api.example.org/data'),error=>error.code==='ADDRESS_BLOCKED');
    assert.equal(f.state.requests,3);assert.equal(f.state.agents.length,3);assert.equal(f.state.lookups,4);
    f.state.addresses=[{address:'1.1.1.1',family:4}];
    await f.network.request('https://other.example.org/data');
    assert.equal(f.state.handshakes,3,'a different hostname must never reuse a socket despite equal addresses');
  } finally {await f.close();}
});

test('concurrent requests retain the 12-request concurrency budget and close releases active sockets',async()=>{
  const pending=[];
  const f=await fixture((req,res)=>pending.push(res));
  try {
    const results=Array.from({length:12},()=>f.network.request('https://api.example.org/data').catch(error=>error.code));
    const deadline=Date.now()+3000;
    while(pending.length<12&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(pending.length,12,'reuse must not serialize the former concurrent request budget');
    f.network.close();
    assert.deepEqual(await Promise.all(results),Array(12).fill('NETWORK_CANCELLED'));
    await tick();
    assert.ok(f.state.agents.every(agent=>Object.values(agent.sockets).flat().every(socket=>socket.destroyed)));
  } finally {await f.close();}
});

test('timeout and abort destroy reused requests without replaying HTTP POSTs',async()=>{
  const bodies=[];
  const f=await fixture((req,res)=>{let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{bodies.push(body);if(req.url==='/warm')res.end('{"ok":true}');});});
  try {
    await f.network.request('https://api.example.org/warm');
    await assert.rejects(f.network.request('https://api.example.org/hang',{method:'POST',body:'one',timeout:40}),error=>error.code==='NETWORK_TIMEOUT');
    assert.equal(f.state.handshakes,1,'the timeout test must actually use a reused socket');
    const controller=new AbortController();
    const result=f.network.request('https://api.example.org/hang',{method:'POST',body:'two'},controller.signal);
    const rejection=assert.rejects(result,error=>error.code==='NETWORK_CANCELLED');
    while(f.state.requests<3)await new Promise(resolve=>setTimeout(resolve,5));
    controller.abort();await rejection;
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(bodies,['','one','two']);assert.equal(f.state.requests,3,'a failed or cancelled POST is never retried');
  } finally {await f.close();}
});
