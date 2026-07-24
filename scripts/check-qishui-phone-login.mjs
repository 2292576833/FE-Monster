import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = await Promise.all([
  "web/index.html",
  "web/app.js",
  "web/styles.css",
  "src/main/java/com/femonster/api/ApiRoutes.java",
  "src/main/java/com/femonster/music/GenericMusicClient.java",
  "src/main/java/com/femonster/music/MusicProviderClient.java",
  "src/main/java/com/femonster/music/MusicProviderRegistry.java",
].map(async (relativePath) => ({
  relativePath,
  text: await readFile(path.join(root, relativePath), "utf8"),
})));

const combined = sources.map(({ text }) => text).join("\n");
const forbidden = [
  "qishuiPhoneLogin",
  "qishuiPhoneInput",
  "qishuiCodeInput",
  "qishuiSendCodeButton",
  "qishuiGuestButton",
  "qishuiGuestMode",
  "/login/phone/send",
  "/login/phone/verify",
  "loginPhoneSendPayload",
  "loginPhoneVerifyPayload",
];

for (const marker of forbidden) {
  assert.equal(combined.includes(marker), false, `Removed phone/guest login marker remains: ${marker}`);
}

const index = sources.find(({ relativePath }) => relativePath === "web/index.html").text;
const app = sources.find(({ relativePath }) => relativePath === "web/app.js").text;
assert.match(index, /<div class="login-provider-tabs" id="loginProviderTabs"[^>]*><\/div>/);
assert.match(index, /<div class="qr-login-stage" id="qrLoginStage">/);
assert.match(app, /Object\.values\(state\.providers\)[\s\S]*providerConfigured\(provider\.id\)/);
assert.match(app, /document\.createElement\('button'\)/);
assert.match(app, /tab\.dataset\.loginProvider = provider\.id/);
assert.match(app, /tab\.textContent = provider\.label/);
assert.match(app, /info\.loginQr === false[\s\S]*当前 API 包未声明扫码登录能力/);

console.log("QR-only dynamic provider login contract passed.");
