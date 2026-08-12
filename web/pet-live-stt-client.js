(function initPetLiveSttClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FeMonsterPetLiveSttClient = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPetLiveSttClientModule() {
  'use strict';

  const FRAME_SAMPLES = 320;
  const FRAME_BYTES = FRAME_SAMPLES * 2;
  const DEFAULT_BATCH_FRAMES = 10;
  const DEFAULT_MAX_QUEUED_BATCHES = 4;

  function boundedIdentifier(value, label) {
    const text = String(value || '');
    if (!text || text.length > 160 || /[\u0000-\u001F\u007F]/.test(text)) {
      throw new TypeError(`${label} must contain 1 to 160 printable characters`);
    }
    return text;
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function pcm16Bytes(frame) {
    if (!(frame instanceof Float32Array) && !(frame instanceof Int16Array)) {
      throw new TypeError('live STT frames must be Float32Array or Int16Array');
    }
    if (frame.length !== FRAME_SAMPLES) throw new RangeError('live STT requires one 20 ms / 320-sample frame');
    const bytes = new Uint8Array(FRAME_BYTES);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < frame.length; index += 1) {
      const value = frame instanceof Int16Array
        ? frame[index]
        : Math.max(-1, Math.min(1, Number(frame[index]) || 0)) * (frame[index] < 0 ? 32768 : 32767);
      view.setInt16(index * 2, Math.max(-32768, Math.min(32767, Math.round(value))), true);
    }
    return bytes;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    }
    if (typeof btoa === 'function') return btoa(binary);
    if (typeof Buffer === 'function') return Buffer.from(bytes).toString('base64');
    throw new Error('base64 encoder is unavailable');
  }

  function normalizeResult(value) {
    const result = value?.liveStt && typeof value.liveStt === 'object'
      ? value.liveStt
      : value?.result && typeof value.result === 'object'
        ? value.result
        : value;
    return result && typeof result === 'object' ? result : {};
  }

  function createLiveSttClient(options = {}) {
    if (typeof options.request !== 'function') throw new TypeError('request(payload) is required');
    const sessionId = boundedIdentifier(options.sessionId, 'sessionId');
    const streamId = boundedIdentifier(options.streamId, 'streamId');
    const itemId = boundedIdentifier(options.itemId, 'itemId');
    const batchFrames = clampInteger(options.batchFrames, 1, 25, DEFAULT_BATCH_FRAMES);
    const maxQueuedBatches = clampInteger(options.maxQueuedBatches, 1, 8, DEFAULT_MAX_QUEUED_BATCHES);
    const onPartial = typeof options.onPartial === 'function' ? options.onPartial : () => {};
    const onEndpoint = typeof options.onEndpoint === 'function' ? options.onEndpoint : () => {};
    const onFailure = typeof options.onFailure === 'function' ? options.onFailure : () => {};
    const pendingFrames = [];
    let state = 'idle';
    let openPromise = null;
    let queueTail = Promise.resolve();
    let queuedBatches = 0;
    let nextSequence = 0;
    let acceptedFrames = 0;
    let revision = 0;
    let partial = '';
    let failed = false;
    let failure = '';
    let endpointNotified = false;

    const payload = (action, values = {}) => ({ action, sessionId, streamId, itemId, ...values });

    function snapshot() {
      return Object.freeze({
        sessionId,
        streamId,
        itemId,
        state,
        revision,
        partial,
        nextSequence,
        acceptedFrames,
        pendingFrames: pendingFrames.length,
        queuedBatches,
        failed,
        failure,
        batchFrames,
        maxQueuedBatches
      });
    }

    function markFailed(error) {
      if (failed || state === 'cancelled' || state === 'finalized') return;
      failed = true;
      state = 'fallback';
      failure = String(error?.message || error || 'live STT failed').slice(0, 300);
      pendingFrames.length = 0;
      try { onFailure(error instanceof Error ? error : new Error(failure), snapshot()); } catch (_) {}
    }

    function applyResult(value, { notifyPartial = true, notifyEndpoint = true } = {}) {
      const result = normalizeResult(value);
      if (Number.isSafeInteger(Number(result.revision))) revision = Math.max(revision, Number(result.revision));
      if (typeof result.partial === 'string') {
        partial = result.partial.slice(0, 2_000);
        if (notifyPartial && partial && result.changed !== false) {
          try { onPartial({ ...result, partial }, snapshot()); } catch (_) {}
        }
      }
      if (notifyEndpoint && result.endpoint === true && !endpointNotified && state !== 'finalized') {
        endpointNotified = true;
        try { onEndpoint({ ...result, partial }, snapshot()); } catch (_) {}
      }
      return result;
    }

    async function open() {
      if (state === 'open') return snapshot();
      if (openPromise) return openPromise;
      if (failed || state === 'cancelled' || state === 'finalized') return { ...snapshot(), fallback: failed };
      state = 'opening';
      openPromise = Promise.resolve()
        .then(() => options.request(payload('open')))
        .then((value) => {
          const result = applyResult(value);
          if (state === 'cancelled') return result;
          state = result.state === 'cancelled' ? 'cancelled' : 'open';
          return result;
        })
        .catch((error) => {
          markFailed(error);
          return { ...snapshot(), fallback: true };
        })
        .finally(() => { openPromise = null; });
      return openPromise;
    }

    function scheduleBatch(frames) {
      if (!frames.length || failed || state === 'cancelled' || state === 'finalized') return false;
      if (queuedBatches >= maxQueuedBatches) {
        markFailed(new Error('live STT upload queue limit reached'));
        return false;
      }
      const sequence = nextSequence;
      nextSequence += frames.length;
      const bytes = new Uint8Array(frames.length * FRAME_BYTES);
      frames.forEach((frameBytes, index) => bytes.set(frameBytes, index * FRAME_BYTES));
      queuedBatches += 1;
      queueTail = queueTail
        .then(async () => {
          if (failed || state === 'cancelled') return;
          const opened = await open();
          if (failed || opened?.fallback || state !== 'open') return;
          const result = applyResult(await options.request(payload('frames', {
            sequence,
            audioBase64: bytesToBase64(bytes)
          })));
          acceptedFrames = Math.max(acceptedFrames, sequence + frames.length);
          if (result.state === 'cancelled') state = 'cancelled';
        })
        .catch(markFailed)
        .finally(() => { queuedBatches = Math.max(0, queuedBatches - 1); });
      return true;
    }

    function flush() {
      if (!pendingFrames.length) return true;
      const frames = pendingFrames.splice(0, pendingFrames.length);
      return scheduleBatch(frames);
    }

    function pushFrame(frame) {
      if (failed || state === 'cancelled' || state === 'finalized') return false;
      let bytes;
      try {
        bytes = pcm16Bytes(frame);
      } catch (error) {
        markFailed(error);
        return false;
      }
      pendingFrames.push(bytes);
      return pendingFrames.length < batchFrames || flush();
    }

    async function finalize() {
      if (state === 'finalized') return { ...snapshot(), final: partial, duplicate: true };
      if (state === 'cancelled' || failed) return { ...snapshot(), fallback: failed };
      flush();
      await queueTail;
      if (failed || state === 'cancelled') return { ...snapshot(), fallback: failed };
      const opened = await open();
      if (failed || opened?.fallback || state !== 'open') return { ...snapshot(), fallback: true };
      try {
        const result = applyResult(await options.request(payload('finalize')), {
          notifyPartial: false,
          notifyEndpoint: false
        });
        state = result.state === 'cancelled' ? 'cancelled' : 'finalized';
        return result;
      } catch (error) {
        markFailed(error);
        return { ...snapshot(), fallback: true };
      }
    }

    async function cancel() {
      if (state === 'cancelled') return snapshot();
      pendingFrames.length = 0;
      const pendingOpen = openPromise;
      state = 'cancelled';
      if (pendingOpen) {
        try { await pendingOpen; } catch (_) {}
      }
      try {
        await options.request(payload('cancel'));
      } catch (_) {}
      return snapshot();
    }

    return Object.freeze({ open, pushFrame, flush, finalize, cancel, snapshot });
  }

  return Object.freeze({
    createLiveSttClient,
    constants: Object.freeze({
      sampleRate: 16_000,
      frameSamples: FRAME_SAMPLES,
      frameMs: 20,
      defaultBatchFrames: DEFAULT_BATCH_FRAMES,
      defaultMaxQueuedBatches: DEFAULT_MAX_QUEUED_BATCHES
    })
  });
});
