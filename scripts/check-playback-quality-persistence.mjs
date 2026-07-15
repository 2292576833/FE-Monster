import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const debugPort = 15000 + (process.pid % 14000);
const profile = path.resolve(tmpdir(), `fe-monster-quality-prefs-${process.pid}`);
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
  await command("Page.navigate", { url: `${baseUrl}/?qa=quality-persistence` });
  await delay(1800);
  await evaluate(`localStorage.removeItem('fe-monster-playback-quality-prefs-v1')`);
  await evaluate(`selectPlaybackQuality('higher')`);
  const savedBeforeReload = await evaluate(`localStorage.getItem('fe-monster-playback-quality-prefs-v1')`);
  await command("Page.reload", { ignoreCache: true });
  await delay(1800);
  const result = await evaluate(`({
    saved: localStorage.getItem('fe-monster-playback-quality-prefs-v1'),
    activeProvider: state.activeProvider,
    playbackQuality: state.playbackQuality
  })`);
  result.savedBeforeReload = savedBeforeReload;
  result.ok = Boolean(result.savedBeforeReload)
    && Boolean(result.saved)
    && result.activeProvider === "netease"
    && result.playbackQuality === "higher";
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
