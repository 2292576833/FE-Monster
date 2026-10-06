import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor() { this.events = {}; this.dataset = {}; this.children = []; this.hidden = false; this.disabled = false; this.checked = false; this.value = ''; this.textContent = ''; this.attrs = {}; }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  async fire(name, values = {}) { for (const callback of this.events[name] || []) await callback({ preventDefault() {}, stopPropagation() {}, ...values }); }
  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  focus() {}
}
const ids = new Map();
const node = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
node('audioSourceApply').checked = true;
node('neteaseLoginDialog').hidden = true;
const payload = { ok: true, selected: 'builtin', runtimeReady: true, builtins: [], custom: [] };
const preview = { token: 'first-token', name: '<img src=x onerror=alert(1)>', version: '1', author: 'Fixture', bytes: 100, sourceHost: 'scripts.example.org', supportedProviders: ['netease'], capabilities: { wy: { actions: ['musicUrl'], qualitys: ['128k'] } } };
const requests = [];
let responder = async () => ({ ok: true, status: 200, json: async () => payload });
const window = {
  fetch: async (url, options = {}) => { requests.push({ url, options }); return responder(url, options); },
  confirm: () => true
};
const document = { readyState: 'complete', getElementById: node, createElement: tagName => Object.assign(new Element(), { tagName: tagName.toUpperCase() }), activeElement: new Element() };
vm.runInNewContext(readFileSync('web/audio-source-manager.js', 'utf8'), { window, document, TextDecoder, TextEncoder, Uint8Array, AbortController, console });
const manager = window.feAudioSources;
const changes = [];
manager.configure({ onSelectionChanged: source => changes.push(source) });
manager.open();
await new Promise(resolve => setImmediate(resolve));
assert.equal(manager.getSelectedSource().id, 'builtin');
assert.ok(changes.length > 0);
const success = value => ({ ok: true, status: 200, json: async () => value });
const responseError = value => ({ ok: false, status: 400, json: async () => ({ ok: false, error: value }) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const previewText = () => node('audioSourcePreview').children.map(child => child.textContent).join('\n');

// Older backends can list sources while lacking the newer URL-import routes.
responder = async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: 'AUDIO_SOURCE_NOT_FOUND' }) });
node('audioSourceUrl').value = 'https://scripts.example.org/one.js';
await node('audioSourceUrlRead').fire('click');
assert.match(node('audioSourceLiveStatus').textContent, /当前后台版本.*音源链接导入.*更新.*重启/);
assert.equal(node('audioSourcePreview').hidden, true);
assert.equal(node('audioSourceImportSubmit').disabled, true);
assert.equal(node('audioSourceUrlRead').disabled, false, 'the failed preview leaves the controls usable');
assert.equal(manager.getSelectedSource().id, 'builtin', 'missing preview support must preserve the current selection');

// Network-dependent initialization is staged for explicit consent, with capabilities still unknown.
const initializationPreview = {
  ...preview, token: 'initialization-token', initializationRequired: true, status: 'awaiting-network-consent',
  requiredHosts: ['www.hibai.cn', '<img src=x onerror=alert(1)>', 'https://private.example.org/path?secret=hidden'],
  supportedProviders: [], capabilities: {}
};
node('audioSourceHosts').value = 'existing.example.org';
node('audioSourceApply').checked = false;
node('audioSourceConsent').checked = true;
const beforeInitializationPreview = requests.length;
responder = async () => success({ ok: true, preview: initializationPreview });
await node('audioSourceUrlRead').fire('click');
assert.match(previewText(), /脚本需要联网初始化；支持的平台和音质将在确认导入后检测/);
assert.match(previewText(), /需确认的联网域名：www\.hibai\.cn/);
assert.match(previewText(), /复制.*允许联网/);
assert.doesNotMatch(previewText(), /未声明支持的平台|预览只声明播放解析能力|private\.example|secret=hidden/);
assert.match(node('audioSourceLiveStatus').textContent, /脚本需要联网初始化/);
assert.equal(node('audioSourceLiveStatus').dataset.kind, 'warning');
assert.equal(node('audioSourceHosts').value, 'existing.example.org', 'preview must preserve user-entered hosts');
assert.equal(node('audioSourceApply').checked, false, 'preview must preserve the explicit import-only choice');
assert.equal(node('audioSourceConsent').checked, false, 'a new preview requires fresh user consent');
assert.equal(requests.length, beforeInitializationPreview + 1, 'preview must not automatically import, apply or grant access');
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { url: 'https://scripts.example.org/one.js' });
const beforeInitializationConsent = requests.length;
await node('audioSourceImportForm').fire('submit');
assert.equal(requests.length, beforeInitializationConsent, 'pending initialization must still require explicit consent');
node('audioSourceConsent').checked = true;
responder = async () => ({ ok: false, status: 400, json: async () => ({
  ok: false, error: 'AUDIO_SOURCE_INIT_NETWORK_REQUIRED',
  message: 'Error: https://private.example.org/path?secret=hidden', stack: 'at privateScript:1:1'
}) });
await node('audioSourceImportForm').fire('submit');
assert.match(node('audioSourceLiveStatus').textContent, /初始化.*联网.*允许.*域名/);
assert.doesNotMatch(node('audioSourceLiveStatus').textContent, /private|secret|https:|at /);
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  token: 'initialization-token', allowedHosts: ['existing.example.org'], consent: true, apply: false
});
assert.equal(node('audioSourcePreview').hidden, false, 'initialization error keeps the staged preview reviewable');
assert.equal(node('audioSourceImportSubmit').disabled, false, 'initialization error permits retry');
assert.equal(node('audioSourceHosts').value, 'existing.example.org');
assert.equal(manager.getSelectedSource().id, 'builtin');
responder = async () => responseError('AUDIO_SOURCE_PREVIEW_EXPIRED');
await node('audioSourceImportForm').fire('submit');
assert.match(node('audioSourceLiveStatus').textContent, /预览已过期或取消/);
assert.equal(node('audioSourceUrlRead').disabled, false, 'expired preview permits a fresh read');
assert.equal(node('audioSourceHosts').value, 'existing.example.org');
await node('audioSourceCancelPreview').fire('click');
assert.equal(node('audioSourcePreview').hidden, true);
assert.equal(node('audioSourceConsent').checked, false);
assert.equal(node('audioSourceHosts').value, 'existing.example.org');
assert.equal(node('audioSourceApply').checked, false);
node('audioSourceApply').checked = true;

// Cancelling an in-flight preview invalidates even a response whose transport ignored abort.
let pending = deferred();
responder = () => pending.promise;
node('audioSourceUrl').value = 'https://scripts.example.org/one.js';
const cancelled = node('audioSourceUrlRead').fire('click');
await node('audioSourceCancelPreview').fire('click');
pending.resolve(success({ ok: true, preview }));
await cancelled;
assert.equal(node('audioSourcePreview').hidden, true);
assert.equal(node('audioSourceImportSubmit').disabled, true);
assert.equal(manager.getSelectedSource().id, 'builtin');

// A late failure from an earlier preview must not hide a newer successful preview.
pending = deferred();
responder = () => pending.promise;
const obsolete = node('audioSourceUrlRead').fire('click');
await node('audioSourceCancelPreview').fire('click');
responder = async () => success({ ok: true, preview: { ...preview, token: 'second-token' } });
await node('audioSourceUrlRead').fire('click');
pending.resolve(responseError('AUDIO_SOURCE_SCRIPT_FAILED'));
await obsolete;
assert.equal(node('audioSourcePreview').hidden, false);
assert.equal(node('audioSourcePreview').children[0].textContent, preview.name, 'metadata is text, not executable DOM');
assert.match(node('audioSourceLiveStatus').textContent, /预览已就绪/);
assert.equal(node('audioSourceConsent').checked, false);

// A consent failure never sends an import; after consent the staged token and explicit apply are sent once.
const beforeConsent = requests.length;
await node('audioSourceImportForm').fire('submit');
assert.equal(requests.length, beforeConsent);
node('audioSourceHosts').value = 'audio.example.org';
node('audioSourceConsent').checked = true;
responder = async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: 'AUDIO_SOURCE_NOT_FOUND' }) });
await node('audioSourceImportForm').fire('submit');
assert.match(node('audioSourceLiveStatus').textContent, /当前后台版本.*音源链接导入.*更新.*重启/);
assert.equal(node('audioSourcePreview').hidden, false, 'a missing import route leaves the staged preview reviewable');
assert.equal(manager.getSelectedSource().id, 'builtin', 'missing import support must preserve the current selection');
pending = deferred();
responder = () => pending.promise;
const importing = node('audioSourceImportForm').fire('submit');
assert.equal(node('audioSourceCancelPreview').disabled, true, 'cancel preview must not misrepresent a started persistent mutation as cancelled');
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { token: 'second-token', allowedHosts: ['audio.example.org'], consent: true, apply: true });
pending.resolve(responseError('AUDIO_SOURCE_STORAGE'));
await importing;
assert.equal(manager.getSelectedSource().id, 'builtin', 'failed atomic import preserves prior UI selection');
assert.equal(node('audioSourcePreview').hidden, false, 'failed import remains reviewable and retryable');

const imported = { ...payload, selected: 'source-1', custom: [{ ...preview, id: 'source-1', allowedHosts: ['audio.example.org'] }] };
responder = async () => success(imported);
await node('audioSourceImportForm').fire('submit');
assert.equal(manager.getSelectedSource().id, 'source-1');
assert.deepEqual(Array.from(manager.getSelectedSource().supportedProviders), ['netease']);
assert.equal(changes.at(-1).id, 'source-1');
assert.equal(node('audioSourcePreview').hidden, true);
assert.equal(node('audioSourceConsent').checked, false);
let browsed;
manager.configure({ onBrowseRequested: value => { browsed = value; } });
await node('audioSourceBrowse').fire('click');
assert.equal(node('audioSourceDialog').hidden, true);
assert.equal(browsed.id, 'source-1');
await manager.refresh();
assert.equal(manager.getSelectedSource().id, 'source-1', 'background refresh works while manager is closed');

// Editing an existing source never borrows import consent and cannot replay a save.
manager.open();
await new Promise(resolve => setImmediate(resolve));
const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
const findInCards = predicate => descendants(node('audioSourceCustomList')).find(predicate);
const openHostSettings = async () => findInCards(element => element.textContent === '联网设置' && element.tagName === 'BUTTON').fire('click');
node('audioSourceConsent').checked = true;
await openHostSettings();
let editor = findInCards(element => element.className === 'audio-source-host-editor');
let editorHosts = descendants(editor).find(element => element.tagName === 'TEXTAREA');
let editorConsent = descendants(editor).find(element => element.tagName === 'INPUT');
assert.equal(editorHosts.value, 'audio.example.org');
assert.equal(editorConsent.checked, false, 'import consent cannot authorize editing another network scope');
const beforeHostConsent = requests.length;
await editor.fire('submit');
assert.equal(requests.length, beforeHostConsent);
editorHosts.value = 'audio.example.org\nresolver.example.org';
await editorHosts.fire('input');
editorConsent.checked = true;await editorConsent.fire('change');
pending = deferred();responder = () => pending.promise;
const savingHosts = editor.fire('submit');
const beforeRepeatedSave = requests.length;
await editor.fire('submit');
assert.equal(requests.length, beforeRepeatedSave, 'a pending host save must not be submitted twice');
assert.equal(requests.at(-1).url, '/api/audio-sources/source-1/hosts');
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { allowedHosts: ['audio.example.org', 'resolver.example.org'], consent: true });
manager.close();
pending.resolve(success({ ...imported, selected: 'builtin' }));
await savingHosts;
assert.equal(manager.getSelectedSource().id, 'source-1', 'late responses after close cannot replace the displayed selection');
responder = async () => success(imported);
manager.open();await new Promise(resolve => setImmediate(resolve));
assert.equal(findInCards(element => element.className === 'audio-source-host-editor'), undefined, 'closing discards the permission draft');
await openHostSettings();
editor = findInCards(element => element.className === 'audio-source-host-editor');
editorHosts = descendants(editor).find(element => element.tagName === 'TEXTAREA');
editorConsent = descendants(editor).find(element => element.tagName === 'INPUT');
assert.equal(editorHosts.value, 'audio.example.org', 'reopening is based on saved permissions');
assert.equal(editorConsent.checked, false, 'reopening requires fresh consent');
manager.close();

// A local File.arrayBuffer completion after closing must not leave an importable script.
manager.open();
await new Promise(resolve => setImmediate(resolve));
pending = deferred();
node('audioSourceScriptInput').files = [{ name: 'own.js', size: 10, arrayBuffer: () => pending.promise }];
const fileRead = node('audioSourceScriptInput').fire('change');
manager.close();
pending.resolve(new TextEncoder().encode('// fixture').buffer);
await fileRead;
assert.equal(node('audioSourceImportSubmit').disabled, true);
console.log('Audio source URL UI PASS: pending network initialization, explicit host consent, existing-host consent isolation/double-submit/closed response, fixed errors, expiry/retry, cancel, stale results/errors, atomic failure, callbacks, closed/file reads');
