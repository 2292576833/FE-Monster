(function attachFreeCubeRuntime(global) {
  'use strict';

  const TAU = Math.PI * 2;
  const DEFAULT_CUBE_COUNT = 1800;
  const DEFAULT_PARTICLE_COUNT = 1400;
  const ENVIRONMENT_FACE_SIZE = 64;
  const MAX_PIXEL_RATIO = 2.5;
  const CUBE_NORMAL_BLEND = 0.18;
  const FREE_DEPTH_DEAD_ZONE = 0.04;
  const FREE_DEPTH_LAYER_LIMIT = 3.8;
  const FREE_DEPTH_LAYER_DISPLACEMENTS = [6, 3.5, -2];
  const FREE_DEPTH_STAGGER_MS = [0, 40, 70];
  const FREE_DEPTH_ATTACK_RATE = 14.2857;
  const FREE_DEPTH_RELEASE_RATE = 2.9412;
  const FREE_DEPTH_HISTORY_SIZE = 64;
  const HEART_GRID_COLUMNS = 17;
  const HEART_GRID_ROWS = 15;
  const HEART_DEPTH_LAYER_COUNT = 4;
  const HEART_GRID_SPACING = 0.93;
  const HEART_GRID_SPACING_Y = 0.82;
  const HEART_CUBE_SCALE = 1.08;
  const HEART_CUBE_SIZE = 0.78 * HEART_CUBE_SCALE;
  const HEART_DEPTH_SPACING = HEART_CUBE_SIZE * 1.2;
  const HEART_CAMERA_Z = 18;
  const HEART_CAMERA_FOV = 55;
  const HEART_OFFSET_X = 3.45;
  const HEART_OFFSET_Y = -2.15;
  const HEART_REST_YAW = 0.16;
  const HEART_REST_PITCH = -0.08;
  const PLAYBACK_REST_YAW = 0.22;
  const PLAYBACK_REST_PITCH = -0.16;
  const HEART_ATTACK_RATE = 10.46;
  const HEART_RELEASE_RATE = 12.2;
  const HEART_PUSH_CUBES = 1.25;
  const HEART_SPECTRUM_BAND_COUNT = 4;
  const HEART_SPECTRUM_RANGES_HZ = Object.freeze([
    Object.freeze([20, 52.5]),
    Object.freeze([52.5, 85]),
    Object.freeze([85, 117.5]),
    Object.freeze([117.5, 150])
  ]);
  const SUNSET_FADE_MS = 296;
  const SKY_BLACK_GAP_MS = 36;
  const NIGHT_FADE_MS = 2459;
  const SKY_TRANSITION_MS = SUNSET_FADE_MS + SKY_BLACK_GAP_MS + NIGHT_FADE_MS;
  let disposeCount = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
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

  function smoothstep(value) {
    const next = clamp(value, 0, 1);
    return next * next * (3 - 2 * next);
  }

  function delayedDepthSample(runtime, now, delayMs) {
    if (delayMs <= 0 || runtime.freeDepthHistoryCount <= 1) return runtime.freeDepthEnvelope;
    const targetTime = now - delayMs;
    const size = runtime.freeDepthHistoryValues.length;
    let newerIndex = (runtime.freeDepthHistoryCursor - 1 + size) % size;
    let newerTime = runtime.freeDepthHistoryTimes[newerIndex];
    let newerValue = runtime.freeDepthHistoryValues[newerIndex];
    if (targetTime >= newerTime) return newerValue;

    for (let step = 1; step < runtime.freeDepthHistoryCount; step += 1) {
      const olderIndex = (newerIndex - 1 + size) % size;
      const olderTime = runtime.freeDepthHistoryTimes[olderIndex];
      const olderValue = runtime.freeDepthHistoryValues[olderIndex];
      if (olderTime <= targetTime) {
        const amount = clamp((targetTime - olderTime) / Math.max(0.001, newerTime - olderTime), 0, 1);
        return olderValue + (newerValue - olderValue) * amount;
      }
      newerIndex = olderIndex;
      newerTime = olderTime;
      newerValue = olderValue;
    }
    return newerValue;
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
      { r: 109, g: 226, b: 255 },
      { r: 189, g: 135, b: 255 },
      { r: 255, g: 117, b: 194 }
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

  function rgbCss(color, alpha) {
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
  }

  function rgbHex(color) {
    const part = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
    return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
  }

  function buildHeartPositions(count) {
    const positions = new Float32Array(count * 3);
    const active = new Uint8Array(count);
    const layers = new Uint8Array(count);
    layers.fill(255);
    const columns = new Int8Array(count);
    const rows = new Int8Array(count);
    const pulseWeights = new Float32Array(count);
    const depthSigns = new Int8Array(count);
    const mirrorIndices = new Int32Array(count);
    mirrorIndices.fill(-1);
    const spectrumBands = new Uint8Array(count);
    spectrumBands.fill(255);
    const spectrumSamples = new Uint8Array(count);
    const mask = [
      [-5, -4, -3, -2, 2, 3, 4, 5],
      [-7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7],
      [-8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8],
      [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
      [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6],
      [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
      [-4, -3, -2, -1, 0, 1, 2, 3, 4],
      [-3, -2, -1, 0, 1, 2, 3],
      [-2, -1, 0, 1, 2],
      [-1, 0, 1],
      [0]
    ];
    let written = 0;
    const surfaceCounts = new Array(HEART_DEPTH_LAYER_COUNT).fill(0);
    const spectrumCubeCounts = new Array(HEART_SPECTRUM_BAND_COUNT).fill(0);
    const cells = [];
    for (let row = 0; row < mask.length; row += 1) {
      for (const column of mask[row]) {
        const spectrumBand = row >= 10 ? 0 : row >= 7 ? 1 : row >= 4 ? 2 : 3;
        const sampleHash = Math.abs(column) * 37 + row * 53 + (Math.abs(column) + row) * 11;
        cells.push({ column, row, spectrumBand, spectrumSample: sampleHash % 128 });
      }
    }
    const completeCellCount = Math.min(cells.length, Math.floor(count / HEART_DEPTH_LAYER_COUNT));
    const depthCoordinates = [-1.5, -0.5, 0.5, 1.5];
    const depthPulseGains = [1, 0.72, 0.72, 1];
    for (const cell of cells) {
      if (written / HEART_DEPTH_LAYER_COUNT >= completeCellCount) break;
      const cellStart = written;
      for (let layer = 0; layer < HEART_DEPTH_LAYER_COUNT; layer += 1) {
        const offset = written * 3;
        const depth = depthCoordinates[layer];
        positions[offset] = cell.column * HEART_GRID_SPACING;
        positions[offset + 1] = (7 - cell.row) * HEART_GRID_SPACING_Y;
        positions[offset + 2] = depth * HEART_DEPTH_SPACING;
        active[written] = 1;
        layers[written] = layer;
        columns[written] = cell.column;
        rows[written] = cell.row;
        pulseWeights[written] = depthPulseGains[layer];
        depthSigns[written] = depth < 0 ? -1 : 1;
        mirrorIndices[written] = cellStart + (HEART_DEPTH_LAYER_COUNT - 1 - layer);
        spectrumBands[written] = cell.spectrumBand;
        spectrumSamples[written] = cell.spectrumSample;
        surfaceCounts[layer] += 1;
        spectrumCubeCounts[cell.spectrumBand] += 1;
        written += 1;
      }
    }
    return {
      positions,
      active,
      layers,
      columns,
      rows,
      pulseWeights,
      depthSigns,
      mirrorIndices,
      spectrumBands,
      spectrumSamples,
      spectrumCubeCounts,
      activeCount: written,
      surfaceCellCount: completeCellCount,
      frontLayerCount: (surfaceCounts[2] || 0) + (surfaceCounts[3] || 0),
      gridColumns: HEART_GRID_COLUMNS,
      gridRows: HEART_GRID_ROWS,
      gridSpacing: HEART_GRID_SPACING,
      cubeScale: HEART_CUBE_SCALE,
      cubeSize: HEART_CUBE_SIZE,
      depthLayerCount: HEART_DEPTH_LAYER_COUNT,
      middleLayerCount: (surfaceCounts[1] || 0) + (surfaceCounts[2] || 0),
      surfaceCounts,
      profile: 'voxel-heart-symmetric-spectrum-v2',
      jitter: 0
    };
  }

  function buildFreePositions(count, random) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const rawX = random() * 2 - 1;
      const rawY = random() * 2 - 1;
      positions[offset] = Math.sign(rawX || 1) * Math.pow(Math.abs(rawX), 0.78) * 42;
      positions[offset + 1] = Math.sign(rawY || 1) * Math.pow(Math.abs(rawY), 0.86) * 22.5;
      positions[offset + 2] = (random() * 2 - 1) * 11.5;
    }
    return positions;
  }

  function buildParticleGeometry(THREE, count, random) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const radii = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const phase = random() * TAU;
      const radius = 18 + Math.pow(random(), 0.68) * 28;
      const ribbon = index % 3;
      const inclination = ribbon === 0 ? 0.24 : ribbon === 1 ? -0.38 : 0.62;
      positions[offset] = Math.cos(phase) * radius;
      positions[offset + 1] = Math.sin(phase) * radius * (0.26 + ribbon * 0.065) + (random() - 0.5) * 5;
      positions[offset + 2] = Math.sin(phase + inclination) * radius * 0.47 + (random() - 0.5) * 5;
      colors[offset] = 1;
      colors[offset + 1] = 1;
      colors[offset + 2] = 1;
      phases[index] = phase;
      radii[index] = radius;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    return { geometry, phases, radii };
  }

  function buildEnvironmentTexture(THREE) {
    const faces = [
      ['#07111d', '#9fefff', '#160d28'],
      ['#130a20', '#ffd9f2', '#061522'],
      ['#091b27', '#ffffff', '#291339'],
      ['#05070e', '#75cde2', '#16091e'],
      ['#081624', '#d5b8ff', '#05070d'],
      ['#160b20', '#94e9ff', '#03050b']
    ].map((colors, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = ENVIRONMENT_FACE_SIZE;
      canvas.height = ENVIRONMENT_FACE_SIZE;
      const context = canvas.getContext('2d');
      const gradient = context.createLinearGradient(
        index % 2 ? ENVIRONMENT_FACE_SIZE : 0,
        0,
        index % 2 ? 0 : ENVIRONMENT_FACE_SIZE,
        ENVIRONMENT_FACE_SIZE
      );
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.46, colors[1]);
      gradient.addColorStop(1, colors[2]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, ENVIRONMENT_FACE_SIZE, ENVIRONMENT_FACE_SIZE);
      return canvas;
    });
    const texture = new THREE.CubeTexture(faces);
    if ('encoding' in texture && THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    texture.generateMipmaps = true;
    if (THREE.LinearMipmapLinearFilter !== undefined) texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (THREE.LinearFilter !== undefined) texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  function canvasTexture(THREE, canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    if ('encoding' in texture && THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    if (THREE.LinearFilter !== undefined) {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function buildSkyCanvas(mode) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 432;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    if (mode === 'sunset') {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#713ca0');
      gradient.addColorStop(0.35, '#b95899');
      gradient.addColorStop(0.66, '#ee7b79');
      gradient.addColorStop(0.82, '#f7ad73');
      gradient.addColorStop(1, '#7e4d78');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const horizon = context.createRadialGradient(width * 0.84, height * 0.61, 2, width * 0.84, height * 0.61, width * 0.39);
      horizon.addColorStop(0, 'rgba(255, 249, 190, .98)');
      horizon.addColorStop(0.14, 'rgba(255, 196, 112, .84)');
      horizon.addColorStop(0.55, 'rgba(255, 117, 112, .22)');
      horizon.addColorStop(1, 'rgba(255, 100, 130, 0)');
      context.fillStyle = horizon;
      context.fillRect(0, 0, width, height);

      const random = seededRandom(0x51A7C10D);
      context.save();
      context.filter = 'blur(9px)';
      for (let cloud = 0; cloud < 42; cloud += 1) {
        const x = (random() * 1.18 - 0.12) * width;
        const y = (0.05 + random() * 0.58) * height;
        const radiusX = (0.035 + random() * 0.12) * width;
        const radiusY = (0.018 + random() * 0.05) * height;
        const bright = random() > 0.34;
        context.fillStyle = bright
          ? `rgba(255, ${Math.round(154 + random() * 66)}, ${Math.round(131 + random() * 72)}, ${0.16 + random() * 0.28})`
          : `rgba(104, 46, 118, ${0.12 + random() * 0.22})`;
        context.beginPath();
        context.ellipse(x, y, radiusX, radiusY, random() * 0.18 - 0.09, 0, TAU);
        context.fill();
      }
      context.restore();
      context.fillStyle = 'rgba(55, 35, 88, .36)';
      context.fillRect(0, height * 0.79, width, height * 0.21);
    } else {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#050715');
      gradient.addColorStop(0.48, '#111127');
      gradient.addColorStop(0.78, '#21152f');
      gradient.addColorStop(1, '#090a18');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const haze = context.createRadialGradient(width * 0.26, height * 0.12, 1, width * 0.26, height * 0.12, width * 0.45);
      haze.addColorStop(0, 'rgba(115, 76, 151, .23)');
      haze.addColorStop(0.5, 'rgba(47, 35, 89, .13)');
      haze.addColorStop(1, 'rgba(15, 11, 38, 0)');
      context.fillStyle = haze;
      context.fillRect(0, 0, width, height);
      const random = seededRandom(0xA57A119);
      for (let star = 0; star < 145; star += 1) {
        const x = random() * width;
        const y = random() * height * 0.8;
        const radius = 0.35 + Math.pow(random(), 2) * 1.45;
        context.fillStyle = `rgba(${Math.round(187 + random() * 68)}, ${Math.round(188 + random() * 62)}, 255, ${0.22 + random() * 0.62})`;
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
      }
    }
    return canvas;
  }

  function buildGroundCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(236, 214, 18, 256, 256, 360);
    gradient.addColorStop(0, '#fff0df');
    gradient.addColorStop(0.55, '#e7b9ce');
    gradient.addColorStop(1, '#6d4c82');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
    const random = seededRandom(0xC1AC1E);
    for (let patch = 0; patch < 54; patch += 1) {
      const x = random() * 512;
      const y = random() * 512;
      const size = 8 + random() * 25;
      context.save();
      context.translate(x, y);
      context.rotate((random() - 0.5) * 0.42);
      context.fillStyle = random() > 0.42
        ? `rgba(160, 112, 190, ${0.12 + random() * 0.24})`
        : `rgba(94, 133, 198, ${0.1 + random() * 0.2})`;
      context.fillRect(-size, -size * 0.44, size * 2, size * 0.88);
      context.restore();
    }
    return canvas;
  }

  function buildShadowCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(128, 64, 4, 128, 64, 112);
    gradient.addColorStop(0, 'rgba(34, 2, 8, .72)');
    gradient.addColorStop(0.34, 'rgba(48, 5, 18, .46)');
    gradient.addColorStop(0.72, 'rgba(38, 5, 28, .16)');
    gradient.addColorStop(1, 'rgba(25, 3, 28, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function buildVideoBackdrop(THREE, scene) {
    const skyGeometry = new THREE.PlaneGeometry(126, 72);
    const nightTexture = canvasTexture(THREE, buildSkyCanvas('night'));
    const sunsetTexture = canvasTexture(THREE, buildSkyCanvas('sunset'));
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uNight: { value: 0 },
        uSunset: { value: 1 },
        uNightMap: { value: nightTexture },
        uSunsetMap: { value: sunsetTexture }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uNight; uniform float uSunset; uniform sampler2D uNightMap; uniform sampler2D uSunsetMap; varying vec2 vUv; void main(){ vec3 color=vec3(0.006,0.006,0.018); color=mix(color,texture2D(uNightMap,vUv).rgb,clamp(uNight,0.0,1.0)); color=mix(color,texture2D(uSunsetMap,vUv).rgb,clamp(uSunset,0.0,1.0)); gl_FragColor=vec4(color,1.0); }',
      transparent: false,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.position.z = -45;
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    scene.add(sky);

    const groundTexture = canvasTexture(THREE, buildGroundCanvas());
    const groundGeometry = new THREE.CircleGeometry(27, 64);
    const groundMaterial = new THREE.MeshBasicMaterial({ map: groundTexture, color: 0xffe6df, transparent: true, opacity: 0.92, depthWrite: true, toneMapped: false });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(HEART_OFFSET_X, -9.3, -2.4);
    scene.add(ground);

    const shadowTexture = canvasTexture(THREE, buildShadowCanvas());
    const shadowGeometry = new THREE.PlaneGeometry(13.5, 6.6);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(HEART_OFFSET_X, -9.22, 0.25);
    shadow.renderOrder = 2;
    scene.add(shadow);

    return {
      skyGeometry,
      sky,
      skyMaterial,
      nightTexture,
      sunsetTexture,
      groundTexture,
      groundGeometry,
      groundMaterial,
      ground,
      shadowTexture,
      shadowGeometry,
      shadowMaterial,
      shadow
    };
  }

  function softenBoxNormals(geometry, amount = CUBE_NORMAL_BLEND) {
    const positions = geometry && geometry.getAttribute && geometry.getAttribute('position');
    const normals = geometry && geometry.getAttribute && geometry.getAttribute('normal');
    if (!positions || !normals || positions.count !== normals.count) return 0;
    const blend = clamp(amount, 0, 1);
    for (let index = 0; index < positions.count; index += 1) {
      const px = positions.getX(index);
      const py = positions.getY(index);
      const pz = positions.getZ(index);
      const positionLength = Math.max(0.0001, Math.hypot(px, py, pz));
      const nx = normals.getX(index) * (1 - blend) + px / positionLength * blend;
      const ny = normals.getY(index) * (1 - blend) + py / positionLength * blend;
      const nz = normals.getZ(index) * (1 - blend) + pz / positionLength * blend;
      const normalLength = Math.max(0.0001, Math.hypot(nx, ny, nz));
      normals.setXYZ(index, nx / normalLength, ny / normalLength, nz / normalLength);
    }
    normals.needsUpdate = true;
    return blend;
  }

  function createRenderQuality(renderer, THREE, config) {
    if (!global.FeRenderQuality || typeof global.FeRenderQuality.create !== 'function') {
      return { controller: null, error: 'render-quality-unavailable' };
    }
    try {
      const requestedTargetFrameMs = Number(config && config.targetFrameMs);
      const requestedSharpness = Number(config && config.sharpness);
      return {
        controller: global.FeRenderQuality.create(renderer, {
          THREE,
          mode: 'native',
          initialScale: 1,
          minScale: 0.5,
          maxScale: 1,
          targetFrameMs: clamp(Number.isFinite(requestedTargetFrameMs) ? requestedTargetFrameMs : 24, 8, 100),
          sharpness: clamp(Number.isFinite(requestedSharpness) ? requestedSharpness : 0.24, 0, 1)
        }),
        error: ''
      };
    } catch (error) {
      return { controller: null, error: String(error && error.message || error || 'render-quality-create-failed') };
    }
  }

  function disableRenderQuality(runtime, error, reason) {
    if (!runtime) return;
    try {
      runtime.renderQuality?.dispose?.();
    } catch (disposeError) {
      // Direct rendering remains available even if post-process cleanup fails.
    }
    runtime.renderQuality = null;
    runtime.renderQualityFallbackReason = reason || 'render-quality-failed';
    runtime.renderQualityLastError = String(error && error.message || error || runtime.renderQualityFallbackReason);
  }

  function setRenderQuality(runtime, request) {
    if (!runtime || runtime.disposed || !runtime.renderQuality) return false;
    try {
      const diagnostics = runtime.renderQuality.setMode(request || 'native');
      runtime.renderQualityRequest = typeof request === 'object' && request
        ? String(request.name || 'auto')
        : String(request || 'native');
      runtime.renderQualityFallbackReason = diagnostics && diagnostics.fallbackReason || '';
      runtime.renderQualityLastError = diagnostics && diagnostics.lastError || '';
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
          request: runtime.renderQualityRequest || 'native',
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
      request: runtime && runtime.renderQualityRequest || 'native',
      mode: 'native',
      enabled: false,
      backend: 'direct',
      fallbackReason: runtime && runtime.renderQualityFallbackReason || 'render-quality-unavailable',
      lastError: runtime && runtime.renderQualityLastError || ''
    };
  }

  function applyPalette(runtime, palette) {
    if (!runtime || runtime.disposed) return;
    const THREE = runtime.THREE;
    runtime.palette = normalizePalette(palette);
    runtime.paletteHex = runtime.palette.map(rgbHex);
    const color = new THREE.Color();
    const white = new THREE.Color(0xffffff);
    for (let index = 0; index < runtime.count; index += 1) {
      const primary = runtime.palette[index % 3];
      const secondary = runtime.palette[(index + 1) % 3];
      const mixAmount = 0.12 + runtime.colorMix[index] * 0.42;
      color.setRGB(
        (primary.r + (secondary.r - primary.r) * mixAmount) / 255,
        (primary.g + (secondary.g - primary.g) * mixAmount) / 255,
        (primary.b + (secondary.b - primary.b) * mixAmount) / 255
      );
      color.lerp(white, 0.08 + runtime.colorMix[index] * 0.09);
      runtime.mesh.setColorAt(index, color);
    }
    if (runtime.mesh.instanceColor) runtime.mesh.instanceColor.needsUpdate = true;

    const particleColors = runtime.particleGeometry.getAttribute('color');
    for (let index = 0; index < runtime.particleCount; index += 1) {
      const source = runtime.palette[index % 3];
      const brightness = 0.72 + (index % 7) / 24;
      particleColors.setXYZ(
        index,
        clamp(source.r / 255 * brightness, 0, 1),
        clamp(source.g / 255 * brightness, 0, 1),
        clamp(source.b / 255 * brightness, 0, 1)
      );
    }
    particleColors.needsUpdate = true;
    const emissive = runtime.palette[0];
    runtime.material.emissive.setRGB(emissive.r / 255, emissive.g / 255, emissive.b / 255);
    const paletteTarget = runtime.host.closest('.free-cube-scene') || runtime.host;
    paletteTarget.style.setProperty('--free-cube-color-a', rgbCss(runtime.palette[0], 0.62));
    paletteTarget.style.setProperty('--free-cube-color-b', rgbCss(runtime.palette[1], 0.54));
    paletteTarget.style.setProperty('--free-cube-color-c', rgbCss(runtime.palette[2], 0.48));
    if (runtime.mode === 'heart') applyHeartColors(runtime);
  }

  function applyHeartColors(runtime) {
    if (!runtime || runtime.disposed) return;
    const THREE = runtime.THREE;
    const color = new THREE.Color();
    const depthColors = [
      [1, 0.17, 0.012],
      [0.72, 0.042, 0.003],
      [0.72, 0.042, 0.003],
      [1, 0.17, 0.012]
    ];
    for (let index = 0; index < runtime.count; index += 1) {
      if (!runtime.heartActive[index]) {
        color.setRGB(0.05, 0.002, 0.002);
      } else {
        const layer = runtime.heartDepthLayers[index];
        const source = depthColors[layer] || depthColors[3];
        const accent = (runtime.heartPulseWeights[index] - 0.15) * 0.045;
        color.setRGB(
          clamp(source[0] + accent, 0, 1),
          clamp(source[1] + accent * 0.12, 0, 1),
          clamp(source[2] + accent * 0.04, 0, 1)
        );
      }
      runtime.mesh.setColorAt(index, color);
    }
    if (runtime.mesh.instanceColor) runtime.mesh.instanceColor.needsUpdate = true;
    runtime.material.emissive.setRGB(0.78, 0.008, 0.001);
  }

  function syncScenePresentation(runtime) {
    if (!runtime || runtime.disposed) return;
    const heart = runtime.mode === 'heart';
    const sceneHost = runtime.host.closest('.free-cube-scene');
    if (sceneHost) {
      sceneHost.classList.toggle('is-heart-mode', heart);
      sceneHost.classList.toggle('has-soft-background', !heart && runtime.backgroundEnabled);
    }
    runtime.backdrop.sky.visible = false;
    runtime.backdrop.ground.visible = false;
    runtime.backdrop.shadow.visible = false;
    runtime.particles.visible = !heart && !runtime.backgroundEnabled;
    runtime.backgroundMode = heart ? 'none' : runtime.backgroundEnabled ? 'soft-glow' : 'particles';
    runtime.backgroundTransitioning = false;
    runtime.sunsetOpacity = 0;
    runtime.nightOpacity = 0;
    runtime.backdrop.skyMaterial.uniforms.uSunset.value = 0;
    runtime.backdrop.skyMaterial.uniforms.uNight.value = 0;
  }

  function resize(runtime, pixelRatio) {
    if (!runtime || runtime.disposed) return;
    runtime.layoutCheckCount += 1;
    runtime.lastResizeCheckAt = performance.now();
    const rect = runtime.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const ratio = clamp(pixelRatio || global.devicePixelRatio || 1, 0.5, MAX_PIXEL_RATIO);
    if (width === runtime.width && height === runtime.height && Math.abs(ratio - runtime.pixelRatio) < 0.01) return;
    runtime.width = width;
    runtime.height = height;
    runtime.pixelRatio = ratio;
    let resizedByRenderQuality = false;
    if (runtime.renderQuality) {
      try {
        runtime.renderQuality.resize({ width, height, dpr: ratio });
        resizedByRenderQuality = true;
      } catch (error) {
        disableRenderQuality(runtime, error, 'render-quality-resize-failed');
      }
    }
    if (!resizedByRenderQuality) {
      runtime.renderer.setPixelRatio(ratio);
      runtime.renderer.setSize(width, height, false);
    }
    runtime.camera.aspect = width / Math.max(1, height);
    runtime.camera.updateProjectionMatrix();
  }

  function setMode(runtime, mode) {
    if (!runtime || runtime.disposed) return false;
    runtime.mode = mode === 'heart' ? 'heart' : 'free';
    runtime.targetModeProgress = runtime.mode === 'heart' ? 1 : 0;
    if (runtime.mode === 'heart') applyHeartColors(runtime);
    else applyPalette(runtime, runtime.palette);
    syncScenePresentation(runtime);
    return true;
  }

  function setBackgroundEnabled(runtime, enabled) {
    if (!runtime || runtime.disposed) return false;
    runtime.backgroundEnabled = enabled !== false;
    runtime.backgroundInitialized = true;
    syncScenePresentation(runtime);
    return true;
  }

  function projectedCoverage(runtime) {
    if (!runtime || runtime.disposed || !runtime.mesh?.instanceMatrix?.array) return { width: 0, height: 0 };
    runtime.group.updateMatrixWorld(true);
    runtime.camera.updateMatrixWorld(true);
    const point = runtime.projectPoint;
    const matrices = runtime.mesh.instanceMatrix.array;
    let minX = 1;
    let maxX = -1;
    let minY = 1;
    let maxY = -1;
    const stride = runtime.count > 1200 ? 3 : 1;
    for (let index = 0; index < runtime.count; index += stride) {
      const offset = index * 16 + 12;
      point.set(
        matrices[offset],
        matrices[offset + 1],
        matrices[offset + 2]
      );
      point.applyMatrix4(runtime.group.matrixWorld).project(runtime.camera);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return {
      width: clamp((maxX - minX) * 0.5, 0, 1),
      height: clamp((maxY - minY) * 0.5, 0, 1)
    };
  }

  function refreshMotionDiagnostics(runtime) {
    const matrices = runtime?.mesh?.instanceMatrix?.array;
    if (!matrices) return;
    let checksum = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let index = 0; index < runtime.count; index += 1) {
      const offset = index * 16 + 12;
      const x = matrices[offset];
      const y = matrices[offset + 1];
      const z = matrices[offset + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      if (index % 97 === 0) checksum += x * 0.37 + y * 0.23 + z * 0.11;
    }
    runtime.bounds.minX = minX;
    runtime.bounds.maxX = maxX;
    runtime.bounds.minY = minY;
    runtime.bounds.maxY = maxY;
    runtime.bounds.minZ = minZ;
    runtime.bounds.maxZ = maxZ;
    runtime.motionChecksum = checksum;
  }

  function heartSymmetryDiagnostics(runtime, bounds) {
    let pairedCubeCount = 0;
    let maxPairPositionError = 0;
    let maxPairDisplacementError = 0;
    for (let index = 0; index < runtime.heartActiveCount; index += 1) {
      const mirrorIndex = runtime.heartMirrorIndices[index];
      if (mirrorIndex < 0 || runtime.heartActive[mirrorIndex] !== 1) continue;
      pairedCubeCount += 1;
      const offset = index * 3;
      const mirrorOffset = mirrorIndex * 3;
      maxPairPositionError = Math.max(
        maxPairPositionError,
        Math.abs(runtime.heartPositions[offset] - runtime.heartPositions[mirrorOffset]),
        Math.abs(runtime.heartPositions[offset + 1] - runtime.heartPositions[mirrorOffset + 1]),
        Math.abs(runtime.heartPositions[offset + 2] + runtime.heartPositions[mirrorOffset + 2])
      );
      maxPairDisplacementError = Math.max(
        maxPairDisplacementError,
        Math.abs(runtime.heartCurrentDisplacements[index] - runtime.heartCurrentDisplacements[mirrorIndex])
      );
    }
    const frontExtent = Math.max(0, bounds.maxZ);
    const backExtent = Math.max(0, -bounds.minZ);
    return {
      layerCounts: runtime.heartSurfaceCounts.slice(),
      pairedCubeCount,
      unpairedCubeCount: runtime.heartActiveCount - pairedCubeCount,
      maxPairPositionError: Number(maxPairPositionError.toFixed(6)),
      maxPairDisplacementError: Number(maxPairDisplacementError.toFixed(6)),
      bounds: {
        frontExtent: Number(frontExtent.toFixed(4)),
        backExtent: Number(backExtent.toFixed(4)),
        centerZ: Number(((bounds.maxZ + bounds.minZ) * 0.5).toFixed(4))
      }
    };
  }

  function inspectHeartSpectrum(bands) {
    const length = Math.max(0, Number(bands && bands.length) || 0);
    if (length < HEART_SPECTRUM_BAND_COUNT) return { valid: false, silent: true, length };
    let minimum = Infinity;
    let maximum = 0;
    for (let index = 0; index < length; index += 1) {
      const value = clamp(Number(bands[index]) || 0, 0, 1.25);
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    const silent = maximum <= 0.0001;
    // Some bridge fallbacks duplicate one aggregate bass value into every bin.
    // Treat that uniform non-zero array as unavailable spectrum so it cannot
    // make every heart column move at once.
    return {
      valid: silent || maximum - minimum >= 0.0005,
      silent,
      length
    };
  }

  function sampleHeartSpectrum(bands, spectrumInfo, macroBand, sampleSlot) {
    if (!spectrumInfo.valid || spectrumInfo.silent) return 0;
    const bandStart = Math.floor(macroBand * spectrumInfo.length / HEART_SPECTRUM_BAND_COUNT);
    const bandEnd = Math.max(bandStart + 1, Math.floor((macroBand + 1) * spectrumInfo.length / HEART_SPECTRUM_BAND_COUNT));
    const bandLength = Math.max(1, bandEnd - bandStart);
    const center = bandStart + Math.min(bandLength - 1, Math.floor(sampleSlot / 127 * (bandLength - 1)));
    let peak = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const index = Math.max(bandStart, Math.min(bandEnd - 1, center + offset));
      peak = Math.max(peak, clamp(Number(bands[index]) || 0, 0, 1.25));
    }
    return peak;
  }

  function update(runtime, frame) {
    if (!runtime || runtime.disposed) return false;
    const updateStartedAt = performance.now();
    const now = Number(frame && frame.now) || performance.now();
    const requestedPixelRatio = clamp((frame && frame.pixelRatio) || global.devicePixelRatio || 1, 0.5, MAX_PIXEL_RATIO);
    if (
      !runtime.lastResizeCheckAt
      || now - runtime.lastResizeCheckAt >= 250
      || Math.abs(requestedPixelRatio - runtime.pixelRatio) >= 0.01
    ) {
      resize(runtime, requestedPixelRatio);
    }
    const dt = runtime.lastNow ? clamp((now - runtime.lastNow) / 1000, 1 / 360, 0.08) : 1 / 60;
    runtime.lastNow = now;
    runtime.frameCount += 1;

    const sourceBass = runtime.bassPreview === null
      ? clamp(frame && frame.bass, 0, 1.25)
      : runtime.bassPreview;
    const attack = sourceBass > runtime.smoothedBass ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 4.6);
    runtime.smoothedBass += (sourceBass - runtime.smoothedBass) * attack;
    const depthSource = sourceBass <= FREE_DEPTH_DEAD_ZONE
      ? 0
      : Math.pow(clamp((sourceBass - FREE_DEPTH_DEAD_ZONE) / (1 - FREE_DEPTH_DEAD_ZONE), 0, 1), 0.65);
    const depthRate = depthSource > runtime.freeDepthEnvelope
      ? FREE_DEPTH_ATTACK_RATE
      : FREE_DEPTH_RELEASE_RATE;
    runtime.freeDepthEnvelope += (depthSource - runtime.freeDepthEnvelope) * (1 - Math.exp(-dt * depthRate));
    const historyIndex = runtime.freeDepthHistoryCursor;
    runtime.freeDepthHistoryTimes[historyIndex] = now;
    runtime.freeDepthHistoryValues[historyIndex] = runtime.freeDepthEnvelope;
    runtime.freeDepthHistoryCursor = (historyIndex + 1) % runtime.freeDepthHistoryValues.length;
    runtime.freeDepthHistoryCount = Math.min(runtime.freeDepthHistoryCount + 1, runtime.freeDepthHistoryValues.length);
    for (let layer = 0; layer < runtime.freeDepthLayerBass.length; layer += 1) {
      runtime.freeDepthLayerBass[layer] = delayedDepthSample(runtime, now, FREE_DEPTH_STAGGER_MS[layer]);
    }
    runtime.smoothedEnergy += (clamp(frame && frame.energy, 0, 1.25) - runtime.smoothedEnergy) * (1 - Math.exp(-dt * 4));
    const sourceBeat = clamp(frame && frame.beat, 0, 1.25);
    runtime.heartBeatEnvelope = Math.max(
      sourceBeat,
      runtime.heartBeatEnvelope * Math.exp(-dt * 10.8)
    );
    runtime.modeProgress += (runtime.targetModeProgress - runtime.modeProgress) * (1 - Math.exp(-dt * 4.8));
    if (Math.abs(runtime.targetModeProgress - runtime.modeProgress) < 0.0005) runtime.modeProgress = runtime.targetModeProgress;

    const blend = smoothstep(runtime.modeProgress);
    const stableFree = blend <= 0.0005;
    const stableHeart = blend >= 0.9995;
    runtime.fastPath = stableFree ? 'free' : stableHeart ? 'heart' : 'transition';
    const time = now / 1000;
    const motion = frame && frame.reducedMotion ? 0.22 : 1;
    const outward = 0;
    const freeDepthBlend = (1 - blend) * motion;
    const foregroundDepth = runtime.freeDepthLayerBass[0] * FREE_DEPTH_LAYER_DISPLACEMENTS[0] * freeDepthBlend;
    runtime.pulseDisplacement = outward;
    runtime.freeDepthDisplacement = foregroundDepth;
    runtime.freeScalePulse = runtime.freeDepthLayerBass[0] * 0.08 * freeDepthBlend;
    runtime.freeReflectionBoost = runtime.freeDepthLayerBass[0] * 0.12 * freeDepthBlend;
    runtime.freeTiltDegrees = runtime.freeDepthLayerBass[0] * 3 * freeDepthBlend;
    runtime.heartFrontDisplacement = 0;
    runtime.heartBackDisplacement = 0;
    runtime.heartSpectrumDisplacements.fill(0);
    runtime.heartCurrentDisplacements.fill(0);
    const heartSpectrumBands = frame && frame.lowFrequencyBands;
    const heartSpectrumInfo = inspectHeartSpectrum(heartSpectrumBands);
    runtime.heartSpectrumValid = heartSpectrumInfo.valid;
    runtime.heartSpectrumSource = runtime.bassPreview !== null
      ? 'preview'
      : heartSpectrumInfo.valid
        ? 'frequency-bins'
        : 'unavailable';
    runtime.heartSpectrumPeak = 0;
    const dummy = runtime.dummy;

    for (let index = 0; index < runtime.count; index += 1) {
      const offset = index * 3;
      const phase = runtime.phases[index];
      const speed = runtime.speeds[index];
      let freeX = 0;
      let freeY = 0;
      let freeZ = 0;
      if (!stableHeart) {
        const depthLayer = runtime.freeDepthLayers[index];
        const depthPulse = runtime.freeDepthLayerBass[depthLayer]
          * FREE_DEPTH_LAYER_DISPLACEMENTS[depthLayer]
          * freeDepthBlend;
        const localDepthPulse = depthPulse * (0.86 + runtime.pulseWeights[index] * 0.14);
        const driftX = Math.sin(time * speed + phase) * (0.9 + runtime.drift[index] * 1.6) * motion;
        const driftY = Math.cos(time * speed * 0.73 + phase * 1.37) * (0.62 + runtime.drift[index]) * motion;
        const driftZ = Math.sin(time * speed * 0.41 + phase * 0.83) * (0.5 + runtime.drift[index] * 0.8) * motion;
        freeX = runtime.freePositions[offset] + driftX;
        freeY = runtime.freePositions[offset + 1] + driftY;
        freeZ = runtime.freePositions[offset + 2] + driftZ + localDepthPulse;
      }

      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;
      if (!stableFree) {
        const activeHeartCube = runtime.heartActive[index] === 1;
        const macroBand = runtime.heartSpectrumBands[index];
        const localSource = runtime.bassPreview !== null
          ? runtime.bassPreview
          : activeHeartCube
            ? sampleHeartSpectrum(heartSpectrumBands, heartSpectrumInfo, macroBand, runtime.heartSpectrumSamples[index])
            : 0;
        const localTarget = activeHeartCube
          ? Math.pow(clamp(localSource, 0, 1), 0.76)
          : 0;
        const localEnvelope = runtime.heartCubeEnvelopes[index];
        const localRate = localTarget > localEnvelope ? HEART_ATTACK_RATE : HEART_RELEASE_RATE;
        const nextEnvelope = localEnvelope + (localTarget - localEnvelope) * (1 - Math.exp(-dt * localRate));
        runtime.heartCubeEnvelopes[index] = nextEnvelope;
        const localPulse = activeHeartCube
          ? nextEnvelope * runtime.heartPulseWeights[index] * HEART_CUBE_SIZE * HEART_PUSH_CUBES * motion
          : 0;
        targetX = runtime.heartPositions[offset];
        targetY = runtime.heartPositions[offset + 1];
        targetZ = runtime.heartPositions[offset + 2] + runtime.heartDepthSigns[index] * localPulse;
        runtime.heartCurrentDisplacements[index] = localPulse;
        if (activeHeartCube && macroBand < HEART_SPECTRUM_BAND_COUNT) {
          runtime.heartSpectrumDisplacements[macroBand] = Math.max(runtime.heartSpectrumDisplacements[macroBand], localPulse);
          runtime.heartSpectrumPeak = Math.max(runtime.heartSpectrumPeak, localSource);
        }
        if (activeHeartCube && runtime.heartDepthSigns[index] > 0) {
          runtime.heartFrontDisplacement = Math.max(runtime.heartFrontDisplacement, localPulse);
        } else if (activeHeartCube) {
          runtime.heartBackDisplacement = Math.max(runtime.heartBackDisplacement, localPulse);
        }
      }

      const x = stableFree ? freeX : stableHeart ? targetX : freeX + (targetX - freeX) * blend;
      const y = stableFree ? freeY : stableHeart ? targetY : freeY + (targetY - freeY) * blend;
      const z = stableFree ? freeZ : stableHeart ? targetZ : freeZ + (targetZ - freeZ) * blend;

      dummy.position.set(x, y, z);
      const freeTilt = (1 - blend) * motion;
      const freeBass = runtime.freeDepthLayerBass[runtime.freeDepthLayers[index]] * freeDepthBlend;
      const freeBassTilt = freeBass * (0.035 + runtime.pulseWeights[index] * 0.017);
      dummy.rotation.set(
        runtime.tiltWaveX[index] * (0.16 * freeTilt + freeBassTilt),
        runtime.tiltWaveY[index] * (0.2 * freeTilt + freeBassTilt),
        runtime.tiltWaveZ[index] * (0.12 * freeTilt + freeBassTilt)
      );
      const heartScale = runtime.heartActive[index] ? HEART_CUBE_SCALE : 0;
      const baseScale = 0.68 + (heartScale - 0.68) * blend;
      const freeBassScale = freeBass * (0.04 + runtime.pulseWeights[index] * 0.04);
      const scale = baseScale * (1 + freeBassScale * (1 - blend));
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      runtime.mesh.setMatrixAt(index, dummy.matrix);
    }
    runtime.mesh.instanceMatrix.needsUpdate = true;

    const yaw = Number(frame && frame.yaw) || 0;
    const pitch = Number(frame && frame.pitch) || 0;
    const heartYaw = HEART_REST_YAW + (yaw - PLAYBACK_REST_YAW) * 0.72;
    const heartPitch = HEART_REST_PITCH + (pitch - PLAYBACK_REST_PITCH) * 0.72;
    runtime.group.rotation.set(
      pitch + (heartPitch - pitch) * blend,
      yaw + (heartYaw - yaw) * blend,
      0
    );
    runtime.group.position.set(HEART_OFFSET_X * blend, HEART_OFFSET_Y * blend, 0);
    syncScenePresentation(runtime);
    if (runtime.particles.visible) {
      runtime.particleGroup.rotation.set(
        -0.16 + Math.sin(time * 0.09) * 0.08,
        -yaw * 0.2 + time * 0.055 * motion,
        0.18 + Math.sin(time * 0.12) * 0.09
      );
      runtime.particleGroup.scale.setScalar(0.98 + Math.sin(time * 0.7) * 0.015 + runtime.smoothedBass * 0.025);
      runtime.particleMaterial.opacity = 0.66 + Math.sin(time * 1.35) * 0.08 + runtime.smoothedEnergy * 0.1;
      runtime.particleChecksum = runtime.particleGroup.rotation.y + runtime.particleGroup.scale.x;
    }

    const zoom = clamp(frame && frame.zoom, 0.58, 2.35);
    const targetFov = 43 + (HEART_CAMERA_FOV - 43) * blend;
    if (Math.abs(runtime.camera.fov - targetFov) > 0.001) {
      runtime.camera.fov = targetFov;
      runtime.camera.updateProjectionMatrix();
    }
    runtime.camera.position.z = (64 + (HEART_CAMERA_Z - 64) * blend) / zoom;
    runtime.camera.lookAt(0, 0, 0);
    const lighting = runtime.lighting;
    lighting.hemisphere.color.copy(lighting.freeHemisphereSky).lerp(lighting.heartHemisphereSky, blend);
    lighting.hemisphere.groundColor.copy(lighting.freeHemisphereGround).lerp(lighting.heartHemisphereGround, blend);
    lighting.hemisphere.intensity = 1.42 + (1.05 - 1.42) * blend;
    lighting.key.color.copy(lighting.freeKey).lerp(lighting.heartKey, blend);
    lighting.key.intensity = 1.82 + (1.45 - 1.82) * blend;
    lighting.key.position.set(
      -16 + 16 * blend,
      22 - 4 * blend,
      38 + 4 * blend
    );
    lighting.rim.color.copy(lighting.freeRim).lerp(lighting.heartRim, blend);
    lighting.rim.intensity = 1.54 + (1.1 - 1.54) * blend;
    lighting.rim.position.set(
      28 - 4 * blend,
      -10 + 14 * blend,
      18 + 10 * blend
    );
    lighting.glow.color.copy(lighting.freeGlow).lerp(lighting.heartGlow, blend);
    lighting.glow.intensity = 1.72 + (1.55 - 1.72) * blend;
    runtime.material.roughness = 0.2 + blend * 0.16;
    runtime.material.transmission = 0.42 * (1 - blend);
    runtime.material.thickness = 0.72 + (0.08 - 0.72) * blend;
    runtime.material.clearcoat = 0.72 + (0.18 - 0.72) * blend;
    runtime.material.clearcoatRoughness = 0.14 + blend * 0.16;
    runtime.material.envMapIntensity = (0.78 + (0.08 - 0.78) * blend) * (1 + runtime.freeReflectionBoost);
    const freeEmissiveIntensity = 0.045 + runtime.smoothedEnergy * 0.08 + runtime.smoothedBass * 0.06;
    const heartEmissiveIntensity = 0.22 + runtime.smoothedEnergy * 0.03 + runtime.heartSpectrumPeak * 0.19;
    runtime.material.emissiveIntensity = freeEmissiveIntensity
      + (heartEmissiveIntensity - freeEmissiveIntensity) * blend;
    runtime.pulseDisplacement = runtime.heartFrontDisplacement;
    let renderedByRenderQuality = false;
    if (runtime.renderQuality) {
      try {
        renderedByRenderQuality = runtime.renderQuality.render(runtime.scene, runtime.camera, now) === true;
        if (!renderedByRenderQuality) {
          disableRenderQuality(runtime, 'render-quality-render-returned-false', 'render-quality-render-failed');
        }
      } catch (error) {
        disableRenderQuality(runtime, error, 'render-quality-render-failed');
      }
    }
    if (!renderedByRenderQuality) runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.drawCalls = Number(runtime.renderer.info && runtime.renderer.info.render && runtime.renderer.info.render.calls) || 0;
    runtime.lastUpdateMs = performance.now() - updateStartedAt;
    runtime.averageUpdateMs = runtime.averageUpdateMs
      ? runtime.averageUpdateMs * 0.9 + runtime.lastUpdateMs * 0.1
      : runtime.lastUpdateMs;
    return true;
  }

  function create(host, options) {
    const THREE = global.THREE;
    if (!host || !THREE) return null;
    const config = options || {};
    const count = Math.round(clamp(config.cubeCount || DEFAULT_CUBE_COUNT, 900, 2600));
    const particleCount = Math.round(clamp(config.particleCount || DEFAULT_PARTICLE_COUNT, 600, 2200));
    const random = seededRandom(0xF3C0B3A);
    const renderer = typeof config.createRenderer === 'function'
      ? config.createRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      : new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.domElement.className = 'free-cube-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const renderQualityState = createRenderQuality(renderer, THREE, config.renderQualityOptions);

    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050810, 0.0045);
    const environment = buildEnvironmentTexture(THREE);
    scene.environment = environment;
    const backdrop = buildVideoBackdrop(THREE, scene);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 240);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, 0);
    const group = new THREE.Group();
    scene.add(group);

    const hemisphere = new THREE.HemisphereLight(0xe7f7ff, 0x080912, 1.42);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffffff, 1.82);
    key.position.set(-16, 22, 38);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb38cff, 1.54);
    rim.position.set(28, -10, 18);
    scene.add(rim);
    const glow = new THREE.PointLight(0x7ce7ff, 1.72, 105, 2);
    glow.position.set(0, 2, 22);
    scene.add(glow);

    const geometry = new THREE.BoxGeometry(0.78, 0.78, 0.78, 1, 1, 1);
    const normalBlend = softenBoxNormals(geometry);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.2,
      metalness: 0.04,
      transmission: 0.42,
      thickness: 0.72,
      clearcoat: 0.72,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.78,
      transparent: false,
      opacity: 1,
      emissive: 0x173542,
      emissiveIntensity: 0.055,
      depthWrite: true
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);

    const particleData = buildParticleGeometry(THREE, particleCount, random);
    const particleMaterial = new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    const particles = new THREE.Points(particleData.geometry, particleMaterial);
    particles.frustumCulled = false;
    const particleGroup = new THREE.Group();
    particleGroup.add(particles);
    scene.add(particleGroup);

    const heartLayout = buildHeartPositions(count);
    const runtime = {
      THREE,
      host,
      renderer,
      renderQuality: renderQualityState.controller,
      renderQualityRequest: 'native',
      renderQualityFallbackReason: renderQualityState.controller ? '' : renderQualityState.error,
      renderQualityLastError: renderQualityState.controller ? '' : renderQualityState.error,
      scene,
      camera,
      group,
      mesh,
      geometry,
      material,
      particles,
      particleGroup,
      particleGeometry: particleData.geometry,
      particleMaterial,
      environment,
      backdrop,
      lighting: {
        hemisphere,
        key,
        rim,
        glow,
        freeHemisphereSky: new THREE.Color(0xe7f7ff),
        heartHemisphereSky: new THREE.Color(0xff1802),
        freeHemisphereGround: new THREE.Color(0x080912),
        heartHemisphereGround: new THREE.Color(0x160303),
        freeKey: new THREE.Color(0xffffff),
        heartKey: new THREE.Color(0xff2604),
        freeRim: new THREE.Color(0xb38cff),
        heartRim: new THREE.Color(0xff3d18),
        freeGlow: new THREE.Color(0x7ce7ff),
        heartGlow: new THREE.Color(0xff2a08)
      },
      environmentFaceSize: ENVIRONMENT_FACE_SIZE,
      normalBlend,
      particlePhases: particleData.phases,
      particleRadii: particleData.radii,
      count,
      particleCount,
      freePositions: buildFreePositions(count, random),
      freeDepthLayers: new Uint8Array(count),
      freeDepthLayerCounts: [0, 0, 0],
      freeDepthLayerBass: new Float32Array(3),
      freeDepthEnvelope: 0,
      freeDepthHistoryTimes: new Float64Array(FREE_DEPTH_HISTORY_SIZE),
      freeDepthHistoryValues: new Float32Array(FREE_DEPTH_HISTORY_SIZE),
      freeDepthHistoryCursor: 0,
      freeDepthHistoryCount: 0,
      heartPositions: heartLayout.positions,
      heartDirections: new Float32Array(count * 3),
      heartActive: heartLayout.active,
      heartDepthLayers: heartLayout.layers,
      heartColumns: heartLayout.columns,
      heartRows: heartLayout.rows,
      heartPulseWeights: heartLayout.pulseWeights,
      heartDepthSigns: heartLayout.depthSigns,
      heartMirrorIndices: heartLayout.mirrorIndices,
      heartSpectrumBands: heartLayout.spectrumBands,
      heartSpectrumSamples: heartLayout.spectrumSamples,
      heartSpectrumCubeCounts: heartLayout.spectrumCubeCounts,
      heartSpectrumDisplacements: new Float32Array(HEART_SPECTRUM_BAND_COUNT),
      heartCurrentDisplacements: new Float32Array(count),
      heartCubeEnvelopes: new Float32Array(count),
      heartActiveCount: heartLayout.activeCount,
      heartSurfaceCellCount: heartLayout.surfaceCellCount,
      heartFrontLayerCount: heartLayout.frontLayerCount,
      heartGridColumns: heartLayout.gridColumns,
      heartGridRows: heartLayout.gridRows,
      heartGridSpacing: heartLayout.gridSpacing,
      heartCubeScale: heartLayout.cubeScale,
      heartCubeSize: heartLayout.cubeSize,
      heartDepthLayerCount: heartLayout.depthLayerCount,
      heartMiddleLayerCount: heartLayout.middleLayerCount,
      heartSurfaceCounts: heartLayout.surfaceCounts,
      heartProfile: heartLayout.profile,
      heartJitter: heartLayout.jitter,
      phases: new Float32Array(count),
      speeds: new Float32Array(count),
      drift: new Float32Array(count),
      pulseWeights: new Float32Array(count),
      colorMix: new Float32Array(count),
      tiltWaveX: new Float32Array(count),
      tiltWaveY: new Float32Array(count),
      tiltWaveZ: new Float32Array(count),
      dummy: new THREE.Object3D(),
      projectPoint: new THREE.Vector3(),
      mode: config.mode === 'heart' ? 'heart' : 'free',
      targetModeProgress: config.mode === 'heart' ? 1 : 0,
      modeProgress: config.mode === 'heart' ? 1 : 0,
      backgroundEnabled: config.backgroundEnabled !== false,
      palette: defaultPalette(),
      paletteHex: [],
      bassPreview: null,
      smoothedBass: 0,
      smoothedEnergy: 0,
      heartBeatEnvelope: 0,
      heartFrontDisplacement: 0,
      heartBackDisplacement: 0,
      pulseDisplacement: 0,
      freeDepthDisplacement: 0,
      freeScalePulse: 0,
      freeReflectionBoost: 0,
      freeTiltDegrees: 0,
      motionChecksum: 0,
      particleChecksum: 0,
      sunsetOpacity: config.backgroundEnabled === false ? 0 : 1,
      nightOpacity: config.backgroundEnabled === false ? 1 : 0,
      backgroundMode: config.mode === 'heart' ? 'none' : config.backgroundEnabled === false ? 'particles' : 'soft-glow',
      backgroundTransitioning: false,
      backgroundInitialized: false,
      backgroundTransitionStartedAt: performance.now(),
      backgroundTransitionFrom: '',
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      width: 0,
      height: 0,
      pixelRatio: 0,
      lastResizeCheckAt: 0,
      layoutCheckCount: 0,
      lastNow: 0,
      frameCount: 0,
      drawCalls: 0,
      fastPath: 'transition',
      lastUpdateMs: 0,
      averageUpdateMs: 0,
      disposed: false
    };
    if (config.renderQuality && config.renderQuality !== 'native') {
      setRenderQuality(runtime, config.renderQuality);
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const phase = random() * TAU;
      runtime.phases[index] = phase;
      runtime.speeds[index] = 0.18 + random() * 0.44;
      runtime.drift[index] = random();
      runtime.pulseWeights[index] = random();
      runtime.colorMix[index] = random();
      runtime.tiltWaveX[index] = Math.sin(phase * 1.73);
      runtime.tiltWaveY[index] = Math.cos(phase * 1.31);
      runtime.tiltWaveZ[index] = Math.sin(phase * 0.91);
      const freeZ = runtime.freePositions[offset + 2];
      const depthLayer = freeZ >= FREE_DEPTH_LAYER_LIMIT ? 0 : freeZ <= -FREE_DEPTH_LAYER_LIMIT ? 2 : 1;
      runtime.freeDepthLayers[index] = depthLayer;
      runtime.freeDepthLayerCounts[depthLayer] += 1;
      runtime.heartDirections[offset] = 0;
      runtime.heartDirections[offset + 1] = 0;
      runtime.heartDirections[offset + 2] = runtime.heartDepthSigns[index];
    }
    applyPalette(runtime, config.palette);
    setBackgroundEnabled(runtime, runtime.backgroundEnabled);
    resize(runtime, config.pixelRatio);
    update(runtime, { now: performance.now(), bass: 0, energy: 0, beat: 0, yaw: 0, pitch: 0, zoom: 1, reducedMotion: false });
    return runtime;
  }

  function diagnostics(runtime) {
    if (!runtime || runtime.disposed) {
      return {
        active: false,
        disposed: true,
        disposeCount,
        canvasCount: runtime && runtime.host ? runtime.host.querySelectorAll('canvas').length : 0
      };
    }
    refreshMotionDiagnostics(runtime);
    const coverage = projectedCoverage(runtime);
    const bounds = runtime.bounds || { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    return {
      active: true,
      disposed: false,
      disposeCount,
      canvasCount: runtime.host.querySelectorAll('canvas').length,
      mode: runtime.mode,
      transition: Number(runtime.modeProgress.toFixed(4)),
      cubeCount: runtime.count,
      particleCount: runtime.particleCount,
      pixelRatio: Number(runtime.pixelRatio.toFixed(3)),
      toneMappingExposure: Number(runtime.renderer.toneMappingExposure.toFixed(3)),
      particleVisible: runtime.particles.visible,
      backgroundEnabled: runtime.mode === 'heart' ? false : runtime.backgroundEnabled,
      backgroundProfile: runtime.mode === 'heart' ? 'none' : runtime.backgroundEnabled ? 'soft-glow' : 'particles',
      backgroundMode: runtime.backgroundMode,
      backgroundTransitioning: runtime.backgroundTransitioning,
      backgroundTransitionMs: SKY_TRANSITION_MS,
      sunsetFadeMs: SUNSET_FADE_MS,
      blackGapMs: SKY_BLACK_GAP_MS,
      nightFadeMs: NIGHT_FADE_MS,
      sunsetOpacity: Number(runtime.sunsetOpacity.toFixed(4)),
      nightOpacity: Number(runtime.nightOpacity.toFixed(4)),
      skyVisible: runtime.backdrop.sky.visible,
      groundVisible: runtime.backdrop.ground.visible,
      shadowVisible: runtime.backdrop.shadow.visible,
      palette: runtime.paletteHex.slice(),
      environment: {
        faceSize: runtime.environmentFaceSize,
        mipmapped: runtime.environment.generateMipmaps === true
      },
      normalBlend: runtime.normalBlend,
      renderQuality: renderQualityDiagnostics(runtime),
      material: {
        type: runtime.material.type,
        roughness: runtime.material.roughness,
        transmission: runtime.material.transmission,
        clearcoat: runtime.material.clearcoat,
        clearcoatRoughness: runtime.material.clearcoatRoughness,
        envMapIntensity: Number(runtime.material.envMapIntensity.toFixed(4)),
        opacity: runtime.material.opacity,
        transparent: runtime.material.transparent,
        depthWrite: runtime.material.depthWrite
      },
      bounds: {
        width: Number((bounds.maxX - bounds.minX).toFixed(3)),
        height: Number((bounds.maxY - bounds.minY).toFixed(3)),
        depth: Number((bounds.maxZ - bounds.minZ).toFixed(3))
      },
      coverage: {
        width: Number(coverage.width.toFixed(4)),
        height: Number(coverage.height.toFixed(4))
      },
      rotation: {
        yaw: Number(runtime.group.rotation.y.toFixed(4)),
        pitch: Number(runtime.group.rotation.x.toFixed(4))
      },
      autoRotation: false,
      cubeSpin: false,
      heartLayout: 'symmetric-frequency-volume',
      heartAxisAligned: false,
      heartGridColumns: runtime.heartGridColumns,
      heartGridRows: runtime.heartGridRows,
      heartActiveCubeCount: runtime.heartActiveCount,
      heartSurfaceCellCount: runtime.heartSurfaceCellCount,
      heartFrontLayerCount: runtime.heartFrontLayerCount,
      heartGridSpacing: Number(runtime.heartGridSpacing.toFixed(3)),
      heartCubeScale: Number(runtime.heartCubeScale.toFixed(4)),
      heartCubeSize: Number(runtime.heartCubeSize.toFixed(4)),
      heartDepthLayerCount: runtime.heartDepthLayerCount,
      heartMiddleLayerCount: runtime.heartMiddleLayerCount,
      heartSurfaceCounts: runtime.heartSurfaceCounts.slice(),
      heartProfile: runtime.heartProfile,
      heartJitter: runtime.heartJitter,
      heartSymmetry: heartSymmetryDiagnostics(runtime, bounds),
      heartSpectrum: {
        bandCount: HEART_SPECTRUM_BAND_COUNT,
        exclusive: true,
        rangesHz: HEART_SPECTRUM_RANGES_HZ.map((range) => range.slice()),
        cubeCounts: runtime.heartSpectrumCubeCounts.slice(),
        displacements: Array.from(runtime.heartSpectrumDisplacements, (value) => Number(value.toFixed(4)))
      },
      heartFrontDisplacement: Number(runtime.heartFrontDisplacement.toFixed(4)),
      heartBackDisplacement: Number(runtime.heartBackDisplacement.toFixed(4)),
      heartAudioAxis: 'camera-z',
      heartAudioScaleInvariant: true,
      bass: Number(runtime.smoothedBass.toFixed(4)),
      freeBassAxis: 'depth-z',
      freeDepthProfile: 'three-layer-staggered-impact',
      freeDepthLayerCounts: runtime.freeDepthLayerCounts.slice(),
      freeDepthLayerDisplacements: FREE_DEPTH_LAYER_DISPLACEMENTS.slice(),
      freeDepthLayerBass: Array.from(runtime.freeDepthLayerBass, (value) => Number(value.toFixed(4))),
      freeDepthStaggerMs: FREE_DEPTH_STAGGER_MS.slice(),
      freeDepthAttackMs: Math.round(1000 / FREE_DEPTH_ATTACK_RATE),
      freeDepthReleaseMs: Math.round(1000 / FREE_DEPTH_RELEASE_RATE),
      freeDepthHistorySize: FREE_DEPTH_HISTORY_SIZE,
      freeDepthDisplacement: Number(runtime.freeDepthDisplacement.toFixed(4)),
      freeScalePulse: Number(runtime.freeScalePulse.toFixed(4)),
      freeReflectionBoost: Number(runtime.freeReflectionBoost.toFixed(4)),
      freeTiltDegrees: Number(runtime.freeTiltDegrees.toFixed(3)),
      pulseDisplacement: Number(runtime.pulseDisplacement.toFixed(4)),
      motionChecksum: Number(runtime.motionChecksum.toFixed(5)),
      particleChecksum: Number(runtime.particleChecksum.toFixed(5)),
      drawCalls: runtime.drawCalls,
      frameCount: runtime.frameCount,
      fastPath: runtime.fastPath,
      layoutCheckCount: runtime.layoutCheckCount,
      lastUpdateMs: Number(runtime.lastUpdateMs.toFixed(3)),
      averageUpdateMs: Number(runtime.averageUpdateMs.toFixed(3)),
      pointSize: runtime.particleMaterial.size,
      blending: runtime.particleMaterial.blending === runtime.THREE.AdditiveBlending ? 'additive' : 'normal'
    };
  }

  function setBassPreview(runtime, value) {
    if (!runtime || runtime.disposed) return false;
    runtime.bassPreview = clamp(value, 0, 1.25);
    return true;
  }

  function clearBassPreview(runtime) {
    if (!runtime || runtime.disposed) return false;
    runtime.bassPreview = null;
    return true;
  }

  function dispose(runtime) {
    if (!runtime || runtime.disposed) return false;
    runtime.disposed = true;
    try {
      runtime.renderQuality?.dispose?.();
    } catch (error) {
      // Continue releasing the renderer and scene resources.
    }
    runtime.renderQuality = null;
    runtime.geometry.dispose();
    runtime.material.dispose();
    runtime.particleGeometry.dispose();
    runtime.particleMaterial.dispose();
    runtime.environment.dispose();
    runtime.backdrop.skyGeometry.dispose();
    runtime.backdrop.skyMaterial.dispose();
    runtime.backdrop.nightTexture.dispose();
    runtime.backdrop.sunsetTexture.dispose();
    runtime.backdrop.groundTexture.dispose();
    runtime.backdrop.groundGeometry.dispose();
    runtime.backdrop.groundMaterial.dispose();
    runtime.backdrop.shadowTexture.dispose();
    runtime.backdrop.shadowGeometry.dispose();
    runtime.backdrop.shadowMaterial.dispose();
    if (runtime.renderer.renderLists && typeof runtime.renderer.renderLists.dispose === 'function') {
      runtime.renderer.renderLists.dispose();
    }
    if (typeof runtime.renderer.dispose === 'function') runtime.renderer.dispose();
    if (typeof runtime.renderer.forceContextLoss === 'function') runtime.renderer.forceContextLoss();
    runtime.renderer.domElement.remove();
    disposeCount += 1;
    return true;
  }

  global.FeFreeCubeRuntime = Object.freeze({
    create,
    update,
    resize,
    setRenderQuality,
    setMode,
    setBackgroundEnabled,
    setPalette: applyPalette,
    setBassPreview,
    clearBassPreview,
    diagnostics,
    dispose
  });
})(window);
