(function initializePetPreferenceMemory(global) {
  'use strict';

  if (global.FeMonsterPetPreferenceMemory) return;

  const SOURCE = 'pet-preference-learning';
  const PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$/;
  const CATEGORY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
  const MAX_QUERY = 100;
  const MAX_HYDRATE_RECORDS = 100;
  const MAX_CACHED_RECORDS = 96;
  const MAX_AUTHORITY_CACHE = MAX_CACHED_RECORDS;
  const MAX_PROVIDER_STATES = 8;
  const MAX_RECALL = 24;
  const MIN_BEHAVIOR_OBSERVATIONS = 3;
  const MIN_BEHAVIOR_CONFIDENCE = 0.6;
  const FIBONACCI_EVIDENCE = Object.freeze([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1_597, 2_584, 4_181, 6_765, 10_946, 17_711, 28_657, 46_368, 75_025]);
  const UNSAFE_BEHAVIOR_TEXT = /(?:https?:\/\/|www\.|[\\/]|api[\s_-]*key|password|token|secret|authorization|cookie|session(?:[_ -]?id)?)/iu;

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

  function behaviorText(value, maximum = 72) {
    const text = boundedText(value, maximum);
    return text && !UNSAFE_BEHAVIOR_TEXT.test(text) ? text : '';
  }

  function observationCount(value) {
    return Math.max(0, Math.min(100_000, Math.floor(Number(value) || 0)));
  }

  function confidenceTenth(value) {
    return Math.max(0, Math.min(10, Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 10)));
  }

  function fibonacciBucket(value) {
    const evidence = observationCount(value);
    let bucket = 0;
    for (const candidate of FIBONACCI_EVIDENCE) {
      if (candidate > evidence) break;
      bucket = candidate;
    }
    return bucket;
  }

  function behaviorUnchanged(previous, preference) {
    if (!previous) return false;
    return previous.category === preference.category
      && previous.subject === preference.subject
      && previous.polarity === preference.polarity
      && previous.statement === preference.statement
      && previous.origin === preference.origin
      && previous.status === preference.status
      && fibonacciBucket(previous.evidence) === fibonacciBucket(preference.evidence)
      && confidenceTenth(previous.confidence) === confidenceTenth(preference.confidence);
  }

  function compactPreferenceRecords(records, policy) {
    const ordered = (Array.isArray(records) ? records : [])
      .map((record, index) => {
        const value = policy.normalizeRecord(record);
        const recordedAt = Date.parse(record?.recordedAt || record?.occurredAt || value?.updatedAt || '');
        const sourceSequence = Number(record?.sourceSequence ?? record?.payload?.sourceSequence);
        return { record, value, index, recordedAt: Number.isFinite(recordedAt) ? recordedAt : 0, sourceSequence: Number.isFinite(sourceSequence) ? sourceSequence : 0 };
      })
      .filter((item) => item.value)
      .sort((left, right) => right.recordedAt - left.recordedAt || right.sourceSequence - left.sourceSequence || right.index - left.index);
    const authorities = new Map();
    const behaviors = new Map();
    ordered.forEach((item) => {
      if (item.value.origin === 'explicit-chat') {
        if (!authorities.has(item.value.entityId)) authorities.set(item.value.entityId, item);
      } else if (!behaviors.has(item.value.entityId)) {
        behaviors.set(item.value.entityId, item);
      }
    });
    const sortRecent = (left, right) => right.recordedAt - left.recordedAt || right.sourceSequence - left.sourceSequence || right.index - left.index;
    const protectedAuthorities = Array.from(authorities.values()).sort(sortRecent);
    const selected = [
      ...protectedAuthorities,
      ...Array.from(behaviors.entries())
        .filter(([entityId]) => !authorities.has(entityId))
        .map(([, item]) => item)
        .sort(sortRecent)
    ]
      .slice(0, MAX_CACHED_RECORDS)
      .map((item) => Object.freeze(item.record));
    return selected;
  }

  function recordRecency(record, index = 0) {
    const normalized = record && typeof record === 'object' ? record : {};
    const recordedAt = Date.parse(normalized.recordedAt || normalized.occurredAt || '');
    const sourceSequence = Number(normalized.sourceSequence ?? normalized.payload?.sourceSequence);
    return {
      recordedAt: Number.isFinite(recordedAt) ? recordedAt : 0,
      sourceSequence: Number.isFinite(sourceSequence) ? sourceSequence : 0,
      index
    };
  }

  function newerRecord(left, right) {
    if (!right) return true;
    const leftOrder = recordRecency(left.record, left.index);
    const rightOrder = recordRecency(right.record, right.index);
    return leftOrder.recordedAt > rightOrder.recordedAt
      || (leftOrder.recordedAt === rightOrder.recordedAt && leftOrder.sourceSequence > rightOrder.sourceSequence)
      || (leftOrder.recordedAt === rightOrder.recordedAt
        && leftOrder.sourceSequence === rightOrder.sourceSequence
        && leftOrder.index > rightOrder.index);
  }

  function explicitAuthorityRecord(records, entityId, policy) {
    let selected = null;
    (Array.isArray(records) ? records : []).forEach((record, index) => {
      const value = policy.normalizeRecord(record);
      if (value?.entityId !== entityId || value.origin !== 'explicit-chat') return;
      const candidate = { record, index };
      if (newerRecord(candidate, selected)) selected = candidate;
    });
    return selected?.record || null;
  }

  function contextualBehaviorSignals(input, currentSignals, policy, rotation = 0) {
    const summary = input?.summary && typeof input.summary === 'object' ? input.summary : input;
    const occurredAt = exactTime(input?.occurredAt || input?.updatedAt, input?.clock);
    const signals = [];
    (Array.isArray(currentSignals) ? currentSignals : []).slice(0, 4).forEach((signal) => {
      if (signal?.entityId && !signals.some((item) => item.entityId === signal.entityId)) signals.push(signal);
    });
    const add = (candidate) => {
      const cleanSubject = behaviorText(candidate?.subject);
      const count = observationCount(candidate?.evidence);
      const score = Math.max(0, Math.min(1, Number(candidate?.confidence) || 0));
      if (!cleanSubject || count < MIN_BEHAVIOR_OBSERVATIONS || score < MIN_BEHAVIOR_CONFIDENCE || signals.length >= 8) return false;
      const entityId = typeof policy.entityId === 'function' ? policy.entityId(candidate.category, cleanSubject) : '';
      if (!entityId || signals.some((item) => item?.entityId === entityId)) return false;
      signals.push(Object.freeze({
        schemaVersion: 2,
        kind: 'preference',
        entityId,
        category: candidate.category,
        subject: cleanSubject,
        polarity: 'like',
        statement: boundedText(candidate.statement, 220),
        origin: 'behavior',
        confidence: Math.round(score * 1000) / 1000,
        evidence: count,
        status: 'active',
        updatedAt: occurredAt
      }));
      return true;
    };
    const bucketCandidates = (values, labels, category, statement) => {
      if (!values || typeof values !== 'object' || Array.isArray(values)) return [];
      return Object.entries(values).slice(0, 8).map(([bucket, value]) => {
        const subject = labels[bucket] || '';
        const evidence = observationCount(value);
        return {
          category,
          subject,
          statement: statement(subject),
          evidence,
          confidence: Math.min(1, (Math.min(evidence, 6) / 6) * 0.7 + 0.3)
        };
      });
    };
    const groups = [
      (Array.isArray(summary?.topGenres) ? summary.topGenres : []).slice(0, 6).map((item) => ({
        category: 'music_affinity', subject: item?.name,
        statement: `根据跨会话播放行为，用户经常听音乐类型：${behaviorText(item?.name)}`,
        evidence: item?.evidence, confidence: item?.confidence
      })),
      (Array.isArray(summary?.topScenes) ? summary.topScenes : []).slice(0, 6).map((item) => ({
        category: 'scene_affinity', subject: item?.name,
        statement: `根据跨会话场景行为，用户经常使用场景：${behaviorText(item?.name)}`,
        evidence: item?.evidence, confidence: item?.confidence
      })),
      bucketCandidates(summary?.timeBuckets, {
        morning: '早晨', afternoon: '下午', evening: '傍晚', 'late-night': '深夜'
      }, 'listening_routine', (subject) => `根据跨会话播放行为，用户通常在${subject}听歌`),
      bucketCandidates(summary?.volumeBuckets, {
        quiet: '安静', balanced: '适中', loud: '较大'
      }, 'listening_volume', (subject) => `根据跨会话播放行为，用户通常使用${subject}音量`)
    ];
    const start = ((Math.floor(Number(rotation) || 0) % groups.length) + groups.length) % groups.length;
    const order = groups.map((_, index) => (start + index) % groups.length);
    const cursors = groups.map(() => 0);
    let added = true;
    while (signals.length < 8 && added) {
      added = false;
      order.forEach((index) => {
        if (signals.length >= 8) return;
        const group = groups[index];
        while (cursors[index] < group.length) {
          const candidate = group[cursors[index]++];
          if (add(candidate)) {
            added = true;
            break;
          }
        }
      });
    }
    return Object.freeze(signals);
  }

  function create(options = {}) {
    const memoryClient = options.memoryClient || global.FeLocalMemory;
    const policy = options.policy || global.FeMonsterPetPreferencePolicy;
    const clock = typeof options.clock === 'function' ? options.clock : () => new Date().toISOString();
    const states = new Map();

    if (!policy || policy.version !== 2 || typeof policy.reduce !== 'function'
      || typeof policy.normalizeRecord !== 'function' || typeof policy.serialize !== 'function'
      || typeof policy.behaviorSignals !== 'function' || typeof policy.entityId !== 'function') {
      throw new Error('FeMonsterPetPreferencePolicy v2 is required before creating preference memory.');
    }

    function stateFor(provider) {
      if (!states.has(provider)) {
        states.set(provider, {
          records: [],
          authorities: new Map(),
          authorityUnknown: new Set(),
          active: Object.freeze([]),
          loaded: false,
          loading: null,
          queue: Promise.resolve(),
          available: Boolean(memoryClient && typeof memoryClient.context === 'function'),
          nextSequence: 1,
          nextContextualGroup: 0,
          pending: 0,
          lastAccessAt: Date.now()
        });
      }
      const state = states.get(provider);
      state.lastAccessAt = Date.now();
      pruneProviderStates(provider);
      return state;
    }

    function pruneProviderStates(retainedProvider = '') {
      if (states.size <= MAX_PROVIDER_STATES) return;
      const candidates = Array.from(states.entries())
        .filter(([provider, state]) => provider !== retainedProvider && !state.loading && state.pending === 0)
        .sort((left, right) => left[1].lastAccessAt - right[1].lastAccessAt);
      while (states.size > MAX_PROVIDER_STATES && candidates.length) {
        const [provider] = candidates.shift();
        states.delete(provider);
      }
    }

    function rebuild(state, now) {
      const behaviorEntities = new Set(state.records.map((record) => policy.normalizeRecord(record))
        .filter((value) => value?.origin === 'behavior')
        .map((value) => value.entityId));
      state.authorities.forEach((record, entityId) => {
        if (!behaviorEntities.has(entityId)) state.authorities.delete(entityId);
      });
      state.authorityUnknown.forEach((entityId) => {
        if (!behaviorEntities.has(entityId)) state.authorityUnknown.delete(entityId);
      });
      const authorityRecords = Array.from(state.authorities.values());
      const projectionRecords = state.records.filter((record) => {
        const value = policy.normalizeRecord(record);
        return value?.origin !== 'behavior' || !state.authorityUnknown.has(value.entityId);
      });
      state.active = policy.reduce([...projectionRecords, ...authorityRecords], { now: exactTime(now, clock) });
      return state.active;
    }

    async function durableExplicitAuthority(provider, entityId) {
      const recalled = await memoryClient.context({
        provider,
        q: entityId,
        limit: MAX_HYDRATE_RECORDS,
        types: ['user.fact']
      });
      if (recalled?.available === false) throw durableError('LOCAL_MEMORY_AUTHORITY_UNAVAILABLE');
      const records = Array.isArray(recalled?.knowledge) ? recalled.knowledge : [];
      return Object.freeze({
        authority: explicitAuthorityRecord(records, entityId, policy),
        // Context has no pagination cursor. At the maximum, absence is not a
        // proof: a legacy explicit authority may sit beyond this bounded page.
        complete: records.length < MAX_HYDRATE_RECORDS
      });
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
        const recalled = await memoryClient.context({ provider, limit: MAX_HYDRATE_RECORDS, types: ['user.fact'] });
        state.available = recalled?.available !== false;
        const newest = (Array.isArray(recalled?.knowledge) ? recalled.knowledge : [])
          .filter((record) => record?.type === 'user.fact')
          .slice()
          .sort((left, right) => Date.parse(right?.recordedAt || right?.occurredAt || 0)
            - Date.parse(left?.recordedAt || left?.occurredAt || 0))
          .slice(0, MAX_HYDRATE_RECORDS);
        state.records = compactPreferenceRecords(newest, policy);
        state.nextSequence = newest.reduce((maximum, record) => (
          Math.max(maximum, Number.isFinite(Number(record?.sourceSequence)) ? Number(record.sourceSequence) + 1 : maximum)
        ), 1);
        const behaviorEntityIds = Array.from(new Set(state.records.map((record) => policy.normalizeRecord(record))
          .filter((value) => value?.origin === 'behavior')
          .map((value) => value.entityId))).slice(0, MAX_AUTHORITY_CACHE);
        const authorities = await Promise.all(behaviorEntityIds.map(async (entityId) => ({
          entityId,
          result: await durableExplicitAuthority(provider, entityId)
        })));
        authorities.forEach(({ entityId, result }) => {
          if (result.authority) state.authorities.set(entityId, Object.freeze(result.authority));
          else if (!result.complete) state.authorityUnknown.add(entityId);
        });
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
      state.pending += 1;
      const next = state.queue.then(operation, operation);
      const settled = next.finally(() => {
        state.pending = Math.max(0, state.pending - 1);
        state.lastAccessAt = Date.now();
        pruneProviderStates();
      });
      state.queue = settled.catch(() => {});
      return settled;
    }

    async function persist(provider, preference) {
      const state = await hydrate(provider);
      if (!state.available || !memoryClient || typeof memoryClient.append !== 'function') {
        throw durableError('LOCAL_MEMORY_UNAVAILABLE');
      }
      const value = policy.serialize(preference);
      if (!value) throw durableError('PREFERENCE_REJECTED');
      const previous = state.active.find((item) => item.entityId === preference.entityId);
      let explicitAuthority = null;
      if (preference.origin === 'behavior') {
        const authorityResult = state.authorities.has(preference.entityId)
          ? Object.freeze({ authority: state.authorities.get(preference.entityId), complete: true })
          : await durableExplicitAuthority(provider, preference.entityId);
        explicitAuthority = authorityResult.authority;
        if (explicitAuthority) {
          state.authorities.set(preference.entityId, Object.freeze(explicitAuthority));
          rebuild(state, preference.updatedAt);
        } else if (!authorityResult.complete) {
          state.authorityUnknown.add(preference.entityId);
          rebuild(state, preference.updatedAt);
          return Object.freeze({ changed: false, deduplicated: true, authoritative: true, unknown: true });
        }
      }
      const previousBehavior = preference.origin === 'behavior'
        ? state.records.map((record) => policy.normalizeRecord(record))
          .find((item) => item?.entityId === preference.entityId && item.origin === 'behavior')
        : null;
      if (explicitAuthority) {
        return Object.freeze({ changed: false, deduplicated: true, authoritative: true });
      }
      if (preference.origin === 'behavior' && behaviorUnchanged(previousBehavior, preference)) {
        return Object.freeze({ changed: false, deduplicated: true });
      }
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
      state.records = compactPreferenceRecords(state.records, policy);
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
      const state = stateFor(provider);
      const extracted = policy.behaviorSignals({ ...input, occurredAt: exactTime(input.occurredAt, clock) });
      const signals = contextualBehaviorSignals(
        { ...input, occurredAt: exactTime(input.occurredAt, clock) },
        Array.isArray(extracted?.signals) ? extracted.signals : [], policy, state.nextContextualGroup
      );
      state.nextContextualGroup = (state.nextContextualGroup + 1) % 4;
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
