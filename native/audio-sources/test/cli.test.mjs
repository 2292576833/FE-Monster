import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner=fileURLToPath(new URL('../lx-runner.mjs',import.meta.url));
async function run(input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[runner],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('CLI timeout'));},18000);
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
    child.on('error',reject);child.stdin.on('error',()=>{});
    child.on('close',code=>{clearTimeout(timer);resolve({code,out,err,result:JSON.parse(out)});});
    child.stdin.end(input);
  });
}
test('CLI accepts one JSON, executes isolated guest and emits one bounded JSON without logs',async()=>{
  const input={op:'inspect',allowedHosts:[],script:`console.log('SECRET');lx.send('inited',{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});`};
  const {code,out,err,result}=await run(JSON.stringify(input));assert.equal(code,0);assert.equal(result.ok,true);assert.equal(err,'');assert.doesNotMatch(out,/SECRET/);assert.ok(Buffer.byteLength(out)<2*1024*1024);
});
test('CLI malformed input, excessive stdin and source exceptions cannot expose script text',async()=>{
  for(const input of ['not json','x'.repeat(768*1024+1),JSON.stringify({op:'inspect',allowedHosts:[],script:`throw Error('SECRET https://test/?password=SECRET C:/private');`})]) {
    const {out,err,result}=await run(input);assert.equal(result.ok,false);assert.equal(err,'');assert.doesNotMatch(out,/SECRET|password|private/);
  }
});
test('CLI download mode rejects unsafe URL and injected fields without leaking secrets',async()=>{
  for(const input of [{op:'download',url:'http://127.0.0.1/a.js?password=SECRET'},{op:'download',url:'https://example.org/a.js',headers:{Authorization:'SECRET'}}]) {
    const {out,err,result}=await run(JSON.stringify(input));assert.equal(result.ok,false);assert.equal(err,'');assert.doesNotMatch(out,/SECRET|password|127\.0\.0\.1/);
  }
});
