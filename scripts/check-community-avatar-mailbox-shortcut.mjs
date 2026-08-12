import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const css = `${readFileSync('web/styles.css', 'utf8')}\n${readFileSync('web/fe-identity-card.css', 'utf8')}`;
const app = readFileSync('web/app.js', 'utf8');

const headStart = html.indexOf('<div class="community-card__head">');
const headEnd = html.indexOf('</div>', headStart);
assert.ok(headStart >= 0 && headEnd > headStart, 'community header must exist');
const head = html.slice(headStart, headEnd + 6);

assert.match(head, /class="community-avatar-stack"[\s\S]*?id="communityAvatar"[\s\S]*?id="communityMailboxShortcut"/,
  'the mailbox shortcut must sit directly below the community avatar');
assert.match(head, /id="communityMailboxShortcut"[^>]*aria-controls="communityProfileMailboxPage"/,
  'the avatar mailbox shortcut must expose its controlled page');
assert.equal((html.match(/id="communityMailboxUnreadDot"/g) || []).length, 1,
  'the unread indicator must remain unique');
assert.match(css, /\.community-avatar-stack\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-rows:/,
  'avatar and mailbox shortcut need a deliberate two-row layout');
assert.match(css, /\.community-mailbox-shortcut\s*\{[\s\S]*?min-height:\s*0[\s\S]*?background:\s*transparent/,
  'the mailbox shortcut must be a compact control without a bottom panel');
assert.match(css, /\.community-card\.is-collapsed \.community-mailbox-shortcut\s*\{[\s\S]*?display:\s*none/,
  'the avatar mailbox shortcut must disappear in the collapsed community card');
assert.match(app, /communityMailboxShortcut:\s*\$\('#communityMailboxShortcut'\)/,
  'the mailbox shortcut must be bound by the community runtime');
assert.match(app, /communityMailboxShortcut[\s\S]*?setCommunityProfileOpen\(true,\s*'mailbox'\)/,
  'clicking the shortcut must open the mailbox page directly');

console.log('Community avatar mailbox shortcut contract PASS');
