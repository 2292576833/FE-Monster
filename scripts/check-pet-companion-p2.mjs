import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootPath = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(rootPath, 'web', 'pet-companion-p2.js'), 'utf8');
const css = readFileSync(path.join(rootPath, 'web', 'pet-companion-p2.css'), 'utf8');
const app = readFileSync(path.join(rootPath, 'web', 'app.js'), 'utf8');
const html = readFileSync(path.join(rootPath, 'web', 'index.html'), 'utf8');
const loader = readFileSync(path.join(rootPath, 'web', 'runtime-module-loader.js'), 'utf8');
const buildInstaller = readFileSync(path.join(rootPath, 'scripts', 'build-installer.ps1'), 'utf8');
const installScript = readFileSync(path.join(rootPath, 'scripts', 'install-fe-monster.ps1'), 'utf8');

function storageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function browserFixture(storage = storageFixture()) {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let immediateTimers = false;
  let bridgeSnapshot = { playing: false };
  const root = {
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } }
  };
  const speech = { textContent: '点我聊天' };
  const audio = { currentSrc: '', src: '' };
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const window = {
    document: {
      getElementById(id) {
        if (id === 'petAssistant') return root;
        if (id === 'petAssistantSpeech') return speech;
        if (id === 'audio') return audio;
        return null;
      }
    },
    localStorage: storage,
    CustomEvent,
    FeMonsterPetActionBridge: { snapshot: () => ({ ...bridgeSnapshot }) },
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      if (immediateTimers) Promise.resolve().then(callback);
      else timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source, { window, console, Date, Promise }, { filename: 'pet-companion-p2.js' });
  return {
    api: window.FeMonsterPetCompanionP2,
    root,
    speech,
    window,
    setBridgeSnapshot(snapshot) { bridgeSnapshot = { ...snapshot }; },
    enableImmediateTimers() { immediateTimers = true; }
  };
}

const sharedStorage = storageFixture();
const fixture = browserFixture(sharedStorage);
const api = fixture.api;
assert.equal(typeof api.update, 'function');
assert.equal(typeof api.weeklySummary, 'function');
assert.equal(typeof api.runNext, 'function');
assert.doesNotMatch(source, /setInterval\s*\(/, 'P2 status detection must stay event-driven');
assert.doesNotMatch(source, /dataset\.state\s*=/, 'P2 reactions must not overwrite the core assistant state machine');

api.update({ playing: true, song: { id: 'energetic' }, energy: .92, bass: .78, beat: .8 }, new Date(2026, 7, 5, 20, 0), 'track-start');
assert.equal(fixture.root.dataset.petBehavior, 'groove', 'high-energy playback should drive the groove behavior');
api.update({ playing: true, song: { id: 'late' }, energy: .2 }, new Date(2026, 7, 6, 2, 0), 'track-start');
assert.equal(fixture.root.dataset.petBehavior, 'night-yawn', 'late-night playback should drive the yawn behavior');
api.update({ playing: false, song: { id: 'late' } }, new Date(2026, 7, 6, 2, 1), 'pause');
assert.equal(fixture.root.dataset.petBehavior, '', 'paused playback should return the orthogonal behavior layer to rest');

const rapidSkipBase = new Date(2026, 7, 6, 3, 0).getTime();
api.noteSkip(rapidSkipBase);
api.noteSkip(rapidSkipBase + 2_000);
api.noteSkip(rapidSkipBase + 4_000);
assert.equal(fixture.root.dataset.petReaction, 'eye-roll', 'rapid skipping should trigger an eye-roll reaction');

const dedupeFixture = browserFixture();
const dedupeApi = dedupeFixture.api;
const dedupeBase = new Date(2026, 7, 6, 4, 0).getTime();
dedupeApi.update({ playing: true, song: { id: 'dedupe-a' } }, dedupeBase, 'track-start');
dedupeApi.update({ playing: true, song: { id: 'dedupe-a' } }, dedupeBase + 1_000, 'track-skip');
dedupeApi.update({ playing: true, song: { id: 'dedupe-b' } }, dedupeBase + 2_000, 'track-start');
dedupeApi.update({ playing: true, song: { id: 'dedupe-b' } }, dedupeBase + 4_000, 'track-skip');
dedupeApi.update({ playing: true, song: { id: 'dedupe-c' } }, dedupeBase + 5_000, 'track-start');
assert.equal(dedupeFixture.root.dataset.petReaction || '', '',
  'track-start must not double-count an explicitly reported skip');
dedupeApi.update({ playing: true, song: { id: 'dedupe-c' } }, dedupeBase + 7_000, 'track-skip');
assert.equal(dedupeFixture.root.dataset.petReaction, 'eye-roll',
  'three actual rapid skips should trigger an eye-roll reaction');

for (let index = 0; index < 39; index += 1) {
  api.update(
    { playing: true, song: { id: `week-${index}` }, energy: .12 },
    new Date(2026, 7, 6, 12, index % 60),
    'track-start'
  );
}
const summary = api.weeklySummary(new Date(2026, 7, 6, 21, 0));
assert.equal(summary.songCount, 41);
assert.equal(summary.text, '这周听了41首，最晚熬到凌晨2点，辛苦了。');
assert.equal(api.showWeeklySummary(new Date(2026, 7, 6, 21, 0)).text, summary.text);
assert.equal(fixture.speech.textContent, summary.text, 'the display interface should put the weekly line in the native-visible speech bubble');

const automaticSummaries = [];
fixture.window.addEventListener('fe-monster-pet-weekly-summary', (event) => automaticSummaries.push(event.detail));
api.update(
  { playing: true, song: { id: 'next-week' }, energy: .2 },
  new Date(2026, 7, 10, 9, 0),
  'track-start'
);
assert.equal(automaticSummaries.length, 1, 'the first playback in a new week should surface the missed weekly line');
assert.equal(automaticSummaries[0].text, '上周听了41首，最晚熬到凌晨2点，辛苦了。');
api.update(
  { playing: true, song: { id: 'next-week-2' }, energy: .2 },
  new Date(2026, 7, 10, 9, 5),
  'track-start'
);
assert.equal(automaticSummaries.length, 1, 'an automatic weekly summary must only appear once per week');
const beforeReloadCount = api.weeklySummary(new Date(2026, 7, 10, 9, 6)).songCount;
const reloadedFixture = browserFixture(sharedStorage);
reloadedFixture.api.update(
  { playing: true, song: { id: 'next-week-2' }, energy: .2 },
  new Date(2026, 7, 10, 9, 6),
  'initialize'
);
assert.equal(
  reloadedFixture.api.weeklySummary(new Date(2026, 7, 10, 9, 6)).songCount,
  beforeReloadCount,
  'restoring the same playing track must not double-count the weekly total'
);

const safeFallback = api.nextPolicy({
  playing: true,
  positionSeconds: 62,
  section: { type: 'chorus', startSeconds: 60, endSeconds: 66 }
});
assert.equal(safeFallback.delayMs, 0, 'chorus delay must not infer reliability when metadata is incomplete');

const explicitPolicy = api.nextPolicy({
  playing: true,
  positionSeconds: 62,
  section: { type: 'chorus', startSeconds: 60, endSeconds: 66, reliable: true }
});
assert.equal(explicitPolicy.delayMs, 4_000);
assert.equal(explicitPolicy.message, '听完这段再切。');

fixture.enableImmediateTimers();
let executions = 0;
const delayedResult = await api.runNext({
  source: 'pet-assistant',
  snapshot: {
    playing: true,
    positionSeconds: 62,
    section: { type: 'chorus', startSeconds: 60, endSeconds: 66, reliable: true }
  },
  execute: async () => {
    executions += 1;
    return { ok: true };
  }
});
assert.equal(executions, 1, 'an eligible delayed next command must still execute exactly once');
assert.equal(delayedResult.companion.delayed, true);

const fallbackResult = await api.runNext({
  source: 'pet-assistant',
  snapshot: { playing: true, positionSeconds: 20, section: null },
  execute: async () => ({ ok: true })
});
assert.equal(fallbackResult.companion.delayed, false, 'missing section metadata must execute immediately');

const changedTrackFixture = browserFixture();
changedTrackFixture.enableImmediateTimers();
changedTrackFixture.setBridgeSnapshot({ playing: true, song: { id: 'already-next' } });
let changedTrackExecutions = 0;
const alreadyChangedResult = await changedTrackFixture.api.runNext({
  source: 'pet-assistant',
  snapshot: {
    playing: true,
    song: { id: 'original' },
    positionSeconds: 62,
    section: { type: 'chorus', startSeconds: 60, endSeconds: 66, reliable: true }
  },
  execute: async () => {
    changedTrackExecutions += 1;
    return { ok: true };
  }
});
assert.equal(changedTrackExecutions, 0, 'a natural track change during the hold must not skip a second song');
assert.equal(alreadyChangedResult.companion.satisfiedByTrackChange, true);

for (const behavior of ['groove', 'night-yawn']) {
  assert.match(css, new RegExp(`data-pet-behavior=["']${behavior}["']`));
}
assert.match(css, /data-pet-reaction=["']eye-roll["']/);
assert.match(app, /function petAssistantRepeatedLyricSection\(/,
  'ordinary timed lyrics do not provide a production path for chorus detection');
assert.match(app, /source:\s*'repeated-lyric-sequence'/,
  'repeated lyric sections are not marked as a reliable chorus source');
for (const className of ['pet-assistant__particle-orb']) {
  assert.ok(
    html.includes(className),
    'P2 animation target is missing from the live mascot DOM: ' + className
  );
}
assert.match(app, /function petAssistantExplicitPlaybackSection\s*\(/);
assert.match(app, /FeMonsterPetCompanionP2[\s\S]{0,260}runNext/);
assert.match(app, /pet\.weekly\.summary\.query/);
assert.match(app, /pet\.weekly\.summary\.show/);
assert.ok(loader.indexOf('pet-assistant.js') < loader.indexOf('pet-companion-p2.js'),
  'the companion runtime must load after pet-assistant.js');
assert.match(html, /pet-companion-p2\.css/);
for (const required of ['web\\pet-companion-p2.js', 'web\\pet-companion-p2.css']) {
  assert.ok(buildInstaller.includes(required), `build integrity manifest is missing ${required}`);
  assert.ok(installScript.includes(required), `installer runtime verification is missing ${required}`);
}

console.log('pet companion P2 checks passed');
