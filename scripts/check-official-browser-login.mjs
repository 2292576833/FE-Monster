import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const service = read('src/main/java/com/femonster/core/OfficialBrowserLoginService.java');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const context = read('src/main/java/com/femonster/core/AppContext.java');
const generic = read('src/main/java/com/femonster/music/GenericMusicClient.java');
const netease = read('src/main/java/com/femonster/netease/NeteaseClient.java');
const html = read('web/index.html');
const app = read('web/app.js');

for (const [provider, domain] of [
  ['netease', '163.com'],
  ['qq', 'qq.com'],
  ['kugou', 'kugou.com'],
  ['qishui', 'qishui.com']
]) {
  assert.ok(service.includes(`"${provider}", new ProviderSpec(`), `${provider} browser login provider is missing`);
  assert.ok(service.includes(`List.of("${domain}")`), `${provider} cookie domain filter is missing`);
  for (const action of ['status', 'start', 'cancel']) {
    assert.ok(routes.includes(`/api/${provider}/login/browser/${action}`), `${provider} ${action} route is missing`);
  }
}

assert.match(service, /--remote-debugging-address=127\.0\.0\.1/);
assert.match(service, /--window-size=440,600/);
assert.match(service, /--app=http:\/\/127\.0\.0\.1:/);
assert.match(service, /\?official-login=/);
assert.match(service, /new ServerSocket\(0, 1, java\.net\.InetAddress\.getLoopbackAddress\(\)\)/);
assert.match(service, /command\.put\("method", "Storage\.getCookies"\)/);
assert.match(service, /if \(!spec\.matchesDomain\(domain\)\) continue/);
assert.match(service, /music\.rememberBrowserSession\(id, cookies\)/);
assert.match(service, /music\.accountPayload\(id\)/);
assert.match(service, /SimpleJson\.asBoolean\(account\.get\("loggedIn"\), false\)/);
assert.doesNotMatch(service, /body\.put\("cookies?"/i, 'raw cookies must never be returned to the web UI');
assert.match(routes, /X-FE-Monster-Login/);
assert.match(routes, /isLoopbackAddress\(\)/);
assert.match(routes, /local application origin/);
assert.match(routes, /browserLogin\.start\([\s\S]*exchange\.getLocalAddress\(\)\.getPort\(\)/);
assert.match(context, /new OfficialBrowserLoginService\(paths\.dataDir, music\)/);
assert.match(context, /browserLogin\.close\(\)/);

assert.match(netease, /rememberBrowserSession\(Map<String, String> cookies\)/);
assert.match(generic, /rememberBrowserSession\(Map<String, String> cookies\)/);
assert.match(generic, /nestedCookieValue\(kugoo, "KugooID", "userid"\)/);
assert.match(generic, /nestedCookieValue\(kugoo, "KugooPwd", "token"\)/);
for (const cookie of ['sessionid', 'sessionid_ss', 'sid_tt', 'sid_guard']) {
  assert.ok(generic.includes(`"${cookie}"`), `Qishui ${cookie} session persistence is missing`);
}

assert.match(html, /id="officialBrowserLoginButton"/);
assert.match(html, /id="officialBrowserLoginStatus"/);
assert.match(app, /async function startOfficialBrowserLogin\(/);
assert.match(app, /async function checkOfficialBrowserLogin\(/);
assert.match(app, /function clearOfficialBrowserLoginTimer\(options = \{\}\)/);
assert.match(app, /\/login\/browser\/cancel/);
assert.match(app, /'X-FE-Monster-Login': '1'/);
assert.match(app, /officialBrowserLoginButton\.addEventListener\('click', toggleOfficialBrowserLogin\)/);

console.log('Official browser login contract PASS (NetEase, QQ, Kugou, Qishui)');
