import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const appPath = path.join(root, 'web', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');

function extractFunction(name) {
  const functionStart = appSource.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `${name} must exist in web/app.js`);
  const start = appSource.slice(functionStart - 6, functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const signatureStart = appSource.indexOf('(', start);
  let signatureDepth = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < appSource.length; index += 1) {
    if (appSource[index] === '(') signatureDepth += 1;
    if (appSource[index] === ')') signatureDepth -= 1;
    if (signatureDepth === 0) {
      signatureEnd = index;
      break;
    }
  }
  const bodyStart = appSource.indexOf('{', signatureEnd);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  assert.fail(`${name} has an unterminated body`);
}

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.curves = [];
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  setValueCurveAtTime(curve, startTime, duration) {
    const values = Array.from(curve);
    this.curves.push({ values, startTime, duration });
    this.value = values.at(-1);
  }
}

let logicalTimeMs = 0;
const timelineRequests = [];
const uploads = [];
const workletMessages = [];
const mediaWrites = [];
let stressGraph = null;
const media = {
  src: 'http://127.0.0.1/audio/test.flac',
  paused: true,
  ended: false,
  _currentTime: 0,
  get currentTime() {
    return this._currentTime;
  },
  set currentTime(value) {
    this._currentTime = Number(value);
    mediaWrites.push(this._currentTime);
  }
};
const dryGain = new FakeAudioParam(0);

const context = vm.createContext({
  AbortController,
  Float32Array,
  Math,
  Number,
  Promise,
  URL,
  URLSearchParams,
  encodeURIComponent,
  performance: { now: () => logicalTimeMs },
  window: {
    setTimeout(callback, delay = 0) {
      logicalTimeMs += Math.max(0, Number(delay) || 0);
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {}
  },
  GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES: 4096,
  GOOGLE_OBR_NATIVE_MAX_PENDING_BLOCKS: 4,
  els: { audio: media },
  state: {
    obrSpatialAudio: { requested: true, graph: null },
    audioPositionSync: { nativeSeekPromise: null }
  },
  safeText: (value, fallback) => String(value || fallback),
  setAudioParamSmoothly(parameter, value) {
    if (parameter) parameter.value = value;
  },
  nativeSpatialRequest(url) {
    if (!String(url).startsWith('/api/audio/spatial/timeline')) {
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => timelineRequests.push({ url: String(url), resolve }));
  },
  waitForNativeGoogleObrPreroll: async () => true,
  failGoogleObr(error) {
    throw error;
  },
  fetch: async (url) => {
    const parsed = new URL(String(url), 'http://127.0.0.1');
    const uploadIndex = uploads.length;
    const jitterMs = (uploadIndex * 37) % 51;
    const cpuDelayMs = uploadIndex > 0 && uploadIndex % 10 === 0 ? 25 : 0;
    logicalTimeMs += jitterMs + cpuDelayMs;
    uploads.push({
      generation: Number(parsed.searchParams.get('generation')),
      sequence: Number(parsed.searchParams.get('sequence')),
      timelineEpoch: Number(stressGraph?.activeBlock?.timelineEpoch),
      jitterMs,
      cpuDelayMs
    });
    await Promise.resolve();
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        sequence: Number(parsed.searchParams.get('sequence'))
      })
    };
  }
});

vm.runInContext(`
  ${extractFunction('setAudioParamEqualPower')}
  ${extractFunction('recycleNativeSpatialBlock')}
  ${extractFunction('discardNativeSpatialBlocks')}
  ${extractFunction('enqueueNativeSpatialBlock')}
  ${extractFunction('pumpNativeSpatialBlocks')}
  ${extractFunction('resetNativeSpatialTimeline')}
  ${extractFunction('beginNativeSpatialTimelineTransition')}
  ${extractFunction('setAudioCurrentTimeWithNativeContinuity')}
  globalThis.seekStressApi = {
    enqueueNativeSpatialBlock,
    pumpNativeSpatialBlocks,
    setAudioCurrentTimeWithNativeContinuity
  };
`, context, { filename: appPath });

stressGraph = {
  nativeStream: true,
  disposed: false,
  context: { currentTime: 0, sampleRate: 48000 },
  dryGain: { gain: dryGain },
  node: {
    port: {
      postMessage(message) {
        workletMessages.push(message);
      }
    }
  },
  session: 71,
  generation: 7,
  captureTimelineEpoch: 1,
  appliedTimelineEpoch: 1,
  timelineTransitionActive: false,
  timelineResetPromise: null,
  timelineResetCount: 0,
  timelineResetFailures: 0,
  streamAbort: { signal: {} },
  blockQueue: [{
    pcm: new Float32Array(4096 * 2),
    bufferId: 900,
    poolEpoch: 1,
    timelineEpoch: 1,
    nativeGeneration: 7,
    released: false
  }],
  blockUploadActive: false,
  activeBlock: null,
  nextBlockSequence: 0,
  uploadedBlocks: 0,
  transportDroppedBlocks: 0,
  transportSeekDiscardedBlocks: 0,
  transportRetryAttempts: 0,
  transportRecoveredBlocks: 0,
  transportRecoveryCount: 0,
  poolStarvedFrames: 0,
  nativeQueueUnderruns: 0,
  nativeBufferPoolExhaustions: 0
};
context.state.obrSpatialAudio.graph = stressGraph;

const seekPromises = [];
for (let index = 0; index < 100; index += 1) {
  const position = index % 2 === 0 ? 3.5 + index : 237.25 - index * 0.25;
  seekPromises.push(
    context.seekStressApi.setAudioCurrentTimeWithNativeContinuity(position, 'stress-scrub')
  );
}
const expectedFinalPosition = 237.25 - 99 * 0.25;
assert.equal(mediaWrites.length, 100, 'all 100 media seeks must be applied synchronously');
assert.equal(media.currentTime, expectedFinalPosition, 'the final scrub position must win');
assert.equal(timelineRequests.length, 1, 'rapid seeks should coalesce while reset is in flight');
assert.equal(dryGain.value, 1, 'browser dry audio must become audible before reset acknowledgement');
assert.ok(dryGain.curves.length >= 1, 'dry continuity must use AudioParam automation');
const dryCurve = dryGain.curves[0].values;
const equalPowerError = Math.max(...dryCurve.map((dry, index) => {
  const progress = index / (dryCurve.length - 1);
  const native = Math.cos(progress * Math.PI * 0.5);
  return Math.abs(dry * dry + native * native - 1);
}));
assert.ok(equalPowerError < 0.000001, 'dry/native seek hand-off must remain equal-power');
assert.equal(stressGraph.captureTimelineEpoch, 101);
assert.equal(uploads.length, 0, 'old and unacknowledged epochs must not upload');

const finalEpochPcm = new Float32Array(4096 * 2);
assert.equal(context.seekStressApi.enqueueNativeSpatialBlock(stressGraph, finalEpochPcm, {
  bufferId: 1000,
  poolEpoch: 1,
  timelineEpoch: 101
}), true);
assert.equal(uploads.length, 0, 'the final epoch must prebuffer until generation rotation completes');

timelineRequests.shift().resolve({
  ok: true,
  session: 71,
  previousGeneration: 7,
  generation: 8,
  flushed: true,
  rearmed: true,
  mixerRevision: 41
});
for (let attempt = 0; attempt < 20 && timelineRequests.length === 0; attempt += 1) {
  await Promise.resolve();
}
assert.equal(timelineRequests.length, 1, 'latest-wins must rotate once more for the final epoch');
timelineRequests.shift().resolve({
  ok: true,
  session: 71,
  previousGeneration: 8,
  generation: 9,
  flushed: true,
  rearmed: true,
  mixerRevision: 41
});
await Promise.all(seekPromises);

async function waitForPumpIdle() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (!stressGraph.blockUploadActive && stressGraph.blockQueue.length === 0) return;
    await Promise.resolve();
  }
  assert.fail('native PCM pump did not become idle');
}

await waitForPumpIdle();
for (let index = 1; index < 100; index += 1) {
  assert.equal(context.seekStressApi.enqueueNativeSpatialBlock(
    stressGraph,
    new Float32Array(4096 * 2),
    { bufferId: 1000 + index, poolEpoch: 1, timelineEpoch: 101 }
  ), true);
  await waitForPumpIdle();
}

assert.equal(stressGraph.appliedTimelineEpoch, 101);
assert.equal(stressGraph.generation, 9);
assert.equal(stressGraph.timelineResetCount, 2);
assert.equal(stressGraph.timelineResetFailures, 0);
assert.equal(uploads.length, 100);
assert.ok(uploads.every((entry) => entry.timelineEpoch === 101));
assert.ok(uploads.every((entry) => entry.generation === 9));
assert.deepEqual(uploads.map((entry) => entry.sequence), Array.from({ length: 100 }, (_, index) => index));
assert.equal(stressGraph.transportDroppedBlocks, 0);
assert.equal(stressGraph.nativeQueueUnderruns, 0);
assert.equal(stressGraph.nativeBufferPoolExhaustions, 0);
assert.equal(stressGraph.poolStarvedFrames, 0);

const jitterValues = uploads.map((entry) => entry.jitterMs);
const cpuDelayEvents = uploads.filter((entry) => entry.cpuDelayMs > 0).length;
console.log(JSON.stringify({
  pass: true,
  model: 'deterministic fake clock over extracted production browser transport',
  seeks: mediaWrites.length,
  latestWinsPosition: media.currentTime,
  captureTimelineEpoch: stressGraph.captureTimelineEpoch,
  appliedTimelineEpoch: stressGraph.appliedTimelineEpoch,
  coalescedNativeResets: stressGraph.timelineResetCount,
  uploadedBlocks: uploads.length,
  uploadJitterMs: {
    minimum: Math.min(...jitterValues),
    maximum: Math.max(...jitterValues)
  },
  periodicCpuDelayEvents: cpuDelayEvents,
  oldEpochUploads: uploads.filter((entry) => entry.timelineEpoch !== 101).length,
  oldGenerationUploads: uploads.filter((entry) => entry.generation !== 9).length,
  dryAudibleBeforeResetAcknowledgement: dryGain.curves.length > 0 && dryGain.value === 1,
  equalPowerMaximumError: equalPowerError,
  counters: {
    dropped: stressGraph.transportDroppedBlocks,
    underruns: stressGraph.nativeQueueUnderruns,
    poolExhaustions: stressGraph.nativeBufferPoolExhaustions,
    poolStarvedFrames: stressGraph.poolStarvedFrames
  },
  mixerRevisionPreservedByResponses: true
}, null, 2));
