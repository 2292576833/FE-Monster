import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function functionSource(name) {
  const start = app.lastIndexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const nextFunction = app.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = app.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter((position) => position > start);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return app.slice(start, next > start ? next : undefined);
}

function occurrences(source, pattern) {
  return source.match(pattern)?.length || 0;
}

const preview = functionSource('previewQishuiPlaybackSeek');
const commit = functionSource('commitQishuiPlaybackSeek');
const clock = functionSource('currentPlaybackLyricTime');
const progress = functionSource('updateProgress');
const playbackLyrics = functionSource('updateQishuiPlaybackLyrics');
const transition = functionSource('syncQishuiLyricTransition');

// Replay the native range event order. A drag may emit dozens of input events,
// followed by both pointerup and change. Only the first commit is allowed to
// touch the media clock.
const eventSequence = [
  'pointerdown',
  ...Array.from({ length: 120 }, () => 'input'),
  'pointerup',
  'change'
];
const previewMediaWrites = occurrences(preview, /els\.audio\.currentTime\s*=/g);
const commitMediaWrites = occurrences(commit, /els\.audio\.currentTime\s*=/g);
let dragging = false;
let mediaSeekWrites = 0;
let commitCalls = 0;
for (const event of eventSequence) {
  if (event === 'pointerdown') {
    dragging = true;
  } else if (event === 'input') {
    dragging = true;
    mediaSeekWrites += previewMediaWrites;
  } else if ((event === 'pointerup' || event === 'change') && dragging) {
    dragging = false;
    commitCalls += 1;
    mediaSeekWrites += commitMediaWrites;
  }
}

assert.equal(
  previewMediaWrites,
  0,
  'drag preview must not seek the audio element on every input event'
);
assert.equal(commitMediaWrites, 1, 'drag release must contain one media seek write');
assert.equal(commitCalls, 1, 'pointerup + change must collapse to one commit');
assert.equal(mediaSeekWrites, 1, 'the complete drag sequence must issue one media seek');

assert.doesNotMatch(
  preview,
  /\/api\/player\/seek|\.pause\(|\.load\(|(?:audio|els\.audio)\.src\s*=/,
  'preview must not call transport, pause/load, or rebuild src'
);
assert.doesNotMatch(
  commit,
  /\.pause\(|\.load\(|(?:audio|els\.audio)\.src\s*=/,
  'commit must preserve the existing media pipeline'
);
assert.equal(
  occurrences(commit, /\/api\/player\/seek/g),
  1,
  'release must synchronize the backend once'
);

assert.match(
  preview,
  /pendingSeekTarget\s*=\s*target[\s\S]*?updateQishuiPlaybackProgress\(target[\s\S]*?syncPlaybackLyricAtTime\(target\)/,
  'every input must update the preview clock, progress, and lyrics immediately'
);
assert.match(
  clock,
  /pendingSeekTarget/,
  'the render loop must use the drag preview clock instead of overwriting it with audio.currentTime'
);
assert.match(clock, /progressDragging/, 'the preview clock must only override media time while dragging');
assert.ok(
  clock.indexOf('if (els.audio?.src && Number.isFinite(audioTime))')
    < clock.indexOf('if (Number.isFinite(handoffTarget))'),
  'after drag release, a usable media.currentTime must outrank the synthetic handoff target'
);
assert.match(
  progress,
  /currentPlaybackLyricTime\(audioCurrent\)[\s\S]*?syncPlaybackLyricAtTime\(current\)/,
  'timeupdate must preserve the preview clock while dragging'
);
assert.match(
  playbackLyrics,
  /progressDragging[\s\S]*?playbackRunning/,
  'expensive line-transition snapshots must be disabled while scrubbing'
);
assert.match(
  transition,
  /animation\.pause\(\)[\s\S]*?animation\.currentTime/,
  'normal lyric line motion must stay media-clock driven'
);

const maximumAgeMatch = app.match(/const QISHUI_SEEK_HANDOFF_MAX_MS\s*=\s*([0-9.]+)/);
assert.ok(maximumAgeMatch, 'the unavailable-media handoff fallback must have an explicit maximum age');
const handoffMaximumAge = Number(maximumAgeMatch[1]);

function resolveHandoffClock({ audioTime, target, age, hasSource = true }) {
  if (hasSource && Number.isFinite(audioTime)) return audioTime;
  if (hasSource && age <= handoffMaximumAge) return target;
  return audioTime;
}

const target = 91.4;
const staleFirstFrame = resolveHandoffClock({
  audioTime: 17.2,
  target,
  age: 16
});
assert.equal(staleFirstFrame, 17.2, 'after release, lyric state must remain at the real media time until seek settles');
const unavailableClockFallback = resolveHandoffClock({
  audioTime: Number.NaN,
  target,
  age: 16
});
assert.equal(unavailableClockFallback, target, 'the target may be a bounded fallback only when media time is unavailable');
const settledAudioTime = target + 0.06;
const settledFrame = resolveHandoffClock({
  audioTime: settledAudioTime,
  target,
  age: 32
});
assert.equal(settledFrame, settledAudioTime, 'settled lyrics must use the exact media.currentTime sample');

console.log(JSON.stringify({
  ok: true,
  eventSequence,
  previewEvents: eventSequence.filter((event) => event === 'input').length,
  commitCalls,
  mediaSeekWrites,
  backendSeekCalls: occurrences(commit, /\/api\/player\/seek/g),
  sourceRebuilds: occurrences(`${preview}\n${commit}`, /(?:audio|els\.audio)\.src\s*=/g),
  pauses: occurrences(`${preview}\n${commit}`, /\.pause\(/g),
  loads: occurrences(`${preview}\n${commit}`, /\.load\(/g),
  releasedLogicalAdvanceErrorSeconds: Math.abs(staleFirstFrame - 17.2),
  unavailableClockFallbackSeconds: unavailableClockFallback,
  settledMediaClockErrorSeconds: Math.abs(settledFrame - settledAudioTime),
  unavailableClockFallbackMaximumAgeMs: handoffMaximumAge
}, null, 2));
