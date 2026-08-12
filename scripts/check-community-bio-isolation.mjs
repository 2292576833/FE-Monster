import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('web/app.js', 'utf8');
const start = source.indexOf('function loadCommunityBioRecords()');
const end = source.indexOf('function loadCommunityMessageDnd()', start);
assert.ok(start >= 0 && end > start, 'community bio identity module must remain inspectable');

const values = new Map();
const sandbox = {
  JSON,
  Object,
  Date: { now: () => 123456 },
  COMMUNITY_BIOS_KEY: 'fe-monster-community-bios-v2',
  COMMUNITY_BIO_IDENTITY_LIMIT: 12,
  state: {
    activeProvider: 'netease',
    community: { profileBio: '', profileBioIdentity: '' },
  },
  safeText(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim() || fallback;
  },
  window: {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

const accountA = { userId: 'account-a' };
const accountB = { userId: 'account-b' };
const identityA = sandbox.communityBioIdentity('http://127.0.0.1:3020/', 'netease', accountA, {});
const identityB = sandbox.communityBioIdentity('http://127.0.0.1:3020', 'netease', accountB, {});
const identityOtherServer = sandbox.communityBioIdentity('http://192.168.1.8:3020', 'netease', accountA, {});

assert.notEqual(identityA, identityB, 'different music accounts must not share a bio key');
assert.notEqual(identityA, identityOtherServer, 'different community servers must not share a bio key');

sandbox.syncCommunityBioIdentity(identityA, { bio: 'A profile' });
assert.equal(sandbox.state.community.profileBio, 'A profile');
sandbox.syncCommunityBioIdentity(identityB, { bio: '' });
assert.equal(
  sandbox.state.community.profileBio,
  '',
  'an explicitly empty remote bio must clear the previous account bio',
);
sandbox.saveCommunityBioLocal('B profile');
sandbox.syncCommunityBioIdentity(identityA, {});
assert.equal(sandbox.state.community.profileBio, 'A profile', 'account A bio was not restored from its own scope');
sandbox.syncCommunityBioIdentity(identityB, {});
assert.equal(sandbox.state.community.profileBio, 'B profile', 'account B bio was not restored from its own scope');

assert.match(
  source,
  /const identityChanged = nextBioIdentity !== state\.community\.profileBioIdentity;[\s\S]{0,220}?syncCommunityBioIdentity\(nextBioIdentity, profile\)/,
  'rendering must switch bio scope when the hydrated community identity changes',
);
assert.doesNotMatch(source, /fe-monster-community-bio-v1/,
  'the old unscoped bio storage key must not remain active');

console.log('Community bio identity isolation PASS');
