import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const projectRoot = process.cwd();
const webRoot = path.join(projectRoot, 'web');
const componentsRoot = path.join(projectRoot, 'components');
const artifactRoot = path.join(projectRoot, 'artifacts');
const profile = path.join(artifactRoot, `.tmp-pet-style-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const productionHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const sliceBetween = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `Could not extract production markup starting at ${startToken}`);
  return source.slice(start, end);
};
const productionRuntimeSettings = sliceBetween(
  productionHtml,
  '<section class="runtime-settings-panel" id="runtimeSettingsPanel"',
  'class="top-search'
);
const productionVoiceSettingsMarkup = productionRuntimeSettings.match(
  /<details class="runtime-settings-group runtime-pet-voice-settings"[\s\S]*?<\/details>/
)?.[0] || '';
const productionPetMarkup = sliceBetween(
  productionHtml,
  '<section class="pet-assistant" id="petAssistant"',
  '<section class="update-dialog"'
).replace(/\s*<button class="pet-assistant-restore"[\s\S]*?<\/button>\s*$/, '');
const productionRestoreMarkup = productionHtml.match(
  /<button class="pet-assistant-restore"[\s\S]*?<\/button>/
)?.[0] || '';

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
assert.ok(productionVoiceSettingsMarkup, 'production pet voice settings markup was not found');
assert.ok(productionPetMarkup, 'production desktop pet markup was not found');
assert.ok(productionRestoreMarkup, 'production desktop pet restore control was not found');
assert.match(productionPetMarkup, /id="petAssistantPanel"[^>]+data-pet-text-bubble/,
  'production pet no longer exposes the compact text-bubble surface');
for (const settingsId of [
  'petAssistantVoiceSelect',
  'petAssistantVoicePlaybackToggle',
  'petAssistantShortcutCapture',
  'petAssistantShortcutValue',
  'petAssistantShortcutClear',
  'petAssistantShortcutHint'
]) {
  assert.match(productionVoiceSettingsMarkup, new RegExp(`id="${settingsId}"`),
    `runtime settings lost pet voice control ${settingsId}`);
  assert.doesNotMatch(productionPetMarkup, new RegExp(`id="${settingsId}"`),
    `pet text bubble still contains settings control ${settingsId}`);
}
for (const retiredId of [
  'petAssistantTitle',
  'petAssistantStatus',
  'petAssistantClear',
  'petAssistantClose',
  'petAssistantPrivacy',
  'petAssistantVoice',
  'petAssistantMute',
  'petAssistantCollapse',
  'petAssistantHide',
  'petAssistantDesktopMain'
]) {
  assert.doesNotMatch(productionPetMarkup, new RegExp(`id="${retiredId}"`),
    `production pet still contains retired control ${retiredId}`);
}
mkdirSync(artifactRoot, { recursive: true });

const fixture = `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="/components/GlassSurface.css">
  <link rel="stylesheet" href="/components/BorderGlow.css">
  <link rel="stylesheet" href="/border-glow-buttons.css">
  <link rel="stylesheet" href="/text-fonts.css">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/rhythm-game.css">
  <link rel="stylesheet" href="/black-gold-buttons.css">
  <link rel="stylesheet" href="/pixel-adventure.css">
  <link rel="stylesheet" href="/pet-assistant.css">
</head><body>
  <section class="runtime-settings-panel" id="runtimeSettingsPanel" hidden>
    ${productionVoiceSettingsMarkup}
  </section>
  ${productionPetMarkup}
  ${productionRestoreMarkup}
  <script>
    window.__petFixtureHistory = [];
    window.__petFixtureBootId = crypto.randomUUID();
    window.__petFixtureProvider = 'netease';
    window.__petFixtureFeId = '11111111';
    window.__petFixtureStatusSessionIds = ['session-qa'];
    window.__petFixtureCreatedSessionId = 'session-qa';
    window.__petFixtureSessionCreates = 0;
    window.__petFixtureSessionFailures = 0;
    window.__petFixtureSessionDeferredCount = 0;
    window.__petFixtureSessionDeferred = [];
    window.__petFixtureSessionState = 'idle';
    window.__petFixtureSttProvider = 'browser';
    window.__petFixtureServerSttAvailable = false;
    window.__petFixtureStatusCalls = 0;
    window.__petFixtureStatusFailures = 0;
    window.__petFixtureStatusDeferredCount = 0;
    window.__petFixtureStatusDeferred = [];
    window.__petFixtureMicrophoneStarts = 0;
    window.__petFixtureMicrophoneReject = true;
    window.__petFixtureMicrophoneDeferred = false;
    window.__petFixtureMicrophoneRequests = [];
    window.__petFixtureMicrophoneTrackStops = 0;
    window.__petFixtureVoiceUploads = [];
    window.__petFixtureVoiceRequestSequence = 0;
    window.__petFixtureVoiceUploadAttempts = [];
    window.__petFixtureVoiceBlobDeferred = false;
    window.__petFixtureVoiceBlobWaiters = [];
    window.__petFixtureChatRequests = [];
    window.__petFixtureConversationEmotionSequence = 0;
    window.__petFixtureCancelRequests = [];
    window.__petFixtureClaims = [];
    window.__petFixtureActionResults = [];
    window.__petFixtureExecutions = [];
    window.__petFixtureInspections = [];
    window.__petFixturePcmProcessor = null;
    window.__petFixtureAudioContextCloseCount = 0;
    window.__petFixturePcmAudioContextCloseCount = 0;
    window.__petFixtureReplyAudioPlans = [];
    window.__petFixtureReplyAudioCalls = [];
    window.__petFixtureReplyAudioLoads = 0;
    window.__petFixtureReplyAudioDeferred = [];
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = false;
    window.__petFixtureNativeMessages = [];
    window.__petFixtureNarrationRequests = [];
    window.__petFixtureNarrationCancelRequests = [];
    window.__petFixtureNarrationFailure = false;
    window.__petFixtureSpeechUtterances = [];
    window.__petFixtureSpeechCancelCount = 0;
    window.__petFixtureSpeechCurrent = null;
    class FixtureSpeechSynthesisUtterance {
      constructor(text = '') {
        this.text = String(text);
        this.lang = '';
        this.voice = null;
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
    const fixtureSpeechSynthesis = {
      get speaking() { return Boolean(window.__petFixtureSpeechCurrent); },
      get pending() { return false; },
      get paused() { return false; },
      getVoices() {
        return [{ name: 'Fixture Chinese Voice', lang: 'zh-CN', localService: true, voiceURI: 'fixture-zh-cn' }];
      },
      speak(utterance) {
        window.__petFixtureSpeechCurrent = utterance;
        window.__petFixtureSpeechUtterances.push(utterance);
      },
      cancel() {
        window.__petFixtureSpeechCancelCount += 1;
        const utterance = window.__petFixtureSpeechCurrent;
        window.__petFixtureSpeechCurrent = null;
        utterance?.onerror?.({ error: 'canceled' });
      }
    };
    window.__petFixtureSpeechStart = () => {
      const utterance = window.__petFixtureSpeechCurrent;
      utterance?.onstart?.(new Event('start'));
    };
    window.__petFixtureSpeechFinish = () => {
      const utterance = window.__petFixtureSpeechCurrent;
      window.__petFixtureSpeechCurrent = null;
      utterance?.onend?.(new Event('end'));
    };
    try {
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        value: FixtureSpeechSynthesisUtterance
      });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: fixtureSpeechSynthesis
      });
    } catch {}
    window.chrome.webview = {
      postMessage(message) { window.__petFixtureNativeMessages.push(structuredClone(message)); }
    };
    window.FeMonsterCreativeBridge = {
      getContext() {
        return {
          provider: window.__petFixtureProvider,
          profile: { feId: window.__petFixtureFeId }
        };
      }
    };
    const fixtureAudioNode = () => ({ connect() { return this; }, disconnect() {} });
    class FixtureAudioContext {
      constructor() {
        this.sampleRate = 48000;
        this.destination = fixtureAudioNode();
        this.state = 'running';
      }
      createMediaStreamSource() { return fixtureAudioNode(); }
      createScriptProcessor() {
        this.usedForPcm = true;
        const processor = fixtureAudioNode();
        processor.onaudioprocess = null;
        window.__petFixturePcmProcessor = processor;
        return processor;
      }
      createGain() {
        const gain = fixtureAudioNode();
        gain.gain = { value: 1 };
        return gain;
      }
      resume() { return Promise.resolve(); }
      close() {
        window.__petFixtureAudioContextCloseCount += 1;
        if (this.usedForPcm) window.__petFixturePcmAudioContextCloseCount += 1;
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    window.__petFixturePushPcm = (value, sampleCount = 4800) => {
      const processor = window.__petFixturePcmProcessor;
      if (!processor?.onaudioprocess) throw new Error('PCM processor is not active');
      const samples = new Float32Array(sampleCount);
      samples.fill(value);
      processor.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
    };
    try {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: FixtureAudioContext });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: FixtureAudioContext });
    } catch {}
    const fixtureNativeMediaPlay = HTMLMediaElement.prototype.play;
    const fixtureNativeMediaLoad = HTMLMediaElement.prototype.load;
    const fixtureReplyAudio = document.getElementById('petAssistantAudio');
    const fixtureNativeReplyAudioPause = fixtureReplyAudio.pause.bind(fixtureReplyAudio);
    Object.defineProperty(fixtureReplyAudio, 'paused', {
      configurable: true,
      get: () => !window.__petFixtureReplyAudioPlaying
    });
    Object.defineProperty(fixtureReplyAudio, 'ended', {
      configurable: true,
      get: () => window.__petFixtureReplyAudioEnded
    });
    window.__petFixtureReplyAudioCurrentTime = 0;
    Object.defineProperty(fixtureReplyAudio, 'currentTime', {
      configurable: true,
      get: () => window.__petFixtureReplyAudioCurrentTime,
      set: (value) => { window.__petFixtureReplyAudioCurrentTime = Math.max(0, Number(value) || 0); }
    });
    Object.defineProperty(fixtureReplyAudio, 'pause', {
      configurable: true,
      value() {
        window.__petFixtureReplyAudioPlaying = false;
        return fixtureNativeReplyAudioPause();
      }
    });
    HTMLMediaElement.prototype.play = function fixtureMediaPlay() {
      if (this.id !== 'petAssistantAudio') return fixtureNativeMediaPlay.call(this);
      const plan = window.__petFixtureReplyAudioPlans.shift() || { type: 'resolve' };
      const src = this.getAttribute('src') || this.src || '';
      window.__petFixtureReplyAudioCalls.push({
        src,
        type: plan.type || 'resolve',
        name: plan.name || '',
        at: performance.now()
      });
      if (plan.type === 'reject') {
        return Promise.reject(new DOMException(plan.message || 'fixture playback rejected', plan.name || 'AbortError'));
      }
      if (plan.type === 'defer') {
        return new Promise((resolve, reject) => {
          window.__petFixtureReplyAudioDeferred.push({
            src,
            resolve: () => {
              window.__petFixtureReplyAudioPlaying = true;
              window.__petFixtureReplyAudioEnded = false;
              this.dispatchEvent(new Event('play'));
              this.dispatchEvent(new Event('playing'));
              resolve();
            },
            reject: (name = 'AbortError') => reject(new DOMException('fixture deferred playback rejected', name))
          });
        });
      }
      if (plan.type === 'resolve-before-playing') {
        window.__petFixtureReplyAudioPlaying = true;
        window.__petFixtureReplyAudioEnded = false;
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      }
      window.__petFixtureReplyAudioPlaying = true;
      window.__petFixtureReplyAudioEnded = false;
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.load = function fixtureMediaLoad() {
      if (this.id !== 'petAssistantAudio') return fixtureNativeMediaLoad.call(this);
      window.__petFixtureReplyAudioLoads += 1;
      window.__petFixtureReplyAudioPlaying = false;
      window.__petFixtureReplyAudioEnded = false;
      this.dispatchEvent(new Event('loadstart'));
    };
    window.__petFixtureFinishReplyAudio = () => {
      window.__petFixtureReplyAudioPlaying = false;
      window.__petFixtureReplyAudioEnded = true;
      fixtureReplyAudio.dispatchEvent(new Event('ended'));
    };
    try {
      Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    } catch {}
    const fixtureNativeBlobArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function fixtureBlobArrayBuffer() {
      if (!window.__petFixtureVoiceBlobDeferred) return fixtureNativeBlobArrayBuffer.call(this);
      window.__petFixtureVoiceBlobDeferred = false;
      const blob = this;
      return new Promise((resolve, reject) => {
        const waiter = {
          resolved: false,
          release: () => fixtureNativeBlobArrayBuffer.call(blob).then((buffer) => {
            waiter.resolved = true;
            resolve(buffer);
          }, reject)
        };
        window.__petFixtureVoiceBlobWaiters.push(waiter);
      });
    };
    const fixtureGetUserMedia = async () => {
      window.__petFixtureMicrophoneStarts += 1;
      if (window.__petFixtureMicrophoneReject) {
        throw new DOMException('fixture microphone stop', 'NotAllowedError');
      }
      let stopped = false;
      const track = {
        stop() {
          if (stopped) return;
          stopped = true;
          window.__petFixtureMicrophoneTrackStops += 1;
        },
        getSettings: () => ({ sampleRate: 48000, channelCount: 1 })
      };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
      if (!window.__petFixtureMicrophoneDeferred) return stream;
      return new Promise((resolve, reject) => {
        window.__petFixtureMicrophoneRequests.push({
          resolve: () => resolve(stream),
          reject: (name = 'NotAllowedError') => reject(new DOMException('fixture deferred microphone rejected', name)),
          track
        });
      });
    };
    const fixtureMediaDevices = { getUserMedia: fixtureGetUserMedia };
    try {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'mediaDevices', {
        configurable: true,
        get: () => fixtureMediaDevices
      });
    } catch {
      try {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: fixtureMediaDevices
        });
      } catch {}
    }
    window.__petFixtureMediaPatched = navigator.mediaDevices?.getUserMedia === fixtureGetUserMedia;
    window.FeMonsterPetActionBridge = {
      snapshot() {
        return window.__petFixtureProgramAudio
          || { playing: false, energy: 0, bass: 0, mid: 0, treble: 0, beat: 0 };
      },
      inspect(envelope, context = {}) {
        window.__petFixtureInspections.push({ envelope, context });
        const command = envelope.arguments?.command || envelope.name;
        return {
          command,
          title: 'Fixture high impact action',
          description: 'Fixture confirmation description',
          confirmationMessage: 'Confirm the fixture side effect.',
          readOnly: false,
          requiresConfirmation: command === 'fixture.high-impact'
        };
      },
      async execute(envelope, context = {}) {
        window.__petFixtureExecutions.push({ envelope, context });
        return { executed: true, confirmed: context.confirmed === true };
      }
    };
    window.fetch = async (input, options = {}) => {
      const url = new URL(String(input), location.href);
      const json = (value, status = 200) => new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' }
      });
      const fixtureSession = (id = 'session-qa') => ({
        id,
        computerId: 'computer-qa',
        state: window.__petFixtureSessionState,
        pendingActions: [],
        messages: window.__petFixtureHistory
      });
      const session = fixtureSession();
      if (url.pathname === '/api/app/machine') return json({ computerId: 'computer-qa' });
      if (url.pathname === '/api/community/pet/status') {
        window.__petFixtureStatusCalls += 1;
        if (window.__petFixtureStatusFailures > 0) {
          window.__petFixtureStatusFailures -= 1;
          throw new TypeError('simulated transient status disconnect');
        }
        const response = json({ ok: true, pet: {
          state: 'idle',
          sttProvider: window.__petFixtureSttProvider,
          serverSttAvailable: window.__petFixtureServerSttAvailable,
          selectedVoiceId: 'chatterbox:tour-fixture',
          voices: [{
            id: 'chatterbox:tour-fixture',
            label: 'Tour fixture',
            provider: 'chatterbox',
            available: true
          }]
        }, sessions: window.__petFixtureStatusSessionIds.map(fixtureSession), memory: { count: 2 } });
        if (window.__petFixtureStatusDeferredCount > 0) {
          window.__petFixtureStatusDeferredCount -= 1;
          return new Promise((resolve) => {
            window.__petFixtureStatusDeferred.push({ resolve: () => resolve(response) });
          });
        }
        return response;
      }
      if (url.pathname === '/api/community/pet/history') return json({ ok: true, session, memory: [] });
      if (url.pathname === '/api/community/pet/sessions') {
        window.__petFixtureSessionCreates += 1;
        if (window.__petFixtureSessionFailures > 0) {
          window.__petFixtureSessionFailures -= 1;
          throw new TypeError('simulated session creation failure');
        }
        const response = json({ ok: true, session: fixtureSession(window.__petFixtureCreatedSessionId) });
        if (window.__petFixtureSessionDeferredCount > 0) {
          window.__petFixtureSessionDeferredCount -= 1;
          return new Promise((resolve) => {
            window.__petFixtureSessionDeferred.push({ resolve: () => resolve(response) });
          });
        }
        return response;
      }
      if (url.pathname === '/api/community/pet/chat') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureChatRequests.push({ ...body, provider: url.searchParams.get('provider') || '' });
        if (window.__petFixtureProvider !== 'netease' && body.sessionId !== window.__petFixtureCreatedSessionId) {
          return json({ ok: false, error: 'pet session does not belong to current FE ID' }, 403);
        }
        const proactive = Boolean(body.proactiveContext);
        const emotionExample = body.text === '你又改坏了，我现在真的很生气！';
        const conversationEmotionSequence = ++window.__petFixtureConversationEmotionSequence;
        return json({
          ok: true,
          sessionId: body.sessionId || 'session-qa',
          requestId: proactive
            ? 'request-proactive-qa'
            : emotionExample ? 'request-emotion-qa' : 'request-qa',
          conversationEmotionSource: proactive ? 'proactive' : 'user-text',
          conversationEmotionSequence,
          sevenEmotion: {
            primary: { key: proactive ? 'love' : 'anger', intensity: proactive ? 0.74 : 0.9 },
            secondary: [],
            confidence: 0.92
          }
        });
      }
      if (url.pathname === '/api/community/pet/narrate') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureNarrationRequests.push({ ...body, provider: url.searchParams.get('provider') || '' });
        if (window.__petFixtureNarrationFailure) {
          return json({ ok: false, error: 'fixture server narration unavailable' }, 503);
        }
        return json({
          ok: true,
          requestId: body.requestId,
          audioId: 'pet-audio-tour-fixture',
          provider: 'chatterbox',
          voiceId: body.voiceId
        });
      }
      if (url.pathname === '/api/community/pet/narrate/cancel') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureNarrationCancelRequests.push(body);
        return json({ ok: true, requestId: body.requestId, cancelled: true });
      }
      if (url.pathname === '/api/community/pet/cancel') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureCancelRequests.push(body);
        return json({ ok: true, cancelled: true, truncated: true });
      }
      if (url.pathname === '/api/community/pet/action-claim') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureClaims.push(body);
        return json({ ok: true, claimed: body.cancelled !== true, cancelled: body.cancelled === true });
      }
      if (url.pathname === '/api/community/pet/action-result') {
        const body = JSON.parse(String(options.body || '{}'));
        window.__petFixtureActionResults.push(body);
        return json({ ok: true });
      }
      if (url.pathname === '/api/community/pet/voice/chunk') {
        const body = JSON.parse(String(options.body || '{}'));
        const uploadProvider = url.searchParams.get('provider') || '';
        window.__petFixtureVoiceUploads.push(body);
        window.__petFixtureVoiceUploadAttempts.push({
          body,
          provider: uploadProvider,
          feId: window.__petFixtureFeId
        });
        window.__petFixtureVoiceRequestSequence += 1;
        const requestName = ['one', 'two', 'three', 'four'][window.__petFixtureVoiceRequestSequence - 1]
          || String(window.__petFixtureVoiceRequestSequence);
        return json({
          ok: true,
          transcript: '鏈湴璇煶璇嗗埆鎴愬姛',
          turn: {
            sessionId: body.sessionId || 'session-qa',
            requestId: 'request-live-' + requestName,
            state: 'thinking',
            conversationEmotionSource: 'voice-transcript-final',
            conversationEmotionSequence: ++window.__petFixtureConversationEmotionSequence,
            sevenEmotion: {
              primary: { key: 'fear', intensity: 0.82 },
              secondary: [],
              confidence: 0.9
            }
          }
        });
      }
      return json({ ok: true });
    };
  </script>
  <script src="/vendor/three.r128.min.js"></script>
  <script src="/pet-emotion-runtime.js"></script>
  <script src="/pet-assistant.js"></script>
  <script src="/pet-particle-orb.js"></script>
</body></html>`;

const silentReplyAudio = Buffer.alloc(44 + 1_600);
silentReplyAudio.write('RIFF', 0, 'ascii');
silentReplyAudio.writeUInt32LE(silentReplyAudio.length - 8, 4);
silentReplyAudio.write('WAVEfmt ', 8, 'ascii');
silentReplyAudio.writeUInt32LE(16, 16);
silentReplyAudio.writeUInt16LE(1, 20);
silentReplyAudio.writeUInt16LE(1, 22);
silentReplyAudio.writeUInt32LE(16_000, 24);
silentReplyAudio.writeUInt32LE(32_000, 28);
silentReplyAudio.writeUInt16LE(2, 32);
silentReplyAudio.writeUInt16LE(16, 34);
silentReplyAudio.write('data', 36, 'ascii');
silentReplyAudio.writeUInt32LE(1_600, 40);

const mime = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixture);
    return;
  }
  if (url.pathname.startsWith('/api/community/pet/audio/')) {
    response.writeHead(200, {
      'content-type': 'audio/wav',
      'content-length': silentReplyAudio.length,
      'cache-control': 'no-store'
    });
    response.end(silentReplyAudio);
    return;
  }
  const component = url.pathname.startsWith('/components/');
  const root = component ? componentsRoot : webRoot;
  const relative = component ? url.pathname.slice('/components/'.length) : url.pathname.slice(1);
  const file = path.resolve(root, decodeURIComponent(relative));
  if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': mime.get(path.extname(file)) || 'application/octet-stream' });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--remote-allow-origins=*',
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
const pending = new Map();
let nextId = 1;
const browserConsole = [];

async function debugPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) {
      try {
        // Edge can briefly hold this bootstrap file with an exclusive Windows
        // share mode while it writes the port. Treat that as "not ready yet".
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch (error) {
        if (!['EBUSY', 'EACCES', 'EPERM'].includes(error?.code)) throw error;
      }
    }
    await delay(80);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(80);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer, method });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'browser evaluation failed');
  }
  return result.result?.value;
}

async function waitForPetReady(label, previousBootId = '') {
  let lastError = null;
  const previousBootIdLiteral = JSON.stringify(String(previousBootId || ''));
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const ready = await evaluate(`document.readyState === 'complete'
        && Boolean(window.FeMonsterPetAssistant)
        && Boolean(document.getElementById('petAssistantVoicePlaybackToggle'))
        && Boolean(window.__petFixtureBootId)
        && (!${previousBootIdLiteral} || window.__petFixtureBootId !== ${previousBootIdLiteral})`);
      if (ready) return;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`${label} did not initialize${lastError ? `: ${lastError.message}` : ''}`);
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.consoleAPICalled') {
      browserConsole.push((message.params?.args || []).map((entry) => entry.value || entry.description || '').join(' '));
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const rejectPending = () => {
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`DevTools socket closed while waiting for ${waiter.method}: ${browserError.trim()}`));
      pending.delete(id);
    }
  };
  socket.addEventListener('close', rejectPending);
  socket.addEventListener('error', rejectPending);
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Browser.grantPermissions', {
    origin: `http://127.0.0.1:${port}`,
    permissions: ['audioCapture']
  });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await waitForPetReady('initial pet fixture');
  await delay(180);
  const voiceSettingsDefault = await evaluate(`(() => {
    const disclosure = document.getElementById('petAssistantVoiceDisclosure');
    return {
      exists: disclosure instanceof HTMLDetailsElement,
      open: disclosure?.open,
      summary: disclosure?.querySelector('summary')?.textContent?.trim() || '',
      selectPreserved: Boolean(document.getElementById('petAssistantVoiceSelect')),
      playbackPreserved: Boolean(document.getElementById('petAssistantVoicePlaybackToggle')),
      shortcutPreserved: Boolean(document.getElementById('petAssistantShortcutCapture'))
    };
  })()`);
  assert.equal(voiceSettingsDefault.exists, true,
    'pet voice preferences must live in a runtime-settings disclosure');
  assert.equal(voiceSettingsDefault.open, false,
    'pet voice preferences must remain collapsed by default');
  assert.match(voiceSettingsDefault.summary, /桌宠语音/,
    'runtime settings no longer names the pet voice group');
  assert.deepEqual({
    selectPreserved: voiceSettingsDefault.selectPreserved,
    playbackPreserved: voiceSettingsDefault.playbackPreserved,
    shortcutPreserved: voiceSettingsDefault.shortcutPreserved
  }, {
    selectPreserved: true,
    playbackPreserved: true,
    shortcutPreserved: true
  }, 'voice preferences were lost while moving them into runtime settings');
  await evaluate(`document.getElementById('runtimeSettingsPanel').hidden = false`);
  await evaluate(`document.getElementById('petAssistantVoiceDisclosureSummary').focus()`);
  await command('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
  });
  await command('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
  });
  await delay(80);
  const voiceSettingsKeyboard = await evaluate(`(() => {
    const disclosure = document.getElementById('petAssistantVoiceDisclosure');
    const summary = document.getElementById('petAssistantVoiceDisclosureSummary');
    return {
      open: disclosure.open,
      expanded: summary.getAttribute('aria-expanded'),
      controls: summary.getAttribute('aria-controls'),
      optionsId: disclosure.querySelector('.runtime-settings-group-content')?.id || '',
      focused: document.activeElement === summary
    };
  })()`);
  assert.deepEqual(voiceSettingsKeyboard, {
    open: true,
    expanded: 'true',
    controls: 'petAssistantVoiceDisclosureOptions',
    optionsId: 'petAssistantVoiceDisclosureOptions',
    focused: true
  }, 'voice settings summary must expand from the keyboard and expose synchronized ARIA state');
  assert.equal(
    await evaluate(`JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').voiceSettingsOpen`),
    true,
    'voice settings expansion must be persisted immediately'
  );
  await evaluate(`document.getElementById('runtimeSettingsPanel').hidden = true`);
  await evaluate(`window.FeMonsterPetAssistant.close()`);

  const textEmotion = await evaluate(`window.FeMonsterPetAssistant.send('你又改坏了，我现在真的很生气！').then(() => ({
    emotion: window.FeMonsterPetEmotionRuntime.snapshot().sevenEmotions.primary,
    dataset: document.getElementById('petAssistant').dataset.petEmotion,
    target: window.FeMonsterPetParticleOrb.status().targetEmotionColor
  }))`, true);
  assert.equal(textEmotion.emotion, 'anger', 'text ACK did not reach the browser emotion runtime');
  assert.equal(textEmotion.dataset, 'anger', 'text ACK did not reach the particle presentation');
  assert.notDeepEqual(textEmotion.target, [0.84, 0.98, 1],
    'text anger still used the playback-derived default particle colour');
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-proactive', { detail: {
    type: 'companion-check-in', source: 'heartbeat', createdAt: Date.now(),
    variationKey: 'browser-emotion-proactive', emotion: window.FeMonsterPetEmotionRuntime.context(), playback: {}
  }}))`);
  await delay(80);
  assert.equal(await evaluate(`window.FeMonsterPetEmotionRuntime.snapshot().sevenEmotions.primary`), 'anger',
    'a proactive ACK without new user text overwrote the latest visible user emotion');
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.state', historical: true, payload: {
      sessionId: 'session-qa', requestId: 'historical-emotion', sequence: 999,
      conversationEmotionSource: 'user-text', conversationEmotionSequence: 999,
      sevenEmotion: { primary: { key: 'joy', intensity: 1 }, secondary: [], confidence: 1 }
    }
  }}))`);
  assert.equal(await evaluate(`window.FeMonsterPetEmotionRuntime.snapshot().sevenEmotions.primary`), 'anger',
    'historical event replay overwrote the live browser emotion');

  const narrationBefore = await evaluate(`(() => ({
    history: JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').messages || [],
    chatRequests: window.__petFixtureChatRequests.length,
    panelOpen: document.getElementById('petAssistant').classList.contains('is-open')
  }))()`);
  await evaluate(`(() => {
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }];
    window.__petFixtureNarration = window.FeMonsterPetAssistant.narrate(
      '服务器旁白只播放一次，不创建聊天消息。',
      { source: 'product-tour' }
    );
    let startedSettled = false;
    let finishedSettled = false;
    window.__petFixtureNarration.started.then(() => { startedSettled = true; });
    window.__petFixtureNarration.finished.then(() => { finishedSettled = true; });
    window.__petFixtureNarrationFlags = () => ({ startedSettled, finishedSettled });
  })()`);
  await delay(40);
  const narrationCreated = await evaluate(`(() => ({
    mode: window.__petFixtureNarration.mode,
    utteranceCount: window.__petFixtureSpeechUtterances.length,
    request: window.__petFixtureNarrationRequests.at(-1) || null,
    audioSrc: window.__petFixtureReplyAudioDeferred.at(-1)?.src || '',
    ...window.__petFixtureNarrationFlags()
  }))()`);
  assert.deepEqual(narrationCreated, {
    mode: 'server-tts',
    utteranceCount: 0,
    request: {
      requestId: narrationCreated.request.requestId,
      text: '服务器旁白只播放一次，不创建聊天消息。',
      voiceId: 'chatterbox:tour-fixture',
      provider: 'netease'
    },
    audioSrc: '/api/community/pet/audio/pet-audio-tour-fixture?provider=netease',
    startedSettled: false,
    finishedSettled: false
  }, 'product-tour narration must request the selected server voice and wait for real audio lifecycle events');
  await evaluate(`window.__petFixtureReplyAudioDeferred.at(-1).resolve()`);
  await delay(0);
  assert.deepEqual(await evaluate(`window.__petFixtureNarrationFlags()`), {
    startedSettled: true,
    finishedSettled: false
  }, 'narration.started must settle only when server audio actually starts playing');
  await evaluate(`window.__petFixtureFinishReplyAudio()`);
  await delay(0);
  assert.deepEqual(await evaluate(`window.__petFixtureNarrationFlags()`), {
    startedSettled: true,
    finishedSettled: true
  }, 'narration.finished must settle when the complete server audio ends');
  const narrationAfter = await evaluate(`(() => ({
    history: JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').messages || [],
    chatRequests: window.__petFixtureChatRequests.length,
    panelOpen: document.getElementById('petAssistant').classList.contains('is-open')
  }))()`);
  assert.deepEqual(narrationAfter, narrationBefore,
    'tour narration must not open the panel, mutate local chat history, or make a chat request');

  await evaluate(`(() => {
    window.__petFixtureNarrationFailure = true;
    window.__petFixtureNarrationRequestCountBeforeFallback = window.__petFixtureNarrationRequests.length;
    window.__petFixtureFallbackLifecycle = window.FeMonsterPetAssistant.narrate(
      '服务器不可用时改用浏览器朗读。',
      { source: 'product-tour' }
    );
  })()`);
  await delay(40);
  const browserFallbackReady = await evaluate(`(() => ({
    mode: window.__petFixtureFallbackLifecycle.mode,
    requestDelta: window.__petFixtureNarrationRequests.length - window.__petFixtureNarrationRequestCountBeforeFallback,
    text: window.__petFixtureSpeechCurrent?.text || ''
  }))()`);
  assert.deepEqual(browserFallbackReady, {
    mode: 'browser-speech-synthesis',
    requestDelta: 1,
    text: '服务器不可用时改用浏览器朗读。'
  }, 'a server narration failure must fall back to browser speech without entering chat');
  await evaluate(`window.__petFixtureSpeechStart(); window.__petFixtureSpeechFinish()`);
  const browserFallbackOutcome = await evaluate(`window.__petFixtureFallbackLifecycle.finished`, true);
  assert.equal(browserFallbackOutcome.status, 'completed');
  await evaluate(`window.__petFixtureNarrationFailure = false`);

  await evaluate(`(() => {
    window.__petFixtureReplyAudioPlans = [{ type: 'resolve' }];
    window.__petFixtureCancelledLifecycle = window.FeMonsterPetAssistant.narrate(
      '这段服务器讲解会被跳过。',
      { source: 'product-tour' }
    );
  })()`);
  await delay(40);
  const narrationCancelled = await evaluate(`(() => {
    const lifecycle = window.__petFixtureCancelledLifecycle;
    const beforeServerCancel = window.__petFixtureNarrationCancelRequests.length;
    const cancelled = window.FeMonsterPetAssistant.narrate.cancel('skip');
    return lifecycle.finished.then((outcome) => ({
      cancelled,
      outcome,
      serverCancelCalls: window.__petFixtureNarrationCancelRequests.length - beforeServerCancel,
      audioPlaying: window.__petFixtureReplyAudioPlaying
    }));
  })()`, true);
  assert.equal(narrationCancelled.cancelled, true, 'narrate.cancel must report an active cancellation');
  assert.equal(narrationCancelled.outcome.status, 'cancelled');
  assert.equal(narrationCancelled.outcome.reason, 'skip');
  assert.equal(narrationCancelled.serverCancelCalls, 1,
    'narrate.cancel must notify the isolated server narration operation');
  assert.equal(narrationCancelled.audioPlaying, false, 'narrate.cancel must immediately stop server audio');

  await evaluate(`(() => {
    window.__petFixtureReplyAudioPlans = [{ type: 'resolve' }];
    window.__petFixtureFirstReplay = window.FeMonsterPetAssistant.narrate(
      '第一次服务器讲解。',
      { source: 'product-tour' }
    );
  })()`);
  await delay(40);
  const narrationReplayed = await evaluate(`(() => {
    const first = window.__petFixtureFirstReplay;
    const second = window.FeMonsterPetAssistant.narrate('重新播放后的完整讲解。', { source: 'product-tour' });
    return first.finished.then((outcome) => {
      const result = {
        outcome,
        currentMode: second.mode,
        currentStatus: second.status
      };
      second.cancel('test-cleanup');
      return result;
    });
  })()`, true);
  assert.equal(narrationReplayed.outcome.status, 'cancelled');
  assert.equal(narrationReplayed.outcome.reason, 'replaced');
  assert.equal(narrationReplayed.currentMode, 'server-tts');
  assert.equal(narrationReplayed.currentStatus, 'pending');

  await evaluate(`(() => {
    window.__petFixtureReplyAudioPlans = [{ type: 'resolve' }];
    window.__petFixtureBargeInBeforeChat = window.__petFixtureChatRequests.length;
    window.__petFixtureBargeInBeforeCancel = window.__petFixtureNarrationCancelRequests.length;
    window.__petFixtureBargeInLifecycle = window.FeMonsterPetAssistant.narrate('用户一开口，这段演示就停止。', {
      source: 'product-tour'
    });
  })()`);
  await delay(40);
  const narrationBargeIn = await evaluate(`(() => {
    const lifecycle = window.__petFixtureBargeInLifecycle;
    window.FeMonsterPetAssistant.startLiveConversation();
    return lifecycle.finished.then((outcome) => {
      const result = {
        outcome,
        cancelCalls: window.__petFixtureNarrationCancelRequests.length - window.__petFixtureBargeInBeforeCancel,
        audioPlaying: window.__petFixtureReplyAudioPlaying,
        chatRequests: window.__petFixtureChatRequests.length - window.__petFixtureBargeInBeforeChat
      };
      window.FeMonsterPetAssistant.stopLiveConversation('fixture cleanup');
      return result;
    });
  })()`, true);
  assert.equal(narrationBargeIn.outcome.status, 'cancelled');
  assert.equal(narrationBargeIn.outcome.reason, 'barge-in');
  assert.equal(narrationBargeIn.cancelCalls, 1);
  assert.equal(narrationBargeIn.audioPlaying, false);
  assert.equal(narrationBargeIn.chatRequests, 0,
    'interrupting tour narration with voice must not create a chat turn on its own');

  const narrationFallback = await evaluate(`(() => {
    window.FeMonsterPetAssistant.setVoicePlaybackEnabled(false);
    const beforeUtterances = window.__petFixtureSpeechUtterances.length;
    const lifecycle = window.FeMonsterPetAssistant.narrate('静音时仍然显示完整文字。', {
      source: 'product-tour', fallbackDurationMs: 1
    });
    return Promise.all([lifecycle.started, lifecycle.finished]).then(([started, finished]) => ({
      mode: lifecycle.mode,
      started,
      finished,
      utteranceDelta: window.__petFixtureSpeechUtterances.length - beforeUtterances,
      bubble: document.getElementById('petAssistantSpeech')?.textContent || '',
      panelOpen: document.getElementById('petAssistant').classList.contains('is-open')
    }));
  })()`, true);
  assert.equal(narrationFallback.mode, 'text-fallback');
  assert.equal(narrationFallback.started.status, 'fallback');
  assert.equal(narrationFallback.finished.status, 'fallback');
  assert.equal(narrationFallback.utteranceDelta, 0);
  assert.equal(narrationFallback.bubble, '静音时仍然显示完整文字。');
  assert.equal(narrationFallback.panelOpen, false);
  await evaluate(`window.FeMonsterPetAssistant.setVoicePlaybackEnabled(true)`);

  const reducedNarrationFallback = await evaluate(`(() => {
    const beforeUtterances = window.__petFixtureSpeechUtterances.length;
    const lifecycle = window.FeMonsterPetAssistant.narrate('减少动态时使用文字讲解。', {
      source: 'product-tour', reduced: true, fallbackDurationMs: 0
    });
    return lifecycle.finished.then((outcome) => ({
      outcome,
      utteranceDelta: window.__petFixtureSpeechUtterances.length - beforeUtterances,
      bubble: document.getElementById('petAssistantSpeech')?.textContent || ''
    }));
  })()`, true);
  assert.equal(reducedNarrationFallback.outcome.status, 'fallback');
  assert.equal(reducedNarrationFallback.outcome.reason, 'reduced');
  assert.equal(reducedNarrationFallback.utteranceDelta, 0);
  assert.equal(reducedNarrationFallback.bubble, '减少动态时使用文字讲解。');

  const offlineNarrationFallback = await evaluate(`(() => {
    window.dispatchEvent(new Event('offline'));
    const beforeUtterances = window.__petFixtureSpeechUtterances.length;
    const lifecycle = window.FeMonsterPetAssistant.narrate('离线时也保留完整文字。', {
      source: 'product-tour', fallbackDurationMs: 0
    });
    return lifecycle.finished.then((outcome) => {
      const result = {
        outcome,
        utteranceDelta: window.__petFixtureSpeechUtterances.length - beforeUtterances,
        bubble: document.getElementById('petAssistantSpeech')?.textContent || ''
      };
      window.dispatchEvent(new Event('online'));
      return result;
    });
  })()`, true);
  assert.equal(offlineNarrationFallback.outcome.status, 'fallback');
  assert.equal(offlineNarrationFallback.outcome.reason, 'offline');
  assert.equal(offlineNarrationFallback.utteranceDelta, 0);
  assert.equal(offlineNarrationFallback.bubble, '离线时也保留完整文字。');
  await delay(120);
  await evaluate(`window.FeMonsterPetAssistant.clearBubble()`);
  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioLoads = 0;
    window.__petFixtureReplyAudioPlans = [
      { type: 'reject', name: 'AbortError' },
      { type: 'resolve' }
    ];
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.complete', payload: {
        sessionId: 'session-qa', requestId: 'request-audio-retry', sequence: 1,
        text: 'retryable voice response', audioId: 'audio-retry-01'
      }
    }}));
  })()`);
  await delay(220);
  const retryablePlayback = await evaluate(`(() => ({
    calls: window.__petFixtureReplyAudioCalls.slice(),
    loads: window.__petFixtureReplyAudioLoads,
    src: document.getElementById('petAssistantAudio').getAttribute('src'),
    state: document.getElementById('petAssistant').dataset.state,
    status: document.getElementById('petAssistantSpeech')?.textContent || ''
  }))()`);
  assert.equal(retryablePlayback.calls.length, 2,
    `a transient AbortError did not receive exactly one safe retry: ${JSON.stringify(retryablePlayback)}`);
  assert.equal(retryablePlayback.loads, 1,
    `reply audio source was not explicitly loaded exactly once: ${JSON.stringify(retryablePlayback)}`);
  assert.ok(retryablePlayback.calls.every((call) => call.src.includes('audio-retry-01')),
    `the retry escaped its reply source: ${JSON.stringify(retryablePlayback)}`);
  assert.equal(retryablePlayback.state, 'speaking',
    `successful retry did not preserve speaking state: ${JSON.stringify(retryablePlayback)}`);

  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'defer' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-segment-synced-text', sequence: 1,
      audioSequence: 0, audioId: 'audio-segment-synced-0', text: '第一句。', kind: 'content', final: false
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-segment-synced-text', sequence: 2,
      audioSequence: 1, audioId: 'audio-segment-synced-1', text: '第二句。', kind: 'content', final: true
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-segment-synced-text', sequence: 3,
      delta: '第一句。第二句。'
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-segment-synced-text', sequence: 4,
      text: '第一句。第二句。', audioId: '', audioSegments: 2, audioStreamFinal: true
    });
  })()`);
  assert.equal(await evaluate(`window.__petFixtureReplyAudioDeferred.length`), 1,
    'the first segment did not reach the pending media boundary');
  await evaluate(`window.__petFixtureReplyAudioDeferred[0].resolve()`);
  await delay(30);
  const firstSegmentTextState = await evaluate(`(() => {
    const text = [...document.querySelectorAll('.pet-assistant__message.is-assistant p')].at(-1)?.textContent || '';
    return { text, calls: window.__petFixtureReplyAudioCalls.map((call) => call.src) };
  })()`);
  assert.equal(firstSegmentTextState.text.includes('第一句。'), true,
    `the first spoken segment was not revealed at its playing boundary: ${JSON.stringify(firstSegmentTextState)}`);
  assert.equal(firstSegmentTextState.text.includes('第二句。'), false,
    `the second segment text appeared while its Chatterbox audio was still pending: ${JSON.stringify(firstSegmentTextState)}`);
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(25);
  const pendingSecondSegmentState = await evaluate(`(() => ({
    text: [...document.querySelectorAll('.pet-assistant__message.is-assistant p')].at(-1)?.textContent || '',
    calls: window.__petFixtureReplyAudioCalls.map((call) => call.src),
    deferred: window.__petFixtureReplyAudioDeferred.length
  }))()`);
  assert.equal(pendingSecondSegmentState.calls.length, 2,
    `the second Chatterbox segment was not scheduled after the first ended: ${JSON.stringify(pendingSecondSegmentState)}`);
  assert.equal(pendingSecondSegmentState.text.includes('第二句。'), false,
    `the second segment text appeared before its own playing event: ${JSON.stringify(pendingSecondSegmentState)}`);
  assert.equal(pendingSecondSegmentState.deferred, 2,
    `the second Chatterbox segment was not held at the pending media boundary: ${JSON.stringify(pendingSecondSegmentState)}`);
  await evaluate(`window.__petFixtureReplyAudioDeferred[1].resolve()`);
  await delay(25);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].at(-1)?.textContent || ''`),
    '第一句。第二句。',
    'the second segment text was not revealed when its audio became audible'
  );
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(25);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].at(-1)?.textContent || ''`),
    '第一句。第二句。',
    'the completed segment-synced reply did not settle to the exact final text'
  );

  await evaluate(`(() => {
    window.FeMonsterPetAssistant.setVoicePlaybackEnabled(true);
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-segment-muted', sequence: 1,
      audioSequence: 0, audioId: 'audio-segment-muted', text: 'muted fallback text', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-segment-muted', sequence: 2,
      delta: 'muted fallback text'
    });
    window.FeMonsterPetAssistant.setVoicePlaybackEnabled(false);
  })()`);
  await delay(20);
  const mutedSegmentState = await evaluate(`(() => ({
    visible: [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('muted fallback text')),
    src: document.getElementById('petAssistantAudio').getAttribute('src'),
    playbackEnabled: window.FeMonsterPetAssistant.voicePlaybackEnabled
  }))()`);
  assert.deepEqual(mutedSegmentState, { visible: true, src: null, playbackEnabled: false },
    `muting a pending segment did not release text and clear playback: ${JSON.stringify(mutedSegmentState)}`);
  await evaluate(`window.FeMonsterPetAssistant.setVoicePlaybackEnabled(true)`);

  const textVisibleBeforePlay = await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'resolve' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 1,
      audioSequence: 0, audioId: 'audio-stream-chunk-0', kind: 'thinking-cue', final: false
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 2,
      audioSequence: 1, audioId: 'audio-stream-chunk-1', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 3,
      delta: 'voice-first-visible-text'
    });
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('voice-first-visible-text'));
  })()`);
  assert.equal(
    textVisibleBeforePlay,
    false,
    'streaming text became visible before the first audio play promise settled'
  );
  assert.equal(await evaluate(`window.__petFixtureReplyAudioDeferred.length`), 1,
    'the first streamed audio did not reach the pending play boundary');
  await evaluate(`window.__petFixtureReplyAudioDeferred[0].resolve()`);
  await delay(80);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('voice-first-visible-text'))`),
    true,
    'streaming text was not released after audio playback actually started'
  );
  const laterDeltaVisibleImmediately = await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 4,
      audioSequence: 1, audioId: 'audio-stream-chunk-1', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 5,
      delta: ' later-visible-text'
    });
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('later-visible-text'));
  })()`);
  assert.equal(laterDeltaVisibleImmediately, true,
    'a later audio chunk re-armed the one-time voice-first text gate');
  assert.deepEqual(
    await evaluate(`window.__petFixtureReplyAudioCalls.map((call) => call.src.match(/audio-stream-chunk-[01]/)?.[0] || '')`),
    ['audio-stream-chunk-0'],
    'the first streamed thought/speech chunk did not start before completion'
  );
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioEndedAt = performance.now();
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(80);
  assert.deepEqual(
    await evaluate(`window.__petFixtureReplyAudioCalls.map((call) => call.src.match(/audio-stream-chunk-[01]/)?.[0] || '')`),
    ['audio-stream-chunk-0', 'audio-stream-chunk-1'],
    'streamed sentence chunks were not played in audioSequence order'
  );
  const streamedChunkScheduleGapMs = await evaluate(`Math.max(0,
    (window.__petFixtureReplyAudioCalls[1]?.at || 0) - (window.__petFixtureReplyAudioEndedAt || 0))`);
  assert.ok(streamedChunkScheduleGapMs <= 25,
    `the next streamed sentence was not scheduled immediately after the previous one (${streamedChunkScheduleGapMs.toFixed(2)}ms)`);
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 6,
      audioSequence: 2, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-streamed-audio', sequence: 7,
      text: 'streamed answer', audioId: '', audioSegments: 2
    });
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(80);
  const streamedPlayback = await evaluate(`(() => ({
    calls: window.__petFixtureReplyAudioCalls.map((call) => call.src),
    state: document.getElementById('petAssistant').dataset.state,
    finalText: [...document.querySelectorAll('.pet-assistant__message.is-assistant p')].at(-1)?.textContent || ''
  }))()`);
  streamedPlayback.chunkScheduleGapMs = streamedChunkScheduleGapMs;
  assert.equal(streamedPlayback.calls.length, 2,
    `the final event replayed streamed speech: ${JSON.stringify(streamedPlayback)}`);
  assert.equal(streamedPlayback.finalText, 'streamed answer');

  const playbackCursorCancelBaseline = await evaluate(`window.__petFixtureCancelRequests.length`);
  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-playback-cursor', sequence: 1,
      audioSequence: 0, audioId: 'audio-cursor-thinking', text: 'thinking cue', kind: 'thinking-cue', final: false
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-playback-cursor', sequence: 2,
      audioSequence: 1, audioId: 'audio-cursor-content-1', text: 'heard content', kind: 'content', final: false
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-playback-cursor', sequence: 3,
      audioSequence: 2, audioId: 'audio-cursor-content-2', text: 'partial content', kind: 'content', final: false
    });
  })()`);
  await delay(20);
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(20);
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(20);
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    const audio = document.getElementById('petAssistantAudio');
    audio.currentTime = .137;
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-playback-cursor', sequence: 4,
      audioSequence: 3, audioId: '', text: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-playback-cursor', sequence: 5,
      text: 'heard contentpartial content', audioId: '', audioSegments: 3, audioStreamFinal: true
    });
    const toggle = document.getElementById('petAssistantVoicePlaybackToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await delay(30);
  const playbackCursorCancel = await evaluate(`(() => ({
    requests: window.__petFixtureCancelRequests.slice(${playbackCursorCancelBaseline}),
    source: document.getElementById('petAssistantAudio').getAttribute('src')
  }))()`);
  assert.equal(playbackCursorCancel.requests.length, 1,
    `playback interruption emitted duplicate cancel requests: ${JSON.stringify(playbackCursorCancel)}`);
  assert.deepEqual(playbackCursorCancel.requests[0].playedAudioSequences, [1],
    'only fully ended content audio may be reported as heard');
  assert.equal(playbackCursorCancel.requests[0].maxPlayedAudioSequence, 1,
    'the contiguous fully played content cursor was not reported');
  assert.equal(playbackCursorCancel.requests[0].activeAudioSequence, 2,
    'the interrupted active audio sequence was not reported');
  assert.equal(playbackCursorCancel.requests[0].playedMs, 137,
    'the active audio playback position was not reported');
  assert.equal(Object.hasOwn(playbackCursorCancel.requests[0], 'text'), false,
    'client-authored text must never be sent in a playback truncation request');
  assert.equal(playbackCursorCancel.source, null,
    'playback interruption did not clear the shared media source');
  await evaluate(`(() => {
    const toggle = document.getElementById('petAssistantVoicePlaybackToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  const mediaErrorCancelBaseline = await evaluate(`window.__petFixtureCancelRequests.length`);
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-media-error-cursor', sequence: 1,
      audioSequence: 0, audioId: 'audio-media-error', text: 'failed content', kind: 'content', final: false
    });
  })()`);
  await delay(20);
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    audio.currentTime = .221;
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = false;
    audio.dispatchEvent(new Event('error'));
    const toggle = document.getElementById('petAssistantVoicePlaybackToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await delay(30);
  const mediaErrorCancel = await evaluate(
    `window.__petFixtureCancelRequests.slice(${mediaErrorCancelBaseline})`);
  assert.equal(mediaErrorCancel.length, 1,
    `media failure cleanup emitted duplicate cancel requests: ${JSON.stringify(mediaErrorCancel)}`);
  assert.deepEqual(mediaErrorCancel[0].playedAudioSequences, [],
    'a failed content segment must never be reported as fully heard');
  assert.equal(Object.hasOwn(mediaErrorCancel[0], 'maxPlayedAudioSequence'), false,
    'a failed first content segment must stop the contiguous played cursor');
  assert.equal(Object.hasOwn(mediaErrorCancel[0], 'activeAudioSequence'), false,
    'a media failure must clear the active audio cursor');
  assert.equal(Object.hasOwn(mediaErrorCancel[0], 'playedMs'), false,
    'a media failure must clear stale active playback timing');
  await evaluate(`(() => {
    const toggle = document.getElementById('petAssistantVoicePlaybackToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  const textVisibleAtPlayPromise = await evaluate(`(() => {
    window.__petFixtureReplyAudioPlans = [{ type: 'resolve-before-playing' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-audible-boundary', sequence: 1,
      audioSequence: 0, audioId: 'audio-audible-boundary', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-audible-boundary', sequence: 2,
      delta: 'audible-boundary-text'
    });
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('audible-boundary-text'));
  })()`);
  await delay(60);
  assert.equal(textVisibleAtPlayPromise, false,
    'the first text escaped when play() resolved but before the media became audible');
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('audible-boundary-text'))`),
    false,
    'the first text escaped before the media playing event'
  );
  await evaluate(`document.getElementById('petAssistantAudio').dispatchEvent(new Event('playing'))`);
  await delay(20);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('audible-boundary-text'))`),
    true,
    'the audible media boundary did not release buffered text'
  );
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-audible-boundary', sequence: 3,
      audioSequence: 1, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-audible-boundary', sequence: 4,
      text: 'audible-boundary-text', audioId: '', audioSegments: 1, audioStreamFinal: true
    });
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  await delay(20);

  const timeoutTextVisibleImmediately = await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-text-lead-timeout', sequence: 1,
      audioSequence: 0, audioId: 'audio-timeout-0001', text: 'voice-lead-timeout-text', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-text-lead-timeout', sequence: 2,
      delta: 'voice-lead-timeout-text'
    });
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('voice-lead-timeout-text'));
  })()`);
  assert.equal(timeoutTextVisibleImmediately, false,
    'the timeout fallback text escaped before playback or its lead budget');
  await delay(220);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('voice-lead-timeout-text'))`),
    false,
    'the timeout fallback released text substantially before its 300ms budget'
  );
  await delay(130);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('voice-lead-timeout-text'))`),
    false,
    'streaming text escaped on a timer before the media became audible'
  );
  await evaluate(`document.getElementById('petAssistantAudio').dispatchEvent(new Event('error'))`);
  await delay(20);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('voice-lead-timeout-text'))`),
    true,
    'an explicit media failure did not release buffered text'
  );
  await evaluate(`(() => {
    window.__petFixtureReplyAudioDeferred[0].resolve();
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-text-lead-timeout', sequence: 3,
      audioSequence: 1, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-text-lead-timeout', sequence: 4,
      text: 'voice lead timeout answer', audioId: '', audioSegments: 1
    });
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    document.getElementById('petAssistantAudio').dispatchEvent(new Event('ended'));
  })()`);
  await delay(40);

  const noAudioFinalReleased = await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-no-audio-final', sequence: 1,
      delta: 'no-audio-final-text'
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-no-audio-final', sequence: 2,
      audioSequence: 0, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-no-audio-final', sequence: 3,
      text: 'no-audio-final-text', audioId: '', audioSegments: 0, audioStreamFinal: true
    });
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('no-audio-final-text'));
  })()`);
  assert.equal(noAudioFinalReleased, true,
    'a server-confirmed no-audio terminal reply permanently blocked buffered text');

  await evaluate(`(() => {
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-audio-start-timeout', sequence: 1,
      audioSequence: 0, audioId: 'audio-start-timeout-1', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-audio-start-timeout', sequence: 2,
      delta: 'audio-start-timeout-text'
    });
  })()`);
  await delay(5_150);
  const startTimeoutState = await evaluate(`(() => ({
    visible: [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('audio-start-timeout-text')),
    src: document.getElementById('petAssistantAudio').getAttribute('src')
  }))()`);
  assert.equal(startTimeoutState.visible, true,
    `the explicit five-second media start timeout did not release buffered text: ${JSON.stringify(startTimeoutState)}`);
  assert.equal(startTimeoutState.src, null,
    `the timed-out media source was not cleared: ${JSON.stringify(startTimeoutState)}`);
  await evaluate(`(() => {
    window.__petFixtureReplyAudioDeferred[0]?.resolve();
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-audio-start-timeout', sequence: 3,
      audioSequence: 1, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-audio-start-timeout', sequence: 4,
      text: 'audio-start-timeout-text', audioId: '', audioSegments: 1, audioStreamFinal: true
    });
  })()`);
  await delay(20);

  const switchedRequestState = await evaluate(`(() => {
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'resolve' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-text-lead-cancelled', sequence: 1,
      audioSequence: 0, audioId: 'audio-cancelled-01', text: 'cancelled-buffer-must-not-leak', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-text-lead-cancelled', sequence: 2,
      delta: 'cancelled-buffer-must-not-leak'
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-text-lead-replacement', sequence: 1,
      audioSequence: 0, audioId: 'audio-replacement-1', text: 'replacement-visible-text', kind: 'content', final: false
    });
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-text-lead-replacement', sequence: 2,
      delta: 'replacement-visible-text'
    });
    const texts = [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .map((node) => node.textContent);
    return {
      cancelledVisible: texts.some((text) => text.includes('cancelled-buffer-must-not-leak')),
      replacementVisible: texts.some((text) => text.includes('replacement-visible-text')),
      deferredCount: window.__petFixtureReplyAudioDeferred.length
    };
  })()`);
  assert.equal(switchedRequestState.cancelledVisible, false,
    `switching requests leaked cancelled buffered text: ${JSON.stringify(switchedRequestState)}`);
  assert.equal(switchedRequestState.replacementVisible, true,
    `the replacement request did not release after its audio started: ${JSON.stringify(switchedRequestState)}`);
  assert.equal(switchedRequestState.deferredCount, 1,
    `the superseded playback fixture was not pending as expected: ${JSON.stringify(switchedRequestState)}`);
  await evaluate(`window.__petFixtureReplyAudioDeferred[0].reject('AbortError')`);
  await delay(340);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('cancelled-buffer-must-not-leak'))`),
    false,
    'a cancelled request leaked its buffered text after the lead timeout'
  );
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-text-lead-replacement', sequence: 3,
      audioSequence: 1, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-text-lead-replacement', sequence: 4,
      text: 'replacement-visible-text', audioId: '', audioSegments: 1
    });
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    document.getElementById('petAssistantAudio').dispatchEvent(new Event('ended'));
    emit('pet.ai.delta', {
      sessionId: 'session-qa', requestId: 'request-text-only', sequence: 1,
      delta: 'nonvoice-visible-immediately'
    });
  })()`);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')].some((node) => node.textContent.includes('nonvoice-visible-immediately'))`),
    true,
    'a normal nonvoice delta was incorrectly delayed by the audio gate'
  );
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete', payload: {
      sessionId: 'session-qa', requestId: 'request-text-only', sequence: 2,
      text: 'nonvoice-visible-immediately'
    }
  }}))`);

  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'resolve' }];
    const complete = (requestId, audioId) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.complete', payload: {
        sessionId: 'session-qa', requestId, sequence: 1, text: requestId, audioId
      }
    }}));
    complete('request-audio-old', 'audio-old-0001');
    complete('request-audio-new', 'audio-new-0002');
  })()`);
  await delay(40);
  await evaluate(`window.__petFixtureReplyAudioDeferred[0].reject('AbortError')`);
  await delay(100);
  const supersededPlayback = await evaluate(`(() => ({
    calls: window.__petFixtureReplyAudioCalls.slice(),
    src: document.getElementById('petAssistantAudio').getAttribute('src'),
    state: document.getElementById('petAssistant').dataset.state,
    status: document.getElementById('petAssistantSpeech')?.textContent || ''
  }))()`);
  assert.equal(supersededPlayback.calls.length, 2,
    `a superseded reply retried or duplicated audio: ${JSON.stringify(supersededPlayback)}`);
  assert.ok(supersededPlayback.src.includes('audio-new-0002'),
    `the older reply reclaimed the shared audio element: ${JSON.stringify(supersededPlayback)}`);
  assert.equal(supersededPlayback.state, 'speaking',
    `an older rejected play Promise overwrote the newer reply state: ${JSON.stringify(supersededPlayback)}`);

  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'reject', name: 'NotAllowedError' }];
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.complete', payload: {
        sessionId: 'session-qa', requestId: 'request-audio-blocked', sequence: 1,
        text: 'blocked voice response', audioId: 'audio-blocked-03'
      }
    }}));
  })()`);
  await delay(80);
  const blockedPlayback = await evaluate(`(() => ({
    calls: window.__petFixtureReplyAudioCalls.slice(),
    state: document.getElementById('petAssistant').dataset.state,
    textVisible: [...document.querySelectorAll('#petAssistantMessages p')]
      .some((node) => node.textContent.includes('blocked voice response'))
  }))()`);
  assert.equal(blockedPlayback.calls.length, 1,
    `an autoplay policy rejection was retried without a user gesture: ${JSON.stringify(blockedPlayback)}`);
  assert.equal(blockedPlayback.state, 'success',
    `an autoplay policy rejection was not downgraded to text: ${JSON.stringify(blockedPlayback)}`);
  assert.equal(blockedPlayback.textVisible, true,
    `the blocked voice reply did not preserve its text fallback: ${JSON.stringify(blockedPlayback)}`);

  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'resolve' }];
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-media-error-recovery', sequence: 1,
      audioSequence: 0, audioId: 'audio-media-error-0', kind: 'content', final: false
    });
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-media-error-recovery', sequence: 2,
      audioSequence: 1, audioId: 'audio-media-error-1', kind: 'content', final: false
    });
  })()`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(`window.__petFixtureReplyAudioDeferred.length >= 1`)) break;
    await delay(20);
  }
  await evaluate(`document.getElementById('petAssistantAudio').dispatchEvent(new Event('error'))`);
  await delay(80);
  const mediaErrorRecovery = await evaluate(`(() => ({
    calls: window.__petFixtureReplyAudioCalls.map((call) => call.src),
    source: document.getElementById('petAssistantAudio').getAttribute('src'),
    playing: window.__petFixtureReplyAudioPlaying
  }))()`);
  assert.equal(mediaErrorRecovery.calls.length, 2,
    `a media error left the streaming audio queue deadlocked: ${JSON.stringify(mediaErrorRecovery)}`);
  assert.ok(mediaErrorRecovery.source.includes('audio-media-error-1'),
    `the audio queue did not advance past a failed segment: ${JSON.stringify(mediaErrorRecovery)}`);
  assert.equal(mediaErrorRecovery.playing, true);
  await evaluate(`window.__petFixtureReplyAudioDeferred[0]?.reject('AbortError')`);
  await delay(20);
  await evaluate(`(() => {
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-media-error-recovery', sequence: 3,
      audioSequence: 2, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-media-error-recovery', sequence: 4,
      text: 'media error recovery complete', audioId: '', audioSegments: 2, audioStreamFinal: true
    });
  })()`);

  const particleOrb = await evaluate(`(() => {
    const canvas = document.getElementById('petAssistantParticleOrb');
    const status = window.FeMonsterPetParticleOrb?.status?.() || null;
    let hasWebGlContext = false;
    let nonTransparentPixels = 0;
    let pixelCoverage = 0;
    try {
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      hasWebGlContext = Boolean(gl);
      if (gl) {
        window.FeMonsterPetParticleOrb?.renderOnce?.();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 4) nonTransparentPixels += 1;
        }
        pixelCoverage = nonTransparentPixels / Math.max(1, width * height);
      }
    } catch (_) {}
    return {
      status,
      hasWebGlContext,
      nonTransparentPixels,
      pixelCoverage,
      renderer: canvas?.dataset?.renderer || '',
      rootReady: document.getElementById('petAssistant')?.dataset?.particleOrb || ''
    };
  })()`);
  assert.equal(particleOrb.rootReady, 'ready', `particle runtime did not become ready: ${JSON.stringify(particleOrb)}`);
  assert.equal(particleOrb.renderer, 'webgl', `particle runtime did not select its GPU path: ${JSON.stringify(particleOrb)}`);
  assert.equal(particleOrb.hasWebGlContext, true, `particle canvas has no WebGL context: ${JSON.stringify(particleOrb)}`);
  assert.equal(particleOrb.status?.particleCount, 8192, `particle count drifted from the video reference density: ${JSON.stringify(particleOrb)}`);
  assert.equal(particleOrb.status?.drawCalls, 1, `particle orb is no longer one GPU draw call: ${JSON.stringify(particleOrb)}`);
  assert.ok(Number(particleOrb.status?.dpr) <= 1.5, `particle DPR exceeded its performance cap: ${JSON.stringify(particleOrb)}`);
  assert.ok(particleOrb.nonTransparentPixels > 720,
    `particle orb rendered no visible particle field: ${JSON.stringify(particleOrb)}`);
  assert.ok(particleOrb.pixelCoverage > 0.005 && particleOrb.pixelCoverage < 0.45,
    `particle field must preserve visible gaps instead of becoming blank or a solid blob: ${JSON.stringify(particleOrb)}`);
  const particleShaderErrors = browserConsole.filter((entry) => /shader|webgl|three\.webglprogram/i.test(entry));
  assert.equal(particleShaderErrors.length, 0, `particle shader failed to compile: ${particleShaderErrors.join('\n')}`);
  const idleCapture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(artifactRoot, 'pet-particle-orb-idle.png'), Buffer.from(idleCapture.data, 'base64'));

  await evaluate(`(() => {
    window.__petFixtureProgramAudio = {
      playing: true,
      energy: 1,
      bass: 1,
      mid: 1,
      treble: 1,
      beat: 1
    };
    document.getElementById('petAssistant').dataset.state = 'speaking';
  })()`);
  await delay(900);
  const maxActiveBounds = await evaluate(`(() => {
    const canvas = document.getElementById('petAssistantParticleOrb');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) return null;
    window.FeMonsterPetParticleOrb?.renderOnce?.();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let edgePixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha <= 4) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) edgePixels += 1;
      }
    }
    return {
      width,
      height,
      minX,
      minY,
      maxX,
      maxY,
      edgePixels,
      margins: {
        left: minX,
        right: maxX < 0 ? width : width - 1 - maxX,
        bottom: minY,
        top: maxY < 0 ? height : height - 1 - maxY
      },
      status: window.FeMonsterPetParticleOrb?.status?.() || null
    };
  })()`);
  assert.ok(maxActiveBounds, 'max-energy particle bounds could not be sampled from the real Edge WebGL surface');
  assert.ok(Math.min(...Object.values(maxActiveBounds.margins)) >= Math.ceil(8 * Number(maxActiveBounds.status?.dpr || 1)),
    `max-energy particle deformation must retain an 8 CSS-pixel safety margin on every canvas edge: ${JSON.stringify(maxActiveBounds)}`);
  assert.equal(maxActiveBounds.edgePixels, 0,
    `max-energy particles touched the canvas boundary and will be clipped: ${JSON.stringify(maxActiveBounds)}`);
  const maxActiveCapture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(artifactRoot, 'pet-particle-orb-max-active.png'), Buffer.from(maxActiveCapture.data, 'base64'));
  await evaluate(`(() => {
    window.__petFixtureProgramAudio = null;
    document.getElementById('petAssistant').dataset.state = 'idle';
  })()`);
  await delay(120);

  await evaluate(`(() => {
    window.__petFixtureProgramAudio = {
      playing: true,
      energy: 0.68,
      bass: 0.82,
      mid: 0.56,
      treble: 0.42,
      beat: 0.74
    };
    document.getElementById('petAssistant').dataset.state = 'speaking';
  })()`);
  await delay(420);
  const activeCapture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(artifactRoot, 'pet-particle-orb-active.png'), Buffer.from(activeCapture.data, 'base64'));
  await evaluate(`(() => {
    window.__petFixtureProgramAudio = null;
    document.getElementById('petAssistant').dataset.state = 'idle';
  })()`);

  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-proactive', { detail: {
    type: 'playback-progress', source: 'playback', createdAt: Date.now(), variationKey: 'qa:1',
    emotion: { mood: 4, energy: 4, drivers: { timeOfDay: 'evening' } },
    playback: { playing: true, positionSeconds: 42, durationSeconds: 180, song: { id: 'qa-song', name: '星际漫游' } }
  }}))`);
  await delay(80);
  const proactiveRequest = await evaluate(`window.__petFixtureChatRequests.at(-1)`);
  assert.equal(proactiveRequest.text, '', 'proactive generation must not impersonate typed user text');
  assert.equal(proactiveRequest.proactiveContext.type, 'playback-progress');
  assert.equal(proactiveRequest.proactiveContext.playback.song.name, '星际漫游');
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete', payload: {
      sessionId: 'session-qa', requestId: 'request-proactive-qa', sequence: 1,
      text: '这段像把星光折进了低频里，你觉得它更像在漂浮，还是在靠近？'
    }
  }}))`);
  await delay(80);
  const proactiveBubble = await evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    const panel = document.getElementById('petAssistantPanel');
    const speech = document.getElementById('petAssistantSpeech');
    const style = getComputedStyle(speech);
    return {
      active: root.dataset.petProactive,
      panelHidden: panel.hidden,
      text: speech.textContent,
      display: style.display,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth
    };
  })()`);
  assert.equal(proactiveBubble.active, 'true', `proactive reply did not enter bubble mode: ${JSON.stringify(proactiveBubble)}`);
  assert.equal(proactiveBubble.panelHidden, true, `proactive reply unexpectedly opened the full panel: ${JSON.stringify(proactiveBubble)}`);
  assert.equal(proactiveBubble.text, '这段像把星光折进了低频里，你觉得它更像在漂浮，还是在靠近？');
  assert.equal(proactiveBubble.display, 'block');
  assert.match(proactiveBubble.backgroundColor,
    /^rgba\(255, 255, 255, 0\.(?:0[8-9]|[12]\d|3[0-5])\)$/,
    `proactive reply is not a restrained translucent white bubble: ${JSON.stringify(proactiveBubble)}`);
  assert.equal(proactiveBubble.borderWidth, '1px');
  assert.match(proactiveBubble.borderColor,
    /rgba\(255, 255, 255, 0\.(?:[3-6]\d|7[0-5])\)/,
    `proactive reply lost its visible white-glass edge: ${JSON.stringify(proactiveBubble)}`);
  const proactiveCapture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(artifactRoot, 'pet-particle-orb-proactive.png'), Buffer.from(proactiveCapture.data, 'base64'));
  await evaluate(`(() => { window.FeMonsterPetAssistant.open(); window.FeMonsterPetAssistant.close(); })()`);

  const styles = await evaluate(`(() => {
    const character = getComputedStyle(document.getElementById('petAssistantCharacter'));
    const panel = getComputedStyle(document.getElementById('petAssistantPanel'));
    return {
      appearance: character.appearance,
      backgroundColor: character.backgroundColor,
      backgroundImage: character.backgroundImage,
      borderWidth: character.borderTopWidth,
      boxShadow: character.boxShadow,
      backdropFilter: character.backdropFilter || character.webkitBackdropFilter,
      filter: character.filter,
      panelDisplay: panel.display
    };
  })()`);
  assert.equal(styles.appearance, 'none');
  assert.equal(styles.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.equal(styles.backgroundImage, 'none');
  assert.equal(styles.borderWidth, '0px');
  assert.equal(styles.boxShadow, 'none');
  assert.equal(styles.backdropFilter, 'none');
  assert.match(styles.filter, /drop-shadow/);
  assert.equal(styles.panelDisplay, 'none');
  const particleSurface = await evaluate(`(() => {
    const legacy = document.querySelector('.pet-assistant__vector');
    const canvas = document.getElementById('petAssistantParticleOrb');
    const box = canvas.getBoundingClientRect();
    return {
      legacyDisplay: legacy ? getComputedStyle(legacy).display : 'missing',
      canvasDisplay: getComputedStyle(canvas).display,
      width: box.width,
      height: box.height
    };
  })()`);
  assert.equal(particleSurface.legacyDisplay, 'none', `legacy dragon painted behind the particle orb: ${JSON.stringify(particleSurface)}`);
  assert.equal(particleSurface.canvasDisplay, 'block');
  assert.ok(particleSurface.width >= 160 && particleSurface.height >= 180,
    `particle canvas does not fill the mascot hit target: ${JSON.stringify(particleSurface)}`);

  await command('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 660,
    deviceScaleFactor: 1,
    mobile: false
  });
  await evaluate(`(() => {
    document.documentElement.setAttribute('data-fe-client', 'desktop-pet');
    window.FeMonsterPetAssistant.setDesktopMode(true);
    const character = document.getElementById('petAssistantCharacter');
    character.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    character.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
  })()`);
  await delay(360);
  const desktopPanelLayout = await evaluate(`(() => {
    const rect = (id) => {
      const value = document.getElementById(id).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
        width: value.width, height: value.height };
    };
    const panel = rect('petAssistantPanel');
    const input = rect('petAssistantInput');
    const send = rect('petAssistantSend');
    const style = (node) => {
      const value = getComputedStyle(node);
      return { transform: value.transform, zoom: value.zoom, position: value.position,
        width: value.width, height: value.height, maxWidth: value.maxWidth, maxHeight: value.maxHeight };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      html: style(document.documentElement),
      body: style(document.body),
      assistant: style(document.getElementById('petAssistant')),
      panelStyle: style(document.getElementById('petAssistantPanel')),
      composerStyle: style(document.getElementById('petAssistantForm')),
      material: (() => {
        const panelStyle = getComputedStyle(document.getElementById('petAssistantPanel'));
        const message = document.querySelector('.pet-assistant__message p');
        const messageStyle = message ? getComputedStyle(message) : null;
        return {
          panelBackground: panelStyle.backgroundColor,
          panelBackgroundImage: panelStyle.backgroundImage,
          panelBackdropFilter: panelStyle.backdropFilter || panelStyle.webkitBackdropFilter,
          panelBoxShadow: panelStyle.boxShadow,
          panelBorder: panelStyle.borderTopColor,
          messageBackground: messageStyle?.backgroundColor || '',
          messageBorder: messageStyle?.borderTopColor || '',
          sendBackground: getComputedStyle(document.getElementById('petAssistantSend')).backgroundColor
        };
      })(),
      compact: document.getElementById('petAssistantPanel').hasAttribute('data-pet-text-bubble'),
      retiredControls: [
        'petAssistantTitle', 'petAssistantStatus', 'petAssistantClear', 'petAssistantClose',
        'petAssistantPrivacy', 'petAssistantVoice', 'petAssistantMute', 'petAssistantCollapse',
        'petAssistantHide', 'petAssistantDesktopMain'
      ].filter((id) => document.getElementById(id)),
      live: window.FeMonsterPetAssistant.liveConversationActive,
      panel, input, send
    };
  })()`);
  assert.equal(desktopPanelLayout.compact, true,
    `desktop text composer lost its compact-bubble marker: ${JSON.stringify(desktopPanelLayout)}`);
  assert.deepEqual(desktopPanelLayout.retiredControls, [],
    `retired full-panel controls reappeared in the desktop pet: ${JSON.stringify(desktopPanelLayout)}`);
  assert.equal(desktopPanelLayout.live, false,
    `the double-click sequence leaked its pending single-click into live mode: ${JSON.stringify(desktopPanelLayout)}`);
  assert.ok(desktopPanelLayout.panel.left >= 0
      && desktopPanelLayout.panel.top >= 0
      && desktopPanelLayout.panel.right <= desktopPanelLayout.viewport.width
      && desktopPanelLayout.panel.bottom <= desktopPanelLayout.viewport.height
      && desktopPanelLayout.panel.width >= 250 && desktopPanelLayout.panel.width <= 340
      && desktopPanelLayout.panel.height >= 72 && desktopPanelLayout.panel.height <= 360,
    `compact desktop text bubble escaped its native viewport: ${JSON.stringify(desktopPanelLayout)}`);
  assert.ok(desktopPanelLayout.input.width >= 150,
    `desktop pet message input was squeezed behind its buttons: ${JSON.stringify(desktopPanelLayout)}`);
  assert.ok(desktopPanelLayout.input.right + 6 <= desktopPanelLayout.send.left,
    `desktop pet composer controls overlap: ${JSON.stringify(desktopPanelLayout)}`);
  assert.match(desktopPanelLayout.material.panelBackground,
    /^rgba\(255, 255, 255, 0\.(?:0[8-9]|1\d|20)\)$/,
    `desktop text bubble is not a translucent white surface: ${JSON.stringify(desktopPanelLayout.material)}`);
  assert.match(desktopPanelLayout.material.panelBackdropFilter, /blur\(/,
    `desktop text bubble lost its frosted-glass blur: ${JSON.stringify(desktopPanelLayout.material)}`);
  assert.notEqual(desktopPanelLayout.material.panelBorder, 'rgba(0, 0, 0, 0)',
    `desktop text bubble lost its visible glass edge: ${JSON.stringify(desktopPanelLayout.material)}`);
  const desktopPanelCapture = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(artifactRoot, 'pet-particle-orb-desktop-panel.png'), Buffer.from(desktopPanelCapture.data, 'base64'));
  const nativeTextBubbleOpen = await evaluate(`window.__petFixtureNativeMessages.filter((message) => message.action === 'panel').at(-1)`);
  assert.equal(nativeTextBubbleOpen?.open, true,
    `native desktop did not receive the open text-bubble surface: ${JSON.stringify(nativeTextBubbleOpen)}`);
  assert.equal(nativeTextBubbleOpen?.surface, 'text-bubble');
  assert.ok(nativeTextBubbleOpen?.bounds?.width > 0 && nativeTextBubbleOpen?.bounds?.height > 0,
    `native desktop received invalid compact-bubble geometry: ${JSON.stringify(nativeTextBubbleOpen)}`);
  await evaluate(`document.getElementById('petAssistantCharacter').dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, detail: 2 }))`);
  await delay(80);
  assert.equal(await evaluate(`document.getElementById('petAssistantPanel').hidden`), true,
    'second character double-click did not retract the text bubble');
  const nativeTextBubbleClosed = await evaluate(`window.__petFixtureNativeMessages.filter((message) => message.action === 'panel').at(-1)`);
  assert.equal(nativeTextBubbleClosed?.open, false,
    `native desktop retained the text-bubble hit region after close: ${JSON.stringify(nativeTextBubbleClosed)}`);
  await evaluate(`(() => {
    const root = document.getElementById('petAssistant');
    document.getElementById('petAssistantSpeech').textContent = '临时伙伴消息';
    root.dataset.petAside = 'true';
  })()`);
  await delay(80);
  const nativeBubbleVisible = await evaluate(`window.__petFixtureNativeMessages.filter((message) => message.action === 'bubble').at(-1)`);
  assert.equal(nativeBubbleVisible?.visible, true,
    `desktop companion aside did not expand the native speech region: ${JSON.stringify(nativeBubbleVisible)}`);
  assert.ok(nativeBubbleVisible?.bounds?.width > 0 && nativeBubbleVisible?.bounds?.height > 0,
    `desktop companion aside reported invalid geometry: ${JSON.stringify(nativeBubbleVisible)}`);
  await evaluate(`document.getElementById('petAssistant').dataset.petAside = 'false'`);
  await delay(80);
  const nativeBubbleHidden = await evaluate(`window.__petFixtureNativeMessages.filter((message) => message.action === 'bubble').at(-1)`);
  assert.equal(nativeBubbleHidden?.visible, false,
    `hidden companion aside left its native speech region enabled: ${JSON.stringify(nativeBubbleHidden)}`);
  await evaluate(`(() => {
    window.FeMonsterPetAssistant.setDesktopMode(false);
    document.documentElement.setAttribute('data-fe-client', 'embedded');
  })()`);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  await evaluate(`window.FeMonsterPetAssistant.send('reconnect test')`, true);
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete',
    historical: true,
    payload: {
      sessionId: 'session-qa',
      requestId: 'request-qa',
      sequence: 4,
      text: 'recovered complete answer'
    }
  }}))`);
  await delay(80);
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete', historical: true,
    payload: { sessionId: 'session-qa', requestId: 'request-qa', sequence: 5, text: 'recovered complete answer' }
  }}))`);
  await delay(180);
  const replay = await evaluate(`(() => ({
    matches: Array.from(document.querySelectorAll('#petAssistantMessages p'))
      .filter((node) => node.textContent === 'recovered complete answer').length,
    pending: document.querySelectorAll('#petAssistantMessages .is-pending').length
  }))()`);
  assert.deepEqual(replay, { matches: 1, pending: 0 });

  await evaluate(`(() => {
    window.__petFixtureSessionState = 'thinking';
    window.__petFixtureHistory = [
      { role: 'user', content: 'history user' },
      { role: 'assistant', content: 'history answer' },
      { role: 'tool', content: '{"private":"tool receipt"}' },
      { role: 'assistant', content: null, toolCalls: [{ id: 'tool-call' }] }
    ];
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(260);
  const recovery = await evaluate(`(() => ({
    state: document.getElementById('petAssistant').dataset.state,
    messages: Array.from(document.querySelectorAll('#petAssistantMessages p')).map((node) => node.textContent),
    persistedMessages: (JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').messages || [])
      .map(({ role, text }) => ({ role, text }))
  }))()`);
  assert.equal(recovery.state, 'thinking', 'active session state did not override pet configuration state');
  assert.deepEqual(recovery.messages, ['history answer'],
    'compact reply bubble must render only the latest assistant response');
  assert.deepEqual(recovery.persistedMessages, [
    { role: 'user', text: 'history user' },
    { role: 'assistant', text: 'history answer' }
  ], 'compact rendering must not discard the persisted conversation history');

  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.error',
    payload: {
      sessionId: 'session-qa',
      requestId: 'request-model-error',
      sequence: 1,
      error: 'DeepSeek request failed without a transport status'
    }
  }}))`);
  await delay(40);
  const modelFailureState = await evaluate(`document.getElementById('petAssistant').dataset.state`);
  assert.equal(modelFailureState, 'error', 'an online model failure was misclassified as a server outage');

  await evaluate(`(() => {
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-state', {
      detail: { state: 'connected', activityAt: Date.now() }
    }));
    window.__petFixtureStatusFailures = 1;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(260);
  const transientRefresh = await evaluate(`(() => ({
    state: document.getElementById('petAssistant').dataset.state,
    calls: window.__petFixtureStatusCalls
  }))()`);
  assert.notEqual(transientRefresh.state, 'offline', 'one failed status refresh over a live event stream caused a false outage');

  await evaluate(`document.getElementById('petAssistantCharacter').click()`);
  await delay(160);
  const missingStt = await evaluate(`(() => ({
    state: document.getElementById('petAssistant').dataset.state,
    notice: document.getElementById('petAssistantInterim').textContent,
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    live: window.FeMonsterPetAssistant.liveConversationActive
  }))()`);
  assert.equal(missingStt.state, 'error');
  assert.match(missingStt.notice, /请在服务器配置 STT/);
  assert.equal(missingStt.microphoneStarts, 0, 'microphone started without browser or server STT');
  assert.equal(missingStt.live, false, 'failed STT setup left continuous conversation active');

  await evaluate(`(() => {
    window.__petFixtureSttProvider = 'sherpa-onnx';
    window.__petFixtureServerSttAvailable = true;
    window.__petFixtureMicrophoneReject = false;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(360);
  const offlineLive = await evaluate(`(() => {
    const microphoneStarts = window.__petFixtureMicrophoneStarts;
    window.dispatchEvent(new Event('offline'));
    document.getElementById('petAssistantCharacter').click();
    return {
      microphoneStarts,
      active: window.FeMonsterPetAssistant.liveConversationActive,
      pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
      state: document.getElementById('petAssistant').dataset.state
    };
  })()`);
  await delay(220);
  offlineLive.microphoneStartsAfter = await evaluate(`window.__petFixtureMicrophoneStarts`);
  assert.equal(offlineLive.active, false, 'offline event still allowed DeepSeek Live to become active');
  assert.equal(offlineLive.pressed, 'false', 'offline DeepSeek Live click left its toggle pressed');
  assert.equal(offlineLive.state, 'offline', 'offline DeepSeek Live click did not preserve the offline state');
  assert.equal(offlineLive.microphoneStartsAfter, offlineLive.microphoneStarts,
    'offline DeepSeek Live click started the microphone');
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'))`);
  await delay(260);
  await evaluate(`document.getElementById('petAssistantCharacter').dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1 }))`);
  await delay(280);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  const pcmReadiness = await evaluate(`(() => ({
    ready: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    state: document.getElementById('petAssistant').dataset.state,
    status: document.getElementById('petAssistantSpeech')?.textContent || '',
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    phase: document.getElementById('petAssistant').dataset.voicePhase,
    trigger: document.getElementById('petAssistant').dataset.voiceTrigger,
    mediaPatched: window.__petFixtureMediaPatched,
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    live: window.FeMonsterPetAssistant.liveConversationActive,
    panelHidden: document.getElementById('petAssistantPanel').hidden,
    speechHidden: document.getElementById('petAssistantSpeech').hidden
  }))()`);
  assert.equal(pcmReadiness.ready, true,
    `DeepSeek Live PCM processor did not become ready: ${JSON.stringify(pcmReadiness)}`);
  assert.equal(pcmReadiness.live, true, 'one click did not start continuous conversation');
  assert.equal(pcmReadiness.panelHidden, true,
    'single-click live conversation left the text input bubble visible');
  assert.equal(pcmReadiness.speechHidden, true,
    'single-click live conversation left a speech bubble visible');
  await evaluate(`(() => {
    for (let index = 0; index < 15; index += 1) window.__petFixturePushPcm(0.0005);
  })()`);
  await delay(80);
  const initialSilence = await evaluate(`(() => ({
    state: document.getElementById('petAssistant').dataset.state,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    uploads: window.__petFixtureVoiceUploads.length
  }))()`);
  assert.equal(initialSilence.state, 'listening', 'initial silence prematurely finalized the local voice turn');
  assert.equal(initialSilence.pressed, 'true');
  assert.equal(initialSilence.uploads, 0);
  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  await delay(320);
  const autoCommittedTurn = await evaluate(`(() => ({
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    uploads: window.__petFixtureVoiceUploads.length,
    label: document.getElementById('petAssistantCharacter').getAttribute('aria-label'),
    live: window.FeMonsterPetAssistant.liveConversationActive
  }))()`);
  assert.equal(autoCommittedTurn.pressed, 'true', 'continuous-conversation toggle lost its active state after VAD commit');
  assert.equal(autoCommittedTurn.uploads, 1, 'VAD silence did not upload exactly one final turn');
  assert.equal(autoCommittedTurn.live, true, 'submitting one turn stopped the continuous conversation');
  assert.match(autoCommittedTurn.label, /单击结束实时对话/,
    'active particle mascot did not expose its single-click stop action');
  const localStt = await evaluate(`(() => {
    const upload = window.__petFixtureVoiceUploads[0] || {};
    const waveBytes = upload.audioBase64 ? atob(upload.audioBase64) : '';
    const header = waveBytes.slice(0, 12);
    let firstSpeechSample = -1;
    for (let offset = 44; offset + 1 < waveBytes.length; offset += 2) {
      let sample = waveBytes.charCodeAt(offset) | (waveBytes.charCodeAt(offset + 1) << 8);
      if (sample >= 0x8000) sample -= 0x10000;
      if (Math.abs(sample / 0x8000) >= 0.05) {
        firstSpeechSample = (offset - 44) / 2;
        break;
      }
    }
    return {
      microphoneStarts: window.__petFixtureMicrophoneStarts,
      uploads: window.__petFixtureVoiceUploads.length,
      mimeType: upload.mimeType,
      final: upload.final,
      sampleRate: upload.sampleRate,
      channels: upload.channels,
      riff: header.slice(0, 4),
      wave: header.slice(8, 12),
      captureMode: document.getElementById('petAssistant').dataset.voiceCapture,
      firstSpeechMs: firstSpeechSample < 0 ? -1 : firstSpeechSample / 16,
      pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
      audioContextCloseCount: window.__petFixturePcmAudioContextCloseCount
    };
  })()`);
  assert.equal(localStt.microphoneStarts, 1, 'local sherpa-onnx STT did not allow microphone startup');
  assert.equal(localStt.uploads, 1, 'local STT must upload exactly one final recording');
  assert.equal(localStt.mimeType, 'audio/wav');
  assert.equal(localStt.final, true);
  assert.equal(localStt.sampleRate, 16000);
  assert.equal(localStt.channels, 1);
  assert.equal(localStt.riff, 'RIFF', 'local STT upload is not a WAV container');
  assert.equal(localStt.wave, 'WAVE', 'local STT upload is not a WAV container');
  assert.equal(localStt.captureMode, 'script-processor',
    'older WebView2 fallback did not expose the ScriptProcessor capture mode');
  assert.ok(localStt.firstSpeechMs >= 260 && localStt.firstSpeechMs <= 340,
    `local STT pre-roll lost or over-trimmed the sentence start: ${localStt.firstSpeechMs} ms`);
  assert.equal(localStt.pressed, 'true');
  assert.equal(localStt.audioContextCloseCount, 1, 'PCM AudioContext was not released after finalization');
  assert.equal(await evaluate(`window.FeMonsterPetEmotionRuntime.snapshot().sevenEmotions.primary`), 'fear',
    'the final server voice transcript ACK did not replace the prior text emotion');
  assert.equal(await evaluate(`document.getElementById('petAssistant').dataset.petEmotion`), 'fear',
    'the final voice-transcript emotion did not reach the particle dataset');

  const liveDeltaVisibleBeforeAudio = await evaluate(`(() => {
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.delta', payload: {
        sessionId: 'session-qa', requestId: 'request-live-one', sequence: 1,
        delta: 'live-audio-must-lead-this-text'
      }
    }}));
    return [...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('live-audio-must-lead-this-text'));
  })()`);
  assert.equal(liveDeltaVisibleBeforeAudio, false,
    'a live reply delta became visible before its first audio segment arrived');
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-live-one', sequence: 2,
      audioSequence: 0, audioId: 'audio-live-delta-first', kind: 'content', final: false
    });
  })()`);
  await delay(60);
  assert.equal(
    await evaluate(`[...document.querySelectorAll('.pet-assistant__message.is-assistant p')]
      .some((node) => node.textContent.includes('live-audio-must-lead-this-text'))`),
    true,
    'the first audible live segment did not release its buffered text'
  );
  await evaluate(`(() => {
    const emit = (type, payload) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', {
      detail: { type, payload }
    }));
    emit('pet.ai.audio', {
      sessionId: 'session-qa', requestId: 'request-live-one', sequence: 3,
      audioSequence: 1, audioId: '', kind: 'content', final: true
    });
    emit('pet.ai.complete', {
      sessionId: 'session-qa', requestId: 'request-live-one', sequence: 4,
      text: 'continuous reply completed', audioId: '', audioSegments: 1, audioStreamFinal: true
    });
    const audio = document.getElementById('petAssistantAudio');
    window.__petFixtureReplyAudioPlaying = false;
    window.__petFixtureReplyAudioEnded = true;
    audio.dispatchEvent(new Event('ended'));
  })()`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  const resumedListening = await evaluate(`(() => ({
    ready: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    microphoneStops: window.__petFixtureMicrophoneTrackStops,
    live: window.FeMonsterPetAssistant.liveConversationActive,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed')
  }))()`);
  assert.equal(resumedListening.ready, true, 'DeepSeek completion did not automatically resume listening');
  assert.equal(resumedListening.microphoneStarts, 1,
    'one DeepSeek Live session requested a second microphone stream between turns');
  assert.equal(resumedListening.microphoneStops, 0,
    'one DeepSeek Live session stopped its reusable microphone track between turns');
  assert.equal(resumedListening.live, true);
  assert.equal(resumedListening.pressed, 'true');

  await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }];
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.audio', payload: {
        sessionId: 'session-qa', requestId: 'request-loading-barge-in', sequence: 1,
        audioSequence: 0, audioId: 'audio-loading-barge-in', kind: 'content', final: false
      }
    }}));
  })()`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(`window.__petFixtureReplyAudioDeferred.length >= 1`)) break;
    await delay(20);
  }
  assert.equal(await evaluate(`window.__petFixtureReplyAudioDeferred.length`), 1,
    'loading-phase barge-in fixture did not reach the pending playback boundary');
  await evaluate(`(() => {
    window.__petFixturePushPcm(0.12);
    window.__petFixturePushPcm(0.12);
    window.__petFixturePushPcm(0.12);
  })()`);
  await delay(120);
  const afterLoadingBargeIn = await evaluate(`(() => ({
    source: document.getElementById('petAssistantAudio').getAttribute('src'),
    playing: window.__petFixtureReplyAudioPlaying,
    microphoneReady: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    live: window.FeMonsterPetAssistant.liveConversationActive,
    state: document.getElementById('petAssistant').dataset.state
  }))()`);
  assert.equal(afterLoadingBargeIn.source, null,
    `barge-in left a loading reply attached to the shared audio element: ${JSON.stringify(afterLoadingBargeIn)}`);
  assert.equal(afterLoadingBargeIn.playing, false);
  assert.equal(afterLoadingBargeIn.microphoneReady, true,
    'loading-phase barge-in stopped the active microphone turn');
  assert.equal(afterLoadingBargeIn.live, true);
  assert.equal(afterLoadingBargeIn.state, 'listening');
  await evaluate(`window.__petFixtureReplyAudioDeferred[0]?.reject('AbortError')`);
  await delay(20);

  await evaluate(`document.getElementById('petAssistantCharacter').click()`);
  await delay(120);
  const stoppedLive = await evaluate(`(() => ({
    live: window.FeMonsterPetAssistant.liveConversationActive,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    uploads: window.__petFixtureVoiceUploads.length,
    microphoneStops: window.__petFixtureMicrophoneTrackStops
  }))()`);
  assert.deepEqual(stoppedLive, { live: false, pressed: 'false', uploads: 1, microphoneStops: 1 },
    'second click did not stop continuous conversation without sending an empty turn');

  await evaluate(`document.getElementById('petAssistantCharacter').click()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureVoiceUploads.length >= 2`)) break;
    await delay(40);
  }
  assert.equal(await evaluate(`window.__petFixtureVoiceUploads.length`), 2,
    'rapid restart fixture did not commit its pending live turn');
  const rapidRestartBaseline = await evaluate(`(() => {
    const voice = document.getElementById('petAssistantCharacter');
    voice.click();
    voice.click();
    return {
      audioCalls: window.__petFixtureReplyAudioCalls.length,
      microphoneStarts: window.__petFixtureMicrophoneStarts
    };
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  const restartedMicrophoneStarts = await evaluate(`window.__petFixtureMicrophoneStarts`);
  assert.ok(restartedMicrophoneStarts >= rapidRestartBaseline.microphoneStarts + 1,
    'rapid stop then restart did not open a fresh listening turn');
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete', payload: {
      sessionId: 'session-qa', requestId: 'request-live-two', sequence: 1,
      text: 'cancelled old live reply', audioId: 'audio-cancelled-old'
    }
  }}))`);
  await delay(260);
  const afterCancelledReply = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    state: document.getElementById('petAssistant').dataset.state,
    microphoneReady: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    audioCalls: window.__petFixtureReplyAudioCalls.length
  }))()`);
  assert.equal(afterCancelledReply.active, true, 'a late cancelled completion stopped the restarted live conversation');
  assert.equal(afterCancelledReply.pressed, 'true');
  assert.equal(afterCancelledReply.state, 'listening', 'a late cancelled completion overwrote the restarted listening state');
  assert.equal(afterCancelledReply.microphoneReady, true, 'a late cancelled completion released the restarted microphone');
  assert.equal(afterCancelledReply.microphoneStarts, restartedMicrophoneStarts,
    'a late cancelled completion created an extra microphone turn');
  assert.equal(afterCancelledReply.audioCalls, rapidRestartBaseline.audioCalls,
    'a late cancelled completion played speech after the user stopped that turn');

  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureVoiceUploads.length >= 3`)) break;
    await delay(40);
  }
  assert.equal(await evaluate(`window.__petFixtureVoiceUploads.length`), 3,
    'overlapping TTS fixture did not commit its live turn');
  const ttsMicrophoneBaseline = await evaluate(`(() => {
    window.__petFixtureReplyAudioCalls.length = 0;
    window.__petFixtureReplyAudioDeferred.length = 0;
    window.__petFixtureReplyAudioPlans = [{ type: 'defer' }, { type: 'resolve' }];
    const complete = (requestId, audioId) => window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.complete', payload: {
        sessionId: 'session-qa', requestId, sequence: 1, text: requestId, audioId
      }
    }}));
    complete('request-live-three', 'audio-live-current');
    complete('request-overlap-new', 'audio-overlap-new');
    return window.__petFixtureMicrophoneStarts;
  })()`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(`window.__petFixtureReplyAudioDeferred.length >= 1`)) break;
    await delay(20);
  }
  assert.equal(await evaluate(`window.__petFixtureReplyAudioDeferred.length`), 1,
    'overlapping TTS fixture did not retain the superseded play promise');
  await evaluate(`window.__petFixtureReplyAudioDeferred[0].reject('AbortError')`);
  await delay(700);
  const whileReplyIsPlaying = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    state: document.getElementById('petAssistant').dataset.state,
    microphoneReady: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    audioPlaying: window.__petFixtureReplyAudioPlaying,
    audioSrc: document.getElementById('petAssistantAudio').getAttribute('src'),
    audioCalls: window.__petFixtureReplyAudioCalls.length
  }))()`);
  assert.equal(whileReplyIsPlaying.active, true);
  assert.equal(whileReplyIsPlaying.state, 'listening');
  assert.equal(whileReplyIsPlaying.audioPlaying, true);
  assert.ok(whileReplyIsPlaying.audioSrc.includes('audio-overlap-new'));
  assert.equal(whileReplyIsPlaying.audioCalls, 2,
    'superseded TTS retried or replaced the current reply');
  assert.equal(whileReplyIsPlaying.microphoneStarts, ttsMicrophoneBaseline,
    'DeepSeek Live requested a new microphone stream while arming reply barge-in');
  assert.equal(whileReplyIsPlaying.microphoneReady, true,
    'the microphone processor was not ready for reply interruption');

  await evaluate(`(() => {
    window.__petFixturePushPcm(0.12);
    window.__petFixturePushPcm(0.12);
    window.__petFixturePushPcm(0.12);
  })()`);
  await delay(120);
  const afterBargeIn = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    microphoneReady: Boolean(window.__petFixturePcmProcessor?.onaudioprocess),
    microphoneStarts: window.__petFixtureMicrophoneStarts,
    audioPlaying: window.__petFixtureReplyAudioPlaying,
    audioSrc: document.getElementById('petAssistantAudio').getAttribute('src'),
    state: document.getElementById('petAssistant').dataset.state
  }))()`);
  assert.equal(afterBargeIn.active, true);
  assert.equal(afterBargeIn.microphoneReady, true, 'barge-in stopped the active microphone turn');
  assert.equal(afterBargeIn.microphoneStarts, ttsMicrophoneBaseline,
    'barge-in created a duplicate microphone turn');
  assert.equal(afterBargeIn.audioPlaying, false, 'confirmed user speech did not stop reply audio');
  assert.equal(afterBargeIn.audioSrc, null, 'interrupted reply audio source was not released');
  assert.equal(afterBargeIn.state, 'listening');
  await evaluate(`(() => {
    document.getElementById('petAssistantCharacter').click();
    window.__petFixtureVoiceUploads.splice(1);
  })()`);
  await delay(120);

  await evaluate(`(() => {
    const toggle = document.getElementById('petAssistantVoicePlaybackToggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return window.FeMonsterPetAssistant.send('muted reply test');
  })()`, true);
  const mutedRequest = await evaluate(`(() => {
    const request = window.__petFixtureChatRequests.at(-1) || {};
    const stored = JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}');
    return {
      voice: request.voice,
      replyWithVoice: request.replyWithVoice,
      voiceReply: request.voiceReply,
      storedMuted: stored.muted,
      playbackEnabled: window.FeMonsterPetAssistant.voicePlaybackEnabled
    };
  })()`);
  assert.deepEqual(mutedRequest, {
    voice: false,
    replyWithVoice: false,
    voiceReply: false,
    storedMuted: true,
    playbackEnabled: false
  });
  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.complete', payload: {
      sessionId: 'session-qa', requestId: 'request-qa', sequence: 20,
      text: 'muted audio response', audioId: 'audio1234'
    }
  }}))`);
  await delay(80);
  assert.equal(await evaluate(`document.getElementById('petAssistantAudio').getAttribute('src')`), null,
    'muted pet still attached server TTS audio');

  await evaluate(`(() => {
    document.getElementById('petAssistantShortcutCapture').click();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'KeyV', key: 'v'
    }));
  })()`);
  const shortcutSaved = await evaluate(`(() => ({
    label: document.getElementById('petAssistantShortcutValue').textContent,
    shortcut: window.FeMonsterPetAssistant.liveConversationShortcut,
    stored: JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').liveConversationShortcut
  }))()`);
  assert.equal(shortcutSaved.shortcut.code, 'KeyV');
  assert.equal(shortcutSaved.stored.code, 'KeyV');
  assert.match(shortcutSaved.label, /V/);

  const microphoneBeforeEditable = await evaluate(`window.__petFixtureMicrophoneStarts`);
  const editableHotkey = await evaluate(`(() => {
    const input = document.getElementById('petAssistantInput');
    input.value = 'keep:';
    input.focus();
    const dispatch = (event) => ({ allowed: input.dispatchEvent(event), prevented: event.defaultPrevented });
    const keydown = dispatch(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, code: 'KeyV', key: 'v'
    }));
    const keypress = dispatch(new KeyboardEvent('keypress', {
      bubbles: true, cancelable: true, code: 'KeyV', key: 'v'
    }));
    const beforeinput = dispatch(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: 'v'
    }));
    if (beforeinput.allowed) input.value += 'v';
    const inputEvent = dispatch(new InputEvent('input', {
      bubbles: true, inputType: 'insertText', data: 'v'
    }));
    return { value: input.value, keydown, keypress, beforeinput, inputEvent };
  })()`);
  await delay(220);
  assert.equal(await evaluate(`window.__petFixtureMicrophoneStarts`), microphoneBeforeEditable + 1,
    'bound live-conversation shortcut did not start while the message input was focused');
  assert.equal(editableHotkey.value, 'keep:', 'bound live-conversation shortcut leaked into the message input');
  for (const phase of ['keydown', 'keypress', 'beforeinput']) {
    assert.equal(editableHotkey[phase].prevented, true, `${phase} did not suppress the bound shortcut character`);
  }
  await evaluate(`document.getElementById('petAssistantInput').dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true, cancelable: true, code: 'KeyV', key: 'v'
  }))`);
  await delay(220);
  const liveAfterKeyup = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    uploads: window.__petFixtureVoiceUploads.length,
    microphoneStarts: window.__petFixtureMicrophoneStarts
  }))()`);
  assert.deepEqual(liveAfterKeyup, {
    active: true,
    uploads: 1,
    microphoneStarts: microphoneBeforeEditable + 1
  }, 'releasing the shortcut key stopped or sent the continuous conversation');

  await evaluate(`document.getElementById('petAssistantInput').dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, code: 'KeyV', key: 'v'
  }))`);
  await delay(140);
  assert.equal(await evaluate(`window.FeMonsterPetAssistant.liveConversationActive`), false,
    'second shortcut keydown did not stop continuous conversation');

  const ordinaryEditableKey = await evaluate(`(() => {
    const input = document.getElementById('petAssistantInput');
    const before = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: 'x'
    });
    const allowed = input.dispatchEvent(before);
    if (allowed) input.value += 'x';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
    return { value: input.value, prevented: before.defaultPrevented };
  })()`);
  assert.equal(ordinaryEditableKey.prevented, false, 'a non-bound key was blocked in the message input');
  assert.equal(ordinaryEditableKey.value, 'keep:x', 'ordinary message input no longer works');

  await evaluate(`(() => {
    document.getElementById('petAssistantInput').blur();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'KeyV', key: 'v'
    }));
  })()`);
  await delay(220);
  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  await delay(320);
  const shortcutTurn = await evaluate(`(() => ({
    uploads: window.__petFixtureVoiceUploads.length,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed'),
    active: window.FeMonsterPetAssistant.liveConversationActive,
    replyWithVoice: window.__petFixtureVoiceUploads.at(-1)?.replyWithVoice,
    voiceReply: window.__petFixtureVoiceUploads.at(-1)?.voiceReply
  }))()`);
  assert.equal(shortcutTurn.uploads, 2, 'saved live-conversation shortcut did not submit a VAD-completed turn');
  assert.equal(shortcutTurn.pressed, 'true');
  assert.equal(shortcutTurn.active, true, 'one shortcut-driven turn stopped the continuous conversation');
  assert.equal(shortcutTurn.replyWithVoice, false);
  assert.equal(shortcutTurn.voiceReply, false);

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true, code: 'KeyV', key: 'v'
  }))`);
  await delay(140);
  const shortcutStopped = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    uploads: window.__petFixtureVoiceUploads.length,
    pressed: document.getElementById('petAssistantCharacter').getAttribute('aria-pressed')
  }))()`);
  assert.deepEqual(shortcutStopped, { active: false, uploads: 2, pressed: 'false' },
    'second shortcut keydown did not stop without uploading an empty turn');

  await evaluate(`(() => {
    window.__petFixtureClaims.length = 0;
    window.__petFixtureActionResults.length = 0;
    window.__petFixtureExecutions.length = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.tool', payload: {
        sessionId: 'session-qa', actionId: 'action-confirm', sequence: 30,
        targetComputerId: 'computer-qa', name: 'execute_app_command',
        arguments: { command: 'community.market.work.publish', arguments: { title: 'fixture work' } }
      }
    }}));
  })()`);
  await delay(160);
  const directAction = await evaluate(`(() => ({
    visible: !document.getElementById('petAssistantConfirmation').hidden,
    executions: window.__petFixtureExecutions.length,
    claims: window.__petFixtureClaims.length,
    results: window.__petFixtureActionResults.length,
    execution: window.__petFixtureExecutions.at(-1)
  }))()`);
  assert.equal(directAction.visible, false, 'clear community publish command prompted for confirmation');
  assert.equal(directAction.executions, 1, 'clear community publish command did not execute immediately');
  assert.equal(directAction.claims, 1, 'clear community publish command was not claimed immediately');
  assert.equal(directAction.results, 1, 'clear community publish result was not reported');
  assert.equal(directAction.execution.context.confirmed, false,
    'clear community publish command was incorrectly marked as user-confirmed');

  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
    type: 'pet.ai.tool', payload: {
      sessionId: 'session-qa', actionId: 'action-cancel', sequence: 31,
      targetComputerId: 'computer-qa', name: 'execute_app_command',
        arguments: { command: 'fixture.high-impact', arguments: {} }
    }
  }}))`);
  await delay(120);
  const cancellationPending = await evaluate(`(() => ({
    visible: !document.getElementById('petAssistantConfirmation').hidden,
    inspection: window.__petFixtureInspections.at(-1),
    claims: window.__petFixtureClaims.length
  }))()`);
  assert.equal(cancellationPending.visible, true,
    `fixture high-impact action did not request confirmation: ${JSON.stringify(cancellationPending)}`);
  await evaluate(`document.getElementById('petAssistantConfirmationCancel').click()`);
  await delay(160);
  const cancelledAction = await evaluate(`(() => ({
    claim: window.__petFixtureClaims.at(-1),
    executions: window.__petFixtureExecutions.length,
    results: window.__petFixtureActionResults.length
  }))()`);
  assert.equal(cancelledAction.claim.cancelled, true, 'cancelled action claim did not carry cancelled=true');
  assert.equal(cancelledAction.executions, 1, 'cancelled action reached the command bridge');
  assert.equal(cancelledAction.results, 1, 'cancelled action emitted an execution result');

  await evaluate(`(() => {
    window.__petFixtureClaims.length = 0;
    window.__petFixtureInspections.length = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.tool', payload: {
        sessionId: 'session-qa', actionId: 'action-web-tainted', sequence: 32,
        targetComputerId: 'computer-qa', name: 'execute_app_command',
        requiresConfirmation: false, readOnly: true,
        taintedByExternalContent: true, sourceTrust: 'untrusted-external-web',
        arguments: { command: 'fixture.external.mutation', arguments: {} }
      }
    }}));
  })()`);
  await delay(140);
  const taintedPending = await evaluate(`(() => ({
    visible: !document.getElementById('petAssistantConfirmation').hidden,
    claims: window.__petFixtureClaims.length,
    inspection: window.__petFixtureInspections.at(-1)
  }))()`);
  assert.equal(taintedPending.visible, true, 'external-web-tainted mutation bypassed local confirmation');
  assert.equal(taintedPending.claims, 0, 'tainted mutation was claimed before confirmation');
  assert.equal(taintedPending.inspection.context.taintedByExternalContent, true,
    'external-content provenance did not reach bridge.inspect');
  assert.equal(taintedPending.inspection.context.sourceTrust, 'untrusted-external-web');
  await evaluate(`document.getElementById('petAssistantConfirmationConfirm').click()`);
  await delay(160);
  const taintedExecution = await evaluate(`window.__petFixtureExecutions.at(-1)`);
  assert.equal(taintedExecution.context.confirmed, true);
  assert.equal(taintedExecution.context.taintedByExternalContent, true,
    'external-content provenance did not reach bridge.execute');
  assert.equal(taintedExecution.context.sourceTrust, 'untrusted-external-web');

  await evaluate(`(() => {
    window.__petFixtureClaims.length = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-event', { detail: {
      type: 'pet.ai.tool', payload: {
        sessionId: 'session-qa', actionId: 'action-hide-cancel', sequence: 33,
        targetComputerId: 'computer-qa', name: 'execute_app_command',
        arguments: { command: 'fixture.high-impact', arguments: {} }
      }
    }}));
  })()`);
  await delay(120);
  const hiddenMascot = await evaluate(`window.FeMonsterPetAssistant.setVisible(false).then(() => ({
    state: window.FeMonsterPetAssistant.visibility(),
    rootHidden: document.getElementById('petAssistant').hidden,
    restoreHidden: document.getElementById('petAssistantRestore').hidden,
    storedVisible: JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}').visible
  }))`, true);
  await delay(160);
  assert.deepEqual(hiddenMascot, {
    state: { visible: false, desktopMode: false, recoverable: true, recoveryEntry: 'page-restore-button' },
    rootHidden: true,
    restoreHidden: false,
    storedVisible: false
  });
  assert.equal((await evaluate(`window.__petFixtureClaims.at(-1)`)).cancelled, true,
    'hiding the mascot left an active confirmation unresolved');
  await evaluate(`document.getElementById('petAssistantRestore').click()`);
  await delay(80);
  assert.deepEqual(await evaluate(`(() => ({
    visible: window.FeMonsterPetAssistant.visibility().visible,
    rootHidden: document.getElementById('petAssistant').hidden,
    restoreHidden: document.getElementById('petAssistantRestore').hidden
  }))()`), { visible: true, rootHidden: false, restoreHidden: true });

  const queuedUploadBaseline = await evaluate(`(() => ({
    attempts: window.__petFixtureVoiceUploadAttempts.length,
    uploads: window.__petFixtureVoiceUploads.length,
    capturesClosed: window.__petFixturePcmAudioContextCloseCount
  }))()`);
  await evaluate(`(() => {
    window.__petFixtureVoiceBlobDeferred = true;
    window.__petFixtureVoiceBlobWaiters.length = 0;
    document.getElementById('petAssistantCharacter').click();
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureVoiceBlobWaiters.length === 1`)) break;
    await delay(40);
  }
  const queuedOldUpload = await evaluate(`(() => ({
    waiters: window.__petFixtureVoiceBlobWaiters.length,
    attempts: window.__petFixtureVoiceUploadAttempts.length,
    uploads: window.__petFixtureVoiceUploads.length,
    capturesClosed: window.__petFixturePcmAudioContextCloseCount,
    active: window.FeMonsterPetAssistant.liveConversationActive
  }))()`);
  assert.equal(queuedOldUpload.waiters, 1,
    'old-account voice upload did not pause before reaching fetch');
  assert.equal(queuedOldUpload.attempts, queuedUploadBaseline.attempts,
    'paused old-account voice upload reached the server too early');
  assert.equal(queuedOldUpload.uploads, queuedUploadBaseline.uploads,
    'paused old-account voice upload was recorded as sent too early');
  assert.equal(queuedOldUpload.capturesClosed, queuedUploadBaseline.capturesClosed + 1,
    'old-account voice turn did not finish recording before the identity switch');
  assert.equal(queuedOldUpload.active, true,
    'queued-upload fixture unexpectedly stopped DeepSeek Live');
  await evaluate(`(() => {
    window.__petFixtureProvider = 'qq';
    window.__petFixtureFeId = '22222222';
    window.__petFixtureVoiceBlobWaiters[0].release();
  })()`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(`window.__petFixtureVoiceBlobWaiters[0].resolved`)) break;
    await delay(20);
  }
  await delay(80);
  const uploadAfterAccountSwitch = await evaluate(`(() => ({
    attempts: window.__petFixtureVoiceUploadAttempts.length,
    uploads: window.__petFixtureVoiceUploads.length,
    active: window.FeMonsterPetAssistant.liveConversationActive
  }))()`);
  assert.equal(uploadAfterAccountSwitch.attempts, queuedUploadBaseline.attempts,
    'an old queued voice upload reached the server after the account switch');
  assert.equal(uploadAfterAccountSwitch.uploads, queuedUploadBaseline.uploads,
    'an old queued voice upload was sent under the new account');
  assert.equal(uploadAfterAccountSwitch.active, true,
    'identity revalidation was hidden by stopping DeepSeek Live');

  await evaluate(`(() => {
    window.__petFixtureProvider = 'qq';
    window.__petFixtureFeId = '22222222';
    window.__petFixtureStatusSessionIds = [];
    window.__petFixtureCreatedSessionId = 'session-new-account';
    window.__petFixtureSessionCreates = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(260);
  await evaluate(`window.FeMonsterPetAssistant.send('new account session test')`, true);
  await delay(120);
  const newAccountSession = await evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}');
    return {
      creates: window.__petFixtureSessionCreates,
      chat: window.__petFixtureChatRequests.at(-1),
      storedSessionId: stored.sessionId,
      state: document.getElementById('petAssistant').dataset.state
    };
  })()`);
  assert.equal(newAccountSession.creates, 1,
    'a newly logged-in music account reused the previous FE account pet session');
  assert.equal(newAccountSession.chat.provider, 'qq');
  assert.equal(newAccountSession.chat.sessionId, 'session-new-account');
  assert.equal(newAccountSession.storedSessionId, 'session-new-account');
  assert.notEqual(newAccountSession.state, 'error',
    'new music account was shown as unable to process after switching FE identity');

  await evaluate(`(() => {
    window.__petFixtureProvider = 'kugou';
    window.__petFixtureFeId = '33333333';
    window.__petFixtureStatusSessionIds = [];
    window.__petFixtureCreatedSessionId = 'session-status-race';
    window.__petFixtureSessionCreates = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(260);
  const statusRaceUploadBaseline = await evaluate(`window.__petFixtureVoiceUploadAttempts.length`);
  await evaluate(`(() => {
    window.__petFixtureSessionDeferredCount = 1;
    window.__petFixtureSessionDeferred.length = 0;
    window.__petFixtureStatusDeferred.length = 0;
    document.getElementById('petAssistantCharacter').click();
  })()`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`window.__petFixtureSessionDeferred.length === 1`)) break;
    await delay(40);
  }
  assert.equal(await evaluate(`window.__petFixtureSessionDeferred.length`), 1,
    'status/session race fixture did not pause session creation');
  await evaluate(`(() => {
    window.__petFixtureStatusDeferredCount = 1;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureStatusDeferred.length === 1`)) break;
    await delay(40);
  }
  assert.equal(await evaluate(`window.__petFixtureStatusDeferred.length`), 1,
    'status/session race fixture did not capture the stale status response');
  await evaluate(`window.__petFixtureSessionDeferred[0].resolve()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`)) break;
    await delay(40);
  }
  assert.equal(await evaluate(`Boolean(window.__petFixturePcmProcessor?.onaudioprocess)`), true,
    'new session did not finish opening its voice turn while status was pending');
  await evaluate(`window.__petFixtureStatusDeferred[0].resolve()`);
  await delay(100);
  await evaluate(`(() => {
    for (let index = 0; index < 3; index += 1) window.__petFixturePushPcm(0.12);
    for (let index = 0; index < 12; index += 1) {
      if (!window.__petFixturePcmProcessor?.onaudioprocess) break;
      window.__petFixturePushPcm(0.0005);
    }
  })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureVoiceUploadAttempts.length > ${statusRaceUploadBaseline}`)) break;
    await delay(40);
  }
  const statusSessionRace = await evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('fe-monster-pet-assistant-v1') || '{}');
    const attempt = window.__petFixtureVoiceUploadAttempts.at(-1) || {};
    return {
      attempts: window.__petFixtureVoiceUploadAttempts.length,
      sessionCreates: window.__petFixtureSessionCreates,
      storedSessionId: stored.sessionId,
      provider: attempt.provider || '',
      sessionId: attempt.body?.sessionId || '',
      requestId: attempt.body?.requestId || ''
    };
  })()`);
  assert.equal(statusSessionRace.attempts, statusRaceUploadBaseline + 1,
    'stale status response cancelled the newly created session voice upload');
  assert.equal(statusSessionRace.sessionCreates, 1);
  assert.equal(statusSessionRace.storedSessionId, 'session-status-race',
    'stale status response cleared the newly created session');
  assert.equal(statusSessionRace.provider, 'kugou');
  assert.equal(statusSessionRace.sessionId, 'session-status-race');
  assert.ok(statusSessionRace.requestId,
    'stale status response cleared the in-flight voice request ID');
  await evaluate(`document.getElementById('petAssistantCharacter').click()`);
  await delay(80);

  await evaluate(`(() => {
    window.__petFixtureProvider = 'qishui';
    window.__petFixtureFeId = '44444444';
    window.__petFixtureStatusSessionIds = [];
    window.__petFixtureCreatedSessionId = 'session-late-microphone';
    window.__petFixtureSessionFailures = 1;
    window.__petFixtureMicrophoneDeferred = true;
    window.__petFixtureMicrophoneRequests.length = 0;
    window.dispatchEvent(new CustomEvent('fe-monster-pet-stream-ready'));
  })()`);
  await delay(320);
  const lateMicrophoneBaseline = await evaluate(`(() => ({
    starts: window.__petFixtureMicrophoneStarts,
    stops: window.__petFixtureMicrophoneTrackStops
  }))()`);
  await evaluate(`document.getElementById('petAssistantCharacter').click()`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(`window.__petFixtureMicrophoneRequests.length === 1
      && window.__petFixtureSessionFailures === 0
      && !window.FeMonsterPetAssistant.liveConversationActive`)) break;
    await delay(40);
  }
  const failedSessionWithPendingMicrophone = await evaluate(`(() => ({
    requests: window.__petFixtureMicrophoneRequests.length,
    sessionFailures: window.__petFixtureSessionFailures,
    active: window.FeMonsterPetAssistant.liveConversationActive,
    starts: window.__petFixtureMicrophoneStarts,
    stops: window.__petFixtureMicrophoneTrackStops,
    phase: document.getElementById('petAssistant').dataset.voicePhase
  }))()`);
  assert.equal(failedSessionWithPendingMicrophone.requests, 1,
    'failed-session fixture did not leave one getUserMedia request pending');
  assert.equal(failedSessionWithPendingMicrophone.sessionFailures, 0,
    'DeepSeek Live did not reach the failing session request');
  assert.equal(failedSessionWithPendingMicrophone.active, false,
    'failed session creation left DeepSeek Live active');
  assert.equal(failedSessionWithPendingMicrophone.starts, lateMicrophoneBaseline.starts + 1,
    'failed-session race did not issue exactly one delayed getUserMedia request');
  assert.equal(failedSessionWithPendingMicrophone.stops, lateMicrophoneBaseline.stops,
    'unresolved microphone fixture was stopped before it returned a stream');
  await evaluate(`window.__petFixtureMicrophoneRequests[0].resolve()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`window.__petFixtureMicrophoneTrackStops > ${lateMicrophoneBaseline.stops}`)) break;
    await delay(40);
  }
  const lateMicrophone = await evaluate(`(() => ({
    active: window.FeMonsterPetAssistant.liveConversationActive,
    stops: window.__petFixtureMicrophoneTrackStops,
    microphoneReady: Boolean(window.__petFixturePcmProcessor?.onaudioprocess)
  }))()`);
  assert.equal(lateMicrophone.stops, lateMicrophoneBaseline.stops + 1,
    'a getUserMedia stream resolving after session failure did not stop its track');
  assert.equal(lateMicrophone.active, false,
    'late getUserMedia resolution restarted DeepSeek Live after session failure');
  assert.equal(lateMicrophone.microphoneReady, false,
    'late getUserMedia resolution created a PCM capture after session failure');

  const bootIdBeforeReload = await evaluate(`window.__petFixtureBootId || ''`);
  await command('Page.reload', { ignoreCache: true });
  await waitForPetReady('reloaded pet fixture', bootIdBeforeReload);
  const persistedAfterReload = await evaluate(`(() => ({
    playbackChecked: document.getElementById('petAssistantVoicePlaybackToggle').checked,
    playbackEnabled: window.FeMonsterPetAssistant.voicePlaybackEnabled,
    shortcutCode: window.FeMonsterPetAssistant.liveConversationShortcut?.code || '',
    voiceSettingsOpen: document.getElementById('petAssistantVoiceDisclosure')?.open === true,
    voiceSettingsExpanded: document.getElementById('petAssistantVoiceDisclosureSummary')?.getAttribute('aria-expanded')
  }))()`);
  assert.deepEqual(persistedAfterReload, {
    playbackChecked: false,
    playbackEnabled: false,
    shortcutCode: 'KeyV',
    voiceSettingsOpen: true,
    voiceSettingsExpanded: 'true'
  });

  process.stdout.write(`${JSON.stringify({
    ok: true, styles, replay, recovery, missingStt, localStt, resumedListening, stoppedLive,
    offlineLive, failedSessionWithPendingMicrophone, lateMicrophone,
    queuedOldUpload, uploadAfterAccountSwitch, statusSessionRace,
    streamedPlayback, afterCancelledReply, whileReplyIsPlaying, afterBargeIn,
    mutedRequest, shortcutSaved, shortcutTurn, shortcutStopped, directAction, newAccountSession,
    cancelledAction, hiddenMascot, persistedAfterReload
  }, null, 2)}\n`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ id: nextId++, method: 'Browser.close', params: {} })); } catch {}
    await delay(300);
    if (socket.readyState === WebSocket.OPEN) socket.close();
  }
  if (browser?.pid) {
    if (browser.exitCode === null) {
      const exited = new Promise((resolve) => browser.once('exit', resolve));
      browser.kill();
      await Promise.race([exited, delay(1_000)]);
    }
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true
    });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  await delay(200);
  if (profile.startsWith(`${artifactRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 }); } catch {}
  }
}
