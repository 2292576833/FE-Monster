const $ = (selector) => document.querySelector(selector);

const els = {
  bootScreen: $('#bootScreen'),
  bootLightfallMount: $('#bootLightfallMount'),
  bootLogoButton: $('#bootLogoButton'),
  bootLogoText: $('#bootLogoText'),
  audio: $('#audio'),
  appShell: $('.app-shell'),
  stage: $('.stage'),
  canvas: $('#orbCanvas'),
  communityCard: $('#communityCard'),
  communityAvatar: $('#communityAvatar'),
  communityAvatarImage: $('#communityAvatarImage'),
  communityName: $('#communityName'),
  communityMeta: $('#communityMeta'),
  communityFeId: $('#communityFeId'),
  communityCollapseButton: $('#communityCollapseButton'),
  communityAddForm: $('#communityAddForm'),
  communitySearchInput: $('#communitySearchInput'),
  communityAddButton: $('#communityAddButton'),
  communityMessageButton: $('#communityMessageButton'),
  communityDndButton: $('#communityDndButton'),
  communityOnlineCount: $('#communityOnlineCount'),
  communityFriendsList: $('#communityFriendsList'),
  communityStatus: $('#communityStatus'),
  communityMessageDialog: $('#communityMessageDialog'),
  communityMessagePanel: $('#communityMessagePanel'),
  communityMessageHead: $('#communityMessageHead'),
  communityMessageTitle: $('#communityMessageTitle'),
  communityMessageMeta: $('#communityMessageMeta'),
  communityMessageClose: $('#communityMessageClose'),
  communityMessageList: $('#communityMessageList'),
  communityMessageForm: $('#communityMessageForm'),
  communityMessageInput: $('#communityMessageInput'),
  communityMessageSend: $('#communityMessageSend'),
  communityMessageRotateHandle: $('#communityMessageRotateHandle'),
  communityMessageBubbles: $('#communityMessageBubbles'),
  communityListenBubbles: $('#communityListenBubbles'),
  communityProfileDialog: $('#communityProfileDialog'),
  communityProfilePanel: $('#communityProfilePanel'),
  communityProfileHead: $('#communityProfileHead'),
  communityProfileTitle: $('#communityProfileTitle'),
  communityProfileMeta: $('#communityProfileMeta'),
  communityProfileSelfTab: $('#communityProfileSelfTab'),
  communityProfileGroupTab: $('#communityProfileGroupTab'),
  communityProfileClose: $('#communityProfileClose'),
  communityProfileSelfPage: $('#communityProfileSelfPage'),
  communityProfileNearbyPage: $('#communityProfileNearbyPage'),
  communityProfileAvatar: $('#communityProfileAvatar'),
  communityProfileDisplayName: $('#communityProfileDisplayName'),
  communityProfileId: $('#communityProfileId'),
  communityProfileBio: $('#communityProfileBio'),
  communityProfileSave: $('#communityProfileSave'),
  communityProfileStatus: $('#communityProfileStatus'),
  communityNearbyMeta: $('#communityNearbyMeta'),
  communityNearbyList: $('#communityNearbyList'),
  communityProfileRotateHandle: $('#communityProfileRotateHandle'),
  listenMini: $('#listenMini'),
  listenMiniHandle: $('#listenMiniHandle'),
  listenMiniTitle: $('#listenMiniTitle'),
  listenMiniClose: $('#listenMiniClose'),
  listenMiniStatus: $('#listenMiniStatus'),
  listenMiniTrack: $('#listenMiniTrack'),
  listenAcceptButton: $('#listenAcceptButton'),
  listenDeclineButton: $('#listenDeclineButton'),
  listenLeaveButton: $('#listenLeaveButton'),
  listenCallButton: $('#listenCallButton'),
  listenHangupButton: $('#listenHangupButton'),
  dockCover: $('#dockCover'),
  dockStatus: $('#dockStatus'),
  dockTitle: $('#dockTitle'),
  dockArtist: $('#dockArtist'),
  playButton: $('#playButton'),
  prevButton: $('#prevButton'),
  nextButton: $('#nextButton'),
  dockFavoriteButton: $('#dockFavoriteButton'),
  dockPinButton: $('#dockPinButton'),
  searchForm: $('#topSearchForm'),
  searchInput: $('#topSearchInput'),
  topFavoritesButton: $('#topFavoritesButton'),
  searchSuggestions: $('#searchSuggestions'),
  favoriteLibrary: $('#favoriteLibrary'),
  favoriteLibraryMeta: $('#favoriteLibraryMeta'),
  favoriteLibraryTabs: $('#favoriteLibraryTabs'),
  favoriteLibraryList: $('#favoriteLibraryList'),
  playlistFavoritePopover: $('#playlistFavoritePopover'),
  loginButton: $('#neteaseLoginButton'),
  loginLabel: $('#neteaseLoginLabel'),
  loginAvatar: $('#loginAvatar'),
  loginAvatarImage: $('#loginAvatarImage'),
  runtimeSettingsButton: $('#runtimeSettingsButton'),
  runtimeSettingsPanel: $('#runtimeSettingsPanel'),
  windowExitFullscreenButton: $('#windowExitFullscreenButton'),
  windowTopMinimizeButton: $('#windowTopMinimizeButton'),
  windowQuitButton: $('#windowQuitButton'),
  windowFullscreenButton: $('#windowFullscreenButton'),
  windowMinimizeButton: $('#windowMinimizeButton'),
  windowCloseButton: $('#windowCloseButton'),
  gpuAccelerationToggle: $('#gpuAccelerationToggle'),
  directX11Toggle: $('#directX11Toggle'),
  xAudio2Toggle: $('#xAudio2Toggle'),
  x3DAudioToggle: $('#x3DAudioToggle'),
  gestureControlToggle: $('#gestureControlToggle'),
  gestureControlStatus: $('#gestureControlStatus'),
  gestureWebcamButton: $('#gestureWebcamButton'),
  gestureCameraButton: $('#gestureCameraButton'),
  lowFrequencyGraph: $('#lowFrequencyGraph'),
  lowFrequencyValue: $('#lowFrequencyValue'),
  runtimeRecordingButton: $('#runtimeRecordingButton'),
  recordingDialog: $('#recordingDialog'),
  recordingPanel: $('#recordingPanel'),
  recordingCloseButton: $('#recordingCloseButton'),
  recordingStatus: $('#recordingStatus'),
  recordingPreview: $('#recordingPreview'),
  recordingPreviewPlaceholder: $('#recordingPreviewPlaceholder'),
  recordingQualitySelect: $('#recordingQualitySelect'),
  recordingFpsSelect: $('#recordingFpsSelect'),
  recordingBitrateInput: $('#recordingBitrateInput'),
  recordingAudioToggle: $('#recordingAudioToggle'),
  recordingStartButton: $('#recordingStartButton'),
  recordingStopButton: $('#recordingStopButton'),
  recordingResumeButton: $('#recordingResumeButton'),
  recordingFinishButton: $('#recordingFinishButton'),
  recordingDownloadButton: $('#recordingDownloadButton'),
  recordingTimer: $('#recordingTimer'),
  homeButton: $('#homeButton'),
  diyButton: $('#diyButton'),
  diySidebar: $('#diySidebar'),
  diyCloseButton: $('#diyCloseButton'),
  diyPresetButton: $('#diyPresetButton'),
  diyPresetPage: $('#diyPresetPage'),
  diyTextModeButton: $('#diyTextModeButton'),
  diyTextPage: $('#diyTextPage'),
  diyWallpaperModeButton: $('#diyWallpaperModeButton'),
  diyWallpaperPage: $('#diyWallpaperPage'),
  diyLyricPreset: $('#diyLyricPreset'),
  diyFlowTextPreset: $('#diyFlowTextPreset'),
  diySceneNonePreset: $('#diySceneNonePreset'),
  diyCubePreset: $('#diyCubePreset'),
  diyTopographyPreset: $('#diyTopographyPreset'),
  diyBookLyricPreset: $('#diyBookLyricPreset'),
  wallpaperScene: $('#wallpaperScene'),
  wallpaperImage: $('#wallpaperImage'),
  wallpaperVideo: $('#wallpaperVideo'),
  wallpaperEmpty: $('#wallpaperEmpty'),
  wallpaperImportedModeButton: $('#wallpaperImportedModeButton'),
  wallpaperLiveModeButton: $('#wallpaperLiveModeButton'),
  wallpaperImportActions: $('#wallpaperImportActions'),
  wallpaperImportButton: $('#wallpaperImportButton'),
  wallpaperImportInput: $('#wallpaperImportInput'),
  wallpaperRefreshButton: $('#wallpaperRefreshButton'),
  wallpaperList: $('#wallpaperList'),
  wallpaperStatus: $('#wallpaperStatus'),
  wallpaperOpacityRange: $('#wallpaperOpacityRange'),
  wallpaperOpacityValue: $('#wallpaperOpacityValue'),
  wallpaperBrightnessRange: $('#wallpaperBrightnessRange'),
  wallpaperBrightnessValue: $('#wallpaperBrightnessValue'),
  wallpaperBlurRange: $('#wallpaperBlurRange'),
  wallpaperBlurValue: $('#wallpaperBlurValue'),
  wallpaperScaleRange: $('#wallpaperScaleRange'),
  wallpaperScaleValue: $('#wallpaperScaleValue'),
  lyricBrightnessRange: $('#lyricBrightnessRange'),
  lyricBrightnessValue: $('#lyricBrightnessValue'),
  lyricSpeedRange: $('#lyricSpeedRange'),
  lyricSpeedValue: $('#lyricSpeedValue'),
  cubeIntensityRange: $('#cubeIntensityRange'),
  cubeIntensityValue: $('#cubeIntensityValue'),
  spectrumStatus: $('#spectrumStatus'),
  spectrumBassFill: $('#spectrumBassFill'),
  loginDialog: $('#neteaseLoginDialog'),
  loginTitle: $('#neteaseLoginTitle'),
  loginSubtitle: $('#loginProviderSubtitle'),
  loginProviderTabs: $('#loginProviderTabs'),
  loginClose: $('#neteaseLoginClose'),
  loginRefresh: $('#neteaseQrRefresh'),
  loginCommunityStrip: $('#loginCommunityStrip'),
  loginCommunityName: $('#loginCommunityName'),
  loginCommunityId: $('#loginCommunityId'),
  qrShell: $('#neteaseQrShell'),
  qrImage: $('#neteaseQrImage'),
  qrPlaceholder: $('#neteaseQrPlaceholder'),
  qrStatus: $('#neteaseQrStatus'),
  playlistOrbit: $('#orbPlaylists'),
  playlistCards: $('#orbPlaylistCards'),
  playlistStatus: $('#orbPlaylistStatus'),
  playlistShelf: $('#playlistShelf'),
  playlistShelfStage: $('#playlistShelfStage'),
  playlistShelfBack: $('#playlistShelfBack'),
  playlistShelfClose: $('#playlistShelfClose'),
  playlistShelfTitle: $('#playlistShelfTitle'),
  playlistShelfMeta: $('#playlistShelfMeta'),
  playlistShelfCover: $('#playlistShelfCover'),
  playlistShelfCoverImage: $('#playlistShelfCoverImage'),
  playlistShelfBackCover: $('#playlistShelfBackCover'),
  playlistShelfBackCoverImage: $('#playlistShelfBackCoverImage'),
  playlistShelfBackTitle: $('#playlistShelfBackTitle'),
  playlistShelfBackMeta: $('#playlistShelfBackMeta'),
  playlistShelfBackScroll: $('#playlistShelfBackScroll'),
  playlistShelfScroll: $('#playlistShelfScroll'),
  playlistSongStack: $('#playlistSongStack'),
  playlistSongStackBack: $('#playlistSongStackBack'),
  dynamicCubeScene: $('#dynamicCubeScene'),
  dynamicCubeRig: $('#dynamicCubeRig'),
  dynamicCubeCore: $('#dynamicCubeCore'),
  sonicTopographyScene: $('#sonicTopographyScene'),
  sonicTopographyRig: $('#sonicTopographyRig'),
  sonicTopographyCore: $('#sonicTopographyCore'),
  playbackLyricScene: $('#playbackLyricScene'),
  bookLyricStage: $('#bookLyricStage'),
  bookLyricCover: $('#bookLyricCover'),
  bookLyricCoverImage: $('#bookLyricCoverImage'),
  bookLyricList: $('#bookLyricList'),
  playbackLyricRig: $('#playbackLyricRig'),
  playbackLyricCore: $('#playbackLyricCore'),
  blurLyricMount: $('#blurLyricMount'),
  playbackLyricText: $('#playbackLyricText'),
  playbackLyricBack: $('#playbackLyricBack'),
  playbackLyricSubtitle: $('#playbackLyricSubtitle'),
  progressRange: $('#progressRange'),
  currentTime: $('#currentTime'),
  totalTime: $('#totalTime'),
  volumeRange: $('#volumeRange'),
  volumeLabel: $('#volumeLabel'),
  toast: $('#toast'),
  updateDialog: $('#updateDialog'),
  updateVersion: $('#updateVersion'),
  updateNotes: $('#updateNotes'),
  updateProgressBar: $('#updateProgressBar'),
  updateProgressText: $('#updateProgressText'),
  updateInstallButton: $('#updateInstallButton'),
  updateLaterButton: $('#updateLaterButton')
};

let wallpaperResizeFrame = 0;
let wallpaperResizeObserver = null;

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const RENDER_PROFILE = detectRenderProfile();
const PLAYBACK_REST_YAW = 0.22;
const PLAYBACK_REST_PITCH = -0.16;
const DYNAMIC_CUBE_GRID = RENDER_PROFILE.cubeGrid;
const DYNAMIC_CUBE_SIZE = 1.46;
// Keep the voxel field unrestricted: spacing controls density instead of a fixed boundary.
const DYNAMIC_CUBE_GAP = DYNAMIC_CUBE_SIZE * 1.52;
const DYNAMIC_CUBE_RADIUS = ((DYNAMIC_CUBE_GRID - 1) * DYNAMIC_CUBE_GAP) / 2;
const DYNAMIC_CUBE_EXTENT = DYNAMIC_CUBE_RADIUS * 2 + DYNAMIC_CUBE_SIZE;
const SONIC_TOPOGRAPHY_GRID = RENDER_PROFILE.topographyGrid;
const SONIC_TOPOGRAPHY_SPACING = 1.05;
const SONIC_TOPOGRAPHY_SIZE = 0.9;
const SONIC_TOPOGRAPHY_HALF = (SONIC_TOPOGRAPHY_GRID * SONIC_TOPOGRAPHY_SPACING) / 2;
const SONIC_TOPOGRAPHY_RIPPLES = 10;
const SONIC_TOPOGRAPHY_METEORS = reducedMotion ? Math.min(10, RENDER_PROFILE.topographyMeteors) : RENDER_PROFILE.topographyMeteors;
const SONIC_TOPOGRAPHY_PARTICLES = reducedMotion ? Math.min(90, RENDER_PROFILE.topographyParticles) : RENDER_PROFILE.topographyParticles;
const SONIC_TOPOGRAPHY_CAMERA = { x: 35, y: 25, z: 35, fov: 45 };
const BOOT_LOGO_TEXT = 'FE moster';
const MUSIC_PROVIDERS = {
  netease: {
    id: 'netease',
    label: '\u7f51\u6613\u4e91',
    appName: '\u7f51\u6613\u4e91\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3010',
    setup: '\u91cd\u65b0\u8fd0\u884c run.cmd\uff0c\u5e94\u7528\u4f1a\u81ea\u52a8\u542f\u52a8\u7f51\u6613\u4e91 API'
  },
  qq: {
    id: 'qq',
    label: 'QQ\u97f3\u4e50',
    appName: 'QQ\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3011',
    setup: '\u9700\u8981\u542f\u52a8\u652f\u6301 /login/qr/key \u7684 QQ\u97f3\u4e50 API \u670d\u52a1\u5230 3011'
  },
  kugou: {
    id: 'kugou',
    label: '\u9177\u72d7\u97f3\u4e50',
    appName: '\u9177\u72d7\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3012',
    setup: '\u9700\u8981\u542f\u52a8\u652f\u6301 /login/qr/key \u7684 \u9177\u72d7\u97f3\u4e50 API \u670d\u52a1\u5230 3012'
  }
};
const FAVORITE_SONGS_KEY = 'fe-monster-favorite-songs-v1';
const SEARCH_SUGGESTION_CACHE_MS = 60 * 1000;
const PLAYLIST_FAVORITE_CACHE_MS = 60 * 1000;
const COMMUNITY_BIO_KEY = 'fe-monster-community-bio-v1';
const COMMUNITY_MESSAGE_DND_KEY = 'fe-monster-community-message-dnd-v1';
const COMMUNITY_CARD_COLLAPSED_KEY = 'fe-monster-community-card-collapsed-v1';
const COMMUNITY_FAVORITE_LISTEN_KEY = 'fe-monster-community-favorite-listen-v1';
const COMMUNITY_FAVORITE_LISTEN_THRESHOLD_MS = 2 * 60 * 60 * 1000;
const COMMUNITY_FAVORITE_LISTEN_NOTIFY_MS = 24 * 60 * 60 * 1000;
const COMMUNITY_FAVORITE_BUBBLE_MS = 2000;

const DIRECTX11_RENDER_PRESET = Object.freeze({
  name: 'directx11',
  backend: 'chromium-angle-d3d11',
  rendererOptions: Object.freeze({
    alpha: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false
  })
});

function detectRenderProfile() {
  const cores = Math.max(2, Number(navigator.hardwareConcurrency) || 4);
  const memory = Math.max(2, Number(navigator.deviceMemory) || 4);
  const nativeDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  const score = cores + memory * 0.7 + (nativeDpr <= 1.25 ? 1.2 : 0) + (nativeDpr >= 2 ? -0.8 : 0);
  const economy = reducedMotion || score < 6.3;
  const high = !economy && score >= 10.5;

  if (high) {
    return Object.freeze({
      tier: 'high',
      canvasDprMax: 2,
      playbackDprMax: 1.85,
      webglDprMax: 1.9,
      cubeGrid: 32,
      topographyGrid: 160,
      topographyMeteors: 20,
      topographyParticles: 200,
      orbParticles: 980,
      playbackParticles: 1400,
      orbQualityMin: 0.42,
      orbQualityMax: 0.82,
      playbackQualityMin: 0.5,
      playbackQualityMax: 0.9,
      orbParticleFloor: 340,
      playbackParticleFloor: 560,
      cubeFrameGapMs: 0,
      topographyFrameGapMs: 0,
      targetFrameMs: 24
    });
  }

  if (economy) {
    return Object.freeze({
      tier: 'economy',
      canvasDprMax: 1.35,
      playbackDprMax: 1.25,
      webglDprMax: 1.25,
      cubeGrid: 24,
      topographyGrid: 104,
      topographyMeteors: 8,
      topographyParticles: 72,
      orbParticles: 620,
      playbackParticles: 760,
      orbQualityMin: 0.28,
      orbQualityMax: 0.62,
      playbackQualityMin: 0.34,
      playbackQualityMax: 0.68,
      orbParticleFloor: 220,
      playbackParticleFloor: 300,
      cubeFrameGapMs: 24,
      topographyFrameGapMs: 32,
      targetFrameMs: 34
    });
  }

  return Object.freeze({
    tier: 'balanced',
    canvasDprMax: 1.65,
    playbackDprMax: 1.5,
    webglDprMax: 1.6,
    cubeGrid: 28,
    topographyGrid: 132,
    topographyMeteors: 14,
    topographyParticles: 130,
    orbParticles: 820,
    playbackParticles: 1080,
    orbQualityMin: 0.34,
    orbQualityMax: 0.74,
    playbackQualityMin: 0.42,
    playbackQualityMax: 0.82,
    orbParticleFloor: 280,
    playbackParticleFloor: 440,
    cubeFrameGapMs: 12,
    topographyFrameGapMs: 18,
    targetFrameMs: 28
  });
}

const bootVisual = {
  ready: false,
  entering: false,
  logoEnableTimer: 0,
  readyFallbackTimer: 0,
  exitTimer: 0
};

function numberAttr(element, name, fallback) {
  const raw = element.getAttribute(name);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function supportsSvgBackdropFilter(filterId) {
  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);
  if (isWebkit || isFirefox) return false;

  const test = document.createElement('div');
  test.style.backdropFilter = `url(#${filterId})`;
  return test.style.backdropFilter !== '';
}

function glassProfile(element) {
  return {
    borderRadius: numberAttr(element, 'data-glass-radius', 20),
    borderWidth: numberAttr(element, 'data-glass-border-width', 0.07),
    brightness: numberAttr(element, 'data-glass-brightness', 50),
    opacity: numberAttr(element, 'data-glass-opacity', 0.93),
    blur: numberAttr(element, 'data-glass-blur', 11),
    displace: numberAttr(element, 'data-glass-displace', 0),
    backgroundOpacity: numberAttr(element, 'data-glass-background-opacity', 0),
    saturation: numberAttr(element, 'data-glass-saturation', 1),
    distortionScale: numberAttr(element, 'data-glass-distortion-scale', -180),
    redOffset: numberAttr(element, 'data-glass-red-offset', 0),
    greenOffset: numberAttr(element, 'data-glass-green-offset', 10),
    blueOffset: numberAttr(element, 'data-glass-blue-offset', 20),
    xChannel: element.getAttribute('data-glass-x-channel') || 'R',
    yChannel: element.getAttribute('data-glass-y-channel') || 'G',
    mixBlendMode: element.getAttribute('data-glass-mix-blend-mode') || 'difference'
  };
}

function displacementMap(profile, rect, redGradId, blueGradId) {
  const width = Math.max(1, rect.width || 400);
  const height = Math.max(1, rect.height || 200);
  const edgeSize = Math.min(width, height) * (profile.borderWidth * 0.5);

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#0000"/>
          <stop offset="100%" stop-color="red"/>
        </linearGradient>
        <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0000"/>
          <stop offset="100%" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="black"></rect>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${profile.borderRadius}" fill="url(#${redGradId})"></rect>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${profile.borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${profile.mixBlendMode}"></rect>
      <rect x="${edgeSize}" y="${edgeSize}" width="${width - edgeSize * 2}" height="${height - edgeSize * 2}" rx="${profile.borderRadius}" fill="hsl(0 0% ${profile.brightness}% / ${profile.opacity})" style="filter:blur(${profile.blur}px)"></rect>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hydrateGlassSurface(element, index) {
  const profile = glassProfile(element);
  const filterId = `glass-filter-${index}`;
  const redGradId = `red-grad-${index}`;
  const blueGradId = `blue-grad-${index}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.classList.add('glass-surface__filter');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <filter id="${filterId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
        <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"></feImage>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispRed"></feDisplacementMap>
        <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"></feColorMatrix>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispGreen"></feDisplacementMap>
        <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"></feColorMatrix>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispBlue"></feDisplacementMap>
        <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"></feColorMatrix>
        <feBlend in="red" in2="green" mode="screen" result="rg"></feBlend>
        <feBlend in="rg" in2="blue" mode="screen" result="output"></feBlend>
        <feGaussianBlur in="output"></feGaussianBlur>
      </filter>
    </defs>
  `;
  element.insertBefore(svg, element.firstChild);

  const [feImage, redChannel, greenChannel, blueChannel, gaussianBlur] = [
    svg.querySelector('feImage'),
    svg.querySelectorAll('feDisplacementMap')[0],
    svg.querySelectorAll('feDisplacementMap')[1],
    svg.querySelectorAll('feDisplacementMap')[2],
    svg.querySelector('feGaussianBlur')
  ];

  const update = () => {
    const rect = element.getBoundingClientRect();
    feImage.setAttribute('href', displacementMap(profile, rect, redGradId, blueGradId));
    [
      [redChannel, profile.redOffset],
      [greenChannel, profile.greenOffset],
      [blueChannel, profile.blueOffset]
    ].forEach(([channel, offset]) => {
      channel.setAttribute('scale', String(profile.distortionScale + offset));
      channel.setAttribute('xChannelSelector', profile.xChannel);
      channel.setAttribute('yChannelSelector', profile.yChannel);
    });
    gaussianBlur.setAttribute('stdDeviation', String(profile.displace));
  };

  element.style.setProperty('--filter-id', `url(#${filterId})`);
  element.style.setProperty('--glass-frost', profile.backgroundOpacity);
  element.style.setProperty('--glass-saturation', profile.saturation);
  element.style.borderRadius = `${profile.borderRadius}px`;
  element.classList.toggle('glass-surface--svg', supportsSvgBackdropFilter(filterId));
  element.classList.toggle('glass-surface--fallback', !element.classList.contains('glass-surface--svg'));

  update();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => window.requestAnimationFrame(update));
    observer.observe(element);
  } else {
    window.addEventListener('resize', update, { passive: true });
  }
}

function initGlassSurfaces() {
  document.querySelectorAll('[data-glass-surface]').forEach((element, index) => {
    hydrateGlassSurface(element, index + 1);
  });
}

const state = {
  queue: [],
  queueIndex: -1,
  currentSong: null,
  playerUrl: '',
  favoriteDirectories: loadFavoriteDirectories(),
  favoriteLibrary: {
    open: false,
    provider: 'netease'
  },
  playlistFavorite: {
    open: false,
    song: null,
    provider: 'netease',
    loading: false,
    savingId: '',
    error: '',
    playlistsByProvider: {},
    loadedAtByProvider: {}
  },
  searchSuggestions: {
    query: '',
    songs: [],
    timer: 0,
    requestId: 0,
    loading: false,
    abortController: null,
    cache: new Map()
  },
  userPlaylists: [],
  activePlaylistId: '',
  playlistSignature: '',
  playlistRefreshTimer: 0,
  playlistsLoggedIn: false,
  playlistsLoading: false,
  playlistFocusIndex: 0,
  songFocusIndex: 0,
  songWheelDelta: 0,
  songWheelFrame: 0,
  playlistSongPageOpen: false,
  activePlaylist: null,
  activePlaylistSongs: [],
  shelfLoadingPlaylistId: '',
  shelfDragging: false,
  shelfPointerId: null,
  shelfInteraction: '',
  shelfPressTimer: 0,
  shelfPressStartedAt: 0,
  shelfPressX: 0,
  shelfPressY: 0,
  shelfStartLeft: 0,
  shelfStartTop: 0,
  shelfLastX: 0,
  shelfLastY: 0,
  shelfRotateX: -7,
  shelfRotateY: -14,
  shelfHiddenByUser: false,
  shelfLastRightClickAt: 0,
  playbackPage: false,
  playbackChrome: {
    searchVisible: false,
    dockVisible: false,
    dockPinned: false
  },
  diyOpen: false,
  diyPeek: false,
  diyAutoHideTimer: 0,
  diyPage: 'preset',
  diyPreset: 'lyric',
  scenePreset: 'lyric',
  textPreset: 'depth',
  lyricBrightness: 1.12,
  lyricSpeed: 1,
  cubeIntensity: 1.1,
  wallpaperOpacity: 1,
  wallpaperBrightness: 1,
  wallpaperBlur: 0,
  wallpaperScale: 1,
  wallpaperFitMode: 'fill',
  wallpaperMediaWidth: 0,
  wallpaperMediaHeight: 0,
  wallpapers: [],
  wallpaperSource: 'imported',
  activeWallpaperId: '',
  wallpaperLoading: false,
  lyricSignature: '',
  lyricLines: [],
  lyricIndex: -1,
  lyricBookSignature: '',
  lyricBookIndex: -2,
  lyricBookCurrentLine: null,
  lyricDisplayText: '',
  lyricSubtitleText: '',
  lyricProgressPercent: -1,
  playbackVisual: {
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    yaw: PLAYBACK_REST_YAW,
    pitch: PLAYBACK_REST_PITCH,
    zoom: 1,
    velocityYaw: 0,
    velocityPitch: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    lyricPulse: 0,
    coverSignature: '',
    quality: RENDER_PROFILE.playbackQualityMax,
    lastFrameTime: 0,
    spriteDpr: 0,
    particleSprites: [],
    particles: []
  },
  loginLoggedIn: false,
  appWindowFullscreen: false,
  runtimeSettingsOpen: false,
  recording: {
    stream: null,
    recorder: null,
    chunks: [],
    objectUrl: '',
    lastBlob: null,
    lastFileName: '',
    mimeType: '',
    startedAt: 0,
    elapsedMs: 0,
    timer: 0,
    active: false,
    paused: false,
    stopping: false,
    mode: 'idle',
    status: '',
    nativeToolbar: false,
    nativeToolbarPending: false
  },
  recordingMiniX: 18,
  recordingMiniY: 18,
  recordingMiniDragging: false,
  recordingMiniPointerId: null,
  recordingMiniStartX: 0,
  recordingMiniStartY: 0,
  recordingMiniPointerStartX: 0,
  recordingMiniPointerStartY: 0,
  windowDragTimer: 0,
  windowDragPointerId: null,
  windowDragStartX: 0,
  windowDragStartY: 0,
  windowDragLastX: 0,
  windowDragLastY: 0,
  windowDragging: false,
  windowDragSuppressClick: false,
  activeProvider: 'netease',
  providers: MUSIC_PROVIDERS,
  loginQrKey: '',
  loginQrTimer: 0,
  loginQrLoading: false,
  community: {
    profile: null,
    friends: [],
    serverUrl: '',
    loading: false,
    lastProvider: '',
    friendsSignature: '',
    refreshTimer: 0,
    eventSource: null,
    eventKey: '',
    eventCursor: '',
    eventReconnectTimer: 0,
    eventReconnectDelay: 1200,
    eventConnected: false,
    selectedFriendId: '',
    messages: [],
    messageTimer: 0,
    messageBubbleTimer: 0,
    messageBubbleMuted: loadCommunityMessageDnd(),
    messageBubbles: [],
    messageBubbleSeenKeys: {},
    messageBubbleSeenReady: false,
    cardCollapsed: loadCommunityCardCollapsed(),
    favoriteListening: loadCommunityFavoriteListening(),
    loveBubbles: [],
    messagePanelX: 0,
    messagePanelY: 0,
    messagePanelRotateX: 4,
    messagePanelRotateY: 0,
    messagePanelDragging: '',
    messagePanelPointerId: null,
    messagePanelStartX: 0,
    messagePanelStartY: 0,
    messagePanelPointerStartX: 0,
    messagePanelPointerStartY: 0,
    messagePanelStartRotateX: 4,
    messagePanelStartRotateY: 0,
    profileOpen: false,
    profilePage: 'self',
    profileBio: loadCommunityBio(),
    profileSaving: false,
    nearbyLoading: false,
    nearbyUsers: [],
    profilePanelX: 0,
    profilePanelY: 0,
    profilePanelRotateX: 5,
    profilePanelRotateY: -6,
    profilePanelDragging: '',
    profilePanelPointerId: null,
    profilePanelStartX: 0,
    profilePanelStartY: 0,
    profilePanelPointerStartX: 0,
    profilePanelPointerStartY: 0,
    profilePanelStartRotateX: 5,
    profilePanelStartRotateY: -6,
    listenTimer: 0,
    listenReportTimer: 0,
    lastListenReportAt: 0,
    pendingInvite: null,
    activeSession: null,
    listenSyncSignature: '',
    listenSyncing: false,
    listenUnavailableSignature: '',
    listenMiniX: 22,
    listenMiniY: 118,
    listenMiniDragging: false,
    listenMiniPointerId: null,
    listenMiniStartX: 0,
    listenMiniStartY: 0,
    listenMiniPointerStartX: 0,
    listenMiniPointerStartY: 0,
    call: {
      active: false,
      peer: null,
      localStream: null,
      remoteAudio: null,
      targetId: '',
      sessionId: '',
      lastSignalId: ''
    }
  },
  update: {
    release: null,
    progressId: '',
    progressTimer: 0,
    installing: false
  },
  visual: {
    energy: 0,
    bass: 0,
    lowFrequencyAmplitude: 0,
    beat: 0,
    mid: 0,
    treble: 0,
    subBass: 0,
    lowMid: 0,
    highMid: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
    warmth: 0,
    brightness: 0,
    sharpness: 0,
    smoothness: 0.7,
    density: 0,
    spectralCentroid: 0,
    fluxPulse: 0,
    fluxMeteor: 0
  },
  visualBridge: {
    energy: 0,
    bass: 0,
    lowFrequencyAmplitude: 0,
    beat: 0,
    mid: 0,
    treble: 0,
    source: '',
    sampleRate: 0
  },
  clientRuntime: {
    mode: 'embedded',
    renderPreset: DIRECTX11_RENDER_PRESET.name,
    renderBackend: DIRECTX11_RENDER_PRESET.backend,
    audioBackend: 'html-audio-fallback',
    audioSpatialBackend: 'x3daudio',
    audioDecoder: 'media-foundation',
    nativeAudioActive: false,
    settings: {
      gpuAcceleration: true,
      directX11: true,
      xAudio2: true,
      x3DAudio: true,
      gestureControl: false,
      gestureCameraSource: 'webcam'
    },
    gestureStatus: {
      running: false,
      state: 'stopped',
      message: ''
    },
    audioSampleRate: 0,
    webglVendor: '',
    webglRenderer: ''
  },
  audioAnalysis: {
    context: null,
    analyser: null,
    source: null,
    sourceMode: '',
    backend: 'web-audio',
    output: 'windows-wasapi',
    sampleRate: 0,
    data: null,
    ready: false,
    live: false,
    blocked: false,
    bass: 0,
    lowFrequencyAmplitude: 0,
    energy: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    subBass: 0,
    lowMid: 0,
    highMid: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
    warmth: 0,
    brightness: 0,
    sharpness: 0,
    smoothness: 0.7,
    density: 0,
    spectralCentroid: 0,
    previousData: null,
    previousBrightness: 0,
    fluxPulse: 0,
    fluxMeteor: 0,
    previousBass: 0,
    silenceFrames: 0,
    signature: ''
  },
  lowFrequencyGraph: {
    history: Array.from({ length: 96 }, () => 0),
    lastValue: 0,
    lastDrawAt: 0
  },
  dynamicCube: {
    built: false,
    count: 0,
    positions: null,
    directions: null,
    phases: null,
    weights: null,
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    mesh: null,
    dummy: null,
    color: null,
    palette: null,
    lastWidth: 0,
    lastHeight: 0,
    lastZoom: 1,
    lastRenderAt: 0,
    push: 0,
    bass: 0,
    energy: 0
  },
  sonicTopography: {
    built: false,
    count: 0,
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    terrain: null,
    material: null,
    uniforms: null,
    meteorMesh: null,
    meteorMaterial: null,
    particleMesh: null,
    particleMaterial: null,
    dummy: null,
    palette: null,
    theme: null,
    ripples: [],
    rippleIndex: 0,
    meteors: [],
    meteorIndex: 0,
    particles: [],
    particleIndex: 0,
    lastWidth: 0,
    lastHeight: 0,
    lastMotionAt: 0,
    lastRenderAt: 0,
    autoYaw: 0,
    lastBeat: 0,
    lastMeteorAt: 0,
    pulseCooldown: 0,
    meteorCooldown: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    audioPulse: 0,
    wasAudioDriving: false,
    idleTone: {
      presence: 0.16,
      brilliance: 0.12,
      air: 0.18,
      warmth: 0.46,
      brightness: 0.34
    }
  },
  particles: [],
  orb: {
    yaw: -0.42,
    pitch: 0.24,
    zoom: 1,
    velocityYaw: 0,
    velocityPitch: 0,
    trailYaw: 0,
    trailPitch: 0,
    trailBoost: 0,
    ambientStreaks: [],
    nextAmbientStreakAt: 0,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    mouseActive: false,
    lastMouseAt: 0,
    quality: RENDER_PROFILE.orbQualityMax,
    lastFrameTime: 0,
    reducedMotion
  }
};

async function apiJson(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(path, {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`接口返回不是 JSON: ${path}`);
  }
  if (!response.ok) {
    throw new Error(json.error || `接口失败: ${response.status}`);
  }
  return json;
}

function applyRuntimeDataset() {
  document.documentElement.dataset.clientMode = state.clientRuntime.mode;
  document.documentElement.dataset.renderPreset = state.clientRuntime.renderPreset;
  document.documentElement.dataset.audioBackend = state.clientRuntime.audioBackend;
  document.documentElement.dataset.gpuAcceleration = String(state.clientRuntime.settings.gpuAcceleration);
  document.documentElement.dataset.directX11 = String(state.clientRuntime.settings.directX11);
  document.documentElement.dataset.gestureControl = String(state.clientRuntime.settings.gestureControl);
}

function setGestureStatusText(message, detail = '') {
  if (!els.gestureControlStatus) return;
  els.gestureControlStatus.textContent = message;
  els.gestureControlStatus.title = detail ? `${message}\n${detail}` : message;
}

function normalizeGestureCameraSource(source) {
  return source === 'camera' ? 'camera' : 'webcam';
}

function setGestureCameraSource(source) {
  const normalized = normalizeGestureCameraSource(source);
  if (state.clientRuntime.settings.gestureCameraSource === normalized) return;
  state.clientRuntime.settings.gestureCameraSource = normalized;
  syncRuntimeSettingsControls();
  saveRuntimeSettings();
}

function renderGestureStatus() {
  if (!els.gestureControlStatus) return;
  const enabled = !!state.clientRuntime.settings.gestureControl;
  const status = state.clientRuntime.gestureStatus || {};
  if (!enabled) {
    setGestureStatusText('摄像头关闭');
    return;
  }
  if (status.running) {
    const action = status.lastAction ? ` · ${status.lastAction}` : '';
    setGestureStatusText(`摄像头运行中${action}`, status.detail || '');
    return;
  }
  if (status.message) {
    setGestureStatusText(status.message, status.detail || '');
    return;
  }
  setGestureStatusText('正在打开摄像头');
}

function syncRuntimeSettingsControls() {
  const settings = state.clientRuntime.settings;
  if (els.gpuAccelerationToggle) els.gpuAccelerationToggle.checked = settings.gpuAcceleration;
  if (els.directX11Toggle) els.directX11Toggle.checked = settings.directX11;
  if (els.xAudio2Toggle) els.xAudio2Toggle.checked = settings.xAudio2;
  if (els.x3DAudioToggle) els.x3DAudioToggle.checked = settings.x3DAudio;
  if (els.gestureControlToggle) els.gestureControlToggle.checked = settings.gestureControl;
  const cameraSource = normalizeGestureCameraSource(settings.gestureCameraSource);
  if (els.gestureWebcamButton) {
    const active = cameraSource === 'webcam';
    els.gestureWebcamButton.classList.toggle('is-active', active);
    els.gestureWebcamButton.setAttribute('aria-pressed', String(active));
  }
  if (els.gestureCameraButton) {
    const active = cameraSource === 'camera';
    els.gestureCameraButton.classList.toggle('is-active', active);
    els.gestureCameraButton.setAttribute('aria-pressed', String(active));
  }
  renderGestureStatus();
}

async function refreshGestureStatus() {
  try {
    const status = await apiJson('/api/app/gesture');
    state.clientRuntime.gestureStatus = status;
    if (typeof status.enabled === 'boolean') {
      state.clientRuntime.settings.gestureControl = status.enabled;
    }
    if (status.cameraSource) {
      state.clientRuntime.settings.gestureCameraSource = normalizeGestureCameraSource(status.cameraSource);
    }
  } catch (error) {
    state.clientRuntime.gestureStatus = {
      running: false,
      state: 'unavailable',
      message: '手势服务不可用'
    };
  }
  syncRuntimeSettingsControls();
  applyRuntimeDataset();
}

async function refreshClientRuntime() {
  try {
    const runtime = await apiJson('/api/app/runtime');
    const nativeAudio = runtime.nativeAudio || {};
    const settings = runtime.settings || {};
    state.clientRuntime.mode = runtime.clientMode || state.clientRuntime.mode;
    state.clientRuntime.renderPreset = runtime.renderPreset || state.clientRuntime.renderPreset;
    state.clientRuntime.renderBackend = runtime.renderBackend || state.clientRuntime.renderBackend;
    state.clientRuntime.audioBackend = runtime.audioBackend || state.clientRuntime.audioBackend;
    state.clientRuntime.audioSpatialBackend = runtime.audioSpatialBackend || state.clientRuntime.audioSpatialBackend;
    state.clientRuntime.audioDecoder = runtime.audioDecoder || state.clientRuntime.audioDecoder;
    state.clientRuntime.nativeAudioActive = nativeAudio.active === true;
    Object.assign(state.clientRuntime.settings, {
      gpuAcceleration: settings.gpuAcceleration !== false,
      directX11: settings.directX11 !== false,
      xAudio2: settings.xAudio2 !== false,
      x3DAudio: settings.x3DAudio !== false,
      gestureControl: settings.gestureControl === true,
      gestureCameraSource: normalizeGestureCameraSource(settings.gestureCameraSource)
    });
  } catch (error) {
    // Keep the local DirectX11 preset defaults when the runtime API is unavailable.
  }
  syncRuntimeSettingsControls();
  applyRuntimeDataset();
  await refreshGestureStatus();
}

function setRuntimeSettingsOpen(open) {
  state.runtimeSettingsOpen = !!open;
  if (els.runtimeSettingsPanel) els.runtimeSettingsPanel.hidden = !state.runtimeSettingsOpen;
  if (els.runtimeSettingsButton) {
    els.runtimeSettingsButton.setAttribute('aria-expanded', String(state.runtimeSettingsOpen));
  }
  if (state.runtimeSettingsOpen) refreshGestureStatus().catch(() => {});
}

function primeGestureCameraOpening() {
  state.clientRuntime.gestureStatus = {
    running: false,
    state: 'camera_opening',
    message: '正在打开系统摄像头'
  };
  renderGestureStatus();
}

async function saveRuntimeSettings() {
  const settings = {
    gpuAcceleration: !!(els.gpuAccelerationToggle && els.gpuAccelerationToggle.checked),
    directX11: !!(els.directX11Toggle && els.directX11Toggle.checked),
    xAudio2: !!(els.xAudio2Toggle && els.xAudio2Toggle.checked),
    x3DAudio: !!(els.x3DAudioToggle && els.x3DAudioToggle.checked),
    gestureControl: !!(els.gestureControlToggle && els.gestureControlToggle.checked),
    gestureCameraSource: normalizeGestureCameraSource(state.clientRuntime.settings.gestureCameraSource)
  };
  Object.assign(state.clientRuntime.settings, settings);
  syncRuntimeSettingsControls();
  applyRuntimeDataset();
  if (settings.gestureControl) primeGestureCameraOpening();
  try {
    const saved = await apiJson('/api/app/runtime/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
    Object.assign(state.clientRuntime.settings, {
      gpuAcceleration: saved.gpuAcceleration !== false,
      directX11: saved.directX11 !== false,
      xAudio2: saved.xAudio2 !== false,
      x3DAudio: saved.x3DAudio !== false,
      gestureControl: saved.gestureControl === true,
      gestureCameraSource: normalizeGestureCameraSource(saved.gestureCameraSource)
    });
    if (saved.gestureStatus) state.clientRuntime.gestureStatus = saved.gestureStatus;
    syncRuntimeSettingsControls();
    applyRuntimeDataset();
    [500, 1500, 3200].forEach((delay) => {
      window.setTimeout(() => refreshGestureStatus().catch(() => {}), delay);
    });
  } catch (error) {
    toast(error.message || 'Runtime settings unavailable');
  }
}

function setRecordingStatus(message) {
  if (els.recordingStatus) els.recordingStatus.textContent = message;
  state.recording.status = message || '';
  syncNativeRecordingToolbar();
}

function postNativeRecordingToolbar(action, payload = {}) {
  if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
    window.chrome.webview.postMessage({ type: 'fe-recording-toolbar', action, ...payload });
    return true;
  }
  return false;
}

function syncNativeRecordingToolbar() {
  if (!state.recording.nativeToolbar && !state.recording.nativeToolbarPending) return;
  postNativeRecordingToolbar('state', {
    mode: state.recording.mode,
    status: state.recording.status,
    canSaveAs: !!state.recording.lastBlob
  });
}

function showRecordingMiniFallback() {
  if (!els.recordingDialog) return;
  els.recordingDialog.hidden = false;
  setRecordingMiniPosition();
  window.requestAnimationFrame(() => setRecordingMiniPosition());
}

function hideRecordingMiniFallback() {
  if (els.recordingDialog) els.recordingDialog.hidden = true;
}

window.feMonsterRecordingNativeReady = () => {
  state.recording.nativeToolbar = true;
  state.recording.nativeToolbarPending = false;
  hideRecordingMiniFallback();
  syncNativeRecordingToolbar();
};

function setRecordingMiniPosition(left = state.recordingMiniX, top = state.recordingMiniY) {
  if (!els.recordingDialog) return;
  const padding = 8;
  const width = els.recordingDialog.offsetWidth || 322;
  const height = els.recordingDialog.offsetHeight || 112;
  const nextLeft = clamp(left, padding, Math.max(padding, window.innerWidth - width - padding));
  const nextTop = clamp(top, padding, Math.max(padding, window.innerHeight - height - padding));
  state.recordingMiniX = nextLeft;
  state.recordingMiniY = nextTop;
  els.recordingDialog.style.setProperty('--recording-left', `${Math.round(nextLeft)}px`);
  els.recordingDialog.style.setProperty('--recording-top', `${Math.round(nextTop)}px`);
}

function recordingMiniTargetIsInteractive(event) {
  const target = event.target instanceof Element ? event.target : null;
  return !!(target && target.closest('button, a, input, select, textarea, video'));
}

function beginRecordingMiniDrag(event) {
  if (!els.recordingPanel || event.button !== 0 || recordingMiniTargetIsInteractive(event)) return;
  state.recordingMiniDragging = true;
  state.recordingMiniPointerId = event.pointerId;
  state.recordingMiniStartX = state.recordingMiniX;
  state.recordingMiniStartY = state.recordingMiniY;
  state.recordingMiniPointerStartX = event.clientX;
  state.recordingMiniPointerStartY = event.clientY;
  els.recordingPanel.classList.add('is-dragging');
  els.recordingPanel.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveRecordingMiniDrag(event) {
  if (!state.recordingMiniDragging || event.pointerId !== state.recordingMiniPointerId) return;
  setRecordingMiniPosition(
    state.recordingMiniStartX + event.clientX - state.recordingMiniPointerStartX,
    state.recordingMiniStartY + event.clientY - state.recordingMiniPointerStartY
  );
  event.preventDefault();
  event.stopPropagation();
}

function endRecordingMiniDrag(event) {
  if (!state.recordingMiniDragging || event.pointerId !== state.recordingMiniPointerId) return;
  state.recordingMiniDragging = false;
  state.recordingMiniPointerId = null;
  els.recordingPanel.classList.remove('is-dragging');
  if (els.recordingPanel.hasPointerCapture(event.pointerId)) {
    els.recordingPanel.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
  event.stopPropagation();
}

function setRecordingControls(mode = 'idle') {
  const recording = mode === 'recording';
  const paused = mode === 'paused';
  const busy = mode === 'saving' || mode === 'finalizing';
  state.recording.mode = mode;
  state.recording.active = recording || paused || busy;
  state.recording.paused = paused;
  if (els.recordingDialog) els.recordingDialog.dataset.recordingMode = mode;
  if (els.recordingStartButton) els.recordingStartButton.disabled = recording || paused || busy;
  if (els.recordingStopButton) els.recordingStopButton.disabled = !recording || busy;
  if (els.recordingResumeButton) els.recordingResumeButton.disabled = !paused || busy;
  if (els.recordingFinishButton) els.recordingFinishButton.disabled = !(recording || paused) || busy;
  for (const control of [els.recordingQualitySelect, els.recordingFpsSelect, els.recordingBitrateInput, els.recordingAudioToggle]) {
    if (control) control.disabled = recording || paused || busy;
  }
  syncNativeRecordingToolbar();
}

function resetRecordingDownload() {
  if (state.recording.objectUrl) URL.revokeObjectURL(state.recording.objectUrl);
  state.recording.objectUrl = '';
  state.recording.lastBlob = null;
  state.recording.lastFileName = '';
  state.recording.mimeType = '';
  if (els.recordingDownloadButton) {
    els.recordingDownloadButton.hidden = true;
    els.recordingDownloadButton.removeAttribute('href');
    els.recordingDownloadButton.removeAttribute('download');
  }
  syncNativeRecordingToolbar();
}

function cleanupRecordingStream() {
  if (state.recording.stream) {
    state.recording.stream.getTracks().forEach((track) => track.stop());
  }
  state.recording.stream = null;
  if (els.recordingPreview && els.recordingPreview.srcObject) {
    els.recordingPreview.srcObject = null;
  }
}

function resetRecordingPreview() {
  if (!els.recordingPreview) return;
  els.recordingPreview.pause();
  els.recordingPreview.removeAttribute('src');
  els.recordingPreview.srcObject = null;
  els.recordingPreview.controls = false;
  els.recordingPreview.load();
  if (els.recordingPreviewPlaceholder) els.recordingPreviewPlaceholder.hidden = false;
}

function updateRecordingTimer() {
  if (!els.recordingTimer) return;
  const elapsedMs = state.recording.elapsedMs + (state.recording.startedAt ? Date.now() - state.recording.startedAt : 0);
  const elapsed = elapsedMs / 1000;
  els.recordingTimer.textContent = formatTime(elapsed);
}

function startRecordingTimer() {
  window.clearInterval(state.recording.timer);
  state.recording.startedAt = Date.now();
  state.recording.timer = window.setInterval(updateRecordingTimer, 250);
  updateRecordingTimer();
}

function clearRecordingTimer(reset = true) {
  window.clearInterval(state.recording.timer);
  if (state.recording.startedAt) {
    state.recording.elapsedMs += Date.now() - state.recording.startedAt;
  }
  state.recording.timer = 0;
  state.recording.startedAt = 0;
  if (reset) state.recording.elapsedMs = 0;
  updateRecordingTimer();
}

function recordingMimeProfile() {
  const fallback = { mimeType: '', extension: 'webm', contentType: 'video/webm', description: 'WebM video' };
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return fallback;
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', contentType: 'video/mp4', description: 'MP4 video' },
    { mimeType: 'video/mp4;codecs=h264,aac', extension: 'mp4', contentType: 'video/mp4', description: 'MP4 video' },
    { mimeType: 'video/mp4', extension: 'mp4', contentType: 'video/mp4', description: 'MP4 video' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', contentType: 'video/webm', description: 'WebM video' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', contentType: 'video/webm', description: 'WebM video' },
    fallback
  ];
  return candidates.find((profile) => !profile.mimeType || MediaRecorder.isTypeSupported(profile.mimeType)) || fallback;
}

function recordingExtensionFromType(type) {
  return String(type || '').toLowerCase().includes('mp4') ? 'mp4' : 'webm';
}

function recordingFileName(type = state.recording.mimeType) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `fe-monster-${stamp}.${recordingExtensionFromType(type)}`;
}

async function saveRecordingBlob(blob, fileName) {
  return apiJson(`/api/app/recording/save?${query({ name: fileName })}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'video/webm' },
    body: blob
  });
}

async function saveRecordingAs(event) {
  if (!state.recording.lastBlob || !state.recording.objectUrl) return;
  event.preventDefault();
  const fileName = state.recording.lastFileName || recordingFileName();
  const contentType = state.recording.lastBlob.type || state.recording.mimeType || 'video/webm';
  const isMp4 = recordingExtensionFromType(contentType) === 'mp4';
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: isMp4 ? 'MP4 video' : 'WebM video',
          accept: isMp4 ? { 'video/mp4': ['.mp4'] } : { 'video/webm': ['.webm'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(state.recording.lastBlob);
      await writable.close();
      toast('录制文件已另存');
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      toast(error.message || '另存失败，已改用下载');
    }
  }

  const link = document.createElement('a');
  link.href = state.recording.objectUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  removeElement(link);
}

function recordingResolution(value) {
  if (value === '1080') return { width: 1920, height: 1080 };
  if (value === '720') return { width: 1280, height: 720 };
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
  return {
    width: Math.max(1280, Math.round(window.innerWidth * dpr)),
    height: Math.max(720, Math.round(window.innerHeight * dpr))
  };
}

function readRecordingOptions() {
  const fps = clamp(Number(els.recordingFpsSelect && els.recordingFpsSelect.value) || 60, 24, 60);
  const resolution = recordingResolution(els.recordingQualitySelect && els.recordingQualitySelect.value);
  const requestedBitrateMbps = Number(els.recordingBitrateInput && els.recordingBitrateInput.value) || 36;
  const adaptiveBitrateMbps = resolution.width && resolution.height
    ? resolution.width * resolution.height * fps * 0.00000026
    : 36;
  const bitrateMbps = clamp(Math.max(requestedBitrateMbps, adaptiveBitrateMbps), 12, 80);
  return {
    fps,
    bitrate: Math.round(bitrateMbps * 1000000),
    audio: !!(els.recordingAudioToggle && els.recordingAudioToggle.checked),
    resolution
  };
}

function recordingDisplayConstraints(options) {
  const video = {
    frameRate: { ideal: options.fps, max: options.fps },
    cursor: 'motion',
    displaySurface: 'browser',
    resizeMode: 'none'
  };
  if (options.resolution.width) {
    video.width = { ideal: options.resolution.width };
    video.height = { ideal: options.resolution.height };
  }

  return {
    video,
    audio: options.audio ? {
      echoCancellation: false,
      noiseSuppression: false,
      suppressLocalAudioPlayback: false
    } : false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'exclude',
    systemAudio: options.audio ? 'include' : 'exclude'
  };
}

async function requestProgramRecordingStream(options) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('当前 WebView2 不支持录制');
  }

  try {
    return await navigator.mediaDevices.getDisplayMedia(recordingDisplayConstraints(options));
  } catch (error) {
    if (error && error.name !== 'TypeError') throw error;
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: options.fps, max: options.fps } },
      audio: options.audio
    });
  }
}

function assertProgramRecordingSurface(stream) {
  const [videoTrack] = stream.getVideoTracks();
  const settings = videoTrack && videoTrack.getSettings ? videoTrack.getSettings() : {};
  if (settings.displaySurface === 'monitor') {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('请选择 FE Monster 窗口或当前页面，不能选择整个屏幕');
  }
  return settings.displaySurface || 'program';
}

function openRecordingDialog() {
  if (!els.recordingDialog) return;
  setRuntimeSettingsOpen(false);
  state.recording.nativeToolbar = false;
  state.recording.nativeToolbarPending = false;
  const requestedNativeToolbar = postNativeRecordingToolbar('show');
  if (requestedNativeToolbar) {
    state.recording.nativeToolbarPending = true;
    hideRecordingMiniFallback();
    window.setTimeout(() => {
      if (state.recording.nativeToolbar || !state.recording.nativeToolbarPending) return;
      state.recording.nativeToolbarPending = false;
      showRecordingMiniFallback();
    }, 500);
  } else {
    showRecordingMiniFallback();
  }
  resetRecordingPreview();
  resetRecordingDownload();
  clearRecordingTimer();
  setRecordingControls('idle');
  setRecordingStatus('只录制当前程序窗口或当前页面');
}

function closeRecordingDialog() {
  if (!els.recordingDialog) return;
  if (state.recording.active) {
    toast('请先完成录制');
    return;
  }
  cleanupRecordingStream();
  clearRecordingTimer();
  hideRecordingMiniFallback();
  postNativeRecordingToolbar('hide');
  state.recording.nativeToolbar = false;
  state.recording.nativeToolbarPending = false;
}

async function finishRecording() {
  clearRecordingTimer(false);
  cleanupRecordingStream();
  setRecordingControls('saving');
  state.recording.recorder = null;
  state.recording.stopping = false;

  if (!state.recording.chunks.length) {
    setRecordingStatus('没有录制到画面');
    setRecordingControls('idle');
    return;
  }

  const chunkType = state.recording.chunks.find((chunk) => chunk && chunk.type)?.type;
  const type = chunkType || state.recording.mimeType || 'video/webm';
  const blob = new Blob(state.recording.chunks, { type });
  const fileName = recordingFileName(type);
  state.recording.chunks = [];
  state.recording.lastBlob = blob;
  state.recording.lastFileName = fileName;
  state.recording.objectUrl = URL.createObjectURL(blob);
  if (els.recordingPreview) {
    els.recordingPreview.srcObject = null;
    els.recordingPreview.src = state.recording.objectUrl;
    els.recordingPreview.controls = true;
    els.recordingPreview.muted = false;
  }
  if (els.recordingPreviewPlaceholder) els.recordingPreviewPlaceholder.hidden = true;
  if (els.recordingDownloadButton) {
    els.recordingDownloadButton.href = state.recording.objectUrl;
    els.recordingDownloadButton.download = fileName;
    els.recordingDownloadButton.hidden = false;
  }

  try {
    setRecordingStatus('正在保存录制文件到程序根目录');
    const saved = await saveRecordingBlob(blob, fileName);
    setRecordingStatus(`录制完成，已保存到程序根目录：${saved.fileName || fileName}`);
  } catch (error) {
    if (els.recordingDownloadButton) els.recordingDownloadButton.hidden = false;
    setRecordingStatus('录制完成，自动保存失败，可手动保存备份');
    toast(error.message || '录制文件自动保存失败');
  }
  setRecordingControls('idle');
  if (state.recording.nativeToolbar || state.recording.nativeToolbarPending) {
    postNativeRecordingToolbar('hide');
    state.recording.nativeToolbar = false;
    state.recording.nativeToolbarPending = false;
    showRecordingMiniFallback();
  }
}

async function startProgramRecording() {
  if (state.recording.active) return;
  if (!window.MediaRecorder) {
    toast('当前 WebView2 不支持 MediaRecorder');
    return;
  }

  resetRecordingDownload();
  state.recording.chunks = [];
  state.recording.elapsedMs = 0;
  state.recording.startedAt = 0;
  state.recording.paused = false;
  state.recording.stopping = false;
  const options = readRecordingOptions();

  try {
    setRecordingStatus('请选择 FE Monster 窗口或当前页面');
    const stream = await requestProgramRecordingStream(options);
    const surface = assertProgramRecordingSurface(stream);
    const profile = recordingMimeProfile();
    state.recording.mimeType = profile.contentType;
    const recorderOptions = {
      videoBitsPerSecond: options.bitrate
    };
    if (profile.mimeType) recorderOptions.mimeType = profile.mimeType;
    if (options.audio) recorderOptions.audioBitsPerSecond = 192000;

    const recorder = new MediaRecorder(stream, recorderOptions);
    state.recording.mimeType = recorder.mimeType || profile.contentType;
    state.recording.stream = stream;
    state.recording.recorder = recorder;

    if (els.recordingPreview) {
      els.recordingPreview.muted = true;
      els.recordingPreview.controls = false;
      els.recordingPreview.srcObject = stream;
      els.recordingPreview.play().catch(() => {});
    }
    if (els.recordingPreviewPlaceholder) els.recordingPreviewPlaceholder.hidden = true;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size) state.recording.chunks.push(event.data);
    });
    recorder.addEventListener('stop', finishRecording, { once: true });
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (state.recording.active) finishProgramRecording();
      }, { once: true });
    });

    recorder.start(1000);
    startRecordingTimer();
    setRecordingControls('recording');
    setRecordingStatus(surface === 'browser' ? '正在录制当前页面' : '正在录制程序窗口');
  } catch (error) {
    cleanupRecordingStream();
    clearRecordingTimer();
    setRecordingControls('idle');
    setRecordingStatus(error.message || '录制启动失败');
    toast(error.message || '录制启动失败');
  }
}

function stopProgramRecording() {
  const recorder = state.recording.recorder;
  if (!recorder || recorder.state !== 'recording' || state.recording.stopping) return;
  if (typeof recorder.pause !== 'function') {
    toast('当前 WebView2 不支持暂停录制');
    return;
  }
  recorder.pause();
  clearRecordingTimer(false);
  setRecordingControls('paused');
  setRecordingStatus('录制已停止，点击继续录制或完成录制');
}

function resumeProgramRecording() {
  const recorder = state.recording.recorder;
  if (!recorder || recorder.state !== 'paused' || state.recording.stopping) return;
  if (typeof recorder.resume !== 'function') {
    toast('当前 WebView2 不支持继续录制');
    return;
  }
  recorder.resume();
  startRecordingTimer();
  setRecordingControls('recording');
  setRecordingStatus('正在继续录制');
}

function finishProgramRecording() {
  const recorder = state.recording.recorder;
  if (!recorder || state.recording.stopping) return;
  state.recording.stopping = true;
  clearRecordingTimer(false);
  setRecordingControls('finalizing');
  setRecordingStatus('正在生成录制文件');
  if (recorder.state === 'inactive') {
    finishRecording();
    return;
  }
  recorder.stop();
}

window.feMonsterRecording = {
  start: startProgramRecording,
  stop: stopProgramRecording,
  resume: resumeProgramRecording,
  finish: finishProgramRecording,
  close: closeRecordingDialog,
  saveAs: () => saveRecordingAs(new Event('click'))
};

function captureRendererInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    state.clientRuntime.webglVendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    state.clientRuntime.webglRenderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  } catch (error) {
    state.clientRuntime.webglVendor = '';
    state.clientRuntime.webglRenderer = '';
  }
}

function createDirectX11Renderer(THREE, options = {}) {
  const renderer = new THREE.WebGLRenderer({
    ...DIRECTX11_RENDER_PRESET.rendererOptions,
    ...options
  });
  renderer.domElement.dataset.renderPreset = DIRECTX11_RENDER_PRESET.name;
  captureRendererInfo(renderer);
  return renderer;
}

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  return search.toString();
}

function songParams(song) {
  return query({
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    cover: song.cover,
    duration: song.duration || 0,
    provider: song.provider || 'netease'
  });
}

function safeText(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderPixelRatio(kind = 'canvas') {
  const nativeDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
  const cap = kind === 'webgl'
    ? RENDER_PROFILE.webglDprMax
    : kind === 'playback'
      ? RENDER_PROFILE.playbackDprMax
      : RENDER_PROFILE.canvasDprMax;
  return Math.max(1, Math.min(nativeDpr, cap));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function wrapRadians(value) {
  const fullTurn = Math.PI * 2;
  let next = value % fullTurn;
  if (next > Math.PI) next -= fullTurn;
  if (next < -Math.PI) next += fullTurn;
  return next;
}

function setupBootLogo() {
  if (!els.bootLogoText) return;
  const chars = Array.from(BOOT_LOGO_TEXT);
  els.bootLogoText.textContent = '';
  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.className = `boot-logo-char${char === ' ' ? ' is-space' : ''}`;
    span.style.setProperty('--boot-char-index', index);
    span.textContent = char === ' ' ? ' ' : char;
    els.bootLogoText.appendChild(span);
  });
}

function markBootReady() {
  if (bootVisual.ready || !els.bootScreen) return;
  bootVisual.ready = true;
  els.bootScreen.classList.add('is-bg-ready');
  window.clearTimeout(bootVisual.logoEnableTimer);
  bootVisual.logoEnableTimer = window.setTimeout(() => {
    if (!els.bootLogoButton || bootVisual.entering) return;
    els.bootLogoButton.disabled = false;
    els.bootScreen.classList.add('is-logo-ready');
  }, reducedMotion ? 240 : 2180);
}

function enterMainFromBoot() {
  if (!els.bootScreen || bootVisual.entering) return;
  bootVisual.entering = true;
  if (els.bootLogoButton) els.bootLogoButton.disabled = true;
  els.bootScreen.classList.add('is-exiting');
  window.dispatchEvent(new CustomEvent('fe-lightfall-stop'));
  window.clearTimeout(bootVisual.exitTimer);
  bootVisual.exitTimer = window.setTimeout(() => {
    window.clearTimeout(bootVisual.logoEnableTimer);
    window.clearTimeout(bootVisual.readyFallbackTimer);
    els.bootScreen.hidden = true;
  }, 460);
}

function initBootScreen() {
  if (!els.bootScreen || !els.bootLogoButton) return;
  setupBootLogo();
  bootVisual.ready = false;
  bootVisual.entering = false;
  els.bootLogoButton.disabled = true;
  els.bootLogoButton.addEventListener('click', enterMainFromBoot);
  window.addEventListener('fe-lightfall-ready', markBootReady, { once: true });
  window.clearTimeout(bootVisual.readyFallbackTimer);
  bootVisual.readyFallbackTimer = window.setTimeout(markBootReady, 2600);
}

function mediaIsSameOrigin(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'blob:' || parsed.protocol === 'data:' || parsed.origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

const WALLPAPER_PREFS_KEY = 'fe-monster-wallpaper-prefs';
const WALLPAPER_PREFS_VERSION = 5;
const WALLPAPER_FIT_MODES = new Set(['fill', 'fit', 'stretch', 'center', 'tile']);

function normalizeWallpaperFitMode(mode) {
  return WALLPAPER_FIT_MODES.has(mode) ? mode : 'fill';
}

function loadWallpaperPrefs() {
  try {
    const prefs = JSON.parse(window.localStorage.getItem(WALLPAPER_PREFS_KEY) || '{}');
    const prefsVersion = Number(prefs.version) || 0;
    const migratedPrefs = prefsVersion < WALLPAPER_PREFS_VERSION;
    state.activeWallpaperId = safeText(prefs.activeWallpaperId, '');
    state.wallpaperOpacity = clamp(Number(prefs.opacity) || state.wallpaperOpacity, 0.3, 1);
    state.wallpaperBrightness = clamp(Number(prefs.brightness) || state.wallpaperBrightness, 0.35, 1.5);
    state.wallpaperBlur = clamp(Number(prefs.blur) || 0, 0, 24);
    if (migratedPrefs) {
      state.wallpaperOpacity = 1;
      state.wallpaperBrightness = 1;
      state.wallpaperBlur = 0;
      state.wallpaperScale = 1;
      state.wallpaperFitMode = 'fill';
    }
    if (!migratedPrefs) state.wallpaperScale = clamp(Number(prefs.scale) || state.wallpaperScale, 0.7, 1);
    state.wallpaperFitMode = normalizeWallpaperFitMode(prefs.fitMode || state.wallpaperFitMode);
    state.wallpaperSource = prefs.source === 'live' ? 'live' : 'imported';
  } catch (error) {
  }
}

function saveWallpaperPrefs() {
  try {
    window.localStorage.setItem(WALLPAPER_PREFS_KEY, JSON.stringify({
      version: WALLPAPER_PREFS_VERSION,
      activeWallpaperId: state.activeWallpaperId,
      opacity: state.wallpaperOpacity,
      brightness: state.wallpaperBrightness,
      blur: state.wallpaperBlur,
      scale: state.wallpaperScale,
      fitMode: state.wallpaperFitMode,
      source: state.wallpaperSource
    }));
  } catch (error) {
  }
}

function resetSpectrumForSong(song = state.currentSong) {
  const signature = lyricSignatureForSong(song) || safeText(song && song.id, '');
  if (signature && signature === state.audioAnalysis.signature) return;
  Object.assign(state.audioAnalysis, {
    signature,
    live: false,
    blocked: false,
    bass: 0,
    lowFrequencyAmplitude: 0,
    energy: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    subBass: 0,
    lowMid: 0,
    highMid: 0,
    presence: 0,
    brilliance: 0,
    air: 0,
    warmth: 0,
    brightness: 0,
    sharpness: 0,
    smoothness: 0.7,
    density: 0,
    spectralCentroid: 0,
    fluxPulse: 0,
    fluxMeteor: 0,
    previousBrightness: 0,
    previousBass: 0,
    silenceFrames: 0
  });
  if (state.audioAnalysis.previousData) state.audioAnalysis.previousData.fill(0);
  updateSpectrumUi();
}

function applyBridgeVisual() {
  if (state.audioAnalysis.live && !state.clientRuntime.nativeAudioActive) return;
  const lowFrequency = clamp(
    Number(state.visualBridge.lowFrequencyAmplitude) || Number(state.visualBridge.bass) || 0,
    0,
    1
  );
  state.visual.energy = state.visualBridge.energy;
  state.visual.lowFrequencyAmplitude = lowFrequency;
  state.visual.bass = clamp(Math.max(state.visualBridge.bass, lowFrequency), 0, 1);
  state.visual.beat = state.visualBridge.beat;
  state.visual.mid = state.visualBridge.mid;
  state.visual.treble = state.visualBridge.treble;
  state.visual.subBass = lowFrequency;
  state.visual.lowMid = state.visualBridge.mid;
  state.visual.highMid = state.visualBridge.mid;
  state.visual.presence = state.visualBridge.treble;
  state.visual.brilliance = state.visualBridge.treble;
  state.visual.air = state.visualBridge.treble;
  state.visual.warmth = clamp((lowFrequency + state.visualBridge.mid * 0.55) / Math.max(0.001, state.visualBridge.energy + 0.18), 0, 1);
  state.visual.brightness = clamp(state.visualBridge.treble / Math.max(0.001, state.visualBridge.energy + 0.18), 0, 1);
  state.visual.sharpness = state.visualBridge.beat;
  state.visual.smoothness = 0.72;
  state.visual.density = clamp(state.visualBridge.energy * 1.1, 0, 1);
  state.visual.spectralCentroid = state.visualBridge.treble * 320;
  state.visual.fluxPulse = state.visualBridge.beat;
  state.visual.fluxMeteor = state.visualBridge.treble * state.visualBridge.beat;
  updateSpectrumUi();
}

async function ensureAudioAnalysis() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !els.audio) return false;

  const analysis = state.audioAnalysis;
  try {
    if (!analysis.context) {
      analysis.context = new AudioContextCtor();
    }
    analysis.backend = 'web-audio';
    analysis.output = 'windows-wasapi';
    analysis.sampleRate = analysis.context.sampleRate || 0;
    if (!state.clientRuntime.nativeAudioActive) state.clientRuntime.audioBackend = 'web-audio';
    state.clientRuntime.audioSampleRate = analysis.sampleRate;
    applyRuntimeDataset();
    if (analysis.context.state === 'suspended') {
      await analysis.context.resume();
    }
    if (!analysis.analyser) {
      analysis.analyser = analysis.context.createAnalyser();
      analysis.analyser.fftSize = 1024;
      analysis.analyser.smoothingTimeConstant = 0.8;
      analysis.data = new Uint8Array(analysis.analyser.frequencyBinCount);
      analysis.previousData = new Float32Array(analysis.analyser.frequencyBinCount);
    }
    if (!analysis.source) {
      const capture = els.audio.captureStream || els.audio.mozCaptureStream;
      if (capture) {
        analysis.source = analysis.context.createMediaStreamSource(capture.call(els.audio));
        analysis.source.connect(analysis.analyser);
        analysis.sourceMode = 'capture';
      } else if (mediaIsSameOrigin(els.audio.currentSrc || els.audio.src)) {
        analysis.source = analysis.context.createMediaElementSource(els.audio);
        analysis.source.connect(analysis.analyser);
        analysis.analyser.connect(analysis.context.destination);
        analysis.sourceMode = 'media';
      } else {
        analysis.blocked = true;
        updateSpectrumUi();
        return false;
      }
    }
    analysis.ready = true;
    return true;
  } catch (error) {
    analysis.blocked = true;
    analysis.ready = false;
    updateSpectrumUi();
    return false;
  }
}

function averageFrequencyBand(data, analyser, fromHz, toHz) {
  const nyquist = (analyser.context && analyser.context.sampleRate ? analyser.context.sampleRate : 44100) / 2;
  const from = clamp(Math.floor((fromHz / nyquist) * data.length), 0, data.length - 1);
  const to = clamp(Math.ceil((toHz / nyquist) * data.length), from + 1, data.length);
  let sum = 0;
  for (let index = from; index < to; index += 1) {
    const value = data[index] || 0;
    sum += value;
  }
  return clamp((sum / Math.max(1, to - from)) / 255, 0, 1);
}

function updateAudioSpectrum() {
  const analysis = state.audioAnalysis;
  if (state.clientRuntime.nativeAudioActive && state.clientRuntime.settings.xAudio2) {
    analysis.live = false;
    analysis.blocked = false;
    applyBridgeVisual();
    return true;
  }
  if (!analysis.analyser || !analysis.data || els.audio.paused) {
    if (els.audio.paused) {
      analysis.live = false;
      applyBridgeVisual();
    }
    return false;
  }

  analysis.analyser.getByteFrequencyData(analysis.data);
  if (!analysis.previousData || analysis.previousData.length !== analysis.data.length) {
    analysis.previousData = new Float32Array(analysis.data.length);
  }

  const data = analysis.data;
  const scaleBin = data.length / 512;
  const bin = (value) => clamp(Math.floor(value * scaleBin), 0, data.length - 1);
  const bands = {
    subBass: { sum: 0, count: 0, start: 0, end: bin(1) },
    bass: { sum: 0, count: 0, start: bin(2), end: bin(3) },
    lowMid: { sum: 0, count: 0, start: bin(4), end: bin(7) },
    mid: { sum: 0, count: 0, start: bin(8), end: bin(18) },
    highMid: { sum: 0, count: 0, start: bin(19), end: bin(46) },
    presence: { sum: 0, count: 0, start: bin(47), end: bin(93) },
    brilliance: { sum: 0, count: 0, start: bin(94), end: bin(186) },
    air: { sum: 0, count: 0, start: bin(187), end: bin(372) }
  };

  let energySum = 0;
  let centroidNum = 0;
  let centroidDen = 0;
  let jumpVolatilitySum = 0;
  let fluxPulseRaw = 0;
  let fluxMeteorRaw = 0;
  const pulseStart = bin(0);
  const pulseEnd = bin(16);
  const meteorStart = bin(159);
  const meteorEnd = bin(174);

  for (let index = 0; index < data.length; index += 1) {
    const value = (data[index] || 0) / 255;
    const previous = analysis.previousData[index] || 0;
    const diff = value - previous;
    energySum += value;
    centroidNum += index * value;
    centroidDen += value;
    jumpVolatilitySum += Math.abs(diff);
    if (diff > 0) {
      if (index >= pulseStart && index <= pulseEnd) fluxPulseRaw += diff;
      if (index >= meteorStart && index <= meteorEnd) fluxMeteorRaw += diff;
    }
    analysis.previousData[index] = value;

    for (const band of Object.values(bands)) {
      if (index < band.start || index > band.end) continue;
      band.sum += value;
      band.count += 1;
      break;
    }
  }

  const averageBand = (band) => band.sum / Math.max(1, band.count);
  const subBassRaw = averageBand(bands.subBass);
  const bassOnlyRaw = averageBand(bands.bass);
  const lowMidRaw = averageBand(bands.lowMid);
  const midOnlyRaw = averageBand(bands.mid);
  const highMidRaw = averageBand(bands.highMid);
  const presenceRaw = averageBand(bands.presence);
  const brillianceRaw = averageBand(bands.brilliance);
  const airRaw = averageBand(bands.air);
  const lowFrequencyRaw = averageFrequencyBand(data, analysis.analyser, 20, 150);
  const bassRaw = (subBassRaw + bassOnlyRaw + lowMidRaw) / 3;
  const midRaw = (midOnlyRaw + highMidRaw) / 2;
  const trebleRaw = (presenceRaw + brillianceRaw + airRaw) / 3;
  const energyRaw = energySum / Math.max(1, data.length);
  const warmthRaw = energySum > 0
    ? (bands.subBass.sum + bands.bass.sum + bands.lowMid.sum + bands.mid.sum) / energySum
    : 0;
  const brightnessRaw = energySum > 0
    ? (bands.presence.sum + bands.brilliance.sum + bands.air.sum) / energySum
    : 0;
  const sharpnessRaw = Math.max(0, brightnessRaw - analysis.previousBrightness) * 10;
  analysis.previousBrightness = brightnessRaw;
  const smoothnessRaw = Math.max(0, 1 - (jumpVolatilitySum / Math.max(1, data.length)) * 2);
  const activeThreshold = energyRaw * 1.5;
  const densityRaw = [
    subBassRaw,
    bassOnlyRaw,
    lowMidRaw,
    midOnlyRaw,
    highMidRaw,
    presenceRaw,
    brillianceRaw,
    airRaw
  ].filter((value) => value > activeThreshold).length / 8;
  const spectralCentroidRaw = centroidDen > 0 ? centroidNum / centroidDen : 0;
  const active = bassRaw > 0.012 || midRaw > 0.012 || trebleRaw > 0.012;

  if (!active) {
    analysis.silenceFrames += 1;
    if (analysis.silenceFrames > 50) {
      analysis.live = false;
      analysis.blocked = true;
      applyBridgeVisual();
      return false;
    }
  } else {
    analysis.silenceFrames = 0;
    analysis.blocked = false;
  }

  const beatRaw = clamp((bassRaw - analysis.previousBass) * 4.6 + bassRaw * 0.38, 0, 1);
  analysis.previousBass = bassRaw;
  const dt = 0.15;
  analysis.bass += (bassRaw - analysis.bass) * dt;
  const lowFrequencyRate = lowFrequencyRaw > analysis.lowFrequencyAmplitude ? 0.34 : 0.075;
  analysis.lowFrequencyAmplitude += (lowFrequencyRaw - analysis.lowFrequencyAmplitude) * lowFrequencyRate;
  analysis.mid += (midRaw - analysis.mid) * dt;
  analysis.treble += (trebleRaw - analysis.treble) * dt;
  analysis.energy += (energyRaw - analysis.energy) * dt;
  analysis.subBass += (subBassRaw - analysis.subBass) * dt;
  analysis.lowMid += (lowMidRaw - analysis.lowMid) * dt;
  analysis.highMid += (highMidRaw - analysis.highMid) * dt;
  analysis.presence += (presenceRaw - analysis.presence) * dt;
  analysis.brilliance += (brillianceRaw - analysis.brilliance) * dt;
  analysis.air += (airRaw - analysis.air) * dt;
  analysis.warmth += (warmthRaw - analysis.warmth) * dt;
  analysis.brightness += (brightnessRaw - analysis.brightness) * dt;
  analysis.sharpness += (sharpnessRaw - analysis.sharpness) * dt;
  analysis.smoothness += (smoothnessRaw - analysis.smoothness) * dt;
  analysis.density += (densityRaw - analysis.density) * dt;
  analysis.spectralCentroid += (spectralCentroidRaw - analysis.spectralCentroid) * dt;
  analysis.fluxPulse += (fluxPulseRaw - analysis.fluxPulse) * 0.4;
  analysis.fluxMeteor += (fluxMeteorRaw - analysis.fluxMeteor) * 0.4;
  analysis.beat += (beatRaw - analysis.beat) * 0.42;
  analysis.live = true;

  state.visual.lowFrequencyAmplitude = clamp(analysis.lowFrequencyAmplitude * 1.55, 0, 1);
  state.visual.bass = clamp(Math.max(analysis.bass * 1.45, state.visual.lowFrequencyAmplitude), 0, 1);
  state.visual.mid = clamp(analysis.mid * 1.28, 0, 1);
  state.visual.treble = clamp(analysis.treble * 1.18, 0, 1);
  state.visual.energy = clamp(analysis.energy * 1.36, 0, 1);
  state.visual.beat = clamp(analysis.beat * 1.28, 0, 1);
  state.visual.subBass = clamp(Math.max(analysis.subBass, state.visual.lowFrequencyAmplitude), 0, 1);
  state.visual.lowMid = clamp(analysis.lowMid, 0, 1);
  state.visual.highMid = clamp(analysis.highMid, 0, 1);
  state.visual.presence = clamp(analysis.presence, 0, 1);
  state.visual.brilliance = clamp(analysis.brilliance, 0, 1);
  state.visual.air = clamp(analysis.air, 0, 1);
  state.visual.warmth = clamp(analysis.warmth, 0, 1);
  state.visual.brightness = clamp(analysis.brightness, 0, 1);
  state.visual.sharpness = clamp(analysis.sharpness, 0, 1);
  state.visual.smoothness = clamp(analysis.smoothness, 0, 1);
  state.visual.density = clamp(analysis.density, 0, 1);
  state.visual.spectralCentroid = analysis.spectralCentroid;
  state.visual.fluxPulse = analysis.fluxPulse;
  state.visual.fluxMeteor = analysis.fluxMeteor;
  updateSpectrumUi();
  return true;
}

function drawLowFrequencyGraph(value) {
  if (!els.lowFrequencyGraph) return;
  const canvas = els.lowFrequencyGraph;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor((rect.width || canvas.width || 202) * dpr));
  const height = Math.max(1, Math.floor((rect.height || canvas.height || 64) * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext('2d');
  if (!context) return;
  const history = state.lowFrequencyGraph.history;
  history.push(clamp(value, 0, 1));
  while (history.length > 96) history.shift();

  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(131, 228, 255, 0.24)');
  gradient.addColorStop(1, 'rgba(131, 228, 255, 0.02)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(232, 249, 255, 0.12)';
  context.lineWidth = Math.max(1, dpr);
  for (let line = 1; line < 4; line += 1) {
    const y = (height * line) / 4;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.beginPath();
  history.forEach((item, index) => {
    const x = history.length <= 1 ? width : (index / (history.length - 1)) * width;
    const y = height - item * (height - 6 * dpr) - 3 * dpr;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = 'rgba(131, 228, 255, 0.96)';
  context.lineWidth = 2 * dpr;
  context.shadowBlur = 8 * dpr;
  context.shadowColor = 'rgba(131, 228, 255, 0.55)';
  context.stroke();
  context.shadowBlur = 0;
}

function updateSpectrumUi() {
  const lowFrequency = clamp(
    state.audioAnalysis.live && !state.clientRuntime.nativeAudioActive
      ? state.visual.lowFrequencyAmplitude
      : state.visual.lowFrequencyAmplitude || state.visualBridge.lowFrequencyAmplitude,
    0,
    1
  );
  state.lowFrequencyGraph.lastValue = lowFrequency;
  if (state.runtimeSettingsOpen && els.lowFrequencyValue) {
    els.lowFrequencyValue.textContent = `${Math.round(lowFrequency * 100)}%`;
  }
  if (state.runtimeSettingsOpen && els.lowFrequencyGraph) {
    const now = performance.now();
    if (now - state.lowFrequencyGraph.lastDrawAt > 80) {
      state.lowFrequencyGraph.lastDrawAt = now;
      drawLowFrequencyGraph(lowFrequency);
    }
  }

  if (els.spectrumBassFill) {
    const value = Math.max(state.audioAnalysis.live ? state.visual.bass : state.visualBridge.bass, lowFrequency);
    els.spectrumBassFill.style.width = `${Math.round(clamp(value, 0, 1) * 100)}%`;
  }
  if (els.spectrumStatus) {
    if (state.visualBridge.source === 'xaudio2-native-loopback') {
      els.spectrumStatus.textContent = 'XAudio2';
      return;
    }
    const status = state.audioAnalysis.live ? '实时' : state.audioAnalysis.blocked ? '桥接' : '待机';
    els.spectrumStatus.textContent = status;
  }
}

function buildDynamicCube() {
  if (!els.dynamicCubeCore || state.dynamicCube.built) return;
  if (!window.THREE) {
    state.dynamicCube.built = true;
    return;
  }
  const THREE = window.THREE;
  const cube = state.dynamicCube;
  const count = DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID;
  const positions = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const weights = new Float32Array(count);
  const center = (DYNAMIC_CUBE_GRID - 1) / 2;
  els.dynamicCubeCore.style.setProperty('--cube-bound', `${DYNAMIC_CUBE_EXTENT}px`);

  const renderer = createDirectX11Renderer(THREE, { antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(renderPixelRatio('webgl'));
  renderer.domElement.className = 'dynamic-cube-canvas';
  els.dynamicCubeCore.textContent = '';
  els.dynamicCubeCore.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-48, 48, 48, -48, 0.1, 500);
  camera.position.set(0, 0, 160);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  group.rotation.z = -0.035;
  scene.add(group);

  const ambient = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(42, -58, 92);
  scene.add(key);
  const rim = new THREE.PointLight(0xdaf6ff, 1.8, 220);
  rim.position.set(-62, 54, 78);
  scene.add(rim);

  const geometry = new THREE.BoxGeometry(DYNAMIC_CUBE_SIZE, DYNAMIC_CUBE_SIZE, DYNAMIC_CUBE_SIZE);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0xf7fdff,
    emissiveIntensity: 0.075,
    roughness: 0.5,
    metalness: 0.04
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (let x = 0; x < DYNAMIC_CUBE_GRID; x += 1) {
    for (let y = 0; y < DYNAMIC_CUBE_GRID; y += 1) {
      for (let z = 0; z < DYNAMIC_CUBE_GRID; z += 1) {
        const px = (x - center) * DYNAMIC_CUBE_GAP;
        const py = (y - center) * DYNAMIC_CUBE_GAP;
        const pz = (z - center) * DYNAMIC_CUBE_GAP;
        const longest = Math.max(Math.abs(px), Math.abs(py), Math.abs(pz), 1);
        const edge = Math.max(Math.abs(x - center), Math.abs(y - center), Math.abs(z - center)) / center;
        const offset = index * 3;
        positions[offset] = px;
        positions[offset + 1] = py;
        positions[offset + 2] = pz;
        directions[offset] = px / longest;
        directions[offset + 1] = py / longest;
        directions[offset + 2] = pz / longest;
        phases[index] = (x * 1.8 + y * 2.35 + z * 1.32) % (Math.PI * 2);
        weights[index] = 0.46 + edge * 0.74;

        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  cube.count = count;
  cube.positions = positions;
  cube.directions = directions;
  cube.phases = phases;
  cube.weights = weights;
  cube.renderer = renderer;
  cube.scene = scene;
  cube.camera = camera;
  cube.group = group;
  cube.mesh = mesh;
  cube.dummy = dummy;
  cube.color = color;
  cube.built = true;
  applyDynamicCubePalette(cube.palette || fallbackLyricPalette(state.currentSong));
  resizeDynamicCubeRenderer();
  renderer.render(scene, camera);
}

function resizeDynamicCubeRenderer() {
  const cube = state.dynamicCube;
  if (!cube.renderer || !cube.camera || !els.dynamicCubeCore) return;
  const rect = els.dynamicCubeCore.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const zoom = clamp(state.playbackVisual.zoom || 1, 0.58, 2.35);
  if (width === cube.lastWidth && height === cube.lastHeight && Math.abs(zoom - cube.lastZoom) < 0.001) return;
  cube.lastWidth = width;
  cube.lastHeight = height;
  cube.lastZoom = zoom;
  cube.renderer.setSize(width, height, false);
  const aspect = width / Math.max(1, height);
  const view = 92 / zoom;
  cube.camera.left = -view * aspect / 2;
  cube.camera.right = view * aspect / 2;
  cube.camera.top = view / 2;
  cube.camera.bottom = -view / 2;
  cube.camera.updateProjectionMatrix();
}

function updateDynamicCubeVisibility() {
  const visible = state.playbackPage && state.diyPreset === 'cube';
  if (els.dynamicCubeScene) els.dynamicCubeScene.hidden = !visible;
  els.appShell.classList.toggle('has-dynamic-cube', visible);
  if (visible) buildDynamicCube();
}

function updateDynamicCubeMotion() {
  const cube = state.dynamicCube;
  if (!state.playbackPage || state.diyPreset !== 'cube' || !cube.mesh || !cube.renderer || !cube.scene || !cube.camera) return;
  const nowMs = performance.now();
  if (RENDER_PROFILE.cubeFrameGapMs && cube.lastRenderAt && nowMs - cube.lastRenderAt < RENDER_PROFILE.cubeFrameGapMs) return;
  cube.lastRenderAt = nowMs;
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.04 : 0.22);
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.04 : 0.18);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0 : 0.12);
  cube.bass += (bass - cube.bass) * 0.32;
  cube.energy += (energy - cube.energy) * 0.24;

  const t = nowMs / 1000;
  const heart = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.15 + state.lyricSpeed * 0.26))), 8);
  const motionScale = reducedMotion ? 0.28 : 1;
  const pushBase = (0.7 + cube.bass * 7.8 + beat * 2.7 + heart * cube.bass * 3.4) * state.cubeIntensity * motionScale;
  const scaleBase = 0.96 + cube.bass * 0.11 + beat * 0.035;
  if (els.dynamicCubeScene) {
    els.dynamicCubeScene.style.setProperty('--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
    els.dynamicCubeScene.style.setProperty('--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
    els.dynamicCubeScene.style.setProperty('--cube-glow-alpha', (0.18 + cube.energy * 0.36 + beat * 0.16).toFixed(3));
  }

  resizeDynamicCubeRenderer();
  cube.group.rotation.x = state.playbackVisual.pitch;
  cube.group.rotation.y = state.playbackVisual.yaw;

  const positions = cube.positions;
  const directions = cube.directions;
  const phases = cube.phases;
  const weights = cube.weights;
  const dummy = cube.dummy;
  for (let index = 0; index < cube.count; index += 1) {
    const offset = index * 3;
    const wave = 0.78 + Math.sin(t * (2.1 + state.lyricSpeed * 0.88) + phases[index]) * 0.16;
    const push = pushBase * weights[index] * wave;
    const drift = Math.sin(t * 1.25 + phases[index]) * cube.energy * 0.55;
    dummy.position.set(
      positions[offset] + directions[offset] * push + directions[offset + 1] * drift,
      positions[offset + 1] + directions[offset + 1] * push - directions[offset] * drift,
      positions[offset + 2] + directions[offset + 2] * push * 0.74
    );
    dummy.scale.setScalar(scaleBase);
    dummy.updateMatrix();
    cube.mesh.setMatrixAt(index, dummy.matrix);
  }
  cube.mesh.instanceMatrix.needsUpdate = true;
  cube.renderer.render(cube.scene, cube.camera);
}

function threeColorFromRgb(THREE, color) {
  return new THREE.Color(
    clamp((color && color.r) || 0, 0, 255) / 255,
    clamp((color && color.g) || 0, 0, 255) / 255,
    clamp((color && color.b) || 0, 0, 255) / 255
  );
}

function createSonicTopographyTheme(palette) {
  const THREE = window.THREE;
  const source = palette || fallbackLyricPalette(state.currentSong);
  const baseRgb = mixRgb(source.depth, { r: 0, g: 0, b: 0 }, 0.72);
  const base = threeColorFromRgb(THREE, baseRgb);
  const cool = threeColorFromRgb(THREE, vividCubeColor(source.glow, 0.02, 1.32));
  const warm = threeColorFromRgb(THREE, vividCubeColor(source.primary, 0.04, 1.22));
  const hot = threeColorFromRgb(THREE, vividCubeColor(source.highlight, 0.08, 1.1));
  const depth = threeColorFromRgb(THREE, source.depth);
  return {
    uBaseColor1: base.clone(),
    uBaseColor2: base.clone().lerp(new THREE.Color(0xffffff), 0.12),
    uCoolCore: cool.clone(),
    uCoolEdge: cool.clone().lerp(depth, 0.35),
    uWarmCore: warm.clone(),
    uWarmEdge: hot.clone().lerp(depth, 0.18),
    uRippleColor: hot.clone().lerp(cool, 0.28),
    uGlowIntensity: 1.36 + relativeLuminance(source.glow) * 0.74
  };
}

function createSonicTopographyMaterial(THREE, theme) {
  const uniforms = {
    uTime: { value: 0 },
    uSubBass: { value: 0 },
    uBass: { value: 0 },
    uLowMid: { value: 0 },
    uMid: { value: 0 },
    uHighMid: { value: 0 },
    uPresence: { value: 0 },
    uBrilliance: { value: 0 },
    uAir: { value: 0 },
    uWarmth: { value: 0 },
    uBrightness: { value: 0 },
    uSharpness: { value: 0 },
    uSmoothness: { value: 0.7 },
    uDensity: { value: 0.2 },
    uSpectralCentroid: { value: 0 },
    uEnergy: { value: 0 },
    uAudioPulse: { value: 0 },
    uIdleBreath: { value: 0.14 },
    uRipples: {
      value: Array.from({ length: SONIC_TOPOGRAPHY_RIPPLES }, () => ({
        pos: new THREE.Vector2(),
        time: -100,
        strength: 0,
        isActive: 0,
        rippleType: 0
      }))
    },
    uBaseColor1: { value: theme.uBaseColor1.clone() },
    uBaseColor2: { value: theme.uBaseColor2.clone() },
    uCoolCore: { value: theme.uCoolCore.clone() },
    uCoolEdge: { value: theme.uCoolEdge.clone() },
    uWarmCore: { value: theme.uWarmCore.clone() },
    uWarmEdge: { value: theme.uWarmEdge.clone() },
    uRippleColor: { value: theme.uRippleColor.clone() },
    uGlowIntensity: { value: theme.uGlowIntensity }
  };

  const vertexShader = `
    uniform float uTime;
    uniform float uSubBass;
    uniform float uBass;
    uniform float uLowMid;
    uniform float uMid;
    uniform float uHighMid;
    uniform float uSmoothness;
    uniform float uDensity;
    uniform float uEnergy;
    uniform float uAudioPulse;
    uniform float uIdleBreath;

    struct Ripple {
      vec2 pos;
      float time;
      float strength;
      float isActive;
      float rippleType;
    };
    uniform Ripple uRipples[10];

    varying vec2 vUv;
    varying float vElevation;
    varying float vDistance;
    varying vec2 vRippleAnim;
    varying vec3 vNormal;
    varying float vRelativeY;
    varying vec2 vInstancePos;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
      m = m * m;
      m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vUv = uv;
      vNormal = normal;

      vec4 instancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec2 pos2D = instancePos.xz;
      vInstancePos = pos2D;

      float centerDist = length(pos2D);
      vDistance = centerDist;
      float rnd = random(pos2D);

      vec2 movingPos = pos2D * 0.05 + vec2(uTime * 0.1, uTime * 0.05);
      float baseNoise = (snoise(movingPos) + 1.0) * 0.5;
      float wave = sin(pos2D.x * 0.15 + pos2D.y * 0.1 - uTime * 0.6) * 0.5 + 0.5;
      float globalFalloff = smoothstep(60.0, 30.0, centerDist);
      float idleField = (snoise(pos2D * 0.085 + vec2(uTime * 0.032, -uTime * 0.026)) + 1.0) * 0.5;
      float idleCluster = smoothstep(0.5, 0.96, idleField + rnd * 0.18);
      float idlePulse = 0.54 + sin(uTime * 0.72 + rnd * 6.283 + baseNoise * 2.4) * 0.46;
      float idleElevation = uIdleBreath * globalFalloff * (idleCluster * idlePulse * 0.76 + wave * 0.13);
      float lowDrive = max(uSubBass * 1.25, uBass);
      float lowGate = smoothstep(0.055, 0.22, lowDrive);
      float rhythmGate = lowGate * (0.32 + uAudioPulse * 0.68);

      float subRegion = smoothstep(25.0, 0.0, centerDist);
      float subLift = uSubBass * rhythmGate * subRegion * 2.75;

      float bassNoise = snoise(pos2D * 0.1 - vec2(0.0, uTime * 0.2));
      float bassRegion = smoothstep(35.0, 5.0, centerDist + bassNoise * 5.0);
      float bassLift = uBass * rhythmGate * bassRegion * smoothstep(0.0, 1.0, rnd + uDensity * 0.5) * 2.25;

      float lowMidNoise = snoise(pos2D * 0.05 + vec2(uTime * 0.1, 0.0));
      float lowMidLift = uLowMid * rhythmGate * (lowMidNoise * 0.5 + 0.5) * 0.95;

      float riverFlow = sin(pos2D.x * 0.2 + pos2D.y * 0.2 + snoise(pos2D * 0.1) * 2.0 - uTime * 2.0);
      float midLift = uMid * rhythmGate * max(0.0, riverFlow) * 1.05;

      float highMidRegion = smoothstep(10.0, 45.0, centerDist);
      float highMidLift = 0.0;
      if (fract(rnd * 13.3) > 0.8) {
        highMidLift = uHighMid * rhythmGate * highMidRegion * fract(rnd * 7.7) * 0.8;
      }

      float kickSurface = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * lowDrive * rhythmGate * 0.38;
      float audioElevation = subLift + bassLift + lowMidLift + midLift + highMidLift + kickSurface;
      if (rnd > 0.99) {
        audioElevation += uEnergy * rhythmGate * 0.72;
      }
      audioElevation *= globalFalloff;

      float elevation = idleElevation + audioElevation;
      float rippleElevation = 0.0;
      float rippleIntensityNormal = 0.0;
      float rippleIntensityWhite = 0.0;
      float speed = 15.0;
      float width = 3.0;

      for (int i = 0; i < 10; i++) {
        if (uRipples[i].isActive > 0.0) {
          float dist = length(pos2D - uRipples[i].pos);
          float timeSince = uTime - uRipples[i].time;
          float curSpeed = speed;
          float curWidth = width;
          float curFadeDist = 15.0;
          float elevationScale = 4.0;

          if (uRipples[i].rippleType > 0.5) {
            curSpeed = 20.0;
            curWidth = 1.0;
            curFadeDist = 8.0;
            elevationScale = 1.0;
          }

          float waveRadius = timeSince * curSpeed;
          float d = dist - waveRadius;
          float rippleWave = exp(-d * d / curWidth);
          float fade = exp(-waveRadius / curFadeDist);
          float rPulse = rippleWave * fade * uRipples[i].strength;

          rippleElevation += rPulse * elevationScale;
          if (uRipples[i].rippleType > 0.5) {
            rippleIntensityWhite += rPulse;
          } else {
            rippleIntensityNormal += rPulse;
          }
        }
      }

      elevation += rippleElevation;
      vRippleAnim = vec2(clamp(rippleIntensityNormal, 0.0, 1.0), clamp(rippleIntensityWhite, 0.0, 1.0));
      vElevation = elevation;

      float yPos = position.y + 0.5;
      vRelativeY = yPos;
      float totalHeight = 1.0 + elevation;
      vec3 pos = position;
      pos.y = -0.5 + yPos * totalHeight;

      vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uPresence;
    uniform float uBrilliance;
    uniform float uAir;
    uniform float uWarmth;
    uniform float uBrightness;
    uniform float uSharpness;
    uniform vec3 uBaseColor1;
    uniform vec3 uBaseColor2;
    uniform vec3 uCoolCore;
    uniform vec3 uCoolEdge;
    uniform vec3 uWarmCore;
    uniform vec3 uWarmEdge;
    uniform vec3 uRippleColor;
    uniform float uGlowIntensity;

    varying vec2 vUv;
    varying float vElevation;
    varying float vDistance;
    varying vec2 vRippleAnim;
    varying vec3 vNormal;
    varying float vRelativeY;
    varying vec2 vInstancePos;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      bool isTop = vNormal.y > 0.5;
      float distFromTop = 1.0 - vRelativeY;
      float rnd = random(vInstancePos);
      float centerDist = length(vInstancePos);
      float normElevation = clamp(vElevation / 8.0, 0.0, 1.0);

      vec3 cBase1 = uBaseColor1;
      vec3 cBase2 = uBaseColor2;
      vec3 coolCore = uCoolCore;
      vec3 coolEdge = uCoolEdge;
      vec3 warmCore = uWarmCore;
      vec3 warmEdge = uWarmEdge;

      float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist / 80.0));
      vec3 zoneCore = mix(coolCore, warmCore, warmBlend);
      vec3 zoneEdge = mix(coolEdge, warmEdge, warmBlend);
      vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));
      float distFade = 1.0 - smoothstep(40.0, 75.0, centerDist);
      targetGlow = mix(targetGlow, vec3(0.4, 0.8, 1.0), uBrightness * 0.6);
      float visualFloor = clamp(0.035 + uBrightness * 0.05 + uAir * 0.04, 0.035, 0.16);
      vec3 currentGlow = mix(cBase2, targetGlow, max(normElevation, visualFloor)) * uGlowIntensity * distFade;
      currentGlow = mix(currentGlow, uRippleColor, vRippleAnim.x);
      currentGlow = mix(currentGlow, vec3(1.0, 1.0, 1.0), vRippleAnim.y);

      vec3 bodyColor = mix(cBase1, cBase2, vRelativeY * distFade);
      vec3 finalColor;

      if (isTop) {
        float topIntensity = smoothstep(0.0, 0.4, normElevation);
        float twinkleDistFalloff = smoothstep(60.0, 30.0, centerDist);
        float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

        bool isSparkleTarget = fract(rnd * 31.0) > 0.95;
        if (isSparkleTarget && normElevation < 0.1) {
          topIntensity += uAir * 2.0 * twinkleMultiplier;
        }

        finalColor = mix(cBase2, currentGlow, topIntensity);

        float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
        float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
        float edge = min(edgeX + edgeY, 1.0);
        finalColor += currentGlow * edge * 0.8 * (topIntensity + 0.3);

        float flashChance = smoothstep(0.3, 1.0, uPresence);
        if (fract(rnd * 53.0) > 0.98 - flashChance * 0.1) {
          float flashSync = sin(uTime * 40.0 + rnd * 100.0) * 0.5 + 0.5;
          finalColor += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), rnd) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier;
        }

        if (edge > 0.5 && fract(rnd * 89.0 + uTime * 2.0) > 0.98) {
          finalColor += vec3(1.0) * uBrilliance * 3.0 * twinkleMultiplier;
        }
      } else {
        float verticalFalloff = mix(1.0, 3.0, uSharpness);
        float sideGlow = smoothstep(0.5 / verticalFalloff, 0.0, distFromTop) * normElevation;
        if (normElevation < 0.02) sideGlow = 0.0;
        finalColor = mix(bodyColor, currentGlow, sideGlow * 1.5);
        float rimGlow = smoothstep(0.03, 0.0, distFromTop) * normElevation;
        finalColor += currentGlow * rimGlow;
      }

      finalColor += uRippleColor * vRippleAnim.x * 0.6;
      finalColor += vec3(1.0, 1.0, 1.0) * vRippleAnim.y * 1.2;

      float aerialFog = smoothstep(30.0, 65.0, vDistance);
      vec3 atmosphericColor = mix(cBase1, cBase2, 0.4);
      finalColor = mix(finalColor, atmosphericColor, aerialFog * 0.5);

      float alphaFade = 1.0 - smoothstep(55.0, 78.0, vDistance);
      gl_FragColor = vec4(finalColor, alphaFade);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true
  });
}

function buildSonicTopography() {
  if (!els.sonicTopographyCore || state.sonicTopography.built) return;
  if (!window.THREE) {
    state.sonicTopography.built = true;
    return;
  }
  const THREE = window.THREE;
  const topo = state.sonicTopography;
  const count = SONIC_TOPOGRAPHY_GRID * SONIC_TOPOGRAPHY_GRID;
  const offset = (SONIC_TOPOGRAPHY_GRID * SONIC_TOPOGRAPHY_SPACING) / 2;
  const theme = topo.theme || createSonicTopographyTheme(topo.palette || fallbackLyricPalette(state.currentSong));

  const renderer = createDirectX11Renderer(THREE, { antialias: false });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(renderPixelRatio('webgl'));
  renderer.domElement.className = 'sonic-topography-canvas';
  els.sonicTopographyCore.textContent = '';
  els.sonicTopographyCore.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.uBaseColor1.clone(), 30, 95);
  const camera = new THREE.PerspectiveCamera(SONIC_TOPOGRAPHY_CAMERA.fov, 1, 0.1, 500);
  camera.position.set(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(10, 20, 10);
  scene.add(key);

  const geometry = new THREE.BoxGeometry(SONIC_TOPOGRAPHY_SIZE, 1, SONIC_TOPOGRAPHY_SIZE);
  const material = createSonicTopographyMaterial(THREE, theme);
  const terrain = new THREE.InstancedMesh(geometry, material, count);
  terrain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(terrain);

  const meteorMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.4, 1.2, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    SONIC_TOPOGRAPHY_METEORS
  );
  meteorMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  meteorMesh.frustumCulled = false;
  group.add(meteorMesh);

  const particleMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }),
    SONIC_TOPOGRAPHY_PARTICLES
  );
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  group.add(particleMesh);

  const dummy = new THREE.Object3D();
  let index = 0;
  for (let x = 0; x < SONIC_TOPOGRAPHY_GRID; x += 1) {
    for (let z = 0; z < SONIC_TOPOGRAPHY_GRID; z += 1) {
      const px = x * SONIC_TOPOGRAPHY_SPACING - offset;
      const pz = z * SONIC_TOPOGRAPHY_SPACING - offset;
      dummy.position.set(px, 0.5, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      terrain.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }

  for (let i = 0; i < SONIC_TOPOGRAPHY_METEORS; i += 1) {
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    meteorMesh.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < SONIC_TOPOGRAPHY_PARTICLES; i += 1) {
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(i, dummy.matrix);
  }

  terrain.instanceMatrix.needsUpdate = true;
  meteorMesh.instanceMatrix.needsUpdate = true;
  particleMesh.instanceMatrix.needsUpdate = true;

  topo.count = count;
  topo.renderer = renderer;
  topo.scene = scene;
  topo.camera = camera;
  topo.group = group;
  topo.terrain = terrain;
  topo.material = material;
  topo.uniforms = material.uniforms;
  topo.meteorMesh = meteorMesh;
  topo.meteorMaterial = meteorMesh.material;
  topo.particleMesh = particleMesh;
  topo.particleMaterial = particleMesh.material;
  topo.dummy = dummy;
  topo.theme = theme;
  topo.ripples = material.uniforms.uRipples.value;
  topo.meteors = Array.from({ length: SONIC_TOPOGRAPHY_METEORS }, () => ({ active: false, x: 0, y: -1000, z: 0, speed: 0, strength: 0 }));
  topo.particles = Array.from({ length: SONIC_TOPOGRAPHY_PARTICLES }, () => ({ active: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1 }));
  topo.built = true;
  applySonicTopographyPalette(topo.palette || fallbackLyricPalette(state.currentSong));
  resizeSonicTopographyRenderer();
  renderer.render(scene, camera);
}

function resizeSonicTopographyRenderer() {
  const topo = state.sonicTopography;
  if (!topo.renderer || !topo.camera || !els.sonicTopographyCore) return;
  const rect = els.sonicTopographyCore.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (width === topo.lastWidth && height === topo.lastHeight) return;
  topo.lastWidth = width;
  topo.lastHeight = height;
  topo.renderer.setSize(width, height, false);
  topo.camera.aspect = width / Math.max(1, height);
  topo.camera.updateProjectionMatrix();
}

function updateSonicTopographyVisibility() {
  const visible = state.playbackPage && state.diyPreset === 'topography';
  if (els.sonicTopographyScene) els.sonicTopographyScene.hidden = !visible;
  els.appShell.classList.toggle('has-sonic-topography', visible);
  if (visible) buildSonicTopography();
}

function wallpaperById(id) {
  return state.wallpapers.find((wallpaper) => String(wallpaper.id) === String(id)) || null;
}

function visibleWallpapers() {
  const source = state.wallpaperSource === 'live' ? 'wallpaper-engine' : 'imported';
  return state.wallpapers.filter((wallpaper) => wallpaper && wallpaper.source === source);
}

function setWallpaperStatus(text) {
  if (els.wallpaperStatus) els.wallpaperStatus.textContent = text;
}

function updateWallpaperDiyVars() {
  if (els.wallpaperScene) {
    els.wallpaperScene.style.setProperty('--wallpaper-opacity', state.wallpaperOpacity.toFixed(2));
    els.wallpaperScene.style.setProperty('--wallpaper-brightness', state.wallpaperBrightness.toFixed(2));
    els.wallpaperScene.style.setProperty('--wallpaper-blur', `${Math.round(state.wallpaperBlur)}px`);
    els.wallpaperScene.dataset.wallpaperFit = state.wallpaperFitMode;
  }
  document.querySelectorAll('[data-wallpaper-fit]').forEach((button) => {
    const active = button.dataset.wallpaperFit === state.wallpaperFitMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (els.wallpaperOpacityRange) els.wallpaperOpacityRange.value = String(Math.round(state.wallpaperOpacity * 100));
  if (els.wallpaperOpacityValue) els.wallpaperOpacityValue.textContent = `${Math.round(state.wallpaperOpacity * 100)}%`;
  if (els.wallpaperBrightnessRange) els.wallpaperBrightnessRange.value = String(Math.round(state.wallpaperBrightness * 100));
  if (els.wallpaperBrightnessValue) els.wallpaperBrightnessValue.textContent = `${Math.round(state.wallpaperBrightness * 100)}%`;
  if (els.wallpaperBlurRange) els.wallpaperBlurRange.value = String(Math.round(state.wallpaperBlur));
  if (els.wallpaperBlurValue) els.wallpaperBlurValue.textContent = `${Math.round(state.wallpaperBlur)}px`;
  if (els.wallpaperScaleRange) els.wallpaperScaleRange.value = String(Math.round(state.wallpaperScale * 100));
  if (els.wallpaperScaleValue) els.wallpaperScaleValue.textContent = `${Math.round(state.wallpaperScale * 100)}%`;
}

function currentWallpaperIntrinsicSize() {
  if (els.wallpaperImage && !els.wallpaperImage.hidden && els.wallpaperImage.naturalWidth && els.wallpaperImage.naturalHeight) {
    return {
      width: els.wallpaperImage.naturalWidth,
      height: els.wallpaperImage.naturalHeight
    };
  }
  if (els.wallpaperVideo && !els.wallpaperVideo.hidden && els.wallpaperVideo.videoWidth && els.wallpaperVideo.videoHeight) {
    return {
      width: els.wallpaperVideo.videoWidth,
      height: els.wallpaperVideo.videoHeight
    };
  }
  return {
    width: state.wallpaperMediaWidth,
    height: state.wallpaperMediaHeight
  };
}

function scheduleWallpaperAutoSize() {
  if (wallpaperResizeFrame) return;
  wallpaperResizeFrame = window.requestAnimationFrame(() => {
    wallpaperResizeFrame = 0;
    updateWallpaperAutoSize();
  });
}

function initWallpaperAutoSizeObserver() {
  if (!els.wallpaperScene) return;
  if ('ResizeObserver' in window) {
    wallpaperResizeObserver = new ResizeObserver(scheduleWallpaperAutoSize);
    wallpaperResizeObserver.observe(els.wallpaperScene);
  } else {
    window.addEventListener('resize', scheduleWallpaperAutoSize, { passive: true });
  }
}

function updateWallpaperAutoSize() {
  if (!els.wallpaperScene) return;
  const rect = els.wallpaperScene.getBoundingClientRect();
  const sceneWidth = rect.width || window.innerWidth || document.documentElement.clientWidth || 0;
  const sceneHeight = rect.height || window.innerHeight || document.documentElement.clientHeight || 0;
  const intrinsic = currentWallpaperIntrinsicSize();
  const mediaWidth = intrinsic.width;
  const mediaHeight = intrinsic.height;
  const fitMode = normalizeWallpaperFitMode(state.wallpaperFitMode);
  const userScale = clamp(Number(state.wallpaperScale) || 1, 0.7, 1);
  const tileImage = fitMode === 'tile' && els.wallpaperImage && !els.wallpaperImage.hidden;

  els.wallpaperScene.classList.toggle('is-wallpaper-tile', !!tileImage);

  if (!sceneWidth || !sceneHeight || !mediaWidth || !mediaHeight) {
    els.wallpaperScene.style.setProperty('--wallpaper-fit', fitMode === 'stretch' ? 'fill' : 'cover');
    els.wallpaperScene.style.setProperty('--wallpaper-render-width', '100%');
    els.wallpaperScene.style.setProperty('--wallpaper-render-height', '100%');
    return;
  }

  const widthScale = sceneWidth / mediaWidth;
  const heightScale = sceneHeight / mediaHeight;
  let renderWidth = sceneWidth;
  let renderHeight = sceneHeight;

  if (fitMode === 'stretch') {
    els.wallpaperScene.style.setProperty('--wallpaper-fit', 'fill');
  } else if (fitMode === 'center' || fitMode === 'tile') {
    els.wallpaperScene.style.setProperty('--wallpaper-fit', 'contain');
    renderWidth = Math.max(1, Math.ceil(mediaWidth * userScale));
    renderHeight = Math.max(1, Math.ceil(mediaHeight * userScale));
  } else {
    const modeScale = fitMode === 'fill' ? Math.max(userScale, 1) : userScale;
    const fitScale = (fitMode === 'fit' ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale)) * modeScale;
    els.wallpaperScene.style.setProperty('--wallpaper-fit', 'contain');
    renderWidth = Math.max(1, Math.ceil(mediaWidth * fitScale));
    renderHeight = Math.max(1, Math.ceil(mediaHeight * fitScale));
  }
  els.wallpaperScene.style.setProperty('--wallpaper-render-width', `${renderWidth}px`);
  els.wallpaperScene.style.setProperty('--wallpaper-render-height', `${renderHeight}px`);
}

function setWallpaperFitMode(mode) {
  state.wallpaperFitMode = normalizeWallpaperFitMode(mode);
  updateWallpaperDiyVars();
  scheduleWallpaperAutoSize();
  saveWallpaperPrefs();
}

function setWallpaperMediaSize(width, height) {
  state.wallpaperMediaWidth = Number(width) || 0;
  state.wallpaperMediaHeight = Number(height) || 0;
  updateWallpaperAutoSize();
}

function applyWallpaperMedia(wallpaper) {
  if (!els.wallpaperImage || !els.wallpaperVideo || !els.wallpaperEmpty) return;
  const hasWallpaper = !!wallpaper && !!wallpaper.url;
  els.wallpaperEmpty.hidden = hasWallpaper;
  els.wallpaperImage.hidden = true;
  els.wallpaperVideo.hidden = true;
  els.wallpaperVideo.pause();
  els.wallpaperVideo.onerror = null;
  els.wallpaperVideo.oncanplay = null;
  els.wallpaperVideo.onloadedmetadata = null;
  els.wallpaperVideo.onloadeddata = null;
  els.wallpaperImage.onload = null;
  els.wallpaperImage.onerror = null;
  els.wallpaperVideo.removeAttribute('src');
  els.wallpaperVideo.load();
  els.wallpaperImage.removeAttribute('src');
  els.wallpaperScene?.style.removeProperty('--wallpaper-tile-image');
  setWallpaperMediaSize(0, 0);
  if (!hasWallpaper) return;

  if (wallpaper.kind === 'video') {
    els.wallpaperVideo.preload = 'metadata';
    els.wallpaperVideo.muted = true;
    els.wallpaperVideo.loop = true;
    els.wallpaperVideo.playsInline = true;
    els.wallpaperVideo.onloadedmetadata = () => setWallpaperMediaSize(els.wallpaperVideo.videoWidth, els.wallpaperVideo.videoHeight);
    els.wallpaperVideo.onerror = () => setWallpaperStatus('动态壁纸加载失败，可尝试切换实时壁纸或更换视频编码');
    els.wallpaperVideo.oncanplay = () => els.wallpaperVideo.play().catch(() => {});
    els.wallpaperVideo.src = wallpaper.url;
    els.wallpaperVideo.hidden = false;
    els.wallpaperVideo.load();
    els.wallpaperVideo.play().catch(() => {});
    return;
  }

  els.wallpaperImage.onload = () => setWallpaperMediaSize(els.wallpaperImage.naturalWidth, els.wallpaperImage.naturalHeight);
  els.wallpaperImage.onerror = () => setWallpaperStatus('壁纸图片加载失败，可尝试重新导入');
  els.wallpaperScene?.style.setProperty('--wallpaper-tile-image', `url(${JSON.stringify(wallpaper.url)})`);
  els.wallpaperImage.src = wallpaper.url;
  els.wallpaperImage.hidden = false;
}

function renderWallpaperList() {
  if (!els.wallpaperList) return;
  els.wallpaperList.textContent = '';
  const wallpapers = visibleWallpapers();
  const active = wallpapers.find((wallpaper) => String(wallpaper.id) === String(state.activeWallpaperId)) || wallpapers[0] || null;
  if (active && active.id !== state.activeWallpaperId) state.activeWallpaperId = active.id;
  applyWallpaperMedia(active);

  if (!wallpapers.length) {
    const empty = document.createElement('div');
    empty.className = 'diy-wallpaper-status';
    empty.textContent = state.wallpaperSource === 'live'
      ? '未识别到 Wallpaper Engine 库壁纸'
      : '没有已导入壁纸，先添加本地图片、GIF 或视频';
    els.wallpaperList.appendChild(empty);
    setWallpaperStatus(state.wallpaperSource === 'live' ? '实时壁纸为空' : '已导入壁纸为空');
    return;
  }

  wallpapers.forEach((wallpaper) => {
    const button = document.createElement('button');
    button.className = 'diy-wallpaper-item';
    button.type = 'button';
    button.dataset.wallpaperId = wallpaper.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(wallpaper.id === state.activeWallpaperId));
    button.classList.toggle('is-active', wallpaper.id === state.activeWallpaperId);

    const thumb = document.createElement('span');
    thumb.className = 'diy-wallpaper-thumb';
    if (wallpaper.kind === 'video') {
      const videoMark = document.createElement('span');
      videoMark.className = 'diy-wallpaper-video-mark';
      videoMark.textContent = '动态';
      thumb.appendChild(videoMark);
    } else {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = wallpaper.url;
      thumb.appendChild(image);
    }

    const copy = document.createElement('span');
    copy.className = 'diy-wallpaper-copy';
    const title = document.createElement('strong');
    title.textContent = safeText(wallpaper.name, 'Wallpaper');
    const source = document.createElement('small');
    source.textContent = wallpaper.source === 'wallpaper-engine' ? 'Wallpaper Engine' : '已导入';
    copy.appendChild(title);
    copy.appendChild(source);

    const kind = document.createElement('span');
    kind.className = 'diy-wallpaper-kind';
    kind.textContent = wallpaper.kind === 'video' ? '动态' : '图片';

    button.appendChild(thumb);
    button.appendChild(copy);
    button.appendChild(kind);
    button.addEventListener('click', () => selectWallpaper(wallpaper.id));
    els.wallpaperList.appendChild(button);
  });

  setWallpaperStatus(`${wallpapers.length} 个${state.wallpaperSource === 'live' ? '实时' : '已导入'}壁纸可用`);
}

function selectWallpaper(id) {
  const wallpaper = wallpaperById(id);
  if (!wallpaper) return;
  state.activeWallpaperId = wallpaper.id;
  saveWallpaperPrefs();
  renderWallpaperList();
}

async function refreshWallpapers(options = {}) {
  if (state.wallpaperLoading) return;
  if (options.source === 'live' || options.source === 'imported') state.wallpaperSource = options.source;
  state.wallpaperLoading = true;
  setWallpaperStatus(state.wallpaperSource === 'live' ? '正在识别 Wallpaper Engine 库...' : '正在加载已导入壁纸...');
  try {
    const scan = options.scan ?? state.wallpaperSource === 'live';
    const payload = await apiJson(`/api/wallpapers?${query({ scan })}`);
    state.wallpapers = Array.isArray(payload.wallpapers) ? payload.wallpapers : [];
    renderWallpaperList();
  } catch (error) {
    setWallpaperStatus(error.message || '壁纸加载失败');
  } finally {
    state.wallpaperLoading = false;
  }
}

async function importWallpaperFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  state.wallpaperSource = 'imported';
  setWallpaperStatus('正在导入壁纸...');
  for (const file of list) {
    setWallpaperStatus(`正在导入 ${file.name}...`);
    const response = await fetch(`/api/wallpapers/import?${query({ name: file.name })}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `导入失败: ${file.name}`);
    }
    if (payload.wallpaper) state.activeWallpaperId = payload.wallpaper.id;
  }
  await refreshWallpapers({ source: 'imported', scan: false });
  saveWallpaperPrefs();
}

function updateWallpaperVisibility() {
  const visible = state.playbackPage && state.diyPreset === 'wallpaper';
  if (els.wallpaperScene) els.wallpaperScene.hidden = !visible;
  els.appShell.classList.toggle('has-wallpaper-mode', visible);
  if (visible) updateWallpaperAutoSize();
  if (visible && !state.wallpapers.length && !state.wallpaperLoading) refreshWallpapers({ source: state.wallpaperSource });
  if (!visible && els.wallpaperVideo) els.wallpaperVideo.pause();
  if (visible && els.wallpaperVideo && !els.wallpaperVideo.hidden) els.wallpaperVideo.play().catch(() => {});
}

function addSonicTopographyRipple(x, z, strength = 1, white = false) {
  const topo = state.sonicTopography;
  if (!topo.ripples.length) return;
  const index = topo.rippleIndex % topo.ripples.length;
  const ripple = topo.ripples[index];
  ripple.pos.set(
    clamp(x, -SONIC_TOPOGRAPHY_HALF, SONIC_TOPOGRAPHY_HALF),
    clamp(z, -SONIC_TOPOGRAPHY_HALF, SONIC_TOPOGRAPHY_HALF)
  );
  ripple.time = performance.now() / 1000;
  ripple.strength = clamp(strength, 0.14, 4);
  ripple.isActive = 1;
  ripple.rippleType = white ? 1 : 0;
  topo.rippleIndex = (index + 1) % topo.ripples.length;
}

function addSonicTopographyPointerRipple(event) {
  const topo = state.sonicTopography;
  if (!topo.built || state.diyPreset !== 'topography' || !topo.camera || !window.THREE) return;
  const THREE = window.THREE;
  const rect = els.stage.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
  );
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  raycaster.setFromCamera(pointer, topo.camera);
  if (!raycaster.ray.intersectPlane(ground, point)) return;
  const held = performance.now() - (state.playbackVisual.pressStartedAt || performance.now());
  const strength = 0.55 + Math.min(2.4, held / 560);
  addSonicTopographyRipple(point.x, point.z, strength, false);
}

function spawnSonicTopographyParticle(x, y, z, speed) {
  const topo = state.sonicTopography;
  if (!topo.particles.length) return;
  const index = topo.particleIndex % topo.particles.length;
  const particle = topo.particles[index];
  particle.active = true;
  particle.x = x + (Math.random() - 0.5) * 1.5;
  particle.y = y + (Math.random() - 0.5) * 1.5;
  particle.z = z + (Math.random() - 0.5) * 1.5;
  particle.vx = (Math.random() - 0.5) * 2;
  particle.vy = Math.random() * 2 + speed * 10;
  particle.vz = (Math.random() - 0.5) * 2;
  particle.life = 0;
  particle.maxLife = 0.5 + Math.random() * 0.5;
  particle.scale = Math.random() * 0.6 + 0.2;
  topo.particleIndex = (index + 1) % topo.particles.length;
}

function spawnSonicTopographyMeteor(strength = 1) {
  const topo = state.sonicTopography;
  const now = performance.now();
  if (!topo.meteors.length || now - topo.lastMeteorAt < 440) return;
  topo.lastMeteorAt = now;
  const index = topo.meteorIndex % topo.meteors.length;
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * 25;
  const meteor = topo.meteors[index];
  meteor.active = true;
  meteor.x = Math.cos(angle) * distance;
  meteor.z = Math.sin(angle) * distance;
  meteor.y = 30 + Math.random() * 10;
  meteor.speed = 1 + Math.random() * 0.5 + strength * 1.5;
  meteor.strength = strength;
  topo.meteorIndex = (index + 1) % topo.meteors.length;
}

function updateSonicTopographyProjectiles(dt) {
  const topo = state.sonicTopography;
  const dummy = topo.dummy;
  if (!dummy || !topo.meteorMesh || !topo.particleMesh) return;
  for (let i = 0; i < topo.meteors.length; i += 1) {
    const meteor = topo.meteors[i];
    if (!meteor.active) {
      dummy.position.set(0, -1000, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      topo.meteorMesh.setMatrixAt(i, dummy.matrix);
      continue;
    }
    meteor.y -= meteor.speed * 60 * dt;
    if (meteor.y <= 0) {
      meteor.active = false;
      addSonicTopographyRipple(meteor.x, meteor.z, Math.min(meteor.strength, 1.2), true);
      for (let p = 0; p < 10; p += 1) spawnSonicTopographyParticle(meteor.x, 0.5, meteor.z, meteor.speed * 1.5);
      dummy.position.set(0, -1000, 0);
      dummy.scale.set(0, 0, 0);
    } else {
      if (Math.random() > 0.3) spawnSonicTopographyParticle(meteor.x, meteor.y, meteor.z, meteor.speed * 0.2);
      dummy.position.set(meteor.x, Math.max(0, meteor.y), meteor.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.5, 1.5, 1.5);
    }
    dummy.updateMatrix();
    topo.meteorMesh.setMatrixAt(i, dummy.matrix);
  }
  topo.meteorMesh.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < topo.particles.length; i += 1) {
    const particle = topo.particles[i];
    if (!particle.active) {
      dummy.position.set(0, -1000, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      topo.particleMesh.setMatrixAt(i, dummy.matrix);
      continue;
    }
    particle.life += dt;
    if (particle.life >= particle.maxLife) {
      particle.active = false;
      dummy.position.set(0, -1000, 0);
      dummy.scale.set(0, 0, 0);
    } else {
      particle.x += particle.vx * dt * 10;
      particle.y += particle.vy * dt * 10;
      particle.z += particle.vz * dt * 10;
      const fade = 1 - particle.life / particle.maxLife;
      const scale = particle.scale * fade;
      dummy.position.set(particle.x, particle.y, particle.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(scale, scale, scale);
    }
    dummy.updateMatrix();
    topo.particleMesh.setMatrixAt(i, dummy.matrix);
  }
  topo.particleMesh.instanceMatrix.needsUpdate = true;
}

function resetSonicTopographyAudioMotion(topo) {
  if (!topo) return;
  topo.lastBeat = 0;
  topo.pulseCooldown = 0;
  topo.meteorCooldown = 0;
  topo.ripples.forEach((ripple) => {
    ripple.strength = 0;
    ripple.isActive = 0;
    ripple.time = -100;
  });
  topo.meteors.forEach((meteor) => {
    meteor.active = false;
    meteor.y = -1000;
  });
  topo.particles.forEach((particle) => {
    particle.active = false;
    particle.y = -1000;
  });
}

function updateSonicTopographyMotion() {
  const topo = state.sonicTopography;
  if (!state.playbackPage || state.diyPreset !== 'topography' || !topo.uniforms || !topo.renderer || !topo.scene || !topo.camera) return;
  const nowMs = performance.now();
  if (RENDER_PROFILE.topographyFrameGapMs && topo.lastRenderAt && nowMs - topo.lastRenderAt < RENDER_PROFILE.topographyFrameGapMs) return;
  topo.lastRenderAt = nowMs;
  const now = nowMs / 1000;
  const dt = topo.lastMotionAt ? clamp((nowMs - topo.lastMotionAt) / 1000, 0.008, 0.04) : 0.016;
  topo.lastMotionAt = nowMs;

  const audioDriving = Boolean(els.audio.src && !els.audio.paused && !els.audio.ended);
  const live = audioDriving
    ? (state.audioAnalysis.live ? state.audioAnalysis : state.visual)
    : null;
  const audio = {
    subBass: audioDriving ? clamp(live.subBass || 0, 0, 1) : 0,
    bass: audioDriving ? clamp(live.bass || 0, 0, 1) : 0,
    lowMid: audioDriving ? clamp(live.lowMid || 0, 0, 1) : 0,
    mid: audioDriving ? clamp(live.mid || 0, 0, 1) : 0,
    highMid: audioDriving ? clamp(live.highMid || 0, 0, 1) : 0,
    presence: audioDriving ? clamp(live.presence || 0, 0, 1) : 0,
    brilliance: audioDriving ? clamp(live.brilliance || 0, 0, 1) : 0,
    air: audioDriving ? clamp(live.air || 0, 0, 1) : 0,
    energy: audioDriving ? clamp(live.energy || 0, 0, 1) : 0,
    warmth: audioDriving ? clamp(live.warmth || 0, 0, 1) : 0,
    brightness: audioDriving ? clamp(live.brightness || 0, 0, 1) : 0,
    sharpness: audioDriving ? clamp(live.sharpness || 0, 0, 1) : 0,
    smoothness: audioDriving ? clamp(live.smoothness == null ? 0.7 : live.smoothness, 0, 1) : 0.7,
    density: audioDriving ? clamp(live.density || 0, 0, 1) : 0,
    spectralCentroid: audioDriving ? Number(live.spectralCentroid) || 0 : 0,
    fluxPulse: audioDriving ? Number(live.fluxPulse) || 0 : 0,
    fluxMeteor: audioDriving ? Number(live.fluxMeteor) || 0 : 0,
    beat: audioDriving ? clamp(state.visual.beat || 0, 0, 1) : 0
  };
  if (audioDriving) {
    topo.idleTone = {
      presence: audio.presence,
      brilliance: audio.brilliance,
      air: audio.air,
      warmth: audio.warmth,
      brightness: audio.brightness
    };
  } else {
    const idleTone = topo.idleTone || {};
    audio.presence = clamp(idleTone.presence ?? 0.16, 0.08, 0.42);
    audio.brilliance = clamp(idleTone.brilliance ?? 0.12, 0.06, 0.36);
    audio.air = clamp(idleTone.air ?? 0.18, 0.08, 0.44);
    audio.energy = 0.08;
    audio.warmth = clamp(idleTone.warmth ?? 0.46, 0.22, 0.72);
    audio.brightness = clamp(idleTone.brightness ?? 0.34, 0.18, 0.62);
    audio.smoothness = 0.86;
  }

  const uniforms = topo.uniforms;
  uniforms.uTime.value = now;
  uniforms.uSubBass.value = audio.subBass;
  uniforms.uBass.value = audio.bass;
  uniforms.uLowMid.value = audio.lowMid;
  uniforms.uMid.value = audio.mid;
  uniforms.uHighMid.value = audio.highMid;
  uniforms.uPresence.value = audio.presence;
  uniforms.uBrilliance.value = audio.brilliance;
  uniforms.uAir.value = audio.air;
  uniforms.uEnergy.value = audio.energy;
  uniforms.uWarmth.value = audio.warmth;
  uniforms.uBrightness.value = audio.brightness;
  uniforms.uSharpness.value = audio.sharpness;
  uniforms.uSmoothness.value = audio.smoothness;
  uniforms.uDensity.value = audio.density;
  uniforms.uSpectralCentroid.value = audio.spectralCentroid;
  const targetIdleBreath = audioDriving ? 0.015 : (reducedMotion ? 0.035 : 0.145);
  uniforms.uIdleBreath.value += (targetIdleBreath - uniforms.uIdleBreath.value) * clamp(dt * 3.5, 0, 1);

  const theme = topo.theme || createSonicTopographyTheme(topo.palette || fallbackLyricPalette(state.currentSong));
  const lerpSpeed = clamp(3 * dt, 0, 1);
  uniforms.uBaseColor1.value.lerp(theme.uBaseColor1, lerpSpeed);
  uniforms.uBaseColor2.value.lerp(theme.uBaseColor2, lerpSpeed);
  uniforms.uCoolCore.value.lerp(theme.uCoolCore, lerpSpeed);
  uniforms.uCoolEdge.value.lerp(theme.uCoolEdge, lerpSpeed);
  uniforms.uWarmCore.value.lerp(theme.uWarmCore, lerpSpeed);
  uniforms.uWarmEdge.value.lerp(theme.uWarmEdge, lerpSpeed);
  uniforms.uRippleColor.value.lerp(theme.uRippleColor, lerpSpeed);
  uniforms.uGlowIntensity.value += (theme.uGlowIntensity - uniforms.uGlowIntensity.value) * lerpSpeed;

  if (topo.scene.fog && topo.scene.fog.color) {
    topo.scene.fog.color.lerp(theme.uBaseColor1, lerpSpeed);
  }
  if (topo.meteorMaterial && topo.meteorMaterial.color) {
    topo.meteorMaterial.color.lerp(theme.uWarmCore.clone().lerp(new window.THREE.Color(0xffffff), 0.7), lerpSpeed);
  }
  if (topo.particleMaterial && topo.particleMaterial.color && topo.meteorMaterial && topo.meteorMaterial.color) {
    topo.particleMaterial.color.copy(topo.meteorMaterial.color);
  }

  const lowBassDrive = clamp(Math.max(audio.subBass * 1.25, audio.bass), 0, 1);
  if (!audioDriving) {
    if (topo.wasAudioDriving) resetSonicTopographyAudioMotion(topo);
    topo.wasAudioDriving = false;
    topo.audioPulse += (0 - topo.audioPulse) * clamp(dt * 5.2, 0, 1);
  } else {
    topo.wasAudioDriving = true;
    if (topo.pulseCooldown > 0) topo.pulseCooldown -= 1;
    if (topo.meteorCooldown > 0) topo.meteorCooldown -= 1;
    const lowBassTransient = Math.max(0, lowBassDrive - topo.lastBeat);
    const pulseStrength = clamp(Math.max(audio.fluxPulse * 1.45, lowBassTransient * 2.2, audio.beat * lowBassDrive * 0.72), 0, 1);
    const pulseRate = pulseStrength > topo.audioPulse ? 0.34 : 0.075;
    topo.audioPulse += (pulseStrength - topo.audioPulse) * pulseRate;
    if (topo.pulseCooldown <= 0 && lowBassDrive > 0.075 && pulseStrength > 0.13) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 25;
      addSonicTopographyRipple(Math.cos(angle) * distance, Math.sin(angle) * distance, Math.min(0.42 + pulseStrength * 1.65, 2.1), false);
      topo.pulseCooldown = 42;
    }
    const meteorStrength = clamp(Math.max(audio.fluxMeteor * lowBassDrive * 0.9, audio.beat * lowBassDrive * 0.42), 0, 1);
    if (topo.meteorCooldown <= 0 && meteorStrength > 0.3) {
      spawnSonicTopographyMeteor(clamp(meteorStrength * 1.25, 0.2, 1.45));
      topo.meteorCooldown = 260;
    }
    topo.lastBeat += (lowBassDrive - topo.lastBeat) * 0.24;
  }
  uniforms.uAudioPulse.value = clamp(topo.audioPulse || 0, 0, 1);

  resizeSonicTopographyRenderer();
  if (els.sonicTopographyScene) {
    els.sonicTopographyScene.style.setProperty('--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
    els.sonicTopographyScene.style.setProperty('--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
    els.sonicTopographyScene.style.setProperty('--topography-glow-alpha', (0.1 + audio.energy * 0.18 + lowBassDrive * 0.52).toFixed(3));
  }

  if (!state.playbackVisual.dragging && !reducedMotion) topo.autoYaw += dt * 0.05;
  const baseRadius = Math.hypot(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  const radius = baseRadius / clamp(state.playbackVisual.zoom || 1, 0.58, 2.35);
  const baseAzimuth = Math.atan2(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.z);
  const baseElevation = Math.asin(SONIC_TOPOGRAPHY_CAMERA.y / baseRadius);
  const yaw = baseAzimuth + topo.autoYaw + (state.playbackVisual.yaw - PLAYBACK_REST_YAW) * 0.72;
  const elevation = clamp(baseElevation + (state.playbackVisual.pitch - PLAYBACK_REST_PITCH) * 0.48, 0.1, Math.PI / 2 - 0.1);
  const horizontalRadius = Math.cos(elevation) * radius;
  topo.camera.position.set(
    Math.sin(yaw) * horizontalRadius,
    Math.sin(elevation) * radius,
    Math.cos(yaw) * horizontalRadius
  );
  topo.camera.lookAt(0, 0, 0);

  updateSonicTopographyProjectiles(dt);
  topo.renderer.render(topo.scene, topo.camera);
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  if (sat === 0) {
    const value = Math.round(light * 255);
    return { r: value, g: value, b: value };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const convert = (t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  return {
    r: Math.round(convert(hue + 1 / 3) * 255),
    g: Math.round(convert(hue) * 255),
    b: Math.round(convert(hue - 1 / 3) * 255)
  };
}

function mixRgb(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function rgbCss(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function relativeLuminance(color) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function readableLyricColor(color, mixAmount = 0.34) {
  const lifted = mixRgb(color, { r: 255, g: 255, b: 255 }, mixAmount);
  if (relativeLuminance(lifted) < 0.62) return mixRgb(lifted, { r: 255, g: 255, b: 255 }, 0.28);
  return lifted;
}

function lyricPaletteFromBase(base) {
  return {
    primary: readableLyricColor(base, 0.26),
    glow: mixRgb(base, { r: 255, g: 255, b: 255 }, 0.16),
    highlight: readableLyricColor(base, 0.5),
    depth: mixRgb(base, { r: 0, g: 0, b: 0 }, 0.68)
  };
}

function proxiedImageUrl(url) {
  return url ? `/api/cover?url=${encodeURIComponent(url)}` : '';
}

function coverUrl(song) {
  if (!song || !song.cover) return '';
  return proxiedImageUrl(song.cover);
}

function setImage(img, song) {
  const url = coverUrl(song);
  const frame = img.parentElement;
  if (!url) {
    img.removeAttribute('src');
    frame.classList.remove('has-cover');
    return;
  }
  img.src = url;
  frame.classList.add('has-cover');
}

function fallbackLyricPalette(song = state.currentSong) {
  const seedText = safeText(song && (song.title || song.artist || song.album), 'FE Monster');
  let hash = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    hash = (hash * 31 + seedText.charCodeAt(index)) >>> 0;
  }
  const base = hslToRgb(185 + (hash % 96), 0.82, 0.62);
  return lyricPaletteFromBase(base);
}

function sampleCoverPalette(img) {
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const canvas = document.createElement('canvas');
  const size = 28;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(img, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let total = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let best = { r: 131, g: 228, b: 255 };
    let bestScore = -1;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 64) continue;
      const cr = data[index];
      const cg = data[index + 1];
      const cb = data[index + 2];
      const max = Math.max(cr, cg, cb);
      const min = Math.min(cr, cg, cb);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
      const score = saturation * 1.55 + Math.abs(luminance - 0.58) * -0.52 + luminance * 0.18;
      r += cr;
      g += cg;
      b += cb;
      total += 1;
      if (score > bestScore) {
        bestScore = score;
        best = { r: cr, g: cg, b: cb };
      }
    }
    if (!total) return null;
    const average = { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) };
    const base = mixRgb(best, average, 0.28);
    return lyricPaletteFromBase(base);
  } catch (error) {
    return null;
  }
}

function rgbTriplet(color) {
  return `${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}`;
}

function vividCubeColor(color, whiteMix = 0.08, saturationBoost = 1.22) {
  const lifted = mixRgb(color, { r: 255, g: 255, b: 255 }, whiteMix);
  const average = (lifted.r + lifted.g + lifted.b) / 3;
  return {
    r: clamp(Math.round(average + (lifted.r - average) * saturationBoost), 0, 255),
    g: clamp(Math.round(average + (lifted.g - average) * saturationBoost), 0, 255),
    b: clamp(Math.round(average + (lifted.b - average) * saturationBoost), 0, 255)
  };
}

function applyDynamicCubePalette(palette) {
  if (!palette) return;
  const cube = state.dynamicCube;
  cube.palette = palette;

  if (els.dynamicCubeScene) {
    els.dynamicCubeScene.style.setProperty('--cube-cover-glow', rgbTriplet(palette.glow));
    els.dynamicCubeScene.style.setProperty('--cube-cover-hot', rgbTriplet(palette.highlight));
    els.dynamicCubeScene.style.setProperty('--cube-cover-depth', rgbTriplet(palette.depth));
  }

  if (!cube.mesh || !cube.positions || typeof cube.mesh.setColorAt !== 'function' || !window.THREE) return;

  const THREE = window.THREE;
  const white = { r: 255, g: 255, b: 255 };
  const base = vividCubeColor(palette.primary, 0.06, 1.28);
  const glow = vividCubeColor(palette.glow, 0.04, 1.34);
  const highlight = mixRgb(vividCubeColor(palette.highlight, 0.12, 1.18), white, 0.1);
  const depth = vividCubeColor(mixRgb(palette.depth, palette.primary, 0.24), 0.02, 1.18);
  const half = Math.max(1, DYNAMIC_CUBE_RADIUS);
  const planeSize = DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID;
  const color = cube.color || new THREE.Color();
  cube.color = color;

  if (cube.mesh.material) {
    cube.mesh.material.vertexColors = true;
    cube.mesh.material.color.setRGB(1, 1, 1);
    if (cube.mesh.material.emissive) {
      cube.mesh.material.emissive.setRGB(glow.r / 255, glow.g / 255, glow.b / 255);
    }
    cube.mesh.material.emissiveIntensity = 0.085 + relativeLuminance(glow) * 0.1;
    cube.mesh.material.needsUpdate = true;
  }

  for (let index = 0; index < cube.count; index += 1) {
    const x = Math.floor(index / planeSize);
    const yz = index - x * planeSize;
    const y = Math.floor(yz / DYNAMIC_CUBE_GRID);
    const z = yz - y * DYNAMIC_CUBE_GRID;
    const offset = index * 3;
    const nx = Math.abs(cube.positions[offset] / half);
    const ny = Math.abs(cube.positions[offset + 1] / half);
    const nz = Math.abs(cube.positions[offset + 2] / half);
    const edge = Math.max(nx, ny, nz);
    const surface = (nx * 0.42 + ny * 0.34 + nz * 0.24) / Math.max(0.001, nx + ny + nz);
    const checker = (x + y + z) % 2 === 0 ? 0.055 : -0.035;
    const stripe = ((x * 17 + y * 11 + z * 5) % 29) / 28;
    const topLight = (DYNAMIC_CUBE_GRID - 1 - y) / (DYNAMIC_CUBE_GRID - 1);
    let tone = mixRgb(base, glow, clamp(0.16 + edge * 0.26 + surface * 0.12 + stripe * 0.1 + checker, 0.06, 0.58));
    tone = mixRgb(tone, highlight, clamp(topLight * 0.13 + edge * 0.045, 0, 0.22));
    tone = mixRgb(tone, depth, clamp(z / (DYNAMIC_CUBE_GRID - 1) * 0.16 + (1 - edge) * 0.05, 0, 0.24));

    const lift = clamp(0.88 + checker + edge * 0.09 + topLight * 0.06, 0.72, 1.08);
    color.setRGB(
      clamp((tone.r * lift) / 255, 0, 1),
      clamp((tone.g * lift) / 255, 0, 1),
      clamp((tone.b * lift) / 255, 0, 1)
    );
    cube.mesh.setColorAt(index, color);
  }

  if (cube.mesh.instanceColor) {
    cube.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    cube.mesh.instanceColor.needsUpdate = true;
  }
}

function applySonicTopographyPalette(palette) {
  if (!palette || !window.THREE) return;
  const topo = state.sonicTopography;
  topo.palette = palette;
  topo.theme = createSonicTopographyTheme(palette);

  if (els.sonicTopographyScene) {
    els.sonicTopographyScene.style.setProperty('--topography-cover-glow', rgbTriplet(palette.glow));
    els.sonicTopographyScene.style.setProperty('--topography-cover-hot', rgbTriplet(palette.highlight));
    els.sonicTopographyScene.style.setProperty('--topography-cover-depth', rgbTriplet(palette.depth));
  }

  if (!topo.uniforms || !topo.theme) return;
  topo.uniforms.uBaseColor1.value.copy(topo.theme.uBaseColor1);
  topo.uniforms.uBaseColor2.value.copy(topo.theme.uBaseColor2);
  topo.uniforms.uCoolCore.value.copy(topo.theme.uCoolCore);
  topo.uniforms.uCoolEdge.value.copy(topo.theme.uCoolEdge);
  topo.uniforms.uWarmCore.value.copy(topo.theme.uWarmCore);
  topo.uniforms.uWarmEdge.value.copy(topo.theme.uWarmEdge);
  topo.uniforms.uRippleColor.value.copy(topo.theme.uRippleColor);
  topo.uniforms.uGlowIntensity.value = topo.theme.uGlowIntensity;
  if (topo.scene && topo.scene.fog && topo.scene.fog.color) {
    topo.scene.fog.color.copy(topo.theme.uBaseColor1);
  }
  if (topo.meteorMaterial && topo.meteorMaterial.color) {
    topo.meteorMaterial.color.copy(topo.theme.uWarmCore).lerp(new window.THREE.Color(0xffffff), 0.7);
  }
  if (topo.particleMaterial && topo.particleMaterial.color && topo.meteorMaterial && topo.meteorMaterial.color) {
    topo.particleMaterial.color.copy(topo.meteorMaterial.color);
  }
}

function applyLyricPalette(palette) {
  if (!palette) return;
  const target = els.playbackLyricScene;
  if (target) {
    const white = { r: 255, g: 255, b: 255 };
    const gradientStart = mixRgb(palette.highlight, white, 0.12);
    const gradientMid = mixRgb(palette.glow, white, 0.04);
    const gradientEnd = mixRgb(palette.primary, palette.depth, 0.14);
    const gradientTail = mixRgb(palette.depth, palette.primary, 0.22);
    const bookSoftA = mixRgb(palette.primary, palette.glow, 0.34);
    const bookSoftB = mixRgb(palette.highlight, palette.glow, 0.42);
    const bookSoftBase = mixRgb(palette.depth, palette.primary, 0.2);
    target.style.setProperty('--lyric-primary', rgbCss(palette.primary));
    target.style.setProperty('--lyric-glow', rgbCss(palette.glow));
    target.style.setProperty('--lyric-highlight', rgbCss(palette.highlight));
    target.style.setProperty('--lyric-depth', rgbCss(palette.depth));
    target.style.setProperty('--lyric-glow-soft', rgbCss(palette.glow, 0.26));
    target.style.setProperty('--lyric-glow-hot', rgbCss(palette.highlight, 0.3));
    target.style.setProperty('--lyric-gradient-start', rgbCss(gradientStart));
    target.style.setProperty('--lyric-gradient-mid', rgbCss(gradientMid));
    target.style.setProperty('--lyric-gradient-end', rgbCss(gradientEnd));
    target.style.setProperty('--lyric-gradient-tail', rgbCss(gradientTail, 0.34));
    target.style.setProperty('--lyric-gradient-shadow', rgbCss(palette.depth, 0.88));
    [target, els.appShell].filter(Boolean).forEach((bookTarget) => {
      bookTarget.style.setProperty('--book-glow', rgbCss(palette.glow));
      bookTarget.style.setProperty('--book-glow-soft', rgbCss(palette.glow, 0.26));
      bookTarget.style.setProperty('--book-hot', rgbCss(palette.highlight));
      bookTarget.style.setProperty('--book-depth', rgbCss(palette.depth));
      bookTarget.style.setProperty('--book-page', rgbCss(mixRgb(palette.depth, palette.primary, 0.18), 0.58));
      bookTarget.style.setProperty('--book-soft-a', rgbCss(bookSoftA, 0.72));
      bookTarget.style.setProperty('--book-soft-b', rgbCss(bookSoftB, 0.62));
      bookTarget.style.setProperty('--book-soft-base', rgbCss(bookSoftBase, 0.94));
    });
  }
  applyDynamicCubePalette(palette);
  applySonicTopographyPalette(palette);
}

function applyCoverSample(img, signature) {
  if (signature !== state.playbackVisual.coverSignature) return false;
  const palette = sampleCoverPalette(img);
  if (!palette) return false;
  applyLyricPalette(palette);
  return true;
}

function loadCoverPalette(url, signature) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.addEventListener('load', () => applyCoverSample(img, signature), { once: true });
  img.src = url;
}

function updateLyricPalette(song = state.currentSong) {
  const url = coverUrl(song);
  const signature = `${url}|${safeText(song && song.title, '')}`;
  if (signature === state.playbackVisual.coverSignature) return;
  state.playbackVisual.coverSignature = signature;
  applyLyricPalette(fallbackLyricPalette(song));
  const img = els.dockCover;
  const applySample = () => {
    if (!applyCoverSample(img, signature)) loadCoverPalette(url, signature);
  };
  if (img && img.complete && img.naturalWidth) {
    window.requestAnimationFrame(applySample);
  } else if (img) {
    img.addEventListener('load', applySample, { once: true });
    img.addEventListener('error', () => loadCoverPalette(url, signature), { once: true });
  } else {
    loadCoverPalette(url, signature);
  }
}

function updateBookLyricCover(song = state.currentSong) {
  if (!els.bookLyricCover || !els.bookLyricCoverImage) return;
  const url = coverUrl(song);
  if (!url) {
    els.bookLyricCoverImage.removeAttribute('src');
    els.bookLyricCover.classList.remove('has-cover');
    return;
  }
  if (els.bookLyricCoverImage.getAttribute('src') !== url) els.bookLyricCoverImage.src = url;
  els.bookLyricCover.classList.add('has-cover');
}

function bookLyricDisplayLines() {
  if (state.lyricLines.length) return state.lyricLines;
  return [{
    time: 0,
    text: playbackLyricText(),
    fallback: true
  }];
}

function bookLyricSignature(lines) {
  const first = lines[0] || {};
  const last = lines[lines.length - 1] || {};
  return [
    state.lyricSignature,
    lines.length,
    safeText(first.text, ''),
    Number(first.time) || 0,
    safeText(last.text, ''),
    Number(last.time) || 0
  ].join('|');
}

function renderBookLyricLines(force = false) {
  if (!els.bookLyricList) return;
  const lines = bookLyricDisplayLines();
  const signature = bookLyricSignature(lines);
  if (!force && state.lyricBookSignature === signature) return;
  state.lyricBookSignature = signature;
  state.lyricBookIndex = -2;
  state.lyricBookCurrentLine = null;
  clearElement(els.bookLyricList);

  lines.forEach((line, index) => {
    const button = document.createElement('button');
    button.className = 'book-lyric-line';
    button.type = 'button';
    button.dataset.bookLyricIndex = String(index);
    button.dataset.bookLyricTime = String(Number(line.time) || 0);
    button.dataset.text = safeText(line.text, playbackLyricText());
    button.setAttribute('aria-label', `${formatTime(Number(line.time) || 0)} ${safeText(line.text, '')}`);

    const text = document.createElement('span');
    text.className = 'book-lyric-line-text';
    const lyricText = safeText(line.text, playbackLyricText());
    const base = document.createElement('span');
    base.className = 'book-lyric-copy book-lyric-copy--base';
    base.textContent = lyricText;
    const highlight = document.createElement('span');
    highlight.className = 'book-lyric-copy book-lyric-copy--hot';
    highlight.textContent = lyricText;
    highlight.setAttribute('aria-hidden', 'true');
    text.appendChild(base);
    text.appendChild(highlight);
    button.appendChild(text);
    els.bookLyricList.appendChild(button);
  });
}

function updateBookLyricLines(progressPercent = state.lyricProgressPercent) {
  if (!els.bookLyricList || state.textPreset !== 'book') return;
  renderBookLyricLines();
  const lines = bookLyricDisplayLines();
  const active = state.lyricLines.length ? clamp(state.lyricIndex, 0, Math.max(0, lines.length - 1)) : 0;
  const progressValue = clamp(Number(progressPercent) || 0, 0, 100);
  const progress = `${progressValue.toFixed(2)}%`;
  let current = state.lyricBookCurrentLine;

  if (state.lyricBookIndex !== active) {
    state.lyricBookIndex = active;
    state.lyricBookCurrentLine = null;
    els.bookLyricList.querySelectorAll('.book-lyric-line').forEach((line) => {
      const index = Number(line.dataset.bookLyricIndex) || 0;
      const distance = Math.min(6, Math.abs(index - active));
      const isCurrent = index === active;
      line.classList.toggle('is-current', isCurrent);
      line.classList.toggle('is-past', index < active);
      line.classList.toggle('is-future', index > active);
      line.style.setProperty('--book-line-distance', distance.toFixed(0));
      line.style.setProperty('--book-line-progress', isCurrent ? progress : '0%');
      if (isCurrent) {
        current = line;
        state.lyricBookCurrentLine = line;
        line.setAttribute('aria-current', 'true');
      } else {
        line.removeAttribute('aria-current');
      }
    });

    if (current && typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: state.orb.reducedMotion ? 'auto' : 'smooth' });
    }
  } else {
    if (!current || Number(current.dataset.bookLyricIndex) !== active) {
      current = els.bookLyricList.querySelector(`.book-lyric-line[data-book-lyric-index="${active}"]`);
      state.lyricBookCurrentLine = current;
    }
  }

  if (current) {
    current.style.setProperty('--book-line-progress', progress);
  }
}

function seekToBookLyric(time) {
  const target = Math.max(0, Number(time) || 0);
  if (!els.audio) return;
  try {
    els.audio.currentTime = target;
    updateProgress();
  } catch (error) {
  }
  apiJson(`/api/player/seek?${query({ position: Math.round(target) })}`).catch(() => {});
}

function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function compactCount(value) {
  const count = Number(value) || 0;
  if (count >= 100000000) return `${(count / 100000000).toFixed(count >= 1000000000 ? 0 : 1)}\u4ebf`;
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}\u4e07`;
  return String(count);
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function removeElement(element) {
  if (element && element.parentNode) element.parentNode.removeChild(element);
}

function emptyFavoriteDirectories() {
  return Object.keys(MUSIC_PROVIDERS).reduce((directories, provider) => {
    directories[provider] = [];
    return directories;
  }, {});
}

function normalizeStoredFavorite(song, fallbackProvider) {
  if (!song || typeof song !== 'object') return null;
  const provider = MUSIC_PROVIDERS[song.provider] ? song.provider : fallbackProvider;
  const id = song.id === undefined || song.id === null ? '' : String(song.id);
  const title = song.title === undefined || song.title === null ? '' : String(song.title);
  if (!id && !title) return null;
  return {
    id,
    title: title || '未命名歌曲',
    artist: song.artist === undefined || song.artist === null ? '' : String(song.artist),
    album: song.album === undefined || song.album === null ? '' : String(song.album),
    cover: song.cover === undefined || song.cover === null ? '' : String(song.cover),
    duration: Number(song.duration) || 0,
    provider
  };
}

function loadFavoriteDirectories() {
  const directories = emptyFavoriteDirectories();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITE_SONGS_KEY) || '{}');
    Object.keys(directories).forEach((provider) => {
      const songs = Array.isArray(parsed && parsed[provider]) ? parsed[provider] : [];
      directories[provider] = songs
        .map((song) => normalizeStoredFavorite(song, provider))
        .filter(Boolean);
    });
  } catch (error) {
    return directories;
  }
  return directories;
}

function saveFavoriteDirectories() {
  try {
    window.localStorage.setItem(FAVORITE_SONGS_KEY, JSON.stringify(state.favoriteDirectories));
  } catch (error) {
    toast('收藏目录保存失败');
  }
}

function loadCommunityBio() {
  try {
    return safeText(window.localStorage.getItem(COMMUNITY_BIO_KEY), '').slice(0, 180);
  } catch (error) {
    return '';
  }
}

function saveCommunityBioLocal(value) {
  state.community.profileBio = safeText(value, '').slice(0, 180);
  try {
    window.localStorage.setItem(COMMUNITY_BIO_KEY, state.community.profileBio);
  } catch (error) {}
}

function loadCommunityMessageDnd() {
  try {
    return window.localStorage.getItem(COMMUNITY_MESSAGE_DND_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

function saveCommunityMessageDnd(value) {
  state.community.messageBubbleMuted = !!value;
  try {
    window.localStorage.setItem(COMMUNITY_MESSAGE_DND_KEY, String(state.community.messageBubbleMuted));
  } catch (error) {}
}

function loadCommunityCardCollapsed() {
  try {
    return window.localStorage.getItem(COMMUNITY_CARD_COLLAPSED_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

function saveCommunityCardCollapsed(value) {
  try {
    window.localStorage.setItem(COMMUNITY_CARD_COLLAPSED_KEY, String(!!value));
  } catch (error) {}
}

function loadCommunityFavoriteListening() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMUNITY_FAVORITE_LISTEN_KEY) || '{}');
    return parsed && typeof parsed === 'object' && parsed.friends && typeof parsed.friends === 'object'
      ? parsed
      : { friends: {} };
  } catch (error) {
    return { friends: {} };
  }
}

function saveCommunityFavoriteListening() {
  try {
    window.localStorage.setItem(COMMUNITY_FAVORITE_LISTEN_KEY, JSON.stringify(state.community.favoriteListening || { friends: {} }));
  } catch (error) {}
}

function songCoverSource(song = {}) {
  const direct = safeText(song.cover || song.pic || song.image || song.picUrl || song.albumPic || song.albumpic || song.picurl, '');
  if (direct) return direct;
  const album = song.al && typeof song.al === 'object' ? song.al : (song.album && typeof song.album === 'object' ? song.album : null);
  if (!album) return '';
  return safeText(album.picUrl || album.pic || album.cover || album.img || album.image, '');
}

function songAlbumName(song = {}) {
  if (song.album && typeof song.album === 'object') {
    return safeText(song.album.name || song.album.title, '');
  }
  if (song.al && typeof song.al === 'object') {
    return safeText(song.al.name || song.al.title, '');
  }
  return safeText(song.album, '');
}

function normalizedSong(song = {}, fallbackProvider = state.activeProvider) {
  const provider = providerInfo(song.provider || fallbackProvider).id;
  return {
    id: safeText(song.id, ''),
    title: safeText(song.title || song.name, '未命名歌曲'),
    artist: safeText(song.artist || song.singer, ''),
    album: songAlbumName(song),
    cover: songCoverSource(song),
    duration: Number(song.duration) || 0,
    provider
  };
}

function favoriteSongKey(song = {}, fallbackProvider = state.activeProvider) {
  const provider = providerInfo(song.provider || fallbackProvider).id;
  const id = safeText(song.id, '').trim();
  if (id) return `${provider}:${id}`;
  const title = safeText(song.title || song.name, '').trim().toLowerCase();
  const artist = safeText(song.artist || song.singer, '').trim().toLowerCase();
  return title ? `${provider}:${title}|${artist}` : '';
}

function favoriteDirectory(provider = state.activeProvider) {
  const id = providerInfo(provider).id;
  if (!Array.isArray(state.favoriteDirectories[id])) state.favoriteDirectories[id] = [];
  return state.favoriteDirectories[id];
}

function isSongFavorite(song) {
  const key = favoriteSongKey(song);
  if (!key) return false;
  return favoriteDirectory(song && song.provider).some((item) => favoriteSongKey(item) === key);
}

function updateFavoriteButton(button, song) {
  if (!button) return;
  const hasSong = !!(song && (song.id || song.title));
  const active = hasSong && isSongFavorite(song);
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
  if ('disabled' in button) button.disabled = !hasSong;
  const action = active ? '取消收藏' : '收藏';
  const title = hasSong ? `${action}：${safeText(song.title, '当前歌曲')}` : '收藏当前歌曲';
  button.title = title;
  button.setAttribute('aria-label', title);
}

function updateFavoriteControls(song = state.currentSong) {
  updateFavoriteButton(els.dockFavoriteButton, song);
  if (!els.searchSuggestions) return;
  els.searchSuggestions.querySelectorAll('.search-favorite-button').forEach((button) => {
    const index = Number(button.dataset.searchIndex);
    updateFavoriteButton(button, state.searchSuggestions.songs[index]);
  });
}

function favoriteProviderIds() {
  return Object.keys(MUSIC_PROVIDERS);
}

function favoriteCount(provider) {
  return favoriteDirectory(provider).length;
}

function totalFavoriteCount() {
  return favoriteProviderIds().reduce((total, provider) => total + favoriteCount(provider), 0);
}

function setFavoriteLibraryOpen(open, provider = state.favoriteLibrary.provider) {
  if (!els.favoriteLibrary) return;
  state.favoriteLibrary.open = !!open;
  state.favoriteLibrary.provider = providerInfo(provider || state.activeProvider).id;
  els.favoriteLibrary.hidden = !state.favoriteLibrary.open;
  if (els.topFavoritesButton) {
    els.topFavoritesButton.setAttribute('aria-expanded', String(state.favoriteLibrary.open));
  }
  if (els.appShell) {
    els.appShell.classList.toggle('is-favorite-library-open', state.favoriteLibrary.open);
  }
  if (state.favoriteLibrary.open) {
    setSearchSuggestionsOpen(false);
    setPlaylistFavoriteOpen(false);
    renderFavoriteLibrary();
  }
}

function renderFavoriteLibraryTabs() {
  if (!els.favoriteLibraryTabs) return;
  clearElement(els.favoriteLibraryTabs);
  const activeProvider = providerInfo(state.favoriteLibrary.provider).id;
  favoriteProviderIds().forEach((provider) => {
    const info = providerInfo(provider);
    const button = document.createElement('button');
    const active = info.id === activeProvider;
    button.className = `favorite-library-tab${active ? ' is-active' : ''}`;
    button.type = 'button';
    button.dataset.favoriteProvider = info.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(active));
    button.textContent = `${info.label} ${favoriteCount(info.id)}`;
    els.favoriteLibraryTabs.appendChild(button);
  });
}

function favoriteLibrarySong(provider, index) {
  const directory = favoriteDirectory(provider);
  return directory[Number(index)] || null;
}

function createFavoriteLibraryItem(song, provider, index) {
  const item = document.createElement('div');
  item.className = 'search-suggestion-item favorite-library-item';
  item.setAttribute('role', 'listitem');

  const play = document.createElement('button');
  play.className = 'search-suggestion-play';
  play.type = 'button';
  play.dataset.favoriteProvider = provider;
  play.dataset.favoriteIndex = String(index);
  play.setAttribute('aria-label', `播放收藏：${safeText(song.title, '未命名歌曲')}`);

  const cover = document.createElement('span');
  cover.className = 'search-suggestion-cover';
  cover.textContent = 'FE';
  const imageUrl = proxiedImageUrl(song.cover || '');
  if (imageUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
    image.src = imageUrl;
    image.addEventListener('load', () => cover.classList.add('has-cover'));
    image.addEventListener('error', () => removeElement(image));
    cover.appendChild(image);
  }

  const copy = document.createElement('span');
  copy.className = 'search-suggestion-copy';
  const title = document.createElement('strong');
  title.textContent = safeText(song.title, '未命名歌曲');
  const meta = document.createElement('small');
  meta.textContent = searchSuggestionSubtitle(song);
  copy.appendChild(title);
  copy.appendChild(meta);

  const remove = document.createElement('button');
  remove.className = 'search-favorite-button is-active';
  remove.type = 'button';
  remove.dataset.favoriteProvider = provider;
  remove.dataset.favoriteIndex = String(index);
  remove.setAttribute('aria-pressed', 'true');
  remove.setAttribute('aria-label', `取消收藏：${safeText(song.title, '歌曲')}`);
  remove.title = remove.getAttribute('aria-label');
  const icon = document.createElement('span');
  icon.className = 'search-favorite-icon';
  icon.setAttribute('aria-hidden', 'true');
  remove.appendChild(icon);

  play.appendChild(cover);
  play.appendChild(copy);
  item.appendChild(play);
  item.appendChild(remove);
  return item;
}

function renderFavoriteLibraryList() {
  if (!els.favoriteLibraryList) return;
  const provider = providerInfo(state.favoriteLibrary.provider).id;
  const info = providerInfo(provider);
  const songs = favoriteDirectory(provider);
  clearElement(els.favoriteLibraryList);
  if (els.favoriteLibraryMeta) {
    els.favoriteLibraryMeta.textContent = `${info.label} ${songs.length} 首 / 共 ${totalFavoriteCount()} 首`;
  }
  if (!songs.length) {
    const empty = document.createElement('div');
    empty.className = 'favorite-library-empty';
    empty.textContent = `暂无${info.label}收藏，搜索歌曲后点星标保存。`;
    els.favoriteLibraryList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  songs.forEach((song, index) => fragment.appendChild(createFavoriteLibraryItem(song, provider, index)));
  els.favoriteLibraryList.appendChild(fragment);
}

function renderFavoriteLibrary() {
  if (!els.favoriteLibrary) return;
  renderFavoriteLibraryTabs();
  renderFavoriteLibraryList();
}

function normalizePlatformPlaylist(playlist = {}) {
  const cover = playlist.cover || playlist.coverImgUrl || playlist.picUrl || playlist.logo || playlist.image || playlist.imgurl || playlist.imgUrl || playlist.flexible_cover || playlist.pic;
  return {
    id: safeText(playlist.id || playlist.playlistId || playlist.pid || playlist.tid || playlist.disstid || playlist.listid || playlist.global_collection_id || playlist.specialid || playlist.specialId, ''),
    name: safeText(playlist.name || playlist.title || playlist.dissname || playlist.specialname || playlist.specialName, '未命名歌单'),
    cover: safeText(typeof cover === 'string' ? cover.replace('{size}', '400') : cover, ''),
    trackCount: Number(playlist.trackCount || playlist.songCount || playlist.count || playlist.total || playlist.songcount || playlist.song_count || 0) || 0,
    creator: safeText(playlist.creator || playlist.nickname || playlist.userName || playlist.nick, '')
  };
}

function favoriteTargetPlaylists(provider = state.playlistFavorite.provider) {
  const id = providerInfo(provider).id;
  return Array.isArray(state.playlistFavorite.playlistsByProvider[id])
    ? state.playlistFavorite.playlistsByProvider[id]
    : [];
}

function renderPlaylistFavoriteStatus(message, actions = []) {
  if (!els.playlistFavoritePopover) return;
  const status = document.createElement('div');
  status.className = 'playlist-favorite-status';
  status.textContent = message;
  els.playlistFavoritePopover.appendChild(status);
  if (!actions.length) return;
  const actionRow = document.createElement('div');
  actionRow.className = 'playlist-favorite-actions';
  actions.forEach((action) => actionRow.appendChild(action));
  els.playlistFavoritePopover.appendChild(actionRow);
}

function renderPlaylistFavoritePopover() {
  if (!els.playlistFavoritePopover) return;
  clearElement(els.playlistFavoritePopover);
  if (!state.playlistFavorite.open) return;

  const song = state.playlistFavorite.song;
  const provider = providerInfo(state.playlistFavorite.provider);
  const header = document.createElement('div');
  header.className = 'playlist-favorite-head';
  const titleWrap = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = '收藏到歌单';
  const meta = document.createElement('small');
  meta.textContent = `${provider.label} · 选择目标歌单`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(meta);
  const close = document.createElement('button');
  close.className = 'playlist-favorite-close';
  close.type = 'button';
  close.dataset.playlistFavoriteClose = 'true';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '×';
  header.appendChild(titleWrap);
  header.appendChild(close);
  els.playlistFavoritePopover.appendChild(header);

  if (song) {
    const summary = document.createElement('div');
    summary.className = 'playlist-favorite-song';
    const cover = document.createElement('span');
    cover.className = 'search-suggestion-cover';
    cover.textContent = 'FE';
    const imageUrl = proxiedImageUrl(song.cover || '');
    if (imageUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = imageUrl;
      image.addEventListener('load', () => cover.classList.add('has-cover'));
      image.addEventListener('error', () => removeElement(image));
      cover.appendChild(image);
    }
    const copy = document.createElement('span');
    copy.className = 'search-suggestion-copy';
    const songTitle = document.createElement('strong');
    songTitle.textContent = safeText(song.title, '未命名歌曲');
    const songMeta = document.createElement('small');
    songMeta.textContent = searchSuggestionSubtitle(song);
    copy.appendChild(songTitle);
    copy.appendChild(songMeta);
    summary.appendChild(cover);
    summary.appendChild(copy);
    els.playlistFavoritePopover.appendChild(summary);
  }

  if (state.playlistFavorite.error) {
    const error = document.createElement('div');
    error.className = 'playlist-favorite-status is-error';
    error.textContent = state.playlistFavorite.error;
    els.playlistFavoritePopover.appendChild(error);
  }

  if (state.playlistFavorite.loading) {
    renderPlaylistFavoriteStatus('正在读取平台歌单...');
    return;
  }

  const playlists = favoriteTargetPlaylists(provider.id);
  const localButton = document.createElement('button');
  localButton.className = 'playlist-favorite-secondary';
  localButton.type = 'button';
  localButton.dataset.playlistFavoriteLocal = 'true';
  localButton.textContent = '保存到本地收藏';
  const refreshButton = document.createElement('button');
  refreshButton.className = 'playlist-favorite-secondary';
  refreshButton.type = 'button';
  refreshButton.dataset.playlistFavoriteRefresh = 'true';
  refreshButton.textContent = '刷新歌单';

  if (!playlists.length) {
    renderPlaylistFavoriteStatus('未读取到平台歌单，请先登录音乐平台或刷新歌单。', [refreshButton, localButton]);
    return;
  }

  const list = document.createElement('div');
  list.className = 'playlist-favorite-list';
  playlists.forEach((playlist) => {
    const button = document.createElement('button');
    button.className = 'playlist-favorite-choice';
    button.type = 'button';
    button.dataset.playlistId = playlist.id;
    button.disabled = state.playlistFavorite.savingId === playlist.id;

    const cover = document.createElement('span');
    cover.className = 'playlist-favorite-cover';
    cover.textContent = 'FE';
    const imageUrl = proxiedImageUrl(playlist.cover || '');
    if (imageUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = imageUrl;
      image.addEventListener('load', () => cover.classList.add('has-cover'));
      image.addEventListener('error', () => removeElement(image));
      cover.appendChild(image);
    }

    const copy = document.createElement('span');
    copy.className = 'playlist-favorite-copy';
    const name = document.createElement('strong');
    name.textContent = playlist.name;
    const detail = document.createElement('small');
    detail.textContent = playlist.trackCount ? `${playlist.trackCount} 首` : '平台歌单';
    copy.appendChild(name);
    copy.appendChild(detail);

    const action = document.createElement('span');
    action.className = 'playlist-favorite-add';
    action.textContent = state.playlistFavorite.savingId === playlist.id ? '收藏中' : '收藏';

    button.appendChild(cover);
    button.appendChild(copy);
    button.appendChild(action);
    list.appendChild(button);
  });
  els.playlistFavoritePopover.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'playlist-favorite-actions';
  actions.appendChild(refreshButton);
  actions.appendChild(localButton);
  els.playlistFavoritePopover.appendChild(actions);
}

function setPlaylistFavoriteOpen(open, song = state.playlistFavorite.song, options = {}) {
  if (!els.playlistFavoritePopover) return;
  state.playlistFavorite.open = !!open;
  if (song) {
    const normalized = normalizedSong(song, song.provider || state.activeProvider);
    state.playlistFavorite.song = normalized;
    state.playlistFavorite.provider = providerInfo(normalized.provider).id;
  }
  if (!state.playlistFavorite.open) {
    state.playlistFavorite.savingId = '';
    state.playlistFavorite.error = '';
  }
  els.playlistFavoritePopover.hidden = !state.playlistFavorite.open;
  if (els.appShell) {
    els.appShell.classList.toggle('is-playlist-favorite-open', state.playlistFavorite.open);
  }
  if (state.playlistFavorite.open) {
    if (!options.keepSearch) setSearchSuggestionsOpen(false);
    setFavoriteLibraryOpen(false);
  }
  renderPlaylistFavoritePopover();
}

async function loadFavoriteTargetPlaylists(provider = state.playlistFavorite.provider, force = false) {
  const id = providerInfo(provider).id;
  const loadedAt = Number(state.playlistFavorite.loadedAtByProvider[id]) || 0;
  if (!force && favoriteTargetPlaylists(id).length && Date.now() - loadedAt < PLAYLIST_FAVORITE_CACHE_MS) return favoriteTargetPlaylists(id);

  state.playlistFavorite.loading = true;
  state.playlistFavorite.error = '';
  renderPlaylistFavoritePopover();
  try {
    const data = await apiJson(providerPath('/user/playlists', id));
    const source = Array.isArray(data) ? data : (Array.isArray(data.playlists) ? data.playlists : []);
    const playlists = source.map(normalizePlatformPlaylist).filter((playlist) => playlist.id);
    state.playlistFavorite.playlistsByProvider[id] = playlists;
    state.playlistFavorite.loadedAtByProvider[id] = Date.now();
    if (id === state.activeProvider) {
      state.userPlaylists = playlists;
      state.playlistsLoggedIn = playlists.length > 0 || !!(data && data.loggedIn);
    }
    return playlists;
  } catch (error) {
    state.playlistFavorite.error = error.message || '读取歌单失败';
    return [];
  } finally {
    state.playlistFavorite.loading = false;
    renderPlaylistFavoritePopover();
  }
}

async function showPlaylistFavoritePicker(song, options = {}) {
  if (!song || (!song.id && !song.title)) {
    toast('播放栏暂无可收藏歌曲');
    return;
  }
  const normalized = normalizedSong(song, song.provider || state.activeProvider);
  setPlaylistFavoriteOpen(true, normalized, options);
  await loadFavoriteTargetPlaylists(normalized.provider);
}

function saveSongToLocalFavorite(song = state.playlistFavorite.song) {
  if (!song) return;
  toggleFavoriteSong(song, { forceAdd: true });
  setPlaylistFavoriteOpen(false);
}

async function addSongToPlatformPlaylist(playlistId) {
  const song = state.playlistFavorite.song;
  if (!song || !playlistId) return;
  const provider = providerInfo(song.provider || state.playlistFavorite.provider).id;
  const playlists = favoriteTargetPlaylists(provider);
  const playlist = playlists.find((item) => item.id === playlistId);
  state.playlistFavorite.savingId = playlistId;
  state.playlistFavorite.error = '';
  renderPlaylistFavoritePopover();
  try {
    const payload = await apiJson(providerPath('/playlist/add', provider), {
      method: 'POST',
      body: JSON.stringify({ playlistId, song })
    });
    if (payload && payload.ok === false) throw new Error(payload.error || '平台收藏失败');
    toggleFavoriteSong(song, { toast: false, forceAdd: true });
    toast(`已收藏到${playlist ? playlist.name : '平台歌单'}：${safeText(song.title, '歌曲')}`);
    setPlaylistFavoriteOpen(false);
  } catch (error) {
    state.playlistFavorite.error = error.message || '平台收藏失败';
    toggleFavoriteSong(song, { toast: false, forceAdd: true });
    toast(`${state.playlistFavorite.error}，已先保存到本地收藏`);
  } finally {
    state.playlistFavorite.savingId = '';
    renderPlaylistFavoritePopover();
  }
}

function toggleFavoriteSong(song, options = {}) {
  if (!song || (!song.id && !song.title)) {
    toast('播放栏暂无可收藏歌曲');
    return false;
  }
  const normalized = normalizedSong(song);
  const directory = favoriteDirectory(normalized.provider);
  const key = favoriteSongKey(normalized);
  const existingIndex = directory.findIndex((item) => favoriteSongKey(item) === key);
  const providerLabel = providerInfo(normalized.provider).label;
  if (existingIndex >= 0 && !options.forceAdd) {
    directory.splice(existingIndex, 1);
    if (options.toast !== false) toast(`已从${providerLabel}收藏目录移除：${safeText(normalized.title, '歌曲')}`);
  } else if (existingIndex < 0) {
    directory.unshift(normalized);
    if (options.toast !== false) toast(`已收藏到${providerLabel}收藏目录：${safeText(normalized.title, '歌曲')}`);
  } else if (options.toast !== false) {
    toast(`已在${providerLabel}收藏目录：${safeText(normalized.title, '歌曲')}`);
  }
  saveFavoriteDirectories();
  updateFavoriteControls(state.currentSong);
  if (state.favoriteLibrary.open) renderFavoriteLibrary();
  return existingIndex < 0;
}

function searchSuggestionSubtitle(song) {
  const artist = safeText(song.artist, '');
  const album = safeText(song.album, '');
  const provider = providerInfo(song.provider || state.activeProvider).label;
  const meta = artist && album ? `${artist} · ${album}` : artist || album;
  return meta ? `${meta} · ${provider}` : provider;
}

function setSearchSuggestionsOpen(open) {
  if (!els.searchSuggestions) return;
  if (open && state.favoriteLibrary.open) setFavoriteLibraryOpen(false);
  if (open && state.playlistFavorite.open) setPlaylistFavoriteOpen(false);
  els.searchSuggestions.hidden = !open;
  if (els.appShell) els.appShell.classList.toggle('is-search-suggestions-open', !!open);
}

function renderSearchSuggestionStatus(message) {
  if (!els.searchSuggestions) return;
  clearElement(els.searchSuggestions);
  const status = document.createElement('div');
  status.className = 'search-suggestion-status';
  status.textContent = message;
  els.searchSuggestions.appendChild(status);
  setSearchSuggestionsOpen(true);
}

function renderSearchSuggestions() {
  if (!els.searchSuggestions) return;
  clearElement(els.searchSuggestions);
  const songs = state.searchSuggestions.songs;
  const keyword = els.searchInput ? els.searchInput.value.trim() : '';
  if (!keyword) {
    setSearchSuggestionsOpen(false);
    return;
  }
  if (!songs.length) {
    renderSearchSuggestionStatus(`没有找到「${keyword}」`);
    return;
  }

  const fragment = document.createDocumentFragment();
  songs.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = 'search-suggestion-item';
    item.setAttribute('role', 'option');

    const play = document.createElement('button');
    play.className = 'search-suggestion-play search-suggestion-play--rich';
    play.type = 'button';
    play.dataset.searchIndex = String(index);
    play.setAttribute('aria-label', `播放：${safeText(song.title, '未命名歌曲')}`);

    const number = document.createElement('span');
    number.className = 'search-suggestion-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const cover = document.createElement('span');
    cover.className = 'search-suggestion-cover';
    cover.textContent = 'FE';
    const imageUrl = proxiedImageUrl(song.cover || '');
    if (imageUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.src = imageUrl;
      image.addEventListener('load', () => cover.classList.add('has-cover'));
      image.addEventListener('error', () => removeElement(image));
      cover.appendChild(image);
    }

    const copy = document.createElement('span');
    copy.className = 'search-suggestion-copy';
    const title = document.createElement('strong');
    title.textContent = safeText(song.title, '未命名歌曲');
    const meta = document.createElement('small');
    meta.textContent = searchSuggestionSubtitle(song);
    copy.appendChild(title);
    copy.appendChild(meta);

    const duration = document.createElement('span');
    duration.className = 'search-suggestion-duration';
    duration.textContent = song.duration ? formatTime(Number(song.duration)) : '--:--';

    const favorite = document.createElement('button');
    favorite.className = 'search-favorite-button';
    favorite.type = 'button';
    favorite.dataset.searchIndex = String(index);
    const icon = document.createElement('span');
    icon.className = 'search-favorite-icon';
    icon.setAttribute('aria-hidden', 'true');
    favorite.appendChild(icon);

    play.appendChild(number);
    play.appendChild(cover);
    play.appendChild(copy);
    play.appendChild(duration);
    item.appendChild(play);
    item.appendChild(favorite);
    fragment.appendChild(item);
  });
  els.searchSuggestions.appendChild(fragment);
  setSearchSuggestionsOpen(true);
  updateFavoriteControls();
}

function normalizeSearchResults(songs) {
  const seen = new Set();
  return (Array.isArray(songs) ? songs : [])
    .map((song) => normalizedSong(song))
    .filter((song) => {
      const key = favoriteSongKey(song);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchSearchSuggestions(keyword) {
  const provider = providerInfo(state.activeProvider).id;
  const cacheKey = `${provider}:${keyword.toLowerCase()}`;
  const cached = state.searchSuggestions.cache.get(cacheKey);
  if (cached && Date.now() - cached.time < SEARCH_SUGGESTION_CACHE_MS) {
    state.searchSuggestions.query = keyword;
    state.searchSuggestions.songs = cached.songs;
    state.searchSuggestions.loading = false;
    renderSearchSuggestions();
    return;
  }
  if (state.searchSuggestions.abortController) {
    state.searchSuggestions.abortController.abort();
  }
  const controller = new AbortController();
  state.searchSuggestions.abortController = controller;
  const requestId = state.searchSuggestions.requestId + 1;
  state.searchSuggestions.requestId = requestId;
  state.searchSuggestions.query = keyword;
  state.searchSuggestions.loading = true;
  renderSearchSuggestionStatus(`正在搜索「${keyword}」`);
  try {
    const data = await apiJson(`/api/search?${query({ q: keyword, limit: 8, provider })}`, {
      signal: controller.signal
    });
    if (requestId !== state.searchSuggestions.requestId || (els.searchInput && els.searchInput.value.trim() !== keyword)) return;
    const songs = normalizeSearchResults(data.songs).slice(0, 8);
    state.searchSuggestions.songs = songs;
    state.searchSuggestions.cache.set(cacheKey, { time: Date.now(), songs });
    state.searchSuggestions.loading = false;
    renderSearchSuggestions();
    if (state.searchSuggestions.abortController === controller) state.searchSuggestions.abortController = null;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      if (state.searchSuggestions.abortController === controller) state.searchSuggestions.abortController = null;
      return;
    }
    if (requestId !== state.searchSuggestions.requestId || (els.searchInput && els.searchInput.value.trim() !== keyword)) return;
    state.searchSuggestions.songs = [];
    state.searchSuggestions.loading = false;
    if (state.searchSuggestions.abortController === controller) state.searchSuggestions.abortController = null;
    renderSearchSuggestionStatus(error.message || '搜索失败');
  }
}

function scheduleSearchSuggestions() {
  if (!els.searchInput) return;
  const keyword = els.searchInput.value.trim();
  window.clearTimeout(state.searchSuggestions.timer);
  if (!keyword) {
    if (state.searchSuggestions.abortController) {
      state.searchSuggestions.abortController.abort();
      state.searchSuggestions.abortController = null;
    }
    state.searchSuggestions.songs = [];
    state.searchSuggestions.query = '';
    state.searchSuggestions.requestId += 1;
    setSearchSuggestionsOpen(false);
    return;
  }
  if (state.favoriteLibrary.open) setFavoriteLibraryOpen(false);
  if (state.playlistFavorite.open) setPlaylistFavoriteOpen(false);
  state.searchSuggestions.timer = window.setTimeout(() => fetchSearchSuggestions(keyword), 260);
}

async function playSearchSuggestion(song) {
  if (!song) return;
  const loaded = await loadSong(song);
  if (loaded) {
    setSearchSuggestionsOpen(false);
    els.searchInput.blur();
    toast(`正在播放：${safeText(song.title, '歌曲')}`);
  }
}

async function playFavoriteLibrarySong(song) {
  if (!song) return;
  const loaded = await loadSong(song);
  if (loaded) {
    setFavoriteLibraryOpen(false);
    toast(`正在播放：${safeText(song.title, '歌曲')}`);
  }
}

function visiblePlaylists(playlists) {
  return playlists.filter((playlist) => playlist && playlist.id);
}

function playlistSignature(playlists) {
  return playlists
    .map((playlist) => [
      playlist.id,
      playlist.name || '',
      playlist.cover || '',
      playlist.trackCount || 0,
      playlist.playCount || 0
    ].join('|'))
    .join('::');
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function updateProgress(percent = 0, text = '') {
  const next = clamp(Number(percent) || 0, 0, 100);
  if (els.updateProgressBar) els.updateProgressBar.style.width = `${next}%`;
  if (els.updateProgressText) els.updateProgressText.textContent = text || `${Math.round(next)}%`;
}

function showUpdateDialog(release = {}) {
  if (!els.updateDialog) return;
  const version = safeText(release.version, '');
  const downloadUrl = safeText(release.downloadUrl, '');
  if (!version || !downloadUrl) return;
  state.update.release = release;
  state.update.progressId = '';
  state.update.installing = false;
  if (els.updateVersion) els.updateVersion.textContent = version;
  if (els.updateNotes) els.updateNotes.textContent = safeText(release.releaseNotes || release.notes, '服务器已发布新客户端版本。');
  if (els.updateInstallButton) {
    els.updateInstallButton.disabled = false;
    els.updateInstallButton.textContent = '立即更新';
  }
  if (els.updateLaterButton) els.updateLaterButton.disabled = false;
  updateProgress(0, '等待确认');
  els.updateDialog.hidden = false;
}

function hideUpdateDialog() {
  if (!els.updateDialog || state.update.installing) return;
  els.updateDialog.hidden = true;
  state.update.release = null;
}

async function startClientUpdate() {
  if (!state.update.release || state.update.installing) return;
  state.update.installing = true;
  if (els.updateInstallButton) {
    els.updateInstallButton.disabled = true;
    els.updateInstallButton.textContent = '更新中';
  }
  if (els.updateLaterButton) els.updateLaterButton.disabled = true;
  updateProgress(1, '准备更新');
  try {
    const payload = await apiJson('/api/update/install', {
      method: 'POST',
      body: JSON.stringify({ release: state.update.release })
    });
    state.update.progressId = safeText(payload.progressId, '');
    if (!state.update.progressId) throw new Error('更新任务未创建');
    pollClientUpdateProgress();
    window.clearInterval(state.update.progressTimer);
    state.update.progressTimer = window.setInterval(pollClientUpdateProgress, 900);
  } catch (error) {
    state.update.installing = false;
    if (els.updateInstallButton) {
      els.updateInstallButton.disabled = false;
      els.updateInstallButton.textContent = '重试更新';
    }
    if (els.updateLaterButton) els.updateLaterButton.disabled = false;
    updateProgress(0, error.message || '更新启动失败');
  }
}

async function pollClientUpdateProgress() {
  if (!state.update.progressId) return;
  try {
    const payload = await apiJson(`/api/update/progress?${query({ id: state.update.progressId })}`);
    const percent = Number(payload.percent) || 0;
    const status = safeText(payload.status, '');
    updateProgress(percent, safeText(payload.message, `${Math.round(percent)}%`));
    if (status === 'completed' || status === 'ready' || status === 'failed') {
      window.clearInterval(state.update.progressTimer);
      state.update.progressTimer = 0;
      state.update.installing = false;
      if (els.updateInstallButton) {
        els.updateInstallButton.disabled = status !== 'failed';
        els.updateInstallButton.textContent = status === 'failed' ? '重试更新' : '已完成';
      }
      if (els.updateLaterButton) {
        els.updateLaterButton.disabled = false;
        els.updateLaterButton.textContent = '关闭';
      }
    }
  } catch (error) {
    updateProgress(0, error.message || '读取更新进度失败');
  }
}

function accountName(payload) {
  const account = payload && payload.account ? payload.account : {};
  return safeText(account.nickname || account.userId, '');
}

function accountAvatar(payload) {
  const account = payload && payload.account ? payload.account : {};
  const raw = safeText(account.avatarUrl || account.avatar || account.headimg || account.pic, '');
  if (!raw) return '';
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return proxiedImageUrl(raw);
  return raw;
}

function renderLoginAvatar(payload, loggedIn) {
  if (!els.loginAvatar || !els.loginAvatarImage) return;
  const avatarUrl = loggedIn ? accountAvatar(payload) : '';
  els.loginAvatar.classList.toggle('has-avatar', !!avatarUrl);
  if (avatarUrl) {
    if (els.loginAvatarImage.getAttribute('src') !== avatarUrl) els.loginAvatarImage.src = avatarUrl;
  } else {
    els.loginAvatarImage.removeAttribute('src');
  }
}

function communityAvatarUrl(source = {}) {
  const raw = safeText(source.avatarUrl || source.avatar || source.headimg || source.pic, '');
  if (!raw) return '';
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return proxiedImageUrl(raw);
  return raw;
}

function renderCommunityAvatar(source = {}) {
  if (!els.communityAvatar || !els.communityAvatarImage) return;
  const avatarUrl = communityAvatarUrl(source);
  els.communityAvatar.classList.toggle('has-avatar', !!avatarUrl);
  if (avatarUrl) {
    if (els.communityAvatarImage.getAttribute('src') !== avatarUrl) els.communityAvatarImage.src = avatarUrl;
  } else {
    els.communityAvatarImage.removeAttribute('src');
  }
}

function createCommunityCertBadge(certification) {
  if (!certification || !certification.label) return null;
  const wrapper = document.createElement('span');
  wrapper.className = 'community-cert';
  wrapper.title = certification.label;
  const badge = document.createElement('span');
  badge.className = 'community-cert-badge';
  badge.dataset.level = String(certification.level || 1);
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = 'V';
  const label = document.createElement('span');
  label.className = 'community-cert-label';
  label.textContent = safeText(certification.label, '社区认证');
  wrapper.appendChild(badge);
  wrapper.appendChild(label);
  return wrapper;
}

function setCommunityCardCollapsed(collapsed) {
  state.community.cardCollapsed = !!collapsed;
  if (els.communityCard) els.communityCard.classList.toggle('is-collapsed', state.community.cardCollapsed);
  if (els.communityCollapseButton) {
    els.communityCollapseButton.setAttribute('aria-expanded', String(!state.community.cardCollapsed));
    els.communityCollapseButton.setAttribute('aria-label', state.community.cardCollapsed ? '展开社区卡片' : '折叠社区卡片');
    els.communityCollapseButton.title = els.communityCollapseButton.getAttribute('aria-label');
  }
  saveCommunityCardCollapsed(state.community.cardCollapsed);
}

function currentCommunitySongPayload() {
  const song = state.currentSong || {};
  const audioDuration = Number.isFinite(els.audio.duration) && els.audio.duration > 0 ? els.audio.duration : 0;
  const audioPosition = Number.isFinite(els.audio.currentTime) && els.audio.currentTime > 0 ? els.audio.currentTime : 0;
  return {
    id: safeText(song.id, ''),
    title: safeText(song.title, '一起听歌'),
    artist: safeText(song.artist, ''),
    album: safeText(song.album, ''),
    cover: safeText(song.cover, ''),
    provider: safeText(song.provider, state.activeProvider),
    duration: Math.round(audioDuration || Number(song.duration) || 0),
    position: Math.round(audioPosition || Number(song.position) || 0),
    playing: !els.audio.paused && !!els.audio.src,
    playable: !!els.audio.src,
    reportedAt: Date.now()
  };
}

function communitySongSignature(song = {}) {
  const provider = safeText(song.provider, '');
  const id = safeText(song.id, '');
  if (provider || id) return `${provider}:${id}`;
  return [
    safeText(song.title, ''),
    safeText(song.artist, ''),
    safeText(song.album, '')
  ].join('|').trim();
}

function communitySongPosition(song = {}) {
  const position = Number(song.position);
  return Number.isFinite(position) ? Math.max(0, position) : 0;
}

function communitySongDuration(song = {}) {
  const duration = Number(song.duration);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function communityListenEntry(friendId) {
  if (!state.community.favoriteListening || typeof state.community.favoriteListening !== 'object') {
    state.community.favoriteListening = { friends: {} };
  }
  if (!state.community.favoriteListening.friends || typeof state.community.favoriteListening.friends !== 'object') {
    state.community.favoriteListening.friends = {};
  }
  const key = String(friendId || '');
  if (!state.community.favoriteListening.friends[key]) {
    state.community.favoriteListening.friends[key] = {
      currentSignature: '',
      lastSeenAt: 0,
      songs: {}
    };
  }
  const entry = state.community.favoriteListening.friends[key];
  if (!entry.songs || typeof entry.songs !== 'object') entry.songs = {};
  return entry;
}

function communityListenSongRecord(entry, signature, song = {}) {
  if (!entry.songs[signature]) {
    entry.songs[signature] = {
      signature,
      totalMs: 0,
      title: safeText(song.title || song.name, '当前歌曲'),
      artist: safeText(song.artist || song.singer, ''),
      cover: songCoverSource(song),
      provider: safeText(song.provider, state.activeProvider),
      notifiedAt: 0
    };
  }
  const record = entry.songs[signature];
  record.title = safeText(song.title || song.name, record.title || '当前歌曲');
  record.artist = safeText(song.artist || song.singer, record.artist || '');
  record.cover = songCoverSource(song) || record.cover || '';
  record.provider = safeText(song.provider, record.provider || state.activeProvider);
  return record;
}

function addCommunityListenDelta(entry, signature, song, deltaMs) {
  if (!signature || !deltaMs) return null;
  const record = communityListenSongRecord(entry, signature, song);
  record.totalMs = Math.max(0, Number(record.totalMs) || 0) + Math.max(0, deltaMs);
  return record;
}

function compactCommunityListenEntry(entry) {
  const pairs = Object.entries(entry.songs || {})
    .sort((a, b) => (Number(b[1].totalMs) || 0) - (Number(a[1].totalMs) || 0))
    .slice(0, 30);
  entry.songs = Object.fromEntries(pairs);
}

function dismissCommunityLoveBubble(key = '') {
  const target = safeText(key, '');
  state.community.loveBubbles = state.community.loveBubbles.filter((bubble) => bubble.key !== target);
  renderCommunityLoveBubbles();
}

function showCommunityLoveBubble(friend = {}, songRecord = {}) {
  if (!els.communityListenBubbles) return;
  const key = `${safeText(friend.feId, '')}:${safeText(songRecord.signature, '')}:${Date.now()}`;
  const name = safeText(friend.username, `FE ${friend.feId || ''}`);
  state.community.loveBubbles = [
    {
      key,
      friendId: safeText(friend.feId, ''),
      name,
      avatarUrl: communityAvatarUrl(friend),
      title: safeText(songRecord.title, '当前歌曲'),
      artist: safeText(songRecord.artist, '')
    },
    ...state.community.loveBubbles.filter((bubble) => bubble.friendId !== safeText(friend.feId, ''))
  ].slice(0, 2);
  renderCommunityLoveBubbles();
  window.setTimeout(() => dismissCommunityLoveBubble(key), COMMUNITY_FAVORITE_BUBBLE_MS);
}

function renderCommunityLoveBubbles() {
  if (!els.communityListenBubbles) return;
  clearElement(els.communityListenBubbles);
  state.community.loveBubbles.forEach((bubble) => {
    const item = document.createElement('article');
    item.className = 'community-love-toast';
    item.dataset.loveKey = bubble.key;

    const avatar = document.createElement('span');
    avatar.className = 'community-love-avatar';
    if (bubble.avatarUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = bubble.avatarUrl;
      avatar.appendChild(image);
    } else {
      avatar.textContent = 'FE';
    }

    const copy = document.createElement('span');
    copy.className = 'community-love-copy';
    const title = document.createElement('strong');
    title.textContent = `${bubble.name} 经常听`;
    const meta = document.createElement('small');
    const songText = [bubble.title, bubble.artist].filter(Boolean).join(' · ');
    meta.textContent = songText || '喜欢听';
    copy.appendChild(title);
    copy.appendChild(meta);

    const mark = document.createElement('span');
    mark.className = 'community-love-mark';
    mark.textContent = '喜欢听';

    item.appendChild(avatar);
    item.appendChild(copy);
    item.appendChild(mark);
    els.communityListenBubbles.appendChild(item);
  });
}

function updateCommunityFriendListening(friends = []) {
  const now = Date.now();
  let changed = false;
  friends.forEach((friend) => {
    if (!friend || !friend.feId) return;
    const entry = communityListenEntry(friend.feId);
    const song = friend.currentSong && typeof friend.currentSong === 'object' ? friend.currentSong : null;
    const signature = song ? communitySongSignature(song) : '';
    const isListening = !!(friend.online && song && signature && song.playing !== false);
    const previousSignature = safeText(entry.currentSignature, '');
    if (previousSignature && entry.lastSeenAt && previousSignature !== signature) {
      const previousRecord = addCommunityListenDelta(entry, previousSignature, entry.songs[previousSignature] || {}, clamp(now - entry.lastSeenAt, 0, 60000));
      changed = !!previousRecord || changed;
    }
    if (!isListening) {
      entry.currentSignature = '';
      entry.lastSeenAt = now;
      return;
    }
    const delta = previousSignature === signature && entry.lastSeenAt ? clamp(now - entry.lastSeenAt, 0, 60000) : 0;
    const record = addCommunityListenDelta(entry, signature, song, delta);
    entry.currentSignature = signature;
    entry.lastSeenAt = now;
    if (record && record.totalMs >= COMMUNITY_FAVORITE_LISTEN_THRESHOLD_MS) {
      const lastNotified = Number(record.notifiedAt) || 0;
      if (!lastNotified || now - lastNotified > COMMUNITY_FAVORITE_LISTEN_NOTIFY_MS) {
        record.notifiedAt = now;
        showCommunityLoveBubble(friend, record);
      }
    }
    compactCommunityListenEntry(entry);
    if (delta > 0) changed = true;
  });
  if (changed) saveCommunityFavoriteListening();
}

function communityFriendById(feId) {
  return state.community.friends.find((friend) => String(friend.feId) === String(feId)) || null;
}

function communityFriendsSignature(friends = []) {
  return JSON.stringify(friends.map((friend) => ({
    feId: safeText(friend && friend.feId, ''),
    username: safeText(friend && friend.username, ''),
    avatarUrl: safeText(friend && friend.avatarUrl, ''),
    online: !!(friend && friend.online),
    likes: Number(friend && friend.likes) || 0,
    likedByMe: !!(friend && friend.likedByMe),
    certification: friend && friend.certification ? `${safeText(friend.certification.label, '')}:${friend.certification.level || 1}` : '',
    currentSongId: safeText(friend && friend.currentSong && friend.currentSong.id, '')
  })));
}

function renderCommunityFriends(friends = []) {
  if (!els.communityFriendsList) return;
  clearElement(els.communityFriendsList);
  const visibleFriends = friends.filter((friend) => friend && friend.feId);
  const onlineFriends = friends.filter((friend) => friend && friend.online);
  if (els.communityOnlineCount) els.communityOnlineCount.textContent = String(onlineFriends.length);
  if (els.communityMessageButton) els.communityMessageButton.disabled = !visibleFriends.length;
  if (!visibleFriends.length) {
    const empty = document.createElement('span');
    empty.className = 'community-empty';
    empty.textContent = '暂无好友';
    els.communityFriendsList.appendChild(empty);
    return;
  }

  visibleFriends.slice(0, 8).forEach((friend) => {
    const item = document.createElement('span');
    item.className = 'community-friend';
    item.classList.toggle('is-certified', !!friend.certification);
    item.classList.toggle('is-offline', !friend.online);

    const avatar = document.createElement('span');
    avatar.className = 'community-friend-avatar';
    const avatarUrl = communityAvatarUrl(friend);
    if (avatarUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = avatarUrl;
      avatar.appendChild(image);
    } else {
      avatar.textContent = 'FE';
    }

    const copy = document.createElement('span');
    copy.className = 'community-friend-copy';
    const name = document.createElement('strong');
    name.className = 'community-friend-name';
    const nameText = document.createElement('span');
    nameText.textContent = safeText(friend.username, `FE ${friend.feId || ''}`);
    name.appendChild(nameText);
    const certBadge = createCommunityCertBadge(friend.certification);
    if (certBadge) name.appendChild(certBadge);
    const id = document.createElement('small');
    const likes = Number(friend.likes) || 0;
    id.textContent = `${safeText(friend.feId, '')}${likes ? ` · ${likes} 赞` : ''} · ${friend.online ? '在线' : '离线'}`;
    copy.appendChild(name);
    copy.appendChild(id);

    const actions = document.createElement('span');
    actions.className = 'community-friend-actions';
    const messageButton = document.createElement('button');
    messageButton.className = 'community-friend-action';
    messageButton.type = 'button';
    messageButton.dataset.communityAction = 'message';
    messageButton.dataset.friendId = friend.feId;
    messageButton.textContent = '消息';
    messageButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    messageButton.addEventListener('click', handleCommunityFriendAction);
    const listenButton = document.createElement('button');
    listenButton.className = 'community-friend-action';
    listenButton.type = 'button';
    listenButton.dataset.communityAction = 'listen';
    listenButton.dataset.friendId = friend.feId;
    listenButton.textContent = '一起听';
    listenButton.classList.toggle('is-disabled', !friend.online);
    listenButton.dataset.disabled = String(!friend.online);
    listenButton.title = friend.online ? '一起听' : '好友离线，无法发起一起听';
    listenButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    listenButton.addEventListener('click', handleCommunityFriendAction);
    const likeButton = document.createElement('button');
    likeButton.className = `community-friend-action${friend.likedByMe ? ' is-liked' : ''}`;
    likeButton.type = 'button';
    likeButton.dataset.communityAction = 'like';
    likeButton.dataset.friendId = friend.feId;
    likeButton.textContent = friend.likedByMe ? '已赞' : '点赞';
    likeButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    likeButton.addEventListener('click', handleCommunityFriendAction);
    actions.appendChild(messageButton);
    actions.appendChild(listenButton);
    actions.appendChild(likeButton);

    item.appendChild(avatar);
    item.appendChild(copy);
    item.appendChild(actions);
    els.communityFriendsList.appendChild(item);
  });
}

function renderCommunityState(payload = {}) {
  if (!els.communityCard) return;
  const loggedIn = !!payload.loggedIn;
  const provider = providerInfo(payload.provider || state.activeProvider);
  const account = payload.account || {};
  const profile = payload.profile || {};
  const friends = Array.isArray(payload.friends) ? payload.friends : [];
  const displayName = safeText(profile.username || account.nickname || account.userId, '');
  const serverFailed = payload.serverOnline === false || payload.ok === false;
  const nextServerUrl = safeText(payload.serverUrl, '');
  if (nextServerUrl) state.community.serverUrl = nextServerUrl;
  const hasCommunityIdentity = loggedIn && !serverFailed && !!profile.feId;
  const nextFriendsSignature = hasCommunityIdentity ? communityFriendsSignature(friends) : '';
  state.community.profile = hasCommunityIdentity ? profile : null;
  state.community.friends = friends;
  if (hasCommunityIdentity) {
    const remoteBio = safeText(profile.bio, '').slice(0, 180);
    if (remoteBio && remoteBio !== state.community.profileBio && document.activeElement !== els.communityProfileBio) {
      state.community.profileBio = remoteBio;
    }
  }

  if (els.communityName) {
    clearElement(els.communityName);
    els.communityName.classList.add('community-profile-name');
    const nameText = document.createElement('span');
    nameText.textContent = loggedIn ? displayName || `${provider.label}用户` : '登录后启用社区';
    els.communityName.appendChild(nameText);
    const certBadge = createCommunityCertBadge(hasCommunityIdentity ? profile.certification : null);
    if (certBadge) els.communityName.appendChild(certBadge);
  }
  if (els.communityMeta) {
    els.communityMeta.textContent = serverFailed
      ? safeText(payload.serverUrl, '社区服务器未连接')
      : loggedIn
      ? `${provider.label} · ${safeText(profile.platformUserId || account.userId, '已登录')}`
      : '同步音乐平台账号';
  }
  if (els.communityFeId) els.communityFeId.textContent = hasCommunityIdentity ? profile.feId : '--------';
  if (els.loginCommunityStrip) {
    els.loginCommunityStrip.hidden = !loggedIn;
    els.loginCommunityStrip.classList.toggle('is-ready', hasCommunityIdentity);
    els.loginCommunityStrip.classList.toggle('is-warning', loggedIn && !hasCommunityIdentity);
  }
  if (els.loginCommunityName) {
    els.loginCommunityName.textContent = hasCommunityIdentity
      ? `${provider.label} · ${displayName || '已登录'}`
      : payload.error || '社区服务器未连接';
  }
  if (els.loginCommunityId) els.loginCommunityId.textContent = hasCommunityIdentity ? `FE ID ${profile.feId}` : 'FE ID --------';
  if (els.communityStatus) {
    if (serverFailed) els.communityStatus.textContent = payload.error || '服务器连接失败';
    else if (!loggedIn) els.communityStatus.textContent = '登录音乐平台后生成专属 8 位 ID';
    else els.communityStatus.textContent = '社区在线，好友状态实时同步';
  }
  if (els.communityAddButton) els.communityAddButton.disabled = !hasCommunityIdentity;
  if (els.communitySearchInput) els.communitySearchInput.disabled = !hasCommunityIdentity;
  renderCommunityAvatar(loggedIn ? { ...account, ...(hasCommunityIdentity ? profile : {}) } : {});
  renderCommunityDndButton();
  renderCommunityProfilePanel();
  if (state.community.friendsSignature !== nextFriendsSignature) {
    state.community.friendsSignature = nextFriendsSignature;
    renderCommunityFriends(hasCommunityIdentity ? friends : []);
  }
  updateCommunityFriendListening(hasCommunityIdentity ? friends : []);
  if (hasCommunityIdentity) {
    ensureCommunityEventStream();
    scheduleCommunityMessageBubblePoll(900);
  } else {
    stopCommunityEventStream(!loggedIn || serverFailed);
    state.community.messageBubbles = [];
    state.community.messageBubbleSeenReady = false;
    renderCommunityMessageBubbles();
  }
}

async function refreshCommunityState(provider = state.activeProvider) {
  if (!els.communityCard || state.community.loading) return null;
  state.community.loading = true;
  state.community.lastProvider = provider;
  try {
    const payload = await apiJson(`/api/community/state?${query({ provider })}`);
    renderCommunityState(payload);
    return payload;
  } catch (error) {
    renderCommunityState({
      ok: false,
      loggedIn: state.loginLoggedIn,
      provider,
      error: error.message || '社区服务器未连接'
    });
    return null;
  } finally {
    state.community.loading = false;
  }
}

function scheduleCommunityRefresh(delay = 400) {
  window.clearTimeout(state.community.refreshTimer);
  state.community.refreshTimer = window.setTimeout(() => {
    refreshCommunityState(state.activeProvider);
  }, delay);
}

function communityEventIdentityKey() {
  const profile = state.community.profile || {};
  const feId = safeText(profile.feId, '');
  const serverUrl = safeText(state.community.serverUrl, '');
  return feId && serverUrl ? `${serverUrl}|${feId}` : '';
}

function communityEventUrl() {
  const profile = state.community.profile || {};
  const feId = safeText(profile.feId, '');
  if (!feId || typeof EventSource === 'undefined') return '';
  const params = { feId };
  if (state.community.eventCursor) params.after = state.community.eventCursor;
  return `/api/community/events?${query(params)}`;
}

function stopCommunityEventStream(reset = false) {
  window.clearTimeout(state.community.eventReconnectTimer);
  state.community.eventReconnectTimer = 0;
  if (state.community.eventSource) {
    try { state.community.eventSource.close(); } catch (error) {}
  }
  state.community.eventSource = null;
  state.community.eventConnected = false;
  if (reset) {
    state.community.eventKey = '';
    state.community.eventCursor = '';
    state.community.eventReconnectDelay = 1200;
  }
}

function scheduleCommunityEventReconnect() {
  window.clearTimeout(state.community.eventReconnectTimer);
  const delay = clamp(state.community.eventReconnectDelay || 1200, 1000, 12000);
  state.community.eventReconnectDelay = Math.min(12000, Math.round(delay * 1.45));
  state.community.eventReconnectTimer = window.setTimeout(() => {
    state.community.eventReconnectTimer = 0;
    ensureCommunityEventStream();
  }, delay);
}

function ensureCommunityEventStream() {
  const key = communityEventIdentityKey();
  if (!key) {
    stopCommunityEventStream(true);
    return;
  }
  if (state.community.eventKey && state.community.eventKey !== key) {
    stopCommunityEventStream(true);
  }
  if (state.community.eventSource && state.community.eventKey === key) return;

  const url = communityEventUrl();
  if (!url) return;
  stopCommunityEventStream(false);
  state.community.eventKey = key;

  try {
    const source = new EventSource(url);
    state.community.eventSource = source;
    source.addEventListener('open', () => {
      state.community.eventConnected = true;
      state.community.eventReconnectDelay = 1200;
    });
    source.addEventListener('community-ready', () => {
      state.community.eventConnected = true;
    });
    source.addEventListener('community', handleCommunityServerEvent);
    source.addEventListener('error', () => {
      if (state.community.eventSource !== source) return;
      source.close();
      state.community.eventSource = null;
      state.community.eventConnected = false;
      if (communityEventIdentityKey()) scheduleCommunityEventReconnect();
    });
  } catch (error) {
    state.community.eventSource = null;
    state.community.eventConnected = false;
    scheduleCommunityEventReconnect();
  }
}

function handleCommunityServerEvent(event) {
  let envelope = {};
  try {
    envelope = JSON.parse(event.data || '{}');
  } catch (error) {
    return;
  }
  const type = safeText(envelope.type, '');
  const payload = envelope.payload || {};
  const seq = safeText(envelope.seq || event.lastEventId, '');
  if (seq) state.community.eventCursor = seq;

  if (type === 'message.sent') {
    const message = payload.message || {};
    const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
    const peerId = String(message.from) === me ? String(message.to || '') : String(message.from || '');
    showCommunityMessageBubble(message);
    if (peerId && state.community.selectedFriendId && peerId === String(state.community.selectedFriendId) && els.communityMessageDialog && !els.communityMessageDialog.hidden) {
      refreshCommunityMessages().catch(() => {});
    }
    scheduleCommunityRefresh(120);
    return;
  }

  if (type === 'listen.invite' || type === 'listen.responded') {
    refreshCommunityListenState().catch(() => {});
    scheduleCommunityRefresh(120);
    return;
  }

  if (type === 'listen.sync') {
    applyCommunityListenSync(payload).catch(() => {});
    scheduleCommunityRefresh(120);
    return;
  }

  if (type === 'listen.left') {
    const session = payload.session || {};
    const activeId = safeText(state.community.activeSession && state.community.activeSession.id, '');
    const leftId = safeText(session.id, '');
    if (!leftId || !activeId || leftId === activeId) {
      state.community.pendingInvite = null;
      state.community.activeSession = null;
      state.community.listenSyncSignature = '';
      stopCommunityCall(false);
      hideListenMini({ clearSession: true });
      toast('一起听已结束');
    }
    refreshCommunityListenState().catch(() => {});
    scheduleCommunityRefresh(120);
    return;
  }

  if (type === 'call.signal') {
    pollCommunityCallSignals().catch(() => {});
    return;
  }

  if (type === 'client.relay') {
    window.dispatchEvent(new CustomEvent('fe-monster-community-relay', { detail: payload.relay || payload }));
    return;
  }

  if (type === 'update.available') {
    showUpdateDialog(payload.release || {});
    return;
  }

  if (type === 'badge.assigned' || type === 'badge.cleared') {
    const targetId = safeText(payload.targetId, '');
    const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
    scheduleCommunityRefresh(120);
    if (targetId && me && targetId === me) {
      const badge = payload.badge || {};
      if (type === 'badge.assigned' && badge.label) {
        toast(`已获得徽章：${safeText(badge.label, '社区认证')}`);
      } else {
        toast('服务端徽章已清除，恢复自动认证');
      }
    }
    return;
  }

  if (type === 'friend.added' || type === 'like.added' || type === 'presence.updated' || type === 'profile.updated') {
    scheduleCommunityRefresh(120);
  }
}

async function addCommunityFriend(event) {
  event.preventDefault();
  if (!els.communitySearchInput || !els.communityAddButton) return;
  const targetId = els.communitySearchInput.value.trim();
  if (!/^\d{8}$/.test(targetId)) {
    toast('请输入 8 位好友 ID');
    els.communitySearchInput.focus();
    return;
  }

  els.communityAddButton.disabled = true;
  try {
    const payload = await apiJson(`/api/community/friends/add?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId })
    });
    if (!payload.ok) throw new Error(payload.error || '添加好友失败');
    els.communitySearchInput.value = '';
    renderCommunityState({
      ok: true,
      loggedIn: true,
      provider: state.activeProvider,
      profile: state.community.profile || {},
      friends: Array.isArray(payload.friends) ? payload.friends : state.community.friends
    });
    toast('好友已添加');
    scheduleCommunityRefresh(220);
  } catch (error) {
    toast(error.message || '添加好友失败');
  } finally {
    els.communityAddButton.disabled = !(state.community.profile && state.community.profile.feId);
  }
}

function renderCommunityDndButton() {
  if (!els.communityDndButton) return;
  const muted = !!state.community.messageBubbleMuted;
  els.communityDndButton.classList.toggle('is-active', muted);
  els.communityDndButton.setAttribute('aria-pressed', String(muted));
  els.communityDndButton.textContent = muted ? '已免扰' : '免扰';
}

function toggleCommunityMessageDnd() {
  saveCommunityMessageDnd(!state.community.messageBubbleMuted);
  renderCommunityDndButton();
  if (state.community.messageBubbleMuted) {
    state.community.messageBubbles = [];
    renderCommunityMessageBubbles();
  }
  toast(state.community.messageBubbleMuted ? '消息免打扰已开启' : '消息免打扰已关闭');
}

function communityProfileDisplayName() {
  const profile = state.community.profile || {};
  return safeText(profile.username || profile.platformUserId || profile.feId, profile.feId ? `FE ${profile.feId}` : '登录后启用社区');
}

function renderCommunityProfileAvatar() {
  if (!els.communityProfileAvatar) return;
  clearElement(els.communityProfileAvatar);
  const profile = state.community.profile || {};
  const avatarUrl = communityAvatarUrl(profile);
  if (avatarUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = avatarUrl;
    els.communityProfileAvatar.appendChild(image);
  } else {
    els.communityProfileAvatar.textContent = 'FE';
  }
}

function renderCommunityProfilePanel() {
  if (!els.communityProfileDialog) return;
  const profile = state.community.profile || {};
  const hasProfile = !!profile.feId;
  if (els.communityProfileTitle) els.communityProfileTitle.textContent = state.community.profilePage === 'nearby' ? '社区集体' : '个人资料';
  if (els.communityProfileMeta) {
    els.communityProfileMeta.textContent = hasProfile ? `FE ID ${profile.feId}` : '登录音乐账号后启用社区资料';
  }
  if (els.communityProfileDisplayName) els.communityProfileDisplayName.textContent = communityProfileDisplayName();
  if (els.communityProfileId) els.communityProfileId.textContent = hasProfile ? `FE ID ${profile.feId}` : 'FE ID --------';
  if (els.communityProfileBio && document.activeElement !== els.communityProfileBio) {
    els.communityProfileBio.value = state.community.profileBio || safeText(profile.bio, '');
  }
  if (els.communityProfileStatus) {
    const computerId = safeText(profile.computerId, '');
    els.communityProfileStatus.textContent = hasProfile
      ? (computerId ? `电脑 ID 已绑定：${computerId}` : '服务器尚未读取到本机电脑 ID')
      : '登录后可编辑个人资料';
  }
  if (els.communityProfileSave) els.communityProfileSave.disabled = !hasProfile || state.community.profileSaving;
  renderCommunityProfileAvatar();
  setCommunityProfilePage(state.community.profilePage, { refresh: false });
  setCommunityFloatingPanelPosition('profile');
}

function setCommunityProfilePage(page = 'self', options = {}) {
  const nextPage = page === 'nearby' ? 'nearby' : 'self';
  state.community.profilePage = nextPage;
  const isNearby = nextPage === 'nearby';
  if (els.communityProfileSelfTab) els.communityProfileSelfTab.classList.toggle('is-active', !isNearby);
  if (els.communityProfileGroupTab) els.communityProfileGroupTab.classList.toggle('is-active', isNearby);
  if (els.communityProfileSelfPage) {
    els.communityProfileSelfPage.hidden = isNearby;
    els.communityProfileSelfPage.classList.toggle('is-active', !isNearby);
  }
  if (els.communityProfileNearbyPage) {
    els.communityProfileNearbyPage.hidden = !isNearby;
    els.communityProfileNearbyPage.classList.toggle('is-active', isNearby);
  }
  if (els.communityProfileTitle) els.communityProfileTitle.textContent = isNearby ? '社区集体' : '个人资料';
  if (isNearby && options.refresh !== false) refreshCommunityNearby().catch(() => {});
}

function setCommunityProfileOpen(open, page = state.community.profilePage) {
  if (!els.communityProfileDialog) return;
  state.community.profileOpen = !!open;
  els.communityProfileDialog.hidden = !state.community.profileOpen;
  if (state.community.profileOpen) {
    setCommunityProfilePage(page, { refresh: page === 'nearby' });
    renderCommunityProfilePanel();
    if (els.communityProfileBio && page !== 'nearby') els.communityProfileBio.focus();
  }
}

async function saveCommunityProfileBio() {
  if (!els.communityProfileBio || !(state.community.profile && state.community.profile.feId)) return;
  const bio = els.communityProfileBio.value.trim().slice(0, 180);
  saveCommunityBioLocal(bio);
  state.community.profileSaving = true;
  renderCommunityProfilePanel();
  try {
    const payload = await apiJson(`/api/community/profile?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ bio })
    });
    if (!payload.ok) throw new Error(payload.error || '保存个人资料失败');
    if (payload.profile) state.community.profile = payload.profile;
    if (els.communityProfileStatus) els.communityProfileStatus.textContent = '个人描述已保存';
    toast('个人资料已保存');
    scheduleCommunityRefresh(220);
  } catch (error) {
    if (els.communityProfileStatus) els.communityProfileStatus.textContent = error.message || '保存失败';
    toast(error.message || '保存个人资料失败');
  } finally {
    state.community.profileSaving = false;
    renderCommunityProfilePanel();
  }
}

function renderCommunityNearby(users = state.community.nearbyUsers) {
  if (!els.communityNearbyList) return;
  clearElement(els.communityNearbyList);
  if (state.community.nearbyLoading) {
    const loading = document.createElement('span');
    loading.className = 'community-empty';
    loading.textContent = '正在读取附近社区账号';
    els.communityNearbyList.appendChild(loading);
    return;
  }
  const list = Array.isArray(users) ? users.filter((user) => user && user.feId) : [];
  if (!list.length) {
    const empty = document.createElement('span');
    empty.className = 'community-empty';
    empty.textContent = '附近暂未发现其他社区账号';
    els.communityNearbyList.appendChild(empty);
    return;
  }

  const myId = safeText(state.community.profile && state.community.profile.feId, '');
  const friendIds = new Set(state.community.friends.map((friend) => String(friend.feId)));
  list.slice(0, 10).forEach((user) => {
    const item = document.createElement('span');
    item.className = 'community-nearby-item';
    const avatar = document.createElement('span');
    avatar.className = 'community-friend-avatar';
    const avatarUrl = communityAvatarUrl(user);
    if (avatarUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = avatarUrl;
      avatar.appendChild(image);
    } else {
      avatar.textContent = 'FE';
    }
    const copy = document.createElement('span');
    copy.className = 'community-nearby-copy';
    const name = document.createElement('strong');
    name.textContent = safeText(user.username, `FE ${user.feId}`);
    const meta = document.createElement('small');
    const distance = Number(user.distanceKm);
    const distanceText = Number.isFinite(distance) && distance > 0 ? `${distance.toFixed(distance >= 10 ? 0 : 1)}km` : '同区域';
    meta.textContent = `${user.feId} · ${distanceText} · ${user.online ? '在线' : '离线'}`;
    const bio = safeText(user.bio, '');
    if (bio) meta.textContent += ` · ${bio}`;
    copy.appendChild(name);
    copy.appendChild(meta);

    const action = document.createElement('button');
    action.className = 'community-nearby-action';
    action.type = 'button';
    action.dataset.friendId = user.feId;
    const isMe = String(user.feId) === String(myId);
    const isFriend = friendIds.has(String(user.feId));
    action.textContent = isMe ? '自己' : (isFriend ? '已添加' : '添加');
    action.disabled = isMe || isFriend;
    action.addEventListener('click', handleCommunityNearbyAdd);

    item.appendChild(avatar);
    item.appendChild(copy);
    item.appendChild(action);
    els.communityNearbyList.appendChild(item);
  });
}

async function refreshCommunityNearby() {
  if (!state.community.profile || !state.community.profile.feId) return;
  state.community.nearbyLoading = true;
  renderCommunityNearby();
  try {
    const payload = await apiJson(`/api/community/nearby?${query({ provider: state.activeProvider, radiusKm: 10 })}`);
    state.community.nearbyUsers = Array.isArray(payload.users) ? payload.users : [];
    if (els.communityNearbyMeta) {
      els.communityNearbyMeta.textContent = safeText(payload.regionLabel, '同区域 5-10 公里内社区账号');
    }
  } catch (error) {
    state.community.nearbyUsers = [];
    if (els.communityNearbyMeta) els.communityNearbyMeta.textContent = error.message || '附近社区账号读取失败';
  } finally {
    state.community.nearbyLoading = false;
    renderCommunityNearby();
  }
}

async function handleCommunityNearbyAdd(event) {
  const button = event.currentTarget;
  const targetId = button && button.dataset ? button.dataset.friendId : '';
  if (!targetId) return;
  button.disabled = true;
  try {
    const payload = await apiJson(`/api/community/friends/add?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId })
    });
    if (!payload.ok) throw new Error(payload.error || '添加好友失败');
    if (Array.isArray(payload.friends)) {
      state.community.friends = payload.friends;
      state.community.friendsSignature = '';
      renderCommunityFriends(state.community.friends);
    }
    toast('附近社区账号已添加');
    scheduleCommunityRefresh(220);
    refreshCommunityNearby().catch(() => {});
  } catch (error) {
    button.disabled = false;
    toast(error.message || '添加好友失败');
  }
}

function communityFloatingPanelConfig(kind) {
  if (kind === 'profile') {
    return {
      panel: els.communityProfilePanel,
      x: 'profilePanelX',
      y: 'profilePanelY',
      rotateX: 'profilePanelRotateX',
      rotateY: 'profilePanelRotateY',
      dragging: 'profilePanelDragging',
      pointerId: 'profilePanelPointerId',
      startX: 'profilePanelStartX',
      startY: 'profilePanelStartY',
      pointerStartX: 'profilePanelPointerStartX',
      pointerStartY: 'profilePanelPointerStartY',
      startRotateX: 'profilePanelStartRotateX',
      startRotateY: 'profilePanelStartRotateY'
    };
  }
  return {
    panel: els.communityMessagePanel,
    x: 'messagePanelX',
    y: 'messagePanelY',
    rotateX: 'messagePanelRotateX',
    rotateY: 'messagePanelRotateY',
    dragging: 'messagePanelDragging',
    pointerId: 'messagePanelPointerId',
    startX: 'messagePanelStartX',
    startY: 'messagePanelStartY',
    pointerStartX: 'messagePanelPointerStartX',
    pointerStartY: 'messagePanelPointerStartY',
    startRotateX: 'messagePanelStartRotateX',
    startRotateY: 'messagePanelStartRotateY'
  };
}

function setCommunityFloatingPanelPosition(kind) {
  const config = communityFloatingPanelConfig(kind);
  const panel = config.panel;
  if (!panel) return;
  const width = panel.offsetWidth || 520;
  const height = panel.offsetHeight || 430;
  const maxX = Math.max(0, Math.floor((window.innerWidth - width) / 2) - 8);
  const maxY = Math.max(0, Math.floor((window.innerHeight - height) / 2) - 8);
  state.community[config.x] = clamp(state.community[config.x], -maxX, maxX);
  state.community[config.y] = clamp(state.community[config.y], -maxY, maxY);
  panel.style.setProperty('--community-card-x', `${Math.round(state.community[config.x])}px`);
  panel.style.setProperty('--community-card-y', `${Math.round(state.community[config.y])}px`);
  panel.style.setProperty('--community-card-rotate-x', `${state.community[config.rotateX].toFixed(2)}deg`);
  panel.style.setProperty('--community-card-rotate-y', `${state.community[config.rotateY].toFixed(2)}deg`);
}

function beginCommunityFloatingPanelDrag(kind, mode, event) {
  if (event.button !== 0) return;
  if (mode === 'move' && event.target && event.target.closest('button,input,textarea,select')) return;
  const config = communityFloatingPanelConfig(kind);
  if (!config.panel) return;
  state.community[config.dragging] = mode;
  state.community[config.pointerId] = event.pointerId;
  state.community[config.startX] = state.community[config.x];
  state.community[config.startY] = state.community[config.y];
  state.community[config.pointerStartX] = event.clientX;
  state.community[config.pointerStartY] = event.clientY;
  state.community[config.startRotateX] = state.community[config.rotateX];
  state.community[config.startRotateY] = state.community[config.rotateY];
  config.panel.classList.toggle('is-moving', mode === 'move');
  config.panel.classList.toggle('is-rotating', mode === 'rotate');
  if (event.target && typeof event.target.setPointerCapture === 'function') {
    try { event.target.setPointerCapture(event.pointerId); } catch (error) {}
  }
  event.preventDefault();
  event.stopPropagation();
}

function moveCommunityFloatingPanelDrag(kind, event) {
  const config = communityFloatingPanelConfig(kind);
  if (!state.community[config.dragging] || event.pointerId !== state.community[config.pointerId]) return;
  const dx = event.clientX - state.community[config.pointerStartX];
  const dy = event.clientY - state.community[config.pointerStartY];
  if (state.community[config.dragging] === 'move') {
    state.community[config.x] = state.community[config.startX] + dx;
    state.community[config.y] = state.community[config.startY] + dy;
  } else {
    state.community[config.rotateY] = clamp(state.community[config.startRotateY] + dx * 0.12, -26, 26);
    state.community[config.rotateX] = clamp(state.community[config.startRotateX] - dy * 0.1, -18, 18);
  }
  setCommunityFloatingPanelPosition(kind);
  event.preventDefault();
  event.stopPropagation();
}

function endCommunityFloatingPanelDrag(kind, event) {
  const config = communityFloatingPanelConfig(kind);
  if (state.community[config.pointerId] !== null && event && event.pointerId !== state.community[config.pointerId]) return;
  state.community[config.dragging] = '';
  state.community[config.pointerId] = null;
  if (config.panel) {
    config.panel.classList.remove('is-moving');
    config.panel.classList.remove('is-rotating');
  }
}

function communityMessageKey(message = {}) {
  return safeText(message.id, '') || [
    safeText(message.from, ''),
    safeText(message.to, ''),
    safeText(message.sentAt, ''),
    safeText(message.text, '')
  ].join('|');
}

function dismissCommunityMessageBubble(key = '') {
  const target = safeText(key, '');
  state.community.messageBubbles = state.community.messageBubbles.filter((bubble) => bubble.key !== target);
  renderCommunityMessageBubbles();
}

function dismissCommunityMessageBubbleByFriend(friendId = '') {
  const target = String(friendId || '');
  state.community.messageBubbles = state.community.messageBubbles.filter((bubble) => String(bubble.fromId) !== target);
  renderCommunityMessageBubbles();
}

function showCommunityMessageBubble(message = {}) {
  const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
  const fromId = safeText(message.from, '');
  const toId = safeText(message.to, '');
  if (!me || !fromId || toId !== me || fromId === me) return;
  const key = communityMessageKey(message);
  if (!key || state.community.messageBubbleSeenKeys[key]) return;
  state.community.messageBubbleSeenKeys[key] = true;
  if (state.community.messageBubbleMuted) return;
  if (state.community.selectedFriendId && String(state.community.selectedFriendId) === fromId && els.communityMessageDialog && !els.communityMessageDialog.hidden) {
    return;
  }
  const friend = communityFriendById(fromId) || { feId: fromId };
  state.community.messageBubbles = [
    {
      key,
      fromId,
      name: safeText(friend.username, `FE ${fromId}`),
      text: safeText(message.text, ''),
      sentAt: Number(message.sentAt) || Date.now()
    },
    ...state.community.messageBubbles.filter((bubble) => bubble.key !== key)
  ].slice(0, 4);
  renderCommunityMessageBubbles();
}

function renderCommunityMessageBubbles() {
  if (!els.communityMessageBubbles) return;
  clearElement(els.communityMessageBubbles);
  state.community.messageBubbles.forEach((bubble) => {
    const item = document.createElement('article');
    item.className = 'community-message-toast';
    item.dataset.messageKey = bubble.key;
    item.dataset.friendId = bubble.fromId;
    const head = document.createElement('div');
    head.className = 'community-message-toast-head';
    const title = document.createElement('strong');
    title.textContent = bubble.name;
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.communityBubbleAction = 'close';
    close.dataset.messageKey = bubble.key;
    close.setAttribute('aria-label', '关闭消息气泡');
    close.textContent = '×';
    head.appendChild(title);
    head.appendChild(close);
    const text = document.createElement('p');
    text.textContent = bubble.text;
    const form = document.createElement('form');
    form.className = 'community-message-toast-reply';
    form.dataset.friendId = bubble.fromId;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.maxLength = 500;
    input.placeholder = '直接回复';
    const send = document.createElement('button');
    send.type = 'submit';
    send.dataset.communityBubbleAction = 'reply';
    send.textContent = '回复';
    form.appendChild(input);
    form.appendChild(send);
    item.appendChild(head);
    item.appendChild(text);
    item.appendChild(form);
    els.communityMessageBubbles.appendChild(item);
  });
}

async function sendCommunityBubbleReply(form) {
  const input = form.querySelector('input');
  const targetId = form.dataset.friendId || '';
  const text = input ? input.value.trim() : '';
  if (!targetId || !text) return;
  const button = form.querySelector('button');
  if (button) button.disabled = true;
  try {
    const payload = await apiJson(`/api/community/messages/send?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId, text })
    });
    if (!payload.ok) throw new Error(payload.error || '消息发送失败');
    dismissCommunityMessageBubbleByFriend(targetId);
    if (input) input.value = '';
    if (state.community.selectedFriendId && String(state.community.selectedFriendId) === String(targetId)) {
      await refreshCommunityMessages();
    }
    toast('消息已回复');
  } catch (error) {
    toast(error.message || '消息发送失败');
  } finally {
    if (button) button.disabled = false;
  }
}

function scheduleCommunityMessageBubblePoll(delay = 0) {
  window.clearTimeout(state.community.messageBubbleTimer);
  state.community.messageBubbleTimer = window.setTimeout(() => {
    pollCommunityMessageBubbles().catch(() => {});
  }, delay);
}

async function pollCommunityMessageBubbles() {
  window.clearTimeout(state.community.messageBubbleTimer);
  state.community.messageBubbleTimer = 0;
  const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
  const friends = state.community.friends.filter((friend) => friend && friend.feId).slice(0, 8);
  if (!me || !friends.length) return;
  const recentAfter = Date.now() - 10 * 60 * 1000;
  const wasReady = state.community.messageBubbleSeenReady;
  await Promise.allSettled(friends.map(async (friend) => {
    const payload = await apiJson(`/api/community/messages?${query({ provider: state.activeProvider, targetId: friend.feId })}`);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    messages
      .filter((message) => String(message.to) === me && String(message.from) === String(friend.feId))
      .slice(-3)
      .forEach((message) => {
        const key = communityMessageKey(message);
        if (!key || state.community.messageBubbleSeenKeys[key]) return;
        if (!wasReady) {
          state.community.messageBubbleSeenKeys[key] = true;
          return;
        }
        const sentAt = Number(message.sentAt) || Date.now();
        if (sentAt >= recentAfter) showCommunityMessageBubble(message);
        else state.community.messageBubbleSeenKeys[key] = true;
      });
  }));
  state.community.messageBubbleSeenReady = true;
}

function setCommunityMessageOpen(open) {
  if (!els.communityMessageDialog) return;
  els.communityMessageDialog.hidden = !open;
  if (open) setCommunityFloatingPanelPosition('message');
  if (!open) {
    window.clearInterval(state.community.messageTimer);
    state.community.messageTimer = 0;
  }
}

async function openCommunityMessages(friendId = '') {
  const friend = communityFriendById(friendId) || state.community.friends.find((item) => item && item.feId);
  if (!friend) {
    toast('暂无好友可发送消息');
    return;
  }
  state.community.selectedFriendId = friend.feId;
  dismissCommunityMessageBubbleByFriend(friend.feId);
  if (els.communityMessageTitle) els.communityMessageTitle.textContent = safeText(friend.username, `FE ${friend.feId}`);
  if (els.communityMessageMeta) els.communityMessageMeta.textContent = `FE ID ${friend.feId}`;
  setCommunityMessageOpen(true);
  await refreshCommunityMessages();
  window.clearInterval(state.community.messageTimer);
  state.community.messageTimer = window.setInterval(refreshCommunityMessages, 4200);
  if (els.communityMessageInput) els.communityMessageInput.focus();
}

function renderCommunityMessages(messages = []) {
  if (!els.communityMessageList) return;
  clearElement(els.communityMessageList);
  const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
  if (!messages.length) {
    const empty = document.createElement('span');
    empty.className = 'community-empty';
    empty.textContent = '还没有消息';
    els.communityMessageList.appendChild(empty);
    return;
  }
  messages.forEach((message) => {
    const bubble = document.createElement('span');
    bubble.className = `community-message-bubble${String(message.from) === me ? ' is-mine' : ''}`;
    bubble.textContent = safeText(message.text, '');
    els.communityMessageList.appendChild(bubble);
  });
  els.communityMessageList.scrollTop = els.communityMessageList.scrollHeight;
}

async function refreshCommunityMessages() {
  if (!state.community.selectedFriendId || els.communityMessageDialog.hidden) return;
  try {
    const payload = await apiJson(`/api/community/messages?${query({ provider: state.activeProvider, targetId: state.community.selectedFriendId })}`);
    state.community.messages = Array.isArray(payload.messages) ? payload.messages : [];
    renderCommunityMessages(state.community.messages);
  } catch (error) {
    renderCommunityMessages([]);
  }
}

async function sendCommunityMessage(event) {
  event.preventDefault();
  if (!state.community.selectedFriendId || !els.communityMessageInput) return;
  const text = els.communityMessageInput.value.trim();
  if (!text) return;
  els.communityMessageSend.disabled = true;
  try {
    const payload = await apiJson(`/api/community/messages/send?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId: state.community.selectedFriendId, text })
    });
    if (!payload.ok) throw new Error(payload.error || '消息发送失败');
    els.communityMessageInput.value = '';
    state.community.messages = Array.isArray(payload.messages) ? payload.messages : state.community.messages;
    renderCommunityMessages(state.community.messages);
    await refreshCommunityMessages();
  } catch (error) {
    toast(error.message || '消息发送失败');
  } finally {
    els.communityMessageSend.disabled = false;
  }
}

async function likeCommunityFriend(friendId) {
  try {
    const payload = await apiJson(`/api/community/likes/add?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId: friendId })
    });
    if (!payload.ok) throw new Error(payload.error || '点赞失败');
    if (Array.isArray(payload.friends)) {
      state.community.friends = payload.friends;
      renderCommunityFriends(state.community.friends);
    }
    toast('已点赞');
  } catch (error) {
    toast(error.message || '点赞失败');
  }
}

async function inviteCommunityListen(friendId) {
  const friend = communityFriendById(friendId);
  if (friend && !friend.online) {
    toast('好友离线，无法发起一起听');
    return;
  }
  if (!state.currentSong || !state.currentSong.id) {
    toast('先播放一首歌再发起一起听');
    return;
  }
  try {
    const payload = await apiJson(`/api/community/listen/invite?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ targetId: friendId, song: currentCommunitySongPayload() })
    });
    if (!payload.ok) throw new Error(payload.error || '邀请失败');
    state.community.pendingInvite = payload.invite || null;
    renderCommunityListenState(payload.state || {});
    showListenMini({
      title: '已发起一起听',
      status: '等待好友同意邀请',
      song: currentCommunitySongPayload()
    });
    toast('已发送一起听邀请');
  } catch (error) {
    toast(error.message || '邀请失败');
  }
}

function handleCommunityFriendAction(event) {
  const button = event.target.closest('[data-community-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const friendId = button.dataset.friendId || '';
  if (!friendId) return;
  if (button.dataset.communityAction === 'message') openCommunityMessages(friendId);
  else if (button.dataset.communityAction === 'listen') inviteCommunityListen(friendId);
  else if (button.dataset.communityAction === 'like') likeCommunityFriend(friendId);
}

function showListenMini({ title = '一起听歌', status = '', song = null } = {}) {
  if (!els.listenMini) return;
  els.listenMini.hidden = false;
  if (els.listenMiniTitle) els.listenMiniTitle.textContent = title;
  if (els.listenMiniStatus) els.listenMiniStatus.textContent = status || '一起听连接中';
  const track = song || (state.community.activeSession && state.community.activeSession.song) || currentCommunitySongPayload();
  if (els.listenMiniTrack) {
    els.listenMiniTrack.textContent = `${safeText(track.title, '当前歌曲')} ${safeText(track.artist, '')}`.trim();
  }
  setListenMiniPosition();
}

function hideListenMini({ clearSession = false } = {}) {
  if (els.listenMini) els.listenMini.hidden = true;
  state.community.pendingInvite = null;
  if (clearSession) {
    state.community.activeSession = null;
    state.community.listenSyncSignature = '';
  }
  if (els.listenAcceptButton) els.listenAcceptButton.hidden = true;
  if (els.listenDeclineButton) els.listenDeclineButton.hidden = true;
  if (els.listenLeaveButton) els.listenLeaveButton.hidden = true;
  if (els.listenCallButton) els.listenCallButton.hidden = true;
  if (els.listenHangupButton) els.listenHangupButton.hidden = true;
}

function setListenMiniPosition() {
  if (!els.listenMini) return;
  const width = els.listenMini.offsetWidth || 286;
  const height = els.listenMini.offsetHeight || 150;
  state.community.listenMiniX = clamp(state.community.listenMiniX, 8, Math.max(8, window.innerWidth - width - 8));
  state.community.listenMiniY = clamp(state.community.listenMiniY, 54, Math.max(54, window.innerHeight - height - 8));
  els.listenMini.style.setProperty('--listen-mini-x', `${Math.round(state.community.listenMiniX)}px`);
  els.listenMini.style.setProperty('--listen-mini-y', `${Math.round(state.community.listenMiniY)}px`);
  if (els.communityListenBubbles) {
    const bubbleTop = Math.max(54, state.community.listenMiniY - 76);
    els.communityListenBubbles.style.setProperty('--listen-bubble-x', `${Math.round(state.community.listenMiniX)}px`);
    els.communityListenBubbles.style.setProperty('--listen-bubble-y', `${Math.round(bubbleTop)}px`);
  }
}

function beginListenMiniDrag(event) {
  if (event.button !== 0) return;
  state.community.listenMiniDragging = true;
  state.community.listenMiniPointerId = event.pointerId;
  state.community.listenMiniStartX = state.community.listenMiniX;
  state.community.listenMiniStartY = state.community.listenMiniY;
  state.community.listenMiniPointerStartX = event.clientX;
  state.community.listenMiniPointerStartY = event.clientY;
  els.listenMini.classList.add('is-dragging');
  if (event.target && typeof event.target.setPointerCapture === 'function') {
    try { event.target.setPointerCapture(event.pointerId); } catch (error) {}
  }
  event.preventDefault();
  event.stopPropagation();
}

function moveListenMiniDrag(event) {
  if (!state.community.listenMiniDragging || event.pointerId !== state.community.listenMiniPointerId) return;
  state.community.listenMiniX = state.community.listenMiniStartX + event.clientX - state.community.listenMiniPointerStartX;
  state.community.listenMiniY = state.community.listenMiniStartY + event.clientY - state.community.listenMiniPointerStartY;
  setListenMiniPosition();
  event.preventDefault();
  event.stopPropagation();
}

function endListenMiniDrag(event) {
  if (state.community.listenMiniPointerId !== null && event && event.pointerId !== state.community.listenMiniPointerId) return;
  state.community.listenMiniDragging = false;
  state.community.listenMiniPointerId = null;
  if (els.listenMini) els.listenMini.classList.remove('is-dragging');
}

async function applyCommunityListenSync(payload = {}) {
  const session = payload.session || {};
  const song = payload.song || session.song || {};
  const signature = communitySongSignature(song);
  if (!signature) return;

  const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
  const sourceId = safeText(payload.sourceId, '');
  if (me && sourceId && sourceId === me) return;

  const incomingSessionId = safeText(session.id, '');
  const activeSessionId = safeText(state.community.activeSession && state.community.activeSession.id, '');
  if (activeSessionId && incomingSessionId && activeSessionId !== incomingSessionId) return;

  const currentSignature = communitySongSignature(currentCommunitySongPayload());
  state.community.listenSyncSignature = signature;
  if (incomingSessionId) state.community.activeSession = session;
  showListenMini({
    title: '一起听进行中',
    status: sourceId ? '正在同步好友播放' : '正在同步一起听歌曲',
    song
  });
  if (signature === currentSignature) {
    await applyCommunityPlaybackControls(song);
    return;
  }
  state.community.listenSyncing = true;
  try {
    await loadSong(
      { ...song, provider: safeText(song.provider, state.activeProvider) },
      {
        communitySync: true,
        position: communitySongPosition(song),
        autoplay: song.playing !== false
      }
    );
  } finally {
    state.community.listenSyncing = false;
  }
}

async function leaveCommunityListen() {
  const invite = state.community.pendingInvite;
  if (invite && invite.id && !state.community.activeSession) {
    await respondCommunityListen(false);
    return;
  }

  const session = state.community.activeSession;
  if (!session || !session.id) {
    hideListenMini({ clearSession: true });
    return;
  }

  try {
    const payload = await apiJson(`/api/community/listen/leave?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: session.id })
    });
    if (!payload.ok) throw new Error(payload.error || '退出一起听失败');
    state.community.pendingInvite = null;
    state.community.activeSession = null;
    state.community.listenSyncSignature = '';
    stopCommunityCall(false);
    hideListenMini({ clearSession: true });
    if (payload.state) renderCommunityListenState(payload.state);
    toast('已退出一起听');
  } catch (error) {
    toast(error.message || '退出一起听失败');
  }
}

function renderCommunityListenState(payload = {}) {
  const incoming = Array.isArray(payload.incoming) ? payload.incoming : [];
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const incomingInvite = incoming[0] || null;
  const activeSession = sessions[0] || null;
  state.community.pendingInvite = incomingInvite;
  state.community.activeSession = activeSession;

  if (!incomingInvite && !activeSession) {
    hideListenMini({ clearSession: true });
    return;
  }

  if (incomingInvite) {
    showListenMini({
      title: '好友邀请一起听',
      status: `${safeText(incomingInvite.fromUser && incomingInvite.fromUser.username, '好友')} 邀请你一起听`,
      song: incomingInvite.song
    });
    if (els.listenAcceptButton) els.listenAcceptButton.hidden = false;
    if (els.listenDeclineButton) els.listenDeclineButton.hidden = false;
    if (els.listenLeaveButton) els.listenLeaveButton.hidden = true;
    if (els.listenCallButton) els.listenCallButton.hidden = true;
    if (els.listenHangupButton) els.listenHangupButton.hidden = true;
  } else if (activeSession) {
    showListenMini({
      title: '一起听进行中',
      status: '自动同步播放中',
      song: activeSession.song
    });
    if (els.listenAcceptButton) els.listenAcceptButton.hidden = true;
    if (els.listenDeclineButton) els.listenDeclineButton.hidden = true;
    if (els.listenLeaveButton) els.listenLeaveButton.hidden = false;
    if (els.listenCallButton) els.listenCallButton.hidden = state.community.call.active;
    if (els.listenHangupButton) els.listenHangupButton.hidden = !state.community.call.active;

    const sessionSignature = communitySongSignature(activeSession.song || {});
    const currentSignature = communitySongSignature(currentCommunitySongPayload());
    if (sessionSignature && sessionSignature !== currentSignature && !state.community.listenSyncing) {
      applyCommunityListenSync({ session: activeSession, song: activeSession.song }).catch(() => {});
    }
  }
}

async function refreshCommunityListenState() {
  if (!(state.community.profile && state.community.profile.feId)) return;
  try {
    const payload = await apiJson(`/api/community/listen/state?${query({ provider: state.activeProvider })}`);
    renderCommunityListenState(payload);
    if (state.community.activeSession) await pollCommunityCallSignals();
  } catch (error) {
  }
}

async function respondCommunityListen(accepted) {
  const invite = state.community.pendingInvite;
  if (!invite || !invite.id) return;
  try {
    const payload = await apiJson(`/api/community/listen/respond?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ inviteId: invite.id, accepted })
    });
    if (!payload.ok) throw new Error(payload.error || '处理邀请失败');
    state.community.pendingInvite = null;
    if (payload.session) state.community.activeSession = payload.session;
    if (payload.state) renderCommunityListenState(payload.state);
    if (!accepted) hideListenMini();
    toast(accepted ? '已加入一起听' : '已拒绝邀请');
  } catch (error) {
    toast(error.message || '处理邀请失败');
  }
}

function communitySessionTargetId() {
  const session = state.community.activeSession;
  const me = state.community.profile && state.community.profile.feId ? String(state.community.profile.feId) : '';
  const members = Array.isArray(session && session.members) ? session.members : [];
  const other = members.find((member) => member && String(member.feId) !== me);
  return other ? String(other.feId) : '';
}

async function sendCommunityCallSignal(type, payload = {}) {
  const targetId = state.community.call.targetId || communitySessionTargetId();
  const sessionId = state.community.call.sessionId || (state.community.activeSession && state.community.activeSession.id);
  if (!targetId || !sessionId) return;
  await apiJson(`/api/community/call/signal?${query({ provider: state.activeProvider })}`, {
    method: 'POST',
    body: JSON.stringify({ targetId, sessionId, type, payload })
  }).catch(() => {});
}

function stopCommunityCall(notify = true) {
  const call = state.community.call;
  if (notify && call.active) sendCommunityCallSignal('hangup', {});
  if (call.peer) {
    try { call.peer.close(); } catch (error) {}
  }
  if (call.localStream) {
    call.localStream.getTracks().forEach((track) => track.stop());
  }
  if (call.remoteAudio) {
    call.remoteAudio.srcObject = null;
  }
  state.community.call = {
    active: false,
    peer: null,
    localStream: null,
    remoteAudio: call.remoteAudio || null,
    targetId: '',
    sessionId: '',
    lastSignalId: ''
  };
  if (els.listenCallButton) els.listenCallButton.hidden = false;
  if (els.listenHangupButton) els.listenHangupButton.hidden = true;
  if (els.listenMiniStatus && state.community.activeSession) els.listenMiniStatus.textContent = '一起听进行中';
}

function ensureCommunityRemoteAudio() {
  if (state.community.call.remoteAudio) return state.community.call.remoteAudio;
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.playsInline = true;
  document.body.appendChild(audio);
  state.community.call.remoteAudio = audio;
  return audio;
}

async function ensureCommunityPeer() {
  const targetId = communitySessionTargetId();
  const sessionId = state.community.activeSession && state.community.activeSession.id;
  if (!targetId || !sessionId) throw new Error('没有可连麦的一起听会话');
  const call = state.community.call;
  if (call.peer && call.targetId === targetId && call.sessionId === sessionId) return call.peer;

  const localStream = call.localStream || await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  peer.onicecandidate = (event) => {
    if (event.candidate) sendCommunityCallSignal('candidate', event.candidate.toJSON());
  };
  peer.ontrack = (event) => {
    const audio = ensureCommunityRemoteAudio();
    audio.srcObject = event.streams[0];
  };
  state.community.call.peer = peer;
  state.community.call.localStream = localStream;
  state.community.call.targetId = targetId;
  state.community.call.sessionId = sessionId;
  state.community.call.active = true;
  if (els.listenCallButton) els.listenCallButton.hidden = true;
  if (els.listenHangupButton) els.listenHangupButton.hidden = false;
  return peer;
}

async function startCommunityCall() {
  if (!state.community.activeSession) {
    toast('先和好友进入一起听');
    return;
  }
  try {
    const peer = await ensureCommunityPeer();
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    await sendCommunityCallSignal('offer', peer.localDescription.toJSON());
    if (els.listenMiniStatus) els.listenMiniStatus.textContent = '连麦邀请已发送';
  } catch (error) {
    toast(error.message || '连麦启动失败');
    stopCommunityCall(false);
  }
}

async function handleCommunityCallSignals(signals = []) {
  for (const signal of signals) {
    if (!signal || !signal.id) continue;
    state.community.call.lastSignalId = signal.id;
    if (signal.type === 'hangup') {
      stopCommunityCall(false);
      if (els.listenMiniStatus) els.listenMiniStatus.textContent = '好友已挂断连麦';
      continue;
    }
    if (signal.type === 'offer') {
      const peer = await ensureCommunityPeer();
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendCommunityCallSignal('answer', peer.localDescription.toJSON());
      if (els.listenMiniStatus) els.listenMiniStatus.textContent = '连麦已连接';
    } else if (signal.type === 'answer' && state.community.call.peer) {
      await state.community.call.peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      if (els.listenMiniStatus) els.listenMiniStatus.textContent = '连麦已连接';
    } else if (signal.type === 'candidate' && state.community.call.peer) {
      try {
        await state.community.call.peer.addIceCandidate(new RTCIceCandidate(signal.payload));
      } catch (error) {
      }
    }
  }
}

async function pollCommunityCallSignals() {
  const sessionId = state.community.call.sessionId || (state.community.activeSession && state.community.activeSession.id);
  if (!sessionId) return;
  try {
    const payload = await apiJson(`/api/community/call/signals?${query({
      provider: state.activeProvider,
      sessionId,
      after: state.community.call.lastSignalId
    })}`);
    const signals = Array.isArray(payload.signals) ? payload.signals : [];
    if (signals.length) await handleCommunityCallSignals(signals);
  } catch (error) {
  }
}

async function reportCommunityListening(force = false) {
  if (!(state.community.profile && state.community.profile.feId)) return;
  const hasSong = !!(state.currentSong && state.currentSong.id);
  const activeSession = !!state.community.activeSession;
  const playing = !els.audio.paused && !!els.audio.src && hasSong;
  const unavailableSync = activeSession &&
    !els.audio.src &&
    state.community.listenUnavailableSignature &&
    state.community.listenUnavailableSignature === communitySongSignature(state.currentSong || {});
  const nowMs = performance.now();
  if (!hasSong || unavailableSync || (!playing && !activeSession)) {
    state.community.lastListenReportAt = nowMs;
    return;
  }
  if (!state.community.lastListenReportAt) state.community.lastListenReportAt = nowMs;
  const delta = nowMs - state.community.lastListenReportAt;
  const minInterval = activeSession ? 4500 : 14000;
  if (!force && delta < minInterval) return;
  state.community.lastListenReportAt = nowMs;
  try {
    const payload = await apiJson(`/api/community/listening?${query({ provider: state.activeProvider })}`, {
      method: 'POST',
      body: JSON.stringify({ listenMsDelta: Math.round(playing ? delta : 0), song: currentCommunitySongPayload() })
    });
    if (payload.profile) {
      renderCommunityState({
        ok: true,
        loggedIn: true,
        provider: state.activeProvider,
        profile: payload.profile,
        friends: Array.isArray(payload.friends) ? payload.friends : state.community.friends
      });
    }
    const syncedSessions = Array.isArray(payload.syncedSessions) ? payload.syncedSessions : [];
    if (syncedSessions.length) {
      const activeId = safeText(state.community.activeSession && state.community.activeSession.id, '');
      state.community.activeSession = syncedSessions.find((session) => safeText(session.id, '') === activeId) || syncedSessions[0];
      state.community.listenSyncSignature = communitySongSignature(currentCommunitySongPayload());
    }
  } catch (error) {
  }
}

function clearLoginQrTimer() {
  window.clearInterval(state.loginQrTimer);
  state.loginQrTimer = 0;
}

function setQrStatus(message) {
  els.qrStatus.textContent = message;
}

function closeLoginDialog() {
  clearLoginQrTimer();
  state.loginQrKey = '';
  state.loginQrLoading = false;
  els.loginDialog.hidden = true;
  els.loginButton.setAttribute('aria-expanded', 'false');
  els.loginRefresh.disabled = false;
}

function providerInfo(provider = state.activeProvider) {
  const id = safeText(provider, 'netease');
  return state.providers[id] || MUSIC_PROVIDERS[id] || MUSIC_PROVIDERS.netease;
}

function providerPath(path, provider = state.activeProvider) {
  return `/api/${providerInfo(provider).id}${path}`;
}

function setActiveProvider(provider, options = {}) {
  const nextProvider = providerInfo(provider).id;
  const changed = state.activeProvider !== nextProvider;
  state.activeProvider = nextProvider;
  const info = providerInfo(nextProvider);

  if (els.loginTitle) els.loginTitle.textContent = `${info.label}\u4e8c\u7ef4\u7801\u767b\u5f55`;
  if (els.loginSubtitle) els.loginSubtitle.textContent = `\u4f7f\u7528${info.appName}\u626b\u7801\u786e\u8ba4`;
  if (els.loginProviderTabs) {
    els.loginProviderTabs.querySelectorAll('[data-login-provider]').forEach((tab) => {
      const active = tab.dataset.loginProvider === nextProvider;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }

  if (changed) {
    state.loginQrKey = '';
    state.userPlaylists = [];
    state.playlistsLoggedIn = false;
    state.searchSuggestions.songs = [];
    state.searchSuggestions.query = '';
    state.searchSuggestions.requestId += 1;
    if (state.searchSuggestions.abortController) {
      state.searchSuggestions.abortController.abort();
      state.searchSuggestions.abortController = null;
    }
    setSearchSuggestionsOpen(false);
    setFavoriteLibraryOpen(false, nextProvider);
    setPlaylistFavoriteOpen(false);
    stopCommunityEventStream(true);
    hidePlaylistOrbit();
  }
  if (options.reloadQr && !els.loginDialog.hidden) loadLoginQr();
  refreshLoginStatus(nextProvider);
  if (changed) scheduleUserPlaylistsRefresh(180);
}

function renderLoginStatus(payload = {}) {
  const loggedIn = !!payload.loggedIn;
  const provider = providerInfo(payload.provider || state.activeProvider);
  state.loginLoggedIn = loggedIn;
  els.loginButton.classList.toggle('is-logged-in', loggedIn);
  els.loginLabel.textContent = loggedIn ? accountName(payload) || `${provider.label}\u5df2\u767b\u5f55` : `${provider.label}\u767b\u5f55`;
  els.loginButton.setAttribute('aria-label', loggedIn ? `${provider.label}\u5df2\u767b\u5f55\uff1a${els.loginLabel.textContent}` : `\u6253\u5f00${provider.label}\u4e8c\u7ef4\u7801\u767b\u5f55`);
  renderLoginAvatar(payload, loggedIn);
}

async function refreshLoginStatus(provider = state.activeProvider) {
  try {
    const payload = await apiJson(`/api/login/status?${query({ provider })}`);
    renderLoginStatus(payload);
    if (payload.loggedIn) scheduleCommunityRefresh(120);
    else renderCommunityState({ provider, loggedIn: false, account: payload.account || {} });
    return payload;
  } catch (error) {
    renderLoginStatus({ provider, loggedIn: false });
    renderCommunityState({ provider, loggedIn: false });
    return { provider, loggedIn: false };
  }
}

function resetQrImage(message = '\u751f\u6210\u4e8c\u7ef4\u7801') {
  els.qrImage.removeAttribute('src');
  els.qrShell.classList.remove('has-qr');
  els.qrPlaceholder.textContent = message;
}

function showLoginDialog() {
  els.loginDialog.hidden = false;
  els.loginButton.setAttribute('aria-expanded', 'true');
  setActiveProvider(state.activeProvider);
  loadLoginQr();
}

function qrCodeMessage(code, message, provider = state.activeProvider) {
  const info = providerInfo(provider);
  if (provider === 'kugou') {
    if (code === 0) return '\u4e8c\u7ef4\u7801\u5df2\u8fc7\u671f\uff0c\u8bf7\u5237\u65b0';
    if (code === 1) return `\u7b49\u5f85${info.appName}\u626b\u7801`;
    if (code === 2) return '\u5df2\u626b\u7801\uff0c\u8bf7\u5728\u624b\u673a\u4e0a\u786e\u8ba4';
    if (code === 4) return '\u767b\u5f55\u6210\u529f\uff0c\u6b63\u5728\u540c\u6b65\u6b4c\u5355';
  }
  if (code === 800) return '\u4e8c\u7ef4\u7801\u5df2\u8fc7\u671f\uff0c\u8bf7\u5237\u65b0';
  if (code === 801) return `\u7b49\u5f85${info.appName}\u626b\u7801`;
  if (code === 802) return '\u5df2\u626b\u7801\uff0c\u8bf7\u5728\u624b\u673a\u4e0a\u786e\u8ba4';
  if (code === 803) return '\u767b\u5f55\u6210\u529f\uff0c\u6b63\u5728\u540c\u6b65\u6b4c\u5355';
  if (code === 0 || code === 200) return message || `\u7b49\u5f85${info.appName}\u626b\u7801`;
  return message || '\u7b49\u5f85\u626b\u7801\u786e\u8ba4';
}

function loginQrCode(payload, provider = state.activeProvider) {
  const data = payload && payload.data ? payload.data : {};
  if (provider === 'kugou') {
    return Number(
      data.status ?? data.code ?? data.result ??
      payload.code ?? payload.status ?? payload.result ?? 0
    ) || 0;
  }
  return Number(
    payload.code ?? payload.status ?? payload.result ??
    data.code ?? data.status ?? data.result ?? 0
  ) || 0;
}

function loginQrImage(payload) {
  const data = payload && payload.data ? payload.data : {};
  return safeText(
    data.qrcode_img || data.qrimg || data.qrImg || data.base64 || data.image || data.img || data.url || data.qrurl || data.qrcode || data.qrCode,
    safeText(
      payload.qrcode_img || payload.qrimg || payload.qrImg || payload.base64 || payload.image || payload.img || payload.url || payload.qrurl || payload.qrcode || payload.qrCode,
      ''
    )
  );
}

function loginQrKeyValue(payload) {
  const data = payload && payload.data ? payload.data : {};
  const ptqrtoken = safeText(data.ptqrtoken || data.ptqrToken || payload.ptqrtoken || payload.ptqrToken, '');
  const qrsig = safeText(data.qrsig || payload.qrsig, '');
  if (ptqrtoken && qrsig) return `qq|${ptqrtoken}|${encodeURIComponent(qrsig)}`;
  return safeText(
    data.unikey || data.key || data.qrKey || data.qrcode || data.qrsig || data.token || data.id,
    safeText(payload.unikey || payload.key || payload.qrKey || payload.qrcode || payload.qrsig || payload.token || payload.id, '')
  );
}

function loginQrSucceeded(payload, provider = state.activeProvider) {
  const data = payload && payload.data ? payload.data : {};
  const code = loginQrCode(payload, provider);
  const text = `${safeText(payload.message || payload.msg || data.message || data.msg, '')}`.toLowerCase();
  return code === 803 ||
    (provider === 'kugou' && code === 4) ||
    payload.loggedIn === true ||
    payload.success === true ||
    payload.isOk === true ||
    data.loggedIn === true ||
    data.success === true ||
    data.isOk === true ||
    /success|logged|confirmed|authorized|\u6210\u529f|\u5df2\u767b\u5f55/.test(text);
}

function loginQrExpired(payload, provider = state.activeProvider) {
  const data = payload && payload.data ? payload.data : {};
  const code = loginQrCode(payload, provider);
  const text = `${safeText(payload.message || payload.msg || data.message || data.msg, '')}`.toLowerCase();
  return code === 800 || (provider === 'kugou' && code === 0) || /expired|timeout|\u8fc7\u671f/.test(text);
}

function loginQrFailureMessage(error, provider = state.activeProvider) {
  const info = providerInfo(provider);
  const raw = safeText(error && error.message, '');
  if (/unavailable|ClosedChannelException|connection refused|connect|timeout|ECONNREFUSED/i.test(raw)) {
    return `${info.label}\u63a5\u53e3\u670d\u52a1\u672a\u5c31\u7eea\uff1a${info.apiUrl}\u3002${info.setup}`;
  }
  if (/404|not found|Cannot GET/i.test(raw)) {
    return `${info.label}\u63a5\u53e3\u5df2\u8fde\u4e0a\uff0c\u4f46\u6ca1\u6709\u4e8c\u7ef4\u7801\u767b\u5f55\u7aef\u70b9\u3002${info.setup}`;
  }
  return raw || '\u4e8c\u7ef4\u7801\u751f\u6210\u5931\u8d25';
}

async function checkLoginQr() {
  if (!state.loginQrKey) return;
  const provider = state.activeProvider;
  try {
    const payload = await apiJson(`${providerPath('/login/qr/check', provider)}?${query({ key: state.loginQrKey })}`);
    if (provider !== state.activeProvider) return;
    const code = loginQrCode(payload, provider);
    setQrStatus(qrCodeMessage(code, payload.message || payload.msg, provider));

    if (loginQrExpired(payload, provider)) {
      clearLoginQrTimer();
      resetQrImage('\u4e8c\u7ef4\u7801\u8fc7\u671f');
      return;
    }

    if (loginQrSucceeded(payload, provider)) {
      clearLoginQrTimer();
      const account = await refreshLoginStatus(provider);
      await refreshUserPlaylists();
      window.setTimeout(() => {
        if (account.loggedIn) closeLoginDialog();
      }, 650);
    }
  } catch (error) {
    clearLoginQrTimer();
    setQrStatus(loginQrFailureMessage(error, provider));
  }
}

async function loadLoginQr() {
  if (state.loginQrLoading) return;
  const provider = state.activeProvider;
  const info = providerInfo(provider);
  state.loginQrLoading = true;
  clearLoginQrTimer();
  state.loginQrKey = '';
  resetQrImage('\u751f\u6210\u4e8c\u7ef4\u7801');
  setQrStatus(`\u6b63\u5728\u8fde\u63a5${info.label}\u7b2c\u4e09\u65b9 API`);
  els.loginRefresh.disabled = true;

  try {
    const keyPayload = await apiJson(providerPath('/login/qr/key', provider));
    if (provider !== state.activeProvider) return;
    const key = loginQrKeyValue(keyPayload);
    if (!key) throw new Error(keyPayload.error || `\u672a\u83b7\u53d6\u5230${info.label}\u4e8c\u7ef4\u7801 key`);

    state.loginQrKey = key;
    let qrImage = loginQrImage(keyPayload);
    if (!qrImage) {
      const qrPayload = await apiJson(`${providerPath('/login/qr/create', provider)}?${query({ key, qrimg: 'true' })}`);
      if (provider !== state.activeProvider) return;
      qrImage = loginQrImage(qrPayload);
      if (!qrImage) throw new Error(qrPayload.error || `\u672a\u83b7\u53d6\u5230${info.label}\u4e8c\u7ef4\u7801\u56fe\u7247`);
    }

    els.qrImage.src = qrImage;
    els.qrShell.classList.add('has-qr');
    setQrStatus(`\u7b49\u5f85${info.appName}\u626b\u7801`);
    state.loginQrTimer = window.setInterval(checkLoginQr, 1800);
    checkLoginQr();
  } catch (error) {
    resetQrImage('\u670d\u52a1\u672a\u5c31\u7eea');
    setQrStatus(loginQrFailureMessage(error, provider));
  } finally {
    state.loginQrLoading = false;
    els.loginRefresh.disabled = false;
  }
}

function hidePlaylistOrbit() {
  els.playlistOrbit.hidden = true;
  clearElement(els.playlistCards);
  els.playlistStatus.textContent = `${providerInfo().label}\u6b4c\u5355`;
  state.playlistSignature = '';
  closePlaylistShelf({ resetActive: true });
}

function playlistSubtitle(playlist) {
  const count = Number(playlist.trackCount) || 0;
  const playCount = Number(playlist.playCount) || 0;
  if (count && playCount) return `${count} \u9996 \u00b7 ${compactCount(playCount)} \u64ad\u653e`;
  if (count) return `${count} \u9996`;
  if (playCount) return `${compactCount(playCount)} \u64ad\u653e`;
  return safeText(playlist.creator, `${providerInfo(playlist.provider || state.activeProvider).label}\u6b4c\u5355`);
}

function createPlaylistCard(playlist, index) {
  const provider = providerInfo(playlist.provider || state.activeProvider);
  const button = document.createElement('button');
  button.className = 'orb-playlist-card';
  button.type = 'button';
  button.dataset.playlistId = playlist.id;
  button.dataset.playlistProvider = provider.id;
  button.dataset.playlistName = safeText(playlist.name, `${provider.label}\u6b4c\u5355`);
  button.dataset.playlistCover = safeText(playlist.cover, '');
  button.dataset.slot = String(index + 1);
  button.dataset.playlistIndex = String(index);
  button.style.setProperty('--album-index', String(index));
  button.setAttribute('role', 'option');
  button.setAttribute('aria-label', `\u9009\u62e9\u6b4c\u5355\uff1a${button.dataset.playlistName}`);
  if (String(playlist.id) === String(state.activePlaylistId)) {
    button.classList.add('is-active');
    button.setAttribute('aria-current', 'true');
  }

  const cover = document.createElement('span');
  cover.className = 'orb-playlist-cover';

  const fallback = document.createElement('span');
  fallback.textContent = '\u6b4c\u5355';
  cover.appendChild(fallback);

  const imageUrl = proxiedImageUrl(playlist.cover);
  if (imageUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = imageUrl;
    image.addEventListener('load', () => removeElement(fallback));
    image.addEventListener('error', () => removeElement(image));
    cover.appendChild(image);
  }

  const copy = document.createElement('span');
  copy.className = 'orb-playlist-copy';

  const title = document.createElement('strong');
  title.textContent = safeText(playlist.name, `${provider.label}\u6b4c\u5355`);

  const meta = document.createElement('small');
  meta.textContent = playlistSubtitle(playlist);

  copy.appendChild(title);
  copy.appendChild(meta);
  button.appendChild(cover);
  button.appendChild(copy);
  window.requestAnimationFrame(() => button.classList.add('is-mounted'));
  return button;
}

function updateActivePlaylistCard() {
  const cards = Array.from(els.playlistCards.querySelectorAll('.orb-playlist-card'));
  if (!cards.length) return;
  const maxIndex = cards.length - 1;
  state.playlistFocusIndex = clamp(Math.round(state.playlistFocusIndex || 0), 0, maxIndex);
  cards.forEach((card, index) => {
    const isActive = String(card.dataset.playlistId) === String(state.activePlaylistId);
    const offset = index - state.playlistFocusIndex;
    const distance = Math.abs(offset);
    const isFocused = index === state.playlistFocusIndex;
    card.classList.toggle('is-active', isActive);
    card.classList.toggle('is-focused', isFocused);
    card.classList.toggle('is-muted', !isFocused);
    card.classList.toggle('is-stashed', state.playlistSongPageOpen && !isActive);
    card.style.setProperty('--album-offset', String(offset));
    card.style.setProperty('--album-distance', String(distance));
    card.style.setProperty('--album-scale', String(clamp(1 - distance * 0.1, 0.56, 1)));
    card.setAttribute('aria-selected', String(isFocused));
    if (isActive) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
}

function setPlaylistFocus(index) {
  const cards = Array.from(els.playlistCards.querySelectorAll('.orb-playlist-card'));
  if (!cards.length) return;
  const count = cards.length;
  state.playlistFocusIndex = ((Math.round(index) % count) + count) % count;
  updateActivePlaylistCard();
  cards[state.playlistFocusIndex]?.focus({ preventScroll: true });
}

function setSongFocus(index) {
  const buttons = Array.from(els.playlistSongStack.querySelectorAll('.shelf-song-button'));
  if (!buttons.length) return;
  const count = buttons.length;
  state.songFocusIndex = ((Math.round(index) % count) + count) % count;
  buttons.forEach((button, itemIndex) => {
    const offset = itemIndex - state.songFocusIndex;
    const distance = Math.abs(offset);
    const focused = itemIndex === state.songFocusIndex;
    button.classList.toggle('is-focused', focused);
    button.classList.toggle('is-muted', !focused);
    button.style.setProperty('--song-offset', String(offset));
    button.style.setProperty('--song-distance', String(distance));
    button.style.setProperty('--song-scale', String(clamp(1 - distance * 0.09, 0.62, 1)));
    button.setAttribute('aria-selected', String(focused));
  });
  buttons[state.songFocusIndex]?.focus({ preventScroll: true });
}

function renderPlaylistOrbit(playlists) {
  const visible = visiblePlaylists(playlists);
  if (!visible.length) {
    hidePlaylistOrbit();
    return;
  }

  const signature = playlistSignature(visible);
  if (!els.playlistOrbit.hidden && signature === state.playlistSignature) {
    updateActivePlaylistCard();
    return;
  }

  els.playlistStatus.textContent = `\u6211\u7684${providerInfo().label}\u6b4c\u5355`;
  const fragment = document.createDocumentFragment();
  visible.forEach((playlist, index) => fragment.appendChild(createPlaylistCard(playlist, index)));
  clearElement(els.playlistCards);
  els.playlistCards.appendChild(fragment);
  state.playlistSignature = signature;
  state.playlistFocusIndex = clamp(state.playlistFocusIndex || 0, 0, Math.max(0, visible.length - 1));
  els.playlistOrbit.hidden = false;
  window.requestAnimationFrame(updateActivePlaylistCard);
}

async function refreshUserPlaylists() {
  if (state.playlistsLoading) return;
  const provider = state.activeProvider;
  state.playlistsLoading = true;
  try {
    const data = await apiJson(providerPath('/user/playlists', provider));
    if (provider !== state.activeProvider) return;
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];
    state.playlistsLoggedIn = !!data.loggedIn;
    state.userPlaylists = state.playlistsLoggedIn ? playlists : [];

    if (state.playlistsLoggedIn && playlists.length) renderPlaylistOrbit(playlists);
    else hidePlaylistOrbit();
  } catch (error) {
    state.playlistsLoggedIn = false;
    state.userPlaylists = [];
    hidePlaylistOrbit();
  } finally {
    state.playlistsLoading = false;
  }
}

function scheduleUserPlaylistsRefresh(delay = 0) {
  window.clearTimeout(state.playlistRefreshTimer);
  state.playlistRefreshTimer = window.setTimeout(refreshUserPlaylists, delay);
}

function playlistById(playlistId) {
  return state.userPlaylists.find((playlist) => String(playlist.id) === String(playlistId)) || null;
}

function degrees360(value) {
  return ((value % 360) + 360) % 360;
}

function isShelfBackFacing(rotateY) {
  const angle = degrees360(rotateY);
  return angle > 90 && angle < 270;
}

function setShelfRotation(x, y) {
  state.shelfRotateX = clamp(x, -58, 58);
  state.shelfRotateY = y;
  els.playlistShelfStage.style.setProperty('--shelf-rotate-x', `${state.shelfRotateX}deg`);
  els.playlistShelfStage.style.setProperty('--shelf-rotate-y', `${state.shelfRotateY}deg`);
  els.playlistShelf.classList.toggle('is-back-facing', isShelfBackFacing(state.shelfRotateY));
}

function syncShelfRotationToPlaybackView(options = {}) {
  if (!state.playbackPage || els.playlistShelf.hidden) return;
  if (state.shelfDragging && state.shelfInteraction === 'move' && !options.force) return;
  const yawDeg = state.playbackVisual.yaw * 57.2958;
  const pitchDeg = state.playbackVisual.pitch * 57.2958;
  setShelfRotation(-6 + pitchDeg * 0.38, -18 + yawDeg * 1.08);
}

function showShelfFront() {
  setShelfRotation(state.playbackPage ? -6 : -7, state.playbackPage ? -18 : -14);
}

function resetShelfRotation() {
  if (reducedMotion) {
    setShelfRotation(0, 0);
    return;
  }
  if (state.playbackPage) {
    syncShelfRotationToPlaybackView({ force: true });
    return;
  }
  setShelfRotation(state.playbackPage ? -6 : -7, state.playbackPage ? -18 : -14);
}

function constrainShelfCenter(value, halfSize, availableSize, startInset, endInset) {
  const min = Math.min(availableSize / 2, halfSize + startInset);
  const max = Math.max(min, availableSize - halfSize - endInset);
  return clamp(value, min, max);
}

function setShelfPosition(left, top, options = {}) {
  const stageRect = els.stage.getBoundingClientRect();
  const width = options.width || (state.playbackPage ? 318 : 368);
  const height = options.height || (state.playbackPage ? 382 : 430);
  const sideInset = options.sideInset ?? 18;
  const topInset = options.topInset ?? 18;
  const bottomInset = options.bottomInset ?? 94;
  const nextLeft = constrainShelfCenter(left, width / 2, stageRect.width, sideInset, sideInset);
  const nextTop = constrainShelfCenter(top, height / 2, stageRect.height, topInset, bottomInset);
  els.playlistShelfStage.style.setProperty('--shelf-left', `${Math.round(nextLeft)}px`);
  els.playlistShelfStage.style.setProperty('--shelf-top', `${Math.round(nextTop)}px`);
}

function currentShelfCenter() {
  const stageRect = els.stage.getBoundingClientRect();
  const shelfRect = els.playlistShelfStage.getBoundingClientRect();
  if (shelfRect.width > 0 && shelfRect.height > 0) {
    return {
      left: shelfRect.left - stageRect.left + shelfRect.width / 2,
      top: shelfRect.top - stageRect.top + shelfRect.height / 2
    };
  }
  return state.playbackPage
    ? { left: stageRect.width - 226, top: stageRect.height * 0.49 }
    : { left: stageRect.width / 2 + 406, top: stageRect.height * 0.47 };
}

function positionShelfForPlayback() {
  const stageRect = els.stage.getBoundingClientRect();
  setShelfPosition(stageRect.width - 226, stageRect.height * 0.49, {
    width: 318,
    height: 382,
    bottomInset: 104
  });
}

function positionShelfNearCard(card) {
  if (!card || state.playbackPage) return;
  const stageRect = els.stage.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const shelfWidth = 368;
  const shelfHeight = 430;
  setShelfPosition(
    cardRect.right - stageRect.left + shelfWidth * 0.28,
    cardRect.top - stageRect.top + cardRect.height / 2,
    { width: shelfWidth, height: shelfHeight, bottomInset: 94 }
  );
}

function syncPlaybackChromeClasses() {
  const playback = state.playbackPage;
  const pinned = state.playbackChrome.dockPinned;
  els.appShell.classList.toggle('is-search-peek', playback && state.playbackChrome.searchVisible);
  els.appShell.classList.toggle('is-dock-peek', state.playbackChrome.dockVisible || pinned);
  els.appShell.classList.toggle('is-dock-pinned', pinned);
  if (els.dockPinButton) {
    els.dockPinButton.classList.toggle('is-active', state.playbackChrome.dockPinned);
    els.dockPinButton.setAttribute('aria-pressed', String(state.playbackChrome.dockPinned));
    els.dockPinButton.title = state.playbackChrome.dockPinned ? '取消固定播放栏' : '固定播放栏';
    els.dockPinButton.setAttribute('aria-label', els.dockPinButton.title);
  }
}

function setPlaybackChromeVisibility(next = {}) {
  if (typeof next.searchVisible === 'boolean') state.playbackChrome.searchVisible = next.searchVisible;
  if (typeof next.dockVisible === 'boolean') state.playbackChrome.dockVisible = next.dockVisible;
  syncPlaybackChromeClasses();
}

function resetPlaybackChromeForMode() {
  state.playbackChrome.searchVisible = false;
  state.playbackChrome.dockVisible = false;
  syncPlaybackChromeClasses();
}

function updatePlaybackChromeFromPointer(event) {
  if (!event) return;
  const target = event.target instanceof Element ? event.target : null;
  const overSearchChrome = !!target && !!target.closest('.top-search, .search-suggestions, .favorite-library, .runtime-topbar, .runtime-settings-panel, .window-controls, .netease-login-button, .home-button, .diy-button, .diy-sidebar, .netease-login-dialog');
  const overDock = !!target && !!target.closest('.player-dock');
  setPlaybackChromeVisibility({
    searchVisible: state.playbackPage && (overSearchChrome || event.clientY <= 96),
    dockVisible: state.playbackChrome.dockPinned || overDock || event.clientY >= window.innerHeight - 128
  });
}

function updatePlaybackPageClass() {
  els.appShell.classList.toggle('is-playback-page', state.playbackPage);
  els.appShell.classList.toggle('has-playlist-song-page', state.playlistSongPageOpen);
  els.stage.classList.toggle('is-playback-page', state.playbackPage);
  els.playlistShelf.classList.toggle('is-song-page-open', state.playlistSongPageOpen);
  setPlaybackLyricVisible(state.playbackPage);
  updateDynamicCubeVisibility();
  updateSonicTopographyVisibility();
  updateWallpaperVisibility();
  resetPlaybackChromeForMode();
}

function enterPlaybackPage() {
  state.playbackPage = true;
  updatePlaybackPageClass();
  if (state.userPlaylists.length) renderPlaylistOrbit(state.userPlaylists);
}

function enterPresetPlaybackPage(preset) {
  setDiyPreset(preset);
  enterPlaybackPage();
}

function returnHomePage() {
  state.playbackPage = false;
  closePlaylistShelf();
  resetPlaybackView();
  updatePlaybackPageClass();
}

function showActivePlaylistShelf(options = {}) {
  if (!state.activePlaylist) return false;
  renderPlaylistShelf(state.activePlaylist, state.activePlaylistSongs, {
    preserveScroll: options.preserveScroll !== false
  });
  return true;
}

function hidePlaylistShelf() {
  state.shelfHiddenByUser = true;
  closePlaylistShelf();
}

function setShelfCover(playlist = {}) {
  const url = proxiedImageUrl(playlist.cover || '');
  [
    [els.playlistShelfCover, els.playlistShelfCoverImage],
    [els.playlistShelfBackCover, els.playlistShelfBackCoverImage]
  ].forEach(([frame, image]) => {
    if (!frame || !image) return;
    if (!url) {
      image.removeAttribute('src');
      frame.classList.remove('has-cover');
      return;
    }
    image.src = url;
    frame.classList.add('has-cover');
  });
}

function shelfSongSubtitle(song) {
  const artist = safeText(song.artist, '');
  const album = safeText(song.album, '');
  if (artist && album) return `${artist} · ${album}`;
  return artist || album || '网易云音乐';
}

function shelfMeta(playlist, songs) {
  const count = songs.length || Number(playlist.trackCount) || 0;
  const creator = safeText(playlist.creator, '');
  return creator ? `${count} 首 · ${creator}` : `${count} 首`;
}

function createShelfSongButton(song, index) {
  const button = document.createElement('button');
  button.className = 'shelf-song-button';
  button.type = 'button';
  button.dataset.songIndex = String(index);
  button.dataset.songId = safeText(song.id, '');
  button.style.setProperty('--song-depth', `${8 + Math.min(index % 5, 4) * 9}px`);
  button.style.setProperty('--song-delay', `${Math.min(index, 8) * 28}ms`);
  button.setAttribute('role', 'option');
  button.setAttribute('aria-label', `播放：${safeText(song.title, '未命名歌曲')}`);

  const number = document.createElement('span');
  number.className = 'shelf-song-index';
  number.textContent = String(index + 1).padStart(2, '0');

  const cover = document.createElement('span');
  cover.className = 'shelf-song-cover';
  const coverFallback = document.createElement('span');
  coverFallback.textContent = 'FE';
  cover.appendChild(coverFallback);
  const coverUrl = proxiedImageUrl(song.cover || '');
  if (coverUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = coverUrl;
    image.addEventListener('load', () => cover.classList.add('has-cover'));
    image.addEventListener('error', () => removeElement(image));
    cover.appendChild(image);
  }

  const copy = document.createElement('span');
  copy.className = 'shelf-song-copy';

  const title = document.createElement('strong');
  title.textContent = safeText(song.title, '未命名歌曲');

  const meta = document.createElement('small');
  meta.textContent = shelfSongSubtitle(song);

  const duration = document.createElement('span');
  duration.className = 'shelf-song-duration';
  duration.textContent = song.duration ? formatTime(Number(song.duration)) : '--:--';

  const play = document.createElement('span');
  play.className = 'shelf-song-play';
  play.setAttribute('aria-hidden', 'true');

  copy.appendChild(title);
  copy.appendChild(meta);
  button.appendChild(number);
  button.appendChild(cover);
  button.appendChild(copy);
  button.appendChild(duration);
  button.appendChild(play);
  return button;
}

function updateShelfCurrentSong() {
  const currentId = state.currentSong && state.currentSong.id ? String(state.currentSong.id) : '';
  [els.playlistSongStack, els.playlistSongStackBack].forEach((stack) => {
    if (!stack) return;
    stack.querySelectorAll('.shelf-song-button').forEach((button) => {
      const isCurrent = currentId && String(button.dataset.songId) === currentId;
      button.classList.toggle('is-current', !!isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  });
}

function renderShelfSongsInto(stack) {
  if (!stack) return;
  clearElement(stack);
  if (!state.activePlaylistSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'playlist-shelf-empty';
    empty.textContent = '暂无可播放歌曲';
    stack.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.activePlaylistSongs.forEach((song, index) => fragment.appendChild(createShelfSongButton(song, index)));
  stack.appendChild(fragment);
  const mount = () => stack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
  if (!reducedMotion) window.requestAnimationFrame(mount);
  else mount();
}

function renderShelfSongs() {
  renderShelfSongsInto(els.playlistSongStackBack);
  clearElement(els.playlistSongStack);
  if (!state.activePlaylistSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'playlist-shelf-empty';
    empty.textContent = '暂无可播放歌曲';
    els.playlistSongStack.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.activePlaylistSongs.forEach((song, index) => fragment.appendChild(createShelfSongButton(song, index)));
  els.playlistSongStack.appendChild(fragment);
  updateShelfCurrentSong();
  const currentIndex = state.activePlaylistSongs.findIndex((song) => {
    const currentId = state.currentSong && state.currentSong.id ? String(state.currentSong.id) : '';
    return currentId && String(song.id) === currentId;
  });
  setSongFocus(currentIndex >= 0 ? currentIndex : clamp(state.songFocusIndex || 0, 0, state.activePlaylistSongs.length - 1));
  if (!reducedMotion) {
    window.requestAnimationFrame(() => {
      els.playlistSongStack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
    });
  } else {
    els.playlistSongStack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
  }
}

function renderPlaylistShelf(playlist, songs, options = {}) {
  const previousScroll = els.playlistShelfScroll ? els.playlistShelfScroll.scrollTop : 0;
  state.activePlaylist = playlist;
  state.activePlaylistSongs = songs;
  state.playlistSongPageOpen = true;
  els.playlistShelfTitle.textContent = safeText(playlist.name, '网易云歌单');
  els.playlistShelfMeta.textContent = shelfMeta(playlist, songs);
  if (els.playlistShelfBackTitle) els.playlistShelfBackTitle.textContent = els.playlistShelfTitle.textContent;
  if (els.playlistShelfBackMeta) els.playlistShelfBackMeta.textContent = els.playlistShelfMeta.textContent;
  setShelfCover(playlist);
  renderShelfSongs();
  els.playlistShelf.hidden = false;
  state.shelfHiddenByUser = false;
  els.playlistShelf.classList.remove('is-loading');
  els.playlistShelf.removeAttribute('aria-busy');
  if (els.playlistShelfScroll) {
    if (options.preserveScroll) els.playlistShelfScroll.scrollTop = previousScroll;
    else els.playlistShelfScroll.scrollTop = 0;
  }
  if (els.playlistShelfBackScroll) {
    if (options.preserveScroll) els.playlistShelfBackScroll.scrollTop = previousScroll;
    else els.playlistShelfBackScroll.scrollTop = 0;
  }
  updatePlaybackPageClass();
  updateActivePlaylistCard();
  window.requestAnimationFrame(() => els.playlistShelf.classList.add('is-open'));
}

function renderShelfLoading(playlist) {
  state.activePlaylist = playlist;
  state.activePlaylistSongs = [];
  state.songFocusIndex = 0;
  state.playlistSongPageOpen = true;
  els.playlistShelfTitle.textContent = safeText(playlist.name, '网易云歌单');
  els.playlistShelfMeta.textContent = '正在读取歌单';
  if (els.playlistShelfBackTitle) els.playlistShelfBackTitle.textContent = els.playlistShelfTitle.textContent;
  if (els.playlistShelfBackMeta) els.playlistShelfBackMeta.textContent = els.playlistShelfMeta.textContent;
  setShelfCover(playlist);
  clearElement(els.playlistSongStack);
  if (els.playlistSongStackBack) clearElement(els.playlistSongStackBack);
  const loading = document.createElement('div');
  loading.className = 'playlist-shelf-empty';
  loading.textContent = '读取中';
  els.playlistSongStack.appendChild(loading);
  if (els.playlistSongStackBack) els.playlistSongStackBack.appendChild(loading.cloneNode(true));
  els.playlistShelf.hidden = false;
  state.shelfHiddenByUser = false;
  els.playlistShelf.classList.add('is-open', 'is-loading');
  els.playlistShelf.setAttribute('aria-busy', 'true');
  updatePlaybackPageClass();
  updateActivePlaylistCard();
}

function closePlaylistShelf({ resetActive = false } = {}) {
  clearShelfPressTimer();
  els.playlistShelf.classList.remove('is-open', 'is-loading', 'is-playback-mode', 'is-pressing', 'is-dragging', 'is-position-dragging', 'is-back-facing');
  els.playlistShelf.hidden = true;
  els.playlistShelf.removeAttribute('aria-busy');
  state.playlistSongPageOpen = false;
  state.shelfDragging = false;
  state.shelfPointerId = null;
  state.shelfInteraction = '';
  if (resetActive) {
    state.shelfHiddenByUser = false;
    state.activePlaylistId = '';
    state.activePlaylist = null;
    state.activePlaylistSongs = [];
    updateActivePlaylistCard();
  }
  updateActivePlaylistCard();
  updatePlaybackPageClass();
}

async function loadPlaylistFromCard(card) {
  const playlistId = card.dataset.playlistId;
  const provider = card.dataset.playlistProvider || state.activeProvider;
  const playlistIndex = Number(card.dataset.playlistIndex || '0');
  const info = providerInfo(provider);
  const playlistName = card.dataset.playlistName || `${info.label}\u6b4c\u5355`;
  if (!playlistId) return;
  if (Number.isFinite(playlistIndex) && playlistIndex !== state.playlistFocusIndex) {
    setPlaylistFocus(playlistIndex);
    return;
  }
  const playlist = playlistById(playlistId) || {
    id: playlistId,
    name: playlistName,
    cover: card.dataset.playlistCover || '',
    provider: info.id
  };

  state.activePlaylistId = playlistId;
  updateActivePlaylistCard();
  if (!state.playbackPage) enterPlaybackPage();

  if (String(state.activePlaylist && state.activePlaylist.id) === String(playlistId) && state.activePlaylistSongs.length) {
    renderPlaylistShelf(state.activePlaylist, state.activePlaylistSongs, { preserveScroll: true });
    return;
  }
  if (state.shelfLoadingPlaylistId === String(playlistId)) return;

  state.shelfLoadingPlaylistId = String(playlistId);
  card.classList.add('is-loading');
  card.disabled = true;
  card.setAttribute('aria-busy', 'true');
  renderShelfLoading(playlist);
  try {
    const data = await apiJson(`${providerPath('/playlist/tracks', provider)}?${query({ id: playlistId })}`);
    const songs = Array.isArray(data.songs) ? data.songs : [];
    if (!songs.length) {
      renderPlaylistShelf(playlist, []);
      toast(`歌单「${playlistName}」暂无可播放歌曲`);
      return;
    }
    renderPlaylistShelf(playlist, songs);
  } catch (error) {
    toast(error.message);
  } finally {
    state.shelfLoadingPlaylistId = '';
    card.classList.remove('is-loading');
    card.disabled = false;
    card.removeAttribute('aria-busy');
  }
}

async function playShelfSong(button) {
  const index = Number(button.dataset.songIndex);
  const song = state.activePlaylistSongs[index];
  if (!song) return;
  if (index !== state.songFocusIndex) {
    setSongFocus(index);
    return;
  }

  button.classList.add('is-loading');
  button.disabled = true;
  try {
    await apiJson('/api/player/queue', {
      method: 'POST',
      body: JSON.stringify({ songs: state.activePlaylistSongs, currentIndex: index })
    });
    state.queue = state.activePlaylistSongs;
    state.queueIndex = index;
    const loaded = await loadSong(song);
    if (loaded) {
      await refreshPlayerState();
      updateShelfCurrentSong();
      setSongFocus(index);
      toast(`正在播放：${safeText(song.title, '歌曲')}`);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

function playbackLyricText(song = state.currentSong) {
  return safeText(song && song.title, 'FE Monster');
}

function playbackLyricSubtitle(song = state.currentSong) {
  return safeText(song && (song.artist || song.album), 'READY');
}

function parseLyricTime(raw) {
  const match = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(raw.trim());
  if (!match) return Number.NaN;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0;
  return minutes * 60 + seconds + fraction;
}

function parseLrc(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const stamps = Array.from(rawLine.matchAll(/\[([0-9:.]+)\]/g));
    if (!stamps.length) return;
    const lyric = rawLine.replace(/\[[^\]]+\]/g, '').trim();
    if (!lyric || /^作词|^作曲|^编曲|^制作|^出品|^发行/.test(lyric)) return;
    stamps.forEach((stamp) => {
      const time = parseLyricTime(stamp[1]);
      if (Number.isFinite(time)) lines.push({ time, text: lyric });
    });
  });
  return lines
    .sort((a, b) => a.time - b.time)
    .filter((line, index, arr) => index === 0 || line.time !== arr[index - 1].time || line.text !== arr[index - 1].text);
}

function lyricPayloadText(payload) {
  const candidates = [
    payload && payload.lrc && payload.lrc.lyric,
    payload && payload.tlyric && payload.tlyric.lyric,
    payload && payload.klyric && payload.klyric.lyric,
    payload && payload.yrc && payload.yrc.lyric
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
}

function setPlaybackLyricLine(text, subtitle, progress = 0) {
  const line = safeText(text, playbackLyricText());
  const nextSubtitle = safeText(subtitle, playbackLyricSubtitle());
  const progressPercent = clamp(progress, 0, 1) * 100;

  if (line !== state.lyricDisplayText) {
    els.playbackLyricScene.querySelectorAll('.playback-lyric-layer').forEach((layer) => {
      layer.textContent = line;
      layer.setAttribute('data-text', line);
    });
    state.lyricDisplayText = line;
  }

  if (nextSubtitle !== state.lyricSubtitleText) {
    els.playbackLyricSubtitle.textContent = nextSubtitle;
    state.lyricSubtitleText = nextSubtitle;
  }

  if (Math.abs(progressPercent - state.lyricProgressPercent) >= 0.01) {
    els.playbackLyricScene.style.setProperty('--lyric-line-progress', `${progressPercent.toFixed(2)}%`);
    state.lyricProgressPercent = progressPercent;
  }

  if (state.textPreset === 'flow') syncBlurLyricComponent(line);
  if (state.textPreset === 'book') updateBookLyricLines(progressPercent);
}

function findLyricIndexAtTime(lines, currentTime) {
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  const time = currentTime + 0.08;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

function updatePlaybackLyricAtTime(currentTime = els.audio.currentTime || 0) {
  const lines = state.lyricLines;
  const subtitle = playbackLyricSubtitle();
  if (!lines.length) {
    setPlaybackLyricLine(playbackLyricText(), subtitle, 0);
    state.lyricIndex = -1;
    return;
  }

  let index = state.lyricIndex;
  if (index < 0 || !lines[index] || currentTime + 0.18 < lines[index].time) {
    index = findLyricIndexAtTime(lines, currentTime);
  } else {
    while (lines[index + 1] && lines[index + 1].time <= currentTime + 0.08) {
      index += 1;
    }
  }

  const line = lines[index];
  const nextLine = lines[index + 1];
  const endTime = nextLine ? nextLine.time : Math.max(line.time + 4, Number(els.audio.duration) || line.time + 4);
  const progress = endTime > line.time ? (currentTime - line.time) / (endTime - line.time) : 1;
  state.lyricIndex = index;
  setPlaybackLyricLine(line.text, subtitle, progress);
}

function lyricSignatureForSong(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  return id ? `${id}|${safeText(song && song.title, '')}` : '';
}

async function loadPlaybackLyrics(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  const signature = lyricSignatureForSong(song);
  if (!id || signature === state.lyricSignature) return;
  state.lyricSignature = signature;
  state.lyricLines = [];
  state.lyricIndex = -1;
  state.lyricBookSignature = '';
  state.lyricBookIndex = -2;
  state.lyricBookCurrentLine = null;
  state.lyricProgressPercent = -1;
  setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);

  try {
    const payload = await apiJson(`/api/netease/lyric?${query({ id })}`);
    if (signature !== state.lyricSignature) return;
    const parsed = parseLrc(lyricPayloadText(payload));
    state.lyricLines = parsed.length ? parsed : [];
    state.lyricIndex = -1;
    state.lyricBookSignature = '';
    state.lyricBookIndex = -2;
    state.lyricBookCurrentLine = null;
    if (state.textPreset === 'book') renderBookLyricLines(true);
    updatePlaybackLyricAtTime();
  } catch (error) {
    if (signature === state.lyricSignature) {
      state.lyricLines = [];
      state.lyricBookSignature = '';
      state.lyricBookIndex = -2;
      state.lyricBookCurrentLine = null;
      setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    }
  }
}

function updatePlaybackLyricText(song = state.currentSong) {
  if (!els.playbackLyricScene) return;
  updateLyricPalette(song);
  const signature = lyricSignatureForSong(song);
  if (!signature) {
    state.lyricSignature = '';
    state.lyricLines = [];
    state.lyricIndex = -1;
    state.lyricBookSignature = '';
    state.lyricBookIndex = -2;
    state.lyricBookCurrentLine = null;
    setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    return;
  }
  if (signature !== state.lyricSignature) {
    loadPlaybackLyrics(song);
    return;
  }
  updatePlaybackLyricAtTime();
}

function setPlaybackLyricVisible(visible) {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.hidden = !visible;
}

function updatePlaybackSceneTransform() {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.style.setProperty('--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
  els.playbackLyricScene.style.setProperty('--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
  els.playbackLyricScene.style.setProperty('--playback-zoom', (state.playbackVisual.zoom || 1).toFixed(3));
  syncShelfRotationToPlaybackView();
}

function resetPlaybackView() {
  state.playbackVisual.yaw = PLAYBACK_REST_YAW;
  state.playbackVisual.pitch = PLAYBACK_REST_PITCH;
  state.playbackVisual.zoom = 1;
  state.playbackVisual.velocityYaw = 0;
  state.playbackVisual.velocityPitch = 0;
  updatePlaybackSceneTransform();
  resizeDynamicCubeRenderer();
}

function updateLyricDiyVars() {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.style.setProperty('--lyric-brightness', state.lyricBrightness.toFixed(2));
  els.playbackLyricScene.style.setProperty('--lyric-speed', state.lyricSpeed.toFixed(2));
  els.playbackLyricScene.style.setProperty('--lyric-duration', `${Math.round(720 / state.lyricSpeed)}ms`);
  if (els.lyricBrightnessValue) els.lyricBrightnessValue.textContent = `${Math.round(state.lyricBrightness * 100)}%`;
  if (els.lyricSpeedValue) els.lyricSpeedValue.textContent = `${Math.round(state.lyricSpeed * 100)}%`;
  if (els.cubeIntensityValue) els.cubeIntensityValue.textContent = `${Math.round(state.cubeIntensity * 100)}%`;
}

function setWallpaperSource(source) {
  state.wallpaperSource = source === 'live' ? 'live' : 'imported';
  if (els.wallpaperImportedModeButton) {
    els.wallpaperImportedModeButton.classList.toggle('is-active', state.wallpaperSource === 'imported');
    els.wallpaperImportedModeButton.setAttribute('aria-pressed', String(state.wallpaperSource === 'imported'));
  }
  if (els.wallpaperLiveModeButton) {
    els.wallpaperLiveModeButton.classList.toggle('is-active', state.wallpaperSource === 'live');
    els.wallpaperLiveModeButton.setAttribute('aria-pressed', String(state.wallpaperSource === 'live'));
  }
  if (els.wallpaperImportActions) els.wallpaperImportActions.hidden = state.wallpaperSource !== 'imported';
  saveWallpaperPrefs();
  refreshWallpapers({ source: state.wallpaperSource });
}

function setDiyPage(page) {
  state.diyPage = page === 'wallpaper' ? 'wallpaper' : page === 'text' ? 'text' : 'preset';
  const presetPage = state.diyPage === 'preset';
  const textPage = state.diyPage === 'text';
  const wallpaperPage = state.diyPage === 'wallpaper';
  if (els.diyPresetButton) {
    els.diyPresetButton.classList.toggle('is-active', presetPage);
    els.diyPresetButton.setAttribute('aria-pressed', String(presetPage));
  }
  if (els.diyTextModeButton) {
    els.diyTextModeButton.classList.toggle('is-active', textPage);
    els.diyTextModeButton.setAttribute('aria-pressed', String(textPage));
  }
  if (els.diyWallpaperModeButton) {
    els.diyWallpaperModeButton.classList.toggle('is-active', wallpaperPage);
    els.diyWallpaperModeButton.setAttribute('aria-pressed', String(wallpaperPage));
  }
  if (els.diyPresetPage) els.diyPresetPage.hidden = !presetPage;
  if (els.diyTextPage) els.diyTextPage.hidden = !textPage;
  if (els.diyWallpaperPage) els.diyWallpaperPage.hidden = !wallpaperPage;
  if (wallpaperPage) {
    setDiyPreset('wallpaper');
    enterPlaybackPage();
    setWallpaperSource(state.wallpaperSource);
  } else if (state.diyPreset === 'wallpaper') {
    setDiyPreset(state.scenePreset);
  }
}

function setDiyPreset(preset) {
  state.diyPreset = preset === 'cube' || preset === 'topography' || preset === 'wallpaper' || preset === 'book' ? preset : 'lyric';
  if (state.diyPreset !== 'wallpaper') state.scenePreset = state.diyPreset;
  if (els.diySceneNonePreset) els.diySceneNonePreset.classList.toggle('is-active', state.diyPreset === 'lyric');
  if (els.diyCubePreset) els.diyCubePreset.classList.toggle('is-active', state.diyPreset === 'cube');
  if (els.diyTopographyPreset) els.diyTopographyPreset.classList.toggle('is-active', state.diyPreset === 'topography');
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.classList.toggle('is-active', state.diyPreset === 'book');
  if (els.diyPresetPage) els.diyPresetPage.dataset.activePreset = state.diyPreset;
  updateDynamicCubeVisibility();
  updateSonicTopographyVisibility();
  updateWallpaperVisibility();
  if (state.diyPreset === 'book' && state.textPreset !== 'book') {
    setTextPreset('book');
  } else if (state.diyPreset !== 'book' && state.textPreset === 'book') {
    setTextPreset('depth');
  }
  updateLyricDiyVars();
  updateWallpaperDiyVars();
}

function setTextPreset(preset) {
  state.textPreset = preset === 'flow' || preset === 'book' ? preset : 'depth';
  if (els.diyLyricPreset) els.diyLyricPreset.classList.toggle('is-active', state.textPreset === 'depth');
  if (els.diyFlowTextPreset) els.diyFlowTextPreset.classList.toggle('is-active', state.textPreset === 'flow');
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.classList.toggle('is-active', state.diyPreset === 'book');
  if (els.diyPresetPage) els.diyPresetPage.dataset.activeTextPreset = state.textPreset;
  if (els.diyTextPage) els.diyTextPage.dataset.activeTextPreset = state.textPreset;
  if (els.playbackLyricScene) {
    els.playbackLyricScene.classList.toggle('is-flow-text', state.textPreset === 'flow');
    els.playbackLyricScene.classList.toggle('is-book-text', state.textPreset === 'book');
    els.playbackLyricScene.dataset.textPreset = state.textPreset;
  }
  if (els.appShell) els.appShell.classList.toggle('has-book-lyric-text', state.textPreset === 'book');
  if (els.bookLyricStage) {
    els.bookLyricStage.setAttribute('aria-hidden', state.textPreset === 'book' ? 'false' : 'true');
  }
  syncBlurLyricComponent();
  if (state.textPreset === 'book') {
    renderBookLyricLines(true);
    updateBookLyricLines();
  } else {
    state.lyricBookCurrentLine = null;
  }
}

function syncBlurLyricComponent(text = state.lyricDisplayText) {
  if (!els.playbackLyricScene || !els.blurLyricMount) return;
  const controller = window.FEBlurLyrics;
  const enabled = state.textPreset === 'flow' && controller && typeof controller.mount === 'function';
  els.playbackLyricScene.classList.toggle('has-blur-lyrics', !!enabled);
  if (!enabled) return;
  controller.mount(els.blurLyricMount);
  controller.setText(safeText(text, playbackLyricText()), els.blurLyricMount);
}

function clearDiyAutoHideTimer() {
  if (!state.diyAutoHideTimer) return;
  window.clearTimeout(state.diyAutoHideTimer);
  state.diyAutoHideTimer = 0;
}

function setDiyPeek(peek) {
  state.diyPeek = !!peek;
  els.appShell.classList.toggle('is-diy-peek', state.diyOpen && state.diyPeek);
}

function scheduleDiyAutoHide(delay = 1500) {
  clearDiyAutoHideTimer();
  if (!state.diyOpen) return;
  state.diyAutoHideTimer = window.setTimeout(() => {
    setDiyPeek(false);
    state.diyAutoHideTimer = 0;
  }, delay);
}

function setDiyOpen(open) {
  state.diyOpen = !!open;
  els.appShell.classList.toggle('is-diy-open', state.diyOpen);
  if (els.diyButton) els.diyButton.setAttribute('aria-expanded', String(state.diyOpen));
  if (els.diySidebar) els.diySidebar.setAttribute('aria-hidden', String(!state.diyOpen));
  clearDiyAutoHideTimer();
  if (state.diyOpen) {
    setDiyPeek(true);
  } else {
    setDiyPeek(false);
  }
}

function updateDiySidebarFromPointer(event) {
  if (!state.diyOpen || !event) return;
  setDiyPeek(true);
}

function postNativeWindowAction(action, payload = {}) {
  const nativeWindowActions = new Set(['fullscreen', 'normal', 'restore', 'minimize', 'minimise', 'drag', 'move']);
  if (!nativeWindowActions.has(action)) return false;
  if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
    window.chrome.webview.postMessage({ type: 'fe-window', action, ...payload });
    return true;
  }
  return false;
}

async function requestAppWindowAction(action) {
  const nativeWindowActions = new Set(['fullscreen', 'normal', 'restore', 'minimize', 'minimise']);
  if (nativeWindowActions.has(action) && postNativeWindowAction(action)) {
    return { ok: true, action, nativeHost: 'webview2' };
  }
  try {
    return await apiJson(`/api/app/window/${action}`);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function syncWindowFullscreenState() {
  els.appShell.classList.toggle('is-window-fullscreen', state.appWindowFullscreen);
  if (els.windowExitFullscreenButton) {
    els.windowExitFullscreenButton.title = state.appWindowFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
    els.windowExitFullscreenButton.setAttribute('aria-label', els.windowExitFullscreenButton.title);
    els.windowExitFullscreenButton.setAttribute('aria-pressed', String(state.appWindowFullscreen));
  }
}

async function toggleAppFullscreen() {
  const nextFullscreen = !state.appWindowFullscreen;
  const action = nextFullscreen ? 'fullscreen' : 'normal';
  const payload = await requestAppWindowAction(action);
  if (payload.ok) {
    state.appWindowFullscreen = nextFullscreen;
    syncWindowFullscreenState();
    return;
  }

  try {
    if (nextFullscreen && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      state.appWindowFullscreen = true;
      syncWindowFullscreenState();
    } else if (!nextFullscreen && document.exitFullscreen) {
      await document.exitFullscreen();
      state.appWindowFullscreen = false;
      syncWindowFullscreenState();
    }
  } catch (error) {
    toast(payload.error || error.message || '窗口全屏控制不可用');
  }
}

async function exitAppFullscreen() {
  const payload = await requestAppWindowAction('normal');
  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      if (!payload.ok) toast(payload.error || error.message || 'Fullscreen control unavailable');
    }
  } else if (!payload.ok) {
    toast(payload.error || 'Fullscreen control unavailable');
  }
  state.appWindowFullscreen = false;
  syncWindowFullscreenState();
}

async function minimizeAppWindow() {
  const payload = await requestAppWindowAction('minimize');
  if (!payload.ok) toast(payload.error || '当前不是本地客户端窗口，无法最小化');
}

async function quitAppWindow() {
  const payload = await requestAppWindowAction('quit');
  if (!payload.ok) {
    window.close();
    window.setTimeout(() => toast(payload.error || '当前窗口不允许直接退出'), 120);
  }
}

function renderCurrent(song = state.currentSong) {
  resetSpectrumForSong(song);
  const active = song || { title: '未播放', artist: '等待播放器状态' };
  els.dockTitle.textContent = safeText(active.title, '未播放');
  els.dockArtist.textContent = safeText(active.artist || active.album, '等待播放器状态');
  setImage(els.dockCover, song);
  updateBookLyricCover(song);
  updatePlaybackLyricText(song);
  updatePlayState();
  updateShelfCurrentSong();
  updateFavoriteControls(song);
}

function updatePlayState() {
  const playing = !els.audio.paused && !!els.audio.src;
  els.playButton.classList.toggle('is-playing', playing);
  els.playButton.title = playing ? '暂停' : '播放';
  els.playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
  els.dockStatus.textContent = playing ? 'PLAYING' : 'READY';
  els.dockStatus.classList.toggle('playing', playing);
  if (els.playbackLyricScene) els.playbackLyricScene.classList.toggle('is-playing', playing);
}

async function refreshPlayerState() {
  const data = await apiJson('/api/player/state');
  state.queue = Array.isArray(data.queue) ? data.queue : [];
  state.queueIndex = Number.isInteger(data.queueIndex) ? data.queueIndex : -1;
  state.currentSong = data.song && data.song.id ? data.song : state.currentSong;
  state.playerUrl = data.url || state.playerUrl;
  els.volumeRange.value = Math.round((Number(data.volume) || 0.8) * 100);
  els.volumeLabel.textContent = `${els.volumeRange.value}%`;
  renderCurrent();
}

function applyAudioBridgePayload(audio = {}) {
  const energy = Number(audio.energy) || 0;
  const lowFrequency = Number(audio.lowFrequencyAmplitude) || Number(audio.bass) || 0;
  state.visualBridge.energy = energy;
  state.visualBridge.bass = Number(audio.bass) || lowFrequency;
  state.visualBridge.lowFrequencyAmplitude = lowFrequency;
  state.visualBridge.beat = Number(audio.beat) || 0;
  state.visualBridge.mid = Number(audio.mid) || clamp(energy * 0.48, 0, 1);
  state.visualBridge.treble = Number(audio.treble) || clamp(energy * 0.28, 0, 1);
  state.visualBridge.source = safeText(audio.source, '');
  state.visualBridge.sampleRate = Number(audio.sampleRate) || 0;
  applyBridgeVisual();
}

async function refreshNativeAudioSample() {
  if (!state.clientRuntime.nativeAudioActive || !state.clientRuntime.settings.xAudio2) return;
  try {
    const data = await apiJson('/api/audio/sample');
    applyAudioBridgePayload(data || {});
  } catch (error) {
    // Native sampling is optional; Web Audio or the bridge fallback can keep visuals alive.
  }
}

async function refreshVisualBridge() {
  try {
    const data = await apiJson('/api/visual-bridge/state');
    applyAudioBridgePayload(data.audio || {});
  } catch (error) {
    // The particle stage keeps breathing even without bridge data.
  }
}

function setAudioPlaybackPosition(position, tolerance = 1.25) {
  const target = Number(position);
  if (!Number.isFinite(target) || target < 0 || !els.audio) return;
  try {
    const current = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
    if (Math.abs(current - target) >= tolerance) els.audio.currentTime = target;
  } catch (error) {
  }
}

function renderManualProgress(position = 0, duration = 0) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safePosition = Math.max(0, Math.min(Number(position) || 0, safeDuration || Number(position) || 0));
  els.progressRange.value = safeDuration > 0 ? Math.round((safePosition / safeDuration) * 1000) : 0;
  els.currentTime.textContent = formatTime(safePosition);
  els.totalTime.textContent = formatTime(safeDuration || (state.currentSong && state.currentSong.duration) || 0);
  updatePlaybackLyricAtTime(safePosition);
}

function applyCommunityUnavailableSong(song = {}, reason = '') {
  const signature = communitySongSignature(song);
  const duration = communitySongDuration(song);
  const position = communitySongPosition(song);
  state.currentSong = {
    ...song,
    duration,
    position
  };
  state.playerUrl = '';
  try {
    els.audio.pause();
    els.audio.removeAttribute('src');
    els.audio.load();
  } catch (error) {
  }
  resetSpectrumForSong(state.currentSong);
  renderCurrent(state.currentSong);
  renderManualProgress(position, duration);
  updatePlayState();
  showListenMini({
    title: '一起听进行中',
    status: '本机暂无版权，已同步好友播放进度',
    song: state.currentSong
  });
  if (signature && state.community.listenUnavailableSignature !== signature) {
    state.community.listenUnavailableSignature = signature;
    toast(reason || '本机暂无版权，已按好友端时长同步');
  }
}

async function applyCommunityPlaybackControls(song = {}) {
  const position = communitySongPosition(song);
  const duration = communitySongDuration(song);
  if (!els.audio.src) {
    state.currentSong = { ...(state.currentSong || {}), ...song, duration, position };
    renderCurrent(state.currentSong);
    renderManualProgress(position, duration);
    return;
  }
  setAudioPlaybackPosition(position);
  if (song.playing === false) {
    els.audio.pause();
    await apiJson('/api/player/pause').catch(() => {});
  } else if (els.audio.paused) {
    await apiJson('/api/player/play').catch(() => {});
    await els.audio.play().catch(() => {});
  }
  updateProgress();
  updatePlayState();
}

async function loadSong(song, options = {}) {
  try {
    const data = await apiJson(`/api/player/load?${songParams(song)}`);
    if (!data.playable || !data.url) {
      if (options.communitySync) {
        applyCommunityUnavailableSong(song, data.error || '当前歌曲不可播放');
        return false;
      }
      throw new Error(data.error || '当前歌曲不可播放');
    }
    const requestedDuration = Number(song.duration) || 0;
    state.community.listenUnavailableSignature = '';
    state.currentSong = {
      ...song,
      ...(data.song || {}),
      duration: Number(data.song && data.song.duration) || requestedDuration
    };
    state.playerUrl = data.url;
    els.audio.src = data.url;
    els.audio.volume = Number(els.volumeRange.value) / 100;
    const targetPosition = Number(options.position ?? song.position) || 0;
    if (targetPosition > 0) {
      const applyPosition = () => setAudioPlaybackPosition(targetPosition, 0.25);
      if (els.audio.readyState >= 1) applyPosition();
      else els.audio.addEventListener('loadedmetadata', applyPosition, { once: true });
    }
    resetSpectrumForSong(state.currentSong);
    renderCurrent(state.currentSong);
    if (options.autoplay === false) {
      els.audio.pause();
      await apiJson('/api/player/pause').catch(() => {});
    } else {
      await els.audio.play();
    }
    if (targetPosition > 0) setAudioPlaybackPosition(targetPosition, 0.25);
    ensureAudioAnalysis();
    updateProgress();
    updatePlayState();
    if (!options.communitySync && state.community.activeSession) {
      reportCommunityListening(true).catch(() => {});
    }
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

async function submitSearch(event) {
  event.preventDefault();

  const keyword = els.searchInput.value.trim();
  if (!keyword) {
    toast('请输入搜索关键词');
    els.searchInput.focus();
    return;
  }

  els.searchForm.classList.add('is-loading');
  els.searchForm.setAttribute('aria-busy', 'true');
  try {
    let songs = state.searchSuggestions.query === keyword
      ? state.searchSuggestions.songs
      : [];
    if (!songs.length) {
      const data = await apiJson(`/api/search?${query({ q: keyword, limit: 8, provider: state.activeProvider })}`);
      songs = normalizeSearchResults(data.songs).slice(0, 8);
      state.searchSuggestions.query = keyword;
      state.searchSuggestions.songs = songs;
      renderSearchSuggestions();
    }
    const song = songs[0];
    if (!song) {
      toast(`没有找到「${keyword}」`);
      return;
    }

    await playSearchSuggestion(song);
  } catch (error) {
    toast(error.message);
  } finally {
    els.searchForm.classList.remove('is-loading');
    els.searchForm.removeAttribute('aria-busy');
  }
}

async function playQueueIndex(index) {
  const song = state.queue[index];
  if (!song) {
    toast('播放栏暂无歌曲');
    return;
  }
  await loadSong(song);
  await refreshPlayerState();
}

async function transport(path) {
  try {
    const data = await apiJson(path);
    if (!data.playable || !data.url) {
      toast(data.error || '队列里没有可播放歌曲');
      await refreshPlayerState();
      return;
    }
    state.currentSong = data.song || state.currentSong;
    state.playerUrl = data.url;
    els.audio.src = data.url;
    resetSpectrumForSong(state.currentSong);
    renderCurrent(state.currentSong);
    await els.audio.play();
    ensureAudioAnalysis();
    await refreshPlayerState();
    if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
  } catch (error) {
    toast(error.message);
  }
}

async function togglePlay() {
  if (!els.audio.src && state.currentSong) {
    await loadSong(state.currentSong);
    return;
  }
  if (!els.audio.src && state.queue.length) {
    await playQueueIndex(Math.max(0, state.queueIndex));
    return;
  }
  if (!els.audio.src) {
    toast('播放栏暂无歌曲');
    return;
  }
  if (els.audio.paused) {
    try {
      await apiJson('/api/player/play');
      await els.audio.play();
      ensureAudioAnalysis();
      if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
    } catch (error) {
      toast(error.message);
    }
  } else {
    els.audio.pause();
    await apiJson('/api/player/pause').catch(() => {});
    if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
  }
  updatePlayState();
}

function updateProgress() {
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
  els.progressRange.value = duration > 0 ? Math.round((current / duration) * 1000) : 0;
  els.currentTime.textContent = formatTime(current);
  els.totalTime.textContent = formatTime(duration || (state.currentSong && state.currentSong.duration) || 0);
  updatePlaybackLyricAtTime(current);
}

function clearShelfPressTimer() {
  if (!state.shelfPressTimer) return;
  window.clearTimeout(state.shelfPressTimer);
  state.shelfPressTimer = 0;
}

function shelfPointerTargetIsInteractive(event) {
  return !!event.target.closest('.playlist-shelf-hide, .shelf-song-button');
}

function beginShelfDrag(event) {
  if (event.button !== 0) return;
  if (shelfPointerTargetIsInteractive(event)) return;
  const center = currentShelfCenter();
  state.shelfDragging = true;
  state.shelfPointerId = event.pointerId;
  state.shelfInteraction = 'pending';
  state.shelfPressStartedAt = performance.now();
  state.shelfPressX = event.clientX;
  state.shelfPressY = event.clientY;
  state.shelfStartLeft = center.left;
  state.shelfStartTop = center.top;
  state.shelfLastX = event.clientX;
  state.shelfLastY = event.clientY;
  els.playlistShelf.classList.add('is-pressing');
  els.playlistShelfStage.setPointerCapture(event.pointerId);
  clearShelfPressTimer();
  state.shelfPressTimer = window.setTimeout(() => {
    if (!state.shelfDragging || state.shelfPointerId !== event.pointerId || state.shelfInteraction !== 'pending') return;
    state.shelfInteraction = 'move';
    els.playlistShelf.classList.remove('is-pressing', 'is-dragging');
    els.playlistShelf.classList.add('is-position-dragging');
  }, state.playbackPage ? 240 : 420);
  event.preventDefault();
  event.stopPropagation();
}

function moveShelfDrag(event) {
  if (!state.shelfDragging || event.pointerId !== state.shelfPointerId) return;
  const totalDx = event.clientX - state.shelfPressX;
  const totalDy = event.clientY - state.shelfPressY;
  const dx = event.clientX - state.shelfLastX;
  const dy = event.clientY - state.shelfLastY;

  const distance = Math.hypot(totalDx, totalDy);
  if (state.shelfInteraction === 'pending') {
    if (state.playbackPage) {
      const heldMs = performance.now() - state.shelfPressStartedAt;
      if (distance > 5 && heldMs < 210) {
        clearShelfPressTimer();
        state.shelfInteraction = 'view';
        els.playlistShelf.classList.remove('is-pressing', 'is-position-dragging');
        els.playlistShelf.classList.add('is-dragging');
      } else if (heldMs > 180 && distance > 2) {
        clearShelfPressTimer();
        state.shelfInteraction = 'move';
        els.playlistShelf.classList.remove('is-pressing', 'is-dragging');
        els.playlistShelf.classList.add('is-position-dragging');
      }
    } else if (distance > 5) {
      clearShelfPressTimer();
      state.shelfInteraction = 'rotate';
      els.playlistShelf.classList.remove('is-pressing', 'is-position-dragging');
      els.playlistShelf.classList.add('is-dragging');
    }
  }

  if (state.shelfInteraction === 'rotate') {
    setShelfRotation(state.shelfRotateX - dy * 0.16, state.shelfRotateY + dx * 0.44);
  } else if (state.shelfInteraction === 'view') {
    state.playbackVisual.yaw += dx * 0.0095;
    state.playbackVisual.pitch -= dy * 0.0095;
    state.playbackVisual.velocityYaw = dx * 0.00062;
    state.playbackVisual.velocityPitch = -dy * 0.00062;
    updatePlaybackSceneTransform();
  } else if (state.shelfInteraction === 'move') {
    setShelfPosition(
      state.shelfStartLeft + totalDx,
      state.shelfStartTop + totalDy,
      {
        width: state.playbackPage ? 318 : 368,
        height: state.playbackPage ? 382 : 430,
        bottomInset: state.playbackPage ? 104 : 94
      }
    );
  }

  state.shelfLastX = event.clientX;
  state.shelfLastY = event.clientY;
  event.preventDefault();
  event.stopPropagation();
}

function endShelfDrag(event) {
  if (!state.shelfDragging || event.pointerId !== state.shelfPointerId) return;
  const wasPending = state.shelfInteraction === 'pending';
  const clickedBack = wasPending && event.type === 'pointerup' && event.target.closest('#playlistShelfBack');
  clearShelfPressTimer();
  state.shelfDragging = false;
  state.shelfPointerId = null;
  state.shelfInteraction = '';
  els.playlistShelf.classList.remove('is-pressing', 'is-dragging', 'is-position-dragging');
  if (els.playlistShelfStage.hasPointerCapture(event.pointerId)) {
    els.playlistShelfStage.releasePointerCapture(event.pointerId);
  }
  if (clickedBack) showShelfFront();
}

function stepPlaylistFocus(deltaY) {
  const direction = deltaY > 0 ? 1 : -1;
  setPlaylistFocus(state.playlistFocusIndex + direction);
}

function openFocusedPlaylist() {
  const card = els.playlistCards.querySelector(`.orb-playlist-card[data-playlist-index="${state.playlistFocusIndex}"]`);
  if (card) loadPlaylistFromCard(card);
}

function stepSongFocus(deltaY) {
  const direction = deltaY > 0 ? 1 : -1;
  setSongFocus(state.songFocusIndex + direction);
}

function scheduleSongFocusFromWheel(deltaY) {
  state.songWheelDelta += deltaY;
  if (state.songWheelFrame) return;
  state.songWheelFrame = window.requestAnimationFrame(() => {
    const delta = state.songWheelDelta;
    state.songWheelDelta = 0;
    state.songWheelFrame = 0;
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
    const direction = delta > 0 ? 1 : -1;
    const steps = clamp(Math.round(Math.abs(delta) / 120) || 1, 1, 3);
    setSongFocus(state.songFocusIndex + direction * steps);
  });
}

function playbackBack() {
  if (state.playlistSongPageOpen) {
    closePlaylistShelf();
    return;
  }
  if (state.playbackPage) returnHomePage();
}

function clearWindowDragTimer() {
  window.clearTimeout(state.windowDragTimer);
  state.windowDragTimer = 0;
}

function endWindowDragGesture(event) {
  if (state.windowDragPointerId !== null && event && event.pointerId !== state.windowDragPointerId) return;
  clearWindowDragTimer();
  state.windowDragPointerId = null;
  state.windowDragging = false;
}

function canStartWindowDrag(event) {
  if (event.button !== 0) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;
  if (target.closest('.runtime-settings-panel, .recording-dialog, .netease-login-dialog, .community-card, .community-message-dialog, .community-message-bubbles, .listen-mini, .playlist-song-page, .orb-playlists, .player-dock, .diy-sidebar, .search-suggestions, .favorite-library')) {
    return false;
  }
  if (target.closest('.runtime-topbar')) return true;
  if (target.closest('button, [role="button"], input, textarea, select, a')) return false;
  return !!target.closest('.runtime-topbar, .top-search, .search-suggestions, .favorite-library') || event.clientY <= 34;
}

function beginWindowDragGesture(event) {
  if (!canStartWindowDrag(event)) return;
  clearWindowDragTimer();
  state.windowDragPointerId = event.pointerId;
  state.windowDragStartX = event.clientX;
  state.windowDragStartY = event.clientY;
  state.windowDragLastX = event.screenX;
  state.windowDragLastY = event.screenY;
  state.windowDragging = false;
  if (event.target && typeof event.target.setPointerCapture === 'function') {
    try {
      event.target.setPointerCapture(event.pointerId);
    } catch (error) {
    }
  }
  state.windowDragTimer = window.setTimeout(() => {
    clearWindowDragTimer();
    if (state.windowDragPointerId === event.pointerId) {
      state.windowDragging = true;
      state.windowDragSuppressClick = true;
    }
  }, 260);
  event.stopPropagation();
}

function suppressWindowDragClick(event) {
  if (!state.windowDragSuppressClick) return;
  state.windowDragSuppressClick = false;
  event.preventDefault();
  event.stopPropagation();
}

function moveWindowDragGesture(event) {
  if (event.pointerId !== state.windowDragPointerId) return;
  if (!state.windowDragging) {
    state.windowDragLastX = event.screenX;
    state.windowDragLastY = event.screenY;
    return;
  }
  const dx = Math.round(event.screenX - state.windowDragLastX);
  const dy = Math.round(event.screenY - state.windowDragLastY);
  if (dx || dy) {
    postNativeWindowAction('move', { dx, dy });
    state.windowDragLastX = event.screenX;
    state.windowDragLastY = event.screenY;
  }
  event.preventDefault();
  event.stopPropagation();
}

function bindEvents() {
  els.searchForm.addEventListener('submit', submitSearch);
  if (els.searchInput) {
    els.searchInput.addEventListener('input', scheduleSearchSuggestions);
    els.searchInput.addEventListener('focus', () => {
      const keyword = els.searchInput.value.trim();
      if (keyword && state.searchSuggestions.query === keyword && state.searchSuggestions.songs.length) renderSearchSuggestions();
      else scheduleSearchSuggestions();
    });
    els.searchInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (state.playlistFavorite.open) setPlaylistFavoriteOpen(false);
      else if (state.favoriteLibrary.open) setFavoriteLibraryOpen(false);
      else setSearchSuggestionsOpen(false);
    });
  }
  if (els.topFavoritesButton) {
    els.topFavoritesButton.addEventListener('click', (event) => {
      const nextOpen = !state.favoriteLibrary.open;
      setFavoriteLibraryOpen(nextOpen, nextOpen ? state.activeProvider : state.favoriteLibrary.provider);
      event.stopPropagation();
    });
  }
  if (els.searchSuggestions) {
    els.searchSuggestions.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.searchSuggestions.addEventListener('click', (event) => {
      const favoriteButton = event.target.closest('.search-favorite-button');
      if (favoriteButton) {
        const song = state.searchSuggestions.songs[Number(favoriteButton.dataset.searchIndex)];
        if (!song) return;
        if (isSongFavorite(song)) {
          toggleFavoriteSong(song);
        } else {
          toggleFavoriteSong(song, { forceAdd: true });
          showPlaylistFavoritePicker(song, { keepSearch: true });
        }
        event.stopPropagation();
        return;
      }
      const playButton = event.target.closest('.search-suggestion-play');
      if (!playButton) return;
      const song = state.searchSuggestions.songs[Number(playButton.dataset.searchIndex)];
      playSearchSuggestion(song);
      event.stopPropagation();
    });
  }
  if (els.playlistFavoritePopover) {
    els.playlistFavoritePopover.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.playlistFavoritePopover.addEventListener('click', (event) => {
      if (event.target.closest('[data-playlist-favorite-close]')) {
        setPlaylistFavoriteOpen(false);
        event.stopPropagation();
        return;
      }
      if (event.target.closest('[data-playlist-favorite-refresh]')) {
        loadFavoriteTargetPlaylists(state.playlistFavorite.provider, true);
        event.stopPropagation();
        return;
      }
      if (event.target.closest('[data-playlist-favorite-local]')) {
        saveSongToLocalFavorite();
        event.stopPropagation();
        return;
      }
      const choice = event.target.closest('.playlist-favorite-choice');
      if (!choice) return;
      addSongToPlatformPlaylist(choice.dataset.playlistId);
      event.stopPropagation();
    });
  }
  if (els.favoriteLibrary) {
    els.favoriteLibrary.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.favoriteLibrary.addEventListener('click', (event) => {
      const tab = event.target.closest('.favorite-library-tab');
      if (tab) {
        state.favoriteLibrary.provider = providerInfo(tab.dataset.favoriteProvider).id;
        renderFavoriteLibrary();
        event.stopPropagation();
        return;
      }
      const removeButton = event.target.closest('.search-favorite-button');
      if (removeButton) {
        const song = favoriteLibrarySong(removeButton.dataset.favoriteProvider, removeButton.dataset.favoriteIndex);
        toggleFavoriteSong(song);
        event.stopPropagation();
        return;
      }
      const playButton = event.target.closest('.search-suggestion-play');
      if (!playButton) return;
      const song = favoriteLibrarySong(playButton.dataset.favoriteProvider, playButton.dataset.favoriteIndex);
      playFavoriteLibrarySong(song);
      event.stopPropagation();
    });
  }
  if (els.communityAddForm) {
    els.communityAddForm.addEventListener('submit', addCommunityFriend);
    els.communityAddForm.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
  if (els.communityCard) {
    els.communityCard.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.communityCard.addEventListener('click', (event) => {
      if (!state.community.cardCollapsed) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest('button,input,textarea,select,.community-avatar')) return;
      setCommunityCardCollapsed(false);
    });
  }
  if (els.communityCollapseButton) {
    els.communityCollapseButton.addEventListener('click', (event) => {
      setCommunityCardCollapsed(!state.community.cardCollapsed);
      event.preventDefault();
      event.stopPropagation();
    });
  }
  if (els.communityAvatar) {
    els.communityAvatar.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCommunityProfileOpen(true, 'self');
    });
    els.communityAvatar.addEventListener('click', () => setCommunityProfileOpen(true, 'self'));
    els.communityAvatar.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setCommunityProfileOpen(true, 'self');
    });
  }
  if (els.communityFriendsList) els.communityFriendsList.addEventListener('click', handleCommunityFriendAction);
  if (els.communityMessageButton) els.communityMessageButton.addEventListener('click', () => openCommunityMessages());
  if (els.communityDndButton) els.communityDndButton.addEventListener('click', toggleCommunityMessageDnd);
  if (els.communityMessageClose) els.communityMessageClose.addEventListener('click', () => setCommunityMessageOpen(false));
  if (els.communityMessageForm) els.communityMessageForm.addEventListener('submit', sendCommunityMessage);
  if (els.communityMessageDialog) {
    els.communityMessageDialog.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
  if (els.communityMessageHead) {
    els.communityMessageHead.addEventListener('pointerdown', (event) => beginCommunityFloatingPanelDrag('message', 'move', event));
    els.communityMessageHead.addEventListener('pointermove', (event) => moveCommunityFloatingPanelDrag('message', event));
    els.communityMessageHead.addEventListener('pointerup', (event) => endCommunityFloatingPanelDrag('message', event));
    els.communityMessageHead.addEventListener('pointercancel', (event) => endCommunityFloatingPanelDrag('message', event));
  }
  if (els.communityMessageRotateHandle) {
    els.communityMessageRotateHandle.addEventListener('pointerdown', (event) => beginCommunityFloatingPanelDrag('message', 'rotate', event));
    els.communityMessageRotateHandle.addEventListener('pointermove', (event) => moveCommunityFloatingPanelDrag('message', event));
    els.communityMessageRotateHandle.addEventListener('pointerup', (event) => endCommunityFloatingPanelDrag('message', event));
    els.communityMessageRotateHandle.addEventListener('pointercancel', (event) => endCommunityFloatingPanelDrag('message', event));
  }
  if (els.communityMessageBubbles) {
    els.communityMessageBubbles.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.community-message-toast')) event.stopPropagation();
    });
    els.communityMessageBubbles.addEventListener('click', (event) => {
      const close = event.target.closest('[data-community-bubble-action="close"]');
      if (close) {
        event.preventDefault();
        dismissCommunityMessageBubble(close.dataset.messageKey || '');
        event.stopPropagation();
        return;
      }
      const reply = event.target.closest('[data-community-bubble-action="reply"]');
      if (reply) {
        event.preventDefault();
        const form = reply.closest('.community-message-toast-reply');
        if (form) sendCommunityBubbleReply(form);
        event.stopPropagation();
        return;
      }
      if (event.target.closest('input, button')) {
        event.stopPropagation();
        return;
      }
      const bubble = event.target.closest('.community-message-toast');
      if (!bubble || !els.communityMessageBubbles.contains(bubble)) return;
      const friendId = bubble.dataset.friendId || '';
      if (friendId) openCommunityMessages(friendId);
      event.stopPropagation();
    });
    els.communityMessageBubbles.addEventListener('submit', (event) => {
      const form = event.target.closest('.community-message-toast-reply');
      if (!form) return;
      event.preventDefault();
      sendCommunityBubbleReply(form);
    });
  }
  if (els.communityProfileDialog) {
    els.communityProfileDialog.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
  if (els.communityProfileHead) {
    els.communityProfileHead.addEventListener('pointerdown', (event) => beginCommunityFloatingPanelDrag('profile', 'move', event));
    els.communityProfileHead.addEventListener('pointermove', (event) => moveCommunityFloatingPanelDrag('profile', event));
    els.communityProfileHead.addEventListener('pointerup', (event) => endCommunityFloatingPanelDrag('profile', event));
    els.communityProfileHead.addEventListener('pointercancel', (event) => endCommunityFloatingPanelDrag('profile', event));
  }
  if (els.communityProfileRotateHandle) {
    els.communityProfileRotateHandle.addEventListener('pointerdown', (event) => beginCommunityFloatingPanelDrag('profile', 'rotate', event));
    els.communityProfileRotateHandle.addEventListener('pointermove', (event) => moveCommunityFloatingPanelDrag('profile', event));
    els.communityProfileRotateHandle.addEventListener('pointerup', (event) => endCommunityFloatingPanelDrag('profile', event));
    els.communityProfileRotateHandle.addEventListener('pointercancel', (event) => endCommunityFloatingPanelDrag('profile', event));
  }
  if (els.communityProfileSelfTab) els.communityProfileSelfTab.addEventListener('click', () => setCommunityProfilePage('self'));
  if (els.communityProfileGroupTab) els.communityProfileGroupTab.addEventListener('click', () => setCommunityProfilePage('nearby'));
  if (els.communityProfileClose) els.communityProfileClose.addEventListener('click', () => setCommunityProfileOpen(false));
  if (els.communityProfileSave) els.communityProfileSave.addEventListener('click', saveCommunityProfileBio);
  if (els.updateDialog) {
    els.updateDialog.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
  if (els.updateInstallButton) els.updateInstallButton.addEventListener('click', startClientUpdate);
  if (els.updateLaterButton) els.updateLaterButton.addEventListener('click', hideUpdateDialog);
  if (els.listenMiniHandle) {
    els.listenMiniHandle.addEventListener('pointerdown', beginListenMiniDrag);
    els.listenMiniHandle.addEventListener('pointermove', moveListenMiniDrag);
    els.listenMiniHandle.addEventListener('pointerup', endListenMiniDrag);
    els.listenMiniHandle.addEventListener('pointercancel', endListenMiniDrag);
  }
  if (els.listenMini) els.listenMini.addEventListener('pointerdown', (event) => event.stopPropagation());
  if (els.listenMiniClose) els.listenMiniClose.addEventListener('click', leaveCommunityListen);
  if (els.listenAcceptButton) els.listenAcceptButton.addEventListener('click', () => respondCommunityListen(true));
  if (els.listenDeclineButton) els.listenDeclineButton.addEventListener('click', () => respondCommunityListen(false));
  if (els.listenLeaveButton) els.listenLeaveButton.addEventListener('click', leaveCommunityListen);
  if (els.listenCallButton) els.listenCallButton.addEventListener('click', startCommunityCall);
  if (els.listenHangupButton) els.listenHangupButton.addEventListener('click', () => stopCommunityCall(true));
  if (els.runtimeSettingsButton) els.runtimeSettingsButton.addEventListener('click', () => setRuntimeSettingsOpen(!state.runtimeSettingsOpen));
  if (els.runtimeRecordingButton) els.runtimeRecordingButton.addEventListener('click', openRecordingDialog);
  if (els.recordingCloseButton) els.recordingCloseButton.addEventListener('click', closeRecordingDialog);
  if (els.recordingStartButton) els.recordingStartButton.addEventListener('click', startProgramRecording);
  if (els.recordingStopButton) els.recordingStopButton.addEventListener('click', stopProgramRecording);
  if (els.recordingResumeButton) els.recordingResumeButton.addEventListener('click', resumeProgramRecording);
  if (els.recordingFinishButton) els.recordingFinishButton.addEventListener('click', finishProgramRecording);
  if (els.recordingDownloadButton) els.recordingDownloadButton.addEventListener('click', saveRecordingAs);
  if (els.recordingPanel) {
    els.recordingPanel.addEventListener('pointerdown', beginRecordingMiniDrag);
    els.recordingPanel.addEventListener('pointermove', moveRecordingMiniDrag);
    els.recordingPanel.addEventListener('pointerup', endRecordingMiniDrag);
    els.recordingPanel.addEventListener('pointercancel', endRecordingMiniDrag);
  }
  if (els.recordingDialog) {
    els.recordingDialog.addEventListener('click', (event) => {
      if (event.target.closest('[data-recording-close]')) closeRecordingDialog();
    });
  }
  if (els.windowExitFullscreenButton) els.windowExitFullscreenButton.addEventListener('click', toggleAppFullscreen);
  if (els.windowTopMinimizeButton) els.windowTopMinimizeButton.addEventListener('click', minimizeAppWindow);
  if (els.windowQuitButton) els.windowQuitButton.addEventListener('click', quitAppWindow);
  if (els.windowFullscreenButton) els.windowFullscreenButton.addEventListener('click', toggleAppFullscreen);
  if (els.windowMinimizeButton) els.windowMinimizeButton.addEventListener('click', minimizeAppWindow);
  if (els.windowCloseButton) els.windowCloseButton.addEventListener('click', quitAppWindow);
  els.homeButton.addEventListener('click', returnHomePage);
  els.diyButton.addEventListener('click', () => setDiyOpen(!state.diyOpen));
  els.diyCloseButton.addEventListener('click', () => setDiyOpen(false));
  if (els.diyPresetButton) els.diyPresetButton.addEventListener('click', () => {
    setDiyPage('preset');
    enterPlaybackPage();
  });
  if (els.diyTextModeButton) els.diyTextModeButton.addEventListener('click', () => {
    setDiyPage('text');
    enterPlaybackPage();
  });
  if (els.diyWallpaperModeButton) els.diyWallpaperModeButton.addEventListener('click', () => setDiyPage('wallpaper'));
  if (els.diySidebar) {
    els.diySidebar.addEventListener('pointerenter', () => {
      if (!state.diyOpen) return;
      setDiyPeek(true);
      clearDiyAutoHideTimer();
    });
    els.diySidebar.addEventListener('pointerleave', () => {
      if (!state.diyOpen) return;
      setDiyPeek(true);
    });
  }
  if (els.diyLyricPreset) els.diyLyricPreset.addEventListener('click', () => {
    if (state.diyPreset === 'book') setDiyPreset('lyric');
    setTextPreset('depth');
  });
  if (els.diyFlowTextPreset) els.diyFlowTextPreset.addEventListener('click', () => {
    if (state.diyPreset === 'book') setDiyPreset('lyric');
    setTextPreset('flow');
  });
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.addEventListener('click', () => enterPresetPlaybackPage('book'));
  if (els.bookLyricList) {
    els.bookLyricList.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.bookLyricList.addEventListener('click', (event) => {
      const line = event.target && event.target.closest ? event.target.closest('.book-lyric-line') : null;
      if (!line || !els.bookLyricList.contains(line)) return;
      seekToBookLyric(line.dataset.bookLyricTime);
    });
  }
  if (els.diySceneNonePreset) els.diySceneNonePreset.addEventListener('click', () => enterPresetPlaybackPage('lyric'));
  if (els.diyCubePreset) els.diyCubePreset.addEventListener('click', () => enterPresetPlaybackPage('cube'));
  if (els.diyTopographyPreset) els.diyTopographyPreset.addEventListener('click', () => enterPresetPlaybackPage('topography'));
  if (els.wallpaperImportedModeButton) els.wallpaperImportedModeButton.addEventListener('click', () => setWallpaperSource('imported'));
  if (els.wallpaperLiveModeButton) els.wallpaperLiveModeButton.addEventListener('click', () => setWallpaperSource('live'));
  document.querySelectorAll('[data-wallpaper-fit]').forEach((button) => {
    button.addEventListener('click', () => setWallpaperFitMode(button.dataset.wallpaperFit));
  });
  if (els.wallpaperImportButton && els.wallpaperImportInput) {
    els.wallpaperImportButton.addEventListener('click', () => els.wallpaperImportInput.click());
    els.wallpaperImportInput.addEventListener('change', () => {
      importWallpaperFiles(els.wallpaperImportInput.files)
        .catch((error) => {
          setWallpaperStatus(error.message || '导入失败');
          toast(error.message || '导入失败');
        })
        .finally(() => {
          els.wallpaperImportInput.value = '';
        });
    });
  }
  if (els.wallpaperRefreshButton) els.wallpaperRefreshButton.addEventListener('click', () => refreshWallpapers({ source: state.wallpaperSource }));
  els.lyricBrightnessRange.addEventListener('input', () => {
    state.lyricBrightness = clamp(Number(els.lyricBrightnessRange.value) / 100, 0.6, 1.8);
    updateLyricDiyVars();
  });
  els.lyricSpeedRange.addEventListener('input', () => {
    state.lyricSpeed = clamp(Number(els.lyricSpeedRange.value) / 100, 0.6, 1.8);
    updateLyricDiyVars();
  });
  if (els.cubeIntensityRange) {
    els.cubeIntensityRange.addEventListener('input', () => {
      state.cubeIntensity = clamp(Number(els.cubeIntensityRange.value) / 100, 0.4, 1.8);
      updateLyricDiyVars();
    });
  }
  if (els.wallpaperOpacityRange) {
    els.wallpaperOpacityRange.addEventListener('input', () => {
      state.wallpaperOpacity = clamp(Number(els.wallpaperOpacityRange.value) / 100, 0.3, 1);
      updateWallpaperDiyVars();
      saveWallpaperPrefs();
    });
  }
  if (els.wallpaperBrightnessRange) {
    els.wallpaperBrightnessRange.addEventListener('input', () => {
      state.wallpaperBrightness = clamp(Number(els.wallpaperBrightnessRange.value) / 100, 0.35, 1.5);
      updateWallpaperDiyVars();
      saveWallpaperPrefs();
    });
  }
  if (els.wallpaperBlurRange) {
    els.wallpaperBlurRange.addEventListener('input', () => {
      state.wallpaperBlur = clamp(Number(els.wallpaperBlurRange.value), 0, 24);
      updateWallpaperDiyVars();
      saveWallpaperPrefs();
    });
  }
  if (els.wallpaperScaleRange) {
    els.wallpaperScaleRange.addEventListener('input', () => {
      state.wallpaperScale = clamp(Number(els.wallpaperScaleRange.value) / 100, 0.7, 1);
      updateWallpaperDiyVars();
      scheduleWallpaperAutoSize();
      saveWallpaperPrefs();
    });
  }
  for (const input of [els.gpuAccelerationToggle, els.directX11Toggle, els.xAudio2Toggle, els.x3DAudioToggle, els.gestureControlToggle]) {
    if (input) input.addEventListener('change', saveRuntimeSettings);
  }
  if (els.gestureWebcamButton) {
    els.gestureWebcamButton.addEventListener('click', () => setGestureCameraSource('webcam'));
  }
  if (els.gestureCameraButton) {
    els.gestureCameraButton.addEventListener('click', () => setGestureCameraSource('camera'));
  }
  els.loginButton.addEventListener('click', showLoginDialog);
  els.loginClose.addEventListener('click', closeLoginDialog);
  els.loginRefresh.addEventListener('click', loadLoginQr);
  if (els.loginProviderTabs) {
    els.loginProviderTabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-login-provider]');
      if (!tab) return;
      setActiveProvider(tab.dataset.loginProvider, { reloadQr: true });
    });
  }
  els.loginDialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-login-close]')) closeLoginDialog();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.playlistFavorite.open) setPlaylistFavoriteOpen(false);
    else if (els.searchSuggestions && !els.searchSuggestions.hidden) setSearchSuggestionsOpen(false);
    else if (state.favoriteLibrary.open) setFavoriteLibraryOpen(false);
    else if (els.recordingDialog && !els.recordingDialog.hidden) closeRecordingDialog();
    else if (els.communityProfileDialog && !els.communityProfileDialog.hidden) setCommunityProfileOpen(false);
    else if (els.communityMessageDialog && !els.communityMessageDialog.hidden) setCommunityMessageOpen(false);
    else if (!els.loginDialog.hidden) closeLoginDialog();
    else if (state.runtimeSettingsOpen) setRuntimeSettingsOpen(false);
    else if (state.diyOpen) setDiyOpen(false);
    else if (state.playbackPage) playbackBack();
    else if (!els.playlistShelf.hidden) hidePlaylistShelf();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!state.runtimeSettingsOpen) return;
    const target = event.target;
    if (target && target.closest('.runtime-topbar, .runtime-settings-panel')) return;
    setRuntimeSettingsOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.top-search, .search-suggestions, .favorite-library, .playlist-favorite-popover')) return;
    setSearchSuggestionsOpen(false);
    setFavoriteLibraryOpen(false);
    setPlaylistFavoriteOpen(false);
  });
  document.addEventListener('pointerdown', beginWindowDragGesture, true);
  document.addEventListener('pointermove', moveWindowDragGesture, true);
  document.addEventListener('pointerup', endWindowDragGesture, true);
  document.addEventListener('pointercancel', endWindowDragGesture, true);
  document.addEventListener('click', suppressWindowDragClick, true);
  els.playlistCards.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.playlistCards.addEventListener('click', (event) => {
    const card = event.target.closest('.orb-playlist-card');
    if (!card) return;
    event.stopPropagation();
    loadPlaylistFromCard(card);
  });
  els.playlistCards.addEventListener('wheel', (event) => {
    if (state.playlistSongPageOpen) return;
    stepPlaylistFocus(event.deltaY);
    event.preventDefault();
  }, { passive: false });
  els.playlistCards.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      stepPlaylistFocus(1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      stepPlaylistFocus(-1);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      openFocusedPlaylist();
      event.preventDefault();
    }
  });
  els.playlistShelf.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.playlistShelfClose.addEventListener('click', () => closePlaylistShelf());
  els.playlistShelfBack.addEventListener('click', (event) => {
    event.stopPropagation();
    closePlaylistShelf();
  });
  els.playlistShelfBack.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    closePlaylistShelf();
  });
  els.playlistSongStack.addEventListener('click', (event) => {
    const button = event.target.closest('.shelf-song-button');
    if (!button) return;
    event.stopPropagation();
    playShelfSong(button);
  });
  if (els.playlistSongStackBack) {
    els.playlistSongStackBack.addEventListener('click', (event) => {
      const button = event.target.closest('.shelf-song-button');
      if (!button) return;
      event.stopPropagation();
      playShelfSong(button);
    });
  }
  els.playlistShelfStage.addEventListener('wheel', (event) => {
    scheduleSongFocusFromWheel(event.deltaY);
    event.preventDefault();
  }, { passive: false });
  els.playlistSongStack.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      stepSongFocus(1);
      event.preventDefault();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      stepSongFocus(-1);
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const button = els.playlistSongStack.querySelector(`.shelf-song-button[data-song-index="${state.songFocusIndex}"]`);
      if (button) playShelfSong(button);
      event.preventDefault();
    }
  });
  els.playButton.addEventListener('click', togglePlay);
  els.prevButton.addEventListener('click', () => transport('/api/player/previous'));
  els.nextButton.addEventListener('click', () => transport('/api/player/next'));
  if (els.dockFavoriteButton) {
    els.dockFavoriteButton.addEventListener('click', (event) => {
      showPlaylistFavoritePicker(state.currentSong);
      event.stopPropagation();
    });
  }
  if (els.dockPinButton) {
    els.dockPinButton.addEventListener('click', (event) => {
      state.playbackChrome.dockPinned = !state.playbackChrome.dockPinned;
      state.playbackChrome.dockVisible = state.playbackChrome.dockPinned;
      syncPlaybackChromeClasses();
      event.stopPropagation();
    });
  }
  window.addEventListener('fe-blur-lyrics-ready', () => syncBlurLyricComponent());
  window.addEventListener('pointermove', updatePlaybackChromeFromPointer, { passive: true });
  window.addEventListener('pointermove', updateDiySidebarFromPointer, { passive: true });
  window.addEventListener('pointerleave', () => {
    setPlaybackChromeVisibility({
      searchVisible: state.playbackPage ? false : state.playbackChrome.searchVisible,
      dockVisible: state.playbackChrome.dockPinned
    });
  }, { passive: true });
  window.addEventListener('focus', () => {
    refreshLoginStatus();
    scheduleUserPlaylistsRefresh(160);
    scheduleCommunityRefresh(220);
  }, { passive: true });
  window.addEventListener('online', () => {
    scheduleUserPlaylistsRefresh(160);
    state.community.eventReconnectDelay = 1200;
    scheduleCommunityRefresh(160);
    ensureCommunityEventStream();
  }, { passive: true });
  window.addEventListener('offline', () => stopCommunityEventStream(false), { passive: true });
  window.addEventListener('pageshow', () => scheduleUserPlaylistsRefresh(160), { passive: true });
  window.addEventListener('resize', () => {
    scheduleWallpaperAutoSize();
    setListenMiniPosition();
    setCommunityFloatingPanelPosition('message');
    setCommunityFloatingPanelPosition('profile');
    if (els.recordingDialog && !els.recordingDialog.hidden) setRecordingMiniPosition();
    if (els.playlistShelf.hidden || state.playbackPage || !state.activePlaylistId) return;
    const activeCard = els.playlistCards.querySelector(`.orb-playlist-card[data-playlist-id="${CSS.escape(String(state.activePlaylistId))}"]`);
    positionShelfNearCard(activeCard);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshLoginStatus();
      scheduleUserPlaylistsRefresh(160);
      scheduleCommunityRefresh(220);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.appWindowFullscreen) {
      state.appWindowFullscreen = false;
      syncWindowFullscreenState();
    }
  });

  els.progressRange.addEventListener('input', () => {
    const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
    if (!duration) return;
    els.audio.currentTime = (Number(els.progressRange.value) / 1000) * duration;
    updateProgress();
  });

  els.progressRange.addEventListener('change', () => {
    apiJson(`/api/player/seek?${query({ position: Math.round(els.audio.currentTime || 0) })}`).catch(() => {});
    if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
  });

  els.volumeRange.addEventListener('input', () => {
    const volume = Number(els.volumeRange.value) / 100;
    els.audio.volume = volume;
    els.volumeLabel.textContent = `${els.volumeRange.value}%`;
    apiJson(`/api/player/volume?${query({ value: volume.toFixed(2) })}`).catch(() => {});
  });

  els.audio.addEventListener('timeupdate', updateProgress);
  els.audio.addEventListener('durationchange', updateProgress);
  els.audio.addEventListener('loadedmetadata', () => resetSpectrumForSong(state.currentSong));
  els.audio.addEventListener('play', () => {
    ensureAudioAnalysis();
    state.community.lastListenReportAt = performance.now();
    updatePlayState();
  });
  els.audio.addEventListener('pause', () => {
    reportCommunityListening(true).catch(() => {});
    state.audioAnalysis.live = false;
    applyBridgeVisual();
    updatePlayState();
  });
  els.audio.addEventListener('ended', () => {
    reportCommunityListening(true).catch(() => {});
    transport('/api/player/next');
  });
  els.audio.addEventListener('error', () => toast('本地客户端无法播放当前音频源'));
}

function rotatePoint(point, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const y1 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 };
}

function updateStageZoom(deltaY) {
  const zoomIn = deltaY < 0;
  const factor = zoomIn ? 1.12 : 1 / 1.12;
  if (state.playbackPage) {
    state.playbackVisual.zoom = clamp((state.playbackVisual.zoom || 1) * factor, 0.58, 2.35);
    updatePlaybackSceneTransform();
    resizeDynamicCubeRenderer();
    return;
  }
  state.orb.zoom = clamp((state.orb.zoom || 1) * factor, 0.58, 2.35);
}

function bindOrbEvents() {
  els.stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (state.playbackPage) {
      state.playbackVisual.dragging = true;
      state.playbackVisual.pointerId = event.pointerId;
      state.playbackVisual.lastX = event.clientX;
      state.playbackVisual.lastY = event.clientY;
      state.playbackVisual.pressStartedAt = performance.now();
      state.playbackVisual.pressX = event.clientX;
      state.playbackVisual.pressY = event.clientY;
      state.playbackVisual.velocityYaw = 0;
      state.playbackVisual.velocityPitch = 0;
    } else {
      state.orb.dragging = true;
      state.orb.pointerId = event.pointerId;
      state.orb.lastX = event.clientX;
      state.orb.lastY = event.clientY;
      state.orb.velocityYaw = 0;
      state.orb.velocityPitch = 0;
    }
    els.stage.classList.add('is-dragging');
    els.stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  els.stage.addEventListener('pointermove', (event) => {
    const rect = els.stage.getBoundingClientRect();
    state.playbackVisual.mouseX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    state.playbackVisual.mouseY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    state.orb.mouseX = state.playbackVisual.mouseX;
    state.orb.mouseY = state.playbackVisual.mouseY;
    state.orb.mouseActive = true;
    state.orb.lastMouseAt = performance.now();
    if (state.playbackPage) {
      if (!state.playbackVisual.dragging || event.pointerId !== state.playbackVisual.pointerId) return;
      const dx = event.clientX - state.playbackVisual.lastX;
      const dy = event.clientY - state.playbackVisual.lastY;
      state.playbackVisual.lastX = event.clientX;
      state.playbackVisual.lastY = event.clientY;
      state.playbackVisual.yaw += dx * 0.0095;
      state.playbackVisual.pitch -= dy * 0.0095;
      state.playbackVisual.velocityYaw = dx * 0.00062;
      state.playbackVisual.velocityPitch = -dy * 0.00062;
      updatePlaybackSceneTransform();
      return;
    }
    if (!state.orb.dragging || event.pointerId !== state.orb.pointerId) return;
    const dx = event.clientX - state.orb.lastX;
    const dy = event.clientY - state.orb.lastY;
    state.orb.lastX = event.clientX;
    state.orb.lastY = event.clientY;
    state.orb.yaw += dx * 0.0105;
    state.orb.pitch += dy * 0.0105;
    state.orb.velocityYaw = dx * 0.00072;
    state.orb.velocityPitch = dy * 0.00072;
    state.orb.trailYaw = clamp(dx * 0.0032, -0.28, 0.28);
    state.orb.trailPitch = clamp(dy * 0.0032, -0.22, 0.22);
    state.orb.trailBoost = clamp(Math.hypot(dx, dy) / 46, 0.28, 1.18);
  });

  const endDrag = (event) => {
    if (state.playbackVisual.dragging && event.pointerId === state.playbackVisual.pointerId) {
      const moved = Math.hypot(
        event.clientX - (state.playbackVisual.pressX || event.clientX),
        event.clientY - (state.playbackVisual.pressY || event.clientY)
      );
      const held = performance.now() - (state.playbackVisual.pressStartedAt || performance.now());
      if (state.diyPreset === 'topography' && (moved < 14 || held > 560)) {
        addSonicTopographyPointerRipple(event);
      }
      state.playbackVisual.dragging = false;
      state.playbackVisual.pointerId = null;
      els.stage.classList.remove('is-dragging');
      if (els.stage.hasPointerCapture(event.pointerId)) els.stage.releasePointerCapture(event.pointerId);
      return;
    }
    if (!state.orb.dragging || event.pointerId !== state.orb.pointerId) return;
    state.orb.dragging = false;
    state.orb.pointerId = null;
    els.stage.classList.remove('is-dragging');
    if (els.stage.hasPointerCapture(event.pointerId)) els.stage.releasePointerCapture(event.pointerId);
  };

  els.stage.addEventListener('pointerup', endDrag);
  els.stage.addEventListener('pointercancel', endDrag);
  els.stage.addEventListener('pointerleave', () => {
    if (!state.orb.dragging) state.orb.mouseActive = false;
  }, { passive: true });
  els.stage.addEventListener('pointerup', (event) => {
    if (event.button !== 2 || !state.shelfHiddenByUser) return;
    const now = performance.now();
    if (now - state.shelfLastRightClickAt < 460) {
      event.preventDefault();
      showActivePlaylistShelf();
      state.shelfLastRightClickAt = 0;
      return;
    }
    state.shelfLastRightClickAt = now;
  });
  els.stage.addEventListener('contextmenu', (event) => {
    if (state.shelfHiddenByUser && state.activePlaylist) event.preventDefault();
  });
  els.stage.addEventListener('dblclick', (event) => {
    if (!state.playbackPage || event.button !== 0) return;
    resetPlaybackView();
  });
  els.stage.addEventListener('wheel', (event) => {
    if (event.target.closest('.playlist-song-page, .playlist-shelf, .orb-playlists, button, input, textarea, select')) return;
    updateStageZoom(event.deltaY);
    event.preventDefault();
  }, { passive: false });
}

function initParticles() {
  const count = state.orb.reducedMotion ? Math.min(480, RENDER_PROFILE.orbParticles) : RENDER_PROFILE.orbParticles;
  const tau = Math.PI * 2;
  state.particles = Array.from({ length: count }, () => {
    const clustered = Math.random() < 0.52;
    const cell = clustered ? Math.floor(Math.random() * 18) : 0;
    const theta = clustered
      ? (cell / 18) * tau + (Math.random() - 0.5) * (0.24 + Math.random() * 0.36)
      : Math.random() * tau;
    const z = clamp(
      (Math.random() * 2 - 1) + (clustered ? Math.sin(theta * 2.6) * 0.08 : 0),
      -0.96,
      0.96
    );
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const shell = 0.86 + Math.random() * 0.34 + (clustered ? Math.random() * 0.12 : 0);
    const rough = 1
      + Math.sin(theta * 5.0 + z * 4.2) * 0.045
      + Math.cos(theta * 9.0 - z * 5.7) * 0.034
      + (Math.random() - 0.5) * 0.12;
    const kindRoll = Math.random();
    return {
      x: Math.cos(theta) * r * shell * rough,
      y: Math.sin(theta) * r * shell * rough * (0.9 + Math.random() * 0.16),
      z: z * shell * (0.94 + Math.random() * 0.14),
      size: 0.36 + Math.random() * (clustered ? 1.55 : 1.05),
      opacity: 0.34 + Math.random() * (clustered ? 0.62 : 0.44),
      phase: Math.random() * Math.PI * 2,
      seed: Math.random(),
      speed: 0.22 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 0.036,
      twist: (Math.random() - 0.5) * 0.018,
      kind: kindRoll > 0.84 ? 'shard' : kindRoll > 0.78 ? 'dust' : 'dot',
      shardLength: 4 + Math.random() * (clustered ? 15 : 9),
      shardAngle: Math.random() * Math.PI,
      clustered
    };
  });
}

function initPlaybackParticles() {
  const count = reducedMotion ? Math.min(620, RENDER_PROFILE.playbackParticles) : RENDER_PROFILE.playbackParticles;
  state.playbackVisual.particles = Array.from({ length: count }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random() * 2 - 1,
    size: 0.42 + Math.random() * 1.05,
    speed: 0.18 + Math.random() * 0.74,
    drift: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2
  }));
}

function recyclePlaybackParticle(particle, direction = -1) {
  particle.x = Math.random() * 2 - 1;
  particle.y = direction < 0 ? 1.18 + Math.random() * 0.28 : -1.18 - Math.random() * 0.28;
  particle.z = Math.random() * 2 - 1;
  particle.phase = Math.random() * Math.PI * 2;
}

function createPlaybackParticleSprite(size, coreRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;
  const radius = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  gradient.addColorStop(coreRatio, 'rgba(255, 255, 255, 0.58)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

function playbackParticleSprites(dpr) {
  const key = Math.round(dpr * 100);
  if (state.playbackVisual.spriteDpr === key && state.playbackVisual.particleSprites.length) {
    return state.playbackVisual.particleSprites;
  }
  state.playbackVisual.spriteDpr = key;
  state.playbackVisual.particleSprites = [
    createPlaybackParticleSprite(Math.ceil(14 * dpr), 0.16),
    createPlaybackParticleSprite(Math.ceil(22 * dpr), 0.12),
    createPlaybackParticleSprite(Math.ceil(32 * dpr), 0.09)
  ];
  return state.playbackVisual.particleSprites;
}

function updatePlaybackQuality(visual) {
  const now = performance.now();
  if (visual.lastFrameTime) {
    const frameMs = now - visual.lastFrameTime;
    if (frameMs > RENDER_PROFILE.targetFrameMs) visual.quality = Math.max(RENDER_PROFILE.playbackQualityMin, visual.quality - 0.035);
    else if (frameMs < 18) visual.quality = Math.min(RENDER_PROFILE.playbackQualityMax, visual.quality + 0.01);
  }
  visual.lastFrameTime = now;
}

function updateOrbQuality() {
  const now = performance.now();
  if (state.orb.lastFrameTime) {
    const frameMs = now - state.orb.lastFrameTime;
    if (frameMs > RENDER_PROFILE.targetFrameMs) state.orb.quality = Math.max(RENDER_PROFILE.orbQualityMin, state.orb.quality - 0.05);
    else if (frameMs < 18) state.orb.quality = Math.min(RENDER_PROFILE.orbQualityMax, state.orb.quality + 0.01);
  }
  state.orb.lastFrameTime = now;
}

function updateOrbMotion() {
  if (!state.orb.dragging && !state.orb.reducedMotion) {
    const beatPush = Math.max(0, state.visual.beat - 0.62) * 0.0009;
    state.orb.yaw += 0.00086 + beatPush + state.orb.velocityYaw;
    state.orb.pitch += state.orb.velocityPitch;
    state.orb.velocityYaw *= 0.925;
    state.orb.velocityPitch *= 0.925;
  }
  const trailDecay = state.orb.dragging ? 0.94 : 0.9;
  state.orb.trailYaw *= trailDecay;
  state.orb.trailPitch *= trailDecay;
  state.orb.trailBoost *= trailDecay;
  const fullTurn = Math.PI * 2;
  if (Math.abs(state.orb.yaw) > Math.PI * 64) state.orb.yaw %= fullTurn;
  if (Math.abs(state.orb.pitch) > Math.PI * 64) state.orb.pitch %= fullTurn;
}

function updatePlaybackSceneMotion() {
  const visual = state.playbackVisual;
  if (state.lyricLines.length) updatePlaybackLyricAtTime();
  if (!visual.dragging && !state.orb.reducedMotion) {
    visual.yaw += visual.velocityYaw;
    visual.pitch += visual.velocityPitch;
    visual.velocityYaw *= 0.91;
    visual.velocityPitch *= 0.91;
  }
  visual.yaw = wrapRadians(visual.yaw);
  visual.pitch = wrapRadians(visual.pitch);
  updatePlaybackSceneTransform();

  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.08 : 0.48);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.06 : 0.38);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0.04 : 0.32);
  const targetPulse = els.audio.paused ? 0.08 : clamp(energy * 0.42 + bass * 0.28 + beat * 0.48, 0.08, 1.18);
  const response = clamp(0.08 * state.lyricSpeed, 0.045, 0.24);
  visual.lyricPulse += (targetPulse - visual.lyricPulse) * response;
  const t = performance.now() / 1000;
  const heartA = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.35 + state.lyricSpeed * 0.34))), 12);
  const heartB = Math.pow(Math.max(0, Math.sin((t + 0.18) * Math.PI * (1.35 + state.lyricSpeed * 0.34))), 18) * 0.48;
  const heart = els.audio.paused ? 0 : clamp((heartA + heartB) * (0.42 + bass * 0.9), 0, 1.35);
  const bounce = els.audio.paused
    ? 0
    : Math.sin(t * (4.4 + state.lyricSpeed * 3.2)) * visual.lyricPulse * 3.8 - heart * 13;
  const zoom = clamp(visual.zoom || 1, 0.58, 2.35);
  const scale = (1 + visual.lyricPulse * 0.04 + heart * 0.13) * zoom;
  els.playbackLyricScene.style.setProperty('--lyric-pulse', visual.lyricPulse.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-bounce', `${bounce.toFixed(2)}px`);
  els.playbackLyricScene.style.setProperty('--lyric-scale', scale.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-heart', heart.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-glow-size', `${Math.round(8 + visual.lyricPulse * 10 + heart * 18)}px`);
  updateDynamicCubeMotion();
  updateSonicTopographyMotion();
}

function drawPlaybackParticles(context, rect, dpr, width, height) {
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  updatePlaybackSceneMotion();
  if (state.textPreset === 'book') return;
  if (state.diyPreset === 'topography') return;

  const visual = state.playbackVisual;
  updatePlaybackQuality(visual);
  const t = performance.now() / 1000;
  const speed = state.lyricSpeed;
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.12 : 0.55);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.08 : 0.42);
  const cx = width / 2;
  const cy = height / 2;
  const zoom = clamp(visual.zoom || 1, 0.58, 2.35);
  const spreadX = width * 0.52 * zoom;
  const spreadY = height * 0.62 * zoom;
  const mouseX = visual.mouseX * width;
  const mouseY = visual.mouseY * height;
  const sprites = playbackParticleSprites(dpr);
  const particleLimit = Math.max(RENDER_PROFILE.playbackParticleFloor, Math.floor(visual.particles.length * visual.quality));

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.shadowBlur = 0;
  for (let index = 0; index < particleLimit; index += 1) {
    const particle = visual.particles[index];
    particle.y -= (0.00055 + particle.speed * 0.00082) * speed * (1 + energy * 0.55) * (height / 720);
    particle.x += Math.sin(t * 0.62 + particle.phase) * 0.00065 * speed;
    particle.z += Math.cos(t * 0.42 + particle.drift) * 0.0005 * speed;
    if (particle.y < -1.24) recyclePlaybackParticle(particle, -1);
    if (particle.x > 1.32 || particle.x < -1.32 || particle.z > 1.24 || particle.z < -1.24) {
      particle.x = Math.random() * 2 - 1;
      particle.z = Math.random() * 2 - 1;
    }

    const point = rotatePoint(particle, visual.yaw + particle.phase * 0.008, visual.pitch);
    const perspective = 1.34 / (1.34 - point.z * 0.42);
    let x = cx + point.x * spreadX * perspective;
    let y = cy + point.y * spreadY * perspective;
    const dx = x - mouseX;
    const dy = y - mouseY;
    const distance = Math.hypot(dx, dy);
    if (distance < 170 * dpr) {
      const force = (1 - distance / (170 * dpr)) * (26 + energy * 22) * dpr;
      const angle = Math.atan2(dy, dx);
      x += Math.cos(angle) * force;
      y += Math.sin(angle) * force;
    }
    const depth = (point.z + 1) / 2;
    const flicker = 0.72 + Math.sin(t * 2.2 + particle.phase) * 0.22;
    const size = Math.max(1.55 * dpr, particle.size * (3.4 + bass * 1.9) * perspective * dpr);
    const alpha = clamp(0.34 + depth * 0.5 + energy * 0.24, 0.18, 0.98) * flicker;
    const sprite = sprites[depth > 0.72 ? 2 : depth > 0.38 ? 1 : 0];
    const drawSize = size * (depth > 0.72 ? 2.3 : depth > 0.38 ? 1.9 : 1.55);
    context.globalAlpha = alpha;
    context.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
  }
  context.globalAlpha = 1;
  context.restore();
}

function scheduleAmbientOrbStreak(now) {
  state.orb.nextAmbientStreakAt = now + (state.orb.reducedMotion ? 7200 : 2200 + Math.random() * 5200);
}

function spawnAmbientOrbStreak(width, height, dpr, now) {
  const fromLeft = Math.random() > 0.42;
  const fromTop = !fromLeft && Math.random() > 0.36;
  const angle = fromLeft
    ? (-0.34 + Math.random() * 0.42)
    : (fromTop ? (0.46 + Math.random() * 0.42) : (-0.72 + Math.random() * 0.34));
  const distance = Math.max(width, height) * (0.74 + Math.random() * 0.32);
  const startX = fromLeft ? -120 * dpr : Math.random() * width;
  const startY = fromTop ? -80 * dpr : height * (0.16 + Math.random() * 0.68);
  state.orb.ambientStreaks.push({
    startX,
    startY,
    vx: Math.cos(angle) * distance,
    vy: Math.sin(angle) * distance,
    length: (80 + Math.random() * 170) * dpr,
    width: (0.72 + Math.random() * 1.18) * dpr,
    startedAt: now,
    duration: 1280 + Math.random() * 780,
    phase: Math.random() * Math.PI * 2
  });
}

function drawAmbientOrbStreaks(context, width, height, dpr, now) {
  if (!state.orb.nextAmbientStreakAt) scheduleAmbientOrbStreak(now);
  if (!state.orb.reducedMotion && now >= state.orb.nextAmbientStreakAt) {
    spawnAmbientOrbStreak(width, height, dpr, now);
    if (Math.random() > 0.72) spawnAmbientOrbStreak(width, height, dpr, now + 80);
    scheduleAmbientOrbStreak(now);
  }

  state.orb.ambientStreaks = state.orb.ambientStreaks.filter((streak) => now - streak.startedAt < streak.duration);
  if (!state.orb.ambientStreaks.length) return;

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  for (const streak of state.orb.ambientStreaks) {
    const progress = clamp((now - streak.startedAt) / streak.duration, 0, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const fade = Math.sin(progress * Math.PI);
    const x = streak.startX + streak.vx * ease;
    const y = streak.startY + streak.vy * ease;
    const angle = Math.atan2(streak.vy, streak.vx);
    const tail = streak.length * (0.74 + progress * 0.4);
    const tx = x - Math.cos(angle) * tail;
    const ty = y - Math.sin(angle) * tail;
    const gradient = context.createLinearGradient(tx, ty, x, y);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.46, `rgba(180, 186, 188, ${0.1 * fade})`);
    gradient.addColorStop(0.84, `rgba(226, 232, 234, ${0.34 * fade})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${0.66 * fade})`);
    context.shadowBlur = 10 * dpr * fade;
    context.shadowColor = `rgba(255, 255, 255, ${0.24 * fade})`;
    context.strokeStyle = gradient;
    context.lineWidth = streak.width * (0.64 + fade * 0.7);
    context.beginPath();
    context.moveTo(tx, ty);
    context.lineTo(x, y);
    context.stroke();
  }
  context.restore();
}

function drawOrb() {
  updateAudioSpectrum();
  const canvas = els.canvas;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = state.playbackPage ? renderPixelRatio('playback') : renderPixelRatio('canvas');
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.clearRect(0, 0, width, height);

  if (state.playbackPage) {
    drawPlaybackParticles(context, rect, dpr, width, height);
    requestAnimationFrame(drawOrb);
    return;
  }

  updateOrbMotion();
  updateOrbQuality();

  const now = performance.now();
  const t = now / 1000;
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.16 : 0.46);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.1 : 0.36);
  const breath = state.orb.reducedMotion ? 0.48 : 0.5 + 0.5 * Math.sin(t * 1.14);
  const radiusCss = Math.min(rect.width, rect.height) * (0.355 + energy * 0.018 + breath * 0.012) * clamp(state.orb.zoom || 1, 0.58, 2.35);
  const radius = radiusCss * dpr;
  const cx = (rect.width / 2) * dpr;
  const cy = (rect.height * 0.455) * dpr;
  const motionGlow = clamp(state.orb.trailBoost + Math.hypot(state.orb.velocityYaw, state.orb.velocityPitch) * 620, 0, 1.2);
  const trailAmount = Math.max(state.orb.reducedMotion ? 0 : 0.035 + energy * 0.025, motionGlow * 0.72);
  const trailYaw = clamp(state.orb.trailYaw || state.orb.velocityYaw * 44 || 0.018, -0.24, 0.24);
  const trailPitch = clamp(state.orb.trailPitch || state.orb.velocityPitch * 44 || 0.008, -0.18, 0.18);
  const mouseActive = state.orb.mouseActive && now - state.orb.lastMouseAt < 1500;
  const mouseX = state.orb.mouseX * width;
  const mouseY = state.orb.mouseY * height;

  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  const ambient = context.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 1.48);
  ambient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  ambient.addColorStop(0.46, 'rgba(255, 255, 255, 0.018)');
  ambient.addColorStop(0.68, 'rgba(255, 255, 255, 0.042)');
  ambient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = ambient;
  context.fillRect(0, 0, width, height);

  const voidGradient = context.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius * 0.58);
  voidGradient.addColorStop(0, 'rgba(0, 0, 0, 0.96)');
  voidGradient.addColorStop(0.62, 'rgba(0, 0, 0, 0.7)');
  voidGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = voidGradient;
  context.fillRect(0, 0, width, height);

  drawAmbientOrbStreaks(context, width, height, dpr, now);

  const particleLimit = Math.max(RENDER_PROFILE.orbParticleFloor, Math.floor(state.particles.length * state.orb.quality));
  const drawable = state.particles.slice(0, particleLimit).map((p) => {
    const wobble = state.orb.reducedMotion ? 0 : Math.sin(t * p.speed + p.phase) * p.drift;
    const source = {
      x: p.x + Math.sin(t * 0.42 + p.phase) * p.twist,
      y: p.y + Math.cos(t * 0.36 + p.phase) * p.twist,
      z: p.z + wobble
    };
    const yaw = state.orb.yaw + p.seed * 0.018 + Math.sin(t * 0.18 + p.phase) * 0.01;
    const point = rotatePoint(source, yaw, state.orb.pitch + Math.cos(t * 0.14 + p.phase) * 0.012);
    const perspective = 1.18 / (1.18 - point.z * 0.42);
    const depth = (point.z + 1) / 2;
    const trailPoint = rotatePoint(p, yaw - trailYaw, state.orb.pitch - trailPitch);
    const trailPerspective = 1.18 / (1.18 - trailPoint.z * 0.42);
    const projectedRadius = Math.hypot(point.x, point.y);
    const hollow = 0.08 + smoothstep(0.34, 0.82, projectedRadius) * 0.92;
    const rim = smoothstep(0.62, 1.12, projectedRadius);
    const outerFade = 1 - smoothstep(1.34, 1.58, projectedRadius);
    let x = cx + point.x * radius * perspective;
    let y = cy + point.y * radius * perspective;
    let interaction = 0;
    if (mouseActive) {
      const dx = x - mouseX;
      const dy = y - mouseY;
      const distance = Math.hypot(dx, dy);
      const limit = radius * 0.34;
      if (distance < limit) {
        interaction = 1 - distance / limit;
        const angle = Math.atan2(dy || 0.001, dx || 0.001);
        const push = (20 + rim * 42 + energy * 24) * interaction * interaction * dpr;
        x += Math.cos(angle) * push;
        y += Math.sin(angle) * push;
      }
    }
    return {
      x,
      y,
      trailX: cx + trailPoint.x * radius * trailPerspective,
      trailY: cy + trailPoint.y * radius * trailPerspective,
      z: point.z,
      depth,
      rim,
      hollow,
      outerFade,
      interaction,
      seed: p.seed,
      kind: p.kind,
      shardLength: p.shardLength,
      shardAngle: p.shardAngle + state.orb.yaw * 0.46,
      size: (p.size + bass * 0.34 + breath * 0.18) * perspective * dpr,
      alpha: clamp(
        p.opacity
          * (0.18 + depth * 0.58 + rim * 0.32)
          * hollow
          * outerFade
          * (0.84 + Math.sin(t * 1.2 + p.phase) * 0.14)
          + interaction * 0.28,
        0,
        0.98
      )
    };
  });

  context.save();
  context.globalCompositeOperation = 'screen';
  if (trailAmount > 0.06) {
    context.lineCap = 'round';
    for (const p of drawable) {
      if (p.depth < 0.18 || p.seed > 0.13 || p.alpha < 0.16) continue;
      const alpha = clamp((0.08 + p.depth * 0.18 + p.rim * 0.16) * trailAmount, 0.025, 0.34);
      const gradient = context.createLinearGradient(p.trailX, p.trailY, p.x, p.y);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(0.58, `rgba(166, 172, 174, ${alpha * 0.48})`);
      gradient.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);
      context.shadowBlur = (4 + p.depth * 10) * dpr * trailAmount;
      context.shadowColor = `rgba(255, 255, 255, ${alpha * 0.55})`;
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(0.55 * dpr, p.size * (0.22 + trailAmount * 0.18));
      context.beginPath();
      context.moveTo(p.trailX, p.trailY);
      context.lineTo(p.x, p.y);
      context.stroke();
    }
  }

  for (const p of drawable) {
    const alpha = Math.min(0.98, p.alpha);
    if (alpha <= 0.018) continue;
    const shouldGlow = p.seed < 0.2 || p.interaction > 0.12;
    context.shadowBlur = shouldGlow ? (1.6 + p.depth * 4 + p.interaction * 8) * dpr : 0;
    context.shadowColor = shouldGlow ? `rgba(255, 255, 255, ${alpha * 0.18})` : 'transparent';

    if (p.kind === 'shard') {
      const length = p.shardLength * (0.55 + p.rim * 0.78 + p.interaction * 0.38) * dpr;
      const angle = p.shardAngle + Math.sin(t * 0.32 + p.seed * 12) * 0.28;
      const dx = Math.cos(angle) * length;
      const dy = Math.sin(angle) * length;
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.38})`;
      context.lineWidth = Math.max(0.46 * dpr, p.size * 0.34);
      context.beginPath();
      context.moveTo(p.x - dx * 0.5, p.y - dy * 0.5);
      context.lineTo(p.x + dx * 0.5, p.y + dy * 0.5);
      context.stroke();
      continue;
    }

    const core = Math.max(0.34 * dpr, p.size * (p.kind === 'dust' ? 0.34 : 0.58));
    if (p.kind !== 'dust' && (p.rim > 0.45 || p.depth > 0.52 || p.interaction > 0.12)) {
      context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.09})`;
      context.beginPath();
      context.arc(p.x, p.y, core * (2.4 + p.interaction * 1.8), 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = `rgba(238, 242, 243, ${alpha * (p.kind === 'dust' ? 0.48 : 0.9)})`;
    context.beginPath();
    context.arc(p.x, p.y, core, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const vignette = context.createRadialGradient(cx, cy, radius * 0.72, cx, cy, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.58, 'rgba(0, 0, 0, 0.18)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.86)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  requestAnimationFrame(drawOrb);
}

async function init() {
  initBootScreen();
  initGlassSurfaces();
  initWallpaperAutoSizeObserver();
  applyRuntimeDataset();
  loadWallpaperPrefs();
  bindEvents();
  bindOrbEvents();
  initParticles();
  initPlaybackParticles();
  setDiyPreset('lyric');
  setTextPreset('depth');
  updateLyricDiyVars();
  updateWallpaperDiyVars();
  resetPlaybackView();
  renderCurrent();
  setCommunityCardCollapsed(state.community.cardCollapsed);
  els.audio.volume = Number(els.volumeRange.value) / 100;
  await Promise.allSettled([refreshClientRuntime(), refreshPlayerState(), refreshVisualBridge(), refreshNativeAudioSample(), refreshLoginStatus(), refreshUserPlaylists()]);
  window.setInterval(refreshNativeAudioSample, 50);
  window.setInterval(refreshVisualBridge, 1000);
  window.setInterval(() => refreshPlayerState().catch(() => {}), 5000);
  window.setInterval(refreshUserPlaylists, 30000);
  window.setInterval(() => refreshCommunityState(state.activeProvider).catch(() => {}), 15000);
  window.setInterval(() => refreshCommunityListenState().catch(() => {}), 5000);
  window.setInterval(() => reportCommunityListening(false).catch(() => {}), 5000);
  requestAnimationFrame(drawOrb);
}

init().catch((error) => toast(error.message));
