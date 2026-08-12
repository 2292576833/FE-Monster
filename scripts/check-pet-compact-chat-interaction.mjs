import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const runtime = readFileSync('web/pet-assistant.js', 'utf8');

function sectionBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `could not find ${startToken}`);
  return source.slice(start, end);
}

const runtimeSettings = sectionBetween(
  html,
  '<section class="runtime-settings-panel" id="runtimeSettingsPanel"',
  'class="top-search'
);
const petMarkup = sectionBetween(
  html,
  '<section class="pet-assistant" id="petAssistant"',
  '<section class="update-dialog"'
);

assert.match(runtimeSettings, /<details[^>]+id="petAssistantVoiceDisclosure"/,
  'pet voice preferences must live in their own runtime-settings disclosure');
for (const id of [
  'petAssistantVoiceSelect',
  'petAssistantVoicePlaybackToggle',
  'petAssistantShortcutCapture',
  'petAssistantShortcutValue',
  'petAssistantShortcutClear',
  'petAssistantShortcutHint'
]) {
  assert.match(runtimeSettings, new RegExp(`id="${id}"`), `${id} was not moved into runtime settings`);
  assert.doesNotMatch(petMarkup, new RegExp(`id="${id}"`), `${id} still lives inside the chat bubble`);
}

assert.match(petMarkup, /id="petAssistantPanel"[^>]+data-pet-text-bubble/,
  'the detached text composer must be identified as a compact text bubble');
for (const id of [
  'petAssistantMessages',
  'petAssistantInterim',
  'petAssistantConfirmation',
  'petAssistantForm',
  'petAssistantInput',
  'petAssistantSend'
]) {
  assert.match(petMarkup, new RegExp(`id="${id}"`), `${id} accessibility seam is missing`);
}
for (const id of [
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
  assert.doesNotMatch(petMarkup, new RegExp(`id="${id}"`), `${id} keeps the retired full-panel UI alive`);
}

const activationDelay = runtime.match(/const CHARACTER_ACTIVATION_DELAY_MS\s*=\s*(\d+)/)?.[1];
assert.ok(activationDelay, 'character activation delay is missing');
assert.ok(Number(activationDelay) >= 220 && Number(activationDelay) <= 280,
  'single/double activation delay must remain between 220ms and 280ms');
assert.match(runtime, /function scheduleCharacterSingleActivation\([\s\S]*?toggleDeepSeekLiveConversation\(\)/,
  'a single character activation must toggle DeepSeek live conversation');
assert.match(runtime, /function handleCharacterDoubleActivation\([\s\S]*?cancelCharacterActivation\(\)[\s\S]*?stopDeepSeekLiveConversation[\s\S]*?setPanelOpen/,
  'a double activation must cancel single-click work, stop live mode, then toggle text input');
assert.match(runtime, /function startDeepSeekLiveConversation\([\s\S]*?setPanelOpen\(false/,
  'starting live conversation must force the text bubble closed');
assert.match(runtime, /function syncNativeTextBubble\([\s\S]*?surface:\s*'text-bubble'[\s\S]*?bounds:[\s\S]*?radius:[\s\S]*?viewport:/,
  'native desktop hit testing must receive compact text-bubble geometry');

console.log(JSON.stringify({
  ok: true,
  activationDelayMs: Number(activationDelay),
  settingsLocation: 'runtimeSettingsPanel',
  singleClick: 'toggle-live',
  doubleClick: 'toggle-text-bubble',
  nativeSurface: 'text-bubble'
}, null, 2));
