import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const css = readFileSync(path.join(root, 'web/styles.css'), 'utf8');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');

const rigStart = html.indexOf('<div class="playback-lyric-rig"');
const rigEnd = html.indexOf('<section class="qishui-playback-card"', rigStart);
assert.ok(rigStart >= 0 && rigEnd > rigStart, '3D lyric rig must exist');
const rigMarkup = html.slice(rigStart, rigEnd);

assert.match(rigMarkup, /data-lyric-shared-axis="true"/);
assert.match(rigMarkup, /id="playbackLyricCore"/);
assert.match(rigMarkup, /id="playbackLyricSubtitle"/);

const rigRule = css.match(/\.playback-lyric-rig\s*\{([\s\S]*?)\}/)?.[1] || '';
assert.match(rigRule, /transform-origin:\s*(?:50%\s+50%|center\s+center)/);
assert.match(rigRule, /rotateX\(var\(--text-preset-rotate-x\)\)/);
assert.match(rigRule, /rotateY\(var\(--text-preset-rotate-y\)\)/);
assert.match(rigRule, /rotateZ\(var\(--text-preset-rotate-z\)\)/);
assert.match(rigRule, /scale\(var\(--lyric-scale\)\)/);

const coreRule = Array.from(css.matchAll(/\.playback-lyric-core\s*\{([\s\S]*?)\}/g))
  .map((match) => match[1])
  .join('\n');
const subtitleRule = Array.from(css.matchAll(/\.playback-lyric-subtitle\s*\{([\s\S]*?)\}/g))
  .map((match) => match[1])
  .join('\n');
assert.match(coreRule, /transform-origin:\s*(?:50%\s+50%|center\s+center)/);
assert.match(subtitleRule, /left:\s*var\(--lyric-shared-axis-x,\s*50%\)/);
assert.match(subtitleRule, /transform-origin:\s*(?:50%\s+50%|center\s+center)/);
const subtitleLayoutStart = app.indexOf('function syncPlaybackLyricSubtitleLayout()');
const subtitleLayoutEnd = app.indexOf('function setPlaybackLyricLine(', subtitleLayoutStart);
assert.ok(subtitleLayoutStart >= 0 && subtitleLayoutEnd > subtitleLayoutStart);
const subtitleLayout = app.slice(subtitleLayoutStart, subtitleLayoutEnd);
assert.match(subtitleLayout, /playbackLyricText\.offsetTop/);
assert.match(subtitleLayout, /playbackLyricText\.offsetHeight/);
assert.match(subtitleLayout, /translationGap/);
assert.match(subtitleLayout, /style\.removeProperty\('left'\)/);
assert.doesNotMatch(subtitleLayout, /getBoundingClientRect/);
assert.doesNotMatch(app, /schedulePlaybackLyricSubtitleLayout/);

const textGestureEndStart = app.indexOf('function endTextPresetGesture(');
const textGestureEndEnd = app.indexOf('function scaleTextPresetFromWheel(', textGestureEndStart);
assert.match(
  app.slice(textGestureEndStart, textGestureEndEnd),
  /updateTextPresetTransform\(\{ persist: true \}\);\s*syncPlaybackLyricSubtitleLayout\(\);/
);

console.log(JSON.stringify({
  ok: true,
  checks: [
    'main lyric and translation share one rig',
    'rig owns 3D rotation and scale',
    'main lyric and translation share a local horizontal axis',
    'translation gap is calculated from local layout geometry',
    'rotation drag does not run screen-space subtitle compensation',
    'translation is calibrated once when text dragging ends'
  ]
}, null, 2));
