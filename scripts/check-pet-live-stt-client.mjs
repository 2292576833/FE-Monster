import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createLiveSttClient } = require(path.join(root, 'web', 'pet-live-stt-client.js'));

function frame(value = 0.25) {
  return new Float32Array(320).fill(value);
}

const requests = [];
const partials = [];
let endpointCount = 0;
const client = createLiveSttClient({
  sessionId: 'session-a',
  streamId: 'stream-a',
  itemId: 'item-a',
  batchFrames: 10,
  maxQueuedBatches: 4,
  request: async (payload) => {
    requests.push(structuredClone(payload));
    if (payload.action === 'open') return { state: 'open', revision: 0, partial: '' };
    if (payload.action === 'frames') {
      return {
        state: 'open',
        revision: requests.filter((item) => item.action === 'frames').length,
        partial: payload.sequence >= 10 ? '你好世界' : '你好',
        endpoint: payload.sequence >= 10
      };
    }
    if (payload.action === 'finalize') {
      return { state: 'finalized', revision: 3, partial: '你好世界', final: '你好世界', endpoint: true };
    }
    return { state: 'cancelled' };
  },
  onPartial: (result) => partials.push(result.partial),
  onEndpoint: () => { endpointCount += 1; }
});

await client.open();
for (let index = 0; index < 23; index += 1) assert.equal(client.pushFrame(frame()), true);
const result = await client.finalize();

assert.equal(result.final, '你好世界');
assert.deepEqual(requests.map((item) => item.action), ['open', 'frames', 'frames', 'frames', 'finalize']);
const batches = requests.filter((item) => item.action === 'frames');
assert.deepEqual(batches.map((item) => item.sequence), [0, 10, 20]);
assert.deepEqual(batches.map((item) => Buffer.from(item.audioBase64, 'base64').byteLength), [6_400, 6_400, 1_920]);
assert.equal(Buffer.from(batches[0].audioBase64, 'base64').readInt16LE(0), 8192,
  'Float32 microphone samples were not encoded as little-endian PCM16');
assert.deepEqual(partials, ['你好', '你好世界', '你好世界']);
assert.equal(endpointCount, 1, 'the online endpoint callback must be monotonic within one utterance');
assert.equal(client.snapshot().state, 'finalized');
assert.equal(client.snapshot().acceptedFrames, 23);

let releaseFirstBatch;
const firstBatchHeld = new Promise((resolve) => { releaseFirstBatch = resolve; });
const bounded = createLiveSttClient({
  sessionId: 'session-b',
  streamId: 'stream-b',
  itemId: 'item-b',
  batchFrames: 1,
  maxQueuedBatches: 2,
  request: async (payload) => {
    if (payload.action === 'frames' && payload.sequence === 0) await firstBatchHeld;
    return { state: payload.action === 'cancel' ? 'cancelled' : 'open' };
  }
});
await bounded.open();
assert.equal(bounded.pushFrame(frame()), true);
assert.equal(bounded.pushFrame(frame()), true);
assert.equal(bounded.pushFrame(frame()), false, 'bounded client accepted unbounded queued audio');
assert.equal(bounded.snapshot().failed, true);
releaseFirstBatch();
const boundedFinal = await bounded.finalize();
assert.equal(boundedFinal.fallback, true, 'queue overflow must select the whole-turn fallback');

const cancelledRequests = [];
const cancelled = createLiveSttClient({
  sessionId: 'session-c',
  streamId: 'stream-c',
  itemId: 'item-c',
  request: async (payload) => {
    cancelledRequests.push(payload.action);
    return { state: payload.action === 'cancel' ? 'cancelled' : 'open' };
  }
});
await cancelled.open();
cancelled.pushFrame(frame());
await cancelled.cancel();
assert.equal(cancelled.pushFrame(frame()), false);
assert.deepEqual(cancelledRequests, ['open', 'cancel']);
assert.equal(cancelled.snapshot().state, 'cancelled');

const assistant = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'web', 'runtime-module-loader.js'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'scripts', 'build-installer.ps1'), 'utf8');
const installScript = fs.readFileSync(path.join(root, 'scripts', 'install-fe-monster.ps1'), 'utf8');
assert.ok(loader.indexOf('pet-live-stt-client.js') < loader.indexOf('pet-assistant.js'),
  'the online STT client must load before pet-assistant.js');
assert.match(assistant, /startOnlineStreamingSttCapture\(capture\)/,
  'the microphone capture never opens the online STT stream');
assert.match(assistant, /pet\.serverStreamingSttAvailable[\s\S]{0,100}pet\.serverStreamingSttEnabled[\s\S]{0,160}FeMonsterPetLiveSttClient/,
  'lazy model readiness must not deadlock the first online STT open');
assert.match(assistant, /capture\.onlineSttClient\.pushFrame\(frame\.pcm\)/,
  '20 ms AudioWorklet frames are not forwarded to online STT');
assert.match(assistant, /finalizeOnlineStreamingSttCapture\(capture,\s*autoSend/,
  'turn completion does not finalize the authoritative online transcript');
assert.match(assistant, /queueLocalPcmFallback\(capture,\s*autoSend/,
  'online STT failures lost the existing whole-turn WAV fallback');
assert.ok((installer.match(/web\\pet-live-stt-client\.js/g) || []).length >= 1,
  'the installer payload list must stage the online STT client');
assert.match(installer, /function\s+New-PayloadIntegrityManifest[\s\S]{0,900}Get-ChildItem[\s\S]{0,180}-Recurse\s+-File\s+-Force/,
  'the integrity manifest no longer auto-covers the staged online STT client');
assert.match(installScript, /web\\pet-live-stt-client\.js/,
  'installed-payload verification must require the online STT client');

console.log(JSON.stringify({
  ok: true,
  batchFrames: 10,
  batchBytes: batches.map((item) => Buffer.from(item.audioBase64, 'base64').byteLength),
  acceptedFrames: client.snapshot().acceptedFrames,
  boundedFallback: boundedFinal.fallback
}));
