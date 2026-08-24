import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const html = read('web/index.html');
const loader = read('web/runtime-module-loader.js');
const css = read('web/pet-assistant.css');
const pet = read('web/pet-assistant.js');

assert.match(loader, /pet-live-turn-controller\.js\?v=[^"\s]+[\s\S]{0,420}pet-live-playout\.js\?v=[^"\s]+[\s\S]{0,240}pet-live-stt-client\.js\?v=[^"\s]+[\s\S]{0,180}pet-assistant\.js\?v=[^"\s]+/,
  'the client must invalidate cached pre-streaming pet assistant scripts');
assert.match(html, /pet-assistant\.css\?v=[^"\s]+/,
  'the client must invalidate the retired full-panel desktop pet styles');

assert.match(html, /id="petAssistantCharacter"[^>]+aria-label="单击开始实时对话，双击打开文字输入"/);
assert.doesNotMatch(html, /id="petAssistantVoice"|id="petAssistantVoiceLabel"/,
  'the retired in-panel live voice button must not survive the compact interaction redesign');
assert.match(html, /桌宠语音[\s\S]{0,320}实时对话快捷键/);
assert.match(html, /id="petAssistantVoicePlaybackToggle"[^>]+type="checkbox"[^>]+checked/);
assert.match(html, /id="petAssistantShortcutCapture"[^>]+aria-pressed="false"/);
assert.match(html, /id="petAssistantShortcutValue"/);
assert.doesNotMatch(html, /按住说话|松开发送|按住按钮或快捷键说话/);
assert.doesNotMatch(css, /按住说话|松开发送/);
assert.doesNotMatch(pet, /按住说话|松开发送/);
assert.match(css, /data-voice-activity="speech"/);

for (const field of [
  'liveConversationActive',
  'liveAwaitingReply',
  'liveTurnSending',
  'liveRestartTimer'
]) {
  assert.match(pet, new RegExp(`\\b${field}\\b`), `missing DeepSeek Live state ${field}`);
}

for (const functionName of [
  'startDeepSeekLiveConversation',
  'stopDeepSeekLiveConversation',
  'scheduleDeepSeekLiveListening',
  'startDeepSeekLiveTurn',
  'finishDeepSeekLiveTurn',
  'toggleDeepSeekLiveConversation'
]) {
  assert.match(pet, new RegExp(`function\\s+${functionName}\\s*\\(`),
    `missing DeepSeek Live function ${functionName}`);
}

assert.match(pet, /const\s+LIVE_TURN_SILENCE_MS\s*=\s*[\d_]+/);
assert.match(pet, /function\s+activateCharacterSingle\s*\([\s\S]{0,300}?toggleDeepSeekLiveConversation\(\)/,
  'a single mascot activation must toggle continuous live conversation');
assert.match(pet, /elements\.character\?\.addEventListener\('click',\s*scheduleCharacterSingleActivation\)/,
  'the mascot must route clicks through the single/double activation gate');
assert.doesNotMatch(pet,
  /elements\.(?:voice|character)\??\.addEventListener\('(pointerdown|pointerup|pointercancel|lostpointercapture|keyup)'[\s\S]{0,300}?toggleDeepSeekLiveConversation/,
  'the mascot must not retain hold-to-talk pointer or key-release bindings');
assert.doesNotMatch(pet, /function\s+(beginPushToTalk|endPushToTalk)\s*\(/,
  'legacy hold-to-talk entry points must be removed');

assert.match(pet,
  /function\s+finishDeepSeekLiveTurn\s*\([\s\S]{0,3000}?liveTurnSending\s*=\s*true[\s\S]{0,3000}?stopVoiceConversation\s*\(\s*\{\s*send:\s*true,\s*reason\s*\}\s*\)/,
  'VAD-completed turns must be committed exactly through the existing voice send path');
assert.match(pet,
  /speechDetected[\s\S]{0,1800}?silenceMs[\s\S]{0,1800}?endpointSilenceMs[\s\S]{0,500}?finishDeepSeekLiveTurn/,
  'VAD must wait for real speech and then finish the turn after adaptive sustained silence');
assert.match(pet,
  /function\s+scheduleDeepSeekLiveListening\s*\([\s\S]{0,2200}?liveRestartTimer[\s\S]{0,2200}?startDeepSeekLiveTurn/,
  'DeepSeek Live must schedule listening again after each completed reply');
assert.match(pet,
  /function\s+applyCompleteEvent\s*\([\s\S]{0,3500}?scheduleDeepSeekLiveListening/,
  'a completed DeepSeek response must resume the continuous listening loop');
assert.match(pet,
  /elements\.audio\.addEventListener\('ended',[\s\S]{0,900}?scheduleDeepSeekLiveListening/,
  'voice playback completion must resume listening');
assert.match(pet,
  /elements\.audio\.addEventListener\('play',[\s\S]{0,500}?scheduleDeepSeekLiveListening\(0\)/,
  'voice playback must arm listening so the user can interrupt the spoken reply');
assert.match(pet,
  /function\s+interruptReplyForDeepSeekLive\s*\([\s\S]{0,1200}?stopReplyAudioPlayback\(\{ clearSource: true \}\)/,
  'confirmed user speech must interrupt the current spoken reply');
assert.match(pet,
  /function\s+interruptReplyForDeepSeekLive\s*\([\s\S]{0,1200}?replyAudioDrainPending[\s\S]{0,1200}?rememberCancelledLiveRequest/,
  'barge-in must cancel replies that are queued or loading, not only media already playing');
assert.match(pet,
  /function\s+applyDeltaEvent\s*\([\s\S]{0,1600}?liveAwaitingReply[\s\S]{0,700}?armReplyTextLeadGate/,
  'live text must be buffered even when its first delta arrives before the first audio event');
assert.match(pet,
  /elements\.audio\.addEventListener\('playing',[\s\S]{0,300}?releaseReplyTextLeadGate/,
  'the first live text may only be released at the audible media boundary');
assert.match(pet, /REPLY_AUDIO_START_TIMEOUT_MS/,
  'a stalled media play promise must have a bounded text-only recovery path');
assert.match(pet,
  /elements\.audio\.addEventListener\('error',[\s\S]{0,500}?replyAudioDrainPending\s*=\s*false[\s\S]{0,500}?playNextReplyAudioChunk/,
  'a failed streamed segment must release the queue and advance to the next segment');
assert.match(pet, /LIVE_BARGE_IN_MIN_SPEECH_MS/,
  'reply interruption needs a stricter speech gate than ordinary turn detection');
assert.match(pet, /type === 'pet\.ai\.audio'\) applyAudioEvent\(payload\)/,
  'sentence-level server audio events must enter the live playback queue');
assert.match(pet, /function\s+applyAudioEvent\s*\(/,
  'streamed speech chunks must enter a dedicated event handler');
assert.match(pet, /replyAudioQueue\.sort\(\(left, right\) => left\.audioSequence - right\.audioSequence\)/,
  'the compatibility audio queue must remain ordered by audioSequence');
assert.match(pet, /replyLivePlayout\.enqueue\(chunk\)/,
  'live speech chunks must enter the ordered AudioContext predecode timeline');
assert.match(pet,
  /function\s+applyCompleteEvent\s*\([\s\S]{0,3500}?audioSegments[\s\S]{0,800}?replyAudioCompletionSeen/,
  'the final text event must not replay or stop sentence-level streamed speech');
assert.match(pet,
  /thinking-cue|kind:\s*boundedString\(payload\.kind/,
  'thinking cues must remain typed audio events instead of being appended to answer text');
assert.match(pet,
  /function\s+rememberReplyAudioChunk[\s\S]{0,900}?chunk\.kind\s*!==\s*'content'[\s\S]{0,900}?contentSequences\.add\(sequence\)/,
  'only bounded, server-labelled content audio may enter the heard-content cursor');
assert.match(pet,
  /function\s+markReplyAudioEnded[\s\S]{0,700}?contentSequences\.has\(sequence\)[\s\S]{0,700}?endedContentSequences\.add\(sequence\)/,
  'ended playback may only acknowledge a content sequence already tracked for this request');
assert.match(pet,
  /function\s+replyPlaybackCancelPayload[\s\S]{0,1800}?activeKind\s*===\s*'content'[\s\S]{0,900}?playedAudioSequences[\s\S]{0,900}?activeAudioSequence[\s\S]{0,300}?playedMs/,
  'the cancel cursor must report only fully ended content plus observational active-content timing');
assert.match(pet,
  /function\s+cancelServerReplyRequest[\s\S]{0,900}?JSON\.stringify\(\{\s*sessionId:\s*session,\s*requestId:\s*id,\s*\.\.\.playback\s*\}\)/,
  'server cancellation must carry the playback cursor from trusted local media state');
assert.doesNotMatch(pet,
  /function\s+cancelServerReplyRequest[\s\S]{0,900}?JSON\.stringify\([^)]*\btext\s*:/,
  'server cancellation must never send client-authored assistant text');
assert.match(pet,
  /elements\.audio\.addEventListener\('error',[\s\S]{0,500}?markReplyAudioFailed\(pet\.replyAudioPlayingChunk\)[\s\S]{0,500}?stopReplyAudioPlayback/,
  'a media error must clear the active cursor before playback state is discarded');

assert.match(pet,
  /liveConversationShortcut:\s*normalizeStoredHotkey\(persisted\.liveConversationShortcut\)/,
  'the real-time conversation toggle shortcut must be restored from storage');
assert.match(pet, /liveConversationShortcut:\s*pet\.liveConversationShortcut/);
assert.match(pet, /event\.isComposing \|\| event\.defaultPrevented \|\| !hotkeyMatches\(event\)/);
assert.match(pet, /event\.preventDefault\(\);[\s\S]{0,100}?event\.stopImmediatePropagation\(\);[\s\S]{0,100}?if \(event\.repeat\) return;/,
  'the registered voice hotkey must be consumed before a focused textbox can insert it');
assert.match(pet, /document\.addEventListener\('keypress', blockShortcutTextEvent, true\)/);
assert.match(pet, /document\.addEventListener\('beforeinput', blockShortcutTextEvent, true\)/);
assert.match(pet, /document\.addEventListener\('input', blockShortcutTextEvent, true\)/);
assert.match(pet, /document\.addEventListener\('keydown',[\s\S]{0,900}?toggleDeepSeekLiveConversation/,
  'the saved hotkey must toggle DeepSeek Live on keydown');
assert.doesNotMatch(pet,
  /document\.addEventListener\('keyup',[\s\S]{0,500}?(stopDeepSeekLiveConversation|finishDeepSeekLiveTurn|stopVoiceConversation)/,
  'releasing the hotkey must not stop or send the conversation');
assert.match(pet, /isReservedHotkey/);
assert.match(pet, /event\.code === shortcut\.code/);

assert.match(pet, /echoCancellation:\s*true/);
assert.match(pet, /noiseSuppression:\s*true/);
assert.match(pet, /autoGainControl:\s*true/);
assert.match(pet, /recognition\.maxAlternatives\s*=\s*3/);
assert.match(pet, /bestRecognitionTranscript/);
assert.match(pet, /LOCAL_STT_VAD_PRE_ROLL_MS/);
assert.match(pet, /LOCAL_STT_VAD_POST_ROLL_MS/);
assert.match(pet, /updateVoiceActivityDetection/);
assert.match(pet, /capture\.noiseFloor/);
assert.match(pet, /speechStartFrame/);
assert.match(pet, /lastSpeechFrame/);

assert.match(pet, /muted:\s*persisted\.muted\s*===\s*true/);
assert.match(pet, /muted:\s*pet\.muted/);
assert.match(pet, /voicePlaybackToggle\.checked\s*=\s*!pet\.muted/);
assert.match(pet,
  /pet\.voiceTurnContext = \{[\s\S]{0,500}?replyWithVoice: !pet\.muted,[\s\S]{0,200}?liveGeneration:/,
  'each live turn must freeze the TTS playback preference when capture starts');
assert.match(pet,
  /function queueAudioBlob\([\s\S]{0,1400}?const upload = \{[\s\S]{0,1400}?replyWithVoice: context\?\.replyWithVoice !== undefined \? context\.replyWithVoice === true : !pet\.muted/,
  'the queued audio snapshot must own its replyWithVoice policy');
assert.match(pet,
  /function uploadAudioBlob\([\s\S]{0,1400}?replyWithVoice: upload\.replyWithVoice,[\s\S]{0,100}?voiceReply: upload\.replyWithVoice/,
  'an asynchronous audio upload must use its frozen TTS policy');
assert.match(pet,
  /function postTranscript\([\s\S]{0,1400}?replyWithVoice: delivery\.replyWithVoice,[\s\S]{0,100}?voiceReply: delivery\.replyWithVoice/,
  'an asynchronous transcript upload must use its frozen TTS policy');
assert.match(pet,
  /replyWithVoice: !pet\.muted,[\s\S]{0,100}?voiceReply: !pet\.muted/,
  'ordinary typed chat must still respect the current TTS playback switch');
assert.match(pet, /if \(!audioId \|\| pet\.muted\)/,
  'muted clients must not autoplay server audio');

console.log(JSON.stringify({
  ok: true,
  interaction: 'one click starts DeepSeek Live; another click stops it',
  turnTaking: 'speech-aware VAD sends, TTS supports barge-in, and listening remains continuous',
  shortcut: 'single keydown toggles without keyup-to-send',
  ttsPlayback: 'persisted client switch plus request-level suppression'
}, null, 2));
