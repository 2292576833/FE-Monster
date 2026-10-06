(function (global) {
  'use strict';

  const LIGHT_Z = 0.72;
  const LIGHT_RADIUS = Math.sqrt(1 - LIGHT_Z * LIGHT_Z);
  const ROTATION_RATE = 0.45;

  function number(value, fallback, low, high) {
    const parsed = Number(value);
    return Math.max(low, Math.min(high, Number.isFinite(parsed) ? parsed : fallback));
  }

  function smoothRange(low, high, value) {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  }

  // Display-only depth-map treatment. Keep it independent of the geometric
  // depth and lighting controls so switching the look always changes the cover.
  function depthMapColor(r, g, b) {
    r = number(r, 0, 0, 1);
    g = number(g, 0, 0, 1);
    b = number(b, 0, 0, 1);
    const tone = Math.pow(smoothRange(0.08, 0.9, r * 0.2126 + g * 0.7152 + b * 0.0722), 1.35);
    const other = Math.max(g, b);
    // Most colors become neutral. A narrow bright-red range keeps small vivid
    // accents such as the reference's eyes without retaining a full-color cover.
    const accent = 0.82 * smoothRange(0.7, 0.95, r)
      * (1 - smoothRange(0.12, 0.3, other)) * smoothRange(0.55, 0.8, r - other);
    return [
      tone * (1 - accent) + Math.max(tone, 0.92) * accent,
      tone * (1 - accent * 0.92),
      tone * (1 - accent * 0.92)
    ];
  }

  const glslDepthMapSnippet = `
vec3 feCoverDepthMapColor(vec3 sourceColor) {
  vec3 color = clamp(sourceColor, 0.0, 1.0);
  float tone = pow(smoothstep(0.08, 0.9, dot(color, vec3(0.2126, 0.7152, 0.0722))), 1.35);
  float other = max(color.g, color.b);
  float accent = 0.82 * smoothstep(0.7, 0.95, color.r)
    * (1.0 - smoothstep(0.12, 0.3, other)) * smoothstep(0.55, 0.8, color.r - other);
  return vec3(mix(tone, max(tone, 0.92), accent), vec2(tone * (1.0 - accent * 0.92)));
}`;

  // Sliding box filters keep image preparation linear in the number of pixels.
  function blur(source, width, height, radius) {
    const horizontal = new Float32Array(source.length);
    const result = new Float32Array(source.length);
    const divisor = radius * 2 + 1;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) sum += source[row + Math.max(0, Math.min(width - 1, x))];
      for (let x = 0; x < width; x += 1) {
        horizontal[row + x] = sum / divisor;
        sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
      for (let y = 0; y < height; y += 1) {
        result[y * width + x] = sum / divisor;
        sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
      }
    }
    return result;
  }

  function buildField(pixels, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !pixels || pixels.length < width * height * 4) {
      throw new RangeError('Cover depth lighting requires a complete RGBA image and positive integer dimensions.');
    }
    const count = width * height;
    const luminance = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const rgba = i * 4;
      const alpha = pixels[rgba + 3] / 255;
      luminance[i] = ((pixels[rgba] * 0.2126 + pixels[rgba + 1] * 0.7152 + pixels[rgba + 2] * 0.0722) / 255) * alpha + 0.5 * (1 - alpha);
    }
    const size = Math.min(width, height);
    const local = blur(luminance, width, height, Math.max(1, Math.round(size / 256)));
    const broad = blur(local, width, height, Math.max(2, Math.round(size / 64)));
    const heights = luminance;
    const normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) heights[i] = broad[i] * 0.75 + local[i] * 0.25;
    // This is an image-derived relief estimate, not inferred physical object depth.
    // Smooth forms dominate; a smaller local component retains facial/cover detail.
    const slopeScale = size * 0.12;
    for (let y = 0; y < height; y += 1) {
      const above = Math.max(0, y - 1) * width;
      const below = Math.min(height - 1, y + 1) * width;
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const index = row + x;
        const nx = (heights[row + Math.max(0, x - 1)] - heights[row + Math.min(width - 1, x + 1)]) * slopeScale;
        // Image coordinates run down; rendering/world coordinates run up.
        const ny = (heights[below + x] - heights[above + x]) * slopeScale;
        const length = Math.hypot(nx, ny, 1);
        normals[index * 3] = nx / length;
        normals[index * 3 + 1] = ny / length;
        normals[index * 3 + 2] = 1 / length;
      }
    }
    return { width, height, heights, normals };
  }

  function prepare(settings, time) {
    const prefs = settings || {};
    const seconds = Number.isFinite(time) ? time : 0;
    const speed = number(prefs.depthLightSpeed, 0.25, 0, 2);
    const angle = number(prefs.depthLightAngle, 315, 0, 360) * Math.PI / 180 + seconds * speed * ROTATION_RATE;
    const direction = [Math.cos(angle) * LIGHT_RADIUS, Math.sin(angle) * LIGHT_RADIUS, LIGHT_Z];
    const halfLength = Math.sqrt(2 + 2 * LIGHT_Z);
    const halfVector = [direction[0] / halfLength, direction[1] / halfLength, (LIGHT_Z + 1) / halfLength];
    const depthStrength = number(prefs.depthStrength, 1, 0, 3);
    return {
      prepared: true,
      enabled: prefs.depthEnabled !== false && prefs.depthLightingEnabled !== false && depthStrength > 0,
      direction,
      halfVector,
      strength: number(prefs.depthLightStrength, 0.8, 0, 2),
      ambient: number(prefs.depthAmbient, 0.65, 0.05, 1),
      highlight: number(prefs.depthHighlight, 0.35, 0, 2),
      normalScale: depthStrength * number(prefs.depthContrast, 1, 0.25, 3) * (prefs.depthInvert ? -1 : 1)
    };
  }

  function lightDirection(settings, time) {
    return prepare(settings, time).direction;
  }

  function lightingFromNormal(nx, ny, nz, settingsOrLight, time) {
    const light = settingsOrLight && settingsOrLight.prepared ? settingsOrLight : prepare(settingsOrLight, time);
    if (!light.enabled || light.strength === 0) return 1;
    nx *= light.normalScale;
    ny *= light.normalScale;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!Number.isFinite(length) || length === 0) return 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const diffuse = Math.max(0, nx * light.direction[0] + ny * light.direction[1] + nz * light.direction[2]);
    const specular = Math.pow(Math.max(0, nx * light.halfVector[0] + ny * light.halfVector[1] + nz * light.halfVector[2]), 24);
    const shade = light.ambient + (1 - light.ambient) * diffuse / LIGHT_Z;
    return Math.max(0.2, Math.min(1.8, 1 + light.strength * (shade - 1) + light.strength * light.highlight * 0.45 * specular));
  }

  function highlightFromNormal(nx, ny, nz, settingsOrLight, time) {
    const light = settingsOrLight && settingsOrLight.prepared ? settingsOrLight : prepare(settingsOrLight, time);
    if (!light.enabled || light.strength === 0 || light.highlight === 0) return 0;
    nx *= light.normalScale;
    ny *= light.normalScale;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!Number.isFinite(length) || length === 0) return 0;
    const specular = Math.pow(Math.max(0, (nx * light.halfVector[0] + ny * light.halfVector[1] + nz * light.halfVector[2]) / length), 24);
    // Reflections remain visible on black artwork. The small separate term is
    // composited into each channel's remaining headroom by the particle renderer.
    return Math.max(0, Math.min(0.32, light.strength * light.highlight * 0.12 * specular));
  }

  function sampleLighting(field, u, v, settingsOrLight, time) {
    const light = settingsOrLight && settingsOrLight.prepared ? settingsOrLight : prepare(settingsOrLight, time);
    if (!light.enabled || light.strength === 0 || !field || !field.normals || !field.width || !field.height) return 1;
    const x = number(u, 0.5, 0, 1) * (field.width - 1);
    const y = number(v, 0.5, 0, 1) * (field.height - 1);
    const left = Math.floor(x);
    const top = Math.floor(y);
    const right = Math.min(left + 1, field.width - 1);
    const bottom = Math.min(top + 1, field.height - 1);
    const fx = x - left;
    const fy = y - top;
    const a = (top * field.width + left) * 3;
    const b = (top * field.width + right) * 3;
    const c = (bottom * field.width + left) * 3;
    const d = (bottom * field.width + right) * 3;
    const wa = (1 - fx) * (1 - fy);
    const wb = fx * (1 - fy);
    const wc = (1 - fx) * fy;
    const wd = fx * fy;
    const normals = field.normals;
    return lightingFromNormal(
      normals[a] * wa + normals[b] * wb + normals[c] * wc + normals[d] * wd,
      normals[a + 1] * wa + normals[b + 1] * wb + normals[c + 1] * wc + normals[d + 1] * wd,
      normals[a + 2] * wa + normals[b + 2] * wb + normals[c + 2] * wc + normals[d + 2] * wd,
      light
    );
  }

  // Keep the particle shader and Canvas2D renderer on exactly the same lighting model.
  // Callers bypass this function when prepare().enabled is false.
  const glslSnippet = `
float feCoverDepthLighting(vec3 sourceNormal, vec3 lightDirection, vec3 halfVector, float strength, float ambient, float highlight, float normalScale) {
  vec3 normal = normalize(vec3(sourceNormal.xy * normalScale, sourceNormal.z));
  float diffuse = max(0.0, dot(normal, lightDirection));
  float specular = pow(max(0.0, dot(normal, halfVector)), 24.0);
  float shade = ambient + (1.0 - ambient) * diffuse / 0.72;
  return clamp(1.0 + strength * (shade - 1.0) + strength * highlight * 0.45 * specular, 0.2, 1.8);
}
float feCoverDepthHighlight(vec3 sourceNormal, vec3 halfVector, float strength, float highlight, float normalScale) {
  vec3 normal = normalize(vec3(sourceNormal.xy * normalScale, sourceNormal.z));
  float specular = pow(max(0.0, dot(normal, halfVector)), 24.0);
  return clamp(strength * highlight * 0.12 * specular, 0.0, 0.32);
}`;

  global.FeCoverDepthLight = { buildField, prepare, lightDirection, lightingFromNormal, highlightFromNormal, sampleLighting, depthMapColor, glslDepthMapSnippet, glslSnippet };
})(typeof window !== 'undefined' ? window : globalThis);
