import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function harmonicStateSongSignature()');
const end = source.indexOf('function harmonicStateRuntimeSnapshot()', start);
const state = {
  currentSong: { id: '1', provider: 'qq', title: '音乐', artist: '歌手', position: 0 },
  lyricIndex: 0, lyricLines: Array.from({ length: 10 }, (_, index) => ({ text: '歌词' + index, time: index * 3, endTime: index * 3 + 2 })),
  playbackPage: true, harmonicState: { runtime: {}, zoom: 1.1, frame: {} },
  audioAnalysis: { live: true, bass: 0.6 }, visual: {}, playbackVisual: { yaw: 0, pitch: 0, zoom: 0.7 },
  presetFsr: { lastDiagnostics: {} }
};
const sandbox = { state, window: { FeHarmonicStateRuntime: { update: (_runtime, frame) => structuredClone(frame) } },
  els: { audio: { duration: 30 } }, performance: { now: () => 7000 },
  safeText: (value, fallback = '') => value == null ? fallback : String(value),
  clamp: (n, low, high) => Math.max(low, Math.min(high, n)),
  isHarmonicStatePreset: () => true, isPlaybackClockRunning: () => true,
  reducedMotion: false, HARMONIC_DEFAULT_ZOOM: 2.35, presetFsrOutputPixelRatio: () => 1,
  playbackLyricText: () => 'old line', playbackLyricSubtitle: () => 'old subtitle',
  applyHarmonicStatePalette() {}, proxiedImageUrl: value => value,
  currentPlaybackLyricTime: () => 13, effectivePlaybackLyricTime: value => value + 0.2,
  findLyricIndexAtDisplayTime: (lines, time) => lines.findLastIndex(line => line.time <= time),
  bookLyricProgressEndTime: (_line, end) => end,
  lyricProgressForLineAtTime: (_line, time) => { assert.equal(time, 13.2); return 0.6; }
};
const secondaryStart = source.indexOf('function playbackLyricSubtitle(');
const secondaryEnd = source.indexOf('const LYRIC_TIME_PATTERN', secondaryStart);
vm.runInNewContext(source.slice(secondaryStart, secondaryEnd) + source.slice(start, end)
  + '\nupdateHarmonicStateMotion();', sandbox);
const frame = state.harmonicState.frame;
assert.equal(frame.zoom, 1.1, 'lyric frames retain the harmonic view independently of other scenes');
assert.equal(frame.entries.length, 7);
assert.equal(frame.entries[3].text, '歌词4', 'must sample current audio position, not stale global lyric index');
assert.equal(frame.entries[3].active, true);
assert.equal(frame.lyricFraction, 0.6, 'word progress must use the shared lyric clock');
state.lyricLines[4].translationText = 'Translation for line four';
state.bilingualLyricsEnabled = false;
vm.runInNewContext('updateHarmonicStateMotion();', sandbox);
assert.equal(frame.entries[3].subtitle, '歌手', 'disabled bilingual lyrics must fall back to artist');
state.bilingualLyricsEnabled = true;
vm.runInNewContext('updateHarmonicStateMotion();', sandbox);
assert.equal(frame.entries[3].subtitle, 'Translation for line four', 'enabled bilingual lyrics must show translation');
state.lyricLines[4].translationText = '歌词4';
vm.runInNewContext('updateHarmonicStateMotion();', sandbox);
assert.equal(frame.entries[3].subtitle, '歌手', 'translation identical to original should not be duplicated');
const oldSongKey = frame.songKey;
state.currentSong.id = '2';
vm.runInNewContext('updateHarmonicStateMotion();', sandbox);
assert.notEqual(state.harmonicState.frame.songKey, oldSongKey, 'same-name recordings need distinct carousel identity');
console.log('PASS harmonic carousel uses authoritative audio time, seven lyric entries, and recording identity');
