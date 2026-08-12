(function initializePetParticleOrb(global) {
  'use strict';

  if (global.FeMonsterPetParticleOrb) return;

  const document = global.document;
  const root = document?.getElementById?.('petAssistant');
  const canvas = document?.getElementById?.('petAssistantParticleOrb');
  const character = document?.getElementById?.('petAssistantCharacter');
  const replyAudio = document?.getElementById?.('petAssistantAudio');
  if (!root || !canvas || !character) return;

  // Keep the dense lavender lattice reconstructed from the reference video.
  // Silence resolves to a true sphere; real audio adds bounded radial waves so
  // the companion remains alive without reverting to a permanent rounded cube.
  const SURFACE_PROFILE = 'lavender-audio-reactive-sphere-v1';
  const LATITUDE_COUNT = 64;
  const LONGITUDE_COUNT = 128;
  const PARTICLE_COUNT = LATITUDE_COUNT * LONGITUDE_COUNT;
  const FALLBACK_POINT_STRIDE = 8;
  const SPHERE_BREATH_FREQUENCY_HZ = 0.36;
  const SPHERE_BASE_RADIUS = 0.82;
  const FALLBACK_RADIUS_SCALE = 0.38;
  const LOW_SURFACE_RESPONSE = 0.13;
  const MID_SURFACE_RESPONSE = 0.105;
  const HIGH_SURFACE_RESPONSE = 0.12;
  const AUDIO_RESPONSE_EXPONENT = 0.52;
  const DEFAULT_RENDER_STEP_MS = 1000 / 60;
  const VISIBLE_FRAME_INTERVAL_MS = DEFAULT_RENDER_STEP_MS;
  const REDUCED_FRAME_INTERVAL_MS = 1000 / 8;
  const PROGRAM_SAMPLE_INTERVAL_MS = 1000 / 30;
  const EMOTION_COLOR_TIME_CONSTANT_MS = 900;
  // Low-DPI desktop windows receive bounded supersampling; otherwise a pearl
  // smaller than four CSS pixels can only become a jagged 3x3/4x4 stamp.
  // Native 150/200% displays stay at their real scale and the cap prevents an
  // accidental high-DPI framebuffer from becoming a performance trap.
  const DPR_FLOOR = 1.5;
  const DPR_LIMIT = 2;
  const AMBIENT_EMISSION_FLOOR = 0.818;
  const reducedMotionQuery = global.matchMedia?.('(prefers-reduced-motion: reduce)') || null;

  // A deliberately small, fixed palette gives the companion an emotional
  // identity without turning it into a cycling RGB effect. The pearl-white
  // core remains in the shader; these colors only tint the body and aura.
  const EMOTION_PALETTE = Object.freeze([
    Object.freeze([0.62, 0.72, 1.00]),
    Object.freeze([0.73, 0.80, 1.00]),
    Object.freeze([0.84, 0.98, 1.00]),
    Object.freeze([0.66, 1.00, 0.90]),
    Object.freeze([1.00, 0.72, 0.93])
  ]);
  const SEVEN_EMOTION_PALETTE = Object.freeze({
    joy: Object.freeze([1.00, 0.82, 0.38]),
    anger: Object.freeze([1.00, 0.28, 0.20]),
    sorrow: Object.freeze([0.36, 0.56, 1.00]),
    fear: Object.freeze([0.68, 0.42, 1.00]),
    love: Object.freeze([1.00, 0.48, 0.78]),
    disgust: Object.freeze([0.40, 0.86, 0.48]),
    desire: Object.freeze([1.00, 0.58, 0.18])
  });

  const runtime = {
    mode: 'uninitialized',
    renderer: null,
    scene: null,
    camera: null,
    points: null,
    material: null,
    fallbackContext: null,
    fallbackPoints: null,
    fallbackProjected: null,
    width: 0,
    height: 0,
    dpr: 1,
    running: false,
    disposed: false,
    rafId: 0,
    lastFrameAt: 0,
    lastProgramSampleAt: 0,
    elapsed: 0,
    reducedMotion: reducedMotionQuery?.matches === true,
    nativeVisible: true,
    stateName: String(root.dataset.state || 'idle'),
    behavior: String(root.dataset.petBehavior || 'rest'),
    reaction: String(root.dataset.petReaction || ''),
    reactionChangedAt: 0,
    liveConversationActive: root.dataset.liveConversation === 'active',
    liveGlow: 0,
    liveGlowTarget: 0,
    livePulse: 0,
    emotionMood: 3,
    emotionEnergy: 3,
    emotionPrimary: 'joy',
    emotionIntensity: 0.4,
    emotionMotion: 'lift',
    emotionEnergySmoothed: 0.5,
    emotionColor: [0.84, 0.98, 1.00],
    emotionColorTarget: [0.84, 0.98, 1.00],
    emotionMix: 0.18,
    emotionMixTarget: 0.18,
    emissionTarget: AMBIENT_EMISSION_FLOOR,
    replyAudioActive: false,
    programPlaying: false,
    audioContext: null,
    audioSource: null,
    analyser: null,
    frequencyData: null,
    analyserUnavailable: false,
    audioSetupPromise: null,
    audioResumeBlocked: false,
    analysisSink: null,
    audioSourceMode: '',
    bands: { low: 0, mid: 0, high: 0, energy: 0 },
    targets: { low: 0, mid: 0, high: 0, energy: 0 },
    resizeObserver: null,
    rootObserver: null,
    usesWindowResize: false,
    reducedMotionListenerMode: ''
  };

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

  function normalizedEmotionLevel(value, fallback = 3) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.min(5, Math.round(numeric))) : fallback;
  }

  function syncEmotionSnapshot(value) {
    let snapshot = value;
    if (!snapshot) {
      try { snapshot = global.FeMonsterPetEmotionRuntime?.snapshot?.() || null; } catch (_) { snapshot = null; }
    }
    const mood = normalizedEmotionLevel(snapshot?.mood, runtime.emotionMood);
    const energy = normalizedEmotionLevel(snapshot?.energy, runtime.emotionEnergy);
    const primary = String(snapshot?.sevenEmotions?.primary || '').trim().toLowerCase();
    const intensity = clamp(snapshot?.sevenEmotions?.intensity, 0.01, 1);
    const target = SEVEN_EMOTION_PALETTE[primary]
      || EMOTION_PALETTE[mood - 1]
      || EMOTION_PALETTE[2];
    const normalizedEnergy = (energy - 1) / 4;
    runtime.emotionMood = mood;
    runtime.emotionEnergy = energy;
    runtime.emotionPrimary = SEVEN_EMOTION_PALETTE[primary] ? primary : 'joy';
    runtime.emotionIntensity = intensity;
    runtime.emotionMotion = String(snapshot?.motion || 'lift').trim().toLowerCase();
    runtime.emotionColorTarget[0] = target[0];
    runtime.emotionColorTarget[1] = target[1];
    runtime.emotionColorTarget[2] = target[2];
    runtime.emotionMixTarget = clamp(
      0.15 + intensity * 0.16 + Math.abs(mood - 3) * 0.035 + normalizedEnergy * 0.045,
      0.17,
      0.43
    );

    root.dataset.petMood = String(mood);
    root.dataset.petEmotionEnergy = String(energy);
    root.dataset.petEmotion = runtime.emotionPrimary;
    root.dataset.petEmotionMotion = runtime.emotionMotion;
    root.dataset.petEmotionIntensity = intensity.toFixed(2);
    const red = Math.round(target[0] * 255);
    const green = Math.round(target[1] * 255);
    const blue = Math.round(target[2] * 255);
    root.style?.setProperty?.('--pet-particle-emotion-rgb', `${red}, ${green}, ${blue}`);
    root.style?.setProperty?.('--pet-particle-emotion-color', `rgb(${red} ${green} ${blue})`);
    root.style?.setProperty?.('--pet-particle-emotion-strength', runtime.emotionMixTarget.toFixed(3));
  }

  function syncLiveConversation() {
    runtime.liveConversationActive = root.dataset.liveConversation === 'active';
    root.style?.setProperty?.('--pet-live-glow-strength', runtime.liveConversationActive ? '1' : '0');
  }

  function normalizedBehavior(value) {
    const behavior = String(value || '').trim().toLowerCase();
    return behavior === 'groove' || behavior === 'night-yawn' ? behavior : 'rest';
  }

  function normalizedReaction(value) {
    const reaction = String(value || '').trim().toLowerCase();
    return reaction === 'eye-roll' ? reaction : '';
  }

  function rootIsVisible() {
    const nativeDesktop = document.documentElement?.getAttribute?.('data-fe-client') === 'desktop-pet';
    return !runtime.disposed
      && document.visibilityState !== 'hidden'
      && root.hidden !== true
      && character.hidden !== true
      && (!nativeDesktop || runtime.nativeVisible)
      && root.isConnected !== false;
  }

  function particlePositions() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const surfaceUvs = new Float32Array(PARTICLE_COUNT * 2);
    const bands = new Float32Array(PARTICLE_COUNT);
    let cursor = 0;
    for (let latitude = 0; latitude < LATITUDE_COUNT; latitude += 1) {
      const v = (latitude + 0.5) / LATITUDE_COUNT;
      const elevation = (0.5 - v) * Math.PI;
      const y = Math.sin(elevation);
      const ringRadius = Math.cos(elevation);
      const ringOffset = (latitude & 1) * 0.5;
      for (let longitude = 0; longitude < LONGITUDE_COUNT; longitude += 1) {
        const u = (longitude + ringOffset) / LONGITUDE_COUNT;
        const phi = u * Math.PI * 2;
        positions[cursor * 3] = Math.cos(phi) * ringRadius;
        positions[cursor * 3 + 1] = y;
        positions[cursor * 3 + 2] = Math.sin(phi) * ringRadius;
        surfaceUvs[cursor * 2] = u;
        surfaceUvs[cursor * 2 + 1] = v;
        bands[cursor] = v;
        cursor += 1;
      }
    }
    return { positions, surfaceUvs, bands };
  }

  function vertexShader() {
    return `
      precision highp float;
      uniform float uTime;
      uniform float uLow;
      uniform float uMid;
      uniform float uHigh;
      uniform float uEnergy;
      uniform float uEmission;
      uniform float uLiveGlow;
      uniform float uLivePulse;
      uniform float uEmotionEnergy;
      uniform float uPixelRatio;
      uniform float uReducedMotion;
      attribute vec2 aSurfaceUv;
      attribute float aBand;
      varying float vLight;
      varying float vBand;
      varying float vEnergy;
      varying float vDepth;
      varying float vTwinkle;
      varying float vEmission;

      float perceptualBand(float value) {
        return pow(clamp(value, 0.0, 1.0), ${AUDIO_RESPONSE_EXPONENT});
      }

      float audioSurfaceDisplacement(vec3 direction, float time) {
        float azimuth = atan(direction.z, direction.x);
        float elevation = asin(clamp(direction.y, -1.0, 1.0));
        float lowWave = sin(azimuth * 2.0 - time * 2.35) * cos(elevation * 0.82);
        float midWave = sin(azimuth * 5.0 + elevation * 3.0 - time * 4.45) * 0.74
          + cos(elevation * 4.0 + time * 3.10) * 0.26;
        float highWave = sin(azimuth * 11.0 - elevation * 8.0 + time * 8.60);
        float displacement = lowWave * perceptualBand(uLow) * ${LOW_SURFACE_RESPONSE}
          + midWave * perceptualBand(uMid) * ${MID_SURFACE_RESPONSE}
          + highWave * perceptualBand(uHigh) * ${HIGH_SURFACE_RESPONSE};
        return clamp(displacement, -0.20, 0.20);
      }

      vec3 sphericalSurfacePosition(vec3 direction, float time) {
        const float tau = 6.28318530718;
        float breath = (
          sin(time * tau * ${SPHERE_BREATH_FREQUENCY_HZ} + 0.42) * 0.012
          + sin(time * tau * 0.11 - 1.12) * 0.006
        ) * (1.0 - uReducedMotion);
        float audioBreath = uLow * 0.006
          + uMid * 0.003
          + uEnergy * 0.003
          + uLiveGlow * uLivePulse * 0.003
          + uEmotionEnergy * 0.002;
        float radialMotion = audioSurfaceDisplacement(direction, time)
          * mix(1.0, 0.15, uReducedMotion);
        float radius = ${SPHERE_BASE_RADIUS} * (1.0 + breath + audioBreath + radialMotion);
        return direction * radius;
      }

      void main() {
        vec3 direction = normalize(position);
        float time = uTime * mix(1.0, 0.08, uReducedMotion);
        vec3 deformed = sphericalSurfacePosition(direction, time);
        float azimuth = atan(direction.z, direction.x);
        float elevation = asin(clamp(direction.y, -1.0, 1.0));
        float lowWeight = (0.72 + (1.0 - aBand) * 0.28);
        float midWeight = (0.68 + (1.0 - abs(aBand - 0.5) * 2.0) * 0.32);
        float highWeight = (0.76 + aBand * 0.24);
        float highRipple = sin(azimuth * 10.0 - elevation * 8.0 + time * 3.7);
        float highDrive = perceptualBand(uHigh);

        vec4 modelPosition = modelMatrix * vec4(deformed, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        gl_Position = projectionMatrix * viewPosition;
        float perspective = 4.0 / max(1.2, -viewPosition.z);
        float twinkle = 0.5 + 0.5 * sin(
          time * 1.37 + aSurfaceUv.x * 12.56637061436 + aSurfaceUv.y * 9.42477796077
        );
        vDepth = clamp(0.5 + modelPosition.z * 0.48, 0.0, 1.0);
        float depthSize = mix(0.82, 1.10, vDepth);
        gl_PointSize = (2.88
          + highDrive * 0.86
          + uEnergy * 0.10
          + uLiveGlow * (0.23 + uLivePulse * 0.10 + uEmotionEnergy * 0.035))
          * uPixelRatio * perspective * depthSize;

        vLight = clamp(
          0.56 + direction.z * 0.23 + direction.y * 0.09
          + uLow * lowWeight * 0.035
          + uMid * midWeight * 0.050
          + highRipple * uHigh * highWeight * 0.18,
          0.28,
          1.0
        );
        vBand = aBand;
        vEnergy = uEnergy;
        vTwinkle = twinkle;
        // Every point remains self-lit at rest. Voice energy brightens the
        // pearl core while high frequencies selectively excite its halo.
        vEmission = clamp(
          uEmission
            + uEnergy * 0.24
            + highDrive * 0.34
            + uLiveGlow * (0.28 + uLivePulse * 0.15),
          0.0,
          1.45
        );
      }
    `;
  }

  function fragmentShader() {
    return `
      precision highp float;
      varying float vLight;
      varying float vBand;
      varying float vEnergy;
      varying float vDepth;
      varying float vTwinkle;
      varying float vEmission;
      uniform float uMoodR;
      uniform float uMoodG;
      uniform float uMoodB;
      uniform float uMoodMix;
      uniform float uLiveGlow;
      uniform float uLivePulse;
      uniform float uPixelRatio;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(centered);
        float signedDistance = distanceToCenter - 0.5;
        // Screen-space derivatives give every Windows scale one physical
        // coverage transition. Unlike fixed smoothstep bands, this remains a
        // round analytic splat when the point center lands between pixels.
        float antiAlias = clamp(fwidth(signedDistance) * 0.48, 0.016, 0.128);
        float edge = 1.0 - smoothstep(-antiAlias, antiAlias, signedDistance);
        if (edge <= 0.001) discard;

        float normalizedRadius = clamp(distanceToCenter * 2.0, 0.0, 1.0);
        float normalizedRadiusSquared = dot(centered * 2.0, centered * 2.0);
        // Continuous finite Gaussians replace the old stack of pixel-sized
        // rings. The point remains a pearl—not a foggy bloom—but its body and
        // aura now taper without visible 1px terraces.
        float gaussianKernel = exp(-normalizedRadiusSquared * 2.55);
        float core = exp(-normalizedRadiusSquared * 8.4);
        float innerAura = exp(-normalizedRadiusSquared * 4.2);
        float halo = exp(-normalizedRadiusSquared * 1.72) * (1.0 - core * 0.42);
        float ambientAura = exp(-normalizedRadiusSquared * 2.05);
        float pearlBody = 0.70 + gaussianKernel * 0.30;
        float liveOuterAura = exp(-normalizedRadiusSquared * 1.58);
        float liveInnerCore = exp(-normalizedRadiusSquared * 5.6);
        float pearlOutline = edge * pow(normalizedRadius, 2.2) * (1.0 - core);
        float pearlRim = edge * pow(normalizedRadius, 1.65) * (0.62 + gaussianKernel * 0.38);
        float sphereZ = sqrt(max(0.0, 1.0 - dot(centered * 2.0, centered * 2.0)));
        vec3 pearlNormal = normalize(vec3(-centered.x * 1.65, centered.y * 1.65, sphereZ));
        float pearlHighlight = pow(max(dot(pearlNormal, normalize(vec3(-0.42, 0.58, 0.70))), 0.0), 15.5);
        vec2 highlightOffset = centered - vec2(-0.105, 0.120);
        float pinpointHighlight = exp(-dot(highlightOffset, highlightOffset) * 142.0);
        float fresnel = pow(1.0 - sphereZ, 2.8);
        float depthGlow = mix(0.48, 1.0, smoothstep(0.04, 0.96, vDepth));
        float emission = clamp(vEmission, 0.0, 1.45);
        float ambientEmission = max(0.64, min(emission, 1.0));

        // Measured from the clearest source frames: shadow #8F88AC, body
        // #C3BADB-#CFC3E3 and near-white highlight #EEE2FE. Emotion remains a thin
        // material tint instead of replacing the Bailongma lavender surface.
        vec3 surfaceShadow = vec3(0.5608, 0.5333, 0.6745); // #8F88AC
        vec3 surfaceCore = vec3(0.7882, 0.7451, 0.8745);   // #C9BEDF
        vec3 surfaceHighlight = vec3(0.9333, 0.8863, 0.9961); // #EEE2FE
        vec3 specularWhite = vec3(1.0, 0.9569, 1.0);       // #FFF4FF
        vec3 pearlWhite = surfaceHighlight;
        vec3 lavender = surfaceCore;
        vec3 moodTint = vec3(uMoodR, uMoodG, uMoodB);
        // The seven-emotion palette is already explicit. Do not reinterpret
        // warm colors as magenta here: that old heuristic turned default joy
        // pink and erased the measured lavender identity.
        float expressiveMood = 0.0;
        vec3 expressiveTint = moodTint;
        float surfaceLight = clamp(0.36 + vLight * 0.58 + core * 0.14, 0.0, 1.0);
        vec3 measuredSurface = mix(surfaceShadow, surfaceCore, surfaceLight);
        measuredSurface = mix(measuredSurface, surfaceHighlight, pearlHighlight * 0.30 + core * 0.12);
        // Chat emotion colors the rim and outer body, while the measured
        // lavender identity remains recognizable in all seven emotions.
        float bodyMoodMix = clamp(
          uMoodMix * (0.42 + expressiveMood * 0.16) * (1.0 - core * 0.82),
          0.0,
          0.10
        );
        vec3 pearlColor = mix(measuredSurface, expressiveTint, bodyMoodMix);
        pearlColor *= 0.95 + pearlHighlight * 0.10;

        // The warm core is true emissive shading: it does not depend on the
        // simulated surface light and remains visible on the far side.
        vec3 emissiveCore = surfaceHighlight * core * emission * (0.22 + innerAura * 0.18);
        vec3 iridescentRim = lavender * (pearlRim * (0.040 + fresnel * 0.058));
        vec3 separatedOutline = mix(lavender, expressiveTint, 0.20)
          * pearlOutline * (0.105 + ambientEmission * 0.052);
        vec3 thinHalo = mix(lavender, expressiveTint, 0.16)
          * halo
          * (0.010 + emission * 0.018 + vTwinkle * vEnergy * 0.005);
        vec3 ambientGlow = mix(surfaceCore, expressiveTint, 0.12)
          * ambientAura * ambientEmission * (0.010 + vTwinkle * 0.002);
        vec3 color = pearlColor * pearlBody;
        color += emissiveCore + iridescentRim + separatedOutline + thinHalo + ambientGlow;
        color += specularWhite * pinpointHighlight * (0.17 + emission * 0.085);

        // Realtime conversation energizes two finite layers inside each point
        // sprite. It never adds a fullscreen blur or a second draw call, so
        // the deliberate transparent gaps between particles remain visible.
        vec3 liveTint = mix(pearlWhite, expressiveTint, 0.34);
        vec3 liveInnerTint = mix(pearlWhite, expressiveTint, 0.16);
        float liveGain = uLiveGlow * (0.58 + uLivePulse * 0.24);
        color += liveTint * liveOuterAura * liveGain * 0.082;
        color += liveInnerTint * liveInnerCore * liveGain * 0.128;
        color += pearlWhite * core * uLiveGlow * (0.060 + uLivePulse * 0.030);

        float haloAlpha = halo * (0.006 + emission * 0.008)
          + ambientAura * ambientEmission * 0.003
          + liveOuterAura * uLiveGlow * (0.0035 + uLivePulse * 0.0015);
        float bodyAlpha = pearlBody * (0.79 + core * 0.18 + pearlHighlight * 0.025)
          + pearlOutline * 0.034;
        float alpha = edge * (bodyAlpha + haloAlpha) * depthGlow;
        gl_FragColor = vec4(color, alpha);
      }
    `;
  }

  function createWebGlRuntime() {
    const THREE = global.THREE;
    if (!THREE?.WebGLRenderer || !THREE?.Points) return false;
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setClearAlpha(0);
      renderer.autoClear = true;
      if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.set(0, 0, 4.3);

      const source = particlePositions();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(source.positions, 3));
      geometry.setAttribute('aSurfaceUv', new THREE.BufferAttribute(source.surfaceUvs, 2));
      geometry.setAttribute('aBand', new THREE.BufferAttribute(source.bands, 1));
      geometry.computeBoundingSphere();

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uLow: { value: 0 },
          uMid: { value: 0 },
          uHigh: { value: 0 },
          uEnergy: { value: 0 },
          uEmission: { value: AMBIENT_EMISSION_FLOOR },
          uLiveGlow: { value: 0 },
          uLivePulse: { value: 0 },
          uEmotionEnergy: { value: 0.5 },
          uMoodR: { value: runtime.emotionColor[0] },
          uMoodG: { value: runtime.emotionColor[1] },
          uMoodB: { value: runtime.emotionColor[2] },
          uMoodMix: { value: runtime.emotionMix },
          uPixelRatio: { value: 1 },
          uReducedMotion: { value: runtime.reducedMotion ? 1 : 0 }
        },
        vertexShader: vertexShader(),
        fragmentShader: fragmentShader(),
        extensions: { derivatives: true },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: false
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);

      runtime.renderer = renderer;
      runtime.scene = scene;
      runtime.camera = camera;
      runtime.points = points;
      runtime.material = material;
      runtime.mode = 'webgl';
      canvas.dataset.renderer = 'webgl';
      return true;
    } catch (_) {
      runtime.mode = 'fallback';
      return false;
    }
  }

  function createFallbackRuntime() {
    runtime.fallbackContext = canvas.getContext?.('2d', { alpha: true }) || null;
    const source = particlePositions().positions;
    runtime.fallbackPoints = source;
    runtime.fallbackProjected = new Float32Array(PARTICLE_COUNT * 3);
    runtime.mode = runtime.fallbackContext ? 'canvas-2d' : 'unavailable';
    canvas.dataset.renderer = runtime.mode;
  }

  function resize() {
    const bounds = character.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || 168));
    const height = Math.max(1, Math.round(bounds.height || 184));
    const dpr = Math.min(DPR_LIMIT, Math.max(DPR_FLOOR, Number(global.devicePixelRatio) || 1));
    if (width === runtime.width && height === runtime.height && dpr === runtime.dpr) return;
    runtime.width = width;
    runtime.height = height;
    runtime.dpr = dpr;
    if (runtime.renderer) {
      runtime.renderer.setPixelRatio(dpr);
      runtime.renderer.setSize(width, height, false);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
      runtime.material.uniforms.uPixelRatio.value = dpr;
    } else if (runtime.fallbackContext) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    }
  }

  function averageBand(data, sampleRate, minimumHz, maximumHz) {
    if (!data?.length || !sampleRate) return 0;
    const nyquist = sampleRate / 2;
    const start = Math.max(0, Math.floor((minimumHz / nyquist) * data.length));
    const end = Math.min(data.length - 1, Math.ceil((maximumHz / nyquist) * data.length));
    let sum = 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
      const value = data[index] / 255;
      sum += value * value;
      count += 1;
    }
    return count ? Math.sqrt(sum / count) : 0;
  }

  function closeUnusedAudioContext(context) {
    if (!context || runtime.audioContext !== context) return;
    runtime.audioContext = null;
    runtime.audioSetupPromise = null;
    runtime.audioResumeBlocked = true;
    runtime.analyserUnavailable = true;
    context.close?.().catch?.(() => {});
    if (runtime.stateName === 'speaking' || runtime.stateName === 'listening' || runtime.stateName === 'transcribing') {
      root.dataset.particleAudio = 'state-fallback';
    }
  }

  function replyCaptureStream() {
    const capture = replyAudio?.captureStream || replyAudio?.mozCaptureStream;
    if (typeof capture !== 'function') return null;
    try {
      const stream = capture.call(replyAudio);
      return stream?.getAudioTracks?.().length ? stream : null;
    } catch (_) {
      return null;
    }
  }

  function attachReplyAnalyser(context) {
    if (!context || context !== runtime.audioContext || context.state !== 'running' || runtime.disposed) return false;
    const stream = replyCaptureStream();
    if (!stream || typeof context.createMediaStreamSource !== 'function') {
      // MediaElementAudioSourceNode takes ownership of the element's audible
      // output. A visual analyser must never be allowed to reroute or silence
      // the desktop pet's TTS, so unsupported capture falls back to animation.
      closeUnusedAudioContext(context);
      return false;
    }
    let source = null;
    let analyser = null;
    let sink = null;
    try {
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      sink = context.createGain();
      sink.gain.value = 0;
      analyser.connect(sink);
      sink.connect(context.destination);

      source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      runtime.audioSource = source;
      runtime.audioSourceMode = 'capture-stream';
      runtime.analyser = analyser;
      runtime.analysisSink = sink;
      runtime.frequencyData = new Uint8Array(analyser.frequencyBinCount);
      runtime.audioResumeBlocked = false;
      return true;
    } catch (_) {
      analyser?.disconnect?.();
      sink?.disconnect?.();
      source?.disconnect?.();
      closeUnusedAudioContext(context);
      return false;
    }
  }

  function resumeBeforeAttaching(context) {
    if (!context || runtime.audioSetupPromise || runtime.disposed) return;
    let resumeResult;
    try {
      resumeResult = context.resume?.();
    } catch (_) {
      closeUnusedAudioContext(context);
      return;
    }
    runtime.audioSetupPromise = Promise.resolve(resumeResult).then(() => {
      if (runtime.audioContext !== context || runtime.disposed) return;
      runtime.audioSetupPromise = null;
      if (context.state === 'running') attachReplyAnalyser(context);
      else closeUnusedAudioContext(context);
    }).catch(() => {
      closeUnusedAudioContext(context);
    });
  }

  function ensureReplyAnalyser() {
    if (!replyAudio || runtime.analyserUnavailable) return Boolean(runtime.analyser);
    if (runtime.analyser) return true;
    const AudioContext = global.AudioContext || global.webkitAudioContext;
    if (!AudioContext) {
      runtime.analyserUnavailable = true;
      return false;
    }
    if (!runtime.audioContext) {
      try {
        runtime.audioContext = new AudioContext();
      } catch (_) {
        runtime.analyserUnavailable = true;
        return false;
      }
    }
    if (runtime.audioContext.state === 'running') return attachReplyAnalyser(runtime.audioContext);
    if (runtime.audioContext.state === 'closed') {
      closeUnusedAudioContext(runtime.audioContext);
      return false;
    }
    resumeBeforeAttaching(runtime.audioContext);
    return false;
  }

  function resumeAttachedAudioContext() {
    const context = runtime.audioContext;
    if (!context || context.state === 'running' || context.state === 'closed') return;
    let resumeResult;
    try {
      resumeResult = context.resume?.();
    } catch (_) {
      runtime.audioResumeBlocked = true;
      return;
    }
    Promise.resolve(resumeResult).then(() => {
      runtime.audioResumeBlocked = context.state !== 'running';
    }).catch(() => {
      runtime.audioResumeBlocked = true;
    });
  }

  function sampleReplyAudio() {
    runtime.replyAudioActive = Boolean(replyAudio && !replyAudio.paused && !replyAudio.ended && replyAudio.currentSrc);
    if (!runtime.replyAudioActive || !ensureReplyAnalyser()) return null;
    if (runtime.audioContext?.state !== 'running') {
      resumeAttachedAudioContext();
      return null;
    }
    runtime.analyser.getByteFrequencyData(runtime.frequencyData);
    const sampleRate = runtime.audioContext?.sampleRate || 44100;
    const low = averageBand(runtime.frequencyData, sampleRate, 45, 260);
    const mid = averageBand(runtime.frequencyData, sampleRate, 260, 2400);
    const high = averageBand(runtime.frequencyData, sampleRate, 2400, 9000);
    return {
      low: clamp(Math.pow(low, 0.82) * 1.32),
      mid: clamp(Math.pow(mid, 0.84) * 1.42),
      high: clamp(Math.pow(high, 0.78) * 1.62),
      energy: clamp(low * 0.34 + mid * 0.48 + high * 0.28)
    };
  }

  function sampleProgramAudio(now) {
    if (now - runtime.lastProgramSampleAt < PROGRAM_SAMPLE_INTERVAL_MS) return null;
    runtime.lastProgramSampleAt = now;
    let snapshot = null;
    try { snapshot = global.FeMonsterPetActionBridge?.snapshot?.() || null; } catch (_) { snapshot = null; }
    runtime.programPlaying = snapshot?.playing === true;
    if (!runtime.programPlaying) return { low: 0, mid: 0, high: 0, energy: 0 };
    const energy = clamp(snapshot.energy);
    return {
      low: clamp(snapshot.bass),
      mid: clamp(Number.isFinite(Number(snapshot.mid)) ? snapshot.mid : energy * 0.62),
      high: clamp(Number.isFinite(Number(snapshot.treble)) ? snapshot.treble : Math.max(snapshot.beat || 0, energy * 0.38)),
      energy
    };
  }

  function updateTargets(now) {
    const program = sampleProgramAudio(now);
    if (program) Object.assign(runtime.targets, program);
    if (runtime.behavior === 'groove' && runtime.programPlaying) {
      const groovePulse = 0.5 + Math.sin(now * 0.0048) * 0.5;
      runtime.targets.low = Math.max(runtime.targets.low, 0.16 + groovePulse * 0.12);
      runtime.targets.mid = Math.max(runtime.targets.mid, 0.12 + (1 - groovePulse) * 0.09);
      runtime.targets.energy = Math.max(runtime.targets.energy, 0.18 + groovePulse * 0.10);
    } else if (runtime.behavior === 'night-yawn' && !runtime.replyAudioActive) {
      const sleepyBreath = 0.5 + Math.sin(now * 0.00135) * 0.5;
      runtime.targets.low = Math.max(runtime.targets.low, 0.035 + sleepyBreath * 0.025);
      runtime.targets.mid = Math.max(runtime.targets.mid, 0.025 + sleepyBreath * 0.02);
      runtime.targets.energy = Math.max(runtime.targets.energy, 0.045 + sleepyBreath * 0.025);
    }
    const reply = sampleReplyAudio();
    if (reply) {
      runtime.targets.low = Math.max(runtime.targets.low * 0.52, reply.low);
      runtime.targets.mid = Math.max(runtime.targets.mid * 0.45, reply.mid);
      runtime.targets.high = Math.max(runtime.targets.high * 0.38, reply.high);
      runtime.targets.energy = Math.max(runtime.targets.energy * 0.5, reply.energy);
      root.dataset.particleAudio = 'reply';
      return;
    }
    const speaking = runtime.stateName === 'speaking' || runtime.stateName === 'listening' || runtime.stateName === 'transcribing';
    if (speaking && (runtime.analyserUnavailable || runtime.audioSetupPromise || runtime.audioResumeBlocked)) {
      const talkPulse = 0.5 + Math.sin(now * 0.011) * 0.5;
      runtime.targets.low = Math.max(runtime.targets.low, 0.18 + talkPulse * 0.16);
      runtime.targets.mid = Math.max(runtime.targets.mid, 0.28 + talkPulse * 0.28);
      runtime.targets.high = Math.max(runtime.targets.high, 0.16 + (1 - talkPulse) * 0.22);
      runtime.targets.energy = Math.max(runtime.targets.energy, 0.32 + talkPulse * 0.22);
      root.dataset.particleAudio = 'state-fallback';
    } else {
      root.dataset.particleAudio = runtime.programPlaying ? 'program' : 'idle';
    }
  }

  function smoothBand(name, elapsedMs) {
    const current = runtime.bands[name];
    const target = runtime.targets[name];
    const timeConstant = target > current ? 64 : 260;
    const response = 1 - Math.exp(-Math.max(1, elapsedMs) / timeConstant);
    runtime.bands[name] += (target - current) * response;
    if (runtime.bands[name] < 0.0005 && target === 0) runtime.bands[name] = 0;
  }

  function liveStateIntensity() {
    if (!runtime.liveConversationActive) return 0;
    if (runtime.stateName === 'speaking') return 1;
    if (runtime.stateName === 'listening') return 0.92;
    if (runtime.stateName === 'transcribing') return 0.84;
    if (runtime.stateName === 'thinking') return 0.78;
    return 0.72;
  }

  function smoothAppearance(elapsedMs) {
    // renderOnce() is also used by the native desktop host and tests. Read the
    // canonical flag here so ending realtime starts fading on the very next
    // rendered frame, without waiting for a MutationObserver microtask.
    runtime.liveConversationActive = root.dataset.liveConversation === 'active';
    runtime.liveGlowTarget = liveStateIntensity();
    const liveTimeConstant = runtime.liveGlowTarget > runtime.liveGlow ? 165 : 430;
    const liveResponse = 1 - Math.exp(-Math.max(1, elapsedMs) / liveTimeConstant);
    runtime.liveGlow += (runtime.liveGlowTarget - runtime.liveGlow) * liveResponse;

    const emotionResponse = 1 - Math.exp(-Math.max(1, elapsedMs) / EMOTION_COLOR_TIME_CONSTANT_MS);
    for (let channel = 0; channel < 3; channel += 1) {
      runtime.emotionColor[channel] += (
        runtime.emotionColorTarget[channel] - runtime.emotionColor[channel]
      ) * emotionResponse;
    }
    runtime.emotionMix += (runtime.emotionMixTarget - runtime.emotionMix) * emotionResponse;
    const emotionEnergyTarget = clamp(
      ((runtime.emotionEnergy - 1) / 4) * 0.68 + runtime.emotionIntensity * 0.32,
      0,
      1
    );
    runtime.emotionEnergySmoothed += (emotionEnergyTarget - runtime.emotionEnergySmoothed) * emotionResponse;

    const stateRate = runtime.stateName === 'speaking'
      ? 4.7
      : runtime.stateName === 'listening'
        ? 2.45
        : runtime.stateName === 'thinking'
          ? 1.15
          : 1.85;
    const pulseDepth = runtime.reducedMotion
      ? 0
      : 0.075 + runtime.emotionEnergySmoothed * 0.045 + runtime.bands.energy * 0.085;
    const pulseWave = Math.sin(runtime.elapsed * stateRate);
    runtime.livePulse = runtime.liveGlow * clamp(
      0.66 + pulseWave * pulseDepth + runtime.bands.energy * 0.15,
      0.50,
      0.96
    );
  }

  function drawFallback(now) {
    const context = runtime.fallbackContext;
    const source = runtime.fallbackPoints;
    const projected = runtime.fallbackProjected;
    if (!context || !source || !projected) return;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * FALLBACK_RADIUS_SCALE;
    const time = runtime.reducedMotion ? 0 : runtime.elapsed;
    const perceptualBand = (value) => Math.pow(clamp(value), AUDIO_RESPONSE_EXPONENT);
    const breath = runtime.reducedMotion
      ? 0
      : Math.sin(time * Math.PI * 2 * SPHERE_BREATH_FREQUENCY_HZ + 0.42) * 0.012
        + Math.sin(time * Math.PI * 2 * 0.11 - 1.12) * 0.006;
    const uniformRadius = 1
      + breath
      + runtime.bands.low * 0.006
      + runtime.bands.mid * 0.003
      + runtime.bands.energy * 0.003
      + runtime.liveGlow * runtime.livePulse * 0.003
      + runtime.emotionEnergySmoothed * 0.002;
    const midFrequencyOrbit = Math.sin(time * 3.10) * perceptualBand(runtime.bands.mid) * 0.21;
    const highFrequencyTremble = Math.sin(time * 9.40) * perceptualBand(runtime.bands.high) * 0.052;
    const objectRotation = time * 0.105 + midFrequencyOrbit;
    const cosY = Math.cos(objectRotation);
    const sinY = Math.sin(objectRotation);
    const cosZ = Math.cos(highFrequencyTremble);
    const sinZ = Math.sin(highFrequencyTremble);
    context.clearRect(0, 0, width, height);
    // The compatibility renderer samples the same ordered surface at 1024
    // points. WebGL keeps all 8192; this bounded path protects old WebView2
    // machines without turning the fallback into an 8k CPU arc loop.
    const stride = FALLBACK_POINT_STRIDE;
    for (let index = 0; index < PARTICLE_COUNT; index += stride) {
      const offset = index * 3;
      const x = source[offset];
      const y = source[offset + 1];
      const z = source[offset + 2];
      const azimuth = Math.atan2(z, x);
      const elevation = Math.asin(clamp(y, -1, 1));
      const lowWave = Math.sin(azimuth * 2 - time * 2.35) * Math.cos(elevation * 0.82);
      const midWave = Math.sin(azimuth * 5 + elevation * 3 - time * 4.45) * 0.74
        + Math.cos(elevation * 4 + time * 3.10) * 0.26;
      const highWave = Math.sin(azimuth * 11 - elevation * 8 + time * 8.60);
      const audioSurfaceDisplacement = clamp(
        lowWave * perceptualBand(runtime.bands.low) * LOW_SURFACE_RESPONSE
          + midWave * perceptualBand(runtime.bands.mid) * MID_SURFACE_RESPONSE
          + highWave * perceptualBand(runtime.bands.high) * HIGH_SURFACE_RESPONSE,
        -0.20,
        0.20
      ) * (runtime.reducedMotion ? 0.15 : 1);
      const reactiveRadius = uniformRadius * (1 + audioSurfaceDisplacement);
      const rotatedX = x * cosY - z * sinY;
      const rotatedZ = x * sinY + z * cosY;
      const perspective = 0.84 + rotatedZ * 0.12;
      const projectedX = rotatedX * reactiveRadius;
      const projectedY = y * reactiveRadius;
      const pointX = centerX + (projectedX * cosZ - projectedY * sinZ) * radius;
      const pointY = centerY + (projectedX * sinZ + projectedY * cosZ) * radius;
      const pointRadius = Math.max(
        1.08 * runtime.dpr,
        (1.44 + runtime.bands.high * 0.42) * runtime.dpr * perspective
      );
      projected[offset] = pointX;
      projected[offset + 1] = pointY;
      projected[offset + 2] = pointRadius;
    }

    const bodyMoodMix = clamp(runtime.emotionMix * 0.42, 0, 0.18);
    const bodyRed = Math.round((0.7882 + (runtime.emotionColor[0] - 0.7882) * bodyMoodMix) * 255);
    const bodyGreen = Math.round((0.7451 + (runtime.emotionColor[1] - 0.7451) * bodyMoodMix) * 255);
    const bodyBlue = Math.round((0.8745 + (runtime.emotionColor[2] - 0.8745) * bodyMoodMix) * 255);

    context.fillStyle = `rgba(${bodyRed}, ${bodyGreen}, ${bodyBlue}, 1)`;
    // Keep the compatibility renderer to one batched circle per particle.
    // A slightly larger, bright pearl gives it an ambient presence without
    // allocating per-point gradients or painting any backing surface.
    context.globalAlpha = clamp(0.76 + runtime.liveGlow * 0.08, 0.5, 0.88);
    context.beginPath();
    for (let index = 0; index < PARTICLE_COUNT; index += stride) {
      const offset = index * 3;
      context.moveTo?.(projected[offset] + projected[offset + 2], projected[offset + 1]);
      context.arc(projected[offset], projected[offset + 1], projected[offset + 2], 0, Math.PI * 2);
    }
    context.fill();
    context.globalAlpha = 1;
  }

  function renderVisualFrame(now, elapsedMs) {
    updateTargets(now);
    smoothBand('low', elapsedMs);
    smoothBand('mid', elapsedMs);
    smoothBand('high', elapsedMs);
    smoothBand('energy', elapsedMs);
    runtime.elapsed += elapsedMs / 1000;
    smoothAppearance(elapsedMs);

    if (runtime.renderer) {
      const uniforms = runtime.material.uniforms;
      uniforms.uTime.value = runtime.elapsed;
      uniforms.uLow.value = runtime.bands.low;
      uniforms.uMid.value = runtime.bands.mid;
      uniforms.uHigh.value = runtime.bands.high;
      uniforms.uEnergy.value = runtime.bands.energy;
      uniforms.uLiveGlow.value = runtime.liveGlow;
      uniforms.uLivePulse.value = runtime.livePulse;
      uniforms.uEmotionEnergy.value = runtime.emotionEnergySmoothed;
      uniforms.uMoodR.value = runtime.emotionColor[0];
      uniforms.uMoodG.value = runtime.emotionColor[1];
      uniforms.uMoodB.value = runtime.emotionColor[2];
      uniforms.uMoodMix.value = runtime.emotionMix;
      uniforms.uReducedMotion.value = runtime.reducedMotion ? 1 : 0;
      const motionScale = runtime.reducedMotion ? 0 : 1;
      const emotionDrive = runtime.reducedMotion ? 0 : runtime.emotionIntensity;
      const groove = runtime.behavior === 'groove' ? 1 : 0;
      const sleepy = runtime.behavior === 'night-yawn' ? 1 : 0;
      const replyPresence = runtime.replyAudioActive ? 1 : 0;
      const reactionAge = Math.max(0, (now - runtime.reactionChangedAt) / 1000);
      const reactionEnvelope = runtime.reaction === 'eye-roll' && reactionAge < 1.45
        ? Math.sin(clamp(reactionAge / 1.45) * Math.PI)
        : 0;
      const groovePulse = Math.sin(runtime.elapsed * 2.35) * (0.016 + runtime.bands.low * 0.024) * groove;
      const sleepyBreath = Math.sin(runtime.elapsed * 0.72) * 0.018 * sleepy;
      const thinkingLean = runtime.stateName === 'thinking'
        ? Math.sin(runtime.elapsed * 0.94) * 0.032
        : 0;
      const emotionPulse = Math.sin(runtime.elapsed * (
        runtime.emotionMotion === 'tremble' ? 8.4 : runtime.emotionMotion === 'pulse' ? 4.8 : 1.7
      ));
      const emotionSpinBoost = runtime.emotionMotion === 'orbit' ? 0.055 * emotionDrive : 0;
      const emotionTilt = runtime.emotionMotion === 'recoil'
        ? -0.055 * emotionDrive
        : runtime.emotionMotion === 'droop'
          ? 0.045 * emotionDrive
          : 0;
      const emotionTremble = runtime.emotionMotion === 'tremble'
        ? emotionPulse * 0.018 * emotionDrive
        : 0;
      const emotionScale = (runtime.emotionMotion === 'pulse' || runtime.emotionMotion === 'lift')
        ? emotionPulse * 0.012 * emotionDrive
        : runtime.emotionMotion === 'reach'
          ? emotionPulse * 0.008 * emotionDrive
          : 0;
      const lowFrequencyPulse = Math.pow(runtime.bands.low, AUDIO_RESPONSE_EXPONENT) * (
        0.018 + (0.5 + Math.sin(runtime.elapsed * 5.4) * 0.5) * 0.026
      );
      const midFrequencyOrbit = Math.sin(runtime.elapsed * 3.10)
        * Math.pow(runtime.bands.mid, AUDIO_RESPONSE_EXPONENT) * 0.21;
      const highFrequencyTremble = Math.sin(runtime.elapsed * 9.40)
        * Math.pow(runtime.bands.high, AUDIO_RESPONSE_EXPONENT) * 0.052;
      runtime.emissionTarget = AMBIENT_EMISSION_FLOOR
        + runtime.bands.energy * 0.10
        + replyPresence * 0.08
        + groove * 0.035
        - sleepy * 0.045
        + runtime.liveGlow * (0.28 + runtime.livePulse * 0.12);
      uniforms.uEmission.value = runtime.emissionTarget;
      runtime.points.rotation.y = (
        runtime.elapsed * (0.105 + groove * 0.055 - sleepy * 0.035 + emotionSpinBoost)
        + reactionEnvelope * 0.72
        + midFrequencyOrbit
      ) * motionScale;
      runtime.points.rotation.x = 0.46 + (
        Math.sin(runtime.elapsed * (0.19 + groove * 0.22)) * (0.16 + groove * 0.035)
        + thinkingLean
        + emotionTilt
      ) * motionScale;
      runtime.points.rotation.z = -0.14 + (
        Math.sin(runtime.elapsed * (0.13 + groove * 0.48)) * (0.075 + groove * 0.025)
        - reactionEnvelope * 0.18
        + emotionTremble
        + highFrequencyTremble
      ) * motionScale;
      const baseScale = 1 + groovePulse + sleepyBreath;
      const uniformScale = baseScale + reactionEnvelope * 0.006 + emotionScale * 0.82 + lowFrequencyPulse;
      runtime.points.scale.setScalar(uniformScale);
      runtime.renderer.render(runtime.scene, runtime.camera);
    } else {
      drawFallback(now);
    }
  }

  function activeFrameInterval() {
    if (runtime.reducedMotion) return REDUCED_FRAME_INTERVAL_MS;
    // All visible states share one display-paced cadence. Idle used to be
    // capped at 30 FPS while realtime was uncapped; both made the same gentle
    // motion feel uneven on different refresh-rate displays.
    return VISIBLE_FRAME_INTERVAL_MS;
  }

  function frame(now) {
    runtime.rafId = 0;
    if (!runtime.running || !rootIsVisible()) {
      stop();
      return;
    }
    const interval = activeFrameInterval();
    const firstFrame = runtime.lastFrameAt === 0;
    const elapsed = firstFrame ? DEFAULT_RENDER_STEP_MS : now - runtime.lastFrameAt;
    if (firstFrame || interval === 0 || elapsed >= interval - 1) {
      runtime.lastFrameAt = now;
      renderVisualFrame(now, Math.min(80, elapsed));
    }
    runtime.rafId = global.requestAnimationFrame(frame);
  }

  function start() {
    if (runtime.running || runtime.disposed || !rootIsVisible()) return;
    runtime.running = true;
    runtime.lastFrameAt = 0;
    resize();
    runtime.rafId = global.requestAnimationFrame(frame);
  }

  function stop() {
    runtime.running = false;
    if (runtime.rafId) global.cancelAnimationFrame(runtime.rafId);
    runtime.rafId = 0;
  }

  function syncVisibility() {
    if (rootIsVisible()) start();
    else stop();
  }

  function onStateChanged() {
    runtime.stateName = String(root.dataset.state || 'idle');
    syncLiveConversation();
    const nextBehavior = normalizedBehavior(root.dataset.petBehavior);
    const nextReaction = normalizedReaction(root.dataset.petReaction);
    runtime.behavior = nextBehavior;
    if (nextReaction !== runtime.reaction) {
      runtime.reaction = nextReaction;
      runtime.reactionChangedAt = global.performance?.now?.() || Date.now();
    }
    syncVisibility();
  }

  function onEmotionChanged(event) {
    syncEmotionSnapshot(event?.detail?.snapshot || null);
    start();
  }

  function onReducedMotionChanged(event) {
    runtime.reducedMotion = event.matches === true;
    if (runtime.material) runtime.material.uniforms.uReducedMotion.value = runtime.reducedMotion ? 1 : 0;
    runtime.lastFrameAt = 0;
  }

  function onReplyPlay() {
    runtime.replyAudioActive = true;
    ensureReplyAnalyser();
    start();
  }

  function onReplyStop() {
    runtime.replyAudioActive = false;
  }

  function onNativeVisibility(event) {
    runtime.nativeVisible = event?.detail?.visible !== false;
    syncVisibility();
  }

  function onDocumentVisibilityChanged() {
    if (document.visibilityState === 'hidden') {
      stop();
      if (runtime.rafId) global.cancelAnimationFrame(runtime.rafId);
    } else {
      start();
    }
  }

  function onPageHide(event) {
    if (event.persisted) stop();
    else dispose();
  }

  function onPageShow() {
    if (!runtime.disposed) start();
  }

  function dispose() {
    if (runtime.disposed) return;
    runtime.disposed = true;
    stop();
    runtime.resizeObserver?.disconnect?.();
    runtime.rootObserver?.disconnect?.();
    if (runtime.usesWindowResize) global.removeEventListener('resize', resize);
    replyAudio?.removeEventListener?.('play', onReplyPlay);
    replyAudio?.removeEventListener?.('playing', onReplyPlay);
    replyAudio?.removeEventListener?.('pause', onReplyStop);
    replyAudio?.removeEventListener?.('ended', onReplyStop);
    replyAudio?.removeEventListener?.('emptied', onReplyStop);
    global.removeEventListener('fe-monster-pet-desktop-state', onNativeVisibility);
    global.removeEventListener('fe-monster-pet-emotion-change', onEmotionChanged);
    if (runtime.reducedMotionListenerMode === 'modern') {
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChanged);
    } else if (runtime.reducedMotionListenerMode === 'legacy') {
      reducedMotionQuery?.removeListener?.(onReducedMotionChanged);
    }
    document.removeEventListener('visibilitychange', onDocumentVisibilityChanged);
    global.removeEventListener('pagehide', onPageHide);
    global.removeEventListener('pageshow', onPageShow);
    runtime.points?.geometry?.dispose?.();
    runtime.material?.dispose?.();
    runtime.renderer?.dispose?.();
    runtime.audioSource?.disconnect?.();
    runtime.analyser?.disconnect?.();
    runtime.analysisSink?.disconnect?.();
    const audioContext = runtime.audioContext;
    runtime.audioContext = null;
    runtime.audioSetupPromise = null;
    audioContext?.close?.().catch?.(() => {});
  }

  syncEmotionSnapshot();
  syncLiveConversation();
  if (!createWebGlRuntime()) createFallbackRuntime();
  resize();
  root.dataset.particleOrb = runtime.mode === 'unavailable' ? 'unavailable' : 'ready';
  root.dataset.particleAudio = 'idle';

  if (global.ResizeObserver) {
    runtime.resizeObserver = new global.ResizeObserver(resize);
    runtime.resizeObserver.observe(character);
  } else {
    runtime.usesWindowResize = true;
    global.addEventListener('resize', resize, { passive: true });
  }

  if (global.MutationObserver) {
    runtime.rootObserver = new global.MutationObserver(onStateChanged);
    runtime.rootObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        'data-state',
        'data-pet-behavior',
        'data-pet-reaction',
        'data-pet-playing',
        'data-live-conversation',
        'hidden',
        'class',
        'style'
      ]
    });
  }

  replyAudio?.addEventListener?.('play', onReplyPlay);
  replyAudio?.addEventListener?.('playing', onReplyPlay);
  replyAudio?.addEventListener?.('pause', onReplyStop);
  replyAudio?.addEventListener?.('ended', onReplyStop);
  replyAudio?.addEventListener?.('emptied', onReplyStop);
  global.addEventListener('fe-monster-pet-desktop-state', onNativeVisibility);
  global.addEventListener('fe-monster-pet-emotion-change', onEmotionChanged);
  if (reducedMotionQuery?.addEventListener) {
    runtime.reducedMotionListenerMode = 'modern';
    reducedMotionQuery.addEventListener('change', onReducedMotionChanged);
  } else if (reducedMotionQuery?.addListener) {
    runtime.reducedMotionListenerMode = 'legacy';
    reducedMotionQuery.addListener(onReducedMotionChanged);
  }
  document.addEventListener('visibilitychange', onDocumentVisibilityChanged);
  global.addEventListener('pagehide', onPageHide);
  global.addEventListener('pageshow', onPageShow);

  global.FeMonsterPetParticleOrb = Object.freeze({
    start,
    stop,
    resize,
    renderOnce: (now = global.performance?.now?.() || Date.now()) => renderVisualFrame(now, DEFAULT_RENDER_STEP_MS),
    status: () => Object.freeze({
      ready: runtime.mode !== 'unavailable',
      mode: runtime.mode,
      surfaceProfile: SURFACE_PROFILE,
      particleCount: PARTICLE_COUNT,
      renderedParticleCount: runtime.mode === 'webgl'
        ? PARTICLE_COUNT
        : Math.ceil(PARTICLE_COUNT / FALLBACK_POINT_STRIDE),
      drawCalls: runtime.mode === 'webgl' ? 1 : 0,
      dpr: runtime.dpr,
      running: runtime.running,
      reducedMotion: runtime.reducedMotion,
      behavior: runtime.behavior,
      reaction: runtime.reaction,
      live: runtime.liveConversationActive,
      liveGlow: runtime.liveGlow,
      targetLiveGlow: runtime.liveGlowTarget,
      livePulse: runtime.livePulse,
      mood: runtime.emotionMood,
      targetMood: runtime.emotionMood,
      emotionEnergy: runtime.emotionEnergy,
      emotionPrimary: runtime.emotionPrimary,
      emotionIntensity: runtime.emotionIntensity,
      emotionMotion: runtime.emotionMotion,
      emotionColor: Object.freeze([...runtime.emotionColor]),
      targetEmotionColor: Object.freeze([...runtime.emotionColorTarget]),
      emission: runtime.material?.uniforms?.uEmission?.value ?? 0,
      targetEmission: runtime.emissionTarget,
      audioSource: root.dataset.particleAudio || 'idle',
      bands: Object.freeze({ ...runtime.bands })
    })
  });

  start();
})(window);
