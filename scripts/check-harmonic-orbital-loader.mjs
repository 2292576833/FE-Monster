import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
function extract(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `can locate real application code: ${start}`);
  return app.slice(from, to);
}
const descriptorSource = extract('const PRESET_RUNTIME_SOURCES =', 'let presetRuntimeActivationToken');
const ensureSource = extract('function ensurePresetRuntime(', 'function mountLoadedPresetRuntime(');
const scriptSource = extract('function loadScriptOnce(', 'function ensureTsParticlesBundle(');
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const scripts = [];
  const appended = [];
  const window = {};
  const document = {
    scripts,
    createElement(tag) {
      assert.equal(tag, 'script');
      const listeners = new Map();
      return {
        dataset: {},
        getAttribute(name) { return this[name]; },
        addEventListener(name, callback, options) {
          const entries = listeners.get(name) || [];
          entries.push({ callback, once: !!options?.once });
          listeners.set(name, entries);
        },
        emit(name) {
          const entries = listeners.get(name) || [];
          listeners.set(name, entries.filter(entry => !entry.once));
          for (const entry of entries) entry.callback();
        }
      };
    },
    head: { appendChild(script) { scripts.push(script); appended.push(script); } }
  };
  const removeElement = script => {
    const index = scripts.indexOf(script);
    if (index >= 0) scripts.splice(index, 1);
  };
  const api = vm.runInNewContext(`${descriptorSource}\n${scriptSource}\n${ensureSource}\n({
    descriptor: PRESET_RUNTIME_SOURCES['harmonic-state'], ensure: ensurePresetRuntime, pending: presetRuntimePromises
  })`, { window, document, removeElement });
  const script = src => {
    const found = scripts.find(element => element.src === src);
    assert.ok(found, `script is requested: ${src}`);
    return found;
  };
  const finishRuntime = async runtime => {
    window[api.descriptor.globalName] = runtime;
    script(api.descriptor.src).emit('load');
    await settle();
  };
  const finishDependency = index => {
    const dependency = api.descriptor.dependencies[index];
    window[dependency.globalName] = {};
    script(dependency.src).emit('load');
  };
  return { ...api, window, scripts, appended, script, finishRuntime, finishDependency };
}

const descriptor = fixture().descriptor;
assert.deepEqual(Array.from(descriptor.dependencies, dependency => dependency.src.split('?')[0]), [
  'harmonic-orbital-core.js', 'harmonic-orbital-atmosphere.js'
]);
assert.equal(descriptor.src.split('?')[0], 'harmonic-state-runtime.js');
assert.equal(descriptor.globalName, 'FeHarmonicStateRuntime');
assert.deepEqual(Array.from(descriptor.dependencies, dependency => dependency.globalName), [
  'FeHarmonicOrbitalCore', 'FeHarmonicOrbitalAtmosphere'
]);
for (const source of [...descriptor.dependencies.map(dependency => dependency.src), descriptor.src]) {
  assert.ok(existsSync(new URL(`../web/${source.split('?')[0]}`, import.meta.url)), `${source} exists`);
  assert.ok(!html.includes(`src="${source.split('?')[0]}`), `${source} stays lazy`);
}

// All three registration-only modules may finish in any order. Creation stays
// gated on the complete set even when the runtime itself arrives first.
for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  const f = fixture();
  const first = f.ensure('harmonic-state');
  const concurrent = f.ensure('harmonic-state');
  assert.equal(first, concurrent, 'concurrent activations share the same in-flight promise');
  assert.deepEqual(f.appended.map(script => script.src), [
    ...Array.from(f.descriptor.dependencies, dependency => dependency.src), f.descriptor.src
  ], 'independent modules start together');
  let ready = false;
  first.then(() => { ready = true; });
  const runtime = { create() {} };
  for (const [position, index] of order.entries()) {
    if (index === 2) await f.finishRuntime(runtime);
    else f.finishDependency(index);
    await settle();
    assert.equal(ready, position === 2, 'runtime creation waits for all three registrations');
  }
  assert.equal(await first, runtime);
  assert.equal(await concurrent, runtime);
  assert.equal(await f.ensure('harmonic-state'), runtime);
  assert.equal(f.appended.length, 3, 'ready runtime reentry does not duplicate script requests');
  assert.equal(await f.ensure('unknown-preset'), null);
  assert.equal(f.appended.length, 3, 'unknown presets do not issue requests');
}

// Existing presets keep their original dependency-first scheduling.
{
  const f = fixture();
  const pending = f.ensure('free-cubes');
  assert.equal(f.appended.length, 0, 'the parallel opt-in must not change other presets');
  await settle();
  assert.equal(f.appended.length, 1);
  const runtime = { create() {} };
  f.window.FeFreeCubeRuntime = runtime;
  f.appended[0].emit('load');
  assert.equal(await pending, runtime);
}

// A dependency network failure rejects the activation, removes its failed tag,
// and leaves successfully loaded dependencies reusable on retry.
{
  const f = fixture();
  const failed = f.ensure('harmonic-state');
  const rejected = assert.rejects(failed, /Unable to load harmonic-orbital-core/);
  const core = f.descriptor.dependencies[0].src;
  const atmosphere = f.descriptor.dependencies[1].src;
  f.script(core).emit('error');
  f.finishDependency(1);
  await rejected;
  assert.equal(f.pending.has('harmonic-state'), false, 'dependency failure clears the activation cache');
  assert.equal(f.scripts.some(script => script.src === core), false, 'failed dependency can be requested again');
  const retried = f.ensure('harmonic-state');
  assert.notEqual(retried, failed);
  assert.equal(f.ensure('harmonic-state'), retried, 'retry still shares one activation promise');
  assert.equal(f.appended.filter(script => script.src === atmosphere).length, 1, 'healthy dependencies stay cached');
  f.finishDependency(0);
  await settle();
  const runtime = {};
  await f.finishRuntime(runtime);
  assert.equal(await retried, runtime);
}

// The runtime request has the same retry contract as its dependencies.
{
  const f = fixture();
  const failed = f.ensure('harmonic-state');
  const rejected = assert.rejects(failed, /Unable to load harmonic-state-runtime/);
  for (let index = 0; index < f.descriptor.dependencies.length; index += 1) f.finishDependency(index);
  await settle();
  f.script(f.descriptor.src).emit('error');
  await rejected;
  assert.equal(f.pending.has('harmonic-state'), false);
  const retried = f.ensure('harmonic-state');
  await settle();
  assert.equal(f.appended.filter(script => script.src === f.descriptor.src).length, 2);
  for (const dependency of f.descriptor.dependencies) {
    assert.equal(f.appended.filter(script => script.src === dependency.src).length, 1);
  }
  const runtime = {};
  await f.finishRuntime(runtime);
  assert.equal(await retried, runtime);
}

// HTTP 200 responses can still contain a stale/invalid module. Each failed
// registration must remove just its own tag so the next activation can recover.
for (const target of ['dependency', 'runtime']) {
  const f = fixture();
  const unrelated = { src: 'unrelated.js', getAttribute(name) { return this[name]; }, dataset: { loaded: 'true' } };
  f.scripts.push(unrelated);
  const asset = target === 'dependency' ? f.descriptor.dependencies[0] : f.descriptor;
  const failed = f.ensure('harmonic-state');
  const rejected = assert.rejects(failed, new RegExp(`${asset.globalName} did not register`));
  if (target === 'dependency') {
    f.finishDependency(1);
  } else {
    for (let index = 0; index < f.descriptor.dependencies.length; index += 1) f.finishDependency(index);
    await settle();
  }
  f.script(asset.src).emit('load');
  await rejected;
  assert.equal(f.pending.has('harmonic-state'), false, 'registration failure clears the activation cache');
  assert.equal(f.scripts.some(script => script.src === asset.src), false, 'invalid script tag is removed before retry');
  assert.ok(f.scripts.includes(unrelated), 'registration cleanup preserves unrelated script tags');
  const retried = f.ensure('harmonic-state');
  assert.notEqual(retried, failed);
  if (target === 'dependency') f.finishDependency(0);
  await settle();
  const runtime = {};
  await f.finishRuntime(runtime);
  assert.equal(await retried, runtime, `a corrected ${target} registers on retry`);
  assert.equal(f.appended.filter(script => script.src === asset.src).length, 2);
}

{
  const f = fixture();
  const runtime = {};
  f.window[f.descriptor.globalName] = runtime;
  for (const dependency of f.descriptor.dependencies) f.window[dependency.globalName] = {};
  assert.equal(await f.ensure('harmonic-state'), runtime);
  assert.equal(f.appended.length, 0, 'already registered runtime requires no network requests');
}

{
  const f = fixture();
  const runtime = {};
  f.window[f.descriptor.globalName] = runtime;
  const pending = f.ensure('harmonic-state');
  assert.equal(f.appended.length, 2, 'a registered runtime with absent dependencies still loads its dependencies');
  f.finishDependency(0);
  await settle();
  assert.equal(f.pending.get('harmonic-state'), pending);
  f.finishDependency(1);
  assert.equal(await pending, runtime);
  assert.equal(f.appended.length, 2, 'dependency repair does not reload an already registered runtime');
}

console.log('PASS harmonic lazy loader: parallel registration in all six completion orders, readiness barrier, unchanged other presets, single flight, dependency/runtime network and registration retries, dependency repair, ready reentry');
