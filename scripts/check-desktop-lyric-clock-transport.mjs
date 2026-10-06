import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const parametersOpen = appSource.indexOf('(', start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersOpen; index < appSource.length; index += 1) {
    if (appSource[index] === '(') parameterDepth += 1;
    if (appSource[index] === ')') parameterDepth -= 1;
    if (parameterDepth === 0) {
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

const horizonMatch = appSource.match(
  /const\s+DESKTOP_SCENE_LYRIC_EXTRAPOLATION_MAX_SECONDS\s*=\s*([0-9.]+)\s*;/,
);
assert.ok(horizonMatch, 'desktop lyric transport must declare a bounded interpolation horizon');
const horizonSeconds = Number(horizonMatch[1]);
assert.ok(
  horizonSeconds >= 0.25 && horizonSeconds <= 1,
  'desktop interpolation must span ordinary snapshot jitter without running unbounded',
);

const publishIntervalMatch = appSource.match(
  /const\s+DESKTOP_SCENE_LYRIC_PUBLISH_INTERVAL_MS\s*=\s*([0-9.]+)\s*;/,
);
assert.ok(publishIntervalMatch, 'desktop lyric transport must declare a bounded anchor interval');
const publishIntervalMs = Number(publishIntervalMatch[1]);
assert.ok(
  publishIntervalMs >= 40 && publishIntervalMs <= 200,
  'desktop lyric anchors must reduce bridge traffic without becoming visibly stale',
);

const runtime = { lyricClock: null };
let nowMs = 1_000;
const sandbox = vm.createContext({
  Math,
  Number,
  DESKTOP_SCENE_CLIENT: true,
  DESKTOP_SCENE_LYRIC_EXTRAPOLATION_MAX_SECONDS: horizonSeconds,
  desktopSceneRuntime: runtime,
  performance: { now: () => nowMs },
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  },
});

vm.runInContext(`
  ${extractFunction('desktopSceneEffectiveLyricTimeAt')}
  ${extractFunction('updateDesktopSceneLyricClock')}
  globalThis.contract = { desktopSceneEffectiveLyricTimeAt, updateDesktopSceneLyricClock };
`, sandbox, { filename: 'web/app.js#desktop-lyric-clock-transport' });

sandbox.contract.updateDesktopSceneLyricClock(20, 120, true, 1.5);
assert.equal(runtime.lyricClock.playbackRate, 1.5, 'the mirrored clock must retain playbackRate');

const atDelivery = sandbox.contract.desktopSceneEffectiveLyricTimeAt(runtime.lyricClock, 1_000, 0.2);
const afterOneFrame = sandbox.contract.desktopSceneEffectiveLyricTimeAt(runtime.lyricClock, 1_016, 0.2);
assert.ok(Math.abs(atDelivery - 20) <= 1e-9);
assert.ok(
  Math.abs(afterOneFrame - 20.024) <= 1e-9,
  'the receiving surface must advance smoothly between authoritative snapshots',
);

const afterLongGap = sandbox.contract.desktopSceneEffectiveLyricTimeAt(runtime.lyricClock, 61_000, 0.2);
const maximumExpected = 20 + horizonSeconds * 1.5;
assert.ok(
  Math.abs(afterLongGap - maximumExpected) <= 1e-9,
  'transport interpolation must stop at its drift bound when snapshots disappear',
);

nowMs = 2_000;
sandbox.contract.updateDesktopSceneLyricClock(33, 120, false, 1.5);
const pausedLater = sandbox.contract.desktopSceneEffectiveLyricTimeAt(runtime.lyricClock, 3_000, 0.2);
assert.ok(Math.abs(pausedLater - 33) <= 1e-9, 'paused mirrored lyrics must remain frozen');

const rawAudioDuration = 120;
const positiveLyricOffset = 0.8;
const effectiveLyricDuration = rawAudioDuration + positiveLyricOffset;
nowMs = 4_000;
sandbox.contract.updateDesktopSceneLyricClock(120.6, effectiveLyricDuration, true, 1);
const nearPositiveOffsetBoundary = sandbox.contract.desktopSceneEffectiveLyricTimeAt(
  runtime.lyricClock,
  4_100,
  0,
);
assert.ok(
  Math.abs(nearPositiveOffsetBoundary - 120.7) <= 1e-9,
  'a positive lyric offset must keep advancing in the effective lyric timeline near the audio-duration boundary',
);

assert.match(
  extractFunction('desktopSceneSnapshot'),
  /effectiveLyricDuration\s*=\s*duration\s*>\s*0\s*\?\s*lyricTimelineTime\(duration,\s*0\)\s*:\s*0/,
  'desktop snapshots must convert the raw audio duration into the effective lyric timeline',
);
assert.match(
  appSource,
  /updateDesktopSceneLyricClock\([\s\S]*?lyricPlayback\.effectiveLyricTime,[\s\S]*?lyricPlayback\.effectiveLyricDuration/,
  'the receiver must clamp its effective lyric clock against an effective lyric duration',
);

assert.match(
  appSource,
  /lyricPlayback:\s*\{[\s\S]*?playbackRate\s*[:,]/,
  'desktop snapshots must carry playbackRate with the media anchor',
);
assert.match(
  extractFunction('scheduleDesktopSceneSnapshot'),
  /document\.hidden[\s\S]*?publishDesktopSceneSnapshot\(\)/,
  'hidden playback windows must publish event-driven clock anchors without waiting for rAF',
);

const scheduledCallbacks = [];
let scheduledPublishCount = 0;
let schedulerNowMs = 1_000;
const schedulerRuntime = {
  enabled: true,
  applying: false,
  publishFrame: 0,
  lastLyricClockPublishAt: 1_000,
};
const schedulerSandbox = vm.createContext({
  DESKTOP_SCENE_CLIENT: false,
  DESKTOP_SCENE_LYRIC_PUBLISH_INTERVAL_MS: publishIntervalMs,
  desktopSceneRuntime: schedulerRuntime,
  document: { hidden: false },
  performance: { now: () => schedulerNowMs },
  window: {
    requestAnimationFrame(callback) {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length;
    },
    cancelAnimationFrame() {},
  },
  publishDesktopSceneSnapshot() {
    scheduledPublishCount += 1;
    schedulerRuntime.publishFrame = 0;
    schedulerRuntime.lastLyricClockPublishAt = schedulerNowMs;
  },
});
vm.runInContext(`
  ${extractFunction('scheduleDesktopSceneSnapshot')}
  globalThis.schedule = scheduleDesktopSceneSnapshot;
`, schedulerSandbox, { filename: 'web/app.js#desktop-lyric-scheduler' });

schedulerSandbox.schedule({ lyricClockFrame: true });
assert.equal(scheduledCallbacks.length, 0, 'adjacent lyric frames must not clone a full desktop snapshot');

schedulerSandbox.schedule();
assert.equal(scheduledCallbacks.length, 1, 'structural scene changes must bypass the lyric-clock throttle');
scheduledCallbacks.shift()(schedulerNowMs);
assert.equal(scheduledPublishCount, 1);

schedulerNowMs += publishIntervalMs;
schedulerSandbox.schedule({ lyricClockFrame: true });
assert.equal(scheduledCallbacks.length, 1, 'a due media-clock anchor must publish on the next paint frame');
scheduledCallbacks.shift()(schedulerNowMs);
assert.equal(scheduledPublishCount, 2);

console.log(JSON.stringify({
  ok: true,
  horizonSeconds,
  publishIntervalMs,
  atDelivery,
  afterOneFrame,
  afterLongGap,
  pausedLater,
  nearPositiveOffsetBoundary,
}, null, 2));
