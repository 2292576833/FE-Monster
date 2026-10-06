import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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

let now = 1_100;
const card = {
  progressDragging: false,
  pendingSeekTarget: null,
  seekHandoffTarget: 90,
  seekHandoffStartedAt: 1_000,
  seekHandoffRunning: true,
  seekHandoffSource: 'song-a'
};
const audio = {
  src: 'song-a',
  currentTime: 12,
  duration: 180,
  playbackRate: 1,
  paused: false,
  ended: false,
  seeking: true,
  readyState: 1
};
const sandbox = {
  state: {
    qishuiPlaybackCard: card,
    playerClock: { updatedAt: 0 },
    currentSong: null
  },
  els: { audio },
  performance: { now: () => now },
  QISHUI_SEEK_HANDOFF_TOLERANCE_SECONDS: 0.08,
  QISHUI_SEEK_HANDOFF_MAX_MS: 1_600,
  estimatedPlayerClockTime: () => 0,
  console
};
vm.runInNewContext(`${functionSource('currentPlaybackLyricTime')}\nthis.sample = currentPlaybackLyricTime;`, sandbox);

const handoffSample = sandbox.sample(0);
assert.ok(handoffSample >= 90 && handoffSample < 90.2,
  `stale pre-seek media clock leaked into lyrics: ${handoffSample}`);
assert.equal(card.seekHandoffTarget, 90, 'handoff was cleared before media became ready');

audio.currentTime = 90.04;
audio.seeking = false;
audio.readyState = 4;
now = 1_180;
assert.equal(sandbox.sample(0), 90.04, 'settled media clock was not adopted exactly');
assert.equal(card.seekHandoffTarget, null, 'settled handoff was not released');

card.seekHandoffTarget = 40;
card.seekHandoffStartedAt = 2_000;
card.seekHandoffRunning = false;
card.seekHandoffSource = 'song-a';
audio.currentTime = 9;
audio.seeking = true;
audio.readyState = 1;
audio.paused = true;
now = 2_500;
assert.equal(sandbox.sample(0), 40, 'paused seek handoff must remain fixed at the requested target');

card.seekHandoffTarget = 60;
card.seekHandoffStartedAt = 3_000;
card.seekHandoffRunning = true;
card.seekHandoffSource = 'song-a';
audio.currentTime = 11;
audio.seeking = true;
audio.readyState = 1;
audio.paused = false;
audio.playbackRate = 1.5;
now = 3_200;
const projected = sandbox.sample(0);
assert.ok(Math.abs(projected - 60.3) < 0.0001,
  `playing seek handoff did not advance by elapsed time and playbackRate: ${projected}`);

card.seekHandoffTarget = 70;
card.seekHandoffStartedAt = 4_000;
card.seekHandoffRunning = true;
card.seekHandoffSource = 'song-a';
audio.currentTime = 14;
audio.seeking = false;
audio.readyState = 4;
audio.playbackRate = 1;
now = 5_700;
assert.equal(sandbox.sample(0), 14, 'expired handoff did not fall back to the authoritative media clock');
assert.equal(card.seekHandoffTarget, null, 'expired handoff state was not cleared');

card.seekHandoffTarget = 80;
card.seekHandoffStartedAt = 6_000;
card.seekHandoffRunning = true;
card.seekHandoffSource = 'song-a';
audio.currentTime = 20;
audio.seeking = true;
audio.readyState = 1;
audio.src = 'song-b';
now = 6_100;
assert.equal(sandbox.sample(0), 20, 'handoff leaked across a media source change');
assert.equal(card.seekHandoffTarget, null, 'source-mismatched handoff state was not cleared');

console.log(JSON.stringify({
  ok: true,
  staleSeekClock: handoffSample,
  settledClock: 90.04,
  pausedClock: 40,
  projectedClock: projected,
  timeoutFallbackClock: 14,
  sourceChangeFallbackClock: 20
}, null, 2));
