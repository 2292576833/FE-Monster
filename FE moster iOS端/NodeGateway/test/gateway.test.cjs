"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  EncryptedSessionVault,
  MusicGateway,
  QrAttemptStore,
  assertJsonWithinLimit,
  createServer,
  mergeCookieString,
  normalizedPlaylist,
  normalizedSong,
  parseCookiePairs,
  ptuiCode,
  qqCheckSigUrl,
  routeRequest,
  validPlaybackUrl,
} = require("../main.cjs");

test("encrypted vault never writes provider credentials as plaintext", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fe-ios-vault-"));
  try {
    const filePath = path.join(directory, "sessions.enc");
    const key = crypto.randomBytes(32);
    const vault = new EncryptedSessionVault(filePath, key);
    vault.set("netease", {
      cookie: "MUSIC_U=top-secret-cookie",
      account: { userId: "42", nickname: "FE" },
    });
    const rawFile = fs.readFileSync(filePath, "utf8");
    assert.equal(rawFile.includes("top-secret-cookie"), false);
    const restored = new EncryptedSessionVault(filePath, key);
    assert.equal(restored.get("netease").cookie, "MUSIC_U=top-secret-cookie");
    assert.equal(restored.get("netease").account.nickname, "FE");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("QR attempts remain isolated and cannot be used across providers", () => {
  const attempts = new QrAttemptStore(() => 1_000);
  const first = attempts.create("qq", { qrsig: "first" });
  const second = attempts.create("qq", { qrsig: "second" });
  const third = attempts.create("netease", { key: "third" });
  assert.notEqual(first, second);
  assert.equal(attempts.require("qq", first).upstream.qrsig, "first");
  assert.equal(attempts.require("qq", second).upstream.qrsig, "second");
  assert.throws(() => attempts.require("qq", third), /missing or expired/);
});

test("QR attempts are throttled and evict old records per provider", () => {
  let now = 10_000;
  const attempts = new QrAttemptStore(() => now);
  attempts.begin("qq");
  const first = attempts.create("qq", { qrsig: "first" });
  assert.throws(() => attempts.begin("qq"), /too frequent/);

  now += 1_000;
  attempts.begin("qq");
  attempts.create("qq", { qrsig: "second" });
  now += 1_000;
  attempts.begin("qq");
  attempts.create("qq", { qrsig: "third" });

  assert.throws(() => attempts.require("qq", first), /missing or expired/);
});

test("cookie parsing removes attributes and merges by cookie name", () => {
  const values = parseCookiePairs([
    "MUSIC_U=one; Path=/; HttpOnly",
    "token=two; Max-Age=3600; Secure",
    "bad name=ignored",
  ]);
  assert.deepEqual(values, [["MUSIC_U", "one"], ["token", "two"]]);
  assert.equal(
    mergeCookieString("MUSIC_U=old; userid=9", "MUSIC_U=new; token=two"),
    "MUSIC_U=new; userid=9; token=two"
  );
});

test("QQ polling status is parsed without depending on localized text", () => {
  assert.equal(ptuiCode("ptuiCB('66','0','','0','等待扫码','')"), 66);
  assert.equal(ptuiCode("ptuiCB('0','0','https://example.com','0','成功','')"), 0);
  assert.equal(ptuiCode("unexpected"), -1);
});

test("QQ confirmation only accepts the fixed HTTPS check_sig endpoints", () => {
  assert.equal(
    qqCheckSigUrl(
      "ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=1','0','成功','')"
    ).hostname,
    "ssl.ptlogin2.graph.qq.com"
  );
  assert.equal(
    qqCheckSigUrl(
      "ptuiCB('0','0','https://ssl.ptlogin2.qq.com/check_sig?uin=1','0','成功','')"
    ).pathname,
    "/check_sig"
  );
  assert.equal(
    qqCheckSigUrl("ptuiCB('0','0','https://example.com/check_sig','0','成功','')"),
    null
  );
  assert.equal(
    qqCheckSigUrl("ptuiCB('0','0','https://ssl.ptlogin2.qq.com/other','0','成功','')"),
    null
  );
  assert.equal(
    qqCheckSigUrl("ptuiCB('0','0','http://ssl.ptlogin2.qq.com/check_sig','0','成功','')"),
    null
  );
});

test("gateway response preflight rejects oversized values and collections", () => {
  assert.doesNotThrow(() => assertJsonWithinLimit({ ok: true, message: "正常" }));
  assert.throws(
    () => assertJsonWithinLimit({ value: "x".repeat(2 * 1024 * 1024) }),
    /too large/
  );
  assert.throws(
    () => assertJsonWithinLimit({ items: Array.from({ length: 1001 }, () => 1) }),
    /collection is too large/
  );
});

test("song normalization preserves provider metadata and HTTPS playback only", () => {
  assert.deepEqual(
    normalizedSong({
      songmid: "mid-1",
      songname: "Track",
      singer: [{ name: "A" }, { name: "B" }],
      albumname: "Album",
      albummid: "cover-mid",
      interval: 123,
    }, "qq"),
    {
      id: "mid-1",
      title: "Track",
      artist: "A / B",
      album: "Album",
      cover: "https://y.qq.com/music/photo_new/T002R300x300M000cover-mid.jpg",
      duration: 123,
      provider: "qq",
      albumId: "",
      albumAudioId: "",
    }
  );
  assert.equal(validPlaybackUrl("https://cdn.example/song.mp3"), "https://cdn.example/song.mp3");
  assert.equal(validPlaybackUrl("http://cdn.example/song.mp3"), "");
  assert.equal(
    validPlaybackUrl("http://m701.music.126.net/song.mp3"),
    "https://m701.music.126.net/song.mp3"
  );
  assert.equal(validPlaybackUrl("https://cdn.example/protected.kgm"), "");
  assert.deepEqual(
    normalizedPlaylist({
      dissid: "qq-list-1",
      title: "我的歌单",
      picurl: "https://y.qq.com/cover.jpg",
      songnum: 12,
    }, "qq"),
    {
      id: "qq-list-1",
      name: "我的歌单",
      provider: "qq",
      cover: "https://y.qq.com/cover.jpg",
      trackCount: 12,
    }
  );
});

test("loopback server requires bearer auth and does not accept plugin imports", async () => {
  const token = crypto.randomBytes(32).toString("base64url");
  const gateway = {
    providerCatalog() {
      return [{ id: "netease", configured: true }];
    },
  };
  const server = createServer({ token, gateway });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const forbidden = await fetch(`${base}/health`);
    assert.equal(forbidden.status, 403);

    const headers = { Authorization: `Bearer ${token}` };
    const health = await fetch(`${base}/health`, { headers });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).mode, "ios-on-device");

    const catalog = await fetch(`${base}/api/music-apis`, { headers });
    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).providers[0].id, "netease");

    gateway.providerCatalog = () => [{
      id: "netease",
      configured: true,
      payload: "x".repeat(2 * 1024 * 1024),
    }];
    const oversizedCatalog = await fetch(`${base}/api/music-apis`, { headers });
    assert.equal(oversizedCatalog.status, 502);
    assert.match((await oversizedCatalog.json()).error, /safety limit/);

    const importAttempt = await fetch(`${base}/api/music-apis/import`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(importAttempt.status, 405);
    assert.match((await importAttempt.json()).error, /固定音乐适配器/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("CLI binds an OS-assigned port and publishes a nonce-protected handshake", {
  timeout: 15_000,
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fe-ios-ready-"));
  const token = crypto.randomBytes(32).toString("base64url");
  const vaultKey = crypto.randomBytes(32).toString("base64url");
  const launchNonce = crypto.randomBytes(32).toString("base64url");
  const readyFile = path.join(
    directory,
    `.gateway-ready-${crypto.randomBytes(8).toString("hex")}.json`
  );
  const child = spawn(process.execPath, [
    path.resolve(__dirname, "..", "main.cjs"),
    "--host", "127.0.0.1",
    "--port", "0",
    "--token", token,
    "--vault-key", vaultKey,
    "--data-dir", directory,
    "--ready-file", readyFile,
    "--launch-nonce", launchNonce,
  ], {
    stdio: "ignore",
    windowsHide: true,
  });

  try {
    for (let attempt = 0; attempt < 100 && !fs.existsSync(readyFile); attempt += 1) {
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(fs.existsSync(readyFile), true);
    const handshake = JSON.parse(fs.readFileSync(readyFile, "utf8"));
    assert.equal(handshake.launchNonce, launchNonce);
    assert.equal(handshake.mode, "ios-on-device");
    assert.equal(Number.isInteger(handshake.port), true);
    assert.equal(handshake.port >= 1024 && handshake.port <= 65535, true);

    const health = await fetch(`http://127.0.0.1:${handshake.port}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(health.status, 200);
  } finally {
    if (child.exitCode === null) child.kill();
    if (child.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    if (child.exitCode === null) child.kill("SIGKILL");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("playlist track requests are capped for the iPhone response budget", async () => {
  let receivedLimit = 0;
  const gateway = {
    async playlistTracks(provider, playlistId, limit) {
      receivedLimit = limit;
      return { ok: true, provider, playlistId, songs: [] };
    },
  };
  const request = { method: "GET" };
  const url = new URL("http://127.0.0.1/api/netease/playlist/tracks?id=1&limit=5000");
  const result = await routeRequest(
    gateway,
    request,
    url,
    Object.fromEntries(url.searchParams.entries())
  );
  assert.equal(result.status, 200);
  assert.equal(receivedLimit, 1000);
});

test("successful provider QR responses keep credentials inside the vault", async () => {
  const stored = new Map();
  const vault = {
    get(provider) {
      return stored.get(provider) || null;
    },
    set(provider, record) {
      stored.set(provider, record);
      return record;
    },
    delete(provider) {
      return stored.delete(provider);
    },
  };
  const attempts = new QrAttemptStore(() => 1_000);
  const gateway = new MusicGateway(vault, attempts);

  gateway.neteaseApi = {
    async login_qr_check() {
      return {
        status: 200,
        body: { code: 803, cookie: "MUSIC_U=netease-secret" },
        cookie: ["MUSIC_U=netease-secret; Path=/; HttpOnly"],
      };
    },
    async login_status() {
      return {
        status: 200,
        body: { data: { profile: { userId: 7, nickname: "N" } } },
      };
    },
  };
  const neteaseAttempt = attempts.create("netease", { key: "upstream-key" });
  const neteaseResult = await gateway.loginQrCheck("netease", neteaseAttempt);
  assert.equal(neteaseResult.code, 803);
  assert.equal(JSON.stringify(neteaseResult).includes("netease-secret"), false);
  assert.equal(stored.get("netease").cookie, "MUSIC_U=netease-secret");

  gateway.kugouApi = {
    async login_qr_check() {
      return {
        status: 200,
        body: {
          data: {
            status: 4,
            token: "kugou-secret",
            userid: "88",
            vip_token: "vip-secret",
            nickname: "K",
          },
        },
        cookie: [],
      };
    },
  };
  const kugouAttempt = attempts.create("kugou", { key: "upstream-key" });
  const kugouResult = await gateway.loginQrCheck("kugou", kugouAttempt);
  assert.equal(kugouResult.code, 4);
  assert.equal(/kugou-secret|vip-secret/.test(JSON.stringify(kugouResult)), false);
  assert.match(stored.get("kugou").cookie, /token=kugou-secret/);
});
