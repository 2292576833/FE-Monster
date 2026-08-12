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
let qrCheckAttempts = 0;

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

function userVipDetailFixture(params) {
  record("user-vip-detail", {
    userid: params?.userid || params?.cookie?.userid || "",
    hasToken: Boolean(params?.token || params?.cookie?.token)
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: {
        userid: String(params?.userid || params?.cookie?.userid || "42"),
        vip_type: 5,
        m_type: 1,
        y_type: 0,
        busi_vip: [{
          busi_type: "concept",
          product_type: "svip",
          is_vip: 1,
          vip_end_time: "2099-12-31"
        }]
      }
    }
  });
}

function loginQrKeyFixture() {
  record("login-qr-key");
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: {
        qrcode: "fixture-qr-key",
        qrcode_img: "https://fixture.invalid/qr"
      }
    }
  });
}

function loginQrCreateFixture(params) {
  record("login-qr-create", {
    keyMatches: params?.key === "fixture-qr-key",
    qrimg: params?.qrimg === true
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      code: 200,
      data: {
        url: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${encodeURIComponent(params?.key || "")}`,
        base64: "data:image/png;base64,iVBORw0KGgo="
      }
    }
  });
}

function loginQrCheckFixture(params) {
  qrCheckAttempts += 1;
  record("login-qr-check", {
    attempt: qrCheckAttempts,
    keyMatches: params?.key === "fixture-qr-key"
  });
  const authenticated = scenario === "qr-login-success";
  return Promise.resolve({
    status: 200,
    cookie: authenticated
      ? ["token=fixture-mobile-token", "userid=42", "vip_type=1"]
      : [],
    body: {
      status: 1,
      data: authenticated
        ? {
            status: 4,
            token: "fixture-mobile-token",
            userid: "42",
            vip_type: 1
          }
        : { status: 1 }
    }
  });
}

function loginTokenFixture(params) {
  record("login-token", {
    useridMatches: String(params?.userid || params?.cookie?.userid || "") === "42",
    usesQrToken: (params?.token || params?.cookie?.token) === "fixture-mobile-token",
    hasDeviceIdentity: Boolean(params?.cookie?.KUGOU_API_GUID && params?.cookie?.dfid)
  });
  return Promise.resolve({
    status: 200,
    cookie: [
      "token=fixture-refreshed-token",
      "userid=42",
      "vip_type=1",
      "vip_token=fixture-vip-token"
    ],
    body: {
      status: 1,
      data: {
        token: "fixture-refreshed-token",
        userid: "42",
        vip_type: 1,
        vip_token: "fixture-vip-token"
      }
    }
  });
}

function userDetailFixture(params) {
  record("user-detail", {
    userid: params?.userid || params?.cookie?.userid || "",
    hasToken: Boolean(params?.token || params?.cookie?.token),
    usesRefreshedToken: (params?.token || params?.cookie?.token) === "fixture-refreshed-token"
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: {
        userid: "42",
        nickname: "Fixture Listener",
        pic: "https://fixture.invalid/avatar.jpg"
      }
    }
  });
}

function userPlaylistFixture(params) {
  record("user-playlist", {
    userid: params?.userid || params?.cookie?.userid || "",
    hasToken: Boolean(params?.token || params?.cookie?.token)
  });
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: {
        info: [
          { listid: 100, listname: "我喜欢", type: 2, count: 9 },
          { listid: 101, listname: "通勤歌单", type: 0, count: 4 }
        ]
      }
    }
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
  if (scenario === "song-identity-mismatch") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: "https://fixture.invalid/v3/ffffffffffffffffffffffffffffffff/yp/full/mx999999_qu128.mp3"
      }
    });
  }
  if (scenario === "song-cdn-prefix-same-identity") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: `https://fixture.invalid/expiry/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/v3/${params.hash}/yp/full/mx${params.album_audio_id}_qu128.mp3`
      }
    });
  }
  if (scenario === "song-unmarked-no-metadata") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: "https://fixture.invalid/opaque/no-metadata.mp3"
      }
    });
  }
  if (scenario === "song-unmarked-mismatched-metadata") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        data: [{
          hash: "ffffffffffffffffffffffffffffffff",
          album_audio_id: 999999,
          url: "https://fixture.invalid/opaque/wrong-track.mp3"
        }]
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
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: [{
        hash: params?.hash || "",
        album_audio_id: params?.album_audio_id || 0,
        url: "https://fixture.invalid/free.mp3"
      }]
    }
  });
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
        data: [{
          hash: params?.hash || "",
          album_audio_id: params?.album_audio_id || 0,
          url: ["https://fixture.invalid/current-free.mp3"]
        }]
      }
    });
  }
  if (scenario === "song-identity-mismatch") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: "https://fixture.invalid/v3/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/yp/full/mx888888_qu128.mp3"
      }
    });
  }
  if (scenario === "song-cdn-prefix-same-identity") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: `https://fixture.invalid/expiry/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/v3/${params.hash}/yp/full/mx${params.album_audio_id}_qu128.mp3`
      }
    });
  }
  if (scenario === "song-unmarked-no-metadata") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        url: "https://fixture.invalid/opaque/new-no-metadata.mp3"
      }
    });
  }
  if (scenario === "song-unmarked-mismatched-metadata") {
    return Promise.resolve({
      status: 200,
      cookie: [],
      body: {
        status: 1,
        data: [{
          hash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          album_audio_id: 888888,
          url: "https://fixture.invalid/opaque/new-wrong-track.mp3"
        }]
      }
    });
  }
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 1,
      data: [{
        hash: params?.hash || "",
        album_audio_id: params?.album_audio_id || 0,
        url: "https://fixture.invalid/new-free.mp3"
      }]
    }
  });
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
  const staleAudioId = scenario === "lyrics-stale-audio-id";
  const unavailable = scenario === "lyrics-unavailable";
  const metadataMatches = params?.keywords === "Red Shoe"
    && Number(params?.duration) === 206000;
  const staleAudioIdRejected = staleAudioId && Number(params?.album_audio_id || 0) > 0;
  return Promise.resolve({
    status: 200,
    cookie: [],
    body: {
      status: 200,
      candidates: unavailable || staleAudioIdRejected || (metadataRequired && !metadataMatches)
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
  if (normalized.endsWith("/kugoumusicapi/module/login_token.js")) return loginTokenFixture;
  if (normalized.endsWith("/kugoumusicapi/module/login_qr_key.js")) return loginQrKeyFixture;
  if (normalized.endsWith("/kugoumusicapi/module/login_qr_create.js")) return loginQrCreateFixture;
  if (normalized.endsWith("/kugoumusicapi/module/login_qr_check.js")) return loginQrCheckFixture;
  if (normalized.endsWith("/kugoumusicapi/module/user_detail.js")) return userDetailFixture;
  if (normalized.endsWith("/kugoumusicapi/module/user_playlist.js")) return userPlaylistFixture;
  if (normalized.endsWith("/kugoumusicapi/module/user_vip_detail.js")) return userVipDetailFixture;
  if (normalized.endsWith("/kugoumusicapi/module/song_url.js")) return songUrlFixture;
  if (normalized.endsWith("/kugoumusicapi/module/song_url_new.js")) return songUrlNewFixture;
  if (normalized.endsWith("/kugoumusicapi/module/playlist_detail.js")) return playlistDetailFixture;
  if (normalized.endsWith("/kugoumusicapi/module/search_lyric.js")) return searchLyricFixture;
  if (normalized.endsWith("/kugoumusicapi/module/lyric.js")) return lyricFixture;
  if (normalized.endsWith("/kugoumusicapi/module/comment_music.js")) return commentMusicFixture;
  if (normalized.endsWith("/kugoumusicapi/module/playlist_tracks_add.js")) return playlistTracksAddFixture;
  return originalLoad.call(this, request, parent, isMain);
};
