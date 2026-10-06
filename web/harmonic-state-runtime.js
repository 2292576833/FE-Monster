(function attachHarmonicStateRuntime(global) {
  'use strict';

  const TAU = Math.PI * 2;
  const MAX_PIXEL_RATIO = 2.5;
  const CORAL_CLUSTER_COUNT = 9;
  const CORAL_BRANCHES_MIN = 7;
  const CORAL_BRANCHES_MAX = 13;
  const CORAL_RADIUS = 16.5;
  const CORAL_FIELD_RADIUS = 24;
  const DEFAULT_PARTICLE_COUNT = 96000;
  const MIN_PARTICLE_COUNT = 24000;
  const MAX_PARTICLE_COUNT = 140000;
  const CARD_CENTER_WIDTH = 10.5;
  const CARD_CENTER_HEIGHT = 6.7;
  const CARD_COUNT = 7;
  const CARD_RADIUS_RATIO = 0.085;
  const CARD_ORBIT_STEP = TAU / CARD_COUNT;
  let disposeCount = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function cardOrbitPose(index, count, phase) {
    const angle = index * TAU / count + phase;
    return {
      x: Math.sin(angle) * 9.1,
      y: Math.sin(angle) * 0.68 + Math.sin(angle * 2) * 0.12,
      z: Math.cos(angle) * 4.5,
      // A periodic correction keeps front cards readable without a flip at ±PI.
      yaw: angle - Math.sin(angle) * 0.34,
      roll: -Math.sin(angle) * 0.025
    };
  }

  function layoutCardText(context, value, maxWidth, maxHeight) {
    const text = String(value || '');
    const family = '"Cascadia Mono", "Consolas", "Microsoft YaHei", monospace';
    let result;
    for (let fontSize = 54; fontSize >= 10; fontSize -= 1) {
      context.font = `${fontSize}px ${family}`;
      const lines = [];
      for (const paragraph of text.split('\n')) {
        let line = '';
        for (const char of Array.from(paragraph)) {
          if (line && context.measureText(line + char).width > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
        lines.push(line);
      }
      result = { lines, fontSize, lineHeight: fontSize * 1.32, font: context.font };
      if (lines.length * result.lineHeight <= maxHeight) return result;
    }
    return result;
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

  function defaultPalette() {
    return [
      { r: 255, g: 110, b: 199 },
      { r: 176, g: 118, b: 255 },
      { r: 93, g: 230, b: 210 }
    ];
  }

  function normalizePalette(palette) {
    const fallback = defaultPalette();
    const source = Array.isArray(palette)
      ? palette
      : Array.isArray(palette && palette.coverColors)
        ? palette.coverColors
        : [];
    return [0, 1, 2].map((index) => normalizeRgb(source[index], fallback[index]));
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
    disposeQualitySurface(runtime);
    runtime.renderQualityFallbackReason = reason || 'render-quality-failed';
    runtime.renderQualityLastError = String(error && error.message || error || runtime.renderQualityFallbackReason);
  }

  function setRenderQuality(runtime, request) {
    if (!runtime || runtime.disposed || !runtime.renderQuality) return false;
    try {
      const snapshot = runtime.renderQuality.setMode(request || 'native');
      if (!snapshot?.enabled) disposeQualitySurface(runtime);
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

  // Composite and upscale in the same display-color space as native rendering.
  // Decoding very dark colors into an 8-bit linear target would lose precision;
  // the quality pass temporarily disables output encoding to preserve them.
  function qualitySurface(runtime, quality) {
    const THREE = runtime.THREE;
    if (!runtime.qualitySurface) {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
      });
      target.texture.encoding = THREE.sRGBEncoding;
      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
        uniforms: { uComposite: { value: target.texture } },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: `
          uniform sampler2D uComposite;
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(uComposite, vUv);
          }
        `
      });
      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      camera.position.z = 1;
      runtime.qualitySurface = { target, geometry, material, scene, camera };
    }
    const surface = runtime.qualitySurface;
    const width = Math.max(1, Math.round(quality.internalWidth));
    const height = Math.max(1, Math.round(quality.internalHeight));
    if (surface.target.width !== width || surface.target.height !== height) surface.target.setSize(width, height);
    return surface;
  }

  function disposeQualitySurface(runtime) {
    if (!runtime.qualitySurface) return;
    runtime.qualitySurface.target.dispose();
    runtime.qualitySurface.geometry.dispose();
    runtime.qualitySurface.material.dispose();
    runtime.qualitySurface.scene.clear();
    runtime.qualitySurface = null;
  }

  // ---------- 珊瑚粒子几何:中心丛 + 环绕丛,枝状分布 ----------
  function buildCoralGeometry(THREE, requestedCount) {
    const particleCount = Math.round(clamp(
      requestedCount || DEFAULT_PARTICLE_COUNT,
      MIN_PARTICLE_COUNT,
      MAX_PARTICLE_COUNT
    ));
    const positions = new Float32Array(particleCount * 3);
    const dirs = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);
    const layers = new Float32Array(particleCount);
    const clusterIds = new Float32Array(particleCount);
    const random = seededRandom(0x4A44B7E);

    // Vertical colonies hug the crystal spine; distant clusters add parallax.
    const clusters = [
      [-3.1, -7.6, -3.5], [3.7, -3.2, -3.9], [-4.2, 2.2, -4.5],
      [3.3, 7.0, -3.3], [-2.6, 10.4, -6.0], [6.8, 1.6, -8.0],
      [-7.2, -6.0, -9.0], [-6.7, 8.6, -10.0], [5.8, -8.8, -5.4]
    ].slice(0, CORAL_CLUSTER_COUNT).map(([x, y, z]) => ({ x, y, z, radius: 0.8 + random() * 0.55 }));

    let cursor = 0;
    for (const cluster of clusters) {
      const clusterCount = cluster === clusters[clusters.length - 1]
        ? particleCount - cursor : Math.floor(particleCount / clusters.length);
      const branchCount = Math.round(
        CORAL_BRANCHES_MIN + random() * (CORAL_BRANCHES_MAX - CORAL_BRANCHES_MIN)
      );
      const branchLengths = [];
      for (let branch = 0; branch < branchCount; branch += 1) {
        branchLengths.push(1.1 + random() * 2.8);
      }
      for (let index = 0; index < clusterCount; index += 1) {
        if (cursor >= particleCount) break;
        const branch = Math.floor(random() * branchCount);
        const along = Math.pow(random(), 0.62);
        const branchLength = (branchLengths[branch] || 3.4) * (0.55 + cluster.radius * 0.42);
        const branchAzimuth = (branch / branchCount) * TAU;
        const branchElevation = 0.5 + Math.sin(branch * 2.7) * 0.36;
        const azimuth = branchAzimuth + (random() - 0.5) * (0.09 + along * 0.22);
        const elevation = branchElevation - along * 0.28;
        const directionX = Math.cos(azimuth) * Math.cos(elevation);
        const directionY = Math.sin(elevation);
        const directionZ = Math.sin(azimuth) * Math.cos(elevation);
        const kink = Math.sin(along * 6.3 + branch * 1.7) * 0.22;
        const dirX = directionX + Math.cos(branchAzimuth) * kink;
        const dirY = directionY + Math.sin(along * 4.1 + branch) * (0.3 + kink * 0.4);
        const dirZ = directionZ + Math.sin(branchAzimuth) * kink;
        const len = Math.hypot(dirX, dirY, dirZ) || 1;
        const jitter = (0.08 + random() * 0.14) * (0.35 + along * 0.65);
        const px = cluster.x + dirX / len * branchLength * along + (random() - 0.5) * jitter * 4;
        const py = cluster.y - 1.1 + dirY / len * branchLength * along + (random() - 0.5) * jitter * 4;
        const pz = cluster.z + dirZ / len * branchLength * along + (random() - 0.5) * jitter * 4;
        positions[cursor * 3] = px;
        positions[cursor * 3 + 1] = py;
        positions[cursor * 3 + 2] = pz;
        dirs[cursor * 3] = dirX / len;
        dirs[cursor * 3 + 1] = dirY / len;
        dirs[cursor * 3 + 2] = dirZ / len;
        seeds[cursor] = random();
        layers[cursor] = along;
        clusterIds[cursor] = cluster.x * 0.13 + cluster.z * 0.07 + random() * 0.03;
        cursor += 1;
      }
    }
    for (; cursor < particleCount; cursor += 1) {
      positions[cursor * 3] = 0;
      positions[cursor * 3 + 1] = -40;
      positions[cursor * 3 + 2] = 0;
      dirs[cursor * 3] = 0;
      dirs[cursor * 3 + 1] = 1;
      dirs[cursor * 3 + 2] = 0;
      seeds[cursor] = random();
      layers[cursor] = 0;
      clusterIds[cursor] = random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    geometry.setAttribute('aCluster', new THREE.BufferAttribute(clusterIds, 1));
    geometry.computeBoundingSphere();
    return { geometry, count: particleCount };
  }

  // ---------- 珊瑚粒子材质 ----------
  function createCoralMaterial(THREE) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Preserve the coral's pink/violet hue where dense branches overlap.
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uEnergy: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
        uPixelRatio: { value: 1 },
        uReducedMotion: { value: 0 },
        uColorA: { value: new THREE.Color(0xff6ec7) },
        uColorB: { value: new THREE.Color(0xb176ff) },
        uColorHot: { value: new THREE.Color(0x5de6d2) }
      },
      vertexShader: `
        precision highp float;
        attribute vec3 aDir;
        attribute float aSeed;
        attribute float aLayer;
        attribute float aCluster;
        uniform float uTime;
        uniform float uBass;
        uniform float uEnergy;
        uniform float uMid;
        uniform float uTreble;
        uniform float uBeat;
        uniform float uPixelRatio;
        uniform float uReducedMotion;
        varying float vAlpha;
        varying float vSeed;
        varying float vLayer;
        varying float vCluster;

        void main() {
          float breathing = sin(uTime * (0.7 + aSeed * 0.38) + aLayer * 7.31) * (1.0 - uReducedMotion * 0.8);
          float sway = sin(uTime * (0.42 + aCluster * 4.2) + aLayer * 2.1) * 0.16;
          float pulse = uBass * (0.16 + aLayer * 0.3) + uBeat * 0.06 + uEnergy * 0.05;
          vec3 transformed = position
            + aDir * (pulse * (1.1 + aSeed * 0.9))
            + vec3(sin(aCluster * 19.7 + aLayer * 8.31 + uTime * 0.56), sin(aCluster * 7.4 + uTime * 0.82), cos(aLayer * 6.11 - uTime * 0.62))
              * (0.05 + uEnergy * 0.1 + breathing * 0.035)
            + vec3(sway, breathing * 0.045 * (1.0 - uReducedMotion * 0.86), 0.0);
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float distanceScale = clamp(46.0 / max(4.0, -mvPosition.z), 0.5, 2.1);
          float hotspot = pow(aSeed, 2.0) * aLayer;
          gl_PointSize = clamp(
            (0.8 + hotspot * 1.7 + uBeat * 0.5 + uTreble * 0.3) * uPixelRatio * distanceScale,
            0.8,
            3.4
          );
          vAlpha = (0.11 + hotspot * (0.76 + uEnergy * 0.22) + uBeat * 0.1 * hotspot)
            * (0.62 + aLayer * 0.38)
            * (1.0 - uReducedMotion * 0.55);
          vSeed = aSeed;
          vLayer = aLayer;
          vCluster = aCluster;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorHot;
        uniform float uBeat;
        uniform float uTreble;
        varying float vAlpha;
        varying float vSeed;
        varying float vLayer;
        varying float vCluster;

        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float radius = length(point);
          if (radius > 0.5) discard;
          float mask = 1.0 - smoothstep(0.34, 0.5, radius);
          float core = 1.0 - smoothstep(0.05, 0.24, radius);
          float blendA = sin(vCluster * 41.0 + vLayer * 2.6);
          float mixA = blendA * 0.5 + 0.5;
          vec3 color = mix(mix(uColorA, uColorB, mixA), uColorHot, vLayer * 0.34);
          color = mix(color, vec3(1.0), core * (0.16 + uBeat * 0.18 + vSeed * 0.1));
          float alpha = vAlpha * mask;
          gl_FragColor = vec4(color * (0.86 + uTreble * 0.22), alpha);
        }
      `
    });
  }

  // ---------- 星尘 ----------
  function buildStarDust(THREE, count) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const random = seededRandom(0x5EED15E);
    for (let index = 0; index < count; index += 1) {
      const az = random() * TAU;
      const el = Math.asin(random() * 1.8 - 0.9);
      const radius = CORAL_FIELD_RADIUS * (0.72 + random() * 0.42);
      positions[index * 3] = Math.cos(az) * Math.cos(el) * radius;
      positions[index * 3 + 1] = Math.sin(el) * radius * 0.72 - 1.5;
      positions[index * 3 + 2] = Math.sin(az) * Math.cos(el) * radius;
      seeds[index] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uBeat: { value: 0 }
      },
      vertexShader: `
        precision highp float;
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uBeat;
        varying float vSeed;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float twinkle = 0.55 + sin(uTime * (0.9 + aSeed * 2.4) + aSeed * 31.4) * 0.45;
          gl_PointSize = clamp((0.7 + aSeed * 1.3 + uBeat * 0.4) * uPixelRatio * twinkle, 0.5, 2.6);
          vSeed = aSeed;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vSeed;
        void main() {
          vec2 point = gl_PointCoord - 0.5;
          float radius = length(point);
          if (radius > 0.5) discard;
          float mask = 1.0 - smoothstep(0.2, 0.5, radius);
          float tint = 0.6 + vSeed * 0.4;
          gl_FragColor = vec4(vec3(0.72, 0.78, 1.0) * tint, mask * 0.7);
        }
      `
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'HarmonicStarDust';
    points.frustumCulled = false;
    return { points, geometry, material };
  }

  // ---------- 后场分节水光塔：固定塔身、连续呼吸与有方向的柔尾流光 ----------
  function buildLightTowers(THREE) {
    const group = new THREE.Group();
    group.name = 'HarmonicLightTowers';
    // Exactly two side wings frame the orbital centerpiece without crossing it.
    const anchors = [
      { x: -16.47, z: -11.5, baseY: -7, height: 20, radius: 1.105 },
      { x: 17.28, z: -13, baseY: -7, height: 22, radius: 1.17 }
    ];
    const defaults = {
      towersEnabled: true, breathingEnabled: true, breathSpeed: 0.65, breathStrength: 0.55,
      flowEnabled: true, flowDirection: 'up', flowSpeed: 0.65, flowWidth: 0.22,
      colorSpeed: 0.35, audioReactive: true
    };
    let settings = { ...defaults };
    let disposed = false;
    let lastTime = null;
    let breathPhase = 0;
    let flowPosition = 0.16;
    let flowDirection = 1;
    let colorPhase = 0;
    let waterPhase = 0;
    const geometries = new Set();
    const materials = new Set();
    const meshes = [];
    const segmentCount = 10;
    const paletteColors = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    const uniforms = {
      uBreathPhase: { value: 0 }, uBreathStrength: { value: defaults.breathStrength },
      uFlowPosition: { value: flowPosition }, uFlowDirection: { value: 1 },
      uFlowWidth: { value: defaults.flowWidth }, uFlowEnabled: { value: 1 },
      uFlowAlternate: { value: 0 }, uColorPhase: { value: 0 }, uWaterPhase: { value: 0 },
      uColorA: { value: paletteColors[0] }, uColorB: { value: paletteColors[1] },
      uColorC: { value: paletteColors[2] }, uGlowColor: { value: new THREE.Color() },
      uCustomColor: { value: new THREE.Color('#2aeaf4') }, uCustomColorEnabled: { value: 0 },
      uAudio: { value: 0 },
      uKeyDirectionWorld: { value: new THREE.Vector3(0.353553, 0.707107, 0.612372).normalize() },
      uKeyIntensity: { value: 1 }, uAmbientIntensity: { value: 0.65 }, uRimIntensity: { value: 1 },
      uReflectivity: { value: 0.65 }, uGlowStrength: { value: 0.45 }, uGlowSoftness: { value: 0.65 },
      uLightPulse: { value: 1 }
    };
    const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
      ? Math.max(min, Math.min(max, Number(value))) : fallback;
    const wrap = (value, period) => ((value % period) + period) % period;

    // Shared shader colors and phases keep all 44 rings in just one draw call.
    const lightShader = `
      uniform float uBreathPhase;
      uniform float uBreathStrength;
      uniform float uFlowPosition;
      uniform float uFlowDirection;
      uniform float uFlowWidth;
      uniform float uFlowEnabled;
      uniform float uFlowAlternate;
      uniform float uColorPhase;
      uniform float uWaterPhase;
      uniform float uAudio;
      uniform vec3 uKeyDirectionWorld;
      uniform float uKeyIntensity;
      uniform float uAmbientIntensity;
      uniform float uRimIntensity;
      uniform float uReflectivity;
      uniform float uGlowStrength;
      uniform float uGlowSoftness;
      uniform float uLightPulse;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform vec3 uGlowColor;
      uniform vec3 uCustomColor;
      uniform float uCustomColorEnabled;
      varying float vHeight;
      varying float vTowerId;
      vec3 paletteAt(float phase) {
        float slot = mod(phase, 3.0);
        float weight = 0.5 - 0.5 * cos(fract(slot) * 3.14159265);
        if (slot < 1.0) return mix(uColorA, uColorB, weight);
        if (slot < 2.0) return mix(uColorB, uColorC, weight);
        return mix(uColorC, uColorA, weight);
      }
      vec3 towerTint() {
        return mix(mix(uGlowColor, paletteAt(uColorPhase + vTowerId * 0.13 + vHeight * 0.10), 0.32),
          uCustomColor, uCustomColorEnabled);
      }
      float breathing() {
        return 1.0 + sin(uBreathPhase + vTowerId * 0.32) * uBreathStrength * 0.30;
      }
      float flowLight() {
        float distance = (vHeight - uFlowPosition) * uFlowDirection;
        if (uFlowAlternate < 0.5) distance = fract(distance + 0.5) - 0.5;
        float headWidth = max(0.008, uFlowWidth * 0.17);
        float head = exp(-pow(max(distance, 0.0) / headWidth, 2.0));
        float tail = exp(min(distance, 0.0) / max(0.015, uFlowWidth * 0.48));
        float wrapFade = uFlowAlternate < 0.5
          ? 1.0 - smoothstep(0.32, 0.5, abs(distance)) : 1.0;
        float edgeFade = mix(1.0, smoothstep(0.0, 0.07, uFlowPosition)
          * smoothstep(0.0, 0.07, 1.0 - uFlowPosition), uFlowAlternate);
        return head * tail * uFlowEnabled * edgeFade * wrapFade;
      }
    `;
    const towerVertex = `
      attribute float aTowerId;
      attribute float aTowerHeight;
      varying float vHeight;
      varying float vTowerId;
      varying float vAngle;
      varying float vSurfaceY;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 local = position;
        vHeight = position.y + 0.5;
        vTowerId = aTowerId;
        vAngle = atan(position.z, position.x);
        vSurfaceY = vHeight * aTowerHeight;
        local.xz *= 1.0 + 0.035 * sin(fract(vHeight * 10.0) * 3.14159265);
        vec4 instancePosition = instanceMatrix * vec4(local, 1.0);
        vec4 worldPosition = modelMatrix * instancePosition;
        mat3 instanceNormal = mat3(instanceMatrix);
        vec3 localNormal = normal / vec3(dot(instanceNormal[0], instanceNormal[0]),
          dot(instanceNormal[1], instanceNormal[1]), dot(instanceNormal[2], instanceNormal[2]));
        vWorldNormal = normalize(mat3(modelMatrix) * instanceNormal * localNormal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;
    const bodyMaterial = new THREE.ShaderMaterial({
      uniforms, vertexShader: towerVertex,
      fragmentShader: lightShader + `
        varying float vAngle;
        varying float vSurfaceY;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          vec3 reflection = reflect(-viewDirection, normal);
          float facing = abs(dot(normal, viewDirection));
          float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.6);
          vec3 lightDirection = normalize(uKeyDirectionWorld);
          float diffuse = max(0.0, dot(normal, lightDirection));
          float studio = pow(max(0.0, dot(reflection, lightDirection)), 34.0);
          float wetSheen = pow(max(0.0, dot(reflection, lightDirection)), 7.0);
          float fineLines = pow(0.5 + 0.5 * sin(vAngle * 127.0
            + sin(vAngle * 13.0) * 0.8), 20.0);
          float runnels = 0.44 + 0.56 * pow(0.5 + 0.5 * sin(vSurfaceY * 8.5
            + uWaterPhase * 3.0 + sin(vAngle * 23.0) * 2.0), 3.0);
          float jointPhase = fract(vHeight * 10.0);
          float jointDistance = min(jointPhase, 1.0 - jointPhase);
          float seam = 1.0 - smoothstep(0.003, 0.015, jointDistance);
          float rimSpill = exp(-pow(jointDistance / 0.095, 2.0));
          vec3 tint = towerTint();
          float light = breathing() * (0.85 + uAudio * 0.25 + flowLight() * 0.60);
          vec3 color = vec3(0.004, 0.011, 0.015) * (1.0 - seam * 0.55)
            * (0.35 + uAmbientIntensity + diffuse * uKeyIntensity * uLightPulse);
          color += tint * (fresnel * 0.085 * uRimIntensity + rimSpill * 0.078
            + fineLines * runnels * 0.095) * light;
          color += tint * diffuse * uKeyIntensity * uLightPulse * (0.012 + fineLines * 0.035);
          color += mix(tint, vec3(0.76, 0.93, 1.0), 0.32)
            * (studio * 0.54 + wetSheen * runnels * 0.07) * uReflectivity * uKeyIntensity * uLightPulse;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `
    });
    const ringMaterial = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aTowerId;
        attribute float aLevel;
        varying float vHeight;
        varying float vTowerId;
        varying vec3 vWorldPosition;
        void main() {
          vHeight = aLevel;
          vTowerId = aTowerId;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: lightShader + `
        void main() {
          vec3 color = towerTint() * breathing() * (1.22 + flowLight() * 1.18 + uAudio * 0.4);
          gl_FragColor = vec4(color, 0.90);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `
    });
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, vertexShader: towerVertex,
      fragmentShader: lightShader + `
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        void main() {
          float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)));
          float jointPhase = fract(vHeight * 10.0);
          float jointDistance = min(jointPhase, 1.0 - jointPhase);
          float halo = exp(-pow(jointDistance / mix(0.06, 0.30, uGlowSoftness), 2.0));
          float silhouette = smoothstep(0.0, 0.3, facing) * (0.55 + pow(1.0 - facing, 2.0));
          float alpha = halo * silhouette * breathing() * (0.095 + flowLight() * 0.10 + uAudio * 0.025)
            * (uGlowStrength / 0.45) * uLightPulse;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(towerTint() * 1.15, alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }
      `
    });
    for (const material of [bodyMaterial, ringMaterial, glowMaterial]) materials.add(material);
    const bodyGeometry = new THREE.CylinderGeometry(1, 1, 1, 48, 64, false);
    const glowGeometry = new THREE.CylinderGeometry(1, 1, 1, 32, 40, true);
    const ringGeometry = new THREE.TorusGeometry(1, 0.035, 6, 48);
    for (const geometry of [bodyGeometry, glowGeometry, ringGeometry]) geometries.add(geometry);
    for (const geometry of [bodyGeometry, glowGeometry]) {
      geometry.setAttribute('aTowerId', new THREE.InstancedBufferAttribute(new Float32Array(anchors.map((_, index) => index)), 1));
      geometry.setAttribute('aTowerHeight', new THREE.InstancedBufferAttribute(new Float32Array(anchors.map(anchor => anchor.height)), 1));
    }
    const ringCount = anchors.length * (segmentCount + 1);
    const ringIds = new Float32Array(ringCount);
    const ringLevels = new Float32Array(ringCount);
    const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, anchors.length);
    const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, anchors.length);
    const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, ringCount);
    bodies.name = 'LightTowerWetBodies';
    rings.name = 'LightTowerCyanRings';
    glows.name = 'LightTowerSoftHalos';
    const transform = new THREE.Object3D();
    anchors.forEach((anchor, index) => {
      transform.position.set(anchor.x, anchor.baseY + anchor.height * 0.5, anchor.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(anchor.radius, anchor.height, anchor.radius);
      transform.updateMatrix();
      bodies.setMatrixAt(index, transform.matrix);
      transform.scale.set(anchor.radius * 1.16, anchor.height, anchor.radius * 1.16);
      transform.updateMatrix();
      glows.setMatrixAt(index, transform.matrix);
      for (let level = 0; level <= segmentCount; level += 1) {
        const ringIndex = index * (segmentCount + 1) + level;
        const fraction = level / segmentCount;
        transform.position.set(anchor.x, anchor.baseY + anchor.height * fraction, anchor.z);
        transform.rotation.set(Math.PI / 2, 0, 0);
        transform.scale.setScalar(anchor.radius * 1.015);
        transform.updateMatrix();
        rings.setMatrixAt(ringIndex, transform.matrix);
        ringIds[ringIndex] = index;
        ringLevels[ringIndex] = fraction;
      }
    });
    ringGeometry.setAttribute('aTowerId', new THREE.InstancedBufferAttribute(ringIds, 1));
    ringGeometry.setAttribute('aLevel', new THREE.InstancedBufferAttribute(ringLevels, 1));
    for (const mesh of [bodies, rings, glows]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      meshes.push(mesh);
      group.add(mesh);
    }

    function refreshColor() {
      const slot = Math.floor(colorPhase);
      const weight = 0.5 - 0.5 * Math.cos((colorPhase - slot) * Math.PI);
      uniforms.uGlowColor.value.copy(paletteColors[slot % 3]).lerp(paletteColors[(slot + 1) % 3], weight);
    }

    function setPalette(colors) {
      if (disposed) return;
      const normalized = normalizePalette(colors);
      normalized.forEach((color, index) => paletteColors[index].setRGB(color.r / 255, color.g / 255, color.b / 255));
      refreshColor();
    }

    function update(frame = {}) {
      if (disposed) return;
      const input = frame.settings || defaults;
      settings = {
        towersEnabled: input.towersEnabled !== false,
        breathingEnabled: input.breathingEnabled !== false,
        breathSpeed: finite(input.breathSpeed, defaults.breathSpeed, 0.1, 3),
        breathStrength: finite(input.breathStrength, defaults.breathStrength, 0, 1),
        flowEnabled: input.flowEnabled !== false,
        flowDirection: ['up', 'down', 'alternate'].includes(input.flowDirection) ? input.flowDirection : 'up',
        flowSpeed: finite(input.flowSpeed, defaults.flowSpeed, 0.1, 3),
        flowWidth: finite(input.flowWidth, defaults.flowWidth, 0.05, 0.6),
        colorSpeed: finite(input.colorSpeed, defaults.colorSpeed, 0.05, 2),
        towerColorMode: input.towerColorMode === 'custom' ? 'custom' : 'palette',
        towerColor: /^#[\da-f]{6}$/i.test(input.towerColor || '') ? input.towerColor : '#2aeaf4',
        audioReactive: input.audioReactive !== false,
        keyLightIntensity: finite(input.keyLightIntensity, 1, 0, 2.5),
        keyLightAzimuth: finite(input.keyLightAzimuth, 30, -180, 180),
        keyLightElevation: finite(input.keyLightElevation, 45, -10, 85),
        ambientLightIntensity: finite(input.ambientLightIntensity, 0.65, 0, 1.5),
        rimLightIntensity: finite(input.rimLightIntensity, 1, 0, 2),
        towerReflectivity: finite(input.towerReflectivity, 0.65, 0, 1.5),
        glowStrength: finite(input.glowStrength, 0.45, 0, 1.5),
        glowSoftness: finite(input.glowSoftness, 0.65, 0.1, 1),
        lightAudioStrength: finite(input.lightAudioStrength, 0.35, 0, 1)
      };
      const time = Number.isFinite(frame.time) ? frame.time : null;
      const elapsed = Number.isFinite(frame.delta) ? frame.delta
        : time !== null && lastTime !== null ? time - lastTime : 0;
      lastTime = time;
      const delta = finite(elapsed, 0, 0, 0.1);
      const playing = frame.playing === true;
      const animated = (playing || frame.idleMotion === true) && frame.reducedMotion !== true && settings.towersEnabled;
      group.visible = settings.towersEnabled;
      if (settings.flowDirection !== 'alternate') flowDirection = settings.flowDirection === 'down' ? -1 : 1;
      if (animated && delta > 0) {
        const motionDelta = delta * (playing ? 1 : 0.35);
        if (settings.breathingEnabled) breathPhase = wrap(breathPhase + motionDelta * settings.breathSpeed * 0.85, TAU);
        if (settings.flowEnabled) {
          flowPosition += motionDelta * settings.flowSpeed * 0.11 * flowDirection;
          if (settings.flowDirection === 'alternate') {
            if (flowPosition > 1) { flowPosition = 2 - flowPosition; flowDirection = -1; }
            if (flowPosition < 0) { flowPosition = -flowPosition; flowDirection = 1; }
          } else flowPosition = wrap(flowPosition, 1);
          waterPhase = wrap(waterPhase + motionDelta * settings.flowSpeed * 0.9, TAU);
        }
        colorPhase = wrap(colorPhase + motionDelta * settings.colorSpeed * 0.10, 3);
        const audio = playing && settings.audioReactive ? finite(frame.bass, 0, 0, 1) * 0.5
          + finite(frame.beat, 0, 0, 1) * 0.3 + finite(frame.energy, 0, 0, 1) * 0.2 : 0;
        uniforms.uAudio.value += (audio - uniforms.uAudio.value) * (1 - Math.exp(-delta * 5));
      }
      if (!settings.audioReactive) uniforms.uAudio.value = 0;
      uniforms.uBreathPhase.value = breathPhase;
      uniforms.uBreathStrength.value = settings.breathingEnabled ? settings.breathStrength : 0;
      uniforms.uFlowPosition.value = flowPosition;
      uniforms.uFlowDirection.value = flowDirection;
      uniforms.uFlowWidth.value = settings.flowWidth;
      uniforms.uFlowEnabled.value = settings.flowEnabled ? 1 : 0;
      uniforms.uFlowAlternate.value = settings.flowDirection === 'alternate' ? 1 : 0;
      uniforms.uColorPhase.value = colorPhase;
      uniforms.uWaterPhase.value = waterPhase;
      const direction = frame.keyDirectionWorld;
      if (direction && Number.isFinite(direction.x) && Number.isFinite(direction.y)
        && Number.isFinite(direction.z) && direction.x * direction.x + direction.y * direction.y + direction.z * direction.z > 0) {
        uniforms.uKeyDirectionWorld.value.copy(direction).normalize();
      } else {
        const azimuth = settings.keyLightAzimuth * Math.PI / 180;
        const elevation = settings.keyLightElevation * Math.PI / 180;
        group.updateWorldMatrix(true, false);
        uniforms.uKeyDirectionWorld.value.set(Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).transformDirection(group.matrixWorld);
      }
      uniforms.uKeyIntensity.value = settings.keyLightIntensity;
      uniforms.uAmbientIntensity.value = settings.ambientLightIntensity;
      uniforms.uRimIntensity.value = settings.rimLightIntensity;
      uniforms.uReflectivity.value = settings.towerReflectivity;
      uniforms.uGlowStrength.value = settings.glowStrength;
      uniforms.uGlowSoftness.value = settings.glowSoftness;
      uniforms.uLightPulse.value = 1 + uniforms.uAudio.value * settings.lightAudioStrength * 0.18;
      uniforms.uCustomColorEnabled.value = settings.towerColorMode === 'custom' ? 1 : 0;
      uniforms.uCustomColor.value.set(settings.towerColor);
      glows.visible = settings.glowStrength > 0;
      refreshColor();
    }

    function diagnostics() {
      return {
        towerCount: anchors.length, drawCalls: meshes.length, ringCount,
        breathPhase, flowPosition, flowDirection, colorPhase, waterPhase,
        glowColor: uniforms.uGlowColor.value.toArray(), audio: uniforms.uAudio.value,
        customColor: uniforms.uCustomColor.value.getHexString(),customColorEnabled: uniforms.uCustomColorEnabled.value === 1,
        settings: { ...settings }, enabled: group.visible, disposed,
        lighting: { keyDirectionWorld: uniforms.uKeyDirectionWorld.value.toArray(),
          keyIntensity: uniforms.uKeyIntensity.value, ambientIntensity: uniforms.uAmbientIntensity.value,
          rimIntensity: uniforms.uRimIntensity.value, reflectivity: uniforms.uReflectivity.value,
          glowStrength: uniforms.uGlowStrength.value, glowSoftness: uniforms.uGlowSoftness.value,
          audioBoost: uniforms.uLightPulse.value }
      };
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) if (typeof mesh.dispose === 'function') mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear();
      materials.clear();
      if (group.parent) group.parent.remove(group);
      group.clear();
    }

    setPalette([{ r: 42, g: 234, b: 244 }, { r: 137, g: 99, b: 247 }, { r: 250, g: 105, b: 188 }]);
    return { group, anchors, update, setPalette, dispose, diagnostics };
  }

  // ---------- 不规则镀铬碎晶柱：独立碎块、玻璃棱面与本地环境反射 ----------
  function buildCrystalColumn(THREE, palette) {
    const group = new THREE.Group();
    group.name = 'HarmonicCrystalColumn';
    const spine = new THREE.Group();
    group.add(spine);
    const segmentCount = 28;
    const totalHeight = 27;
    const radius = 1.45;
    const random = seededRandom(0xC713A4);
    const geometries = new Set();
    const materials = new Set();
    const segments = [];
    let disposed = false;
    let colors = normalizePalette(palette);

    // Small canvas cube faces provide stable studio-like reflections even in a black scene.
    const faces = Array.from({ length: 6 }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      return canvas;
    });
    const environment = new THREE.CubeTexture(faces);
    environment.encoding = THREE.sRGBEncoding;
    environment.mapping = THREE.CubeReflectionMapping;
    environment.minFilter = THREE.LinearMipmapLinearFilter;
    environment.magFilter = THREE.LinearFilter;
    environment.generateMipmaps = true;

    function paintEnvironment() {
      const rgb = (color, lift, gain = 1) => 'rgb(' + [color.r, color.g, color.b]
        .map(value => Math.round((value + (255 - value) * lift) * gain)).join(',') + ')';
      faces.forEach((canvas, face) => {
        const context = canvas.getContext('2d');
        if (!context) return;
        const primary = colors[face % 3];
        const secondary = colors[(face + 1) % 3];
        const ground = context.createLinearGradient(0, 0, 256, 256);
        ground.addColorStop(0, '#02050b');
        ground.addColorStop(0.25, rgb(primary, 0, 0.075));
        ground.addColorStop(0.43, '#010305');
        ground.addColorStop(0.62, rgb(secondary, 0, 0.11));
        ground.addColorStop(0.85, '#08111b');
        ground.addColorStop(1, '#02040a');
        context.fillStyle = ground;
        context.fillRect(0, 0, 256, 256);

        const stripX = 28 + ((face * 31) % 130);
        const strip = context.createLinearGradient(stripX - 13, 0, stripX + 25, 0);
        strip.addColorStop(0, 'rgba(120,175,255,0)');
        strip.addColorStop(0.25, rgb(primary, 0.04));
        strip.addColorStop(0.43, rgb(primary, 0.56));
        strip.addColorStop(0.47, '#ffffff');
        strip.addColorStop(0.52, '#e9fbff');
        strip.addColorStop(0.63, rgb(secondary, 0.12));
        strip.addColorStop(1, 'rgba(140,100,255,0)');
        context.fillStyle = strip;
        context.fillRect(stripX - 13, 0, 38, 256);

        // Broken horizontal softboxes give different facets different highlights.
        context.fillStyle = rgb(secondary, 0.12);
        context.fillRect(0, 38 + face * 11, 92, 5 + (face % 3) * 3);
        context.fillStyle = '#effcff';
        context.fillRect(177, 169 - face * 13, 79, 3);
        context.fillStyle = rgb(primary, 0.03, 0.55);
        context.beginPath();
        context.moveTo(0, 182);
        context.lineTo(88, 119 + face * 7);
        context.lineTo(103, 126 + face * 7);
        context.lineTo(0, 200);
        context.closePath();
        context.fill();
      });
      environment.needsUpdate = true;
    }

    const metalMaterials = [0, 1, 2].map(index => {
      const material = new THREE.MeshPhysicalMaterial({
        color: 0x96b7c9,
        metalness: index === 1 ? 0.7 : 0.98,
        roughness: 0.045 + index * 0.016,
        clearcoat: 1,
        clearcoatRoughness: 0.035,
        envMap: environment,
        envMapIntensity: 1.1,
        transparent: index === 1,
        opacity: index === 1 ? 0.86 : 1,
        flatShading: false,
        side: THREE.DoubleSide
      });
      materials.add(material);
      return material;
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x63bdcf,
      metalness: 0.12,
      roughness: 0.035,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      reflectivity: 1,
      envMap: environment,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
      flatShading: false
    });
    materials.add(glassMaterial);

    // Each lump is a closed, bevelled, irregular polyhedron. Attached chips share
    // its draw call; partially softened normals keep curved chrome reflections.
    function appendCrystal(positions, center, scale, angle, sides) {
      const outline = [];
      const tiltX = (random() - 0.5) * 0.28;
      const tiltZ = (random() - 0.5) * 0.22;
      for (let index = 0; index < sides; index += 1) {
        const theta = index / sides * TAU + angle + (random() - 0.5) * 0.2;
        const reach = 0.76 + random() * 0.28;
        outline.push({ x: Math.cos(theta) * reach, z: Math.sin(theta) * reach });
      }
      const rings = [
        { y: -0.5, radius: 0.66, offset: -0.055 },
        { y: -0.27, radius: 1, offset: 0 },
        { y: 0.22, radius: 0.97, offset: 0.02 },
        { y: 0.5, radius: 0.64, offset: 0.075 }
      ].map((ring, ringIndex) => outline.map((point, index) => {
        const x = point.x * ring.radius + ring.offset;
        const z = point.z * ring.radius;
        return [
          center.x + x * scale.x,
          center.y + (ring.y + point.x * tiltX + point.z * tiltZ
            + Math.sin(index * 2.1 + ringIndex) * 0.045) * scale.y,
          center.z + z * scale.z
        ];
      }));
      const triangle = (a, b, c) => positions.push(...a, ...b, ...c);
      for (let ring = 0; ring < rings.length - 1; ring += 1) {
        for (let index = 0; index < sides; index += 1) {
          const next = (index + 1) % sides;
          triangle(rings[ring][index], rings[ring + 1][index], rings[ring][next]);
          triangle(rings[ring][next], rings[ring + 1][index], rings[ring + 1][next]);
        }
      }
      const bottom = [center.x - scale.x * 0.03, center.y - scale.y * 0.5, center.z];
      const top = [center.x + scale.x * 0.04, center.y + scale.y * 0.5, center.z];
      for (let index = 0; index < sides; index += 1) {
        const next = (index + 1) % sides;
        triangle(bottom, rings[0][index], rings[0][next]);
        triangle(top, rings[3][next], rings[3][index]);
      }
    }

    function geometryFrom(positions) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const cornerNormals = new Map();
      const vertexKeys = [];
      for (let index = 0; index < position.count; index += 1) {
        const key = position.getX(index) + ',' + position.getY(index) + ',' + position.getZ(index);
        vertexKeys.push(key);
        if (!cornerNormals.has(key)) cornerNormals.set(key, new THREE.Vector3());
        cornerNormals.get(key).add(new THREE.Vector3(normal.getX(index), normal.getY(index), normal.getZ(index)));
      }
      for (const value of cornerNormals.values()) value.normalize();
      const mixed = new THREE.Vector3();
      for (let index = 0; index < normal.count; index += 1) {
        mixed.set(normal.getX(index), normal.getY(index), normal.getZ(index))
          .lerp(cornerNormals.get(vertexKeys[index]), 0.72).normalize();
        normal.setXYZ(index, mixed.x, mixed.y, mixed.z);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.add(geometry);
      return geometry;
    }

    for (let index = 0; index < segmentCount; index += 1) {
      const positions = [];
      const width = radius * (0.86 + random() * 0.3);
      const height = 0.71 + random() * 0.26;
      appendCrystal(positions, { x: 0, y: 0, z: 0 },
        { x: width, y: height, z: width * (0.78 + random() * 0.26) }, random() * TAU, 9);
      const chipCount = 2 + (index % 3);
      for (let chip = 0; chip < chipCount; chip += 1) {
        const azimuth = random() * TAU;
        const reach = width * (0.84 + random() * 0.28);
        appendCrystal(positions, {
          x: Math.cos(azimuth) * reach,
          y: (random() - 0.5) * height * 1.15,
          z: Math.sin(azimuth) * reach
        }, {
          x: 0.24 + random() * 0.38,
          y: 0.18 + random() * 0.42,
          z: 0.2 + random() * 0.34
        }, random() * TAU, 5);
      }
      const mesh = new THREE.Mesh(geometryFrom(positions), metalMaterials[index % 3]);
      mesh.name = 'CrystalVertebra-' + index;
      mesh.position.set(
        Math.sin(index * 0.93) * 0.17 + (random() - 0.5) * 0.16,
        (index / (segmentCount - 1) - 0.5) * (totalHeight - 1),
        Math.sin(index * 1.39) * 0.14
      );
      mesh.rotation.set((random() - 0.5) * 0.13, random() * TAU, (random() - 0.5) * 0.15);
      spine.add(mesh);
      segments.push({ mesh, yaw: mesh.rotation.y, phase: random() * TAU });

      if (index % 3 === 1) {
        const platePositions = [];
        const side = index % 2 === 0 ? 1 : -1;
        appendCrystal(platePositions, { x: 0, y: 0, z: 0 },
          { x: 0.52, y: 0.22 + random() * 0.19, z: 0.85 }, random() * TAU, 6);
        const plate = new THREE.Mesh(geometryFrom(platePositions), glassMaterial);
        plate.name = 'CrystalGlassChip-' + index;
        plate.position.set(side * (width + 0.17), mesh.position.y + 0.27, 0.24);
        plate.rotation.set(0.25 + random() * 0.55, random() * TAU, side * 0.35);
        spine.add(plate);
      }
    }

    const fill = new THREE.HemisphereLight(0x80a9c2, 0x171224, 0.24);
    const key = new THREE.DirectionalLight(0xd3ffff, 1.25);
    key.position.set(-3.8, 6, 8);
    const rim = new THREE.DirectionalLight(0xcd79ff, 1.1);
    rim.position.set(4, -2, 3);
    const back = new THREE.DirectionalLight(0x36dce8, 0.9);
    back.position.set(-3, -5, -4);
    for (const light of [key, rim, back]) {
      light.target = new THREE.Object3D();
      group.add(light.target);
    }
    group.add(fill, key, rim, back);

    function setPalette(nextPalette) {
      if (disposed) return;
      colors = normalizePalette(nextPalette);
      const white = new THREE.Color(0xffffff);
      metalMaterials.forEach((material, index) => {
        const tint = colors[index];
        material.color.setRGB(tint.r / 255, tint.g / 255, tint.b / 255).lerp(white, 0.52).multiplyScalar(0.74);
      });
      const tint = colors[2];
      glassMaterial.color.setRGB(tint.r / 255, tint.g / 255, tint.b / 255).lerp(white, 0.24).multiplyScalar(0.65);
      const accent = colors[0];
      rim.color.setRGB(accent.r / 255, accent.g / 255, accent.b / 255).lerp(white, 0.12);
      back.color.setRGB(tint.r / 255, tint.g / 255, tint.b / 255).lerp(white, 0.08);
      paintEnvironment();
    }

    function update(frame) {
      if (disposed) return;
      const state = frame || {};
      const motion = state.reducedMotion ? 0 : 1;
      const time = Number.isFinite(state.time) ? state.time : 0;
      const bass = state.playing ? clamp(state.bass, 0, 1) : 0;
      const beat = state.playing ? clamp(state.beat, 0, 1) : 0;
      const energy = state.playing ? clamp(state.energy, 0, 1) : 0;
      spine.rotation.y = Math.sin(time * 0.035) * 0.1 * motion;
      const breathe = 1 + (Math.sin(time * 0.7) * 0.005 + bass * 0.014) * motion;
      spine.scale.set(breathe, 1, breathe);
      for (const segment of segments) {
        segment.mesh.rotation.y = segment.yaw
          + Math.sin(time * 0.18 + segment.phase) * (0.025 + energy * 0.014) * motion;
      }
      key.intensity = 1.25 + beat * 0.18 * motion;
      rim.intensity = 1.1 + bass * 0.24 * motion;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      environment.dispose();
      for (const canvas of faces) {
        canvas.width = 1;
        canvas.height = 1;
      }
      if (group.parent) group.parent.remove(group);
      group.clear();
      spine.clear();
      segments.length = 0;
      geometries.clear();
      materials.clear();
    }

    setPalette(colors);
    return { group, segmentCount, update, setPalette, dispose };
  }

    // ---------- 玻璃卡片 ----------
  function safeText(value, fallback = '') {
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  function drawGlassCard(context, canvas, data, colors, coverImage) {
    const width = canvas.width, height = canvas.height;
    context.clearRect(0, 0, width, height);
    if (coverImage) {
      const scale = Math.max(width / coverImage.width, height / coverImage.height);
      context.save();
      context.globalAlpha = 0.10;
      context.drawImage(coverImage, (width - coverImage.width * scale) / 2,
        (height - coverImage.height * scale) / 2, coverImage.width * scale, coverImage.height * scale);
      context.restore();
    }
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const mono = '"Cascadia Mono", "Consolas", "Microsoft YaHei", monospace';
    context.font = '16px ' + mono;
    context.fillStyle = 'rgba(237,250,250,0.65)';
    context.fillText(data.kicker || 'FE MONSTER', width / 2, height * 0.18, width * 0.86);
    const layout = layoutCardText(context, data.text, width * 0.82, height * 0.43);
    context.font = layout.font;
    context.shadowColor = rgbHex(colors[2]);
    context.shadowBlur = data.active ? 10 : 4;
    context.fillStyle = data.active ? '#f2ffff' : 'rgba(240,246,249,0.84)';
    const firstY = height * 0.48 - (layout.lines.length - 1) * layout.lineHeight / 2;
    layout.lines.forEach((line, index) => context.fillText(line, width / 2, firstY + index * layout.lineHeight));
    context.shadowBlur = 0;
    context.font = '17px ' + mono;
    context.fillStyle = 'rgba(220,242,240,0.58)';
    context.fillText(data.subtitle || '', width / 2, height * 0.80, width * 0.82);
    context.font = '12px ' + mono;
    context.fillStyle = 'rgba(204,232,232,0.45)';
    context.fillText(data.active ? 'H A R M O N I C   S T A T E' : 'FE  /  MUSIC GALLERY',
      width / 2, height * 0.91);
    return layout;
  }

  function createCardMesh(THREE, surface, backdrop, index) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 654;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
      uniforms: {
        uText: { value: texture }, uScene: { value: backdrop.texture },
        uTint: { value: new THREE.Color(0x79cddd) },
        uTime: { value: 0 }, uActive: { value: 0 }, uProgress: { value: 0 }
      },
      vertexShader: String.raw`
        varying vec2 vUv;
        varying vec4 vClip;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          vNormal = normalMatrix * normal;
          vClip = projectionMatrix * mv;
          gl_Position = vClip;
        }
      `,
      fragmentShader: String.raw`
        precision highp float;
        uniform sampler2D uText;
        uniform sampler2D uScene;
        uniform vec3 uTint;
        uniform float uTime;
        uniform float uActive;
        uniform float uProgress;
        varying vec2 vUv;
        varying vec4 vClip;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec2 ratio = vec2(1.0, 0.638);
          vec2 q = abs((vUv - 0.5) * ratio) - (ratio * 0.5 - 0.045);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.045;
          if (d > 0.0) discard;
          float rim = 1.0 - smoothstep(0.001, 0.008, abs(d));
          vec2 screenUv = vClip.xy / vClip.w * 0.5 + 0.5;
          vec2 bend = vec2(
            sin(vUv.y * 14.0 + sin(vUv.x * 8.0) + uTime * 0.08),
            cos(vUv.x * 11.0 - vUv.y * 6.0)
          ) * (0.004 + pow(abs(vUv.x - 0.5) * 2.0, 5.0) * 0.012);
          vec2 sampleUv = clamp(screenUv + bend, vec2(0.002), vec2(0.998));
          vec3 glass;
          glass.r = texture2D(uScene, clamp(sampleUv + vec2(0.0006, 0.0), 0.002, 0.998)).r;
          glass.g = texture2D(uScene, sampleUv).g;
          glass.b = texture2D(uScene, clamp(sampleUv - vec2(0.0006, 0.0), 0.002, 0.998)).b;
          float sheen = pow(max(0.0, 1.0 - abs(vUv.x + vUv.y * 0.36 - 0.58)), 8.0);
          glass = glass * 0.80 + uTint * (0.055 + sheen * 0.035);
          glass += rim * mix(uTint, vec3(0.88, 0.98, 1.0), 0.35) * 0.6;
          vec4 text = texture2D(uText, vUv);
          float facing = smoothstep(0.0, 0.18, dot(normalize(vNormal), normalize(vView)));
          vec3 color = mix(glass, text.rgb, text.a * facing);
          float bar = step(0.105, vUv.x) * step(vUv.x, 0.105 + 0.79 * uProgress)
            * smoothstep(0.059, 0.062, vUv.y) * (1.0 - smoothstep(0.065, 0.069, vUv.y));
          color += uTint * bar * uActive * 0.72 * facing;
          gl_FragColor = vec4(color, 0.86);
        }
      `
    });
    const geometry = new THREE.PlaneGeometry(CARD_CENTER_WIDTH, CARD_CENTER_HEIGHT);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'HarmonicGlassCard-' + index;
    mesh.frustumCulled = false;
    surface.add(mesh);
    return { mesh, texture, canvas, glassMaterial: material, data: null, textLayout: null };
  }

  function galleryEntries(frame) {
    if (Array.isArray(frame.entries) && frame.entries.length) {
      const entries = frame.entries.map((entry) => ({
        key: safeText(entry.key), text: safeText(entry.text),
        subtitle: safeText(entry.subtitle), active: entry.active === true
      }));
      const current = Math.max(0, entries.findIndex(entry => entry.active));
      return Array.from({ length: CARD_COUNT }, (_, i) => {
        const offset = i - Math.floor(CARD_COUNT / 2);
        return entries[current + offset] || {
          key: 'meta-' + i, text: safeText(frame.title, 'HARMONIC\nSTATE'),
          subtitle: safeText(frame.subtitle, 'FE MONSTER'), active: offset === 0
        };
      });
    }
    const lines = frame.lines || {};
    return Array.from({ length: CARD_COUNT }, (_, i) => ({
      key: 'line-' + i,
      text: safeText(i === 2 ? lines.previous : i === 3 ? lines.current : i === 4 ? lines.next : '',
        safeText(frame.title, 'HARMONIC\nSTATE')),
      subtitle: safeText(frame.subtitle, 'FE MONSTER'), active: i === 3
    }));
  }

  function drawLyricCards(runtime, entries) {
    runtime.entries = entries;
    if (runtime.effects.lyricCardsEnabled === false) return;
    runtime.cards.forEach((card, index) => {
      const relative = ((index - runtime.activeSlot + CARD_COUNT + 3) % CARD_COUNT) - 3;
      const data = entries[relative + 3];
      card.data = data;
      card.textLayout = drawGlassCard(card.canvas.getContext('2d'), card.canvas, {
        ...data, kicker: data.active ? 'NOW PLAYING' : relative < 0 ? 'PREVIOUS LINE' : 'UP NEXT LINE'
      }, runtime.palette, runtime.coverImage);
      card.texture.needsUpdate = true;
      card.glassMaterial.uniforms.uActive.value = data.active ? 1 : 0;
      const baseTint = toThreeColor(runtime.THREE, runtime.palette[(index + 2) % 3]);
      card.glassMaterial.uniforms.uTint.value.copy(baseTint);
    });
    runtime.host.setAttribute('aria-label', entries[3].text);
    runtime.atmosphere.invalidateReflection();
  }

  function requestCover(runtime, url) {
    if (runtime.coverUrl === url) return;
    runtime.coverUrl = url;
    runtime.coverImage = null;
    const generation = ++runtime.coverGeneration;
    if (runtime.entries) drawLyricCards(runtime, runtime.entries);
    if (!url || typeof global.Image !== 'function') return;
    const image = new global.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (runtime.disposed || generation !== runtime.coverGeneration) return;
      runtime.coverImage = image;
      if (runtime.entries) drawLyricCards(runtime, runtime.entries);
    };
    image.onerror = () => {};
    image.src = url;
  }

  // Layered, advected density fields give the plumes depth without a full-screen
  // fog overlay or another scene capture. One mesh holds all eleven mist layers.
  function buildMistAtmosphere(THREE, anchors) {
    const group = new THREE.Group();
    group.name = 'HarmonicFlowingAtmosphere';
    let disposed = false, fogTime = 0, waterTime = 0;
    const random = seededRandom(0xA17105);
    const noiseData = new Uint8Array(128 * 128 * 4);
    for (let i = 0; i < noiseData.length; i += 4) {
      const value = Math.floor(random() * 256);
      noiseData[i] = noiseData[i + 1] = noiseData[i + 2] = value;
      noiseData[i + 3] = 255;
    }
    const noise = new THREE.DataTexture(noiseData, 128, 128, THREE.RGBAFormat);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.minFilter = noise.magFilter = THREE.LinearFilter;
    noise.generateMipmaps = false;
    noise.needsUpdate = true;
    const positions = [], uvs = [], pivots = [], seeds = [], ground = [];
    const corners = [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]];
    let layerCount = 0;
    function layer(x, y, z, width, height, low) {
      const seed = random() * 30;
      for (const [u, v] of corners) {
        positions.push(x + (u - .5) * width, y + v * height, z);
        uvs.push(u, v);
        pivots.push(x, y, z);
        seeds.push(seed);
        ground.push(low ? 1 : 0);
      }
      layerCount += 1;
    }
    for (const tower of anchors) {
      layer(tower.x - tower.radius * .55, tower.baseY - .2, tower.z + 2.2,
        tower.radius * 7 + 4, tower.height * 1.12, false);
      layer(tower.x + tower.radius * .8, tower.baseY + .2, tower.z - .5,
        tower.radius * 8 + 4, tower.height * 1.05, false);
    }
    for (let i = 0; i < 3; i++) layer((i - 1) * 2, -7.05, -2 - i * 6, 44, 3.1 + i * .4, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aPivot', new THREE.Float32BufferAttribute(pivots, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('aGround', new THREE.Float32BufferAttribute(ground, 1));
    geometry.computeBoundingSphere();
    const fogMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, blending: THREE.NormalBlending, toneMapped: false,
      uniforms: {
        uNoise: { value: noise }, uTime: { value: 0 }, uDensity: { value: .55 },
        uHeight: { value: 1 }, uSpread: { value: 1 }, uEnergy: { value: 0 },
        uColorA: { value: new THREE.Color(0x13e8ee) },
        uColorB: { value: new THREE.Color(0x7969ff) }
      },
      vertexShader: `
        attribute vec3 aPivot;
        attribute float aSeed;
        attribute float aGround;
        uniform float uHeight;
        uniform float uSpread;
        varying vec2 vUv;
        varying vec3 vLocal;
        varying float vSeed;
        varying float vGround;
        void main() {
          vec3 p = position;
          p.x = aPivot.x + (p.x - aPivot.x) * uSpread;
          p.y = aPivot.y + (p.y - aPivot.y) * mix(uHeight, 1.0, aGround);
          vUv = uv; vLocal = p; vSeed = aSeed; vGround = aGround;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uNoise;
        uniform float uTime;
        uniform float uDensity;
        uniform float uEnergy;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        varying vec3 vLocal;
        varying float vSeed;
        varying float vGround;
        float cloud(vec2 p) {
          return texture2D(uNoise, (p + 0.5) / 128.0).r * 0.52
            + texture2D(uNoise, (p * 2.03 + 17.5) / 128.0).r * 0.27
            + texture2D(uNoise, (p * 4.11 + 43.5) / 128.0).r * 0.14
            + texture2D(uNoise, (p * 8.17 + 71.5) / 128.0).r * 0.07;
        }
        void main() {
          vec2 p = vUv * mix(vec2(5.0, 11.0), vec2(18.0, 3.5), vGround)
            + vec2(vSeed * 2.7, vSeed);
          // Sampling downward moves the visible density upward. Low fog drifts
          // sideways, with a separate phase so it never forms a marching sheet.
          vec2 drift = mix(vec2(-0.13, -0.64), vec2(-0.52, -0.09), vGround) * uTime;
          vec2 curl = vec2(cloud(p * .65 + drift * .51), cloud(p * .65 + drift * .47 + 31.7));
          float body = cloud(p + drift + (curl - .5) * 3.2);
          float filaments = cloud(p * 1.9 + drift * 1.3 + curl * 1.6);
          float density = smoothstep(.26, .76, body * .82 + filaments * .18);
          float sideways = (vUv.x - .5) * 2.0 + (curl.x - .5) * .3;
          float edge = (1.0 - smoothstep(.36, 1.0, abs(sideways)))
            * smoothstep(0.0, .13, vUv.y) * (1.0 - smoothstep(.62, 1.0, vUv.y));
          float readingGap = mix(.18, 1.0, smoothstep(1.2, 4.5, abs(vLocal.x)));
          readingGap = mix(readingGap, .82, vGround);
          float litEdge = pow(max(0.0, filaments - body + .24), 1.4);
          vec3 tint = mix(uColorA, uColorB, .10 + .19 * curl.y);
          vec3 color = mix(tint * .56, vec3(.42, .56, .59), .23 + body * .12);
          color += tint * litEdge * (.54 + uEnergy * .07);
          float alpha = density * edge * uDensity * mix(.58, .30, vGround) * readingGap;
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
    const mist = new THREE.Mesh(geometry, fogMaterial);
    mist.name = 'HarmonicAdvectedMist';
    mist.frustumCulled = false;
    mist.renderOrder = -2;
    group.add(mist);
    const waterGeometry = new THREE.PlaneGeometry(56, 50);
    const waterMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: false,
      uniforms: {
        uTime: { value: 0 }, uEnergy: { value: 0 }, uTowerStrength: { value: 1 },
        uColorA: { value: new THREE.Color(0x13e8ee) },
        uAnchors: { value: anchors.map(t => new THREE.Vector4(t.x, t.z, t.height, t.radius)) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform float uEnergy;
        uniform float uTowerStrength;
        uniform vec3 uColorA;
        uniform vec4 uAnchors[4];
        varying vec2 vUv;
        void main() {
          vec2 p = vec2((vUv.x - .5) * 56.0, -(vUv.y - .5) * 50.0 - 8.5);
          float ripple = sin(p.y * 4.2 + sin(p.x * .58 + uTime * .32) * 1.4 - uTime * .6);
          float streak = 0.0;
          for (int i = 0; i < 4; i++) {
            vec4 a = uAnchors[i];
            float dx = p.x - a.x + ripple * .16;
            float width = a.w * (1.0 + max(0.0, p.y - a.y) * .035);
            float reflection = exp(-dx * dx / (width * width * 1.8))
              * exp(-abs(p.y - a.y - 5.0) * .10);
            streak += reflection * (.17 + .18 * pow(.5 + .5 * ripple, 3.0));
          }
          float fade = (1.0 - smoothstep(.34, .5, abs(vUv.x - .5)))
            * (1.0 - smoothstep(.27, .5, abs(vUv.y - .5)));
          vec3 color = vec3(.005, .015, .023)
            + uColorA * streak * uTowerStrength * (.28 + uEnergy * .06);
          gl_FragColor = vec4(color, fade * .84);
        }
      `
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.name = 'HarmonicQuietWater';
    water.position.set(0, -7.06, -8.5);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = -3;
    group.add(water);
    let activeSettings = {};
    function update(frame = {}) {
      if (disposed) return;
      const settings = frame.settings || {};
      activeSettings = settings;
      const delta = clamp(frame.delta, 0, .08);
      const moving = frame.playing === true && frame.reducedMotion !== true;
      const speed = settings.fogSpeed === undefined ? .45 : clamp(settings.fogSpeed, 0, 2);
      if (moving && settings.fogEnabled !== false) fogTime += delta * speed;
      if (moving && settings.waterEnabled !== false) waterTime += delta;
      const energy = moving && settings.audioReactive !== false ? clamp(frame.bass, 0, 1) : 0;
      fogMaterial.uniforms.uTime.value = fogTime;
      fogMaterial.uniforms.uDensity.value = settings.fogDensity === undefined ? .55 : clamp(settings.fogDensity, 0, 1);
      fogMaterial.uniforms.uHeight.value = settings.fogHeight === undefined ? 1 : clamp(settings.fogHeight, .4, 1.8);
      fogMaterial.uniforms.uSpread.value = settings.fogSpread === undefined ? 1 : clamp(settings.fogSpread, .4, 1.8);
      fogMaterial.uniforms.uEnergy.value = energy;
      mist.visible = settings.fogEnabled !== false && fogMaterial.uniforms.uDensity.value > 0;
      waterMaterial.uniforms.uTime.value = waterTime;
      waterMaterial.uniforms.uEnergy.value = energy;
      waterMaterial.uniforms.uTowerStrength.value = settings.towersEnabled === false ? 0 : 1;
      water.visible = settings.waterEnabled !== false;
    }
    function setPalette(colors) {
      if (disposed) return;
      const palette = normalizePalette(colors);
      fogMaterial.uniforms.uColorA.value.copy(toThreeColor(THREE, palette[0]));
      fogMaterial.uniforms.uColorB.value.copy(toThreeColor(THREE, palette[1]));
      waterMaterial.uniforms.uColorA.value.copy(toThreeColor(THREE, palette[0]));
    }
    function diagnostics() {
      return { time: fogTime, waterTime, layerCount, enabled: mist.visible,
        density: fogMaterial.uniforms.uDensity.value, speed: activeSettings.fogSpeed ?? .45,
        height: fogMaterial.uniforms.uHeight.value, spread: fogMaterial.uniforms.uSpread.value,
        waterEnabled: water.visible, disposed };
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose(); waterGeometry.dispose();
      fogMaterial.dispose(); waterMaterial.dispose(); noise.dispose();
      if (group.parent) group.parent.remove(group);
      group.clear();
    }
    return { group, fogMaterial, waterMaterial, update, setPalette, diagnostics, dispose };
  }

  function create(host, options) {
    const config = options || {};
    const THREE = config.THREE || global.THREE;
    if (!host || !THREE) return null;
    if (!global.FeHarmonicOrbitalCore?.create || !global.FeHarmonicOrbitalAtmosphere?.create) {
      throw new Error('Harmonic orbital dependencies are not loaded');
    }
    const palette = normalizePalette(config.palette);
    const renderer = typeof config.createRenderer === 'function'
      ? config.createRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      : new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x020907, 1);
    if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.className = 'harmonic-state-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.replaceChildren(renderer.domElement);
    const quality = createRenderQuality(renderer, THREE, config.renderQualityOptions);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020907, 0.011);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
    camera.position.set(0, 0.45, 17.5);
    camera.lookAt(0, 0.2, 0);
    const group = new THREE.Group();
    group.name = 'HarmonicStateGallery';
    group.scale.setScalar(1 / Math.sqrt(2.35));
    scene.add(group);
    const stardust = buildStarDust(THREE, 1000);
    group.add(stardust.points);
    const orbital = global.FeHarmonicOrbitalCore.create(THREE);
    orbital.group.position.set(0, 0, -4);
    group.add(orbital.group);
    const lightTowers = buildLightTowers(THREE);
    group.add(lightTowers.group);
    const atmosphere = global.FeHarmonicOrbitalAtmosphere.create(THREE);
    atmosphere.group.position.set(0, 0, -4);
    group.add(atmosphere.group);
    const gallery = new THREE.Group();
    gallery.name = 'HarmonicHorizontalGallery';
    group.add(gallery);
    const backdrop = new THREE.WebGLRenderTarget(640, 360, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false
    });
    backdrop.texture.encoding = renderer.outputEncoding;
    const cards = Array.from({ length: CARD_COUNT }, (_, i) => createCardMesh(THREE, gallery, backdrop, i));
    const runtime = {
      THREE, host, renderer, scene, camera, group, gallery, cards, backdrop, orbital, lightTowers, atmosphere,
      effects: global.FeHarmonicSettings.normalize(config.effects), effectsSource: config.effects,
      keyDirectionWorld: new THREE.Vector3(),
      stardust,
      renderQuality: quality.controller, renderQualityRequest: 'native', qualitySurface: null,
      renderQualityFallbackReason: quality.controller ? '' : quality.error, renderQualityLastError: '',
      palette, paletteHex: palette.map(rgbHex),
      bass: 0, energy: 0, mid: 0, treble: 0, beat: 0,
      visualTime: 0, lyricMotionTime: 0, orbitPhase: 0, basePhase: 0, targetPhase: 0, activeSlot: 0,
      frameCount: 0, lastNow: null, lastResizeCheckAt: 0,
      width: 0, height: 0, pixelRatio: 1,
      lastTextSignature: '', lastLyricKey: '', lastSongKey: '',
      coverUrl: '', coverGeneration: 0, coverImage: null, entries: null, disposed: false
    };
    applyPalette(runtime, palette);
    setEffects(runtime, config.effects);
    drawLyricCards(runtime, galleryEntries({}));
    resize(runtime, config.pixelRatio);
    positionGallery(runtime, 0, false);
    return runtime;
  }

  function applyPalette(runtime, palette) {
    if (!runtime || runtime.disposed) return false;
    runtime.palette = normalizePalette(palette);
    runtime.paletteHex = runtime.palette.map(rgbHex);
    applyEffectsPalette(runtime);
    ['--harmonic-a', '--harmonic-b', '--harmonic-hot'].forEach((key, index) => {
      const color = runtime.palette[index];
      runtime.host.style.setProperty(key, [color.r, color.g, color.b].join(','));
    });
    if (runtime.entries) drawLyricCards(runtime, runtime.entries);
    return true;
  }

  function applyEffectsPalette(runtime) {
    const colors = runtime.effects.colorMode === 'cover' ? runtime.palette : ['colorA', 'colorB', 'colorC'].map(key => {
      const hex = (runtime.effects.colorMode === 'custom' ? runtime.effects : global.FeHarmonicSettings.defaults)[key];
      const value = parseInt(hex.slice(1), 16);
      return { r: (value >>> 16) & 255, g: (value >>> 8) & 255, b: value & 255 };
    });
    runtime.lightTowers.setPalette(colors);
    runtime.orbital.setPalette(colors);
    runtime.atmosphere.setPalette(colors);
  }

  function syncLightingDirection(runtime) {
    const azimuth = runtime.effects.keyLightAzimuth * Math.PI / 180;
    const elevation = runtime.effects.keyLightElevation * Math.PI / 180;
    // Match scene lights and custom world-space shaders even while dragging.
    // Updating the parent first avoids one-frame lag from renderer-owned matrices.
    runtime.group.updateWorldMatrix(true, false);
    runtime.camera.updateWorldMatrix(true, false);
    runtime.keyDirectionWorld.set(Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
      .transformDirection(runtime.group.matrixWorld);
  }

  function setEffects(runtime, source) {
    if (!runtime || runtime.disposed) return false;
    const cardsWereVisible = runtime.gallery.visible;
    runtime.effects = global.FeHarmonicSettings.normalize(source);
    runtime.effectsSource = source;
    runtime.gallery.visible = runtime.effects.lyricCardsEnabled !== false;
    if (!runtime.gallery.visible) runtime.host.setAttribute('aria-label', '谐波之境');
    else if (!cardsWereVisible && runtime.entries) drawLyricCards(runtime, runtime.entries);
    applyEffectsPalette(runtime);
    syncLightingDirection(runtime);
    // Apply visibility and geometry immediately, without moving any animation clock.
    const frame = { settings: runtime.effects, delta: 0, playing: false,
      pixelRatio: runtime.pixelRatio, ringRadius: 11.36 * runtime.effects.ringScale,
      keyDirectionWorld: runtime.keyDirectionWorld, camera: runtime.camera, towers: runtime.lightTowers };
    runtime.lightTowers.update(frame);
    runtime.orbital.update(frame);
    // The cube motion is resolved by the orbital core first so the cold-air
    // stream can attach to the current lower corners without a one-frame lag.
    frame.cubeAnchors = runtime.orbital.getCubeAnchors?.();
    runtime.atmosphere.update(frame);
    runtime.atmosphere.invalidateReflection();
    return true;
  }

  function resize(runtime, pixelRatio) {
    if (!runtime || runtime.disposed) return false;
    const rect = runtime.host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    const nextPixelRatio = clamp(pixelRatio || global.devicePixelRatio || 1, 0.5, MAX_PIXEL_RATIO);
    if (width === runtime.width && height === runtime.height && Math.abs(nextPixelRatio - runtime.pixelRatio) < 0.01) return false;
    runtime.width = width;
    runtime.height = height;
    runtime.pixelRatio = nextPixelRatio;
    runtime.renderer.setPixelRatio(nextPixelRatio);
    if (runtime.renderQuality) runtime.renderQuality.resize(width, height, nextPixelRatio);
    else runtime.renderer.setSize(width, height, false);
    runtime.camera.aspect = width / height;
    // Keep the foreground card readable on portrait windows without cropping its text.
    runtime.camera.fov = width / height < 1.1 ? 2 * Math.atan(6.3 / (13 * width / height)) * 180 / Math.PI : 48;
    runtime.camera.updateProjectionMatrix();
    const backdropScale = Math.min(0.7, 1100 / width, 850 / height);
    runtime.backdrop.setSize(Math.max(1, Math.round(width * backdropScale)), Math.max(1, Math.round(height * backdropScale)));
    runtime.stardust.material.uniforms.uPixelRatio.value = nextPixelRatio;
    return true;
  }

  function positionGallery(runtime, phase, reducedMotion) {
    runtime.orbitPhase = phase;
    runtime.cards.forEach((card, index) => {
      const pose = cardOrbitPose(index, CARD_COUNT, phase);
      card.mesh.position.set(pose.x, pose.y, pose.z);
      card.mesh.rotation.set(0, pose.yaw, reducedMotion ? 0 : pose.roll);
      // Far cards render first. Back-facing glass stays visible but its text is suppressed in the shader.
      card.mesh.renderOrder = 10 + Math.round((pose.z + 5) * 10);
    });
  }

  function update(runtime, frame = {}) {
    if (!runtime || runtime.disposed) return false;
    const startedAt = performance.now();
    const now = Number.isFinite(Number(frame.now)) ? Number(frame.now) : startedAt;
    const dt = runtime.lastNow === null ? 0 : clamp((now - runtime.lastNow) / 1000, 0, 0.08);
    runtime.lastNow = now;
    runtime.frameCount += 1;
    if (!runtime.lastResizeCheckAt || now - runtime.lastResizeCheckAt > 260) {
      runtime.lastResizeCheckAt = now;
      resize(runtime, frame.pixelRatio);
    }
    const playing = frame.playing === true;
    const reducedMotion = frame.reducedMotion === true;
    if (frame.effects && frame.effects !== runtime.effectsSource) setEffects(runtime, frame.effects);
    const idleMotion = !playing && runtime.effects.idleAnimation && !reducedMotion;
    if ((playing || idleMotion) && !reducedMotion) runtime.visualTime += dt * (playing ? 1 : 0.35);
    if (playing && !reducedMotion) runtime.lyricMotionTime += dt;
    const time = runtime.visualTime;
    for (const key of ['bass', 'energy', 'mid', 'treble', 'beat']) {
      const target = playing ? clamp(frame[key], 0, 1.25) : 0;
      const rate = target > runtime[key] ? 9 : 4;
      runtime[key] += (target - runtime[key]) * (1 - Math.exp(-dt * rate));
    }
    runtime.stardust.material.uniforms.uTime.value = time;
    runtime.stardust.material.uniforms.uBeat.value = runtime.beat;
    const yaw = Number(frame.yaw) || 0, pitch = Number(frame.pitch) || 0;
    const zoom = clamp(Number(frame.zoom) || 2.35, 0.58, 2.35);
    runtime.group.rotation.set(pitch * 0.12, yaw * 0.16, 0);
    runtime.group.scale.setScalar(1 / Math.sqrt(zoom));
    runtime.camera.position.z = 17.5;
    runtime.camera.lookAt(0, 0.2, 0);
    syncLightingDirection(runtime);
    const effectsFrame = { time, delta: dt, bass: runtime.bass, mid: runtime.mid, treble: runtime.treble,
      beat: runtime.beat, energy: runtime.energy, pixelRatio: runtime.pixelRatio,
      keyDirectionWorld: runtime.keyDirectionWorld, camera: runtime.camera,
      towers: runtime.lightTowers,
      ringRadius: 11.36 * runtime.effects.ringScale, playing, idleMotion, reducedMotion, settings: runtime.effects };
    runtime.lightTowers.update(effectsFrame);
    runtime.orbital.update(effectsFrame);
    effectsFrame.cubeAnchors = runtime.orbital.getCubeAnchors?.();
    runtime.atmosphere.update(effectsFrame);

    const entries = galleryEntries(frame);
    const songKey = safeText(frame.songKey);
    const lyricKey = safeText(frame.lyricKey, entries[3].key + '|' + entries[3].text);
    const songChanged = songKey !== runtime.lastSongKey;
    if (songChanged) {
      runtime.lastSongKey = songKey;
      runtime.basePhase = runtime.targetPhase = 0;
      runtime.activeSlot = 0;
      runtime.lastLyricKey = '';
    }
    if (lyricKey !== runtime.lastLyricKey) {
      if (runtime.lastLyricKey) {
        runtime.activeSlot = (runtime.activeSlot + 1) % CARD_COUNT;
        runtime.targetPhase = -runtime.activeSlot * CARD_ORBIT_STEP;
      }
      runtime.lastLyricKey = lyricKey;
      if (!playing || reducedMotion) runtime.basePhase = runtime.targetPhase;
    }
    const signature = JSON.stringify([entries, runtime.activeSlot]);
    if (signature !== runtime.lastTextSignature) {
      runtime.lastTextSignature = signature;
      drawLyricCards(runtime, entries);
    }
    if (runtime.gallery.visible) requestCover(runtime, safeText(frame.coverUrl));
    const phaseDelta = Math.atan2(Math.sin(runtime.targetPhase - runtime.basePhase), Math.cos(runtime.targetPhase - runtime.basePhase));
    if (reducedMotion) runtime.basePhase = runtime.targetPhase;
    else if (playing) runtime.basePhase += phaseDelta * (1 - Math.exp(-dt * 5.5));
    runtime.basePhase = Math.atan2(Math.sin(runtime.basePhase), Math.cos(runtime.basePhase));
    // Small motion between lines; a line change advances the carousel by one card.
    // The current lyric remains near the reading axis instead of orbiting out of sight.
    const sway = reducedMotion ? 0 : Math.sin(runtime.lyricMotionTime * 0.36) * 0.07;
    if (runtime.gallery.visible) {
      positionGallery(runtime, runtime.basePhase + sway, reducedMotion);
      runtime.cards.forEach(card => {
        card.glassMaterial.uniforms.uTime.value = time;
        card.glassMaterial.uniforms.uProgress.value = clamp(frame.lyricFraction, 0, 1);
      });
    }

    // The bounded water pass reflects the actual Three.js scene, with the water
    // itself hidden. It is shared by both the glass-card capture and final view.
    runtime.atmosphere.renderReflection(runtime.renderer,runtime.scene,runtime.camera,now,
      runtime.gallery.visible ? `${time}|${runtime.lastTextSignature}|${runtime.orbitPhase}` : time);

    // One shared scene capture supplies all seven refractive cards, including under FSR.
    const previousTarget = runtime.renderer.getRenderTarget();
    if (runtime.gallery.visible) {
      runtime.gallery.visible = false;
      try {
        runtime.renderer.setRenderTarget(runtime.backdrop);
        runtime.renderer.render(runtime.scene, runtime.camera);
      } finally {
        runtime.renderer.setRenderTarget(previousTarget);
        runtime.gallery.visible = true;
      }
    }
    let renderedByQuality = false;
    if (runtime.renderQuality) {
      const previousOutputEncoding = runtime.renderer.outputEncoding;
      try {
        const quality = runtime.renderQuality.getDiagnostics();
        let scene = runtime.scene, camera = runtime.camera;
        if (quality.enabled) {
          const surface = qualitySurface(runtime, quality);
          try {
            runtime.renderer.setRenderTarget(surface.target);
            runtime.renderer.render(runtime.scene, runtime.camera);
          } finally {
            runtime.renderer.setRenderTarget(previousTarget);
          }
          scene = surface.scene;
          camera = surface.camera;
          runtime.renderer.outputEncoding = runtime.THREE.LinearEncoding;
        } else {
          disposeQualitySurface(runtime);
        }
        renderedByQuality = runtime.renderQuality.render(scene, camera, now) === true;
        if (!renderedByQuality) disableRenderQuality(runtime, 'render-returned-false', 'render-quality-render-failed');
      } catch (error) {
        disableRenderQuality(runtime, error, 'render-quality-render-failed');
      } finally {
        runtime.renderer.outputEncoding = previousOutputEncoding;
      }
    }
    if (!renderedByQuality) runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.drawCalls = Number(runtime.renderer.info?.render?.calls) || 0;
    runtime.lastUpdateMs = performance.now() - startedAt;
    runtime.averageUpdateMs = runtime.averageUpdateMs ? runtime.averageUpdateMs * 0.92 + runtime.lastUpdateMs * 0.08 : runtime.lastUpdateMs;
    return true;
  }

  function diagnostics(runtime) {
    if (!runtime || runtime.disposed) return { disposed: true, canvasCount: 0 };
    let finiteUniforms = true;
    runtime.scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) for (const uniform of Object.values(material?.uniforms || {})) {
        if (typeof uniform.value === 'number' && !Number.isFinite(uniform.value)) finiteUniforms = false;
      }
    });
    return {
      active: true, disposed: false, width: runtime.width, height: runtime.height, pixelRatio: runtime.pixelRatio,
      particleCount: runtime.orbital.dotGeometry.drawRange.count,
      stardustCount: runtime.stardust.points.geometry.getAttribute('position').count,
      cardCount: runtime.cards.length, crystalCount: 0, orbital: runtime.orbital.diagnostics(),
      lyricCardsVisible: runtime.gallery.visible,
      towerCount: runtime.lightTowers.anchors.length, fogLayerCount: runtime.atmosphere.diagnostics().layerCount,
      towers: runtime.lightTowers.diagnostics(), atmosphere: runtime.atmosphere.diagnostics(), effects: { ...runtime.effects },
      orbitPhase: runtime.orbitPhase, maxCardY: Math.max(...runtime.cards.map(card => Math.abs(card.mesh.position.y))),
      finiteUniforms, activeText: runtime.entries?.[3]?.text || '',
      drawCalls: runtime.drawCalls || 0, frameCount: runtime.frameCount,
      lastUpdateMs: Number(runtime.lastUpdateMs || 0).toFixed(3),
      averageUpdateMs: Number(runtime.averageUpdateMs || 0).toFixed(3),
      audio: Object.fromEntries(['bass', 'energy', 'mid', 'treble', 'beat'].map(key => [key, Number(runtime[key].toFixed(4))])),
      palette: runtime.paletteHex.slice(),
      rotationYawDegrees: Number((runtime.group.rotation.y * 180 / Math.PI).toFixed(2)),
      canvasCount: runtime.host.querySelectorAll('canvas').length,
      renderQuality: renderQualityDiagnostics(runtime)
    };
  }

  function dispose(runtime) {
    if (!runtime || runtime.disposed) return false;
    runtime.disposed = true;
    runtime.coverGeneration += 1;
    runtime.coverImage = null;
    runtime.renderQuality?.dispose?.();
    runtime.renderQuality = null;
    disposeQualitySurface(runtime);
    runtime.stardust.geometry.dispose();
    runtime.stardust.material.dispose();
    runtime.orbital.dispose();
    runtime.lightTowers.dispose();
    runtime.atmosphere.dispose();
    runtime.backdrop.dispose();
    runtime.cards.forEach(card => {
      card.texture.dispose();
      card.mesh.geometry.dispose();
      card.glassMaterial.dispose();
    });
    runtime.renderer.renderLists?.dispose?.();
    runtime.renderer.dispose?.();
    runtime.renderer.forceContextLoss?.();
    runtime.renderer.domElement.remove();
    disposeCount += 1;
    return true;
  }

  global.FeHarmonicStateRuntime = Object.freeze({
    create,
    update,
    resize,
    setPalette: applyPalette,
    setEffects,
    setRenderQuality,
    diagnostics,
    dispose
  });
})(window);
