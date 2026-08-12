#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.FE_CLIENT_URL || "http://127.0.0.1:3000";
const provider = process.env.FE_COMMUNITY_PROVIDER || "netease";
const edgePath = process.env.FE_TEST_BROWSER
  || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(edgePath)) throw new Error(`Microsoft Edge not found: ${edgePath}`);

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error("Edge debugging endpoint did not start");
}

const login = await readJson(`${baseUrl}/api/login/status?provider=${encodeURIComponent(provider)}`);
if (login.loggedIn !== true) {
  throw new Error(`The live bootstrap regression requires a logged-in ${provider} account`);
}

const debugPort = 15000 + (process.pid % 12000);
const profile = path.resolve(tmpdir(), `fe-monster-community-bootstrap-${process.pid}`);
const browser = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();

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
  await command("Page.navigate", { url: `${baseUrl}/?qa=logged-in-community-bootstrap` });
  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const started = performance.now();
      while (performance.now() - started < 8000) {
        const meta = document.querySelector('#communityMeta');
        const status = document.querySelector('#communityStatus');
        const feId = document.querySelector('#communityFeId');
        if (meta?.textContent !== '同步音乐平台账号'
          && status?.textContent !== '社区服务准备中'
          && feId?.textContent !== '--------') {
          return {
            ok: true,
            interactiveServices: document.documentElement.dataset.interactiveServices || '',
            meta: meta.textContent,
            status: status.textContent,
            feId: feId.textContent
          };
        }
        await wait(100);
      }
      return {
        ok: false,
        interactiveServices: document.documentElement.dataset.interactiveServices || '',
        loggedIn: document.querySelector('#loginButton')?.classList.contains('is-logged-in') || false,
        meta: document.querySelector('#communityMeta')?.textContent || '',
        status: document.querySelector('#communityStatus')?.textContent || '',
        feId: document.querySelector('#communityFeId')?.textContent || ''
      };
    })()`,
  });
  const result = evaluation.result?.value || {};
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    throw new Error("Logged-in identity stayed in the community syncing placeholder before main-scene entry");
  }
} finally {
  try { socket?.close(); } catch {}
  try { browser.kill(); } catch {}
  const safeTempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(safeTempRoot)) {
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
