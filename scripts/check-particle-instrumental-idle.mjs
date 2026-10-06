import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function particleLyricHasContent(');
const end = source.indexOf('function particleLyricsRuntimeSnapshot(', start);
assert.ok(start >= 0 && end > start);
const state = {
  currentSong: { id: 'song', position: 1, duration: 30 }, lyricSignature: 'song', lyricNoLyricSignature: '',
  lyricLines: [], particleLyrics: { runtime: {}, frame: {} }, audioAnalysis: {}, visual: {}
};
const context = vm.createContext({
  state, els: { audio: {} }, performance: { now: () => 1000 }, reducedMotion: false,
  safeText: (value, fallback = '') => value == null ? fallback : String(value),
  particleLyricsVisible: () => true, currentPlaybackLyricTime: value => value,
  effectivePlaybackLyricTime: value => value,
  findLyricIndexAtDisplayTime(lines, time) { let found = -1; lines.forEach((line, i) => { if (line.time <= time) found = i; }); return found; },
  bookLyricProgressEndTime: (line, fallback) => line?.endTime ?? fallback,
  isPlaybackClockRunning: () => true, lyricSignatureForSong: song => song.id,
  harmonicStateSongSignature: () => state.currentSong.id,
  glyphTimingsFromWordTimings: () => [], textFontFamilyStack: () => 'sans-serif', renderPixelRatio: () => 1,
  $: () => null, window: { FeParticleLyricsRuntime: { resize() {}, update() {} } }
});
vm.runInContext(source.slice(start, end), context);
const frame = () => { context.updateParticleLyricsMotion(); return state.particleLyrics.frame; };
for (const text of ['', '   ', '纯音乐，请欣赏', '【純音樂，請欣賞】', '纯音乐，无歌词',
  '暂无歌词', 'Instrumental', 'This song is instrumental, please enjoy.', 'No lyrics available',
  'Lyrics unavailable', '♪ ♫ …', '作曲：某某', 'Composer: Someone']) {
  state.lyricLines = text ? [{ time: 0, text }] : [];
  const value = frame();
  assert.equal(value.hasLyrics, false, `${text || 'empty lyrics'} must allow instrumental standby`);
  assert.equal(value.hasLyric, false);
  assert.equal(value.text, '');
  assert.equal(value.fallbackText, '', 'a notice must not become a keep-awake fallback lyric');
}
for (const text of ['Music', '纯音乐一样的你', 'No lyrics tonight', '作词的人也会哭', '听见星光']) {
  state.lyricLines = [{ time: 0, text }];
  assert.equal(frame().hasLyrics, true, `a real lyric sentence stays active: ${text}`);
}
state.lyricLines = [
  { time: 0, text: '纯音乐，请欣赏' },
  { time: 5, endTime: 7, text: '第一句歌词' },
  { time: 8, text: '♪ ♫' },
  { time: 12, text: '第二句歌词' }
];
assert.equal(frame().fallbackText, '第一句歌词', 'a lyric song intro retains its first real lyric');
state.currentSong.position = 9;
assert.equal(frame().fallbackText, '第一句歌词', 'a lyric song interlude retains the previous real lyric');
const cached = state.particleLyrics.runtime.lyricContentCache;
for (let i = 0; i < 120; i++) frame();
assert.equal(state.particleLyrics.runtime.lyricContentCache, cached, 'classification is cached across render frames');
state.lyricLines = [{ time: 0, text: '纯音乐，请欣赏' }];
assert.equal(frame().hasLyrics, false, 'replacing loaded lyrics invalidates the classification');
state.lyricLines = [{ time: 0, text: '上一首的歌词' }];
state.currentSong.id = 'next-instrumental';
assert.equal(frame().hasLyrics, false, 'switching tracks never reuses the previous song lyrics');
state.lyricSignature = state.currentSong.id;
state.lyricNoLyricSignature = state.currentSong.id;
assert.equal(frame().hasLyrics, false, 'explicit provider no-lyric status still takes precedence');
console.log('PASS particle instrumental standby: notices, credits, real lyrics, intros, interludes, cache and track changes');
