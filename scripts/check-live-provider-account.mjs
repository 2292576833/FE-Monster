import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const providerId = String(process.argv.find((value) => value.startsWith("--provider="))?.split("=")[1] || "").trim();
const includeQqUin = process.argv.includes("--include-qq-uin");
const exchangeKugouToken = process.argv.includes("--exchange-kugou-token");
const kugouLite = process.argv.includes("--kugou-lite");
assert.ok(providerId === "qq" || providerId === "kugou", "Use --provider=qq or --provider=kugou");

const providers = JSON.parse(fs.readFileSync(path.join(root, "data", "music-api", "providers.json"), "utf8")).providers;
const provider = providers.find((entry) => entry.id === providerId);
assert.ok(provider, `${providerId} provider is not configured`);

const port = providerId === "qq" ? 39111 : 39112;
const packageRoot = path.join(root, "data", "music-api", "packages", provider.package);
const entry = path.join(packageRoot, provider.launcher.entry);
const temporaryKugouDataDir = providerId === "kugou" && exchangeKugouToken
  ? fs.mkdtempSync(path.join(os.tmpdir(), "fe-kugou-live-probe-"))
  : "";
if (temporaryKugouDataDir) {
  fs.copyFileSync(
    path.join(root, "data", "kugou-music-api", "session.json"),
    path.join(temporaryKugouDataDir, "session.json")
  );
}
const kugouDataDir = temporaryKugouDataDir || path.join(root, "data", "kugou-music-api");
const args = providerId === "qq"
  ? [entry, `--port=${port}`, `--config-dir=${path.join(root, "data", "qq-music-api")}`]
  : [entry, `--port=${port}`, `--data-dir=${kugouDataDir}`];

const child = spawn(process.execPath, args, {
  cwd: packageRoot,
  env: { ...process.env, ...(providerId === "kugou" && kugouLite ? { platform: "lite" } : {}) },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let processOutput = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    processOutput = `${processOutput}${chunk}`.slice(-4000);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${providerId} plugin exited early: ${processOutput.trim()}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`${providerId} plugin did not become ready: ${lastError?.message || processOutput.trim()}`);
}

function walk(value, visitor, currentPath = "$") {
  visitor(value, currentPath);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visitor, `${currentPath}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) walk(entry, visitor, `${currentPath}.${key}`);
  }
}

function inspectPayload(payload) {
  const codes = {};
  const arrays = {};
  const arrayItemKeys = {};
  const identityFields = [];
  const avatarFields = [];
  const vipFields = {};
  const membershipHints = {};
  const iconHints = {};
  const diagnostics = {};
  walk(payload, (value, currentPath) => {
    const key = currentPath.split(".").at(-1).replace(/\[\d+\]/g, "");
    if (/^(code|status|result|retcode|subcode)$/i.test(key) && ["number", "boolean", "string"].includes(typeof value)) {
      codes[currentPath] = value;
    }
    if (Array.isArray(value)) {
      arrays[currentPath] = value.length;
      if (value[0] && typeof value[0] === "object" && !Array.isArray(value[0])) {
        arrayItemKeys[currentPath] = Object.keys(value[0]).sort();
      }
    }
    if (/^(uin|userid|user_id|mid|nick|nickname|username|name)$/i.test(key) && String(value ?? "").trim()) {
      identityFields.push(currentPath);
    }
    if (/(avatar|headpic|pic_url|imgurl|face)/i.test(key) && String(value ?? "").trim()) {
      avatarFields.push(currentPath);
    }
    if (/(^|_)(vip|svip|green|luxury|pay)(_|$)/i.test(key) || /vip/i.test(key)) {
      if (["number", "boolean"].includes(typeof value)) vipFields[currentPath] = value;
      else if (typeof value === "string") vipFields[currentPath] = value ? `[present:${value.length}]` : "[empty]";
      else if (Array.isArray(value)) vipFields[currentPath] = `[array:${value.length}]`;
      else if (value && typeof value === "object") vipFields[currentPath] = `[object:${Object.keys(value).length}]`;
    }
    if (/(icon|level|pay|green|luxury|member)/i.test(key) && !/(url|pic|image)/i.test(key)) {
      if (["number", "boolean"].includes(typeof value)) membershipHints[currentPath] = value;
      else if (typeof value === "string") membershipHints[currentPath] = value ? `[present:${value.length}]` : "[empty]";
    }
    if (/\.iconlist\[\d+\]\.(desc|ext|style)$/i.test(currentPath)) {
      iconHints[currentPath] = typeof value === "string"
        ? value.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
        : value;
    }
    if (/^(error|message|msg|errmsg)$/i.test(key) && typeof value === "string") {
      diagnostics[currentPath] = value.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 500);
    }
  });
  return {
    codes,
    arrays,
    arrayItemKeys,
    identityFields: [...new Set(identityFields)].slice(0, 30),
    avatarFields: [...new Set(avatarFields)].slice(0, 30),
    vipFields,
    membershipHints,
    iconHints,
    diagnostics
  };
}

async function getJson(route, query = {}) {
  const url = new URL(route, `http://127.0.0.1:${port}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value)) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { parseError: true, bodyLength: text.length };
  }
  return { httpStatus: response.status, ok: response.ok, inspection: inspectPayload(payload) };
}

function positiveArrayCount(result) {
  return Math.max(0, ...Object.values(result.inspection.arrays));
}

let report;
try {
  const health = await waitForHealth();
  if (providerId === "qq") {
    const auth = JSON.parse(fs.readFileSync(path.join(root, "data", "qq-auth.json"), "utf8"));
    assert.ok(auth.cookie && auth.qm_keyst && auth.qqmusic_key && auth.uin, "QQ saved login lacks required authenticated cookies");
    const query = { cookie: auth.cookie, ...(includeQqUin ? { uin: auth.uin } : {}) };
    const [detail, avatar, created, collected] = await Promise.all([
      getJson("/user/getUserDetail", query),
      getJson("/user/getUserAvatar", query),
      getJson("/user/getUserPlaylists", query),
      getJson("/user/getUserCollectedSongLists", query)
    ]);
    const playlistCount = positiveArrayCount(created) + positiveArrayCount(collected);
    const vipKnown = Object.keys(detail.inspection.vipFields).length > 0;
    report = {
      provider: providerId,
      health,
      checks: {
        account: detail.ok && detail.inspection.identityFields.length > 0,
        avatar: avatar.ok && avatar.inspection.avatarFields.length > 0,
        playlists: created.ok && collected.ok && playlistCount > 0,
        vipKnown
      },
      playlistCount,
      endpoints: { detail, avatar, created, collected }
    };
  } else {
    const exchange = exchangeKugouToken ? await getJson("/login/token") : null;
    const [status, detail, vip, playlists] = await Promise.all([
      getJson("/login/status"),
      getJson("/user/detail"),
      getJson("/user/vip/detail"),
      getJson("/user/playlists")
    ]);
    const playlistCount = positiveArrayCount(playlists);
    report = {
      provider: providerId,
      health,
      checks: {
        loggedIn: health.loggedIn === true,
        account: detail.ok && detail.inspection.identityFields.length > 0,
        avatar: detail.ok && detail.inspection.avatarFields.length > 0,
        playlists: playlists.ok && playlistCount > 0,
        vipKnown: vip.ok && Object.keys(vip.inspection.vipFields).length > 0
      },
      playlistCount,
      endpoints: { ...(exchange ? { exchange } : {}), status, detail, vip, playlists }
    };
  }
  console.log(JSON.stringify(report, null, 2));
  assert.ok(Object.values(report.checks).every(Boolean), `${providerId} live account contract failed: ${JSON.stringify(report.checks)}`);
} finally {
  child.kill();
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(2000)]);
  if (temporaryKugouDataDir) fs.rmSync(temporaryKugouDataDir, { recursive: true, force: true });
}
