import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
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
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

const ensureSource = extractFunction('ensureAudioSpectrumAggregateLookup');
const responseSource = extractFunction('audioFrameResponse');
const updateSource = extractFunction('updateAudioSpectrum');
const responseCalls = (updateSource.match(/audioFrameResponse\s*\(/g) || []).length;

function oldBandForIndex(index, dataLength) {
  const scaleBin = dataLength / 512;
  const last = dataLength - 1;
  const ranges = [
    [0, Math.min(last, Math.floor(scaleBin))],
    [Math.min(last, Math.floor(2 * scaleBin)), Math.min(last, Math.floor(3 * scaleBin))],
    [Math.min(last, Math.floor(4 * scaleBin)), Math.min(last, Math.floor(7 * scaleBin))],
    [Math.min(last, Math.floor(8 * scaleBin)), Math.min(last, Math.floor(18 * scaleBin))],
    [Math.min(last, Math.floor(19 * scaleBin)), Math.min(last, Math.floor(46 * scaleBin))],
    [Math.min(last, Math.floor(47 * scaleBin)), Math.min(last, Math.floor(93 * scaleBin))],
    [Math.min(last, Math.floor(94 * scaleBin)), Math.min(last, Math.floor(186 * scaleBin))],
    [Math.min(last, Math.floor(187 * scaleBin)), Math.min(last, Math.floor(372 * scaleBin))]
  ];
  for (let band = 0; band < ranges.length; band += 1) {
    if (index >= ranges[band][0] && index <= ranges[band][1]) return band;
  }
  return 255;
}

let lookupParity = false;
let lookupStorageReused = false;
let rmsRangeParity = false;
if (ensureSource) {
  const ensureLookup = new Function(
    'AUDIO_SPECTRUM_BAND_COUNT',
    'AUDIO_SPECTRUM_UNMAPPED',
    'SONIC_LOW_FREQUENCY_MIN_HZ',
    'SONIC_LOW_FREQUENCY_MAX_HZ',
    'clamp',
    `${ensureSource}; return ensureAudioSpectrumAggregateLookup;`
  )(
    8,
    255,
    20,
    150,
    (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0))
  );
  lookupParity = true;
  rmsRangeParity = true;
  lookupStorageReused = true;
  for (const dataLength of [512, 1024, 2048, 4096]) {
    for (const sampleRate of [44100, 48000]) {
      const analysis = {
        aggregateBandByBin: new Uint8Array(0),
        aggregateBandCounts: new Uint16Array(8),
        aggregateLookupDataLength: 0,
        aggregateLookupSampleRate: 0,
        lowFrequencyRmsStart: 0,
        lowFrequencyRmsEnd: 0
      };
      ensureLookup(analysis, dataLength, sampleRate);
      const initialLookup = analysis.aggregateBandByBin;
      ensureLookup(analysis, dataLength, sampleRate);
      lookupStorageReused &&= analysis.aggregateBandByBin === initialLookup;
      for (let index = 0; index < dataLength; index += 1) {
        if (analysis.aggregateBandByBin[index] !== oldBandForIndex(index, dataLength)) {
          lookupParity = false;
          break;
        }
      }
      const nyquist = sampleRate / 2;
      const expectedStart = Math.min(dataLength - 1, Math.max(0, Math.floor((20 / nyquist) * dataLength)));
      const expectedEnd = Math.min(dataLength, Math.max(expectedStart + 1, Math.ceil((150 / nyquist) * dataLength)));
      rmsRangeParity &&= analysis.lowFrequencyRmsStart === expectedStart
        && analysis.lowFrequencyRmsEnd === expectedEnd;
    }
  }
}

const checks = {
  aggregateBandLookupIsPrecomputed:
    ensureSource.length > 0
    && /aggregateBandByBin/.test(ensureSource)
    && /aggregateBandCounts/.test(ensureSource),
  lookupExactlyPreservesBandMembership: lookupParity,
  lookupStorageIsReused: lookupStorageReused,
  cachedLowFrequencyRmsRangePreservesSemantics: rmsRangeParity,
  updateUsesLookupInsteadOfEightWayBranch:
    /ensureAudioSpectrumAggregateLookup/.test(updateSource)
    && /aggregateBandByBin/.test(updateSource)
    && !/else\s+if\s*\(index\s*>=\s*(?:bass|lowMid|mid|highMid|presence|brilliance|air)Start/.test(updateSource),
  smoothingPowersAreHoistedOutOf512BandLoop:
    responseSource.includes('Math.pow')
    && /lowFrequencyAttackResponse/.test(updateSource)
    && /lowFrequencyReleaseResponse/.test(updateSource)
    && responseCalls <= 5
    && !/for\s*\([^)]*SONIC_LOW_FREQUENCY_BAND_COUNT[\s\S]{0,900}audioFrameResponse/.test(updateSource)
};

const result = {
  pass: Object.values(checks).every(Boolean),
  checks,
  metrics: {
    previousSmoothingPowCallsPerFrame: 517,
    optimizedSmoothingPowCallsPerFrame: responseCalls,
    eliminatedPowCallsPerFrame: Math.max(0, 517 - responseCalls)
  }
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
assert.equal(result.pass, true, 'Audio spectrum hot path did not meet its lookup/smoothing CPU contract');
