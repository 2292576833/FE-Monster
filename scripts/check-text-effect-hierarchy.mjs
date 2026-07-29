import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const styles = readFileSync(path.join(root, 'web', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function countElementId(source, id) {
  return (source.match(new RegExp(`\\bid=(["'])${escapeRegExp(id)}\\1`, 'gi')) || []).length;
}

function elementById(source, id) {
  const opening = new RegExp(
    `<([a-z][\\w:-]*)\\b[^>]*\\bid=(["'])${escapeRegExp(id)}\\2[^>]*>`,
    'i'
  ).exec(source);
  if (!opening) return null;
  const tagName = opening[1];
  const start = opening.index;
  const openingEnd = start + opening[0].length;
  if (/\/\s*>$/.test(opening[0]) || /^(?:input|br|hr|img|meta|link)$/i.test(tagName)) {
    return { id, tagName, start, end: openingEnd, html: source.slice(start, openingEnd) };
  }
  const tags = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    const closing = /^<\//.test(match[0]);
    const selfClosing = /\/\s*>$/.test(match[0]);
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) {
      const end = match.index + match[0].length;
      return { id, tagName, start, end, html: source.slice(start, end) };
    }
  }
  return null;
}

function containsElement(parent, child) {
  return !!parent && !!child && child.start >= parent.start && child.end <= parent.end;
}

function elementText(element) {
  return (element?.html || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function openingTagsWithAttribute(source, attribute) {
  const tags = source.match(/<[a-z][^>]*>/gi) || [];
  const expression = new RegExp(`\\b${escapeRegExp(attribute)}=(["'])([^"']+)\\1`, 'i');
  return tags
    .map((tag) => {
      const match = expression.exec(tag);
      return match ? { tag, value: match[2] } : null;
    })
    .filter(Boolean);
}

function interactiveIds(source) {
  return (source.match(/<(?:button|input|select|textarea)\b[^>]*>/gi) || [])
    .map((tag) => /\bid=(["'])([^"']+)\1/i.exec(tag)?.[2] || '')
    .filter(Boolean);
}

function attributeValue(element, attribute) {
  const expression = new RegExp(`\\b${escapeRegExp(attribute)}=(["'])([^"']+)\\1`, 'i');
  return expression.exec(element?.html || '')?.[2] || '';
}

function cssRules(source) {
  const rules = [];
  const expression = /([^{}]+)\{([^{}]*)\}/g;
  for (let match = expression.exec(source); match; match = expression.exec(source)) {
    rules.push({ selector: match[1].trim(), body: match[2].trim() });
  }
  return rules;
}

function balancedBlock(source, marker, openCharacter = '{', closeCharacter = '}') {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return '';
  const start = source.indexOf(openCharacter, markerIndex + marker.length);
  if (start < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
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
    if (character === openCharacter) depth += 1;
    if (character === closeCharacter) depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

function balancedBlocks(source, marker) {
  const blocks = [];
  let offset = 0;
  for (;;) {
    const markerIndex = source.indexOf(marker, offset);
    if (markerIndex < 0) return blocks;
    const block = balancedBlock(source.slice(markerIndex), marker);
    if (!block) return blocks;
    blocks.push(block);
    const openingIndex = source.indexOf('{', markerIndex + marker.length);
    offset = openingIndex + block.length;
  }
}

function functionBlock(name) {
  const declaration = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`).exec(app);
  if (!declaration) return '';
  const parameterStart = declaration.index + declaration[0].lastIndexOf('(');
  let depth = 0;
  let quote = '';
  let escaped = false;
  let parameterEnd = -1;
  for (let index = parameterStart; index < app.length; index += 1) {
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
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0) {
      parameterEnd = index;
      break;
    }
  }
  if (parameterEnd < 0) return '';
  const openingIndex = app.indexOf('{', parameterEnd + 1);
  return openingIndex < 0 ? '' : balancedBlock(app.slice(openingIndex), '');
}

const textPage = elementById(html, 'diyTextPage');
const groups = {
  translation: elementById(html, 'textTranslationSettingsGroup'),
  color: elementById(html, 'textColorEffectsGroup'),
  animation: elementById(html, 'textAnimationSettingsGroup'),
  glitch: elementById(html, 'textGlitchControl')
};

const translationControlIds = [
  'bilingualLyricsToggle',
  'multiRowLineCount',
  'translationFontSize',
  'translationGap',
  'translationOpacity'
];
const translationOutputIds = [
  'multiRowLineCountValue',
  'translationFontSizeValue',
  'translationGapValue',
  'translationOpacityValue'
];
const colorControlIds = [
  'textHighlightIntensity',
  'textHighlightSoftness',
  'textGloss',
  'textLowBassGlow',
  'lyricBrightnessRange',
  'textPaletteControl',
  'playbackLyricPaletteControl'
];
const animationControlIds = [
  'textLyricsToggle',
  'textFlowIntensity',
  'textEchoLayers',
  'textEchoSpacing',
  'lyricSpeedRange',
  'textGlitchControl'
];
const glitchControlIds = [
  'textGlitchToggle',
  'textGlitchSpeed',
  'textGlitchRgbOffset',
  'textGlitchSliceDensity',
  'textGlitchBeatSensitivity',
  'textGlitchBeatDuration'
];
const glitchOutputIds = [
  'textGlitchValue',
  'textGlitchSpeedValue',
  'textGlitchRgbOffsetValue',
  'textGlitchSliceDensityValue',
  'textGlitchBeatSensitivityValue',
  'textGlitchBeatDurationValue'
];
const glitchPresetTags = openingTagsWithAttribute(textPage?.html || '', 'data-text-preset')
  .filter(({ value }) => value === 'glitch');
const allGlitchPresetTags = openingTagsWithAttribute(html, 'data-text-preset')
  .filter(({ value }) => value === 'glitch');
const textPresetCardTags = openingTagsWithAttribute(textPage?.html || '', 'data-text-preset')
  .filter(({ tag }) => /\bdiy-preset-card\b/i.test(tag));
const allTextPresetCardTags = openingTagsWithAttribute(html, 'data-text-preset')
  .filter(({ tag }) => /\bdiy-preset-card\b/i.test(tag));
const textPresetCardValues = textPresetCardTags.map(({ value }) => value).sort();
const textPresetCardIds = textPresetCardTags
  .map(({ tag }) => /\bid=(["'])([^"']+)\1/i.exec(tag)?.[2] || '')
  .filter(Boolean)
  .sort();
const allContractIds = [
  'textTranslationSettingsGroup',
  'textColorEffectsGroup',
  'textAnimationSettingsGroup',
  'textGlitchControl',
  ...translationControlIds,
  ...translationOutputIds,
  ...colorControlIds,
  ...animationControlIds,
  ...glitchControlIds,
  ...glitchOutputIds
];
const elements = Object.fromEntries(
  [...new Set(allContractIds)].map((id) => [id, elementById(html, id)])
);

const expectedGlitchSettings = [
  'glitchEnabled',
  'glitchSpeed',
  'glitchRgbOffset',
  'glitchSliceDensity',
  'glitchBeatSensitivity',
  'glitchBeatDuration'
];
const expectedGlitchDataSettings = [
  'enabled',
  'speed',
  'rgbOffset',
  'sliceDensity',
  'beatSensitivity',
  'beatDuration'
];
const newControlStateKeys = {
  textLyricsToggle: 'lyricsEnabled',
  multiRowLineCount: 'multiRowLineCount',
  translationFontSize: 'translationFontSize',
  translationGap: 'translationGap',
  translationOpacity: 'translationOpacity',
  textGlitchToggle: 'glitchEnabled',
  textGlitchSpeed: 'glitchSpeed',
  textGlitchRgbOffset: 'glitchRgbOffset',
  textGlitchSliceDensity: 'glitchSliceDensity',
  textGlitchBeatSensitivity: 'glitchBeatSensitivity',
  textGlitchBeatDuration: 'glitchBeatDuration'
};
const actualGlitchSettings = openingTagsWithAttribute(
  groups.glitch?.html || '',
  'data-text-glitch-setting'
).map(({ value }) => value);
const actualGlitchInteractiveIds = interactiveIds(groups.glitch?.html || '');
const actualTranslationInteractiveIds = interactiveIds(groups.translation?.html || '');
const actualAnimationInteractiveIds = interactiveIds(groups.animation?.html || '');

const paletteIdsInTextPage = Array.from(
  (textPage?.html || '').matchAll(/\bid=(["'])([a-z0-9-]*PaletteControl)\1/gi),
  (match) => match[2]
);

const defaultSettings = balancedBlock(app, 'const DEFAULT_TEXT_COMPOSER_SETTINGS');
const templateSettings = balancedBlock(app, 'const TEXT_COMPOSER_TEMPLATE_SETTINGS');
const normalizeSettings = functionBlock('normalizeTextComposerSettings');
const saveSettings = functionBlock('saveTextComposerSettings');
const flushSettingsSave = functionBlock('flushTextComposerSettingsSave');
const loadSettings = functionBlock('loadTextComposerSettings');
const syncControls = functionBlock('syncTextComposerControls');
const applySettings = functionBlock('applyTextComposerSettings');
const setComposerSetting = functionBlock('setTextComposerSetting');
const renderMultiRow = functionBlock('renderMultiRowLyrics');
const bindEvents = functionBlock('bindEvents');
const selectablePreset = functionBlock('selectableTextPreset');
const composerTemplate = functionBlock('textComposerTemplateSettings');
const syncGlitchLayers = functionBlock('syncGlitchTextLayers');
const glitchActive = functionBlock('glitchTextEffectActive');
const applyGlitchVars = functionBlock('applyGlitchTextCssVars');
const textComposerBinding = balancedBlock(app, 'if (els.textComposerControl)');

const settingKeys = [
  'lyricsEnabled',
  'multiRowLineCount',
  'translationFontSize',
  'translationGap',
  'translationOpacity',
  ...expectedGlitchSettings
];
const translationVariables = [
  '--multi-row-line-count',
  '--translation-font-size',
  '--translation-gap',
  '--translation-opacity'
];
const glitchVariables = [
  '--text-glitch-speed',
  '--text-glitch-rgb-offset',
  '--text-glitch-slice-density',
  '--text-glitch-beat-duration'
];
const glitchDurationVariables = [
  '--text-glitch-cyan-duration',
  '--text-glitch-magenta-duration'
];
const saveDebounceMilliseconds = Number(
  /const\s+TEXT_COMPOSER_SAVE_DEBOUNCE_MS\s*=\s*(\d+)\s*;/.exec(app)?.[1]
);
const structuralExpression = /const\s+structural\s*=\s*([^;]+);/.exec(setComposerSetting)?.[1] || '';
const structuralKeys = Array.from(
  structuralExpression.matchAll(/\bkey\s*===\s*['"]([^'"]+)['"]/g),
  (match) => match[1]
);
const composerApplyCall = balancedBlock(setComposerSetting, 'applyTextComposerSettings');
const measureSubtitleExpression = /measureSubtitle\s*:\s*([^,\n}]+)/.exec(composerApplyCall)?.[1] || '';
const cyanCopyRule = cssRules(styles).find(({ selector }) => (
  /\.playback-lyric-scene\.is-text-glitch-active\s+\.text-glitch-copy--cyan/.test(selector)
));
const magentaCopyRule = cssRules(styles).find(({ selector }) => (
  /\.playback-lyric-scene\.is-text-glitch-active\s+\.text-glitch-copy--magenta/.test(selector)
));
const durationDeclarationCount = (rule) => (
  rule?.body.match(/(?:^|;)\s*animation-duration\s*:/gi) || []
).length;
const durationDeclarations = (rule) => Array.from(
  (rule?.body || '').matchAll(/(?:^|;)\s*animation-duration\s*:\s*([^;]+)/gi),
  (match) => match[1].trim()
);
const cyanDurations = durationDeclarations(cyanCopyRule);
const magentaDurations = durationDeclarations(magentaCopyRule);
const unsafeGlitchHighlightRules = cssRules(styles).filter(({ selector, body }) => (
  /is-text-glitch-active/.test(selector)
  && /\.lyric-depth-0::(?:before|after)/.test(selector)
  && /(?:^|;)\s*(?:content|mask(?:-image|-position|-size)?)\s*:/i.test(body)
));
const reducedMotionBlocks = balancedBlocks(styles, '@media (prefers-reduced-motion: reduce)');

const uniqueDomIds = [...new Set(allContractIds)].every((id) => countElementId(html, id) === 1);
const groupsAreSiblings = groups.translation
  && groups.color
  && groups.animation
  && !containsElement(groups.translation, groups.color)
  && !containsElement(groups.translation, groups.animation)
  && !containsElement(groups.color, groups.translation)
  && !containsElement(groups.color, groups.animation)
  && !containsElement(groups.animation, groups.translation)
  && !containsElement(groups.animation, groups.color);
const detailsHierarchy = Object.values({
  translation: groups.translation,
  color: groups.color,
  animation: groups.animation
}).every((group) => group?.tagName.toLowerCase() === 'details' && containsElement(textPage, group));
const hierarchyLabels = elementText(groups.translation).includes('显示翻译')
  && elementText(groups.color).includes('颜色光效')
  && elementText(groups.animation).includes('歌词动画');

const groupContainsIds = (group, ids) => ids.every((id) => containsElement(group, elements[id]));
const glitchKeysAreIsolated = actualGlitchSettings.length === expectedGlitchSettings.length
  && new Set(actualGlitchSettings).size === expectedGlitchSettings.length
  && expectedGlitchDataSettings.every((key) => actualGlitchSettings.includes(key))
  && !translationControlIds.some((id) => containsElement(groups.glitch, elements[id]))
  && !colorControlIds.some((id) => containsElement(groups.glitch, elements[id]))
  && actualGlitchInteractiveIds.length === glitchControlIds.length
  && glitchControlIds.every((id) => actualGlitchInteractiveIds.includes(id));

const checks = {
  threeDetailsHierarchiesExist: detailsHierarchy,
  hierarchyLabelsAreCorrect: hierarchyLabels,
  hierarchyGroupsDoNotNestEachOther: !!groupsAreSiblings,
  contractIdsAreUnique: uniqueDomIds,
  translationControlsStayTogether: groupContainsIds(
    groups.translation,
    [...translationControlIds, ...translationOutputIds]
  ),
  colorAndPaletteControlsStayTogether: groupContainsIds(groups.color, colorControlIds),
  everyTextPagePaletteIsInColorGroup: paletteIdsInTextPage.length >= 2
    && new Set(paletteIdsInTextPage).size === paletteIdsInTextPage.length
    && paletteIdsInTextPage.every((id) => containsElement(groups.color, elementById(html, id))),
  animationControlsStayTogether: groupContainsIds(groups.animation, animationControlIds)
    && containsElement(groups.animation, groups.glitch),
  onlyRestoredTextPresetCardsExist: allTextPresetCardTags.length === 2
    && textPresetCardTags.length === 2
    && textPresetCardValues.join('|') === 'depth|focus-echo'
    && textPresetCardIds.join('|') === 'diyFocusEchoTextPreset|diyLyricPreset'
    && glitchPresetTags.length === 0
    && allGlitchPresetTags.length === 0,
  glitchControlsStayInDedicatedContainer: groupContainsIds(
    groups.glitch,
    [...glitchControlIds, ...glitchOutputIds]
  ),
  glitchKeysAreIsolated,
  groupInteractiveControlsAreIsolated: actualTranslationInteractiveIds.length === translationControlIds.length
    && translationControlIds.every((id) => actualTranslationInteractiveIds.includes(id))
    && actualAnimationInteractiveIds.length === animationControlIds.length - 1 + glitchControlIds.length
    && [...animationControlIds.slice(0, -1), ...glitchControlIds]
      .every((id) => actualAnimationInteractiveIds.includes(id)),
  newControlTypesAndOutputsAreSemantic: translationControlIds.slice(1).every((id) => (
    attributeValue(elements[id], 'type') === 'range'
    && html.includes(`for="${id}"`)
    && elements[`${id}Value`]
  ))
    && attributeValue(elements.textGlitchToggle, 'type') === 'checkbox'
    && glitchControlIds.slice(1).every((id) => (
      attributeValue(elements[id], 'type') === 'range'
      && html.includes(`for="${id}"`)
      && elements[`${id}Value`]
    )),
  newSettingsHaveDefaults: settingKeys.every((key) => new RegExp(`\\b${key}\\s*:`).test(defaultSettings)),
  settingsAreNormalized: settingKeys.every((key) => new RegExp(`\\b${key}\\b`).test(normalizeSettings))
    && /const\s+odd\s*=/.test(normalizeSettings)
    && /multiRowLineCount\s*:\s*odd\(/.test(normalizeSettings),
  settingsUseExistingPersistence: /fe-monster-text-composer-v1/.test(app)
    && /TEXT_COMPOSER_PREFS_KEY/.test(saveSettings)
    && /state\.textComposerSettings/.test(saveSettings)
    && settingKeys.every((key) => defaultSettings.includes(key) && normalizeSettings.includes(key))
    && /TEXT_COMPOSER_PREFS_KEY/.test(loadSettings),
  settingsPersistenceUsesShortDebounceAndPagehideFlush: Number.isFinite(saveDebounceMilliseconds)
    && saveDebounceMilliseconds >= 50
    && saveDebounceMilliseconds <= 250
    && /window\.clearTimeout\(textComposerSaveTimer\)/.test(saveSettings)
    && /window\.setTimeout\(commit,\s*TEXT_COMPOSER_SAVE_DEBOUNCE_MS\)/.test(saveSettings)
    && /if\s*\(immediate\)\s*\{[\s\S]*?commit\(\)/.test(saveSettings)
    && /textComposerSaveTimer/.test(flushSettingsSave)
    && /saveTextComposerSettings\(\{\s*immediate:\s*true\s*\}\)/.test(flushSettingsSave)
    && /addEventListener\(['"]pagehide['"],\s*flushTextComposerSettingsSave\)/.test(textComposerBinding),
  controlsAreRegisteredAndSynchronized: [
    ...translationControlIds.slice(1),
    ...glitchControlIds
  ].every((id) => app.includes(`$('#${id}')`) && syncControls.includes(`els.${id}`)),
  newInputsMapDirectlyToStateKeys: Object.entries(newControlStateKeys).every(([id, key]) => (
    new RegExp(`\\bdata-text-composer-setting=(["'])${escapeRegExp(key)}\\1`).test(elements[id]?.html || '')
  )),
  inputsReachComposerSettings: /data-text-composer-setting/.test(bindEvents)
    && /setTextComposerSetting/.test(bindEvents)
    && /type\s*===\s*['"]checkbox['"]/.test(bindEvents)
    && /checked/.test(bindEvents),
  structuralSettingsAreStrictlyWhitelisted: structuralKeys.length === 3
    && new Set(structuralKeys).size === 3
    && structuralKeys.includes('lyricsEnabled')
    && structuralKeys.includes('layoutMode')
    && structuralKeys.includes('multiRowLineCount'),
  rangeInputHotPathSkipsLyricRenderAndMeasurement: /renderLyrics\s*:\s*structural/.test(composerApplyCall)
    && !!measureSubtitleExpression
    && !/translationFontSize|translationOpacity|glitch|flow|echo|depth|highlight|gloss|blur|spacing/i
      .test(measureSubtitleExpression)
    && /translationGap/.test(measureSubtitleExpression)
    && /options\.commit\s*===\s*true/.test(measureSubtitleExpression)
    && /addEventListener\(['"]input['"],[\s\S]*?updateTextComposerFromControl\(event\);/.test(
      textComposerBinding
    ),
  selectAndCheckboxAvoidDuplicateInputHandling: (
    textComposerBinding.match(/addEventListener\(['"]input['"]/g) || []
  ).length === 1
    && (
      textComposerBinding.match(/addEventListener\(['"]change['"]/g) || []
    ).length === 1
    && /control\.tagName\s*===\s*['"]SELECT['"]\s*\|\|\s*control\.type\s*===\s*['"]checkbox['"]/.test(
      textComposerBinding
    )
    && /addEventListener\(['"]change['"],[\s\S]*?updateTextComposerFromControl\(event,\s*true\)/.test(
      textComposerBinding
    ),
  translationVariablesAreApplied: translationVariables.every((variable) => applySettings.includes(variable))
    && styles.includes('--multi-row-line-count:')
    && translationVariables.slice(1).every((variable) => styles.includes(`var(${variable}`)),
  translationParametersDriveRenderedLyrics: /multiRowLineCount/.test(renderMultiRow)
    && !/start\s*=\s*Math\.max\(0,\s*Math\.min\(active\s*-\s*2,\s*lines\.length\s*-\s*7\)\)/.test(renderMultiRow)
    && /translationFontSize/.test(app)
    && /translationGap/.test(app)
    && /translationOpacity/.test(app),
  glitchVariablesAreApplied: [...glitchVariables, ...glitchDurationVariables].every((variable) => (
    applyGlitchVars.includes(variable) && styles.includes(`var(${variable}`)
  ))
    && /applyGlitchTextCssVars\(scene,\s*settings\)/.test(applySettings)
    && /applyGlitchTextCssVars\(els\.textGlitchControl,\s*settings\)/.test(applySettings)
    && !/setStylePropertyIfChanged\(scene,\s*['"]--text-glitch-/.test(applySettings),
  glitchClassAndDatasetAreApplied: /is-text-glitch-active/.test(app)
    && /textGlitch/.test(app)
    && /glitchEnabled/.test(app),
  focusEchoDisablesGlitchControls: /const\s+focusEchoLocked\s*=\s*state\.textPreset\s*===\s*['"]focus-echo['"]/.test(syncControls)
    && /const\s+glitchControlsEnabled\s*=\s*enabled\s*&&\s*!focusEchoLocked\s*&&\s*settings\.glitchEnabled/.test(syncControls)
    && /els\.textGlitchToggle\.disabled\s*=\s*!enabled\s*\|\|\s*focusEchoLocked/.test(syncControls),
  glitchExcludesBookFocusEchoAndReducedMotion: /state\.textPreset\s*!==\s*['"]book['"]/.test(glitchActive)
    && /state\.textPreset\s*!==\s*['"]focus-echo['"]/.test(glitchActive)
    && /settings\.glitchEnabled/.test(glitchActive)
    && /!reducedMotion/.test(glitchActive)
    && /glitchTextEffectActive\(settings\)/.test(syncGlitchLayers)
    && /glitchTextEffectActive\(settings\)/.test(applySettings),
  glitchIsAComposerParameter: !/['"]glitch['"]/.test(selectablePreset)
    && /glitchEnabled/.test(defaultSettings)
    && /glitchEnabled/.test(normalizeSettings)
    && /data-text-composer-setting=(["'])glitchEnabled\1/.test(elements.textGlitchToggle?.html || ''),
  glitchCssHasMotionAndVariables: /@keyframes\s+textGlitch/i.test(styles)
    && glitchVariables.every((variable) => styles.includes(`var(${variable}`)),
  glitchSpeedUsesPrecomputedDurationVariables: /settings\.glitchBeatDuration\s*\/\s*speed/.test(applyGlitchVars)
    && /--text-glitch-beat-duration/.test(applyGlitchVars)
    && /animation-duration:\s*var\(--text-glitch-cyan-duration/.test(styles)
    && /animation-duration:\s*var\(--text-glitch-magenta-duration/.test(styles),
  glitchUsesIndependentAriaHiddenClones: /\[['"]cyan['"],\s*['"]magenta['"]\]/.test(app)
    && /text-glitch-copy text-glitch-copy--\$\{variant\}/.test(app)
    && /setAttribute\(['"]aria-hidden['"],\s*['"]true['"]\)/.test(app)
    && /\.text-glitch-copy--cyan/.test(styles)
    && /\.text-glitch-copy--magenta/.test(styles),
  glitchDoesNotOverridePrimaryHighlightPseudos: unsafeGlitchHighlightRules.length === 0,
  reducedMotionDisablesGlitchCss: reducedMotionBlocks.some((block) => (
    /is-text-glitch-active/.test(block)
    && /animation:\s*none\s*!important;/i.test(block)
  ))
};

const output = {
  pass: Object.values(checks).every(Boolean),
  checks,
  failures: Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name),
  contract: {
    paletteIdsInTextPage,
    textPresetCardIds,
    textPresetCardValues,
    glitchPresetCount: allGlitchPresetTags.length,
    actualGlitchSettings,
    actualGlitchInteractiveIds,
    actualTranslationInteractiveIds,
    actualAnimationInteractiveIds,
    expectedGlitchSettings,
    expectedGlitchDataSettings,
    unsafeGlitchHighlightRules
  }
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.pass ? 0 : 1;
