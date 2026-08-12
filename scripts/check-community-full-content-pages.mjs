import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const creative = readFileSync(path.join(root, 'web', 'creative-community.js'), 'utf8');
const communityClient = readFileSync(path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'community', 'CommunityClient.java'), 'utf8');
const apiRoutes = readFileSync(path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'), 'utf8');
const communityService = readFileSync(path.join(root, 'src', 'community-proprietary', 'java', 'com', 'femonster', 'core', 'CommunityService.java'), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}

assert.match(html, /id="communityProfileSquareTab"[\s\S]*data-community-profile-page="square"/);
assert.match(html, /id="communityProfileMailboxTab"[\s\S]*data-community-profile-page="mailbox"/);
assert.match(html, /id="communityProfileMailboxPage"[\s\S]*id="communityMailboxList"/);
assert.match(html, /id="communityFriendRequests"[\s\S]*id="communityFriendRequestList"/);

assert.match(css, /\.community-message-panel\s*\{[\s\S]*?width:\s*min\(1120px,[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
assert.match(css, /\.community-profile-panel:has\(#communityProfileSquarePage:not\(\[hidden\]\)\)[\s\S]*?height:\s*min\(760px/);
assert.match(css, /communityProfileSquarePage:not\(\[hidden\]\)[\s\S]*?\.community-square-feed\s*\{[\s\S]*?max-height:\s*none/);
assert.match(css, /\.community-card:not\(\.is-collapsed\) \.community-friends-list\s*\{[\s\S]*?overflow-y:\s*auto/);
assert.match(css, /\.community-profile-panel:has\(#communityProfileMailboxPage:not\(\[hidden\]\)\)[\s\S]*?height:\s*min\(760px/);
assert.match(css, /\.community-mailbox-list\s*\{[\s\S]*?overflow-y:\s*auto/);
assert.match(css, /\.community-mailbox-mail\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, 0\.62\)/);

const addFriend = functionSource(app, 'addCommunityFriend');
assert.match(addFriend, /\/api\/community\/friends\/add/);
assert.match(addFriend, /好友申请已发送/);
assert.doesNotMatch(addFriend, /unlockAppAchievement\('first-friend'/);

const respond = functionSource(app, 'respondCommunityFriendRequest');
assert.match(respond, /\/api\/community\/friends\/respond/);
assert.match(respond, /accepted:\s*!!accepted/);
assert.match(respond, /unlockAppAchievement\('first-friend'/);

const mailboxClaim = functionSource(app, 'claimCommunityMailboxAttachment');
assert.match(mailboxClaim, /\/api\/community\/mailbox\/claim/);
assert.match(mailboxClaim, /attachmentId:\s*rewardId/);
assert.match(mailboxClaim, /appliedAttachments\.add\(communityMailboxAttachmentKey\(id, rewardId\)\)/);
assert.match(mailboxClaim, /attachment\.claimed = attachment\.claimed \|\|/);
assert.doesNotMatch(mailboxClaim, /eval\s*\(|new Function|location\s*=|window\.open/);
assert.match(app, /source\.attachmentId \|\| source\.id/);
assert.match(app, /source\.body \|\| source\.bodyPreview/);
assert.match(app, /claimedAttachmentIds/);
assert.match(app, /'live-wallpaper'/);
assert.match(app, /'login-character'/);
assert.match(app, /credits:/);
assert.match(app, /vip:/);
assert.match(creative, /async function installWorkById[\s\S]*?\^\[A-Za-z0-9\._~-\]/);
assert.match(communityClient, /Map<String, Object> mailbox\(/);
assert.match(communityClient, /Map<String, Object> markMailboxRead\(/);
assert.match(communityClient, /Map<String, Object> claimMailboxReward\(/);
assert.match(apiRoutes, /case "\/api\/community\/mailbox" -> handleCommunityMailbox/);
assert.match(apiRoutes, /case "\/api\/community\/mailbox\/read" -> handleCommunityMailboxRead/);
assert.match(apiRoutes, /case "\/api\/community\/mailbox\/claim" -> handleCommunityMailboxClaim/);
assert.match(communityService, /appendQuery\(path, "computerId", machine\.computerId\(\)\);[\s\S]*?appendQuery\(path, "computerIdSource", machine\.computerIdSource\(\)\);/);
assert.match(communityService, /communitySignatureHeaders\("GET", signaturePath, signedContent\)/);

console.log(JSON.stringify({
  ok: true,
  checks: 37,
  community: {
    fullMessagePage: true,
    fullSquarePage: true,
    independentFriendScroll: true,
    confirmedFriendRequests: true,
    safeMailbox: true
  }
}, null, 2));
