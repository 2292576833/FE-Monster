import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in the real lyric runtime`);
  const openParen = appSource.indexOf('(', start + `function ${name}`.length);
  let parameterDepth = 0;
  let closeParen = -1;
  for (let index = openParen; index < appSource.length; index += 1) {
    if (appSource[index] === '(') parameterDepth += 1;
    if (appSource[index] === ')' && --parameterDepth === 0) {
      closeParen = index;
      break;
    }
  }
  const openBrace = appSource.indexOf('{', closeParen + 1);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openBrace; index < appSource.length; index += 1) {
    const char = appSource[index];
    const next = appSource[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return appSource.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced function body`);
}

function numericConstant(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `${name} must exist in the real lyric runtime`);
  return Number(Function(`"use strict"; return (${match[1]});`)());
}

function extractFunctionRange(startName, endName) {
  const start = appSource.indexOf(`function ${startName}(`);
  const end = appSource.indexOf(`function ${endName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${startName}..${endName} must exist in source order`);
  return appSource.slice(start, end);
}

const state = {
  currentSong: { id: 'slow-vocal-fixture', duration: 60 },
  lyricTimingScale: 1,
};
const sandbox = vm.createContext({
  state,
  els: { audio: { duration: 60 } },
});

vm.runInContext([
  `const LYRIC_AUTO_LINE_MIN_DURATION_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MIN_DURATION_SECONDS')};`,
  `const LYRIC_AUTO_LINE_MAX_DURATION_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MAX_DURATION_SECONDS')};`,
  `const LYRIC_AUTO_LINE_MIN_GAP_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MIN_GAP_SECONDS')};`,
  `const LYRIC_AUTO_LINE_TAIL_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_TAIL_SECONDS')};`,
  extractFunction('clamp'),
  extractFunction('medianNumber'),
  extractFunction('playbackDurationForLyricSpeed'),
  extractFunction('estimatedLyricLineDuration'),
  extractFunction('estimatedLyricEndTime'),
  extractFunctionRange('isCjkLyricGlyph', 'scaleLyricTimingValue'),
  extractFunction('autoDetectLyricSpeed'),
  extractFunction('lyricProgressForLineAtTime'),
  'globalThis.fit = autoDetectLyricSpeed;',
  'globalThis.progress = lyricProgressForLineAtTime;',
].join('\n'), sandbox, { filename: 'web/app.js#slow-vocal-lyric-highlight' });

const plainLines = [
  { time: 10, text: '慢慢唱完这一句' },
  { time: 20, text: '下一句从这里开始' },
  { time: 28, text: '最后一句' },
];
const fitted = JSON.parse(JSON.stringify(sandbox.fit(plainLines, state.currentSong)));
const first = fitted[0];

assert.equal(first.time, 10, 'plain LRC provider line timestamps must remain unchanged');
assert.ok(
  Number.isFinite(first.autoVocalEndTime)
    && first.autoVocalEndTime > first.time
    && first.autoVocalEndTime < fitted[1].time,
  'a slow-vocal plain LRC line must stop rolling before the next line after the voice has ended',
);

const vocalEndProgress = sandbox.progress(first, first.autoVocalEndTime, fitted[1].time);
const pauseTailProgress = sandbox.progress(first, fitted[1].time - 0.25, fitted[1].time);
assert.equal(vocalEndProgress, 1, 'plain LRC highlight must be complete at the inferred vocal end');
assert.equal(pauseTailProgress, 1, 'plain LRC highlight must hold during the pause before the next line');

const timedSlowLine = {
  time: 30,
  endTime: 38,
  text: '慢 慢 唱',
  karaokeSegments: [
    { textStart: 0, textEnd: 1, startTime: 30, endTime: 31.4 },
    { textStart: 2, textEnd: 3, startTime: 33, endTime: 34.6 },
    { textStart: 4, textEnd: 5, startTime: 36.2, endTime: 38 },
  ],
};
const measured = (text) => Array.from(String(text || '')).reduce(
  (width, glyph) => width + (glyph === ' ' ? 0.3 : 1),
  0,
);
const beforeSecondWord = sandbox.progress(timedSlowLine, 32.5, 38, { measureText: measured });
const duringSecondWord = sandbox.progress(timedSlowLine, 33.8, 38, { measureText: measured });
assert.ok(
  Math.abs(beforeSecondWord - measured('慢') / measured(timedSlowLine.text)) < 1e-9,
  'native karaoke progress must hold through a long vocal pause instead of drifting',
);
assert.ok(duringSecondWord > beforeSecondWord, 'native karaoke progress must resume on the next supplied word timestamp');

console.log(JSON.stringify({
  ok: true,
  inferredVocalEndTime: first.autoVocalEndTime,
  nextLineTime: fitted[1].time,
  vocalEndProgress,
  pauseTailProgress,
  nativeKaraoke: { beforeSecondWord, duringSecondWord },
}, null, 2));
