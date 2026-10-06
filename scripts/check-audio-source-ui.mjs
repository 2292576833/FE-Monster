import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('web/audio-source-manager.js', 'utf8');
const css = readFileSync('web/audio-source-manager.css', 'utf8');
const html = readFileSync('web/index.html', 'utf8');

assert.match(html, /id="audioSourceManagerButton"[^>]*aria-controls="audioSourceDialog"/,
  'the login dialog needs an always-visible, separate audio-source entry');
assert.match(html, /id="audioSourceDialog"[^>]*role="dialog"[^>]*aria-modal="true"/,
  'the manager must be exposed as a modal dialog');
assert.match(html, /id="audioSourceScriptInput"[^>]*accept="\.js(?:,[^"]*)?"/,
  'the custom source picker must be limited to JavaScript files');
assert.match(html, /id="audioSourceConsent"[^>]*type="checkbox"/,
  'custom source import needs an explicit consent checkbox');
assert.match(html, /<select id="audioSourceLibraryProvider"[^>]*aria-describedby="audioSourceLibraryStatus"/,
  'the source manager must expose an accessible provider selector');
assert.match(source, /getLibraryContext:\s*null[\s\S]*onLibraryProviderChanged:\s*null/,
  'library provider state must be injected through callbacks');
assert.match(html, /id="audioSourcePlatformInput"[^>]*accept="\.json,\.feapi,\.zip/,
  'the optional platform-package bridge needs its own trusted package picker');
assert.ok(html.indexOf('audio-source-manager.js?v=') < html.indexOf('app.js?v='),
  'the standalone manager must initialize before app.js wires callbacks');
assert.match(html, /audio-source-manager\.css\?v=/,
  'the source manager stylesheet needs an explicit cache key');
assert.match(css, /@media\s*\(max-width:\s*640px\)/,
  'the dialog must have a narrow-screen layout');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'dialog transitions must respect reduced motion');

assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/,
  'the source manager must never execute imported script code');
assert.doesNotMatch(source, /\.innerHTML\s*=/,
  'dynamic source metadata must be rendered with textContent');
assert.doesNotMatch(source, /activeProvider|FEID|getElementById\(['"]audio['"]\)|\.src\s*=|effects?\s*=/,
  'source management must not mutate provider, media, effects, or FE identity state');
assert.match(source, /window\.feAudioSources\s*=\s*Object\.freeze\(\{\s*open,\s*close,\s*configure,\s*getSelectedSource,\s*refresh\s*\}\)/,
  'the public integration surface must expose source capability state');

const exportNeedle = 'window.feAudioSources = Object.freeze({ open, close, configure, getSelectedSource, refresh });';
assert.ok(source.includes(exportNeedle), 'audio-source test export seam changed');
const instrumented = source.replace(exportNeedle, `${exportNeedle}
  window.__feAudioSourcesTest = Object.freeze({
    normalizeAllowedHosts, readScriptFile, requestJson, importSource, selectSource, removeSource, testSource, errorMessage,
    builtinStatus, customStatus, customCapabilityLines, operationDisabled, previewSourceUrl, importPreviewSource,
    updateSourceHosts, diagnosticHosts
  });`);

const requests = [];
const window = {
  fetch: async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, selected: 'builtin', runtimeReady: true, builtins: [], custom: [] };
      }
    };
  }
};
window.window = window;
const document = {
  readyState: 'loading',
  addEventListener() {}
};

vm.runInNewContext(instrumented, {
  window,
  document,
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  AbortController,
  DOMException,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  Set,
  Map,
  Promise,
  Error,
  TypeError
}, { filename: 'web/audio-source-manager.js' });

const test = window.__feAudioSourcesTest;
assert.deepEqual(
  Array.from(test.normalizeAllowedHosts('Music.Example.org\ncdn.example.org\nmusic.example.org')),
  ['music.example.org', 'cdn.example.org'],
  'hosts must be normalized, exact, and deduplicated'
);
assert.throws(() => test.normalizeAllowedHosts('https://music.example.org/path'), /域名/,
  'URLs and paths must not be accepted in the exact-host field');
assert.throws(() => test.normalizeAllowedHosts('*.example.org'), /通配符/,
  'wildcard host access must be rejected');
assert.throws(() => test.normalizeAllowedHosts('localhost'), /公网域名/,
  'local host names must be rejected');
assert.throws(() => test.normalizeAllowedHosts('resolver.internal'), /公网域名/,
  'obvious private DNS suffixes must be rejected');
assert.throws(() => test.normalizeAllowedHosts(Array.from({ length: 33 }, (_, i) => `h${i}.example.org`).join('\n')), /32/,
  'the UI must enforce the 32-host contract');

const utf8 = new TextEncoder().encode('globalThis.lx = { ok: true };');
const validScript = await test.readScriptFile({
  name: 'source.js',
  size: utf8.byteLength,
  async arrayBuffer() { return utf8.buffer; }
});
assert.match(validScript, /globalThis\.lx/, 'valid UTF-8 JavaScript should be read as text');
await assert.rejects(
  test.readScriptFile({ name: 'source.txt', size: 4, async arrayBuffer() { return new Uint8Array(4).buffer; } }),
  /\.js/
);
await assert.rejects(
  test.readScriptFile({ name: 'large.js', size: 512 * 1024 + 1, async arrayBuffer() { return new ArrayBuffer(0); } }),
  /512 KiB/
);
await assert.rejects(
  test.readScriptFile({ name: 'bad.js', size: 2, async arrayBuffer() { return Uint8Array.from([0xc3, 0x28]).buffer; } }),
  /UTF-8/
);

await test.importSource('/* fixture */', ['music.example.org']);
await test.selectSource('custom-1');
await test.removeSource('custom-1');
await test.testSource('custom-1', { provider: 'qq', song: { id: '42', name: 'Fixture' }, quality: '320k' });

assert.equal(requests.length, 4);
assert.deepEqual(
  requests.map(({ url }) => url),
  [
    '/api/audio-sources/import',
    '/api/audio-sources/select',
    '/api/audio-sources/remove',
    '/api/audio-sources/test'
  ]
);
assert.deepEqual(JSON.parse(requests[0].options.body), {
  script: '/* fixture */', allowedHosts: ['music.example.org'], consent: true
});
assert.deepEqual(JSON.parse(requests[1].options.body), { id: 'custom-1' });
assert.deepEqual(JSON.parse(requests[2].options.body), { id: 'custom-1' });
assert.deepEqual(JSON.parse(requests[3].options.body), {
  id: 'custom-1', provider: 'qq', song: { id: '42', name: 'Fixture' }, quality: '320k'
});
requests.forEach(({ options }) => {
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.headers['Content-Type'], 'application/json');
});

await test.previewSourceUrl('https://scripts.example.org/own.js');
await test.importPreviewSource('preview-token', ['music.example.org'], true);
await test.importSource('/* local fixture */', ['music.example.org'], undefined, true);
assert.equal(requests[4].url, '/api/audio-sources/preview-url');
assert.deepEqual(JSON.parse(requests[4].options.body), { url: 'https://scripts.example.org/own.js' });
assert.deepEqual(JSON.parse(requests[5].options.body), { token: 'preview-token', allowedHosts: ['music.example.org'], consent: true, apply: true });
assert.equal(JSON.parse(requests[6].options.body).apply, true);
await test.updateSourceHosts('source-1', ['init.example.org', 'resolver.example.org']);
assert.equal(requests[7].url, '/api/audio-sources/source-1/hosts');
assert.deepEqual(JSON.parse(requests[7].options.body), {
  allowedHosts: ['init.example.org', 'resolver.example.org'], consent: true
}, 'editing hosts must preserve the source and never select or reimport it');
assert.deepEqual(Array.from(test.diagnosticHosts([
  'Resolver.Example.org', 'resolver.example.org', 'https://secret.example.org/?key=hidden',
  '<img src=x>', '*.example.org', 'localhost', '127.0.0.1', 'one.example.org two.example.org', 'a'.repeat(5000)
])), ['resolver.example.org'], 'diagnostic suggestions contain only bounded exact public hostnames');
assert.equal(test.diagnosticHosts(Array.from({ length: 40 }, (_, i) => `h${i}.example.org`)).length, 32);
assert.equal(window.feAudioSources.getSelectedSource(), null, 'unknown backend selection must not pretend builtin was selected');

assert.equal(test.errorMessage({ error: '<img src=x onerror=alert(1)>' }), '<img src=x onerror=alert(1)>',
  'backend errors should remain plain text for textContent rendering');
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_HOSTS_INVALID' }),
  '允许域名无效：请填写公开的精确域名，且不要使用通配符、IP 或内网地址。');
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_RUNTIME_UNAVAILABLE' }), '隔离脚本运行环境未就绪。');
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_UNSUPPORTED' }), '此脚本使用了当前 LX 子集尚不支持的能力。');
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_BAD_JSON' }), '请求 JSON 无效或无法解析。');
for (const code of ['NETWORK_TIMEOUT', 'NETWORK_FAILED', 'REQUEST_UNSUPPORTED', 'RESPONSE_UNSUPPORTED', 'REDIRECT_BLOCKED', 'REJECTED']) {
  assert.doesNotMatch(test.errorMessage({ error: `AUDIO_SOURCE_${code}` }), /AUDIO_SOURCE|音源服务拒绝/,
    'network and protocol errors need specific localized messages');
}
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_INVALID_REQUEST' }), '请求 JSON 无效或字段格式不正确。');
assert.equal(test.errorMessage({ error: 'AUDIO_SOURCE_NEW_CODE' }), '音源服务拒绝了该操作，请检查输入后重试。',
  'unknown fixed backend codes must not be exposed as the primary user message');

assert.equal(test.builtinStatus({ status: 'configured' }), '配置已保存；尚未确认服务就绪');
assert.equal(test.builtinStatus({ status: 'configured', detail: 'configured' }), '配置已保存；尚未确认服务就绪',
  'recognized backend status must take priority over raw English detail');
assert.equal(test.builtinStatus({ status: 'bundled-upgraded' }), '已更新内置版本；正在等待服务检查');
assert.equal(test.builtinStatus({ status: 'starting' }), '服务正在启动');
assert.equal(test.builtinStatus({ status: 'startup-timeout' }), '服务启动超时');
assert.equal(test.builtinStatus({ status: 'unreachable' }), '服务无法连接');
assert.equal(test.builtinStatus({ status: 'ready' }), '服务就绪，播放取决于授权');
assert.equal(test.customStatus({ status: 'initialized-unverified' }), '初始化通过，尚未检测歌曲');
const realCustomShape = {
  supportedProviders: ['netease'],
  capabilities: { wy: { qualitys: ['128k'], actions: ['musicUrl'] } },
  allowedHosts: ['resolver.example.org', 'audio.example.org'],
  status: 'initialized-unverified'
};
assert.deepEqual(Array.from(test.customCapabilityLines(realCustomShape)), ['网易云：播放解析 · 128k'],
  'the real backend capability object must render as a localized provider summary');
assert.match(source, /item\.allowedHosts[\s\S]*?联网域名：/,
  'custom cards must show the backend-sanitized exact host allowlist');

assert.equal(test.operationDisabled({
  busy: false, backendAvailable: true, runtimeReady: false, selected: false,
  customOnly: false, testOnly: false, hasCurrentSong: true
}), false, 'removal must remain available when the script runtime is unavailable');
assert.equal(test.operationDisabled({
  busy: false, backendAvailable: true, runtimeReady: false, selected: false,
  customOnly: true, testOnly: false, hasCurrentSong: true
}), true, 'selecting a custom runtime must remain disabled while that runtime is unavailable');
assert.equal(test.operationDisabled({
  busy: false, backendAvailable: true, runtimeReady: true, selected: true,
  customOnly: true, testOnly: false, hasCurrentSong: true
}), false, 'the selected source remains clickable to browse its library');
assert.match(source, /正在读取音源配置|正在导入|正在切换|正在移除|正在检测/,
  'all long-running operations need explicit loading states');
assert.match(source, /本地音源服务未连接/,
  'a missing backend must be described truthfully');
assert.match(source, /不会自动切换|仍需手动选择/,
  'successful import must explicitly avoid silent selection');
assert.match(source, /仅完成解析检测|不代表已实际播放/,
  'the test result must not claim audible playback');
assert.match(source, /callbacks\.importPlatformPackage\(file\)/,
  'the injected platform importer must receive the selected package file');
assert.match(html, /带有效 hash 的酷狗歌曲[\s\S]*?并非所有 LX 脚本都兼容[\s\S]*?已支持 AES[\s\S]*?RSA.*暂不支持/,
  'the import UI must state the supported LX subset and important incompatibilities');
assert.doesNotMatch(source, /已可用/,
  'built-in status must not overclaim universal playback availability');

window.fetch = async () => ({ ok: false, status: 404, async json() { return { ok: false, error: 'not found' }; } });
await assert.rejects(test.requestJson('', undefined), /当前后台版本.*音源.*更新.*重启/,
  'missing root endpoint must explain old backend instead of raw not found');
window.fetch = async () => ({ ok: false, status: 404, async json() { return { ok: false, error: 'AUDIO_SOURCE_NOT_FOUND' }; } });
for (const action of [
  () => test.previewSourceUrl('https://scripts.example.org/own.js'),
  () => test.importPreviewSource('preview-token', ['audio.example.org'], true)
]) {
  await assert.rejects(action(), error => error.code === 'AUDIO_SOURCE_BACKEND_OUTDATED'
    && /当前后台版本.*音源链接导入.*更新.*重启/.test(error.message),
  'legacy 404s on source-independent URL import endpoints must explain the missing backend feature');
}
window.fetch = async () => ({ ok: false, status: 404, async json() { throw new Error('HTML 404 response'); } });
await assert.rejects(test.previewSourceUrl('https://scripts.example.org/own.js'), /当前后台版本.*音源链接导入.*更新.*重启/,
  'a missing URL preview route must be identified even when the backend returns HTML');
window.fetch = async () => ({ ok: false, status: 404, async json() { return { ok: false, error: 'AUDIO_SOURCE_NOT_FOUND' }; } });
for (const action of [
  () => test.selectSource('removed-source'),
  () => test.removeSource('removed-source'),
  () => test.testSource('removed-source', { provider: 'qq', song: { id: '42' } })
]) {
  await assert.rejects(action(), /该音源不存在或已被移除/,
    'missing individual sources must not be mistaken for a missing endpoint');
}
window.fetch = async () => ({ ok: false, status: 400, async json() { return { ok: false, error: 'AUDIO_SOURCE_DOWNLOAD_FAILED' }; } });
await assert.rejects(test.previewSourceUrl('https://scripts.example.org/missing.js'), /未能下载脚本/,
  'a supported preview endpoint must retain its actual script download error');
window.fetch = async () => ({ ok: false, status: 400, async json() { return {
  ok: false, error: 'AUDIO_SOURCE_HOST_NOT_ALLOWED', requiredHosts: ['resolver.example.org', 'https://private.example.org/?token=secret'],
  message: 'https://private.example.org/?token=secret'
}; } });
await assert.rejects(test.testSource('source-1', { provider: 'qq', song: { id: '42' } }), error =>
  error.code === 'AUDIO_SOURCE_HOST_NOT_ALLOWED'
  && JSON.stringify(error.requiredHosts) === JSON.stringify(['resolver.example.org'])
  && !/private|secret/.test(error.message), 'request failures retain safe host suggestions without upstream details');
window.fetch = async () => ({ ok: false, status: 400, async json() { return { ok: false, error: 'https://private.example.org/?token=secret' }; } });
await assert.rejects(test.testSource('source-1', { provider: 'qq', song: { id: '42' } }), error =>
  !/private|secret|https:/.test(error.message), 'unstructured upstream errors must not leak URLs or secrets');
window.fetch = async () => ({ ok: false, status: 400, async json() { return { ok: false, error: 'AUDIO_SOURCE_PREVIEW_EXPIRED' }; } });
await assert.rejects(test.importPreviewSource('expired-token', ['audio.example.org'], true), /此预览已过期或取消/,
  'expired previews must not be described as an outdated backend');
assert.match(html, /id="audioSourceReconnect"[^>]*>重新连接<\/button>/,
  'a failed connection must have an explicit retry action');
assert.match(source, /dom\.reconnect\.addEventListener\('click', refresh\)/,
  'reconnect must only reload via GET, never replay an import or selection');
assert.match(source, /dom\.reconnect\.disabled = busy/,
  'reconnect remains usable while backend is unavailable, but not while busy');

console.log('Audio source manager UI PASS');
