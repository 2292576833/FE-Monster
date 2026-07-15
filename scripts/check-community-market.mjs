import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 10000 + (process.pid % 20000);
const viewportWidth = Math.max(320, Number.parseInt(process.argv[2] || "1024", 10) || 1024);
const profile = path.resolve(tmpdir(), `fe-monster-market-check-${process.pid}`);
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
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
  await command("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: 800,
    deviceScaleFactor: 1,
    mobile: viewportWidth < 640,
  });
  await command("Page.navigate", { url: "http://127.0.0.1:3000/" });
  await delay(1400);

  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const entry = document.querySelector('#communityMarketButton');
      const entryStyle = entry ? getComputedStyle(entry) : null;
      const entryRect = entry ? entry.getBoundingClientRect() : null;
      const entryVisible = Boolean(entry && entryStyle.display !== 'none' && entryStyle.visibility !== 'hidden' && Number(entryStyle.opacity) > 0 && entryRect.width > 0 && entryRect.height > 0);
      const entryInViewport = Boolean(entryRect && entryRect.left >= 0 && entryRect.right <= innerWidth && entryRect.top >= 0 && entryRect.bottom <= innerHeight);
      if (entryVisible) entry.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const marketPage = document.querySelector('#communityProfileMarketPage');
      const pageStyle = marketPage ? getComputedStyle(marketPage) : null;
      const pageRect = marketPage ? marketPage.getBoundingClientRect() : null;
      const pageVisible = Boolean(marketPage && !marketPage.hidden && pageStyle.display !== 'none' && pageStyle.visibility !== 'hidden' && pageRect.width > 0 && pageRect.height > 0);
      return {
        entryFound: Boolean(entry),
        entryVisible,
        entryInViewport,
        entryText: entry ? entry.textContent.trim() : '',
        marketPageVisible: pageVisible,
      };
    })()`,
  });

  const result = evaluation.result.value;
  const visibleMarket = result.entryVisible && result.entryInViewport && result.marketPageVisible;
  process.stdout.write(`${JSON.stringify({ ok: visibleMarket, viewportWidth, ...result }, null, 2)}\n`);
  process.exitCode = visibleMarket ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await delay(750);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot)) {
    for (let attempt = 0; attempt < 8 && existsSync(profile); attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch (error) {
        if (attempt === 7) throw error;
        await delay(250);
      }
    }
  }
}
