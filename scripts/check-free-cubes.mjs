import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const width = Math.max(960, Number.parseInt(process.argv[2] || "1440", 10) || 1440);
const height = Math.max(540, Number.parseInt(process.argv[3] || "900", 10) || 900);
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const debugPort = 14000 + (process.pid % 14000);
const profile = path.resolve(tmpdir(), `fe-monster-free-cubes-${process.pid}`);
const artifactDir = path.resolve("artifacts");
const screenshots = {
  free: path.join(artifactDir, `free-cubes-free-${width}x${height}.png`),
  freeBass: path.join(artifactDir, `free-cubes-bass-depth-${width}x${height}.png`),
  heart: path.join(artifactDir, `free-cubes-heart-${width}x${height}.png`),
  galaxy: path.join(artifactDir, `free-cubes-galaxy-${width}x${height}.png`),
};
mkdirSync(artifactDir, { recursive: true });

const browser = spawn(edge, [
  "--headless=new",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--force-prefers-reduced-motion=no-preference",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Evaluation failed");
  }
  return result.result?.value;
}

async function capture(target) {
  const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(target, Buffer.from(result.data, "base64"));
}

function colorDistance(a, b) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const left = parse(a);
  const right = parse(b);
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === "page");
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
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.navigate", { url: `${baseUrl}/?qa=free-cubes` });
  await delay(1800);

  const initial = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const poll = async (read, timeout = 15000) => {
      const started = performance.now();
      while (performance.now() - started < timeout) {
        const value = read();
        if (value) return value;
        await wait(120);
      }
      return null;
    };
    const boot = document.querySelector('#bootScreen');
    const bootButton = document.querySelector('#bootLogoButton');
    if (boot && !boot.hidden && bootButton) {
      bootButton.disabled = false;
      bootButton.click();
      await wait(900);
    }
    document.querySelector('#diyButton')?.click();
    await wait(180);
    document.querySelector('#diyPresetButton')?.click();
    await wait(260);
    const card = document.querySelector('#diyFreeCubePreset');
    const cardInSceneList = Boolean(card && document.querySelector('#diyScenePresetList')?.contains(card));
    const cardLabel = card?.querySelector('strong')?.textContent.trim() || '';
    card?.click();
    const active = await poll(() => window.FeSandboxDiagnostics?.freeCube?.()?.active);
    if (!active) throw new Error('自由方块运行时未启动');

    const cover = document.createElement('canvas');
    cover.width = 300;
    cover.height = 120;
    const context = cover.getContext('2d');
    context.fillStyle = '#1dd7ef';
    context.fillRect(0, 0, 100, 120);
    context.fillStyle = '#9b5cff';
    context.fillRect(100, 0, 100, 120);
    context.fillStyle = '#ff4f9d';
    context.fillRect(200, 0, 100, 120);
    const image = new Image();
    image.src = cover.toDataURL('image/png');
    await image.decode();
    const sampled = sampleCoverPalette(image);
    applyLyricPalette(sampled);
    await wait(220);
    const before = window.FeSandboxDiagnostics.freeCube();
    await wait(520);
    const after = window.FeSandboxDiagnostics.freeCube();
    const runtime = state.freeCube.runtime;
    const previousHostStyle = runtime.host.getAttribute('style');
    runtime.host.style.cssText = 'position:absolute;left:0;top:0;width:32px;height:32px;';
    window.FeFreeCubeRuntime.resize(runtime, 2.5);
    const maxDpr = window.FeSandboxDiagnostics.freeCube();
    if (previousHostStyle === null) runtime.host.removeAttribute('style');
    else runtime.host.setAttribute('style', previousHostStyle);
    window.FeFreeCubeRuntime.resize(runtime, renderPixelRatio('webgl'));
    const fsrAccepted = window.FeFreeCubeRuntime.setRenderQuality(runtime, {
      name: 'quality',
      scale: 0.67,
      dynamicResolution: false,
      sharpness: 0.24
    });
    await wait(180);
    const fsr = window.FeSandboxDiagnostics.freeCube();
    const nativeAccepted = window.FeFreeCubeRuntime.setRenderQuality(runtime, 'native');
    const restored = window.FeSandboxDiagnostics.freeCube();
    const qualityProbe = {
      native: after.renderQuality,
      maxDpr: maxDpr.pixelRatio,
      restoredDpr: restored.pixelRatio,
      fsrAccepted,
      fsr: fsr.renderQuality,
      nativeAccepted,
      restored: restored.renderQuality
    };

    document.querySelector('#diyButton')?.click();
    await wait(180);
    document.querySelector('#diyPresetButton')?.click();
    await wait(260);
    const controls = document.querySelector('#freeCubePresetControls');
    const controlsRect = controls?.getBoundingClientRect();
    const controlsVisible = Boolean(controls && !controls.hidden && controlsRect?.width > 0 && controlsRect?.height > 0);
    const heartPressed = document.querySelector('#freeCubeHeartButton')?.getAttribute('aria-pressed');
    const backgroundPressed = document.querySelector('#freeCubeBackgroundButton')?.getAttribute('aria-pressed');
    document.querySelector('#diyCloseButton')?.click();
    setDiyOpen(false);
    await wait(220);
    const stageRect = document.querySelector('.stage')?.getBoundingClientRect();
    return {
      cardInSceneList,
      cardLabel,
      controlsVisible,
      heartPressed,
      backgroundPressed,
      before,
      after,
      qualityProbe,
      stageRect: stageRect ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height } : null
    };
  })()`);

  await capture(screenshots.free);

  const freeBassAttack = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    window.FeSandboxDiagnostics.previewFreeCubeBass(0);
    await wait(900);
    const quiet = window.FeSandboxDiagnostics.freeCube();
    window.FeSandboxDiagnostics.previewFreeCubeBass(1);
    await wait(35);
    const early = window.FeSandboxDiagnostics.freeCube();
    await wait(45);
    const onset = window.FeSandboxDiagnostics.freeCube();
    await wait(570);
    const loud = window.FeSandboxDiagnostics.freeCube();
    return { quiet, early, onset, loud };
  })()`);
  await capture(screenshots.freeBass);

  const freeBassRelease = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    window.FeSandboxDiagnostics.clearFreeCubeBassPreview();
    await wait(340);
    const releaseTau = window.FeSandboxDiagnostics.freeCube();
    await wait(1060);
    const released = window.FeSandboxDiagnostics.freeCube();
    return { releaseTau, released };
  })()`);
  const freeBass = { ...freeBassAttack, ...freeBassRelease };

  const heart = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.querySelector('#freeCubeHeartButton')?.click();
    await wait(1900);
    return window.FeSandboxDiagnostics.freeCube();
  })()`);
  await capture(screenshots.heart);

  const galaxy = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.querySelector('#freeCubeBackgroundButton')?.click();
    await wait(650);
    return window.FeSandboxDiagnostics.freeCube();
  })()`);
  await capture(screenshots.galaxy);

  const bass = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    window.FeSandboxDiagnostics.previewFreeCubeBass(0);
    await wait(900);
    const quiet = window.FeSandboxDiagnostics.freeCube();
    window.FeSandboxDiagnostics.previewFreeCubeBass(1);
    await wait(650);
    const loud = window.FeSandboxDiagnostics.freeCube();
    window.FeSandboxDiagnostics.clearFreeCubeBassPreview();
    return { quiet, loud };
  })()`);

  const stage = initial.stageRect;
  if (stage) {
    const y = Math.round(stage.top + stage.height * 0.52);
    const startX = Math.round(stage.left + Math.min(120, stage.width * 0.12));
    const endX = Math.round(stage.left + stage.width - Math.min(100, stage.width * 0.1));
    await command("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y, button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 8; step += 1) {
      await command("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.round(startX + (endX - startX) * step / 8),
        y: y + Math.round(Math.sin(step) * 8),
        button: "left",
        buttons: 1,
      });
      await delay(24);
    }
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y, button: "left", buttons: 0, clickCount: 1 });
    await delay(320);
  }
  const rotated = await evaluate(`window.FeSandboxDiagnostics.freeCube()`);

  const cleanup = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    setDiyPreset('lyric');
    await wait(180);
    const left = window.FeSandboxDiagnostics.freeCube();
    const controlsHiddenOnLyric = document.querySelector('#freeCubePresetControls')?.hidden === true;
    setDiyPreset('free-cubes');
    await wait(420);
    const returned = window.FeSandboxDiagnostics.freeCube();
    setDiyPreset('lyric');
    await wait(180);
    return { left, returned, controlsHiddenOnLyric };
  })()`);

  const palette = heart.palette || [];
  const paletteDistances = palette.length === 3
    ? [colorDistance(palette[0], palette[1]), colorDistance(palette[0], palette[2]), colorDistance(palette[1], palette[2])]
    : [];
  const shaderErrors = browserErrors.filter((message) => /shader|webgl|gl_invalid|program/i.test(message));
  const checks = {
    presetCard: initial.cardInSceneList && initial.cardLabel === "自由方块",
    controlsScoped: initial.controlsVisible && initial.heartPressed === "false" && initial.backgroundPressed === "true" && cleanup.controlsHiddenOnLyric,
    freeMode: initial.after.mode === "free" && initial.after.cubeCount >= 1600,
    freeMotion: Math.abs(initial.after.motionChecksum - initial.before.motionChecksum) > 0.0001,
    noAutoRotation: initial.after.autoRotation === false
      && initial.after.cubeSpin === false
      && Math.hypot(
        initial.after.rotation.yaw - initial.before.rotation.yaw,
        initial.after.rotation.pitch - initial.before.rotation.pitch
      ) < 0.002,
    freeCoverage: initial.after.coverage.width >= 0.7 && initial.after.coverage.height >= 0.7,
    heartMode: heart.mode === "heart" && heart.transition >= 0.98,
    orderedHeart: heart.heartLayout === "rounded-double-surface"
      && heart.heartProfile === "rounded-bezier"
      && heart.heartGridSpacing >= 1,
    frontBackSurfaces: heart.heartDepthLayerCount === 2
      && heart.heartMiddleLayerCount === 0
      && heart.heartSurfaceCounts.length === 2
      && heart.heartSurfaceCounts[0] + heart.heartSurfaceCounts[1] === heart.cubeCount
      && Math.abs(heart.heartSurfaceCounts[0] - heart.heartSurfaceCounts[1]) <= 1,
    controlledJitter: heart.heartJitter >= 0.25 && heart.heartJitter <= 0.5,
    largeHeart: heart.coverage.height >= 0.52 && heart.coverage.height <= 0.95,
    volumetricHeart: heart.bounds.depth / Math.max(1, heart.bounds.width) >= 0.14,
    coverPalette: palette.length === 3 && paletteDistances.every((distance) => distance >= 48),
    softBackground: heart.backgroundEnabled === true && heart.particleVisible === false,
    galaxyMode: galaxy.backgroundEnabled === false && galaxy.particleVisible === true && galaxy.particleCount >= 1000,
    galaxyQuality: galaxy.pointSize <= 2.5 && galaxy.blending === "additive",
    glassMaterial: heart.material.type === "MeshPhysicalMaterial"
      && heart.material.roughness >= 0.19
      && heart.material.roughness <= 0.21
      && heart.material.transmission >= 0.25
      && heart.material.clearcoat >= 0.7
      && heart.material.clearcoat <= 0.74
      && heart.material.clearcoatRoughness >= 0.13
      && heart.material.clearcoatRoughness <= 0.15,
    opaqueInstanceMaterial: heart.material.transparent === false
      && heart.material.opacity === 1
      && heart.material.depthWrite === true,
    cubemapQuality: heart.environment.faceSize === 64
      && heart.environment.mipmapped === true
      && heart.normalBlend >= 0.16
      && heart.normalBlend <= 0.2,
    controlledExposure: initial.after.toneMappingExposure >= 0.92
      && initial.after.toneMappingExposure <= 0.98,
    realisticReflection: Math.abs(initial.after.material.envMapIntensity - 0.78) <= 0.001
      && freeBass.loud.material.envMapIntensity >= 0.85
      && freeBass.loud.material.envMapIntensity <= 0.875,
    nativeRenderQuality: initial.qualityProbe.native.available === true
      && initial.qualityProbe.native.mode === "native"
      && initial.qualityProbe.native.enabled === false
      && initial.qualityProbe.native.backend === "direct",
    fsrRequestApi: initial.qualityProbe.fsrAccepted === true
      && initial.qualityProbe.fsr.request === "quality"
      && initial.qualityProbe.fsr.mode === "quality"
      && initial.qualityProbe.fsr.frameCount > initial.qualityProbe.native.frameCount
      && (
        initial.qualityProbe.fsr.enabled === true
          ? Math.abs(initial.qualityProbe.fsr.renderScale - 0.67) <= 0.001
          : initial.qualityProbe.fsr.backend === "direct" && Boolean(initial.qualityProbe.fsr.fallbackReason)
      )
      && initial.qualityProbe.nativeAccepted === true
      && initial.qualityProbe.restored.mode === "native"
      && initial.qualityProbe.restored.enabled === false
      && initial.qualityProbe.restored.backend === "direct",
    dprUpperBound: initial.qualityProbe.maxDpr === 2.5
      && initial.qualityProbe.restoredDpr >= 0.5
      && initial.qualityProbe.restoredDpr <= 2.5,
    layeredDepthImpact: freeBass.loud.freeDepthProfile === "three-layer-staggered-impact"
      && freeBass.loud.freeDepthLayerCounts.length === 3
      && freeBass.loud.freeDepthLayerCounts.reduce((sum, value) => sum + value, 0) === freeBass.loud.cubeCount
      && JSON.stringify(freeBass.loud.freeDepthLayerDisplacements) === JSON.stringify([6, 3.5, -2])
      && JSON.stringify(freeBass.loud.freeDepthStaggerMs) === JSON.stringify([0, 40, 70])
      && freeBass.loud.freeDepthAttackMs === 70
      && freeBass.loud.freeDepthReleaseMs === 340
      && freeBass.loud.freeDepthHistorySize === 64,
    staggeredDepthResponse: freeBass.early.freeDepthLayerBass[0] > 0.05
      && freeBass.early.freeDepthLayerBass[1] <= 0.02
      && freeBass.early.freeDepthLayerBass[2] <= 0.02
      && freeBass.onset.freeDepthLayerBass[0] > freeBass.onset.freeDepthLayerBass[1] + 0.05
      && freeBass.onset.freeDepthLayerBass[1] > freeBass.onset.freeDepthLayerBass[2] + 0.04,
    freeBassResponse: freeBass.quiet.mode === "free"
      && freeBass.loud.mode === "free"
      && freeBass.loud.freeBassAxis === "depth-z"
      && freeBass.loud.freeDepthDisplacement - freeBass.quiet.freeDepthDisplacement >= 5.5
      && freeBass.loud.bounds.depth - freeBass.quiet.bounds.depth >= 6.5
      && freeBass.releaseTau.freeDepthDisplacement >= 1.6
      && freeBass.releaseTau.freeDepthDisplacement <= 2.8
      && freeBass.released.freeDepthDisplacement <= 0.15,
    freeBassAccents: freeBass.loud.freeScalePulse >= 0.07
      && freeBass.loud.freeScalePulse <= 0.0801
      && freeBass.loud.freeReflectionBoost >= 0.1
      && freeBass.loud.freeReflectionBoost <= 0.1201
      && freeBass.loud.freeTiltDegrees >= 2.6
      && freeBass.loud.freeTiltDegrees <= 3.01
      && freeBass.loud.material.envMapIntensity >= 0.85
      && freeBass.loud.material.envMapIntensity <= 0.875,
    bassResponse: bass.loud.pulseDisplacement - bass.quiet.pulseDisplacement >= 1.2
      && bass.loud.freeDepthDisplacement === 0
      && bass.loud.freeScalePulse === 0
      && bass.loud.freeReflectionBoost === 0
      && bass.loud.freeTiltDegrees === 0
      && Math.abs(bass.loud.material.envMapIntensity - 0.78) <= 0.001,
    rotation: Math.hypot(
      rotated.rotation.yaw - galaxy.rotation.yaw,
      rotated.rotation.pitch - galaxy.rotation.pitch
    ) >= 0.15,
    drawCalls: freeBass.loud.drawCalls === freeBass.quiet.drawCalls
      && freeBass.loud.drawCalls <= 4
      && heart.drawCalls <= 4
      && galaxy.drawCalls <= 4,
    disposal: cleanup.left.active === false && cleanup.left.canvasCount === 0 && cleanup.left.disposeCount >= 1,
    singleCanvasOnReturn: cleanup.returned.active === true && cleanup.returned.canvasCount === 1,
    shaderErrors: shaderErrors.length === 0,
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    viewport: `${width}x${height}`,
    checks,
    diagnostics: { free: initial.after, qualityProbe: initial.qualityProbe, freeBass, heart, galaxy, bass, rotated, cleanup, paletteDistances },
    browserErrors,
    screenshots,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  if (process.platform === "win32" && browser.pid) {
    spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  await delay(180);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
  } catch {
    // A delayed Edge utility process can hold the temporary profile briefly on Windows.
  }
}
