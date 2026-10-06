import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
function extract(name) {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, name); return match[0];
}
const timers = new Map(); let id = 0, resumed = 0, visual = 0, health = 0, continuity = 0;
const state = {
  clientRuntime: { nativeAudioActive: true, settings: { xAudio2: true } },
  obrSpatialAudio: { requested: true, enabled: true, graph: { nativeStream: true } },
  audioAnalysis: { context: { state: 'suspended' } },
  audioPlaybackContinuity: { playingIntent: true, sourceGeneration: 2, pendingLoadGeneration: 0 }
};
const audio = { src: '/song.wav', paused: false, ended: false, currentTime: 42 };
const context = vm.createContext({ state, els: { audio }, document: { hidden: true },
  MOBILE_RENDER_TARGET: false, performance: { now: () => 5000 },
  window: { setInterval: (fn, ms) => { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearInterval: key => timers.delete(key) },
  refreshNativeAudioSample: () => { visual++; },
  refreshNativeGoogleObrHealth: async () => { health++; },
  monitorAudioPlaybackContinuity: async () => { continuity++; },
  resumeAudioAnalysis: async () => { resumed++; state.audioAnalysis.context.state = 'running'; return true; }
});
vm.runInContext(`const realtimePollingTimers = [], backgroundPollingTimers = [];
${['clearRealtimePolling', 'realtimePollingActive', 'syncRealtimePolling', 'clearBackgroundPolling'].map(extract).join('\n')}`, context);
context.clearBackgroundPolling();
assert.equal(timers.size, 2, 'minimization retains output health and continuity timers');
for (const { fn } of timers.values()) await fn();
assert.equal(visual, 0, 'hidden window avoids visual spectrum polling');
assert.equal(health, 1); assert.equal(continuity, 1);
vm.runInContext(extract('monitorAudioPlaybackContinuity'), context);
assert.equal(await context.monitorAudioPlaybackContinuity(), 'output-resumed');
assert.equal(resumed, 1, 'advancing media clock cannot hide a suspended output graph');
audio.paused = true; context.syncRealtimePolling();
assert.equal(timers.size, 0, 'paused music releases playback timers');

// Even a one-pixel first wheel event selects immediately; zero/zoom events
// and interactive controls do not accidentally change the song.
class Element { constructor(control = false) { this.control = control; } closest(selector) { return selector === '#qishuiPlaybackCard' || this.control; } }
let switched = 0;
Object.assign(context, { Element, playbackCardVisible: () => true, switchQishuiPlaybackTrack: direction => { switched += direction; } });
state.qishuiPlaybackCard = {};
vm.runInContext(extract('handleQishuiPlaybackWheel'), context);
const wheel = deltaY => ({ target: new Element(), deltaY, preventDefault() {}, stopPropagation() {} });
assert.equal(context.handleQishuiPlaybackWheel(wheel(1)), true); assert.equal(switched, 1);
context.handleQishuiPlaybackWheel(wheel(-1)); assert.equal(switched, 0);
assert.equal(context.handleQishuiPlaybackWheel(wheel(0)), false);
assert.equal(context.handleQishuiPlaybackWheel({ ...wheel(12), ctrlKey: true }), false);
assert.equal(context.handleQishuiPlaybackWheel({ ...wheel(12), target: new Element(true) }), false);
console.log('Background playback checks passed: hidden output supervision, advancing-clock audio resume, pause cleanup and immediate wheel selection.');
