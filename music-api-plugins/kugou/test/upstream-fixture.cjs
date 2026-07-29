"use strict";

const fs = require("node:fs");
const Module = require("node:module");

const scenario = String(process.env.FE_KUGOU_TEST_SCENARIO || "");
const logPath = String(process.env.FE_KUGOU_TEST_LOG || "");
const originalFetch = global.fetch;
const originalLoad = Module._load;
let searchAttempts = 0;
let songUrlAttempts = 0;
let songUrlNewAttempts = 0;
let playlistDetailAttempts = 0;
let searchLyricAttempts = 0;
let lyricAttempts = 0;
let commentAttempts = 0;
let playlistAddAttempts = 0;

function record(event, detail = {}) {
  if (!logPath) return;
  fs.appendFileSync(logPath, `${JSON.stringify({ event, ...detail })}\n`, "utf8");
}

function networkFailure(message = "fixture connection reset") {
  return Object.assign(new Error(message), { code: "ECONNRESET" });
}

global.fetch = async (input, init) => {
  const url = String(input?.url || input || "");
  if (!url.startsWith("https://songsearch.kugou.com/")) return originalFetch(input, init);

  searchAttempts += 1;
  record("search", { attempt: searchAttempts });
  if (scenario === "search-network-retry-success" && searchAttempts < 3) {
    throw networkFailure();
  }
  if (scenario === "search-network-exhausted") throw networkFailure();
  if (scenario === "search-business-error") {
    return new Response(JSON.stringify({
      status: 0,
      error_code: 1001,
      error: "fixture login required"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ status: 1, data: { lists: [] } }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

function successfulDeviceRegistration() {
  return Promise.resolve({
    status: 200,
    cookie: ["dfid=fixture-dfid"],
    body: { status: 1, data: { dfid: "fixture-dfid" } }
  });
}

function songUrlFixture(params) {
  songUrlAttempts += 1;
  record("song-url", {
    attempt: songUrlAttempts,
    freePart: params?.free_part === true,
    hash: params?.hash || "",
    albumAudioId: params?.album_audio_id || 0,
    albumId: params?.album_id || 0
  });
  if (scenario === "song-network-retry-success" && songUrlAttempts < 3) {
    return Promise.reject(networkFailure());
  }
  if (scenario === "song-legacy-network-fallback") {
    return Promise.reject(networkFailure());
  }
  if (scenario === "song-legacy-api-error-new-success") {
    return Promise.reject({
      status: 502,
      cookie: [],
      body: {
        status: 0,
        error_code: 35104,
        error: "Hash not found"
      }
    });
  }
  if (scenario === "song-permission") {
    if (params?.free_part === true) {
      return Promise.resolve({ status: 200, cookie: [], body: { status: 1, url: "https://fixture.invalid/preview.mp3" } });
    }
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        data: [{
          privilege: 10,
          info: {
            tracker_type: "part",
            tracker_url: ["https://fixture.invalid/implicit-preview.mp3"],
            climax_info: { url: ["https://fixture.invalid/climax-preview.mp3"] }
          }
        }]
      }
    });
  }
  return Promise.resolve({ status: 200, cookie: [], body: { status: 1, url: "https://fixture.invalid/free.mp3" } });
}

function songUrlNewFixture(params) {
  songUrlNewAttempts += 1;
  record("song-url-new", {
    attempt: songUrlNewAttempts,
    freePart: params?.free_part === true,
    hash: params?.hash || "",
    albumAudioId: params?.album_audio_id || 0,
    albumId: params?.album_id || 0
  });
  if (scenario === "song-permission") {
    if (params?.free_part === true) {
      return Promise.resolve({ status: 200, cookie: [], body: { status: 1, url: "https://fixture.invalid/new-preview.mp3" } });
    }
    return Promise.resolve({ status: 200, cookie: [], body: { status: 1, is_free_part: 1, url: "https://fixture.invalid/new-implicit-preview.mp3" } });
  }
  if (scenario === "song-legacy-api-error-new-success") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: ["https://fixture.invalid/current-free.mp3"]
      }
    });
  }
  return Promise.resolve({ status: 200, cookie: [], body: { status: 1, url: "https://fixture.invalid/new-free.mp3" } });
}

function playlistDetailFixture() {
  playlistDetailAttempts += 1;
  record("playlist-detail", { attempt: playlistDetailAttempts });
  if (scenario === "module-business-error") {
    return Promise.reject({
      status: 502,
      cookie: ["token=must-not-leak"],
      body: {
        status: 0,
        error_code: 2002,
        msg: "fixture playlist denied",
        cookie: "must-not-leak",
        originalError: { secret: "must-not-leak" }
      }
    });
  }
  return Promise.resolve({ status: 200, cookie: [], body: { status: 1, data: {} } });
}

function searchLyricFixture(params) {
  searchLyricAttempts += 1;
  record("search-lyric", {
    attempt: searchLyricAttempts,
    hash: params?.hash || "",
    albumAudioId: params?.album_audio_id || 0,
    keywords: params?.keywords || "",
    duration: Number(params?.duration || 0)
  });
  const metadataRequired = scenario === "lyrics-metadata-required";
  const unavailable = scenario === "lyrics-unavailable";
  const metadataMatches = params?.keywords === "Red Shoe"
    && Number(params?.duration) === 206000;
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 200,
      candidates: unavailable || (metadataRequired && !metadataMatches)
        ? []
        : [{
            id: "fixture-lyric-id",
            accesskey: "fixture-access-key"
          }]
    }
  });
}

function lyricFixture(params) {
  lyricAttempts += 1;
  record("lyric", {
    attempt: lyricAttempts,
    id: params?.id || "",
    accesskey: params?.accesskey || "",
    fmt: params?.fmt || "",
    decode: params?.decode === true
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 200,
      decodeContent: "[00:00.00]fixture lyric\n[00:01.00]fixture line"
    }
  });
}

function commentMusicFixture(params) {
  commentAttempts += 1;
  record("comment-music", {
    attempt: commentAttempts,
    mixsongid: params?.mixsongid || 0,
    page: params?.page || 0,
    pagesize: params?.pagesize || 0
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: {
        list: [{
          commentid: "fixture-comment",
          content: "fixture comment"
        }]
      }
    }
  });
}

function playlistTracksAddFixture(params) {
  playlistAddAttempts += 1;
  record("playlist-tracks-add", {
    attempt: playlistAddAttempts,
    listid: params?.listid || "",
    data: params?.data || "",
    userid: params?.userid || params?.cookie?.userid || "",
    token: params?.token || params?.cookie?.token || ""
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: { success: true }
    }
  });
}

Module._load = function loadWithKugouFixture(request, parent, isMain) {
  const normalized = String(request || "")
    .replaceAll("\\", "/")
    .replace("/.ignored_kugoumusicapi/", "/kugoumusicapi/");
  if (normalized.endsWith("/kugoumusicapi/module/register_dev.js")) return successfulDeviceRegistration;
  if (normalized.endsWith("/kugoumusicapi/module/song_url.js")) return songUrlFixture;
  if (normalized.endsWith("/kugoumusicapi/module/song_url_new.js")) return songUrlNewFixture;
  if (normalized.endsWith("/kugoumusicapi/module/playlist_detail.js")) return playlistDetailFixture;
  if (normalized.endsWith("/kugoumusicapi/module/search_lyric.js")) return searchLyricFixture;
  if (normalized.endsWith("/kugoumusicapi/module/lyric.js")) return lyricFixture;
  if (normalized.endsWith("/kugoumusicapi/module/comment_music.js")) return commentMusicFixture;
  if (normalized.endsWith("/kugoumusicapi/module/playlist_tracks_add.js")) return playlistTracksAddFixture;
  return originalLoad.call(this, request, parent, isMain);
};
