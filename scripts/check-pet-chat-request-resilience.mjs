import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/pet-assistant.js', import.meta.url), 'utf8');

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const start = markers.map((marker) => source.indexOf(marker)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  assert.notEqual(start, undefined, `pet-assistant.js must define ${name}()`);
  const nextFunction = /\n\s{2}(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(source);
  return source.slice(start, next ? next.index + 1 : source.length);
}

const delays = [];
let uuidSequence = 0;
const persisted = [];
const proxyResponses = [];
let proxyFetchCalls = 0;
const context = vm.createContext({
  AbortController,
  Date,
  Math,
  PET_CHAT_RETRY_DELAYS: Object.freeze([250, 750, 1600]),
  PET_CHAT_PENDING_MAX_AGE_MS: 10 * 60 * 1000,
  crypto: {
    randomUUID() {
      uuidSequence += 1;
      return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, '0')}`;
    }
  },
  boundedString(value, limit, fallback = '') {
    const text = String(value ?? '').trim();
    return (text || fallback).slice(0, limit);
  },
  provider: () => 'netease',
  accountSessionScope: () => 'netease:10000001',
  pet: {
    sessionScope: 'netease:10000001',
    pendingChatRequest: null,
    cancelledLiveRequestIds: new Set(),
    requestId: ''
  },
  fetch: async () => {
    proxyFetchCalls += 1;
    const next = proxyResponses.shift() || { status: 200, body: { ok: true } };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      async text() { return JSON.stringify(next.body); }
    };
  },
  markTransportOnline() {},
  window: {
    setTimeout() { return 1; },
    clearTimeout() {}
  },
  persistState() {
    persisted.push(JSON.parse(JSON.stringify(context.pet.pendingChatRequest)));
  },
  waitForPetChatRetry(delay) {
    delays.push(delay);
    return Promise.resolve();
  }
});

vm.runInContext([
  topLevelFunction('requestJson'),
  topLevelFunction('petChatTextFingerprint'),
  topLevelFunction('newPetChatRequestId'),
  topLevelFunction('normalizePendingChatRequest'),
  topLevelFunction('beginPendingChatRequest'),
  topLevelFunction('clearPendingChatRequest'),
  topLevelFunction('petChatRetryableError'),
  topLevelFunction('petChatCancelledError'),
  topLevelFunction('retryPetChatRequest')
].join('\n'), context);

const firstPending = context.beginPendingChatRequest('同一条消息', 'session-a');
const repeatedPending = context.beginPendingChatRequest('同一条消息', 'session-a');
assert.equal(firstPending.requestId, repeatedPending.requestId, 'manual recovery must reuse the persisted request ID');
assert.equal(context.pet.requestId, firstPending.requestId, 'the provisional ID must become current before the network request');
assert.equal(persisted[0].requestId, firstPending.requestId, 'the stable request ID must be persisted before fetch');
assert.equal(Object.hasOwn(persisted[0], 'text'), false, 'pending persistence must not store private chat text');

const isolatedPending = context.beginPendingChatRequest('同一条消息', 'session-b');
assert.notEqual(isolatedPending.requestId, firstPending.requestId, 'session switching must isolate idempotency identities');
context.pet.sessionScope = 'netease:10000002';
const accountPending = context.beginPendingChatRequest('同一条消息', 'session-b');
assert.notEqual(accountPending.requestId, isolatedPending.requestId, 'account switching must isolate idempotency identities');

assert.equal(context.petChatRetryableError(Object.assign(new Error('network'), { status: 0 })), true);
assert.equal(context.petChatRetryableError(Object.assign(new Error('unavailable'), { status: 503 })), true);
for (const status of [400, 401, 403, 409]) {
  assert.equal(
    context.petChatRetryableError(Object.assign(new Error(`status ${status}`), { status })),
    false,
    `${status} must not be blindly retried`
  );
}
for (const status of [408, 425, 429, 500, 503]) {
  assert.equal(
    context.petChatRetryableError(Object.assign(new Error(`status ${status}`), { status })),
    true,
    `${status} must use the bounded same-request retry path`
  );
}

const stableIds = [];
let attempt = 0;
const recovered = await context.retryPetChatRequest(async (requestId) => {
  stableIds.push(requestId);
  attempt += 1;
  if (attempt === 1) throw new TypeError('socket reset');
  if (attempt === 2) throw Object.assign(new Error('temporary upstream failure'), { status: 503 });
  return { ok: true, requestId };
}, 'pet-chat-stable-1');
assert.equal(recovered.ok, true);
assert.deepEqual(stableIds, ['pet-chat-stable-1', 'pet-chat-stable-1', 'pet-chat-stable-1']);
assert.deepEqual(delays, [250, 750], 'transient retries must use the finite deterministic backoff schedule');

let conflicts = 0;
await assert.rejects(
  context.retryPetChatRequest(async () => {
    conflicts += 1;
    throw Object.assign(new Error('conflict'), { status: 409 });
  }, 'pet-chat-conflict'),
  /conflict/
);
assert.equal(conflicts, 1, '409 must stop after one request');

let cancelled = false;
let cancelledAttempts = 0;
await assert.rejects(
  context.retryPetChatRequest(async () => {
    cancelledAttempts += 1;
    throw new TypeError('offline');
  }, 'pet-chat-cancelled', {
    cancelled: () => cancelled,
    wait: async () => { cancelled = true; }
  }),
  (error) => error?.code === 'FE_PET_CHAT_CANCELLED'
);
assert.equal(cancelledAttempts, 1, 'an explicitly cancelled request must never be replayed');

proxyResponses.push(
  {
    status: 200,
    body: {
      ok: false,
      error: 'temporary upstream failure',
      upstreamStatus: 503,
      retryable: true,
      errorClass: 'upstream-transient'
    }
  },
  { status: 200, body: { ok: true, requestId: 'pet-chat-proxy-503' } }
);
const proxyStableIds = [];
const proxyDelayStart = delays.length;
const proxyRecovered = await context.retryPetChatRequest(async (requestId) => {
  proxyStableIds.push(requestId);
  return context.requestJson('/api/community/pet/chat', { method: 'POST', body: '{}' });
}, 'pet-chat-proxy-503');
assert.equal(proxyRecovered.ok, true, 'a locally proxied upstream 503 must recover');
assert.deepEqual(proxyStableIds, ['pet-chat-proxy-503', 'pet-chat-proxy-503'],
  'the installed proxy retry must preserve the exact request ID');
assert.deepEqual(delays.slice(proxyDelayStart), [250], 'the installed proxy 503 must use one bounded retry delay');

proxyResponses.push({
  status: 200,
  body: {
    ok: false,
    error: 'invalid request',
    upstreamStatus: 400,
    retryable: false,
    errorClass: 'upstream-business'
  }
});
const callsBeforeBusinessError = proxyFetchCalls;
await assert.rejects(
  context.retryPetChatRequest(
    () => context.requestJson('/api/community/pet/chat', { method: 'POST', body: '{}' }),
    'pet-chat-proxy-400'
  ),
  (error) => error?.status === 400 && error?.retryable === false
);
assert.equal(proxyFetchCalls - callsBeforeBusinessError, 1,
  'a locally proxied upstream 400 must not be blindly retried');

const requestPetChat = topLevelFunction('requestPetChat');
assert.match(requestPetChat, /requestId/, 'chat payload must include its client-generated request ID');
assert.match(requestPetChat, /retryPetChatRequest/, 'chat mutations must pass through the bounded idempotent retry policy');

console.log('Pet chat request resilience tests passed.');
