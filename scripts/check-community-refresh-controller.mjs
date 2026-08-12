import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunctionDeclaration(source, name) {
  const asyncSignature = `async function ${name}`;
  const signature = source.includes(asyncSignature) ? asyncSignature : `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist in the real community runtime`);
  const openParen = source.indexOf('(', start + signature.length);
  let parameterDepth = 0;
  let parameterQuote = '';
  let parameterEscaped = false;
  let closeParen = -1;
  for (let index = openParen; index < source.length; index += 1) {
    const char = source[index];
    if (parameterQuote) {
      if (parameterEscaped) parameterEscaped = false;
      else if (char === '\\') parameterEscaped = true;
      else if (char === parameterQuote) parameterQuote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      parameterQuote = char;
      continue;
    }
    if (char === '(') parameterDepth += 1;
    if (char === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        closeParen = index;
        break;
      }
    }
  }
  assert.ok(closeParen > openParen, `${name} must have balanced parameters`);
  const braceStart = source.indexOf('{', closeParen + 1);
  assert.notEqual(braceStart, -1, `${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced function body`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

{
  const login = deferred();
  const scheduled = [];
  const sandbox = {
    Promise,
    CustomEvent: class CustomEvent {
      constructor(type) { this.type = type; }
    },
    bootVisual: { servicesStarted: false, servicesPromise: null },
    document: { documentElement: { dataset: {} } },
    window: { dispatchEvent() {} },
    state: { activeProvider: 'netease' },
    interactiveRuntimeAvailable: () => true,
    scheduleButtonGlowEnhancement() {},
    activateInteractiveBackend: async () => ({ ok: true }),
    startBackgroundPolling() {},
    refreshLoginStatus: () => login.promise,
    refreshUserPlaylists: async () => [],
    checkGitHubClientUpdate: async () => null,
    scheduleCommunityRefresh: (delay) => scheduled.push(delay),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'startInteractiveRuntime'), sandbox);

  const started = sandbox.startInteractiveRuntime();
  await flushMicrotasks();
  assert.deepEqual(
    scheduled,
    [0],
    'interactive activation must request the first community state immediately, without waiting for login or the 15s poll',
  );
  login.resolve({ loggedIn: false });
  await started;
  console.log('PASS community refresh starts immediately after interactive activation');
}

{
  const providerA = deferred();
  const rendered = [];
  const scheduled = [];
  const sandbox = {
    Promise,
    Math,
    COMMUNITY_STATE_TIMEOUT_MS: 5_000,
    COMMUNITY_STATE_RETRY_DELAYS: [300],
    performance: { now: () => 5_000 },
    document: { hidden: false },
    window: {},
    els: { communityCard: {} },
    state: {
      activeProvider: 'provider-b',
      loginLoggedIn: false,
      community: {
        loading: false,
        refreshQueued: false,
        refreshRetryDelay: 1200,
        lastProvider: '',
      },
    },
    query: ({ provider }) => `provider=${provider}`,
    communityApiJson: async (path) => {
      if (path.includes('provider-a')) return providerA.promise;
      return {
        ok: true,
        loggedIn: true,
        provider: 'provider-b',
        profile: { feId: '22222222' },
        friends: [],
      };
    },
    communityStateNeedsRetry: () => false,
    renderCommunityState: (payload) => rendered.push(payload.provider),
    scheduleCommunityRefresh: (delay) => scheduled.push(delay),
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'refreshCommunityState'), sandbox);

  sandbox.state.activeProvider = 'provider-a';
  const staleRefresh = sandbox.refreshCommunityState('provider-a');
  await flushMicrotasks();
  sandbox.state.activeProvider = 'provider-b';
  await sandbox.refreshCommunityState('provider-b');
  providerA.resolve({
    ok: true,
    loggedIn: true,
    provider: 'provider-a',
    profile: { feId: '11111111' },
    friends: [],
  });
  await staleRefresh;

  assert.deepEqual(
    rendered,
    [],
    'a response from the previous provider must not render after the active provider changes',
  );
  console.log('PASS stale community responses cannot overwrite a newer provider');
}

{
  let nextTimerId = 1;
  const timers = new Map();
  const sandbox = {
    performance: { now: () => 10_000 },
    state: {
      activeProvider: 'netease',
      community: {
        loading: false,
        refreshTimer: 0,
        refreshTimerDueAt: 0,
        refreshRetryNotBefore: 0,
      },
    },
    window: {
      clearTimeout(id) { timers.delete(id); },
      setTimeout(callback, delay) {
        const id = nextTimerId++;
        timers.set(id, { callback, delay });
        return id;
      },
    },
    refreshCommunityState: async () => null,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'scheduleCommunityRefresh'), sandbox);

  sandbox.scheduleCommunityRefresh(1_000, { backoff: true });
  sandbox.scheduleCommunityRefresh(0);
  const activeTimers = [...timers.values()];
  assert.equal(activeTimers.length, 1, 'community refresh scheduling must keep one timer');
  assert.ok(
    activeTimers[0].delay >= 1_000,
    'a poll or UI refresh must not move a failed community retry ahead of its backoff deadline',
  );
  console.log('PASS community polling cannot override failure backoff');
}

{
  let nextTimerId = 1;
  const timers = new Map();
  const sandbox = {
    performance: { now: () => 20_000 },
    state: {
      activeProvider: 'netease',
      community: {
        loading: false,
        refreshTimer: 0,
        refreshTimerDueAt: 0,
        refreshRetryNotBefore: 0,
      },
    },
    window: {
      clearTimeout(id) { timers.delete(id); },
      setTimeout(callback, delay) {
        const id = nextTimerId++;
        timers.set(id, { callback, delay });
        return id;
      },
    },
    refreshCommunityState: async () => null,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'scheduleCommunityRefresh'), sandbox);

  sandbox.scheduleCommunityRefresh(80);
  sandbox.scheduleCommunityRefresh(15_000);
  const activeTimers = [...timers.values()];
  assert.equal(activeTimers.length, 1, 'community refresh scheduling must keep one timer');
  assert.equal(
    activeTimers[0].delay,
    80,
    'a later low-priority poll must not postpone an already scheduled near-term community refresh',
  );
  console.log('PASS community refresh scheduler keeps the earliest eligible deadline');
}

{
  let nextTimerId = 1;
  let activeRequests = 0;
  let maximumConcurrent = 0;
  const timers = new Map();
  const request = deferred();
  const sandbox = {
    Promise,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    COMMUNITY_STATE_TIMEOUT_MS: 5_000,
    COMMUNITY_STATE_RETRY_DELAYS: [300],
    performance: { now: () => 30_000 },
    document: { hidden: false },
    els: { communityCard: {} },
    state: {
      activeProvider: 'netease',
      loginLoggedIn: false,
      community: {
        loading: false,
        refreshQueued: false,
        refreshGeneration: 0,
        refreshTimer: 0,
        refreshTimerDueAt: 0,
        refreshRetryNotBefore: 0,
        refreshRetryDelay: 1200,
        lastProvider: '',
      },
    },
    window: {
      clearTimeout(id) { timers.delete(id); },
      setTimeout(callback, delay) {
        const id = nextTimerId++;
        timers.set(id, { callback, delay });
        return id;
      },
    },
    query: ({ provider }) => `provider=${provider}`,
    communityApiJson: async () => {
      activeRequests += 1;
      maximumConcurrent = Math.max(maximumConcurrent, activeRequests);
      try {
        return await request.promise;
      } finally {
        activeRequests -= 1;
      }
    },
    communityStateNeedsRetry: () => false,
    renderCommunityState() {},
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'scheduleCommunityRefresh'), sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'refreshCommunityState'), sandbox);

  const firstRefresh = sandbox.refreshCommunityState('netease');
  await flushMicrotasks();
  sandbox.scheduleCommunityRefresh(0);
  const queuedTimerEntry = [...timers.entries()][0];
  if (queuedTimerEntry) {
    const [queuedTimerId, queuedTimer] = queuedTimerEntry;
    timers.delete(queuedTimerId);
    queuedTimer.callback();
    await flushMicrotasks();
  }
  request.reject(new TypeError('community transport unavailable'));
  await firstRefresh;

  const pendingTimers = [...timers.values()];
  assert.equal(maximumConcurrent, 1, 'community refresh must keep at most one request in flight');
  assert.equal(pendingTimers.length, 1, 'a failed refresh with a queued poll must produce one retry timer');
  assert.ok(
    pendingTimers[0].delay >= 1_000,
    'a poll queued during an outage must respect failure backoff instead of restarting in 40ms',
  );
  console.log('PASS queued polling remains single-flight and respects outage backoff');
}

{
  let timeoutTask = null;
  const sandbox = {
    AbortController,
    DOMException,
    Error,
    window: {
      setTimeout(callback, delay) {
        timeoutTask = { callback, delay };
        return 1;
      },
      clearTimeout() {},
    },
    fetch: async (_path, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(options.signal.reason || new DOMException('request aborted', 'AbortError'));
      }, { once: true });
    }),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'apiJson'), sandbox);

  const request = sandbox.apiJson('/api/login/status', { timeoutMs: 4_000 });
  await flushMicrotasks();
  assert.equal(timeoutTask?.delay, 4_000, 'apiJson must arm the caller-provided timeout');
  timeoutTask.callback();
  await assert.rejects(request, (error) => error?.name === 'TimeoutError');
  console.log('PASS API calls can be bounded by a caller-provided timeout');
}

{
  let requestOptions = null;
  const sandbox = {
    COMMUNITY_API_TIMEOUT_MS: 8_000,
    state: {
      activeProvider: 'netease',
      clientRuntime: { settings: {} },
    },
    providerInfo: (provider) => ({ id: provider }),
    apiJson: async (_path, options) => {
      requestOptions = options;
      return { ok: true };
    },
    syncRuntimeSettingsControls() {},
    applyRuntimeDataset() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'activateInteractiveBackend'), sandbox);

  await sandbox.activateInteractiveBackend();
  assert.equal(
    requestOptions?.timeoutMs,
    8_000,
    'interactive activation must not be able to block community startup indefinitely',
  );
  console.log('PASS interactive activation uses a bounded API call');
}

{
  let requestOptions = null;
  const sandbox = {
    COMMUNITY_API_TIMEOUT_MS: 8_000,
    state: {
      activeProvider: 'netease',
      loginStatusByProvider: {},
    },
    providerInfo: (provider) => ({ id: provider }),
    providerConfigured: () => true,
    query: ({ provider }) => `provider=${provider}`,
    apiJson: async (_path, options) => {
      requestOptions = options;
      return { provider: 'netease', loggedIn: false };
    },
    loginStatusNeedsRetry: () => false,
    renderLoginStatus() {},
    clearLoginStatusRetry() {},
    scheduleLoginStatusRetry() {},
    scheduleCommunityRefresh() {},
    renderCommunityState() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'refreshLoginStatus'), sandbox);

  await sandbox.refreshLoginStatus('netease');
  assert.equal(
    requestOptions?.timeoutMs,
    8_000,
    'login status must time out so a stalled identity provider cannot block recovery indefinitely',
  );
  console.log('PASS login status uses a bounded API call');
}

{
  let requestSignal = null;
  const request = deferred();
  const sandbox = {
    AbortController,
    DOMException,
    Promise,
    Math,
    COMMUNITY_STATE_TIMEOUT_MS: 5_000,
    COMMUNITY_STATE_RETRY_DELAYS: [300],
    performance: { now: () => 40_000 },
    document: { hidden: false },
    els: { communityCard: {} },
    state: {
      activeProvider: 'provider-a',
      loginLoggedIn: false,
      community: {
        loading: false,
        refreshQueued: false,
        refreshQueuedDueAt: 0,
        refreshGeneration: 0,
        refreshRetryDelay: 1200,
        refreshRetryNotBefore: 0,
        lastProvider: '',
      },
    },
    query: ({ provider }) => `provider=${provider}`,
    communityApiJson: async (_path, options = {}) => {
      requestSignal = options.signal || null;
      if (requestSignal) {
        requestSignal.addEventListener('abort', () => {
          request.reject(requestSignal.reason || new DOMException('superseded', 'AbortError'));
        }, { once: true });
      }
      return request.promise;
    },
    communityStateNeedsRetry: () => false,
    renderCommunityState() {},
    scheduleCommunityRefresh() {},
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'refreshCommunityState'), sandbox);

  const staleRefresh = sandbox.refreshCommunityState('provider-a');
  await flushMicrotasks();
  sandbox.state.activeProvider = 'provider-b';
  await sandbox.refreshCommunityState('provider-b');
  assert.equal(requestSignal?.aborted, true, 'switching provider must abort the stale community request');
  await staleRefresh;
  console.log('PASS a newer provider aborts the stale community request');
}

{
  const refreshSource = extractFunctionDeclaration(appSource, 'refreshCommunityState');
  assert.match(
    refreshSource,
    /timeoutMs:\s*COMMUNITY_STATE_TIMEOUT_MS/,
    'community state refresh must use its bounded fast-path timeout',
  );
  assert.match(
    refreshSource,
    /retryDelays:\s*COMMUNITY_STATE_RETRY_DELAYS/,
    'community state refresh must not inherit the long generic retry chain',
  );
  console.log('PASS community state refresh has a bounded retry window');
}
