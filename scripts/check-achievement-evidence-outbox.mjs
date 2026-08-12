import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'pixel-achievements.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

class Storage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function harness({
  storage = new Storage(),
  mode = 'offline',
  posted = [],
  evidenceResponder = null,
  profileSnapshot = { provider: 'qq', hasCommunityIdentity: true, profile: { feId: '12345678' }, account: { userId: 'account-7' } },
  domFeId = '12345678',
  stateScope = 'qq:account-7'
} = {}) {
  const listeners = new Map();
  const timers = [];
  let rateLimitedUploads = 0;
  const window = {
    localStorage: storage,
    __feMonsterCommunityProfileSnapshot: profileSnapshot,
    fetch: async (url, options = {}) => {
      const href = String(url);
      if (href === '/api/app/machine') return response(200, { computerId: 'computer-evidence-7' });
      if (href.includes('/api/community/achievements/evidence')) {
        const body = JSON.parse(options.body);
        posted.push(body);
        if (typeof evidenceResponder === 'function') return evidenceResponder(body, posted.length);
        if (mode === 'offline') throw new Error('offline');
        if (mode === 'reject') return response(422, { ok: false, error: 'invalid evidence' });
        if (mode === 'proxy-reject') return response(200, {
          ok: false,
          error: 'completed track duration is outside the verification range',
          upstreamStatus: 400
        });
        if (mode === 'rate-limit') {
          rateLimitedUploads += 1;
          return response(429, { ok: false, error: 'too many requests' });
        }
        return response(200, { ok: true, accepted: true, eventId: body.event.eventId });
      }
      if (href.includes('/api/community/achievements')) return response(200, { ok: true, challenges: [], identityCardRewards: [] });
      return response(200, {
        version: 2, progress: {}, unlocked: {}, themes: {}, settings: {}, ornaments: {},
        _sync: stateScope ? { provider: 'qq', scope: stateScope, serverSynced: true } : { serverSynced: true }
      });
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    requestAnimationFrame: (callback) => { callback(0); return 1; },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    dispatchEvent(event) { [...(listeners.get(event.type) || [])].forEach((listener) => listener(event)); return true; },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  };
  const elements = new Map([
    ['#communityFeId', { textContent: domFeId }]
  ]);
  const document = {
    querySelector: (selector) => elements.get(selector) || null,
    querySelectorAll: () => [],
    createElement: () => ({
      className: '', dataset: {}, style: { setProperty() {} }, classList: { toggle() {}, add() {} },
      children: [], appendChild(child) { this.children.push(child); return child; },
      setAttribute() {}, querySelector: () => null, querySelectorAll: () => []
    })
  };
  vm.runInContext(source, vm.createContext({ window, document, console }), { filename: 'web/pixel-achievements.js' });
  return {
    api: window.feAchievements,
    window,
    storage,
    clearScheduled() { timers.length = 0; },
    async runNextScheduled() {
      const timer = timers.find((entry) => !entry.cancelled);
      if (!timer) return false;
      timer.cancelled = true;
      await timer.callback();
      return true;
    },
    setMode(value) { mode = value; rateLimitedUploads = 0; }
  };
}

const storage = new Storage();
const posted = [];
const offline = harness({ storage, posted, mode: 'offline' });
await offline.api.ready;
const interval = await offline.api.queueChallengeEvidence('listen-interval', {
  trackId: 'qq:track-001', startedAt: 1786586360000, endedAt: 1786586400000, durationSec: 40
});
assert.equal(interval.event.occurredAt, 1786586400000, 'listen interval did not use its server-comparable endedAt');
assert.equal(interval.event.payload.durationSec, 30, 'a listen interval exceeded the thirty-second evidence limit');
assert.equal(interval.event.payload.startedAt, 1786586360000);
const queued = await offline.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:track-001', durationSec: 242, completedAt: 1786586400000
});
assert.equal(queued.queued, true);
assert.match(queued.event.eventId, /^evidence-/);
assert.equal(offline.api.getChallengeEvidenceStatus().pending, 2);
assert.equal(offline.api.getChallengeEvidenceStatus().label, '2 条待联网验证');
const persistedKey = [...storage.values.keys()].find((key) => key.includes('achievement-evidence-outbox'));
assert.ok(persistedKey, 'offline evidence was not persisted');
assert.equal(JSON.parse(storage.getItem(persistedKey)).events.length, 2);
assert.equal(posted.length, 2, 'offline queue should attempt one immediate upload per observation');

offline.setMode('online');
offline.window.dispatchEvent({ type: 'online' });
for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
assert.equal(offline.api.getChallengeEvidenceStatus().pending, 0, 'confirmed evidence stayed in the outbox');
assert.equal(posted.length, 4);
assert.equal(posted[0].event.eventId, posted[2].event.eventId, 'retry changed the listen interval idempotency key');
assert.equal(posted[0].event.eventId, posted[1].event.eventId, 'a blocked FIFO retry changed the interval idempotency key');
assert.notEqual(posted[2].event.eventId, posted[3].event.eventId, 'separate evidence observations shared an idempotency key');
assert.deepEqual(Object.keys(posted[3]).sort(), ['computerId', 'computerIdSource', 'event', 'feId']);
assert.equal(posted[3].event.type, 'track-completed');
assert.equal(posted[3].event.payload.trackId, 'qq:track-001');

const tooShort = await offline.api.queueChallengeEvidence('listen-interval', {
  trackId: 'qq:track-001', startedAt: 1786586400000, endedAt: 1786586400500, durationSec: 0.5
});
assert.equal(tooShort.queued, false, 'sub-second listening was emitted outside the server 1..30 second contract');

const duplicatePost = [];
const duplicateHarness = harness({ storage: new Storage(), posted: duplicatePost, mode: 'online' });
await duplicateHarness.api.ready;
await duplicateHarness.api.queueChallengeEvidence('lyric-calibrated', {
  trackId: 'qq:track-lyric', revisionId: 'offset-0.1', changedLineCount: 1
});
assert.equal(duplicateHarness.api.getChallengeEvidenceStatus().pending, 0);
assert.equal(duplicatePost[0].event.type, 'lyric-calibrated');
assert.equal(duplicatePost[0].event.payload.changedLineCount, 1);

const twoHourStorage = new Storage();
const twoHourPosted = [];
const twoHourHarness = harness({ storage: twoHourStorage, posted: twoHourPosted, mode: 'offline' });
await twoHourHarness.api.ready;
const twoHourEnd = Date.now();
const twoHourStart = twoHourEnd - (2 * 60 * 60 * 1000);
for (let index = 0; index < 1440; index += 1) {
  const startedAt = twoHourStart + index * 5000;
  twoHourHarness.api.observeChallengeListening({
    trackId: 'qq:two-hour-track', startedAt, endedAt: startedAt + 5000, durationSec: 5
  });
}
await Promise.resolve();
const twoHourKey = [...twoHourStorage.values.keys()].find((key) => key.includes('achievement-evidence-outbox'));
const twoHourEvents = JSON.parse(twoHourStorage.getItem(twoHourKey)).events;
assert.equal(twoHourEvents.length, 240, 'two hours at five-second observation cadence was not compacted to thirty-second evidence');
assert.equal(twoHourHarness.api.getChallengeEvidenceStatus().pending, 240);
for (let index = 0; index < twoHourEvents.length; index += 1) {
  const event = twoHourEvents[index];
  assert.equal(event.type, 'listen-interval');
  assert.ok(event.payload.durationSec >= 1 && event.payload.durationSec <= 30);
  assert.equal(event.occurredAt, event.payload.endedAt);
  if (index > 0) {
    assert.ok(twoHourEvents[index - 1].payload.endedAt <= event.payload.startedAt,
      'aggregated listen evidence intervals overlap');
  }
}

const tailHarness = harness({ storage: new Storage(), mode: 'offline' });
await tailHarness.api.ready;
const tailStart = Date.now() - 5000;
tailHarness.api.observeChallengeListening({
  trackId: 'qq:tail-track', startedAt: tailStart, endedAt: tailStart + 5000, durationSec: 5
});
assert.equal(tailHarness.api.getChallengeEvidenceStatus().pending, 0, 'a five-second tail was emitted before a lifecycle flush');
tailHarness.api.flushChallengeListening();
assert.equal(tailHarness.api.getChallengeEvidenceStatus().pending, 1, 'pause/exit did not flush a one-second-or-longer tail');

const switchStorage = new Storage();
const switchHarness = harness({ storage: switchStorage, mode: 'offline' });
await switchHarness.api.ready;
const switchStart = Date.now() - 16000;
switchHarness.api.observeChallengeListening({ trackId: 'qq:track-a', startedAt: switchStart, endedAt: switchStart + 10000, durationSec: 10 });
switchHarness.api.observeChallengeListening({ trackId: 'qq:track-b', startedAt: switchStart + 11000, endedAt: switchStart + 16000, durationSec: 5 });
switchHarness.api.flushChallengeListening();
const switchKey = [...switchStorage.values.keys()].find((key) => key.includes('achievement-evidence-outbox'));
const switchedEvents = JSON.parse(switchStorage.getItem(switchKey)).events;
assert.deepEqual(switchedEvents.map((event) => event.payload.trackId), ['qq:track-a', 'qq:track-b'],
  'a track switch merged evidence across two songs');
assert.ok(switchedEvents[0].payload.endedAt <= switchedEvents[1].payload.startedAt);

const rememberedStorage = new Storage();
rememberedStorage.setItem('fe-monster-active-provider-v1', 'qq');
const warmPosts = [];
const warm = harness({ storage: rememberedStorage, posted: warmPosts, mode: 'online' });
await warm.api.ready;
warm.window.dispatchEvent({
  type: 'fe-monster-community-profile',
  detail: { provider: 'qq', loggedIn: true, hasCommunityIdentity: true, profile: { feId: '12345678' }, account: { userId: 'account-7' } }
});
await warm.api.queueChallengeEvidence('track-completed', { trackId: 'qq:warm', durationSec: 180 });
const coldPosts = [];
const cold = harness({
  storage: rememberedStorage,
  posted: coldPosts,
  mode: 'offline',
  profileSnapshot: null,
  domFeId: '--------',
  stateScope: ''
});
await cold.api.ready;
const coldQueued = await cold.api.queueChallengeEvidence('track-completed', { trackId: 'qq:cold', durationSec: 181 });
assert.equal(coldQueued.queued, true, 'offline cold start did not recover its account-scoped FEID');
assert.equal(coldPosts.at(-1).feId, '12345678');
const coldEventId = coldPosts.at(-1).event.eventId;
cold.setMode('online');
cold.window.dispatchEvent({ type: 'online' });
for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
assert.ok(coldPosts.some((post, index) => index > 0 && post.event.eventId === coldEventId),
  'cold-start evidence retry did not preserve its eventId');

cold.window.dispatchEvent({
  type: 'fe-community-account-change',
  detail: { provider: 'qq', loggedIn: true, account: { userId: 'account-8' } }
});
const switchedAccount = await cold.api.queueChallengeEvidence('track-completed', { trackId: 'qq:new-account', durationSec: 182 });
assert.equal(switchedAccount.queued, false, 'account switching reused the previous account FEID');
cold.window.dispatchEvent({
  type: 'fe-community-account-change',
  detail: { provider: 'qq', loggedIn: false, account: {} }
});
const loggedOut = await cold.api.queueChallengeEvidence('track-completed', { trackId: 'qq:logged-out', durationSec: 183 });
assert.equal(loggedOut.queued, false, 'anonymous scope reused a global FEID');

const rejectedHarness = harness({ storage: new Storage(), mode: 'reject' });
await rejectedHarness.api.ready;
await rejectedHarness.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:invalid', durationSec: 1
});
assert.equal(rejectedHarness.api.getChallengeEvidenceStatus().pending, 0, 'permanent 4xx evidence was retried forever');
assert.equal(rejectedHarness.api.getChallengeEvidenceStatus().rejected, 1, 'permanent 4xx evidence was not moved to dead-letter');

const proxyRejectedHarness = harness({ storage: new Storage(), mode: 'proxy-reject' });
await proxyRejectedHarness.api.ready;
await proxyRejectedHarness.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:proxy-invalid', durationSec: 30
});
proxyRejectedHarness.setMode('online');
await proxyRejectedHarness.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:proxy-valid', durationSec: 180
});
assert.equal(proxyRejectedHarness.api.getChallengeEvidenceStatus().pending, 0,
  'a permanent upstream 400 hidden behind the local Java HTTP 200 blocked the FIFO');
assert.equal(proxyRejectedHarness.api.getChallengeEvidenceStatus().rejected, 1,
  'the Java proxy upstream status did not move invalid evidence to dead-letter');

const throttledHarness = harness({ storage: new Storage(), mode: 'offline' });
await throttledHarness.api.ready;
for (let index = 0; index < 12; index += 1) {
  await throttledHarness.api.queueChallengeEvidence('track-completed', {
    trackId: `qq:throttled-${index}`,
    durationSec: 180 + index
  });
}
throttledHarness.setMode('rate-limit');
assert.equal(await throttledHarness.runNextScheduled(), true,
  'offline evidence did not schedule its first reconnect retry');
for (let turn = 0; turn < 300; turn += 1) await Promise.resolve();
assert.equal(throttledHarness.api.getChallengeEvidenceStatus().pending, 12,
  '429 evidence was removed instead of remaining queued for retry');
assert.equal(throttledHarness.api.getChallengeEvidenceStatus().rejected, 0,
  '429 evidence was incorrectly moved to permanent dead-letter');
throttledHarness.setMode('online');
let ranScheduledRetry = false;
for (let attempt = 0; attempt < 20 && throttledHarness.api.getChallengeEvidenceStatus().pending; attempt += 1) {
  ranScheduledRetry = (await throttledHarness.runNextScheduled()) || ranScheduledRetry;
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
}
assert.equal(ranScheduledRetry, true, 'rate-limited evidence did not schedule an automatic retry');
assert.equal(throttledHarness.api.getChallengeEvidenceStatus().pending, 0,
  'the automatic retry did not drain preserved evidence after rate limiting cleared');

let resolveOldAccountUpload;
let resolveNewAccountUpload;
const oldAccountResponse = new Promise((resolve) => { resolveOldAccountUpload = resolve; });
const newAccountResponse = new Promise((resolve) => { resolveNewAccountUpload = resolve; });
const raceSnapshot = {
  provider: 'qq', hasCommunityIdentity: true,
  profile: { feId: '12345678' }, account: { userId: 'account-7' }
};
const racePosted = [];
const raceHarness = harness({
  storage: new Storage(),
  posted: racePosted,
  mode: 'online',
  profileSnapshot: raceSnapshot,
  evidenceResponder: (_body, callCount) => callCount === 1 ? oldAccountResponse : newAccountResponse
});
await raceHarness.api.ready;
const oldAccountTask = raceHarness.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:old-account', durationSec: 180
});
for (let turn = 0; turn < 20 && racePosted.length < 1; turn += 1) await Promise.resolve();
raceSnapshot.account = { userId: 'account-8' };
raceSnapshot.profile = { feId: '87654321' };
raceHarness.window.dispatchEvent({
  type: 'fe-community-account-change',
  detail: { provider: 'qq', loggedIn: true, account: raceSnapshot.account }
});
raceHarness.window.dispatchEvent({
  type: 'fe-monster-community-profile',
  detail: {
    provider: 'qq', loggedIn: true, hasCommunityIdentity: true,
    account: raceSnapshot.account, profile: raceSnapshot.profile
  }
});
const newAccountTask = raceHarness.api.queueChallengeEvidence('track-completed', {
  trackId: 'qq:new-account', durationSec: 181
});
for (let turn = 0; turn < 20 && racePosted.length < 2; turn += 1) await Promise.resolve();
assert.equal(racePosted.length, 2, 'the new account upload was blocked by the previous account flush');
resolveOldAccountUpload(response(200, { ok: true, accepted: true, eventId: racePosted[0].event.eventId }));
await oldAccountTask;
for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
const newAccountStorageKey = [...raceHarness.storage.values.keys()]
  .find((key) => key.includes('account-8') && key.includes('87654321'));
const newAccountPersisted = JSON.parse(raceHarness.storage.getItem(newAccountStorageKey) || '{}');
assert.deepEqual(
  newAccountPersisted.events.map((event) => event.payload.trackId),
  ['qq:new-account'],
  'the previous account response removed the current account evidence'
);
resolveNewAccountUpload(response(200, { ok: true, accepted: true, eventId: racePosted[1].event.eventId }));
await newAccountTask;
assert.equal(raceHarness.api.getChallengeEvidenceStatus().pending, 0,
  'the current account evidence did not clear after its own response');

assert.match(appSource, /els\.audio\.addEventListener\('ended'[\s\S]*?queueHighDifficultyAchievementEvidence\('track-completed',[\s\S]*?durationSec[\s\S]*?completedAt/,
  'completed tracks are not wired to the offline evidence outbox');
assert.match(appSource, /function recordCommunityListeningStats\(listenMsDelta,[\s\S]*?queueHighDifficultyListenInterval\(delta, song\)/,
  'active listening does not pass observations to the thirty-second aggregator');
assert.match(appSource, /window\.addEventListener\('beforeunload',[\s\S]*?flushCommunityListeningStats\(\)[\s\S]*?flushHighDifficultyListenInterval\(\)/,
  'exit does not flush the final listening tail');
assert.match(appSource, /els\.audio\.addEventListener\('pause'[\s\S]*?flushCommunityListeningStats\(\)[\s\S]*?flushHighDifficultyListenInterval\(\)/,
  'pause does not flush the final listening tail');
assert.match(appSource, /els\.audio\.addEventListener\('ended'[\s\S]*?flushCommunityListeningStats\(\)[\s\S]*?flushHighDifficultyListenInterval\(\)/,
  'track completion does not flush the final listening tail');
assert.match(appSource, /document\.addEventListener\('visibilitychange'[\s\S]*?document\.hidden[\s\S]*?flushCommunityListeningStats\(\)[\s\S]*?flushHighDifficultyListenInterval\(\)/,
  'backgrounding does not flush the final listening tail');
assert.match(appSource, /function setLyricClockOffsetSeconds\(value\)[\s\S]*?queueHighDifficultyAchievementEvidence\('lyric-calibrated',[\s\S]*?revisionId[\s\S]*?changedLineCount/,
  'lyric calibration changes are not wired to the offline evidence outbox');

console.log('Achievement offline evidence outbox PASS');
