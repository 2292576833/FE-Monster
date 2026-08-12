import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const html = readFileSync(join(root, 'web', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'web', 'pet-assistant.css'), 'utf8');
const buttonSkin = readFileSync(join(root, 'web', 'black-gold-buttons.css'), 'utf8');
const pet = readFileSync(join(root, 'web', 'pet-assistant.js'), 'utf8');
const app = readFileSync(join(root, 'web', 'app.js'), 'utf8');
const routes = readFileSync(join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'), 'utf8');
const community = readFileSync(join(root, 'src', 'community-proprietary', 'java', 'com', 'femonster', 'core', 'CommunityService.java'), 'utf8');
const http = readFileSync(join(root, 'src', 'main', 'java', 'com', 'femonster', 'http', 'HttpUtil.java'), 'utf8');

const requiredStates = [
  'idle', 'listening', 'transcribing', 'thinking', 'speaking',
  'executing', 'success', 'error', 'offline', 'sleep'
];
for (const state of requiredStates) {
  assert.match(pet, new RegExp(`['"]${state}['"]`), `missing runtime state ${state}`);
assert.match(css, new RegExp(`data-state=["']${state}["']`), `missing visual state ${state}`);
}

assert.ok(existsSync(join(root, 'web', 'assets', 'fe-monster-pet-mascot.png')), 'pet mascot asset is missing');
assert.match(html, /id="petAssistant"[^>]*data-state="idle"[^>]*hidden/);
assert.match(html, /id="petAssistantMessages"[^>]*role="log"[^>]*aria-live="polite"/);
assert.match(html, /pet-assistant\.css/);
assert.match(html, /pet-assistant\.js/);
assert.match(html, /assets\/fe-monster-pet-mascot\.png/);
assert.match(css, /\.pet-assistant__panel\[hidden\][\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.pet-assistant \.pet-assistant__character,\s*#petAssistant #petAssistantCharacter\s*\{/);
for (const reset of [
  /appearance:\s*none/,
  /background:\s*transparent\s*!important/,
  /border:\s*0\s*!important/,
  /box-shadow:\s*none\s*!important/,
  /backdrop-filter:\s*none\s*!important/,
  /filter:\s*drop-shadow\([^;]+\)\s*!important/
]) assert.match(css, reset, `character button reset missing ${reset}`);
assert.match(css, /#petAssistant #petAssistantCharacter:focus-visible/);
const publicButtonBoundaries = buttonSkin.match(/:not\([\s\S]*?\)/g) || [];
assert.ok(
  (buttonSkin.match(/\.pet-assistant__character/g) || []).length >= 10,
  'every generic black-gold button state must exclude the mascot character'
);
assert.ok(
  publicButtonBoundaries.some((boundary) => boundary.includes('.pet-assistant__character')),
  'black-gold button boundary does not exclude the mascot character'
);

assert.match(pet, /SpeechRecognition \|\| window\.webkitSpeechRecognition/);
assert.match(pet, /recognition\.continuous = true/);
assert.match(pet, /recognition\.interimResults = true/);
assert.match(pet, /new MediaRecorder\(stream/);
assert.match(pet,
  /const recorderContext = \{[\s\S]{0,700}?requestId: pet\.voiceTurnId,[\s\S]{0,700}?blobs: \[\][\s\S]{0,300}?finalized: false/,
  'each MediaRecorder turn must own isolated blobs and stable request metadata');
assert.match(pet,
  /recorder\.addEventListener\('dataavailable', \(event\) => handleRecordedChunk\(event, recorderContext\)\)/,
  'late MediaRecorder chunks must remain bound to the turn that created them');
assert.match(pet,
  /recorder\.addEventListener\('stop', \(\) => finalizeRecordedAudio\(recorderContext\)/,
  'late recorder stop events must finalize only their own turn context');
assert.match(pet, /new Blob\(context\.blobs, \{ type: context\.mimeType \}\)/);
assert.match(pet,
  /queueAudioBlob\(completeRecording, true, context\.autoSend, \{[\s\S]{0,220}?requestId: context\.requestId,[\s\S]{0,220}?sequence: context\.sequence/,
  'queued audio must keep the recorder turn requestId and sequence stable across rapid restarts');
assert.doesNotMatch(pet, /new Blob\(pet\.recordedBlobs/,
  'shared pet.recordedBlobs can mix chunks from adjacent live turns');
assert.match(pet, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
assert.match(pet, /voice\/transcript/);
assert.match(pet, /voice\/chunk/);
assert.match(pet, /autoSend: Boolean\(autoSend\)/);
assert.match(pet, /finalizeLocalPcmCapture\(autoSend = !pet\.recognitionAvailable\)/);
assert.match(pet, /autoSend: shouldAutoSend/);
assert.equal((pet.match(/realtimeVoice:\s*[^,\n]+/g) || []).length, 2,
  'both browser-transcript and uploaded-audio live turns must mark the low-latency voice route');
assert.doesNotMatch(pet, /function\s+(beginPushToTalk|endPushToTalk|cancelPushToTalk)\s*\(/,
  'legacy hold-to-talk lifecycle must not remain in the DeepSeek Live client');
assert.match(pet, /function\s+stopDeepSeekLiveConversation\s*\(/);
assert.match(pet, /stopReplyAudioPlayback\(\{ clearSource: !audioId \|\| pet\.muted }\);\s*\n\s*if \(!audioId \|\| pet\.muted\)/s);
assert.match(pet, /visibilitychange/);
assert.match(pet, /beforeunload/);
assert.match(pet, /MutationObserver\(syncPetVisibility\)/);
assert.doesNotMatch(pet, /setInterval/);

for (const type of ['state', 'delta', 'tool', 'complete', 'error']) {
  assert.match(pet, new RegExp(`pet\\.ai\\.${type}`));
}
assert.match(app, /fe-monster-pet-event/);
assert.match(app, /fe-monster-pet-stream-ready/);
assert.match(app, /addEventListener\('community-heartbeat'[\s\S]*touchCommunityEventStream\(\)/,
  'browser-visible SSE heartbeat is not keeping the real-time stream alive');
assert.match(app, /fe-monster-pet-stream-state/,
  'community stream liveness is not shared with the desktop pet');
assert.match(pet, /fe-monster-pet-stream-state/,
  'desktop pet does not consume real-time stream liveness');
assert.doesNotMatch(pet, /\},\s*2_200\s*\)/,
  'desktop pet still waits 2.2 seconds for its initial state sync');
assert.match(pet, /detail\.historical && type === 'pet\.ai\.delta'/);
assert.match(pet, /detail\.historical && \(type === 'pet\.ai\.complete' \|\| type === 'pet\.ai\.error'\)/);
assert.match(pet, /scheduleServerReconcile/);
assert.match(pet, /item\?\.role === 'user' \|\| item\?\.role === 'assistant'/);
assert.match(pet, /activeSession\?\.state \|\| activeSession\?\.status/);
assert.match(pet, /eventSequenceByRequest/);
assert.match(pet, /handledActions/);
assert.match(pet, /pendingActions/);
assert.match(pet, /targetComputerId/);
assert.match(pet, /ensureMachineIdentity/);
assert.match(pet, /action-claim/);
assert.match(pet, /actionOutbox/);
assert.match(pet, /Array\.isArray\(status\.memory\)/);
assert.match(pet, /status\.memory\?\.count/);
assert.match(pet, /source\.sttProvider \?\? status\?\.sttProvider/);
assert.match(pet, /pet\.serverSttAvailable\s*=\s*\(source\.serverSttAvailable/);
assert.match(pet, /pet\.serverSttProvider === 'sherpa-onnx'/);
assert.match(pet, /serverSttAvailable/);
assert.match(pet, /请在服务器配置 STT/);
assert.match(pet, /pet\.discardRecording = true;\s*\n\s*stopVoiceConversation\(\)/);
assert.match(pet, /请先登录社区，登录后启用桌宠对话与专属记忆/);
assert.match(pet, /服务器尚未配置 DeepSeek/);

const commandNames = [
  'playback.play', 'playback.pause', 'playback.next', 'playback.previous',
  'playback.volume.set', 'music.search.play', 'music.play.similar',
  'scene.preset.set', 'navigation.open', 'lyrics.mode.set',
  'lyrics.offset.adjust', 'wallpaper.setting.set'
];
for (const command of commandNames) assert.ok(app.includes(`command: '${command}'`), `missing ${command}`);
assert.match(app, /FeMonsterPetActionBridge = Object\.freeze/);
assert.match(app, /registerPetAssistantAppCommands/);
assert.match(app, /name === 'control_app' \|\| name === 'execute_app_command'/);
assert.doesNotMatch(app, /PET_ASSISTANT_ACTIONS\.has\(name\)/);
assert.match(app, /petAssistantPresetCatalog/);
assert.match(app, /state\.sandbox\.presets/);
assert.match(app, /petAssistantKnownSongs/);
assert.doesNotMatch(pet, /\beval\s*\(|new Function\s*\(/);
assert.doesNotMatch(pet, /DEEPSEEK_API_KEY|Authorization\s*:\s*['"]?Bearer\s+|\bsk-[A-Za-z0-9_-]{16,}/i);

for (const path of [
  '/api/community/pet/status',
  '/api/community/pet/history',
  '/api/community/pet/sessions',
  '/api/community/pet/chat',
  '/api/community/pet/voice/transcript',
  '/api/community/pet/voice/chunk',
  '/api/community/pet/action-claim',
  '/api/community/pet/action-result'
]) {
  assert.ok(routes.includes(path), `missing Java proxy route ${path}`);
}
assert.match(routes, /path\.startsWith\("\/api\/community\/pet\/"\) \|\| "\/api\/community\/events"\.equals\(path\)[\s\S]*requireLocalPetAssistant\(exchange\)[\s\S]*handleOptions/);
assert.match(routes, /throw new SecurityException\("pet assistant requires the application origin"\)/);
assert.match(http, /fe\.cors\.same-origin/);
assert.match(http, /Cross-Origin-Resource-Policy", "same-origin"/);
assert.match(community, /computerId=.*machine\.computerId\(\)/s);
assert.match(community, /communitySignatureHeaders\("GET", signaturePath, petAccountSignatureScope\(feId\)\)/);
assert.match(community, /buildEventStreamRequest\(requestPath\)[\s\S]*catch \(IOException first\)[\s\S]*buildEventStreamRequest\(requestPath\)/);
assert.match(community, /communitySignatureHeaders\("GET", "\/api\/community\/events", ""\)/);
assert.match(community, /2_796_204/);
assert.match(community, /PET_ACTION_FIELDS/);
assert.match(community, /"action-claim", Set\.of\("sessionId", "actionId", "confirmed", "cancelled"\)/,
  'Java pet proxy strips local confirmation or cancellation claims');
assert.match(community, /"chat", Set\.of\([^\n]*"replyWithVoice", "voiceReply", "realtimeVoice", "clientContext"\)/,
  'Java pet proxy strips the request-level TTS mute flags');
assert.match(community, /"voice\/transcript", Set\.of\([\s\S]*?"replyWithVoice", "voiceReply", "realtimeVoice", "clientContext"[\s\S]*?\),/,
  'Java transcript proxy strips the request-level TTS mute flags');
assert.match(community, /"voice\/chunk", Set\.of\([\s\S]*?"replyWithVoice", "voiceReply", "realtimeVoice", "clientContext"[\s\S]*?\),/,
  'Java audio proxy strips the request-level TTS mute flags');
console.log(JSON.stringify({
  ok: true,
  states: requiredStates.length,
  commands: commandNames.length,
  transport: 'existing community SSE + guarded Java proxy',
  voice: 'continuous DeepSeek Live turns + VAD silence commit + optional server audio'
}, null, 2));
