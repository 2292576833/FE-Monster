import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const desktopLyrics = fs.readFileSync(path.join(root, 'web', 'desktop-lyrics.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

const context = vm.createContext({
  Math,
  Number,
  isFinite,
  clamp(value, min, max, fallback) {
    const numeric = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
  }
});
vm.runInContext(`${extractFunction(desktopLyrics, 'lyricProgressFromSnapshot')}; this.read = lyricProgressFromSnapshot;`, context);

const snapshot = {
  effectiveLyricTime: 12.5,
  lyricLineStartTime: 12,
  lyricLineEndTime: 14,
  progress: 0.91,
  playing: true
};
assert.equal(context.read(snapshot), 0.25, 'effective lyric time must determine desktop lyric progress');

snapshot.playing = false;
assert.equal(context.read(snapshot), 0.25, 'play/pause animation state must not alter snapshot lyric progress');
assert.equal(
  context.read({ effectiveLyricTime: null, lyricLineStartTime: null, lyricLineEndTime: null, progress: 0.4 }),
  0.4,
  'legacy snapshots without a complete time window must retain their supplied progress'
);

assert.doesNotMatch(
  desktopLyrics,
  /progressReceivedAt|performance\.now\(\)[\s\S]{0,160}progressSpan/,
  'desktop lyric highlight must not self-advance from a performance clock'
);

vm.runInContext(
  `${extractFunction(app, 'desktopSceneEffectiveLyricTimeAt')}; this.readSceneTime = desktopSceneEffectiveLyricTimeAt;`,
  context
);
const effectiveClock = {
  time: 10.2,
  updatedAt: 1000,
  playing: true
};
assert.equal(
  context.readSceneTime(effectiveClock, 1500, 0.22),
  10.42,
  'desktop scene must render the latest calibrated media sample without recalibrating it'
);
assert.equal(
  context.readSceneTime(effectiveClock, 61_000, 0.22),
  10.42,
  'desktop scene must not create a second performance-based playback clock'
);
assert.match(
  app,
  /lyricPlayback:\s*\{[\s\S]*?effectiveLyricTime\s*[:,]/,
  'desktop scene snapshot must carry effective lyric time explicitly'
);
assert.match(
  app,
  /lyricPlayback:\s*\{[\s\S]*?lyricLineStartTime[\s\S]*?lyricLineEndTime/,
  'desktop scene snapshot must carry the active lyric line time window'
);
assert.match(
  app,
  /updateDesktopSceneLyricClock\([\s\S]*?lyricPlayback\.effectiveLyricTime/,
  'desktop scene receiver must install the effective lyric clock'
);
assert.match(
  app,
  /function effectivePlaybackLyricTime[\s\S]*?desktopSceneEffectiveLyricTimeAt[\s\S]*?lyricTimelineTime/,
  'all lyric surfaces need one effective-clock gateway with a main-window fallback'
);
assert.match(
  app,
  /function updatePlaybackLyricAtTime[\s\S]*?effectivePlaybackLyricTime/,
  'single-row and 3D lyrics must consume effective lyric time'
);
assert.match(
  app,
  /function qishuiPlaybackBookFrame[\s\S]*?effectivePlaybackLyricTime/,
  'new playback-bar lyrics must consume effective lyric time'
);
assert.match(
  app,
  /function multiRowLyricHighlightProgress[\s\S]*?effectivePlaybackLyricTime/,
  'multi-row lyric highlights must consume effective lyric time'
);
assert.match(
  app,
  /const initialEffectiveLyricTime[\s\S]*?setPlaybackLyricLine\([\s\S]*?initialEffectiveLyricTime[\s\S]*?updateBookLyricLines\([\s\S]*?initialEffectiveLyricTime/,
  'desktop scene first-frame book glyphs must use the snapshot effective clock'
);

console.log(JSON.stringify({
  ok: true,
  effectiveProgress: context.read(snapshot),
  mirroredSceneTime: context.readSceneTime(effectiveClock, 1500, 0.22)
}, null, 2));
