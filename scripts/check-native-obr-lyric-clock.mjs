import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function numericConstant(name, fallback) {
  const match = appSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  return match ? Number(match[1]) : fallback;
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = appSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in the native OBR runtime`);
  const parametersOpen = appSource.indexOf('(', start);
  let parameterDepth = 0;
  let parametersClose = -1;
  for (let index = parametersOpen; index < appSource.length; index += 1) {
    if (appSource[index] === '(') parameterDepth += 1;
    if (appSource[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersClose = index;
        break;
      }
    }
  }
  assert.notEqual(parametersClose, -1, `${name} must have balanced parameters`);
  const open = appSource.indexOf('{', parametersClose);
  let depth = 0;
  for (let index = open; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced body`);
}

const renderFrames = numericConstant('GOOGLE_OBR_NATIVE_RENDER_FRAMES', 256);
const sampleRate = 48_000;
const audio = { currentTime: 0, playbackRate: 1 };
const state = {
  obrSpatialAudio: {
    nativeBuffersQueued: 0,
    nativeQueueUnderruns: 0,
    nativeOutputLatencySeconds: 0,
  },
};

const sandbox = {
  Math,
  Number,
  els: { audio },
  state,
  GOOGLE_OBR_NATIVE_RENDER_FRAMES: renderFrames,
  GOOGLE_OBR_NATIVE_LATENCY_RATE_EPSILON: numericConstant(
    'GOOGLE_OBR_NATIVE_LATENCY_RATE_EPSILON',
    0.001,
  ),
  GOOGLE_OBR_NATIVE_LATENCY_SMOOTHING: numericConstant(
    'GOOGLE_OBR_NATIVE_LATENCY_SMOOTHING',
    0.12,
  ),
  GOOGLE_OBR_NATIVE_LATENCY_MAX_STEP_SECONDS: numericConstant(
    'GOOGLE_OBR_NATIVE_LATENCY_MAX_STEP_SECONDS',
    0.005,
  ),
  GOOGLE_OBR_NATIVE_LATENCY_DEADZONE_SECONDS: numericConstant(
    'GOOGLE_OBR_NATIVE_LATENCY_DEADZONE_SECONDS',
    0.001,
  ),
  LYRIC_AUDIO_OUTPUT_LATENCY_MAX_SECONDS: numericConstant(
    'LYRIC_AUDIO_OUTPUT_LATENCY_MAX_SECONDS',
    0.35,
  ),
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  },
};

const updateNativeGoogleObrMetrics = new Function(
  ...Object.keys(sandbox),
  `${extractFunction('updateNativeGoogleObrMetrics')}; return updateNativeGoogleObrMetrics;`,
)(...Object.values(sandbox));

function createTrustedGraph({ mediaTime, consumedBuffers, latencySeconds }) {
  const consumedFrames = consumedBuffers * renderFrames;
  audio.currentTime = mediaTime;
  audio.playbackRate = 1;
  state.obrSpatialAudio.nativeOutputLatencySeconds = latencySeconds;
  return {
    nativeStream: true,
    disposed: false,
    context: { sampleRate },
    nativeOutputLatencySeconds: latencySeconds,
    nativeClockOriginMediaTime: mediaTime - latencySeconds,
    nativeClockOriginConsumedFrames: consumedFrames,
    nativeLastMediaTime: mediaTime,
    nativeClockPlaybackRate: 1,
    nativeLatencySampleCount: 8,
  };
}

function sample(graph, { mediaTime, playbackRate, consumedBuffers }) {
  audio.currentTime = mediaTime;
  audio.playbackRate = playbackRate;
  return updateNativeGoogleObrMetrics(graph, {
    sampleRate,
    buffersQueued: 24,
    buffersConsumed: consumedBuffers,
    queueUnderruns: 0,
    prerollTargetBuffers: 24,
  });
}

const trustedLatencySeconds = 0.12;
const variableRateGraph = createTrustedGraph({
  mediaTime: 40,
  consumedBuffers: 100,
  latencySeconds: trustedLatencySeconds,
});
let variableRateMediaTime = 40;
let variableRateConsumedBuffers = 100;
const variableRateSamples = [];
for (let index = 0; index < 20; index += 1) {
  variableRateConsumedBuffers += 3;
  const renderedSeconds = (3 * renderFrames) / sampleRate;
  variableRateMediaTime += renderedSeconds * 1.75;
  variableRateSamples.push(sample(variableRateGraph, {
    mediaTime: variableRateMediaTime,
    playbackRate: 1.75,
    consumedBuffers: variableRateConsumedBuffers,
  }));
}
const variableRateMaximumDriftMs = Math.max(
  ...variableRateSamples.map((value) => Math.abs(value - trustedLatencySeconds) * 1000),
);
const variableRateOriginMediaErrorMs = Math.abs(
  Number(variableRateGraph.nativeClockOriginMediaTime)
    - (variableRateMediaTime - trustedLatencySeconds),
) * 1000;

assert.ok(
  variableRateMaximumDriftMs <= 0.001,
  `1.75x playback must freeze the trusted native latency instead of accumulating rate error; drift was ${variableRateMaximumDriftMs.toFixed(3)} ms`,
);
assert.equal(
  variableRateGraph.nativeClockOriginConsumedFrames,
  variableRateConsumedBuffers * renderFrames,
  'variable-rate native latency samples must re-anchor the consumed-frame origin',
);
assert.ok(
  variableRateOriginMediaErrorMs <= 0.001,
  'variable-rate native latency samples must re-anchor the media origin while preserving latency',
);

const boundedGraph = createTrustedGraph({
  mediaTime: 60,
  consumedBuffers: 500,
  latencySeconds: trustedLatencySeconds,
});
const boundedRenderedSeconds = (3 * renderFrames) / sampleRate;
const boundedSample = sample(boundedGraph, {
  mediaTime: 60 + boundedRenderedSeconds + 0.08,
  playbackRate: 1,
  consumedBuffers: 503,
});
const boundedSampleJumpMs = Math.abs(boundedSample - trustedLatencySeconds) * 1000;
assert.ok(
  boundedSampleJumpMs <= 10,
  `a stable-rate latency sample must be smoothed or step-limited to at most 10 ms; jump was ${boundedSampleJumpMs.toFixed(3)} ms`,
);

const recoveryGraph = createTrustedGraph({
  mediaTime: 80,
  consumedBuffers: 1_000,
  latencySeconds: trustedLatencySeconds,
});
let recoveryMediaTime = 80;
let recoveryConsumedBuffers = 1_000;
for (let index = 0; index < 10; index += 1) {
  recoveryConsumedBuffers += 3;
  recoveryMediaTime += ((3 * renderFrames) / sampleRate) * 1.5;
  sample(recoveryGraph, {
    mediaTime: recoveryMediaTime,
    playbackRate: 1.5,
    consumedBuffers: recoveryConsumedBuffers,
  });
}

// The first 1x sample establishes a fresh, trusted origin. A later 60 ms
// measurement change must then be allowed to converge gradually.
recoveryConsumedBuffers += 3;
recoveryMediaTime += (3 * renderFrames) / sampleRate;
const latencyAtOneXReanchor = sample(recoveryGraph, {
  mediaTime: recoveryMediaTime,
  playbackRate: 1,
  consumedBuffers: recoveryConsumedBuffers,
});
const recoverySamples = [];
for (let index = 0; index < 24; index += 1) {
  recoveryConsumedBuffers += 3;
  recoveryMediaTime += (3 * renderFrames) / sampleRate + (index === 0 ? 0.06 : 0);
  recoverySamples.push(sample(recoveryGraph, {
    mediaTime: recoveryMediaTime,
    playbackRate: 1,
    consumedBuffers: recoveryConsumedBuffers,
  }));
}
const recoveredLatencySeconds = recoverySamples.at(-1);
const recoveryMaximumStepMs = Math.max(
  ...recoverySamples.map((value, index) => Math.abs(
    value - (index === 0 ? latencyAtOneXReanchor : recoverySamples[index - 1]),
  ) * 1000),
);

assert.ok(
  recoveredLatencySeconds >= trustedLatencySeconds + 0.03,
  'after playback returns to 1x, native latency must resume calibration toward new stable measurements',
);
assert.ok(
  recoveredLatencySeconds <= trustedLatencySeconds + 0.061,
  '1x recalibration must converge without overshooting the measured latency',
);
assert.ok(
  recoveryMaximumStepMs <= 10,
  `1x recalibration must remain bounded to 10 ms per sample; maximum step was ${recoveryMaximumStepMs.toFixed(3)} ms`,
);

console.log(JSON.stringify({
  ok: true,
  variableRate: {
    playbackRate: 1.75,
    samples: variableRateSamples.length,
    trustedLatencyMs: trustedLatencySeconds * 1000,
    maximumDriftMs: variableRateMaximumDriftMs,
    originMediaErrorMs: variableRateOriginMediaErrorMs,
  },
  stableOneXSample: {
    rawMeasurementJumpMs: 80,
    appliedJumpMs: boundedSampleJumpMs,
  },
  oneXRecovery: {
    samples: recoverySamples.length,
    recoveredLatencyMs: recoveredLatencySeconds * 1000,
    maximumStepMs: recoveryMaximumStepMs,
  },
}, null, 2));
