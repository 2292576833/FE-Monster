import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const config = read('src/main/java/com/femonster/music/MusicApiConfigService.java');
const appContext = read('src/main/java/com/femonster/core/AppContext.java');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const protocol = read('src/main/java/com/femonster/music/ProviderProtocol.java');
const app = read('web/app.js');
const html = read('web/index.html');

assert.match(config, /SUPPORTED_IDS\s*=\s*Set\.of\([^;]*"qishui"/s);
assert.match(config, /List\.of\("netease",\s*"qq",\s*"kugou",\s*"qishui"\)/);
assert.match(config, /map\.put\("qishui"[^;]*127\.0\.0\.1:3013[^;]*"\/health"/s);
assert.match(config, /case\s+"qishui"\s*->\s*"FE_QISHUI_BASE_URL"/);
assert.doesNotMatch(config, /deleteLegacyProviderDirectories\(packagesDir,\s*"qishui-"\)/);
assert.match(appContext, /List\.of\("qq",\s*"kugou",\s*"qishui"\)/);
assert.match(protocol, /case\s+"qishui"\s*->/);
assert.match(routes, /"\/api\/qishui\/search"/);
assert.match(routes, /"\/api\/qishui\/song\/url"/);
assert.match(routes, /"\/api\/qishui\/login\/status"/);
assert.match(routes, /"\/api\/qishui\/login\/token"/);
assert.match(routes, /configureLogin\("qishui"/);
assert.match(routes, /"\/api\/qishui\/local\/status"/);
assert.match(routes, /"\/api\/qishui\/local\/library\/import"/);

assert.match(app, /qishui:\s*\{[\s\S]*?id:\s*'qishui'/);
assert.doesNotMatch(app, /OFFICIAL_BROWSER_LOGIN_PROVIDERS\s*=\s*new Set\([^)]*qishui/);
assert.match(app, /qishui:\s*\[[\s\S]*?id:\s*'full'/);
assert.match(app, /async function configureQishuiOpenApiLogin\(/);
assert.match(app, /async function refreshQishuiLocalClientStatus\(/);
assert.match(app, /payload\.localProfilePresent/);
assert.match(app, /payload\.trackCount/);
assert.match(app, /async function importQishuiLibraryMetadataFile\(/);
assert.match(app, /'X-FE-Monster-Login':\s*'1'/);
for (const id of [
  'qishuiOpenApiLoginPanel',
  'qishuiAccessToken',
  'qishuiOpenId',
  'qishuiClientKey',
  'qishuiRefreshToken',
  'qishuiLocalClientStatus',
  'qishuiLibraryImportButton',
  'qishuiLibraryImportInput',
  'qishuiLoginSubmit'
]) {
  assert.match(html, new RegExp(`id="${id}"`));
}

const manifestPath = path.join(root, 'music-api-plugins/qishui/music-api-package.json');
assert.equal(existsSync(manifestPath), true, 'Qishui OpenAPI package manifest is missing');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.schema, 'fe-monster.music-api-package/v1');
assert.equal(manifest.id, 'qishui');
assert.equal(manifest.version, '3.1.1');
assert.equal(manifest.baseUrl, 'http://127.0.0.1:3013');
assert.equal(manifest.healthPath, '/health');
assert.equal(manifest.loginQr, false);
assert.equal(manifest.launcher?.runtime, 'node');
assert.equal(manifest.launcher?.entry, 'server.cjs');

const pluginSource = read('music-api-plugins/qishui/src/server.cjs');
assert.match(pluginSource, /open\.douyin\.com\/api\/luna\/v1\/platform\/feed\/song-tab/);
assert.match(pluginSource, /SodaMusic",\s*"LunaStorage",\s*"QueueCache"/);
assert.match(pluginSource, /gunzipSync\([^;]*maxOutputLength/s);
assert.match(pluginSource, /LOCAL_QUEUE_PLAYLIST_ID\s*=\s*"local-queue-cache"/);
assert.doesNotMatch(pluginSource, /music-lib|decrypt|decipher|drm|preview/i);

console.log('PASS check-qishui-openapi-integration');
