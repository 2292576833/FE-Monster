import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const app = read('web/app.js');
const creative = read('web/creative-community.js');
const identity = read('web/fe-identity-card.js');
const index = read('web/index.html');
const styles = read('web/styles.css');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const client = read('src/main/java/com/femonster/community/CommunityClient.java');
const service = read('src/community-proprietary/java/com/femonster/core/CommunityService.java');

assert.match(index, /id="communityViewerIdentityCard"/, 'friend profile is missing the identity-card action');
assert.match(app, /dataset\.communityAction\s*=\s*['"]identity-card['"]/, 'friend list does not expose an identity-card action');
assert.match(app, /\/api\/community\/friends\/identity-card/, 'client does not use the friend-only identity-card endpoint');
assert.match(app, /identityCard\.showExternal/, 'friend card does not open in the identity-card stage');
assert.match(creative, /viewerIdentityCard/, 'profile viewer does not bind the identity-card action');
assert.match(creative, /openFriendIdentityCard/, 'profile viewer does not delegate friend-card display');
assert.match(identity, /showExternal/, 'identity-card runtime has no read-only external-card display API');
assert.match(styles, /\.community-friend-actions\s*\{[\s\S]*?repeat\(4,/,
  'friend action layout does not reserve a fourth identity-card action');

assert.match(routes, /case "\/api\/community\/friends\/identity-card" -> handleCommunityFriendIdentityCard/,
  'Java proxy does not route friend identity cards');
assert.match(client, /friendIdentityCard\(/, 'CommunityClient lacks the friend identity-card contract');
assert.match(service, /\/api\/community\/friends\/identity-card/, 'CommunityService does not call the friend identity-card endpoint');

console.log('Community friend identity-card UI contract: OK');
