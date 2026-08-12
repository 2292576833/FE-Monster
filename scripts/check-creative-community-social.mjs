import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(repo, relative), 'utf8');
const html = read('web/index.html');
const css = read('web/styles.css');
const blackGoldCss = read('web/black-gold-buttons.css');
const app = read('web/app.js');
const community = read('web/creative-community.js');
const apiRoutes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const service = read('src/community-proprietary/java/com/femonster/core/CommunityService.java');
const server = readFileSync(path.resolve(repo, '..', 'FE moster server', 'server.js'), 'utf8');

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{[\\s\\S]*?\\}`, 'g'))];
  assert.ok(matches.length, `missing CSS rule ${selector}`);
  return matches.at(-1)[0];
}

function cssRuleContaining(source, selector, expected) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{[\\s\\S]*?\\}`, 'g'))];
  const match = matches.find((candidate) => expected.test(candidate[0]));
  assert.ok(match, `missing expected ${selector} CSS declaration`);
  return match[0];
}

for (const id of [
  'communityProfileSquarePage',
  'communityProfileMarketPage',
  'communityProfileViewerPage',
  'communityMarketPublishForm',
  'communityMarketPublishAsset',
  'communityMarketPublishPreview',
  'communitySquareForm',
  'communityViewerAddFriend'
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
}

for (const type of ['wallpaper', 'character', 'cursor', 'trail', 'music']) {
  assert.match(html, new RegExp(`data-market-kind=["']${type}["']`), `missing market tab ${type}`);
}

assert.ok(
  html.indexOf('app.js?') < html.indexOf('creative-community.js?'),
  'creative community module must load after the app bridge'
);

for (const type of ['wallpaper', 'character', 'cursor', 'cursor-trail', 'music']) {
  assert.match(community, new RegExp(`["']?${type.replace('-', '\\-')}["']?\\s*:`), `missing work type ${type}`);
}

for (const route of [
  '/api/community/creative-market/uploads/init',
  '/api/creative-market/uploads/content',
  '/api/community/creative-market/works/publish',
  '/api/community/creative-market/works/like',
  '/api/community/creative-market/works/comment',
  '/api/community/creative-market/works/share',
  '/api/community/creative-market/works/use',
  '/api/community/square/messages',
  '/api/community/user'
]) {
  assert.ok(community.includes(route), `frontend route missing: ${route}`);
}

assert.doesNotMatch(community, /\.innerHTML\s*=|insertAdjacentHTML\s*\(|\beval\s*\(|new\s+Function\s*\(/);
assert.match(community, /trustedAssetUrl/);
assert.match(community, /segment === '\.' \|\| segment === '\.\.'/,
  'market asset paths do not reject dot-segment traversal');
assert.match(community, /textContent/);
assert.match(community, /make\(['"]article['"],\s*['"]community-square-message['"]\)/);
assert.match(community, /community-square-message-avatar glass-button-native/);
assert.match(community, /community-market-comment-avatar glass-button-native/);
assert.match(blackGoldCss, /:not\([\s\S]*?\.glass-button-native/);
assert.match(css, /\.community-square-message-avatar img\s*\{[\s\S]*?object-fit:\s*cover/);

const squareMessageRule = cssRuleContaining(css, '.community-square-message', /width:\s*fit-content/);
const squareAvatarRule = cssRuleContaining(css, '.community-square-message-avatar', /width:\s*30px/);
const squareCopyRule = cssRule(css, '.community-square-message-copy');
const squareNameRule = cssRule(css, '.community-square-message-copy strong');
const squareTimeRule = cssRule(css, '.community-square-message-copy time');
const squareBodyRule = cssRule(css, '.community-square-message-copy p');
const ownSquareMessageRule = cssRule(css, '.community-square-message.is-own');
assert.match(squareMessageRule, /width:\s*fit-content/);
assert.match(squareMessageRule, /max-width:\s*min\(78%,\s*520px\)/);
assert.match(squareMessageRule, /grid-template-columns:\s*30px\s+minmax\(0,\s*auto\)/);
assert.match(squareMessageRule, /justify-self:\s*start/);
assert.match(squareMessageRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.64\)/);
assert.match(squareMessageRule, /backdrop-filter:\s*blur\(14px\)/);
assert.match(squareMessageRule, /box-shadow:/);
assert.match(squareAvatarRule, /width:\s*30px/);
assert.match(squareAvatarRule, /height:\s*30px/);
assert.match(squareCopyRule, /gap:\s*2px/);
assert.match(squareNameRule, /color:\s*rgba\(21,\s*31,\s*40,\s*0\.92\)/);
assert.match(squareTimeRule, /font-size:\s*8px/);
assert.match(squareBodyRule, /font-size:\s*11px/);
assert.match(ownSquareMessageRule, /justify-self:\s*end/);
assert.match(ownSquareMessageRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);

for (const bridgeMethod of [
  'installCursor', 'prepareCursor', 'installWallpaper', 'installMusic', 'installTrail', 'addFriend'
]) {
  assert.match(app, new RegExp(`${bridgeMethod}\\s*:`), `bridge method missing: ${bridgeMethod}`);
}

assert.match(apiRoutes, /MAX_CREATIVE_MARKET_UPLOAD_BYTES\s*=\s*512L\s*\*\s*1024\s*\*\s*1024/);
assert.match(apiRoutes, /\/api\/creative-market\/uploads\/content/);
assert.match(service, /CREATIVE_MARKET_FIELDS/);
assert.match(service, /\/api\/creative-market\/uploads\//);
assert.match(service, /\/api\/community\/square\/messages/);

for (const capability of ['creativeMarket', 'creativeAssetStreaming', 'socialSquare']) {
  assert.match(server, new RegExp(`${capability}\\s*:\\s*true`), `server capability missing: ${capability}`);
}
assert.match(server, /function communityPublicProfile\s*\(/);
const publicProfile = server.slice(server.indexOf('function communityPublicProfile'), server.indexOf('function publicCommercialClient'));
for (const privateField of ['computerId:', 'computerIdSource:', 'installRoot:', 'clientAddress:', 'platformUserId:']) {
  assert.equal(publicProfile.includes(privateField), false, `public profile leaks ${privateField}`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  marketTypes: 5,
  marketMutations: 6,
  socialSquare: true,
  publicProfilePrivateFields: 0,
  uploadLimitMiB: 512
}, null, 2)}\n`);
