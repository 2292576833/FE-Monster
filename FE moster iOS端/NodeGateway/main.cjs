"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const LOOPBACK_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_QR_IMAGE_BYTES = 1024 * 1024;
const MAX_PLAYLIST_TRACKS = 1000;
const MAX_PLAYLISTS = 1000;
const MAX_QR_ATTEMPTS = 6;
const MAX_QR_ATTEMPTS_PER_PROVIDER = 2;
const QR_ATTEMPT_MIN_INTERVAL_MS = 1000;
const ATTEMPT_TTL_MS = 5 * 60 * 1000;
const VAULT_AAD = Buffer.from("FE moster iOS music sessions v1", "utf8");
const PROVIDERS = new Set(["netease", "qq", "kugou"]);
const QQ_CHECK_SIG_HOSTS = new Set([
  "ptlogin2.qq.com",
  "ssl.ptlogin2.graph.qq.com",
  "ssl.ptlogin2.qq.com",
]);
const COOKIE_ATTRIBUTES = new Set([
  "domain", "expires", "httponly", "max-age", "path", "samesite", "secure"
]);
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

for (const method of ["debug", "error", "info", "log", "warn"]) {
  console[method] = () => {};
}

function argument(name, fallback = "", argv = process.argv) {
  const inlinePrefix = `${name}=`;
  const inline = argv.slice(2).find((value) => String(value).startsWith(inlinePrefix));
  if (inline) return String(inline).slice(inlinePrefix.length);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? String(argv[index + 1]) : fallback;
}

function requiredArgument(name, argv = process.argv) {
  const value = argument(name, "", argv);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePort(raw) {
  const value = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(value) || (value !== 0 && value < 1024) || value > 65535) {
    throw new Error("gateway port is invalid");
  }
  return value;
}

function decodeVaultKey(value) {
  const key = Buffer.from(String(value), "base64url");
  if (key.length !== 32) throw new Error("vault key must contain exactly 32 random bytes");
  return key;
}

function timingSafeTextEqual(expectedText, actualText) {
  if (!expectedText || typeof actualText !== "string") return false;
  const expected = Buffer.from(expectedText, "utf8");
  const actual = Buffer.from(actualText, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function bearerFrom(request) {
  const value = String(request.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function installWritableRuntimePaths(dataDirValue) {
  const dataDir = path.resolve(dataDirValue || path.join(os.tmpdir(), "fe-monster-ios-music"));
  const tempDir = path.join(dataDir, "tmp");
  const cacheDir = path.join(dataDir, "cache");
  fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  process.env.FE_MONSTER_IOS_DATA_DIR = dataDir;
  process.env.FE_MONSTER_IOS_CACHE_DIR = cacheDir;
  process.env.TMPDIR = tempDir;
  process.env.TMP = tempDir;
  process.env.TEMP = tempDir;
  return dataDir;
}

function validatedReadyFile(filePathValue, dataDir) {
  const readyFile = path.resolve(filePathValue);
  const relative = path.relative(dataDir, readyFile);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    relative.includes(path.sep) ||
    !relative.startsWith(".gateway-ready-") ||
    !relative.endsWith(".json")
  ) {
    throw new Error("gateway ready file must be a direct child of the data directory");
  }
  return readyFile;
}

function writeReadyHandshake(filePath, launchNonce, port) {
  if (
    Buffer.byteLength(launchNonce, "utf8") < 32 ||
    Buffer.byteLength(launchNonce, "utf8") > 128
  ) {
    throw new Error("gateway launch nonce is invalid");
  }
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const payload = `${JSON.stringify({
    mode: "ios-on-device",
    launchNonce,
    port,
  })}\n`;
  try {
    fs.writeFileSync(temporaryPath, payload, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {}
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {}
  }
}

function jsonStringByteLength(value) {
  let length = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      length += 2;
    } else if (code <= 0x1f) {
      length += 6;
    } else if (code <= 0x7f) {
      length += 1;
    } else if (code <= 0x7ff) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        length += 4;
        index += 1;
      } else {
        length += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      length += 6;
    } else {
      length += 3;
    }
  }
  return length;
}

function assertJsonWithinLimit(value, maximumBytes = MAX_RESPONSE_BYTES) {
  let length = 0;
  const ancestors = new Set();
  const add = (amount) => {
    length += amount;
    if (length > maximumBytes) {
      throw Object.assign(new Error("response body too large"), { status: 502 });
    }
  };
  const visit = (item, depth = 0, inArray = false) => {
    if (depth > 16) {
      throw Object.assign(new Error("response body is too deeply nested"), { status: 502 });
    }
    if (item === null) {
      add(4);
      return;
    }
    const type = typeof item;
    if (type === "string") {
      add(jsonStringByteLength(item));
      return;
    }
    if (type === "number") {
      add(Buffer.byteLength(Number.isFinite(item) ? String(item) : "null", "utf8"));
      return;
    }
    if (type === "boolean") {
      add(item ? 4 : 5);
      return;
    }
    if (type === "undefined" || type === "function" || type === "symbol") {
      if (inArray) add(4);
      return;
    }
    if (type !== "object" || ancestors.has(item)) {
      throw Object.assign(new Error("response body is not serializable"), { status: 502 });
    }

    ancestors.add(item);
    if (Array.isArray(item)) {
      if (item.length > MAX_PLAYLIST_TRACKS) {
        throw Object.assign(new Error("response collection is too large"), { status: 502 });
      }
      add(2 + Math.max(0, item.length - 1));
      for (const child of item) visit(child, depth + 1, true);
    } else {
      const keys = Object.keys(item).filter((key) => {
        const childType = typeof item[key];
        return childType !== "undefined" && childType !== "function" && childType !== "symbol";
      });
      if (keys.length > 512) {
        throw Object.assign(new Error("response object has too many fields"), { status: 502 });
      }
      add(2 + Math.max(0, keys.length - 1));
      for (const key of keys) {
        add(jsonStringByteLength(key) + 1);
        visit(item[key], depth + 1, false);
      }
    }
    ancestors.delete(item);
  };

  visit(value);
}

function safeJson(response, status, body) {
  let payload;
  try {
    assertJsonWithinLimit(body);
    payload = Buffer.from(JSON.stringify(body), "utf8");
    if (payload.length > MAX_RESPONSE_BYTES) throw new Error("response body too large");
  } catch {
    status = 502;
    payload = Buffer.from(
      JSON.stringify({ ok: false, error: "response exceeded the iOS safety limit" }),
      "utf8"
    );
  }
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": String(payload.length),
    "Content-Security-Policy": "default-src 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(payload);
}

async function responseBuffer(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {}
    throw new Error("upstream response is too large");
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumBytes) {
      try {
        await response.body.cancel();
      } catch {}
      throw new Error("upstream response is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, length);
}

async function responseText(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  return (await responseBuffer(response, maximumBytes)).toString("utf8");
}

async function responseJson(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  const value = JSON.parse(await responseText(response, maximumBytes));
  if (!value || typeof value !== "object") throw new Error("upstream response is not JSON");
  return value;
}

async function bodyParameters(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      throw Object.assign(new Error("request body too large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!length) return {};
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim();
  if (contentType && contentType !== "application/json") {
    throw Object.assign(new Error("request body must be JSON"), { status: 415 });
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
    return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed : {};
  } catch {
    throw Object.assign(new Error("request body must be valid JSON"), { status: 400 });
  }
}

function queryParameters(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function text(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function qrImage(value) {
  const image = text(value);
  if (
    !image.startsWith("data:image/png;base64,") ||
    Buffer.byteLength(image, "utf8") > MAX_QR_IMAGE_BYTES
  ) {
    throw new Error("QR image exceeds the iOS safety limit");
  }
  return image;
}

function normalizedResult(result) {
  if (!result || typeof result !== "object") {
    return { status: 502, body: { error: "empty provider response" }, cookie: [] };
  }
  return {
    status: Number.isInteger(result.status) ? result.status : 200,
    body: result.body && typeof result.body === "object" ? result.body : result,
    cookie: result.cookie || [],
  };
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`, { paths: [__dirname] }));
}

function configurePackageAxios(root) {
  const modulePath = require.resolve("axios", { paths: [root] });
  const axiosModule = require(modulePath);
  const axios = axiosModule.default || axiosModule;
  axios.defaults.maxContentLength = MAX_UPSTREAM_RESPONSE_BYTES;
  axios.defaults.maxBodyLength = MAX_BODY_BYTES;
  axios.defaults.maxRedirects = 3;
  axios.defaults.timeout = 15_000;
}

function createNeteaseAdapter() {
  const root = packageRoot("NeteaseCloudMusicApi");
  configurePackageAxios(root);
  const anonymousTokenPath = path.join(os.tmpdir(), "anonymous_token");
  if (!fs.existsSync(anonymousTokenPath)) {
    fs.writeFileSync(anonymousTokenPath, "", { encoding: "utf8", mode: 0o600 });
  }
  const { cookieToJson } = require(path.join(root, "util", "index.js"));
  const request = require(path.join(root, "util", "request.js"));
  const names = [
    "login_qr_key",
    "login_qr_create",
    "login_qr_check",
    "login_status",
    "search",
    "song_url_v1",
    "song_url",
    "user_playlist",
    "playlist_track_all",
    "playlist_detail",
    "lyric",
  ];
  const adapter = {};
  for (const name of names) {
    const modulePath = path.join(root, "module", `${name}.js`);
    if (!fs.existsSync(modulePath)) continue;
    const handler = require(modulePath);
    adapter[name] = (data = {}) => {
      const cookie = typeof data.cookie === "string"
        ? cookieToJson(data.cookie)
        : (data.cookie || {});
      return handler({ ...data, cookie }, (...args) => request(...args));
    };
  }
  return adapter;
}

function parseCookiePairs(value) {
  const values = Array.isArray(value) ? value : [value];
  const pairs = [];
  for (const rawValue of values) {
    for (const part of String(rawValue || "").split(/;\s*/)) {
      const separator = part.indexOf("=");
      if (separator <= 0) continue;
      const name = part.slice(0, separator).trim();
      const lowerName = name.toLowerCase();
      const cookieValue = part.slice(separator + 1).trim();
      if (
        !COOKIE_NAME_PATTERN.test(name) ||
        COOKIE_ATTRIBUTES.has(lowerName) ||
        /[\r\n;]/.test(cookieValue)
      ) {
        continue;
      }
      pairs.push([name, cookieValue]);
    }
  }
  return pairs;
}

function mergeCookieString(existing, ...incoming) {
  const jar = new Map(parseCookiePairs(existing));
  for (const value of incoming) {
    for (const [name, cookieValue] of parseCookiePairs(value)) jar.set(name, cookieValue);
  }
  return Array.from(jar, ([name, cookieValue]) => `${name}=${cookieValue}`).join("; ");
}

function cookieObject(value) {
  return Object.fromEntries(parseCookiePairs(value));
}

function headersSetCookies(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/);
}

function accountFromProfile(profile = {}) {
  const userId = text(
    profile.userId ?? profile.userid ?? profile.user_id ?? profile.uid ?? profile.uin,
    ""
  );
  return {
    userId,
    nickname: text(
      profile.nickname ?? profile.nickName ?? profile.nick_name ?? profile.username ?? profile.name,
      userId
    ),
    avatarUrl: text(
      profile.avatarUrl ?? profile.avatar ?? profile.avatar_url ?? profile.headimgurl ?? profile.pic,
      ""
    ),
    vipType: profile.vipType ?? profile.vip_type ?? profile.vip ?? 0,
  };
}

function providerError(error, fallback = "provider request failed") {
  const candidates = [error?.message, error?.error, error?.body?.error, error?.body?.msg];
  const detail = candidates.find((value) => typeof value === "string" && value.trim()) || fallback;
  const message = text(detail, fallback)
    .replace(/[?&](?:key|unikey|token|qrsig|ptqrtoken)=[^&#\s]*/gi, "")
    .slice(0, 240);
  return message || fallback;
}

class EncryptedSessionVault {
  constructor(filePath, key) {
    this.filePath = filePath;
    this.key = key;
    this.records = Object.create(null);
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    const envelope = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (envelope.v !== 1) throw new Error("unsupported music session vault version");
    const iv = Buffer.from(text(envelope.iv), "base64url");
    const tag = Buffer.from(text(envelope.tag), "base64url");
    const ciphertext = Buffer.from(text(envelope.data), "base64url");
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) {
      throw new Error("music session vault is malformed");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAAD(VAULT_AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(plain.toString("utf8"));
    for (const provider of PROVIDERS) {
      if (parsed && parsed[provider] && typeof parsed[provider] === "object") {
        this.records[provider] = parsed[provider];
      }
    }
    plain.fill(0);
  }

  get(provider) {
    const record = this.records[provider];
    return record && typeof record === "object" ? { ...record } : null;
  }

  set(provider, record) {
    if (!PROVIDERS.has(provider)) throw new Error("unknown provider");
    this.records[provider] = { ...record, updatedAt: new Date().toISOString() };
    this.persist();
    return this.get(provider);
  }

  delete(provider) {
    if (!this.records[provider]) return false;
    delete this.records[provider];
    this.persist();
    return true;
  }

  persist() {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(VAULT_AAD);
    const plaintext = Buffer.from(JSON.stringify(this.records), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = {
      v: 1,
      alg: "A256GCM",
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      data: ciphertext.toString("base64url"),
    };
    plaintext.fill(0);
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(directory, `.sessions-${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`);
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
      try { fs.chmodSync(this.filePath, 0o600); } catch {}
    } finally {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
  }
}

class QrAttemptStore {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.attempts = new Map();
    this.lastStartedAt = new Map();
  }

  begin(provider) {
    this.prune();
    const current = this.now();
    const previous = this.lastStartedAt.get(provider);
    if (
      previous !== undefined &&
      current - previous < QR_ATTEMPT_MIN_INTERVAL_MS
    ) {
      throw Object.assign(new Error("QR refresh is too frequent"), { status: 429 });
    }
    this.lastStartedAt.set(provider, current);
  }

  create(provider, upstream) {
    this.prune();
    const providerAttempts = Array.from(this.attempts.entries())
      .filter(([, attempt]) => attempt.provider === provider);
    while (providerAttempts.length >= MAX_QR_ATTEMPTS_PER_PROVIDER) {
      const [oldestId] = providerAttempts.shift();
      this.attempts.delete(oldestId);
    }
    while (this.attempts.size >= MAX_QR_ATTEMPTS) {
      const oldestId = this.attempts.keys().next().value;
      if (!oldestId) break;
      this.attempts.delete(oldestId);
    }
    const id = crypto.randomBytes(24).toString("base64url");
    const current = this.now();
    this.attempts.set(id, {
      provider,
      upstream,
      createdAt: current,
      expiresAt: current + ATTEMPT_TTL_MS,
    });
    return id;
  }

  require(provider, id) {
    this.prune();
    const attempt = this.attempts.get(text(id));
    if (!attempt || attempt.provider !== provider) {
      throw Object.assign(new Error("QR login attempt is missing or expired"), { status: 410 });
    }
    return attempt;
  }

  delete(id) {
    this.attempts.delete(text(id));
  }

  prune() {
    const current = this.now();
    for (const [id, attempt] of this.attempts) {
      if (attempt.expiresAt <= current) this.attempts.delete(id);
    }
  }
}

function hash33(value) {
  let hash = 0;
  for (const character of text(value)) hash += (hash << 5) + character.charCodeAt(0);
  return hash & 0x7fffffff;
}

function qqGtk(value) {
  let hash = 5381;
  for (const character of text(value)) hash += (hash << 5) + character.charCodeAt(0);
  return hash & 0x7fffffff;
}

function randomGuid() {
  return text(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
}

function ptuiCode(value) {
  const match = text(value).match(/ptuiCB\(\s*['"](\d+)['"]/);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function firstQuotedHttpUrl(value) {
  const match = text(value).match(/['"](https:\/\/[^'"]+)['"]/i);
  return match ? match[1] : "";
}

function qqCheckSigUrl(value) {
  const candidate = firstQuotedHttpUrl(value);
  if (!candidate || candidate.length > 4096) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !QQ_CHECK_SIG_HOSTS.has(url.hostname.toLowerCase()) ||
      url.pathname !== "/check_sig"
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function qqUinFromCookie(cookie) {
  const cookies = cookieObject(cookie);
  return text(cookies.uin ?? cookies.wxuin ?? cookies.qqmusic_uin, "").replace(/^o0*/, "");
}

async function qqCreateQr() {
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrshow");
  Object.entries({
    appid: "716027609",
    e: "2",
    l: "M",
    s: "3",
    d: "72",
    v: "4",
    t: Math.random().toFixed(16),
    daid: "383",
    pt_3rd_aid: "100497308",
    u1: "https://graph.qq.com/oauth2.0/login_jump",
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`QQ QR request failed (${response.status})`);
  const cookies = mergeCookieString("", headersSetCookies(response.headers));
  const qrsig = cookieObject(cookies).qrsig;
  if (!qrsig) throw new Error("QQ QR response did not include qrsig");
  const image = (await responseBuffer(response, 512 * 1024)).toString("base64");
  return {
    ptqrtoken: text(hash33(qrsig)),
    qrsig,
    cookies,
    image: `data:image/png;base64,${image}`,
  };
}

async function qqFinishLogin(attempt, checkText, initialCookies) {
  let cookies = initialCookies;
  const checkSigUrl = qqCheckSigUrl(checkText);
  if (!checkSigUrl) throw new Error("QQ login confirmation URL is unavailable");
  const checkSigResponse = await fetch(checkSigUrl, {
    headers: { Cookie: cookies },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  cookies = mergeCookieString(cookies, headersSetCookies(checkSigResponse.headers));
  await responseBuffer(checkSigResponse, 128 * 1024);
  const pSkey = cookieObject(cookies).p_skey;
  if (!pSkey) throw new Error("QQ login confirmation did not return p_skey");

  const authorizeData = new URLSearchParams({
    response_type: "code",
    client_id: "100497308",
    redirect_uri: "https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/",
    scope: "get_user_info,get_app_friends",
    state: "state",
    switch: "",
    from_ptlogin: "1",
    src: "1",
    update_auth: "1",
    openapi: "1010_1030",
    g_tk: text(qqGtk(pSkey)),
    auth_time: new Date().toISOString(),
    ui: randomGuid(),
  });
  const authorizeResponse = await fetch("https://graph.qq.com/oauth2.0/authorize", {
    method: "POST",
    body: authorizeData,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: cookies,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  cookies = mergeCookieString(cookies, headersSetCookies(authorizeResponse.headers));
  const location = text(authorizeResponse.headers.get("location"));
  await responseBuffer(authorizeResponse, 128 * 1024);
  const authorizationCode = new URL(location).searchParams.get("code");
  if (!authorizationCode) throw new Error("QQ authorization code is unavailable");

  const loginPayload = {
    comm: { g_tk: qqGtk(pSkey), platform: "yqq", ct: 24, cv: 0 },
    req: {
      module: "QQConnectLogin.LoginServer",
      method: "QQLogin",
      param: { code: authorizationCode },
    },
  };
  const loginResponse = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    method: "POST",
    body: JSON.stringify(loginPayload),
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Cookie: cookies,
    },
    signal: AbortSignal.timeout(15_000),
  });
  cookies = mergeCookieString(cookies, headersSetCookies(loginResponse.headers));
  await responseBuffer(loginResponse, 512 * 1024);
  if (!loginResponse.ok) throw new Error(`QQ session request failed (${loginResponse.status})`);
  const uin = qqUinFromCookie(cookies);
  if (!uin) throw new Error("QQ session did not include a user id");
  attempt.upstream.cookies = cookies;
  return {
    cookie: cookies,
    account: accountFromProfile({ userId: uin, nickname: uin }),
  };
}

async function qqCheckQr(attempt) {
  const upstream = attempt.upstream;
  const url = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
  Object.entries({
    u1: "https://graph.qq.com/oauth2.0/login_jump",
    ptqrtoken: upstream.ptqrtoken,
    ptredirect: "0",
    h: "1",
    t: "1",
    g: "1",
    from_ui: "1",
    ptlang: "2052",
    action: `0-0-${Date.now()}`,
    js_ver: "23111510",
    js_type: "1",
    login_sig: "",
    pt_uistyle: "40",
    aid: "716027609",
    daid: "383",
    pt_3rd_aid: "100497308",
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: { Cookie: `qrsig=${upstream.qrsig}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await responseText(response, 128 * 1024);
  const code = ptuiCode(payload);
  if (code === 65) return { code: 800, message: "二维码已过期" };
  if (code === 66) return { code: 801, message: "等待扫码" };
  if (code === 67) return { code: 802, message: "已扫码，等待确认" };
  if (code !== 0) return { code: 801, message: "等待扫码" };
  const cookies = mergeCookieString(upstream.cookies, headersSetCookies(response.headers));
  const session = await qqFinishLogin(attempt, payload, cookies);
  return { code: 803, message: "登录成功", loggedIn: true, session };
}

async function qqSearch(keyword, page, limit) {
  const url = new URL("https://c.y.qq.com/soso/fcgi-bin/client_search_cp");
  Object.entries({
    w: keyword,
    n: text(limit),
    p: text(page),
    format: "json",
    outCharset: "utf-8",
    ct: "24",
    qqmusic_ver: "1298",
    remoteplace: "txt.yqq.song",
    t: "0",
    aggr: "1",
    cr: "1",
    lossless: "0",
    flag_qc: "0",
    platform: "yqq.json",
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: { Referer: "https://y.qq.com/" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`QQ search failed (${response.status})`);
  return responseJson(response);
}

async function qqPlaylistTracks(playlistId) {
  const url = new URL("https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg");
  Object.entries({
    disstid: playlistId,
    format: "json",
    outCharset: "utf-8",
    type: "1",
    json: "1",
    utf8: "1",
    onlysong: "0",
    new_format: "1",
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: { Referer: "https://y.qq.com/" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`QQ playlist request failed (${response.status})`);
  return responseJson(response);
}

async function qqUserPlaylists(session, limit = 100) {
  const uin = qqUinFromCookie(session && session.cookie);
  if (!uin) return [];
  const url = new URL("https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
  Object.entries({
    _: text(Date.now()),
    cv: "4747474",
    ct: "24",
    format: "json",
    inCharset: "utf-8",
    outCharset: "utf-8",
    notice: "0",
    platform: "yqq.json",
    needNewCode: "0",
    uin,
    g_tk_new_20200303: "0",
    g_tk: "0",
    cid: "205360838",
    userid: uin,
    reqfrom: "1",
    reqtype: "0",
    hostUin: "0",
    loginUin: uin,
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: {
      Cookie: session.cookie,
      Referer: `https://y.qq.com/portal/profile.html?uin=${encodeURIComponent(uin)}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`QQ user playlists request failed (${response.status})`);
  const payload = await responseJson(response);
  if (typeof payload?.code === "number" && payload.code !== 0) {
    throw new Error(text(payload.message ?? payload.msg, "QQ user playlists request failed"));
  }
  const candidates = [
    payload?.data?.mydiss?.list,
    payload?.data?.mymusic,
    payload?.data?.createdDissList,
    payload?.data?.createdList,
    payload?.data?.creator?.playlist,
    payload?.data?.creator?.playlists,
    payload?.data?.playlist,
    payload?.data?.playlists,
    payload?.mydiss?.list,
    payload?.mymusic,
    payload?.createdDissList,
    payload?.createdList,
    payload?.creator?.playlist,
    payload?.creator?.playlists,
    payload?.playlist,
    payload?.playlists,
  ];
  return (candidates.find(Array.isArray) || []).slice(0, limit);
}

function qqQuality(value) {
  const normalized = text(value, "128").toLowerCase();
  if (normalized === "flac" || normalized === "lossless") return { prefix: "F000", suffix: ".flac" };
  if (normalized === "320" || normalized === "higher" || normalized === "exhigh") {
    return { prefix: "M800", suffix: ".mp3" };
  }
  if (normalized === "m4a") return { prefix: "C400", suffix: ".m4a" };
  return { prefix: "M500", suffix: ".mp3" };
}

async function qqSongUrl(songId, quality, session) {
  const uin = qqUinFromCookie(session && session.cookie) || "0";
  const guid = randomGuid();
  const file = qqQuality(quality);
  const filename = `${file.prefix}${songId}${songId}${file.suffix}`;
  const data = {
    req_0: {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: {
        filename: [filename],
        guid,
        songmid: [songId],
        songtype: [0],
        uin,
        loginflag: 1,
        platform: "20",
      },
    },
    loginUin: uin,
    comm: { uin, format: "json", ct: 24, cv: 0 },
  };
  const url = new URL("https://u.y.qq.com/cgi-bin/musicu.fcg");
  url.searchParams.set("format", "json");
  url.searchParams.set("sign", "zzannc1o6o9b4i971602f3554385022046ab796512b7012");
  url.searchParams.set("data", JSON.stringify(data));
  const response = await fetch(url, {
    headers: session && session.cookie ? { Cookie: session.cookie } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`QQ playback request failed (${response.status})`);
  const payload = await responseJson(response, 512 * 1024);
  const info = payload?.req_0?.data?.midurlinfo?.[0];
  const domains = payload?.req_0?.data?.sip || [];
  const domain = domains.find((item) => /^https:\/\//i.test(text(item)))
    || domains.find((item) => /^http:\/\//i.test(text(item)))
    || "";
  return info?.purl && domain ? `${domain}${info.purl}` : "";
}

async function kugouSearchFallback(keyword, page, limit) {
  const url = new URL("https://songsearch.kugou.com/song_search_v2");
  Object.entries({
    keyword,
    page: text(page),
    pagesize: text(limit),
    platform: "WebFilter",
  }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.kugou.com/",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`酷狗搜索失败 (${response.status})`);
  return responseJson(response);
}

async function kugouSongUrlFallback(songId) {
  const url = new URL("https://m.kugou.com/app/i/getSongInfo.php");
  url.searchParams.set("cmd", "playInfo");
  url.searchParams.set("hash", songId);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.kugou.com/",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return "";
  const payload = await responseJson(response, 512 * 1024);
  return validPlaybackUrl(text(payload?.url))
    || validPlaybackUrl(Array.isArray(payload?.backup_url) ? payload.backup_url[0] : payload?.backup_url);
}

function firstArray(root, candidateNames) {
  const names = new Set(candidateNames.map((name) => name.toLowerCase()));
  const queue = [{ value: root, depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value) || depth > 7) continue;
    visited.add(value);
    if (!Array.isArray(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (names.has(name.toLowerCase()) && Array.isArray(child)) return child;
      }
      for (const child of Object.values(value)) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return [];
}

function recursiveString(root, candidateNames) {
  const names = new Set(candidateNames.map((name) => name.toLowerCase()));
  const queue = [{ value: root, depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value) || depth > 8) continue;
    visited.add(value);
    for (const [name, child] of Object.entries(value)) {
      if (names.has(name.toLowerCase()) && typeof child === "string" && child.trim()) return child.trim();
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
    }
  }
  return "";
}

function artistText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item?.name ?? item?.title ?? item)).filter(Boolean).join(" / ");
  }
  return text(value);
}

function normalizedSong(item, provider) {
  if (!item || typeof item !== "object") return null;
  const album = item.album ?? item.al ?? {};
  const singers = item.artists ?? item.ar ?? item.singer ?? item.singers;
  const id = text(
    item.id ?? item.songmid ?? item.songMid ?? item.mid ?? item.hash ?? item.FileHash ?? item.audio_id,
    ""
  );
  const title = text(
    item.name ?? item.songname ?? item.songName ?? item.title ?? item.filename ?? item.FileName,
    ""
  ).replace(/^[^-]+ - /, "");
  if (!id || !title) return null;
  const albumMid = text(item.albummid ?? item.albumMid ?? album.mid, "");
  let cover = text(
    item.picUrl ?? item.picurl ?? item.imgurl ?? item.image ?? item.cover ?? album.picUrl ?? album.picurl,
    ""
  );
  if (!cover && provider === "qq" && albumMid) {
    cover = `https://y.qq.com/music/photo_new/T002R300x300M000${albumMid}.jpg`;
  }
  cover = cover.replace(/\{size\}/g, "400");
  const durationRaw = Number(item.duration ?? item.dt ?? item.interval ?? item.timelen ?? 0);
  const duration = durationRaw > 10_000 ? Math.round(durationRaw / 1000) : Math.round(durationRaw);
  return {
    id,
    title,
    artist: artistText(
      item.artist ?? item.artistName ?? item.singername ?? item.SingerName ?? singers
    ),
    album: text(item.albumname ?? item.albumName ?? album.name ?? album.title, ""),
    cover,
    duration: Number.isFinite(duration) ? duration : 0,
    provider,
    albumId: text(item.album_id ?? item.albumid ?? album.id, ""),
    albumAudioId: text(item.album_audio_id ?? item.audio_id, ""),
  };
}

function normalizedSongs(items, provider, limit = 100) {
  const songs = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const song = normalizedSong(item, provider);
    if (!song || seen.has(song.id)) continue;
    seen.add(song.id);
    songs.push(song);
    if (songs.length >= limit) break;
  }
  return songs;
}

function normalizedPlaylist(item, provider) {
  if (!item || typeof item !== "object") return null;
  const id = text(
    item.id ?? item.playlistId ?? item.dissid ?? item.disstid ?? item.global_collection_id ?? item.specialid,
    ""
  );
  const name = text(item.name ?? item.title ?? item.dissname ?? item.specialname ?? item.listname, "");
  if (!id || !name) return null;
  return {
    id,
    name,
    provider,
    cover: text(
      item.coverImgUrl ?? item.cover ?? item.logo ?? item.imgurl ?? item.picurl ?? item.pic,
      ""
    ).replace(/\{size\}/g, "400"),
    trackCount: Number(item.trackCount ?? item.songnum ?? item.song_count ?? item.count ?? 0) || 0,
  };
}

function normalizedPlaylists(items, provider, limit = MAX_PLAYLISTS) {
  const output = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const playlist = normalizedPlaylist(item, provider);
    if (!playlist || seen.has(playlist.id)) continue;
    seen.add(playlist.id);
    output.push(playlist);
    if (output.length >= limit) break;
  }
  return output;
}

function validPlaybackUrl(value) {
  let candidate = text(value);
  if (/^http:\/\//i.test(candidate)) {
    try {
      const parsed = new URL(candidate);
      if (/(?:^|\.)(?:music\.126\.net|qq\.com|qqmusic\.qq\.com|gtimg\.cn|kugou\.com)$/i.test(parsed.hostname)) {
        parsed.protocol = "https:";
        candidate = parsed.href;
      }
    } catch {
      return "";
    }
  }
  if (!/^https:\/\//i.test(candidate)) return "";
  if (/\.(?:kgm|mgg)(?:$|[?#])/i.test(candidate)) return "";
  return candidate;
}

class MusicGateway {
  constructor(vault, attempts) {
    this.vault = vault;
    this.attempts = attempts;
    this.neteaseApi = null;
    this.kugouApi = null;
  }

  netease() {
    this.neteaseApi ||= createNeteaseAdapter();
    return this.neteaseApi;
  }

  kugou() {
    if (!this.kugouApi) {
      const root = packageRoot("kugoumusicapi");
      configurePackageAxios(root);
      this.kugouApi = require(root);
    }
    return this.kugouApi;
  }

  providerCatalog() {
    return [
      {
        id: "netease",
        label: "网易云",
        appName: "网易云音乐 App",
        apiUrl: "ios://on-device/netease",
        baseUrl: "ios://on-device/netease",
        enabled: true,
        configured: true,
        managed: true,
        loginQr: true,
        phoneLogin: false,
        status: "on-device",
      },
      {
        id: "qq",
        label: "QQ音乐",
        appName: "QQ音乐 App",
        apiUrl: "ios://on-device/qq",
        baseUrl: "ios://on-device/qq",
        enabled: true,
        configured: true,
        managed: true,
        loginQr: true,
        phoneLogin: false,
        status: "on-device",
      },
      {
        id: "kugou",
        label: "酷狗音乐",
        appName: "酷狗音乐 App",
        apiUrl: "ios://on-device/kugou",
        baseUrl: "ios://on-device/kugou",
        enabled: true,
        configured: true,
        managed: true,
        loginQr: true,
        phoneLogin: false,
        status: "on-device",
      },
    ];
  }

  loginStatus(provider) {
    const session = this.vault.get(provider);
    return {
      ok: true,
      provider,
      loggedIn: Boolean(session),
      account: session?.account || {},
    };
  }

  async loginQrKey(provider) {
    this.attempts.begin(provider);
    if (provider === "qq") {
      const upstream = await qqCreateQr();
      const id = this.attempts.create(provider, upstream);
      return { code: 200, data: { unikey: id, qrimg: qrImage(upstream.image) } };
    }
    if (provider === "netease") {
      const result = normalizedResult(await this.netease().login_qr_key({ timestamp: Date.now() }));
      const upstreamKey = text(result.body?.data?.unikey ?? result.body?.unikey);
      if (!upstreamKey) throw new Error("网易云二维码 key 获取失败");
      const id = this.attempts.create(provider, { key: upstreamKey });
      return { code: 200, data: { unikey: id } };
    }
    const result = normalizedResult(await this.kugou().login_qr_key({}));
    const upstreamKey = text(
      result.body?.data?.qrcode ?? result.body?.data?.key ?? result.body?.data ??
      result.body?.key ?? result.body?.qrcode
    );
    if (!upstreamKey || upstreamKey === "[object Object]") throw new Error("酷狗二维码 key 获取失败");
    const id = this.attempts.create(provider, { key: upstreamKey });
    return { code: 200, data: { unikey: id } };
  }

  async loginQrCreate(provider, attemptId) {
    const attempt = this.attempts.require(provider, attemptId);
    if (provider === "qq") {
      return { code: 200, data: { qrimg: qrImage(attempt.upstream.image) } };
    }
    const result = provider === "netease"
      ? normalizedResult(await this.netease().login_qr_create({ key: attempt.upstream.key, qrimg: true }))
      : normalizedResult(await this.kugou().login_qr_create({ key: attempt.upstream.key, qrimg: true }));
    const image = qrImage(
      recursiveString(result.body, ["qrimg", "qrcode_img", "base64", "image", "img"])
    );
    return { code: 200, data: { qrimg: image } };
  }

  async loginQrCheck(provider, attemptId) {
    const attempt = this.attempts.require(provider, attemptId);
    if (provider === "qq") {
      const result = await qqCheckQr(attempt);
      if (result.session) {
        this.vault.set(provider, result.session);
        delete result.session;
        this.attempts.delete(attemptId);
      }
      return result;
    }
    if (provider === "netease") {
      const result = normalizedResult(await this.netease().login_qr_check({
        key: attempt.upstream.key,
        timestamp: Date.now(),
      }));
      const code = Number(result.body?.code ?? result.body?.data?.code ?? 0);
      if (code === 803) {
        const sessionCookie = mergeCookieString("", result.cookie, result.body?.cookie, result.body?.data?.cookie);
        if (!sessionCookie) throw new Error("网易云登录成功但未返回会话");
        let account = {};
        try {
          const status = normalizedResult(await this.netease().login_status({ cookie: sessionCookie }));
          account = accountFromProfile(status.body?.data?.profile ?? status.body?.profile ?? {});
        } catch {}
        this.vault.set(provider, { cookie: sessionCookie, account });
        this.attempts.delete(attemptId);
      }
      return {
        code,
        message: text(result.body?.message ?? result.body?.msg, ""),
        loggedIn: code === 803,
      };
    }
    const result = normalizedResult(await this.kugou().login_qr_check({ key: attempt.upstream.key }));
    const status = Number(
      result.body?.data?.status ?? result.body?.status ?? result.body?.data?.code ?? result.body?.code ?? 0
    );
    if (status === 4) {
      const data = result.body?.data || {};
      const sessionCookie = mergeCookieString("", result.cookie, [
        data.token ? `token=${data.token}` : "",
        data.userid ? `userid=${data.userid}` : "",
        data.vip_token ? `vip_token=${data.vip_token}` : "",
      ]);
      const cookies = cookieObject(sessionCookie);
      if (!cookies.token || !cookies.userid) throw new Error("酷狗登录成功但未返回完整会话");
      const account = accountFromProfile({ ...data, userId: cookies.userid });
      this.vault.set(provider, { cookie: sessionCookie, account });
      this.attempts.delete(attemptId);
    }
    return {
      code: status,
      status,
      data: { status },
      message: text(result.body?.message ?? result.body?.msg, ""),
      loggedIn: status === 4,
    };
  }

  async search(provider, keyword, page, limit) {
    let items = [];
    if (provider === "netease") {
      const result = normalizedResult(await this.netease().search({
        keywords: keyword,
        type: 1,
        limit,
        offset: (page - 1) * limit,
      }));
      items = result.body?.result?.songs || result.body?.body?.result?.songs || [];
    } else if (provider === "qq") {
      const result = await qqSearch(keyword, page, limit);
      items = result?.data?.song?.list || result?.song?.list || [];
    } else {
      try {
        const result = normalizedResult(await this.kugou().search({
          keywords: keyword,
          type: "song",
          page,
          pagesize: limit,
        }));
        items = result.body?.data?.info || result.body?.data?.lists || result.body?.data?.list || [];
      } catch {}
      if (!items.length) {
        const fallback = await kugouSearchFallback(keyword, page, limit);
        items = fallback?.data?.lists || fallback?.data?.info || [];
      }
    }
    return { ok: true, provider, source: "search", songs: normalizedSongs(items, provider, limit) };
  }

  async songUrl(provider, songId, quality, song = {}) {
    const session = this.vault.get(provider);
    if (provider === "netease") {
      const levelMap = {
        standard: "standard",
        higher: "higher",
        exhigh: "exhigh",
        lossless: "lossless",
        hires: "hires",
      };
      const method = typeof this.netease().song_url_v1 === "function" ? "song_url_v1" : "song_url";
      const result = normalizedResult(await this.netease()[method]({
        id: songId,
        level: levelMap[text(quality).toLowerCase()] || "standard",
        br: 128000,
        cookie: session?.cookie || "",
      }));
      return validPlaybackUrl(recursiveString(result.body, ["url"]));
    }
    if (provider === "qq") {
      return validPlaybackUrl(await qqSongUrl(songId, quality, session));
    }
    let playbackUrl = "";
    try {
      const result = normalizedResult(await this.kugou().song_url({
        hash: songId,
        quality: text(quality, "128"),
        album_id: song.albumId || 0,
        album_audio_id: song.albumAudioId || 0,
        cookie: cookieObject(session?.cookie || ""),
      }));
      playbackUrl = validPlaybackUrl(recursiveString(result.body, ["url", "play_url", "playurl", "backup_url"]));
    } catch {}
    return playbackUrl || kugouSongUrlFallback(songId);
  }

  async userPlaylists(provider) {
    const session = this.vault.get(provider);
    if (!session) return { ok: true, provider, loggedIn: false, playlists: [] };
    if (provider === "qq") {
      const items = await qqUserPlaylists(session);
      return { ok: true, provider, loggedIn: true, playlists: normalizedPlaylists(items, provider) };
    }
    let items = [];
    if (provider === "netease") {
      const uid = text(session.account?.userId);
      if (!uid) return { ok: true, provider, loggedIn: true, playlists: [] };
      const result = normalizedResult(await this.netease().user_playlist({
        uid,
        limit: 1000,
        cookie: session.cookie,
      }));
      items = result.body?.playlist || [];
    } else {
      const result = normalizedResult(await this.kugou().user_playlist({
        page: 1,
        pagesize: 100,
        cookie: cookieObject(session.cookie),
      }));
      items = firstArray(result.body, ["info", "list", "lists", "playlist", "playlists"]);
    }
    return { ok: true, provider, loggedIn: true, playlists: normalizedPlaylists(items, provider) };
  }

  async playlistTracks(provider, playlistId, limit) {
    let items = [];
    if (provider === "netease") {
      const session = this.vault.get(provider);
      const method = typeof this.netease().playlist_track_all === "function"
        ? "playlist_track_all"
        : "playlist_detail";
      const result = normalizedResult(await this.netease()[method]({
        id: playlistId,
        limit: limit || 1000,
        cookie: session?.cookie || "",
      }));
      items = result.body?.songs || result.body?.playlist?.tracks || [];
    } else if (provider === "qq") {
      const result = await qqPlaylistTracks(playlistId);
      items = result?.cdlist?.[0]?.songlist || result?.songlist || [];
    } else {
      const session = this.vault.get(provider);
      const result = normalizedResult(await this.kugou().playlist_track_all({
        id: playlistId,
        page: 1,
        pagesize: limit || 1000,
        cookie: cookieObject(session?.cookie || ""),
      }));
      items = firstArray(result.body, ["info", "list", "lists", "songs", "tracks"]);
    }
    return {
      ok: true,
      provider,
      source: "playlist",
      songs: normalizedSongs(items, provider, limit || 1000),
    };
  }

  async lyric(provider, songId) {
    if (provider !== "netease") return { ok: false, provider, lrc: { lyric: "" } };
    const session = this.vault.get(provider);
    const result = normalizedResult(await this.netease().lyric({ id: songId, cookie: session?.cookie || "" }));
    return result.body;
  }
}

function providerFromPathOrQuery(pathname, params) {
  const pathMatch = pathname.match(/^\/api\/(netease|qq|kugou)(?:\/|$)/);
  const provider = pathMatch?.[1] || text(params.provider, "netease");
  if (!PROVIDERS.has(provider)) throw Object.assign(new Error("unknown provider"), { status: 400 });
  return provider;
}

function providerEndpoint(pathname, provider) {
  return pathname.replace(new RegExp(`^/api/${provider}`), "");
}

async function routeRequest(gateway, request, url, params) {
  const pathname = url.pathname;
  if (request.method === "GET" && pathname === "/health") {
    return {
      status: 200,
      body: {
        ok: true,
        mode: "ios-on-device",
        node: process.versions.node,
        providers: Array.from(PROVIDERS),
      },
    };
  }
  if (request.method === "GET" && (pathname === "/api/providers" || pathname === "/api/music-apis")) {
    return {
      status: 200,
      body: { ok: true, mode: "ios-on-device", providers: gateway.providerCatalog() },
    };
  }
  if (pathname === "/api/music-apis/import") {
    return {
      status: 405,
      body: {
        ok: false,
        error: "iOS 端使用随 App 审核的固定音乐适配器，不执行导入的代码插件",
      },
    };
  }

  const provider = providerFromPathOrQuery(pathname, params);
  const endpoint = providerEndpoint(pathname, provider);

  if (request.method === "DELETE" && endpoint === "/login/session") {
    gateway.vault.delete(provider);
    return { status: 200, body: { ok: true, provider, loggedIn: false } };
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return { status: 405, body: { ok: false, error: "method not allowed" } };
  }
  if (pathname === "/api/login/status" || endpoint === "/login/status") {
    return { status: 200, body: gateway.loginStatus(provider) };
  }
  if (endpoint === "/login/qr/key") {
    return { status: 200, body: await gateway.loginQrKey(provider) };
  }
  if (endpoint === "/login/qr/create") {
    return { status: 200, body: await gateway.loginQrCreate(provider, params.key) };
  }
  if (endpoint === "/login/qr/check") {
    return { status: 200, body: await gateway.loginQrCheck(provider, params.key) };
  }
  if (endpoint === "/user/playlists") {
    return { status: 200, body: await gateway.userPlaylists(provider) };
  }
  if (endpoint === "/playlist/tracks" || pathname === "/api/playlist/tracks") {
    return {
      status: 200,
      body: await gateway.playlistTracks(
        provider,
        text(params.id),
        clampInteger(params.limit, 0, 0, MAX_PLAYLIST_TRACKS)
      ),
    };
  }
  if (pathname === "/api/search") {
    const keyword = text(params.q ?? params.keyword).trim();
    if (!keyword) return { status: 400, body: { ok: false, error: "search keyword is missing" } };
    return {
      status: 200,
      body: await gateway.search(
        provider,
        keyword.slice(0, 120),
        clampInteger(params.page, 1, 1, 100),
        clampInteger(params.limit, 8, 1, 50)
      ),
    };
  }
  if (endpoint === "/lyric" || pathname === "/api/lyric") {
    return { status: 200, body: await gateway.lyric(provider, text(params.id)) };
  }
  if (
    pathname === "/api/player/load" ||
    pathname === "/api/song/url" ||
    endpoint === "/song/url"
  ) {
    const id = text(params.id ?? params.songId ?? params.mid ?? params.hash);
    if (!id) return { status: 400, body: { ok: false, playable: false, error: "song id is missing" } };
    const song = {
      id,
      title: text(params.title),
      artist: text(params.artist),
      album: text(params.album),
      cover: text(params.cover),
      duration: Number(params.duration) || 0,
      provider,
      albumId: text(params.albumId ?? params.album_id),
      albumAudioId: text(params.albumAudioId ?? params.album_audio_id),
    };
    const playbackUrl = await gateway.songUrl(provider, id, text(params.quality, "standard"), song);
    return {
      status: 200,
      body: {
        ok: Boolean(playbackUrl),
        provider,
        song,
        quality: text(params.quality, "standard"),
        url: playbackUrl,
        playable: Boolean(playbackUrl),
        error: playbackUrl ? "" : "当前音质没有可用的 HTTPS 播放地址",
      },
    };
  }
  return { status: 404, body: { ok: false, error: "endpoint not found" } };
}

function createServer({ token, gateway }) {
  const server = http.createServer(async (request, response) => {
    try {
      if (!timingSafeTextEqual(token, bearerFrom(request))) {
        safeJson(response, 403, { ok: false, error: "forbidden" });
        return;
      }
      const url = new URL(request.url || "/", `http://${LOOPBACK_HOST}`);
      const params = { ...queryParameters(url), ...(await bodyParameters(request)) };
      const result = await routeRequest(gateway, request, url, params);
      safeJson(response, result.status, result.body);
    } catch (error) {
      safeJson(response, Number.isInteger(error?.status) ? error.status : 502, {
        ok: false,
        error: providerError(error),
      });
    }
  });
  server.maxConnections = 12;
  server.headersTimeout = 5_000;
  server.requestTimeout = 20_000;
  server.keepAliveTimeout = 2_000;
  return server;
}

async function main(argv = process.argv) {
  const requestedHost = argument("--host", LOOPBACK_HOST, argv);
  if (requestedHost !== LOOPBACK_HOST) throw new Error("gateway may only bind to 127.0.0.1");
  const requestedPort = parsePort(requiredArgument("--port", argv));
  const token = requiredArgument("--token", argv);
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("gateway token must contain at least 32 bytes");
  const vaultKey = decodeVaultKey(requiredArgument("--vault-key", argv));
  const dataDir = installWritableRuntimePaths(requiredArgument("--data-dir", argv));
  const launchNonce = requiredArgument("--launch-nonce", argv);
  const readyFile = validatedReadyFile(requiredArgument("--ready-file", argv), dataDir);
  if (fs.existsSync(readyFile)) throw new Error("gateway ready file already exists");
  const vault = new EncryptedSessionVault(path.join(dataDir, "music-sessions.v1.enc"), vaultKey);
  const gateway = new MusicGateway(vault, new QrAttemptStore());
  const server = createServer({ token, gateway });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(requestedPort, LOOPBACK_HOST, resolve);
    });
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error("gateway did not receive a valid loopback port");
    }
    writeReadyHandshake(readyFile, launchNonce, port);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: "ios-on-device",
      host: LOOPBACK_HOST,
      port,
    })}\n`);
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  return server;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`FE moster iOS music gateway failed: ${providerError(error, "startup failed")}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EncryptedSessionVault,
  MusicGateway,
  QrAttemptStore,
  accountFromProfile,
  argument,
  assertJsonWithinLimit,
  createServer,
  decodeVaultKey,
  hash33,
  mergeCookieString,
  normalizedPlaylist,
  normalizedSong,
  parseCookiePairs,
  ptuiCode,
  qqCheckSigUrl,
  routeRequest,
  timingSafeTextEqual,
  validPlaybackUrl,
};
