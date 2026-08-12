import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const asyncSignature = `async function ${name}`;
  const signature = source.includes(asyncSignature) ? asyncSignature : `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start) + 1);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

{
  let requests = 0;
  const sandbox = {
    Date,
    Promise,
    window: { clearTimeout() {} },
    state: {
      activeProvider: 'netease',
      community: {
        messageBubbleTimer: 1,
        messageBubbleSeenReady: false,
        eventConnected: true,
        eventHistoryCalibrated: true,
        eventHydrationStartedAt: Date.now(),
        profile: { feId: '11111111' },
        friends: Array.from({ length: 8 }, (_, index) => ({ feId: String(22000000 + index) })),
        messageBubbleSeenKeys: new Set(),
      },
    },
    COMMUNITY_EVENT_STALE_MS: 15_000,
    scheduleCommunityMessageBubblePoll() {},
    query: () => '',
    apiJson: async () => {
      requests += 1;
      return { messages: [] };
    },
    communityMessageKey: () => '',
    communityEventIsHistorical: () => true,
    rememberCommunityMessageKey: () => false,
    showCommunityMessageBubble() {},
    saveCommunityHistoryLedger() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction('pollCommunityMessageBubbles'), sandbox);
  await sandbox.pollCommunityMessageBubbles();
  assert.equal(requests, 0, 'a calibrated live event stream must not fan out one history request per friend');
  console.log('PASS live community events suppress redundant friend-history polling');
}

{
  let renders = 0;
  const sandbox = {
    AbortController,
    DOMException,
    Math,
    Promise,
    document: { hidden: false },
    performance: { now: () => 10_000 },
    els: { communityCard: {} },
    state: {
      activeProvider: 'netease',
      loginLoggedIn: true,
      community: {
        profile: { feId: '11111111' },
        loading: false,
        refreshQueued: false,
        refreshQueuedDueAt: 0,
        refreshGeneration: 0,
        refreshRetryDelay: 1200,
        refreshRetryNotBefore: 0,
        lastProvider: '',
      },
    },
    COMMUNITY_STATE_TIMEOUT_MS: 5_000,
    COMMUNITY_STATE_RETRY_DELAYS: [300],
    query: () => '',
    communityApiJson: async () => ({
      ok: false,
      loggedIn: true,
      error: 'too many requests',
      profile: { feId: '11111111' },
    }),
    communityStateNeedsRetry: () => true,
    safeText: (value, fallback = '') => String(value ?? fallback),
    renderCommunityState: () => { renders += 1; },
    scheduleCommunityRefresh() {},
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction('refreshCommunityState'), sandbox);
  await sandbox.refreshCommunityState('netease');
  assert.equal(renders, 0, 'a transient 429 must retain the last known-good logged-in community identity');
  console.log('PASS rate limiting cannot erase the last known-good community identity');
}

{
  const statuses = [];
  const scheduled = [];
  const sandbox = {
    Promise,
    document: { hidden: false },
    state: {
      activeProvider: 'netease',
      officialBrowserLoginSession: 'session-1',
      officialBrowserLoginProvider: 'netease',
    },
    window: { setTimeout: (callback, delay) => scheduled.push({ callback, delay }) },
    providerPath: (path) => path,
    query: () => '',
    apiJson: async () => ({ loggedIn: true, terminal: true }),
    setOfficialBrowserLoginStatus: (message) => statuses.push(message),
    clearOfficialBrowserLoginTimer() {},
    providerInfo: () => ({ label: '网易云音乐' }),
    refreshLoginStatus: async () => ({ loggedIn: false }),
    refreshUserPlaylists: async () => undefined,
    closeLoginDialog() {},
    scheduleLoginStatusRetry() {},
    scheduleCommunityRefresh() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction('checkOfficialBrowserLogin'), sandbox);
  await sandbox.checkOfficialBrowserLogin();
  assert.doesNotMatch(
    statuses.at(-1) || '',
    /正在同步/,
    'an authenticated official session must leave a terminal status even when account refresh lags',
  );
  console.log('PASS official browser login always leaves a terminal status');
}

{
  const requestOptions = [];
  const sandbox = {
    Promise,
    document: { hidden: false },
    state: {
      activeProvider: 'netease',
      playlistsLoading: false,
      playlistsLoggedIn: false,
      userPlaylists: [],
      recommendedPlaylists: [],
    },
    COMMUNITY_API_TIMEOUT_MS: 8_000,
    providerConfigured: () => true,
    providerPath: (path) => path,
    query: () => '',
    apiJson: async (_path, options) => {
      requestOptions.push(options);
      return { playlists: [], loggedIn: true };
    },
    playbackPlaylists: () => [],
    renderPlaylistOrbit() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction('refreshUserPlaylists'), sandbox);
  await sandbox.refreshUserPlaylists();
  assert.equal(requestOptions.length, 2);
  assert.ok(
    requestOptions.every((options) => options?.timeoutMs === 8_000),
    'playlist sync requests must be bounded so the login status cannot remain pending forever',
  );
  console.log('PASS playlist synchronization has a bounded deadline');
}
