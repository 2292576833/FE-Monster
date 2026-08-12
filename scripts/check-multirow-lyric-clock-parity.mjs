import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

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

const numericConstantCache = new Map();
function numericConstant(name, resolving = new Set()) {
  if (numericConstantCache.has(name)) return numericConstantCache.get(name);
  assert.equal(resolving.has(name), false, `${name} must not be cyclic`);
  resolving.add(name);
  const match = appSource.match(new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `${name} must exist in the real lyric runtime`);
  const expression = match[1].replace(/\b[A-Z][A-Z0-9_]+\b/g, (dependency) => (
    String(numericConstant(dependency, resolving))
  ));
  const value = Function(`"use strict"; return (${expression});`)();
  assert.ok(Number.isFinite(value), `${name} must be numeric`);
  resolving.delete(name);
  numericConstantCache.set(name, Number(value));
  return Number(value);
}

const fixtureLines = [
  { time: 8, text: 'before', glyphTimings: [{ start: 8, end: 9 }, { start: 9, end: 10 }] },
  {
    time: 10,
    text: 'target',
    glyphTimings: [{ start: 10, end: 10.2 }, { start: 11.5, end: 12 }],
  },
  { time: 12, text: 'after', glyphTimings: [{ start: 12, end: 13 }, { start: 13, end: 14 }] },
];

const source = [
  `const LYRIC_TIMESTAMP_COMPENSATION_SECONDS = ${numericConstant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS')};`,
  `const MULTI_ROW_LYRIC_VISUAL_LEAD_SECONDS = ${numericConstant('MULTI_ROW_LYRIC_VISUAL_LEAD_SECONDS')};`,
  `const BOOK_LYRIC_VISUAL_LEAD_SECONDS = ${numericConstant('BOOK_LYRIC_VISUAL_LEAD_SECONDS')};`,
  `const QISHUI_SEEK_HANDOFF_TOLERANCE_SECONDS = ${numericConstant('QISHUI_SEEK_HANDOFF_TOLERANCE_SECONDS')};`,
  `const QISHUI_SEEK_HANDOFF_MAX_MS = ${numericConstant('QISHUI_SEEK_HANDOFF_MAX_MS')};`,
  extractFunction('currentPlaybackLyricTime'),
  extractFunction('lyricTimelineTime'),
  extractFunction('desktopSceneEffectiveLyricTimeAt'),
  extractFunction('effectivePlaybackLyricTime'),
  extractFunction('findLyricIndexAtDisplayTime'),
  extractFunction('findLyricIndexAtTime'),
  extractFunction('playbackLyricVisualLeadSeconds'),
  extractFunction('bookGlyphEase'),
  extractFunction('lyricProgressForLineAtTime'),
  extractFunction('bookLyricProgressEndTime'),
  extractFunction('updatePlaybackLyricAtTime'),
  extractFunction('syncPlaybackLyricAtTime'),
  extractFunction('qishuiPlaybackBookFrame'),
].join('\n');

const media = { currentTime: 0, src: 'fixture://audio', paused: false, ended: false };
const state = {
  multiRowLyricsEnabled: false,
  textPreset: 'default',
  lyricLines: fixtureLines,
  lyricIndex: -1,
  qishuiPlaybackCard: {
    progressDragging: false,
    pendingSeekTarget: null,
    seekHandoffTarget: null,
    seekHandoffStartedAt: 0,
  },
};
let lastRendered = null;
const sandbox = vm.createContext({
  state,
  els: { audio: media },
  DESKTOP_SCENE_CLIENT: false,
  desktopSceneRuntime: { lyricClock: null },
  performance: { now: () => 50_000 },
  clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0)),
  lyricAudioOutputLatencySeconds: () => 0,
  lyricClockOffsetSeconds: () => 0,
  playbackDurationForLyricSpeed: () => 14,
  playbackLyricText: () => 'fallback',
  playbackLyricSubtitle: () => '',
  playbackLyricSecondaryText: () => '',
  setPlaybackLyricLine(text, subtitle, progress, displayTime, authoritativeTime) {
    lastRendered = { text, subtitle, progress, displayTime, authoritativeTime };
  },
  scheduleDesktopSceneSnapshot() {},
});
vm.runInContext(`${source}\nglobalThis.clockContract = {
  currentPlaybackLyricTime,
  lyricTimelineTime,
  playbackLyricVisualLeadSeconds,
  syncPlaybackLyricAtTime,
  qishuiPlaybackBookFrame
};`, sandbox, { filename: 'web/app.js#multi-row-clock-parity' });

function surfaceAt(mediaTime, multiRow, preset = 'default') {
  media.currentTime = mediaTime;
  state.multiRowLyricsEnabled = multiRow;
  state.textPreset = preset;
  state.lyricIndex = -1;
  lastRendered = null;
  const rawMediaClock = sandbox.clockContract.currentPlaybackLyricTime();
  sandbox.clockContract.syncPlaybackLyricAtTime(rawMediaClock);
  return {
    rawMediaClock,
    displayTime: lastRendered?.displayTime ?? Number.NaN,
    activeIndex: state.lyricIndex,
    lineProgress: lastRendered?.progress ?? 0,
    wordProgress: lastRendered?.progress ?? 0,
    authoritativeTime: lastRendered?.authoritativeTime ?? Number.NaN,
  };
}

const sampleTimes = [9.78, 9.9, 10, 10.1, 10.22, 10.4, 10.8, 11.2];
const samples = sampleTimes.map((mediaTime) => ({
  mediaTime,
  single: surfaceAt(mediaTime, false),
  multi: surfaceAt(mediaTime, true),
}));

const rawClockDeltas = samples.map(({ single, multi }) => multi.rawMediaClock - single.rawMediaClock);
const maximumRawClockDelta = Math.max(...rawClockDeltas.map((value) => Math.abs(value)));
const rawClockDeltaSpread = Math.max(...rawClockDeltas) - Math.min(...rawClockDeltas);
const switchMismatches = samples.filter(({ single, multi }) => single.activeIndex !== multi.activeIndex);
const progressMismatches = samples.filter(({ single, multi }) => (
  Math.abs(single.lineProgress - multi.lineProgress) > 0.001
  || Math.abs(single.wordProgress - multi.wordProgress) > 0.001
));
const fanOutClockErrors = samples.flatMap(({ mediaTime, single, multi }) => [
  single.authoritativeTime - mediaTime,
  multi.authoritativeTime - mediaTime,
]);
const maximumFanOutClockError = Math.max(...fanOutClockErrors.map((value) => Math.abs(value)));
assert.ok(
  maximumFanOutClockError <= 1e-9,
  'single-row, multi-row, focus echo, and playback-card renderers must share one frame sample',
);

const wordTimingDisplayTime = 10.5;
const cardVisualLeadSeconds = numericConstant('BOOK_LYRIC_VISUAL_LEAD_SECONDS')
  - numericConstant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS');
const cardWordFrame = sandbox.clockContract.qishuiPlaybackBookFrame(
  fixtureLines,
  wordTimingDisplayTime - cardVisualLeadSeconds,
);
const rendererWordProgress = {
  single: surfaceAt(wordTimingDisplayTime, false).wordProgress,
  multi: surfaceAt(wordTimingDisplayTime, true).wordProgress,
  focusEcho: surfaceAt(wordTimingDisplayTime, false, 'focus-echo').wordProgress,
  playbackCard: cardWordFrame.progressPercent / 100,
};
Object.entries(rendererWordProgress).forEach(([renderer, progress]) => {
  assert.ok(
    Math.abs(progress - 0.5) <= 1e-9,
    `${renderer} must use the provider's non-uniform per-word timing`,
  );
});
assert.match(
  extractFunction('setPlaybackLyricLine'),
  /updateQishuiPlaybackLyrics\([\s\S]*?authoritativeTime/,
  'the playback-card renderer must reuse the frame-authoritative media sample',
);

function switchTime(multiRow) {
  for (let millisecond = 9_500; millisecond <= 10_500; millisecond += 1) {
    const observation = surfaceAt(millisecond / 1000, multiRow);
    if (observation.activeIndex === 1) return millisecond / 1000;
  }
  return Number.NaN;
}

const arrivalRule = cssSource.match(
  /\.multi-row-lyric-line\.is-current\.is-lyric-transitioning:not\(\.is-leaving\)\s*\{[^}]*animation:\s*multi-row-current-arrive\s+([0-9.]+)ms/i,
);
assert.ok(arrivalRule, 'the actual current-row arrival animation must be measurable');
const arrivalDurationMs = Number(arrivalRule[1]);
const arrivalFrames = cssSource.match(/@keyframes\s+multi-row-current-arrive\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const readinessFrames = [...arrivalFrames.matchAll(/([0-9.]+)%\s*\{([^}]*)\}/g)].map((match) => {
  const opacity = Number(match[2].match(/opacity:\s*([0-9.]+)/)?.[1] ?? 1);
  const translateX = Number(match[2].match(/translateX\(\s*(-?[0-9.]+)px\s*\)/)?.[1] ?? 0);
  return { percent: Number(match[1]), opacity, translateX };
});
const initialFrame = readinessFrames.find((frame) => frame.percent === 0);
assert.ok(initialFrame, 'arrival animation must expose its first-frame readability');
const readableFrame = readinessFrames.find((frame) => frame.opacity >= 0.96 && Math.abs(frame.translateX) <= 2);
assert.ok(readableFrame, 'arrival animation must expose when the new current line becomes fully readable');

const targetTimestamp = fixtureLines[1].time;
const singleLogicalSwitch = switchTime(false);
const multiLogicalSwitch = switchTime(true);
const arrivalReadableMs = arrivalDurationMs * readableFrame.percent / 100;
const multiReadableSwitch = multiLogicalSwitch + arrivalReadableMs / 1000;
const logicalSingleLagMs = (singleLogicalSwitch - targetTimestamp) * 1000;
const logicalMultiLagMs = (multiLogicalSwitch - targetTimestamp) * 1000;
const perceivedMultiLagMs = (multiReadableSwitch - targetTimestamp) * 1000;
const maximumPerceivedLagMs = 1000 / 60;
const motionContractPass = arrivalDurationMs >= 180
  && arrivalDurationMs <= 240
  && initialFrame.opacity >= 0.82
  && Math.abs(initialFrame.translateX) <= 8
  && arrivalReadableMs <= 80;

let classification = 'aligned';
if (maximumRawClockDelta > 0.001 || rawClockDeltaSpread > 0.001) {
  classification = 'wrong-clock-source-or-rate-drift';
} else if (Math.abs(logicalSingleLagMs) > 40 || Math.abs(logicalMultiLagMs) > 40) {
  classification = 'fixed-offset';
} else if (perceivedMultiLagMs > maximumPerceivedLagMs) {
  classification = 'visual-animation-delay';
}

const result = {
  ok: maximumRawClockDelta <= 0.001
    && maximumFanOutClockError <= 1e-9
    && Math.abs(logicalSingleLagMs) <= 40
    && Math.abs(logicalMultiLagMs) <= 40
    && perceivedMultiLagMs <= maximumPerceivedLagMs
    && motionContractPass,
  classification,
  measured: {
    maximumRawClockDeltaMs: Math.round(maximumRawClockDelta * 1000),
    rawClockDeltaSpreadMs: Math.round(rawClockDeltaSpread * 1000),
    maximumFanOutClockErrorMs: maximumFanOutClockError * 1000,
    singleLogicalSwitchMs: Math.round(singleLogicalSwitch * 1000),
    multiLogicalSwitchMs: Math.round(multiLogicalSwitch * 1000),
    multiArrivalReadableMs: Math.round(arrivalReadableMs),
    logicalSingleLagMs: Math.round(logicalSingleLagMs),
    logicalMultiLagMs: Math.round(logicalMultiLagMs),
    perceivedMultiLagMs: Math.round(perceivedMultiLagMs),
    arrivalDurationMs: Math.round(arrivalDurationMs),
    initialOpacity: initialFrame.opacity,
    initialTranslateXPx: initialFrame.translateX,
    motionContractPass,
    switchMismatchCount: switchMismatches.length,
    progressMismatchCount: progressMismatches.length,
    rendererWordProgress,
  },
  firstMismatch: switchMismatches[0] || progressMismatches[0] || null,
};

console.log(JSON.stringify(result, null, 2));
assert.equal(result.ok, true,
  `single-row and multi-row lyrics must switch on time, and multi-row must become readable within one 60 Hz frame; classified ${classification}`);
