import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const checks = [];
let feProcess = null;
let feOutput = "";
let qishuiServer = null;
let neteaseSentinel = null;
let tempRoot = "";
let managedApiPid = 0;

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  if (details !== undefined) error.details = details;
  throw error;
}

function passed(name, details = {}) {
  checks.push({ name, passed: true, ...details });
}

function compact(value) {
  if (typeof value === "string") return value.slice(0, 1200);
  try {
    return JSON.stringify(value).slice(0, 1200);
  } catch {
    return String(value).slice(0, 1200);
  }
}

async function latestJar() {
  const override = process.env.FE_TEST_JAR || process.argv[2];
  if (override) {
    const resolved = path.resolve(override);
    assert(existsSync(resolved), `FE Monster jar not found: ${resolved}`);
    return resolved;
  }

  const outDir = path.join(workspaceRoot, "out");
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^fe-monster-java(?:-.*)?\.jar$/i.test(entry.name)) continue;
    const candidate = path.join(outDir, entry.name);
    const info = await stat(candidate);
    candidates.push({ candidate, modified: info.mtimeMs, canonical: entry.name === "fe-monster-java.jar" });
  }
  candidates.sort((left, right) => right.modified - left.modified || Number(right.canonical) - Number(left.canonical));
  assert(candidates.length > 0, `No FE Monster jar found under ${outDir}; run build.cmd first`);
  return candidates[0].candidate;
}

function javaExecutable() {
  const candidates = [
    process.env.FE_TEST_JAVA,
    process.env.FE_JAVA_HOME ? path.join(process.env.FE_JAVA_HOME, "bin", "java.exe") : "",
    process.env.FE_JAVA26_HOME ? path.join(process.env.FE_JAVA26_HOME, "bin", "java.exe") : "",
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : "",
    path.join(workspaceRoot, "runtime", "java", "bin", "java.exe"),
    "E:\\java26\\bin\\java.exe",
    "D:\\java26\\bin\\java.exe",
    "C:\\java26\\bin\\java.exe",
    process.platform === "win32" ? "java.exe" : "java",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate !== "java" && candidate !== "java.exe" && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-version"], { encoding: "utf8", windowsHide: true });
    const output = `${probe.stdout || ""}\n${probe.stderr || ""}`;
    const match = output.match(/version\s+"(?:(1)\.)?(\d+)/i);
    const major = match ? Number(match[2]) : 0;
    if (!probe.error && probe.status === 0 && major >= 17) return candidate;
  }
  return "";
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  const closed = new Promise((resolve) => server.close(resolve));
  server.closeAllConnections?.();
  await closed;
}

async function reservePort() {
  const reservation = net.createServer();
  const port = await listen(reservation);
  await closeServer(reservation);
  return port;
}

async function waitForHttp(url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(700) });
      if (response.ok) return response;
    } catch {
      // The managed package is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function createQishuiMock(requests) {
  return http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    requests.push({
      method: request.method || "GET",
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    });

    if (url.pathname === "/" || url.pathname === "/health") {
      jsonResponse(response, 200, { ok: true, service: "qishui-mock" });
      return;
    }
    if (url.pathname === "/search") {
      jsonResponse(response, 200, {
        ok: true,
        data: {
          songs: [{
            id: "qishui-track-1",
            title: "汽水回归测试",
            artist: "FE Monster QA",
            album: "Import Contract",
            duration: 123,
          }],
        },
      });
      return;
    }
    if (url.pathname === "/song/url") {
      jsonResponse(response, 200, {
        ok: true,
        data: { url: `http://127.0.0.1:${serverPort(response)}/audio/qishui-track-1.mp3` },
      });
      return;
    }
    if (url.pathname === "/audio/qishui-track-1.mp3") {
      response.writeHead(200, { "content-type": "audio/mpeg" });
      response.end(Buffer.from([0x49, 0x44, 0x33]));
      return;
    }
    jsonResponse(response, 404, { ok: false, error: `mock endpoint not found: ${url.pathname}` });
  });
}

function serverPort(response) {
  return response.socket?.localPort || 0;
}

function createNeteaseSentinel(requests) {
  return http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    requests.push({ method: request.method || "GET", pathname: url.pathname });
    if (url.pathname.includes("song/url")) {
      jsonResponse(response, 200, { data: [{ url: "https://invalid.example/unknown-provider-fallback.mp3" }] });
      return;
    }
    jsonResponse(response, 200, {
      code: 200,
      result: {
        songs: [{ id: 999999, name: "UNEXPECTED NETEASE FALLBACK", ar: [{ name: "Regression failure" }] }],
      },
    });
  });
}

async function requestJson(baseUrl, pathname, options = {}) {
  const { timeoutMs = 15000, ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    ...requestOptions,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw response in the assertion details below.
  }
  return { status: response.status, payload, text };
}

async function waitForFe(baseUrl, processHandle, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`FE Monster exited during startup with code ${processHandle.exitCode}\n${feOutput}`);
    }
    try {
      const result = await requestJson(baseUrl, "/api/providers", { timeoutMs: 700 });
      if (result.status >= 200 && result.status < 500) return result;
    } catch {
      // The Java HTTP server has not bound its port yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for FE Monster at ${baseUrl}\n${feOutput}`);
}

function objectWithId(value, expectedId, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = objectWithId(item, expectedId, depth + 1);
      if (match) return match;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (String(value.id || "").toLowerCase() === expectedId.toLowerCase()) return value;
  for (const child of Object.values(value)) {
    const match = objectWithId(child, expectedId, depth + 1);
    if (match) return match;
  }
  return null;
}

function providerFrom(payload, id) {
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  return providers.find((provider) => String(provider?.id || "").toLowerCase() === id.toLowerCase()) || null;
}

function stableConfigSignature(value) {
  const volatileKeys = /^(?:error|health|last.*|message|reachable|status|updatedAt|checkedAt)$/i;
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.entries(item)
        .filter(([key]) => !volatileKeys.test(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return JSON.stringify(normalize(value));
}

async function importBinary(baseUrl, name, trusted, body, contentType) {
  const query = new URLSearchParams({ name, trusted: String(trusted) });
  return requestJson(baseUrl, `/api/music-apis/import?${query}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-fe-monster-import": "1",
    },
    body,
    timeoutMs: 20000,
  });
}

function importAccepted(result) {
  return result.status >= 200 && result.status < 300 && result.payload?.ok !== false;
}

function importTrustGated(result) {
  const payload = result.payload || {};
  return result.status >= 400
    || payload.ok === false
    || payload.imported === false
    || payload.accepted === false
    || payload.requiresTrust === true
    || (payload.trusted === false && payload.active !== true && payload.enabled !== true);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function packageManifest(id, label, baseUrl) {
  return {
    schema: "fe-monster.music-api-package/v1",
    id,
    label,
    baseUrl,
    runtime: "node",
    entry: "server.cjs",
    autostart: false,
  };
}

function packageZip(manifest, extraEntries = []) {
  return storedZip([
    { name: "music-api-package.json", data: JSON.stringify(manifest) },
    { name: "server.cjs", data: "\"use strict\";\nmodule.exports = {};\n" },
    ...extraEntries,
  ]);
}

async function findFileNamed(root, expectedName) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.name === expectedName) return target;
      if (entry.isDirectory()) pending.push(target);
    }
  }
  return "";
}

function attachProcessOutput(processHandle) {
  const append = (chunk) => {
    feOutput += chunk.toString("utf8");
    if (feOutput.length > 32000) feOutput = feOutput.slice(-32000);
  };
  processHandle.stdout?.on("data", append);
  processHandle.stderr?.on("data", append);
  processHandle.on("error", append);
}

async function cleanup() {
  if (qishuiServer?.listening) await closeServer(qishuiServer).catch(() => {});
  if (neteaseSentinel?.listening) await closeServer(neteaseSentinel).catch(() => {});
  if (feProcess?.pid && feProcess.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(feProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      feProcess.kill("SIGTERM");
    }
  }
  await delay(150);
  if (managedApiPid && processExists(managedApiPid)) {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(managedApiPid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      try { process.kill(managedApiPid, "SIGKILL"); } catch {}
    }
  }
  const resolvedTemp = tempRoot ? path.resolve(tempRoot) : "";
  const systemTemp = path.resolve(os.tmpdir()) + path.sep;
  if (resolvedTemp.startsWith(systemTemp) && path.basename(resolvedTemp).startsWith("fe-monster-music-api-import-")) {
    await rm(resolvedTemp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}

let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interrupted = true;
    cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

try {
  const jarPath = await latestJar();
  const javaPath = javaExecutable();
  assert(javaPath, "Java runtime not found; set FE_TEST_JAVA or FE_JAVA_HOME");

  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fe-monster-music-api-import-"));
  const dataDir = path.join(tempRoot, "isolated-data");
  const qishuiRequests = [];
  const neteaseRequests = [];

  qishuiServer = createQishuiMock(qishuiRequests);
  const qishuiPort = await listen(qishuiServer);
  const qishuiBaseUrl = `http://127.0.0.1:${qishuiPort}`;

  neteaseSentinel = createNeteaseSentinel(neteaseRequests);
  const neteasePort = await listen(neteaseSentinel);
  const appPort = await reservePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;

  feProcess = spawn(javaPath, ["-jar", jarPath, "--server"], {
    cwd: tempRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FE_MONSTER_BIND: "127.0.0.1",
      FE_MONSTER_PORT: String(appPort),
      FE_MONSTER_WEB_ROOT: path.join(workspaceRoot, "web"),
      FE_MONSTER_DATA_DIR: dataDir,
      FE_MUSIC_API_AUTOSTART: "0",
      FE_NETEASE_BASE_URL: `http://127.0.0.1:${neteasePort}`,
      FE_QQ_AUTOSTART: "0",
      FE_KUGOU_AUTOSTART: "0",
    },
  });
  attachProcessOutput(feProcess);
  await waitForFe(baseUrl, feProcess);
  assert(existsSync(dataDir), `FE_MONSTER_DATA_DIR was not created: ${dataDir}`);
  assert(!existsSync(path.join(tempRoot, "data")), "FE Monster ignored FE_MONSTER_DATA_DIR and wrote to cwd/data");
  passed("isolated FE process started", { appPort, dataDir, jar: path.basename(jarPath) });

  const initialApis = await requestJson(baseUrl, "/api/music-apis");
  assert(initialApis.status === 200, `GET /api/music-apis returned HTTP ${initialApis.status}`, initialApis.text);
  assert(initialApis.payload && typeof initialApis.payload === "object", "GET /api/music-apis did not return JSON", initialApis.text);
  passed("music API inventory route", { status: initialApis.status });

  const guardedConfig = Buffer.from(JSON.stringify({
    providers: [{ id: "qq", baseUrl: qishuiBaseUrl }],
  }), "utf8");
  const missingHeaderImport = await requestJson(baseUrl, "/api/music-apis/import?name=guard.json", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: guardedConfig,
  });
  const evilOriginImport = await requestJson(baseUrl, "/api/music-apis/import?name=guard.json", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-fe-monster-import": "1",
      origin: "http://127.0.0.1:65500",
    },
    body: guardedConfig,
  });
  assert(missingHeaderImport.status === 400, "Import without the local confirmation header was accepted", missingHeaderImport.payload);
  assert(evilOriginImport.status === 400, "Import from a different localhost origin was accepted", evilOriginImport.payload);
  const afterGuardApis = await requestJson(baseUrl, "/api/music-apis");
  assert(objectWithId(afterGuardApis.payload, "qq")?.baseUrl !== qishuiBaseUrl, "Rejected import changed the QQ configuration", afterGuardApis.payload);
  passed("local import CSRF guard", { missingHeader: missingHeaderImport.status, evilOrigin: evilOriginImport.status });

  const malformedImport = await importBinary(
    baseUrl,
    "malformed.json",
    false,
    Buffer.from('{"providers":[x]}', "utf8"),
    "application/json",
  );
  const nestedJson = `${'{"providers":'.repeat(70)}[]${"}".repeat(70)}`;
  const nestedImport = await importBinary(
    baseUrl,
    "too-deep.json",
    false,
    Buffer.from(nestedJson, "utf8"),
    "application/json",
  );
  assert(malformedImport.status === 400, "Malformed JSON import was not rejected", malformedImport.payload);
  assert(nestedImport.status === 400, "Deeply nested JSON import was not rejected", nestedImport.payload);
  passed("strict bounded JSON parsing", { malformed: malformedImport.status, nested: nestedImport.status });

  const jsonProvider = {
    version: 1,
    providers: [{ id: "qq", label: "QQ音乐", baseUrl: qishuiBaseUrl }],
  };
  const jsonImport = await importBinary(
    baseUrl,
    "music-apis.json",
    true,
    Buffer.from(JSON.stringify(jsonProvider), "utf8"),
    "application/json",
  );
  assert(importAccepted(jsonImport), `JSON import was rejected with HTTP ${jsonImport.status}`, jsonImport.text);
  const afterJsonApis = await requestJson(baseUrl, "/api/music-apis");
  const afterJsonProviders = await requestJson(baseUrl, "/api/providers");
  const configuredQq = objectWithId(afterJsonApis.payload, "qq");
  const registeredQq = providerFrom(afterJsonProviders.payload, "qq");
  assert(configuredQq, "JSON QQ import is missing from /api/music-apis", afterJsonApis.payload);
  assert(registeredQq, "JSON QQ import did not update the registered provider", afterJsonProviders.payload);
  assert(String(configuredQq.baseUrl || "") === qishuiBaseUrl, "JSON QQ config did not update baseUrl", configuredQq);
  assert(String(registeredQq.baseUrl || "") === qishuiBaseUrl, "Registered QQ provider kept the old baseUrl", registeredQq);
  passed("JSON provider import", { id: "qq", baseUrl: registeredQq.baseUrl });

  const beforeUntrustedApis = await requestJson(baseUrl, "/api/music-apis");
  const beforeUntrustedProviders = await requestJson(baseUrl, "/api/providers");
  const qishuiSlotBeforeTrustGate = objectWithId(beforeUntrustedApis.payload, "qishui");
  assert(qishuiSlotBeforeTrustGate, "Qishui configuration slot is missing", beforeUntrustedApis.payload);
  assert(qishuiSlotBeforeTrustGate.configured !== true, "Qishui was already configured before the trust-gate test", qishuiSlotBeforeTrustGate);
  assert(!providerFrom(beforeUntrustedProviders.payload, "qishui"), "Qishui was already active before the trust-gate test", beforeUntrustedProviders.payload);
  const untrustedZip = packageZip(packageManifest("qishui", "汽水音乐", qishuiBaseUrl));
  const untrustedImport = await importBinary(baseUrl, "untrusted-runtime.zip", false, untrustedZip, "application/zip");
  const afterUntrustedApis = await requestJson(baseUrl, "/api/music-apis");
  const afterUntrustedProviders = await requestJson(baseUrl, "/api/providers");
  const qishuiSlotAfterTrustGate = objectWithId(afterUntrustedApis.payload, "qishui");
  assert(importTrustGated(untrustedImport), "trusted=false executable ZIP was not trust-gated", untrustedImport.payload);
  assert(qishuiSlotAfterTrustGate?.configured !== true, "trusted=false executable ZIP became configured", qishuiSlotAfterTrustGate);
  assert(
    stableConfigSignature(qishuiSlotAfterTrustGate) === stableConfigSignature(qishuiSlotBeforeTrustGate),
    "trusted=false executable ZIP changed the Qishui configuration slot",
    { before: qishuiSlotBeforeTrustGate, after: qishuiSlotAfterTrustGate },
  );
  assert(!providerFrom(afterUntrustedProviders.payload, "qishui"), "trusted=false executable ZIP became an active provider", afterUntrustedProviders.payload);
  passed("trusted=false runtime gate", { status: untrustedImport.status });

  const qishuiZip = packageZip(packageManifest("qishui", "汽水音乐", qishuiBaseUrl));
  const zipImport = await importBinary(baseUrl, "qishui-api.zip", true, qishuiZip, "application/zip");
  assert(importAccepted(zipImport), `trusted ZIP import was rejected with HTTP ${zipImport.status}`, zipImport.text);
  const afterZipApis = await requestJson(baseUrl, "/api/music-apis");
  const afterZipProviders = await requestJson(baseUrl, "/api/providers");
  const qishuiApi = objectWithId(afterZipApis.payload, "qishui");
  const qishuiProvider = providerFrom(afterZipProviders.payload, "qishui");
  assert(qishuiApi, "Qishui package is missing from /api/music-apis", afterZipApis.payload);
  assert(qishuiProvider, "Qishui package did not register in /api/providers", afterZipProviders.payload);
  assert(String(qishuiProvider.label || "") === "汽水音乐", "Qishui provider label is incorrect", qishuiProvider);
  passed("trusted ZIP provider import", { id: "qishui", label: qishuiProvider.label });

  const qishuiConfigSignature = stableConfigSignature(qishuiApi);
  const qishuiConfiguredBaseUrl = String(qishuiApi.baseUrl || "");
  const qishuiRegisteredBaseUrl = String(qishuiProvider.baseUrl || "");
  const slipMarker = `zip-slip-sentinel-${process.pid}-${Date.now()}.txt`;
  const maliciousZip = packageZip(
    packageManifest("qishui", "汽水音乐", "http://127.0.0.1:1"),
    [
      { name: `../${slipMarker}`, data: "zip-slip must never be extracted" },
      { name: `..\\${slipMarker}.windows`, data: "windows zip-slip must never be extracted" },
    ],
  );
  const maliciousImport = await importBinary(baseUrl, "zip-slip.zip", true, maliciousZip, "application/zip");
  const afterSlipApis = await requestJson(baseUrl, "/api/music-apis");
  const afterSlipProviders = await requestJson(baseUrl, "/api/providers");
  const qishuiAfterSlip = objectWithId(afterSlipApis.payload, "qishui");
  const qishuiProviderAfterSlip = providerFrom(afterSlipProviders.payload, "qishui");
  assert(!importAccepted(maliciousImport), "zip-slip archive was accepted", maliciousImport.payload);
  assert(qishuiAfterSlip, "zip-slip rejection removed the existing Qishui config", afterSlipApis.payload);
  assert(qishuiProviderAfterSlip, "zip-slip rejection removed the active Qishui provider", afterSlipProviders.payload);
  assert(stableConfigSignature(qishuiAfterSlip) === qishuiConfigSignature, "zip-slip rejection changed the Qishui config", {
    before: qishuiApi,
    after: qishuiAfterSlip,
  });
  assert(String(qishuiAfterSlip.baseUrl || "") === qishuiConfiguredBaseUrl, "zip-slip rejection changed configured baseUrl", qishuiAfterSlip);
  assert(String(qishuiProviderAfterSlip.baseUrl || "") === qishuiRegisteredBaseUrl, "zip-slip rejection changed active provider baseUrl", qishuiProviderAfterSlip);
  assert(!await findFileNamed(tempRoot, slipMarker), "zip-slip entry was written under the isolated application root");
  assert(!await findFileNamed(tempRoot, `${slipMarker}.windows`), "Windows zip-slip entry was written under the isolated application root");
  passed("zip-slip archive rejected", { status: maliciousImport.status });

  const search = await requestJson(baseUrl, `/api/search?${new URLSearchParams({ provider: "qishui", q: "测试", limit: "3" })}`);
  assert(search.status === 200 && search.payload?.ok !== false, `Qishui search failed with HTTP ${search.status}`, search.text);
  assert(search.payload?.provider === "qishui", "Qishui search returned the wrong provider", search.payload);
  assert(Array.isArray(search.payload?.songs) && search.payload.songs.length > 0, "Qishui search returned no songs", search.payload);
  assert(search.payload.songs.every((song) => song.provider === "qishui"), "Qishui search songs lost their provider id", search.payload.songs);
  const searchRequest = qishuiRequests.find((request) => request.pathname === "/search"
    && (request.query.q === "测试" || request.query.keyword === "测试"));
  assert(searchRequest, "Qishui mock did not receive /search", qishuiRequests);
  assert(searchRequest.query.q === "测试" || searchRequest.query.keyword === "测试", "Qishui search keyword was not forwarded", searchRequest);

  const songUrl = await requestJson(baseUrl, `/api/song/url?${new URLSearchParams({ provider: "qishui", id: "qishui-track-1", quality: "standard" })}`);
  assert(songUrl.status === 200 && songUrl.payload?.playable === true, `Qishui song URL failed with HTTP ${songUrl.status}`, songUrl.text);
  assert(String(songUrl.payload?.url || "").includes("/audio/qishui-track-1.mp3"), "Qishui song URL is incorrect", songUrl.payload);
  const urlRequest = qishuiRequests.find((request) => request.pathname === "/song/url"
    && [request.query.id, request.query.songid, request.query.songmid].includes("qishui-track-1"));
  assert(urlRequest, "Qishui mock did not receive /song/url", qishuiRequests);
  assert([urlRequest.query.id, urlRequest.query.songid, urlRequest.query.songmid].includes("qishui-track-1"), "Qishui song id was not forwarded", urlRequest);
  passed("Qishui generic search and song URL", { requests: qishuiRequests.length });

  const sentinelCount = neteaseRequests.length;
  const unknownSearch = await requestJson(baseUrl, "/api/search?provider=definitely-unknown&q=must-not-fallback&limit=1");
  const unknownUrl = await requestJson(baseUrl, "/api/song/url?provider=definitely-unknown&id=must-not-fallback");
  assert(neteaseRequests.length === sentinelCount, "Unknown provider silently called the Netease fallback", neteaseRequests.slice(sentinelCount));
  assert(unknownSearch.status < 500 && unknownUrl.status < 500, "Unknown provider caused an internal server error", {
    search: unknownSearch.status,
    songUrl: unknownUrl.status,
  });
  assert(
    unknownSearch.status >= 400 || unknownSearch.payload?.ok === false,
    "Unknown provider search was reported as successful",
    unknownSearch.payload,
  );
  assert(
    unknownUrl.status >= 400 || unknownUrl.payload?.ok === false || unknownUrl.payload?.playable === false,
    "Unknown provider song URL was reported as playable",
    unknownUrl.payload,
  );
  passed("unknown provider does not fall back", { searchStatus: unknownSearch.status, songUrlStatus: unknownUrl.status });

  await closeServer(qishuiServer);
  const unavailableSearch = await requestJson(baseUrl, "/api/search?provider=qishui&q=offline&limit=1", { timeoutMs: 20000 });
  const unavailableUrl = await requestJson(baseUrl, "/api/song/url?provider=qishui&id=qishui-track-1", { timeoutMs: 20000 });
  await delay(200);
  assert(feProcess.exitCode === null, `FE Monster exited after the Qishui API became unavailable (code ${feProcess.exitCode})`, feOutput);
  assert(unavailableSearch.status < 500 && unavailableUrl.status < 500, "Unavailable provider caused an internal server error", {
    search: unavailableSearch.status,
    songUrl: unavailableUrl.status,
  });
  const alive = await requestJson(baseUrl, "/api/providers");
  assert(alive.status === 200 && providerFrom(alive.payload, "qishui"), "FE Monster stopped serving providers after API outage", alive.text);
  passed("missing provider API does not terminate FE", {
    searchStatus: unavailableSearch.status,
    songUrlStatus: unavailableUrl.status,
    processAlive: feProcess.exitCode === null,
  });

  const managedPort = await reservePort();
  const managedBaseUrl = `http://127.0.0.1:${managedPort}`;
  const managedScript = `
    "use strict";
    const http = require("node:http");
    const port = Number(process.env.PORT);
    http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, pid: process.pid, path: request.url }));
    }).listen(port, "127.0.0.1");
  `;
  const managedManifest = {
    ...packageManifest("qishui", "汽水音乐", managedBaseUrl),
    healthPath: "/health",
    autostart: true,
    loginQr: false,
  };
  const managedZip = storedZip([
    { name: "music-api-package.json", data: JSON.stringify(managedManifest) },
    { name: "server.cjs", data: managedScript },
  ]);
  const managedImport = await importBinary(baseUrl, "qishui-managed.zip", true, managedZip, "application/zip");
  assert(importAccepted(managedImport), "Managed Qishui package import failed", managedImport.payload);
  const managedResponse = await waitForHttp(`${managedBaseUrl}/health`);
  const managedPayload = await managedResponse.json();
  managedApiPid = Number(managedPayload.pid) || 0;
  assert(managedApiPid > 0 && processExists(managedApiPid), "Managed API process did not stay alive", managedPayload);
  const packageEntries = await readdir(path.join(dataDir, "music-api", "packages"), { withFileTypes: true });
  const packageDirectories = packageEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert(packageDirectories.length === 1, "Replacing a provider left stale API package directories", packageDirectories);

  const quit = await requestJson(baseUrl, "/api/app/quit");
  assert(quit.status === 200, "FE Monster quit route failed", quit.text);
  for (let attempt = 0; attempt < 80 && feProcess.exitCode === null; attempt += 1) await delay(100);
  for (let attempt = 0; attempt < 40 && processExists(managedApiPid); attempt += 1) await delay(100);
  assert(feProcess.exitCode !== null, "FE Monster did not exit after the quit request", feOutput);
  assert(!processExists(managedApiPid), "Managed API process remained after FE Monster exited", { pid: managedApiPid });
  passed("managed API lifecycle cleanup", { pid: managedApiPid, appExitCode: feProcess.exitCode, packageDirectories });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    jarPath,
    checks,
  }, null, 2)}\n`);
} catch (error) {
  process.exitCode = 1;
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    details: error?.details === undefined ? undefined : compact(error.details),
    checks,
    feOutput: feOutput.slice(-6000),
  }, null, 2)}\n`);
} finally {
  if (!interrupted) await cleanup();
}
