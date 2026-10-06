(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, Number(v) || 0));
  const smooth = t => t * t * (3 - 2 * t);
  const fract = n => n - Math.floor(n);
  const rand = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const materials = ['glass','bubble','metal','neon','stardust','hologram','water','fire','ice','aurora'];
  const gradientModes = ['single','linear','flow','character','segmented'];
  const fallbackColors = ['#86edff','#9da7ff','#f7b9df'];
  const graphemes = text => typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text), entry => entry.segment)
    : Array.from(text);
  const glyphCache = new Map();

  // Mask sampling is performed only when the text or its layout changes.
  // The point pool and all GPU buffers remain allocated across line changes.
  function sampleGlyph(char, style, family) {
    const key = [char,style,family].join('|');
    if (glyphCache.has(key)) return glyphCache.get(key);
    const canvas = document.createElement('canvas');canvas.width=160;canvas.height=160;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.font=`600 112px ${family}`;ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';
    const width=ctx.measureText(char).width;
    ctx.fillText(char,12,124);
    const pixels=ctx.getImageData(0,0,160,160).data;
    const points=[];
    for(let y=4;y<152;y+=2)for(let x=4;x<156;x+=2){
      const alpha=(x,y)=>pixels[(y*160+x)*4+3];
      if(alpha(x,y)<100)continue;
      if(style==='outline'&&alpha(x-2,y)>100&&alpha(x+2,y)>100&&alpha(x,y-2)>100&&alpha(x,y+2)>100)continue;
      points.push({x:x-12+(rand(x+y*160)-0.5)*0.8,y:124-y+(rand(y+x*160)-0.5)*0.8});
    }
    const result={width,points};
    if(glyphCache.size>=192)glyphCache.delete(glyphCache.keys().next().value);
    glyphCache.set(key,result);return result;
  }

  function layoutText(text, settings, viewWidth, family) {
    const chars=graphemes(String(text || ''));
    const glyphs=chars.map(char=>sampleGlyph(char,settings.glyphStyle,family));
    const maxWidth=Math.min(viewWidth*0.85,1600);
    let fontSize=108*settings.textScale;
    let rows;
    const arrange=()=>{
      rows=[{items:[],width:0}];
      glyphs.forEach((glyph,index)=>{
        const advance=(glyph.width+5)*fontSize/112;
        let row=rows[rows.length-1];
        if(chars[index]==='\n'){rows.push({items:[],width:0});return;}
        if(row.width+advance>maxWidth&&row.items.length){row={items:[],width:0};rows.push(row);}
        row.items.push({glyph,index,x:row.width});row.width+=advance;
      });
    };
    arrange();
    while((rows.length*fontSize*1.35>470||rows.length>(settings.rowLimit||Infinity))&&fontSize>(settings.rowLimit?4:12)){fontSize*=0.9;arrange();}
    const points=[],byChar=chars.map(()=>[]);
    rows.forEach((row,rowIndex)=>{
      const y=(rows.length-1)*fontSize*0.675-rowIndex*fontSize*1.35-fontSize*0.37+settings.textY*350;
      for(const {glyph,index,x} of row.items){
        for(const p of glyph.points){
          const target={x:x-row.width/2+p.x*fontSize/112,y:y+p.y*fontSize/112,z:(rand(points.length+index*17)-0.5)*2, char:index};
          points.push(target);byChar[index].push(target);
        }
      }
    });
    return {chars,points,byChar,fontSize,rows:rows.length};
  }

  function prepareIdleShape(r,frame) {
    const s=r.settings,shape=s.shape;
    if(shape!=='text'&&shape!=='custom'){
      r.idleShapePoints=null;r.idleShapeResolved=shape;r.idleShapeKey='';r.idleShapeRows=0;r.idleMainCount=4500;return;
    }
    const family=frame.fontFamily||'"Microsoft YaHei", "PingFang SC", sans-serif';
    // Normalization may copy arrays on a settings edit. Serialize only when its
    // reference changes, never inside the animation loop for unchanged settings.
    if(shape==='custom'&&r.idleShapeSource!==s.customShape){
      r.idleShapeSource=s.customShape;r.idleCustomKey=JSON.stringify(s.customShape||[]);
    }
    if(shape==='text'&&r.idleTextSource!==s.idleText){
      r.idleTextSource=s.idleText;
      r.idleTextValue=Array.from(String(s.idleText||'').replace(/\r\n?/g,'\n')).slice(0,80).join('').split('\n').slice(0,3).join('\n');
    }
    const text=shape==='text'?(r.idleTextValue||''):'';
    const key=shape==='custom'?'custom|'+r.idleCustomKey:['text',text,s.glyphStyle,family,r.viewWidth].join('|');
    if(key===r.idleShapeKey)return;
    r.idleShapeKey=key;r.idleCacheBuildCount++;
    let points;r.idleShapeRows=0;r.idleMainCount=4500;
    if(shape==='text'){
      const layout=text.trim()?layoutText(text,{glyphStyle:s.glyphStyle,textScale:1,textY:0,rowLimit:3},r.viewWidth,family):null;
      points=layout?.points||[];r.idleShapeRows=layout?.rows||0;
      const characters=layout?.chars.filter(char=>/\S/u.test(char)).length||0;
      // Long idle text borrows the existing pool so strokes remain readable.
      // Keep the original short-text budget and reserve 1,500 ambient particles.
      if(points.length)r.idleMainCount=Math.min(15000,(r.count||18000)-1500,Math.max(4500,characters*220));
    }
    else points=Array.isArray(s.customShape)?s.customShape.slice(0,1024)
      .filter(point=>Array.isArray(point)&&point.length>=2&&Number.isFinite(point[0])&&Number.isFinite(point[1]))
      .map(point=>({x:clamp(point[0],-1,1),y:clamp(point[1],-1,1)})):[];
    if(!points.length){r.idleShapePoints=null;r.idleShapeResolved='circle';return;}
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const point of points){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
    const width=maxX-minX,height=maxY-minY,centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
    // A single scalar preserves the source aspect ratio. Text keeps its natural
    // wide line layout; drawings fit the same footprint as the built-in shapes.
    const factor=shape==='text'?Math.min(1,Math.min(r.viewWidth*.72,980)/Math.max(1,width),360/Math.max(1,height))/205
      :2/Math.max(width,height,1e-6);
    const count=Math.min(r.idleMainCount,points.length),sampled=new Float32Array(count*2);
    for(let i=0;i<count;i++){
      const point=points[Math.floor(i*points.length/count)];
      sampled[i*2]=(point.x-centerX)*factor;sampled[i*2+1]=(point.y-centerY)*factor;
    }
    r.idleShapePoints=sampled;r.idleShapeResolved=shape;
  }

  // Timestamp gaps intentionally return -1: only the currently sung glyph
  // is assembled in sung mode. The same result also makes seeking stateless.
  function resolveCue(frame, chars, cache) {
    const text=chars.join('');
    // The app normalizes provider timestamps to absolute seconds before this
    // boundary. Do not infer milliseconds or move a supplied vocal boundary.
    const timings=Array.isArray(frame.glyphTimings)?frame.glyphTimings.filter(t=>t&&(!t.trackId||t.trackId==='main')):[];
    const time=Number.isFinite(frame.audioTime)?frame.audioTime:Number(frame.displayTime)||0;
    const start=Number(frame.lineStart)||0;
    const end=Math.max(start+0.08,Number(frame.lineEnd)||start+4);
    const key=cache?[text,start,end,...timings.map(t=>[t.char??t.text??'',t.start??t.startTime,t.end??t.endTime,t.duration].join('\u0001'))].join('\u0002'):'';
    const cached=cache&&cache.key===key;
    const windows=cached?cache.windows:[];
    let exact=cached?cache.exact:false;
    if(!cached){
    let cursor=0;
    for(const timing of timings){
      const token=String(timing.char??timing.text??'');
      if(!token)continue;
      const index=text.indexOf(token,cursor);
      if(index<0)continue;
      const charIndex=graphemes(text.slice(0,index)).length;
      const units=graphemes(token);
      const a=Number(timing.start??timing.startTime),b=Number(timing.end??timing.endTime??(a+Number(timing.duration)));
      if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
      units.forEach((_,i)=>windows.push({index:charIndex+i,start:a+(b-a)*i/units.length,end:a+(b-a)*(i+1)/units.length}));
      cursor=index+token.length;
    }
    exact=windows.length>0;
    if(!exact){
      const indices=chars.map((char,index)=>({char,index})).filter(item=>/\S/u.test(item.char));
      indices.forEach((item,i)=>windows.push({index:item.index,start:start+(end-start)*i/Math.max(1,indices.length),end:start+(end-start)*(i+1)/Math.max(1,indices.length)}));
    }
    if(cache){cache.key=key;cache.windows=windows;cache.exact=exact;}
    }
    const active=windows.find(item=>time>=item.start&&time<item.end);
    const revealed=windows.filter(item=>time>=item.start).map(item=>item.index);
    return {active:active?.index??-1, revealed, exact, time, windows, duration:active?active.end-active.start:end-start};
  }

  const vertexShader=`
    attribute vec4 aData;
    uniform float uSize,uPixelRatio,uTime,uTrailLayer,uTrailDecay,uGlowRadius;
    varying vec4 vData; varying vec3 vPosition;
    void main(){
      vData=aData;vPosition=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      float depth=clamp(1.0+position.z*0.001,0.6,1.35);
      gl_PointSize=max(1.0,uSize*uPixelRatio*depth*(0.78+aData.x*0.5)*(uTrailLayer>0.0?0.85:1.0)*4.0*max(1.0,uGlowRadius));
      vData.w*=uTrailLayer>0.0?pow(1.0-uTrailDecay*0.7,uTrailLayer)*0.34:1.0;
    }`;
  const paletteShader=`
    uniform vec3 uColorA,uColorB,uColorC;
    uniform float uTime,uGradient,uGradientSpeed,uGradientSegments,uTextMin,uTextWidth;
    vec3 lyricColor(vec3 position,float character){
      float gradient=clamp((position.x-uTextMin)/max(1.0,uTextWidth),0.0,1.0);
      if(uGradient==3.0)gradient=character;
      else if(uGradient==4.0)gradient=min(uGradientSegments-1.0,floor(gradient*uGradientSegments))/max(1.0,uGradientSegments-1.0);
      else if(uGradient==2.0)gradient=0.5+0.5*sin(gradient*3.14159265-uTime*uGradientSpeed*6.2831853-1.5707963);
      return uGradient==0.0?uColorA:gradient<0.5?mix(uColorA,uColorB,gradient*2.0):mix(uColorB,uColorC,(gradient-0.5)*2.0);
    }`;
  const fragmentShader=`
    precision highp float;
    ${paletteShader}
    uniform vec3 uEnvironment,uRimColor;
    uniform float uMaterial,uBrightness,uOpacity;
    uniform float uHalo,uLaser,uSoftness,uChromatic,uFresnel,uMovingLight,uBreathing,uPulse,uBass,uBeat;
    uniform float uRefraction,uReflection,uThickness,uEdge,uInterference,uBurst,uMetalness,uRoughness;
    uniform float uEmission,uTwinkle,uGrain,uRainbow,uScanlines,uWave,uCaustics,uCracks,uColorFlow,uEnv;
    uniform float uGlowRadius,uRimLight,uRimWidth,uSweepStrength,uSweepSpeed,uSweepWidth,uSweepAngle;
    uniform float uSparkleStrength,uSparkleSpeed,uSparkleDensity,uBreathingPeriod,uMovingLightSpeed;
    varying vec4 vData;varying vec3 vPosition;
    vec3 spectrum(float t){return 0.55+0.45*cos(6.2831853*(vec3(0.0,0.33,0.67)+t));}
    void main(){
      vec2 sprite=gl_PointCoord*2.0-1.0;
      vec2 p=sprite*max(1.0,uGlowRadius);
      float r=length(p),seed=vData.x;
      if(length(sprite)>1.0||vData.w<0.001)discard;
      float body=exp(-r*r*mix(32.0,15.0,uSoftness));
      float coreBody=body;
      float halo=exp(-r*r*5.5/(uGlowRadius*uGlowRadius))*uHalo*0.2*(1.0-smoothstep(0.82,1.0,length(sprite)));
      float edge=exp(-pow((r-0.35)*13.0,2.0));
      vec3 color=lyricColor(vPosition,vData.y);
      float light=1.0;
      if(uMaterial<0.5){body=body*(0.25+uThickness*0.5)+edge*(uEdge+uFresnel)*0.6;light+=pow(max(0.0,1.0-length(p-vec2(-0.12,0.16))*5.0),3.0)*uReflection*2.0;color=mix(color,spectrum(r*uRefraction),0.15);}
      else if(uMaterial<1.5){float pop=smoothstep(0.86,1.0,fract(uTime*0.3+seed))*uBurst*(1.0-vData.z);float shell=exp(-pow((r-0.35-pop*0.5)*13.0,2.0));body=(body*0.12+shell*(0.65+uEdge))*(1.0-pop);color=mix(color,spectrum(r*uInterference+uTime*0.05),min(0.8,uInterference*0.7));}
      else if(uMaterial<2.5){light=0.25+pow(max(0.0,1.0-length(p-vec2(sin(uTime*0.3)*0.15,0.12))*2.0),mix(16.0,2.0,uRoughness))*3.0*uReflection;color=mix(color,uColorB,uMetalness*0.45);body+=edge*uFresnel*0.25;}
      else if(uMaterial<3.5){light=0.65+uEmission;halo*=2.0;}
      else if(uMaterial<4.5){light=0.75+0.25*sin(uTime*uTwinkle*6.28+seed*100.0);body*=1.0-uGrain*0.3*fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
      else if(uMaterial<5.5){color=mix(color,spectrum(seed+uTime*0.1*uRainbow+p.x*0.5),min(0.8,uRainbow*0.5));body*=1.0-uScanlines*0.6*step(0.6,fract((p.y+uTime*0.3)*15.0));}
      else if(uMaterial<6.5){float wave=sin(r*35.0*uRefraction+uTime*uWave*3.0);light+=wave*0.22*uCaustics;body+=edge*0.35*uReflection;}
      else if(uMaterial<7.5){color=mix(color,mix(uColorA,uColorC,clamp(p.y*0.5+0.5+sin(uTime*uColorFlow+seed)*0.2,0.0,1.0)),0.35);body*=1.0+sin(p.x*20.0+uTime*6.0+seed*50.0)*uWave*0.2;light=0.8+uEmission*0.5;}
      else if(uMaterial<8.5){float cracks=pow(abs(sin(p.x*12.0+p.y*18.0+seed*5.0)),22.0)*uCracks;body+=edge*(uEdge+uFresnel)*0.5+cracks*body;color=mix(color,vec3(0.8,0.96,1.0),0.35);light+=uRefraction*0.1+uGrain*seed*0.2;}
      else {color=mix(color,spectrum(p.y*0.5+seed+uTime*uColorFlow*0.15),uRainbow*0.35);body*=(0.65+0.35*sin(p.x*uWave*8.0+uTime+seed*10.0))*mix(0.3,1.0,smoothstep(-0.8,0.7,p.y));}
      float sparkle=(exp(-abs(p.x)*70.0)*exp(-abs(p.y)*4.0)+exp(-abs(p.y)*70.0)*exp(-abs(p.x)*4.0))*uLaser*0.25;
      // Independent sparse glints keep text readable between highlights. Their
      // cadence uses the decorative clock and never modifies glyph positions.
      float glint=step(1.0-uSparkleDensity,seed)*pow(0.5+0.5*sin(uTime*uSparkleSpeed*6.2831853+seed*151.0),24.0)*uSparkleStrength;
      sparkle+=(exp(-abs(p.x+p.y)*45.0)*exp(-abs(p.x-p.y)*5.0)+exp(-abs(p.x-p.y)*45.0)*exp(-abs(p.x+p.y)*5.0))*glint*0.4;
      float rim=exp(-pow((r-0.4)*mix(36.0,7.0,uRimWidth),2.0))*uRimLight*0.12;
      color=mix(color,uRimColor,clamp(rim/(body+rim+0.01)*0.45,0.0,0.45));
      body+=rim;
      body+=edge*uFresnel*0.08;
      color=mix(color,uEnvironment,uEnv*0.18);
      vec2 highlight=p-vec2(sin(uTime*uMovingLightSpeed*0.7+vPosition.x*0.014),cos(uTime*uMovingLightSpeed*0.55+seed*6.28))*0.2;
      light+=uMovingLight*exp(-dot(highlight,highlight)*45.0)*0.9;
      vec2 textCoord=vec2((vPosition.x-uTextMin)/max(1.0,uTextWidth)-0.5,vPosition.y/max(300.0,uTextWidth));
      vec2 sweepDirection=vec2(cos(uSweepAngle),sin(uSweepAngle));
      float sweepCenter=(fract(uTime*uSweepSpeed+0.5)-0.5)*2.4;
      float sweep=exp(-pow((dot(textCoord,sweepDirection)-sweepCenter)/max(0.02,uSweepWidth*0.45),2.0))*uSweepStrength;
      light+=sweep*0.55+glint*0.25;
      light*=1.0+uBreathing*0.2*sin(uTime*6.2831853/uBreathingPeriod)+uPulse*max(uBass,uBeat)*0.7;
      float offset=uChromatic*(0.12+0.05*sin(uTime*7.0+seed*13.0));
      vec2 redPoint=p-vec2(offset,0.0),bluePoint=p+vec2(offset,0.0);
      vec3 profile=max(vec3(0.0),vec3(body+halo+sparkle)+vec3(exp(-dot(redPoint,redPoint)*mix(32.0,15.0,uSoftness))-coreBody,0.0,exp(-dot(bluePoint,bluePoint)*mix(32.0,15.0,uSoftness))-coreBody));
      float peak=max(max(profile.r,profile.g),profile.b);
      float alpha=clamp(peak*vData.w*uOpacity,0.0,1.0);
      gl_FragColor=vec4(max(vec3(0.0),color)*profile/max(0.0001,peak)*light*uBrightness,alpha);
    }`;

  function makeBloom(THREE) {
    const target=()=>new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false});
    const full=target(),a=target(),b=target();
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const geometry=new THREE.PlaneGeometry(2,2);
    const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{uSource:{value:null},uStep:{value:new THREE.Vector2()},uThreshold:{value:0}},vertexShader:vertex,fragmentShader:`
      varying vec2 vUv;uniform sampler2D uSource;uniform vec2 uStep;uniform float uThreshold;
      vec4 sampleAt(vec2 uv){vec4 c=texture2D(uSource,uv);return c*max(0.0,max(max(c.r,c.g),c.b)-uThreshold);}
      void main(){gl_FragColor=sampleAt(vUv)*0.227027+(sampleAt(vUv+uStep*1.384615)+sampleAt(vUv-uStep*1.384615))*0.316216+(sampleAt(vUv+uStep*3.230769)+sampleAt(vUv-uStep*3.230769))*0.07027;}`});
    const composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{uSource:{value:full.texture},uBloom:{value:b.texture},uStrength:{value:0.5}},vertexShader:vertex,fragmentShader:`
      varying vec2 vUv;uniform sampler2D uSource,uBloom;uniform float uStrength;
      void main(){vec4 c=texture2D(uSource,vUv);vec4 b=texture2D(uBloom,vUv)*uStrength;float a=clamp(c.a+b.a,0.0,1.0);gl_FragColor=vec4(c.rgb+b.rgb,a);}`});
    const quad=new THREE.Mesh(geometry,blur);scene.add(quad);
    let width=1,height=1,enabled=false;
    const sizeTargets=(w,h)=>{full.setSize(w,h);a.setSize(Math.max(1,w>>2),Math.max(1,h>>2));b.setSize(Math.max(1,w>>2),Math.max(1,h>>2));};
    const setEnabled=value=>{
      if(enabled===value)return;enabled=value;
      // setSize disposes the existing GPU storage. Keep only the target objects,
      // which Three.js allocates again when rendering resumes at the saved size.
      sizeTargets(enabled?width:1,enabled?height:1);
    };
    return {full,a,b,scene,camera,quad,blur,composite,setEnabled,resize(w,h){width=w;height=h;if(enabled)sizeTargets(w,h);},
      render(renderer,main,cameraMain,s){
        renderer.setRenderTarget(full);renderer.clear();renderer.render(main,cameraMain);
        quad.material=blur;blur.uniforms.uSource.value=full.texture;blur.uniforms.uThreshold.value=s.bloomThreshold;
        blur.uniforms.uStep.value.set((0.5+s.bloomRadius*2)/a.width,0);renderer.setRenderTarget(a);renderer.clear();renderer.render(scene,camera);
        blur.uniforms.uSource.value=a.texture;blur.uniforms.uThreshold.value=0;blur.uniforms.uStep.value.set(0,(0.5+s.bloomRadius*2)/a.height);
        renderer.setRenderTarget(b);renderer.clear();renderer.render(scene,camera);
        quad.material=composite;composite.uniforms.uStrength.value=s.bloomStrength;renderer.setRenderTarget(null);renderer.clear();renderer.render(scene,camera);
      },dispose(){full.dispose();a.dispose();b.dispose();geometry.dispose();blur.dispose();composite.dispose();}};
  }

  function create(host,options={}) {
    const THREE=options.THREE||global.THREE;
    if(!THREE)throw new Error('Three.js is unavailable');
    const count=options.mobile?10000:18000;
    const renderer=options.createRenderer?options.createRenderer({alpha:true,antialias:false,powerPreference:'high-performance'}):new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});
    renderer.setClearColor(0x000000,0);renderer.domElement.className='particle-lyrics-canvas';renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
    const scene=new THREE.Scene(),content=new THREE.Group(),camera=new THREE.OrthographicCamera(-800,800,450,-450,1,2500);camera.position.z=1000;scene.add(content);
    const positions=new Float32Array(count*3),from=new Float32Array(count*3),targets=new Float32Array(count*3),data=new Float32Array(count*4),start=new Float32Array(count),enabled=new Uint8Array(count),glyphIndices=new Int32Array(count);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('aData',new THREE.BufferAttribute(data,4).setUsage(THREE.DynamicDrawUsage));
    const uniforms={uColorA:{value:new THREE.Color()},uColorB:{value:new THREE.Color()},uColorC:{value:new THREE.Color()},uEnvironment:{value:new THREE.Color('#a7d9ff')},uRimColor:{value:new THREE.Color()},uTrailColor:{value:new THREE.Color()}};
    const keys=['Size','PixelRatio','Time','TrailLayer','TrailDecay','Material','Brightness','Opacity','Gradient','GradientSpeed','GradientSegments','TextMin','TextWidth','Halo','Laser','Softness','Chromatic','Fresnel','MovingLight','Breathing','Pulse','Bass','Beat','Refraction','Reflection','Thickness','Edge','Interference','Burst','Metalness','Roughness','Emission','Twinkle','Grain','Rainbow','Scanlines','Wave','Caustics','Cracks','ColorFlow','Env'];
    keys.forEach(key=>uniforms[`u${key}`]={value:0});
    for(const key of ['GlowRadius','RimLight','RimWidth','SweepStrength','SweepSpeed','SweepWidth','SweepAngle','SparkleStrength','SparkleSpeed','SparkleDensity','BreathingPeriod','MovingLightSpeed','TrailBrightness','TrailColorMix','VolumeLight','VolumeSpeed'])uniforms[`u${key}`]={value:0};
    const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending});
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;content.add(points);
    // One batched ribbon of three connected line segments per moving particle.
    // History buffers never grow, and completed glyphs have no residual trails.
    const tails=Array.from({length:3},()=>({array:new Float32Array(count*3),follow:0,fade:0,nextFade:0,limit:0}));
    const trailPositions=new Float32Array(count*18),trailData=new Float32Array(count*12),trailGeometry=new THREE.BufferGeometry();
    trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3).setUsage(THREE.DynamicDrawUsage));
    trailGeometry.setAttribute('aTrail',new THREE.BufferAttribute(trailData,2).setUsage(THREE.DynamicDrawUsage));
    const trailMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
      vertexShader:'attribute vec2 aTrail;varying vec2 vTrail;varying vec3 vPosition;void main(){vTrail=aTrail;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`precision highp float;${paletteShader}uniform float uOpacity,uBrightness,uTrailBrightness,uTrailColorMix;uniform vec3 uTrailColor;varying vec2 vTrail;varying vec3 vPosition;void main(){if(vTrail.y<0.001)discard;gl_FragColor=vec4(mix(lyricColor(vPosition,vTrail.x),uTrailColor,uTrailColorMix)*uBrightness*uTrailBrightness,vTrail.y*uOpacity);}`});
    const trailMesh=new THREE.LineSegments(trailGeometry,trailMaterial);trailMesh.frustumCulled=false;trailMesh.renderOrder=-1;content.add(trailMesh);
    const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uAge:{value:3},uStrength:{value:0.45},uDuration:{value:1},uWidth:{value:0.35},uRings:{value:1},uOpacity:uniforms.uOpacity,uColor:uniforms.uColorA},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
      varying vec2 vUv;uniform float uAge,uStrength,uDuration,uWidth,uRings,uOpacity;uniform vec3 uColor;
      void main(){
        float radius=length((vUv-0.5)*vec2(1.0,1.35));float ring=0.0;
        for(int i=0;i<3;i++){
          float layer=float(i),delay=layer*0.14;
          float age=(uAge/uDuration-delay)/max(0.5,1.0-delay);
          if(layer<uRings&&age>=0.0&&age<=1.0){
            float travel=age*(2.0-age);
            ring+=exp(-pow((radius-0.04-travel*0.4)*mix(90.0,18.0,uWidth),2.0))*pow(1.0-age,1.5)/(1.0+layer*0.6);
          }
        }
        gl_FragColor=vec4(uColor,ring*uStrength*uOpacity*0.2);
      }`});
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(1400,650),haloMaterial);halo.position.z=-30;content.add(halo);
    const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{uStrength:{value:0.2},uBlur:{value:1},uOpacity:uniforms.uOpacity},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv;uniform float uStrength,uBlur,uOpacity;void main(){vec2 p=(vUv-0.5)*2.0;float fade=1.0-smoothstep(0.65,1.0,length(p));gl_FragColor=vec4(0.0,0.0,0.0,exp(-dot(p,p)*4.0/max(0.4,uBlur))*fade*uStrength*uOpacity*0.4);}'});
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1100,100),shadowMaterial);shadow.position.set(0,-110,-50);shadow.renderOrder=-2;content.add(shadow);
    const volumeMaterial=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;varying vec3 vPosition;void main(){vUv=uv;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`precision highp float;${paletteShader}uniform float uVolumeLight,uVolumeSpeed,uOpacity;varying vec2 vUv;varying vec3 vPosition;
        void main(){vec2 p=(vUv-0.5)*2.0;float t=uTime*uVolumeSpeed;float drift=sin(p.x*3.0+t)*0.1+sin(p.x*7.0-t*0.7)*0.04;float cloud=exp(-p.x*p.x*2.2-pow((p.y-drift)*2.5,2.0));float rays=0.65+0.2*sin(p.x*15.0+p.y*2.0-t)+0.15*sin(p.x*27.0-p.y*3.0+t*1.3);float edge=(1.0-smoothstep(0.55,1.0,abs(p.x)))*(1.0-smoothstep(0.65,1.0,abs(p.y)));vec3 tint=mix(uColorA,uColorC,vUv.x);gl_FragColor=vec4(tint,cloud*rays*edge*uVolumeLight*uOpacity*0.11);}`});
    const volume=new THREE.Mesh(new THREE.PlaneGeometry(1,1),volumeMaterial);volume.position.z=-60;volume.renderOrder=-3;content.add(volume);
    const runtime={THREE,host,renderer,scene,content,camera,geometry,material,uniforms,points,positions,from,targets,data,start,enabled,glyphIndices,glyphProgress:[],tails,trailPositions,trailData,trailGeometry,trailMaterial,trailMesh,halo,haloMaterial,shadow,shadowMaterial,volume,volumeMaterial,bloom:makeBloom(THREE),count,clock:0,lastNow:0,viewWidth:1600,width:0,height:0,pixelRatio:1,activeCount:0,layout:null,layoutKey:'',selectionKey:'',lastText:'',bass:0,beat:0,disposed:false,settled:false,completedAt:-10,everPlayed:false,palette:options.palette,settings:global.FeParticleLyricsSettings.normalize(options.settings),lastFrame:{},timingExact:false,onTransformChange:options.onTransformChange,idleShapePoints:null,idleShapeKey:'',idleShapeSource:null,idleCustomKey:'',idleShapeResolved:'circle',idleCacheBuildCount:0,idleBounds:{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity}};
    runtime.onInvalidate=options.onInvalidate;
    // Particle noise is index-based and never changes with the animation clock.
    runtime.random=new Float64Array(count+72);runtime.idleTrig=new Float64Array(count*2);
    for(let i=0;i<runtime.random.length;i++)runtime.random[i]=rand(i);
    for(let i=0;i<count;i++){const angle=runtime.random[i+11]*TAU;runtime.idleTrig[i*2]=Math.cos(angle);runtime.idleTrig[i*2+1]=Math.sin(angle);}
    for(let i=0;i<count;i++){positions[i*3]=(rand(i+1)-0.5)*1500;positions[i*3+1]=(rand(i+2)-0.5)*800;positions[i*3+2]=(rand(i+3)-0.5)*400;data[i*4]=rand(i+4);}
    const lost=e=>{e.preventDefault();runtime.contextLost=true;};const restored=()=>{runtime.contextLost=false;runtime.lastNow=0;};
    renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);runtime.contextListeners={lost,restored};
    runtime.resizePending=true;
    runtime.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{runtime.resizePending=true;resize(runtime);}):null;runtime.observer?.observe(host);
    attachInteraction(runtime);setSettings(runtime,runtime.settings);setPalette(runtime,options.palette);resize(runtime,options.pixelRatio);return runtime;
  }

  function setSettings(r,settings){
    if(!r||r.disposed)return;
    const previousSettings=r.settings;
    r.settings=global.FeParticleLyricsSettings.normalize(settings);const s=r.settings,u=r.uniforms;
    r.bloom.setEnabled(s.bloomStrength>0);
    if(previousSettings?.idleDisabled!==s.idleDisabled||previousSettings?.skipIdleForLyrics!==s.skipIdleForLyrics) r.selectionKey='';
    const mapping={Size:'particleSize',TrailDecay:'trailDecay',Brightness:'brightness',Opacity:'opacity',GradientSpeed:'gradientSpeed',GradientSegments:'gradientSegments',Halo:'halo',Laser:'laser',Softness:'softness',Chromatic:'chromatic',Fresnel:'fresnel',MovingLight:'movingLight',Breathing:'breathingLight',Pulse:'pulseLight',Refraction:'refraction',Reflection:'reflection',Thickness:'thickness',Edge:'edgeLight',Interference:'interference',Burst:'burstRate',Metalness:'metalness',Roughness:'roughness',Emission:'emission',Twinkle:'twinkle',Grain:'grain',Rainbow:'rainbow',Scanlines:'scanlines',Wave:'wave',Caustics:'caustics',Cracks:'cracks',ColorFlow:'colorFlow',Env:'environment'};
    Object.entries(mapping).forEach(([key,value])=>u[`u${key}`].value=s[value]);
    u.uSize.value=particleSizeForPhase(s,r.activeCount===0);
    for(const key of ['GlowRadius','RimLight','RimWidth','SweepStrength','SweepSpeed','SweepWidth','SparkleStrength','SparkleSpeed','SparkleDensity','BreathingPeriod','MovingLightSpeed','TrailBrightness','TrailColorMix','VolumeLight','VolumeSpeed'])u[`u${key}`].value=s[key[0].toLowerCase()+key.slice(1)];
    u.uSweepAngle.value=s.sweepAngle*Math.PI/180;u.uRimColor.value.set(s.rimColor);u.uTrailColor.value.set(s.trailColor);
    u.uMaterial.value=materials.indexOf(s.material);
    r.haloMaterial.uniforms.uStrength.value=s.completionHalo;r.haloMaterial.uniforms.uDuration.value=s.completionDuration;r.haloMaterial.uniforms.uWidth.value=s.completionWidth;r.haloMaterial.uniforms.uRings.value=s.completionRings;
    r.halo.scale.set(s.completionRadius,s.completionRadius,1);
    r.shadowMaterial.uniforms.uStrength.value=s.shadow;r.shadowMaterial.uniforms.uBlur.value=s.shadowBlur;r.shadow.scale.set(1,s.shadowBlur,1);
    for(let j=0;j<r.tails.length;j++){
      const tail=r.tails[j];tail.fade=Math.exp(-j*(0.65+s.trailDecay*1.8));tail.nextFade=j===2?0:Math.exp(-(j+1)*(0.65+s.trailDecay*1.8));
      tail.limit=(12+s.trail*80)*s.trailLength*(j+1)/3;
    }
    setPalette(r,r.palette);applyTransform(r);r.nextIdleHitUpdate=0;
  }
  function particleSizeForPhase(settings,idle){
    const fallback=Number.isFinite(settings?.particleSize)?settings.particleSize:2;
    const value=idle?settings?.idleParticleSize:settings?.particleSize;
    return Number.isFinite(value)?value:fallback;
  }
  // The idle shape footprint is independent from the point sprite size. This
  // lets users make the floating word or form occupy more/less of the canvas
  // without changing playback lyric typography or idle particle sharpness.
  function idleScaleForShape(settings){
    const value=Number(settings?.idleScale);
    return Number.isFinite(value)?clamp(value,.5,2.5):1;
  }
  function setPalette(r,palette){
    if(!r||r.disposed)return;r.palette=palette;const s=r.settings;
    const cover=Array.isArray(palette)?palette:palette?.coverColors||[palette?.primary,palette?.glow,palette?.highlight];
    const idle=r.activeCount===0,independent=idle&&s.idlePaletteEnabled;
    const colorMode=independent?s.idleColorMode:s.colorMode;
    const scoped=!independent&&s.animationPaletteEnabled[s.aggregation]&&s.animationColors[s.aggregation];
    ['A','B','C'].forEach((key,i)=>{
      const p=cover?.[i],color=r.uniforms[`uColor${key}`].value;
      if(scoped)color.set(scoped[`color${key}`]);else if(colorMode==='cover'&&p&&Number.isFinite(p.r))color.setRGB(p.r/255,p.g/255,p.b/255);else color.set(colorMode==='custom'?s[`${independent?'idleColor':'color'}${key}`]:fallbackColors[i]);
    });
    const gradient=independent?s.idleGradientMode:s.gradientMode;
    // Idle particles have no lyric character index. An inherited per-character
    // palette follows the current shape's width instead of stale lyric data.
    r.uniforms.uGradient.value=gradientModes.indexOf(idle&&gradient==='character'?'linear':gradient);
    r.uniforms.uGradientSpeed.value=independent?s.idleGradientSpeed:s.gradientSpeed;
    r.uniforms.uGradientSegments.value=independent?s.idleGradientSegments:s.gradientSegments;
    r.paletteScopeIdle=idle;
    const p=cover?.[0];if(p&&Number.isFinite(p.r))r.uniforms.uEnvironment.value.setRGB(p.r/255,p.g/255,p.b/255);
  }
  function resize(r,pixelRatio){
    if(!r||r.disposed)return;
    const dpr=clamp(pixelRatio||r.pixelRatio||global.devicePixelRatio||1,0.5,2);
    // The app checks DPR each animation frame. The observer owns host-size
    // invalidation, so an unchanged frame needs no synchronous layout read.
    if(r.observer&&!r.resizePending&&r.width&&r.height&&dpr===r.pixelRatio)return;
    const rect=r.host.getBoundingClientRect();const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));r.resizePending=false;
    if(w===r.width&&h===r.height&&dpr===r.pixelRatio)return;
    r.width=w;r.height=h;r.pixelRatio=dpr;r.viewWidth=900*w/h;
    r.camera.left=-r.viewWidth/2;r.camera.right=r.viewWidth/2;r.camera.updateProjectionMatrix();
    r.renderer.setPixelRatio(dpr);r.renderer.setSize(w,h,false);r.bloom.resize(Math.round(w*dpr),Math.round(h*dpr));r.uniforms.uPixelRatio.value=dpr*h/900;r.layoutKey='';applyTransform(r);
  }

  function transformSnapshot(r) {
    return Object.fromEntries(['positionX','positionY','rotationX','rotationY','gestureScale'].map(key=>[key,r.settings[key]]));
  }
  function applyTransform(r) {
    const s=r.settings;
    r.content.position.set(s.positionX*r.viewWidth,s.positionY*900,0);
    r.content.rotation.set(s.rotationX*Math.PI/180,s.rotationY*Math.PI/180,0);
    r.content.scale.setScalar(s.gestureScale);
    updateInteractionBounds(r,true);
  }
  function updateInteractionBounds(r,force=false) {
    if(!r.interaction)return;
    const bounds=r.drag?.bounds||(r.activeCount?r.lyricBounds:r.idleBounds);
    if(!bounds||!Number.isFinite(bounds.minX)||!Number.isFinite(bounds.maxY)){
      if(!r.drag)r.interaction.hidden=true;
      return;
    }
    // Dynamic idle motion needs only a small, throttled hit region. It shares
    // the main update loop's bounds and never measures DOM during rendering.
    if(!r.activeCount&&!force&&!r.drag&&!r.interaction.hidden&&r.lastNow<(r.nextIdleHitUpdate||0))return;
    r.nextIdleHitUpdate=r.lastNow+120;
    const minZ=bounds.minZ??-2,maxZ=bounds.maxZ??2;
    const s=r.settings,key=[bounds.minX,bounds.maxX,bounds.minY,bounds.maxY,minZ,maxZ,r.width,r.height,s.positionX,s.positionY,s.rotationX,s.rotationY,s.gestureScale,!!r.drag].join('|');
    if(!r.interaction.hidden&&r.hitBoundsKey===key)return;
    r.hitBoundsKey=key;
    r.content.updateMatrixWorld(true);r.camera.updateMatrixWorld(true);
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY,bounds.maxY])for(const z of [minZ,maxZ]){
      r.hitPoint.set(x,y,z).applyMatrix4(r.content.matrixWorld).project(r.camera);
      const px=(r.hitPoint.x+1)*r.width/2,py=(1-r.hitPoint.y)*r.height/2;
      left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
    }
    // Keep a usable pointer target for narrow strokes. Ambient particles are
    // excluded; while dragging, animation cannot change the target's size.
    const pad=10;
    const width=r.drag?.hitWidth||Math.max(36,right-left+pad*2),height=r.drag?.hitHeight||Math.max(36,bottom-top+pad*2);
    r.hitWidth=width;r.hitHeight=height;
    Object.assign(r.interaction.style,{left:`${(left+right-width)/2}px`,top:`${(top+bottom-height)/2}px`,width:`${width}px`,height:`${height}px`});
    r.interaction.hidden=false;
  }
  function attachInteraction(r) {
    const surface=document.createElement('div');surface.className='particle-lyrics-interaction';surface.hidden=true;surface.tabIndex=0;
    surface.setAttribute('role','group');surface.setAttribute('aria-label','粒子歌词及待机图案：中间拖动位置，两侧拖动角度，滚轮缩放。方向键移动，Shift 加方向键转动，加减键缩放。');
    r.host.append(surface);r.interaction=surface;r.hitPoint=new r.THREE.Vector3();
    const modeAt=event=>{
      const rect=surface.getBoundingClientRect(),fraction=(event.clientX-rect.left)/Math.max(1,rect.width);
      return fraction<0.24||fraction>0.76?'rotate':'move';
    };
    const commit=()=>{if(!r.disposed&&typeof r.onTransformChange==='function')r.onTransformChange(transformSnapshot(r));};
    const change=next=>{
      Object.assign(r.settings,next);
      r.settings.positionX=clamp(r.settings.positionX,-1,1);r.settings.positionY=clamp(r.settings.positionY,-1,1);
      r.settings.rotationX=clamp(r.settings.rotationX,-70,70);r.settings.rotationY=clamp(r.settings.rotationY,-70,70);r.settings.gestureScale=clamp(r.settings.gestureScale,0.35,3);
      applyTransform(r);
      // A paused or reduced-motion scene can have no scheduled animation frame.
      // Request drawing here; persistence still happens only on gesture commit.
      if(typeof r.onInvalidate==='function')r.onInvalidate();
    };
    const down=event=>{
      if(event.button!==0||r.disposed||r.drag)return;
      event.preventDefault();event.stopPropagation();
      r.drag={id:event.pointerId,x:event.clientX,y:event.clientY,mode:modeAt(event),...transformSnapshot(r),bounds:{...(r.activeCount?r.lyricBounds:r.idleBounds)},hitWidth:r.hitWidth,hitHeight:r.hitHeight};
      surface.dataset.dragging='true';surface.setPointerCapture(event.pointerId);surface.style.cursor='grabbing';surface.focus({preventScroll:true});
    };
    const move=event=>{
      if(!r.drag){surface.style.cursor=modeAt(event)==='rotate'?'ew-resize':'grab';return;}
      if(event.pointerId!==r.drag.id)return;
      event.preventDefault();event.stopPropagation();
      const drag=r.drag,dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(drag.mode==='move')change({positionX:drag.positionX+dx/Math.max(1,r.width),positionY:drag.positionY-dy/Math.max(1,r.height)});
      else change({rotationY:drag.rotationY+dx*0.35,rotationX:drag.rotationX+dy*0.35});
    };
    const finish=event=>{
      if(!r.drag||event.pointerId!==r.drag.id)return;
      event.stopPropagation();const pointer=r.drag.id;r.drag=null;delete surface.dataset.dragging;
      if(surface.hasPointerCapture(pointer))surface.releasePointerCapture(pointer);
      surface.style.cursor=modeAt(event)==='rotate'?'ew-resize':'grab';commit();updateInteractionBounds(r,true);
    };
    const wheel=event=>{
      event.preventDefault();event.stopPropagation();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?r.height:1);
      change({gestureScale:r.settings.gestureScale*Math.exp(-clamp(delta,-1000,1000)*0.0012)});commit();
    };
    const keydown=event=>{
      const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
      const direction=arrows[event.key];
      if(direction){if(event.shiftKey)change({rotationY:r.settings.rotationY+direction[0]*2,rotationX:r.settings.rotationX-direction[1]*2});else change({positionX:r.settings.positionX+direction[0]*0.01,positionY:r.settings.positionY+direction[1]*0.01});}
      else if(['+','=','-','_'].includes(event.key))change({gestureScale:r.settings.gestureScale*(event.key==='-'||event.key==='_'?0.95:1.05)});
      else return;
      event.preventDefault();event.stopPropagation();commit();
    };
    surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',finish);surface.addEventListener('pointercancel',finish);surface.addEventListener('lostpointercapture',finish);surface.addEventListener('wheel',wheel,{passive:false});surface.addEventListener('keydown',keydown);
    r.disposeInteraction=()=>{r.drag=null;surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerup',finish);surface.removeEventListener('pointercancel',finish);surface.removeEventListener('lostpointercapture',finish);surface.removeEventListener('wheel',wheel);surface.removeEventListener('keydown',keydown);surface.remove();};
  }

  function idlePosition(r,i,t,ambient,out){
    const random=r.random,trig=r.idleTrig;
    const s=r.settings,a=(random?random[i+11]:rand(i+11))*TAU,seed=random?random[i+17]:rand(i+17),layer=Math.floor(seed*s.flowLayers),sign=s.direction==='counter'?1:-1;
    const custom=!ambient&&r.idleShapePoints?.length>0;
    const motion=r.lastFrame.reducedMotion?0:1;let angle=a;
    if(['rotate','floatRotate','mood'].includes(s.idle))angle+=t*s.rotationSpeed*Math.PI/180*sign*motion*(s.idle==='mood'?0.35+r.bass*1.8*s.audioStrength:1);
    if(s.idle==='flow'&&!custom)angle+=t*s.idleSpeed*(layer%2?-1:1)*sign*motion;
    let radius=205+((random?random[i+23]:rand(i+23))-0.5)*34+Math.sin(a*3+t*0.25)*6,x=trig?trig[i*2]:Math.cos(a),y=trig?trig[i*2+1]:Math.sin(a);
    if(s.shape==='square'){const k=1/Math.max(Math.abs(x),Math.abs(y));x*=k;y*=k;}
    if(s.shape==='star')radius*=0.6+0.4*Math.pow(0.5+0.5*Math.cos(a*5),0.7);
    if(s.shape==='spot')radius*=Math.sqrt(seed);
    if(s.shape==='snowflake'){const branch=Math.floor(a/TAU*6)*TAU/6;const arm=seed*170;const twig=((random?random[i+24]:rand(i+24))-0.5)*Math.sin(seed*14)*42;x=(Math.cos(branch)*arm-Math.sin(branch)*twig)/radius;y=(Math.sin(branch)*arm+Math.cos(branch)*twig)/radius;}
    if(s.shape==='note'){
      if(seed<0.55){x=-0.25+x*0.28;y=-0.48+y*0.2;}
      else if(seed<0.85){x=0.03+((random?random[i+26]:rand(i+26))-0.5)*0.04;y=-0.42+(seed-0.55)/0.3*1.2;}
      else{x=0.03+(seed-0.85)/0.15*0.55;y=0.78-Math.pow((seed-0.85)/0.15,2)*0.45;}
    }
    // Keep a legible perimeter while inner layers circulate at different radii.
    if(custom){
      const index=(i%(r.idleShapePoints.length/2))*2;
      x=r.idleShapePoints[index];y=r.idleShapePoints[index+1];radius=205;
      if(s.idle==='flow'){
        const phase=t*s.idleSpeed*(layer%2?-1:1)*sign+seed*TAU;
        x+=Math.sin(phase)*.018*motion;y+=Math.cos(phase)*.018*motion;
      }
    }else if(s.idle==='flow'&&seed<0.8)radius*=0.2+0.7*Math.sqrt(random?random[i+71]:rand(i+71));
    const rotation=angle-a,baseX=x;
    x=baseX*Math.cos(rotation)-y*Math.sin(rotation);y=baseX*Math.sin(rotation)+y*Math.cos(rotation);
    let scale=1,dy=0;
    const breath=Math.sin(t*TAU/s.period),pulse=s.beatSync?r.beat:Math.pow(Math.max(0,Math.sin(t*TAU/s.pulsePeriod)),8);
    if(s.idle==='breathe')scale+=breath*s.breathAmount*motion;
    if(s.idle==='pulse')scale+=pulse*s.breathAmount*motion;
    if(['float','floatRotate','mood'].includes(s.idle))dy=Math.sin(t*TAU/s.floatPeriod)*s.floatAmount*motion;
    if(s.idle==='edge')radius+=Math.sin(a*12/s.wavelength-t*s.idleSpeed*3)*s.edgeAmount*motion;
    if(s.idle==='morph'){x*=1+Math.sin(t*s.idleSpeed)*s.morphAmount*motion;y*=1-Math.sin(t*s.idleSpeed)*s.morphAmount*motion;}
    if(s.idle==='twist'){const turn=Math.sin(t*s.idleSpeed+(custom?y*.8:a))*s.twistAngle*Math.PI/180*motion*(custom?0.18:1);const px=x;x=x*Math.cos(turn)-y*Math.sin(turn);y=px*Math.sin(turn)+y*Math.cos(turn);}
    if(s.idle==='spread')scale+=Math.pow(Math.max(0,Math.sin(t*TAU/s.period-(custom?0:seed))),Math.max(0.5,2.5/s.idleSpeed))*s.spreadRadius*motion;
    if(s.idle==='bass')scale+=Math.max(0,r.bass-s.bassThreshold)*s.audioStrength*motion;
    if(s.idle==='beat')dy+=Math.pow(r.beat,Math.max(0.2,s.fallSpeed))*s.audioStrength*45*motion;
    if(s.idle==='mood')scale+=r.bass*s.audioStrength*0.25*motion;
    if(ambient){radius*=1.1+(random?random[i+37]:rand(i+37))*1.8;x*=r.viewWidth/1300;dy+=((random?random[i+38]:rand(i+38))-0.5)*150;}
    if(custom)scale*=Number.isFinite(s.idleShapeScale)?clamp(s.idleShapeScale,.5,1.8):1;
    const idleScale=idleScaleForShape(s);
    const fit=custom&&r.idleShapeResolved==='text'?1:Math.min(1,r.viewWidth/620);
    out[0]=x*radius*scale*s.scatter*fit*idleScale;out[1]=y*radius*scale*s.scatter*fit*idleScale+dy;out[2]=((random?random[i+39]:rand(i+39))-0.5)*450*s.depth*idleScale;
  }

  function selectTargets(r,frame){
    const s=r.settings;
    const text=String(frame.text||'');
    // Skipping idle for a lyric track is a playback behaviour. While the music
    // is not playing the idle animation must stay untouched, so a paused or
    // not-yet-started track never replaces the idle shape with lyric lines.
    const playing=frame.playing===true;
    const fallbackActive=frame.hasLyric!==true
      && playing
      && s.skipIdleForLyrics===true
      && frame.hasLyrics===true
      && String(frame.fallbackText||'').trim();
    const displayText=fallbackActive?String(frame.fallbackText||''):text;
    const cueFrame=fallbackActive?{...frame,text:displayText,
      lyricKey:frame.fallbackLyricKey||`${frame.lyricKey||''}|fallback`,
      lineStart:frame.fallbackLineStart,
      lineEnd:frame.fallbackLineEnd,
      glyphTimings:frame.fallbackGlyphTimings
    }:frame;
    const family=frame.fontFamily||'"Microsoft YaHei", "PingFang SC", sans-serif';
    const layoutKey=[displayText,s.glyphStyle,s.textScale,s.textY,s.density,r.viewWidth,family].join('|');
    if(r.layoutKey!==layoutKey){
      r.layout=layoutText(displayText,s,r.viewWidth,family);r.layoutKey=layoutKey;r.selectionKey='';
      let min=Infinity,max=-Infinity;
      for(const point of r.layout.points){min=Math.min(min,point.x);max=Math.max(max,point.x);}
      r.lyricColorMin=Number.isFinite(min)?min:-r.viewWidth/2;
      r.lyricColorWidth=Number.isFinite(max)?Math.max(1,max-min):r.viewWidth;
    }
    const cue=resolveCue(cueFrame,r.layout.chars,r.cueCache||(r.cueCache={}));r.timingExact=cue.exact;r.activeGlyph=cue.active;r.audioTime=cue.time;
    // Both word modes follow the media clock, including motion within a glyph.
    // Clip the flight to the vocal window so even a very short syllable can
    // finish forming before its end. Past glyphs remain formed in progressive.
    r.glyphProgress.length=r.layout.chars.length;r.glyphProgress.fill(0);
    for(const window of cue.windows){
      const duration=Math.max(0.001,Math.min(s.aggregateDuration,(window.end-window.start)*0.26));
      r.glyphProgress[window.index]=clamp((cue.time-window.start)/duration);
    }
    const available=(frame.hasLyric!==false&&text.trim()||fallbackActive&&displayText.trim())
      && (frame.playing||r.everPlayed||cue.time>0);
    // Track-level lyric availability is separate from the current timed line;
    // an intro/interlude must not be mistaken for a pure-music track.
    const idleSuppressed=!available&&(s.idleDisabled===true||(playing&&s.skipIdleForLyrics===true&&frame.hasLyrics===true));
    const displayPresentation=fallbackActive?'line':s.presentation;
    const indices=displayPresentation==='sung'?(cue.active>=0?[cue.active]:[]):displayPresentation==='progressive'?cue.revealed:r.layout.chars.map((_,i)=>i);
    r.idleSuppressed=idleSuppressed;
    const key=[frame.lyricKey,fallbackActive?frame.fallbackLyricKey:'',available,idleSuppressed,layoutKey,displayPresentation,indices.join(','),s.aggregation,s.aggregateDuration].join('|');
    if(key===r.selectionKey)return;
    r.selectionKey=key;r.settled=false;r.lastText=displayText;
    const wanted=new Set(indices);
    const progressive=s.presentation==='progressive';
    const candidates=available?(progressive?r.layout.points:r.layout.points.filter(point=>wanted.has(point.char))):[];
    const n=Math.floor(Math.min(candidates.length,r.count-800)*s.density);
    r.activeCount=0;r.poolCount=n;r.snapPaused=!frame.playing;r.lyricBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    r.targetDuration=displayPresentation==='sung'?Math.min(s.aggregateDuration,Math.max(0.06,cue.duration*0.26)):s.aggregateDuration;
    for(let i=0;i<r.count;i++){
      const k=i*3,d=i*4;
      if(i<n){
        const p=candidates[Math.floor(i*candidates.length/n)];
        if(progressive&&!wanted.has(p.char)){r.enabled[i]=0;continue;}
        const changed=!r.enabled[i]||Math.abs(r.targets[k]-p.x)>0.1||Math.abs(r.targets[k+1]-p.y)>0.1;
        if(changed){r.from[k]=r.positions[k];r.from[k+1]=r.positions[k+1];r.from[k+2]=r.positions[k+2];r.start[i]=r.clock;for(const tail of r.tails){tail.array[k]=r.positions[k];tail.array[k+1]=r.positions[k+1];tail.array[k+2]=r.positions[k+2];}}
        r.targets[k]=p.x;r.targets[k+1]=p.y;r.targets[k+2]=p.z;r.enabled[i]=1;
        r.glyphIndices[i]=p.char;
        r.activeCount++;
        r.lyricBounds.minX=Math.min(r.lyricBounds.minX,p.x);r.lyricBounds.maxX=Math.max(r.lyricBounds.maxX,p.x);
        r.lyricBounds.minY=Math.min(r.lyricBounds.minY,p.y);r.lyricBounds.maxY=Math.max(r.lyricBounds.maxY,p.y);
        r.data[d+1]=p.char/Math.max(1,r.layout.chars.length-1);
      }else{r.enabled[i]=0;r.data[d+1]=rand(i+51);}
    }
  }

  const idle=[0,0,0];
  function uploadActiveRange(attribute,count){
    attribute.updateRange.offset=0;attribute.updateRange.count=count;attribute.needsUpdate=true;
  }
  function update(r,frame={}) {
    if(!r||r.disposed||r.contextLost)return;
    const now=Number(frame.now)||performance.now();const dt=r.lastNow?clamp((now-r.lastNow)/1000,0,0.05):1/60;r.lastNow=now;
    r.lastFrame=frame;if(frame.playing)r.everPlayed=true;
    // The decorative clock never pauses with the music: a paused lyric keeps its
    // formed glyphs and its media-driven timing, while the animation (light,
    // flow, twinkle, sweep, halo) and any in-progress aggregation keep running.
    // Only the reduced-motion preference stills the scene.
    const clockRuns=!frame.reducedMotion;
    if(clockRuns)r.clock+=dt;
    r.bass+=(clamp(frame.bass)-r.bass)*(1-Math.exp(-dt*12));r.beat+=(clamp(frame.beat)-r.beat)*(1-Math.exp(-dt*18));
    prepareIdleShape(r,frame);
    selectTargets(r,frame);
    const isIdle=r.activeCount===0,advance=clockRuns;
    if(r.paletteScopeIdle!==isIdle){setPalette(r,r.palette);r.nextIdleHitUpdate=0;}
    if(frame.playing===true)r.snapPaused=false;
    const s=r.settings,t=r.clock,positions=r.positions,data=r.data;
    const timed=s.presentation==='sung'||s.presentation==='progressive';
    const idleMainCount=r.idleMainCount||4500;
    const drawCount=r.idleSuppressed?0:Math.min(r.count,r.activeCount?(r.poolCount||r.activeCount)+1200:idleMainCount+1500);
    const idleFollow=frame.reducedMotion?1:1-Math.exp(-dt*2.8),force=160*s.scatter;
    const trailScale=(0.4+s.trail)*s.trailLength;
    // Keep the lyric size untouched while a lyric is forming or displayed;
    // only the no-lyric idle field uses the dedicated idle size control.
    r.uniforms.uSize.value=particleSizeForPhase(s,isIdle);
    const idleBounds=r.idleBounds;
    if(isIdle){idleBounds.minX=idleBounds.minY=idleBounds.minZ=Infinity;idleBounds.maxX=idleBounds.maxY=idleBounds.maxZ=-Infinity;}
    for(let j=0;j<r.tails.length;j++)r.tails[j].follow=1-Math.exp(-dt*(18-j*4));
    let allSettled=r.activeCount>0,hasTrail=false;
    for(let i=0;i<drawCount;i++){
      const k=i*3,d=i*4,seed=data[d];const wasX=positions[k],wasY=positions[k+1],wasZ=positions[k+2];
      let alpha=1,arrived=0,flight=0;
      if(r.enabled[i]){
    // snapPaused keeps a lyric that is selected while the music is paused (a
    // paused seek or a recreated runtime) already formed; the running clock
    // then animates its light and colour instead of stilling the whole scene.
    const p=frame.reducedMotion?1:timed?r.glyphProgress[r.glyphIndices[i]]:r.snapPaused?1:clamp((t-r.start[i])/r.targetDuration);
        if(p===1){
          positions[k]=r.targets[k];positions[k+1]=r.targets[k+1];positions[k+2]=r.targets[k+2];arrived=1;
        }else{
        const q=smooth(p),arc=Math.sin(p*Math.PI)*(1-p),angle=seed*TAU+(timed?r.audioTime:t)*0.8;
        let x=r.from[k]+(r.targets[k]-r.from[k])*q,y=r.from[k+1]+(r.targets[k+1]-r.from[k+1])*q,z=r.from[k+2]*(1-q)+r.targets[k+2]*q;
        if(s.aggregation==='vortex'){x+=Math.cos(angle+p*p*TAU*2)*arc*force;y+=Math.sin(angle+p*p*TAU*2)*arc*force;}
        else if(s.aggregation==='corners'){
          const corners=smooth(clamp(p/0.23)),release=smooth(clamp((p-0.16)/0.84));
          const cx=(seed<0.5?-1:1)*force*(1.1+Math.sin(p*Math.PI)*0.7),cy=(i%2?-1:1)*force*0.8;
          x=(r.from[k]+(cx-r.from[k])*corners)*(1-release)+r.targets[k]*release;
          y=(r.from[k+1]+(cy-r.from[k+1])*corners)*(1-release)+r.targets[k+1]*release;
        }
        else if(s.aggregation==='burst'){const spike=1.1+0.65*Math.pow(0.5+0.5*Math.cos(angle*5),4);x+=Math.cos(angle)*arc*force*spike;y+=Math.sin(angle)*arc*force*spike;z+=arc*force;}
        else if(s.aggregation==='breathe'){const contraction=1-0.75*Math.sin(p*Math.PI);x*=contraction;y*=contraction;z*=contraction;}
        else if(s.aggregation==='rain'){y+=arc*force*1.7;x+=Math.sin(angle+p*6)*arc*28;}
        else if(s.aggregation==='curve'){x+=Math.sin(p*TAU+seed*2)*arc*force;y+=Math.cos(p*Math.PI+seed*3)*arc*force*1.4;}
        else if(s.aggregation==='spiral'){x+=Math.cos(angle+p*p*TAU*3)*arc*force;y+=Math.sin(angle+p*p*TAU*3)*arc*force;z+=arc*force*0.5;}
        positions[k]=x;positions[k+1]=y;positions[k+2]=z;
        arrived=p>=0.999?1:0;flight=arrived?0:Math.min(1,(1-p)*5);if(!arrived)allSettled=false;
        if(!arrived){
          if(s.display==='beat')alpha=smooth(clamp((r.bass-s.displayThreshold)/0.2));
          else if(s.display==='segments')alpha=smooth(clamp(p*s.displaySegments-Math.floor(seed*s.displaySegments)));
          else if(s.display==='breathe')alpha=0.12+0.88*(0.5+0.5*Math.sin(t*TAU/s.displayPeriod));
          else if(s.display==='segmentBreathe')alpha=0.12+0.88*(0.5+0.5*Math.sin(t*TAU/s.displayPeriod+Math.floor(seed*s.displaySegments)*TAU/s.displaySegments));
        }
        }
      }else{
        idlePosition(r,i,t,r.activeCount>0||i>=idleMainCount,idle);
        if(isIdle&&i<idleMainCount){
          // Measure the main shape's destinations during the existing pass.
          // Old lyric flights and ambient particles must not create a
          // full-screen pointer target while a new idle shape settles.
          idleBounds.minX=Math.min(idleBounds.minX,idle[0]);idleBounds.maxX=Math.max(idleBounds.maxX,idle[0]);
          idleBounds.minY=Math.min(idleBounds.minY,idle[1]);idleBounds.maxY=Math.max(idleBounds.maxY,idle[1]);
          idleBounds.minZ=Math.min(idleBounds.minZ,idle[2]);idleBounds.maxZ=Math.max(idleBounds.maxZ,idle[2]);
        }
        positions[k]+=(idle[0]-positions[k])*idleFollow;positions[k+1]+=(idle[1]-positions[k+1])*idleFollow;positions[k+2]+=(idle[2]-positions[k+2])*idleFollow;
        alpha=r.activeCount?0.14:i<idleMainCount?0.18:0.1;
        if(!r.activeCount&&i<idleMainCount&&r.idleShapeResolved==='text'&&r.idleShapePoints)alpha=.55;
        if(r.activeCount&&i>(r.poolCount||r.activeCount)+1200)alpha=0;
        if(!r.activeCount&&i>idleMainCount+1500)alpha=0;
        if(s.idle==='light')alpha*=s.minBrightness+(1-s.minBrightness)*(0.5+0.5*Math.sin(t*TAU/s.period));
        if(s.idle==='twinkle')alpha*=fract(seed+t*s.idleSpeed)<s.visibleRatio?1:0.08;
        if(s.idle==='mood')alpha*=0.5+r.bass*0.8*s.audioStrength;
      }
      data[d+2]=arrived;data[d+3]=alpha;
      let headX=positions[k],headY=positions[k+1],headZ=positions[k+2];
      const strength=r.enabled[i]&&seed>1-s.trailDensity?alpha*flight*s.trail*0.38:0;
      if(strength>0)hasTrail=true;
      for(let j=0;j<r.tails.length;j++){
        const tail=r.tails[j],follow=tail.follow;
        if(tail.array[k]===0&&tail.array[k+1]===0){tail.array[k]=wasX;tail.array[k+1]=wasY;tail.array[k+2]=wasZ;}
        // Trail history follows the same never-pausing decorative clock.
        if(advance){tail.array[k]+=(wasX-tail.array[k])*follow;tail.array[k+1]+=(wasY-tail.array[k+1])*follow;tail.array[k+2]+=(wasZ-tail.array[k+2])*follow;}
        const base=i*18+j*6,meta=i*12+j*4;
        r.trailData[meta]=data[d+1];r.trailData[meta+1]=strength*tail.fade;r.trailData[meta+2]=data[d+1];r.trailData[meta+3]=strength*tail.nextFade;
        if(strength<=0)continue;
        let dx=(tail.array[k]-positions[k])*trailScale,dy=(tail.array[k+1]-positions[k+1])*trailScale,dz=(tail.array[k+2]-positions[k+2])*trailScale;
        const ratio=Math.min(1,tail.limit/Math.max(0.001,Math.hypot(dx,dy,dz)));
        const endX=positions[k]+dx*ratio,endY=positions[k+1]+dy*ratio,endZ=positions[k+2]+dz*ratio;
        r.trailPositions[base]=headX;r.trailPositions[base+1]=headY;r.trailPositions[base+2]=headZ;
        r.trailPositions[base+3]=endX;r.trailPositions[base+4]=endY;r.trailPositions[base+5]=endZ;
        headX=endX;headY=endY;headZ=endZ;
      }
    }
    if(allSettled&&!r.settled)r.completedAt=t;
    r.settled=allSettled;
    r.uniforms.uTextMin.value=r.idleSuppressed?0:isIdle?idleBounds.minX:r.lyricColorMin;
    r.uniforms.uTextWidth.value=isIdle?Math.max(1,idleBounds.maxX-idleBounds.minX):r.lyricColorWidth;
    r.uniforms.uTime.value=t;r.uniforms.uBass.value=r.bass;r.uniforms.uBeat.value=r.beat;
    r.haloMaterial.uniforms.uAge.value=t-r.completedAt;r.halo.position.y=s.textY*350;r.halo.visible=r.activeCount>0&&s.completionHalo>0&&t-r.completedAt<s.completionDuration;
    r.shadow.visible=r.activeCount>0&&s.shadow>0;r.shadow.position.y=s.textY*350-(r.layout?.fontSize||108)*0.7+s.shadowOffset;
    r.volume.visible=r.activeCount>0&&s.volumeLight>0;
    r.volume.position.y=s.textY*350;
    r.volume.scale.set(Math.min(r.viewWidth*1.15,Math.max(400,r.uniforms.uTextWidth.value+240))*s.volumeRadius,Math.max(240,(r.layout?.fontSize||108)*(r.layout?.rows||1)*1.8)*s.volumeRadius,1);
    uploadActiveRange(r.geometry.attributes.position,drawCount*3);uploadActiveRange(r.geometry.attributes.aData,drawCount*4);
    r.geometry.setDrawRange(0,drawCount);
    r.trailMesh.visible=hasTrail&&s.trail>0&&s.trailBrightness>0&&!frame.reducedMotion&&!allSettled;
    r.trailGeometry.setDrawRange(0,drawCount*6);uploadActiveRange(r.trailGeometry.attributes.position,drawCount*18);uploadActiveRange(r.trailGeometry.attributes.aTrail,drawCount*12);
    updateInteractionBounds(r);
    if(s.bloomStrength>0)r.bloom.render(r.renderer,r.scene,r.camera,s);
    else{r.renderer.setRenderTarget(null);r.renderer.clear();r.renderer.render(r.scene,r.camera);}
  }
  function diagnostics(r){return {active:!!r&&!r.disposed,particleCount:r?.count||0,assembledCount:r?.activeCount||0,idleSuppressed:r?.idleSuppressed===true,activeGlyph:r?.activeGlyph??-1,timingExact:r?.timingExact||false,audioTime:r?.audioTime??0,aggregationClock:r?.settings.presentation==='line'?'visual':'audio',settled:r?.settled||false,rows:r?.layout?.rows||0,clock:r?.clock||0,idleScale:idleScaleForShape(r?.settings),idlePointCount:(r?.idleShapePoints?.length||0)/2,idleMainCount:r?.idleMainCount||4500,idleCacheBuildCount:r?.idleCacheBuildCount||0,idleShapeResolved:r?.idleShapeResolved||'circle',idleRows:r?.idleShapeRows||0,canvasCount:r?.host?.querySelectorAll('canvas').length||0,drawCalls:r?.renderer?.info?.render?.calls||0,resources:r?.renderer?.info?.memory||{},finite:!r||r.positions.every(Number.isFinite),disposed:r?.disposed||false};}
  function dispose(r){
    if(!r||r.disposed)return;r.disposed=true;r.observer?.disconnect();r.disposeInteraction?.();
    r.renderer.domElement.removeEventListener('webglcontextlost',r.contextListeners.lost);r.renderer.domElement.removeEventListener('webglcontextrestored',r.contextListeners.restored);
    r.geometry.dispose();r.material.dispose();r.trailGeometry.dispose();r.trailMaterial.dispose();
    r.halo.geometry.dispose();r.haloMaterial.dispose();r.shadow.geometry.dispose();r.shadowMaterial.dispose();r.volume.geometry.dispose();r.volumeMaterial.dispose();r.bloom.dispose();
    r.scene.clear();r.renderer.dispose();r.renderer.forceContextLoss();r.renderer.domElement.width=1;r.renderer.domElement.height=1;r.renderer.domElement.remove();
    r.random=null;r.idleTrig=null;r.cueCache=null;r.idleShapePoints=null;r.idleShapeSource=null;
  }
  global.FeParticleLyricsRuntime=Object.freeze({create,update,resize,setSettings,setPalette,dispose,diagnostics,resolveCue,graphemes,particleSizeForPhase,idleScaleForShape,idlePosition});
})(window);
