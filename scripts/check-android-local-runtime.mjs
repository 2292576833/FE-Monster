import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const securitySourceExtensions = new Set([".cjs", ".cpp", ".gradle", ".h", ".java", ".js", ".json", ".mjs", ".ps1", ".xml"]);

function sourceFilesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(target);
    return entry.isFile() && securitySourceExtensions.has(path.extname(entry.name).toLowerCase()) ? [target] : [];
  });
}

const mainActivity = read("android/app/src/main/java/com/femonster/mobile/MainActivity.java");
const buildGradle = read("android/app/build.gradle");
const mobileRuntime = read("android/app/src/main/androidWeb/fe-monster-mobile-runtime.js");
const mobileCss = read("android/app/src/main/androidWeb/fe-monster-mobile.css");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const buildScript = read("scripts/build-android.ps1");
const networkSecurityConfigPath = path.join(root, "android/app/src/main/res/xml/network_security_config.xml");
const networkSecurityConfig = existsSync(networkSecurityConfigPath)
  ? readFileSync(networkSecurityConfigPath, "utf8")
  : "";
const cleartextDomains = [...networkSecurityConfig.matchAll(/<domain\b[^>]*>([^<]+)<\/domain>/gi)]
  .map((match) => match[1].trim().toLowerCase());
const loopbackCleartextOnly = !networkSecurityConfig || (
  networkSecurityConfig.includes('<base-config cleartextTrafficPermitted="false"')
  && (networkSecurityConfig.match(/cleartextTrafficPermitted="true"/g) || []).length === 1
  && cleartextDomains.length > 0
  && cleartextDomains.every((domain) => domain === "127.0.0.1" || domain === "localhost")
  && !/<(?:trust-anchors|certificates|pin-set)\b/i.test(networkSecurityConfig)
);
const androidSecuritySource = [
  mainActivity,
  buildGradle,
  mobileRuntime,
  manifest,
  buildScript,
  ...sourceFilesUnder(path.join(root, "android/app/src/main"))
    .filter((file) => statSync(file).size <= 5 * 1024 * 1024)
    .map((file) => readFileSync(file, "utf8"))
].join("\n");

const checks = {
  apkUsesPrivateLocalOrigin: mainActivity.includes('LOCAL_APP_ORIGIN = "https://fe-monster.local/"')
    && mainActivity.includes("loadDataWithBaseURL(LOCAL_APP_ORIGIN"),
  launchDoesNotRequestServerAddress: !mainActivity.includes("buildConnectPanel()")
    && !mainActivity.includes("loadServer(savedUrl)"),
  remoteGatewayRemovedFromAndroid: !mainActivity.includes("frp-boy.com")
    && !buildGradle.includes("DEFAULT_SERVER_URL")
    && !buildGradle.includes("PUBLIC_ACCESS_KEY")
    && !buildGradle.includes("FE_MONSTER_ANDROID_SERVER_URL"),
  obsoleteTunnelTrustRemoved: !existsSync(path.join(root, "android/app/src/main/res/raw/sakura_frp_681748273.crt"))
    && !/(?:frp-boy\.com|sakurafrp)/i.test(androidSecuritySource),
  providerLoginHasNetworkPermission: manifest.includes('android.permission.INTERNET'),
  providerNetworkRemainsHardened: manifest.includes('android:usesCleartextTraffic="false"')
    && loopbackCleartextOnly
    && !manifest.includes('android.permission.CHANGE_NETWORK_STATE')
    && !manifest.includes('android.permission.WRITE_SETTINGS'),
  noDesktopGatewayOrCredentialMaterial: !/(?:frp-boy\.com|sakurafrp|PUBLIC_ACCESS_KEY|DEFAULT_SERVER_URL|FE_MONSTER_ANDROID_SERVER_URL|AccessKeyFile)/i.test(androidSecuritySource),
  buildNeedsNoServerCredentials: !buildScript.includes("ServerUrl")
    && !buildScript.includes("PublicAccessKey")
    && !buildScript.includes("AccessKeyFile"),
  localApiInstalledBeforeApp: mobileRuntime.includes("window.fetch = androidLocalFetch")
    && mobileRuntime.includes("root.dataset.feRuntime = 'local'"),
  loginButtonIsNotHijackedForLocalImport: !mobileRuntime.includes("syncLocalImportUi")
    && !/closest\(['\"]#neteaseLoginButton['\"]\)[\s\S]{0,320}localPlaylistInput/.test(mobileRuntime),
  noFeServerHealthProbe: !mobileRuntime.includes("/api/app/runtime?android-health=1")
    && !mobileRuntime.includes("probeServer"),
  localRuntimeOwnsCoreState: [
    "/api/app/runtime",
    "/api/player/state",
    "/api/providers",
    "/api/search",
    "/api/sandbox/presets"
  ].every((route) => mobileRuntime.includes(route)),
  landscapeHasIndependentComposition: mobileCss.includes("data-fe-orientation=\"landscape\"")
    && mobileCss.includes("orientation: landscape")
    && mobileCss.includes("grid-template-columns"),
  androidStylesRemainScoped: !/(^|\n)\s*\.(?:player-dock|top-search|sandbox-workspace)\b/.test(mobileCss)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ ok: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
