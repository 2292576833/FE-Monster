import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function functionBlock(name, nextName) {
  const signature = `function ${name}(`;
  const start = app.indexOf(signature);
  if (start < 0) return '';
  const end = app.indexOf(`function ${nextName}(`, start + signature.length);
  return end < 0 ? '' : app.slice(start, end);
}

const playbackLyrics = functionBlock(
  'updateQishuiPlaybackLyrics',
  'qishuiPlaybackSeekDuration'
);
const centralLyrics = functionBlock(
  'setPlaybackLyricLine',
  'lyricClockOffsetSeconds'
);
const manualProgress = functionBlock(
  'renderManualProgress',
  'skipUnavailableCommunitySong'
);

const hiddenLyricsBranch = /if \(!textLyricsEnabled\(\)\) \{([^]*?)\n  \}/m
  .exec(centralLyrics)?.[1] || '';

const checks = {
  arrivedLineSkipsScrollMeasurement:
    playbackLyrics.includes(
      'const alreadyArrived = cardState.lyricBookArrivedIndex === activeIndex;'
    )
    && /const scrollArrived = alreadyArrived\s*\?\s*true\s*:\s*current\s*\?\s*syncBookLyricScroll\(/m
      .test(playbackLyrics),
  hiddenCentralLyricsUseStateOnly:
    hiddenLyricsBranch.includes('state.lyricDisplayText = line;')
    && hiddenLyricsBranch.includes('state.lyricSubtitleText = nextSubtitle;')
    && hiddenLyricsBranch.includes('state.lyricProgressPercent = progressPercent;')
    && hiddenLyricsBranch.includes('updateQishuiPlaybackLyrics(')
    && !hiddenLyricsBranch.includes('getBoundingClientRect')
    && !hiddenLyricsBranch.includes('syncGlitchTextLayers')
    && !hiddenLyricsBranch.includes('syncPlaybackLyricSubtitleLayout')
    && !hiddenLyricsBranch.includes('querySelectorAll'),
  playbackClockOwnsLyricFrames:
    manualProgress.includes(
      'if (!isPlaybackClockRunning()) syncPlaybackLyricAtTime(safePosition);'
    )
    && !/\n  syncPlaybackLyricAtTime\(safePosition\);\n/.test(manualProgress)
};

const result = {
  ok: Object.values(checks).every(Boolean),
  checks
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
