import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = {
  buildGradle: path.join(root, 'android', 'app', 'build.gradle'),
  mobileCss: path.join(root, 'android', 'app', 'src', 'main', 'androidWeb', 'fe-monster-mobile.css'),
  mobileRuntime: path.join(root, 'android', 'app', 'src', 'main', 'androidWeb', 'fe-monster-mobile-runtime.js'),
  nodeGateway: path.join(root, 'android', 'app', 'src', 'main', 'nodeGateway', 'main.cjs'),
  mainActivity: path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'femonster', 'mobile', 'MainActivity.java'),
  indexHtml: path.join(root, 'web', 'index.html'),
  qishuiAdapter: path.join(root, 'android', 'app', 'src', 'main', 'nodeGateway', 'providers', 'qishui.cjs')
};

const source = Object.fromEntries(
  Object.entries(files)
    .filter(([name]) => name !== 'qishuiAdapter')
    .map(([name, file]) => [name, readFileSync(file, 'utf8')])
);

const checks = {
  qishuiAdapterRemoved: !existsSync(files.qishuiAdapter),
  buildDoesNotPackageQishui: !/qishuiAdapter|providers[\\/]+qishui\.cjs/i.test(source.buildGradle),
  gatewayDoesNotRegisterOrStartQishui:
    !/\bQISHUI_PORT\b|startQishui|proxyQishui|providers[\\/]+qishui\.cjs|id:\s*["']qishui["']/i.test(source.nodeGateway)
    && !/netease\|qq\|kugou\|qishui/.test(source.nodeGateway),
  mobileRuntimeExposesOnlySupportedProviders:
    !/qishui:\s*['"]\\u6c7d\\u6c34|phoneLogin:\s*id\s*===\s*['"]qishui|netease\|qq\|kugou\|qishui/.test(source.mobileRuntime),
  androidQishuiUiRemoved: !source.indexHtml.includes('id="qishuiPlaybackSourceSwitch"'),
  nativeGatewayDoesNotRouteQishui:
    !/--qishui-port|netease\|qq\|kugou\|qishui/.test(source.mainActivity),
  webBridgeCannotLaunchCustomAppSchemes:
    source.mainActivity.includes('isAllowedBridgeExternalUri(uri)')
    && source.mainActivity.includes('"https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)')
    && !source.mainActivity.includes('Intent.URI_INTENT_SCHEME')
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  ok: failures.length === 0,
  providers: ['netease', 'qq', 'kugou'],
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
