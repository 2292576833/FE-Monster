import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const liquidSwitches = fs.readFileSync(path.join(root, 'web', 'liquid-ether-switches.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function functionBlock(name) {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) return '';
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = app.indexOf('(', start); index < app.length; index += 1) {
    if (app[index] === '(') parameterDepth += 1;
    if (app[index] === ')') parameterDepth -= 1;
    if (parameterDepth === 0) {
      bodyStart = app.indexOf('{', index);
      break;
    }
  }
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}') depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  return '';
}

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{`, 'g')));
  const start = matches.length ? matches.at(-1).index : -1;
  if (start < 0) return '';
  const bodyStart = css.indexOf('{', start);
  const bodyEnd = bodyStart < 0 ? -1 : css.indexOf('}', bodyStart);
  return bodyEnd < 0 ? '' : css.slice(start, bodyEnd + 1);
}

function cssRules(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{`, 'g')), (match) => {
    const bodyStart = css.indexOf('{', match.index);
    const bodyEnd = bodyStart < 0 ? -1 : css.indexOf('}', bodyStart);
    return bodyEnd < 0 ? '' : css.slice(match.index, bodyEnd + 1);
  }).join('\n');
}

const normalize = functionBlock('normalizeTextComposerSettings');
const selectPreset = functionBlock('selectableTextPreset');
const singleRowPreset = functionBlock('singleRowOnlyTextPreset');
const textButtons = functionBlock('textPresetButtons');
const syncButtons = functionBlock('syncTextPresetButtons');
const glitchActive = functionBlock('glitchTextEffectActive');
const applyComposer = functionBlock('applyTextComposerSettings');
const presetTargets = functionBlock('textPresetTargets');
const beginGesture = functionBlock('beginTextPresetGesture');
const moveGesture = functionBlock('moveTextPresetGesture');
const composerGridRule = cssRule('.diy-text-composer-grid');
const sidebarRangeRule = cssRule('.diy-sidebar input[type="range"]');
const sidebarRangeTrackRule = cssRule('.diy-sidebar input[type="range"]::-webkit-slider-runnable-track');
const sidebarCheckboxRule = cssRule('.diy-sidebar input[type="checkbox"]');
const unifiedSwitchRule = cssRules('html .app-shell input.ui-switch[type="checkbox"]');
const checkedSwitchRule = cssRules('html .app-shell input.ui-switch[type="checkbox"]:checked');
const focusedSwitchRule = cssRules('html .app-shell input.ui-switch[type="checkbox"]:focus-visible');
const disabledSwitchRule = cssRules('html .app-shell input.ui-switch[type="checkbox"]:disabled');
const liquidCanvasRule = cssRules('.liquid-ether-switch-layer');
const matteSettingsRule = cssRules('html .runtime-settings-panel');
const matteSettingsSection = css.slice(css.lastIndexOf('/* Runtime settings use a solid matte-black hierarchy.'));
const checkboxTags = Array.from(html.matchAll(/<input\b[^>]*\btype=["']checkbox["'][^>]*>/gi), (match) => match[0]);
const threeScriptIndex = html.indexOf('vendor/three.r128.min.js');
const liquidSwitchScriptIndex = html.indexOf('liquid-ether-switches.js');
const appScriptIndex = html.indexOf('src="app.js');

const checks = {
  normalLyricCardRestored: /id=["']diyLyricPreset["'][^>]*data-text-preset=["']depth["']/.test(html),
  focusEchoCardRestored: /id=["']diyFocusEchoTextPreset["'][^>]*data-text-preset=["']focus-echo["']/.test(html),
  standaloneWordGlowCardRemoved: !/id=["']diyWordGlowTextPreset["']/.test(html)
    && /id=["']textLyricHighlightMode["'][^>]*data-text-composer-setting=["']lyricHighlightMode["']/.test(html),
  textCardsAreSelectable: /\[data-text-preset\]/.test(textButtons)
    && /textPresetButtons/.test(syncButtons)
    && /focus-echo/.test(selectPreset)
    && !/word-glow/.test(selectPreset)
    && /setTextPreset\(button\.dataset\.textPreset\s*,/.test(app),
  bookRemovedFromLayoutMenu: !/<option\s+value=["']book["']/.test(html)
    && !/\[['"]single['"],\s*['"]multi['"],\s*['"]book['"]\]/.test(normalize),
  focusEchoBlocksUnsungBlur: /focus-echo/.test(singleRowPreset)
    && !/word-glow/.test(singleRowPreset)
    && /singleRowOnlyTextPreset/.test(applyComposer)
    && /effectiveUnsungBlur/.test(applyComposer),
  focusEchoBlocksGlitch: /focus-echo/.test(glitchActive)
    && /wordGlowLyricActive/.test(glitchActive),
  multiRowUsesSharedTransformGesture: /multiRowLyric(?:List|Stage)/.test(presetTargets)
    && /zone/.test(beginGesture)
    && /rotateX/.test(moveGesture)
    && /rotateY/.test(moveGesture)
    && /--text-preset-x/.test(css)
    && /\.multi-row-lyric-stage[\s\S]{0,900}--text-preset-rotate-z/.test(css),
  everyComposerSliderGetsOwnRow: /grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(composerGridRule),
  sidebarSlidersAreLarger: /min-height:\s*(?:3[0-9]|[4-9][0-9])px/.test(sidebarRangeRule)
    && /height:\s*(?:[7-9]|[1-9][0-9])px/.test(sidebarRangeTrackRule),
  sidebarCheckboxesHaveNoNativeBlueCheck: /(?:appearance|-webkit-appearance):\s*none/.test(sidebarCheckboxRule),
  everyBooleanControlUsesUnifiedSwitch: checkboxTags.length > 0
    && checkboxTags.every((tag) => /class=["'][^"']*\bui-switch\b/.test(tag))
    && checkboxTags.every((tag) => /role=["']switch["']/.test(tag))
    && checkboxTags.every((tag) => !/tabindex=["']-1["']/.test(tag)),
  unifiedSwitchKeepsNativeInputSemantics: /appearance:\s*none/.test(unifiedSwitchRule)
    && /width:\s*46px/.test(unifiedSwitchRule)
    && /height:\s*24px/.test(unifiedSwitchRule)
    && /cursor:\s*pointer/.test(unifiedSwitchRule)
    && !/display:\s*none/.test(unifiedSwitchRule)
    && /radial-gradient/.test(checkedSwitchRule),
  liquidSwitchesHaveNoThumbShape: !/--fe-switch-thumb/.test(css)
    && !/thumb(?:Center|Point|Distance|Mask|Sheen|Color|Glow)/.test(liquidSwitches),
  unifiedSwitchHasAccessibleStates: /outline:\s*2px/.test(focusedSwitchRule)
    && /cursor:\s*not-allowed/.test(disabledSwitchRule)
    && /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/.test(css)
    && /@media\s*\(forced-colors:\s*active\)/.test(css),
  liquidEtherPaletteAndDependencyInstalled: packageJson.dependencies?.three === '^0.185.1'
    && ['#5227FF', '#FF9FFC', '#B497CF'].every((color) => liquidSwitches.includes(color)),
  liquidEtherLoadsAfterThreeBeforeApp: threeScriptIndex >= 0
    && liquidSwitchScriptIndex > threeScriptIndex
    && appScriptIndex > liquidSwitchScriptIndex,
  liquidEtherUsesOneSharedRenderer: (liquidSwitches.match(/new THREE\.WebGLRenderer/g) || []).length === 1
    && /rendererCount:\s*renderer\s*\?\s*1\s*:\s*0/.test(liquidSwitches)
    && /canvasCount:/.test(liquidSwitches)
    && /contain:\s*strict/.test(liquidCanvasRule),
  liquidEtherRetainsMouseInteraction: /addEventListener\(["']pointerenter["']/.test(liquidSwitches)
    && /addEventListener\(["']pointermove["']/.test(liquidSwitches)
    && /addEventListener\(["']pointerdown["']/.test(liquidSwitches)
    && /uPointer/.test(liquidSwitches)
    && /uVelocity/.test(liquidSwitches)
    && /mouseInteractive:\s*true/.test(liquidSwitches),
  liquidEtherReleasesIdleAnimation: /IDLE_TIMEOUT_MS\s*=\s*950/.test(liquidSwitches)
    && /concealCanvas\(\)/.test(liquidSwitches)
    && /document\.hidden/.test(liquidSwitches),
  sandboxLegacyTrackIsNotDuplicated: /\.sandbox-switch\s*>\s*span\s*\{[\s\S]*?display:\s*none/.test(css),
  runtimeSettingsUseMatteBlack: /background:\s*#0b0c0e\s*!important/.test(matteSettingsRule)
    && /background-image:\s*none\s*!important/.test(matteSettingsRule)
    && /backdrop-filter:\s*none\s*!important/.test(matteSettingsRule)
    && /background:\s*#111316\s*!important/.test(matteSettingsSection)
    && /@media\s*\(forced-colors:\s*active\)[\s\S]*?html \.runtime-settings-panel\s*\{[\s\S]*?background:\s*Canvas\s*!important/.test(matteSettingsSection)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed);
console.log(JSON.stringify({ checks, passed: failures.length === 0 }, null, 2));
if (failures.length) process.exitCode = 1;
