(function attachOrbitalAtmosphere(global) {
  'use strict';
  const TAU = Math.PI * 2;
  const finite = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;

  function create(THREE) {
    const group = new THREE.Group();
    group.name = 'HarmonicOrbitalAtmosphere';
    const geometries = new Set(), materials = new Set();
    const layerCount = 28, maxRain = 180, splashPerDrop = 8;
    let time = 0, coldAirTime = 0, rainTime = 0, waterTime = 0, audio = 0, rainCount = 117, disposed = false;
    let emitterMode = 'central-rings';
    const groundY = -6.55;
    const shared = {
      uTime:{value:0},uColdAirTime:{value:0},uRainTime:{value:0},uRadius:{value:11.36},uDensity:{value:.4},
      uHeight:{value:1},uSpread:{value:1},uSplash:{value:.75},uAudio:{value:0},uPixelRatio:{value:1},
      uCyan:{value:new THREE.Color('#18ddea')},uPink:{value:new THREE.Color('#ed75c5')},
      uFogColor:{value:new THREE.Color('#18ddea')},uGroundY:{value:groundY},
      uKeyDirectionWorld:{value:new THREE.Vector3()},uCameraPositionWorld:{value:new THREE.Vector3(0,.45,17.5)},
      uKeyLightIntensity:{value:1},uAmbientLightIntensity:{value:.65},uFogLightStrength:{value:.55},
      uGlowStrength:{value:.45},uGlowSoftness:{value:.65},uLightAudio:{value:0},
      uFloorLightStrength:{value:.45},uFloorShadowStrength:{value:.3},uFloorShadowOffset:{value:new THREE.Vector2()}
    };
    // The cube stream is intentionally kept as a separate layer from the ring
    // mist.  This lets the two effects be tuned independently and keeps the
    // existing reflection pass (which captures the whole atmosphere group)
    // intact.
    Object.assign(shared, {
      uColdAirDensity:{value:.42}, uColdAirSpeed:{value:.55},
      uColdAirSpread:{value:.65}, uColdAirLength:{value:.86},
      uColdAirGroundBlend:{value:.8}, uColdAirAudio:{value:.3},
      uColdAirColor:{value:new THREE.Color('#8feaff')},
      uColdAirAnchorL:{value:new THREE.Vector3(-1.35,-2.05,.36)},
      uColdAirAnchorR:{value:new THREE.Vector3(1.35,-2.05,.36)},
      uColdAirCornerL:{value:new THREE.Vector3(-2.72,-2.92,.12)},
      uColdAirCornerR:{value:new THREE.Vector3(2.72,-2.92,.12)}
    });
    const localLightDirection=new THREE.Vector3(),inverseWorld=new THREE.Matrix4();
    const random = i => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
    function quad(count) {
      const plane = new THREE.PlaneBufferGeometry(1,1);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = plane.index.clone();
      for(const [key,attribute] of Object.entries(plane.attributes)) geometry.setAttribute(key,attribute.clone());
      plane.dispose();geometry.instanceCount = count;geometries.add(geometry);return geometry;
    }
    function material(vertexShader, fragmentShader, additive = false) {
      const result = new THREE.ShaderMaterial({uniforms:shared,vertexShader,fragmentShader,
        transparent:true,depthWrite:false,side:THREE.DoubleSide,
        blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
      materials.add(result);return result;
    }
    const finish = '\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n';
    const fogGeometry = quad(layerCount);
    const fogSeeds = new Float32Array(layerCount*4);
    const fogEmitters = new Float32Array(layerCount*4);
    const emitterAttribute = new THREE.InstancedBufferAttribute(fogEmitters,4);
    emitterAttribute.setUsage(THREE.DynamicDrawUsage);
    const emitterPoint = new THREE.Vector3(), emitterMatrix = new THREE.Matrix4();
    for(let i=0;i<layerCount;i++)fogSeeds.set([i/layerCount*TAU,random(i+1),random(i+50),random(i+90)],i*4);
    fogGeometry.setAttribute('aFog',new THREE.InstancedBufferAttribute(fogSeeds,4));
    fogGeometry.setAttribute('aEmitter',emitterAttribute);
    const fogMaterial = material(`
      attribute vec4 aFog,aEmitter; uniform float uTime,uRadius,uHeight,uSpread,uGroundY;
      varying vec2 vUv; varying float vLife,vSeed;
      varying vec3 vWorldCenter;
      void main(){
        float age=fract(aFog.y+uTime*.075);
        float angle=aFog.x+sin(uTime*.15+aFog.z*6.28)*.16;
        vec2 direction=vec2(cos(angle),sin(angle));
        vec3 center=aEmitter.xyz;
        center.xz+=direction*aEmitter.w;
        float settling=smoothstep(0.,.72,age);
        float spreading=smoothstep(.36,1.,age);
        center.y=mix(max(center.y,uGroundY+.3),uGroundY+.24,pow(settling,1.2));
        center.xz+=direction*(age*.65+spreading*4.8)*uSpread;
        center.xz+=vec2(sin(age*7.+aFog.w*25.),cos(age*6.+aFog.z*6.28))*sin(age*3.14159)*.34*uHeight;
        center.y+=sin(age*8.+aFog.w*6.28)*sin(age*3.14159)*.15*uHeight;
        vWorldCenter=(modelMatrix*vec4(center,1.)).xyz;
        vec4 mv=modelViewMatrix*vec4(center,1.);
        float size=(1.45+age*4.8)*uSpread;
        mv.xy+=position.xy*vec2(size,size*(.78+aFog.w*.35)*uHeight*mix(1.,.28,settling));
        gl_Position=projectionMatrix*mv;vUv=uv;vLife=sin(age*3.14159);vSeed=aFog.w*25.;
      }`, `
      uniform float uTime,uDensity,uAudio; uniform vec3 uFogColor;
      uniform vec3 uKeyDirectionWorld,uCameraPositionWorld;
      uniform float uKeyLightIntensity,uAmbientLightIntensity,uFogLightStrength,uLightAudio;
      varying vec3 vWorldCenter;
      varying vec2 vUv; varying float vLife,vSeed;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+4.1)*.28+noise(p*4.11-2.5)*.15;}
      void main(){
        vec2 p=vUv*4.+vSeed;
        vec2 warp=vec2(fbm(p+vec2(uTime*.16,-uTime*.21)),fbm(p+7.-vec2(uTime*.2,uTime*.12)));
        float density=fbm(p+warp*2.-vec2(uTime*.1,uTime*.28));
        float edge=1.-smoothstep(.13,.5,length(vUv-.5));
        float alpha=smoothstep(.3,.76,density)*edge*vLife*uDensity*(.34+uAudio*.035);
        if(alpha<.002)discard;
        vec3 viewDirection=normalize(uCameraPositionWorld-vWorldCenter);
        float phase=.22+.78*pow(.5+.5*dot(viewDirection,normalize(uKeyDirectionWorld)),3.);
        float silverLining=smoothstep(.30,.62,density)*(1.-smoothstep(.62,.90,density));
        vec3 lit=mix(uFogColor*.12,uFogColor*.4,density);
        lit+=mix(uFogColor,vec3(.78,.93,1.),.25)*uFogLightStrength
          *(.12*uAmbientLightIntensity+phase*uKeyLightIntensity*(.3+silverLining*.9))*(1.+uLightAudio*.18);
        gl_FragColor=vec4(lit,alpha);
        ${finish}
      }`);
    const mist = new THREE.Mesh(fogGeometry,fogMaterial);mist.name='HarmonicRingMist';
    mist.frustumCulled=false;mist.renderOrder=-1;group.add(mist);

    // Cold air flowing off the lower slanted sides of the cube.  Each card is
    // a small volume of noise that travels from a side anchor to the matching
    // bottom corner, then fans into the floor.  The anchors are supplied by
    // the orbital core when available; the update fallback below preserves a
    // useful centered stream for older callers.
    const coldLayerCount = 96;
    const coldGeometry = quad(coldLayerCount);
    const coldSeeds = new Float32Array(coldLayerCount * 4);
    for (let i = 0; i < coldLayerCount; i++) {
      const side = i % 2;
      coldSeeds.set([side, random(i + 710), random(i + 920), random(i + 1130)], i * 4);
    }
    coldGeometry.setAttribute('aCold', new THREE.InstancedBufferAttribute(coldSeeds, 4));
    const coldMaterial = material(`
      attribute vec4 aCold;
      uniform float uColdAirTime,uGroundY,uColdAirSpeed,uColdAirSpread,uColdAirLength,uColdAirGroundBlend,uColdAirAudio;
      uniform vec3 uColdAirAnchorL,uColdAirAnchorR,uColdAirCornerL,uColdAirCornerR;
      varying vec2 vUv; varying float vLife,vSeed,vAudio;
      varying vec3 vWorldCenter;
      float ease(float x){return x*x*(3.-2.*x);}
      void main(){
        float side=aCold.x;
        float age=fract(aCold.y+uColdAirTime*(.045+uColdAirSpeed*.065)*(1.+uColdAirAudio*.45));
        vec3 anchor=mix(uColdAirAnchorL,uColdAirAnchorR,side);
        vec3 corner=mix(uColdAirCornerL,uColdAirCornerR,side);
        float path=ease(clamp(age/max(.001,uColdAirLength),0.,1.));
        vec3 center=mix(anchor,corner,min(path*1.72,1.));
        float groundT=ease(clamp((age-uColdAirLength*.55)/max(.001,1.-uColdAirLength*.55),0.,1.));
        vec3 ground=corner;ground.y=uGroundY+.10;
        ground.xz+=vec2((side-.5)*2.,-.22)*uColdAirSpread*(.25+.75*groundT);
        center=mix(center,ground,groundT*uColdAirGroundBlend);
        vec3 tangent=normalize(ground-anchor+vec3(.0001));
        vec3 sideways=normalize(vec3(-tangent.z,0.,tangent.x)+vec3(.0001));
        float jitter=sin(aCold.z*19.7+uColdAirTime*(.8+uColdAirSpeed*2.)+age*12.);
        center+=sideways*jitter*(.08+.18*uColdAirSpread)*sin(age*3.14159);
        center.y+=sin(aCold.w*17.+uColdAirTime*1.1+age*9.)*.12*sin(age*3.14159);
        vWorldCenter=(modelMatrix*vec4(center,1.)).xyz;
        vec4 mv=modelViewMatrix*vec4(center,1.);
        float size=(.38+.28*aCold.w)*(1.+uColdAirSpread*.35)*(1.+uColdAirAudio*.2);
        mv.xy+=position.xy*vec2(size,size*(.72+.32*aCold.z));
        gl_Position=projectionMatrix*mv;vUv=uv;vLife=sin(age*3.14159);vSeed=aCold.z*23.;vAudio=uColdAirAudio;
      }`, `
      uniform float uColdAirTime,uColdAirDensity,uColdAirAudio,uColdAirGroundBlend;
      uniform vec3 uColdAirColor,uKeyDirectionWorld,uCameraPositionWorld;
      uniform float uKeyLightIntensity,uAmbientLightIntensity,uFogLightStrength,uLightAudio;
      varying vec2 vUv; varying float vLife,vSeed,vAudio; varying vec3 vWorldCenter;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+4.1)*.28+noise(p*4.11-2.5)*.15;}
      void main(){
        vec2 p=vUv*4.+vSeed+vec2(uColdAirTime*.12,-uColdAirTime*.18);
        float density=fbm(p+vec2(fbm(p+2.),fbm(p+7.))*1.8);
        float edge=1.-smoothstep(.08,.5,length(vUv-.5));
        float alpha=smoothstep(.25,.72,density)*edge*vLife*uColdAirDensity*(.42+vAudio*.55);
        // Streams are denser as they meet the floor, creating the requested
        // merge with the ground mist while retaining a soft trailing edge.
        alpha*=mix(.76,1.16,smoothstep(.48,1.,vLife))*mix(.75,1.,uColdAirGroundBlend*.35);
        if(alpha<.002)discard;
        vec3 viewDirection=normalize(uCameraPositionWorld-vWorldCenter);
        float phase=.26+.74*pow(.5+.5*dot(viewDirection,normalize(uKeyDirectionWorld)),3.);
        vec3 lit=mix(uColdAirColor*.16,uColdAirColor*.62,density);
        lit+=mix(uColdAirColor,vec3(.88,.97,1.),.34)*uFogLightStrength
          *(.12*uAmbientLightIntensity+phase*uKeyLightIntensity*.42)*(1.+uLightAudio*.14);
        gl_FragColor=vec4(lit,alpha);
        ${finish}
      }`, true);
    const coldAir = new THREE.Mesh(coldGeometry,coldMaterial);
    coldAir.name='HarmonicCubeColdAir';coldAir.frustumCulled=false;coldAir.renderOrder=-.5;group.add(coldAir);

    // The existing soft light pool stays independent of the reflected water.
    const floorGeometry=new THREE.PlaneBufferGeometry(1,1);geometries.add(floorGeometry);
    const floorMaterial=material(`varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,`
      varying vec2 vUv;uniform vec3 uCyan,uPink;
      uniform vec2 uFloorShadowOffset;
      uniform float uFloorLightStrength,uFloorShadowStrength,uGlowStrength,uGlowSoftness,uLightAudio;
      void main(){
        vec2 p=(vUv-.5)*2.;float softness=mix(.65,1.35,uGlowSoftness);
        float a=exp(-dot((p-vec2(-.24,0.))*vec2(1.45,1.8),(p-vec2(-.24,0.))*vec2(1.45,1.8))*3./softness);
        float b=exp(-dot((p-vec2(.24,.08))*vec2(1.55,2.),(p-vec2(.24,.08))*vec2(1.55,2.))*3./softness);
        float edge=1.-smoothstep(.65,1.,length(p));
        vec2 shadow=(p-uFloorShadowOffset)*vec2(3.4,2.3);
        float dark=exp(-dot(shadow,shadow))*uFloorShadowStrength;
        float light=(a+b)*.5*uFloorLightStrength*(.7+uGlowStrength*.45)*(1.+uLightAudio*.18);
        vec3 color=mix(uCyan,uPink,b/(a+b+.0001))*.38*light*(1.-dark);
        float alpha=clamp((light*.34+dark*.7)*edge,0.,.85);
        if(alpha<.002)discard;
        gl_FragColor=vec4(color,alpha);${finish}
      }`);
    const floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.name='HarmonicAtmosphereFloorLight';
    floor.rotation.x=-Math.PI/2;floor.position.y=-6.52;floor.renderOrder=-2;group.add(floor);

    const waterGeometry = new THREE.PlaneBufferGeometry(86, 70);geometries.add(waterGeometry);
    const reflectionMatrix = new THREE.Matrix4();
    const waterUniforms = {
      uReflection:{value:null},uReflectionMatrix:{value:reflectionMatrix},uReflectionReady:{value:0},
      uTime:{value:0},uStrength:{value:.65},uDistortion:{value:.35},
      uColor:{value:shared.uCyan.value},uTexel:{value:new THREE.Vector2(1/512,1/288)},
      uCropScale:{value:new THREE.Vector2(1,1)}
    };
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms:waterUniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:`
        uniform mat4 uReflectionMatrix; varying vec4 vReflection;varying vec2 vUv;
        varying vec3 vWorldPosition;
        void main(){vUv=uv;vReflection=uReflectionMatrix*vec4(position,1.);
          vec4 world=modelMatrix*vec4(position,1.);vWorldPosition=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader:`
        uniform sampler2D uReflection;uniform vec3 uColor;
        uniform float uTime,uStrength,uDistortion,uReflectionReady;uniform vec2 uTexel,uCropScale;
        varying vec4 vReflection;varying vec2 vUv;varying vec3 vWorldPosition;
        void main(){
          vec2 uv=vReflection.xy/max(.0001,vReflection.w);
          vec2 waves=vec2(sin(vWorldPosition.x*1.6+uTime*.8+sin(vWorldPosition.z*.7)),
            cos(vWorldPosition.z*2.1-uTime*.7+sin(vWorldPosition.x*.8)));
          waves+=vec2(sin(vWorldPosition.z*5.7-uTime*1.2),cos(vWorldPosition.x*4.2+uTime))*.25;
          uv+=waves*uDistortion*.004*uCropScale;
          vec2 border=smoothstep(vec2(0.),vec2(.025),uv)*(1.-smoothstep(vec2(.975),vec2(1.),uv));
          vec2 safeUv=clamp(uv,uTexel,1.-uTexel);
          vec3 reflection=texture2D(uReflection,safeUv).rgb;
          float edge=1.-smoothstep(.32,.5,max(abs(vUv.x-.5),abs(vUv.y-.5)));
          float shimmer=pow(.5+.5*sin(vWorldPosition.z*9.+sin(vWorldPosition.x*2.)+uTime*.5),12.);
          vec3 tint=uColor*(.006+shimmer*.008*uDistortion);
          gl_FragColor=vec4(reflection*uStrength*border.x*border.y+tint,
            edge*uReflectionReady*.92);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });materials.add(waterMaterial);
    const water = new THREE.Mesh(waterGeometry,waterMaterial);
    water.name='HarmonicReflectiveWater';water.rotation.x=-Math.PI/2;
    water.position.set(0,groundY,-3);water.renderOrder=-3;group.add(water);
    let reflectionTarget = null, reflectionPasses = 0, reflectionDirty = true;
    let lastReflectionRevision = null, lastWaterSettings = '';
    let captureInProgress = false, captureWidth = 0, captureHeight = 0;
    // Bound memory, not refresh rate. The default clarity samples visible water
    // at drawing-buffer density (including HiDPI), with a little headroom at 100%.
    const reflectionPixelLimit=4*1024*1024;
    let waterClarity=.75,captureSizeKey='',captureCoverage=1,capturePixelBudget=reflectionPixelLimit;
    const captureBounds=new THREE.Vector4(0,0,1,1),rendererSize=new THREE.Vector2();
    const mainViewProjection=new THREE.Matrix4(),mirrorViewProjection=new THREE.Matrix4(),cropProjection=new THREE.Matrix4();
    const projectedPoint=new THREE.Vector4();
    // Reuse bounded clipping storage. Four floor corners clipped by the camera's
    // six planes need at most ten vertices; no per-frame polygon allocation.
    const clipStorage=Array.from({length:2},()=>Array.from({length:16},()=>({world:new THREE.Vector3(),clip:new THREE.Vector4()})));
    const clipDistance=(p,plane)=>plane===0?p.w+p.x:plane===1?p.w-p.x:plane===2?p.w+p.y:
      plane===3?p.w-p.y:plane===4?p.w+p.z:p.w-p.z;
    const reflectedCamera = new THREE.PerspectiveCamera();
    const surfacePosition = new THREE.Vector3(), surfaceNormal = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3(), lookTarget = new THREE.Vector3(), reflectedTarget = new THREE.Vector3();
    const reflectionPlane = new THREE.Plane(), clipPlane = new THREE.Vector4(), q = new THREE.Vector4();
    const savedViewport = new THREE.Vector4(), savedScissor = new THREE.Vector4(), savedClear = new THREE.Color();
    const previousCameraMatrix = new THREE.Matrix4(), previousProjection = new THREE.Matrix4(), previousWaterMatrix = new THREE.Matrix4();

    function visibleReflectionBounds(camera){
      mainViewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      let input=clipStorage[0],output=clipStorage[1],count=4;
      for(let i=0;i<4;i++){
        input[i].world.set(i===0||i===3?-43:43,i<2?-35:35,0).applyMatrix4(water.matrixWorld);
        input[i].clip.set(input[i].world.x,input[i].world.y,input[i].world.z,1).applyMatrix4(mainViewProjection);
      }
      for(let plane=0;plane<6&&count;plane++){
        let outCount=0;
        for(let i=0;i<count;i++){
          const a=input[i],b=input[(i+1)%count],da=clipDistance(a.clip,plane),db=clipDistance(b.clip,plane);
          if(da>=0){output[outCount].world.copy(a.world);output[outCount++].clip.copy(a.clip);}
          if((da>=0)!==(db>=0)){
            const t=da/(da-db);output[outCount].world.copy(a.world).lerp(b.world,t);
            output[outCount++].clip.copy(a.clip).lerp(b.clip,t);
          }
        }
        const swap=input;input=output;output=swap;count=outCount;
      }
      if(!count)return false;
      mirrorViewProjection.multiplyMatrices(reflectedCamera.projectionMatrix,reflectedCamera.matrixWorldInverse);
      let minX=1,minY=1,maxX=0,maxY=0;
      for(let i=0;i<count;i++){
        const p=input[i].world;projectedPoint.set(p.x,p.y,p.z,1).applyMatrix4(mirrorViewProjection);
        if(projectedPoint.w<=0)continue;
        const x=projectedPoint.x/projectedPoint.w*.5+.5,y=projectedPoint.y/projectedPoint.w*.5+.5;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      // Include wave displacement and a few filter texels beyond the visible
      // region, so the crop never clips a distorted reflection at its border.
      const margin=.02+waterUniforms.uDistortion.value*.006;
      minX=Math.max(0,minX-margin);minY=Math.max(0,minY-margin);maxX=Math.min(1,maxX+margin);maxY=Math.min(1,maxY+margin);
      if(maxX-minX<.0001||maxY-minY<.0001)return false;
      captureBounds.set(minX,minY,maxX,maxY);captureCoverage=(maxX-minX)*(maxY-minY);
      const cropWidth=maxX-minX,cropHeight=maxY-minY;
      cropProjection.set(1/cropWidth,0,0,(1-maxX-minX)/cropWidth,
        0,1/cropHeight,0,(1-maxY-minY)/cropHeight,0,0,1,0,0,0,0,1);
      reflectedCamera.projectionMatrix.premultiply(cropProjection);
      waterUniforms.uCropScale.value.set(1/cropWidth,1/cropHeight);
      return true;
    }

    // Explicitly called once by the scene runtime, never from onBeforeRender:
    // the refractive-card capture cannot recursively request a water capture.
    function renderReflection(renderer,scene,camera,now=0,revision=0){
      if(disposed||captureInProgress||!water.visible||waterUniforms.uStrength.value<=0)return false;
      group.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
      const cameraChanged=!previousCameraMatrix.equals(camera.matrixWorld)
        ||!previousProjection.equals(camera.projectionMatrix)||!previousWaterMatrix.equals(water.matrixWorld);
      const size=renderer.getDrawingBufferSize(rendererSize);
      const maxDimension=Math.max(8,Math.min(4096,renderer.capabilities.maxTextureSize));
      const sizeKey=`${size.x}|${size.y}|${waterClarity}|${maxDimension}`;
      const resolutionChanged=sizeKey!==captureSizeKey;
      // Reuse only genuinely unchanged frames, never drop a moving reflection
      // to a separate 24 FPS clock. Resizes/DPR changes also refresh paused scenes.
      if(!reflectionDirty&&!cameraChanged&&!resolutionChanged&&revision===lastReflectionRevision)return false;
      surfacePosition.setFromMatrixPosition(water.matrixWorld);
      surfaceNormal.set(0,0,1).transformDirection(water.matrixWorld);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      reflectionPlane.setFromNormalAndCoplanarPoint(surfaceNormal,surfacePosition);
      const notVisible=()=>{
        waterUniforms.uReflectionReady.value=0;captureCoverage=0;captureBounds.set(0,0,0,0);
        reflectionDirty=false;lastReflectionRevision=revision;
        captureSizeKey=sizeKey;
        previousCameraMatrix.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);previousWaterMatrix.copy(water.matrixWorld);
        return false;
      };
      if(reflectionPlane.distanceToPoint(cameraPosition)<=.001)return notVisible();
      reflectedCamera.position.copy(cameraPosition).addScaledVector(surfaceNormal,-2*reflectionPlane.distanceToPoint(cameraPosition));
      camera.getWorldDirection(lookTarget).add(cameraPosition);
      reflectedTarget.copy(lookTarget).addScaledVector(surfaceNormal,-2*reflectionPlane.distanceToPoint(lookTarget));
      reflectedCamera.up.setFromMatrixColumn(camera.matrixWorld,1).reflect(surfaceNormal);
      reflectedCamera.lookAt(reflectedTarget);reflectedCamera.near=camera.near;reflectedCamera.far=camera.far;
      reflectedCamera.layers.mask=camera.layers.mask;
      reflectedCamera.updateMatrixWorld(true);reflectedCamera.projectionMatrix.copy(camera.projectionMatrix);
      if(!visibleReflectionBounds(camera))return notVisible();
      reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1)
        .multiply(reflectedCamera.projectionMatrix).multiply(reflectedCamera.matrixWorldInverse).multiply(water.matrixWorld);
      // Oblique near clipping removes everything below the actual transformed
      // water plane, including rain particles after they have reached the floor.
      reflectionPlane.applyMatrix4(reflectedCamera.matrixWorldInverse);
      clipPlane.set(reflectionPlane.normal.x,reflectionPlane.normal.y,reflectionPlane.normal.z,reflectionPlane.constant);
      const projection=reflectedCamera.projectionMatrix.elements;
      q.set((Math.sign(clipPlane.x)+projection[8])/projection[0],
        (Math.sign(clipPlane.y)+projection[9])/projection[5],-1,(1+projection[10])/projection[14]);
      clipPlane.multiplyScalar(2/clipPlane.dot(q));
      projection[2]=clipPlane.x;projection[6]=clipPlane.y;projection[10]=clipPlane.z+1-.002;projection[14]=clipPlane.w;
      reflectedCamera.projectionMatrixInverse.copy(reflectedCamera.projectionMatrix).invert();
      const sampleScale=.25+waterClarity;
      const desiredWidth=Math.max(8,Math.ceil(size.x*(captureBounds.z-captureBounds.x)*sampleScale/32)*32);
      const desiredHeight=Math.max(8,Math.ceil(size.y*(captureBounds.w-captureBounds.y)*sampleScale/32)*32);
      const allocationScale=Math.min(1,maxDimension/desiredWidth,maxDimension/desiredHeight,
        Math.sqrt(reflectionPixelLimit/(desiredWidth*desiredHeight)));
      const nextWidth=Math.max(8,Math.floor(desiredWidth*allocationScale/8)*8);
      const nextHeight=Math.max(8,Math.floor(desiredHeight*allocationScale/8)*8);
      // Small camera movements reuse the same target. Reallocate only after a
      // material coverage change, avoiding GPU allocation churn during dragging.
      const coverageChanged=nextWidth>captureWidth*1.125||nextHeight>captureHeight*1.125
        ||nextWidth<captureWidth*.65||nextHeight<captureHeight*.65;
      if(resolutionChanged||coverageChanged||!reflectionTarget){
        captureWidth=nextWidth;captureHeight=nextHeight;captureSizeKey=sizeKey;
      }
      const width=captureWidth,height=captureHeight;
      if(!reflectionTarget){
        reflectionTarget=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
          format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
        reflectionTarget.texture.name='HarmonicWaterReflection';
        // Capture linear radiance once; the water shader performs final output encoding.
        reflectionTarget.texture.encoding=THREE.LinearEncoding;
        waterUniforms.uReflection.value=reflectionTarget.texture;
      }else if(reflectionTarget.width!==width||reflectionTarget.height!==height)reflectionTarget.setSize(width,height);
      waterUniforms.uTexel.value.set(1/width,1/height);
      const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.()||0,mip=renderer.getActiveMipmapLevel?.()||0;
      renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
      const scissorTest=renderer.getScissorTest(),clearAlpha=renderer.getClearAlpha();renderer.getClearColor(savedClear);
      const xrEnabled=renderer.xr?.enabled,shadowUpdate=renderer.shadowMap?.autoUpdate;
      const toneMapping=renderer.toneMapping,outputEncoding=renderer.outputEncoding,autoClear=renderer.autoClear;
      const floorVisible=floor.visible,waterVisible=water.visible;
      water.visible=false;floor.visible=false;captureInProgress=true;
      try{
        if(renderer.xr)renderer.xr.enabled=false;if(renderer.shadowMap)renderer.shadowMap.autoUpdate=false;
        renderer.toneMapping=THREE.NoToneMapping;renderer.outputEncoding=THREE.LinearEncoding;
        renderer.autoClear=true;renderer.setRenderTarget(reflectionTarget);renderer.setScissorTest(false);
        renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,reflectedCamera);
        reflectionPasses++;reflectionDirty=false;lastReflectionRevision=revision;
        previousCameraMatrix.copy(camera.matrixWorld);previousProjection.copy(camera.projectionMatrix);previousWaterMatrix.copy(water.matrixWorld);
        waterUniforms.uReflectionReady.value=1;
        return true;
      }catch(error){
        // A resized target may already be cleared. Do not present partial data
        // or let an unchanged paused revision suppress the next-frame retry.
        reflectionDirty=true;waterUniforms.uReflectionReady.value=0;
        throw error;
      }finally{
        water.visible=waterVisible;floor.visible=floorVisible;captureInProgress=false;
        renderer.toneMapping=toneMapping;renderer.outputEncoding=outputEncoding;renderer.autoClear=autoClear;
        if(renderer.xr)renderer.xr.enabled=xrEnabled;if(renderer.shadowMap)renderer.shadowMap.autoUpdate=shadowUpdate;
        renderer.setRenderTarget(target,face,mip);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);
        renderer.setScissorTest(scissorTest);renderer.setClearColor(savedClear,clearAlpha);
      }
    }

    const origins = new Float32Array(maxRain*3), seeds = new Float32Array(maxRain*2);
    for(let i=0;i<maxRain;i++){
      origins.set([(random(i+101)-.5)*40,-6.5,(random(i+600)-.5)*27-2],i*3);
      seeds.set([random(i+300),.16+random(i+800)*.11],i*2);
    }
    const cycle = `attribute vec3 aOrigin;attribute vec2 aSeed;uniform float uRainTime;
      float life(){return fract(aSeed.x+uRainTime*aSeed.y);}`;
    function rainGeometry(){const g=quad(maxRain);
      g.setAttribute('aOrigin',new THREE.InstancedBufferAttribute(origins.slice(),3));
      g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds.slice(),2));return g;}
    const rainMaterial = material(`${cycle}
      varying vec2 vUv; varying float vVisible;
      void main(){float t=life();vec3 center=aOrigin;center.y+=(1.-min(t/.62,1.))*20.;
        vec4 mv=modelViewMatrix*vec4(center,1.);mv.xy+=position.xy*vec2(.034,.62+aSeed.x*.6);
        gl_Position=projectionMatrix*mv;vUv=uv;vVisible=1.-step(.62,t);}
      `,`uniform vec3 uCyan;varying vec2 vUv;varying float vVisible;
      void main(){float a=pow(1.-abs(vUv.x-.5)*2.,2.)*sin(vUv.y*3.14159)*vVisible;
        if(a<.01)discard;gl_FragColor=vec4(uCyan,a*.5);${finish}}`,true);
    const rain = new THREE.Mesh(rainGeometry(),rainMaterial);rain.name='HarmonicParticleRain';rain.frustumCulled=false;group.add(rain);
    const impactMaterial = material(`${cycle}
      uniform float uSplash;varying vec2 vUv;varying float vAge,vVisible;
      void main(){float t=life();vAge=clamp((t-.62)/.38,0.,1.);vVisible=step(.62,t);
        vec3 p=aOrigin;float radius=(.16+vAge*1.3)*uSplash;
        p.xz+=position.xy*radius*2.;p.y+=.025;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);vUv=uv;}
      `,`uniform vec3 uCyan,uPink;varying vec2 vUv;varying float vAge,vVisible;
      void main(){float r=length(vUv-.5)*2.;
        float inner=exp(-pow((r-.65)/.07,2.));float outer=exp(-pow((r-.88)/.035,2.));
        float glow=exp(-pow((r-.65)/.22,2.))*.2;
        float a=(inner+outer+glow)*pow(1.-vAge,1.6)*vVisible;
        if(a<.006)discard;gl_FragColor=vec4(mix(uCyan,uPink,outer/(inner+outer+.001)),a*.85);${finish}}`,true);
    const impacts = new THREE.Mesh(rainGeometry(),impactMaterial);impacts.name='HarmonicRainImpactRings';impacts.frustumCulled=false;group.add(impacts);
    const splashGeometry = new THREE.BufferGeometry();geometries.add(splashGeometry);
    const splashOrigins=new Float32Array(maxRain*splashPerDrop*3),splashSeeds=new Float32Array(maxRain*splashPerDrop*2),directions=new Float32Array(maxRain*splashPerDrop*2);
    for(let i=0;i<maxRain;i++)for(let j=0;j<splashPerDrop;j++){
      const index=i*splashPerDrop+j;splashOrigins.set(origins.subarray(i*3,i*3+3),index*3);
      splashSeeds.set(seeds.subarray(i*2,i*2+2),index*2);directions.set([j/splashPerDrop*TAU,random(index+1500)],index*2);
    }
    splashGeometry.setAttribute('position',new THREE.BufferAttribute(splashOrigins.slice(),3));
    splashGeometry.setAttribute('aOrigin',new THREE.BufferAttribute(splashOrigins,3));
    splashGeometry.setAttribute('aSeed',new THREE.BufferAttribute(splashSeeds,2));
    splashGeometry.setAttribute('aDirection',new THREE.BufferAttribute(directions,2));
    const splashMaterial=material(`${cycle}
      attribute vec2 aDirection;uniform float uSplash,uPixelRatio;varying float vAlpha;
      void main(){float t=life();float age=clamp((t-.62)/.24,0.,1.);vec3 p=aOrigin;
        p.xz+=vec2(cos(aDirection.x),sin(aDirection.x))*age*(.5+aDirection.y)*uSplash;
        p.y+=sin(age*3.14159)*(.2+aDirection.y*.9)*uSplash;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((1.2+aDirection.y)*uPixelRatio*18./max(4.,-mv.z),1.,4.);
        vAlpha=step(.62,t)*(1.-age);}
      `,`varying float vAlpha;
      void main(){float a=(1.-smoothstep(.1,.5,length(gl_PointCoord-.5)))*vAlpha;
        if(a<.01)discard;gl_FragColor=vec4(.66,.95,1.,a);${finish}}`,true);
    const splashes=new THREE.Points(splashGeometry,splashMaterial);splashes.name='HarmonicRainSplashes';splashes.frustumCulled=false;group.add(splashes);

    const anchorValue = (source, target) => {
      if (!source || !target) return false;
      if (Array.isArray(source) || ArrayBuffer.isView(source)) {
        if (source.length < 3) return false;
        target.set(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0);
        return true;
      }
      if (Number.isFinite(source.x) && Number.isFinite(source.y) && Number.isFinite(source.z)) {
        target.set(source.x, source.y, source.z); return true;
      }
      return false;
    };
    const setColdAirAnchors = (frame, settings) => {
      const anchors = frame.cubeAnchors;
      const customLeft = anchors && (anchors.left || anchors.lowerLeft || anchors.anchorLeft || anchors.a);
      const customRight = anchors && (anchors.right || anchors.lowerRight || anchors.anchorRight || anchors.b);
      const customCornerLeft = anchors && (anchors.cornerLeft || anchors.bottomLeft || anchors.leftCorner || anchors.a);
      const customCornerRight = anchors && (anchors.cornerRight || anchors.bottomRight || anchors.rightCorner || anchors.b);
      const gotCustom = anchorValue(customLeft, shared.uColdAirAnchorL.value)
        && anchorValue(customRight, shared.uColdAirAnchorR.value)
        && anchorValue(customCornerLeft, shared.uColdAirCornerL.value)
        && anchorValue(customCornerRight, shared.uColdAirCornerR.value);
      if (gotCustom) return true;
      // Fallback for callers that do not yet expose orbital anchors.  These
      // proportions match the 5.84-unit cube and remain in the same local
      // coordinate space as the orbital core.
      const side = 5.84 * finite(settings.cubeSize, 1, .6, 1.4);
      const hover = finite(settings.cubeHoverHeight, 0, -3, 3);
      const z = side * .06;
      shared.uColdAirAnchorL.value.set(-side * .235, hover - side * .35, z);
      shared.uColdAirAnchorR.value.set(side * .235, hover - side * .35, z);
      shared.uColdAirCornerL.value.set(-side * .47, hover - side * .51, 0);
      shared.uColdAirCornerR.value.set(side * .47, hover - side * .51, 0);
      return false;
    };

    function update(frame={}) {
      if(disposed)return;
      const s=frame.settings||{},dt=finite(frame.delta,0,0,.08);
      const fogOn=s.fogEnabled!==false, rainOn=s.rainEnabled!==false;
      const coldAirOn=s.coldAirEnabled===true;
      const playing=frame.playing===true;
      if((playing||frame.idleMotion===true)&&frame.reducedMotion!==true){
        const motionDt=dt*(playing?1:.35);
        const fogClockSpeed=finite(s.fogSpeed,.45,0,2),coldClockSpeed=finite(s.coldAirSpeed,.5,0,2);
        if(fogOn&&fogClockSpeed>0)time+=motionDt*fogClockSpeed;
        if(coldAirOn&&coldClockSpeed>0)coldAirTime+=motionDt*coldClockSpeed;
        if(rainOn)rainTime+=motionDt*finite(s.rainSpeed,.65,0,2);
        if(s.waterEnabled!==false)waterTime+=motionDt*finite(s.waterSpeed,.4,0,2);
        const target=playing&&s.audioReactive!==false?finite(frame.bass,0,0,1):0;
        audio+=(target-audio)*(1-Math.exp(-dt*6));
      }
      if(s.audioReactive===false)audio=0;
      shared.uTime.value=time;shared.uColdAirTime.value=coldAirTime;shared.uRainTime.value=rainTime;shared.uAudio.value=audio;
      shared.uRadius.value=finite(frame.ringRadius,11.36,3,18);
      shared.uDensity.value=finite(s.fogDensity,.4,0,1);
      shared.uHeight.value=finite(s.fogHeight,1,.4,1.8);shared.uSpread.value=finite(s.fogSpread,1,.4,1.8);
      shared.uSplash.value=finite(s.splashStrength,.75,0,1.5);shared.uPixelRatio.value=finite(frame.pixelRatio,1,.5,2);
      shared.uFogLightStrength.value=finite(s.fogLightStrength,.55,0,1.5);
      shared.uKeyLightIntensity.value=finite(s.keyLightIntensity,1,0,2.5);
      shared.uAmbientLightIntensity.value=finite(s.ambientLightIntensity,.65,0,1.5);
      shared.uGlowStrength.value=finite(s.glowStrength,.45,0,1.5);
      shared.uGlowSoftness.value=finite(s.glowSoftness,.65,.1,1);
      shared.uLightAudio.value=audio*finite(s.lightAudioStrength,.35,0,1);
      shared.uFloorLightStrength.value=finite(s.floorLightStrength,.45,0,1.5);
      shared.uFloorShadowStrength.value=finite(s.floorShadowStrength,.3,0,.8);
      // Schema-normalized scenes carry an explicit `true` default.  Keeping
      // the strict check here preserves the legacy atmosphere API for direct
      // callers/tests that omit the new option entirely.
      shared.uColdAirDensity.value=finite(s.coldAirDensity,.4,0,1.5);
      shared.uColdAirSpeed.value=finite(s.coldAirSpeed,.5,0,2.5);
      shared.uColdAirSpread.value=finite(s.coldAirSpread,.65,.1,2.4);
      shared.uColdAirLength.value=finite(s.coldAirLength,.86,.35,1.25);
      shared.uColdAirGroundBlend.value=finite(s.coldAirGroundBlend,.8,0,1);
      shared.uColdAirAudio.value=audio*finite(s.coldAirAudioStrength,.3,0,1.5);
      setColdAirAnchors(frame,s);
      group.updateWorldMatrix(true,false);
      inverseWorld.copy(group.matrixWorld).invert();
      const towers=frame.towers,anchors=towers?.anchors;
      const useTowers=s.towersEnabled!==false&&towers?.group?.visible!==false&&Array.isArray(anchors)&&anchors.length>0;
      emitterMode=useTowers?'pillar-rings':'central-rings';
      if(useTowers){towers.group.updateWorldMatrix(true,false);emitterMatrix.multiplyMatrices(inverseWorld,towers.group.matrixWorld);}
      let emittersChanged=false;
      for(let i=0;i<layerCount;i++){
        let radius=0;
        if(useTowers){
          const anchor=anchors[i%anchors.length];
          // These fractions exactly match the ten visible tower-ring levels;
          // the buried base ring is omitted from emission.
          const level=(Math.floor(i/anchors.length)%10+1)/10;
          emitterPoint.set(anchor.x,anchor.baseY+anchor.height*level,anchor.z).applyMatrix4(emitterMatrix);
          radius=anchor.radius*1.015;
        }else{
          const angle=fogSeeds[i*4];
          emitterPoint.set(Math.cos(angle)*shared.uRadius.value,
            Math.max(groundY+.8,Math.sin(angle)*shared.uRadius.value),0);
        }
        const values=[emitterPoint.x,emitterPoint.y,emitterPoint.z,radius];
        for(let j=0;j<4;j++){
          const value=Math.fround(values[j]);
          if(fogEmitters[i*4+j]!==value){fogEmitters[i*4+j]=value;emittersChanged=true;}
        }
      }
      if(emittersChanged)emitterAttribute.needsUpdate=true;
      if(s.fogColorMode==='custom'&&/^#[\da-f]{6}$/i.test(s.fogColor||''))shared.uFogColor.value.set(s.fogColor);
      else shared.uFogColor.value.copy(shared.uCyan.value);
      waterUniforms.uTime.value=waterTime;
      waterUniforms.uStrength.value=finite(s.waterReflection,.65,0,1);
      waterUniforms.uDistortion.value=finite(s.waterDistortion,.35,0,1);
      waterClarity=finite(s.waterClarity,.75,0,1);
      water.visible=s.waterEnabled!==false&&waterUniforms.uStrength.value>0;
      if(s.coldAirColorMode==='custom'&&/^#[\da-f]{6}$/i.test(s.coldAirColor||''))shared.uColdAirColor.value.set(s.coldAirColor);
      else shared.uColdAirColor.value.copy(shared.uCyan.value);
      const waterSettings=JSON.stringify([water.visible,waterUniforms.uStrength.value,waterUniforms.uDistortion.value,waterClarity,
        s.towerColorMode,s.towerColor,s.fogColorMode,s.fogColor,s.cubeColorMode,s.cubeColor,s.cubeEnabled,s.ringsEnabled,s.towersEnabled,
        coldAirOn,shared.uColdAirDensity.value,shared.uColdAirColor.value.getHex(),shared.uColdAirSpread.value]);
      if(waterSettings!==lastWaterSettings){lastWaterSettings=waterSettings;reflectionDirty=true;}
      const direction=frame.keyDirectionWorld;
      if(direction&&Number.isFinite(direction.x)&&Number.isFinite(direction.y)&&Number.isFinite(direction.z)
        &&direction.x*direction.x+direction.y*direction.y+direction.z*direction.z>0){
        shared.uKeyDirectionWorld.value.copy(direction).normalize();
      }else{
        const az=finite(s.keyLightAzimuth,30,-180,180)*Math.PI/180,el=finite(s.keyLightElevation,45,-10,85)*Math.PI/180;
        shared.uKeyDirectionWorld.value.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el))
          .transformDirection(group.matrixWorld);
      }
      if(frame.camera?.getWorldPosition)frame.camera.getWorldPosition(shared.uCameraPositionWorld.value);
      localLightDirection.copy(shared.uKeyDirectionWorld.value).transformDirection(inverseWorld);
      shared.uFloorShadowOffset.value.set(-localLightDirection.x*.22,localLightDirection.z*.22);
      const spread=finite(s.floorLightSpread,1,.5,1.8),radius=shared.uRadius.value;
      floor.scale.set(radius*2.8*spread,radius*1.8*spread,1);
      floor.visible=s.floorLightEnabled!==false&&(shared.uFloorLightStrength.value>0||shared.uFloorShadowStrength.value>0);
      rainCount=Math.round(maxRain*finite(s.rainDensity,.65,0,1));
      rain.geometry.instanceCount=impacts.geometry.instanceCount=rainCount;
      splashGeometry.setDrawRange(0,rainCount*splashPerDrop);
      mist.visible=fogOn&&shared.uDensity.value>0;
      coldAir.visible=coldAirOn&&shared.uColdAirDensity.value>0;
      rain.visible=rainOn&&rainCount>0;impacts.visible=splashes.visible=rain.visible&&shared.uSplash.value>0;
    }
    function setPalette(colors){
      if(disposed||!Array.isArray(colors))return;
      for(const [uniform,index] of [['uCyan',0],['uPink',2]]){const c=colors[index];
        if(c)shared[uniform].value.setRGB(finite(c.r,0,0,255)/255,finite(c.g,0,0,255)/255,finite(c.b,0,0,255)/255);}
      reflectionDirty=true;
    }
    function diagnostics(){return {time,coldAirTime,rainTime,layerCount,rainCount,impactCount:rainCount,
      enabled:mist.visible,coldAirEnabled:coldAir.visible,rainEnabled:rain.visible,disposed,
      mistSource:emitterMode,mistEmitters:Array.from(fogEmitters),fogColor:shared.uFogColor.value.getHexString(),
      coldAir:{enabled:coldAir.visible,density:shared.uColdAirDensity.value,speed:shared.uColdAirSpeed.value,
        spread:shared.uColdAirSpread.value,length:shared.uColdAirLength.value,groundBlend:shared.uColdAirGroundBlend.value,
        audio:shared.uColdAirAudio.value,color:shared.uColdAirColor.value.getHexString(),layers:coldLayerCount,
        anchors:{left:shared.uColdAirAnchorL.value.toArray(),right:shared.uColdAirAnchorR.value.toArray(),
          cornerLeft:shared.uColdAirCornerL.value.toArray(),cornerRight:shared.uColdAirCornerR.value.toArray()}},
      water:{enabled:water.visible,time:waterTime,reflection:waterUniforms.uStrength.value,distortion:waterUniforms.uDistortion.value,
        passes:reflectionPasses,width:captureWidth,height:captureHeight,ready:waterUniforms.uReflectionReady.value===1,
        targetCount:reflectionTarget?1:0,maxFps:null,refreshMode:'scene-frame',groundY,clarity:waterClarity,cropCoverage:captureCoverage,
        cropBounds:captureBounds.toArray(),pixelBudget:capturePixelBudget},
      lighting:{fogLightStrength:shared.uFogLightStrength.value,keyDirectionWorld:shared.uKeyDirectionWorld.value.toArray(),
        cameraPositionWorld:shared.uCameraPositionWorld.value.toArray(),keyIntensity:shared.uKeyLightIntensity.value,
        ambientIntensity:shared.uAmbientLightIntensity.value,audio,glowStrength:shared.uGlowStrength.value,
        glowSoftness:shared.uGlowSoftness.value,floorEnabled:floor.visible,floorLightStrength:shared.uFloorLightStrength.value,
        floorLightSpread:floor.scale.x/(shared.uRadius.value*2.8),floorShadowStrength:shared.uFloorShadowStrength.value,
        floorShadowEnabled:floor.visible&&shared.uFloorShadowStrength.value>0,floorDrawCalls:1}};}
    function dispose(){if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();
      for(const mat of materials)mat.dispose();reflectionTarget?.dispose();reflectionTarget=null;
      waterUniforms.uReflection.value=null;group.parent?.remove(group);group.clear();geometries.clear();materials.clear();}
    update();
    return {group,mist,coldAir,rain,impacts,splashes,water,update,setPalette,renderReflection,
      invalidateReflection(){reflectionDirty=true;},diagnostics,dispose};
  }
  global.FeHarmonicOrbitalAtmosphere=Object.freeze({create});
})(window);
