const androidClient = Boolean(window.FeMonsterAndroid)
  || document.documentElement.dataset.fePlatform === 'android';

if (androidClient) {
  document.documentElement.dataset.feRuntimeUi = 'android-local';
  await Promise.all([
    import('./boot-lightfall-apk.js?v=20260811-cache-audit-1'),
    import('./blur-text-lyrics-apk.js?v=20260811-cache-audit-1')
  ]);
} else {
  document.documentElement.dataset.feRuntimeUi = 'desktop-original';
  import('./boot-lightfall-react.js?v=20260811-cache-audit-1')
    .then(() => { document.documentElement.dataset.feBootRuntime = 'desktop-original'; })
    .catch(() => import('./boot-lightfall-apk.js?v=20260811-cache-audit-1'));
  import('./blur-text-lyrics.js?v=20260811-cache-audit-1')
    .then(() => { document.documentElement.dataset.feLyricsRuntime = 'desktop-original'; })
    .catch(() => import('./blur-text-lyrics-apk.js?v=20260811-cache-audit-1'));
  window.setTimeout(() => {
    if (window.FEBlurLyrics) return;
    import('./blur-text-lyrics-apk.js?v=20260811-cache-audit-1').then(() => {
      document.documentElement.dataset.feLyricsRuntime = 'local-fallback';
    });
  }, 4000);
}
