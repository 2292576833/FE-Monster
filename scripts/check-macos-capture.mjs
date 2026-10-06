import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleSource = fs.readFileSync(new URL('../web/mac-capture.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const nativeSource = fs.readFileSync(new URL('../FE moster苹果端/App/Sources/FEMonsterMac/MacCaptureService.swift', import.meta.url), 'utf8');
const previewSource = fs.readFileSync(new URL('../FE moster苹果端/App/Sources/FEMonsterMac/MacRecordingPreviewServer.swift', import.meta.url), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

function bridgeHarness(platform = 'macos') {
  const sent = [], events = [], listeners = new Map(), timers = new Map();
  let bridgeListener, nextTimer = 0, now = 1000;
  const window = {
    FE_MONSTER_PLATFORM: platform,
    chrome: { webview: {
      postMessage(payload) { sent.push(payload); },
      addEventListener(name, callback) { assert.equal(name, 'message'); bridgeListener = callback; },
    } },
    location: { origin: 'http://127.0.0.1:8099' },
    performance: { now: () => now },
    setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent(event) { events.push(event); },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  vm.runInNewContext(moduleSource, { window, Uint8Array, Date, Error, Math, Number, Map });
  return { window, sent, events, timers, listeners,
    receive: payload => bridgeListener({ data: payload }),
    advance: value => { now += value; } };
}

const bridge = bridgeHarness();
assert.equal(bridgeHarness('windows').window.FeMonsterMacCapture, undefined);
const api = bridge.window.FeMonsterMacCapture;
assert.ok(api.available);
assert.equal(bridge.sent.length, 0, 'installation must not ask for capture permissions');
const start = api.request('recording-start', { fps: 60, backendURL: 'https://evil.invalid' });
const startId = bridge.sent.at(-1).requestId;
assert.equal(bridge.sent.at(-1).backendURL, 'http://127.0.0.1:8099');
const pause = api.request('recording-pause');
const pauseId = bridge.sent.at(-1).requestId;
assert.notEqual(startId, pauseId);
bridge.receive({ type: 'fe-mac-capture-result', requestId: pauseId, ok: true, elapsedMs: 1500 });
assert.equal((await pause).elapsedMs, 1500, 'out-of-order replies resolve only their own operation');
bridge.receive(JSON.stringify({ type: 'fe-mac-capture-result', requestId: startId, ok: true, mode: 'recording' }));
assert.equal((await start).mode, 'recording');
assert.equal(bridge.timers.size, 0);
const denied = api.startSystemAudio();
bridge.receive({ type: 'fe-mac-capture-result', requestId: bridge.sent.at(-1).requestId, ok: false, error: 'permission denied' });
await assert.rejects(denied, /permission denied/);
const expired = api.permissions();
bridge.timers.values().next().value.callback();
await assert.rejects(expired, /超时/);

bridge.receive({ type: 'fe-mac-capture-spectrum', bins: Array(512).fill(300), sampleRate: 48000 });
assert.equal(api.latestSpectrum().bins[10], 255);
bridge.receive({ type: 'fe-mac-capture-spectrum', bins: Array(3000).fill(20), sampleRate: 48000 });
assert.equal(api.latestSpectrum().bins.length, 512, 'oversized spectrum must not replace valid data');
bridge.advance(501);
assert.equal(api.latestSpectrum(), null, 'stale system sound must not mask the normal analyser');
bridge.receive({ type: 'fe-mac-capture-spectrum', bins: Array(512).fill(40), sampleRate: 48000 });
bridge.receive({ type: 'fe-mac-capture-state', systemAudio: false });
assert.equal(api.latestSpectrum(), null);
const navigating = api.startMicrophone();
bridge.listeners.get('pagehide')();
await assert.rejects(navigating, /页面已关闭/);
assert.deepEqual(bridge.sent.slice(-3).map(payload => payload.action), ['cancel', 'system-audio-stop', 'microphone-stop']);

function extractFunction(name) {
  const signature = appSource.includes(`async function ${name}`) ? `async function ${name}` : `function ${name}`;
  const start = appSource.indexOf(signature);
  assert.ok(start >= 0, `${name} must exist`);
  const bodyStart = appSource.indexOf('{', appSource.indexOf(')', start) + 1);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = bodyStart; index < appSource.length; index++) {
    const char = appSource[index], next = appSource[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Unbalanced function ${name}`);
}

function recordingHarness() {
  const requests = [], effects = [];
  const state = { recording: { mode: 'idle', nativeCapture: false, stopping: false } };
  const els = { recordingPreview: {}, recordingPreviewPlaceholder: { hidden: false }, recordingDownloadButton: {} };
  const sandbox = {
    state, els, Number, Math,
    window: { FeMonsterMacCapture: { request(action, parameters, timeout) {
      const pending = { ...deferred(), action, parameters, timeout }; requests.push(pending); return pending.promise;
    } } },
    resetRecordingDownload() { state.recording.nativeFileToken = ''; },
    resetRecordingPreview() { els.recordingPreview.src = ''; },
    clearRecordingTimer() { effects.push('clearTimer'); },
    startRecordingTimer() { effects.push('startTimer'); },
    readRecordingOptions: () => ({ fps: 60, audio: true }),
    setRecordingControls(mode) { state.recording.mode = mode; },
    setRecordingStatus(value) { effects.push(value); },
    toast(value) { effects.push(value); },
    safeText: (value, fallback = '') => String(value ?? fallback),
    postNativeRecordingToolbar() {}, showRecordingMiniFallback() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(['startMacProgramRecording', 'controlMacProgramRecording', 'applyMacRecordingResult', 'finishMacProgramRecording'].map(extractFunction).join('\n'), sandbox);
  return { sandbox, state, els, requests, effects };
}

const recording = recordingHarness();
const started = recording.sandbox.startMacProgramRecording();
assert.equal(recording.state.recording.mode, 'finalizing');
recording.requests.at(-1).resolve({ ok: true }); await started;
assert.equal(recording.state.recording.mode, 'recording');
const paused = recording.sandbox.controlMacProgramRecording('recording-pause', 'paused');
recording.requests.at(-1).resolve({ elapsedMs: 2200 }); await paused;
assert.equal(recording.state.recording.mode, 'paused');
assert.equal(recording.state.recording.elapsedMs, 2200);
const resumed = recording.sandbox.controlMacProgramRecording('recording-resume', 'recording');
recording.requests.at(-1).resolve({ elapsedMs: 2200 }); await resumed;
assert.equal(recording.state.recording.mode, 'recording');
const finished = recording.sandbox.finishMacProgramRecording();
const count = recording.requests.length;
await recording.sandbox.finishMacProgramRecording();
assert.equal(recording.requests.length, count, 'duplicate finish must not finalize a writer twice');
recording.requests.at(-1).resolve({ fileToken: 'recording-token', fileName: 'result.mp4', previewURL: 'http://127.0.0.1:9000/token.mp4', elapsedMs: 3500 }); await finished;
assert.equal(recording.state.recording.mode, 'idle');
assert.equal(recording.state.recording.nativeFileToken, 'recording-token');
assert.equal(recording.state.recording.elapsedMs, 3500);
assert.equal(recording.els.recordingPreview.src, 'http://127.0.0.1:9000/token.mp4');
assert.equal(recording.els.recordingDownloadButton.download, 'result.mp4');
assert.equal(recording.state.recording.nativeCapture, false);
const failed = recordingHarness();
const failedStart = failed.sandbox.startMacProgramRecording();
failed.requests.at(-1).reject(new Error('screen denied')); await failedStart;
assert.equal(failed.state.recording.mode, 'idle');
assert.equal(failed.state.recording.nativeCapture, false);
assert.equal(failed.requests.at(-1).action, 'cancel');
failed.requests.at(-1).resolve({});

assert.match(extractFunction('saveRecordingAs'), /nativeFileToken[\s\S]*recording-save/);
let macSpectrum = { bins: new Uint8Array(512).fill(128), sampleRate: 48000 };
const scalarFields = 'bass lowFrequencyAmplitude energy mid treble beat subBass lowMid highMid presence brilliance air warmth brightness sharpness smoothness density spectralCentroid previousBrightness fluxPulse fluxMeteor previousBass silenceFrames lastUpdateAt'.split(' ');
const analysis = { ...Object.fromEntries(scalarFields.map(key => [key, 0])),
  analyser: null, data: new Uint8Array(2048).fill(7), live: false,
  lowFrequencyBands: new Float32Array(512), lowFrequencyBinLower: new Uint16Array(512), lowFrequencyBinMix: new Float64Array(512),
};
const visualState = { lowFrequencyBands: new Float32Array(512) };
const spectrumSandbox = {
  MACOS_CLIENT: true, state: { audioAnalysis: analysis, visual: visualState,
    clientRuntime: { nativeAudioActive: true, settings: { xAudio2: true } },
    visualBridge: { energy: 0.8, bass: 0.5, lowFrequencyAmplitude: 0.5, lowFrequencyBands: new Float32Array(512), beat: 0.6, mid: 0.4, treble: 0.3 },
  },
  window: { FeMonsterMacCapture: { latestSpectrum: () => macSpectrum } },
  els: { audio: { paused: true } }, performance: { now: () => 1000 },
  RENDER_PROFILE: { targetFrameMs: 1000 / 60 },
  SONIC_LOW_FREQUENCY_BAND_COUNT: 512, SONIC_LOW_FREQUENCY_MIN_HZ: 20, SONIC_LOW_FREQUENCY_MAX_HZ: 150,
  AUDIO_SPECTRUM_BAND_COUNT: 8, AUDIO_SPECTRUM_UNMAPPED: 255, AUDIO_BYTE_TO_UNIT: 1 / 255,
  clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)), updateSpectrumUi() {},
};
vm.createContext(spectrumSandbox);
vm.runInContext(['audioFrameResponse', 'ensureAudioSpectrumAggregateLookup', 'updateAudioSpectrum', 'applyBridgeVisual'].map(extractFunction).join('\n'), spectrumSandbox);
assert.equal(spectrumSandbox.updateAudioSpectrum(), true, 'live SC spectrum works while media is paused and native output is active');
assert.ok(visualState.energy > 0);
assert.equal(analysis.data.length, 2048, 'SC data must not resize the normal WebAudio analyser buffer');
assert.equal(analysis.data[0], 7);
assert.equal(analysis.previousData.length, 512);
const capturedEnergy = visualState.energy;
analysis.live = false;
spectrumSandbox.applyBridgeVisual();
assert.equal(visualState.energy, capturedEnergy, 'fresh SC spectrum must take priority even at silence');
macSpectrum = { bins: new Uint8Array(512), sampleRate: 48000 };
analysis.silenceFrames = 51;
spectrumSandbox.updateAudioSpectrum();
assert.equal(visualState.energy, 0, 'silence in system sound must clear the old animation');
macSpectrum = null;
spectrumSandbox.applyBridgeVisual();
assert.equal(visualState.energy, 0.8, 'expired/stopped capture returns to backend spectrum');
assert.match(nativeSource, /generation == token, !Task\.isCancelled/);
assert.match(nativeSource, /queue\.sync[\s\S]*pauseOffset = CMTimeAdd/);
assert.match(nativeSource, /CMSampleBufferCreateCopyWithNewTiming/);
assert.match(nativeSource, /AVVideoCodecType\.h264/);
assert.match(nativeSource, /recordingAudioStream: SCStream\?/);
assert.match(nativeSource, /sound\.addStreamOutput\(output, type: \.audio, sampleHandlerQueue: output\.queue\)/, 'recording includes Java child/system sound outside the window app filter');
assert.match(nativeSource, /guard pcmRequest == nil/);
assert.match(nativeSource, /case "recording-save"/);
assert.doesNotMatch(nativeSource, /SCRecordingOutput|configuration\.captureMicrophone/, 'must support macOS 13.5, without macOS 15-only recording APIs');
assert.match(previewSource, /requiredLocalEndpoint = \.hostPort\(host: "127\.0\.0\.1"/);
assert.match(previewSource, /connections\.count < 12/);
assert.match(previewSource, /min\(remaining, 256 \* 1024\)/);
assert.match(previewSource, /for connection in self\.connections\.values \{ connection\.cancel\(\) \}/);
console.log('PASS macOS capture bridge, recording lifecycle, denial, stale spectrum and cleanup (Apple SDK compilation requires macOS CI)');
