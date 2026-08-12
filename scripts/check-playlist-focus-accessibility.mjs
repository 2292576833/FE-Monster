import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing function: ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function: ${name}`);
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
  add(name) {
    this.values.add(name);
  }
  replace(previous, next) {
    this.values.delete(previous);
    this.values.add(next);
  }
  contains(name) {
    return this.values.has(name);
  }
}

class FakeButton {
  constructor() {
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.tabIndex = -1;
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

const PLAYLIST_SONG_RENDER_RADIUS = 5;
const PLAYLIST_SONG_SLOT_CLASSES = Object.freeze(
  Array.from({ length: PLAYLIST_SONG_RENDER_RADIUS * 2 + 1 }, (_, index) => `slot-${index}`)
);
const updateSongButtonFocusVisual = new Function(
  'PLAYLIST_SONG_RENDER_RADIUS',
  'PLAYLIST_SONG_SLOT_CLASSES',
  `${extractFunction('updateSongButtonFocusVisual')}; return updateSongButtonFocusVisual;`
)(PLAYLIST_SONG_RENDER_RADIUS, PLAYLIST_SONG_SLOT_CLASSES);

const formerlyFocused = new FakeButton();
updateSongButtonFocusVisual(formerlyFocused, 299, 299);
updateSongButtonFocusVisual(formerlyFocused, 299, 0);

const newlyFocused = new FakeButton();
updateSongButtonFocusVisual(newlyFocused, 0, 0);

const checks = {
  recycledHiddenButtonClearsSelection:
    formerlyFocused.classList.contains('is-song-virtual-hidden')
    && formerlyFocused.getAttribute('aria-selected') === 'false',
  recycledHiddenButtonLeavesTabOrder: formerlyFocused.tabIndex === -1,
  newFocusedButtonIsOnlySelection:
    newlyFocused.getAttribute('aria-selected') === 'true'
    && newlyFocused.tabIndex === 0
};

const result = {
  pass: Object.values(checks).every(Boolean),
  checks,
  formerlyFocused: {
    hidden: formerlyFocused.classList.contains('is-song-virtual-hidden'),
    selected: formerlyFocused.getAttribute('aria-selected'),
    tabIndex: formerlyFocused.tabIndex
  },
  newlyFocused: {
    selected: newlyFocused.getAttribute('aria-selected'),
    tabIndex: newlyFocused.tabIndex
  }
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
assert.equal(result.pass, true, 'Recycled playlist nodes retained stale selection/focus state');
