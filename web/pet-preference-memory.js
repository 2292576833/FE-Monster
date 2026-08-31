(function initializePetPreferenceMemory(global) {
  'use strict';

  if (global.FeMonsterPetPreferenceMemory) return;

  const SOURCE = 'pet-preference-learning';
  const PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$/;
  const CATEGORY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
  const MAX_QUERY = 100;
  const MAX_RECALL = 24;

  function boundedText(value, maximum) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, maximum);
  }

  function providerId(value) {
    const provider = boundedText(value || 'netease', 40).toLowerCase();
    return PROVIDER_PATTERN.test(provider) ? provider : 'netease';
  }

  function exactTime(value, clock) {
    const parsed = new Date(String(value ?? '')).getTime();
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    const now = typeof clock === 'function' ? clock() : new Date().toISOString();
    const fallback = new Date(String(now ?? '')).getTime();
    return Number.isFinite(fallback) ? new Date(fallback).toISOString() : new Date().toISOString();
  }

  function boundedLimit(value, fallback, maximum) {
    const parsed = Number(value);
    const limit = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
    return Math.max(0, Math.min(maximum, limit));
  }

  function durableError(code) {
    const error = new Error('The encrypted local-memory vault did not accept this preference event.');
    error.code = boundedText(code || 'LOCAL_MEMORY_EVENT_REJECTED', 80) || 'LOCAL_MEMORY_EVENT_REJECTED';
    return error;
  }

  function preferenceTitle(preference) {
    return boundedText(`用户偏好·${preference?.category || 'general'}`, 160);
  }

  function frozenProjection(available, provider, preferences) {
    return Object.freeze({
      available: Boolean(available),
      provider,
      preferences: Object.freeze((Array.isArray(preferences) ? preferences : []).slice(0, MAX_QUERY))
    });
  }

  function create(options = {}) {
    const memoryClient = options.memoryClient || global.FeLocalMemory;
    const policy = options.policy || global.FeMonsterPetPreferencePolicy;
    const clock = typeof options.clock === 'function' ? options.clock : () => new Date().toISOString();
    const states = new Map();

    if (!policy || policy.version !== 2 || typeof policy.reduce !== 'function'
      || typeof policy.normalizeRecord !== 'function' || typeof policy.serialize !== 'function') {
      throw new Error('FeMonsterPetPreferencePolicy v2 is required before creating preference memory.');
    }

    function stateFor(provider) {
      if (!states.has(provider)) {
        states.set(provider, {
          records: [],
          active: Object.freeze([]),
          loaded: false,
          loading: null,
          queue: Promise.resolve(),
          available: Boolean(memoryClient && typeof memoryClient.context === 'function'),
          nextSequence: 1
        });
      }
      return states.get(provider);
    }

    function rebuild(state, now) {
      state.active = policy.reduce(state.records, { now: exactTime(now, clock) });
      return state.active;
    }

    async function hydrate(provider) {
      const state = stateFor(provider);
      if (state.loaded) return state;
      if (state.loading) return state.loading;
      if (!memoryClient || typeof memoryClient.context !== 'function') {
        state.available = false;
        state.loaded = true;
        return state;
      }
      state.loading = (async () => {
        const recalled = await memoryClient.context({ provider, limit: MAX_QUERY, types: ['user.fact'] });
        state.available = recalled?.available !== false;
        const newest = (Array.isArray(recalled?.knowledge) ? recalled.knowledge : [])
          .filter((record) => record?.type === 'user.fact')
          .slice()
          .sort((left, right) => Date.parse(right?.recordedAt || right?.occurredAt || 0)
            - Date.parse(left?.recordedAt || left?.occurredAt || 0))
          .slice(0, MAX_QUERY);
        state.records = newest.map((record) => Object.freeze(record));
        state.nextSequence = newest.reduce((maximum, record) => (
          Math.max(maximum, Number.isFinite(Number(record?.sourceSequence)) ? Number(record.sourceSequence) + 1 : maximum)
        ), 1);
        rebuild(state, clock());
        state.loaded = true;
        return state;
      })();
      try {
        return await state.loading;
      } finally {
        state.loading = null;
      }
    }

    function enqueue(provider, operation) {
      const state = stateFor(provider);
      const next = state.queue.then(operation, operation);
      state.queue = next.catch(() => {});
      return next;
    }

    async function persist(provider, preference) {
      const state = await hydrate(provider);
      if (!state.available || !memoryClient || typeof memoryClient.append !== 'function') {
        throw durableError('LOCAL_MEMORY_UNAVAILABLE');
      }
      const value = policy.serialize(preference);
      if (!value) throw durableError('PREFERENCE_REJECTED');
      const previous = state.active.find((item) => item.entityId === preference.entityId);
      if (previous && policy.serialize(previous) === value) {
        return Object.freeze({ changed: false, deduplicated: true });
      }
      const handle = memoryClient.append({
        provider,
        stream: 'knowledge',
        type: 'user.fact',
        occurredAt: preference.updatedAt,
        payload: {
          source: SOURCE,
          entityId: preference.entityId,
          title: preferenceTitle(preference),
          value,
          timeAccuracy: 'exact'
        }
      });
      if (handle?.suppressed === true) return Object.freeze({ changed: false, suppressed: true });
      if (handle?.accepted !== true) throw durableError(handle?.code || 'LOCAL_MEMORY_EVENT_REJECTED');
      const receipt = await Promise.resolve(handle?.receipt);
      if (receipt?.accepted === false || receipt?.suppressed === true || !receipt?.recordedAt) {
        throw durableError(receipt?.code || 'LOCAL_MEMORY_RECEIPT_REJECTED');
      }
      const sourceSequence = Number.isFinite(Number(receipt?.sourceSequence))
        ? Number(receipt.sourceSequence) : state.nextSequence++;
      state.records.unshift(Object.freeze({
        eventId: boundedText(handle.eventId, 120),
        stream: 'knowledge',
        type: 'user.fact',
        occurredAt: preference.updatedAt,
        recordedAt: exactTime(receipt.recordedAt, clock),
        sourceSequence,
        payload: Object.freeze({
          source: SOURCE,
          entityId: preference.entityId,
          title: preferenceTitle(preference),
          value
        })
      }));
      rebuild(state, preference.updatedAt);
      return Object.freeze({ changed: true, eventId: boundedText(handle.eventId, 120), recordedAt: exactTime(receipt.recordedAt, clock) });
    }

    async function persistSignals(provider, signals) {
      let written = 0;
      let deduplicated = 0;
      let suppressed = 0;
      for (const preference of signals.slice(0, 8)) {
        const result = await persist(provider, preference);
        if (result.changed) written += 1;
        if (result.deduplicated) deduplicated += 1;
        if (result.suppressed) suppressed += 1;
      }
      return Object.freeze({ written, deduplicated, suppressed, facts: signals.length });
    }

    function observeChat(input = {}) {
      const provider = providerId(input.provider);
      if (input.role && input.role !== 'user') return Promise.resolve(Object.freeze({ written: 0, deduplicated: 0, suppressed: 0, facts: 0 }));
      const extracted = policy.extractChatSignals({ ...input, occurredAt: exactTime(input.occurredAt, clock) });
      const signals = Array.isArray(extracted?.signals) ? extracted.signals : [];
      if (!signals.length) return Promise.resolve(Object.freeze({ written: 0, deduplicated: 0, suppressed: 0, facts: 0 }));
      return enqueue(provider, () => persistSignals(provider, signals));
    }

    function observePlaybackSummary(input = {}) {
      const provider = providerId(input.provider);
      const extracted = policy.behaviorSignals({ ...input, occurredAt: exactTime(input.occurredAt, clock) });
      const signals = Array.isArray(extracted?.signals) ? extracted.signals : [];
      if (!signals.length) return Promise.resolve(Object.freeze({ written: 0, deduplicated: 0, suppressed: 0, facts: 0 }));
      return enqueue(provider, () => persistSignals(provider, signals));
    }

    function correctionPreference(input) {
      const category = boundedText(input?.category, 48).toLowerCase();
      const subject = boundedText(input?.subject, 72);
      const entityId = boundedText(input?.entityId, 120) || policy.entityId(category, subject);
      if (!CATEGORY_PATTERN.test(category) || !subject || !entityId) return null;
      return Object.freeze({
        schemaVersion: 2,
        kind: 'preference',
        entityId,
        category,
        subject,
        polarity: input?.polarity === 'dislike' ? 'dislike' : 'like',
        statement: boundedText(input?.statement, 220),
        origin: 'explicit-chat',
        confidence: 1,
        evidence: 1,
        status: 'active',
        updatedAt: exactTime(input?.occurredAt || input?.updatedAt, clock)
      });
    }

    function correct(input = {}) {
      const provider = providerId(input.provider);
      const preference = correctionPreference(input);
      if (!preference) return Promise.reject(durableError('PREFERENCE_REJECTED'));
      return enqueue(provider, () => persist(provider, preference));
    }

    function forget(input = {}) {
      const provider = providerId(input.provider);
      const entityIds = Array.from(new Set((Array.isArray(input.entityIds) ? input.entityIds : [])
        .map((item) => boundedText(item, 120)).filter(Boolean))).slice(0, MAX_QUERY);
      return enqueue(provider, async () => {
        const state = await hydrate(provider);
        let changed = 0;
        let deduplicated = 0;
        let suppressed = 0;
        for (const entityId of entityIds) {
          const previous = state.active.find((item) => item.entityId === entityId);
          if (!previous) continue;
          const retraction = Object.freeze({
            ...previous,
            status: 'retracted',
            statement: boundedText(`用户撤回偏好：${previous.subject}`, 220),
            updatedAt: exactTime(input.occurredAt || input.updatedAt, clock)
          });
          const result = await persist(provider, retraction);
          if (result.changed) changed += 1;
          if (result.deduplicated) deduplicated += 1;
          if (result.suppressed) suppressed += 1;
        }
        return Object.freeze({ changed, deduplicated, suppressed });
      });
    }

    async function query(input = {}) {
      const provider = providerId(input.provider);
      const state = await hydrate(provider);
      rebuild(state, input.now || clock());
      return frozenProjection(state.available, provider, state.active);
    }

    async function recall(input = {}) {
      const provider = providerId(input.provider);
      const state = await hydrate(provider);
      rebuild(state, input.now || clock());
      const limit = boundedLimit(input.limit, MAX_RECALL, MAX_RECALL);
      const message = boundedText(input.message || input.query || input.text, 2_000);
      return frozenProjection(state.available, provider, policy.rank(state.active, message, limit));
    }

    return Object.freeze({ observeChat, observePlaybackSummary, query, correct, forget, recall });
  }

  const runtime = create();
  global.FeMonsterPetPreferenceMemory = Object.freeze({
    version: 2,
    create,
    observeChat: runtime.observeChat,
    observePlaybackSummary: runtime.observePlaybackSummary,
    query: runtime.query,
    correct: runtime.correct,
    forget: runtime.forget,
    recall: runtime.recall
  });
})(window);
