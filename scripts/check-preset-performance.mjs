import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webRoot = path.join(root, "web");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = path.join(tmpdir(), `fe-monster-preset-performance-${process.pid}`);
const debugPort = 17000 + (process.pid % 12000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(path.join(webRoot, "index.html"))) throw new Error(`Web client not found: ${webRoot}`);
if (!existsSync(edge)) throw new Error(`Microsoft Edge not found: ${edge}`);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".glb", "model/gltf-binary"],
  [".bin", "application/octet-stream"],
  [".woff2", "font/woff2"]
]);

function apiFixture(pathname) {
  if (pathname === "/api/player/state") return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (pathname === "/api/visual-bridge/state") return { audio: {} };
  if (pathname === "/api/audio/sample") return {};
  if (pathname.includes("/user/playlists")) return { loggedIn: false, playlists: [] };
  if (pathname === "/api/community/state") return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname === "/api/community/listen/state") return { ok: false };
  if (pathname === "/api/community/listening") return { ok: false };
  if (pathname === "/api/sandbox/presets") return { presets: [] };
  if (pathname === "/api/sandbox/components") return { components: [] };
  if (pathname === "/api/app/runtime") return {};
  if (pathname === "/api/login/status") return { loggedIn: false };
  return { ok: false };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith("/components/")
    ? { base: path.join(root, "components"), relative: decoded.slice("/components/".length) }
    : decoded.startsWith("/node_modules/")
      ? { base: path.join(root, "node_modules"), relative: decoded.slice("/node_modules/".length) }
      : { base: webRoot, relative: decoded === "/" ? "index.html" : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return "";
  return candidate;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    const body = Buffer.from(JSON.stringify(apiFixture(url.pathname)));
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
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
    "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
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
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

function metricMap(payload) {
  return Object.fromEntries((payload?.metrics || []).map((metric) => [metric.name, metric.value]));
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
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Performance.enable");
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command("Page.navigate", { url: `${baseUrl}/?qa=preset-performance` });
  await delay(1900);

  const setup = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const poll = async (read, timeout = 15000) => {
      const started = performance.now();
      while (performance.now() - started < timeout) {
        const value = read();
        if (value) return value;
        await wait(100);
      }
      return null;
    };
    const boot = document.querySelector('#bootScreen');
    const bootButton = document.querySelector('#bootLogoButton');
    if (boot && !boot.hidden && bootButton) {
      bootButton.disabled = false;
      bootButton.click();
      await wait(700);
    }
    window.__fePerfLongTasks = [];
    if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      window.__fePerfObserver = new PerformanceObserver((list) => {
        window.__fePerfLongTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })));
      });
      window.__fePerfObserver.observe({ type: 'longtask', buffered: false });
    }
    document.querySelector('#diyButton')?.click();
    await wait(150);
    document.querySelector('#diyPresetButton')?.click();
    await wait(220);
    document.querySelector('#diyFreeCubePreset')?.click();
    const active = await poll(() => window.FeSandboxDiagnostics?.freeCube?.()?.active);
    if (!active) throw new Error('Free cube preset did not start');
    document.querySelector('#diyCloseButton')?.click();
    if (typeof setDiyOpen === 'function') setDiyOpen(false);
    await wait(1000);
    return window.FeSandboxDiagnostics.freeCube();
  })()`);

  const kernelComparison = await evaluate(`(() => {
    const runtime = state.freeCube.runtime;
    if (!runtime) return null;
    const iterations = 90;
    const time = performance.now() / 1000;
    const referenceKernel = (heartMode) => {
      let checksum = 0;
      const blend = heartMode ? 1 : 0;
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (let index = 0; index < runtime.count; index += 1) {
          const offset = index * 3;
          const phase = runtime.phases[index];
          const speed = runtime.speeds[index];
          const driftX = Math.sin(time * speed + phase) * (0.9 + runtime.drift[index] * 1.6);
          const driftY = Math.cos(time * speed * 0.73 + phase * 1.37) * (0.62 + runtime.drift[index]);
          const driftZ = Math.sin(time * speed * 0.41 + phase * 0.83) * (0.5 + runtime.drift[index] * 0.8);
          const freeX = runtime.freePositions[offset] + driftX;
          const freeY = runtime.freePositions[offset + 1] + driftY;
          const freeZ = runtime.freePositions[offset + 2] + driftZ;
          const heartX = runtime.heartPositions[offset];
          const heartY = runtime.heartPositions[offset + 1];
          const heartZ = runtime.heartPositions[offset + 2];
          const length = Math.max(0.001, Math.hypot(heartX, heartY, heartZ));
          const pulse = runtime.pulseWeights[index] * 0.1;
          const targetX = heartX + heartX / length * pulse;
          const targetY = heartY + heartY / length * pulse;
          const targetZ = heartZ + heartZ / length * pulse;
          const x = freeX + (targetX - freeX) * blend;
          const y = freeY + (targetY - freeY) * blend;
          const z = freeZ + (targetZ - freeZ) * blend;
          checksum += x + y * 0.1 + z * 0.01
            + Math.sin(phase * 1.73) * 0.001
            + Math.cos(phase * 1.31) * 0.001
            + Math.sin(phase * 0.91) * 0.001;
        }
      }
      return checksum;
    };
    const optimizedKernel = (heartMode) => {
      let checksum = 0;
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (let index = 0; index < runtime.count; index += 1) {
          const offset = index * 3;
          let x;
          let y;
          let z;
          if (heartMode) {
            const pulse = runtime.pulseWeights[index] * 0.1;
            x = runtime.heartPositions[offset] + runtime.heartDirections[offset] * pulse;
            y = runtime.heartPositions[offset + 1] + runtime.heartDirections[offset + 1] * pulse;
            z = runtime.heartPositions[offset + 2] + runtime.heartDirections[offset + 2] * pulse;
          } else {
            const phase = runtime.phases[index];
            const speed = runtime.speeds[index];
            x = runtime.freePositions[offset]
              + Math.sin(time * speed + phase) * (0.9 + runtime.drift[index] * 1.6);
            y = runtime.freePositions[offset + 1]
              + Math.cos(time * speed * 0.73 + phase * 1.37) * (0.62 + runtime.drift[index]);
            z = runtime.freePositions[offset + 2]
              + Math.sin(time * speed * 0.41 + phase * 0.83) * (0.5 + runtime.drift[index] * 0.8);
          }
          checksum += x + y * 0.1 + z * 0.01
            + runtime.tiltWaveX[index] * 0.001
            + runtime.tiltWaveY[index] * 0.001
            + runtime.tiltWaveZ[index] * 0.001;
        }
      }
      return checksum;
    };
    const measure = (work) => {
      work();
      const startedAt = performance.now();
      const checksum = work();
      return { ms: performance.now() - startedAt, checksum };
    };
    const reference = measure(() => referenceKernel(false) + referenceKernel(true));
    const optimized = measure(() => optimizedKernel(false) + optimizedKernel(true));
    window.__fePerfKernelChecksum = reference.checksum + optimized.checksum;
    return {
      referenceMs: reference.ms,
      optimizedMs: optimized.ms,
      ratio: optimized.ms / Math.max(0.001, reference.ms)
    };
  })()`);

  const metricsBefore = metricMap(await command("Performance.getMetrics"));
  const activeSample = await evaluate(`new Promise((resolve) => {
    const startedAt = performance.now();
    const before = window.FeSandboxDiagnostics.freeCube();
    const orbContext = document.querySelector('#orbCanvas')?.getContext('2d');
    const originalDrawImage = orbContext?.drawImage;
    let hiddenOrbDrawImageCalls = 0;
    if (orbContext && typeof originalDrawImage === 'function') {
      orbContext.drawImage = function countedHiddenOrbDrawImage(...args) {
        hiddenOrbDrawImageCalls += 1;
        return originalDrawImage.apply(this, args);
      };
    }
    let rafFrames = 0;
    const finish = () => {
      const after = window.FeSandboxDiagnostics.freeCube();
      const elapsed = performance.now() - startedAt;
      const tasks = (window.__fePerfLongTasks || []).filter((task) => task.startTime >= startedAt);
      if (orbContext && typeof originalDrawImage === 'function') orbContext.drawImage = originalDrawImage;
      resolve({
        elapsed,
        rafFrames,
        nativeRefresh: playbackPresetsUseNativeRefresh(),
        runtimeFrames: after.frameCount - before.frameCount,
        rafFps: elapsed > 0 ? (rafFrames - 1) * 1000 / elapsed : 0,
        presetFps: elapsed > 0 ? (after.frameCount - before.frameCount) * 1000 / elapsed : 0,
        renderToRafRatio: (after.frameCount - before.frameCount) / Math.max(1, rafFrames - 1),
        longTaskCount: tasks.length,
        longTaskMs: tasks.reduce((total, task) => total + task.duration, 0),
        maxLongTaskMs: tasks.reduce((maximum, task) => Math.max(maximum, task.duration), 0),
        hiddenOrbDrawImageCalls
      });
    };
    const frame = (timestamp) => {
      rafFrames += 1;
      if (timestamp - startedAt >= 2200) finish();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`);
  const metricsAfter = metricMap(await command("Performance.getMetrics"));

  const uiPointerSample = await evaluate(`(async () => {
    const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const sidebar = els.diySidebar;
    const shellClassList = els.appShell?.classList;
    if (!sidebar || !shellClassList) return { available: false };
    const previousDiyCardOpen = state.diyCardOpen;
    const originalBounds = sidebar.getBoundingClientRect.bind(sidebar);
    const originalToggle = shellClassList.toggle.bind(shellClassList);
    let layoutReads = 0;
    let classWrites = 0;
    sidebar.getBoundingClientRect = (...args) => {
      layoutReads += 1;
      return originalBounds(...args);
    };
    shellClassList.toggle = (...args) => {
      classWrites += 1;
      return originalToggle(...args);
    };
    state.diyCardOpen = true;
    try {
      for (let index = 0; index < 120; index += 1) {
        window.dispatchEvent(new PointerEvent('pointermove', {
          clientX: 240 + index,
          clientY: 180 + (index % 30),
          bubbles: true
        }));
      }
      await waitForFrame();
      await waitForFrame();
      return { available: true, layoutReads, classWrites };
    } finally {
      state.diyCardOpen = previousDiyCardOpen;
      sidebar.getBoundingClientRect = originalBounds;
      shellClassList.toggle = originalToggle;
    }
  })()`);

  const lifecycle = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let forcedHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => forcedHidden });
    const originalFetch = window.fetch;
    const hiddenRequests = [];
    const fixture = (url) => {
      if (url.includes('/api/player/state')) return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
      if (url.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
      if (url.includes('/api/community/state')) return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
      return { ok: false };
    };
    window.fetch = async (input, options) => {
      const url = String(input?.url || input || '');
      hiddenRequests.push({ url, method: options?.method || 'GET' });
      return new Response(JSON.stringify(fixture(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const original = {
      profile: state.community.profile,
      activeSession: state.community.activeSession,
      currentSong: state.currentSong,
      playlistsLoading: state.playlistsLoading,
      communityLoading: state.community.loading,
      communityServerUrl: state.community.serverUrl,
      selectedFriendId: state.community.selectedFriendId,
      messageDialogHidden: els.communityMessageDialog?.hidden,
      loginQrKey: state.loginQrKey,
      updateProgressId: state.update.progressId,
      eventSource: window.EventSource
    };
    let eventSourceCreateCount = 0;
    window.EventSource = class PerfEventSource {
      constructor() { eventSourceCreateCount += 1; }
      addEventListener() {}
      close() {}
    };
    state.community.profile = { feId: 'FE-PERF-TEST' };
    state.community.serverUrl = 'http://perf.invalid';
    state.community.activeSession = { id: 'PERF-SESSION', song: { id: 'PERF-SONG' }, members: [] };
    state.community.selectedFriendId = 'FE-PERF-FRIEND';
    state.currentSong = { id: 'PERF-SONG', title: 'Performance fixture' };
    state.playlistsLoading = false;
    state.community.loading = false;
    state.loginQrKey = 'PERF-QR';
    state.update.progressId = 'PERF-UPDATE';
    if (els.communityMessageDialog) els.communityMessageDialog.hidden = false;

    forcedHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    const hiddenBefore = window.FeSandboxDiagnostics.freeCube();
    await wait(180);
    await Promise.allSettled([
      refreshPlayerState(),
      refreshVisualBridge(),
      refreshNativeAudioSample(),
      refreshUserPlaylists(),
      refreshCommunityState(state.activeProvider),
      refreshCommunityListenState(),
      reportCommunityListening(true),
      refreshCommunityMessages(),
      checkLoginQr(),
      pollClientUpdateProgress(),
      loadPlaybackLyrics(state.currentSong)
    ]);
    ensureCommunityEventStream();
    await wait(280);
    const hiddenAfter = window.FeSandboxDiagnostics.freeCube();

    const hiddenNetworkRequests = hiddenRequests.slice();
    const hiddenEventSourceCount = eventSourceCreateCount;
    hiddenRequests.length = 0;
    forcedHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    const resumedBefore = window.FeSandboxDiagnostics.freeCube();
    await wait(520);
    const resumedAfter = window.FeSandboxDiagnostics.freeCube();
    const resumedEventSourceCount = eventSourceCreateCount - hiddenEventSourceCount;

    window.fetch = originalFetch;
    state.community.profile = original.profile;
    state.community.activeSession = original.activeSession;
    state.currentSong = original.currentSong;
    state.playlistsLoading = original.playlistsLoading;
    state.community.loading = original.communityLoading;
    stopCommunityEventStream(false);
    window.EventSource = original.eventSource;
    state.community.serverUrl = original.communityServerUrl;
    state.community.selectedFriendId = original.selectedFriendId;
    if (els.communityMessageDialog) els.communityMessageDialog.hidden = original.messageDialogHidden;
    state.loginQrKey = original.loginQrKey;
    state.update.progressId = original.updateProgressId;
    setDiyPreset('lyric');
    await wait(260);
    const inactive = window.FeSandboxDiagnostics.freeCube();
    return {
      hiddenFrameDelta: (hiddenAfter.frameCount || 0) - (hiddenBefore.frameCount || 0),
      hiddenNetworkRequests,
      hiddenEventSourceCount,
      resumedFrameDelta: (resumedAfter.frameCount || 0) - (resumedBefore.frameCount || 0),
      resumedEventSourceCount,
      inactive
    };
  })()`);

  const dynamicCubeRefresh = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    enterPresetPlaybackPage('cube');
    requestOrbFrame();
    const startedWaitingAt = performance.now();
    while (!state.dynamicCube?.renderer && performance.now() - startedWaitingAt < 8000) {
      await wait(80);
    }
    const cube = state.dynamicCube;
    if (!cube?.renderer) throw new Error('Dynamic cube renderer did not start');
    const originalRender = cube.renderer.render.bind(cube.renderer);
    const originalGetBoundingClientRect = els.dynamicCubeCore.getBoundingClientRect.bind(els.dynamicCubeCore);
    let renderFrames = 0;
    let rafFrames = 0;
    let layoutReads = 0;
    let probing = true;
    cube.renderer.render = (...args) => {
      renderFrames += 1;
      return originalRender(...args);
    };
    els.dynamicCubeCore.getBoundingClientRect = (...args) => {
      layoutReads += 1;
      return originalGetBoundingClientRect(...args);
    };
    const probe = () => {
      rafFrames += 1;
      if (probing) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    const startedAt = performance.now();
    await wait(900);
    const elapsed = performance.now() - startedAt;
    probing = false;
    cube.renderer.render = originalRender;
    els.dynamicCubeCore.getBoundingClientRect = originalGetBoundingClientRect;
    setDiyPreset('lyric');
    return {
      renderFps: renderFrames * 1000 / elapsed,
      rafFps: Math.max(0, rafFrames - 1) * 1000 / elapsed,
      renderToRafRatio: renderFrames / Math.max(1, rafFrames - 1),
      layoutReads
    };
  })()`);

  const voidCanvasBypass = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const canvas = els.canvas;
    const context = canvas.getContext('2d');
    const originalDrawImage = context.drawImage;
    const originalGetBoundingClientRect = canvas.getBoundingClientRect;
    let drawImageCalls = 0;
    let layoutReads = 0;
    context.drawImage = function (...args) {
      drawImageCalls += 1;
      return originalDrawImage.apply(this, args);
    };
    canvas.getBoundingClientRect = function (...args) {
      layoutReads += 1;
      return originalGetBoundingClientRect.apply(this, args);
    };
    enterPresetPlaybackPage('void-prism');
    requestOrbFrame();
    const startedWaitingAt = performance.now();
    while (!state.voidPrism?.runtime && performance.now() - startedWaitingAt < 8000) {
      await wait(80);
    }
    if (!state.voidPrism?.runtime) throw new Error('Void prism runtime did not start');
    await wait(180);
    drawImageCalls = 0;
    layoutReads = 0;
    const before = window.FeSandboxDiagnostics.voidPrism();
    await wait(600);
    const after = window.FeSandboxDiagnostics.voidPrism();
    context.drawImage = originalDrawImage;
    canvas.getBoundingClientRect = originalGetBoundingClientRect;
    setDiyPreset('lyric');
    return {
      drawImageCalls,
      layoutReads,
      runtimeFrameDelta: (after.frameCount || 0) - (before.frameCount || 0)
    };
  })()`);

  const wallpaperCanvasBypass = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const canvas = els.canvas;
    const context = canvas.getContext('2d');
    const originalDrawImage = context.drawImage;
    const originalGetBoundingClientRect = canvas.getBoundingClientRect;
    const originalUpdatePlaybackSceneMotion = updatePlaybackSceneMotion;
    let drawImageCalls = 0;
    let layoutReads = 0;
    let motionUpdates = 0;
    context.drawImage = function (...args) {
      drawImageCalls += 1;
      return originalDrawImage.apply(this, args);
    };
    canvas.getBoundingClientRect = function (...args) {
      layoutReads += 1;
      return originalGetBoundingClientRect.apply(this, args);
    };
    updatePlaybackSceneMotion = function (...args) {
      motionUpdates += 1;
      return originalUpdatePlaybackSceneMotion(...args);
    };
    enterPresetPlaybackPage('wallpaper');
    requestOrbFrame();
    await wait(180);
    drawImageCalls = 0;
    layoutReads = 0;
    motionUpdates = 0;
    await wait(500);
    const canvasOpacity = getComputedStyle(canvas).opacity;
    context.drawImage = originalDrawImage;
    canvas.getBoundingClientRect = originalGetBoundingClientRect;
    updatePlaybackSceneMotion = originalUpdatePlaybackSceneMotion;
    setDiyPreset('lyric');
    return { drawImageCalls, layoutReads, motionUpdates, canvasOpacity };
  })()`);

  const sonicRefresh = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    enterPresetPlaybackPage('topography');
    requestOrbFrame();
    const startedWaitingAt = performance.now();
    while (!state.sonicTopography?.renderer && performance.now() - startedWaitingAt < 8000) {
      await wait(80);
    }
    const topo = state.sonicTopography;
    if (!topo?.renderer) throw new Error('Sonic renderer did not start');
    const originalRender = topo.renderer.render.bind(topo.renderer);
    const originalSetRenderTarget = topo.renderer.setRenderTarget.bind(topo.renderer);
    const originalGetBoundingClientRect = els.sonicTopographyCore.getBoundingClientRect.bind(els.sonicTopographyCore);
    const originalSceneStyleSetProperty = els.sonicTopographyScene.style.setProperty.bind(els.sonicTopographyScene.style);
    const playbackStyles = [els.playbackLyricScene?.style, els.coverParticleScene?.style].filter(Boolean);
    const originalPlaybackStyleSetProperties = playbackStyles.map((style) => style.setProperty);
    const originalUpdateAudioSpectrum = updateAudioSpectrum;
    let renderFrames = 0;
    let rafFrames = 0;
    let spectrumSamples = 0;
    let renderTargetSwitches = 0;
    let layoutReads = 0;
    let sceneStyleWrites = 0;
    let playbackStyleWrites = 0;
    let probing = true;
    topo.renderer.render = (...args) => {
      renderFrames += 1;
      return originalRender(...args);
    };
    topo.renderer.setRenderTarget = (...args) => {
      renderTargetSwitches += 1;
      return originalSetRenderTarget(...args);
    };
    els.sonicTopographyCore.getBoundingClientRect = (...args) => {
      layoutReads += 1;
      return originalGetBoundingClientRect(...args);
    };
    els.sonicTopographyScene.style.setProperty = (...args) => {
      sceneStyleWrites += 1;
      return originalSceneStyleSetProperty(...args);
    };
    playbackStyles.forEach((style, index) => {
      style.setProperty = function (...args) {
        playbackStyleWrites += 1;
        return originalPlaybackStyleSetProperties[index].apply(this, args);
      };
    });
    updateAudioSpectrum = (...args) => {
      spectrumSamples += 1;
      return originalUpdateAudioSpectrum(...args);
    };
    const meteorMatrixVersionBefore = topo.meteorMesh.instanceMatrix.version;
    const particleMatrixVersionBefore = topo.particleMesh.instanceMatrix.version;
    const probe = () => {
      rafFrames += 1;
      if (probing) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    const startedAt = performance.now();
    await wait(600);
    playbackStyleWrites = 0;
    await wait(1000);
    const elapsed = performance.now() - startedAt;
    probing = false;
    const idleMeteorMatrixUploadDelta = topo.meteorMesh.instanceMatrix.version - meteorMatrixVersionBefore;
    const idleParticleMatrixUploadDelta = topo.particleMesh.instanceMatrix.version - particleMatrixVersionBefore;
    const activeMeteorVersionBefore = topo.meteorMesh.instanceMatrix.version;
    const activeParticleVersionBefore = topo.particleMesh.instanceMatrix.version;
    spawnSonicTopographyMeteor(0.9);
    spawnSonicTopographyParticle(1, 1, 1, 0.5);
    const activeMeteor = topo.meteors.find((meteor) => meteor.active);
    const activeParticle = topo.particles.find((particle) => particle.active);
    const meteorYBefore = activeMeteor?.y;
    const particleYBefore = activeParticle?.y;
    updateSonicTopographyProjectiles(1 / 60);
    const activeProjectilesAdvance = topo.meteorMesh.instanceMatrix.version > activeMeteorVersionBefore
      && topo.particleMesh.instanceMatrix.version > activeParticleVersionBefore
      && activeMeteor?.y < meteorYBefore
      && activeParticle?.y > particleYBefore;
    resetSonicTopographyAudioMotion(topo);
    updateSonicTopographyProjectiles(1 / 60);
    const clearedMeteorVersion = topo.meteorMesh.instanceMatrix.version;
    const clearedParticleVersion = topo.particleMesh.instanceMatrix.version;
    updateSonicTopographyProjectiles(1 / 60);
    const inactiveProjectilesStayFrozen = topo.projectilesActive === false
      && topo.meteorMesh.instanceMatrix.version === clearedMeteorVersion
      && topo.particleMesh.instanceMatrix.version === clearedParticleVersion;
    const originalPlaybackClockRunning = isPlaybackClockRunning;
    const originalAnalysisLive = state.audioAnalysis.live;
    const visualAudioKeys = ['lowFrequencyAmplitude', 'subBass', 'bass', 'lowMid', 'energy', 'beat'];
    const originalVisualAudio = Object.fromEntries(
      visualAudioKeys.map((key) => [key, state.visual[key]])
    );
    const originalVisualLowFrequencyBands = state.visual.lowFrequencyBands;
    const originalVisualLowFrequencyBandValues = originalVisualLowFrequencyBands
      ? Array.from(originalVisualLowFrequencyBands)
      : null;
    const visualHasLowFrequencyBandsVersion = Object.prototype.hasOwnProperty.call(
      state.visual,
      'lowFrequencyBandsVersion'
    );
    const originalVisualLowFrequencyBandsVersion = state.visual.lowFrequencyBandsVersion;
    const originalFrameLowFrequencyBands = topo.frameAudio?.lowFrequencyBands;
    const originalFrameLowFrequencyBandValues = originalFrameLowFrequencyBands
      ? Array.from(originalFrameLowFrequencyBands)
      : null;
    const originalFrameLowFrequencyBandTargets = topo.frameAudio?.lowFrequencyBandTargets;
    const originalFrameLowFrequencyBandTargetValues = originalFrameLowFrequencyBandTargets
      ? Array.from(originalFrameLowFrequencyBandTargets)
      : null;
    const originalSonicLastMotionAt = topo.lastMotionAt;
    const originalSonicLastRenderAt = topo.lastRenderAt;
    const originalFrameAudio = Object.fromEntries(
      Object.entries(topo.frameAudio || {})
        .filter(([, value]) => typeof value === 'number')
    );
    const lowFrequencySpectrumTexture = topo.uniforms.uLowFrequencySpectrum?.value
      || topo.material.uniforms?.uLowFrequencySpectrum?.value
      || null;
    const lowFrequencySpectrumData = topo.material.userData?.lowFrequencySpectrumData
      || lowFrequencySpectrumTexture?.image?.data
      || null;
    const originalSpectrumBytes = lowFrequencySpectrumData
      ? Uint8Array.from(lowFrequencySpectrumData)
      : null;
    const originalUniformAudio = Object.fromEntries(
      Object.entries(topo.uniforms)
        .filter(([, uniform]) => typeof uniform?.value === 'number')
        .map(([key, uniform]) => [key, uniform.value])
    );
    const quietLowFrequencyBands = new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT);
    quietLowFrequencyBands[41] = 0.24;
    quietLowFrequencyBands[410] = 0.08;
    const activeLowFrequencyBands = new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT);
    activeLowFrequencyBands[41] = 0.82;
    activeLowFrequencyBands[410] = 0.44;
    activeLowFrequencyBands[511] = 1;
    const setVisualLowFrequencyBands = (bands) => {
      state.visual.lowFrequencyBands = bands;
      if (visualHasLowFrequencyBandsVersion) {
        state.visual.lowFrequencyBandsVersion = (Number(state.visual.lowFrequencyBandsVersion) || 0) + 1;
      }
    };
    const readSpectrumSamples = () => lowFrequencySpectrumData
      ? [
          lowFrequencySpectrumData[41],
          lowFrequencySpectrumData[250],
          lowFrequencySpectrumData[410],
          lowFrequencySpectrumData[511]
        ]
      : [];
    const lowFrequencyTransition = {};
    try {
      state.audioAnalysis.live = false;
      setVisualLowFrequencyBands(quietLowFrequencyBands);
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0.18,
        subBass: 0.16,
        bass: 0.12,
        lowMid: 0.08,
        energy: 0.12,
        beat: 0.06
      });
      isPlaybackClockRunning = () => true;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
      lowFrequencyTransition.quietAmplitude = topo.uniforms.uLowFrequencyAmplitude.value;
      lowFrequencyTransition.quietSpectrumSamples = readSpectrumSamples();
      if (topo.frameAudio?.lowFrequencyBands) topo.frameAudio.lowFrequencyBands.fill(0);
      if (topo.frameAudio?.lowFrequencyBandTargets) topo.frameAudio.lowFrequencyBandTargets.fill(0);
      if (topo.frameAudio) {
        topo.frameAudio.lowFrequencyAmplitude = 0;
        topo.frameAudio.subBass = 0;
        topo.frameAudio.bass = 0;
        topo.frameAudio.lowMid = 0;
      }
      if (lowFrequencySpectrumData) lowFrequencySpectrumData.fill(0);
      setVisualLowFrequencyBands(activeLowFrequencyBands);
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0.86,
        subBass: 0.8,
        bass: 0.72,
        lowMid: 0.36,
        energy: 0.68,
        beat: 0.52
      });
      lowFrequencyTransition.riseSpectrum = [];
      lowFrequencyTransition.riseAmplitude = [];
      for (let frame = 0; frame < 24; frame += 1) {
        topo.lastMotionAt = performance.now() - 16;
        topo.lastRenderAt = 0;
        updateSonicTopographyMotion();
        lowFrequencyTransition.riseSpectrum.push(lowFrequencySpectrumData?.[511] || 0);
        lowFrequencyTransition.riseAmplitude.push(topo.uniforms.uLowFrequencyAmplitude.value);
      }
      lowFrequencyTransition.activeAmplitude = topo.uniforms.uLowFrequencyAmplitude.value;
      lowFrequencyTransition.activeSubBass = topo.uniforms.uSubBass.value;
      lowFrequencyTransition.activeBass = topo.uniforms.uBass.value;
      lowFrequencyTransition.activeLowMid = topo.uniforms.uLowMid.value;
      lowFrequencyTransition.activeSpectrumSamples = readSpectrumSamples();
      setVisualLowFrequencyBands(new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT));
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0,
        subBass: 0,
        bass: 0,
        lowMid: 0,
        energy: 0,
        beat: 0
      });
      lowFrequencyTransition.releaseSpectrum = [];
      lowFrequencyTransition.releaseAmplitude = [];
      for (let frame = 0; frame < 12; frame += 1) {
        topo.lastMotionAt = performance.now() - 16;
        topo.lastRenderAt = 0;
        updateSonicTopographyMotion();
        lowFrequencyTransition.releaseSpectrum.push(lowFrequencySpectrumData?.[511] || 0);
        lowFrequencyTransition.releaseAmplitude.push(topo.uniforms.uLowFrequencyAmplitude.value);
      }
      isPlaybackClockRunning = () => false;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
      lowFrequencyTransition.pausedAmplitude = topo.uniforms.uLowFrequencyAmplitude.value;
      lowFrequencyTransition.pausedSubBass = topo.uniforms.uSubBass.value;
      lowFrequencyTransition.pausedBass = topo.uniforms.uBass.value;
      lowFrequencyTransition.pausedLowMid = topo.uniforms.uLowMid.value;
      lowFrequencyTransition.pausedSpectrumZero = !!lowFrequencySpectrumData
        && lowFrequencySpectrumData.length === SONIC_LOW_FREQUENCY_BAND_COUNT
        && Array.from(lowFrequencySpectrumData).every((value) => value === 0);
    } finally {
      isPlaybackClockRunning = originalPlaybackClockRunning;
      state.audioAnalysis.live = originalAnalysisLive;
      Object.assign(state.visual, originalVisualAudio);
      state.visual.lowFrequencyBands = originalVisualLowFrequencyBands;
      if (typeof originalVisualLowFrequencyBands?.set === 'function' && originalVisualLowFrequencyBandValues) {
        originalVisualLowFrequencyBands.set(originalVisualLowFrequencyBandValues);
      }
      if (visualHasLowFrequencyBandsVersion) {
        state.visual.lowFrequencyBandsVersion = originalVisualLowFrequencyBandsVersion;
      } else {
        delete state.visual.lowFrequencyBandsVersion;
      }
      if (topo.frameAudio) {
        Object.assign(topo.frameAudio, originalFrameAudio);
        if (originalFrameLowFrequencyBands) {
          topo.frameAudio.lowFrequencyBands = originalFrameLowFrequencyBands;
          if (typeof originalFrameLowFrequencyBands.set === 'function') {
            originalFrameLowFrequencyBands.set(originalFrameLowFrequencyBandValues);
          }
        }
        if (originalFrameLowFrequencyBandTargets) {
          topo.frameAudio.lowFrequencyBandTargets = originalFrameLowFrequencyBandTargets;
          if (typeof originalFrameLowFrequencyBandTargets.set === 'function') {
            originalFrameLowFrequencyBandTargets.set(originalFrameLowFrequencyBandTargetValues);
          }
        } else {
          delete topo.frameAudio.lowFrequencyBandTargets;
        }
      }
      topo.lastMotionAt = originalSonicLastMotionAt;
      topo.lastRenderAt = originalSonicLastRenderAt;
      Object.entries(originalUniformAudio).forEach(([key, value]) => {
        topo.uniforms[key].value = value;
      });
      if (lowFrequencySpectrumData && originalSpectrumBytes) {
        lowFrequencySpectrumData.set(originalSpectrumBytes);
        if (lowFrequencySpectrumTexture) lowFrequencySpectrumTexture.needsUpdate = true;
      }
    }
    const terrainMatrix = new window.THREE.Matrix4();
    const terrainPosition = new window.THREE.Vector3();
    const bassColumnCluster = SONIC_BASS_COLUMN_CLUSTER;
    const bassColumnRadius = Number(bassColumnCluster.radius) || 0;
    const bassColumnBandAttribute = topo.terrain.geometry.getAttribute('aBassColumnBand');
    const bassColumnPositions = [];
    const bassColumnBandIndices = [];
    for (let index = 0; index < topo.terrain.count; index += 1) {
      topo.terrain.getMatrixAt(index, terrainMatrix);
      terrainPosition.setFromMatrixPosition(terrainMatrix);
      const gridX = terrainPosition.x / SONIC_TOPOGRAPHY_SPACING;
      const gridZ = terrainPosition.z / SONIC_TOPOGRAPHY_SPACING;
      const xDistance = gridX - bassColumnCluster.center;
      const zDistance = gridZ - bassColumnCluster.center;
      if (bassColumnRadius > 0 && xDistance * xDistance + zDistance * zDistance <= bassColumnRadius ** 2 + 0.001) {
        bassColumnPositions.push([
          Number(terrainPosition.x.toFixed(2)),
          Number(terrainPosition.z.toFixed(2))
        ]);
        if (bassColumnBandAttribute) bassColumnBandIndices.push(Math.round(bassColumnBandAttribute.getX(index)));
      }
    }
    const sonicVertexShader = String(topo.material.vertexShader || '');
    const sonicMotionSource = String(updateSonicTopographyMotion);
    const sonicBuildSource = String(buildSonicTopography);
    const uniqueColumnX = [...new Set(bassColumnPositions.map((position) => position[0]))].sort((a, b) => a - b);
    const uniqueColumnZ = [...new Set(bassColumnPositions.map((position) => position[1]))].sort((a, b) => a - b);
    const centerColumns = bassColumnPositions.filter(([x, z]) => Math.abs(x) < 0.01 && Math.abs(z) < 0.01);
    const positionsAreContiguous = (positions) => positions.length === bassColumnRadius * 2 + 1
      && positions.slice(1).every((position, index) => (
        Math.abs(position - positions[index] - SONIC_TOPOGRAPHY_SPACING) < 0.01
    ));
    const positionKey = (x, z) => String(x) + ',' + String(z);
    const positionKeys = new Set(bassColumnPositions.map(([x, z]) => positionKey(x, z)));
    const circularlySymmetric = bassColumnPositions.every(([x, z]) => (
      positionKeys.has(positionKey(-x, z))
        && positionKeys.has(positionKey(x, -z))
        && positionKeys.has(positionKey(z, x))
    ));
    const maxCoreRadiusSquared = bassColumnPositions.reduce((maximum, [x, z]) => Math.max(
      maximum,
      (x / SONIC_TOPOGRAPHY_SPACING) ** 2 + (z / SONIC_TOPOGRAPHY_SPACING) ** 2
    ), 0);
    const uniqueBandIndices = [...new Set(bassColumnBandIndices)].sort((a, b) => a - b);
    const transitionStart = bassColumnRadius;
    const transitionEnd = transitionStart + bassColumnCluster.feather;
    const transitionSamples = Array.from({ length: bassColumnCluster.feather + 2 }, (_, index) => {
      const distance = transitionStart
        + (transitionEnd - transitionStart) * index / (bassColumnCluster.feather + 1);
      const normalized = clamp((distance - transitionStart) / (transitionEnd - transitionStart), 0, 1);
      return 1 - normalized * normalized * (3 - 2 * normalized);
    });
    const bassColumns = {
      count: bassColumnPositions.length,
      uniqueX: uniqueColumnX.length,
      uniqueZ: uniqueColumnZ.length,
      oddCenteredCore: bassColumnCluster.count % 2 === 1
        && bassColumnCluster.center === 0
        && centerColumns.length === 1
        && Math.abs(uniqueColumnX[0] + uniqueColumnX.at(-1)) < 0.01
        && Math.abs(uniqueColumnZ[0] + uniqueColumnZ.at(-1)) < 0.01,
      circularCore: bassColumnRadius === 18
        && circularlySymmetric
        && Math.abs(maxCoreRadiusSquared - 324) < 0.01
        && positionKeys.has(positionKey(18 * SONIC_TOPOGRAPHY_SPACING, 0))
        && !positionKeys.has(positionKey(18 * SONIC_TOPOGRAPHY_SPACING, SONIC_TOPOGRAPHY_SPACING)),
      clusteredContiguously: positionsAreContiguous(uniqueColumnX)
        && positionsAreContiguous(uniqueColumnZ),
      reusesTerrain: topo.group.children.length === 3
        && topo.group.children.filter((child) => child.isInstancedMesh).length === 3,
      shaderSelectsCluster: sonicVertexShader.includes('bassColumnGrid - vec2(0.0)')
        && /dot\\s*\\(\\s*bassColumnDelta\\s*,\\s*bassColumnDelta\\s*\\)/.test(sonicVertexShader)
        && /step\\s*\\(\\s*324\\.5\\s*,\\s*bassColumnRadiusSquared\\s*\\)/.test(sonicVertexShader),
      frequencyBandContract: SONIC_LOW_FREQUENCY_BAND_COUNT === 512
        && typeof SONIC_LOW_FREQUENCY_MIN_HZ !== 'undefined'
        && typeof SONIC_LOW_FREQUENCY_MAX_HZ !== 'undefined'
        && SONIC_LOW_FREQUENCY_MIN_HZ === 20
        && SONIC_LOW_FREQUENCY_MAX_HZ === 150,
      spectrumTexture: {
        isDataTexture: lowFrequencySpectrumTexture?.isDataTexture === true,
        width: lowFrequencySpectrumTexture?.image?.width || 0,
        height: lowFrequencySpectrumTexture?.image?.height || 0,
        bytes: lowFrequencySpectrumData?.length || 0,
        followsVisualBands: lowFrequencyTransition.quietSpectrumSamples?.length === 4
          && lowFrequencyTransition.activeSpectrumSamples?.length === 4
          && lowFrequencyTransition.activeSpectrumSamples[0] >= 205
          && lowFrequencyTransition.activeSpectrumSamples[1] === 0
          && lowFrequencyTransition.activeSpectrumSamples[2] >= 110
          && lowFrequencyTransition.activeSpectrumSamples[3] >= 245,
        pausedZero: lowFrequencyTransition.pausedSpectrumZero === true
      },
      silkyRise: lowFrequencyTransition.riseSpectrum?.length === 24
        && lowFrequencyTransition.riseSpectrum[0] > 0
        && lowFrequencyTransition.riseSpectrum[0] < 255
        && new Set(lowFrequencyTransition.riseSpectrum).size >= 8
        && lowFrequencyTransition.riseSpectrum.slice(1).every((value, index) => (
          value >= lowFrequencyTransition.riseSpectrum[index]
        ))
        && lowFrequencyTransition.riseSpectrum.at(-1) >= 245
        && lowFrequencyTransition.riseAmplitude?.length === 24
        && lowFrequencyTransition.riseAmplitude[0] > 0
        && lowFrequencyTransition.riseAmplitude[0] < 0.86
        && lowFrequencyTransition.riseAmplitude.slice(1).every((value, index) => (
          value >= lowFrequencyTransition.riseAmplitude[index]
        ))
        && lowFrequencyTransition.riseAmplitude.at(-1) >= 0.82,
      silkyRelease: lowFrequencyTransition.releaseSpectrum?.length === 12
        && lowFrequencyTransition.releaseSpectrum[0] > 0
        && lowFrequencyTransition.releaseSpectrum[0] < lowFrequencyTransition.riseSpectrum.at(-1)
        && new Set(lowFrequencyTransition.releaseSpectrum).size >= 8
        && lowFrequencyTransition.releaseSpectrum.slice(1).every((value, index) => (
          value <= lowFrequencyTransition.releaseSpectrum[index]
        ))
        && lowFrequencyTransition.releaseSpectrum.at(-1) > 0
        && lowFrequencyTransition.releaseAmplitude?.length === 12
        && lowFrequencyTransition.releaseAmplitude[0] > 0
        && lowFrequencyTransition.releaseAmplitude[0] < lowFrequencyTransition.riseAmplitude.at(-1)
        && lowFrequencyTransition.releaseAmplitude.slice(1).every((value, index) => (
          value <= lowFrequencyTransition.releaseAmplitude[index]
        ))
        && lowFrequencyTransition.releaseAmplitude.at(-1) > 0,
      shaderSamples512Bands: /uniform\\s+sampler2D\\s+uLowFrequencySpectrum\\s*;/.test(sonicVertexShader)
        && /texture2D\\s*\\(\\s*uLowFrequencySpectrum/.test(sonicVertexShader)
        && /attribute\\s+float\\s+aBassColumnBand\\s*;/.test(sonicVertexShader)
        && sonicBuildSource.includes('SONIC_LOW_FREQUENCY_BAND_COUNT')
        && bassColumnBandAttribute?.isInstancedBufferAttribute === true
        && bassColumnBandIndices.length === bassColumnCluster.count
        && uniqueBandIndices.length === SONIC_LOW_FREQUENCY_BAND_COUNT
        && uniqueBandIndices[0] === 0
        && uniqueBandIndices.at(-1) === SONIC_LOW_FREQUENCY_BAND_COUNT - 1,
      centerUsesAggregateAmplitude: /bassColumnCenterMask[\\s\\S]{0,800}uLowFrequencyAmplitude/.test(sonicVertexShader),
      transitionSamples,
      transitionsIntoRelief: sonicVertexShader.includes('float bassColumnRadius = sqrt(bassColumnRadiusSquared)')
        && sonicVertexShader.includes('float bassColumnTransition = 1.0 - smoothstep(')
        && sonicVertexShader.includes('float bassColumnBlend = max(bassColumnCoreMask, bassColumnTransition)')
        && bassColumnCluster.feather === 6
        && Math.abs(transitionEnd - transitionStart - 6) < 0.001
        && transitionSamples[0] === 1
        && transitionSamples.at(-1) === 0
        && transitionSamples.slice(1).every((value, index) => value < transitionSamples[index]),
      amplitudeDriven: sonicVertexShader.includes('float bassColumnLift')
        && sonicMotionSource.includes('uniforms.uLowFrequencyAmplitude.value = audio.lowFrequencyAmplitude')
        && lowFrequencyTransition.activeAmplitude >= 0.82
        && lowFrequencyTransition.activeAmplitude > lowFrequencyTransition.riseAmplitude[0] * 4
        && lowFrequencyTransition.pausedAmplitude === 0,
      contributesToTerrain: sonicVertexShader.includes('float bassColumnLift')
        && sonicVertexShader.includes('float audioElevation = bassColumnLift + subLift'),
      playbackClockGated: sonicMotionSource.includes('const audioDriving = isPlaybackClockRunning()'),
      activeLowFrequencyReachedUniforms: lowFrequencyTransition.activeSubBass >= 0.85
        && lowFrequencyTransition.activeBass >= 0.71
        && lowFrequencyTransition.activeLowMid >= 0.35,
      pausedUniformsZero: lowFrequencyTransition.pausedSubBass === 0
        && lowFrequencyTransition.pausedBass === 0
        && lowFrequencyTransition.pausedAmplitude === 0
        && lowFrequencyTransition.pausedLowMid === 0
    };
    topo.renderer.render = originalRender;
    topo.renderer.setRenderTarget = originalSetRenderTarget;
    els.sonicTopographyCore.getBoundingClientRect = originalGetBoundingClientRect;
    els.sonicTopographyScene.style.setProperty = originalSceneStyleSetProperty;
    playbackStyles.forEach((style, index) => {
      style.setProperty = originalPlaybackStyleSetProperties[index];
    });
    updateAudioSpectrum = originalUpdateAudioSpectrum;
    const sonicPanel = document.querySelector('#sonicPresetControls');
    const sonicControlElements = {
      coreColor: document.querySelector('#sonicCoreColorInput'),
      outerColor: document.querySelector('#sonicOuterColorInput'),
      brightness: document.querySelector('#sonicBrightnessRange'),
      exposure: document.querySelector('#sonicExposureRange'),
      columnHeight: document.querySelector('#sonicColumnHeightRange'),
      fieldOfView: document.querySelector('#sonicFovRange'),
      smoothing: document.querySelector('#sonicSmoothingRange')
    };
    const sonicSettingsStorageKey = typeof SONIC_SETTINGS_PREFS_KEY === 'string'
      ? SONIC_SETTINGS_PREFS_KEY
      : '';
    const sonicSettingsLoadSource = typeof loadSonicSettingsPreferences === 'function'
      ? String(loadSonicSettingsPreferences)
      : '';
    const sonicSettingsSaveSource = typeof saveSonicSettingsPreferences === 'function'
      ? String(saveSonicSettingsPreferences)
      : '';
    const sonicSettingsApplySource = typeof applySonicTopographySettings === 'function'
      ? String(applySonicTopographySettings)
      : '';
    const sonicCameraRadius = Math.hypot(
      Number(topo.camera.position.x) || 0,
      Number(topo.camera.position.y) || 0,
      Number(topo.camera.position.z) || 0
    );
    const sonicCamera = {
      constantFov: Number(SONIC_TOPOGRAPHY_CAMERA.fov) || 0,
      runtimeFov: Number(topo.camera.fov) || 0,
      radius: sonicCameraRadius,
      visibleHalfSpan: Math.tan((Number(topo.camera.fov) || 0) * Math.PI / 360) * sonicCameraRadius
    };
    const sonicControls = {
      panelVisibleInTopography: !!sonicPanel && sonicPanel.hidden === false,
      complete: Object.values(sonicControlElements).every(Boolean),
      inputTypes: {
        coreColor: sonicControlElements.coreColor?.type || '',
        outerColor: sonicControlElements.outerColor?.type || '',
        brightness: sonicControlElements.brightness?.type || '',
        exposure: sonicControlElements.exposure?.type || '',
        columnHeight: sonicControlElements.columnHeight?.type || '',
        fieldOfView: sonicControlElements.fieldOfView?.type || '',
        smoothing: sonicControlElements.smoothing?.type || ''
      },
      defaultFov: Number(sonicControlElements.fieldOfView?.value) || 0,
      persistenceKey: sonicSettingsStorageKey,
      loadsPreferences: sonicSettingsLoadSource.includes('localStorage.getItem(SONIC_SETTINGS_PREFS_KEY)'),
      savesPreferences: /localStorage\\.setItem\\(\\s*SONIC_SETTINGS_PREFS_KEY\\s*,/.test(sonicSettingsSaveSource),
      appliesSettings: sonicSettingsApplySource.length > 0,
      shaderUniforms: {
        coreColor: !!topo.uniforms.uCoreColumnColor
          && /uniform\\s+vec3\\s+uCoreColumnColor\\s*;/.test(String(topo.material.fragmentShader || '')),
        outerColor: !!topo.uniforms.uOuterColumnColor
          && /uniform\\s+vec3\\s+uOuterColumnColor\\s*;/.test(String(topo.material.fragmentShader || '')),
        brightness: !!topo.uniforms.uSonicBrightness
          && /uniform\\s+float\\s+uSonicBrightness\\s*;/.test(String(topo.material.fragmentShader || '')),
        exposure: !!topo.uniforms.uSonicExposure
          && /uniform\\s+float\\s+uSonicExposure\\s*;/.test(String(topo.material.fragmentShader || '')),
        columnHeight: !!topo.uniforms.uColumnHeightScale
          && /uniform\\s+float\\s+uColumnHeightScale\\s*;/.test(sonicVertexShader)
          && /bassColumnLift[\\s\\S]{0,240}uColumnHeightScale|uColumnHeightScale[\\s\\S]{0,240}bassColumnLift/.test(sonicVertexShader)
      },
      smoothingAffectsEnvelope: /SONIC_BASS_COLUMN_ATTACK_SECONDS[\\s\\S]{0,320}smoothing|smoothing[\\s\\S]{0,320}SONIC_BASS_COLUMN_ATTACK_SECONDS/.test(sonicMotionSource)
        && /SONIC_BASS_COLUMN_RELEASE_SECONDS[\\s\\S]{0,320}smoothing|smoothing[\\s\\S]{0,320}SONIC_BASS_COLUMN_RELEASE_SECONDS/.test(sonicMotionSource)
    };
    const nativeRefresh = playbackPresetsUseNativeRefresh();
    setDiyPreset('lyric');
    sonicControls.panelHiddenOutsideTopography = !!sonicPanel && sonicPanel.hidden === true;
    const lyricNativeRefresh = playbackPresetsUseNativeRefresh();
    const sandboxInterval = sandboxFrameInterval();
    const coverParticleFpsLimit = coverParticleEngineOptions().fpsLimit;
    returnHomePage();
    return {
      nativeRefresh,
      lyricNativeRefresh,
      homeNativeRefresh: playbackPresetsUseNativeRefresh(),
      sandboxInterval,
      coverParticleFpsLimit,
      renderTier: RENDER_PROFILE.tier,
      grid: RENDER_PROFILE.topographyGrid,
      instanceCount: topo.count,
      renderFps: renderFrames * 1000 / elapsed,
      rafFps: Math.max(0, rafFrames - 1) * 1000 / elapsed,
      spectrumFps: spectrumSamples * 1000 / elapsed,
      renderToRafRatio: renderFrames / Math.max(1, rafFrames - 1),
      renderTargetSwitches,
      layoutReads,
      sceneStyleWrites,
      playbackStyleWrites,
      meteorMatrixUploadDelta: idleMeteorMatrixUploadDelta,
      particleMatrixUploadDelta: idleParticleMatrixUploadDelta,
      activeProjectilesAdvance,
      inactiveProjectilesStayFrozen,
      sonicCamera,
      sonicControls,
      bassColumns,
      contextLost: topo.renderer.getContext().isContextLost()
    };
  })()`);

  const clarity = await evaluate(`(() => {
    const api = window.feMonsterRenderClarity;
    const range = document.querySelector('#renderClarityRange');
    const autoToggle = document.querySelector('#renderClarityAutoToggle');
    const value = document.querySelector('#renderClarityValue');
    if (!api || !range || !autoToggle || !value) return { available: false };
    const initial = api.snapshot();
    api.setAuto(false, { persist: false, announce: false });
    api.setPercent(50, { persist: false, announce: false });
    const low = api.snapshot();
    const lowUi = { disabled: range.disabled, value: range.value, output: value.textContent };
    api.setPercent(125, { persist: false, announce: false });
    const high = api.snapshot();
    api.setPercent(initial.manualPercent, { persist: false, announce: false });
    api.setAuto(initial.auto, { persist: false, announce: false });
    const restored = api.snapshot();
    return {
      available: true,
      range: { min: range.min, max: range.max, step: range.step },
      initial,
      low,
      lowUi,
      high,
      restored
    };
  })()`);

  const presetFsr = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const api = window.feMonsterPresetUpscaler;
    const toggle = document.querySelector('#presetFsrToggle');
    const versionSelect = document.querySelector('#presetFsrVersion');
    const modeSelect = document.querySelector('#presetFsrMode');
    const detail = document.querySelector('#presetFsrDetail');
    if (!api || !toggle || !versionSelect || !modeSelect || !detail) return { available: false };

    const initial = api.snapshot();
    const options = { persist: false, announce: false };
    const ui = () => ({
      toggleChecked: toggle.checked,
      version: versionSelect.value,
      versionDisabled: versionSelect.disabled,
      mode: modeSelect.value,
      modeDisabled: modeSelect.disabled,
      detail: detail.textContent,
      dataset: document.documentElement.dataset.presetFsr
    });
    let result;
    try {
      api.setEnabled(false, options);
      await wait(30);
      const disabled = {
        snapshot: api.snapshot(),
        ui: ui(),
        request: presetFsrRequest(true)
      };

      api.setEnabled(true, options);
      api.setVersion('1', options);
      api.setMode('quality', options);
      enterPresetPlaybackPage('cube');
      requestOrbFrame();
      const startedWaitingAt = performance.now();
      while (!state.dynamicCube?.renderer && performance.now() - startedWaitingAt < 8000) {
        await wait(80);
      }
      applyPresetUpscaler({ force: true });
      await wait(80);
      const activePreset = {
        rendererReady: !!state.dynamicCube?.renderer,
        snapshot: api.snapshot(),
        ui: ui()
      };

      const modes = [];
      for (const requestedMode of ['auto', 'ultra-quality', 'quality', 'balanced', 'performance']) {
        api.setMode(requestedMode, options);
        await wait(20);
        const request = presetFsrRequest(true);
        modes.push({
          requestedMode,
          snapshotMode: api.snapshot().mode,
          selectedMode: modeSelect.value,
          requestMode: typeof request === 'object' ? request.name : request,
          dataset: document.documentElement.dataset.presetFsr
        });
      }

      api.setMode('quality', options);
      const versions = [];
      for (const requestedVersion of ['1', '2', '3', '4']) {
        api.setVersion(requestedVersion, options);
        await wait(30);
        const snapshot = api.snapshot();
        const request = presetFsrRequest(true);
        versions.push({
          requestedVersion,
          snapshotRequestedVersion: snapshot.requestedVersion,
          effectiveVersion: snapshot.effectiveVersion,
          selectedVersion: versionSelect.value,
          requestMode: typeof request === 'object' ? request.name : request,
          family: snapshot.diagnostics?.family || '',
          fallback: presetFsrVersionFallbackReason(),
          detail: detail.textContent
        });
      }

      api.setVersion('1', options);
      setDiyPreset('lyric');
      applyPresetUpscaler({ force: true });
      await wait(40);
      const nonPreset = {
        snapshot: api.snapshot(),
        request: presetFsrRequest(false),
        ui: ui()
      };

      result = {
        available: true,
        softwareRenderer: renderClaritySoftwareRenderer(),
        nativeTargetsOwned: state.clientRuntime.renderCapabilities?.native?.host?.ownsNativeRenderTargets === true,
        disabled,
        activePreset,
        modes,
        versions,
        nonPreset
      };
    } finally {
      setDiyPreset('lyric');
      returnHomePage();
      api.setMode(initial.mode, options);
      api.setVersion(initial.requestedVersion, options);
      api.setEnabled(initial.enabled, options);
      applyPresetUpscaler({ force: true });
    }
    return result;
  })()`);

  const renderQualityLifecycle = await evaluate(`(() => {
    if (!window.FeRenderQuality?.create) return { available: false };
    const counters = {
      targetsCreated: 0,
      targetsDisposed: 0,
      timerExtensionRequests: 0,
      queriesCreated: 0,
      queriesDeleted: 0
    };
    const timerExtension = {
      TIME_ELAPSED_EXT: 0x88bf,
      GPU_DISJOINT_EXT: 0x8fbb
    };
    const gl = {
      VENDOR: 0x1f00,
      RENDERER: 0x1f01,
      MAX_TEXTURE_SIZE: 0x0d33,
      MAX_RENDERBUFFER_SIZE: 0x84e8,
      QUERY_RESULT_AVAILABLE: 0x8867,
      QUERY_RESULT: 0x8866,
      getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
        }
        if (name === 'EXT_disjoint_timer_query_webgl2') {
          counters.timerExtensionRequests += 1;
          return timerExtension;
        }
        return null;
      },
      getParameter(parameter) {
        if (parameter === 0x9245) return 'Regression Test Vendor';
        if (parameter === 0x9246) return 'Regression Test GPU';
        if (parameter === this.MAX_TEXTURE_SIZE || parameter === this.MAX_RENDERBUFFER_SIZE) return 8192;
        if (parameter === timerExtension.GPU_DISJOINT_EXT) return false;
        return '';
      },
      createQuery() {
        counters.queriesCreated += 1;
        return { id: counters.queriesCreated };
      },
      beginQuery() {},
      endQuery() {},
      deleteQuery() {
        counters.queriesDeleted += 1;
      },
      getQueryParameter(query, parameter) {
        return parameter === this.QUERY_RESULT_AVAILABLE ? true : 1000000;
      }
    };
    class FakeRenderTarget {
      constructor(width, height) {
        counters.targetsCreated += 1;
        this.width = width;
        this.height = height;
        this.texture = {};
        this.disposed = false;
      }
      setSize(width, height) {
        this.width = width;
        this.height = height;
      }
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        counters.targetsDisposed += 1;
      }
    }
    class FakeShaderMaterial {
      constructor(options) {
        Object.assign(this, options);
        this.uniforms = options.uniforms;
        this.extensions = {};
      }
      dispose() {}
    }
    class FakeVector2 {
      constructor(x, y) {
        this.x = x;
        this.y = y;
      }
      set(x, y) {
        this.x = x;
        this.y = y;
      }
    }
    class FakeScene {
      add() {}
    }
    class FakeCamera {
      constructor() {
        this.position = {};
      }
    }
    class FakeMesh {
      constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
      }
    }
    class FakeGeometry {
      dispose() {}
    }
    const THREE = {
      WebGLRenderTarget: FakeRenderTarget,
      ShaderMaterial: FakeShaderMaterial,
      Vector2: FakeVector2,
      Scene: FakeScene,
      OrthographicCamera: FakeCamera,
      Mesh: FakeMesh,
      PlaneBufferGeometry: FakeGeometry,
      LinearFilter: 1,
      RGBAFormat: 2,
      UnsignedByteType: 3,
      NoBlending: 4
    };
    let pixelRatio = 1;
    let renderTarget = null;
    let scissorTest = false;
    const canvas = {
      width: 640,
      height: 360,
      clientWidth: 640,
      clientHeight: 360,
      addEventListener() {},
      removeEventListener() {}
    };
    const renderer = {
      domElement: canvas,
      capabilities: { isWebGL2: true },
      autoClear: true,
      xr: { enabled: false },
      getContext: () => gl,
      getPixelRatio: () => pixelRatio,
      setPixelRatio(value) {
        pixelRatio = value;
      },
      setSize(width, height) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
      },
      getRenderTarget: () => renderTarget,
      setRenderTarget(value) {
        renderTarget = value;
      },
      getScissorTest: () => scissorTest,
      setScissorTest(value) {
        scissorTest = value;
      },
      render() {}
    };
    const quality = window.FeRenderQuality.create(renderer, {
      THREE,
      mode: 'native',
      minScale: 0.5,
      maxScale: 1
    });
    quality.resize(640, 360, 1);
    const nativeInitial = quality.getDiagnostics();
    const nativeInitialTargetCount = counters.targetsCreated;

    const staticDiagnostics = quality.setMode({ name: 'quality', dynamicResolution: false });
    quality.render({}, {}, performance.now());
    const staticCounters = { ...counters };

    const nativeAfterStatic = quality.setMode('native');
    const nativeAfterStaticCounters = { ...counters };

    quality.setMode({ name: 'auto', dynamicResolution: true });
    quality.render({}, {}, performance.now());
    const dynamicDiagnostics = quality.getDiagnostics();
    const dynamicCounters = { ...counters };
    quality.setMode('native');
    quality.dispose();

    return {
      available: true,
      nativeInitial,
      nativeInitialTargetCount,
      staticDiagnostics,
      staticCounters,
      nativeAfterStatic,
      nativeAfterStaticCounters,
      dynamicDiagnostics,
      dynamicCounters
    };
  })()`);

  const coverParticleLifecycle = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const cover = state.coverParticle;
    const original = {
      engineContainer: cover.engineContainer,
      enginePromise: cover.enginePromise,
      enginePlaying: cover.enginePlaying,
      engineVisible: cover.engineVisible,
      motionAmplitude: cover.motionAmplitude,
      playerClock: { ...state.playerClock }
    };
    let playCalls = 0;
    let pauseCalls = 0;
    let gpuSetSizeCalls = 0;
    let originalGpuSetSize = null;
    let result = { available: false };
    try {
      setDiyPreset('lyric');
      cover.engineContainer = {
        play() { playCalls += 1; },
        pause() { pauseCalls += 1; }
      };
      cover.enginePromise = null;
      cover.enginePlaying = false;
      cover.engineVisible = false;

      enterPresetPlaybackPage('cover-particles');
      requestOrbFrame();
      const gpuStartedAt = performance.now();
      while (!cover.gpuRenderer && !cover.gpuFailed && performance.now() - gpuStartedAt < 5000) {
        await wait(50);
      }
      await wait(160);
      const playWhilePaused = playCalls;

      state.playerClock.playing = true;
      state.playerClock.updatedAt = performance.now();
      updatePlayState();
      await wait(80);
      const playAfterPlaybackStart = playCalls;

      updateCoverParticleVisibility();
      updateCoverParticleVisibility();
      await wait(120);
      const playAfterRepeatedVisible = playCalls;

      const motionRange = document.querySelector('#diyCoverParticleMotionRange');
      const particlesBeforeMotionInput = cover.particles;
      const geometryBeforeMotionInput = cover.gpuGeometry;
      const motionUniforms = [];
      for (const percent of [0, 100, 200]) {
        if (motionRange) {
          motionRange.value = String(percent);
          motionRange.dispatchEvent(new Event('input', { bubbles: true }));
        }
        requestOrbFrame();
        await wait(80);
        motionUniforms.push(Number(cover.gpuMaterial?.uniforms?.uMotionScale?.value));
      }
      const motionControl = {
        available: !!motionRange,
        min: motionRange?.min,
        max: motionRange?.max,
        step: motionRange?.step,
        stateAmplitude: cover.motionAmplitude,
        output: document.querySelector('#diyCoverParticleMotionValue')?.textContent,
        runtimeValue: builtinDiyPresetConfiguration().runtimeControls?.coverMotionAmplitude,
        motionUniforms,
        particlesStable: cover.particles === particlesBeforeMotionInput,
        geometryStable: cover.gpuGeometry === geometryBeforeMotionInput
      };
      if (motionRange) {
        motionRange.value = String(Math.round(original.motionAmplitude * 100));
        motionRange.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (cover.gpuRenderer) {
        originalGpuSetSize = cover.gpuRenderer.setSize;
        cover.gpuRenderer.setSize = function (...args) {
          gpuSetSizeCalls += 1;
          return originalGpuSetSize.apply(this, args);
        };
        await wait(360);
        cover.gpuRenderer.setSize = originalGpuSetSize;
        originalGpuSetSize = null;
      }

      state.playerClock.playing = false;
      state.playerClock.updatedAt = performance.now();
      updatePlayState();
      await wait(80);
      const pauseAfterPlaybackPause = pauseCalls;

      setDiyPreset('lyric');
      await wait(80);
      const pauseAfterExit = pauseCalls;
      updateCoverParticleVisibility();
      updateCoverParticleVisibility();
      const pauseAfterRepeatedHidden = pauseCalls;

      enterPresetPlaybackPage('cover-particles');
      await wait(80);
      const playAfterPausedReentry = playCalls;
      state.playerClock.playing = true;
      state.playerClock.updatedAt = performance.now();
      updatePlayState();
      await wait(80);
      result = {
        available: true,
        gpuAvailable: !!cover.gpuRenderer,
        playWhilePaused,
        playAfterPlaybackStart,
        playAfterRepeatedVisible,
        pauseAfterPlaybackPause,
        pauseAfterExit,
        pauseAfterRepeatedHidden,
        playAfterPausedReentry,
        playAfterReentryPlaybackStart: playCalls,
        gpuSetSizeCalls,
        motionControl
      };
    } finally {
      if (originalGpuSetSize && cover.gpuRenderer) cover.gpuRenderer.setSize = originalGpuSetSize;
      setDiyPreset('lyric');
      returnHomePage();
      cover.engineContainer = original.engineContainer;
      cover.enginePromise = original.enginePromise;
      cover.enginePlaying = original.enginePlaying;
      cover.engineVisible = original.engineVisible;
      cover.motionAmplitude = original.motionAmplitude;
      Object.assign(state.playerClock, original.playerClock);
      updateCoverParticleBackgroundMode();
    }
    return result;
  })()`);

  const coverParticleDepthMapping = await evaluate(`(async () => {
    const fixture = document.createElement('canvas');
    fixture.width = 96;
    fixture.height = 96;
    const fixtureContext = fixture.getContext('2d');
    fixtureContext.fillStyle = 'rgb(16,16,16)';
    fixtureContext.fillRect(0, 0, 32, 96);
    fixtureContext.fillStyle = 'rgb(128,128,128)';
    fixtureContext.fillRect(32, 0, 32, 96);
    fixtureContext.fillStyle = 'rgb(240,240,240)';
    fixtureContext.fillRect(64, 0, 32, 96);

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = fixture.toDataURL('image/png');
    });

    const cover = state.coverParticle;
    const originalCover = {
      image: cover.image,
      imageSignature: cover.imageSignature,
      sampleSignature: cover.sampleSignature,
      particles: cover.particles,
      gpuSignature: cover.gpuSignature
    };
    const originalRandom = Math.random;
    const chladniRefs = {
      root: state.chladni,
      runtime: state.chladni.runtime,
      palette: state.chladni.palette,
      frame: state.chladni.frame,
      lastDiagnostics: state.chladni.lastDiagnostics
    };

    const summarize = (particles) => {
      let count = 0;
      let sumL = 0;
      let sumZ = 0;
      let sumLL = 0;
      let sumZZ = 0;
      let sumLZ = 0;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let minSize = Infinity;
      let maxSize = -Infinity;
      const bands = {
        dark: { count: 0, sumZ: 0 },
        mid: { count: 0, sumZ: 0 },
        bright: { count: 0, sumZ: 0 }
      };
      for (const particle of particles) {
        const luminance = 0.2126 * particle.r + 0.7152 * particle.g + 0.0722 * particle.b;
        const z = Number(particle.z);
        count += 1;
        sumL += luminance;
        sumZ += z;
        sumLL += luminance * luminance;
        sumZZ += z * z;
        sumLZ += luminance * z;
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        minSize = Math.min(minSize, Number(particle.size));
        maxSize = Math.max(maxSize, Number(particle.size));
        const band = luminance < 0.2
          ? bands.dark
          : luminance > 0.82
            ? bands.bright
            : luminance > 0.44 && luminance < 0.58
              ? bands.mid
              : null;
        if (band) {
          band.count += 1;
          band.sumZ += z;
        }
      }
      const denominator = Math.sqrt(
        Math.max(0, count * sumLL - sumL * sumL)
          * Math.max(0, count * sumZZ - sumZ * sumZ)
      );
      return {
        count,
        correlation: denominator > 0 ? (count * sumLZ - sumL * sumZ) / denominator : 0,
        depthSpan: maxZ - minZ,
        minSize,
        maxSize,
        bands: Object.fromEntries(Object.entries(bands).map(([key, band]) => [key, {
          count: band.count,
          meanZ: band.count ? band.sumZ / band.count : 0
        }]))
      };
    };

    let result;
    try {
      cover.image = image;
      cover.imageSignature = 'qa-cover-depth-fixture';
      Math.random = () => 0.1;
      resetCoverParticleSamples();
      buildCoverParticleSamples(900, 900, 1);
      const firstDepths = Float32Array.from(cover.particles, (particle) => particle.z);
      const first = summarize(cover.particles);

      Math.random = () => 0.9;
      resetCoverParticleSamples();
      buildCoverParticleSamples(900, 900, 1);
      const second = summarize(cover.particles);
      const particlesBeforeResize = cover.particles;
      buildCoverParticleSamples(1200, 680, 2);
      const resizeKeepsAnchors = cover.particles === particlesBeforeResize;
      let maxDepthDelta = firstDepths.length === cover.particles.length ? 0 : Number.MAX_SAFE_INTEGER;
      if (firstDepths.length === cover.particles.length) {
        for (let index = 0; index < firstDepths.length; index += 1) {
          maxDepthDelta = Math.max(maxDepthDelta, Math.abs(firstDepths[index] - cover.particles[index].z));
        }
      }

      const material = coverParticleGpuMaterial(window.THREE);
      const gpuDepthOcclusion = material.depthTest === true && material.depthWrite === true;
      const vertexShader = String(material.vertexShader || '');
      const gpuRenderSource = String(drawCoverParticleSceneGpu);
      const gpuGeometrySource = String(rebuildCoverParticleGpuGeometry);
      const cpuRenderSource = String(drawCoverParticleScene);
      const enginePlaySource = String(playCoverParticleEngine);
      const playStateSource = String(updatePlayState);
      const motionBehavior = {
        pausedDepthFlat: vertexShader.includes('position.z * uAudioActive')
          && cpuRenderSource.includes('particle.z * (audioActive ? 1 : 0)'),
        playbackSignedParticleWave: vertexShader.includes('float naturalWave = mix(baseNaturalWave, lowFrequencyWave, lowSegmentMix)')
          && vertexShader.includes('float waveDepth = uAudioActive * naturalWave')
          && cpuRenderSource.includes('const naturalWave = baseNaturalWave * (1 - lowSegmentMix)')
          && cpuRenderSource.includes('const waveDepth = audioGate * naturalWave'),
        hundredSegmentLowWave: vertexShader.includes('segmentProgress * 6.28318530718 * 100.0')
          && vertexShader.includes('float lowSegmentMix = clamp(lowDrive * 0.72, 0.0, 0.68)')
          && cpuRenderSource.includes('segmentProgress * Math.PI * 2 * COVER_PARTICLE_LOW_WAVE_SEGMENTS')
          && cpuRenderSource.includes('const lowSegmentMix = clamp(lowDrive * 0.72, 0, 0.68)'),
        randomPerParticleLowCycles: vertexShader.includes('attribute float aLowCyclePhase')
          && vertexShader.includes('attribute float aLowCycleRate')
          && vertexShader.includes('sin(sheetTime * aLowCycleRate + aLowCyclePhase)')
          && vertexShader.includes('float randomCycleMix = clamp(uBass * 1.08, 0.0, 0.78)')
          && gpuGeometrySource.includes("geometry.setAttribute('aLowCyclePhase'")
          && gpuGeometrySource.includes("geometry.setAttribute('aLowCycleRate'")
          && cpuRenderSource.includes('Math.sin(sheetTime * particle.lowCycleRate + particle.lowCyclePhase)')
          && cpuRenderSource.includes('const randomCycleMix = clamp(bass * 1.08, 0, 0.78)')
          && cpuRenderSource.includes('const lowFrequencyWave = lowSegmentWave * (1 - randomCycleMix)'),
        audioGateUniform: vertexShader.includes('uniform float uAudioActive')
          && gpuRenderSource.includes('uniforms.uAudioActive.value = audioActive ? 1 : 0'),
        playbackClockGate: cpuRenderSource.includes('const audioActive = isPlaybackClockRunning()'),
        backgroundMotionGate: enginePlaySource.includes('!isPlaybackClockRunning()')
          && playStateSource.includes('if (isPlaybackClockRunning()) playCoverParticleEngine()'),
        noPositiveOnlyLift: !vertexShader.includes('sheetLift')
          && !vertexShader.includes('pulseLift')
          && !cpuRenderSource.includes('sheetLift')
          && !cpuRenderSource.includes('pulseLift'),
        wholeLowFrequencyPulse: cpuRenderSource.includes('const wholePulse = audioActive')
          && cpuRenderSource.includes('Math.pow(cover.bass, 1.1)')
      };
      const sampleWaveDepth = (particle, time, audioGate = 1) => {
        const bass = 0.6;
        const energy = 0.4;
        const beat = 0.35;
        const sheetTime = time * (0.68 + bass * 0.54 + beat * 0.12);
        const waveA = Math.sin(sheetTime + particle.wavePhase);
        const waveB = Math.sin(sheetTime * 0.73 + particle.wavePhase * 1.31 + particle.x * 5.2);
        const waveC = Math.sin(sheetTime * 1.17 - particle.wavePhase * 0.89 + particle.y * 6.6);
        const radialWave = Math.sin(Math.hypot(particle.x, particle.y) * 14 - sheetTime * 1.28 + particle.wavePhase * 0.18);
        const lowDrive = Math.max(0, Math.min(1.25, bass * 0.82 + energy * 0.22));
        const baseNaturalWave = waveA * 0.42 + waveB * 0.28 + waveC * 0.2 + radialWave * 0.1;
        const segmentProgress = Math.max(0, Math.min(1, (particle.x + 0.64) / 1.28));
        const lowSegmentWave = Math.sin(
          segmentProgress * Math.PI * 2 * COVER_PARTICLE_LOW_WAVE_SEGMENTS
            + particle.y * 0.65
            - sheetTime * 0.56
        );
        const lowSegmentMix = Math.max(0, Math.min(0.68, lowDrive * 0.72));
        const randomParticleCycle = Math.sin(sheetTime * particle.lowCycleRate + particle.lowCyclePhase);
        const randomCycleMix = Math.max(0, Math.min(0.78, bass * 1.08));
        const lowFrequencyWave = lowSegmentWave * (1 - randomCycleMix)
          + randomParticleCycle * randomCycleMix;
        const naturalWave = baseNaturalWave * (1 - lowSegmentMix) + lowFrequencyWave * lowSegmentMix;
        return audioGate * naturalWave * (0.01 + lowDrive * 0.014 + beat * 0.004) * particle.waveStrength;
      };
      let moving = 0;
      let forward = 0;
      let backward = 0;
      let signedDelta = 0;
      let absoluteDelta = 0;
      let pausedMax = 0;
      for (const particle of cover.particles) {
        pausedMax = Math.max(pausedMax, Math.abs(sampleWaveDepth(particle, 1.4, 0)));
        const delta = sampleWaveDepth(particle, 1.4) - sampleWaveDepth(particle, 0.6);
        if (Math.abs(delta) > 1e-6) moving += 1;
        if (delta > 1e-6) forward += 1;
        else if (delta < -1e-6) backward += 1;
        signedDelta += delta;
        absoluteDelta += Math.abs(delta);
      }
      const waveMotion = {
        pausedMax,
        movingRatio: moving / Math.max(1, cover.particles.length),
        forwardRatio: forward / Math.max(1, cover.particles.length),
        backwardRatio: backward / Math.max(1, cover.particles.length),
        signedBias: Math.abs(signedDelta) / Math.max(1e-9, absoluteDelta)
      };
      const segmentSamples = 4096;
      let segmentCrossings = 0;
      let previousSegmentWave = Math.sin(0.37);
      for (let index = 1; index <= segmentSamples; index += 1) {
        const progress = index / segmentSamples;
        const segmentWave = Math.sin(
          progress * Math.PI * 2 * COVER_PARTICLE_LOW_WAVE_SEGMENTS + 0.37
        );
        if ((previousSegmentWave < 0 && segmentWave >= 0) || (previousSegmentWave >= 0 && segmentWave < 0)) {
          segmentCrossings += 1;
        }
        previousSegmentWave = segmentWave;
      }
      const lowWaveSegments = {
        target: COVER_PARTICLE_LOW_WAVE_SEGMENTS,
        measured: segmentCrossings / 2,
        phaseSpan: Math.PI * 2 * COVER_PARTICLE_LOW_WAVE_SEGMENTS
      };
      let positiveRates = 0;
      let negativeRates = 0;
      let instantaneousForward = 0;
      let instantaneousBackward = 0;
      let minAbsoluteRate = Infinity;
      let maxAbsoluteRate = 0;
      const uniquePhases = new Set();
      const cycleSheetTime = 1.4 * (0.68 + 0.6 * 0.54 + 0.35 * 0.12);
      for (const particle of cover.particles) {
        if (particle.lowCycleRate > 0) positiveRates += 1;
        else if (particle.lowCycleRate < 0) negativeRates += 1;
        const cyclePosition = Math.sin(
          cycleSheetTime * particle.lowCycleRate + particle.lowCyclePhase
        );
        if (cyclePosition > 0) instantaneousForward += 1;
        else if (cyclePosition < 0) instantaneousBackward += 1;
        const absoluteRate = Math.abs(particle.lowCycleRate);
        minAbsoluteRate = Math.min(minAbsoluteRate, absoluteRate);
        maxAbsoluteRate = Math.max(maxAbsoluteRate, absoluteRate);
        uniquePhases.add(Math.round(particle.lowCyclePhase * 10000));
      }
      const randomLowCycles = {
        positiveRateRatio: positiveRates / Math.max(1, cover.particles.length),
        negativeRateRatio: negativeRates / Math.max(1, cover.particles.length),
        forwardRatio: instantaneousForward / Math.max(1, cover.particles.length),
        backwardRatio: instantaneousBackward / Math.max(1, cover.particles.length),
        minAbsoluteRate,
        maxAbsoluteRate,
        uniquePhaseCount: uniquePhases.size
      };
      material.dispose();
      result = {
        first,
        second,
        sameParticleCount: firstDepths.length === cover.particles.length,
        maxDepthDelta,
        resizeKeepsAnchors,
        gpuDepthOcclusion,
        motionBehavior,
        waveMotion,
        lowWaveSegments,
        randomLowCycles,
        chladniUnchanged: state.chladni === chladniRefs.root
          && state.chladni.runtime === chladniRefs.runtime
          && state.chladni.palette === chladniRefs.palette
          && state.chladni.frame === chladniRefs.frame
          && state.chladni.lastDiagnostics === chladniRefs.lastDiagnostics
      };
    } finally {
      Math.random = originalRandom;
      cover.image = originalCover.image;
      cover.imageSignature = originalCover.imageSignature;
      cover.sampleSignature = originalCover.sampleSignature;
      cover.particles = originalCover.particles;
      cover.gpuSignature = originalCover.gpuSignature;
    }
    return result;
  })()`);

  const presetSurfaceCoverage = await evaluate(`(async () => {
    const stage = document.querySelector('.stage');
    if (!stage) return { available: false, allCoverStage: false, surfaces: [] };

    const specifications = [
      ['wallpaper', '#wallpaperScene', '#wallpaperScene'],
      ['void-prism', '#voidPrismScene', '#voidPrismCore'],
      ['free-cubes', '#freeCubeScene', '#freeCubeCore'],
      ['dynamic-cube', '#dynamicCubeScene', '#dynamicCubeCore'],
      ['topography', '#sonicTopographyScene', '#sonicTopographyCore'],
      ['chladni', '#chladniScene', '#chladniCore'],
      ['cover-particles', '#coverParticleScene', '#coverParticleRig'],
      ['sandbox', '#sandboxPlaybackScene', '#sandboxPlaybackScene']
    ];
    const snapshots = [];
    const surfaces = [];

    try {
      for (const [name, sceneSelector, surfaceSelector] of specifications) {
        const scene = document.querySelector(sceneSelector);
        const surface = document.querySelector(surfaceSelector);
        if (!scene || !surface) {
          surfaces.push({ name, available: false, coversStage: false });
          continue;
        }
        snapshots.push({ scene, hidden: scene.hidden });
        scene.hidden = false;
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const stageRect = stage.getBoundingClientRect();
      for (const [name, , surfaceSelector] of specifications) {
        const surface = document.querySelector(surfaceSelector);
        if (!surface) continue;
        const rect = surface.getBoundingClientRect();
        const tolerance = 1.5;
        const coversStage = rect.left <= stageRect.left + tolerance
          && rect.top <= stageRect.top + tolerance
          && rect.right >= stageRect.right - tolerance
          && rect.bottom >= stageRect.bottom - tolerance;
        surfaces.push({
          name,
          available: true,
          coversStage,
          widthRatio: stageRect.width > 0 ? rect.width / stageRect.width : 0,
          heightRatio: stageRect.height > 0 ? rect.height / stageRect.height : 0,
          leftDelta: rect.left - stageRect.left,
          topDelta: rect.top - stageRect.top,
          rightDelta: rect.right - stageRect.right,
          bottomDelta: rect.bottom - stageRect.bottom
        });
      }
    } finally {
      for (const snapshot of snapshots) snapshot.scene.hidden = snapshot.hidden;
    }

    return {
      available: true,
      allCoverStage: surfaces.length === specifications.length
        && surfaces.every((surface) => surface.available && surface.coversStage),
      surfaces
    };
  })()`);

  const taskDurationMs = Math.max(0, ((metricsAfter.TaskDuration || 0) - (metricsBefore.TaskDuration || 0)) * 1000);
  const scriptDurationMs = Math.max(0, ((metricsAfter.ScriptDuration || 0) - (metricsBefore.ScriptDuration || 0)) * 1000);
  const sonicGridMinimum = ({ high: 184, balanced: 156, economy: 124, mobile: 84 })[sonicRefresh.renderTier] || 64;
  const checks = {
    presetStarted: setup.active === true && setup.canvasCount === 1,
    playbackPresetsTrackNativeRefresh: activeSample.nativeRefresh === true
      && activeSample.renderToRafRatio >= 0.9,
    freeCubeSkipsCovered2dScene: activeSample.hiddenOrbDrawImageCalls === 0,
    uiPointerWorkCoalesced: uiPointerSample.available === true
      && uiPointerSample.layoutReads <= 2
      && uiPointerSample.classWrites <= 12,
    stableModeFastPath: kernelComparison?.ratio < 0.9,
    boundedLongTasks: activeSample.maxLongTaskMs < 120 && activeSample.longTaskMs < 260,
    hiddenPresetPaused: lifecycle.hiddenFrameDelta <= 1,
    hiddenPollingPaused: lifecycle.hiddenNetworkRequests.length === 0,
    hiddenEventStreamPaused: lifecycle.hiddenEventSourceCount === 0,
    foregroundPresetResumed: lifecycle.resumedFrameDelta >= 5,
    foregroundEventStreamResumed: lifecycle.resumedEventSourceCount >= 1,
    inactivePresetDisposed: lifecycle.inactive.active === false && lifecycle.inactive.canvasCount === 0,
    dynamicCubeTracksNativeRefresh: dynamicCubeRefresh.renderToRafRatio >= 0.9,
    dynamicCubeAvoidsPerFrameLayoutReads: dynamicCubeRefresh.layoutReads <= 3,
    coveredVoidSkips2dCanvas: voidCanvasBypass.runtimeFrameDelta > 0
      && voidCanvasBypass.drawImageCalls === 0
      && voidCanvasBypass.layoutReads <= 2,
    hiddenWallpaperSkips2dCanvas: wallpaperCanvasBypass.canvasOpacity === '0'
      && wallpaperCanvasBypass.drawImageCalls === 0
      && wallpaperCanvasBypass.layoutReads <= 2,
    renderClarityControl: clarity.available === true
      && clarity.range.min === '50'
      && clarity.range.max === '125'
      && clarity.range.step === '5'
      && clarity.low.auto === false
      && clarity.low.effectivePercent === 50
      && clarity.lowUi.disabled === false
      && clarity.lowUi.value === '50'
      && clarity.high.effectivePercent === 125
      && clarity.high.pixelRatio > clarity.low.pixelRatio
      && clarity.restored.auto === clarity.initial.auto
      && clarity.restored.manualPercent === clarity.initial.manualPercent,
    presetFsrControls: presetFsr.available === true
      && presetFsr.disabled.snapshot.enabled === false
      && presetFsr.disabled.ui.toggleChecked === false
      && presetFsr.disabled.ui.versionDisabled === true
      && presetFsr.disabled.ui.modeDisabled === true
      && presetFsr.disabled.ui.dataset === 'off'
      && presetFsr.disabled.request === 'native'
      && presetFsr.disabled.ui.detail.includes('关闭')
      && presetFsr.activePreset.rendererReady === true
      && presetFsr.activePreset.snapshot.enabled === true
      && presetFsr.activePreset.snapshot.activeScene === true
      && presetFsr.activePreset.ui.toggleChecked === true
      && presetFsr.activePreset.ui.versionDisabled === false
      && presetFsr.activePreset.ui.modeDisabled === false,
    presetFsrModes: presetFsr.modes?.length === 5
      && presetFsr.modes.every((entry) => entry.snapshotMode === entry.requestedMode
        && entry.selectedMode === entry.requestedMode
        && entry.dataset === `fsr1-${entry.requestedMode}`
        && (presetFsr.softwareRenderer ? entry.requestMode === 'native' : entry.requestMode === entry.requestedMode)),
    presetFsrVersionsFallback: presetFsr.nativeTargetsOwned === false
      && presetFsr.versions?.length === 4
      && presetFsr.versions.every((entry) => entry.snapshotRequestedVersion === entry.requestedVersion
        && entry.selectedVersion === entry.requestedVersion)
      && presetFsr.versions.filter((entry) => entry.requestedVersion !== '1').every((entry) => entry.effectiveVersion === '1'
        && entry.family === 'fsr1-compatible-webgl'
        && entry.fallback.includes(`FSR ${entry.requestedVersion}`)
        && entry.fallback.includes('当前 WebGL 链回退 FSR 1')
        && entry.detail === entry.fallback
        && (presetFsr.softwareRenderer ? entry.requestMode === 'native' : entry.requestMode === 'quality')),
    presetFsrOnlyForPresets: presetFsr.nonPreset.snapshot.activeScene === false
      && presetFsr.nonPreset.request === 'native'
      && presetFsr.nonPreset.ui.detail.includes('等待进入 WebGL 场景预设'),
    nativeFsrTargetsLazyAndReleased: renderQualityLifecycle.available === true
      && renderQualityLifecycle.nativeInitialTargetCount === 0
      && renderQualityLifecycle.nativeInitial.pipelineAllocated === false
      && renderQualityLifecycle.staticCounters.targetsCreated === 2
      && renderQualityLifecycle.staticDiagnostics.pipelineAllocated === true
      && renderQualityLifecycle.nativeAfterStatic.pipelineAllocated === false
      && renderQualityLifecycle.nativeAfterStaticCounters.targetsDisposed === 2,
    staticFsrSkipsGpuTimerQueries: renderQualityLifecycle.staticDiagnostics.dynamicResolution === false
      && renderQualityLifecycle.staticDiagnostics.gpuTimerQueriesEnabled === false
      && renderQualityLifecycle.staticDiagnostics.pendingGpuQueries === 0
      && renderQualityLifecycle.staticCounters.timerExtensionRequests === 0
      && renderQualityLifecycle.staticCounters.queriesCreated === 0,
    dynamicFsrTimerQueriesPreserved: renderQualityLifecycle.dynamicDiagnostics.dynamicResolution === true
      && renderQualityLifecycle.dynamicDiagnostics.gpuTimerQueriesEnabled === true
      && renderQualityLifecycle.dynamicCounters.timerExtensionRequests === 1
      && renderQualityLifecycle.dynamicCounters.queriesCreated === 1,
    coverParticleEngineUsesVisibilityEdges: coverParticleLifecycle.available === true
      && coverParticleLifecycle.playWhilePaused === 0
      && coverParticleLifecycle.playAfterPlaybackStart === 1
      && coverParticleLifecycle.playAfterRepeatedVisible === 1
      && coverParticleLifecycle.pauseAfterPlaybackPause === 1
      && coverParticleLifecycle.pauseAfterExit === 1
      && coverParticleLifecycle.pauseAfterRepeatedHidden === 1
      && coverParticleLifecycle.playAfterPausedReentry === 1
      && coverParticleLifecycle.playAfterReentryPlaybackStart === 2,
    coverParticleSkipsStableGpuResize: coverParticleLifecycle.gpuAvailable === true
      && coverParticleLifecycle.gpuSetSizeCalls === 0,
    coverParticleMotionControlIsRealtime: coverParticleLifecycle.motionControl?.available === true
      && coverParticleLifecycle.motionControl.min === '0'
      && coverParticleLifecycle.motionControl.max === '200'
      && coverParticleLifecycle.motionControl.step === '1'
      && coverParticleLifecycle.motionControl.stateAmplitude === 2
      && coverParticleLifecycle.motionControl.output === '200%'
      && coverParticleLifecycle.motionControl.runtimeValue === '200%'
      && coverParticleLifecycle.motionControl.motionUniforms[0] === 0
      && coverParticleLifecycle.motionControl.motionUniforms[1] > 0
      && Math.abs(
        coverParticleLifecycle.motionControl.motionUniforms[2]
          - coverParticleLifecycle.motionControl.motionUniforms[1] * 2
      ) <= 1e-7
      && coverParticleLifecycle.motionControl.particlesStable === true
      && coverParticleLifecycle.motionControl.geometryStable === true,
    coverParticleMatchesReferenceSampling: coverParticleDepthMapping.first.count === 256 * 256
      && coverParticleDepthMapping.first.minSize >= 0.82
      && coverParticleDepthMapping.first.maxSize <= 0.94
      && coverParticleDepthMapping.resizeKeepsAnchors === true,
    coverParticlePlaybackMotionIsGated: Object.values(coverParticleDepthMapping.motionBehavior || {})
      .every(Boolean)
      && coverParticleDepthMapping.waveMotion?.pausedMax <= 1e-9
      && coverParticleDepthMapping.waveMotion?.movingRatio >= 0.99
      && coverParticleDepthMapping.waveMotion?.forwardRatio >= 0.35
      && coverParticleDepthMapping.waveMotion?.backwardRatio >= 0.35
      && coverParticleDepthMapping.waveMotion?.signedBias <= 0.08,
    coverParticleUsesHundredLowWaveSegments: coverParticleDepthMapping.lowWaveSegments?.target === 100
      && coverParticleDepthMapping.lowWaveSegments?.measured === 100
      && Math.abs(coverParticleDepthMapping.lowWaveSegments.phaseSpan - Math.PI * 200) <= 1e-9,
    coverParticleRandomLowCyclesRunBothWays: coverParticleDepthMapping.randomLowCycles?.positiveRateRatio >= 0.45
      && coverParticleDepthMapping.randomLowCycles?.negativeRateRatio >= 0.45
      && coverParticleDepthMapping.randomLowCycles?.forwardRatio >= 0.45
      && coverParticleDepthMapping.randomLowCycles?.backwardRatio >= 0.45
      && coverParticleDepthMapping.randomLowCycles?.minAbsoluteRate >= 0.58
      && coverParticleDepthMapping.randomLowCycles?.maxAbsoluteRate <= 1.26
      && coverParticleDepthMapping.randomLowCycles?.uniquePhaseCount >= 1000,
    coverBrightnessMapsToStable3dDepth: coverParticleDepthMapping.first.bands.dark.count > 1000
      && coverParticleDepthMapping.first.bands.mid.count > 1000
      && coverParticleDepthMapping.first.bands.bright.count > 1000
      && coverParticleDepthMapping.first.correlation >= 0.9
      && coverParticleDepthMapping.second.correlation >= 0.9
      && coverParticleDepthMapping.first.depthSpan >= 0.1
      && coverParticleDepthMapping.first.bands.dark.meanZ < coverParticleDepthMapping.first.bands.mid.meanZ
      && coverParticleDepthMapping.first.bands.mid.meanZ < coverParticleDepthMapping.first.bands.bright.meanZ
      && coverParticleDepthMapping.sameParticleCount === true
      && coverParticleDepthMapping.maxDepthDelta <= 1e-7,
    coverParticleUsesDepthOcclusion: coverParticleDepthMapping.gpuDepthOcclusion === true,
    coverParticleReliefStaysCompact: coverParticleDepthMapping.first.depthSpan >= 0.1
      && coverParticleDepthMapping.first.depthSpan <= 0.15,
    coverParticleLeavesChladniUntouched: coverParticleDepthMapping.chladniUnchanged === true,
    presetRenderSurfacesCoverStage: presetSurfaceCoverage.available === true
      && presetSurfaceCoverage.allCoverStage === true,
    sonicTracksNativeRefresh: sonicRefresh.nativeRefresh === true
      && sonicRefresh.lyricNativeRefresh === true
      && sonicRefresh.homeNativeRefresh === true
      && sonicRefresh.sandboxInterval === 0
      && sonicRefresh.coverParticleFpsLimit >= 1000
      && sonicRefresh.grid >= sonicGridMinimum
      && sonicRefresh.instanceCount === sonicRefresh.grid * sonicRefresh.grid
      && sonicRefresh.spectrumFps >= 24
      && sonicRefresh.spectrumFps <= 50
      && sonicRefresh.renderToRafRatio >= 0.9
      && sonicRefresh.contextLost === false
      && sonicRefresh.layoutReads <= 3,
    nativePresetRenderAvoidsRedundantTargets: sonicRefresh.renderTargetSwitches === 0,
    sonicAvoidsUnusedSceneStyleWrites: sonicRefresh.sceneStyleWrites === 0,
    playbackSceneAvoidsRedundantStyleWrites: sonicRefresh.playbackStyleWrites === 0,
    sonicSkipsIdleProjectileUploads: sonicRefresh.meteorMatrixUploadDelta === 0
      && sonicRefresh.particleMatrixUploadDelta === 0,
    sonicActiveProjectileMotionPreserved: sonicRefresh.activeProjectilesAdvance === true
      && sonicRefresh.inactiveProjectilesStayFrozen === true,
    sonicWideCameraShowsFullScene: sonicRefresh.sonicCamera?.constantFov === 60
      && sonicRefresh.sonicCamera?.runtimeFov === 60
      && sonicRefresh.sonicCamera?.visibleHalfSpan >= 78,
    sonicControlsPersistAndReachShader: sonicRefresh.sonicControls?.panelVisibleInTopography === true
      && sonicRefresh.sonicControls?.panelHiddenOutsideTopography === true
      && sonicRefresh.sonicControls?.complete === true
      && sonicRefresh.sonicControls?.inputTypes?.coreColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.outerColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.brightness === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.exposure === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.columnHeight === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.fieldOfView === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.smoothing === 'range'
      && sonicRefresh.sonicControls?.defaultFov === 60
      && sonicRefresh.sonicControls?.persistenceKey === 'fe-monster-sonic-settings-v1'
      && sonicRefresh.sonicControls?.loadsPreferences === true
      && sonicRefresh.sonicControls?.savesPreferences === true
      && sonicRefresh.sonicControls?.appliesSettings === true
      && Object.values(sonicRefresh.sonicControls?.shaderUniforms || {}).every(Boolean)
      && sonicRefresh.sonicControls?.smoothingAffectsEnvelope === true,
    sonicBassColumnsReuseTerrainAndStopPaused: sonicRefresh.bassColumns?.count === 1009
      && sonicRefresh.bassColumns?.uniqueX === 37
      && sonicRefresh.bassColumns?.uniqueZ === 37
      && sonicRefresh.bassColumns?.oddCenteredCore === true
      && sonicRefresh.bassColumns?.circularCore === true
      && sonicRefresh.bassColumns?.clusteredContiguously === true
      && sonicRefresh.bassColumns?.reusesTerrain === true
      && sonicRefresh.bassColumns?.shaderSelectsCluster === true
      && sonicRefresh.bassColumns?.frequencyBandContract === true
      && sonicRefresh.bassColumns?.spectrumTexture?.isDataTexture === true
      && sonicRefresh.bassColumns?.spectrumTexture?.width === 512
      && sonicRefresh.bassColumns?.spectrumTexture?.height === 1
      && sonicRefresh.bassColumns?.spectrumTexture?.bytes === 512
      && sonicRefresh.bassColumns?.spectrumTexture?.followsVisualBands === true
      && sonicRefresh.bassColumns?.spectrumTexture?.pausedZero === true
      && sonicRefresh.bassColumns?.silkyRise === true
      && sonicRefresh.bassColumns?.silkyRelease === true
      && sonicRefresh.bassColumns?.shaderSamples512Bands === true
      && sonicRefresh.bassColumns?.centerUsesAggregateAmplitude === true
      && sonicRefresh.bassColumns?.transitionsIntoRelief === true
      && sonicRefresh.bassColumns?.amplitudeDriven === true
      && sonicRefresh.bassColumns?.contributesToTerrain === true
      && sonicRefresh.bassColumns?.playbackClockGated === true
      && sonicRefresh.bassColumns?.activeLowFrequencyReachedUniforms === true
      && sonicRefresh.bassColumns?.pausedUniformsZero === true
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      presetFps: Number(activeSample.presetFps.toFixed(1)),
      rafFps: Number(activeSample.rafFps.toFixed(1)),
      renderToRafRatio: Number(activeSample.renderToRafRatio.toFixed(3)),
      runtimeFrames: activeSample.runtimeFrames,
      rafFrames: activeSample.rafFrames,
      sampleMs: Number(activeSample.elapsed.toFixed(1)),
      taskDurationMs: Number(taskDurationMs.toFixed(1)),
      scriptDurationMs: Number(scriptDurationMs.toFixed(1)),
      longTaskCount: activeSample.longTaskCount,
      longTaskMs: Number(activeSample.longTaskMs.toFixed(1)),
      maxLongTaskMs: Number(activeSample.maxLongTaskMs.toFixed(1)),
      hiddenOrbDrawImageCalls: activeSample.hiddenOrbDrawImageCalls,
      hiddenFrameDelta: lifecycle.hiddenFrameDelta,
      hiddenRequestCount: lifecycle.hiddenNetworkRequests.length,
      hiddenEventSourceCount: lifecycle.hiddenEventSourceCount,
      resumedFrameDelta: lifecycle.resumedFrameDelta,
      resumedEventSourceCount: lifecycle.resumedEventSourceCount
    },
    kernelComparison: kernelComparison ? {
      referenceMs: Number(kernelComparison.referenceMs.toFixed(1)),
      optimizedMs: Number(kernelComparison.optimizedMs.toFixed(1)),
      ratio: Number(kernelComparison.ratio.toFixed(3))
    } : null,
    uiPointerSample,
    hiddenRequests: lifecycle.hiddenNetworkRequests,
    inactive: lifecycle.inactive,
    clarity,
    presetFsr,
    renderQualityLifecycle,
    coverParticleLifecycle,
    coverParticleDepthMapping,
    presetSurfaceCoverage,
    dynamicCubeRefresh: {
      ...dynamicCubeRefresh,
      renderFps: Number(dynamicCubeRefresh.renderFps.toFixed(1)),
      rafFps: Number(dynamicCubeRefresh.rafFps.toFixed(1)),
      renderToRafRatio: Number(dynamicCubeRefresh.renderToRafRatio.toFixed(3))
    },
    voidCanvasBypass,
    wallpaperCanvasBypass,
    sonicRefresh: {
      ...sonicRefresh,
      renderFps: Number(sonicRefresh.renderFps.toFixed(1)),
      rafFps: Number(sonicRefresh.rafFps.toFixed(1)),
      spectrumFps: Number(sonicRefresh.spectrumFps.toFixed(1)),
      renderToRafRatio: Number(sonicRefresh.renderToRafRatio.toFixed(3))
    },
    browserErrors
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  if (process.platform === "win32" && browser.pid) {
    spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  await new Promise((resolve) => server.close(resolve));
  await delay(180);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
  } catch {
    // A delayed Edge utility process can keep the profile locked briefly.
  }
}
