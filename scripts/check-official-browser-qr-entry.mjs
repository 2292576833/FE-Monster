import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/main/java/com/femonster/core/OfficialBrowserLoginService.java', 'utf8');
const routes = readFileSync('src/main/java/com/femonster/api/ApiRoutes.java', 'utf8');
const app = readFileSync('web/app.js', 'utf8');
const html = readFileSync('web/index.html', 'utf8');

assert.match(service, /--window-size=520,720/);
assert.match(service, /--app=" \+ spec\.loginUrl\(\)/);
assert.doesNotMatch(service, /\?official-login=|--app=http:\/\/127\.0\.0\.1/);
assert.match(routes, /browserLogin\.start\(providerFrom\(path, query\)\)/);
assert.doesNotMatch(routes, /\/login\/qr\//);
assert.match(app, /mediaIsLocalMusicApi\(source\)/);
assert.doesNotMatch(app, /OFFICIAL_BROWSER_LOGIN_MODE|loadLoginQr|\/login\/qr\//);
assert.doesNotMatch(html, /qrLoginStage|neteaseQrImage|neteaseQrRefresh/);

console.log('Official website login entry PASS');
