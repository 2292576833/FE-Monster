import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const apiRoutesSource = fs.readFileSync(
  new URL('../src/main/java/com/femonster/api/ApiRoutes.java', import.meta.url),
  'utf8'
);
const communityServiceSource = fs.readFileSync(
  new URL('../src/community-proprietary/java/com/femonster/core/CommunityService.java', import.meta.url),
  'utf8'
);

assert.match(
  apiRoutesSource,
  /eventStream\(\s*HttpUtil\.param\(query,\s*"feId",\s*""\),\s*HttpUtil\.param\(query,\s*"after",\s*""\),\s*HttpUtil\.param\(query,\s*"streamRole",\s*"browser"\)/s,
  'the Java SSE route must forward the browser reconnect cursor and bounded stream role'
);
assert.match(
  communityServiceSource,
  /if \(after != null && !after\.isBlank\(\)\)\s*\{\s*path\.append\("&after="\)\.append\(encode\(after\)\)/s,
  'the Java community transport must forward the reconnect cursor to the community server'
);
assert.match(
  communityServiceSource,
  /append\("&streamRole="\)\.append\(encode\(normalizeEventStreamRole\(streamRole\)\)\)/,
  'the Java community transport must forward a normalized stream role to the community server'
);

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const start = markers
    .map((marker) => appSource.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.notEqual(start, undefined, `web/app.js must define ${name}()`);

  const nextFunction = /\n(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(appSource);
  return appSource.slice(start, next ? next.index + 1 : appSource.length);
}

const bubbles = [];
const relays = [];
const streamStates = [];
const broadcasts = [];
const toasts = [];
const petEvents = [];
const storage = new Map();
const timers = new Map();
let nextTimerId = 1;
const eventSourceUrls = [];
const eventSources = [];
let clientMode = 'embedded';
const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.5;
class TestEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = new Map();
    eventSourceUrls.push(url);
    eventSources.push(this);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  close() {
    this.closed = true;
  }
}
const context = vm.createContext({
  Date,
  JSON,
  Math: deterministicMath,
  Set,
  String,
  COMMUNITY_HISTORY_LEDGER_KEY: 'test-community-history-ledger',
  COMMUNITY_HISTORY_IDENTITY_LIMIT: 6,
  COMMUNITY_HISTORY_SEEN_LIMIT: 512,
  safeText(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
  },
  query(params) {
    return new URLSearchParams(params).toString();
  },
  state: {
    community: {
      profile: { feId: '10000001' },
      serverUrl: 'https://community.example',
      eventCursor: '',
      eventSource: null,
      eventKey: 'https://community.example|10000001|embedded',
      eventReconnectTimer: 0,
      eventHeartbeatTimer: 0,
      eventConnected: false,
      eventLastActivityAt: 0,
      eventReconnectDelay: 1200,
      eventReconnectAttempts: 0,
      eventNextRetryAt: 0,
      eventGeneration: 0,
      eventHistoryBefore: 1700000001000,
      eventSeenKeys: new Set(),
      eventSeenKeyOrder: [],
      eventHistoryIdentity: 'https://community.example|10000001|embedded',
      eventHydrationStartedAt: 1700000000000,
      messageBubbleSeenKeys: new Set(),
      messageBubbleSeenOrder: [],
      messageBubbleTimer: 0,
      messageBubbleSeenReady: false,
      messageBubbles: [],
      selectedFriendId: ''
    }
  },
  els: {
    communityMessageDialog: { hidden: true }
  },
  showCommunityMessageBubble(message) {
    bubbles.push(message);
  },
  renderCommunityMessageBubbles() {},
  showCommunityBroadcast(payload, options) {
    broadcasts.push({ payload, options });
  },
  showUpdateDialog() {
    throw new Error('historical updates must not open a dialog');
  },
  refreshCommunityMessages() {
    return Promise.resolve();
  },
  scheduleCommunityRefresh() {},
  scheduleCommunitySceneDisconnectRestore() {},
  clearCommunitySceneDisconnectRestore() {},
  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  },
  refreshCommunityListenState() {
    return Promise.resolve();
  },
  applyCommunityListenSync() {
    return Promise.resolve();
  },
  resetCommunityListenState() {},
  toast(message) {
    toasts.push(message);
  },
  pollCommunityCallSignals() {
    return Promise.resolve();
  },
  window: {
    EventSource: TestEventSource,
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    dispatchEvent(event) {
      if (event?.type === 'fe-monster-community-relay') relays.push(event);
      if (event?.type === 'fe-monster-pet-stream-state') streamStates.push(event.detail);
      if (event?.type === 'fe-monster-pet-event') petEvents.push(event.detail);
    }
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  document: {
    hidden: false,
    documentElement: {
      getAttribute(name) {
        return name === 'data-fe-client' ? clientMode : '';
      }
    }
  },
  navigator: { onLine: true },
  performance: { now: () => 1000 }
});

vm.runInContext(
  [
    topLevelFunction('communityEventIdentityKey'),
    topLevelFunction('communityEventStreamRole'),
    topLevelFunction('communityEventUrl'),
    topLevelFunction('stopCommunityEventStream'),
    topLevelFunction('scheduleCommunityEventReconnect'),
    topLevelFunction('emitPetStreamState'),
    topLevelFunction('restartCommunityEventStreamNow'),
    topLevelFunction('ensureCommunityEventStream'),
    topLevelFunction('communityMessageKey'),
    topLevelFunction('dedupeCommunityMessages'),
    topLevelFunction('normalizeCommunityEventCursor'),
    topLevelFunction('loadCommunityHistoryLedger'),
    topLevelFunction('saveCommunityHistoryLedger'),
    topLevelFunction('restoreCommunityHistoryLedger'),
    topLevelFunction('rememberCommunitySeenKey'),
    topLevelFunction('rememberCommunityMessageKey'),
    topLevelFunction('communityStableJson'),
    topLevelFunction('communityStableHash'),
    topLevelFunction('communityEventTimestamp'),
    topLevelFunction('communityEventKey'),
    topLevelFunction('communityEventIsHistorical'),
    topLevelFunction('advanceCommunityEventCursor'),
    topLevelFunction('communityEventAlreadyHandled'),
    topLevelFunction('handleCommunityServerEvent')
  ].join('\n'),
  context
);

context.restoreCommunityHistoryLedger('https://community.example|10000001|embedded');
context.state.community.eventHistoryBefore = 1700000001000;
assert.equal(
  context.communityEventUrl(),
  '/api/community/events?feId=10000001&streamRole=embedded',
  'a first migration with no persisted cursor must start with the server history boundary'
);
clientMode = 'desktop-scene';
assert.equal(context.communityEventUrl(), '', 'the passive desktop scene must not open a duplicate community stream');
clientMode = 'embedded';

assert.equal(
  context.communityMessageKey({ id: 'server-message-id', text: 'first version' }),
  context.communityMessageKey({ id: 'server-message-id', text: 'changed transport copy' }),
  'server message IDs must be the preferred stable identity'
);
assert.equal(
  context.communityMessageKey({ from: '1', to: '2', sentAt: 100, text: 'legacy' }),
  context.communityMessageKey({ text: 'legacy', sentAt: 100, to: '2', from: '1' }),
  'legacy messages must have a deterministic field-based fallback identity'
);
assert.notEqual(
  context.communityMessageKey({ from: '1', to: '2', sentAt: 100, text: 'legacy' }),
  context.communityMessageKey({ from: '1', to: '2', sentAt: 101, text: 'legacy' }),
  'separate legacy messages must remain distinct when their send time differs'
);
assert.equal(
  context.dedupeCommunityMessages([
    { id: 'server-message-id', text: 'copy one' },
    { id: 'server-message-id', text: 'copy two' },
    { id: 'second-server-message-id', text: 'copy one' }
  ]).length,
  2,
  'history rendering must dedupe transport copies without dropping a different message ID'
);

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '41',
    seq: 41,
    type: 'message.sent',
    createdAt: 1700000000000,
    payload: {
      message: {
        id: 'msg-history-1',
        from: '10000002',
        to: '10000001',
        text: 'old retained message',
        sentAt: 1700000000000
      }
    }
  }),
  lastEventId: '41'
});

assert.equal(
  bubbles.length,
  0,
  'startup history hydration must not replay retained messages as new-message bubbles'
);

const persistedAfterHistory = JSON.parse(storage.get('test-community-history-ledger'));
assert.deepEqual(
  persistedAfterHistory.records[0].messageKeys,
  ['id:msg-history-1'],
  'hydrated server message IDs must be persisted for the next startup'
);
assert.equal(persistedAfterHistory.records[0].cursor, '41', 'the acknowledged history cursor must be persisted');

context.restoreCommunityHistoryLedger('https://community.example|10000001|embedded');
context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '41',
    seq: 41,
    type: 'message.sent',
    createdAt: 1700000000000,
    payload: {
      message: {
        id: 'msg-history-1',
        from: '10000002',
        to: '10000001',
        text: 'old retained message',
        sentAt: 1700000000000
      }
    }
  }),
  lastEventId: '41'
});
assert.equal(bubbles.length, 0, 'the same retained message must stay silent after a full client restart');

context.state.community.eventHistoryBefore = 1700000001000;
context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '42',
    seq: 42,
    type: 'message.sent',
    createdAt: 1700000002000,
    payload: {
      message: {
        id: 'msg-live-1',
        from: '10000002',
        to: '10000001',
        text: 'genuinely new message',
        sentAt: 1700000002000
      }
    }
  }),
  lastEventId: '42'
});
assert.deepEqual(
  bubbles.map((message) => message.id),
  ['msg-live-1'],
  'a genuinely new message after the hydration boundary must still notify'
);

context.state.community.eventCursor = '';
context.state.community.eventHistoryIdentity = '';
context.state.community.eventSeenKeys = new Set();
context.state.community.eventSeenKeyOrder = [];
context.state.community.messageBubbleSeenKeys = new Set();
context.state.community.messageBubbleSeenOrder = [];
context.state.community.messageBubbleSeenReady = true;
context.state.community.messageBubbles = [{ key: 'stale-account-bubble' }];
context.restoreCommunityHistoryLedger('https://community.example|10000001|embedded');
assert.equal(context.state.community.eventCursor, '42', 'a cold start must restore the last acknowledged cursor');
assert.equal(
  context.communityEventUrl(),
  '/api/community/events?feId=10000001&streamRole=embedded&after=42',
  'the first cold-start EventSource URL must skip already acknowledged server history'
);
assert.equal(context.state.community.messageBubbleSeenReady, false, 'cold-start hydration readiness must reset');
assert.equal(context.state.community.messageBubbles.length, 0, 'cold-start hydration must clear stale bubbles');

context.state.community.messageBubbleSeenReady = true;
context.state.community.messageBubbles = [{ key: 'account-a-bubble' }];
context.restoreCommunityHistoryLedger('https://community.example|10000002|embedded');
assert.equal(context.state.community.eventCursor, '', 'an account without a ledger must not inherit another account cursor');
assert.equal(context.state.community.messageBubbleSeenReady, false, 'A to B account switching must restart history hydration');
assert.equal(context.state.community.messageBubbles.length, 0, 'A to B account switching must clear account A bubbles');

context.restoreCommunityHistoryLedger('https://community.example|10000001|embedded');
context.state.community.eventHistoryBefore = 1700000001000;
assert.equal(context.state.community.eventCursor, '42', 'switching back to A must restore only account A cursor');
context.stopCommunityEventStream(true);
assert.equal(context.state.community.eventCursor, '42', 'a temporary stream reset must retain the acknowledged cursor');
context.ensureCommunityEventStream();
assert.equal(
  eventSourceUrls.at(-1),
  '/api/community/events?feId=10000001&streamRole=embedded&after=42',
  'same-account recovery after server failure must reconnect after the retained cursor'
);
context.stopCommunityEventStream(false);

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '43',
    seq: 43,
    type: 'message.sent',
    createdAt: 1700000003000,
    payload: {
      message: {
        id: 'msg-live-1',
        from: '10000002',
        to: '10000001',
        text: 'genuinely new message',
        sentAt: 1700000002000
      }
    }
  }),
  lastEventId: '43'
});
assert.equal(bubbles.length, 1, 'history and realtime copies of one server message ID must dedupe');
assert.equal(
  context.loadCommunityHistoryLedger()
    .find((record) => record.identity === 'https://community.example|10000001|embedded')
    .cursor,
  '43',
  'a duplicate payload with a newer acknowledged seq must still persist the newer cursor'
);

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '44',
    seq: 44,
    type: 'message.sent',
    createdAt: 1700000004000,
    payload: {
      message: {
        id: 'msg-live-2',
        from: '10000002',
        to: '10000001',
        text: 'genuinely new message',
        sentAt: 1700000004000
      }
    }
  }),
  lastEventId: '44'
});
assert.deepEqual(
  bubbles.map((message) => message.id),
  ['msg-live-1', 'msg-live-2'],
  'separate server message IDs must not be suppressed even when their text matches'
);

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '45',
    seq: 45,
    type: 'client.relay',
    createdAt: 1699999999000,
    payload: { relay: { type: 'listen.danmaku', payload: { id: 'old-danmaku', text: 'old' } } }
  }),
  lastEventId: '45'
});
assert.equal(relays.length, 0, 'historical relay events must not retrigger danmaku');

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '46',
    seq: 46,
    type: 'community.broadcast',
    createdAt: 1699999999000,
    payload: { id: 'old-broadcast', title: 'Old announcement' }
  }),
  lastEventId: '46'
});
assert.equal(broadcasts[0].options.unread, false, 'historical broadcasts must not become unread');
assert.equal(broadcasts[0].options.notify, false, 'historical broadcasts must not reopen their toast');

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '47',
    seq: 47,
    type: 'listen.left',
    createdAt: 1699999999000,
    payload: { session: { id: 'old-session' } }
  }),
  lastEventId: '47'
});
assert.equal(toasts.length, 0, 'historical listen events must not retrigger toast side effects');

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '48',
    seq: 48,
    type: 'client.relay',
    createdAt: 1700000005000,
    payload: { relay: { type: 'listen.danmaku', payload: { id: 'new-danmaku', text: 'new' } } }
  }),
  lastEventId: '48'
});
assert.equal(relays.length, 1, 'a genuinely new relay after hydration must still reach danmaku');

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '49',
    seq: 49,
    type: 'pet.ai.state',
    createdAt: 1700000005100,
    payload: { sessionId: 'pet-session-1', requestId: 'pet-request-1', sequence: 1, state: 'thinking' }
  }),
  lastEventId: '49'
});
context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: 'transient-delta-1',
    seq: 0,
    transient: true,
    type: 'pet.ai.delta',
    createdAt: 1700000005200,
    payload: { sessionId: 'pet-session-1', requestId: 'pet-request-1', sequence: 2, delta: 'first token' }
  }),
  // Native EventSource retains the preceding persisted event ID for an SSE
  // frame that intentionally omits `id:`. That inherited cursor must not make
  // this transient model token look like a replay.
  lastEventId: '49'
});
context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: 'transient-audio-1',
    seq: 0,
    transient: true,
    type: 'pet.ai.audio',
    createdAt: 1700000005300,
    payload: {
      sessionId: 'pet-session-1',
      requestId: 'pet-request-1',
      sequence: 3,
      audioId: 'pet-audio-1',
      mime: 'audio/mpeg'
    }
  }),
  lastEventId: '49'
});
assert.deepEqual(
  petEvents.map((event) => event.type),
  ['pet.ai.state', 'pet.ai.delta', 'pet.ai.audio'],
  'transient model and audio chunks must be delivered even when MessageEvent.lastEventId inherits the persisted state cursor'
);
assert.equal(
  context.state.community.eventCursor,
  '49',
  'transient model and audio chunks must not advance or rewind the persisted reconnect cursor'
);

context.handleCommunityServerEvent({
  data: JSON.stringify({
    id: '47-late',
    seq: 47,
    type: 'client.relay',
    createdAt: 1700000006000,
    payload: { relay: { type: 'listen.danmaku', payload: { id: 'late-danmaku', text: 'late' } } }
  }),
  lastEventId: '47'
});
assert.equal(
  relays.length,
  1,
  'an out-of-order event older than the acknowledged cursor must not re-run side effects'
);

const boundedSeen = new Set();
const boundedOrder = [];
for (let index = 0; index <= 512; index += 1) {
  context.rememberCommunitySeenKey(boundedSeen, boundedOrder, `bounded-${index}`, false);
}
assert.equal(boundedSeen.size, 512, 'persisted seen IDs must remain bounded');
assert.equal(boundedSeen.has('bounded-0'), false, 'bounded seen IDs must evict the oldest entry');

for (let index = 0; index < 8; index += 1) {
  context.state.community.eventHistoryIdentity = `https://community-${index}.example|10000001`;
  context.saveCommunityHistoryLedger();
}
assert.equal(
  JSON.parse(storage.get('test-community-history-ledger')).records.length,
  6,
  'persisted history must keep only a bounded number of server/account identities'
);

assert.equal(toasts.length, 0, 'history hydration must not retrigger toast side effects');
context.advanceCommunityEventCursor('12');
context.advanceCommunityEventCursor('not-a-cursor');
assert.equal(context.state.community.eventCursor, '49', 'the reconnect cursor must advance monotonically');
assert.equal(
  context.communityEventUrl(),
  '/api/community/events?feId=10000001&streamRole=embedded&after=49',
  'reconnects must resume after the last monotonic in-session cursor'
);

context.state.community.eventHistoryIdentity = 'https://community.example|10000001|embedded';
context.state.community.eventCursor = '49';
context.state.community.eventGeneration = 0;
context.ensureCommunityEventStream();
const halfOpenSource = eventSources.at(-1);
const streamsBeforeOnline = eventSources.length;
context.restartCommunityEventStreamNow('online');
assert.equal(halfOpenSource.closed, true, 'an online transition must retire a possibly half-open EventSource');
assert.equal(eventSources.length, streamsBeforeOnline + 1, 'an online transition must create exactly one replacement stream');
assert.equal(
  eventSourceUrls.at(-1),
  '/api/community/events?feId=10000001&streamRole=embedded&after=49',
  'online recovery must reuse the same identity and acknowledged cursor'
);

const recoveredSource = eventSources.at(-1);
context.ensureCommunityEventStream();
context.ensureCommunityEventStream();
assert.equal(
  eventSources.at(-1),
  recoveredSource,
  'repeated ensure calls in one connection generation must keep exactly one EventSource'
);

halfOpenSource.listeners.get('error')();
assert.equal(
  eventSources.at(-1),
  recoveredSource,
  'callbacks from a retired EventSource generation must not replace the current connection'
);
assert.equal(timers.size, 0, 'callbacks from a retired EventSource generation must not schedule reconnects');

const firstError = recoveredSource.listeners.get('error');
for (let attempt = 0; attempt < 20; attempt += 1) firstError();
assert.equal(timers.size, 1, 'an error burst from one EventSource generation must schedule only one reconnect');
assert.equal([...timers.values()][0].delay, 1200, 'the first deterministic reconnect delay must use bounded jitter');
assert.equal(context.state.community.eventReconnectDelay, 1740, 'one failed generation must advance backoff only once');
assert.deepEqual(
  JSON.parse(JSON.stringify(streamStates.at(-1))),
  {
    state: 'reconnecting',
    connected: false,
    activityAt: streamStates.at(-1)?.activityAt,
    reason: 'transport-error',
    attempt: 1,
    retryInMs: 1200,
    generation: 2
  },
  'reconnect state must expose reason, attempt, delay, and connection generation'
);

for (let generation = 0; generation < 12; generation += 1) {
  const [timerId, pending] = [...timers.entries()][0];
  timers.delete(timerId);
  pending.callback();
  const failedSource = eventSources.at(-1);
  failedSource.listeners.get('error')();
  assert.equal(timers.size, 1, `generation ${generation + 1} must retain a single reconnect timer`);
}
assert.equal(context.state.community.eventReconnectDelay, 12000, 'reconnect backoff must stop growing at its cap');
assert.ok([...timers.values()][0].delay <= 12000, 'jittered reconnect delay must remain within the cap');

const [cappedTimerId, cappedReconnect] = [...timers.entries()][0];
timers.delete(cappedTimerId);
cappedReconnect.callback();
deterministicMath.random = () => 1;
eventSources.at(-1).listeners.get('error')();
assert.equal(
  [...timers.values()][0].delay,
  12000,
  'positive jitter at the exponential-backoff ceiling must not exceed the 12 second cap'
);

console.log('Community history idempotency check passed.');
