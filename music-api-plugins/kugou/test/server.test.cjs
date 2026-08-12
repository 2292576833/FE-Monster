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

async function authenticateFixtureQr(baseUrl) {
  const key = await (await fetch(`${baseUrl}/login/qr/key`)).json();
  assert.equal(key.data.key, "fixture-qr-key");
  const checked = await (await fetch(`${baseUrl}/login/qr/check?key=fixture-qr-key`)).json();
  assert.equal(checked.data.status, 4);
  assert.equal(checked.data.authenticated, true);
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
  assert.equal(payload.providerQr, true);
  assert.equal(payload.authMode, "provider-qr");
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
    "provider-qr-login"
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

  const first = await startPlugin(dataDir, { scenario: "qr-login-success" });
  children.push(first.child);
  const initialHealth = await (await fetch(`${first.baseUrl}/health`)).json();
  assert.match(initialHealth.deviceIdentity, /^[a-f0-9]{16}$/);

  await authenticateFixtureQr(first.baseUrl);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir, { scenario: "qr-login-success" });
  children.push(restarted.child);
  const restoredLogin = await (await fetch(`${restarted.baseUrl}/login/status`)).json();
  const restoredHealth = await (await fetch(`${restarted.baseUrl}/health`)).json();
  assert.equal(restoredLogin.status, 1);
  assert.equal(restoredLogin.data.status, 1);
  assert.equal(restoredHealth.deviceIdentity, initialHealth.deviceIdentity);
  await stopChild(restarted.child);

  const isolated = await startPlugin(isolatedDataDir);
  children.push(isolated.child);
  const isolatedHealth = await (await fetch(`${isolated.baseUrl}/health`)).json();
  assert.notEqual(isolatedHealth.deviceIdentity, initialHealth.deviceIdentity);
  assert.equal(isolatedHealth.loggedIn, false);
});

test("host-supplied unverified credentials never become a persisted plugin login session", async (context) => {
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
  assert.equal((await login.json()).status, 0);
  assert.equal((await (await fetch(`${first.baseUrl}/health`)).json()).loggedIn, false);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir);
  children.push(restarted.child);
  const restoredHealth = await (await fetch(`${restarted.baseUrl}/health`)).json();
  assert.equal(restoredHealth.loggedIn, false);
});

test("login status exposes persisted Kugou VIP entitlement without revealing tokens", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-vip-status-"));
  const children = [];
  context.after(async () => {
    await Promise.all(children.map(stopChild));
    await rm(dataDir, { recursive: true, force: true });
  });

  const first = await startPlugin(dataDir, { scenario: "qr-login-success" });
  children.push(first.child);
  await authenticateFixtureQr(first.baseUrl);
  const seeded = await fetch(`${first.baseUrl}/login/status`);
  assert.equal(seeded.status, 200);
  const seededPayload = await seeded.json();
  assert.equal(seededPayload.data.vipType, "1");
  assert.equal(seededPayload.data.vipStatus, "active");
  assert.equal(seededPayload.data.isVip, true);
  assert.equal(JSON.stringify(seededPayload).includes("fixture-mobile-token"), false);
  await stopChild(first.child);

  const restarted = await startPlugin(dataDir, { scenario: "qr-login-success" });
  children.push(restarted.child);
  const restoredPayload = await (await fetch(`${restarted.baseUrl}/login/status`)).json();
  assert.equal(restoredPayload.data.vipType, "1");
  assert.equal(restoredPayload.data.vipStatus, "active");
  assert.equal(restoredPayload.data.isVip, true);
});

test("clearing Kugou login drops the verified account and VIP state", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-account-switch-"));
  const plugin = await startPlugin(dataDir, { scenario: "qr-login-success" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  await authenticateFixtureQr(plugin.baseUrl);
  const first = await (await fetch(`${plugin.baseUrl}/login/status`)).json();
  assert.equal(first.data.vipStatus, "active");

  const cleared = await fetch(`${plugin.baseUrl}/login/clear`, { method: "POST" });
  assert.equal(cleared.status, 200);
  const loggedOut = await (await fetch(`${plugin.baseUrl}/login/status`)).json();
  assert.equal(loggedOut.status, 0);
  assert.equal(loggedOut.data.vipStatus, "unknown");
  assert.equal(Object.hasOwn(loggedOut.data, "vipType"), false);
  assert.equal(Object.hasOwn(loggedOut.data, "isVip"), false);
});

test("the plugin exposes Kugou's authoritative union VIP detail contract", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-union-vip-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, { scenario: "account-contract", logPath });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(
    `${plugin.baseUrl}/user/vip/detail?userid=42&token=current-account-token`
  );
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.status, 1);
  assert.equal(payload.data.vip_type, 5);
  assert.equal(payload.data.m_type, 1);
  assert.equal(payload.data.busi_vip[0].is_vip, 1);

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepEqual(events, [{ event: "user-vip-detail", userid: "42", hasToken: true }]);
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

test("a resolver response for a different Kugou identity is rejected instead of playing another song", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-identity-mismatch-"));
  const plugin = await startPlugin(dataDir, { scenario: "song-identity-mismatch" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const requested = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(requested)}`);
  const payload = await response.json();
  assert.equal(response.status, 403, JSON.stringify(payload));
  assert.equal(payload.playable, false);
  assert.equal(payload.reason, "provider-identity-mismatch");
});

test("a CDN signature before the matching Kugou track hash is not mistaken for another song", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-cdn-identity-"));
  const plugin = await startPlugin(dataDir, { scenario: "song-cdn-prefix-same-identity" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const requested = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(requested)}`);
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.match(payload.url, /\/v3\/00112233445566778899aabbccddeeff\//i);
  assert.match(payload.url, /mx123456_/i);
});

test("an opaque playback URL is accepted when upstream metadata matches the requested track", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-opaque-matching-"));
  const plugin = await startPlugin(dataDir, { scenario: "song-free" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const requested = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(requested)}`);
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.playable, true);
  assert.equal(payload.url, "https://fixture.invalid/free.mp3");
});

test("an opaque playback URL with mismatched upstream metadata is rejected", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-opaque-mismatch-"));
  const plugin = await startPlugin(dataDir, { scenario: "song-unmarked-mismatched-metadata" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const requested = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(requested)}`);
  const payload = await response.json();
  assert.equal(response.status, 403, JSON.stringify(payload));
  assert.equal(payload.playable, false);
  assert.equal(payload.reason, "provider-identity-mismatch");
});

test("an opaque playback URL without upstream track metadata is rejected", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-opaque-no-metadata-"));
  const plugin = await startPlugin(dataDir, { scenario: "song-unmarked-no-metadata" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const requested = "kg|00112233445566778899aabbccddeeff|123456|7890";
  const response = await fetch(`${plugin.baseUrl}/song/url?id=${encodeURIComponent(requested)}`);
  const payload = await response.json();
  assert.equal(response.status, 403, JSON.stringify(payload));
  assert.equal(payload.playable, false);
  assert.equal(payload.reason, "provider-identity-mismatch");
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

test("lyrics retry by hash when a cached composite id contains a stale audio id", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-lyrics-stale-audio-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, {
    scenario: "lyrics-stale-audio-id",
    logPath
  });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const hash = "00112233445566778899aabbccddeeff";
  const staleCompositeId = `kg|${hash}|999|7890`;
  const parameters = new URLSearchParams({
    id: staleCompositeId,
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
  assert.deepEqual(events.map((entry) => entry.event), ["search-lyric", "search-lyric", "lyric"]);
  assert.equal(events[0].hash, hash);
  assert.equal(events[0].albumAudioId, "999");
  assert.equal(events[1].hash, hash);
  assert.equal(events[1].albumAudioId, 0);
  assert.equal(events[1].keywords, "Red Shoe");
  assert.equal(events[1].duration, 206000);
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

test("Kugou app QR login persists a compatible account session without leaking credentials", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-app-qr-"));
  const logPath = path.join(dataDir, "upstream.jsonl");
  const plugin = await startPlugin(dataDir, { scenario: "qr-login-success", logPath });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const keyResponse = await fetch(`${plugin.baseUrl}/login/qr/key`);
  const keyPayload = await keyResponse.json();
  assert.equal(keyResponse.status, 200);
  assert.equal(keyPayload.data.key, "fixture-qr-key");
  assert.equal(keyPayload.data.loginUrl, `${plugin.baseUrl}/login/qr/view?key=fixture-qr-key`);

  const viewResponse = await fetch(keyPayload.data.loginUrl);
  const viewHtml = await viewResponse.text();
  assert.equal(viewResponse.status, 200);
  assert.match(viewResponse.headers.get("content-type") || "", /^text\/html/);
  assert.match(viewResponse.headers.get("content-security-policy") || "", /default-src 'none'/);
  assert.match(viewHtml, /使用酷狗音乐 App 扫码/);
  assert.match(viewHtml, /data:image\/png;base64,iVBORw0KGgo=/);
  assert.doesNotMatch(viewHtml, /fixture-qr-key|fixture-mobile-token/);

  const checkResponse = await fetch(`${plugin.baseUrl}/login/qr/check?key=fixture-qr-key`);
  const checkText = await checkResponse.text();
  const checkPayload = JSON.parse(checkText);
  assert.equal(checkResponse.status, 200);
  assert.equal(checkPayload.data.status, 4);
  assert.equal(checkPayload.data.authenticated, true);
  assert.doesNotMatch(checkText, /fixture-mobile-token|token|userid/i);

  const loginText = await (await fetch(`${plugin.baseUrl}/login/status`)).text();
  const loginPayload = JSON.parse(loginText);
  assert.equal(loginPayload.status, 1);
  assert.equal(loginPayload.data.status, 1);
  assert.doesNotMatch(loginText, /fixture-mobile-token|token|userid/i);

  const [detail, vip, playlists] = await Promise.all([
    fetch(`${plugin.baseUrl}/user/detail`).then((response) => response.json()),
    fetch(`${plugin.baseUrl}/user/vip/detail`).then((response) => response.json()),
    fetch(`${plugin.baseUrl}/user/playlists`).then((response) => response.json())
  ]);
  assert.equal(detail.data.nickname, "Fixture Listener");
  assert.equal(detail.data.pic, "https://fixture.invalid/avatar.jpg");
  assert.equal(vip.data.busi_vip[0].is_vip, 1);
  assert.equal(playlists.data.info.length, 2);
  assert.equal(playlists.data.info[0].listname, "我喜欢");

  const events = (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((entry) => entry.event === "login-qr-key").length, 1);
  assert.equal(events.filter((entry) => entry.event === "login-qr-create").length, 1);
  assert.equal(events.filter((entry) => entry.event === "login-qr-check").length, 1);
  assert.equal(events.filter((entry) => entry.event === "login-token").length, 1);
  assert.equal(events.find((entry) => entry.event === "login-token").usesQrToken, true);
  assert.equal(events.find((entry) => entry.event === "login-token").hasDeviceIdentity, true);
  assert.equal(events.find((entry) => entry.event === "user-detail").hasToken, true);
  assert.equal(events.find((entry) => entry.event === "user-detail").usesRefreshedToken, true);
  assert.equal(events.find((entry) => entry.event === "user-playlist").hasToken, true);
});

test("Kugou QR view rejects unknown and expired keys without reflecting them", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-qr-view-"));
  const plugin = await startPlugin(dataDir, { scenario: "qr-login-success" });
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const response = await fetch(`${plugin.baseUrl}/login/qr/view?key=unknown-secret-key`);
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.doesNotMatch(html, /unknown-secret-key/);
});

test("unverified browser-shaped Kugou cookies never report a logged-in account", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fe-kugou-unverified-cookie-"));
  const plugin = await startPlugin(dataDir);
  context.after(async () => {
    await stopChild(plugin.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const seeded = await fetch(`${plugin.baseUrl}/login/status?userid=42&token=browser-token`);
  assert.equal(seeded.status, 200);
  const payload = await seeded.json();
  assert.equal(payload.status, 0);
  assert.equal(payload.data.status, 0);
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

test("the rebuilt package carries the 2.0.7 provider-QR contract", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, "music-api-package.json"), "utf8"));
  const build = await readFile(path.join(pluginRoot, "build.ps1"), "utf8");
  const readme = await readFile(path.join(pluginRoot, "README.md"), "utf8");
  const notices = await readFile(path.join(pluginRoot, "THIRD-PARTY-NOTICES.md"), "utf8");

  assert.equal(manifest.version, "2.0.7");
  assert.equal(manifest.loginQr, false);
  assert.ok(manifest.launcher.args.includes("--data-dir=${data}/kugou-music-api"));
  assert.match(build, /\$pluginVersion\s*=\s*"2\.0\.7"/);
  assert.match(build, /283f1e97b110726b208a64b486a657c0fc0a6126/);
  assert.match(build, /FE-Monster-Kugou-API-Plugin-\$pluginVersion\.zip/);
  assert.match(readme, /版本：2\.0\.7/);
  assert.match(readme, /官方扫码登录/);
  assert.match(readme, /--data-dir/);
  assert.match(notices, /kugoumusicapi.*283f1e97b110726b208a64b486a657c0fc0a6126/i);
  assert.match(notices, /privately polls the linked upstream QR modules/i);
});
