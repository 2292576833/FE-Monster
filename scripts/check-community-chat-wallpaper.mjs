import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const creative = readFileSync(path.join(root, 'web', 'creative-community.js'), 'utf8');
const serverFile = path.resolve(root, '..', 'FE moster server', 'server.js');
const server = existsSync(serverFile) ? readFileSync(serverFile, 'utf8') : '';

function functionSource(source, name, nextName = '') {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  return source.slice(start, end > start ? end : start + 12_000);
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{[\\s\\S]*?\\}`));
  assert.ok(match, `Missing CSS rule ${selector}`);
  return match[0];
}

const messagePanelStart = html.indexOf('id="communityMessagePanel"');
const messagePanelEnd = html.indexOf('id="communityMessageBubbles"', messagePanelStart);
const messageStage = html.indexOf('id="communityMessageStage"');
const wallpaperSurface = html.indexOf('id="communityMessageWallpaperSurface"');
const messageStream = html.indexOf('id="communityMessageList"');
assert.ok(messagePanelStart >= 0 && messagePanelEnd > messagePanelStart, 'Message panel structure is missing');
assert.ok(
  messageStage > messagePanelStart
    && wallpaperSurface > messageStage
    && messageStream > wallpaperSurface
    && messageStream < messagePanelEnd,
  'Chat wallpaper must stay inside the message content stage'
);

for (const id of [
  'communityMessageBackgroundButton',
  'communityMessageBackgroundMenu',
  'communityMessageBackgroundChoices',
  'communityMessageWallpaperImage',
  'communityMessageWallpaperVideo',
  'communityMessageWallpaperWebFrame'
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing #${id}`);
  assert.match(app, new RegExp(`${id}:\\s*\\$\\('#${id}'\\)`), `Missing DOM binding for #${id}`);
}

assert.match(css, /\.community-message-stage\s*\{[\s\S]*?isolation:\s*isolate/);
assert.match(css, /\.community-message-wallpaper\s*\{[\s\S]*?pointer-events:\s*none/);
assert.match(css, /\.community-message-stage\.is-wallpaper[\s\S]*?community-message-bubble/);
assert.match(css, /\.community-message-panel,[\s\S]*?border:\s*1px solid/);

const messageStageRule = cssRule(css, '.community-message-stage');
const messageBubbleRule = cssRule(css, '.community-message-bubble');
const ownMessageBubbleRule = cssRule(css, '.community-message-bubble.is-mine');
const wallpaperMessageBubbleRule = cssRule(css, '.community-message-stage.is-wallpaper .community-message-bubble');
const emptyMessageRule = cssRule(css, '.community-message-stage .community-empty');
const wallpaperEmptyMessageRule = cssRule(css, '.community-message-stage.is-wallpaper .community-empty');
assert.match(messageStageRule, /background:\s*#EAEEF2\s*;/i);
assert.match(messageBubbleRule, /width:\s*fit-content/);
assert.match(messageBubbleRule, /max-width:\s*min\(76%,\s*460px\)/);
assert.match(messageBubbleRule, /justify-self:\s*start/);
assert.match(messageBubbleRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.62\)/);
assert.match(messageBubbleRule, /backdrop-filter:\s*blur\(16px\)/);
assert.match(messageBubbleRule, /box-shadow:/);
assert.match(ownMessageBubbleRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.8\)/);
assert.doesNotMatch(ownMessageBubbleRule, /linear-gradient/);
assert.match(wallpaperMessageBubbleRule, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.72\)/);
assert.match(emptyMessageRule, /color:\s*rgba\(42,\s*55,\s*66,\s*0\.64\)/);
assert.match(wallpaperEmptyMessageRule, /color:\s*rgba\(255,\s*255,\s*255,\s*0\.84\)/);

assert.match(app, /COMMUNITY_MESSAGE_BACKGROUND_KEY\s*=\s*['"]fe-monster-community-chat-wallpaper-v1['"]/);
assert.match(app, /messageBackground:\s*loadCommunityMessageBackground\(\)/);
assert.match(app, /function\s+saveCommunityMessageBackground[\s\S]*localStorage\.setItem/);
assert.match(
  functionSource(app, 'saveCommunityMessageBackground', 'normalizeCommunityEventCursor'),
  /scheduleClientPreferencesSync\(\)/
);
assert.match(app, /wallpaper\?\.source\s*!==\s*['"]wallpaper-engine['"]/);
assert.match(app, /communityMessageBackgroundLiveRefreshActive\(\)/);
assert.match(app, /function\s+refreshSceneWallpaperCatalog[\s\S]*syncCommunityMessageBackground\(\)/);

const liveRefresh = functionSource(app, 'communityMessageBackgroundLiveRefreshActive', 'releaseCommunityMessageBackgroundMedia');
assert.match(liveRefresh, /messageBackgroundMenuOpen/);
assert.match(liveRefresh, /followWallpaperEngine\s*===\s*true/);
assert.doesNotMatch(liveRefresh, /wallpaperId\.startsWith/);

const mediaSync = functionSource(app, 'syncCommunityMessageBackground', 'appendCommunityMessageBackgroundChoice');
assert.match(mediaSync, /descriptor\.mediaKind\s*===\s*['"]video['"]/);
assert.match(mediaSync, /descriptor\.mediaKind\s*===\s*['"]web['"]/);
assert.match(mediaSync, /communityMessageWallpaperImage\.src\s*=\s*descriptor\.wallpaperUrl/);

const mediaRelease = functionSource(app, 'releaseCommunityMessageBackgroundMedia', 'syncCommunityMessageBackground');
assert.match(mediaRelease, /video\.pause\(\)/);
assert.match(mediaRelease, /video\.removeAttribute\(['"]src['"]\)/);
assert.match(mediaRelease, /frame\.src\s*=\s*['"]about:blank['"]/);
assert.match(mediaRelease, /communityMessageStage\?\.classList\.remove\(['"]is-wallpaper['"]\)/);

const selection = functionSource(app, 'selectCommunityMessageBackground', 'handleCommunityMessageBackgroundChoice');
assert.doesNotMatch(selection, /selectWallpaper|setSceneWallpaperForPreset|activateNativeWallpaperScene|wallpapers\/activate/);
assert.match(app, /function\s+setCommunityMessageOpen[\s\S]*releaseCommunityMessageBackgroundMedia\(\)/);
assert.match(app, /visibilitychange[\s\S]*releaseCommunityMessageBackgroundMedia\(\)/);

assert.doesNotMatch(
  functionSource(creative, 'renderViewer', 'openUserProfile'),
  /viewerMessage\.disabled\s*=\s*[^;]*!isFriend/
);
assert.match(creative, /bridge\.openMessages\(state\.viewerId,\s*peer\)/);
assert.match(creative, /profileDialog:\s*\$\('#communityProfileDialog'\)/);
assert.match(creative, /profileDialog\?\.addEventListener\(['"]click['"],\s*handleProfileDelegation\)/);
assert.match(app, /async function\s+openCommunityMessages\(target\s*=\s*['"]['"]\)/);
assert.match(app, /resolveCommunityMessagePeer\(target\)/);

if (server) {
  const sendMessage = functionSource(server, 'sendMessage', 'addLike');
  assert.match(sendMessage, /requireUser\(db,\s*input\.targetId,\s*['"]recipient['"]\)/);
  assert.match(sendMessage, /source\s*===\s*target/);
  assert.doesNotMatch(sendMessage, /friendships|friendship was not found/);
}

console.log(JSON.stringify({
  pass: true,
  chatWallpaper: {
    isolatedToMessageStage: true,
    wallpaperEngineCatalog: true,
    mediaKinds: ['image', 'video', 'web', 'scene-preview'],
    dynamicMediaReleasedOnClose: true,
    persisted: true
  },
  directMessages: {
    friends: true,
    nonFriends: true,
    selfMessageBlocked: Boolean(server)
  }
}, null, 2));
