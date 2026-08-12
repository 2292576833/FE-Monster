import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, 'web');
const artifactRoot = path.join(projectRoot, 'artifacts');
const profile = path.join(artifactRoot, `.tmp-pet-live-glow-${process.pid}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(artifactRoot, { recursive: true });

const sharedMarkup = `
<section class="pet-assistant" id="petAssistant" data-state="idle" data-live-conversation="inactive">
  <section class="pet-assistant__panel pet-assistant__text-bubble" id="petAssistantPanel" data-pet-text-bubble>
    <div class="pet-assistant__messages" id="petAssistantMessages"></div>
  </section>
  <div class="pet-assistant__dock" id="petAssistantDock">
    <span class="pet-assistant__speech" id="petAssistantSpeech">test bubble</span>
    <button class="pet-assistant__character" id="petAssistantCharacter" type="button">
      <canvas class="pet-assistant__particle-orb" id="petAssistantParticleOrb"></canvas>
      <span class="pet-assistant__aura" aria-hidden="true"></span>
    </button>
  </div>
  <audio id="petAssistantAudio"></audio>
</section>`;

const fixtureStyle = `
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #080a10; }
#petAssistant {
  display: block !important;
  position: relative !important;
  inset: auto !important;
  width: 420px !important;
  height: 420px !important;
  transform: none !important;
}
#petAssistantDock {
  position: absolute !important;
  left: 60px !important;
  top: 60px !important;
  width: 300px !important;
  height: 300px !important;
}
#petAssistantCharacter {
  position: relative !important;
  width: 300px !important;
  height: 300px !important;
  transform: none !important;
}
#petAssistantParticleOrb { position: absolute !important; inset: 0 !important; }
`;

const metricHelpers = `
window.__petDrawTimes = [];
for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
  if (!Context?.prototype?.drawArrays || Context.prototype.drawArrays.__petMeasured) continue;
  const originalDrawArrays = Context.prototype.drawArrays;
  const measuredDrawArrays = function measuredPetDrawArrays(...args) {
    window.__petDrawTimes.push(performance.now());
    return originalDrawArrays.apply(this, args);
  };
  measuredDrawArrays.__petMeasured = true;
  Context.prototype.drawArrays = measuredDrawArrays;
}
window.__petEmotion = { mood: 3, energy: 3 };
window.__petProgramAudio = { playing: false, energy: 0, bass: 0, mid: 0, treble: 0, beat: 0 };
window.FeMonsterPetEmotionRuntime = { snapshot: () => ({ ...window.__petEmotion }) };
window.FeMonsterPetActionBridge = { snapshot: () => ({ ...window.__petProgramAudio }) };
window.__setPetEmotion = (mood, energy = 3) => {
  window.__petEmotion = { mood, energy };
  window.dispatchEvent(new CustomEvent('fe-monster-pet-emotion-change', {
    detail: { snapshot: { mood, energy } }
  }));
};
window.__renderPetFrames = (count, start = performance.now()) => {
  const api = window.FeMonsterPetParticleOrb;
  api.stop();
  for (let frame = 0; frame < count; frame += 1) api.renderOnce(start + frame * (1000 / 60));
};
window.__measurePetScheduler = async (state, duration = 1500) => {
  const root = document.getElementById('petAssistant');
  root.hidden = false;
  root.dataset.state = state === 'live' ? 'listening' : 'idle';
  root.dataset.liveConversation = state === 'live' ? 'active' : 'inactive';
  window.FeMonsterPetParticleOrb.stop();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__petDrawTimes.length = 0;
  window.FeMonsterPetParticleOrb.start();
  await new Promise((resolve) => setTimeout(resolve, duration));
  window.FeMonsterPetParticleOrb.stop();
  const times = [...window.__petDrawTimes];
  const intervals = times.slice(1).map((value, index) => value - times[index]);
  const sorted = [...intervals].sort((left, right) => left - right);
  const percentile = (ratio) => sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
    : 0;
  const median = percentile(0.5);
  const deviations = intervals.map((value) => Math.abs(value - median)).sort((left, right) => left - right);
  const deviationP95 = deviations.length
    ? deviations[Math.min(deviations.length - 1, Math.floor((deviations.length - 1) * 0.95))]
    : 0;
  return {
    frames: times.length,
    duration: times.length > 1 ? times.at(-1) - times[0] : 0,
    fps: times.length > 1 ? (times.length - 1) * 1000 / (times.at(-1) - times[0]) : 0,
    medianInterval: median,
    p95Interval: percentile(0.95),
    jitterP95: deviationP95,
    filter: getComputedStyle(document.getElementById('petAssistantParticleOrb')).filter
  };
};
window.__petPixelMetrics = () => {
  const canvas = document.getElementById('petAssistantParticleOrb');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return null;
  window.FeMonsterPetParticleOrb.renderOnce(performance.now());
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let visible = 0;
  let strong = 0;
  let edgePixels = 0;
  let alphaSum = 0;
  let weightedRed = 0;
  let weightedGreen = 0;
  let weightedBlue = 0;
  let totalLuminance = 0;
  let softHalo = 0;
  let opaqueBlack = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const luminances = [];
  const premultipliedLuminance = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3];
      if (alpha <= 4) continue;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const weight = alpha / 255;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      premultipliedLuminance[y * width + x] = luminance * weight;
      visible += 1;
      if (alpha > 20) strong += 1;
      else softHalo += 1;
      if (alpha > 20 && Math.max(red, green, blue) < 8) opaqueBlack += 1;
      alphaSum += weight;
      weightedRed += red * weight;
      weightedGreen += green * weight;
      weightedBlue += blue * weight;
      totalLuminance += luminance * weight;
      luminances.push(luminance);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) edgePixels += 1;
    }
  }
  let edgeGradientSum = 0;
  let edgeGradientCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = premultipliedLuminance[index];
      if (x + 1 < width) {
        const next = premultipliedLuminance[index + 1];
        if (current > 0 || next > 0) {
          edgeGradientSum += Math.abs(current - next);
          edgeGradientCount += 1;
        }
      }
      if (y + 1 < height) {
        const next = premultipliedLuminance[index + width];
        if (current > 0 || next > 0) {
          edgeGradientSum += Math.abs(current - next);
          edgeGradientCount += 1;
        }
      }
    }
  }
  luminances.sort((left, right) => left - right);
  const percentile = (ratio) => luminances.length
    ? luminances[Math.min(luminances.length - 1, Math.floor((luminances.length - 1) * ratio))]
    : 0;
  const averageRgb = alphaSum > 0
    ? [weightedRed / alphaSum, weightedGreen / alphaSum, weightedBlue / alphaSum]
    : [0, 0, 0];
  const maximum = Math.max(...averageRgb);
  const minimum = Math.min(...averageRgb);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0.0001) {
    if (maximum === averageRgb[0]) hue = 60 * (((averageRgb[1] - averageRgb[2]) / delta) % 6);
    else if (maximum === averageRgb[1]) hue = 60 * (((averageRgb[2] - averageRgb[0]) / delta) + 2);
    else hue = 60 * (((averageRgb[0] - averageRgb[1]) / delta) + 4);
    if (hue < 0) hue += 360;
  }
  const bboxArea = maxX >= minX && maxY >= minY ? (maxX - minX + 1) * (maxY - minY + 1) : 0;
  const peaks = [];
  for (let y = 4; y < height - 4; y += 1) {
    for (let x = 4; x < width - 4; x += 1) {
      const value = premultipliedLuminance[y * width + x];
      if (value < 170) continue;
      let localMaximum = true;
      for (let oy = -1; oy <= 1 && localMaximum; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if ((ox || oy) && premultipliedLuminance[(y + oy) * width + x + ox] > value) {
            localMaximum = false;
            break;
          }
        }
      }
      if (localMaximum) peaks.push({ x, y, value });
    }
  }
  peaks.sort((left, right) => right.value - left.value);
  const selectedPeaks = [];
  for (const peak of peaks) {
    if (selectedPeaks.some((selected) => (selected.x - peak.x) ** 2 + (selected.y - peak.y) ** 2 < 16)) continue;
    selectedPeaks.push(peak);
    if (selectedPeaks.length >= 160) break;
  }
  const radialSums = [0, 0, 0, 0];
  const radialCounts = [0, 0, 0, 0];
  for (const peak of selectedPeaks) {
    for (let oy = -4; oy <= 4; oy += 1) {
      for (let ox = -4; ox <= 4; ox += 1) {
        const radius = Math.sqrt(ox * ox + oy * oy);
        const ring = radius < 0.5 ? 0 : radius < 1.5 ? 1 : radius < 2.5 ? 2 : radius < 3.5 ? 3 : -1;
        if (ring < 0) continue;
        radialSums[ring] += premultipliedLuminance[(peak.y + oy) * width + peak.x + ox];
        radialCounts[ring] += 1;
      }
    }
  }
  const radialProfile = radialSums.map((sum, index) => radialCounts[index] ? sum / radialCounts[index] : 0);
  const radialSteps = radialProfile.slice(1).map((value, index) => value - radialProfile[index]);
  const radialRoughness = radialProfile[0] > 0
    ? radialSteps.slice(1).reduce((sum, value, index) => sum + Math.abs(value - radialSteps[index]), 0)
      / ((radialSteps.length - 1) * radialProfile[0])
    : 0;

  // Sample every pearl in CSS-space rather than framebuffer pixels. This
  // keeps the micro-surface measurement comparable at 100/125/150/200%
  // Windows scaling and makes axis-aligned point-sprite stair steps visible.
  const sampleBilinear = (x, y) => {
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, x - x0));
    const ty = Math.max(0, Math.min(1, y - y0));
    const top = premultipliedLuminance[y0 * width + x0] * (1 - tx)
      + premultipliedLuminance[y0 * width + x1] * tx;
    const bottom = premultipliedLuminance[y1 * width + x0] * (1 - tx)
      + premultipliedLuminance[y1 * width + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
  const rendererDpr = Math.max(1, Number(window.FeMonsterPetParticleOrb.status().dpr) || 1);
  const normalizedRadii = [0, 0.55, 1.10, 1.65];
  const normalizedRadialSums = normalizedRadii.map(() => 0);
  const normalizedRadialCounts = normalizedRadii.map(() => 0);
  let normalizedAngularVariation = 0;
  let normalizedAngularSamples = 0;
  for (const peak of selectedPeaks) {
    const centerValue = Math.max(1, sampleBilinear(peak.x, peak.y));
    for (let ring = 0; ring < normalizedRadii.length; ring += 1) {
      const radius = normalizedRadii[ring] * rendererDpr;
      const ringValues = [];
      const angularSamples = ring === 0 ? 1 : 16;
      for (let angleIndex = 0; angleIndex < angularSamples; angleIndex += 1) {
        const angle = angleIndex / angularSamples * Math.PI * 2;
        const value = sampleBilinear(
          peak.x + Math.cos(angle) * radius,
          peak.y + Math.sin(angle) * radius
        );
        ringValues.push(value);
        normalizedRadialSums[ring] += value;
        normalizedRadialCounts[ring] += 1;
      }
      if (ringValues.length > 1) {
        for (let index = 0; index < ringValues.length; index += 1) {
          normalizedAngularVariation += Math.abs(
            ringValues[index] - ringValues[(index + 1) % ringValues.length]
          ) / centerValue;
          normalizedAngularSamples += 1;
        }
      }
    }
  }
  const normalizedRadialProfile = normalizedRadialSums.map((sum, index) => (
    normalizedRadialCounts[index] ? sum / normalizedRadialCounts[index] : 0
  ));
  const normalizedRadialSteps = normalizedRadialProfile.slice(1)
    .map((value, index) => value - normalizedRadialProfile[index]);
  const normalizedRadialRoughness = normalizedRadialProfile[0] > 0
    ? normalizedRadialSteps.slice(1).reduce((sum, value, index) => (
      sum + Math.abs(value - normalizedRadialSteps[index])
    ), 0) / ((normalizedRadialSteps.length - 1) * normalizedRadialProfile[0])
    : 0;
  const normalizedAngularRoughness = normalizedAngularSamples
    ? normalizedAngularVariation / normalizedAngularSamples
    : 0;
  const cssPixelScale = rendererDpr * rendererDpr;
  return {
    width,
    height,
    visible,
    strong,
    edgePixels,
    alphaSum,
    totalLuminance,
    cssVisible: visible / cssPixelScale,
    cssStrong: strong / cssPixelScale,
    cssSoftHalo: softHalo / cssPixelScale,
    cssTotalLuminance: totalLuminance / cssPixelScale,
    cssEdgeGradient: (edgeGradientCount ? edgeGradientSum / edgeGradientCount : 0) * rendererDpr,
    softHalo,
    opaqueBlack,
    edgeGradient: edgeGradientCount ? edgeGradientSum / edgeGradientCount : 0,
    averageRgb,
    hue,
    saturation: maximum > 0 ? delta / maximum : 0,
    p90Luminance: percentile(0.90),
    p95Luminance: percentile(0.95),
    p99Luminance: percentile(0.99),
    bboxArea,
    bboxFill: bboxArea ? strong / bboxArea : 0,
    canvasFill: strong / (width * height),
    sampledPeaks: selectedPeaks.length,
    radialProfile,
    radialRoughness,
    normalizedRadialProfile,
    normalizedRadialRoughness,
    normalizedAngularRoughness,
    status: window.FeMonsterPetParticleOrb.status(),
    display: {
      panel: getComputedStyle(document.getElementById('petAssistantPanel')).display,
      speech: getComputedStyle(document.getElementById('petAssistantSpeech')).display,
      orbAnimation: getComputedStyle(canvas).animationName,
      orbFilter: getComputedStyle(canvas).filter
    }
  };
};
`;

const webGlFixture = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/pet-assistant.css"><style>${fixtureStyle}</style></head><body>
${sharedMarkup}<script>${metricHelpers}</script>
<script src="/vendor/three.r128.min.js"></script><script src="/pet-particle-orb.js"></script>
</body></html>`;

const fallbackFixture = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/pet-assistant.css"><style>${fixtureStyle}</style></head><body>
${sharedMarkup}<script>
window.__petEmotion = { mood: 3, energy: 3 };
window.FeMonsterPetEmotionRuntime = { snapshot: () => ({ ...window.__petEmotion }) };
window.FeMonsterPetActionBridge = { snapshot: () => ({ playing: false }) };
window.__petCanvasCalls = { arc: 0, drawImage: 0, beginPath: 0, fill: 0 };
for (const name of Object.keys(window.__petCanvasCalls)) {
  const original = CanvasRenderingContext2D.prototype[name];
  if (typeof original !== 'function') continue;
  CanvasRenderingContext2D.prototype[name] = function countedPetCanvasCall(...args) {
    window.__petCanvasCalls[name] += 1;
    return original.apply(this, args);
  };
}
</script><script src="/pet-particle-orb.js"></script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/' || url.pathname === '/fallback') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(url.pathname === '/fallback' ? fallbackFixture : webGlFixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;

const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();

async function debugPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) {
      try {
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch (error) {
        if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) throw error;
      }
    }
    await delay(60);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(60);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'browser evaluation failed');
  }
  return result.result?.value;
}

async function navigate(route = '/') {
  await command('Page.navigate', { url: `http://127.0.0.1:${port}${route}` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(window.FeMonsterPetParticleOrb?.status?.().ready)`)) return;
    await delay(50);
  }
  throw new Error(`particle runtime did not become ready at ${route}`);
}

const distance = (left, right) => Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
const hueDistance = (left, right) => Math.min(Math.abs(left - right), 360 - Math.abs(left - right));

function assertParticleGaps(label, sample) {
  assert.equal(sample.edgePixels, 0, `${label}: visible alpha reached the two-pixel canvas edge`);
  assert.ok(sample.opaqueBlack <= sample.strong * 0.04,
    `${label}: dark contour pixels spread into a black backing surface (${sample.opaqueBlack}/${sample.strong})`);
  assert.ok(sample.bboxFill > 0.04 && sample.bboxFill < 0.72,
    `${label}: particles collapsed or became a solid ball (bbox fill ${sample.bboxFill})`);
  assert.ok(sample.canvasFill < 0.42,
    `${label}: active pixels cover too much of the transparent canvas (${sample.canvasFill})`);
  assert.ok(sample.p95Luminance >= 180,
    `${label}: pearl-white cores became too dim (${sample.p95Luminance})`);
  assert.ok(sample.p99Luminance >= 215,
    `${label}: particle highlights lost their crisp white peak (${sample.p99Luminance})`);
  assert.ok(sample.edgeGradient >= 1.2,
    `${label}: particle contours became too soft (${sample.edgeGradient})`);
}

function cssContrast(filter) {
  const match = String(filter || '').match(/contrast\((\d+(?:\.\d+)?)\)/);
  return match ? Number(match[1]) : 1;
}

function assertPearlRadialProfile(label, sample, maximumRoughness) {
  assert.ok(sample.sampledPeaks >= 100,
    `${label}: too few individual pearl centers could be sampled (${sample.sampledPeaks})`);
  assert.ok(sample.radialProfile[1] >= sample.radialProfile[0] * 0.32,
    `${label}: center-to-body luminance falls too abruptly (${JSON.stringify(sample.radialProfile)})`);
  assert.ok(sample.radialRoughness <= maximumRoughness,
    `${label}: radial pearl layers are too hard/grainy (${sample.radialRoughness} > ${maximumRoughness})`);
  assert.ok(sample.edgeGradient <= 74,
    `${label}: pixel contour is over-sharpened (${sample.edgeGradient})`);
  assert.ok(cssContrast(sample.display.orbFilter) <= 1.10,
    `${label}: CSS contrast is re-sharpening the shader (${sample.display.orbFilter})`);
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width: 520, height: 460, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate('/');
  await delay(180);
  await evaluate(`window.FeMonsterPetParticleOrb.stop()`);

  const initialStatus = await evaluate(`window.FeMonsterPetParticleOrb.status()`);
  assert.equal(initialStatus.mode, 'webgl', 'live glow QA must run through real Edge WebGL, never silent 2D fallback');
  assert.equal(initialStatus.particleCount, 8192);
  assert.equal(initialStatus.drawCalls, 1, 'WebGL particle field must stay one GPU draw call');

  const dpiSamples = [];
  for (const deviceScaleFactor of [1, 1.25, 1.5, 2]) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: 520, height: 460, deviceScaleFactor, mobile: false
    });
    await evaluate(`window.FeMonsterPetParticleOrb.resize(); window.__renderPetFrames(90)`);
    const sample = await evaluate(`window.__petPixelMetrics()`);
    dpiSamples.push({ deviceScaleFactor, ...sample });
  }
  const microSurfaceCapture = await command('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false
  });
  const microSurfaceLabel = String(process.env.PET_PARTICLE_ARTIFACT_LABEL || 'current')
    .replace(/[^a-z0-9_-]+/gi, '-');
  writeFileSync(
    path.join(artifactRoot, `pet-particle-microsurface-${microSurfaceLabel}.png`),
    Buffer.from(microSurfaceCapture.data, 'base64')
  );
  for (const sample of dpiSamples) {
    assert.equal(sample.status.drawCalls, 1,
      `DPR ${sample.deviceScaleFactor}: micro-surface added another GPU draw call`);
    // The 8192-point source surface is intentionally much denser than the
    // retired 1344-pearl orb. Its reference close-up mask fills ~0.64-0.73 of
    // the bounding box while the gaps and transparent cavity remain visible.
    assert.ok(sample.bboxFill > 0.40 && sample.bboxFill < 0.75,
      `DPR ${sample.deviceScaleFactor}: transparent particle gaps or silhouette were lost (${sample.bboxFill})`);
    // In the 8192-point transparent surface, front/back pearls intentionally
    // overlap within the old 4px radial probe. Keep a strict analytic angular
    // edge gate below, but allow the measured lattice overlap seen in source.
    assert.ok(sample.normalizedRadialRoughness <= 0.15,
      `DPR ${sample.deviceScaleFactor}: normalized dense-surface pearl layers remain blocky (${sample.normalizedRadialRoughness})`);
    assert.ok(sample.normalizedAngularRoughness <= 0.075,
      `DPR ${sample.deviceScaleFactor}: point-sprite edge remains pixel-axis biased (${sample.normalizedAngularRoughness})`);
  }
  assert.ok(dpiSamples[0].status.dpr >= 1.5 && dpiSamples[1].status.dpr >= 1.5,
    `100/125% Windows scaling needs a bounded supersample floor: ${dpiSamples.map((sample) => sample.status.dpr)}`);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 520, height: 460, deviceScaleFactor: 1, mobile: false
  });
  await evaluate(`window.FeMonsterPetParticleOrb.resize(); window.__renderPetFrames(90)`);

  const idleScheduler = await evaluate(`window.__measurePetScheduler('idle')`);
  const liveScheduler = await evaluate(`window.__measurePetScheduler('live')`);
  const hiddenScheduler = await evaluate(`(async () => {
    const root = document.getElementById('petAssistant');
    root.dataset.state = 'idle';
    root.dataset.liveConversation = 'inactive';
    root.hidden = false;
    window.FeMonsterPetParticleOrb.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    root.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 60));
    const before = window.__petDrawTimes.length;
    await new Promise((resolve) => setTimeout(resolve, 280));
    const after = window.__petDrawTimes.length;
    const running = window.FeMonsterPetParticleOrb.status().running;
    root.hidden = false;
    return { before, after, running };
  })()`);
  await evaluate(`window.FeMonsterPetParticleOrb.stop()`);
  for (const [label, sample] of [['idle', idleScheduler], ['realtime', liveScheduler]]) {
    assert.ok(sample.fps >= 52 && sample.fps <= 72,
      `${label} scheduler must stay display-paced near 60 FPS (${sample.fps})`);
    assert.ok(sample.p95Interval <= 22,
      `${label} scheduler P95 frame interval is too high (${sample.p95Interval}ms)`);
    assert.ok(sample.jitterP95 <= 4,
      `${label} scheduler P95 jitter is too high (${sample.jitterP95}ms)`);
    assert.ok(cssContrast(sample.filter) <= 1.10,
      `${label} stable CSS filter is re-sharpening the pearl surface (${sample.filter})`);
  }
  assert.equal(hiddenScheduler.after, hiddenScheduler.before,
    'hidden particle orb continued issuing GPU draws');
  assert.equal(hiddenScheduler.running, false,
    'hidden particle orb left its animation scheduler running');

  await evaluate(`window.__setPetEmotion(1, 3); window.__renderPetFrames(220)`);
  const idleLow = await evaluate(`window.__petPixelMetrics()`);
  assertParticleGaps('idle mood 1', idleLow);
  assertPearlRadialProfile('idle mood 1', idleLow, 0.27);
  assert.ok(idleLow.cssVisible >= 5500,
    `inactive pearls lost too much readable CSS-space surface (${idleLow.cssVisible} < 5500)`);
  assert.ok(idleLow.cssTotalLuminance >= 425000,
    `inactive ambient emission did not improve on the old idle baseline (${idleLow.cssTotalLuminance})`);
  // The source-matched surface has 8192 much smaller points instead of 1344.
  // Its total light is therefore a dense translucent fabric metric, while the
  // per-pearl halo/edge gates below keep that fabric from becoming a solid fog.
  assert.ok(idleLow.cssTotalLuminance >= 1450000 && idleLow.cssTotalLuminance <= 2050000,
    `inactive video-reference surface is outside its restrained CSS-space luminance band (${idleLow.cssTotalLuminance})`);
  assert.ok(idleLow.cssSoftHalo >= idleLow.cssStrong * 0.015,
    `inactive particles do not have a measurable soft outer aura (${idleLow.cssSoftHalo}/${idleLow.cssStrong})`);
  assert.ok(idleLow.cssSoftHalo <= idleLow.cssStrong * 0.12,
    `inactive per-particle halos overlap too heavily (${idleLow.cssSoftHalo}/${idleLow.cssStrong})`);
  assert.ok(
    idleLow.cssSoftHalo >= idleLow.status.particleCount * 0.03
      && idleLow.cssSoftHalo <= idleLow.status.particleCount * 0.20,
    `inactive soft halo is outside the per-pearl finite clarity band (${idleLow.cssSoftHalo}/${idleLow.status.particleCount})`
  );
  assert.ok(idleLow.cssEdgeGradient >= 42,
    `inactive pearl contours became indistinct in CSS space (${idleLow.cssEdgeGradient})`);

  await evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    root.dataset.state = 'listening';
    root.dataset.liveConversation = 'active';
  })()`);
  await delay(0);
  await evaluate(`window.__renderPetFrames(100)`);
  const liveLow = await evaluate(`window.__petPixelMetrics()`);
  assertParticleGaps('live mood 1', liveLow);
  assertPearlRadialProfile('live mood 1', liveLow, 0.34);
  assert.equal(liveLow.status.live, true);
  assert.equal(liveLow.display.panel, 'none', 'realtime conversation must not display the text bubble');
  assert.equal(liveLow.display.speech, 'none', 'realtime conversation must not display the proactive bubble');
  assert.ok(liveLow.totalLuminance >= idleLow.totalLuminance * 1.15,
    `live glow is not visibly brighter: idle=${idleLow.totalLuminance}, live=${liveLow.totalLuminance}`);
  assert.ok(liveLow.cssTotalLuminance >= 2000000 && liveLow.cssTotalLuminance <= 2600000,
    `realtime video-reference surface is outside its restrained CSS-space luminance band (${liveLow.cssTotalLuminance})`);
  assert.ok(liveLow.visible >= idleLow.visible * 1.03,
    `live glow does not expand the visible emissive area: idle=${idleLow.visible}, live=${liveLow.visible}`);
  assert.ok(idleLow.totalLuminance <= liveLow.totalLuminance * 0.87,
    `inactive aura is too close to realtime intensity: idle=${idleLow.totalLuminance}, live=${liveLow.totalLuminance}`);
  assert.ok(liveLow.cssSoftHalo <= liveLow.cssStrong * 0.14,
    `realtime per-particle halos overlap too heavily (${liveLow.cssSoftHalo}/${liveLow.cssStrong})`);
  assert.ok(liveLow.cssSoftHalo <= liveLow.status.particleCount * 0.42,
    `realtime pearls still spill too much low-alpha light into their gaps (${liveLow.cssSoftHalo})`);
  assert.ok(liveLow.cssEdgeGradient >= 42,
    `realtime pearl contours became indistinct in CSS space (${liveLow.cssEdgeGradient})`);

  await evaluate(`window.__setPetEmotion(3, 3); window.__renderPetFrames(240)`);
  const liveNeutral = await evaluate(`window.__petPixelMetrics()`);
  assertParticleGaps('live mood 3', liveNeutral);

  await evaluate(`window.__setPetEmotion(1, 3); window.__renderPetFrames(240)`);
  const transitionStart = await evaluate(`window.FeMonsterPetParticleOrb.status().emotionColor`);
  await evaluate(`window.__setPetEmotion(5, 3)`);
  const transition = await evaluate(`(() => {
    const result = [];
    const start = performance.now();
    for (let frame = 0; frame < 60; frame += 1) {
      window.FeMonsterPetParticleOrb.renderOnce(start + frame * (1000 / 60));
      result.push([...window.FeMonsterPetParticleOrb.status().emotionColor]);
    }
    return result;
  })()`);
  const transitionTarget = await evaluate(`window.FeMonsterPetParticleOrb.status().targetEmotionColor`);
  const fullEmotionDistance = distance(transitionStart, transitionTarget);
  const transitionSteps = transition.map((color, index) => distance(index ? transition[index - 1] : transitionStart, color));
  assert.ok(fullEmotionDistance > 0.25, 'mood endpoints are not chromatically distinct');
  assert.ok(Math.max(...transitionSteps) <= fullEmotionDistance * 0.05,
    `emotion tint jumps by one frame: max=${Math.max(...transitionSteps)}, full=${fullEmotionDistance}`);
  assert.ok(new Set(transition.map((color) => color.map((value) => value.toFixed(4)).join(','))).size >= 20,
    'emotion tint must interpolate over many frames instead of snapping');

  await evaluate(`window.__renderPetFrames(220)`);
  const liveHigh = await evaluate(`window.__petPixelMetrics()`);
  assertParticleGaps('live mood 5', liveHigh);
  for (const sample of [liveLow, liveNeutral, liveHigh]) {
    assert.equal(sample.status.mode, 'webgl');
    assert.equal(sample.status.drawCalls, 1);
  }

  const lowNeutralRgb = distance(liveLow.averageRgb, liveNeutral.averageRgb);
  const neutralHighRgb = distance(liveNeutral.averageRgb, liveHigh.averageRgb);
  const lowHighRgb = distance(liveLow.averageRgb, liveHigh.averageRgb);
  assert.ok(lowNeutralRgb >= 2.0 && neutralHighRgb >= 2.0 && lowHighRgb >= 5.0,
    `mood 1/3/5 average RGB values are not visibly distinct: ${JSON.stringify({ lowNeutralRgb, neutralHighRgb, lowHighRgb })}`);
  assert.ok(hueDistance(liveLow.hue, liveHigh.hue) >= 8,
    `low/high mood hue separation is too small: ${liveLow.hue} vs ${liveHigh.hue}`);
  const coreRange = Math.max(liveLow.p95Luminance, liveNeutral.p95Luminance, liveHigh.p95Luminance)
    - Math.min(liveLow.p95Luminance, liveNeutral.p95Luminance, liveHigh.p95Luminance);
  assert.ok(coreRange <= 32, `mood tint changed the white-core luminance too much (${coreRange})`);

  const liveExit = await evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    const orb = document.getElementById('petAssistantParticleOrb');
    const before = window.FeMonsterPetParticleOrb.status();
    root.dataset.liveConversation = 'inactive';
    const glow = [];
    const emission = [];
    const start = performance.now();
    for (let frame = 0; frame < 90; frame += 1) {
      window.FeMonsterPetParticleOrb.renderOnce(start + frame * (1000 / 60));
      const status = window.FeMonsterPetParticleOrb.status();
      glow.push(status.liveGlow);
      emission.push(status.emission);
    }
    return { before, glow, emission, transition: getComputedStyle(orb).transitionDuration };
  })()`);
  const exitGlowSteps = liveExit.glow.map((value, index) => Math.abs(value - (index ? liveExit.glow[index - 1] : liveExit.before.liveGlow)));
  const exitEmissionSteps = liveExit.emission.map((value, index) => Math.abs(value - (index ? liveExit.emission[index - 1] : liveExit.before.emission)));
  assert.ok(Math.max(...exitGlowSteps) <= 0.055,
    `leaving realtime snaps the shader glow (${Math.max(...exitGlowSteps)})`);
  assert.ok(Math.max(...exitEmissionSteps) <= 0.055,
    `leaving realtime snaps particle emission (${Math.max(...exitEmissionSteps)})`);
  assert.ok(new Set(liveExit.glow.map((value) => value.toFixed(4))).size >= 20,
    'leaving realtime must fade over many rendered frames');
  assert.match(liveExit.transition, /(?:0\.[4-9]|[1-9])s/,
    `CSS filter transition is too short for a smooth live exit (${liveExit.transition})`);
  await delay(0);
  await evaluate(`window.__renderPetFrames(170)`);
  const postLiveHigh = await evaluate(`window.__petPixelMetrics()`);
  assertParticleGaps('post-live mood 5', postLiveHigh);
  assert.equal(postLiveHigh.status.live, false);
  assert.equal(postLiveHigh.status.mood, 5, 'leaving realtime must retain the emotional palette');
  // The video surface changes projected area by ~23% as it folds. Compare
  // light per visible pixel here so a later, larger geometric phase cannot be
  // mistaken for a stuck realtime glow.
  const liveMeanLuminance = liveHigh.totalLuminance / Math.max(1, liveHigh.visible);
  const postLiveMeanLuminance = postLiveHigh.totalLuminance / Math.max(1, postLiveHigh.visible);
  assert.ok(liveMeanLuminance >= postLiveMeanLuminance * 1.05,
    `leaving realtime did not return to ordinary per-pixel luminance (${liveMeanLuminance} -> ${postLiveMeanLuminance})`);
  assert.ok(Math.abs(postLiveHigh.status.emission - 0.78) <= 0.04,
    `ordinary emission did not settle after realtime (${postLiveHigh.status.emission})`);
  assert.ok(distance(liveHigh.status.emotionColor, postLiveHigh.status.emotionColor) <= 0.015,
    'leaving realtime discarded the current smoothed mood palette');
  assert.ok(hueDistance(liveHigh.hue, postLiveHigh.hue) <= 12,
    `leaving realtime changed the mood hue instead of only reducing brightness (${liveHigh.hue} -> ${postLiveHigh.hue})`);

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(80);
  await evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    root.dataset.state = 'speaking';
    root.dataset.liveConversation = 'active';
  })()`);
  await delay(0);
  await evaluate(`window.__renderPetFrames(180)`);
  const reducedSamples = await evaluate(`(() => {
    const values = [];
    const start = performance.now();
    for (let frame = 0; frame < 12; frame += 1) {
      window.FeMonsterPetParticleOrb.renderOnce(start + frame * (1000 / 60));
      values.push(window.FeMonsterPetParticleOrb.status().livePulse);
    }
    return {
      values,
      status: window.FeMonsterPetParticleOrb.status(),
      animation: getComputedStyle(document.getElementById('petAssistantParticleOrb')).animationName
    };
  })()`);
  assert.equal(reducedSamples.status.reducedMotion, true);
  assert.equal(reducedSamples.animation, 'none', 'CSS live glow must stop decorative motion in reduced-motion mode');
  const reducedPulseRange = Math.max(...reducedSamples.values) - Math.min(...reducedSamples.values);
  assert.ok(reducedPulseRange <= 0.002,
    `reduced-motion live pulse is still oscillating (${reducedPulseRange})`);

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await navigate('/fallback');
  await delay(80);
  const fallbackStatus = await evaluate(`window.FeMonsterPetParticleOrb.status()`);
  assert.equal(fallbackStatus.mode, 'canvas-2d');
  const fallbackCalls = await evaluate(`(() => {
    const api = window.FeMonsterPetParticleOrb;
    const root = document.getElementById('petAssistant');
    api.stop();
    root.dataset.liveConversation = 'inactive';
    for (let frame = 0; frame < 160; frame += 1) api.renderOnce(performance.now() + frame * 16.67);
    for (const key of Object.keys(window.__petCanvasCalls)) window.__petCanvasCalls[key] = 0;
    api.renderOnce(performance.now());
    const idle = { ...window.__petCanvasCalls };
    root.dataset.liveConversation = 'active';
    return new Promise((resolve) => setTimeout(() => {
      for (let frame = 0; frame < 80; frame += 1) api.renderOnce(performance.now() + frame * 16.67);
      for (const key of Object.keys(window.__petCanvasCalls)) window.__petCanvasCalls[key] = 0;
      api.renderOnce(performance.now());
      resolve({ idle, live: { ...window.__petCanvasCalls } });
    }, 0));
  })()`);
  assert.equal(fallbackCalls.idle.drawImage, 0);
  assert.equal(fallbackCalls.live.drawImage, 0);
  assert.ok(fallbackCalls.idle.arc <= 1024,
    `2D idle fallback exceeded its bounded 1024-point surface sample (${fallbackCalls.idle.arc})`);
  assert.ok(fallbackCalls.live.arc <= 2048,
    `2D live fallback exceeded two bounded 1024-point surface samples (${fallbackCalls.live.arc})`);
  assert.ok(fallbackCalls.live.fill <= 2 && fallbackCalls.live.beginPath <= 2,
    `2D live fallback stopped batching point paths: ${JSON.stringify(fallbackCalls.live)}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    webgl: {
      renderer: initialStatus.mode,
      particleCount: initialStatus.particleCount,
      drawCalls: initialStatus.drawCalls,
      idleLow: { visible: idleLow.visible, totalLuminance: idleLow.totalLuminance, bboxFill: idleLow.bboxFill },
      liveLow: { visible: liveLow.visible, totalLuminance: liveLow.totalLuminance, bboxFill: liveLow.bboxFill },
      moods: [liveLow, liveNeutral, liveHigh].map((sample) => ({
        mood: sample.status.mood,
        rgb: sample.averageRgb,
        hue: sample.hue,
        p95Luminance: sample.p95Luminance,
        bboxFill: sample.bboxFill
      })),
      postLive: { emission: postLiveHigh.status.emission, mood: postLiveHigh.status.mood },
      clarity: {
        idleP95: idleLow.p95Luminance,
        idleP99: idleLow.p99Luminance,
        idleEdgeGradient: idleLow.edgeGradient,
        idleSoftHalo: idleLow.softHalo,
        liveSoftHalo: liveLow.softHalo,
        liveP95: liveLow.p95Luminance,
        liveEdgeGradient: liveLow.edgeGradient,
        idleRadialProfile: idleLow.radialProfile,
        idleRadialRoughness: idleLow.radialRoughness,
        liveRadialProfile: liveLow.radialProfile,
        liveRadialRoughness: liveLow.radialRoughness,
        dpiSamples: dpiSamples.map((sample) => ({
          deviceScaleFactor: sample.deviceScaleFactor,
          rendererDpr: sample.status.dpr,
          visible: sample.visible,
          strong: sample.strong,
          bboxFill: sample.bboxFill,
          edgeGradient: sample.edgeGradient,
          sampledPeaks: sample.sampledPeaks,
          radialProfile: sample.radialProfile,
          radialRoughness: sample.radialRoughness,
          normalizedRadialProfile: sample.normalizedRadialProfile,
          normalizedRadialRoughness: sample.normalizedRadialRoughness,
          normalizedAngularRoughness: sample.normalizedAngularRoughness
        }))
      },
      scheduler: { idle: idleScheduler, live: liveScheduler, hidden: hiddenScheduler },
      liveExit: {
        maxGlowStep: Math.max(...exitGlowSteps),
        maxEmissionStep: Math.max(...exitEmissionSteps),
        uniqueGlowFrames: new Set(liveExit.glow.map((value) => value.toFixed(4))).size,
        transition: liveExit.transition
      },
      transitionMaxStep: Math.max(...transitionSteps),
      transitionDistance: fullEmotionDistance,
      reducedPulseRange
    },
    fallbackCalls
  }, null, 2)}\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ id: nextId++, method: 'Browser.close', params: {} })); } catch {}
    await delay(250);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
  if (browser?.pid) {
    if (browser.exitCode === null) browser.kill();
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  await delay(120);
  if (profile.startsWith(`${artifactRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
}
