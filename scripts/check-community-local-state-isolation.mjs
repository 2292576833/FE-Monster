import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('web/app.js', 'utf8');
const start = source.indexOf('function emptyCommunityFavoriteListening()');
const end = source.indexOf('function formatCommunityListeningDuration(', start);
assert.ok(start >= 0 && end > start, 'community local state identity module must remain inspectable');

const values = new Map([
  ['fe-monster-community-favorite-listen-v1', JSON.stringify({
    friends: { '10000001': { currentSignature: 'legacy-song', lastSeenAt: 12, songs: {} } },
  })],
  ['fe-monster-community-listening-stats-v1', JSON.stringify({
    listenMs: 900_000,
    songKeys: ['legacy-song'],
    songCountFloor: 9,
  })],
  ['fe-monster-community-together-report-v1', JSON.stringify({
    version: 1,
    partners: {
      '10000001': {
        feId: '10000001',
        username: 'Legacy Friend',
        totalMs: 800_000,
        sessionCount: 8,
        sessionIds: ['legacy-session'],
        lastListenedAt: 800,
      },
    },
  })],
]);

const storageReads = [];
const sandbox = {
  JSON,
  Object,
  Date: { now: () => 123456 },
  Math,
  COMMUNITY_FAVORITE_LISTEN_KEY: 'fe-monster-community-favorite-listen-v2',
  COMMUNITY_FAVORITE_LISTEN_LEGACY_KEY: 'fe-monster-community-favorite-listen-v1',
  COMMUNITY_LISTENING_STATS_KEY: 'fe-monster-community-listening-stats-v2',
  COMMUNITY_LISTENING_STATS_LEGACY_KEY: 'fe-monster-community-listening-stats-v1',
  COMMUNITY_TOGETHER_REPORT_KEY: 'fe-monster-community-together-report-v2',
  COMMUNITY_TOGETHER_REPORT_LEGACY_KEY: 'fe-monster-community-together-report-v1',
  COMMUNITY_LOCAL_IDENTITY_LIMIT: 12,
  state: {
    community: {
      localDataIdentity: '',
      favoriteListening: { friends: {} },
      listeningStats: { listenMs: 0, songKeys: [], songCountFloor: 0 },
      togetherReport: { version: 1, partners: {} },
      listeningStatsLastAt: 0,
      listeningStatsSavedAt: 0,
      togetherReportLastAt: 0,
      togetherReportSessionId: '',
      togetherReportSavedAt: 0,
    },
  },
  safeText(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim() || fallback;
  },
  window: {
    localStorage: {
      getItem(key) {
        storageReads.push(key);
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
const plain = (value) => JSON.parse(JSON.stringify(value));

const identityA = JSON.stringify(['http://127.0.0.1:3020', 'netease', 'account-a']);
const identityB = JSON.stringify(['http://127.0.0.1:3020', 'netease', 'account-b']);
const identityOtherProvider = JSON.stringify(['http://127.0.0.1:3020', 'qq', 'account-a']);
const identityOtherServer = JSON.stringify(['http://192.168.1.8:3020', 'netease', 'account-a']);

// Anonymous startup must neither expose nor consume the legacy account state.
sandbox.syncCommunityLocalStateIdentity('');
assert.deepEqual(plain(sandbox.state.community.favoriteListening), { friends: {} });
assert.deepEqual(plain(sandbox.state.community.listeningStats), {
  listenMs: 0,
  songKeys: [],
  songCountFloor: 0,
});
assert.deepEqual(plain(sandbox.state.community.togetherReport), { version: 1, partners: {} });
assert.equal(values.has('fe-monster-community-listening-stats-v1'), true);
assert.equal(storageReads.length, 0, 'anonymous startup must not read any account storage');

// The first explicit identity receives each legacy value exactly once.
sandbox.syncCommunityLocalStateIdentity(identityA);
assert.equal(sandbox.state.community.listeningStats.listenMs, 900_000);
assert.equal(sandbox.state.community.togetherReport.partners['10000001'].totalMs, 800_000);
assert.equal(
  sandbox.state.community.favoriteListening.friends['10000001'].currentSignature,
  'legacy-song',
);

// Account B starts clean; a smaller remote value must not be polluted by A's Math.max state.
sandbox.syncCommunityLocalStateIdentity(identityB);
assert.deepEqual(plain(sandbox.state.community.favoriteListening), { friends: {} });
assert.equal(sandbox.state.community.listeningStats.listenMs, 0);
assert.deepEqual(plain(sandbox.state.community.togetherReport), { version: 1, partners: {} });
sandbox.mergeCommunityListeningStats({ listenMs: 5_000, songCount: 1 });
sandbox.mergeCommunityTogetherReport({
  partners: {
    '20000002': {
      feId: '20000002',
      username: 'B Friend',
      totalMs: 4_000,
      sessionCount: 1,
      sessionIds: ['b-session'],
      lastListenedAt: 400,
    },
  },
});
assert.equal(sandbox.state.community.listeningStats.listenMs, 5_000);
assert.equal(sandbox.state.community.togetherReport.partners['20000002'].totalMs, 4_000);
assert.equal(sandbox.state.community.togetherReport.partners['10000001'], undefined);

// A -> B -> A restores each account's own memory and persistence bucket.
sandbox.syncCommunityLocalStateIdentity(identityA);
assert.equal(sandbox.state.community.listeningStats.listenMs, 900_000);
assert.equal(sandbox.state.community.togetherReport.partners['10000001'].totalMs, 800_000);
assert.equal(sandbox.state.community.togetherReport.partners['20000002'], undefined);
sandbox.syncCommunityLocalStateIdentity(identityB);
assert.equal(sandbox.state.community.listeningStats.listenMs, 5_000);
assert.equal(sandbox.state.community.togetherReport.partners['20000002'].totalMs, 4_000);

// Reintroducing a legacy key cannot migrate it into a second identity.
values.set('fe-monster-community-listening-stats-v1', JSON.stringify({ listenMs: 777_000 }));
values.set('fe-monster-community-favorite-listen-v1', JSON.stringify({
  friends: { '77777777': { currentSignature: 'wrong-provider', songs: {} } },
}));
values.set('fe-monster-community-together-report-v1', JSON.stringify({
  partners: { '77777777': { feId: '77777777', totalMs: 777_000 } },
}));
sandbox.syncCommunityLocalStateIdentity(identityOtherProvider);
assert.deepEqual(plain(sandbox.state.community.favoriteListening), { friends: {} });
assert.equal(sandbox.state.community.listeningStats.listenMs, 0);
assert.deepEqual(plain(sandbox.state.community.togetherReport), { version: 1, partners: {} });
sandbox.syncCommunityLocalStateIdentity(identityOtherServer);
assert.deepEqual(plain(sandbox.state.community.favoriteListening), { friends: {} });
assert.equal(sandbox.state.community.listeningStats.listenMs, 0);
assert.deepEqual(plain(sandbox.state.community.togetherReport), { version: 1, partners: {} });

// Entering anonymous state clears all account-derived memory without loading another bucket.
sandbox.syncCommunityLocalStateIdentity('');
assert.deepEqual(plain(sandbox.state.community.favoriteListening), { friends: {} });
assert.equal(sandbox.state.community.listeningStats.listenMs, 0);
assert.deepEqual(plain(sandbox.state.community.togetherReport), { version: 1, partners: {} });

assert.match(
  source,
  /syncCommunityLocalStateIdentity\(nextLocalDataIdentity\)[\s\S]{0,500}?mergeCommunityTogetherReport/,
  'rendering must switch account-local state before merging remote report data',
);

console.log('Community account-local state isolation PASS');
