import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
function block(name, next) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${next}(`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} exists`);
  return source.slice(start, end);
}
let offset = 0, latency = 0, calibrations = 0, captured;
const state = {
  lyricLines: [
    { time: 2, endTime: 6, autoVocalEndTime: 3, text: '第一句' },
    { time: 6, endTime: 10, text: '第二句' }
  ], lyricIndex: -1, textPreset: 'plain', playbackVisual: {}
};
const context = vm.createContext({
  state, els: { audio: { currentTime: 0 }, playbackLyricText: {} },
  clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  safeText: (value, fallback = '') => value == null ? fallback : String(value),
  playbackLyricText: () => '等待歌词', playbackLyricSubtitle: () => '',
  playbackLyricSecondaryText: () => '', playbackDurationForLyricSpeed: () => 12,
  wordGlowLyricActive: () => false, handwrittenMoodLyricActive: () => false,
  textLyricsEnabled: () => false, playbackCardLyricsVisible: () => true,
  currentPlaybackLyricTime: () => context.els.audio.currentTime,
  DESKTOP_SCENE_CLIENT: false, BOOK_LYRIC_VISUAL_LEAD_SECONDS: 0.5,
  lyricTimelineTime(time, lead = 0) { calibrations++; return Math.max(0, time - latency + offset + lead); },
  lyricProgressForLineAtTime: (line, time, end) => Math.max(0, Math.min(1, (time - line.time) / (end - line.time))),
  updateQishuiPlaybackLyrics(text, subtitle, audioTime, options) {
    const before = calibrations;
    captured = { ...context.qishuiPlaybackBookFrame(state.lyricLines, audioTime, options), audioTime, options };
    assert.equal(calibrations, before, 'the playback bar must not recalibrate the ordinary lyric sample');
  }
});
for (const [name, next] of [
  ['effectivePlaybackLyricTime', 'findLyricIndexAtDisplayTime'],
  ['findLyricIndexAtDisplayTime', 'findLyricIndexAtTime'],
  ['playbackLyricVisualLeadSeconds', 'updatePlayerClock'],
  ['bookLyricProgressEndTime', 'updatePlaybackLyricAtTime'],
  ['qishuiPlaybackBookFrame', 'scheduleQishuiPlaybackLyricLayout'],
  ['setPlaybackLyricLine', 'lyricClockOffsetSeconds'],
  ['updatePlaybackLyricAtTime', 'lyricSignatureForSong']
]) vm.runInContext(block(name, next), context);

let samples = 0;
for (offset of [0, -0.35, 0.6]) {
  for (latency of [0, 0.12]) {
    for (const time of [0, 1.999, 2, 3.25, 5.999, 6, 8, 8, 2.5, 0]) {
      calibrations = 0;
      context.els.audio.currentTime = time;
      context.updatePlaybackLyricAtTime(time);
      assert.equal(calibrations, 1, 'calibrate the audio sample exactly once');
      assert.equal(captured.audioTime, time);
      assert.equal(captured.currentTime, Math.max(0, time - latency + offset));
      assert.equal(captured.activeIndex, state.lyricIndex);
      assert.equal(captured.progressPercent, state.lyricProgressPercent);
      const before = calibrations;
      const standalone = context.qishuiPlaybackBookFrame(state.lyricLines, time);
      assert.equal(calibrations, before + 1, 'standalone redraws use the same calibrated clock');
      assert.equal(standalone.currentTime, captured.currentTime);
      assert.equal(standalone.activeIndex, captured.activeIndex);
      if (standalone.activeIndex >= 0) assert.equal(standalone.progressPercent, captured.progressPercent);
      samples++;
    }
  }
}
const forwarder = block('setPlaybackLyricLine', 'lyricClockOffsetSeconds');
assert.equal((forwarder.match(/\{ effectiveTime: currentTime, progressPercent \}/g) || []).length, 2,
  'both visible ordinary lyrics and hidden/particle lyrics forward the calibrated sample');
console.log(`PASS playback bar clock parity: ${samples} audio samples, offsets, latency, pauses, rewinds and standalone redraws`);
