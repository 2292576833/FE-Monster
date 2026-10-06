import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const settingsPath = new URL('../web/harmonic-state-settings.js', import.meta.url);
assert.ok(existsSync(settingsPath), 'harmonic effects need a shared settings module before the app boots');
const settingsSource = readFileSync(settingsPath, 'utf8');
const particleSettingsSource = readFileSync(new URL('../web/particle-lyrics-settings.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(settingsSource, sandbox);
vm.runInNewContext(particleSettingsSource, sandbox);
const api = sandbox.window.FeHarmonicSettings;
const particleApi = sandbox.window.FeParticleLyricsSettings;
assert.equal(typeof api?.normalize, 'function');
const expected = {
  lyricCardsEnabled: true,
  idleAnimation: true,
  towersEnabled: true, breathingEnabled: true, breathSpeed: 0.65, breathStrength: 0.55,
  flowEnabled: true, flowDirection: 'up', flowSpeed: 0.65, flowWidth: 0.22,
  colorSpeed: 0.35, audioReactive: true, colorMode: 'cycle',
  colorA: '#13e8ee', colorB: '#7969ff', colorC: '#f064c2',
  fogEnabled: true, fogDensity: 0.4, fogSpeed: 0.45, fogHeight: 1, fogSpread: 1,
  ringsEnabled: true, ringSpeed: 0.35, ringScale: 1, ringGlow: 0.7,
  cubeEnabled: true, cubeSize: 1, cubeHoverHeight: 0, floatSpeed: 0.65, floatAmount: 0.55,
  surfaceRiseEnabled: true, rippleStrength: 0.8, bassRiseStrength: 0.8, shakeStrength: 0.6, shakeFrequency: 1, bassGain: 1, midGain: 1, trebleGain: 1,
  flashEnabled: true, flashMode: 'shake', flashColorA: '#b8f5ff', flashColorB: '#ba95ff', flashColorC: '#ff8fca',
  flashIntensity: 0.65, flashSpeed: 0.8, flashDensity: 0.32, flashSoftness: 0.65, flashAudioStrength: 0.5,
  tileGrid: 18,
  coldAirEnabled: true, coldAirDensity: 0.4, coldAirSpeed: 0.5, coldAirSpread: 0.65, coldAirLength: 0.86,
  coldAirGroundBlend: 0.8, coldAirAudioStrength: 0.3, coldAirColorMode: 'palette', coldAirColor: '#b8f5ff',
  towerColorMode: 'palette', towerColor: '#2aeaf4', cubeColorMode: 'palette', cubeColor: '#7969ff',
  fogColorMode: 'palette', fogColor: '#18ddea', waterEnabled: true, waterReflection: 0.65, waterClarity: 0.75, waterDistortion: 0.35, waterSpeed: 0.4,
  raysEnabled: true, rayDensity: 1, raySpeed: 0.8, rayShake: 0.65,
  rainEnabled: true, rainDensity: 0.65, rainSpeed: 0.65, splashStrength: 0.75,
  keyLightIntensity: 1, keyLightAzimuth: 30, keyLightElevation: 45,
  ambientLightIntensity: 0.65, rimLightIntensity: 1, lightAudioStrength: 0.35,
  ringMetalness: 0.88, ringRoughness: 0.27, cubeEdgeGlow: 0.45, cubeOcclusion: 0.5,
  towerReflectivity: 0.65, glowStrength: 0.45, glowSoftness: 0.65,
  fogLightStrength: 0.55, floorLightEnabled: true, floorLightStrength: 0.45,
  floorLightSpread: 1, floorShadowStrength: 0.3
};
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(api.defaults), expected);
for (const source of [undefined, null, [], 'bad', 42]) assert.deepEqual(plain(api.normalize(source)), expected);
assert.deepEqual(plain(api.normalize({ fogDensity: NaN, flowSpeed: Infinity, colorA: 'red', colorMode: 'unknown', towersEnabled: 'false' })), expected);
assert.equal(api.normalize({ fogDensity: 0 }).fogDensity, 0, 'zero is a valid effect value');
assert.equal(api.normalize({ fogSpeed: '1.2' }).fogSpeed, expected.fogSpeed, 'stored numeric strings are not trusted numbers');
assert.equal(api.normalize({ breathSpeed: -1, flowWidth: 5 }).breathSpeed, 0.1);
assert.equal(api.normalize({ breathSpeed: -1, flowWidth: 5 }).flowWidth, 0.6);
assert.equal(api.normalize({ colorA: '#AAbbCC' }).colorA, '#aabbcc');
assert.equal(api.normalize({ colorA: '#fff' }).colorA, expected.colorA);
assert.equal(api.normalize({ towersEnabled: false }).towersEnabled, false);
assert.deepEqual(Object.keys(api.normalize({ extra: true })).sort(), Object.keys(expected).sort());
const migrated = api.normalize({ waterEnabled:true, towersEnabled:false, fogDensity:.72, colorA:'#aabbcc' });
assert.equal(migrated.waterEnabled,true,'saved water preference activates the new live reflection surface');
assert.equal(migrated.surfaceRiseEnabled,true,'missing preferences use the new flashing rise default');
assert.equal(api.normalize({ surfaceRiseEnabled: false }).surfaceRiseEnabled, false, 'an explicit flat preference remains respected');
const legacyRipple = api.normalize({ rippleStrength: 1.35 });
assert.equal(legacyRipple.rippleStrength, 1.35, 'existing ripple height is preserved for idle animation');
assert.equal(legacyRipple.bassRiseStrength, .8, 'older preferences receive an independent music height default');
for (const [key, label, maximum] of [['rippleStrength', '涟漪隆起', 2], ['bassRiseStrength', '低频隆起', 5]]) {
  const descriptor = api.schema.find(field => field.key === key);
  assert.ok(descriptor, `${key} has a separate editable height control`);
  assert.equal(descriptor.label, label);
  assert.equal(descriptor.type, 'range');
  assert.equal(descriptor.min, 0); assert.equal(descriptor.max, maximum); assert.equal(descriptor.step, .05);
}
for (const value of [3.5, 5]) assert.equal(api.normalize({ bassRiseStrength: value }).bassRiseStrength, value,
  `music height ${value} is preserved above the old limit`);
assert.equal(api.normalize({ bassRiseStrength: 6 }).bassRiseStrength, 5, 'music height is capped at the new maximum');
assert.equal(migrated.flashMode,'shake','missing preferences default to synchronized shake flashing');
assert.equal(migrated.towersEnabled,false);assert.equal(migrated.fogDensity,.72);assert.equal(migrated.colorA,'#aabbcc');
assert.equal(migrated.ringsEnabled,true,'new orbital defaults merge with prior saved preferences');
assert.deepEqual(plain(api.normalize(Object.create({ fogDensity: 0 }))), expected, 'prototype values must not become settings');
assert.ok(Object.isFrozen(api.defaults) && Object.isFrozen(api.schema));
assert.deepEqual(Array.from(api.schema, field => field.key).sort(), Object.keys(expected).sort(), 'every runtime field has an editable control');
for (const field of api.schema) {
  const inherited = Object.create({ [field.key]: field.type === 'checkbox' ? false : field.type === 'range' ? field.min : '#aabbcc' });
  assert.equal(api.normalize(inherited)[field.key], expected[field.key], `${field.key} ignores inherited preferences`);
  if (field.type === 'range') {
    assert.equal(api.normalize({ [field.key]: String(field.min) })[field.key], expected[field.key], `${field.key} rejects numeric strings`);
    assert.equal(api.normalize({ [field.key]: field.min - 1 })[field.key], field.min, `${field.key} clamps below its range`);
    assert.equal(api.normalize({ [field.key]: field.max + 1 })[field.key], field.max, `${field.key} clamps above its range`);
  } else if (field.type === 'checkbox') {
    assert.equal(api.normalize({ [field.key]: 'false' })[field.key], expected[field.key], `${field.key} rejects string booleans`);
  }
}

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
assert.ok(html.indexOf('src="harmonic-state-settings.js') >= 0
  && html.indexOf('src="harmonic-state-settings.js') < html.indexOf('src="app.js'), 'settings load before app initialization');
const storage = new Map();
let saves = 0;
const window = { FeHarmonicSettings: api, FeParticleLyricsSettings: particleApi, localStorage: {
  getItem: key => storage.get(key),
  setItem: (key, value) => { saves += 1; storage.set(key, value); }
}, clearTimeout() {}, setTimeout: () => 1 };
const state = {
  harmonicState: { effects: api.normalize({ fogDensity: 0.8, colorMode: 'custom', colorA: '#abcdef' }), runtime: {} },
  particleLyrics: { effects: particleApi.normalize({ presentation: 'progressive', textScale: 1.25 }) },
  lyricBrightness: 1.23, lyricSpeed: 1.1, cubeIntensity: 0.8,
  diyPage: 'preset', diyPreset: 'harmonic-state', scenePreset: 'harmonic-state',
  textPreset: 'depth', lastSelectableTextPreset: 'depth', freeCube: { mode: 'heart', backgroundEnabled: false },
  chladni: { mode: 'cube' }, sandbox: { stormLightingMode: 'day', stormWeatherMode: 'on' }, diyCardYaw: 2, diyCardPitch: 3
};
Object.assign(sandbox, {
  window, state, VISUAL_SETTINGS_PREFS_KEY: 'fe-monster-visual-settings-v1', VISUAL_SETTINGS_PREFS_VERSION: 1,
  TEXT_PALETTE_PRESET_IDS: ['depth'], DEFAULT_TEXT_PRESET: 'depth', normalizeDiyPreset: value => value,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value))
});
vm.runInNewContext(app.slice(app.indexOf('function normalizeVisualSettingsPreferences('), app.indexOf('const INITIAL_VISUAL_SETTINGS_PREFERENCES')), sandbox);
vm.runInNewContext(app.slice(app.indexOf('function visualSettingsPreferenceSnapshot('), app.indexOf('function saveVisualSettingsPreferences(')), sandbox);
const snapshot = sandbox.visualSettingsPreferenceSnapshot();
assert.equal(snapshot.harmonicEffects.fogDensity, 0.8);
storage.set(sandbox.VISUAL_SETTINGS_PREFS_KEY, JSON.stringify(snapshot));
assert.deepEqual(plain(sandbox.loadVisualSettingsPreferences().harmonicEffects), plain(state.harmonicState.effects), 'restart restores every effect with the existing preference store');
assert.ok(/effects:\s*INITIAL_VISUAL_SETTINGS_PREFERENCES\.harmonicEffects/.test(app), 'initial application state uses restored effects');
assert.ok(/effects:\s*state\.harmonicState\.effects/.test(app), 'scene creation receives effects');
assert.ok(/frame\.effects = state\.harmonicState\.effects/.test(app), 'live frames receive the stable settings object');

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; this.value = ''; }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelectorAll(selector) {
    const matches = element => selector === '[data-harmonic-effect]' ? !!element.dataset.harmonicEffect : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const list = new Element('div');
let runtimeEffects;
Object.assign(sandbox, {
  document: { createElement: tag => new Element(tag) },
  els: { diySelectedPresetConfigList: list },
  clearElement: element => element.replaceChildren(),
  visualSettingsPreferenceSaveTimer: 0, VISUAL_PREFERENCE_SAVE_DEBOUNCE_MS: 150,
  communityScenePersistenceSuppressed: () => false, scheduleClientPreferencesSync() {}, requestOrbFrame() {},
  safeText: (value, fallback = '') => value == null || value === '' ? fallback : String(value)
});
window.FeHarmonicStateRuntime = { setEffects: (_runtime, effects) => { runtimeEffects = effects; } };
vm.runInNewContext(app.slice(app.indexOf('function saveVisualSettingsPreferences('), app.indexOf('function collectClientPreferences(')), sandbox);
vm.runInNewContext(app.slice(app.indexOf('function setHarmonicStateEffect('), app.indexOf('function buildHarmonicState(')), sandbox);
sandbox.renderHarmonicStateControls();
const controls = list.querySelectorAll('[data-harmonic-effect]');
assert.equal(controls.length, api.schema.length, 'all settings appear as native editable controls');
for (const descriptor of api.schema) {
  const control = controls.find(element => element.dataset.harmonicEffect === descriptor.key);
  assert.equal(control.tagName, descriptor.type === 'select' ? 'select' : 'input');
  assert.ok(control.id && control.parentElement.querySelector('label')?.htmlFor === control.id, `${descriptor.key} has an associated visible label`);
}
assert.equal(sandbox.harmonicStateControlValue({ format: 'degrees' }, 30), '30°', 'light direction has explicit angle units');
const density = controls.find(element => element.dataset.harmonicEffect === 'fogDensity');
density.value = '0.37';
density.listeners.input({ target: density });
assert.equal(state.harmonicState.effects.fogDensity, 0.37);
assert.equal(runtimeEffects.fogDensity, 0.37);
assert.equal(list.querySelectorAll('[data-harmonic-effect]').find(element => element === density), density, 'editing preserves the focused native range');
const idleRise = controls.find(element => element.dataset.harmonicEffect === 'rippleStrength');
const bassRise = controls.find(element => element.dataset.harmonicEffect === 'bassRiseStrength');
idleRise.value = '1.35'; idleRise.listeners.input({ target: idleRise });
bassRise.value = '0.45'; bassRise.listeners.input({ target: bassRise });
assert.equal(state.harmonicState.effects.rippleStrength, 1.35, 'music height editing preserves idle height');
assert.equal(runtimeEffects.bassRiseStrength, .45, 'music height reaches the live runtime');
sandbox.flushVisualSettingsPreferences();
const restoredRise = sandbox.loadVisualSettingsPreferences().harmonicEffects;
assert.equal(restoredRise.rippleStrength, 1.35); assert.equal(restoredRise.bassRiseStrength, .45);
for (const value of [3.5, 5]) {
  bassRise.value = String(value); bassRise.listeners.input({ target: bassRise });
  assert.equal(state.harmonicState.effects.bassRiseStrength, value, `${value} reaches state without old-range clipping`);
  assert.equal(runtimeEffects.bassRiseStrength, value, `${value} reaches the live runtime`);
  sandbox.flushVisualSettingsPreferences();
  const restored = sandbox.loadVisualSettingsPreferences().harmonicEffects;
  assert.equal(restored.bassRiseStrength, value, `${value} survives save and restore`);
  assert.equal(restored.rippleStrength, 1.35, 'higher music height does not alter saved idle height');
}
for (const descriptor of api.schema) {
  const control = controls.find(element => element.dataset.harmonicEffect === descriptor.key);
  const value = descriptor.type === 'checkbox' ? !expected[descriptor.key]
    : descriptor.type === 'range' ? descriptor.min
    : descriptor.type === 'select' ? descriptor.options.at(-1).value : '#aabbcc';
  if (descriptor.type === 'checkbox') control.checked = value;
  else control.value = String(value);
  control.listeners[descriptor.type === 'checkbox' || descriptor.type === 'select' ? 'change' : 'input']({ target: control });
  assert.equal(state.harmonicState.effects[descriptor.key], value, `${descriptor.key} changes through its native control`);
}
sandbox.setHarmonicStateEffect('colorMode', 'cycle');
const colorPicker = controls.find(element => element.dataset.harmonicEffect === 'colorA');
colorPicker.value = '#24aabb';
colorPicker.listeners.input({ target: colorPicker });
assert.equal(state.harmonicState.effects.colorMode, 'custom', 'editing a color immediately enables its custom palette');
assert.equal(controls.find(element => element.dataset.harmonicEffect === 'colorMode').value, 'custom', 'palette selector follows color edits');
for (const component of ['tower', 'cube', 'fog', 'coldAir']) {
  sandbox.setHarmonicStateEffect('colorMode', 'cover');
  sandbox.setHarmonicStateEffect(component + 'ColorMode', 'palette');
  const picker = controls.find(element => element.dataset.harmonicEffect === component + 'Color');
  picker.value = '#d43289'; picker.listeners.input({ target: picker });
  assert.equal(state.harmonicState.effects[component + 'ColorMode'], 'custom', `${component} color edits enable only its own custom mode`);
  assert.equal(controls.find(element => element.dataset.harmonicEffect === component + 'ColorMode').value, 'custom');
  assert.equal(state.harmonicState.effects.colorMode, 'cover', `${component} does not disable cover colors for the rest of the scene`);
}
for (const key of ['flashColorA', 'flashColorB', 'flashColorC']) {
  const picker = controls.find(element => element.dataset.harmonicEffect === key);
  picker.value = '#f4ca81'; picker.listeners.input({ target: picker });
  assert.equal(state.harmonicState.effects.colorMode, 'cover', 'flash colors do not change the global palette mode');
}
sandbox.flushVisualSettingsPreferences();
assert.deepEqual(plain(sandbox.loadVisualSettingsPreferences().harmonicEffects), plain(state.harmonicState.effects), 'the real shared save/flush/load path persists control changes');
const priorSaves = saves;
sandbox.setHarmonicStateEffect('unknownField', 1);
assert.equal(saves, priorSaves, 'unknown controls cannot mutate saved preferences');
sandbox.resetHarmonicStateEffects();
sandbox.flushVisualSettingsPreferences();
assert.deepEqual(plain(state.harmonicState.effects), expected);
assert.deepEqual(plain(sandbox.loadVisualSettingsPreferences().harmonicEffects), expected, 'reset survives a restart');
assert.equal(state.lyricBrightness, 1.23, 'reset only touches harmonic effects');
assert.equal(state.freeCube.mode, 'heart');
assert.deepEqual(plain(sandbox.loadVisualSettingsPreferences().particleLyricsEffects), plain(state.particleLyrics.effects), 'harmonic edits and reset preserve independent particle lyric preferences');
assert.ok(saves >= 2, 'edits and reset use the shared preference save path');
sandbox.els.diySelectedPresetConfig = new Element('section');
sandbox.els.diySelectedPresetConfig.hidden = true;
sandbox.els.diySelectedPresetConfigTitle = new Element('strong');
sandbox.els.diySelectedPresetConfigMeta = new Element('small');
sandbox.isHarmonicStatePreset = () => state.diyPreset === 'harmonic-state';
vm.runInNewContext(app.slice(app.indexOf('function renderDiySelectedPresetConfig('), app.indexOf('function selectDiyScenePreset(')), sandbox);
sandbox.renderDiySelectedPresetConfig();
assert.equal(sandbox.els.diySelectedPresetConfig.hidden, false, 'selecting harmonic reveals the controls');
state.diyPreset = 'cube';
sandbox.renderDiySelectedPresetConfig();
assert.equal(sandbox.els.diySelectedPresetConfig.hidden, true, 'leaving harmonic hides its controls');
state.diyPreset = 'harmonic-state';
sandbox.renderDiySelectedPresetConfig();
assert.equal(list.querySelectorAll('[data-harmonic-effect]').length, api.schema.length, 'returning rebuilds all controls');
console.log('PASS harmonic effects: strict values, all controls editable, stable range focus, isolated reset, and restart persistence');

if (process.argv.includes('--browser')) {
  const { createRequire } = await import('node:module');
  const { homedir } = await import('node:os');
  const { default: path } = await import('node:path');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url);
  let chromium;
  for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
    path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')].filter(Boolean)) {
    try { ({ chromium } = require(candidate)); break; } catch { /* Try the next installed runtime. */ }
  }
  assert.ok(chromium, 'An installed Playwright is required for --browser');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const controlCss = css.slice(css.indexOf('.diy-selected-preset-config {'), css.indexOf('.diy-spectrum {'));
  const preferenceFunctions = app.slice(app.indexOf('function normalizeVisualSettingsPreferences('), app.indexOf('const INITIAL_VISUAL_SETTINGS_PREFERENCES'))
    + app.slice(app.indexOf('function visualSettingsPreferenceSnapshot('), app.indexOf('function collectClientPreferences('));
  const uiFunctions = app.slice(app.indexOf('function setHarmonicStateEffect('), app.indexOf('function buildHarmonicState('))
    + app.slice(app.indexOf('function renderDiySelectedPresetConfig('), app.indexOf('function selectDiyScenePreset('));
  const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Harmonic settings isolated fixture</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#0a171c;color:#e8f7f8;font:13px "Microsoft YaHei",sans-serif}
    #panel{width:320px;max-width:calc(100vw - 24px);margin:12px;padding:12px}${controlCss}</style>
    <section id="panel" class="diy-selected-preset-config" hidden><header><strong id="title"></strong><small id="meta"></small></header>
    <div id="list" class="diy-selected-preset-config-list"></div></section>
    <script>${settingsSource}</script><script>${particleSettingsSource}</script><script>
    const VISUAL_SETTINGS_PREFS_KEY='fe-monster-visual-settings-v1',VISUAL_SETTINGS_PREFS_VERSION=1,VISUAL_PREFERENCE_SAVE_DEBOUNCE_MS=30;
    const TEXT_PALETTE_PRESET_IDS=['depth'],DEFAULT_TEXT_PRESET='depth'; let visualSettingsPreferenceSaveTimer=0;
    const state=${JSON.stringify(state)};
    const els={diySelectedPresetConfig:document.querySelector('#panel'),diySelectedPresetConfigList:document.querySelector('#list'),
      diySelectedPresetConfigTitle:document.querySelector('#title'),diySelectedPresetConfigMeta:document.querySelector('#meta')};
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value)),normalizeDiyPreset=value=>value;
    const clearElement=element=>element.replaceChildren(),requestOrbFrame=()=>{},scheduleClientPreferencesSync=()=>{},communityScenePersistenceSuppressed=()=>false;
    const safeText=(value,fallback='')=>value==null||value===''?fallback:String(value),isHarmonicStatePreset=()=>state.diyPreset==='harmonic-state';
    window.FeHarmonicStateRuntime={setEffects:(_runtime,effects)=>window.deliveredEffects=effects};
    ${preferenceFunctions}${uiFunctions}
    state.harmonicState.effects=loadVisualSettingsPreferences().harmonicEffects;
    renderDiySelectedPresetConfig();
    window.testSettings={state,read:()=>loadVisualSettingsPreferences().harmonicEffects,
      reenter(){state.diyPreset='cube';renderDiySelectedPresetConfig();state.diyPreset='harmonic-state';renderDiySelectedPresetConfig();}};
    </script></html>`;
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve(import.meta.dirname, '..', 'output', 'playwright', 'harmonic-settings');
  const evidence = { controls: api.schema.length, edited: [], focusedRanges: [], widths: [], keyboard: false, legacyMigration: false, restart: false, resetRestart: false, repeatedEntry: false };
  const errors = [];
  try {
    const createPage = async storageState => {
      const context = await browser.newContext({ viewport: { width: 320, height: 900 }, ...(storageState ? { storageState } : {}) });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://harmonic-settings.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
      return page;
    };
    let page = await createPage();
    await page.addInitScript(({ prefs, key }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(prefs));
    }, { key: sandbox.VISUAL_SETTINGS_PREFS_KEY, prefs: { ...snapshot, harmonicEffects: { waterEnabled: false, towersEnabled: false, fogDensity: 0.73, colorB: '#224466' } } });
    await page.goto('http://harmonic-settings.test/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-harmonic-effect]').count(), api.schema.length);
    assert.deepEqual(await page.evaluate(() => testSettings.state.harmonicState.effects), { ...expected, waterEnabled: false, towersEnabled: false, fogDensity: 0.73, colorB: '#224466' }, 'legacy preferences keep shared values and receive new defaults');
    assert.equal(await page.locator('[data-harmonic-effect="waterEnabled"]').count(), 1);
    assert.equal(await page.getByLabel('两侧光柱', { exact: true }).isChecked(), false);
    assert.equal(await page.getByLabel('粒子雨', { exact: true }).isChecked(), true, 'water reflection and particle rain remain independent');
    evidence.legacyMigration = true;
    let range = page.getByLabel('雾气浓度', { exact: true });
    assert.equal(await range.inputValue(), '0.73', 'initial controls load persisted preferences');
    await range.focus();
    await range.press('ArrowRight');
    assert.equal(await range.inputValue(), '0.74');
    for (let index = 0; index < 9; index += 1) await range.press('ArrowRight');
    assert.equal(await range.inputValue(), '0.83');
    assert.equal(await range.evaluate(element => element === document.activeElement), true, 'continuous range updates preserve keyboard focus');
    evidence.keyboard = true;
    const edited = {};
    for (const descriptor of api.schema) {
      const control = page.locator(`[data-harmonic-effect="${descriptor.key}"]`);
      assert.equal(await page.getByLabel(descriptor.label, { exact: true }).count(), 1, `${descriptor.key} has a unique visible label`);
      await control.focus();
      let value;
      if (descriptor.type === 'checkbox') {
        value = !(await control.isChecked());
        await control.setChecked(value);
      } else if (descriptor.type === 'range') {
        assert.equal(await control.getAttribute('min'), String(descriptor.min));
        assert.equal(await control.getAttribute('max'), String(descriptor.max));
        assert.equal(await control.getAttribute('step'), String(descriptor.step));
        await control.press('Home');
        await control.press('ArrowRight');
        await control.press('ArrowRight');
        value = Number((descriptor.min + descriptor.step * 2).toFixed(8));
        assert.equal(Number(await control.inputValue()), value, `${descriptor.key} supports native keyboard editing`);
        assert.equal(await control.evaluate(element => element === document.activeElement), true, `${descriptor.key} keeps focus through consecutive updates`);
        evidence.focusedRanges.push(descriptor.key);
      } else if (descriptor.type === 'select') {
        value = descriptor.options.at(-1).value;
        await control.selectOption(value);
      } else {
        value = { colorA: '#31aabb', colorB: '#bc5279', colorC: '#8bc34a' }[descriptor.key] || '#d43289';
        await control.fill(value);
        if (['colorA', 'colorB', 'colorC'].includes(descriptor.key)) edited.colorMode = 'custom';
        else if (['towerColor', 'cubeColor', 'fogColor'].includes(descriptor.key)) edited[descriptor.key + 'Mode'] = 'custom';
      }
      edited[descriptor.key] = value;
      assert.equal(await page.evaluate(key => testSettings.state.harmonicState.effects[key], descriptor.key), value, `${descriptor.key} edits application state`);
      assert.equal(await page.evaluate(key => deliveredEffects[key], descriptor.key), value, `${descriptor.key} reaches the runtime`);
      evidence.edited.push(descriptor.key);
    }
    assert.equal(await page.getByLabel('配色方式', { exact: true }).inputValue(), 'custom');
    await page.waitForFunction(values => Object.entries(values).every(([key, value]) => testSettings.read()[key] === value), edited);
    assert.deepEqual(await page.evaluate(() => testSettings.read()), edited, 'every edited native control is persisted including independent colors, flashing and water');
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator('#panel').evaluate(panel => ({
        scrollWidth: panel.scrollWidth, width: panel.clientWidth,
        labelled: [...panel.querySelectorAll('[data-harmonic-effect]')].every(control => control.labels.length === 1)
      }));
      assert.ok(layout.scrollWidth <= layout.width, `controls do not overflow at ${width}px`);
      assert.equal(layout.labelled, true, 'each real native input has exactly one associated visible label');
      evidence.widths.push({ viewport: width, ...layout });
      mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, `settings-${width}.png`), fullPage: true });
    }
    const assertControlValues = async values => {
      assert.deepEqual(await page.evaluate(() => testSettings.state.harmonicState.effects), values);
      for (const descriptor of api.schema) {
        const control = page.locator(`[data-harmonic-effect="${descriptor.key}"]`);
        const value = descriptor.type === 'checkbox' ? await control.isChecked()
          : descriptor.type === 'range' ? Number(await control.inputValue()) : await control.inputValue();
        assert.equal(value, values[descriptor.key], `${descriptor.key} is restored in its native control`);
      }
    };
    await page.reload({ waitUntil: 'networkidle' });
    await assertControlValues(edited);
    const persistedStorage = await page.context().storageState();
    await page.context().close();
    page = await createPage(persistedStorage);
    await page.goto('http://harmonic-settings.test/', { waitUntil: 'networkidle' });
    range = page.getByLabel('雾气浓度', { exact: true });
    await assertControlValues(edited);
    evidence.restart = true;
    await page.evaluate(() => { for (let index = 0; index < 5; index += 1) testSettings.reenter(); });
    assert.equal(await page.locator('[data-harmonic-effect]').count(), api.schema.length, 'repeated entry never duplicates controls');
    await assertControlValues(edited);
    evidence.repeatedEntry = true;
    await page.getByRole('button', { name: '恢复谐波默认设置' }).click();
    await page.waitForFunction(values => Object.entries(values).every(([key, value]) => testSettings.read()[key] === value), expected);
    await assertControlValues(expected);
    assert.equal(await page.evaluate(() => testSettings.state.lyricBrightness), 1.23);
    assert.equal(await page.evaluate(() => testSettings.state.freeCube.mode), 'heart');
    assert.equal(await page.evaluate(() => testSettings.state.particleLyrics.effects.presentation), 'progressive');
    assert.equal(await page.evaluate(() => loadVisualSettingsPreferences().particleLyricsEffects.textScale), 1.25, 'harmonic reset preserves actual particle lyric preferences');
    await page.reload({ waitUntil: 'networkidle' });
    await assertControlValues(expected);
    evidence.resetRestart = true;
    assert.deepEqual(errors, []);
    writeFileSync(path.join(output, 'result.json'), JSON.stringify({ pass: true, ...evidence, errors }, null, 2));
    console.log(`PASS harmonic real controls: ${evidence.edited.length} editable fields, ${evidence.focusedRanges.length} stable keyboard ranges, legacy migration, 320/768px, fresh-context restart, isolated reset, repeated entry; ${output}`);
  } finally {
    await browser.close();
  }
}
