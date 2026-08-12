import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync('web/index.html', 'utf8');
const css = readFileSync('web/pixel-adventure.css', 'utf8');
const source = readFileSync('web/pixel-login-adventure.js', 'utf8');
const exportNeedle = `    characterPreviewDataUrl\n  });`;

for (const id of [
  'pixelCharacterEditorOpen',
  'pixelCharacterEditor',
  'pixelCharacterEditorCanvas',
  'pixelCharacterPreviewCanvas',
  'pixelCharacterPalette',
  'pixelCharacterColorInput',
  'pixelCharacterUndo',
  'pixelCharacterClear',
  'pixelCharacterReset',
  'pixelCharacterCancel',
  'pixelCharacterSave'
]) {
  assert.ok(html.includes(`id="${id}"`), `${id} is missing from the login character editor`);
}
for (const tool of ['pencil', 'eraser', 'fill']) {
  assert.ok(html.includes(`data-character-tool="${tool}"`), `${tool} tool is missing`);
}
assert.match(css, /#pixelCharacterEditorCanvas\s*\{[^}]*image-rendering:\s*pixelated;[^}]*touch-action:\s*none;/s,
  'the editor canvas must stay crisp and own pointer gestures');
assert.match(css, /\.pixel-character-palette__chip\s*\{[^}]*background:\s*var\(--character-color,\s*#fff\);/s,
  'palette colors must render above the global button effect');
assert.match(css, /\.pixel-character-editor\[hidden\]\s*\{[^}]*display:\s*none;/s);
assert.match(css, /@media \(max-width: 430px\)[\s\S]*?\.pixel-character-editor__body\s*\{[^}]*grid-template-columns:\s*1fr;/s,
  'the character lab must remain usable in a narrow window');

assert.ok(source.includes(exportNeedle), 'the public pixel-login API changed unexpectedly');
const instrumented = source.replace(exportNeedle, `    characterPreviewDataUrl,
  __test: {
    createPlayer,
    createDefaultCharacterModel,
    normalizeCharacterModel,
    serializeCharacterModel,
    characterModelsEqual,
    persistCharacterModel,
    game,
    constants: {
      CHARACTER_STORAGE_KEY,
      CHARACTER_STORAGE_VERSION,
      CHARACTER_WIDTH,
      CHARACTER_HEIGHT,
      CHARACTER_PIXEL_COUNT
    }
  }
});`);

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const preferenceEvents = [];
class MockCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}
const window = {
  localStorage: storage,
  CustomEvent: MockCustomEvent,
  dispatchEvent(event) {
    preferenceEvents.push(event);
    return true;
  }
};
window.window = window;
const document = {
  readyState: 'loading',
  addEventListener() {},
  createElement() {
    throw new Error('sprite cache creation is not expected in the storage probe');
  }
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
assert.equal(test.constants.CHARACTER_STORAGE_KEY, 'fe-monster-login-character-v1');
assert.equal(test.constants.CHARACTER_WIDTH, 19);
assert.equal(test.constants.CHARACTER_HEIGHT, 28);
assert.equal(test.constants.CHARACTER_PIXEL_COUNT, 532);

const defaults = test.createDefaultCharacterModel();
assert.equal(defaults.pixels.length, 532);
assert.ok(defaults.pixels.some((value) => value > 0), 'the default character cannot be empty');
const normalized = test.normalizeCharacterModel(JSON.parse(test.serializeCharacterModel(defaults)));
assert.ok(normalized, 'a valid character failed its storage round trip');
assert.equal(test.characterModelsEqual(defaults, normalized), true);
assert.equal(test.normalizeCharacterModel({ ...JSON.parse(test.serializeCharacterModel(defaults)), version: 2 }), null);
assert.equal(test.normalizeCharacterModel({ ...JSON.parse(test.serializeCharacterModel(defaults)), width: 18 }), null);
assert.equal(test.normalizeCharacterModel({ ...JSON.parse(test.serializeCharacterModel(defaults)), pixels: '0'.repeat(532) }), null,
  'an invisible player must not be accepted');

const custom = test.createDefaultCharacterModel();
custom.pixels[0] = 8;
assert.equal(test.persistCharacterModel(custom), true);
const stored = JSON.parse(storage.getItem(test.constants.CHARACTER_STORAGE_KEY));
assert.equal(stored.pixels.length, 532);
assert.equal(stored.pixels[0], '8');
assert.equal(preferenceEvents.at(-1).type, 'fe-client-preferences-change');
assert.equal(test.persistCharacterModel(defaults), true);
assert.equal(storage.getItem(test.constants.CHARACTER_STORAGE_KEY), null,
  'saving the default character should remove redundant custom storage');

const player = test.createPlayer();
assert.equal(player.width, 19, 'custom artwork must not change the physics width');
assert.equal(player.height, 28, 'custom artwork must not change the physics height');
assert.match(source, /function buildCharacterSprites\([^)]*\)[\s\S]{0,900}?hitLight:[\s\S]{0,120}?hitDanger:/,
  'normal and hit sprites must be precompiled outside the game loop');
assert.match(source, /function drawPlayer\([^)]*\)[\s\S]{0,900}?context\.drawImage\(sprite/,
  'the game loop must draw the cached sprite in one image operation');
assert.match(source, /function setCharacterEditorOpen\([^)]*\)[\s\S]{0,900}?stopLoop\(\)[\s\S]{0,180}?resetInput\(\)/,
  'opening the editor must pause movement and animation work');
assert.match(source, /function sceneIsInteractive\(\)[\s\S]{0,180}?!game\.characterEditorOpen/,
  'game controls must be gated while drawing');
assert.match(source, /setPointerCapture\(event\.pointerId\)/);
assert.match(source, /chip\.className\s*=\s*'pixel-character-palette__chip'/,
  'palette buttons must contain a dedicated visible color chip');
assert.match(source, /handleCharacterPointerDown[\s\S]{0,220}?event\.stopPropagation\(\)/,
  'drawing must not click through to the login game');

console.log('Pixel login character editor PASS');
