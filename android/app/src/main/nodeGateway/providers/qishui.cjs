"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = boundedInteger(process.env.PORT, 3013, 1024, 65535);
const SEARCH_ENDPOINT = "https://api-vehicle.volcengine.com/v2/search/type";
const TRACK_ENDPOINT = "https://music.douyin.com/qishui/share/track";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
const MAX_TRACK_BYTES = 2 * 1024 * 1024;
const MAX_LOGIN_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = 4096;
const SEND_COOLDOWN_MS = 60 * 1000;
const ADAPTER_VERSION = "1.1.0";
const PASSPORT_AID = "386088";
const PASSPORT_VERSION = "3.5.1";
const PASSPORT_SERVICE = "https://api.qishui.com";
const PASSPORT_ORIGIN = passportOrigin();
const ANDROID_GATEWAY_TOKEN = String(process.env.FE_ANDROID_GATEWAY_TOKEN || "");
const PASSPORT_SEND_PATH = "/passport/web/send_code/";
const PASSPORT_VERIFY_PATH = "/passport/web/sms_login/";
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const CODE_PATTERN = /^\d{6}$/;
const cooldownSalt = crypto.randomBytes(32);
const sendCooldowns = new Map();
let lastPhoneSendDiagnostic = {
  ok: true,
  provider: "qishui",
  recordedAt: "",
  requestId: "",
  outcome: "none",
  upstreamHttpStatus: 0,
  upstreamCode: 0,
  retryAfterSeconds: 0,
  detail: "",
};
const passportIdentity = loadPassportIdentity();
const passportDeviceId = passportIdentity.deviceId;
const passportInstallId = passportIdentity.installId;
const SESSION_COOKIE_NAMES = new Set([
  "sessionid", "sessionid_ss", "sid_tt", "sid_guard",
  "uid_tt", "uid_tt_ss", "passport_auth_status", "passport_auth_status_ss",
]);
const FORWARDED_COOKIE_NAMES = new Set([
  ...SESSION_COOKIE_NAMES,
  "passport_csrf_token", "passport_csrf_token_default", "ttwid", "odin_tt",
  "install_id", "store-idc", "store-country-code", "store-country-sign",
]);

function passportOrigin() {
  const configured = String(process.env.QISHUI_PASSPORT_ORIGIN || "https://api.qishui.com").trim();
  const parsed = new URL(configured);
  const official = parsed.protocol === "https:" && parsed.hostname === "api.qishui.com";
  const localTest = (parsed.protocol === "http:" || parsed.protocol === "https:")
    && (parsed.hostname === "127.0.0.1" || parsed.hostname === "::1" || parsed.hostname === "localhost");
  if ((!official && !localTest) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("QISHUI_PASSPORT_ORIGIN must be api.qishui.com or a loopback test server");
  }
  return parsed.origin;
}

function androidGatewayAuthorized(request) {
  if (!ANDROID_GATEWAY_TOKEN) return true;
  const provided = String(request.headers["x-fe-android-gateway-token"] || "");
  const expectedBuffer = Buffer.from(ANDROID_GATEWAY_TOKEN, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function numericDeviceId() {
  const value = BigInt(`0x${crypto.randomBytes(8).toString("hex")}`);
  return String(1000000000000000000n + (value % 8000000000000000000n));
}

function loadPassportIdentity() {
  const configured = String(process.env.QISHUI_DEVICE_STATE_FILE || "").trim();
  const stateFile = configured ? path.resolve(configured) : path.join(__dirname, ".qishui-device.json");
  const read = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (/^\d{19}$/.test(parsed?.deviceId) && /^\d{19}$/.test(parsed?.installId)) return parsed;
    } catch {}
    return null;
  };
  const existing = read();
  if (existing) return existing;

  const created = { deviceId: numericDeviceId(), installId: numericDeviceId() };
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(created), { encoding: "utf8", flag: "wx" });
    return created;
  } catch {
    return read() || created;
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function firstParameter(url, names) {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function sendJson(response, status, body, cookies = []) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (cookies.length) headers["Set-Cookie"] = cookies;
  response.writeHead(status, headers);
  response.end(payload);
}

async function readJsonBody(request) {
  const declared = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (declared > MAX_REQUEST_BYTES) throw requestError(413, "请求体过大");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) throw requestError(413, "请求体过大");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks, length).toString("utf8") || "{}");
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not an object");
    return value;
  } catch {
    throw requestError(400, "请求体必须是 JSON 对象");
  }
}

function requestError(status, message, code = "INVALID_REQUEST") {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

function phoneSendRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

function recordPhoneSendDiagnostic(requestId, outcome, details = {}) {
  lastPhoneSendDiagnostic = {
    ok: true,
    provider: "qishui",
    recordedAt: new Date().toISOString(),
    requestId,
    outcome,
    upstreamHttpStatus: Number.isInteger(details.upstreamHttpStatus) ? details.upstreamHttpStatus : 0,
    upstreamCode: Number.isFinite(Number(details.upstreamCode)) ? Number(details.upstreamCode) : 0,
    retryAfterSeconds: boundedInteger(details.retryAfterSeconds, 0, 1, 600),
    detail: safeString(details.detail, 160),
  };
}

function validatePhone(value) {
  const phone = typeof value === "string" ? value : "";
  if (!PHONE_PATTERN.test(phone)) {
    throw requestError(400, "手机号必须是中国大陆 11 位纯数字号码", "INVALID_PHONE");
  }
  return phone;
}

function validateCode(value) {
  const code = typeof value === "string" ? value : "";
  if (!CODE_PATTERN.test(code)) {
    throw requestError(400, "验证码必须是 6 位纯数字", "INVALID_CODE");
  }
  return code;
}

function phoneKey(phone) {
  return crypto.createHmac("sha256", cooldownSalt).update(phone).digest("hex");
}

function reserveSend(phone) {
  const now = Date.now();
  for (const [key, expiresAt] of sendCooldowns) {
    if (expiresAt <= now) sendCooldowns.delete(key);
  }
  const key = phoneKey(phone);
  const expiresAt = sendCooldowns.get(key) || 0;
  const retryAfter = Math.ceil((expiresAt - now) / 1000);
  if (retryAfter > 0) {
    const error = requestError(429, `请在 ${retryAfter} 秒后重新发送验证码`, "SEND_COOLDOWN");
    error.retryAfterSeconds = retryAfter;
    throw error;
  }
  sendCooldowns.set(key, now + SEND_COOLDOWN_MS);
}

function extendSendCooldown(phone, seconds) {
  const key = phoneKey(phone);
  const expiresAt = Date.now() + boundedInteger(seconds, 60, 1, 600) * 1000;
  sendCooldowns.set(key, Math.max(sendCooldowns.get(key) || 0, expiresAt));
}

function releaseSend(phone) {
  sendCooldowns.delete(phoneKey(phone));
}

function passportMix(value) {
  return [...Buffer.from(String(value), "utf8")]
    .map((byte) => (byte ^ 5).toString(16))
    .join("");
}

function parseCookies(header) {
  const cookies = new Map();
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    const normalizedName = name.toLowerCase();
    if (FORWARDED_COOKIE_NAMES.has(normalizedName) && value) cookies.set(normalizedName, value);
  }
  return cookies;
}

function cookieHeader(cookies) {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return String(value).split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/g);
}

function responseSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  return splitSetCookieHeader(headers.get("set-cookie"));
}

function sanitizeSetCookies(rawCookies) {
  const local = [];
  for (const raw of rawCookies) {
    const pair = String(raw).split(";", 1)[0].trim();
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!FORWARDED_COOKIE_NAMES.has(name.toLowerCase()) || !value || /[\r\n;]/.test(value)) continue;
    local.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return local;
}

function passportQuery(traceId) {
  return new URLSearchParams({
    passport_jssdk_version: "2.4.13",
    passport_jssdk_type: "normal",
    is_from_ttaccountsdk: "1",
    aid: PASSPORT_AID,
    language: "zh",
    account_sdk_source: "web",
    p_js_v: "2.4.13",
    p_js_t: "pro",
    p_zt: "3.3.5",
    p_ver: "1.0.29",
    request_host: "app%3A%2F%2Fresources",
    p_bd: "1.0.0.41",
    is_new_login: "1",
    is_from_iesaccountsaas: "1",
    device_id: passportDeviceId,
    install_id: passportInstallId,
    did: passportDeviceId,
    iid: passportInstallId,
    device_platform: "PC",
    version_code: PASSPORT_VERSION,
    biz_trace_id: traceId,
  });
}

async function passportPost(path, form, incomingCookieHeader) {
  const traceId = crypto.randomBytes(4).toString("hex");
  const url = new URL(path, PASSPORT_ORIGIN);
  url.search = passportQuery(traceId).toString();
  const cookies = parseCookies(incomingCookieHeader);
  const encodedForm = new URLSearchParams(form).toString();
  const headers = {
    Accept: "application/json, text/javascript",
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": USER_AGENT,
    "x-tt-passport-trace-id": traceId,
    "X-SS-STUB": crypto.createHash("md5").update(encodedForm).digest("hex").toUpperCase(),
  };
  const upstreamCookie = cookieHeader(cookies);
  if (upstreamCookie) headers.Cookie = upstreamCookie;
  const csrf = cookies.get("passport_csrf_token") || cookies.get("passport_csrf_token_default");
  if (csrf) headers["x-tt-passport-csrf-token"] = csrf;
  if (path === PASSPORT_VERIFY_PATH) {
    headers["x-tt-passport-verify-portrait"] = `${crypto.randomUUID()}.login`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers,
      body: encodedForm,
    });
    const text = await readBounded(response, MAX_LOGIN_BYTES);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("passport returned invalid JSON");
    }
    return {
      status: response.status,
      payload,
      setCookies: sanitizeSetCookies(responseSetCookies(response.headers)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function upstreamError(upstream, operation) {
  const payload = upstream?.payload;
  if (!Number.isInteger(upstream?.status) || upstream.status < 200 || upstream.status >= 300) {
    return {
      status: 502,
      body: {
        ok: false,
        provider: "qishui",
        code: "UPSTREAM_HTTP_ERROR",
        error: "汽水音乐登录服务暂时不可用，请稍后重试",
        upstreamHttpStatus: Number(upstream?.status) || 0,
      },
    };
  }
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const rawUpstreamCode = data.error_code ?? payload?.error_code;
  const upstreamCode = Number.isFinite(Number(rawUpstreamCode)) ? Number(rawUpstreamCode) : 0;
  const description = safeString(data.description || payload?.description || payload?.message, 160);
  const captchaRequired = Boolean(data.captcha)
    || upstreamCode === 1105 || upstreamCode === 1106 || upstreamCode === 2046;
  if (captchaRequired) {
    return {
      status: 409,
      body: {
        ok: false,
        provider: "qishui",
        code: "CAPTCHA_REQUIRED",
        captchaRequired: true,
        error: "汽水音乐要求额外的人机验证，请在官方客户端完成验证后重试",
        upstreamCode,
      },
    };
  }
  if (upstreamCode === 7) {
    const retryAfterSeconds = boundedInteger(data.retry_time ?? payload?.retry_time, 60, 1, 600);
    return {
      status: 429,
      body: {
        ok: false,
        provider: "qishui",
        code: "UPSTREAM_RATE_LIMITED",
        sent: false,
        error: "汽水音乐官方拒绝了本次验证码发送（请求过于频繁），本次未发送短信。请停止重复点击，稍后在官方客户端完成验证后再试",
        upstreamCode,
        retryAfterSeconds,
        cooldownSeconds: retryAfterSeconds,
      },
    };
  }
  if (upstreamCode === 22 || upstreamCode === 4031) {
    return {
      status: 409,
      body: {
        ok: false,
        provider: "qishui",
        code: "OFFICIAL_CLIENT_REQUIRED",
        error: "汽水音乐拒绝了直接手机号登录，请先在官方客户端完成设备或版本验证",
        upstreamCode,
      },
    };
  }
  return {
    status: 409,
    body: {
      ok: false,
      provider: "qishui",
      code: operation === "verify" ? "VERIFY_REJECTED" : "SEND_REJECTED",
      error: description || (operation === "verify" ? "验证码校验失败" : "验证码发送失败"),
      upstreamCode,
    },
  };
}

function upstreamSucceeded(upstream) {
  if (!Number.isInteger(upstream?.status) || upstream.status < 200 || upstream.status >= 300) return false;
  const payload = upstream?.payload;
  const message = safeString(payload?.message, 40).toLowerCase();
  return message === "success";
}

async function readBounded(response, maximumBytes) {
  const declared = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (declared > maximumBytes) throw new Error("upstream response is too large");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("upstream response is too large");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, length).toString("utf8");
}

async function fetchJson(url, maximumBytes) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
    const text = await readBounded(response, maximumBytes);
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function safeString(value, maximumLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function searchSong(item) {
  const id = safeString(item?.item_id, 32);
  const title = safeString(item?.title, 200);
  if (!/^\d{5,32}$/.test(id) || !title || item?.qishui_label_info?.only_vip_playable === true) return null;
  return {
    id,
    title,
    artist: safeString(item?.author_info?.name, 160),
    album: safeString(item?.collection_name, 200),
    cover: safeString(item?.cover_url, 1000),
    duration: boundedInteger(item?.duration, 0, 0, 24 * 60 * 60),
    provider: "qishui",
  };
}

async function handleSearch(url, response) {
  const keyword = firstParameter(url, ["q", "key", "keyword", "keywords"]);
  if (!keyword || keyword.length > 100) {
    sendJson(response, 400, { ok: false, error: "请输入 1-100 个字符的搜索关键词" });
    return;
  }
  const page = boundedInteger(url.searchParams.get("page"), 1, 1, 100);
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 30);
  const upstream = new URL(SEARCH_ENDPOINT);
  upstream.searchParams.set("keyword", keyword);
  upstream.searchParams.set("search_type", "music");
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("real_offset", String((page - 1) * limit));
  upstream.searchParams.set("search_source", "qishui");

  const payload = await fetchJson(upstream, MAX_SEARCH_BYTES);
  const items = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  const songs = items.map(searchSong).filter(Boolean).slice(0, limit);
  sendJson(response, 200, { ok: true, provider: "qishui", songs });
}

function allowedAudioUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "douyinvod.com" || host.endsWith(".douyinvod.com");
    return url.protocol === "https:" && allowedHost ? url.href : "";
  } catch {
    return "";
  }
}

async function handleSongUrl(url, response) {
  const id = firstParameter(url, ["id", "mid", "songmid", "songid", "hash"]);
  if (!/^\d{5,32}$/.test(id)) {
    sendJson(response, 400, { ok: false, error: "无效的汽水音乐曲目 ID" });
    return;
  }

  const upstream = new URL(TRACK_ENDPOINT);
  upstream.searchParams.set("track_id", id);
  upstream.searchParams.set("__loader", "track_page");
  upstream.searchParams.set("__ssrDirect", "true");
  const payload = await fetchJson(upstream, MAX_TRACK_BYTES);
  const audio = payload?.audioWithLyricsOption;
  if (!audio || audio.status_code !== 0 || audio.hasCopyright === false) {
    sendJson(response, 404, { ok: false, error: "曲目不存在或当前地区不可播放" });
    return;
  }
  if (audio.group_playable_level && audio.group_playable_level !== "free") {
    sendJson(response, 403, { ok: false, error: "该曲目需要汽水音乐会员，未提供绕过播放" });
    return;
  }

  const playableUrl = allowedAudioUrl(audio.url);
  if (!playableUrl) {
    sendJson(response, 404, { ok: false, error: "公开分享页没有可播放地址" });
    return;
  }
  sendJson(response, 200, {
    ok: true,
    provider: "qishui",
    url: playableUrl,
    quality: "standard",
    source: "qishui-public-share",
  });
}

async function handlePhoneSend(request, response) {
  const body = await readJsonBody(request);
  const phone = validatePhone(body.phone);
  const requestId = phoneSendRequestId();
  try {
    reserveSend(phone);
  } catch (error) {
    recordPhoneSendDiagnostic(requestId, "local-cooldown", {
      retryAfterSeconds: error.retryAfterSeconds,
      detail: error.message,
    });
    error.requestId = requestId;
    throw error;
  }
  let upstream;
  try {
    upstream = await passportPost(PASSPORT_SEND_PATH, {
      mobile: passportMix(`+86 ${phone}`),
      mix_mode: "1",
      type: passportMix("24"),
      fixed_mix_mode: "1",
      is6Digits: "1",
    }, request.headers.cookie);
  } catch (error) {
    releaseSend(phone);
    recordPhoneSendDiagnostic(requestId, "transport-error", { detail: error.message });
    error.requestId = requestId;
    throw error;
  }
  if (!upstreamSucceeded(upstream)) {
    const failure = upstreamError(upstream, "send");
    if (failure.body.code === "UPSTREAM_RATE_LIMITED") {
      extendSendCooldown(phone, failure.body.retryAfterSeconds);
    } else {
      releaseSend(phone);
    }
    recordPhoneSendDiagnostic(requestId, ({
      UPSTREAM_RATE_LIMITED: "upstream-rate-limited",
      CAPTCHA_REQUIRED: "captcha-required",
      OFFICIAL_CLIENT_REQUIRED: "official-client-required",
    })[failure.body.code] || "upstream-rejected", {
      upstreamHttpStatus: upstream.status,
      upstreamCode: failure.body.upstreamCode,
      retryAfterSeconds: failure.body.retryAfterSeconds,
      detail: failure.body.error,
    });
    failure.body.requestId = requestId;
    sendJson(response, failure.status, failure.body, upstream.setCookies);
    return;
  }
  const upstreamRetry = boundedInteger(upstream.payload?.data?.retry_time, 60, 1, 600);
  const upstreamData = upstream.payload?.data && typeof upstream.payload.data === "object"
    ? upstream.payload.data
    : {};
  recordPhoneSendDiagnostic(requestId, "accepted-unconfirmed", {
    upstreamHttpStatus: upstream.status,
    upstreamCode: upstreamData.error_code ?? upstream.payload?.error_code,
    retryAfterSeconds: upstreamRetry,
    detail: upstreamData.description || upstream.payload?.message,
  });
  sendJson(response, 200, {
    ok: true,
    provider: "qishui",
    sent: true,
    requestId,
    deliveryConfirmed: false,
    cooldownSeconds: Math.max(60, upstreamRetry),
    message: "验证码已发送",
  }, upstream.setCookies);
}

async function handlePhoneVerify(request, response) {
  const body = await readJsonBody(request);
  const phone = validatePhone(body.phone);
  const code = validateCode(body.code);
  const upstream = await passportPost(PASSPORT_VERIFY_PATH, {
    mobile: passportMix(`+86 ${phone}`),
    code: passportMix(code),
    mix_mode: "1",
    fixed_mix_mode: "1",
    service: PASSPORT_SERVICE,
  }, request.headers.cookie);
  if (!upstreamSucceeded(upstream)) {
    const failure = upstreamError(upstream, "verify");
    sendJson(response, failure.status, failure.body, upstream.setCookies);
    return;
  }

  const returnedCookies = parseCookies(upstream.setCookies.map((value) => value.split(";", 1)[0]).join("; "));
  const existingCookies = parseCookies(request.headers.cookie);
  const hasSession = [...SESSION_COOKIE_NAMES].some((name) => returnedCookies.has(name) || existingCookies.has(name));
  if (!hasSession) {
    sendJson(response, 409, {
      ok: false,
      provider: "qishui",
      code: "ADDITIONAL_VERIFICATION_REQUIRED",
      error: "验证码已通过，但汽水音乐仍要求额外设备验证；请在官方客户端完成后重试",
    }, upstream.setCookies);
    return;
  }

  const data = upstream.payload?.data && typeof upstream.payload.data === "object" ? upstream.payload.data : {};
  sendJson(response, 200, {
    ok: true,
    provider: "qishui",
    loggedIn: true,
    message: "登录成功",
    account: {
      userId: safeString(data.user_id || data.uid || data.userId, 80),
      nickname: safeString(data.nickname || data.name, 120),
      avatarUrl: safeString(data.avatar_url || data.avatar, 1000),
    },
  }, upstream.setCookies);
}

function loginStatus(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  const loggedIn = [...SESSION_COOKIE_NAMES].some((name) => cookies.has(name));
  const userId = safeString(cookies.get("uid_tt") || cookies.get("uid_tt_ss"), 80);
  sendJson(response, 200, {
    ok: true,
    provider: "qishui",
    loggedIn,
    loginQr: false,
    phoneLogin: true,
    account: loggedIn ? {
      userId,
      nickname: "汽水音乐用户",
      avatarUrl: "",
    } : {},
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (!androidGatewayAuthorized(request)) {
      sendJson(response, 403, { ok: false, error: "forbidden" });
      return;
    }
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    if (request.method === "POST" && url.pathname === "/login/phone/send") {
      await handlePhoneSend(request, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/login/phone/verify") {
      await handlePhoneVerify(request, response);
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { ok: false, error: "method not allowed" });
      return;
    }
    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        provider: "qishui",
        mode: "public-free-phone-login",
        phoneLogin: true,
        adapterVersion: ADAPTER_VERSION,
        passportClientVersion: PASSPORT_VERSION,
      });
      return;
    }
    if (url.pathname === "/diagnostics/phone-send") {
      sendJson(response, 200, lastPhoneSendDiagnostic);
      return;
    }
    if (url.pathname === "/login/status" || url.pathname === "/service/status") {
      loginStatus(request, response);
      return;
    }
    if (url.pathname === "/search") {
      await handleSearch(url, response);
      return;
    }
    if (url.pathname === "/song/url") {
      await handleSongUrl(url, response);
      return;
    }
    sendJson(response, 404, { ok: false, error: "endpoint not found" });
  } catch (error) {
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 499) {
      const body = {
        ok: false,
        provider: "qishui",
        code: error.publicCode || "INVALID_REQUEST",
        error: safeString(error.message, 160) || "请求无效",
      };
      if (Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0) {
        body.retryAfterSeconds = error.retryAfterSeconds;
        body.cooldownSeconds = error.retryAfterSeconds;
      }
      if (/^[a-f0-9]{16}$/.test(error.requestId || "")) body.requestId = error.requestId;
      sendJson(response, error.status, body);
      return;
    }
    const timedOut = error?.name === "AbortError";
    sendJson(response, timedOut ? 504 : 502, {
      ok: false,
      error: timedOut ? "汽水音乐请求超时" : `汽水音乐接口暂不可用：${safeString(error?.message, 160) || "unknown error"}`,
    });
  }
});

server.maxConnections = 32;
server.headersTimeout = 5000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 3000;

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(PORT, HOST);
