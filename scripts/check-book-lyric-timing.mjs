import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appPath = path.join(root, 'web', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

function constant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.\\s/+*-]+)\\s*;`));
  if (!match) throw new Error(`Missing ${name}`);
  const value = Function(`"use strict"; return (${match[1]});`)();
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: ${match[1]}`);
  return Number(value);
}

function lyricTimelineTime(currentTime, visualLead, compensation) {
  return Math.max(0, Number(currentTime) + Number(visualLead) - compensation);
}

function findLyricIndexAtTime(lines, currentTime, visualLead, compensation) {
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  const time = lyricTimelineTime(currentTime, visualLead, compensation);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

const bookLead = constant('BOOK_LYRIC_VISUAL_LEAD_SECONDS');
const glyphLead = constant('BOOK_LYRIC_GLYPH_VISUAL_LEAD_SECONDS');
const compensation = constant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS');

if (source.includes('Math.round(time / LYRIC_FRAME_SAMPLE_SECONDS)')) {
  throw new Error('Book lyric time is still quantized to a fixed refresh rate');
}

const scrollMinStep = constant('BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS');
if (scrollMinStep > 1 / 240 + Number.EPSILON) {
  throw new Error(`Book lyric scroll cannot follow high-refresh displays: ${scrollMinStep.toFixed(5)}s`);
}

const drawOrbStart = source.indexOf('function drawOrb(');
const drawOrbEnd = source.indexOf('\nfunction ', drawOrbStart + 1);
const drawOrbSource = source.slice(drawOrbStart, drawOrbEnd > drawOrbStart ? drawOrbEnd : undefined);
const lyricSyncPosition = drawOrbSource.indexOf('syncBookLyricFrame();');
const renderThrottlePosition = drawOrbSource.indexOf('state.orb.lastPaintAt && now - state.orb.lastPaintAt < frameInterval');

if (drawOrbStart < 0 || lyricSyncPosition < 0 || renderThrottlePosition < 0) {
  throw new Error('Unable to inspect the book lyric animation-frame scheduling path');
}

if (lyricSyncPosition > renderThrottlePosition) {
  throw new Error('Book lyric sync is still behind the scene render throttle and can drop to 20-30 FPS');
}

const effectiveLead = bookLead - compensation;
if (effectiveLead < 0.08 || effectiveLead > 0.18) {
  throw new Error(`Book lyric effective lead should be 80-180ms, got ${effectiveLead.toFixed(3)}s`);
}

if (glyphLead < 0.035 || glyphLead > 0.07) {
  throw new Error(`Book glyph lead should stay subtle, got ${glyphLead.toFixed(3)}s`);
}

const lines = [
  { time: 8, text: 'current lyric' },
  { time: 10, text: 'next lyric' },
  { time: 12.4, text: 'after lyric' }
];

const indexBeforeLeadWindow = findLyricIndexAtTime(lines, 9.80, bookLead, compensation);
const indexInsideLeadWindow = findLyricIndexAtTime(lines, 9.91, bookLead, compensation);
const indexAtTimestamp = findLyricIndexAtTime(lines, 10.00, bookLead, compensation);

if (indexBeforeLeadWindow !== 0) {
  throw new Error(`Book lyric switched too early before the lead window: ${indexBeforeLeadWindow}`);
}

if (indexInsideLeadWindow !== 1 || indexAtTimestamp !== 1) {
  throw new Error(`Book lyric did not switch promptly near the next timestamp: ${indexInsideLeadWindow}/${indexAtTimestamp}`);
}

console.log(JSON.stringify({
  ok: true,
  bookLead,
  compensation,
  effectiveLead,
  glyphLead,
  displayAdaptiveFrameClock: true,
  scrollMinStep,
  lyricSyncRunsBeforeSceneThrottle: true,
  switchedAtSecondsBeforeTimestamp: Number(effectiveLead.toFixed(3))
}, null, 2));
