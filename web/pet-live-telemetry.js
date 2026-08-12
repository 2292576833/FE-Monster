(function initializePetLiveTelemetry(globalObject, factory) {
  'use strict';

  const api = factory(globalObject);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.FeMonsterPetLiveTelemetry = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPetLiveTelemetryModule(globalObject) {
  'use strict';

  const STAGES = Object.freeze([
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
  ]);

  const STAGE_SET = new Set(STAGES);
  const STAGE_ORDER = new Map(STAGES.map((stage, index) => [stage, index]));
  const MAX_EVENTS = 256;
  const MAX_DURATION_SAMPLES = 256;
  const MAX_PAYLOAD_BYTES = 64 * 1024;
  const MAX_PROVIDER_LABELS = 12;

  function defaultClock() {
    if (globalObject?.performance && typeof globalObject.performance.now === 'function') {
      return globalObject.performance.now();
    }
    return Date.now();
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampInteger(value, minimum, maximum) {
    const integer = Math.trunc(finiteNumber(value, minimum));
    return Math.max(minimum, Math.min(maximum, integer));
  }

  function roundMs(value) {
    return Math.round(Math.max(0, finiteNumber(value)) * 1_000) / 1_000;
  }

  function utf8ByteLength(value) {
    const text = String(value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;

    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function normalizeOpaqueId(value) {
    return String(value || '')
      .trim()
      .replace(/[^A-Za-z0-9._:-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 64);
  }

  function providerCandidate(value) {
    return String(value || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 32) || 'unknown';
  }

  function percentile(sortedValues, fraction) {
    if (sortedValues.length === 0) return null;
    const index = Math.max(0, Math.ceil(sortedValues.length * fraction) - 1);
    return roundMs(sortedValues[Math.min(index, sortedValues.length - 1)]);
  }

  function createSessionTelemetry(options = {}) {
    const rawClock = typeof options.clock === 'function' ? options.clock : defaultClock;
    const maxEvents = clampInteger(options.maxEvents ?? MAX_EVENTS, 1, MAX_EVENTS);
    const events = [];
    const durationSamples = [];
    const providerLabels = new Set();
    let droppedEvents = 0;
    let originMs = finiteNumber(rawClock(), 0);
    let lastClockMs = originMs;

    function monotonicClock() {
      const candidate = finiteNumber(rawClock(), lastClockMs);
      lastClockMs = Math.max(lastClockMs, candidate);
      return lastClockMs;
    }

    function relativeNow() {
      return roundMs(monotonicClock() - originMs);
    }

    function normalizeProvider(value) {
      const candidate = providerCandidate(value);
      if (providerLabels.has(candidate)) return candidate;
      if (providerLabels.size < MAX_PROVIDER_LABELS) {
        providerLabels.add(candidate);
        return candidate;
      }
      providerLabels.add('other');
      return 'other';
    }

    function mark(stage, fields = {}) {
      const normalizedStage = String(stage || '').trim();
      if (!STAGE_SET.has(normalizedStage)) {
        throw new RangeError(`Unknown telemetry stage: ${normalizedStage || '(empty)'}`);
      }

      const event = {
        stage: normalizedStage,
        atMs: relativeNow()
      };
      const requestId = normalizeOpaqueId(fields.requestId);
      const provider = normalizeProvider(fields.provider);
      if (requestId) event.requestId = requestId;
      if (provider !== 'unknown' || fields.provider != null) event.provider = provider;
      if (fields.segmentSeq != null) {
        event.segmentSeq = clampInteger(fields.segmentSeq, 0, Number.MAX_SAFE_INTEGER);
      }
      if (fields.queueDepth != null) {
        event.queueDepth = clampInteger(fields.queueDepth, 0, 1_000_000);
      }
      if (fields.bytes != null) {
        event.bytes = clampInteger(fields.bytes, 0, Number.MAX_SAFE_INTEGER);
      }

      const immutableEvent = Object.freeze(event);
      events.push(immutableEvent);
      if (events.length > maxEvents) {
        events.shift();
        droppedEvents += 1;
      }
      return immutableEvent;
    }

    function latestEvent(stage, beforeEvent) {
      const latestAtMs = beforeEvent?.atMs ?? Number.POSITIVE_INFINITY;
      const targetRequestId = beforeEvent?.requestId || '';
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.stage !== stage || event.atMs > latestAtMs) continue;
        if (targetRequestId && event.requestId && event.requestId !== targetRequestId) continue;
        return event;
      }
      return null;
    }

    function resolveEvent(reference, beforeEvent) {
      if (typeof reference === 'string') return latestEvent(reference, beforeEvent);
      if (reference && typeof reference === 'object' && Number.isFinite(Number(reference.atMs))) {
        return reference;
      }
      if (Number.isFinite(Number(reference))) return { atMs: Number(reference) };
      return null;
    }

    function duration(from, to) {
      const toEvent = resolveEvent(to);
      const fromEvent = resolveEvent(from, toEvent);
      if (!fromEvent || !toEvent) return null;

      const elapsedMs = roundMs(Math.max(0, Number(toEvent.atMs) - Number(fromEvent.atMs)));
      if (STAGE_SET.has(toEvent.stage)) {
        durationSamples.push(Object.freeze({
          stage: toEvent.stage,
          provider: normalizeProvider(toEvent.provider),
          elapsedMs
        }));
        if (durationSamples.length > MAX_DURATION_SAMPLES) durationSamples.shift();
      }
      return elapsedMs;
    }

    function aggregateMetrics() {
      const groups = new Map();
      for (const sample of durationSamples) {
        const key = `${sample.stage}\u0000${sample.provider}`;
        let group = groups.get(key);
        if (!group) {
          group = { stage: sample.stage, provider: sample.provider, values: [] };
          groups.set(key, group);
        }
        group.values.push(sample.elapsedMs);
      }

      return [...groups.values()]
        .sort((left, right) => (
          (STAGE_ORDER.get(left.stage) - STAGE_ORDER.get(right.stage))
          || left.provider.localeCompare(right.provider)
        ))
        .map((group) => {
          const values = group.values.slice().sort((left, right) => left - right);
          return {
            stage: group.stage,
            provider: group.provider,
            count: values.length,
            p50Ms: percentile(values, 0.50),
            p95Ms: percentile(values, 0.95),
            p99Ms: percentile(values, 0.99)
          };
        });
    }

    function buildPayload() {
      const payload = {
        version: 1,
        generatedAtMs: relativeNow(),
        eventCount: events.length,
        droppedEvents,
        payloadTrimmedEvents: 0,
        events: events.map((event) => ({ ...event })),
        metrics: aggregateMetrics()
      };

      while (
        payload.events.length > 0
        && utf8ByteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES
      ) {
        payload.events.shift();
        payload.payloadTrimmedEvents += 1;
      }
      payload.eventCount = payload.events.length;

      while (
        payload.metrics.length > 0
        && utf8ByteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES
      ) {
        payload.metrics.pop();
      }
      return payload;
    }

    function snapshot() {
      return buildPayload();
    }

    function flushPayload() {
      const payload = buildPayload();
      events.length = 0;
      durationSamples.length = 0;
      providerLabels.clear();
      droppedEvents = 0;
      return payload;
    }

    return Object.freeze({
      mark,
      duration,
      snapshot,
      flushPayload
    });
  }

  return Object.freeze({
    STAGES,
    LIMITS: Object.freeze({
      maxEvents: MAX_EVENTS,
      maxDurationSamples: MAX_DURATION_SAMPLES,
      maxPayloadBytes: MAX_PAYLOAD_BYTES,
      maxProviderLabels: MAX_PROVIDER_LABELS
    }),
    createSessionTelemetry
  });
});
