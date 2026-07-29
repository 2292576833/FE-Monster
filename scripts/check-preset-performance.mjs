import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webRoot = path.join(root, "web");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const testTempRoot = path.join(root, ".tmp");
mkdirSync(testTempRoot, { recursive: true });
const profile = path.join(testTempRoot, `fe-monster-preset-performance-${process.pid}`);
const debugPort = 17000 + Math.floor(Math.random() * 12000);
const sonicScreenshotArgument = process.argv.find((argument) => argument.startsWith("--capture-sonic="));
const sonicScreenshotPath = sonicScreenshotArgument
  ? path.resolve(root, sonicScreenshotArgument.slice("--capture-sonic=".length))
  : "";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const stylesSource = readFileSync(path.join(webRoot, "styles.css"), "utf8").replace(/\r\n/g, "\n");

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
    const playbackStyleWritesByTarget = { lyric: 0, cover: 0 };
    const playbackStyleProperties = {};
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
        const target = index === 0 ? 'lyric' : 'cover';
        playbackStyleWritesByTarget[target] += 1;
        playbackStyleProperties[args[0]] = (playbackStyleProperties[args[0]] || 0) + 1;
        return originalPlaybackStyleSetProperties[index].apply(this, args);
      };
    });
    updateAudioSpectrum = (...args) => {
      spectrumSamples += 1;
      return originalUpdateAudioSpectrum(...args);
    };
    const meteorMatrixVersionBefore = topo.meteorMesh.instanceMatrix.version;
    const particleMatrixVersionBefore = topo.particleMesh.instanceMatrix.version;
    const starfieldPositionAttribute = topo.starfield?.geometry?.getAttribute?.('position') || null;
    const starfieldPositionVersionBefore = starfieldPositionAttribute?.version ?? null;
    const probe = () => {
      rafFrames += 1;
      if (probing) requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
    const startedAt = performance.now();
    await wait(600);
    playbackStyleWrites = 0;
    playbackStyleWritesByTarget.lyric = 0;
    playbackStyleWritesByTarget.cover = 0;
    Object.keys(playbackStyleProperties).forEach((key) => delete playbackStyleProperties[key]);
    await wait(1000);
    const elapsed = performance.now() - startedAt;
    probing = false;
    const idleRenderFrames = renderFrames;
    const idleRafFrames = Math.max(0, rafFrames - 1);
    const idleSpectrumSamples = spectrumSamples;
    const idleRenderTargetSwitches = renderTargetSwitches;
    const idleLayoutReads = layoutReads;
    const idleSceneStyleWrites = sceneStyleWrites;
    const idlePlaybackStyleWrites = playbackStyleWrites;
    const idleMeteorMatrixUploadDelta = topo.meteorMesh.instanceMatrix.version - meteorMatrixVersionBefore;
    const idleParticleMatrixUploadDelta = topo.particleMesh.instanceMatrix.version - particleMatrixVersionBefore;
    const idleStarfieldPositionUploadDelta = starfieldPositionAttribute
      ? starfieldPositionAttribute.version - starfieldPositionVersionBefore
      : null;
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
    const heightProfileStart = bassColumnRadius * 0.55;
    const heightProfileEnd = transitionEnd;
    const columnHeightAt = (distance) => {
      const normalized = clamp(
        (distance - heightProfileStart) / Math.max(0.001, heightProfileEnd - heightProfileStart),
        0,
        1
      );
      const radialMix = normalized * normalized * (3 - 2 * normalized);
      const radialHeight = bassColumnCluster.innerHeightScale
        + (bassColumnCluster.outerHeightScale - bassColumnCluster.innerHeightScale) * radialMix;
      const coreStart = bassColumnCluster.coreRadius;
      const coreEnd = coreStart + bassColumnCluster.coreFeather;
      const coreNormalized = clamp(
        (distance - coreStart) / Math.max(0.001, coreEnd - coreStart),
        0,
        1
      );
      const coreMix = 1 - coreNormalized * coreNormalized * (3 - 2 * coreNormalized);
      return radialHeight
        + (bassColumnCluster.coreHeightScale - radialHeight) * coreMix;
    };
    const heightProfileSamples = Array.from({ length: 65 }, (_, index) => (
      columnHeightAt(heightProfileEnd * index / 64)
    ));
    const centerHeightScale = columnHeightAt(0);
    const middleHeightScale = columnHeightAt(
      bassColumnCluster.coreRadius + bassColumnCluster.coreFeather
    );
    const clusterEdgeHeightScale = columnHeightAt(bassColumnRadius);
    const outerHeightScale = columnHeightAt(heightProfileEnd);
    const bassColumns = {
      count: bassColumnPositions.length,
      uniqueX: uniqueColumnX.length,
      uniqueZ: uniqueColumnZ.length,
      oddCenteredCore: bassColumnCluster.count % 2 === 1
        && bassColumnCluster.center === 0
        && centerColumns.length === 1
        && Math.abs(uniqueColumnX[0] + uniqueColumnX.at(-1)) < 0.01
        && Math.abs(uniqueColumnZ[0] + uniqueColumnZ.at(-1)) < 0.01,
      circularCore: bassColumnRadius === 24
        && circularlySymmetric
        && Math.abs(maxCoreRadiusSquared - bassColumnRadius ** 2) < 0.01
        && positionKeys.has(positionKey(bassColumnRadius * SONIC_TOPOGRAPHY_SPACING, 0))
        && !positionKeys.has(positionKey(
          bassColumnRadius * SONIC_TOPOGRAPHY_SPACING,
          SONIC_TOPOGRAPHY_SPACING
        )),
      clusteredContiguously: positionsAreContiguous(uniqueColumnX)
        && positionsAreContiguous(uniqueColumnZ),
      reusesTerrain: topo.group.children.length === 3
        && topo.group.children.filter((child) => child.isInstancedMesh).length === 3,
      shaderSelectsCluster: sonicVertexShader.includes('bassColumnGrid - vec2(0.0)')
        && /dot\\s*\\(\\s*bassColumnDelta\\s*,\\s*bassColumnDelta\\s*\\)/.test(sonicVertexShader)
        && sonicVertexShader.includes((bassColumnRadius ** 2 + 0.5).toFixed(1)),
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
      heightProfile: {
        center: centerHeightScale,
        middle: middleHeightScale,
        clusterEdge: clusterEdgeHeightScale,
        outer: outerHeightScale,
        ratio: centerHeightScale / Math.max(0.001, outerHeightScale),
        coreToMiddleRatio: centerHeightScale / Math.max(0.001, middleHeightScale),
        coreMinimumLift: centerHeightScale * 6.5,
        middleMaximumLift: middleHeightScale * 10,
        monotonic: heightProfileSamples.slice(1).every((value, index) => (
          value <= heightProfileSamples[index] + 1e-7
        ))
      },
      obviousCoreMiddleOuterHeightDifference: bassColumnCluster.coreRadius === 3
        && bassColumnCluster.coreFeather === 6
        && bassColumnCluster.coreHeightScale === 3
        && bassColumnCluster.innerHeightScale === 1.9
        && bassColumnCluster.outerHeightScale === 0.58
        && centerHeightScale > middleHeightScale
        && middleHeightScale > outerHeightScale
        && centerHeightScale / Math.max(0.001, middleHeightScale) >= 1.55
        && centerHeightScale / Math.max(0.001, outerHeightScale) >= 3.2
        && centerHeightScale * 6.5 > middleHeightScale * 10
        && heightProfileSamples.slice(1).every((value, index) => (
          value <= heightProfileSamples[index] + 1e-7
        ))
        && /float\\s+bassColumnRadialMix\\s*=\\s*smoothstep/.test(sonicVertexShader)
        && /vBassColumnRadialMix\\s*=\\s*bassColumnRadialMix\\s*;/.test(sonicVertexShader)
        && /float\\s+bassColumnHeightProfile\\s*=\\s*mix\\s*\\(\\s*1\\.90\\s*,\\s*0\\.58\\s*,\\s*bassColumnRadialMix\\s*\\)/.test(sonicVertexShader)
        && /float\\s+bassColumnCoreHeightMix\\s*=\\s*1\\.0\\s*-\\s*smoothstep\\s*\\(\\s*3\\.0\\s*,\\s*9\\.0\\s*,\\s*bassColumnRadius\\s*\\)/.test(sonicVertexShader)
        && /bassColumnHeightProfile\\s*=\\s*mix\\s*\\(\\s*bassColumnHeightProfile\\s*,\\s*3\\.00\\s*,\\s*bassColumnCoreHeightMix\\s*\\)/.test(sonicVertexShader)
        && /float\\s+bassColumnLift[\\s\\S]{0,260}bassColumnDrive[\\s\\S]{0,220}bassColumnHeightProfile[\\s\\S]{0,120}uColumnHeightScale/.test(sonicVertexShader),
      smallRandomLowFrequencyBumps: {
        seededCells: sonicVertexShader.includes('vec2 smallBassCell = floor(pos2D / 7.0)')
          && sonicVertexShader.includes('float smallBassSeed = random(smallBassCell + vec2(23.7, 51.3))')
          && sonicVertexShader.includes('float smallBassPresence = step(0.84, smallBassSeed)'),
        smoothCompactShape: sonicVertexShader.includes(
          '1.0 - smoothstep(0.07, 0.31, smallBassDistance)'
        ),
        outsideColumnCluster: sonicVertexShader.includes(
          '* smallBassPresence * (1.0 - bassColumnBlend)'
        ),
        individuallyPulsed: sonicVertexShader.includes('float smallBassPulse = 0.72')
          && sonicVertexShader.includes('smallBassSeed * 6.283) * 0.28'),
        lowFrequencyDriven: sonicVertexShader.includes(
          'max(uLowFrequencyAmplitude, lowDrive) * lowGate'
        )
          && lowFrequencyTransition.activeAmplitude >= 0.82
          && lowFrequencyTransition.pausedAmplitude === 0
          && lowFrequencyTransition.pausedSubBass === 0
          && lowFrequencyTransition.pausedBass === 0
          && lowFrequencyTransition.pausedSpectrumZero === true,
        smallerThanCoreColumns: sonicVertexShader.includes(
          '* (0.65 + smallBassSeed * 0.35) * 1.25 * uColumnHeightScale'
        )
          && 1.25 / (centerHeightScale * 6.5) <= 0.1,
        contributesToTerrain: sonicVertexShader.includes(
          'float audioElevation = bassColumnLift + smallBassLift + subLift + bassLift'
        )
      },
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
        && sonicVertexShader.includes(
          'float audioElevation = bassColumnLift + smallBassLift + subLift'
        ),
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
      centerColor: document.querySelector('#sonicCenterColorInput'),
      coreColor: document.querySelector('#sonicCoreColorInput'),
      outerColor: document.querySelector('#sonicOuterColorInput'),
      fountainToggle: document.querySelector('#sonicFountainToggle'),
      fountainColor: document.querySelector('#sonicFountainColorInput'),
      starfieldToggle: document.querySelector('#sonicStarfieldToggle'),
      starfieldColor: document.querySelector('#sonicStarfieldColorInput'),
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
        centerColor: sonicControlElements.centerColor?.type || '',
        coreColor: sonicControlElements.coreColor?.type || '',
        outerColor: sonicControlElements.outerColor?.type || '',
        fountainToggle: sonicControlElements.fountainToggle?.type || '',
        fountainColor: sonicControlElements.fountainColor?.type || '',
        starfieldToggle: sonicControlElements.starfieldToggle?.type || '',
        starfieldColor: sonicControlElements.starfieldColor?.type || '',
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
        centerColor: !!topo.uniforms.uCenterColumnColor
          && /uniform\\s+vec3\\s+uCenterColumnColor\\s*;/.test(String(topo.material.fragmentShader || '')),
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
    const originalSonicSettings = { ...topo.settings };
    const originalStoredSonicSettings = localStorage.getItem(SONIC_SETTINGS_PREFS_KEY);
    const originalClockForEffects = isPlaybackClockRunning;
    const originalAnalysisLiveForEffects = state.audioAnalysis.live;
    const originalVisualForEffects = {
      lowFrequencyAmplitude: state.visual.lowFrequencyAmplitude,
      subBass: state.visual.subBass,
      bass: state.visual.bass,
      lowMid: state.visual.lowMid,
      energy: state.visual.energy,
      beat: state.visual.beat,
      fluxPulse: state.visual.fluxPulse,
      fluxMeteor: state.visual.fluxMeteor,
      lowFrequencyBands: state.visual.lowFrequencyBands
    };
    const dispatchControl = (element, value, eventName) => {
      if (!element) return;
      if (element.type === 'checkbox') element.checked = !!value;
      else element.value = String(value);
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    const hexColor = (color) => color?.isColor ? ('#' + color.getHexString()) : '';
    const sonicEffects = {
      threeIndependentColumnColors: false,
      preferencesPersist: false,
      fountainDisabledStaysIdle: false,
      fountainRisesWithLowFrequency: false,
      fountainUsesRisingBandColumn: false,
      fountainColorApplied: false,
      fountainParticleCapacity: 0,
      fountainBurstCount: 0,
      starfieldContract: false,
      starfieldParticleCount: 0,
      starfieldPointSize: 0,
      starfieldLayerCount: 0,
      starfieldRandomDrift: false,
      starfieldVisibleWhenEnabled: false,
      starfieldRotatesOnlyWhenEnabled: false,
      starfieldColorApplied: false
    };
    try {
      dispatchControl(sonicControlElements.centerColor, '#ff315f', 'input');
      dispatchControl(sonicControlElements.coreColor, '#31ff7a', 'input');
      dispatchControl(sonicControlElements.outerColor, '#317aff', 'input');
      sonicEffects.threeIndependentColumnColors = hexColor(topo.uniforms.uCenterColumnColor?.value) === '#ff315f'
        && hexColor(topo.uniforms.uCoreColumnColor?.value) === '#31ff7a'
        && hexColor(topo.uniforms.uOuterColumnColor?.value) === '#317aff';

      dispatchControl(sonicControlElements.fountainColor, '#fff4d6', 'input');
      dispatchControl(sonicControlElements.starfieldColor, '#8bdcff', 'input');
      dispatchControl(sonicControlElements.fountainToggle, true, 'change');
      dispatchControl(sonicControlElements.starfieldToggle, true, 'change');
      const storedEffects = JSON.parse(localStorage.getItem(SONIC_SETTINGS_PREFS_KEY) || '{}');
      sonicEffects.preferencesPersist = storedEffects.centerColor === '#ff315f'
        && storedEffects.coreColor === '#31ff7a'
        && storedEffects.outerColor === '#317aff'
        && storedEffects.fountainEnabled === true
        && storedEffects.fountainColor === '#fff4d6'
        && storedEffects.starfieldEnabled === true
        && storedEffects.starfieldColor === '#8bdcff';

      state.audioAnalysis.live = false;
      isPlaybackClockRunning = () => true;
      const activeFountainBands = new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT);
      activeFountainBands[211] = 1;
      const primeLowFrequencyRise = () => {
        resetSonicTopographyAudioMotion(topo);
        updateSonicTopographyProjectiles(1 / 60);
        if (topo.frameAudio?.lowFrequencyBands) topo.frameAudio.lowFrequencyBands.fill(0);
        if (topo.frameAudio?.lowFrequencyBandTargets) topo.frameAudio.lowFrequencyBandTargets.fill(0);
        state.visual.lowFrequencyBands = activeFountainBands;
        Object.assign(state.visual, {
          lowFrequencyAmplitude: 0.92,
          subBass: 0.84,
          bass: 0.76,
          lowMid: 0.2,
          energy: 0.54,
          beat: 0,
          fluxPulse: 0,
          fluxMeteor: 0
        });
        topo.lastMotionAt = performance.now() - 16;
        topo.lastRenderAt = 0;
      };

      dispatchControl(sonicControlElements.fountainToggle, false, 'change');
      primeLowFrequencyRise();
      updateSonicTopographyMotion();
      sonicEffects.fountainDisabledStaysIdle = topo.particles.every((particle) => !particle.active);

      dispatchControl(sonicControlElements.fountainToggle, true, 'change');
      primeLowFrequencyRise();
      updateSonicTopographyMotion();
      const fountainParticles = topo.particles.filter((particle) => particle.active);
      const fountainParticle = fountainParticles[0];
      const fountainYBefore = fountainParticle?.y;
      const fountainEmitter = topo.fountainEmitters?.[211];
      sonicEffects.fountainParticleCapacity = topo.particles.length;
      sonicEffects.fountainBurstCount = fountainParticles.length;
      updateSonicTopographyProjectiles(1 / 60);
      sonicEffects.fountainRisesWithLowFrequency = !!fountainParticle
        && fountainParticle.y > fountainYBefore;
      sonicEffects.fountainUsesRisingBandColumn = !!fountainParticle
        && !!fountainEmitter
        && Math.abs(fountainParticle.x - fountainEmitter.x) <= 1
        && Math.abs(fountainParticle.z - fountainEmitter.z) <= 1;
      sonicEffects.fountainColorApplied = hexColor(topo.particleMaterial?.color) === '#fff4d6';

      const starfield = topo.starfield;
      const starfieldGeometry = starfield?.geometry;
      const starfieldPosition = starfieldGeometry?.getAttribute?.('position');
      const starfieldColor = starfieldGeometry?.getAttribute?.('color');
      const starfieldDrift = starfieldGeometry?.getAttribute?.('aStarDrift');
      const starfieldPhase = starfieldGeometry?.getAttribute?.('aStarPhase');
      const starfieldLayers = Array.isArray(starfield?.userData?.layers)
        ? starfield.userData.layers
        : [];
      sonicEffects.starfieldParticleCount = starfieldPosition?.count || 0;
      sonicEffects.starfieldPointSize = Number(starfield?.material?.size) || 0;
      sonicEffects.starfieldLayerCount = starfieldLayers.length;
      sonicEffects.starfieldContract = starfield?.isPoints === true
        && starfieldPosition?.count >= 3600
        && starfieldColor?.count === starfieldPosition.count
        && starfieldDrift?.count === starfieldPosition.count
        && starfieldPhase?.count === starfieldPosition.count
        && starfieldLayers.length === 3
        && starfieldLayers.every((layer, index) => index === 0
          || layer.minRadius > starfieldLayers[index - 1].maxRadius)
        && starfield.material.vertexColors === true
        && starfield.material.size > 0
        && starfield.material.size <= 0.5
        && starfield?.material?.transparent === true
        && starfield.material.depthWrite === false
        && starfield.material.blending === window.THREE.AdditiveBlending
        && !!starfield.material.map;
      sonicEffects.starfieldColorApplied = hexColor(starfield?.material?.color) === '#8bdcff';
      sonicEffects.starfieldVisibleWhenEnabled = starfield?.visible === true;
      isPlaybackClockRunning = () => false;
      const starfieldRotationBefore = Number(starfield?.rotation?.y) || 0;
      const starfieldDriftTime = starfield?.material?.userData?.driftUniforms?.uStarfieldTime;
      const starfieldDriftTimeBefore = Number(starfieldDriftTime?.value) || 0;
      const starfieldPositionVersion = starfieldPosition?.version;
      topo.lastMotionAt = performance.now() - 16;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
      const enabledRotation = Number(starfield?.rotation?.y) || 0;
      sonicEffects.starfieldRandomDrift = (Number(starfieldDriftTime?.value) || 0) > starfieldDriftTimeBefore;
      dispatchControl(sonicControlElements.starfieldToggle, false, 'change');
      topo.lastMotionAt = performance.now() - 16;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
      const disabledRotation = Number(starfield?.rotation?.y) || 0;
      sonicEffects.starfieldRotatesOnlyWhenEnabled = enabledRotation > starfieldRotationBefore
        && disabledRotation === enabledRotation
        && starfield?.visible === false
        && starfieldPosition?.version === starfieldPositionVersion;
    } finally {
      isPlaybackClockRunning = originalClockForEffects;
      state.audioAnalysis.live = originalAnalysisLiveForEffects;
      Object.assign(state.visual, originalVisualForEffects);
      topo.settings = originalSonicSettings;
      applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
      resetSonicTopographyAudioMotion(topo);
      updateSonicTopographyProjectiles(1 / 60);
      if (originalStoredSonicSettings == null) localStorage.removeItem(SONIC_SETTINGS_PREFS_KEY);
      else localStorage.setItem(SONIC_SETTINGS_PREFS_KEY, originalStoredSonicSettings);
    }
    const nativeRefresh = playbackPresetsUseNativeRefresh();
    const sonicInstanceCount = topo.count;
    const sonicGl = topo.renderer.getContext();
    const sonicContextLost = sonicGl.isContextLost();
    const sampleSonicPixels = () => {
      const previousRenderTarget = topo.renderer.getRenderTarget?.() || null;
      topo.renderer.setRenderTarget(null);
      topo.renderer.render(topo.scene, topo.camera);
      const width = sonicGl.drawingBufferWidth;
      const height = sonicGl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      sonicGl.readPixels(0, 0, width, height, sonicGl.RGBA, sonicGl.UNSIGNED_BYTE, pixels);
      if (previousRenderTarget) topo.renderer.setRenderTarget(previousRenderTarget);
      let samples = 0;
      let luminanceSum = 0;
      let luminanceSquared = 0;
      let highlights = 0;
      let clippedHighlights = 0;
      let shadows = 0;
      let midtones = 0;
      let neighborContrast = 0;
      const pixelStep = Math.max(2, Math.floor(Math.min(width, height) / 160));
      for (let y = 0; y < height; y += pixelStep) {
        for (let x = 0; x < width; x += pixelStep) {
          const pixelIndex = (y * width + x) * 4;
          const luminance = (
            pixels[pixelIndex] * 0.2126
            + pixels[pixelIndex + 1] * 0.7152
            + pixels[pixelIndex + 2] * 0.0722
          ) / 255;
          samples += 1;
          luminanceSum += luminance;
          luminanceSquared += luminance * luminance;
          if (luminance >= 0.9) highlights += 1;
          if (luminance >= 0.985) clippedHighlights += 1;
          if (luminance <= 0.09) shadows += 1;
          if (luminance >= 0.18 && luminance <= 0.78) midtones += 1;
          if (x + pixelStep < width) {
            const neighborIndex = pixelIndex + pixelStep * 4;
            const neighborLuminance = (
              pixels[neighborIndex] * 0.2126
              + pixels[neighborIndex + 1] * 0.7152
              + pixels[neighborIndex + 2] * 0.0722
            ) / 255;
            neighborContrast += Math.abs(luminance - neighborLuminance);
          }
        }
      }
      const luminanceMean = luminanceSum / Math.max(1, samples);
      return {
        sampleCount: samples,
        luminanceMean,
        luminanceStdDev: Math.sqrt(Math.max(
          0,
          luminanceSquared / Math.max(1, samples) - luminanceMean * luminanceMean
        )),
        highlightRatio: highlights / Math.max(1, samples),
        clippedHighlightRatio: clippedHighlights / Math.max(1, samples),
        shadowRatio: shadows / Math.max(1, samples),
        midtoneRatio: midtones / Math.max(1, samples),
        localContrast: neighborContrast / Math.max(1, samples)
      };
    };
    const sonicDefaultPixelMetrics = sampleSonicPixels();
    const pixelProbeSettings = { ...topo.settings };
    const sampleOptics = () => ({
      groundColor: topo.tyndallGroundSheenMaterial?.uniforms?.uReflectionColor?.value?.getHexString?.() || '',
      wallColor: topo.tyndallWallBounceMaterial?.uniforms?.uReflectionColor?.value?.getHexString?.() || '',
      columnColor: topo.uniforms?.uTyndallBounceColor?.value?.getHexString?.() || '',
      groundIntensity: Number(topo.tyndallGroundSheenMaterial?.uniforms?.uIntensity?.value) || 0,
      wallIntensity: Number(topo.tyndallWallBounceMaterial?.uniforms?.uIntensity?.value) || 0,
      columnIntensity: Number(topo.uniforms?.uTyndallReceiverBounce?.value) || 0
    });
    topo.settings = { ...topo.settings, tyndallTone: 'warm', tyndallIntensity: 0.4, mistReflectance: 0 };
    applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
    const warmLowReflectance = sampleOptics();
    topo.settings = { ...topo.settings, mistReflectance: 1.5 };
    applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
    const warmHighReflectance = sampleOptics();
    topo.settings = { ...topo.settings, tyndallTone: 'cold' };
    applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
    const coldHighReflectance = sampleOptics();
    const sonicOpticsCoupling = {
      warmLowReflectance,
      warmHighReflectance,
      coldHighReflectance,
      temperatureChangesAllReceivers: warmHighReflectance.groundColor !== coldHighReflectance.groundColor
        && warmHighReflectance.wallColor !== coldHighReflectance.wallColor
        && warmHighReflectance.columnColor !== coldHighReflectance.columnColor,
      reflectanceRaisesReceiverEnergy: warmHighReflectance.groundIntensity > warmLowReflectance.groundIntensity
        && warmHighReflectance.wallIntensity > warmLowReflectance.wallIntensity
        && warmHighReflectance.columnIntensity > warmLowReflectance.columnIntensity
    };
    topo.settings = {
      ...pixelProbeSettings,
      fogDensity: 0.8,
      fogGlow: 1.5,
      mistReflectance: 1.5,
      mistEmission: 0.6,
      tyndallIntensity: 1.5,
      tyndallSpread: 1.5,
      brightness: 1,
      exposure: 0
    };
    applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
    for (let frame = 0; frame < 45; frame += 1) {
      topo.lastMotionAt = performance.now() - 16;
      topo.lastRenderAt = 0;
      updateSonicTopographyMotion();
    }
    const sonicStressPixelMetrics = sampleSonicPixels();
    topo.settings = pixelProbeSettings;
    applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
    topo.lastMotionAt = performance.now() - 16;
    topo.lastRenderAt = 0;
    updateSonicTopographyMotion();
    const sonicPixelMetrics = {
      defaults: sonicDefaultPixelMetrics,
      raisedAtmosphere: sonicStressPixelMetrics
    };
    const sonicAtmosphereDiagnostics = typeof sonicAtmosphereRuntimeSnapshot === 'function'
      ? sonicAtmosphereRuntimeSnapshot()
      : {};
    const sonicAtmosphere = {
      ...sonicAtmosphereDiagnostics,
      mistLayerCount: topo.fogLayers?.length || 0,
      beamCount: topo.tyndallBeams?.length || 0,
      haloCount: topo.tyndallHalos?.length || 0,
      shaderMaterials: topo.tyndallBeams?.every((beam) => beam.material?.isShaderMaterial === true)
        && topo.tyndallHalos?.every((halo) => halo.material?.isShaderMaterial === true),
      pixelMetrics: sonicPixelMetrics,
      opticsCoupling: sonicOpticsCoupling,
      programsRunnable: (topo.renderer.info?.programs || []).every((program) => program?.diagnostics?.runnable !== false),
      glError: sonicGl.getError()
    };
    openPlaybackDiyPanel('preset');
    await wait(260);
    const sceneSettingsGroup = document.querySelector('#scenePresetSettingsGroup');
    const sceneWallpaperControl = document.querySelector('#sceneWallpaperControl');
    const sceneWallpaperActions = Array.from(
      sceneWallpaperControl?.querySelectorAll('.scene-wallpaper-actions button') || []
    );
    const settingsRect = sceneSettingsGroup?.getBoundingClientRect();
    const wallpaperRect = sceneWallpaperControl?.getBoundingClientRect();
    const sonicPanelRect = sonicPanel?.getBoundingClientRect();
    const actionMetrics = sceneWallpaperActions.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.id,
        width: rect.width,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
        insideWallpaper: !!wallpaperRect
          && rect.left >= wallpaperRect.left - 1
          && rect.right <= wallpaperRect.right + 1
      };
    });
    const sonicSceneControls = {
      groupVisible: !!sceneSettingsGroup
        && sceneSettingsGroup.hidden === false
        && getComputedStyle(sceneSettingsGroup).display !== 'none',
      title: document.querySelector('#scenePresetSettingsTitle')?.textContent?.trim() || '',
      meta: document.querySelector('#scenePresetSettingsMeta')?.textContent?.trim() || '',
      sonicVisible: !!sonicPanel && sonicPanel.hidden === false,
      wallpaperVisible: !!sceneWallpaperControl && sceneWallpaperControl.hidden === false,
      foreignControlsHidden: [
        '#diyCoverParticleControl',
        '#diyCubeIntensityControl',
        '#freeCubePresetControls',
        '#chladniPresetControls',
        '#stormPresetLightingQuickControls'
      ].every((selector) => document.querySelector(selector)?.hidden === true),
      wallpaperBeforeSonic: !!settingsRect && !!wallpaperRect && !!sonicPanelRect
        && wallpaperRect.top >= settingsRect.top
        && wallpaperRect.top < sonicPanelRect.top,
      actionsComplete: actionMetrics.length === 3
        && actionMetrics.every((metric) => (
          metric.clientWidth >= 48
          && metric.scrollWidth <= metric.clientWidth + 1
          && metric.insideWallpaper
        )),
      actionMetrics
    };
    if (state.diyOpen) setDiyOpen(false);
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
      instanceCount: sonicInstanceCount,
      renderFps: idleRenderFrames * 1000 / elapsed,
      rafFps: idleRafFrames * 1000 / elapsed,
      spectrumFps: idleSpectrumSamples * 1000 / elapsed,
      renderToRafRatio: idleRenderFrames / Math.max(1, idleRafFrames),
      renderTargetSwitches: idleRenderTargetSwitches,
      layoutReads: idleLayoutReads,
      sceneStyleWrites: idleSceneStyleWrites,
      playbackStyleWrites: idlePlaybackStyleWrites,
      playbackStyleWritesByTarget,
      playbackStyleProperties,
      textPreset: state.textPreset,
      meteorMatrixUploadDelta: idleMeteorMatrixUploadDelta,
      particleMatrixUploadDelta: idleParticleMatrixUploadDelta,
      starfieldPositionUploadDelta: idleStarfieldPositionUploadDelta,
      activeProjectilesAdvance,
      inactiveProjectilesStayFrozen,
      sonicCamera,
      sonicControls,
      sonicSceneControls,
      sonicEffects,
      sonicAtmosphere,
      bassColumns,
      contextLost: sonicContextLost
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
      floatSpeed: cover.floatSpeed,
      waveTime: cover.waveTime,
      motionGate: cover.motionGate,
      wholeJump: cover.wholeJump,
      coverParticlePreferences: window.localStorage.getItem('fe-monster-cover-particle-v1'),
      visualAudio: {
        lowFrequencyAmplitude: state.visual.lowFrequencyAmplitude,
        subBass: state.visual.subBass,
        bass: state.visual.bass,
        lowMid: state.visual.lowMid,
        energy: state.visual.energy,
        beat: state.visual.beat,
        fluxPulse: state.visual.fluxPulse
      },
      visualBridgeAudio: {
        lowFrequencyAmplitude: state.visualBridge.lowFrequencyAmplitude,
        subBass: state.visualBridge.subBass,
        bass: state.visualBridge.bass
      },
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
      cover.motionGate = 0;
      cover.wholeJump = 0;
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0,
        subBass: 0,
        bass: 0,
        lowMid: 0,
        energy: 0,
        beat: 0,
        fluxPulse: 0
      });
      Object.assign(state.visualBridge, {
        lowFrequencyAmplitude: 0,
        subBass: 0,
        bass: 0
      });

      enterPresetPlaybackPage('cover-particles');
      requestOrbFrame();
      const gpuStartedAt = performance.now();
      while (!cover.gpuRenderer && !cover.gpuFailed && performance.now() - gpuStartedAt < 5000) {
        await wait(50);
      }
      await wait(160);
      const playWhilePaused = playCalls;
      const waveTimeBeforePlayback = cover.waveTime;
      const motionGateBeforePlayback = cover.motionGate;
      const particlesBeforeZeroLowMotion = cover.particles;
      const geometryBeforeZeroLowMotion = cover.gpuGeometry;
      const zeroLowStageRect = els.stage.getBoundingClientRect();
      const zeroLowWidth = Math.max(1, Math.round(zeroLowStageRect.width));
      const zeroLowHeight = Math.max(1, Math.round(zeroLowStageRect.height));
      const zeroLowDpr = window.devicePixelRatio || 1;

      state.playerClock.playing = true;
      state.playerClock.updatedAt = performance.now();
      updatePlayState();
      const zeroLowGateRise = [];
      for (let index = 0; index < 6; index += 1) {
        drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
        zeroLowGateRise.push(cover.motionGate);
        await wait(24);
      }
      const playAfterPlaybackStart = playCalls;
      const waveTimeAfterPlaybackStart = cover.waveTime;
      const zeroLowFrequencyMotion = {
        visualInputsAreZero: state.visual.lowFrequencyAmplitude === 0
          && state.visual.subBass === 0
          && state.visual.bass === 0
          && state.visual.lowMid === 0
          && state.visual.beat === 0
          && state.visual.fluxPulse === 0,
        waveTimeBefore: waveTimeBeforePlayback,
        waveTimeAfter: waveTimeAfterPlaybackStart,
        gateBefore: motionGateBeforePlayback,
        gateRise: zeroLowGateRise,
        uniformGate: cover.gpuMaterial?.uniforms?.uAudioActive?.value,
        wholeJump: cover.wholeJump,
        wholeJumpUniform: cover.gpuMaterial?.uniforms?.uWholeJump?.value,
        particlesStable: cover.particles === particlesBeforeZeroLowMotion,
        geometryStable: cover.gpuGeometry === geometryBeforeZeroLowMotion
      };

      updateCoverParticleVisibility();
      updateCoverParticleVisibility();
      await wait(120);
      const playAfterRepeatedVisible = playCalls;
      Object.assign(state.visual, original.visualAudio);

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

      const floatSpeedRange = document.querySelector('#diyCoverParticleFloatSpeedRange');
      const particlesBeforeFloatSpeedInput = cover.particles;
      const geometryBeforeFloatSpeedInput = cover.gpuGeometry;
      const floatSpeedUniforms = [];
      for (const percent of [25, 100, 200]) {
        if (floatSpeedRange) {
          floatSpeedRange.value = String(percent);
          floatSpeedRange.dispatchEvent(new Event('input', { bubbles: true }));
        }
        drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
        floatSpeedUniforms.push(Number(cover.gpuMaterial?.uniforms?.uFloatSpeed?.value));
      }
      let persistedFloatSpeed = Number.NaN;
      try {
        persistedFloatSpeed = Number(
          JSON.parse(window.localStorage.getItem('fe-monster-cover-particle-v1') || '{}').floatSpeed
        );
      } catch (error) {}
      const floatSpeedControl = {
        available: !!floatSpeedRange,
        min: floatSpeedRange?.min,
        max: floatSpeedRange?.max,
        step: floatSpeedRange?.step,
        stateSpeed: cover.floatSpeed,
        output: document.querySelector('#diyCoverParticleFloatSpeedValue')?.textContent,
        runtimeValue: builtinDiyPresetConfiguration().runtimeControls?.coverFloatSpeed,
        persistedFloatSpeed,
        floatSpeedUniforms,
        particlesStable: cover.particles === particlesBeforeFloatSpeedInput,
        geometryStable: cover.gpuGeometry === geometryBeforeFloatSpeedInput
      };
      if (floatSpeedRange) {
        floatSpeedRange.value = String(Math.round(original.floatSpeed * 100));
        floatSpeedRange.dispatchEvent(new Event('input', { bubbles: true }));
      }

      cover.wholeJump = 0;
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0.86,
        subBass: 0.78,
        bass: 0.82,
        lowMid: 0,
        energy: 0.7,
        beat: 0,
        fluxPulse: 0
      });
      const wholeJumpAttack = [];
      for (let index = 0; index < 8; index += 1) {
        updateCoverParticleMotionEnvelope(true, RENDER_PROFILE.targetFrameMs);
        wholeJumpAttack.push(cover.wholeJump);
      }
      drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
      const wholeJumpUniformAtPeak = Number(cover.gpuMaterial?.uniforms?.uWholeJump?.value);
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0,
        subBass: 0,
        bass: 0,
        lowMid: 0,
        energy: 0,
        beat: 0,
        fluxPulse: 0
      });
      const wholeJumpRelease = [];
      for (let index = 0; index < 64; index += 1) {
        updateCoverParticleMotionEnvelope(true, RENDER_PROFILE.targetFrameMs);
        wholeJumpRelease.push(cover.wholeJump);
      }
      drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
      const wholeCoverJump = {
        attack: wholeJumpAttack,
        release: wholeJumpRelease,
        peakUniform: wholeJumpUniformAtPeak,
        releasedUniform: Number(cover.gpuMaterial?.uniforms?.uWholeJump?.value),
        particlesStable: cover.particles === particlesBeforeFloatSpeedInput,
        geometryStable: cover.gpuGeometry === geometryBeforeFloatSpeedInput
      };

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

      const waveTimeBeforePause = cover.waveTime;
      const motionGateBeforePause = cover.motionGate;
      Object.assign(state.visual, {
        lowFrequencyAmplitude: 0.9,
        subBass: 0.82,
        bass: 0.86
      });
      for (let index = 0; index < 8; index += 1) {
        updateCoverParticleMotionEnvelope(true, RENDER_PROFILE.targetFrameMs);
      }
      drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
      const wholeJumpBeforePause = cover.wholeJump;
      state.playerClock.playing = false;
      state.playerClock.updatedAt = performance.now();
      updatePlayState();
      const pauseAfterPlaybackPause = pauseCalls;
      const pausedWaveTimeStart = cover.waveTime;
      const motionGateRelease = [];
      const wholeJumpPauseRelease = [];
      for (let index = 0; index < 64; index += 1) {
        updateCoverParticleMotionEnvelope(false, RENDER_PROFILE.targetFrameMs);
        motionGateRelease.push(cover.motionGate);
        wholeJumpPauseRelease.push(cover.wholeJump);
      }
      drawCoverParticleScene(zeroLowWidth, zeroLowHeight, zeroLowDpr);
      const pausedWaveTimeEnd = cover.waveTime;
      const smoothPauseGate = {
        beforePause: motionGateBeforePause,
        release: motionGateRelease,
        afterRelease: cover.motionGate,
        uniformGate: cover.gpuMaterial?.uniforms?.uAudioActive?.value,
        wholeJumpBeforePause,
        wholeJumpRelease: wholeJumpPauseRelease,
        wholeJumpAfterRelease: cover.wholeJump,
        wholeJumpUniform: cover.gpuMaterial?.uniforms?.uWholeJump?.value
      };

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
      const waveTimeAfterResume = cover.waveTime;
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
        wavePhase: {
          beforePlayback: waveTimeBeforePlayback,
          afterPlaybackStart: waveTimeAfterPlaybackStart,
          beforePause: waveTimeBeforePause,
          pausedStart: pausedWaveTimeStart,
          pausedEnd: pausedWaveTimeEnd,
          afterResume: waveTimeAfterResume
        },
        zeroLowFrequencyMotion,
        smoothPauseGate,
        motionControl,
        floatSpeedControl,
        wholeCoverJump
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
      cover.floatSpeed = original.floatSpeed;
      cover.waveTime = original.waveTime;
      cover.motionGate = original.motionGate;
      cover.wholeJump = original.wholeJump;
      if (original.coverParticlePreferences === null) {
        window.localStorage.removeItem('fe-monster-cover-particle-v1');
      } else {
        window.localStorage.setItem('fe-monster-cover-particle-v1', original.coverParticlePreferences);
      }
      Object.assign(state.visual, original.visualAudio);
      Object.assign(state.visualBridge, original.visualBridgeAudio);
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
      const motionEnvelopeSource = String(updateCoverParticleMotionEnvelope);
      const canvasSyncSource = String(syncCoverParticleCanvas);
      const wallpaperSource = String(setCoverParticleWallpaper);
      const enginePlaySource = String(playCoverParticleEngine);
      const enginePauseSource = String(pauseCoverParticleEngine);
      const playStateSource = String(updatePlayState);
      const motionScaleSource = String(coverParticleMotionScale);
      const motionBehavior = {
        baseReliefRemains: vertexShader.includes('vec3(position.xy, position.z)')
          && cpuRenderSource.includes(
            'const sourceZ = particle.z + depthLayerOffset + dynamicDepth'
          )
          && !vertexShader.includes('position.z * uAudioActive')
          && !cpuRenderSource.includes('particle.z * audioGate'),
        playbackNaturalFloat: vertexShader.includes(
          'float naturalFloat = particleFloat * 0.64 + baseNaturalWave * 0.28 + microWave * 0.08'
        )
          && vertexShader.includes('float waveDepth = uAudioActive * naturalFloat')
          && cpuRenderSource.includes(
            'const naturalFloat = particleFloat * 0.64 + baseNaturalWave * 0.28 + microWave * 0.08'
          )
          && cpuRenderSource.includes('const waveDepth = audioGate * naturalFloat'),
        twoHundredSegmentMicroWave: vertexShader.includes(
          'segmentProgress * 6.28318530718 * 200.0'
        )
          && vertexShader.includes('float microWave = sin(')
          && cpuRenderSource.includes('const microWave = Math.sin(')
          && cpuRenderSource.includes('particle.cpuMicroPhase - sheetTime * 0.34'),
        signedPerParticleFloat: vertexShader.includes('attribute float aFloatPhase')
          && vertexShader.includes('attribute float aFloatRate')
          && vertexShader.includes('float particleFloatTime = uTime * uFloatSpeed')
          && vertexShader.includes('sin(particleFloatTime * aFloatRate + aFloatPhase)')
          && gpuGeometrySource.includes("geometry.setAttribute('aFloatPhase'")
          && gpuGeometrySource.includes("geometry.setAttribute('aFloatRate'")
          && cpuRenderSource.includes(
            'const particleFloatTime = cover.waveTime * coverParticleFloatSpeedScale()'
          )
          && cpuRenderSource.includes(
            'Math.sin(particleFloatTime * particle.floatRate + particle.floatPhase)'
          ),
        naturalFloatIndependentOfLowFrequency: !vertexShader.includes('uBass')
          && !vertexShader.includes('uBeat')
          && !vertexShader.includes('uShock')
          && !vertexShader.includes('naturalFloat * uWholeJump')
          && !cpuRenderSource.includes('naturalFloat * wholeJump')
          && !gpuRenderSource.includes('shock')
          && !motionEnvelopeSource.includes('shock')
          && !cpuRenderSource.includes('shock')
          && !cpuRenderSource.includes('macroWave')
          && !enginePauseSource.includes('resetCoverParticleShock'),
        smoothLowFrequencyWholeCoverJump: vertexShader.includes('uniform float uWholeJump')
          && vertexShader.includes(
            'float wholeJumpOffset = uWholeJump * 0.052 * uMotionScale'
          )
          && vertexShader.includes('source.z += wholeJumpOffset')
          && !vertexShader.includes('source.y += wholeJumpOffset')
          && gpuRenderSource.includes('uniforms.uWholeJump.value = cover.wholeJump')
          && motionEnvelopeSource.includes('const lowFrequencyTarget = audioActive')
          && motionEnvelopeSource.includes('const wholeJumpTarget = audioActive')
          && motionEnvelopeSource.includes(
            'wholeJumpTarget > cover.wholeJump ? 72 : 280'
          )
          && motionEnvelopeSource.includes(
            'cover.wholeJump += (wholeJumpTarget - cover.wholeJump) * wholeJumpRate'
          )
          && cpuRenderSource.includes(
            'const wholeJumpOffset = cover.wholeJump * 0.052 * motionScale'
          )
          && cpuRenderSource.includes(
            'const sourceY = particle.y + particle.bumpDriftY * lateralWave'
          )
          && cpuRenderSource.includes(
            'const sourceZ = particle.z + depthLayerOffset + dynamicDepth + wholeJumpOffset'
          ),
        floatSpeedGpuCpuParity: vertexShader.includes('uniform float uFloatSpeed')
          && vertexShader.includes('float sheetTime = uTime')
          && vertexShader.includes('float particleFloatTime = uTime * uFloatSpeed')
          && gpuRenderSource.includes(
            'uniforms.uFloatSpeed.value = coverParticleFloatSpeedScale()'
          )
          && cpuRenderSource.includes('const sheetTime = cover.waveTime')
          && cpuRenderSource.includes(
            'const particleFloatTime = cover.waveTime * coverParticleFloatSpeedScale()'
          ),
        reliefThreeLayerDepth: vertexShader.includes(
          'float backLayer = 1.0 - smoothstep(0.22, 0.34, relief)'
        )
          && vertexShader.includes('float frontLayer = smoothstep(0.66, 0.78, relief)')
          && vertexShader.includes('float depthLayerOffset = depthLayer * 0.018 * depthLayerMotion')
          && vertexShader.includes('float depthLayerScale = 1.0 + depthLayer * 0.09 * depthLayerMotion')
          && cpuRenderSource.includes('const backLayer = 1 - smoothstep(0.22, 0.34, relief)')
          && cpuRenderSource.includes('const frontLayer = smoothstep(0.66, 0.78, relief)')
          && cpuRenderSource.includes('const depthLayerOffset = depthLayer * 0.018 * depthLayerMotion')
          && cpuRenderSource.includes('const depthLayerScale = 1 + depthLayer * 0.09 * depthLayerMotion')
          && !gpuGeometrySource.includes('aDepthLayer'),
        cinematicDepthBounded: vertexShader.includes(
          'float dynamicDepth = clamp(waveDepth, -0.050, 0.050)'
        )
          && cpuRenderSource.includes(
            'const dynamicDepth = clamp(waveDepth, -0.05, 0.05)'
          ),
        reducedMotionScaleFallback: motionScaleSource.includes('(reducedMotion ? 0.35 : 1)'),
        smoothClockedWavePhase: vertexShader.includes('float sheetTime = uTime;')
          && gpuRenderSource.includes('uniforms.uTime.value = waveTime')
          && motionEnvelopeSource.includes(
            'if (audioActive) cover.waveTime += envelopeStepMs / 1000 * 0.72'
          )
          && cpuRenderSource.includes(
            'const sheetTime = cover.waveTime'
          ),
        audioGateUniform: vertexShader.includes('uniform float uAudioActive')
          && gpuRenderSource.includes('uniforms.uAudioActive.value = motionGate'),
        smoothAudioGate: cpuRenderSource.includes(
          'updateCoverParticleMotionEnvelope(audioActive, envelopeStepMs)'
        )
          && motionEnvelopeSource.includes(
            'const gateRate = 1 - Math.exp(-envelopeStepMs / (gateTarget > cover.motionGate ? 260 : 420))'
        )
          && motionEnvelopeSource.includes(
            'cover.motionGate += (gateTarget - cover.motionGate) * gateRate'
          ),
        playbackClockGate: cpuRenderSource.includes('const audioActive = isPlaybackClockRunning()'),
        backgroundMotionGate: enginePlaySource.includes('!isPlaybackClockRunning()')
          && playStateSource.includes('if (isPlaybackClockRunning()) playCoverParticleEngine()'),
        stableCpuFallbackHotPath: canvasSyncSource.includes(
          'const frame = state.coverParticle.renderFrame'
        )
          && canvasSyncSource.includes(
            'if (canvas.style.width !== cssWidthStyle) canvas.style.width = cssWidthStyle'
          )
          && cpuRenderSource.includes('particle.cpuRadialPhase')
          && cpuRenderSource.includes('particle.cpuMicroPhase')
          && cpuRenderSource.includes('context.fillStyle = particle.colorCss')
          && !cpuRenderSource.includes(
            'context.fillStyle = ' + String.fromCharCode(96) + 'rgba('
          ),
        decodedWallpaperFrameUploadsOnce: wallpaperSource.includes(
          "const supportsVideoFrames = typeof video.requestVideoFrameCallback === 'function'"
        )
          && wallpaperSource.includes('if (supportsVideoFrames)')
          && wallpaperSource.includes('} else {')
          && wallpaperSource.split(
            "video.addEventListener('timeupdate', drawCoverParticleWallpaper)"
          ).length === 2,
        noPositiveOnlyLift: !vertexShader.includes('sheetLift')
          && !vertexShader.includes('pulseLift')
          && !cpuRenderSource.includes('sheetLift')
          && !cpuRenderSource.includes('pulseLift')
      };
      const sampleWaveDepth = (particle, time, audioGate = 1) => {
        const sheetTime = time;
        const waveA = Math.sin(sheetTime + particle.wavePhase);
        const waveB = Math.sin(sheetTime * 0.73 + particle.wavePhase * 1.31 + particle.x * 5.2);
        const waveC = Math.sin(sheetTime * 1.17 - particle.wavePhase * 0.89 + particle.y * 6.6);
        const radialWave = Math.sin(Math.hypot(particle.x, particle.y) * 14 - sheetTime * 1.28 + particle.wavePhase * 0.18);
        const baseNaturalWave = waveA * 0.42 + waveB * 0.28 + waveC * 0.2 + radialWave * 0.1;
        const segmentProgress = Math.max(0, Math.min(1, (particle.x + 0.64) / 1.28));
        const microWave = Math.sin(
          segmentProgress * Math.PI * 2 * COVER_PARTICLE_MICRO_WAVE_SEGMENTS
            + particle.y * 0.65
            - sheetTime * 0.34
        );
        const relief = Math.max(0, Math.min(1, (particle.z + 0.04) / 0.14));
        const particleFloat = Math.sin(sheetTime * particle.floatRate + particle.floatPhase);
        const naturalFloat = particleFloat * 0.64 + baseNaturalWave * 0.28 + microWave * 0.08;
        return audioGate * naturalFloat
          * (0.016 + relief * 0.008) * particle.waveStrength;
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
      const segmentSamples = 8192;
      let segmentCrossings = 0;
      let previousSegmentWave = Math.sin(0.37);
      for (let index = 1; index <= segmentSamples; index += 1) {
        const progress = index / segmentSamples;
        const segmentWave = Math.sin(
          progress * Math.PI * 2 * COVER_PARTICLE_MICRO_WAVE_SEGMENTS + 0.37
        );
        if ((previousSegmentWave < 0 && segmentWave >= 0) || (previousSegmentWave >= 0 && segmentWave < 0)) {
          segmentCrossings += 1;
        }
        previousSegmentWave = segmentWave;
      }
      const horizontalSamples = new Set(
        cover.particles.map((particle) => Number(particle.x.toFixed(6)))
      ).size;
      const microWaveSegments = {
        target: COVER_PARTICLE_MICRO_WAVE_SEGMENTS,
        measured: segmentCrossings / 2,
        phaseSpan: Math.PI * 2 * COVER_PARTICLE_MICRO_WAVE_SEGMENTS,
        horizontalSamples,
        samplesPerSegment: horizontalSamples / COVER_PARTICLE_MICRO_WAVE_SEGMENTS,
        contribution: 0.08
      };
      const depthLayers = { back: 0, middle: 0, front: 0 };
      for (const particle of cover.particles) {
        const relief = clamp((particle.z + 0.04) / 0.14, 0, 1);
        const backLayer = 1 - smoothstep(0.22, 0.34, relief);
        const frontLayer = smoothstep(0.66, 0.78, relief);
        const depthLayer = frontLayer - backLayer;
        if (depthLayer <= -0.9) depthLayers.back += 1;
        else if (depthLayer >= 0.9) depthLayers.front += 1;
        else depthLayers.middle += 1;
      }
      depthLayers.offset = 0.018;
      depthLayers.sizeScale = 0.09;
      let positiveRates = 0;
      let negativeRates = 0;
      let instantaneousForward = 0;
      let instantaneousBackward = 0;
      let minAbsoluteRate = Infinity;
      let maxAbsoluteRate = 0;
      const uniquePhases = new Set();
      const cycleSheetTime = 1.4;
      for (const particle of cover.particles) {
        if (particle.floatRate > 0) positiveRates += 1;
        else if (particle.floatRate < 0) negativeRates += 1;
        const cyclePosition = Math.sin(
          cycleSheetTime * particle.floatRate + particle.floatPhase
        );
        if (cyclePosition > 0) instantaneousForward += 1;
        else if (cyclePosition < 0) instantaneousBackward += 1;
        const absoluteRate = Math.abs(particle.floatRate);
        minAbsoluteRate = Math.min(minAbsoluteRate, absoluteRate);
        maxAbsoluteRate = Math.max(maxAbsoluteRate, absoluteRate);
        uniquePhases.add(Math.round(particle.floatPhase * 10000));
      }
      const randomFloatCycles = {
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
        microWaveSegments,
        depthLayers,
        randomFloatCycles,
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
  const entranceMotionContract = {
    chladniOneShot: /\.chladni-canvas\s*\{[^}]*animation:\s*chladniSceneEntrance\s+560ms\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s+both;/.test(stylesSource),
    coverOneShot: /\.app-shell\.is-playback-page\.has-cover-particle-scene\s+\.cover-particle-rig\s*\{[^}]*animation:\s*coverParticleSceneEntrance\s+620ms\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s+both;/.test(stylesSource),
    chladniKeyframesUseCompositorProperties: /@keyframes\s+chladniSceneEntrance\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*translate3d\([\s\S]*?100%\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*translate3d\(0,\s*0,\s*0\)\s*scale\(1\);[\s\S]*?\}/.test(stylesSource),
    coverKeyframesUseCompositorProperties: /@keyframes\s+coverParticleSceneEntrance\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*translate3d\([\s\S]*?100%\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*translate3d\(0,\s*0,\s*0\)\s*scale\(1\);[\s\S]*?\}/.test(stylesSource),
    reducedMotionDisablesBoth: /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.chladni-canvas,\s*\.cover-particle-rig\s*\{\s*animation:\s*none\s*!important;\s*\}/.test(stylesSource)
  };
  const checks = {
    coverAndChladniEntranceMotion: Object.values(entranceMotionContract).every(Boolean),
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
    coverParticleWavePhaseIsSmoothAndClockGated: coverParticleLifecycle.wavePhase?.afterPlaybackStart
        > coverParticleLifecycle.wavePhase?.beforePlayback
      && coverParticleLifecycle.wavePhase?.beforePause
        >= coverParticleLifecycle.wavePhase?.afterPlaybackStart
      && coverParticleLifecycle.wavePhase?.pausedStart
        >= coverParticleLifecycle.wavePhase?.beforePause
      && Math.abs(
        coverParticleLifecycle.wavePhase?.pausedEnd
          - coverParticleLifecycle.wavePhase?.pausedStart
      ) <= 1e-9
      && coverParticleLifecycle.wavePhase?.afterResume
        > coverParticleLifecycle.wavePhase?.pausedEnd,
    coverParticleFloatsWithZeroLowFrequencyInput: coverParticleLifecycle.zeroLowFrequencyMotion?.visualInputsAreZero === true
      && coverParticleLifecycle.zeroLowFrequencyMotion?.waveTimeAfter
        > coverParticleLifecycle.zeroLowFrequencyMotion?.waveTimeBefore
      && coverParticleLifecycle.zeroLowFrequencyMotion?.gateBefore === 0
      && coverParticleLifecycle.zeroLowFrequencyMotion?.gateRise?.length === 6
      && coverParticleLifecycle.zeroLowFrequencyMotion.gateRise[0] > 0
      && coverParticleLifecycle.zeroLowFrequencyMotion.gateRise.every(
        (value, index, values) => value > 0
          && value <= 1
          && (index === 0 || value >= values[index - 1])
      )
      && coverParticleLifecycle.zeroLowFrequencyMotion?.uniformGate > 0
      && coverParticleLifecycle.zeroLowFrequencyMotion?.wholeJump === 0
      && coverParticleLifecycle.zeroLowFrequencyMotion?.wholeJumpUniform === 0
      && coverParticleLifecycle.zeroLowFrequencyMotion?.particlesStable === true
      && coverParticleLifecycle.zeroLowFrequencyMotion?.geometryStable === true,
    coverParticleGateReleasesSmoothlyOnPause: coverParticleLifecycle.smoothPauseGate?.beforePause > 0
      && coverParticleLifecycle.smoothPauseGate?.release?.length === 64
      && coverParticleLifecycle.smoothPauseGate.release.every(
        (value, index, values) => value >= 0
          && value <= 1
          && (index === 0 || value <= values[index - 1])
      )
      && coverParticleLifecycle.smoothPauseGate?.afterRelease
        < coverParticleLifecycle.smoothPauseGate?.beforePause
      && Math.abs(
        coverParticleLifecycle.smoothPauseGate?.uniformGate
          - coverParticleLifecycle.smoothPauseGate?.afterRelease
      ) <= 1e-7
      && coverParticleLifecycle.smoothPauseGate?.wholeJumpBeforePause > 0
      && coverParticleLifecycle.smoothPauseGate?.wholeJumpRelease?.length === 64
      && coverParticleLifecycle.smoothPauseGate.wholeJumpRelease.every(
        (value, index, values) => value >= 0
          && value <= 1
          && (index === 0 || value <= values[index - 1])
      )
      && coverParticleLifecycle.smoothPauseGate?.wholeJumpAfterRelease === 0
      && coverParticleLifecycle.smoothPauseGate?.wholeJumpUniform === 0,
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
    coverParticleFloatSpeedControlIsRealtimeAndPersistent:
      coverParticleLifecycle.floatSpeedControl?.available === true
      && coverParticleLifecycle.floatSpeedControl.min === '25'
      && coverParticleLifecycle.floatSpeedControl.max === '200'
      && coverParticleLifecycle.floatSpeedControl.step === '1'
      && coverParticleLifecycle.floatSpeedControl.stateSpeed === 2
      && coverParticleLifecycle.floatSpeedControl.output === '200%'
      && coverParticleLifecycle.floatSpeedControl.runtimeValue === '200%'
      && coverParticleLifecycle.floatSpeedControl.persistedFloatSpeed === 2
      && coverParticleLifecycle.floatSpeedControl.floatSpeedUniforms[0] === 0.25
      && coverParticleLifecycle.floatSpeedControl.floatSpeedUniforms[1] === 1
      && coverParticleLifecycle.floatSpeedControl.floatSpeedUniforms[2] === 2
      && coverParticleLifecycle.floatSpeedControl.particlesStable === true
      && coverParticleLifecycle.floatSpeedControl.geometryStable === true,
    coverParticleWholeCoverJumpUsesSmoothLowFrequencyEnvelope:
      coverParticleLifecycle.wholeCoverJump?.attack?.length === 8
      && coverParticleLifecycle.wholeCoverJump.attack[0] > 0
      && coverParticleLifecycle.wholeCoverJump.attack.every(
        (value, index, values) => value >= 0
          && value <= 1
          && (index === 0 || value >= values[index - 1])
      )
      && coverParticleLifecycle.wholeCoverJump?.peakUniform > 0
      && coverParticleLifecycle.wholeCoverJump?.release?.length === 64
      && coverParticleLifecycle.wholeCoverJump.release.every(
        (value, index, values) => value >= 0
          && value <= 1
          && (index === 0 || value <= values[index - 1])
      )
      && coverParticleLifecycle.wholeCoverJump.release.at(-1) === 0
      && coverParticleLifecycle.wholeCoverJump.releasedUniform === 0
      && coverParticleLifecycle.wholeCoverJump.particlesStable === true
      && coverParticleLifecycle.wholeCoverJump.geometryStable === true,
    coverParticleMatchesReferenceSampling: coverParticleDepthMapping.first.count === 512 * 256
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
    coverParticleUsesTwoHundredMicroWaveSegments: coverParticleDepthMapping.microWaveSegments?.target === 200
      && coverParticleDepthMapping.microWaveSegments?.measured === 200
      && Math.abs(coverParticleDepthMapping.microWaveSegments.phaseSpan - Math.PI * 400) <= 1e-9
      && coverParticleDepthMapping.microWaveSegments?.horizontalSamples === 512
      && coverParticleDepthMapping.microWaveSegments?.samplesPerSegment >= 2.5
      && coverParticleDepthMapping.microWaveSegments?.contribution === 0.08,
    coverParticleUsesReliefThreeLayerDepth: coverParticleDepthMapping.depthLayers?.back > 1000
      && coverParticleDepthMapping.depthLayers?.middle > 1000
      && coverParticleDepthMapping.depthLayers?.front > 1000
      && coverParticleDepthMapping.depthLayers?.offset === 0.018
      && coverParticleDepthMapping.depthLayers?.sizeScale === 0.09,
    coverParticleRandomFloatCyclesRunBothWays: coverParticleDepthMapping.randomFloatCycles?.positiveRateRatio >= 0.45
      && coverParticleDepthMapping.randomFloatCycles?.negativeRateRatio >= 0.45
      && coverParticleDepthMapping.randomFloatCycles?.forwardRatio >= 0.45
      && coverParticleDepthMapping.randomFloatCycles?.backwardRatio >= 0.45
      && coverParticleDepthMapping.randomFloatCycles?.minAbsoluteRate >= 0.42
      && coverParticleDepthMapping.randomFloatCycles?.maxAbsoluteRate <= 0.96
      && coverParticleDepthMapping.randomFloatCycles?.uniquePhaseCount >= 1000,
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
    playbackSceneAvoidsRedundantStyleWrites: Object.values(
      sonicRefresh.playbackStyleProperties || {}
    ).every((count) => Number(count) <= 1),
    sonicSkipsIdleProjectileUploads: sonicRefresh.meteorMatrixUploadDelta === 0
      && sonicRefresh.particleMatrixUploadDelta === 0
      && sonicRefresh.starfieldPositionUploadDelta === 0,
    sonicActiveProjectileMotionPreserved: sonicRefresh.activeProjectilesAdvance === true
      && sonicRefresh.inactiveProjectilesStayFrozen === true,
    sonicCloseCameraFramesColumnScene: sonicRefresh.sonicCamera?.constantFov === 44
      && sonicRefresh.sonicCamera?.runtimeFov === 44
      && sonicRefresh.sonicCamera?.visibleHalfSpan >= 30,
    sonicCameraCloseWithStarfield: sonicRefresh.sonicCamera?.radius <= 185
      && sonicRefresh.sonicCamera?.radius >= 155
      && sonicRefresh.sonicEffects?.starfieldParticleCount >= 3600
      && sonicRefresh.sonicEffects?.starfieldVisibleWhenEnabled === true,
    sonicAtmosphereKeepsHighlightsAndContrast: (() => {
      const defaults = sonicRefresh.sonicAtmosphere?.pixelMetrics?.defaults || {};
      const raised = sonicRefresh.sonicAtmosphere?.pixelMetrics?.raisedAtmosphere || {};
      return sonicRefresh.sonicAtmosphere?.groundReceiverCount === 1
        && sonicRefresh.sonicAtmosphere?.groundUsesDirectionalSheen === true
        && sonicRefresh.sonicAtmosphere?.groundHasNoSpotGeometry === true
        && sonicRefresh.sonicAtmosphere?.opticsCoupling?.temperatureChangesAllReceivers === true
        && sonicRefresh.sonicAtmosphere?.opticsCoupling?.reflectanceRaisesReceiverEnergy === true
        && raised.clippedHighlightRatio <= 0.005
        && raised.highlightRatio <= 0.02
        && raised.shadowRatio >= 0.45
        && raised.localContrast >= 0.006
        && raised.luminanceStdDev >= defaults.luminanceStdDev * 0.95
        && raised.midtoneRatio >= defaults.midtoneRatio + 0.015
        && raised.luminanceMean <= 0.18;
    })(),
    sonicControlsPersistAndReachShader: sonicRefresh.sonicControls?.panelVisibleInTopography === true
      && sonicRefresh.sonicControls?.panelHiddenOutsideTopography === true
      && sonicRefresh.sonicControls?.complete === true
      && sonicRefresh.sonicControls?.inputTypes?.centerColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.coreColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.outerColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.fountainToggle === 'checkbox'
      && sonicRefresh.sonicControls?.inputTypes?.fountainColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.starfieldToggle === 'checkbox'
      && sonicRefresh.sonicControls?.inputTypes?.starfieldColor === 'color'
      && sonicRefresh.sonicControls?.inputTypes?.brightness === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.exposure === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.columnHeight === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.fieldOfView === 'range'
      && sonicRefresh.sonicControls?.inputTypes?.smoothing === 'range'
      && sonicRefresh.sonicControls?.defaultFov === 44
      && sonicRefresh.sonicControls?.persistenceKey === 'fe-monster-sonic-settings-v1'
      && sonicRefresh.sonicControls?.loadsPreferences === true
      && sonicRefresh.sonicControls?.savesPreferences === true
      && sonicRefresh.sonicControls?.appliesSettings === true
      && Object.values(sonicRefresh.sonicControls?.shaderUniforms || {}).every(Boolean)
      && sonicRefresh.sonicControls?.smoothingAffectsEnvelope === true,
    sonicSceneControlsStayWithSonicOnly: sonicRefresh.sonicSceneControls?.groupVisible === true
      && sonicRefresh.sonicSceneControls?.title.startsWith('Sonic')
      && sonicRefresh.sonicSceneControls?.meta.includes('Sonic')
      && sonicRefresh.sonicSceneControls?.sonicVisible === true
      && sonicRefresh.sonicSceneControls?.wallpaperVisible === true
      && sonicRefresh.sonicSceneControls?.foreignControlsHidden === true
      && sonicRefresh.sonicSceneControls?.wallpaperBeforeSonic === true
      && sonicRefresh.sonicSceneControls?.actionsComplete === true,
    sonicEffectsRespondToControls: sonicRefresh.sonicEffects?.threeIndependentColumnColors === true
      && sonicRefresh.sonicEffects?.preferencesPersist === true
      && sonicRefresh.sonicEffects?.fountainDisabledStaysIdle === true
      && sonicRefresh.sonicEffects?.fountainRisesWithLowFrequency === true
      && sonicRefresh.sonicEffects?.fountainUsesRisingBandColumn === true
      && sonicRefresh.sonicEffects?.fountainColorApplied === true
      && sonicRefresh.sonicEffects?.starfieldContract === true
      && sonicRefresh.sonicEffects?.starfieldRandomDrift === true
      && sonicRefresh.sonicEffects?.starfieldRotatesOnlyWhenEnabled === true
      && sonicRefresh.sonicEffects?.starfieldColorApplied === true,
    sonicFountainAndStarfieldDensityEnhanced: sonicRefresh.sonicEffects?.fountainParticleCapacity >= 512
      && sonicRefresh.sonicEffects?.fountainBurstCount >= 8
      && sonicRefresh.sonicEffects?.starfieldParticleCount >= 3600
      && sonicRefresh.sonicEffects?.starfieldPointSize > 0
      && sonicRefresh.sonicEffects?.starfieldPointSize <= 0.5
      && sonicRefresh.sonicEffects?.starfieldLayerCount === 3,
    sonicBassColumnsReuseTerrainAndStopPaused: sonicRefresh.bassColumns?.count === 1793
      && sonicRefresh.bassColumns?.uniqueX === 49
      && sonicRefresh.bassColumns?.uniqueZ === 49
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
      && sonicRefresh.bassColumns?.obviousCoreMiddleOuterHeightDifference === true
      && !!sonicRefresh.bassColumns?.smallRandomLowFrequencyBumps
      && Object.values(sonicRefresh.bassColumns.smallRandomLowFrequencyBumps).every(Boolean)
      && sonicRefresh.bassColumns?.transitionsIntoRelief === true
      && sonicRefresh.bassColumns?.amplitudeDriven === true
      && sonicRefresh.bassColumns?.contributesToTerrain === true
      && sonicRefresh.bassColumns?.playbackClockGated === true
      && sonicRefresh.bassColumns?.activeLowFrequencyReachedUniforms === true
      && sonicRefresh.bassColumns?.pausedUniformsZero === true
  };
  let sonicScreenshot = null;
  if (sonicScreenshotPath) {
    const screenshotState = await evaluate(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      enterPresetPlaybackPage('topography');
      requestOrbFrame();
      const startedAt = performance.now();
      while (!state.sonicTopography?.renderer && performance.now() - startedAt < 8000) await wait(80);
      const topo = state.sonicTopography;
      if (!topo?.renderer) throw new Error('Sonic renderer did not start for screenshot');
      const wallpaperSvg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">',
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop offset="0" stop-color="#081426"/><stop offset="0.5" stop-color="#214b63"/>',
        '<stop offset="1" stop-color="#bb5f45"/></linearGradient></defs>',
        '<rect width="1600" height="900" fill="url(#g)"/>',
        '<circle cx="170" cy="160" r="82" fill="#ffe7a3" opacity=".88"/>',
        '<path d="M0 690 Q360 580 720 680 T1440 660 T1600 650" fill="none" stroke="#78e3ff" stroke-width="12" opacity=".7"/>',
        '<text x="800" y="825" text-anchor="middle" fill="white" font-size="46" font-family="sans-serif">SONIC WALLPAPER QA</text>',
        '</svg>'
      ].join('');
      setSonicWallpaperSurface({
        enabled: true,
        url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wallpaperSvg),
        mediaKind: 'image',
        opacity: 1
      });
      const wallpaperStartedAt = performance.now();
      while (!topo.wallpaperTexture && performance.now() - wallpaperStartedAt < 4000) await wait(40);
      topo.settings = {
        ...topo.settings,
        fogDensity: 0.42,
        fogGlow: 0.58,
        mistReflectance: 0.72,
        mistEmission: 0.18,
        tyndallIntensity: 0.82,
        tyndallSpread: 0.56,
        brightness: 1,
        exposure: 0
      };
      applySonicTopographySettings({ persist: false, sync: false, renderConfig: false });
      for (let frame = 0; frame < 45; frame += 1) {
        topo.lastMotionAt = performance.now() - 16;
        topo.lastRenderAt = 0;
        updateSonicTopographyMotion();
      }
      await wait(320);
      const surface = topo.wallpaperSurface;
      const distance = Number(surface?.userData?.distance) || 0;
      const visibleHeight = 2 * Math.tan(topo.camera.fov * Math.PI / 360) * distance;
      const visibleWidth = visibleHeight * Math.max(0.1, topo.camera.aspect || 1);
      return {
        ...sonicAtmosphereRuntimeSnapshot(),
        wallpaper: {
          enabled: surface?.visible === true,
          loaded: !!topo.wallpaperTexture,
          surface: surface?.userData?.surface || '',
          cameraAnchored: surface?.parent === topo.camera,
          fullViewport: surface?.scale?.x * 2 >= visibleWidth
            && surface?.scale?.y * 2 >= visibleHeight
        }
      };
    })()`);
    const screenshotPayload = await command('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    writeFileSync(sonicScreenshotPath, Buffer.from(screenshotPayload.data, 'base64'));
    sonicScreenshot = { path: sonicScreenshotPath, ...screenshotState };
  }
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
    sonicScreenshot,
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
