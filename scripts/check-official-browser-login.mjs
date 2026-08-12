import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const service = read('src/main/java/com/femonster/core/OfficialBrowserLoginService.java');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const context = read('src/main/java/com/femonster/core/AppContext.java');
const generic = read('src/main/java/com/femonster/music/GenericMusicClient.java');
const netease = read('src/main/java/com/femonster/netease/NeteaseClient.java');
const musicApiConfig = read('src/main/java/com/femonster/music/MusicApiConfigService.java');
const html = read('web/index.html');
const app = read('web/app.js');
const css = read('web/styles.css');

const providers = [
  ['netease', '163.com', 'https://music.163.com/#/login'],
  ['qq', 'qq.com', 'https://y.qq.com/n/ryqq/profile/like/song'],
  ['kugou', 'kugou.com', 'https://activity.kugou.com/login/v-53b2f120/index.html']
];

for (const [provider, domain, loginUrl] of providers) {
  assert.ok(service.includes(`"${provider}", new ProviderSpec(`), `${provider} browser login provider is missing`);
  assert.ok(service.includes(`List.of("${domain}")`), `${provider} cookie domain filter is missing`);
  assert.ok(service.includes(loginUrl), `${provider} does not open its official login page`);
  for (const action of ['status', 'start', 'cancel', 'switch']) {
    assert.ok(routes.includes(`/api/${provider}/login/browser/${action}`), `${provider} ${action} route is missing`);
  }
}

assert.doesNotMatch(service, /"qishui",\s*new ProviderSpec/);
assert.doesNotMatch(routes, /\/api\/qishui\/login\/browser\//);
assert.match(service, /--remote-debugging-address=127\.0\.0\.1/);
assert.match(service, /--window-size=520,720/);
assert.match(service, /--app=" \+ loginUrl/);
assert.match(service, /music\.beginProviderLogin\(id\)/,
  'Kugou login does not obtain an App-compatible provider QR session');
assert.match(service, /music\.pollProviderLogin\(session\.provider, session\.providerLoginKey\)/,
  'Kugou login does not privately poll the provider QR session');
assert.match(service, /"127\.0\.0\.1"\.equalsIgnoreCase\(uri\.getHost\(\)\)/,
  'Kugou QR display is not restricted to the loopback-only plugin page');
assert.match(service, /"\/login\/qr\/view"\.equals\(uri\.getPath\(\)\)/,
  'Kugou QR display is not restricted to the dedicated local QR view');
assert.match(service, /!key\.equals\(queryKey\)/,
  'Kugou QR display does not bind the local page to the provider-issued key');
assert.doesNotMatch(service, /official-login|--app=http:\/\/127\.0\.0\.1/);
assert.match(service, /new ServerSocket\(0, 1, java\.net\.InetAddress\.getLoopbackAddress\(\)\)/);
assert.match(service, /command\.put\("method", "Storage\.getCookies"\)/);
assert.match(service, /if \(!spec\.matchesDomain\(domain\)\) continue/);
assert.match(service, /music\.synchronizeBrowserSession\(session\.provider, cookies\)/);
assert.match(service, /public synchronized Map<String, Object> switchAccount\(String provider\)/);
assert.match(service, /music\.clearBrowserSession\(id\)/);
assert.match(service, /clearProviderProfile\(id\)/);
assert.doesNotMatch(service, /body\.put\("cookies?"/i, 'raw cookies must never be returned to the web UI');

assert.match(routes, /X-FE-Monster-Login/);
assert.match(routes, /isLoopbackAddress\(\)/);
assert.match(routes, /official browser login requires a local application origin/);
assert.match(routes, /browserLogin\.start\(providerFrom\(path, query\)\)/);
assert.doesNotMatch(routes, /\/login\/qr\//);
assert.match(musicApiConfig, /boolean loginQr = false;/,
  'desktop provider imports must discard legacy embedded QR capability flags');
assert.doesNotMatch(musicApiConfig, /pluginSlot\([^\n]+, true\)/,
  'desktop provider defaults must not advertise embedded QR login');
assert.match(context, /new OfficialBrowserLoginService\(paths\.dataDir, music\)/);
assert.match(context, /browserLogin\.close\(\)/);

assert.match(netease, /rememberBrowserSession\(Map<String, String> cookies\)/);
assert.match(generic, /rememberBrowserSession\(Map<String, String> cookies\)/);
assert.match(netease, /clearBrowserSession\(\)/);
assert.match(generic, /clearBrowserSession\(\)/);
assert.match(generic, /if \("kugou"\.equals\(id\)\) return;/,
  'Kugou must reject incompatible website-cookie imports');
assert.doesNotMatch(generic, /resetKugouAccountStateForBrowserImport|nestedCookieValue\(kugoo/);

assert.match(html, /id="browserLoginStage"/);
assert.match(html, /id="officialBrowserLoginButton"/);
assert.match(html, /id="officialBrowserSwitchAccountButton"/);
assert.match(html, /id="officialBrowserLoginStatus"/);
assert.doesNotMatch(html, /qrLoginStage|neteaseQrImage|neteaseQrRefresh/);
assert.match(css, /\.browser-login-stage/);
assert.doesNotMatch(css, /\.qr-login-stage|official-browser-login-mode/);
assert.match(app, /OFFICIAL_BROWSER_LOGIN_PROVIDERS = new Set\(\['netease', 'qq', 'kugou'\]\)/);
assert.match(app, /async function startOfficialBrowserLogin\(/);
assert.match(app, /async function checkOfficialBrowserLogin\(/);
assert.match(app, /async function switchOfficialBrowserAccount\(/);
assert.match(app, /\/login\/browser\/switch/);
assert.match(app, /\/login\/browser\/cancel/);
assert.match(app, /'X-FE-Monster-Login': '1'/);
assert.doesNotMatch(app, /\/login\/qr\/|loginQr|loadLoginQr|OFFICIAL_BROWSER_LOGIN_MODE/);
assert.match(app, /officialBrowserLoginButton\.addEventListener\('click', toggleOfficialBrowserLogin\)/);
assert.match(app, /officialBrowserSwitchAccountButton\.addEventListener\('click', switchOfficialBrowserAccount\)/);

console.log('Official browser login contract PASS (NetEase/QQ cookies; Kugou provider QR; no web-embedded QR flow)');
