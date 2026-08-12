import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('web/pet-particle-orb.js', 'utf8');

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const bucket = listeners.get(type) || new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      event.target ||= this;
      for (const listener of [...(listeners.get(event.type) || [])]) listener.call(this, event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    totalListenerCount() {
      return [...listeners.values()].reduce((total, bucket) => total + bucket.size, 0);
    }
  };
}

function createFixture({
  contextState = 'running',
  resumeRejects = false,
  captureStream = false,
  modernMediaQuery = true
} = {}) {
  const globalEvents = createEventTarget();
  const documentEvents = createEventTarget();
  const audioEvents = createEventTarget();
  const mediaQueryEvents = createEventTarget();
  const legacyMediaQueryListeners = new Set();
  const counters = {
    cancelledFrames: 0,
    contextsClosed: 0,
    mediaElementSources: 0,
    mediaStreamSources: 0,
    resumes: 0
  };

  const makeNode = (kind) => ({
    kind,
    connectedTargets: [],
    connect(target) {
      this.connectedTargets.push(target);
      return target;
    },
    disconnect() {
      this.connectedTargets.length = 0;
    }
  });

  const destination = makeNode('destination');
  class FixtureAudioContext {
    constructor() {
      this.state = contextState;
      this.sampleRate = 48000;
      this.destination = destination;
    }
    createAnalyser() {
      const analyser = makeNode('analyser');
      analyser.frequencyBinCount = 128;
      analyser.getByteFrequencyData = (data) => data.fill(64);
      return analyser;
    }
    createGain() {
      const gain = makeNode('gain');
      gain.gain = { value: 1 };
      return gain;
    }
    createMediaElementSource() {
      counters.mediaElementSources += 1;
      const sourceNode = makeNode('media-element-source');
      counters.lastMediaElementSource = sourceNode;
      return sourceNode;
    }
    createMediaStreamSource() {
      counters.mediaStreamSources += 1;
      return makeNode('media-stream-source');
    }
    resume() {
      counters.resumes += 1;
      if (resumeRejects) return Promise.reject(new Error('autoplay blocked'));
      this.state = 'running';
      return Promise.resolve();
    }
    close() {
      counters.contextsClosed += 1;
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  const root = {
    dataset: { state: 'speaking' },
    hidden: false,
    isConnected: true
  };
  const canvas = {
    dataset: {},
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      set fillStyle(_) {},
      set globalAlpha(_) {}
    })
  };
  const character = {
    hidden: false,
    getBoundingClientRect: () => ({ width: 168, height: 184 })
  };
  const replyAudio = {
    ...audioEvents,
    paused: true,
    ended: false,
    currentSrc: 'blob:fixture-reply'
  };
  if (captureStream) {
    replyAudio.captureStream = () => ({ getAudioTracks: () => [{ id: 'fixture-track' }] });
  }

  const elements = {
    petAssistant: root,
    petAssistantParticleOrb: canvas,
    petAssistantCharacter: character,
    petAssistantAudio: replyAudio
  };
  const document = {
    ...documentEvents,
    visibilityState: 'visible',
    documentElement: { getAttribute: () => 'desktop-pet' },
    getElementById: (id) => elements[id] || null
  };
  const mediaQuery = modernMediaQuery
    ? {
        ...mediaQueryEvents,
        matches: false,
        addListener(listener) { legacyMediaQueryListeners.add(listener); },
        removeListener(listener) { legacyMediaQueryListeners.delete(listener); }
      }
    : {
        matches: false,
        addListener(listener) { legacyMediaQueryListeners.add(listener); },
        removeListener(listener) { legacyMediaQueryListeners.delete(listener); }
      };

  let nextFrameId = 0;
  const sandbox = {
    ...globalEvents,
    document,
    AudioContext: FixtureAudioContext,
    devicePixelRatio: 1,
    matchMedia: () => mediaQuery,
    requestAnimationFrame: () => ++nextFrameId,
    cancelAnimationFrame: () => { counters.cancelledFrames += 1; },
    performance: { now: () => 100 },
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'web/pet-particle-orb.js' });

  return {
    api: sandbox.FeMonsterPetParticleOrb,
    counters,
    destination,
    documentEvents,
    globalEvents,
    mediaQueryEvents,
    legacyMediaQueryListeners,
    replyAudio
  };
}

const lifecycle = createFixture();
assert.equal(lifecycle.mediaQueryEvents.listenerCount('change'), 1,
  'modern matchMedia change listener should be registered once');
assert.equal(lifecycle.legacyMediaQueryListeners.size, 0,
  'legacy matchMedia listener must not also be registered when the modern API exists');
assert.equal(lifecycle.replyAudio.totalListenerCount(), 5,
  'all five reply-audio lifecycle events must be observed while the orb is active');
lifecycle.globalEvents.dispatchEvent({ type: 'pagehide', persisted: false });
assert.equal(lifecycle.replyAudio.totalListenerCount(), 0,
  'dispose must remove every reply-audio listener');
assert.equal(lifecycle.documentEvents.totalListenerCount(), 0,
  'dispose must remove document listeners');
assert.equal(lifecycle.mediaQueryEvents.totalListenerCount(), 0,
  'dispose must remove the modern reduced-motion listener');
assert.equal(lifecycle.legacyMediaQueryListeners.size, 0,
  'dispose must leave no legacy reduced-motion listener');
assert.equal(lifecycle.globalEvents.totalListenerCount(), 0,
  'dispose must remove resize, desktop-state and page lifecycle listeners');

const legacyLifecycle = createFixture({ modernMediaQuery: false });
assert.equal(legacyLifecycle.legacyMediaQueryListeners.size, 1,
  'legacy matchMedia should be used when the modern change-event API is absent');
legacyLifecycle.globalEvents.dispatchEvent({ type: 'pagehide', persisted: false });
assert.equal(legacyLifecycle.legacyMediaQueryListeners.size, 0,
  'dispose must remove the legacy reduced-motion listener');

const blocked = createFixture({ contextState: 'suspended', resumeRejects: true });
blocked.replyAudio.paused = false;
blocked.replyAudio.dispatchEvent({ type: 'play' });
await new Promise((resolve) => setTimeout(resolve, 0));
blocked.api.renderOnce(120);
assert.equal(blocked.counters.mediaElementSources, 0,
  'a suspended context that cannot resume must never take over the TTS audio element');
assert.equal(blocked.counters.contextsClosed, 1,
  'a failed, unattached AudioContext must be released');
assert.equal(blocked.api.status().audioSource, 'state-fallback',
  'visual speech fallback must remain active when Web Audio cannot safely attach');
blocked.globalEvents.dispatchEvent({ type: 'pagehide', persisted: false });

const running = createFixture({ contextState: 'running' });
running.replyAudio.paused = false;
running.replyAudio.dispatchEvent({ type: 'play' });
assert.equal(running.counters.mediaElementSources, 0,
  'frequency analysis must never reroute the audible TTS media element');
assert.equal(running.api.status().audioSource, 'state-fallback',
  'missing captureStream support must use visual state fallback without touching TTS output');
running.globalEvents.dispatchEvent({ type: 'pagehide', persisted: false });

const captured = createFixture({ contextState: 'running', captureStream: true });
captured.replyAudio.paused = false;
captured.replyAudio.dispatchEvent({ type: 'play' });
assert.equal(captured.counters.mediaStreamSources, 1,
  'captureStream should be preferred because it does not reroute the TTS element');
assert.equal(captured.counters.mediaElementSources, 0,
  'captureStream analysis must leave native TTS playback untouched');
captured.globalEvents.dispatchEvent({ type: 'pagehide', persisted: false });

process.stdout.write('Desktop pet particle-orb lifecycle and audio safety passed.\n');
