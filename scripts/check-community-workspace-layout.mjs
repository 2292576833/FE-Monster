import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');

const requiredIds = [
  'communityProfileDialog',
  'communityProfilePanel',
  'communityProfileTitle',
  'communityProfileClose',
  'communityProfileSelfPage',
  'communityProfileNearbyPage',
  'communityProfileSquarePage',
  'communityProfileMailboxPage',
  'communityProfileReportPage',
  'communityProfileMarketPage',
  'communityProfileAchievementPage',
  'communityProfileOrnamentPage',
  'communityMessageDialog',
  'communityMessagePanel',
  'communityMessageStage',
  'communityMessageForm',
  'communitySquareList',
  'communitySquareForm',
  'communityFeId',
  'communityListeningDuration',
  'communityListeningSongs',
  'communitySearchInput',
  'communityAddButton',
  'communityReportButton',
  'communityMarketButton',
  'communityAchievementButton',
  'communityOrnamentButton',
  'communityMessageButton',
  'communityDndButton',
  'communityFriendsList'
];

for (const id of requiredIds) {
  const occurrences = html.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  assert.equal(occurrences.length, 1, `${id} must stay unique for its existing event binding`);
}

assert.match(html, /class=["'][^"']*community-profile-tabs[^"']*["'][^>]*role=["']tablist["']/);

const requiredPageBindings = [
  ['communityProfileSelfTab', 'communityProfileSelfPage', 'self'],
  ['communityProfileGroupTab', 'communityProfileNearbyPage', 'nearby'],
  ['communityProfileSquareTab', 'communityProfileSquarePage', 'square'],
  ['communityProfileMailboxTab', 'communityProfileMailboxPage', 'mailbox'],
  ['communityProfileReportTab', 'communityProfileReportPage', 'report'],
  ['communityProfileMarketTab', 'communityProfileMarketPage', 'market'],
  ['communityProfileAchievementTab', 'communityProfileAchievementPage', 'achievement'],
  ['communityProfileOrnamentTab', 'communityProfileOrnamentPage', 'ornament']
];

for (const [tabId, pageId, page] of requiredPageBindings) {
  const tab = html.match(new RegExp(`<button[^>]*id=["']${tabId}["'][^>]*>`, 'i'))?.[0] || '';
  assert.match(tab, new RegExp(`aria-controls=["']${pageId}["']`));
  assert.match(tab, new RegExp(`data-community-profile-page=["']${page}["']`));
}

const summaryStart = html.indexOf('<div class="community-summary-row"');
const summaryEnd = html.indexOf('<form class="community-add-form"', summaryStart);
assert.ok(summaryStart >= 0 && summaryEnd > summaryStart, 'account summary must precede the search form in source');
const summaryMarkup = html.slice(summaryStart, summaryEnd);
assert.ok(
  summaryMarkup.indexOf('id="communityFeId"') < summaryMarkup.indexOf('id="communityListeningDuration"')
    && summaryMarkup.indexOf('id="communityListeningDuration"') < summaryMarkup.indexOf('id="communityListeningSongs"'),
  'FE ID, listening duration and unique songs must share the same summary row in that order'
);

const toolsStart = html.indexOf('<span class="community-friends-tools">');
const toolsEnd = html.indexOf('</span>', toolsStart);
assert.ok(toolsStart >= 0 && toolsEnd > toolsStart, 'community action toolbar must exist');
const toolsMarkup = html.slice(toolsStart, toolsEnd);
const actionIds = [
  'communityReportButton',
  'communityMarketButton',
  'communityAchievementButton',
  'communityOrnamentButton',
  'communityMessageButton',
  'communityDndButton'
];
for (const id of actionIds) {
  assert.match(toolsMarkup, new RegExp(`id=["']${id}["']`), `${id} must remain in the one-row toolbar`);
}

const drawerMarker = '/* Community drawer information hierarchy.';
assert.equal((css.match(/\/\* Community drawer information hierarchy\./g) || []).length, 1);
const drawerContractStart = css.lastIndexOf(drawerMarker);
assert.ok(
  drawerContractStart > css.lastIndexOf('/* Community workspace layout.'),
  'drawer hierarchy rules must load after the legacy workspace rules'
);
const drawerCss = css.slice(drawerContractStart);
assert.match(drawerCss, /\.community-card:not\(\.is-collapsed\)\s*\{[\s\S]*?width:\s*min\(480px, calc\(100vw - 24px\)\)/);
assert.match(drawerCss, /\.community-add-form\s*\{[\s\S]*?order:\s*1;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 72px/);
assert.match(drawerCss, /\.community-summary-row\s*\{[\s\S]*?order:\s*2/);
assert.match(drawerCss, /\.community-friends-head\s*\{[\s\S]*?order:\s*3/);
assert.match(drawerCss, /\.community-friends-list\s*\{[\s\S]*?order:\s*4/);
assert.match(drawerCss, /\.community-summary-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(138px, 1fr\) minmax\(260px, 2fr\)/);
assert.match(drawerCss, /\.community-friends-tools\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
assert.match(drawerCss, /\.community-friends-list\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*72px/);
assert.match(drawerCss, /@media \(max-width: 620px\)[\s\S]*?\.community-friends-tools\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto/);
assert.doesNotMatch(drawerCss, /@media \(max-width: 390px\)[\s\S]*?\.community-summary-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);

assert.match(css, /\/\* Community workspace layout\./);
assert.match(css, /\.community-profile-panel\s*\{[\s\S]*?width:\s*min\(1080px,[\s\S]*?grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/);
assert.match(css, /\.community-profile-head\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 38px/);
assert.match(css, /\.community-profile-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(8, minmax\(0, 1fr\)\)[\s\S]*?margin-top:\s*12px/);
assert.match(css, /\.community-profile-panel > \.community-profile-tabs\s*\{\s*display:\s*grid/);
assert.match(css, /\.community-profile-pages\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden/);
assert.match(css, /#communityProfileReportPage:not\(\[hidden\]\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(250px,[\s\S]*?overflow:\s*hidden/);
assert.match(css, /#communityProfileMarketPage:not\(\[hidden\]\)[\s\S]*?\.community-market-list\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow-y:\s*auto/);
assert.match(css, /#communityProfileSquarePage:not\(\[hidden\]\),\s*#communityProfileMailboxPage:not\(\[hidden\]\)[\s\S]*?background:\s*#EAEEF2/);
assert.match(css, /\.community-message-panel\s*\{[\s\S]*?width:\s*min\(1080px,[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto/);
assert.match(css, /\.community-message-bubble,\s*\.community-square-message,\s*\.community-mailbox-mail\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, 0\.68\)[\s\S]*?backdrop-filter:\s*blur\(16px\)/);
assert.match(css, /\.community-card:not\(\.is-collapsed\) \.community-friends-tools\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(css, /@keyframes community-workspace-content-enter\s*\{[\s\S]*?translate3d\(/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?community-workspace-content-enter[\s\S]*?animation:\s*none/);
assert.match(css, /@media \(max-width: 820px\), \(max-height: 650px\)[\s\S]*?\.community-profile-tabs\s*\{[\s\S]*?display:\s*flex/);
assert.match(css, /\.community-profile-tabs \.community-profile-tab:focus-visible[\s\S]*?outline:\s*2px solid/);

console.log(JSON.stringify({
  ok: true,
  checks: requiredIds.length + requiredPageBindings.length * 2 + actionIds.length + 30,
  layout: {
    stableBindings: true,
    twoRowHeader: true,
    unifiedContentCanvas: true,
    responsiveNavigation: true,
    lightChatSurfaces: true,
    reducedMotion: true,
    drawerSummaryRow: true,
    drawerSixActionRow: true,
    drawerMobileScroll: true
  }
}, null, 2));
