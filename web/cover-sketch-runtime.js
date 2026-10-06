(function (global) {
  'use strict';

  const HALF_SIZE = 0.64;
  const ANGLES = [-0.2, 1.3, 0.52, -0.94, 0.94, -0.55, 1.55, 0.12, -1.3, 0.72, -0.72, 1.08, -0.36, 0.34, -1.55, 1.42];
  // Keep motion low-amplitude so pencil detail stays legible. The small
  // per-layer rate offsets prevent the cover from reading as one rigid sheet.
  const LAYER_FLOW_RATE = 0.52;
  const LAYER_FLOW_RATE_STEP = 0.037;
  const LAYER_SWAY_RATE = 0.31;
  const LAYER_SWAY_RATE_STEP = 0.023;
  const DEPTH_BREATH_RATE = 0.26;
  const DEPTH_BREATH_RATE_STEP = 0.017;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function number(value, fallback, low, high) {
    const parsed = Number(value);
    return clamp(Number.isFinite(parsed) ? parsed : fallback, low, high);
  }

  function strokeNoise(lane, layer, salt) {
    const value = Math.sin((lane + 1) * 12.9898 + (layer + 1) * 78.233 + salt * 39.346) * 43758.5453;
    return value - Math.floor(value);
  }

  // Shared with the particle renderer: white is nearer, black is farther away.
  function depthFromLuminance(luminance, settings) {
    const prefs = settings || {};
    if (prefs.depthEnabled === false) return 0;
    const strength = number(prefs.depthStrength, 1, 0, 3);
    if (!strength) return 0;
    let luma = number(luminance, 0.5, 0, 1);
    if (prefs.depthInvert) luma = 1 - luma;
    luma = clamp((luma - 0.5) * number(prefs.depthContrast, 1, 0.25, 3) + 0.5, 0, 1);
    return (Math.pow(luma, 1.42) * 0.14 - 0.04) * strength;
  }

  function normalizeSettings(settings) {
    const source = settings || {};
    return {
      sketchLayers: Math.round(number(source.sketchLayers, 8, 2, 16)),
      sketchDensity: number(source.sketchDensity, 1, 0.4, 1.6),
      sketchLineWidth: number(source.sketchLineWidth, 0.8, 0.4, 2),
      sketchFlowSpeed: number(source.sketchFlowSpeed, 0.65, 0, 2),
      sketchFlowAmplitude: number(source.sketchFlowAmplitude, 0.65, 0, 2),
      depthMapEnabled: source.depthMapEnabled === true,
      depthEnabled: source.depthEnabled !== false,
      depthStrength: number(source.depthStrength, 1, 0, 3),
      depthContrast: number(source.depthContrast, 1, 0.25, 3),
      depthInvert: Boolean(source.depthInvert)
    };
  }

  function create(canvas) {
    let context = null;
    try { context = canvas && canvas.getContext('2d', { alpha: true }); } catch (error) {}
    let destroyed = false;
    let sourceImage = null;
    let sampleKey = '';
    let geometryKey = '';
    let depthKey = '';
    let field = null;
    let mesh = [];
    let texture = null;
    let textureKey = '';
    let textureBuilds = 0;
    let layerTextures = [];
    let depthMapTextures = [];
    let depthMapTextureKey = '';
    let depthMapMapper = null;
    let depthMapTextureBuilds = 0;
    let layerStats = [];
    let compositeKey = '';
    let compositeBuilds = 0;
    let lightingField = null;
    let depthSampleKey = '';
    let depthFieldBuilder = null;
    let depthImageStatus = 'placeholder';
    let depthSampleBuilds = 0;
    let lightingTexture = null;
    let lightingPixels = null;
    let texturePixels = null;
    let lightingKey = '';
    let lightingBuilds = 0;
    let lightingTime = 0;
    let renderTexture = null;
    const lightGridSize = 64;
    const lightGrid = new Float32Array((lightGridSize + 1) * (lightGridSize + 1));
    let strokeCount = 0;
    let meshSize = 0;
    let pointCount = 0;
    let sampleBuilds = 0;
    let geometryBuilds = 0;
    let imageStatus = 'empty';
    let flowTime = 0;
    let lastNow = null;
    let currentLayers = 0;

    function sampleImage(frame) {
      const image = frame.image || null;
      const imageWidth = image && (image.naturalWidth || image.width) || 0;
      const imageHeight = image && (image.naturalHeight || image.height) || 0;
      const ready = Boolean(image && image.complete !== false && imageWidth && imageHeight);
      const size = frame.mobile ? 384 : 512;
      const key = `${frame.imageSignature || ''}|${ready}|${imageWidth}x${imageHeight}|${size}`;
      if (field && image === sourceImage && key === sampleKey) return;
      sourceImage = image;
      sampleKey = key;
      geometryKey = '';
      textureKey = '';
      sampleBuilds += 1;
      let pixels = null;
      imageStatus = ready ? 'unavailable' : 'placeholder';
      if (ready) {
        // A failed/CORS-tainted image is cached too, so it is never retried per frame.
        let scratch = null;
        try {
          scratch = global.document.createElement('canvas');
          scratch.width = size;
          scratch.height = size;
          const sampleContext = scratch.getContext('2d', { willReadFrequently: true });
          if (sampleContext) {
            const scale = size / Math.max(imageWidth, imageHeight);
            const drawWidth = imageWidth * scale;
            const drawHeight = imageHeight * scale;
            sampleContext.drawImage(image, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
            pixels = sampleContext.getImageData(0, 0, size, size).data;
            imageStatus = 'ready';
          }
        } catch (error) {
          pixels = null;
        } finally {
          if (scratch) { scratch.width = 0; scratch.height = 0; }
        }
      }
      const luma = new Float32Array(size * size);
      const gradientX = new Float32Array(size * size);
      const gradientY = new Float32Array(size * size);
      if (!pixels) {
        pixels = new Uint8ClampedArray(size * size * 4);
        const palette = frame.palette || {};
        const primary = palette.primary || { r: 166, g: 193, b: 221 };
        const accent = palette.glow || { r: 233, g: 164, b: 135 };
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const nx = (x / (size - 1) - 0.5) * 2;
            const ny = (y / (size - 1) - 0.5) * 2;
            const ribbon = 0.5 + Math.sin(nx * 5.2 + Math.sin(ny * 4.4) * 1.8) * 0.5;
            const light = 0.24 + 0.64 * Math.pow(Math.max(0, 1 - Math.hypot(nx * 0.8, ny * 0.8)), 0.7);
            const index = (y * size + x) * 4;
            pixels[index] = (primary.r * (1 - ribbon) + accent.r * ribbon) * light;
            pixels[index + 1] = (primary.g * (1 - ribbon) + accent.g * ribbon) * light;
            pixels[index + 2] = (primary.b * (1 - ribbon) + accent.b * ribbon) * light;
            pixels[index + 3] = 255;
          }
        }
      }
      for (let i = 0; i < luma.length; i += 1) {
        const offset = i * 4;
        luma[i] = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
      }
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = y * size + x;
          gradientX[index] = luma[y * size + Math.min(size - 1, x + 1)] - luma[y * size + Math.max(0, x - 1)];
          gradientY[index] = luma[Math.min(size - 1, y + 1) * size + x] - luma[Math.max(0, y - 1) * size + x];
        }
      }
      field = { size, pixels, luma, gradientX, gradientY };
      lightingField = null;
      depthSampleKey = '';
    }

    function generateDepthField() {
      const builder = global.FeCoverDepthLight && global.FeCoverDepthLight.buildField;
      if (depthSampleKey === sampleKey && depthFieldBuilder === builder) return;
      // The current cover is the only depth source. Geometry and illumination
      // share this cached automatic height/normal field for the lifetime of it.
      lightingField = builder ? builder(field.pixels, field.size, field.size) : null;
      depthSampleKey = sampleKey;
      depthFieldBuilder = builder;
      depthImageStatus = imageStatus === 'ready' ? 'generated' : 'placeholder';
      depthSampleBuilds += 1;
      depthKey = '';
      lightingKey = '';
    }

    function pixelIndex(x, y) {
      return Math.round(clamp(y, 0, field.size - 1)) * field.size + Math.round(clamp(x, 0, field.size - 1));
    }

    function colorDistance(a, b) {
      const pixels = field.pixels;
      const i = a * 4;
      const j = b * 4;
      return Math.max(Math.abs(pixels[i] - pixels[j]), Math.abs(pixels[i + 1] - pixels[j + 1]), Math.abs(pixels[i + 2] - pixels[j + 2])) / 255;
    }

    function buildTexture(settings) {
      const key = `${sampleKey}|${settings.sketchLayers}|${settings.sketchDensity}|${settings.sketchLineWidth}`;
      if (texture && key === textureKey) return;
      if (!texture) texture = global.document.createElement('canvas');
      texture.width = field.size;
      texture.height = field.size;
      for (const layer of layerTextures) { layer.width = 0; layer.height = 0; }
      layerTextures = [];
      clearDepthMapTextures();
      layerStats = [];
      textureKey = key;
      compositeKey = '';
      texturePixels = null;
      lightingKey = '';
      textureBuilds += 1;
      strokeCount = 0;
      currentLayers = settings.sketchLayers;
      const size = field.size;
      // Each layer remains visibly sparse. Additional layers, rather than denser
      // individual layers, build up the cover's colour and tonal information.
      const laneGap = 8 / Math.sqrt(settings.sketchDensity);
      const pointStep = 1.25;
      const extent = size * 0.73;
      for (let layer = 0; layer < settings.sketchLayers; layer += 1) {
        const surface = global.document.createElement('canvas');
        surface.width = size;
        surface.height = size;
        const ink = surface.getContext('2d', { alpha: true });
        if (!ink) continue;
        layerTextures.push(surface);
        ink.lineCap = 'round';
        ink.lineJoin = 'round';
        const angle = ANGLES[layer];
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const offset = strokeNoise(layer, 0, 1) * laneGap;
        let marks = 0;
        let length = 0;
        for (let lane = -extent + offset, laneIndex = 0; lane < extent; lane += laneGap, laneIndex += 1) {
          const seed = strokeNoise(laneIndex, layer, 1);
          const phase = strokeNoise(laneIndex, layer, 2) * Math.PI * 2;
          const laneOffset = lane + (seed - 0.5) * laneGap * 0.5;
          let previous = null;
          for (let t = -extent; t < extent; t += pointStep) {
            const curve = Math.sin(t / 49 + phase) * (1.5 + seed * 2.5) + Math.sin(t / 15 + phase * 0.7) * 0.7;
            let x = size * 0.5 + t * cosine - (laneOffset + curve) * sine;
            let y = size * 0.5 + t * sine + (laneOffset + curve) * cosine;
            if (x < 0 || y < 0 || x >= size || y >= size) { previous = null; continue; }
            let index = pixelIndex(x, y);
            // A small tangent deflection follows local contours without merging
            // all layers into the same direction or densely tracing every edge.
            x -= field.gradientY[index] * 0.8;
            y += field.gradientX[index] * 0.8;
            index = pixelIndex(x, y);
            const offset = index * 4;
            if (field.pixels[offset + 3] < 24) { previous = null; continue; }
            const point = { x, y, index };
            if (previous && colorDistance(previous.index, index) < 0.16) {
              // Colour spans stay local (about one sample pixel), even though
              // the visible pencil curves are long and continuous across a layer.
              ink.strokeStyle = `rgb(${field.pixels[offset]}, ${field.pixels[offset + 1]}, ${field.pixels[offset + 2]})`;
              ink.globalAlpha = field.pixels[offset + 3] / 255 * (0.86 + seed * 0.12);
              ink.lineWidth = settings.sketchLineWidth * (0.94 + seed * 0.16);
              ink.beginPath();
              ink.moveTo(previous.x, previous.y);
              ink.lineTo(x, y);
              ink.stroke();
              length += Math.hypot(x - previous.x, y - previous.y);
              marks += 1;
            }
            previous = point;
          }
        }
        strokeCount += marks;
        layerStats.push({ angle, marks, laneGap, estimatedCoverage: length * settings.sketchLineWidth / (size * size) });
      }
    }

    function clearDepthMapTextures() {
      for (const layer of depthMapTextures) { layer.width = 0; layer.height = 0; }
      depthMapTextures = [];
      depthMapTextureKey = '';
      depthMapMapper = null;
    }

    function mappedLayerTextures(settings) {
      const mapper = global.FeCoverDepthLight && global.FeCoverDepthLight.depthMapColor;
      if (!settings.depthMapEnabled || typeof mapper !== 'function') return layerTextures;
      if (depthMapTextureKey === textureKey && depthMapMapper === mapper) return depthMapTextures;
      clearDepthMapTextures();
      const size = field.size;
      // Convert the cached pencil pixels once, preserving every stroke's coverage.
      // Animation only composites these surfaces, without pixel readback/mapping.
      for (const layer of layerTextures) {
        const surface = global.document.createElement('canvas');
        surface.width = size;
        surface.height = size;
        const mapped = surface.getContext('2d', { alpha: true });
        if (!mapped) { surface.width = 0; surface.height = 0; clearDepthMapTextures(); return layerTextures; }
        const pixels = layer.getContext('2d').getImageData(0, 0, size, size);
        const data = pixels.data;
        for (let offset = 0; offset < data.length; offset += 4) {
          if (!data[offset + 3]) continue;
          const color = mapper(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255);
          data[offset] = color[0] * 255;
          data[offset + 1] = color[1] * 255;
          data[offset + 2] = color[2] * 255;
        }
        mapped.putImageData(pixels, 0, 0);
        depthMapTextures.push(surface);
      }
      depthMapTextureKey = textureKey;
      depthMapMapper = mapper;
      depthMapTextureBuilds += 1;
      compositeKey = '';
      return depthMapTextures;
    }

    function composeTexture(settings, time, frame) {
      const layers = mappedLayerTextures(settings);
      const depthMapActive = layers === depthMapTextures;
      const amplitude = frame.reducedMotion ? 0 : settings.sketchFlowAmplitude;
      const key = `${textureKey}|${depthMapActive}|${amplitude ? time : 0}|${amplitude}|${settings.depthEnabled}|${settings.depthStrength}|${frame.yaw || 0}|${frame.pitch || 0}`;
      if (key === compositeKey) return;
      const ink = texture.getContext('2d');
      if (!ink) return;
      ink.setTransform(1, 0, 0, 1, 0, 0);
      ink.clearRect(0, 0, field.size, field.size);
      ink.globalCompositeOperation = 'source-over';
      ink.globalAlpha = 1;
      for (let i = 0; i < layers.length; i += 1) {
        const angle = ANGLES[i];
        const phase = i * 1.83 + strokeNoise(i, 0, 8) * 0.7;
        const flowRate = LAYER_FLOW_RATE + i * LAYER_FLOW_RATE_STEP;
        const swayRate = LAYER_SWAY_RATE + i * LAYER_SWAY_RATE_STEP;
        const flow = Math.sin(time * flowRate + phase) * amplitude * 0.72;
        const sway = Math.sin(time * swayRate + phase * 0.61) * amplitude * 0.16;
        const cross = Math.sin(time * (0.37 + i * 0.013) - phase) * amplitude * 0.22;
        const layerDepth = settings.depthEnabled
          ? (i - (layers.length - 1) / 2) * settings.depthStrength * 0.12
          : 0;
        const depthBreath = layerDepth * (1 + Math.sin(time * (DEPTH_BREATH_RATE + i * DEPTH_BREATH_RATE_STEP) + phase) * amplitude * 0.08);
        const x = Math.cos(angle) * (flow + sway) - Math.sin(angle) * cross + Math.sin(Number(frame.yaw) || 0) * depthBreath;
        const y = Math.sin(angle) * (flow + sway) + Math.cos(angle) * cross - Math.sin(Number(frame.pitch) || 0) * depthBreath;
        ink.setTransform(1, 0, 0, 1, x, y);
        ink.drawImage(layers[i], 0, 0);
      }
      ink.setTransform(1, 0, 0, 1, 0, 0);
      compositeKey = key;
      compositeBuilds += 1;
      texturePixels = null;
      lightingKey = '';
    }

    function updateLighting(settings, time) {
      const lighting = global.FeCoverDepthLight;
      renderTexture = texture;
      if (!lighting || !lighting.prepare || !lightingField || settings.depthEnabled === false || settings.depthLightingEnabled === false) return;
      const light = lighting.prepare(settings, time);
      if (!light.enabled || light.strength === 0) return;
      const key = [textureKey, depthSampleKey, settings.depthMapEnabled === true, settings.depthEnabled, settings.depthLightingEnabled, settings.depthStrength,
        settings.depthContrast, settings.depthInvert, settings.depthLightStrength, settings.depthAmbient,
        settings.depthLightAngle, settings.depthLightSpeed, settings.depthHighlight,
        number(settings.depthLightSpeed, 0.25, 0, 2) ? time : 0].join('|');
      if (lightingKey === key && lightingTexture) { renderTexture = lightingTexture; return; }
      const size = field.size;
      if (!texturePixels) texturePixels = texture.getContext('2d').getImageData(0, 0, size, size).data;
      if (!lightingTexture) lightingTexture = global.document.createElement('canvas');
      if (lightingTexture.width !== size || lightingTexture.height !== size) {
        lightingTexture.width = size;
        lightingTexture.height = size;
        lightingPixels = null;
      }
      const lit = lightingTexture.getContext('2d');
      if (!lit) return;
      if (!lightingPixels) lightingPixels = lit.createImageData(size, size);
      const stride = lightGridSize + 1;
      for (let y = 0; y <= lightGridSize; y += 1) {
        for (let x = 0; x <= lightGridSize; x += 1) {
          lightGrid[y * stride + x] = lighting.sampleLighting(lightingField, x / lightGridSize, y / lightGridSize, light);
        }
      }
      const output = lightingPixels.data;
      const scale = lightGridSize / (size - 1);
      for (let y = 0; y < size; y += 1) {
        const gy = Math.min(lightGridSize - 1, Math.floor(y * scale));
        const fy = y * scale - gy;
        const top = gy * stride;
        const bottom = top + stride;
        for (let x = 0; x < size; x += 1) {
          const gx = Math.min(lightGridSize - 1, Math.floor(x * scale));
          const fx = x * scale - gx;
          const upper = lightGrid[top + gx] * (1 - fx) + lightGrid[top + gx + 1] * fx;
          const lower = lightGrid[bottom + gx] * (1 - fx) + lightGrid[bottom + gx + 1] * fx;
          const brightness = upper * (1 - fy) + lower * fy;
          const offset = (y * size + x) * 4;
          output[offset] = texturePixels[offset] * brightness;
          output[offset + 1] = texturePixels[offset + 1] * brightness;
          output[offset + 2] = texturePixels[offset + 2] * brightness;
          output[offset + 3] = texturePixels[offset + 3];
        }
      }
      lit.putImageData(lightingPixels, 0, 0);
      lightingKey = key;
      lightingBuilds += 1;
      renderTexture = lightingTexture;
    }

    function buildGeometry(settings, mobile) {
      const key = `${sampleKey}|${Boolean(mobile)}`;
      if (key === geometryKey) return;
      geometryKey = key;
      depthKey = '';
      mesh = [];
      geometryBuilds += 1;
      meshSize = mobile ? 24 : 32;
      pointCount = meshSize * meshSize * 6;
      for (let row = 0; row <= meshSize; row += 1) {
        for (let column = 0; column <= meshSize; column += 1) {
          const u = column / meshSize * field.size;
          const v = row / meshSize * field.size;
          const x = (column / meshSize - 0.5) * HALF_SIZE * 2;
          const y = (row / meshSize - 0.5) * HALF_SIZE * 2;
          // Smooth only displacement. The pencil texture retains its full detail.
          let luminance = 0;
          for (const oy of [-2, 0, 2]) for (const ox of [-2, 0, 2]) luminance += field.luma[pixelIndex(u + ox, v + oy)];
          mesh.push({
            x,
            y,
            u,
            v,
            luma: luminance / 9,
            // Cached phase/rate values keep depth breathing deterministic and
            // avoid allocating or sampling the image during animation frames.
            depthPhase: x * 5.7 + y * 3.1,
            depthRate: DEPTH_BREATH_RATE + (Math.abs(x * 13 + y * 7) % 1) * 0.11,
            z: 0,
            screenX: 0,
            screenY: 0
          });
        }
      }
    }

    function updateDepth(settings) {
      const key = `${depthSampleKey}|${settings.depthEnabled}|${settings.depthStrength}|${settings.depthContrast}|${settings.depthInvert}`;
      if (key === depthKey) return;
      depthKey = key;
      for (const point of mesh) {
        let luminance = point.luma;
        if (lightingField) {
          const heights = lightingField.heights;
          luminance = 0;
          for (const oy of [-2, 0, 2]) for (const ox of [-2, 0, 2]) luminance += heights[pixelIndex(point.u + ox, point.v + oy)];
          luminance /= 9;
        }
        point.z = depthFromLuminance(luminance, settings);
      }
    }

    function drawTriangle(a, b, c) {
      const determinant = (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v);
      const xx = ((b.screenX - a.screenX) * (c.v - a.v) - (c.screenX - a.screenX) * (b.v - a.v)) / determinant;
      const xy = ((b.screenY - a.screenY) * (c.v - a.v) - (c.screenY - a.screenY) * (b.v - a.v)) / determinant;
      const yx = ((c.screenX - a.screenX) * (b.u - a.u) - (b.screenX - a.screenX) * (c.u - a.u)) / determinant;
      const yy = ((c.screenY - a.screenY) * (b.u - a.u) - (b.screenY - a.screenY) * (c.u - a.u)) / determinant;
      const tx = a.screenX - xx * a.u - yx * a.v;
      const ty = a.screenY - xy * a.u - yy * a.v;
      context.save();
      context.beginPath();
      context.moveTo(a.screenX, a.screenY);
      context.lineTo(b.screenX, b.screenY);
      context.lineTo(c.screenX, c.screenY);
      context.closePath();
      context.clip();
      context.setTransform(xx, xy, yx, yy, tx, ty);
      const sx = Math.max(0, Math.min(a.u, b.u, c.u) - 1);
      const sy = Math.max(0, Math.min(a.v, b.v, c.v) - 1);
      const sw = Math.min(field.size, Math.max(a.u, b.u, c.u) + 1) - sx;
      const sh = Math.min(field.size, Math.max(a.v, b.v, c.v) + 1) - sy;
      context.drawImage(renderTexture, sx, sy, sw, sh, sx, sy, sw, sh);
      context.restore();
    }

    function render(frame) {
      if (destroyed || !context || !frame) return false;
      const settings = normalizeSettings(frame.settings);
      const width = Math.max(1, Math.round(Number(frame.width) || canvas.width || 1));
      const height = Math.max(1, Math.round(Number(frame.height) || canvas.height || 1));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      sampleImage(frame);
      generateDepthField();
      buildTexture(settings);
      buildGeometry(settings, frame.mobile);
      const now = Number(frame.now);
      const measuredDelta = Number.isFinite(now) && lastNow !== null ? now - lastNow : 16.667;
      const delta = number(frame.deltaMs, measuredDelta, 0, 64);
      if (Number.isFinite(now)) lastNow = now;
      if (!frame.reducedMotion) flowTime += delta * 0.001 * settings.sketchFlowSpeed;
      if (!frame.reducedMotion) lightingTime += delta * 0.001;
      const lightTime = frame.reducedMotion ? lightingTime : Number.isFinite(frame.lightTime) ? frame.lightTime : lightingTime;
      composeTexture(settings, flowTime, frame);
      updateLighting(frame.settings || {}, lightTime);
      updateDepth(settings);
      const amplitude = frame.reducedMotion ? 0 : settings.sketchFlowAmplitude;
      const energy = number(frame.energy, 0, 0, 1);
      const drift = amplitude * (0.0045 + energy * 0.0025);
      const zDrift = settings.depthEnabled ? drift * 1.4 * settings.depthStrength : 0;
      const yaw = number(frame.yaw, 0, -Math.PI * 4, Math.PI * 4);
      const pitch = number(frame.pitch, 0, -Math.PI * 4, Math.PI * 4);
      const yawCos = Math.cos(yaw);
      const yawSin = Math.sin(yaw);
      const pitchCos = Math.cos(pitch);
      const pitchSin = Math.sin(pitch);
      const coverSize = Math.min(width, height) * 0.76 * number(frame.zoom, 1, 0.1, 8);
      const centerX = width * 0.5;
      const centerY = height * 0.48;
      context.clearRect(0, 0, width, height);
      // Adjacent triangle clips have complementary antialias coverage. Adding
      // that coverage avoids the dark diagonal seams of source-over compositing.
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 1;
      context.imageSmoothingEnabled = true;
      for (const point of mesh) {
        // Different regions advect independently, so the strokes breathe and flow
        // within the cover instead of moving a rigid image back and forth.
        const wave = Math.sin(point.x * 11.3 + point.y * 7.8 - flowTime * 1.35);
        const cross = Math.sin(point.x * 17.2 - point.y * 12.4 + flowTime * 0.73);
        const x = point.x + (wave * 0.72 + cross * 0.28) * drift;
        const y = point.y + (cross * 0.62 - wave * 0.38) * drift;
        const depthBreath = settings.depthEnabled
          ? point.z * (1 + Math.sin(flowTime * point.depthRate + point.depthPhase) * amplitude * 0.08)
          : 0;
        // Camera movement exposes the cached depth field as a small parallax
        // shift; the breathing term gently modulates that field over time.
        const parallaxX = yawSin * depthBreath * 0.14;
        const parallaxY = -pitchSin * depthBreath * 0.14;
        const z = depthBreath + (wave * 0.65 + cross * 0.35) * zDrift;
        const rotatedX = (x + parallaxX) * yawCos + z * yawSin;
        const rotatedZ = -x * yawSin + z * yawCos;
        const rotatedY = (y + parallaxY) * pitchCos - rotatedZ * pitchSin;
        const pointZ = y * pitchSin + rotatedZ * pitchCos;
        const perspective = 1.24 / Math.max(0.2, 1.24 - pointZ * 0.54);
        point.screenX = centerX + rotatedX * coverSize * perspective;
        point.screenY = centerY + rotatedY * coverSize * perspective;
      }
      const rowSize = meshSize + 1;
      for (let row = 0; row < meshSize; row += 1) {
        for (let column = 0; column < meshSize; column += 1) {
          const top = row * rowSize + column;
          drawTriangle(mesh[top], mesh[top + 1], mesh[top + rowSize]);
          drawTriangle(mesh[top + rowSize + 1], mesh[top + rowSize], mesh[top + 1]);
        }
      }
      return true;
    }

    function reset() {
      sourceImage = null;
      sampleKey = '';
      geometryKey = '';
      depthKey = '';
      field = null;
      mesh = [];
      if (texture) { texture.width = 0; texture.height = 0; }
      texture = null;
      for (const layer of layerTextures) { layer.width = 0; layer.height = 0; }
      layerTextures = [];
      clearDepthMapTextures();
      layerStats = [];
      compositeKey = '';
      if (lightingTexture) { lightingTexture.width = 0; lightingTexture.height = 0; }
      lightingTexture = null;
      lightingPixels = null;
      texturePixels = null;
      lightingField = null;
      depthSampleKey = '';
      depthFieldBuilder = null;
      depthImageStatus = 'placeholder';
      lightingKey = '';
      lightingTime = 0;
      renderTexture = null;
      textureKey = '';
      strokeCount = 0;
      pointCount = 0;
      currentLayers = 0;
      imageStatus = 'empty';
      flowTime = 0;
      lastNow = null;
      if (context && canvas) context.clearRect(0, 0, canvas.width, canvas.height);
    }

    function destroy() {
      reset();
      destroyed = true;
      context = null;
      canvas = null;
    }

    function getStats(options) {
      const layerDetails = layerStats.map((layer, index) => {
        if (!options || !options.includeLayerCoverage) return { ...layer };
        const surface = layerTextures[index];
        const pixels = surface.getContext('2d').getImageData(0, 0, surface.width, surface.height).data;
        let alpha = 0;
        let transparent = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          alpha += pixels[i] / 255;
          if (pixels[i] === 0) transparent += 1;
        }
        const count = pixels.length / 4;
        return { ...layer, alphaCoverage: alpha / count, transparentFraction: transparent / count };
      });
      return { paths: strokeCount, points: pointCount, layers: currentLayers, layerDetails, sampleBuilds, geometryBuilds, textureBuilds, depthMapTextureBuilds, compositeBuilds, lightingBuilds, depthSampleBuilds, depthImageStatus, sampleSize: field ? field.size : 0, imageStatus, destroyed };
    }

    function drawLayerPreview(index, target) {
      if (destroyed || !layerTextures[index] || !target) return false;
      target.width = layerTextures[index].width;
      target.height = layerTextures[index].height;
      const preview = target.getContext('2d');
      if (!preview) return false;
      preview.drawImage(layerTextures[index], 0, 0);
      return true;
    }

    return { render, reset, destroy, getStats, drawLayerPreview };
  }

  global.FeCoverSketch = { create, depthFromLuminance };
})(typeof window !== 'undefined' ? window : globalThis);
