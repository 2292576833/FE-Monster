import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const webRoot = path.join(root, "android", "app", "build", "generated", "feMonsterWebAssets", "fe-monster-web");
const mainActivityPath = path.join(root, "android", "app", "src", "main", "java", "com", "femonster", "mobile", "MainActivity.java");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = path.join(tmpdir(), `fe-monster-android-check-${process.pid}`);
const debugPort = 19000 + (process.pid % 10000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(path.join(webRoot, "index.html"))) {
  throw new Error(`Android generated web assets are missing: ${webRoot}`);
}

const mainActivitySource = readFileSync(mainActivityPath, "utf8");
const javaSection = (start, end) => {
  const startIndex = mainActivitySource.indexOf(start);
  const endIndex = mainActivitySource.indexOf(end, startIndex + start.length);
  return startIndex >= 0 && endIndex > startIndex ? mainActivitySource.slice(startIndex, endIndex) : "";
};
const loadServerSection = javaSection("private void loadServer", "private boolean configurePublicAccessCookie");
const navigationSection = javaSection("public boolean shouldOverrideUrlLoading", "public void onPageStarted");
const errorSection = javaSection("public void onReceivedError", "public void onReceivedSslError");
const renderGoneSection = javaSection("public boolean onRenderProcessGone", "private WebResourceResponse bundledWebResponse");
const nativeShellContract = {
  launchUsesBundledDocument: loadServerSection.includes("loadBundledClient()") && !loadServerSection.includes("webView.loadUrl("),
  bundledIndexReadFromApk: mainActivitySource.includes('readBundledTextAsset(BUNDLED_WEB_ROOT + "index.html")'),
  remoteOriginIsBaseOnly: mainActivitySource.includes('loadDataWithBaseURL(serverOrigin, html, "text/html", "UTF-8", serverOrigin)'),
  trustedMainFrameNavigationStaysBundled: navigationSection.includes("view.post(MainActivity.this::loadBundledClient)") && navigationSection.includes("return true;"),
  mainFrameFailureKeepsLocalUi: errorSection.includes("view.post(MainActivity.this::loadBundledClient)") && !errorSection.includes("showConnectPanel("),
  rendererRecoveryUsesBundledDocument: renderGoneSection.includes("loadBundledClient();") && !renderGoneSection.includes("showConnectPanel(")
};
const nativeShellFailures = Object.entries(nativeShellContract)
  .filter(([, passed]) => !passed)
  .map(([name]) => `native shell contract failed: ${name}`);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".glb", "model/gltf-binary"],
  [".bin", "application/octet-stream"]
]);
let fixtureOnline = false;

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/__fixture/online" || url.pathname === "/__fixture/offline") {
    fixtureOnline = url.pathname.endsWith('/online');
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (url.pathname === "/health" || url.pathname.startsWith("/api/")) {
    const body = Buffer.from(JSON.stringify(fixtureOnline
      ? { ok: true, mode: "android-test" }
      : { ok: false, error: "offline test fixture" }));
    response.writeHead(fixtureOnline ? 200 : 503, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    response.end(body);
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(webRoot, relative);
  if (!filePath.startsWith(path.resolve(webRoot) + path.sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
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
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
let fetchPauseHandler = null;

async function retryJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Browser is still starting.
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result.value;
}

function assertionsFor(report) {
  const failures = [];
  if (!report.mobileRuntime) failures.push("Android runtime asset was not loaded before app.js");
  if (report.platform !== "android") failures.push("Android platform marker is missing");
  if (report.performanceTier !== "low") failures.push(`low-RAM fixture selected ${report.performanceTier || "no"} performance tier`);
  if (report.renderTier !== "economy") failures.push(`low-RAM fixture selected ${report.renderTier || "no"} render tier`);
  if (report.serverState !== "offline") failures.push("offline server state is not explicit");
  if (!report.offlineNoticeVisible) failures.push("offline notice is not visible");
  if (report.sandboxDisabled !== true) failures.push("sandbox entry is not marked offline");
  if (report.onlineRecovery !== true) failures.push("server reconnect did not re-enable sandbox/community");
  if (report.outOfBounds.length) failures.push(`out-of-bounds controls: ${report.outOfBounds.join(", ")}`);
  if (report.smallTargets.length) failures.push(`touch targets below 44px: ${report.smallTargets.join(", ")}`);
  if (report.overlaps.length) failures.push(`overlapping controls: ${report.overlaps.join(", ")}`);
  if (!report.localAudioInputReady) failures.push("local audio importer is unavailable offline");
  return failures;
}

const viewports = [
  { name: "phone-portrait", width: 360, height: 800 },
  { name: "small-phone-portrait", width: 320, height: 568 },
  { name: "phone-landscape", width: 800, height: 360 }
];

const reports = [];
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
    if (message.method === "Fetch.requestPaused" && fetchPauseHandler) {
      void fetchPauseHandler(message.params);
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const bridge = {
        getDeviceId: () => 'android-layout-fixture',
        getPlatform: () => 'android',
        getServerUrl: () => location.origin + '/',
        getPerformanceTier: () => 'low',
        showMessage: () => {},
        beginDownload: () => '',
        appendDownload: () => false,
        finishDownload: () => {},
        cancelDownload: () => {}
      };
      Object.defineProperty(window, 'FeMonsterAndroid', { value: bridge, configurable: false });
      window.feMonsterPlatform = 'android';
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.fePlatform = 'android';
      }, { once: true });
    })();`
  });

  const closedPortProbe = createServer();
  await new Promise((resolve, reject) => {
    closedPortProbe.once("error", reject);
    closedPortProbe.listen(0, "127.0.0.1", resolve);
  });
  const closedPort = closedPortProbe.address().port;
  await new Promise((resolve) => closedPortProbe.close(resolve));
  const unreachableOrigin = `http://127.0.0.1:${closedPort}`;
  fetchPauseHandler = async ({ requestId, request }) => {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.pathname === "/health" || requestUrl.pathname.startsWith("/api/")) {
        await command("Fetch.failRequest", { requestId, errorReason: "ConnectionRefused" });
        return;
      }
      const relative = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
      const filePath = path.resolve(webRoot, relative);
      const insideBundle = filePath.startsWith(path.resolve(webRoot) + path.sep);
      if (!insideBundle || !existsSync(filePath) || !statSync(filePath).isFile() || statSync(filePath).size > 8 * 1024 * 1024) {
        await command("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" });
        return;
      }
      const body = readFileSync(filePath);
      await command("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream" },
          { name: "Cache-Control", value: "no-store" },
          { name: "X-FE-Client-Source", value: "apk-bundled-test" }
        ],
        body: body.toString("base64")
      });
    } catch {
      await command("Fetch.failRequest", { requestId, errorReason: "Failed" });
    }
  };
  await command("Fetch.enable", {
    patterns: [{ urlPattern: `${unreachableOrigin}/*`, requestStage: "Request" }]
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 800,
    deviceScaleFactor: 2,
    mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await command("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 12; FE-Monster-Test) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
  });
  await command("Page.navigate", { url: `${unreachableOrigin}/?android-unreachable-origin=1` });
  await delay(2400);
  const unreachableOriginReport = await evaluate(`(() => {
    const sandbox = document.getElementById('sandboxModeButton');
    return {
      origin: location.origin,
      appShellReady: Boolean(document.querySelector('.app-shell')),
      bundledRuntimeReady: Boolean(window.__feMonsterAndroidMobileRuntime),
      clientSource: document.documentElement.dataset.feClientSource || '',
      serverState: document.documentElement.dataset.feServerState || '',
      localAudioInputReady: Boolean(document.getElementById('localPlaylistInput')?.multiple),
      sandboxDisabled: sandbox?.getAttribute('aria-disabled') === 'true'
    };
  })()`);
  const unreachableOriginFailures = [];
  if (unreachableOriginReport.origin !== unreachableOrigin) unreachableOriginFailures.push("unreachable server origin was not retained as the document origin");
  if (!unreachableOriginReport.appShellReady) unreachableOriginFailures.push("bundled local UI did not boot with the target origin unreachable");
  if (!unreachableOriginReport.bundledRuntimeReady || unreachableOriginReport.clientSource !== "apk-bundled") {
    unreachableOriginFailures.push("Android bundled runtime did not initialize with the target origin unreachable");
  }
  if (unreachableOriginReport.serverState !== "offline") unreachableOriginFailures.push("unreachable server was not reported offline");
  if (!unreachableOriginReport.localAudioInputReady) unreachableOriginFailures.push("local audio import was unavailable with the target origin unreachable");
  if (!unreachableOriginReport.sandboxDisabled) unreachableOriginFailures.push("server-only sandbox was not disabled with the target origin unreachable");
  await command("Fetch.disable");
  fetchPauseHandler = null;

  for (const viewport of viewports) {
    await fetch(`${baseUrl}/__fixture/offline`, { method: 'POST' });
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: {
        type: viewport.width > viewport.height ? "landscapePrimary" : "portraitPrimary",
        angle: viewport.width > viewport.height ? 90 : 0
      }
    });
    await command("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (Linux; Android 12; FE-Monster-Test) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"
    });
    await command("Page.navigate", { url: `${baseUrl}/?android-check=${viewport.name}` });
    await delay(2400);

    const report = await evaluate(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const boot = document.getElementById('bootScreen');
      if (boot) boot.hidden = true;
      const shell = document.querySelector('.app-shell');
      shell?.classList.add('is-dock-pinned');
      if (typeof setDiyOpen === 'function') setDiyOpen(true);
      if (typeof setDiyCardOpen === 'function') setDiyCardOpen(true);
      await wait(420);

      const visible = (node) => {
        if (!node || node.hidden) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05
          && rect.width > 0 && rect.height > 0;
      };
      const rectOf = (selector) => {
        const node = document.querySelector(selector);
        if (!visible(node)) return null;
        const rect = node.getBoundingClientRect();
        return { selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const targetSelectors = [
        '#sandboxModeButton', '#runtimeSettingsButton', '#neteaseLoginButton', '#diyButton',
        '#topSearchForm', '#topSearchForm .top-search-submit',
        '#prevButton', '#playButton', '#nextButton', '#dockQualityButton', '#dockFavoriteButton', '#dockPinButton',
        '#diyPresetButton', '#diyTextModeButton', '#diyWallpaperModeButton', '#diyCloseButton'
      ];
      const targets = targetSelectors.map(rectOf).filter(Boolean);
      const smallTargets = targets.filter((item) => item.width < 43.5 || item.height < 43.5)
        .map((item) => item.selector + ':' + Math.round(item.width) + 'x' + Math.round(item.height));
      const outOfBounds = targets.filter((item) => item.left < -1 || item.top < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1)
        .map((item) => item.selector);

      const topSelectors = ['#sandboxModeButton', '#runtimeSettingsButton', '#neteaseLoginButton', '#diyButton', '#homeButton', '#topSearchForm'];
      const topRects = topSelectors.map(rectOf).filter(Boolean);
      const overlaps = [];
      for (let left = 0; left < topRects.length; left += 1) {
        for (let right = left + 1; right < topRects.length; right += 1) {
          const a = topRects[left];
          const b = topRects[right];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) overlaps.push(a.selector + '+' + b.selector);
        }
      }

      const notice = document.getElementById('feMonsterAndroidOfflineNotice');
      const sandbox = document.getElementById('sandboxModeButton');
      const offlineSnapshot = {
        mobileRuntime: Boolean(window.__feMonsterAndroidMobileRuntime),
        platform: document.documentElement.dataset.fePlatform || '',
        performanceTier: window.feMonsterAndroidPerformanceTier || document.documentElement.dataset.androidPerformance || '',
        renderTier: document.documentElement.dataset.renderTier || '',
        serverState: document.documentElement.dataset.feServerState || '',
        offlineNoticeVisible: visible(notice),
        sandboxDisabled: sandbox?.getAttribute('aria-disabled') === 'true',
        localAudioInputReady: Boolean(document.getElementById('localPlaylistInput')?.multiple),
        smallTargets,
        outOfBounds,
        overlaps,
        viewport: { width: innerWidth, height: innerHeight }
      };
      await fetch('/__fixture/online', { method: 'POST' });
      window.dispatchEvent(new Event('online'));
      await wait(500);
      offlineSnapshot.onlineRecovery = document.documentElement.dataset.feServerState === 'online'
        && sandbox?.getAttribute('aria-disabled') === 'false'
        && document.getElementById('feMonsterAndroidOfflineNotice')?.hidden === true;
      return offlineSnapshot;
    })()`);
    const failures = assertionsFor(report);
    reports.push({ name: viewport.name, report, failures });
  }

  const ok = nativeShellFailures.length === 0
    && unreachableOriginFailures.length === 0
    && reports.every((item) => item.failures.length === 0);
  console.log(JSON.stringify({
    ok,
    nativeShell: { contract: nativeShellContract, failures: nativeShellFailures },
    unreachableOrigin: { report: unreachableOriginReport, failures: unreachableOriginFailures },
    reports
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  server.close();
  await delay(120);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); } catch {}
}
