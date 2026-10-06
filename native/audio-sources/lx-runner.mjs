// Trusted CLI supervisor: never evaluates source with the Node interpreter.
const inputLimit=768*1024,outputLimit=2*1024*1024;
let sent=false;
function finish(result){
  if(sent)return;sent=true;
  let output=JSON.stringify(result);if(Buffer.byteLength(output)>outputLimit)output='{"ok":false,"code":"OUTPUT_LIMIT","error":"Runtime output limit exceeded."}';
  process.stdout.write(output+'\n',()=>process.exit(0));
}
process.on('uncaughtException',()=>finish({ok:false,code:'RUNTIME_ERROR',error:'Audio source runtime failed.'}));
process.on('unhandledRejection',()=>finish({ok:false,code:'RUNTIME_ERROR',error:'Audio source runtime failed.'}));
setTimeout(()=>finish({ok:false,code:'TIMEOUT',error:'Audio source runtime timed out.'}),15000);
const chunks=[];let bytes=0;
try {
  for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>inputLimit){finish({ok:false,code:'INVALID_INPUT',error:'Runtime input limit exceeded.'});break;}chunks.push(chunk);}
  if(!sent){
    let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{finish({ok:false,code:'INVALID_INPUT',error:'Invalid runtime input.'});}
    if(!sent){
      if(input?.op==='download'){
        try{
          if(Object.keys(input).some(key=>!['op','url'].includes(key)))throw Error('Invalid input');
          const {downloadScript}=await import('./download.mjs');finish(await downloadScript(input.url));
        }catch(error){finish({ok:false,code:error?.code || 'DOWNLOAD_FAILED',error:'Script download rejected or failed.'});}
      }else{const {execute}=await import('./runtime.mjs');finish(await execute(input));}
    }
  }
} catch {finish({ok:false,code:'RUNTIME_ERROR',error:'Audio source runtime unavailable.'});}
