import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const clientPath = path.join(root, 'web', 'local-memory-client.js');

assert.ok(existsSync(clientPath), 'web/local-memory-client.js is missing');

const clientSource = readFileSync(clientPath, 'utf8');
const petSource = readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const playbackSource = readFileSync(path.join(root, 'web', 'playback-intelligence.js'), 'utf8');
const appSource = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const htmlSource = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

const timerQueue = [];
let nextTimerId = 1;
const timers = new Map();
const documentListeners = new Map();
const windowListeners = new Map();
const requests = [];
let failNextEventWrite = false;
let nextEventStatus = 0;
let omitLastReceiptOnce = false;
const receiptTimestamp = '2026-08-29T04:05:06.789Z';

function setTimeoutFixture(callback, delay = 0) {
  const id = nextTimerId++;
  const record = { id, callback, delay: Number(delay) || 0, cancelled: false };
  timers.set(id, record);
  timerQueue.push(record);
  return id;
}

function clearTimeoutFixture(id) {
  const record = timers.get(id);
  if (record) record.cancelled = true;
  timers.delete(id);
}

async function runNextTimer() {
  while (timerQueue.length) {
    const record = timerQueue.shift();
    if (record.cancelled) continue;
    timers.delete(record.id);
    await record.callback();
    await Promise.resolve();
    return record.delay;
  }
  return null;
}

async function drainTimers(maximum = 20) {
  for (let index = 0; index < maximum && timerQueue.length; index += 1) {
    await runNextTimer();
  }
}

const cryptoFixture = {
  counter: 0,
  randomUUID() {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
};

const documentFixture = {
  hidden: false,
  visibilityState: 'visible',
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(listener);
  }
};

class CustomEventFixture {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const windowFixture = {
  crypto: cryptoFixture,
  TextEncoder,
  CustomEvent: CustomEventFixture,
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(listener);
  },
  dispatchEvent(event) {
    (windowListeners.get(event.type) || []).forEach((listener) => listener(event));
    return true;
  }
};

async function fetchFixture(input, options = {}) {
  const request = {
    input: String(input),
    options: { ...options },
    body: options.body ? JSON.parse(options.body) : null
  };
  requests.push(request);
  if (request.input.startsWith('/api/local-memory/chats?')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          records: [{
            eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            stream: 'chat',
            type: 'chat.message',
            occurredAt: '2026-08-27T03:04:05.678Z',
            recordedAt: '2026-08-27T03:04:06.000Z',
            sourceSequence: 41,
            payload: {
              messageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              conversationId: 'archive-conversation',
              traceId: 'archive-trace',
              turnId: 'archive-turn',
              role: 'assistant',
              text: '这是永久档案中的旧回复',
              source: 'pet-local-model-reply',
              modelOrigin: 'local-custom',
              timeAccuracy: 'exact',
              occurredAt: '2026-08-27T03:04:05.678Z',
              sourceSequence: 41
            }
          }],
          next: {
            occurredAtMillis: 1787809445678,
            recordedAtMillis: 1787809446000,
            sourceSequence: 41,
            eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          }
        };
      }
    };
  }
  if (request.input.startsWith('/api/local-memory/context?')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          chats: [{
            eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            stream: 'chat',
            type: 'chat.message',
            occurredAt: '2026-08-28T03:04:05.678Z',
            recordedAt: '2026-08-28T03:04:06.000Z',
            sourceSequence: 42,
            payload: {
              messageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              conversationId: 'recall-conversation',
              traceId: 'recall-trace',
              turnId: 'recall-turn',
              role: 'user',
              text: '我喜欢夜间听低音音乐',
              source: 'pet-input',
              modelOrigin: 'local-custom',
              timeAccuracy: 'exact',
              occurredAt: '2026-08-28T03:04:05.678Z',
              sourceSequence: 42
            }
          }],
          operations: [],
          knowledge: []
        };
      }
    };
  }
  if (request.input.split('?')[0] === '/api/local-memory/health') {
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, available: true, locked: false, schemaVersion: 1, code: 'LOCAL_MEMORY_OK' };
      }
    };
  }
  if (request.input === '/api/local-memory/forget') {
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, count: 2 }; }
    };
  }
  if (failNextEventWrite && request.input === '/api/local-memory/events') {
    failNextEventWrite = false;
    throw new TypeError('fixture network failure');
  }
  if (nextEventStatus && request.input === '/api/local-memory/events') {
    const status = nextEventStatus;
    nextEventStatus = 0;
    return { ok: false, status, async json() { return {}; } };
  }
  const events = request.body?.events || (request.body?.event ? [request.body.event] : []);
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        results: (omitLastReceiptOnce ? events.slice(0, -1) : events).map((event) => ({
          eventId: event.eventId,
          duplicate: false,
          recordedAt: receiptTimestamp
        }))
      };
    }
  };
}

const context = vm.createContext({
  AbortController,
  CustomEvent: CustomEventFixture,
  Date,
  JSON,
  Math,
  Object,
  Promise,
  Set,
  Map,
  Array,
  Number,
  String,
  Boolean,
  RegExp,
  TypeError,
  TextEncoder,
  console,
  crypto: cryptoFixture,
  document: documentFixture,
  fetch: fetchFixture,
  setTimeout: setTimeoutFixture,
  clearTimeout: clearTimeoutFixture,
  window: windowFixture
});
vm.runInContext(clientSource, context, { filename: 'web/local-memory-client.js' });

const memory = windowFixture.FeLocalMemory;
for (const method of ['append', 'appendBatch', 'chats', 'context', 'vaultHealth', 'forget', 'setTemporaryConversation', 'health']) {
  assert.equal(typeof memory?.[method], 'function', `FeLocalMemory.${method} is missing`);
}

const ids = {
  messageId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conversation-fixture',
  traceId: 'trace-fixture',
  turnId: 'turn-fixture'
};
const occurredAt = '2026-08-29T01:02:03.456Z';
const conversationStartedAt = '2026-08-29T01:00:00.000Z';
const chatHandle = memory.append({
  provider: 'qq',
  stream: 'chat',
  type: 'chat.message',
  eventId: ids.messageId,
  occurredAt,
  payload: {
    ...ids,
    conversationStartedAt,
    role: 'user',
    text: '请记住这条精确时间的消息',
    source: 'pet-text',
    modelOrigin: 'local-custom',
    timeAccuracy: 'exact'
  }
});
assert.equal(chatHandle?.eventId, ids.messageId, 'chat append did not retain its stable message/event UUID');
assert.equal(memory.health().queued, 1, 'chat append did not enter the short durable queue');
await runNextTimer();

assert.equal(requests.length, 1, 'the short flush timer did not publish the queued event');
assert.equal(requests[0].input, '/api/local-memory/events');
assert.equal(requests[0].body.provider, 'qq', 'the provider hint was not kept outside the event DTO');
assert.equal(requests[0].body.scope, undefined, 'browser ingress selected an internal scope');
assert.equal(requests[0].body.feId, undefined, 'browser ingress selected a FEID');
assert.equal(requests[0].body.events.length, 1);
const storedChat = requests[0].body.events[0];
assert.equal(storedChat.eventId, ids.messageId);
assert.equal(storedChat.payload.messageId, ids.messageId, 'chat eventId must equal messageId');
assert.equal(storedChat.occurredAt, occurredAt, 'the source occurrence timestamp was rewritten');
assert.equal(storedChat.payload.occurredAt, occurredAt, 'payload and event occurrence timestamps diverged');
assert.ok(Number.isSafeInteger(storedChat.sourceSequence) && storedChat.sourceSequence > 0);
assert.equal(storedChat.payload.sourceSequence, storedChat.sourceSequence);
assert.equal(storedChat.payload.conversationId, ids.conversationId);
assert.equal(storedChat.payload.conversationStartedAt, conversationStartedAt,
  'the permanent conversation start timestamp was dropped or rewritten');
assert.equal(storedChat.payload.traceId, ids.traceId);
assert.equal(storedChat.payload.turnId, ids.turnId);
assert.equal(storedChat.payload.modelOrigin, 'local-custom');
const chatReceipt = await chatHandle.receipt;
assert.equal(chatReceipt.recordedAt, receiptTimestamp, 'the vault-owned receipt timestamp was not retained');
assert.equal(memory.health().lastRecordedAt, receiptTimestamp);

failNextEventWrite = true;
const retryHandle = memory.append({
  provider: 'netease',
  stream: 'operation',
  type: 'command.started',
  occurredAt: '2026-08-29T01:03:00.000Z',
  payload: {
    operationId: 'operation-stable-retry',
    traceId: 'trace-stable-retry',
    turnId: 'turn-stable-retry',
    causedByMessageId: ids.messageId,
    actor: 'server-ai',
    modelOrigin: 'server-community',
    phase: 'start',
    status: 'running',
    commandId: 'scene.preset.set',
    commandManifestRevision: 'sha256:fixture',
    arguments: {
      preset: '遇E',
      url: 'https://signed.invalid/asset?token=secret',
      downloadPath: 'C:\\Users\\fixture\\secret.glb',
      authorization: 'Bearer fixture-secret',
      safeNestedValue: true
    }
  }
});
await runNextTimer();
const failedRequest = requests.at(-1);
assert.equal(memory.health().queued, 1, 'failed events were not retained for retry');
const retryTimerDelay = await runNextTimer();
assert.equal(retryTimerDelay, 250, 'the first retry did not use the bounded retry backoff');
const retriedRequest = requests.at(-1);
assert.equal(
  failedRequest.body.events[0].eventId,
  retriedRequest.body.events[0].eventId,
  'retry replaced the stable idempotency UUID'
);
assert.equal(retryHandle.eventId, retriedRequest.body.events[0].eventId);
const serializedRetry = JSON.stringify(retriedRequest.body);
assert.doesNotMatch(serializedRetry, /signed\.invalid|fixture-secret|C:\\\\Users/i,
  'URL, path, or credential material reached the durable API');
assert.equal(retriedRequest.body.events[0].payload.arguments.safeNestedValue, true);
await retryHandle.receipt;
assert.ok(memory.health().retryDelayMs <= 5_000, 'retry backoff is not capped');

const oversizedCorrelation = memory.append({
  provider: 'netease',
  stream: 'operation',
  type: 'playback.started',
  payload: {
    operationId: `o${'x'.repeat(128)}`,
    traceId: 'bounded-trace',
    actor: 'app',
    phase: 'start',
    status: 'running',
    providerId: 'netease',
    songId: 'song-1',
    action: 'start'
  }
});
assert.equal(oversizedCorrelation.accepted, false,
  'the browser accepted a correlation id that the Java vault must reject');

const requestCountBeforeBatch = requests.length;
const batchHandles = memory.appendBatch([
  {
    provider: 'netease', stream: 'operation', type: 'playback.started',
    payload: {
      operationId: 'playback-start-fixture', traceId: 'playback-trace-fixture', actor: 'app',
      phase: 'start', status: 'running', providerId: 'netease', songId: 'song-1',
      title: 'Signal', artist: 'FE', action: 'start', positionMs: 0, durationMs: 180000
    }
  },
  {
    provider: 'netease', stream: 'operation', type: 'playback.completed',
    payload: {
      operationId: 'playback-complete-fixture', traceId: 'playback-trace-fixture', actor: 'app',
      phase: 'complete', status: 'succeeded', providerId: 'netease', songId: 'song-1',
      title: 'Signal', artist: 'FE', action: 'complete', positionMs: 180000, durationMs: 180000
    }
  }
]);
assert.equal(batchHandles.length, 2);
await runNextTimer();
assert.equal(requests.length, requestCountBeforeBatch + 1, 'appendBatch flushed from a render/audio loop or split one provider batch');
assert.equal(requests.at(-1).body.events.length, 2);

omitLastReceiptOnce = true;
const acceptedBeforeIncompleteReceipt = memory.health().accepted;
const incompleteReceiptHandles = memory.appendBatch([
  {
    provider: 'netease', stream: 'operation', type: 'scene.preset_saved',
    payload: {
      operationId: 'scene-atomic-receipt-1', traceId: 'scene-atomic-trace', actor: 'user',
      phase: 'complete', status: 'succeeded', presetId: 'meeting-e-1', action: 'save'
    }
  },
  {
    provider: 'netease', stream: 'operation', type: 'scene.preset_applied',
    payload: {
      operationId: 'scene-atomic-receipt-2', traceId: 'scene-atomic-trace', actor: 'user',
      phase: 'complete', status: 'succeeded', presetId: 'meeting-e-2', action: 'apply'
    }
  }
]);
await runNextTimer();
omitLastReceiptOnce = false;
assert.equal(memory.health().queued, 2, 'an incomplete batch receipt did not requeue the whole batch atomically');
assert.equal(memory.health().accepted, acceptedBeforeIncompleteReceipt,
  'an incomplete batch receipt partially advanced accepted counters');
await runNextTimer();
await Promise.all(incompleteReceiptHandles.map((handle) => handle.receipt));
assert.equal(memory.health().accepted, acceptedBeforeIncompleteReceipt + 2,
  'the retried atomic receipt batch was not accepted exactly once');

const durableBeforeTemporary = memory.append({
  provider: 'netease',
  stream: 'operation',
  type: 'scene.preset_applied',
  payload: {
    operationId: 'scene-before-temporary', traceId: 'scene-before-temporary-trace', actor: 'user',
    phase: 'complete', status: 'succeeded', presetId: 'meeting-e', action: 'apply'
  }
});
const requestCountBeforeDurableTemporaryBoundary = requests.length;
memory.setTemporaryConversation(true);
await runNextTimer();
assert.equal(requests.length, requestCountBeforeDurableTemporaryBoundary + 1,
  'enabling a temporary conversation stranded an earlier durable event');
await durableBeforeTemporary.receipt;
const temporaryHandle = memory.append({
  provider: 'netease',
  stream: 'chat',
  type: 'chat.message',
  payload: {
    conversationId: 'temporary-conversation', traceId: 'temporary-trace', turnId: 'temporary-turn',
    role: 'user', text: '这句话来自临时会话，不能永久保存', source: 'pet-text', modelOrigin: 'local-custom',
    timeAccuracy: 'exact'
  }
});
assert.equal(temporaryHandle?.suppressed, true, 'temporary conversation entered the durable queue');
assert.equal(temporaryHandle?.accepted, false, 'temporary conversation reported a durable acceptance');
const requestCountAfterTemporaryAppend = requests.length;
await drainTimers();
assert.equal(requests.length, requestCountAfterTemporaryAppend,
  'temporary conversation called the encrypted local-memory API');
assert.equal((await temporaryHandle.receipt).suppressed, true,
  'temporary conversation receipt did not disclose suppression');
assert.equal(memory.health().temporaryConversation, true);
memory.setTemporaryConversation(false);

const unicodeHandle = memory.append({
  provider: 'netease',
  stream: 'chat',
  type: 'chat.message',
  payload: {
    conversationId: 'unicode-byte-boundary', traceId: 'unicode-byte-trace', turnId: 'unicode-byte-turn',
    role: 'user', text: '你'.repeat(20_000), source: 'pet-text', modelOrigin: 'local-custom',
    timeAccuracy: 'exact'
  }
});
await runNextTimer();
const unicodeStoredText = requests.at(-1).body.events[0].payload.text;
assert.ok(new TextEncoder().encode(unicodeStoredText).length <= 32_768,
  'browser text truncation exceeded the Java UTF-8 byte limit');
await unicodeHandle.receipt;

nextEventStatus = 400;
const permanentlyRejectedHandle = memory.append({
  provider: 'netease', stream: 'operation', type: 'playback.started',
  payload: {
    operationId: 'permanent-rejection', traceId: 'permanent-rejection-trace', actor: 'app',
    phase: 'start', status: 'running', providerId: 'netease', songId: 'song-rejected', action: 'start'
  }
});
await runNextTimer();
const permanentReceipt = await permanentlyRejectedHandle.receipt;
assert.equal(permanentReceipt.accepted, false, 'a permanent 4xx response was reported as durable');
assert.equal(permanentReceipt.code, 'LOCAL_MEMORY_REQUEST_REJECTED');
assert.equal(memory.health().queued, 0, 'a permanent 4xx response poisoned the retry queue');

const recalled = await memory.context({ provider: 'qq', limit: 12 });
assert.equal(recalled.available, true, 'the browser client did not expose the readable encrypted vault');
assert.equal(recalled.chats.length, 1, 'the encrypted chat recall was not returned');
assert.equal(recalled.chats[0].payload.text, '我喜欢夜间听低音音乐');
assert.match(requests.at(-1).input, /^\/api\/local-memory\/context\?provider=qq&limit=12$/,
  'the recall client selected identity fields or an unbounded query');
const vaultHealth = await memory.vaultHealth();
assert.equal(vaultHealth.available, true, 'vault health was not read from the Java service');
assert.equal(vaultHealth.schemaVersion, 1);
await memory.vaultHealth({ provider: 'qq' });
assert.equal(requests.at(-1).input, '/api/local-memory/health?provider=qq',
  'health must inspect the active provider account, not a different open vault');
const forgotten = await memory.forget({
  provider: 'qq',
  stream: 'chat',
  eventIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  conversationId: 'recall-conversation'
});
assert.deepEqual(JSON.parse(JSON.stringify(forgotten)), { count: 2 });
assert.equal(requests.at(-1).input, '/api/local-memory/forget');
assert.deepEqual(requests.at(-1).body, {
  provider: 'qq',
  stream: 'chat',
  eventIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  conversationId: 'recall-conversation'
});
const archivePage = await memory.chats({ provider: 'qq', limit: 100, types: ['chat.message'] });
assert.equal(archivePage.records.length, 1, 'the permanent chat archive page was not decoded');
assert.equal(archivePage.records[0].payload.text, '这是永久档案中的旧回复');
assert.equal(archivePage.next?.eventId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'the permanent chat archive cursor was not retained for pagination');
assert.match(requests.at(-1).input, /^\/api\/local-memory\/chats\?provider=qq&limit=100&types=chat\.message$/,
  'the permanent chat archive query selected identity fields or omitted its type boundary');

memory.setTemporaryConversation(true);
const temporaryRecall = await memory.context({ provider: 'qq', limit: 12 });
assert.equal(temporaryRecall.temporaryConversation, true,
  'temporary conversation state was not retained as presentation metadata');
assert.equal(temporaryRecall.chats.length, 1,
  'temporary conversation hid encrypted chat history instead of recalling it');
memory.setTemporaryConversation(false);

assert.doesNotMatch(clientSource, /localStorage\s*\./,
  'the durable queue itself must not persist plaintext events in localStorage');
assert.doesNotMatch(clientSource, /requestAnimationFrame\s*\(|setInterval\s*\(/,
  'memory batching must stay out of render and audio frame loops');

const requiredLifecycleTypes = [
  'command.requested',
  'command.confirmed',
  'command.started',
  'command.succeeded',
  'command.failed',
  'command.cancelled',
  'command.reverted'
];
for (const type of requiredLifecycleTypes) {
  assert.ok(petSource.includes(type), `pet command audit is missing ${type}`);
}
assert.match(petSource, /modelOrigin[\s\S]{0,240}(?:local-custom|PET_MODEL_SOURCE_LOCAL)/,
  'local model chat provenance is not recorded');
assert.match(petSource, /modelOrigin[\s\S]{0,240}(?:server-community|PET_MODEL_SOURCE_SERVER)/,
  'server model chat provenance is not recorded');
assert.match(petSource, /temporaryConversation|isTemporaryConversation|temporary-conversation/,
  'pet does not expose temporary conversation state');
assert.match(clientSource, /function append\(input\)\s*\{\s*if\s*\(temporaryConversation\)\s*return suppressedHandle\(\)/,
  'temporary conversation is not suppressed at the single durable ingress boundary');
const temporaryStateSource = petSource.slice(
  petSource.indexOf('function applyPetTemporaryConversationState('),
  petSource.indexOf('\n  function setPetTemporaryConversation(', petSource.indexOf('function applyPetTemporaryConversationState('))
);
assert.match(temporaryStateSource, /pet\.messages\s*=\s*normalizeStoredMessages\(pet\.temporaryConversationBaseline\)/,
  'ending a temporary conversation does not discard its in-memory messages');
const createMessageSource = petSource.slice(
  petSource.indexOf('function createMessage('),
  petSource.indexOf('\n  function appendMessage(', petSource.indexOf('function createMessage('))
);
assert.doesNotMatch(createMessageSource, /elements\.messages\.textContent\s*=\s*['"]["']/,
  'rendering a new pet message still erases the earlier conversation');
const restoreMessagesSource = petSource.slice(
  petSource.indexOf('function restoreMessages('),
  petSource.indexOf('\n  function setInterim(', petSource.indexOf('function restoreMessages('))
);
assert.match(restoreMessagesSource, /pet\.messages\s*=\s*normalizeStoredMessages\(combined\)/,
  'encrypted history is rendered but not restored into model-visible history');
assert.match(restoreMessagesSource, /forEach|for\s*\(/,
  'pet conversation restore still renders only the final message');
assert.match(petSource, /occurredAt:\s*(?:message\.occurredAt|occurredAt)/,
  'visible pet chat entries do not retain their exact occurrence time');
assert.match(petSource, /restoreEncryptedChatHistory\(\)/,
  'the visible conversation never reloads the encrypted permanent chat archive');
assert.match(petSource, /memoryConversationId:\s*petMemoryCorrelationId\(persisted\.memoryConversationId\)/,
  'the durable pet conversation id is not restored across page or app restarts');
assert.match(petSource, /memoryConversationStartedAt:\s*exactPetMessageTime\(persisted\.memoryConversationStartedAt\)/,
  'the durable pet conversation start time is not restored across page or app restarts');
const persistStateSource = petSource.slice(
  petSource.indexOf('function persistState('),
  petSource.indexOf('\n  function initializeVoiceSettingsDisclosure(', petSource.indexOf('function persistState('))
);
assert.match(persistStateSource, /petMemoryTemporaryConversation\(\)[\s\S]{0,240}temporaryConversationBaseline/,
  'temporary messages can still enter the localStorage history projection');
assert.match(persistStateSource, /memoryConversationId:\s*pet\.memoryConversationId/,
  'the pet conversation id is not persisted with the local client session');
assert.match(persistStateSource, /memoryConversationStartedAt:\s*pet\.memoryConversationStartedAt/,
  'the pet conversation start time is not persisted with the local client session');
const ensureMemoryConversationSource = petSource.slice(
  petSource.indexOf('function ensurePetMemoryConversation('),
  petSource.indexOf('\n  function newPetMemoryTurn(', petSource.indexOf('function ensurePetMemoryConversation('))
);
assert.match(ensureMemoryConversationSource, /persistState\(\)/,
  'a newly-created durable pet conversation is not saved immediately');
const appendMessageSource = petSource.slice(
  petSource.indexOf('function appendMessage('),
  petSource.indexOf('\n  function notePetUserInteraction(', petSource.indexOf('function appendMessage('))
);
assert.match(appendMessageSource, /message\.memoryRecord\s*=\s*memoryRecord/,
  'the visible pet message does not retain its encrypted-vault write receipt');
const recordPetChatMessageSource = petSource.slice(
  petSource.indexOf('function recordPetChatMessage('),
  petSource.indexOf('\n  const PET_MEMORY_COMMAND_TYPES', petSource.indexOf('function recordPetChatMessage('))
);
assert.match(recordPetChatMessageSource, /FeMonsterPetPreferenceMemory[\s\S]{0,500}observeChat/,
  'durable user chat never reaches the encrypted preference learner');
const sendTextSource = petSource.slice(
  petSource.indexOf('async function sendText('),
  petSource.indexOf('\n  function petEventPayload(', petSource.indexOf('async function sendText('))
);
assert.match(sendTextSource, /await\s+awaitPetMemoryWrite\(/,
  'the pet starts inference before the user message receives a durable-memory receipt');
assert.match(petSource, /dataset\.memoryStatus\s*=\s*['"]recorded['"]/,
  'the pet never marks a chat message as durably recorded after the vault receipt');
assert.match(petSource, /function adoptPetMemoryConversationFromArchive[\s\S]{0,1800}persistState\(\)/,
  'the durable conversation identity cannot recover from the encrypted chat archive');
assert.match(petSource, /conversationStartedAt:\s*turn\.conversationStartedAt/,
  'chat records do not carry the durable conversation start time');
assert.match(clientSource, /CHAT_FIELDS[\s\S]{0,240}conversationStartedAt/,
  'the browser memory ingress drops durable conversation start time');
assert.match(petSource, /channel:\s*'pet-voice',[\s\S]{0,100}recordMemory:\s*false/,
  'partial voice-recognition chunks can be duplicated into durable chat memory');
assert.match(petSource, /function\s+petMemoryCorrelationId[\s\S]{0,900}slice\(0,\s*112\)/,
  'pet command operation ids are not normalized to the Java correlation boundary');
assert.ok((petSource.match(/importLegacyPetMemorySnapshot\(\)/g) || []).length >= 2,
  'legacy visible chat history is not imported once into the encrypted vault');
assert.match(petSource, /localStorage\.setItem\(STORAGE_KEY/,
  'the existing visible-history localStorage behavior was replaced instead of guarded');

for (const [notification, durableType] of [
  ['track-start', 'playback.started'],
  ['track-complete', 'playback.completed'],
  ['track-skip', 'playback.skipped'],
  ['track-replay', 'playback.replayed']
]) {
  assert.ok(playbackSource.includes(notification), `playback notify no longer handles ${notification}`);
  assert.ok(playbackSource.includes(durableType), `playback durable mapping is missing ${durableType}`);
}
assert.doesNotMatch(playbackSource, /(?:append|appendBatch)\s*\([^)]*progress/s,
  'high-frequency progress reached durable memory');

for (const type of [
  'library.playlist_snapshot',
  'library.favorite_changed',
  'scene.preset_saved',
  'scene.preset_applied'
]) {
  assert.ok(appSource.includes(type), `app success boundary is missing ${type}`);
}
assert.ok(
  htmlSource.indexOf('local-memory-client.js') >= 0
    && htmlSource.indexOf('local-memory-client.js') < htmlSource.indexOf('playback-intelligence.js')
    && htmlSource.indexOf('local-memory-client.js') < htmlSource.indexOf('app.js?v='),
  'local memory client must load before playback and app event producers'
);

console.log(JSON.stringify({
  ok: true,
  stableIdsAcrossRetry: true,
  exactOccurrenceTime: true,
  vaultReceiptTime: receiptTimestamp,
  separateStreams: ['chat', 'operation', 'knowledge'],
  temporaryConversationDurable: false,
  highFrequencyProgressExcluded: true
}, null, 2));
