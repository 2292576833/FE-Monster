import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const servicePath = path.join(root, 'web', 'client-ai-service.js');
const petPath = path.join(root, 'web', 'pet-assistant.js');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const petSource = fs.readFileSync(petPath, 'utf8');
const wavBytes = fs.readFileSync(path.join(root, 'web', 'audio', 'achievement-unlock.wav'));
assert.ok(wavBytes.length > 44 && wavBytes.subarray(0, 4).toString('ascii') === 'RIFF',
  'audible lifecycle fixture must be a decodable WAV container');

const actions = [];
const blobs = new Map();
let blobSequence = 0;
let sessionSequence = 0;
let snapshot = openAiSnapshot();

function openAiSnapshot() {
  return {
    ok: true,
    configState: 'ready',
    revision: 1,
    modelMode: 'custom',
    ttsMode: 'custom',
    model: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', ready: true, hasApiKey: true },
    tts: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      ready: true,
      hasApiKey: true,
    },
  };
}

function doubaoSnapshot() {
  return {
    ok: true,
    configState: 'ready',
    revision: 2,
    modelMode: 'custom',
    ttsMode: 'custom',
    model: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', ready: true, hasApiKey: true },
    tts: {
      provider: 'volcengine-doubao-tts-v3',
      providerId: 'volcengine-doubao-tts-v3',
      protocol: 'volcengine-tts-v3',
      resourceId: 'seed-tts-2.0',
      modelVariant: 'seed-tts-2.0-standard',
      model: 'seed-tts-2.0-standard',
      voice: 'doubao:fixture-speaker',
      authMode: 'api-key',
      hasCredential: true,
      hasApiKey: true,
      ready: true,
      output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
      prosody: { emotion: '', emotionScale: 4, speechRate: 0, loudnessRate: 0 },
    },
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function fakeFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  if (url === '/api/client-ai/config' && method === 'GET') return json(snapshot);
  if (url === '/api/client-ai/providers' && method === 'GET') {
    return json({
      schema: 'fe-monster.ai-provider-catalog/v1',
      revision: 1,
      providers: [
        { id: 'openai', kind: 'tts', displayName: 'OpenAI TTS', protocol: 'openai-compatible', implementationStatus: 'ready', capabilities: ['tts.one-shot'], authModes: ['bearer'], links: {} },
        { id: 'volcengine-doubao-tts-v3', kind: 'tts', displayName: '豆包实时语音', protocol: 'volcengine-tts-v3', implementationStatus: 'ready', capabilities: ['tts.stream-output'], authModes: ['api-key'], links: {} },
      ],
    });
  }
  if (url === '/api/client-ai/tts' && method === 'POST') {
    actions.push(['openai-tts', body]);
    assert.equal(body.payload?.input, 'OpenAI 可听播放测试');
    return new Response(wavBytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
  }
  if (url === '/api/client-ai/tts/sessions' && method === 'POST') {
    const sessionId = `33333333-3333-4333-8333-${String(++sessionSequence).padStart(12, '0')}`;
    actions.push(['doubao-create', body, sessionId]);
    return json({ ok: true, sessionId, requestId: body.requestId, state: 'connecting', contentType: 'audio/wav' });
  }
  const sessionMatch = String(url).match(/^\/api\/client-ai\/tts\/sessions\/([^/]+)(?:\/(text|finish|audio))?$/);
  if (sessionMatch) {
    const [, sessionId, operation = 'delete'] = sessionMatch;
    if (operation === 'text' && method === 'POST') {
      actions.push(['doubao-text', body, sessionId]);
      assert.equal(body.text, '豆包可听播放测试');
      return json({ ok: true, sessionId, state: 'running' });
    }
    if (operation === 'finish' && method === 'POST') {
      actions.push(['doubao-finish', body, sessionId]);
      return json({ ok: true, sessionId, state: 'finishing' });
    }
    if (operation === 'audio' && method === 'GET') {
      actions.push(['doubao-audio', body, sessionId]);
      return new Response(wavBytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    }
    if (operation === 'delete' && method === 'DELETE') {
      actions.push(['doubao-delete', body, sessionId]);
      return json({ ok: true, sessionId, deleted: true });
    }
  }
  throw new Error(`unexpected request ${method} ${url}`);
}

class HarnessURL extends URL {
  static createObjectURL(blob) {
    const url = `blob:audible-fixture-${++blobSequence}`;
    blobs.set(url, blob);
    return url;
  }

  static revokeObjectURL(url) {
    blobs.delete(String(url));
  }
}

class FakeAudio {
  constructor() {
    this.listeners = new Map();
    this.attributes = new Map();
    this.playedBytes = [];
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

  set src(value) { this.attributes.set('src', String(value)); }
  get src() { return this.attributes.get('src') || ''; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  pause() {}
  load() {}

  async play() {
    let bytes;
    if (this.src.startsWith('blob:')) {
      const blob = blobs.get(this.src);
      assert.ok(blob, 'custom TTS blob URL was revoked before playback started');
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      const response = await fakeFetch(this.src, { method: 'GET' });
      assert.equal(response.ok, true, 'realtime TTS audio route was not readable by HTMLAudioElement');
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    assert.ok(bytes.byteLength > 44, 'HTMLAudioElement received empty or header-only audio');
    assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('ascii'), 'RIFF',
      'HTMLAudioElement did not receive a decodable audio container');
    this.playedBytes.push(bytes.byteLength);
    this.dispatch('playing');
  }
}

const windowObject = {
  fetch: fakeFetch,
  localStorage: { getItem: () => null, removeItem: () => {}, setItem: () => {} },
  dispatchEvent: () => {},
  addEventListener: () => {},
  setTimeout,
  clearTimeout,
  crypto,
  URL: HarnessURL,
};
windowObject.window = windowObject;
const serviceSandbox = {
  AbortController,
  Blob,
  crypto,
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  DOMException,
  Response,
  ReadableStream,
  TextDecoder,
  TextEncoder,
  URL: HarnessURL,
  clearTimeout,
  console,
  fetch: fakeFetch,
  setTimeout,
  window: windowObject,
};
vm.runInContext(serviceSource, vm.createContext(serviceSandbox), { filename: servicePath });
const service = windowObject.FeMonsterClientAiService;
await service.ready();

const audioElement = new FakeAudio();
const pet = {
  muted: false,
  requestId: 'fixture-request',
  replyPlaybackGeneration: 0,
  replyLivePlayout: null,
  replyLivePlayoutChunks: new Set(),
  clientAiAudioRelease: null,
};
const playStart = petSource.indexOf('async function playClientAiTts(');
const playEnd = petSource.indexOf('async function playServerReplyTts(', playStart);
const stopStart = petSource.indexOf('function stopReplyAudioPlayback(');
const attemptEnd = petSource.indexOf('async function playServerAudio(', stopStart);
assert.ok(playStart >= 0 && playEnd > playStart && stopStart >= 0 && attemptEnd > stopStart);
const petSandbox = {
  AbortController,
  REPLY_AUDIO_RETRY_DELAY_MS: 1,
  REPLY_AUDIO_START_TIMEOUT_MS: 1_000,
  URL: HarnessURL,
  boundedString: (value, max = 1000, fallback = '') => String(value ?? fallback).slice(0, max).trim(),
  clientAiServiceTtsActive: () => service.isCustomTts(service.load()),
  newPetChatRequestId: () => 'fixture-request',
  beginClientAiRequest: () => new AbortController().signal,
  console,
  elements: { audio: audioElement },
  pet,
  resetReplyAudioDuck: () => {},
  scheduleIdle: () => {},
  setPetState: () => {},
  window: { FeMonsterClientAiService: service, setTimeout, clearTimeout },
};
vm.runInContext(
  `${petSource.slice(stopStart, attemptEnd)}\n${petSource.slice(playStart, playEnd)}`,
  vm.createContext(petSandbox),
  { filename: 'web/pet-assistant.js#audible-client-tts-lifecycle' },
);

assert.equal(await petSandbox.playClientAiTts('OpenAI 可听播放测试', 'openai-audible'), true);
assert.equal(audioElement.playedBytes.length, 1, 'OpenAI-compatible TTS never reached audible playback');
const openAiBlobUrl = audioElement.src;
assert.equal(blobs.has(openAiBlobUrl), true, 'OpenAI audio was released while playing');
audioElement.dispatch('ended');
assert.equal(blobs.has(openAiBlobUrl), false, 'OpenAI audio blob leaked after playback ended');

snapshot = doubaoSnapshot();
await service.refresh();
assert.equal(await petSandbox.playClientAiTts('豆包可听播放测试', 'doubao-audible'), true);
assert.equal(audioElement.playedBytes.length, 2, 'Doubao realtime TTS never reached audible playback');
assert.match(audioElement.src, /^\/api\/client-ai\/tts\/sessions\/.+\/audio$/);
assert.deepEqual(actions.filter(([name]) => name.startsWith('doubao-')).map(([name]) => name),
  ['doubao-create', 'doubao-text', 'doubao-finish', 'doubao-audio'],
  'Doubao audio was not kept alive through HTMLAudioElement startup');
audioElement.dispatch('ended');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(actions.at(-1)?.[0], 'doubao-delete',
  'Doubao realtime session was not released after audible playback ended');

console.log(JSON.stringify({
  ok: true,
  openAiCompatibleBytesPlayed: audioElement.playedBytes[0],
  doubaoRealtimeBytesPlayed: audioElement.playedBytes[1],
  doubaoReleasedAfterEnded: true,
}, null, 2));
