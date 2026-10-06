import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const achievementClient = fs.readFileSync(
  path.join(workspaceRoot, 'web', 'pixel-achievements.js'),
  'utf8'
);

class FakeClock {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, {
      id,
      at: this.now + Math.max(0, Number(delay) || 0),
      callback
    });
    return id;
  }

  clearTimeout(id) {
    this.tasks.delete(id);
  }

  requestAnimationFrame(callback) {
    return this.setTimeout(() => callback(this.now), 16);
  }

  advance(milliseconds) {
    const target = this.now + milliseconds;
    for (;;) {
      const next = [...this.tasks.values()]
        .filter((task) => task.at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (!next) break;
      this.tasks.delete(next.id);
      this.now = next.at;
      next.callback();
    }
    this.now = target;
  }

  get pendingCount() {
    return this.tasks.size;
  }
}

class MockClassList {
  constructor() {
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.names.has(name) : !!force;
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }

  replaceFromString(value) {
    this.names = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  toString() {
    return [...this.names].join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.classList = new MockClassList();
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.attributes = new Map();
    this.listeners = new Map();
    this.ownerDocument = null;
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this.classList.replaceFromString(value);
  }

  appendChild(child) {
    child.parentElement = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    child.parentElement = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    const dispatched = { ...event, target: event.target || this, currentTarget: this };
    [...(this.listeners.get(dispatched.type) || [])].forEach((listener) => listener(dispatched));
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const parts = String(selector).trim().split(/\s+/).filter(Boolean);
    let roots = [this];
    for (const part of parts) {
      const matches = [];
      roots.forEach((root) => {
        root.descendants().forEach((candidate) => {
          if (candidate.matchesSimpleSelector(part)) matches.push(candidate);
        });
      });
      roots = matches;
    }
    return roots;
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  matchesSimpleSelector(selector) {
    const tagName = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tagName && this.tagName !== tagName.toUpperCase()) return false;
    for (const match of selector.matchAll(/\.([\w-]+)/g)) {
      if (!this.classList.contains(match[1])) return false;
    }
    for (const match of selector.matchAll(/\[([\w-]+)(?:=[^\]]+)?\]/g)) {
      const attribute = match[1];
      if (attribute.startsWith('data-')) {
        const property = attribute.slice(5).replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase());
        if (!(property in this.dataset)) return false;
      } else if (!this.attributes.has(attribute)) {
        return false;
      }
    }
    return true;
  }
}

class MockCanvasElement extends MockElement {
  constructor() {
    super('canvas');
    this.width = 0;
    this.height = 0;
  }

  getContext() {
    return {
      imageSmoothingEnabled: true,
      fillStyle: '',
      clearRect() {},
      fillRect() {}
    };
  }
}

class MockLocalStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function createHarness({
  fetchImpl,
  storageSeed = {},
  withToast = false,
  withThemes = false,
  withAchievementGrid = false,
  withSoundControl = false
}) {
  const clock = new FakeClock();
  const localStorage = new MockLocalStorage(storageSeed);
  const elements = new Map();
  const addElement = (selector, element = new MockElement()) => {
    elements.set(selector, element);
    return element;
  };

  if (withThemes) {
    addElement('#communityProfilePanel');
    addElement('#achievementPageThemeSelect', new MockElement('select'));
    addElement('#achievementToastThemeSelect', new MockElement('select'));
  }

  if (withSoundControl) addElement('#achievementSoundToggle', new MockElement('input'));

  if (withToast || withThemes) {
    const toast = elements.get('#achievementToast') || addElement('#achievementToast');
    if (withToast) {
      const icon = addElement('#achievementToastIcon', new MockCanvasElement());
      const name = addElement('#achievementToastName');
      const copy = new MockElement();
      copy.appendChild(name);
      toast.appendChild(icon);
      toast.appendChild(copy);
    }
  }

  if (withAchievementGrid) {
    addElement('#communityAchievementGrid');
    addElement('#communityAchievementMeta');
  }

  const document = {
    activeElement: null,
    querySelector(selector) {
      return elements.get(selector) || null;
    },
    createElement(tagName) {
      const element = tagName.toLowerCase() === 'canvas'
        ? new MockCanvasElement()
        : new MockElement(tagName);
      element.ownerDocument = document;
      return element;
    }
  };
  elements.forEach((element) => { element.ownerDocument = document; });
  const audioInstances = [];
  const windowListeners = new Map();
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.preload = '';
      this.volume = 1;
      this.currentTime = 0;
      this.paused = true;
      this.playCount = 0;
      this.pauseCount = 0;
      audioInstances.push(this);
    }

    play() {
      this.paused = false;
      this.playCount += 1;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
      this.pauseCount += 1;
    }
  }
  const window = {
    localStorage,
    fetch: fetchImpl,
    Audio: MockAudio,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    requestAnimationFrame: clock.requestAnimationFrame.bind(clock),
    matchMedia: () => ({ matches: false }),
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      [...(windowListeners.get(event.type) || [])].forEach((listener) => listener(event));
      return true;
    }
  };
  const context = vm.createContext({
    console,
    document,
    HTMLCanvasElement: MockCanvasElement,
    window
  });
  vm.runInContext(achievementClient, context, { filename: 'web/pixel-achievements.js' });
  return {
    api: window.feAchievements,
    clock,
    document,
    elements,
    localStorage,
    audioInstances,
    window
  };
}

async function settleMicrotasks(turns = 12) {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

async function eventually(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await settleMicrotasks(2);
  }
  assert.fail(message);
}

const emptyServerState = Object.freeze({
  version: 2,
  progress: Object.freeze({}),
  unlocked: Object.freeze({}),
  themes: Object.freeze({ page: 'classic', toast: 'classic' }),
  settings: Object.freeze({ soundEnabled: true })
});

const populatedServerState = Object.freeze({
  version: 2,
  progress: Object.freeze({ 'gap-runner': 3 }),
  unlocked: Object.freeze({
    'world-peace': Object.freeze({ unlockedAt: 1712345679000 })
  }),
  themes: Object.freeze({ page: 'frost', toast: 'void' }),
  settings: Object.freeze({ soundEnabled: true })
});

const scopedStorageKey = (scope) => `fe-monster-achievements-v2:${encodeURIComponent(scope)}`;

async function checkAccountScopedLocalWinsWithoutProgressRegression() {
  const scope = 'netease:account-alpha';
  const localState = {
    version: 2,
    progress: { 'gap-runner': 7 },
    unlocked: { 'first-block': { unlockedAt: 1712345678000 } },
    themes: { page: 'forge', toast: 'classic' },
    settings: { soundEnabled: false },
    ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } }
  };
  const postBodies = [];
  const withSync = (state) => ({
    ...state,
    _sync: {
      scope,
      provider: 'netease',
      accountId: 'account-alpha',
      remoteRequired: true,
      serverSynced: true
    }
  });
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, withSync(populatedServerState)));
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, withSync(payload)));
  };

  const harness = createHarness({
    fetchImpl,
    withThemes: true,
    storageSeed: { [scopedStorageKey(scope)]: JSON.stringify(localState) }
  });
  await harness.api.ready;
  await settleMicrotasks();

  assert.equal(harness.api.getProgress('gap-runner'), 7,
    'a lower server value regressed account-scoped local progress');
  assert.equal(harness.api.isUnlocked('first-block'), true,
    'account-scoped local unlock was not loaded');
  assert.equal(harness.api.isUnlocked('world-peace'), true,
    'server unlock was not unioned into the account-scoped local state');
  assert.equal(
    harness.elements.get('#communityProfilePanel').dataset.achievementPageTheme,
    'forge',
    'valid account-scoped local preferences did not remain authoritative'
  );
  const persisted = JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope)));
  assert.equal(persisted.progress['gap-runner'], 7);
  assert.equal(postBodies.length, 1, 'the merged account state was not uploaded exactly once');
  assert.equal(postBodies[0].progress['gap-runner'], 7);
  assert.ok(postBodies[0].unlocked['first-block']);
  assert.ok(postBodies[0].unlocked['world-peace']);
}

async function checkCorruptAccountLocalRestoresFromServer() {
  const scope = 'netease:account-recovery';
  const withSync = (state) => ({
    ...state,
    _sync: {
      scope,
      provider: 'netease',
      accountId: 'account-recovery',
      remoteRequired: true,
      serverSynced: true
    }
  });
  const fetchImpl = (_url, options = {}) => Promise.resolve(jsonResponse(
    200,
    withSync(String(options.method || 'GET').toUpperCase() === 'GET'
      ? populatedServerState
      : JSON.parse(options.body))
  ));
  const harness = createHarness({
    fetchImpl,
    storageSeed: { [scopedStorageKey(scope)]: '{broken-json' }
  });

  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.api.getProgress('gap-runner'), 3,
    'corrupt account-local progress was not restored from the server');
  assert.equal(harness.api.isUnlocked('world-peace'), true,
    'corrupt account-local unlocks were not restored from the server');
  const repaired = JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope)));
  assert.equal(repaired.progress['gap-runner'], 3,
    'restored server progress was not repaired into the account-local copy');
}

async function checkOfflineLocalUseAndReconnectUpload() {
  const scope = 'netease:account-offline';
  const localState = {
    version: 2,
    progress: { 'gap-runner': 7 },
    unlocked: { 'first-block': { unlockedAt: 1712345678000 } },
    themes: { page: 'classic', toast: 'classic' },
    settings: { soundEnabled: true },
    ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } }
  };
  let online = false;
  let getCount = 0;
  const postBodies = [];
  const withSync = (state, serverSynced) => ({
    ...state,
    _sync: {
      scope,
      provider: 'netease',
      accountId: 'account-offline',
      remoteRequired: true,
      serverSynced
    }
  });
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      return Promise.resolve(jsonResponse(200, withSync(
        online ? populatedServerState : emptyServerState,
        online
      )));
    }
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, withSync(payload, online)));
  };
  const harness = createHarness({
    fetchImpl,
    storageSeed: { [scopedStorageKey(scope)]: JSON.stringify(localState) }
  });

  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('first-block'), true,
    'offline startup did not expose the account-local achievement state');
  assert.equal(harness.api.getProgress('gap-runner'), 7,
    'offline startup did not expose account-local progress');
  assert.equal(postBodies.length, 0,
    'offline startup uploaded empty defaults instead of waiting for the mirror');
  assert.equal(harness.api.unlock('gap-runner', { silent: true }), true,
    'offline client could not unlock a new achievement');
  assert.equal(harness.api.claimOrnament('gap-runner'), true,
    'offline client could not claim the newly unlocked ornament');
  const offlineSaved = JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope)));
  assert.ok(offlineSaved.unlocked['gap-runner'],
    'offline achievement unlock was not saved locally');
  assert.ok(offlineSaved.ornaments.claimed['gap-runner'],
    'offline ornament claim was not saved locally');
  // A pending mirror backup still writes the durable per-account copy, so the
  // unlock survives a restart even before the mirror returns.
  await eventually(() => postBodies.length >= 1,
    'offline progress did not reach the durable app backend store');
  assert.equal(postBodies[0].progress['gap-runner'], 7,
    'offline durable write regressed the higher local progress');
  assert.ok(postBodies[0].unlocked['first-block'],
    'offline durable write lost the account-local unlock');

  online = true;
  harness.clock.advance(5000);
  await eventually(() => getCount >= 2, 'reconnect did not retry server hydration');
  await eventually(
    () => postBodies.some((payload) => payload.unlocked?.['world-peace']),
    'reconnect did not upload the restored server state'
  );
  const reconnectUpload = postBodies.filter((payload) => payload.unlocked?.['world-peace']).at(-1);
  assert.equal(reconnectUpload.progress['gap-runner'], 7,
    'reconnect upload regressed the higher offline progress');
  assert.ok(reconnectUpload.unlocked['first-block'],
    'reconnect upload lost the offline unlock');
  assert.ok(reconnectUpload.unlocked['world-peace'],
    'reconnect upload did not include the restored server unlock');
  assert.ok(reconnectUpload.ornaments.claimed['gap-runner'],
    'reconnect upload did not back up the offline ornament claim');
}

async function checkEqualTimestampEquipmentConverges() {
  const scope = 'netease:equipment-convergence';
  const changedAt = 1712345685000;
  const base = {
    version: 2,
    progress: {},
    unlocked: {
      'first-block': { unlockedAt: 1712345681000 },
      'world-peace': { unlockedAt: 1712345682000 }
    },
    themes: { page: 'classic', toast: 'classic' },
    settings: { soundEnabled: true },
    ornaments: {
      claimed: {
        'first-block': { claimedAt: 1712345683000 },
        'world-peace': { claimedAt: 1712345684000 }
      },
      equipped: { achievementId: 'first-block', changedAt }
    }
  };
  const serverState = {
    ...base,
    ornaments: {
      ...base.ornaments,
      equipped: { achievementId: 'world-peace', changedAt }
    }
  };
  const withSync = (state) => ({
    ...state,
    _sync: {
      scope,
      provider: 'netease',
      accountId: 'equipment-convergence',
      remoteRequired: true,
      serverSynced: true
    }
  });
  const posts = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, withSync(serverState)));
    const payload = JSON.parse(options.body);
    posts.push(payload);
    return Promise.resolve(jsonResponse(200, withSync(serverState)));
  };
  const harness = createHarness({
    fetchImpl,
    storageSeed: { [scopedStorageKey(scope)]: JSON.stringify(base) }
  });
  await harness.api.ready;
  await eventually(() => posts.length === 1, 'equipment convergence state was not synchronized');
  assert.equal(harness.api.getOrnamentState().equipped.achievementId, 'world-peace',
    'client/server equal-timestamp equipment states did not converge');
  const persisted = JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope)));
  assert.equal(persisted.ornaments.equipped.achievementId, 'world-peace',
    'converged equipment state was not repaired into local storage');
}

async function checkAccountSwitchKeepsLocalStatesIsolated() {
  const alphaScope = 'netease:account-alpha-switch';
  const betaScope = 'netease:20002';
  const localState = (id, progress) => ({
    version: 2,
    progress: { 'gap-runner': progress },
    unlocked: { [id]: { unlockedAt: 1712345678000 + progress } },
    themes: { page: 'classic', toast: 'classic' },
    settings: { soundEnabled: true },
    ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } }
  });
  let serverScope = alphaScope;
  let getCount = 0;
  const postBodies = [];
  const response = (state) => ({
    ...state,
    _sync: {
      scope: serverScope,
      provider: 'netease',
      accountId: serverScope === alphaScope ? 'account-alpha-switch' : '20002',
      remoteRequired: true,
      serverSynced: true
    }
  });
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      return Promise.resolve(jsonResponse(200, response(emptyServerState)));
    }
    const payload = JSON.parse(options.body);
    postBodies.push({ scope: serverScope, payload });
    return Promise.resolve(jsonResponse(200, response(payload)));
  };
  const harness = createHarness({
    fetchImpl,
    storageSeed: {
      [scopedStorageKey(alphaScope)]: JSON.stringify(localState('first-block', 8)),
      [scopedStorageKey(betaScope)]: JSON.stringify(localState('world-peace', 2))
    }
  });
  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('first-block'), true);

  const previousGetCount = getCount;
  serverScope = betaScope;
  harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
    detail: {
      provider: 'netease',
      loggedIn: true,
      account: { userId: 20002 }
    }
  }));
  assert.equal(harness.api.isUnlocked('world-peace'), true,
    'numeric account identity did not activate its local state synchronously');
  assert.equal(harness.api.isUnlocked('first-block'), false,
    'previous account state remained visible after a numeric account switch');
  await eventually(() => getCount > previousGetCount, 'account switch did not rehydrate achievements');
  await eventually(() => harness.api.isUnlocked('world-peace'), 'beta local state was not activated');
  assert.equal(harness.api.isUnlocked('first-block'), false,
    'alpha unlock leaked into beta account-local state');
  assert.equal(harness.api.getProgress('gap-runner'), 2,
    'beta account did not retain its independent local progress');
  await eventually(
    () => postBodies.some((entry) => entry.scope === betaScope),
    'beta account state was not synchronized'
  );
  const betaPost = postBodies.filter((entry) => entry.scope === betaScope).at(-1)?.payload;
  assert.ok(betaPost, 'beta account state was not synchronized');
  assert.equal(betaPost.unlocked['first-block'], undefined,
    'alpha unlock leaked into the beta server upload');
}

async function checkPostOutageReconnectsAfterRetryBudget() {
  const scope = 'netease:account-post-outage';
  let online = true;
  let getCount = 0;
  const postBodies = [];
  const withSync = (state) => ({
    ...state,
    _sync: {
      scope,
      provider: 'netease',
      accountId: 'account-post-outage',
      remoteRequired: true,
      serverSynced: online
    }
  });
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      return Promise.resolve(jsonResponse(200, withSync(emptyServerState)));
    }
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, withSync(payload)));
  };
  const harness = createHarness({ fetchImpl });
  await harness.api.ready;
  await eventually(() => postBodies.length === 1, 'initial online synchronization did not finish');

  // The community mirror is a deferred backup.  Its outage must not stop the
  // app backend's per-account file from receiving new progress, otherwise a
  // restart (which always starts from a fresh web-view storage area) looks like
  // a reset achievement profile.
  online = false;
  assert.equal(harness.api.setProgress('gap-runner', 6), true);
  await eventually(() => postBodies.length === 2, 'offline progress write did not reach the app backend');
  assert.equal(postBodies[1].progress['gap-runner'], 6,
    'offline progress write to the app backend lost the local value');
  for (const delay of [180, 650, 1800]) {
    harness.clock.advance(delay);
    await settleMicrotasks();
  }
  const postsAfterBudget = postBodies.length;
  assert.equal(postsAfterBudget, 2, 'a pending mirror backup retried the local save unexpectedly');
  assert.ok(harness.clock.pendingCount > 0, 'a pending mirror backup did not schedule its reconnect retry');

  online = true;
  const getsBeforeReconnect = getCount;
  harness.clock.advance(5000);
  await eventually(() => getCount > getsBeforeReconnect,
    'a pending mirror backup did not retry hydration after reconnecting');
  await eventually(() => postBodies.length > postsAfterBudget,
    'reconnect hydration did not upload the locally saved progress');
  assert.equal(postBodies.at(-1).progress['gap-runner'], 6,
    'post-outage reconnect upload lost local progress');
}

async function checkSerializedLatestThemeWrite() {
  let activePosts = 0;
  let maximumConcurrentPosts = 0;
  let savedState = null;
  const posts = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, emptyServerState));

    const payload = JSON.parse(options.body);
    activePosts += 1;
    maximumConcurrentPosts = Math.max(maximumConcurrentPosts, activePosts);
    let release;
    const response = new Promise((resolve) => {
      release = (status = 200) => {
        if (status >= 200 && status < 300) savedState = payload;
        activePosts -= 1;
        resolve(jsonResponse(status, payload));
      };
    });
    posts.push({ payload, release });
    return response;
  };

  const harness = createHarness({ fetchImpl });
  await harness.api.ready;
  await eventually(() => posts.length === 1, 'initial server synchronization did not start');
  posts[0].release();
  await eventually(() => activePosts === 0, 'initial server synchronization did not finish');

  const firstThemePost = posts.length;
  assert.equal(harness.api.setTheme('page', 'forge'), true);
  await eventually(() => posts.length === firstThemePost + 1, 'forge POST did not start');
  assert.equal(harness.api.setTheme('page', 'frost'), true);
  assert.equal(activePosts, 1, 'frost update opened a concurrent POST while forge was in flight');

  posts[firstThemePost].release();
  await eventually(() => posts.length === firstThemePost + 2, 'frost POST did not follow forge');
  assert.equal(activePosts, 1, 'the queued frost POST must remain the sole in-flight write');
  posts[firstThemePost + 1].release();
  await eventually(() => activePosts === 0, 'queued frost POST did not finish');

  assert.equal(maximumConcurrentPosts, 1, 'achievement POST concurrency exceeded one');
  assert.equal(posts.at(-1).payload.themes.page, 'frost', 'the final POST did not carry frost');
  assert.equal(savedState.themes.page, 'frost', 'the simulated server did not finish on frost');
}

async function checkLegacyMigrationRetry() {
  const legacyState = {
    version: 1,
    unlocked: { 'secret-left': { unlockedAt: 1712345678000 } }
  };
  const postBodies = [];
  let savedState = null;
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, emptyServerState));
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    if (postBodies.length === 1) return Promise.resolve(jsonResponse(503, { ok: false }));
    savedState = payload;
    return Promise.resolve(jsonResponse(200, payload));
  };

  const harness = createHarness({
    fetchImpl,
    storageSeed: { 'fe-monster-achievements-v1': JSON.stringify(legacyState) }
  });
  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(postBodies.length, 1, 'migration must attempt one immediate POST');
  assert.equal(postBodies[0].unlocked['secret-left'].unlockedAt, 1712345678000);

  harness.clock.advance(179);
  await settleMicrotasks();
  assert.equal(postBodies.length, 1, 'migration retried before its bounded backoff elapsed');
  harness.clock.advance(1);
  await settleMicrotasks();
  assert.equal(postBodies.length, 2, 'migration did not retry after the first 503');
  assert.equal(savedState?.unlocked?.['secret-left']?.unlockedAt, 1712345678000,
    'successful migration retry did not save secret-left');

  harness.clock.advance(10000);
  await settleMicrotasks();
  assert.equal(postBodies.length, 2, 'successful migration continued retrying indefinitely');
  assert.equal(harness.clock.pendingCount, 0, 'successful migration left a retry timer behind');
}

async function checkLegacyUnlockUnionKeepsServerThemes() {
  const legacyState = {
    version: 1,
    unlocked: { 'secret-left': { unlockedAt: 1712345678000 } }
  };
  const postBodies = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, populatedServerState));
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, payload));
  };

  const harness = createHarness({
    fetchImpl,
    withThemes: true,
    storageSeed: { 'fe-monster-achievements-v1': JSON.stringify(legacyState) }
  });
  await harness.api.ready;
  await settleMicrotasks();

  assert.equal(harness.api.isUnlocked('secret-left'), true, 'legacy secret-left was lost during hydration');
  assert.equal(harness.api.isUnlocked('world-peace'), true, 'server world-peace was lost during hydration');
  assert.equal(
    harness.elements.get('#communityProfilePanel').dataset.achievementPageTheme,
    'frost',
    'legacy default page theme overrode the server frost preference'
  );
  assert.equal(
    harness.elements.get('#achievementToast').dataset.achievementToastTheme,
    'void',
    'legacy default toast theme overrode the server void preference'
  );
  assert.equal(postBodies.length, 1, 'hydrated union must be synchronized exactly once');
  assert.equal(postBodies[0].unlocked['secret-left'].unlockedAt, 1712345678000);
  assert.equal(postBodies[0].unlocked['world-peace'].unlockedAt, 1712345679000);
  assert.deepEqual(postBodies[0].themes, { page: 'frost', toast: 'void' });
}

async function checkGetRetryNeverPostsEmptyDefaults() {
  let getCount = 0;
  let releaseSecondGet = null;
  const postBodies = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') {
      getCount += 1;
      if (getCount === 1) return Promise.resolve(jsonResponse(503, { ok: false }));
      return new Promise((resolve) => {
        releaseSecondGet = () => resolve(jsonResponse(200, populatedServerState));
      });
    }
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, payload));
  };

  const harness = createHarness({ fetchImpl, withThemes: true });
  const ready = harness.api.ready;
  await settleMicrotasks();
  assert.equal(getCount, 1, 'initial hydration GET was not attempted');
  assert.equal(postBodies.length, 0, 'empty defaults were POSTed after the first GET failed');

  harness.clock.advance(179);
  await settleMicrotasks();
  assert.equal(getCount, 1, 'hydration retried before its backoff elapsed');
  assert.equal(postBodies.length, 0, 'empty defaults were POSTed during GET backoff');
  harness.clock.advance(1);
  await settleMicrotasks();
  assert.equal(getCount, 2, 'hydration did not issue its second GET');
  assert.equal(postBodies.length, 0, 'state was POSTed before the second GET returned');

  releaseSecondGet();
  await ready;
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('world-peace'), true, 'second GET server state was not hydrated');
  assert.equal(
    harness.elements.get('#communityProfilePanel').dataset.achievementPageTheme,
    'frost'
  );
  assert.equal(
    harness.elements.get('#achievementToast').dataset.achievementToastTheme,
    'void'
  );
  assert.equal(postBodies.length, 1, 'successful hydration must synchronize once');
  assert.equal(postBodies[0].unlocked['world-peace'].unlockedAt, 1712345679000,
    'post-retry synchronization overwrote server achievements with an empty state');
  assert.deepEqual(postBodies[0].themes, { page: 'frost', toast: 'void' },
    'post-retry synchronization overwrote server themes with classic defaults');
}

async function checkToastHoldStartsAfterEntry() {
  const fetchImpl = (_url, options = {}) => Promise.resolve(
    jsonResponse(200, String(options.method || 'GET').toUpperCase() === 'GET'
      ? emptyServerState
      : JSON.parse(options.body))
  );
  const harness = createHarness({ fetchImpl, withToast: true });
  await harness.api.ready;
  await settleMicrotasks();

  const toast = harness.elements.get('#achievementToast');
  assert.equal(harness.api.unlock('first-block', { sound: false }), true);
  assert.equal(toast.hidden, false, 'toast did not enter the DOM');
  harness.clock.advance(32);
  assert.equal(toast.classList.contains('is-visible'), true, 'toast did not enter after two paint frames');

  harness.clock.advance(368);
  assert.equal(toast.classList.contains('is-leaving'), false, 'toast left before entry transitionend');
  toast.dispatchEvent({ type: 'transitionend', propertyName: 'transform' });
  harness.clock.advance(2999);
  assert.equal(toast.classList.contains('is-leaving'), false,
    'toast did not hold for the full 3000ms after entry transitionend');
  harness.clock.advance(1);
  assert.equal(toast.classList.contains('is-leaving'), true,
    'toast did not enter is-leaving after its complete 3000ms hold');
}

async function checkIndependentThemeControls() {
  const fetchImpl = (_url, options = {}) => Promise.resolve(
    jsonResponse(200, String(options.method || 'GET').toUpperCase() === 'GET'
      ? emptyServerState
      : JSON.parse(options.body))
  );
  const harness = createHarness({ fetchImpl, withThemes: true });
  await harness.api.ready;
  await settleMicrotasks();

  const panel = harness.elements.get('#communityProfilePanel');
  const toast = harness.elements.get('#achievementToast');
  const pageSelect = harness.elements.get('#achievementPageThemeSelect');
  const toastSelect = harness.elements.get('#achievementToastThemeSelect');

  pageSelect.value = 'forge';
  pageSelect.dispatchEvent({ type: 'change' });
  assert.equal(panel.dataset.achievementPageTheme, 'forge');
  assert.equal(toast.dataset.achievementToastTheme, 'classic',
    'page theme change leaked into the toast theme');

  toastSelect.value = 'frost';
  toastSelect.dispatchEvent({ type: 'change' });
  assert.equal(panel.dataset.achievementPageTheme, 'forge',
    'toast theme change leaked into the page theme');
  assert.equal(toast.dataset.achievementToastTheme, 'frost');

  const persisted = JSON.parse(harness.localStorage.getItem('fe-monster-achievements-v2'));
  assert.deepEqual(persisted.themes, { page: 'forge', toast: 'frost' },
    'independent page/toast themes were not persisted together');
}

async function checkRenderAndUnlockPreserveNodeFocus() {
  const fetchImpl = (_url, options = {}) => Promise.resolve(
    jsonResponse(200, String(options.method || 'GET').toUpperCase() === 'GET'
      ? emptyServerState
      : JSON.parse(options.body))
  );
  const harness = createHarness({ fetchImpl, withAchievementGrid: true });
  await harness.api.ready;
  await settleMicrotasks();

  const grid = harness.elements.get('#communityAchievementGrid');
  const findNode = (id) => grid
    .querySelectorAll('.community-achievement-node[data-achievement-id]')
    .find((node) => node.dataset.achievementId === id);
  const originalNode = findNode('first-block');
  assert.ok(originalNode, 'first-block node was not rendered');
  originalNode.focus();

  assert.equal(harness.api.render(), true);
  assert.equal(findNode('first-block'), originalNode, 'render replaced the first-block DOM node');
  assert.equal(harness.document.activeElement, originalNode, 'render moved focus away from first-block');

  assert.equal(harness.api.unlock('first-block', { silent: true }), true);
  assert.equal(findNode('first-block'), originalNode, 'unlock replaced the first-block DOM node');
  assert.equal(harness.document.activeElement, originalNode, 'unlock moved focus away from first-block');
  assert.equal(originalNode.classList.contains('is-unlocked'), true,
    'the preserved first-block node was not updated to unlocked');
}

async function checkSoundControlPersistsAndGatesSuppliedAudio() {
  const postBodies = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, emptyServerState));
    const payload = JSON.parse(options.body);
    postBodies.push(payload);
    return Promise.resolve(jsonResponse(200, payload));
  };
  const harness = createHarness({
    fetchImpl,
    withToast: true,
    withSoundControl: true
  });
  await harness.api.ready;
  await settleMicrotasks();

  const toggle = harness.elements.get('#achievementSoundToggle');
  assert.equal(toggle.checked, true, 'achievement sound did not hydrate as enabled');
  toggle.checked = false;
  toggle.dispatchEvent({ type: 'change' });
  assert.equal(harness.api.unlock('first-block'), true);
  assert.equal(harness.audioInstances.length, 0,
    'disabled achievement sound still created an audio player');
  const persistedOff = JSON.parse(harness.localStorage.getItem('fe-monster-achievements-v2'));
  assert.equal(persistedOff.settings.soundEnabled, false,
    'disabled achievement sound was not persisted locally');

  const toast = harness.elements.get('#achievementToast');
  toast.dispatchEvent({ type: 'transitionend', propertyName: 'transform' });
  harness.clock.advance(3000);
  toast.dispatchEvent({ type: 'transitionend', propertyName: 'transform' });

  toggle.checked = true;
  toggle.dispatchEvent({ type: 'change' });
  assert.equal(harness.api.unlock('gap-runner'), true);
  assert.equal(harness.audioInstances.length, 1,
    'enabled achievement sound did not create the supplied-audio player');
  assert.match(harness.audioInstances[0].src, /audio\/achievement-unlock\.wav\?/);
  assert.equal(harness.audioInstances[0].playCount, 1,
    'enabled achievement sound did not play exactly once for the unlock');
  await eventually(
    () => postBodies.some((payload) => payload.settings?.soundEnabled === true),
    're-enabled achievement sound was not persisted to the server'
  );
}

async function checkCompletionistRequiresEveryPrerequisiteAndFinalTask() {
  const createCompletionistHarness = async () => {
    const fetchImpl = (_url, options = {}) => Promise.resolve(
      jsonResponse(200, String(options.method || 'GET').toUpperCase() === 'GET'
        ? emptyServerState
        : JSON.parse(options.body))
    );
    const harness = createHarness({ fetchImpl, withAchievementGrid: true });
    await harness.api.ready;
    await settleMicrotasks();
    return harness;
  };

  const probe = await createCompletionistHarness();
  const completionist = Array.from(probe.api.catalog)
    .find((achievement) => achievement.id === 'completionist');
  assert.equal(completionist?.name, '??????', 'ultimate achievement name must be exactly six question marks');
  const required = Array.from(completionist?.prerequisiteIds || []);
  assert.deepEqual(
    required,
    Array.from(probe.api.catalog)
      .map((achievement) => achievement.id)
      .filter((id) => id !== 'completionist'),
    'ultimate achievement prerequisite list must include every other achievement'
  );

  for (const missingId of required) {
    const harness = await createCompletionistHarness();
    required.filter((id) => id !== missingId).forEach((id) => {
      assert.equal(harness.api.unlock(id, { silent: true }), true);
      assert.equal(harness.api.claimOrnament(id), true);
    });
    assert.equal(
      harness.api.unlock('completionist', { silent: true }),
      false,
      `ultimate achievement bypassed missing prerequisite: ${missingId}`
    );
  }

  const harness = await createCompletionistHarness();
  required.forEach((id) => {
    assert.equal(harness.api.unlock(id, { silent: true }), true);
  });
  assert.equal(harness.api.isUnlocked('completionist'), false,
    'ultimate achievement unlocked before the final ornament task');
  required.slice(0, -1).forEach((id) => {
    assert.equal(harness.api.claimOrnament(id), true);
  });
  assert.equal(harness.api.unlock('completionist', { silent: true }), false,
    'ultimate achievement bypassed the incomplete final ornament task');
  assert.equal(harness.api.claimOrnament(required.at(-1)), true);
  assert.equal(harness.api.isUnlocked('completionist'), true,
    'ultimate achievement did not unlock after every prerequisite and the final task');

  const grid = harness.elements.get('#communityAchievementGrid');
  const node = grid
    .querySelectorAll('.community-achievement-node[data-achievement-id]')
    .find((candidate) => candidate.dataset.achievementId === 'completionist');
  assert.ok(node, 'ultimate achievement card was not rendered');
  const detail = node.querySelector('.achievement-node-requirements');
  assert.ok(detail, 'ultimate achievement card has no prerequisite detail');
  const items = detail.querySelectorAll('.achievement-node-requirement');
  assert.equal(items.length, required.length + 1,
    'ultimate achievement detail does not list every prerequisite and final task');
  assert.equal(items.every((item) => item.classList.contains('is-complete')), true,
    'ultimate achievement detail did not mark completed tasks');
  assert.match(
    node.attributes.get('aria-label') || '',
    /前提任务.*终局条件/,
    'ultimate achievement accessible detail does not explain its prerequisite and final tasks'
  );
}

async function checkFlushWaitsForTargetRevisionBeforeQuit() {
  const posts = [];
  const fetchImpl = (_url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return Promise.resolve(jsonResponse(200, emptyServerState));
    const payload = JSON.parse(options.body);
    let release;
    const response = new Promise((resolve) => {
      release = () => resolve(jsonResponse(200, payload));
    });
    posts.push({ payload, release });
    return response;
  };

  const harness = createHarness({ fetchImpl });
  await harness.api.ready;
  await eventually(() => posts.length === 1, 'initial hydration POST did not start');
  posts[0].release();
  await settleMicrotasks();

  assert.equal(harness.api.unlock('first-block', { silent: true }), true);
  await eventually(() => posts.length === 2, 'unlock POST did not start');
  const appWindowActions = [];
  const requestAppWindowAction = async (action) => {
    appWindowActions.push(action);
    return { ok: true };
  };
  let flushResult = null;
  const quitFlow = (async () => {
    flushResult = await harness.api.flush({ timeout: 1000 });
    await requestAppWindowAction('quit');
  })();

  await settleMicrotasks();
  assert.deepEqual(appWindowActions, [], 'quit ran while the unlock POST was unresolved');
  assert.equal(posts[1].payload.unlocked['first-block'] != null, true,
    'flush target POST did not contain the newly unlocked achievement');

  posts[1].release();
  await settleMicrotasks();
  assert.deepEqual(appWindowActions, [], 'quit ran before flush observed its target revision');
  harness.clock.advance(24);
  await settleMicrotasks();
  await quitFlow;
  assert.equal(flushResult, true, 'flush did not confirm its target revision');
  assert.deepEqual(appWindowActions, ['quit'], 'quit did not run exactly once after flush completed');
}

async function checkPlaybackWaitsForRestoredAchievement() {
  let release;
  const restored = {
    ...emptyServerState,
    unlocked: { 'first-play': { unlockedAt: 1712345678000 } },
    _sync: { provider: 'netease', scope: 'netease:123', serverSynced: true }
  };
  const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) => {
    if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
    return new Promise(resolve => { release = () => resolve(jsonResponse(200, restored)); });
  } });
  harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  assert.equal(harness.audioInstances.length, 0, 'startup playback notified before restoring the account');
  release();
  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('first-play'), true);
  assert.equal(harness.audioInstances.length, 0, 'restored first-play was announced again');
  harness.window.dispatchEvent(new harness.window.CustomEvent('fe-monster-community-profile', {
    detail: { provider: 'netease', loggedIn: true, hasCommunityIdentity: false,
      account: { userId: '123' } }
  }));
  harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  assert.equal(harness.api.isUnlocked('first-play'), true, 'missing community profile discarded account achievements');
  assert.equal(harness.audioInstances.length, 0, 'temporary missing profile replayed first-play');
  harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
    detail: { provider: 'netease', loggedIn: false, resolved: false }
  }));
  assert.equal(harness.api.isUnlocked('first-play'), true, 'unresolved login status discarded account achievements');
}

async function checkFirstPlaybackPersistsAcrossRestart() {
  let release;
  const fetchImpl = (_url, options = {}) => options.method === 'POST'
    ? Promise.resolve(jsonResponse(200, JSON.parse(options.body)))
    : new Promise(resolve => { release = () => resolve(jsonResponse(200, emptyServerState)); });
  const harness = createHarness({ withToast: true, fetchImpl });
  harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  release();
  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.audioInstances.length, 1, 'first-ever playback must announce exactly once after restoration');
  const saved = harness.localStorage.getItem('fe-monster-achievements-v2');
  assert.ok(JSON.parse(saved).unlocked['first-play'], 'first-play was not saved locally');

  const restarted = createHarness({ withToast: true, fetchImpl,
    storageSeed: { 'fe-monster-achievements-v2': saved }
  });
  restarted.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  release();
  await restarted.api.ready;
  assert.equal(restarted.api.isUnlocked('first-play'), true);
  assert.equal(restarted.audioInstances.length, 0, 'restarting with a saved unlock must stay silent');
}

async function checkStaleFailedHydrationCannotReleasePlayback() {
  let rejectOld;
  let releaseCurrent;
  let gets = 0;
  const restored = { ...emptyServerState,
    unlocked: { 'first-play': { unlockedAt: 1712345678000 } },
    _sync: { provider: 'netease', scope: 'netease:456', serverSynced: true }
  };
  const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) => {
    if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
    gets += 1;
    if (gets === 1) return new Promise((_resolve, reject) => { rejectOld = reject; });
    if (gets === 2) return new Promise(resolve => { releaseCurrent = () => resolve(jsonResponse(200, restored)); });
    return Promise.resolve(jsonResponse(503, {}));
  } });
  harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
    detail: { provider: 'netease', loggedIn: true, account: { userId: '456' } }
  }));
  harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
  rejectOld(new Error('previous account unavailable'));
  await settleMicrotasks();
  for (const delay of [180, 650, 1800]) {
    harness.clock.advance(delay);
    await settleMicrotasks();
  }
  assert.equal(harness.audioInstances.length, 0,
    'a stale failed account restore released playback before the current account was loaded');
  releaseCurrent();
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('first-play'), true);
  assert.equal(harness.audioInstances.length, 0);
}

async function checkRememberedAccountScopeSurvivesUnresolvedLogin() {
  // The music-API plugin frequently is not listening yet when the client asks
  // for its achievements right after launch, so the local service answers with
  // the scope it remembered for the last confirmed music-platform account.
  // That answer must restore the account partition instead of the empty
  // anonymous one.
  const scope = 'netease:remembered-account';
  const harness = createHarness({ withToast: true, fetchImpl: (url, options = {}) => {
    if (!url.startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
    if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
    return Promise.resolve(jsonResponse(200, {
      ...emptyServerState,
      unlocked: { 'first-play': { unlockedAt: 1712345678000 } },
      _sync: {
        provider: 'netease',
        scope,
        accountId: 'remembered-account',
        confirmed: false,
        remembered: true,
        serverSynced: true
      }
    }));
  } });
  harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
    detail: { provider: 'netease', loggedIn: false, resolved: true }
  }));
  await harness.api.ready;
  await settleMicrotasks();
  assert.equal(harness.api.isUnlocked('first-play'), true,
    'a remembered music-platform account lost its achievements on restart');
  const stored = harness.localStorage.getItem(scopedStorageKey(scope));
  assert.ok(stored && JSON.parse(stored).unlocked['first-play'],
    'the remembered account partition was not adopted locally');
  assert.equal(harness.audioInstances.length, 0,
    'restoring a remembered account replayed an existing unlock');
}

async function checkPlaybackBeforeInitialAccountResolution() {
  for (const alreadyUnlocked of [false, true]) {
    const loads = [];
    const harness = createHarness({ withToast: true, fetchImpl: (url, options = {}) => {
      if (!url.startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
      if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
      return new Promise(resolve => { loads.push(payload => resolve(jsonResponse(200, payload))); });
    } });
    harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-monster-community-profile', {
      detail: { provider: 'netease', loggedIn: true, resolved: true,
        hasCommunityIdentity: false, account: { userId: 'initial-account' } }
    }));
    assert.equal(loads.length, 2, 'initial account resolution did not start its own restore');
    loads[0]({ ...emptyServerState,
      _sync: { provider: 'netease', scope: 'anonymous', serverSynced: true }
    });
    await harness.api.ready;
    assert.equal(harness.audioInstances.length, 0, 'a stale anonymous restore released the pending playback');
    loads[1]({ ...emptyServerState,
      unlocked: alreadyUnlocked ? { 'first-play': { unlockedAt: 1712345678000 } } : {},
      _sync: { provider: 'netease', scope: 'netease:initial-account', serverSynced: true }
    });
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-play'), true,
      'initial account resolution discarded the first real playback');
    assert.equal(harness.audioInstances.length, alreadyUnlocked ? 0 : 1,
      'pending initial playback must announce only a genuinely new unlock');
    const saved = JSON.parse(harness.localStorage.getItem(scopedStorageKey('netease:initial-account')));
    assert.ok(saved.unlocked['first-play'], 'the initial pending playback unlock was not persisted to its account');
  }
}

async function checkPendingPlaybackStaysWithResolvedAccount() {
  for (const nextAccountId of ['account-b', null]) {
    const loads = [];
    const harness = createHarness({ withToast: true, fetchImpl: (url, options = {}) => {
      if (!url.startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
      if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
      return new Promise(resolve => { loads.push(payload => resolve(jsonResponse(200, payload))); });
    } });
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: true, resolved: true, account: { userId: 'account-a' } }
    }));
    harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track-a' });
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-monster-community-profile', {
      detail: { provider: 'netease', loggedIn: !!nextAccountId, resolved: true,
        account: nextAccountId ? { userId: nextAccountId } : null }
    }));
    assert.equal(loads.length, 3);
    for (const [index, scope] of ['anonymous', 'netease:account-a',
      nextAccountId ? `netease:${nextAccountId}` : 'anonymous'].entries()) {
      loads[index]({ ...emptyServerState,
        _sync: { provider: 'netease', scope, serverSynced: true }
      });
    }
    await harness.api.ready;
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-play'), false,
      'account A pending playback leaked through an account switch or logout');
    assert.equal(harness.audioInstances.length, 0,
      'account A pending playback notified a different account');
    harness.api.handlePlaybackStarted({ title: '新的播放', id: 'track-b' });
    assert.equal(harness.api.isUnlocked('first-play'), true, 'the new scope could not unlock its own first playback');
    assert.equal(harness.audioInstances.length, 1);
  }
}

async function checkProfileAccountRestoresBeforePlayback() {
  for (const hasCommunityIdentity of [true, false]) {
    const scope = 'netease:profile-first';
    let initialLoad = true;
    let releaseAccount;
    const restored = {
      ...emptyServerState,
      unlocked: { 'first-play': { unlockedAt: 1712345678000 } },
      _sync: { provider: 'netease', scope, serverSynced: true }
    };
    const harness = createHarness({ withToast: true, fetchImpl: (url, options = {}) => {
      if (!url.startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
      if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
      if (initialLoad) {
        initialLoad = false;
        return Promise.resolve(jsonResponse(200, {
          ...emptyServerState,
          _sync: { provider: 'netease', scope: 'anonymous', serverSynced: true }
        }));
      }
      return new Promise(resolve => { releaseAccount = () => resolve(jsonResponse(200, restored)); });
    } });
    await harness.api.ready;
    await settleMicrotasks();

    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-monster-community-profile', {
      detail: {
        provider: 'netease', resolved: true, hasCommunityIdentity,
        ...(hasCommunityIdentity ? { profile: { feId: '12345678' } } : { loggedIn: true }),
        account: { userId: 'profile-first' }
      }
    }));
    harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
    assert.equal(harness.audioInstances.length, 0,
      'a profile arriving before login status announced first-play before restoring its account');
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: true, account: { userId: 'profile-first' } }
    }));
    assert.equal(typeof releaseAccount, 'function', 'the profile account never started achievement restoration');
    releaseAccount();
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-play'), true);
    assert.equal(harness.audioInstances.length, 0, 'the profile account repeated its restored first-play');
    const saved = JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope)));
    assert.equal(saved.unlocked['first-play'].unlockedAt, 1712345678000);
  }
}

async function checkResolvedAccountRejectsMismatchedSnapshots() {
  for (const mismatchedScope of ['anonymous', 'netease:old-account']) {
    const scope = 'netease:current-account';
    const saved = {
      ...emptyServerState,
      unlocked: { 'first-play': { unlockedAt: 1712345678000 } }
    };
    let responseScope = 'anonymous';
    const posts = [];
    const harness = createHarness({ withToast: true,
      storageSeed: { [scopedStorageKey(scope)]: JSON.stringify(saved) },
      fetchImpl: (url, options = {}) => {
        if (!url.startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
        if (options.method === 'POST') {
          const payload = JSON.parse(options.body);
          posts.push(payload);
          return Promise.resolve(jsonResponse(200, payload));
        }
        return Promise.resolve(jsonResponse(200, {
          ...emptyServerState,
          unlocked: responseScope === scope ? saved.unlocked
            : responseScope === 'netease:old-account' ? { 'world-peace': { unlockedAt: 1712345679000 } } : {},
          _sync: { provider: 'netease', scope: responseScope, serverSynced: true }
        }));
      }
    });
    await harness.api.ready;
    await settleMicrotasks();
    const initialPosts = posts.length;

    responseScope = mismatchedScope;
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: true, resolved: true, account: { userId: 'current-account' } }
    }));
    harness.api.handlePlaybackStarted({ title: '普通歌曲', id: 'track' });
    await settleMicrotasks();
    for (const delay of [180, 650, 1800]) {
      harness.clock.advance(delay);
      await settleMicrotasks();
    }
    assert.equal(harness.api.isUnlocked('first-play'), true,
      'a mismatched GET snapshot discarded the resolved account unlock');
    assert.equal(harness.api.isUnlocked('world-peace'), false,
      'a mismatched GET snapshot imported another account achievement');
    assert.equal(harness.audioInstances.length, 0,
      'a mismatched GET snapshot repeated the resolved account first-play');
    assert.equal(posts.length, initialPosts, 'a mismatched GET snapshot enabled uploads to the wrong account');

    responseScope = scope;
    harness.clock.advance(5000);
    await settleMicrotasks();
    assert.ok(posts.at(-1).unlocked['first-play'], 'the resolved account did not recover after a matching snapshot');
    assert.equal(posts.length, initialPosts + 1);

    responseScope = 'anonymous';
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-monster-community-profile', {
      detail: { provider: 'netease', loggedIn: false, resolved: true }
    }));
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-play'), false,
      'an explicit logout retained the previous account achievement');
    assert.ok(JSON.parse(harness.localStorage.getItem(scopedStorageKey(scope))).unlocked['first-play'],
      'logging out erased the previous account stored unlock');
  }
}

async function checkOrdinaryUnlocksWaitForRestoration() {
  for (const alreadyUnlocked of [true, false]) {
    let release;
    const restored = {
      ...emptyServerState,
      unlocked: alreadyUnlocked ? { 'first-block': { unlockedAt: 1712345678000 } } : {},
      _sync: { provider: 'netease', scope: 'netease:ordinary-restore', serverSynced: true }
    };
    const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) => {
      if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
      return new Promise(resolve => { release = () => resolve(jsonResponse(200, restored)); });
    } });
    assert.equal(harness.api.unlock('first-block'), true, 'a pending unlock should be accepted');
    assert.equal(harness.api.unlock('first-block'), false, 'a duplicate pending unlock should be ignored');
    assert.equal(harness.audioInstances.length, 0, 'ordinary achievements notified before history was restored');
    release();
    await harness.api.ready;
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-block'), true, 'the pending unlock was lost');
    harness.clock.advance(10000);
    assert.equal(harness.audioInstances.reduce((sum, audio) => sum + audio.playCount, 0),
      alreadyUnlocked ? 0 : 1, 'only a genuinely new achievement should be announced once');
    const saved = JSON.parse(harness.localStorage.getItem(scopedStorageKey('netease:ordinary-restore')));
    if (alreadyUnlocked) assert.equal(saved.unlocked['first-block'].unlockedAt, 1712345678000);
  }
}

async function checkFreshStoredUnlockIsNotAnnounced() {
  for (const saveBeforeUnlock of [false, true]) {
    const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) =>
      Promise.resolve(jsonResponse(200, options.method === 'POST' ? JSON.parse(options.body) : emptyServerState))
    });
    await harness.api.ready;
    await settleMicrotasks();
    const saved = { ...emptyServerState, unlocked: { 'first-block': { unlockedAt: 1712345678000 } } };
    harness.localStorage.setItem('fe-monster-achievements-v2', JSON.stringify(saved));
    if (saveBeforeUnlock) harness.api.setTheme('toast', 'frost');
    assert.equal(harness.api.unlock('first-block'), false, 'another view already persisted this achievement');
    assert.equal(harness.api.isUnlocked('first-block'), true, 'stored unlock was not merged into live state');
    assert.equal(harness.audioInstances.length, 0, 'an already persisted achievement played its sound again');
    const stored = JSON.parse(harness.localStorage.getItem('fe-monster-achievements-v2'));
    assert.equal(stored.unlocked['first-block'].unlockedAt, 1712345678000);
  }
}

async function checkUnlockedWorldPeaceDoesNotReplay() {
  const restored = { ...emptyServerState, unlocked: {
    'world-peace': { unlockedAt: 1712345678000 },
    'first-play': { unlockedAt: 1712345677000 }
  } };
  const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) =>
    Promise.resolve(jsonResponse(200, options.method === 'POST' ? JSON.parse(options.body) : restored))
  });
  await harness.api.ready;
  for (const song of [
    { provider: 'netease', id: '1985', title: 'We Are the World' },
    { id: 'ordinary', title: '普通歌曲' },
    { provider: 'qq', id: 'cover', title: 'WE ARE THE WORLD (Live)' }
  ]) {
    assert.equal(harness.api.handlePlaybackStarted(song), false, 'an unlocked achievement replayed its cinematic');
    await settleMicrotasks();
  }
  assert.equal(harness.audioInstances.length, 0, 'replaying songs must not announce completed achievements');
}

async function checkPendingOrdinaryUnlocksStayWithTheirAccount() {
  for (const logout of [false, true]) {
    const pending = [];
    const harness = createHarness({ withToast: true, fetchImpl: (_url, options = {}) => {
      if (!String(_url).startsWith('/api/app/achievements')) return Promise.resolve(jsonResponse(200, {}));
      if (options.method === 'POST') return Promise.resolve(jsonResponse(200, JSON.parse(options.body)));
      return new Promise(resolve => pending.push(scope => resolve(jsonResponse(200, {
        ...emptyServerState,
        _sync: { provider: 'netease', scope, serverSynced: true }
      }))));
    } });
    // Initial account resolution keeps the user's pending action.
    harness.api.unlock('first-block', { silent: true });
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: true, account: { userId: 'initial' } }
    }));
    pending.shift()('anonymous');
    pending.shift()('netease:initial');
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('first-block'), true, 'initial account resolution lost its pending unlock');
    assert.equal(harness.audioInstances.length, 0, 'restoration lost the pending silent option');
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: true, account: { userId: 'waiting' } }
    }));
    harness.api.unlock('manual-sync');
    harness.window.dispatchEvent(new harness.window.CustomEvent('fe-community-account-change', {
      detail: { provider: 'netease', loggedIn: !logout, account: logout ? {} : { userId: 'next' } }
    }));
    pending.shift()('netease:waiting');
    pending.shift()(logout ? 'anonymous' : 'netease:next');
    await settleMicrotasks();
    assert.equal(harness.api.isUnlocked('manual-sync'), false, 'a pending unlock leaked into another account');
    assert.equal(harness.audioInstances.length, 0, 'an old account announced an unlock after switching');
    assert.equal(harness.api.unlock('manual-sync'), true, 'the new account cannot earn its own achievement');
    assert.equal(harness.audioInstances.reduce((sum, audio) => sum + audio.playCount, 0), 1);
  }
}

await checkPendingOrdinaryUnlocksStayWithTheirAccount();
console.log('PASS pending ordinary unlocks preserve initial resolution and cannot cross account switches');
await checkOrdinaryUnlocksWaitForRestoration();
console.log('PASS ordinary achievements wait for history and announce new unlocks only once');
await checkFreshStoredUnlockIsNotAnnounced();
console.log('PASS fresh stored unlocks merge into memory without replaying notifications');
await checkUnlockedWorldPeaceDoesNotReplay();
console.log('PASS completed world-peace achievement does not replay its cinematic');
await checkPlaybackBeforeInitialAccountResolution();
console.log('PASS playback before initial account resolution is restored and announced once');
await checkPendingPlaybackStaysWithResolvedAccount();
console.log('PASS pending playback cannot cross a resolved account switch or logout');
await checkProfileAccountRestoresBeforePlayback();
console.log('PASS profile-first account restoration waits before announcing playback');
await checkResolvedAccountRejectsMismatchedSnapshots();
console.log('PASS resolved accounts reject stale snapshots and preserve explicit logout');
await checkPlaybackWaitsForRestoredAchievement();
console.log('PASS playback waits for account restore and ignores transient missing profiles');
await checkFirstPlaybackPersistsAcrossRestart();
console.log('PASS first-ever playback announces once and stays unlocked across restart');
await checkStaleFailedHydrationCannotReleasePlayback();
console.log('PASS stale failed account hydration cannot release pending playback');
await checkRememberedAccountScopeSurvivesUnresolvedLogin();
console.log('PASS remembered music-platform account survives an unresolved login probe');
await checkAccountScopedLocalWinsWithoutProgressRegression();
console.log('PASS account-scoped local state wins without progress regression');
await checkCorruptAccountLocalRestoresFromServer();
console.log('PASS corrupt account-local state restores from the server');
await checkOfflineLocalUseAndReconnectUpload();
console.log('PASS offline account-local state reconnects and uploads without regression');
await checkEqualTimestampEquipmentConverges();
console.log('PASS equal-timestamp ornament equipment converges deterministically');
await checkAccountSwitchKeepsLocalStatesIsolated();
console.log('PASS account switching keeps local and server uploads isolated');
await checkPostOutageReconnectsAfterRetryBudget();
console.log('PASS mirror outage still saves locally and reconnects to upload');
await checkSerializedLatestThemeWrite();
console.log('PASS serialized achievement writes keep latest frost theme');
await checkLegacyMigrationRetry();
console.log('PASS legacy achievement migration retries and saves secret-left');
await checkLegacyUnlockUnionKeepsServerThemes();
console.log('PASS legacy/server unlock union keeps frost and void server themes');
await checkGetRetryNeverPostsEmptyDefaults();
console.log('PASS hydration GET retry never POSTs empty classic defaults');
await checkToastHoldStartsAfterEntry();
console.log('PASS achievement toast holds 3000ms after entry transitionend');
await checkIndependentThemeControls();
console.log('PASS achievement page and toast themes remain independent');
await checkRenderAndUnlockPreserveNodeFocus();
console.log('PASS achievement render and unlock preserve node identity and focus');
await checkSoundControlPersistsAndGatesSuppliedAudio();
console.log('PASS achievement sound switch persists and gates the supplied audio');
await checkCompletionistRequiresEveryPrerequisiteAndFinalTask();
console.log('PASS ultimate achievement requires every prerequisite and its final ornament task');
await checkFlushWaitsForTargetRevisionBeforeQuit();
console.log('PASS achievement flush completes its target revision before quit');
console.log('Achievement client state regression PASS');
