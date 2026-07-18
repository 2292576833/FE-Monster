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

  function distributeRingCounts(total, ringCount) {
    const weightTotal = ringCount * (ringCount + 1) * 0.5;
    const counts = Array.from({ length: ringCount }, (_, index) => (
      Math.max(3, Math.floor(total * (index + 1) / weightTotal))
    ));
    let assigned = counts.reduce((sum, value) => sum + value, 0);
    let cursor = ringCount - 1;
    while (assigned < total) {
      counts[cursor] += 1;
      assigned += 1;
      cursor = cursor > 0 ? cursor - 1 : ringCount - 1;
    }
    cursor = 0;
    while (assigned > total) {
      if (counts[cursor] > 3) {
        counts[cursor] -= 1;
        assigned -= 1;
      }
      cursor = (cursor + 1) % ringCount;
    }
    return counts;
  }

  function cubicBezierPoint(segment, t) {
    const inverse = 1 - t;
    const a = inverse * inverse * inverse;
    const b = 3 * inverse * inverse * t;
    const c = 3 * inverse * t * t;
    const d = t * t * t;
    return {
      x: segment[0][0] * a + segment[1][0] * b + segment[2][0] * c + segment[3][0] * d,
      y: segment[0][1] * a + segment[1][1] * b + segment[2][1] * c + segment[3][1] * d
    };
  }

  function buildHeartOutlineLookup() {
    const notch = [0, 7.2];
    const leftLobe = [-15.6, 15.8];
    const leftLower = [-13.5, -8.5];
    const bottom = [0, -14.6];
    const rightLower = [13.5, -8.5];
    const rightLobe = [15.6, 15.8];
    const segments = [
      [notch, [-2.2, 14.4], [-9.2, 19.2], leftLobe],
      [leftLobe, [-23.2, 13.5], [-22.2, 0.2], leftLower],
      [leftLower, [-10.5, -12], [-7.2, -14.6], bottom],
      [bottom, [7.2, -14.6], [10.5, -12], rightLower],
      [rightLower, [22.2, 0.2], [23.2, 13.5], rightLobe],
      [rightLobe, [9.2, 19.2], [2.2, 14.4], notch]
    ];
    const lookup = [{ ...cubicBezierPoint(segments[0], 0), length: 0 }];
    let length = 0;
    let previous = lookup[0];
    for (const segment of segments) {
      for (let step = 1; step <= 96; step += 1) {
        const point = cubicBezierPoint(segment, step / 96);
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        lookup.push({ ...point, length });
        previous = point;
      }
    }
    return { points: lookup, length };
  }

  function sampleHeartOutline(outline, progress) {
    const normalized = ((progress % 1) + 1) % 1;
    const target = normalized * outline.length;
    let low = 0;
    let high = outline.points.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (outline.points[middle].length < target) low = middle;
      else high = middle;
    }
    const before = outline.points[low];
    const after = outline.points[high];
    const span = Math.max(0.0001, after.length - before.length);
    const amount = (target - before.length) / span;
    return {
      x: before.x + (after.x - before.x) * amount,
      y: before.y + (after.y - before.y) * amount
    };
  }

  function buildHeartPositions(count) {
    const positions = new Float32Array(count * 3);
    const depthLayerCount = 2;
    const baseLayerCount = Math.floor(count / depthLayerCount);
    const outline = buildHeartOutlineLookup();
    const jitterRandom = seededRandom(0x4A11CE5);
    const surfaceCounts = [];
    let written = 0;
    let representativeRingCount = 1;

    for (let layerIndex = 0; layerIndex < depthLayerCount; layerIndex += 1) {
      const layerCount = baseLayerCount + (layerIndex < count % depthLayerCount ? 1 : 0);
      surfaceCounts.push(layerCount);
      const ringCount = Math.round(clamp(Math.sqrt(layerCount) * 0.54, 11, 17));
      representativeRingCount = Math.max(representativeRingCount, ringCount);
      const ringCounts = distributeRingCounts(layerCount, ringCount);
      const z = layerIndex === 0 ? -4.35 : 4.35;

      for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        const radius = (ringIndex + 1) / ringCount;
        const pointsOnRing = ringCounts[ringIndex];
        const stagger = (ringIndex % 2) * 0.5 + layerIndex * 0.37;
        const jitter = 0.4 + (1 - radius) * 0.18;
        for (let pointIndex = 0; pointIndex < pointsOnRing; pointIndex += 1) {
          const point = sampleHeartOutline(outline, (pointIndex + stagger) / pointsOnRing);
          const offset = written * 3;
          positions[offset] = point.x * radius + (jitterRandom() - 0.5) * jitter;
          positions[offset + 1] = point.y * radius + 0.4 + (jitterRandom() - 0.5) * jitter;
          positions[offset + 2] = z + (jitterRandom() - 0.5) * 0.34;
          written += 1;
        }
      }
    }
    return {
      positions,
      gridSpacing: 18.4 / representativeRingCount,
      depthLayerCount,
      middleLayerCount: 0,
      surfaceCounts,
      profile: 'rounded-bezier',
      jitter: 0.4
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
    return true;
  }

  function setBackgroundEnabled(runtime, enabled) {
    if (!runtime || runtime.disposed) return false;
    runtime.backgroundEnabled = enabled !== false;
    runtime.particles.visible = !runtime.backgroundEnabled;
    runtime.host.closest('.free-cube-scene')?.classList.toggle('has-soft-background', runtime.backgroundEnabled);
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
    runtime.modeProgress += (runtime.targetModeProgress - runtime.modeProgress) * (1 - Math.exp(-dt * 4.8));
    if (Math.abs(runtime.targetModeProgress - runtime.modeProgress) < 0.0005) runtime.modeProgress = runtime.targetModeProgress;

    const blend = smoothstep(runtime.modeProgress);
    const stableFree = blend <= 0.0005;
    const stableHeart = blend >= 0.9995;
    runtime.fastPath = stableFree ? 'free' : stableHeart ? 'heart' : 'transition';
    const time = now / 1000;
    const motion = frame && frame.reducedMotion ? 0.22 : 1;
    const outward = blend * runtime.smoothedBass * 2.45 * motion;
    const freeDepthBlend = (1 - blend) * motion;
    const foregroundDepth = runtime.freeDepthLayerBass[0] * FREE_DEPTH_LAYER_DISPLACEMENTS[0] * freeDepthBlend;
    runtime.pulseDisplacement = outward;
    runtime.freeDepthDisplacement = foregroundDepth;
    runtime.freeScalePulse = runtime.freeDepthLayerBass[0] * 0.08 * freeDepthBlend;
    runtime.freeReflectionBoost = runtime.freeDepthLayerBass[0] * 0.12 * freeDepthBlend;
    runtime.freeTiltDegrees = runtime.freeDepthLayerBass[0] * 3 * freeDepthBlend;
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
        const localPulse = outward * (0.86 + runtime.pulseWeights[index] * 0.14);
        targetX = runtime.heartPositions[offset] + runtime.heartDirections[offset] * localPulse;
        targetY = runtime.heartPositions[offset + 1] + runtime.heartDirections[offset + 1] * localPulse;
        targetZ = runtime.heartPositions[offset + 2] + runtime.heartDirections[offset + 2] * localPulse;
      }

      const x = stableFree ? freeX : stableHeart ? targetX : freeX + (targetX - freeX) * blend;
      const y = stableFree ? freeY : stableHeart ? targetY : freeY + (targetY - freeY) * blend;
      const z = stableFree ? freeZ : stableHeart ? targetZ : freeZ + (targetZ - freeZ) * blend;

      dummy.position.set(x, y, z);
      const freeTilt = (1 - blend) * motion;
      const heartTilt = blend;
      const freeBass = runtime.freeDepthLayerBass[runtime.freeDepthLayers[index]] * freeDepthBlend;
      const freeBassTilt = freeBass * (0.035 + runtime.pulseWeights[index] * 0.017);
      dummy.rotation.set(
        runtime.tiltWaveX[index] * (0.16 * freeTilt + 0.06 * heartTilt + freeBassTilt),
        runtime.tiltWaveY[index] * (0.2 * freeTilt + 0.07 * heartTilt + freeBassTilt),
        runtime.tiltWaveZ[index] * (0.12 * freeTilt + 0.05 * heartTilt + freeBassTilt)
      );
      const baseScale = 0.68 + blend * 0.28;
      const freeBassScale = freeBass * (0.04 + runtime.pulseWeights[index] * 0.04);
      const scale = baseScale * (1 + freeBassScale)
        + runtime.smoothedBass * blend * (0.05 + runtime.pulseWeights[index] * 0.04);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      runtime.mesh.setMatrixAt(index, dummy.matrix);
    }
    runtime.mesh.instanceMatrix.needsUpdate = true;

    const yaw = Number(frame && frame.yaw) || 0;
    const pitch = Number(frame && frame.pitch) || 0;
    runtime.group.rotation.set(pitch, yaw, 0);
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
    runtime.camera.position.z = 64 / zoom;
    runtime.camera.lookAt(0, 0, 0);
    runtime.material.envMapIntensity = 0.78 * (1 + runtime.freeReflectionBoost);
    runtime.material.emissiveIntensity = 0.045 + runtime.smoothedEnergy * 0.08 + runtime.smoothedBass * 0.06;
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
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 240);
    camera.position.set(0, 0, 64);
    camera.lookAt(0, 0, 0);
    const group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.HemisphereLight(0xe7f7ff, 0x080912, 1.42));
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
      heartGridSpacing: heartLayout.gridSpacing,
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
      pulseDisplacement: 0,
      freeDepthDisplacement: 0,
      freeScalePulse: 0,
      freeReflectionBoost: 0,
      freeTiltDegrees: 0,
      motionChecksum: 0,
      particleChecksum: 0,
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
      const heartX = runtime.heartPositions[offset];
      const heartY = runtime.heartPositions[offset + 1];
      const heartZ = runtime.heartPositions[offset + 2];
      const heartLength = Math.max(0.001, Math.hypot(heartX, heartY, heartZ));
      runtime.heartDirections[offset] = heartX / heartLength;
      runtime.heartDirections[offset + 1] = heartY / heartLength;
      runtime.heartDirections[offset + 2] = heartZ / heartLength;
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
      backgroundEnabled: runtime.backgroundEnabled,
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
      heartLayout: 'rounded-double-surface',
      heartGridSpacing: Number(runtime.heartGridSpacing.toFixed(3)),
      heartDepthLayerCount: runtime.heartDepthLayerCount,
      heartMiddleLayerCount: runtime.heartMiddleLayerCount,
      heartSurfaceCounts: runtime.heartSurfaceCounts.slice(),
      heartProfile: runtime.heartProfile,
      heartJitter: runtime.heartJitter,
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
