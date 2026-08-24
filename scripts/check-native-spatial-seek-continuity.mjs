import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const workletPath = path.join(root, 'web', 'vendor', 'native-spatial', 'native-pcm-worklet.js');
const source = fs.readFileSync(workletPath, 'utf8');
const appPath = path.join(root, 'web', 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const routesSource = fs.readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'),
  'utf8'
);
const engineSource = fs.readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java'),
  'utf8'
);
const nativeBridgeSource = fs.readFileSync(
  path.join(root, 'native', 'windows', 'fe_monster_xaudio2.cpp'),
  'utf8'
);
const pipelineHeaderSource = fs.readFileSync(
  path.join(root, 'native', 'windows', 'audio', 'fe_audio_pipeline.h'),
  'utf8'
);
const pipelineSource = fs.readFileSync(
  path.join(root, 'native', 'windows', 'audio', 'fe_audio_pipeline.cpp'),
  'utf8'
);
let Processor = null;

class FakePort {
  constructor() {
    this.onmessage = null;
    this.messages = [];
  }

  postMessage(message, transfer = []) {
    this.messages.push({
      message: structuredClone(message, { transfer }),
      transferCount: transfer.length
    });
  }

  deliver(message) {
    this.onmessage?.({ data: message });
  }
}

class FakeAudioWorkletProcessor {
  constructor() {
    this.port = new FakePort();
  }
}

vm.runInNewContext(source, {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  Float32Array,
  Number,
  Math,
  sampleRate: 48000,
  registerProcessor(name, constructor) {
    assert.equal(name, 'fe-native-pcm-bridge');
    Processor = constructor;
  }
}, { filename: workletPath });

assert.equal(typeof Processor, 'function');
const processor = new Processor();
processor.port.deliver({ type: 'set-enabled', enabled: true });
const output = [[new Float32Array(128), new Float32Array(128)]];

function render(sample, frames) {
  const before = processor.port.messages.length;
  for (let offset = 0; offset < frames; offset += 128) {
    const left = new Float32Array(128).fill(sample);
    const right = new Float32Array(128).fill(sample);
    processor.process([[left, right]], output);
  }
  return processor.port.messages
    .slice(before)
    .map((entry) => entry.message)
    .filter((message) => message.type === 'pcm');
}

// Reproduce the old bug: half a transport block is captured before a seek.
// The first post-seek transport block must contain only the new timeline and
// begin with a sample-level fade, never the pre-seek +0.75 samples.
assert.equal(render(0.75, 2048).length, 0);
processor.port.deliver({ type: 'reset-timeline', timelineEpoch: 2, fadeFrames: 720 });
const postSeekBlocks = render(-0.5, 4096);
assert.equal(postSeekBlocks.length, 1, 'the new timeline should emit one complete transport block');
const postSeek = postSeekBlocks[0];
assert.equal(postSeek.timelineEpoch, 2, 'PCM ownership must carry the capture timeline epoch');
assert.equal(postSeek.frames, 4096);
assert.ok(Math.abs(postSeek.pcm[0]) < 0.002, 'the first post-seek sample must fade in from silence');
assert.ok(postSeek.pcm.every((sample) => sample <= 0), 'pre-seek samples leaked into the post-seek block');
assert.ok(Math.abs(postSeek.pcm.at(-1) + 0.5) < 0.0001, 'the fade must reach the unmodified signal');

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

const recycleSource = extractFunction('recycleNativeSpatialBlock');
const discardSource = extractFunction('discardNativeSpatialBlocks');
const enqueueSource = extractFunction('enqueueNativeSpatialBlock');
const pumpSource = extractFunction('pumpNativeSpatialBlocks');
let fetchCalls = 0;
let fetchHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, sequence: 0 })
});
const recycled = [];
const transportContext = vm.createContext({
  AbortController,
  Float32Array,
  Number,
  URLSearchParams,
  GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES: 4096,
  GOOGLE_OBR_NATIVE_MAX_PENDING_BLOCKS: 4,
  fetch: async (...args) => {
    fetchCalls += 1;
    return fetchHandler(...args);
  },
  safeText: (value, fallback) => String(value || fallback),
  state: { obrSpatialAudio: { requested: true } },
  failGoogleObr: (error) => { throw error; }
});
vm.runInContext(`
  ${recycleSource}
  ${discardSource}
  ${enqueueSource}
  ${pumpSource}
  globalThis.transportApi = { enqueueNativeSpatialBlock, pumpNativeSpatialBlocks };
`, transportContext, { filename: appPath });
const graph = {
  disposed: false,
  session: 11,
  generation: 7,
  captureTimelineEpoch: 2,
  timelineTransitionActive: true,
  streamAbort: { signal: {} },
  blockQueue: [],
  blockUploadActive: false,
  activeBlock: null,
  nextBlockSequence: 0,
  uploadedBlocks: 0,
  transportDroppedBlocks: 0,
  transportRetryAttempts: 0,
  transportRecoveredBlocks: 0,
  transportRecoveryCount: 0,
  node: {
    port: {
      postMessage(message) {
        recycled.push(message);
      }
    }
  }
};
const stalePcm = new Float32Array(4096 * 2);
assert.equal(transportContext.transportApi.enqueueNativeSpatialBlock(graph, stalePcm, {
  bufferId: 3,
  poolEpoch: 1,
  timelineEpoch: 1
}), false, 'a pre-seek PCM block must be rejected by the new capture epoch');
assert.equal(fetchCalls, 0, 'stale PCM must never reach the Java/native generation');
assert.equal(recycled.length, 1, 'a live graph must return stale ownership to the worklet pool');
const newTimelinePcm = new Float32Array(4096 * 2);
assert.equal(transportContext.transportApi.enqueueNativeSpatialBlock(graph, newTimelinePcm, {
  bufferId: 4,
  poolEpoch: 1,
  timelineEpoch: 2
}), true, 'new-timeline PCM should prebuffer while the native reset is acknowledged');
assert.equal(graph.blockQueue.length, 1, 'new-timeline PCM should remain in the bounded prebuffer');
assert.equal(fetchCalls, 0, 'new PCM must not be submitted under the previous native generation');
let retryAttempt = 0;
fetchHandler = async () => {
  retryAttempt += 1;
  return retryAttempt < 3
    ? { ok: false, status: 503, json: async () => ({ ok: false, error: 'busy' }) }
    : { ok: true, status: 200, json: async () => ({ ok: true, sequence: 0 }) };
};
graph.timelineTransitionActive = false;
graph.blockQueue[0].nativeGeneration = graph.generation;
await transportContext.transportApi.pumpNativeSpatialBlocks(graph);
assert.equal(retryAttempt, 3, 'a transient finite-block failure should retry in place');
assert.equal(graph.transportRecoveredBlocks, 1, 'a recovered block should be observable');
assert.equal(graph.uploadedBlocks, 1, 'an idempotently retried block must count once');
const settingsCenterSource = extractFunction('initializeSettingsCenter');
assert.match(
  settingsCenterSource,
  /onSeek:\s*\(ratio\)[\s\S]{0,500}setAudioCurrentTimeWithNativeContinuity\([\s\S]{0,200}'mixer-waveform-seek'/,
  'Mixer waveform scrubbing must rotate the shared native timeline epoch'
);
assert.doesNotMatch(
  settingsCenterSource.match(/onSeek:\s*\(ratio\)[\s\S]{0,500}/)?.[0] || '',
  /els\.audio\.currentTime\s*=/,
  'Mixer waveform scrubbing must not bypass the shared seek coordinator'
);
assert.match(
  routesSource,
  /"\/api\/audio\/spatial\/timeline"[\s\S]{0,500}resetSpatialTimeline/,
  'the browser needs a bounded timeline-reset endpoint instead of destroying its AudioWorklet graph'
);
assert.match(
  engineSource,
  /resetSpatialTimeline\(long session, long generation\)/,
  'the Java/native transport must rotate generations atomically on seek'
);
assert.match(
  pipelineHeaderSource,
  /fe_audio_pipeline_reset_timeline\(/,
  'native seek must flush/rearm its XAudio2 queue without replacing the Mixer graph'
);
assert.match(
  pipelineSource,
  /HRESULT ResetTimeline\(\)[\s\S]{0,4000}FlushSourceBuffers\(\)/,
  'native timeline reset must stop and flush queued old audio'
);
assert.match(
  pipelineSource,
  /HRESULT ResetTimeline\(\)[\s\S]{0,2500}std::cos\([\s\S]{0,500}SetVolume\([\s\S]{0,1500}FlushSourceBuffers\(\)/,
  'XAudio2 must fade the obsolete voice on the control thread before flushing it'
);
assert.match(
  appSource,
  /function setAudioParamEqualPower\([\s\S]{0,1200}setValueCurveAtTime/,
  'the browser continuity path must use sample-accurate equal-power gain automation'
);
assert.match(
  nativeBridgeSource,
  /nativeResetSpatialTimeline[\s\S]{0,500}fe_audio_pipeline_reset_timeline/,
  'JNI must expose the in-place native timeline reset'
);

console.log(JSON.stringify({
  pass: true,
  timelineEpoch: postSeek.timelineEpoch,
  firstSample: postSeek.pcm[0],
  finalSample: postSeek.pcm.at(-1),
  fadeFrames: 720
}, null, 2));
