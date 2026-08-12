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
    if (appSource[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        closeParen = index;
        break;
      }
    }
  }
  assert.ok(closeParen > openParen, `${name} must have balanced parameters`);
  const open = appSource.indexOf('{', closeParen + 1);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = open; index < appSource.length; index += 1) {
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
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced function body`);
}

function numericConstant(name) {
  const match = appSource.match(new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `${name} must exist in the real lyric runtime`);
  const value = Function(`"use strict"; return (${match[1]});`)();
  assert.ok(Number.isFinite(value), `${name} must be numeric`);
  return Number(value);
}

function constantDeclaration(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*[^\\n]+;`));
  assert.ok(match, `${name} must exist in the real lyric parser`);
  return match[0];
}

const providerLines = [
  {
    time: 10,
    endTime: 13,
    text: 'First provider line',
    glyphTimings: [{ start: 10, end: 11.4 }, { start: 11.4, end: 13 }],
    wordTimings: [{ startTime: 10, duration: 1.4 }, { startTime: 11.4, duration: 1.6 }],
  },
  {
    time: 100,
    endTime: 104,
    text: 'Second provider line',
    glyphTimings: [{ start: 100, end: 102 }, { start: 102, end: 104 }],
    wordTimings: [{ startTime: 100, duration: 2 }, { startTime: 102, duration: 2 }],
  },
  {
    time: 200,
    endTime: 204,
    text: 'Last provider line before a long outro',
    glyphTimings: [{ start: 200, end: 202 }, { start: 202, end: 204 }],
    wordTimings: [{ startTime: 200, duration: 2 }, { startTime: 202, duration: 2 }],
  },
];

const source = [
  `const LYRIC_AUTO_LINE_MIN_DURATION_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MIN_DURATION_SECONDS')};`,
  `const LYRIC_AUTO_LINE_MAX_DURATION_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MAX_DURATION_SECONDS')};`,
  `const LYRIC_AUTO_LINE_MIN_GAP_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_MIN_GAP_SECONDS')};`,
  `const LYRIC_AUTO_LINE_TAIL_SECONDS = ${numericConstant('LYRIC_AUTO_LINE_TAIL_SECONDS')};`,
  extractFunction('clamp'),
  extractFunction('medianNumber'),
  extractFunction('playbackDurationForLyricSpeed'),
  extractFunction('estimatedLyricLineDuration'),
  extractFunction('estimatedLyricEndTime'),
  extractFunction('lineHasTrustedLyricTiming'),
  extractFunction('autoFitPlainLyricLinePacing'),
  extractFunction('scaleLyricTimingValue'),
  extractFunction('scaleLyricDurationValue'),
  extractFunction('scaleLyricGlyphTiming'),
  extractFunction('scaleLyricWordTiming'),
  extractFunction('scaleLyricLineTiming'),
  extractFunction('lyricAutoSpeedScale'),
  extractFunction('autoDetectLyricSpeed'),
].join('\n');

const parserSource = [
  constantDeclaration('LYRIC_TIME_PATTERN'),
  constantDeclaration('LYRIC_INLINE_MARKER_PATTERN'),
  constantDeclaration('LYRIC_LRC_TIMESTAMP_PATTERN'),
  constantDeclaration('LYRIC_LRC_TAG_PATTERN'),
  constantDeclaration('LYRIC_LRC_OFFSET_PATTERN'),
  constantDeclaration('LYRIC_TRACK_MAIN'),
  extractFunction('parseLyricTime'),
  extractFunction('isLyricCreditLine'),
  extractFunction('glyphTimingsFromWordTimings'),
  extractFunction('normalizeGlyphTimeline'),
  extractFunction('parseInlineLrcLyric'),
  extractFunction('normalizeParsedLyricLines'),
  extractFunction('completeLineWordTimings'),
  extractFunction('parseLrc'),
].join('\n');

const state = { currentSong: { duration: 240 }, lyricTimingScale: 1 };
const sandbox = vm.createContext({
  state,
  els: { audio: { duration: 240 } },
  safeText(value, fallback = '') {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
  },
});
vm.runInContext(`${source}\n${parserSource}\nglobalThis.runFixture = autoDetectLyricSpeed; globalThis.parseFixtureLrc = parseLrc;`, sandbox, {
  filename: 'web/app.js#trusted-provider-timestamps',
});

const expected = JSON.parse(JSON.stringify(providerLines));
const actual = JSON.parse(JSON.stringify(sandbox.runFixture(providerLines, state.currentSong)));
const timestampsPreserved = JSON.stringify(actual) === JSON.stringify(expected);
const positiveOffsetLines = JSON.parse(JSON.stringify(sandbox.parseFixtureLrc([
  '[offset:+500]',
  '[00:10.000]<00:10.000>你<00:10.250>好',
  '[00:12.000]再见',
].join('\n'))));
const negativeOffsetLines = JSON.parse(JSON.stringify(sandbox.parseFixtureLrc([
  '[offset:-750]',
  '[00:01.000]<00:01.000>A<00:01.500>B',
].join('\n'))));
const lrcOffsetAppliedOnce = positiveOffsetLines.length === 2
  && Math.abs(positiveOffsetLines[0].time - 10.5) <= 1e-9
  && Math.abs(positiveOffsetLines[0].wordTimings[0].startTime - 10.5) <= 1e-9
  && Math.abs(positiveOffsetLines[0].wordTimings[1].startTime - 10.75) <= 1e-9
  && Math.abs(positiveOffsetLines[0].glyphTimings[0].start - 10.5) <= 1e-9
  && Math.abs(positiveOffsetLines[1].time - 12.5) <= 1e-9
  && negativeOffsetLines.length === 1
  && Math.abs(negativeOffsetLines[0].time - 0.25) <= 1e-9
  && Math.abs(negativeOffsetLines[0].wordTimings[0].startTime - 0.25) <= 1e-9
  && Math.abs(negativeOffsetLines[0].wordTimings[1].startTime - 0.75) <= 1e-9;
const result = {
  ok: timestampsPreserved && state.lyricTimingScale === 1 && lrcOffsetAppliedOnce,
  fixture: {
    songDurationSeconds: state.currentSong.duration,
    providerLyricEndSeconds: expected.at(-1).endTime,
  },
  measured: {
    lyricTimingScale: state.lyricTimingScale,
    secondLineShiftMs: Math.round((actual[1].time - expected[1].time) * 1000),
    lastLineShiftMs: Math.round((actual[2].time - expected[2].time) * 1000),
    lastGlyphEndShiftMs: Math.round((actual[2].glyphTimings.at(-1).end - expected[2].glyphTimings.at(-1).end) * 1000),
    positiveLrcLineOffsetMs: Math.round((positiveOffsetLines[0]?.time - 10) * 1000),
    positiveLrcWordOffsetMs: Math.round((positiveOffsetLines[0]?.wordTimings?.[0]?.startTime - 10) * 1000),
    negativeLrcLineOffsetMs: Math.round((negativeOffsetLines[0]?.time - 1) * 1000),
  },
};

console.log(JSON.stringify(result, null, 2));
assert.equal(
  result.ok,
  true,
  'trusted provider timestamps must remain intact and LRC offsets must shift line/word timing exactly once',
);
