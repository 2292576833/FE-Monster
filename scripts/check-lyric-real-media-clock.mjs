import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing`);
  const openParen = source.indexOf('(', start + `function ${name}`.length);
  let parameterDepth = 0;
  let closeParen = -1;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')' && --parameterDepth === 0) {
      closeParen = index;
      break;
    }
  }
  assert.ok(closeParen > openParen, `${name} has unbalanced parameters`);
  const open = source.indexOf('{', closeParen + 1);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} has an unbalanced body`);
}

const timeline = extractFunction('lyricTimelineTime');
const frame = extractFunction('syncPlaybackLyricAnimationFrame');
const mediaClock = extractFunction('currentPlaybackLyricTime');
const lead = extractFunction('playbackLyricVisualLeadSeconds');
const autoTiming = extractFunction('autoDetectLyricSpeed');
const mediaClockEdge = extractFunction('syncPlaybackLyricMediaClockEdge');

assert.match(mediaClock, /Number\(els\.audio\?\.currentTime\)/,
  'the lyric clock does not read the media element currentTime');
assert.match(frame, /const time\s*=\s*currentPlaybackLyricTime\(\)/,
  'animation frames do not sample the authoritative media clock');
assert.match(timeline, /-\s*lyricAudioOutputLatencySeconds\(\)/,
  'the lyric timeline must subtract the independently measured native output queue');
assert.doesNotMatch(timeline, /getOutputTimestamp|performance\.now|estimated/i,
  'the lyric timeline still applies a guessed clock correction');
assert.match(extractFunction('lyricAudioOutputLatencySeconds'), /ordinary media\/WebAudio path[\s\S]*?return 0/,
  'the ordinary media/WebAudio route must retain raw media-element time');
assert.match(lead, /return\s+0\s*;/,
  'a visual preset still advances lyrics ahead of the real media clock');
assert.match(autoTiming, /autoFitPlainLyricLinePacing/,
  'plain LRC long vocal gaps must receive a visual-only vocal end point');
assert.doesNotMatch(autoTiming, /scaleLyricLineTiming|lyricAutoSpeedScale/,
  'provider line, word, and glyph timestamps must never be stretched');
assert.match(mediaClockEdge, /syncPlaybackLyricAtTime\(time,\s*\{\s*authoritativeSample:\s*true\s*\}\)/,
  'media lifecycle edges must commit the exact media-element position');
assert.match(mediaClockEdge, /resetLyricFrameSync\(\)/,
  'media lifecycle edges must invalidate the previous frame sample');
assert.match(source, /els\.audio\.addEventListener\('ratechange',[\s\S]{0,240}syncPlaybackLyricMediaClockEdge\(\)/,
  'playback-rate changes must immediately recalibrate mirrored lyric clocks');

const delayedProgressRules = Array.from(styles.matchAll(/([^{}]+)\{([^{}]*var\(--lyric-line-progress\)[^{}]*)\}/gu))
  .filter(([, , declarations]) => /transition(?:-property)?\s*:[^;]*clip-path/iu.test(declarations))
  .map(([, selector]) => selector.trim());
assert.deepEqual(
  delayedProgressRules,
  [],
  `audio-clock lyric highlights must not add a CSS clip-path delay: ${delayedProgressRules.join(', ')}`,
);

const sandbox = vm.createContext({});
vm.runInContext([
  extractFunction('clamp'),
  extractFunction('bookGlyphEase'),
  extractFunction('lyricProgressForLineAtTime'),
  'globalThis.progress = lyricProgressForLineAtTime;',
].join('\n'), sandbox, { filename: 'web/app.js#real-media-clock' });

const plainLine = { time: 10, text: '普通 LRC 没有逐字时间戳' };
assert.equal(sandbox.progress(plainLine, 9.999, 12), 0,
  'plain LRC must remain inactive before its provider timestamp');
assert.equal(sandbox.progress(plainLine, 10, 12), 0,
  'plain LRC rolling highlight must begin at its provider timestamp');
assert.equal(sandbox.progress(plainLine, 10.5, 12), 0.25,
  'plain LRC rolling highlight must follow real media time between provider timestamps');
assert.equal(sandbox.progress(plainLine, 12, 12), 1,
  'plain LRC rolling highlight must finish at the next provider timestamp');

const enhancedLine = {
  time: 20,
  text: 'AB',
  glyphTimings: [
    { start: 20, end: 20.5 },
    { start: 20.5, end: 21 },
  ],
};
assert.equal(sandbox.progress(enhancedLine, 20.5, 22), 0.5,
  'enhanced LRC must use its supplied per-glyph timestamps');

console.log(JSON.stringify({
  ok: true,
  clock: 'audible-output-time-from-HTMLMediaElement.currentTime',
  nativeMeasuredLatencyCorrection: true,
  estimatedLatencyCorrection: false,
  providerTimestampsRescaled: false,
  plainLrcMode: 'provider-line-start-with-visual-vocal-end-for-long-gaps',
  enhancedLrcMode: 'provider-glyph-timestamp',
  presetVisualLeadSeconds: 0,
  delayedProgressRuleCount: delayedProgressRules.length,
}, null, 2));
