import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const storageKey = 'fe-monster-text-preset-palettes-v1';
const fontStorageKey = 'fe-monster-text-preset-fonts-v1';
const expectedFontLabels = Object.freeze([
  '南廱明體', '光华标题黑', '无界黑', '汉仪英雄体', '知新体', '少年南波万', '俊林简', '挥墨体',
  '锐智体', '新青年体', '追光体', '文雅体', '黑糖体', '咏楷体', '汇文明朝体', 'Caveat-Regular',
  'ZY Hope', '渔阳细体', 'FACON', '字语云黑宋', '系统字体', '得意黑', '江湖体', '风雅宋',
  '抖音体', '思源粗宋', '三极榜楷简体', '招牌体', '苍耳状元楷', '活力黑体', '俪金黑', '综艺体',
  '俊雅体', '江户招牌', '字由列黑', '圆体', '金陵体', '研宋体', '后现代体', '烟波宋',
  '字由奇巧', '优设标题黑', '三极古拙楷书'
]);
const expectedFontIds = Object.freeze({
  depth: 'source-han-heavy',
  flow: 'facon',
  'book-effect': 'caveat-regular',
  'focus-echo': 'smiley-sans',
  book: 'yanbo-serif'
});
const debugPort = 23000 + (process.pid % 7000);
const profile = path.resolve(tmpdir(), `fe-monster-text-palette-${process.pid}`);
const focusEchoScreenshotPath = path.resolve('artifacts', 'text-preset-focus-echo-live.png');
const focusEchoEffectScreenshotPath = path.resolve('artifacts', 'text-preset-focus-echo-effect.png');
const expectedColors = Object.freeze({
  depth: '#e44747',
  flow: '#25b86b',
  'book-effect': '#3478e5',
  'focus-echo': '#a64fe2',
  book: '#e39a24'
});
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(webRoot, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(`${webRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  let transientError = null;
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(expression, true)) return;
      transientError = null;
    } catch (error) {
      const message = String(error?.message || error);
      const pageStillInitializing = /ReferenceError|not defined|before initialization|execution context was destroyed|cannot find context/i.test(message);
      if (!pageStillInitializing) throw error;
      transientError = error;
    }
    await delay(80);
  }
  const detail = transientError ? ` (${transientError.message})` : '';
  throw new Error(`Timed out waiting for: ${expression}${detail}`);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', {
    url: `${baseUrl}/?text-palette-qa=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof setTextPreset === 'function'
    && typeof setDiyPreset === 'function'
    && state.playbackVisual.particles.length > 0
    && document.getElementById('playbackLyricScene')`);
  await evaluate(`localStorage.removeItem(${JSON.stringify(storageKey)}); localStorage.removeItem(${JSON.stringify(fontStorageKey)})`);
  const resetReloadTimeOrigin = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin !== ${JSON.stringify(resetReloadTimeOrigin)}
    && document.readyState === 'complete'
    && typeof setTextPreset === 'function'
    && typeof setDiyPreset === 'function'
    && state.playbackVisual.particles.length > 0
    && document.getElementById('playbackLyricScene')`);

  const focusEchoScreenshotReady = await evaluate(`(async () => {
    const button = document.querySelector(
      '#diyTextPage [data-text-preset="focus-echo"]'
    );
    if (!button || typeof setPlaybackLyricLine !== 'function') return false;
    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    refreshPlayerState = async () => {};
    state.currentSong = {
      id: 'qa-focus-echo-screenshot',
      title: 'Focus echo live',
      artist: 'FE Monster QA',
      provider: 'local',
      source: 'local',
      localUrl: 'blob:qa-focus-echo-screenshot',
      duration: 60
    };
    state.playbackPage = true;
    updatePlaybackPageClass();
    setDiyPreset('lyric');
    setDiyOpen(true);
    setDiyPage('text');
    setPlaybackLyricLine(
      '\u4e3a\u4ec0\u4e48\u6211\u4f1a\u79bb\u5f00\u4f60',
      '\u7126\u70b9\u6536\u675f\u00b7\u6697\u5f71\u56de\u58f0',
      0.42,
      12
    );
    button.click();
    requestOrbFrame();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return state.textPreset === 'focus-echo'
      && document.getElementById('playbackLyricScene')
        ?.classList.contains('is-focus-echo-entering');
  })()`, true);
  if (focusEchoScreenshotReady) {
    await delay(320);
    const screenshot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    mkdirSync(path.dirname(focusEchoScreenshotPath), { recursive: true });
    writeFileSync(focusEchoScreenshotPath, Buffer.from(screenshot.data, 'base64'));
    await evaluate(`(() => {
      const targets = [
        document.getElementById('qishuiPlaybackCard'),
        document.getElementById('diySidebar')
      ].filter(Boolean);
      window.__textPaletteScreenshotStyles = targets.map((element) => ({
        element,
        style: element.getAttribute('style')
      }));
      targets.forEach((element) => {
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
      });
      return targets.length === 2;
    })()`);
    await delay(40);
    const effectScreenshot = await command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    writeFileSync(
      focusEchoEffectScreenshotPath,
      Buffer.from(effectScreenshot.data, 'base64')
    );
    await evaluate(`(() => {
      const saved = Array.isArray(window.__textPaletteScreenshotStyles)
        ? window.__textPaletteScreenshotStyles
        : [];
      saved.forEach(({ element, style }) => {
        if (!element) return;
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      });
      delete window.__textPaletteScreenshotStyles;
      return true;
    })()`);
  }

  const firstPass = await evaluate(`(async () => {
    const expectedColors = ${JSON.stringify(expectedColors)};
    const expectedFontLabels = ${JSON.stringify(expectedFontLabels)};
    const expectedFontIds = ${JSON.stringify(expectedFontIds)};
    const normalPresets = ['depth', 'flow', 'book-effect', 'focus-echo'];
    const allSelectablePresets = ['none', ...normalPresets];
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settle = async () => {
      await nextFrame();
      await nextFrame();
    };
    const normalizeHex = (value) => {
      const color = String(value || '').trim().toLowerCase();
      return /^#[0-9a-f]{6}$/.test(color) ? color : '';
    };
    const parseColor = (value) => {
      const probe = document.createElement('span');
      probe.style.color = String(value || '');
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      const channels = computed.match(/[0-9.]+/g)?.slice(0, 3).map(Number) || [];
      return channels.length === 3 ? channels : null;
    };
    const colorDistance = (left, right) => {
      const a = parseColor(left);
      const b = parseColor(right);
      return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity;
    };
    const scenePaletteValues = (preset) => {
      const scene = document.getElementById('playbackLyricScene');
      const style = getComputedStyle(scene);
      const names = preset === 'book'
        ? ['--book-hot', '--book-glow', '--book-depth', '--lyric-primary']
        : [
            '--lyric-primary',
            '--lyric-highlight',
            '--lyric-font-base',
            '--lyric-font-hot',
            '--lyric-gradient-start'
          ];
      return names.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
    };
    const visualUsesColor = (preset, color) => {
      const palette = manualTextLyricPalette(color);
      const expected = preset === 'book'
        ? [palette.highlight, palette.glow, palette.depth, palette.primary]
        : [palette.primary, palette.highlight];
      const actual = scenePaletteValues(preset);
      return expected.every((value) => (
        actual.some((candidate) => colorDistance(candidate, rgbCss(value)) <= 1)
      ));
    };
    const controlsVisible = () => {
      const root = document.getElementById('textPaletteControl');
      if (!root || root.hidden) return false;
      const style = getComputedStyle(root);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const currentPreference = (preset) => state.textPalettePreferences?.[preset] || null;
    const preferenceMatches = (preset, color) => {
      const preference = currentPreference(preset);
      return preference?.mode === 'manual' && normalizeHex(preference.color) === color;
    };
    const selectViaButton = async (preset) => {
      const button = document.querySelector(
        '#diyTextPage [data-text-preset="' + preset + '"]'
      );
      button?.click();
      await settle();
      return button;
    };
    const setCustomColor = async (color) => {
      const input = document.getElementById('textPaletteCustomInput');
      input.value = color;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };
    const activeButtonsSynchronized = (preset) => {
      const matching = Array.from(
        document.querySelectorAll('#diySidebar [data-text-preset="' + preset + '"]')
      );
      const otherActive = Array.from(
        document.querySelectorAll('#diySidebar [data-text-preset].is-active')
      ).filter((button) => button.dataset.textPreset !== preset);
      return matching.length === 3
        && matching.every((button) => button.classList.contains('is-active'))
        && otherActive.length === 0;
    };

    const required = {
      paletteRoot: document.getElementById('textPaletteControl'),
      autoButton: document.getElementById('textPaletteAutoButton'),
      customInput: document.getElementById('textPaletteCustomInput'),
      resetButton: document.getElementById('textPaletteResetButton'),
      fontRoot: document.getElementById('textFontControl'),
      fontSelect: document.getElementById('textFontSelect'),
      fontPreview: document.getElementById('textFontPreview'),
      fontAvailability: document.getElementById('textFontAvailability'),
      scene: document.getElementById('playbackLyricScene')
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    const swatches = Array.from(
      document.querySelectorAll('[data-text-palette-color]')
    );
    if (missing.length || !swatches.length || !state.textPalettePreferences || !state.textFontPreferences) {
      return {
        ready: false,
        pass: false,
        missing,
        swatchCount: swatches.length,
        statePreferencesPresent: !!state.textPalettePreferences,
        fontPreferencesPresent: !!state.textFontPreferences
      };
    }

    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    refreshPlayerState = async () => {};
    state.currentSong = {
      id: 'qa-text-palette',
      title: 'Text palette QA',
      artist: 'FE Monster',
      provider: 'local',
      source: 'local',
      localUrl: 'blob:qa-text-palette',
      duration: 60
    };
    state.playbackPage = true;
    updatePlaybackPageClass();
    setDiyPreset('lyric');
    setDiyOpen(true);
    setDiyPage('text');
    setPlaybackLyricLine('Focus echo palette regression', 'FE Monster QA', 0.42, 12);
    await settle();

    const registryCounts = Object.fromEntries(
      allSelectablePresets.map((preset) => [
        preset,
        document.querySelectorAll('#diySidebar [data-text-preset="' + preset + '"]').length
      ])
    );
    const registryPass = Object.values(registryCounts).every((count) => count === 3);
    const controlContractPass = required.customInput.type === 'color'
      && swatches.every((swatch) => normalizeHex(swatch.dataset.textPaletteColor));
    const fontRegistryLabels = TEXT_FONT_OPTIONS.map((option) => option.label);
    const fontRegistryPass = fontRegistryLabels.length === expectedFontLabels.length
      && expectedFontLabels.every((label, index) => fontRegistryLabels[index] === label)
      && required.fontSelect.options.length === expectedFontLabels.length;
    const fontControlContractPass = Array.from(required.fontSelect.options).every((option) => (
      option.value && ['true', 'false'].includes(option.dataset.fontAvailable)
    )) && !!required.fontPreview.textContent.trim()
      && !!required.fontAvailability.textContent.trim();
    const presetDefaultTypographyPreserved = document.documentElement.style
      .getPropertyValue('--text-preset-font-family').trim() === '';

    await selectViaButton('focus-echo');
    const focusEchoSelection = {
      state: state.textPreset,
      dataset: required.scene.dataset.textPreset || '',
      classApplied: required.scene.classList.contains('is-focus-echo-text'),
      buttonsSynchronized: activeButtonsSynchronized('focus-echo'),
      lyricsVisible: required.scene.hidden === false,
      paletteVisible: controlsVisible()
    };
    const focusEchoPass = focusEchoSelection.state === 'focus-echo'
      && focusEchoSelection.dataset === 'focus-echo'
      && focusEchoSelection.classApplied
      && focusEchoSelection.buttonsSynchronized
      && focusEchoSelection.lyricsVisible
      && focusEchoSelection.paletteVisible;

    await selectViaButton('depth');
    const firstSwatch = swatches.find((swatch) => normalizeHex(swatch.dataset.textPaletteColor));
    firstSwatch.click();
    await settle();
    const swatchColor = normalizeHex(firstSwatch.dataset.textPaletteColor);
    const swatchInteractionPass = preferenceMatches('depth', swatchColor);
    required.autoButton.click();
    await settle();
    const autoInteractionPass = currentPreference('depth')?.mode === 'auto';
    await setCustomColor(expectedColors.depth);
    required.resetButton.click();
    await settle();
    const resetPreference = currentPreference('depth');
    const resetInteractionPass = resetPreference?.mode === 'auto'
      || normalizeHex(resetPreference?.color) !== expectedColors.depth;

    const presetResults = {};
    for (const preset of normalPresets) {
      const button = await selectViaButton(preset);
      await setCustomColor(expectedColors[preset]);
      presetResults[preset] = {
        buttonPresent: !!button,
        selected: state.textPreset === preset,
        buttonsSynchronized: activeButtonsSynchronized(preset),
        paletteVisible: controlsVisible(),
        preference: currentPreference(preset),
        inputColor: normalizeHex(required.customInput.value),
        visualValues: scenePaletteValues(preset),
        visualApplied: visualUsesColor(preset, expectedColors[preset])
      };
    }
    const normalPresetsPass = normalPresets.every((preset) => {
      const result = presetResults[preset];
      return result.buttonPresent
        && result.selected
        && result.buttonsSynchronized
        && result.paletteVisible
        && preferenceMatches(preset, expectedColors[preset])
        && result.inputColor === expectedColors[preset]
        && result.visualApplied;
    });

    const paletteRoundTrip = {};
    for (const preset of normalPresets) {
      await selectViaButton(preset);
      paletteRoundTrip[preset] = {
        preference: currentPreference(preset),
        inputColor: normalizeHex(required.customInput.value),
        visualApplied: visualUsesColor(preset, expectedColors[preset])
      };
    }
    const independentPalettesPass = normalPresets.every((preset) => (
      preferenceMatches(preset, expectedColors[preset])
      && paletteRoundTrip[preset].inputColor === expectedColors[preset]
      && paletteRoundTrip[preset].visualApplied
    ));

    await selectViaButton('focus-echo');
    setDiyPreset('book');
    await settle();
    const bookForcedBeforeColor = state.textPreset === 'book'
      && required.scene.classList.contains('is-book-text')
      && controlsVisible();
    await setCustomColor(expectedColors.book);
    const bookResult = {
      forced: bookForcedBeforeColor,
      preference: currentPreference('book'),
      inputColor: normalizeHex(required.customInput.value),
      visualValues: scenePaletteValues('book'),
      visualApplied: visualUsesColor('book', expectedColors.book)
    };
    const bookPass = bookResult.forced
      && preferenceMatches('book', expectedColors.book)
      && bookResult.inputColor === expectedColors.book
      && bookResult.visualApplied;
    setDiyPreset('lyric');
    await settle();
    const bookExitRestoresSelectable = state.textPreset === 'focus-echo';

    const setFont = async (fontId) => {
      required.fontSelect.value = fontId;
      required.fontSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };
    const fontResults = {};
    for (const preset of normalPresets) {
      await selectViaButton(preset);
      await setFont(expectedFontIds[preset]);
      const option = textFontOption(expectedFontIds[preset]);
      const rootStack = document.documentElement.style.getPropertyValue('--text-preset-font-family');
      fontResults[preset] = {
        preference: state.textFontPreferences[preset],
        selected: required.fontSelect.value,
        dataset: document.documentElement.dataset.textFont,
        rootStack,
        sceneFamily: getComputedStyle(required.scene).fontFamily,
        playbackFamily: getComputedStyle(document.getElementById('qishuiPlaybackLyricPage')).fontFamily,
        containsRequestedFamily: option.families.length
          ? rootStack.includes(option.families[0])
          : rootStack.includes('system-ui')
      };
    }
    setDiyPreset('book');
    await settle();
    await setFont(expectedFontIds.book);
    const bookFontStack = document.documentElement.style.getPropertyValue('--text-preset-font-family');
    fontResults.book = {
      preference: state.textFontPreferences.book,
      selected: required.fontSelect.value,
      dataset: document.documentElement.dataset.textFont,
      rootStack: bookFontStack,
      containsRequestedFamily: bookFontStack.includes(textFontOption(expectedFontIds.book).families[0])
    };
    const independentFontsPass = Object.entries(expectedFontIds).every(([preset, fontId]) => {
      const result = fontResults[preset];
      return result?.preference === fontId
        && result.selected === fontId
        && result.dataset === fontId
        && result.containsRequestedFamily;
    });
    setDiyPreset('lyric');
    await settle();

    setTextPreset('none');
    await settle();
    const nonePreservesPalettes = required.scene.hidden
      && [...normalPresets, 'book'].every((preset) => (
        preferenceMatches(preset, expectedColors[preset])
      ));
    const nonePreservesFonts = required.fontSelect.disabled
      && Object.entries(expectedFontIds).every(([preset, fontId]) => (
        state.textFontPreferences[preset] === fontId
      ));
    const savedRaw = localStorage.getItem(${JSON.stringify(storageKey)}) || '';
    const savedFontsRaw = localStorage.getItem(${JSON.stringify(fontStorageKey)}) || '';
    const storageContainsAllColors = [...normalPresets, 'book'].every((preset) => (
      savedRaw.toLowerCase().includes(expectedColors[preset])
    ));
    const storageContainsAllFonts = Object.values(expectedFontIds).every((fontId) => (
      savedFontsRaw.includes(fontId)
    ));
    const checks = {
      registryPass,
      controlContractPass,
      fontRegistryPass,
      fontControlContractPass,
      presetDefaultTypographyPreserved,
      focusEchoPass,
      swatchInteractionPass,
      autoInteractionPass,
      resetInteractionPass,
      normalPresetsPass,
      independentPalettesPass,
      bookPass,
      bookExitRestoresSelectable,
      independentFontsPass,
      nonePreservesPalettes,
      nonePreservesFonts,
      storageContainsAllColors,
      storageContainsAllFonts
    };
    return {
      ready: true,
      pass: Object.values(checks).every(Boolean),
      checks,
      registryCounts,
      swatchCount: swatches.length,
      fontRegistryLabels,
      focusEchoSelection,
      presetResults,
      paletteRoundTrip,
      bookResult,
      fontResults,
      savedRaw,
      savedFontsRaw
    };
  })()`, true);

  let reloadPass = {
    skipped: !firstPass.ready,
    pass: false
  };
  if (firstPass.ready) {
    await delay(150);
    const persistenceReloadTimeOrigin = await evaluate('performance.timeOrigin');
    await command('Page.reload', { ignoreCache: true });
    await waitFor(`performance.timeOrigin !== ${JSON.stringify(persistenceReloadTimeOrigin)}
      && document.readyState === 'complete'
      && typeof setTextPreset === 'function'
      && typeof setDiyPreset === 'function'
      && state.playbackVisual.particles.length > 0
      && state.textPalettePreferences
      && state.textFontPreferences
      && document.getElementById('textPaletteCustomInput')
      && document.getElementById('textFontSelect')?.options.length === ${expectedFontLabels.length}`);
    reloadPass = await evaluate(`(async () => {
      const expectedColors = ${JSON.stringify(expectedColors)};
      const expectedFontIds = ${JSON.stringify(expectedFontIds)};
      const normalPresets = ['depth', 'flow', 'book-effect', 'focus-echo'];
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const settle = async () => {
        await nextFrame();
        await nextFrame();
      };
      const normalizeHex = (value) => {
        const color = String(value || '').trim().toLowerCase();
        return /^#[0-9a-f]{6}$/.test(color) ? color : '';
      };
      const preferenceMatches = (preset) => {
        const preference = state.textPalettePreferences?.[preset];
        return preference?.mode === 'manual'
          && normalizeHex(preference.color) === expectedColors[preset];
      };
      const selectViaButton = async (preset) => {
        const button = document.querySelector(
          '#diyTextPage [data-text-preset="' + preset + '"]'
        );
        button?.click();
        await settle();
        return button;
      };

      const boot = document.getElementById('bootScreen');
      if (boot) boot.hidden = true;
      refreshPlayerState = async () => {};
      state.currentSong = {
        id: 'qa-text-palette-reload',
        title: 'Text palette reload QA',
        artist: 'FE Monster',
        provider: 'local',
        source: 'local',
        localUrl: 'blob:qa-text-palette-reload',
        duration: 60
      };
      state.playbackPage = true;
      updatePlaybackPageClass();
      setDiyPreset('lyric');
      setDiyOpen(true);
      setDiyPage('text');
      setPlaybackLyricLine('Reloaded focus echo palette', 'FE Monster QA', 0.54, 16);
      await settle();

      const defaultPreset = state.textPreset;
      const root = document.getElementById('textPaletteControl');
      const input = document.getElementById('textPaletteCustomInput');
      const fontSelect = document.getElementById('textFontSelect');
      const restored = {};
      for (const preset of normalPresets) {
        const button = await selectViaButton(preset);
        restored[preset] = {
          buttonPresent: !!button,
          preference: state.textPalettePreferences?.[preset] || null,
          inputColor: normalizeHex(input?.value),
          fontPreference: state.textFontPreferences?.[preset] || '',
          selectedFont: fontSelect?.value || '',
          appliedFont: document.documentElement.dataset.textFont || ''
        };
      }
      setTextPreset('focus-echo');
      setDiyPreset('book');
      await settle();
      restored.book = {
        forced: state.textPreset === 'book'
          && document.getElementById('playbackLyricScene')?.classList.contains('is-book-text'),
        preference: state.textPalettePreferences?.book || null,
        inputColor: normalizeHex(input?.value),
        fontPreference: state.textFontPreferences?.book || '',
        selectedFont: fontSelect?.value || '',
        appliedFont: document.documentElement.dataset.textFont || '',
        paletteVisible: !!root
          && !root.hidden
          && getComputedStyle(root).display !== 'none'
      };
      const preferencesRestored = [...normalPresets, 'book'].every(preferenceMatches);
      const fontsRestored = Object.entries(expectedFontIds).every(([preset, fontId]) => (
        state.textFontPreferences?.[preset] === fontId
        && restored[preset]?.selectedFont === fontId
        && restored[preset]?.appliedFont === fontId
      ));
      const controlsRestored = normalPresets.every((preset) => (
        restored[preset].buttonPresent
        && restored[preset].inputColor === expectedColors[preset]
      )) && restored.book.forced
        && restored.book.paletteVisible
        && restored.book.inputColor === expectedColors.book;
      const savedRaw = localStorage.getItem(${JSON.stringify(storageKey)}) || '';
      const savedFontsRaw = localStorage.getItem(${JSON.stringify(fontStorageKey)}) || '';
      const storageStillContainsAllColors = [...normalPresets, 'book'].every((preset) => (
        savedRaw.toLowerCase().includes(expectedColors[preset])
      ));
      const storageStillContainsAllFonts = Object.values(expectedFontIds).every((fontId) => (
        savedFontsRaw.includes(fontId)
      ));
      return {
        skipped: false,
        pass: defaultPreset === 'none'
          && preferencesRestored
          && fontsRestored
          && controlsRestored
          && storageStillContainsAllColors
          && storageStillContainsAllFonts,
        defaultPreset,
        preferencesRestored,
        fontsRestored,
        controlsRestored,
        storageStillContainsAllColors,
        storageStillContainsAllFonts,
        restored,
        savedRaw,
        savedFontsRaw
      };
    })()`, true);
  }

  let narrowWindowPass = {
    skipped: !firstPass.ready,
    pass: false
  };
  if (firstPass.ready) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(180);
    narrowWindowPass = await evaluate(`(async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      setDiyPreset('lyric');
      setTextPreset('focus-echo');
      if (!state.diyOpen) setDiyOpen(true);
      setDiyPage('text');
      await nextFrame();
      await nextFrame();
      const root = document.getElementById('textPaletteControl');
      const fontRoot = document.getElementById('textFontControl');
      const fontSelect = document.getElementById('textFontSelect');
      const swatches = Array.from(
        root?.querySelectorAll('[data-text-palette-color]') || []
      );
      const rootRect = root?.getBoundingClientRect();
      const swatchRects = swatches.map((swatch) => {
        const rect = swatch.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right
        };
      });
      const noHorizontalOverflow = !!root
        && root.scrollWidth <= root.clientWidth + 1
        && !!fontRoot
        && fontRoot.scrollWidth <= fontRoot.clientWidth + 1;
      const fontControlUsable = !!fontSelect
        && fontSelect.options.length === ${expectedFontLabels.length}
        && fontSelect.getBoundingClientRect().width >= 180;
      const swatchesUsable = swatches.length === 8
        && swatchRects.every((rect) => (
          rect.width >= 20
          && rect.height >= 20
          && rect.left >= rootRect.left - 1
          && rect.right <= rootRect.right + 1
        ));
      return {
        skipped: false,
        pass: noHorizontalOverflow && swatchesUsable && fontControlUsable,
        viewport: [innerWidth, innerHeight],
        clientWidth: root?.clientWidth || 0,
        scrollWidth: root?.scrollWidth || 0,
        noHorizontalOverflow,
        fontControlUsable,
        swatchCount: swatches.length,
        swatchesUsable,
        swatchRects
      };
    })()`, true);
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
  }

  const result = {
    pass: focusEchoScreenshotReady
      && firstPass.pass === true
      && reloadPass.pass === true
      && narrowWindowPass.pass === true,
    focusEchoScreenshot: focusEchoScreenshotReady ? focusEchoScreenshotPath : '',
    focusEchoEffectScreenshot: focusEchoScreenshotReady
      ? focusEchoEffectScreenshotPath
      : '',
    firstPass,
    reloadPass,
    narrowWindowPass
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true
  });
  server.close();
  await delay(250);
  const tempRoot = `${path.resolve(tmpdir())}${path.sep}`;
  if (profile.startsWith(tempRoot) && existsSync(profile)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch {
      // Edge can hold a harmless profile lock briefly after taskkill on Windows.
    }
  }
}
