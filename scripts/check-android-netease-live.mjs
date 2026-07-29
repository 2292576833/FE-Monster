import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const generatedGateway = path.join(
  root,
  "android",
  "app",
  "build",
  "generated",
  "feMonsterNodeGatewayAssets",
  "nodejs-project"
);
if (!existsSync(path.join(generatedGateway, "main.cjs"))) {
  throw new Error("Generated Android gateway is missing. Run the Android build first.");
}

async function freePort() {
  const server = net.createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const gatewayPort = await freePort();
const token = `fe-monster-live-${Date.now().toString(36)}-0123456789abcdef0123456789abcdef`;
const child = spawn(process.execPath, [
  "main.cjs",
  "--port",
  String(gatewayPort),
  "--token",
  token
], {
  cwd: generatedGateway,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});

let gatewayOutput = "";
child.stdout.on("data", (chunk) => {
  gatewayOutput = `${gatewayOutput}${chunk.toString("utf8")}`.slice(-12000);
});
child.stderr.on("data", (chunk) => {
  gatewayOutput = `${gatewayOutput}${chunk.toString("utf8")}`.slice(-12000);
});

const headers = { "X-FE-Android-Gateway-Token": token };
const endpoint = (pathname) => `http://127.0.0.1:${gatewayPort}${pathname}`;
async function json(pathname, timeout = 25_000) {
  const response = await fetch(endpoint(pathname), {
    headers,
    signal: AbortSignal.timeout(timeout)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

try {
  let health = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Gateway exited early (${child.exitCode})\n${gatewayOutput}`);
    try {
      health = await json("/health", 1500);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!health?.ok) throw new Error(`Gateway startup timed out\n${gatewayOutput}`);

  const search = await json(`/api/search?provider=netease&q=${encodeURIComponent("稻香")}&limit=8`);
  if (!search.ok || !Array.isArray(search.songs) || search.songs.length === 0) {
    throw new Error(`NetEase live search returned no songs: ${JSON.stringify(search)}`);
  }

  const playbackResults = await Promise.all(search.songs.slice(0, 6).map(async (song) => {
    try {
      return await json(
        `/api/player/load?provider=netease&id=${encodeURIComponent(song.id)}&quality=standard`
      );
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }));
  const playable = playbackResults.find((result) => result.playable && /^https:\/\//i.test(result.url || ""));
  if (!playable) {
    throw new Error(`NetEase search worked but no HTTPS playback URL was returned: ${JSON.stringify(playbackResults)}`);
  }

  const qrKey = await json("/api/netease/login/qr/key");
  const key = qrKey?.body?.data?.unikey || qrKey?.data?.unikey || qrKey?.unikey;
  if (!key) throw new Error(`NetEase QR key is missing: ${JSON.stringify(qrKey)}`);
  const qrCreate = await json(
    `/api/netease/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`
  );
  const qrImage = qrCreate?.body?.data?.qrimg || qrCreate?.data?.qrimg || qrCreate?.qrimg;
  if (!qrImage) throw new Error(`NetEase QR image is missing: ${JSON.stringify(qrCreate)}`);
  const qrCheck = await json(`/api/netease/login/qr/check?key=${encodeURIComponent(key)}`);
  const qrCode = Number(qrCheck?.body?.code ?? qrCheck?.code);
  if (![800, 801, 802, 803].includes(qrCode)) {
    throw new Error(`NetEase QR poll returned an unexpected response: ${JSON.stringify(qrCheck)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    health: health.ok,
    search: {
      provider: search.provider,
      count: search.songs.length,
      firstSong: search.songs[0].title,
      firstArtist: search.songs[0].artist
    },
    playback: {
      playable: true,
      protocol: new URL(playable.url).protocol,
      host: new URL(playable.url).host
    },
    login: {
      qrImage: true,
      pollCode: qrCode
    }
  }, null, 2));
} finally {
  child.kill();
  if (child.exitCode === null) {
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
  }
}
