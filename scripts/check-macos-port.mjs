import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const macRoot = path.join(root, "FE moster苹果端");

function text(relativePath) {
  const absolutePath = path.join(macRoot, relativePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing macOS port file: ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`macOS port check failed: ${label}`);
}

const packageSwift = text("App/Package.swift");
const mainSwift = text("App/Sources/FEMonsterMac/main.swift");
const optionsSwift = text("App/Sources/FEMonsterMac/ClientOptions.swift");
const backendSwift = text("App/Sources/FEMonsterMac/BackendServer.swift");
const windowSwift = text("App/Sources/FEMonsterMac/FeMonsterWindowController.swift");
const toolbarSwift = text("App/Sources/FEMonsterMac/RecordingToolbarController.swift");
const buildScript = text("Build/build-macos.sh");
const runScript = text("Build/run-dev.sh");
const syncScript = text("Build/sync-shared-resources.sh");
const infoPlist = text("Build/Info.plist");
const productVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const bundleCheck = text("Build/check-bundle.sh");

requirePattern(packageSwift, /\.macOS\(\.v13\)/, "Swift package must target macOS 13+");
requirePattern(mainSwift, /applicationWillTerminate/, "AppDelegate must stop the backend");
requirePattern(optionsSwift, /FE_MONSTER_(ROOT|JAR|JAVA)/, "development overrides must be supported");

for (const [pattern, label] of [
  [/api\/app\/version/, "backend health probe"],
  [/FE_MONSTER_ROOT/, "resource root environment"],
  [/FE_MONSTER_WEB_ROOT/, "web root environment"],
  [/FE_MONSTER_DATA_DIR/, "writable data environment"],
  [/applicationSupportDirectory/, "Application Support data directory"],
  [/URL:\\s\+/, "dynamic Java port discovery"],
  [/api\/app\/window\/quit/, "graceful Java shutdown"],
]) {
  requirePattern(backendSwift, pattern, label);
}

for (const [pattern, label] of [
  [/WKWebView/, "WKWebView host"],
  [/WKScriptMessageHandler/, "WebView2-compatible message bridge"],
  [/runOpenPanelWith/, "API plugin ZIP file picker"],
  [/WKDownloadDelegate/, "download delegate"],
  [/NSSavePanel/, "recording save-as panel"],
  [/actual\.scheme == expected\.scheme/, "trusted scheme check"],
  [/actual\.host == expected\.host/, "trusted host check"],
  [/actual\.port == expected\.port/, "trusted port check"],
  [/fe-render-capabilities-result/, "render capability reply"],
  [/fe-recording-toolbar/, "recording toolbar protocol"],
  [/cornerRadius[^=\n]*=\s*28/, "rounded transparent main window"],
  [/window\.webkit\.messageHandlers\.feMonster/, "WebView compatibility shim"],
]) {
  requirePattern(windowSwift, pattern, label);
}

for (const action of ["start", "stop", "resume", "finish", "close", "saveas"]) {
  requirePattern(toolbarSwift, new RegExp(`invokeAction\\("${action}"\\)`), `recording action ${action}`);
}

for (const [source, label] of [
  [buildScript, "build-macos.sh"],
  [runScript, "run-dev.sh"],
  [syncScript, "sync-shared-resources.sh"],
]) {
  requirePattern(source, /^#!\/usr\/bin\/env bash/, `${label} shebang`);
  requirePattern(source, /set -euo pipefail/, `${label} strict mode`);
}

for (const key of [
  "CFBundleShortVersionString",
  "NSAllowsLocalNetworking",
  "NSMicrophoneUsageDescription",
  "NSScreenCaptureUsageDescription",
  "NSAudioCaptureUsageDescription",
]) {
  requirePattern(infoPlist, new RegExp(`<key>${key}</key>`), `Info.plist ${key}`);
}
if (!infoPlist.includes(`<string>${productVersion}</string>`)) {
  throw new Error("macOS Info.plist version differs from the shared product version");
}
requirePattern(buildScript, /CFBundleShortVersionString/, "bundle version generated at build time");
requirePattern(text("Build/build-java.sh"), /-classpath/, "SQLite Java compile dependencies");
requirePattern(text("Build/build-java.sh"), /--manifest/, "runtime Class-Path manifest");
requirePattern(syncScript, /plugins\/music-api/, "automatic music API bootstrap path");
requirePattern(syncScript, /native\/audio-sources/, "audio source runtime bundled");
requirePattern(syncScript, /npm ci/, "locked production dependencies installed");
requirePattern(syncScript, /libfe-monster-keychain\.dylib/, "Keychain native library bundled");
requirePattern(syncScript, /native\/macos\/build-audio\.sh/, "CoreAudio Rust OBR native build");
requirePattern(syncScript, /libfe-monster-coreaudio\.dylib/, "native audio output bundled");
requirePattern(buildScript, /bundle-node\.sh/, "standalone Node always bundled");
requirePattern(buildScript, /java\.sql/, "SQLite module available in jlink runtime");
requirePattern(buildScript, /hdiutil create/, "installable DMG creation");
requirePattern(infoPlist, /<key>LSMinimumSystemVersion<\/key>\s*<string>13\.5<\/string>/,
  "bundled Node requires macOS 13.5+");
for (const script of readdirSync(path.join(macRoot, "Build")).filter(name => name.endsWith(".sh"))) {
  const source = text(`Build/${script}`);
  for (const command of source.split(/\r?\n/).filter(line => /\blipo\b[^\n]*-verify_arch/.test(line))) {
    assert.match(command, /(?:^|[;\s])(?:\/usr\/bin\/)?lipo\s+"[^"]+"\s+-verify_arch\s+"/,
      `${script}: Apple lipo requires the input file before -verify_arch`);
  }
}

// Run the bundle's actual read-only JNI verification against representative
// HTTP responses. Native loading itself is exercised by this script on Mac CI.
const nativeCheckStart = bundleCheck.indexOf("async function checkNativeAudioRuntime() {");
const nativeCheckEnd = bundleCheck.indexOf("\nconst nativeAudio=await checkNativeAudioRuntime();", nativeCheckStart);
assert.ok(nativeCheckStart >= 0 && nativeCheckEnd > nativeCheckStart, "bundle verification must exercise CoreAudio JNI over HTTP");
const nativeCheckSource = bundleCheck.slice(nativeCheckStart, nativeCheckEnd);
const fixtureAudio = {
  status: "ready", error: "", active: true, macos: true, windows: false,
  backend: "coreaudio", spatialBackend: "google-obr", decoder: "webkit-media",
  dll: "/installed/FE Monster.app/Contents/Resources/App/native/macos/libfe-monster-coreaudio.dylib",
  captureRunning: false, spatialPipeline: { running: false },
};
function runNativeCheck(overrides = {}, responseStatus = 200) {
  const context = {
    assert, path: path.posix, AbortSignal, base: "http://127.0.0.1:31555/",
    appResources: "/installed/FE Monster.app/Contents/Resources/App",
    fs: { realpathSync: value => value },
    fetch: async url => {
      assert.equal(url, "http://127.0.0.1:31555/api/audio/runtime");
      return { status: responseStatus, json: async () => ({ ...fixtureAudio, ...overrides }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(nativeCheckSource, context, { filename: "check-bundle.sh JNI validation" });
  return context.checkNativeAudioRuntime();
}
assert.equal((await runNativeCheck()).initialized, true);
assert.equal((await runNativeCheck({ status: "init-failed", active: false, backend: "html-audio-fallback", error: "nativeInit returned false" })).initialized, false);
for (const overrides of [
  { status: "load-failed", active: false, error: "dlopen missing symbol" },
  { status: "dll-missing", active: false }, { status: "unsupported-os", active: false },
  { macos: false, windows: true }, { dll: "/different/install/libfe-monster-coreaudio.dylib" },
  { error: "UnsatisfiedLinkError" }, { captureRunning: true }, { spatialPipeline: { running: true } },
]) await assert.rejects(runNativeCheck(overrides));
await assert.rejects(runNativeCheck({}, 500));

const sourceText = [mainSwift, optionsSwift, backendSwift, windowSwift, toolbarSwift].join("\n");
if (/\b(?:powershell(?:\.exe)?|cmd\.exe|taskkill|pkill)\b/i.test(sourceText)) {
  throw new Error("macOS native source contains a forbidden Windows/broad process command");
}

const generatedDirectories = [".build-macos", "dist", path.join("App", ".build")];
const tracked = spawnSync("git", ["ls-files", "--", ...generatedDirectories.map((directory) =>
  path.relative(root, path.join(macRoot, directory)))], { cwd: root, encoding: "utf8", windowsHide: true });
if (tracked.status === 0 && tracked.stdout.trim()) {
  throw new Error("Generated macOS artifacts must not be tracked in Git");
}

const sourceFiles = readdirSync(path.join(macRoot, "App", "Sources", "FEMonsterMac"))
  .filter((name) => name.endsWith(".swift"))
  .sort();
process.stdout.write(`${JSON.stringify({
  ok: true,
  macRoot,
  swiftFiles: sourceFiles,
  version: productVersion,
  generatedArtifacts: generatedDirectories.some((directory) => existsSync(path.join(macRoot, directory))),
}, null, 2)}\n`);
