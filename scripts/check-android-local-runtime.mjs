import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const mainActivity = read("android/app/src/main/java/com/femonster/mobile/MainActivity.java");
const buildGradle = read("android/app/build.gradle");
const mobileRuntime = read("android/app/src/main/androidWeb/fe-monster-mobile-runtime.js");
const mobileCss = read("android/app/src/main/androidWeb/fe-monster-mobile.css");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const buildScript = read("scripts/build-android.ps1");

const checks = {
  apkUsesPrivateLocalOrigin: mainActivity.includes('LOCAL_APP_ORIGIN = "https://fe-monster.local/"')
    && mainActivity.includes("loadDataWithBaseURL(LOCAL_APP_ORIGIN"),
  launchDoesNotRequestServerAddress: !mainActivity.includes("buildConnectPanel()")
    && !mainActivity.includes("loadServer(savedUrl)"),
  remoteGatewayRemovedFromAndroid: !mainActivity.includes("frp-boy.com")
    && !buildGradle.includes("DEFAULT_SERVER_URL")
    && !buildGradle.includes("PUBLIC_ACCESS_KEY")
    && !buildGradle.includes("FE_MONSTER_ANDROID_SERVER_URL"),
  obsoleteTunnelTrustRemoved: !manifest.includes("networkSecurityConfig")
    && manifest.includes('android:usesCleartextTraffic="false"')
    && !existsSync(path.join(root, "android/app/src/main/res/raw/sakura_frp_681748273.crt")),
  apkHasNoNetworkPermission: !manifest.includes('android.permission.INTERNET')
    && !manifest.includes('android.permission.ACCESS_NETWORK_STATE'),
  buildNeedsNoServerCredentials: !buildScript.includes("ServerUrl")
    && !buildScript.includes("PublicAccessKey")
    && !buildScript.includes("AccessKeyFile"),
  localApiInstalledBeforeApp: mobileRuntime.includes("window.fetch = androidLocalFetch")
    && mobileRuntime.includes("root.dataset.feRuntime = 'local'"),
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
