import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const appPath = path.resolve(import.meta.dirname, '../web/app.js');
const source = fs.readFileSync(appPath, 'utf8');
const extract = (name) => {
  const value = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];
  assert.ok(value, `${name} must exist`);
  return value;
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function drain() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

function fixture() {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const returned = [];
  const failures = [];
  const dryChanges = [];
  const graph = {
    nativeStream: true, disposed: false, session: 7, generation: 1,
    nativeGainSequence: 1, nativeGainCeiling: 1, outputOwner: 'native',
    captureTimelineEpoch: 1, appliedTimelineEpoch: 1,
    timelineTransitionActive: false, timelineResetPromise: null,
    timelineResetCount: 0, timelineResetFailures: 0,
    context: { sampleRate: 48000, currentTime: 0 }, dryGain: { gain: { value: 0 } },
    streamAbort: new AbortController(), blockQueue: [], blockUploadActive: false,
    nextBlockSequence: 0, uploadedBlocks: 0, transportDroppedBlocks: 0,
    transportSeekDiscardedBlocks: 0, transportRecoveredBlocks: 0,
    transportRetryAttempts: 0, transportRecoveryCount: 0, poolStarvedFrames: 0,
    node: { port: { postMessage(message, transfer = []) {
      if (message.type === 'recycle-pcm') returned.push(structuredClone(message, { transfer }));
    } } }
  };
  const context = vm.createContext({
    AbortController, DOMException, Float32Array, URLSearchParams, Number, Math, Promise,
    Date: class extends Date { static now() { return 1700000000000 + now; } },
    encodeURIComponent, performance: { now: () => now },
    window: {
      setTimeout(callback, delay = 0) {
        const id = ++timerId;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout(id) { timers.delete(id); }
    },
    GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES: 4096,
    GOOGLE_OBR_NATIVE_RENDER_FRAMES: 256,
    GOOGLE_OBR_NATIVE_MAX_PENDING_BLOCKS: 4,
    GOOGLE_OBR_NATIVE_UPLOAD_RETRY_DELAYS: [20, 50],
    document: { hidden: false },
    state: { obrSpatialAudio: { graph, requested: true, enabled: true }, audioPositionSync: {}, qishuiPlaybackCard: {} },
    els: { audio: { src: 'fixture', paused: false, ended: false, currentTime: 10 } },
    safeText: (value, fallback) => String(value || fallback),
    setAudioParamEqualPower(parameter, value) { parameter.value = value; dryChanges.push(value); },
    setAudioParamSmoothly(parameter, value) { parameter.value = value; },
    // Envelope timing is covered by the handoff suite; retain real gain RPCs
    // and ownership fences, but acknowledge local audio rendering immediately.
    async waitForNativeSpatialDryGain(target, value, isCurrent) {
      if (!isCurrent()) throw new DOMException('obsolete fixture gain', 'AbortError');
      target.dryGain.gain.value = value; dryChanges.push(value);
    },
    updateNativeGoogleObrMetrics() {},
    failGoogleObr(error) { failures.push(error); }
  });
  for (const name of ['GOOGLE_OBR_NATIVE_UPLOAD_TIMEOUT_MS', 'GOOGLE_OBR_NATIVE_REQUEST_TIMEOUT_MS']) {
    const declaration = source.match(new RegExp(`const ${name} = [^;]+;`))?.[0];
    assert.ok(declaration, `${name} must define the production deadline`);
    vm.runInContext(declaration, context);
  }
  for (const name of [
    'apiJson', 'nativeSpatialRequest', 'nativeSpatialLeaseDeadline', 'setNativeSpatialOutputGain',
    'handoffNativeSpatialOutput', 'recycleNativeSpatialBlock', 'discardNativeSpatialBlocks',
    'enqueueNativeSpatialBlock', 'pumpNativeSpatialBlocks', 'waitForNativeGoogleObrPreroll',
    'resetNativeSpatialTimeline', 'beginNativeSpatialTimelineTransition', 'refreshNativeGoogleObrHealth'
  ]) vm.runInContext(extract(name), context, { filename: appPath });
  return {
    graph, context, timers, returned, failures, dryChanges,
    gainReply(url) {
      const values = new URL(url, 'http://fixture').searchParams;
      return { ok: true, session: 7, generation: Number(values.get('generation')),
        gainSequence: Number(values.get('sequence')), outputGain: Number(values.get('gain')),
        gainLeaseExpiresAt: Number(values.get('expiresAt')) };
    },
    get now() { return now; },
    async advance(milliseconds) {
      const until = now + milliseconds;
      await drain();
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await drain();
      }
      now = until;
      await drain();
    }
  };
}

for (const phase of ['preroll', 'activate']) {
  test(`seek during ${phase} completes the newest native timeline`, async () => {
    const f = fixture();
    const gate = deferred();
    let blocked = false;
    let resets = 0;
    let activations = 0;
    f.context.pumpNativeSpatialBlocks = () => {};
    f.context.waitForNativeGoogleObrPreroll = () => {
      if (phase === 'preroll' && !blocked) { blocked = true; return gate.promise; }
      return Promise.resolve({ ready: true });
    };
    f.context.nativeSpatialRequest = async (url) => {
      if (url.includes('/timeline?')) return { ok: true, session: 7, generation: ++resets + 1 };
      const gain = Number(new URL(url, 'http://fixture').searchParams.get('gain'));
      if (gain === .5 && !f.graph.timelineTransitionActive) {
        activations += 1;
        if (phase === 'activate' && !blocked) { blocked = true; return gate.promise; }
      }
      return f.gainReply(url);
    };
    const first = f.context.beginNativeSpatialTimelineTransition('first');
    await drain();
    assert.equal(blocked, true);
    const second = f.context.beginNativeSpatialTimelineTransition('second');
    gate.resolve({ ok: true });
    const result = await Promise.all([first, second]);
    assert.deepEqual(result, [true, true]);
    assert.equal(f.graph.captureTimelineEpoch, 3);
    assert.equal(f.graph.appliedTimelineEpoch, 3, 'The newest seek must reach native reset');
    assert.equal(f.graph.timelineTransitionActive, false);
    assert.equal(f.graph.timelineResetPromise, null, 'Completion must release ownership before callers resume');
    assert.equal(resets, 2);
    assert.equal(activations, phase === 'activate' ? 2 : 1);
    assert.equal(f.dryChanges.filter((value) => value === 0).length, 1,
      'Only the final epoch may silence browser continuity audio');
    assert.equal(f.failures.length, 0);
  });
}

test('a seek immediately after completion starts another reset', async () => {
  const f = fixture();
  f.context.els.audio.paused = true;
  let resets = 0;
  f.context.nativeSpatialRequest = async url => url.includes('/timeline?')
    ? { ok: true, session: 7, generation: ++resets + 1 } : f.gainReply(url);
  await f.context.beginNativeSpatialTimelineTransition('first');
  await f.context.beginNativeSpatialTimelineTransition('next-microtask');
  assert.equal(f.graph.appliedTimelineEpoch, f.graph.captureTimelineEpoch);
  assert.equal(resets, 2);
});

const hangingResponse = (signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
});

for (const phase of ['headers', 'body']) {
  test(`stalled PCM ${phase} aborts within 750ms without replaying uncertain audio`, async () => {
    const f = fixture();
    let attempts = 0;
    let recoveries = 0;
    let signal;
    f.context.fetch = (url, options) => {
      attempts += 1;
      signal = options.signal;
      if (phase === 'headers') return hangingResponse(signal);
      return Promise.resolve({ ok: true, status: 200, json: () => hangingResponse(signal) });
    };
    f.context.beginNativeSpatialTimelineTransition = async () => { recoveries += 1; return true; };
    const pcm = new Float32Array(8192);
    f.context.enqueueNativeSpatialBlock(f.graph, pcm, { bufferId: 0, poolEpoch: 1, timelineEpoch: 1 });
    await f.advance(749);
    assert.equal(f.graph.blockUploadActive, true);
    assert.equal(f.returned.length, 0, 'Pending fetch owns its PCM');
    await f.advance(1);
    assert.equal(f.graph.blockUploadActive, false, 'The serial upload must not remain stuck');
    assert.equal(signal.aborted, true);
    assert.equal(attempts, 1, 'An upload with uncertain acceptance must not be replayed');
    assert.equal(recoveries, 1);
    assert.equal(f.returned.length, 1);
    assert.equal(pcm.byteLength, 0, 'The completed abort returns the exact transferable once');
    assert.equal(f.graph.dryGain.gain.value, 0,
      'Upload failure must delegate fallback to the handoff, not raise dry before native acknowledges');
    assert.equal(f.timers.size, 0, 'Request timers must be removed after abort');
  });
}

test('seek aborts an obsolete upload and returns its buffer once', async () => {
  const f = fixture();
  let uploadSignal;
  f.context.fetch = (url, { signal }) => { uploadSignal = signal; return hangingResponse(signal); };
  f.context.resetNativeSpatialTimeline = async () => true;
  f.context.enqueueNativeSpatialBlock(f.graph, new Float32Array(8192), {
    bufferId: 0, poolEpoch: 1, timelineEpoch: 1
  });
  await f.context.beginNativeSpatialTimelineTransition('seek');
  await drain();
  assert.equal(uploadSignal.aborted, true);
  assert.equal(f.graph.blockUploadActive, false);
  assert.equal(f.returned.length, 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.failures.length, 0);
});

test('accepted PCM with the current expired gain lease resets once even while hidden, without replay', async () => {
  const f = fixture();
  f.context.document.hidden = true;
  f.graph.nativeGainSequence = 7;
  const accepted = deferred();
  const uploads = [];
  let resets = 0;
  f.context.fetch = (url, options) => {
    const params = new URL(url, 'http://fixture').searchParams;
    uploads.push({ sequence: Number(params.get('sequence')), gainSequence: Number(params.get('gainSequence')), signal: options.signal });
    return accepted.promise;
  };
  f.context.nativeSpatialRequest = async (url) => {
    if (url.includes('/timeline?')) return { ok: true, session: 7, generation: ++resets + 1 };
    return f.gainReply(url);
  };
  f.context.waitForNativeGoogleObrPreroll = async () => ({ ready: true });
  const active = new Float32Array(8192);
  const queued = new Float32Array(8192);
  f.context.enqueueNativeSpatialBlock(f.graph, active, { bufferId: 0, poolEpoch: 1, timelineEpoch: 1 });
  f.context.enqueueNativeSpatialBlock(f.graph, queued, { bufferId: 1, poolEpoch: 1, timelineEpoch: 1 });
  assert.equal(uploads[0].gainSequence, 7);
  accepted.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sequence: 0, gainLeaseExpired: true }) });
  for (let step = 0; step < 10; step += 1) await drain();
  assert.equal(resets, 1, 'An expired current output lease must run the actual native generation reset');
  assert.equal(f.graph.transportRecoveryCount, 1);
  assert.equal(f.graph.timelineResetReason, 'transport-recovery');
  assert.equal(f.graph.generation, 2);
  assert.equal(f.graph.captureTimelineEpoch, 2);
  assert.equal(f.graph.appliedTimelineEpoch, 2);
  assert.equal(f.graph.timelineResetPromise, null);
  assert.equal(f.graph.outputOwner, 'native', 'The completed reset must reacquire native output ownership');
  assert.equal(uploads.length, 1, 'Accepted PCM and queued old-generation PCM must never be replayed');
  assert.equal(uploads[0].signal.aborted, true, 'Lease failure must stop the upload retry loop');
  assert.equal(f.graph.transportRetryAttempts, 0);
  assert.deepEqual(f.returned.map((message) => message.bufferId).sort(), [0, 1]);
  assert.equal(active.byteLength, 0);
  assert.equal(queued.byteLength, 0);
  assert.equal(f.graph.blockUploadActive, false);
  assert.equal(f.graph.activeBlock, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.failures.length, 0);
});

test('expired lease response for an obsolete gain sequence cannot reset the current output', async () => {
  const f = fixture();
  f.context.document.hidden = true;
  f.graph.nativeGainSequence = 7;
  const accepted = deferred();
  const uploads = [];
  let resets = 0;
  f.context.fetch = (url, options) => {
    const params = new URL(url, 'http://fixture').searchParams;
    const sequence = Number(params.get('sequence'));
    uploads.push({ sequence, gainSequence: Number(params.get('gainSequence')), signal: options.signal });
    return sequence === 0 ? accepted.promise : Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sequence }) });
  };
  f.context.nativeSpatialRequest = async (url) => {
    if (url.includes('/timeline?')) return { ok: true, session: 7, generation: ++resets + 1 };
    return f.gainReply(url);
  };
  const active = new Float32Array(8192);
  const queued = new Float32Array(8192);
  f.context.enqueueNativeSpatialBlock(f.graph, active, { bufferId: 0, poolEpoch: 1, timelineEpoch: 1 });
  f.context.enqueueNativeSpatialBlock(f.graph, queued, { bufferId: 1, poolEpoch: 1, timelineEpoch: 1 });
  // A newer acknowledged ownership phase supersedes the in-flight block's lease.
  f.graph.nativeGainSequence = 8;
  accepted.resolve({ ok: true, status: 200, json: async () => ({ ok: true, sequence: 0, gainLeaseExpired: true }) });
  for (let step = 0; step < 10; step += 1) await drain();
  assert.equal(resets, 0, 'A late reply cannot tear down a newer output lease');
  assert.equal(f.graph.transportRecoveryCount, 0);
  assert.equal(f.graph.generation, 1);
  assert.equal(f.graph.captureTimelineEpoch, 1);
  assert.equal(f.graph.nativeGainSequence, 8);
  assert.equal(f.graph.outputOwner, 'native');
  assert.deepEqual(uploads.map(({ sequence, gainSequence }) => ({ sequence, gainSequence })), [
    { sequence: 0, gainSequence: 7 }, { sequence: 1, gainSequence: 8 }
  ]);
  assert.ok(uploads.every(({ signal }) => !signal.aborted));
  assert.equal(f.graph.uploadedBlocks, 2);
  assert.equal(f.graph.transportRetryAttempts, 0);
  assert.deepEqual(f.returned.map((message) => message.bufferId).sort(), [0, 1]);
  assert.equal(active.byteLength, 0);
  assert.equal(queued.byteLength, 0);
  assert.equal(f.graph.blockUploadActive, false);
  assert.equal(f.graph.activeBlock, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.failures.length, 0);
});

test('native control requests have a 2000ms deadline', async () => {
  const f = fixture();
  f.context.fetch = (url, { signal }) => hangingResponse(signal);
  let error;
  const pending = f.context.nativeSpatialRequest('/api/audio/spatial/timeline').catch((value) => { error = value; });
  await f.advance(2000);
  assert.equal(error?.name, 'TimeoutError');
  await pending;
  assert.equal(f.timers.size, 0);
});

test('a hanging preroll status request cannot bypass its deadline', async () => {
  const f = fixture();
  f.context.fetch = (url, { signal }) => hangingResponse(signal);
  let error;
  const pending = f.context.waitForNativeGoogleObrPreroll(f.graph).catch((value) => { error = value; });
  await f.advance(2000);
  assert.equal(error?.name, 'TimeoutError');
  await pending;
  assert.equal(f.timers.size, 0);
});

test('preroll ignores a status response overtaken by another seek', async () => {
  const f = fixture();
  const status = deferred();
  f.context.apiJson = () => status.promise;
  const pending = f.context.waitForNativeGoogleObrPreroll(f.graph, 1);
  f.graph.captureTimelineEpoch = 2;
  status.resolve({ active: false, session: 7, generation: 1 });
  assert.equal(await pending, null, 'An obsolete response must not fail the newer timeline');
  assert.equal(f.failures.length, 0);
});

for (const change of ['generation', 'captureTimelineEpoch', 'transition']) {
  test(`health ignores an old status after ${change} changes`, async () => {
    const f = fixture();
    const status = deferred();
    f.context.apiJson = () => status.promise;
    const pending = f.context.refreshNativeGoogleObrHealth();
    if (change === 'transition') f.graph.timelineTransitionActive = true;
    else f.graph[change] += 1;
    status.resolve({ active: false, session: 7, generation: 1 });
    assert.equal(await pending, null, 'stale health cannot dispose the newer native timeline');
    assert.equal(f.failures.length, 0);
    assert.equal(f.context.state.obrSpatialAudio.nativeHealthRequest, null);
  });
}
test('health waits through a reset but still fails a genuinely stopped current session', async () => {
  const f = fixture();
  let requests = 0;
  f.context.apiJson = async () => { requests += 1; return { active: false, session: 7, generation: 1 }; };
  f.graph.timelineTransitionActive = true;
  assert.equal(await f.context.refreshNativeGoogleObrHealth(), null);
  assert.equal(requests, 0);
  f.graph.timelineTransitionActive = false;
  f.graph.timelineResetPromise = Promise.resolve();
  assert.equal(await f.context.refreshNativeGoogleObrHealth(), null);
  assert.equal(requests, 0);
  f.graph.timelineResetPromise = null;
  await f.context.refreshNativeGoogleObrHealth();
  assert.equal(requests, 1);
  assert.equal(f.failures.length, 1, 'a current stopped voice must continue to trigger fallback');
});

test('graph disposal aborts transport without recovery or obsolete buffer recycling', async () => {
  const f = fixture();
  f.context.fetch = (url, { signal }) => hangingResponse(signal);
  f.context.enqueueNativeSpatialBlock(f.graph, new Float32Array(8192), {
    bufferId: 0, poolEpoch: 1, timelineEpoch: 1
  });
  f.graph.disposed = true;
  f.graph.streamAbort.abort();
  await drain();
  assert.equal(f.graph.blockUploadActive, false);
  assert.equal(f.returned.length, 0);
  assert.equal(f.graph.transportRecoveryCount, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.failures.length, 0);
});

test('real localhost fetch aborts a received PCM body with a stalled response', async (t) => {
  const received = deferred();
  let receivedBlocks = 0;
  const server = createServer((request) => {
    request.resume();
    request.on('end', () => { receivedBlocks += 1; received.resolve(); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const f = fixture();
  const recovery = deferred();
  f.context.window = { setTimeout, clearTimeout };
  f.context.performance = performance;
  f.context.fetch = (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
  f.context.beginNativeSpatialTimelineTransition = async () => { recovery.resolve(); return true; };
  let watchdog;
  try {
    const startedAt = performance.now();
    f.context.enqueueNativeSpatialBlock(f.graph, new Float32Array(8192), {
      bufferId: 0, poolEpoch: 1, timelineEpoch: 1
    });
    await Promise.race([
      Promise.all([received.promise, recovery.promise]),
      new Promise((resolve, reject) => { watchdog = setTimeout(() => reject(new Error('HTTP deadline exceeded 2500ms')), 2500); })
    ]);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(receivedBlocks, 1, 'A received block with a lost acknowledgement must not be submitted again');
    assert.equal(f.graph.blockUploadActive, false);
    assert.equal(f.returned.length, 1);
    assert.equal(f.graph.dryGain.gain.value, 0,
      'The transport layer must not bypass the handoff when a real HTTP response stalls');
    t.diagnostic(`Localhost stalled-response recovery: ${elapsedMs.toFixed(1)}ms (configured deadline 750ms)`);
  } finally {
    clearTimeout(watchdog);
    f.graph.disposed = true;
    f.graph.streamAbort.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
