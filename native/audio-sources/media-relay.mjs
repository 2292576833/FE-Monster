// Protocol: one JSON request on stdin; one JSON line then raw audio bytes on stdout.
const chunks=[];let size=0,started=false;
const reject=()=>{if(started)process.exit(1);started=true;process.stdout.write('{"ok":false,"code":"RELAY_INPUT","error":"Invalid media relay input."}\n',()=>process.exit(1));};
process.on('uncaughtException',reject);process.on('unhandledRejection',reject);
const inputTimer=setTimeout(reject,8000);
try {
  for await(const chunk of process.stdin){size+=chunk.length;if(size>16384){reject();break;}chunks.push(chunk);}
  if(!started){
    const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));clearTimeout(inputTimer);
    const {relay}=await import('./relay.mjs');started=true;const ok=await relay(input);process.exit(ok?0:1);
  }
}catch{reject();}
