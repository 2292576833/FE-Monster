import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSScreenCaptureUsageDescription",
  "NSAudioCaptureUsageDescription",
]) {
  requirePattern(infoPlist, new RegExp(`<key>${key}</key>`), `Info.plist ${key}`);
}
requirePattern(infoPlist, /<string>1\.8\.8<\/string>/, "Info.plist version 1.8.8");
requirePattern(syncScript, /gesture-requirements-macos\.txt/, "macOS gesture dependencies");

const sourceText = [mainSwift, optionsSwift, backendSwift, windowSwift, toolbarSwift].join("\n");
if (/\b(?:powershell(?:\.exe)?|cmd\.exe|taskkill|pkill)\b/i.test(sourceText)) {
  throw new Error("macOS native source contains a forbidden Windows/broad process command");
}

for (const generated of [".build-macos", "dist", path.join("App", ".build")]) {
  if (existsSync(path.join(macRoot, generated))) {
    throw new Error(`Generated macOS directory must not be committed: ${generated}`);
  }
}

const sourceFiles = readdirSync(path.join(macRoot, "App", "Sources", "FEMonsterMac"))
  .filter((name) => name.endsWith(".swift"))
  .sort();
process.stdout.write(`${JSON.stringify({
  ok: true,
  macRoot,
  swiftFiles: sourceFiles,
  version: "1.8.8",
  generatedArtifacts: false,
}, null, 2)}\n`);
