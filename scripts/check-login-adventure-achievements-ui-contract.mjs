import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const production = {
  'web/index.html': read('web/index.html'),
  'web/app.js': read('web/app.js'),
  'web/pixel-adventure.css': read('web/pixel-adventure.css'),
  'web/pixel-achievements.js': read('web/pixel-achievements.js'),
  'web/pixel-login-adventure.js': read('web/pixel-login-adventure.js')
};

const html = production['web/index.html'];
const app = production['web/app.js'];
const css = production['web/pixel-adventure.css'];
const achievements = production['web/pixel-achievements.js'];
const adventure = production['web/pixel-login-adventure.js'];
const achievementBackend = read('src/main/java/com/femonster/core/AchievementStateService.java');
const suppliedFontPath = path.join(root, 'web', 'fonts', 'awei-pixel', 'AaWeiWeiDianZhenTi.ttf');
const webFontPath = path.join(root, 'web', 'fonts', 'awei-pixel', 'AaWeiWeiDianZhenTi.woff2');
const webFontFallbackPath = path.join(root, 'web', 'fonts', 'awei-pixel', 'AaWeiWeiDianZhenTi-web.ttf');
assert.ok(fs.existsSync(suppliedFontPath), 'the supplied achievement pixel font must be bundled locally');
assert.ok(fs.statSync(suppliedFontPath).size > 100_000, 'the bundled achievement font file is unexpectedly small');
assert.ok(fs.existsSync(webFontPath), 'the browser-compatible WOFF2 achievement font must be bundled locally');
assert.ok(fs.existsSync(webFontFallbackPath), 'the browser-compatible TTF achievement font fallback must be bundled locally');
const achievementSoundPath = path.join(root, 'web', 'audio', 'achievement-unlock.wav');
assert.ok(fs.existsSync(achievementSoundPath), 'the trimmed achievement unlock sound must be bundled locally');
const achievementSound = fs.readFileSync(achievementSoundPath);
assert.equal(achievementSound.subarray(0, 4).toString('ascii'), 'RIFF', 'achievement sound must be a valid WAV');
assert.equal(achievementSound.subarray(8, 12).toString('ascii'), 'WAVE', 'achievement sound must be a valid WAV');
assert.ok(achievementSound.length > 400_000, 'achievement sound appears to be truncated');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagWithId(id) {
  const pattern = new RegExp(`<[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`, 'i');
  const match = html.match(pattern);
  assert.ok(match, `${id} is missing from web/index.html`);
  const occurrences = html.match(new RegExp(`\\bid=["']${escapeRegExp(id)}["']`, 'gi')) || [];
  assert.equal(occurrences.length, 1, `${id} must be a unique global UI element`);
  return match[0];
}

const sceneTag = tagWithId('pixelLoginScene');
const canvasTag = tagWithId('pixelLoginCanvas');
tagWithId('pixelLoginHelp');
const authDrawerTag = tagWithId('pixelLoginAuthDrawer');
tagWithId('pixelLoginAuthBack');
const achievementButtonTag = tagWithId('communityAchievementButton');
const communityProfileDialogTag = tagWithId('communityProfileDialog');
const achievementTabTag = tagWithId('communityProfileAchievementTab');
const achievementPageTag = tagWithId('communityProfileAchievementPage');
const achievementGridTag = tagWithId('communityAchievementGrid');
const achievementToastTag = tagWithId('achievementToast');
tagWithId('achievementToastIcon');
tagWithId('achievementToastName');
tagWithId('achievementPageThemeSelect');
tagWithId('achievementToastThemeSelect');
const achievementSoundToggleTag = tagWithId('achievementSoundToggle');
const worldPeaceOverlayTag = tagWithId('worldPeaceCinematic');
tagWithId('worldPeaceLinePrimary');
tagWithId('worldPeaceLineSecondary');
tagWithId('browserLoginStage');

assert.match(sceneTag, /aria-label=/i, 'the pixel login scene needs an accessible name');
assert.match(canvasTag, /tabindex=["']0["']/i, 'the pixel login canvas must be keyboard focusable');
assert.match(canvasTag, /aria-describedby=["'][^"']*\bpixelLoginHelp\b[^"']*["']/i,
  'the canvas must reference its controls help');
assert.match(authDrawerTag, /aria-hidden=["']true["']/i, 'the existing login UI must begin inside a hidden auth drawer');
assert.match(achievementButtonTag, /aria-controls=["']communityProfileDialog["']/i);
assert.match(communityProfileDialogTag, /role=["']dialog["'][^>]*aria-labelledby=["']communityProfileTitle["']/i,
  'the achievement surface must expose dialog semantics');
assert.match(html, /class=["']community-profile-tabs["'][^>]*role=["']tablist["']/i,
  'community profile tabs need a tablist owner');
assert.match(html, /class=["']pixel-login-a11y-shortcuts["'][^>]*aria-label=["']无障碍平台直达["']/i,
  'the platform blocks need an assistive direct-entry equivalent');
for (const provider of ['netease', 'qq', 'kugou', 'qishui']) {
  assert.match(html, new RegExp(`data-pixel-provider-shortcut=["']${provider}["']`),
    `${provider} is missing from the assistive provider shortcuts`);
}
assert.match(achievementTabTag, /role=["']tab["'][^>]*aria-controls=["']communityProfileAchievementPage["']/i);
assert.match(achievementPageTag, /role=["']tabpanel["'][^>]*aria-labelledby=["']communityProfileAchievementTab["']/i);
assert.match(achievementGridTag, /role=["']group["'][^>]*aria-label=/i,
  'the achievement path needs a named group role');
assert.match(achievementToastTag, /role=["']status["']/i);
assert.match(achievementToastTag, /aria-live=["']polite["']/i);
assert.match(achievementToastTag, /\bhidden\b/i, 'the global achievement toast must start hidden');
assert.match(achievementSoundToggleTag, /role=["']switch["']/i);
assert.match(achievementSoundToggleTag, /\bchecked\b/i, 'achievement sound must default to enabled');
assert.match(worldPeaceOverlayTag, /\bhidden\b/i, 'the world-peace cinematic must start hidden');
assert.match(html, /id=["']worldPeaceLinePrimary["'][^>]*>\s*(?:<span>)?世界和平</i);
assert.match(html, /id=["']worldPeaceLineSecondary["'][^>]*>\s*(?:<span>)?愿天下没有战争</i);

const appScriptIndex = html.indexOf('src="app.js');
const achievementScriptIndex = html.indexOf('src="pixel-achievements.js');
const adventureScriptIndex = html.indexOf('src="pixel-login-adventure.js');
assert.ok(appScriptIndex >= 0 && achievementScriptIndex > appScriptIndex,
  'pixel achievements must load after the main app API');
assert.ok(adventureScriptIndex > achievementScriptIndex,
  'the login adventure must load after the achievement API');
assert.match(html, /href=["']pixel-adventure\.css\?[^"']+["']/i);

assert.match(app, /function closeLoginDialog\(\)[\s\S]*?window\.fePixelLogin\?\.close\?\.\(\)/,
  'closing the login dialog must stop the pixel scene');
assert.match(app, /async function showLoginDialog\(\)[\s\S]*?window\.fePixelLogin\?\.open\?\.\(\)/,
  'opening the login dialog must start a newly generated pixel scene');
assert.match(app, /function renderLoginStatus\([^)]*\)[\s\S]*?window\.fePixelLogin\?\.syncProviders\?\.\(\)/,
  'provider login changes must refresh the scene highlights');
assert.match(app, /communityAchievementButton\.addEventListener\('click',[\s\S]*?setCommunityProfileOpen\(true, 'achievement'\)/,
  'the community achievement button must open the achievement page');
assert.match(app, /communityProfileAchievementTab\.addEventListener\('click',[\s\S]*?setCommunityProfilePage\('achievement'\)/,
  'the community profile achievement tab must select the achievement page');
assert.match(app, /if \([\s\S]{0,120}?nextPage === ['"]achievement['"][\s\S]{0,280}?window\.feAchievements\?\.render\?\.\(\)/,
  'opening the achievement page must render the latest unlock state');
assert.match(app, /tab\.setAttribute\('role', 'tab'\)[\s\S]{0,180}?tab\.setAttribute\('aria-selected'/,
  'provider selectors must implement tab semantics');
assert.match(app, /communityProfileTabs\.forEach[\s\S]{0,800}?ArrowLeft[\s\S]{0,320}?ArrowRight/,
  'community profile tabs must support arrow-key navigation');
assert.match(app, /async function quitAppWindow\(\)[\s\S]*?await window\.feAchievements\?\.flush\?\.\(\{ timeout: 4000 \}\)[\s\S]*?requestAppWindowAction\('quit'\)/,
  'program exit must wait for pending achievement writes before stopping the backend');

for (const code of ['KeyA', 'KeyD', 'Space']) {
  assert.match(adventure, new RegExp(`event\\.code === ['"]${code}['"]`), `${code} keyboard control is missing`);
}
assert.match(adventure, /const PROVIDER_IDS = Object\.freeze\(\['netease', 'qq', 'kugou', 'qishui'\]\)/,
  'all four music platforms must be represented in the scene');
assert.match(adventure, /function activateProviderShortcut\(id\)[\s\S]{0,280}?activateProviderBlock\(block\)/,
  'assistive provider shortcuts must use the same platform activation path');
assert.match(adventure, /function handleDialogFocusTrap\(event\)[\s\S]{0,1100}?event\.key !== 'Tab'/,
  'the modal login surface must keep keyboard focus inside');
assert.match(adventure, /isUiControlTarget\(event\.target\)/,
  'game keyboard shortcuts must leave native controls operable');
assert.match(adventure, /function createLayout\(\)[\s\S]*?randomSeed\(\)[\s\S]*?shuffled\(PROVIDER_IDS, random\)/,
  'each layout must randomize its seed and platform order');
assert.match(adventure, /function open\(\)[\s\S]*?game\.layout = createLayout\(\)/,
  'each dialog open must create a fresh layout');
assert.match(adventure, /window\.crypto\?\.getRandomValues/,
  'layout generation should use the browser random source when available');
assert.match(adventure, /function isProviderLoggedIn\([^)]*\)[\s\S]*?loginStatusByProvider\?\.\[id\]\?\.loggedIn/,
  'logged-in block highlighting must use live provider state');
assert.match(adventure, /function drawBlocks\([^)]*\)[\s\S]*?const loggedIn = isProviderLoggedIn\(block\.provider\)[\s\S]*?if \(loggedIn\)/,
  'logged-in provider blocks must have a distinct rendered state');
assert.match(adventure, /function activateProviderBlock\([^)]*\)[\s\S]*?setActiveProvider\(id\)[\s\S]*?openAuthDrawer\(id, selected, loggedIn, \{ providerOnly: true \}\)[\s\S]*?loggedIn && OFFICIAL_PROVIDERS\.has\(id\)[\s\S]*?switchOfficialBrowserAccount\(\)/,
  'a block hit must select/login its platform and switch an already logged-in official account');
assert.match(adventure, /const SECRET_WORLD_MIN_X = -\d+;/,
  'the hidden left passage must extend the world into negative coordinates');
assert.match(adventure, /function groundSegments\([^)]*minimumX = 0\)[\s\S]*?let start = minimumX[\s\S]*?groundSegments\(template\.width, template\.gaps, SECRET_WORLD_MIN_X\)/,
  'the negative passage must be backed by traversable ground');
assert.match(adventure, /function updatePlayer\([^)]*\)[\s\S]*?const minimumPlayerX =[\s\S]*?game\.layout\.minX \+ 8[\s\S]*?Math\.max\(\s*minimumPlayerX,[\s\S]*?player\.x <= game\.layout\.secretExitX[\s\S]*?openAllProvidersDrawer\(\)/,
  'keyboard and touch movement must be able to reach the hidden passage exit');
assert.match(adventure, /const desiredCamera = game\.layout\.kind === 'surface'[\s\S]*?game\.player\.x < 72[\s\S]*?game\.player\.x - 72[\s\S]*?const targetCamera = Math\.max\(game\.layout\.minX/,
  'the camera must follow the player into negative world coordinates');
assert.match(adventure, /async function prepareSecretEligibility\([^)]*\)[\s\S]*?await Promise\.resolve\(window\.feAchievements\?\.ready\)[\s\S]*?isUnlocked\?\.\('secret-left'\)[\s\S]*?secret\.eligible = !alreadyUnlocked/,
  'the secret reveal must wait for persisted achievement state before deciding first-time eligibility');
assert.match(adventure, /function updateSecret\([^)]*\)[\s\S]*?leftInputActive\(\)[\s\S]*?leftSceneProgress\(game\.secret\.held\)[\s\S]*?SECRET_DRAWER_REVEAL_TIME[\s\S]*?if \(game\.secret\.eligible\) unlockAchievement\('secret-left'\)[\s\S]*?openAllProvidersDrawer\(\)/,
  'holding any left control must reveal the four-provider page at two seconds while only unlocking the achievement on an eligible first-time run');
assert.match(adventure, /function openAllProvidersDrawer\(\)[\s\S]*?openAuthDrawer\([^;]*\{ providerOnly: false \}\)/,
  'the hidden passage exit must open the normal multi-provider login drawer');
assert.match(adventure, /function openAuthDrawer\([^)]*options = \{\}\)[\s\S]*?setProviderOnly\(options\.providerOnly === true\)/,
  'the auth drawer must explicitly select provider-only or multi-provider mode');
assert.match(adventure, /function syncProviders\(\)[\s\S]*?\{ focus: false, providerOnly: game\.providerOnly \}/,
  'provider state refreshes must preserve the current drawer mode');
assert.match(adventure, /function syncProviders\(\)[\s\S]*?const activeProvider = game\.providerOnly\s*\? drawerProvider\s*:\s*activeTab\?\.dataset\.loginProvider \|\| drawerProvider/,
  'provider-only refreshes must stay pinned to the block that opened the drawer');
assert.match(adventure, /function returnToScene\(\)[\s\S]*?setProviderOnly\(false\)/,
  'returning from provider login must restore the multi-provider tabs for the next entry');
assert.match(adventure, /function returnToScene\(\)[\s\S]*?returningFromSecretExit[\s\S]*?game\.player\.x = game\.layout\.secretExitX \+ \d+/,
  'returning from the hidden exit must place the player clear of its reopen trigger');

assert.match(achievements, /const STORAGE_KEY = ['"]fe-monster-achievements-v2['"]/,
  'achievement persistence must use the current versioned storage key');
assert.match(achievements, /const LEGACY_STORAGE_KEY = ['"]fe-monster-achievements-v1['"]/,
  'achievement persistence must migrate the previous local state');
assert.match(achievements, /const STATE_API = ['"]\/api\/app\/achievements['"]/,
  'achievements must persist outside the random localhost origin');
assert.match(achievements, /function storageKeyForScope\([^)]*\)[\s\S]*?encodeURIComponent\(scope\)/,
  'achievement local persistence must be partitioned by account scope');
assert.match(achievements, /localStorage\.getItem\(storageKey\)/);
assert.match(achievements, /localStorage\.setItem\(activeStorageKey,/);
assert.match(achievements, /window\.fetch\(stateApiUrl\(\), \{ cache: 'no-store' \}\)/,
  'achievement startup must hydrate through the account-aware application data API');
assert.match(achievements, /window\.fetch\(stateApiUrl\(\), \{[\s\S]*?method: 'POST'[\s\S]*?keepalive: true/,
  'achievement changes must be written through the application data API');
assert.match(achievements, /async function drainPersistQueue\(\)[\s\S]*?while \(persistCompletedRevision < persistRequestedRevision\)[\s\S]*?await persistServerState\(\)/,
  'application-data writes must remain serialized and coalesce to the latest state');
assert.match(achievements, /if \(persistDrainActive \|\| !hydrationFinished \|\| !serverHydrated\) return/,
  'the client must never overwrite unknown server state before a successful hydration');
assert.match(achievements, /const HYDRATE_RETRY_DELAYS = Object\.freeze\(\[[^\]]+\]\)/,
  'transient achievement-state reads must retry before falling back');
assert.match(achievements, /const PERSIST_RETRY_DELAYS = Object\.freeze\(\[[^\]]+\]\)/,
  'failed migration writes must have bounded automatic retries');
assert.match(achievements, /addEventListener\?\.\(['"]fe-community-account-change['"], handleCommunityAccountChange\)/,
  'achievement state must switch account-local partitions when community identity changes');
assert.match(app, /function notifyAchievementAccountChange\([^)]*\)[\s\S]*?fe-community-account-change/,
  'community login state must notify the achievement account partition');
assert.match(app, /function renderLoginStatus\([^)]*\)[\s\S]*?notifyAchievementAccountChange\(provider\.id, payload\)/,
  'login refresh must forward the current account identity to achievements');
assert.match(achievements, /id: ['"]secret-left['"]/);
assert.match(achievements, /id: ['"]world-peace['"]/);
const achievementIds = [
  'first-block',
  'gap-runner',
  'monster-stomp',
  'all-platforms',
  'world-peace',
  'first-play',
  'track-finished',
  'first-favorite',
  'local-import',
  'lyric-council',
  'manual-sync',
  'visual-first',
  'scene-smith',
  'bio-written',
  'first-friend',
  'listen-together',
  'first-danmaku',
  'completionist',
  'secret-left'
];
for (const id of achievementIds) {
  const escapedId = escapeRegExp(id);
  assert.match(achievements, new RegExp(`id:\\s*['"]${escapedId}['"]`),
    `${id} is missing from the achievement catalog`);
  assert.match(achievements, new RegExp(`['"]${escapedId}['"]:\\s*Object\\.freeze\\(\\{`),
    `${id} is missing its pixel icon palette`);
  assert.match(achievements, new RegExp(`['"]${escapedId}['"]:\\s*Object\\.freeze\\(\\[`),
    `${id} is missing its pixel icon drawing commands`);
  assert.match(achievementBackend, new RegExp(`["']${escapedId}["']`),
    `${id} is missing from the persistent backend whitelist`);
}
for (const pathId of ['adventure', 'music', 'lyrics', 'visual', 'community', 'legend']) {
  assert.match(achievements, new RegExp(`Object\\.freeze\\(\\{\\s*id:\\s*['"]${pathId}['"]`),
    `${pathId} achievement path is missing`);
}
assert.match(achievements, /function createAchievementLane\([^)]*\)[\s\S]*?achievement-path-lane[\s\S]*?achievement-path-track/,
  'achievement categories must render as named, connected lanes');
assert.match(achievements, /id:\s*['"]completionist['"][\s\S]{0,120}?name:\s*['"]\?\?\?\?\?\?['"]/,
  'the ultimate achievement name must be exactly six question marks');
assert.match(achievements, /const COMPLETIONIST_PREREQUISITE_IDS = Object\.freeze\(\[[\s\S]*?['"]secret-left['"][\s\S]*?\]\)/,
  'the ultimate achievement must declare its complete prerequisite task list');
assert.match(achievements, /function maybeUnlockCompletionist\([^)]*\)[\s\S]{0,260}?completionistProgress\(\)\.eligible/,
  'the ultimate achievement must require every prerequisite and final task');
assert.match(achievements, /if \(id === 'completionist' && !completionistProgress\(\)\.eligible\) return false/,
  'direct calls must not bypass ultimate achievement requirements');
assert.match(achievements, /if \(id !== 'completionist'\) maybeUnlockCompletionist\(options\)/,
  'every unlock must re-evaluate the epic completion achievement');
assert.match(achievements, /function updateCompletionistRequirements\([^)]*\)[\s\S]*?achievement-node-requirements[\s\S]*?终局条件/,
  'the ultimate achievement card detail must explain prerequisite and final tasks');
assert.match(app, /function toggleFavoriteSong\([^)]*\)[\s\S]*?existingIndex < 0[\s\S]*?unlockAppAchievement\('first-favorite'\)/,
  'first-favorite must unlock only after a song is added');
assert.match(app, /async function importLocalAudioFiles\([^)]*\)[\s\S]*?if \(added > 0\) unlockAppAchievement\('local-import'\)/,
  'local-import must unlock only after at least one file is accepted');
assert.match(app, /function setLyricClockOffsetSeconds\([^)]*\)[\s\S]*?nextOffset !== previousOffset[\s\S]*?unlockAppAchievement\('manual-sync'\)/,
  'manual-sync must require an actual non-zero timing adjustment');
assert.match(app, /function setMultiRowLyricsEnabled\([^)]*\)[\s\S]*?nextEnabled && !wasEnabled[\s\S]*?unlockAppAchievement\('lyric-council'\)/,
  'lyric-council must require enabling multi-row lyrics');
assert.match(app, /async function sendCommunityDanmaku\([^)]*\)[\s\S]*?response && response\.ok === false[\s\S]*?unlockAppAchievement\('first-danmaku'\)/,
  'first-danmaku must wait for relay success');
assert.match(app, /els\.audio\.addEventListener\('ended'[\s\S]*?unlockAppAchievement\('track-finished'\)[\s\S]*?transport\('\/api\/player\/next'\)/,
  'track-finished must unlock before automatic next-track transport');
assert.match(achievements, /const ACHIEVEMENT_SOUND_URL = ['"]audio\/achievement-unlock\.wav\?[^'"]+['"]/,
  'the achievement toast must use the trimmed supplied audio');
assert.match(achievements, /function playAchievementSound\(\)[\s\S]*?new AudioClass\(ACHIEVEMENT_SOUND_URL\)[\s\S]*?\.play\(\)/,
  'achievement audio must play from the supplied asset');
assert.match(achievements, /function setSoundEnabled\([^)]*\)[\s\S]*?achievementState\.settings\.soundEnabled[\s\S]*?saveState\(\)/,
  'the achievement sound switch must persist through the achievement state service');
assert.match(achievementBackend, /root\.put\("settings", Map\.of\("soundEnabled", state\.soundEnabled\(\)\)\)/,
  'the backend must persist the achievement sound switch across restarts');
assert.match(achievements, /const THEMES = Object\.freeze\(\['classic', 'forge', 'void', 'frost'\]\)/,
  'all four achievement skins must be available');
assert.match(achievements, /function setTheme\(target, theme\)[\s\S]*?saveState\(\)/,
  'page and toast theme changes must be persisted');
assert.match(achievements, /const TOAST_HOLD_MS = 3000/,
  'achievement notifications must remain visible for three seconds');
assert.match(achievements, /const startHold = \(\) => \{[\s\S]*?toastHoldTimer = window\.setTimeout\(beginLeaving, TOAST_HOLD_MS\)/,
  'the shared toast must remain fully visible for three seconds after entering');
assert.doesNotMatch(achievements, /\.offsetWidth/,
  'achievement animations must not force a synchronous layout flush');
assert.match(achievements, /requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame/,
  'the toast must enter on a two-frame compositor transition');
assert.match(achievements, /document\.querySelector\('#achievementToast'\)/);
assert.match(achievements, /document\.querySelector\('#achievementToastIcon'\)/);
assert.match(achievements, /document\.querySelector\('#achievementToastName'\)/);
assert.match(achievements, /button\.dataset\.tagline = achievement\.tagline[\s\S]*?button\.setAttribute\([\s\S]*?'aria-label'/,
  'achievement icons must expose their tagline visually and accessibly');
assert.match(achievements, /const existingNodes = new Map[\s\S]*?updateAchievementNode\(existingNodes\.get\(achievement\.id\), achievement\)/,
  'achievement rerenders must preserve focused nodes and animate state changes in place');
assert.match(achievements, /window\.feAchievements = Object\.freeze\(\{[\s\S]*?unlock,[\s\S]*?render,[\s\S]*?isUnlocked[\s\S]*?ready,[\s\S]*?setTheme,[\s\S]*?flush/,
  'gameplay and the community page must share one achievement API');

assert.match(css, /#pixelLoginCanvas\s*\{[^}]*image-rendering:\s*pixelated;/s,
  'the adventure canvas must retain crisp pixel rendering');
assert.match(css, /\.netease-login-dialog \.netease-login-panel\s*\{[^}]*width:\s*min\([^;]*100vw[^;]*\);/s,
  'the enlarged login scene must remain viewport-responsive');
assert.match(css, /@media\s*\(max-width:\s*660px\)/,
  'the pixel UI needs a compact-width layout');
assert.match(css, /@media\s*\(max-height:\s*430px\)[\s\S]{0,1800}?\.netease-login-dialog \.netease-login-panel/,
  'short landscape windows need a compact login layout');
assert.match(css, /@media\s*\(max-height:\s*520px\)[\s\S]{0,1000}?\.community-profile-panel\.is-achievement-page[\s\S]{0,260}?overflow-y:\s*auto/,
  'short landscape achievement panels must remain vertically reachable');
assert.match(css, /\.pixel-login-scene\.is-secret-revealed/,
  'the secret-left fade state must be styled');
assert.match(css, /\.pixel-login-auth-drawer\.is-provider-only \.login-provider-tabs\s*\{[^}]*display:\s*none\s*!important;/s,
  'a platform block must hide provider-switching tabs in provider-only mode');
assert.match(css, /\.achievement-toast\s*\{[^}]*position:\s*fixed;[^}]*top:[^;]+;[^}]*right:[^;]+;[^}]*transform:\s*translate3d\(calc\(100% \+ 32px\), 0, 0\);/s,
  'the shared achievement toast must begin offscreen at the top-right');
assert.match(css, /\.achievement-toast\.is-leaving\s*\{[^}]*opacity:\s*0;[^}]*translate3d\(calc\(100% \+ 32px\), 0, 0\)/s,
  'achievement notifications must hide by smoothly sliding right');
for (const theme of ['classic', 'forge', 'void', 'frost']) {
  if (theme !== 'classic') {
    assert.match(css, new RegExp(`data-achievement-page-theme=["']${theme}["']`),
      `${theme} achievement page skin is missing`);
    assert.match(css, new RegExp(`data-achievement-toast-theme=["']${theme}["']`),
      `${theme} achievement toast skin is missing`);
  }
}
assert.match(css, /\.world-peace-cinematic\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s,
  'the world-peace cinematic must cover the interface without intercepting playback controls');
assert.match(css, /\.world-peace-cinematic__line\s*\{[^}]*clip-path:\s*inset\(0 100% 0 0\)/s,
  'world-peace copy must reveal from left to right');
assert.match(css, /@font-face\s*\{[^}]*font-family:\s*["']FE AWei Pixel["'][^}]*AaWeiWeiDianZhenTi\.woff2[^}]*AaWeiWeiDianZhenTi-web\.ttf/s,
  'achievement typography must use the corrected WOFF2 with a corrected TTF fallback');
assert.match(css, /@font-face\s*\{[^}]*font-family:\s*["']FE AWei Pixel["'][^}]*font-display:\s*swap;[^}]*font-weight:\s*400;/s,
  'the single-weight achievement font must render fallback text immediately and declare its real weight');
assert.match(css, /\.community-profile-panel\.is-achievement-page,\s*\.community-profile-panel\.is-achievement-page \*,[\s\S]*?\{[^}]*font-synthesis:\s*none\s*!important;[^}]*font-weight:\s*400\s*!important;[^}]*text-rendering:\s*optimizeLegibility;[^}]*-webkit-font-smoothing:\s*antialiased;/s,
  'achievement text must not synthesize fake bold glyphs and must use stable browser rasterization');
assert.match(css, /\.community-profile-panel\.is-achievement-page \.community-profile-head > div > span\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*14px;/s,
  'the achievement eyebrow must remain legible at an integer pixel size');
assert.match(css, /\.community-profile-panel\.is-achievement-page \.community-profile-head strong\s*\{[^}]*font-size:\s*17px;[^}]*line-height:\s*21px;/s,
  'the achievement title must retain a clear visual hierarchy');
assert.match(css, /\.community-profile-panel\.is-achievement-page \.community-profile-head small\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*16px;/s,
  'the achievement subtitle must not inherit an undersized style');
assert.match(css, /\.community-achievement-head strong\s*\{[^}]*font-size:\s*15px;[^}]*line-height:\s*19px;/s);
assert.match(css, /\.community-achievement-head small\s*\{[^}]*font-size:\s*11px;[^}]*line-height:\s*15px;/s);
assert.match(css, /\.achievement-theme-controls label\s*\{[^}]*font:\s*400 10px\/14px/s,
  'theme labels must use the real font weight and remain readable');
assert.match(css, /\.achievement-theme-controls select\s*\{[^}]*font:\s*400 11px\/15px/s,
  'theme choices must use the real font weight and remain readable');
assert.match(css, /\.achievement-node-copy\s*\{[^}]*font:\s*400 11px\/15px/s,
  'achievement node details must remain readable without synthetic bold');
assert.match(css, /\.achievement-node-copy strong\s*\{[^}]*font-size:\s*12px;[^}]*line-height:\s*16px;/s);
assert.match(css, /\.achievement-node-copy small\s*\{[^}]*font-size:\s*10px;[^}]*line-height:\s*14px;/s);
assert.match(css, /\.community-achievement-node\[data-tagline\]::after\s*\{[^}]*font:\s*400 11px\/16px/s,
  'achievement node hints must remain readable without synthetic bold');
assert.match(css, /\.achievement-path-label\s*\{[^}]*font:\s*400 11px\/15px/s,
  'achievement path labels must be crisp at their normal layout size');
assert.match(css, /@media\s*\(max-width:\s*660px\)[\s\S]{0,1800}?\.achievement-path-label\s*\{[^}]*font-size:\s*10px;/s,
  'compact achievement paths must not reduce labels below ten pixels');
assert.match(css, /\.achievement-toast__copy small\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*400;[^}]*line-height:\s*17px;/s);
assert.match(css, /\.achievement-toast__copy strong\s*\{[^}]*font-size:\s*17px;[^}]*font-weight:\s*400;[^}]*line-height:\s*21px;/s,
  'achievement toast typography must stay clear and match the bundled font weight');
assert.match(css, /\.world-peace-cinematic\.is-line-one-out[\s\S]{0,600}?opacity:\s*0/s,
  'the first world-peace line must fade away before the second appears');
assert.match(css, /@keyframes world-peace-pixel-drift[\s\S]*?translate3d\(1px, -1px, 0\)[\s\S]*?translate3d\(-1px, 1px, 0\)/,
  'world-peace typography must drift subtly in all directions');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pixel-login-scene[\s\S]*?\.achievement-toast\.is-visible[\s\S]*?transition-duration:\s*1ms/s,
  'the scene and achievement toast must respect reduced motion');

for (const source of [adventure, achievements]) {
  assert.match(source, /(?:window\.)?(?:AudioContext|webkitAudioContext)/,
    'pixel feature sounds must be synthesized with Web Audio');
  assert.match(source, /\.createOscillator\(\)/,
    'pixel feature sounds must use synthesized oscillators');
  assert.match(source, /\.createGain\(\)/,
    'pixel feature sounds must use a generated gain envelope');
}

const forbiddenBrand = /(?:nintendo|super[-_\s]?mario|mario(?:[-_\s]?bros)?|luigi|goomba|koopa|bowser|mushroom[-_\s]?kingdom|yoshi|princess[-_\s]?peach|smb[123]?)/i;
for (const [relativePath, source] of Object.entries(production)) {
  assert.doesNotMatch(source, forbiddenBrand, `${relativePath} must not reference Nintendo or Mario brands`);
  assert.doesNotMatch(relativePath, forbiddenBrand, `${relativePath} must not use a Nintendo or Mario asset name`);
}

const featureSources = `${css}\n${achievements}\n${adventure}`;
assert.doesNotMatch(featureSources, /https?:\/\//i,
  'pixel features must not download remote game artwork or sounds');
assert.doesNotMatch(
  featureSources,
  /(?:new\s+Audio\s*\(|(?:src\s*=|url\s*\()[^\n)]*\.(?:mp3|wav|wave|ogg|oga|m4a|aac|flac))/i,
  'pixel features must not reference prerecorded game audio files'
);
assert.doesNotMatch(
  html,
  /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|mp3|wav|ogg|m4a|aac)(?:[?#][^\s"'<>]*)?/i,
  'the page must not embed remote binary game assets'
);

console.log('Pixel login adventure and achievements UI contract PASS');
