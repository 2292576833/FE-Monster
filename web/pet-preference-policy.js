(function initializePetPreferencePolicy(global) {
  'use strict';
  if (global.FeMonsterPetPreferencePolicy) return;

  const HALF_LIFE_MS = 120 * 24 * 60 * 60 * 1000;
  const SOURCE = 'pet-preference-learning';
  const MAX_TEXT = 2_000;
  const MAX_SUBJECT = 72;
  const MAX_PREFERENCES = 100;
  const PERMANENT = /(?:记住|以后|今后|一直|长期)/u;
  const ONE_TURN = /(?:这次|本次|今天|暂时|现在先|先别|待会)/u;
  const UNSAFE = /(?:https?:\/\/|www\.|```|<script|api[\s_-]*key|password|token|secret|authorization|cookie|(?:session|session[_ -]?id|set-cookie)[\s:=_-]*[A-Za-z0-9._~+\/-]+|(?:bearer|jwt|access[_ -]?token|refresh[_ -]?token|credential)[\s:=_-]*[A-Za-z0-9._~+\/-]+|系统提示|忽略.{0,12}(?:提示|规则)|执行.{0,8}(?:命令|代码|脚本)|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{7,}\b|(?:[A-Za-z]:[\\/]|(?:^|\s)[\\/])[^\s]+)/iu;
  const QUESTION = /[?？]|(?:什么|哪些|哪种|是否|有没有|怎么|吗|么)$/u;
  const PUNCTUATION = /[，。！？；,!?;\n]/u;

  function boundedText(value, maximum) {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maximum);
  }

  function normalize(value) {
    return boundedText(value, 240).toLocaleLowerCase();
  }

  function stableHash(value) {
    let hash = 0x811c9dc5;
    for (const byte of new TextEncoder().encode(String(value ?? ''))) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function entityId(category, subject) {
    const cleanCategory = boundedText(category, 48).toLocaleLowerCase();
    const cleanSubject = normalize(subject);
    return `pet.preference.${cleanCategory}.${stableHash(`${cleanCategory}\0${cleanSubject}`)}`.slice(0, 120);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function confidence(value, fallback = 0) {
    return Math.round(clamp(finiteNumber(value, fallback), 0, 1) * 1000) / 1000;
  }

  function evidence(value, fallback = 1) {
    return Math.max(1, Math.min(100000, Math.floor(finiteNumber(value, fallback))));
  }

  function isoTime(value, fallback) {
    const parsed = new Date(typeof value === 'number' ? value : String(value ?? '')).getTime();
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return fallback || '';
  }

  function clockNow(input) {
    const clock = input && typeof input.clock === 'function' ? input.clock : null;
    const value = clock ? clock() : input?.now;
    const parsed = new Date(typeof value === 'number' ? value : String(value ?? '')).getTime();
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function canonicalCategory(category) {
    const value = boundedText(category, 48).toLocaleLowerCase();
    if (value === 'music_like' || value === 'music_dislike' || value === 'music_track' || value === 'music_artist') {
      return 'music_affinity';
    }
    if (value === 'hobby') return 'interest';
    return value;
  }

  function canonicalOrigin(origin) {
    const value = boundedText(origin, 40).toLocaleLowerCase();
    if (value === 'behavior' || value === 'playback-events' || value === 'inferred' || value === 'inferred-behavior') {
      return 'behavior';
    }
    if (value === 'explicit' || value === 'explicit-chat' || value === 'user') return 'explicit-chat';
    return value;
  }

  function isExplicit(value) {
    return canonicalOrigin(value) === 'explicit-chat';
  }

  function safeSubject(value) {
    let subject = boundedText(value, MAX_SUBJECT)
      .replace(/^(?:一些|那些|这些|比较|特别|很|听|的)/u, '')
      .replace(/[了啦啊呀]$/u, '')
      .replace(/(?:一下|一点点)$/u, '')
      .trim();
    if (!subject || UNSAFE.test(subject) || subject.length > MAX_SUBJECT || PUNCTUATION.test(subject)) return '';
    return subject;
  }

  function preferenceValue(input) {
    const category = canonicalCategory(input?.category);
    const subject = safeSubject(input?.subject);
    const status = input?.status === 'retracted' ? 'retracted' : input?.status === 'active' ? 'active' : '';
    const origin = canonicalOrigin(input?.origin);
    const polarity = input?.polarity === 'dislike' ? 'dislike' : input?.polarity === 'like' ? 'like' : '';
    const statement = boundedText(input?.statement, 220);
    const updatedAt = isoTime(input?.updatedAt);
    if (!category || !subject || !statement || !status || !origin || !polarity || !updatedAt) return null;
    if (UNSAFE.test(statement) || !['explicit-chat', 'behavior'].includes(origin)) return null;
    const id = boundedText(input?.entityId, 120) || entityId(category, subject);
    if (id !== entityId(category, subject)) return null;
    return Object.freeze({
      schemaVersion: 2,
      kind: 'preference',
      entityId: id,
      category,
      subject,
      polarity,
      statement,
      origin,
      confidence: confidence(input?.confidence, origin === 'explicit-chat' ? 1 : 0),
      evidence: evidence(input?.evidence),
      status,
      updatedAt
    });
  }

  function signal(category, subject, polarity, statement, origin, occurredAt, options = {}) {
    const cleanSubject = safeSubject(subject);
    const updatedAt = isoTime(occurredAt);
    if (!cleanSubject || !updatedAt || UNSAFE.test(statement) || options.oneTurn) return null;
    return preferenceValue({
      category,
      subject: cleanSubject,
      polarity,
      statement: boundedText(statement, 220),
      origin,
      confidence: origin === 'explicit-chat' ? 1 : options.confidence,
      evidence: options.evidence,
      status: options.status || 'active',
      updatedAt,
      entityId: entityId(category, cleanSubject)
    });
  }

  function collect(text, expression, mapper, output) {
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(text)) && output.length < 8) {
      const item = mapper(match[1], match[0]);
      if (item && !output.some((candidate) => candidate.entityId === item.entityId)) output.push(item);
    }
  }

  function extractChatSignals(input = {}) {
    const text = boundedText(input.text, MAX_TEXT);
    if (!text || UNSAFE.test(text) || QUESTION.test(text)) return Object.freeze({ signals: Object.freeze([]) });
    const occurredAt = isoTime(input.occurredAt || input.updatedAt || input.now)
      || isoTime(clockNow(input));
    const output = [];

    // Retractions and corrections intentionally run first so a sentence cannot be
    // misread by a later positive-preference expression.
    collect(text, /忘掉(?:我)?(?:对)?([^，。！？；,!?;\n]{1,72}?)(?:的)?偏好/gu, (subject) => signal(
      'music_affinity', subject, 'like', `用户撤回对${safeSubject(subject)}的偏好`, 'explicit-chat', occurredAt, { status: 'retracted' }
    ), output);
    collect(text, /(?:删除|撤回|不再记得)(?:我)?(?:对)?([^，。！？；,!?;\n]{1,72}?)(?:的)?偏好/gu, (subject) => signal(
      'music_affinity', subject, 'like', `用户撤回对${safeSubject(subject)}的偏好`, 'explicit-chat', occurredAt, { status: 'retracted' }
    ), output);
    collect(text, /我(?:现在|如今|已经|以后)?(?:不喜欢听|不爱听|讨厌听)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'music_affinity', subject, 'dislike', `用户明确表示不喜欢听：${safeSubject(subject)}`, 'explicit-chat', occurredAt
    ), output);
    collect(text, /我(?:现在|如今|已经|以后)?(?:不喜欢|讨厌)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'music_affinity', subject, 'dislike', `用户明确表示不喜欢：${safeSubject(subject)}`, 'explicit-chat', occurredAt
    ), output);

    const positiveOptions = { oneTurn: ONE_TURN.test(text) && !PERMANENT.test(text) };
    collect(text, /我(?:平时|通常|经常|常常)?(?:最|很|比较|特别)?(?:喜欢听|爱听|常听|经常听)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'music_affinity', subject, 'like', `用户明确表示喜欢听：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    collect(text, /我(?:平时|通常|一直)?(?:最|很|比较|特别)?(?:喜欢(?!听)|热爱|爱好是)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'interest', subject, 'like', `用户明确表示喜欢：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    collect(text, /我的(?:爱好|兴趣)(?:是|有)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'interest', subject, 'like', `用户明确说明兴趣：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    collect(text, /(?:我)?(?:希望|想让|喜欢)(?:你)?(?:回答|回复)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'response_style', subject, 'like', `用户希望桌宠回复：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    collect(text, /以后(?:请)?(?:你)?(?:回答|回复)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'response_style', subject, 'like', `用户希望桌宠回复：${safeSubject(subject)}`, 'explicit-chat', occurredAt
    ), output);
    collect(text, /请(?:你)?(?:回答|回复)([^，。！？；,!?;\n]{1,72})/gu, (subject) => signal(
      'response_style', subject, 'like', `用户希望桌宠回复：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    collect(text, /我(?:平时|通常|经常|总是|习惯)(?!喜欢|不喜欢)([^，。！？；,!?;\n]{2,72})/gu, (subject) => signal(
      'routine', subject, 'like', `用户明确说明日常习惯：${safeSubject(subject)}`, 'explicit-chat', occurredAt, positiveOptions
    ), output);
    return Object.freeze({ signals: Object.freeze(output) });
  }

  function behaviorSignals(input = {}) {
    const summary = input?.summary && typeof input.summary === 'object' ? input.summary : input;
    const occurredAt = isoTime(input.occurredAt || input.updatedAt || summary?.occurredAt || summary?.now)
      || isoTime(clockNow(input));
    const output = [];
    const tracks = Array.isArray(summary?.topSongs) ? summary.topSongs : Array.isArray(summary?.topTracks) ? summary.topTracks : [];
    const artists = Array.isArray(summary?.topArtists) ? summary.topArtists : [];
    const add = (item, kind) => {
      const subject = item?.name || item?.title || item?.artist;
      const starts = Math.max(0, Math.floor(finiteNumber(item?.starts, 0)));
      const completes = Math.max(0, Math.floor(finiteNumber(item?.completes, 0)));
      const replays = Math.max(0, Math.floor(finiteNumber(item?.replays, 0)));
      const skips = Math.max(0, Math.floor(finiteNumber(item?.skips, 0)));
      const totalEvidence = Math.max(starts + completes + replays + skips, Math.floor(finiteNumber(item?.evidence, 0)));
      const inferred = confidence(item?.confidence, Math.min(1, totalEvidence / 20));
      const avoidance = skips >= 3 && skips > completes + replays * 2;
      const affinity = completes + replays * 2 > skips;
      if (!subject || starts < 3 || totalEvidence < 3 || inferred < 0.6 || (!avoidance && !affinity)) return;
      const clean = safeSubject(subject);
      const artist = kind === 'track' ? safeSubject(item?.artist) : '';
      const polarity = avoidance ? 'dislike' : 'like';
      const statement = avoidance
        ? `根据跨会话播放行为，用户倾向跳过：${clean}`
        : kind === 'track'
          ? `根据跨会话播放行为，用户经常听歌曲：${clean}${artist ? `（${artist}）` : ''}`
          : `根据跨会话播放行为，用户经常听歌手：${clean}`;
      const itemSignal = signal('music_affinity', clean, polarity, statement, 'behavior', occurredAt, {
        confidence: inferred,
        evidence: totalEvidence
      });
      if (itemSignal && !output.some((candidate) => candidate.entityId === itemSignal.entityId)) output.push(itemSignal);
    };
    tracks.slice(0, 6).forEach((item) => add(item, 'track'));
    artists.slice(0, 6).forEach((item) => add(item, 'artist'));
    return Object.freeze({ signals: Object.freeze(output.slice(0, 8)) });
  }

  function parseV1(value, recordTime) {
    const category = canonicalCategory(value.category);
    const statement = boundedText(value.statement, 220);
    let subject = statement
      .replace(/^.*?[：:]\s*/u, '')
      .replace(/[。.!！]+$/u, '')
      .trim();
    if (subject === statement && category === 'response_style') subject = statement;
    let polarity = /(?:不喜欢|不爱|讨厌|避免)/u.test(statement) || value.category === 'music_dislike' ? 'dislike' : 'like';
    if (!subject) return null;
    return preferenceValue({
      category,
      subject,
      polarity,
      statement,
      origin: value.origin,
      confidence: value.confidence,
      evidence: value.evidence,
      status: 'active',
      updatedAt: recordTime || value.updatedAt
    });
  }

  function normalizeRecord(record) {
    if (!record || record.type !== 'user.fact') return null;
    const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload) ? record.payload : {};
    if (boundedText(payload.source, 80) !== SOURCE) return null;
    const raw = typeof payload.value === 'string' ? payload.value : payload.value;
    if (!raw || (typeof raw !== 'object' && typeof raw !== 'string')) return null;
    let value;
    try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const recordTime = isoTime(record.occurredAt || record.recordedAt || payload.occurredAt);
    if (![1, 2].includes(Number(value.schemaVersion))) return null;
    if (Number(value.schemaVersion) === 1) {
      const migrated = parseV1(value, recordTime);
      if (!migrated) return null;
      return migrated;
    }
    const normalized = preferenceValue({ ...value, entityId: payload.entityId || value.entityId, updatedAt: recordTime || value.updatedAt });
    return normalized;
  }

  function nowMs(options) {
    return clockNow(options);
  }

  function decayed(value, currentMs) {
    if (value.origin !== 'behavior') return value.confidence;
    const updated = Date.parse(value.updatedAt);
    if (!Number.isFinite(updated)) return value.confidence;
    const age = Math.max(0, currentMs - updated);
    return Math.round(value.confidence * Math.pow(0.5, age / HALF_LIFE_MS) * 1000) / 1000;
  }

  function reduce(records, options = {}) {
    const normalized = (Array.isArray(records) ? records : [])
      .map((record, index) => ({ value: normalizeRecord(record), index, sequence: finiteNumber(record?.sourceSequence, 0) }))
      .filter((item) => item.value)
      .sort((left, right) => (Date.parse(left.value.updatedAt) - Date.parse(right.value.updatedAt)) || (left.sequence - right.sequence) || (left.index - right.index));
    const selected = new Map();
    for (const item of normalized) {
      const value = item.value;
      if (value.status === 'retracted') {
        selected.delete(value.entityId);
        continue;
      }
      const previous = selected.get(value.entityId);
      if (!previous || isExplicit(value.origin) || !isExplicit(previous.origin)) selected.set(value.entityId, value);
    }
    const currentMs = nowMs(options);
    if (!Number.isFinite(currentMs)) return Object.freeze([]);
    return Object.freeze(Array.from(selected.values())
      .map((value) => Object.freeze({ ...value, confidence: decayed(value, currentMs) }))
      .filter((value) => value.status === 'active' && value.confidence > 0)
      .sort((left, right) => (right.confidence - left.confidence) || (Date.parse(right.updatedAt) - Date.parse(left.updatedAt)) || left.entityId.localeCompare(right.entityId))
      .slice(0, MAX_PREFERENCES));
  }

  function tokens(value) {
    const text = normalize(value);
    const output = new Set(text.match(/[a-z0-9][a-z0-9._:-]{1,63}/g) || []);
    for (const run of text.match(/[\u3400-\u9fff]{1,160}/g) || []) {
      for (let index = 0; index < run.length; index += 1) {
        output.add(run.slice(index, index + 1));
        if (index + 2 <= run.length) output.add(run.slice(index, index + 2));
        if (index + 3 <= run.length) output.add(run.slice(index, index + 3));
      }
    }
    return output;
  }

  function rank(preferences, message, limit = 10) {
    const boundedLimit = Math.max(0, Math.min(MAX_PREFERENCES, Math.floor(finiteNumber(limit, 10))));
    if (!boundedLimit || !Array.isArray(preferences)) return Object.freeze([]);
    const query = normalize(message).slice(0, MAX_TEXT);
    if (UNSAFE.test(query)) return Object.freeze([]);
    const queryTokens = tokens(query);
    const values = preferences.slice(0, MAX_PREFERENCES)
      .map((item) => preferenceValue(item))
      .filter((item) => item && item.status !== 'retracted');
    const scored = values.map((value, index) => {
      const text = normalize(`${value.subject || ''} ${value.statement || ''} ${value.category || ''}`);
      const subject = normalize(value.subject);
      let score = 0;
      if (query && subject && query.includes(subject)) {
        score += 1000 + Math.max(0, 100 - query.indexOf(subject) * 40);
      }
      if (query && text.includes(query)) score += 400;
      const valueTokens = tokens(text);
      for (const token of queryTokens) if (valueTokens.has(token)) score += /[\u3400-\u9fff]/u.test(token) ? token.length * 8 : Math.min(24, token.length * 2);
      score *= 0.5 + confidence(value.confidence, 0) * 0.5;
      return { value, index, score };
    });
    scored.sort((left, right) => (right.score - left.score) || (Date.parse(right.value.updatedAt || '') - Date.parse(left.value.updatedAt || '')) || (left.index - right.index));
    return Object.freeze(scored.slice(0, boundedLimit).map((item) => item.value));
  }

  function serialize(preference) {
    const value = preferenceValue(preference);
    return value ? JSON.stringify(value) : '';
  }

  global.FeMonsterPetPreferencePolicy = Object.freeze({
    version: 2,
    entityId,
    extractChatSignals,
    behaviorSignals,
    normalizeRecord,
    reduce,
    rank,
    serialize
  });
})(window);
