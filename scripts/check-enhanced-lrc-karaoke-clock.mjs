import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const parametersOpen = appSource.indexOf('(', start);
  let parametersDepth = 0;
  let bodyStart = -1;
  for (let index = parametersOpen; index < appSource.length; index += 1) {
    if (appSource[index] === '(') parametersDepth += 1;
    if (appSource[index] === ')') parametersDepth -= 1;
    if (parametersDepth === 0) {
      bodyStart = appSource.indexOf('{', index);
      break;
    }
  }
  let bodyDepth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') bodyDepth += 1;
    if (appSource[index] === '}') {
      bodyDepth -= 1;
      if (bodyDepth === 0) return appSource.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced body`);
}

function extractConstant(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*[^;]+;`));
  assert.ok(match, `${name} must exist`);
  return match[0];
}

const sandbox = vm.createContext({
  Math,
  Number,
  Array,
  String,
  safeText(value, fallback = '') {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
  },
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  },
});

vm.runInContext(`
  ${extractConstant('LYRIC_TIME_PATTERN')}
  ${extractConstant('LYRIC_INLINE_MARKER_PATTERN')}
  ${extractConstant('LYRIC_LRC_TIMESTAMP_PATTERN')}
  ${extractConstant('LYRIC_LRC_TAG_PATTERN')}
  ${extractConstant('LYRIC_LRC_OFFSET_PATTERN')}
  ${extractConstant('LYRIC_KARAOKE_LINE_PATTERN')}
  ${extractConstant('LYRIC_KARAOKE_TOKEN_PATTERN')}
  ${extractConstant('LYRIC_TRACK_MAIN')}
  ${extractFunction('parseLyricTime')}
  ${extractFunction('isLyricCreditLine')}
  ${extractFunction('mergeLyricText')}
  ${extractFunction('glyphTimingsFromWordTimings')}
  ${extractFunction('normalizeGlyphTimeline')}
  ${extractFunction('normalizeKaraokeSegments')}
  ${extractFunction('karaokeTimelineFromTokens')}
  ${extractFunction('parseInlineLrcLyric')}
  ${extractFunction('normalizeParsedLyricLines')}
  ${extractFunction('completeLineWordTimings')}
  ${extractFunction('parseLrc')}
  ${extractFunction('pushKaraokeGlyphTimings')}
  ${extractFunction('parseJsonKaraokeLyric')}
  ${extractFunction('parseKaraokeLyric')}
  ${extractFunction('bookGlyphEase')}
  ${extractFunction('lyricProgressForLineAtTime')}
  globalThis.contract = { parseLrc, parseKaraokeLyric, lyricProgressForLineAtTime };
`, sandbox, { filename: 'web/app.js#enhanced-lrc-karaoke-clock' });

const lines = sandbox.contract.parseLrc([
  '[00:10.000]<00:10.000>你好世界<00:11.000>呀',
  '[00:12.000]下一句',
].join('\n'));

assert.equal(lines.length, 2, 'fixture must produce two lyric lines');
const line = lines[0];
assert.equal(line.text, '你好世界呀');

const expectedStarts = [10, 10.25, 10.5, 10.75, 11];
const expectedDurations = [0.25, 0.25, 0.25, 0.25, 1];
assert.deepEqual(
  Array.from(line.wordTimings, (timing) => Number(timing.startTime.toFixed(3))),
  expectedStarts,
  'characters inside an enhanced-LRC segment must be distributed over that segment',
);
assert.deepEqual(
  Array.from(line.wordTimings, (timing) => Number(timing.duration.toFixed(3))),
  expectedDurations,
  'the final enhanced-LRC segment must end at the next line timestamp',
);
assert.deepEqual(
  Array.from(line.glyphTimings, (timing) => Number(timing.start.toFixed(3))),
  expectedStarts,
  'rendered glyph timing must preserve the completed word timeline',
);
assert.ok(
  line.wordTimings.every((timing) => !Object.hasOwn(timing, 'segmentGlyphCount')),
  'temporary segment-expansion metadata must not inflate every desktop lyric snapshot',
);

const progressAtHalfSecond = sandbox.contract.lyricProgressForLineAtTime(line, 10.5, 12);
assert.ok(
  Math.abs(progressAtHalfSecond - 0.4) <= 1e-9,
  `at 10.500s exactly two of five glyphs must be highlighted; got ${progressAtHalfSecond}`,
);

const realNeteaseLine = sandbox.contract.parseKaraokeLyric(
  '[95290,6080](95290,430,0)不(95720,510,0)等(96230,510,0)答(96740,400,0)案(97140,320,0)揭(97460,1340,0)晓 (98800,180,0)我(98980,360,0)选(99340,140,0)择(99480,430,0)潇(99910,550,0)洒(100460,280,0)走(100740,630,0)掉'
)[0];
assert.equal(realNeteaseLine.text, '不等答案揭晓 我选择潇洒走掉',
  'the real NetEase YRC line text was not reconstructed');
assert.deepEqual(
  Array.from(realNeteaseLine.glyphTimings.slice(0, 6), (timing) => Number(timing.start.toFixed(3))),
  [95.29, 95.72, 96.23, 96.74, 97.14, 97.46],
  'the real NetEase YRC glyph starts were not preserved',
);
assert.deepEqual(
  Array.from(realNeteaseLine.glyphTimings.slice(0, 6), (timing) => Number(timing.duration.toFixed(3))),
  [0.43, 0.51, 0.51, 0.4, 0.32, 1.34],
  'the real NetEase YRC glyph durations were not preserved',
);
assert.deepEqual(
  Array.from(realNeteaseLine.karaokeSegments.slice(0, 2), (segment) => ({
    text: segment.text,
    textStart: segment.textStart,
    textEnd: segment.textEnd,
    startTime: Number(segment.startTime.toFixed(3)),
    duration: Number(segment.duration.toFixed(3)),
  })),
  [
    { text: '不', textStart: 0, textEnd: 1, startTime: 95.29, duration: 0.43 },
    { text: '等', textStart: 1, textEnd: 2, startTime: 95.72, duration: 0.51 },
  ],
  'native karaoke provider-token boundaries must survive parsing',
);
const firstNeteaseGlyphDone = sandbox.contract.lyricProgressForLineAtTime(
  realNeteaseLine,
  95.72,
  realNeteaseLine.endTime,
  { measureText: (text) => Array.from(String(text || '')).filter((glyph) => glyph.trim()).length },
);
assert.ok(Math.abs(firstNeteaseGlyphDone - (1 / 13)) <= 1e-9,
  `the real YRC clock did not finish exactly one of 13 glyphs at 95.720s: ${firstNeteaseGlyphDone}`);

const kugouTokenLine = sandbox.contract.parseKaraokeLyric(
  '[3000,1000]<0,500,0>Ku<500,500,0>gou'
)[0];
assert.deepEqual(
  Array.from(kugouTokenLine.karaokeSegments, (segment) => ({
    text: segment.text,
    textStart: segment.textStart,
    textEnd: segment.textEnd,
    startTime: Number(segment.startTime.toFixed(3)),
    duration: Number(segment.duration.toFixed(3)),
  })),
  [
    { text: 'Ku', textStart: 0, textEnd: 2, startTime: 3, duration: 0.5 },
    { text: 'gou', textStart: 2, textEnd: 5, startTime: 3.5, duration: 0.5 },
  ],
  'Kugou KRC token ranges and provider durations must not be replaced by per-character guesses',
);

const qqLine = sandbox.contract.parseKaraokeLyric('[1000,5000]慢(1000,1800)慢(4200,700)唱(4900,800)')[0];
assert.equal(qqLine.text, '慢慢唱', 'QQ suffix timing must retain the first and last words');
assert.deepEqual(Array.from(qqLine.karaokeSegments, s => s.startTime), [1, 4.2, 4.9]);
assert.equal(sandbox.contract.lyricProgressForLineAtTime(qqLine, 3, 6), 1 / 3,
  'a slow vocal gap must hold the completed word instead of interpolating through the silence');
const qqPunctuationLine = sandbox.contract.parseKaraokeLyric(
  '[1000,2000](轻声)慢(1000,1200)唱(2400,600)'
)[0];
assert.equal(qqPunctuationLine.text, '(轻声)慢唱', 'QRC lyric punctuation must not be treated as timing');
assert.deepEqual(Array.from(qqPunctuationLine.karaokeSegments, s => s.startTime), [1, 2.4]);

const longGlyphFixture = {
  time: 10,
  text: '长音',
  glyphTimings: [
    { start: 10, end: 11 },
    { start: 11, end: 11.2 },
  ],
};
const longGlyphQuarter = sandbox.contract.lyricProgressForLineAtTime(longGlyphFixture, 10.25, 11.2);
const longGlyphThreeQuarter = sandbox.contract.lyricProgressForLineAtTime(longGlyphFixture, 10.75, 11.2);
assert.ok(Math.abs(longGlyphQuarter - 0.125) <= 1e-9,
  `provider glyph time must map linearly at 25%; got ${longGlyphQuarter}`);
assert.ok(Math.abs(longGlyphThreeQuarter - 0.375) <= 1e-9,
  `provider glyph time must map linearly at 75%; got ${longGlyphThreeQuarter}`);

const jsonNeteaseLine = sandbox.contract.parseKaraokeLyric(
  '{"t":4000,"c":[{"tx":"Netease ","t":4000,"d":500},{"tx":"line","t":4500,"d":500}]}'
)[0];
assert.equal(jsonNeteaseLine.text, 'Netease line',
  'the JSON YRC line text was not reconstructed');
assert.equal(jsonNeteaseLine.time, 4,
  'the JSON YRC line start was not preserved');
assert.equal(jsonNeteaseLine.endTime, 5,
  'the JSON YRC line end was not derived from its word timeline');
assert.deepEqual(
  Array.from(jsonNeteaseLine.glyphTimings, (timing) => Number(timing.start.toFixed(3))),
  [4, 4.071, 4.143, 4.214, 4.286, 4.357, 4.429, 4.5, 4.625, 4.75, 4.875],
  'the JSON YRC glyph starts were not preserved',
);

const kugouKrcLine = sandbox.contract.parseKaraokeLyric(
  '[3000,1000]<0,500,0>Ku<500,500,0>gou'
)[0];
assert.equal(kugouKrcLine.text, 'Kugou', 'the decoded Kugou KRC text was not reconstructed');
assert.equal(kugouKrcLine.time, 3, 'the Kugou KRC line start was not preserved');
assert.equal(kugouKrcLine.endTime, 4, 'the Kugou KRC line duration was not preserved');
assert.deepEqual(
  Array.from(kugouKrcLine.glyphTimings, (timing) => Number(timing.start.toFixed(3))),
  [3, 3.25, 3.5, 3.667, 3.833],
  'relative KRC word offsets were not anchored to the platform line timestamp',
);

const earlyKugouKrcLine = sandbox.contract.parseKaraokeLyric([
  '[offset:125]',
  '[1085,2747]<0,202,0>今<202,256,0>天<458,202,0>开<660,356,0>始<1016,407,0>新<1423,406,0>出<1829,562,0>发<2391,356,0>吗',
].join('\n'))[0];
assert.equal(earlyKugouKrcLine.time, 1.21,
  'the global KRC offset was not applied to the line timestamp');
assert.deepEqual(
  Array.from(earlyKugouKrcLine.glyphTimings.slice(-3), (timing) => Number(timing.start.toFixed(3))),
  [2.633, 3.039, 3.601],
  'early-song KRC offsets greater than the line start must remain relative to the line',
);

console.log(JSON.stringify({
  ok: true,
  wordStarts: expectedStarts,
  wordDurations: expectedDurations,
  progressAt10_5: progressAtHalfSecond,
  realNeteaseLine: {
    start: realNeteaseLine.time,
    glyphs: realNeteaseLine.glyphTimings.length,
    firstGlyphDoneAt: 95.72,
    progress: firstNeteaseGlyphDone,
  },
  jsonNeteaseLine: {
    start: jsonNeteaseLine.time,
    end: jsonNeteaseLine.endTime,
    glyphs: jsonNeteaseLine.glyphTimings.length,
  },
  kugouKrcLine: {
    start: kugouKrcLine.time,
    end: kugouKrcLine.endTime,
    glyphs: kugouKrcLine.glyphTimings.length,
  },
  earlyKugouKrcLine: {
    start: earlyKugouKrcLine.time,
    lastGlyphStarts: Array.from(
      earlyKugouKrcLine.glyphTimings.slice(-3),
      (timing) => Number(timing.start.toFixed(3)),
    ),
  },
  providerLinearProgress: {
    quarter: longGlyphQuarter,
    threeQuarter: longGlyphThreeQuarter,
  },
}, null, 2));
