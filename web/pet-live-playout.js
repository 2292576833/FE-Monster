(function initializePetLivePlayout(globalObject, factory) {
  'use strict';

  const api = factory(globalObject);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.FeMonsterPetLivePlayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPetLivePlayoutModule(globalObject) {
  'use strict';

  const START_BUFFER_SECONDS = 0.12;
  const CROSSFADE_SECONDS = 0.015;
  const SCHEDULE_HORIZON_SECONDS = 1;
  const MISSING_SEQUENCE_WAIT_MS = 300;
  const SCHEDULER_INTERVAL_MS = 25;
  const CURSOR_INTERVAL_MS = 250;
  const MAX_QUEUED_SEGMENTS = 32;
  const MAX_PREDECODED_SEGMENTS = 2;
  const MAX_SCHEDULED_SOURCES = 12;

  const LIMITS = Object.freeze({
    maxQueuedSegments: MAX_QUEUED_SEGMENTS,
    maxPredecodedSegments: MAX_PREDECODED_SEGMENTS,
    maxScheduledSources: MAX_SCHEDULED_SOURCES,
    scheduleHorizonSeconds: SCHEDULE_HORIZON_SECONDS,
    startupBufferSeconds: START_BUFFER_SECONDS,
    crossfadeSeconds: CROSSFADE_SECONDS
  });

  const FADE_POINTS = 32;
  const FADE_IN = new Float32Array(FADE_POINTS);
  const FADE_OUT = new Float32Array(FADE_POINTS);
  for (let index = 0; index < FADE_POINTS; index += 1) {
    const angle = index / (FADE_POINTS - 1) * Math.PI / 2;
    FADE_IN[index] = Math.sin(angle);
    FADE_OUT[index] = Math.cos(angle);
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, finiteNumber(value)));
  }

  function sequenceOf(segment, fallback) {
    const value = Number(segment?.audioSequence);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  }

  function requestIdOf(segment) {
    return String(segment?.requestId || '').trim().slice(0, 160);
  }

  function makeError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  function isAbortError(error) {
    return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
  }

  async function responseToArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    if (typeof value?.arrayBuffer === 'function') return value.arrayBuffer();
    throw makeError('playout-audio-payload-invalid', 'fetchAudio did not return audio bytes');
  }

  function decodeAudioData(context, bytes) {
    const copy = bytes.slice(0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = (buffer) => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      try {
        const result = context.decodeAudioData(copy, succeed, fail);
        if (result && typeof result.then === 'function') result.then(succeed, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  function pauseBeforeSeconds(segment) {
    const explicitMs = Math.max(
      finiteNumber(segment?.semanticPauseMs),
      finiteNumber(segment?.pauseBeforeMs)
    );
    if (explicitMs > 0) return clamp(explicitMs / 1_000, 0, 3);
    return 0;
  }

  function preventsCrossfade(segment) {
    return segment?.semanticPause === true || pauseBeforeSeconds(segment) > 0;
  }

  function hasSemanticBoundary(previousSegment, nextSegment) {
    if (preventsCrossfade(nextSegment)) return true;
    if (previousSegment?.semanticPauseAfter === true) return true;
    if (finiteNumber(previousSegment?.pauseAfterMs) > 0) return true;
    if (
      previousSegment?.kind
      && nextSegment?.kind
      && String(previousSegment.kind) !== String(nextSegment.kind)
    ) return true;
    const previousText = String(previousSegment?.text || '').trim();
    return /[\u3002\uff01\uff1f!?\u2026\uff1b;\uff1a:]\s*$/u.test(previousText);
  }

  function defaultFetchAudio(segment, options) {
    const url = String(segment?.audioUrl || segment?.url || '').trim();
    if (!url || typeof globalObject?.fetch !== 'function') {
      throw makeError('playout-fetch-unavailable', 'No fetchAudio adapter or audio URL is available');
    }
    return globalObject.fetch(url, { signal: options?.signal });
  }

  function createLivePlayout(options = {}) {
    const context = options.audioContext || null;
    const fetchAudio = typeof options.fetchAudio === 'function'
      ? options.fetchAudio
      : defaultFetchAudio;
    const callbacks = {
      onStarted: typeof options.onStarted === 'function' ? options.onStarted : null,
      onEnded: typeof options.onEnded === 'function' ? options.onEnded : null,
      onError: typeof options.onError === 'function' ? options.onError : null,
      onCursor: typeof options.onCursor === 'function' ? options.onCursor : null
    };

    const contextSupported = Boolean(
      context
      && typeof context.decodeAudioData === 'function'
      && typeof context.createBufferSource === 'function'
    );
    const fallbackReason = contextSupported ? '' : 'audio-context-unavailable';
    const crossfadeEnabled = contextSupported && typeof context.createGain === 'function';
    const masterGain = crossfadeEnabled ? context.createGain() : null;
    if (masterGain) {
      masterGain.gain.value = 1;
      masterGain.connect(context.destination);
    }
    const records = new Map();
    const scheduled = new Set();
    const abortControllers = new Set();
    const metrics = {
      enqueued: 0,
      duplicates: 0,
      dropped: 0,
      fetched: 0,
      decoded: 0,
      scheduled: 0,
      started: 0,
      ended: 0,
      interrupted: 0,
      fetchFailures: 0,
      decodeFailures: 0,
      scheduleFailures: 0,
      missingSequenceSkips: 0,
      underruns: 0,
      cursorEvents: 0,
      fetchedBytes: 0,
      fetchMsTotal: 0,
      fetchMsMax: 0,
      decodeMsTotal: 0,
      decodeMsMax: 0,
      maxQueueDepth: 0,
      maxPredecodeDepth: 0,
      maxScheduledDepth: 0,
      maxScheduleHorizonSeconds: 0
    };

    let closed = false;
    let generation = 0;
    let expectedSequence = 0;
    let syntheticSequence = 0;
    let requestId = '';
    let finalSequence = null;
    let missingSequenceSince = 0;
    let lastScheduled = null;
    let firstScheduleAt = null;
    let lastCursor = null;
    let lastUnderrunKey = '';
    let resumePromise = null;
    let schedulerTimer = 0;
    let cursorTimer = 0;
    let unavailableReported = false;

    function invoke(name, ...args) {
      try {
        callbacks[name]?.(...args);
      } catch {
        // Observer failures must not stop the audio timeline.
      }
    }

    function reportError(error, detail = {}) {
      invoke('onError', error, detail);
    }

    function predecodeDepth() {
      let count = 0;
      for (const record of records.values()) {
        if (record.status === 'fetching' || record.status === 'decoding' || record.status === 'decoded') count += 1;
      }
      return count;
    }

    function queueDepth() {
      let count = 0;
      for (const record of records.values()) {
        if (record.status !== 'scheduled' && !record.finished) count += 1;
      }
      return count;
    }

    function updateDepthMetrics() {
      metrics.maxQueueDepth = Math.max(metrics.maxQueueDepth, queueDepth());
      metrics.maxPredecodeDepth = Math.max(metrics.maxPredecodeDepth, predecodeDepth());
      metrics.maxScheduledDepth = Math.max(metrics.maxScheduledDepth, scheduled.size);
    }

    function ensureContextRunning() {
      if (!contextSupported || context.state !== 'suspended' || typeof context.resume !== 'function') return;
      if (resumePromise) return;
      try {
        resumePromise = Promise.resolve(context.resume())
          .catch((cause) => reportError(
            makeError('playout-context-resume-failed', 'AudioContext could not resume', cause),
            { stage: 'resume' }
          ))
          .finally(() => { resumePromise = null; });
      } catch (cause) {
        resumePromise = null;
        reportError(
          makeError('playout-context-resume-failed', 'AudioContext could not resume', cause),
          { stage: 'resume' }
        );
      }
    }

    function recordDetail(record, reason) {
      const now = Math.max(0, finiteNumber(context?.currentTime));
      const playedSeconds = clamp(now - finiteNumber(record.startAt), 0, finiteNumber(record.duration));
      return {
        reason,
        audioSequence: record.sequence,
        scheduledAt: record.startAt,
        endAt: record.endAt,
        durationSeconds: record.duration,
        playedSeconds,
        playedSamples: Math.round(playedSeconds * finiteNumber(record.bufferSampleRate, context?.sampleRate || 48_000))
      };
    }

    function markStarted(record) {
      if (record.started || record.finished) return;
      record.started = true;
      metrics.started += 1;
      invoke('onStarted', record.segment, recordDetail(record, 'started'));
    }

    function disconnectRecord(record) {
      try { record.source?.disconnect?.(); } catch {}
      try { record.gain?.disconnect?.(); } catch {}
      record.source = null;
      record.gain = null;
      record.buffer = null;
    }

    function finishRecord(record, reason) {
      if (!record || record.finished) return;
      if (reason === 'ended') markStarted(record);
      record.finished = true;
      scheduled.delete(record);
      records.delete(record.sequence);
      if (reason === 'ended') metrics.ended += 1;
      if (reason === 'interrupted') metrics.interrupted += 1;
      const detail = recordDetail(record, reason);
      if (reason === 'ended') {
        const timelineSeconds = firstScheduleAt === null
          ? detail.playedSeconds
          : Math.max(0, record.endAt - firstScheduleAt);
        lastCursor = {
          requestId: requestIdOf(record.segment),
          audioSequence: record.sequence,
          playedSeconds: timelineSeconds,
          playedSamples: Math.round(timelineSeconds * finiteNumber(context?.sampleRate, 48_000)),
          segmentPlayedSeconds: record.duration,
          segmentPlayedSamples: Math.round(record.duration * finiteNumber(record.bufferSampleRate, context?.sampleRate || 48_000)),
          at: record.endAt,
          complete: true
        };
      }
      invoke('onEnded', record.segment, detail);
      disconnectRecord(record);
      updateDepthMetrics();
      queueMicrotask(pump);
    }

    function currentCursor() {
      if (!contextSupported) return lastCursor ? { ...lastCursor } : null;
      const now = Math.max(0, finiteNumber(context.currentTime));
      let active = null;
      for (const record of scheduled) {
        if (record.finished || now < record.startAt || now >= record.endAt) continue;
        if (!active || record.startAt >= active.startAt) active = record;
      }
      if (!active) return lastCursor ? { ...lastCursor } : null;
      markStarted(active);
      const segmentPlayedSeconds = clamp(now - active.startAt, 0, active.duration);
      const timelineSeconds = firstScheduleAt === null
        ? segmentPlayedSeconds
        : Math.max(0, now - firstScheduleAt);
      return {
        requestId: requestIdOf(active.segment),
        audioSequence: active.sequence,
        playedSeconds: timelineSeconds,
        playedSamples: Math.round(timelineSeconds * finiteNumber(context.sampleRate, 48_000)),
        segmentPlayedSeconds,
        segmentPlayedSamples: Math.round(segmentPlayedSeconds * finiteNumber(active.bufferSampleRate, context.sampleRate || 48_000)),
        at: now,
        complete: false
      };
    }

    function emitCursor() {
      const cursor = currentCursor();
      if (!cursor || cursor.complete) return;
      if (
        lastCursor
        && cursor.audioSequence === lastCursor.audioSequence
        && cursor.segmentPlayedSamples <= lastCursor.segmentPlayedSamples
      ) return;
      lastCursor = cursor;
      metrics.cursorEvents += 1;
      invoke('onCursor', { ...cursor });
    }

    function markUnderrun(reason) {
      if (!lastScheduled || lastScheduled.finished || finalSequence !== null && expectedSequence > finalSequence) return;
      const now = Math.max(0, finiteNumber(context?.currentTime));
      if (lastScheduled.endAt - now > 0.035) return;
      const key = `${generation}:${expectedSequence}:${reason}`;
      if (lastUnderrunKey === key) return;
      lastUnderrunKey = key;
      metrics.underruns += 1;
    }

    function failRecord(record, stage, cause) {
      if (!record || record.finished || record.generation !== generation) return;
      record.status = 'failed';
      record.errorStage = stage;
      if (stage === 'fetch') metrics.fetchFailures += 1;
      else if (stage === 'decode') metrics.decodeFailures += 1;
      else metrics.scheduleFailures += 1;
      const code = stage === 'fetch'
        ? 'playout-fetch-failed'
        : stage === 'decode'
          ? 'playout-decode-failed'
          : 'playout-schedule-failed';
      reportError(makeError(code, `Live playout ${stage} failed`, cause), {
        stage,
        audioSequence: record.sequence,
        requestId: requestIdOf(record.segment),
        segment: record.segment
      });
      queueMicrotask(pump);
    }

    async function predecode(record) {
      if (!record || record.status !== 'queued' || record.generation !== generation || closed) return;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      if (controller) abortControllers.add(controller);
      record.controller = controller;
      record.status = 'fetching';
      updateDepthMetrics();
      const fetchStartedAt = performance.now();
      try {
        const response = await fetchAudio(record.segment, { signal: controller?.signal });
        const bytes = await responseToArrayBuffer(response);
        if (record.generation !== generation || record.finished || closed) return;
        const fetchMs = performance.now() - fetchStartedAt;
        metrics.fetched += 1;
        metrics.fetchedBytes += bytes.byteLength;
        metrics.fetchMsTotal += fetchMs;
        metrics.fetchMsMax = Math.max(metrics.fetchMsMax, fetchMs);
        record.status = 'decoding';
        const decodeStartedAt = performance.now();
        const buffer = await decodeAudioData(context, bytes);
        if (record.generation !== generation || record.finished || closed) return;
        if (!buffer || !(finiteNumber(buffer.duration) > 0)) {
          throw makeError('playout-decoded-buffer-empty', 'Decoded audio buffer is empty');
        }
        const decodeMs = performance.now() - decodeStartedAt;
        metrics.decoded += 1;
        metrics.decodeMsTotal += decodeMs;
        metrics.decodeMsMax = Math.max(metrics.decodeMsMax, decodeMs);
        record.buffer = buffer;
        record.duration = finiteNumber(buffer.duration);
        record.bufferSampleRate = finiteNumber(buffer.sampleRate, context?.sampleRate || 48_000);
        record.status = 'decoded';
      } catch (cause) {
        if (record.generation !== generation || record.finished || closed || isAbortError(cause)) return;
        failRecord(record, record.status === 'decoding' ? 'decode' : 'fetch', cause);
      } finally {
        if (controller) abortControllers.delete(controller);
        record.controller = null;
        updateDepthMetrics();
        queueMicrotask(pump);
      }
    }

    function fillPredecodeWindow() {
      if (closed || !contextSupported) return;
      let available = MAX_PREDECODED_SEGMENTS - predecodeDepth();
      if (available <= 0) return;
      const candidates = [...records.values()]
        .filter((record) => record.status === 'queued' && record.generation === generation)
        .sort((left, right) => left.sequence - right.sequence);
      for (const record of candidates) {
        if (available <= 0) break;
        available -= 1;
        void predecode(record);
      }
    }

    function advancePastFailure() {
      let advanced = false;
      while (true) {
        const record = records.get(expectedSequence);
        if (!record || record.status !== 'failed') break;
        records.delete(expectedSequence);
        record.finished = true;
        disconnectRecord(record);
        expectedSequence += 1;
        advanced = true;
      }
      if (advanced) missingSequenceSince = 0;
      return advanced;
    }

    function skipMissingSequenceIfExpired() {
      if (records.has(expectedSequence)) {
        missingSequenceSince = 0;
        return false;
      }
      const futureSequences = [...records.keys()].filter((sequence) => sequence > expectedSequence);
      if (!futureSequences.length) {
        missingSequenceSince = 0;
        return false;
      }
      const now = performance.now();
      if (!missingSequenceSince) {
        missingSequenceSince = now;
        return false;
      }
      if (now - missingSequenceSince < MISSING_SEQUENCE_WAIT_MS) {
        markUnderrun('missing-sequence');
        return false;
      }
      const nextSequence = Math.min(...futureSequences);
      metrics.missingSequenceSkips += nextSequence - expectedSequence;
      expectedSequence = nextSequence;
      missingSequenceSince = 0;
      return true;
    }

    function scheduleGain(record, previous, overlapSeconds) {
      if (!crossfadeEnabled) return null;
      const gain = context.createGain();
      const parameter = gain.gain;
      const startAt = record.startAt;
      if (overlapSeconds > 0 && previous?.gain?.gain) {
        const overlapStart = startAt;
        try {
          previous.gain.gain.setValueCurveAtTime(FADE_OUT, overlapStart, overlapSeconds);
          parameter.setValueAtTime(0, overlapStart);
          parameter.setValueCurveAtTime(FADE_IN, overlapStart, overlapSeconds);
          parameter.setValueAtTime(1, overlapStart + overlapSeconds);
        } catch {
          parameter.value = 1;
        }
      } else {
        try { parameter.setValueAtTime(1, startAt); } catch { parameter.value = 1; }
      }
      return gain;
    }

    function scheduleRecord(record) {
      const now = Math.max(0, finiteNumber(context.currentTime));
      const previous = lastScheduled && !lastScheduled.finished ? lastScheduled : null;
      const pauseSeconds = pauseBeforeSeconds(record.segment);
      const mayCrossfade = Boolean(
        previous
        && crossfadeEnabled
        && !hasSemanticBoundary(previous.segment, record.segment)
        && previous.endAt - CROSSFADE_SECONDS > now + 0.006
      );
      const overlapSeconds = mayCrossfade ? Math.min(CROSSFADE_SECONDS, previous.duration / 4, record.duration / 4) : 0;
      const desiredStart = previous
        ? previous.endAt - overlapSeconds + pauseSeconds
        : now + START_BUFFER_SECONDS;
      if (previous && desiredStart - now > SCHEDULE_HORIZON_SECONDS) return false;
      if (scheduled.size >= MAX_SCHEDULED_SOURCES) return false;

      record.startAt = previous
        ? Math.max(desiredStart, now + 0.006)
        : Math.max(desiredStart, now + 0.006);
      if (previous && record.startAt > desiredStart + 0.03) markUnderrun('late-decode');
      record.endAt = record.startAt + record.duration;
      record.source = null;
      record.gain = null;
      try {
        const source = context.createBufferSource();
        source.buffer = record.buffer;
        const gain = scheduleGain(record, previous, overlapSeconds);
        if (gain) {
          source.connect(gain);
          gain.connect(masterGain || context.destination);
        } else {
          source.connect(masterGain || context.destination);
        }
        record.source = source;
        record.gain = gain;
        source.onended = () => finishRecord(record, 'ended');
        source.start(record.startAt);
      } catch (cause) {
        try { record.source?.disconnect?.(); } catch {}
        try { record.gain?.disconnect?.(); } catch {}
        record.source = null;
        record.gain = null;
        failRecord(record, 'schedule', cause);
        return false;
      }

      if (firstScheduleAt === null) firstScheduleAt = record.startAt;
      record.status = 'scheduled';
      record.overlapSeconds = overlapSeconds;
      scheduled.add(record);
      lastScheduled = record;
      expectedSequence += 1;
      missingSequenceSince = 0;
      metrics.scheduled += 1;
      const horizon = Math.max(0, record.startAt - now);
      metrics.maxScheduleHorizonSeconds = Math.max(metrics.maxScheduleHorizonSeconds, horizon);
      updateDepthMetrics();
      return true;
    }

    function pump() {
      if (closed || !contextSupported) return;
      ensureContextRunning();
      advancePastFailure();
      if (skipMissingSequenceIfExpired()) advancePastFailure();
      fillPredecodeWindow();

      let guard = MAX_SCHEDULED_SOURCES + 2;
      while (guard > 0) {
        guard -= 1;
        if (advancePastFailure()) {
          fillPredecodeWindow();
          continue;
        }
        if (skipMissingSequenceIfExpired()) {
          fillPredecodeWindow();
          continue;
        }
        const record = records.get(expectedSequence);
        if (!record || record.status !== 'decoded') {
          if (record || [...records.keys()].some((sequence) => sequence > expectedSequence)) {
            markUnderrun(record ? record.status : 'missing-sequence');
          }
          break;
        }
        if (!scheduleRecord(record)) break;
        fillPredecodeWindow();
      }

      const now = Math.max(0, finiteNumber(context.currentTime));
      for (const record of scheduled) {
        if (!record.started && !record.finished && now >= record.startAt) markStarted(record);
      }
    }

    function resetTimelineState() {
      expectedSequence = 0;
      syntheticSequence = 0;
      requestId = '';
      finalSequence = null;
      missingSequenceSince = 0;
      lastScheduled = null;
      firstScheduleAt = null;
      lastCursor = null;
      lastUnderrunKey = '';
    }

    function interrupt(reason = 'interrupted') {
      const cursor = currentCursor();
      generation += 1;
      for (const controller of abortControllers) {
        try { controller.abort(reason); } catch {}
      }
      abortControllers.clear();
      const activeRecords = [...records.values()];
      for (const record of activeRecords) {
        record.generation = generation - 1;
        if (record.status === 'scheduled') {
          if (!record.started && finiteNumber(context?.currentTime) >= record.startAt) markStarted(record);
          if (record.source) {
            record.source.onended = null;
            try { record.source.stop(Math.max(0, finiteNumber(context?.currentTime))); } catch {}
          }
          finishRecord(record, reason === 'closed' ? 'closed' : 'interrupted');
        } else {
          record.finished = true;
          disconnectRecord(record);
          records.delete(record.sequence);
        }
      }
      records.clear();
      scheduled.clear();
      resetTimelineState();
      return cursor;
    }

    function enqueue(segment) {
      if (closed) return false;
      if (!contextSupported) {
        if (!unavailableReported) {
          unavailableReported = true;
          reportError(
            makeError(fallbackReason, 'Web Audio playout is unavailable; use the legacy audio element fallback'),
            { stage: 'capability', fallbackReason }
          );
        }
        return false;
      }
      if (!segment || typeof segment !== 'object') {
        reportError(makeError('playout-segment-invalid', 'Live playout segment must be an object'), { stage: 'enqueue' });
        return false;
      }
      const incomingRequestId = requestIdOf(segment);
      if (requestId && incomingRequestId && requestId !== incomingRequestId) interrupt('superseded');
      if (!requestId && incomingRequestId) requestId = incomingRequestId;

      const sequence = sequenceOf(segment, syntheticSequence);
      syntheticSequence = Math.max(syntheticSequence, sequence + 1);
      if (records.has(sequence) || sequence < expectedSequence) {
        metrics.duplicates += 1;
        return false;
      }
      if (records.size >= MAX_QUEUED_SEGMENTS) {
        metrics.dropped += 1;
        reportError(makeError('playout-queue-full', 'Live playout queue reached its safe bound'), {
          stage: 'enqueue',
          audioSequence: sequence,
          requestId: incomingRequestId,
          limit: MAX_QUEUED_SEGMENTS
        });
        return false;
      }

      const immutableSegment = Object.freeze({ ...segment, audioSequence: sequence });
      const record = {
        segment: immutableSegment,
        sequence,
        generation,
        status: 'queued',
        controller: null,
        buffer: null,
        bufferSampleRate: finiteNumber(context.sampleRate, 48_000),
        duration: 0,
        source: null,
        gain: null,
        startAt: 0,
        endAt: 0,
        started: false,
        finished: false
      };
      records.set(sequence, record);
      if (segment.final === true) finalSequence = sequence;
      metrics.enqueued += 1;
      updateDepthMetrics();
      fillPredecodeWindow();
      queueMicrotask(pump);
      return true;
    }

    function snapshot() {
      const cursor = currentCursor();
      let fetchingDepth = 0;
      let decodedDepth = 0;
      for (const record of records.values()) {
        if (record.status === 'fetching' || record.status === 'decoding') fetchingDepth += 1;
        if (record.status === 'decoded') decodedDepth += 1;
      }
      const now = Math.max(0, finiteNumber(context?.currentTime));
      const nextScheduledAt = [...scheduled]
        .filter((record) => !record.finished && record.startAt > now)
        .reduce((minimum, record) => Math.min(minimum, record.startAt), Number.POSITIVE_INFINITY);
      return {
        supported: contextSupported,
        fallbackReason,
        crossfadeEnabled,
        closed,
        requestId,
        expectedSequence,
        finalSequence,
        playingSequence: cursor && !cursor.complete ? cursor.audioSequence : null,
        queueDepth: queueDepth(),
        fetchingDepth,
        decodedDepth,
        scheduledDepth: scheduled.size,
        scheduleHorizonSeconds: Number.isFinite(nextScheduledAt)
          ? Math.max(0, nextScheduledAt - now)
          : 0,
        cursor: cursor ? { ...cursor } : null,
        limits: { ...LIMITS },
        metrics: { ...metrics }
      };
    }

    function setVolume(value, rampMs = 0) {
      if (!masterGain?.gain) return false;
      const target = clamp(value, 0, 1);
      const now = Math.max(0, finiteNumber(context?.currentTime));
      const duration = clamp(rampMs, 0, 1_000) / 1_000;
      try {
        masterGain.gain.cancelScheduledValues?.(now);
        masterGain.gain.setValueAtTime?.(finiteNumber(masterGain.gain.value, 1), now);
        if (duration > 0 && typeof masterGain.gain.linearRampToValueAtTime === 'function') {
          masterGain.gain.linearRampToValueAtTime(target, now + duration);
        } else {
          masterGain.gain.setValueAtTime?.(target, now);
          masterGain.gain.value = target;
        }
        return true;
      } catch {
        masterGain.gain.value = target;
        return true;
      }
    }

    function close() {
      if (closed) return;
      interrupt('closed');
      closed = true;
      if (schedulerTimer) clearInterval(schedulerTimer);
      if (cursorTimer) clearInterval(cursorTimer);
      schedulerTimer = 0;
      cursorTimer = 0;
      try { masterGain?.disconnect?.(); } catch {}
    }

    if (contextSupported) {
      schedulerTimer = setInterval(pump, SCHEDULER_INTERVAL_MS);
      cursorTimer = setInterval(emitCursor, CURSOR_INTERVAL_MS);
    }

    return Object.freeze({ enqueue, interrupt, setVolume, snapshot, close });
  }

  return Object.freeze({ createLivePlayout, LIMITS });
});
