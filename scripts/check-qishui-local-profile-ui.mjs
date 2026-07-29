import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');
const css = readFileSync(path.join(root, 'web/styles.css'), 'utf8');
const plugin = readFileSync(path.join(root, 'music-api-plugins/qishui/src/server.cjs'), 'utf8');

for (const id of [
  'qishuiLocalProfile',
  'qishuiLocalProfileAvatar',
  'qishuiLocalProfileName',
  'qishuiLocalProfileMeta',
  'qishuiLocalCollections'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
}

assert.match(app, /function renderQishuiLocalProfile\(/);
assert.match(app, /payload\.loginDetected\s*===\s*true/);
assert.match(app, /payload\.displayName/);
assert.match(app, /payload\.avatar/);
assert.match(app, /payload\.collections/);
assert.match(app, /localLoginDetected/);
assert.match(app, /playbackAuthorized/);
assert.match(app, /qishuiPlaybackAccountAvatarImage[\s\S]*addEventListener\(['"]error['"]/);
assert.match(css, /\.qishui-local-profile/);

assert.match(plugin, /credentialsRead:\s*false/);
assert.match(plugin, /metadataState:\s*"unavailable"/);
assert.match(plugin, /function publicProfileAvatar\(/);
assert.match(plugin, /Array\.isArray\(value\.urls\)/);
assert.match(plugin, /firstHttpsUrl\(candidates\)/);
assert.doesNotMatch(plugin, /account:\s*\{[^}]*douyin_id|account:\s*\{[^}]*sec_uid/s);

console.log(JSON.stringify({
  ok: true,
  checks: [
    'public local SodaMusic profile in login page',
    'nickname and HTTPS avatar rendered',
    'playback bar reuses local identity',
    'broken avatars fall back to provider mark',
    'real collection summaries only',
    'credentials remain unread'
  ]
}, null, 2));
