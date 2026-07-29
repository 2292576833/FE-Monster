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
const lyricStylesSource = readFileSync(path.resolve(webRoot, 'styles.css'), 'utf8');
const lyricAppSource = readFileSync(path.resolve(webRoot, 'app.js'), 'utf8');
const lyricMaterialContractStart = lyricStylesSource.indexOf('/* Continuous lyric highlight: start */');
const lyricMaterialContractEnd = lyricStylesSource.indexOf('/* Continuous lyric highlight: end */');
const lyricMaterialContract = lyricMaterialContractStart >= 0 && lyricMaterialContractEnd > lyricMaterialContractStart
  ? lyricStylesSource.slice(lyricMaterialContractStart, lyricMaterialContractEnd)
  : '';
const lyricMaterialStaticPass = {
  pass: lyricMaterialContract.includes('.lyric-depth-0::after')
    && lyricMaterialContract.includes('content: attr(data-text)')
    && lyricMaterialContract.includes('--lyric-line-progress')
    && lyricMaterialContract.includes('--text-highlight-softness')
    && lyricMaterialContract.includes('mask-image:')
    && lyricMaterialContract.includes('background-clip: text')
    && !lyricStylesSource.includes('.playback-lyric-glyph')
    && !lyricAppSource.includes('playback-lyric-glyph')
    && !lyricStylesSource.includes('--lyric-glyph-')
    && !lyricAppSource.includes('--lyric-glyph-'),
  hasContract: !!lyricMaterialContract,
  hasLineOverlay: lyricMaterialContract.includes('.lyric-depth-0::after')
    && lyricMaterialContract.includes('content: attr(data-text)'),
  hasProgressMask: lyricMaterialContract.includes('--lyric-line-progress')
    && lyricMaterialContract.includes('mask-image:'),
  hasSoftEdge: lyricMaterialContract.includes('--text-highlight-softness'),
  hasLineMaterial: lyricMaterialContract.includes('background-clip: text'),
  hasGlyphMaterialCode: lyricStylesSource.includes('.playback-lyric-glyph')
    || lyricAppSource.includes('playback-lyric-glyph')
    || lyricStylesSource.includes('--lyric-glyph-')
    || lyricAppSource.includes('--lyric-glyph-')
};
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

  const textTransformPass = await evaluate(`(async () => {
    const presets = ['depth', 'flow', 'book-effect', 'focus-echo'];
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
    els.playbackLyricText.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 180, width: 400, height: 80 });
    els.playbackLyricSubtitle.getBoundingClientRect = () => ({ left: 150, top: 184, right: 450, bottom: 224, width: 300, height: 40 });
    state.playbackPage = true;
    state.multiRowLyricsEnabled = false;
    state.playbackVisual.zoom = 1.37;

    const details = [];
    for (let index = 0; index < presets.length; index += 1) {
      const preset = presets[index];
      state.textPreset = preset;
      state.textPresetTransforms[preset] = normalizeTextPresetTransform();
      const bounds = { left: 100, right: 500, top: 100, bottom: 180 };
      const point = {
        x: (bounds.left + bounds.right) / 2,
        y: (bounds.top + bounds.bottom) / 2
      };
      const wheelHandled = scaleTextPresetFromWheel({
        clientX: point.x,
        clientY: point.y,
        deltaY: -120,
        target: els.stage
      });
      const scale = state.textPresetTransforms[preset].scale;
      state.textPresetTransforms[preset] = normalizeTextPresetTransform({ scale });

      const headPointerId = 910 + index * 3;
      const headStart = { x: bounds.left + 8, y: point.y };
      const headBegan = beginTextPresetGesture({
        clientX: headStart.x,
        clientY: headStart.y,
        pointerId: headPointerId,
        target: els.stage
      });
      const headMoved = moveTextPresetGesture({
        clientX: headStart.x + 120,
        clientY: headStart.y + 70,
        pointerId: headPointerId,
        target: els.stage
      });
      const headEnded = endTextPresetGesture({ pointerId: headPointerId });
      const headTransform = { ...state.textPresetTransforms[preset] };

      state.textPresetTransforms[preset] = normalizeTextPresetTransform({ scale });
      const tailPointerId = headPointerId + 1;
      const tailStart = { x: bounds.right - 8, y: point.y };
      const tailBegan = beginTextPresetGesture({
        clientX: tailStart.x,
        clientY: tailStart.y,
        pointerId: tailPointerId,
        target: els.stage
      });
      const tailMoved = moveTextPresetGesture({
        clientX: tailStart.x - 120,
        clientY: tailStart.y - 70,
        pointerId: tailPointerId,
        target: els.stage
      });
      const tailEnded = endTextPresetGesture({ pointerId: tailPointerId });
      const tailTransform = { ...state.textPresetTransforms[preset] };

      state.textPresetTransforms[preset] = normalizeTextPresetTransform({ scale });
      const centerPointerId = headPointerId + 2;
      const centerBegan = beginTextPresetGesture({
        clientX: point.x,
        clientY: point.y,
        pointerId: centerPointerId,
        target: els.stage
      });
      moveTextPresetGesture({
        clientX: point.x + 18,
        clientY: point.y + 12,
        pointerId: centerPointerId,
        target: els.stage
      });
      const beforeHold = { ...state.textPresetTransforms[preset] };
      await new Promise((resolve) => setTimeout(resolve, 390));
      const afterHold = { ...state.textPresetTransforms[preset] };
      const centerMoved = moveTextPresetGesture({
        clientX: point.x + 90,
        clientY: point.y + 55,
        pointerId: centerPointerId,
        target: els.stage
      });
      const centerEnded = endTextPresetGesture({ pointerId: centerPointerId });
      const centerTransform = { ...state.textPresetTransforms[preset] };
      const gestureReleased = state.textPresetGesture.pointerId === null
        && !state.textPresetGesture.dragging
        && !state.textPresetGesture.pending;

      details.push({
        preset,
        wheelHandled,
        scale,
        headTransform,
        tailTransform,
        beforeHold,
        afterHold,
        centerTransform,
        pass: wheelHandled
          && headBegan && headMoved && headEnded
          && tailBegan && tailMoved && tailEnded
          && centerBegan && centerMoved && centerEnded
          && scale > 1
          && headTransform.rotateY > 20
          && headTransform.rotateX < -15
          && headTransform.rotateZ < -8
          && tailTransform.rotateY < -20
          && tailTransform.rotateX > 15
          && tailTransform.rotateZ < -8
          && Math.abs(beforeHold.x || 0) < 0.01
          && Math.abs(beforeHold.y || 0) < 0.01
          && Math.abs(beforeHold.rotateX || 0) < 0.01
          && Math.abs(beforeHold.rotateY || 0) < 0.01
          && Math.abs(afterHold.x || 0) < 0.01
          && Math.abs(afterHold.y || 0) < 0.01
          && Math.abs(centerTransform.x - 72) < 1
          && Math.abs(centerTransform.y - 43) < 1
          && Math.abs(centerTransform.rotateX) < 0.01
          && Math.abs(centerTransform.rotateY) < 0.01
          && gestureReleased
      });
    }
    const outsideHandled = scaleTextPresetFromWheel({
      clientX: 8,
      clientY: 8,
      deltaY: -120,
      target: els.stage
    });
    state.textPreset = 'book';
    const bookTransformBefore = JSON.stringify(state.textPresetTransforms.book);
    const bookGestureHandled = beginTextPresetGesture({
      clientX: 300,
      clientY: 140,
      pointerId: 989,
      target: els.stage
    });
    const bookWheelHandled = scaleTextPresetFromWheel({
      clientX: 300,
      clientY: 140,
      deltaY: -120,
      target: els.stage
    });
    const bookLyricExcluded = !bookGestureHandled
      && !bookWheelHandled
      && JSON.stringify(state.textPresetTransforms.book) === bookTransformBefore;
    const zoomAfter = state.playbackVisual.zoom;
    const originalPause = els.audio.pause;
    const originalLoad = els.audio.load;
    const originalApiJson = apiJson;
    let pauseCalls = 0;
    let loadCalls = 0;
    let apiPauseCalls = 0;
    els.audio.pause = () => { pauseCalls += 1; };
    els.audio.load = () => { loadCalls += 1; };
    apiJson = async (url) => {
      if (String(url).includes('/api/player/pause')) apiPauseCalls += 1;
      return {};
    };
    state.textPreset = 'depth';
    state.textPresetTransforms.depth = normalizeTextPresetTransform();
    els.playbackLyricText.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 130,
      clientY: 140,
      deltaY: -120
    }));
    els.playbackLyricText.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 110,
      clientY: 140,
      pointerId: 991
    }));
    els.stage.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 230,
      clientY: 190,
      pointerId: 991
    }));
    els.stage.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 230,
      clientY: 190,
      pointerId: 991
    }));
    const audioIsolation = pauseCalls === 0 && loadCalls === 0 && apiPauseCalls === 0;
    els.audio.pause = originalPause;
    els.audio.load = originalLoad;
    apiJson = originalApiJson;

    els.playbackLyricText.getBoundingClientRect = centralRect;
    els.playbackLyricSubtitle.getBoundingClientRect = subtitleRect;
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
        && bookLyricExcluded
        && zoomAfter === 1.37
        && audioIsolation,
      details,
      outsideHandled,
      bookLyricExcluded,
      audioIsolation: { pass: audioIsolation, pauseCalls, loadCalls, apiPauseCalls },
      sceneZoomBefore: 1.37,
      sceneZoomAfter: zoomAfter
    };
  })()`, true);

  const lyricGlyphMaterialPass = await evaluate(`(async () => {
    const presets = ['depth', 'flow', 'book-effect', 'focus-echo'];
    const previous = {
      playbackPage: state.playbackPage,
      diyPreset: state.diyPreset,
      textPreset: state.textPreset,
      multiRowLyricsEnabled: state.multiRowLyricsEnabled,
      lyricDisplayText: state.lyricDisplayText,
      lyricSubtitleText: state.lyricSubtitleText,
      lyricProgressPercent: state.lyricProgressPercent,
      lowFrequencyAmplitude: state.visual.lowFrequencyAmplitude,
      bass: state.visual.bass,
      bridgeLowFrequencyAmplitude: state.visualBridge.lowFrequencyAmplitude,
      bridgeBass: state.visualBridge.bass,
      playbackClock: isPlaybackClockRunning
    };
    state.playbackPage = true;
    state.diyPreset = 'lyric';
    state.multiRowLyricsEnabled = false;
    state.visual.lowFrequencyAmplitude = 0.92;
    state.visual.bass = 0.84;
    state.visualBridge.lowFrequencyAmplitude = 0.9;
    state.visualBridge.bass = 0.82;
    isPlaybackClockRunning = () => true;
    const materialText = 'Glow逐字光泽';
    const expectedGlyphCount = Array.from(materialText).filter((glyph) => glyph.trim()).length;

    const details = [];
    for (const preset of presets) {
      setTextPreset(preset);
      setPlaybackLyricLine(materialText, '', 0.58, 12);
      updatePlaybackSceneMotion();
      const glyphs = Array.from(
        els.playbackLyricText.querySelectorAll('.playback-lyric-glyph:not(.playback-lyric-glyph--space)')
      );
      glyphs.forEach((glyph) => {
        glyph.style.transition = 'none';
      });
      updatePlaybackSceneMotion();
      const glyphStyle = glyphs[0] ? getComputedStyle(glyphs[0]) : null;
      const highlightRgb = getComputedStyle(els.playbackLyricScene)
        .getPropertyValue('--lyric-highlight-rgb')
        .split(',')
        .map((channel) => channel.trim())
        .join(', ');
      const activeGlyphShadows = glyphs.slice(0, 4).map((glyph) => getComputedStyle(glyph).textShadow);
      const rigStyle = getComputedStyle(els.playbackLyricRig);
      const coreStyle = getComputedStyle(els.playbackLyricCore);
      const layerStyle = getComputedStyle(els.playbackLyricText);
      const rigHalo = getComputedStyle(els.playbackLyricRig, '::after');
      const coreBefore = getComputedStyle(els.playbackLyricCore, '::before');
      const coreAfter = getComputedStyle(els.playbackLyricCore, '::after');
      const lineHalo = getComputedStyle(els.playbackLyricText, '::after');
      const alpha = Number.parseFloat(
        els.playbackLyricScene.style.getPropertyValue('--text-bass-glow-alpha') || '0'
      );
      details.push({
        preset,
        alpha,
        glyphCount: glyphs.length,
        glyphTextShadow: glyphStyle?.textShadow || '',
        glyphBackgroundImage: glyphStyle?.backgroundImage || '',
        glyphBackgroundClip: glyphStyle?.webkitBackgroundClip || glyphStyle?.backgroundClip || '',
        highlightRgb,
        distinctGlyphShadows: new Set(activeGlyphShadows).size,
        rig: {
          filter: rigStyle.filter,
          boxShadow: rigStyle.boxShadow,
          haloContent: rigHalo.content,
          haloDisplay: rigHalo.display
        },
        core: {
          filter: coreStyle.filter,
          boxShadow: coreStyle.boxShadow,
          beforeContent: coreBefore.content,
          beforeDisplay: coreBefore.display,
          afterContent: coreAfter.content,
          afterDisplay: coreAfter.display
        },
        layer: {
          filter: layerStyle.filter,
          boxShadow: layerStyle.boxShadow,
          textShadow: layerStyle.textShadow,
          haloContent: lineHalo.content,
          haloDisplay: lineHalo.display
        },
        pass: alpha > 0.35
          && glyphs.length === expectedGlyphCount
          && glyphStyle
          && glyphStyle.textShadow !== 'none'
          && glyphStyle.textShadow.includes(highlightRgb)
          && glyphStyle.backgroundImage.includes('linear-gradient')
          && (glyphStyle.webkitBackgroundClip === 'text' || glyphStyle.backgroundClip === 'text')
          && new Set(activeGlyphShadows).size > 1
          && !rigStyle.filter.includes('drop-shadow')
          && !coreStyle.filter.includes('drop-shadow')
          && !layerStyle.filter.includes('drop-shadow')
          && rigStyle.boxShadow === 'none'
          && coreStyle.boxShadow === 'none'
          && layerStyle.boxShadow === 'none'
          && layerStyle.textShadow === 'none'
          && (rigHalo.content === 'none' || rigHalo.display === 'none')
          && (coreBefore.content === 'none' || coreBefore.display === 'none')
          && (coreAfter.content === 'none' || coreAfter.display === 'none')
          && (lineHalo.content === 'none' || lineHalo.display === 'none')
      });
    }

    setTextPreset('depth');
    setPlaybackLyricLine('逐字低频散光测试', '', 0.62, 12);
    isPlaybackClockRunning = () => true;
    Array.from(els.playbackLyricText.querySelectorAll('.playback-lyric-glyph')).forEach((glyph) => {
      glyph.style.transition = 'none';
    });
    updatePlaybackSceneMotion();
    const bassGlyph = els.playbackLyricText.querySelector(
      '.playback-lyric-glyph:not(.playback-lyric-glyph--space)'
    );
    const activeBassShadow = bassGlyph ? getComputedStyle(bassGlyph).textShadow : '';
    const activeBassAlpha = Number.parseFloat(
      els.playbackLyricScene.style.getPropertyValue('--text-bass-glow-alpha') || '0'
    );

    isPlaybackClockRunning = () => false;
    updatePlaybackSceneMotion();
    const stoppedBassShadow = bassGlyph ? getComputedStyle(bassGlyph).textShadow : '';
    const stoppedAlpha = Number.parseFloat(
      els.playbackLyricScene.style.getPropertyValue('--text-bass-glow-alpha') || '0'
    );

    setTextPreset('book');
    setPlaybackLyricLine('书页逻辑保持独立', '', 0.4, 12);
    updatePlaybackSceneMotion();
    const bookAlpha = Number.parseFloat(
      els.playbackLyricScene.style.getPropertyValue('--text-bass-glow-alpha') || '0'
    );
    const bookPlaybackGlyphCount = els.playbackLyricText.querySelectorAll('.playback-lyric-glyph').length;

    isPlaybackClockRunning = previous.playbackClock;
    state.playbackPage = previous.playbackPage;
    state.multiRowLyricsEnabled = previous.multiRowLyricsEnabled;
    state.visual.lowFrequencyAmplitude = previous.lowFrequencyAmplitude;
    state.visual.bass = previous.bass;
    state.visualBridge.lowFrequencyAmplitude = previous.bridgeLowFrequencyAmplitude;
    state.visualBridge.bass = previous.bridgeBass;
    setTextPreset(previous.textPreset);
    setPlaybackLyricLine(
      previous.lyricDisplayText,
      previous.lyricSubtitleText,
      Math.max(0, previous.lyricProgressPercent) / 100,
      Number.NaN
    );

    return {
      pass: details.every((item) => item.pass)
        && activeBassAlpha > 0.35
        && stoppedAlpha === 0
        && activeBassShadow !== stoppedBassShadow
        && stoppedBassShadow !== 'none'
        && bookAlpha === 0
        && bookPlaybackGlyphCount === 0,
      details,
      activeBassAlpha,
      activeBassShadow,
      stoppedAlpha,
      stoppedBassShadow,
      bookAlpha,
      bookPlaybackGlyphCount
    };
  })()`, true);

  const lyricRollingHighlightPass = await evaluate(`(() => {
    const presets = ['depth', 'flow', 'book-effect', 'focus-echo'];
    const previous = {
      playbackPage: state.playbackPage,
      diyPreset: state.diyPreset,
      textPreset: state.textPreset,
      multiRowLyricsEnabled: state.multiRowLyricsEnabled,
      lyricDisplayText: state.lyricDisplayText,
      lyricSubtitleText: state.lyricSubtitleText,
      lyricProgressPercent: state.lyricProgressPercent
    };
    state.playbackPage = true;
    state.diyPreset = 'lyric';
    state.multiRowLyricsEnabled = false;
    const details = presets.map((preset) => {
      setTextPreset(preset);
      state.lyricDisplayText = '';
      setPlaybackLyricLine('整行滚动高亮测试', '同步翻译', 0.2, 12);
      const layer = els.playbackLyricText;
      const atTwenty = getComputedStyle(layer, '::after');
      const firstMask = atTwenty.maskImage || atTwenty.webkitMaskImage || '';
      const firstProgress = els.playbackLyricScene.style.getPropertyValue('--lyric-line-progress').trim();
      setPlaybackLyricLine('整行滚动高亮测试', '同步翻译', 0.75, 12.5);
      const atSeventyFive = getComputedStyle(layer, '::after');
      const secondMask = atSeventyFive.maskImage || atSeventyFive.webkitMaskImage || '';
      const secondProgress = els.playbackLyricScene.style.getPropertyValue('--lyric-line-progress').trim();
      const subtitleMaskStyle = getComputedStyle(els.playbackLyricSubtitle, '::after');
      const subtitleMask = subtitleMaskStyle.maskImage || subtitleMaskStyle.webkitMaskImage || '';
      const glyphCount = layer.querySelectorAll('.playback-lyric-glyph').length;
      return {
        preset,
        glyphCount,
        firstProgress,
        secondProgress,
        firstMask,
        secondMask,
        subtitleMask,
        backgroundImage: atSeventyFive.backgroundImage,
        backgroundClip: atSeventyFive.webkitBackgroundClip || atSeventyFive.backgroundClip,
        pass: glyphCount === 0
          && firstProgress === '20.00%'
          && secondProgress === '75.00%'
          && firstMask.includes('linear-gradient')
          && secondMask.includes('linear-gradient')
          && firstMask !== secondMask
          && subtitleMask.includes('linear-gradient')
          && atSeventyFive.backgroundImage.includes('linear-gradient')
          && (atSeventyFive.webkitBackgroundClip === 'text' || atSeventyFive.backgroundClip === 'text')
      };
    });

    state.playbackPage = previous.playbackPage;
    state.diyPreset = previous.diyPreset;
    state.multiRowLyricsEnabled = previous.multiRowLyricsEnabled;
    setTextPreset(previous.textPreset);
    state.lyricDisplayText = '';
    setPlaybackLyricLine(
      previous.lyricDisplayText,
      previous.lyricSubtitleText,
      Math.max(0, previous.lyricProgressPercent) / 100,
      Number.NaN
    );
    return {
      pass: details.every((item) => item.pass),
      details
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

    setTextPreset('depth');
    setTextComposerSetting('lyricsEnabled', true);
    setTextComposerSetting('echoLayers', 3);
    setTextComposerSetting('echoSpacing', 22);
    setPlaybackLyricLine('聚焦回声滚动高亮', '', 0.56, 12);
    const scene = document.getElementById('playbackLyricScene');
    scene.classList.remove('is-focus-echo-entering');
    const focusHighlightStyle = getComputedStyle(els.playbackLyricText, '::after');
    const focusHighlightMask = focusHighlightStyle.maskImage || focusHighlightStyle.webkitMaskImage || '';
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
      parameterizedEchoVisible: state.textPreset === 'depth'
        && state.textComposerSettings.echoLayers === 3
        && state.textComposerSettings.echoSpacing === 22
        && els.playbackLyricText.querySelectorAll('.playback-lyric-glyph').length === 0
        && focusHighlightMask.includes('linear-gradient')
        && focusHighlightStyle.backgroundImage.includes('linear-gradient')
        && scene.querySelectorAll('.is-text-composer-layer-visible').length === 3
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

  const timeOriginBeforeReload = await evaluate('performance.timeOrigin');
  await command('Page.reload', { ignoreCache: true });
  await waitFor(`performance.timeOrigin !== ${JSON.stringify(timeOriginBeforeReload)}
    && document.readyState === 'complete'
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

  const lyricContinuityPass = await evaluate(`(() => {
    if (typeof syncPlaybackLyricSubtitleLayout !== 'function') {
      return { pass: false, subtitleLayoutFunctionPresent: false };
    }

    const timedLine = {
      time: 1,
      endTime: 3,
      text: 'AB',
      glyphTimings: [
        { char: 'A', start: 1, end: 1.3 },
        { char: 'B', start: 2, end: 2.3 }
      ]
    };
    const gapProgress = [1.42, 1.7, 1.94]
      .map((time) => lyricProgressForLineAtTime(timedLine, time, 3));
    const resumedProgress = lyricProgressForLineAtTime(timedLine, 2.15, 3);
    const autoLine = { time: 4, autoVocalEndTime: 5.2, text: 'pause here' };
    const autoTailStart = lyricProgressForLineAtTime(autoLine, 5.2, 8);
    const autoTailEnd = lyricProgressForLineAtTime(autoLine, 7.6, 8);

    const previous = {
      playbackPage: state.playbackPage,
      diyPreset: state.diyPreset,
      textPreset: state.textPreset,
      currentSong: state.currentSong,
      lyricLines: state.lyricLines,
      lyricIndex: state.lyricIndex,
      lyricSignature: state.lyricSignature,
      multiRowLyricsEnabled: state.multiRowLyricsEnabled,
      bilingualLyricsEnabled: state.bilingualLyricsEnabled
    };
    state.playbackPage = true;
    els.appShell.classList.add('is-playback-page');
    els.playbackLyricScene.hidden = false;
    setTextPreset('depth');
    setTextComposerSetting('lyricsEnabled', true);
    setBilingualLyricsEnabled(true);
    state.currentSong = { id: 'lyric-continuity', title: 'Lyric continuity', artist: 'QA' };
    state.lyricLines = Array.from({ length: 9 }, (_, index) => ({
      time: index * 2,
      text: 'Main lyric ' + index,
      translationText: '中文字幕 ' + index
    }));
    state.lyricSignature = 'lyric-continuity|9';
    state.lyricIndex = 2;
    setMultiRowLyricsEnabled(true);
    renderMultiRowLyrics(true);
    const stableBefore = els.multiRowLyricList.querySelector('[data-multi-row-lyric-index="2"]');
    state.lyricIndex = 3;
    state.lyricProgressPercent = 36;
    renderMultiRowLyrics();
    const stableAfter = els.multiRowLyricList.querySelector('[data-multi-row-lyric-index="2"]');
    const currentRow = els.multiRowLyricList.querySelector('.multi-row-lyric-line.is-current');
    const multiRowProgress = currentRow?.style.getPropertyValue('--multi-row-progress') || '';

    setPlaybackLyricLine('Main lyric', '更大的中文字幕', 0.42, 1.5);
    syncPlaybackLyricSubtitleLayout();
    const mainRect = els.playbackLyricText.getBoundingClientRect();
    const subtitleRect = els.playbackLyricSubtitle.getBoundingClientRect();
    const subtitleStyle = getComputedStyle(els.playbackLyricSubtitle);
    const subtitleGap = subtitleRect.top - mainRect.bottom;
    const subtitleFontSize = Number.parseFloat(subtitleStyle.fontSize);
    const multiRowEnabledDuringCheck = state.multiRowLyricsEnabled;

    setMultiRowLyricsEnabled(previous.multiRowLyricsEnabled);
    setBilingualLyricsEnabled(previous.bilingualLyricsEnabled);
    state.currentSong = previous.currentSong;
    state.lyricLines = previous.lyricLines;
    state.lyricIndex = previous.lyricIndex;
    state.lyricSignature = previous.lyricSignature;
    state.diyPreset = previous.diyPreset;
    setTextPreset(previous.textPreset);
    state.playbackPage = previous.playbackPage;
    els.appShell.classList.toggle('is-playback-page', previous.playbackPage);

    const timedGapFreezes = Math.max(...gapProgress) - Math.min(...gapProgress) < 0.0001;
    const checks = {
      timedGapFreezes,
      timedProgressResumes: resumedProgress > gapProgress[0],
      inferredTailFreezes: Math.abs(autoTailStart - autoTailEnd) < 0.0001,
      multiRowNodesReused: !!stableBefore && stableBefore === stableAfter,
      multiRowProgressApplied: !!currentRow
        && Math.abs(Number.parseFloat(multiRowProgress) - 36) < 0.001,
      subtitleClose: subtitleGap >= 1 && subtitleGap <= 12,
      subtitleLarge: subtitleFontSize >= 28
    };
    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      gapProgress,
      resumedProgress,
      autoTailStart,
      autoTailEnd,
      multiRowProgress,
      multiRowCurrentIndex: currentRow?.dataset.multiRowLyricIndex || '',
      multiRowEnabledDuringCheck,
      subtitleGap,
      subtitleFontSize
    };
  })()`, true);

  const qishuiLyricClockPass = await evaluate(`(async () => {
    const card = els.qishuiPlaybackCard;
    const list = els.qishuiPlaybackLyricPage;
    const laterButton = els.qishuiPlaybackLyricLaterButton;
    const earlierButton = els.qishuiPlaybackLyricEarlierButton;
    if (
      !card
      || !list
      || !laterButton
      || !earlierButton
      || typeof syncQishuiLyricTransition !== 'function'
    ) {
      return { pass: false, ready: false };
    }

    const previous = {
      cardHidden: card.hidden,
      hasCardClass: els.appShell.classList.contains('has-qishui-playback-card'),
      currentSong: state.currentSong,
      lyricLines: state.lyricLines,
      lyricSignature: state.lyricSignature,
      cardSignature: state.qishuiPlaybackCard.lyricSignature,
      bookIndex: state.qishuiPlaybackCard.lyricBookIndex,
      lastIndex: state.qishuiPlaybackCard.lastLyricIndex
    };

    card.hidden = false;
    els.appShell.classList.add('has-qishui-playback-card');
    state.currentSong = {
      id: 'qishui-clock-transition',
      title: 'Clock transition',
      artist: 'QA',
      provider: 'netease'
    };
    state.lyricLines = Array.from({ length: 9 }, (_, index) => ({
      time: index,
      text: index === 1
        ? 'A long playback-card lyric that wraps naturally across two lines'
        : 'Playback card lyric ' + index,
      translationText: 'Translated playback lyric ' + index
    }));
    state.lyricSignature = 'qishui-clock-transition|9';
    state.qishuiPlaybackCard.lyricSignature = '';
    state.qishuiPlaybackCard.lyricBookIndex = -2;
    state.qishuiPlaybackCard.lastLyricIndex = -1;
    state.qishuiPlaybackCard.lyricBookArrivedIndex = -2;
    resetBookLyricScrollState({ store: state.qishuiPlaybackCard });

    updateQishuiPlaybackLyrics('', '', 0.5, { playbackRunning: true });
    const stableLine = list.querySelector('[data-book-lyric-index="1"]');
    updateQishuiPlaybackLyrics('', '', 0.9, { playbackRunning: true });
    const transition = state.qishuiPlaybackCard.lyricTransition;
    const animation = transition?.animations?.[0]?.animation || null;
    const frozenAnimationAt = Number(animation?.currentTime) || 0;
    const frozenScrollAt = Number(list.scrollTop) || 0;

    await new Promise((resolve) => setTimeout(resolve, 140));
    updateQishuiPlaybackLyrics('', '', 0.9, { playbackRunning: true });
    const frozenAnimationAfterWallTime = Number(animation?.currentTime) || 0;
    const frozenScrollAfterWallTime = Number(list.scrollTop) || 0;

    updateQishuiPlaybackLyrics('', '', 0.98, { playbackRunning: true });
    const progressedAnimationAt = Number(animation?.currentTime) || 0;
    const stableLineAfter = list.querySelector('[data-book-lyric-index="1"]');
    const timeRow = laterButton.parentElement;
    const buttonStyle = getComputedStyle(laterButton);
    const timeRowRect = timeRow.getBoundingClientRect();
    const buttonRect = laterButton.getBoundingClientRect();

    const checks = {
      transitionCreated: !!transition && !!animation,
      wallTimeCannotAdvanceTransition: Math.abs(frozenAnimationAfterWallTime - frozenAnimationAt) < 0.01,
      wallTimeCannotAdvanceScroll: Math.abs(frozenScrollAfterWallTime - frozenScrollAt) < 0.01,
      mediaTimeAdvancesTransition: progressedAnimationAt > frozenAnimationAfterWallTime + 20,
      lyricNodesReused: !!stableLine && stableLine === stableLineAfter,
      controlsAreDirectSiblings: laterButton.parentElement === earlierButton.parentElement
        && timeRow?.classList.contains('qishui-playback-times')
        && !timeRow.querySelector('.qishui-playback-lyric-clock'),
      controlsUseGlassSurface: laterButton.matches('[data-glass-surface].glass-surface')
        && earlierButton.matches('[data-glass-surface].glass-surface')
        && buttonStyle.backdropFilter !== 'none',
      controlsDoNotGrowTimeRow: buttonRect.height >= 20 && timeRowRect.height < buttonRect.height
    };

    disposeQishuiLyricTransition();
    card.hidden = previous.cardHidden;
    els.appShell.classList.toggle('has-qishui-playback-card', previous.hasCardClass);
    state.currentSong = previous.currentSong;
    state.lyricLines = previous.lyricLines;
    state.lyricSignature = previous.lyricSignature;
    state.qishuiPlaybackCard.lyricSignature = previous.cardSignature;
    state.qishuiPlaybackCard.lyricBookIndex = previous.bookIndex;
    state.qishuiPlaybackCard.lastLyricIndex = previous.lastIndex;

    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      frozenAnimationAt,
      frozenAnimationAfterWallTime,
      progressedAnimationAt,
      frozenScrollAt,
      frozenScrollAfterWallTime,
      timeRowHeight: timeRowRect.height,
      buttonHeight: buttonRect.height,
      buttonBackdropFilter: buttonStyle.backdropFilter
    };
  })()`, true);

  const result = {
    pass: lyricMaterialStaticPass.pass === true
      && bilingualPass.pass === true
      && bilingualUiPass.pass === true
      && textTransformPass.pass === true
      && lyricGlyphMaterialPass.pass === false
      && lyricRollingHighlightPass.pass === true
      && firstPass.pass === true
      && reloadPass.pass === true
      && lyricContinuityPass.pass === true
      && qishuiLyricClockPass.pass === true,
    lyricMaterialStaticPass,
    bilingualPass,
    bilingualUiPass,
    textTransformPass,
    glyphLocalMaterialAbsent: lyricGlyphMaterialPass.pass === false,
    lyricRollingHighlightPass,
    firstPass,
    reloadPass,
    lyricContinuityPass,
    qishuiLyricClockPass
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
