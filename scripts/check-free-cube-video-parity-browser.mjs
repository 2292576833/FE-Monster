import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const runRoot = path.join(root, "tmp", `free-cube-video-parity-${process.pid}`);
const profile = path.join(runRoot, "edge-profile");
const screenshots = path.join(runRoot, "screenshots");
const debugPort = 19000 + Math.floor(Math.random() * 8000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(edge)) throw new Error(`Microsoft Edge not found: ${edge}`);
mkdirSync(screenshots, { recursive: true });
process.env.TEMP = runRoot;
process.env.TMP = runRoot;

const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body,#host{width:100%;height:100%;margin:0;overflow:hidden;background:#020208}
canvas{display:block;width:100%;height:100%}
</style></head><body><div id="host"></div>
<script src="/vendor/three.r128.min.js"></script>
<script src="/free-cube-runtime.js"></script>
<script>
window.__ready = false;
window.__errors = [];
addEventListener('error', (event) => __errors.push(String(event.error?.stack || event.message)));
const host = document.querySelector('#host');
window.__runtime = FeFreeCubeRuntime.create(host, {
  cubeCount: 1800,
  particleCount: 600,
  mode: 'heart',
  backgroundEnabled: true,
  pixelRatio: 1
});
window.__clock = performance.now();
window.__step = (frames, input = {}) => {
  for (let index = 0; index < frames; index += 1) {
    window.__clock += 1000 / 60;
    FeFreeCubeRuntime.update(window.__runtime, {
      now: window.__clock,
      bass: Number(input.bass) || 0,
      energy: Number(input.energy) || 0,
      beat: Number(input.beat) || 0,
      yaw: input.yaw === undefined ? 0.22 : Number(input.yaw),
      pitch: input.pitch === undefined ? -0.16 : Number(input.pitch),
      zoom: input.zoom === undefined ? 1 : Number(input.zoom),
      reducedMotion: false,
      pixelRatio: 1
    });
  }
  return FeFreeCubeRuntime.diagnostics(window.__runtime);
};
window.__ready = Boolean(window.__runtime);
</script></body></html>`;

const contentTypes = new Map([
  [".js", "application/javascript; charset=utf-8"],
  [".html", "text/html; charset=utf-8"]
]);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/fixture.html") {
    const body = Buffer.from(fixture);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
    response.end(body);
    return;
  }
  const relative = url.pathname.replace(/^\//, "");
  const file = path.resolve(root, "web", relative);
  const webRoot = path.resolve(root, "web");
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(file);
  response.writeHead(200, {
    "Content-Type": contentTypes.get(path.extname(file)) || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(edge, [
  "--headless=new",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--disable-background-timer-throttling",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], {
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env, TEMP: runRoot, TMP: runRoot }
});

let socket;
let nextId = 1;
const pending = new Map();
const errors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error("Edge debugging endpoint did not start");
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const payload = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (payload.exceptionDetails) {
    throw new Error(payload.exceptionDetails.exception?.description || payload.exceptionDetails.text || "Runtime evaluation failed");
  }
  return payload.result?.value;
}

async function capture(name) {
  const payload = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  const file = path.join(screenshots, `${name}.png`);
  writeFileSync(file, Buffer.from(payload.data, "base64"));
  const metrics = await evaluate(`new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let warmSky = 0;
      let darkSky = 0;
      let paleGround = 0;
      let luminance = 0;
      let redMinX = canvas.width;
      let redMaxX = -1;
      let redMinY = canvas.height;
      let redMaxY = -1;
      const colors = new Set();
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const offset = (y * canvas.width + x) * 4;
          const r = data[offset], g = data[offset + 1], b = data[offset + 2];
          luminance += r * .2126 + g * .7152 + b * .0722;
          // Measure the illuminated red faces, not the near-black side faces or
          // the warm ground.  The reference pulse grows this bright footprint
          // through perspective while every cube keeps the same scale.
          if (r > 85 && g < 95 && b < 75 && r > g * 1.4 && r > b * 1.5) {
            red += 1;
            redMinX = Math.min(redMinX, x);
            redMaxX = Math.max(redMaxX, x);
            redMinY = Math.min(redMinY, y);
            redMaxY = Math.max(redMaxY, y);
          }
          if (y < canvas.height * .78 && r > 90 && r > b * .95 && g > 35) warmSky += 1;
          if (y < canvas.height * .78 && b > r * .72 && r < 75 && g < 70) darkSky += 1;
          if (y > canvas.height * .68 && r > 115 && g > 85 && b > 100) paleGround += 1;
          colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
      }
      const samples = Math.ceil(canvas.width / 2) * Math.ceil(canvas.height / 2);
      resolve({
        width: canvas.width,
        height: canvas.height,
        redRatio: red / samples,
        redArea: red * 4,
        redBbox: redMaxX >= redMinX ? {
          x: redMinX,
          y: redMinY,
          width: redMaxX - redMinX + 2,
          height: redMaxY - redMinY + 2,
          centerX: (redMinX + redMaxX + 2) / 2,
          centerY: (redMinY + redMaxY + 2) / 2
        } : null,
        warmSkyRatio: warmSky / samples,
        darkSkyRatio: darkSky / samples,
        paleGroundRatio: paleGround / samples,
        meanLuminance: luminance / samples,
        distinctQuantizedColors: colors.size
      });
    };
    image.onerror = reject;
    image.src = ${JSON.stringify(`data:image/png;base64,${payload.data}`)};
  })`);
  return { file, metrics };
}

function check(condition, message, details) {
  if (condition) return;
  errors.push(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === "page" && item.url === "about:blank") || targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No Edge page target was found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 508, height: 316, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: `${baseUrl}/fixture.html` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate("window.__ready === true")) break;
    await delay(50);
  }
  check(await evaluate("window.__ready === true"), "runtime fixture did not initialize");
  const quiet = await evaluate("window.__step(72, { bass: 0, energy: 0, beat: 0 })");
  const sunset = await capture("sunset-quiet");
  const loud = await evaluate("window.__step(18, { bass: 1, energy: .85, beat: 1 })");
  const peak = await capture("sunset-peak");
  await evaluate("FeFreeCubeRuntime.setBackgroundEnabled(window.__runtime, false)");
  const fade = await evaluate("window.__step(12, { bass: .3, energy: .25, beat: 0 })");
  const fadeFrame = await capture("background-fade");
  const night = await evaluate("window.__step(180, { bass: 0, energy: 0, beat: 0 })");
  const nightFrame = await capture("night-quiet");

  check(quiet.heartLayout === "voxel-prism", "heart must use a regular voxel prism", quiet.heartLayout);
  check(quiet.heartGridColumns === 13 && quiet.heartGridRows === 12, "heart logical grid must match the 13x12 reference", { columns: quiet.heartGridColumns, rows: quiet.heartGridRows });
  check(quiet.heartDepthLayerCount === 4, "heart must have four physical depth layers", quiet.heartDepthLayerCount);
  check(quiet.heartActiveCubeCount >= 85 && quiet.heartActiveCubeCount <= 115, "heart must contain one cube per occupied 13x12 mask cell", quiet.heartActiveCubeCount);
  check(quiet.heartFrontLayerCount >= 18 && quiet.heartFrontLayerCount <= 24, "front depth band must contain the expected accent cells", quiet.heartFrontLayerCount);
  check(quiet.heartMiddleLayerCount > 0 && quiet.heartJitter === 0, "heart must use four deterministic non-jittered depth bands", { middle: quiet.heartMiddleLayerCount, jitter: quiet.heartJitter });
  check(quiet.heartAxisAligned === true && quiet.cubeSpin === false && quiet.autoRotation === false, "heart cubes must remain axis aligned without automatic rotation");
  check(quiet.material.transmission <= 0.02 && quiet.material.roughness >= 0.28, "heart material must be opaque satin rather than glass", quiet.material);
  check(quiet.coverage.width >= 0.45 && quiet.coverage.width <= 0.66, "quiet heart width must match the reference framing", quiet.coverage);
  check(quiet.coverage.height >= 0.5 && quiet.coverage.height <= 0.7, "quiet heart height must match the reference framing", quiet.coverage);
  check(loud.heartFrontDisplacement >= quiet.heartCubeSize * 0.9 && loud.heartFrontDisplacement <= quiet.heartCubeSize * 1.8, "low frequency must push the front layer about 1.2 cube sizes toward the camera", { quiet, loud });
  check(loud.heartBackDisplacement <= quiet.heartCubeSize * 0.4, "rear anchors must move much less than the front accents", loud.heartBackDisplacement);
  check(loud.bounds.depth >= quiet.bounds.depth + quiet.heartCubeSize * 0.72, "loud frame must gain perspective depth without scaling cubes", { quiet: quiet.bounds, loud: loud.bounds });
  check(Math.abs(loud.heartCubeScale - quiet.heartCubeScale) <= 0.001, "audio must not scale the cubes", { quiet: quiet.heartCubeScale, loud: loud.heartCubeScale });
  check(quiet.backgroundProfile === "sunset-night-cut-v1" && quiet.groundVisible === true, "scene must provide the sunset/night sky and planet ground", quiet);
  check(fade.backgroundTransitioning === true && fade.sunsetOpacity < 1, "day-to-night transition must visibly fade", fade);
  check(night.backgroundMode === "night" && night.nightOpacity >= 0.98, "night sky must finish after the measured transition", night);
  check(sunset.metrics.redRatio >= 0.07 && sunset.metrics.redBbox, "heart foreground must be visibly red", sunset.metrics);
  check(sunset.metrics.redBbox?.width / 508 >= 0.48 && sunset.metrics.redBbox?.width / 508 <= 0.58, "quiet red silhouette width must match the video", sunset.metrics.redBbox);
  check(sunset.metrics.redBbox?.height / 316 >= 0.69 && sunset.metrics.redBbox?.height / 316 <= 0.78, "quiet red silhouette height must match the video", sunset.metrics.redBbox);
  check(Math.abs((sunset.metrics.redBbox?.centerX || 0) - 309) <= 12, "heart center must keep the reference right-offset composition", sunset.metrics.redBbox);
  check(peak.metrics.redBbox?.width / Math.max(1, sunset.metrics.redBbox?.width) >= 1.05 && peak.metrics.redBbox?.width / Math.max(1, sunset.metrics.redBbox?.width) <= 1.12, "peak width must grow by perspective rather than cube scaling", { quiet: sunset.metrics.redBbox, peak: peak.metrics.redBbox });
  check(peak.metrics.redArea / Math.max(1, sunset.metrics.redArea) >= 1.15 && peak.metrics.redArea / Math.max(1, sunset.metrics.redArea) <= 1.42, "peak bright-red face area must grow with the low-frequency push", { quiet: sunset.metrics.redArea, peak: peak.metrics.redArea });
  check(sunset.metrics.warmSkyRatio >= 0.18, "sunset frame must contain a warm sky", sunset.metrics);
  check(nightFrame.metrics.darkSkyRatio >= 0.24 && nightFrame.metrics.meanLuminance < sunset.metrics.meanLuminance * 0.72, "night frame must be visibly darker and navy", { sunset: sunset.metrics, night: nightFrame.metrics });
  check(sunset.metrics.paleGroundRatio >= 0.018 && nightFrame.metrics.paleGroundRatio >= 0.006, "planet ground and soft shadow must remain visible", { sunset: sunset.metrics, night: nightFrame.metrics });
  check(quiet.drawCalls > 0 && quiet.drawCalls <= 10, "scene draw calls must remain bounded", quiet.drawCalls);
  check((await evaluate("window.__errors"))?.length === 0, "browser runtime emitted errors", await evaluate("window.__errors"));

  const result = {
    pass: errors.length === 0,
    errors,
    runRoot,
    quiet,
    loud,
    fade,
    night,
    pixels: { sunset: sunset.metrics, peak: peak.metrics, fade: fadeFrame.metrics, night: nightFrame.metrics }
  };
  writeFileSync(path.join(runRoot, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  browser.kill();
  await delay(300);
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true });
}
