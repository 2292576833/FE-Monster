import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jarPath = path.resolve(process.env.FE_TEST_JAR || process.argv[2] || path.join(workspaceRoot, "out", "fe-monster-java.jar"));
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const javaCandidates = [
  process.env.FE_JAVA_HOME ? path.join(process.env.FE_JAVA_HOME, "bin", "java.exe") : "",
  "E:\\java26\\bin\\java.exe",
  "D:\\java26\\bin\\java.exe",
  "C:\\java26\\bin\\java.exe",
  "java.exe",
].filter(Boolean);
const javaPath = javaCandidates.find((candidate) => candidate === "java.exe" || existsSync(candidate));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const offlineSettleMs = Math.max(0, Number(process.env.FE_TEST_OFFLINE_SETTLE_MS || 250));

if (!existsSync(jarPath)) throw new Error(`FE Monster jar not found: ${jarPath}`);
if (!existsSync(edgePath)) throw new Error(`Microsoft Edge not found: ${edgePath}`);
if (!javaPath) throw new Error("Java runtime not found");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function waitForJson(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response.json();
    } catch {
      // The local Java server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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

const fakeCommunity = http.createServer((request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ ok: true, service: "fe-monster-community" }));
});

const communityPort = await listen(fakeCommunity);
const portReservation = net.createServer();
const appPort = await listen(portReservation);
await close(portReservation);

const javaServer = spawn(javaPath, ["-jar", jarPath, "--server"], {
  cwd: workspaceRoot,
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    FE_MUSIC_API_AUTOSTART: "0",
    FE_MONSTER_BIND: "127.0.0.1",
    FE_MONSTER_PORT: String(appPort),
    FE_MONSTER_COMMUNITY_URL: `http://127.0.0.1:${communityPort}`,
  },
});

const debugPort = 13000 + (process.pid % 16000);
const browserProfile = path.resolve(tmpdir(), `fe-monster-community-offline-${process.pid}`);
let browser;
let socket;
let nextId = 1;
const pending = new Map();

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const stateUrl = `${baseUrl}/api/community/state?provider=netease`;
  const initiallyOnline = await waitForJson(stateUrl);
  await close(fakeCommunity);
  await delay(offlineSettleMs);
  const afterServerStop = await waitForJson(stateUrl, 20);

  browser = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${browserProfile}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

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
  await command("Page.navigate", { url: `${baseUrl}/?qa=community-offline` });
  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const started = performance.now();
      while (performance.now() - started < 8000) {
        const card = document.querySelector('#communityCard');
        if (card?.dataset?.serverState) break;
        await wait(100);
      }
      const card = document.querySelector('#communityCard');
      const market = document.querySelector('#communityMarketButton');
      const messages = document.querySelector('#communityMessageButton');
      return {
        offlineClass: Boolean(card?.classList.contains('is-server-offline')),
        serverState: card?.dataset?.serverState || '',
        status: document.querySelector('#communityStatus')?.textContent?.trim() || '',
        networkActionsDisabled: Boolean(market?.disabled && messages?.disabled),
      };
    })()`,
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text || "Offline UI evaluation failed");

  const result = {
    jarPath,
    configuredServerUrl: `http://127.0.0.1:${communityPort}`,
    reportedServerUrl: afterServerStop.serverUrl,
    offlineSettleMs,
    initialServerOnline: initiallyOnline.serverOnline,
    afterStopServerOnline: afterServerStop.serverOnline,
    afterStopOk: afterServerStop.ok,
    ...evaluation.result.value,
  };
  result.ok = result.initialServerOnline === true
    && result.reportedServerUrl === result.configuredServerUrl
    && result.afterStopServerOnline === false
    && result.afterStopOk === false
    && result.offlineClass
    && result.serverState === "offline"
    && result.networkActionsDisabled;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (fakeCommunity.listening) await close(fakeCommunity);
  if (browser?.pid) {
    spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  if (javaServer?.pid) {
    spawnSync("taskkill.exe", ["/PID", String(javaServer.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  await delay(300);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (browserProfile.startsWith(tempRoot) && existsSync(browserProfile)) {
    try {
      rmSync(browserProfile, { recursive: true, force: true });
    } catch {
      // Edge may release its final cache handles just after taskkill.
    }
  }
}
