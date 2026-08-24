import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const controllerPath = path.join(root, 'web', 'pet-live-turn-controller.js');

assert.ok(fs.existsSync(controllerPath), 'the dependency-free live turn controller is missing');

const controller = require(controllerPath);
assert.equal(typeof controller.resolveEndpointSilenceMs, 'function');

const endpoint = (input) => controller.resolveEndpointSilenceMs(input);

assert.equal(endpoint({ speechMs: 1_200, transcript: '帮我播放这首歌。' }), 520,
  'a complete punctuated command should commit quickly');
assert.equal(endpoint({ speechMs: 3_600, transcript: '把场景切到 Sonic 然后' }), 940,
  'an unfinished conjunction should survive a natural mid-thought pause');
assert.equal(endpoint({ speechMs: 1_500, transcript: '帮我播放' }), 900,
  'an incomplete verb phrase should not be cut at the fixed silence threshold');
assert.equal(endpoint({ speechMs: 320, transcript: '' }), 760,
  'very short speech without a transcript should get a confirmation window');
assert.equal(endpoint({ speechMs: 7_000, transcript: '把歌声调小一点' }), 560,
  'a long clear utterance should not pay the full fixed endpoint delay');
assert.ok(endpoint({ speechMs: 1_200, transcript: '还有，' }) > 650,
  'soft punctuation must hold longer than the old fixed threshold');

const assistant = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'web', 'runtime-module-loader.js'), 'utf8');
assert.match(assistant, /resolveLiveEndpointSilenceMs/,
  'the microphone VAD path does not consult the adaptive controller');
assert.match(assistant, /capture\.endpointSilenceMs/,
  'the active turn does not expose its resolved endpoint for diagnostics');
assert.ok(loader.indexOf('pet-live-turn-controller.js') < loader.indexOf('pet-assistant.js'),
  'the controller must load before pet-assistant.js');

for (const forbidden of [
  '@ricky0123/vad-web',
  'whisper',
  'kokoro',
  'supertonic',
  'smart-turn',
  'electron',
  'next/'
]) {
  assert.ok(!fs.readFileSync(controllerPath, 'utf8').toLowerCase().includes(forbidden),
    `the distribution-safe controller unexpectedly references ${forbidden}`);
}

console.log(JSON.stringify({
  ok: true,
  endpointMs: {
    complete: endpoint({ speechMs: 1_200, transcript: '帮我播放这首歌。' }),
    midThought: endpoint({ speechMs: 3_600, transcript: '把场景切到 Sonic 然后' }),
    longUtterance: endpoint({ speechMs: 7_000, transcript: '把歌声调小一点' })
  },
  addedRuntimeDependencies: 0
}));
