import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/main/java/com/femonster/core/OfficialBrowserLoginService.java', 'utf8');
const routes = readFileSync('src/main/java/com/femonster/api/ApiRoutes.java', 'utf8');
const app = readFileSync('web/app.js', 'utf8');
const css = readFileSync('web/styles.css', 'utf8');

assert.doesNotMatch(service, /"qishui"[^\n]+"https:\/\/www\.qishui\.com\/"/,
  'Qishui official-browser login still opens its download homepage');
assert.match(service, /--window-size=\d+,\d+/,
  'Official-browser login does not constrain its window size');
assert.match(service, /\?official-login=/,
  'Official-browser login does not open the QR-only login surface');
assert.match(routes, /browserLogin\.start\([\s\S]*?providerFrom\(path, query\)[\s\S]*?getLocalAddress\(\)\.getPort\(\)/,
  'Browser login route does not pass its local application origin');
assert.match(app, /OFFICIAL_BROWSER_LOGIN_MODE/,
  'The web client has no QR-only official-browser mode');
assert.match(app, /loadLoginQr\(/,
  'QR-only mode does not load the selected provider QR code');
assert.match(app, /mediaIsLocalMusicApi\(source\)/,
  'Local plugin audio is still routed through the public-internet audio proxy');
assert.match(css, /official-browser-login-mode/,
  'QR-only mode has no compact isolated layout');

console.log('Official browser compact QR entry PASS');
