import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');

const silenceMatch = source.match(/const\s+LIVE_TURN_SILENCE_MS\s*=\s*(\d+)/);
assert.ok(silenceMatch, 'DeepSeek Live end-of-turn silence threshold is missing');
const silenceMs = Number(silenceMatch[1]);
assert.ok(silenceMs >= 550 && silenceMs <= 650,
  `DeepSeek Live waits ${silenceMs}ms after speech; expected a 550-650ms latency/accuracy window`);
assert.match(source, /LOCAL_STT_VAD_PRE_ROLL_MS\s*=\s*220/,
  'local STT must retain enough pre-roll to preserve initial consonants');
assert.match(source, /LOCAL_STT_VAD_POST_ROLL_MS\s*=\s*320/,
  'local STT must retain enough post-roll to preserve final syllables');
assert.match(source, /localSttUsesPcmCapture\(\)/,
  'local sherpa STT must keep the direct PCM capture path');
assert.match(source, /new AudioContextConstructor\(\{[\s\S]{0,160}?sampleRate:\s*LOCAL_STT_SAMPLE_RATE/,
  'local STT should ask WebView2 for native 16 kHz capture before using the JS resampler fallback');
const voiceStart = source.slice(source.indexOf('async function startLegacyVoiceConversation'), source.indexOf('function stopVoiceConversation'));
assert.ok(voiceStart.indexOf('startLocalPcmCapture(capturedStream') < voiceStart.indexOf('await Promise.all([mediaPromise, sessionPromise])'),
  'local PCM capture must begin as soon as the microphone resolves instead of dropping speech while session creation is pending');
assert.match(source, /sampleRate:\s*LOCAL_STT_SAMPLE_RATE/,
  'local STT upload must remain 16 kHz PCM without server-side transcoding');

console.log(JSON.stringify({ ok: true, silenceMs, sampleRate: 16000, format: 'pcm16-wav' }));
