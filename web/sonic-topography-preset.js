'use strict';

(function () {
  var PRESET_INDEX = 7;
  var RIPPLE_MAX = 10;
  var state = null;

  window.SONIC_TOPOGRAPHY_PRESET_INDEX = PRESET_INDEX;

  function clamp01Local(v) {
    if (typeof clamp01 === 'function') return clamp01(v);
    return Math.max(0, Math.min(1, Number(v) || 0));
  }

  function clampRangeLocal(v, min, max) {
    if (typeof clampRange === 'function') return clampRange(v, min, max);
    v = Number(v) || 0;
    return Math.max(min, Math.min(max, v));
  }

  function hexLocal(value, fallback) {
    if (typeof normalizeHexColor === 'function') return normalizeHexColor(value, fallback);
    value = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function isLowChromaHex(value) {
    value = String(value || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return true;
    var r = parseInt(value.slice(0, 2), 16);
    var g = parseInt(value.slice(2, 4), 16);
    var b = parseInt(value.slice(4, 6), 16);
    var hi = Math.max(r, g, b);
    var lo = Math.min(r, g, b);
    return hi - lo < 34 && (r + g + b) / 3 > 142;
  }

  function isActive() {
    return !!(window.fx && Number(window.fx.preset) === PRESET_INDEX);
  }

  function ensureState() {
    if (state) return state;
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof renderer === 'undefined' || typeof uniforms === 'undefined') return null;

    var group = new THREE.Group();
    group.visible = false;
    group.renderOrder = -1;

    var grid = 74;
    var spacing = 0.112;
    var count = grid * grid;
    var offset = (grid - 1) * spacing * 0.5;
    var geo = new THREE.BoxGeometry(0.074, 1, 0.074, 1, 1, 1);
    var rippleVecs = [];
    var rippleTypes = new Float32Array(RIPPLE_MAX);
    for (var ri = 0; ri < RIPPLE_MAX; ri++) rippleVecs.push(new THREE.Vector4(0, 0, -100, 0));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniforms.uTime,
        uTopographyAlpha: { value: 0 },
        uTopographySubBass: { value: 0 },
        uTopographyBass: { value: 0 },
        uTopographyLowMid: { value: 0 },
        uTopographyMid: { value: 0 },
        uTopographyHighMid: { value: 0 },
        uTopographyPresence: { value: 0 },
        uTopographyBrilliance: { value: 0 },
        uTopographyAir: { value: 0 },
        uTopographyEnergy: { value: 0 },
        uTopographyWarmth: { value: 0 },
        uTopographyBrightness: { value: 0 },
        uTopographySharpness: { value: 0 },
        uTopographySmoothness: { value: 0.7 },
        uTopographyDensity: { value: 0.2 },
        uTopographyRipples: { value: rippleVecs },
        uTopographyRippleType: { value: rippleTypes },
        uTopographyBaseA: { value: new THREE.Color('#02070d') },
        uTopographyBaseB: { value: new THREE.Color('#071421') },
        uTopographyCool: { value: new THREE.Color('#00f5d4') },
        uTopographyCoolEdge: { value: new THREE.Color('#7fd8ff') },
        uTopographyWarm: { value: new THREE.Color('#f4d28a') },
        uTopographyWarmEdge: { value: new THREE.Color('#ff6b6b') },
        uTopographyRippleColor: { value: new THREE.Color('#9cffdf') },
        uTopographyGlow: { value: 1.0 }
      },
      vertexShader: [
        'precision highp float;',
        'uniform float uTime, uTopographyAlpha;',
        'uniform float uTopographySubBass, uTopographyBass, uTopographyLowMid, uTopographyMid, uTopographyHighMid;',
        'uniform float uTopographyEnergy, uTopographySmoothness, uTopographyDensity;',
        'uniform vec4 uTopographyRipples[10];',
        'uniform float uTopographyRippleType[10];',
        'varying vec2 vTopoUv;',
        'varying float vTopoElevation;',
        'varying float vTopoDist;',
        'varying vec2 vTopoRipple;',
        'varying vec3 vTopoNormal;',
        'varying float vTopoY;',
        'varying vec2 vTopoPos;',
        'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
        'vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
        'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
        'float snoise(vec2 v){',
        '  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
        '  vec2 i=floor(v+dot(v,C.yy));',
        '  vec2 x0=v-i+dot(i,C.xx);',
        '  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);',
        '  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;',
        '  i=mod289(i);',
        '  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));',
        '  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);',
        '  m=m*m; m=m*m;',
        '  vec3 x=2.0*fract(p*C.www)-1.0;',
        '  vec3 h=abs(x)-0.5;',
        '  vec3 ox=floor(x+0.5);',
        '  vec3 a0=x-ox;',
        '  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);',
        '  vec3 g;',
        '  g.x=a0.x*x0.x+h.x*x0.y;',
        '  g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
        '  return 130.0*dot(m,g);',
        '}',
        'float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);}',
        'void main(){',
        '  vTopoUv=uv;',
        '  vTopoNormal=normal;',
        '  vec4 ip=instanceMatrix*vec4(0.0,0.0,0.0,1.0);',
        '  vec2 p2=ip.xz;',
        '  vTopoPos=p2;',
        '  float centerDist=length(p2);',
        '  vTopoDist=centerDist;',
        '  float rnd=random(p2);',
        '  float falloff=smoothstep(4.45,1.25,centerDist);',
        '  float outerFalloff=1.0-smoothstep(3.95,4.55,centerDist);',
        '  float idleNoise=(snoise(p2*0.54+vec2(uTime*0.055,uTime*0.026))+1.0)*0.5;',
        '  float wave=sin(p2.x*1.35+p2.y*0.82-uTime*0.62)*0.5+0.5;',
        '  float idleElevation=mix(idleNoise,wave,uTopographySmoothness*0.42+0.18)*0.10*outerFalloff;',
        '  float subRegion=smoothstep(1.95,0.05,centerDist);',
        '  float bassNoise=snoise(p2*0.95-vec2(0.0,uTime*0.23));',
        '  float bassRegion=smoothstep(2.95,0.36,centerDist+bassNoise*0.42);',
        '  float lowMidNoise=snoise(p2*0.42+vec2(uTime*0.10,0.0));',
        '  float river=max(0.0,sin(p2.x*1.42+p2.y*1.12+snoise(p2*0.65)*2.0-uTime*1.55));',
        '  float highRegion=smoothstep(0.9,3.85,centerDist);',
        '  float subLift=uTopographySubBass*subRegion*0.50;',
        '  float bassLift=uTopographyBass*bassRegion*smoothstep(0.0,1.0,rnd+uTopographyDensity*0.46)*0.44;',
        '  float lowMidLift=uTopographyLowMid*(lowMidNoise*0.5+0.5)*0.30;',
        '  float midLift=uTopographyMid*river*0.34;',
        '  float highLift=0.0;',
        '  if(fract(rnd*13.3)>0.80) highLift=uTopographyHighMid*highRegion*fract(rnd*7.7)*0.30;',
        '  float elevation=(idleElevation+subLift+bassLift+lowMidLift+midLift+highLift)*falloff;',
        '  if(rnd>0.990) elevation+=uTopographyEnergy*0.28*falloff;',
        '  float rippleElevation=0.0;',
        '  float rippleNormal=0.0;',
        '  float rippleWhite=0.0;',
        '  for(int i=0;i<10;i++){',
        '    vec4 r=uTopographyRipples[i];',
        '    float age=uTime-r.z;',
        '    if(r.w>0.004 && age>0.0 && age<2.25){',
        '      float dist=length(p2-r.xy);',
        '      float isWhite=uTopographyRippleType[i];',
        '      float speed=mix(1.90,2.82,isWhite);',
        '      float width=mix(0.35,0.16,isWhite);',
        '      float radius=age*speed;',
        '      float d=dist-radius;',
        '      float ring=exp(-(d*d)/max(0.001,width))*exp(-radius/mix(3.45,2.15,isWhite))*r.w;',
        '      float bulge=exp(-(dist*dist)/(0.32+age*0.95))*r.w*(1.0-smoothstep(0.0,1.0,age*0.52))*(1.0-isWhite);',
        '      rippleElevation+=(ring*mix(0.22,0.10,isWhite)+bulge*0.32)*falloff;',
        '      rippleNormal+=ring*(1.0-isWhite);',
        '      rippleWhite+=ring*isWhite;',
        '    }',
        '  }',
        '  elevation+=rippleElevation;',
        '  vTopoRipple=vec2(clamp(rippleNormal,0.0,1.0),clamp(rippleWhite,0.0,1.0));',
        '  vTopoElevation=elevation;',
        '  float yPos=position.y+0.5;',
        '  vTopoY=yPos;',
        '  float totalHeight=0.045+elevation*0.92;',
        '  vec3 pos=position;',
        '  pos.y=-0.5+yPos*totalHeight;',
        '  vec4 mv=modelViewMatrix*instanceMatrix*vec4(pos,1.0);',
        '  gl_Position=projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'precision highp float;',
        'uniform float uTime, uTopographyAlpha;',
        'uniform float uTopographyPresence, uTopographyBrilliance, uTopographyAir;',
        'uniform float uTopographyWarmth, uTopographyBrightness, uTopographySharpness;',
        'uniform float uTopographyGlow;',
        'uniform vec3 uTopographyBaseA, uTopographyBaseB, uTopographyCool, uTopographyCoolEdge;',
        'uniform vec3 uTopographyWarm, uTopographyWarmEdge, uTopographyRippleColor;',
        'varying vec2 vTopoUv;',
        'varying float vTopoElevation;',
        'varying float vTopoDist;',
        'varying vec2 vTopoRipple;',
        'varying vec3 vTopoNormal;',
        'varying float vTopoY;',
        'varying vec2 vTopoPos;',
        'float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);}',
        'void main(){',
        '  float rnd=random(vTopoPos);',
        '  bool isTop=vTopoNormal.y>0.5;',
        '  float normElevation=clamp(vTopoElevation/1.45,0.0,1.0);',
        '  float centerDist=length(vTopoPos);',
        '  float distFade=1.0-smoothstep(3.8,4.72,centerDist);',
        '  float warmBlend=smoothstep(0.0,1.0,uTopographyWarmth*1.18+(0.48-centerDist/8.0));',
        '  vec3 zoneCore=mix(uTopographyCool,uTopographyWarm,warmBlend);',
        '  vec3 zoneEdge=mix(uTopographyCoolEdge,uTopographyWarmEdge,warmBlend);',
        '  vec3 glow=mix(zoneCore,zoneEdge,fract(rnd*11.0));',
        '  glow=mix(glow,vec3(0.62,0.92,1.0),uTopographyBrightness*0.48);',
        '  vec3 currentGlow=mix(uTopographyBaseB,glow,normElevation)*uTopographyGlow*(0.24+distFade*0.64);',
        '  currentGlow=mix(currentGlow,uTopographyRippleColor,vTopoRipple.x);',
        '  currentGlow=mix(currentGlow,vec3(1.0),vTopoRipple.y);',
        '  vec3 bodyColor=mix(uTopographyBaseA,uTopographyBaseB,vTopoY*distFade);',
        '  vec3 finalColor;',
        '  if(isTop){',
        '    float topIntensity=smoothstep(0.0,0.38,normElevation);',
        '    float twinkle=1.0-smoothstep(3.8,4.8,centerDist);',
        '    if(fract(rnd*31.0)>0.955 && normElevation<0.13) topIntensity+=uTopographyAir*0.72*twinkle;',
        '    topIntensity=clamp(topIntensity,0.0,0.92);',
        '    finalColor=mix(uTopographyBaseB,currentGlow,topIntensity);',
        '    float edgeX=smoothstep(0.08,0.02,vTopoUv.x)+smoothstep(0.92,0.98,vTopoUv.x);',
        '    float edgeY=smoothstep(0.08,0.02,vTopoUv.y)+smoothstep(0.92,0.98,vTopoUv.y);',
        '    float edge=min(edgeX+edgeY,1.0);',
        '    finalColor+=currentGlow*edge*0.76*(topIntensity+0.28);',
        '    float flashChance=smoothstep(0.25,1.0,uTopographyPresence);',
        '    if(fract(rnd*53.0)>0.985-flashChance*0.08){',
        '      float flash=sin(uTime*38.0+rnd*100.0)*0.5+0.5;',
        '      finalColor+=mix(uTopographyCoolEdge,uTopographyWarmEdge,rnd)*flash*uTopographyPresence*(0.32+uTopographySharpness*0.62)*twinkle;',
        '    }',
        '    if(edge>0.5 && fract(rnd*89.0+uTime*1.8)>0.984) finalColor+=zoneEdge*uTopographyBrilliance*0.95*twinkle;',
        '  } else {',
        '    float sideGlow=smoothstep(0.50/(1.0+uTopographySharpness*1.55),0.0,1.0-vTopoY)*normElevation;',
        '    if(normElevation<0.02) sideGlow=0.0;',
        '    finalColor=mix(bodyColor,currentGlow,sideGlow*1.52);',
        '    finalColor+=currentGlow*smoothstep(0.035,0.0,1.0-vTopoY)*normElevation;',
        '  }',
        '  finalColor+=uTopographyRippleColor*vTopoRipple.x*0.46+mix(uTopographyRippleColor,vec3(0.74,0.92,1.0),0.42)*vTopoRipple.y*0.50;',
        '  float fog=smoothstep(2.8,5.0,vTopoDist);',
        '  finalColor=mix(finalColor,mix(uTopographyBaseA,uTopographyBaseB,0.5),fog*0.46);',
        '  float finalLum=dot(finalColor,vec3(0.299,0.587,0.114));',
        '  vec3 spectralTint=mix(uTopographyCoolEdge,uTopographyWarmEdge,warmBlend);',
        '  finalColor=mix(finalColor,spectralTint*finalLum*1.28,0.18+normElevation*0.16);',
        '  finalColor=finalColor/(vec3(1.0)+finalColor*1.15);',
        '  finalColor=clamp(finalColor*0.86,vec3(0.0),vec3(0.82));',
        '  float alpha=(1.0-smoothstep(4.25,5.12,vTopoDist))*uTopographyAlpha;',
        '  gl_FragColor=vec4(finalColor,alpha);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NormalBlending
    });

    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    if (mesh.instanceMatrix && mesh.instanceMatrix.setUsage && THREE.DynamicDrawUsage) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var matrix = new THREE.Matrix4();
    var idx = 0;
    for (var x = 0; x < grid; x++) {
      for (var z = 0; z < grid; z++) {
        matrix.makeTranslation(x * spacing - offset, -1.72, z * spacing - offset);
        mesh.setMatrixAt(idx++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);

    var meteorMax = 18;
    var meteorGeo = new THREE.BoxGeometry(0.055, 0.70, 0.055, 1, 1, 1);
    var meteorMat = new THREE.MeshBasicMaterial({
      color: 0xf4d28a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var meteorMesh = new THREE.InstancedMesh(meteorGeo, meteorMat, meteorMax);
    meteorMesh.frustumCulled = false;
    if (meteorMesh.instanceMatrix && meteorMesh.instanceMatrix.setUsage && THREE.DynamicDrawUsage) meteorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(meteorMesh);

    scene.add(group);
    state = {
      group: group,
      mesh: mesh,
      material: mat,
      meteorMesh: meteorMesh,
      meteorMat: meteorMat,
      meteorMax: meteorMax,
      meteors: [],
      meteorIndex: 0,
      ripples: rippleVecs,
      rippleTypes: rippleTypes,
      rippleIndex: 0,
      alpha: 0,
      lastRippleAt: -999,
      lastMeteorAt: -999,
      prevBrightness: 0,
      bands: { subBass:0, bass:0, lowMid:0, mid:0, highMid:0, presence:0, brilliance:0, air:0, energy:0, warmth:0, brightness:0, sharpness:0, smoothness:0.75, density:0.1, highFlux:0 },
      peaks: { subBass:0.05, bass:0.05, lowMid:0.04, mid:0.035, highMid:0.03, presence:0.025, brilliance:0.022, air:0.018, energy:0.035 },
      prevBins: new Float32Array((window.frequencyData && window.frequencyData.length) || 1024),
      matrix: new THREE.Matrix4(),
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      euler: new THREE.Euler(),
      cool: new THREE.Color(),
      coolEdge: new THREE.Color(),
      warm: new THREE.Color('#f4d28a'),
      warmEdge: new THREE.Color('#ff6b6b'),
      ripple: new THREE.Color('#9cffdf'),
      pointerRay: new THREE.Raycaster(),
      pointerNdc: new THREE.Vector2(),
      pointerPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.72),
      pointerHit: new THREE.Vector3(),
      pointerBound: false
    };
    for (var mi = 0; mi < meteorMax; mi++) {
      state.meteors.push({ active:false, x:0, y:-999, z:0, speed:0, strength:0, tilt:0, spin:0 });
    }
    bindPointer();
    return state;
  }

  function addRipple(x, z, strength, white) {
    var s = ensureState();
    if (!s) return;
    var idx = s.rippleIndex;
    s.ripples[idx].set(x, z, uniforms.uTime.value, clampRangeLocal(strength == null ? 0.65 : strength, 0.05, 3.2));
    s.rippleTypes[idx] = white ? 1 : 0;
    s.rippleIndex = (idx + 1) % RIPPLE_MAX;
    s.material.uniforms.uTopographyRippleType.value = s.rippleTypes;
  }

  function spawnMeteor(strength) {
    var s = ensureState();
    if (!s) return;
    var now = uniforms.uTime.value;
    if (now - s.lastMeteorAt < 0.72) return;
    s.lastMeteorAt = now;
    var idx = s.meteorIndex;
    var angle = Math.random() * Math.PI * 2;
    var dist = Math.sqrt(Math.random()) * 3.15;
    var m = s.meteors[idx];
    m.active = true;
    m.x = Math.cos(angle) * dist;
    m.z = Math.sin(angle) * dist;
    m.y = 2.7 + Math.random() * 1.15;
    m.speed = 1.42 + Math.random() * 0.56 + clampRangeLocal(strength || 0, 0, 1.8) * 0.82;
    m.strength = clampRangeLocal(strength || 0.5, 0.15, 2.2);
    m.tilt = (Math.random() - 0.5) * 0.72;
    m.spin = Math.random() * Math.PI * 2;
    s.meteorIndex = (idx + 1) % s.meteorMax;
  }

  function sampleBands(dt) {
    var s = ensureState();
    var data = window.frequencyData || [];
    var len = data.length || 0;

    function avg(start, end) {
      if (!len) return 0;
      start = Math.max(0, Math.min(len - 1, start | 0));
      end = Math.max(start + 1, Math.min(len, end | 0));
      var sum = 0;
      for (var i = start; i < end; i++) sum += (data[i] || 0) / 255;
      return sum / Math.max(1, end - start);
    }

    var raw = {
      subBass: avg(0, 3),
      bass: avg(3, 9),
      lowMid: avg(9, 32),
      mid: avg(32, 128),
      highMid: avg(128, 260),
      presence: avg(260, 460),
      brilliance: avg(460, 740),
      air: avg(740, len),
      energy: window.audioEnergy || 0
    };
    var keys = ['subBass','bass','lowMid','mid','highMid','presence','brilliance','air','energy'];
    var out = s.bands;
    var energySum = 0;
    var activeBands = 0;
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      var minPeak = key === 'energy' ? 0.035 : 0.018;
      s.peaks[key] = Math.max((s.peaks[key] || minPeak) * 0.994, raw[key], minPeak);
      var norm = Math.pow(clamp01Local(raw[key] / Math.max(minPeak, s.peaks[key] * 0.70)), key === 'air' ? 0.78 : 0.86);
      out[key] += (norm - out[key]) * (norm > out[key] ? 0.18 : 0.065);
      out[key] *= 0.88;
      if (key !== 'energy') {
        energySum += out[key];
        if (out[key] > Math.max(0.12, out.energy * 0.62)) activeBands++;
      }
    }
    out.subBass = clampRangeLocal(out.subBass * 0.74 + (window.bass || 0) * 0.10 + (window.beatPulse || 0) * 0.045, 0, 0.92);
    out.bass = clampRangeLocal(out.bass * 0.72 + (window.bass || 0) * 0.16 + (window.beatPulse || 0) * 0.04, 0, 0.92);
    out.mid = clampRangeLocal(out.mid * 0.80 + (window.mid || 0) * 0.13, 0, 0.82);
    out.presence = clampRangeLocal(out.presence * 0.86 + (window.treble || 0) * 0.06, 0, 0.82);
    out.brilliance = clampRangeLocal(out.brilliance * 0.88 + (window.treble || 0) * 0.07, 0, 0.82);
    out.energy = clampRangeLocal(Math.max(out.energy * 0.82, (window.audioEnergy || 0) * 0.46, (window.beatPulse || 0) * 0.28), 0, 0.88);

    var warm = (out.subBass + out.bass + out.lowMid + out.mid) / Math.max(0.001, energySum);
    var bright = (out.presence + out.brilliance + out.air) / Math.max(0.001, energySum);
    out.warmth += (clamp01Local(warm) - out.warmth) * 0.075;
    out.brightness += (clamp01Local(bright) - out.brightness) * 0.075;
    out.sharpness += (clamp01Local(Math.max(0, out.brightness - s.prevBrightness) * 4.8 + (window.treble || 0) * 0.28) - out.sharpness) * 0.12;
    out.smoothness += (clamp01Local(0.90 - Math.abs(out.energy - (window.prevEnergy || 0)) * 1.6) - out.smoothness) * 0.05;
    out.density += (clamp01Local(activeBands / 8) - out.density) * 0.08;
    s.prevBrightness = out.brightness;

    var highFlux = 0;
    if (len) {
      var start = Math.min(len - 1, 220);
      var end = Math.min(len, 740);
      for (var fi = start; fi < end; fi += 4) {
        var val = (data[fi] || 0) / 255;
        var diff = val - (s.prevBins[fi] || 0);
        if (diff > 0) highFlux += diff;
        s.prevBins[fi] = val;
      }
    }
    out.highFlux += (highFlux - out.highFlux) * 0.22;
    return out;
  }

  function updatePalette(s) {
    var u = s.material.uniforms;
    var customTint = window.fx && window.fx.visualTintMode === 'custom';
    var tintHex = customTint
      ? hexLocal(window.fx.visualTintColor || '#7fd8ff', '#7fd8ff')
      : hexLocal(window.fx && window.fx.visualIconColor || '#00f5d4', '#00f5d4');
    if (!customTint && isLowChromaHex(tintHex)) tintHex = '#7fd8ff';
    var accentHex = hexLocal(window.fx && (window.fx.shelfAccentColor || window.fx.homeAccentColor) || '#f4d28a', '#f4d28a');
    if (isLowChromaHex(accentHex)) accentHex = '#f4d28a';
    s.cool.set(tintHex);
    s.coolEdge.copy(s.cool).lerp(new THREE.Color('#d7fbff'), 0.42);
    s.warm.set(accentHex);
    s.warmEdge.copy(s.warm).lerp(new THREE.Color('#ff5d73'), 0.34);
    s.ripple.copy(s.cool).lerp(new THREE.Color('#ffffff'), 0.28);
    u.uTopographyCool.value.lerp(s.cool, 0.035);
    u.uTopographyCoolEdge.value.lerp(s.coolEdge, 0.035);
    u.uTopographyWarm.value.lerp(s.warm, 0.035);
    u.uTopographyWarmEdge.value.lerp(s.warmEdge, 0.035);
    u.uTopographyRippleColor.value.lerp(s.ripple, 0.035);
    if (s.meteorMat) s.meteorMat.color.copy(u.uTopographyWarm.value).lerp(new THREE.Color('#ffffff'), 0.32);
  }

  function update(dt) {
    var s = ensureState();
    if (!s) return;
    var active = isActive();
    var targetAlpha = active ? clampRangeLocal(0.70 + ((uniforms.uAlpha && uniforms.uAlpha.value) || 0) * 0.30, 0.72, 1) : 0;
    s.alpha += (targetAlpha - s.alpha) * (targetAlpha > s.alpha ? 0.12 : 0.08);
    s.group.visible = s.alpha > 0.012;
    s.material.uniforms.uTopographyAlpha.value = s.alpha;
    if (s.meteorMat) s.meteorMat.opacity = s.alpha * 0.82;
    if (!s.group.visible) return;

    var b = sampleBands(dt || 0.016);
    var u = s.material.uniforms;
    u.uTopographySubBass.value = b.subBass;
    u.uTopographyBass.value = b.bass;
    u.uTopographyLowMid.value = b.lowMid;
    u.uTopographyMid.value = b.mid;
    u.uTopographyHighMid.value = b.highMid;
    u.uTopographyPresence.value = b.presence;
    u.uTopographyBrilliance.value = b.brilliance;
    u.uTopographyAir.value = b.air;
    u.uTopographyEnergy.value = b.energy;
    u.uTopographyWarmth.value = b.warmth;
    u.uTopographyBrightness.value = b.brightness;
    u.uTopographySharpness.value = b.sharpness;
    u.uTopographySmoothness.value = b.smoothness;
    u.uTopographyDensity.value = b.density;
    u.uTopographyGlow.value = clampRangeLocal(0.86 + ((window.fx && window.fx.color) || 1) * 0.20 + b.energy * 0.16, 0.74, 1.35);
    updatePalette(s);

    s.group.rotation.y += (dt || 0.016) * (0.018 + Math.max(0.05, (window.fx && window.fx.speed) || 1) * 0.020);
    var now = uniforms.uTime.value;
    if (active && (window.beatOnsetFlag || (window.beatPulse || 0) > 0.18) && now - s.lastRippleAt > 0.18) {
      var angle = Math.random() * Math.PI * 2;
      var radius = Math.sqrt(Math.random()) * (1.25 + b.bass * 2.0);
      addRipple(Math.cos(angle) * radius, Math.sin(angle) * radius, clampRangeLocal(0.22 + (window.beatPulse || 0) * 1.15 + b.bass * 0.24, 0.12, 1.25), false);
      s.lastRippleAt = now;
    }
    if (active && (b.highFlux > 0.95 || (window.beatOnsetFlag && (b.brilliance + b.presence) > 0.65))) {
      spawnMeteor(clampRangeLocal(0.42 + b.highFlux * 0.22 + b.brilliance * 0.52, 0.25, 2.0));
    }

    if (s.meteorMesh) {
      for (var i = 0; i < s.meteorMax; i++) {
        var m = s.meteors[i];
        if (!m.active) {
          s.pos.set(0, -999, 0);
          s.scale.set(0, 0, 0);
        } else {
          m.y -= m.speed * (dt || 0.016) * 2.05;
          if (m.y <= -0.02) {
            m.active = false;
            addRipple(m.x, m.z, clampRangeLocal(m.strength * 0.42, 0.10, 0.85), true);
            s.pos.set(0, -999, 0);
            s.scale.set(0, 0, 0);
          } else {
            s.pos.set(m.x, -1.28 + m.y, m.z);
            s.euler.set(0.42 + m.tilt, m.spin, -0.36 + m.tilt * 0.5, 'XYZ');
            s.quat.setFromEuler(s.euler);
            s.scale.set(0.72 + m.strength * 0.32, 1.00 + m.strength * 0.46, 0.72 + m.strength * 0.32);
          }
        }
        s.matrix.compose(s.pos, s.quat, s.scale);
        s.meteorMesh.setMatrixAt(i, s.matrix);
      }
      s.meteorMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function bindPointer() {
    var s = ensureState();
    if (!s || s.pointerBound || typeof renderer === 'undefined' || !renderer.domElement) return;
    s.pointerBound = true;
    renderer.domElement.addEventListener('pointerdown', function (e) {
      if (!isActive() || e.button !== 0) return;
      if (window.visualGuideActive || document.querySelector('.modal-mask.show')) return;
      var rect = renderer.domElement.getBoundingClientRect();
      s.pointerNdc.set(
        ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
      );
      s.pointerRay.setFromCamera(s.pointerNdc, camera);
      if (s.pointerRay.ray.intersectPlane(s.pointerPlane, s.pointerHit)) {
        var local = s.group.worldToLocal(s.pointerHit.clone());
        addRipple(local.x, local.z, 0.58 + (window.beatPulse || 0) * 0.95, false);
        if (typeof markRenderInteraction === 'function') markRenderInteraction('sonic-topography-ripple', 900);
      }
    });
  }

  window.initSonicTopographyPreset = function () {
    ensureState();
  };
  window.updateSonicTopographyLayer = update;
  window.isSonicTopographyPresetActive = isActive;
  window.addSonicTopographyRipple = addRipple;
  window.spawnSonicTopographyMeteor = spawnMeteor;
})();
