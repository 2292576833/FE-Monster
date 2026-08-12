import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('web/pixel-login-adventure.js', 'utf8');
const css = readFileSync('web/pixel-adventure.css', 'utf8');
const appSource = readFileSync('web/app.js', 'utf8');
const indexSource = readFileSync('web/index.html', 'utf8');
const winFormsSource = readFileSync('native/windows/winforms/FeMonsterForm.cs', 'utf8');
const exportTail = `    characterPreviewDataUrl\n  });`;

const importerStart = appSource.indexOf('async function importMusicApiFile(file, options = {})');
const importerEnd = appSource.indexOf('\nfunction providerPath(', importerStart);
assert.ok(importerStart >= 0 && importerEnd > importerStart, 'music API importer seam changed');
const importerSource = appSource.slice(importerStart, importerEnd);
assert.match(importerSource, /options\.inspection\s*\|\|\s*await window\.feMusicApiPackageClient\.inspect\(file\)/,
  'the app importer must reuse or perform client-side package recognition before local installation');
assert.match(importerSource, /assertMusicApiApplyMatches\(inspection\.providers, imported\)/,
  'the local runtime response may confirm but must never choose the client platform');
assert.match(importerSource, /const isZip = inspection\.packageType === 'zip';/,
  'ZIP trust and installation mode must follow client inspection, not a MIME guess');
assert.match(importerSource, /'Content-Type': isZip \? 'application\/zip' : 'application\/json'/,
  'the local runtime must receive a content type canonicalized by client inspection');
assert.match(importerSource, /window\.confirm\([^)]*ZIP API 包/s,
  'ZIP packages must keep their explicit local-code trust confirmation');
assert.match(importerSource, /return \{ \.\.\.payload, clientInspection: inspection \};/,
  'the importer must return the client-recognized package result to the game');
assert.match(importerSource, /return \{ ok: false, error: message, cancelled: true \};/,
  'cancelling ZIP trust must preserve its structured reason across the game bridge');
assert.match(importerSource, /catch \(error\)[\s\S]*?return \{ ok: false, error: message \};/,
  'backend import failures must preserve their structured reason across the game bridge');
assert.match(importerSource, /timeoutMs:\s*isZip\s*\?\s*120_000\s*:\s*30_000/,
  'a stalled local importer must not lock the login scene forever');
assert.match(appSource, /window\.feMusicApiImportFile\s*=\s*importMusicApiFile;/,
  'the login game needs the existing trusted importer bridge');
assert.match(winFormsSource, /webView\.AllowExternalDrop\s*=\s*true;/,
  'the Windows desktop host must allow files to reach the WebView drop target');
assert.match(indexSource, /pixel-adventure\.css\?v=[^"\s]+/,
  'the drop overlay stylesheet must bypass stale desktop cache');
assert.match(indexSource, /music-api-package-client\.js\?v=[^"\s]+/,
  'the pure client package inspector must be loaded by the desktop page');
assert.ok(
  indexSource.indexOf('music-api-package-client.js?v=')
    < indexSource.indexOf('app.js?v='),
  'client package recognition must load before the app importer'
);
assert.match(indexSource, /app\.js\?v=[^"\s]+/,
  'the importer bridge must bypass stale desktop cache');
assert.match(indexSource, /pixel-login-adventure\.js\?v=[^"\s]+/,
  'the game drop handler must bypass stale desktop cache');

assert.ok(source.includes(exportTail), 'pixel login export seam changed');
const instrumented = source.replace(exportTail, `    characterPreviewDataUrl,
    __test: {
      game,
      dom,
      handleApiPackageDrop
    }
  });`);

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(...values) {
    values.forEach((value) => this.values.add(value));
  }
  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }
  contains(value) {
    return this.values.has(value);
  }
}

const importedFiles = [];
const inspectedFiles = [];
const importerOptions = [];
let nextInspection = {
  packageType: 'feapi',
  providers: [{ id: 'qq', label: 'QQ音乐（客户端识别）' }]
};
const window = {
  feMusicApiPackageClient: {
    inspect: async (file) => {
      inspectedFiles.push(file);
      return nextInspection;
    }
  },
  feMusicApiImportFile: async (file, options) => {
    importedFiles.push(file);
    importerOptions.push(options);
    return {
      ok: true,
      importedProviders: [{ id: 'qq', label: '服务端仅确认' }]
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
  Math,
  Date,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  RegExp,
  Map,
  Set,
  Uint8Array,
  Uint32Array,
  performance: { now: () => 0 }
}, { filename: 'web/pixel-login-adventure.js' });

const test = window.fePixelLogin.__test;
const sceneClasses = new ClassList();
test.dom.scene = { classList: sceneClasses };
test.dom.status = { textContent: '' };
test.game.open = true;
test.game.drawerOpen = false;
test.game.characterEditorOpen = false;
test.game.transition = { active: false };
test.game.layout = {
  kind: 'surface',
  minX: 0,
  width: 1200,
  segments: [{ start: 0, end: 1200, y: 270 }],
  blocks: [
    { provider: 'netease', x: 150, y: 184, width: 34, height: 34, bump: 0 },
    { provider: 'qq', x: 420, y: 190, width: 34, height: 34, bump: 0 },
    { provider: 'kugou', x: 690, y: 178, width: 34, height: 34, bump: 0 },
    { provider: 'qishui', x: 960, y: 196, width: 34, height: 34, bump: 0 }
  ]
};

let fileTextRead = false;
const file = {
  name: 'qq.feapi',
  type: 'application/json',
  size: 1024,
  async text() {
    fileTextRead = true;
    throw new Error('the game layer must not parse or execute the package');
  }
};
let prevented = false;
let stopped = false;
const geometryBefore = test.game.layout.blocks.map(({ x, y, width, height }) => ({ x, y, width, height }));

const result = await test.handleApiPackageDrop({
  preventDefault() { prevented = true; },
  stopPropagation() { stopped = true; },
  dataTransfer: { files: [file], types: ['Files'], dropEffect: '' }
});

assert.equal(result.ok, true, 'a valid API package should hot-apply to the game scene');
assert.equal(prevented, true, 'dropping a file must not navigate the WebView');
assert.equal(stopped, true, 'the API package drop must stay inside the login scene');
assert.deepEqual(inspectedFiles, [file], 'the client must identify the package before local service import');
assert.deepEqual(importedFiles, [file], 'the existing trusted API importer must receive the original file');
assert.equal(importerOptions[0]?.inspection?.providers?.[0]?.id, 'qq',
  'the importer must reuse the client inspection instead of identifying the platform again');
assert.equal(fileTextRead, false, 'the game layer must not parse ZIP/JSON service code itself');
assert.deepEqual(
  test.game.layout.blocks.map(({ x, y, width, height }) => ({ x, y, width, height })),
  geometryBefore,
  'hot apply must retain the existing reachable platform slots'
);
assert.ok(test.game.layout.blocks.find((block) => block.provider === 'qq').spawn > 0,
  'the imported provider block must receive a birth animation');
assert.equal(test.game.layout.blocks.find((block) => block.provider === 'netease').spawn || 0, 0,
  'providers not returned by the importer must remain untouched');
assert.match(test.dom.status.textContent, /客户端识别/,
  'the generated platform label must come from client recognition, not the server response');
assert.equal(sceneClasses.contains('is-api-package-importing'), false, 'busy feedback must clear after import');
assert.match(css, /is-api-package-drop-target/, 'the scene needs visible drag-over feedback');
assert.match(css, /正在客户端识别并应用 API 包/,
  'the busy overlay must make client-side recognition explicit');

const resetAnimations = () => {
  test.game.layout.blocks.forEach((block) => {
    block.spawn = 0;
    block.bump = 0;
  });
};
const animationState = () => test.game.layout.blocks.map((block) => ({
  provider: block.provider,
  spawn: block.spawn || 0,
  bump: block.bump || 0,
  x: block.x,
  y: block.y,
  width: block.width,
  height: block.height
}));
const drop = (nextFile) => test.handleApiPackageDrop({
  preventDefault() {},
  stopPropagation() {},
  dataTransfer: { files: [nextFile], types: ['Files'], dropEffect: '' }
});

resetAnimations();
const importCountBeforeOversize = importedFiles.length;
const beforeOversize = animationState();
const oversized = await drop({
  name: 'too-large.feapi',
  type: 'application/json',
  size: 64 * 1024 + 1
});
assert.equal(oversized.ok, false, 'an oversized declarative API package must be rejected');
assert.equal(importedFiles.length, importCountBeforeOversize, 'oversized input must not reach the importer');
assert.deepEqual(animationState(), beforeOversize, 'rejected size validation must not mutate the scene');
assert.match(test.dom.status.textContent, /64 KB/, 'size rejection needs actionable feedback');

resetAnimations();
const beforeMalformedResult = animationState();
window.feMusicApiImportFile = async () => ({
  ok: true,
  importedProviders: [{ id: 'qq' }, { id: 'not-a-provider' }]
});
const malformedResult = await drop({
  name: 'unknown-provider.json',
  type: 'application/json',
  size: 512
});
assert.equal(malformedResult.ok, false, 'unknown provider results must be rejected');
assert.deepEqual(animationState(), beforeMalformedResult,
  'an invalid importer response must not partially regenerate a valid provider block');
assert.match(test.dom.status.textContent, /未知|重复/, 'invalid provider feedback must explain the contract');

resetAnimations();
const beforeMismatchedReceipt = animationState();
nextInspection = {
  packageType: 'feapi',
  providers: [{ id: 'qq', label: 'QQ音乐（客户端识别）' }]
};
window.feMusicApiImportFile = async () => ({
  ok: true,
  importedProviders: [{ id: 'netease', label: '服务端不同平台' }]
});
const mismatchedReceipt = await drop({
  name: 'client-qq.feapi',
  type: 'application/json',
  size: 768
});
assert.equal(mismatchedReceipt.ok, false,
  'a local runtime receipt must not override the provider recognized by the client');
assert.deepEqual(animationState(), beforeMismatchedReceipt,
  'a mismatched runtime receipt must not generate any platform block');
assert.match(test.dom.status.textContent, /客户端识别不一致/,
  'a mismatched runtime receipt needs an explicit integrity error');

resetAnimations();
const beforeUnsafeSlot = animationState();
test.game.layout.blocks.find((block) => block.provider === 'qq').x = Number.NaN;
const unsafeState = animationState();
nextInspection = {
  packageType: 'feapi',
  providers: [{ id: 'netease' }, { id: 'qq' }]
};
window.feMusicApiImportFile = async () => ({
  ok: true,
  importedProviders: [{ id: 'netease' }, { id: 'qq' }]
});
const unsafeSlotResult = await drop({
  name: 'two-platforms.feapi',
  type: 'application/json',
  size: 2048
});
assert.equal(unsafeSlotResult.ok, false, 'non-finite platform geometry must fail safe-slot validation');
assert.deepEqual(animationState(), unsafeState,
  'safe-slot validation must be transactional when a later provider is invalid');
assert.equal(animationState()[0].spawn, beforeUnsafeSlot[0].spawn,
  'an earlier valid platform must not animate after a later slot fails validation');
test.game.layout.blocks.find((block) => block.provider === 'qq').x = 420;

resetAnimations();
let zipTextRead = false;
const zipFile = {
  name: 'trusted-provider.zip',
  type: 'application/zip',
  size: 4096,
  async text() {
    zipTextRead = true;
    throw new Error('ZIP contents belong to the existing trusted importer');
  }
};
nextInspection = {
  packageType: 'zip',
  providers: [{ id: 'netease', label: '网易云音乐（客户端识别）' }]
};
window.feMusicApiImportFile = async (nextFile) => ({
  ok: nextFile === zipFile,
  importedProviders: [{ id: 'netease', label: '网易云音乐' }]
});
const zipResult = await drop(zipFile);
assert.equal(zipResult.ok, true, 'ZIP packages must be delegated to the existing trust-confirming importer');
assert.equal(zipTextRead, false, 'the login game must never inspect or execute ZIP entries');
assert.ok(test.game.layout.blocks.find((block) => block.provider === 'netease').spawn > 0);

resetAnimations();
let unsupportedImporterCalls = 0;
const beforeUnsupported = animationState();
window.feMusicApiImportFile = async () => {
  unsupportedImporterCalls += 1;
  return { ok: true, importedProviders: [{ id: 'qq' }] };
};
const unsupportedResult = await drop({
  name: 'not-an-api-package.txt',
  type: 'text/plain',
  size: 128
});
assert.equal(unsupportedResult.ok, false, 'unsupported file extensions must be rejected');
assert.equal(unsupportedImporterCalls, 0, 'unsupported files must never reach the API importer');
assert.deepEqual(animationState(), beforeUnsupported, 'unsupported input must leave every block untouched');
assert.match(test.dom.status.textContent, /JSON|FEAPI|ZIP/, 'unsupported input feedback must list accepted formats');

resetAnimations();
const beforeFailedImport = animationState();
window.feMusicApiImportFile = async () => {
  throw new Error('server rejected package');
};
const failedImportResult = await drop({
  name: 'rejected.feapi',
  type: 'application/json',
  size: 640
});
assert.equal(failedImportResult.ok, false, 'an importer failure must be reported without hot applying');
assert.deepEqual(animationState(), beforeFailedImport, 'a failed import must preserve the current scene');
assert.match(test.dom.status.textContent, /server rejected package/, 'the importer failure reason must reach live status');

assert.match(css, /is-api-package-importing[\s\S]*?pixel-api-package-pulse/,
  'importing feedback must remain visible while the trusted importer is running');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?is-api-package-importing[\s\S]*?animation:\s*none/,
  'the drop feedback animation must respect reduced motion');

console.log('Pixel login API package drop PASS');
