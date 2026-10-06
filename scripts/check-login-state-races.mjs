import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const signature = source.includes(`async function ${name}`)
    ? `async function ${name}` : `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start) + 1);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness() {
  const requests = [];
  const timers = [];
  const effects = [];
  const state = {
    activeProvider: 'netease',
    loginStatusByProvider: {},
    loginStatusRetryTimers: {},
    loginStatusRetryAttempts: {},
    qualityLoginRequests: {},
    officialBrowserLoginSession: 'active-session',
    officialBrowserLoginProvider: 'netease',
    officialBrowserLoginLoopToken: 1,
    officialBrowserLoginRevision: 0,
    officialBrowserLoginRetryAttempt: 0,
  };
  const els = {
    loginDialog: { hidden: false },
    loginButton: { classList: { toggle() {} }, setAttribute() {} },
    loginLabel: { textContent: '' },
    officialBrowserLoginButton: {},
    officialBrowserLoginStatus: {},
  };
  const sandbox = {
    AbortController, Math, Number, Promise,
    COMMUNITY_API_TIMEOUT_MS: 8_000,
    LOGIN_STATUS_RETRY_DELAYS: [320, 700, 1400, 2600, 4200, 6500, 9000],
    state, els,
    window: {
      clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cancelled = true; },
      setTimeout(callback, delay) {
        timers.push({ callback, delay, cancelled: false });
        return timers.length;
      },
      fePixelLogin: { close() { effects.push('close'); }, syncProviders() {} },
    },
    providerConfigured: () => true,
    providerPath: (path, provider) => `/api/${provider}${path}`,
    providerInfo: (provider = state.activeProvider) => ({ id: provider, label: provider }),
    query: (values) => new URLSearchParams(values).toString(),
    safeText: (value, fallback = '') => String(value ?? fallback),
    accountHasVip: () => false,
    accountName: (payload) => payload.account?.nickname || '',
    playbackCardVisible: () => false,
    playbackQualityProvider: () => 'local',
    notifyAchievementAccountChange() {},
    renderLoginAvatar() {},
    renderDockQualityMenu() {},
    renderCommunityState(payload) { effects.push({ community: payload }); },
    scheduleCommunityRefresh(delay) { effects.push({ communityRefresh: delay }); },
    refreshUserPlaylists: async () => ({}),
    apiJson(url, options = {}) {
      const request = { url, options, ...deferred() };
      requests.push(request);
      return request.promise;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    'setOfficialBrowserLoginStatus', 'cancelOfficialBrowserLoginSession',
    'clearOfficialBrowserLoginTimer', 'officialBrowserLoginRetryDelay',
    'scheduleOfficialBrowserLoginCheck', 'checkOfficialBrowserLogin',
    'renderLoginStatus', 'loginStatusNeedsRetry', 'clearLoginStatusRetry',
    'scheduleLoginStatusRetry', 'refreshLoginStatus', 'ensureQualityLoginStatus',
    'closeLoginDialog',
  ].map(extractFunction).join('\n'), sandbox, { filename: 'web/app.js' });
  return { requests, timers, effects, state, els, sandbox };
}

const confirmedAccount = {
  provider: 'netease', loggedIn: true, account: { userId: '123', nickname: '已验证账号' },
};
const signedOut = { provider: 'netease', loggedIn: false, account: {} };

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

{
  const h = createHarness();
  const startup = h.sandbox.refreshLoginStatus();
  const afterScan = h.sandbox.refreshLoginStatus();
  h.requests[1].resolve(confirmedAccount);
  await afterScan;
  h.requests[0].resolve(signedOut);
  await startup;
  assert.equal(h.state.loginLoggedIn, true, 'a late startup response must not erase scanned login');
  assert.equal(h.els.loginLabel.textContent, '已验证账号');
}

{
  const h = createHarness();
  const qualityProbe = h.sandbox.ensureQualityLoginStatus('netease');
  h.sandbox.renderLoginStatus(confirmedAccount);
  h.requests[0].resolve(signedOut);
  await qualityProbe;
  assert.equal(h.state.loginLoggedIn, true, 'a stale quality probe must not erase verified login');
}

{
  const h = createHarness();
  const startup = h.sandbox.refreshLoginStatus();
  h.sandbox.renderLoginStatus(confirmedAccount);
  h.requests[0].reject(new Error('stale startup connection failed'));
  await startup;
  assert.equal(h.state.loginLoggedIn, true, 'a superseded failure must preserve verified identity');
  assert.equal(h.state.loginStatusRetryTimers.netease, undefined,
    'a superseded failure must not restart an obsolete recovery loop');
}

{
  const h = createHarness();
  const oldProvider = h.sandbox.refreshLoginStatus('netease');
  h.state.activeProvider = 'qq';
  const newProvider = h.sandbox.refreshLoginStatus('qq');
  h.requests[1].resolve({ loggedIn: false, account: {} });
  await newProvider;
  h.requests[0].resolve(confirmedAccount);
  await oldProvider;
  assert.equal(h.state.loginLoggedIn, false, 'another provider response must not alter the active provider UI');
  assert.equal(h.els.loginLabel.textContent, 'qq登录');
  assert.equal(h.state.loginStatusByProvider.netease.loggedIn, true,
    'inactive providers must retain their own independently verified account');
  assert.equal(h.state.loginStatusByProvider.qq.provider, 'qq',
    'provider-less payloads must stay associated with the requested provider');
}

{
  const h = createHarness();
  const oldAccountProbe = h.sandbox.refreshLoginStatus();
  h.sandbox.renderLoginStatus(signedOut);
  h.requests[0].resolve(confirmedAccount);
  await oldAccountProbe;
  assert.equal(h.state.loginLoggedIn, false, 'switch-account reset must invalidate the previous identity probe');
}

{
  const h = createHarness();
  h.sandbox.renderLoginStatus(confirmedAccount);
  const retry = h.sandbox.refreshLoginStatus();
  h.requests[0].resolve({ ...signedOut, retryable: true, code: 'API_STARTING' });
  const result = await retry;
  assert.equal(h.state.loginLoggedIn, true, 'temporary provider startup must preserve verified identity');
  assert.equal(result.loggedIn, true);
  assert.ok(h.state.loginStatusRetryTimers.netease, 'preserving identity must still retry account synchronization');
  const logout = h.sandbox.refreshLoginStatus();
  h.requests[1].resolve(signedOut);
  await logout;
  assert.equal(h.state.loginLoggedIn, false, 'an authoritative signed-out response must still clear identity');
}

{
  const h = createHarness();
  const startup = h.sandbox.refreshLoginStatus();
  const login = h.sandbox.checkOfficialBrowserLogin();
  h.requests[1].resolve({ loggedIn: true, terminal: true, revision: 2, accountPayload: confirmedAccount });
  await settle();
  assert.equal(h.state.loginLoggedIn, true, 'successful scan must show verified identity before another network call finishes');
  h.requests[0].resolve(signedOut);
  await startup;
  assert.equal(h.state.loginLoggedIn, true, 'the pre-scan request must remain invalid after applying the verified snapshot');
  h.requests[2].reject(new Error('network temporarily unavailable'));
  await login;
  assert.equal(h.state.loginLoggedIn, true, 'a failed follow-up request must preserve the verified scan identity');
  assert.ok(h.state.loginStatusRetryTimers.netease, 'the failed follow-up must continue background recovery');
  const autoClose = h.timers.find(({ delay }) => delay === 700);
  assert.ok(autoClose, 'verified success should close the completed dialog');
  h.sandbox.closeLoginDialog();
  h.els.loginDialog.hidden = false;
  autoClose.callback();
  assert.equal(h.els.loginDialog.hidden, false, 'a delayed completion callback must not close a newly opened login dialog');
}

{
  const h = createHarness();
  const login = h.sandbox.checkOfficialBrowserLogin();
  h.requests[0].resolve({ loggedIn: true, terminal: true, revision: 2 });
  await settle();
  h.sandbox.closeLoginDialog();
  h.els.loginDialog.hidden = false;
  h.requests[1].resolve(confirmedAccount);
  await login;
  assert.equal(h.timers.filter(({ delay }) => delay === 700 || delay === 1100).length, 0,
    'completion of an old account refresh must not schedule dismissal of a new dialog');
}

{
  const h = createHarness();
  const oldPoll = h.sandbox.checkOfficialBrowserLogin();
  const currentPoll = h.sandbox.checkOfficialBrowserLogin();
  assert.equal(h.requests[0].options.signal.aborted, true, 'a replacement poll must abort the previous poll');
  h.requests[0].resolve({ loggedIn: true, terminal: true, revision: 2, accountPayload: confirmedAccount });
  await oldPoll;
  assert.equal(h.state.loginLoggedIn, undefined, 'an aborted poll must not apply an obsolete success response');
  assert.equal(h.requests.length, 2, 'an aborted poll must not launch account or playlist refresh');
  h.requests[1].resolve({ loggedIn: false, terminal: false, revision: 1, message: '等待扫码' });
  await currentPoll;
  assert.equal(h.els.officialBrowserLoginStatus.textContent, '等待扫码');
}

console.log('Login identity and successful-scan race regressions: PASS');
