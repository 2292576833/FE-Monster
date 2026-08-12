import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const contextSource = read('web/pet-client-context.js');
const commandSource = read('web/app-command.js');
const petSource = read('web/pet-assistant.js');
const appSource = read('web/app.js');
const html = read('web/index.html');
const communitySource = read('src/community-proprietary/java/com/femonster/core/CommunityService.java');

class FixtureTarget {
  listeners = new Map();

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
    return true;
  }
}

class FixtureCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const audio = new FixtureTarget();
const petRoot = { hidden: false, dataset: { state: 'idle' } };
const document = new FixtureTarget();
document.hidden = false;
document.visibilityState = 'visible';
document.documentElement = { getAttribute: (name) => name === 'data-fe-client' ? 'desktop-pet' : '' };
document.getElementById = (id) => id === 'audio' ? audio : id === 'petAssistant' ? petRoot : null;
document.querySelector = () => audio;

const window = new FixtureTarget();
window.document = document;
window.CustomEvent = FixtureCustomEvent;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
window.FeMonsterPetActionBridge = {
  clientContextSnapshot() {
    return {
      page: { name: 'playback' },
      playback: {
        playing: true,
        positionSeconds: 42,
        song: { id: 'song-1', title: 'Warm Light', artist: 'FE' },
        queue: { length: 20, items: Array.from({ length: 20 }, (_, index) => ({ index, title: `Song ${index}` })) }
      },
      parameters: {
        total: 30,
        values: Array.from({ length: 30 }, (_, index) => ({ key: `visual-${index}`, value: index, available: true }))
      },
      lyrics: { activeText: 'the current lyric' },
      community: { loggedIn: true, friendCount: 3 },
      accounts: { activeProvider: 'netease' },
      settings: { playbackQuality: 'lossless' },
      ui: { dialogs: { community: true }, activeDialog: 'community' },
      achievements: { total: 12, unlocked: 4, equippedOrnamentId: 'first-song' },
      commands: { total: 20, categories: [{ id: 'music', count: 5 }] },
      runtime: { online: true, apiKey: 'must-not-leak' },
      localPath: 'C:\\Users\\fixture\\private.txt',
      password: 'must-not-leak',
      nested: {
        cookie: 'must-not-leak',
        harmless: 'Bearer should-not-leak-12345678',
        downloadUrl: 'https://example.invalid/file?access_token=must-not-leak'
      }
    };
  }
};
window.FeMonsterPetEmotionRuntime = {
  context: () => ({ mood: 4, energy: 3, deviceKey: 'must-not-leak' })
};
window.FeMonsterPetCompanionP2 = {
  status: () => ({ behavior: 'groove', reaction: '', playing: true, energy: 0.72 }),
  weeklySummary: () => ({ weekKey: '2026-08-03', songCount: 41, text: '这周听了41首，辛苦了。' })
};
window.FeMonsterNativePetBridge = {
  state: () => ({ supported: true, enabled: true, visible: true, bounds: { left: 100, top: 80, width: 300, height: 340 } })
};

vm.runInNewContext(contextSource, { window, Symbol, Object, Date, JSON }, { filename: 'pet-client-context.js' });
const bridge = window.FeMonsterPetClientContext;
assert.ok(bridge, 'client context bridge did not initialize');

const full = bridge.snapshot();
const serialized = JSON.stringify(full);
assert.equal(full.page.name, 'playback');
assert.equal(full.playback.positionSeconds, 42);
assert.equal(full.lyrics.activeText, 'the current lyric');
assert.equal(full.emotion.mood, 4);
assert.equal(full.emotion.energy, 3);
assert.equal(full.companion.status.behavior, 'groove');
assert.equal(full.companion.weekly.songCount, 41);
assert.equal(full.assistant.desktopMode, true);
assert.equal(full.assistant.desktop.bounds.left, 100);
assert.equal(full.ui.activeDialog, 'community');
assert.equal(full.achievements.unlocked, 4);
assert.equal(full.commands.categories[0].id, 'music');
assert.doesNotMatch(serialized, /must-not-leak|should-not-leak|password|cookie|apiKey|deviceKey/i,
  'client context exposed a credential-like key or raw secret value');
assert.doesNotMatch(serialized, /C:\\\\Users|private\.txt/i,
  'client context exposed a local filesystem path');

const compact = bridge.compact();
assert.ok(compact.playback.queue.items.length <= 12, 'compact context did not bound the queue');
assert.ok(compact.parameters.values.length <= 24, 'compact context did not bound parameter values');
assert.ok(JSON.stringify(compact).length <= 16_000, 'compact context exceeds the chat payload budget');

const fixtureSnapshot = window.FeMonsterPetActionBridge.clientContextSnapshot;
window.FeMonsterPetActionBridge.clientContextSnapshot = () => ({
  page: { name: 'playback' },
  playback: {
    playing: true,
    queue: { items: Array.from({ length: 100 }, (_, index) => ({ title: `${index}-${'x'.repeat(2_000)}` })) }
  },
  parameters: {
    total: 100,
    values: Array.from({ length: 100 }, (_, index) => ({ key: `key-${index}`, value: 'y'.repeat(2_000) }))
  },
  settings: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`setting${index}`, 'z'.repeat(2_000)]))
});
assert.ok(JSON.stringify(bridge.compact()).length <= 16_000,
  'oversized live state was not reduced to the chat context budget');
window.FeMonsterPetActionBridge.clientContextSnapshot = fixtureSnapshot;

let observed = null;
const unsubscribe = bridge.subscribe((context, meta) => { observed = { context, meta }; }, { immediate: false });
const revisionBeforeEvent = bridge.revision;
window.dispatchEvent(new FixtureCustomEvent('fe-monster-app-command-complete'));
await new Promise((resolve) => setTimeout(resolve, 15));
assert.ok(observed?.meta?.revision > 0, 'registered client events did not refresh subscribers');
assert.ok(bridge.revision > revisionBeforeEvent, 'public context revision did not advance after an event');
unsubscribe();

let progressSnapshotCalls = 0;
window.FeMonsterPetActionBridge.clientContextSnapshot = (...args) => {
  progressSnapshotCalls += 1;
  return fixtureSnapshot(...args);
};
const revisionBeforeProgressBurst = bridge.revision;
for (let index = 0; index < 4; index += 1) {
  window.dispatchEvent(new FixtureCustomEvent('fe-monster-playback-state', {
    detail: { event: 'progress', snapshot: { positionSeconds: 43 + index } }
  }));
}
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(bridge.revision, revisionBeforeProgressBurst,
  'progress playback events bypassed the 750 ms context throttle');
assert.equal(progressSnapshotCalls, 0,
  'progress playback events triggered redundant full client snapshots');
window.dispatchEvent(new FixtureCustomEvent('fe-monster-playback-state', {
  detail: { event: 'track-start', snapshot: { song: { id: 'song-2' } } }
}));
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(progressSnapshotCalls, 1,
  'non-progress playback events must still refresh client context immediately');
window.FeMonsterPetActionBridge.clientContextSnapshot = fixtureSnapshot;
bridge.destroy();

const commandEvents = [];
const commandWindow = {
  dispatchEvent(event) { commandEvents.push(event); }
};
vm.runInNewContext(commandSource, {
  window: commandWindow,
  CustomEvent: FixtureCustomEvent
}, { filename: 'app-command.js' });
const commands = commandWindow.FeMonsterAppCommands;
for (const definition of [
  { command: 'admin.dashboard.query', category: 'admin' },
  { command: 'system.theme.set', category: 'system' },
  { command: 'wallpaper.file.open', category: 'wallpaper' },
  { command: 'community.square.post', category: 'social' }
]) {
  commands.register({ ...definition, handler: () => ({ ok: true }) });
  assert.equal((await commands.execute(definition.command)).ok, true,
    `ordinary registered command ${definition.command} was not allowed by default`);
}
for (const definition of [
  { command: 'account.delete', category: 'account' },
  { command: 'fixture.shell.run', category: 'settings' },
  { command: 'fixture.file.write', category: 'settings' },
  { command: 'fixture.download.file', category: 'settings' },
  { command: 'fixture.token.query', category: 'read' },
  { command: 'fixture.api_key.query', category: 'read' }
]) {
  assert.throws(
    () => commands.register({ ...definition, handler() {} }),
    (error) => error?.code === 'denied_command',
    `protected command ${definition.command} escaped the explicit denylist`
  );
}
assert.equal(commands.capabilities().defaultPolicy, 'allow-registered');

commands.register({
  command: 'fixture.safe.result',
  category: 'read',
  handler: () => ({
    ok: true,
    token: 'must-not-leak',
    nested: { cookie: 'must-not-leak', url: 'https://example.invalid/?access_token=must-not-leak' }
  })
});
const sanitizedCommandResult = await commands.execute('fixture.safe.result');
assert.equal(sanitizedCommandResult.token, undefined);
assert.equal(sanitizedCommandResult.nested.cookie, undefined);
assert.equal(sanitizedCommandResult.nested.url, '[redacted]');

assert.doesNotMatch(contextSource, /setInterval\s*\(/, 'client context bridge introduced polling');
assert.match(contextSource, /timeupdate/);
assert.match(contextSource, /fe-monster-playback-state/);
assert.match(contextSource, /fe-monster-pet-companion-state/);
assert.match(contextSource, /fe-monster-pet-desktop-state/);
assert.match(contextSource, /fe-achievement-ornament-change/);
assert.match(appSource, /clientContextSnapshot:\s*petAssistantClientContextSnapshot/);
assert.match(appSource, /command:\s*'app\.context\.query'/);
assert.match(appSource, /command:\s*'ui\.controls\.query'/);
assert.match(appSource, /command:\s*'ui\.control\.click'/);
assert.match(appSource, /command:\s*'ui\.key\.press'/);
assert.match(appSource, /FeMonsterAppCommands\.resolve\(name\)\.command/);
assert.match(appSource, /function petAssistantClientContextId/,
  'local media paths are not normalized before entering pet context');
assert.match(petSource, /FeMonsterPetClientContext\?\.compact\?\.\(\)/);
assert.match(petSource, /includeClientContext:\s*true/);
const functionSource = (name, nextName) => {
  const start = petSource.indexOf(`function ${name}(`);
  const end = petSource.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `could not isolate ${name}`);
  return petSource.slice(start, end);
};
const uploadAudioBlobSource = functionSource('uploadAudioBlob', 'queueAudioBlob');
const queueAudioBlobSource = functionSource('queueAudioBlob', 'handleRecordedChunk');
assert.match(queueAudioBlobSource,
  /autoSend: Boolean\(finalChunk && \([\s\S]*?forceAutoSend === true[\s\S]*?!pet\.recognitionAvailable[\s\S]*?\)\)/,
  'queued live audio must snapshot the explicit auto-send decision or STT fallback');
assert.match(uploadAudioBlobSource,
  /const shouldAutoSend = Boolean\(finalChunk && upload\.autoSend\)/,
  'the asynchronous upload must use its immutable turn snapshot');
assert.match(uploadAudioBlobSource, /includeClientContext:\s*shouldAutoSend/);
assert.match(petSource, /includeClientContext:\s*Boolean\(finalTranscript\s*&&\s*autoSend\)/);
assert.match(petSource, /clientContextRelaySupported\s*=\s*false/,
  'old-server context-field fallback is missing');
assert.doesNotMatch(petSource, /payload\.requiresConfirmation\s*===\s*true/,
  'remote metadata can still force a redundant confirmation for registered commands');
assert.ok(
  html.indexOf('pet-emotion-runtime.js') < html.indexOf('pet-client-context.js')
    && html.indexOf('pet-client-context.js') < html.indexOf('pet-assistant.js'),
  'emotion/context/chat scripts are loaded in the wrong order'
);
assert.match(communitySource, /"chat", Set\.of\([^\n]*"clientContext"/,
  'Java relay strips chat client context');
assert.match(communitySource, /"voice\/transcript", Set\.of\([\s\S]*?"clientContext"[\s\S]*?\),/,
  'Java relay strips voice transcript client context');
assert.match(communitySource, /"voice\/chunk", Set\.of\([\s\S]*?"clientContext"[\s\S]*?\),/,
  'Java relay strips final audio client context');
assert.match(communitySource, /sanitizePetClientContext/);
assert.match(communitySource, /sensitivePetContextKey/);

console.log(JSON.stringify({
  ok: true,
  schema: compact.schema,
  commandPolicy: commands.capabilities().defaultPolicy,
  contextBytes: JSON.stringify(compact).length,
  queueItems: compact.playback.queue.items.length,
  parameterValues: compact.parameters.values.length,
  relayFallback: true
}, null, 2));
