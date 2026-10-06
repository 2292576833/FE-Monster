(function attachHarmonicOrbitalCore(global) {
  'use strict';
  const TAU = Math.PI * 2;
  const limit = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

  function create(THREE) {
    const group = new THREE.Group(); group.name = 'HarmonicOrbitalCore';
    const rings = new THREE.Group(); rings.name = 'HarmonicArmillarySphere';
    const cube = new THREE.Group(); cube.name = 'HarmonicTiledAudioCube';
    const rays = new THREE.Group(); rays.name = 'HarmonicCornerParticleBeams';
    group.add(rings, cube, rays);
    const geometries = new Set(), materials = new Set(), instances = new Set();
    const geometry = value => { geometries.add(value); return value; };
    const material = value => { materials.add(value); return value; };
    const colors = [new THREE.Color('#13e8ee'), new THREE.Color('#7969ff'), new THREE.Color('#f064c2')];
    const tint = new THREE.Color(), cubeTint = new THREE.Color(), gold = new THREE.Color('#d9b87d');
    const validColor = (value, fallback) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
    const ringMaterial = material(new THREE.MeshStandardMaterial({ color: '#695133', metalness: .88, roughness: .27 }));
    // Broad brushed bands perturb only roughness: no texture, extra pass, or
    // high-frequency sparkle as the narrow rings rotate across a pixel.
    ringMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHarmonicMetalUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHarmonicMetalUv = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHarmonicMetalUv;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (.97 + .035 * sin(vHarmonicMetalUv.y * 50.2655 + sin(vHarmonicMetalUv.x * 25.1327) * .6)), .08, 1.0);');
    };
    ringMaterial.customProgramCacheKey = () => 'harmonic-brushed-ring-v1';
    const tickMaterial = material(new THREE.MeshStandardMaterial({ color: '#d7c3a1', metalness: .62, roughness: .34,
      emissive: '#947249', emissiveIntensity: .12 }));
    const rimMaterial = material(new THREE.MeshBasicMaterial({ color: '#b59a6b', transparent: true, opacity: .56 }));
    const ambient = new THREE.AmbientLight(0xc4d3e6, .65);
    const key = new THREE.DirectionalLight(0xffe1b0, 2.1); key.position.set(4, 9, 8);
    const fill = new THREE.DirectionalLight(0x43c9ed, 1.3); fill.position.set(-6, 2, -4);
    const rim = new THREE.DirectionalLight(0xe1d2ff, .8); rim.position.set(3, -3, 6);
    ambient.name = 'HarmonicAmbientLight'; key.name = 'HarmonicKeyLight'; rim.name = 'HarmonicRimLight';
    const lightTarget = new THREE.Object3D(); lightTarget.name = 'HarmonicLightOrigin';
    key.target = fill.target = rim.target = lightTarget;
    group.add(ambient, key, fill, rim, lightTarget);
    const keyLocalDirection = new THREE.Vector3(), keyWorldDirection = new THREE.Vector3();
    const rimWorldDirection = new THREE.Vector3(), rimLocalDirection = rim.position.clone().normalize();
    const ringDefs = [
      { radius:11.36, tilt:[.18,.12,-.08], speed:.34 },
      { radius:10.752, tilt:[1.02,.3,.28], speed:-.52 },
      { radius:10.16, tilt:[-.72,.82,-.48], speed:.68 },
      { radius:9.52, tilt:[.4,1.2,.8], speed:-.8 },
      { radius:8.896, tilt:[1.18,-.6,-.32], speed:.44 }
    ];
    const tickGeometry = geometry(new THREE.BoxGeometry(.022, .16, .025));
    const transform = new THREE.Object3D();
    const pivots = ringDefs.map((def,index) => {
      const pivot = new THREE.Group(); pivot.name = 'ArmillaryRing-' + index;
      const body = new THREE.Mesh(geometry(new THREE.TorusGeometry(def.radius, index === 0 ? .11 : .085, 8, 160)), ringMaterial);
      const band = new THREE.Mesh(geometry(new THREE.RingGeometry(def.radius-.085,def.radius+.085,192)), tickMaterial);
      band.material.side = THREE.DoubleSide;
      const edge = new THREE.Mesh(geometry(new THREE.TorusGeometry(def.radius+.105,.012,4,160)), rimMaterial);
      const ticks = new THREE.InstancedMesh(tickGeometry,tickMaterial,120); instances.add(ticks);
      for(let i=0;i<120;i++){
        const a=i*TAU/120;
        transform.position.set(Math.cos(a)*def.radius,Math.sin(a)*def.radius,.055);
        transform.rotation.set(0,0,a-Math.PI/2);
        transform.scale.set(1,i%10===0?1.65:i%5===0?1.2:.65,1);
        transform.updateMatrix();ticks.setMatrixAt(i,transform.matrix);
      }
      ticks.instanceMatrix.needsUpdate=true;
      pivot.add(body,band,edge,ticks); rings.add(pivot); return pivot;
    });

    // One instanced mesh holds all six tiled faces. Optional displacement follows
    // the face normal, with separate bass-driven and idle ripple heights. The
    // surfaceRiseEnabled switch can keep the tiled surface flat. The grid is
    // rebuilt when the user changes tileGrid so all six faces keep an even
    // layout (6 * grid² instances) without allocating work every frame.
    const side = 5.84;
    let grid = 18, spacing = side/grid;
    let tileGeometry, tiles, tileCount = 6*grid*grid;
    let faceUvs, faceIds;
    const tileMaterial = material(new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uBass:{value:0},uMid:{value:0},uTreble:{value:0},uRipple:{value:0},uBassRise:{value:0},uTileGrid:{value:grid},
        uKeyDirectionWorld:{value:keyWorldDirection},uRimDirectionWorld:{value:rimWorldDirection},
        uKeyIntensity:{value:1},uAmbientIntensity:{value:.65},uRimIntensity:{value:1},
        uEdgeGlow:{value:.45},uOcclusion:{value:.5},
        uFlashClock:{value:0},uFlashMode:{value:2},uFlashIntensity:{value:.65},uFlashDensity:{value:.32},
        uFlashSoftness:{value:.65},uFlashAudioStrength:{value:.5},uShakeSignal:{value:new THREE.Vector3()},
        uShakeCycles:{value:new THREE.Vector3()},uShakeAmount:{value:0},
        uFlashColorA:{value:new THREE.Color('#b8f5ff')},uFlashColorB:{value:new THREE.Color('#ba95ff')},
        uFlashColorC:{value:new THREE.Color('#ff8fca')},
        uColorA:{value:colors[0].clone()},uColorB:{value:colors[1].clone()},uColorC:{value:colors[2].clone()}},
      vertexShader:`
        attribute vec2 aFaceUv;
        attribute float aFaceId;
        uniform float uTime;
        uniform float uBass;
        uniform float uRipple;
        uniform float uBassRise;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying vec3 vTilePosition;
        varying vec3 vLocal;
        varying vec2 vFaceUv;
        varying float vFaceId;
        varying float vLift;
        varying float vTop;
        void main(){
          vec2 uv=aFaceUv;
          vec2 origin=vec2(.5+.22*sin(uTime*.36+aFaceId),.5+.22*cos(uTime*.27+aFaceId*.7));
          float radius=length(uv-origin);
          float ripple=pow(.5+.5*sin(radius*25.0-uTime*3.0+aFaceId*.45),5.0);
          float travelling=pow(.5+.5*sin(uv.x*9.0+uv.y*5.0-uTime*1.4+aFaceId),16.0);
          float lift=(ripple*.66+travelling*.65)*(uRipple*.055+uBassRise*uBass*.47);
          vec4 p=instanceMatrix*vec4(position,1.0);
          vec3 outward=normalize(mat3(instanceMatrix)*vec3(0.0,0.0,1.0));
          p.xyz+=outward*lift*(position.z+.5);
          mat3 im=mat3(instanceMatrix);
          vec3 correctedNormal=normal/vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2]));
          vNormal=normalize(mat3(modelMatrix)*im*correctedNormal);
          vec4 world=modelMatrix*p;
          vWorldPosition=world.xyz;vTilePosition=position;
          vLocal=p.xyz;vFaceUv=uv;vFaceId=aFaceId;vLift=lift;vTop=step(.45,position.z);
          gl_Position=projectionMatrix*modelViewMatrix*p;
        }`,
      fragmentShader:`
        precision highp float;
        uniform float uTime;uniform float uBass;uniform float uMid;uniform float uTreble;uniform float uTileGrid;
        uniform vec3 uColorA;uniform vec3 uColorB;uniform vec3 uColorC;
        uniform vec3 uKeyDirectionWorld,uRimDirectionWorld;
        uniform float uKeyIntensity,uAmbientIntensity,uRimIntensity,uEdgeGlow,uOcclusion;
        uniform float uFlashClock,uFlashMode,uFlashIntensity,uFlashDensity,uFlashSoftness,uFlashAudioStrength,uShakeAmount;
        uniform vec3 uFlashColorA,uFlashColorB,uFlashColorC,uShakeSignal,uShakeCycles;
        varying vec3 vWorldPosition;varying vec3 vTilePosition;
        varying vec3 vNormal;varying vec3 vLocal;varying vec2 vFaceUv;varying float vFaceId;varying float vLift;varying float vTop;
        float tileHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        vec3 triFlashColor(float value){
          float t=clamp(value,0.0,1.0);
          if(t<0.5) return mix(uFlashColorA,uFlashColorB,t*2.0);
          return mix(uFlashColorB,uFlashColorC,(t-0.5)*2.0);
        }
        vec3 surfaceFlash(){
          vec3 tileId=vec3(floor(vFaceUv*uTileGrid),vFaceId);
          float seed=tileHash(tileId+vec3(1.7,9.2,3.1));
          float exponent=mix(16.0,1.4,uFlashSoftness);
          float pulse=0.0;
          float colorMix=seed;
          if(uFlashMode<.5){
            float cycle=uFlashClock+seed;
            float random=tileHash(tileId+vec3(floor(cycle)*3.71,2.3,7.9));
            // Each randomly selected tile fades to zero before its next selection.
            pulse=pow(max(0.0,sin(fract(cycle)*3.14159265)),exponent)*step(random,uFlashDensity);
            colorMix=tileHash(tileId+vec3(floor(cycle),5.6,11.7));
          }else if(uFlashMode<1.5){
            float phase=fract(vFaceUv.x*.55+vFaceUv.y*.35+vFaceId*.13-uFlashClock*.28);
            float width=max(.002,uFlashDensity*.5);
            pulse=1.0-smoothstep(width*(1.0-uFlashSoftness*.9),width,abs(phase-.5));
            colorMix=.5+.5*sin((phase+vFaceUv.y*.5)*6.2831853);
          }else{
            // The exact XYZ oscillators also position the cube on the CPU.
            // Different tile groups follow different axes, preserving a soft, scattered shimmer.
            float axis=seed*3.0;
            float motion=axis<1.0?uShakeSignal.x:(axis<2.0?uShakeSignal.y:uShakeSignal.z);
            float cycle=axis<1.0?uShakeCycles.x:(axis<2.0?uShakeCycles.y:uShakeCycles.z);
            // Resample at each axis zero crossing, where the pulse has faded out.
            // The tile and pulse cycle form a stable GPU seed; no per-tile CPU work.
            float selected=tileHash(tileId+vec3(cycle*3.71+4.3,cycle*.83+2.1,cycle*1.93+7.7));
            pulse=pow(abs(motion),exponent)*step(selected,uFlashDensity)*uShakeAmount;
            colorMix=.5+.5*motion;
          }
          pulse*=step(.0001,uFlashDensity)*uFlashIntensity*(1.0+min(1.0,uBass)*uFlashAudioStrength);
          return triFlashColor(colorMix)*pulse;
        }
        void main(){
          vec3 n=normalize(vNormal);
          vec3 eye=normalize(cameraPosition-vWorldPosition);
          vec3 halfDirection=normalize(uKeyDirectionWorld+eye);
          float diffuse=max(0.0,dot(n,uKeyDirectionWorld));
          float light=.21*uAmbientIntensity/.65+.45*diffuse*uKeyIntensity;
          float ridge=smoothstep(.025,.27,vLift);
          float glint=pow(max(0.0,dot(n,halfDirection)),24.0)*uKeyIntensity;
          float rim=pow(1.0-max(0.0,dot(n,eye)),3.0)*max(0.0,dot(n,uRimDirectionWorld)) * uRimIntensity;
          float tileEdge=smoothstep(.38,.49,max(abs(vTilePosition.x),abs(vTilePosition.y)));
          float recess=(1.0-vTop)*(.7+.3*(1.0-smoothstep(-.5,.5,vTilePosition.z)));
          vec3 base=mix(uColorA,uColorB,.22+.32*vFaceUv.x);
          base=mix(base,uColorC,pow(vFaceUv.y,4.0)*.14);
          vec3 c=base*(light*.43+.03)+base*glint*.3;
          c*=1.0-recess*uOcclusion*.82;
          c=mix(c,vec3(.62,.91,1.0),ridge*(.68+.1*uBass)*vTop);
          c+=base*tileEdge*vTop*uEdgeGlow*(.10+.12*diffuse)+mix(base,uColorC,.35)*rim*.18;
          c+=base*(.04+.08*uTreble)*pow(.5+.5*sin(uTime*2.0+vLocal.y*6.0),8.0);
          c+=surfaceFlash()*(vTop*.82+(1.0-vTop)*.1)*(1.0-tileEdge*.22);
          gl_FragColor=vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    }));
    const faces = [
      new THREE.Euler(0,0,0),new THREE.Euler(0,Math.PI,0),new THREE.Euler(0,Math.PI/2,0),
      new THREE.Euler(0,-Math.PI/2,0),new THREE.Euler(-Math.PI/2,0,0),new THREE.Euler(Math.PI/2,0,0)
    ];
    const faceRotation=new THREE.Quaternion(), point=new THREE.Vector3();
    function rebuildTiles(nextGrid){
      const desired=Math.round(limit(nextGrid,18,8,30));
      if(desired===grid&&tiles)return false;
      if(tiles){
        cube.remove(tiles);instances.delete(tiles);tiles.dispose?.();
      }
      if(tileGeometry){geometries.delete(tileGeometry);tileGeometry.dispose();}
      grid=desired;spacing=side/grid;tileCount=6*grid*grid;
      tileGeometry=geometry(new THREE.BoxGeometry(1,1,1));
      faceUvs=new Float32Array(tileCount*2);faceIds=new Float32Array(tileCount);
      tileGeometry.setAttribute('aFaceUv',new THREE.InstancedBufferAttribute(faceUvs,2));
      tileGeometry.setAttribute('aFaceId',new THREE.InstancedBufferAttribute(faceIds,1));
      tiles=new THREE.InstancedMesh(tileGeometry,tileMaterial,tileCount);tiles.name='CubeSurfaceTiles';
      tiles.frustumCulled=false;instances.add(tiles);
      faces.forEach((rotation,face)=>{
        faceRotation.setFromEuler(rotation);
        for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
          const i=face*grid*grid+y*grid+x;
          point.set((x+.5)*spacing-side/2,(y+.5)*spacing-side/2,side/2).applyQuaternion(faceRotation);
          transform.position.copy(point);transform.quaternion.copy(faceRotation);
          transform.scale.set(spacing*.92,spacing*.92,.09);transform.updateMatrix();tiles.setMatrixAt(i,transform.matrix);
          faceUvs[i*2]=(x+.5)/grid;faceUvs[i*2+1]=(y+.5)/grid;faceIds[i]=face;
        }
      });
      tiles.instanceMatrix.needsUpdate=true;cube.add(tiles);
      tileMaterial.uniforms.uTileGrid.value=grid;
      return true;
    }
    rebuildTiles(grid);
    const insideGeometry=geometry(new THREE.BoxGeometry(side-.07,side-.07,side-.07));
    const insideMaterial=material(new THREE.MeshStandardMaterial({color:0x06151e,roughness:.38,metalness:.55}));
    cube.add(new THREE.Mesh(insideGeometry,insideMaterial));
    const cubeEdgeGeometry=geometry(new THREE.EdgesGeometry(insideGeometry));
    const cubeEdgeMaterial=material(new THREE.LineBasicMaterial({color:0x56c5e1,transparent:true,opacity:.35}));
    cube.add(new THREE.LineSegments(cubeEdgeGeometry,cubeEdgeMaterial));
    // A single, depth-tested billboard behind the cube gives a bounded local
    // halo. It never blurs the scene or the lyric cards, and allocates no target.
    const haloMaterial = material(new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uColor:{value:colors[0].clone()},uGlowStrength:{value:.45},uGlowSoftness:{value:.65},uAudioBoost:{value:1}},
      vertexShader:`uniform float uGlowSoftness;varying vec2 vUv;
        void main(){vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
          float size=length(modelMatrix[0].xyz);
          center.z-=3.6*size;center.xy+=position.xy*5.84*(1.8+uGlowSoftness*.6)*size;
          gl_Position=projectionMatrix*center;vUv=uv;}`,
      fragmentShader:`uniform vec3 uColor;uniform float uGlowStrength,uGlowSoftness,uAudioBoost;varying vec2 vUv;
        void main(){float radius=length(vUv-.5)*2.;
          float halo=exp(-radius*radius/(.13+uGlowSoftness*.2))*(1.-smoothstep(.45,1.,radius));
          float alpha=halo*uGlowStrength*uAudioBoost*.14;if(alpha<.001)discard;
          gl_FragColor=vec4(uColor,alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    }));
    const halo = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1,1)),haloMaterial);
    halo.name='HarmonicCoreHalo';halo.frustumCulled=false;cube.add(halo);

    const MAX_RAYS=48, STEPS=40, DOTS=80, STRANDS=7;
    // Keep the sampled centerline for attachment diagnostics; only volumetric
    // particles are rendered. Seven strands share each moving cross-section.
    const linePositions=new Float32Array(MAX_RAYS*STEPS*6);
    const dotPositions=new Float32Array(MAX_RAYS*DOTS*STRANDS*3);
    const dotStyles=new Float32Array(MAX_RAYS*DOTS*STRANDS*2);
    for(let i=0;i<MAX_RAYS*DOTS*STRANDS;i++){
      dotStyles[i*2]=i%STRANDS===0?1.15:.82;
      dotStyles[i*2+1]=i%STRANDS===0?.62:.35;
    }
    const lineGeometry=geometry(new THREE.BufferGeometry());
    const dotGeometry=geometry(new THREE.BufferGeometry());
    lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3).setUsage(THREE.DynamicDrawUsage));
    dotGeometry.setAttribute('position',new THREE.BufferAttribute(dotPositions,3).setUsage(THREE.DynamicDrawUsage));
    dotGeometry.setAttribute('aBeamStyle',new THREE.BufferAttribute(dotStyles,2));
    const dotMaterial=material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{uColor:{value:colors[0].clone()},uPixelRatio:{value:1},uGlowStrength:{value:.45},uGlowSoftness:{value:.65}},
      vertexShader:`attribute vec2 aBeamStyle;uniform float uPixelRatio;varying float vAlpha;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(62.0*uPixelRatio*aBeamStyle.x/max(1.0,-p.z),1.25*uPixelRatio,5.0*uPixelRatio);vAlpha=aBeamStyle.y;}`,
      fragmentShader:`uniform vec3 uColor;uniform float uGlowStrength,uGlowSoftness;varying float vAlpha;
        void main(){float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;
          float core=exp(-r*r*10.0);float halo=pow(1.0-r,2.0);
          float softHalo=pow(1.0-r,mix(4.0,1.3,uGlowSoftness));
          gl_FragColor=vec4(mix(uColor,vec3(.72,1.0,1.0),core*.7),(core*.76+halo*.24+softHalo*uGlowStrength*.12)*vAlpha);}`
    }));
    const dots=new THREE.Points(dotGeometry,dotMaterial);
    dots.name='HarmonicParticleBeams';dots.frustumCulled=false;
    rays.add(dots);
    const corners=Array.from({length:8},(_,i)=>new THREE.Vector3(i&1?1:-1,i&2?1:-1,i&4?1:-1).multiplyScalar(side/2));
    // Cold-air anchors stay in the orbital group's local coordinate space. The
    // atmosphere is a sibling under the same parent, so passing world-space
    // anchors here would apply the parent transform twice when the scene is
    // tilted or zoomed. The upper pair sits on the lower slanted sides; the
    // lower pair are the matching bottom corners.
    const cubeAnchorLocalLeft=new THREE.Vector3(-side*.46,-side*.22,0);
    const cubeAnchorLocalRight=new THREE.Vector3(side*.46,-side*.22,0);
    const cubeAnchorLocalCornerLeft=corners[0], cubeAnchorLocalCornerRight=corners[1];
    const cubeAnchorLeft=new THREE.Vector3(), cubeAnchorRight=new THREE.Vector3();
    const cubeAnchorCornerLeft=new THREE.Vector3(), cubeAnchorCornerRight=new THREE.Vector3();
    const cubeAnchors={left:cubeAnchorLeft,right:cubeAnchorRight,cornerLeft:cubeAnchorCornerLeft,cornerRight:cubeAnchorCornerRight,
      a:cubeAnchorCornerLeft,b:cubeAnchorCornerRight,localA:cubeAnchorLocalCornerLeft,localB:cubeAnchorLocalCornerRight};
    function getCubeAnchors(){
      cube.updateMatrix();
      cubeAnchorLeft.copy(cubeAnchorLocalLeft).applyMatrix4(cube.matrix);
      cubeAnchorRight.copy(cubeAnchorLocalRight).applyMatrix4(cube.matrix);
      cubeAnchorCornerLeft.copy(cubeAnchorLocalCornerLeft).applyMatrix4(cube.matrix);
      cubeAnchorCornerRight.copy(cubeAnchorLocalCornerRight).applyMatrix4(cube.matrix);
      return cubeAnchors;
    }
    const sources=Array.from({length:MAX_RAYS},()=>new THREE.Vector3());
    const targets=Array.from({length:MAX_RAYS},()=>new THREE.Vector3());
    const controlsA=Array.from({length:MAX_RAYS},()=>new THREE.Vector3());
    const controlsB=Array.from({length:MAX_RAYS},()=>new THREE.Vector3());
    const midpoints=Array.from({length:MAX_RAYS},()=>new THREE.Vector3());
    const initialized=new Uint8Array(MAX_RAYS);
    const desiredMid=new THREE.Vector3(),lag=new THREE.Vector3(),direction=new THREE.Vector3();
    const tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3();
    const p=new THREE.Vector3();
    let time=0,ringPhase=0,floatPhase=0,particlePhase=0,colorPhase=0,flashClock=0,shakePhase=0;
    let lightingAudio=0,lightingBoost=1;
    let bass=0,mid=0,treble=0,rayCount=24,ringRadius=11.36,beamRadius=.19,rayAnchorError=0,rippleAmplitude=0,adhesionLag=0,disposed=false;
    // Surface height levels: the music height (bass rise) holds while playing
    // and releases with a transition after a pause, while the idle ripple fades
    // in over the same window. Both settle exactly on their end values so a
    // paused scene stays frozen once the transition is over.
    const RISE_RELEASE_RATE=4.2,RISE_SNAP_EPSILON=.002;
    let bassRiseLevel=0,idleRippleLevel=0;
    let settings={};
    function rayPoint(index,t,out){
      const s=sources[index],e=targets[index],a=controlsA[index],b=controlsB[index],rest=1-t;
      // Endpoints never lag. Only the interior bows with a damped, sticky drag;
      // the corner tangent points out of the cube, not through its faces.
      out.copy(s).multiplyScalar(rest*rest*rest).addScaledVector(a,3*rest*rest*t)
        .addScaledVector(b,3*rest*t*t).addScaledVector(e,t*t*t);
      const envelope=Math.pow(Math.sin(t*Math.PI),2),strength=bass*limit(settings.rayShake,.65,0,2)*.19;
      out.x+=envelope*strength*Math.sin(t*37+time*13+index*1.7);
      out.y+=envelope*strength*Math.sin(t*29-time*11+index*.9);
      out.z+=envelope*strength*Math.cos(t*33+time*9+index);
      return out;
    }
    function update(frame={}){
      if(disposed)return;
      settings=frame.settings||settings;
      const s=settings,dt=limit(frame.delta,0,0,.08),playing=frame.playing===true;
      const requestedGrid=Number.isFinite(s.tileGrid)?s.tileGrid:s.cubeTileGrid;
      rebuildTiles(requestedGrid);
      const moving=(playing||frame.idleMotion===true)&&!frame.reducedMotion;
      rings.visible=s.ringsEnabled!==false;cube.visible=s.cubeEnabled!==false;
      rays.visible=s.raysEnabled!==false&&cube.visible;
      if(moving){
        const motionDt=dt*(playing?1:.35);
        time+=motionDt;ringPhase+=motionDt*limit(s.ringSpeed,.35,0,2);floatPhase+=motionDt*limit(s.floatSpeed,.65,0,2);
        particlePhase+=motionDt*limit(s.raySpeed,.8,0,3);colorPhase=(colorPhase+motionDt*limit(s.colorSpeed,.35,.05,2)*.08)%3;
        flashClock+=motionDt*limit(s.flashSpeed,.8,.1,3);
        shakePhase+=motionDt*limit(s.shakeFrequency,1,.25,2.5);
        const weight=1-Math.exp(-dt*12),react=playing&&s.audioReactive!==false;
        bass+=(react?limit(frame.bass,0,0,1)*limit(s.bassGain,1,0,2)-bass:-bass)*weight;
        mid+=(react?limit(frame.mid,0,0,1)*limit(s.midGain,1,0,2)-mid:-mid)*weight;
        treble+=(react?limit(frame.treble,0,0,1)*limit(s.trebleGain,1,0,2)-treble:-treble)*weight;
      }
      if(s.audioReactive===false)bass=mid=treble=0;
      if(moving){
        const lightingTarget=playing&&s.audioReactive!==false
          ? limit(frame.bass,0,0,1)*.55+limit(frame.mid,0,0,1)*.30+limit(frame.treble,0,0,1)*.15 : 0;
        lightingAudio+=(lightingTarget-lightingAudio)*(1-Math.exp(-dt*4));
      }
      if(s.audioReactive===false)lightingAudio=0;
      lightingBoost=1+lightingAudio*limit(s.lightAudioStrength,.35,0,1)*.18;
      const azimuth=limit(s.keyLightAzimuth,30,-180,180)*Math.PI/180;
      const elevation=limit(s.keyLightElevation,45,-10,85)*Math.PI/180;
      keyLocalDirection.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation));
      key.position.copy(keyLocalDirection).multiplyScalar(12);
      group.updateWorldMatrix(true,false);
      const externalDirection=frame.keyDirectionWorld;
      if(externalDirection?.isVector3&&Number.isFinite(externalDirection.x)&&Number.isFinite(externalDirection.y)
        &&Number.isFinite(externalDirection.z)&&externalDirection.lengthSq()>1e-12)keyWorldDirection.copy(externalDirection).normalize();
      else keyWorldDirection.copy(keyLocalDirection).transformDirection(group.matrixWorld);
      rimWorldDirection.copy(rimLocalDirection).transformDirection(group.matrixWorld);
      key.intensity=2.1*limit(s.keyLightIntensity,1,0,2.5)*lightingBoost;
      ambient.intensity=limit(s.ambientLightIntensity,.65,0,1.5);
      fill.intensity=ambient.intensity*2;
      rim.intensity=.8*limit(s.rimLightIntensity,1,0,2)*lightingBoost;
      const scale=limit(s.ringScale,1,.65,1.35);rings.scale.setScalar(scale);ringRadius=11.36*scale;
      pivots.forEach((pivot,i)=>{
        const def=ringDefs[i];pivot.rotation.set(def.tilt[0]+Math.sin(ringPhase*def.speed)*.65,
          def.tilt[1]+ringPhase*def.speed,def.tilt[2]+ringPhase*def.speed*.22);pivot.updateMatrix();
      });
      const floatAmount=limit(s.floatAmount,.55,0,1.5),shake=limit(s.shakeStrength,.6,0,2)*bass*.085;
      const shakeSignal=tileMaterial.uniforms.uShakeSignal.value;
      shakeSignal.set(Math.sin(shakePhase*31),Math.cos(shakePhase*37),Math.sin(shakePhase*29));
      // Absolute sine/cosine pulses repeat every π. Offset the cosine interval
      // by π/2 so every new selection starts at zero radiance, never at a peak.
      tileMaterial.uniforms.uShakeCycles.value.set(Math.floor(shakePhase*31/Math.PI),
        Math.floor((shakePhase*37+Math.PI/2)/Math.PI),Math.floor(shakePhase*29/Math.PI));
      const cubeHoverHeight=limit(s.cubeHoverHeight,0,-3,3);
      cube.position.set(Math.sin(floatPhase*.73)*floatAmount*(.34+mid*.22)+shakeSignal.x*shake,
        cubeHoverHeight+Math.sin(floatPhase*1.1+.3)*floatAmount*(.42+bass*.13)+shakeSignal.y*shake,
        Math.cos(floatPhase*.61)*floatAmount*(.16+treble*.08)+shakeSignal.z*shake*.4);
      cube.rotation.set(.48+Math.sin(floatPhase*.41)*(.07+mid*.07),
        .64+Math.sin(floatPhase*.5)*(.09+treble*.06),.52+Math.cos(floatPhase*.65)*(.06+treble*.045));
      cube.scale.setScalar(limit(s.cubeSize,1,.6,1.4));cube.updateMatrix();
      const u=tileMaterial.uniforms;u.uTime.value=time;u.uBass.value=bass;u.uMid.value=mid;u.uTreble.value=treble;
      u.uKeyIntensity.value=key.intensity/2.1;u.uAmbientIntensity.value=ambient.intensity;u.uRimIntensity.value=rim.intensity/.8;
      u.uEdgeGlow.value=limit(s.cubeEdgeGlow,.45,0,1.5);u.uOcclusion.value=limit(s.cubeOcclusion,.5,0,1);
      // Playback follows only the bass envelope; idle ripples have their own
      // height. Playing and every non-transition switch keep their exact
      // previous behaviour; only the pause path releases the music height over
      // time, so the raised surface retracts smoothly instead of snapping flat
      // on the frame the music stops. The idle ripple fades in across the same
      // window, and reduced motion never animates the switch.
      const surfaceRise=s.surfaceRiseEnabled===true,riseAudio=surfaceRise&&s.audioReactive!==false;
      if(riseAudio&&playing)bassRiseLevel=1;
      else if(!riseAudio||frame.reducedMotion===true)bassRiseLevel=0;
      else{
        bassRiseLevel+=(0-bassRiseLevel)*(1-Math.exp(-dt*RISE_RELEASE_RATE));
        if(bassRiseLevel<=RISE_SNAP_EPSILON)bassRiseLevel=0;
      }
      if(!surfaceRise||playing||frame.reducedMotion===true)idleRippleLevel=surfaceRise&&!playing?1:0;
      else{
        idleRippleLevel+=(1-idleRippleLevel)*(1-Math.exp(-dt*RISE_RELEASE_RATE));
        if(idleRippleLevel>=1-RISE_SNAP_EPSILON)idleRippleLevel=1;
      }
      u.uRipple.value=surfaceRise?limit(s.rippleStrength,.8,0,2)*idleRippleLevel:0;
      u.uBassRise.value=riseAudio?limit(s.bassRiseStrength,.8,0,5)*bassRiseLevel:0;
      rippleAmplitude=u.uRipple.value*.055+u.uBassRise.value*bass*.47;
      u.uFlashClock.value=flashClock;u.uFlashMode.value=s.flashMode==='random'?0:s.flashMode==='gradient'?1:2;
      u.uFlashIntensity.value=s.flashEnabled===false?0:limit(s.flashIntensity,.65,0,2);
      u.uFlashDensity.value=limit(s.flashDensity,.32,0,1);u.uFlashSoftness.value=limit(s.flashSoftness,.65,.05,1);
      u.uFlashAudioStrength.value=limit(s.flashAudioStrength,.5,0,2);u.uShakeAmount.value=Math.min(1,shake/.085);
      u.uFlashColorA.value.set(validColor(s.flashColorA,'#b8f5ff'));u.uFlashColorB.value.set(validColor(s.flashColorB,'#ba95ff'));u.uFlashColorC.value.set(validColor(s.flashColorC,'#ff8fca'));
      const slot=Math.floor(colorPhase),blend=.5-.5*Math.cos((colorPhase-slot)*Math.PI);
      tint.copy(colors[slot%3]).lerp(colors[(slot+1)%3],blend);
      u.uColorA.value.copy(tint);u.uColorB.value.copy(colors[(slot+1)%3]);u.uColorC.value.copy(colors[(slot+2)%3]);
      cubeTint.copy(tint);
      if(s.cubeColorMode==='custom'){
        cubeTint.set(validColor(s.cubeColor,'#7969ff'));
        u.uColorA.value.copy(cubeTint);u.uColorB.value.copy(cubeTint);u.uColorC.value.copy(cubeTint);
        insideMaterial.color.copy(cubeTint).multiplyScalar(.05);cubeEdgeMaterial.color.copy(cubeTint);
      }else{insideMaterial.color.setHex(0x06151e);cubeEdgeMaterial.color.setHex(0x56c5e1);}
      ringMaterial.color.copy(gold).lerp(tint,.12).multiplyScalar(.4);
      ringMaterial.metalness=limit(s.ringMetalness,.88,0,1);ringMaterial.roughness=limit(s.ringRoughness,.27,.08,1);
      tickMaterial.metalness=ringMaterial.metalness*.7;tickMaterial.roughness=Math.min(1,ringMaterial.roughness+.07);
      rimMaterial.color.copy(gold).lerp(tint,.22);
      rimMaterial.opacity=limit(s.ringGlow,.7,0,1.5)*.66;
      tickMaterial.emissiveIntensity=limit(s.ringGlow,.7,0,1.5)*.18;
      dotMaterial.uniforms.uColor.value.copy(tint);
      const glowStrength=limit(s.glowStrength,.45,0,1.5),glowSoftness=limit(s.glowSoftness,.65,.1,1);
      haloMaterial.uniforms.uColor.value.copy(cubeTint);haloMaterial.uniforms.uGlowStrength.value=glowStrength;
      haloMaterial.uniforms.uGlowSoftness.value=glowSoftness;haloMaterial.uniforms.uAudioBoost.value=lightingBoost;
      halo.visible=cube.visible&&glowStrength>0;
      dotMaterial.uniforms.uGlowStrength.value=glowStrength;dotMaterial.uniforms.uGlowSoftness.value=glowSoftness;
      dotMaterial.uniforms.uPixelRatio.value=limit(frame.pixelRatio,1,.5,2.5);
      rayCount=8*Math.max(1,Math.min(6,Math.round(limit(s.rayDensity,1,.3,2)*3)));
      beamRadius=.19+bass*limit(s.rayShake,.65,0,2)*.035;
      rayAnchorError=0;adhesionLag=0;
      for(let i=0;i<rayCount;i++){
        sources[i].copy(corners[i%8]).applyMatrix4(cube.matrix);
        const r=i%pivots.length,angle=(i*.61803398875%1)*TAU;
        targets[i].set(Math.cos(angle)*ringDefs[r].radius,Math.sin(angle)*ringDefs[r].radius,0)
          .applyMatrix4(pivots[r].matrix).multiplyScalar(scale);
        desiredMid.copy(sources[i]).lerp(targets[i],.5);
        if(!initialized[i]){midpoints[i].copy(desiredMid);initialized[i]=1;}
        else if(moving)midpoints[i].lerp(desiredMid,1-Math.exp(-dt*8));
        lag.copy(midpoints[i]).sub(desiredMid).clampLength(0,.65);
        adhesionLag=Math.max(adhesionLag,lag.length());
        const distance=sources[i].distanceTo(targets[i]);
        direction.copy(sources[i]).sub(cube.position).normalize();
        controlsA[i].copy(sources[i]).addScaledVector(direction,Math.min(distance*.28,1.7)).addScaledVector(lag,.7);
        direction.copy(targets[i]).normalize();
        controlsB[i].copy(targets[i]).addScaledVector(direction,-Math.min(distance*.22,1.35)).add(lag);
        for(let j=0;j<STEPS;j++)for(let k=0;k<2;k++){
          rayPoint(i,(j+k)/STEPS,p);const n=(i*STEPS*2+j*2+k)*3;
          linePositions[n]=p.x;linePositions[n+1]=p.y;linePositions[n+2]=p.z;
        }
        const end=(i*STEPS*2+STEPS*2-1)*3;
        rayAnchorError=Math.max(rayAnchorError,Math.hypot(linePositions[end]-targets[i].x,linePositions[end+1]-targets[i].y,linePositions[end+2]-targets[i].z));
        for(let j=0;j<DOTS;j++){
          // The first/last cross-sections stay pinned; the others travel from
          // the cube to its rotating ring attachment, even with rings hidden.
          const t=j===0?0:j===DOTS-1?1:((j-1)/(DOTS-2)+particlePhase*.22+i*.173)%1;
          const rest=1-t,a=controlsA[i],b=controlsB[i],start=sources[i],end=targets[i];
          rayPoint(i,t,p);
          tangent.copy(a).sub(start).multiplyScalar(rest*rest)
            .addScaledVector(direction.copy(b).sub(a),2*rest*t)
            .addScaledVector(direction.copy(end).sub(b),t*t).normalize();
          if(tangent.lengthSq()<.01)tangent.set(0,1,0);
          normal.set(0,Math.abs(tangent.z)>.9?1:0,Math.abs(tangent.z)>.9?0:1).cross(tangent).normalize();
          binormal.crossVectors(tangent,normal);
          const radius=beamRadius*Math.pow(Math.max(0,Math.sin(t*Math.PI)),.6);
          const twist=t*TAU*2-particlePhase*1.4+i*1.7;
          for(let strand=0;strand<STRANDS;strand++){
            const angle=twist+(strand-1)*TAU/(STRANDS-1);
            const radial=strand===0?0:radius*(.86+.14*Math.sin(t*17+i+strand));
            const x=Math.cos(angle)*radial,y=Math.sin(angle)*radial;
            const n=((i*DOTS+j)*STRANDS+strand)*3;
            dotPositions[n]=p.x+normal.x*x+binormal.x*y;
            dotPositions[n+1]=p.y+normal.y*x+binormal.y*y;
            dotPositions[n+2]=p.z+normal.z*x+binormal.z*y;
          }
        }
      }
      lineGeometry.setDrawRange(0,rayCount*STEPS*2);dotGeometry.setDrawRange(0,rayCount*DOTS*STRANDS);
      lineGeometry.attributes.position.needsUpdate=true;dotGeometry.attributes.position.needsUpdate=true;
    }
    function setPalette(values){
      if(disposed||!Array.isArray(values))return;
      values.slice(0,3).forEach((v,i)=>colors[i].setRGB(limit(v?.r,19,0,255)/255,limit(v?.g,232,0,255)/255,limit(v?.b,238,0,255)/255));
    }
    function diagnostics(){const anchorState=getCubeAnchors();return {time,ringPhase,floatPhase,particlePhase,shakePhase,flashClock,ringRadius,ringCount:ringDefs.length,faceCount:6,tileGrid:grid,tileCount,rayCount,
      beamStrands:STRANDS,beamSamples:DOTS,beamParticleCount:rayCount*DOTS*STRANDS,beamRadius,
      lighting:{keyIntensity:key.intensity,ambientIntensity:ambient.intensity,rimIntensity:rim.intensity,
        keyDirectionWorld:keyWorldDirection.toArray(),keyDirectionLocal:keyLocalDirection.toArray(),audio:lightingAudio,audioBoost:lightingBoost,
        ringMetalness:ringMaterial.metalness,ringRoughness:ringMaterial.roughness,
        cubeEdgeGlow:tileMaterial.uniforms.uEdgeGlow.value,cubeOcclusion:tileMaterial.uniforms.uOcclusion.value,
        glowStrength:haloMaterial.uniforms.uGlowStrength.value,glowSoftness:haloMaterial.uniforms.uGlowSoftness.value,
        haloVisible:halo.visible,haloDrawCalls:1},
      surface:{flashMode:tileMaterial.uniforms.uFlashMode.value,flashIntensity:tileMaterial.uniforms.uFlashIntensity.value,
        shakeSignal:tileMaterial.uniforms.uShakeSignal.value.toArray(),shakeCycles:tileMaterial.uniforms.uShakeCycles.value.toArray(),
        shakeAmount:tileMaterial.uniforms.uShakeAmount.value,
        color:cubeTint.getHexString(),surfaceRiseEnabled:settings.surfaceRiseEnabled===true,
        rippleStrength:limit(settings.rippleStrength,.8,0,2),bassRiseStrength:limit(settings.bassRiseStrength,.8,0,5)},
      cubePosition:cube.position.toArray(),cubeRotation:cube.rotation.toArray().slice(0,3),cubeHoverHeight:limit(settings.cubeHoverHeight,0,-3,3),
      cubeAnchors:{a:anchorState.a.toArray(),b:anchorState.b.toArray(),localA:anchorState.localA.toArray(),localB:anchorState.localB.toArray()},
      rayAnchorError,adhesionLag,rippleAmplitude,bass,mid,treble,disposed};}
    function dispose(){if(disposed)return;disposed=true;for(const mesh of instances)mesh.dispose?.();for(const g of geometries)g.dispose();
      for(const m of materials)m.dispose();group.removeFromParent?.();if(group.parent)group.parent.remove(group);group.clear();}
    update({delta:0,settings:{}});
    return {group,rings,cube,rays,pivots,get tiles(){return tiles;},lineGeometry,dotGeometry,sources,targets,update,getCubeAnchors,setPalette,diagnostics,dispose};
  }
  global.FeHarmonicOrbitalCore=Object.freeze({create});
})(window);
