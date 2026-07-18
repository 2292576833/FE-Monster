import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const debugPort = 15000 + (process.pid % 14000);
const profile = path.resolve(tmpdir(), `fe-monster-live-wallpaper-${process.pid}`);
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--autoplay-policy=no-user-gesture-required",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

async function waitForWallpaperMedia(timeout = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const ready = await evaluate(`(() => {
      if (!els.wallpaperImage.hidden) return els.wallpaperImage.complete && els.wallpaperImage.naturalWidth > 0;
      if (!els.wallpaperVideo.hidden) return els.wallpaperVideo.readyState >= 1 && els.wallpaperVideo.videoWidth > 0;
      return false;
    })()`);
    if (ready) return true;
    await delay(100);
  }
  return false;
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
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Page.navigate", { url: `${baseUrl}/?qa=live-wallpaper` });
  await delay(1800);

  await evaluate(`(() => {
    state.wallpapers = [];
    state.wallpaperLoading = false;
    state.wallpaperSource = 'imported';
    state.activeWallpaperId = '';
    state.activeWallpaperIds = { imported: '', live: '' };
    returnHomePage();
    enterPresetPlaybackPage('wallpaper');
    document.querySelector('#diyButton')?.click();
    document.querySelector('#diyWallpaperModeButton')?.click();
  })()`);
  await delay(1400);
  await waitForWallpaperMedia();
  const importedResult = await evaluate(`(() => {
    const imported = state.wallpapers.filter((wallpaper) => wallpaper?.source === 'imported');
    const imageVisible = !els.wallpaperImage.hidden && Boolean(els.wallpaperImage.currentSrc || els.wallpaperImage.src);
    const videoVisible = !els.wallpaperVideo.hidden && Boolean(els.wallpaperVideo.currentSrc || els.wallpaperVideo.src);
    const mediaLoaded = imageVisible
      ? els.wallpaperImage.complete && els.wallpaperImage.naturalWidth > 0
      : videoVisible && els.wallpaperVideo.readyState >= 1 && els.wallpaperVideo.videoWidth > 0;
    const listRect = els.wallpaperList?.getBoundingClientRect();
    const listStyle = els.wallpaperList ? getComputedStyle(els.wallpaperList) : null;
    return {
      source: state.wallpaperSource,
      importedCount: imported.length,
      sceneVisible: !els.wallpaperScene.hidden,
      mediaVisible: imageVisible || videoVisible,
      mediaLoaded,
      imageState: imageVisible ? [els.wallpaperImage.complete, els.wallpaperImage.naturalWidth] : null,
      videoState: videoVisible ? [els.wallpaperVideo.readyState, els.wallpaperVideo.networkState, els.wallpaperVideo.videoWidth, els.wallpaperVideo.error?.code || 0] : null,
      listItemCount: els.wallpaperList?.querySelectorAll('.diy-wallpaper-item').length || 0,
      listVisible: Boolean(listRect?.width > 0 && listRect?.height >= 104 && listStyle?.display !== 'none' && listStyle?.visibility !== 'hidden'),
      listSize: [Math.round(listRect?.width || 0), Math.round(listRect?.height || 0)],
      activeWallpaperId: state.activeWallpaperId,
      status: els.wallpaperStatus.textContent,
    };
  })()`);

  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    let delayImportedRequest = true;
    window.fetch = (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (delayImportedRequest && url.includes('/api/wallpapers?scan=false')) {
        delayImportedRequest = false;
        return new Promise((resolve, reject) => {
          setTimeout(() => originalFetch(input, options).then(resolve, reject), 350);
        });
      }
      return originalFetch(input, options);
    };
    state.wallpapers = [];
    state.wallpaperLoading = false;
    state.wallpaperSource = 'imported';
    state.activeWallpaperId = '';
    state.activeWallpaperIds = { imported: '', live: '' };
    returnHomePage();
    enterPresetPlaybackPage('wallpaper');
    setWallpaperSource('live');
    document.querySelector('#diyButton')?.click();
    document.querySelector('#diyWallpaperModeButton')?.click();
  })()`);

  await delay(1400);
  await waitForWallpaperMedia();

  const result = await evaluate(`(() => {
    const live = state.wallpapers.filter((wallpaper) => wallpaper?.source === 'wallpaper-engine');
    const imageVisible = !els.wallpaperImage.hidden && Boolean(els.wallpaperImage.currentSrc || els.wallpaperImage.src);
    const videoVisible = !els.wallpaperVideo.hidden && Boolean(els.wallpaperVideo.currentSrc || els.wallpaperVideo.src);
    const mediaLoaded = imageVisible
      ? els.wallpaperImage.complete && els.wallpaperImage.naturalWidth > 0
      : videoVisible && els.wallpaperVideo.readyState >= 1 && els.wallpaperVideo.videoWidth > 0;
    const listRect = els.wallpaperList?.getBoundingClientRect();
    const listStyle = els.wallpaperList ? getComputedStyle(els.wallpaperList) : null;
    return {
      source: state.wallpaperSource,
      liveCount: live.length,
      sceneVisible: !els.wallpaperScene.hidden,
      imageVisible,
      videoVisible,
      mediaLoaded,
      imageState: imageVisible ? [els.wallpaperImage.complete, els.wallpaperImage.naturalWidth] : null,
      videoState: videoVisible ? [els.wallpaperVideo.readyState, els.wallpaperVideo.networkState, els.wallpaperVideo.videoWidth, els.wallpaperVideo.error?.code || 0] : null,
      listItemCount: els.wallpaperList?.querySelectorAll('.diy-wallpaper-item').length || 0,
      listVisible: Boolean(listRect?.width > 0 && listRect?.height >= 104 && listStyle?.display !== 'none' && listStyle?.visibility !== 'hidden'),
      listSize: [Math.round(listRect?.width || 0), Math.round(listRect?.height || 0)],
      activeWallpaperId: state.activeWallpaperId,
      status: els.wallpaperStatus.textContent,
    };
  })()`);
  result.imported = importedResult;
  result.ok = importedResult.source === "imported"
    && importedResult.importedCount > 0
    && importedResult.sceneVisible
    && importedResult.mediaVisible
    && importedResult.mediaLoaded
    && importedResult.listItemCount === importedResult.importedCount
    && importedResult.listVisible
    && result.source === "live"
    && result.liveCount > 0
    && result.sceneVisible
    && (result.imageVisible || result.videoVisible)
    && result.mediaLoaded
    && result.listItemCount === result.liveCount
    && result.listVisible;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await delay(500);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot) && existsSync(profile)) rmSync(profile, { recursive: true, force: true });
}
