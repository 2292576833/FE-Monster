import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');

function functionSource(name) {
  const start = app.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const body = app.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = body; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} is unbalanced`);
}

const allowlistBlock = /const CLIENT_PREFERENCES_LOCAL_KEYS = new Set\(\[([\s\S]*?)\]\);/.exec(app);
assert.ok(allowlistBlock, 'client preference collection must use an explicit allowlist');
const keys = [...allowlistBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
assert.ok(keys.includes('fe-monster-visual-settings-v1'));
assert.ok(
  keys.includes('fe-monster-soundscape-workshop-settings-v3'),
  'soundscape parameters must enter the restart-durable client preference journal'
);
assert.ok(keys.includes('fe-monster-wallpaper-prefs'), 'local wallpaper settings must remain restart-durable');
assert.ok(!keys.includes('fe-monster-pet-assistant-v1'));
assert.ok(!keys.includes('fe-monster-client-ai-service-v1'));

const stored = new Map([
  ['fe-monster-visual-settings-v1', '{"scenePreset":"heart"}'],
  ['fe-monster-wallpaper-prefs', '{"path":"C:/private/local-only.mp4"}'],
  ['fe-monster-pet-assistant-v1', '{"history":["private chat"]}'],
  ['fe-monster-client-ai-service-v1', '{"apiKey":"sk-private"}'],
  ['fe-monster-playback-intelligence:fe%3AA1B2C3D4', '{"habits":{"songs":{"private":1}}}'],
]);
const sandbox = {
  TextEncoder,
  CLIENT_PREFERENCES_LOCAL_KEYS: new Set(keys),
  CLIENT_PREFERENCES_MAX_VALUE_BYTES: 1024 * 1024,
  CLIENT_PREFERENCES_MAX_TOTAL_BYTES: 4 * 1024 * 1024,
  window: {
    localStorage: {
      getItem(key) { return stored.get(String(key)) ?? null; },
    },
  },
  result: null,
};
vm.createContext(sandbox);
vm.runInContext(`${functionSource('collectClientPreferences')}\nresult=collectClientPreferences();`, sandbox);
assert.equal(sandbox.result['fe-monster-visual-settings-v1'], '{"scenePreset":"heart"}');
assert.equal(sandbox.result['fe-monster-wallpaper-prefs'], '{"path":"C:/private/local-only.mp4"}');
assert.equal(Object.hasOwn(sandbox.result, 'fe-monster-pet-assistant-v1'), false);
assert.equal(Object.hasOwn(sandbox.result, 'fe-monster-client-ai-service-v1'), false);
assert.equal(Object.keys(sandbox.result).some((key) => key.startsWith('fe-monster-playback-intelligence:')), false);

assert.match(app, /async function syncClientPreferencesCloud\(/);
assert.match(app, /['"]\/api\/app\/preferences\/cloud-sync['"]/);
assert.match(app, /window\.addEventListener\(['"]online['"][\s\S]*?syncClientPreferencesCloud/);
assert.match(app, /window\.addEventListener\(['"]fe-monster-community-profile['"][\s\S]*?syncClientPreferencesCloud/);
assert.match(app, /localStorage\.getItem\(key\)\s*===\s*null[\s\S]*?localStorage\.setItem\(key, value\)/,
  'remote values must only fill missing browser preferences');
assert.doesNotMatch(app, /CLIENT_PREFERENCES_LOCAL_KEYS[\s\S]{0,800}(?:client-ai|pet-assistant|community-history-ledger|sandbox-draft)/,
  'privacy-sensitive state entered the local preference bridge allowlist');

console.log('Client preference cloud bridge passed');
