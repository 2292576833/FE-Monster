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
    topo.renderer.render = originalRender;
    topo.renderer.setRenderTarget = originalSetRenderTarget;
    els.sonicTopographyCore.getBoundingClientRect = originalGetBoundingClientRect;
    els.sonicTopographyScene.style.setProperty = originalSceneStyleSetProperty;
    playbackStyles.forEach((style, index) => {
      style.setProperty = originalPlaybackStyleSetProperties[index];
    });
    updateAudioSpectrum = originalUpdateAudioSpectrum;
    const nativeRefresh = playbackPresetsUseNativeRefresh();
    setDiyPreset('lyric');
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
      engineVisible: cover.engineVisible
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
      const playAfterEntry = playCalls;

      updateCoverParticleVisibility();
      updateCoverParticleVisibility();
      await wait(120);
      const playAfterRepeatedVisible = playCalls;

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

      setDiyPreset('lyric');
      await wait(80);
      const pauseAfterExit = pauseCalls;
      updateCoverParticleVisibility();
      updateCoverParticleVisibility();
      const pauseAfterRepeatedHidden = pauseCalls;

      enterPresetPlaybackPage('cover-particles');
      await wait(80);
      result = {
        available: true,
        gpuAvailable: !!cover.gpuRenderer,
        playAfterEntry,
        playAfterRepeatedVisible,
        pauseAfterExit,
        pauseAfterRepeatedHidden,
        playAfterReentry: playCalls,
        gpuSetSizeCalls
      };
    } finally {
      if (originalGpuSetSize && cover.gpuRenderer) cover.gpuRenderer.setSize = originalGpuSetSize;
      setDiyPreset('lyric');
      returnHomePage();
      cover.engineContainer = original.engineContainer;
      cover.enginePromise = original.enginePromise;
      cover.enginePlaying = original.enginePlaying;
      cover.engineVisible = original.engineVisible;
    }
    return result;
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
      && wallpaperCanvasBypass.motionUpdates > 0
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
      && coverParticleLifecycle.playAfterEntry === 1
      && coverParticleLifecycle.playAfterRepeatedVisible === 1
      && coverParticleLifecycle.pauseAfterExit === 1
      && coverParticleLifecycle.pauseAfterRepeatedHidden === 1
      && coverParticleLifecycle.playAfterReentry === 2,
    coverParticleSkipsStableGpuResize: coverParticleLifecycle.gpuAvailable === true
      && coverParticleLifecycle.gpuSetSizeCalls === 0,
    sonicTracksNativeRefresh: sonicRefresh.nativeRefresh === true
      && sonicRefresh.lyricNativeRefresh === true
      && sonicRefresh.homeNativeRefresh === false
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
      && sonicRefresh.inactiveProjectilesStayFrozen === true
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
