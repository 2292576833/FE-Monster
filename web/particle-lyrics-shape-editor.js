(function attachParticleIdleShapeEditor(global) {
  'use strict';
  const LIMIT=1024,SAMPLE_SIZE=128;
  function fitPoints(points){
    if(!points.length)return[];
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2,extent=Math.max(maxX-minX,maxY-minY)/2||1;
    const count=Math.min(LIMIT,points.length),output=[];
    for(let i=0;i<count;i++){const p=points[Math.floor(i*points.length/count)];output.push([
      Math.round((p[0]-cx)/extent*10000)/10000,Math.round((p[1]-cy)/extent*10000)/10000]);}
    return output;
  }
  function sampleImagePixels(image,mode='outline'){
    const {data,width,height}=image;
    if(!width||!height||width>SAMPLE_SIZE||height>SAMPLE_SIZE)return[];
    let minAlpha=255,maxAlpha=0;
    const edges=[[],[],[]];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const at=(y*width+x)*4,a=data[at+3];minAlpha=Math.min(minAlpha,a);maxAlpha=Math.max(maxAlpha,a);
      if(a>240&&(x===0||y===0||x===width-1||y===height-1))for(let c=0;c<3;c++)edges[c].push(data[at+c]);
    }
    if(maxAlpha<24)return[];
    const transparent=maxAlpha-minAlpha>40;
    const background=edges.map(values=>{values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??255;});
    const contrast=new Float32Array(width*height);let maximum=0;
    for(let i=0;i<contrast.length;i++){
      const at=i*4;
      contrast[i]=transparent?data[at+3]:Math.max(...background.map((color,c)=>Math.abs(data[at+c]-color)))*data[at+3]/255;
      maximum=Math.max(maximum,contrast[i]);
    }
    if(!transparent&&maximum<24)return[];
    const threshold=transparent?Math.max(24,maxAlpha*.25):Math.max(22,maximum*.22);
    const mask=contrast.map(value=>value>=threshold?1:0),points=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(!mask[i])continue;
      const edge=x===0||y===0||x===width-1||y===height-1||!mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width];
      if(mode==='solid'||edge)points.push([x,-y]);
    }
    // A fixed stride through raster rows creates vertical bands whenever the
    // row width and sample count share a factor. Deterministic shuffling keeps
    // dense silhouettes evenly dotted instead of turning them into stripes.
    if(points.length>LIMIT){let seed=0x6d2b79f5;for(let i=points.length-1;i>0;i--){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const j=(seed>>>0)%(i+1);
      const swap=points[i];points[i]=points[j];points[j]=swap;
    }}
    return points.length>=4?fitPoints(points):[];
  }
  async function imagePoints(file,mode){
    if(!file||file.size>16*1024*1024)throw new Error('请选择不超过 16 MB 的 PNG、JPEG 或 WebP 图片。');
    const header=new Uint8Array(await file.slice(0,16).arrayBuffer());
    const png=header[0]===137&&header[1]===80&&header[2]===78&&header[3]===71;
    const jpeg=header[0]===255&&header[1]===216&&header[2]===255;
    const webp=String.fromCharCode(...header.slice(0,4))==='RIFF'&&String.fromCharCode(...header.slice(8,12))==='WEBP';
    if(!png&&!jpeg&&!webp)throw new Error('支持 PNG、JPEG、WebP 图片，请选择其中一种格式。');
    let bitmap;
    try{bitmap=await createImageBitmap(file);}
    catch{throw new Error('图片无法读取，请选择完整的 PNG、JPEG 或 WebP 文件。已保留原图案。');}
    try{
      if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>32000000)throw new Error('图片尺寸过大，请缩小后再导入。');
      const ratio=Math.min(1,SAMPLE_SIZE/bitmap.width,SAMPLE_SIZE/bitmap.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const points=sampleImagePixels(context.getImageData(0,0,canvas.width,canvas.height),mode);
      if(!points.length)throw new Error('未找到清晰图案，请使用透明背景或对比更明显的图片。已保留原图案。');
      return points;
    }finally{bitmap.close();}
  }
  function create(host,onChange){
    const instructions=document.createElement('p');instructions.className='particle-shape-help';
    instructions.textContent='直接绘制图案，结束笔画后应用；也可导入本地图片。图案只作为待机整体形状。';
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;canvas.className='particle-shape-canvas';
    canvas.setAttribute('aria-label','自定义待机图案绘图区');canvas.tabIndex=0;
    const tools=document.createElement('div');tools.className='particle-shape-tools';
    const mode=document.createElement('select');mode.setAttribute('aria-label','图片提取方式');
    for(const [value,label]of[['outline','图片轮廓'],['solid','图片实心']]){const option=document.createElement('option');option.value=value;option.textContent=label;mode.append(option);}
    const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';file.hidden=true;
    const button=label=>{const b=document.createElement('button');b.type='button';b.textContent=label;return b;};
    const importButton=button('导入图片'),undo=button('撤销'),clear=button('清空');
    tools.append(mode,importButton,undo,clear,file);
    const status=document.createElement('p');status.className='particle-shape-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    host.append(instructions,canvas,tools,status);
    const context=canvas.getContext('2d'),history=[];
    let points=[],draft=null,pointerId=null,lastPoint=null,revision=0,signature='',message='',active=false;
    const signatureOf=value=>JSON.stringify(value);
    function paint(){
      context.clearRect(0,0,320,240);context.fillStyle='#101b23';context.fillRect(0,0,320,240);
      context.strokeStyle='rgba(173,222,238,.07)';context.lineWidth=1;
      for(let x=16;x<320;x+=24){context.beginPath();context.moveTo(x,0);context.lineTo(x,240);context.stroke();}
      for(let y=0;y<240;y+=24){context.beginPath();context.moveTo(0,y);context.lineTo(320,y);context.stroke();}
      context.fillStyle='#b4f0ff';context.shadowColor='#55bde2';context.shadowBlur=4;
      for(const p of draft||points){context.beginPath();context.arc(160+p[0]*102,120-p[1]*102,1.7,0,Math.PI*2);context.fill();}
      context.shadowBlur=0;
      if(!points.length&&!draft){context.fillStyle='rgba(199,231,243,.55)';context.font='13px sans-serif';context.textAlign='center';context.fillText('绘制一个属于你的形状',160,122);}
      undo.disabled=history.length===0;clear.disabled=!points.length&&!draft;
      status.textContent=message||(points.length?`${points.length} 个采样点 · 等比适配`:'还没有图案；空图案使用默认待机形态。');
    }
    function commit(next,{saveHistory=true,note=''}={}){
      if(saveHistory){history.push(points.map(p=>p.slice()));if(history.length>16)history.shift();}
      points=fitPoints(next);signature=signatureOf(points);draft=null;message=note;revision++;
      paint();onChange('customShape',points.map(p=>p.slice()));
    }
    function pointerPoint(event){const r=canvas.getBoundingClientRect();return[(Math.min(320,Math.max(0,(event.clientX-r.left)*320/r.width))-160)/102,
      (120-Math.min(240,Math.max(0,(event.clientY-r.top)*240/r.height)))/102];}
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||pointerId!==null)return;event.preventDefault();revision++;pointerId=event.pointerId;
      canvas.setPointerCapture(pointerId);draft=points.map(p=>p.slice());lastPoint=pointerPoint(event);draft.push(lastPoint);message='绘制中，松开后应用';paint();
    });
    canvas.addEventListener('pointermove',event=>{
      if(event.pointerId!==pointerId||!draft)return;event.preventDefault();const next=pointerPoint(event),distance=Math.hypot(next[0]-lastPoint[0],next[1]-lastPoint[1]);
      if(distance<.025)return;const steps=Math.min(120,Math.ceil(distance/.03));
      for(let i=1;i<=steps;i++)draft.push([lastPoint[0]+(next[0]-lastPoint[0])*i/steps,lastPoint[1]+(next[1]-lastPoint[1])*i/steps]);
      if(draft.length>4096)draft=draft.filter((_,i)=>i%2===0);lastPoint=next;paint();
    });
    function endPointer(event,cancel=false){
      if(event.pointerId!==pointerId)return;const id=pointerId;pointerId=null;
      if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
      if(cancel){draft=null;message='已取消这次笔画';paint();return;}commit(draft||points);
    }
    canvas.addEventListener('pointerup',event=>endPointer(event));canvas.addEventListener('pointercancel',event=>endPointer(event,true));
    canvas.addEventListener('lostpointercapture',event=>{if(event.pointerId===pointerId)endPointer(event,true);});
    clear.addEventListener('click',()=>commit([],{note:'已清空图案，使用默认待机形态。'}));
    undo.addEventListener('click',()=>{if(history.length)commit(history.pop(),{saveHistory:false,note:'已撤销上一步'});});
    importButton.addEventListener('click',()=>file.click());
    file.addEventListener('change',async()=>{
      const selected=file.files?.[0];file.value='';if(!selected)return;
      const task=++revision;message='正在从图片采样…';paint();importButton.disabled=true;
      try{const sampled=await imagePoints(selected,mode.value);if(task!==revision)return;commit(sampled,{note:`已导入 ${sampled.length} 个采样点，图片仅在本机处理。`});}
      catch(error){if(task===revision){message=error.message||'图片无法读取，已保留原图案。';paint();}}
      finally{importButton.disabled=false;}
    });
    paint();
    return{sync(value,isActive=true){
      if(active!==isActive){active=isActive;revision++;
        if(!active&&draft){const id=pointerId;pointerId=null;draft=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
        if(!active){message='';history.length=0;paint();}
      }
      const next=Array.isArray(value)?value:[],nextSignature=signatureOf(next);if(nextSignature===signature||draft)return;
      points=next.map(p=>p.slice());signature=nextSignature;message='';history.length=0;revision++;paint();}};
  }
  global.FeParticleIdleShapeEditor=Object.freeze({create,fitPoints,sampleImagePixels});
})(window);
