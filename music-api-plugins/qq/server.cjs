"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = __dirname;
const archivePath = path.join(packageRoot, "runtime.tgz");
const checksumPath = path.join(packageRoot, "runtime.sha256");
const runtimeDir = path.join(packageRoot, ".runtime");
const markerPath = path.join(runtimeDir, ".fe-runtime-sha256");

function argument(name) {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function expectedChecksum() {
  const value = fs.readFileSync(checksumPath, "utf8").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("QQ API plugin runtime checksum is invalid.");
  }
  return value;
}

function fileChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function runtimeReady(checksum) {
  try {
    return fs.readFileSync(markerPath, "utf8").trim() === checksum
      && fs.existsSync(path.join(runtimeDir, "node_modules", "@sansenjian", "qq-music-api", "dist", "app.cjs"));
  } catch {
    return false;
  }
}

function prepareRuntime() {
  const checksum = expectedChecksum();
  if (runtimeReady(checksum)) return;
  if (fileChecksum(archivePath) !== checksum) {
    throw new Error("QQ API plugin runtime archive failed its SHA-256 check.");
  }

  const stagingDir = path.join(packageRoot, `.runtime-staging-${process.pid}`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const bundledTar = path.join(systemRoot, "System32", "tar.exe");
  const tarCommand = process.platform === "win32" && fs.existsSync(bundledTar)
    ? bundledTar
    : (process.platform === "win32" ? "tar.exe" : "tar");
  const result = spawnSync(tarCommand, ["-xzf", archivePath, "-C", stagingDir], {
    cwd: packageRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw new Error(`QQ API plugin runtime extraction failed: ${(result.stderr || result.stdout || "").trim()}`);
  }

  fs.writeFileSync(path.join(stagingDir, ".fe-runtime-sha256"), `${checksum}\n`, "utf8");
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.renameSync(stagingDir, runtimeDir);
}

function numericPort() {
  const raw = argument("--port") || process.env.PORT || "3011";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid QQ API plugin port: ${raw}`);
  }
  return port;
}

prepareRuntime();

const configDir = argument("--config-dir");
process.env.QQ_MUSIC_API_CONFIG_DIR = path.resolve(configDir || path.join(packageRoot, "config"));
process.env.NODE_ENV = "production";

const appPath = path.join(runtimeDir, "node_modules", "@sansenjian", "qq-music-api", "dist", "app.cjs");
const app = require(appPath);
app.use(async (context, next) => {
  if (context.path === "/health") {
    context.status = 200;
    context.type = "application/json";
    context.body = {
      ok: true,
      provider: "qq",
      version: "2.4.0"
    };
    return;
  }
  await next();
});

const port = numericPort();
const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`QQ Music API plugin 2.4.0 listening on http://127.0.0.1:${port}\n`);
});
server.on("error", (error) => {
  process.stderr.write(`QQ Music API plugin failed: ${error.message}\n`);
  process.exitCode = 1;
});
