const BOOT_TARGET_FPS = 60;
const BOOT_FRAME_BUDGET_MS = 1000 / BOOT_TARGET_FPS;
const BOOT_RAF_LEAD_MS = 4;
const BOOT_RENDER_SCALE = 0.76;
const BOOT_REDUCED_RENDER_SCALE = 0.58;
const BOOT_DPR_LIMIT = 1.25;
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|lavapipe|software|microsoft basic render|warp|reference/i;

// Official @react-bits/LiquidChrome-JS-CSS shader, adapted after the shadcn
// registry install for FE Monster's framework-free browser ESM lifecycle. The
// registry uniforms and liquid/ripple/supersampling model remain intact; only
// the React/OGL component shell is replaced so the installed client is offline.

function publishBootGraphicsBackend(gl, canvas) {
  let vendor = '';
  let renderer = '';
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    vendor = String(debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR) || '');
    renderer = String(debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER) || '');
  } catch {
  }
  const query = new URLSearchParams(window.location.search);
  const requested = query.get('render') === 'directx11'
    || query.get('client') === 'embedded'
    || Boolean(window.chrome?.webview);
  const description = `${vendor} ${renderer}`.trim();
  const hardwareD3D11 = /(?:direct3d11|d3d11)/i.test(description)
    && !SOFTWARE_RENDERER_PATTERN.test(description);
  const backend = hardwareD3D11
    ? 'd3d11-hardware'
    : description && requested
      ? 'safe-fallback'
      : description
        ? 'webgl-hardware'
        : 'detecting';
  document.documentElement.dataset.graphicsBackend = backend;
  document.documentElement.dataset.directX11Hardware = String(hardwareD3D11);
  canvas.dataset.renderPreset = requested ? 'directx11' : 'webgl';
  canvas.dataset.graphicsBackend = backend;
  window.dispatchEvent(new CustomEvent('fe-graphics-backend-detected', {
    detail: { requested, backend, hardwareD3D11, vendor, renderer }
  }));
  return { requested, hardwareD3D11, backend, vendor, renderer };
}

const vertexShader100 = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const vertexShader300 = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function liquidChromeFragment(webgl2) {
  const version = webgl2 ? '#version 300 es\n' : '';
  const varying = webgl2 ? 'in vec2 vUv;' : 'varying vec2 vUv;';
  const output = webgl2 ? 'out vec4 liquidChromeColor;' : '';
  const writeColor = webgl2
    ? 'liquidChromeColor = col / float(samples);'
    : 'gl_FragColor = col / float(samples);';
  return `${version}
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec3 uBaseColor;
uniform float uAmplitude;
uniform float uFrequencyX;
uniform float uFrequencyY;
uniform vec2 uMouse;
${varying}
${output}

vec4 renderImage(vec2 uvCoord) {
  vec2 fragCoord = uvCoord * uResolution.xy;
  vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

  for (float i = 1.0; i < 10.0; i++) {
    uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
    uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
  }

  vec2 diff = uvCoord - uMouse;
  float dist = length(diff);
  float falloff = exp(-dist * 20.0);
  float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
  uv += (diff / (dist + 0.0001)) * ripple * falloff;

  vec3 color = uBaseColor / max(abs(sin(uTime - uv.y - uv.x)), 0.018);
  color = color / (color + vec3(0.72));
  return vec4(color, 1.0);
}

void main() {
  vec4 col = vec4(0.0);
  int samples = 0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
      col += renderImage(vUv + offset);
      samples++;
    }
  }
  ${writeColor}
}
`;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate a boot shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'LiquidChrome shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, webgl2) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, webgl2 ? vertexShader300 : vertexShader100);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, liquidChromeFragment(webgl2));
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('Unable to allocate the LiquidChrome program');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'LiquidChrome program link failed';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function mountLiquidChrome(container) {
  const canvas = document.createElement('canvas');
  const contextOptions = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  };
  const gl = canvas.getContext('webgl2', contextOptions)
    || canvas.getContext('webgl', contextOptions);
  if (!gl) throw new Error('WebGL is unavailable for LiquidChrome');

  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const graphicsBackend = publishBootGraphicsBackend(gl, canvas);
  if (graphicsBackend.requested && !graphicsBackend.hardwareD3D11) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    throw new Error('DirectX 11 hardware rendering is unavailable');
  }

  const program = createProgram(gl, webgl2);
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    gl.deleteProgram(program);
    throw new Error('Unable to allocate the LiquidChrome geometry');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    time: gl.getUniformLocation(program, 'uTime'),
    resolution: gl.getUniformLocation(program, 'uResolution'),
    baseColor: gl.getUniformLocation(program, 'uBaseColor'),
    amplitude: gl.getUniformLocation(program, 'uAmplitude'),
    frequencyX: gl.getUniformLocation(program, 'uFrequencyX'),
    frequencyY: gl.getUniformLocation(program, 'uFrequencyY'),
    mouse: gl.getUniformLocation(program, 'uMouse')
  };

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rafRef = { current: null };
  const timerRef = { current: null };
  const frameClockRef = { current: 0 };
  const frameCarryRef = { current: 0 };
  const animationTimeRef = { current: 0 };
  const pointerRef = { current: [0.5, 0.5], target: [0.5, 0.5] };
  let reducedMotion = reducedMotionQuery.matches;
  let disposed = false;
  let ready = false;
  let contextReleased = false;
  let frameCount = 0;
  let resizeObserver = null;
  let width = 0;
  let height = 0;

  canvas.className = 'boot-liquid-chrome-canvas';
  canvas.dataset.bootBackground = 'liquid-chrome';
  canvas.dataset.renderer = webgl2 ? 'webgl2' : 'webgl';
  canvas.setAttribute('aria-hidden', 'true');
  container.dataset.bootBackground = 'liquid-chrome';
  document.documentElement.dataset.bootBackground = 'liquid-chrome';
  document.documentElement.dataset.bootRenderState = reducedMotion ? 'reduced-static' : 'animated';
  container.appendChild(canvas);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0.008, 0.0, 0.02, 1);
  gl.useProgram(program);
  gl.uniform3f(uniforms.baseColor, 0.082, 0.032, 0.128);
  gl.uniform1f(uniforms.amplitude, 0.27);
  gl.uniform1f(uniforms.frequencyX, 3.0);
  gl.uniform1f(uniforms.frequencyY, 3.2);

  const markReady = () => {
    if (ready) return;
    ready = true;
    window.dispatchEvent(new CustomEvent('fe-lightfall-ready'));
  };

  const resize = () => {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, BOOT_DPR_LIMIT);
    const scale = dpr * (reducedMotion ? BOOT_REDUCED_RENDER_SCALE : BOOT_RENDER_SCALE);
    width = Math.max(2, Math.round(rect.width * scale));
    height = Math.max(2, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform3f(uniforms.resolution, width, height, width / Math.max(1, height));
    }
  };

  const render = timestamp => {
    if (disposed || contextReleased) return false;
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    if (!width || !height) resize();
    const current = pointerRef.current;
    const target = pointerRef.target;
    const easing = reducedMotion ? 1 : 0.085;
    current[0] += (target[0] - current[0]) * easing;
    current[1] += (target[1] - current[1]) * easing;
    gl.useProgram(program);
    gl.uniform1f(uniforms.time, reducedMotion ? 0.9 : animationTimeRef.current * 0.001 * 0.18);
    gl.uniform2f(uniforms.mouse, current[0], current[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameCount += 1;
    markReady();
    return true;
  };

  const cancelScheduledFrame = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const scheduleFrame = (delay = BOOT_FRAME_BUDGET_MS) => {
    if (disposed || reducedMotion || document.hidden || timerRef.current !== null || rafRef.current !== null) return;
    const timerDelay = Math.max(0, delay - BOOT_RAF_LEAD_MS);
    if (timerDelay < 1) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!disposed && !reducedMotion && !document.hidden && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(loop);
      }
    }, timerDelay);
  };

  const loop = timestamp => {
    rafRef.current = null;
    if (disposed || reducedMotion || document.hidden) return;
    const elapsed = frameClockRef.current
      ? Math.min(100, Math.max(0, timestamp - frameClockRef.current))
      : BOOT_FRAME_BUDGET_MS;
    frameClockRef.current = timestamp;
    animationTimeRef.current += elapsed;
    frameCarryRef.current = Math.min(BOOT_FRAME_BUDGET_MS * 2, frameCarryRef.current + elapsed);
    if (frameCarryRef.current + 0.25 < BOOT_FRAME_BUDGET_MS) {
      scheduleFrame(BOOT_FRAME_BUDGET_MS - frameCarryRef.current);
      return;
    }
    frameCarryRef.current %= BOOT_FRAME_BUDGET_MS;
    render(timestamp);
    scheduleFrame();
  };

  const onPointerMove = event => {
    if (reducedMotion || disposed) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerRef.target[0] = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    pointerRef.target[1] = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  };

  const onVisibilityChange = () => {
    cancelScheduledFrame();
    frameClockRef.current = 0;
    frameCarryRef.current = 0;
    if (!document.hidden && !reducedMotion) scheduleFrame(0);
  };

  const onReducedMotionChange = event => {
    reducedMotion = event.matches;
    cancelScheduledFrame();
    frameClockRef.current = 0;
    frameCarryRef.current = 0;
    resize();
    if (reducedMotion) {
      animationTimeRef.current = 0;
      document.documentElement.dataset.bootRenderState = 'reduced-static';
      render(0);
    } else {
      document.documentElement.dataset.bootRenderState = 'animated';
      scheduleFrame(0);
    }
  };

  const release = () => {
    if (contextReleased) return;
    contextReleased = true;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    gl.deleteBuffer(positionBuffer);
    gl.deleteProgram(program);
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
    }
  };

  const stop = () => {
    if (disposed) return;
    disposed = true;
    cancelScheduledFrame();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pointermove', onPointerMove);
    reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange);
    resizeObserver?.disconnect();
    if (canvas.parentElement === container) container.removeChild(canvas);
    canvas.width = 1;
    canvas.height = 1;
    release();
    document.documentElement.dataset.bootRenderState = 'stopped';
  };

  const status = () => ({
    ready,
    running: !disposed && !reducedMotion && !document.hidden,
    reducedMotion,
    frameCount,
    width,
    height,
    contextReleased,
    renderer: webgl2 ? 'webgl2' : 'webgl',
    backend: graphicsBackend.backend,
    background: 'liquid-chrome'
  });

  resizeObserver = new ResizeObserver(() => {
    resize();
    if (reducedMotion) render(0);
  });
  resizeObserver.observe(container);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);
  resize();
  render(0);
  if (!reducedMotion) scheduleFrame(0);

  return Object.freeze({ stop, status, renderOnce: render });
}

const mount = document.getElementById('bootLightfallMount');
let controller = null;

const bootApi = {
  stop() {
    controller?.stop();
  },
  status() {
    return controller?.status() || {
      ready: false,
      running: false,
      reducedMotion: false,
      frameCount: 0,
      contextReleased: true,
      renderer: 'none',
      backend: 'unavailable',
      background: 'liquid-chrome'
    };
  },
  renderOnce(timestamp = performance.now()) {
    return controller?.renderOnce(timestamp) || false;
  }
};
window.FeMonsterBootLiquidChrome = Object.freeze(bootApi);

if (mount) {
  try {
    controller = mountLiquidChrome(mount);
  } catch (error) {
    mount.dataset.bootBackground = 'css-fallback';
    mount.dataset.bootRenderError = String(error?.message || error || 'LiquidChrome initialization failed').slice(0, 240);
    document.documentElement.dataset.bootBackground = 'css-fallback';
    document.documentElement.dataset.bootRenderState = 'fallback';
    window.dispatchEvent(new CustomEvent('fe-lightfall-ready'));
  }
  window.addEventListener('fe-lightfall-stop', () => bootApi.stop(), { once: true });
} else {
  window.dispatchEvent(new CustomEvent('fe-lightfall-ready'));
}
