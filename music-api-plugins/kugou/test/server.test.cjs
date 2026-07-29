"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { createServer } = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const pluginEntry = path.resolve(__dirname, "..", "src", "server-entry.cjs");
const upstreamFixture = path.resolve(__dirname, "upstream-fixture.cjs");
const pluginRoot = path.resolve(__dirname, "..");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJson(url, processHandle) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Kugou plugin exited before becoming ready (${processHandle.exitCode})`);
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

async function startPlugin(dataDir, options = {}) {
  const port = await freePort();
  const nodeArguments = [];
  if (options.scenario) nodeArguments.push("--require", upstreamFixture);
  nodeArguments.push(pluginEntry, `--port=${port}`, `--data-dir=${dataDir}`);
  const child = spawn(process.execPath, nodeArguments, {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      FE_KUGOU_TEST_SCENARIO: options.scenario || "",
      FE_KUGOU_TEST_LOG: options.logPath || ""
    }
  });
  await waitForJson(`http://127.0.0.1:${port}/health`, child);
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("health advertises the FE Monster provider compatibility contract", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-health-"));
  const port = await freePort();
  const child = spawn(process.execPath, [pluginEntry, `--port=${port}`, `--data-dir=${dataDir}`], {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    stdio: "ignore",
    windowsHide: true
  });
  context.after(async () => {
    await stopChild(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const { response, payload } = await waitForJson(`http://127.0.0.1:${port}/health`, child);
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.label, "酷狗音乐");
  assert.equal(payload.loginQr, false);
  assert.equal(payload.authMode, "official-browser-cookie");
  assert.equal(payload.loggedIn, false);
  assert.equal(payload.contract, "fe-monster.music-api/v1");
  assert.equal(payload.persistence, true);
  assert.deepEqual(payload.capabilities, [
    "search",
    "playback",
    "lyrics",
    "comments",
    "playlist-tracks",
    "playlist-write",
    "user-playlists",
    "official-browser-session"
  ]);
});

test("a provider data directory restores login cookies and the same device identity after restart", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-session-"));
  const isolatedDataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-session-other-"));
  const children = [];
  context.after(async () => {
    await Promise.all(children.map(stopChild));
    await Promise.all([
      rm(dataDir, { recursive: true, force: true }),
      rm(isolatedDataDir, { recursive: true, force: true })
    ]);
  });

  const first = await startPlugin(dataDir);
  children.push(first.child);
  const initialHealth = await (await fetch(`${first.baseUrl}/health`)).json();
  assert.match(initialHealth.deviceIdentity, /^[a-f0-9]{16}$/);

  const login = await fetch(`${first.baseUrl}/login/status?cookie=${encodeURIComponent("token=test-token; userid=42")}`);
  assert.equal(login.status, 200);
  assert.equal((await login.json()).status, 1);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir);
  children.push(restarted.child);
  const restoredLogin = await (await fetch(`${restarted.baseUrl}/login/status`)).json();
  const restoredHealth = await (await fetch(`${restarted.baseUrl}/health`)).json();
  assert.equal(restoredLogin.status, 1);
  assert.equal(restoredLogin.data.userid, "42");
  assert.equal(restoredHealth.deviceIdentity, initialHealth.deviceIdentity);
  await stopChild(restarted.child);

  const isolated = await startPlugin(isolatedDataDir);
  children.push(isolated.child);
  const isolatedHealth = await (await fetch(`${isolated.baseUrl}/health`)).json();
  assert.notEqual(isolatedHealth.deviceIdentity, initialHealth.deviceIdentity);
  assert.equal(isolatedHealth.loggedIn, false);
});

test("host canonical userid and token become the persisted plugin login session", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-host-session-"));
  const children = [];
  context.after(async () => {
    await Promise.all(children.map(stopChild));
    await rm(dataDir, { recursive: true, force: true });
  });

  const first = await startPlugin(dataDir);
  children.push(first.child);
  const login = await fetch(
    `${first.baseUrl}/login/status?userid=42&token=current-account-token`
      + `&cookie=${encodeURIComponent("KuGoo=KugooID%3D42%26t%3Dcurrent-account-token")}`
  );
  assert.equal(login.status, 200);
  assert.equal((await login.json()).status, 1);
  assert.equal((await (await fetch(`${first.baseUrl}/health`)).json()).loggedIn, true);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir);
  children.push(restarted.child);
  const restoredHealth = await (await fetch(`${restarted.baseUrl}/health`)).json();
  assert.equal(restoredHealth.loggedIn, true);
});

test("an idempotent search succeeds after two transient network failures and never exceeds three attempts", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-retry-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "search-network-retry-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/search?keyword=fixture`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, 1);
  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "search").length, 3);
});

test("a Kugou business error is classified as an API error and is not retried", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-api-error-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "search-business-error",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/search?keyword=fixture`);
  const payload = await response.json();
  assert.equal(response.status, 422);
  assert.equal(payload.ok, false);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.errorType, "api");
  assert.equal(payload.status, 0);
  assert.equal(payload.code, 1001);
  assert.equal(payload.error, "fixture login required");
  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "search").length, 1);
});

test("an exhausted idempotent network call is classified after exactly three attempts", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-network-error-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "search-network-exhausted",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/search?keyword=fixture`);
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(payload.ok, false);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.errorType, "network");
  assert.equal(payload.code, "ECONNRESET");
  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "search").length, 3);
});

test("a song without account permission is unplayable and never requests a preview bypass", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-permission-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-permission",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "0123456789abcdef0123456789abcdef";
  const response = await fetch(`${plugin.baseUrl}/song/url?hash=${hash}`);
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.playable, false);
  assert.equal(payload.type, "api");
  assert.equal(payload.reason, "account-entitlement-required");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const playbackCalls = events.filter((entry) => entry.event === "song-url" || entry.event === "song-url-new");
  assert.equal(playbackCalls.length, 2);
  assert.equal(playbackCalls.some((entry) => entry.freePart), false);
});

test("a free Kugou song remains playable through the regular full-track endpoint", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-free-song-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-free",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "fedcba9876543210fedcba9876543210";
  const response = await fetch(`${plugin.baseUrl}/song/url?hash=${hash}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.playable, true);
  assert.equal(payload.url, "https://fixture.invalid/free.mp3");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepEqual(events.filter((entry) => entry.event.startsWith("song-url")).map((entry) => entry.event), ["song-url"]);
});

test("a legacy resolver business error falls through to the current full-track endpoint", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-resolver-fallback-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-legacy-api-error-new-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const compositeId = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(compositeId)}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.playable, true);
  assert.equal(payload.url, "https://fixture.invalid/current-free.mp3");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepEqual(events.filter((entry) => entry.event.startsWith("song-url")).map((entry) => entry.event), [
    "song-url",
    "song-url-new"
  ]);
  assert.equal(events.some((entry) => entry.freePart), false);
});

test("an exhausted legacy network failure falls through to the current full-track endpoint", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-network-fallback-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-legacy-network-fallback",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(
    `${plugin.baseUrl}/song/url?hash=00112233445566778899aabbccddeeff&album_audio_id=123456`
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.playable, true);
  assert.equal(payload.url, "https://fixture.invalid/new-free.mp3");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "song-url").length, 3);
  assert.equal(events.filter((entry) => entry.event === "song-url-new").length, 1);
  assert.equal(events.some((entry) => entry.freePart), false);
});

test("a composite FE Monster Kugou id supplies hash, album audio id, and album id", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-composite-id-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-free",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "00112233445566778899aabbccddeeff";
  const compositeId = `kg|${hash}|123456|7890`;
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(compositeId)}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).playable, true);

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const call = events.find((entry) => entry.event === "song-url");
  assert.equal(call.hash, hash);
  assert.equal(call.albumAudioId, "123456");
  assert.equal(call.albumId, "7890");
});

test("idempotent module-backed playback resolution retries transient network errors", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-module-retry-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "song-network-retry-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "abcdefabcdefabcdefabcdefabcdefab";
  const response = await fetch(`${plugin.baseUrl}/song/url?hash=${hash}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.playable, true);
  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "song-url").length, 3);
});

test("lyrics resolve a composite song id through Kugou lyric search and return an LRC contract", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-lyrics-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "lyrics-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "00112233445566778899aabbccddeeff";
  const compositeId = `kg|${hash}|123456|7890`;
  const response = await fetch(`${plugin.baseUrl}/lyric?id=${encodeURIComponent(compositeId)}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.lyric, "[00:00.00]fixture lyric\n[00:01.00]fixture line");
  assert.deepEqual(payload.lrc, { lyric: payload.lyric });

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepEqual(events.map((entry) => entry.event), ["search-lyric", "lyric"]);
  assert.equal(events[0].hash, hash);
  assert.equal(events[0].albumAudioId, "123456");
  assert.equal(events[1].id, "fixture-lyric-id");
  assert.equal(events[1].accesskey, "fixture-access-key");
  assert.equal(events[1].fmt, "lrc");
  assert.equal(events[1].decode, true);
});

test("playlist lyrics use title and millisecond duration when hash-only matching has no candidate", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-lyrics-metadata-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "lyrics-metadata-required",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const compositeId = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const parameters = new URLSearchParams({
    id: compositeId,
    keyword: "Red Shoe",
    duration: "206000"
  });
  const response = await fetch(`${plugin.baseUrl}/lyric?${parameters}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.match(payload.lrc.lyric, /^\[00:00\.00\]fixture lyric/);

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events[0].event, "search-lyric");
  assert.equal(events[0].keywords, "Red Shoe");
  assert.equal(events[0].duration, 206000);
});

test("a song without an available lyric returns a stable no-lyric contract", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-no-lyrics-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "lyrics-unavailable",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(
    `${plugin.baseUrl}/lyric?hash=00112233445566778899aabbccddeeff`
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "kugou");
  assert.equal(payload.nolyric, true);
  assert.deepEqual(payload.lrc, { lyric: "" });

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepEqual(events.map((entry) => entry.event), ["search-lyric"]);
});

test("song comments derive mixsongid from the FE Monster composite id", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-comments-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "comments-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const compositeId = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/comments?id=${encodeURIComponent(compositeId)}&page=2&limit=15`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, 1);
  assert.equal(payload.data.list[0].content, "fixture comment");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "comment-music");
  assert.equal(events[0].mixsongid, "123456");
  assert.equal(events[0].page, "2");
  assert.equal(events[0].pagesize, "15");
});

test("playlist add translates FE Monster ids into the Kugou write resource contract", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-playlist-add-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "playlist-add-success",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const compositeId = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(
    `${plugin.baseUrl}/playlist/add?listid=88&songId=${encodeURIComponent(compositeId)}&name=${encodeURIComponent("Fixture Song")}&cookie=${encodeURIComponent("token=fixture-token; userid=42")}`,
    { method: "POST" }
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, 1);
  assert.equal(payload.data.success, true);

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "playlist-tracks-add");
  assert.equal(events[0].listid, "88");
  assert.equal(events[0].data, "Fixture Song|00112233445566778899aabbccddeeff|7890|123456");
  assert.equal(events[0].userid, "42");
  assert.equal(events[0].token, "fixture-token");
});

test("embedded QR login endpoints are not exposed", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-no-embedded-qr-"));
  const plugin = await startPlugin(dataDir);
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  for (const route of ["key", "create", "check"]) {
    const response = await fetch(`${plugin.baseUrl}/login/qr/${route}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "Not Found");
  }
});

test("module business failures are typed, not retried, and do not leak upstream cookies or errors", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-module-api-error-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "module-business-error",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/playlist/detail?id=1`);
  const responseText = await response.text();
  const payload = JSON.parse(responseText);
  assert.equal(response.status, 422);
  assert.equal(payload.type, "api");
  assert.equal(payload.errorType, "api");
  assert.equal(payload.code, 2002);
  assert.equal(payload.error, "fixture playlist denied");
  assert.doesNotMatch(responseText, /must-not-leak|originalError|cookie/i);
  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "playlist-detail").length, 1);
});

test("CORS credentials are granted only to loopback browser origins", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-cors-"));
  const plugin = await startPlugin(dataDir);
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const rejected = await fetch(`${plugin.baseUrl}/health`, {
    headers: { Origin: "https://attacker.example" }
  });
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  assert.equal(rejected.headers.get("access-control-allow-credentials"), null);

  const allowed = await fetch(`${plugin.baseUrl}/health`, {
    headers: { Origin: "http://127.0.0.1:3000" }
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  assert.match(allowed.headers.get("vary") || "", /Origin/i);
});

test("the rebuilt package carries the 2.0.1 official-browser contract", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, "music-api-package.json"), "utf8"));
  const build = await readFile(path.join(pluginRoot, "build.ps1"), "utf8");
  const readme = await readFile(path.join(pluginRoot, "README.md"), "utf8");
  const notices = await readFile(path.join(pluginRoot, "THIRD-PARTY-NOTICES.md"), "utf8");

  assert.equal(manifest.version, "2.0.1");
  assert.equal(manifest.loginQr, false);
  assert.ok(manifest.launcher.args.includes("--data-dir=${data}/kugou-music-api"));
  assert.match(build, /\$pluginVersion\s*=\s*"2\.0\.1"/);
  assert.match(build, /283f1e97b110726b208a64b486a657c0fc0a6126/);
  assert.match(build, /FE-Monster-Kugou-API-Plugin-\$pluginVersion\.zip/);
  assert.match(readme, /版本：2\.0\.1/);
  assert.match(readme, /官方扫码登录/);
  assert.match(readme, /--data-dir/);
  assert.match(notices, /kugoumusicapi.*283f1e97b110726b208a64b486a657c0fc0a6126/i);
  assert.match(notices, /without exposing their embedded QR-login routes/i);
});
