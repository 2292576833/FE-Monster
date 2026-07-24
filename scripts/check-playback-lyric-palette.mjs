import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const debugPort = 24000 + (process.pid % 6000);
const profile = path.resolve(tmpdir(), `fe-monster-playback-lyric-palette-${process.pid}`);
const storageKey = 'fe-monster-playback-lyric-palette-v1';
const bilingualStorageKey = 'fe-monster-bilingual-lyrics-v1';
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
  const isComponentAsset = requestedPath.startsWith('/components/');
  const staticRoot = isComponentAsset ? componentsRoot : webRoot;
  const relativePath = isComponentAsset
    ? requestedPath.slice('/components/'.length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
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

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu-sandbox',
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
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((entry) => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete'
    && typeof setPlaybackLyricPalettePreference === 'function'
    && typeof applyQishuiPlaybackPalette === 'function'
    && typeof parseLyricPayload === 'function'
    && typeof updatePlaybackLyricAtTime === 'function'
    && state.playbackLyricPalettePreference
    && document.getElementById('playbackLyricPaletteControl')`);

  const bilingualPass = await evaluate(`(() => {
    const previous = {
      currentSong: state.currentSong,
      lyricLines: state.lyricLines,
      lyricIndex: state.lyricIndex
    };
    const lines = parseLyricPayload({
      lrc: { lyric: '[00:01.00]Hello world' },
      tlyric: { lyric: '[00:01.02]你好，世界' }
    });
    state.currentSong = {
      id: 'qa-bilingual-lyric',
      title: 'Bilingual QA',
      artist: 'QA Artist',
      duration: 8
    };
    state.lyricLines = lines;
    state.lyricIndex = -1;
    updatePlaybackLyricAtTime(1.5);
    const main = document.getElementById('playbackLyricText').textContent.trim();
    const subtitle = document.getElementById('playbackLyricSubtitle').textContent.trim();
    state.currentSong = previous.currentSong;
    state.lyricLines = previous.lyricLines;
    state.lyricIndex = previous.lyricIndex;
    return {
      pass: lines[0]?.translationText === '你好，世界'
        && main === 'Hello world'
        && subtitle === '你好，世界',
      parsedTranslation: lines[0]?.translationText || '',
      main,
      subtitle
    };
  })()`, true);

  const bilingualUiPass = await evaluate(`(() => {
    const toggle = document.getElementById('bilingualLyricsToggle');
    const value = document.getElementById('bilingualLyricsValue');
    const playbackToggle = document.getElementById('qishuiPlaybackBilingualToggle');
    const multiRowToggle = document.getElementById('qishuiPlaybackMultiRowToggle');
    if (!toggle || !value || !playbackToggle || !multiRowToggle || typeof setBilingualLyricsEnabled !== 'function') {
      return {
        pass: false,
        controlsPresent: !!toggle && !!value && !!playbackToggle && !!multiRowToggle,
        setterPresent: typeof setBilingualLyricsEnabled === 'function'
      };
    }

    const previous = {
      currentSong: state.currentSong,
      lyricLines: state.lyricLines,
      lyricIndex: state.lyricIndex,
      lyricSignature: state.lyricSignature,
      lyricBookSignature: state.lyricBookSignature,
      textPreset: state.textPreset,
      multiRowLyricsEnabled: state.multiRowLyricsEnabled
    };
    const original = 'A very long original lyric line that must wrap naturally instead of being clipped at the playback boundary';
    const translation = '这是一行很长的双语字幕，用于确认歌词可以自然换行，并且不会被新播放栏的单行高度边界裁切';
    const lines = parseLyricPayload({
      lrc: { lyric: '[00:01.00]' + original + '\\n[00:03.00]Upcoming line one\\n[00:05.00]Upcoming line two' },
      tlyric: { lyric: '[00:01.02]' + translation + '\\n[00:03.02]' + translation + ' II\\n[00:05.02]' + translation + ' III' }
    });
    state.currentSong = {
      id: 'qa-bilingual-ui',
      title: 'Bilingual UI QA',
      artist: 'QA Artist',
      duration: 8
    };
    state.lyricLines = lines;
    state.lyricIndex = -1;
    state.lyricSignature = 'qa-bilingual-ui|Bilingual UI QA';

    setTextPreset('depth');
    setMultiRowLyricsEnabled(false);
    setBilingualLyricsEnabled(true);
    updatePlaybackLyricAtTime(1.5);
    renderBookLyricList(els.bookLyricList, lines);
    renderBookLyricList(els.qishuiPlaybackLyricPage, lines, {
      lineClass: 'qishui-playback-lyric-line',
      lazyGlyphs: true
    });
    const bookLine = els.bookLyricList.querySelector('.book-lyric-line');
    const bookMain = bookLine?.querySelector('.book-lyric-line-text');
    const bookTranslation = bookLine?.querySelector('.book-lyric-translation');
    const bookTranslationBase = bookTranslation?.querySelector('.book-lyric-translation-copy--base');
    const bookTranslationHot = bookTranslation?.querySelector('.book-lyric-translation-copy--hot');
    const cardLine = els.qishuiPlaybackLyricPage.querySelector('.qishui-playback-lyric-line');
    const cardTranslation = cardLine.querySelector('.book-lyric-translation');
    const cardTranslationBase = cardTranslation?.querySelector('.book-lyric-translation-copy--base');
    const cardTranslationHot = cardTranslation?.querySelector('.book-lyric-translation-copy--hot');
    const cardNormalTranslationFontSize = Number.parseFloat(getComputedStyle(cardTranslation).fontSize);
    cardLine.classList.add('is-current', 'is-scroll-arrived');
    cardLine.style.setProperty('--book-line-progress', '0%');
    if (cardTranslationHot) cardTranslationHot.style.transition = 'none';
    const cardTranslationClipAtZero = getComputedStyle(cardTranslationHot).clipPath;
    cardLine.style.setProperty('--book-line-progress', '42%');
    const cardTranslationClipAtProgress = getComputedStyle(cardTranslationHot).clipPath;
    const cardCurrentTranslationFontSize = Number.parseFloat(getComputedStyle(cardTranslation).fontSize);
    bookLine.classList.add('is-current', 'is-scroll-arrived');
    bookLine.style.setProperty('--book-line-progress', '0%');
    if (bookTranslationHot) bookTranslationHot.style.transition = 'none';
    const bookTranslationClipAtZero = getComputedStyle(bookTranslationHot).clipPath;
    bookLine.style.setProperty('--book-line-progress', '42%');
    const bookTranslationClipAtProgress = getComputedStyle(bookTranslationHot).clipPath;
    const cardLineStyle = getComputedStyle(cardLine);
    const cardListStyle = getComputedStyle(els.qishuiPlaybackLyricPage);
    els.playbackLyricScene.style.setProperty('--lyric-line-progress', '0%');
    const subtitleClipAtZero = getComputedStyle(els.playbackLyricSubtitle, '::after').clipPath;
    els.playbackLyricScene.style.setProperty('--lyric-line-progress', '42%');
    const subtitleHighlightStyle = getComputedStyle(els.playbackLyricSubtitle, '::after');
    const subtitleClipAtProgress = subtitleHighlightStyle.clipPath;
    const subtitleProgressValue = els.playbackLyricScene.style.getPropertyValue('--lyric-line-progress').trim();
    const subtitleStyle = getComputedStyle(els.playbackLyricSubtitle);
    const palettePresetId = textPalettePresetId();
    const previousTextPalette = { ...textPalettePreference(palettePresetId) };
    setTextPalettePreference('manual', '#56d9f2');
    const subtitlePaletteColorA = els.playbackLyricScene.style.getPropertyValue('--lyric-primary').trim();
    setTextPalettePreference('manual', '#ffadc9');
    const subtitlePaletteColorB = els.playbackLyricScene.style.getPropertyValue('--lyric-primary').trim();
    state.textPalettePreferences[palettePresetId] = previousTextPalette;
    saveTextPalettePreferences();
    applyLyricPalette(state.playbackVisual.palette || fallbackLyricPalette());
    const bookTranslationStyle = getComputedStyle(bookTranslation);
    const bookTranslationFontSize = Number.parseFloat(bookTranslationStyle.fontSize);
    const bookTranslationGap = Number.parseFloat(bookTranslationStyle.marginTop);
    const subtitleGap = els.playbackLyricSubtitle.offsetTop
      - (els.playbackLyricSubtitle.offsetParent?.clientHeight || 0) / 2;
    const cardLineBoundary = {
      maxHeight: cardLineStyle.maxHeight,
      overflow: cardLineStyle.overflow
    };
    const enabledDisplay = {
      main: els.playbackLyricText.textContent.trim(),
      subtitle: els.playbackLyricSubtitle.textContent.trim(),
      subtitleHighlightText: els.playbackLyricSubtitle.dataset.text || '',
      bookTranslation: bookTranslationBase?.textContent.trim() || '',
      cardTranslation: cardTranslationBase?.textContent.trim() || ''
    };

    playbackToggle.click();
    updatePlaybackLyricAtTime(1.5);
    renderBookLyricList(els.bookLyricList, lines);
    renderBookLyricList(els.qishuiPlaybackLyricPage, lines, {
      lineClass: 'qishui-playback-lyric-line',
      lazyGlyphs: true
    });
    const stored = JSON.parse(localStorage.getItem(${JSON.stringify(bilingualStorageKey)}) || '{}');
    const disabledDisplay = {
      subtitle: els.playbackLyricSubtitle.textContent.trim(),
      bookTranslationCount: els.bookLyricList.querySelectorAll('.book-lyric-translation').length,
      cardTranslationCount: els.qishuiPlaybackLyricPage.querySelectorAll('.book-lyric-translation').length,
      checked: toggle.checked,
      value: value.textContent.trim(),
      stored
    };

    playbackToggle.click();
    multiRowToggle.click();
    updatePlaybackLyricAtTime(1.5);
    renderMultiRowLyrics(true);
    const multiRowLines = Array.from(document.querySelectorAll('#multiRowLyricList .multi-row-lyric-line'));
    const multiRowCurrent = multiRowLines.find((line) => line.classList.contains('is-current'));
    const multiRowFuture = multiRowLines.find((line) => line.classList.contains('is-future'));
    const multiRowDisplay = {
      count: multiRowLines.length,
      currentFilter: multiRowCurrent ? getComputedStyle(multiRowCurrent).filter : '',
      futureFilter: multiRowFuture ? getComputedStyle(multiRowFuture).filter : '',
      translationCount: document.querySelectorAll('#multiRowLyricList .multi-row-lyric-translation').length,
      pressed: multiRowToggle.getAttribute('aria-pressed'),
      glyph: multiRowToggle.querySelector('b')?.textContent || ''
    };

    state.currentSong = previous.currentSong;
    state.lyricLines = previous.lyricLines;
    state.lyricIndex = previous.lyricIndex;
    state.lyricSignature = previous.lyricSignature;
    state.lyricBookSignature = previous.lyricBookSignature;
    setMultiRowLyricsEnabled(previous.multiRowLyricsEnabled);
    setTextPreset(previous.textPreset);
    setBilingualLyricsEnabled(false);

    const checks = {
      controlsUseExistingMaterial: toggle.closest('.diy-toggle') !== null,
      playbackToggleAccessible: playbackToggle.classList.contains('qishui-playback-view-button')
        && playbackToggle.getAttribute('aria-pressed') === 'false'
        && playbackToggle.getAttribute('aria-label')
        && playbackToggle.querySelector('b')?.textContent === '原',
      playbackToggleSyncsPanel: toggle.checked === false
        && value.textContent.trim() === 'OFF',
      centralBilingual: enabledDisplay.main === original
        && enabledDisplay.subtitle === translation,
      bookBilingual: enabledDisplay.bookTranslation === translation,
      cardBilingual: enabledDisplay.cardTranslation === translation,
      translationAfterMain: !!bookMain
        && !!bookTranslation
        && !!(bookMain.compareDocumentPosition(bookTranslation) & Node.DOCUMENT_POSITION_FOLLOWING),
      translationLayersPresent: !!bookTranslationBase
        && !!bookTranslationHot
        && bookTranslationHot.getAttribute('aria-hidden') === 'true'
        && !!cardTranslationBase
        && !!cardTranslationHot
        && cardTranslationHot.getAttribute('aria-hidden') === 'true',
      translationProgressHighlight: bookTranslationClipAtZero !== 'none'
        && bookTranslationClipAtProgress !== 'none'
        && bookTranslationClipAtZero !== bookTranslationClipAtProgress
        && cardTranslationClipAtZero !== 'none'
        && cardTranslationClipAtProgress !== 'none'
        && cardTranslationClipAtZero !== cardTranslationClipAtProgress
        && subtitleClipAtZero !== 'none'
        && subtitleProgressValue === '42%'
        && enabledDisplay.subtitleHighlightText === translation,
      translationSizeReadable: Number.parseFloat(subtitleStyle.fontSize) >= 20
        && bookTranslationFontSize >= 19
        && cardNormalTranslationFontSize >= 15
        && cardCurrentTranslationFontSize >= cardNormalTranslationFontSize,
      translationCloseToMain: subtitleGap <= 82
        && bookTranslationGap <= 6,
      translationFollowsMainPalette: subtitlePaletteColorA !== subtitlePaletteColorB,
      centralBoundaryOpen: subtitleStyle.maxHeight === 'none'
        && subtitleStyle.overflow !== 'hidden'
        && subtitleStyle.textOverflow !== 'ellipsis'
        && subtitleStyle.whiteSpace !== 'nowrap',
      cardLineBoundaryOpen: cardLineBoundary.maxHeight === 'none'
        && cardLineBoundary.overflow === 'visible',
      cardListBoundaryPreserved: cardListStyle.overflow === 'hidden'
        || (cardListStyle.overflowX === 'hidden' && cardListStyle.overflowY === 'hidden'),
      disabledFallsBackToArtist: disabledDisplay.subtitle === 'QA Artist',
      disabledHidesTranslations: disabledDisplay.bookTranslationCount === 0
        && disabledDisplay.cardTranslationCount === 0,
      disabledStateSynced: disabledDisplay.checked === false
        && disabledDisplay.value === 'OFF'
        && disabledDisplay.stored.enabled === false,
      multiRowDirectToggle: multiRowDisplay.count >= 2
        && multiRowDisplay.pressed === 'true'
        && multiRowDisplay.glyph === '单'
        && multiRowDisplay.translationCount >= 1,
      futureMultiRowLyricsBlurred: multiRowDisplay.currentFilter === 'blur(0px)'
        && multiRowDisplay.futureFilter.startsWith('blur(')
        && multiRowDisplay.futureFilter !== 'blur(0px)'
    };
    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      enabledDisplay,
      disabledDisplay,
      multiRowDisplay,
      subtitleStyle: {
        fontSize: subtitleStyle.fontSize,
        maxHeight: subtitleStyle.maxHeight,
        overflow: subtitleStyle.overflow,
        textOverflow: subtitleStyle.textOverflow,
        whiteSpace: subtitleStyle.whiteSpace
      },
      translationStyle: {
        bookFontSize: bookTranslationFontSize,
        cardNormalFontSize: cardNormalTranslationFontSize,
        cardCurrentFontSize: cardCurrentTranslationFontSize,
        subtitleGap,
        subtitlePaletteColorA,
        subtitlePaletteColorB,
        bookTranslationGap,
        subtitleClipAtZero,
        subtitleClipAtProgress,
        subtitleProgressValue,
        bookClipAtZero: bookTranslationClipAtZero,
        bookClipAtProgress: bookTranslationClipAtProgress,
        cardClipAtZero: cardTranslationClipAtZero,
        cardClipAtProgress: cardTranslationClipAtProgress
      },
      cardLineStyle: cardLineBoundary,
      cardListOverflow: cardListStyle.overflow
    };
  })()`, true);

  const textTransformPass = await evaluate(`(() => {
    const presets = ['depth', 'flow', 'book-effect', 'focus-echo', 'book'];
    const previous = {
      playbackPage: state.playbackPage,
      textPreset: state.textPreset,
      multiRowLyricsEnabled: state.multiRowLyricsEnabled,
      transforms: JSON.parse(JSON.stringify(state.textPresetTransforms)),
      zoom: state.playbackVisual.zoom,
      storage: localStorage.getItem('fe-monster-text-preset-transforms-v1')
    };
    const centralRect = els.playbackLyricText.getBoundingClientRect;
    const subtitleRect = els.playbackLyricSubtitle.getBoundingClientRect;
    const bookRect = els.bookLyricStage.getBoundingClientRect;
    els.playbackLyricText.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 180, width: 400, height: 80 });
    els.playbackLyricSubtitle.getBoundingClientRect = () => ({ left: 150, top: 184, right: 450, bottom: 224, width: 300, height: 40 });
    els.bookLyricStage.getBoundingClientRect = () => ({ left: 80, top: 70, right: 620, bottom: 410, width: 540, height: 340 });
    state.playbackPage = true;
    state.multiRowLyricsEnabled = false;
    state.playbackVisual.zoom = 1.37;

    const details = presets.map((preset, index) => {
      state.textPreset = preset;
      state.textPresetTransforms[preset] = normalizeTextPresetTransform();
      const point = preset === 'book' ? { x: 300, y: 220 } : { x: 260, y: 140 };
      const wheelHandled = scaleTextPresetFromWheel({
        clientX: point.x,
        clientY: point.y,
        deltaY: -120,
        target: els.stage
      });
      const scale = state.textPresetTransforms[preset].scale;
      const pointerId = 910 + index;
      const began = beginTextPresetGesture({
        clientX: point.x,
        clientY: point.y,
        pointerId,
        target: els.stage
      });
      const moved = moveTextPresetGesture({
        clientX: point.x + 360,
        clientY: point.y + 180,
        pointerId,
        target: els.stage
      });
      const ended = endTextPresetGesture({ pointerId });
      const transform = { ...state.textPresetTransforms[preset] };
      return {
        preset,
        wheelHandled,
        began,
        moved,
        ended,
        scale,
        rotateX: transform.rotateX,
        rotateY: transform.rotateY,
        pass: wheelHandled && began && moved && ended
          && scale > 1
          && Math.abs(transform.rotateX) > 20
          && Math.abs(transform.rotateY) > 20
      };
    });
    const outsideHandled = scaleTextPresetFromWheel({
      clientX: 8,
      clientY: 8,
      deltaY: -120,
      target: els.stage
    });
    const zoomAfter = state.playbackVisual.zoom;

    els.playbackLyricText.getBoundingClientRect = centralRect;
    els.playbackLyricSubtitle.getBoundingClientRect = subtitleRect;
    els.bookLyricStage.getBoundingClientRect = bookRect;
    state.playbackPage = previous.playbackPage;
    state.textPreset = previous.textPreset;
    state.multiRowLyricsEnabled = previous.multiRowLyricsEnabled;
    state.textPresetTransforms = previous.transforms;
    state.playbackVisual.zoom = previous.zoom;
    if (previous.storage === null) localStorage.removeItem('fe-monster-text-preset-transforms-v1');
    else localStorage.setItem('fe-monster-text-preset-transforms-v1', previous.storage);
    updateTextPresetTransform();
    syncMultiRowLyricsControl();

    return {
      pass: details.every((item) => item.pass)
        && outsideHandled === false
        && zoomAfter === 1.37,
      details,
      outsideHandled,
      sceneZoomBefore: 1.37,
      sceneZoomAfter: zoomAfter
    };
  })()`, true);

  const firstPass = await evaluate(`(() => {
    const root = document.getElementById('playbackLyricPaletteControl');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const page = document.getElementById('qishuiPlaybackLyricPage');
    const mainScene = document.getElementById('playbackLyricScene');
    const swatches = Array.from(root.querySelectorAll('[data-playback-lyric-palette-color]'));
    const requiredIds = [
      'playbackLyricPaletteStatus',
      'playbackLyricPaletteAutoButton',
      'playbackLyricPaletteCustomInput',
      'playbackLyricPaletteResetButton'
    ];
    setTextPreset('none');
    const mainPreferencesBefore = JSON.stringify(state.textPalettePreferences);
    const mainColorBefore = mainScene.style.getPropertyValue('--lyric-primary');
    setPlaybackLyricPalettePreference('manual', '#64e7c3');
    const manualPreference = { ...state.playbackLyricPalettePreference };
    const manualValue = phone.style.getPropertyValue('--playback-lyric-current').trim();
    const storedManual = localStorage.getItem(${JSON.stringify(storageKey)}) || '';
    const manualPalette = manualTextLyricPalette('#ffadc9');
    applyQishuiPlaybackPalette(manualPalette);
    const manualAfterCoverChange = phone.style.getPropertyValue('--playback-lyric-current').trim();

    page.innerHTML = [
      '<button class="book-lyric-line qishui-playback-lyric-line" style="--book-line-distance:1">',
      '<span class="book-lyric-line-text"><span class="book-lyric-copy book-lyric-copy--base">清晰歌词</span></span>',
      '</button>',
      '<button class="book-lyric-line qishui-playback-lyric-line is-current is-scroll-arrived" style="--book-line-distance:0">',
      '<span class="book-lyric-line-text"><span class="book-lyric-copy book-lyric-copy--base">当前歌词</span>',
      '<span class="book-lyric-copy book-lyric-copy--hot">当前歌词</span></span>',
      '</button>'
    ].join('');
    const normalLine = page.firstElementChild;
    const currentLine = page.lastElementChild;
    const normalCopy = normalLine.querySelector('.book-lyric-copy--base');
    const currentHot = currentLine.querySelector('.book-lyric-copy--hot');
    const normalStyle = getComputedStyle(normalCopy);
    const currentStyle = getComputedStyle(currentLine);
    const hotStyle = getComputedStyle(currentHot);

    setPlaybackLyricPalettePreference('auto');
    const coverA = manualTextLyricPalette('#3478e5');
    const coverB = manualTextLyricPalette('#ffbc72');
    applyQishuiPlaybackPalette(coverA);
    const autoA = phone.style.getPropertyValue('--playback-lyric-current').trim();
    applyQishuiPlaybackPalette(coverB);
    const autoB = phone.style.getPropertyValue('--playback-lyric-current').trim();
    const independentFromMainPalette = JSON.stringify(state.textPalettePreferences) === mainPreferencesBefore
      && mainScene.style.getPropertyValue('--lyric-primary') === mainColorBefore;

    setTextPreset('focus-echo');
    const scene = document.getElementById('playbackLyricScene');
    scene.classList.remove('is-focus-echo-entering');
    const depths = [0, 1, 2, 3].map((depth) => {
      const element = document.querySelector('.playback-lyric-layer.lyric-depth-' + depth);
      if (element) element.style.animation = 'none';
      const style = getComputedStyle(element);
      return {
        opacity: Number(style.opacity),
        filter: style.filter,
        shadow: style.textShadow,
        display: style.display
      };
    });

    const checks = {
      controlsComplete: requiredIds.every((id) => document.getElementById(id))
        && swatches.length === 8
        && document.getElementById('playbackLyricPaletteCustomInput').type === 'color',
      staysEnabledWithoutMainLyrics: !root.classList.contains('is-disabled')
        && !swatches.some((swatch) => swatch.disabled),
      manualApplied: manualPreference.mode === 'manual'
        && manualPreference.color === '#64e7c3'
        && manualValue.includes('rgba(')
        && manualAfterCoverChange === manualValue
        && storedManual.toLowerCase().includes('#64e7c3'),
      independentFromMainPalette,
      autoFollowsCover: autoA.includes('rgba(') && autoB.includes('rgba(') && autoA !== autoB,
      textIsClear: Number.parseFloat(normalStyle.fontSize) >= 14
        && Number.parseFloat(normalStyle.fontWeight) >= 600
        && normalStyle.textShadow !== 'none'
        && currentStyle.opacity === '1'
        && hotStyle.color !== normalStyle.color,
      focusEchoVisible: depths[0].shadow !== 'none'
        && (depths[0].shadow.match(/rgba?\\(/g) || []).length >= 4
        && depths.slice(1).every((depth) => depth.display !== 'none' && depth.filter.includes('blur'))
        && depths[1].opacity > depths[2].opacity
        && depths[2].opacity > depths[3].opacity
    };
    setPlaybackLyricPalettePreference('manual', '#ffadc9');
    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      manualValue,
      autoA,
      autoB,
      normalStyle: {
        color: normalStyle.color,
        fontSize: normalStyle.fontSize,
        fontWeight: normalStyle.fontWeight,
        textShadow: normalStyle.textShadow
      },
      currentStyle: {
        color: currentStyle.color,
        opacity: currentStyle.opacity,
        fontSize: getComputedStyle(currentLine.querySelector('.book-lyric-line-text')).fontSize
      },
      depths
    };
  })()`, true);

  await command('Page.reload', { ignoreCache: true });
  await waitFor(`document.readyState === 'complete'
    && state.playbackLyricPalettePreference
    && document.getElementById('playbackLyricPaletteCustomInput')`);
  const reloadPass = await evaluate(`(() => {
    const preference = state.playbackLyricPalettePreference;
    const input = document.getElementById('playbackLyricPaletteCustomInput');
    const status = document.getElementById('playbackLyricPaletteStatus');
    const bilingualToggle = document.getElementById('bilingualLyricsToggle');
    const bilingualValue = document.getElementById('bilingualLyricsValue');
    return {
      pass: preference.mode === 'manual'
        && preference.color === '#ffadc9'
        && input.value.toLowerCase() === '#ffadc9'
        && status.textContent === '#FFADC9'
        && state.bilingualLyricsEnabled === false
        && bilingualToggle?.checked === false
        && bilingualValue?.textContent.trim() === 'OFF',
      preference,
      input: input.value,
      status: status.textContent,
      bilingualLyricsEnabled: state.bilingualLyricsEnabled,
      bilingualToggleChecked: bilingualToggle?.checked,
      bilingualValue: bilingualValue?.textContent.trim()
    };
  })()`, true);

  const result = {
    pass: bilingualPass.pass === true
      && bilingualUiPass.pass === true
      && textTransformPass.pass === true
      && firstPass.pass === true
      && reloadPass.pass === true,
    bilingualPass,
    bilingualUiPass,
    textTransformPass,
    firstPass,
    reloadPass
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket && socket.readyState <= 1) socket.close();
  browser.kill();
  server.close();
  await delay(250);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
  }
}
