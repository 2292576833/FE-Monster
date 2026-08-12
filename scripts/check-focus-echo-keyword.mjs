import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.join(process.cwd(), 'web', 'app.js'), 'utf8');

function functionSource(name) {
  const marker = `function ${name}`;
  const start = app.indexOf(marker);
  if (start < 0) return '';
  const headerEnd = app.indexOf(') {', start + marker.length);
  const open = headerEnd >= 0 ? headerEnd + 2 : app.indexOf('{', start + marker.length);
  if (open < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < app.length; index += 1) {
    const character = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  return '';
}

const fallbackSource = functionSource('focusEchoFallbackText');
assert.ok(fallbackSource, 'focusEchoFallbackText() is missing');
const focusEchoFallbackText = Function(
  'safeText',
  `${fallbackSource}\nreturn focusEchoFallbackText;`
)(
  (value, fallback = '') => (value === undefined || value === null || value === '' ? fallback : String(value))
);

const fixtures = new Map([
  ['Why would I ever', 'would I'],
  ['think of leaving you', 'leaving'],
  ['Wait a minute baby', 'wait a'],
  ["I've been knowing you", "I've"],
  ['Why you hiding something', 'hiding'],
  ['Thought we was through with fronting', 'through'],
  ['I can tell', 'I']
]);
for (const [line, expected] of fixtures) {
  assert.equal(focusEchoFallbackText(line), expected, `wrong focus phrase for: ${line}`);
}

const keywordSource = functionSource('focusEchoKeywordText');
const explicitSource = functionSource('focusEchoExplicitText');
assert.match(explicitSource, /focusText|focus_text/, 'explicit focusText metadata is not preferred');
assert.match(keywordSource, /focusEchoExplicitText/, 'focus phrase resolution bypasses explicit metadata');
assert.match(keywordSource, /focusEchoFallbackText/, 'focus metadata has no automatic fallback');

const syncSource = functionSource('syncFocusEchoLayerText');
assert.match(syncSource, /playbackLyricBack/, 'the semantic focus phrase is not mirrored into lyric-back');
assert.match(syncSource, /resolvedFocusEchoText/, 'echo layers are not bound to the focus phrase resolver');
assert.match(
  functionSource('resolvedFocusEchoText'),
  /focusEchoKeywordText/,
  'the group-aware focus resolver bypasses explicit/fallback focus text'
);
assert.match(syncSource, /lyric-depth-[1-5]/, 'the soft echo layers are not selected independently from depth 0');
assert.match(syncSource, /setPlaybackLayerText/, 'focus text never reaches the echo DOM layers');

const lineSource = functionSource('setPlaybackLyricLine');
assert.match(lineSource, /syncFocusEchoLayerText\s*\(/, 'line changes still clone the full line into every focus layer');
assert.match(
  lineSource,
  /state\.textPreset\s*!==\s*['"]focus-echo['"][\s\S]{0,180}animateLyricGeometryFlip/,
  'the generic FLIP transition still competes with focusEchoConverge'
);

const presetSource = functionSource('setTextPreset');
assert.match(
  presetSource,
  /syncFocusEchoLayerText\s*\(/,
  'switching to focus echo does not refresh the already-displayed line into focus/main layers'
);

console.log('Focus echo keyword regression PASS');
