import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const html = read('web/index.html');
const css = read('web/pet-assistant.css');
const pet = read('web/pet-assistant.js');
const community = read('src/community-proprietary/java/com/femonster/core/CommunityService.java');

function functionBody(source, name) {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  if (start < 0) return '';
  let parameterDepth = 1;
  let parameterEnd = -1;
  let parameterQuote = '';
  let parameterEscaped = false;
  for (let index = start + signature.length; index < source.length; index += 1) {
    const character = source[index];
    if (parameterQuote) {
      if (parameterEscaped) parameterEscaped = false;
      else if (character === '\\') parameterEscaped = true;
      else if (character === parameterQuote) parameterQuote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      parameterQuote = character;
      continue;
    }
    if (character === '(') parameterDepth += 1;
    else if (character === ')' && --parameterDepth === 0) {
      parameterEnd = index;
      break;
    }
  }
  const opening = parameterEnd >= 0 ? source.indexOf('{', parameterEnd + 1) : -1;
  if (opening < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

assert.match(
  html,
  /<label[^>]+class="pet-assistant__voice-picker"[^>]+for="petAssistantVoiceSelect"[^>]*>/,
  'voice picker must use a native label association'
);
assert.match(
  html,
  /<select[^>]+id="petAssistantVoiceSelect"[^>]+aria-describedby="petAssistantVoiceHint"[^>]*>/,
  'voice picker must expose a keyboard-accessible select with help text'
);
assert.match(html, /id="petAssistantVoiceHint"[^>]*>[^<]+<\/span>/, 'voice picker help text is missing');
assert.match(css, /\.pet-assistant__voice-picker\s*\{[\s\S]*?display:\s*grid/, 'voice picker compact layout is missing');
assert.match(css, /\.pet-assistant__voice-picker select:focus-visible/, 'voice picker keyboard focus style is missing');

const syncVoiceCatalog = functionBody(pet, 'syncVoiceCatalog');
const persistVoiceSelection = functionBody(pet, 'persistVoiceSelection');
const persistState = functionBody(pet, 'persistState');
const requestPetChat = functionBody(pet, 'requestPetChat');
const sendText = functionBody(pet, 'sendText');
const uploadAudioBlob = functionBody(pet, 'uploadAudioBlob');
const postTranscript = functionBody(pet, 'postTranscript');

assert.match(pet, /voiceSelect:\s*document\.getElementById\('petAssistantVoiceSelect'\)/);
assert.match(
  persistState,
  /voiceId:\s*pet\.voiceId\s*\|\|\s*pet\.persistedVoiceId/,
  'startup state writes can erase the unvalidated local voice candidate'
);
assert.match(persistState, /voiceSyncPending:\s*pet\.voiceSelectionPending/, 'failed voice saves are not retained for retry');
assert.match(syncVoiceCatalog, /remotePet\.voices/, 'voice catalog must come from pet.voices');
assert.match(syncVoiceCatalog, /remotePet\.selectedVoiceId/, 'server FE ID voice selection is not honored');
assert.match(syncVoiceCatalog, /voice\.available\s*===\s*true/, 'unavailable voices can enter the selection whitelist');
assert.match(syncVoiceCatalog, /availableVoices\[0\]/, 'invalid selections do not fall back to the first available voice');
assert.match(pet, /availableVoiceById\(event\.currentTarget\.value\)/, 'dropdown changes bypass the returned voice whitelist');
assert.match(sendText, /requestPetChat\(message,\s*sessionId\)/,
  'chat submission bypasses the voice-aware pet request builder');

for (const [requestName, body, owner] of [
  ['chat', requestPetChat, 'pet'],
  ['voice/transcript', postTranscript, 'delivery'],
  ['voice/chunk', uploadAudioBlob, 'upload']
]) {
  assert.match(body, new RegExp(`voiceId:\\s*${owner}\\.voiceId`), `${requestName} does not send the selected voiceId`);
  const replySource = owner === 'pet' ? '!pet\\.muted' : `${owner}\\.replyWithVoice`;
  assert.match(body, new RegExp(`replyWithVoice:\\s*${replySource}`), `${requestName} does not suppress TTS generation when muted`);
  assert.match(body, new RegExp(`voiceReply:\\s*${replySource}`), `${requestName} lacks the compatible voiceReply preference`);
}
assert.match(html, /id="petAssistantVoicePlaybackToggle"[^>]+checked/,
  'pet panel is missing an explicit voice playback switch');
assert.match(persistState, /muted:\s*pet\.muted/, 'voice playback preference is not persisted');
assert.match(persistVoiceSelection, /\/api\/community\/pet\/voice/, 'voice picker does not persist through the FE ID voice endpoint');
assert.match(persistVoiceSelection, /const\s+voiceId\s*=\s*selectedVoice\.id/, 'voice persistence does not capture the trusted dropdown value');
assert.match(persistVoiceSelection, /JSON\.stringify\(\{\s*voiceId\s*\}\)/, 'voice endpoint payload omits voiceId');
assert.match(persistVoiceSelection, /pet\.voiceSelectionPending\s*=\s*true/, 'voice selection is not marked pending before save');
assert.doesNotMatch(persistVoiceSelection, /handleNetworkError/, 'voice preference failure blocks normal pet interactions');
assert.match(syncVoiceCatalog, /pendingVoice/, 'an unconfirmed local selection can be overwritten before retry');
assert.match(syncVoiceCatalog, /serverVoice\?\.id\s*===\s*pendingVoice\.id/, 'server acknowledgement does not settle a pending voice selection');

assert.match(community, /"chat",\s*Set\.of\([^)]*"voiceId"/s, 'Java chat proxy strips voiceId');
assert.match(community, /"voice",\s*Set\.of\([^)]*"voiceId"/s, 'Java voice proxy strips voiceId');
assert.match(community, /"voice\/transcript",\s*Set\.of\([\s\S]*?"voiceId"[\s\S]*?\)/, 'Java transcript proxy strips voiceId');
assert.match(community, /"voice\/chunk",\s*Set\.of\([\s\S]*?"voiceId"[\s\S]*?\)/, 'Java chunk proxy strips voiceId');

console.log(JSON.stringify({
  ok: true,
  contract: 'server-whitelisted pet voice selection',
  payloads: ['chat', 'voice', 'voice/transcript', 'voice/chunk']
}, null, 2));
