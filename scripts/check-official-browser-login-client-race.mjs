import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const asyncSignature = `async function ${name}`;
  const signature = source.includes(asyncSignature) ? asyncSignature : `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist in web/app.js`);
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

function createHarness(endpoint, operationCount = 1) {
  const requests = Array.from({ length: operationCount }, () => deferred());
  let operationIndex = 0;
  const calls = [];
  const timers = [];
  const state = {
    activeProvider: 'netease',
    loginStatusByProvider: {},
    officialBrowserLoginSession: '',
    officialBrowserLoginProvider: '',
    officialBrowserLoginTimer: 0,
    officialBrowserLoginAbortController: null,
    officialBrowserLoginLoopToken: 0,
    officialBrowserLoginRevision: -1,
    officialBrowserLoginRetryAttempt: 0,
    officialBrowserLoginLoading: false,
    officialBrowserSwitching: false,
  };
  const els = {
    loginDialog: { hidden: false },
    loginButton: { setAttribute() {} },
    officialBrowserLoginButton: { disabled: false, textContent: '' },
    officialBrowserSwitchAccountButton: { disabled: false, textContent: '' },
    officialBrowserLoginStatus: { hidden: false, textContent: '' },
  };
  const sandbox = {
    AbortController,
    Math,
    Number,
    Promise,
    Set,
    OFFICIAL_BROWSER_LOGIN_PROVIDERS: new Set(['netease', 'qq', 'kugou']),
    state,
    els,
    window: {
      clearTimeout() {},
      setTimeout(callback, delay) {
        timers.push({ callback, delay });
        return timers.length;
      },
      fePixelLogin: { close() {} },
    },
    providerConfigured: () => true,
    providerPath: (path, provider) => `/api/${provider}${path}`,
    providerInfo: (provider) => ({ id: provider, label: '网易云音乐' }),
    query: ({ session }) => `session=${encodeURIComponent(session)}`,
    safeText: (value, fallback = '') => String(value ?? fallback),
    setOfficialBrowserLoginStatus(message = '', hidden = false) {
      els.officialBrowserLoginStatus.textContent = message;
      els.officialBrowserLoginStatus.hidden = hidden || !message;
    },
    clearLoginStatusRetry() {},
    renderLoginStatus() {},
    syncBrowserLoginSurface() {},
    async apiJson(url, options = {}) {
      calls.push({ url, options });
      if (url.endsWith(endpoint)) {
        assert.ok(operationIndex < requests.length, `Unexpected extra ${endpoint} request`);
        return requests[operationIndex++].promise;
      }
      if (url.includes('/login/browser/cancel?')) return { ok: true };
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunction('cancelOfficialBrowserLoginSession'),
    extractFunction('clearOfficialBrowserLoginTimer'),
    extractFunction('scheduleOfficialBrowserLoginCheck'),
    extractFunction('startOfficialBrowserLogin'),
    extractFunction('switchOfficialBrowserAccount'),
    extractFunction('closeLoginDialog'),
  ].join('\n'), sandbox, { filename: 'web/app.js' });
  return { calls, els, request: requests[0], requests, sandbox, state, timers };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

async function assertClosingInvalidatesPendingOperation({ endpoint, invoke, session }) {
  const harness = createHarness(endpoint);
  const operation = harness.sandbox[invoke]();
  await settle();
  harness.sandbox.closeLoginDialog();
  harness.request.resolve({ session, revision: 1, message: '扫码窗口已打开' });
  await operation;
  await settle();

  assert.equal(harness.els.loginDialog.hidden, true, 'the user closed the login dialog');
  assert.equal(harness.state.officialBrowserLoginSession, '',
    `${invoke} must not revive a session after closeLoginDialog`);
  assert.equal(harness.state.officialBrowserLoginProvider, '',
    `${invoke} must not revive the provider after closeLoginDialog`);
  assert.equal(harness.timers.length, 0,
    `${invoke} must not restart login polling after closeLoginDialog`);
  assert.ok(
    harness.calls.some(({ url, options }) => url.includes('/login/browser/cancel?')
      && url.includes(`session=${encodeURIComponent(session)}`)
      && options.method === 'POST'),
    `${invoke} must immediately cancel the orphan browser session returned by the server`,
  );
}

await assertClosingInvalidatesPendingOperation({
  endpoint: '/login/browser/start',
  invoke: 'startOfficialBrowserLogin',
  session: 'late-start-session',
});
await assertClosingInvalidatesPendingOperation({
  endpoint: '/login/browser/switch',
  invoke: 'switchOfficialBrowserAccount',
  session: 'late-switch-session',
});

{
  const harness = createHarness('/login/browser/start');
  const operation = harness.sandbox.startOfficialBrowserLogin();
  await settle();
  harness.sandbox.clearOfficialBrowserLoginTimer({ cancel: true });
  harness.state.activeProvider = 'qq';
  harness.request.resolve({ session: 'old-provider-session', revision: 1 });
  await operation;
  await settle();

  assert.equal(harness.state.officialBrowserLoginSession, '',
    'a start response from the previously selected provider must stay inactive');
  assert.equal(harness.timers.length, 0,
    'a start response from the previously selected provider must not schedule polling');
  assert.ok(harness.calls.some(({ url }) => url.includes('session=old-provider-session')
    && url.includes('/login/browser/cancel?')),
  'switching providers must cancel the browser session returned by the old start request');
}

{
  const harness = createHarness('/login/browser/start', 2);
  const firstOperation = harness.sandbox.startOfficialBrowserLogin();
  await settle();
  harness.sandbox.closeLoginDialog();
  harness.els.loginDialog.hidden = false;
  const secondOperation = harness.sandbox.startOfficialBrowserLogin();
  await settle();

  harness.requests[0].resolve({ session: 'superseded-session', revision: 1 });
  await firstOperation;
  await settle();
  assert.equal(harness.state.officialBrowserLoginSession, '',
    'a superseded start response must not replace the newer pending operation');
  assert.equal(harness.state.officialBrowserLoginLoading, true,
    'a superseded start response must not clear the newer operation loading state');

  harness.requests[1].resolve({ session: 'current-session', revision: 2 });
  await secondOperation;
  await settle();
  assert.equal(harness.state.officialBrowserLoginSession, 'current-session',
    'the latest start response must become the active session');
  assert.equal(harness.timers.length, 1,
    'only the latest start response may schedule polling');
  assert.ok(harness.calls.some(({ url }) => url.includes('session=superseded-session')
    && url.includes('/login/browser/cancel?')),
  'the superseded browser session must be cancelled');
}

{
  const harness = createHarness('/login/browser/start', 2);
  const firstOperation = harness.sandbox.startOfficialBrowserLogin();
  await settle();
  harness.sandbox.closeLoginDialog();
  harness.els.loginDialog.hidden = false;
  const secondOperation = harness.sandbox.startOfficialBrowserLogin();
  await settle();

  harness.requests[0].reject(new Error('stale request failed'));
  await firstOperation;
  assert.equal(harness.state.officialBrowserLoginLoading, true,
    'a superseded request failure must not clear the current loading state');
  assert.doesNotMatch(harness.els.officialBrowserLoginStatus.textContent, /stale request failed/,
    'a superseded request failure must not overwrite the current status');

  harness.requests[1].resolve({ session: 'current-after-stale-failure', revision: 3 });
  await secondOperation;
  assert.equal(harness.state.officialBrowserLoginSession, 'current-after-stale-failure');
}

console.log('Official browser login client race regression: PASS');
