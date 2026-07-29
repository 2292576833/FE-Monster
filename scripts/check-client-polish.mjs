import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const debugPort = 17000 + (process.pid % 12000);
const profile = path.resolve(tmpdir(), `fe-monster-client-polish-${process.pid}`);
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryJson(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error("Edge debugging endpoint did not start");
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No Edge page target was found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.navigate", { url: `${baseUrl}/?qa=client-polish` });
  await delay(2400);
  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const withTimeout = (promise, label, timeoutMs = 15000) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Client polish timeout: ' + label)), timeoutMs))
      ]);
      state.providers.netease = { ...state.providers.netease, enabled: true, configured: true };
      state.activeProvider = 'netease';
      renderLoginStatus({ provider: 'netease', loggedIn: true, account: { nickname: 'QA', vipType: 110 } });
      els.bootScreen.hidden = true;
      enterPlaybackPage();
      const longBookLyric = '当潮汐越过沉睡的礁石与旧港灯塔我们仍沿着漫长海岸寻找那一道穿过暴雨云层的微光让每一个没有说完的故事都在书页上完整展开而不是消失在页面边缘';
      state.currentSong = {
        id: 'qa-book-lyric',
        title: '书页歌词回归',
        artist: 'QA',
        provider: 'local',
        source: 'local',
        localUrl: 'blob:qa-book-lyric'
      };
      setDiyPreset('book');
      setTextPreset('book');
      state.lyricSignature = 'qa-book-lyric|书页歌词回归';
      state.lyricNoLyricSignature = '';
      state.lyricLines = [{ time: 0, text: longBookLyric, glyphTimings: [] }];
      state.lyricIndex = 0;
      state.playbackPage = true;
      renderBookLyricLines(true);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const bookLine = document.querySelector('.book-lyric-line-text');
      const bookBase = bookLine?.querySelector('.book-lyric-copy--base');
      const bookHot = bookLine?.querySelector('.book-lyric-copy--hot');
      const bookButton = bookLine?.closest('.book-lyric-line');
      const bookBaseRect = bookBase?.getBoundingClientRect();
      const bookLineStyle = bookLine ? getComputedStyle(bookLine) : null;
      const bookButtonStyle = bookButton ? getComputedStyle(bookButton) : null;
      const bookFitScale = Number.parseFloat(bookLineStyle?.getPropertyValue('--book-line-fit-scale') || '1') || 1;
      const bookButtonContentWidth = bookButton
        ? bookButton.clientWidth
          - (Number.parseFloat(bookButtonStyle?.paddingLeft || '0') || 0)
          - (Number.parseFloat(bookButtonStyle?.paddingRight || '0') || 0)
        : 0;
      const bookBaseGlyphs = Array.from(bookBase?.querySelectorAll('.book-lyric-base-glyph') || []);
      const bookHotGlyphs = Array.from(bookHot?.querySelectorAll('.book-lyric-glyph') || []);
      const bookMetrics = {
        complete: bookBase?.textContent === longBookLyric,
        measurable: Boolean(bookLine && bookLine.clientWidth > 0 && bookLine.clientHeight > 0),
        fitsWidth: Boolean(bookLine && bookButtonContentWidth > 0
          && bookLine.offsetWidth * bookFitScale <= bookButtonContentWidth + 1),
        fitsHeight: Boolean(bookLine && bookLine.clientHeight > 0 && bookLine.scrollHeight <= bookLine.clientHeight + 3),
        singleLine: bookBaseGlyphs.length > 0
          && new Set(bookBaseGlyphs.map((glyph) => glyph.offsetTop)).size === 1,
        layersAligned: bookBaseGlyphs.length === bookHotGlyphs.length
          && bookBaseGlyphs.every((glyph, index) => {
            const hotGlyph = bookHotGlyphs[index];
            return Math.abs(glyph.offsetLeft - hotGlyph.offsetLeft) <= 1
              && Math.abs(glyph.offsetTop - hotGlyph.offsetTop) <= 1
              && Math.abs(glyph.offsetWidth - hotGlyph.offsetWidth) <= 1
              && Math.abs(glyph.offsetHeight - hotGlyph.offsetHeight) <= 1;
          }),
        dimensions: bookLine ? {
          clientWidth: bookLine.clientWidth,
          scrollWidth: bookLine.scrollWidth,
          clientHeight: bookLine.clientHeight,
          scrollHeight: bookLine.scrollHeight,
          renderedTextWidth: bookBaseRect?.width || 0,
          fontSize: Number.parseFloat(bookLineStyle?.fontSize || '0'),
          fitScale: bookFitScale,
          availableWidth: bookButtonContentWidth
        } : null,
        whiteSpace: bookLineStyle?.whiteSpace || '',
        text: bookBase?.textContent || ''
      };
      const wavBuffer = new ArrayBuffer(44 + 800);
      const wavView = new DataView(wavBuffer);
      const writeWavText = (offset, value) => Array.from(value).forEach((character, index) => wavView.setUint8(offset + index, character.charCodeAt(0)));
      writeWavText(0, 'RIFF');
      wavView.setUint32(4, 36 + 800, true);
      writeWavText(8, 'WAVE');
      writeWavText(12, 'fmt ');
      wavView.setUint32(16, 16, true);
      wavView.setUint16(20, 1, true);
      wavView.setUint16(22, 1, true);
      wavView.setUint32(24, 8000, true);
      wavView.setUint32(28, 8000, true);
      wavView.setUint16(32, 1, true);
      wavView.setUint16(34, 8, true);
      writeWavText(36, 'data');
      wavView.setUint32(40, 800, true);
      new Uint8Array(wavBuffer, 44).fill(128);
      const localImportResult = await withTimeout(importLocalAudioFiles([
        new File([wavBuffer], 'Playback Fixture.wav', { type: 'audio/wav', lastModified: 10 }),
        new File([new Uint8Array([0])], 'Local Fixture.flac', { type: 'audio/flac', lastModified: 11 }),
        new File([new Uint8Array([1])], 'Lossless Fixture.ape', { type: '', lastModified: 12 })
      ], { openShelf: false, silent: true }), 'local audio import');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const localPlaylistCard = document.querySelector('[data-playlist-id="local-import"]');
      const localImportReady = localImportResult.added === 3
        && state.localPlaylistSongs.some((song) => song.extension === 'flac')
        && state.localPlaylistSongs.some((song) => song.extension === 'ape')
        && Boolean(localPlaylistCard && !els.playlistOrbit.hidden)
        && Boolean(els.localPlaylistInput?.multiple)
        && String(els.localPlaylistInput?.accept || '').includes('.ape');
      const localWavSong = state.localPlaylistSongs.find((song) => song.extension === 'wav');
      state.queue = localWavSong ? [localWavSong] : [];
      state.queueIndex = localWavSong ? 0 : -1;
      state.localQueueActive = Boolean(localWavSong);
      const localPlaybackLoaded = localWavSong
        ? await withTimeout(loadSong(localWavSong, { autoplay: false }), 'local song load')
        : false;
      await wait(160);
      await withTimeout(refreshPlayerState(), 'player state refresh');
      const localPlaybackReady = Boolean(localPlaybackLoaded
        && state.localQueueActive
        && state.currentSong?.id === localWavSong?.id
        && (els.audio.currentSrc || els.audio.src).startsWith('blob:'));
      setDiyPreset('lyric');
      renderDiySelectedPresetConfig();

      const storm = state.sandbox.presets.find((preset) => preset.id === 'preset-storm-ocean-horizon');
      if (storm) selectDiyScenePreset(storm.id);
      const cubeControl = document.querySelector('#diyCubeIntensityControl');
      const coverControl = document.querySelector('#diyCoverParticleControl');
      const coverMotionRange = document.querySelector('#diyCoverParticleMotionRange');
      const coverMotionValue = document.querySelector('#diyCoverParticleMotionValue');
      const stormQuickControls = document.querySelector('#stormPresetLightingQuickControls');
      const stormStageControls = document.querySelector('#stormLightingControls');
      const previewKeepsUnrelatedControlsHidden = Boolean(
        cubeControl?.hidden
        && coverControl?.hidden
        && stormQuickControls?.hidden
        && stormStageControls?.hidden
      );
      if (storm) enterDiyScenePresetPlayback(storm.id);
      const stormShowsOnlyStormControls = Boolean(
        storm
        && !stormQuickControls?.hidden
        && !stormStageControls?.hidden
        && cubeControl?.hidden
        && coverControl?.hidden
      );
      enterPresetPlaybackPage('cube');
      const cubeShowsOnlyCubeControl = Boolean(
        !cubeControl?.hidden
        && coverControl?.hidden
        && stormQuickControls?.hidden
        && stormStageControls?.hidden
      );
      enterPresetPlaybackPage('cover-particles');
      const coverShowsOnlyCoverControl = Boolean(
        cubeControl?.hidden
        && !coverControl?.hidden
        && stormQuickControls?.hidden
      );
      if (coverMotionRange) {
        coverMotionRange.value = '135';
        coverMotionRange.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const coverMotionControlWorks = Boolean(
        coverMotionRange
        && coverMotionRange.min === '0'
        && coverMotionRange.max === '200'
        && coverMotionRange.step === '1'
        && Math.abs(state.coverParticle.motionAmplitude - 1.35) < 1e-7
        && coverMotionValue?.textContent === '135%'
        && coverMotionRange.getAttribute('aria-valuetext') === '135%'
        && builtinDiyPresetConfiguration().runtimeControls?.coverMotionAmplitude === '135%'
      );
      if (coverMotionRange) {
        coverMotionRange.value = '80';
        coverMotionRange.dispatchEvent(new Event('input', { bubbles: true }));
      }
      enterPresetPlaybackPage('lyric');

      const importedPngBytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
        (character) => character.charCodeAt(0)
      );
      await withTimeout(importWallpaperFiles([
        new File([importedPngBytes], 'QA Imported Wallpaper.png', {
          type: 'image/png',
          lastModified: 20
        })
      ]), 'imported wallpaper fixture');
      await withTimeout(refreshWallpapers({ source: 'imported', scan: false }), 'imported wallpaper refresh');
      const importedImage = visibleWallpapers().find((wallpaper) => wallpaper.kind === 'image');
      if (importedImage) selectWallpaper(importedImage.id);
      await wait(500);
      const importedVisible = Boolean(importedImage && !els.wallpaperImage.hidden && els.wallpaperImage.naturalWidth > 0);

      await withTimeout(refreshWallpapers({ source: 'live', scan: true }), 'live wallpaper refresh');
      const liveVideo = visibleWallpapers().find((wallpaper) => wallpaper.kind === 'video');
      if (liveVideo) selectWallpaper(liveVideo.id);
      await wait(1600);
      const liveVisible = Boolean(liveVideo && !els.wallpaperVideo.hidden && els.wallpaperVideo.readyState >= 1);

      const searchStyle = getComputedStyle(els.searchForm);
      const dock = document.querySelector('.player-dock');
      const dockStyle = getComputedStyle(dock);
      const glassState = (element, style) => {
        const svgMode = element.classList.contains('glass-surface--svg');
        const fallbackMode = element.classList.contains('glass-surface--fallback');
        const filterActive = svgMode
          ? style.backdropFilter.includes('url(')
          : fallbackMode && style.backdropFilter.includes('blur(');
        const backgroundChannels = (style.backgroundColor.match(/[\\d.]+/g) || []).map(Number);
        return {
          mode: svgMode ? 'svg' : fallbackMode ? 'fallback' : 'none',
          filterActive,
          oneFilter: element.querySelectorAll(':scope > .glass-surface__filter').length === (svgMode ? 1 : 0),
          oneContent: element.querySelectorAll(':scope > .glass-surface__content').length === 1,
          blackSurface: backgroundChannels.length >= 4
            && backgroundChannels[0] <= 8
            && backgroundChannels[1] <= 10
            && backgroundChannels[2] <= 12
            && backgroundChannels[3] >= 0.35
            && backgroundChannels[3] < 0.8
            && style.backgroundImage.includes('linear-gradient')
        };
      };
      const searchGlass = glassState(els.searchForm, searchStyle);
      const dockGlass = glassState(dock, dockStyle);
      const bookPresetCoverStyle = getComputedStyle(els.diyBookLyricPreset, '::before');
      setDiyOpen(true);
      setDiyCardOpen(true);
      els.diyPresetPage.scrollTop = 32;
      const scrollStyle = getComputedStyle(els.diyPresetPage);
      const result = {
        blackSearchGlass: searchGlass.blackSurface,
        blackDockGlass: dockGlass.blackSurface,
        oldDockRemoved: dock.hidden
          && dock.getAttribute('aria-hidden') === 'true'
          && dockStyle.display === 'none',
        searchGlassMode: searchGlass.mode,
        dockGlassMode: dockGlass.mode,
        searchGlassRefraction: searchGlass.filterActive && searchGlass.oneFilter && searchGlass.oneContent,
        dockGlassRefraction: dockGlass.filterActive && dockGlass.oneFilter && dockGlass.oneContent,
        hiddenScrollbar: scrollStyle.scrollbarWidth === 'none',
        pageStillScrolls: scrollStyle.overflowY === 'auto'
          && (els.diyPresetPage.scrollHeight <= els.diyPresetPage.clientHeight + 1
            || els.diyPresetPage.scrollTop > 0),
        vipVisible: !els.loginVipBadge.hidden && getComputedStyle(els.loginVipBadge).display !== 'none',
        bookPresetHasCover: bookPresetCoverStyle.backgroundImage.includes('scene-book-v2.webp')
          && Number.parseFloat(bookPresetCoverStyle.opacity) >= 0.85,
        bookLyricComplete: bookMetrics.complete,
        bookLyricStaysSingleLine: bookMetrics.measurable
          && bookMetrics.fitsWidth
          && bookMetrics.fitsHeight
          && bookMetrics.singleLine
          && bookMetrics.whiteSpace === 'nowrap',
        bookLyricLayersAligned: bookMetrics.layersAligned,
        bookLyricWhiteSpace: bookMetrics.whiteSpace,
        bookLyricText: bookMetrics.text,
        bookLyricDimensions: bookMetrics.dimensions,
        localPlaylistImportReady: localImportReady,
        localPlaylistPlaybackReady: localPlaybackReady,
        presetControlsScoped: previewKeepsUnrelatedControlsHidden
          && stormShowsOnlyStormControls
          && cubeShowsOnlyCubeControl
          && coverShowsOnlyCoverControl,
        coverMotionControlWorks,
        presetConfigDumpHidden: Boolean(els.diySelectedPresetConfig?.hidden),
        importedVisible,
        liveVisible,
      };
      result.ok = result.blackSearchGlass
        && result.oldDockRemoved
        && result.searchGlassRefraction
        && result.hiddenScrollbar
        && result.pageStillScrolls
        && result.vipVisible
        && result.bookPresetHasCover
        && result.bookLyricComplete
        && result.bookLyricStaysSingleLine
        && result.bookLyricLayersAligned
        && result.localPlaylistImportReady
        && result.localPlaylistPlaybackReady
        && result.presetControlsScoped
        && result.coverMotionControlWorks
        && result.presetConfigDumpHidden
        && result.importedVisible
        && result.liveVisible;
      return result;
    })()`,
  });
  if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text || "Client polish evaluation failed");
  const screenshotDir = path.resolve("artifacts");
  mkdirSync(screenshotDir, { recursive: true });
  const capturePage = async (fileName) => {
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = path.join(screenshotDir, fileName);
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
    return screenshotPath;
  };
  const inspectHoverSurface = async (selector, thresholds) => {
    const readSurface = () => command("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const card = document.querySelector(${JSON.stringify(selector)});
        if (!card) return { available: false };
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        const imageElement = card.matches('.diy-wallpaper-item')
          ? card.querySelector('.diy-wallpaper-thumb img')
          : null;
        const imageStyle = imageElement ? getComputedStyle(imageElement) : getComputedStyle(card, '::before');
        const matrix = new DOMMatrix(style.transform);
        const imageMatrix = new DOMMatrix(imageStyle.transform);
        return {
          available: true,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          translateY: matrix.m42,
          scale: matrix.m11,
          imageScale: imageMatrix.m11,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          hoverCapable: matchMedia('(hover: hover) and (pointer: fine)').matches
        };
      })()`,
    });
    const baseline = (await readSurface()).result.value;
    if (!baseline.available) return { pass: false, baseline, hovered: { available: false } };
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: baseline.x, y: baseline.y });
    await delay(420);
    const hovered = (await readSurface()).result.value;
    return {
      pass: baseline.hoverCapable
        && baseline.translateY <= thresholds.restY
        && baseline.imageScale >= thresholds.restImageScale
        && hovered.translateY <= thresholds.hoverY
        && hovered.scale >= thresholds.hoverScale
        && hovered.imageScale >= thresholds.hoverImageScale
        && hovered.borderColor !== baseline.borderColor
        && hovered.boxShadow !== baseline.boxShadow,
      baseline,
      hovered,
    };
  };
  await command("Runtime.evaluate", {
    expression: `(() => {
      els.bootScreen.hidden = true;
      enterPlaybackPage();
      state.playbackChrome.dockPinned = true;
      setPlaybackChromeVisibility({ searchVisible: true, dockVisible: true });
      setDiyOpen(true);
      setDiyCardOpen(true);
      commitDiyPage('preset');
    })()`,
  });
  await delay(600);
  const presetBaseline = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const card = document.querySelector('#diyScenePresetList [data-preset="cube"]');
      const summarizeCards = (selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        const covers = cards.map((item) => getComputedStyle(item, '::before').backgroundImage);
        const accents = cards.map((item) => getComputedStyle(item).getPropertyValue('--preset-accent-rgb').trim());
        return {
          count: cards.length,
          distinctCovers: new Set(covers).size,
          distinctAccents: new Set(accents).size,
          allUseGeneratedCovers: covers.every((value) => value.includes('/assets/preset-covers/') && value.includes('-v2.webp'))
        };
      };
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const coverStyle = getComputedStyle(card, '::before');
      const matrix = new DOMMatrix(style.transform);
      const coverMatrix = new DOMMatrix(coverStyle.transform);
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        translateY: matrix.m42,
        scale: matrix.m11,
        coverScale: coverMatrix.m11,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        coverImage: coverStyle.backgroundImage,
        mattePanel: getComputedStyle(els.diySidebar).backgroundImage,
        panelFilter: getComputedStyle(els.diySidebar).backdropFilter,
        scenePalette: summarizeCards('#diyScenePresetList .diy-preset-card[data-preset]'),
        textPalette: summarizeCards('#diyTextPage .diy-preset-card[data-text-preset]')
      };
    })()`,
  });
  await command("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: presetBaseline.result.value.x,
    y: presetBaseline.result.value.y,
  });
  await delay(420);
  const presetHovered = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const card = document.querySelector('#diyScenePresetList [data-preset="cube"]');
      const style = getComputedStyle(card);
      const coverStyle = getComputedStyle(card, '::before');
      const matrix = new DOMMatrix(style.transform);
      const coverMatrix = new DOMMatrix(coverStyle.transform);
      return {
        translateY: matrix.m42,
        scale: matrix.m11,
        coverScale: coverMatrix.m11,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        hoverCapable: matchMedia('(hover: hover) and (pointer: fine)').matches
      };
    })()`,
  });
  const presetBaselineValue = presetBaseline.result.value;
  const presetHoveredValue = presetHovered.result.value;
  evaluation.result.value.presetCardSurface = {
    pass: presetBaselineValue.coverImage.includes('scene-cube-v2.webp')
      && presetBaselineValue.mattePanel.includes('rgba(8, 8, 10, 0.76)')
      && presetBaselineValue.panelFilter.includes('blur(20px)')
      && presetBaselineValue.scenePalette.count === 9
      && presetBaselineValue.scenePalette.distinctCovers === 9
      && presetBaselineValue.scenePalette.distinctAccents === 9
      && presetBaselineValue.scenePalette.allUseGeneratedCovers
      && presetBaselineValue.textPalette.count === 2
      && presetBaselineValue.textPalette.distinctCovers === 2
      && presetBaselineValue.textPalette.distinctAccents === 2
      && presetBaselineValue.textPalette.allUseGeneratedCovers
      && presetBaselineValue.translateY <= -2
      && presetBaselineValue.coverScale >= 1.02
      && presetHoveredValue.hoverCapable
      && presetHoveredValue.translateY <= -9
      && presetHoveredValue.scale >= 1.045
      && presetHoveredValue.coverScale >= 1.075
      && presetHoveredValue.borderColor !== presetBaselineValue.borderColor
      && presetHoveredValue.boxShadow !== presetBaselineValue.boxShadow,
    baseline: presetBaselineValue,
    hovered: presetHoveredValue,
  };
  evaluation.result.value.ok = evaluation.result.value.ok && evaluation.result.value.presetCardSurface.pass;
  const screenshotPath = await capturePage("client-polish-audit-1440x900.png");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
  await command("Runtime.evaluate", {
    expression: `(() => {
      setDiyPreset('topography');
      setTextPreset('depth');
      commitDiyPage('text');
    })()`,
  });
  await delay(520);
  evaluation.result.value.textCardSurface = await inspectHoverSurface(
    '#diyTextPage .diy-preset-card[data-text-preset="depth"]',
    { restY: -2, restImageScale: 1.02, hoverY: -9, hoverScale: 1.045, hoverImageScale: 1.075 },
  );
  const textScreenshotPath = await capturePage("client-polish-text-1440x900.png");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
  await command("Runtime.evaluate", { expression: `commitDiyPage('wallpaper')` });
  await delay(520);
  evaluation.result.value.wallpaperCardSurface = await inspectHoverSurface(
    '#wallpaperList .diy-wallpaper-item',
    { restY: -1, restImageScale: 1, hoverY: -7, hoverScale: 1.025, hoverImageScale: 1 },
  );
  const wallpaperScreenshotPath = await capturePage("client-polish-wallpaper-1440x900.png");
  evaluation.result.value.ok = evaluation.result.value.ok
    && evaluation.result.value.textCardSurface.pass
    && evaluation.result.value.wallpaperCardSurface.pass;
  evaluation.result.value.screenshotPath = screenshotPath;
  evaluation.result.value.screenshotPaths = {
    preset: screenshotPath,
    text: textScreenshotPath,
    wallpaper: wallpaperScreenshotPath,
  };
  process.stdout.write(`${JSON.stringify(evaluation.result.value, null, 2)}\n`);
  process.exitCode = evaluation.result.value.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await delay(500);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot)) {
    for (let attempt = 0; attempt < 16 && existsSync(profile); attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch (error) {
        if (attempt === 15) {
          process.stderr.write(`Client polish profile cleanup deferred: ${error.message}\n`);
          break;
        }
        await delay(250);
      }
    }
  }
}
