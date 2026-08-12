import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const index = read('web', 'index.html');
const assistant = read('web', 'pet-assistant.js');
const installer = read('scripts', 'build-installer.ps1');
const installScript = read('scripts', 'install-fe-monster.ps1');
const installerContract = read('scripts', 'check-windows-installer-contract.ps1');

const playoutScript = index.indexOf('pet-live-playout.js');
const assistantScript = index.indexOf('pet-assistant.js');
assert.ok(playoutScript >= 0 && playoutScript < assistantScript,
  'the continuous playout module must load before pet-assistant.js');

assert.match(assistant, /FeMonsterPetLivePlayout\?\.createLivePlayout/,
  'the pet assistant does not create the continuous AudioContext playout timeline');
assert.match(assistant, /replyLivePlayout\.enqueue\(chunk\)/,
  'live audio events are not routed into the predecode timeline');
assert.match(assistant, /onStarted:\s*\(chunk/,
  'live reply text is not tied to the actual AudioContext start callback');
assert.match(assistant, /onCursor:\s*\(cursor/,
  'the played-audio cursor is not updated from AudioContext time');
assert.match(assistant, /replyLivePlayout\?\.interrupt/,
  'barge-in does not interrupt already scheduled AudioBufferSource nodes');
assert.match(assistant, /setVolume\?\.\(\s*next \? LIVE_BARGE_IN_DUCK_VOLUME : 1,\s*LIVE_BARGE_IN_DUCK_RAMP_MS\s*\)/,
  'the 45 ms candidate-speech duck is not applied to the AudioContext timeline');
assert.match(assistant, /FeMonsterPetLiveTelemetry\?\.createSessionTelemetry/,
  'DeepSeek Live does not create a private bounded telemetry session');
for (const stage of ['speech_start', 'stt_final', 'endpoint', 'llm_first_token', 'tts_first_byte', 'playout', 'barge_local', 'server_ack']) {
  assert.ok(assistant.includes(`markLiveTelemetry('${stage}'`),
    `DeepSeek Live does not mark the ${stage} telemetry boundary`);
}

for (const requiredFile of ['web\\pet-live-playout.js', 'web\\pet-live-telemetry.js']) {
  assert.ok((installer.match(new RegExp(requiredFile.replace(/\\/g, '\\\\'), 'g')) || []).length >= 2,
    `${requiredFile} is not required by both installer manifests`);
  assert.ok(installScript.includes(`'${requiredFile}'`),
    `${requiredFile} is missing from installed-payload verification`);
  assert.ok(installerContract.includes(`'${requiredFile}'`),
    `${requiredFile} is missing from the Windows installer contract`);
}

console.log(JSON.stringify({ ok: true, mode: 'audio-context-live-playout' }));
