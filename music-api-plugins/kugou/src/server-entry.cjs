"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const upstreamSourceRoot = [
  String(process.env.FE_KUGOU_UPSTREAM_ROOT || "").trim(),
  path.resolve(__dirname, "../../../node_modules/kugoumusicapi"),
  path.resolve(__dirname, "../../../node_modules/.ignored_kugoumusicapi")
].find((candidate) => candidate && fs.existsSync(path.join(candidate, "package.json"))) || "";

function loadUpstream(relativePath, bundledLoader) {
  if (!upstreamSourceRoot) return bundledLoader();
  const requestedPath = path.resolve(upstreamSourceRoot, relativePath);
  if (!requestedPath.startsWith(`${path.resolve(upstreamSourceRoot)}${path.sep}`)) {
    throw new Error(`Invalid Kugou upstream module path: ${relativePath}`);
  }
  return require(requestedPath);
}

const loginToken = loadUpstream("module/login_token.js", () => require("../../../node_modules/kugoumusicapi/module/login_token.js"));
const userDetail = loadUpstream("module/user_detail.js", () => require("../../../node_modules/kugoumusicapi/module/user_detail.js"));
const userPlaylist = loadUpstream("module/user_playlist.js", () => require("../../../node_modules/kugoumusicapi/module/user_playlist.js"));
const topPlaylist = loadUpstream("module/top_playlist.js", () => require("../../../node_modules/kugoumusicapi/module/top_playlist.js"));
const playlistDetail = loadUpstream("module/playlist_detail.js", () => require("../../../node_modules/kugoumusicapi/module/playlist_detail.js"));
const playlistTrackAll = loadUpstream("module/playlist_track_all.js", () => require("../../../node_modules/kugoumusicapi/module/playlist_track_all.js"));
const playlistTrackAllNew = loadUpstream("module/playlist_track_all_new.js", () => require("../../../node_modules/kugoumusicapi/module/playlist_track_all_new.js"));
const registerDev = loadUpstream("module/register_dev.js", () => require("../../../node_modules/kugoumusicapi/module/register_dev.js"));
const songUrl = loadUpstream("module/song_url.js", () => require("../../../node_modules/kugoumusicapi/module/song_url.js"));
const songUrlNew = loadUpstream("module/song_url_new.js", () => require("../../../node_modules/kugoumusicapi/module/song_url_new.js"));
const searchLyric = loadUpstream("module/search_lyric.js", () => require("../../../node_modules/kugoumusicapi/module/search_lyric.js"));
const lyric = loadUpstream("module/lyric.js", () => require("../../../node_modules/kugoumusicapi/module/lyric.js"));
const commentMusic = loadUpstream("module/comment_music.js", () => require("../../../node_modules/kugoumusicapi/module/comment_music.js"));
const playlistTracksAdd = loadUpstream("module/playlist_tracks_add.js", () => require("../../../node_modules/kugoumusicapi/module/playlist_tracks_add.js"));
const { createRequest } = loadUpstream("util/request.js", () => require("../../../node_modules/kugoumusicapi/util/request.js"));

const VERSION = "2.0.1";
const UPSTREAM_VERSION = "1.5.1";
const SOURCE_COMMIT = "283f1e97b110726b208a64b486a657c0fc0a6126";
const MAX_BODY_BYTES = 1024 * 1024;
const SESSION_SCHEMA = "fe-monster.kugou-session/v1";
const MAX_NETWORK_ATTEMPTS = 3;
const NETWORK_RETRY_BASE_MS = 1000;
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET"
]);
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const CAPABILITIES = Object.freeze([
  "search",
  "playback",
  "lyrics",
  "comments",
  "playlist-tracks",
  "playlist-write",
  "user-playlists",
  "official-browser-session"
]);

function cliValue(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function numericPort() {
  const raw = cliValue("--port", process.env.PORT || "3012");
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid Kugou API plugin port: ${raw}`);
  }
  return port;
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

class KuGouApiException extends Error {
  constructor({ status = null, code = null, message = "Kugou API request was rejected", data = null } = {}) {
    super(message);
    this.name = "KuGouApiException";
    this.kind = "api";
    this.status = status !== null && status !== "" && Number.isFinite(Number(status)) ? Number(status) : null;
    this.code = code !== null && code !== "" && Number.isFinite(Number(code)) ? Number(code) : code || null;
    this.data = data;
  }
}

class KuGouNetworkException extends Error {
  constructor({ message = "Kugou network request failed", statusCode = null, code = null, originalError = null } = {}) {
    super(message);
    this.name = "KuGouNetworkException";
    this.kind = "network";
    this.statusCode = statusCode !== null && statusCode !== "" && Number.isInteger(Number(statusCode))
      ? Number(statusCode)
      : null;
    this.code = String(code || originalError?.code || "").trim() || null;
    this.originalError = originalError;
  }
}

function networkException(error, statusCode = null) {
  if (error instanceof KuGouNetworkException) return error;
  return new KuGouNetworkException({
    message: error?.message || (statusCode ? `Kugou upstream HTTP ${statusCode}` : "Kugou network request failed"),
    statusCode,
    code: error?.code,
    originalError: error
  });
}

function firstErrorMessage(payload, fallback) {
  for (const candidate of [
    payload?.error,
    payload?.message,
    payload?.msg,
    payload?.data?.error,
    payload?.data?.message,
    payload?.data?.msg
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function apiExceptionFromPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rawStatus = payload.status;
  const status = rawStatus !== null && rawStatus !== "" && Number.isFinite(Number(rawStatus))
    ? Number(rawStatus)
    : null;
  const rawCode = payload.error_code ?? payload.errorCode ?? payload.code ?? null;
  const numericCode = rawCode !== null && rawCode !== "" && Number.isFinite(Number(rawCode))
    ? Number(rawCode)
    : rawCode;
  const codeFailed = numericCode !== null
    && numericCode !== ""
    && numericCode !== 0
    && numericCode !== 1
    && numericCode !== 200;
  if (status !== 0 && !codeFailed) return null;
  return new KuGouApiException({
    status,
    code: numericCode,
    message: firstErrorMessage(payload, "Kugou API request was rejected"),
    data: payload
  });
}

function looksLikeNetworkFailure(error) {
  if (!error || typeof error !== "object") return false;
  const code = String(error.code || "").toUpperCase();
  return error.name === "AbortError"
    || error.isAxiosError === true
    || RETRYABLE_NETWORK_CODES.has(code)
    || looksLikeNetworkFailure(error.cause);
}

function classifyModuleException(error) {
  if (error instanceof KuGouApiException || error instanceof KuGouNetworkException) return error;
  const originalNetworkError = error?.body?.msg;
  if (looksLikeNetworkFailure(originalNetworkError)) return networkException(originalNetworkError);
  if (looksLikeNetworkFailure(error)) return networkException(error);
  const apiError = apiExceptionFromPayload(error?.body ?? error);
  if (apiError) return apiError;
  const statusCode = Number.isInteger(Number(error?.status)) ? Number(error.status) : null;
  return networkException(error instanceof Error ? error : new Error("Kugou module request failed"), statusCode);
}

function retryableNetworkException(error) {
  if (!(error instanceof KuGouNetworkException)) return false;
  if (error.statusCode !== null) return RETRYABLE_HTTP_STATUS.has(error.statusCode);
  return error.name === "AbortError"
    || error.originalError?.name === "AbortError"
    || RETRYABLE_NETWORK_CODES.has(String(error.code || "").toUpperCase());
}

async function withNetworkRetry(operation, { idempotent = false } = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const classified = error instanceof KuGouApiException || error instanceof KuGouNetworkException
        ? error
        : networkException(error);
      if (!idempotent || !retryableNetworkException(classified) || attempt >= MAX_NETWORK_ATTEMPTS) {
        throw classified;
      }
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_BASE_MS * (2 ** (attempt - 1))));
    }
  }
}

function dataDirectory() {
  const configured = cliValue(
    "--data-dir",
    process.env.FE_KUGOU_DATA_DIR || path.join(os.tmpdir(), "fe-monster-kugou-api")
  );
  return path.resolve(String(configured || "").trim() || path.join(os.tmpdir(), "fe-monster-kugou-api"));
}

function newDeviceCookies() {
  return {
    KUGOU_API_MID: randomHex(16),
    KUGOU_API_GUID: crypto.randomUUID(),
    KUGOU_API_DEV: randomHex(5).toUpperCase(),
    KUGOU_API_MAC: "02:00:00:00:00:00",
    KUGOU_API_WEBGL: BigInt(`0x${randomHex(8)}`).toString()
  };
}

function safeCookieMap(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, content] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) continue;
    const text = String(content ?? "");
    if (text && text.length <= 4096) result[key] = text;
  }
  return result;
}

const providerDataDirectory = dataDirectory();
const sessionPath = path.join(providerDataDirectory, "session.json");
fs.mkdirSync(providerDataDirectory, { recursive: true });

function restoredCookies() {
  try {
    const stored = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    if (stored?.schema !== SESSION_SCHEMA || stored?.provider !== "kugou") return {};
    return safeCookieMap(stored.cookies);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      process.stderr.write(`FE Monster Kugou API plugin ignored invalid session data: ${error.message}\n`);
    }
    return {};
  }
}

const runtimeCookies = {
  ...newDeviceCookies(),
  ...restoredCookies()
};
let deviceRegistrationPromise = null;
let sessionWriteChain = Promise.resolve();

function sessionPayload() {
  return `${JSON.stringify({
    schema: SESSION_SCHEMA,
    provider: "kugou",
    cookies: runtimeCookies
  }, null, 2)}\n`;
}

async function writeSessionAtomically(contents) {
  const temporaryPath = path.join(
    providerDataDirectory,
    `.session-${process.pid}-${randomHex(6)}.tmp`
  );
  let handle;
  try {
    handle = await fsPromises.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fsPromises.rename(temporaryPath, sessionPath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fsPromises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function persistSession() {
  const contents = sessionPayload();
  const write = sessionWriteChain.then(() => writeSessionAtomically(contents));
  sessionWriteChain = write.catch(() => {});
  return write;
}

async function rememberCookieMap(cookies) {
  let changed = false;
  for (const [key, content] of Object.entries(safeCookieMap(cookies))) {
    if (runtimeCookies[key] === content) continue;
    runtimeCookies[key] = content;
    changed = true;
  }
  if (changed) await persistSession();
}

function deviceIdentity() {
  const identity = [
    runtimeCookies.KUGOU_API_MID,
    runtimeCookies.KUGOU_API_GUID,
    runtimeCookies.KUGOU_API_DEV,
    runtimeCookies.KUGOU_API_WEBGL
  ].join("|");
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function parseCookie(value) {
  const parsed = {};
  for (const item of String(value || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    const key = item.slice(0, separator).trim();
    const content = item.slice(separator + 1).trim();
    if (key && content) parsed[key] = content;
  }
  return parsed;
}

function cookieMapValue(cookies, ...names) {
  if (!cookies || typeof cookies !== "object") return "";
  for (const name of names) {
    const match = Object.entries(cookies).find(([key, content]) =>
      key.toLowerCase() === String(name).toLowerCase() && String(content || "").trim()
    );
    if (match) return String(match[1]).trim();
  }
  return "";
}

function nestedCookieValue(raw, ...names) {
  if (!raw) return "";
  let decoded = String(raw);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Chromium may already return the decoded cookie value.
  }
  for (const part of decoded.split(/[&;]/)) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const content = part.slice(separator + 1).trim();
    if (content && names.some((name) => key.toLowerCase() === String(name).toLowerCase())) {
      return content;
    }
  }
  return "";
}

function canonicalAuthCookies(params, suppliedCookies) {
  const kugoo = cookieMapValue(suppliedCookies, "KuGoo");
  const token = String(
    params.token
      || cookieMapValue(suppliedCookies, "token", "t", "KugooToken", "KugooPwd")
      || nestedCookieValue(kugoo, "t", "KugooPwd", "token")
      || ""
  ).trim();
  const userid = String(
    params.userid
      || cookieMapValue(suppliedCookies, "userid", "KugooID")
      || nestedCookieValue(kugoo, "KugooID", "userid")
      || ""
  ).trim();
  return {
    ...(token ? { token } : {}),
    ...(userid && userid !== "0" ? { userid } : {})
  };
}

function cookiePair(value) {
  const separator = String(value || "").indexOf("=");
  if (separator <= 0) return null;
  const key = String(value).slice(0, separator).trim();
  const content = String(value).slice(separator + 1).trim();
  return key && content ? [key, content] : null;
}

async function rememberCookies(cookies) {
  const remembered = {};
  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    const pair = cookiePair(cookie);
    if (pair) remembered[pair[0]] = pair[1];
  }
  await rememberCookieMap(remembered);
}

async function requestParams(request, url, body) {
  const query = Object.fromEntries(url.searchParams.entries());
  const queryCookie = parseCookie(query.cookie);
  delete query.cookie;

  const bodyCookie = parseCookie(body.cookie);
  const params = { ...query, ...body };
  delete params.cookie;
  const suppliedCookies = {
    ...parseCookie(request.headers.cookie),
    ...queryCookie,
    ...bodyCookie,
    ...parseCookie(request.headers.authorization)
  };
  const authCookies = canonicalAuthCookies(params, suppliedCookies);
  await rememberCookieMap({ ...suppliedCookies, ...authCookies });
  if (authCookies.token) params.token = authCookies.token;
  if (authCookies.userid) params.userid = authCookies.userid;
  params.cookie = {
    ...runtimeCookies,
    ...suppliedCookies,
    ...authCookies
  };
  return params;
}

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};

  const text = Buffer.concat(chunks).toString("utf8");
  if ((request.headers["content-type"] || "").includes("application/json")) {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  return Object.fromEntries(new URLSearchParams(text).entries());
}

function loopbackOrigin(value) {
  const origin = String(value || "").trim();
  if (!origin) return "";
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) return "";
    if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(host)) return "";
    return origin;
  } catch {
    return "";
  }
}

function corsHeaders(request) {
  const origin = loopbackOrigin(request.headers.origin);
  const headers = {
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Cache-Control",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store"
  };
  if (origin) {
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

function sendJson(request, response, status, payload, cookies = []) {
  const body = JSON.stringify(payload ?? {});
  const headers = {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  };
  if (cookies.length) headers["Set-Cookie"] = cookies.map((cookie) => `${cookie}; Path=/; SameSite=Lax`);
  response.writeHead(status, headers);
  response.end(body);
}

async function upstreamJson(url) {
  return withNetworkRetry(async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Referer: "https://www.kugou.com/",
          "User-Agent": `Mozilla/5.0 FE-Monster-Kugou-Plugin/${VERSION}`
        },
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      throw networkException(error);
    }
    if (!response.ok) throw networkException(new Error(`Kugou upstream HTTP ${response.status}`), response.status);
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw networkException(Object.assign(new Error("Kugou upstream returned invalid JSON"), {
        code: "EINVALIDJSON",
        cause: error
      }));
    }
    const apiError = apiExceptionFromPayload(payload);
    if (apiError) throw apiError;
    return payload;
  }, {
    idempotent: true
  });
}

async function searchPayload(params) {
  const keyword = String(params.keywords || params.keyword || params.key || params.q || "").trim();
  if (!keyword) throw Object.assign(new Error("Search keyword is required"), { status: 400 });
  const page = Math.max(1, Number(params.page || params.pageNo) || 1);
  const pagesize = Math.min(100, Math.max(1, Number(params.pagesize || params.pageSize || params.limit) || 30));
  const url = new URL("https://songsearch.kugou.com/song_search_v2");
  url.search = new URLSearchParams({
    keyword,
    page: String(page),
    pagesize: String(pagesize),
    userid: "-1",
    clientver: "",
    platform: "WebFilter",
    filter: "2",
    iscorrection: "1",
    privilege_filter: "0"
  }).toString();
  return upstreamJson(url);
}

function partialPlaybackNode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trackerType = String(value.tracker_type || value.trackerType || value.play_type || value.playType || "")
    .trim()
    .toLowerCase();
  if (["part", "preview", "climax", "trial"].includes(trackerType)) return true;
  return ["is_free_part", "free_part", "freePart", "IsFreePart"].some((key) => {
    const marker = value[key];
    return marker === true || marker === 1 || marker === "1";
  });
}

function partialPlaybackUrl(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    const parsed = new URL(text);
    return /\/(?:climax|preview|trial)(?:\/|$)/i.test(parsed.pathname)
      || /\/yp\/p_\d+_\d+(?:\/|$)/i.test(parsed.pathname)
      || ["is_free_part", "free_part", "preview"].some((key) => parsed.searchParams.get(key) === "1");
  } catch {
    return true;
  }
}

function firstPlaybackUrl(payload) {
  const playbackKeys = new Set(["url", "playUrl", "play_url", "tracker_url", "backupUrl", "backup_url"]);
  const queue = [{ value: payload, partial: false, playbackValue: false }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    const value = current.value;
    if (typeof value === "string") {
      const candidate = value.trim();
      if (current.playbackValue && !current.partial && /^https?:\/\//i.test(candidate) && !partialPlaybackUrl(candidate)) {
        return candidate;
      }
      continue;
    }
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      queue.unshift(...value.map((item) => ({
        value: item,
        partial: current.partial,
        playbackValue: current.playbackValue
      })));
      continue;
    }
    const nodePartial = current.partial || partialPlaybackNode(value);
    for (const key of playbackKeys) {
      if (!(key in value)) continue;
      queue.unshift({
        value: value[key],
        partial: nodePartial || /(?:climax|preview|trial)/i.test(key),
        playbackValue: true
      });
    }
    for (const [key, nested] of Object.entries(value)) {
      if (playbackKeys.has(key) || !nested || typeof nested !== "object") continue;
      queue.push({
        value: nested,
        partial: nodePartial || /(?:climax|preview|trial)/i.test(key),
        playbackValue: false
      });
    }
  }
  return "";
}

async function ensureRegisteredDevice() {
  if (runtimeCookies.dfid) return runtimeCookies.dfid;
  if (!deviceRegistrationPromise) {
    deviceRegistrationPromise = callModule(registerDev, { cookie: { ...runtimeCookies } }, { idempotent: false })
      .then(async (result) => {
        await rememberCookies(result.cookie);
        const dfid = String(result.body?.data?.dfid || runtimeCookies.dfid || "").trim();
        if (!dfid) throw new Error("Kugou device registration did not return dfid");
        await rememberCookieMap({ dfid });
        return dfid;
      })
      .finally(() => {
        deviceRegistrationPromise = null;
      });
  }
  return deviceRegistrationPromise;
}

function compositeSongIdentity(value) {
  const parts = String(value || "").trim().split("|");
  if (parts.length !== 4 || parts[0].toLowerCase() !== "kg") return null;
  return {
    hash: /^[a-f0-9]{32}$/i.test(parts[1]) ? parts[1] : "",
    albumAudioId: /^\d+$/.test(parts[2]) ? parts[2] : "",
    albumId: /^\d+$/.test(parts[3]) ? parts[3] : ""
  };
}

function requestedSongIdentity(params) {
  const requestedId = String(
    params.songId
      || params.songid
      || params.songmid
      || params.mid
      || params.tracks
      || params.hash
      || params.id
      || ""
  ).trim();
  const composite = compositeSongIdentity(requestedId) || compositeSongIdentity(params.hash);
  const hashCandidate = String(composite?.hash || params.hash || requestedId).trim();
  const albumAudioIdCandidate = String(
    params.mixsongid
      || params.album_audio_id
      || params.audio_id
      || composite?.albumAudioId
      || (/^\d+$/.test(requestedId) ? requestedId : "")
  ).trim();
  const albumIdCandidate = String(params.album_id || params.albumId || composite?.albumId || "").trim();
  return {
    requestedId,
    hash: /^[a-f0-9]{32}$/i.test(hashCandidate) ? hashCandidate : "",
    albumAudioId: /^\d+$/.test(albumAudioIdCandidate) ? albumAudioIdCandidate : "",
    albumId: /^\d+$/.test(albumIdCandidate) ? albumIdCandidate : ""
  };
}

function lyricCandidates(payload) {
  for (const value of [
    payload?.candidates,
    payload?.data?.candidates,
    payload?.data?.info,
    payload?.data?.list
  ]) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function noLyricPayload(reason) {
  return {
    ok: true,
    provider: "kugou",
    nolyric: true,
    reason,
    lyric: "",
    lrc: { lyric: "" }
  };
}

async function lyricPayload(params) {
  const identity = requestedSongIdentity(params);
  if (!identity.hash && !identity.albumAudioId) {
    throw Object.assign(new Error("A valid Kugou song hash or album audio id is required"), { status: 400 });
  }
  const cookie = { ...runtimeCookies, ...(params.cookie || {}) };
  const searchResult = await callModule(searchLyric, {
    ...params,
    hash: identity.hash,
    album_audio_id: identity.albumAudioId || 0,
    keywords: params.keywords || params.keyword || "",
    cookie
  }, { idempotent: true });
  await rememberCookies(searchResult.cookie);
  const candidate = lyricCandidates(searchResult.body).find((item) => item?.id && item?.accesskey);
  if (!candidate) {
    return noLyricPayload("not-found");
  }

  const result = await callModule(lyric, {
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: "lrc",
    decode: true,
    cookie
  }, { idempotent: true });
  await rememberCookies(result.cookie);
  const text = String(result.body?.decodeContent || "").trim();
  if (!text) {
    return noLyricPayload("empty");
  }
  return {
    ...(result.body && typeof result.body === "object" ? result.body : {}),
    ok: true,
    provider: "kugou",
    lyric: text,
    lrc: { lyric: text }
  };
}

async function commentsPayload(params) {
  const identity = requestedSongIdentity(params);
  if (!identity.albumAudioId) {
    throw Object.assign(new Error("A valid Kugou mixsongid is required"), { status: 400 });
  }
  const result = await callModule(commentMusic, {
    ...params,
    mixsongid: identity.albumAudioId,
    page: params.page || 1,
    pagesize: params.pagesize || params.limit || 30
  }, { idempotent: true });
  await rememberCookies(result.cookie);
  return result.body;
}

async function playlistAddPayload(params) {
  const listid = String(params.listid || params.playlistId || params.pid || params.id || "").trim();
  if (!listid) throw Object.assign(new Error("A Kugou playlist id is required"), { status: 400 });

  let data = String(params.data || "").trim();
  if (!data) {
    const identity = requestedSongIdentity(params);
    if (!identity.hash) {
      throw Object.assign(new Error("A valid Kugou song hash is required"), { status: 400 });
    }
    const name = String(params.name || params.songName || params.title || "").replace(/[|,]/g, " ").trim();
    data = [
      name,
      identity.hash,
      identity.albumId || "0",
      identity.albumAudioId || "0"
    ].join("|");
  }

  const result = await callModule(playlistTracksAdd, {
    ...params,
    listid,
    data,
    userid: params.userid || params.cookie?.userid || 0,
    token: params.token || params.cookie?.token || ""
  }, { idempotent: false });
  await rememberCookies(result.cookie);
  return result.body;
}

async function songUrlPayload(params) {
  const requestedId = String(params.id || params.songid || params.songId || "").trim();
  const composite = compositeSongIdentity(requestedId);
  const requestedHash = String(params.hash || composite?.hash || requestedId).trim();
  const hash = /^[a-f0-9]{32}$/i.test(requestedHash) ? requestedHash : "";
  const albumAudioIdCandidate = String(
    params.album_audio_id
      || params.audio_id
      || composite?.albumAudioId
      || (/^\d+$/.test(requestedId) ? requestedId : "")
      || (/^\d+$/.test(requestedHash) ? requestedHash : "")
  ).trim();
  const albumAudioId = /^\d+$/.test(albumAudioIdCandidate) ? albumAudioIdCandidate : "";
  const albumIdCandidate = String(params.album_id || params.albumId || composite?.albumId || "").trim();
  const albumId = /^\d+$/.test(albumIdCandidate) ? albumIdCandidate : "";
  if (!hash && !/^\d+$/.test(albumAudioId)) {
    throw Object.assign(new Error("A valid Kugou song hash or album audio id is required"), { status: 400 });
  }
  await ensureRegisteredDevice();
  const cookie = { ...runtimeCookies, ...(params.cookie || {}) };
  const request = {
    ...params,
    hash,
    album_audio_id: albumAudioId || 0,
    audio_id: albumAudioId || 0,
    album_id: albumId || 0,
    quality: params.quality || 128,
    cookie
  };
  let result = null;
  let playbackUrl = "";
  let networkError = null;
  for (const resolver of [songUrl, songUrlNew]) {
    try {
      const candidate = await callModule(
        resolver,
        { ...request, free_part: false },
        { idempotent: true }
      );
      await rememberCookies(candidate.cookie);
      const candidateUrl = firstPlaybackUrl(candidate.body);
      if (!candidateUrl) continue;
      result = candidate;
      playbackUrl = candidateUrl;
      break;
    } catch (error) {
      if (error instanceof KuGouNetworkException) {
        networkError = error;
        continue;
      }
      if (error instanceof KuGouApiException) continue;
      throw error;
    }
  }
  if (!playbackUrl) {
    if (networkError) throw networkError;
    throw Object.assign(new Error("Kugou audio source is unavailable for this account"), {
      status: 403,
      body: {
        ok: false,
        provider: "kugou",
        type: "api",
        errorType: "api",
        code: 403,
        playable: false,
        reason: "account-entitlement-required",
        error: "Kugou audio source is unavailable for this account"
      }
    });
  }
  return {
    ...(result.body && typeof result.body === "object" ? result.body : {}),
    playable: true,
    url: playbackUrl
  };
}

function loginStatusPayload(params) {
  const token = String(params.token || params.cookie.token || "");
  const userid = String(params.userid || params.cookie.userid || "");
  const loggedIn = Boolean(token && userid && userid !== "0");
  return {
    code: 200,
    status: loggedIn ? 1 : 0,
    data: {
      status: loggedIn ? 1 : 0,
      userid: loggedIn ? userid : "",
      token: loggedIn ? token : ""
    }
  };
}

const moduleRoutes = new Map([
  ["/login/token", { handler: loginToken, idempotent: false }],
  ["/user/detail", { handler: userDetail, idempotent: true }],
  ["/user/playlist", { handler: userPlaylist, idempotent: true }],
  ["/user/playlists", { handler: userPlaylist, idempotent: true }],
  ["/top/playlist", { handler: topPlaylist, idempotent: true }],
  ["/playlist/detail", { handler: playlistDetail, idempotent: true }],
  ["/playlist/track/all", { handler: playlistTrackAll, idempotent: true }],
  ["/playlist/track/all/new", { handler: playlistTrackAllNew, idempotent: true }],
  ["/playlist/tracks", { handler: playlistTrackAll, idempotent: true }],
  ["/register/dev", { handler: registerDev, idempotent: false }]
]);

async function callModule(moduleHandler, params, { idempotent = false } = {}) {
  return withNetworkRetry(async () => {
    let result;
    try {
      result = await moduleHandler(params, (config) => {
        config.ip = "127.0.0.1";
        return createRequest(config);
      });
    } catch (error) {
      throw classifyModuleException(error);
    }
    const apiError = apiExceptionFromPayload(result?.body);
    if (apiError) throw apiError;
    return result;
  }, { idempotent });
}

function cleanPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

async function handle(request, response) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = cleanPath(url.pathname);
  if (pathname === "/health") {
    sendJson(request, response, 200, {
      ok: true,
      provider: "kugou",
      label: "酷狗音乐",
      version: VERSION,
      upstreamVersion: UPSTREAM_VERSION,
      sourceCommit: SOURCE_COMMIT,
      loginQr: false,
      authMode: "official-browser-cookie",
      loggedIn: Boolean(runtimeCookies.token && runtimeCookies.userid && String(runtimeCookies.userid) !== "0"),
      contract: "fe-monster.music-api/v1",
      persistence: true,
      deviceIdentity: deviceIdentity(),
      capabilities: CAPABILITIES
    });
    return;
  }

  const body = await readBody(request);
  const params = await requestParams(request, url, body);
  let payload;
  let cookies = [];

  if (pathname === "/search" || pathname === "/search/complex" || pathname === "/song/search") {
    payload = await searchPayload(params);
  } else if (pathname === "/song/url" || pathname === "/song/url/new" || pathname === "/music/url") {
    payload = await songUrlPayload(params);
  } else if (pathname === "/lyric" || pathname === "/lyrics" || pathname === "/song/lyric") {
    payload = await lyricPayload(params);
  } else if (pathname === "/comments" || pathname === "/song/comments" || pathname === "/comment/music") {
    payload = await commentsPayload(params);
  } else if (
    pathname === "/playlist/add"
    || pathname === "/user/playlist/add"
    || pathname === "/song/addToPlaylist"
    || pathname === "/favorite/add"
  ) {
    payload = await playlistAddPayload(params);
  } else if (pathname === "/login/status") {
    payload = loginStatusPayload(params);
  } else {
    const moduleRoute = moduleRoutes.get(pathname);
    if (!moduleRoute) {
      sendJson(request, response, 404, { code: 404, error: "Not Found", path: pathname });
      return;
    }
    const result = await callModule(moduleRoute.handler, params, { idempotent: moduleRoute.idempotent });
    cookies = Array.isArray(result.cookie) ? result.cookie : [];
    await rememberCookies(cookies);
    payload = result.body;
  }

  sendJson(request, response, 200, payload, cookies);
}

const port = numericPort();
const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    if (error instanceof KuGouApiException) {
      sendJson(request, response, 422, {
        ok: false,
        provider: "kugou",
        type: "api",
        errorType: "api",
        status: error.status,
        code: error.code,
        error: error.message
      });
      return;
    }
    if (error instanceof KuGouNetworkException) {
      sendJson(request, response, 502, {
        ok: false,
        provider: "kugou",
        type: "network",
        errorType: "network",
        statusCode: error.statusCode,
        code: error.code,
        error: error.message
      });
      return;
    }
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 502;
    const upstreamBody = error?.body && typeof error.body === "object" ? error.body : null;
    sendJson(request, response, status, upstreamBody || {
      code: status,
      error: error?.message || "Kugou API request failed"
    });
  });
});

persistSession()
  .then(() => {
    server.listen(port, "127.0.0.1", () => {
      process.stdout.write(`FE Monster Kugou API plugin ${VERSION} listening on http://127.0.0.1:${port}\n`);
    });
  })
  .catch((error) => {
    process.stderr.write(`FE Monster Kugou API plugin could not initialize its data directory: ${error.message}\n`);
    process.exitCode = 1;
  });
server.on("error", (error) => {
  process.stderr.write(`FE Monster Kugou API plugin failed: ${error.message}\n`);
  process.exitCode = 1;
});
