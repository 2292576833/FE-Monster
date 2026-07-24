import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jar = path.join(root, "out", "fe-monster-java.jar");
const pluginZip = path.join(root, "dist", "plugins", "FE-Monster-Netease-API-Plugin-4.32.0.zip");
const java = [
  process.env.FE_TEST_JAVA,
  path.join(root, "runtime", "java", "bin", "java.exe"),
  "E:\\java26\\bin\\java.exe",
  "java.exe",
].filter(Boolean).find((candidate) => candidate === "java.exe" || existsSync(candidate));

if (!existsSync(jar)) throw new Error(`Missing FE Monster jar: ${jar}`);
if (!existsSync(pluginZip)) throw new Error(`Missing Netease plugin: ${pluginZip}`);
if (!java) throw new Error("Java runtime was not found");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function portAvailable(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

async function json(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    signal: AbortSignal.timeout(5000),
    ...options,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // The assertion below reports the raw response.
  }
  return { response, payload, text };
}

async function waitForServer(baseUrl, processHandle) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`FE Monster exited with ${processHandle.exitCode}`);
    try {
      const result = await json(baseUrl, "/api/music-apis");
      if (result.response.ok) return;
    } catch {
      // Java is still binding the test port.
    }
    await delay(100);
  }
  throw new Error("FE Monster test server did not start");
}

if (!(await portAvailable(3010))) {
  throw new Error("Port 3010 is already occupied; stop the existing Netease API before running this check");
}

const appPort = await freePort();
const baseUrl = `http://127.0.0.1:${appPort}`;
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "fe-netease-plugin-startup-"));
const dataDir = path.join(tempRoot, "data");
let output = "";
const processHandle = spawn(java, ["-jar", jar, "--server"], {
  cwd: root,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    FE_MONSTER_BIND: "127.0.0.1",
    FE_MONSTER_PORT: String(appPort),
    FE_MONSTER_WEB_ROOT: path.join(root, "web"),
    FE_MONSTER_DATA_DIR: dataDir,
  },
});
for (const stream of [processHandle.stdout, processHandle.stderr]) {
  stream.on("data", (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-12000);
  });
}

try {
  await waitForServer(baseUrl, processHandle);
  const bytes = await readFile(pluginZip);
  const imported = await json(
    baseUrl,
    `/api/music-apis/import?${new URLSearchParams({ name: path.basename(pluginZip), trusted: "true" })}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/zip",
        "x-fe-monster-import": "1",
      },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!imported.response.ok || imported.payload?.ok === false) {
    throw new Error(`Netease plugin import failed: ${imported.text}`);
  }

  const deadline = Date.now() + 14000;
  let status = null;
  while (Date.now() < deadline) {
    status = (await json(baseUrl, "/api/music-apis/status?provider=netease")).payload;
    if (status?.reachable === true) break;
    await delay(250);
  }
  if (status?.reachable !== true) {
    const inventory = (await json(baseUrl, "/api/music-apis")).payload;
    const message = "网易云音乐接口服务未就绪：http://127.0.0.1:3010。请在登录页导入网易云 API 插件";
    const error = new Error(message);
    error.details = { status, inventory, output };
    throw error;
  }

  const login = await json(baseUrl, "/api/netease/login/status");
  const loginCode = Number(login.payload?.code ?? login.payload?.data?.code);
  if (!login.response.ok || loginCode !== 200) {
    throw new Error(`Netease login status route failed: ${login.text}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, status, login: login.payload }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    details: error?.details,
  }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  try {
    await json(baseUrl, "/api/app/quit");
  } catch {
    // Fall through to process cleanup.
  }
  for (let attempt = 0; attempt < 30 && processHandle.exitCode === null; attempt += 1) await delay(100);
  if (processHandle.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(processHandle.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      processHandle.kill("SIGKILL");
    }
  }
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
