import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const app = readFileSync('web/app.js', 'utf8');
const styles = readFileSync('web/styles.css', 'utf8');
const achievements = readFileSync('web/pixel-achievements.js', 'utf8');
const routes = readFileSync('src/main/java/com/femonster/api/ApiRoutes.java', 'utf8');
const communityClient = readFileSync(
  'src/main/java/com/femonster/community/CommunityClient.java',
  'utf8'
);

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} function is missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

const checks = {
  reportPageIsReachable:
    html.includes('id="communityProfileReportTab"')
    && html.includes('id="communityProfileReportPage"')
    && html.includes('id="communityReportButton"')
    && /\['self', 'nearby', 'report', 'market', 'square', 'mailbox', 'viewer', 'achievement', 'ornament'\]/.test(app),
  reportShowsLongestAndHistory:
    html.includes('id="communityListenReportLongestName"')
    && html.includes('id="communityListenReportList"')
    && /communityTogetherPartners\(\)/.test(app)
    && /formatCommunityListeningDuration\(longest\.totalMs\)/.test(app),
  reportPersistsAndMerges:
    app.includes('fe-monster-community-together-report-v1')
    && /function mergeCommunityTogetherReport/.test(app)
    && /function updateCommunityTogetherListeningClock/.test(app)
    && /sessionIds\.includes\(sessionId\)/.test(app),
  reportHasBackendEndpoint:
    routes.includes('"/api/community/listen/report"')
    && communityClient.includes('listenReport('),
  ornamentPageIsReachable:
    html.includes('id="communityProfileOrnamentTab"')
    && html.includes('id="communityProfileOrnamentPage"')
    && html.includes('id="communityOrnamentList"')
    && app.includes("setCommunityProfilePage('ornament')"),
  completedAchievementClaimsOrnament:
    /community-achievement-node\[data-achievement-id\]/.test(app)
    && /isUnlocked\?\.\(achievementId\)/.test(app)
    && /claimOrnament\?\.\(achievementId\)/.test(app),
  ornamentCanEquipAndUnequip:
    /data-ornament-action/.test(app)
    && /equipOrnament\(achievementId\)/.test(app)
    && /unequipOrnament/.test(app)
    && achievements.includes('getEquippedOrnament'),
  ornamentPersistsWithAchievementState:
    achievements.includes('ornaments: achievementState.ornaments')
    && achievements.includes("fe-achievement-ornament-change")
    && achievements.includes('mergeOrnaments('),
  ornamentSyncsToCommunityProfile:
    /avatarOrnament:\s*ornament \|\| \{\}/.test(app)
    && /scheduleCommunityAvatarOrnamentSync/.test(app)
    && communityClient.includes('Map<String, Object> avatarOrnament'),
  ornamentAppearsOnFriendAvatars:
    /applyCommunityAvatarOrnament\(avatar, communityFriendOrnament\(friend\)\)/.test(app)
    && styles.includes('.community-avatar-ornament'),
  friendRenderingUsesOnlyFriendScope:
    !/function renderCommunityFriends\([^)]*\)[\s\S]{0,1600}?bubble\.avatarOrnament/.test(app),
  everyProfilePageUsesOneTransitionRoute:
    functionBody(app, 'setCommunityProfilePage').includes("playCommunityEntrance(activePage, 'page')")
    && functionBody(app, 'setCommunityProfileOpen').includes(
      "playCommunityEntrance(els.communityProfilePanel, 'panel')"
    ),
  messageAndListenPanelsEnterOnce:
    /const wasHidden = els\.communityMessageDialog\.hidden/.test(
      functionBody(app, 'setCommunityMessageOpen')
    )
    && /const wasHidden = els\.listenMini\.hidden/.test(functionBody(app, 'showListenMini')),
  motionIsOneShotAndReduced:
    /if \(!element \|\| reducedMotion/.test(functionBody(app, 'playCommunityEntrance'))
    && /duration: kind === 'page' \? 190 : COMMUNITY_ENTRANCE_DURATION_MS/.test(
      functionBody(app, 'playCommunityEntrance')
    )
    && !/setInterval|requestAnimationFrame/.test(functionBody(app, 'playCommunityEntrance')),
  responsiveReportAndOrnaments:
    /@media \(max-width: 720px\)[\s\S]*?community-listen-report-totals/.test(styles)
    && /community-ornament-item[\s\S]*?grid-template-columns/.test(styles)
};

for (const [name, pass] of Object.entries(checks)) {
  assert.equal(Boolean(pass), true, `FAIL ${name}`);
  console.log(`PASS ${name}`);
}

console.log(`Community report, ornaments, and motion contract PASS (${Object.keys(checks).length}/${Object.keys(checks).length})`);
