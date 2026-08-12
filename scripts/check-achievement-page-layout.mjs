import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceCss = readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const achievementCss = readFileSync(path.join(root, 'web', 'pixel-adventure.css'), 'utf8');
const achievementRuntime = readFileSync(path.join(root, 'web', 'pixel-achievements.js'), 'utf8');

const workspaceStart = workspaceCss.lastIndexOf('/* Community workspace layout.');
assert.ok(workspaceStart >= 0, 'community workspace layout contract must exist');
const workspace = workspaceCss.slice(workspaceStart);

assert.match(
  workspace,
  /\.community-profile-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/,
  'all eight desktop profile tabs must share the available width instead of forcing horizontal clipping'
);
assert.match(
  workspace,
  /\.community-profile-tabs \.community-profile-tab\s*\{[\s\S]*?min-width:\s*0\s*;/,
  'desktop profile tabs must be allowed to shrink inside the eight-column grid'
);
assert.match(
  achievementCss,
  /\.community-profile-panel\.is-achievement-page\s*\{[\s\S]*?width:\s*min\(1080px,\s*calc\(100vw - 96px\)\)/,
  'opening achievements must keep the full community workspace width'
);
assert.match(
  workspace,
  /\.community-profile-page:not\(\[hidden\]\)\s*\{[\s\S]*?min-width:\s*0\s*;[\s\S]*?overflow-x:\s*hidden\s*;/,
  'the active community page must not create a hidden horizontal strip'
);
assert.match(
  achievementCss,
  /\.community-profile-panel\.is-achievement-page\s*\{[\s\S]*?transform:\s*translate\(var\(--community-card-x,\s*0px\),\s*var\(--community-card-y,\s*0px\)\)\s*;[\s\S]*?transform-style:\s*flat\s*;/,
  'the achievement page must remove the perspective tilt that raster-blurs text under Windows zoom'
);
assert.match(
  achievementCss,
  /\.community-profile-panel\.is-achievement-page,[\s\S]*?text-rendering:\s*geometricPrecision\s*;/,
  'achievement text must use geometry-preserving rasterization at fractional browser zoom'
);
assert.match(
  achievementRuntime,
  /function\s+achievementIconPixelRatio\(\)[\s\S]*?window\.devicePixelRatio[\s\S]*?Math\.min\(3,[\s\S]*?Math\.max\(1,/,
  'achievement icons must derive a bounded high-DPI backing scale from the active Windows DPI'
);
assert.match(
  achievementRuntime,
  /canvas\.width\s*=\s*Math\.round\(ACHIEVEMENT_ICON_SIZE\s*\*\s*pixelRatio\)[\s\S]*?context\.setTransform\?\.\(pixelRatio,\s*0,\s*0,\s*pixelRatio,\s*0,\s*0\)/,
  'achievement icons must render logical pixels into a DPI-sized canvas instead of stretching a 32px bitmap'
);
assert.match(
  achievementRuntime,
  /visualViewport\?\.addEventListener\?\.\(['"]resize['"],\s*scheduleAchievementIconScaleRefresh/,
  'icons must be redrawn when browser zoom changes while the achievement page remains open'
);

console.log(JSON.stringify({
  ok: true,
  layout: {
    allDesktopTabsVisible: true,
    achievementKeepsWorkspaceWidth: true,
    noHiddenHorizontalContent: true,
    perspectiveBlurRemoved: true,
    dpiAwareIcons: true,
    liveZoomRefresh: true
  }
}, null, 2));
