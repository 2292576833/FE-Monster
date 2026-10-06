import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const updateBookSource = extractFunction('updateBookLyricLines');
const scrollSource = extractFunction('syncBookLyricScroll');

function numericConstant(name) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
  assert.ok(match, `${name} must exist`);
  return Number(match[1]);
}

const fixtureState = {
  lyricLines: [
    { time: 10 },
    { time: 14 },
  ],
  lyricIndex: 0,
  orb: { reducedMotion: false },
};
const fixtureList = {
  clientHeight: 200,
  scrollHeight: 1000,
  scrollTop: 100,
};
const syncFixtureScroll = new Function(
  'performance',
  'els',
  'state',
  'isPlaybackClockRunning',
  `
    const BOOK_LYRIC_SCROLL_SNAP_PX = ${numericConstant('BOOK_LYRIC_SCROLL_SNAP_PX')};
    const BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS = ${numericConstant('BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS')};
    const BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS = ${numericConstant('BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS')};
    ${extractFunction('clamp')}
    ${extractFunction('bookGlyphEase')}
    ${extractFunction('lyricListViewportIsTransform')}
    ${extractFunction('lyricListViewportOffset')}
    ${extractFunction('setLyricListViewportOffset')}
    ${extractFunction('bookLyricTargetScrollTop')}
    ${scrollSource}
    return syncBookLyricScroll;
  `,
)(
  { now: () => 1000 },
  { bookLyricList: fixtureList },
  fixtureState,
  () => false,
);

assert.match(
  updateBookSource,
  /syncBookLyricScroll\(current,\s*\{[\s\S]*?clockTime:\s*currentTimeValue[\s\S]*?playbackRunning:\s*isPlaybackClockRunning\(\)[\s\S]*?lines[\s\S]*?activeIndex:\s*active[\s\S]*?\}\)/,
  'the main book scroller must consume the same effective media sample as glyph highlighting',
);
assert.match(
  scrollSource,
  /clockTime\s*-\s*previousClockTime/,
  'book scrolling must calculate its integration step from media-time deltas',
);
const pausedStore = {
  lyricBookScrollTarget: 220,
  lyricBookScrollFrameAt: 900,
  lyricBookScrollClockTime: 12,
  lyricBookLayoutVersion: 0,
};
const pausedLine = {
  offsetTop: 300,
  offsetHeight: 40,
};
const pausedResult = syncFixtureScroll(pausedLine, {
  list: fixtureList,
  store: pausedStore,
  lines: fixtureState.lyricLines,
  activeIndex: 0,
  clockTime: 12,
  playbackRunning: false,
});
assert.equal(pausedResult, false, 'a repeated paused media sample must not finish the scroll');
assert.equal(fixtureList.scrollTop, 100, 'a repeated paused media sample must freeze the current scroll position');

const seekLine = {
  offsetTop: 350,
  offsetHeight: 40,
};
const seekResult = syncFixtureScroll(seekLine, {
  list: fixtureList,
  store: pausedStore,
  lines: fixtureState.lyricLines,
  activeIndex: 1,
  clockTime: 6,
  playbackRunning: false,
});
assert.equal(seekResult, true, 'a paused seek must still synchronize the scroll target');
assert.equal(fixtureList.scrollTop, 270, 'a paused backward seek must align to the newly selected lyric');

const forwardSeekLine = {
  offsetTop: 420,
  offsetHeight: 40,
};
const forwardSeekResult = syncFixtureScroll(forwardSeekLine, {
  list: fixtureList,
  store: pausedStore,
  lines: fixtureState.lyricLines,
  activeIndex: 1,
  clockTime: 18,
  playbackRunning: false,
});
assert.equal(forwardSeekResult, true, 'a paused forward seek must synchronize the scroll target');
assert.equal(fixtureList.scrollTop, 340, 'a paused forward seek must align to the newly selected lyric');

fixtureList.scrollTop = 100;
const runningSwitchStore = {
  lyricBookScrollTarget: 220,
  lyricBookScrollFrameAt: 900,
  lyricBookScrollClockTime: 13.99,
  lyricBookLayoutVersion: 0,
};
const runningSwitchResult = syncFixtureScroll(forwardSeekLine, {
  list: fixtureList,
  store: runningSwitchStore,
  lines: fixtureState.lyricLines,
  activeIndex: 1,
  clockTime: 14.01,
  playbackRunning: true,
});
assert.equal(runningSwitchResult, true,
  'an authoritative running line switch must reach its reading position in the timestamp frame');
assert.equal(fixtureList.scrollTop, 340,
  'running lyrics must not spend later media frames catching up to an already-active line');

console.log(JSON.stringify({
  ok: true,
  clockSource: 'effective-media-time',
  pauseContract: 'zero-media-delta-freezes-scroll',
  seekContract: 'changed-paused-media-time-synchronizes-scroll',
  runningSwitchContract: 'timestamp-frame-scroll-alignment',
}, null, 2));
