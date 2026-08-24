import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootPath = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(rootPath, 'web', 'pet-product-tour.js'), 'utf8');
const css = readFileSync(path.join(rootPath, 'web', 'pet-product-tour.css'), 'utf8');
const html = readFileSync(path.join(rootPath, 'web', 'index.html'), 'utf8');
const loader = readFileSync(path.join(rootPath, 'web', 'runtime-module-loader.js'), 'utf8');
const app = readFileSync(path.join(rootPath, 'web', 'app.js'), 'utf8');
const pet = readFileSync(path.join(rootPath, 'web', 'pet-assistant.js'), 'utf8');
const buildInstaller = readFileSync(path.join(rootPath, 'scripts', 'build-installer.ps1'), 'utf8');
const installScript = readFileSync(path.join(rootPath, 'scripts', 'install-fe-monster.ps1'), 'utf8');
const installerContract = readFileSync(path.join(rootPath, 'scripts', 'check-windows-installer-contract.ps1'), 'utf8');

const listeners = new Map();
const storage = new Map();
const documentListeners = new Map();
const window = {
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  location: { search: '' },
  matchMedia: () => ({ matches: false }),
  addEventListener(type, listener) {
    const group = listeners.get(type) || [];
    group.push(listener);
    listeners.set(type, group);
  },
  removeEventListener() {},
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout
};
const document = {
  readyState: 'loading',
  hidden: false,
  documentElement: { getAttribute: () => '' },
  addEventListener(type, listener) { documentListeners.set(type, listener); },
  removeEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; }
};

vm.runInNewContext(source, {
  window,
  document,
  console,
  Date,
  JSON,
  Math,
  Object,
  Promise,
  setTimeout,
  clearTimeout,
  URLSearchParams
}, { filename: 'pet-product-tour.js' });

const api = window.FeMonsterProductTour;
assert.ok(api, 'product tour must expose a small public API');
assert.equal(api.steps.length, 8, 'the automatic walkthrough must stay focused at eight core steps');
assert.equal(typeof api.start, 'function');
assert.equal(typeof api.stop, 'function');
assert.equal(typeof api.replay, 'function');
assert.equal(typeof api.shouldAutoStart, 'function');

const now = Date.parse('2026-08-11T10:00:00+08:00');
assert.equal(api.shouldAutoStart({
  loggedIn: true,
  hasCommunityIdentity: true,
  isNewRegistration: true,
  profile: { feId: '12345678' }
}, now), true, 'an explicit new registration must qualify');
assert.equal(api.shouldAutoStart({
  loggedIn: true,
  hasCommunityIdentity: true,
  profile: { feId: '12345678', registeredAt: new Date(now - 5 * 60_000).toISOString() }
}, now), true, 'a freshly registered FE profile must qualify');
assert.equal(api.shouldAutoStart({
  loggedIn: true,
  hasCommunityIdentity: true,
  profile: { feId: '12345678', registeredAt: new Date(now - 48 * 60 * 60_000).toISOString() }
}, now), false, 'an established FE profile must not be surprised by an automatic tour');
storage.set(api.storageKey('resume-user'), JSON.stringify({
  version: 1,
  status: 'running',
  step: 4,
  updatedAt: new Date(now - 60 * 60_000).toISOString()
}));
assert.equal(api.shouldAutoStart({
  loggedIn: true,
  hasCommunityIdentity: true,
  profile: { feId: 'resume-user', registeredAt: new Date(now - 48 * 60 * 60_000).toISOString() }
}, now), true, 'an interrupted new-user tour must resume from its local marker');
assert.notEqual(api.storageKey('12345678'), api.storageKey('87654321'),
  'tour completion must be isolated by FE ID');

const allowedClickedTargets = new Set([
  '#communityRailButton',
  '#diyButton',
  '#diyPresetButton',
  '#diyTextModeButton',
  '#diyWallpaperModeButton',
  '#runtimeSettingsButton'
]);
for (const step of api.steps) {
  assert.match(step.text, /[\u3400-\u9fff]/, `${step.id} needs a Chinese explanation`);
  if (step.click) {
    assert.ok(allowedClickedTargets.has(step.target), `${step.target} is not a safe navigation target`);
  }
}

assert.match(html, /href="pet-product-tour\.css\?v=[^"]+"/,
  'tour stylesheet must be versioned in the production page');
assert.match(loader, /pet-product-tour\.js\?v=[^"\s]+/,
  'tour runtime must be versioned in the runtime module loader');
assert.ok(loader.indexOf('pet-assistant.js') < loader.indexOf('pet-product-tour.js'),
  'tour must load after the pet bubble API');
assert.match(html, /id="petProductTourReplay"[^>]*>[^<]*重新演示/,
  'runtime settings need an explicit replay control');
assert.match(app, /new CustomEvent\('fe-monster-community-profile'/,
  'community rendering must emit the shared profile signal');
assert.match(app, /registeredAt/,
  'the shared profile signal must retain the registration timestamp');
assert.match(pet, /showBubble:\s*showProactiveBubble/,
  'the tour must use the real desktop-pet speech bubble');
assert.match(source, /is-pet-tour-target/,
  'the pet click path must visibly identify every target');
assert.match(source, /pet-product-tour__click-ripple/,
  'the pet click path needs a visible click ripple');
assert.match(source,
  /started\.then\(\(outcome\)[\s\S]*?outcome\?\.status === 'fallback'[\s\S]*?dispatchNarration\('fallback'/,
  'text-only narration start outcomes must stay fallback instead of reporting audible playback');
assert.match(source,
  /handle\.finished\.then\(\(outcome\)[\s\S]*?outcome\?\.status === 'fallback'[\s\S]*?dispatchNarration\('fallback'/,
  'text-only narration completion outcomes must stay fallback instead of reporting ended speech');
assert.match(source, /prefers-reduced-motion:\s*reduce/,
  'runtime timing must honor reduced-motion preferences');
assert.match(pet, /\/api\/community\/pet\/narrate/,
  'tour narration must prefer the authenticated server TTS path so the selected voice is audible');
assert.doesNotMatch(source, /fetch\s*\(|\.submit\s*\(|\.requestSubmit\s*\(/,
  'the walkthrough controller itself must remain local and non-destructive');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'tour visuals need a reduced-motion fallback');
assert.match(css, /:focus-visible/,
  'tour controls need keyboard-visible focus');

for (const required of ['web\\pet-product-tour.js', 'web\\pet-product-tour.css']) {
  assert.ok(buildInstaller.includes(required), `build integrity manifest is missing ${required}`);
  assert.ok(installScript.includes(required), `installer verification is missing ${required}`);
  assert.ok(installerContract.includes(required), `installer contract is missing ${required}`);
}

console.log('Pet product tour checks passed');
