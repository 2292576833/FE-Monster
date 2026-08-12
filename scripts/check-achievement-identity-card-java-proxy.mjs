import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const api = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
const client = readFileSync(path.join(root, 'src/main/java/com/femonster/community/CommunityClient.java'), 'utf8');
const service = readFileSync(path.join(root, 'src/community-proprietary/java/com/femonster/core/CommunityService.java'), 'utf8');

assert.match(client, /Map<String, Object>\s+claimAchievementReward\s*\(/,
  'the open Java boundary does not expose achievement identity-card claiming');
assert.match(client, /Map<String, Object>\s+submitAchievementEvidence\s*\(/,
  'the open Java boundary does not expose offline achievement evidence submission');
assert.match(service, /post\("\/api\/community\/achievements\/claim", request\)/,
  'the signed Java community client does not forward reward claims');
assert.match(service, /post\("\/api\/community\/achievements\/evidence", withDeviceBinding\(request\)\)/,
  'the signed Java community client does not forward device-bound offline evidence');
assert.match(service, /body\.put\("upstreamStatus", response\.statusCode\(\)\)/,
  'the Java proxy does not preserve the upstream HTTP status needed to classify offline evidence retries');
assert.match(service, /request\.put\("achievementId", boundedToken\(achievementId, 80, "achievement id"\)\)/,
  'the Java client does not bound the achievement id before signing it');
assert.match(api, /case "\/api\/community\/achievements\/claim" -> \{[\s\S]*?requireSameOriginClientPreferences\(exchange\);[\s\S]*?handleCommunityAchievementRewardClaim/,
  'the local desktop API does not allow the achievement claim route');
assert.match(api, /case "\/api\/community\/achievements\/evidence" -> \{[\s\S]*?requireSameOriginClientPreferences\(exchange\);[\s\S]*?handleCommunityAchievementEvidence/,
  'the local desktop API does not allow the achievement evidence route');
assert.match(api, /case "\/api\/community\/achievements" -> \{[\s\S]*?achievementSnapshot\(path, query\)/,
  'the local desktop API does not expose the authoritative challenge catalog GET route');
assert.match(api, /java\.util\.List\.of\("challenges", "identityCardRewards"\)/,
  'the local achievement snapshot drops the server challenge/reward catalog');
assert.match(api, /context\.community\.claimAchievementReward\([\s\S]*?SimpleJson\.asString\(root\.get\("achievementId"\), ""\)/,
  'the local route does not derive the account from the active provider before claiming');
assert.match(api, /context\.community\.submitAchievementEvidence\([\s\S]*?SimpleJson\.asMap\(root\.get\("event"\)\)/,
  'the local evidence route does not forward a bounded event for the active account');

console.log('Achievement identity-card Java proxy contract PASS');
