import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const petPath = path.join(root, 'web', 'pet-assistant.js');
const source = fs.readFileSync(petPath, 'utf8');
const affectSource = fs.readFileSync(path.join(root, 'web', 'pet-affect-plan.js'), 'utf8');

const customStart = source.indexOf('async function playClientAiTts(');
const routeStart = source.indexOf('async function playConfiguredReplyTts(');
const routeEnd = source.indexOf('async function sendText(', routeStart);
assert.ok(customStart >= 0, 'custom TTS playback function is missing');
assert.ok(routeStart >= 0 && routeEnd > routeStart,
  'custom-model replies have no configured TTS router, so server TTS mode is silent');

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.playCalls = 0;
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

  set src(value) { this.attributes.set('src', String(value)); }
  get src() { return this.attributes.get('src') || ''; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  pause() {}
  load() {}
  async play() {
    this.playCalls += 1;
    assert.ok(this.src, 'HTMLAudioElement.play() was called without a source');
  }
}

const audioElement = new FakeAudio();
const serverNarrations = [];
const serverAudioIds = [];
const syntheses = [];
const stateMessages = [];
let serverPlaybackResult = true;
let snapshot = {
  modelMode: 'custom',
  ttsMode: 'server',
  tts: { provider: 'volcengine-doubao-tts-v3', ready: false },
};
const service = {
  load: () => snapshot,
  isCustomTts: (value = snapshot) => value.ttsEnabled !== false
    && value.ttsMode === 'custom' && value.tts?.ready === true,
  synthesizeSpeech: async (_value, text, options = {}) => {
    syntheses.push({ provider: snapshot.tts.provider, text, options });
    return {
      url: snapshot.tts.provider === 'volcengine-doubao-tts-v3'
        ? '/api/client-ai/tts/sessions/doubao-fixture/audio'
        : 'blob:openai-compatible-fixture',
      streaming: snapshot.tts.provider === 'volcengine-doubao-tts-v3',
      release: () => {},
    };
  },
};
const pet = {
  muted: false,
  requestId: 'fixture-request',
  replyPlaybackGeneration: 0,
  replyLivePlayout: null,
  replyLivePlayoutChunks: new Set(),
  clientAiAudioRelease: null,
  clientAiAffectPlans: new Map(),
};
const sandbox = {
  AbortController,
  URL: { revokeObjectURL: () => {} },
  console,
  pet,
  elements: { audio: audioElement },
  boundedString: (value, max = 1000, fallback = '') => String(value ?? fallback).slice(0, max).trim(),
  clientAiServiceTtsActive: () => service.isCustomTts(service.load()),
  newPetChatRequestId: () => 'fixture-request',
  beginClientAiRequest: () => new AbortController().signal,
  setPetState: (_state, message = '') => stateMessages.push(String(message)),
  scheduleIdle: () => {},
  stopReplyAudioPlayback: ({ clearSource } = {}) => {
    pet.replyPlaybackGeneration += 1;
    if (clearSource) audioElement.removeAttribute('src');
    return pet.replyPlaybackGeneration;
  },
  attemptReplyAudioPlayback: async () => {
    await audioElement.play();
    return true;
  },
  PRODUCT_TOUR_NARRATION_MAX_CHARS: 1200,
  requestPetMutation: async (path, payload) => {
    serverNarrations.push({ path, payload });
    return {
      ok: true,
      requestId: payload.requestId,
      audioId: 'server-audio-fixture',
      provider: 'volcengine-doubao-tts-v3',
      voiceId: 'doubao:server-selected-speaker',
      requestedVoiceId: 'doubao:server-selected-speaker',
    };
  },
  playServerAudio: async (audioId) => {
    serverAudioIds.push(audioId);
    return serverPlaybackResult;
  },
  window: { FeMonsterClientAiService: service },
};

const context = vm.createContext(sandbox);
vm.runInContext(affectSource, context, { filename: 'web/pet-affect-plan.js' });
vm.runInContext(source.slice(customStart, routeEnd), context, {
  filename: 'web/pet-assistant.js#configured-tts-reply-routing',
});

assert.equal(await sandbox.playConfiguredReplyTts('来源不匹配', 'mismatch-request'), false);
assert.equal(serverNarrations.length, 0,
  'a local model reply escaped to server narration instead of requiring local TTS');
assert.equal(serverAudioIds.length, 0, 'source mismatch unexpectedly reached server audio playback');
assert.equal(syntheses.length, 0, 'source mismatch incorrectly attempted local synthesis');
assert.match(stateMessages.at(-1) || '', /跟随.*模型|客户端云 TTS/,
  'source mismatch did not explain that TTS follows the model source');

snapshot = { modelMode: 'custom', ttsMode: 'custom', tts: { provider: 'openai', ready: true } };
pet.clientAiAffectPlans.set('openai-request', sandbox.window.FeMonsterPetAffectPlan.normalize({
  primaryEmotion: 'joy', intensity: 0.72, confidence: 0.9,
  speechRate: 8, loudnessRate: 4, emotionScale: 4,
  source: 'local-model', timeOfDay: 'morning', turnId: 'openai-request',
}));
assert.equal(await sandbox.playConfiguredReplyTts('OpenAI 兼容语音', 'openai-request'), true);
assert.equal(syntheses.at(-1)?.provider, 'openai');
assert.equal(syntheses.at(-1)?.options?.affectPlan?.turnId, 'openai-request',
  'the OpenAI utterance did not receive its own AffectPlan');
assert.equal(audioElement.src, 'blob:openai-compatible-fixture');

snapshot = {
  modelMode: 'custom',
  ttsMode: 'custom',
  tts: { provider: 'volcengine-doubao-tts-v3', ready: true },
};
pet.clientAiAffectPlans.set('doubao-request', sandbox.window.FeMonsterPetAffectPlan.normalize({
  primaryEmotion: 'sorrow', secondaryEmotion: 'love', intensity: 0.86, confidence: 0.92,
  speechRate: -18, loudnessRate: -9, emotionScale: 4,
  source: 'local-model', timeOfDay: 'late-night', turnId: 'doubao-request',
}));
assert.equal(await sandbox.playConfiguredReplyTts('豆包实时语音', 'doubao-request'), true);
assert.equal(syntheses.at(-1)?.provider, 'volcengine-doubao-tts-v3');
assert.equal(syntheses.at(-1)?.options?.affectPlan?.turnId, 'doubao-request');
assert.equal(syntheses.at(-1)?.options?.affectPlan?.primaryEmotion, 'sorrow');
assert.equal(pet.clientAiAffectPlans.get('openai-request').turnId, 'openai-request',
  'a later TTS utterance overwrote the previous plan');
assert.equal(audioElement.src, '/api/client-ai/tts/sessions/doubao-fixture/audio');

snapshot = { modelMode: 'custom', ttsMode: 'custom', tts: { provider: 'openai', ready: false } };
const synthesesBeforeIncomplete = syntheses.length;
assert.equal(await sandbox.playConfiguredReplyTts('不完整配置', 'incomplete-request'), false);
assert.equal(syntheses.length, synthesesBeforeIncomplete,
  'an incomplete custom TTS configuration still attempted synthesis');
assert.match(stateMessages.at(-1) || '', /TTS.*(不完整|配置)/,
  'an incomplete custom TTS configuration failed silently');

snapshot = {
  modelMode: 'custom',
  ttsMode: 'custom',
  ttsEnabled: false,
  tts: { provider: 'openai-tts', voice: 'alloy', hasApiKey: true, ready: true },
};
const synthesesBeforeDisabled = syntheses.length;
const narrationsBeforeDisabled = serverNarrations.length;
assert.equal(await sandbox.playConfiguredReplyTts('只显示文字', 'disabled-request'), false);
assert.equal(syntheses.length, synthesesBeforeDisabled,
  'disabled client TTS still attempted client synthesis');
assert.equal(serverNarrations.length, narrationsBeforeDisabled,
  'disabled client TTS fell back to server narration');
assert.match(stateMessages.at(-1) || '', /TTS.*关闭/,
  'disabled client TTS was reported as a broken provider instead of an intentional text-only mode');

assert.equal(audioElement.playCalls, 2,
  'OpenAI-compatible and Doubao custom TTS did not both reach audible HTMLAudioElement playback');

console.log(JSON.stringify({
  ok: true,
  sourceMismatchBlocked: true,
  openAiCompatiblePlayback: true,
  doubaoRealtimePlayback: true,
  perUtteranceAffectPlan: true,
  incompleteCustomTtsIsExplicit: true,
  disabledClientTtsIsTextOnly: true,
}, null, 2));
