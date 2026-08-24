import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const workletPath = path.join(
  root,
  'web',
  'vendor',
  'native-spatial',
  'native-pcm-worklet.js'
);
const source = fs.readFileSync(workletPath, 'utf8');
const NativeFloat32Array = globalThis.Float32Array;

let float32Allocations = 0;
let Processor = null;

function TrackingFloat32Array(...args) {
  float32Allocations += 1;
  return new NativeFloat32Array(...args);
}
Object.setPrototypeOf(TrackingFloat32Array, NativeFloat32Array);
TrackingFloat32Array.prototype = NativeFloat32Array.prototype;

class FakePort {
  constructor() {
    this.onmessage = null;
    this.messages = [];
  }

  postMessage(message, transfer = []) {
    const cloned = structuredClone(message, { transfer });
    this.messages.push({ message: cloned, transferCount: transfer.length });
  }

  deliver(message) {
    const transfer = message?.type === 'recycle-pcm'
      && message.pcm instanceof NativeFloat32Array
      ? [message.pcm.buffer]
      : [];
    const cloned = structuredClone(message, { transfer });
    this.onmessage?.({ data: cloned });
  }
}

class FakeAudioWorkletProcessor {
  constructor() {
    this.port = new FakePort();
  }
}

vm.runInNewContext(source, {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  Float32Array: TrackingFloat32Array,
  Number,
  Math,
  sampleRate: 48000,
  registerProcessor(name, constructor) {
    assert.equal(name, 'fe-native-pcm-bridge');
    Processor = constructor;
  }
}, { filename: workletPath });

assert.equal(typeof Processor, 'function', 'The native PCM AudioWorklet must register itself.');

const left = new NativeFloat32Array(128).fill(0.25);
const right = new NativeFloat32Array(128).fill(-0.25);
const outputLeft = new NativeFloat32Array(128);
const outputRight = new NativeFloat32Array(128);

function enable(processor, enabled) {
  processor.port.deliver({ type: 'set-enabled', enabled });
}

function processTransportBlock(processor) {
  const before = processor.port.messages.length;
  for (let quantum = 0; quantum < 4096 / 128; quantum += 1) {
    assert.equal(
      processor.process([[left, right]], [[outputLeft, outputRight]]),
      true
    );
  }
  return processor.port.messages
    .slice(before)
    .map((entry) => entry.message)
    .find((message) => message.type === 'pcm') || null;
}

function recycle(processor, message) {
  processor.port.deliver({
    type: 'recycle-pcm',
    pcm: message.pcm,
    bufferId: message.bufferId,
    poolEpoch: message.poolEpoch
  });
}

// A returned transferable must make steady-state capture allocation-free.
const steady = new Processor();
const ready = steady.port.messages.find(({ message }) => message.type === 'ready')?.message;
assert.ok(
  Number.isInteger(ready?.bufferPoolSize) && ready.bufferPoolSize >= 6,
  'The ready event must publish a fixed pool large enough for current + upload + queue ownership.'
);
enable(steady, true);
const steadyAllocationBaseline = float32Allocations;
for (let index = 0; index < 20; index += 1) {
  const message = processTransportBlock(steady);
  assert.ok(message, `Transport block ${index + 1} should be emitted.`);
  assert.ok(Number.isInteger(message.bufferId), 'Each block must carry its pool buffer id.');
  assert.ok(Number.isInteger(message.poolEpoch), 'Each block must carry its pool epoch.');
  recycle(steady, message);
}
assert.equal(
  float32Allocations,
  steadyAllocationBaseline,
  'AudioWorklet must not allocate a Float32Array for every 4096-frame transport block.'
);
const steadyStateFloat32Allocations = float32Allocations - steadyAllocationBaseline;

// A buffer remains exclusively owned by the main thread until it is returned.
const held = new Processor();
const heldReady = held.port.messages.find(({ message }) => message.type === 'ready')?.message;
enable(held, true);
const inFlight = [];
for (let index = 0; index < heldReady.bufferPoolSize; index += 1) {
  const message = processTransportBlock(held);
  assert.ok(message, `Pool slot ${index + 1} should be emitted exactly once before recycle.`);
  assert.ok(
    !inFlight.some((candidate) => candidate.pcm.buffer === message.pcm.buffer),
    'An in-flight PCM buffer must not be reused before the main thread returns it.'
  );
  inFlight.push(message);
}
const allocationAtExhaustion = float32Allocations;
assert.equal(
  processTransportBlock(held),
  null,
  'Pool exhaustion must drop capture instead of reusing an in-flight upload buffer.'
);
const starvationMetric = held.port.messages
  .map(({ message }) => message)
  .filter((message) => message.type === 'metrics')
  .at(-1);
assert.ok(
  Number(starvationMetric?.poolStarvedFrames) >= 4096,
  'Pool starvation must be reported even while no PCM block can be emitted.'
);
assert.equal(
  float32Allocations,
  allocationAtExhaustion,
  'Pool exhaustion must not fall back to allocating a transport block.'
);
recycle(held, inFlight[0]);
const resumed = processTransportBlock(held);
assert.ok(resumed, 'Returning one transferable should resume capture.');
assert.equal(
  resumed.bufferId,
  inFlight[0].bufferId,
  'The returned pool slot should be reused after ownership is transferred back.'
);

// Disabling invalidates the epoch so a late main-thread return is discarded.
const lifecycle = new Processor();
enable(lifecycle, true);
const stale = processTransportBlock(lifecycle);
assert.ok(stale, 'Lifecycle probe needs one in-flight block.');
enable(lifecycle, false);
recycle(lifecycle, stale);
assert.equal(stale.pcm.byteLength, 0, 'Returning a buffer must transfer ownership away from the main thread.');
enable(lifecycle, true);
const fresh = processTransportBlock(lifecycle);
assert.ok(fresh, 'Capture should restart with a fresh fixed pool.');
assert.notEqual(
  fresh.poolEpoch,
  stale.poolEpoch,
  'A disable/re-enable cycle must invalidate late recycle messages.'
);

console.log(JSON.stringify({
  pass: true,
  poolSize: ready.bufferPoolSize,
  steadyStateFloat32Allocations,
  ownership: 'transfer-return-after-upload',
  lifecycle: 'epoch-invalidated-on-disable'
}, null, 2));
