import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function numericConstant(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  assert.ok(match, `${name} must be an explicit numeric clock bound`);
  return Number(match[1]);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in the lyric runtime`);
  const open = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced body`);
}

const media = {
  currentTime: 12.345,
  src: 'fixture://authoritative-media',
  paused: false,
  ended: false,
};
const state = {
  currentSong: { position: 3 },
  playerClock: { position: 3, updatedAt: 1, playing: true },
  qishuiPlaybackCard: {
    progressDragging: false,
    pendingSeekTarget: null,
    seekHandoffTarget: null,
    seekHandoffStartedAt: 0,
  },
};
let rendered = null;
let snapshotScheduleCount = 0;
let lyricOffsetSeconds = 0;
let wallClockMs = 50_000;
const sandbox = vm.createContext({
  Number,
  Math,
  state,
  els: { audio: media },
  DESKTOP_SCENE_CLIENT: false,
  desktopSceneRuntime: { lyricClock: null },
  performance: { now: () => wallClockMs },
  LYRIC_TIMESTAMP_COMPENSATION_SECONDS: numericConstant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS'),
  MULTI_ROW_LYRIC_VISUAL_LEAD_SECONDS: numericConstant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS'),
  BOOK_LYRIC_VISUAL_LEAD_SECONDS: numericConstant('BOOK_LYRIC_VISUAL_LEAD_SECONDS'),
  QISHUI_SEEK_HANDOFF_TOLERANCE_SECONDS: numericConstant('QISHUI_SEEK_HANDOFF_TOLERANCE_SECONDS'),
  QISHUI_SEEK_HANDOFF_MAX_MS: numericConstant('QISHUI_SEEK_HANDOFF_MAX_MS'),
  clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0)),
  estimatedPlayerClockTime: () => 3,
  lyricAudioOutputLatencySeconds: () => 0,
  lyricClockOffsetSeconds: () => lyricOffsetSeconds,
  playbackDurationForLyricSpeed: () => 14,
  updatePlaybackLyricAtTime(time, visualLead) {
    rendered = { time, visualLead };
  },
  scheduleDesktopSceneSnapshot() {
    snapshotScheduleCount += 1;
  },
});

vm.runInContext(`
  ${extractFunction('currentPlaybackLyricTime')}
  ${extractFunction('syncPlaybackLyricAtTime')}
  ${extractFunction('lyricTimelineTime')}
  ${extractFunction('desktopSceneEffectiveLyricTimeAt')}
  ${extractFunction('effectivePlaybackLyricTime')}
  ${extractFunction('findLyricIndexAtDisplayTime')}
  ${extractFunction('findLyricIndexAtTime')}
  ${extractFunction('playbackLyricVisualLeadSeconds')}
  ${extractFunction('computeMultiLyricHighlightProgress')}
  ${extractFunction('multiRowLyricHighlightProgress')}
  globalThis.clockContract = {
    currentPlaybackLyricTime,
    syncPlaybackLyricAtTime,
    lyricTimelineTime,
    desktopSceneEffectiveLyricTimeAt,
    findLyricIndexAtTime,
    playbackLyricVisualLeadSeconds,
    multiRowLyricHighlightProgress,
  };
`, sandbox, { filename: 'web/app.js#media-authoritative-lyric-clock' });

sandbox.clockContract.syncPlaybackLyricAtTime(3.25);
assert.equal(
  rendered?.time,
  media.currentTime,
  'a stale caller snapshot must never override a usable media.currentTime',
);
const normalPlaybackMeasurement = {
  mediaTime: media.currentTime,
  renderedTime: rendered.time,
};
assert.equal(
  snapshotScheduleCount,
  1,
  'each authoritative lyric sample must queue a mirrored snapshot instead of relying on a second clock',
);

const clockSampleErrorsSeconds = [rendered.time - media.currentTime];

function sampleMediaClock(mediaTime, callerTime = mediaTime, expectedTime = mediaTime) {
  media.currentTime = mediaTime;
  rendered = null;
  sandbox.clockContract.syncPlaybackLyricAtTime(callerTime);
  assert.ok(rendered, 'every clock sample must render a lyric frame');
  clockSampleErrorsSeconds.push(rendered.time - expectedTime);
  return rendered.time;
}

function measureRefreshRate(refreshRate) {
  const frameSeconds = 1 / refreshRate;
  const switchTimestamp = 10.007;
  const firstFrameTime = 9.95;
  let switchObservation = Number.NaN;
  let maximumSampleError = 0;
  for (let frame = 0; frame < refreshRate; frame += 1) {
    const mediaTime = firstFrameTime + frame * frameSeconds;
    const stalePollingTime = mediaTime - 0.137;
    const observed = sampleMediaClock(mediaTime, stalePollingTime);
    maximumSampleError = Math.max(maximumSampleError, Math.abs(observed - mediaTime));
    if (!Number.isFinite(switchObservation) && observed >= switchTimestamp) switchObservation = observed;
  }
  const switchLagMs = (switchObservation - switchTimestamp) * 1000;
  assert.ok(maximumSampleError <= 1e-9, `${refreshRate} Hz samples must use media.currentTime exactly`);
  assert.ok(
    switchLagMs >= -1e-9 && switchLagMs <= 1000 / refreshRate + 1e-9,
    `${refreshRate} Hz line switching must be bounded by one display frame`,
  );
  return { refreshRate, maximumSampleErrorMs: maximumSampleError * 1000, switchLagMs };
}

const refreshMeasurements = [measureRefreshRate(60), measureRefreshRate(120)];

const beforeBackground = sampleMediaClock(22.5, 22.5);
const afterBackground = sampleMediaClock(39.875, beforeBackground);
assert.equal(afterBackground, 39.875, 'the first callback after background throttling must catch up to media.currentTime');

media.paused = true;
assert.equal(sampleMediaClock(41.125, 39.875), 41.125, 'pause must freeze at the media element position');
wallClockMs += 120_000;
const pausedAfterLongWallTime = sampleMediaClock(41.125, 161.125);
assert.equal(
  pausedAfterLongWallTime,
  41.125,
  'paused lyrics must not advance when only the wall clock advances',
);
media.paused = false;
assert.equal(sampleMediaClock(41.141, 41.125), 41.141, 'resume must continue from the media element position');

media.playbackRate = 1.75;
const rateStartMediaTime = 42;
const rateStartWallTime = wallClockMs;
let maximumPlaybackRateError = 0;
for (let frame = 0; frame <= 120; frame += 1) {
  const elapsedSeconds = frame / 120;
  wallClockMs = rateStartWallTime + elapsedSeconds * 1000;
  const expectedMediaTime = rateStartMediaTime + elapsedSeconds * media.playbackRate;
  const observed = sampleMediaClock(expectedMediaTime, rateStartMediaTime + elapsedSeconds);
  maximumPlaybackRateError = Math.max(maximumPlaybackRateError, Math.abs(observed - expectedMediaTime));
}
assert.ok(
  maximumPlaybackRateError <= 1e-9,
  'playback-rate changes must be inherited from media.currentTime without a parallel rate accumulator',
);
media.playbackRate = 1;

media.src = 'fixture://next-track';
state.currentSong = { position: 144 };
state.playerClock = { position: 144, updatedAt: 1, playing: true };
assert.equal(sampleMediaClock(0.125, 144), 0.125, 'a track change must discard the previous track clock immediately');

assert.equal(sampleMediaClock(30, 29.8), 30, 'pre-seek lyrics must follow the current media position');
state.qishuiPlaybackCard.progressDragging = true;
state.qishuiPlaybackCard.pendingSeekTarget = 75;
assert.equal(sampleMediaClock(30, 30, 75), 75, 'an active drag preview may intentionally show its pending target');

state.qishuiPlaybackCard.progressDragging = false;
state.qishuiPlaybackCard.pendingSeekTarget = null;
state.qishuiPlaybackCard.seekHandoffTarget = 75;
state.qishuiPlaybackCard.seekHandoffStartedAt = 49_990;
assert.equal(
  sampleMediaClock(30, 75),
  30,
  'after release, a synthetic seek target must not override the media element clock',
);
assert.equal(sampleMediaClock(75.012, 75), 75.012, 'post-seek lyrics must follow the settled media position');

const mirroredMediaClock = { time: 18.4, updatedAt: 1_000, playing: true };
const mirroredAtDelivery = sandbox.clockContract.desktopSceneEffectiveLyricTimeAt(
  mirroredMediaClock,
  1_000,
  0.22,
);
const mirroredAfterThrottle = sandbox.clockContract.desktopSceneEffectiveLyricTimeAt(
  mirroredMediaClock,
  61_000,
  0.22,
);
assert.ok(
  Math.abs(mirroredAtDelivery - 18.62) <= 1e-9,
  'a mirrored media sample may apply only the requested visual lead',
);
assert.ok(
  Math.abs(mirroredAfterThrottle - mirroredAtDelivery) <= 1e-9,
  'a mirrored lyric clock must not invent elapsed playback time from performance.now()',
);

state.multiRowLyricsEnabled = true;
state.textPreset = 'default';
state.lyricProgressPercent = 0;
lyricOffsetSeconds = 0.4;
media.currentTime = 20;
const offsetLead = sandbox.clockContract.playbackLyricVisualLeadSeconds();
const earlierDisplayTime = sandbox.clockContract.lyricTimelineTime(
  sandbox.clockContract.currentPlaybackLyricTime(),
  offsetLead,
);
assert.ok(Math.abs(earlierDisplayTime - 20.4) <= 1e-9, 'a positive user offset must advance exactly once');
lyricOffsetSeconds = -0.3;
const laterDisplayTime = sandbox.clockContract.lyricTimelineTime(
  sandbox.clockContract.currentPlaybackLyricTime(),
  offsetLead,
);
assert.ok(Math.abs(laterDisplayTime - 19.7) <= 1e-9, 'a negative user offset must delay exactly once');

lyricOffsetSeconds = 0;
const wrappedSentenceModel = {
  lines: [
    { time: 10, endTime: 12, text: '一句歌词的第一视觉行' },
    { time: 12, endTime: 14, text: '一句歌词的第二视觉行' },
  ],
};
media.currentTime = 11.75;
const sampledDisplayTime = 10.5;
const firstVisualLineProgress = sandbox.clockContract.multiRowLyricHighlightProgress(
  wrappedSentenceModel,
  0,
  sampledDisplayTime,
);
assert.ok(
  Math.abs(firstVisualLineProgress - 0.25) <= 1e-9,
  'multi-row progressive highlight must reuse the frame sample instead of reading a second clock',
);
media.currentTime = 13.75;
const secondVisualLineProgress = sandbox.clockContract.multiRowLyricHighlightProgress(
  wrappedSentenceModel,
  1,
  12.5,
);
assert.ok(
  Math.abs(secondVisualLineProgress - 0.25) <= 1e-9,
  'the next lyric row must begin its own progressive highlight from the same sampled timeline',
);
assert.equal(
  sandbox.clockContract.findLyricIndexAtTime(wrappedSentenceModel.lines, 12.5, offsetLead),
  1,
  'multi-row line selection must switch from the calibrated media sample',
);
assert.match(
  appSource,
  /function renderMultiRowLyrics\(force = false, currentTime = Number\.NaN\)[\s\S]*?multiRowLyricHighlightProgress\(displayModel, active, currentTime\)[\s\S]*?setSequentialLyricHighlight\(main, main, progress\)/,
  'a wrapped sentence must feed the sampled progress into sequential visual-line highlighting',
);

const maximumClockSampleErrorMs = Math.max(
  ...clockSampleErrorsSeconds.map((error) => Math.abs(error) * 1000),
);
const fixedUncommandedLagMs = clockSampleErrorsSeconds.reduce((total, error) => total + error, 0)
  / clockSampleErrorsSeconds.length * 1000;
const maximumOffsetErrorMs = Math.max(
  Math.abs(earlierDisplayTime - 20.4),
  Math.abs(laterDisplayTime - 19.7),
) * 1000;
assert.ok(maximumClockSampleErrorMs <= 1e-6, 'authoritative clock samples must have no measurable source error');
assert.ok(Math.abs(fixedUncommandedLagMs) <= 1e-6, 'the lyric clock must add no fixed uncommanded lag');
assert.ok(maximumOffsetErrorMs <= 1e-6, 'the requested user offset must be applied exactly once');

console.log(JSON.stringify({
  ok: true,
  normalPlaybackMeasurement,
  refreshMeasurements,
  backgroundCatchUpErrorMs: Math.abs(afterBackground - 39.875) * 1000,
  pausedWallClockDriftMs: Math.abs(pausedAfterLongWallTime - 41.125) * 1000,
  maximumPlaybackRateErrorMs: maximumPlaybackRateError * 1000,
  maximumClockSampleErrorMs,
  fixedUncommandedLagMs,
  maximumOffsetErrorMs,
  multiRowProgress: {
    firstLineAt10_5: firstVisualLineProgress,
    secondLineAt12_5: secondVisualLineProgress,
  },
}, null, 2));
