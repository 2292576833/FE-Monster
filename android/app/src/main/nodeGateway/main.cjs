"use strict";

const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number.parseInt(argument("--port", "31110"), 10);
const QISHUI_PORT = Number.parseInt(argument("--qishui-port", "31113"), 10);
const MAX_BODY_BYTES = 64 * 1024;
const GATEWAY_TOKEN = argument("--token");
const qqQrCache = new Map();

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function tokenMatches(candidate) {
  if (!GATEWAY_TOKEN || typeof candidate !== "string") return false;
  const expected = Buffer.from(GATEWAY_TOKEN, "utf8");
  const actual = Buffer.from(candidate, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function installWritableRuntimePaths() {
  const dataDir = path.resolve(argument("--data-dir", path.join(os.tmpdir(), "fe-monster-music")));
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.HOME = dataDir;
  process.env.TMPDIR = path.join(dataDir, "tmp");
  process.env.TMP = process.env.TMPDIR;
  process.env.TEMP = process.env.TMPDIR;
  process.env.QISHUI_DEVICE_STATE_FILE = path.join(dataDir, "qishui-device.json");
  fs.mkdirSync(process.env.TMPDIR, { recursive: true });
  return dataDir;
}

function json(response, status, body, cookies = []) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(payload.length),
    "X-Content-Type-Options": "nosniff",
  };
  const safeCookies = (Array.isArray(cookies) ? cookies : [cookies])
    .map((cookie) => String(cookie || "").split(";", 1)[0].trim())
    .filter((cookie) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+=[^\r\n;]*$/.test(cookie));
  if (safeCookies.length) headers["Set-Cookie"] = safeCookies;
  response.writeHead(status, headers);
  response.end(payload);
}

function parseCookie(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("; ");
}

function cookieObject(header) {
  return Object.fromEntries(parseCookie(header)
    .split(";")
    .map((part) => part.trim().split("=", 2))
    .filter((part) => part.length === 2 && part[0]));
}

function accountFromProfile(profile = {}) {
  return {
    userId: String(profile.userId || profile.userid || profile.uid || ""),
    nickname: String(profile.nickname || profile.nickName || profile.username || ""),
    avatarUrl: String(profile.avatarUrl || profile.avatar || profile.avatar_url || ""),
    vipType: profile.vipType || profile.vip || 0,
  };
}

async function bodyParameters(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
    return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed : {};
  } catch {
    throw Object.assign(new Error("request body must be JSON"), { status: 400 });
  }
}

function queryParameters(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function packageRoot(name) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }));
}

function normalizedResult(result) {
  if (!result || typeof result !== "object") return { status: 502, body: { ok: false, error: "empty provider response" }, cookie: [] };
  return {
    status: Number.isInteger(result.status) ? result.status : 200,
    body: result.body && typeof result.body === "object" ? result.body : result,
    cookie: result.cookie || [],
  };
}

function qqKeyParameters(key) {
  const parts = String(key || "").split("|");
  if (parts.length !== 3 || parts[0] !== "qq") return {};
  return { ptqrtoken: parts[1], qrsig: decodeURIComponent(parts[2]) };
}

function qqCacheKey(body = {}) {
  const ptqrtoken = String(body.ptqrtoken || body.ptqrToken || "");
  const qrsig = String(body.qrsig || "");
  return ptqrtoken && qrsig ? `qq|${ptqrtoken}|${encodeURIComponent(qrsig)}` : "";
}

function normalizeQqQrCheck(result, cacheKey) {
  const body = result.body && typeof result.body === "object" ? result.body : {};
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const message = String(body.message || body.msg || data.message || data.msg || "");
  const expired = body.refresh === true || data.refresh === true || /expired|timeout|\u8fc7\u671f|\u5931\u6548/i.test(message);
  const succeeded = body.loggedIn === true || body.success === true || body.isOk === true
    || data.loggedIn === true || data.success === true || data.isOk === true;
  if (expired && body.code === undefined) body.code = 800;
  if (succeeded && body.code === undefined) body.code = 803;
  if ((expired || succeeded) && cacheKey) qqQrCache.delete(cacheKey);
  result.body = body;
  return result;
}

async function invokeProvider(provider, endpoint, params) {
  const cookie = parseCookie(params.cookie);
  if (provider === "netease") {
    const api = require("NeteaseCloudMusicApi");
    const methods = {
      "/login/qr/key": "login_qr_key",
      "/login/qr/create": "login_qr_create",
      "/login/qr/check": "login_qr_check",
      "/login/status": "login_status",
      "/user/playlists": "user_playlist",
    };
    const method = methods[endpoint];
    if (!method || typeof api[method] !== "function") throw Object.assign(new Error("unsupported NetEase endpoint"), { status: 404 });
    const result = normalizedResult(await api[method]({ ...params, cookie }));
    if (endpoint === "/login/status") {
      const profile = result.body?.data?.profile || result.body?.profile || {};
      const account = accountFromProfile(profile);
      return {
        status: result.status,
        body: { ok: result.status < 400, provider, loggedIn: Boolean(account.userId), account },
        cookie: result.cookie,
      };
    }
    return result;
  }

  if (provider === "kugou") {
    const api = require("kugoumusicapi");
    const methods = {
      "/login/qr/key": "login_qr_key",
      "/login/qr/create": "login_qr_create",
      "/login/qr/check": "login_qr_check",
      "/login/status": "login_token",
      "/user/playlists": "user_playlist",
    };
    const method = methods[endpoint];
    if (!method || typeof api[method] !== "function") throw Object.assign(new Error("unsupported Kugou endpoint"), { status: 404 });
    if (endpoint === "/login/status") {
      const saved = cookieObject(cookie);
      if (!saved.token || !saved.userid) {
        return { status: 200, body: { ok: true, provider, loggedIn: false, account: {} }, cookie: [] };
      }
      const result = normalizedResult(await api[method]({ ...params, token: saved.token, userid: saved.userid, cookie }));
      const profile = result.body?.data || result.body || {};
      const account = accountFromProfile({ ...profile, userId: saved.userid });
      return { status: result.status, body: { ok: result.status < 400, provider, loggedIn: true, account }, cookie: result.cookie };
    }
    return normalizedResult(await api[method]({ ...params, cookie }));
  }

  if (provider === "qq") {
    const root = packageRoot("@sansenjian/qq-music-api");
    const getLoginQr = require(path.join(root, "module", "apis", "user", "getQQLoginQr"));
    const checkLoginQr = require(path.join(root, "module", "apis", "user", "checkQQLoginQr"));
    if (endpoint === "/login/qr/key") {
      const result = normalizedResult(await getLoginQr({}));
      const cacheKey = qqCacheKey(result.body);
      if (cacheKey) {
        qqQrCache.clear();
        qqQrCache.set(cacheKey, result);
      }
      return result;
    }
    if (endpoint === "/login/qr/create") {
      const cacheKey = String(params.key || "");
      const cached = cacheKey ? qqQrCache.get(cacheKey) : null;
      if (!cached) throw Object.assign(new Error("QQ QR key is missing or expired"), { status: 410 });
      return cached;
    }
    if (endpoint === "/login/qr/check") {
      const cacheKey = String(params.key || "");
      const result = normalizeQqQrCheck(
        normalizedResult(await checkLoginQr({ params: qqKeyParameters(cacheKey) })),
        cacheKey
      );
      const sessionCookie = String(global.userInfo?.cookie || "");
      if (sessionCookie) result.cookie = sessionCookie.split(";").map((value) => value.trim()).filter(Boolean);
      return result;
    }
    if (endpoint === "/login/status") {
      const cookieValues = cookieObject(cookie);
      const userId = cookieValues.uin || cookieValues.wxuin || "";
      return { status: 200, body: { ok: true, provider: "qq", loggedIn: Boolean(cookie), account: { userId, nickname: userId } }, cookie: [] };
    }
    if (endpoint === "/user/playlists") {
      return { status: 200, body: { ok: true, provider: "qq", loggedIn: Boolean(cookie), playlists: [] }, cookie: [] };
    }
    throw Object.assign(new Error("unsupported QQ endpoint"), { status: 404 });
  }

  throw Object.assign(new Error("unknown provider"), { status: 404 });
}

async function proxyQishui(request, response, endpoint, url, params) {
  const payload = request.method === "GET" ? null : Buffer.from(JSON.stringify(params), "utf8");
  const headers = { Accept: "application/json" };
  headers["X-FE-Android-Gateway-Token"] = GATEWAY_TOKEN;
  const cookie = parseCookie(request.headers.cookie);
  if (cookie) headers.Cookie = cookie;
  if (payload) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Length"] = String(payload.length);
  }
  await new Promise((resolve, reject) => {
    const upstream = http.request({
      hostname: HOST,
      port: QISHUI_PORT,
      method: request.method,
      path: endpoint + url.search,
      headers,
      timeout: 15000,
    }, (result) => {
      const chunks = [];
      result.on("data", (chunk) => chunks.push(chunk));
      result.on("end", () => {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { body = { ok: false, error: "invalid Qishui response" }; }
        json(response, result.statusCode || 502, body, result.headers["set-cookie"] || []);
        resolve();
      });
    });
    upstream.once("error", reject);
    upstream.once("timeout", () => upstream.destroy(new Error("Qishui request timed out")));
    if (payload) upstream.write(payload);
    upstream.end();
  });
}

function startQishui() {
  process.env.PORT = String(QISHUI_PORT);
  process.env.HOST = HOST;
  process.env.FE_ANDROID_GATEWAY_TOKEN = GATEWAY_TOKEN;
  const bundledAdapter = path.join(__dirname, "providers", "qishui.cjs");
  const sourceAdapter = path.resolve(__dirname, "../../../../../data/music-api/packages/qishui-1784315285676/server.cjs");
  require(fs.existsSync(bundledAdapter) ? bundledAdapter : sourceAdapter);
}

async function main() {
  if (!GATEWAY_TOKEN || GATEWAY_TOKEN.length < 32) throw new Error("gateway token is missing");
  if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535
      || !Number.isInteger(QISHUI_PORT) || QISHUI_PORT < 1024 || QISHUI_PORT > 65535
      || PORT === QISHUI_PORT) {
    throw new Error("gateway ports are invalid");
  }
  const dataDir = installWritableRuntimePaths();
  startQishui();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
      if (!tokenMatches(request.headers["x-fe-android-gateway-token"])) {
        json(response, 403, { ok: false, error: "forbidden" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, { ok: true, mode: "android-on-device", node: process.versions.node });
        return;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        json(response, 405, { ok: false, error: "method not allowed" });
        return;
      }
      if (request.method === "GET" && (url.pathname === "/api/providers" || url.pathname === "/api/music-apis")) {
        const providers = [
          { id: "netease", label: "网易云音乐", appName: "网易云音乐", baseUrl: "android://on-device/netease", enabled: true, configured: true, loginQr: true, phoneLogin: false, status: "on-device" },
          { id: "qq", label: "QQ音乐", appName: "QQ音乐", baseUrl: "android://on-device/qq", enabled: true, configured: true, loginQr: true, phoneLogin: false, status: "on-device" },
          { id: "kugou", label: "酷狗音乐", appName: "酷狗音乐", baseUrl: "android://on-device/kugou", enabled: true, configured: true, loginQr: true, phoneLogin: false, status: "on-device" },
          { id: "qishui", label: "汽水音乐", appName: "汽水音乐", baseUrl: "android://on-device/qishui", enabled: true, configured: true, loginQr: false, phoneLogin: true, status: "on-device" },
        ];
        json(response, 200, url.pathname === "/api/providers"
          ? { ok: true, mode: "android-on-device", providers }
          : { ok: true, mode: "android-on-device", providers: providers.map((provider) => ({ ...provider, managed: true })) });
        return;
      }
      const genericProvider = url.pathname === "/api/login/status" ? String(url.searchParams.get("provider") || "") : "";
      const match = genericProvider
        ? [url.pathname, genericProvider, "/login/status"]
        : url.pathname.match(/^\/api\/(netease|qq|kugou|qishui)(\/login\/(?:qr\/(?:key|create|check)|status|phone\/(?:send|verify))|\/user\/playlists)$/);
      if (!match) {
        json(response, 404, { ok: false, error: "endpoint not found" });
        return;
      }
      const provider = match[1];
      const endpoint = match[2];
      if (!/^(netease|qq|kugou|qishui)$/.test(provider)) {
        json(response, 400, { ok: false, error: "unknown provider" });
        return;
      }
      const params = { ...queryParameters(url), ...(await bodyParameters(request)), cookie: request.headers.cookie || "" };
      if (provider === "qishui") {
        await proxyQishui(request, response, endpoint, url, params);
        return;
      }
      const result = await invokeProvider(provider, endpoint, params);
      json(response, result.status, result.body, result.cookie);
    } catch (error) {
      json(response, Number.isInteger(error?.status) ? error.status : 502, {
        ok: false,
        error: error?.message || "provider request failed",
      });
    }
  });
  server.maxConnections = 16;
  server.headersTimeout = 5000;
  server.requestTimeout = 20000;
  server.listen(PORT, HOST, () => {
    console.log(JSON.stringify({ ok: true, mode: "android-on-device", host: HOST, port: PORT, dataDir }));
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeQqQrCheck,
  qqCacheKey,
  qqKeyParameters,
};
