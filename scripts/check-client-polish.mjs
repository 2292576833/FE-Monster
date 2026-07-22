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
      const localImportResult = await importLocalAudioFiles([
        new File([wavBuffer], 'Playback Fixture.wav', { type: 'audio/wav', lastModified: 10 }),
        new File([new Uint8Array([0])], 'Local Fixture.flac', { type: 'audio/flac', lastModified: 11 }),
        new File([new Uint8Array([1])], 'Lossless Fixture.ape', { type: '', lastModified: 12 })
      ], { openShelf: false, silent: true });
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
      const localPlaybackLoaded = localWavSong ? await loadSong(localWavSong, { autoplay: false }) : false;
      await wait(160);
      await refreshPlayerState();
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

      await refreshWallpapers({ source: 'imported', scan: false });
      const importedImage = visibleWallpapers().find((wallpaper) => wallpaper.kind === 'image');
      if (importedImage) selectWallpaper(importedImage.id);
      await wait(500);
      const importedVisible = Boolean(importedImage && !els.wallpaperImage.hidden && els.wallpaperImage.naturalWidth > 0);

      await refreshWallpapers({ source: 'live', scan: true });
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
      const bookPresetStyle = getComputedStyle(els.diyBookLyricPreset);
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
        bookPresetMatteBlack: bookPresetStyle.backgroundColor === 'rgb(10, 10, 10)',
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
        && result.bookPresetMatteBlack
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
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotDir = path.resolve("artifacts");
  const screenshotPath = path.join(screenshotDir, "client-polish-audit-1440x900.png");
  mkdirSync(screenshotDir, { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  evaluation.result.value.screenshotPath = screenshotPath;
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
  if (profile.startsWith(tempRoot) && existsSync(profile)) rmSync(profile, { recursive: true, force: true });
}
