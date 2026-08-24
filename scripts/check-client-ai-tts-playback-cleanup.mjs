import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const petPath = path.join(root, 'web', 'pet-assistant.js');
const source = fs.readFileSync(petPath, 'utf8');

const playStart = source.indexOf('async function playClientAiTts(');
const playEnd = source.indexOf('async function sendText(', playStart);
const stopStart = source.indexOf('function stopReplyAudioPlayback(');
const stopEnd = source.indexOf('function replyPlaybackIsCurrent(', stopStart);
assert.ok(playStart >= 0 && playEnd > playStart, 'custom TTS playback function is not inspectable');
assert.ok(stopStart >= 0 && stopEnd > stopStart, 'reply playback stop function is not inspectable');

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.preload = '';
    this.muted = false;
  }

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, once: options?.once === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type) || [];
    this.listeners.set(type, entries.filter((entry) => entry.listener !== listener));
  }

  dispatch(type) {
    const entries = [...(this.listeners.get(type) || [])];
    for (const entry of entries) {
      if (entry.once) this.removeEventListener(type, entry.listener);
      entry.listener({ type, target: this });
    }
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }

  set src(value) { this.attributes.set('src', String(value)); }
  get src() { return this.attributes.get('src') || ''; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  pause() {}
  load() {}
}

const audioElement = new FakeAudio();
const releases = [0, 0];
let synthesisIndex = 0;
const service = {
  isCustomTts: () => true,
  isCustomModel: () => true,
  load: () => ({
    modelMode: 'custom',
    ttsMode: 'custom',
    ttsEnabled: true,
    tts: { provider: 'volcengine-doubao-tts-v3', ready: true },
  }),
  synthesizeSpeech: async () => {
    const index = synthesisIndex;
    synthesisIndex += 1;
    return {
      url: `/api/client-ai/tts/sessions/session-${index}/audio`,
      streaming: true,
      release: () => { releases[index] += 1; },
    };
  },
};
const pet = {
  muted: false,
  requestId: 'fixture-request',
  replyPlaybackGeneration: 0,
  replyLivePlayout: null,
  replyLivePlayoutChunks: new Set(),
};
const sandbox = {
  AbortController,
  URL: { revokeObjectURL: () => {} },
  console,
  pet,
  elements: { audio: audioElement },
  boundedString: (value, max = 1000, fallback = '') => String(value ?? fallback).slice(0, max).trim(),
  clientAiServiceTtsActive: () => true,
  newPetChatRequestId: () => 'fixture-request',
  beginClientAiRequest: () => new AbortController().signal,
  setPetState: () => {},
  scheduleIdle: () => {},
  resetReplyAudioDuck: () => {},
  attemptReplyAudioPlayback: async () => true,
  window: { FeMonsterClientAiService: service },
};
const context = vm.createContext(sandbox);

// Keep a nearby dedicated release/cleanup declaration in the same synthetic
// scope if production uses one instead of storing it on `pet`.
const nearby = source.slice(Math.max(0, playStart - 2500), playStart);
const releaseDeclarations = [...nearby.matchAll(
  /(?:let|var)\s+[A-Za-z_$][\w$]*(?:ReplyAudio|replyAudio)(?:Release|Cleanup)[\w$]*\s*=\s*[^;]+;/g,
)].map((match) => match[0]).join('\n');
vm.runInContext(`${releaseDeclarations}\n${source.slice(stopStart, stopEnd)}\n${source.slice(playStart, playEnd)}`,
  context, { filename: 'web/pet-assistant.js#tts-playback-cleanup' });

assert.equal(await sandbox.playClientAiTts('first reply', 'request-1'), true);
assert.equal(releases[0], 0, 'first session was released before playback');
assert.equal(audioElement.listenerCount('ended'), 1);
assert.equal(audioElement.listenerCount('error'), 1);

assert.equal(await sandbox.playClientAiTts('second reply', 'request-2'), true);
assert.equal(releases[0], 1,
  'starting a replacement playback did not DELETE the interrupted realtime session');
assert.equal(audioElement.listenerCount('ended'), 1,
  'interrupted playback left an old ended listener attached');
assert.equal(audioElement.listenerCount('error'), 1,
  'interrupted playback left an old error listener attached');

sandbox.stopReplyAudioPlayback({ clearSource: true });
assert.equal(releases[1], 1, 'explicit playback stop did not DELETE the active realtime session');
assert.equal(audioElement.listenerCount('ended'), 0, 'stop left ended listeners attached');
assert.equal(audioElement.listenerCount('error'), 0, 'stop left error listeners attached');
audioElement.dispatch('ended');
audioElement.dispatch('error');
assert.deepEqual(releases, [1, 1], 'stale media listeners released a later session twice');

console.log(JSON.stringify({
  ok: true,
  interruptedSessionDeleted: true,
  activeSessionDeletedOnStop: true,
  staleMediaListenersRemoved: true,
}, null, 2));
