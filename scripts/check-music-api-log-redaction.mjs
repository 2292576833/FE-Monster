import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, "music-api-plugins");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fe-music-log-redaction-"));
const runtimeRoot = path.join(fixtureRoot, ".runtime");
const apiRoot = path.join(runtimeRoot, "node_modules", "NeteaseCloudMusicApi");

const syntheticSecrets = Object.freeze({
  cookie: "FE_LOG_TEST_COOKIE_42d8f0b986",
  bearer: "FE_LOG_TEST_BEARER_86c39a7e12",
  accessToken: "FE_LOG_TEST_ACCESS_TOKEN_1d7b926c54",
  refreshToken: "FE_LOG_TEST_REFRESH_TOKEN_91af3e50c8",
  apiKey: "FE_LOG_TEST_API_KEY_44bd137ac6"
});

try {
  fs.mkdirSync(path.join(apiRoot, "util"), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, "netease", "server.cjs"),
    path.join(fixtureRoot, "server.cjs")
  );
  const safeLogSource = path.join(sourceRoot, "shared", "safe-log.cjs");
  if (fs.existsSync(safeLogSource)) {
    fs.copyFileSync(safeLogSource, path.join(fixtureRoot, "safe-log.cjs"));
  }

  const archive = Buffer.from("synthetic-runtime-archive", "utf8");
  const archiveSha256 = crypto.createHash("sha256").update(archive).digest("hex").toUpperCase();
  fs.writeFileSync(path.join(fixtureRoot, "runtime.tgz"), archive);
  fs.writeFileSync(
    path.join(fixtureRoot, "plugin-runtime.json"),
    JSON.stringify({ archiveSha256 })
  );
  fs.writeFileSync(path.join(runtimeRoot, ".fe-runtime-sha256"), archiveSha256);
  fs.writeFileSync(path.join(apiRoot, "package.json"), JSON.stringify({ name: "NeteaseCloudMusicApi" }));
  fs.writeFileSync(path.join(apiRoot, "generateConfig.js"), "module.exports = () => {};\n");
  fs.writeFileSync(
    path.join(apiRoot, "util", "index.js"),
    "module.exports.generateRandomChineseIP = () => '127.0.0.1';\n"
  );
  fs.writeFileSync(
    path.join(apiRoot, "server.js"),
    [
      "module.exports.serveNcmApi = async () => {",
      "  const secrets = JSON.parse(process.env.FE_LOG_TEST_SECRETS);",
      "  console.log(`[OK] /login/status?cookie=${encodeURIComponent(secrets.cookie)}&access_token=${secrets.accessToken}&safe=value`);",
      "  console.log({ headers: { cookie: secrets.cookie, authorization: `Bearer ${secrets.bearer}`, 'x-api-key': secrets.apiKey }, query: { refreshToken: secrets.refreshToken, page: 1 } });",
      "  console.error(new Error(`request failed; Authorization: Bearer ${secrets.bearer}; Cookie: MUSIC_U=${secrets.cookie}`));",
      "  process.stdout.write(`token=${secrets.accessToken}\\n`);",
      "  return { get: () => {} };",
      "};",
      ""
    ].join("\n")
  );

  const result = spawnSync(process.execPath, [path.join(fixtureRoot, "server.cjs")], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FE_LOG_TEST_SECRETS: JSON.stringify(syntheticSecrets)
    },
    timeout: 10_000,
    windowsHide: true
  });

  assert.equal(result.status, 0, "synthetic Netease wrapper must exit cleanly");
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const leakedCount = Object.values(syntheticSecrets).filter((secret) => output.includes(secret)).length;
  assert.equal(leakedCount, 0, `captured plugin output still contains ${leakedCount} synthetic secrets`);
  assert.match(output, /\[REDACTED\]/, "redacted output must retain an explicit replacement marker");
  assert.match(output, /safe=value/, "non-sensitive query values must remain diagnosable");
  assert.match(output, /page:\s*1/, "non-sensitive structured fields must remain diagnosable");

  console.log(JSON.stringify({
    pass: true,
    checks: {
      syntheticSecretsAbsent: leakedCount === 0,
      redactionMarkerPresent: true,
      safeFieldsPreserved: true
    }
  }));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
