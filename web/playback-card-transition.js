/*
 * Playback surface morph
 * ----------------------
 *
 * The player owns its DOM and can opt in to this little renderer without
 * knowing anything about Three.js.  A DOM surface is painted into a pair of
 * small canvases, then sampled into a dense cloud of textured points.  The
 * source and target are hidden while the cloud is alive so that an intact
 * player never peeks through the transition.
 */
(function playbackCardTransitionFactory(global) {
  'use strict';

  const DEFAULT_ASSEMBLE_MS = 2400;
  // Assembly starts on the first frame after the breakup.  The particles
  // still spend the configured assembleMs flowing through the target center
  // and then resolving across the target surface, so the transition remains
  // calm without an idle hold between the two modes.
  const MAX_PARTICLES = 6000;
  const TAU = Math.PI * 2;

  let active = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
  const easeInOutSlow = (value) => {
    const t = clamp(value, 0, 1);
    // This intentionally starts and finishes gently.  The assemble phase is
    // meant to feel like a cloud settling, not a quick spring.
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  function safeCall(callback, ...args) {
    if (typeof callback !== 'function') return;
    try { callback(...args); } catch (_) { /* consumer callbacks are isolated */ }
  }

  function random01(seed) {
    // A deterministic integer hash keeps a transition stable across frames.
    let x = (seed | 0) + 0x6D2B79F5;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
    const r = clamp(radius || 0, 0, Math.min(width, height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function firstRadius(value) {
    const match = String(value || '').match(/-?[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  function paintGradient(ctx, style, x, y, width, height) {
    const image = String(style.backgroundImage || '');
    const match = image.match(/linear-gradient\((.*)\)/i);
    if (!match) return false;
    // Keep the parser deliberately forgiving; CSS gradients used by the
    // player are generally two or three color stops.
    const gradientStops = [];
    let depth = 0;
    let token = '';
    for (const character of match[1]) {
      if (character === '(') depth += 1;
      else if (character === ')') depth = Math.max(0, depth - 1);
      if (character === ',' && depth === 0) {
        gradientStops.push(token);
        token = '';
      } else token += character;
    }
    if (token) gradientStops.push(token);
    const colors = gradientStops
      .join(',')
      .replace(/^\s*(?:to\s+[^,]+|[-\d.]+deg)\s*,/i, '')
      .split(/,(?=\s*(?:#|rgb|hsl|[a-z]))/i)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/\s+[-\d.]+%\s*$/, '').trim())
      .filter((item) => !global.CSS?.supports || global.CSS.supports('color', item));
    if (colors.length < 2) return false;
    const angle = /(?:to\s+bottom|180deg)/i.test(match[1]) ? Math.PI / 2 : 0;
    const x1 = x + width / 2 - Math.cos(angle) * width;
    const y1 = y + height / 2 - Math.sin(angle) * height;
    const x2 = x + width / 2 + Math.cos(angle) * width;
    const y2 = y + height / 2 + Math.sin(angle) * height;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
    ctx.fillStyle = gradient;
    roundedRectPath(ctx, x, y, width, height, firstRadius(style.borderRadius));
    ctx.fill();
    return true;
  }

  function canUseImage(src) {
    if (!src) return false;
    if (/^(?:data:|blob:)/i.test(src)) return true;
    try {
      const url = new URL(src, global.location && global.location.href);
      return !global.location || url.origin === global.location.origin;
    } catch (_) {
      return false;
    }
  }

  function paintImage(ctx, image, x, y, width, height, radius) {
    if (!image || !image.complete || !image.naturalWidth || !canUseImage(image.currentSrc || image.src)) return;
    ctx.save();
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.clip();
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function svgNumber(value, fallback) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function svgPaint(ctx, node) {
    const computed = global.getComputedStyle ? global.getComputedStyle(node) : {};
    const fill = node.getAttribute('fill') || computed.fill || 'none';
    const stroke = node.getAttribute('stroke') || computed.stroke || 'none';
    if (fill && fill !== 'none' && fill !== 'transparent') {
      ctx.fillStyle = fill;
    }
    if (stroke && stroke !== 'none' && stroke !== 'transparent') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(.5, svgNumber(node.getAttribute('stroke-width') || computed.strokeWidth, 1));
      ctx.lineCap = node.getAttribute('stroke-linecap') || 'round';
      ctx.lineJoin = node.getAttribute('stroke-linejoin') || 'round';
    }
    return { fill, stroke };
  }

  // A tiny SVG painter keeps the player's perimeter/ring icons visible in a
  // snapshot without turning the transition into a rasterisation dependency.
  function paintSvgTree(ctx, node, originX, originY, scaleX, scaleY) {
    const tag = String(node.tagName || '').toLowerCase();
    const paint = svgPaint(ctx, node);
    ctx.save();
    const draw = (path, closed) => {
      if (paint.fill !== 'none' && paint.fill !== 'transparent') ctx.fill(path);
      if (paint.stroke !== 'none' && paint.stroke !== 'transparent') ctx.stroke(path);
      else if (closed && paint.fill !== 'none' && paint.fill !== 'transparent') ctx.fill(path);
    };
    if (tag === 'rect') {
      const x = originX + svgNumber(node.getAttribute('x'), 0) * scaleX;
      const y = originY + svgNumber(node.getAttribute('y'), 0) * scaleY;
      const width = svgNumber(node.getAttribute('width'), 0) * scaleX;
      const height = svgNumber(node.getAttribute('height'), 0) * scaleY;
      const path = new Path2D();
      path.rect(x, y, width, height);
      draw(path, true);
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = originX + svgNumber(node.getAttribute('cx'), 0) * scaleX;
      const cy = originY + svgNumber(node.getAttribute('cy'), 0) * scaleY;
      const rx = svgNumber(node.getAttribute(tag === 'circle' ? 'r' : 'rx'), 0) * scaleX;
      const ry = svgNumber(node.getAttribute(tag === 'circle' ? 'r' : 'ry'), 0) * scaleY;
      const path = new Path2D();
      path.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      draw(path, true);
    } else if (tag === 'line') {
      const path = new Path2D();
      path.moveTo(originX + svgNumber(node.getAttribute('x1'), 0) * scaleX, originY + svgNumber(node.getAttribute('y1'), 0) * scaleY);
      path.lineTo(originX + svgNumber(node.getAttribute('x2'), 0) * scaleX, originY + svgNumber(node.getAttribute('y2'), 0) * scaleY);
      draw(path, false);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const values = String(node.getAttribute('points') || '').trim().split(/[ ,]+/).map(Number);
      const path = new Path2D();
      for (let index = 0; index + 1 < values.length; index += 2) {
        const px = originX + values[index] * scaleX;
        const py = originY + values[index + 1] * scaleY;
        if (index === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }
      if (tag === 'polygon') path.closePath();
      draw(path, tag === 'polygon');
    } else if (tag === 'path') {
      const tokens = String(node.getAttribute('d') || '').match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
      const path = new Path2D();
      let command = '';
      let cursorX = 0; let cursorY = 0;
      let index = 0;
      while (index < tokens.length) {
        if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++];
        const lower = command.toLowerCase();
        const relative = command === lower;
        if (lower === 'm' || lower === 'l') {
          if (index + 1 >= tokens.length) break;
          let px = Number(tokens[index++]); let py = Number(tokens[index++]);
          if (relative) { px += cursorX; py += cursorY; }
          if (lower === 'm') path.moveTo(originX + px * scaleX, originY + py * scaleY);
          else path.lineTo(originX + px * scaleX, originY + py * scaleY);
          cursorX = px; cursorY = py;
          if (lower === 'm') command = relative ? 'l' : 'L';
        } else if (lower === 'h' || lower === 'v') {
          if (index >= tokens.length) break;
          const value = Number(tokens[index++]);
          if (lower === 'h') cursorX = relative ? cursorX + value : value;
          else cursorY = relative ? cursorY + value : value;
          path.lineTo(originX + cursorX * scaleX, originY + cursorY * scaleY);
        } else if (lower === 'z') {
          path.closePath(); command = '';
        } else {
          // Curves are intentionally skipped as perimeter artwork is generally
          // represented by M/L paths. Advance until the next command.
          if (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) index += 1;
        }
      }
      draw(path, false);
    }
    if (tag !== 'defs') {
      node.children && Array.from(node.children).forEach((child) => paintSvgTree(ctx, child, originX, originY, scaleX, scaleY));
    }
    ctx.restore();
  }

  function paintSvgElement(ctx, element, x, y, width, height) {
    const viewBox = String(element.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    const vbWidth = viewBox.length === 4 && viewBox[2] > 0 ? viewBox[2] : svgNumber(element.getAttribute('width'), width);
    const vbHeight = viewBox.length === 4 && viewBox[3] > 0 ? viewBox[3] : svgNumber(element.getAttribute('height'), height);
    const originX = x - (viewBox.length === 4 ? viewBox[0] * (width / vbWidth) : 0);
    const originY = y - (viewBox.length === 4 ? viewBox[1] * (height / vbHeight) : 0);
    paintSvgTree(ctx, element, originX, originY, width / vbWidth, height / vbHeight);
  }

  function drawDirectText(ctx, element, style, x, y, width, height) {
    const textNodes = [];
    element.childNodes && element.childNodes.forEach((node) => {
      if (node.nodeType === 3 && String(node.nodeValue || '').trim()) textNodes.push(String(node.nodeValue));
    });
    let text = textNodes.join(' ').replace(/\s+/g, ' ').trim();
    if (!text && element.tagName === 'INPUT') text = element.value || element.placeholder || '';
    if (!text || style.visibility === 'hidden' || style.display === 'none') return;
    const fontSize = parseFloat(style.fontSize) || 14;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.25;
    const family = style.fontFamily || 'system-ui, sans-serif';
    ctx.font = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${fontSize}px ${family}`;
    ctx.fillStyle = style.color || 'rgba(255,255,255,.9)';
    ctx.textBaseline = 'top';
    const align = style.textAlign || 'left';
    const maxWidth = Math.max(1, width - 4);
    const tokens = /\s/.test(text) ? text.split(/\s+/) : Array.from(text);
    const lines = [];
    let line = '';
    tokens.forEach((token) => {
      const candidate = line ? `${line}${/\s/.test(text) ? ' ' : ''}${token}` : token;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = token;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    const maxLines = Math.max(1, Math.ceil(height / lineHeight));
    lines.slice(0, maxLines).forEach((lineText, lineIndex) => {
      const lineWidth = ctx.measureText(lineText).width;
      let dx = x + 2;
      if (align === 'center') dx = x + (width - lineWidth) / 2;
      else if (align === 'right' || align === 'end') dx = x + width - lineWidth - 2;
      ctx.fillText(lineText, dx, y + lineIndex * lineHeight + Math.max(0, (height - lineHeight * lines.length) / 2));
    });
  }

  function paintElement(ctx, element, rootRect, scale) {
    if (!element || element.nodeType !== 1) return;
    const style = global.getComputedStyle ? global.getComputedStyle(element) : {};
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.01) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left - rootRect.left;
    const y = rect.top - rootRect.top;
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;
    const radius = firstRadius(style.borderRadius);

    ctx.save();
    roundedRectPath(ctx, x, y, width, height, radius);
    ctx.clip();
    const bg = style.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = bg;
      ctx.fill();
    }
    paintGradient(ctx, style, x, y, width, height);
    if (style.backgroundImage && /url\(/i.test(style.backgroundImage)) {
      const url = style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/i);
      if (url && canUseImage(url[1])) {
        const image = new Image();
        image.src = url[1];
        if (image.complete && image.naturalWidth) paintImage(ctx, image, x, y, width, height, radius);
      }
    }
    ctx.restore();

    if (element.tagName === 'IMG') paintImage(ctx, element, x, y, width, height, radius);
    if (element.tagName === 'CANVAS') {
      try { ctx.drawImage(element, x, y, width, height); } catch (_) { /* tainted or detached canvas */ }
    }
    if (String(element.namespaceURI || '').includes('svg') && String(element.tagName || '').toLowerCase() === 'svg') {
      paintSvgElement(ctx, element, x, y, width, height);
    }
    drawDirectText(ctx, element, style, x, y, width, height);

    const borderWidth = parseFloat(style.borderTopWidth) || 0;
    if (borderWidth > 0 && style.borderTopColor && style.borderTopColor !== 'transparent') {
      ctx.save();
      ctx.strokeStyle = style.borderTopColor;
      ctx.lineWidth = borderWidth;
      roundedRectPath(ctx, x + borderWidth / 2, y + borderWidth / 2, width - borderWidth, height - borderWidth, Math.max(0, radius - borderWidth / 2));
      ctx.stroke();
      ctx.restore();
    }
    // SVG children are painted as one tree so their viewBox and stroke scale
    // stay coherent; regular HTML descendants are painted independently.
    if (!(String(element.namespaceURI || '').includes('svg') && String(element.tagName || '').toLowerCase() === 'svg')) {
      element.children && Array.from(element.children).forEach((child) => paintElement(ctx, child, rootRect, scale));
    }
  }

  function snapshotSurface(element) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || element.offsetWidth || 1));
    const height = Math.max(1, Math.round(rect.height || element.offsetHeight || 1));
    const dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return { canvas, width, height, dpr, rect, ctx: null };
    ctx.scale(dpr, dpr);
    paintElement(ctx, element, rect, dpr);
    let pixels = null;
    try { pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; } catch (_) { /* cross-origin image; use fallback color */ }
    return { canvas, width, height, dpr, rect, ctx, pixels };
  }

  function pixelAt(snapshot, x, y) {
    const px = clamp(Math.round(x * snapshot.dpr), 0, snapshot.canvas.width - 1);
    const py = clamp(Math.round(y * snapshot.dpr), 0, snapshot.canvas.height - 1);
    try {
      const data = snapshot.pixels
        ? snapshot.pixels.subarray((py * snapshot.canvas.width + px) * 4, (py * snapshot.canvas.width + px) * 4 + 4)
        : (snapshot.ctx || snapshot.canvas.getContext('2d')).getImageData(px, py, 1, 1).data;
      return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
    } catch (_) {
      return [0.035, 0.045, 0.07, 1];
    }
  }

  function makeParticleSet(source, target, style) {
    const maxWidth = Math.max(source.width, target.width);
    const maxHeight = Math.max(source.height, target.height);
    const area = maxWidth * maxHeight;
    const cell = Math.max(2.6, Math.sqrt(area / MAX_PARTICLES));
    const cols = Math.max(1, Math.ceil(maxWidth / cell));
    const rows = Math.max(1, Math.ceil(maxHeight / cell));
    const count = cols * rows;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const targetColors = new Float32Array(count * 3);
    const opacity = new Float32Array(count);
    const targetOpacity = new Float32Array(count);
    const from = new Float32Array(count * 3);
    const to = new Float32Array(count * 3);
    const toCenter = new Float32Array(count * 3);
    const scatter = new Float32Array(count * 3);
    const delays = new Float32Array(count);
    const speeds = new Float32Array(count);
    const viewportW = global.innerWidth || document.documentElement.clientWidth || 1;
    const viewportH = global.innerHeight || document.documentElement.clientHeight || 1;
    const centerX = source.rect.left + source.width / 2;
    const centerY = source.rect.top + source.height / 2;
    const targetCenterX = target.rect.left + target.width / 2 - viewportW / 2;
    const targetCenterY = viewportH / 2 - (target.rect.top + target.height / 2);
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      const v = rows === 1 ? 0 : row / (rows - 1);
      for (let col = 0; col < cols; col += 1) {
        const u = cols === 1 ? 0 : col / (cols - 1);
        const sx = clamp(u * source.width, 0, source.width - 1);
        const sy = clamp(v * source.height, 0, source.height - 1);
        const tx = clamp(u * target.width, 0, target.width - 1);
        const ty = clamp(v * target.height, 0, target.height - 1);
        const srcColor = pixelAt(source, sx, sy);
        const dstColor = pixelAt(target, tx, ty);
        const point = index * 3;
        const srcX = source.rect.left + sx;
        const srcY = source.rect.top + sy;
        const dstX = target.rect.left + tx;
        const dstY = target.rect.top + ty;
        from[point] = srcX - viewportW / 2;
        from[point + 1] = viewportH / 2 - srcY;
        from[point + 2] = 0;
        to[point] = dstX - viewportW / 2;
        to[point + 1] = viewportH / 2 - dstY;
        to[point + 2] = 0;
        // The gather phase has an explicit destination anchor.  Particles
        // first stream into the target surface's center, then fan out to the
        // target pixels so the card location reads clearly during assembly.
        toCenter[point] = targetCenterX;
        toCenter[point + 1] = targetCenterY;
        toCenter[point + 2] = 0;
        positions[point] = from[point];
        positions[point + 1] = from[point + 1];
        positions[point + 2] = 0;
        colors[point] = srcColor[0]; colors[point + 1] = srcColor[1]; colors[point + 2] = srcColor[2];
        targetColors[point] = dstColor[0]; targetColors[point + 1] = dstColor[1]; targetColors[point + 2] = dstColor[2];
        opacity[index] = srcColor[3];
        targetOpacity[index] = dstColor[3];

        const randomA = random01(index * 17 + 5);
        const randomB = random01(index * 31 + 11);
        const sourceNormX = source.width ? sx / source.width : 0.5;
        const sourceNormY = source.height ? sy / source.height : 0.5;
        let delay;
        if (style === 'center-out') {
          const distance = Math.hypot(sourceNormX - 0.5, sourceNormY - 0.5) / 0.7072;
          delay = clamp(distance * 0.88 + randomA * 0.12, 0, 1);
        } else if (style === 'scatter') {
          delay = randomA * 0.82 + randomB * 0.18;
        } else {
          // “bottom-up”: v=1 (the bottom row) starts first.
          delay = clamp((1 - sourceNormY) * 0.9 + randomA * 0.1, 0, 1);
        }
        delays[index] = delay;
        speeds[index] = 0.82 + randomB * 0.48;

        const dx = srcX - centerX;
        const dy = srcY - centerY;
        let angle = Math.atan2(dy, dx);
        if (style === 'scatter') angle += (randomA - 0.5) * Math.PI * 1.25;
        const length = Math.max(54, Math.min(viewportW, viewportH) * (0.08 + randomB * 0.18));
        const jitterX = (randomA - 0.5) * 100;
        const jitterY = (randomB - 0.5) * 100;
        scatter[point] = from[point] + Math.cos(angle) * length + jitterX;
        scatter[point + 1] = from[point + 1] - Math.sin(angle) * length + jitterY;
        scatter[point + 2] = (randomA - 0.5) * 35;
        index += 1;
      }
    }
    return { positions, colors, targetColors, opacity, targetOpacity, from, to, toCenter, scatter, delays, speeds, count, cell };
  }

  function particleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.45, 'rgba(255,255,255,.95)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return canvas;
  }

  function hideSurface(element) {
    if (!element || !element.style) return null;
    const saved = {
      visibility: element.style.visibility,
      opacity: element.style.opacity,
      pointerEvents: element.style.pointerEvents,
      transform: element.style.transform,
    };
    element.style.visibility = 'hidden';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    element.setAttribute('data-playback-transition-hidden', 'true');
    return saved;
  }

  function restoreSurface(element, saved) {
    if (!element || !element.style || !saved) return;
    element.style.visibility = saved.visibility;
    element.style.opacity = saved.opacity;
    element.style.pointerEvents = saved.pointerEvents;
    element.style.transform = saved.transform;
    element.removeAttribute('data-playback-transition-hidden');
  }

  function createRenderer(canvas, width, height, THREE) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch (_) {
      return null;
    }
    const dpr = clamp(global.devicePixelRatio || 1, 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -100, 100);
    camera.position.z = 10;
    return { renderer, camera };
  }

  function disposeState(state) {
    if (!state) return;
    if (state.raf) global.cancelAnimationFrame(state.raf);
    if (state.timer) global.clearTimeout(state.timer);
    if (state.resizeHandler) global.removeEventListener('resize', state.resizeHandler);
    try {
      state.geometry && state.geometry.dispose();
      state.material && state.material.dispose();
      state.texture && state.texture.dispose();
      state.renderer && state.renderer.dispose();
      state.renderer && state.renderer.forceContextLoss && state.renderer.forceContextLoss();
    } catch (_) { /* dispose is best effort on browser teardown */ }
    state.canvas && state.canvas.remove();
    restoreSurface(state.source, state.sourceStyle);
    restoreSurface(state.target, state.targetStyle);
    if (state.resolve) state.resolve(state.result || { completed: false, cancelled: true });
    state.resolve = null;
  }

  function runCanvasFallback(opts, source, target, sourceSnapshot, targetSnapshot, canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      safeCall(opts.onPhase, 'complete', 1);
      return Promise.resolve({ completed: true, reason: 'canvas-unavailable' });
    }
    const width = global.innerWidth || document.documentElement.clientWidth || 1;
    const height = global.innerHeight || document.documentElement.clientHeight || 1;
    canvas.width = Math.max(1, Math.round(width * clamp(global.devicePixelRatio || 1, 1, 2)));
    canvas.height = Math.max(1, Math.round(height * clamp(global.devicePixelRatio || 1, 1, 2)));
    const style = ['bottom-up', 'center-out', 'scatter'].includes(opts.style) ? opts.style : 'bottom-up';
    canvas.dataset.phase = 'shatter';
    canvas.dataset.transitionPhase = 'shatter';
    canvas.dataset.style = style;
    (document.body || document.documentElement).appendChild(canvas);
    const sourceStyle = hideSurface(source);
    const targetStyle = hideSurface(target);
    const shatterMs = style === 'center-out' ? 1100 : 980;
    const assembleMs = clamp(Number(opts.assembleMs) || DEFAULT_ASSEMBLE_MS, 1400, 4000);
    const startedAt = performance.now();
    const promise = new Promise((resolve) => {
      const state = { canvas, source, target, sourceStyle, targetStyle, resolve, timer: 0, result: null };
      active = state;
      const draw = (now) => {
        if (active !== state) return;
        const elapsed = now - startedAt;
        let phase = 'shatter';
        if (elapsed >= shatterMs && elapsed < shatterMs + assembleMs) phase = 'assemble';
        else if (elapsed >= shatterMs + assembleMs) phase = 'complete';
        canvas.dataset.phase = phase;
        canvas.dataset.transitionPhase = phase;
        safeCall(opts.onPhase, phase, phase === 'assemble' ? clamp((elapsed - shatterMs) / assembleMs, 0, 1) : 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = phase === 'complete' ? 0 : 0.5;
        ctx.drawImage(sourceSnapshot.canvas, sourceSnapshot.rect.left, sourceSnapshot.rect.top, sourceSnapshot.width, sourceSnapshot.height);
        ctx.globalAlpha = 1;
        if (phase === 'complete') {
          state.result = { completed: true, phase };
          disposeState(state); active = null; return;
        }
        state.timer = global.setTimeout(() => draw(performance.now()), 32);
      };
      draw(startedAt);
    });
    return promise;
  }

  function run(options) {
    const opts = options || {};
    const source = opts.source;
    const target = opts.target;
    const THREE = global.THREE;
    if (active) disposeState(active);
    if (!source || !target || !source.getBoundingClientRect || !target.getBoundingClientRect) {
      return Promise.resolve({ completed: false, reason: 'invalid-surface' });
    }
    if (!THREE || typeof THREE.WebGLRenderer !== 'function') {
      safeCall(opts.onPhase, 'complete', 1);
      return Promise.resolve({ completed: true, reason: 'three-unavailable' });
    }
    const reduced = false;
    if (opts.disabled === true || opts.animate === false || opts.enabled === false) {
      safeCall(opts.onPhase, 'complete', 1);
      return Promise.resolve({ completed: true, reducedMotion: Boolean(reduced), disabled: opts.disabled === true || opts.animate === false || opts.enabled === false });
    }

    // Take both snapshots before mutating visibility.  The caller is expected
    // to lay out both modes at the same time for reliable bounds.
    const sourceSnapshot = snapshotSurface(source);
    const targetSnapshot = snapshotSurface(target);
    const width = global.innerWidth || document.documentElement.clientWidth || 1;
    const height = global.innerHeight || document.documentElement.clientHeight || 1;
    const canvas = document.createElement('canvas');
    canvas.className = 'playback-card-transition-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.phase = 'shatter';
    canvas.dataset.style = ['bottom-up', 'center-out', 'scatter'].includes(opts.style) ? opts.style : 'bottom-up';
    canvas.dataset.transitionPhase = 'shatter';
    canvas.dataset.transitionStyle = canvas.dataset.style;
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none;display:block;';
    (document.body || document.documentElement).appendChild(canvas);
    const renderContext = createRenderer(canvas, width, height, THREE);
    if (!renderContext) {
      return runCanvasFallback(opts, source, target, sourceSnapshot, targetSnapshot, canvas);
    }
    const sourceStyle = hideSurface(source);
    const targetStyle = hideSurface(target);
    const set = makeParticleSet(sourceSnapshot, targetSnapshot, canvas.dataset.style);
    const texture = new THREE.CanvasTexture(particleTexture());
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(set.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const colorAttr = new THREE.BufferAttribute(set.colors, 3).setUsage(THREE.DynamicDrawUsage);
    const opacityAttr = new THREE.BufferAttribute(set.opacity, 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('aColor', colorAttr);
    geometry.setAttribute('aOpacity', opacityAttr);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        // Keep the breakup granular: each source cell becomes a small,
        // luminous point rather than a chunky square.
        uSize: { value: set.cell * clamp(global.devicePixelRatio || 1, 1, 2) * 0.88 },
      },
      vertexShader: 'attribute vec3 aColor; attribute float aOpacity; varying vec3 vColor; varying float vOpacity; uniform float uSize; void main(){vColor=aColor;vOpacity=aOpacity;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;gl_PointSize=uSize;}',
      fragmentShader: 'uniform sampler2D uMap; varying vec3 vColor; varying float vOpacity; void main(){vec4 tex=texture2D(uMap,gl_PointCoord);float alpha=tex.a*vOpacity;if(alpha<0.012)discard;gl_FragColor=vec4(vColor,alpha);}',
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const points = new THREE.Points(geometry, material);
    const scene = new THREE.Scene();
    scene.add(points);
    const shatterMs = canvas.dataset.style === 'center-out' ? 1100 : 980;
    const assembleMs = clamp(Number(opts.assembleMs) || DEFAULT_ASSEMBLE_MS, 1400, 4000);
    const state = {
      canvas, renderer: renderContext.renderer, camera: renderContext.camera, scene, geometry, material, texture,
      source, target, sourceStyle, targetStyle, resolve: null, raf: 0, result: null,
      resizeHandler: null, set, startedAt: performance.now(), shatterMs, assembleMs,
      onPhase: opts.onPhase,
    };
    active = state;
    state.resizeHandler = () => {
      const nextWidth = global.innerWidth || document.documentElement.clientWidth || 1;
      const nextHeight = global.innerHeight || document.documentElement.clientHeight || 1;
      state.renderer.setSize(nextWidth, nextHeight, false);
      state.camera.left = -nextWidth / 2; state.camera.right = nextWidth / 2;
      state.camera.top = nextHeight / 2; state.camera.bottom = -nextHeight / 2;
      state.camera.updateProjectionMatrix();
    };
    global.addEventListener('resize', state.resizeHandler, { passive: true });

    const promise = new Promise((resolve) => { state.resolve = resolve; });
    function frame(now) {
      if (active !== state) return;
      const elapsed = now - state.startedAt;
      let phase = 'shatter';
      let phaseProgress = clamp(elapsed / shatterMs, 0, 1);
      const current = set.positions;
      const currentColor = set.colors;
      const currentOpacity = set.opacity;
      if (elapsed >= shatterMs && elapsed < shatterMs + assembleMs) {
        phase = 'assemble';
        phaseProgress = clamp((elapsed - shatterMs) / assembleMs, 0, 1);
      } else if (elapsed >= shatterMs + assembleMs) {
        phase = 'complete';
        phaseProgress = 1;
      }
      canvas.dataset.phase = phase;
      canvas.dataset.transitionPhase = phase;
      safeCall(state.onPhase, phase, phaseProgress);
      if (active !== state) return;
      for (let i = 0; i < set.count; i += 1) {
        const p = i * 3;
        const delayed = clamp((elapsed / shatterMs - set.delays[i]) * (1.35 + set.speeds[i] * .2), 0, 1);
        let x; let y; let z;
        if (elapsed < shatterMs) {
          const outward = easeOutCubic(delayed);
          x = set.from[p] + (set.scatter[p] - set.from[p]) * outward;
          y = set.from[p + 1] + (set.scatter[p + 1] - set.from[p + 1]) * outward;
          z = set.from[p + 2] + (set.scatter[p + 2] - set.from[p + 2]) * outward;
        } else {
          const assembleProgress = clamp((elapsed - shatterMs) / assembleMs, 0, 1);
          // Spend the first half of the slow assembly streaming into the
          // target card's center, then resolve the same particles across the
          // card artwork. This makes the destination unmistakable without
          // losing the cover-shaped final image.
          const gather = easeInOutSlow(Math.min(1, assembleProgress * 2));
          const spread = easeInOutSlow(Math.max(0, assembleProgress * 2 - 1));
          const gatherX = set.scatter[p] + (set.toCenter[p] - set.scatter[p]) * gather;
          const gatherY = set.scatter[p + 1] + (set.toCenter[p + 1] - set.scatter[p + 1]) * gather;
          const gatherZ = set.scatter[p + 2] + (set.toCenter[p + 2] - set.scatter[p + 2]) * gather;
          x = gatherX + (set.to[p] - set.toCenter[p]) * spread;
          y = gatherY + (set.to[p + 1] - set.toCenter[p + 1]) * spread;
          z = gatherZ + (set.to[p + 2] - set.toCenter[p + 2]) * spread;
          currentColor[p] = set.colors[p] + (set.targetColors[p] - set.colors[p]) * spread;
          currentColor[p + 1] = set.colors[p + 1] + (set.targetColors[p + 1] - set.colors[p + 1]) * spread;
          currentColor[p + 2] = set.colors[p + 2] + (set.targetColors[p + 2] - set.colors[p + 2]) * spread;
          currentOpacity[i] = set.opacity[i] + (set.targetOpacity[i] - set.opacity[i]) * spread;
        }
        current[p] = x; current[p + 1] = y; current[p + 2] = z;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      opacityAttr.needsUpdate = true;
      state.renderer.render(scene, state.camera);
      if (phase === 'complete') {
        state.result = { completed: true, phase: 'complete' };
        disposeState(state);
        active = null;
        return;
      }
      state.raf = global.requestAnimationFrame(frame);
    }
    state.raf = global.requestAnimationFrame(frame);
    return promise;
  }

  function cancel() {
    if (!active) return false;
    active.result = { completed: false, cancelled: true };
    const state = active;
    active = null;
    disposeState(state);
    safeCall(state.onPhase, 'cancelled', 1);
    return true;
  }

  function destroy() { cancel(); }

  global.FEPlaybackCardTransition = { run, cancel, destroy };
})(typeof window !== 'undefined' ? window : globalThis);
