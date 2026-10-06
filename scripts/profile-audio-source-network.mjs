import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const arg=(name,fallback)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const label=arg('label','current');
const source=path.resolve(root,arg('module','native/audio-sources/network.mjs'));
const output=path.join(root,'output/performance-20260918');
const certificateDir=path.resolve(root,arg('cert-dir','native/audio-sources/test/fixtures'));
const certificatePrefix=arg('cert-prefix','network');
const key=readFileSync(path.join(certificateDir,`${certificatePrefix}-key.pem`));
const cert=readFileSync(path.join(certificateDir,`${certificatePrefix}-cert.pem`));
const require=createRequire(path.join(root,'native/audio-sources/package.json'));
const code=readFileSync(source,'utf8').replace("'ipaddr.js'",JSON.stringify(pathToFileURL(require.resolve('ipaddr.js')).href));
const { createNetwork }=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
let handshakes=0,requestCount=0;
const sockets=new Set();
const server=https.createServer({key,cert},(_req,res)=>{
  requestCount++;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({ok:true,payload:'x'.repeat(256)}));
});
server.on('secureConnection',socket=>{handshakes++;sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,rounds=[];
try {
  // Each invocation has the real runtime's 12-request budget and independent pool.
  for(let round=-1;round<5;round++){
    const startHandshakes=handshakes,latencyMs=[],reused=[];let lookups=0;
    const network=createNetwork(['api.example.org'],{
      lookup:async()=>{lookups++;return [{address:'8.8.8.8',family:4}];},
      request:(options,callback)=>{
        assert.equal(options.rejectUnauthorized,true);
        return https.request({...options,port,ca:cert,
          lookup:(_host,lookupOptions,done)=>lookupOptions?.all?done(null,[{address:'127.0.0.1',family:4}]):done(null,'127.0.0.1',4)
        },response=>{reused.push(response.req.reusedSocket);callback(response);});
      }
    });
    const cpuStart=process.cpuUsage();
    try {
      for(let request=0;request<12;request++){
        const start=performance.now();
        const response=await network.request('https://api.example.org/data');
        latencyMs.push(performance.now()-start);
        assert.equal(response.body.ok,true);
      }
    } finally {network.close();}
    const cpu=process.cpuUsage(cpuStart);
    assert.equal(lookups,12,'every request must repeat DNS safety validation');
    if(round>=0)rounds.push({handshakes:handshakes-startHandshakes,lookups,reused:reused.filter(Boolean).length,latencyMs,cpuMs:(cpu.user+cpu.system)/1000});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(sockets.size,0,'close must release idle TLS sockets');
  }
  const samples=rounds.flatMap(round=>round.latencyMs).sort((a,b)=>a-b);
  const result={label,node:process.version,source,fixture:'Real loopback HTTPS, hostname and certificate verified; 256-byte JSON, five 12-request rounds after warmup',
    requests:rounds.length*12,handshakes:rounds.reduce((sum,round)=>sum+round.handshakes,0),reused:rounds.reduce((sum,round)=>sum+round.reused,0),
    dnsChecks:rounds.reduce((sum,round)=>sum+round.lookups,0),medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)],
    meanMs:samples.reduce((sum,value)=>sum+value,0)/samples.length,rounds};
  mkdirSync(output,{recursive:true});writeFileSync(path.join(output,`network-${label}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
