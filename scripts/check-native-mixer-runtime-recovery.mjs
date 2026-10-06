import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
function fixture({ available = false, playing = true } = {}) {
  const requests = [], timers = new Map();
  let nextTimer = 0, analysisCalls = 0;
  const spatial = { operationId: 0, requested: false, enabled: false, graph: null };
  const runtime = { nativeAudioActive: available, nativeAudio: { spatialStreaming: available }, settings: { xAudio2: true } };
  const context = vm.createContext({
    AbortController, DOMException, Promise, Number, Object, String,
    window: {
      setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timers.delete(id); }
    },
    state: { obrSpatialAudio: spatial, clientRuntime: runtime },
    document: { hidden: false }, applyAudioBridgePayload() {},
    els: { audio: { src: 'fixture.wav' } },
    GOOGLE_OBR_NATIVE_BACKEND: 'native', GOOGLE_OBR_BACKEND: 'obr',
    safeText: (value, fallback) => String(value || fallback),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, text: async () => JSON.stringify({ nativeAudio: { active: true, spatialStreaming: true }, settings: { xAudio2: true } }) };
    },
    syncRuntimeSettingsControls() {}, applyRuntimeDataset() {},
    syncGoogleObrToggle() {}, clearGoogleObrRecovery() {}, syncRealtimePolling() {},
    setGoogleObrRuntimeBackend() {}, notifyNativeAudioChainChanged() {},
    applyNativeMixerControl(request) { spatial.mixerControl = request.parameters; return request.parameters; },
    audioAnalysisPlaybackActive: () => playing,
    ensureAudioAnalysis: async () => {
      analysisCalls++;
      if (!runtime.nativeAudioActive || !runtime.nativeAudio.spatialStreaming) return false;
      spatial.enabled = true; spatial.graph = { nativeStream: true }; spatial.backend = 'native'; return true;
    }
  });
  vm.runInContext('let nativeAudioSampleRequest = null, visualBridgeRefreshRequest = null;', context);
  for (const name of ['apiJson', 'refreshClientRuntime', 'refreshVisualBridge', 'refreshNativeAudioSample', 'ensureNativeAudioMixerChain']) {
    const fn = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))?.[0];
    assert.ok(fn, name); vm.runInContext(fn, context);
  }
  return { context, spatial, runtime, requests, timers, get analysisCalls() { return analysisCalls; } };
}
const enabledRequest = { reason: 'retry', parameters: { enabled: true, upmixEnabled: false, obrEnabled: false, upmixOutputLayout: '5.1' } };

test('a stalled runtime endpoint cannot leave application bootstrap waiting forever', async () => {
  const f = fixture();
  f.context.fetch = (_, options) => new Promise((_, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  const pending = f.context.refreshClientRuntime();
  assert.equal(f.timers.size, 1, 'runtime fetch needs a bounded deadline');
  const timer = [...f.timers.values()][0];
  assert.ok(timer.delay > 0 && timer.delay <= 10000);
  timer.callback(); await pending;
  assert.equal(f.runtime.nativeAudioActive, false);
  assert.equal(f.timers.size, 0);
});

for (const name of ['refreshVisualBridge', 'refreshNativeAudioSample']) {
  test(`${name} also recovers when the backend sample request stalls`, async () => {
    const f = fixture({ available: true });
    f.context.fetch = (_, options) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = f.context[name]();
      assert.equal(f.timers.size, 1, 'sampling needs a deadline and must release its in-flight request after timeout');
      const timer = [...f.timers.values()][0];
      assert.ok(timer.delay > 0 && timer.delay <= 10000);
      timer.callback(); await pending;
      assert.equal(f.timers.size, 0);
    }
  });
}

test('mixer retry recovers capabilities missed during a backend outage', async () => {
  const f = fixture();
  assert.equal(await f.context.ensureNativeAudioMixerChain(enabledRequest), true);
  assert.equal(f.requests.filter(request => request.url === '/api/app/runtime').length, 1);
  assert.equal(f.analysisCalls, 1);
  assert.equal(f.spatial.backend, 'native');
});

test('an ordinary enabled patch can recover previously unavailable native capabilities', async () => {
  const f = fixture();
  assert.equal(await f.context.ensureNativeAudioMixerChain({ ...enabledRequest, reason: 'patch' }), true);
  assert.equal(f.requests.length, 1);
});

test('explicit retry refreshes capability status even when the old snapshot was available', async () => {
  const f = fixture({ available: true });
  assert.equal(await f.context.ensureNativeAudioMixerChain(enabledRequest), true);
  assert.equal(f.requests.length, 1);
});

test('normal live parameter changes reuse valid capabilities', async () => {
  const f = fixture({ available: true });
  assert.equal(await f.context.ensureNativeAudioMixerChain({ ...enabledRequest, reason: 'patch' }), true);
  assert.equal(f.requests.length, 0);
});

test('a backend that is still unavailable does not report an active mixer', async () => {
  const f = fixture();
  f.context.fetch = async () => { throw new Error('backend unavailable'); };
  assert.equal(await f.context.ensureNativeAudioMixerChain(enabledRequest), false);
  assert.equal(f.runtime.nativeAudioActive, false);
  assert.equal(f.spatial.enabled, false);
  assert.equal(f.spatial.mixerControl.enabled, true, 'saved user intent survives a transport failure');
  assert.equal(f.timers.size, 0);
});

test('retry while paused restores capabilities without starting audio', async () => {
  const f = fixture({ playing: false });
  assert.equal(await f.context.ensureNativeAudioMixerChain(enabledRequest), true);
  assert.equal(f.runtime.nativeAudioActive, true);
  assert.equal(f.analysisCalls, 0);
  assert.equal(f.spatial.backend, 'waiting-for-audio');
});

test('disabling the mixer during capability recovery cannot reactivate it later', async () => {
  const f = fixture(); let resolveFetch;
  f.context.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  const pending = f.context.ensureNativeAudioMixerChain(enabledRequest);
  assert.equal(typeof resolveFetch, 'function');
  assert.equal(await f.context.ensureNativeAudioMixerChain({ parameters: { enabled: false } }), true);
  resolveFetch({ ok: true, text: async () => JSON.stringify({ nativeAudio: { active: true, spatialStreaming: true } }) });
  assert.equal(await pending, false);
  assert.equal(f.analysisCalls, 0);
  assert.equal(f.spatial.requested, false);
});
