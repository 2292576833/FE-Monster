(function initializeFeLocalMemory(global) {
  'use strict';

  if (global.FeLocalMemory) return;

  const EVENTS_ENDPOINT = '/api/local-memory/events';
  const CHATS_ENDPOINT = '/api/local-memory/chats';
  const CONTEXT_ENDPOINT = '/api/local-memory/context';
  const HEALTH_ENDPOINT = '/api/local-memory/health';
  const FORGET_ENDPOINT = '/api/local-memory/forget';
  const QUEUE_LIMIT = 100;
  const BATCH_LIMIT = 100;
  const FLUSH_DELAY_MS = 120;
  const RETRY_INITIAL_MS = 250;
  const RETRY_MAX_MS = 5_000;
  const MAX_TEXT_BYTES = 32_768;
  const MAX_EVENT_BYTES = 256 * 1_024;
  const MAX_BATCH_BYTES = 900 * 1_024;
  const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const CORRELATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$/;
  const SECRET_KEY_PATTERN = /(?:api.?key|access.?key|access.?token|refresh.?token|authorization|cookie|password|passwd|credential|private.?key|client.?secret|secret|session|raw.?headers?|request.?body|response.?body|auth.?json|browser.?login|file.?handle|playback.?url|base.?url|server.?url|model.?url|signed.?url|(?:^|[_-])url$|(?:^|[_-])uri$|path)/i;
  const URL_VALUE_PATTERN = /(?:\b(?:https?|wss?|file|ftp):\/\/\S+|\b(?:blob|data|mailto|magnet|ipfs|ipns):\S+|\bwww\.[^\s]+|\b[a-z0-9.-]+\.[a-z]{2,63}(?::\d{1,5})?[/?:#]\S*)/gi;
  const WINDOWS_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/g;
  const UNIX_PATH_PATTERN = /(?:^|\s)\/(?:Users|home|var|tmp|opt|etc|usr|mnt|Volumes)\/[^\s"']+/g;
  const CREDENTIAL_VALUE_PATTERN = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:sk|ak)-[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|token|password|secret|authorization|cookie)\s*[:=]\s*\S+)/gi;
  const CHAT_FIELDS = new Set([
    'messageId', 'conversationId', 'conversationStartedAt', 'traceId', 'turnId', 'role', 'text', 'source',
    'modelOrigin', 'timeAccuracy', 'occurredAt', 'sourceSequence'
  ]);
  const OPERATION_FIELDS = new Set([
    'operationId', 'traceId', 'turnId', 'causedByMessageId', 'actor', 'modelOrigin',
    'phase', 'status', 'commandId', 'commandManifestRevision', 'arguments', 'outcome',
    'before', 'after', 'receipt', 'undo', 'failureCode', 'providerId', 'songId',
    'playlistId', 'presetId', 'componentId', 'title', 'artist', 'action', 'positionMs',
    'durationMs', 'position', 'rotation', 'scale', 'occurredAt', 'sourceSequence'
  ]);
  const KNOWLEDGE_FIELDS = new Set([
    'occurredAt', 'sourceSequence', 'source', 'entityId', 'title', 'value',
    'timeAccuracy', 'traceId'
  ]);
  const ALLOWED_TYPES = Object.freeze({
    chat: new Set(['chat.message', 'legacy.chat_snapshot']),
    operation: new Set([
      'command.requested', 'command.confirmed', 'command.started', 'command.succeeded',
      'command.failed', 'command.cancelled', 'command.reverted', 'playback.started',
      'playback.completed', 'playback.skipped', 'playback.replayed',
      'playback.duration_summary', 'library.favorite_changed', 'scene.preset_saved',
      'scene.preset_applied'
    ]),
    knowledge: new Set(['library.playlist_snapshot', 'user.fact'])
  });

  const queue = [];
  let inFlight = [];
  let flushTimer = 0;
  let flushing = false;
  let temporaryConversation = false;
  let retryDelayMs = RETRY_INITIAL_MS;
  let sourceSequence = Math.min(MAX_SEQUENCE - 10_000, Math.max(1, Date.now() * 1_000));
  let acceptedCount = 0;
  let duplicateCount = 0;
  let suppressedCount = 0;
  let droppedCount = 0;
  let lastRecordedAt = '';
  let lastErrorCode = '';
  let lastErrorAt = '';

  function createId() {
    try {
      const generated = global.crypto?.randomUUID?.();
      if (UUID_PATTERN.test(String(generated || '').toLowerCase())) return String(generated).toLowerCase();
    } catch (_) {}
    try {
      const bytes = new Uint8Array(16);
      global.crypto?.getRandomValues?.(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      const generated = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      if (UUID_PATTERN.test(generated)) return generated;
    } catch (_) {}
    // Browsers without Web Crypto still receive a syntactically valid UUID;
    // entropy from time and Math.random is used only as a last-resort event id.
    const random = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
      .replace(/[^0-9a-f]/g, '')
      .padEnd(32, '0')
      .slice(0, 32);
    return `${random.slice(0, 8)}-${random.slice(8, 12)}-4${random.slice(13, 16)}-8${random.slice(17, 20)}-${random.slice(20)}`;
  }

  function nextSourceSequence() {
    sourceSequence = Math.min(MAX_SEQUENCE, sourceSequence + 1);
    return sourceSequence;
  }

  function exactTimestamp(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '';
    return parsed.toISOString() === value ? value : parsed.toISOString();
  }

  function safeIdentifier(value, fallback = '') {
    const text = String(value ?? '').trim();
    return CORRELATION_PATTERN.test(text) ? text : fallback;
  }

  function safeProvider(value) {
    const candidate = String(value || 'netease').trim().toLowerCase();
    return PROVIDER_PATTERN.test(candidate) ? candidate : 'netease';
  }

  function utf8Bytes(value) {
    const text = String(value ?? '');
    try { return new global.TextEncoder().encode(text); }
    catch (_) {
      const bytes = [];
      for (const character of text) {
        const codePoint = character.codePointAt(0);
        if (codePoint <= 0x7f) bytes.push(codePoint);
        else if (codePoint <= 0x7ff) bytes.push(0, 0);
        else if (codePoint <= 0xffff) bytes.push(0, 0, 0);
        else bytes.push(0, 0, 0, 0);
      }
      return bytes;
    }
  }

  function truncateUtf8(value, maximumBytes = MAX_TEXT_BYTES) {
    const text = String(value ?? '');
    if (utf8Bytes(text).length <= maximumBytes) return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (utf8Bytes(text.slice(0, middle)).length <= maximumBytes) low = middle;
      else high = middle - 1;
    }
    let truncated = text.slice(0, low);
    if (/^[\uDC00-\uDFFF]/.test(text.slice(low))) truncated = truncated.slice(0, -1);
    return truncated;
  }

  function sanitizeString(value) {
    const redacted = String(value ?? '')
      .slice(0, MAX_TEXT_BYTES * 4)
      .replace(CREDENTIAL_VALUE_PATTERN, '[redacted]')
      .replace(URL_VALUE_PATTERN, '[redacted]')
      .replace(WINDOWS_PATH_PATTERN, '[redacted]')
      .replace(UNIX_PATH_PATTERN, ' [redacted]')
      .trim();
    return truncateUtf8(redacted);
  }

  function sanitizeValue(value, depth = 0) {
    if (depth > 10) return null;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return sanitizeString(value);
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));
    if (!value || typeof value !== 'object') return sanitizeString(value);
    const output = {};
    Object.entries(value).slice(0, 100).forEach(([key, item]) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey || normalizedKey === '__proto__' || normalizedKey === 'prototype' || normalizedKey === 'constructor') return;
      if (SECRET_KEY_PATTERN.test(normalizedKey.replace(/[^A-Za-z0-9_-]/g, ''))) return;
      output[normalizedKey.slice(0, 120)] = sanitizeValue(item, depth + 1);
    });
    return output;
  }

  function allowedFields(stream) {
    if (stream === 'chat') return CHAT_FIELDS;
    if (stream === 'operation') return OPERATION_FIELDS;
    if (stream === 'knowledge') return KNOWLEDGE_FIELDS;
    return null;
  }

  function sanitizePayload(stream, source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const allowed = allowedFields(stream);
    if (!allowed) return null;
    const output = {};
    for (const [key, value] of Object.entries(source)) {
      if (!allowed.has(key)) continue;
      output[key] = sanitizeValue(value, 0);
    }
    return output;
  }

  function validRequiredPayload(stream, type, payload) {
    if (stream === 'chat') {
      return UUID_PATTERN.test(String(payload.messageId || ''))
        && safeIdentifier(payload.conversationId)
        && safeIdentifier(payload.traceId)
        && safeIdentifier(payload.turnId)
        && ['user', 'assistant', 'system', 'tool'].includes(payload.role)
        && typeof payload.text === 'string' && payload.text.length > 0
        && typeof payload.source === 'string' && payload.source.length > 0
        && typeof payload.modelOrigin === 'string' && payload.modelOrigin.length > 0
        && (!payload.conversationStartedAt || exactTimestamp(payload.conversationStartedAt))
        && (payload.timeAccuracy === 'exact' || (type === 'legacy.chat_snapshot' && payload.timeAccuracy === 'unknown'));
    }
    if (stream === 'operation') {
      return safeIdentifier(payload.operationId)
        && safeIdentifier(payload.traceId)
        && ['user', 'local-ai', 'server-ai', 'app', 'system'].includes(payload.actor)
        && typeof payload.phase === 'string' && payload.phase.length > 0
        && typeof payload.status === 'string' && payload.status.length > 0;
    }
    return typeof payload.source === 'string' && payload.source.length > 0
      && safeIdentifier(payload.entityId)
      && typeof payload.title === 'string' && payload.title.length > 0
      && Object.prototype.hasOwnProperty.call(payload, 'value');
  }

  function normalizeEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const stream = String(input.stream || '').trim().toLowerCase();
    const type = String(input.type || '').trim();
    if (!ALLOWED_TYPES[stream]?.has(type)) return null;
    const provider = safeProvider(input.provider);
    const payload = sanitizePayload(stream, input.payload || {});
    if (!payload) return null;
    const explicitUnknownTime = type === 'legacy.chat_snapshot'
      && payload.timeAccuracy === 'unknown'
      && (input.occurredAt === null || payload.occurredAt === null);
    const occurredAt = explicitUnknownTime
      ? null
      : exactTimestamp(input.occurredAt || payload.occurredAt) || new Date().toISOString();
    const declaredSequence = Number(input.sourceSequence ?? payload.sourceSequence);
    const sequence = Number.isSafeInteger(declaredSequence) && declaredSequence >= 0
      ? declaredSequence
      : nextSourceSequence();
    let eventId = String(input.eventId || '').trim().toLowerCase();
    if (stream === 'chat') {
      const payloadMessageId = String(payload.messageId || '').trim().toLowerCase();
      if (!eventId) eventId = UUID_PATTERN.test(payloadMessageId) ? payloadMessageId : createId();
      if (!UUID_PATTERN.test(eventId)) return null;
      if (payloadMessageId && payloadMessageId !== eventId) return null;
      payload.messageId = eventId;
    } else {
      if (!eventId) eventId = createId();
      if (!UUID_PATTERN.test(eventId)) return null;
    }
    payload.occurredAt = occurredAt;
    payload.sourceSequence = sequence;
    if (!validRequiredPayload(stream, type, payload)) return null;
    const event = Object.freeze({ eventId, stream, type, occurredAt, sourceSequence: sequence, payload });
    const eventBytes = utf8Bytes(JSON.stringify(event)).length;
    if (eventBytes > MAX_EVENT_BYTES) return null;
    return Object.freeze({
      provider,
      event,
      eventBytes
    });
  }

  function healthSnapshot() {
    return Object.freeze({
      available: !lastErrorCode,
      temporaryConversation,
      queued: queue.length + inFlight.length,
      inFlight: inFlight.length,
      queueLimit: QUEUE_LIMIT,
      accepted: acceptedCount,
      duplicates: duplicateCount,
      suppressed: suppressedCount,
      dropped: droppedCount,
      retryDelayMs,
      lastRecordedAt,
      lastErrorCode,
      lastErrorAt
    });
  }

  function publishHealth() {
    try {
      global.dispatchEvent?.(new global.CustomEvent('fe-local-memory-health', { detail: healthSnapshot() }));
    } catch (_) {}
  }

  function scheduleFlush(delay = FLUSH_DELAY_MS) {
    if (flushTimer || flushing || !queue.length) return;
    flushTimer = setTimeout(() => {
      flushTimer = 0;
      return flushQueue();
    }, Math.max(0, Number(delay) || 0));
  }

  function selectProviderBatch() {
    if (!queue.length) return [];
    const provider = queue[0].provider;
    const selected = [];
    let selectedBytes = 64;
    for (let index = 0; index < queue.length && selected.length < BATCH_LIMIT;) {
      const item = queue[index];
      if (item.provider !== provider || selectedBytes + item.eventBytes > MAX_BATCH_BYTES) {
        index += 1;
        continue;
      }
      selected.push(queue.splice(index, 1)[0]);
      selectedBytes += item.eventBytes;
    }
    return selected;
  }

  function redactedErrorCode(error) {
    if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code)) return error.code;
    const status = Number(error?.status) || 0;
    if (status === 409) return 'LOCAL_MEMORY_CONFLICT';
    if (status >= 400 && status < 500) return 'LOCAL_MEMORY_REQUEST_REJECTED';
    if (status >= 500) return 'LOCAL_MEMORY_UNAVAILABLE';
    return 'LOCAL_MEMORY_NETWORK_ERROR';
  }

  async function flushQueue(options = {}) {
    if (flushing || !queue.length) return false;
    flushing = true;
    let followupDelayMs = FLUSH_DELAY_MS;
    inFlight = selectProviderBatch();
    const provider = inFlight[0]?.provider || 'netease';
    const events = inFlight.map((item) => item.event);
    publishHealth();
    try {
      const response = await fetch(EVENTS_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: options.keepalive === true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, events })
      });
      if (!response?.ok) {
        const failure = new Error('Local memory request failed');
        failure.status = Number(response?.status) || 0;
        throw failure;
      }
      const body = await response.json();
      const results = Array.isArray(body?.results) ? body.results : [];
      const byId = new Map(results.map((result) => [String(result?.eventId || ''), result]));
      const receipts = inFlight.map((item) => {
        const result = byId.get(item.event.eventId);
        const recordedAt = exactTimestamp(result?.recordedAt);
        if (!result || !recordedAt) throw new Error('Local memory receipt missing');
        return { item, result, recordedAt };
      });
      for (const { item, result, recordedAt } of receipts) {
        acceptedCount += 1;
        if (result.duplicate === true) duplicateCount += 1;
        lastRecordedAt = recordedAt;
        item.resolve(Object.freeze({
          eventId: item.event.eventId,
          duplicate: result.duplicate === true,
          recordedAt
        }));
      }
      inFlight = [];
      retryDelayMs = RETRY_INITIAL_MS;
      lastErrorCode = '';
      lastErrorAt = '';
      return true;
    } catch (error) {
      const failedItems = inFlight;
      inFlight = [];
      const status = Number(error?.status) || 0;
      const retryable = status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
      lastErrorCode = redactedErrorCode(error);
      lastErrorAt = new Date().toISOString();
      if (retryable) {
        queue.unshift(...failedItems);
        followupDelayMs = retryDelayMs;
        retryDelayMs = Math.min(RETRY_MAX_MS, Math.max(RETRY_INITIAL_MS, retryDelayMs * 2));
      } else {
        droppedCount += failedItems.length;
        retryDelayMs = RETRY_INITIAL_MS;
        for (const item of failedItems) {
          item.resolve(Object.freeze({
            eventId: item.event.eventId,
            accepted: false,
            code: lastErrorCode
          }));
        }
      }
      return false;
    } finally {
      flushing = false;
      publishHealth();
      if (queue.length && !flushTimer) scheduleFlush(followupDelayMs);
    }
  }

  function suppressedHandle() {
    suppressedCount += 1;
    publishHealth();
    return Object.freeze({
      eventId: null,
      accepted: false,
      suppressed: true,
      receipt: Promise.resolve(Object.freeze({ suppressed: true }))
    });
  }

  function rejectedHandle(code = 'LOCAL_MEMORY_EVENT_INVALID') {
    droppedCount += 1;
    lastErrorCode = code;
    lastErrorAt = new Date().toISOString();
    publishHealth();
    return Object.freeze({
      eventId: null,
      accepted: false,
      suppressed: false,
      code,
      receipt: Promise.resolve(Object.freeze({ accepted: false, code }))
    });
  }

  function append(input) {
    if (temporaryConversation) return suppressedHandle();
    if (queue.length + inFlight.length >= QUEUE_LIMIT) {
      scheduleFlush(0);
      return rejectedHandle('LOCAL_MEMORY_QUEUE_FULL');
    }
    const normalized = normalizeEvent(input);
    if (!normalized) return rejectedHandle();
    let resolveReceipt;
    const receipt = new Promise((resolve) => { resolveReceipt = resolve; });
    queue.push({ ...normalized, resolve: resolveReceipt });
    scheduleFlush();
    publishHealth();
    return Object.freeze({
      eventId: normalized.event.eventId,
      accepted: true,
      suppressed: false,
      receipt
    });
  }

  function appendBatch(inputs) {
    if (!Array.isArray(inputs) || !inputs.length) return [];
    return inputs.slice(0, BATCH_LIMIT).map((input) => append(input));
  }

  function serverRecord(value, expectedStream) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const stream = String(value.stream || expectedStream || '').trim().toLowerCase();
    const type = String(value.type || '').trim();
    const eventId = String(value.eventId || '').trim().toLowerCase();
    if (stream !== expectedStream || !ALLOWED_TYPES[stream]?.has(type) || !UUID_PATTERN.test(eventId)) return null;
    const occurredAt = value.occurredAt === null ? null : exactTimestamp(value.occurredAt);
    const recordedAt = exactTimestamp(value.recordedAt);
    const sourceSequence = Number(value.sourceSequence);
    const payload = sanitizePayload(stream, value.payload || {});
    if (!recordedAt || !Number.isSafeInteger(sourceSequence) || sourceSequence < 0 || !payload) return null;
    return Object.freeze({
      eventId,
      stream,
      type,
      occurredAt,
      recordedAt,
      sourceSequence,
      payload: Object.freeze(payload)
    });
  }

  function serverRecords(values, stream, limit) {
    return Object.freeze((Array.isArray(values) ? values : [])
      .slice(0, limit)
      .map((value) => serverRecord(value, stream))
      .filter(Boolean));
  }

  function selectedTypes(values, stream) {
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => ALLOWED_TYPES[stream]?.has(value))
      .slice(0, 24);
  }

  function serverCursor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const occurredAtMillis = value.occurredAtMillis === null ? null : Number(value.occurredAtMillis);
    const recordedAtMillis = Number(value.recordedAtMillis);
    const sequence = Number(value.sourceSequence);
    const eventId = String(value.eventId || '').trim().toLowerCase();
    if ((occurredAtMillis !== null && (!Number.isSafeInteger(occurredAtMillis) || occurredAtMillis < 0))
      || !Number.isSafeInteger(recordedAtMillis) || recordedAtMillis < 0
      || !Number.isSafeInteger(sequence) || sequence < 0
      || !UUID_PATTERN.test(eventId)) return null;
    return Object.freeze({ occurredAtMillis, recordedAtMillis, sourceSequence: sequence, eventId });
  }

  function encodedCursor(value) {
    const cursor = serverCursor(value);
    if (!cursor) return '';
    return [
      cursor.occurredAtMillis === null ? 'null' : cursor.occurredAtMillis,
      cursor.recordedAtMillis,
      cursor.sourceSequence,
      cursor.eventId
    ].join(',');
  }

  function readFailure(response, fallback = 'LOCAL_MEMORY_READ_FAILED') {
    const failure = new Error('Local memory read failed');
    failure.status = Number(response?.status) || 0;
    failure.code = failure.status === 423
      ? 'LOCAL_MEMORY_LOCKED'
      : failure.status === 503
        ? 'LOCAL_MEMORY_UNAVAILABLE'
        : fallback;
    return failure;
  }

  async function vaultHealth(options = {}) {
    const endpoint = options.provider
      ? `${HEALTH_ENDPOINT}?provider=${encodeURIComponent(safeProvider(options.provider))}`
      : HEALTH_ENDPOINT;
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response?.ok) throw readFailure(response, 'LOCAL_MEMORY_HEALTH_FAILED');
    const body = await response.json();
    return Object.freeze({
      available: body?.available === true,
      locked: body?.locked === true,
      schemaVersion: Math.max(0, Math.floor(Number(body?.schemaVersion) || 0)),
      code: /^[A-Z0-9_]{1,80}$/.test(String(body?.code || ''))
        ? String(body.code)
        : 'LOCAL_MEMORY_UNKNOWN'
    });
  }

  async function chats(options = {}) {
    const limit = Math.max(1, Math.min(100, Math.floor(Number(options.limit) || 100)));
    const provider = safeProvider(options.provider);
    const parameters = [`provider=${encodeURIComponent(provider)}`, `limit=${limit}`];
    const query = sanitizeString(options.q || '').slice(0, 256);
    if (query) parameters.push(`q=${encodeURIComponent(query)}`);
    const conversation = safeIdentifier(options.conversation || options.conversationId);
    if (conversation) parameters.push(`conversation=${encodeURIComponent(conversation)}`);
    const before = encodedCursor(options.before);
    if (before) parameters.push(`before=${encodeURIComponent(before)}`);
    const types = selectedTypes(options.types, 'chat');
    if (types.length) parameters.push(`types=${encodeURIComponent(types.join(','))}`);
    const response = await fetch(`${CHATS_ENDPOINT}?${parameters.join('&')}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response?.ok) throw readFailure(response);
    const body = await response.json();
    return Object.freeze({
      available: true,
      temporaryConversation,
      records: serverRecords(body?.records, 'chat', limit),
      next: serverCursor(body?.next)
    });
  }

  async function context(options = {}) {
    const limit = Math.max(1, Math.min(100, Math.floor(Number(options.limit) || 24)));
    const provider = safeProvider(options.provider);
    const parameters = [`provider=${encodeURIComponent(provider)}`, `limit=${limit}`];
    const query = sanitizeString(options.q || '').slice(0, 256);
    if (query) parameters.push(`q=${encodeURIComponent(query)}`);
    const requestedTypes = (Array.isArray(options.types) ? options.types : [])
      .map((value) => String(value || '').trim())
      .filter((value) => Object.values(ALLOWED_TYPES).some((allowed) => allowed.has(value)))
      .slice(0, 24);
    if (requestedTypes.length) parameters.push(`types=${encodeURIComponent(requestedTypes.join(','))}`);
    const response = await fetch(`${CONTEXT_ENDPOINT}?${parameters.join('&')}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response?.ok) throw readFailure(response);
    const body = await response.json();
    return Object.freeze({
      available: true,
      temporaryConversation,
      chats: serverRecords(body?.chats, 'chat', limit),
      operations: serverRecords(body?.operations, 'operation', limit),
      knowledge: serverRecords(body?.knowledge, 'knowledge', limit)
    });
  }

  async function forget(options = {}) {
    const provider = safeProvider(options.provider);
    const stream = String(options.stream || '').trim().toLowerCase();
    if (!Object.hasOwn(ALLOWED_TYPES, stream)) throw new TypeError('Invalid local memory stream');
    const eventIds = (Array.isArray(options.eventIds) ? options.eventIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value))
      .slice(0, 100);
    const conversationId = safeIdentifier(options.conversationId);
    const operationId = safeIdentifier(options.operationId);
    const types = selectedTypes(options.types, stream);
    const occurredBefore = exactTimestamp(options.occurredBefore);
    const entireScope = options.entireScope === true;
    if (!eventIds.length && !conversationId && !operationId && !types.length && !occurredBefore && !entireScope) {
      throw new TypeError('Local memory forget selector is required');
    }
    const body = {
      provider,
      stream,
      ...(eventIds.length ? { eventIds } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(operationId ? { operationId } : {}),
      ...(types.length ? { types } : {}),
      ...(occurredBefore ? { occurredBefore } : {}),
      ...(entireScope ? { entireScope: true } : {})
    };
    const response = await fetch(FORGET_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response?.ok) throw readFailure(response, 'LOCAL_MEMORY_FORGET_FAILED');
    const result = await response.json();
    return Object.freeze({ count: Math.max(0, Math.floor(Number(result?.count) || 0)) });
  }

  function setTemporaryConversation(enabled) {
    temporaryConversation = enabled === true;
    scheduleFlush(0);
    try {
      global.dispatchEvent?.(new global.CustomEvent('fe-local-memory-temporary-conversation', {
        detail: Object.freeze({ enabled: temporaryConversation })
      }));
    } catch (_) {}
    publishHealth();
    return temporaryConversation;
  }

  function isTemporaryConversation() {
    return temporaryConversation;
  }

  document?.addEventListener?.('visibilitychange', () => {
    if (document.hidden || document.visibilityState === 'hidden') {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = 0;
      }
      void flushQueue({ keepalive: true });
    }
  });
  global.addEventListener?.('pagehide', () => { void flushQueue({ keepalive: true }); });
  global.addEventListener?.('beforeunload', () => { void flushQueue({ keepalive: true }); });

  global.FeLocalMemory = Object.freeze({
    version: 2,
    append,
    appendBatch,
    chats,
    context,
    vaultHealth,
    forget,
    setTemporaryConversation,
    health: healthSnapshot,
    createId,
    isTemporaryConversation
  });
})(window);
