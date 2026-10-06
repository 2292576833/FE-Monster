import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'web', 'app-parameter-registry.js');
assert.ok(fs.existsSync(sourcePath), 'web/app-parameter-registry.js is missing');

const window = {};
window.window = window;
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), { window, Object, Map, Set, Math, Number, String, Promise }, {
  filename: 'web/app-parameter-registry.js'
});
const registry = window.FeMonsterParameters;
assert.ok(registry && typeof registry.register === 'function');

let value = 10;
let settled = false;
registry.register({
  key: 'audio.fixture.gain', owner: 'fixture', name: 'Fixture gain', purpose: 'Test gain',
  scope: 'audio', category: 'audio', preset: 'global', type: 'number', impact: 'low',
  range: { min: 0, max: 20, step: 0.5 },
  get: () => value,
  async set(next) { value = next; },
  async settle() { await Promise.resolve(); settled = true; }
});
await assert.rejects(async () => registry.register({
  key: 'audio.fixture.gain', owner: 'other', type: 'number', range: { min: 0, max: 20, step: 1 },
  get: () => value, set: async () => {}
}), /duplicate/i);
assert.throws(() => registry.register({
  key: 'ai.fixture.api-key', owner: 'fixture', type: 'string', get: () => '', set: async () => {}
}), /sensitive|secret|credential/i);

const result = await registry.apply('audio.fixture.gain', 12.24, { confirmed: true });
assert.equal(settled, true, 'parameter apply returned before persistence settled');
assert.equal(value, 12, 'number value was not normalized to the registered step');
assert.deepEqual(JSON.parse(JSON.stringify(result)), { key: 'audio.fixture.gain', before: 10, after: 12, changed: true });

registry.register({
  key: 'render.fixture.backend', owner: 'fixture', name: 'Backend', type: 'enum', impact: 'high',
  options: [{ value: 'safe', label: 'Safe' }, { value: 'fast', label: 'Fast' }],
  get: () => 'safe', set: async () => {}
});
await assert.rejects(() => registry.apply('render.fixture.backend', 'fast'), /confirm/i);
await assert.rejects(() => registry.apply('render.fixture.backend', 'invalid', { confirmed: true }), /option|enum/i);

registry.register({
  key: 'scene.fixture.color', owner: 'fixture', name: 'Color', type: 'color', impact: 'low',
  get: () => '#ffffff', set: async () => {}
});
await assert.rejects(() => registry.apply('scene.fixture.color', 'red', { confirmed: true }), /color/i);

let mismatched = false;
registry.register({
  key: 'audio.fixture.mismatch', owner: 'fixture', name: 'Mismatch', type: 'boolean', impact: 'low',
  get: () => mismatched,
  async set() { mismatched = false; }
});
await assert.rejects(() => registry.apply('audio.fixture.mismatch', true), /read.?back|persist/i);

registry.replaceOwner('fixture', [{
  key: 'audio.fixture.replaced', name: 'Replaced', type: 'boolean', impact: 'low',
  get: () => false, set: async () => {}
}]);
assert.equal(registry.get('audio.fixture.gain'), null, 'replaceOwner left stale owner entries');
assert.ok(registry.get('audio.fixture.replaced'));
const catalog = registry.catalog();
assert.equal(Object.isFrozen(catalog), true);
assert.equal(Object.isFrozen(catalog[0]), true);
assert.equal(Object.hasOwn(catalog[0], 'get'), false, 'public catalog exposed executable functions');

console.log(JSON.stringify({ ok: true, settledApply: true, readBackVerified: true, highImpactConfirmed: true }, null, 2));
