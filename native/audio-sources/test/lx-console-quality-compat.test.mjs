import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../runtime.mjs';

const qualitys = ['128k', '192k', '320k', 'flac', 'flac24bit', 'wav', 'ape'];
const init = declared => `lx.send('inited',{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:${JSON.stringify(declared)}}}});`;
const input = script => ({op:'resolve',script,allowedHosts:['media.example.org'],request:{source:'wy',action:'musicUrl',info:{type:'128k',musicInfo:{id:'fixture'}}}});
const network = () => ({request(){throw Error('Unexpected network request');},async validateUrl(){},close(){}});

test('desktop console groups and advisory logging cannot interrupt an LX music handler or expose host capabilities', async () => {
  const methods = ['log','info','warn','error','debug','group','groupCollapsed','groupEnd','assert','table','time','timeLog','timeEnd','count','countReset','trace','clear'];
  const code = `${init(['128k'])}
    lx.on('request', () => {
      if (!Object.isFrozen(console)) throw Error('Mutable console');
      for (const method of ${JSON.stringify(methods)}) {
        if (typeof console[method] !== 'function') throw Error('Missing logging method');
        if (console[method].constructor('return typeof process')() !== 'undefined') throw Error('Host capability exposed');
        console[method]('SECRET https://source.example.org/?token=SECRET');
      }
      console.group('Handle Action(musicUrl)'); console.log('source','wy'); console.groupEnd();
      return 'https://media.example.org/fixture.mp3';
    });`;
  const result = await execute(input(code), {network:network()});
  assert.deepEqual(result, {ok:true,url:'https://media.example.org/fixture.mp3'});
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token/);
});

test('all supported declared qualities survive inspection and can resolve', async () => {
  const code = `${init([...qualitys, '320k', 'unknown', 192])}lx.on('request',({info})=>'https://media.example.org/'+info.type);`;
  const inspected = await execute({...input(code),op:'inspect'});
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.sources.wy.qualitys, qualitys);
  for (const quality of qualitys) {
    const request = input(code); request.request.info.type = quality;
    const result = await execute(request, {network:network()});
    assert.deepEqual(result, {ok:true,url:'https://media.example.org/'+quality});
  }
});

test('extended quality compatibility still rejects undeclared qualities', async () => {
  const code = `${init(['128k'])}lx.on('request',()=>'https://media.example.org/fixture.mp3');`;
  for (const quality of ['192k', 'wav', 'ape', 'unknown']) {
    const request = input(code); request.request.info.type = quality;
    assert.equal((await execute(request, {network:network()})).code, 'UNSUPPORTED');
  }
});
