import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Exercise the production adapter against a deterministic animation clock.
// These are scheduling checks, not claims about achievable GPU frame rates.
const root = path.resolve(import.meta.dirname, '..');
const argument = process.argv.find(value => value.startsWith('--adapter='));
const adapterPath = argument
  ? path.resolve(argument.slice('--adapter='.length))
  : path.join(root, 'wallpaper-engine/harmonic-realm/wallpaper.js');
const adapterSource = readFileSync(adapterPath, 'utf8');
const settingsSource = readFileSync(path.join(root, 'web/harmonic-state-settings.js'), 'utf8');

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type) { for (const callback of listeners.get(type) || []) callback({ type }); }
  };
}

function harness() {
  let time = 0, nextRaf = 0, disposeCalls = 0;
  const pending = new Map(), frames = [], callbacks = {}, registrations = {};
  const host = { getBoundingClientRect: () => ({ width: 1920, height: 1080 }) };
  const errorMessage = { hidden: true, textContent: '' };
  const document = {
    ...eventTarget(), hidden: false,
    getElementById: id => id === 'wallpaperHost' ? host : id === 'errorMessage' ? errorMessage : null
  };
  const runtime = {
    camera: { zoom: 1, updateProjectionMatrix() {} },
    palette: [{ r: 42, g: 234, b: 244 }, { r: 137, g: 99, b: 247 }, { r: 250, g: 105, b: 188 }],
    renderer: { domElement: eventTarget() }, lastNow: null, pixelRatio: 1, disposed: false
  };
  const context = {
    ...eventTarget(), document, THREE: {}, devicePixelRatio: 1,
    performance: { now: () => time },
    requestAnimationFrame(callback) {
      pending.set(++nextRaf, callback);
      assert.ok(pending.size <= 1, 'the adapter must never queue duplicate animation callbacks');
      return nextRaf;
    },
    cancelAnimationFrame(id) { pending.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    FeHarmonicStateRuntime: {
      create: () => runtime,
      resize: (scene, ratio) => { scene.pixelRatio = ratio; },
      setEffects() {}, setPalette() {},
      update(scene, frame) {
        assert.ok(Number.isFinite(frame.now), 'each rendered timestamp is finite');
        assert.ok(!frames.length || frame.now > frames.at(-1).now, 'rendered timestamps increase');
        frames.push({ now: frame.now, previousNow: scene.lastNow });
        scene.lastNow = frame.now;
      },
      diagnostics: scene => ({ disposed: scene.disposed }),
      dispose(scene) { scene.disposed = true; disposeCalls++; }
    }
  };
  context.window = context;
  for (const [key, name] of Object.entries({ audio: 'Audio', status: 'MediaStatus', properties: 'MediaProperties',
    thumbnail: 'MediaThumbnail', playback: 'MediaPlayback', timeline: 'MediaTimeline' })) {
    context[`wallpaperRegister${name}Listener`] = callback => {
      callbacks[key] = callback;
      registrations[key] = (registrations[key] || 0) + 1;
    };
  }
  vm.createContext(context);
  vm.runInContext(settingsSource, context, { filename: 'harmonic-state-settings.js' });
  vm.runInContext(adapterSource, context, { filename: adapterPath });
  assert.equal(errorMessage.hidden, true, 'adapter starts successfully with the scene stub');
  assert.equal(pending.size, 1, 'startup schedules exactly one frame');

  function tickAt(timestamp) {
    assert.ok(Number.isFinite(timestamp) && timestamp > time, 'synthetic clock moves forward');
    time = timestamp;
    const due = [...pending];
    for (const [id] of due) pending.delete(id);
    for (const [, callback] of due) callback(time);
    assert.ok(pending.size <= 1, 'a completed tick leaves at most one callback');
  }
  function run(hz, ticks) {
    const start = time;
    for (let index = 1; index <= ticks; index++) tickAt(start + index * 1000 / hz);
  }
  return {
    context, runtime, frames, pending, callbacks, registrations,
    get disposeCalls() { return disposeCalls; },
    get time() { return time; },
    api: context.wallpaperPropertyListener,
    diagnostics: () => context.FeHarmonicWallpaper.diagnostics(),
    tickAt, run,
    dispose: () => context.FeHarmonicWallpaper.dispose()
  };
}

const report = { unlimited: [], manual: [], lifecycle: false, legacyIgnored: false };
for (const hz of [60, 144, 240]) {
  for (const generalFps of [0, 15, 24, 60]) {
    const test = harness();
    assert.equal(test.diagnostics().options.wallpaperFrameLimit, 0, 'the default requests no JavaScript frame cap');
    test.api.applyGeneralProperties({ fps: generalFps });
    // Wallpaper Engine may replay the previous package's saved slider value.
    test.api.applyUserProperties({ wallpaperFps: { value: 60 } });
    test.api.applyUserProperties({ wallpaperFps: { value: 120 } });
    assert.equal(test.diagnostics().options.wallpaperFrameLimit, 0, 'legacy saved 60 fps cannot reinstate a cap');
    assert.equal(test.diagnostics().quality.effectiveFps, 0, 'unlimited ignores an additional host-side JavaScript cap');
    const ticks = hz * 2;
    test.run(hz, ticks);
    assert.equal(test.frames.length, ticks, `${hz} Hz / host ${generalFps}: every animation callback renders`);
    assert.equal(test.diagnostics().renderedFrames, ticks);
    assert.equal(test.diagnostics().error, '');
    assert.equal(test.pending.size, 1);
    report.unlimited.push({ hz, generalFps, ticks, rendered: test.frames.length });
    test.dispose();
    assert.equal(test.pending.size, 0);
  }
}
report.legacyIgnored = true;

for (const hz of [60, 144, 240]) {
  for (const generalFps of [0, 15, 24, 60]) {
    const test = harness();
    test.api.applyUserProperties({ wallpaperFrameLimit: { value: 30 } });
    test.api.applyGeneralProperties({ fps: generalFps });
    const limit = generalFps > 0 ? Math.min(30, generalFps) : 30;
    assert.equal(test.diagnostics().quality.effectiveFps, limit);
    test.run(hz, hz * 2);
    assert.ok(Math.abs(test.frames.length - limit * 2) <= 1,
      `${hz} Hz / host ${generalFps}: explicit cap ${limit} remains effective (rendered ${test.frames.length})`);
    assert.ok(test.frames.length < hz * 2, 'manual cap skips animation callbacks');
    report.manual.push({ hz, generalFps, limit, rendered: test.frames.length });

    // Switching away from zero also catches a broken modulo-zero timestamp
    // accumulator that might be hidden while unlimited unconditionally draws.
    test.api.applyUserProperties({ wallpaperFrameLimit: { value: 0 } });
    let start = test.frames.length;
    test.run(hz, hz);
    assert.equal(test.frames.length - start, hz, 'manual to unlimited immediately restores every callback');
    test.api.applyUserProperties({ wallpaperFrameLimit: { value: 30 } });
    start = test.frames.length;
    test.run(hz, hz * 2);
    assert.ok(Math.abs(test.frames.length - start - limit * 2) <= 1, 'returning from unlimited retains a finite limiter clock');
    test.dispose();
  }
}

{
  const test = harness();
  test.api.applyUserProperties({ wallpaperFrameLimit: { value: 900 } });
  assert.equal(test.diagnostics().options.wallpaperFrameLimit, 360, 'manual limit respects the upper bound');
  for (const value of [NaN, Infinity, '60', null]) {
    test.api.applyUserProperties({ wallpaperFrameLimit: { value } });
    assert.equal(test.diagnostics().options.wallpaperFrameLimit, 360, 'invalid limit does not replace the current value');
  }
  test.api.applyUserProperties({ wallpaperFrameLimit: { value: -1 } });
  assert.equal(test.diagnostics().options.wallpaperFrameLimit, 0, 'negative limit clamps to unlimited');
  test.run(240, 10);
  test.api.setPaused(true);
  test.api.setPaused(true);
  const beforePause = test.frames.length;
  test.api.applyGeneralProperties({ fps: 24 });
  test.api.applyUserProperties({ wallpaperCardTitle: { value: 'Pause test' } });
  test.callbacks.properties({ title: 'Music while wallpaper is paused' });
  assert.equal(test.pending.size, 0, 'property and media events cannot restart a paused wallpaper');
  test.tickAt(test.time + 60_000);
  assert.equal(test.frames.length, beforePause, 'no render occurs during a long pause');
  test.api.setPaused(false);
  test.api.setPaused(false);
  assert.equal(test.pending.size, 1, 'repeated resume still schedules one callback');
  test.run(240, 2);
  assert.equal(test.frames.length, beforePause + 2, 'unlimited resumes every callback');
  assert.equal(test.frames[beforePause].previousNow, null, 'resume clears the scene clock to prevent a large delta');

  test.context.document.hidden = true;
  test.context.document.dispatch('visibilitychange');
  assert.equal(test.pending.size, 0, 'hidden wallpaper cancels animation');
  test.api.setPaused(false);
  assert.equal(test.pending.size, 0, 'host resume does not override document visibility');
  test.context.document.hidden = false;
  test.context.document.dispatch('visibilitychange');
  assert.equal(test.pending.size, 1);
  test.run(144, 2);
  vm.runInContext(adapterSource, test.context, { filename: adapterPath });
  assert.equal(test.pending.size, 1, 'loading the adapter twice cannot create a second loop');
  assert.ok(Object.values(test.registrations).every(count => count === 1), 'host listeners register once');
  assert.equal(test.dispose(), true);
  assert.equal(test.dispose(), false);
  assert.equal(test.disposeCalls, 1);
  assert.equal(test.pending.size, 0);
  const beforeDispose = test.frames.length;
  test.api.setPaused(false);
  test.api.applyUserProperties({ wallpaperFrameLimit: { value: 0 } });
  test.context.dispatch('resize');
  test.context.document.dispatch('visibilitychange');
  test.callbacks.timeline({ position: 20, duration: 60 });
  test.tickAt(test.time + 1000);
  assert.equal(test.pending.size, 0, 'disposed wallpaper cannot restart through retained host callbacks');
  assert.equal(test.frames.length, beforeDispose);
  assert.equal(test.diagnostics().disposed, true);
  report.lifecycle = true;
}

console.log(JSON.stringify({ passed: true, kind: 'deterministic scheduling (no GPU throughput measurement)', ...report }, null, 2));
