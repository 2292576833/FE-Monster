import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = String(process.env.FE_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const debugPort = 14000 + (process.pid % 16000);
const profile = path.resolve(tmpdir(), `fe-monster-storm-shader-${process.pid}`);
const artifactDir = path.resolve('artifacts');
const screenshotPath = path.join(artifactDir, 'storm-ocean-cinematic-lighting-qa.png');
const browser = spawn(edge, [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const browserErrors = [];
let nextId = 1;
let socket;

async function retryJson(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || '').join(' '));
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 960,
    height: 540,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=storm-shader-compile` });
  await delay(2500);

  const evaluation = await command('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let attempt = 0; attempt < 50 && (!window.THREE || !window.FeStormOceanRuntime); attempt += 1) await wait(100);
      const THREE = window.THREE;
      const storm = window.FeStormOceanRuntime;
      if (!THREE || !storm) throw new Error('Three.js or storm runtime was not loaded');

      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      Object.assign(canvas.style, {
        position: 'fixed', inset: '0', width: '960px', height: '540px', zIndex: '2147483647', background: '#05070c'
      });
      document.body.appendChild(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(960, 540, false);
      renderer.setPixelRatio(1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 960 / 540, 0.1, 1600);
      camera.position.set(0, 14, 42);
      camera.lookAt(0, 1, -90);
      const root = new THREE.Group();
      scene.add(root);
      const geometry = new THREE.PlaneGeometry(900, 900, 96, 96);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshPhysicalMaterial({ color: 0x082a35, roughness: 0.17, metalness: 0, side: THREE.DoubleSide });
      const ocean = new THREE.Mesh(geometry, material);
      ocean.name = 'StormOcean_Surface_QA';
      ocean.position.z = -160;
      root.add(ocean);

      const runtime = storm.prepare(root, THREE, {
        lightingLoop: true,
        lightingCycleMinutes: 30,
        waterTextureTiles: 2.5,
        waterTextureResolution: 4096,
        foamOverlayEnabled: false,
        rayTracingMode: 'hybrid-analytic',
        rayTraceStrength: 0.82,
      });
      storm.configureScene(scene, renderer, THREE, runtime.config);
      storm.setLightingMode(runtime, 'sunset');
      storm.update(runtime, 3000, 0.18, true);
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      await wait(700);
      renderer.render(scene, camera);

      const gl = renderer.getContext();
      const shader = material.userData?.stormOceanShader;
      return {
        runtimeVersion: storm.runtimeVersion,
        materialCompiled: Boolean(shader),
        cinematicUniformsCompiled: Boolean(
          shader?.fragmentShader?.includes('uStormBacklight')
          && shader?.fragmentShader?.includes('uStormReflectionGain')
          && shader?.fragmentShader?.includes('stormWarmReflectionTrailV1')
        ),
        lightingTextureDetailCompiled: Boolean(
          shader?.fragmentShader?.includes('stormFacetLightContrastV4')
          && shader?.fragmentShader?.includes('stormMacroLightBalanceV5')
          && shader?.fragmentShader?.includes('stormFineOpticalDetailV6')
          && shader?.fragmentShader?.includes('stormSilkCapillaryDetailV7')
          && shader?.fragmentShader?.includes('stormNearShadowFillV5')
          && shader?.fragmentShader?.includes('stormTransmissionWindowV6')
          && shader?.fragmentShader?.includes('stormOpticalClarityV6')
          && shader?.fragmentShader?.includes('stormCinematicCrestColor')
        ),
        skyCompiled: runtime.skyDome?.material?.fragmentShader?.includes('stormCinematicBacklightV1') === true,
        materialRoughness: Number(material.roughness.toFixed(4)),
        normalTextureRepeat: runtime.waterTextures?.normalMap?.repeat?.toArray?.() || [],
        roughnessTextureRepeat: runtime.waterTextures?.roughnessMap?.repeat?.toArray?.() || [],
        waterTextureTiles: runtime.config?.waterTextureTiles || 0,
        waterTextureResolution: runtime.waterTextures?.textureState?.resolution || 0,
        lightingMode: runtime.lightingMode,
        lightingPhase: runtime.lightingPhase,
        sunElevationDegrees: Number((Math.asin(runtime.currentLighting.sunDirection[1]) * 180 / Math.PI).toFixed(2)),
        exposure: renderer.toneMappingExposure,
        glError: gl.getError(),
        renderer: gl.getParameter(gl.RENDERER),
      };
    })()`,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || 'QA evaluation failed');
  }
  const result = evaluation.result?.value;
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  const relevantErrors = browserErrors.filter((message) => /shader|webgl|storm/i.test(message));
  const passed = result?.materialCompiled === true
    && result?.cinematicUniformsCompiled === true
    && result?.lightingTextureDetailCompiled === true
    && result?.skyCompiled === true
    && Math.abs(result?.materialRoughness - 0.2) < 0.0001
    && result?.waterTextureTiles === 2.5
    && result?.normalTextureRepeat?.length === 2
    && Math.abs(result.normalTextureRepeat[0] - 2.5 / 4.35) < 0.0001
    && Math.abs(result.normalTextureRepeat[1] - 2.5 / 6.9) < 0.0001
    && result?.roughnessTextureRepeat?.length === 2
    && Math.abs(result.roughnessTextureRepeat[0] - 2.5 / 4.35) < 0.0001
    && Math.abs(result.roughnessTextureRepeat[1] - 2.5 / 6.9) < 0.0001
    && result?.waterTextureResolution === 4096
    && result?.lightingMode === 'sunset'
    && result?.lightingPhase === 'sunset'
    && result?.sunElevationDegrees >= 3
    && result?.sunElevationDegrees <= 6
    && result?.glError === 0
    && relevantErrors.length === 0;
  console.log(JSON.stringify({ ...result, screenshotPath, relevantErrors, passed }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  await Promise.race([
    new Promise((resolve) => browser.once('exit', resolve)),
    delay(2000),
  ]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
