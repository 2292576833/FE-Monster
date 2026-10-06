import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in the lyric preference runtime`);
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

function numericConstant(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*(-?[0-9.]+)`));
  assert.ok(match, `${name} must be an explicit numeric value`);
  return Number(match[1]);
}

const preferenceKey = 'fe-monster-lyric-clock-offset-v1';
const stored = new Map([[preferenceKey, JSON.stringify({ version: 1, offsetSeconds: 0.5 })]]);
const state = {
  currentSong: { provider: 'kugou', id: 'song-a', title: 'Song A' },
  lyricClockOffsetsByTrack: {},
};
const sandbox = vm.createContext({
  JSON,
  Math,
  Number,
  Object,
  String,
  LYRIC_CLOCK_OFFSET_PREFERENCE_KEY: preferenceKey,
  LYRIC_CLOCK_OFFSET_MIN_SECONDS: numericConstant('LYRIC_CLOCK_OFFSET_MIN_SECONDS'),
  LYRIC_CLOCK_OFFSET_MAX_SECONDS: numericConstant('LYRIC_CLOCK_OFFSET_MAX_SECONDS'),
  LYRIC_CLOCK_OFFSET_STEP_SECONDS: numericConstant('LYRIC_CLOCK_OFFSET_STEP_SECONDS'),
  LYRIC_CLOCK_OFFSET_PREFERENCE_VERSION: 2,
  LYRIC_CLOCK_OFFSET_TRACK_LIMIT: 200,
  state,
  window: {
    localStorage: {
      getItem(key) { return stored.has(key) ? stored.get(key) : null; },
      setItem(key, value) { stored.set(key, String(value)); },
    },
  },
  clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0)),
  scheduleClientPreferencesSync() {},
  syncLyricClockControls() {},
  resetLyricFrameSync() {},
  syncPlaybackLyricToCurrentTime() {},
  scheduleDesktopSceneSnapshot() {},
  requestOrbFrame() {},
  unlockAppAchievement() {},
  currentAchievementTrackId: () => '',
  queueHighDifficultyAchievementEvidence() {},
});

vm.runInContext(`
  ${extractFunction('normalizeLyricClockOffsetSeconds')}
  ${extractFunction('lyricClockOffsetSongKey')}
  ${extractFunction('normalizeLyricClockOffsetPreferences')}
  ${extractFunction('loadLyricClockOffsetPreference')}
  ${extractFunction('lyricClockOffsetSeconds')}
  ${extractFunction('saveLyricClockOffsetPreference')}
  ${extractFunction('setLyricClockOffsetSeconds')}
  globalThis.preferenceContract = {
    loadLyricClockOffsetPreference,
    lyricClockOffsetSongKey,
    lyricClockOffsetSeconds,
    setLyricClockOffsetSeconds,
  };
`, sandbox, { filename: 'web/app.js#lyric-clock-preference-scope' });

const loaded = JSON.parse(JSON.stringify(sandbox.preferenceContract.loadLyricClockOffsetPreference()));
assert.deepEqual(
  loaded,
  {},
  'legacy v1 global +0.5s calibration must migrate to neutral instead of shifting every song',
);
state.lyricClockOffsetsByTrack = loaded;
assert.equal(sandbox.preferenceContract.lyricClockOffsetSeconds(), 0);

sandbox.preferenceContract.setLyricClockOffsetSeconds(0.5);
assert.equal(
  sandbox.preferenceContract.lyricClockOffsetSeconds(),
  0.5,
  'manual “歌词提前” calibration must still apply to the selected song',
);

state.currentSong = { provider: 'kugou', id: 'song-b', title: 'Song B' };
assert.equal(
  sandbox.preferenceContract.lyricClockOffsetSeconds(),
  0,
  'a calibration made for one song must not leak into the next song',
);
sandbox.preferenceContract.setLyricClockOffsetSeconds(-0.3);
assert.equal(sandbox.preferenceContract.lyricClockOffsetSeconds(), -0.3);

state.currentSong = { provider: 'kugou', id: 'song-a', title: 'Song A' };
assert.equal(
  sandbox.preferenceContract.lyricClockOffsetSeconds(),
  0.5,
  'returning to a song must restore only that song’s calibration',
);

const persisted = JSON.parse(stored.get(preferenceKey));
assert.equal(persisted.version, 2);
assert.deepEqual(persisted.tracks, {
  'kugou|song-a': 0.5,
  'kugou|song-b': -0.3,
});

assert.match(
  appSource,
  /function renderCurrent\(song = state\.currentSong\)[\s\S]*?syncLyricClockControls\(\)/,
  'changing songs must refresh the offset controls for the new song scope',
);
assert.doesNotMatch(
  appSource,
  /lyricPlayback:\s*\{[\s\S]{0,1000}offsetSeconds/,
  'desktop mirroring must transport the already-calibrated effective time, not apply the offset twice',
);
assert.match(
  appSource,
  /lyricClockOffsetPreferenceMigrationPending\s*=\s*true[\s\S]*?async function init\(\)[\s\S]*?scheduleClientPreferencesSync\(\)/,
  'legacy migration must be persisted to the backend preference journal after startup',
);

console.log(JSON.stringify({
  ok: true,
  legacyGlobalOffsetSeconds: 0.5,
  migratedLegacyOffsetSeconds: 0,
  songAOffsetSeconds: persisted.tracks['kugou|song-a'],
  songBOffsetSeconds: persisted.tracks['kugou|song-b'],
}, null, 2));
