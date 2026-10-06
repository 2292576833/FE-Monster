import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function constant(name) {
  const match = app.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.\\s/+*-]+)\\s*;`));
  if (!match) throw new Error(`Missing ${name}`);
  const value = Function(`"use strict"; return (${match[1]});`)();
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: ${match[1]}`);
  return Number(value);
}

function optionalConstant(name) {
  try {
    return constant(name);
  } catch {
    return Number.NaN;
  }
}

function functionBlock(name, nextName) {
  const signature = `function ${name}(`;
  const start = app.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${name}`);
  const end = app.indexOf(`function ${nextName}(`, start + signature.length);
  if (end < 0) throw new Error(`Missing function after ${name}: ${nextName}`);
  return app.slice(start, end);
}

const scrollSource = functionBlock('syncBookLyricScroll', 'cachedBookLyricGlyphs');
const cardUpdateSource = functionBlock(
  'updateQishuiPlaybackLyrics',
  'qishuiPlaybackSeekDuration'
);
const cardLineSource = functionBlock(
  'qishuiPlaybackBookLines',
  'disposeQishuiLyricTransition'
);
const cardTransitionSource = functionBlock(
  'startQishuiLyricTransition',
  'syncQishuiLyricTransition'
);

const visualLead = constant('BOOK_LYRIC_VISUAL_LEAD_SECONDS');
const timestampCompensation = constant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS');
const transitionSeconds = constant('QISHUI_LYRIC_TRANSITION_SECONDS');
const settleSeconds = optionalConstant('QISHUI_LYRIC_SCROLL_SETTLE_SECONDS');
const effectiveLeadSeconds = visualLead - timestampCompensation;
const transitionTailMs = Math.max(0, transitionSeconds - effectiveLeadSeconds) * 1000;

// Execute the production scroll and viewport helpers, including the card's
// transform-backed viewport, rather than inferring behavior from scrollTop writes.
function scrollFixture(clockTime = 0) {
  const list = {
    dataset: { lyricOffset: 'transform' }, __lyricOffset: 0,
    clientHeight: 200, style: { setProperty() {} }
  };
  const store = { lyricBookScrollTarget: 0, lyricBookScrollClockTime: clockTime };
  const context = vm.createContext({
    performance,
    state: { orb: { reducedMotion: false } }, els: {},
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    bookGlyphEase: (value) => value * value * (3 - 2 * value),
    isPlaybackClockRunning: () => true,
    bookLyricTargetScrollTop: (line) => line.target,
    BOOK_LYRIC_SCROLL_SNAP_PX: constant('BOOK_LYRIC_SCROLL_SNAP_PX'),
    BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS: constant('BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS'),
    BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS: constant('BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS')
  });
  vm.runInContext(functionBlock('lyricListViewportIsTransform', 'bookLyricTargetScrollTop') + scrollSource, context);
  return {
    list, store,
    scroll(target, time) {
      return context.syncBookLyricScroll({ target }, {
        list, store, lines: [], activeIndex: 0, clockTime: time,
        responseSeconds: settleSeconds
      });
    }
  };
}

function simulatedScrollArrivalMs({
  initialDeltaPx = 92,
  snapPx = 0.65,
  frameSeconds = 1 / 60
} = {}) {
  const fixture = scrollFixture();
  let elapsedSeconds = 0;
  while (Math.abs(initialDeltaPx - fixture.list.__lyricOffset) > snapPx && elapsedSeconds < 10) {
    elapsedSeconds += frameSeconds;
    fixture.scroll(initialDeltaPx, elapsedSeconds);
  }
  return elapsedSeconds * 1000;
}

const scrollArrivalByHz = [60, 120, 165].map((refreshHz) => {
  const arrivalMs = simulatedScrollArrivalMs({ frameSeconds: 1 / refreshHz });
  return {
    refreshHz,
    arrivalMs,
    tailMs: Math.max(0, arrivalMs - effectiveLeadSeconds * 1000)
  };
});
const worstScrollTailMs = Math.max(...scrollArrivalByHz.map(({ tailMs }) => tailMs));
const pausedFixture = scrollFixture(5);
const pausedTargetArrived = pausedFixture.scroll(92, 5);
const pausedTargetOffset = pausedFixture.list.__lyricOffset;
const backwardsTargetArrived = pausedFixture.scroll(-24, 2);

const checks = {
  actualCardHotPathUsesMediaClock:
    /syncBookLyricScroll\(current,\s*\{[\s\S]*?clockTime:\s*currentTime/.test(cardUpdateSource),
  lineSwitchUpdatesStateBeforeScroll:
    cardUpdateSource.indexOf('cardState.lyricBookIndex = activeIndex;')
      < cardUpdateSource.indexOf('syncBookLyricScroll(current,'),
  existingLineNodesAreReused:
    cardUpdateSource.includes('list.__qishuiPlaybackLyricLines')
      && cardUpdateSource.includes('cardState.lyricBookCurrentLine = current;'),
  noResidentTimingLoop:
    !/\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(cardUpdateSource),
  wrappedTextRemainsOneLogicalLine:
    /if \(song && syncedLines\.length\) return syncedLines;/.test(cardLineSource)
      && !/\.(?:split|match)\s*\(/.test(cardLineSource),
  liveHighlightProgressIsNotHeldAtZero:
    cardUpdateSource.includes('const visibleProgress = clamp(Number(progressPercent) || 0, 0, 100);')
      && cardUpdateSource.includes("current.style.setProperty('--book-line-progress'"),
  frameRateIndependentScrollResponse:
    cardUpdateSource.includes('responseSeconds: QISHUI_LYRIC_SCROLL_SETTLE_SECONDS')
      && scrollSource.includes('1 - Math.exp(-dt / responseSeconds)'),
  positionTransitionDoesNotHoldOldScrollPosition:
    !/\b(?:translate|scale):/.test(cardTransitionSource),
  transitionSettlesPromptly:
    transitionTailMs <= 80 + Number.EPSILON,
  activeLineReachesReadingPositionWithinOneFrame:
    worstScrollTailMs <= 1000 / 60 + Number.EPSILON,
  pausedClockStillAppliesChangedTarget:
    pausedTargetArrived && pausedTargetOffset === 92,
  backwardsSeekAppliesChangedTarget:
    backwardsTargetArrived && pausedFixture.list.__lyricOffset === -24
};

const result = {
  ok: Object.values(checks).every(Boolean),
  checks,
  timing: {
    effectiveLeadMs: Math.round(effectiveLeadSeconds * 1000),
    transitionMs: Math.round(transitionSeconds * 1000),
    transitionTailAfterTimestampMs: Math.round(transitionTailMs),
    scrollByRefreshRate: scrollArrivalByHz.map(({ refreshHz, arrivalMs, tailMs }) => ({
      refreshHz,
      arrivalMs: Math.round(arrivalMs),
      tailAfterTimestampMs: Math.round(tailMs)
    }))
  }
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
