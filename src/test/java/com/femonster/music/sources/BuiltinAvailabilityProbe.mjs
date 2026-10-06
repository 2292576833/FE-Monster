// Live, unauthenticated verification against ONLY the isolated backend.
// Never print or persist resolved URLs, tokens, song identities, or response payloads.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:58930';
const safeError=value=>String(value||'').replace(/https?:\S+/g,'[url]').replace(/(?:token|cookie|authorization|secret|key)\s*[:=]\s*\S+/gi,'[redacted]').slice(0,240);
async function json(path){const response=await fetch(base+path,{signal:AbortSignal.timeout(45000)});return {status:response.status,body:await response.json()};}
async function check(provider){
  const report={provider,ready:false,searchCount:0,resolutionAttempts:0,resolved:0,audioBytes:0,failures:[]};
  try{
    const health=await json('/api/music-apis/status?'+new URLSearchParams({provider}));
    report.ready=health.body.reachable===true;
    const search=await json('/api/search?'+new URLSearchParams({provider,keyword:'小星星',limit:'5'}));
    report.searchStatus=search.status;report.searchOk=search.body.ok;
    const songs=Array.isArray(search.body.songs)?search.body.songs:[];report.searchCount=songs.length;
    if(search.body.error)report.failures.push(safeError(search.body.error));
    for(const song of songs.slice(0,5)){
      report.resolutionAttempts++;
      const params=new URLSearchParams({provider,id:String(song.id),title:song.title||'',artist:song.artist||'',duration:String(song.duration||0),quality:provider==='netease'?'standard':provider==='qishui'?'full':'128'});
      if(song.sourceRef)params.set('sourceRef',JSON.stringify(song.sourceRef));
      const result=await json('/api/song/url?'+params);
      if(!result.body.url||result.body.playable===false){report.failures.push(safeError(result.body.error||'URL unavailable'));continue;}
      report.resolved++;
      const url=new URL(result.body.url);
      assert(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password);
      try{
        const response=await fetch(url,{headers:{Range:'bytes=0-4095'},signal:AbortSignal.timeout(25000)});
        report.audioStatus=response.status;report.contentType=response.headers.get('content-type')?.split(';')[0];
        const reader=response.body.getReader();let chunks=[],bytes=0;
        while(bytes<4096){const item=await reader.read();if(item.done)break;chunks.push(item.value);bytes+=item.value.length;}
        await reader.cancel();
        const buffer=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).subarray(0,4096);
        const signature=buffer.subarray(0,4).toString('ascii');
        const magic=['ID3','fLaC','OggS','RIFF'].some(prefix=>signature.startsWith(prefix))||(buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0);
        report.audioSignature=magic;
        if(response.ok&&bytes>0&&magic){report.audioBytes=buffer.length;break;}
        report.failures.push('Response was not a verified audio header');
      }catch(error){report.failures.push(safeError(error.name));}
    }
  }catch(error){report.failures.push(safeError(error.name));}
  report.failures=[...new Set(report.failures)];
  console.log(JSON.stringify(report));
}
await Promise.all(['netease','qq','kugou','qishui'].map(check));
