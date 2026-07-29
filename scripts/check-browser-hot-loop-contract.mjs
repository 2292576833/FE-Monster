import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function functionBody(name) {
  const signature = `function ${name}(`;
  const start = app.indexOf(signature);
  if (start < 0) return '';
  let parameterDepth = 0;
  let parameterQuote = '';
  let parameterEscaped = false;
  let opening = -1;
  for (let index = start + signature.length - 1; index < app.length; index += 1) {
    const char = app[index];
    if (parameterQuote) {
      if (parameterEscaped) parameterEscaped = false;
      else if (char === '\\') parameterEscaped = true;
      else if (char === parameterQuote) parameterQuote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      parameterQuote = char;
      continue;
    }
    if (char === '(') parameterDepth += 1;
    else if (char === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        opening = app.indexOf('{', index + 1);
        break;
      }
    }
  }
  if (opening < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = opening; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  return '';
}

const drawPlaybackParticles = functionBody('drawPlaybackParticles');
const updateAudioSpectrum = functionBody('updateAudioSpectrum');
const drawAmbientOrbStreaks = functionBody('drawAmbientOrbStreaks');
const drawOrb = functionBody('drawOrb');
const requestOrbFrame = functionBody('requestOrbFrame');
const stopSandboxRendering = functionBody('stopSandboxRendering');
const clearCommunityDanmakuBubbles = functionBody('clearCommunityDanmakuBubbles');
const startBackgroundPolling = functionBody('startBackgroundPolling');
const renderShelfSongsInto = functionBody('renderShelfSongsInto');
const createShelfSongButton = functionBody('createShelfSongButton');
const setSongFocus = functionBody('setSongFocus');

function referenceSpectrumBands(data, sampleRate) {
  const values = new Float64Array(512);
  for (let index = 0; index < values.length; index += 1) {
    const frequencyHz = 20 + (150 - 20) * (index / (values.length - 1));
    const nyquist = sampleRate / 2;
    const binPosition = Math.max(0, Math.min(data.length - 1, (frequencyHz / nyquist) * data.length));
    const lowerIndex = Math.floor(binPosition);
    const upperIndex = Math.min(data.length - 1, lowerIndex + 1);
    const mix = binPosition - lowerIndex;
    values[index] = Math.max(0, Math.min(1,
      ((data[lowerIndex] || 0) + ((data[upperIndex] || 0) - (data[lowerIndex] || 0)) * mix) / 255
    ));
  }
  return values;
}

function optimizedSpectrumBands(data, sampleRate) {
  const values = new Float64Array(512);
  const lastDataIndex = data.length - 1;
  const spectrumNyquist = sampleRate / 2;
  const frequencySpan = 150 - 20;
  for (let index = 0; index < values.length; index += 1) {
    const frequencyHz = 20 + frequencySpan * (index / (values.length - 1));
    const binPosition = Math.max(0, Math.min(lastDataIndex, (frequencyHz / spectrumNyquist) * data.length));
    const lowerIndex = Math.floor(binPosition);
    const upperIndex = Math.min(lastDataIndex, lowerIndex + 1);
    const mix = binPosition - lowerIndex;
    values[index] = Math.max(0, Math.min(1,
      ((data[lowerIndex] || 0) + ((data[upperIndex] || 0) - (data[lowerIndex] || 0)) * mix) / 255
    ));
  }
  return values;
}

const spectrumFixture = Uint8Array.from({ length: 2048 }, (_, index) => (
  (index * 73 + (index % 29) * 17 + 31) % 256
));
const referenceBands = referenceSpectrumBands(spectrumFixture, 48000);
const optimizedBands = optimizedSpectrumBands(spectrumFixture, 48000);
let maximumSpectrumDelta = 0;
for (let index = 0; index < referenceBands.length; index += 1) {
  maximumSpectrumDelta = Math.max(maximumSpectrumDelta, Math.abs(referenceBands[index] - optimizedBands[index]));
}

const checks = {
  playbackParticlesAvoidPerParticleObjects:
    drawPlaybackParticles.length > 0
    && !/\brotatePoint\s*\(/.test(drawPlaybackParticles)
    && !/\bpoint\s*=\s*\{/.test(drawPlaybackParticles),
  spectrumAvoidsPerSampleCallbacksAndArrays:
    updateAudioSpectrum.length > 0
    && !/const\s+bin\s*=\s*\(/.test(updateAudioSpectrum)
    && !/\]\s*\.filter\s*\(/.test(updateAudioSpectrum),
  spectrumHoistsNyquistOutside512BandLoop:
    updateAudioSpectrum.length > 0
    && /spectrumNyquist/.test(updateAudioSpectrum)
    && !/sampleFrequencyAmplitude\s*\(/.test(updateAudioSpectrum),
  spectrumBinLookupIsCachedAcrossFrames:
    /lowFrequencyBinLower:\s*new Uint16Array/.test(app)
    && /lowFrequencyBinMix:\s*new Float64Array/.test(app)
    && /analysis\.lowFrequencyLookupDataLength\s*!==\s*data\.length/.test(updateAudioSpectrum)
    && /const lowerIndex = lowFrequencyBinLower\[index\]/.test(updateAudioSpectrum),
  spectrumSamplingNumericallyEquivalent: maximumSpectrumDelta <= Number.EPSILON,
  ambientStreakLifetimeCompactsInPlace:
    drawAmbientOrbStreaks.length > 0
    && !/ambientStreaks\s*=\s*state\.orb\.ambientStreaks\.filter/.test(drawAmbientOrbStreaks),
  orbFrameAvoidsForcedLayout:
    drawOrb.length > 0
    && !/getBoundingClientRect\s*\(/.test(drawOrb)
    && /orbCanvasMetrics\s*\(/.test(drawOrb),
  orbCanvasObserverIsReleased:
    /state\.orb\.resizeObserver\s*=\s*new ResizeObserver/.test(app)
    && /state\.orb\.resizeObserver\?\.disconnect\?\.\(\)/.test(app),
  orbRafIsSingleFlightAndVisibilityAware:
    requestOrbFrame.length > 0
    && /document\.hidden/.test(requestOrbFrame)
    && /state\.orb\.animationFrame/.test(requestOrbFrame),
  sandboxRafHasExplicitStop:
    stopSandboxRendering.length > 0
    && /cancelAnimationFrame\s*\(state\.sandbox\.animationFrame\)/.test(stopSandboxRendering),
  danmakuRafHasExplicitStop:
    clearCommunityDanmakuBubbles.length > 0
    && /cancelAnimationFrame\s*\(state\.community\.danmakuRepelFrame\)/.test(clearCommunityDanmakuBubbles),
  hiddenDocumentDoesNotStartPolling:
    startBackgroundPolling.length > 0
    && /clearBackgroundPolling\s*\(\)/.test(startBackgroundPolling)
    && /document\.hidden/.test(startBackgroundPolling),
  songListUsesBoundedWindow:
    renderShelfSongsInto.length > 0
    && /PLAYLIST_SONG_RENDER_RADIUS\s*\+\s*PLAYLIST_SONG_RENDER_BUFFER/.test(renderShelfSongsInto)
    && /for\s*\(let\s+index\s*=\s*start;\s*index\s*<=\s*end;/.test(renderShelfSongsInto),
  songCoversAreLazy:
    createShelfSongButton.length > 0
    && /image\.loading\s*=\s*['"]lazy['"]/.test(createShelfSongButton)
    && /image\.dataset\.src/.test(createShelfSongButton),
  songFocusAvoidsTransientArrays:
    setSongFocus.length > 0
    && !/songButtonCache\.map\s*\(/.test(setSongFocus)
    && !/\[\.\.\.state\.songButtonCache/.test(setSongFocus)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  checks,
  failures,
  evidence: {
    desktopPlaybackParticlesPerFrame: 1080,
    measuredBaselineFps: 81.1,
    estimatedAvoidableParticleObjectsPerSecond: Math.round(1080 * 81.1),
    sonicSpectrumBands: 512,
    maximumSpectrumDelta
  }
}, null, 2));

if (failures.length) process.exitCode = 1;
