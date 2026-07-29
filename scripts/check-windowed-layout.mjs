import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webRoot = path.join(root, "web");
const componentsRoot = path.join(root, "components");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 36000 + Math.floor(Math.random() * 8000);
const testTempRoot = path.join(root, ".tmp");
mkdirSync(testTempRoot, { recursive: true });
const profile = path.join(
  testTempRoot,
  `fe-monster-window-layout-${process.pid}-${Date.now().toString(36)}`
);
const viewports = [
  { width: 1280, height: 720 },
  { width: 1100, height: 700 },
  { width: 960, height: 640 }
];
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end("{}");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const isComponentAsset = requestedPath.startsWith("/components/");
  const staticRoot = isComponentAsset ? componentsRoot : webRoot;
  const relativePath = isComponentAsset
    ? requestedPath.slice("/components/".length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
  });
  response.end(readFileSync(filePath));
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;
let browser;

async function retryJson(url, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {
    }
    await delay(100);
  }
  throw new Error(`Edge debugging endpoint did not start within ${timeout}ms`);
}

function command(method, params = {}, timeout = 40000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out after ${timeout}ms`));
    }, timeout);
    const request = {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      }
    };
    pending.set(id, request);
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      pending.delete(id);
      request.reject(error);
    }
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function listenServer(httpServer, timeout = 2000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      httpServer.off("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    const timer = setTimeout(
      () => finish(new Error(`HTTP test server did not start within ${timeout}ms`)),
      timeout
    );
    httpServer.once("error", onError);
    httpServer.listen(0, "127.0.0.1", () => finish());
  });
}

function waitForSocketOpen(connection, timeout = 3000) {
  if (connection.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.removeEventListener("open", onOpen);
      connection.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onOpen = () => finish();
    const onError = () => finish(new Error("Edge CDP WebSocket failed to open"));
    const timer = setTimeout(
      () => finish(new Error(`Edge CDP WebSocket did not open within ${timeout}ms`)),
      timeout
    );
    connection.addEventListener("open", onOpen, { once: true });
    connection.addEventListener("error", onError, { once: true });
  });
}

function waitForChildExit(child, timeout = 1500) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeout);
    child.once("exit", onExit);
  });
}

async function stopBrowser(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill();
  } catch {
  }
  if (await waitForChildExit(child)) return;
  try {
    child.kill("SIGKILL");
  } catch {
  }
  await waitForChildExit(child, 750);
}

function closeSocket(connection, timeout = 300) {
  if (!connection || connection.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.removeEventListener("close", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeout);
    connection.addEventListener("close", finish, { once: true });
    try {
      connection.close();
    } catch {
      finish();
    }
  });
}

function closeServer(httpServer, timeout = 750) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeout);
    if (!httpServer.listening) {
      httpServer.closeAllConnections?.();
      finish();
      return;
    }
    httpServer.close(finish);
    httpServer.closeIdleConnections?.();
    httpServer.closeAllConnections?.();
  });
}

try {
  await listenServer(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTP test server did not expose a TCP port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  browser = spawn(edge, [
    "--headless=new",
    "--disable-gpu-sandbox",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`, 15000);
  const target = targets.find((entry) => entry.type === "page" && entry.url === "about:blank")
    || targets.find((entry) => entry.type === "page");
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Edge debugging endpoint did not expose a page target");
  }
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await waitForSocketOpen(socket);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const rejectPendingCommands = () => {
    for (const [id, request] of pending) {
      pending.delete(id);
      request.reject(new Error("Edge CDP WebSocket closed before the command completed"));
    }
  };
  socket.addEventListener("close", rejectPendingCommands, { once: true });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await command("Page.navigate", { url: baseUrl });
  await waitFor(`document.readyState === "complete"
    && document.querySelector(".app-shell")
    && document.getElementById("qishuiPlaybackCard")
    && document.getElementById("orbPlaylists")`);

  await evaluate(`(() => {
    const boot = document.getElementById("bootScreen");
    if (boot) boot.hidden = true;
    const style = document.createElement("style");
    style.dataset.windowLayoutProbe = "true";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
    document.head.append(style);
  })()`);

  const results = [];
  for (const viewport of viewports) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height
    });

    const measurement = await evaluate(`(async () => {
      const shell = document.querySelector(".app-shell");
      const card = document.getElementById("qishuiPlaybackCard");
      const phone = document.getElementById("qishuiPlaybackPhone");
      const sidePanel = document.getElementById("orbPlaylists");
      const settingsPanel = document.getElementById("runtimeSettingsPanel");
      const coverFrame = document.getElementById("qishuiPlaybackCoverFrame");
      const coverImage = document.getElementById("qishuiPlaybackCover");
      settingsPanel.hidden = false;
      const settingsPanelStyle = getComputedStyle(settingsPanel);
      const settingsSurfaceStyle = getComputedStyle(settingsPanel.querySelector(".runtime-toggle"));
      const settingsMatte = {
        background: settingsPanelStyle.backgroundColor,
        backgroundImage: settingsPanelStyle.backgroundImage,
        backdropFilter: settingsPanelStyle.backdropFilter || settingsPanelStyle.webkitBackdropFilter,
        surfaceBackground: settingsSurfaceStyle.backgroundColor,
        pass: settingsPanelStyle.backgroundColor === "rgb(11, 12, 14)"
          && settingsPanelStyle.backgroundImage === "none"
          && (settingsPanelStyle.backdropFilter || settingsPanelStyle.webkitBackdropFilter) === "none"
          && settingsSurfaceStyle.backgroundColor === "rgb(17, 19, 22)"
      };
      settingsPanel.hidden = true;
      const coverFixtureUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024' viewBox='0 0 1024 1024'%3E%3Crect width='1024' height='1024' fill='%2388aacc'/%3E%3C/svg%3E";
      coverFrame.classList.add("has-cover");
      coverImage.src = coverFixtureUrl;
      await Promise.race([
        coverImage.decode().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 250))
      ]);
      const selectors = {
        card: "#qishuiPlaybackCard",
        phone: "#qishuiPlaybackPhone",
        content: "#qishuiPlaybackCard .qishui-playback-content",
        viewControls: "#qishuiPlaybackCard .qishui-playback-view-controls",
        tools: "#qishuiPlaybackTools",
        header: "#qishuiPlaybackCard .qishui-playback-header",
        cover: "#qishuiPlaybackCoverFrame",
        lyrics: "#qishuiPlaybackLyrics",
        track: "#qishuiPlaybackCard .qishui-playback-track",
        progress: "#qishuiPlaybackCard .qishui-playback-progress",
        controls: "#qishuiPlaybackCard .qishui-playback-controls",
        sidePanel: "#orbPlaylists"
      };
      const tolerance = 1;
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return {
          left: Number(value.left.toFixed(2)),
          top: Number(value.top.toFixed(2)),
          right: Number(value.right.toFixed(2)),
          bottom: Number(value.bottom.toFixed(2)),
          width: Number(value.width.toFixed(2)),
          height: Number(value.height.toFixed(2))
        };
      };
      const inViewport = (value) => value.left >= -tolerance
        && value.top >= -tolerance
        && value.right <= innerWidth + tolerance
        && value.bottom <= innerHeight + tolerance;
      const contains = (outer, inner) => inner.left >= outer.left - tolerance
        && inner.top >= outer.top - tolerance
        && inner.right <= outer.right + tolerance
        && inner.bottom <= outer.bottom + tolerance;
      const waitForLayout = () => new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          resolve();
        };
        const fallback = setTimeout(finish, 100);
        requestAnimationFrame(() => requestAnimationFrame(finish));
      });
      const prepare = (classes, expanded, panelOpen) => {
        shell.className = classes;
        card.hidden = false;
        card.className = expanded
          ? "qishui-playback-card is-expanded"
          : "qishui-playback-card";
        phone.className = panelOpen
          ? "qishui-playback-phone is-panel-open"
          : "qishui-playback-phone";
        sidePanel.hidden = !panelOpen;
      };
      const capture = (name, panelOpen = false) => {
        const elements = Object.fromEntries(
          Object.entries(selectors)
            .filter(([key]) => panelOpen || key !== "sidePanel")
            .map(([key, selector]) => [key, document.querySelector(selector)])
        );
        const rectangles = Object.fromEntries(
          Object.entries(elements).map(([key, element]) => [key, rect(element)])
        );
        const cardRect = rectangles.card;
        const phoneRect = rectangles.phone;
        const content = elements.content;
        const keyNames = [
          "viewControls", "tools", "header", "cover", "lyrics", "track", "progress", "controls"
        ];
        const keyContainment = Object.fromEntries(
          keyNames.map((key) => [key, contains(phoneRect, rectangles[key])])
        );
        const keyViewportContainment = Object.fromEntries(
          keyNames.map((key) => [key, inViewport(rectangles[key])])
        );
        const viewControls = elements.viewControls;
        const viewControlsRect = rectangles.viewControls;
        const viewButtons = Array.from(viewControls.querySelectorAll(":scope > button")).map((button) => {
          const buttonRect = rect(button);
          const style = getComputedStyle(button);
          return {
            id: button.id,
            rect: buttonRect,
            visible: style.display !== "none"
              && style.visibility !== "hidden"
              && Number(style.opacity) > 0
              && buttonRect.width >= 24
              && buttonRect.height >= 24,
            insideToolbar: contains(viewControlsRect, buttonRect),
            insidePhone: contains(phoneRect, buttonRect),
            inViewport: inViewport(buttonRect),
            overflowX: Math.max(0, button.scrollWidth - button.clientWidth)
          };
        });
        const overflow = {
          contentX: Math.max(0, content.scrollWidth - content.clientWidth),
          contentY: Math.max(0, content.scrollHeight - content.clientHeight),
          viewControlsX: Math.max(0, viewControls.scrollWidth - viewControls.clientWidth),
          phoneLayoutX: Math.max(0, phone.offsetWidth - card.clientWidth),
          phoneLayoutY: Math.max(0, phone.offsetHeight - card.clientHeight),
          keyContentBelowCard: Math.max(
            0,
            ...keyNames.map((key) => rectangles[key].bottom - cardRect.bottom)
          )
        };
        const checks = {
          cardInViewport: inViewport(cardRect),
          phoneInViewport: inViewport(phoneRect),
          phoneLayoutFitsCard: overflow.phoneLayoutX <= tolerance
            && overflow.phoneLayoutY <= tolerance,
          keyContentInsidePhone: Object.values(keyContainment).every(Boolean),
          keyContentInViewport: Object.values(keyViewportContainment).every(Boolean),
          keyContentInsideCard: overflow.keyContentBelowCard <= tolerance,
          noHiddenContentOverflow: overflow.contentX <= tolerance && overflow.contentY <= tolerance,
          allSevenViewButtonsVisible: viewButtons.length === 7
            && viewButtons.every((button) => button.visible),
          viewButtonsNotClipped: overflow.viewControlsX <= tolerance
            && viewButtons.every((button) => (
              button.insideToolbar
              && button.insidePhone
              && button.inViewport
              && button.overflowX <= tolerance
            ))
        };
        if (panelOpen) {
          const panelRect = rectangles.sidePanel;
          const horizontalGap = Number((panelRect.left - cardRect.right).toFixed(2));
          const expandedWithPanel = name === "expanded-side-by-side";
          checks.sidePanelInViewport = inViewport(panelRect);
          checks.cardAndPanelDoNotOverlap = horizontalGap >= -tolerance;
          checks.proportionalPanelWidth = panelRect.width / innerWidth <= 0.36;
          checks.proportionalPlaybackWidth = cardRect.width / innerWidth
              >= (expandedWithPanel ? 0.55 : 0.22)
            && cardRect.width / innerWidth <= (expandedWithPanel ? 0.66 : 0.31);
          return {
            name,
            rectangles,
            keyContainment,
            keyViewportContainment,
            viewButtons,
            overflow,
            horizontalGap,
            checks,
            pass: Object.values(checks).every(Boolean)
          };
        }
        checks.proportionalPlaybackWidth = cardRect.width / innerWidth >= (name === "expanded" ? 0.58 : 0.2)
          && cardRect.width / innerWidth <= (name === "expanded" ? 0.66 : 0.32);
        return {
          name,
          rectangles,
          keyContainment,
          keyViewportContainment,
          viewButtons,
          overflow,
          checks,
          pass: Object.values(checks).every(Boolean)
        };
      };

      prepare("app-shell has-qishui-playback-card is-playback-page", false, false);
      await waitForLayout();
      const defaultCard = capture("default");

      prepare("app-shell has-qishui-playback-card is-playback-page", true, false);
      await waitForLayout();
      const expandedCard = capture("expanded");

      prepare(
        "app-shell has-qishui-playback-card has-playback-side-panel is-playback-page is-playback-playlist-picker-open",
        false,
        true
      );
      await waitForLayout();
      const sideBySide = capture("side-by-side", true);

      prepare(
        "app-shell has-qishui-playback-card has-playback-side-panel is-playback-page is-playback-playlist-picker-open",
        true,
        true
      );
      await waitForLayout();
      const expandedSideBySide = capture("expanded-side-by-side", true);

      setDiyOpen(false);
      enterPresetPlaybackPage("topography");
      openPlaybackDiyPanel("preset");
      await waitForLayout();
      const sidebar = document.getElementById("diySidebar");
      const settingsGroup = document.getElementById("scenePresetSettingsGroup");
      const settingsContent = document.getElementById("scenePresetSettingsContent");
      const wallpaperFeatureGroup = document.getElementById("sceneWallpaperFeatureGroup");
      const wallpaperControl = document.getElementById("sceneWallpaperControl");
      const sonicControls = document.getElementById("sonicPresetControls");
      if (settingsGroup) settingsGroup.open = true;
      wallpaperControl?.scrollIntoView({ block: "start", inline: "nearest" });
      await waitForLayout();
      const sidebarRect = sidebar ? rect(sidebar) : null;
      const wallpaperRect = wallpaperControl ? rect(wallpaperControl) : null;
      const wallpaperButtons = Array.from(
        wallpaperControl?.querySelectorAll(".scene-wallpaper-actions button") || []
      ).map((button) => {
        const buttonRect = rect(button);
        return {
          id: button.id,
          rect: buttonRect,
          label: button.textContent.trim(),
          clippedText: button.scrollWidth > button.clientWidth + tolerance,
          insideWallpaper: !!wallpaperRect && contains(wallpaperRect, buttonRect),
          insideSidebarHorizontally: !!sidebarRect
            && buttonRect.left >= sidebarRect.left - tolerance
            && buttonRect.right <= sidebarRect.right + tolerance
        };
      });
      const scenePresetControls = {
        groupInScenePage: document.getElementById("diyPresetPage")?.contains(settingsGroup) === true,
        groupVisible: settingsGroup?.hidden === false
          && getComputedStyle(settingsGroup).display !== "none",
        title: document.getElementById("scenePresetSettingsTitle")?.textContent.trim() || "",
        meta: document.getElementById("scenePresetSettingsMeta")?.textContent.trim() || "",
        sonicVisible: sonicControls?.hidden === false,
        wallpaperVisible: wallpaperControl?.hidden === false,
        foreignControlsHidden: [
          "diyCoverParticleControl",
          "diyCubeIntensityControl",
          "freeCubePresetControls",
          "chladniPresetControls",
          "stormPresetLightingQuickControls"
        ].every((id) => document.getElementById(id)?.hidden === true),
        wallpaperBeforeSonic: !!settingsContent && !!wallpaperControl && !!sonicControls
          && wallpaperControl.offsetTop < sonicControls.offsetTop
          && !!wallpaperFeatureGroup
          && Number.parseInt(getComputedStyle(wallpaperFeatureGroup).order, 10) < 0,
        horizontalOverflow: sidebar
          ? Math.max(0, sidebar.scrollWidth - sidebar.clientWidth)
          : Number.POSITIVE_INFINITY,
        wallpaperButtons,
        pass: false
      };
      scenePresetControls.pass = scenePresetControls.groupInScenePage
        && scenePresetControls.groupVisible
        && scenePresetControls.title.startsWith("Sonic")
        && scenePresetControls.meta.includes("Sonic")
        && scenePresetControls.sonicVisible
        && scenePresetControls.wallpaperVisible
        && scenePresetControls.foreignControlsHidden
        && scenePresetControls.wallpaperBeforeSonic
        && scenePresetControls.horizontalOverflow <= tolerance
        && wallpaperButtons.length === 3
        && wallpaperButtons.every((button) => (
          button.label.length > 0
          && button.clippedText === false
          && button.insideWallpaper
          && button.insideSidebarHorizontally
        ));
      setDiyOpen(false);
      returnHomePage();

      return {
        viewport: { width: innerWidth, height: innerHeight },
        states: [defaultCard, expandedCard, sideBySide, expandedSideBySide],
        settingsMatte,
        scenePresetControls,
        pass: [defaultCard, expandedCard, sideBySide, expandedSideBySide]
          .every((state) => state.pass)
          && settingsMatte.pass
          && scenePresetControls.pass
      };
    })()`, true);
    results.push(measurement);
  }

  const output = {
    pass: results.every((result) => result.pass),
    results
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = output.pass ? 0 : 1;
} finally {
  await closeSocket(socket);
  await stopBrowser(browser);
  await closeSocket(socket);
  await closeServer(server);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
  }
}
