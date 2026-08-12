import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function setActiveProvider(');
const end = app.indexOf('\nfunction renderLoginStatus(', start);

assert.notEqual(start, -1, 'setActiveProvider is missing');
assert.notEqual(end, -1, 'setActiveProvider boundary is missing');

const switchProvider = app.slice(start, end);
assert.match(
  switchProvider,
  /activateInteractiveBackend\(nextProvider\)\.finally\(\(\) => \{/,
  'switching provider must start or recover that provider sidecar before reading account data'
);
assert.match(
  switchProvider,
  /activateInteractiveBackend\(nextProvider\)[\s\S]*?refreshLoginStatus\(nextProvider\)[\s\S]*?scheduleUserPlaylistsRefresh\(0\)/,
  'account and playlist refresh must run after provider activation finishes'
);

console.log('Provider switch sidecar activation contract PASS');
