import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workletPath = path.join(root, 'web', 'pet-live-audio-worklet.js');
const assistantPath = path.join(root, 'web', 'pet-assistant.js');
const installerPath = path.join(root, 'scripts', 'build-installer.ps1');
const installScriptPath = path.join(root, 'scripts', 'install-fe-monster.ps1');
const installerContractPath = path.join(root, 'scripts', 'check-windows-installer-contract.ps1');

assert.ok(fs.existsSync(workletPath), 'the DeepSeek Live PCM AudioWorklet is missing');

const posted = [];
let Processor = null;
class FixtureAudioWorkletProcessor {
  constructor() {
    this.port = {
      postMessage(message) {
        posted.push(structuredClone(message));
      }
    };
  }
}

vm.runInNewContext(fs.readFileSync(workletPath, 'utf8'), {
  AudioWorkletProcessor: FixtureAudioWorkletProcessor,
  Float32Array,
  Math,
  sampleRate: 48_000,
  registerProcessor(name, constructor) {
    assert.equal(name, 'fe-pet-live-capture');
    Processor = constructor;
  }
}, { filename: 'web/pet-live-audio-worklet.js' });

assert.equal(typeof Processor, 'function', 'the live capture processor was not registered');
const processor = new Processor({ processorOptions: { targetSampleRate: 16_000, frameSamples: 320 } });

for (let block = 0; block < 15; block += 1) {
  const left = new Float32Array(128).fill(0.2);
  const right = new Float32Array(128).fill(0.4);
  const output = [new Float32Array(128).fill(1)];
  assert.equal(processor.process([[left, right]], [output]), true);
  assert.ok(output[0].every((sample) => sample === 0), 'capture worklet leaked microphone audio to its output');
}

const frames = posted.filter((message) => message?.type === 'frame');
assert.equal(frames.length, 2, '1,920 samples at 48 kHz must emit two 20 ms frames at 16 kHz');
for (const frame of frames) {
  assert.equal(frame.sampleRate, 16_000);
  assert.equal(frame.durationMs, 20);
  assert.equal(frame.pcm.length, 320);
  assert.ok(frame.pcm.every((sample) => Math.abs(sample - 0.3) < 0.0001),
    'the AudioWorklet did not downmix channels before resampling');
  assert.ok(Math.abs(frame.rms - 0.3) < 0.0001, 'the AudioWorklet RMS does not match its emitted PCM frame');
}

const sentenceStartOffset = posted.length;
const sentenceStartProcessor = new Processor({
  processorOptions: { targetSampleRate: 16_000, frameSamples: 320 }
});
for (let block = 0; block < 8; block += 1) {
  const input = new Float32Array(128);
  if (block === 0) input[0] = 0.75;
  sentenceStartProcessor.process([[input]], [[new Float32Array(128)]]);
}
const sentenceStartFrame = posted.slice(sentenceStartOffset).find((message) => message?.type === 'frame');
assert.ok(sentenceStartFrame, 'the AudioWorklet did not emit the first sentence frame');
assert.ok(Math.abs(sentenceStartFrame.pcm[0] - 0.75) < 0.0001,
  'the first microphone sample was lost while the AudioWorklet started');
assert.ok(Math.abs(sentenceStartFrame.rms - Math.sqrt((0.75 * 0.75) / 320)) < 0.0001,
  'the first sentence frame RMS did not include its leading sample');

const assistant = fs.readFileSync(assistantPath, 'utf8');
const installer = fs.readFileSync(installerPath, 'utf8');
const installScript = fs.readFileSync(installScriptPath, 'utf8');
const installerContract = fs.readFileSync(installerContractPath, 'utf8');
assert.match(assistant, /audioWorklet\.addModule\(PET_LIVE_AUDIO_WORKLET_URL\)/,
  'the pet assistant does not load the PCM worklet');
assert.match(assistant, /new AudioWorkletNode\([\s\S]{0,180}?'fe-pet-live-capture'/,
  'the pet assistant does not create the live capture AudioWorkletNode');
assert.match(assistant, /createScriptProcessor\(/,
  'older WebView2 builds lost the ScriptProcessor compatibility fallback');
assert.ok((installer.match(/web\\pet-live-audio-worklet\.js/g) || []).length >= 1,
  'the live capture worklet is not staged by the installer payload list');
assert.match(installer, /function\s+New-PayloadIntegrityManifest[\s\S]{0,900}Get-ChildItem[\s\S]{0,180}-Recurse\s+-File\s+-Force/,
  'the integrity manifest no longer auto-covers the staged live capture worklet');
assert.match(installScript, /'web\\pet-live-audio-worklet\.js'/,
  'the installed-payload verifier does not require the live capture worklet');
assert.match(installerContract, /'web\\pet-live-audio-worklet\.js'/,
  'the native Windows installer contract does not protect the live capture worklet');

console.log(JSON.stringify({
  ok: true,
  processor: 'fe-pet-live-capture',
  inputSampleRate: 48_000,
  outputSampleRate: frames[0].sampleRate,
  frameSamples: frames[0].pcm.length,
  frameDurationMs: frames[0].durationMs,
  rms: frames[0].rms
}));
