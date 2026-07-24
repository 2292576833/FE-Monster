"use strict";

const crypto = require("node:crypto");
const http = require("node:http");

const loginQrKey = require("../../../node_modules/kugoumusicapi/module/login_qr_key.js");
const loginQrCreate = require("../../../node_modules/kugoumusicapi/module/login_qr_create.js");
const loginQrCheck = require("../../../node_modules/kugoumusicapi/module/login_qr_check.js");
const loginToken = require("../../../node_modules/kugoumusicapi/module/login_token.js");
const userDetail = require("../../../node_modules/kugoumusicapi/module/user_detail.js");
const userPlaylist = require("../../../node_modules/kugoumusicapi/module/user_playlist.js");
const topPlaylist = require("../../../node_modules/kugoumusicapi/module/top_playlist.js");
const playlistDetail = require("../../../node_modules/kugoumusicapi/module/playlist_detail.js");
const playlistTrackAll = require("../../../node_modules/kugoumusicapi/module/playlist_track_all.js");
const playlistTrackAllNew = require("../../../node_modules/kugoumusicapi/module/playlist_track_all_new.js");
const registerDev = require("../../../node_modules/kugoumusicapi/module/register_dev.js");
const songUrl = require("../../../node_modules/kugoumusicapi/module/song_url.js");
const songUrlNew = require("../../../node_modules/kugoumusicapi/module/song_url_new.js");
const { createRequest } = require("../../../node_modules/kugoumusicapi/util/request.js");

const VERSION = "1.5.1";
const SOURCE_COMMIT = "283f1e97b110726b208a64b486a657c0fc0a6126";
const MAX_BODY_BYTES = 1024 * 1024;

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

const runtimeCookies = {
  KUGOU_API_MID: randomHex(16),
  KUGOU_API_GUID: crypto.randomUUID(),
  KUGOU_API_DEV: randomHex(5).toUpperCase(),
  KUGOU_API_MAC: "02:00:00:00:00:00",
  KUGOU_API_WEBGL: BigInt(`0x${randomHex(8)}`).toString()
};
let deviceRegistrationPromise = null;

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

function cookiePair(value) {
  const separator = String(value || "").indexOf("=");
  if (separator <= 0) return null;
  const key = String(value).slice(0, separator).trim();
  const content = String(value).slice(separator + 1).trim();
  return key && content ? [key, content] : null;
}

function rememberCookies(cookies) {
  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    const pair = cookiePair(cookie);
    if (pair) runtimeCookies[pair[0]] = pair[1];
  }
}

function requestParams(request, url, body) {
  const query = Object.fromEntries(url.searchParams.entries());
  const queryCookie = parseCookie(query.cookie);
  delete query.cookie;

  const bodyCookie = parseCookie(body.cookie);
  const params = { ...query, ...body };
  delete params.cookie;
  params.cookie = {
    ...runtimeCookies,
    ...parseCookie(request.headers.cookie),
    ...queryCookie,
    ...bodyCookie,
    ...parseCookie(request.headers.authorization)
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

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": request.headers.origin || "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Cache-Control",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store"
  };
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
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://www.kugou.com/",
      "User-Agent": "Mozilla/5.0 FE-Monster-Kugou-Plugin/1.5.1"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Kugou upstream HTTP ${response.status}`);
  return response.json();
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

function firstPlaybackUrl(payload) {
  const queue = [payload];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      queue.unshift(...value);
      continue;
    }
    for (const key of ["url", "playUrl", "play_url", "backupUrl", "backup_url"]) {
      if (key in value) queue.unshift(value[key]);
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") queue.push(nested);
    }
  }
  return "";
}

async function ensureRegisteredDevice() {
  if (runtimeCookies.dfid) return runtimeCookies.dfid;
  if (!deviceRegistrationPromise) {
    deviceRegistrationPromise = callModule(registerDev, { cookie: { ...runtimeCookies } })
      .then((result) => {
        rememberCookies(result.cookie);
        const dfid = String(result.body?.data?.dfid || runtimeCookies.dfid || "").trim();
        if (!dfid) throw new Error("Kugou device registration did not return dfid");
        runtimeCookies.dfid = dfid;
        return dfid;
      })
      .finally(() => {
        deviceRegistrationPromise = null;
      });
  }
  return deviceRegistrationPromise;
}

async function songUrlPayload(params) {
  const requestedId = String(params.id || params.songid || params.songId || "").trim();
  const requestedHash = String(params.hash || requestedId).trim();
  const hash = /^[a-f0-9]{32}$/i.test(requestedHash) ? requestedHash : "";
  const albumAudioIdCandidate = String(
    params.album_audio_id
      || params.audio_id
      || (/^\d+$/.test(requestedId) ? requestedId : "")
      || (/^\d+$/.test(requestedHash) ? requestedHash : "")
  ).trim();
  const albumAudioId = /^\d+$/.test(albumAudioIdCandidate) ? albumAudioIdCandidate : "";
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
    quality: params.quality || 128,
    cookie
  };
  let result = await callModule(songUrl, { ...request, free_part: false });
  rememberCookies(result.cookie);
  if (!firstPlaybackUrl(result.body)) {
    result = await callModule(songUrl, { ...request, free_part: true });
    rememberCookies(result.cookie);
  }
  if (!firstPlaybackUrl(result.body)) {
    result = await callModule(songUrlNew, { ...request, free_part: false });
    rememberCookies(result.cookie);
  }
  if (!firstPlaybackUrl(result.body)) {
    result = await callModule(songUrlNew, { ...request, free_part: true });
    rememberCookies(result.cookie);
  }
  if (!firstPlaybackUrl(result.body)) {
    throw Object.assign(new Error("Kugou audio source is unavailable for this account"), {
      status: 404,
      body: { code: 404, playable: false, error: "Kugou audio source is unavailable for this account" }
    });
  }
  return result.body;
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
  ["/login/qr/key", loginQrKey],
  ["/login/qr/create", loginQrCreate],
  ["/login/qr/check", loginQrCheck],
  ["/login/token", loginToken],
  ["/user/detail", userDetail],
  ["/user/playlist", userPlaylist],
  ["/user/playlists", userPlaylist],
  ["/top/playlist", topPlaylist],
  ["/playlist/detail", playlistDetail],
  ["/playlist/track/all", playlistTrackAll],
  ["/playlist/track/all/new", playlistTrackAllNew],
  ["/playlist/tracks", playlistTrackAll],
  ["/register/dev", registerDev]
]);

async function callModule(moduleHandler, params) {
  return moduleHandler(params, (config) => {
    config.ip = "127.0.0.1";
    return createRequest(config);
  });
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
      version: VERSION,
      sourceCommit: SOURCE_COMMIT,
      loginQr: true
    });
    return;
  }

  const body = await readBody(request);
  const params = requestParams(request, url, body);
  let payload;
  let cookies = [];

  if (pathname === "/search" || pathname === "/search/complex" || pathname === "/song/search") {
    payload = await searchPayload(params);
  } else if (pathname === "/song/url" || pathname === "/song/url/new" || pathname === "/music/url") {
    payload = await songUrlPayload(params);
  } else if (pathname === "/login/status") {
    payload = loginStatusPayload(params);
  } else {
    const moduleHandler = moduleRoutes.get(pathname);
    if (!moduleHandler) {
      sendJson(request, response, 404, { code: 404, error: "Not Found", path: pathname });
      return;
    }
    const result = await callModule(moduleHandler, params);
    cookies = Array.isArray(result.cookie) ? result.cookie : [];
    rememberCookies(cookies);
    payload = result.body;
  }

  sendJson(request, response, 200, payload, cookies);
}

const port = numericPort();
const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
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

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`FE Monster Kugou API plugin ${VERSION} listening on http://127.0.0.1:${port}\n`);
});
server.on("error", (error) => {
  process.stderr.write(`FE Monster Kugou API plugin failed: ${error.message}\n`);
  process.exitCode = 1;
});
