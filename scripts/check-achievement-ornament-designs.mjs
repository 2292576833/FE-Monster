import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('web/app.js', 'utf8');
const styles = readFileSync('web/styles.css', 'utf8');

const expected = [
  ['first-block', 'brick-crown'],
  ['gap-runner', 'leap-arc'],
  ['monster-stomp', 'stomp-teeth'],
  ['all-platforms', 'four-gates'],
  ['world-peace', 'peace-laurel'],
  ['first-play', 'play-wave'],
  ['track-finished', 'finish-flag'],
  ['first-favorite', 'heart-pocket'],
  ['local-import', 'import-folder'],
  ['lyric-council', 'lyric-stack'],
  ['manual-sync', 'sync-clock'],
  ['visual-first', 'visual-prism'],
  ['scene-smith', 'orbit-forge'],
  ['bio-written', 'profile-scroll'],
  ['first-friend', 'linked-friends'],
  ['listen-together', 'shared-headphones'],
  ['first-danmaku', 'danmaku-bubble'],
  ['completionist', 'legend-crown'],
  ['secret-left', 'secret-left-door']
];

const designFrames = [];
for (const [achievementId, frame] of expected) {
  assert.match(
    app,
    new RegExp(`['"]${achievementId}['"]:\\s*Object\\.freeze\\(\\{\\s*frame:\\s*['"]${frame}['"]`),
    `${achievementId} is missing its dedicated ornament design`,
  );
  assert.ok(
    styles.includes(`[data-ornament-design="${frame}"]`),
    `${frame} has no dedicated silhouette CSS`,
  );
  assert.ok(
    styles.includes(`[data-ornament-design="${frame}"] .community-avatar-ornament__sigil`),
    `${frame} has no dedicated inner sigil`,
  );
  designFrames.push(frame);
}

assert.equal(new Set(designFrames).size, expected.length,
  'every achievement must map to a unique ornament silhouette');
assert.match(app, /COMMUNITY_ACHIEVEMENT_ORNAMENT_FALLBACK/,
  'unknown future achievements need a safe local fallback');
assert.match(app, /sigil\.className = 'community-avatar-ornament__sigil'/,
  'ornaments must mount their independent semantic sigil');
assert.doesNotMatch(app, /function communityOrnamentVariant|hash % 6/,
  'ornaments must not fall back to hashed generic rings');
assert.doesNotMatch(app, /drawOrnamentIcon|community-avatar-ornament__icon/,
  'avatar ornaments must not embed the existing achievement pixel icon');
assert.match(app, /applyCommunityAvatarOrnament\(avatar, bubble\.avatarOrnament\)/,
  'friend listening notifications must show the same ornament as other community avatars');
assert.match(styles, /\.has-avatar-ornament\s*\{[^}]*overflow:\s*visible\s*!important/s,
  'special silhouettes must not be clipped by circular avatar hosts');

console.log(`Achievement-specific avatar ornament designs PASS (${expected.length}/${expected.length})`);
