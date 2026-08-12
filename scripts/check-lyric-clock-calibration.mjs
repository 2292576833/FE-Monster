import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');

const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check('persistent lyric clock preference key', /LYRIC_CLOCK_OFFSET_PREFERENCE_KEY/.test(app));
check('manual offset is bounded to three seconds', /LYRIC_CLOCK_OFFSET_MIN_SECONDS\s*=\s*-3/.test(app)
  && /LYRIC_CLOCK_OFFSET_MAX_SECONDS\s*=\s*3/.test(app));
check('manual offset advances in one tenth second steps', /LYRIC_CLOCK_OFFSET_STEP_SECONDS\s*=\s*0\.1/.test(app));
check('manual offset is rounded, bounded, saved, and restored', /function normalizeLyricClockOffsetSeconds[\s\S]*?clamp[\s\S]*?Math\.round/.test(app)
  && /function loadLyricClockOffsetPreference[\s\S]*?localStorage\.getItem\(LYRIC_CLOCK_OFFSET_PREFERENCE_KEY\)/.test(app)
  && /function saveLyricClockOffsetPreference[\s\S]*?localStorage\.setItem\(LYRIC_CLOCK_OFFSET_PREFERENCE_KEY/.test(app));
check('audio element remains the authoritative lyric clock', /function currentPlaybackLyricTime[\s\S]*?els\.audio\.currentTime/.test(app));
check('multi-row lyrics cancel the legacy timestamp delay and follow the audible media clock',
  /MULTI_ROW_LYRIC_VISUAL_LEAD_SECONDS\s*=\s*LYRIC_TIMESTAMP_COMPENSATION_SECONDS/.test(app)
  && /function playbackLyricVisualLeadSeconds[\s\S]*?state\.multiRowLyricsEnabled[\s\S]*?MULTI_ROW_LYRIC_VISUAL_LEAD_SECONDS/.test(app));
check('lyric frame identity includes the multi-row clock mode',
  /const signature = `\$\{state\.lyricSignature\}\|\$\{state\.textPreset\}\|\$\{state\.multiRowLyricsEnabled \? 1 : 0\}`/.test(app));
check('browser output latency only applies to the audible Web Audio media path', /function lyricAudioOutputLatencySeconds[\s\S]*?sourceMode !== 'media'[\s\S]*?outputConnected !== true/.test(app));
check('native OBR lyrics use measured native output latency only on the native graph',
  /function lyricAudioOutputLatencySeconds[\s\S]*?nativeGraph\?\.nativeStream === true[\s\S]*?nativeOutputLatencySeconds/.test(app));
check('audio output latency includes both context latency components', /function lyricAudioOutputLatencySeconds[\s\S]*?context\.baseLatency[\s\S]*?context\.outputLatency/.test(app));
check('timeline applies base latency, output latency, and manual offset', /function lyricTimelineTime[\s\S]*?lyricAudioOutputLatencySeconds[\s\S]*?lyricClockOffsetSeconds/.test(app));
check('playback-card lyrics receive the raw authoritative clock and calibrate once', /function setPlaybackLyricLine[\s\S]*?updateQishuiPlaybackLyrics\([\s\S]*?currentPlaybackLyricTime\(\)/.test(app));
check('offset change resynchronizes every lyric surface immediately', /function setLyricClockOffsetSeconds[\s\S]*?resetLyricFrameSync\(\)[\s\S]*?syncPlaybackLyricToCurrentTime\(\)/.test(app));
check('only minus and plus controls remain', /id="qishuiPlaybackLyricLaterButton"/.test(html)
  && /id="qishuiPlaybackLyricEarlierButton"/.test(html)
  && !/id="qishuiPlaybackLyricOffsetButton"/.test(html)
  && !/id="qishuiPlaybackLyricOffsetValue"/.test(html));
check('controls display fixed one-tenth second steps', />-0\.1<\/span>/.test(html)
  && />\+0\.1<\/span>/.test(html));
check('buttons are direct time-row children without a wrapper panel', /class="qishui-playback-times"[\s\S]*?<time[^>]*qishuiPlaybackCurrentTime[\s\S]*?<button[^>]*qishuiPlaybackLyricLaterButton[\s\S]*?<\/button>[\s\S]*?<button[^>]*qishuiPlaybackLyricEarlierButton[\s\S]*?<\/button>[\s\S]*?<time[^>]*qishuiPlaybackTotalTime/.test(html)
  && !/qishui-playback-lyric-clock/.test(html)
  && !/\.qishui-playback-lyric-clock/.test(css));
check('each button directly uses the playback glass surface', /id="qishuiPlaybackLyricLaterButton"[\s\S]*?data-glass-surface/.test(html)
  && /id="qishuiPlaybackLyricEarlierButton"[\s\S]*?data-glass-surface/.test(html)
  && /qishui-playback-source-switch[\s\S]*?qishui-playback-lyric-adjust/.test(css));
check('buttons float out of flow and cannot increase playback height', /\.qishui-playback-lyric-adjust[\s\S]*?position:\s*absolute[\s\S]*?height:\s*20px/.test(css));
check('buttons are bound', /qishuiPlaybackLyricEarlierButton\.addEventListener/.test(app)
  && /qishuiPlaybackLyricLaterButton\.addEventListener/.test(app)
  && !/qishuiPlaybackLyricOffsetButton\.addEventListener/.test(app));
check('earlier advances and later delays the lyric clock', /qishuiPlaybackLyricEarlierButton\.addEventListener[\s\S]*?adjustLyricClockOffsetSeconds\(LYRIC_CLOCK_OFFSET_STEP_SECONDS\)/.test(app)
  && /qishuiPlaybackLyricLaterButton\.addEventListener[\s\S]*?adjustLyricClockOffsetSeconds\(-LYRIC_CLOCK_OFFSET_STEP_SECONDS\)/.test(app));
check('new playback lyric motion is paused and driven by media time', /function syncQishuiLyricTransition[\s\S]*?animation\.pause\(\)[\s\S]*?animation\.currentTime/.test(app)
  && /syncQishuiLyricTransition\([\s\S]*?currentTime/.test(app));
check('new playback lyric scroll uses the media clock delta', /syncBookLyricScroll\(current,[\s\S]*?clockTime:\s*currentTime/.test(app)
  && /function syncBookLyricScroll[\s\S]*?options\.clockTime/.test(app));

console.log(JSON.stringify({ ok: true, checks }, null, 2));
