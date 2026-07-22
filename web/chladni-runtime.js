(function attachChladniRuntime(global) {
  'use strict';

  const PI = Math.PI;
  const DEFAULT_PARTICLE_COUNT = 500000;
  const MIN_PARTICLE_COUNT = 72000;
  const MAX_PARTICLE_COUNT = 520000;
  const DEFAULT_PLANE_PARTICLE_COUNT = 600000;
  const MIN_PLANE_PARTICLE_COUNT = 60000;
  const MAX_PLANE_PARTICLE_COUNT = 620000;
  const MIN_FACE_PARTICLE_COUNT = 12000;
  const MAX_FACE_PARTICLE_COUNT = 85000;
  const PLATE_HALF_SIZE = 7.4;
  const CUBE_HALF_SIZE = 7.4;
  const CUBE_VIEW_YAW = PI / 4;
  const PLANE_VIEW_AZIMUTH = PI / 4;
  const PLANE_VIEW_ELEVATION = PI / 4;
  const PLANE_CAMERA_DISTANCE = 28.3;
  const ROUNDED_CORNER_RADIUS = 0.3;
  const BASS_SCALE_GAIN = 0.032;
  const BEAT_SCALE_GAIN = 0.012;
  const MAX_PIXEL_RATIO = 2.25;
  const MODES = Object.freeze([
    Object.freeze([2, 3]),
    Object.freeze([3, 5]),
    Object.freeze([4, 5]),
    Object.freeze([3, 7]),
    Object.freeze([5, 8]),
    Object.freeze([6, 7]),
    Object.freeze([4, 9]),
    Object.freeze([7, 8])
  ]);
  const CHLADNI_FACES = Object.freeze([
    Object.freeze({ name: 'top', position: [0, CUBE_HALF_SIZE, 0], rotation: [0, 0, 0] }),
    Object.freeze({ name: 'bottom', position: [0, -CUBE_HALF_SIZE, 0], rotation: [PI, 0, 0] }),
    Object.freeze({ name: 'front', position: [0, 0, CUBE_HALF_SIZE], rotation: [PI / 2, 0, 0] }),
    Object.freeze({ name: 'back', position: [0, 0, -CUBE_HALF_SIZE], rotation: [-PI / 2, 0, 0] }),
    Object.freeze({ name: 'right', position: [CUBE_HALF_SIZE, 0, 0], rotation: [0, 0, -PI / 2] }),
    Object.freeze({ name: 'left', position: [-CUBE_HALF_SIZE, 0, 0], rotation: [0, 0, PI / 2] })
  ]);
  let disposeCount = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeRgb(color, fallback) {
    const source = color && typeof color === 'object' ? color : fallback;
    return {
      r: clamp(source && source.r, 0, 255),
      g: clamp(source && source.g, 0, 255),
      b: clamp(source && source.b, 0, 255)
    };
  }

  function normalizePalette(palette) {
    const fallback = [
      { r: 83, g: 204, b: 255 },
      { r: 177, g: 118, b: 255 },
      { r: 255, g: 226, b: 166 }
    ];
    const source = Array.isArray(palette)
      ? palette
      : [palette && palette.glow, palette && palette.primary, palette && palette.highlight];
    return fallback.map((color, index) => normalizeRgb(source[index], color));
  }

  function rgbHex(color) {
    const part = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
    return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
  }

  function toThreeColor(THREE, color) {
    return new THREE.Color(color.r / 255, color.g / 255, color.b / 255);
  }

  function createRenderQuality(renderer, THREE, config) {
    if (!global.FeRenderQuality || typeof global.FeRenderQuality.create !== 'function') {
      return { controller: null, error: 'render-quality-unavailable' };
    }
    try {
      return {
        controller: global.FeRenderQuality.create(renderer, {
          THREE,
          mode: 'native',
          initialScale: 1,
          minScale: 0.5,
          maxScale: 1,
          targetFrameMs: clamp(config && config.targetFrameMs || 24, 8, 100),
          sharpness: clamp(config && config.sharpness || 0.42, 0, 1)
        }),
        error: ''
      };
    } catch (error) {
      return { controller: null, error: String(error && error.message || error || 'render-quality-create-failed') };
    }
  }

  function disableRenderQuality(runtime, error, reason) {
    if (!runtime) return;
    try { runtime.renderQuality?.dispose?.(); } catch (disposeError) {}
    runtime.renderQuality = null;
    runtime.renderQualityFallbackReason = reason || 'render-quality-failed';
    runtime.renderQualityLastError = String(error && error.message || error || runtime.renderQualityFallbackReason);
  }

  function setRenderQuality(runtime, request) {
    if (!runtime || runtime.disposed || !runtime.renderQuality) return false;
    try {
      const snapshot = runtime.renderQuality.setMode(request || 'native');
      runtime.renderQualityRequest = typeof request === 'object' && request
        ? String(request.name || 'auto')
        : String(request || 'native');
      runtime.renderQualityFallbackReason = snapshot && snapshot.fallbackReason || '';
      runtime.renderQualityLastError = snapshot && snapshot.lastError || '';
      return true;
    } catch (error) {
      disableRenderQuality(runtime, error, 'render-quality-set-mode-failed');
      return false;
    }
  }

  function renderQualityDiagnostics(runtime) {
    if (runtime && runtime.renderQuality && typeof runtime.renderQuality.getDiagnostics === 'function') {
      try {
        return {
          available: true,
          request: runtime.renderQualityRequest || 'native',
          ...runtime.renderQuality.getDiagnostics()
        };
      } catch (error) {
        return {
          available: false,
          mode: 'native',
          enabled: false,
          backend: 'direct',
          fallbackReason: 'render-quality-diagnostics-failed',
          lastError: String(error && error.message || error)
        };
      }
    }
    return {
      available: false,
      mode: 'native',
      enabled: false,
      backend: 'direct',
      fallbackReason: runtime && runtime.renderQualityFallbackReason || 'render-quality-unavailable',
      lastError: runtime && runtime.renderQualityLastError || ''
    };
  }

  function buildParticleGeometry(
    THREE,
    requestedCount,
    minCount = MIN_FACE_PARTICLE_COUNT,
    maxCount = MAX_FACE_PARTICLE_COUNT
  ) {
    const particleCount = Math.round(clamp(
      requestedCount || DEFAULT_PARTICLE_COUNT / CHLADNI_FACES.length,
      minCount,
      maxCount
    ));
    const side = Math.max(110, Math.round(Math.sqrt(particleCount)));
    const count = side * side;
    const positions = new Float32Array(count * 3);
    const coords = new Float32Array(count * 2);
    const seeds = new Float32Array(count);
    const layers = new Float32Array(count);
    const random = seededRandom(0xC41AD11);

    for (let row = 0; row < side; row += 1) {
      for (let column = 0; column < side; column += 1) {
        const index = row * side + column;
        const positionOffset = index * 3;
        const coordOffset = index * 2;
        const jitterX = (random() - 0.5) / side * 1.36;
        const jitterY = (random() - 0.5) / side * 1.36;
        const x = ((column + 0.5) / side) * 2 - 1 + jitterX;
        const y = ((row + 0.5) / side) * 2 - 1 + jitterY;
        positions[positionOffset] = x * PLATE_HALF_SIZE;
        positions[positionOffset + 1] = 0;
        positions[positionOffset + 2] = y * PLATE_HALF_SIZE;
        coords[coordOffset] = x;
        coords[coordOffset + 1] = y;
        seeds[index] = random();
        layers[index] = Math.pow(random(), 0.72);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aCoord', new THREE.BufferAttribute(coords, 2));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    geometry.computeBoundingSphere();
    return { geometry, count, side };
  }

  function createParticleMaterial(THREE, modeFrom, modeTo, roundedCorners = true) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uEnergy: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
        uModeFrom: { value: new THREE.Vector2(modeFrom[0], modeFrom[1]) },
        uModeTo: { value: new THREE.Vector2(modeTo[0], modeTo[1]) },
        uModeBlend: { value: 0 },
        uPixelRatio: { value: 1 },
        uReducedMotion: { value: 0 },
        uRoundedCorners: { value: roundedCorners ? 1 : 0 },
        uColorA: { value: new THREE.Color(0x53ccff) },
        uColorB: { value: new THREE.Color(0xb176ff) },
        uColorHot: { value: new THREE.Color(0xffe2a6) }
      },
      vertexShader: `
        precision highp float;
        attribute vec2 aCoord;
        attribute float aSeed;
        attribute float aLayer;
        uniform float uTime;
        uniform float uBass;
        uniform float uEnergy;
        uniform float uMid;
        uniform float uTreble;
        uniform float uBeat;
        uniform vec2 uModeFrom;
        uniform vec2 uModeTo;
        uniform float uModeBlend;
        uniform float uPixelRatio;
        uniform float uReducedMotion;
        uniform float uRoundedCorners;
        varying float vAlpha;
        varying float vNode;
        varying float vSeed;
        varying float vField;
        const float PI = 3.141592653589793;
        const float ROUNDED_CORNER_RADIUS = 0.3;

        float chladni(vec2 p, float n, float m) {
          return cos(n * PI * p.x) * cos(m * PI * p.y)
            - cos(m * PI * p.x) * cos(n * PI * p.y);
        }

        void main() {
          float fromField = chladni(aCoord, uModeFrom.x, uModeFrom.y);
          float toField = chladni(aCoord, uModeTo.x, uModeTo.y);
          float field = mix(fromField, toField, uModeBlend);
          float nodeProximity = exp(-abs(field) * (8.6 + uTreble * 4.2));
          float displacement = field * (0.48 + uBass * 1.35 + uBeat * 0.38);
          float vibration = sin(uTime * (2.1 + uMid * 2.8) + aSeed * 31.4159)
            * (1.0 - nodeProximity)
            * (0.08 + uEnergy * 0.18)
            * (1.0 - uReducedMotion * 0.78);
          vec3 transformed = position;
          transformed.y = position.y
            + displacement * (0.42 + aLayer * 0.64)
            + vibration
            + (aLayer - 0.5) * nodeProximity * (0.08 + uBass * 0.08);
          vec2 roundedCornerDelta = max(abs(aCoord) - vec2(0.7), vec2(0.0));
          float roundedCornerDistance = length(roundedCornerDelta);
          float roundedCornerMask = 1.0 - smoothstep(
            ROUNDED_CORNER_RADIUS,
            ROUNDED_CORNER_RADIUS + 0.04,
            roundedCornerDistance
          );
          roundedCornerMask = mix(1.0, roundedCornerMask, uRoundedCorners);
          float roundedCorner = smoothstep(0.0, ROUNDED_CORNER_RADIUS, roundedCornerDistance)
            * uRoundedCorners;
          transformed.xz *= 1.0 - roundedCorner * 0.14;
          transformed.y -= roundedCorner * 0.72;
          float breathing = 1.0 + sin(uTime * 0.62 + aSeed * 6.2831) * 0.012 * (1.0 - uReducedMotion);
          transformed.xz *= breathing;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float distanceScale = clamp(74.0 / max(5.0, -mvPosition.z), 0.62, 2.6);
          gl_PointSize = clamp(
            (0.56 + nodeProximity * 0.92 + uBeat * nodeProximity * 0.24 + aLayer * 0.08)
              * uPixelRatio * distanceScale,
            0.8,
            2.6
          ) * roundedCornerMask;
          vAlpha = (0.006 + nodeProximity * (0.72 + uEnergy * 0.22))
            * (0.72 + aLayer * 0.28)
            * roundedCornerMask;
          vNode = nodeProximity;
          vSeed = aSeed;
          vField = field;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorHot;
        uniform float uTreble;
        uniform float uBeat;
        varying float vAlpha;
        varying float vNode;
        varying float vSeed;
        varying float vField;

        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float radius = length(point);
          if (radius > 0.5) discard;
          float particleMask = 1.0 - smoothstep(0.46, 0.5, radius);
          float core = 1.0 - smoothstep(0.04, 0.22, radius);
          float side = smoothstep(-0.34, 0.34, vField + (vSeed - 0.5) * 0.08);
          vec3 color = mix(uColorA, uColorB, side);
          color = mix(color, uColorHot, vNode * (0.24 + uTreble * 0.32) + core * uBeat * 0.18);
          float alpha = vAlpha * particleMask * (0.9 + core * 0.18);
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
  }

  function applyPalette(runtime, palette) {
    if (!runtime || runtime.disposed) return false;
    runtime.palette = normalizePalette(palette);
    runtime.paletteHex = runtime.palette.map(rgbHex);
    runtime.materials.forEach((material) => {
      material.uniforms.uColorA.value.copy(toThreeColor(runtime.THREE, runtime.palette[0]));
      material.uniforms.uColorB.value.copy(toThreeColor(runtime.THREE, runtime.palette[1]));
      material.uniforms.uColorHot.value.copy(toThreeColor(runtime.THREE, runtime.palette[2]));
    });
    return true;
  }

  function resize(runtime, pixelRatio) {
    if (!runtime || runtime.disposed) return false;
    const rect = runtime.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const nextPixelRatio = clamp(pixelRatio || global.devicePixelRatio || 1, 0.5, MAX_PIXEL_RATIO);
    if (
      width === runtime.width
      && height === runtime.height
      && Math.abs(nextPixelRatio - runtime.pixelRatio) < 0.01
    ) return false;
    runtime.width = width;
    runtime.height = height;
    runtime.pixelRatio = nextPixelRatio;
    runtime.renderer.setPixelRatio(nextPixelRatio);
    if (runtime.renderQuality) runtime.renderQuality.resize(width, height, nextPixelRatio);
    else runtime.renderer.setSize(width, height, false);
    runtime.camera.aspect = width / Math.max(1, height);
    runtime.camera.updateProjectionMatrix();
    runtime.materials.forEach((material) => {
      material.uniforms.uPixelRatio.value = nextPixelRatio;
    });
    return true;
  }

  function faceMode(baseIndex, faceIndex) {
    return MODES[(baseIndex + faceIndex) % MODES.length];
  }

  function syncFaceModes(runtime, blend) {
    const planeFrom = faceMode(runtime.modeFromIndex, 0);
    const planeTo = faceMode(runtime.modeIndex, 0);
    runtime.planeMaterial.uniforms.uModeFrom.value.set(planeFrom[0], planeFrom[1]);
    runtime.planeMaterial.uniforms.uModeTo.value.set(planeTo[0], planeTo[1]);
    runtime.planeMaterial.uniforms.uModeBlend.value = blend;
    runtime.faceMaterials.forEach((material, faceIndex) => {
      const from = faceMode(runtime.modeFromIndex, faceIndex);
      const to = faceMode(runtime.modeIndex, faceIndex);
      material.uniforms.uModeFrom.value.set(from[0], from[1]);
      material.uniforms.uModeTo.value.set(to[0], to[1]);
      material.uniforms.uModeBlend.value = blend;
    });
  }

  function setMode(runtime, mode) {
    if (!runtime || runtime.disposed) return false;
    const nextMode = mode === 'plane' ? 'plane' : 'cube';
    runtime.displayMode = nextMode;
    runtime.particleCount = nextMode === 'plane'
      ? runtime.planeParticleCount
      : runtime.cubeParticleCount;
    runtime.gridSide = nextMode === 'plane' ? runtime.planeGridSide : runtime.cubeGridSide;
    runtime.planePoints.visible = nextMode === 'plane';
    runtime.faces.forEach((points, faceIndex) => {
      const face = CHLADNI_FACES[faceIndex];
      points.visible = nextMode === 'cube';
      points.position.set(face.position[0], face.position[1], face.position[2]);
      points.rotation.set(face.rotation[0], face.rotation[1], face.rotation[2]);
    });
    return true;
  }

  function selectNextMode(runtime, treble) {
    if (runtime.morphing) return false;
    const skip = treble > 0.68 ? 2 : 1;
    runtime.modeIndex = (runtime.modeIndex + skip) % MODES.length;
    runtime.modeTo = MODES[runtime.modeIndex];
    runtime.modeBlend = 0;
    runtime.morphing = true;
    runtime.morphStartedAt = runtime.lastNow;
    runtime.morphDurationMs = 1050 + (1 - clamp(treble, 0, 1)) * 520;
    syncFaceModes(runtime, 0);
    return true;
  }

  function updateModeMorph(runtime, now, frame) {
    const beat = clamp(frame && frame.beat, 0, 1.25);
    const treble = clamp(frame && frame.treble, 0, 1.25);
    const beatRising = beat > 0.48 && beat > runtime.lastBeat + 0.08;
    const timedMorph = now - runtime.lastModeChangeAt > (frame && frame.playing ? 6200 : 8800);
    if (!runtime.morphing && now - runtime.lastModeChangeAt > 1200 && (beatRising || timedMorph)) {
      selectNextMode(runtime, treble);
      runtime.lastModeChangeAt = now;
    }
    runtime.lastBeat = beat;
    if (!runtime.morphing) return;
    const progress = clamp((now - runtime.morphStartedAt) / Math.max(1, runtime.morphDurationMs), 0, 1);
    runtime.modeBlend = smoothstep(progress);
    runtime.materials.forEach((material) => {
      material.uniforms.uModeBlend.value = runtime.modeBlend;
    });
    if (progress >= 1) {
      runtime.modeFrom = runtime.modeTo;
      runtime.modeFromIndex = runtime.modeIndex;
      runtime.modeBlend = 0;
      runtime.morphing = false;
      syncFaceModes(runtime, 0);
    }
  }

  function update(runtime, frame) {
    if (!runtime || runtime.disposed) return false;
    const startedAt = performance.now();
    const now = Number(frame && frame.now) || performance.now();
    const dt = runtime.lastNow ? clamp((now - runtime.lastNow) / 1000, 1 / 360, 0.08) : 1 / 60;
    runtime.lastNow = now;
    runtime.frameCount += 1;
    if (!runtime.lastResizeCheckAt || now - runtime.lastResizeCheckAt > 260) {
      runtime.lastResizeCheckAt = now;
      resize(runtime, frame && frame.pixelRatio);
    }

    const playing = !!(frame && frame.playing);
    const reducedMotion = !!(frame && frame.reducedMotion);
    const targetBass = playing ? clamp(frame && frame.bass, 0, 1.25) : 0.08;
    const targetEnergy = playing ? clamp(frame && frame.energy, 0, 1.25) : 0.12;
    const targetMid = playing ? clamp(frame && frame.mid, 0, 1.25) : 0.08;
    const targetTreble = playing ? clamp(frame && frame.treble, 0, 1.25) : 0.06;
    const targetBeat = playing ? clamp(frame && frame.beat, 0, 1.25) : 0;
    const attack = 1 - Math.exp(-dt * 9.5);
    const release = 1 - Math.exp(-dt * 3.5);
    runtime.bass += (targetBass - runtime.bass) * (targetBass > runtime.bass ? attack : release);
    runtime.energy += (targetEnergy - runtime.energy) * (1 - Math.exp(-dt * 4));
    runtime.mid += (targetMid - runtime.mid) * (1 - Math.exp(-dt * 4.5));
    runtime.treble += (targetTreble - runtime.treble) * (1 - Math.exp(-dt * 5));
    runtime.beat += (targetBeat - runtime.beat) * (targetBeat > runtime.beat ? attack : 1 - Math.exp(-dt * 6));
    updateModeMorph(runtime, now, frame);

    const time = now / 1000;
    runtime.materials.forEach((material) => {
      const uniforms = material.uniforms;
      uniforms.uTime.value = time;
      uniforms.uBass.value = runtime.bass;
      uniforms.uEnergy.value = runtime.energy;
      uniforms.uMid.value = runtime.mid;
      uniforms.uTreble.value = runtime.treble;
      uniforms.uBeat.value = runtime.beat;
      uniforms.uReducedMotion.value = reducedMotion ? 1 : 0;
    });

    const cubeMode = runtime.displayMode === 'cube';
    runtime.rotationSpeed = reducedMotion ? 0.008 : 0.035 + runtime.energy * 0.01;
    runtime.autoRotation += dt * runtime.rotationSpeed;
    runtime.group.rotation.x = cubeMode ? -0.18 : 0;
    runtime.group.rotation.y = (cubeMode ? CUBE_VIEW_YAW : 0) + runtime.autoRotation;
    runtime.group.rotation.z = 0;
    const reducedMotionScale = reducedMotion ? 0.35 : 1;
    const overallJump = playing
      ? (runtime.bass * BASS_SCALE_GAIN + runtime.beat * BEAT_SCALE_GAIN) * reducedMotionScale
      : 0;
    runtime.group.scale.setScalar(1 + overallJump);

    const zoom = clamp(frame && frame.zoom || 1, 0.58, 2.35);
    if (cubeMode) {
      runtime.camera.position.set(0, 11.5 / Math.sqrt(zoom), 30.5 / zoom);
    } else {
      const distance = PLANE_CAMERA_DISTANCE / zoom;
      const horizontal = Math.cos(PLANE_VIEW_ELEVATION) * distance;
      runtime.camera.position.set(
        Math.sin(PLANE_VIEW_AZIMUTH) * horizontal,
        Math.sin(PLANE_VIEW_ELEVATION) * distance,
        Math.cos(PLANE_VIEW_AZIMUTH) * horizontal
      );
    }
    runtime.camera.lookAt(0, 0, 0);

    let renderedByQuality = false;
    if (runtime.renderQuality) {
      try {
        renderedByQuality = runtime.renderQuality.render(runtime.scene, runtime.camera, now) === true;
        if (!renderedByQuality) disableRenderQuality(runtime, 'render-returned-false', 'render-quality-render-failed');
      } catch (error) {
        disableRenderQuality(runtime, error, 'render-quality-render-failed');
      }
    }
    if (!renderedByQuality) runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.drawCalls = Number(runtime.renderer.info && runtime.renderer.info.render && runtime.renderer.info.render.calls) || 0;
    runtime.lastUpdateMs = performance.now() - startedAt;
    runtime.averageUpdateMs = runtime.averageUpdateMs
      ? runtime.averageUpdateMs * 0.92 + runtime.lastUpdateMs * 0.08
      : runtime.lastUpdateMs;
    return true;
  }

  function create(host, options) {
    const THREE = global.THREE;
    if (!host || !THREE) return null;
    const config = options || {};
    const palette = normalizePalette(config.palette);
    const renderer = typeof config.createRenderer === 'function'
      ? config.createRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      : new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.className = 'chladni-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.replaceChildren(renderer.domElement);

    const quality = createRenderQuality(renderer, THREE, config.renderQualityOptions);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02040a, 0.014);
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 150);
    camera.position.set(0, 11.5, 30.5);
    camera.lookAt(0, 0, 0);
    const group = new THREE.Group();
    group.name = 'ChladniSixFaceParticleSculpture';
    scene.add(group);

    const requestedParticleCount = Math.round(clamp(
      config.particleCount || DEFAULT_PARTICLE_COUNT,
      MIN_PARTICLE_COUNT,
      MAX_PARTICLE_COUNT
    ));
    const particleData = buildParticleGeometry(THREE, requestedParticleCount / CHLADNI_FACES.length);
    const requestedPlaneParticleCount = Math.round(clamp(
      config.planeParticleCount || DEFAULT_PLANE_PARTICLE_COUNT,
      MIN_PLANE_PARTICLE_COUNT,
      MAX_PLANE_PARTICLE_COUNT
    ));
    const planeData = buildParticleGeometry(
      THREE,
      requestedPlaneParticleCount,
      MIN_PLANE_PARTICLE_COUNT,
      MAX_PLANE_PARTICLE_COUNT
    );
    const planeMaterial = createParticleMaterial(THREE, faceMode(0, 0), faceMode(1, 0), false);
    const planePoints = new THREE.Points(planeData.geometry, planeMaterial);
    planePoints.name = 'ChladniHighDensityPlane';
    planePoints.scale.setScalar(1.25);
    planePoints.frustumCulled = false;
    group.add(planePoints);
    const faceMaterials = [];
    const faces = CHLADNI_FACES.map((face, faceIndex) => {
      const material = createParticleMaterial(
        THREE,
        faceMode(0, faceIndex),
        faceMode(1, faceIndex)
      );
      const points = new THREE.Points(particleData.geometry, material);
      points.name = `ChladniFace-${face.name}`;
      points.position.set(face.position[0], face.position[1], face.position[2]);
      points.rotation.set(face.rotation[0], face.rotation[1], face.rotation[2]);
      points.frustumCulled = false;
      faceMaterials.push(material);
      group.add(points);
      return points;
    });

    const runtime = {
      THREE,
      host,
      renderer,
      renderQuality: quality.controller,
      renderQualityRequest: 'native',
      renderQualityFallbackReason: quality.controller ? '' : quality.error,
      renderQualityLastError: '',
      scene,
      camera,
      group,
      points: faces[0],
      faces,
      faceMaterials,
      planePoints,
      planeMaterial,
      materials: [planeMaterial, ...faceMaterials],
      geometry: particleData.geometry,
      planeGeometry: planeData.geometry,
      material: faceMaterials[0],
      particleCount: particleData.count * CHLADNI_FACES.length,
      cubeParticleCount: particleData.count * CHLADNI_FACES.length,
      planeParticleCount: planeData.count,
      particlesPerFace: particleData.count,
      gridSide: particleData.side,
      cubeGridSide: particleData.side,
      planeGridSide: planeData.side,
      displayMode: config.mode === 'plane' ? 'plane' : 'cube',
      palette,
      paletteHex: palette.map(rgbHex),
      width: 0,
      height: 0,
      pixelRatio: 1,
      lastResizeCheckAt: 0,
      lastNow: 0,
      lastModeChangeAt: performance.now(),
      lastBeat: 0,
      modeIndex: 0,
      modeFromIndex: 0,
      modeFrom: MODES[0],
      modeTo: MODES[1],
      modeBlend: 0,
      morphing: false,
      morphStartedAt: 0,
      morphDurationMs: 1320,
      autoRotation: 0,
      rotationSpeed: 0,
      bass: 0,
      energy: 0,
      mid: 0,
      treble: 0,
      beat: 0,
      frameCount: 0,
      drawCalls: 0,
      lastUpdateMs: 0,
      averageUpdateMs: 0,
      disposed: false
    };

    setMode(runtime, runtime.displayMode);
    applyPalette(runtime, palette);
    resize(runtime, config.pixelRatio);
    if (config.renderQuality) setRenderQuality(runtime, config.renderQuality);
    update(runtime, {
      now: performance.now(),
      bass: 0,
      energy: 0,
      mid: 0,
      treble: 0,
      beat: 0,
      playing: false,
      yaw: 0,
      pitch: 0,
      zoom: 1,
      reducedMotion: false,
      pixelRatio: config.pixelRatio
    });
    return runtime;
  }

  function diagnostics(runtime) {
    if (!runtime) {
      return {
        active: false,
        disposed: true,
        disposeCount,
        particleCount: 0,
        autoRotation: true
      };
    }
    return {
      active: !runtime.disposed,
      disposed: runtime.disposed,
      disposeCount,
      renderer: 'three-webgl-particle-shader',
      particleCount: runtime.particleCount,
      planeParticleCount: runtime.planeParticleCount,
      cubeParticleCount: runtime.cubeParticleCount,
      particlesPerFace: runtime.particlesPerFace,
      gridSide: runtime.gridSide,
      pointCloud: true,
      faceCount: runtime.faces.length,
      visibleFaceCount: runtime.faces.filter((face) => face.visible).length
        + (runtime.planePoints.visible ? 1 : 0),
      faceNames: CHLADNI_FACES.map((face) => face.name),
      faceModePairs: runtime.faceMaterials.map((material) => ([
        [material.uniforms.uModeFrom.value.x, material.uniforms.uModeFrom.value.y],
        [material.uniforms.uModeTo.value.x, material.uniforms.uModeTo.value.y]
      ])),
      displayMode: runtime.displayMode,
      particleProfile: 'crisp-antialiased-disc',
      maxPointSize: 2.6,
      toneMappingExposure: runtime.renderer.toneMappingExposure,
      particleSharpness: 0.42,
      cubeCornerFacingViewer: true,
      roundedCornerCount: 8,
      roundedCornerRadius: ROUNDED_CORNER_RADIUS,
      plateShape: runtime.displayMode === 'cube'
        ? 'six-face-particle-cube-no-support'
        : 'single-particle-plane-no-support',
      transparentPlate: false,
      centerSphere: false,
      physicsModel: 'square-plate-nodal-line-approximation',
      equation: 'cos(n*pi*x)*cos(m*pi*y)-cos(m*pi*x)*cos(n*pi*y)=0',
      nodeAccumulation: 'particle-opacity-peaks-at-zero-displacement',
      threeDimensional: true,
      displacementAxis: 'y',
      bassDisplacementGain: 1.35,
      bassScaleGain: BASS_SCALE_GAIN,
      beatScaleGain: BEAT_SCALE_GAIN,
      overallScale: Number(runtime.group.scale.x.toFixed(4)),
      modeFrom: runtime.modeFrom.slice(),
      modeTo: runtime.modeTo.slice(),
      modeBlend: Number(runtime.modeBlend.toFixed(4)),
      morphing: runtime.morphing,
      autoRotation: true,
      mouseOrbitEnabled: false,
      planeViewAzimuthDegrees: 45,
      planeViewElevationDegrees: 45,
      rotationSpeed: Number(runtime.rotationSpeed.toFixed(4)),
      rotation: {
        x: Number(runtime.group.rotation.x.toFixed(4)),
        y: Number(runtime.group.rotation.y.toFixed(4)),
        z: Number(runtime.group.rotation.z.toFixed(4))
      },
      cameraPosition: {
        x: Number(runtime.camera.position.x.toFixed(4)),
        y: Number(runtime.camera.position.y.toFixed(4)),
        z: Number(runtime.camera.position.z.toFixed(4))
      },
      audio: {
        bass: Number(runtime.bass.toFixed(4)),
        energy: Number(runtime.energy.toFixed(4)),
        mid: Number(runtime.mid.toFixed(4)),
        treble: Number(runtime.treble.toFixed(4)),
        beat: Number(runtime.beat.toFixed(4))
      },
      palette: runtime.paletteHex.slice(),
      frameCount: runtime.frameCount,
      drawCalls: runtime.drawCalls,
      canvasCount: runtime.host ? runtime.host.querySelectorAll('canvas').length : 0,
      lastUpdateMs: Number(runtime.lastUpdateMs.toFixed(3)),
      averageUpdateMs: Number(runtime.averageUpdateMs.toFixed(3)),
      renderQuality: renderQualityDiagnostics(runtime)
    };
  }

  function dispose(runtime) {
    if (!runtime || runtime.disposed) return false;
    runtime.disposed = true;
    try { runtime.renderQuality?.dispose?.(); } catch (error) {}
    runtime.renderQuality = null;
    runtime.geometry.dispose();
    runtime.planeGeometry.dispose();
    runtime.materials.forEach((material) => material.dispose());
    if (runtime.renderer.renderLists && typeof runtime.renderer.renderLists.dispose === 'function') {
      runtime.renderer.renderLists.dispose();
    }
    if (typeof runtime.renderer.dispose === 'function') runtime.renderer.dispose();
    if (typeof runtime.renderer.forceContextLoss === 'function') runtime.renderer.forceContextLoss();
    runtime.renderer.domElement.remove();
    disposeCount += 1;
    return true;
  }

  global.FeChladniRuntime = Object.freeze({
    create,
    update,
    resize,
    setPalette: applyPalette,
    setMode,
    setRenderQuality,
    diagnostics,
    dispose
  });
})(window);
