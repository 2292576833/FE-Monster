import process from 'node:process';

const baseUrl = String(
  process.env.FE_TEST_BASE_URL || 'http://127.0.0.1:31881'
).replace(/\/$/, '');
const expectedToken = '20260723-sonic-wide-controls-1';

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
  rootHasPlaybackGlassSurface: html.includes(
    'class="qishui-playback-ambient glass-surface glass-surface--fallback"'
  ) && html.includes('data-glass-surface')
    && html.includes('data-glass-background-opacity="0.035"')
    && html.includes('data-glass-distortion-scale="-96"'),
  stylesHaveTransparentPanels: styles.includes(
    '.app-shell.has-qishui-playback-card .playlist-album-orbit'
  ) && styles.includes('background: transparent;'),
  stylesHaveWidePlaylistBars: Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.playlist-album-orbit\s*\{[^}]*width:\s*min\(440px, calc\(100vw - 48px\)\);/s
  )) && Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.playlist-album-orbit \.orb-playlist-card\s*\{[^}]*width:\s*min\(400px, calc\(100% - 32px\)\);/s
  )),
  stylesHaveWhiteGlowingPlaylistBars: styles.includes(
    '--playlist-glow-border: rgba(255, 255, 255, 0.58);'
  ) && Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.playlist-album-orbit \.orb-playlist-card\s*\{[^}]*border-color:\s*var\(--playlist-glow-border\);[^}]*0 0 10px var\(--playlist-glow-soft\);/s
  )),
  stylesHaveWhiteGlowingSongBars: Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.playlist-song-page \.shelf-song-button\s*\{[^}]*border-color:\s*var\(--playlist-glow-border\);[^}]*0 0 9px var\(--playlist-glow-soft\);/s
  )) && Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.playlist-song-page \.shelf-song-button\.is-current\s*\{[^}]*border-color:\s*var\(--playlist-glow-border-hot\);[^}]*0 0 16px var\(--playlist-glow-hot\);/s
  )),
  coverParticleBackgroundUsesThreeCoverColors: /function applyCoverParticlePalette[\s\S]*?source\.coverColors\?\.\[index\][\s\S]*?--cover-particle-c/.test(app)
    && /\.cover-particle-scene::before\s*\{[\s\S]*?var\(--cover-particle-a\)[\s\S]*?var\(--cover-particle-b\)[\s\S]*?var\(--cover-particle-c\)/.test(styles),
  chladniBackgroundUsesThreeCoverColors: /function applyChladniPalette[\s\S]*?source\.coverColors\?\.\[index\][\s\S]*?--chladni-hot/.test(app)
    && /\.chladni-scene::before\s*\{[\s\S]*?var\(--chladni-a\)[\s\S]*?var\(--chladni-b\)[\s\S]*?var\(--chladni-hot\)/.test(styles),
  stylesHaveCompactAndExpandedModes: styles.includes(
    '.qishui-playback-card.is-expanded'
  ) && styles.includes('width: min(760px, 64vw, calc(100vw - 40px));'),
  stylesWidenAndHideCompactCard: styles.includes(
    'width: min(264px, 26vw, calc(100vw - 40px));'
  ) && styles.includes('.qishui-playback-card.is-user-hidden')
    && styles.includes('width: 42px;')
    && styles.includes('height: 42px;'),
  stylesHaveRightSlideHideMotion: Boolean(styles.match(
    /\.app-shell\.has-qishui-playback-card \.qishui-playback-card\.is-visibility-sliding-right\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translate3d\(calc\(100% \+ 28px\), 0, 0\);/s
  )) && styles.includes('.qishui-playback-card.is-visibility-snap'),
  stylesHavePanelFreeViewControls: Boolean(styles.match(
    /\.qishui-playback-view-button\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
  )),
  stylesUseSongTypeface: styles.includes(
    'font-family: var(--text-preset-font-family, "SimSun", "宋体", "Songti SC", serif);'
  ),
  stylesHaveVisibleLyricHierarchy: Boolean(
    styles.match(
      /\.qishui-playback-lyric-line\.is-arriving\s*\{[^}]*opacity:\s*0\.64;/s
    )
      && styles.match(
        /\.qishui-playback-lyric-line\.is-current\.is-scroll-arrived\s*\{[^}]*opacity:\s*1;/s
      )
  ),
  stylesHaveTransparentPlaybackGlass: Boolean(
    styles.match(
      /\.qishui-playback-ambient\s*\{[^}]*rgb\(2 7 10 \/ var\(--glass-frost, 0\.035\)\)[^}]*backdrop-filter:\s*blur\(8px\)[^}]*border:\s*1px solid rgba\(235, 249, 255, 0\.28\);/s
    )
      && styles.match(
        /\.qishui-playback-ambient\.glass-surface--svg\s*\{[^}]*backdrop-filter:\s*var\(--filter-id\) blur\(2\.5px\)/s
      )
      && styles.match(
        /\.qishui-playback-ambient\.glass-surface\.glass-surface--fallback,[\s\S]*?rgb\(2 7 10 \/ var\(--glass-frost, 0\.035\)\) !important;/
      )
      && styles.includes('linear-gradient(var(--playback-cover-surface), var(--playback-cover-surface))')
      && styles.match(/\.qishui-playback-ambient::before\s*\{[^}]*opacity:\s*0\.36;/s)
  ),
  stylesHaveLargerPlaybackLyrics: Boolean(
    styles.match(
      /#qishuiPlaybackLyricPage \.book-lyric-line-text\s*\{[^}]*font-size:\s*15px;/s
    )
      && styles.match(
        /\.qishui-playback-lyric-line\.is-current\.is-scroll-arrived \.book-lyric-line-text\s*\{[^}]*font-size:\s*20px;/s
      )
      && styles.match(
        /\.qishui-playback-card\.is-expanded #qishuiPlaybackLyricPage \.book-lyric-line-text\s*\{[^}]*font-size:\s*18px;/s
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
  appStagesPlaybackVisibilityMotion: app.includes('PLAYBACK_CARD_VISIBILITY_TRANSITION_MS = 240')
    && app.includes("card.classList.add('is-visibility-sliding-right')")
    && app.includes('commitQishuiPlaybackHiddenState(true)')
    && app.includes('commitQishuiPlaybackHiddenState(false)'),
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
  && result.rootHasPlaybackGlassSurface
  && result.stylesHaveTransparentPanels
  && result.stylesHaveWidePlaylistBars
  && result.stylesHaveWhiteGlowingPlaylistBars
  && result.stylesHaveWhiteGlowingSongBars
  && result.coverParticleBackgroundUsesThreeCoverColors
  && result.chladniBackgroundUsesThreeCoverColors
  && result.stylesHaveCompactAndExpandedModes
  && result.stylesWidenAndHideCompactCard
  && result.stylesHaveRightSlideHideMotion
  && result.stylesHavePanelFreeViewControls
  && result.stylesUseSongTypeface
  && result.stylesHaveVisibleLyricHierarchy
  && result.stylesHaveTransparentPlaybackGlass
  && result.stylesHaveLargerPlaybackLyrics
  && result.stylesHaveWideSmallLayout
  && result.stylesUseExpandedLyricStage
  && result.stylesUseFullscreenCompactLyricSpace
  && result.stylesRemoveLyricPanel
  && result.appHasExplicitPlaybackControls
  && result.appStagesPlaybackVisibilityMotion
  && result.appHasOptimizedLyricScroll
  && result.appHasSmoothLyricMotion
  && result.appWaitsForLyricArrival
  && result.appAlwaysShowsCardLyrics;

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
