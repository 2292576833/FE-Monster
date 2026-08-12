import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const clientSource = fs.readFileSync(path.join(root, 'web', 'pixel-achievements.js'), 'utf8');
const serviceSource = fs.readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'AchievementStateService.java'),
  'utf8'
);

const clone = (value) => JSON.parse(JSON.stringify(value));
const baseState = (overrides = {}) => ({
  version: 2,
  unlocked: {},
  themes: { page: 'classic', toast: 'classic' },
  settings: { soundEnabled: true },
  ornaments: {
    claimed: {},
    equipped: { achievementId: null, changedAt: 0 }
  },
  ...clone(overrides)
});

class MemoryStorage {
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

class MockCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createHarness({ localState = null, serverState = baseState() } = {}) {
  const storage = new MemoryStorage(localState
    ? { 'fe-monster-achievements-v2': JSON.stringify(localState) }
    : {});
  const posts = [];
  const events = [];
  let remote = clone(serverState);
  const document = {
    fonts: null,
    querySelector: () => null,
    createElement: () => {
      throw new Error('ornament state test unexpectedly rendered a DOM node');
    }
  };
  const window = {
    document,
    localStorage: storage,
    CustomEvent: MockCustomEvent,
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
    addEventListener() {},
    matchMedia: () => ({ matches: true }),
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 0);
    },
    cancelAnimationFrame: clearTimeout,
    fetch: async (_url, options = {}) => {
      const method = String(options.method || 'GET').toUpperCase();
      if (method === 'GET') {
        return { ok: true, status: 200, json: async () => clone(remote) };
      }
      const payload = JSON.parse(options.body);
      posts.push(payload);
      remote = clone(payload);
      return { ok: true, status: 200, json: async () => clone(remote) };
    }
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    CustomEvent: MockCustomEvent,
    HTMLCanvasElement: class HTMLCanvasElement {},
    console,
    setTimeout,
    clearTimeout,
    Date,
    Intl,
    Map,
    Set,
    WeakMap,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Math,
    JSON
  });
  vm.runInContext(clientSource, context, { filename: 'web/pixel-achievements.js' });
  return {
    api: window.feAchievements,
    storage,
    posts,
    events,
    remote: () => clone(remote)
  };
}

async function checkClientClaimEquipAndPersistence() {
  const harness = createHarness();
  const api = harness.api;
  await api.ready;

  assert.equal(api.ornaments.length, api.catalog.length, 'every achievement needs one ornament');
  assert.equal(new Set(api.ornaments.map((ornament) => ornament.id)).size, api.catalog.length,
    'ornament ids must be stable and unique');
  assert.equal(api.ornaments[0].id, 'achievement-ornament-first-block');
  assert.equal(Object.isFrozen(api.ornaments[0]), true, 'ornament metadata must be immutable');

  assert.equal(api.claimOrnament('first-block'), false,
    'an incomplete achievement ornament was claimable');
  assert.equal(api.unlock('first-block', { silent: true, unlockedAt: 1712345678000 }), true);
  assert.equal(api.claimOrnament('first-block', { claimedAt: 1712345678100 }), true);
  assert.equal(api.claimOrnament('first-block'), false, 'the same ornament was claimed twice');
  assert.equal(api.equipOrnament('gap-runner'), false, 'an unclaimed ornament was equippable');
  assert.equal(api.equipOrnament('first-block', { changedAt: 1712345678200 }), true);
  assert.equal(api.getEquippedOrnament().id, 'achievement-ornament-first-block');
  assert.equal(api.unequipOrnament({ changedAt: 1712345678300 }), true);
  assert.equal(api.unequipOrnament(), false, 'unequip reported a change while already empty');

  const state = api.getOrnamentState();
  assert.equal(state.claimed['first-block'].claimedAt, 1712345678100);
  assert.equal(state.equipped.achievementId, null);
  assert.equal(state.equipped.changedAt, 1712345678300);
  assert.equal(api.isOrnamentClaimed('first-block'), true);
  assert.equal(await api.flush({ timeout: 1500 }), true);

  const persisted = JSON.parse(harness.storage.getItem('fe-monster-achievements-v2'));
  assert.deepEqual(persisted.ornaments, clone(state), 'ornaments were not persisted in local storage');
  assert.deepEqual(harness.remote().ornaments, clone(state), 'ornaments were not persisted to the server');
  const reasons = harness.events
    .filter((event) => event.type === 'fe-achievement-ornament-change')
    .map((event) => event.detail.reason);
  for (const reason of ['unlock', 'claim', 'equip', 'unequip']) {
    assert.ok(reasons.includes(reason), `missing ornament event reason: ${reason}`);
  }
}

async function checkClientServerMerge() {
  const localState = baseState({
    unlocked: { 'first-block': { unlockedAt: 1712345677000 } },
    ornaments: {
      claimed: { 'first-block': { claimedAt: 1712345677100 } },
      equipped: { achievementId: 'first-block', changedAt: 1712345677200 }
    }
  });
  const serverState = baseState({
    unlocked: { 'gap-runner': { unlockedAt: 1712345677300 } },
    ornaments: {
      claimed: { 'gap-runner': { claimedAt: 1712345677400 } },
      equipped: { achievementId: 'gap-runner', changedAt: 1712345677500 }
    }
  });
  const harness = createHarness({ localState, serverState });
  await harness.api.ready;

  const merged = harness.api.getOrnamentState();
  assert.deepEqual(
    Object.keys(merged.claimed).sort(),
    ['first-block', 'gap-runner'],
    'local/server claimed ornaments were not unioned'
  );
  assert.equal(merged.equipped.achievementId, 'gap-runner',
    'newer server equipment did not win the merge');
  assert.equal(harness.api.getEquippedOrnament().achievementId, 'gap-runner');
  assert.equal(await harness.api.flush({ timeout: 1500 }), true);
  assert.deepEqual(Object.keys(harness.remote().ornaments.claimed).sort(), ['first-block', 'gap-runner']);
}

assert.match(clientSource, /const ORNAMENT_CATALOG = Object\.freeze\(/);
assert.match(clientSource, /function claimOrnament\(/);
assert.match(clientSource, /function equipOrnament\(/);
assert.match(clientSource, /function unequipOrnament\(/);
assert.match(clientSource, /function mergeOrnaments\(/);
assert.match(clientSource, /fe-achievement-ornament-change/);
assert.doesNotMatch(clientSource, /Math\.random\(\)[\s\S]{0,120}ornament/i,
  'ornament metadata must not depend on randomness');

assert.match(serviceSource, /claimedOrnaments/);
assert.match(serviceSource, /equipmentChangedAt/);
assert.match(serviceSource, /claimed ornament requires an unlocked achievement/);
assert.match(serviceSource, /equipped ornament must be claimed/);
assert.match(serviceSource, /mergeStates\(/);

await checkClientClaimEquipAndPersistence();
await checkClientServerMerge();

console.log('Achievement avatar ornament contract PASS');
