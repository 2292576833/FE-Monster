import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/check-live-community-client-connection.mjs', 'utf8');

assert.match(source, /api\/app\/interactive\/activate/,
  'live community check must activate interactive provider services first');
assert.match(source, /method:\s*["']POST["']/,
  'interactive activation must use POST');
assert.match(source, /JSON\.stringify\(\{\s*provider\s*\}\)/,
  'interactive activation must name the identity provider to recover');
assert.match(source, /providerRecoveryDeadlineMs/,
  'provider recovery must have an explicit bounded deadline');
assert.match(source, /api\/music-apis\/status\?provider=/,
  'live check must observe provider lifecycle recovery');
assert.match(source, /failureDomain/,
  'live result must distinguish transport failure from provider identity failure');
assert.match(source, /community-transport|provider-identity/,
  'live result does not expose separate community/provider failure domains');
assert.match(source, /community-protocol/,
  'live result must distinguish an old server protocol from a transport outage');
assert.match(source, /communityProtocolV2[\s\S]{0,180}?protocolVersion/,
  'live diagnostics must verify the deployed server protocol version');
assert.match(source, /avatarOrnamentCapability[\s\S]{0,180}?capabilities\?\.avatarOrnament/,
  'live diagnostics must verify deployed ornament support');
assert.match(source, /identityRegistered:\s*Boolean\(communityState\?\.profile\?\.feId\)/,
  'community registration must be proven by the hydrated FE identity');
assert.doesNotMatch(source, /clientVisibleToCommunityServer/,
  'SSE/commercial connections must not be treated as identity registration');
assert.match(source, /realtimeStreamConnected/,
  'live diagnostics must report realtime stream state separately');

console.log('Live community client diagnostic contract PASS');
