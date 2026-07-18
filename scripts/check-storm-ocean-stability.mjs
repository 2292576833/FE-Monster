import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const presetPayload = JSON.parse(readFileSync(path.join(webRoot, 'data', 'storm-ocean-preset.json'), 'utf8'));
const screenshotPath = path.join(root, 'artifacts', 'storm-ocean-stability.png');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(tmpdir(), `fe-monster-storm-stability-${process.pid}`);
const debugPort = 16000 + (process.pid % 12000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.glb', 'model/gltf-binary'],
  ['.woff2', 'font/woff2'],
]);

function apiFixture(pathname) {
  if (pathname === '/api/sandbox/presets') return presetPayload;
  if (pathname === '/api/sandbox/components') return { components: [] };
  if (pathname === '/api/player/state') return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (pathname === '/api/visual-bridge/state') return { audio: {} };
  if (pathname === '/api/audio/sample') return {};
  if (pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  if (pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname === '/api/community/listen/state' || pathname === '/api/community/listening') return { ok: false };
  if (pathname === '/api/app/runtime') return {};
  if (pathname === '/api/login/status') return { loggedIn: false };
  return { ok: false };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: path.join(root, 'components'), relative: decoded.slice('/components/'.length) }
    : decoded.startsWith('/node_modules/')
      ? { base: path.join(root, 'node_modules'), relative: decoded.slice('/node_modules/'.length) }
      : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : '';
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const body = Buffer.from(JSON.stringify(apiFixture(url.pathname)));
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    response.end(body);
    return;
  }
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
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
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
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
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=storm-ocean-stability` });

  const evaluation = await command('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const poll = async (read, timeout = 60000) => {
        const started = performance.now();
        while (performance.now() - started < timeout) {
          const value = read();
          if (value) return value;
          await wait(100);
        }
        return null;
      };
      await poll(() => window.FeSandboxDiagnostics && window.FeStormOceanRuntime, 20000);
      const boot = document.querySelector('#bootScreen');
      const bootButton = document.querySelector('#bootLogoButton');
      if (boot && !boot.hidden && bootButton) {
        bootButton.disabled = false;
        bootButton.click();
        await wait(900);
      }
      document.querySelector('#diyButton')?.click();
      await wait(250);
      document.querySelector('#diyPresetButton')?.click();
      const enter = await poll(() => document.querySelector('[data-diy-featured-preset="preset-storm-ocean-horizon"]'), 20000);
      enter?.click();
      const playback = document.querySelector('#sandboxPlaybackScene');
      await poll(() => playback?.classList.contains('is-model-ready') || playback?.classList.contains('is-model-failed'), 60000);
      const componentId = 'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d';
      await poll(() => window.FeSandboxDiagnostics?.component?.(componentId)?.loaded, 60000);
      await poll(() => window.FeStormOceanRuntime?.cyclesEnvironmentDiagnostics?.().ready, 20000);
      const item = state.sandbox.sceneItems.find((candidate) => candidate.component.id === componentId);
      const group = item ? state.sandbox.meshes.get(item.id) : null;
       const runtime = group?.userData?.stormOceanRuntime;
       const ocean = runtime?.oceanNodes?.[0];
       const materials = ocean ? (Array.isArray(ocean.material) ? ocean.material : [ocean.material]) : [];
       const orbContext = document.querySelector('#orbCanvas')?.getContext('2d');
       const originalDrawImage = orbContext?.drawImage;
       const originalRendererClear = state.sandbox.renderer?.clear;
       const originalRendererRender = state.sandbox.renderer?.render;
       let hiddenOrbDrawImageCalls = 0;
       let rendererClearCalls = 0;
       let rendererRenderCalls = 0;
       if (orbContext && typeof originalDrawImage === 'function') {
         orbContext.drawImage = function countedHiddenOrbDrawImage(...args) {
           hiddenOrbDrawImageCalls += 1;
           return originalDrawImage.apply(this, args);
         };
       }
       if (state.sandbox.renderer && typeof originalRendererClear === 'function') {
         state.sandbox.renderer.clear = function countedRendererClear(...args) {
           rendererClearCalls += 1;
           return originalRendererClear.apply(this, args);
         };
       }
       if (state.sandbox.renderer && typeof originalRendererRender === 'function') {
         state.sandbox.renderer.render = function countedRendererRender(...args) {
           rendererRenderCalls += 1;
           return originalRendererRender.apply(this, args);
         };
       }
       const stormAttributeNames = [
         'data-storm-lighting-phase',
         'data-storm-lighting-progress',
         'data-storm-lighting-mode',
         'data-storm-weather-mode',
         'data-storm-thunderstorm-active',
         'data-storm-thunderstorm-source',
         'data-storm-lightning-active',
         'data-storm-lighting-cycle',
       ];
       let stormAttributeMutations = 0;
       const stormAttributeObserver = new MutationObserver((records) => {
         stormAttributeMutations += records.length;
       });
       stormAttributeObserver.observe(document.documentElement, {
         attributes: true,
         attributeFilter: stormAttributeNames,
       });
       await wait(1200);
       stormAttributeObserver.disconnect();
       if (orbContext && typeof originalDrawImage === 'function') orbContext.drawImage = originalDrawImage;
       if (state.sandbox.renderer && typeof originalRendererClear === 'function') state.sandbox.renderer.clear = originalRendererClear;
       if (state.sandbox.renderer && typeof originalRendererRender === 'function') state.sandbox.renderer.render = originalRendererRender;
       const performanceSample = {
         sampleMs: 1200,
         hiddenOrbDrawImageCalls,
         rendererClearCalls,
         rendererRenderCalls,
         redundantClearCalls: Math.max(0, rendererClearCalls - rendererRenderCalls * 2),
         stormAttributeMutations,
       };
       const snapshots = [];
      for (let index = 0; index < 32; index += 1) {
        group?.updateMatrixWorld?.(true);
        state.sandbox.camera?.updateMatrixWorld?.(true);
        snapshots.push({
          groupScale: group ? group.scale.toArray() : [],
          groupPosition: group ? group.position.toArray() : [],
          oceanWorldMatrix: ocean ? ocean.matrixWorld.elements.map((value) => Number(value.toFixed(6))) : [],
          cameraPosition: state.sandbox.camera ? state.sandbox.camera.position.toArray() : [],
          cameraQuaternion: state.sandbox.camera ? state.sandbox.camera.quaternion.toArray() : [],
        });
        await wait(200);
      }
      const stable = snapshots.every((snapshot) => JSON.stringify(snapshot) === JSON.stringify(snapshots[0]));
      return {
        loaded: Boolean(group?.userData?.assetLoaded && ocean),
        failed: Boolean(group?.userData?.assetError),
        hasAssetMixer: Boolean(group?.userData?.assetMixer),
        gridSegments: Number(ocean?.geometry?.userData?.stormOceanGridSegments) || 0,
        vertexCount: Number(ocean?.geometry?.attributes?.position?.count) || 0,
        morphPositionCount: Number(ocean?.geometry?.morphAttributes?.position?.length) || 0,
        morphInfluenceCount: Number(ocean?.morphTargetInfluences?.length) || 0,
        morphDictionaryCount: Object.keys(ocean?.morphTargetDictionary || {}).length,
        materialMorphTargets: materials.map((material) => material?.morphTargets === true),
        materialMorphNormals: materials.map((material) => material?.morphNormals === true),
        frustumCulled: ocean?.frustumCulled !== false,
         cyclesEnvironment: window.FeStormOceanRuntime?.cyclesEnvironmentDiagnostics?.() || {},
         performanceSample,
         transformStable: stable,
        firstSnapshot: snapshots[0] || null,
        lastSnapshot: snapshots.at(-1) || null,
      };
    })()`,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || 'Stability evaluation failed');
  }
  const result = evaluation.result?.value;
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const relevantErrors = browserErrors.filter((message) => /storm|morph|webgl|shader/i.test(message));
  const passed = result?.loaded === true
    && result?.failed === false
    && result?.hasAssetMixer === false
    && result?.gridSegments === 60
    && result?.vertexCount === 3721
    && result?.morphPositionCount === 0
    && result?.morphInfluenceCount === 0
    && result?.morphDictionaryCount === 0
    && result?.materialMorphTargets?.every((value) => value === false)
    && result?.materialMorphNormals?.every((value) => value === false)
    && result?.frustumCulled === false
    && result?.cyclesEnvironment?.ready === true
    && result?.cyclesEnvironment?.failed === false
     && result?.cyclesEnvironment?.resolution?.[0] === 2048
     && result?.cyclesEnvironment?.resolution?.[1] === 1024
     && result?.performanceSample?.hiddenOrbDrawImageCalls === 0
     && result?.performanceSample?.rendererRenderCalls > 0
     && result?.performanceSample?.redundantClearCalls === 0
     && result?.performanceSample?.stormAttributeMutations <= 20
     && result?.transformStable === true
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
  server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}
