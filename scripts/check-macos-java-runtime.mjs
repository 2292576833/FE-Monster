import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jar = process.env.FE_TEST_JAR || path.join(root, "out", "fe-monster-java.jar");
const java = [
  process.env.FE_TEST_JAVA,
  path.join(root, "runtime", "java", "bin", "java.exe"),
  "E:\\java26\\bin\\java.exe",
  "java",
].filter(Boolean).find((candidate) => candidate === "java" || existsSync(candidate));

if (!existsSync(jar)) throw new Error(`Missing FE Monster jar: ${jar}`);
if (!java) throw new Error("Java runtime was not found");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const dataRoot = await mkdtemp(path.join(os.tmpdir(), "fe-macos-java-runtime-"));
const child = spawn(java, ["-Dos.name=Mac OS X", "-jar", jar, "--server"], {
  cwd: root,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    FE_MONSTER_ROOT: root,
    FE_MONSTER_WEB_ROOT: path.join(root, "web"),
    FE_MONSTER_DATA_DIR: path.join(dataRoot, "Library", "Application Support", "FE Monster"),
    FE_MONSTER_BIND: "127.0.0.1",
    FE_MONSTER_PORT: String(port),
  },
});

let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-12000);
  });
}

try {
  let runtime = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`FE Monster exited with ${child.exitCode}\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/app/runtime`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        runtime = await response.json();
        break;
      }
    } catch {
      // Java is still binding the isolated port.
    }
    await delay(150);
  }
  if (!runtime) throw new Error(`macOS runtime probe timed out\n${output}`);

  const result = {
    ok: runtime.renderBackend === "wkwebview-metal-webgl"
      && runtime.audioSpatialBackend === "web-audio-panner"
      && runtime.audioDecoder === "webkit-media"
      && runtime.nativeAudio?.status === "unsupported-os",
    renderPreset: runtime.renderPreset,
    renderBackend: runtime.renderBackend,
    audioSpatialBackend: runtime.audioSpatialBackend,
    audioDecoder: runtime.audioDecoder,
    nativeAudioStatus: runtime.nativeAudio?.status,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
} finally {
  try {
    await fetch(`http://127.0.0.1:${port}/api/app/quit`, {
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Process cleanup below is authoritative.
  }
  for (let attempt = 0; attempt < 30 && child.exitCode === null; attempt += 1) await delay(100);
  if (child.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGKILL");
    }
  }
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
