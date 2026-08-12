import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const css = readFileSync('web/styles.css', 'utf8');
const buttonSkin = readFileSync('web/black-gold-buttons.css', 'utf8');
const app = readFileSync('web/app.js', 'utf8');
const updateService = readFileSync('src/main/java/com/femonster/core/UpdateService.java', 'utf8');
const updateScript = readFileSync('scripts/apply-client-update.ps1', 'utf8');
const updateAgent = readFileSync('scripts/fe-monster-update-agent.ps1', 'utf8');

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  assert.notEqual(next, -1, `${name} is incomplete`);
  return source.slice(start, next).trim();
}

assert.match(html, /id="updateNoticeButton"[^>]*hidden/, 'the top update notice must be hidden until a newer release exists');
assert.match(html, /id="updateVersion"/, 'the update page must show the new version');
assert.match(html, /id="updateNotes"/, 'the update page must show GitHub release notes');

assert.match(css, /\.update-notice-button\s*\{[^}]*position:\s*absolute;[^}]*border-radius:\s*50%;/s,
  'the GitHub update notice must be a circular top-bar badge');
assert.match(buttonSkin, /#updateNoticeButton\s*\{[^}]*border-radius:\s*50%\s*!important;/s,
  'the global button skin must preserve the circular update badge');
assert.match(css, /\.update-dialog-notes\s*\{[^}]*white-space:\s*pre-line;/s,
  'GitHub release-note line breaks must remain readable');

assert.match(app, /const CLIENT_UPDATE_GITHUB_API\s*=\s*'https:\/\/api\.github\.com\/repos\/2292576833\/FE-Monster\/releases\/latest';/);
assert.match(app, /const CLIENT_UPDATE_CHECK_INTERVAL_MS\s*=\s*30 \* 60 \* 1000;/,
  'GitHub checks must be rate-limited to two per hour');
assert.match(app, /function compareClientVersions\(/, 'numeric client-version comparison is missing');
assert.match(app, /function normalizeGitHubRelease\(/, 'GitHub release normalization is missing');
assert.match(app, /function setAvailableClientUpdate\(/, 'the available-release state seam is missing');
assert.match(app, /async function checkGitHubClientUpdate\(/, 'the GitHub release check is missing');
assert.match(app, /startInteractiveRuntime[\s\S]{0,900}?checkGitHubClientUpdate\(/,
  'the first update check must start only after the user enters the app');
assert.match(app, /startBackgroundPolling[\s\S]{0,900}?checkGitHubClientUpdate[\s\S]{0,120}?CLIENT_UPDATE_CHECK_INTERVAL_MS/,
  'visible clients must recheck GitHub at the bounded interval');
assert.match(app, /type === 'update\.available'[\s\S]{0,160}?setAvailableClientUpdate/,
  'server push updates must show the notice instead of opening the dialog automatically');
assert.match(app, /updateNoticeButton[\s\S]{0,180}?addEventListener\('click',[\s\S]{0,100}?showUpdateDialog/,
  'clicking the notice must open the update page');

const hideDialog = app.match(/function hideUpdateDialog\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert.ok(hideDialog, 'hideUpdateDialog is missing');
assert.doesNotMatch(hideDialog, /state\.update\.release\s*=\s*null/,
  'closing the update page must keep the top notice reusable');

const helpers = new Function('safeText', 'URL', `
  ${functionBlock(app, 'clientVersionDescriptor')}
  ${functionBlock(app, 'compareClientVersions')}
  ${functionBlock(app, 'officialGitHubReleaseAsset')}
  ${functionBlock(app, 'normalizeGitHubRelease')}
  return { compareClientVersions, normalizeGitHubRelease };
`)((value, fallback = '') => value == null ? fallback : String(value), URL);
assert.equal(helpers.compareClientVersions('v1.8.9', '1.8.8'), 1);
assert.equal(helpers.compareClientVersions('1.8.10', '1.8.9'), 1);
assert.equal(helpers.compareClientVersions('v1.1.6', '1.8.8'), -1, 'old GitHub tags must never be reported as updates');
assert.equal(helpers.compareClientVersions('1.8.8-beta.1', '1.8.8'), -1);
const normalized = helpers.normalizeGitHubRelease({
  tag_name: 'v1.8.9',
  body: '性能优化\n修复更新提示',
  html_url: 'https://github.com/2292576833/FE-Monster/releases/tag/v1.8.9',
  published_at: '2026-07-31T00:00:00Z',
  assets: [{
    name: 'FE-Monster-Setup-1.8.9.exe',
    browser_download_url: 'https://github.com/2292576833/FE-Monster/releases/download/v1.8.9/FE-Monster-Setup-1.8.9.exe',
    size: 1234,
    digest: `sha256:${'a'.repeat(64)}`
  }]
});
assert.equal(normalized.version, '1.8.9');
assert.equal(normalized.releaseNotes, '性能优化\n修复更新提示');
assert.equal(normalized.fileSize, 1234);
assert.equal(normalized.sha256, 'a'.repeat(64));

assert.match(updateService, /isOfficialGitHubReleaseAsset\(downloadUrl\)/,
  'automatic install must reject non-official download URLs');
assert.match(updateService, /sha256\.isBlank\(\)[\s\S]{0,100}?return error\("update sha256 is required"\)/,
  'the local UpdateService must reject a release without a SHA-256 digest');
assert.match(updateService, /"-Sha256"[\s\S]{0,100}?sha256/,
  'the GitHub asset digest must reach the hidden installer process');
assert.match(updateAgent, /\$sha256\s*=\s*\(?\[string\]\$Release\.sha256\)?\.Trim\(\)/i,
  'the background update agent must read the release SHA-256 digest');
assert.match(updateAgent, /'-Sha256'[\s\S]{0,160}?\$sha256/,
  'the background update agent must pass the release SHA-256 digest to the installer');
assert.match(updateAgent, /\$uri\.Scheme\s*-ne\s*'https'/i,
  'the background update agent must reject non-HTTPS release downloads');
assert.match(updateAgent, /ProcessStartInfo[\s\S]{0,900}?\.ArgumentList\.Add\(\$argument\)/i,
  'the background agent must preserve script and install paths containing spaces');
assert.match(updateScript, /update SHA-256 digest is required/i,
  'the update applier must reject an empty SHA-256 digest');
assert.match(updateScript, /\.Scheme[\s\S]{0,120}?-ne\s*'https'/i,
  'the update applier must reject non-HTTPS downloads and redirect targets');
assert.match(updateScript, /Get-FileHash[^\n]*SHA256/i,
  'downloaded GitHub installers must always be SHA-256 verified');
assert.match(updateScript, /Get-AuthenticodeSignature/i,
  'the update applier must inspect the installer Authenticode signature');
assert.match(updateScript, /ValidateSet\('IfPresent',\s*'RequireValid'\)/i,
  'the Authenticode enforcement policy must be configurable');
assert.match(updateScript, /ProcessStartInfo/i,
  'the update applier must launch installers through ProcessStartInfo');
assert.match(updateScript, /\.ArgumentList\.Add\(\$argument\)/i,
  'ProcessStartInfo.ArgumentList must preserve install-directory arguments containing spaces');
assert.match(updateScript, /AllowDevelopmentInstall[\s\S]{0,1000}?\.git/i,
  'a source checkout must not execute a downloaded installer unless explicitly enabled');

console.log('GitHub update notice PASS');
