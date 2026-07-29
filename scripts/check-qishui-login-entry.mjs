import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('web/app.js', 'utf8');
const html = readFileSync('web/index.html', 'utf8');

assert.match(html, /id="loginProviderTabs"/);
assert.match(html, /id="qishuiOpenApiLoginPanel"/);

assert.match(
  app,
  /function loginProviderVisible\([^)]*\)\s*\{[\s\S]*?provider\.id === 'qishui'[\s\S]*?providerConfigured\(provider\.id\)[\s\S]*?\}/,
  'Qishui must remain visible in the login provider list before its plugin is imported'
);
assert.match(
  app,
  /Object\.values\(state\.providers\)[\s\S]*?\.filter\(\(provider\) => loginProviderVisible\(provider\)\)/,
  'login provider tabs must use the always-visible Qishui policy'
);
assert.match(
  app,
  /function setActiveProvider\([^)]*\)\s*\{[\s\S]*?loginProviderVisible\(MUSIC_PROVIDERS\[requestedProvider\]\)/,
  'the always-visible Qishui tab must also be selectable before plugin import'
);
assert.match(
  app,
  /汽水音乐插件未导入[\s\S]*?游客搜索[\s\S]*?只读检测/,
  'the unimported state must explain plugin import, guest search, and read-only local detection'
);
assert.match(
  app,
  /function qishuiPluginStatusCopy\([^)]*\)\s*\{[\s\S]*?apiStatus[\s\S]*?case 'ready'[\s\S]*?游客搜索[\s\S]*?不代表已登录/,
  'the imported state must report the actual service status and distinguish guest capability from account login'
);
assert.match(
  app,
  /qishuiLoginSubmit\.disabled\s*=\s*!qishuiConfigured/,
  'OpenAPI authorization must remain disabled until the Qishui plugin is ready'
);
assert.match(
  app,
  /provider\.id === 'qishui'\s*\?\s*'打开汽水音乐插件与 OpenAPI 授权'/,
  'the Qishui account entry must not describe the removed QR login flow'
);

console.log('PASS check-qishui-login-entry');
