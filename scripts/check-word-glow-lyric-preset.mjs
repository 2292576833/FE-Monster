import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function balancedBlockAt(source, openingBrace) {
  if (openingBrace < 0 || source[openingBrace] !== '{') return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1] || '';
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace, index + 1);
  }
  return '';
}

function functionBlock(name) {
  const declaration = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`).exec(app);
  if (!declaration) return '';
  const openingParenthesis = app.indexOf('(', declaration.index);
  let parenthesisDepth = 0;
  let quote = '';
  let escaped = false;
  let closingParenthesis = -1;
  for (let index = openingParenthesis; index < app.length; index += 1) {
    const character = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(') parenthesisDepth += 1;
    if (character === ')') parenthesisDepth -= 1;
    if (parenthesisDepth === 0) {
      closingParenthesis = index;
      break;
    }
  }
  if (closingParenthesis < 0) return '';
  const openingBrace = app.indexOf('{', closingParenthesis + 1);
  if (openingBrace < 0) return '';
  return app.slice(declaration.index, openingBrace) + balancedBlockAt(app, openingBrace);
}

function declarationBlock(marker) {
  const markerIndex = app.indexOf(marker);
  if (markerIndex < 0) return '';
  const openingBrace = app.indexOf('{', markerIndex + marker.length);
  if (openingBrace < 0) return '';
  return app.slice(markerIndex, openingBrace) + balancedBlockAt(app, openingBrace);
}

function openingTagsWithAttribute(attribute) {
  return (html.match(/<[a-z][^>]*>/gi) || []).filter((tag) => (
    new RegExp(`\\b${escapeRegExp(attribute)}\\s*=`, 'i').test(tag)
  ));
}

function attributeValue(tag, attribute) {
  return new RegExp(`\\b${escapeRegExp(attribute)}=(["'])([^"']+)\\1`, 'i')
    .exec(tag)?.[2] || '';
}

const textPresetCards = openingTagsWithAttribute('data-text-preset').filter((tag) => (
  /\bclass=(["'])[^"']*\bdiy-preset-card\b[^"']*\1/i.test(tag)
));
const wordGlowCards = textPresetCards.filter((tag) => attributeValue(tag, 'data-text-preset') === 'word-glow');
const defaults = declarationBlock('const DEFAULT_TEXT_COMPOSER_SETTINGS');
const templates = declarationBlock('const TEXT_COMPOSER_TEMPLATE_SETTINGS');
const paletteIds = app.match(/const\s+TEXT_PALETTE_PRESET_IDS\s*=\s*Object\.freeze\(\[[^\]]*\]\)/)?.[0] || '';
const selectablePreset = functionBlock('selectableTextPreset');
const normalizeSettings = functionBlock('normalizeTextComposerSettings');
const syncComposerControls = functionBlock('syncTextComposerControls');
const setComposerSetting = functionBlock('setTextComposerSetting');
const applyComposerSettings = functionBlock('applyTextComposerSettings');
const setPlaybackLine = functionBlock('setPlaybackLyricLine');
const renderMultiRow = functionBlock('renderMultiRowLyrics');
const updatePlaybackCardLyrics = functionBlock('updateQishuiPlaybackLyrics');
const singleRowEffectsAvailable = functionBlock('singleRowLyricEffectsAvailable');
const wordGlowActive = functionBlock('wordGlowLyricActive');
const handwrittenMoodActive = functionBlock('handwrittenMoodLyricActive');
const segmentTokens = functionBlock('segmentWordGlowTokens');
const renderWordGlow = functionBlock('renderWordGlowLyric');
const updateWordGlow = functionBlock('updateWordGlowProgress');
const setWordGlowTokenProgress = functionBlock('setWordGlowTokenProgress');
const triggerWordGlow = functionBlock('triggerWordGlowTransition');
const triggerHandwrittenMood = functionBlock('triggerHandwrittenMoodTransition');
const syncSingleRowEffects = functionBlock('syncSingleRowLyricEffects');
const wordGlowRuntime = [
  segmentTokens,
  renderWordGlow,
  updateWordGlow,
  setWordGlowTokenProgress,
  triggerWordGlow,
  triggerHandwrittenMood,
  syncSingleRowEffects
].join('\n');

const wordGlowCss = css;
const reducedMotionBlocks = Array.from(css.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g))
  .map((match) => balancedBlockAt(css, css.indexOf('{', match.index)))
  .filter((block) => /word-glow/.test(block))
  .join('\n');

const transitionRafCount = (triggerWordGlow.match(/\brequestAnimationFrame\s*\(/g) || []).length;
const tokenSweepWrites = ((updateWordGlow + setWordGlowTokenProgress).match(
  /(?:\bstyle|\w+\.style)\.setProperty\s*\(\s*['"]--word-glow-sweep-position['"]/g
) || []).length;
const wordGlowRules = Array.from(css.matchAll(/[^{}]*word-glow[^{}]*\{[^{}]*\}/g), (match) => match[0])
  .join('\n');

const checks = {
  standaloneWordGlowPresetRemoved: wordGlowCards.length === 0
    && !/\bid=(["'])diyWordGlowTextPreset\1/i.test(html)
    && !/['"]word-glow['"]\s*:/.test(templates)
    && !/word-glow/.test(paletteIds)
    && !/word-glow/.test(selectablePreset),

  animationModeControlLivesInAnimationPanel:
    /id=(["'])textLyricHighlightMode\1[^>]*data-text-composer-setting=(["'])lyricHighlightMode\2/i.test(html)
    && /<option[^>]+value=(["'])rolling\1[^>]*>滚动高亮<\/option>/i.test(html)
    && /<option[^>]+value=(["'])shine\1[^>]*>擦亮扫光<\/option>/i.test(html)
    && html.indexOf('id="textLyricHighlightMode"') > html.indexOf('id="textAnimationSettingsGroup"'),

  handwrittenMoodIsIndependentSwitch:
    /id=(["'])textHandwrittenMoodToggle\1[^>]*data-text-composer-setting=(["'])handwrittenMoodEnabled\2/i.test(html)
    && /手写心情/.test(html)
    && /is-handwritten-mood-text/.test(applyComposerSettings)
    && /handwrittenMoodLyricActive/.test(applyComposerSettings),

  settingsNormalizeAndPersistBothChoices:
    /lyricHighlightMode\s*:\s*['"]rolling['"]/.test(defaults)
    && /handwrittenMoodEnabled\s*:\s*false/.test(defaults)
    && /lyricHighlightMode\s*:\s*\[['"]rolling['"],\s*['"]shine['"]\]/.test(normalizeSettings)
    && /handwrittenMoodEnabled\s*:\s*source\?\.handwrittenMoodEnabled\s*===\s*true/.test(normalizeSettings)
    && /lyricHighlightMode/.test(syncComposerControls)
    && /handwrittenMoodEnabled/.test(syncComposerControls)
    && /DEFAULT_TEXT_COMPOSER_SETTINGS/.test(setComposerSetting),

  modesOnlyActivateForSingleRowWithoutForcingLayout:
    /layoutMode\s*===\s*['"]single['"]/.test(singleRowEffectsAvailable)
    && /singleRowLyricEffectsAvailable/.test(wordGlowActive)
    && /lyricHighlightMode\s*===\s*['"]shine['"]/.test(wordGlowActive)
    && /singleRowLyricEffectsAvailable/.test(handwrittenMoodActive)
    && /handwrittenMoodEnabled/.test(handwrittenMoodActive)
    && !/layoutMode\s*[:=]\s*['"]single['"]/.test(syncSingleRowEffects),

  unicodeWordSegmentationHasFallback: /Intl\.Segmenter/.test(segmentTokens)
    && /granularity\s*:\s*['"]word['"]/.test(segmentTokens)
    && /isWordLike/.test(segmentTokens)
    && (
      /\\p\{(?:L|Letter|N|Number)\}/.test(segmentTokens)
      || /Array\.from/.test(segmentTokens)
    ),

  renderBuildsCachedSpanTokensOnlyOnTextChange: /createElement\s*\(\s*['"]span['"]\s*\)/.test(renderWordGlow)
    && /word-glow-token/.test(renderWordGlow)
    && /segmentWordGlowTokens/.test(renderWordGlow)
    && /textContent/.test(renderWordGlow)
    && /(?:__wordGlow|cached|cache|signature|lastText|lineChanged|!==)/i.test(renderWordGlow)
    && /(?:replaceChildren|appendChild|append)\s*\(/.test(renderWordGlow),

  eachTokenOwnsItsLocalSpecularSweep: /\.word-glow-token::after/.test(wordGlowCss)
    && /--word-glow-sweep-position/.test(wordGlowCss)
    && /(?:-webkit-)?mask-position\s*:\s*var\(--word-glow-sweep-position/.test(wordGlowCss)
    && /linear-gradient/.test(wordGlowCss)
    && /(?:-webkit-)?mask-image\s*:/.test(wordGlowCss)
    && tokenSweepWrites >= 1
    && !/--lyric-line-progress/.test(updateWordGlow),

  sweepDoesNotAccumulateKaraokeFill:
    /\.word-glow-token\.is-complete::after\s*\{[^}]*opacity\s*:\s*0/s.test(wordGlowCss)
    && !/\.word-glow-token::after\s*\{[^}]*clip-path\s*:/s.test(wordGlowCss)
    && /\.word-glow-token\.is-active::after\s*\{[^}]*opacity\s*:\s*1/s.test(wordGlowCss),

  sweepPreservesConfiguredLyricColor:
    /--word-glow-base\s*:\s*var\(--lyric-(?:font-base|primary)/.test(wordGlowCss)
    && /\.word-glow-token::after\s*\{[^}]*(?:color\s*:\s*(?:inherit|currentColor))/s.test(wordGlowCss)
    && !/\.word-glow-token::after\s*\{[^}]*var\(--word-glow-accent\)/s.test(wordGlowCss),

  frameUpdateUsesTokenCacheWithoutDomRebuild: /(?:tokens|wordGlowTokens|wordGlow\.tokens)/.test(updateWordGlow)
    && /\b(?:active|current)\w*(?:Index|Token|Word)\b/i.test(updateWordGlow)
    && (
      /\b(?:last|previous|cached)\w*(?:Index|Token|Word)\b/i.test(updateWordGlow)
      || /cache\.(?:active|current)\w*Index/.test(updateWordGlow)
    )
    && /setWordGlowTokenProgress/.test(updateWordGlow)
    && /--word-glow-sweep-position/.test(setWordGlowTokenProgress)
    && !/(?:querySelector|createElement|replaceChildren|appendChild|append)\s*\(/.test(updateWordGlow)
    && /(?:!==|===|Math\.abs)/.test(updateWordGlow),

  handwrittenMoodUsesRedScriptAndDelayedOneShot:
    /\.is-handwritten-mood-text[^{}]*\.word-glow-lyric-keyword/.test(wordGlowCss)
    && /font-family\s*:[^;]*(?:FE Caveat|Caveat|cursive)/i.test(wordGlowCss)
    && /--word-glow-accent\s*:\s*(?:#[fF][0-9a-fA-F]{5}|rgb\(\s*2(?:[0-4]\d|5[0-5]))/.test(wordGlowCss)
    && /handwrittenMoodLyricActive/.test(triggerHandwrittenMood)
    && /delay\s*:\s*70/.test(triggerHandwrittenMood)
    && /\.animate\s*\(/.test(triggerHandwrittenMood)
    && /triggerHandwrittenMoodTransition\s*\(/.test(setPlaybackLine),

  lineSwitchUsesFiniteOneShotMotion: /triggerWordGlowTransition\s*\(/.test(setPlaybackLine + renderWordGlow)
    && (
      (
        /is-word-glow-entering/.test(triggerWordGlow)
        && /is-word-glow-entering/.test(wordGlowCss)
        && /animation\s*:/.test(wordGlowCss)
      )
      || (
        /\.animate\s*\(/.test(triggerWordGlow)
        && /duration\s*:\s*\d+/.test(triggerWordGlow)
        && /onfinish/.test(triggerWordGlow)
      )
    )
    && !/\binfinite\b/.test(wordGlowRules)
    && !new RegExp(`\\btriggerWordGlowTransition\\s*\\(`).test(
      triggerWordGlow.slice(triggerWordGlow.indexOf('{') + 1)
    ),

  reducedMotionRemovesTranslationAndAnimation: /animation\s*:\s*none(?:\s*!important)?/.test(reducedMotionBlocks)
    && /transform\s*:\s*none(?:\s*!important)?/.test(reducedMotionBlocks),

  presetHasNoResidentAnimationLoop: !/\bsetInterval\s*\(/.test(wordGlowRuntime)
    && !/\brequestAnimationFrame\s*\(/.test(segmentTokens + renderWordGlow + updateWordGlow)
    && transitionRafCount <= 2
    && !/requestAnimationFrame\s*\(\s*(?:\(\)\s*=>\s*)?updateWordGlowProgress/.test(triggerWordGlow),

  effectIsConfinedToSingleRowRenderer: /renderWordGlowLyric\s*\(/.test(setPlaybackLine)
    && /updateWordGlowProgress\s*\(/.test(setPlaybackLine)
    && !/wordGlow|word-glow/i.test(renderMultiRow)
    && !/wordGlow|word-glow/i.test(updatePlaybackCardLyrics)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed);
console.log(JSON.stringify({
  checks,
  passed: failures.length === 0,
  failedChecks: failures.map(([name]) => name)
}, null, 2));
if (failures.length) process.exitCode = 1;
