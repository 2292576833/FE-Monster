import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../runtime.mjs';

const init = `lx.send('inited',{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});`;
const input = (script, allowedHosts = []) => ({ op: 'inspect', script, allowedHosts });

test('bounded guest timers allow delayed initialization and cancellation without exposing host functions', async () => {
  const script = `
    if(setTimeout.constructor('return typeof process')()!=='undefined')throw Error('escape');
    let cancelled=false;
    const id=setTimeout(()=>{cancelled=true;},1);clearTimeout(id);clearTimeout(id);
    setTimeout((value)=>{if(cancelled||value!==42)throw Error('timer');${init}},20,42);
  `;
  assert.equal((await execute(input(script))).ok, true);
});

test('timer lifetime, timer flooding, string callbacks and spinning callbacks stay bounded', async () => {
  for (const script of [
    `setTimeout(()=>{${init}},60000);`,
    'for(let i=0;i<1000;i++)setTimeout(()=>{},1000);',
    `setTimeout('process.exit()',0);`,
    'setTimeout(()=>{while(true){}},0);'
  ]) {
    const start = Date.now();
    assert.equal((await execute(input(script), { timeoutMs: 100 })).ok, false);
    assert.ok(Date.now() - start < 2500);
  }
});

test('finishing initialization releases unused timers and never fires them in another invocation', async () => {
  const script = `setTimeout(()=>{throw Error('late');},60000);${init}`;
  const start = Date.now();
  assert.equal((await execute(input(script))).ok, true);
  assert.ok(Date.now() - start < 1000);
  assert.equal((await execute(input(init))).ok, true);
});

const requesting = (url) => `setTimeout(()=>lx.request(${JSON.stringify(url)},{method:'GET'},(err)=>{if(err)throw err;${init}}),5);`;

test('offline preview reports only the required host without performing network I/O or claiming initialized', async () => {
  let requests = 0;
  const result = await execute(input(requesting('http://api.example.org/init?token=SECRET')), {
    network: { request() { requests++; throw Error('must not contact server'); }, close() {} }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INIT_NETWORK_REQUIRED');
  assert.deepEqual(result.requiredHosts, ['api.example.org']);
  assert.equal(result.sources, undefined);
  assert.equal(requests, 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token|\/init/);
});

test('legacy HTTP script requests upgrade to the same HTTPS host without any plaintext fallback', async () => {
  const requests = [];
  const result = await execute(input(requesting('http://api.example.org:80/init?p=desktop'), ['api.example.org']), {
    network: { async request(url) { requests.push(url); return { statusCode: 200, headers: {}, body: {} }; }, close() {} }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(requests, ['https://api.example.org/init?p=desktop']);
});

test('HTTP upgrade cannot authorize another host, private literals, credentials, fragments or custom ports', async () => {
  for (const url of ['http://other.example.org/x', 'http://127.0.0.1/x', 'http://[::1]/x',
    'http://u:p@api.example.org/x', 'http://api.example.org:8080/x', 'http://api.example.org:443/x',
    'http://api.example.org/x#fragment', ' http://api.example.org/x', 'http://api.example.org\\@other.example.org/x']) {
    let requests = 0;
    const result = await execute(input(requesting(url), ['api.example.org']), {
      network: { request() { requests++; throw Error('must not connect'); }, close() {} }
    });
    assert.equal(result.ok, false, url);
    assert.equal(requests, 0, url);
  }
});

const resolving = (url, hosts = ['media.example.org']) => ({
  op: 'resolve', script: init + `lx.on('request',()=>${JSON.stringify(url)});`, allowedHosts: hosts,
  request: { source: 'wy', action: 'musicUrl', info: { type: '128k', musicInfo: { songmid: 'fixture' } } }
});

test('legacy returned media URLs are upgraded before validation and never escape as plaintext', async () => {
  const validated = [];
  const result = await execute(resolving('http://media.example.org:80/fixture.mp3?vkey=fixture'), {
    network: { async validateUrl(url, requireAllowed) { validated.push([url, requireAllowed]); }, close() {} }
  });
  assert.deepEqual(result, { ok: true, url: 'https://media.example.org/fixture.mp3?vkey=fixture' });
  assert.deepEqual(validated, [[result.url, true]]);
});

test('upgraded media URLs retain exact-host and all-answer DNS validation without opening a connection', async () => {
  let lookups = 0;
  const result = await execute(resolving('http://media.example.org/fixture.mp3'), {
    lookup: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]; }
  });
  assert.equal(result.code, 'ADDRESS_BLOCKED');
  assert.equal(lookups, 1);
  for (const url of ['http://other.example.org/x', 'http://127.0.0.1/x', 'http://[::1]/x',
    'http://u:p@media.example.org/x', 'http://media.example.org:8080/x', 'http://media.example.org:443/x',
    'http://media.example.org/x#fragment', ' http://media.example.org/x', 'http://media.example.org\\@other.example.org/x']) {
    let validations = 0;
    const result = await execute(resolving(url), {
      network: { async validateUrl() { validations++; }, close() {} }
    });
    assert.equal(result.ok, false, url);
    assert.equal(validations, 0, url);
  }
});
