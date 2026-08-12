import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const visualLead = constant('BOOK_LYRIC_VISUAL_LEAD_SECONDS');
const timestampCompensation = constant('LYRIC_TIMESTAMP_COMPENSATION_SECONDS');
const transitionSeconds = constant('QISHUI_LYRIC_TRANSITION_SECONDS');
const settleSeconds = optionalConstant('QISHUI_LYRIC_SCROLL_SETTLE_SECONDS');
const effectiveLeadSeconds = visualLead - timestampCompensation;
const transitionTailMs = Math.max(0, transitionSeconds - effectiveLeadSeconds) * 1000;

// Replays the qishui card's actual media-clock scroll response at 60 Hz.
// The fixture represents a common one/two-line advance inside the compact card.
function simulatedScrollArrivalMs({
  initialDeltaPx = 92,
  snapPx = 0.65,
  frameSeconds = 1 / 60
} = {}) {
  let remaining = initialDeltaPx;
  let elapsedSeconds = 0;
  let firstFrame = true;
  while (remaining > snapPx && elapsedSeconds < 10) {
    let fraction = 0;
    if (Number.isFinite(settleSeconds) && !firstFrame) {
      fraction = 1 - Math.exp(-frameSeconds / settleSeconds);
    } else if (!firstFrame) {
      // Mirrors the pre-fix media-clock branch: targetChanged is consumed by
      // its zero-delta first frame, then the 0.08 minimum step is eased.
      const responseSeconds = 0.26;
      const step = Math.max(0.08, Math.min(0.82, frameSeconds / responseSeconds));
      fraction = step * step * (3 - 2 * step);
    }
    remaining -= remaining * fraction;
    elapsedSeconds += frameSeconds;
    firstFrame = false;
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
  transitionSettlesPromptly:
    transitionTailMs <= 80 + Number.EPSILON,
  activeLineReachesReadingPositionPromptly:
    worstScrollTailMs <= 80 + Number.EPSILON
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
