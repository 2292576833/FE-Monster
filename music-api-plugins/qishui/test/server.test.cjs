"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { createServer: createNetServer } = require("node:net");
const { gzipSync } = require("node:zlib");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const pluginEntry = path.resolve(__dirname, "..", "src", "server.cjs");

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJson(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Qishui plugin exited before becoming ready (${child.exitCode})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      return { response, payload: await response.json() };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw lastError;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);
}

async function startFixture(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/api/luna/v1/platform/feed/song-tab/`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function startPlugin(dataDir, feedUrl, refreshUrl = "", extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [
    pluginEntry,
    `--port=${port}`,
    `--data-dir=${dataDir}`
  ], {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      FE_QISHUI_OPENAPI_FEED_URL: feedUrl,
      FE_QISHUI_OPENAPI_REFRESH_URL: refreshUrl,
      FE_QISHUI_ALLOW_HTTP_FIXTURE: "1",
      APPDATA: path.join(dataDir, "isolated-appdata"),
      ...extraEnv
    }
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForJson(`${baseUrl}/health`, child);
  return { child, baseUrl };
}

function lunaQueueCache(payload) {
  return Buffer.concat([
    Buffer.from("LUNA", "ascii"),
    gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))
  ]);
}

function lunaConfig(payload) {
  return Buffer.concat([
    Buffer.from("LUNA", "ascii"),
    gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))
  ]);
}

function localStorageRequestCacheRecord(key, payload) {
  return Buffer.concat([
    Buffer.from(`\n_app://resources\u0000\u0001${key}\u0000`, "utf8"),
    Buffer.from([0x01, 0x00]),
    Buffer.from(JSON.stringify(payload), "utf16le"),
    Buffer.from("\n", "utf8")
  ]);
}

function levelDbVarint(value) {
  let remaining = Number(value);
  const bytes = [];
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return Buffer.from(bytes);
}

function chromiumLocalStorageKey(key) {
  return Buffer.concat([
    Buffer.from("_app://resources\0", "utf8"),
    Buffer.from([1]),
    Buffer.from(key, "utf8")
  ]);
}

function chromiumLocalStorageValue(payload, encoding = "utf8") {
  const body = Buffer.from(JSON.stringify(payload), encoding);
  return Buffer.concat([
    Buffer.from([encoding === "utf16le" ? 0 : 1]),
    body
  ]);
}

function levelDbLog(records) {
  const entries = [];
  for (const [key, value] of records) {
    entries.push(
      Buffer.from([1]),
      levelDbVarint(key.length),
      key,
      levelDbVarint(value.length),
      value
    );
  }
  const batchHeader = Buffer.alloc(12);
  batchHeader.writeUInt32LE(records.length, 8);
  const batch = Buffer.concat([batchHeader, ...entries]);
  if (batch.length > 32 * 1024 - 7) {
    throw new Error("fixture write batch is too large");
  }
  const physicalHeader = Buffer.alloc(7);
  physicalHeader.writeUInt16LE(batch.length, 4);
  physicalHeader[6] = 1;
  return Buffer.concat([physicalHeader, batch]);
}

function levelDbBlock(entries) {
  const chunks = [];
  const restarts = [];
  let offset = 0;
  for (const [key, value] of entries) {
    restarts.push(offset);
    const header = Buffer.concat([
      levelDbVarint(0),
      levelDbVarint(key.length),
      levelDbVarint(value.length)
    ]);
    chunks.push(header, key, value);
    offset += header.length + key.length + value.length;
  }
  const restartBytes = Buffer.alloc(restarts.length * 4 + 4);
  restarts.forEach((restart, index) => restartBytes.writeUInt32LE(restart, index * 4));
  restartBytes.writeUInt32LE(restarts.length, restarts.length * 4);
  return Buffer.concat([...chunks, restartBytes]);
}

function levelDbBlockHandle(offset, size) {
  return Buffer.concat([levelDbVarint(offset), levelDbVarint(size)]);
}

function levelDbTable(records) {
  const internalRecords = records.map(([key, value], index) => {
    const trailer = Buffer.alloc(8);
    trailer.writeBigUInt64LE((BigInt(index + 1) << 8n) | 1n);
    return [Buffer.concat([key, trailer]), value];
  });
  const dataBlock = levelDbBlock(internalRecords);
  const dataTrailer = Buffer.alloc(5);
  const dataRegion = Buffer.concat([dataBlock, dataTrailer]);

  const metaBlock = levelDbBlock([]);
  const metaOffset = dataRegion.length;
  const metaRegion = Buffer.concat([metaBlock, Buffer.alloc(5)]);

  const indexBlock = levelDbBlock([[
    Buffer.from("z", "utf8"),
    levelDbBlockHandle(0, dataBlock.length)
  ]]);
  const indexOffset = metaOffset + metaRegion.length;
  const indexRegion = Buffer.concat([indexBlock, Buffer.alloc(5)]);

  const handles = Buffer.concat([
    levelDbBlockHandle(metaOffset, metaBlock.length),
    levelDbBlockHandle(indexOffset, indexBlock.length)
  ]);
  const footer = Buffer.concat([
    handles,
    Buffer.alloc(40 - handles.length),
    Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb])
  ]);
  return Buffer.concat([dataRegion, metaRegion, indexRegion, footer]);
}

test("official OpenAPI token login is validated, persisted, and never echoed", async (context) => {
  const accessToken = "act.fixture-secret-token";
  const requests = [];
  const fixture = await startFixture((request, response) => {
    requests.push({
      method: request.method,
      accessToken: request.headers["access-token"]
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      data: { media_list: [] },
      err_no: 0,
      err_msg: ""
    }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-login-"));
  const children = [];
  context.after(async () => {
    await Promise.all(children.map(stopChild));
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const first = await startPlugin(dataDir, fixture.url);
  children.push(first.child);
  const initialHealth = await (await fetch(`${first.baseUrl}/health`)).json();
  assert.equal(initialHealth.loggedIn, false);

  const loginResponse = await fetch(`${first.baseUrl}/session/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken })
  });
  const loginPayload = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(loginPayload.ok, true);
  assert.equal(loginPayload.loggedIn, true);
  assert.equal(JSON.stringify(loginPayload).includes(accessToken), false);
  assert.deepEqual(requests, [{ method: "POST", accessToken }]);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir, fixture.url);
  children.push(restarted.child);
  const restoredHealth = await (await fetch(`${restarted.baseUrl}/health`)).json();
  assert.equal(restoredHealth.loggedIn, true);
  assert.equal(JSON.stringify(restoredHealth).includes(accessToken), false);
});

test("search filters only metadata returned by the authorized official feed", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      err_no: 0,
      err_msg: "",
      data: {
        items: [
          {
            entity: {
              media: {
                track_entity: {
                  base_info: {
                    id: "track-authorized-1",
                    name: "星河入梦",
                    duration_ms: 215000
                  },
                  related_info: {
                    album_link: { id: "album-1", name: "夜航" },
                    artist_links: [
                      { id: "artist-1", name: "测试歌手" }
                    ]
                  },
                  display_info: {
                    cover_url: {
                      urls: ["https://media.example.test/cover-1.jpg"]
                    }
                  }
                }
              }
            }
          },
          {
            entity: {
              media: {
                track_entity: {
                  base_info: {
                    id: "track-authorized-2",
                    name: "清晨微光",
                    duration_ms: 183000
                  },
                  related_info: {
                    album_link: { id: "album-2", name: "日光" },
                    artist_links: [
                      { id: "artist-2", name: "另一位歌手" }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-search-"));
  const plugin = await startPlugin(dataDir, fixture.url);
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const login = await fetch(`${plugin.baseUrl}/session/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: "act.search-scope-token" })
  });
  assert.equal(login.status, 200);

  const response = await fetch(`${plugin.baseUrl}/search?keyword=${encodeURIComponent("星河")}&page=1&limit=10`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "qishui");
  assert.equal(payload.source, "official-feed-filter");
  assert.deepEqual(payload.songs, [{
    id: "track-authorized-1",
    title: "星河入梦",
    artist: "测试歌手",
    album: "夜航",
    cover: "https://media.example.test/cover-1.jpg",
    provider: "qishui",
    duration: 215
  }]);
});

test("playback exposes only a direct HTTPS URL from the authorized full stream", async (context) => {
  const fullUrl = "https://audio.example.test/authorized-full.m4a?expires=1893456000";
  const previewUrl = "https://audio.example.test/preview-only.m4a";
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      err_no: 0,
      err_msg: "",
      data: {
        items: [
          {
            entity: {
              media: {
                track_entity: {
                  base_info: { id: "track-full", name: "已授权完整音源" },
                  player_info: {
                    full: {
                      video_model_info: {
                        url_player_info: fullUrl
                      }
                    },
                    preview: {
                      video_model_info: {
                        url_player_info: previewUrl
                      }
                    }
                  }
                }
              }
            }
          },
          {
            entity: {
              media: {
                track_entity: {
                  base_info: { id: "track-preview-only", name: "仅试听" },
                  commerce_info: {
                    payment_type: 1,
                    playable_condition: "purchase-required"
                  },
                  player_info: {
                    full: {
                      video_model_info: {
                        url_player_info: "opaque-player-info-that-is-not-a-url"
                      }
                    },
                    preview: {
                      video_model_info: {
                        url_player_info: previewUrl
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-playback-"));
  const plugin = await startPlugin(dataDir, fixture.url);
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const login = await fetch(`${plugin.baseUrl}/session/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: "act.play-core-token" })
  });
  assert.equal(login.status, 200);

  const authorizedResponse = await fetch(`${plugin.baseUrl}/song/url?id=track-full`);
  const authorized = await authorizedResponse.json();
  assert.equal(authorizedResponse.status, 200);
  assert.equal(authorized.ok, true);
  assert.equal(authorized.playable, true);
  assert.equal(authorized.url, fullUrl);
  assert.equal(JSON.stringify(authorized).includes(previewUrl), false);

  const restrictedResponse = await fetch(`${plugin.baseUrl}/song/url?id=track-preview-only`);
  const restricted = await restrictedResponse.json();
  assert.equal(restrictedResponse.status, 200);
  assert.equal(restricted.ok, true);
  assert.equal(restricted.playable, false);
  assert.equal(restricted.url, "");
  assert.equal(restricted.restriction.code, "official-full-stream-unavailable");
  assert.equal(JSON.stringify(restricted).includes(previewUrl), false);
  assert.equal(JSON.stringify(restricted).includes("opaque-player-info"), false);
});

test("an expired access token is refreshed once through the official OAuth endpoint", async (context) => {
  const events = [];
  const fixture = await startFixture(async (request, response) => {
    if (request.url === "/oauth/refresh_token/") {
      const body = await new Promise((resolve) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      events.push({
        type: "refresh",
        contentType: request.headers["content-type"],
        body
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        message: "success",
        data: {
          error_code: 0,
          access_token: "act.renewed-secret",
          refresh_token: "rft.renewed-secret",
          expires_in: 1296000
        }
      }));
      return;
    }

    const accessToken = request.headers["access-token"];
    events.push({ type: "feed", accessToken });
    response.writeHead(200, { "content-type": "application/json" });
    if (accessToken === "act.expired-secret") {
      response.end(JSON.stringify({
        data: {
          error_code: 10008,
          description: "access token expired"
        },
        message: "error"
      }));
      return;
    }
    response.end(JSON.stringify({
      err_no: 0,
      err_msg: "",
      data: { items: [] }
    }));
  });
  const refreshUrl = new URL("/oauth/refresh_token/", fixture.url).toString();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-refresh-"));
  const plugin = await startPlugin(dataDir, fixture.url, refreshUrl);
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/session/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: "act.expired-secret",
      refreshToken: "rft.original-secret",
      clientKey: "client-key-fixture"
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.loggedIn, true);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
  assert.deepEqual(events.map((event) => event.type), ["feed", "refresh", "feed"]);
  assert.match(events[1].contentType, /^application\/x-www-form-urlencoded/);
  const refreshForm = new URLSearchParams(events[1].body);
  assert.equal(refreshForm.get("client_key"), "client-key-fixture");
  assert.equal(refreshForm.get("grant_type"), "refresh_token");
  assert.equal(refreshForm.get("refresh_token"), "rft.original-secret");
  assert.equal(events[2].accessToken, "act.renewed-secret");
});

test("local SodaMusic detection stays read-only and explicit metadata import powers guest search", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-local-"));
  const appDir = path.join(dataDir, "fake-soda-app");
  const appPath = path.join(appDir, "SodaMusic.exe");
  await mkdir(appDir, { recursive: true });
  await writeFile(appPath, "fixture executable marker");
  const plugin = await startPlugin(dataDir, fixture.url, "", {
    FE_QISHUI_LOCAL_APP_PATH: appPath,
    APPDATA: path.join(dataDir, "empty-appdata")
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(status.ok, true);
  assert.equal(status.installed, true);
  assert.equal(status.loginState, "unknown");
  assert.equal(status.credentialsRead, false);
  assert.equal(JSON.stringify(status).includes("session"), false);

  const library = {
    schema: "fe-monster.qishui-library/v1",
    playlists: [{
      id: "visible-playlist-1",
      name: "我可见的歌单",
      tracks: [{
        id: "visible-track-1",
        title: "导入的星河",
        artist: "元数据歌手",
        album: "公开元数据",
        duration: 216
      }]
    }]
  };
  const importedResponse = await fetch(`${plugin.baseUrl}/local/library/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(library)
  });
  const imported = await importedResponse.json();
  assert.equal(importedResponse.status, 200);
  assert.equal(imported.ok, true);
  assert.equal(imported.playlists, 1);
  assert.equal(imported.tracks, 1);

  const guestSearchResponse = await fetch(
    `${plugin.baseUrl}/search?keyword=${encodeURIComponent("导入的星河")}&limit=20`
  );
  const guestSearch = await guestSearchResponse.json();
  assert.equal(guestSearchResponse.status, 200);
  assert.equal(guestSearch.ok, true);
  assert.equal(guestSearch.source, "local-metadata-filter");
  assert.equal(guestSearch.authorizationRequiredForPlayback, true);
  assert.equal(guestSearch.songs.length, 1);
  assert.equal(guestSearch.songs[0].title, "导入的星河");
  assert.equal(guestSearch.songs[0].sourceRef.metadataOnly, true);

  const playlists = await (await fetch(`${plugin.baseUrl}/user/playlist`)).json();
  assert.equal(playlists.playlists.length, 1);
  const tracks = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=visible-playlist-1`)
  ).json();
  assert.equal(tracks.songs.length, 1);
  assert.equal(tracks.songs[0].sourceRef.matchArtist, "元数据歌手");

  const forbidden = await fetch(`${plugin.baseUrl}/local/library/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schema: "fe-monster.qishui-library/v1",
      accessToken: "must-not-be-imported",
      playlists: []
    })
  });
  assert.equal(forbidden.status, 400);
  assert.equal(JSON.stringify(await forbidden.json()).includes("must-not-be-imported"), false);
});

test("SodaMusic Config exposes only an allowlisted public login profile and fails closed", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-public-profile-"));
  const appData = path.join(dataDir, "appdata");
  const configPath = path.join(appData, "SodaMusic", "LunaStorage", "Config");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, lunaConfig({
    userInfoStateCache: {
      my_info: {
        id: "private-local-user-id-must-not-leak",
        nickname: "汽水测试用户",
        public_name: "公开昵称",
        larger_avatar_url: {
          uri: "private-avatar-uri-must-not-leak",
          urls: [
            "http://insecure.example.test/avatar.jpg",
            "https://media.example.test/avatar.jpg"
          ]
        },
        medium_avatar_url: {
          uri: "private-medium-avatar-uri",
          urls: ["https://media.example.test/avatar-medium.jpg"]
        },
        masked_phone_no: "138****0000",
        sec_uid: "private-sec-uid",
        douyin_id: "private-douyin-id",
        is_vip: true,
        access_token: "must-never-leak-token"
      },
      my_stats: {
        count_all_liked: 28,
        cookie: "must-never-leak-cookie"
      }
    }
  }));
  const plugin = await startPlugin(dataDir, fixture.url, "", { APPDATA: appData });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const statusResponse = await fetch(`${plugin.baseUrl}/local/status`);
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(status.loginDetected, true);
  assert.equal(status.loginState, "logged-in");
  assert.equal(status.displayName, "公开昵称");
  assert.equal(status.avatar, "https://media.example.test/avatar.jpg");
  assert.equal(status.isVip, true);
  assert.equal(status.likedCount, 28);
  assert.equal(status.credentialsRead, false);
  assert.equal(status.metadataState, "unavailable");
  assert.deepEqual(status.collections, [{
    id: "sodamusic-liked-summary",
    name: "我喜欢的音乐",
    trackCount: 28,
    metadataState: "unavailable",
    playable: false
  }]);

  const login = await (await fetch(`${plugin.baseUrl}/login/status`)).json();
  assert.equal(login.loggedIn, true);
  assert.equal(login.localLoginDetected, true);
  assert.equal(login.playbackAuthorized, false);
  assert.deepEqual(login.account, {
    nickname: "公开昵称",
    avatar: "https://media.example.test/avatar.jpg",
    isVip: true
  });

  const exposed = JSON.stringify({ status, login });
  for (const secret of [
    "private-local-user-id-must-not-leak",
    "private-sec-uid",
    "private-douyin-id",
    "138****0000",
    "must-never-leak-token",
    "must-never-leak-cookie",
    "insecure.example.test",
    "private-avatar-uri-must-not-leak",
    "private-medium-avatar-uri"
  ]) {
    assert.equal(exposed.includes(secret), false);
  }

  await writeFile(configPath, lunaConfig({
    userInfoStateCache: {
      my_info: {
        id: "still-private",
        nickname: "无安全头像",
        larger_avatar_url: {
          uri: "insecure-only",
          urls: ["http://insecure.example.test/avatar.jpg"]
        }
      },
      my_stats: { count_all_liked: 0 }
    }
  }));
  const insecureAvatar = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(insecureAvatar.loginDetected, true);
  assert.equal(insecureAvatar.avatar, "");

  await writeFile(configPath, Buffer.from("LUNAnot-gzip", "ascii"));
  const damaged = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(damaged.configState, "invalid");
  assert.equal(damaged.loginDetected, false);
  assert.equal(damaged.loginState, "unknown");
  assert.equal(damaged.credentialsRead, false);
  assert.equal(damaged.avatar, "");
});

test("local SodaMusic liked and Douyin collections expose metadata-only tracks", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-local-collections-"));
  const appData = path.join(dataDir, "appdata");
  const lunaStorage = path.join(appData, "SodaMusic", "LunaStorage");
  const leveldb = path.join(appData, "SodaMusic", "Local Storage", "leveldb");
  await mkdir(lunaStorage, { recursive: true });
  await mkdir(leveldb, { recursive: true });
  await writeFile(path.join(lunaStorage, "Config"), lunaConfig({
    userInfoStateCache: {
      my_info: {
        id: "private-local-user-id",
        public_name: "\u6c7d\u6c34\u672c\u5730\u7528\u6237",
        larger_avatar_url: {
          urls: ["https://media.example.test/local-avatar.jpg"]
        }
      },
      my_stats: { count_all_liked: 1 }
    }
  }));

  const likedId = "liked-private-id-must-not-leak";
  const douyinId = "douyin-private-id-must-not-leak";
  const sensitiveToken = "local-token-must-not-leak";
  const forbiddenAudioUrl = "https://audio.example.test/must-not-leak.m4a";
  const requestCache = levelDbLog([
    [
      chromiumLocalStorageKey("useRequestCache:playlists:private-local-user-id"),
      chromiumLocalStorageValue({
      time: 1,
      data: {
        playlists: [
          {
            id: likedId,
            title: "\u6211\u559c\u6b22\u7684\u97f3\u4e50",
            type: 1,
            url_cover: "https://media.example.test/liked-cover.jpg",
            resource_cnt: { track_cnt: 1 }
          },
          {
            id: douyinId,
            title: "\u6296\u97f3\u6536\u85cf\u7684\u97f3\u4e50",
            type: 4,
            url_cover: "https://media.example.test/douyin-cover.jpg",
            resource_cnt: { track_cnt: 1 }
          }
        ]
      }
      }, "utf16le")
    ],
    [
      chromiumLocalStorageKey(`useRequestCache:playlist_detail:${likedId}`),
      chromiumLocalStorageValue({
      time: 2,
      data: {
        tracks: [{
          id: "liked-track-private-id",
          name: "\u661f\u6cb3\u5165\u68a6",
          artists: [{ id: "artist-private-id", name: "\u6d4b\u8bd5\u6b4c\u624b" }],
          album: { id: "album-private-id", name: "\u591c\u822a" },
          duration: 216000,
          cover_url: "https://media.example.test/liked-track.jpg",
          bit_rates: [{ quality: "lossless", url: forbiddenAudioUrl }],
          access_token: sensitiveToken
        }]
      }
      }, "utf16le")
    ],
    [
      chromiumLocalStorageKey(`useRequestCache:playlist_detail:${douyinId}`),
      chromiumLocalStorageValue({
      time: 3,
      data: {
        tracks: [{
          id: "douyin-track-private-id",
          name: "\u6e05\u6668\u5fae\u5149",
          artists: [{ id: "artist-private-id-2", name: "\u53e6\u4e00\u4f4d\u6b4c\u624b" }],
          duration: 183000,
          play_url: forbiddenAudioUrl,
          session: { token: sensitiveToken }
        }]
      }
      }, "utf16le")
    ]
  ]);
  await writeFile(path.join(leveldb, "000003.log"), requestCache);

  const plugin = await startPlugin(dataDir, fixture.url, "", { APPDATA: appData });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(status.loginDetected, true);
  assert.equal(status.displayName, "\u6c7d\u6c34\u672c\u5730\u7528\u6237");
  assert.equal(status.avatar, "https://media.example.test/local-avatar.jpg");
  assert.deepEqual(status.collections, [
    {
      id: "sodamusic-local-liked",
      name: "\u6211\u559c\u6b22\u7684\u97f3\u4e50",
      trackCount: 1,
      metadataState: "ready",
      playable: true
    },
    {
      id: "sodamusic-local-douyin",
      name: "\u6296\u97f3\u6536\u85cf\u7684\u97f3\u4e50",
      trackCount: 1,
      metadataState: "ready",
      playable: true
    }
  ]);

  const playlists = await (await fetch(`${plugin.baseUrl}/user/playlist`)).json();
  assert.deepEqual(playlists.playlists.map(({ id, name, trackCount }) => ({
    id,
    name,
    trackCount
  })), [
    {
      id: "sodamusic-local-liked",
      name: "\u6211\u559c\u6b22\u7684\u97f3\u4e50",
      trackCount: 1
    },
    {
      id: "sodamusic-local-douyin",
      name: "\u6296\u97f3\u6536\u85cf\u7684\u97f3\u4e50",
      trackCount: 1
    }
  ]);

  const liked = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=sodamusic-local-liked`)
  ).json();
  assert.deepEqual(liked.songs, [{
    id: "metadata:liked:\u661f\u6cb3\u5165\u68a6:\u6d4b\u8bd5\u6b4c\u624b",
    title: "\u661f\u6cb3\u5165\u68a6",
    artist: "\u6d4b\u8bd5\u6b4c\u624b",
    album: "\u591c\u822a",
    cover: "https://media.example.test/liked-track.jpg",
    provider: "qishui",
    duration: 216,
    sourceRef: {
      metadataOnly: true,
      matchTitle: "\u661f\u6cb3\u5165\u68a6",
      matchArtist: "\u6d4b\u8bd5\u6b4c\u624b",
      localClientCache: true,
      localCollection: "liked"
    }
  }]);

  const douyin = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=sodamusic-local-douyin`)
  ).json();
  assert.equal(douyin.songs.length, 1);
  assert.equal(douyin.songs[0].title, "\u6e05\u6668\u5fae\u5149");
  assert.equal(douyin.songs[0].artist, "\u53e6\u4e00\u4f4d\u6b4c\u624b");
  assert.equal(douyin.songs[0].sourceRef.localCollection, "douyin");

  const exposed = JSON.stringify({ status, playlists, liked, douyin });
  for (const forbidden of [
    likedId,
    douyinId,
    "liked-track-private-id",
    "douyin-track-private-id",
    "artist-private-id",
    "album-private-id",
    sensitiveToken,
    forbiddenAudioUrl,
    "bit_rates",
    "play_url",
    "session"
  ]) {
    assert.equal(exposed.includes(forbidden), false, `leaked forbidden local field: ${forbidden}`);
  }
});

test("the fixed SodaMusic QueueCache path exposes only whitelisted local queue metadata", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-queue-cache-"));
  const appData = path.join(dataDir, "appdata");
  const queuePath = path.join(appData, "SodaMusic", "LunaStorage", "QueueCache");
  await mkdir(path.dirname(queuePath), { recursive: true });
  const sensitiveToken = "must-never-leak-local-token";
  const forbiddenAudioUrl = "https://audio.example.test/must-never-leak.m4a";
  await writeFile(queuePath, lunaQueueCache({
    "u_123456:feed": {
      version: 7,
      savedAt: 1_783_000_000_000,
      cursor: "opaque-cursor-must-not-leak",
      hasMore: true,
      playables: [{
        id: "official-local-queue-1",
        name: "本地队列歌曲",
        artists: [{ id: "artist-private-id", name: "本地歌手" }],
        album: { id: "album-private-id", name: "本地专辑" },
        duration: 216000,
        cover_url: "https://media.example.test/local-cover.jpg",
        bit_rates: [{ quality: "lossless", url: forbiddenAudioUrl }],
        audition_info: { play_url: forbiddenAudioUrl },
        access_token: sensitiveToken,
        session: { cookie: "must-never-leak-cookie" }
      }]
    }
  }));
  const plugin = await startPlugin(dataDir, fixture.url, "", { APPDATA: appData });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(status.ok, true);
  assert.equal(status.localProfilePresent, true);
  assert.equal(status.trackCount, 1);
  assert.equal(status.loginState, "unknown");
  assert.equal(status.credentialsRead, false);

  const playlists = await (await fetch(`${plugin.baseUrl}/user/playlist`)).json();
  assert.equal(playlists.playlists.length, 1);
  assert.equal(playlists.playlists[0].id, "local-queue-cache");
  assert.equal(playlists.playlists[0].name, "本地播放队列");
  assert.equal(playlists.playlists[0].trackCount, 1);

  const tracks = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=local-queue-cache`)
  ).json();
  assert.equal(tracks.songs.length, 1);
  assert.deepEqual(tracks.songs[0], {
    id: "official-local-queue-1",
    title: "本地队列歌曲",
    artist: "本地歌手",
    album: "本地专辑",
    cover: "https://media.example.test/local-cover.jpg",
    provider: "qishui",
    duration: 216,
    sourceRef: {
      metadataOnly: true,
      providerSongId: "official-local-queue-1",
      matchTitle: "本地队列歌曲",
      matchArtist: "本地歌手",
      matchDuration: 216,
      localQueueCache: true
    }
  });
  const exposed = JSON.stringify({ status, playlists, tracks });
  assert.equal(exposed.includes(sensitiveToken), false);
  assert.equal(exposed.includes(forbiddenAudioUrl), false);
  assert.equal(exposed.includes("bit_rates"), false);
  assert.equal(exposed.includes("audition_info"), false);
  assert.equal(exposed.includes("opaque-cursor"), false);

  const guestSearch = await (
    await fetch(`${plugin.baseUrl}/search?keyword=${encodeURIComponent("本地队列歌曲")}`)
  ).json();
  assert.equal(guestSearch.songs.length, 1);
  assert.equal(guestSearch.songs[0].sourceRef.localQueueCache, true);
  assert.equal(guestSearch.authorizationRequiredForPlayback, true);
});

test("malformed, oversized, decompression-bomb, and over-deep QueueCache files fail closed", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-queue-cache-bounds-"));
  const appData = path.join(dataDir, "appdata");
  const queuePath = path.join(appData, "SodaMusic", "LunaStorage", "QueueCache");
  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(queuePath, Buffer.from("LUNAnot-a-gzip-stream", "ascii"));
  const plugin = await startPlugin(dataDir, fixture.url, "", { APPDATA: appData });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function requireRejectedCache() {
    const status = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
    assert.equal(status.localProfilePresent, true);
    assert.equal(status.trackCount, 0);
    assert.equal(status.queueCacheState, "invalid");
    const playlists = await (await fetch(`${plugin.baseUrl}/user/playlist`)).json();
    assert.equal(playlists.playlists.length, 0);
  }

  await requireRejectedCache();

  await writeFile(queuePath, Buffer.concat([
    Buffer.from("LUNA", "ascii"),
    Buffer.alloc((2 * 1024 * 1024) + 1, 0x41)
  ]));
  await requireRejectedCache();

  await writeFile(queuePath, Buffer.concat([
    Buffer.from("LUNA", "ascii"),
    gzipSync(Buffer.alloc((8 * 1024 * 1024) + 1, 0x20))
  ]));
  await requireRejectedCache();

  let nested = { playables: [] };
  for (let index = 0; index < 30; index += 1) nested = { nested };
  await writeFile(queuePath, lunaQueueCache({ "u_123456:feed": nested }));
  await requireRejectedCache();
});

test("an imported playlist song is re-matched by official id or title artist and duration before playback", async (context) => {
  const fullUrl = "https://audio.example.test/rematched-full.m4a";
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      err_no: 0,
      err_msg: "",
      data: {
        items: [{
          entity: {
            media: {
              track_entity: {
                base_info: {
                  id: "official-rematch-42",
                  name: "重新匹配的歌",
                  duration_ms: 216000
                },
                related_info: {
                  artist_links: [{ name: "匹配歌手" }]
                },
                player_info: {
                  full: {
                    video_model_info: {
                      url_player_info: fullUrl
                    }
                  }
                }
              }
            }
          }
        }]
      }
    }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-rematch-"));
  const plugin = await startPlugin(dataDir, fixture.url);
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const login = await fetch(`${plugin.baseUrl}/session/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: "act.rematch-token" })
  });
  assert.equal(login.status, 200);

  const matchedResponse = await fetch(
    `${plugin.baseUrl}/song/url?${new URLSearchParams({
      id: "local-visible-id",
      title: "重新匹配的歌",
      artist: "匹配歌手",
      duration: "216"
    })}`
  );
  const matched = await matchedResponse.json();
  assert.equal(matchedResponse.status, 200);
  assert.equal(matched.playable, true);
  assert.equal(matched.url, fullUrl);
  assert.equal(matched.matchedBy, "title-artist-duration");
  assert.equal(matched.officialTrackId, "official-rematch-42");

  const mismatch = await (
    await fetch(
      `${plugin.baseUrl}/song/url?${new URLSearchParams({
        id: "local-visible-id",
        title: "重新匹配的歌",
        artist: "匹配歌手",
        duration: "999"
      })}`
    )
  ).json();
  assert.equal(mismatch.playable, false);
  assert.equal(mismatch.url, "");
  assert.equal(mismatch.restriction.code, "official-track-match-not-found");
});

test("local SodaMusic LevelDB exposes only cached profile collections and track metadata", async (context) => {
  const fixture = await startFixture((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ err_no: 0, err_msg: "", data: { items: [] } }));
  });
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-qishui-leveldb-"));
  const appData = path.join(dataDir, "appdata");
  const lunaStorage = path.join(appData, "SodaMusic", "LunaStorage");
  const levelDbDirectory = path.join(appData, "SodaMusic", "Local Storage", "leveldb");
  await mkdir(lunaStorage, { recursive: true });
  await mkdir(levelDbDirectory, { recursive: true });
  await writeFile(path.join(lunaStorage, "Config"), lunaConfig({
    userInfoStateCache: {
      my_info: {
        id: "private-local-user-id",
        public_name: "Local Soda User",
        larger_avatar_url: {
          uri: "private-avatar-uri",
          urls: ["https://media.example.test/local-avatar.jpg"]
        },
        access_token: "must-never-leak-profile-token"
      },
      my_stats: { count_all_liked: 1 }
    }
  }));

  const playlists = [{
    id: "liked-playlist-id",
    title: "我喜欢的音乐",
    type: 1,
    url_cover: { urls: ["https://media.example.test/liked-cover.jpg"] },
    resource_cnt: { track_cnt: 1 },
    session_id: "must-never-leak-playlist-session"
  }, {
    id: "douyin-playlist-id",
    title: "抖音收藏的音乐",
    type: 4,
    url_cover: { urls: ["https://media.example.test/douyin-cover.jpg"] },
    resource_cnt: { track_cnt: 1 },
    cookie: "must-never-leak-playlist-cookie"
  }];
  const playlistCache = {
    time: 2_000,
    data: { playlists },
    dataList: [{ playlists }]
  };
  await writeFile(path.join(levelDbDirectory, "000001.log"), levelDbLog([[
    chromiumLocalStorageKey("useRequestCache:playlists:private-local-user-id"),
    chromiumLocalStorageValue(playlistCache, "utf16le")
  ]]));

  const detail = (playlist, track) => ({
    time: 3_000,
    data: {
      playlist,
      media_resources: [{
        id: `resource-${track.id}`,
        entity: {
          track_wrapper: {
            track: {
              ...track,
              bit_rates: [{
                quality: "lossless",
                url: "https://audio.example.test/must-never-leak.m4a"
              }],
              access_token: "must-never-leak-track-token"
            }
          }
        }
      }],
      session_id: "must-never-leak-detail-session"
    }
  });
  await writeFile(path.join(levelDbDirectory, "000002.ldb"), levelDbTable([
    [
      chromiumLocalStorageKey("useRequestCache:playlist_detail:liked-playlist-id"),
      chromiumLocalStorageValue(detail(playlists[0], {
        id: "liked-track-id",
        name: "Liked Cache Track",
        artists: [{ name: "Liked Artist" }],
        album: {
          name: "Liked Album",
          url_cover: { urls: ["https://media.example.test/liked-track.jpg"] }
        },
        duration: 216000
      }), "utf16le")
    ],
    [
      chromiumLocalStorageKey("useRequestCache:playlist_detail:douyin-playlist-id"),
      chromiumLocalStorageValue(detail(playlists[1], {
        id: "douyin-track-id",
        name: "Douyin Cache Track",
        artists: [{ name: "Douyin Artist" }],
        album: {
          name: "Douyin Album",
          url_cover: { urls: ["https://media.example.test/douyin-track.jpg"] }
        },
        duration: 183000
      }))
    ]
  ]));

  const plugin = await startPlugin(dataDir, fixture.url, "", { APPDATA: appData });
  context.after(async () => {
    await stopChild(plugin.child);
    await fixture.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const status = await (await fetch(`${plugin.baseUrl}/local/status`)).json();
  assert.equal(status.loginDetected, true);
  assert.equal(status.displayName, "Local Soda User");
  assert.equal(status.avatar, "https://media.example.test/local-avatar.jpg");
  assert.equal(status.metadataState, "ready");
  assert.equal(status.credentialsRead, false);
  assert.deepEqual(
    status.collections.map(({ id, name, trackCount, metadataState, playable }) => ({
      id,
      name,
      trackCount,
      metadataState,
      playable
    })),
    [{
      id: "sodamusic-local-liked",
      name: "我喜欢的音乐",
      trackCount: 1,
      metadataState: "ready",
      playable: true
    }, {
      id: "sodamusic-local-douyin",
      name: "抖音收藏的音乐",
      trackCount: 1,
      metadataState: "ready",
      playable: true
    }]
  );

  const library = await (await fetch(`${plugin.baseUrl}/user/playlist`)).json();
  assert.deepEqual(
    library.playlists.map(({ id, name, trackCount }) => ({ id, name, trackCount })),
    [{
      id: "sodamusic-local-liked",
      name: "我喜欢的音乐",
      trackCount: 1
    }, {
      id: "sodamusic-local-douyin",
      name: "抖音收藏的音乐",
      trackCount: 1
    }]
  );

  const liked = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=sodamusic-local-liked`)
  ).json();
  const douyin = await (
    await fetch(`${plugin.baseUrl}/playlist/track/all?id=sodamusic-local-douyin`)
  ).json();
  assert.deepEqual(
    liked.songs.map(({ id, title, artist, album, duration }) => ({
      id, title, artist, album, duration
    })),
    [{
      id: "metadata:liked:Liked Cache Track:Liked Artist",
      title: "Liked Cache Track",
      artist: "Liked Artist",
      album: "Liked Album",
      duration: 216
    }]
  );
  assert.deepEqual(
    douyin.songs.map(({ id, title, artist, album, duration }) => ({
      id, title, artist, album, duration
    })),
    [{
      id: "metadata:douyin:Douyin Cache Track:Douyin Artist",
      title: "Douyin Cache Track",
      artist: "Douyin Artist",
      album: "Douyin Album",
      duration: 183
    }]
  );
  assert.equal(liked.songs[0].sourceRef.metadataOnly, true);
  assert.equal(douyin.songs[0].sourceRef.metadataOnly, true);

  const exposed = JSON.stringify({ status, library, liked, douyin });
  for (const secret of [
    "private-local-user-id",
    "liked-playlist-id",
    "douyin-playlist-id",
    "liked-track-id",
    "douyin-track-id",
    "private-avatar-uri",
    "must-never-leak-profile-token",
    "must-never-leak-playlist-session",
    "must-never-leak-playlist-cookie",
    "must-never-leak-track-token",
    "must-never-leak-detail-session",
    "must-never-leak.m4a"
  ]) {
    assert.equal(exposed.includes(secret), false);
  }
});
