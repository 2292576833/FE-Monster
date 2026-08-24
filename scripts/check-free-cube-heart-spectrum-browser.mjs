import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const runRoot = path.join(root, "tmp", `free-cube-heart-spectrum-${process.pid}`);
const profile = path.join(runRoot, "edge-profile");
const debugPort = 21000 + (process.pid % 9000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(edge)) throw new Error(`Microsoft Edge not found: ${edge}`);
mkdirSync(runRoot, { recursive: true });
process.env.TEMP = runRoot;
process.env.TMP = runRoot;

const fixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: rgb(34, 197, 139); }
    #heart-host { position: fixed; inset: 0; }
    #free-host { position: fixed; left: -10000px; top: 0; width: 640px; height: 360px; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="heart-host"></div>
  <div id="free-host"></div>
  <script src="/vendor/three.r128.min.js"></script>
  <script src="/free-cube-runtime.js"></script>
  <script>
    window.__ready = false;
    window.__errors = [];
    addEventListener('error', (event) => {
      window.__errors.push(String(event.error?.stack || event.message || 'window error'));
    });

    const makeSpectrum = (activeBand = -1) => {
      const spectrum = new Float32Array(512);
      if (activeBand >= 0 && activeBand < 4) {
        const from = activeBand * 128;
        spectrum.fill(1, from, from + 128);
      }
      return spectrum;
    };

    const advance = (runtime, clock, frames, spectrum, bass = 0) => {
      let now = clock;
      for (let frame = 0; frame < frames; frame += 1) {
        now += 1000 / 60;
        FeFreeCubeRuntime.update(runtime, {
          now,
          bass,
          energy: 0,
          beat: 0,
          yaw: 0.22,
          pitch: -0.16,
          zoom: 1,
          reducedMotion: false,
          pixelRatio: 1,
          lowFrequencyBands: spectrum
        });
      }
      return now;
    };

    window.__runHeartSpec = () => {
      const runtime = FeFreeCubeRuntime.create(document.querySelector('#heart-host'), {
        cubeCount: 1800,
        particleCount: 600,
        mode: 'heart',
        backgroundEnabled: true,
        pixelRatio: 1
      });
      let clock = performance.now() + 10;
      const silence = makeSpectrum();
      clock = advance(runtime, clock, 150, silence);
      const quiet = FeFreeCubeRuntime.diagnostics(runtime);
      const probes = [];
      for (let band = 0; band < 4; band += 1) {
        clock = advance(runtime, clock, 150, silence);
        const before = FeFreeCubeRuntime.diagnostics(runtime);
        clock = advance(runtime, clock, 36, makeSpectrum(band));
        const active = FeFreeCubeRuntime.diagnostics(runtime);
        clock = advance(runtime, clock, 150, silence);
        const released = FeFreeCubeRuntime.diagnostics(runtime);
        probes.push({ band, before, active, released });
      }
      const finalSilent = FeFreeCubeRuntime.diagnostics(runtime);
      return { quiet, probes, finalSilent };
    };

    window.__runFreeRegression = () => {
      const runtime = FeFreeCubeRuntime.create(document.querySelector('#free-host'), {
        cubeCount: 1800,
        particleCount: 600,
        mode: 'free',
        backgroundEnabled: false,
        pixelRatio: 1
      });
      let clock = performance.now() + 10;
      const silence = makeSpectrum();
      clock = advance(runtime, clock, 150, silence, 0);
      const quiet = FeFreeCubeRuntime.diagnostics(runtime);
      clock = advance(runtime, clock, 60, silence, 1);
      const loud = FeFreeCubeRuntime.diagnostics(runtime);
      return { quiet, loud };
    };

    window.__ready = Boolean(window.FeFreeCubeRuntime && window.THREE);
  </script>
</body>
</html>`;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"]
]);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/" || url.pathname === "/fixture.html") {
    const body = Buffer.from(fixture);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    response.end(body);
    return;
  }

  const webRoot = path.resolve(root, "web");
  const file = path.resolve(webRoot, url.pathname.replace(/^\/+/, ""));
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
  "--disable-background-networking",
  "--no-first-run",
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
const browserErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function captureBackdropMetrics() {
  const screenshot = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(path.join(runRoot, "heart-transparent-background.png"), Buffer.from(screenshot.data, "base64"));
  return evaluate(`new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const target = [34, 197, 139];
      const regions = [
        [0, 0, canvas.width * .16, canvas.height * .16],
        [canvas.width * .84, 0, canvas.width, canvas.height * .16],
        [0, canvas.height * .84, canvas.width * .16, canvas.height],
        [canvas.width * .84, canvas.height * .84, canvas.width, canvas.height]
      ];
      let matching = 0;
      let sampled = 0;
      for (const [left, top, right, bottom] of regions) {
        for (let y = Math.floor(top); y < Math.floor(bottom); y += 3) {
          for (let x = Math.floor(left); x < Math.floor(right); x += 3) {
            const offset = (y * canvas.width + x) * 4;
            const distance = Math.hypot(
              pixels[offset] - target[0],
              pixels[offset + 1] - target[1],
              pixels[offset + 2] - target[2]
            );
            if (distance <= 8) matching += 1;
            sampled += 1;
          }
        }
      }
      resolve({ width: canvas.width, height: canvas.height, cornerSamples: sampled, cornerBackdropMatches: matching, cornerBackdropMatchRatio: matching / Math.max(1, sampled) });
    };
    image.onerror = reject;
    image.src = ${JSON.stringify(`data:image/png;base64,${screenshot.data}`)};
  })`);
}

function approximatelyEqual(left, right, tolerance) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function rangesMatch(ranges) {
  const expected = [[20, 52.5], [52.5, 85], [85, 117.5], [117.5, 150]];
  return Array.isArray(ranges)
    && ranges.length === expected.length
    && ranges.every((range, index) => Array.isArray(range)
      && approximatelyEqual(Number(range[0]), expected[index][0], 0.1)
      && approximatelyEqual(Number(range[1]), expected[index][1], 0.1));
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === "page" && item.url === "about:blank")
    || targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No Edge page target was found");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || "runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || "").join(" "));
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 480,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command("Page.navigate", { url: `${baseUrl}/fixture.html` });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("window.__ready === true")) break;
    await delay(50);
  }
  if (!(await evaluate("window.__ready === true"))) throw new Error("Runtime fixture did not initialize");

  const heart = await evaluate("window.__runHeartSpec()");
  const backdrop = await captureBackdropMetrics();
  const free = await evaluate("window.__runFreeRegression()");
  const quiet = heart.quiet;
  const symmetry = quiet.heartSymmetry;
  const spectrum = quiet.heartSpectrum;
  const cubeSize = Number(quiet.heartCubeSize) || 1;
  const layerCounts = symmetry?.layerCounts;
  const mirrorCounts = Array.isArray(layerCounts)
    && layerCounts.length >= 4
    && layerCounts.length % 2 === 0
    && layerCounts.every((count, index) => count === layerCounts[layerCounts.length - 1 - index]);
  const spectrumCounts = spectrum?.cubeCounts;
  const mappingCoversEveryCube = Array.isArray(spectrumCounts)
    && spectrumCounts.length === 4
    && spectrumCounts.every((count) => Number.isInteger(count) && count >= 24)
    && spectrumCounts.reduce((sum, count) => sum + count, 0) === quiet.heartActiveCubeCount;

  const probeDetails = heart.probes.map((probe) => {
    const beforeDisplacements = probe.before.heartSpectrum?.displacements || [];
    const activeDisplacements = probe.active.heartSpectrum?.displacements || [];
    const deltas = Array.from({ length: 4 }, (_, index) =>
      Math.max(0, (Number(activeDisplacements[index]) || 0) - (Number(beforeDisplacements[index]) || 0)));
    const ownDelta = deltas[probe.band] || 0;
    const otherDelta = Math.max(0, ...deltas.filter((_, index) => index !== probe.band));
    const activeSymmetry = probe.active.heartSymmetry;
    return {
      band: probe.band,
      deltas,
      ownDelta,
      otherDelta,
      exclusive: ownDelta >= cubeSize * 0.12 && otherDelta <= cubeSize * 0.015,
      mirrorDisplacement: Number(activeSymmetry?.maxPairDisplacementError) <= 0.001,
      centeredWhileMoving: Math.abs(Number(activeSymmetry?.bounds?.centerZ)) <= 0.001,
      released: (probe.released.heartSpectrum?.displacements || []).every((value) => Number(value) <= cubeSize * 0.01)
    };
  });

  const checks = {
    browserClean: browserErrors.length === 0 && (await evaluate("window.__errors"))?.length === 0,
    heartFastPath: quiet.active === true && quiet.mode === "heart" && quiet.fastPath === "heart",
    noHeartBackdropDiagnostics: quiet.backgroundProfile === "none"
      && quiet.skyVisible === false
      && quiet.groundVisible === false
      && quiet.shadowVisible === false
      && quiet.particleVisible === false,
    noHeartBackdropPixels: backdrop.cornerBackdropMatchRatio >= 0.98,
    substantiallyMoreHeartCubes: quiet.heartActiveCubeCount >= 240,
    volumetricHeart: quiet.heartDepthLayerCount >= 4
      && quiet.heartDepthLayerCount % 2 === 0
      && quiet.bounds.depth >= cubeSize * 3.5,
    mirroredLayerCounts: mirrorCounts
      && layerCounts.reduce((sum, count) => sum + count, 0) === quiet.heartActiveCubeCount,
    everyHeartCubePaired: symmetry?.pairedCubeCount === quiet.heartActiveCubeCount
      && symmetry?.unpairedCubeCount === 0
      && Number(symmetry?.maxPairPositionError) <= 0.001,
    centeredDepthBounds: approximatelyEqual(Number(symmetry?.bounds?.frontExtent), Number(symmetry?.bounds?.backExtent), 0.001)
      && Math.abs(Number(symmetry?.bounds?.centerZ)) <= 0.001,
    fourExclusiveFrequencyBands: spectrum?.bandCount === 4
      && spectrum?.exclusive === true
      && rangesMatch(spectrum?.rangesHz)
      && mappingCoversEveryCube,
    correspondingBandOnlyMoves: probeDetails.length === 4
      && probeDetails.every((probe) => probe.exclusive),
    mirroredFrequencyDisplacement: probeDetails.every((probe) => probe.mirrorDisplacement && probe.centeredWhileMoving),
    silenceResetsHeart: probeDetails.every((probe) => probe.released)
      && (heart.finalSilent.heartSpectrum?.displacements || []).length === 4
      && heart.finalSilent.heartSpectrum.displacements.every((value) => Number(value) <= cubeSize * 0.01),
    freeModePreserved: free.quiet.active === true
      && free.quiet.mode === "free"
      && free.quiet.fastPath === "free"
      && free.quiet.cubeCount >= 1600
      && free.quiet.particleVisible === true
      && free.quiet.freeDepthProfile === "three-layer-staggered-impact"
      && free.quiet.freeDepthLayerCounts?.reduce((sum, count) => sum + count, 0) === free.quiet.cubeCount
      && free.loud.freeDepthDisplacement - free.quiet.freeDepthDisplacement >= 5
  };

  const result = {
    pass: Object.values(checks).every(Boolean),
    checks,
    runRoot,
    backdrop,
    heart: {
      quiet,
      probes: probeDetails,
      finalSilent: heart.finalSilent
    },
    free,
    browserErrors
  };
  writeFileSync(path.join(runRoot, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  browser.kill();
  if (process.platform === "win32" && browser.pid) {
    spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  await delay(250);
  await new Promise((resolve) => server.close(resolve));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  } catch {
    // A delayed Edge utility process can hold the profile briefly on Windows.
  }
}
