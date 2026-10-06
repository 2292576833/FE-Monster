import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { relay } from '../relay.mjs';

function fixture({address='8.8.8.8',status=206,headers={'content-type':'audio/mpeg','content-length':'6','content-range':'bytes 0-5/6'},body=[Buffer.from([0,1,2]),Buffer.from([3,254,255])]}={}) {
  const chunks=[],state={requests:[]};
  const output=new Writable({write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));setImmediate(callback);}});
  const options={output,lookup:async()=>[{address,family:4}],request:(opts,cb)=>{
    state.requests.push(opts);const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=Readable.from(body);res.statusCode=status;res.headers=headers;cb(res);});return req;
  }};return {options,state,result:()=>Buffer.concat(chunks)};
}
const input={url:'https://media.example.org/song',allowedHosts:['media.example.org'],method:'GET',range:'bytes=0-5'};
test('relay writes metadata then exact binary stream with pinned DNS and safe headers',async()=>{
  const f=fixture();assert.equal(await relay(input,f.options),true);
  const bytes=f.result(),newline=bytes.indexOf(10),header=JSON.parse(bytes.subarray(0,newline));
  assert.equal(header.ok,true);assert.equal(header.status,206);assert.equal(header.headers['content-type'],'audio/mpeg');
  assert.deepEqual(bytes.subarray(newline+1),Buffer.from([0,1,2,3,254,255]));
  assert.equal(f.state.requests[0].headers.range,'bytes=0-5');assert.equal(f.state.requests[0].servername,'media.example.org');
  f.state.requests[0].lookup('media.example.org',{},(_,address)=>assert.equal(address,'8.8.8.8'));
});
test('relay rejects private DNS, redirects, nonaudio types and hostile response headers',async()=>{
  for(const config of [{address:'127.0.0.1'},{status:302},{headers:{'content-type':'text/html'}},{headers:{'content-type':'audio/mpeg','content-length':'-1'}}]) {
    const f=fixture(config);assert.equal(await relay(input,f.options),false);const result=JSON.parse(f.result());assert.equal(result.ok,false);
  }
});
test('relay rejects multiple/malformed ranges, credentials and outside allowlist before transport',async()=>{
  for(const edit of [{range:'bytes=0-1,3-4'},{range:'bytes=5-1'},{range:'bytes=-'},{method:'POST'},{url:'https://u:p@media.example.org'},{allowedHosts:['different.example.org']}]) {
    const f=fixture();assert.equal(await relay({...input,...edit},f.options),false);assert.equal(f.state.requests.length,0);
  }
});
test('HEAD returns metadata only',async()=>{
  const f=fixture({status:200});assert.equal(await relay({...input,method:'HEAD'},f.options),true);
  const raw=f.result().toString('utf8');assert.equal(raw.split('\n').length,2);assert.equal(JSON.parse(raw).ok,true);
});

test('media connects through either validated address family without replaying the request',async()=>{
  const f=fixture();
  const addresses=[{address:'2606:4700:4700::1111',family:6},{address:'8.8.8.8',family:4}];
  let lookups=0;
  f.options.lookup=async()=>{lookups++;return addresses;};
  assert.equal(await relay(input,f.options),true);
  const sent=f.state.requests[0];
  assert.equal(sent.autoSelectFamily,true);
  assert.equal(sent.autoSelectFamilyAttemptTimeout,250);
  sent.lookup('media.example.org',{all:true},(error,candidates)=>{
    assert.equal(error,null);assert.deepEqual(candidates,addresses);
  });
  assert.equal(lookups,1);assert.equal(f.state.requests.length,1);
  const bad=fixture();
  bad.options.lookup=async()=>[...addresses,{address:'::1',family:6}];
  assert.equal(await relay(input,bad.options),false);
  assert.equal(bad.state.requests.length,0);
});

for (const reason of ['idle', 'downstream-close', 'response-error']) {
  test(`header backpressure followed by ${reason} returns false without unhandled stream errors`, () => {
    // Run in a child so an unhandled stream error is a normal assertion failure,
    // and a leaked timeout or an unsettled write cannot hang the test runner.
    const source = `
      import { relay } from ${JSON.stringify(new URL('../relay.mjs', import.meta.url).href)};
      import { PassThrough, Writable } from 'node:stream';
      import { EventEmitter } from 'node:events';
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = { 'content-type': 'audio/mpeg' };
      const request = new EventEmitter();
      request.destroyed = false;
      request.destroy = error => {
        if (request.destroyed) return;
        request.destroyed = true;
        if (error) queueMicrotask(() => request.emit('error', error));
      };
      let receive;
      request.end = () => queueMicrotask(() => receive(response));
      const output = new Writable({ write(_chunk, _encoding, _callback) {
        if (${JSON.stringify(reason)} === 'downstream-close') setImmediate(() => output.destroy());
        if (${JSON.stringify(reason)} === 'response-error') setImmediate(() => response.destroy(new Error('upstream disconnected')));
      } });
      const result = await relay({ url: 'https://media.example.org/song', allowedHosts: ['media.example.org'], method: 'GET' }, {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }], output,
        request: (_options, callback) => { receive = callback; return request; },
        limits: { connectMs: 100, idleMs: 25, totalMs: 15000 }
      });
      await new Promise(resolve => setImmediate(resolve));
      console.log(JSON.stringify({ result, requestDestroyed: request.destroyed, responseDestroyed: response.destroyed,
        outputErrorListeners: output.listenerCount('error'), outputCloseListeners: output.listenerCount('close') }));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    assert.equal(child.error, undefined, `relay must settle and clear timers: ${child.error}`);
    assert.equal(child.status, 0, `relay must not crash: ${child.stderr}`);
    assert.deepEqual(JSON.parse(child.stdout), { result: false, requestDestroyed: true, responseDestroyed: true, outputErrorListeners: 0, outputCloseListeners: 0 });
  });
}
