import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const emotionSource = readFileSync(path.join(root, 'web', 'pet-emotion-runtime.js'), 'utf8');
const playbackSource = readFileSync(path.join(root, 'web', 'playback-intelligence.js'), 'utf8');
const commandSource = readFileSync(path.join(root, 'web', 'app-command.js'), 'utf8');
const assistantSource = readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');

function storageFixture() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function eventWindow(storage = storageFixture()) {
  const listeners = new Map();
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  return {
    localStorage: storage,
    CustomEvent,
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }
  };
}

const browserStorage = storageFixture();
const browserWindow = eventWindow(browserStorage);
vm.runInNewContext(emotionSource, { window: browserWindow }, { filename: 'pet-emotion-runtime.js' });

assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.create, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.snapshot, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.context, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.noteUserInteraction, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.applyConversationEmotion, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.setDailyLimit, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.setProactiveSettings, 'function');
assert.equal(typeof browserWindow.FeMonsterPetEmotionRuntime.probeProactive, 'function');
assert.doesNotMatch(emotionSource, /setInterval\s*\(/, 'emotion runtime must remain event-driven');
assert.match(
  assistantSource,
  /appendMessage\('user', message\);\s*notePetUserInteraction\('text'\);/,
  'text chat should record the user-interaction clock'
);
assert.match(
  assistantSource,
  /if \(shouldAutoSend\) notePetUserInteraction\('voice'\);/,
  'server-only STT should record the final voice interaction'
);
assert.match(
  assistantSource,
  /proactiveContext:[\s\S]*recentAssistantUtterances/,
  'the assistant should submit bounded trigger context for server-side proactive generation'
);
for (const cannedReply of ['还不睡', '回来了', '我陪你听着', '这段有点上头', '这首还挺适合现在']) {
  assert.doesNotMatch(emotionSource, new RegExp(cannedReply), 'the proactive runtime must not contain a reply pool');
}

let heartbeatNow = new Date(2026, 7, 5, 9, 0, 0).getTime();
const heartbeatTimers = [];
const heartbeatEvents = [];
const heartbeatWindow = eventWindow(storageFixture());
heartbeatWindow.setTimeout = (callback, delay) => {
  heartbeatTimers.push({ callback, delay });
  return heartbeatTimers.length;
};
heartbeatWindow.addEventListener('fe-monster-pet-proactive', (event) => heartbeatEvents.push(event.detail));
class HeartbeatDate extends Date {
  constructor(value) { super(value === undefined ? heartbeatNow : value); }
  static now() { return heartbeatNow; }
}
const heartbeatMath = Object.create(Math);
heartbeatMath.random = () => 0;
vm.runInNewContext(emotionSource, {
  window: heartbeatWindow,
  Date: HeartbeatDate,
  Math: heartbeatMath
}, { filename: 'pet-emotion-runtime-heartbeat.js' });
assert.equal(heartbeatTimers.length, 1, 'the singleton runtime should schedule a low-frequency proactive heartbeat');
assert.ok(heartbeatTimers[0].delay >= 4 * 60_000, 'the proactive heartbeat must not poll aggressively');
heartbeatNow += 8 * 60_000;
heartbeatTimers.shift().callback();
assert.equal(heartbeatEvents[0]?.type, 'companion-check-in', 'the scheduled heartbeat must be able to start a model-generated conversation');
assert.equal(heartbeatEvents[0]?.text, undefined, 'the scheduled heartbeat must never contain a canned reply');

let now = new Date(2026, 7, 5, 10, 0, 0).getTime();
let programState = {
  song: { id: 'signal', name: 'Signal', artist: 'FE' },
  playing: false,
  positionSeconds: 0,
  durationSeconds: 240,
  progress: 0,
  queueIndex: 0,
  queueLength: 12,
  volume: 62,
  preset: 'sonic',
  page: 'playback'
};
const proactive = [];
const runtimeStorage = storageFixture();
const runtime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => now,
  random: () => 0,
  storage: runtimeStorage,
  storageKey: 'fixture-emotion',
  getProgramState: () => ({ ...programState }),
  onProactive: (message) => proactive.push(message)
});

assert.equal(runtime.snapshot().playback.song.id, programState.song.id);
assert.equal(runtime.snapshot().playback.preset, 'sonic');
assert.equal(runtime.snapshot().playback.page, 'playback');
assert.equal(runtime.snapshot().playback.volume, 62);
assert.equal(runtime.snapshot().mood, 3);
assert.equal(runtime.snapshot().energy, 3);
assert.ok(runtime.snapshot().mood >= 1 && runtime.snapshot().mood <= 5);
assert.ok(runtime.snapshot().energy >= 1 && runtime.snapshot().energy <= 5);
assert.equal(runtime.snapshot().sevenEmotions.primary, 'joy');
assert.equal(runtime.snapshot().sevenEmotions.intensity, 0.4);
assert.equal(runtime.snapshot().sevenEmotions.secondary, null);
assert.equal(runtime.snapshot().replyLength, 'short');
assert.equal(runtime.context().executionPolicy, 'always-execute-valid-actions');
assert.equal(runtime.context().affectsCommandExecution, false);
assert.equal(runtime.context().sevenEmotions.primary, 'joy');
assert.equal(runtime.context().sevenEmotions.intensity, 0.4);
assert.equal(runtime.context().sevenEmotions.secondary, null);
assert.equal(runtime.context().sevenEmotions.source, 'client-playback-session');

let conversationProgramState = { ...programState };
const conversationRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => now,
  storage: storageFixture(),
  storageKey: 'fixture-conversation-emotion',
  getProgramState: () => ({ ...conversationProgramState })
});
const angerTurn = conversationRuntime.applyConversationEmotion({
  sessionId: 'emotion-session',
  requestId: 'emotion-turn-1',
  turnSequence: 1,
  source: 'user-text',
  sevenEmotion: {
    primary: { key: 'anger', intensity: 0.91 },
    secondary: [{ key: 'fear', intensity: 0.32 }],
    confidence: 0.94
  }
});
assert.equal(angerTurn.sevenEmotions.primary, 'anger');
assert.equal(angerTurn.sevenEmotions.secondary, 'fear');
assert.equal(angerTurn.sevenEmotions.intensity, 0.91);
assert.equal(angerTurn.sevenEmotions.source, 'server-user-text');
assert.equal(angerTurn.conversation.requestId, 'emotion-turn-1');
assert.equal(angerTurn.mood, 2);
assert.equal(angerTurn.energy, 5);

conversationProgramState = { ...conversationProgramState, playing: true };
conversationRuntime.notifyPlayback('play', conversationProgramState);
assert.equal(conversationRuntime.snapshot().sevenEmotions.primary, 'anger',
  'playback-derived default joy must not overwrite the current user-content emotion');

const desireTurn = conversationRuntime.applyConversationEmotion({
  sessionId: 'emotion-session',
  requestId: 'emotion-turn-2',
  turnSequence: 2,
  source: 'voice-transcript-final',
  sevenEmotion: {
    primary: { key: 'desire', intensity: 0.78 },
    secondary: [],
    confidence: 0.9
  }
});
assert.equal(desireTurn.sevenEmotions.primary, 'desire',
  'the next user turn must replace, not accumulate, the prior emotion');
assert.equal(desireTurn.sevenEmotions.source, 'server-voice-transcript-final');

conversationRuntime.applyConversationEmotion({
  sessionId: 'emotion-session',
  requestId: 'emotion-turn-stale',
  turnSequence: 1,
  source: 'assistant-reply',
  sevenEmotion: { primary: { key: 'joy', intensity: 1 } }
});
assert.equal(conversationRuntime.snapshot().sevenEmotions.primary, 'desire',
  'a stale/assistant completion must not replace the latest user-driven turn emotion');

const newSessionTurn = conversationRuntime.applyConversationEmotion({
  sessionId: 'emotion-session-new',
  requestId: 'emotion-new-session-turn-1',
  conversationEmotionSequence: 1,
  source: 'user-text',
  sevenEmotion: { primary: { key: 'love', intensity: 0.74 } }
});
assert.equal(newSessionTurn.sevenEmotions.primary, 'love',
  'a new current session may restart its server turn sequence at one');
conversationRuntime.applyConversationEmotion({
  sessionId: 'emotion-session',
  requestId: 'emotion-old-session-late',
  conversationEmotionSequence: 99,
  source: 'user-text',
  sevenEmotion: { primary: { key: 'anger', intensity: 1 } }
});
assert.equal(conversationRuntime.snapshot().sevenEmotions.primary, 'love',
  'an event from a retired session must not retake the visible pet state');

assert.equal(runtime.noteUserInteraction({ source: 'text' }), null, 'the first observed interaction is not a return');
now += 2 * 60 * 60 * 1_000 + 1;
const returned = runtime.noteUserInteraction({ source: 'text' });
assert.equal(returned?.type, 'return-greeting');
assert.equal(returned?.text, undefined);
assert.equal(proactive.at(-1)?.text, undefined);
assert.equal(returned?.emotion?.responseStyle?.startsWith('aquarius-'), true);
assert.equal(returned?.emotion?.replyLength, 'short');
assert.deepEqual(
  Object.keys(returned).sort(),
  ['createdAt', 'emotion', 'playback', 'source', 'type', 'variationKey'].sort(),
  'proactive events must contain context only, never client-authored natural language'
);

programState = { ...programState, playing: true };
runtime.notifyPlayback('play', programState);
for (let index = 1; index <= 180; index += 1) {
  now += 10_000;
  programState = {
    ...programState,
    positionSeconds: index * 10,
    durationSeconds: 3_600,
    progress: index * 10 / 3_600
  };
  runtime.notifyPlayback('progress', programState);
}
assert.ok(runtime.snapshot().mood >= 4, 'sustained listening should lift mood');
assert.ok(runtime.snapshot().drivers.playbackMinutes >= 29, 'playback duration must drive emotion');
assert.equal(runtime.context().sevenEmotions.primary, 'joy');
assert.equal(runtime.context().sevenEmotions.secondary, 'love');

for (let index = 0; index < 6; index += 1) {
  now += 10_000;
  runtime.notifyPlayback('track-skip', programState);
}
const restless = runtime.snapshot();
assert.equal(restless.drivers.recentSkips, 6, 'rapid skips must be measured in a rolling window');
assert.ok(restless.mood < 4, 'rapid skipping should lower mood from the sustained-listening high');
assert.ok(restless.energy >= 3, 'rapid skipping should read as restless energy rather than sleepiness');
assert.equal(restless.sevenEmotions.primary, 'disgust');
assert.equal(restless.sevenEmotions.secondary, 'desire');

const lateStorage = storageFixture();
const lateProactive = [];
let lateNow = new Date(2026, 7, 6, 1, 5, 0).getTime();
const lateRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => lateNow,
  random: () => 0,
  storage: lateStorage,
  storageKey: 'fixture-late',
  getProgramState: () => ({ ...programState, playing: true }),
  onProactive: (message) => lateProactive.push(message)
});
lateRuntime.notifyPlayback('play', { ...programState, playing: true });
lateRuntime.notifyPlayback('progress', { ...programState, playing: true, positionSeconds: 15 });
assert.equal(lateProactive.filter((item) => item.type === 'late-night').length, 1);
assert.equal(lateProactive[0].text, undefined);
assert.equal(lateProactive[0].playback.playing, true);
assert.ok(lateRuntime.snapshot().energy <= 3, 'late-night playback should reduce energy');
assert.equal(lateRuntime.context().sevenEmotions.primary, 'desire');
assert.equal(lateRuntime.context().sevenEmotions.secondary, 'sorrow');

lateRuntime.setDailyLimit(1);
lateNow += 2 * 60 * 60 * 1_000 + 1;
const overBudget = lateRuntime.noteUserInteraction({ source: 'voice' });
assert.equal(overBudget?.type, 'return-greeting', 'the default daily limit is a soft budget, not an absolute gate');
assert.equal(lateRuntime.snapshot().proactive.usedToday, 2);
lateRuntime.setProactiveSettings({ quietMode: true, minimumCooldownMinutes: 1 });
lateNow += 2 * 60 * 60 * 1_000 + 1;
assert.equal(
  lateRuntime.noteUserInteraction({ source: 'voice' }),
  null,
  'quiet mode must silence all proactive triggers'
);
assert.equal(lateRuntime.snapshot().proactive.dailyLimit, 1);
assert.equal(lateRuntime.snapshot().proactive.usedToday, 2);
assert.equal(lateRuntime.snapshot().proactive.quietMode, true);

const restoredLateRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => lateNow,
  storage: lateStorage,
  storageKey: 'fixture-late',
  getProgramState: () => ({ ...programState, playing: false })
});
assert.equal(restoredLateRuntime.snapshot().proactive.dailyLimit, 1, 'the adjustable cap should persist');
assert.equal(restoredLateRuntime.snapshot().proactive.usedToday, 2, 'the daily count should survive a reload');
assert.equal(restoredLateRuntime.snapshot().proactive.quietMode, true, 'quiet mode should survive a reload');
restoredLateRuntime.setProactiveSettings({ quietMode: false, hardDailyLimit: true });
lateNow += 2 * 60 * 60 * 1_000 + 1;
assert.equal(
  restoredLateRuntime.noteUserInteraction({ source: 'text' }),
  null,
  'users who opt into a hard daily limit must get an absolute gate'
);

const spontaneousMessages = [];
const spontaneousRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => new Date(2026, 7, 6, 14, 0, 0).getTime(),
  random: () => 0,
  storage: storageFixture(),
  storageKey: 'fixture-spontaneous',
  getProgramState: () => ({ ...programState, playing: true }),
  onProactive: (message) => spontaneousMessages.push(message)
});
spontaneousRuntime.setProactiveSettings({ spontaneity: 0.5, minimumCooldownMinutes: 1 });
spontaneousRuntime.notifyPlayback('track-start', { ...programState, playing: true });
spontaneousRuntime.notifyPlayback('track-complete', { ...programState, playing: false });
assert.equal(spontaneousMessages.length, 1, 'low-probability spontaneous chat must still respect the cooldown');
assert.equal(spontaneousMessages[0].type, 'spontaneous');

const idleProbeMessages = [];
let idleProbeNow = new Date(2026, 7, 6, 15, 0, 0).getTime();
const idleProbeRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => idleProbeNow,
  random: () => 0,
  storage: storageFixture(),
  storageKey: 'fixture-idle-probe',
  getProgramState: () => ({ ...programState, playing: false }),
  onProactive: (message) => idleProbeMessages.push(message)
});
idleProbeRuntime.setProactiveSettings({ spontaneity: 0.5, minimumCooldownMinutes: 1 });
assert.equal(idleProbeRuntime.probeProactive(), null, 'a fresh interaction window must remain quiet');
idleProbeNow += 8 * 60_000;
const idleProbe = idleProbeRuntime.probeProactive();
assert.equal(idleProbe?.type, 'companion-check-in', 'the low-frequency heartbeat should let the pet start a conversation without playback events');
assert.equal(idleProbe?.text, undefined, 'heartbeat triggers must carry context, not a canned client sentence');
assert.equal(idleProbeMessages.length, 1);

const suddenMessages = [];
let suddenNow = new Date(2026, 7, 6, 16, 0, 0).getTime();
let suddenState = { ...programState, playing: true, positionSeconds: 0 };
const suddenRuntime = browserWindow.FeMonsterPetEmotionRuntime.create({
  now: () => suddenNow,
  random: () => 0,
  storage: storageFixture(),
  storageKey: 'fixture-sudden',
  getProgramState: () => ({ ...suddenState }),
  onProactive: (message) => suddenMessages.push(message)
});
suddenRuntime.setProactiveSettings({ spontaneity: 0.5, minimumCooldownMinutes: 1 });
suddenRuntime.notifyPlayback('play', suddenState);
suddenNow += 31_000;
suddenState = { ...suddenState, positionSeconds: 31 };
suddenRuntime.notifyPlayback('progress', suddenState);
assert.equal(suddenMessages.length, 1, 'continuous playback should permit a sparse surprise message without a track change');
assert.equal(suddenMessages[0].source, 'playback-progress');

const playbackEvents = [];
const emotionChanges = [];
const playbackWindow = eventWindow();
playbackWindow.addEventListener('fe-monster-playback-state', (event) => playbackEvents.push(event.detail));
playbackWindow.addEventListener('fe-monster-pet-emotion-change', (event) => emotionChanges.push(event.detail));
vm.runInNewContext(playbackSource, { window: playbackWindow }, { filename: 'playback-intelligence.js' });
vm.runInNewContext(emotionSource, { window: playbackWindow }, { filename: 'pet-emotion-runtime.js' });
const playback = playbackWindow.FeMonsterPlaybackIntelligence.create({
  player: { snapshot: () => ({ ...programState, playing: true }) }
});
await playback.notify('play', { song: programState.song });
assert.equal(playbackEvents.length, 1, 'the authoritative playback notify boundary should publish live state');
assert.equal(playbackEvents[0].event, 'play');
assert.equal(playbackEvents[0].snapshot.playing, true);
assert.equal(playbackEvents[0].snapshot.song.id, 'signal');
assert.equal(emotionChanges.length, 1, 'live playback state should publish a deduplicated emotion change');
assert.equal(emotionChanges[0].snapshot.playback.playing, true);
assert.equal(emotionChanges[0].context.affectsCommandExecution, false);

const commandWindow = eventWindow();
vm.runInNewContext(commandSource, {
  window: commandWindow,
  CustomEvent: commandWindow.CustomEvent
}, { filename: 'app-command.js' });
vm.runInNewContext(emotionSource, { window: commandWindow }, { filename: 'pet-emotion-runtime.js' });
const queriedState = await commandWindow.FeMonsterAppCommands.execute('pet.state.query');
assert.equal(queriedState.mood, 3);
assert.ok(queriedState.energy >= 1 && queriedState.energy <= 5, 'queried energy must remain in the public 1-5 range');
const adjusted = await commandWindow.FeMonsterAppCommands.execute('pet.proactive.settings.set', {
  dailyLimit: 5,
  spontaneity: 0.6,
  minimumCooldownMinutes: 20,
  quietMode: true
});
assert.equal(adjusted.dailyLimit, 5);
assert.equal(adjusted.spontaneity, 0.6);
assert.equal(adjusted.minimumCooldownMinutes, 20);
assert.equal(adjusted.quietMode, true);

console.log('pet emotion runtime checks passed');
