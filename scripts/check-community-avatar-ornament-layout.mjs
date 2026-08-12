import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync('web/styles.css', 'utf8');
const app = readFileSync('web/app.js', 'utf8');

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

const profileAvatar = ruleBody('.community-profile-avatar');
const ornament = ruleBody('.community-avatar-ornament');

assert.match(profileAvatar, /(?:^|;)\s*position\s*:\s*relative\s*(?:;|$)/,
  'profile avatar must establish the containing block for its absolute ornament');
assert.match(profileAvatar, /(?:^|;)\s*isolation\s*:\s*isolate\s*(?:;|$)/,
  'profile avatar must isolate the ornament stacking context');
assert.match(ornament, /(?:^|;)\s*position\s*:\s*absolute\s*(?:;|$)/);
assert.match(ornament, /(?:^|;)\s*inset\s*:\s*-3px\s*(?:;|$)/,
  'semantic ornament silhouettes need a small safe overhang around the avatar');
assert.match(
  app,
  /host\.appendChild\(decoration\)/,
  'avatar ornament is no longer mounted as a child of its avatar host',
);

console.log('Community avatar ornament layout contract PASS');
