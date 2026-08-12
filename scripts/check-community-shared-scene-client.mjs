import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

assert.match(source, /function communitySharedSceneSnapshot\(\)/,
  'Client must create a bounded shared-scene snapshot.');
assert.match(source, /function normalizeCommunitySharedScene\(scene[\s\S]*?wallpaperUrl/u,
  'Client sanitizer must explicitly document that wallpaper URLs are excluded.');
assert.match(source, /function beginCommunitySceneOverride\(session[\s\S]*?listenSceneLocalSnapshot/u,
  'Joining must capture the local scene before applying the session scene.');
assert.match(source, /async function restoreCommunitySceneOverride[\s\S]*?listenSceneLocalSnapshot/u,
  'Leaving must restore the local scene snapshot.');
assert.match(source, /function communityScenePersistenceSuppressed\(\)/,
  'Session overrides must suppress persistent setting writes.');
assert.match(source, /async function applyCommunitySharedSceneSession[\s\S]*?incomingRevision <= state\.community\.listenSceneRevision/u,
  'Remote canonical scenes must ignore stale or duplicate revisions.');
assert.match(source, /listenSceneApplying = true[\s\S]*?listenSceneApplying = false/u,
  'Remote application must use an echo-suppression marker.');
assert.match(source, /\/api\/community\/listen\/scene/u,
  'Client must publish scene changes through the dedicated session endpoint.');
assert.match(source, /type === 'listen\.scene'[\s\S]*?applyCommunitySharedSceneSession/u,
  'Client must consume canonical scene events.');
assert.match(source, /body: JSON\.stringify\(\{ targetId: friendId, song: currentCommunitySongPayload\(\), scene: communitySharedSceneSnapshot\(\) \}\)/u,
  'Invites must carry the initial scene so the joining member enters it immediately.');
assert.match(source, /resetCommunityListenState[\s\S]*?restoreCommunitySceneOverride/u,
  'Ending together-listen must trigger local scene restoration.');

console.log('Community shared-scene client contract PASS');
