import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = app.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

const progressSource = extractFunction('lyricProgressForLineAtTime');
const glyphSource = extractFunction('setBookLyricGlyphProgress');
assert.doesNotMatch(
  progressSource,
  /bookGlyphEase\s*\(\s*\(displayTime\s*-\s*timing\.start\)/,
  'provider-timed line progress must not ease the media timestamp',
);
assert.match(
  glyphSource,
  /hot\s*=\s*clamp\(timedProgress,\s*0,\s*1\)/,
  'provider-timed glyph brightness must directly follow its media-time fraction',
);

const delayedTimedHighlightRules = Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/gu))
  .filter(([, selector, declarations]) => (
    /book-lyric-(?:copy--hot|translation-copy--hot|glyph)/u.test(selector)
    && /transition\s*:/u.test(declarations)
    && /(?:clip-path|--book-glyph-hot|color)/u.test(declarations)
    && !/transition\s*:\s*none/u.test(declarations)
  ))
  .map(([, selector]) => selector.trim());
assert.deepEqual(
  delayedTimedHighlightRules,
  [],
  `timed karaoke highlighting must not trail the media clock in CSS: ${delayedTimedHighlightRules.join(', ')}`,
);

console.log(JSON.stringify({
  ok: true,
  clockMapping: 'linear-provider-glyph-time',
  delayedTimedHighlightRuleCount: delayedTimedHighlightRules.length,
}, null, 2));
