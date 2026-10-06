import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const workletSource = fs.readFileSync(
  new URL('../web/vendor/native-spatial/native-pcm-worklet.js', import.meta.url),
  'utf8',
);

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

const latencySource = extractFunction('lyricAudioOutputLatencySeconds');
const timelineSource = extractFunction('lyricTimelineTime');
const reanchorSource = extractFunction('reanchorNativeGoogleObrClock');
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function clockRuntime(state, manualOffsetSeconds = 0) {
  const lyricAudioOutputLatencySeconds = Function(
    'state',
    'clamp',
    'LYRIC_AUDIO_OUTPUT_LATENCY_MAX_SECONDS',
    `return (${latencySource});`,
  )(state, clamp, 0.35);
  const lyricTimelineTime = Function(
    'lyricClockOffsetSeconds',
    'lyricAudioOutputLatencySeconds',
    `return (${timelineSource});`,
  )(() => manualOffsetSeconds, lyricAudioOutputLatencySeconds);
  return { lyricAudioOutputLatencySeconds, lyricTimelineTime };
}

const direct = clockRuntime({
  obrSpatialAudio: { enabled: false, graph: null },
  audioAnalysis: null,
});
assert.equal(direct.lyricTimelineTime(10), 10,
  'the direct media route must keep HTMLMediaElement.currentTime authoritative');

const native = clockRuntime({
  obrSpatialAudio: {
    enabled: true,
    nativeOutputLatencySeconds: 0.128,
    graph: {
      nativeStream: true,
      nativeOutputLatencySeconds: 0.128,
      nativeLatencySampleCount: 12,
      timelineTransitionActive: false,
      timelineResetPromise: null,
      disposed: false,
    },
  },
  audioAnalysis: null,
});
assert.ok(Math.abs(native.lyricTimelineTime(10) - 9.872) < 1e-9,
  `the lyric clock must follow audible native output time; got ${native.lyricTimelineTime(10)}`);

const nativeWithManualOffset = clockRuntime({
  obrSpatialAudio: {
    enabled: true,
    nativeOutputLatencySeconds: 0.128,
    graph: {
      nativeStream: true,
      nativeOutputLatencySeconds: 0.128,
      nativeLatencySampleCount: 12,
      timelineTransitionActive: false,
      timelineResetPromise: null,
      disposed: false,
    },
  },
  audioAnalysis: null,
}, 0.1);
assert.ok(Math.abs(nativeWithManualOffset.lyricTimelineTime(10) - 9.972) < 1e-9,
  'the per-track manual offset must be applied after native audible-clock compensation');

const nativeSeekingOnDryRoute = clockRuntime({
  obrSpatialAudio: {
    enabled: true,
    nativeOutputLatencySeconds: 0.128,
    graph: {
      nativeStream: true,
      nativeOutputLatencySeconds: 0.128,
      nativeLatencySampleCount: 12,
      timelineTransitionActive: true,
      timelineResetPromise: {},
      disposed: false,
    },
  },
  audioAnalysis: null,
});
assert.equal(nativeSeekingOnDryRoute.lyricTimelineTime(10), 10,
  'seek/reset dry-audio continuity must not inherit the native queue delay');

const reanchorNativeGoogleObrClock = Function(
  'clamp',
  'LYRIC_AUDIO_OUTPUT_LATENCY_MAX_SECONDS',
  `return (${reanchorSource});`,
)(clamp, 0.35);
const resetGraph = {
  nativeOutputLatencySeconds: 0.128,
  nativeClockOriginMediaTime: 5,
  nativeClockOriginConsumedFrames: 96000,
  nativeLastMediaTime: 7,
  nativeClockPlaybackRate: 1,
};
reanchorNativeGoogleObrClock(resetGraph, 42);
assert.equal(resetGraph.nativeClockOriginMediaTime, 42,
  'a new native generation must anchor consumed frame zero to the first captured media sample');
assert.equal(resetGraph.nativeClockOriginConsumedFrames, 0,
  'a new native generation must reset the consumed-frame origin');
assert.equal(resetGraph.nativeLastMediaTime, 42,
  'a new native generation must reset media jump detection to the seek target');
assert.match(workletSource, /captureEndFrame:[\s\S]*?captureSampleRate:/,
  'the AudioWorklet must timestamp each captured PCM block');
assert.match(source,
  /captureMediaStartTime[\s\S]*?reanchorNativeGoogleObrClock\([\s\S]*?nativeClockNeedsCaptureOrigin = false/,
  'the native clock must anchor consumed output frames to the captured media sample');

console.log(JSON.stringify({
  ok: true,
  directTime: direct.lyricTimelineTime(10),
  nativeAudibleTime: native.lyricTimelineTime(10),
  nativeLatencyMs: native.lyricAudioOutputLatencySeconds() * 1000,
  seekingDryTime: nativeSeekingOnDryRoute.lyricTimelineTime(10),
  resetCaptureOriginTime: resetGraph.nativeClockOriginMediaTime,
}, null, 2));
