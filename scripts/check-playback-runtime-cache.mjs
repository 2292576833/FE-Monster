import process from 'node:process';

const baseUrl = String(
  process.env.FE_TEST_BASE_URL || 'http://127.0.0.1:31881'
).replace(/\/$/, '');
const expectedToken = '20260720-playback-lyric-color-14';

const rootResponse = await fetch(`${baseUrl}/?playback-cache-check=${Date.now()}`, {
  cache: 'no-store'
});
if (!rootResponse.ok) {
  throw new Error(`Playback page root returned HTTP ${rootResponse.status}`);
}

const html = await rootResponse.text();
const stylePath = html.match(/href="(styles\.css\?v=([^"]+))"/)?.[1] || '';
const styleToken = html.match(/href="styles\.css\?v=([^"]+)"/)?.[1] || '';
const appPath = html.match(/src="(app\.js\?v=([^"]+))"/)?.[1] || '';
const appToken = html.match(/src="app\.js\?v=([^"]+)"/)?.[1] || '';
const playbackContentIndex = html.indexOf('<div class="qishui-playback-content">');
const playbackViewControlsIndex = html.indexOf('<div class="qishui-playback-view-controls"');
const playbackToolsIndex = html.indexOf('<nav class="qishui-playback-tools"');

const [styleResponse, appResponse] = await Promise.all([
  fetch(`${baseUrl}/${stylePath}`),
  fetch(`${baseUrl}/${appPath}`)
]);
const [styles, app] = await Promise.all([
  styleResponse.text(),
  appResponse.text()
]);
const lyricUpdateSource = app.match(
  /function updateQishuiPlaybackLyrics[\s\S]*?\n}\n\nfunction qishuiPlaybackSeekDuration/
)?.[0] || '';

const styleCacheControl = styleResponse.headers.get('cache-control') || '';
const appCacheControl = appResponse.headers.get('cache-control') || '';
const result = {
  rootStatus: rootResponse.status,
  rootCacheControl: rootResponse.headers.get('cache-control') || '',
  styleStatus: styleResponse.status,
  styleCacheControl,
  appStatus: appResponse.status,
  appCacheControl,
  expectedToken,
  styleToken,
  appToken,
  tokensCurrent: styleToken === expectedToken && appToken === expectedToken,
  reloadableAssetsRevalidate: styleCacheControl.includes('no-cache')
    && appCacheControl.includes('no-cache')
    && !styleCacheControl.includes('immutable')
    && !appCacheControl.includes('immutable'),
  rootHasBookLyricHost: html.includes(
    'class="book-lyric-list qishui-playback-lyric-page"'
  ) && html.includes('id="qishuiPlaybackLyricPage"'),
  rootHasPlaybackViewControls: html.includes('qishuiPlaybackVisibilityToggle')
    && html.includes('qishuiPlaybackScaleToggle')
    && playbackContentIndex >= 0
    && playbackViewControlsIndex > playbackContentIndex
    && playbackToolsIndex > playbackViewControlsIndex,
  stylesHaveTransparentPanels: styles.includes(
    '.app-shell.has-qishui-playback-card .playlist-album-orbit'
  ) && styles.includes('background: transparent;'),
  stylesHaveCompactAndExpandedModes: styles.includes(
    '.qishui-playback-card.is-expanded'
  ) && styles.includes('width: min(760px, 64vw, calc(100vw - 40px));'),
  stylesWidenAndHideCompactCard: styles.includes(
    'width: min(264px, 26vw, calc(100vw - 40px));'
  ) && styles.includes('.qishui-playback-card.is-user-hidden')
    && styles.includes('width: 42px;')
    && styles.includes('height: 42px;'),
  stylesHavePanelFreeViewControls: Boolean(styles.match(
    /\.qishui-playback-view-button\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
  )),
  stylesUseSongTypeface: styles.includes(
    'font-family: "SimSun", "宋体", "Songti SC", serif;'
  ),
  stylesHaveVisibleLyricHierarchy: Boolean(
    styles.match(
      /\.qishui-playback-lyric-line\.is-arriving\s*\{[^}]*opacity:\s*0\.64;/s
    )
      && styles.match(
        /\.qishui-playback-lyric-line\.is-current\.is-scroll-arrived\s*\{[^}]*opacity:\s*1;/s
      )
  ),
  stylesHaveWideSmallLayout: styles.includes(
    'width: min(336px, calc(100vw - 32px));'
  ) && styles.includes(
    'grid-template-columns: minmax(108px, 0.9fr) minmax(0, 1.5fr);'
  ) && styles.includes('transform: none;'),
  stylesUseExpandedLyricStage: styles.includes(
    'grid-template-columns: minmax(210px, 0.82fr) minmax(300px, 1.32fr);'
  ) && styles.includes('min-height: 190px;'),
  stylesUseFullscreenCompactLyricSpace: styles.includes(
    '.app-shell.is-window-fullscreen .qishui-playback-card:not(.is-expanded) .qishui-playback-content'
  ) && styles.includes(
    'grid-template-rows: auto auto auto auto minmax(300px, 1fr) auto auto auto;'
  ) && styles.includes('width: min(360px, calc(100vw - 40px));')
    && styles.includes('width: min(100%, 286px);'),
  stylesRemoveLyricPanel: Boolean(styles.includes(
    '.qishui-playback-lyrics::before'
  ) && styles.includes('background: transparent;')
    && styles.match(/\.qishui-playback-lyrics::before\s*\{[^}]*content:\s*none;/s)
    && styles.match(/\.qishui-playback-lyrics::after\s*\{[^}]*content:\s*none;/s)),
  appHasExplicitPlaybackControls: app.includes('toggleQishuiPlaybackExpanded')
    && app.includes('toggleQishuiPlaybackHidden')
    && !app.includes('handleQishuiPlaybackCardClick')
    && !app.includes('handleQishuiPlaybackCardDoubleClick'),
  appHasOptimizedLyricScroll: app.includes('function renderBookLyricList(')
    && lyricUpdateSource.includes('syncBookLyricScroll(current')
    && !lyricUpdateSource.includes('offsetWidth'),
  appHasSmoothLyricMotion: app.includes('BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS')
    && app.includes('BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS')
    && lyricUpdateSource.includes('lyricBookArrivedIndex = arrived ? activeIndex : -2'),
  appWaitsForLyricArrival: lyricUpdateSource.includes(
    "list.classList.toggle('is-highlight-pending', !arrived)"
  ) && lyricUpdateSource.includes("current.classList.toggle('is-current', arrived)")
    && lyricUpdateSource.includes("current.classList.toggle('is-scroll-arrived', arrived)"),
  appAlwaysShowsCardLyrics: app.includes(
    'qishuiPlaybackLyrics.hidden = false'
  )
};

result.ok = result.rootStatus === 200
  && result.styleStatus === 200
  && result.appStatus === 200
  && result.tokensCurrent
  && result.reloadableAssetsRevalidate
  && result.rootHasBookLyricHost
  && result.rootHasPlaybackViewControls
  && result.stylesHaveTransparentPanels
  && result.stylesHaveCompactAndExpandedModes
  && result.stylesWidenAndHideCompactCard
  && result.stylesHavePanelFreeViewControls
  && result.stylesUseSongTypeface
  && result.stylesHaveVisibleLyricHierarchy
  && result.stylesHaveWideSmallLayout
  && result.stylesUseExpandedLyricStage
  && result.stylesUseFullscreenCompactLyricSpace
  && result.stylesRemoveLyricPanel
  && result.appHasExplicitPlaybackControls
  && result.appHasOptimizedLyricScroll
  && result.appHasSmoothLyricMotion
  && result.appWaitsForLyricArrival
  && result.appAlwaysShowsCardLyrics;

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
