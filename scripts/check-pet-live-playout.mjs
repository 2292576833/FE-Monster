import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createLivePlayout } = require(path.join(root, 'web', 'pet-live-playout.js'));

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, message, timeoutMs = 4_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(message);
}

function encodedDuration(durationMs) {
  const bytes = new ArrayBuffer(8);
  new DataView(bytes).setFloat64(0, durationMs, true);
  return bytes;
}

class FakeAudioParam {
  constructor() {
    this.value = 1;
    this.events = [];
  }

  setValueAtTime(value, at) {
    this.value = value;
    this.events.push({ type: 'value', value, at });
  }

  setValueCurveAtTime(curve, at, duration) {
    this.events.push({ type: 'curve', curve: [...curve], at, duration });
  }

  cancelScheduledValues(at) {
    this.events.push({ type: 'cancel', at });
  }

  linearRampToValueAtTime(value, at) {
    this.value = value;
    this.events.push({ type: 'ramp', value, at });
  }
}

class FakeAudioContext {
  constructor({ withGain = true, decodeDelayMs = 0, decodeFailures = new Set() } = {}) {
    this.startedAt = performance.now();
    this.destination = {};
    this.state = 'running';
    this.sampleRate = 48_000;
    this.withGain = withGain;
    this.decodeDelayMs = decodeDelayMs;
    this.decodeFailures = decodeFailures;
    this.sources = [];
    this.gains = [];
    if (!withGain) this.createGain = undefined;
  }

  get currentTime() {
    return (performance.now() - this.startedAt) / 1_000;
  }

  async resume() {
    this.state = 'running';
  }

  async decodeAudioData(arrayBuffer) {
    if (this.decodeDelayMs) await delay(this.decodeDelayMs);
    const durationMs = new DataView(arrayBuffer).getFloat64(0, true);
    if (this.decodeFailures.has(durationMs)) throw new Error(`decode failed ${durationMs}`);
    return {
      duration: durationMs / 1_000,
      sampleRate: 48_000,
      length: Math.round(durationMs * 48)
    };
  }

  createGain() {
    const node = {
      gain: new FakeAudioParam(),
      connect() {},
      disconnect() {}
    };
    this.gains.push(node);
    return node;
  }

  createBufferSource() {
    const context = this;
    const source = {
      buffer: null,
      onended: null,
      startAt: null,
      stopAt: null,
      timer: null,
      connect() {},
      disconnect() {},
      start(when) {
        this.startAt = when;
        const endAt = when + Number(this.buffer?.duration || 0);
        this.timer = setTimeout(() => this.onended?.(), Math.max(0, (endAt - context.currentTime) * 1_000));
      },
      stop(when = context.currentTime) {
        this.stopAt = when;
        clearTimeout(this.timer);
        queueMicrotask(() => this.onended?.());
      }
    };
    this.sources.push(source);
    return source;
  }
}

function segment(audioSequence, durationMs, extra = {}) {
  return {
    requestId: extra.requestId || 'request-a',
    audioSequence,
    durationMs,
    kind: 'content',
    ...extra
  };
}

function makeFetch(delays = {}, failures = new Set()) {
  return async (item, { signal } = {}) => {
    const waitMs = Number(delays[item.audioSequence] || 0);
    if (waitMs) await delay(waitMs);
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (failures.has(item.audioSequence)) throw new Error(`fetch failed ${item.audioSequence}`);
    return encodedDuration(item.durationMs);
  };
}

async function checkOrderedContinuousPlayback() {
  const context = new FakeAudioContext();
  const started = [];
  const ended = [];
  const cursors = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch({ 0: 60, 1: 5 }),
    onStarted: (item, detail) => started.push({ sequence: item.audioSequence, ...detail }),
    onEnded: (item, detail) => ended.push({ sequence: item.audioSequence, ...detail }),
    onCursor: (cursor) => cursors.push(cursor)
  });

  const enqueuedAt = context.currentTime;
  assert.equal(playout.enqueue(segment(1, 520, { final: true })), true);
  assert.equal(playout.enqueue(segment(0, 520)), true);
  await waitFor(() => ended.filter((entry) => entry.reason === 'ended').length === 2,
    'ordered playback never drained');

  assert.deepEqual(started.map((entry) => entry.sequence), [0, 1]);
  assert.deepEqual(ended.map((entry) => entry.sequence), [0, 1]);
  assert.ok(started[0].scheduledAt - enqueuedAt >= 0.105,
    `startup buffer was shorter than 120 ms tolerance: ${started[0].scheduledAt - enqueuedAt}`);
  assert.ok(started[1].scheduledAt > started[0].scheduledAt);
  assert.ok(Math.abs((started[1].scheduledAt - started[0].scheduledAt) - 0.505) < 0.03,
    'adjacent speech chunks were not joined by the 15 ms overlap');
  assert.ok(context.gains.some((gain) => gain.gain.events.some((event) => event.type === 'curve')),
    'the equal-power crossfade was not scheduled');
  assert.ok(cursors.length >= 2, 'the 250 ms played-audio cursor did not advance');
  assert.ok(cursors.every((cursor, index) => index === 0 || cursor.playedSamples >= cursors[index - 1].playedSamples),
    'the played-audio cursor moved backwards');

  const snapshot = playout.snapshot();
  assert.equal(playout.setVolume(0.18, 45), true, 'supported playout should expose a smooth master-volume duck');
  assert.ok(context.gains[0].gain.events.some((event) => event.type === 'ramp' && event.value === 0.18),
    'master-volume duck did not schedule a gain ramp');
  assert.equal(snapshot.metrics.fetched, 2);
  assert.equal(snapshot.metrics.decoded, 2);
  assert.equal(snapshot.metrics.ended, 2);
  assert.ok(snapshot.metrics.maxScheduleHorizonSeconds <= snapshot.limits.scheduleHorizonSeconds + 0.001,
    'playout scheduled beyond its one-second horizon');
  assert.equal(snapshot.queueDepth, 0);
  playout.close();
  return { started, cursors: cursors.length, metrics: snapshot.metrics };
}

async function checkSemanticPause() {
  const context = new FakeAudioContext();
  const started = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch(),
    onStarted: (item, detail) => started.push({ sequence: item.audioSequence, ...detail })
  });
  playout.enqueue(segment(0, 160));
  playout.enqueue(segment(1, 160, { semanticPause: true, final: true }));
  await waitFor(() => started.length === 2, 'semantic-pause playback did not start');
  assert.ok(Math.abs((started[1].scheduledAt - started[0].scheduledAt) - 0.16) < 0.025,
    'semantic pause was incorrectly crossfaded');
  playout.close();

  const punctuationContext = new FakeAudioContext();
  const punctuationStarted = [];
  const punctuation = createLivePlayout({
    audioContext: punctuationContext,
    fetchAudio: makeFetch(),
    onStarted: (item, detail) => punctuationStarted.push({ sequence: item.audioSequence, ...detail })
  });
  punctuation.enqueue(segment(0, 160, { text: '先听完这一句。' }));
  punctuation.enqueue(segment(1, 160, { text: '再继续。', final: true }));
  await waitFor(() => punctuationStarted.length === 2, 'punctuation boundary playback did not start');
  assert.ok(Math.abs((punctuationStarted[1].scheduledAt - punctuationStarted[0].scheduledAt) - 0.16) < 0.025,
    'a spoken punctuation boundary was incorrectly crossfaded');
  punctuation.close();
}

async function checkMissingAndFailedBlocksDoNotDeadlock() {
  const context = new FakeAudioContext();
  const started = [];
  const errors = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch(),
    onStarted: (item) => started.push(item.audioSequence),
    onError: (error, detail) => errors.push({ code: error.code, stage: detail?.stage })
  });
  playout.enqueue(segment(1, 120, { final: true }));
  await waitFor(() => started.includes(1), 'a permanently missing sequence deadlocked playback');
  assert.ok(playout.snapshot().metrics.missingSequenceSkips >= 1);
  playout.close();

  const failureContext = new FakeAudioContext();
  const recovered = [];
  const failurePlayout = createLivePlayout({
    audioContext: failureContext,
    fetchAudio: makeFetch({}, new Set([0])),
    onStarted: (item) => recovered.push(item.audioSequence),
    onError: (error, detail) => errors.push({ code: error.code, stage: detail?.stage })
  });
  failurePlayout.enqueue(segment(0, 100));
  failurePlayout.enqueue(segment(1, 100, { final: true }));
  await waitFor(() => recovered.includes(1), 'a failed fetch deadlocked the following sequence');
  assert.ok(errors.some((entry) => entry.stage === 'fetch'));
  failurePlayout.close();

  const decodeContext = new FakeAudioContext({ decodeFailures: new Set([101]) });
  const decodeRecovered = [];
  const decodePlayout = createLivePlayout({
    audioContext: decodeContext,
    fetchAudio: makeFetch(),
    onStarted: (item) => decodeRecovered.push(item.audioSequence),
    onError: (error, detail) => errors.push({ code: error.code, stage: detail?.stage })
  });
  decodePlayout.enqueue(segment(0, 101));
  decodePlayout.enqueue(segment(1, 100, { final: true }));
  await waitFor(() => decodeRecovered.includes(1), 'a failed decode deadlocked the following sequence');
  assert.ok(errors.some((entry) => entry.stage === 'decode'));
  decodePlayout.close();
}

async function checkUnderrunMetric() {
  const context = new FakeAudioContext();
  const ended = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch({ 1: 420 }),
    onEnded: (item, detail) => ended.push({ sequence: item.audioSequence, reason: detail.reason })
  });
  playout.enqueue(segment(0, 100));
  playout.enqueue(segment(1, 100, { final: true }));
  await waitFor(() => ended.filter((entry) => entry.reason === 'ended').length === 2,
    'delayed next chunk did not recover after an underrun');
  assert.ok(playout.snapshot().metrics.underruns >= 1, 'a real scheduling starvation was not measured');
  playout.close();
}

async function checkInterruptLatency() {
  const context = new FakeAudioContext();
  const ended = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch(),
    onEnded: (item, detail) => ended.push({ sequence: item.audioSequence, ...detail })
  });
  playout.enqueue(segment(0, 1_500, { final: true }));
  await waitFor(() => playout.snapshot().playingSequence === 0, 'long chunk never started');
  const interruptedAt = performance.now();
  const cursor = playout.interrupt();
  await waitFor(() => ended.some((entry) => entry.reason === 'interrupted'), 'interrupt did not end the source');
  const latencyMs = performance.now() - interruptedAt;
  assert.ok(latencyMs < 100, `playout interrupt took ${latencyMs} ms`);
  assert.equal(cursor.audioSequence, 0);
  assert.equal(playout.snapshot().scheduledDepth, 0);
  assert.ok(context.sources[0].stopAt !== null, 'AudioBufferSourceNode.stop was not called');
  playout.close();
  return latencyMs;
}

async function checkBoundsAndFallbacks() {
  const context = new FakeAudioContext({ decodeDelayMs: 180 });
  const errors = [];
  const playout = createLivePlayout({
    audioContext: context,
    fetchAudio: makeFetch(),
    onError: (error) => errors.push(error.code)
  });
  let accepted = 0;
  for (let sequence = 0; sequence < 100; sequence += 1) {
    if (playout.enqueue(segment(sequence, 1_000, { final: sequence === 99 }))) accepted += 1;
  }
  const bounded = playout.snapshot();
  assert.ok(accepted <= bounded.limits.maxQueuedSegments);
  assert.ok(bounded.queueDepth <= bounded.limits.maxQueuedSegments);
  assert.ok(bounded.decodedDepth + bounded.fetchingDepth <= bounded.limits.maxPredecodedSegments);
  assert.ok(errors.includes('playout-queue-full'));
  playout.close();

  const unavailableErrors = [];
  const unavailable = createLivePlayout({
    audioContext: null,
    fetchAudio: async () => encodedDuration(100),
    onError: (error) => unavailableErrors.push(error.code)
  });
  assert.equal(unavailable.snapshot().supported, false);
  assert.equal(unavailable.snapshot().fallbackReason, 'audio-context-unavailable');
  assert.equal(unavailable.enqueue(segment(0, 100)), false);
  assert.deepEqual(unavailableErrors, ['audio-context-unavailable']);
  unavailable.close();
  unavailable.close();

  const reducedContext = new FakeAudioContext({ withGain: false });
  const reducedEnded = [];
  const reduced = createLivePlayout({
    audioContext: reducedContext,
    fetchAudio: makeFetch(),
    onEnded: (item, detail) => reducedEnded.push(detail.reason)
  });
  assert.equal(reduced.snapshot().supported, true);
  assert.equal(reduced.snapshot().crossfadeEnabled, false);
  reduced.enqueue(segment(0, 80, { final: true }));
  await waitFor(() => reducedEnded.includes('ended'), 'reduced AudioContext fallback did not play');
  reduced.close();

  return {
    accepted,
    maxQueuedSegments: bounded.limits.maxQueuedSegments,
    maxPredecodedSegments: bounded.limits.maxPredecodedSegments
  };
}

const ordered = await checkOrderedContinuousPlayback();
await checkSemanticPause();
await checkMissingAndFailedBlocksDoNotDeadlock();
await checkUnderrunMetric();
const interruptLatencyMs = await checkInterruptLatency();
const bounds = await checkBoundsAndFallbacks();

console.log(JSON.stringify({
  ok: true,
  orderedSequences: ordered.started.map((entry) => entry.sequence),
  cursorEvents: ordered.cursors,
  interruptLatencyMs,
  bounds,
  metrics: ordered.metrics
}, null, 2));
