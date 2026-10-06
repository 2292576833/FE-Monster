// Trusted self-authored protocol fixture; no untrusted scripts or network.
let text='';for await(const chunk of process.stdin)text+=chunk;
const request=JSON.parse(text);
if(process.env.NODE_OPTIONS||process.env.FE_FAKE_SECRET||process.env.HTTPS_PROXY)process.exit(7);
let data=Buffer.from('RIFF-FE-AUDIO-FIXTURE');
if(request.range==='bytes=0-3')data=data.subarray(0,4);
const headers={'content-type':'audio/wav','content-length':String(data.length),'accept-ranges':'bytes','authorization':'SECRET_SHOULD_NOT_FORWARD'};
if(request.range)headers['content-range']='bytes 0-3/21';
process.stdout.write(JSON.stringify({ok:true,status:request.range?206:200,headers})+'\n');
if(request.method!=='HEAD')process.stdout.write(data);
