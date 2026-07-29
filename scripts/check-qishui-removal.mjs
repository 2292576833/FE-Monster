import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
let assertions = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

function assertNoMatch(relativePath, pattern, message) {
  const source = read(relativePath);
  assert(!pattern.test(source), `${relativePath}: ${message}`);
}

assert(
  !fs.existsSync(path.join(root, "music-api-plugins", "qishui")),
  "music-api-plugins/qishui: 汽水 API 插件目录仍存在"
);

assertNoMatch(
  "web/app.js",
  /\bid\s*:\s*["']qishui["']|\bprovider\s*(?:===|==|:)\s*["']qishui["']|\bMUSIC_PROVIDERS\.qishui\b/,
  "仍注册或分支处理汽水音乐平台"
);
assertNoMatch(
  "web/app.js",
  /luna:\/\/|SodaMusic|汽水音乐/,
  "仍包含汽水客户端启动或产品文案"
);
assertNoMatch(
  "web/index.html",
  /播放汽水音乐|汽水音乐今日推荐/,
  "仍显示汽水专属播放入口"
);
assertNoMatch(
  "src/main/java/com/femonster/music/MusicApiConfigService.java",
  /FE_QISHUI_BASE_URL|normalizeSupportedId\(["']qishui["']\)|pluginSlot\(["']qishui["']/,
  "仍允许导入或启动汽水 API"
);
const musicApiConfig = read("src/main/java/com/femonster/music/MusicApiConfigService.java");
assert(
  /SUPPORTED_IDS\s*=\s*Set\.of\(["']netease["'],\s*["']qq["'],\s*["']kugou["']\)/.test(musicApiConfig),
  "MusicApiConfigService still exposes a removed provider"
);
assert(
  /cleanupRemovedProviderArtifacts\(\)/.test(musicApiConfig)
    && /deleteLegacyProviderDirectories\(packagesDir,\s*["']qishui-["']\)/.test(musicApiConfig),
  "MusicApiConfigService does not clean legacy Qishui artifacts"
);
assertNoMatch(
  "src/main/java/com/femonster/core/AppContext.java",
  /["']qishui["']/,
  "仍创建汽水 provider client"
);
assertNoMatch(
  "src/main/java/com/femonster/api/ApiRoutes.java",
  /\/api\/qishui\/|["']qishui["']|汽水音乐/,
  "仍暴露汽水 API 路由"
);
assertNoMatch(
  "src/main/java/com/femonster/music/ProviderProtocol.java",
  /case\s+["']qishui["']/,
  "仍包含汽水协议映射"
);
assertNoMatch(
  "native/windows/winforms/FeMonsterForm.cs",
  /luna:\/\/|SodaMusic|qishui/i,
  "仍可从 Windows 客户端启动或控制汽水"
);

const androidFiles = [
  "android/app/src/main/androidWeb/fe-monster-mobile-runtime.js",
  "android/app/src/main/nodeGateway/main.cjs",
  "android/app/src/main/java/com/femonster/mobile/MainActivity.java",
  "android/app/build.gradle"
];
for (const relativePath of androidFiles) {
  assertNoMatch(
    relativePath,
    /luna:\/\/|SodaMusic|汽水音乐|\bqishui\b/i,
    "Android 端仍注册、启动或显示汽水音乐"
  );
}
assert(
  !fs.existsSync(path.join(root, "android", "app", "src", "main", "nodeGateway", "providers", "qishui.cjs")),
  "Android 汽水 provider 文件仍存在"
);

for (const artifact of [
  ["dist", "plugins", "FE-Monster-Qishui-API-Plugin-2.0.0.zip"],
  ["data", "qishui-auth.json"],
  ["data", "qishui-open-api"],
  ["data", "official-browser-login", "qishui"],
  ["data", "music-api", "logs", "qishui.log"]
]) {
  assert(!fs.existsSync(path.join(root, ...artifact)), `Legacy Qishui artifact remains: ${artifact.join("/")}`);
}
const packageRoot = path.join(root, "data", "music-api", "packages");
const legacyPackages = fs.existsSync(packageRoot)
  ? fs.readdirSync(packageRoot).filter((name) => name.startsWith("qishui-"))
  : [];
assert(legacyPackages.length === 0, `Legacy Qishui packages remain: ${legacyPackages.join(", ")}`);

if (failures.length) {
  process.stderr.write(`FAIL check-qishui-removal (${failures.length}/${assertions})\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`PASS check-qishui-removal (${assertions}/${assertions})\n`);
