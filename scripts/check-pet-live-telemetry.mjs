import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const modulePath = path.join(root, 'web', 'pet-live-telemetry.js');

assert.ok(fs.existsSync(modulePath), 'the bounded live telemetry module is missing');

const telemetryModule = require(modulePath);
assert.equal(typeof telemetryModule.createSessionTelemetry, 'function');
assert.ok(Object.isFrozen(telemetryModule.STAGES), 'the public stage vocabulary must be immutable');

const browserContext = {
  performance: { now: () => 12.5 }
};
browserContext.globalThis = browserContext;
vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), browserContext, {
  filename: 'pet-live-telemetry.js'
});
assert.equal(typeof browserContext.FeMonsterPetLiveTelemetry?.createSessionTelemetry, 'function',
  'the same file must load as a dependency-free browser global');

const requiredStages = [
  'speech_start',
  'stt_partial',
  'stt_final',
  'endpoint',
  'llm_first_token',
  'tts_queued',
  'tts_first_byte',
  'fetch',
  'decode',
  'playout',
  'barge_local',
  'server_ack',
  'underrun',
  'dropped'
];
assert.deepEqual([...telemetryModule.STAGES], requiredStages);

let nowMs = 1_000;
const telemetry = telemetryModule.createSessionTelemetry({
  clock: () => nowMs,
  maxEvents: 256
});

const speechStart = telemetry.mark('speech_start', {
  requestId: 'request-1',
  provider: 'browser',
  queueDepth: 0,
  bytes: 640,
  text: 'PRIVATE TRANSCRIPT',
  feId: 'FE-PRIVATE',
  sessionId: 'SESSION-PRIVATE',
  token: 'TOKEN-PRIVATE',
  path: 'C:\\private\\voice.wav',
  url: 'https://private.invalid/audio'
});
nowMs = 1_018.125;
const sttFinal = telemetry.mark('stt_final', {
  requestId: 'request-1',
  segmentSeq: 3,
  provider: 'Sherpa ONNX',
  queueDepth: 2,
  bytes: 1_280
});

assert.equal(telemetry.duration(speechStart, sttFinal), 18.125,
  'duration() must use the monotonic event clock');

nowMs = 990;
const endpoint = telemetry.mark('endpoint', { requestId: 'request-1', provider: 'server' });
assert.equal(endpoint.atMs, sttFinal.atMs,
  'a clock regression must never make an event timestamp move backwards');

const firstSnapshot = telemetry.snapshot();
assert.equal(firstSnapshot.events.length, 3);
assert.ok(firstSnapshot.events.every((event, index, events) => (
  index === 0 || event.atMs >= events[index - 1].atMs
)), 'event timestamps must be monotonic');
assert.deepEqual(firstSnapshot.metrics, [{
  stage: 'stt_final',
  provider: 'sherpa-onnx',
  count: 1,
  p50Ms: 18.125,
  p95Ms: 18.125,
  p99Ms: 18.125
}]);

const privatePayload = JSON.stringify(firstSnapshot);
for (const privateValue of [
  'PRIVATE TRANSCRIPT',
  'FE-PRIVATE',
  'SESSION-PRIVATE',
  'TOKEN-PRIVATE',
  'C:\\private\\voice.wav',
  'https://private.invalid/audio'
]) {
  assert.ok(!privatePayload.includes(privateValue), `telemetry leaked ${privateValue}`);
}
for (const metric of firstSnapshot.metrics) {
  assert.deepEqual(Object.keys(metric), [
    'stage', 'provider', 'count', 'p50Ms', 'p95Ms', 'p99Ms'
  ], 'metric labels must stay limited to stage/provider');
}

assert.throws(() => telemetry.mark('arbitrary_user_label', {}), /unknown telemetry stage/i,
  'unknown stages would create unbounded metric cardinality');

const coverageTelemetry = telemetryModule.createSessionTelemetry({ clock: () => 7 });
for (const stage of requiredStages) coverageTelemetry.mark(stage, { provider: 'test' });
assert.deepEqual(coverageTelemetry.snapshot().events.map((event) => event.stage), requiredStages);

let stressNow = 0;
const stressed = telemetryModule.createSessionTelemetry({
  clock: () => stressNow,
  maxEvents: 100_000
});
for (let index = 0; index < 2_000; index += 1) {
  stressNow += 0.25;
  const from = stressed.mark(requiredStages[index % requiredStages.length], {
    requestId: `request-${index}-${'x'.repeat(200)}`,
    provider: `provider-${index}`,
    segmentSeq: index,
    queueDepth: index,
    bytes: index * 640
  });
  stressNow += 0.25;
  const to = stressed.mark(requiredStages[(index + 1) % requiredStages.length], {
    requestId: `request-${index}-${'y'.repeat(200)}`,
    provider: `provider-${index}`
  });
  stressed.duration(from, to);
}

const stressedSnapshot = stressed.snapshot();
assert.ok(stressedSnapshot.events.length <= 256, 'events exceeded the hard 256 event cap');
assert.ok(Buffer.byteLength(JSON.stringify(stressedSnapshot), 'utf8') <= 64 * 1024,
  'snapshot exceeded the 64 KiB upload cap');
assert.ok(stressedSnapshot.droppedEvents > 0, 'ring-buffer overflow must be observable');

const flushed = stressed.flushPayload();
assert.ok(Buffer.byteLength(JSON.stringify(flushed), 'utf8') <= 64 * 1024,
  'flushPayload() exceeded the 64 KiB upload cap');
assert.equal(stressed.snapshot().events.length, 0, 'flushPayload() must start a fresh event batch');
assert.equal(stressed.snapshot().metrics.length, 0, 'flushPayload() must start a fresh metric batch');

const isolatedA = telemetryModule.createSessionTelemetry({ clock: () => 1 });
const isolatedB = telemetryModule.createSessionTelemetry({ clock: () => 2 });
isolatedA.mark('speech_start', { requestId: 'only-a' });
assert.equal(isolatedA.snapshot().events.length, 1);
assert.equal(isolatedB.snapshot().events.length, 0,
  'separate users/sessions must not share event or aggregation state');

console.log(JSON.stringify({
  ok: true,
  stages: requiredStages.length,
  retainedEvents: stressedSnapshot.events.length,
  droppedEvents: stressedSnapshot.droppedEvents,
  payloadBytes: Buffer.byteLength(JSON.stringify(stressedSnapshot), 'utf8')
}));
