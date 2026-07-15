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
    let rafFrames = 0;
    const finish = () => {
      const after = window.FeSandboxDiagnostics.freeCube();
      const elapsed = performance.now() - startedAt;
      const tasks = (window.__fePerfLongTasks || []).filter((task) => task.startTime >= startedAt);
      resolve({
        elapsed,
        rafFrames,
        runtimeFrames: after.frameCount - before.frameCount,
        rafFps: elapsed > 0 ? (rafFrames - 1) * 1000 / elapsed : 0,
        presetFps: elapsed > 0 ? (after.frameCount - before.frameCount) * 1000 / elapsed : 0,
        longTaskCount: tasks.length,
        longTaskMs: tasks.reduce((total, task) => total + task.duration, 0),
        maxLongTaskMs: tasks.reduce((maximum, task) => Math.max(maximum, task.duration), 0)
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

  const taskDurationMs = Math.max(0, ((metricsAfter.TaskDuration || 0) - (metricsBefore.TaskDuration || 0)) * 1000);
  const scriptDurationMs = Math.max(0, ((metricsAfter.ScriptDuration || 0) - (metricsBefore.ScriptDuration || 0)) * 1000);
  const checks = {
    presetStarted: setup.active === true && setup.canvasCount === 1,
    interactiveFrameRate: activeSample.presetFps >= 24,
    stableModeFastPath: kernelComparison?.ratio < 0.9,
    boundedLongTasks: activeSample.maxLongTaskMs < 120 && activeSample.longTaskMs < 260,
    hiddenPresetPaused: lifecycle.hiddenFrameDelta <= 1,
    hiddenPollingPaused: lifecycle.hiddenNetworkRequests.length === 0,
    hiddenEventStreamPaused: lifecycle.hiddenEventSourceCount === 0,
    foregroundPresetResumed: lifecycle.resumedFrameDelta >= 5,
    foregroundEventStreamResumed: lifecycle.resumedEventSourceCount >= 1,
    inactivePresetDisposed: lifecycle.inactive.active === false && lifecycle.inactive.canvasCount === 0
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    checks,
    metrics: {
      presetFps: Number(activeSample.presetFps.toFixed(1)),
      rafFps: Number(activeSample.rafFps.toFixed(1)),
      runtimeFrames: activeSample.runtimeFrames,
      rafFrames: activeSample.rafFrames,
      sampleMs: Number(activeSample.elapsed.toFixed(1)),
      taskDurationMs: Number(taskDurationMs.toFixed(1)),
      scriptDurationMs: Number(scriptDurationMs.toFixed(1)),
      longTaskCount: activeSample.longTaskCount,
      longTaskMs: Number(activeSample.longTaskMs.toFixed(1)),
      maxLongTaskMs: Number(activeSample.maxLongTaskMs.toFixed(1)),
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
    hiddenRequests: lifecycle.hiddenNetworkRequests,
    inactive: lifecycle.inactive,
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
