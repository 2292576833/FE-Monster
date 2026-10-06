import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

assert.match(source,
  /function updatePlaybackLyricAtTime[\s\S]*?measureElement:\s*els\.playbackLyricText/,
  'the central lyric surface must measure its rendered text');
assert.match(source,
  /function updateBookLyricLines[\s\S]*?book-lyric-copy--base[\s\S]*?measureElement:\s*activeMeasureElement/,
  'the full book lyric surface must measure its rendered text');
assert.match(source,
  /function updateQishuiPlaybackLyrics[\s\S]*?measureElementForIndex[\s\S]*?book-lyric-copy--base/,
  'the playback-card lyric surface must measure its rendered text');
assert.match(source,
  /function renderMultiRowLyrics[\s\S]*?multiRowLyricHighlightProgress\(displayModel, active, currentTime, main\)/,
  'the 3D multi-row lyric surface must measure its rendered text');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

const progress = Function(
  'clamp',
  `return (${extractFunction('lyricProgressForLineAtTime')});`,
)((value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)));

// A proportional-font fixture: W is four pixels wide and i is one pixel wide.
// Character-count progress at 10.5s is 25%, but the audible token has traversed
// half of W, so the visible mask must be at 2/7 = 28.57% of the rendered line.
const widths = { W: 4, i: 1 };
const measureText = (text) => Array.from(String(text || ''))
  .reduce((total, glyph) => total + (widths[glyph] || 1), 0);
const line = {
  time: 10,
  endTime: 12,
  text: 'Wiii',
  karaokeSegments: [
    { text: 'W', textStart: 0, textEnd: 1, startTime: 10, duration: 1 },
    { text: 'iii', textStart: 1, textEnd: 4, startTime: 11, duration: 1 },
  ],
};

const firstTokenMiddle = progress(line, 10.5, 12, { measureText });
const secondTokenMiddle = progress(line, 11.5, 12, { measureText });
assert.ok(Math.abs(firstTokenMiddle - 2 / 7) < 1e-9,
  `first token highlight must follow rendered width; got ${firstTokenMiddle}`);
assert.ok(Math.abs(secondTokenMiddle - 5.5 / 7) < 1e-9,
  `second token highlight must follow rendered width; got ${secondTokenMiddle}`);

console.log(JSON.stringify({
  ok: true,
  firstTokenMiddle,
  secondTokenMiddle,
  mapping: 'provider-token-time-to-rendered-pixel-width',
}, null, 2));
