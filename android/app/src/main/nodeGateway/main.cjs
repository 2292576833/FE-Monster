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
const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 50;
const MAX_PLAYLIST_TRACKS = 1000;
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

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

async function responseBuffer(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try { await response.body?.cancel(); } catch {}
    throw new Error("upstream response is too large");
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumBytes) {
      try { await response.body.cancel(); } catch {}
      throw new Error("upstream response is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, length);
}

async function responseJson(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  const value = JSON.parse((await responseBuffer(response, maximumBytes)).toString("utf8"));
  if (!value || typeof value !== "object") throw new Error("upstream response is not JSON");
  return value;
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
      if (names.has(name.toLowerCase()) && typeof child === "string" && child.trim()) {
        return child.trim();
      }
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
    item.id ?? item.songmid ?? item.songMid ?? item.mid ?? item.hash ?? item.FileHash ?? item.audio_id
  );
  const title = text(
    item.name ?? item.songname ?? item.songName ?? item.title ?? item.filename ?? item.FileName
  ).replace(/^[^-]+ - /, "");
  if (!id || !title) return null;
  const albumMid = text(item.albummid ?? item.albumMid ?? album.mid);
  let cover = text(
    item.picUrl ?? item.picurl ?? item.imgurl ?? item.image ?? item.cover ?? album.picUrl ?? album.picurl
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
    artist: artistText(item.artist ?? item.artistName ?? item.singername ?? item.SingerName ?? singers),
    album: text(item.albumname ?? item.albumName ?? album.name ?? album.title),
    cover,
    duration: Number.isFinite(duration) ? duration : 0,
    provider,
    albumId: text(item.album_id ?? item.albumid ?? album.id),
    albumAudioId: text(item.album_audio_id ?? item.audio_id),
  };
}

function normalizedSongs(items, provider, limit = MAX_SEARCH_RESULTS) {
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
  if (!/^https:\/\//i.test(candidate) || /\.(?:kgm|mgg)(?:$|[?#])/i.test(candidate)) return "";
  return candidate;
}

function randomGuid() {
  return text(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
}

function qqUinFromCookie(cookie) {
  const cookies = cookieObject(cookie);
  return text(cookies.uin ?? cookies.wxuin ?? cookies.qqmusic_uin).replace(/^o0*/, "");
}

function qqQuality(value) {
  const normalized = text(value, "standard").toLowerCase();
  if (normalized === "flac" || normalized === "lossless") return { prefix: "F000", suffix: ".flac" };
  if (normalized === "320" || normalized === "higher" || normalized === "exhigh") {
    return { prefix: "M800", suffix: ".mp3" };
  }
  if (normalized === "m4a") return { prefix: "C400", suffix: ".m4a" };
  return { prefix: "M500", suffix: ".mp3" };
}

async function qqSearch(keyword, page, limit) {
  const root = packageRoot("@sansenjian/qq-music-api");
  const search = require(path.join(root, "module", "apis", "search", "getSearchByKey"));
  const result = normalizedResult(await search({
    params: { w: keyword, n: limit, p: page },
  }));
  return result.body?.response ?? result.body;
}

async function qqSongUrl(songId, quality, cookie) {
  const uin = qqUinFromCookie(cookie) || "0";
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
    headers: cookie ? { Cookie: cookie } : {},
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
  Object.entries({ keyword, page: text(page), pagesize: text(limit), platform: "WebFilter" })
    .forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: { Accept: "application/json, text/plain, */*", Referer: "https://www.kugou.com/" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Kugou search failed (${response.status})`);
  return responseJson(response);
}

async function kugouSongUrlFallback(songId) {
  const url = new URL("https://m.kugou.com/app/i/getSongInfo.php");
  url.searchParams.set("cmd", "playInfo");
  url.searchParams.set("hash", songId);
  const response = await fetch(url, {
    headers: { Accept: "application/json, text/plain, */*", Referer: "https://www.kugou.com/" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return "";
  const payload = await responseJson(response, 512 * 1024);
  return validPlaybackUrl(payload?.url)
    || validPlaybackUrl(Array.isArray(payload?.backup_url) ? payload.backup_url[0] : payload?.backup_url);
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

async function searchProvider(provider, params) {
  const keyword = text(params.q ?? params.keyword ?? params.keywords).trim();
  if (!keyword) {
    throw Object.assign(new Error("search keyword is missing"), { status: 400 });
  }
  const page = boundedInteger(params.page, 1, 1, 100);
  const limit = boundedInteger(params.limit, 8, 1, MAX_SEARCH_RESULTS);
  let items = [];

  if (provider === "netease") {
    const api = require("NeteaseCloudMusicApi");
    const method = typeof api.cloudsearch === "function" ? "cloudsearch" : "search";
    const result = normalizedResult(await api[method]({
      keywords: keyword.slice(0, 120),
      type: 1,
      limit,
      offset: (page - 1) * limit,
      cookie: parseCookie(params.cookie),
    }));
    items = result.body?.result?.songs || result.body?.body?.result?.songs || [];
  } else if (provider === "qq") {
    const result = await qqSearch(keyword.slice(0, 120), page, limit);
    items = result?.data?.song?.list || result?.song?.list || [];
  } else if (provider === "kugou") {
    const api = require("kugoumusicapi");
    try {
      const result = normalizedResult(await api.search({
        keywords: keyword.slice(0, 120),
        type: "song",
        page,
        pagesize: limit,
      }));
      items = result.body?.data?.info || result.body?.data?.lists || result.body?.data?.list || [];
    } catch {}
    if (!items.length) {
      const fallback = await kugouSearchFallback(keyword.slice(0, 120), page, limit);
      items = fallback?.data?.lists || fallback?.data?.info || [];
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      provider,
      source: "search",
      songs: normalizedSongs(items, provider, limit),
    },
    cookie: [],
  };
}

async function songUrlProvider(provider, params) {
  const songId = text(params.id ?? params.songId ?? params.mid ?? params.hash).trim();
  if (!songId) throw Object.assign(new Error("song id is missing"), { status: 400 });
  const quality = text(params.quality, "standard");
  const cookie = parseCookie(params.cookie);
  let playbackUrl = "";

  if (provider === "netease") {
    const api = require("NeteaseCloudMusicApi");
    const method = typeof api.song_url_v1 === "function" ? "song_url_v1" : "song_url";
    const level = ["standard", "higher", "exhigh", "lossless", "hires"].includes(quality.toLowerCase())
      ? quality.toLowerCase()
      : "standard";
    const result = normalizedResult(await api[method]({
      id: songId,
      level,
      br: 128000,
      cookie,
    }));
    playbackUrl = validPlaybackUrl(recursiveString(result.body, ["url"]));
  } else if (provider === "qq") {
    playbackUrl = validPlaybackUrl(await qqSongUrl(songId, quality, cookie));
  } else if (provider === "kugou") {
    const api = require("kugoumusicapi");
    try {
      const result = normalizedResult(await api.song_url({
        hash: songId,
        quality,
        album_id: params.albumId ?? params.album_id ?? 0,
        album_audio_id: params.albumAudioId ?? params.album_audio_id ?? 0,
        cookie: cookieObject(cookie),
      }));
      playbackUrl = validPlaybackUrl(
        recursiveString(result.body, ["url", "play_url", "playurl", "backup_url"])
      );
    } catch {}
    if (!playbackUrl) playbackUrl = await kugouSongUrlFallback(songId);
  }

  const song = {
    id: songId,
    title: text(params.title),
    artist: text(params.artist),
    album: text(params.album),
    cover: text(params.cover),
    duration: Number(params.duration) || 0,
    provider,
    albumId: text(params.albumId ?? params.album_id),
    albumAudioId: text(params.albumAudioId ?? params.album_audio_id),
  };
  return {
    status: 200,
    body: {
      ok: Boolean(playbackUrl),
      provider,
      song,
      quality,
      url: playbackUrl,
      playable: Boolean(playbackUrl),
      error: playbackUrl ? "" : "当前音质没有可用的 HTTPS 播放地址",
    },
    cookie: [],
  };
}

async function playlistTracksProvider(provider, params) {
  const playlistId = text(params.id).trim();
  if (!playlistId) throw Object.assign(new Error("playlist id is missing"), { status: 400 });
  const limit = boundedInteger(params.limit, 1000, 1, MAX_PLAYLIST_TRACKS);
  const cookie = parseCookie(params.cookie);
  let items = [];

  if (provider === "netease") {
    const api = require("NeteaseCloudMusicApi");
    const method = typeof api.playlist_track_all === "function"
      ? "playlist_track_all"
      : "playlist_detail";
    const result = normalizedResult(await api[method]({ id: playlistId, limit, cookie }));
    items = result.body?.songs || result.body?.playlist?.tracks || [];
  } else if (provider === "qq") {
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
    const result = await responseJson(response);
    items = result?.cdlist?.[0]?.songlist || result?.songlist || [];
  } else if (provider === "kugou") {
    const api = require("kugoumusicapi");
    const result = normalizedResult(await api.playlist_track_all({
      id: playlistId,
      page: 1,
      pagesize: limit,
      cookie: cookieObject(cookie),
    }));
    items = firstArray(result.body, ["info", "list", "lists", "songs", "tracks"]);
  }

  return {
    status: 200,
    body: {
      ok: true,
      provider,
      source: "playlist",
      songs: normalizedSongs(items, provider, limit),
    },
    cookie: [],
  };
}

async function lyricProvider(provider, params) {
  const songId = text(params.id).trim();
  if (!songId) throw Object.assign(new Error("song id is missing"), { status: 400 });
  if (provider === "netease") {
    const api = require("NeteaseCloudMusicApi");
    const result = normalizedResult(await api.lyric({
      id: songId,
      cookie: parseCookie(params.cookie),
    }));
    return result;
  }
  return {
    status: 200,
    body: { ok: false, provider, lrc: { lyric: "" } },
    cookie: [],
  };
}

async function invokeProvider(provider, endpoint, params) {
  const cookie = parseCookie(params.cookie);
  if (endpoint === "/search") return searchProvider(provider, params);
  if (endpoint === "/song/url") return songUrlProvider(provider, params);
  if (endpoint === "/playlist/tracks") return playlistTracksProvider(provider, params);
  if (endpoint === "/lyric") return lyricProvider(provider, params);

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
      const genericEndpoints = {
        "/api/login/status": "/login/status",
        "/api/search": "/search",
        "/api/player/load": "/song/url",
        "/api/song/url": "/song/url",
        "/api/lyric": "/lyric",
        "/api/user/playlists": "/user/playlists",
        "/api/playlist/tracks": "/playlist/tracks",
      };
      const genericEndpoint = genericEndpoints[url.pathname] || "";
      const genericProvider = genericEndpoint
        ? String(url.searchParams.get("provider") || "netease")
        : "";
      const match = genericEndpoint
        ? [url.pathname, genericProvider, genericEndpoint]
        : url.pathname.match(
          /^\/api\/(netease|qq|kugou|qishui)(\/login\/(?:qr\/(?:key|create|check)|status|phone\/(?:send|verify))|\/user\/playlists|\/playlist\/tracks|\/search|\/song\/url|\/lyric)$/
        );
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
