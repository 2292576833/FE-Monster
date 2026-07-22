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
  communityBroadcastButton: $('#communityBroadcastButton'),
  communityCollapseButton: $('#communityCollapseButton'),
  communityAddForm: $('#communityAddForm'),
  communitySearchInput: $('#communitySearchInput'),
  communityAddButton: $('#communityAddButton'),
  communityMarketButton: $('#communityMarketButton'),
  communityMessageButton: $('#communityMessageButton'),
  communityDndButton: $('#communityDndButton'),
  communityOnlineCount: $('#communityOnlineCount'),
  communityFriendsLabel: $('#communityFriendsLabel'),
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
  communityBroadcastToast: $('#communityBroadcastToast'),
  communityListenBubbles: $('#communityListenBubbles'),
  communityProfileDialog: $('#communityProfileDialog'),
  communityProfilePanel: $('#communityProfilePanel'),
  communityProfileHead: $('#communityProfileHead'),
  communityProfileTitle: $('#communityProfileTitle'),
  communityProfileMeta: $('#communityProfileMeta'),
  communityProfileSelfTab: $('#communityProfileSelfTab'),
  communityProfileGroupTab: $('#communityProfileGroupTab'),
  communityProfileMarketTab: $('#communityProfileMarketTab'),
  communityProfileClose: $('#communityProfileClose'),
  communityProfileSelfPage: $('#communityProfileSelfPage'),
  communityProfileNearbyPage: $('#communityProfileNearbyPage'),
  communityProfileMarketPage: $('#communityProfileMarketPage'),
  communityProfileAvatar: $('#communityProfileAvatar'),
  communityProfileDisplayName: $('#communityProfileDisplayName'),
  communityProfileId: $('#communityProfileId'),
  communityProfileBio: $('#communityProfileBio'),
  communityProfileSave: $('#communityProfileSave'),
  communityProfileStatus: $('#communityProfileStatus'),
  communityNearbyMeta: $('#communityNearbyMeta'),
  communityNearbyList: $('#communityNearbyList'),
  communityMarketMeta: $('#communityMarketMeta'),
  communityMarketRefresh: $('#communityMarketRefresh'),
  communityMarketSearch: $('#communityMarketSearch'),
  communityMarketList: $('#communityMarketList'),
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
  dockQualityButton: $('#dockQualityButton'),
  dockQualityMenu: $('#dockQualityMenu'),
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
  loginVipBadge: $('#loginVipBadge'),
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
  upscalerStatus: $('#upscalerStatus'),
  upscalerDetail: $('#upscalerDetail'),
  presetFsrToggle: $('#presetFsrToggle'),
  presetFsrVersion: $('#presetFsrVersion'),
  presetFsrMode: $('#presetFsrMode'),
  presetFsrDetail: $('#presetFsrDetail'),
  renderClarityRange: $('#renderClarityRange'),
  renderClarityValue: $('#renderClarityValue'),
  renderClarityAutoToggle: $('#renderClarityAutoToggle'),
  renderClarityDetail: $('#renderClarityDetail'),
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
  sandboxModeButton: $('#sandboxModeButton'),
  sandboxPage: $('#sandboxPage'),
  sandboxSceneName: $('#sandboxSceneName'),
  sandboxSaveStatus: $('#sandboxSaveStatus'),
  sandboxSavePresetButton: $('#sandboxSavePresetButton'),
  sandboxResetViewButton: $('#sandboxResetViewButton'),
  sandboxStage: $('#sandboxStage'),
  sandboxCanvas: $('#sandboxCanvas'),
  sandboxStageEmpty: $('#sandboxStageEmpty'),
  sandboxStageStatus: $('#sandboxStageStatus'),
  sandboxObjectCount: $('#sandboxObjectCount'),
  sandboxDuplicateButton: $('#sandboxDuplicateButton'),
  sandboxDeleteButton: $('#sandboxDeleteButton'),
  sandboxClearButton: $('#sandboxClearButton'),
  sandboxLibraryCount: $('#sandboxLibraryCount'),
  sandboxLibraryTab: $('#sandboxLibraryTab'),
  sandboxGeneratorTab: $('#sandboxGeneratorTab'),
  sandboxLibraryPanel: $('#sandboxLibraryPanel'),
  sandboxGeneratorPanel: $('#sandboxGeneratorPanel'),
  sandboxLibrarySearch: $('#sandboxLibrarySearch'),
  sandboxLibraryGrid: $('#sandboxLibraryGrid'),
  sandboxLibraryEmpty: $('#sandboxLibraryEmpty'),
  sandboxSceneComponentCount: $('#sandboxSceneComponentCount'),
  sandboxSceneList: $('#sandboxSceneList'),
  sandboxPresetCount: $('#sandboxPresetCount'),
  sandboxPresetList: $('#sandboxPresetList'),
  sandboxComponentPreview: $('#sandboxComponentPreview'),
  sandboxPreviewName: $('#sandboxPreviewName'),
  sandboxComponentName: $('#sandboxComponentName'),
  sandboxCategory: $('#sandboxCategory'),
  sandboxPrimitive: $('#sandboxPrimitive'),
  sandboxComponentColor: $('#sandboxComponentColor'),
  sandboxComponentColorValue: $('#sandboxComponentColorValue'),
  sandboxWidth: $('#sandboxWidth'),
  sandboxHeight: $('#sandboxHeight'),
  sandboxDepth: $('#sandboxDepth'),
  sandboxPositionX: $('#sandboxPositionX'),
  sandboxPositionY: $('#sandboxPositionY'),
  sandboxPositionZ: $('#sandboxPositionZ'),
  sandboxRotationToggle: $('#sandboxRotationToggle'),
  sandboxInteraction: $('#sandboxInteraction'),
  sandboxMotion: $('#sandboxMotion'),
  sandboxMusicControls: $('#sandboxMusicControls'),
  sandboxBeatMode: $('#sandboxBeatMode'),
  sandboxMusicBand: $('#sandboxMusicBand'),
  sandboxAmplitude: $('#sandboxAmplitude'),
  sandboxAmplitudeValue: $('#sandboxAmplitudeValue'),
  sandboxSpeed: $('#sandboxSpeed'),
  sandboxSpeedValue: $('#sandboxSpeedValue'),
  sandboxParticleControls: $('#sandboxParticleControls'),
  sandboxParticleCount: $('#sandboxParticleCount'),
  sandboxOpacity: $('#sandboxOpacity'),
  sandboxSaveComponentButton: $('#sandboxSaveComponentButton'),
  sandboxPublishComponentButton: $('#sandboxPublishComponentButton'),
  sandboxCodexPrompt: $('#sandboxCodexPrompt'),
  sandboxReferenceImage: $('#sandboxReferenceImage'),
  sandboxReferenceImageName: $('#sandboxReferenceImageName'),
  sandboxCodexChatMessages: $('#sandboxCodexChatMessages'),
  sandboxCodexResponse: $('#sandboxCodexResponse'),
  sandboxGenerateButton: $('#sandboxGenerateButton'),
  sandboxCodexDecisions: $('#sandboxCodexDecisions'),
  sandboxRevisionPrompt: $('#sandboxRevisionPrompt'),
  sandboxCommitCodexButton: $('#sandboxCommitCodexButton'),
  sandboxImproveCodexButton: $('#sandboxImproveCodexButton'),
  sandboxRedoCodexButton: $('#sandboxRedoCodexButton'),
  sandboxPipeline: $('#sandboxPipeline'),
  sandboxPipelineMode: $('#sandboxPipelineMode'),
  sandboxPipelineList: $('#sandboxPipelineList'),
  diyQuickMenu: $('#diyQuickMenu'),
  diySidebar: $('#diySidebar'),
  diyCardTitle: $('#diyCardTitle'),
  diyCloseButton: $('#diyCloseButton'),
  diyPresetButton: $('#diyPresetButton'),
  diyPresetPage: $('#diyPresetPage'),
  diyTextModeButton: $('#diyTextModeButton'),
  diyTextPage: $('#diyTextPage'),
  diyWallpaperModeButton: $('#diyWallpaperModeButton'),
  diyWallpaperPage: $('#diyWallpaperPage'),
  diyRhythmGameButton: $('#diyRhythmGameButton'),
  diyNoTextPreset: $('#diyNoTextPreset'),
  diyLyricPreset: $('#diyLyricPreset'),
  diyFlowTextPreset: $('#diyFlowTextPreset'),
  diyBookEffectTextPreset: $('#diyBookEffectTextPreset'),
  diyFocusEchoTextPreset: $('#diyFocusEchoTextPreset'),
  textFontControl: $('#textFontControl'),
  textFontSelect: $('#textFontSelect'),
  textFontStatus: $('#textFontStatus'),
  textFontPreview: $('#textFontPreview'),
  textFontAvailability: $('#textFontAvailability'),
  textPaletteControl: $('#textPaletteControl'),
  textPaletteStatus: $('#textPaletteStatus'),
  textPaletteAutoButton: $('#textPaletteAutoButton'),
  textPaletteCustomInput: $('#textPaletteCustomInput'),
  textPaletteResetButton: $('#textPaletteResetButton'),
  playbackLyricPaletteControl: $('#playbackLyricPaletteControl'),
  playbackLyricPaletteStatus: $('#playbackLyricPaletteStatus'),
  playbackLyricPaletteAutoButton: $('#playbackLyricPaletteAutoButton'),
  playbackLyricPaletteCustomInput: $('#playbackLyricPaletteCustomInput'),
  playbackLyricPaletteResetButton: $('#playbackLyricPaletteResetButton'),
  diySceneNonePreset: $('#diySceneNonePreset'),
  diyScenePresetList: $('#diyScenePresetList'),
  diyCubePreset: $('#diyCubePreset'),
  diyFreeCubePreset: $('#diyFreeCubePreset'),
  diyVoidPrismPreset: $('#diyVoidPrismPreset'),
  diyTopographyPreset: $('#diyTopographyPreset'),
  diyChladniPreset: $('#diyChladniPreset'),
  diyRainGlassPreset: $('#diyRainGlassPreset'),
  diyCoverParticlesPreset: $('#diyCoverParticlesPreset'),
  diyCoverParticleControl: $('#diyCoverParticleControl'),
  diyCoverParticleBackgroundToggle: $('#diyCoverParticleBackgroundToggle'),
  diyCoverParticleBackgroundValue: $('#diyCoverParticleBackgroundValue'),
  diyCoverParticleMotionRange: $('#diyCoverParticleMotionRange'),
  diyCoverParticleMotionValue: $('#diyCoverParticleMotionValue'),
  diyBookLyricPreset: $('#diyBookLyricPreset'),
  diyCubeIntensityControl: $('#diyCubeIntensityControl'),
  sonicPresetControls: $('#sonicPresetControls'),
  sonicCoreColorInput: $('#sonicCoreColorInput'),
  sonicOuterColorInput: $('#sonicOuterColorInput'),
  sonicPaletteMode: $('#sonicPaletteMode'),
  sonicFollowCoverButton: $('#sonicFollowCoverButton'),
  sonicBrightnessRange: $('#sonicBrightnessRange'),
  sonicBrightnessValue: $('#sonicBrightnessValue'),
  sonicExposureRange: $('#sonicExposureRange'),
  sonicExposureValue: $('#sonicExposureValue'),
  sonicColumnHeightRange: $('#sonicColumnHeightRange'),
  sonicColumnHeightValue: $('#sonicColumnHeightValue'),
  sonicFovRange: $('#sonicFovRange'),
  sonicFovValue: $('#sonicFovValue'),
  sonicSmoothingRange: $('#sonicSmoothingRange'),
  sonicSmoothingValue: $('#sonicSmoothingValue'),
  freeCubePresetControls: $('#freeCubePresetControls'),
  freeCubeHeartButton: $('#freeCubeHeartButton'),
  freeCubeBackgroundButton: $('#freeCubeBackgroundButton'),
  chladniPresetControls: $('#chladniPresetControls'),
  chladniPlaneButton: $('#chladniPlaneButton'),
  chladniCubeButton: $('#chladniCubeButton'),
  stormPresetLightingQuickControls: $('#stormPresetLightingQuickControls'),
  diySelectedPresetConfig: $('#diySelectedPresetConfig'),
  diySelectedPresetConfigTitle: $('#diySelectedPresetConfigTitle'),
  diySelectedPresetConfigMeta: $('#diySelectedPresetConfigMeta'),
  diySelectedPresetConfigList: $('#diySelectedPresetConfigList'),
  diySandboxPresetGroup: $('#diySandboxPresetGroup'),
  diySandboxPresetToggle: $('#diySandboxPresetToggle'),
  diySandboxPresetList: $('#diySandboxPresetList'),
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
  voidPrismScene: $('#voidPrismScene'),
  voidPrismCore: $('#voidPrismCore'),
  freeCubeScene: $('#freeCubeScene'),
  freeCubeCore: $('#freeCubeCore'),
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
  musicApiImportPanel: $('#musicApiImportPanel'),
  musicApiImportButton: $('#musicApiImportButton'),
  musicApiImportInput: $('#musicApiImportInput'),
  musicApiImportStatus: $('#musicApiImportStatus'),
  loginClose: $('#neteaseLoginClose'),
  loginRefresh: $('#neteaseQrRefresh'),
  loginCommunityStrip: $('#loginCommunityStrip'),
  loginCommunityName: $('#loginCommunityName'),
  loginCommunityId: $('#loginCommunityId'),
  qrShell: $('#neteaseQrShell'),
  qrImage: $('#neteaseQrImage'),
  qrPlaceholder: $('#neteaseQrPlaceholder'),
  qrStatus: $('#neteaseQrStatus'),
  qrLoginStage: $('#qrLoginStage'),
  qishuiPhoneLogin: $('#qishuiPhoneLogin'),
  qishuiPhoneInput: $('#qishuiPhoneInput'),
  qishuiCodeInput: $('#qishuiCodeInput'),
  qishuiSendCodeButton: $('#qishuiSendCodeButton'),
  qishuiLoginButton: $('#qishuiLoginButton'),
  qishuiGuestButton: $('#qishuiGuestButton'),
  qishuiPhoneStatus: $('#qishuiPhoneStatus'),
  androidLoginWorkflow: $('#androidLoginWorkflow'),
  androidQrHelp: $('#androidQrHelp'),
  androidQrSaveButton: $('#androidQrSaveButton'),
  androidMusicAppButton: $('#androidMusicAppButton'),
  playlistOrbit: $('#orbPlaylists'),
  playlistCards: $('#orbPlaylistCards'),
  playlistStatus: $('#orbPlaylistStatus'),
  playlistShelf: $('#playlistShelf'),
  playlistShelfStage: $('#playlistShelfStage'),
  playlistShelfBack: $('#playlistShelfBack'),
  playlistShelfClose: $('#playlistShelfClose'),
  selectedPlaylistAlbum: $('#selectedPlaylistAlbum'),
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
  localPlaylistInput: $('#localPlaylistInput'),
  playlistLocalAddButton: $('#playlistLocalAddButton'),
  dynamicCubeScene: $('#dynamicCubeScene'),
  dynamicCubeRig: $('#dynamicCubeRig'),
  dynamicCubeCore: $('#dynamicCubeCore'),
  sonicTopographyScene: $('#sonicTopographyScene'),
  sonicTopographyRig: $('#sonicTopographyRig'),
  sonicTopographyCore: $('#sonicTopographyCore'),
  chladniScene: $('#chladniScene'),
  chladniCore: $('#chladniCore'),
  coverParticleScene: $('#coverParticleScene'),
  coverParticleRig: $('#coverParticleRig'),
  coverParticleEngine: $('#coverParticleEngine'),
  coverParticleCanvas: $('#coverParticleCanvas'),
  sandboxPlaybackScene: $('#sandboxPlaybackScene'),
  sandboxPlaybackFallback: $('#sandboxPlaybackFallback'),
  sandboxPlaybackStatus: $('#sandboxPlaybackStatus'),
  stormLightingControls: $('#stormLightingControls'),
  playbackLyricScene: $('#playbackLyricScene'),
  bookLyricStage: $('#bookLyricStage'),
  bookLyricCover: $('#bookLyricCover'),
  bookLyricCoverImage: $('#bookLyricCoverImage'),
  bookLyricPage: $('#bookLyricPage'),
  bookLyricList: $('#bookLyricList'),
  bookLyricArtist: $('#bookLyricArtist'),
  rainGlassCanvas: $('#rainGlassCanvas'),
  playbackLyricRig: $('#playbackLyricRig'),
  playbackLyricCore: $('#playbackLyricCore'),
  blurLyricMount: $('#blurLyricMount'),
  playbackLyricText: $('#playbackLyricText'),
  playbackLyricBack: $('#playbackLyricBack'),
  playbackLyricSubtitle: $('#playbackLyricSubtitle'),
  qishuiPlaybackCard: $('#qishuiPlaybackCard'),
  qishuiPlaybackPhone: $('#qishuiPlaybackPhone'),
  qishuiPlaybackVisibilityToggle: $('#qishuiPlaybackVisibilityToggle'),
  qishuiPlaybackScaleToggle: $('#qishuiPlaybackScaleToggle'),
  qishuiPlaybackTools: $('#qishuiPlaybackTools'),
  qishuiPlaybackBackdrop: $('#qishuiPlaybackBackdrop'),
  qishuiPlaybackCoverFrame: $('#qishuiPlaybackCoverFrame'),
  qishuiPlaybackCover: $('#qishuiPlaybackCover'),
  qishuiPlaybackCoverFallback: $('#qishuiPlaybackCoverFallback'),
  qishuiPlaybackAccount: $('#qishuiPlaybackAccount'),
  qishuiPlaybackAccountAvatar: $('#qishuiPlaybackAccountAvatar'),
  qishuiPlaybackAccountAvatarImage: $('#qishuiPlaybackAccountAvatarImage'),
  qishuiPlaybackAccountAvatarFallback: $('#qishuiPlaybackAccountAvatarFallback'),
  qishuiPlaybackAccountName: $('#qishuiPlaybackAccountName'),
  qishuiPlaybackAccountStatus: $('#qishuiPlaybackAccountStatus'),
  qishuiPlaybackVipBadge: $('#qishuiPlaybackVipBadge'),
  qishuiPlaybackQueue: $('#qishuiPlaybackQueue'),
  qishuiPlaybackLyrics: $('#qishuiPlaybackLyrics'),
  qishuiPlaybackLyricPage: $('#qishuiPlaybackLyricPage'),
  qishuiPlaybackTitle: $('#qishuiPlaybackTitle'),
  qishuiPlaybackArtist: $('#qishuiPlaybackArtist'),
  qishuiPlaybackQuality: $('#qishuiPlaybackQuality'),
  qishuiPlaybackQualityMenu: $('#qishuiPlaybackQualityMenu'),
  qishuiPlaybackProgressRange: $('#qishuiPlaybackProgressRange'),
  qishuiPlaybackCurrentTime: $('#qishuiPlaybackCurrentTime'),
  qishuiPlaybackTotalTime: $('#qishuiPlaybackTotalTime'),
  qishuiPlaybackPreviousButton: $('#qishuiPlaybackPreviousButton'),
  qishuiPlaybackPlayButton: $('#qishuiPlaybackPlayButton'),
  qishuiPlaybackNextButton: $('#qishuiPlaybackNextButton'),
  qishuiPlaybackWheelHint: $('#qishuiPlaybackWheelHint'),
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
const ANDROID_CLIENT = Boolean(window.FeMonsterAndroid);
const MOBILE_RENDER_TARGET = Boolean(
  ANDROID_CLIENT || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
);
const RENDER_PROFILE = detectRenderProfile();
document.documentElement.dataset.renderTier = RENDER_PROFILE.tier;
const PLAYBACK_REST_YAW = 0.22;
const PLAYBACK_REST_PITCH = -0.16;
const COVER_PARTICLE_LOW_WAVE_SEGMENTS = 100;
const PLAYLIST_SONG_RENDER_RADIUS = 7;
const LOCAL_PLAYLIST_ID = 'local-import';
const LOCAL_AUDIO_EXTENSIONS = new Set([
  'mp3', 'flac', 'wav', 'wave', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'webm', 'mp4', 'mka',
  'wma', 'ape', 'alac', 'aif', 'aiff', 'aifc', 'amr', 'caf', 'ac3', 'eac3', 'dts', 'tta',
  'wv', 'dsf', 'dff', 'mid', 'midi', 'm4b', 'mpc', 'tak'
]);
const DYNAMIC_CUBE_GRID = RENDER_PROFILE.cubeGrid;
const DYNAMIC_CUBE_SIZE = 1.46;
// Keep the voxel field unrestricted: spacing controls density instead of a fixed boundary.
const DYNAMIC_CUBE_GAP = DYNAMIC_CUBE_SIZE * 1.52;
const DYNAMIC_CUBE_RADIUS = ((DYNAMIC_CUBE_GRID - 1) * DYNAMIC_CUBE_GAP) / 2;
const DYNAMIC_CUBE_EXTENT = DYNAMIC_CUBE_RADIUS * 2 + DYNAMIC_CUBE_SIZE;
const SONIC_TOPOGRAPHY_GRID = RENDER_PROFILE.topographyGrid;
const SONIC_TOPOGRAPHY_SPACING = 0.98;
const SONIC_TOPOGRAPHY_SIZE = 0.91;
const SONIC_TOPOGRAPHY_HALF = (SONIC_TOPOGRAPHY_GRID * SONIC_TOPOGRAPHY_SPACING) / 2;
const SONIC_LOW_FREQUENCY_BAND_COUNT = 512;
const SONIC_LOW_FREQUENCY_MIN_HZ = 20;
const SONIC_LOW_FREQUENCY_MAX_HZ = 150;
const SONIC_BASS_COLUMN_CLUSTER = Object.freeze({ count: 1009, radius: 18, center: 0, feather: 6 });
const SONIC_BASS_COLUMN_ATTACK_SECONDS = 0.07;
const SONIC_BASS_COLUMN_RELEASE_SECONDS = 0.22;
const SONIC_TOPOGRAPHY_RIPPLES = 10;
const SONIC_TOPOGRAPHY_METEORS = reducedMotion ? Math.min(10, RENDER_PROFILE.topographyMeteors) : RENDER_PROFILE.topographyMeteors;
const SONIC_TOPOGRAPHY_PARTICLES = reducedMotion ? Math.min(90, RENDER_PROFILE.topographyParticles) : RENDER_PROFILE.topographyParticles;
const SONIC_TOPOGRAPHY_CAMERA = Object.freeze({ x: 98, y: 68, z: 98, fov: 60 });
const BOOT_LOGO_TEXT = 'FE moster';
const MUSIC_PROVIDERS = {
  netease: {
    id: 'netease',
    label: '\u7f51\u6613\u4e91',
    appName: '\u7f51\u6613\u4e91\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3010',
    setup: '\u91cd\u65b0\u8fd0\u884c run.cmd\uff0c\u5e94\u7528\u4f1a\u81ea\u52a8\u542f\u52a8\u7f51\u6613\u4e91 API',
    loginQr: true
  },
  qq: {
    id: 'qq',
    label: 'QQ\u97f3\u4e50',
    appName: 'QQ\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3011',
    setup: '\u9700\u8981\u542f\u52a8\u652f\u6301 /login/qr/key \u7684 QQ\u97f3\u4e50 API \u670d\u52a1\u5230 3011',
    loginQr: true
  },
  kugou: {
    id: 'kugou',
    label: '\u9177\u72d7\u97f3\u4e50',
    appName: '\u9177\u72d7\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3012',
    setup: '\u9700\u8981\u542f\u52a8\u652f\u6301 /login/qr/key \u7684 \u9177\u72d7\u97f3\u4e50 API \u670d\u52a1\u5230 3012',
    configured: true,
    loginQr: true
  },
  qishui: {
    id: 'qishui',
    label: '\u6c7d\u6c34\u97f3\u4e50',
    appName: '\u6c7d\u6c34\u97f3\u4e50 App',
    apiUrl: 'http://127.0.0.1:3013',
    setup: '\u8bf7\u5728\u767b\u5f55\u9875\u5bfc\u5165\u6c7d\u6c34\u97f3\u4e50 API \u914d\u7f6e\u6216 ZIP \u5305',
    configured: false,
    loginQr: false
  }
};
const ANDROID_MUSIC_APP_URIS = Object.freeze({
  netease: 'orpheus://',
  qq: 'qqmusic://',
  kugou: 'kugou://'
});
const PLAYBACK_QUALITY_OPTIONS = {
  netease: [
    { id: 'standard', label: '标准', short: 'STD', vip: false },
    { id: 'higher', label: '较高', short: 'HQ', vip: false },
    { id: 'exhigh', label: '极高', short: 'EX', vip: true },
    { id: 'lossless', label: '无损', short: 'SQ', vip: true },
    { id: 'hires', label: 'Hi-Res', short: 'HR', vip: true }
  ],
  qq: [
    { id: '128', label: '标准', short: 'STD', vip: false },
    { id: '320', label: '高品', short: 'HQ', vip: false },
    { id: 'flac', label: '无损', short: 'SQ', vip: true }
  ],
  kugou: [
    { id: '128', label: '标准', short: 'STD', vip: false },
    { id: '320', label: '高品', short: 'HQ', vip: false },
    { id: 'flac', label: '无损', short: 'SQ', vip: true }
  ],
  qishui: [
    { id: 'standard', label: '\u6807\u51c6', short: 'STD', vip: false }
  ]
};
const PLAYBACK_QUALITY_PREFS_KEY = 'fe-monster-playback-quality-prefs-v1';
const RENDER_CLARITY_PREFS_KEY = 'fe-monster-render-clarity-v1';
const PRESET_FSR_PREFS_KEY = 'fe-monster-preset-fsr-v1';
const TEXT_PALETTE_PREFS_KEY = 'fe-monster-text-preset-palettes-v1';
const TEXT_FONT_PREFS_KEY = 'fe-monster-text-preset-fonts-v1';
const PLAYBACK_LYRIC_PALETTE_PREFS_KEY = 'fe-monster-playback-lyric-palette-v1';
const SONIC_SETTINGS_PREFS_KEY = 'fe-monster-sonic-settings-v1';
const DEFAULT_SONIC_SETTINGS = Object.freeze({
  coreColor: null,
  outerColor: null,
  brightness: 1,
  exposure: 0,
  columnHeight: 1,
  fov: SONIC_TOPOGRAPHY_CAMERA.fov,
  smoothing: 1
});
const TEXT_PALETTE_PRESET_IDS = Object.freeze(['depth', 'flow', 'book-effect', 'focus-echo', 'book']);
const TEXT_PALETTE_DEFAULT_COLOR = '#eafbff';
const TEXT_FONT_DEFAULT_ID = 'system';
const TEXT_FONT_FALLBACKS = Object.freeze({
  system: Object.freeze({
    label: '系统字体',
    families: Object.freeze(['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', 'sans-serif'])
  }),
  sans: Object.freeze({
    label: '现代黑体',
    families: Object.freeze(['"Noto Sans SC"', '"Noto Sans CJK SC"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', '"SimHei"', 'sans-serif'])
  }),
  serif: Object.freeze({
    label: '宋体',
    families: Object.freeze(['"Noto Serif SC"', '"Source Han Serif SC"', '"Noto Serif CJK SC"', '"SimSun"', '"宋体"', 'serif'])
  }),
  brush: Object.freeze({
    label: '楷体',
    families: Object.freeze(['"KaiTi"', '"STKaiti"', '"FangSong"', '"STFangsong"', 'cursive'])
  }),
  thin: Object.freeze({
    label: '细黑体',
    families: Object.freeze(['"DengXian Light"', '"DengXian"', '"Noto Sans SC"', '"Microsoft YaHei Light"', 'sans-serif'])
  }),
  handwritten: Object.freeze({
    label: '手写体',
    families: Object.freeze(['"Segoe Print"', '"Segoe Script"', 'cursive'])
  }),
  display: Object.freeze({
    label: '展示体',
    families: Object.freeze(['"Impact"', '"Arial Black"', '"Noto Sans SC"', 'sans-serif'])
  })
});
const TEXT_FONT_OPTIONS = Object.freeze([
  { id: 'nanyong-ming', label: '南廱明體', category: 'serif', families: ['南廱明體', '南廱明体'] },
  { id: 'guanghua-title-black', label: '光华标题黑', category: 'sans', families: ['光华标题黑', '华光标题黑'] },
  { id: 'unbounded-sans', label: '无界黑', category: 'sans', embeddedFamily: 'FE Wujiehei', embeddedLicense: 'SIL OFL 1.1', families: ['FE Wujiehei', '无界黑', '标小智无界黑'] },
  { id: 'hanyi-hero', label: '汉仪英雄体', category: 'brush', families: ['汉仪英雄体', '汉仪英雄体简'] },
  { id: 'zhixin', label: '知新体', category: 'sans', families: ['知新体', '仓耳知新体'] },
  { id: 'nanbowan', label: '少年南波万', category: 'brush', families: ['少年南波万', '少年永远南波万'] },
  { id: 'junlin-jian', label: '俊林简', category: 'sans', families: ['俊林简', '励字俊林简'] },
  { id: 'huimo', label: '挥墨体', category: 'brush', families: ['挥墨体'] },
  { id: 'ruizhi', label: '锐智体', category: 'sans', families: ['锐智体', 'Aa锐智体'] },
  { id: 'new-youth', label: '新青年体', category: 'sans', families: ['新青年体', '文悦新青年体'] },
  { id: 'zhuiguang', label: '追光体', category: 'sans', families: ['追光体', '斗鱼追光体'] },
  { id: 'wenya', label: '文雅体', category: 'sans', families: ['文雅体', '造字工房文雅体'] },
  { id: 'heitang', label: '黑糖体', category: 'sans', families: ['黑糖体'] },
  { id: 'yongkai', label: '咏楷体', category: 'brush', families: ['咏楷体', '字语咏楷体'] },
  { id: 'huiwen-mincho', label: '汇文明朝体', category: 'serif', families: ['汇文明朝体', '汇文明朝體'] },
  { id: 'caveat-regular', label: 'Caveat-Regular', category: 'handwritten', coverage: 'latin', embeddedFamily: 'FE Caveat', embeddedLicense: 'SIL OFL 1.1', families: ['FE Caveat', 'Caveat-Regular', 'Caveat'] },
  { id: 'zy-hope', label: 'ZY Hope', category: 'handwritten', coverage: 'latin', families: ['ZY Hope', 'ZYHope'] },
  { id: 'yuyang-thin', label: '渔阳细体', category: 'thin', families: ['渔阳细体', '仓耳渔阳体 W05', '仓耳渔阳体'] },
  { id: 'facon', label: 'FACON', category: 'display', coverage: 'latin', families: ['FACON', 'Facon'] },
  { id: 'ziyu-cloud-serif', label: '字语云黑宋', category: 'serif', families: ['字语云黑宋'] },
  { id: 'system', label: '系统字体', category: 'system', families: [] },
  { id: 'smiley-sans', label: '得意黑', category: 'sans', embeddedFamily: 'FE Smiley Sans', embeddedLicense: 'SIL OFL 1.1', families: ['FE Smiley Sans', '得意黑', 'Smiley Sans'] },
  { id: 'jianghu', label: '江湖体', category: 'brush', families: ['江湖体', '点字江湖体'] },
  { id: 'fengya-serif', label: '风雅宋', category: 'serif', families: ['风雅宋', '方正风雅宋'] },
  { id: 'douyin', label: '抖音体', category: 'sans', families: ['抖音体'] },
  { id: 'source-han-heavy', label: '思源粗宋', category: 'serif', embeddedFamily: 'FE Noto Serif SC', embeddedLicense: 'SIL OFL 1.1 · Noto Serif SC 兼容字库', families: ['FE Noto Serif SC', '思源粗宋', 'Source Han Serif SC Heavy', 'Source Han Serif Heavy'] },
  { id: 'sanjibangkai', label: '三极榜楷简体', category: 'brush', families: ['三极榜楷简体', '三極榜楷簡體'] },
  { id: 'signboard', label: '招牌体', category: 'brush', families: ['招牌体'] },
  { id: 'tsanger-zhuangyuan', label: '苍耳状元楷', category: 'brush', families: ['苍耳状元楷', '仓耳状元楷'] },
  { id: 'vitality-black', label: '活力黑体', category: 'sans', families: ['活力黑体', '三极活力黑'] },
  { id: 'lijin-black', label: '俪金黑', category: 'sans', families: ['俪金黑', '华康俪金黑'] },
  { id: 'variety', label: '综艺体', category: 'sans', families: ['综艺体'] },
  { id: 'junya', label: '俊雅体', category: 'serif', families: ['俊雅体', '造字工房俊雅体'] },
  { id: 'edo-signboard', label: '江户招牌', category: 'brush', families: ['江户招牌', '点字江户招牌黑'] },
  { id: 'hellofont-liehei', label: '字由列黑', category: 'sans', families: ['字由列黑'] },
  { id: 'rounded', label: '圆体', category: 'sans', families: ['圆体', '幼圆', 'YouYuan', 'Yuanti SC'] },
  { id: 'jinling', label: '金陵体', category: 'serif', families: ['金陵体', '方正金陵体'] },
  { id: 'yansong', label: '研宋体', category: 'serif', families: ['研宋体', 'Aa研宋'] },
  { id: 'postmodern', label: '后现代体', category: 'sans', families: ['后现代体', '文悦后现代体'] },
  { id: 'yanbo-serif', label: '烟波宋', category: 'serif', embeddedFamily: 'FE Yanbo Serif', embeddedLicense: 'SIL OFL 1.1', families: ['FE Yanbo Serif', '烟波宋', '猫啃网烟波宋'] },
  { id: 'hellofont-qiqiao', label: '字由奇巧', category: 'sans', families: ['字由奇巧', '点字奇巧'] },
  { id: 'uisdc-title-black', label: '优设标题黑', category: 'sans', families: ['优设标题黑'] },
  { id: 'sanji-guzhuo-kai', label: '三极古拙楷书', category: 'brush', families: ['三极古拙楷书', '三極古拙楷書'] }
].map((option) => Object.freeze({
  ...option,
  families: Object.freeze(option.families)
})));
const TEXT_FONT_LICENSE_REQUIRED_IDS = new Set([
  'hanyi-hero',
  'zhixin',
  'nanbowan',
  'junlin-jian',
  'huimo',
  'ruizhi',
  'new-youth',
  'zhuiguang',
  'wenya',
  'heitang',
  'yongkai',
  'zy-hope',
  'yuyang-thin',
  'facon',
  'ziyu-cloud-serif',
  'jianghu',
  'fengya-serif',
  'douyin',
  'sanjibangkai',
  'tsanger-zhuangyuan',
  'vitality-black',
  'lijin-black',
  'variety',
  'junya',
  'edo-signboard',
  'hellofont-liehei',
  'jinling',
  'yansong',
  'postmodern',
  'hellofont-qiqiao',
  'uisdc-title-black',
  'sanji-guzhuo-kai'
]);
const TEXT_FONT_LICENSE_VERIFIED_NOT_BUNDLED_IDS = new Set(['huiwen-mincho']);
const PRESET_FSR_MODES = Object.freeze(['auto', 'ultra-quality', 'quality', 'balanced', 'performance']);
const PRESET_FSR_VERSIONS = Object.freeze(['1', '2', '3', '4']);
const RENDER_CLARITY_MIN = 50;
const RENDER_CLARITY_MAX = 125;
const RENDER_CLARITY_AUTO_MAX = 100;
const RENDER_CLARITY_STEP = 5;

function normalizeRenderClarityPercent(value, fallback = 100) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return clamp(
    Math.round(safe / RENDER_CLARITY_STEP) * RENDER_CLARITY_STEP,
    RENDER_CLARITY_MIN,
    RENDER_CLARITY_MAX
  );
}

function loadRenderClarityPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RENDER_CLARITY_PREFS_KEY) || '{}');
    return {
      auto: stored?.auto !== false,
      manualPercent: normalizeRenderClarityPercent(stored?.manualPercent, 100)
    };
  } catch (error) {
    return { auto: true, manualPercent: 100 };
  }
}

function initialAutoRenderClarityPercent() {
  if (MOBILE_RENDER_TARGET) return RENDER_PROFILE.tier === 'economy' ? 60 : 75;
  if (RENDER_PROFILE.tier === 'economy') return 65;
  if (RENDER_PROFILE.tier === 'balanced') return 85;
  return 100;
}

const INITIAL_RENDER_CLARITY_PREFERENCES = loadRenderClarityPreferences();

function normalizePresetFsrMode(value) {
  const mode = safeText(value, 'quality').trim().toLowerCase();
  return PRESET_FSR_MODES.includes(mode) ? mode : 'quality';
}

function normalizePresetFsrVersion(value) {
  const version = safeText(value, '1').trim();
  return PRESET_FSR_VERSIONS.includes(version) ? version : '1';
}

function loadPresetFsrPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PRESET_FSR_PREFS_KEY) || '{}');
    return {
      enabled: stored?.enabled === true,
      version: normalizePresetFsrVersion(stored?.version),
      mode: normalizePresetFsrMode(stored?.mode)
    };
  } catch (error) {
    return { enabled: false, version: '1', mode: 'quality' };
  }
}

const INITIAL_PRESET_FSR_PREFERENCES = loadPresetFsrPreferences();

function loadPlaybackQualityPreferences() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PLAYBACK_QUALITY_PREFS_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.keys(PLAYBACK_QUALITY_OPTIONS).reduce((preferences, provider) => {
      const quality = typeof stored[provider] === 'string' ? stored[provider] : '';
      if (PLAYBACK_QUALITY_OPTIONS[provider].some((option) => option.id === quality)) preferences[provider] = quality;
      return preferences;
    }, {});
  } catch (error) {
    return {};
  }
}

const INITIAL_PLAYBACK_QUALITY_PREFERENCES = loadPlaybackQualityPreferences();

function normalizeTextPaletteColor(value, fallback = TEXT_PALETTE_DEFAULT_COLOR) {
  const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

function normalizeTextPalettePreference(source = {}) {
  return {
    mode: source?.mode === 'manual' ? 'manual' : 'auto',
    color: normalizeTextPaletteColor(source?.color)
  };
}

function loadTextPalettePreferences() {
  let source = {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(TEXT_PALETTE_PREFS_KEY) || '{}');
    source = stored?.palettes && typeof stored.palettes === 'object' ? stored.palettes : stored;
  } catch (error) {
    source = {};
  }
  return TEXT_PALETTE_PRESET_IDS.reduce((preferences, preset) => {
    preferences[preset] = normalizeTextPalettePreference(source?.[preset]);
    return preferences;
  }, {});
}

const INITIAL_TEXT_PALETTE_PREFERENCES = loadTextPalettePreferences();

function normalizeTextFontId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return TEXT_FONT_OPTIONS.some((option) => option.id === id) ? id : TEXT_FONT_DEFAULT_ID;
}

function loadTextFontPreferences() {
  let source = {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(TEXT_FONT_PREFS_KEY) || '{}');
    source = stored?.fonts && typeof stored.fonts === 'object' ? stored.fonts : stored;
  } catch (error) {
    source = {};
  }
  return TEXT_PALETTE_PRESET_IDS.reduce((preferences, preset) => {
    preferences[preset] = normalizeTextFontId(source?.[preset]);
    return preferences;
  }, {});
}

const INITIAL_TEXT_FONT_PREFERENCES = loadTextFontPreferences();

function loadPlaybackLyricPalettePreference() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PLAYBACK_LYRIC_PALETTE_PREFS_KEY) || '{}');
    return normalizeTextPalettePreference(stored?.palette || stored);
  } catch (error) {
    return normalizeTextPalettePreference();
  }
}

const INITIAL_PLAYBACK_LYRIC_PALETTE_PREFERENCE = loadPlaybackLyricPalettePreference();

function normalizeSonicSettings(source = {}) {
  const normalizeOptionalColor = (value) => (
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
      ? value.trim().toLowerCase()
      : null
  );
  const bounded = (value, fallback, minimum, maximum) => {
    const numeric = Number(value);
    return clamp(Number.isFinite(numeric) ? numeric : fallback, minimum, maximum);
  };
  return {
    coreColor: normalizeOptionalColor(source?.coreColor),
    outerColor: normalizeOptionalColor(source?.outerColor),
    brightness: bounded(source?.brightness, DEFAULT_SONIC_SETTINGS.brightness, 0.4, 2),
    exposure: bounded(source?.exposure, DEFAULT_SONIC_SETTINGS.exposure, -1.5, 1.5),
    columnHeight: bounded(source?.columnHeight, DEFAULT_SONIC_SETTINGS.columnHeight, 0.5, 2.5),
    fov: bounded(source?.fov, DEFAULT_SONIC_SETTINGS.fov, 50, 75),
    smoothing: bounded(source?.smoothing, DEFAULT_SONIC_SETTINGS.smoothing, 0.5, 2)
  };
}

function loadSonicSettingsPreferences() {
  try {
    return normalizeSonicSettings(JSON.parse(window.localStorage.getItem(SONIC_SETTINGS_PREFS_KEY) || '{}'));
  } catch (error) {
    return normalizeSonicSettings();
  }
}

const INITIAL_SONIC_SETTINGS = loadSonicSettingsPreferences();
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
const SANDBOX_COMPONENTS_KEY = 'fe-monster-sandbox-components-v1';
const SANDBOX_PRESETS_KEY = 'fe-monster-sandbox-presets-v1';
const SANDBOX_DRAFT_KEY = 'fe-monster-sandbox-draft-v1';
const REMOVED_SANDBOX_PRESET_IDS = new Set(['preset-abyssal-pulse-core-a2']);
const SANDBOX_DEFAULT_COMPONENTS = Object.freeze([
  Object.freeze({
    id: 'core-crystal-orb',
    name: '晶体音频球',
    category: '3d',
    primitive: 'sphere',
    color: '#83e4ff',
    dimensions: Object.freeze({ x: 1.35, y: 1.35, z: 1.35 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'scale',
    musicBand: 'bass',
    amplitude: 58,
    speed: 1.1,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-pulse-cube',
    name: '脉冲方块',
    category: '3d',
    primitive: 'box',
    color: '#b8ffe2',
    dimensions: Object.freeze({ x: 1.2, y: 1.2, z: 1.2 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'spin',
    beatMode: 'bounce',
    musicBand: 'energy',
    amplitude: 38,
    speed: 0.8,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-sonic-ring',
    name: '声波圆环',
    category: '3d',
    primitive: 'torus',
    color: '#9fc6ff',
    dimensions: Object.freeze({ x: 1.55, y: 1.55, z: 0.48 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'wave',
    musicBand: 'treble',
    amplitude: 46,
    speed: 1.25,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-light-cone',
    name: '低频光锥',
    category: '3d',
    primitive: 'cone',
    color: '#ffd59e',
    dimensions: Object.freeze({ x: 1.1, y: 1.7, z: 1.1 }),
    rotation360: false,
    interaction: 'drag',
    motion: 'float',
    beatMode: 'bounce',
    musicBand: 'bass',
    amplitude: 32,
    speed: 0.72,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-2d-light-panel',
    name: '霓虹光幕',
    category: '2d',
    primitive: 'plane',
    color: '#7de9ff',
    dimensions: Object.freeze({ x: 2.4, y: 1.35, z: 0.12 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'wave',
    musicBand: 'energy',
    amplitude: 28,
    speed: 0.8,
    opacity: 0.68,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-2d-pulse-disc',
    name: '脉冲唱片',
    category: '2d',
    primitive: 'disc',
    color: '#ffb5e8',
    dimensions: Object.freeze({ x: 1.8, y: 1.8, z: 0.12 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'spin',
    beatMode: 'scale',
    musicBand: 'bass',
    amplitude: 42,
    speed: 0.72,
    opacity: 0.82,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-2d-spectrum-ring',
    name: '频谱平面环',
    category: '2d',
    primitive: 'ring-2d',
    color: '#fff0a6',
    dimensions: Object.freeze({ x: 2.1, y: 2.1, z: 0.1 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'wave',
    musicBand: 'treble',
    amplitude: 52,
    speed: 1.18,
    opacity: 0.76,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-particle-field',
    name: '星尘粒子场',
    category: 'particle',
    primitive: 'particle-field',
    color: '#bdefff',
    dimensions: Object.freeze({ x: 2.8, y: 2.2, z: 2.8 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'float',
    beatMode: 'scale',
    musicBand: 'energy',
    amplitude: 36,
    speed: 0.66,
    particleCount: 320,
    opacity: 0.86,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-particle-ring',
    name: '轨道粒子环',
    category: 'particle',
    primitive: 'particle-ring',
    color: '#91ffcb',
    dimensions: Object.freeze({ x: 2.2, y: 2.2, z: 0.7 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'wave',
    musicBand: 'bass',
    amplitude: 62,
    speed: 1.12,
    particleCount: 240,
    opacity: 0.9,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-particle-fountain',
    name: '节拍粒子喷泉',
    category: 'particle',
    primitive: 'particle-fountain',
    color: '#aab9ff',
    dimensions: Object.freeze({ x: 2, y: 3.2, z: 2 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'bounce',
    musicBand: 'treble',
    amplitude: 72,
    speed: 1.3,
    particleCount: 420,
    opacity: 0.82,
    source: 'built-in'
  }),
  Object.freeze({
    id: 'core-particle-cloud',
    name: '低频火花云',
    category: 'particle',
    primitive: 'spark-cloud',
    color: '#ffcb8e',
    dimensions: Object.freeze({ x: 2.6, y: 1.8, z: 2.6 }),
    rotation360: true,
    interaction: 'drag',
    motion: 'music',
    beatMode: 'scale',
    musicBand: 'bass',
    amplitude: 68,
    speed: 0.94,
    particleCount: 360,
    opacity: 0.88,
    source: 'built-in'
  })
]);

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

  if (MOBILE_RENDER_TARGET) {
    const lowEndAndroid = ANDROID_CLIENT && window.feMonsterAndroidPerformanceTier === 'low';
    return Object.freeze({
      tier: lowEndAndroid ? 'economy' : 'mobile',
      canvasDprMax: 1,
      playbackDprMax: 1,
      webglDprMax: 1,
      cubeGrid: lowEndAndroid ? 15 : 18,
      topographyGrid: lowEndAndroid ? 64 : 84,
      topographyMeteors: lowEndAndroid ? 3 : 6,
      topographyParticles: lowEndAndroid ? 28 : 48,
      orbParticles: lowEndAndroid ? 260 : 420,
      playbackParticles: lowEndAndroid ? 340 : 520,
      orbQualityMin: lowEndAndroid ? 0.18 : 0.22,
      orbQualityMax: lowEndAndroid ? 0.34 : 0.46,
      playbackQualityMin: lowEndAndroid ? 0.22 : 0.28,
      playbackQualityMax: lowEndAndroid ? 0.42 : 0.56,
      orbParticleFloor: lowEndAndroid ? 110 : 160,
      playbackParticleFloor: lowEndAndroid ? 150 : 220,
      cubeFrameGapMs: lowEndAndroid ? 42 : 34,
      topographyFrameGapMs: lowEndAndroid ? 50 : 40,
      targetFrameMs: lowEndAndroid ? 42 : 34,
      ambientStreaks: false,
      orbGlow: false
    });
  }

  if (high) {
    return Object.freeze({
      tier: 'high',
      canvasDprMax: 2,
      playbackDprMax: 1.85,
      webglDprMax: 1.9,
      cubeGrid: 32,
      topographyGrid: 184,
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
      targetFrameMs: 24,
      ambientStreaks: true,
      orbGlow: true
    });
  }

  if (economy) {
    return Object.freeze({
      tier: 'economy',
      canvasDprMax: 1.35,
      playbackDprMax: 1.25,
      webglDprMax: 1.25,
      cubeGrid: 24,
      topographyGrid: 124,
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
      targetFrameMs: 34,
      ambientStreaks: true,
      orbGlow: true
    });
  }

  return Object.freeze({
    tier: 'balanced',
    canvasDprMax: 1.65,
    playbackDprMax: 1.5,
    webglDprMax: 1.6,
    cubeGrid: 28,
    topographyGrid: 156,
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
    targetFrameMs: 28,
    ambientStreaks: true,
    orbGlow: true
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
    if (element.hidden) return;
    if (MOBILE_RENDER_TARGET) {
      element.classList.remove('glass-surface--svg');
      element.classList.add('glass-surface--fallback', 'glass-surface--mobile-lite');
      return;
    }
    hydrateGlassSurface(element, index + 1);
  });
}

const state = {
  queue: [],
  queueIndex: -1,
  currentSong: null,
  playerUrl: '',
  playbackQualityPreferences: INITIAL_PLAYBACK_QUALITY_PREFERENCES,
  playbackQuality: INITIAL_PLAYBACK_QUALITY_PREFERENCES.netease || 'standard',
  qualityMenuOpen: false,
  qualityLoginRequests: {},
  renderClarity: {
    auto: INITIAL_RENDER_CLARITY_PREFERENCES.auto,
    manualPercent: INITIAL_RENDER_CLARITY_PREFERENCES.manualPercent,
    autoPercentByScene: Object.create(null),
    activeSceneKey: '',
    initialAutoPercent: initialAutoRenderClarityPercent(),
    refreshHz: 60,
    targetFrameMs: MOBILE_RENDER_TARGET ? RENDER_PROFILE.targetFrameMs : 1000 / 60,
    frameSamples: [],
    warmupFrames: 0,
    overBudgetFrames: 0,
    underBudgetFrames: 0,
    lastFrameAt: 0,
    lastAdjustmentAt: -Infinity,
    lastUiUpdateAt: 0,
    sandboxSignature: ''
  },
  presetFsr: {
    enabled: INITIAL_PRESET_FSR_PREFERENCES.enabled,
    version: INITIAL_PRESET_FSR_PREFERENCES.version,
    mode: INITIAL_PRESET_FSR_PREFERENCES.mode,
    lastDiagnostics: null
  },
  playerClock: {
    position: 0,
    duration: 0,
    updatedAt: 0,
    playing: false
  },
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
  localPlaylistSongs: [],
  localObjectUrls: new Set(),
  localQueueActive: false,
  activePlaylistId: '',
  playlistSignature: '',
  playlistRefreshTimer: 0,
  playlistsLoggedIn: false,
  playlistsLoading: false,
  playlistFocusIndex: 0,
  songFocusIndex: 0,
  songWheelDelta: 0,
  songWheelFrame: 0,
  songButtonCache: [],
  playlistSongPageOpen: false,
  playbackPlaylistPickerOpen: false,
  playlistLoadRequestId: 0,
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
  playbackPage: true,
  playbackChrome: {
    searchVisible: false,
    dockVisible: false,
    dockPinned: false,
    communityVisible: false,
    controlsHidden: false
  },
  diyOpen: false,
  diyPeek: false,
  diyAutoHideTimer: 0,
  diyCardOpen: false,
  diyCardYaw: -8,
  diyCardPitch: 2,
  diyCardDrag: null,
  diyPageTransitionTimer: 0,
  diyPage: 'wallpaper',
  diyPreset: 'wallpaper',
  scenePreset: 'lyric',
  textPreset: 'none',
  lastSelectableTextPreset: 'none',
  textPalettePreferences: INITIAL_TEXT_PALETTE_PREFERENCES,
  textFontPreferences: INITIAL_TEXT_FONT_PREFERENCES,
  textFontAvailability: {},
  textFontStack: '',
  playbackLyricPalettePreference: INITIAL_PLAYBACK_LYRIC_PALETTE_PREFERENCE,
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
  activeWallpaperIds: { imported: '', live: '' },
  wallpaperLoading: false,
  sandbox: {
    open: false,
    playbackPresetId: '',
    selectedPresetId: '',
    playbackAssetReady: false,
    playbackAssetFailed: false,
    playbackPreviewUrl: '',
    playbackKeepBackground: false,
    presetGroupExpanded: false,
    stormLightingMode: 'sunset',
    stormWeatherMode: 'auto',
    tab: 'library',
    sceneName: '我的音乐场景',
    components: loadSandboxComponents(),
    presets: loadSandboxPresets(),
    sceneItems: [],
    selectedId: '',
    selectedLibraryId: '',
    generationRunning: false,
    codexDraft: null,
    codexConversation: [],
    referenceImage: '',
    referenceImagePending: false,
    presetFolder: '',
    renderer: null,
    renderQuality: null,
    scene3d: null,
    defaultEnvironment: null,
    camera: null,
    cameraTarget: null,
    sceneGroup: null,
    previewRenderer: null,
    previewScene: null,
    previewCamera: null,
    previewMesh: null,
    meshes: new Map(),
    raycaster: null,
    pointer: null,
    groundPlane: null,
    dragPointerId: null,
    draggedItemId: '',
    orbitPointerId: null,
    orbitLastX: 0,
    orbitLastY: 0,
    yaw: 0.68,
    pitch: 0.72,
    distance: 10.5,
    animationFrame: 0,
    lastFrameAt: 0,
    renderRequested: false,
    resizePending: true,
    resizeObserver: null,
    editorHelpers: [],
    lastRenderQualityStatusAt: 0,
    draftSaveTimer: 0
  },
  lyricSignature: '',
  lyricLoadingSignature: '',
  lyricNoLyricSignature: '',
  lyricRetryTimer: 0,
  lyricRetryAttempts: {},
  lyricLines: [],
  lyricIndex: -1,
  lyricBookSignature: '',
  lyricBookIndex: -2,
  lyricBookCurrentLine: null,
  lyricDisplayText: '',
  lyricSubtitleText: '',
  lyricProgressPercent: -1,
  lyricGlyphRenderMode: '',
  lyricTimingScale: 1,
  lyricFrameTime: -1,
  lyricFramePreset: '',
  lyricFrameSignature: '',
  focusEchoAnimationFrame: 0,
  lyricBookScrollTarget: Number.NaN,
  lyricBookScrollFrameAt: 0,
  lyricBookLayoutVersion: 0,
  lyricBookFitFrame: 0,
  lyricPlaybackGlyphs: [],
  lyricPlaybackGlyphCount: 0,
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
    palette: null,
    quality: RENDER_PROFILE.playbackQualityMax,
    lastFrameTime: 0,
    lastMotionAt: 0,
    frameStep: 1,
    spriteDpr: 0,
    particleSprites: [],
    particles: []
  },
  coverParticle: {
    bundlePromise: null,
    engineContainer: null,
    enginePromise: null,
    enginePlaying: false,
    engineVisible: false,
    image: null,
    imageSignature: '',
    sampleSignature: '',
    palette: null,
    particles: [],
    bass: 0,
    energy: 0,
    beat: 0,
    lastWidth: 0,
    lastHeight: 0,
    lastDpr: 0,
    gpuRenderer: null,
    gpuScene: null,
    gpuCamera: null,
    gpuGeometry: null,
    gpuMaterial: null,
    gpuPoints: null,
    gpuSignature: '',
    gpuFailed: false,
    gpuWidth: 0,
    gpuHeight: 0,
    backgroundEnabled: true,
    motionAmplitude: 0.8
  },
  bookEffectTransform: {
    x: 0,
    y: 0,
    rotate: -7,
    pending: false,
    dragging: false,
    mode: '',
    pointerId: null,
    holdTimer: 0,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startRotate: -7
  },
  bookLyricTransform: {
    x: 0,
    y: 0,
    rotate: 0,
    pending: false,
    dragging: false,
    mode: '',
    pointerId: null,
    holdTimer: 0,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startRotate: 0,
    suppressClick: false
  },
  chladniTextTransform: {
    x: 0,
    y: 0,
    rotate: 0,
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    dragging: false,
    mode: 'move',
    pointerId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    startRotateX: 0,
    startRotateY: 0
  },
  rainGlassScene: {
    drops: [],
    staticDrops: [],
    specks: [],
    staticCanvas: null,
    staticLayerReady: false,
    backgroundImage: null,
    backgroundReady: false,
    width: 0,
    height: 0,
    dpr: 1,
    lastFrameAt: 0
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
  loginStatusByProvider: {},
  loginStatusRetryTimers: {},
  loginStatusRetryAttempts: {},
  loginQrKey: '',
  loginQrTimer: 0,
  loginQrLoading: false,
  musicApiImporting: false,
  loginQrRequestId: 0,
  qishuiPhoneSending: false,
  qishuiPhoneVerifying: false,
  qishuiPhoneCooldownUntil: 0,
  qishuiPhoneCooldownTimer: 0,
  qishuiGuestMode: false,
  qishuiPlaybackCard: {
    wheelDelta: 0,
    switching: false,
    switchTimer: 0,
    switchId: 0,
    expanded: false,
    hiddenByUser: false,
    visibilityTransitionTimer: 0,
    visibilityTransitionFrame: 0,
    lastLyricIndex: -1,
    lyricSignature: '',
    lyricBookIndex: -2,
    lyricBookCurrentLine: null,
    lyricBookArrivedIndex: -2,
    lyricBookScrollTarget: Number.NaN,
    lyricBookScrollFrameAt: 0,
    lyricBookLayoutVersion: 0,
    lyricBookLayoutFrame: 0,
    progressDragging: false,
    seekRequestId: 0,
    seekPending: false,
    pendingSeekTarget: null,
    pendingAudioSeekTarget: null
  },
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
    broadcastLatest: null,
    broadcastSeenKey: '',
    broadcastUnread: false,
    broadcastToastTimer: 0,
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
    marketLoading: false,
    marketItems: [],
    marketQuery: '',
    marketRefreshTimer: 0,
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
    lowFrequencyBands: new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT),
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
    lowFrequencyBands: new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT),
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
    webglRenderer: '',
    renderCapabilities: {
      requestId: '',
      native: null,
      diagnostics: null
    }
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
    lowFrequencyBands: new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT),
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
    renderQuality: null,
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
    resizeObserver: null,
    push: 0,
    bass: 0,
    energy: 0
  },
  freeCube: {
    runtime: null,
    mode: 'free',
    backgroundEnabled: true,
    palette: null,
    frame: {},
    lastDiagnostics: null
  },
  voidPrism: {
    runtime: null,
    frame: {},
    lastDiagnostics: null
  },
  chladni: {
    runtime: null,
    mode: 'cube',
    palette: null,
    frame: {},
    lastDiagnostics: null
  },
  sonicTopography: {
    built: false,
    count: 0,
    renderer: null,
    renderQuality: null,
    scene: null,
    camera: null,
    group: null,
    terrain: null,
    material: null,
    uniforms: null,
    lowFrequencySpectrum: null,
    lowFrequencySpectrumData: null,
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
    resizeObserver: null,
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
    projectilesActive: false,
    projectilesNeedClear: false,
    settings: { ...INITIAL_SONIC_SETTINGS },
    frameAudio: {
      subBass: 0,
      bass: 0,
      lowFrequencyAmplitude: 0,
      lowFrequencyBands: new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT),
      lowFrequencyBandTargets: new Float32Array(SONIC_LOW_FREQUENCY_BAND_COUNT),
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      brilliance: 0,
      air: 0,
      energy: 0,
      warmth: 0,
      brightness: 0,
      sharpness: 0,
      smoothness: 0.7,
      density: 0,
      spectralCentroid: 0,
      fluxPulse: 0,
      fluxMeteor: 0,
      beat: 0
    },
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
    lastPaintAt: 0,
    lastSpectrumAt: 0,
    animationFrame: 0,
    coveredCanvasKey: '',
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
    const error = new Error(json.error || `接口失败: ${response.status}`);
    error.status = response.status;
    error.code = typeof json.code === 'string' ? json.code : '';
    error.payload = json;
    throw error;
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
  document.documentElement.dataset.upscaler = safeText(state.clientRuntime.renderCapabilities?.diagnostics?.mode, 'detecting');
}

function syncRenderTechnologyStatus(diagnostics = state.clientRuntime.renderCapabilities?.diagnostics) {
  const capabilities = state.clientRuntime.renderCapabilities || {};
  const native = capabilities.native || {};
  const dlss = native.upscalers?.dlss || {};
  const rendererText = `${state.clientRuntime.webglVendor || ''} ${state.clientRuntime.webglRenderer || ''}`;
  const isAmd = /amd|radeon/i.test(rendererText);
  const isNvidia = /nvidia|geforce|rtx/i.test(rendererText);
  const compatibleFsr = diagnostics?.enabled === true && (
    diagnostics?.family === 'fsr1-compatible-webgl' ||
    diagnostics?.algorithm === 'fsr1-compatible-webgl' ||
    diagnostics?.algorithm === 'adaptive-spatial'
  );
  const mode = compatibleFsr ? 'fsr1-compatible-webgl' : diagnostics?.mode === 'dlss-native' ? 'dlss-native' : 'native-resolution';
  const scale = Number(diagnostics?.renderScale);
  let label = mode === 'fsr1-compatible-webgl'
    ? `${isAmd ? 'AMD GPU · ' : isNvidia ? 'NVIDIA GPU · ' : ''}FSR 1.0 兼容（WebGL）`
    : '原生分辨率';
  let detail = mode === 'fsr1-compatible-webgl'
    ? `仅场景预设 · EASU/RCAS 思路兼容实现${Number.isFinite(scale) ? ` · ${Math.round(scale * 100)}% 内部渲染` : ''} · 非 AMD 官方 SDK`
    : '当前设备使用播放页原生分辨率';
  if (dlss.available === true && diagnostics?.mode === 'dlss-native') {
    label = 'NVIDIA DLSS（原生）';
    detail = 'Streamline 原生渲染链已初始化';
  } else if (state.presetFsr.enabled && presetFsrSceneActive() && renderClaritySoftwareRenderer()) {
    label = 'FSR 安全回退';
    detail = '检测到软件渲染器 · 当前预设保持原生直渲，避免闪退和卡顿';
  } else if (state.presetFsr.enabled && !presetFsrSceneActive()) {
    label = 'FSR 1.0 兼容已开启';
    detail = '仅进入 WebGL 场景预设时生效 · 当前页面保持原生渲染';
  } else if (isNvidia) {
    detail += ' · DLSS 等待原生 D3D12 渲染链';
  } else if (isAmd) {
    detail += ' · 原生 FSR SDK 等待 D3D12 渲染链';
  }
  if (els.upscalerStatus) els.upscalerStatus.textContent = label;
  if (els.upscalerDetail) els.upscalerDetail.textContent = detail;
  const card = els.upscalerStatus?.closest('.runtime-render-technology');
  if (card) card.dataset.native = String(dlss.available === true || native.upscalers?.fsrNative?.available === true);
  document.documentElement.dataset.upscaler = mode;
}

function presetFsrSceneActive() {
  if (!state.playbackPage || state.sandbox.open) return false;
  if (sandboxPlaybackActive()) return true;
  return ['cube', 'free-cubes', 'void-prism', 'topography', 'chladni'].includes(state.diyPreset);
}

function savePresetFsrPreferences() {
  try {
    window.localStorage.setItem(PRESET_FSR_PREFS_KEY, JSON.stringify({
      enabled: !!state.presetFsr.enabled,
      version: normalizePresetFsrVersion(state.presetFsr.version),
      mode: normalizePresetFsrMode(state.presetFsr.mode)
    }));
  } catch (error) {
    // Rendering remains usable when WebView storage is unavailable.
  }
}

function presetFsrEffectiveVersion() {
  const requested = normalizePresetFsrVersion(state.presetFsr.version);
  if (requested === '1') return '1';
  const native = state.clientRuntime.renderCapabilities?.native || {};
  const capability = native.upscalers?.[`fsr${requested}`] || {};
  const controllerReady = typeof window.feMonsterNativePresetUpscaler?.configure === 'function';
  return native.host?.ownsNativeRenderTargets === true && capability.available === true && controllerReady
    ? requested
    : '1';
}

function presetFsrVersionFallbackReason() {
  const requested = normalizePresetFsrVersion(state.presetFsr.version);
  if (requested === '1' || presetFsrEffectiveVersion() === requested) return '';
  if (requested === '2') return 'FSR 2 需要运动矢量、深度与时间历史；当前 WebGL 链回退 FSR 1';
  if (requested === '3') return 'FSR 3 需要原生时域输入与帧生成交换链；当前 WebGL 链回退 FSR 1';
  return 'FSR 4 需要 DirectX 12、官方 SDK、兼容显卡与完整时域输入；当前 WebGL 链回退 FSR 1';
}

function presetFsrModeLabel(mode = state.presetFsr.mode) {
  return ({
    auto: '自动',
    'ultra-quality': '超高质量',
    quality: '质量',
    balanced: '均衡',
    performance: '性能'
  })[normalizePresetFsrMode(mode)] || '质量';
}

function presetFsrFallbackLabel(reason) {
  return ({
    'webgl2-unavailable': '设备仅支持 WebGL1，已回退原生',
    'software-renderer': '软件渲染器安全回退原生',
    'hardware-limits': 'GPU 纹理尺寸不足，已回退原生',
    'pipeline-unavailable': '升频管线不可用，已回退原生',
    'pipeline-initialization-failed': '升频初始化失败，已回退原生',
    'pipeline-render-failed': '升频渲染失败，已回退原生',
    'mode-direct': '当前使用直接渲染'
  })[safeText(reason, '')] || '当前场景保持原生渲染';
}

function presetFsrRequest(active = presetFsrSceneActive()) {
  const forcedNative = new URLSearchParams(window.location.search).get('render-quality') === 'native';
  if (!active || !state.presetFsr.enabled || forcedNative || renderClaritySoftwareRenderer()) return 'native';
  if (presetFsrEffectiveVersion() !== '1') return 'native';
  const mode = normalizePresetFsrMode(state.presetFsr.mode);
  if (mode === 'auto') {
    const scale = clamp(effectiveRenderClarityPercent() / 100, 0.5, 0.77);
    return {
      name: 'auto',
      scale,
      dynamicResolution: false,
      sharpness: clamp(0.2 + (0.77 - scale) * 0.34, 0.2, 0.3),
      targetFrameMs: state.renderClarity.targetFrameMs
    };
  }
  const sharpness = ({
    'ultra-quality': 0.2,
    quality: 0.22,
    balanced: 0.25,
    performance: 0.28
  })[mode] || 0.22;
  return { name: mode, dynamicResolution: false, sharpness, targetFrameMs: state.renderClarity.targetFrameMs };
}

function createPresetRenderQuality(renderer, sharpness = 0.22) {
  if (!renderer || !window.FeRenderQuality?.create || !window.THREE) return null;
  try {
    return window.FeRenderQuality.create(renderer, {
      THREE: window.THREE,
      mode: 'native',
      initialScale: 1,
      minScale: 0.5,
      maxScale: 1,
      targetFrameMs: state.renderClarity.targetFrameMs,
      sharpness
    });
  } catch (error) {
    return null;
  }
}

function presetFsrOutputPixelRatio(diagnostics) {
  return diagnostics?.enabled === true ? sandboxRenderPixelRatio() : renderPixelRatio('webgl');
}

function syncPresetFsrControls(diagnostics = state.presetFsr.lastDiagnostics) {
  if (els.presetFsrToggle) els.presetFsrToggle.checked = !!state.presetFsr.enabled;
  if (els.presetFsrVersion) {
    els.presetFsrVersion.value = normalizePresetFsrVersion(state.presetFsr.version);
    els.presetFsrVersion.disabled = !state.presetFsr.enabled;
  }
  if (els.presetFsrMode) {
    els.presetFsrMode.value = normalizePresetFsrMode(state.presetFsr.mode);
    els.presetFsrMode.disabled = !state.presetFsr.enabled;
  }
  document.documentElement.dataset.presetFsr = state.presetFsr.enabled
    ? `fsr${normalizePresetFsrVersion(state.presetFsr.version)}-${normalizePresetFsrMode(state.presetFsr.mode)}`
    : 'off';
  if (!els.presetFsrDetail) return;
  const versionFallback = presetFsrVersionFallbackReason();
  if (!state.presetFsr.enabled) {
    els.presetFsrDetail.textContent = '关闭 · 预设使用当前清晰度直接渲染';
  } else if (versionFallback) {
    els.presetFsrDetail.textContent = versionFallback;
  } else if (presetFsrSceneActive() && renderClaritySoftwareRenderer()) {
    els.presetFsrDetail.textContent = `${presetFsrModeLabel()} · 软件渲染器安全回退原生`;
  } else if (diagnostics?.enabled) {
    const scale = Math.round((Number(diagnostics.renderScale) || 1) * 100);
    els.presetFsrDetail.textContent = `${presetFsrModeLabel()} · ${scale}% 内部渲染 · 仅场景预设`;
  } else if (!presetFsrSceneActive()) {
    els.presetFsrDetail.textContent = `${presetFsrModeLabel()} · 等待进入 WebGL 场景预设`;
  } else {
    els.presetFsrDetail.textContent = `${presetFsrModeLabel()} · ${presetFsrFallbackLabel(diagnostics?.fallbackReason)}`;
  }
}

function renderClaritySceneKey() {
  if (sandboxPlaybackActive()) return `sandbox:${state.sandbox.playbackPresetId || 'playback'}`;
  if (state.sandbox.open) return 'sandbox:editor';
  if (state.playbackPage) return `playback:${state.diyPreset || state.textPreset || 'lyric'}`;
  return 'home';
}

function renderClaritySoftwareRenderer() {
  const renderer = `${state.clientRuntime.webglVendor || ''} ${state.clientRuntime.webglRenderer || ''}`;
  return /swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer);
}

function autoRenderClarityCeiling() {
  return renderClaritySoftwareRenderer() ? 65 : RENDER_CLARITY_AUTO_MAX;
}

function autoRenderClarityPercent(sceneKey = renderClaritySceneKey()) {
  const clarity = state.renderClarity;
  if (!Number.isFinite(clarity.autoPercentByScene[sceneKey])) {
    clarity.autoPercentByScene[sceneKey] = Math.min(clarity.initialAutoPercent, autoRenderClarityCeiling());
  }
  return normalizeRenderClarityPercent(
    Math.min(clarity.autoPercentByScene[sceneKey], autoRenderClarityCeiling()),
    clarity.initialAutoPercent
  );
}

function effectiveRenderClarityPercent() {
  return state.renderClarity.auto
    ? autoRenderClarityPercent()
    : normalizeRenderClarityPercent(state.renderClarity.manualPercent, 100);
}

function renderClarityLabel(percent) {
  if (percent <= 60) return '流畅';
  if (percent <= 80) return '均衡';
  if (percent < 100) return '清晰';
  if (percent === 100) return '标准';
  return '超清';
}

function saveRenderClarityPreferences() {
  try {
    window.localStorage.setItem(RENDER_CLARITY_PREFS_KEY, JSON.stringify({
      auto: !!state.renderClarity.auto,
      manualPercent: normalizeRenderClarityPercent(state.renderClarity.manualPercent, 100)
    }));
  } catch (error) {
    // Rendering remains usable when WebView storage is unavailable.
  }
}

function resetRenderClaritySampling(sceneKey = renderClaritySceneKey(), warmupFrames = 60) {
  const clarity = state.renderClarity;
  clarity.activeSceneKey = sceneKey;
  clarity.frameSamples.length = 0;
  clarity.warmupFrames = warmupFrames;
  clarity.overBudgetFrames = 0;
  clarity.underBudgetFrames = 0;
  clarity.lastFrameAt = 0;
}

function syncRenderClarityControls(now = performance.now()) {
  const clarity = state.renderClarity;
  const effectivePercent = effectiveRenderClarityPercent();
  if (els.renderClarityAutoToggle) els.renderClarityAutoToggle.checked = !!clarity.auto;
  if (els.renderClarityRange) {
    els.renderClarityRange.disabled = !!clarity.auto;
    els.renderClarityRange.value = String(clarity.auto ? effectivePercent : clarity.manualPercent);
    syncElasticRangeVisual(els.renderClarityRange);
  }
  if (els.renderClarityValue) {
    els.renderClarityValue.textContent = clarity.auto
      ? `自动 · ${effectivePercent}%`
      : `${effectivePercent}%`;
  }
  if (els.renderClarityDetail) {
    const samples = clarity.frameSamples;
    const recentMs = samples.length ? samples[samples.length - 1] : 0;
    const fps = recentMs > 0 ? Math.round(1000 / recentMs) : 0;
    const device = renderClaritySoftwareRenderer() ? '软件渲染安全档' : `${Math.round(clarity.refreshHz)}Hz 屏幕`;
    els.renderClarityDetail.textContent = clarity.auto
      ? `${device} · 当前${renderClarityLabel(effectivePercent)}${fps ? ` · 约 ${fps} FPS` : ''} · 按场景实时校准`
      : `手动固定 · ${renderClarityLabel(effectivePercent)} · 不随帧率自动变化`;
  }
  clarity.lastUiUpdateAt = now;
}

function measureDisplayRefreshRate() {
  const samples = [];
  const startedAt = performance.now();
  let lastFrameAt = 0;
  const sample = (now) => {
    if (lastFrameAt) {
      const elapsed = now - lastFrameAt;
      if (elapsed >= 1.5 && elapsed <= 100) samples.push(elapsed);
    }
    lastFrameAt = now;
    if (samples.length < 32 && now - startedAt < 4000) {
      window.requestAnimationFrame(sample);
      return;
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || RENDER_PROFILE.targetFrameMs || 1000 / 60;
    const refreshHz = clamp(Math.round(1000 / median), 15, 500);
    state.renderClarity.refreshHz = refreshHz;
    state.renderClarity.targetFrameMs = MOBILE_RENDER_TARGET
      ? RENDER_PROFILE.targetFrameMs
      : 1000 / clamp(refreshHz, 60, 120);
    syncRenderClarityControls();
  };
  window.requestAnimationFrame(sample);
}

function renderClarityPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))];
}

function setAutoRenderClarityPercent(sceneKey, nextPercent, now = performance.now()) {
  const clarity = state.renderClarity;
  const current = autoRenderClarityPercent(sceneKey);
  const next = normalizeRenderClarityPercent(
    clamp(nextPercent, RENDER_CLARITY_MIN, autoRenderClarityCeiling()),
    current
  );
  if (next === current) return false;
  clarity.autoPercentByScene[sceneKey] = next;
  clarity.lastAdjustmentAt = now;
  resetRenderClaritySampling(sceneKey, 30);
  applyRenderClarity({ force: true });
  return true;
}

function observeRenderClarityFrame(now = performance.now()) {
  const clarity = state.renderClarity;
  if (document.hidden) {
    clarity.lastFrameAt = 0;
    return;
  }
  const sceneKey = renderClaritySceneKey();
  if (clarity.activeSceneKey !== sceneKey) {
    resetRenderClaritySampling(sceneKey);
    applyRenderClarity({ force: true });
    return;
  }
  if (!clarity.lastFrameAt) {
    clarity.lastFrameAt = now;
    return;
  }
  const frameMs = now - clarity.lastFrameAt;
  clarity.lastFrameAt = now;
  if (!Number.isFinite(frameMs) || frameMs < 1.5 || frameMs > 100) return;
  if (clarity.warmupFrames > 0) {
    clarity.warmupFrames -= 1;
    return;
  }
  clarity.frameSamples.push(frameMs);
  if (clarity.frameSamples.length > 60) clarity.frameSamples.shift();
  if (now - clarity.lastUiUpdateAt >= 500) syncRenderClarityControls(now);
  if (!clarity.auto || clarity.frameSamples.length < 60) return;

  const p90FrameMs = renderClarityPercentile(clarity.frameSamples, 0.9);
  const targetFrameMs = sceneKey === 'home'
    ? Math.max(clarity.targetFrameMs, RENDER_PROFILE.targetFrameMs)
    : clarity.targetFrameMs;
  if (reducedMotion) return;
  if (p90FrameMs > targetFrameMs * 1.08) {
    clarity.overBudgetFrames += 1;
    clarity.underBudgetFrames = Math.max(0, clarity.underBudgetFrames - 2);
  } else if (p90FrameMs < targetFrameMs * 0.72) {
    clarity.underBudgetFrames += 1;
    clarity.overBudgetFrames = Math.max(0, clarity.overBudgetFrames - 2);
  } else {
    clarity.overBudgetFrames = Math.max(0, clarity.overBudgetFrames - 1);
    clarity.underBudgetFrames = Math.max(0, clarity.underBudgetFrames - 1);
  }
  if (now - clarity.lastAdjustmentAt < 1500) return;
  const current = autoRenderClarityPercent(sceneKey);
  if (clarity.overBudgetFrames >= 24) {
    setAutoRenderClarityPercent(sceneKey, current - RENDER_CLARITY_STEP, now);
  } else if (clarity.underBudgetFrames >= 180) {
    setAutoRenderClarityPercent(sceneKey, current + RENDER_CLARITY_STEP, now);
  }
}

function sandboxRenderPixelRatio() {
  const nativeDpr = Math.max(0.5, Number(window.devicePixelRatio) || 1);
  const scale = Math.max(1, effectiveRenderClarityPercent() / 100);
  const base = Math.min(nativeDpr, RENDER_PROFILE.webglDprMax);
  return clamp(base * scale, 0.5, 2.5);
}

function sandboxRenderQualityRequest() {
  return presetFsrRequest(sandboxPlaybackActive());
}

function applySandboxRenderClarity(force = false) {
  const sandbox = state.sandbox;
  if (!sandbox.renderer) return;
  const request = sandboxRenderQualityRequest();
  const requestedSignature = typeof request === 'string' ? request : JSON.stringify(request);
  if (!force && sandbox.renderQuality && state.renderClarity.sandboxSignature === requestedSignature) return;

  let diagnostics = null;
  if (sandbox.renderQuality) {
    diagnostics = sandbox.renderQuality.setMode(request);
  }
  const reconstructionActive = !!diagnostics?.enabled;
  const pixelRatio = reconstructionActive ? sandboxRenderPixelRatio() : renderPixelRatio('webgl');
  if (Math.abs((sandbox.renderer.getPixelRatio?.() || 1) - pixelRatio) > 0.001) {
    sandbox.renderer.setPixelRatio(pixelRatio);
  }
  state.renderClarity.sandboxSignature = requestedSignature;
  sandbox.resizePending = true;
  resizeSandboxRenderer();
  state.clientRuntime.renderCapabilities.diagnostics = diagnostics || sandbox.renderQuality?.getDiagnostics?.() || null;
  if (sandboxPlaybackActive()) state.presetFsr.lastDiagnostics = state.clientRuntime.renderCapabilities.diagnostics;
  syncRenderTechnologyStatus();
}

function applyPresetFsrToOwnedRenderer(owner, active, resizeRenderer) {
  if (!owner?.renderer || !owner.renderQuality) return null;
  const diagnostics = owner.renderQuality.setMode(presetFsrRequest(active));
  const pixelRatio = presetFsrOutputPixelRatio(diagnostics);
  if (Math.abs((owner.renderer.getPixelRatio?.() || 1) - pixelRatio) > 0.001) {
    owner.renderer.setPixelRatio(pixelRatio);
    owner.lastWidth = 0;
    owner.lastHeight = 0;
  }
  resizeRenderer?.();
  return diagnostics;
}

function runtimeRenderQualityDiagnostics(runtimeApi, runtime, result) {
  if (result?.renderQuality) return result.renderQuality;
  if (result?.algorithm || result?.family || result?.backend) return result;
  const snapshot = runtimeApi?.diagnostics?.(runtime);
  return snapshot?.renderQuality || snapshot?.upscaler || null;
}

function applyPresetUpscaler(options = {}) {
  applySandboxRenderClarity(options.force === true);
  let activeDiagnostics = sandboxPlaybackActive()
    ? state.sandbox.renderQuality?.getDiagnostics?.() || null
    : null;

  const cubeDiagnostics = applyPresetFsrToOwnedRenderer(
    state.dynamicCube,
    state.playbackPage && state.diyPreset === 'cube',
    resizeDynamicCubeRenderer
  );
  if (state.playbackPage && state.diyPreset === 'cube') activeDiagnostics = cubeDiagnostics;

  const topoDiagnostics = applyPresetFsrToOwnedRenderer(
    state.sonicTopography,
    state.playbackPage && isSonicTopographyPreset(),
    resizeSonicTopographyRenderer
  );
  if (state.playbackPage && isSonicTopographyPreset()) activeDiagnostics = topoDiagnostics;

  if (state.freeCube.runtime && window.FeFreeCubeRuntime?.setRenderQuality) {
    const result = window.FeFreeCubeRuntime.setRenderQuality(
      state.freeCube.runtime,
      presetFsrRequest(state.playbackPage && isFreeCubePreset())
    );
    const diagnostics = runtimeRenderQualityDiagnostics(window.FeFreeCubeRuntime, state.freeCube.runtime, result);
    window.FeFreeCubeRuntime.resize(state.freeCube.runtime, presetFsrOutputPixelRatio(diagnostics));
    if (state.playbackPage && isFreeCubePreset()) activeDiagnostics = diagnostics;
  }

  if (state.voidPrism.runtime && window.FeVoidPrismRuntime?.setRenderQuality) {
    const result = window.FeVoidPrismRuntime.setRenderQuality(
      state.voidPrism.runtime,
      presetFsrRequest(state.playbackPage && isVoidPrismPreset())
    );
    const diagnostics = runtimeRenderQualityDiagnostics(window.FeVoidPrismRuntime, state.voidPrism.runtime, result);
    window.FeVoidPrismRuntime.resize(state.voidPrism.runtime, presetFsrOutputPixelRatio(diagnostics));
    if (state.playbackPage && isVoidPrismPreset()) activeDiagnostics = diagnostics;
  }

  if (state.chladni.runtime && window.FeChladniRuntime?.setRenderQuality) {
    const result = window.FeChladniRuntime.setRenderQuality(
      state.chladni.runtime,
      presetFsrRequest(state.playbackPage && isChladniPreset())
    );
    const diagnostics = runtimeRenderQualityDiagnostics(window.FeChladniRuntime, state.chladni.runtime, result);
    window.FeChladniRuntime.resize(state.chladni.runtime, presetFsrOutputPixelRatio(diagnostics));
    if (state.playbackPage && isChladniPreset()) activeDiagnostics = diagnostics;
  }

  state.presetFsr.lastDiagnostics = activeDiagnostics;
  if (activeDiagnostics) state.clientRuntime.renderCapabilities.diagnostics = activeDiagnostics;
  syncPresetFsrControls(activeDiagnostics);
  syncRenderTechnologyStatus(activeDiagnostics || state.clientRuntime.renderCapabilities?.diagnostics);
  requestSandboxRender();
  return activeDiagnostics;
}

function setPresetFsrEnabled(enabled, options = {}) {
  const next = !!enabled;
  if (state.presetFsr.enabled === next) return;
  state.presetFsr.enabled = next;
  if (options.persist !== false) savePresetFsrPreferences();
  applyPresetUpscaler({ force: true });
  if (options.announce !== false) toast(next ? `FSR 预设升频已开启：${presetFsrModeLabel()}` : 'FSR 预设升频已关闭');
}

function setPresetFsrMode(mode, options = {}) {
  const next = normalizePresetFsrMode(mode);
  if (state.presetFsr.mode === next) return;
  state.presetFsr.mode = next;
  if (options.persist !== false) savePresetFsrPreferences();
  applyPresetUpscaler({ force: true });
  if (options.announce !== false && state.presetFsr.enabled) toast(`FSR 档位：${presetFsrModeLabel(next)}`);
}

function setPresetFsrVersion(version, options = {}) {
  const next = normalizePresetFsrVersion(version);
  if (state.presetFsr.version === next) return;
  state.presetFsr.version = next;
  if (options.persist !== false) savePresetFsrPreferences();
  applyPresetUpscaler({ force: true });
  if (options.announce !== false && state.presetFsr.enabled) {
    const fallback = presetFsrVersionFallbackReason();
    toast(fallback || `FSR ${next} 已启用`);
  }
}

function applyRenderClarity(options = {}) {
  const effectivePercent = effectiveRenderClarityPercent();
  const pixelRatio = renderPixelRatio('webgl');
  window.feMonsterRenderClarityScale = effectivePercent / 100;
  document.documentElement.dataset.renderClarity = state.renderClarity.auto ? 'auto' : 'manual';
  document.documentElement.dataset.renderClarityPercent = String(effectivePercent);

  const cube = state.dynamicCube;
  if (cube.renderer && Math.abs((cube.renderer.getPixelRatio?.() || 1) - pixelRatio) > 0.001) {
    cube.renderer.setPixelRatio(pixelRatio);
    cube.lastWidth = 0;
    cube.lastHeight = 0;
    resizeDynamicCubeRenderer();
  }
  if (state.freeCube.runtime && window.FeFreeCubeRuntime) {
    window.FeFreeCubeRuntime.resize(state.freeCube.runtime, pixelRatio);
  }
  if (state.voidPrism.runtime && window.FeVoidPrismRuntime) {
    window.FeVoidPrismRuntime.resize(state.voidPrism.runtime, pixelRatio);
  }
  if (state.chladni.runtime && window.FeChladniRuntime) {
    window.FeChladniRuntime.resize(state.chladni.runtime, pixelRatio);
  }
  const topo = state.sonicTopography;
  if (topo.renderer && Math.abs((topo.renderer.getPixelRatio?.() || 1) - pixelRatio) > 0.001) {
    topo.renderer.setPixelRatio(pixelRatio);
    topo.lastWidth = 0;
    topo.lastHeight = 0;
    resizeSonicTopographyRenderer();
  }
  if (state.sandbox.previewRenderer) {
    const previewRatio = Math.min(pixelRatio, 1.5);
    if (Math.abs((state.sandbox.previewRenderer.getPixelRatio?.() || 1) - previewRatio) > 0.001) {
      state.sandbox.previewRenderer.setPixelRatio(previewRatio);
      resizeSandboxPreview();
    }
  }
  applyPresetUpscaler({ force: options.force === true });
  state.orb.lastPaintAt = 0;
  requestOrbFrame();
  requestSandboxRender();
  syncRenderClarityControls();
  if (options.announce) {
    toast(state.renderClarity.auto
      ? `清晰度已自动匹配：${effectivePercent}%`
      : `清晰度已设为 ${effectivePercent}%`);
  }
}

function setRenderClarityAuto(enabled, options = {}) {
  const next = !!enabled;
  if (state.renderClarity.auto === next) return;
  if (!next) state.renderClarity.manualPercent = effectiveRenderClarityPercent();
  state.renderClarity.auto = next;
  resetRenderClaritySampling(renderClaritySceneKey(), 30);
  if (options.persist !== false) saveRenderClarityPreferences();
  applyRenderClarity({ force: true, announce: options.announce !== false });
}

function setRenderClarityManualPercent(value, options = {}) {
  const next = normalizeRenderClarityPercent(value, state.renderClarity.manualPercent);
  if (state.renderClarity.manualPercent === next) return;
  state.renderClarity.manualPercent = next;
  if (options.persist !== false) saveRenderClarityPreferences();
  if (!state.renderClarity.auto) {
    resetRenderClaritySampling(renderClaritySceneKey(), 20);
    applyRenderClarity({ force: true, announce: options.announce === true });
  } else {
    syncRenderClarityControls();
  }
}

function refineAutoRenderClarityForRenderer() {
  if (!state.renderClarity.auto || !renderClaritySoftwareRenderer()) return;
  const sceneKey = renderClaritySceneKey();
  const current = Number(state.renderClarity.autoPercentByScene[sceneKey]) || state.renderClarity.initialAutoPercent;
  if (current <= autoRenderClarityCeiling()) return;
  state.renderClarity.autoPercentByScene[sceneKey] = autoRenderClarityCeiling();
  resetRenderClaritySampling(sceneKey, 30);
  applyRenderClarity({ force: true });
}

function initRenderClarity() {
  const sceneKey = renderClaritySceneKey();
  autoRenderClarityPercent(sceneKey);
  resetRenderClaritySampling(sceneKey);
  applyRenderClarity({ force: true });
  measureDisplayRefreshRate();
}

window.feMonsterRenderClarity = Object.freeze({
  snapshot: () => ({
    auto: !!state.renderClarity.auto,
    manualPercent: state.renderClarity.manualPercent,
    effectivePercent: effectiveRenderClarityPercent(),
    sceneKey: renderClaritySceneKey(),
    refreshHz: state.renderClarity.refreshHz,
    targetFrameMs: state.renderClarity.targetFrameMs,
    pixelRatio: renderPixelRatio('webgl')
  }),
  setAuto: (enabled, options) => setRenderClarityAuto(enabled, options),
  setPercent: (percent, options) => setRenderClarityManualPercent(percent, options)
});

window.feMonsterPresetUpscaler = Object.freeze({
  snapshot: () => ({
    enabled: !!state.presetFsr.enabled,
    requestedVersion: normalizePresetFsrVersion(state.presetFsr.version),
    effectiveVersion: presetFsrEffectiveVersion(),
    versionFallbackReason: presetFsrVersionFallbackReason(),
    environmentFallbackReason: state.presetFsr.enabled && presetFsrSceneActive() && renderClaritySoftwareRenderer()
      ? 'software-renderer'
      : '',
    implementation: presetFsrEffectiveVersion() === '1'
      ? 'fsr1-compatible-webgl'
      : 'native-fidelityfx-sdk',
    mode: normalizePresetFsrMode(state.presetFsr.mode),
    activeScene: presetFsrSceneActive(),
    diagnostics: state.presetFsr.lastDiagnostics
  }),
  setEnabled: (enabled, options) => setPresetFsrEnabled(enabled, options),
  setVersion: (version, options) => setPresetFsrVersion(version, options),
  setMode: (mode, options) => setPresetFsrMode(mode, options)
});

function handleNativeRenderCapabilities(event) {
  let payload = event?.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (error) { return; }
  }
  if (!payload || payload.type !== 'fe-render-capabilities-result') return;
  const expected = state.clientRuntime.renderCapabilities?.requestId;
  if (expected && payload.requestId && payload.requestId !== expected) return;
  state.clientRuntime.renderCapabilities.native = payload;
  applyPresetUpscaler({ force: true });
}

function initRenderCapabilityBridge() {
  const bridge = window.chrome?.webview;
  if (!bridge || typeof bridge.postMessage !== 'function') {
    syncRenderTechnologyStatus();
    return;
  }
  const requestId = `render-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.clientRuntime.renderCapabilities.requestId = requestId;
  bridge.addEventListener('message', handleNativeRenderCapabilities);
  bridge.postMessage({ type: 'fe-render-capabilities', action: 'query', requestId });
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
  if (document.hidden || !els.recordingTimer) return;
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
  syncRenderTechnologyStatus();
  refineAutoRenderClarityForRenderer();
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

function songParams(song, options = {}) {
  return query({
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    cover: song.cover,
    duration: song.duration || 0,
    provider: song.provider || 'netease',
    quality: options.quality
  });
}

function safeText(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setStylePropertyIfChanged(element, property, value) {
  if (!element) return false;
  const nextValue = String(value);
  if (element.style.getPropertyValue(property) === nextValue) return false;
  element.style.setProperty(property, nextValue);
  return true;
}

function isSonicTopographyPreset(preset = state.diyPreset) {
  return preset === 'topography';
}

function isChladniPreset(preset = state.diyPreset) {
  return preset === 'chladni';
}

function playbackPresetsUseNativeRefresh() {
  return !document.hidden;
}

function isRainGlassPreset(preset = state.diyPreset) {
  return preset === 'rain-glass';
}

function isCoverParticlePreset(preset = state.diyPreset) {
  return preset === 'cover-particles';
}

function isFreeCubePreset(preset = state.diyPreset) {
  return preset === 'free-cubes';
}

function isVoidPrismPreset(preset = state.diyPreset) {
  return preset === 'void-prism';
}

function normalizeDiyPreset(preset) {
  if (
    preset === 'cube' ||
    preset === 'free-cubes' ||
    preset === 'void-prism' ||
    preset === 'topography' ||
    preset === 'chladni' ||
    preset === 'rain-glass' ||
    preset === 'cover-particles' ||
    preset === 'sandbox-scene' ||
    preset === 'wallpaper' ||
    preset === 'book'
  ) {
    return preset;
  }
  return 'lyric';
}

function renderPixelRatio(kind = 'canvas') {
  const nativeDpr = Math.max(0.5, Number(window.devicePixelRatio) || 1);
  const cap = kind === 'webgl'
    ? RENDER_PROFILE.webglDprMax
    : kind === 'playback'
      ? RENDER_PROFILE.playbackDprMax
      : RENDER_PROFILE.canvasDprMax;
  const scale = effectiveRenderClarityPercent() / 100;
  return clamp(Math.min(nativeDpr, cap) * scale, 0.5, 2.5);
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
  }, reducedMotion ? 80 : 720);
}

function enterMainFromBoot() {
  if (!els.bootScreen || bootVisual.entering) return;
  bootVisual.entering = true;
  if (els.bootLogoButton) els.bootLogoButton.disabled = true;
  els.bootScreen.classList.add('is-exiting');
  window.dispatchEvent(new CustomEvent('fe-lightfall-stop'));
  requestOrbFrame();
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
  bootVisual.readyFallbackTimer = window.setTimeout(markBootReady, 1200);
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
const WALLPAPER_PREFS_VERSION = 6;
const WALLPAPER_FIT_MODES = new Set(['fill', 'fit', 'stretch', 'center', 'tile']);

function normalizeWallpaperFitMode(mode) {
  return WALLPAPER_FIT_MODES.has(mode) ? mode : 'fill';
}

function loadWallpaperPrefs() {
  try {
    const prefs = JSON.parse(window.localStorage.getItem(WALLPAPER_PREFS_KEY) || '{}');
    const prefsVersion = Number(prefs.version) || 0;
    const resetLegacyVisuals = prefsVersion < 5;
    const storedActiveIds = prefs.activeWallpaperIds && typeof prefs.activeWallpaperIds === 'object'
      ? prefs.activeWallpaperIds
      : {};
    state.activeWallpaperIds.imported = safeText(storedActiveIds.imported, '');
    state.activeWallpaperIds.live = safeText(storedActiveIds.live, '');
    state.wallpaperOpacity = clamp(Number(prefs.opacity) || state.wallpaperOpacity, 0.3, 1);
    state.wallpaperBrightness = clamp(Number(prefs.brightness) || state.wallpaperBrightness, 0.35, 1.5);
    state.wallpaperBlur = clamp(Number(prefs.blur) || 0, 0, 24);
    if (resetLegacyVisuals) {
      state.wallpaperOpacity = 1;
      state.wallpaperBrightness = 1;
      state.wallpaperBlur = 0;
      state.wallpaperScale = 1;
      state.wallpaperFitMode = 'fill';
    }
    if (!resetLegacyVisuals) state.wallpaperScale = clamp(Number(prefs.scale) || state.wallpaperScale, 0.7, 1);
    state.wallpaperFitMode = normalizeWallpaperFitMode(prefs.fitMode || state.wallpaperFitMode);
    state.wallpaperSource = prefs.source === 'live' ? 'live' : 'imported';
    const legacyId = safeText(prefs.activeWallpaperId, '');
    if (legacyId && !state.activeWallpaperIds[state.wallpaperSource]) {
      state.activeWallpaperIds[state.wallpaperSource] = legacyId;
    }
    state.activeWallpaperId = state.activeWallpaperIds[state.wallpaperSource] || legacyId;
  } catch (error) {
  }
}

function saveWallpaperPrefs() {
  try {
    window.localStorage.setItem(WALLPAPER_PREFS_KEY, JSON.stringify({
      version: WALLPAPER_PREFS_VERSION,
      activeWallpaperId: state.activeWallpaperId,
      activeWallpaperIds: state.activeWallpaperIds,
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
  state.audioAnalysis.lowFrequencyBands.fill(0);
  state.visual.lowFrequencyBands.fill(0);
  state.visualBridge.lowFrequencyBands.fill(0);
  updateSpectrumUi();
}

function writeLowFrequencyBands(target, source, fallback = 0) {
  if (!target || !target.length) return;
  const fallbackValue = clamp(Number(fallback) || 0, 0, 1);
  const sourceLength = source && typeof source !== 'string'
    ? Math.max(0, Math.floor(Number(source.length) || 0))
    : 0;
  if (!sourceLength) {
    target.fill(fallbackValue);
    return;
  }
  if (sourceLength === 1) {
    target.fill(clamp(Number(source[0]) || fallbackValue, 0, 1));
    return;
  }
  const sourceScale = (sourceLength - 1) / Math.max(1, target.length - 1);
  for (let index = 0; index < target.length; index += 1) {
    const sourcePosition = index * sourceScale;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(sourceLength - 1, lowerIndex + 1);
    const mix = sourcePosition - lowerIndex;
    const lower = clamp(Number(source[lowerIndex]) || 0, 0, 1);
    const upper = clamp(Number(source[upperIndex]) || 0, 0, 1);
    target[index] = lower + (upper - lower) * mix;
  }
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
  state.visual.lowFrequencyBands.set(state.visualBridge.lowFrequencyBands);
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
      analysis.analyser.fftSize = 4096;
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

function rmsFrequencyBand(data, analyser, fromHz, toHz) {
  const nyquist = (analyser.context && analyser.context.sampleRate ? analyser.context.sampleRate : 44100) / 2;
  const from = clamp(Math.floor((fromHz / nyquist) * data.length), 0, data.length - 1);
  const to = clamp(Math.ceil((toHz / nyquist) * data.length), from + 1, data.length);
  let sumSquares = 0;
  for (let index = from; index < to; index += 1) {
    const value = (data[index] || 0) / 255;
    sumSquares += value * value;
  }
  return clamp(Math.sqrt(sumSquares / Math.max(1, to - from)), 0, 1);
}

function sampleFrequencyAmplitude(data, analyser, frequencyHz) {
  if (!data || !data.length) return 0;
  const sampleRate = analyser && analyser.context && analyser.context.sampleRate
    ? analyser.context.sampleRate
    : state.audioAnalysis.sampleRate || 44100;
  const nyquist = sampleRate / 2;
  const binPosition = clamp((frequencyHz / nyquist) * data.length, 0, data.length - 1);
  const lowerIndex = Math.floor(binPosition);
  const upperIndex = Math.min(data.length - 1, lowerIndex + 1);
  const mix = binPosition - lowerIndex;
  return clamp(((data[lowerIndex] || 0) + ((data[upperIndex] || 0) - (data[lowerIndex] || 0)) * mix) / 255, 0, 1);
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
  const subBassEnd = bin(1);
  const bassStart = bin(2);
  const bassEnd = bin(3);
  const lowMidStart = bin(4);
  const lowMidEnd = bin(7);
  const midStart = bin(8);
  const midEnd = bin(18);
  const highMidStart = bin(19);
  const highMidEnd = bin(46);
  const presenceStart = bin(47);
  const presenceEnd = bin(93);
  const brillianceStart = bin(94);
  const brillianceEnd = bin(186);
  const airStart = bin(187);
  const airEnd = bin(372);
  let subBassSum = 0;
  let subBassCount = 0;
  let bassSum = 0;
  let bassCount = 0;
  let lowMidSum = 0;
  let lowMidCount = 0;
  let midSum = 0;
  let midCount = 0;
  let highMidSum = 0;
  let highMidCount = 0;
  let presenceSum = 0;
  let presenceCount = 0;
  let brillianceSum = 0;
  let brillianceCount = 0;
  let airSum = 0;
  let airCount = 0;

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

    if (index <= subBassEnd) {
      subBassSum += value;
      subBassCount += 1;
    } else if (index >= bassStart && index <= bassEnd) {
      bassSum += value;
      bassCount += 1;
    } else if (index >= lowMidStart && index <= lowMidEnd) {
      lowMidSum += value;
      lowMidCount += 1;
    } else if (index >= midStart && index <= midEnd) {
      midSum += value;
      midCount += 1;
    } else if (index >= highMidStart && index <= highMidEnd) {
      highMidSum += value;
      highMidCount += 1;
    } else if (index >= presenceStart && index <= presenceEnd) {
      presenceSum += value;
      presenceCount += 1;
    } else if (index >= brillianceStart && index <= brillianceEnd) {
      brillianceSum += value;
      brillianceCount += 1;
    } else if (index >= airStart && index <= airEnd) {
      airSum += value;
      airCount += 1;
    }
  }

  const subBassRaw = subBassSum / Math.max(1, subBassCount);
  const bassOnlyRaw = bassSum / Math.max(1, bassCount);
  const lowMidRaw = lowMidSum / Math.max(1, lowMidCount);
  const midOnlyRaw = midSum / Math.max(1, midCount);
  const highMidRaw = highMidSum / Math.max(1, highMidCount);
  const presenceRaw = presenceSum / Math.max(1, presenceCount);
  const brillianceRaw = brillianceSum / Math.max(1, brillianceCount);
  const airRaw = airSum / Math.max(1, airCount);
  const lowFrequencyRaw = rmsFrequencyBand(data, analysis.analyser, 20, 150);
  const bassRaw = (subBassRaw + bassOnlyRaw + lowMidRaw) / 3;
  const midRaw = (midOnlyRaw + highMidRaw) / 2;
  const trebleRaw = (presenceRaw + brillianceRaw + airRaw) / 3;
  const energyRaw = energySum / Math.max(1, data.length);
  const warmthRaw = energySum > 0
    ? (subBassSum + bassSum + lowMidSum + midSum) / energySum
    : 0;
  const brightnessRaw = energySum > 0
    ? (presenceSum + brillianceSum + airSum) / energySum
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
      analysis.lowFrequencyBands.fill(0);
      state.visual.lowFrequencyBands.fill(0);
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
  for (let index = 0; index < SONIC_LOW_FREQUENCY_BAND_COUNT; index += 1) {
    const progress = index / Math.max(1, SONIC_LOW_FREQUENCY_BAND_COUNT - 1);
    const frequencyHz = SONIC_LOW_FREQUENCY_MIN_HZ
      + (SONIC_LOW_FREQUENCY_MAX_HZ - SONIC_LOW_FREQUENCY_MIN_HZ) * progress;
    const rawAmplitude = sampleFrequencyAmplitude(data, analysis.analyser, frequencyHz);
    const targetAmplitude = clamp(rawAmplitude * 1.55, 0, 1);
    const currentAmplitude = analysis.lowFrequencyBands[index] || 0;
    const response = targetAmplitude > currentAmplitude ? 0.34 : 0.075;
    const amplitude = currentAmplitude + (targetAmplitude - currentAmplitude) * response;
    analysis.lowFrequencyBands[index] = amplitude;
    state.visual.lowFrequencyBands[index] = amplitude;
  }
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
    els.spectrumBassFill.style.transform = `scaleX(${clamp(value, 0, 1).toFixed(3)})`;
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
  const renderQuality = createPresetRenderQuality(renderer, 0.22);
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
  cube.renderQuality = renderQuality;
  cube.scene = scene;
  cube.camera = camera;
  cube.group = group;
  cube.mesh = mesh;
  cube.dummy = dummy;
  cube.color = color;
  cube.built = true;
  observePresetRendererSize(cube, els.dynamicCubeCore, resizeDynamicCubeRenderer);
  applyDynamicCubePalette(cube.palette || fallbackLyricPalette(state.currentSong));
  applyPresetUpscaler({ force: true });
  if (renderQuality) renderQuality.render(scene, camera, performance.now());
  else renderer.render(scene, camera);
}

function observePresetRendererSize(owner, element, resizeRenderer) {
  if (!owner || !element || owner.resizeObserver || !('ResizeObserver' in window)) return;
  owner.resizeObserver = new ResizeObserver(() => resizeRenderer());
  owner.resizeObserver.observe(element);
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
  if (cube.renderQuality) cube.renderQuality.resize(width, height, cube.renderer.getPixelRatio?.() || renderPixelRatio('webgl'));
  else cube.renderer.setSize(width, height, false);
  const aspect = width / Math.max(1, height);
  // The old 460px rig kept the model compact but clipped expanding voxels at its edges.
  // Preserve that apparent scale while letting the renderer cover the complete stage.
  const legacyRigHeight = Math.max(1, Math.min((window.innerHeight || height) * 0.6, 460));
  const legacyDepthScale = 1200 / (1200 + 72);
  const legacyMotionScale = reducedMotion ? 0.88 : 1;
  const view = (92 / zoom) * (height / (legacyRigHeight * legacyDepthScale * legacyMotionScale));
  const verticalOffset = view * 0.03;
  cube.camera.left = -view * aspect / 2;
  cube.camera.right = view * aspect / 2;
  cube.camera.top = view / 2 - verticalOffset;
  cube.camera.bottom = -view / 2 - verticalOffset;
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
  const frameGapMs = playbackPresetsUseNativeRefresh() ? 0 : RENDER_PROFILE.cubeFrameGapMs;
  if (frameGapMs && cube.lastRenderAt && nowMs - cube.lastRenderAt < frameGapMs) return;
  cube.lastRenderAt = nowMs;
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.04 : 0.22);
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.04 : 0.18);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0 : 0.12);
  const frameStep = state.playbackVisual.frameStep || 1;
  cube.bass += (bass - cube.bass) * (1 - Math.pow(0.68, frameStep));
  cube.energy += (energy - cube.energy) * (1 - Math.pow(0.76, frameStep));

  const t = nowMs / 1000;
  const heart = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.15 + state.lyricSpeed * 0.26))), 8);
  const motionScale = reducedMotion ? 0.28 : 1;
  const pushBase = (0.7 + cube.bass * 7.8 + beat * 2.7 + heart * cube.bass * 3.4) * state.cubeIntensity * motionScale;
  const scaleBase = 0.96 + cube.bass * 0.11 + beat * 0.035;
  if (els.dynamicCubeScene) {
    setStylePropertyIfChanged(els.dynamicCubeScene, '--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
    setStylePropertyIfChanged(els.dynamicCubeScene, '--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
    setStylePropertyIfChanged(els.dynamicCubeScene, '--cube-glow-alpha', (0.18 + cube.energy * 0.36 + beat * 0.16).toFixed(3));
  }

  if (!cube.resizeObserver) resizeDynamicCubeRenderer();
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
  if (cube.renderQuality) cube.renderQuality.render(cube.scene, cube.camera, nowMs);
  else cube.renderer.render(cube.scene, cube.camera);
}

function syncFreeCubeControls() {
  const heartActive = state.freeCube.mode === 'heart';
  const backgroundActive = !!state.freeCube.backgroundEnabled;
  if (els.freeCubeHeartButton) {
    els.freeCubeHeartButton.classList.toggle('is-active', heartActive);
    els.freeCubeHeartButton.setAttribute('aria-pressed', String(heartActive));
  }
  if (els.freeCubeBackgroundButton) {
    els.freeCubeBackgroundButton.classList.toggle('is-active', backgroundActive);
    els.freeCubeBackgroundButton.setAttribute('aria-pressed', String(backgroundActive));
  }
}

function applyFreeCubePalette(palette) {
  const source = palette || fallbackLyricPalette(state.currentSong);
  state.freeCube.palette = source;
  if (state.freeCube.runtime && window.FeFreeCubeRuntime) {
    window.FeFreeCubeRuntime.setPalette(state.freeCube.runtime, source);
  }
}

function buildFreeCube() {
  if (!els.freeCubeCore || state.freeCube.runtime || !window.FeFreeCubeRuntime || !window.THREE) return;
  const lowEndAndroid = ANDROID_CLIENT && RENDER_PROFILE.tier === 'economy';
  const cubeCount = lowEndAndroid ? 720 : MOBILE_RENDER_TARGET ? 1100 : 1800;
  const particleCount = lowEndAndroid ? 480 : MOBILE_RENDER_TARGET ? 760 : 1400;
  state.freeCube.runtime = window.FeFreeCubeRuntime.create(els.freeCubeCore, {
    cubeCount,
    particleCount,
    mode: state.freeCube.mode,
    backgroundEnabled: state.freeCube.backgroundEnabled,
    palette: state.freeCube.palette || fallbackLyricPalette(state.currentSong),
    pixelRatio: renderPixelRatio('webgl'),
    createRenderer: (options) => createDirectX11Renderer(window.THREE, options)
  });
  syncFreeCubeControls();
}

function disposeFreeCube() {
  const runtime = state.freeCube.runtime;
  if (!runtime || !window.FeFreeCubeRuntime) return;
  const before = window.FeFreeCubeRuntime.diagnostics(runtime);
  window.FeFreeCubeRuntime.dispose(runtime);
  state.freeCube.lastDiagnostics = {
    ...before,
    ...window.FeFreeCubeRuntime.diagnostics(runtime),
    mode: state.freeCube.mode,
    backgroundEnabled: state.freeCube.backgroundEnabled
  };
  state.freeCube.runtime = null;
}

function resizeFreeCubeRenderer() {
  if (!state.freeCube.runtime || !window.FeFreeCubeRuntime) return;
  window.FeFreeCubeRuntime.resize(state.freeCube.runtime, renderPixelRatio('webgl'));
}

function updateFreeCubeVisibility() {
  const visible = state.playbackPage && isFreeCubePreset();
  if (els.freeCubeScene) els.freeCubeScene.hidden = !visible;
  if (els.appShell) els.appShell.classList.toggle('has-free-cubes', visible);
  if (visible) buildFreeCube();
  else disposeFreeCube();
  syncFreeCubeControls();
}

function setFreeCubeMode(mode) {
  state.freeCube.mode = mode === 'heart' ? 'heart' : 'free';
  if (state.freeCube.runtime && window.FeFreeCubeRuntime) {
    window.FeFreeCubeRuntime.setMode(state.freeCube.runtime, state.freeCube.mode);
  }
  syncFreeCubeControls();
  renderDiySelectedPresetConfig();
}

function toggleFreeCubeHeart() {
  setFreeCubeMode(state.freeCube.mode === 'heart' ? 'free' : 'heart');
}

function setFreeCubeBackground(enabled) {
  state.freeCube.backgroundEnabled = enabled !== false;
  if (state.freeCube.runtime && window.FeFreeCubeRuntime) {
    window.FeFreeCubeRuntime.setBackgroundEnabled(state.freeCube.runtime, state.freeCube.backgroundEnabled);
  } else if (els.freeCubeScene) {
    els.freeCubeScene.classList.toggle('has-soft-background', state.freeCube.backgroundEnabled);
  }
  syncFreeCubeControls();
  renderDiySelectedPresetConfig();
}

function updateFreeCubeMotion() {
  const runtime = state.freeCube.runtime;
  if (!state.playbackPage || !isFreeCubePreset() || !runtime || !window.FeFreeCubeRuntime) return;
  const playing = !!els.audio && !els.audio.paused;
  const lowFrequency = playing
    ? Math.max(Number(state.visual.lowFrequencyAmplitude) || 0, Number(state.visual.bass) || 0)
    : 0;
  const frame = state.freeCube.frame;
  frame.now = performance.now();
  frame.bass = lowFrequency;
  frame.energy = playing ? state.visual.energy : 0;
  frame.beat = playing ? state.visual.beat : 0;
  frame.yaw = state.playbackVisual.yaw;
  frame.pitch = state.playbackVisual.pitch;
  frame.zoom = state.playbackVisual.zoom;
  frame.dragging = state.playbackVisual.dragging;
  frame.reducedMotion = reducedMotion;
  frame.pixelRatio = presetFsrOutputPixelRatio(state.presetFsr.lastDiagnostics);
  window.FeFreeCubeRuntime.update(runtime, frame);
}

function freeCubeRuntimeSnapshot() {
  if (state.freeCube.runtime && window.FeFreeCubeRuntime) {
    return {
      ...window.FeFreeCubeRuntime.diagnostics(state.freeCube.runtime),
      selected: isFreeCubePreset(),
      controlsVisible: !!els.freeCubePresetControls && !els.freeCubePresetControls.hidden
    };
  }
  return {
    ...(state.freeCube.lastDiagnostics || {}),
    active: false,
    selected: isFreeCubePreset(),
    mode: state.freeCube.mode,
    backgroundEnabled: state.freeCube.backgroundEnabled,
    canvasCount: els.freeCubeCore ? els.freeCubeCore.querySelectorAll('canvas').length : 0,
    controlsVisible: !!els.freeCubePresetControls && !els.freeCubePresetControls.hidden
  };
}

function previewFreeCubeBass(value) {
  if (!state.freeCube.runtime || !window.FeFreeCubeRuntime) return false;
  return window.FeFreeCubeRuntime.setBassPreview(state.freeCube.runtime, value);
}

function clearFreeCubeBassPreview() {
  if (!state.freeCube.runtime || !window.FeFreeCubeRuntime) return false;
  return window.FeFreeCubeRuntime.clearBassPreview(state.freeCube.runtime);
}

function buildVoidPrism() {
  if (!els.voidPrismCore || state.voidPrism.runtime || !window.FeVoidPrismRuntime || !window.THREE) return;
  state.voidPrism.runtime = window.FeVoidPrismRuntime.create(els.voidPrismCore, {
    lyric: state.lyricDisplayText || playbackLyricText(),
    subtitle: state.lyricSubtitleText || playbackLyricSubtitle(),
    palette: fallbackLyricPalette(state.currentSong),
    fontFamily: activeTextFontFamilyStack(),
    pixelRatio: renderPixelRatio('webgl'),
    createRenderer: (options) => createDirectX11Renderer(window.THREE, options)
  });
}

function disposeVoidPrism() {
  const runtime = state.voidPrism.runtime;
  if (!runtime || !window.FeVoidPrismRuntime) return;
  const before = window.FeVoidPrismRuntime.diagnostics(runtime);
  window.FeVoidPrismRuntime.dispose(runtime);
  state.voidPrism.lastDiagnostics = {
    ...before,
    ...window.FeVoidPrismRuntime.diagnostics(runtime)
  };
  state.voidPrism.runtime = null;
}

function resizeVoidPrismRenderer() {
  if (!state.voidPrism.runtime || !window.FeVoidPrismRuntime) return;
  window.FeVoidPrismRuntime.resize(state.voidPrism.runtime, renderPixelRatio('webgl'));
}

function updateVoidPrismVisibility() {
  const visible = state.playbackPage && isVoidPrismPreset();
  if (els.voidPrismScene) els.voidPrismScene.hidden = !visible;
  if (els.appShell) els.appShell.classList.toggle('has-void-prism', visible);
  if (visible) buildVoidPrism();
  else disposeVoidPrism();
}

function updateVoidPrismMotion() {
  const runtime = state.voidPrism.runtime;
  if (!state.playbackPage || !isVoidPrismPreset() || !runtime || !window.FeVoidPrismRuntime) return;
  const playing = !!els.audio && !els.audio.paused;
  window.FeVoidPrismRuntime.setLyric(
    runtime,
    state.lyricDisplayText || playbackLyricText(),
    state.lyricSubtitleText || playbackLyricSubtitle(),
    undefined,
    activeTextFontFamilyStack()
  );
  const frame = state.voidPrism.frame;
  frame.now = performance.now();
  frame.bass = playing ? Math.max(Number(state.visual.lowFrequencyAmplitude) || 0, Number(state.visual.bass) || 0) : 0;
  frame.energy = playing ? Number(state.visual.energy) || 0 : 0;
  frame.yaw = state.playbackVisual.yaw;
  frame.pitch = state.playbackVisual.pitch;
  frame.zoom = state.playbackVisual.zoom;
  frame.pixelRatio = presetFsrOutputPixelRatio(state.presetFsr.lastDiagnostics);
  window.FeVoidPrismRuntime.update(runtime, frame);
}

function voidPrismRuntimeSnapshot() {
  if (state.voidPrism.runtime && window.FeVoidPrismRuntime) {
    return {
      ...window.FeVoidPrismRuntime.diagnostics(state.voidPrism.runtime),
      selected: isVoidPrismPreset()
    };
  }
  return {
    ...(state.voidPrism.lastDiagnostics || {}),
    active: false,
    selected: isVoidPrismPreset(),
    canvasCount: els.voidPrismCore ? els.voidPrismCore.querySelectorAll('canvas').length : 0
  };
}

function applyChladniPalette(palette) {
  const source = palette || fallbackLyricPalette(state.currentSong);
  state.chladni.palette = source;
  if (els.chladniScene) {
    const fallback = [source.glow, source.primary, source.highlight];
    const coverColors = [0, 1, 2].map((index) => source.coverColors?.[index] || fallback[index]);
    const softColors = coverColors.map((color, index) => playbackGlowColor(color, index));
    els.chladniScene.style.setProperty('--chladni-a', rgbTriplet(softColors[0]));
    els.chladniScene.style.setProperty('--chladni-b', rgbTriplet(softColors[1]));
    els.chladniScene.style.setProperty('--chladni-hot', rgbTriplet(softColors[2]));
    els.chladniScene.style.setProperty('--chladni-depth', rgbTriplet(source.depth));
  }
  if (state.chladni.runtime && window.FeChladniRuntime) {
    window.FeChladniRuntime.setPalette(state.chladni.runtime, source);
  }
}

function syncChladniModeControls() {
  const planeActive = state.chladni.mode === 'plane';
  if (els.chladniPlaneButton) {
    els.chladniPlaneButton.classList.toggle('is-active', planeActive);
    els.chladniPlaneButton.setAttribute('aria-pressed', String(planeActive));
  }
  if (els.chladniCubeButton) {
    els.chladniCubeButton.classList.toggle('is-active', !planeActive);
    els.chladniCubeButton.setAttribute('aria-pressed', String(!planeActive));
  }
}

function setChladniMode(mode) {
  state.chladni.mode = mode === 'plane' ? 'plane' : 'cube';
  if (state.chladni.runtime && window.FeChladniRuntime) {
    window.FeChladniRuntime.setMode(state.chladni.runtime, state.chladni.mode);
  }
  syncChladniModeControls();
  renderDiySelectedPresetConfig();
  requestOrbFrame();
}

function buildChladni() {
  if (!els.chladniCore || state.chladni.runtime || !window.FeChladniRuntime || !window.THREE) return;
  const lowEndAndroid = ANDROID_CLIENT && RENDER_PROFILE.tier === 'economy';
  const particleCount = lowEndAndroid
    ? 72000
    : MOBILE_RENDER_TARGET
      ? 120000
      : 500000;
  const planeParticleCount = lowEndAndroid
    ? 72000
    : MOBILE_RENDER_TARGET
      ? 100000
      : 600000;
  state.chladni.runtime = window.FeChladniRuntime.create(els.chladniCore, {
    particleCount,
    planeParticleCount,
    mode: state.chladni.mode,
    palette: state.chladni.palette || fallbackLyricPalette(state.currentSong),
    pixelRatio: renderPixelRatio('webgl'),
    createRenderer: (options) => createDirectX11Renderer(window.THREE, options)
  });
  syncChladniModeControls();
}

function disposeChladni() {
  const runtime = state.chladni.runtime;
  if (!runtime || !window.FeChladniRuntime) return;
  const before = window.FeChladniRuntime.diagnostics(runtime);
  window.FeChladniRuntime.dispose(runtime);
  state.chladni.lastDiagnostics = {
    ...before,
    ...window.FeChladniRuntime.diagnostics(runtime)
  };
  state.chladni.runtime = null;
}

function resizeChladniRenderer() {
  if (!state.chladni.runtime || !window.FeChladniRuntime) return;
  window.FeChladniRuntime.resize(state.chladni.runtime, renderPixelRatio('webgl'));
}

function updateChladniVisibility() {
  const visible = state.playbackPage && isChladniPreset();
  if (els.chladniScene) els.chladniScene.hidden = !visible;
  if (els.appShell) els.appShell.classList.toggle('has-chladni', visible);
  if (visible) buildChladni();
  else disposeChladni();
  syncChladniModeControls();
}

function updateChladniMotion() {
  const runtime = state.chladni.runtime;
  if (!state.playbackPage || !isChladniPreset() || !runtime || !window.FeChladniRuntime) return;
  const playing = isPlaybackClockRunning();
  const live = state.audioAnalysis.live ? state.audioAnalysis : state.visual;
  const frame = state.chladni.frame;
  frame.now = performance.now();
  frame.playing = playing;
  frame.bass = playing
    ? Math.max(Number(live.lowFrequencyAmplitude) || 0, Number(live.bass) || 0, Number(live.subBass) || 0)
    : 0;
  frame.energy = playing ? Number(live.energy) || 0 : 0;
  frame.mid = playing ? Math.max(Number(live.mid) || 0, Number(live.highMid) || 0) : 0;
  frame.treble = playing ? Math.max(Number(live.treble) || 0, Number(live.brilliance) || 0) : 0;
  frame.beat = playing ? Number(live.beat) || 0 : 0;
  frame.yaw = state.playbackVisual.yaw;
  frame.pitch = state.playbackVisual.pitch;
  frame.zoom = state.playbackVisual.zoom;
  frame.reducedMotion = reducedMotion;
  frame.pixelRatio = presetFsrOutputPixelRatio(state.presetFsr.lastDiagnostics);
  window.FeChladniRuntime.update(runtime, frame);
}

function chladniRuntimeSnapshot() {
  if (state.chladni.runtime && window.FeChladniRuntime) {
    return {
      ...window.FeChladniRuntime.diagnostics(state.chladni.runtime),
      selected: isChladniPreset(),
      controlsVisible: !!els.chladniPresetControls && !els.chladniPresetControls.hidden
    };
  }
  return {
    ...(state.chladni.lastDiagnostics || {}),
    active: false,
    selected: isChladniPreset(),
    displayMode: state.chladni.mode,
    canvasCount: els.chladniCore ? els.chladniCore.querySelectorAll('canvas').length : 0
  };
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
  const lowFrequencySpectrumData = new Uint8Array(SONIC_LOW_FREQUENCY_BAND_COUNT);
  const lowFrequencySpectrum = new THREE.DataTexture(
    lowFrequencySpectrumData,
    SONIC_LOW_FREQUENCY_BAND_COUNT,
    1,
    THREE.LuminanceFormat,
    THREE.UnsignedByteType
  );
  lowFrequencySpectrum.magFilter = THREE.NearestFilter;
  lowFrequencySpectrum.minFilter = THREE.NearestFilter;
  lowFrequencySpectrum.generateMipmaps = false;
  lowFrequencySpectrum.flipY = false;
  lowFrequencySpectrum.unpackAlignment = 1;
  lowFrequencySpectrum.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 },
    uSubBass: { value: 0 },
    uBass: { value: 0 },
    uLowFrequencyAmplitude: { value: 0 },
    uLowFrequencySpectrum: { value: lowFrequencySpectrum },
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
    uCoreColumnColor: { value: theme.uWarmCore.clone() },
    uOuterColumnColor: { value: theme.uCoolEdge.clone() },
    uSonicBrightness: { value: DEFAULT_SONIC_SETTINGS.brightness },
    uSonicExposure: { value: DEFAULT_SONIC_SETTINGS.exposure },
    uColumnHeightScale: { value: DEFAULT_SONIC_SETTINGS.columnHeight },
    uRippleColor: { value: theme.uRippleColor.clone() },
    uGlowIntensity: { value: theme.uGlowIntensity }
  };

  const vertexShader = `
    uniform float uTime;
    uniform float uSubBass;
    uniform float uBass;
    uniform float uLowFrequencyAmplitude;
    uniform sampler2D uLowFrequencySpectrum;
    uniform float uLowMid;
    uniform float uMid;
    uniform float uHighMid;
    uniform float uSmoothness;
    uniform float uDensity;
    uniform float uEnergy;
    uniform float uAudioPulse;
    uniform float uIdleBreath;
    uniform float uColumnHeightScale;
    attribute float aBassColumnBand;

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
    varying float vBassColumnBlend;
    varying float vBassColumnRadialMix;

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

    float sampleLowFrequencyBand(float bandIndex) {
      float sampleX = (clamp(bandIndex, 0.0, 511.0) + 0.5) / 512.0;
      return texture2D(uLowFrequencySpectrum, vec2(sampleX, 0.5)).r;
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
      float globalFalloff = smoothstep(70.0, 36.0, centerDist);
      float idleField = (snoise(pos2D * 0.085 + vec2(uTime * 0.032, -uTime * 0.026)) + 1.0) * 0.5;
      float idleCluster = smoothstep(0.5, 0.96, idleField + rnd * 0.18);
      float idlePulse = 0.54 + sin(uTime * 0.72 + rnd * 6.283 + baseNoise * 2.4) * 0.46;
      float idleElevation = uIdleBreath * globalFalloff * (idleCluster * idlePulse * 0.76 + wave * 0.13);
      float lowDrive = max(uSubBass * 1.35, uBass);
      float lowGate = smoothstep(0.055, 0.22, lowDrive);
      float rhythmGate = lowGate * (0.32 + uAudioPulse * 0.68);

      vec2 bassColumnGrid = pos2D / ${SONIC_TOPOGRAPHY_SPACING.toFixed(2)};
      vec2 bassColumnDelta = bassColumnGrid - vec2(${SONIC_BASS_COLUMN_CLUSTER.center.toFixed(1)});
      float bassColumnRadiusSquared = dot(bassColumnDelta, bassColumnDelta);
      float bassColumnRadius = sqrt(bassColumnRadiusSquared);
      float bassColumnCoreMask = 1.0 - step(
        ${(SONIC_BASS_COLUMN_CLUSTER.radius ** 2 + 0.5).toFixed(1)},
        bassColumnRadiusSquared
      );
      float bassColumnTransition = 1.0 - smoothstep(
        ${SONIC_BASS_COLUMN_CLUSTER.radius.toFixed(1)},
        ${(SONIC_BASS_COLUMN_CLUSTER.radius + SONIC_BASS_COLUMN_CLUSTER.feather).toFixed(1)},
        bassColumnRadius
      );
      float bassColumnBlend = max(bassColumnCoreMask, bassColumnTransition);
      vBassColumnBlend = bassColumnBlend;
      vBassColumnRadialMix = smoothstep(
        ${(SONIC_BASS_COLUMN_CLUSTER.radius * 0.55).toFixed(1)},
        ${(SONIC_BASS_COLUMN_CLUSTER.radius + SONIC_BASS_COLUMN_CLUSTER.feather).toFixed(1)},
        bassColumnRadius
      );
      float bassColumnCenterMask = (1.0 - step(0.5, abs(bassColumnDelta.x)))
        * (1.0 - step(0.5, abs(bassColumnDelta.y)));
      float bassColumnBandIndex = aBassColumnBand;
      float bassColumnDrive = 0.0;
      if (bassColumnBlend > 0.001) {
        float bassColumnBandDrive = sampleLowFrequencyBand(bassColumnBandIndex);
        bassColumnDrive = mix(
          bassColumnBandDrive,
          clamp(uLowFrequencyAmplitude, 0.0, 1.0),
          bassColumnCenterMask
        );
      }
      float bassColumnLift = bassColumnBlend * bassColumnDrive * (6.5 + rnd * 3.5) * uColumnHeightScale;

      float subRegion = smoothstep(31.0, 0.0, centerDist);
      float subLift = uSubBass * rhythmGate * subRegion * 4.15;

      float bassNoise = snoise(pos2D * 0.1 - vec2(0.0, uTime * 0.2));
      float bassRegion = smoothstep(44.0, 6.0, centerDist + bassNoise * 5.0);
      float bassLift = uBass * rhythmGate * bassRegion * smoothstep(0.0, 1.0, rnd + uDensity * 0.5) * 3.4;

      float lowMidNoise = snoise(pos2D * 0.05 + vec2(uTime * 0.1, 0.0));
      float lowMidLift = uLowMid * rhythmGate * (lowMidNoise * 0.5 + 0.5) * 0.95;

      float riverFlow = sin(pos2D.x * 0.2 + pos2D.y * 0.2 + snoise(pos2D * 0.1) * 2.0 - uTime * 2.0);
      float midLift = uMid * rhythmGate * max(0.0, riverFlow) * 1.05;

      float highMidRegion = smoothstep(10.0, 45.0, centerDist);
      float highMidLift = 0.0;
      if (fract(rnd * 13.3) > 0.8) {
        highMidLift = uHighMid * rhythmGate * highMidRegion * fract(rnd * 7.7) * 0.8;
      }

      float kickSurface = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * lowDrive * rhythmGate * 0.56;
      float audioElevation = bassColumnLift + subLift + bassLift + lowMidLift + midLift + highMidLift + kickSurface;
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
    uniform vec3 uCoreColumnColor;
    uniform vec3 uOuterColumnColor;
    uniform float uSonicBrightness;
    uniform float uSonicExposure;
    uniform vec3 uRippleColor;
    uniform float uGlowIntensity;

    varying vec2 vUv;
    varying float vElevation;
    varying float vDistance;
    varying vec2 vRippleAnim;
    varying vec3 vNormal;
    varying float vRelativeY;
    varying vec2 vInstancePos;
    varying float vBassColumnBlend;
    varying float vBassColumnRadialMix;

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

      float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist / 94.0));
      vec3 zoneCore = mix(coolCore, warmCore, warmBlend);
      vec3 zoneEdge = mix(coolEdge, warmEdge, warmBlend);
      vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));
      vec3 sonicColumnColor = mix(uCoreColumnColor, uOuterColumnColor, vBassColumnRadialMix);
      targetGlow = mix(targetGlow, sonicColumnColor, vBassColumnBlend * (0.78 + normElevation * 0.18));
      float distFade = 1.0 - smoothstep(46.0, 88.0, centerDist);
      targetGlow = mix(targetGlow, vec3(0.4, 0.8, 1.0), uBrightness * 0.6);
      float visualFloor = clamp(0.035 + uBrightness * 0.05 + uAir * 0.04, 0.035, 0.16);
      vec3 currentGlow = mix(cBase2, targetGlow, max(normElevation, visualFloor)) * uGlowIntensity * distFade;
      currentGlow = mix(currentGlow, uRippleColor, vRippleAnim.x);
      currentGlow = mix(currentGlow, vec3(1.0, 1.0, 1.0), vRippleAnim.y);

      vec3 bodyColor = mix(cBase1, cBase2, vRelativeY * distFade);
      vec3 finalColor;

      if (isTop) {
        float topIntensity = smoothstep(0.0, 0.4, normElevation);
        float twinkleDistFalloff = smoothstep(72.0, 36.0, centerDist);
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
      finalColor *= uSonicBrightness * exp2(uSonicExposure);

      float alphaFade = 1.0 - smoothstep(55.0, 78.0, vDistance);
      gl_FragColor = vec4(finalColor, alphaFade);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true
  });
  material.userData.lowFrequencySpectrum = lowFrequencySpectrum;
  material.userData.lowFrequencySpectrumData = lowFrequencySpectrumData;
  return material;
}

function sonicTopographyPaletteColors() {
  const topo = state.sonicTopography;
  const palette = topo.palette || fallbackLyricPalette(state.currentSong);
  return {
    core: rgbHexValue(palette?.highlight || palette?.glow || { r: 255, g: 255, b: 255 }),
    outer: rgbHexValue(palette?.glow || palette?.primary || { r: 131, g: 228, b: 255 })
  };
}

function resolvedSonicTopographyColors() {
  const automatic = sonicTopographyPaletteColors();
  const settings = state.sonicTopography.settings || DEFAULT_SONIC_SETTINGS;
  return {
    core: settings.coreColor || automatic.core,
    outer: settings.outerColor || automatic.outer
  };
}

function saveSonicSettingsPreferences() {
  try {
    window.localStorage.setItem(SONIC_SETTINGS_PREFS_KEY, JSON.stringify(
      normalizeSonicSettings(state.sonicTopography.settings)
    ));
  } catch (error) {}
}

function syncSonicSettingsControls() {
  const settings = normalizeSonicSettings(state.sonicTopography.settings);
  const colors = resolvedSonicTopographyColors();
  const isAutomatic = !settings.coreColor && !settings.outerColor;
  const isCustom = !!settings.coreColor && !!settings.outerColor;
  if (els.sonicCoreColorInput) els.sonicCoreColorInput.value = colors.core;
  if (els.sonicOuterColorInput) els.sonicOuterColorInput.value = colors.outer;
  if (els.sonicPaletteMode) {
    els.sonicPaletteMode.textContent = isAutomatic
      ? '颜色跟随封面'
      : isCustom ? '中间与外围自定义' : '部分颜色自定义';
  }
  if (els.sonicFollowCoverButton) {
    els.sonicFollowCoverButton.classList.toggle('is-active', isAutomatic);
    els.sonicFollowCoverButton.setAttribute('aria-pressed', String(isAutomatic));
  }
  const syncRange = (input, output, rawValue, text) => {
    if (input) {
      input.value = String(rawValue);
      input.setAttribute('aria-valuetext', text);
      syncElasticRangeVisual(input);
    }
    if (output) output.textContent = text;
  };
  syncRange(els.sonicBrightnessRange, els.sonicBrightnessValue, Math.round(settings.brightness * 100), `${Math.round(settings.brightness * 100)}%`);
  const exposureText = `${settings.exposure > 0 ? '+' : ''}${settings.exposure.toFixed(2)} EV`;
  syncRange(els.sonicExposureRange, els.sonicExposureValue, Math.round(settings.exposure * 100), exposureText);
  syncRange(els.sonicColumnHeightRange, els.sonicColumnHeightValue, Math.round(settings.columnHeight * 100), `${Math.round(settings.columnHeight * 100)}%`);
  syncRange(els.sonicFovRange, els.sonicFovValue, Math.round(settings.fov), `${Math.round(settings.fov)}°`);
  syncRange(els.sonicSmoothingRange, els.sonicSmoothingValue, Math.round(settings.smoothing * 100), `${Math.round(settings.smoothing * 100)}%`);
}

function sonicTopographyCameraFitRadius(aspect, fov) {
  const verticalFov = clamp(Number(fov) || SONIC_TOPOGRAPHY_CAMERA.fov, 50, 75) * Math.PI / 180;
  const safeAspect = clamp(Number(aspect) || 1, 0.3, 4);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const fitFov = Math.min(verticalFov, horizontalFov);
  const activeRadius = Math.min(Math.SQRT2 * SONIC_TOPOGRAPHY_HALF, 78);
  return Math.hypot(activeRadius, 10) * 1.1 / Math.sin(fitFov / 2);
}

function updateSonicTopographyCameraFit() {
  const topo = state.sonicTopography;
  if (!topo.camera) return;
  const settings = normalizeSonicSettings(topo.settings);
  topo.camera.fov = settings.fov;
  topo.baseCameraRadius = sonicTopographyCameraFitRadius(topo.camera.aspect, settings.fov);
  topo.camera.updateProjectionMatrix();
  if (topo.scene?.fog) {
    const activeRadius = Math.min(Math.SQRT2 * SONIC_TOPOGRAPHY_HALF, 78);
    topo.scene.fog.near = topo.baseCameraRadius * 0.58;
    topo.scene.fog.far = topo.baseCameraRadius + activeRadius * 1.8;
  }
}

function applySonicTopographySettings(options = {}) {
  const topo = state.sonicTopography;
  topo.settings = normalizeSonicSettings(topo.settings);
  const settings = topo.settings;
  const colors = resolvedSonicTopographyColors();
  if (topo.uniforms) {
    topo.uniforms.uCoreColumnColor?.value?.set?.(colors.core);
    topo.uniforms.uOuterColumnColor?.value?.set?.(colors.outer);
    if (topo.uniforms.uSonicBrightness) topo.uniforms.uSonicBrightness.value = settings.brightness;
    if (topo.uniforms.uSonicExposure) topo.uniforms.uSonicExposure.value = settings.exposure;
    if (topo.uniforms.uColumnHeightScale) topo.uniforms.uColumnHeightScale.value = settings.columnHeight;
  }
  updateSonicTopographyCameraFit();
  if (options.persist !== false) saveSonicSettingsPreferences();
  if (options.sync !== false) syncSonicSettingsControls();
  if (options.renderConfig !== false) renderDiySelectedPresetConfig();
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
  const renderQuality = createPresetRenderQuality(renderer, 0.2);
  renderer.domElement.className = 'sonic-topography-canvas';
  els.sonicTopographyCore.textContent = '';
  els.sonicTopographyCore.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.uBaseColor1.clone(), 100, 320);
  const camera = new THREE.PerspectiveCamera(state.sonicTopography.settings.fov, 1, 0.1, 500);
  camera.position.set(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  scene.add(group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(10, 20, 10);
  scene.add(key);

  const bassColumnRadius = SONIC_BASS_COLUMN_CLUSTER.radius;
  const bassColumnCorePoints = [];
  for (let gridZ = -bassColumnRadius; gridZ <= bassColumnRadius; gridZ += 1) {
    const rowHalfWidth = Math.floor(Math.sqrt(bassColumnRadius ** 2 - gridZ ** 2));
    const row = [];
    for (let gridX = -rowHalfWidth; gridX <= rowHalfWidth; gridX += 1) {
      row.push({ x: gridX, z: gridZ });
    }
    if ((gridZ + bassColumnRadius) % 2 === 1) row.reverse();
    bassColumnCorePoints.push(...row);
  }
  const bassColumnPointKey = (gridX, gridZ) => `${gridX},${gridZ}`;
  const bassColumnBandByPoint = new Map();
  let nonCenterColumnIndex = 0;
  bassColumnCorePoints.forEach((point) => {
    if (point.x === 0 && point.z === 0) {
      bassColumnBandByPoint.set(bassColumnPointKey(point.x, point.z), 0);
      return;
    }
    const bandIndex = Math.floor(
      nonCenterColumnIndex * SONIC_LOW_FREQUENCY_BAND_COUNT / (SONIC_BASS_COLUMN_CLUSTER.count - 1)
    );
    bassColumnBandByPoint.set(bassColumnPointKey(point.x, point.z), bandIndex);
    nonCenterColumnIndex += 1;
  });
  const bassColumnBandValues = new Float32Array(count);
  const geometry = new THREE.BoxGeometry(SONIC_TOPOGRAPHY_SIZE, 1, SONIC_TOPOGRAPHY_SIZE);
  const bassColumnBandAttribute = new THREE.InstancedBufferAttribute(bassColumnBandValues, 1);
  bassColumnBandAttribute.setUsage(THREE.StaticDrawUsage);
  geometry.setAttribute('aBassColumnBand', bassColumnBandAttribute);
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
      const gridX = x - SONIC_TOPOGRAPHY_GRID / 2;
      const gridZ = z - SONIC_TOPOGRAPHY_GRID / 2;
      const px = x * SONIC_TOPOGRAPHY_SPACING - offset;
      const pz = z * SONIC_TOPOGRAPHY_SPACING - offset;
      let bassColumnBand = bassColumnBandByPoint.get(bassColumnPointKey(gridX, gridZ));
      const gridRadius = Math.hypot(gridX, gridZ);
      if (!Number.isFinite(bassColumnBand)
          && gridRadius < bassColumnRadius + SONIC_BASS_COLUMN_CLUSTER.feather) {
        let nearestDistanceSquared = Infinity;
        bassColumnCorePoints.forEach((point) => {
          const dx = gridX - point.x;
          const dz = gridZ - point.z;
          const distanceSquared = dx * dx + dz * dz;
          if (distanceSquared >= nearestDistanceSquared) return;
          nearestDistanceSquared = distanceSquared;
          bassColumnBand = bassColumnBandByPoint.get(bassColumnPointKey(point.x, point.z));
        });
      }
      bassColumnBandValues[index] = Number.isFinite(bassColumnBand) ? bassColumnBand : 0;
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
  bassColumnBandAttribute.needsUpdate = true;
  meteorMesh.instanceMatrix.needsUpdate = true;
  particleMesh.instanceMatrix.needsUpdate = true;

  topo.count = count;
  topo.renderer = renderer;
  topo.renderQuality = renderQuality;
  topo.scene = scene;
  topo.camera = camera;
  topo.group = group;
  topo.terrain = terrain;
  topo.material = material;
  topo.uniforms = material.uniforms;
  topo.lowFrequencySpectrum = material.userData.lowFrequencySpectrum;
  topo.lowFrequencySpectrumData = material.userData.lowFrequencySpectrumData;
  topo.meteorMesh = meteorMesh;
  topo.meteorMaterial = meteorMesh.material;
  topo.particleMesh = particleMesh;
  topo.particleMaterial = particleMesh.material;
  topo.dummy = dummy;
  topo.meteorTargetColor = new THREE.Color();
  topo.whiteColor = new THREE.Color(0xffffff);
  topo.theme = theme;
  topo.ripples = material.uniforms.uRipples.value;
  topo.meteors = Array.from({ length: SONIC_TOPOGRAPHY_METEORS }, () => ({ active: false, x: 0, y: -1000, z: 0, speed: 0, strength: 0 }));
  topo.particles = Array.from({ length: SONIC_TOPOGRAPHY_PARTICLES }, () => ({ active: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1 }));
  applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
  topo.built = true;
  observePresetRendererSize(topo, els.sonicTopographyCore, resizeSonicTopographyRenderer);
  applySonicTopographyPalette(topo.palette || fallbackLyricPalette(state.currentSong));
  applyPresetUpscaler({ force: true });
  if (renderQuality) renderQuality.render(scene, camera, performance.now());
  else renderer.render(scene, camera);
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
  if (topo.renderQuality) topo.renderQuality.resize(width, height, topo.renderer.getPixelRatio?.() || renderPixelRatio('webgl'));
  else topo.renderer.setSize(width, height, false);
  topo.camera.aspect = width / Math.max(1, height);
  updateSonicTopographyCameraFit();
}

function updateSonicTopographyVisibility() {
  const visible = state.playbackPage && isSonicTopographyPreset();
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
  [
    els.wallpaperOpacityRange,
    els.wallpaperBrightnessRange,
    els.wallpaperBlurRange,
    els.wallpaperScaleRange
  ].forEach(syncElasticRangeVisual);
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
  state.activeWallpaperIds[state.wallpaperSource] = active?.id || '';
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
  state.activeWallpaperIds[state.wallpaperSource] = wallpaper.id;
  saveWallpaperPrefs();
  renderWallpaperList();
}

async function refreshWallpapers(options = {}) {
  const requestedSource = options.source === 'live' || options.source === 'imported'
    ? options.source
    : state.wallpaperSource;
  state.wallpaperSource = requestedSource;
  if (state.wallpaperLoading) return;
  state.wallpaperLoading = true;
  setWallpaperStatus(requestedSource === 'live' ? '正在识别 Wallpaper Engine 库...' : '正在加载已导入壁纸...');
  try {
    const scan = options.scan ?? requestedSource === 'live';
    const payload = await apiJson(`/api/wallpapers?${query({ scan })}`);
    if (state.wallpaperSource !== requestedSource) return;
    state.wallpapers = Array.isArray(payload.wallpapers) ? payload.wallpapers : [];
    renderWallpaperList();
  } catch (error) {
    if (state.wallpaperSource === requestedSource) setWallpaperStatus(error.message || '壁纸加载失败');
  } finally {
    state.wallpaperLoading = false;
    if (state.wallpaperSource !== requestedSource) {
      refreshWallpapers({ source: state.wallpaperSource });
    }
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
  if (visible) {
    const mediaMissing = (!els.wallpaperImage || els.wallpaperImage.hidden)
      && (!els.wallpaperVideo || els.wallpaperVideo.hidden);
    if (mediaMissing && visibleWallpapers().length) renderWallpaperList();
    updateWallpaperAutoSize();
  }
  if (visible && !state.wallpapers.length && !state.wallpaperLoading) refreshWallpapers({ source: state.wallpaperSource });
  if (!visible && els.wallpaperVideo) els.wallpaperVideo.pause();
  if (visible && els.wallpaperVideo && !els.wallpaperVideo.hidden) els.wallpaperVideo.play().catch(() => {});
}

function coverParticlePresetVisible() {
  return state.playbackPage && isCoverParticlePreset();
}

function playCoverParticleEngine() {
  const cover = state.coverParticle;
  const container = cover.engineContainer;
  if (!cover.engineVisible || !coverParticlePresetVisible() || !isPlaybackClockRunning() || cover.enginePlaying || typeof container?.play !== 'function') return;
  try {
    container.play();
    cover.enginePlaying = true;
  } catch (error) {}
}

function pauseCoverParticleEngine(force = false) {
  const cover = state.coverParticle;
  const container = cover.engineContainer;
  if (!container || (!force && !cover.enginePlaying)) return;
  if (typeof container.pause === 'function') {
    try { container.pause(); } catch (error) {}
  }
  cover.enginePlaying = false;
}

function updateCoverParticleVisibility() {
  const visible = coverParticlePresetVisible();
  const visibilityChanged = visible !== state.coverParticle.engineVisible;
  state.coverParticle.engineVisible = visible;
  if (els.coverParticleScene) els.coverParticleScene.hidden = !visible;
  if (els.appShell) els.appShell.classList.toggle('has-cover-particle-scene', visible);
  updateCoverParticleBackgroundMode();
  if (visible) {
    updateCoverParticleImage(state.currentSong);
    if (visibilityChanged) ensureCoverParticleEngine().then(playCoverParticleEngine);
  } else if (visibilityChanged) {
    pauseCoverParticleEngine();
  }
}

function updateCoverParticleBackgroundMode() {
  const enabled = !!state.coverParticle.backgroundEnabled && coverParticlePresetVisible();
  if (els.coverParticleScene) els.coverParticleScene.classList.toggle('has-soft-background', enabled);
  if (els.diyCoverParticleBackgroundToggle) {
    els.diyCoverParticleBackgroundToggle.checked = !!state.coverParticle.backgroundEnabled;
    els.diyCoverParticleBackgroundToggle.setAttribute('aria-pressed', String(!!state.coverParticle.backgroundEnabled));
  }
  if (els.diyCoverParticleBackgroundValue) {
    els.diyCoverParticleBackgroundValue.textContent = state.coverParticle.backgroundEnabled ? 'ON' : 'OFF';
  }
  const motionPercent = coverParticleMotionPercent();
  if (els.diyCoverParticleMotionRange) {
    els.diyCoverParticleMotionRange.value = String(motionPercent);
    els.diyCoverParticleMotionRange.setAttribute('aria-valuetext', `${motionPercent}%`);
    syncElasticRangeVisual(els.diyCoverParticleMotionRange);
  }
  if (els.diyCoverParticleMotionValue) {
    els.diyCoverParticleMotionValue.textContent = `${motionPercent}%`;
  }
}

function coverParticleMotionPercent() {
  return Math.round(clamp(Number(state.coverParticle.motionAmplitude) || 0, 0, 2) * 100);
}

function coverParticleMotionScale() {
  return clamp(Number(state.coverParticle.motionAmplitude) || 0, 0, 2) * (reducedMotion ? 0.35 : 1);
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
  if (!topo.built || !isSonicTopographyPreset() || !topo.camera || !window.THREE) return;
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
  topo.projectilesActive = true;
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
  topo.projectilesActive = true;
}

function updateSonicTopographyProjectiles(dt) {
  const topo = state.sonicTopography;
  const dummy = topo.dummy;
  if (!dummy || !topo.meteorMesh || !topo.particleMesh || !topo.projectilesActive) return;
  const clearAll = topo.projectilesNeedClear;
  let activeRemaining = false;
  let meteorMatricesChanged = false;
  for (let i = 0; i < topo.meteors.length; i += 1) {
    const meteor = topo.meteors[i];
    if (!meteor.active) {
      if (!clearAll) continue;
      dummy.position.set(0, -1000, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      topo.meteorMesh.setMatrixAt(i, dummy.matrix);
      meteorMatricesChanged = true;
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
      activeRemaining = true;
      if (Math.random() > 0.3) spawnSonicTopographyParticle(meteor.x, meteor.y, meteor.z, meteor.speed * 0.2);
      dummy.position.set(meteor.x, Math.max(0, meteor.y), meteor.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.5, 1.5, 1.5);
    }
    dummy.updateMatrix();
    topo.meteorMesh.setMatrixAt(i, dummy.matrix);
    meteorMatricesChanged = true;
  }
  if (meteorMatricesChanged) topo.meteorMesh.instanceMatrix.needsUpdate = true;

  let particleMatricesChanged = false;
  for (let i = 0; i < topo.particles.length; i += 1) {
    const particle = topo.particles[i];
    if (!particle.active) {
      if (!clearAll) continue;
      dummy.position.set(0, -1000, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      topo.particleMesh.setMatrixAt(i, dummy.matrix);
      particleMatricesChanged = true;
      continue;
    }
    particle.life += dt;
    if (particle.life >= particle.maxLife) {
      particle.active = false;
      dummy.position.set(0, -1000, 0);
      dummy.scale.set(0, 0, 0);
    } else {
      activeRemaining = true;
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
    particleMatricesChanged = true;
  }
  if (particleMatricesChanged) topo.particleMesh.instanceMatrix.needsUpdate = true;
  topo.projectilesNeedClear = false;
  topo.projectilesActive = activeRemaining;
}

function resetSonicTopographyAudioMotion(topo) {
  if (!topo) return;
  topo.lastBeat = 0;
  topo.pulseCooldown = 0;
  topo.meteorCooldown = 0;
  if (topo.frameAudio) {
    topo.frameAudio.lowFrequencyAmplitude = 0;
    topo.frameAudio.subBass = 0;
    topo.frameAudio.bass = 0;
    topo.frameAudio.lowMid = 0;
    topo.frameAudio.lowFrequencyBands?.fill(0);
    topo.frameAudio.lowFrequencyBandTargets?.fill(0);
  }
  if (topo.lowFrequencySpectrumData && topo.lowFrequencySpectrum) {
    topo.lowFrequencySpectrumData.fill(0);
    topo.lowFrequencySpectrum.needsUpdate = true;
  }
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
  topo.projectilesNeedClear = true;
  topo.projectilesActive = true;
}

function updateSonicTopographyMotion() {
  const topo = state.sonicTopography;
  if (!state.playbackPage || !isSonicTopographyPreset() || !topo.uniforms || !topo.renderer || !topo.scene || !topo.camera) return;
  const nowMs = performance.now();
  const frameGapMs = playbackPresetsUseNativeRefresh() ? 0 : RENDER_PROFILE.topographyFrameGapMs;
  if (frameGapMs && topo.lastRenderAt && nowMs - topo.lastRenderAt < frameGapMs) return;
  topo.lastRenderAt = nowMs;
  const now = nowMs / 1000;
  const dt = topo.lastMotionAt ? clamp((nowMs - topo.lastMotionAt) / 1000, 1 / 360, 0.04) : 0.016;
  const simulationStep = playbackPresetsUseNativeRefresh()
    ? dt * (1000 / RENDER_PROFILE.targetFrameMs)
    : 1;
  topo.lastMotionAt = nowMs;

  const audioDriving = isPlaybackClockRunning();
  const live = audioDriving
    ? (state.audioAnalysis.live ? state.audioAnalysis : state.visual)
    : null;
  const audio = topo.frameAudio;
  const lowFrequencyAmplitudeTarget = audioDriving
    ? clamp(Math.max(
        Number(live.lowFrequencyAmplitude) || 0,
        Number(state.visual.lowFrequencyAmplitude) || 0,
        Number(live.subBass) || 0,
        Number(live.bass) || 0
      ), 0, 1)
    : 0;
  const subBassTarget = audioDriving
    ? clamp(Math.max(Number(live.subBass) || 0, Number(state.visual.lowFrequencyAmplitude) || 0), 0, 1)
    : 0;
  const bassTarget = audioDriving
    ? clamp(Math.max(Number(live.bass) || 0, Number(state.visual.bass) || 0), 0, 1)
    : 0;
  const lowMidTarget = audioDriving ? clamp(live.lowMid || 0, 0, 1) : 0;
  const smoothing = normalizeSonicSettings(topo.settings).smoothing;
  const attackResponse = 1 - Math.exp(-dt / (SONIC_BASS_COLUMN_ATTACK_SECONDS * smoothing));
  const releaseResponse = 1 - Math.exp(-dt / (SONIC_BASS_COLUMN_RELEASE_SECONDS * smoothing));
  if (audioDriving) {
    audio.lowFrequencyAmplitude += (lowFrequencyAmplitudeTarget - audio.lowFrequencyAmplitude)
      * (lowFrequencyAmplitudeTarget > audio.lowFrequencyAmplitude ? attackResponse : releaseResponse);
    audio.subBass += (subBassTarget - audio.subBass)
      * (subBassTarget > audio.subBass ? attackResponse : releaseResponse);
    audio.bass += (bassTarget - audio.bass)
      * (bassTarget > audio.bass ? attackResponse : releaseResponse);
    audio.lowMid += (lowMidTarget - audio.lowMid)
      * (lowMidTarget > audio.lowMid ? attackResponse : releaseResponse);
  } else {
    audio.lowFrequencyAmplitude = 0;
    audio.subBass = 0;
    audio.bass = 0;
    audio.lowMid = 0;
  }
  audio.mid = audioDriving ? clamp(live.mid || 0, 0, 1) : 0;
  audio.highMid = audioDriving ? clamp(live.highMid || 0, 0, 1) : 0;
  audio.presence = audioDriving ? clamp(live.presence || 0, 0, 1) : 0;
  audio.brilliance = audioDriving ? clamp(live.brilliance || 0, 0, 1) : 0;
  audio.air = audioDriving ? clamp(live.air || 0, 0, 1) : 0;
  audio.energy = audioDriving ? clamp(live.energy || 0, 0, 1) : 0;
  audio.warmth = audioDriving ? clamp(live.warmth || 0, 0, 1) : 0;
  audio.brightness = audioDriving ? clamp(live.brightness || 0, 0, 1) : 0;
  audio.sharpness = audioDriving ? clamp(live.sharpness || 0, 0, 1) : 0;
  audio.smoothness = audioDriving ? clamp(live.smoothness == null ? 0.7 : live.smoothness, 0, 1) : 0.7;
  audio.density = audioDriving ? clamp(live.density || 0, 0, 1) : 0;
  audio.spectralCentroid = audioDriving ? Number(live.spectralCentroid) || 0 : 0;
  audio.fluxPulse = audioDriving ? Number(live.fluxPulse) || 0 : 0;
  audio.fluxMeteor = audioDriving ? Number(live.fluxMeteor) || 0 : 0;
  audio.beat = audioDriving ? clamp(state.visual.beat || 0, 0, 1) : 0;
  if (audioDriving) {
    topo.idleTone.presence = audio.presence;
    topo.idleTone.brilliance = audio.brilliance;
    topo.idleTone.air = audio.air;
    topo.idleTone.warmth = audio.warmth;
    topo.idleTone.brightness = audio.brightness;
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

  writeLowFrequencyBands(
    audio.lowFrequencyBandTargets,
    audioDriving && live ? live.lowFrequencyBands : null,
    lowFrequencyAmplitudeTarget
  );
  if (topo.lowFrequencySpectrumData && topo.lowFrequencySpectrum) {
    let spectrumChanged = false;
    for (let index = 0; index < SONIC_LOW_FREQUENCY_BAND_COUNT; index += 1) {
      const targetAmplitude = audioDriving ? audio.lowFrequencyBandTargets[index] || 0 : 0;
      let amplitude = audio.lowFrequencyBands[index] || 0;
      if (audioDriving) {
        amplitude += (targetAmplitude - amplitude)
          * (targetAmplitude > amplitude ? attackResponse : releaseResponse);
      } else {
        amplitude = 0;
      }
      audio.lowFrequencyBands[index] = amplitude;
      const encodedAmplitude = Math.round(clamp(amplitude, 0, 1) * 255);
      if (topo.lowFrequencySpectrumData[index] !== encodedAmplitude) {
        topo.lowFrequencySpectrumData[index] = encodedAmplitude;
        spectrumChanged = true;
      }
    }
    if (spectrumChanged) topo.lowFrequencySpectrum.needsUpdate = true;
  }

  const uniforms = topo.uniforms;
  uniforms.uTime.value = now;
  uniforms.uSubBass.value = audio.subBass;
  uniforms.uBass.value = audio.bass;
  uniforms.uLowFrequencyAmplitude.value = audio.lowFrequencyAmplitude;
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
    topo.meteorTargetColor.copy(theme.uWarmCore).lerp(topo.whiteColor, 0.7);
    topo.meteorMaterial.color.lerp(topo.meteorTargetColor, lerpSpeed);
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
    if (topo.pulseCooldown > 0) topo.pulseCooldown = Math.max(0, topo.pulseCooldown - simulationStep);
    if (topo.meteorCooldown > 0) topo.meteorCooldown = Math.max(0, topo.meteorCooldown - simulationStep);
    const lowBassTransient = Math.max(0, lowBassDrive - topo.lastBeat);
    const pulseStrength = clamp(Math.max(audio.fluxPulse * 1.45, lowBassTransient * 2.2, audio.beat * lowBassDrive * 0.72), 0, 1);
    const pulseRateBase = pulseStrength > topo.audioPulse ? 0.34 : 0.075;
    const pulseRate = 1 - Math.pow(1 - pulseRateBase, simulationStep);
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
    const beatRate = 1 - Math.pow(0.76, simulationStep);
    topo.lastBeat += (lowBassDrive - topo.lastBeat) * beatRate;
  }
  uniforms.uAudioPulse.value = clamp(topo.audioPulse || 0, 0, 1);

  if (!topo.resizeObserver) resizeSonicTopographyRenderer();

  if (!state.playbackVisual.dragging && !reducedMotion) topo.autoYaw += dt * 0.05;
  const referenceRadius = Math.hypot(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.y, SONIC_TOPOGRAPHY_CAMERA.z);
  const baseRadius = topo.baseCameraRadius || referenceRadius;
  const radius = baseRadius / clamp(state.playbackVisual.zoom || 1, 0.58, 2.35);
  const baseAzimuth = Math.atan2(SONIC_TOPOGRAPHY_CAMERA.x, SONIC_TOPOGRAPHY_CAMERA.z);
  const baseElevation = Math.asin(SONIC_TOPOGRAPHY_CAMERA.y / referenceRadius);
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
  if (topo.renderQuality) topo.renderQuality.render(topo.scene, topo.camera, nowMs);
  else topo.renderer.render(topo.scene, topo.camera);
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

function rgbFromHex(value) {
  const color = normalizeTextPaletteColor(value);
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16)
  };
}

function relativeLuminance(color) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function readableLyricColor(color, mixAmount = 0.34) {
  const lifted = mixRgb(color, { r: 255, g: 255, b: 255 }, mixAmount);
  if (relativeLuminance(lifted) < 0.62) return mixRgb(lifted, { r: 255, g: 255, b: 255 }, 0.28);
  return lifted;
}

function lyricPaletteFromBase(base, coverColors = []) {
  const normalizedCoverColors = [
    coverColors[0] || base,
    coverColors[1] || mixRgb(base, { r: 255, g: 255, b: 255 }, 0.28),
    coverColors[2] || mixRgb(base, { r: 34, g: 22, b: 54 }, 0.42)
  ].map((color) => ({
    r: clamp(Math.round(Number(color.r) || 0), 0, 255),
    g: clamp(Math.round(Number(color.g) || 0), 0, 255),
    b: clamp(Math.round(Number(color.b) || 0), 0, 255)
  }));
  return {
    primary: readableLyricColor(base, 0.26),
    glow: mixRgb(base, { r: 255, g: 255, b: 255 }, 0.16),
    highlight: readableLyricColor(base, 0.5),
    depth: mixRgb(base, { r: 0, g: 0, b: 0 }, 0.68),
    coverColors: normalizedCoverColors
  };
}

function proxiedImageUrl(url) {
  return url ? `/api/cover?url=${encodeURIComponent(url)}` : '';
}

function coverUrl(song) {
  const source = songCoverSource(song || {});
  return proxiedImageUrl(source);
}

function textPalettePresetId(preset = state.textPreset) {
  if (TEXT_PALETTE_PRESET_IDS.includes(preset)) return preset;
  if (TEXT_PALETTE_PRESET_IDS.includes(state.lastSelectableTextPreset)) return state.lastSelectableTextPreset;
  return 'depth';
}

function textPalettePreference(preset = state.textPreset) {
  const id = textPalettePresetId(preset);
  const preference = normalizeTextPalettePreference(state.textPalettePreferences?.[id]);
  state.textPalettePreferences[id] = preference;
  return preference;
}

function manualTextLyricPalette(color) {
  const base = rgbFromHex(color);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return lyricPaletteFromBase(base, [
    base,
    mixRgb(base, white, 0.32),
    mixRgb(base, black, 0.46)
  ]);
}

function resolvedTextLyricPalette(coverPalette) {
  const preference = textPalettePreference();
  return preference.mode === 'manual'
    ? manualTextLyricPalette(preference.color)
    : coverPalette;
}

function playbackLyricPalettePreference() {
  const preference = normalizeTextPalettePreference(state.playbackLyricPalettePreference);
  state.playbackLyricPalettePreference = preference;
  return preference;
}

function resolvedPlaybackLyricPalette(coverPalette) {
  const preference = playbackLyricPalettePreference();
  return preference.mode === 'manual'
    ? manualTextLyricPalette(preference.color)
    : coverPalette;
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
  const hue = 185 + (hash % 96);
  const coverColors = [
    hslToRgb(hue, 0.82, 0.62),
    hslToRgb(hue + 48, 0.76, 0.58),
    hslToRgb(hue + 112, 0.7, 0.56)
  ];
  return lyricPaletteFromBase(coverColors[0], coverColors);
}

function coverColorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function extractCoverColors(data) {
  const buckets = new Map();
  let total = 0;
  const average = { r: 0, g: 0, b: 0 };
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 64) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, saturation: 0, luminance: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.saturation += saturation;
    bucket.luminance += luminance;
    buckets.set(key, bucket);
    average.r += r;
    average.g += g;
    average.b += b;
    total += 1;
  }
  if (!total) return [];
  average.r = Math.round(average.r / total);
  average.g = Math.round(average.g / total);
  average.b = Math.round(average.b / total);
  const candidates = Array.from(buckets.values()).map((bucket) => {
    const saturation = bucket.saturation / bucket.count;
    const luminance = bucket.luminance / bucket.count;
    return {
      color: {
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count)
      },
      score: bucket.count * (0.58 + saturation * 1.55) * (0.74 + (1 - Math.abs(luminance - 0.54)) * 0.42)
    };
  }).sort((a, b) => b.score - a.score);

  const selected = [];
  [92, 70, 48, 0].some((minimumDistance) => {
    candidates.forEach((candidate) => {
      if (selected.length >= 3) return;
      if (selected.every((color) => coverColorDistance(color, candidate.color) >= minimumDistance)) {
        selected.push(candidate.color);
      }
    });
    return selected.length >= 3;
  });
  if (selected.length < 3 && selected.every((color) => coverColorDistance(color, average) >= 24)) selected.push(average);
  return selected.slice(0, 3);
}

function sampleCoverBase(data) {
  let total = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let best = { r: 131, g: 228, b: 255 };
  let bestScore = -1;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 64) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const score = saturation * 1.55 - Math.abs(luminance - 0.58) * 0.52 + luminance * 0.18;
    red += r;
    green += g;
    blue += b;
    total += 1;
    if (score > bestScore) {
      bestScore = score;
      best = { r, g, b };
    }
  }
  if (!total) return null;
  const average = {
    r: Math.round(red / total),
    g: Math.round(green / total),
    b: Math.round(blue / total)
  };
  return mixRgb(best, average, 0.28);
}

function sampleCoverPalette(img) {
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const canvas = document.createElement('canvas');
  const size = 36;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(img, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    const coverColors = extractCoverColors(data);
    if (!coverColors.length) return null;
    const fallback = fallbackLyricPalette(state.currentSong).coverColors;
    while (coverColors.length < 3) coverColors.push(fallback[coverColors.length]);
    const base = sampleCoverBase(data) || mixRgb(coverColors[0], coverColors[1], 0.2);
    return lyricPaletteFromBase(base, coverColors);
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
  applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
}

function rgbHexValue(color) {
  const part = (value) => clamp(Math.round(Number(value) || 0), 0, 255).toString(16).padStart(2, '0');
  return `#${part(color && color.r)}${part(color && color.g)}${part(color && color.b)}`;
}

function applyCoverParticlePalette(palette) {
  const source = palette || fallbackLyricPalette(state.currentSong);
  state.coverParticle.palette = source;
  if (!els.coverParticleScene || !source) return;
  const fallback = [source.primary, source.glow, source.highlight];
  const coverColors = [0, 1, 2].map((index) => source.coverColors?.[index] || fallback[index]);
  const softColors = coverColors.map((color, index) => playbackGlowColor(color, index));
  els.coverParticleScene.style.setProperty('--cover-particle-a', rgbCss(softColors[0], 0.66));
  els.coverParticleScene.style.setProperty('--cover-particle-b', rgbCss(softColors[1], 0.58));
  els.coverParticleScene.style.setProperty('--cover-particle-c', rgbCss(softColors[2], 0.62));
}

function playbackGlowColor(color, index = 0) {
  const white = { r: 255, g: 255, b: 255 };
  const minimumLift = [0.1, 0.08, 0.06][index] ?? 0.08;
  const lift = clamp(
    minimumLift + Math.max(0, 0.48 - relativeLuminance(color)) * 0.72,
    minimumLift,
    0.42
  );
  return mixRgb(color, white, lift);
}

function applyQishuiPlaybackPalette(palette) {
  if (!els.qishuiPlaybackPhone || !palette) return;
  const fallback = [palette.primary, palette.glow, palette.depth];
  const colors = [0, 1, 2].map((index) => palette.coverColors?.[index] || fallback[index]);
  const black = { r: 0, g: 0, b: 0 };
  const softA = playbackGlowColor(colors[0], 0);
  const softB = playbackGlowColor(colors[1], 1);
  const softC = playbackGlowColor(colors[2], 2);
  const blended = mixRgb(mixRgb(softA, softB, 0.38), softC, 0.24);
  const surface = mixRgb(blended, black, 0.58);
  [els.qishuiPlaybackPhone, els.appShell].forEach((target) => {
    if (!target) return;
    target.style.setProperty('--playback-cover-a', rgbCss(softA, 0.24));
    target.style.setProperty('--playback-cover-b', rgbCss(softB, 0.22));
    target.style.setProperty('--playback-cover-c', rgbCss(softC, 0.23));
    target.style.setProperty('--playback-cover-surface', rgbCss(surface, 0.045));
  });
  applyQishuiPlaybackLyricPalette(palette);
}

function applyQishuiPlaybackLyricPalette(coverPalette) {
  if (!els.qishuiPlaybackPhone || !coverPalette) return;
  const lyricPalette = resolvedPlaybackLyricPalette(coverPalette);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const base = readableLyricColor(
    mixRgb(lyricPalette.primary, lyricPalette.glow, 0.22),
    0.22
  );
  const current = readableLyricColor(
    mixRgb(lyricPalette.highlight, lyricPalette.primary, 0.16),
    0.18
  );
  const muted = readableLyricColor(mixRgb(base, lyricPalette.depth, 0.06), 0.08);
  const shadow = mixRgb(lyricPalette.depth, black, 0.48);
  const highlightEdge = mixRgb(current, white, 0.1);
  [els.qishuiPlaybackPhone, els.appShell].filter(Boolean).forEach((target) => {
    target.style.setProperty('--playback-lyric-base', rgbCss(base, 0.94));
    target.style.setProperty('--playback-lyric-base-rgb', rgbTriplet(base));
    target.style.setProperty('--playback-lyric-muted', rgbCss(muted, 0.9));
    target.style.setProperty('--playback-lyric-current', rgbCss(highlightEdge, 0.99));
    target.style.setProperty('--playback-lyric-current-rgb', rgbTriplet(highlightEdge));
    target.style.setProperty('--playback-lyric-shadow', rgbCss(shadow, 0.96));
    target.style.setProperty('--playback-lyric-shadow-rgb', rgbTriplet(shadow));
  });
  els.qishuiPlaybackPhone.style.setProperty('--book-hot', rgbCss(highlightEdge));
  els.qishuiPlaybackPhone.style.setProperty('--book-hot-rgb', rgbTriplet(highlightEdge));
  els.qishuiPlaybackPhone.style.setProperty('--book-depth', rgbCss(shadow));
  els.qishuiPlaybackPhone.style.setProperty('--book-depth-rgb', rgbTriplet(shadow));
  if (els.playbackLyricPaletteControl) {
    els.playbackLyricPaletteControl.style.setProperty(
      '--text-palette-auto-color',
      rgbCss(coverPalette.primary)
    );
  }
}

function applyLyricPalette(palette) {
  if (!palette) return;
  state.playbackVisual.palette = palette;
  applyQishuiPlaybackPalette(palette);
  const lyricPalette = resolvedTextLyricPalette(palette);
  const target = els.playbackLyricScene;
  if (target) {
    const white = { r: 255, g: 255, b: 255 };
    const gradientStart = mixRgb(lyricPalette.highlight, white, 0.12);
    const gradientMid = mixRgb(lyricPalette.glow, white, 0.04);
    const gradientEnd = mixRgb(lyricPalette.primary, lyricPalette.depth, 0.14);
    const gradientTail = mixRgb(lyricPalette.depth, lyricPalette.primary, 0.22);
    const lyricCoverSoftA = mixRgb(lyricPalette.primary, lyricPalette.glow, 0.36);
    const lyricCoverSoftB = mixRgb(lyricPalette.highlight, lyricPalette.glow, 0.34);
    const lyricCoverSoftC = mixRgb(lyricPalette.depth, lyricPalette.primary, 0.3);
    const lyricFontBase = readableLyricColor(mixRgb(lyricPalette.primary, lyricPalette.glow, 0.18), 0.16);
    const lyricFontHot = readableLyricColor(mixRgb(lyricPalette.highlight, lyricPalette.primary, 0.16), 0.2);
    const lyricFontSoft = mixRgb(lyricFontBase, lyricPalette.depth, 0.12);
    const bookSoftA = mixRgb(lyricPalette.primary, lyricPalette.glow, 0.34);
    const bookSoftB = mixRgb(lyricPalette.highlight, lyricPalette.glow, 0.42);
    const bookSoftBase = mixRgb(lyricPalette.depth, lyricPalette.primary, 0.2);
    target.style.setProperty('--lyric-primary', rgbCss(lyricPalette.primary));
    target.style.setProperty('--lyric-glow', rgbCss(lyricPalette.glow));
    target.style.setProperty('--lyric-highlight', rgbCss(lyricPalette.highlight));
    target.style.setProperty('--lyric-depth', rgbCss(lyricPalette.depth));
    target.style.setProperty('--lyric-primary-rgb', rgbTriplet(lyricPalette.primary));
    target.style.setProperty('--lyric-highlight-rgb', rgbTriplet(lyricPalette.highlight));
    target.style.setProperty('--lyric-depth-rgb', rgbTriplet(lyricPalette.depth));
    target.style.setProperty('--lyric-glow-soft', rgbCss(lyricPalette.glow, 0.22));
    target.style.setProperty('--lyric-glow-hot', rgbCss(lyricPalette.glow, 0.36));
    target.style.setProperty('--lyric-gradient-start', rgbCss(gradientStart));
    target.style.setProperty('--lyric-gradient-mid', rgbCss(gradientMid));
    target.style.setProperty('--lyric-gradient-end', rgbCss(gradientEnd));
    target.style.setProperty('--lyric-gradient-tail', rgbCss(gradientTail, 0.34));
    target.style.setProperty('--lyric-gradient-shadow', rgbCss(lyricPalette.depth, 0.88));
    target.style.setProperty('--lyric-cover-soft-a', rgbCss(lyricCoverSoftA, 0.62));
    target.style.setProperty('--lyric-cover-soft-b', rgbCss(lyricCoverSoftB, 0.5));
    target.style.setProperty('--lyric-cover-soft-c', rgbCss(lyricCoverSoftC, 0.58));
    target.style.setProperty('--lyric-font-base', rgbCss(lyricFontBase));
    target.style.setProperty('--lyric-font-hot', rgbCss(lyricFontHot));
    target.style.setProperty('--lyric-font-soft', rgbCss(lyricFontSoft));
    target.style.setProperty('--lyric-font-base-rgb', rgbTriplet(lyricFontBase));
    target.style.setProperty('--lyric-font-hot-rgb', rgbTriplet(lyricFontHot));
    target.style.setProperty('--lyric-font-soft-rgb', rgbTriplet(lyricFontSoft));
    [target, els.appShell].filter(Boolean).forEach((bookTarget) => {
      bookTarget.style.setProperty('--book-glow', rgbCss(lyricPalette.glow));
      bookTarget.style.setProperty('--book-glow-rgb', rgbTriplet(lyricPalette.glow));
      bookTarget.style.setProperty('--book-glow-soft', rgbCss(lyricPalette.glow, 0.26));
      bookTarget.style.setProperty('--book-hot', rgbCss(lyricPalette.highlight));
      bookTarget.style.setProperty('--book-hot-rgb', rgbTriplet(lyricPalette.highlight));
      bookTarget.style.setProperty('--book-depth', rgbCss(lyricPalette.depth));
      bookTarget.style.setProperty('--book-depth-rgb', rgbTriplet(lyricPalette.depth));
      bookTarget.style.setProperty('--book-page', rgbCss(mixRgb(lyricPalette.depth, lyricPalette.primary, 0.18), 0.58));
      bookTarget.style.setProperty('--book-soft-a', rgbCss(bookSoftA, 0.72));
      bookTarget.style.setProperty('--book-soft-b', rgbCss(bookSoftB, 0.62));
      bookTarget.style.setProperty('--book-soft-base', rgbCss(bookSoftBase, 0.94));
    });
  }
  if (els.textPaletteControl) {
    els.textPaletteControl.style.setProperty('--text-palette-auto-color', rgbCss(palette.primary));
  }
  applyDynamicCubePalette(palette);
  applyFreeCubePalette(palette);
  applyChladniPalette(palette);
  applySonicTopographyPalette(palette);
  applyCoverParticlePalette(palette);
  syncTextPaletteControls();
  syncPlaybackLyricPaletteControls();
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

function resetCoverParticleSamples() {
  state.coverParticle.sampleSignature = '';
  state.coverParticle.particles = [];
  state.coverParticle.gpuSignature = '';
}

function updateCoverParticleImage(song = state.currentSong) {
  const url = coverUrl(song);
  const signature = `${url}|${safeText(song && song.title, '')}`;
  if (signature === state.coverParticle.imageSignature) return;
  state.coverParticle.imageSignature = signature;
  resetCoverParticleSamples();
  if (!url) {
    state.coverParticle.image = null;
    return;
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.addEventListener('load', () => {
    if (state.coverParticle.imageSignature !== signature) return;
    state.coverParticle.image = image;
    resetCoverParticleSamples();
  }, { once: true });
  image.addEventListener('error', () => {
    if (state.coverParticle.imageSignature !== signature) return;
    state.coverParticle.image = null;
    resetCoverParticleSamples();
  }, { once: true });
  image.src = url;
}

function updateLyricPalette(song = state.currentSong) {
  const url = coverUrl(song);
  const signature = `${url}|${safeText(song && song.title, '')}`;
  updateCoverParticleImage(song);
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

function updateBookLyricArtist(subtitle = playbackLyricSubtitle()) {
  if (!els.bookLyricArtist) return;
  const text = safeText(subtitle, playbackLyricSubtitle());
  els.bookLyricArtist.textContent = text;
  els.bookLyricArtist.hidden = !text;
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

function appendBookLyricGlyphs(target, text, glyphTimings = [], options = {}) {
  const progressGlyphs = options.progress !== false;
  let glyphIndex = 0;
  Array.from(text).forEach((glyph) => {
    if (glyph === '\r') return;
    if (glyph === '\n') {
      target.appendChild(document.createElement('br'));
      return;
    }
    const span = document.createElement('span');
    span.className = progressGlyphs
      ? (glyph.trim() ? 'book-lyric-glyph' : 'book-lyric-glyph book-lyric-glyph--space')
      : (glyph.trim() ? 'book-lyric-base-glyph' : 'book-lyric-base-glyph book-lyric-base-glyph--space');
    span.textContent = glyph;
    if (glyph.trim()) {
      if (progressGlyphs) {
        span.dataset.bookGlyphIndex = String(glyphIndex);
        const timing = glyphTimings[glyphIndex];
        if (timing && Number.isFinite(timing.start) && Number.isFinite(timing.end) && timing.end > timing.start) {
          span.dataset.bookGlyphStart = timing.start.toFixed(3);
          span.dataset.bookGlyphEnd = timing.end.toFixed(3);
        }
      }
      glyphIndex += 1;
    }
    target.appendChild(span);
  });
  target.dataset.bookGlyphCount = String(glyphIndex);
}

function bookGlyphEase(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

const BOOK_LYRIC_VISUAL_LEAD_SECONDS = 0.34;
const BOOK_LYRIC_GLYPH_VISUAL_LEAD_SECONDS = 0.045;
const BOOK_LYRIC_MIN_GLYPH_VISUAL_SECONDS = 0.08;
const BOOK_LYRIC_GLYPH_SAMPLE_SECONDS = 0;
const BOOK_LYRIC_ROLL_WINDOW_GLYPHS = 1.2;
const LYRIC_TIMESTAMP_COMPENSATION_SECONDS = 0.22;
const BOOK_LYRIC_SCROLL_SNAP_PX = 0.65;
const BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS = 1 / 240;
const BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS = 0.08;

function resetLyricFrameSync() {
  state.lyricFrameTime = -1;
  state.lyricFramePreset = '';
  state.lyricFrameSignature = '';
}

function resetBookLyricScrollState(options = {}) {
  const store = options.store || state;
  const targetKey = options.targetKey || 'lyricBookScrollTarget';
  const frameAtKey = options.frameAtKey || 'lyricBookScrollFrameAt';
  const layoutVersionKey = options.layoutVersionKey || 'lyricBookLayoutVersion';
  store[targetKey] = Number.NaN;
  store[frameAtKey] = 0;
  store[layoutVersionKey] = (Number(store[layoutVersionKey]) || 0) + 1;
}

function bookLyricTargetScrollTop(line, options = {}) {
  const list = options.list || els.bookLyricList;
  const store = options.store || state;
  const layoutVersionKey = options.layoutVersionKey || 'lyricBookLayoutVersion';
  const layoutVersion = Number(store[layoutVersionKey]) || 0;
  if (!list || !line) return Number.NaN;
  const clientHeight = Number(list.clientHeight) || 0;
  const scrollHeight = Number(list.scrollHeight) || 0;
  if (clientHeight <= 0 || scrollHeight <= 0) return Number.NaN;
  if (
    line.__bookScrollVersion === layoutVersion
    && line.__bookScrollClientHeight === clientHeight
    && line.__bookScrollHeight === scrollHeight
    && Number.isFinite(line.__bookScrollTarget)
  ) {
    return line.__bookScrollTarget;
  }
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const target = line.offsetTop - Math.max(0, (clientHeight - line.offsetHeight) / 2);
  const scrollTop = clamp(target, 0, maxScroll);
  line.__bookScrollVersion = layoutVersion;
  line.__bookScrollClientHeight = clientHeight;
  line.__bookScrollHeight = scrollHeight;
  line.__bookScrollTarget = scrollTop;
  return scrollTop;
}

function syncBookLyricScroll(line, options = {}) {
  const list = options.list || els.bookLyricList;
  const store = options.store || state;
  const targetKey = options.targetKey || 'lyricBookScrollTarget';
  const frameAtKey = options.frameAtKey || 'lyricBookScrollFrameAt';
  const lines = Array.isArray(options.lines) ? options.lines : state.lyricLines;
  const activeIndex = Number.isInteger(options.activeIndex) ? options.activeIndex : state.lyricIndex;
  if (!list || !line) return false;
  const target = bookLyricTargetScrollTop(line, options);
  if (!Number.isFinite(target)) return false;

  const now = performance.now();
  const previousTarget = Number(store[targetKey]);
  const targetChanged = !Number.isFinite(previousTarget) || Math.abs(previousTarget - target) > BOOK_LYRIC_SCROLL_SNAP_PX;
  store[targetKey] = target;

  const current = Number(list.scrollTop) || 0;
  const delta = target - current;
  if (Math.abs(delta) <= BOOK_LYRIC_SCROLL_SNAP_PX) {
    list.scrollTop = target;
    store[frameAtKey] = now;
    return true;
  }

  const lastAt = Number(store[frameAtKey]) || now;
  const dt = clamp(
    (now - lastAt) / 1000,
    BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS,
    BOOK_LYRIC_SCROLL_MAX_STEP_SECONDS
  );
  store[frameAtKey] = now;

  const reducedMotionEnabled = options.reducedMotion ?? state.orb.reducedMotion;
  const playbackRunning = options.playbackRunning ?? isPlaybackClockRunning();
  if (reducedMotionEnabled || !playbackRunning || Math.abs(delta) > list.clientHeight * 1.4) {
    list.scrollTop = target;
    return true;
  }

  const activeLine = lines[activeIndex] || {};
  const nextLine = lines[activeIndex + 1] || {};
  const lineStart = Number(activeLine.time);
  const nextStart = Number(nextLine.time);
  const lineGap = Number.isFinite(lineStart) && Number.isFinite(nextStart) && nextStart > lineStart
    ? nextStart - lineStart
    : 2.4;
  const responseSeconds = clamp(lineGap * 0.12, targetChanged ? 0.09 : 0.12, 0.26);
  const step = clamp(dt / responseSeconds, targetChanged ? 0.28 : 0.08, 0.82);
  const easedDelta = delta * bookGlyphEase(step);
  list.scrollTop = current + easedDelta;
  const observed = Number(list.scrollTop) || 0;
  // Chromium can quantize a sub-pixel scroll write back to the same CSS pixel.
  if (
    Math.abs(observed - current) < 0.01
    && Math.abs(delta) > BOOK_LYRIC_SCROLL_SNAP_PX
  ) {
    list.scrollTop = current + Math.sign(delta) * Math.min(1, Math.abs(delta));
  }
  if (Math.abs(target - list.scrollTop) <= BOOK_LYRIC_SCROLL_SNAP_PX) {
    list.scrollTop = target;
    return true;
  }
  return false;
}

function cachedBookLyricGlyphs(line) {
  if (!line) return [];
  if (Array.isArray(line.__bookGlyphs)) return line.__bookGlyphs;
  const glyphs = Array.from(line.querySelectorAll('.book-lyric-glyph:not(.book-lyric-glyph--space)'));
  let hasTimedGlyphs = false;
  glyphs.forEach((glyph, fallbackIndex) => {
    const index = Number(glyph.dataset.bookGlyphIndex);
    glyph.__bookGlyphIndex = Number.isFinite(index) ? index : fallbackIndex;
    const start = Number(glyph.dataset.bookGlyphStart);
    const end = Number(glyph.dataset.bookGlyphEnd);
    glyph.__bookGlyphStart = start;
    glyph.__bookGlyphEnd = end;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) hasTimedGlyphs = true;
  });
  line.__bookGlyphs = glyphs;
  line.__bookHasTimedGlyphs = hasTimedGlyphs;
  return glyphs;
}

function setBookLyricGlyphProgress(line, progressPercent, currentTime = Number.NaN) {
  if (!line) return;
  const glyphs = cachedBookLyricGlyphs(line);
  const progressValue = clamp(Number(progressPercent) || 0, 0, 100);
  const timed = !!line.__bookHasTimedGlyphs && Number.isFinite(Number(currentTime));
  const progressKey = timed
    ? `t:${Number(currentTime).toFixed(3)}`
    : `p:${progressValue.toFixed(2)}`;
  if (line.__bookGlyphProgress === progressKey) return;
  line.__bookGlyphProgress = progressKey;
  if (!glyphs.length) return;

  const head = progressValue / 100 * glyphs.length;
  glyphs.forEach((glyph, fallbackIndex) => {
    const glyphIndex = Number.isFinite(glyph.__bookGlyphIndex) ? glyph.__bookGlyphIndex : fallbackIndex;
    let hot = 0;
    let roll = 0;

    if (timed && Number.isFinite(glyph.__bookGlyphStart) && Number.isFinite(glyph.__bookGlyphEnd)) {
      const start = glyph.__bookGlyphStart - BOOK_LYRIC_GLYPH_VISUAL_LEAD_SECONDS;
      const end = Math.max(start + BOOK_LYRIC_MIN_GLYPH_VISUAL_SECONDS, glyph.__bookGlyphEnd);
      const timedProgress = (Number(currentTime) + BOOK_LYRIC_GLYPH_SAMPLE_SECONDS - start) / Math.max(0.001, end - start);
      hot = bookGlyphEase(timedProgress);
      roll = bookGlyphEase(1 - Math.abs(timedProgress - 0.72) / 0.72);
    } else {
      hot = bookGlyphEase(head - glyphIndex);
      roll = bookGlyphEase(1 - Math.abs(head - (glyphIndex + 0.5)) / BOOK_LYRIC_ROLL_WINDOW_GLYPHS);
    }

    const hotValue = hot.toFixed(4);
    const coreValue = Math.min(1, hot * 0.92 + roll * 0.18).toFixed(4);
    const glowValue = Math.min(1, hot * 0.78 + roll * 0.32).toFixed(4);
    const softValue = Math.min(1, hot * 0.52 + roll * 0.34).toFixed(4);
    const rollValue = Math.min(1, roll).toFixed(4);
    const signature = `${hotValue}|${coreValue}|${glowValue}|${softValue}|${rollValue}`;
    if (glyph.__bookGlyphSignature === signature) return;
    glyph.__bookGlyphSignature = signature;
    glyph.style.setProperty('--book-glyph-hot', hotValue);
    glyph.style.setProperty('--book-glyph-core', coreValue);
    glyph.style.setProperty('--book-glyph-glow', glowValue);
    glyph.style.setProperty('--book-glyph-glow-soft', softValue);
    glyph.style.setProperty('--book-glyph-roll', rollValue);
  });
}

function syncBookLyricFrame() {
  if (!state.playbackPage || state.textPreset !== 'book' || !state.lyricLines.length || !isPlaybackClockRunning()) return;
  syncPlaybackLyricAnimationFrame();
}

function fitBookLyricLinesToPage() {
  if (!els.bookLyricList) return;
  const entries = Array.from(els.bookLyricList.querySelectorAll('.book-lyric-line-text'))
    .map((text) => ({
      text,
      line: text.closest('.book-lyric-line'),
      base: text.querySelector('.book-lyric-copy--base')
    }))
    .filter(({ line, base }) => line && base);
  if (!entries.length) return;

  entries.forEach(({ text }) => {
    text.style.removeProperty('font-size');
    text.style.removeProperty('--book-line-fit-width');
    text.style.removeProperty('--book-line-fit-scale');
  });

  const minimumFontSize = window.innerWidth <= 620 ? 10 : 12;
  const measured = entries.map(({ text, line, base }) => {
    const lineStyle = getComputedStyle(line);
    const horizontalPadding = (Number.parseFloat(lineStyle.paddingLeft) || 0)
      + (Number.parseFloat(lineStyle.paddingRight) || 0);
    const availableWidth = Math.max(0, line.clientWidth - horizontalPadding - 2);
    const naturalWidth = Math.max(1, base.scrollWidth);
    const naturalFontSize = Number.parseFloat(getComputedStyle(text).fontSize) || 1;
    const fittedFontSize = availableWidth > 0 && naturalWidth > availableWidth
      ? Math.max(minimumFontSize, naturalFontSize * availableWidth / naturalWidth)
      : naturalFontSize;
    return { text, base, availableWidth, naturalFontSize, fittedFontSize };
  });

  measured.forEach(({ text, naturalFontSize, fittedFontSize }) => {
    if (fittedFontSize < naturalFontSize - 0.01) text.style.fontSize = `${fittedFontSize.toFixed(3)}px`;
  });

  measured.forEach(({ text, base, availableWidth }) => {
    if (availableWidth <= 0) return;
    const fittedWidth = Math.max(1, Math.ceil(base.scrollWidth));
    const scale = Math.min(1, availableWidth / fittedWidth);
    text.style.setProperty('--book-line-fit-width', `${fittedWidth}px`);
    text.style.setProperty('--book-line-fit-scale', scale.toFixed(5));
  });
  resetBookLyricScrollState();
}

function scheduleBookLyricFit() {
  window.cancelAnimationFrame(state.lyricBookFitFrame);
  state.lyricBookFitFrame = window.requestAnimationFrame(() => {
    state.lyricBookFitFrame = 0;
    fitBookLyricLinesToPage();
  });
}

function createBookLyricLine(line, index, options = {}) {
  const button = document.createElement('button');
  button.className = ['book-lyric-line', options.lineClass].filter(Boolean).join(' ');
  button.type = 'button';
  button.dataset.bookLyricIndex = String(index);
  button.dataset.bookLyricTime = String(Number(line.time) || 0);
  button.dataset.text = safeText(line.text, playbackLyricText());
  button.setAttribute('aria-label', `${formatTime(Number(line.time) || 0)} ${safeText(line.text, '')}`);

  const text = document.createElement('span');
  text.className = 'book-lyric-line-text';
  const lyricText = safeText(line.text, playbackLyricText()).replace(/\s*\r?\n+\s*/g, ' ').trim();
  const base = document.createElement('span');
  base.className = 'book-lyric-copy book-lyric-copy--base';
  const highlight = document.createElement('span');
  highlight.className = 'book-lyric-copy book-lyric-copy--hot';
  const detailedGlyphs = options.lazyGlyphs !== true;
  if (detailedGlyphs) {
    appendBookLyricGlyphs(base, lyricText, [], { progress: false });
    appendBookLyricGlyphs(highlight, lyricText, line.glyphTimings);
  } else {
    base.textContent = lyricText;
    highlight.textContent = lyricText;
  }
  highlight.setAttribute('aria-hidden', 'true');
  text.appendChild(base);
  text.appendChild(highlight);
  button.appendChild(text);
  return button;
}

function renderBookLyricList(list, lines, options = {}) {
  if (!list) return;
  clearElement(list);
  lines.forEach((line, index) => {
    list.appendChild(createBookLyricLine(line, index, options));
  });
}

function renderBookLyricLines(force = false) {
  if (!els.bookLyricList) return;
  const lines = bookLyricDisplayLines();
  const signature = bookLyricSignature(lines);
  if (!force && state.lyricBookSignature === signature) return;
  state.lyricBookSignature = signature;
  state.lyricBookIndex = -2;
  state.lyricBookCurrentLine = null;
  resetBookLyricScrollState();
  renderBookLyricList(els.bookLyricList, lines);
  fitBookLyricLinesToPage();
  scheduleBookLyricFit();
}

function updateBookLyricLines(progressPercent = state.lyricProgressPercent, currentTime = Number.NaN) {
  if (!els.bookLyricList || state.textPreset !== 'book') return;
  renderBookLyricLines();
  const lines = bookLyricDisplayLines();
  const active = state.lyricLines.length ? clamp(state.lyricIndex, 0, Math.max(0, lines.length - 1)) : 0;
  const progressValue = clamp(Number(progressPercent) || 0, 0, 100);
  const progress = `${progressValue.toFixed(2)}%`;
  const currentTimeValue = Number.isFinite(Number(currentTime))
    ? Number(currentTime)
    : (els.audio && Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : Number.NaN);
  let current = state.lyricBookCurrentLine;

  if (state.lyricBookIndex !== active) {
    state.lyricBookIndex = active;
    state.lyricBookCurrentLine = null;
    els.bookLyricList.querySelectorAll('.book-lyric-line').forEach((line) => {
      const index = Number(line.dataset.bookLyricIndex) || 0;
      const distance = Math.min(6, Math.abs(index - active));
      const isCurrent = index === active;
      const isEnded = isCurrent && progressValue >= 99.6;
      line.classList.toggle('is-current', isCurrent);
      line.classList.toggle('is-ended', isEnded);
      line.classList.toggle('is-past', index < active);
      line.classList.toggle('is-future', index > active);
      line.style.setProperty('--book-line-distance', distance.toFixed(0));
      line.style.setProperty('--book-line-progress', isCurrent ? progress : '0%');
      setBookLyricGlyphProgress(line, isCurrent ? progressValue : 0, isCurrent ? currentTimeValue : Number.NaN);
      if (isCurrent) {
        current = line;
        state.lyricBookCurrentLine = line;
        line.setAttribute('aria-current', 'true');
      } else {
        line.removeAttribute('aria-current');
      }
    });

  } else {
    if (!current || Number(current.dataset.bookLyricIndex) !== active) {
      current = els.bookLyricList.querySelector(`.book-lyric-line[data-book-lyric-index="${active}"]`);
      state.lyricBookCurrentLine = current;
    }
  }

  if (current) {
    current.classList.toggle('is-ended', progressValue >= 99.6);
    current.style.setProperty('--book-line-progress', progress);
    setBookLyricGlyphProgress(current, progressValue, currentTimeValue);
    syncBookLyricScroll(current);
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
  if (isLocalSong(song) && els.dockFavoriteButton) {
    els.dockFavoriteButton.disabled = true;
    els.dockFavoriteButton.classList.remove('is-active');
    els.dockFavoriteButton.setAttribute('aria-pressed', 'false');
    els.dockFavoriteButton.title = '本地歌曲仅保留在本次导入歌单';
    els.dockFavoriteButton.setAttribute('aria-label', els.dockFavoriteButton.title);
  } else {
    updateFavoriteButton(els.dockFavoriteButton, song);
  }
  if (!els.searchSuggestions) return;
  els.searchSuggestions.querySelectorAll('.search-favorite-button').forEach((button) => {
    const index = Number(button.dataset.searchIndex);
    updateFavoriteButton(button, state.searchSuggestions.songs[index]);
  });
}

function favoriteProviderIds() {
  return Object.keys(MUSIC_PROVIDERS).filter((provider) => providerConfigured(provider));
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

function localAudioExtension(name = '') {
  const match = /\.([^.]+)$/.exec(String(name));
  return match ? match[1].trim().toLowerCase() : '';
}

function isLocalAudioFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  if (safeText(file.type, '').toLowerCase().startsWith('audio/')) return true;
  return LOCAL_AUDIO_EXTENSIONS.has(localAudioExtension(file.name));
}

function isLocalSong(song = state.currentSong) {
  return !!(song && (song.source === 'local' || song.provider === 'local') && safeText(song.localUrl, ''));
}

function localFileFingerprint(file) {
  return `${file.name}|${Number(file.size) || 0}|${Number(file.lastModified) || 0}`;
}

function localFingerprintId(fingerprint) {
  let hash = 2166136261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(36)}`;
}

function localTrackCopy(file) {
  const extension = localAudioExtension(file.name);
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || file.name;
  const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(baseName);
  return {
    title: split ? split[2].trim() : baseName,
    artist: split ? split[1].trim() : '本地音乐',
    album: extension ? `${extension.toUpperCase()} · 本地导入` : '本地导入'
  };
}

function localPlaylistDescriptor() {
  return {
    id: LOCAL_PLAYLIST_ID,
    name: '本地导入歌单',
    creator: '本地设备',
    trackCount: state.localPlaylistSongs.length,
    provider: 'local',
    local: true
  };
}

function playbackPlaylists() {
  return [localPlaylistDescriptor(), ...state.userPlaylists];
}

function openLocalPlaylist() {
  state.activePlaylistId = LOCAL_PLAYLIST_ID;
  updateActivePlaylistCard();
  if (!state.playbackPage) enterPlaybackPage();
  if (!state.localPlaylistSongs.length) {
    renderPlaylistShelf(localPlaylistDescriptor(), [], { preserveScroll: false });
    els.localPlaylistInput?.click();
    return;
  }
  renderPlaylistShelf(localPlaylistDescriptor(), state.localPlaylistSongs, { preserveScroll: true });
}

async function importLocalAudioFiles(fileList, options = {}) {
  const files = Array.from(fileList || []);
  const existing = new Set(state.localPlaylistSongs.map((song) => song.localFingerprint));
  let added = 0;
  let skipped = 0;

  files.forEach((file) => {
    if (!isLocalAudioFile(file)) {
      skipped += 1;
      return;
    }
    const fingerprint = localFileFingerprint(file);
    if (existing.has(fingerprint)) {
      skipped += 1;
      return;
    }
    const localUrl = URL.createObjectURL(file);
    const copy = localTrackCopy(file);
    state.localObjectUrls.add(localUrl);
    state.localPlaylistSongs.push({
      id: localFingerprintId(fingerprint),
      ...copy,
      cover: '',
      duration: 0,
      provider: 'local',
      source: 'local',
      localUrl,
      localFingerprint: fingerprint,
      fileName: file.name,
      fileSize: Number(file.size) || 0,
      lastModified: Number(file.lastModified) || 0,
      mimeType: safeText(file.type, ''),
      extension: localAudioExtension(file.name)
    });
    existing.add(fingerprint);
    added += 1;
  });

  renderPlaylistOrbit(playbackPlaylists());
  if (added > 0 && options.openShelf !== false) {
    state.activePlaylistId = LOCAL_PLAYLIST_ID;
    if (!state.playbackPage) enterPlaybackPage();
    renderPlaylistShelf(localPlaylistDescriptor(), state.localPlaylistSongs);
  }
  if (options.silent !== true) {
    if (added > 0) toast(`已导入 ${added} 首本地歌曲${skipped ? `，跳过 ${skipped} 个重复或非音频文件` : ''}`);
    else toast(files.length ? '没有可新增的本地音频文件' : '未选择本地歌曲');
  }
  return { added, skipped, songs: state.localPlaylistSongs };
}

function revokeLocalObjectUrls() {
  state.localObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.localObjectUrls.clear();
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
  if (els.updateProgressBar) els.updateProgressBar.style.transform = `scaleX(${(next / 100).toFixed(3)})`;
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
  if (document.hidden || !state.update.progressId) return;
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
  const profile = payload && payload.profile ? payload.profile : {};
  const nestedProfile = account && account.profile ? account.profile : {};
  return safeText(
    account.nickname
      || account.nick
      || account.username
      || account.userName
      || account.name
      || profile.nickname
      || profile.username
      || nestedProfile.nickname
      || nestedProfile.username
      || account.userId,
    ''
  );
}

function accountAvatar(payload) {
  const account = payload && payload.account ? payload.account : {};
  const profile = payload && payload.profile ? payload.profile : {};
  const nestedProfile = account && account.profile ? account.profile : {};
  let raw = safeText(
    account.avatarUrl
      || account.avatar
      || account.headimg
      || account.pic
      || account.headPic
      || profile.avatarUrl
      || profile.avatar
      || profile.headimg
      || profile.pic
      || nestedProfile.avatarUrl
      || nestedProfile.avatar,
    ''
  );
  const qqUserId = safeText(account.userId || account.uin || account.qq, '');
  if (!raw && payload && payload.provider === 'qq' && /^[1-9]\d{4,}$/.test(qqUserId)) {
    raw = `https://q.qlogo.cn/headimg_dl?dst_uin=${encodeURIComponent(qqUserId)}&spec=140`;
  }
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

function communityBroadcastTime(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function normalizeCommunityBroadcast(payload = {}) {
  const source = payload.announcement || payload.broadcast || payload;
  if (!source || typeof source !== 'object') return null;
  const text = safeText(source.text || source.message || source.content, '').slice(0, 800);
  if (!text) return null;
  return {
    id: safeText(source.id || payload.id, '').slice(0, 80),
    title: safeText(source.title, '\u793e\u533a\u516c\u544a').slice(0, 80),
    text,
    level: safeText(source.level || 'info', 'info').slice(0, 24),
    createdAt: communityBroadcastTime(source.createdAt || payload.createdAt)
  };
}

function communityBroadcastKey(broadcast = {}) {
  return safeText(
    broadcast.id || `${broadcast.createdAt || ''}|${broadcast.title || ''}|${broadcast.text || ''}`,
    ''
  );
}

function renderCommunityBroadcastButton() {
  if (!els.communityBroadcastButton) return;
  const hasBroadcast = !!state.community.broadcastLatest;
  els.communityBroadcastButton.classList.toggle('has-broadcast', hasBroadcast);
  els.communityBroadcastButton.classList.toggle('is-unread', !!state.community.broadcastUnread);
  els.communityBroadcastButton.setAttribute('aria-pressed', String(!!state.community.broadcastUnread));
  els.communityBroadcastButton.title = hasBroadcast
    ? state.community.broadcastLatest.title
    : '\u793e\u533a\u516c\u544a\u5e7f\u64ad';
}

function hideCommunityBroadcastToast() {
  window.clearTimeout(state.community.broadcastToastTimer);
  state.community.broadcastToastTimer = 0;
  if (!els.communityBroadcastToast) return;
  els.communityBroadcastToast.classList.remove('is-visible');
  window.setTimeout(() => {
    if (!els.communityBroadcastToast || els.communityBroadcastToast.classList.contains('is-visible')) return;
    els.communityBroadcastToast.hidden = true;
  }, 180);
}

function renderCommunityBroadcastToast(pinned = false) {
  const broadcast = state.community.broadcastLatest;
  if (!els.communityBroadcastToast || !broadcast) return;
  clearElement(els.communityBroadcastToast);
  const article = document.createElement('article');
  article.className = 'community-broadcast-panel';

  const head = document.createElement('div');
  head.className = 'community-broadcast-head';
  const title = document.createElement('strong');
  title.textContent = broadcast.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.dataset.communityBroadcastAction = 'close';
  close.setAttribute('aria-label', '\u5173\u95ed\u793e\u533a\u516c\u544a');
  close.textContent = '\u00d7';
  head.appendChild(title);
  head.appendChild(close);

  const text = document.createElement('p');
  text.textContent = broadcast.text;
  const meta = document.createElement('small');
  meta.textContent = new Date(broadcast.createdAt).toLocaleString('zh-CN', { hour12: false });

  article.appendChild(head);
  article.appendChild(text);
  article.appendChild(meta);
  els.communityBroadcastToast.appendChild(article);
  els.communityBroadcastToast.hidden = false;
  window.requestAnimationFrame(() => {
    if (els.communityBroadcastToast) els.communityBroadcastToast.classList.add('is-visible');
  });

  window.clearTimeout(state.community.broadcastToastTimer);
  state.community.broadcastToastTimer = pinned ? 0 : window.setTimeout(hideCommunityBroadcastToast, 9000);
}

function showCommunityBroadcast(payload = {}, options = {}) {
  const broadcast = normalizeCommunityBroadcast(payload);
  if (!broadcast) return;
  const key = communityBroadcastKey(broadcast);
  const duplicate = key && key === state.community.broadcastSeenKey;
  state.community.broadcastLatest = broadcast;
  state.community.broadcastSeenKey = key;
  state.community.broadcastUnread = options.unread !== false;
  renderCommunityBroadcastButton();
  if (!duplicate || options.force) renderCommunityBroadcastToast(false);
}

function openCommunityBroadcast() {
  if (!state.community.broadcastLatest) {
    toast('\u6682\u65e0\u793e\u533a\u516c\u544a');
    return;
  }
  state.community.broadcastUnread = false;
  renderCommunityBroadcastButton();
  renderCommunityBroadcastToast(true);
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
    playable: !isLocalSong(song) && !!els.audio.src,
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
  els.communityCard.classList.toggle('is-server-offline', serverFailed);
  els.communityCard.dataset.serverState = serverFailed ? 'offline' : hasCommunityIdentity ? 'online' : 'login-required';
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
    nameText.textContent = serverFailed
      ? '社区离线'
      : loggedIn
        ? displayName || `${provider.label}用户`
        : '登录后启用社区';
    els.communityName.appendChild(nameText);
    const certBadge = createCommunityCertBadge(hasCommunityIdentity ? profile.certification : null);
    if (certBadge) els.communityName.appendChild(certBadge);
  }
  if (els.communityMeta) {
    els.communityMeta.textContent = serverFailed
      ? '服务器未启动或无法连接'
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
  if (els.communityFriendsLabel) {
    els.communityFriendsLabel.textContent = serverFailed ? '服务器离线' : hasCommunityIdentity ? '在线好友' : '好友';
  }
  if (els.communityAddButton) els.communityAddButton.disabled = !hasCommunityIdentity;
  if (els.communitySearchInput) els.communitySearchInput.disabled = !hasCommunityIdentity;
  if (els.communityMarketButton) els.communityMarketButton.disabled = serverFailed;
  if (els.communityBroadcastButton) els.communityBroadcastButton.disabled = serverFailed;
  if (els.communityDndButton) els.communityDndButton.disabled = serverFailed;
  if (els.communityAvatar) els.communityAvatar.setAttribute('aria-disabled', String(serverFailed));
  renderCommunityAvatar(loggedIn ? { ...account, ...(hasCommunityIdentity ? profile : {}) } : {});
  renderCommunityDndButton();
  renderCommunityProfilePanel();
  if (state.community.friendsSignature !== nextFriendsSignature) {
    state.community.friendsSignature = nextFriendsSignature;
    renderCommunityFriends(hasCommunityIdentity ? friends : []);
  }
  if (els.communityMessageButton) els.communityMessageButton.disabled = serverFailed || !hasCommunityIdentity || !friends.length;
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
  if (document.hidden || !els.communityCard || state.community.loading) return null;
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
  if (document.hidden) {
    stopCommunityEventStream(false);
    return;
  }
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
      scheduleCommunityRefresh(80);
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

  if (type === 'announcement.broadcast' || type === 'community.broadcast' || type === 'broadcast.announcement') {
    showCommunityBroadcast(payload);
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
  if (els.communityProfileTitle) {
    els.communityProfileTitle.textContent = state.community.profilePage === 'nearby'
      ? '社区集体'
      : state.community.profilePage === 'market' ? '预设市场' : '个人资料';
  }
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
  const nextPage = ['nearby', 'market'].includes(page) ? page : 'self';
  state.community.profilePage = nextPage;
  const isNearby = nextPage === 'nearby';
  const isMarket = nextPage === 'market';
  if (els.communityProfileSelfTab) els.communityProfileSelfTab.classList.toggle('is-active', !isNearby && !isMarket);
  if (els.communityProfileGroupTab) els.communityProfileGroupTab.classList.toggle('is-active', isNearby);
  if (els.communityProfileMarketTab) els.communityProfileMarketTab.classList.toggle('is-active', isMarket);
  if (els.communityProfileSelfTab) els.communityProfileSelfTab.setAttribute('aria-selected', String(!isNearby && !isMarket));
  if (els.communityProfileGroupTab) els.communityProfileGroupTab.setAttribute('aria-selected', String(isNearby));
  if (els.communityProfileMarketTab) els.communityProfileMarketTab.setAttribute('aria-selected', String(isMarket));
  if (els.communityProfileSelfPage) {
    els.communityProfileSelfPage.hidden = isNearby || isMarket;
    els.communityProfileSelfPage.classList.toggle('is-active', !isNearby && !isMarket);
  }
  if (els.communityProfileNearbyPage) {
    els.communityProfileNearbyPage.hidden = !isNearby;
    els.communityProfileNearbyPage.classList.toggle('is-active', isNearby);
  }
  if (els.communityProfileMarketPage) {
    els.communityProfileMarketPage.hidden = !isMarket;
    els.communityProfileMarketPage.classList.toggle('is-active', isMarket);
  }
  if (els.communityProfileTitle) {
    els.communityProfileTitle.textContent = isNearby ? '社区集体' : isMarket ? '创作市场' : '个人资料';
  }
  if (isNearby && options.refresh !== false) refreshCommunityNearby().catch(() => {});
  if (isMarket && options.refresh !== false) refreshPresetMarket().catch(() => {});
}

function setCommunityProfileOpen(open, page = state.community.profilePage) {
  if (!els.communityProfileDialog) return;
  state.community.profileOpen = !!open;
  els.communityProfileDialog.hidden = !state.community.profileOpen;
  if (els.communityMarketButton) {
    els.communityMarketButton.setAttribute('aria-expanded', String(state.community.profileOpen && page === 'market'));
  }
  if (state.community.profileOpen) {
    setCommunityProfilePage(page, { refresh: page === 'nearby' || page === 'market' });
    renderCommunityProfilePanel();
    if (els.communityProfileBio && page === 'self') els.communityProfileBio.focus();
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

function marketPresetColor(item = {}) {
  if (item.kind === 'component') return safeText(item.component?.color, '#83e4ff');
  const preset = item.preset && typeof item.preset === 'object' ? item.preset : {};
  const first = Array.isArray(preset.sceneItems) ? preset.sceneItems[0] : null;
  return safeText(first?.component?.color, '#83e4ff');
}

function marketItemKind(item = {}) {
  return item.kind === 'component' ? 'component' : 'preset';
}

function marketItemPreviewUrl(item = {}) {
  const component = marketItemKind(item) === 'component'
    ? item.component
    : Array.isArray(item.preset?.sceneItems) ? item.preset.sceneItems[0]?.component : null;
  return sandboxAssetUrl(component?.asset?.previewUrl);
}

function renderPresetMarket() {
  if (!els.communityMarketList) return;
  clearElement(els.communityMarketList);
  els.communityMarketList.setAttribute('aria-busy', String(state.community.marketLoading));
  if (els.communityMarketMeta) {
    els.communityMarketMeta.textContent = state.community.marketLoading
      ? '正在同步预设市场'
      : `${state.community.marketItems.length} 个可预览组件与预设`;
  }
  if (state.community.marketLoading) {
    for (let index = 0; index < 3; index += 1) {
      const loading = document.createElement('span');
      loading.className = 'community-market-skeleton';
      loading.setAttribute('aria-hidden', 'true');
      els.communityMarketList.appendChild(loading);
    }
    return;
  }
  if (!state.community.marketItems.length) {
    const empty = document.createElement('span');
    empty.className = 'community-empty';
    empty.textContent = '市场里还没有匹配的组件或预设，先从沙盒上传一个吧';
    els.communityMarketList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.community.marketItems.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'community-market-item';
    card.style.setProperty('--market-preset-color', marketPresetColor(item));
    const visual = document.createElement('span');
    visual.className = 'community-market-visual';
    const previewUrl = marketItemPreviewUrl(item);
    if (previewUrl) {
      visual.classList.add('has-image');
      visual.style.backgroundImage = `linear-gradient(180deg, transparent 54%, rgba(2, 4, 5, 0.74)), url("${previewUrl.replace(/"/g, '%22')}")`;
    }
    const copy = document.createElement('span');
    copy.className = 'community-market-copy';
    const title = document.createElement('strong');
    const kind = marketItemKind(item);
    title.textContent = safeText(item.title, kind === 'component' ? '未命名组件' : '未命名预设');
    const author = document.createElement('small');
    author.textContent = `创作者 · ${safeText(item.author?.name, 'FE 创作者')}`;
    const description = document.createElement('p');
    description.textContent = safeText(item.description, kind === 'component' ? '可预览并保存到沙盒组件库' : '可预览并保存到 DIY 预设页');
    const tags = document.createElement('span');
    tags.className = 'community-market-tags';
    const kindTag = document.createElement('small');
    kindTag.className = 'is-kind';
    kindTag.textContent = kind === 'component' ? '组件' : '预设';
    tags.appendChild(kindTag);
    const tagValues = Array.isArray(item.tags) ? item.tags.slice(0, 5) : [];
    if (tagValues.length) {
      tagValues.forEach((value) => {
        const tag = document.createElement('small');
        tag.textContent = `#${safeText(value, '')}`;
        tags.appendChild(tag);
      });
    } else {
      const meta = document.createElement('small');
      const count = kind === 'component' ? 1 : Array.isArray(item.preset?.sceneItems) ? item.preset.sceneItems.length : 0;
      meta.textContent = kind === 'component' ? `${safeText(item.component?.category, '3d').toUpperCase()} 组件` : `${count} 个场景组件`;
      tags.appendChild(meta);
    }
    const actions = document.createElement('span');
    actions.className = 'community-market-actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.dataset.previewMarketItem = safeText(item.id, '');
    preview.textContent = '预览';
    const download = document.createElement('button');
    download.type = 'button';
    download.dataset.downloadMarketItem = safeText(item.id, '');
    download.textContent = `${kind === 'component' ? '下载组件' : '下载预设'}${Number(item.downloads) ? ` · ${Number(item.downloads)}` : ''}`;
    copy.appendChild(title);
    copy.appendChild(author);
    copy.appendChild(description);
    copy.appendChild(tags);
    card.appendChild(visual);
    card.appendChild(copy);
    actions.appendChild(preview);
    actions.appendChild(download);
    card.appendChild(actions);
    fragment.appendChild(card);
  });
  els.communityMarketList.appendChild(fragment);
}

async function refreshPresetMarket() {
  window.clearTimeout(state.community.marketRefreshTimer);
  state.community.marketRefreshTimer = 0;
  state.community.marketLoading = true;
  renderPresetMarket();
  try {
    let payload;
    try {
      payload = await apiJson(`/api/creative-market?${query({ q: state.community.marketQuery })}`);
    } catch (error) {
      payload = await apiJson(`/api/preset-market?${query({ q: state.community.marketQuery })}`);
    }
    state.community.marketItems = Array.isArray(payload.items) ? payload.items : [];
  } catch (error) {
    state.community.marketItems = [];
    if (els.communityMarketMeta) els.communityMarketMeta.textContent = error.message || '预设市场读取失败';
  } finally {
    state.community.marketLoading = false;
    renderPresetMarket();
  }
}

function schedulePresetMarketRefresh() {
  window.clearTimeout(state.community.marketRefreshTimer);
  state.community.marketRefreshTimer = window.setTimeout(() => {
    refreshPresetMarket().catch(() => {});
  }, 180);
}

function marketTagsForPreset(preset = {}) {
  const tags = new Set();
  const items = Array.isArray(preset.sceneItems) ? preset.sceneItems : [];
  items.forEach((item) => {
    const component = item && item.component ? item.component : {};
    if (component.category === 'particle') tags.add('粒子');
    if (component.category === '2d') tags.add('2D');
    if (component.category === '3d') tags.add('3D');
    if (component.motion === 'music') tags.add('音乐响应');
  });
  return Array.from(tags).slice(0, 5);
}

async function publishSandboxPreset(id) {
  const preset = state.sandbox.presets.find((item) => item.id === id);
  if (!preset || ['built-in', 'market'].includes(preset.source)) return;
  const profile = state.community.profile || {};
  try {
    const payload = await apiJson('/api/preset-market/upload', {
      method: 'POST',
      body: JSON.stringify({
        presetId: preset.id,
        title: preset.name,
        description: `${preset.sceneItems.length} 个组件 · 可直接应用到沙盒场景`,
        tags: marketTagsForPreset(preset),
        author: {
          id: safeText(profile.feId, ''),
          name: communityProfileDisplayName()
        }
      })
    });
    state.community.marketItems = Array.isArray(payload.items) ? payload.items : state.community.marketItems;
    toast(`${preset.name} 已上传到预设市场`);
    if (state.community.profileOpen) setCommunityProfilePage('market', { refresh: false });
    renderPresetMarket();
  } catch (error) {
    toast(error.message || '上传预设失败');
  }
}

async function downloadMarketPreset(id) {
  if (!id) return;
  try {
    const payload = await apiJson('/api/preset-market/download', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    const preset = normalizeSandboxPreset(payload.preset || {});
    state.sandbox.presets = Array.isArray(payload.presets) ? payload.presets.map(normalizeSandboxPreset) : state.sandbox.presets;
    state.sandbox.presetFolder = safeText(payload.folder, state.sandbox.presetFolder);
    saveSandboxPresets();
    renderSandboxPresets();
    state.community.marketItems = state.community.marketItems.map((item) => (
      item.id === id ? { ...item, downloads: Number(item.downloads || 0) + 1 } : item
    ));
    renderPresetMarket();
    setCommunityProfileOpen(false);
    setSandboxOpen(true);
    loadSandboxPreset(preset.id);
    toast(`${preset.name} 已下载并应用`);
  } catch (error) {
    toast(error.message || '下载预设失败');
  }
}

function marketItemById(id) {
  return state.community.marketItems.find((item) => item.id === id) || null;
}

function previewMarketItem(id) {
  const item = marketItemById(id);
  if (!item) return;
  setCommunityProfileOpen(false);
  setSandboxOpen(true);
  if (marketItemKind(item) === 'component') {
    const component = normalizeSandboxComponent(item.component || {}, { source: 'market-preview' });
    state.sandbox.selectedLibraryId = component.id;
    setSandboxTab('generator');
    writeSandboxComponentForm(component);
    setSandboxStageStatus(`${component.name} 正在组件预览中，下载后会保存到组件库`);
    return;
  }
  const preset = normalizeSandboxPreset(item.preset || {});
  state.sandbox.codexDraft = null;
  setSandboxCodexDecisionsVisible(false);
  state.sandbox.sceneName = preset.name;
  state.sandbox.sceneItems = preset.sceneItems.map((sceneItem) => normalizeSandboxSceneItem({ ...sceneItem, id: sandboxId('scene-item') }));
  state.sandbox.selectedId = '';
  if (els.sandboxSceneName) els.sandboxSceneName.value = preset.name;
  rebuildSandboxSceneMeshes();
  renderSandboxSceneList();
  setSandboxStageStatus(`${preset.name} 正在场景预览中，下载后会保存到 DIY 预设页`);
}

async function downloadMarketComponent(id) {
  try {
    const payload = await apiJson('/api/component-market/download', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    const component = normalizeSandboxComponent(payload.component || {}, { source: 'market' });
    mergeSandboxComponents(Array.isArray(payload.components) ? payload.components : [
      component,
      ...state.sandbox.components.filter((item) => item.id !== component.id)
    ]);
    state.community.marketItems = state.community.marketItems.map((item) => (
      item.id === id ? { ...item, downloads: Number(item.downloads || 0) + 1 } : item
    ));
    renderPresetMarket();
    setCommunityProfileOpen(false);
    setSandboxOpen(true);
    setSandboxTab('library');
    state.sandbox.selectedLibraryId = component.id;
    renderSandboxLibrary();
    toast(`${component.name} 已保存到沙盒组件库`);
  } catch (error) {
    toast(error.message || '下载组件失败');
  }
}

function downloadMarketItem(id) {
  const item = marketItemById(id);
  if (!item) return;
  if (marketItemKind(item) === 'component') {
    downloadMarketComponent(id);
  } else {
    downloadMarketPreset(id);
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
  if (document.hidden || !state.community.selectedFriendId || els.communityMessageDialog.hidden) return;
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
  if (document.hidden || !(state.community.profile && state.community.profile.feId)) return;
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
  if (document.hidden || !(state.community.profile && state.community.profile.feId)) return;
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
  if (els.qishuiPhoneInput) els.qishuiPhoneInput.value = '';
  if (els.qishuiCodeInput) els.qishuiCodeInput.value = '';
  els.loginDialog.hidden = true;
  els.loginButton.setAttribute('aria-expanded', 'false');
  els.loginRefresh.disabled = false;
}

function providerInfo(provider = state.activeProvider) {
  const id = safeText(provider, 'netease');
  return state.providers[id] || MUSIC_PROVIDERS[id] || MUSIC_PROVIDERS.netease;
}

function providerConfigured(provider = state.activeProvider) {
  const info = providerInfo(provider);
  return info.enabled !== false && info.configured !== false;
}

function setMusicApiImportStatus(message) {
  if (els.musicApiImportStatus) els.musicApiImportStatus.textContent = safeText(message, '可导入 JSON 配置或受信任的 ZIP API 包');
}

function setQishuiPhoneStatus(message) {
  if (els.qishuiPhoneStatus) els.qishuiPhoneStatus.textContent = safeText(message, '请输入手机号获取验证码');
}

function clearQishuiPhoneCooldownTimer() {
  window.clearInterval(state.qishuiPhoneCooldownTimer);
  state.qishuiPhoneCooldownTimer = 0;
}

function syncQishuiPhoneControls() {
  const remaining = Math.max(0, Math.ceil((state.qishuiPhoneCooldownUntil - Date.now()) / 1000));
  const busy = state.qishuiPhoneSending || state.qishuiPhoneVerifying;
  if (els.qishuiPhoneInput) els.qishuiPhoneInput.disabled = busy;
  if (els.qishuiCodeInput) els.qishuiCodeInput.disabled = busy;
  if (els.qishuiSendCodeButton) {
    els.qishuiSendCodeButton.disabled = state.qishuiPhoneSending || remaining > 0;
    els.qishuiSendCodeButton.textContent = state.qishuiPhoneSending
      ? '发送中'
      : remaining > 0
        ? `${remaining} 秒后重发`
        : '获取验证码';
  }
  if (els.qishuiLoginButton) {
    els.qishuiLoginButton.disabled = busy;
    els.qishuiLoginButton.textContent = state.qishuiPhoneVerifying ? '登录中…' : '登录汽水音乐';
  }
  if (els.qishuiGuestButton) els.qishuiGuestButton.disabled = busy;
  if (!remaining && state.qishuiPhoneCooldownTimer) clearQishuiPhoneCooldownTimer();
}

function startQishuiPhoneCooldown(seconds = 60) {
  state.qishuiPhoneCooldownUntil = Date.now() + clamp(Number(seconds) || 60, 1, 300) * 1000;
  clearQishuiPhoneCooldownTimer();
  syncQishuiPhoneControls();
  state.qishuiPhoneCooldownTimer = window.setInterval(syncQishuiPhoneControls, 500);
}

function syncLoginMethod(provider = state.activeProvider) {
  const phoneLogin = providerInfo(provider).id === 'qishui';
  if (els.qishuiPhoneLogin) els.qishuiPhoneLogin.hidden = !phoneLogin;
  if (els.qrLoginStage) els.qrLoginStage.hidden = phoneLogin;
  if (phoneLogin) syncQishuiPhoneControls();
}

function qishuiPhoneValue() {
  return safeText(els.qishuiPhoneInput?.value, '').replace(/\D/g, '').slice(0, 11);
}

function qishuiCodeValue() {
  return safeText(els.qishuiCodeInput?.value, '').replace(/\D/g, '').slice(0, 6);
}

function enterQishuiGuestMode() {
  if (!setActiveProvider('qishui')) return;
  state.qishuiGuestMode = true;
  state.loginLoggedIn = false;
  state.playlistsLoggedIn = false;
  state.userPlaylists = [];
  renderLoginStatus({ provider: 'qishui', loggedIn: false, account: null });
  renderCommunityState({ provider: 'qishui', loggedIn: false, account: null });
  renderPlaylistOrbit(playbackPlaylists());
  closeLoginDialog();
  toast('已进入汽水音乐访客模式：可搜索播放公开免费歌曲，账号歌单、社区和会员歌曲不可用');
  window.requestAnimationFrame(() => els.searchInput?.focus());
}

async function sendQishuiPhoneCode() {
  if (state.qishuiPhoneSending || state.qishuiPhoneVerifying) return;
  if (state.qishuiPhoneCooldownUntil > Date.now()) {
    syncQishuiPhoneControls();
    return;
  }
  const phone = qishuiPhoneValue();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    setQishuiPhoneStatus('请输入有效的中国大陆 11 位手机号');
    els.qishuiPhoneInput?.focus();
    return;
  }
  state.qishuiPhoneSending = true;
  syncQishuiPhoneControls();
  setQishuiPhoneStatus('正在请求汽水音乐发送验证码…');
  try {
    const payload = await apiJson('/api/qishui/login/phone/send', {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
    if (payload?.ok !== true || payload?.sent !== true) {
      throw new Error(payload?.error || '汽水音乐未确认验证码已发送，请稍后重试');
    }
    const retryAfter = Number(payload.cooldownSeconds ?? payload.retryAfterSeconds ?? payload.retryAfter ?? payload.data?.retryAfter ?? 60);
    startQishuiPhoneCooldown(retryAfter);
    setQishuiPhoneStatus(payload.message || '验证码已发送，请查看短信');
    els.qishuiCodeInput?.focus();
  } catch (error) {
    const payload = error?.payload && typeof error.payload === 'object' ? error.payload : {};
    const rateLimited = error?.status === 429
      || error?.code === 'UPSTREAM_RATE_LIMITED'
      || error?.code === 'SEND_COOLDOWN';
    if (rateLimited) {
      const retryAfter = Number(
        payload.retryAfterSeconds
        ?? payload.cooldownSeconds
        ?? payload.retryAfter
        ?? payload.data?.retryAfter
        ?? 60
      );
      startQishuiPhoneCooldown(retryAfter);
    }
    setQishuiPhoneStatus(error.message || '验证码发送失败，请稍后重试');
  } finally {
    state.qishuiPhoneSending = false;
    syncQishuiPhoneControls();
  }
}

async function verifyQishuiPhoneLogin(event) {
  event?.preventDefault?.();
  if (state.qishuiPhoneSending || state.qishuiPhoneVerifying) return;
  const phone = qishuiPhoneValue();
  const code = qishuiCodeValue();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    setQishuiPhoneStatus('请输入有效的中国大陆 11 位手机号');
    els.qishuiPhoneInput?.focus();
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    setQishuiPhoneStatus('请输入短信中的 6 位验证码');
    els.qishuiCodeInput?.focus();
    return;
  }
  state.qishuiPhoneVerifying = true;
  syncQishuiPhoneControls();
  setQishuiPhoneStatus('正在验证并建立本机会话…');
  try {
    const payload = await apiJson('/api/qishui/login/phone/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code })
    });
    if (els.qishuiCodeInput) els.qishuiCodeInput.value = '';
    const account = await refreshLoginStatus('qishui');
    const loggedIn = account.loggedIn === true || payload.loggedIn === true || payload.success === true;
    if (loggedIn && !account.loggedIn) {
      renderLoginStatus({ ...payload, provider: 'qishui', loggedIn: true, account: payload.account || {} });
    }
    if (!loggedIn) throw new Error(payload.message || '验证码已通过，但汽水音乐未返回有效会话');
    setQishuiPhoneStatus(payload.message || '登录成功，正在同步账号');
    await refreshUserPlaylists().catch(() => {});
    window.setTimeout(closeLoginDialog, 500);
  } catch (error) {
    setQishuiPhoneStatus(error.message || '登录失败，请检查验证码后重试');
  } finally {
    state.qishuiPhoneVerifying = false;
    syncQishuiPhoneControls();
  }
}

function syncMusicApiProviderTabs() {
  if (!els.loginProviderTabs) return;
  els.loginProviderTabs.querySelectorAll('[data-login-provider]').forEach((tab) => {
    const configured = providerConfigured(tab.dataset.loginProvider);
    tab.classList.toggle('is-unconfigured', !configured);
    tab.removeAttribute('aria-disabled');
  });
}

function mergeMusicApiProviders(payload = {}) {
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  providers.forEach((item) => {
    const id = safeText(item && item.id, '');
    if (!id || !MUSIC_PROVIDERS[id]) return;
    state.providers[id] = {
      ...state.providers[id],
      label: safeText(item.label, state.providers[id].label),
      appName: safeText(item.appName, state.providers[id].appName),
      apiUrl: safeText(item.baseUrl, state.providers[id].apiUrl),
      enabled: item.enabled !== false,
      configured: item.configured !== false,
      loginQr: item.loginQr === undefined ? state.providers[id].loginQr !== false : item.loginQr !== false,
      apiStatus: safeText(item.status, '')
    };
  });
  syncMusicApiProviderTabs();
  if (!providerConfigured(state.activeProvider)) {
    clearLoginQrTimer();
    state.loginQrRequestId += 1;
    state.loginQrLoading = false;
    const fallback = Object.keys(MUSIC_PROVIDERS).find((provider) => providerConfigured(provider));
    if (fallback) setActiveProvider(fallback, { reloadQr: !els.loginDialog.hidden });
  }
  return providers;
}

async function refreshMusicApiProviders(options = {}) {
  try {
    const payload = await apiJson('/api/music-apis');
    mergeMusicApiProviders(payload);
    return payload;
  } catch (error) {
    if (!options.silent) setMusicApiImportStatus(error.message || '音乐 API 配置读取失败');
    return { ok: false, providers: [] };
  }
}

async function importMusicApiFile(file) {
  if (!file || state.musicApiImporting) return;
  const isZip = /\.zip$/i.test(file.name || '') || /zip/i.test(file.type || '');
  const maximum = isZip ? 25 * 1024 * 1024 : 64 * 1024;
  if (file.size > maximum) {
    setMusicApiImportStatus(isZip ? 'ZIP 包不能超过 25 MB' : 'API 配置不能超过 64 KB');
    return;
  }
  if (isZip && !window.confirm('ZIP API 包会在本机运行其中的服务代码。仅导入你信任的来源，是否继续？')) {
    setMusicApiImportStatus('已取消导入未确认的 ZIP 包');
    return;
  }

  state.musicApiImporting = true;
  if (els.musicApiImportButton) els.musicApiImportButton.disabled = true;
  setMusicApiImportStatus(`正在解析 ${safeText(file.name, 'API 文件')}`);
  try {
    const payload = await apiJson(`/api/music-apis/import?${query({
      name: file.name || (isZip ? 'music-api.zip' : 'music-api.json'),
      trusted: String(isZip)
    })}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-FE-Monster-Import': '1'
      },
      body: file
    });
    if (payload?.ok === false) throw new Error(payload.error || '音乐 API 导入失败');
    mergeMusicApiProviders(payload);
    const imported = Array.isArray(payload.importedProviders) ? payload.importedProviders : [];
    const importedId = safeText(imported[0]?.id || imported[0], '');
    setMusicApiImportStatus(imported.length
      ? `已识别并启用：${imported.map((item) => safeText(item?.label || item?.id || item, '')).filter(Boolean).join('、')}`
      : 'API 配置已导入');
    await refreshMusicApiProviders({ silent: true });
    if (importedId && providerConfigured(importedId)) {
      setActiveProvider(importedId, { reloadQr: true });
    }
    toast('音乐 API 已导入并应用');
  } catch (error) {
    setMusicApiImportStatus(error.message || '音乐 API 导入失败');
  } finally {
    state.musicApiImporting = false;
    if (els.musicApiImportButton) els.musicApiImportButton.disabled = false;
    if (els.musicApiImportInput) els.musicApiImportInput.value = '';
  }
}

function providerPath(path, provider = state.activeProvider) {
  return `/api/${providerInfo(provider).id}${path}`;
}

function syncAndroidLoginWorkflow(provider = state.activeProvider) {
  if (!ANDROID_CLIENT || !els.androidLoginWorkflow) return;
  const info = providerInfo(provider);
  els.androidLoginWorkflow.hidden = false;
  if (els.androidQrHelp) {
    els.androidQrHelp.textContent = `保存二维码后，打开${info.appName}，进入扫一扫并从相册选择该二维码。`;
  }
  if (els.androidMusicAppButton) {
    const canOpenApp = !!ANDROID_MUSIC_APP_URIS[info.id];
    els.androidMusicAppButton.textContent = canOpenApp ? `打开${info.label}` : `请手动打开${info.label}`;
    els.androidMusicAppButton.disabled = !canOpenApp;
  }
}

async function saveAndroidLoginQr() {
  if (!ANDROID_CLIENT || !els.qrImage || !els.androidQrSaveButton) return;
  const source = els.qrImage.currentSrc || els.qrImage.getAttribute('src') || '';
  if (!source) {
    setQrStatus('二维码尚未生成，请稍后重试');
    return;
  }
  els.androidQrSaveButton.disabled = true;
  try {
    if (typeof window.feMonsterAndroidSaveBlob !== 'function') throw new Error('Android 保存能力不可用');
    const response = await fetch(source, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`二维码读取失败 (${response.status})`);
    const blob = await response.blob();
    const provider = providerInfo().id;
    await window.feMonsterAndroidSaveBlob(blob, `fe-monster-${provider}-login-qr.png`);
    setQrStatus('二维码已保存；请在音乐 App 的扫一扫中从相册选择');
    toast('登录二维码已保存到手机');
  } catch (error) {
    setQrStatus(error.message || '二维码保存失败，请重试');
  } finally {
    els.androidQrSaveButton.disabled = !els.qrImage.getAttribute('src');
  }
}

function openAndroidMusicApp() {
  if (!ANDROID_CLIENT) return;
  const provider = providerInfo().id;
  const uri = ANDROID_MUSIC_APP_URIS[provider];
  if (!uri) return;
  try {
    if (typeof window.FeMonsterAndroid?.openExternal === 'function') {
      window.FeMonsterAndroid.openExternal(uri);
    } else {
      window.location.href = uri;
    }
    setQrStatus(`已尝试打开${providerInfo(provider).appName}；请选择扫一扫 → 相册`);
  } catch (error) {
    setQrStatus(`无法打开${providerInfo(provider).appName}，请手动打开后从相册扫码`);
  }
}

function playbackQualityProvider(song = state.currentSong) {
  return providerInfo((song && song.provider) || state.activeProvider).id;
}

function qualityDefinitions(provider = playbackQualityProvider()) {
  const id = providerInfo(provider).id;
  return PLAYBACK_QUALITY_OPTIONS[id] || PLAYBACK_QUALITY_OPTIONS.netease;
}

function preferredPlaybackQuality(provider = playbackQualityProvider(), fallback = '') {
  const id = providerInfo(provider).id;
  const preferred = safeText(state.playbackQualityPreferences[id], '');
  if (qualityDefinitions(id).some((option) => option.id === preferred)) return preferred;
  const fallbackQuality = safeText(fallback, '');
  if (qualityDefinitions(id).some((option) => option.id === fallbackQuality)) return fallbackQuality;
  return (qualityDefinitions(id)[0] || { id: 'standard' }).id;
}

function savePlaybackQualityPreference(provider, quality) {
  const id = providerInfo(provider).id;
  if (!qualityDefinitions(id).some((option) => option.id === quality)) return;
  state.playbackQualityPreferences[id] = quality;
  try {
    window.localStorage.setItem(PLAYBACK_QUALITY_PREFS_KEY, JSON.stringify(state.playbackQualityPreferences));
  } catch (error) {
  }
}

function valueLooksVip(value) {
  if (value === true) return true;
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return !!normalized
    && !['0', 'false', 'free', 'normal', 'none', 'null', 'undefined', 'no'].includes(normalized);
}

function accountHasVip(payload = {}) {
  const account = payload.account || {};
  const roots = [payload, account, payload.profile, account.profile].filter(Boolean);
  const keys = [
    'vipType',
    'vip_type',
    'viptype',
    'vip',
    'isVip',
    'isVIP',
    'isVipUser',
    'vipLevel',
    'vip_level',
    'vipToken',
    'vip_token',
    'svip',
    'superVip',
    'musicPackage'
  ];
  return roots.some((root) => keys.some((key) => valueLooksVip(root[key])));
}

function accountVipLabel(payload = {}) {
  if (!accountHasVip(payload)) return '';
  const account = payload.account || {};
  const roots = [payload, account, payload.profile, account.profile].filter(Boolean);
  const superKeys = ['svip', 'superVip', 'isSvip', 'isSVip'];
  if (roots.some((root) => superKeys.some((key) => valueLooksVip(root[key])))) return 'SVIP';
  const labelKeys = ['vipLabel', 'vipName', 'membershipName', 'memberName'];
  for (const root of roots) {
    for (const key of labelKeys) {
      const label = safeText(root[key], '');
      if (label) return label.slice(0, 12);
    }
  }
  const levelKeys = ['vipLevel', 'vip_level', 'level'];
  for (const root of roots) {
    for (const key of levelKeys) {
      const level = Number(root[key]);
      if (Number.isFinite(level) && level > 0 && level <= 10) return `VIP ${Math.round(level)}`;
    }
  }
  return 'VIP';
}

function providerHasPlaybackVip(provider = playbackQualityProvider()) {
  const id = providerInfo(provider).id;
  const payload = state.loginStatusByProvider[id];
  return !!(payload && payload.loggedIn && accountHasVip(payload));
}

function playbackQualityOptions(provider = playbackQualityProvider()) {
  const id = providerInfo(provider).id;
  if (id === 'qishui' && state.qishuiGuestMode) {
    return qualityDefinitions(id).filter((option) => option.id === 'standard');
  }
  const hasVip = providerHasPlaybackVip(provider);
  return qualityDefinitions(provider).filter((option) => !option.vip || hasVip);
}

function normalizePlaybackQuality(provider = playbackQualityProvider(), quality = state.playbackQuality) {
  const options = playbackQualityOptions(provider);
  const preferred = safeText(quality, '');
  const match = options.find((option) => option.id === preferred);
  if (match) return match.id;
  return (options[0] || qualityDefinitions(provider)[0] || { id: 'standard' }).id;
}

function playbackQualityOption(provider = playbackQualityProvider(), quality = state.playbackQuality) {
  const normalized = normalizePlaybackQuality(provider, quality);
  return qualityDefinitions(provider).find((option) => option.id === normalized) || { id: normalized, label: normalized, short: 'HQ' };
}

function updateQualityButton(song = state.currentSong) {
  const controls = [els.dockQualityButton, els.qishuiPlaybackQuality].filter(Boolean);
  if (!controls.length) return;
  if (isLocalSong(song)) {
    controls.forEach((control) => {
      control.disabled = true;
      control.title = '本地文件原始音质';
      control.setAttribute('aria-label', control.title);
      control.setAttribute('aria-expanded', 'false');
      control.classList.remove('is-open');
      control.dataset.quality = 'LOCAL';
      if (control === els.qishuiPlaybackQuality) control.textContent = 'LOCAL';
    });
    return;
  }
  const provider = playbackQualityProvider(song);
  const hasSong = !!(song && (song.id || song.title));
  const quality = normalizePlaybackQuality(provider);
  const option = playbackQualityOption(provider, quality);
  const title = hasSong ? `音质：${option.label}` : '音质';
  controls.forEach((control) => {
    control.disabled = !hasSong;
    control.title = title;
    control.setAttribute('aria-label', title);
    control.setAttribute('aria-expanded', String(state.qualityMenuOpen));
    control.classList.toggle('is-open', state.qualityMenuOpen);
    control.dataset.quality = option.short || option.label || quality;
    if (control === els.qishuiPlaybackQuality) {
      control.textContent = safeText(option.short || option.label, 'HQ');
    }
  });
}

function renderDockQualityMenu() {
  const menus = [els.dockQualityMenu, els.qishuiPlaybackQualityMenu].filter(Boolean);
  if (!menus.length) return;
  const provider = playbackQualityProvider();
  const options = playbackQualityOptions(provider);
  const activeQuality = normalizePlaybackQuality(provider);
  menus.forEach((menu) => {
    clearElement(menu);
    if (menu === els.qishuiPlaybackQualityMenu) {
      const heading = document.createElement('span');
      heading.className = 'qishui-playback-quality-heading';
      heading.textContent = `音质调节 · ${providerInfo(provider).label}`;
      menu.appendChild(heading);
    }
    options.forEach((option) => {
      const button = document.createElement('button');
      button.className = `dock-quality-option${option.id === activeQuality ? ' is-active' : ''}`;
      button.type = 'button';
      button.setAttribute('role', 'menuitemradio');
      button.dataset.quality = option.id;
      button.setAttribute('aria-checked', String(option.id === activeQuality));
      button.dataset.short = safeText(option.short, '');
      button.textContent = option.label;
      menu.appendChild(button);
    });
  });
  updateQualityButton();
}

function setDockQualityMenuOpen(open) {
  const menus = [els.dockQualityMenu, els.qishuiPlaybackQualityMenu].filter(Boolean);
  if (!menus.length) return;
  if (isLocalSong(state.currentSong)) open = false;
  state.qualityMenuOpen = !!open;
  menus.forEach((menu) => {
    menu.hidden = !state.qualityMenuOpen;
  });
  updateQualityButton();
  if (!state.qualityMenuOpen) return;
  renderDockQualityMenu();
  ensureQualityLoginStatus(playbackQualityProvider()).then(() => {
    if (state.qualityMenuOpen) renderDockQualityMenu();
  });
}

async function ensureQualityLoginStatus(provider = playbackQualityProvider()) {
  const id = providerInfo(provider).id;
  if (state.loginStatusByProvider[id]) return state.loginStatusByProvider[id];
  if (state.qualityLoginRequests[id]) return state.qualityLoginRequests[id];
  state.qualityLoginRequests[id] = apiJson(`/api/login/status?${query({ provider: id })}`)
    .then((payload) => {
      state.loginStatusByProvider[id] = payload;
      if (id === state.activeProvider) renderLoginStatus(payload);
      return payload;
    })
    .catch(() => {
      const payload = { provider: id, loggedIn: false, account: {} };
      state.loginStatusByProvider[id] = payload;
      return payload;
    })
    .finally(() => {
      delete state.qualityLoginRequests[id];
    });
  return state.qualityLoginRequests[id];
}

async function selectPlaybackQuality(quality) {
  if (isLocalSong(state.currentSong)) return;
  const provider = playbackQualityProvider();
  const previousQuality = normalizePlaybackQuality(provider, state.playbackQuality);
  const normalized = normalizePlaybackQuality(provider, quality);
  savePlaybackQualityPreference(provider, normalized);
  state.playbackQuality = normalized;
  setDockQualityMenuOpen(false);
  renderDockQualityMenu();
  const song = state.currentSong;
  if (!song || !song.id || !els.audio || !els.audio.src) return;
  const wasPlaying = !els.audio.paused && !els.audio.ended;
  const position = currentPlaybackLyricTime(els.audio.currentTime || 0);
  const loaded = await loadSong({ ...song, provider }, {
    quality: normalized,
    position,
    autoplay: wasPlaying
  });
  if (!loaded && previousQuality !== normalized) {
    state.playbackQuality = previousQuality;
    savePlaybackQualityPreference(provider, previousQuality);
    renderDockQualityMenu();
    await loadSong({ ...song, provider }, {
      quality: previousQuality,
      position,
      autoplay: wasPlaying
    });
  }
}

function setActiveProvider(provider, options = {}) {
  const requestedProvider = safeText(provider, 'netease');
  if (!MUSIC_PROVIDERS[requestedProvider] || !providerConfigured(requestedProvider)) {
    clearLoginQrTimer();
    resetQrImage('请先导入 API');
    setQrStatus(`${safeText(MUSIC_PROVIDERS[requestedProvider]?.label, '该平台')} API 尚未配置，请在上方导入配置或 ZIP 包`);
    setMusicApiImportStatus(`等待导入${safeText(MUSIC_PROVIDERS[requestedProvider]?.label, '音乐')} API`);
    els.musicApiImportButton?.focus();
    return false;
  }
  const nextProvider = providerInfo(requestedProvider).id;
  const changed = state.activeProvider !== nextProvider;
  state.activeProvider = nextProvider;
  const info = providerInfo(nextProvider);
  syncAndroidLoginWorkflow(nextProvider);
  syncLoginMethod(nextProvider);

  if (els.loginTitle) els.loginTitle.textContent = nextProvider === 'qishui'
    ? '汽水音乐'
    : info.loginQr === false
      ? `${info.label} API`
      : `${info.label}\u4e8c\u7ef4\u7801\u767b\u5f55`;
  if (els.loginSubtitle) els.loginSubtitle.textContent = nextProvider === 'qishui'
    ? '免登录可播放公开免费歌曲；手机号登录用于同步账号功能'
    : info.loginQr === false
      ? '\u5df2\u542f\u7528\u641c\u7d22\u4e0e\u64ad\u653e\uff0c\u5f53\u524d API \u5305\u672a\u58f0\u660e\u626b\u7801\u767b\u5f55'
      : `\u4f7f\u7528${info.appName}\u626b\u7801\u786e\u8ba4`;
  if (els.loginProviderTabs) {
    els.loginProviderTabs.querySelectorAll('[data-login-provider]').forEach((tab) => {
      const active = tab.dataset.loginProvider === nextProvider;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
  }
  syncMusicApiProviderTabs();

  if (changed) {
    state.loginQrRequestId += 1;
    state.loginQrLoading = false;
    state.playbackQuality = preferredPlaybackQuality(nextProvider);
    state.loginQrKey = '';
    if (els.qishuiCodeInput) els.qishuiCodeInput.value = '';
    state.userPlaylists = [];
    state.playlistsLoggedIn = false;
    state.playbackPlaylistPickerOpen = false;
    closePlaylistShelf({ resetActive: true, reopenPicker: false });
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
    setDockQualityMenuOpen(false);
    stopCommunityEventStream(true);
    renderPlaylistOrbit(playbackPlaylists());
  }
  if (options.reloadQr && !els.loginDialog.hidden) loadLoginQr();
  refreshLoginStatus(nextProvider);
  if (changed) scheduleUserPlaylistsRefresh(180);
  syncQishuiPlaybackCard();
  return true;
}

function renderLoginStatus(payload = {}) {
  const loggedIn = !!payload.loggedIn;
  const provider = providerInfo(payload.provider || state.activeProvider);
  if (provider.id === 'qishui' && loggedIn) state.qishuiGuestMode = false;
  const guest = provider.id === 'qishui' && !loggedIn && state.qishuiGuestMode;
  const vip = loggedIn && accountHasVip(payload);
  state.loginStatusByProvider[provider.id] = payload;
  if (playbackCardVisible() && playbackCardProvider(playbackCardSong()).id === provider.id) {
    renderQishuiPlaybackIdentity(provider);
  }
  if (provider.id !== state.activeProvider) return;
  state.loginLoggedIn = loggedIn;
  els.loginButton.classList.toggle('is-logged-in', loggedIn);
  els.loginButton.classList.toggle('has-vip', vip);
  els.loginLabel.textContent = loggedIn
    ? accountName(payload) || `${provider.label}\u5df2\u767b\u5f55`
    : guest
      ? `${provider.label} · 访客`
      : `${provider.label}\u767b\u5f55`;
  if (els.loginVipBadge) els.loginVipBadge.hidden = !vip;
  els.loginButton.setAttribute('aria-label', loggedIn
    ? `${provider.label}\u5df2\u767b\u5f55\uff1a${els.loginLabel.textContent}${vip ? '\uff0cVIP\u4f1a\u5458' : ''}`
    : provider.id === 'qishui'
      ? guest
        ? '汽水音乐访客模式，打开账号登录'
        : '打开汽水音乐访客或手机号登录'
      : `\u6253\u5f00${provider.label}\u4e8c\u7ef4\u7801\u767b\u5f55`);
  if (provider.id === playbackQualityProvider()) {
    state.playbackQuality = normalizePlaybackQuality(provider.id, preferredPlaybackQuality(provider.id, state.playbackQuality));
  }
  renderLoginAvatar(payload, loggedIn);
  renderDockQualityMenu();
}

const LOGIN_STATUS_RETRY_DELAYS = Object.freeze([320, 700, 1400, 2600]);

function loginStatusNeedsRetry(payload = {}) {
  const code = safeText(payload.code, '').toUpperCase();
  const gatewayState = safeText(payload.gatewayState || payload.status, '').toLowerCase();
  return payload.retryable === true
    || gatewayState === 'starting'
    || code.includes('STARTING');
}

function clearLoginStatusRetry(provider = state.activeProvider) {
  const id = providerInfo(provider).id;
  window.clearTimeout(state.loginStatusRetryTimers[id]);
  delete state.loginStatusRetryTimers[id];
  delete state.loginStatusRetryAttempts[id];
}

function scheduleLoginStatusRetry(provider = state.activeProvider) {
  const id = providerInfo(provider).id;
  if (state.loginStatusRetryTimers[id]) return;
  const attempt = Math.max(0, Number(state.loginStatusRetryAttempts[id]) || 0);
  if (attempt >= LOGIN_STATUS_RETRY_DELAYS.length) return;
  state.loginStatusRetryAttempts[id] = attempt + 1;
  state.loginStatusRetryTimers[id] = window.setTimeout(() => {
    delete state.loginStatusRetryTimers[id];
    refreshLoginStatus(id);
  }, LOGIN_STATUS_RETRY_DELAYS[attempt]);
}

async function refreshLoginStatus(provider = state.activeProvider) {
  const id = providerInfo(provider).id;
  try {
    const payload = await apiJson(`/api/login/status?${query({ provider: id })}`);
    const retryable = loginStatusNeedsRetry(payload);
    renderLoginStatus(payload);
    if (payload.loggedIn || !retryable) clearLoginStatusRetry(id);
    else scheduleLoginStatusRetry(id);
    if (id !== state.activeProvider) return payload;
    if (payload.loggedIn) scheduleCommunityRefresh(120);
    else renderCommunityState({ provider: id, loggedIn: false, account: payload.account || {} });
    return payload;
  } catch (error) {
    const previous = state.loginStatusByProvider[id];
    if (!previous?.loggedIn) renderLoginStatus({ provider: id, loggedIn: false });
    scheduleLoginStatusRetry(id);
    if (id === state.activeProvider && !previous?.loggedIn) {
      renderCommunityState({ provider: id, loggedIn: false });
    }
    return previous?.loggedIn ? previous : { provider: id, loggedIn: false };
  }
}

function resetQrImage(message = '\u751f\u6210\u4e8c\u7ef4\u7801') {
  els.qrImage.removeAttribute('src');
  els.qrShell.classList.remove('has-qr');
  els.qrPlaceholder.textContent = message;
  if (els.androidQrSaveButton) els.androidQrSaveButton.disabled = true;
}

function showLoginDialog() {
  els.loginDialog.hidden = false;
  els.loginButton.setAttribute('aria-expanded', 'true');
  setActiveProvider(state.activeProvider);
  loadLoginQr();
  refreshMusicApiProviders({ silent: true });
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
  if (document.hidden || !state.loginQrKey) return;
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
  const requestId = ++state.loginQrRequestId;
  const provider = state.activeProvider;
  const info = providerInfo(provider);
  if (!providerConfigured(provider)) {
    clearLoginQrTimer();
    resetQrImage('请先导入 API');
    setQrStatus(`${info.label} API 尚未配置，请在上方导入配置或 ZIP 包`);
    return;
  }
  if (provider === 'qishui') {
    clearLoginQrTimer();
    state.loginQrKey = '';
    syncLoginMethod(provider);
    setQishuiPhoneStatus(state.loginStatusByProvider.qishui?.loggedIn
      ? '汽水音乐已登录，可重新验证以切换账号'
      : state.qishuiGuestMode
        ? '当前为访客模式；需要同步账号时可使用手机号登录'
        : '可免登录进入访客模式，或输入手机号获取验证码');
    syncQishuiPhoneControls();
    return;
  }
  if (info.loginQr === false) {
    clearLoginQrTimer();
    state.loginQrKey = '';
    resetQrImage('API 已启用');
    setQrStatus(`${info.label} API 已启用，可搜索播放；当前 API 包未声明扫码登录能力`);
    els.loginRefresh.disabled = false;
    return;
  }
  state.loginQrLoading = true;
  clearLoginQrTimer();
  state.loginQrKey = '';
  resetQrImage('\u751f\u6210\u4e8c\u7ef4\u7801');
  setQrStatus(`\u6b63\u5728\u8fde\u63a5${info.label}\u7b2c\u4e09\u65b9 API`);
  els.loginRefresh.disabled = true;

  try {
    const keyPayload = await apiJson(providerPath('/login/qr/key', provider));
    if (requestId !== state.loginQrRequestId || provider !== state.activeProvider) return;
    const key = loginQrKeyValue(keyPayload);
    if (!key) throw new Error(keyPayload.error || `\u672a\u83b7\u53d6\u5230${info.label}\u4e8c\u7ef4\u7801 key`);

    state.loginQrKey = key;
    let qrImage = loginQrImage(keyPayload);
    if (!qrImage) {
      const qrPayload = await apiJson(`${providerPath('/login/qr/create', provider)}?${query({ key, qrimg: 'true' })}`);
      if (requestId !== state.loginQrRequestId || provider !== state.activeProvider) return;
      qrImage = loginQrImage(qrPayload);
      if (!qrImage) throw new Error(qrPayload.error || `\u672a\u83b7\u53d6\u5230${info.label}\u4e8c\u7ef4\u7801\u56fe\u7247`);
    }

    els.qrImage.src = qrImage;
    els.qrShell.classList.add('has-qr');
    if (els.androidQrSaveButton) els.androidQrSaveButton.disabled = false;
    setQrStatus(`\u7b49\u5f85${info.appName}\u626b\u7801`);
    state.loginQrTimer = window.setInterval(checkLoginQr, 1800);
    checkLoginQr();
  } catch (error) {
    if (requestId !== state.loginQrRequestId || provider !== state.activeProvider) return;
    resetQrImage('\u670d\u52a1\u672a\u5c31\u7eea');
    setQrStatus(loginQrFailureMessage(error, provider));
  } finally {
    if (requestId === state.loginQrRequestId) {
      state.loginQrLoading = false;
      els.loginRefresh.disabled = false;
    }
  }
}

function hidePlaylistOrbit() {
  els.playlistOrbit.hidden = true;
  clearElement(els.playlistCards);
  els.playlistStatus.textContent = `${providerInfo().label}\u6b4c\u5355`;
  state.playlistSignature = '';
  closePlaylistShelf({ resetActive: true, reopenPicker: false });
}

function playlistSubtitle(playlist) {
  const count = Number(playlist.trackCount) || 0;
  const playCount = Number(playlist.playCount) || 0;
  if (playlist.local || playlist.provider === 'local') return count ? `${count} 首 · 本地设备` : '点击导入本地歌曲';
  if (count && playCount) return `${count} \u9996 \u00b7 ${compactCount(playCount)} \u64ad\u653e`;
  if (count) return `${count} \u9996`;
  if (playCount) return `${compactCount(playCount)} \u64ad\u653e`;
  return safeText(playlist.creator, `${providerInfo(playlist.provider || state.activeProvider).label}\u6b4c\u5355`);
}

function createPlaylistCard(playlist, index) {
  const local = playlist.local || playlist.provider === 'local';
  const provider = local ? { id: 'local', label: '本地' } : providerInfo(playlist.provider || state.activeProvider);
  const button = document.createElement('button');
  button.className = 'orb-playlist-card';
  button.classList.toggle('is-local-playlist', local);
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
  fallback.textContent = local ? '本地' : '\u6b4c\u5355';
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

function updateSongButtonFocusVisual(button, itemIndex, focusIndex) {
  const offset = itemIndex - focusIndex;
  const distance = Math.abs(offset);
  const focused = itemIndex === focusIndex;
  const activeWindow = distance <= PLAYLIST_SONG_RENDER_RADIUS;
  button.classList.toggle('is-song-virtual-hidden', !activeWindow);
  button.classList.toggle('is-focused', focused);
  button.classList.toggle('is-muted', activeWindow && !focused);
  button.style.setProperty('--song-offset', String(offset));
  button.style.setProperty('--song-distance', String(distance));
  button.style.setProperty('--song-scale', String(clamp(1 - distance * 0.09, 0.62, 1)));
  button.setAttribute('aria-selected', String(focused));
}

function setSongFocus(index, options = {}) {
  const buttons = state.songButtonCache.length
    ? state.songButtonCache
    : Array.from(els.playlistSongStack.querySelectorAll('.shelf-song-button'));
  if (!buttons.length) return;
  if (!state.songButtonCache.length) state.songButtonCache = buttons;
  const count = buttons.length;
  const previousIndex = clamp(Math.round(state.songFocusIndex || 0), 0, count - 1);
  state.songFocusIndex = ((Math.round(index) % count) + count) % count;
  const windowPadding = PLAYLIST_SONG_RENDER_RADIUS + 2;
  const forceAll = options.forceAll || Math.abs(previousIndex - state.songFocusIndex) > PLAYLIST_SONG_RENDER_RADIUS * 2;
  const start = forceAll ? 0 : Math.max(0, Math.min(previousIndex, state.songFocusIndex) - windowPadding);
  const end = forceAll ? count - 1 : Math.min(count - 1, Math.max(previousIndex, state.songFocusIndex) + windowPadding);
  for (let itemIndex = start; itemIndex <= end; itemIndex += 1) {
    updateSongButtonFocusVisual(buttons[itemIndex], itemIndex, state.songFocusIndex);
  }
  if (options.focus !== false) buttons[state.songFocusIndex]?.focus({ preventScroll: true });
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

  els.playlistStatus.textContent = '\u6211\u7684\u6b4c\u5355';
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
  if (document.hidden || state.playlistsLoading) return;
  const provider = state.activeProvider;
  if (provider === 'qishui' && state.qishuiGuestMode) {
    state.playlistsLoggedIn = false;
    state.userPlaylists = [];
    renderPlaylistOrbit(playbackPlaylists());
    return;
  }
  state.playlistsLoading = true;
  try {
    const data = await apiJson(providerPath('/user/playlists', provider));
    if (provider !== state.activeProvider) return;
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];
    state.playlistsLoggedIn = !!data.loggedIn;
    state.userPlaylists = state.playlistsLoggedIn ? playlists : [];

    renderPlaylistOrbit(playbackPlaylists());
  } catch (error) {
    state.playlistsLoggedIn = false;
    state.userPlaylists = [];
    renderPlaylistOrbit(playbackPlaylists());
  } finally {
    state.playlistsLoading = false;
  }
}

function scheduleUserPlaylistsRefresh(delay = 0) {
  window.clearTimeout(state.playlistRefreshTimer);
  state.playlistRefreshTimer = window.setTimeout(refreshUserPlaylists, delay);
}

function playlistById(playlistId) {
  if (String(playlistId) === LOCAL_PLAYLIST_ID) return localPlaylistDescriptor();
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
  setStylePropertyIfChanged(els.playlistShelfStage, '--shelf-rotate-x', `${state.shelfRotateX}deg`);
  setStylePropertyIfChanged(els.playlistShelfStage, '--shelf-rotate-y', `${state.shelfRotateY}deg`);
  const backFacing = isShelfBackFacing(state.shelfRotateY);
  if (els.playlistShelf.classList.contains('is-back-facing') !== backFacing) {
    els.playlistShelf.classList.toggle('is-back-facing', backFacing);
  }
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
  els.appShell.classList.toggle('is-community-summoned', playback && state.playbackChrome.communityVisible);
  els.appShell.classList.toggle('is-playback-controls-hidden', playback && state.playbackChrome.controlsHidden);
  if (els.dockPinButton) {
    els.dockPinButton.classList.toggle('is-active', state.playbackChrome.dockPinned);
    els.dockPinButton.setAttribute('aria-pressed', String(state.playbackChrome.dockPinned));
    els.dockPinButton.title = state.playbackChrome.dockPinned ? '取消固定播放栏' : '固定播放栏';
    els.dockPinButton.setAttribute('aria-label', els.dockPinButton.title);
  }
}

function setPlaybackChromeVisibility(next = {}) {
  let changed = false;
  for (const key of ['searchVisible', 'dockVisible', 'communityVisible', 'controlsHidden']) {
    if (typeof next[key] !== 'boolean' || state.playbackChrome[key] === next[key]) continue;
    state.playbackChrome[key] = next[key];
    changed = true;
  }
  if (changed) syncPlaybackChromeClasses();
}

function resetPlaybackChromeForMode() {
  state.playbackChrome.searchVisible = false;
  state.playbackChrome.dockVisible = false;
  state.playbackChrome.communityVisible = false;
  state.playbackChrome.controlsHidden = false;
  syncPlaybackChromeClasses();
}

function setPlaybackControlsHidden(hidden) {
  if (!state.playbackPage) return;
  state.playbackChrome.controlsHidden = !!hidden;
  if (state.playbackChrome.controlsHidden) {
    state.playbackChrome.searchVisible = false;
    if (state.diyOpen) setDiyOpen(false);
  }
  syncPlaybackChromeClasses();
}

function showCommunityPageFromPlayback() {
  if (!state.playbackPage) return;
  state.playbackChrome.communityVisible = true;
  syncPlaybackChromeClasses();
  setCommunityCardCollapsed(false);
}

function toggleCommunityPageFromPlayback() {
  if (!state.playbackPage) return;
  const visible = !state.playbackChrome.communityVisible;
  state.playbackChrome.communityVisible = visible;
  syncPlaybackChromeClasses();
  if (visible) setCommunityCardCollapsed(false);
}

function isPointerNearSearchBar(event) {
  if (!els.searchForm || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return false;
  const rect = els.searchForm.getBoundingClientRect();
  const width = els.searchForm.offsetWidth || rect.width;
  const height = els.searchForm.offsetHeight || rect.height;
  const left = rect.left - Math.max(0, width - rect.width) / 2;
  const top = els.searchForm.offsetTop;
  const paddingX = 24;
  const paddingY = 16;
  return event.clientX >= left - paddingX
    && event.clientX <= left + width + paddingX
    && event.clientY >= top - paddingY
    && event.clientY <= top + height + paddingY;
}

function updatePlaybackChromeFromPointer(event) {
  if (!event) return;
  const target = event.target instanceof Element ? event.target : null;
  const overSearchChrome = !!target && !!target.closest('.top-search, .search-suggestions, .favorite-library, .playlist-favorite-popover');
  const overDock = !!target && !!target.closest('.player-dock');
  setPlaybackChromeVisibility({
    searchVisible: state.playbackPage && (overSearchChrome || isPointerNearSearchBar(event)),
    dockVisible: state.playbackChrome.dockPinned || overDock || event.clientY >= window.innerHeight - 128
  });
}

let uiPointerFrame = 0;
let latestUiPointer = null;

function scheduleUiPointerUpdates(event) {
  latestUiPointer = {
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.target
  };
  if (uiPointerFrame) return;
  uiPointerFrame = window.requestAnimationFrame(() => {
    uiPointerFrame = 0;
    const pointer = latestUiPointer;
    latestUiPointer = null;
    updatePlaybackChromeFromPointer(pointer);
    updateDiySidebarFromPointer(pointer);
  });
}

function cancelUiPointerUpdates() {
  if (uiPointerFrame) window.cancelAnimationFrame(uiPointerFrame);
  uiPointerFrame = 0;
  latestUiPointer = null;
}

const PLAYBACK_CARD_PROVIDER_ACCENTS = Object.freeze({
  netease: '#e5484d',
  qq: '#2fc77a',
  kugou: '#2d9ff0',
  qishui: '#ff8a4c',
  local: '#7dd3fc'
});
const PLAYBACK_CARD_VISIBILITY_TRANSITION_MS = 240;

function playbackCardSong(song = state.currentSong) {
  return song || null;
}

function playbackCardVisible() {
  return !!(els.qishuiPlaybackCard && state.playbackPage);
}

function playbackCardLyricsVisible() {
  return playbackCardVisible() && !state.qishuiPlaybackCard.hiddenByUser;
}

function syncQishuiPlaybackExpansion() {
  if (!els.qishuiPlaybackCard || !els.qishuiPlaybackPhone) return;
  const expanded = !!state.qishuiPlaybackCard.expanded;
  els.qishuiPlaybackCard.classList.toggle('is-expanded', expanded);
  els.qishuiPlaybackCard.classList.toggle('is-compact', !expanded);
  els.qishuiPlaybackPhone.setAttribute('aria-expanded', String(expanded));
  els.qishuiPlaybackPhone.dataset.displayMode = expanded ? 'expanded' : 'compact';
  if (els.qishuiPlaybackScaleToggle) {
    const label = expanded ? '还原播放页' : '放大播放页';
    els.qishuiPlaybackScaleToggle.classList.toggle('is-expanded', expanded);
    els.qishuiPlaybackScaleToggle.setAttribute('aria-pressed', String(expanded));
    els.qishuiPlaybackScaleToggle.setAttribute('aria-label', label);
    els.qishuiPlaybackScaleToggle.title = label;
  }
}

function setQishuiPlaybackExpanded(expanded) {
  state.qishuiPlaybackCard.expanded = !!expanded;
  syncQishuiPlaybackExpansion();
  scheduleQishuiPlaybackLyricLayout();
}

function toggleQishuiPlaybackExpanded() {
  if (state.qishuiPlaybackCard.hiddenByUser) return;
  setQishuiPlaybackExpanded(!state.qishuiPlaybackCard.expanded);
}

function syncQishuiPlaybackHiddenState() {
  if (!els.qishuiPlaybackCard || !els.qishuiPlaybackPhone) return;
  const hiddenByUser = !!state.qishuiPlaybackCard.hiddenByUser;
  els.qishuiPlaybackCard.classList.toggle('is-user-hidden', hiddenByUser);
  els.qishuiPlaybackCard.setAttribute(
    'aria-label',
    hiddenByUser ? '音乐播放页已隐藏' : '音乐悬浮播放页'
  );
  if (els.qishuiPlaybackScaleToggle) {
    els.qishuiPlaybackScaleToggle.disabled = hiddenByUser;
  }
  if (els.qishuiPlaybackVisibilityToggle) {
    const label = hiddenByUser ? '显示播放页' : '隐藏播放页';
    els.qishuiPlaybackVisibilityToggle.classList.toggle('is-hidden', hiddenByUser);
    els.qishuiPlaybackVisibilityToggle.setAttribute('aria-pressed', String(hiddenByUser));
    els.qishuiPlaybackVisibilityToggle.setAttribute('aria-label', label);
    els.qishuiPlaybackVisibilityToggle.title = label;
  }
}

function clearQishuiPlaybackVisibilityTransition() {
  window.clearTimeout(state.qishuiPlaybackCard.visibilityTransitionTimer);
  window.cancelAnimationFrame(state.qishuiPlaybackCard.visibilityTransitionFrame);
  state.qishuiPlaybackCard.visibilityTransitionTimer = 0;
  state.qishuiPlaybackCard.visibilityTransitionFrame = 0;
  if (!els.qishuiPlaybackCard) return;
  els.qishuiPlaybackCard.classList.remove('is-visibility-sliding-right', 'is-visibility-snap');
  els.qishuiPlaybackCard.removeAttribute('aria-busy');
}

function commitQishuiPlaybackHiddenState(hidden) {
  const nextHidden = !!hidden;
  state.qishuiPlaybackCard.hiddenByUser = nextHidden;
  syncQishuiPlaybackHiddenState();
  syncPlaybackCardPanelState();
  if (!nextHidden) {
    updateQishuiPlaybackLyrics(state.lyricDisplayText, state.lyricSubtitleText);
    requestOrbFrame();
  }
}

function setQishuiPlaybackHidden(hidden) {
  const nextHidden = !!hidden;
  if (nextHidden) {
    state.playbackPlaylistPickerOpen = false;
    if (state.playlistSongPageOpen) closePlaylistShelf({ reopenPicker: false });
    if (state.diyOpen) setDiyOpen(false);
  }
  const card = els.qishuiPlaybackCard;
  clearQishuiPlaybackVisibilityTransition();
  if (!card || reducedMotion) {
    commitQishuiPlaybackHiddenState(nextHidden);
    return;
  }

  card.setAttribute('aria-busy', 'true');
  if (nextHidden) {
    card.classList.add('is-visibility-sliding-right');
    state.qishuiPlaybackCard.visibilityTransitionTimer = window.setTimeout(() => {
      state.qishuiPlaybackCard.visibilityTransitionTimer = 0;
      card.classList.add('is-visibility-snap');
      commitQishuiPlaybackHiddenState(true);
      card.classList.remove('is-visibility-sliding-right');
      void card.offsetWidth;
      card.classList.remove('is-visibility-snap');
      card.removeAttribute('aria-busy');
    }, PLAYBACK_CARD_VISIBILITY_TRANSITION_MS);
    return;
  }

  card.classList.add('is-visibility-snap', 'is-visibility-sliding-right');
  commitQishuiPlaybackHiddenState(false);
  void card.offsetWidth;
  card.classList.remove('is-visibility-snap');
  state.qishuiPlaybackCard.visibilityTransitionFrame = window.requestAnimationFrame(() => {
    state.qishuiPlaybackCard.visibilityTransitionFrame = 0;
    card.classList.remove('is-visibility-sliding-right');
    card.removeAttribute('aria-busy');
  });
}

function toggleQishuiPlaybackHidden() {
  setQishuiPlaybackHidden(!state.qishuiPlaybackCard.hiddenByUser);
}

function playbackCardProvider(song = state.currentSong) {
  if (isLocalSong(song)) return { id: 'local', label: '本地音乐' };
  return providerInfo(state.activeProvider || (song && song.provider));
}

function playbackCardProviderFallback(provider) {
  if (provider.id === 'netease') return '网易';
  if (provider.id === 'qq') return 'QQ';
  if (provider.id === 'kugou') return '酷狗';
  if (provider.id === 'qishui') return '汽水';
  if (provider.id === 'local') return '本地';
  return 'FE';
}

function playbackCardAccountFallback(provider) {
  if (provider.id === 'netease') return '云';
  if (provider.id === 'qq') return 'Q';
  if (provider.id === 'kugou') return '狗';
  if (provider.id === 'qishui') return '汽';
  if (provider.id === 'local') return '本';
  return 'FE';
}

function renderQishuiPlaybackIdentity(provider = playbackCardProvider()) {
  if (!els.qishuiPlaybackAccount) return;
  const local = provider.id === 'local';
  const payload = local ? null : state.loginStatusByProvider[provider.id];
  const loading = !local && !payload;
  const loggedIn = !!(payload && payload.loggedIn);
  const guest = provider.id === 'qishui' && !loggedIn && state.qishuiGuestMode;
  const avatarUrl = loggedIn ? accountAvatar(payload) : '';
  const vipLabel = loggedIn ? accountVipLabel(payload) : '';
  const accountLabel = local
    ? '本地音乐'
    : loggedIn
      ? accountName(payload) || `${provider.label}用户`
      : guest
        ? '汽水访客'
        : loading
          ? '读取账号中'
          : `${provider.label}未登录`;
  const statusLabel = local
    ? '本地播放'
    : loggedIn
      ? '已登录'
      : guest
        ? '访客模式'
        : loading
          ? '连接中'
          : '未登录';

  els.qishuiPlaybackAccount.dataset.provider = provider.id;
  els.qishuiPlaybackAccount.classList.toggle('is-logged-in', loggedIn);
  els.qishuiPlaybackAccount.classList.toggle('has-vip', !!vipLabel);
  els.qishuiPlaybackAccount.setAttribute(
    'aria-label',
    `${provider.label}，${accountLabel}，${vipLabel || statusLabel}`
  );
  if (els.qishuiPlaybackAccountName) {
    els.qishuiPlaybackAccountName.textContent = accountLabel;
    els.qishuiPlaybackAccountName.title = accountLabel;
  }
  if (els.qishuiPlaybackAccountStatus) {
    els.qishuiPlaybackAccountStatus.textContent = statusLabel;
  }
  if (els.qishuiPlaybackVipBadge) {
    els.qishuiPlaybackVipBadge.hidden = !vipLabel;
    els.qishuiPlaybackVipBadge.textContent = vipLabel || 'VIP';
  }
  if (els.qishuiPlaybackAccountAvatarFallback) {
    els.qishuiPlaybackAccountAvatarFallback.textContent = playbackCardAccountFallback(provider);
  }
  if (els.qishuiPlaybackAccountAvatar) {
    els.qishuiPlaybackAccountAvatar.classList.toggle('has-avatar', !!avatarUrl);
  }
  if (els.qishuiPlaybackAccountAvatarImage) {
    if (avatarUrl) {
      if (els.qishuiPlaybackAccountAvatarImage.getAttribute('src') !== avatarUrl) {
        els.qishuiPlaybackAccountAvatarImage.src = avatarUrl;
      }
    } else {
      els.qishuiPlaybackAccountAvatarImage.removeAttribute('src');
    }
  }
}

function ensureQishuiPlaybackIdentity(provider = playbackCardProvider()) {
  if (provider.id === 'local' || state.loginStatusByProvider[provider.id]) return;
  ensureQualityLoginStatus(provider.id).then(() => {
    if (playbackCardProvider(playbackCardSong()).id === provider.id) {
      renderQishuiPlaybackIdentity(provider);
    }
  });
}

function setQishuiPlaybackImage(image, url) {
  if (!image) return;
  if (!url) {
    image.removeAttribute('src');
    return;
  }
  if (image.getAttribute('src') !== url) image.src = url;
}

function handleQishuiPlaybackImageError(event) {
  const image = event.currentTarget;
  image.removeAttribute('src');
  if (image === els.qishuiPlaybackCover) {
    els.qishuiPlaybackCoverFrame?.classList.remove('has-cover');
  }
}

function handleQishuiPlaybackAccountAvatarError() {
  if (els.qishuiPlaybackAccountAvatarImage) {
    els.qishuiPlaybackAccountAvatarImage.removeAttribute('src');
  }
  els.qishuiPlaybackAccountAvatar?.classList.remove('has-avatar');
}

function qishuiPlaybackBookLines(text = '', subtitle = '') {
  const song = playbackCardSong();
  const syncedLines = Array.isArray(state.lyricLines) ? state.lyricLines : [];
  if (song && syncedLines.length) return syncedLines;
  const currentText = song
    ? safeText(text, playbackLyricText(song))
    : '选择一首歌曲';
  const secondaryText = song
    ? safeText(subtitle, playbackLyricSubtitle(song))
    : '滚轮向上上一首，向下下一首';
  return [
    { time: 0, text: currentText, fallback: true },
    { time: 4, text: secondaryText, fallback: true }
  ];
}

function qishuiPlaybackBookFrame(lines, playbackTime = Number.NaN) {
  if (!state.lyricLines.length) {
    return { activeIndex: 0, currentTime: Number.NaN, progressPercent: 0 };
  }
  const currentTime = Number.isFinite(Number(playbackTime))
    ? Math.max(0, Number(playbackTime))
    : currentPlaybackLyricTime();
  const activeIndex = findLyricIndexAtTime(
    lines,
    currentTime,
    BOOK_LYRIC_VISUAL_LEAD_SECONDS
  );
  const displayTime = lyricTimelineTime(currentTime, BOOK_LYRIC_VISUAL_LEAD_SECONDS);
  const line = lines[activeIndex] || {};
  const nextLine = lines[activeIndex + 1];
  const timedEnd = Number(line.endTime);
  const fallbackDuration = playbackDurationForLyricSpeed();
  const fallbackEnd = nextLine
    ? nextLine.time
    : Math.max((Number(line.time) || 0) + 4, fallbackDuration || (Number(line.time) || 0) + 4);
  const endTime = Number.isFinite(timedEnd) && timedEnd > Number(line.time)
    ? (nextLine ? Math.min(timedEnd, nextLine.time) : timedEnd)
    : fallbackEnd;
  const progressEndTime = bookLyricProgressEndTime(line, endTime);
  const progressPercent = lyricProgressForLineAtTime(
    line,
    displayTime,
    progressEndTime,
    { linear: true }
  ) * 100;
  return { activeIndex, currentTime: displayTime, progressPercent };
}

function scheduleQishuiPlaybackLyricLayout() {
  window.cancelAnimationFrame(state.qishuiPlaybackCard.lyricBookLayoutFrame);
  state.qishuiPlaybackCard.lyricBookLayoutFrame = window.requestAnimationFrame(() => {
    state.qishuiPlaybackCard.lyricBookLayoutFrame = 0;
    resetBookLyricScrollState({ store: state.qishuiPlaybackCard });
    updateQishuiPlaybackLyrics(state.lyricDisplayText, state.lyricSubtitleText);
  });
}

function updateQishuiPlaybackLyrics(
  text = '',
  subtitle = '',
  playbackTime = Number.NaN,
  scrollOptions = {}
) {
  if (!els.qishuiPlaybackLyrics || !els.qishuiPlaybackLyricPage) return;
  const list = els.qishuiPlaybackLyricPage;
  const cardState = state.qishuiPlaybackCard;
  const lines = qishuiPlaybackBookLines(text, subtitle);
  const songId = safeText(playbackCardSong()?.id, 'empty');
  const signature = `${songId}|${bookLyricSignature(lines)}`;
  if (signature !== cardState.lyricSignature) {
    cardState.lyricSignature = signature;
    cardState.lastLyricIndex = -1;
    cardState.lyricBookIndex = -2;
    cardState.lyricBookCurrentLine = null;
    cardState.lyricBookArrivedIndex = -2;
    resetBookLyricScrollState({ store: cardState });
    renderBookLyricList(list, lines, {
      lineClass: 'qishui-playback-lyric-line',
      lazyGlyphs: true
    });
    list.__qishuiPlaybackLyricLines = Array.from(list.children);
  }

  const { activeIndex, currentTime, progressPercent } = qishuiPlaybackBookFrame(lines, playbackTime);
  const previousIndex = cardState.lastLyricIndex;
  const direction = previousIndex < 0
    ? 'none'
    : activeIndex === previousIndex
      ? safeText(list.dataset.scrollDirection, 'none')
      : activeIndex > previousIndex
        ? 'forward'
        : 'backward';
  cardState.lastLyricIndex = activeIndex;

  if (cardState.lyricBookIndex !== activeIndex) {
    const previousBookIndex = cardState.lyricBookIndex;
    cardState.lyricBookIndex = activeIndex;
    cardState.lyricBookCurrentLine = null;
    cardState.lyricBookArrivedIndex = -2;
    let lyricLineElements = list.__qishuiPlaybackLyricLines;
    if (!Array.isArray(lyricLineElements) || lyricLineElements.length !== lines.length) {
      lyricLineElements = Array.from(list.querySelectorAll('.qishui-playback-lyric-line'));
      list.__qishuiPlaybackLyricLines = lyricLineElements;
    }
    const previousIndexIsValid = Number.isInteger(previousBookIndex)
      && previousBookIndex >= 0
      && previousBookIndex < lyricLineElements.length;
    // Only lines between the old/new focus plus the six-line visual falloff can
    // change. Keeping the remaining DOM untouched removes an O(n) style pass
    // whenever a lyric advances, which is important on 120/144/165 Hz panels.
    const updateStart = previousIndexIsValid
      ? Math.max(0, Math.min(previousBookIndex, activeIndex) - 6)
      : 0;
    const updateEnd = previousIndexIsValid
      ? Math.min(lyricLineElements.length - 1, Math.max(previousBookIndex, activeIndex) + 6)
      : lyricLineElements.length - 1;
    for (let elementIndex = updateStart; elementIndex <= updateEnd; elementIndex += 1) {
      const line = lyricLineElements[elementIndex];
      if (!line) continue;
      const index = Number(line.dataset.bookLyricIndex) || 0;
      const distance = Math.min(6, Math.abs(index - activeIndex));
      const isTarget = index === activeIndex;
      line.classList.remove('is-current', 'is-ended', 'is-scroll-arrived');
      line.classList.toggle('is-arriving', isTarget);
      line.classList.toggle('is-past', index < activeIndex);
      line.classList.toggle('is-future', index > activeIndex);
      line.style.setProperty('--book-line-distance', distance.toFixed(0));
      line.style.setProperty('--book-line-progress', '0%');
      setBookLyricGlyphProgress(line, 0, Number.NaN);
      line.removeAttribute('aria-current');
      line.removeAttribute('id');
      if (isTarget) {
        line.id = 'qishuiPlaybackLyric';
        cardState.lyricBookCurrentLine = line;
      } else if (index === activeIndex + 1) {
        line.id = 'qishuiPlaybackLyricNext';
      }
    }
    resetBookLyricScrollState({ store: cardState });
  }

  let current = cardState.lyricBookCurrentLine;
  if (!current || Number(current.dataset.bookLyricIndex) !== activeIndex) {
    current = list.querySelector(
      `.qishui-playback-lyric-line[data-book-lyric-index="${activeIndex}"]`
    );
    cardState.lyricBookCurrentLine = current;
  }

  const scrollArrived = current
    ? syncBookLyricScroll(current, {
        list,
        store: cardState,
        lines,
        activeIndex,
        reducedMotion: reducedMotion,
        playbackRunning: scrollOptions.playbackRunning
      })
    : false;
  // Once the line reaches the reading position, keep its highlight latched
  // until the active lyric changes. The larger current-line typography changes
  // layout by a pixel or two; treating that reflow as "not arrived" makes the
  // line expand and collapse every other frame on tall fullscreen layouts.
  const arrived = cardState.lyricBookArrivedIndex === activeIndex || scrollArrived;
  cardState.lyricBookArrivedIndex = arrived ? activeIndex : -2;
  list.classList.toggle('is-highlight-pending', !arrived);
  list.dataset.activeIndex = String(activeIndex);
  list.dataset.arrivedIndex = arrived ? String(activeIndex) : '';
  list.dataset.scrollDirection = direction;

  if (!current) return;
  const visibleProgress = arrived ? clamp(Number(progressPercent) || 0, 0, 100) : 0;
  current.classList.toggle('is-arriving', !arrived);
  current.classList.toggle('is-current', arrived);
  current.classList.toggle('is-scroll-arrived', arrived);
  current.classList.toggle('is-ended', arrived && visibleProgress >= 99.6);
  current.style.setProperty('--book-line-progress', `${visibleProgress.toFixed(2)}%`);
  setBookLyricGlyphProgress(
    current,
    visibleProgress,
    arrived ? currentTime : Number.NaN
  );
  if (arrived) current.setAttribute('aria-current', 'true');
  else current.removeAttribute('aria-current');
}

function qishuiPlaybackSeekDuration() {
  const audioDuration = Number(els.audio && els.audio.duration);
  if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;
  return Math.max(0, Number(playbackCardSong()?.duration) || 0);
}

function qishuiPlaybackSeekTarget() {
  if (!els.qishuiPlaybackProgressRange) return 0;
  const duration = qishuiPlaybackSeekDuration();
  const ratio = clamp(Number(els.qishuiPlaybackProgressRange.value) / 1000, 0, 1);
  return duration * ratio;
}

function updateQishuiPlaybackProgress(
  current = Number.NaN,
  duration = Number.NaN,
  { forceRange = false } = {}
) {
  if (!els.qishuiPlaybackProgressRange) return;
  const song = playbackCardSong();
  if (!song) {
    els.qishuiPlaybackProgressRange.value = '0';
    els.qishuiPlaybackProgressRange.disabled = true;
    els.qishuiPlaybackProgressRange.style.setProperty('--playback-progress', '0%');
    if (els.qishuiPlaybackCurrentTime) els.qishuiPlaybackCurrentTime.textContent = '00:00';
    if (els.qishuiPlaybackTotalTime) els.qishuiPlaybackTotalTime.textContent = '00:00';
    return;
  }
  const hasLiveAudio = !!(els.audio && els.audio.src);
  const audioCurrent = Number.isFinite(current)
    ? current
    : hasLiveAudio
      ? Number(els.audio.currentTime)
      : Number.NaN;
  const audioDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : hasLiveAudio
      ? Number(els.audio.duration)
      : Number.NaN;
  const fallbackCurrent = song ? estimatedPlayerClockTime(Number(song.position) || 0) : 0;
  const fallbackDuration = song ? Number(song.duration) || 0 : 0;
  const safeCurrent = Math.max(0, Number.isFinite(audioCurrent) ? audioCurrent : fallbackCurrent);
  const safeDuration = Math.max(0, Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : fallbackDuration);
  const progress = safeDuration > 0 ? clamp(safeCurrent / safeDuration, 0, 1) : 0;
  els.qishuiPlaybackProgressRange.disabled = safeDuration <= 0;
  if (!state.qishuiPlaybackCard.progressDragging || forceRange) {
    els.qishuiPlaybackProgressRange.value = String(Math.round(progress * 1000));
    els.qishuiPlaybackProgressRange.style.setProperty(
      '--playback-progress',
      `${(progress * 100).toFixed(3)}%`
    );
  }
  const currentTimeLabel = formatTime(safeCurrent);
  const totalTimeLabel = formatTime(safeDuration);
  const progressAriaLabel = `${currentTimeLabel} / ${totalTimeLabel}`;
  if (els.qishuiPlaybackProgressRange.getAttribute('aria-valuetext') !== progressAriaLabel) {
    els.qishuiPlaybackProgressRange.setAttribute('aria-valuetext', progressAriaLabel);
  }
  if (els.qishuiPlaybackCurrentTime && els.qishuiPlaybackCurrentTime.textContent !== currentTimeLabel) {
    els.qishuiPlaybackCurrentTime.textContent = currentTimeLabel;
  }
  if (els.qishuiPlaybackTotalTime && els.qishuiPlaybackTotalTime.textContent !== totalTimeLabel) {
    els.qishuiPlaybackTotalTime.textContent = totalTimeLabel;
  }
}

function previewQishuiPlaybackSeek() {
  const duration = qishuiPlaybackSeekDuration();
  if (!duration || !els.qishuiPlaybackProgressRange) return false;
  if (state.qishuiPlaybackCard.seekPending) {
    state.qishuiPlaybackCard.seekRequestId += 1;
    state.qishuiPlaybackCard.seekPending = false;
  }
  state.qishuiPlaybackCard.progressDragging = true;
  const target = qishuiPlaybackSeekTarget();
  state.qishuiPlaybackCard.pendingSeekTarget = target;
  const audioDuration = Number(els.audio && els.audio.duration);
  if (Number.isFinite(audioDuration) && audioDuration > 0) {
    els.audio.currentTime = target;
    state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
  } else if (els.progressRange) {
    els.progressRange.value = els.qishuiPlaybackProgressRange.value;
    syncElasticRangeVisual(els.progressRange);
    if (els.audio?.src) state.qishuiPlaybackCard.pendingAudioSeekTarget = target;
  }
  updateQishuiPlaybackProgress(target, duration, { forceRange: true });
  syncPlaybackLyricAtTime(target);
  return true;
}

async function commitQishuiPlaybackSeek() {
  if (!state.qishuiPlaybackCard.progressDragging) return false;
  const duration = qishuiPlaybackSeekDuration();
  const target = qishuiPlaybackSeekTarget();
  state.qishuiPlaybackCard.progressDragging = false;
  if (!duration) {
    updateQishuiPlaybackProgress();
    return false;
  }
  const audioDuration = Number(els.audio && els.audio.duration);
  if (Number.isFinite(audioDuration) && audioDuration > 0) {
    els.audio.currentTime = target;
    state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
  } else if (els.audio?.src) {
    state.qishuiPlaybackCard.pendingAudioSeekTarget = target;
  }
  state.qishuiPlaybackCard.pendingSeekTarget = target;
  if (state.currentSong) state.currentSong = { ...state.currentSong, position: target };
  updatePlayerClock(target, duration, isPlaybackClockRunning());
  updateQishuiPlaybackProgress(target, duration, { forceRange: true });
  if (!state.localQueueActive) {
    const requestId = state.qishuiPlaybackCard.seekRequestId + 1;
    state.qishuiPlaybackCard.seekRequestId = requestId;
    state.qishuiPlaybackCard.seekPending = true;
    try {
      await apiJson(`/api/player/seek?${query({ position: Math.round(target) })}`);
    } catch (error) {
      if (requestId === state.qishuiPlaybackCard.seekRequestId) {
        toast(`进度调整失败：${safeText(error && error.message, '请稍后重试')}`);
        refreshPlayerState().catch(() => {});
      }
    } finally {
      if (requestId === state.qishuiPlaybackCard.seekRequestId) {
        state.qishuiPlaybackCard.seekPending = false;
        state.qishuiPlaybackCard.pendingSeekTarget = null;
      }
    }
  } else {
    state.qishuiPlaybackCard.pendingSeekTarget = null;
  }
  if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
  return true;
}

function updateQishuiPlaybackPlayState(playing = !els.audio.paused && !!els.audio.src) {
  if (!els.qishuiPlaybackPlayButton) return;
  const enabled = !!playbackCardSong();
  if (els.qishuiPlaybackPreviousButton) els.qishuiPlaybackPreviousButton.disabled = !enabled;
  if (els.qishuiPlaybackNextButton) els.qishuiPlaybackNextButton.disabled = !enabled;
  els.qishuiPlaybackPlayButton.disabled = !enabled;
  els.qishuiPlaybackPlayButton.classList.toggle('is-playing', enabled && playing);
  els.qishuiPlaybackPlayButton.title = enabled ? (playing ? '暂停' : '播放') : '请先选择一首歌曲';
  els.qishuiPlaybackPlayButton.setAttribute('aria-label', els.qishuiPlaybackPlayButton.title);
}

function renderQishuiPlaybackCard(song = state.currentSong) {
  if (!els.qishuiPlaybackCard) return;
  const active = playbackCardSong(song);
  const provider = playbackCardProvider(active);
  const title = safeText(active && active.title, '等待播放');
  const artist = safeText(active && (active.artist || active.album), provider.label);
  const imageUrl = coverUrl(active);
  if (active && state.playbackVisual.palette) {
    applyQishuiPlaybackPalette(state.playbackVisual.palette);
  }
  setQishuiPlaybackImage(els.qishuiPlaybackCover, imageUrl);
  setQishuiPlaybackImage(els.qishuiPlaybackBackdrop, imageUrl);
  if (els.qishuiPlaybackCoverFrame) els.qishuiPlaybackCoverFrame.classList.toggle('has-cover', !!imageUrl);
  if (els.qishuiPlaybackCover) els.qishuiPlaybackCover.alt = imageUrl ? `${title} 封面` : '';
  renderQishuiPlaybackIdentity(provider);
  ensureQishuiPlaybackIdentity(provider);
  if (els.qishuiPlaybackCoverFallback) {
    els.qishuiPlaybackCoverFallback.textContent = playbackCardProviderFallback(provider);
  }
  els.qishuiPlaybackCard.dataset.provider = provider.id;
  els.qishuiPlaybackCard.style.setProperty(
    '--playback-provider-accent',
    PLAYBACK_CARD_PROVIDER_ACCENTS[provider.id] || PLAYBACK_CARD_PROVIDER_ACCENTS.local
  );
  if (els.qishuiPlaybackTitle) {
    els.qishuiPlaybackTitle.textContent = title;
    els.qishuiPlaybackTitle.title = title;
  }
  if (els.qishuiPlaybackArtist) {
    els.qishuiPlaybackArtist.textContent = artist;
    els.qishuiPlaybackArtist.title = artist;
  }
  if (els.qishuiPlaybackQueue) {
    const hasQueuePosition = active && state.queue.length && state.queueIndex >= 0;
    els.qishuiPlaybackQueue.textContent = hasQueuePosition
      ? `${state.queueIndex + 1} / ${state.queue.length}`
      : '移动播放页';
  }
  updateQualityButton(song);
  els.qishuiPlaybackCard.classList.toggle('is-empty', !active);
  updateQishuiPlaybackLyrics(
    active ? safeText(state.lyricDisplayText, title) : '',
    active ? safeText(state.lyricSubtitleText, artist) : ''
  );
  updateQishuiPlaybackProgress();
  updateQishuiPlaybackPlayState();
}

function syncPlaybackCardPanelState() {
  const visible = playbackCardVisible();
  const diyPanelOpen = visible && state.diyOpen && state.diyCardOpen;
  const playlistPickerOpen = visible && state.playbackPlaylistPickerOpen && !state.playlistSongPageOpen;
  const songPanelOpen = visible && state.playlistSongPageOpen;
  const sidePanelOpen = diyPanelOpen || playlistPickerOpen || songPanelOpen;
  els.appShell.classList.toggle('has-playback-side-panel', sidePanelOpen);
  els.appShell.classList.toggle('is-playback-diy-panel-open', diyPanelOpen);
  els.appShell.classList.toggle('is-playback-playlist-picker-open', playlistPickerOpen);
  els.appShell.classList.toggle('is-playback-song-panel-open', songPanelOpen);
  if (els.qishuiPlaybackPhone) {
    els.qishuiPlaybackPhone.classList.toggle('is-panel-open', sidePanelOpen);
    els.qishuiPlaybackPhone.inert = sidePanelOpen
      && window.matchMedia('(max-width: 767px)').matches;
  }
  if (!els.qishuiPlaybackTools) return;
  els.qishuiPlaybackTools.querySelectorAll('[data-playback-tool]').forEach((button) => {
    const tool = button.dataset.playbackTool;
    const active = tool === 'playlists'
      ? playlistPickerOpen || songPanelOpen
      : tool === 'preset' || tool === 'text' || tool === 'wallpaper'
        ? diyPanelOpen && state.diyPage === tool
        : false;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function syncQishuiPlaybackCard() {
  if (!els.qishuiPlaybackCard) return;
  const visible = playbackCardVisible();
  els.qishuiPlaybackCard.hidden = !visible;
  els.appShell.classList.toggle('has-qishui-playback-card', visible);
  if (visible) {
    syncQishuiPlaybackExpansion();
    syncQishuiPlaybackHiddenState();
    renderQishuiPlaybackCard();
    syncPlaybackCardPanelState();
    return;
  }
  state.playbackPlaylistPickerOpen = false;
  state.qishuiPlaybackCard.expanded = false;
  state.qishuiPlaybackCard.wheelDelta = 0;
  state.qishuiPlaybackCard.switching = false;
  state.qishuiPlaybackCard.progressDragging = false;
  state.qishuiPlaybackCard.seekPending = false;
  state.qishuiPlaybackCard.pendingSeekTarget = null;
  state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
  state.qishuiPlaybackCard.seekRequestId += 1;
  state.qishuiPlaybackCard.switchId += 1;
  state.qishuiPlaybackCard.lyricSignature = '';
  state.qishuiPlaybackCard.lastLyricIndex = -1;
  state.qishuiPlaybackCard.lyricBookIndex = -2;
  state.qishuiPlaybackCard.lyricBookCurrentLine = null;
  state.qishuiPlaybackCard.lyricBookArrivedIndex = -2;
  clearQishuiPlaybackVisibilityTransition();
  window.cancelAnimationFrame(state.qishuiPlaybackCard.lyricBookLayoutFrame);
  state.qishuiPlaybackCard.lyricBookLayoutFrame = 0;
  resetBookLyricScrollState({ store: state.qishuiPlaybackCard });
  window.clearTimeout(state.qishuiPlaybackCard.switchTimer);
  state.qishuiPlaybackCard.switchTimer = 0;
  syncQishuiPlaybackExpansion();
  syncQishuiPlaybackHiddenState();
  clearQishuiPlaybackSwitchClasses();
  syncPlaybackCardPanelState();
}

function setPlaybackPlaylistPickerOpen(open) {
  const nextOpen = playbackCardVisible() && !!open;
  if (nextOpen) {
    if (state.diyOpen) setDiyOpen(false);
    if (state.playlistSongPageOpen) closePlaylistShelf({ reopenPicker: false });
    state.playbackPlaylistPickerOpen = true;
    renderPlaylistOrbit(playbackPlaylists());
  } else {
    state.playbackPlaylistPickerOpen = false;
    if (state.playlistSongPageOpen) closePlaylistShelf({ reopenPicker: false });
  }
  syncPlaybackCardPanelState();
}

function openPlaybackDiyPanel(page) {
  const nextPage = page === 'wallpaper' ? 'wallpaper' : page === 'text' ? 'text' : 'preset';
  const alreadyOpen = state.diyOpen && state.diyCardOpen && state.diyPage === nextPage;
  state.playbackPlaylistPickerOpen = false;
  if (state.playlistSongPageOpen) closePlaylistShelf({ reopenPicker: false });
  if (alreadyOpen) {
    setDiyOpen(false);
  } else {
    if (!state.diyOpen) setDiyOpen(true);
    setDiyPage(nextPage);
    if (nextPage !== 'wallpaper') enterPlaybackPage();
  }
  syncPlaybackCardPanelState();
}

function openPlaybackRhythmGame() {
  state.playbackPlaylistPickerOpen = false;
  if (state.playlistSongPageOpen) closePlaylistShelf({ reopenPicker: false });
  if (state.diyOpen) setDiyOpen(false);
  syncPlaybackCardPanelState();
  els.diyRhythmGameButton?.click();
}

function handlePlaybackCardTool(event) {
  const button = event.target.closest('[data-playback-tool]');
  if (!button || !els.qishuiPlaybackTools?.contains(button)) return;
  const tool = button.dataset.playbackTool;
  if (tool === 'playlists') {
    setPlaybackPlaylistPickerOpen(!(state.playbackPlaylistPickerOpen || state.playlistSongPageOpen));
  } else if (tool === 'rhythm') {
    openPlaybackRhythmGame();
  } else {
    openPlaybackDiyPanel(tool);
  }
}

const QISHUI_PLAYBACK_SWITCH_CLASSES = Object.freeze([
  'is-switching-previous',
  'is-switching-next',
  'is-switching-enter-previous',
  'is-switching-enter-next',
  'is-switching-preparing'
]);

function clearQishuiPlaybackSwitchClasses() {
  els.qishuiPlaybackPhone?.classList.remove(...QISHUI_PLAYBACK_SWITCH_CLASSES);
}

function finishQishuiPlaybackSwitch(switchId) {
  if (switchId !== state.qishuiPlaybackCard.switchId) return;
  window.clearTimeout(state.qishuiPlaybackCard.switchTimer);
  state.qishuiPlaybackCard.switchTimer = 0;
  state.qishuiPlaybackCard.switching = false;
  clearQishuiPlaybackSwitchClasses();
  if (els.qishuiPlaybackWheelHint) {
    els.qishuiPlaybackWheelHint.textContent = '滚轮向上上一首 · 向下下一首';
  }
}

function switchQishuiPlaybackTrack(direction) {
  const song = playbackCardSong();
  if (!song || state.qishuiPlaybackCard.switching) return;
  const previous = direction < 0;
  const switchId = state.qishuiPlaybackCard.switchId + 1;
  const exitClass = previous ? 'is-switching-previous' : 'is-switching-next';
  const enterClass = previous ? 'is-switching-enter-previous' : 'is-switching-enter-next';
  state.qishuiPlaybackCard.switchId = switchId;
  state.qishuiPlaybackCard.switching = true;
  state.qishuiPlaybackCard.progressDragging = false;
  state.qishuiPlaybackCard.seekPending = false;
  state.qishuiPlaybackCard.pendingSeekTarget = null;
  state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
  state.qishuiPlaybackCard.seekRequestId += 1;
  if (els.qishuiPlaybackPhone) {
    clearQishuiPlaybackSwitchClasses();
    els.qishuiPlaybackPhone.classList.add(exitClass);
  }
  if (els.qishuiPlaybackWheelHint) {
    els.qishuiPlaybackWheelHint.textContent = previous ? '正在切换上一首' : '正在切换下一首';
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimumExit = reducedMotion
    ? Promise.resolve()
    : new Promise((resolve) => window.setTimeout(resolve, 110));
  let watchdogTimer = 0;
  const transportReady = Promise.race([
    Promise.resolve(transport(previous ? '/api/player/previous' : '/api/player/next')).catch(() => {}),
    new Promise((resolve) => {
      watchdogTimer = window.setTimeout(resolve, 6000);
    })
  ]).finally(() => window.clearTimeout(watchdogTimer));
  Promise.all([
    transportReady,
    minimumExit
  ]).finally(() => {
    if (switchId !== state.qishuiPlaybackCard.switchId) return;
    const phone = els.qishuiPlaybackPhone;
    if (reducedMotion || !phone) {
      finishQishuiPlaybackSwitch(switchId);
      return;
    }
    phone.classList.add('is-switching-preparing', enterClass);
    phone.classList.remove(exitClass);
    window.requestAnimationFrame(() => {
      if (switchId !== state.qishuiPlaybackCard.switchId) return;
      window.requestAnimationFrame(() => {
        if (switchId !== state.qishuiPlaybackCard.switchId) return;
        phone.classList.remove('is-switching-preparing', enterClass);
        window.clearTimeout(state.qishuiPlaybackCard.switchTimer);
        state.qishuiPlaybackCard.switchTimer = window.setTimeout(
          () => finishQishuiPlaybackSwitch(switchId),
          250
        );
      });
    });
  });
}

function handleQishuiPlaybackWheel(event) {
  if (!playbackCardVisible() || state.qishuiPlaybackCard.hiddenByUser) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('#qishuiPlaybackCard')) return false;
  if (target.closest('input, button, select, textarea, [role="slider"]')) return false;
  event.preventDefault();
  event.stopPropagation();
  const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? window.innerHeight : 1;
  state.qishuiPlaybackCard.wheelDelta += event.deltaY * unit;
  if (Math.abs(state.qishuiPlaybackCard.wheelDelta) < 52) return true;
  const direction = state.qishuiPlaybackCard.wheelDelta < 0 ? -1 : 1;
  state.qishuiPlaybackCard.wheelDelta = 0;
  switchQishuiPlaybackTrack(direction);
  return true;
}

function updatePlaybackPageClass() {
  els.appShell.classList.toggle('is-playback-page', state.playbackPage);
  els.appShell.classList.toggle('has-playlist-song-page', state.playlistSongPageOpen);
  els.stage.classList.toggle('is-playback-page', state.playbackPage);
  els.playlistShelf.classList.toggle('is-song-page-open', state.playlistSongPageOpen);
  syncPlaybackLyricVisibility();
  updateDynamicCubeVisibility();
  updateFreeCubeVisibility();
  updateVoidPrismVisibility();
  updateChladniVisibility();
  updateChladniTextTransform();
  updateSonicTopographyVisibility();
  updateCoverParticleVisibility();
  updateWallpaperVisibility();
  syncSandboxPlaybackSurface();
  applyPresetUpscaler({ force: true });
  syncQishuiPlaybackCard();
  resetPlaybackChromeForMode();
}

function enterPlaybackPage() {
  state.playbackPage = true;
  updatePlaybackPageClass();
  renderPlaylistOrbit(playbackPlaylists());
  requestOrbFrame();
}

function enterPresetPlaybackPage(preset) {
  state.sandbox.playbackPresetId = '';
  state.sandbox.playbackKeepBackground = false;
  state.sandbox.playbackPreviewUrl = '';
  setDiyOpen(false);
  setDiyPreset(preset);
  enterPlaybackPage();
}

function returnHomePage() {
  state.playbackPage = false;
  state.playbackPlaylistPickerOpen = false;
  closePlaylistShelf({ reopenPicker: false });
  if (state.diyOpen) setDiyOpen(false);
  resetPlaybackView();
  updatePlaybackPageClass();
}

function enterWallpaperHome() {
  state.playbackPlaylistPickerOpen = false;
  closePlaylistShelf({ reopenPicker: false });
  if (state.diyOpen) setDiyOpen(false);
  state.sandbox.playbackPresetId = '';
  state.sandbox.playbackKeepBackground = false;
  state.sandbox.playbackPreviewUrl = '';
  setTextPreset('none');
  commitDiyPage('wallpaper');
  resetPlaybackView();
  requestOrbFrame();
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
  closePlaylistShelf({ reopenPicker: false });
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
      const fallback = frame.querySelector('span');
      if (fallback) fallback.textContent = playlist.local || playlist.provider === 'local' ? 'LOCAL' : 'LIST';
      return;
    }
    image.src = url;
    frame.classList.add('has-cover');
  });
}

function shelfSongSubtitle(song) {
  if (isLocalSong(song)) return safeText(song.album, '本地音乐');
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
  state.songButtonCache = [];
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
  state.songButtonCache = Array.from(els.playlistSongStack.querySelectorAll('.shelf-song-button'));
  updateShelfCurrentSong();
  const currentIndex = state.activePlaylistSongs.findIndex((song) => {
    const currentId = state.currentSong && state.currentSong.id ? String(state.currentSong.id) : '';
    return currentId && String(song.id) === currentId;
  });
  setSongFocus(currentIndex >= 0 ? currentIndex : clamp(state.songFocusIndex || 0, 0, state.activePlaylistSongs.length - 1), { forceAll: true });
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
  state.playbackPlaylistPickerOpen = false;
  const local = playlist.local || playlist.provider === 'local';
  if (els.selectedPlaylistAlbum) els.selectedPlaylistAlbum.classList.toggle('is-local-playlist', local);
  if (els.playlistLocalAddButton) els.playlistLocalAddButton.hidden = !local;
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
  state.songButtonCache = [];
  state.playlistSongPageOpen = true;
  state.playbackPlaylistPickerOpen = false;
  if (els.selectedPlaylistAlbum) els.selectedPlaylistAlbum.classList.remove('is-local-playlist');
  if (els.playlistLocalAddButton) els.playlistLocalAddButton.hidden = true;
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

function closePlaylistShelf({ resetActive = false, reopenPicker = true } = {}) {
  clearShelfPressTimer();
  state.playlistLoadRequestId += 1;
  state.shelfLoadingPlaylistId = '';
  els.playlistShelf.classList.remove('is-open', 'is-loading', 'is-playback-mode', 'is-pressing', 'is-dragging', 'is-position-dragging', 'is-back-facing');
  els.playlistShelf.hidden = true;
  els.playlistShelf.removeAttribute('aria-busy');
  state.playlistSongPageOpen = false;
  state.playbackPlaylistPickerOpen = !!(reopenPicker && state.playbackPage);
  state.shelfDragging = false;
  state.shelfPointerId = null;
  state.shelfInteraction = '';
  if (els.playlistLocalAddButton) els.playlistLocalAddButton.hidden = true;
  if (resetActive) {
    state.shelfHiddenByUser = false;
    state.activePlaylistId = '';
    state.activePlaylist = null;
    state.activePlaylistSongs = [];
    state.songButtonCache = [];
    updateActivePlaylistCard();
  }
  updateActivePlaylistCard();
  updatePlaybackPageClass();
}

async function loadPlaylistFromCard(card) {
  const playlistId = card.dataset.playlistId;
  const provider = card.dataset.playlistProvider || state.activeProvider;
  const playlistIndex = Number(card.dataset.playlistIndex || '0');
  if (!playlistId) return;
  if (Number.isFinite(playlistIndex) && playlistIndex !== state.playlistFocusIndex) {
    setPlaylistFocus(playlistIndex);
  }
  state.playbackPlaylistPickerOpen = false;
  syncPlaybackCardPanelState();
  if (String(playlistId) === LOCAL_PLAYLIST_ID) {
    openLocalPlaylist();
    return;
  }
  const info = providerInfo(provider);
  const playlistName = card.dataset.playlistName || `${info.label}\u6b4c\u5355`;
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

  const requestId = state.playlistLoadRequestId + 1;
  state.playlistLoadRequestId = requestId;
  state.shelfLoadingPlaylistId = String(playlistId);
  card.classList.add('is-loading');
  card.disabled = true;
  card.setAttribute('aria-busy', 'true');
  renderShelfLoading(playlist);
  const requestStillActive = () => requestId === state.playlistLoadRequestId
    && state.playbackPage
    && state.playlistSongPageOpen
    && state.activeProvider === info.id
    && String(state.activePlaylistId) === String(playlistId);
  try {
    const data = await apiJson(`${providerPath('/playlist/tracks', provider)}?${query({ id: playlistId })}`);
    if (!requestStillActive()) return;
    const songs = Array.isArray(data.songs) ? data.songs : [];
    if (!songs.length) {
      renderPlaylistShelf(playlist, []);
      toast(`歌单「${playlistName}」暂无可播放歌曲`);
      return;
    }
    renderPlaylistShelf(playlist, songs);
  } catch (error) {
    if (requestStillActive()) {
      renderPlaylistShelf(playlist, []);
      toast(error.message);
    }
  } finally {
    if (requestId === state.playlistLoadRequestId) state.shelfLoadingPlaylistId = '';
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
  }

  button.classList.add('is-loading');
  button.disabled = true;
  try {
    if (isLocalSong(song)) {
      state.queue = state.activePlaylistSongs;
      state.queueIndex = index;
      state.localQueueActive = true;
      const loaded = await loadSong(song);
      if (loaded) {
        updateShelfCurrentSong();
        setSongFocus(index);
        closePlaylistShelf({ reopenPicker: false });
        toast(`正在播放：${safeText(song.title, '本地歌曲')}`);
      }
      return;
    }
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
      closePlaylistShelf({ reopenPicker: false });
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

function isLyricCreditLine(text) {
  return /^作词|^作曲|^编曲|^制作|^出品|^发行/.test(text);
}

const LYRIC_TRACK_MAIN = 'main';
const LYRIC_TRACK_TRANSLATION = 'translation';
const LYRIC_TRACK_ROMANIZATION = 'romanization';
const LYRIC_TRACK_MATCH_TOLERANCE_SECONDS = 0.35;

function mergeLyricText(first, second) {
  const left = String(first || '').trim();
  const right = String(second || '').trim();
  if (!left) return right;
  if (!right || left === right) return left;
  return `${left}\n${right}`;
}

function glyphTimingsFromWordTimings(wordTimings, lineEndTime = Number.NaN) {
  if (!Array.isArray(wordTimings) || !wordTimings.length) return [];
  return wordTimings
    .map((timing, index) => {
      const start = Number(timing && timing.startTime);
      if (!Number.isFinite(start)) return null;
      const explicitDuration = Number(timing.duration);
      const nextStart = Number(wordTimings[index + 1] && wordTimings[index + 1].startTime);
      const end = Number.isFinite(explicitDuration) && explicitDuration > 0
        ? start + explicitDuration
        : Number.isFinite(nextStart) && nextStart > start
        ? nextStart
        : Number.isFinite(lineEndTime) && lineEndTime > start
        ? lineEndTime
        : start + 0.16;
      return {
        char: timing.char,
        start,
        end,
        startTime: start,
        duration: Math.max(0.04, end - start),
        trackId: timing.trackId || LYRIC_TRACK_MAIN
      };
    })
    .filter(Boolean);
}

function parseInlineLrcLyric(rawText, trackId = LYRIC_TRACK_MAIN) {
  const source = String(rawText || '');
  const wordTimings = [];
  let text = '';
  let cursor = 0;
  let currentStart = Number.NaN;
  const markerPattern = /<(\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?)>/g;
  let markerMatch;

  const appendChunk = (chunk) => {
    Array.from(chunk || '').forEach((char) => {
      text += char;
      if (char.trim() && Number.isFinite(currentStart)) {
        wordTimings.push({
          char,
          startTime: currentStart,
          duration: Number.NaN,
          trackId
        });
      }
    });
  };

  while ((markerMatch = markerPattern.exec(source))) {
    appendChunk(source.slice(cursor, markerMatch.index));
    currentStart = parseLyricTime(markerMatch[1]);
    cursor = markerPattern.lastIndex;
  }
  appendChunk(source.slice(cursor));

  const cleanText = text.trim();
  return {
    text: cleanText,
    wordTimings,
    glyphTimings: glyphTimingsFromWordTimings(wordTimings)
  };
}

function normalizeParsedLyricLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => line && Number.isFinite(Number(line.time)) && safeText(line.text, '').trim())
    .sort((a, b) => Number(a.time) - Number(b.time))
    .reduce((result, line) => {
      const previous = result[result.length - 1];
      if (previous && Math.abs(Number(previous.time) - Number(line.time)) < 0.001) {
        previous.text = mergeLyricText(previous.text, line.text);
        if (Number.isFinite(Number(line.endTime))) {
          previous.endTime = Number.isFinite(Number(previous.endTime))
            ? Math.max(Number(previous.endTime), Number(line.endTime))
            : Number(line.endTime);
        }
        previous.wordTimings = [...(previous.wordTimings || []), ...(line.wordTimings || [])];
        previous.glyphTimings = [...(previous.glyphTimings || []), ...(line.glyphTimings || [])];
        return result;
      }
      result.push({ ...line });
      return result;
    }, []);
}

function completeLineWordTimings(lines) {
  return (Array.isArray(lines) ? lines : []).map((line, index, allLines) => {
    if (!Array.isArray(line.wordTimings) || !line.wordTimings.length) return line;
    const nextTime = Number(allLines[index + 1] && allLines[index + 1].time);
    const lineEndTime = Number.isFinite(Number(line.endTime))
      ? Number(line.endTime)
      : Number.isFinite(nextTime)
      ? nextTime
      : Number.NaN;
    return {
      ...line,
      glyphTimings: glyphTimingsFromWordTimings(line.wordTimings, lineEndTime)
    };
  });
}

function parseLrc(text, trackId = LYRIC_TRACK_MAIN) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const stamps = Array.from(rawLine.matchAll(/\[([0-9:.]+)\]/g));
    if (!stamps.length) return;
    const times = stamps
      .map((stamp) => parseLyricTime(stamp[1]))
      .filter((time) => Number.isFinite(time));
    const time = times[times.length - 1];
    if (!Number.isFinite(time)) return;
    const parsed = parseInlineLrcLyric(rawLine.replace(/\[[^\]]+\]/g, ''), trackId);
    if (!parsed.text || isLyricCreditLine(parsed.text)) return;
    lines.push({
      time,
      text: parsed.text,
      trackId,
      wordTimings: parsed.wordTimings,
      glyphTimings: parsed.glyphTimings
    });
  });
  return completeLineWordTimings(normalizeParsedLyricLines(lines));
}

function pushKaraokeGlyphTimings(glyphTimings, tokenText, tokenStartMs, tokenDurationMs, wordTimings = null, trackId = LYRIC_TRACK_MAIN) {
  const glyphs = Array.from(tokenText).filter((glyph) => glyph.trim());
  const glyphCount = glyphs.length;
  if (!glyphCount) return;
  const start = tokenStartMs / 1000;
  const duration = Math.max(tokenDurationMs / 1000, 0.04 * glyphCount);
  const step = duration / glyphCount;
  for (let index = 0; index < glyphCount; index += 1) {
    const char = glyphs[index];
    const startTime = start + step * index;
    glyphTimings.push({
      char,
      start: startTime,
      end: start + step * (index + 1),
      startTime,
      duration: step,
      trackId
    });
    if (Array.isArray(wordTimings)) {
      wordTimings.push({
        char,
        startTime,
        duration: step,
        trackId
      });
    }
  }
}

function parseKaraokeLyric(text, trackId = LYRIC_TRACK_MAIN) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const lineMatch = /^\[(\d+)\s*,\s*(\d+)\](.*)$/.exec(rawLine.trim());
    if (!lineMatch) return;
    const lineStartMs = Number(lineMatch[1]);
    const lineDurationMs = Number(lineMatch[2]);
    if (!Number.isFinite(lineStartMs) || !Number.isFinite(lineDurationMs)) return;
    const tokens = [];
    const tokenPattern = /(?:\((\d+)\s*,\s*(\d+)(?:\s*,\s*[^)]*)?\)|<(\d+)\s*,\s*(\d+)(?:\s*,\s*[^>]*)?>)([^()<]*)/g;
    let tokenMatch;
    while ((tokenMatch = tokenPattern.exec(lineMatch[3] || ''))) {
      const rawTokenStartMs = Number(tokenMatch[1] || tokenMatch[3]);
      const tokenDurationMs = Number(tokenMatch[2] || tokenMatch[4]);
      const tokenText = tokenMatch[5] || '';
      if (!Number.isFinite(rawTokenStartMs) || !Number.isFinite(tokenDurationMs) || !tokenText) continue;
      const tokenStartMs = rawTokenStartMs >= lineStartMs - 2 ? rawTokenStartMs : lineStartMs + rawTokenStartMs;
      tokens.push({ startMs: tokenStartMs, durationMs: tokenDurationMs, text: tokenText });
    }
    const lyric = tokens.map((token) => token.text).join('').trim();
    if (!lyric || isLyricCreditLine(lyric)) return;
    const glyphTimings = [];
    const wordTimings = [];
    tokens.forEach((token) => pushKaraokeGlyphTimings(glyphTimings, token.text, token.startMs, token.durationMs, wordTimings, trackId));
    if (!glyphTimings.length) return;
    lines.push({
      time: lineStartMs / 1000,
      endTime: (lineStartMs + Math.max(lineDurationMs, 1)) / 1000,
      text: lyric,
      trackId,
      wordTimings,
      glyphTimings
    });
  });
  return normalizeParsedLyricLines(lines);
}

function lyricPayloadText(payload) {
  const candidates = [
    payload && payload.lrc && payload.lrc.lyric,
    payload && payload.tlyric && payload.tlyric.lyric,
    payload && payload.klyric && payload.klyric.lyric,
    payload && payload.yrc && payload.yrc.lyric,
    payload && payload.romalrc && payload.romalrc.lyric
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
}

function parseLyricBpm(...texts) {
  for (const text of texts) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const match = /\[(?:bpm|tempo)\s*:\s*([\d.]+)\]/i.exec(text)
      || /\b(?:bpm|tempo)\s*[=:]\s*([\d.]+)/i.exec(text);
    const bpm = match ? Number(match[1]) : Number.NaN;
    if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 260) return bpm;
  }
  return Number.NaN;
}

function lyricTrackFromLine(line, trackId) {
  return {
    trackId,
    time: Number(line.time) || 0,
    endTime: Number.isFinite(Number(line.endTime)) ? Number(line.endTime) : undefined,
    text: safeText(line.text, ''),
    wordTimings: Array.isArray(line.wordTimings) ? line.wordTimings : [],
    glyphTimings: Array.isArray(line.glyphTimings) ? line.glyphTimings : []
  };
}

function attachLyricTrack(line, trackLine, trackId) {
  if (!line || !trackLine || !trackId) return line;
  const tracks = { ...(line.tracks || {}) };
  tracks[trackId] = lyricTrackFromLine(trackLine, trackId);
  const next = { ...line, tracks };
  if (trackId === LYRIC_TRACK_TRANSLATION) next.translationText = safeText(trackLine.text, '');
  if (trackId === LYRIC_TRACK_ROMANIZATION) next.romanizationText = safeText(trackLine.text, '');
  return next;
}

function findClosestLyricLine(lines, time, tolerance = LYRIC_TRACK_MATCH_TOLERANCE_SECONDS) {
  if (!Array.isArray(lines) || !lines.length || !Number.isFinite(Number(time))) return null;
  let low = 0;
  let high = lines.length - 1;
  let closest = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineTime = Number(lines[mid] && lines[mid].time);
    if (!Number.isFinite(lineTime)) break;
    if (!closest || Math.abs(lineTime - time) < Math.abs(Number(closest.time) - time)) closest = lines[mid];
    if (lineTime < time) low = mid + 1;
    else if (lineTime > time) high = mid - 1;
    else break;
  }
  if (!closest || Math.abs(Number(closest.time) - time) > tolerance) return null;
  return closest;
}

function mergeLyricTracks(mainLines, trackGroups = [], bpm = Number.NaN) {
  const merged = normalizeParsedLyricLines(mainLines).map((line) => {
    const next = attachLyricTrack(line, line, LYRIC_TRACK_MAIN);
    return Number.isFinite(bpm) ? { ...next, bpm } : next;
  });
  trackGroups.forEach((group) => {
    if (!group || !group.trackId || !Array.isArray(group.lines) || !group.lines.length) return;
    group.lines.forEach((trackLine) => {
      const target = findClosestLyricLine(merged, Number(trackLine.time));
      if (!target) return;
      const index = merged.indexOf(target);
      merged[index] = attachLyricTrack(target, Number.isFinite(bpm) ? { ...trackLine, bpm } : trackLine, group.trackId);
    });
  });
  return merged;
}

function parseLyricPayload(payload) {
  const yrcText = payload && payload.yrc && payload.yrc.lyric;
  const krcText = payload && payload.klyric && payload.klyric.lyric;
  const lrcText = payload && payload.lrc && payload.lrc.lyric;
  const translationText = payload && payload.tlyric && payload.tlyric.lyric;
  const romanizationText = payload && payload.romalrc && payload.romalrc.lyric;
  const bpm = parseLyricBpm(
    yrcText,
    krcText,
    lrcText,
    translationText,
    romanizationText
  );
  const mainCandidates = [
    { text: yrcText, parser: parseKaraokeLyric },
    { text: krcText, parser: parseKaraokeLyric },
    { text: lrcText, parser: parseLrc }
  ];
  let mainLines = [];
  for (const candidate of mainCandidates) {
    const parsed = candidate.parser(candidate.text, LYRIC_TRACK_MAIN);
    if (parsed.length) {
      mainLines = parsed;
      break;
    }
  }
  if (!mainLines.length) mainLines = parseLrc(lyricPayloadText(payload), LYRIC_TRACK_MAIN);

  return mergeLyricTracks(mainLines, [
    { trackId: LYRIC_TRACK_TRANSLATION, lines: parseLrc(translationText, LYRIC_TRACK_TRANSLATION) },
    { trackId: LYRIC_TRACK_ROMANIZATION, lines: parseLrc(romanizationText, LYRIC_TRACK_ROMANIZATION) }
  ], bpm);
}

function lyricPayloadHasNoLyric(payload) {
  return !!(payload && (payload.nolyric || payload.uncollected || payload.needDesc));
}

function medianNumber(values) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function playbackDurationForLyricSpeed(song = state.currentSong) {
  const songDuration = Number(song && song.duration);
  if (Number.isFinite(songDuration) && songDuration > 0) return songDuration;
  const audioDuration = Number(els.audio && els.audio.duration);
  return Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0;
}

function estimatedLyricLineDuration(lines) {
  const gaps = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = Number(lines[index] && lines[index].time);
    const next = Number(lines[index + 1] && lines[index + 1].time);
    if (Number.isFinite(current) && Number.isFinite(next) && next > current) gaps.push(next - current);
  }
  const medianGap = medianNumber(gaps);
  return Number.isFinite(medianGap) ? clamp(medianGap, 1.5, 6) : 4;
}

function estimatedLyricEndTime(lines) {
  const last = lines[lines.length - 1] || {};
  const lastTime = Number(last.time);
  const explicitEnd = Number(last.endTime);
  if (Number.isFinite(explicitEnd) && Number.isFinite(lastTime) && explicitEnd > lastTime) return explicitEnd;
  return Number.isFinite(lastTime) ? lastTime + estimatedLyricLineDuration(lines) : 0;
}

const LYRIC_AUTO_LINE_MIN_DURATION_SECONDS = 1.15;
const LYRIC_AUTO_LINE_MAX_DURATION_SECONDS = 7.25;
const LYRIC_AUTO_LINE_MIN_GAP_SECONDS = 4.75;
const LYRIC_AUTO_LINE_TAIL_SECONDS = 0.12;
const LYRIC_AUTO_LINE_FAST_PROGRESS = 0.86;

function isCjkLyricGlyph(glyph) {
  const code = glyph && glyph.codePointAt ? glyph.codePointAt(0) : 0;
  return (code >= 0x3040 && code <= 0x30ff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff);
}

function isLyricPauseGlyph(glyph) {
  const code = glyph && glyph.codePointAt ? glyph.codePointAt(0) : 0;
  return ',.;:!?'.includes(glyph)
    || code === 0x3001
    || code === 0x3002
    || code === 0xff0c
    || code === 0xff1f
    || code === 0xff01
    || code === 0xff1b
    || code === 0xff1a;
}

function estimatedLyricVocalDuration(text, lineGap = 0, bpm = Number.NaN) {
  const value = String(text || '').trim();
  if (!value) return LYRIC_AUTO_LINE_MIN_DURATION_SECONDS;
  const latinWords = value.match(/[A-Za-z0-9]+(?:['\u2019][A-Za-z0-9]+)?/g) || [];
  let cjkGlyphs = 0;
  let otherGlyphs = 0;
  let pauseGlyphs = 0;

  Array.from(value).forEach((glyph) => {
    if (!glyph.trim()) return;
    if (isCjkLyricGlyph(glyph)) {
      cjkGlyphs += 1;
    } else if (/[A-Za-z0-9]/.test(glyph) || glyph === '\'' || glyph === '\u2019') {
      return;
    } else if (isLyricPauseGlyph(glyph)) {
      pauseGlyphs += 1;
    } else {
      otherGlyphs += 1;
    }
  });

  const tempoPadding = Number.isFinite(Number(lineGap)) && lineGap > 0
    ? clamp(lineGap * 0.12, 0.25, 1.45)
    : 0.55;
  const pausePadding = Math.min(0.55, pauseGlyphs * 0.08);
  const estimated = clamp(
    0.62 + latinWords.length * 0.5 + cjkGlyphs * 0.36 + otherGlyphs * 0.22 + pausePadding + tempoPadding,
    LYRIC_AUTO_LINE_MIN_DURATION_SECONDS,
    LYRIC_AUTO_LINE_MAX_DURATION_SECONDS
  );
  const numericBpm = Number(bpm);
  if (!Number.isFinite(numericBpm) || numericBpm < 40 || numericBpm > 260) return estimated;
  const beatSeconds = 60 / numericBpm;
  const beatCount = Math.max(1, Math.round(estimated / beatSeconds));
  return clamp(beatCount * beatSeconds, LYRIC_AUTO_LINE_MIN_DURATION_SECONDS, LYRIC_AUTO_LINE_MAX_DURATION_SECONDS);
}

function lineHasTrustedLyricTiming(line) {
  const start = Number(line && line.time);
  const end = Number(line && line.endTime);
  return (Number.isFinite(start) && Number.isFinite(end) && end > start)
    || (Array.isArray(line && line.glyphTimings) && line.glyphTimings.length > 0)
    || (Array.isArray(line && line.wordTimings) && line.wordTimings.length > 0);
}

function autoFitPlainLyricLinePacing(lines, song = state.currentSong) {
  if (!Array.isArray(lines) || !lines.length) return [];
  const duration = playbackDurationForLyricSpeed(song);
  return lines.map((line, index) => {
    if (!line || lineHasTrustedLyricTiming(line)) return line;
    const start = Number(line.time);
    if (!Number.isFinite(start)) return line;
    const nextLine = lines[index + 1];
    const nextTime = Number(nextLine && nextLine.time);
    const hardEnd = Number.isFinite(nextTime) && nextTime > start
      ? nextTime
      : (Number.isFinite(duration) && duration > start ? duration : 0);
    if (!Number.isFinite(hardEnd) || hardEnd <= start) return line;

    const gap = hardEnd - start;
    if (gap < LYRIC_AUTO_LINE_MIN_GAP_SECONDS) return line;
    const estimatedDuration = estimatedLyricVocalDuration(line.text, gap, line.bpm);
    const idleGap = gap - estimatedDuration;
    if (idleGap < Math.max(0.9, gap * 0.16)) return line;

    const maxDuration = Math.max(
      LYRIC_AUTO_LINE_MIN_DURATION_SECONDS,
      Math.min(gap - LYRIC_AUTO_LINE_TAIL_SECONDS, LYRIC_AUTO_LINE_MAX_DURATION_SECONDS)
    );
    const minDuration = Math.min(maxDuration, LYRIC_AUTO_LINE_MIN_DURATION_SECONDS);
    const fittedDuration = clamp(estimatedDuration, minDuration, maxDuration);
    if (!Number.isFinite(fittedDuration) || fittedDuration >= gap - 0.2) return line;
    return {
      ...line,
      autoVocalEndTime: start + fittedDuration
    };
  });
}

function scaleLyricTimingValue(value, anchorTime, scale) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Math.max(0, anchorTime + (numeric - anchorTime) * scale);
}

function scaleLyricDurationValue(value, scale) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Math.max(0, numeric * scale);
}

function scaleLyricGlyphTiming(timing, anchorTime, scale) {
  return {
    ...timing,
    start: scaleLyricTimingValue(timing.start, anchorTime, scale),
    end: scaleLyricTimingValue(timing.end, anchorTime, scale),
    startTime: scaleLyricTimingValue(timing.startTime, anchorTime, scale),
    duration: scaleLyricDurationValue(timing.duration, scale)
  };
}

function scaleLyricWordTiming(timing, anchorTime, scale) {
  return {
    ...timing,
    startTime: scaleLyricTimingValue(timing.startTime, anchorTime, scale),
    duration: scaleLyricDurationValue(timing.duration, scale)
  };
}

function scaleLyricLineTiming(line, anchorTime, scale) {
  const next = { ...line };
  next.time = scaleLyricTimingValue(line.time, anchorTime, scale);
  if (Number.isFinite(Number(line.endTime))) {
    next.endTime = scaleLyricTimingValue(line.endTime, anchorTime, scale);
  }
  if (Array.isArray(line.glyphTimings)) {
    next.glyphTimings = line.glyphTimings.map((timing) => scaleLyricGlyphTiming(timing, anchorTime, scale));
  }
  if (Array.isArray(line.wordTimings)) {
    next.wordTimings = line.wordTimings.map((timing) => scaleLyricWordTiming(timing, anchorTime, scale));
  }
  if (line.tracks && typeof line.tracks === 'object') {
    next.tracks = Object.fromEntries(Object.entries(line.tracks).map(([trackId, track]) => [trackId, {
      ...track,
      time: scaleLyricTimingValue(track.time, anchorTime, scale),
      endTime: scaleLyricTimingValue(track.endTime, anchorTime, scale),
      glyphTimings: Array.isArray(track.glyphTimings)
        ? track.glyphTimings.map((timing) => scaleLyricGlyphTiming(timing, anchorTime, scale))
        : track.glyphTimings,
      wordTimings: Array.isArray(track.wordTimings)
        ? track.wordTimings.map((timing) => scaleLyricWordTiming(timing, anchorTime, scale))
        : track.wordTimings
    }]));
  }
  return next;
}

function lyricAutoSpeedScale(lines, song = state.currentSong) {
  if (!Array.isArray(lines) || lines.length < 3) return 1;
  const duration = playbackDurationForLyricSpeed(song);
  if (!Number.isFinite(duration) || duration < 45) return 1;
  const firstTime = Math.max(0, Number(lines[0] && lines[0].time) || 0);
  const lyricEnd = estimatedLyricEndTime(lines);
  const lyricSpan = lyricEnd - firstTime;
  const targetSpan = duration - firstTime;
  if (!Number.isFinite(lyricSpan) || !Number.isFinite(targetSpan) || lyricSpan < 30 || targetSpan < 30) return 1;

  const scale = targetSpan / lyricSpan;
  const lateGap = lyricEnd - duration;
  const earlyGap = duration - lyricEnd;
  const lateThreshold = Math.max(2.5, duration * 0.035);
  const earlyThreshold = Math.max(18, duration * 0.14);
  const lateMismatch = scale < 1 && Math.abs(1 - scale) >= 0.035 && lateGap > lateThreshold;
  const earlyMismatch = scale > 1 && Math.abs(1 - scale) >= 0.06 && earlyGap > earlyThreshold;
  const withinSafeRange = scale >= 0.6 && scale <= 1.35;
  return withinSafeRange && (lateMismatch || earlyMismatch) ? scale : 1;
}

function autoDetectLyricSpeed(lines, song = state.currentSong) {
  const scale = lyricAutoSpeedScale(lines, song);
  state.lyricTimingScale = scale;
  if (scale === 1) return autoFitPlainLyricLinePacing(lines, song);
  const anchorTime = Math.max(0, Number(lines[0] && lines[0].time) || 0);
  return autoFitPlainLyricLinePacing(lines.map((line) => scaleLyricLineTiming(line, anchorTime, scale)), song);
}

function playbackGlyphRenderMode() {
  if (state.textPreset === 'book') return '';
  if (state.textPreset === 'depth') return isRainGlassPreset() ? 'rain-glass' : 'depth';
  if (state.textPreset === 'book-effect') return 'book-effect';
  return '';
}

function appendPlaybackLyricGlyphs(target, text, options = {}) {
  const wordGlow = !!options.wordGlow;
  const tokens = wordGlow
    ? String(text || '').match(/\r|\n|\s+|[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/gu) || []
    : Array.from(text);
  let glyphIndex = 0;
  tokens.forEach((glyph) => {
    if (glyph === '\r') return;
    if (glyph === '\n') {
      target.appendChild(document.createElement('br'));
      return;
    }
    const span = document.createElement('span');
    const isSpace = !glyph.trim();
    span.className = isSpace
      ? 'playback-lyric-glyph playback-lyric-glyph--space'
      : `playback-lyric-glyph${wordGlow ? ' playback-lyric-glyph--word' : ''}`;
    span.textContent = glyph;
    if (!isSpace) {
      span.dataset.playbackGlyphIndex = String(glyphIndex);
      span.__playbackGlyphIndex = glyphIndex;
      span.style.setProperty('--lyric-glyph-glow-size', `${(1.65 + (glyphIndex % 5) * 0.32).toFixed(2)}px`);
      span.style.setProperty('--lyric-glyph-drift', `${(((glyphIndex % 7) - 3) * 0.22).toFixed(2)}px`);
      glyphIndex += 1;
    }
    target.appendChild(span);
  });
}

function resetPlaybackGlyphCache() {
  state.lyricPlaybackGlyphs = [];
  state.lyricPlaybackGlyphCount = 0;
}

function cachePlaybackGlyphs(layer) {
  if (!layer) {
    resetPlaybackGlyphCache();
    return;
  }
  const glyphs = Array.from(layer.querySelectorAll('.playback-lyric-glyph:not(.playback-lyric-glyph--space)'));
  glyphs.forEach((glyph, fallbackIndex) => {
    if (!Number.isFinite(glyph.__playbackGlyphIndex)) {
      const index = Number(glyph.dataset.playbackGlyphIndex);
      glyph.__playbackGlyphIndex = Number.isFinite(index) ? index : fallbackIndex;
    }
  });
  state.lyricPlaybackGlyphs = glyphs;
  state.lyricPlaybackGlyphCount = glyphs.length;
}

function setPlaybackLayerText(layer, text, useGlyphs, glyphRenderMode = '') {
  clearElement(layer);
  if (useGlyphs) {
    appendPlaybackLyricGlyphs(layer, text, { wordGlow: glyphRenderMode === 'book-effect' });
  } else {
    layer.textContent = text;
  }
  if (layer === els.playbackLyricText) {
    if (useGlyphs) cachePlaybackGlyphs(layer);
    else resetPlaybackGlyphCache();
  }
  layer.setAttribute('data-text', text);
}

function updatePlaybackLyricGlyphProgress(progressPercent) {
  if (!els.playbackLyricText) return;
  let glyphs = state.lyricPlaybackGlyphs;
  if (!Array.isArray(glyphs) || glyphs.length !== state.lyricPlaybackGlyphCount) {
    cachePlaybackGlyphs(els.playbackLyricText);
    glyphs = state.lyricPlaybackGlyphs;
  }
  if (!glyphs.length) return;
  const head = clamp((Number(progressPercent) || 0) / 100, 0, 1) * glyphs.length;
  glyphs.forEach((glyph, fallbackIndex) => {
    const glyphIndex = Number.isFinite(glyph.__playbackGlyphIndex) ? glyph.__playbackGlyphIndex : fallbackIndex;
    const hot = bookGlyphEase(head - glyphIndex);
    const roll = bookGlyphEase(1 - Math.abs(head - (glyphIndex + 0.5)) / 1.35);
    const hotValue = hot.toFixed(4);
    const rollValue = roll.toFixed(4);
    const alphaValue = (0.68 + hot * 0.32).toFixed(4);
    const hotGlowValue = Math.min(0.56, hot * 0.56).toFixed(4);
    const blurValue = state.lyricGlyphRenderMode === 'book-effect'
      ? `${Math.max(0, 1.9 - hot * 1.9).toFixed(2)}px`
      : '0px';
    const signature = `${hotValue}|${rollValue}|${alphaValue}|${hotGlowValue}|${blurValue}`;
    if (glyph.__playbackGlyphSignature === signature) return;
    glyph.__playbackGlyphSignature = signature;
    glyph.style.setProperty('--lyric-glyph-hot', hotValue);
    glyph.style.setProperty('--lyric-glyph-roll', rollValue);
    glyph.style.setProperty('--lyric-glyph-alpha', alphaValue);
    glyph.style.setProperty('--lyric-glyph-hot-glow', hotGlowValue);
    glyph.style.setProperty('--lyric-glyph-blur', blurValue);
  });
}

function triggerFocusEchoTransition() {
  if (!els.playbackLyricScene) return;
  if (state.focusEchoAnimationFrame) {
    window.cancelAnimationFrame(state.focusEchoAnimationFrame);
    state.focusEchoAnimationFrame = 0;
  }
  els.playbackLyricScene.classList.remove('is-focus-echo-entering');
  if (state.textPreset !== 'focus-echo' || reducedMotion) return;
  state.focusEchoAnimationFrame = window.requestAnimationFrame(() => {
    state.focusEchoAnimationFrame = 0;
    if (state.textPreset === 'focus-echo') {
      els.playbackLyricScene.classList.add('is-focus-echo-entering');
    }
  });
}

function setPlaybackLyricLine(text, subtitle, progress = 0, currentTime = Number.NaN) {
  const line = safeText(text, playbackLyricText());
  const nextSubtitle = safeText(subtitle, playbackLyricSubtitle());
  const progressPercent = clamp(progress, 0, 1) * 100;
  const glyphRenderMode = playbackGlyphRenderMode();
  const lineChanged = line !== state.lyricDisplayText || glyphRenderMode !== state.lyricGlyphRenderMode;

  if (lineChanged) {
    els.playbackLyricScene.querySelectorAll('.playback-lyric-layer').forEach((layer) => {
      setPlaybackLayerText(layer, line, glyphRenderMode && layer === els.playbackLyricText, glyphRenderMode);
    });
    state.lyricDisplayText = line;
    state.lyricGlyphRenderMode = glyphRenderMode;
    if (state.textPreset === 'focus-echo') triggerFocusEchoTransition();
  }

  if (nextSubtitle !== state.lyricSubtitleText) {
    els.playbackLyricSubtitle.textContent = nextSubtitle;
    updateBookLyricArtist(nextSubtitle);
    state.lyricSubtitleText = nextSubtitle;
  }

  if (Math.abs(progressPercent - state.lyricProgressPercent) >= 0.01) {
    els.playbackLyricScene.style.setProperty('--lyric-line-progress', `${progressPercent.toFixed(2)}%`);
    state.lyricProgressPercent = progressPercent;
  }
  if (glyphRenderMode) updatePlaybackLyricGlyphProgress(progressPercent);

  if (state.textPreset === 'flow') syncBlurLyricComponent(line);
  if (state.textPreset === 'book') updateBookLyricLines(progressPercent, currentTime);
  if (playbackCardLyricsVisible()) {
    updateQishuiPlaybackLyrics(line, nextSubtitle, currentTime);
  }
}

function lyricTimelineTime(currentTime, visualLead = 0) {
  return Math.max(0, Number(currentTime) + Number(visualLead) - LYRIC_TIMESTAMP_COMPENSATION_SECONDS);
}

function findLyricIndexAtTime(lines, currentTime, visualLead = 0) {
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  const time = lyricTimelineTime(currentTime, visualLead);
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

function playbackLyricVisualLeadSeconds() {
  return state.textPreset === 'book' ? BOOK_LYRIC_VISUAL_LEAD_SECONDS : 0;
}

function updatePlayerClock(position, duration, playing = false) {
  const safePosition = Math.max(0, Number(position) || 0);
  const safeDuration = Math.max(0, Number(duration) || 0);
  state.playerClock = {
    position: safeDuration > 0 ? Math.min(safePosition, safeDuration) : safePosition,
    duration: safeDuration,
    updatedAt: performance.now(),
    playing: !!playing
  };
}

function estimatedPlayerClockTime(fallback = 0) {
  const clock = state.playerClock || {};
  const base = Number(clock.position);
  if (!Number.isFinite(base)) return Math.max(0, Number(fallback) || 0);
  const elapsed = clock.playing && Number.isFinite(clock.updatedAt)
    ? Math.max(0, (performance.now() - clock.updatedAt) / 1000)
    : 0;
  const duration = Number(clock.duration);
  const current = base + elapsed;
  return Math.max(0, Number.isFinite(duration) && duration > 0 ? Math.min(current, duration) : current);
}

function isPlaybackClockRunning() {
  if (els.audio && els.audio.src) return !els.audio.paused && !els.audio.ended;
  return !!(state.playerClock && state.playerClock.playing);
}

function currentPlaybackLyricTime(fallback = 0) {
  if (els.audio && els.audio.src && Number.isFinite(els.audio.currentTime)) {
    return Math.max(0, els.audio.currentTime);
  }
  if (state.playerClock && state.playerClock.updatedAt > 0 && Number.isFinite(Number(state.playerClock.position))) {
    return estimatedPlayerClockTime(fallback);
  }
  const songPosition = Number(state.currentSong && state.currentSong.position);
  if (Number.isFinite(songPosition)) return Math.max(0, songPosition);
  return Math.max(0, Number(fallback) || 0);
}

function syncPlaybackLyricAtTime(currentTime = Number.NaN) {
  const time = Number.isFinite(Number(currentTime))
    ? Math.max(0, Number(currentTime))
    : currentPlaybackLyricTime();
  updatePlaybackLyricAtTime(time, playbackLyricVisualLeadSeconds());
}

function syncPlaybackLyricToCurrentTime() {
  syncPlaybackLyricAtTime(currentPlaybackLyricTime());
}

function syncPlaybackLyricAnimationFrame() {
  if (!state.lyricLines.length || !isPlaybackClockRunning()) return;
  const time = currentPlaybackLyricTime();
  const signature = `${state.lyricSignature}|${state.textPreset}`;
  if (
    state.lyricFrameSignature === signature &&
    state.lyricFramePreset === state.textPreset &&
    Math.abs(time - state.lyricFrameTime) < 0.0005
  ) {
    return;
  }
  state.lyricFrameTime = time;
  state.lyricFramePreset = state.textPreset;
  state.lyricFrameSignature = signature;
  syncPlaybackLyricAtTime(time);
}

function lyricProgressForLineAtTime(line, displayTime, endTime, options = {}) {
  const start = Number(line && line.time);
  const stop = Number(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return 1;
  const linear = clamp((displayTime - start) / (stop - start), 0, 1);
  if (options.linear) return linear;
  const autoVocalEnd = Number(line && line.autoVocalEndTime);
  if (!Number.isFinite(autoVocalEnd) || autoVocalEnd <= start || autoVocalEnd >= stop) return linear;
  if (displayTime <= autoVocalEnd) {
    return bookGlyphEase((displayTime - start) / (autoVocalEnd - start)) * LYRIC_AUTO_LINE_FAST_PROGRESS;
  }
  const tailProgress = bookGlyphEase((displayTime - autoVocalEnd) / (stop - autoVocalEnd));
  return LYRIC_AUTO_LINE_FAST_PROGRESS + (1 - LYRIC_AUTO_LINE_FAST_PROGRESS) * tailProgress;
}

function bookLyricProgressEndTime(line, fallbackEndTime) {
  const start = Number(line && line.time);
  const fallback = Number(fallbackEndTime);
  if (!Number.isFinite(start) || !Number.isFinite(fallback) || fallback <= start) return fallbackEndTime;
  const autoVocalEnd = Number(line && line.autoVocalEndTime);
  if (Number.isFinite(autoVocalEnd) && autoVocalEnd > start && autoVocalEnd < fallback) {
    return autoVocalEnd;
  }
  return fallbackEndTime;
}

function updatePlaybackLyricAtTime(currentTime = els.audio.currentTime || 0, visualLead = 0) {
  const lines = state.lyricLines;
  const subtitle = playbackLyricSubtitle();
  if (!lines.length) {
    setPlaybackLyricLine(playbackLyricText(), subtitle, 0);
    state.lyricIndex = -1;
    return;
  }

  const displayTime = lyricTimelineTime(currentTime, visualLead);
  const index = findLyricIndexAtTime(lines, currentTime, visualLead);

  const line = lines[index];
  const nextLine = lines[index + 1];
  const timedEnd = Number(line.endTime);
  const fallbackDuration = playbackDurationForLyricSpeed();
  const fallbackEnd = nextLine ? nextLine.time : Math.max(line.time + 4, fallbackDuration || line.time + 4);
  const endTime = Number.isFinite(timedEnd) && timedEnd > line.time
    ? (nextLine ? Math.min(timedEnd, nextLine.time) : timedEnd)
    : fallbackEnd;
  const progressEndTime = state.textPreset === 'book' ? bookLyricProgressEndTime(line, endTime) : endTime;
  const progress = lyricProgressForLineAtTime(line, displayTime, progressEndTime, { linear: state.textPreset === 'book' });
  if (state.lyricIndex !== index) state.lyricIndex = index;
  setPlaybackLyricLine(line.text, subtitle, progress, displayTime);
}

function lyricSignatureForSong(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  return id ? `${id}|${safeText(song && song.title, '')}` : '';
}

function clearLyricRetryTimer() {
  if (!state.lyricRetryTimer) return;
  window.clearTimeout(state.lyricRetryTimer);
  state.lyricRetryTimer = 0;
}

function clearLyricRetryAttempts(signature) {
  if (signature) {
    delete state.lyricRetryAttempts[signature];
    return;
  }
  state.lyricRetryAttempts = {};
}

function schedulePlaybackLyricRetry(signature, delay = 1200) {
  if (!signature) return;
  clearLyricRetryTimer();
  const attempts = (state.lyricRetryAttempts[signature] || 0) + 1;
  state.lyricRetryAttempts[signature] = attempts;
  const retryDelay = Math.min(5000, Math.round(delay * attempts));
  state.lyricRetryTimer = window.setTimeout(() => {
    state.lyricRetryTimer = 0;
    if (lyricSignatureForSong(state.currentSong) === signature) loadPlaybackLyrics(state.currentSong);
  }, retryDelay);
}

async function loadPlaybackLyrics(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  const signature = lyricSignatureForSong(song);
  if (document.hidden && !isLocalSong(song)) return;
  if (!id || signature === state.lyricLoadingSignature) return;
  if (signature === state.lyricSignature && (state.lyricLines.length || state.lyricNoLyricSignature === signature)) return;
  if (isLocalSong(song)) {
    clearLyricRetryTimer();
    clearLyricRetryAttempts();
    state.lyricLoadingSignature = '';
    state.lyricSignature = signature;
    state.lyricNoLyricSignature = signature;
    state.lyricLines = [];
    state.lyricIndex = -1;
    state.lyricBookSignature = '';
    state.lyricBookIndex = -2;
    state.lyricBookCurrentLine = null;
    state.lyricProgressPercent = -1;
    state.lyricTimingScale = 1;
    resetLyricFrameSync();
    resetBookLyricScrollState();
    setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    if (state.textPreset === 'book') renderBookLyricLines(true);
    return;
  }
  clearLyricRetryTimer();
  state.lyricLoadingSignature = signature;
  state.lyricSignature = signature;
  state.lyricNoLyricSignature = '';
  state.lyricLines = [];
  state.lyricIndex = -1;
  state.lyricBookSignature = '';
  state.lyricBookIndex = -2;
  state.lyricBookCurrentLine = null;
  state.lyricProgressPercent = -1;
  state.lyricTimingScale = 1;
  resetLyricFrameSync();
  resetBookLyricScrollState();
  setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);

  try {
    const payload = await apiJson(`/api/netease/lyric?${query({ id })}`);
    if (signature !== state.lyricSignature) return;
    const parsed = autoDetectLyricSpeed(parseLyricPayload(payload), song);
    state.lyricLines = parsed.length ? parsed : [];
    if (!parsed.length) {
      if (lyricPayloadHasNoLyric(payload)) state.lyricNoLyricSignature = signature;
      else {
        state.lyricSignature = '';
        schedulePlaybackLyricRetry(signature);
      }
    }
    if (parsed.length || state.lyricNoLyricSignature === signature) {
      clearLyricRetryTimer();
      clearLyricRetryAttempts(signature);
    }
    state.lyricIndex = -1;
    state.lyricBookSignature = '';
    state.lyricBookIndex = -2;
    state.lyricBookCurrentLine = null;
    resetLyricFrameSync();
    resetBookLyricScrollState();
    if (state.textPreset === 'book') renderBookLyricLines(true);
    syncPlaybackLyricToCurrentTime();
  } catch (error) {
    if (signature === state.lyricSignature) {
      state.lyricSignature = '';
      state.lyricNoLyricSignature = '';
      state.lyricLines = [];
      state.lyricTimingScale = 1;
      state.lyricBookSignature = '';
      state.lyricBookIndex = -2;
      state.lyricBookCurrentLine = null;
      resetLyricFrameSync();
      resetBookLyricScrollState();
      setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
      schedulePlaybackLyricRetry(signature);
    }
  } finally {
    if (state.lyricLoadingSignature === signature) state.lyricLoadingSignature = '';
  }
}

function updatePlaybackLyricText(song = state.currentSong) {
  if (!els.playbackLyricScene) return;
  updateLyricPalette(song);
  const signature = lyricSignatureForSong(song);
  if (!signature) {
    state.lyricSignature = '';
    state.lyricLoadingSignature = '';
    state.lyricNoLyricSignature = '';
    clearLyricRetryTimer();
    clearLyricRetryAttempts();
    state.lyricLines = [];
    state.lyricIndex = -1;
    state.lyricTimingScale = 1;
    state.lyricBookSignature = '';
    state.lyricBookIndex = -2;
    state.lyricBookCurrentLine = null;
    resetLyricFrameSync();
    resetBookLyricScrollState();
    setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    return;
  }
  if (signature !== state.lyricSignature) {
    loadPlaybackLyrics(song);
    return;
  }
  syncPlaybackLyricToCurrentTime();
}

function setPlaybackLyricVisible(visible) {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.hidden = !visible;
}

function textLyricsEnabled(preset = state.textPreset) {
  return preset !== 'none';
}

function syncPlaybackLyricVisibility() {
  const enabled = textLyricsEnabled();
  setPlaybackLyricVisible(state.playbackPage && enabled);
  if (els.qishuiPlaybackLyrics) els.qishuiPlaybackLyrics.hidden = false;
  if (els.qishuiPlaybackPhone) {
    els.qishuiPlaybackPhone.classList.remove('is-lyrics-hidden');
  }
  [els.lyricBrightnessRange, els.lyricSpeedRange].forEach((control) => {
    if (control) control.disabled = !enabled;
  });
}

function updatePlaybackSceneTransform() {
  if (!els.playbackLyricScene) return;
  setStylePropertyIfChanged(els.playbackLyricScene, '--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
  setStylePropertyIfChanged(els.playbackLyricScene, '--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
  setStylePropertyIfChanged(els.playbackLyricScene, '--playback-zoom', (state.playbackVisual.zoom || 1).toFixed(3));
  if (coverParticlePresetVisible()) {
    setStylePropertyIfChanged(els.coverParticleScene, '--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
    setStylePropertyIfChanged(els.coverParticleScene, '--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
    setStylePropertyIfChanged(els.coverParticleScene, '--playback-zoom', (state.playbackVisual.zoom || 1).toFixed(3));
  }
  syncShelfRotationToPlaybackView();
}

function selectableTextPreset(preset) {
  return ['none', 'depth', 'flow', 'book-effect', 'focus-echo'].includes(preset) ? preset : 'depth';
}

function textPresetButtons() {
  const root = els.diySidebar || document;
  return Array.from(root.querySelectorAll('[data-text-preset]'));
}

function syncTextPresetButtons() {
  const locked = state.diyPreset === 'book';
  textPresetButtons().forEach((button) => {
    const active = button.dataset.textPreset === state.textPreset;
    button.classList.toggle('is-active', active);
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    button.classList.toggle('is-disabled', locked);
  });
  document.querySelectorAll('[data-inline-text-presets]').forEach((group) => {
    group.hidden = locked;
  });
}

function updateTextPresetAvailability() {
  syncTextPresetButtons();
}

function textFontPresetId(preset = state.textPreset) {
  if (TEXT_PALETTE_PRESET_IDS.includes(preset)) return preset;
  if (TEXT_PALETTE_PRESET_IDS.includes(state.lastSelectableTextPreset)) return state.lastSelectableTextPreset;
  return 'depth';
}

function textFontOption(fontId = TEXT_FONT_DEFAULT_ID) {
  const id = normalizeTextFontId(fontId);
  return TEXT_FONT_OPTIONS.find((option) => option.id === id)
    || TEXT_FONT_OPTIONS.find((option) => option.id === TEXT_FONT_DEFAULT_ID);
}

function textFontLicenseAvailability(option) {
  if (!option || option.id === TEXT_FONT_DEFAULT_ID) return 'system';
  if (option.embeddedFamily) return 'bundled';
  if (TEXT_FONT_LICENSE_REQUIRED_IDS.has(option.id)) return 'authorization-required';
  if (TEXT_FONT_LICENSE_VERIFIED_NOT_BUNDLED_IDS.has(option.id)) return 'verified-not-bundled';
  return 'unverified';
}

function textFontPreference(preset = state.textPreset) {
  const presetId = textFontPresetId(preset);
  const fontId = normalizeTextFontId(state.textFontPreferences?.[presetId]);
  state.textFontPreferences[presetId] = fontId;
  return textFontOption(fontId);
}

function quoteTextFontFamily(family) {
  return `"${String(family || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function textFontFamilyStack(option = textFontPreference()) {
  const fallback = TEXT_FONT_FALLBACKS[option?.category] || TEXT_FONT_FALLBACKS.system;
  const exactFamilies = Array.isArray(option?.families)
    ? option.families.map(quoteTextFontFamily)
    : [];
  return [...new Set([...exactFamilies, ...fallback.families])].join(', ');
}

function activeTextFontFamilyStack() {
  return state.textFontStack || textFontFamilyStack();
}

function textFontMetrics(context, family, fallback, sample) {
  context.font = `72px ${quoteTextFontFamily(family)}, ${fallback}`;
  const metrics = context.measureText(sample);
  return [
    metrics.width,
    metrics.actualBoundingBoxLeft || 0,
    metrics.actualBoundingBoxRight || 0,
    metrics.actualBoundingBoxAscent || 0,
    metrics.actualBoundingBoxDescent || 0
  ];
}

function localTextFontAvailable(family, coverage = 'cjk') {
  if (!family || typeof document === 'undefined') return false;
  const canvas = localTextFontAvailable.canvas
    || (localTextFontAvailable.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return false;
  const sample = coverage === 'latin'
    ? 'FE Monster Hope Facon 0123456789'
    : '字体预设歌词光影测试';
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    context.font = `72px ${fallback}`;
    const base = context.measureText(sample);
    const baseMetrics = [
      base.width,
      base.actualBoundingBoxLeft || 0,
      base.actualBoundingBoxRight || 0,
      base.actualBoundingBoxAscent || 0,
      base.actualBoundingBoxDescent || 0
    ];
    const candidateMetrics = textFontMetrics(context, family, fallback, sample);
    return candidateMetrics.some((value, index) => Math.abs(value - baseMetrics[index]) > 0.1);
  });
}

function detectedTextFontFamily(option) {
  if (!option || option.id === TEXT_FONT_DEFAULT_ID) return 'system-ui';
  if (option.embeddedFamily) return option.embeddedFamily;
  return option.families.find((family) => localTextFontAvailable(family, option.coverage)) || '';
}

function textFontPreviewSample(option) {
  return option?.coverage === 'latin'
    ? `FE Monster · ${option.label}`
    : '此刻，听见光的回声';
}

function saveTextFontPreferences() {
  try {
    window.localStorage.setItem(TEXT_FONT_PREFS_KEY, JSON.stringify({
      version: 1,
      fonts: state.textFontPreferences
    }));
  } catch (error) {
  }
}

function initializeTextFontOptions() {
  if (!els.textFontSelect) return;
  if (els.textFontSelect.options.length !== TEXT_FONT_OPTIONS.length) {
    const fragment = document.createDocumentFragment();
    TEXT_FONT_OPTIONS.forEach((option) => {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      item.style.fontFamily = textFontFamilyStack(option);
      fragment.appendChild(item);
    });
    els.textFontSelect.replaceChildren(fragment);
  }
  refreshTextFontAvailability();
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => refreshTextFontAvailability()).catch(() => {});
  }
}

function refreshTextFontAvailability() {
  if (!els.textFontSelect) return;
  TEXT_FONT_OPTIONS.forEach((option) => {
    const detectedFamily = detectedTextFontFamily(option);
    state.textFontAvailability[option.id] = detectedFamily;
    const item = Array.from(els.textFontSelect.options).find((candidate) => candidate.value === option.id);
    if (!item) return;
    const fallback = TEXT_FONT_FALLBACKS[option.category] || TEXT_FONT_FALLBACKS.system;
    const exact = option.id === TEXT_FONT_DEFAULT_ID || !!detectedFamily;
    const licenseStatus = textFontLicenseAvailability(option);
    item.dataset.fontAvailable = String(exact);
    item.dataset.fontCoverage = option.coverage || 'cjk';
    if (licenseStatus === 'system') {
      item.textContent = option.label;
      item.title = '跟随当前设备';
    } else if (licenseStatus === 'bundled') {
      item.textContent = `${option.label} · 已内置${option.coverage === 'latin' ? '（仅英文）' : ''}`;
      item.title = `已内置：${option.embeddedFamily}；${option.embeddedLicense}${option.coverage === 'latin' ? '；仅用于英文字符' : '；缺失字符自动回退'}`;
    } else if (exact) {
      item.textContent = `${option.label} · ${option.coverage === 'latin' ? '本机可用（仅英文）' : '本机可用'}`;
      item.title = `本机已检测：${detectedFamily}；字体文件未随程序分发${licenseStatus === 'authorization-required' ? '，内置仍需取得软件嵌入授权' : ''}`;
    } else if (licenseStatus === 'authorization-required') {
      item.textContent = `${option.label} · 需嵌入授权`;
      item.title = `未内置；需要版权方的软件或 APP 嵌入授权，当前使用${fallback.label}`;
    } else if (licenseStatus === 'verified-not-bundled') {
      item.textContent = `${option.label} · 授权已核 · 未内置`;
      item.title = `已确认允许软件嵌入，但当前未取得可随包保留的完整原始许可包，暂用${fallback.label}`;
    } else {
      item.textContent = `${option.label} · 授权待核实`;
      item.title = `未找到可核验的软件嵌入与再分发许可，未内置；当前使用${fallback.label}`;
    }
  });
  syncTextFontControls();
}

function syncTextFontControls() {
  if (!els.textFontControl || !els.textFontSelect) return;
  const enabled = textLyricsEnabled();
  const option = textFontPreference();
  const fallback = TEXT_FONT_FALLBACKS[option.category] || TEXT_FONT_FALLBACKS.system;
  const detectedFamily = state.textFontAvailability[option.id] || '';
  const exact = option.id === TEXT_FONT_DEFAULT_ID || !!detectedFamily;
  const licenseStatus = textFontLicenseAvailability(option);
  const stack = textFontFamilyStack(option);
  els.textFontControl.classList.toggle('is-disabled', !enabled);
  els.textFontControl.dataset.fontAvailable = String(exact);
  els.textFontSelect.disabled = !enabled;
  els.textFontSelect.value = option.id;
  els.textFontSelect.style.fontFamily = stack;
  if (els.textFontPreview) {
    els.textFontPreview.style.fontFamily = stack;
    els.textFontPreview.textContent = textFontPreviewSample(option);
  }
  if (els.textFontStatus) {
    els.textFontStatus.textContent = enabled ? option.label : '选择文字预设';
  }
  if (els.textFontAvailability) {
    if (!enabled) {
      els.textFontAvailability.textContent = '选择文字预设后可设置独立字体';
    } else if (licenseStatus === 'system') {
      els.textFontAvailability.textContent = '跟随当前设备的系统字体';
    } else if (licenseStatus === 'bundled') {
      els.textFontAvailability.textContent = `已内置：${option.label} · ${option.embeddedLicense}${option.coverage === 'latin' ? '；仅用于英文字符' : '；缺失字符自动回退'}`;
    } else if (exact) {
      els.textFontAvailability.textContent = `本机已检测：${detectedFamily}；字体文件未随程序分发${licenseStatus === 'authorization-required' ? '，内置仍需单独授权' : ''}`;
    } else if (licenseStatus === 'authorization-required') {
      els.textFontAvailability.textContent = `未内置：需要软件或 APP 嵌入授权；当前使用${fallback.label}`;
    } else if (licenseStatus === 'verified-not-bundled') {
      els.textFontAvailability.textContent = `授权允许嵌入，但原始许可包尚未内置；当前使用${fallback.label}`;
    } else {
      els.textFontAvailability.textContent = `软件嵌入与再分发授权待核实，未内置；当前使用${fallback.label}`;
    }
  }
}

function refreshTextFontDependentLayout() {
  if (state.textPreset === 'book') {
    resetBookLyricScrollState();
    renderBookLyricLines(true);
    syncPlaybackLyricToCurrentTime();
  }
  scheduleQishuiPlaybackLyricLayout();
  if (state.voidPrism.runtime && window.FeVoidPrismRuntime) {
    window.FeVoidPrismRuntime.setLyric(
      state.voidPrism.runtime,
      state.lyricDisplayText || playbackLyricText(),
      state.lyricSubtitleText || playbackLyricSubtitle(),
      undefined,
      activeTextFontFamilyStack()
    );
  }
}

function applyTextFontPreference({ refreshLayout = false } = {}) {
  const option = textFontPreference();
  const stack = textFontFamilyStack(option);
  state.textFontStack = stack;
  if (option.id === TEXT_FONT_DEFAULT_ID) {
    document.documentElement.style.removeProperty('--text-preset-font-family');
  } else {
    document.documentElement.style.setProperty('--text-preset-font-family', stack);
  }
  document.documentElement.dataset.textFont = option.id;
  syncTextFontControls();
  if (!refreshLayout) return;
  refreshTextFontDependentLayout();
  if (document.fonts?.load) {
    document.fonts.load(`900 48px ${stack}`, '歌词字体测试').then(() => {
      refreshTextFontAvailability();
      refreshTextFontDependentLayout();
    }).catch(() => {});
  }
}

function setTextFontPreference(fontId) {
  if (!textLyricsEnabled()) {
    syncTextFontControls();
    return;
  }
  state.textFontPreferences[textFontPresetId()] = normalizeTextFontId(fontId);
  saveTextFontPreferences();
  applyTextFontPreference({ refreshLayout: true });
  requestOrbFrame();
}

function saveTextPalettePreferences() {
  try {
    window.localStorage.setItem(TEXT_PALETTE_PREFS_KEY, JSON.stringify({
      version: 1,
      palettes: state.textPalettePreferences
    }));
  } catch (error) {
  }
}

function syncTextPaletteControls() {
  if (!els.textPaletteControl) return;
  const enabled = textLyricsEnabled();
  const preference = textPalettePreference();
  const manual = preference.mode === 'manual';
  els.textPaletteControl.classList.toggle('is-disabled', !enabled);
  els.textPaletteControl.dataset.paletteMode = preference.mode;
  if (els.textPaletteStatus) {
    els.textPaletteStatus.textContent = enabled
      ? (manual ? preference.color.toUpperCase() : '封面自动')
      : '选择文字预设';
  }
  if (els.textPaletteAutoButton) {
    els.textPaletteAutoButton.disabled = !enabled;
    els.textPaletteAutoButton.classList.toggle('is-active', enabled && !manual);
    els.textPaletteAutoButton.setAttribute('aria-pressed', String(enabled && !manual));
  }
  if (els.textPaletteCustomInput) {
    els.textPaletteCustomInput.disabled = !enabled;
    if (els.textPaletteCustomInput.value.toLowerCase() !== preference.color) {
      els.textPaletteCustomInput.value = preference.color;
    }
  }
  if (els.textPaletteResetButton) els.textPaletteResetButton.disabled = !enabled;
  els.textPaletteControl.querySelectorAll('[data-text-palette-color]').forEach((button) => {
    const color = normalizeTextPaletteColor(button.dataset.textPaletteColor);
    const active = enabled && manual && color === preference.color;
    button.disabled = !enabled;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setTextPalettePreference(mode, color) {
  if (!textLyricsEnabled()) {
    syncTextPaletteControls();
    return;
  }
  const preset = textPalettePresetId();
  const previous = textPalettePreference(preset);
  state.textPalettePreferences[preset] = {
    mode: mode === 'manual' ? 'manual' : 'auto',
    color: normalizeTextPaletteColor(color, previous.color)
  };
  saveTextPalettePreferences();
  applyLyricPalette(state.playbackVisual.palette || fallbackLyricPalette());
  syncTextPaletteControls();
  requestOrbFrame();
}

function savePlaybackLyricPalettePreference() {
  try {
    window.localStorage.setItem(PLAYBACK_LYRIC_PALETTE_PREFS_KEY, JSON.stringify({
      version: 1,
      palette: state.playbackLyricPalettePreference
    }));
  } catch (error) {
  }
}

function syncPlaybackLyricPaletteControls() {
  if (!els.playbackLyricPaletteControl) return;
  const preference = playbackLyricPalettePreference();
  const manual = preference.mode === 'manual';
  els.playbackLyricPaletteControl.dataset.paletteMode = preference.mode;
  if (els.playbackLyricPaletteStatus) {
    els.playbackLyricPaletteStatus.textContent = manual
      ? preference.color.toUpperCase()
      : '封面自动';
  }
  if (els.playbackLyricPaletteAutoButton) {
    els.playbackLyricPaletteAutoButton.classList.toggle('is-active', !manual);
    els.playbackLyricPaletteAutoButton.setAttribute('aria-pressed', String(!manual));
  }
  if (els.playbackLyricPaletteCustomInput
    && els.playbackLyricPaletteCustomInput.value.toLowerCase() !== preference.color) {
    els.playbackLyricPaletteCustomInput.value = preference.color;
  }
  els.playbackLyricPaletteControl
    .querySelectorAll('[data-playback-lyric-palette-color]')
    .forEach((button) => {
      const color = normalizeTextPaletteColor(button.dataset.playbackLyricPaletteColor);
      const active = manual && color === preference.color;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
}

function setPlaybackLyricPalettePreference(mode, color) {
  const previous = playbackLyricPalettePreference();
  state.playbackLyricPalettePreference = {
    mode: mode === 'manual' ? 'manual' : 'auto',
    color: normalizeTextPaletteColor(color, previous.color)
  };
  savePlaybackLyricPalettePreference();
  applyQishuiPlaybackLyricPalette(state.playbackVisual.palette || fallbackLyricPalette());
  syncPlaybackLyricPaletteControls();
  requestOrbFrame();
}

function updateBookEffectTextTransform() {
  if (!els.playbackLyricScene) return;
  const transform = state.bookEffectTransform;
  els.playbackLyricScene.style.setProperty('--book-effect-x', `${transform.x.toFixed(1)}px`);
  els.playbackLyricScene.style.setProperty('--book-effect-y', `${transform.y.toFixed(1)}px`);
  els.playbackLyricScene.style.setProperty('--book-effect-rotate', `${transform.rotate.toFixed(2)}deg`);
  els.playbackLyricScene.classList.toggle('is-book-effect-adjusting', !!transform.dragging);
}

function bookEffectTextGestureMode(event) {
  if (!state.playbackPage || state.textPreset !== 'book-effect' || state.diyPreset === 'book' || !els.playbackLyricCore) return '';
  const rect = els.playbackLyricCore.getBoundingClientRect();
  if (!rect.width || !rect.height) return '';
  const pad = 28;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (x < -pad || x > rect.width + pad || y < -pad || y > rect.height + pad) return '';
  const rotateWidth = Math.max(92, rect.width * 0.22);
  const rotateHeight = Math.max(72, rect.height * 0.38);
  if (x >= rect.width - rotateWidth && y >= rect.height - rotateHeight) return 'rotate';
  const moveHeight = Math.max(44, rect.height * 0.28);
  return y <= moveHeight ? 'move' : '';
}

function clearBookEffectTextHoldTimer() {
  if (!state.bookEffectTransform.holdTimer) return;
  window.clearTimeout(state.bookEffectTransform.holdTimer);
  state.bookEffectTransform.holdTimer = 0;
}

function beginBookEffectTextGesture(event) {
  const mode = bookEffectTextGestureMode(event);
  if (!mode) return false;
  const transform = state.bookEffectTransform;
  clearBookEffectTextHoldTimer();
  transform.pending = true;
  transform.dragging = false;
  transform.mode = mode;
  transform.pointerId = event.pointerId;
  transform.startX = event.clientX;
  transform.startY = event.clientY;
  transform.startOffsetX = transform.x;
  transform.startOffsetY = transform.y;
  transform.startRotate = transform.rotate;
  transform.holdTimer = window.setTimeout(() => {
    if (!transform.pending || transform.pointerId !== event.pointerId) return;
    transform.pending = false;
    transform.dragging = true;
    if (els.stage) els.stage.classList.add('is-book-effect-adjusting');
    updateBookEffectTextTransform();
  }, 360);
  return true;
}

function moveBookEffectTextGesture(event) {
  const transform = state.bookEffectTransform;
  if (transform.pointerId !== event.pointerId) return false;
  if (!transform.dragging) return transform.pending;
  const dx = event.clientX - transform.startX;
  const dy = event.clientY - transform.startY;
  if (transform.mode === 'move') {
    transform.x = clamp(transform.startOffsetX + dx, -520, 520);
    transform.y = clamp(transform.startOffsetY + dy, -300, 300);
  } else if (transform.mode === 'rotate') {
    transform.rotate = transform.startRotate + dx * 0.36;
  }
  updateBookEffectTextTransform();
  return true;
}

function endBookEffectTextGesture(event) {
  const transform = state.bookEffectTransform;
  if (transform.pointerId !== null && event && event.pointerId !== transform.pointerId) return false;
  if (transform.pointerId === null && !transform.pending && !transform.dragging) return false;
  clearBookEffectTextHoldTimer();
  transform.pending = false;
  transform.dragging = false;
  transform.mode = '';
  transform.pointerId = null;
  if (els.stage) els.stage.classList.remove('is-book-effect-adjusting');
  updateBookEffectTextTransform();
  return true;
}

function isBookEffectTextPointInside(event, padding = 24) {
  if (!state.playbackPage || state.textPreset !== 'book-effect' || state.diyPreset === 'book' || !els.playbackLyricCore) return false;
  const target = els.playbackLyricText || els.playbackLyricCore;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  return event.clientX >= rect.left - padding &&
    event.clientX <= rect.right + padding &&
    event.clientY >= rect.top - padding &&
    event.clientY <= rect.bottom + padding;
}

function resetBookEffectTextTransform() {
  const transform = state.bookEffectTransform;
  clearBookEffectTextHoldTimer();
  transform.x = 0;
  transform.y = 0;
  transform.rotate = 0;
  transform.pending = false;
  transform.dragging = false;
  transform.mode = '';
  transform.pointerId = null;
  if (els.stage) els.stage.classList.remove('is-book-effect-adjusting');
  updateBookEffectTextTransform();
}

function updateBookLyricTransform() {
  if (!els.playbackLyricScene) return;
  const transform = state.bookLyricTransform;
  transform.x = 0;
  transform.y = 0;
  transform.rotate = 0;
  transform.pending = false;
  transform.dragging = false;
  transform.mode = '';
  transform.pointerId = null;
  transform.suppressClick = false;
  clearBookLyricHoldTimer();
  els.playbackLyricScene.style.setProperty('--book-lyric-x', '0px');
  els.playbackLyricScene.style.setProperty('--book-lyric-y', '0px');
  els.playbackLyricScene.style.setProperty('--book-lyric-rotate', '0deg');
  els.playbackLyricScene.classList.remove('is-book-lyric-adjusting');
  if (els.stage) els.stage.classList.remove('is-book-lyric-adjusting');
}

function clearBookLyricHoldTimer() {
  if (!state.bookLyricTransform.holdTimer) return;
  window.clearTimeout(state.bookLyricTransform.holdTimer);
  state.bookLyricTransform.holdTimer = 0;
}

function beginBookLyricGesture(event) {
  updateBookLyricTransform();
  return false;
}

function moveBookLyricGesture(event) {
  return false;
}

function endBookLyricGesture(event) {
  return false;
}

function updateChladniTextTransform() {
  if (!els.playbackLyricScene) return;
  const transform = state.chladniTextTransform;
  els.playbackLyricScene.style.setProperty('--chladni-text-x', `${transform.x.toFixed(1)}px`);
  els.playbackLyricScene.style.setProperty('--chladni-text-y', `${transform.y.toFixed(1)}px`);
  els.playbackLyricScene.style.setProperty('--chladni-text-rotate', `${transform.rotate.toFixed(2)}deg`);
  els.playbackLyricScene.style.setProperty('--chladni-text-rotate-x', `${transform.rotateX.toFixed(2)}deg`);
  els.playbackLyricScene.style.setProperty('--chladni-text-rotate-y', `${transform.rotateY.toFixed(2)}deg`);
  els.playbackLyricScene.style.setProperty('--chladni-text-scale', transform.scale.toFixed(3));
  els.playbackLyricScene.classList.toggle('is-chladni-text-dragging', !!transform.dragging);
}

function chladniTextDragTarget() {
  if (!state.playbackPage || !isChladniPreset() || state.textPreset === 'none') return null;
  return state.textPreset === 'book' ? els.bookLyricStage : els.playbackLyricCore;
}

function chladniTextPointInside(event, target = chladniTextDragTarget(), padding = 34) {
  if (!target) return false;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const transformScale = Math.max(0.1, Number(state.chladniTextTransform?.scale) || 1);
  const stableWidth = Math.max(1, target.offsetWidth * transformScale || rect.width);
  const stableHeight = Math.max(1, target.offsetHeight * transformScale || rect.height);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return event.clientX >= centerX - stableWidth / 2 - padding
    && event.clientX <= centerX + stableWidth / 2 + padding
    && event.clientY >= centerY - stableHeight / 2 - padding
    && event.clientY <= centerY + stableHeight / 2 + padding;
}

function chladniTextGestureMode(event, target) {
  if (!target || !chladniTextPointInside(event, target, 104)) return '';
  const insideText = chladniTextPointInside(event, target, 0);
  if (insideText) return 'move';
  return 'rotate-3d';
}

function beginChladniTextGesture(event) {
  const source = event.target instanceof Element ? event.target : null;
  if (source?.closest('button, input, select, textarea, a, [role="button"], [role="slider"], #qishuiPlaybackCard')) return false;
  const target = chladniTextDragTarget();
  const mode = chladniTextGestureMode(event, target);
  if (!mode) return false;
  const transform = state.chladniTextTransform;
  transform.dragging = true;
  transform.mode = mode;
  transform.pointerId = event.pointerId;
  transform.startX = event.clientX;
  transform.startY = event.clientY;
  transform.startOffsetX = transform.x;
  transform.startOffsetY = transform.y;
  transform.startRotateX = transform.rotateX;
  transform.startRotateY = transform.rotateY;
  updateChladniTextTransform();
  return true;
}

function moveChladniTextGesture(event) {
  const transform = state.chladniTextTransform;
  if (!transform.dragging || transform.pointerId !== event.pointerId) return false;
  const stageRect = els.stage.getBoundingClientRect();
  const maxX = Math.max(80, stageRect.width * 0.44);
  const maxY = Math.max(60, stageRect.height * 0.42);
  if (transform.mode === 'rotate-3d') {
    transform.rotateX = transform.startRotateX - (event.clientY - transform.startY) * 0.48;
    transform.rotateY = transform.startRotateY + (event.clientX - transform.startX) * 0.48;
  } else {
    transform.x = clamp(transform.startOffsetX + event.clientX - transform.startX, -maxX, maxX);
    transform.y = clamp(transform.startOffsetY + event.clientY - transform.startY, -maxY, maxY);
  }
  updateChladniTextTransform();
  return true;
}

function endChladniTextGesture(event) {
  const transform = state.chladniTextTransform;
  if (!transform.dragging || transform.pointerId !== event.pointerId) return false;
  transform.dragging = false;
  transform.mode = 'move';
  transform.pointerId = null;
  updateChladniTextTransform();
  return true;
}

function scaleChladniTextFromWheel(event) {
  const target = chladniTextDragTarget();
  if (!chladniTextPointInside(event, target, 28)) return false;
  const transform = state.chladniTextTransform;
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  transform.scale = clamp(transform.scale * factor, 0.5, 2.5);
  updateChladniTextTransform();
  return true;
}

function captureStagePointer(pointerId) {
  try {
    els.stage.setPointerCapture(pointerId);
  } catch (error) {}
}

function releaseStagePointer(pointerId) {
  try {
    if (els.stage.hasPointerCapture(pointerId)) els.stage.releasePointerCapture(pointerId);
  } catch (error) {}
}

function resetPlaybackView() {
  state.playbackVisual.yaw = PLAYBACK_REST_YAW;
  state.playbackVisual.pitch = PLAYBACK_REST_PITCH;
  state.playbackVisual.zoom = 1;
  state.playbackVisual.velocityYaw = 0;
  state.playbackVisual.velocityPitch = 0;
  updatePlaybackSceneTransform();
  resizeDynamicCubeRenderer();
  resizeFreeCubeRenderer();
  resizeVoidPrismRenderer();
  resizeChladniRenderer();
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
  state.activeWallpaperId = state.activeWallpaperIds[state.wallpaperSource] || '';
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

function commitDiyPage(page) {
  state.diyPage = page === 'wallpaper' ? 'wallpaper' : page === 'text' ? 'text' : 'preset';
  const presetPage = state.diyPage === 'preset';
  const textPage = state.diyPage === 'text';
  const wallpaperPage = state.diyPage === 'wallpaper';
  if (presetPage) setDiySandboxPresetGroupExpanded(false);
  if (els.diyCardTitle) {
    els.diyCardTitle.textContent = presetPage ? '场景预设' : textPage ? '文字预设' : '壁纸模式';
  }
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
  }
  syncPlaybackCardPanelState();
}

function setDiyCardOpen(open) {
  state.diyCardOpen = state.diyOpen && !!open;
  els.appShell.classList.toggle('has-diy-card', state.diyCardOpen);
  if (els.diySidebar) els.diySidebar.setAttribute('aria-hidden', String(!state.diyCardOpen));
  syncPlaybackCardPanelState();
}

function setDiyPage(page) {
  const nextPage = page === 'wallpaper' ? 'wallpaper' : page === 'text' ? 'text' : 'preset';
  if (state.diyPageTransitionTimer) {
    window.clearTimeout(state.diyPageTransitionTimer);
    state.diyPageTransitionTimer = 0;
  }
  if (!state.diyCardOpen || state.diyPage === nextPage) {
    commitDiyPage(nextPage);
    setDiyCardOpen(true);
    return;
  }
  els.diySidebar?.classList.add('is-diy-page-exiting');
  state.diyPageTransitionTimer = window.setTimeout(() => {
    commitDiyPage(nextPage);
    els.diySidebar?.classList.remove('is-diy-page-exiting');
    els.diySidebar?.classList.add('is-diy-page-entering');
    window.requestAnimationFrame(() => els.diySidebar?.classList.remove('is-diy-page-entering'));
    state.diyPageTransitionTimer = 0;
  }, 180);
}

function setDiySandboxPresetGroupExpanded(expanded) {
  state.sandbox.presetGroupExpanded = !!expanded;
  if (els.diySandboxPresetToggle) {
    els.diySandboxPresetToggle.setAttribute('aria-expanded', String(state.sandbox.presetGroupExpanded));
  }
  if (els.diySandboxPresetList) els.diySandboxPresetList.hidden = !state.sandbox.presetGroupExpanded;
}

const DIY_PRESET_CONFIG_LABELS = Object.freeze({
  id: 'ID',
  name: '名称',
  presetType: '预设类型',
  source: '来源',
  sceneItems: '场景组件',
  component: '组件',
  asset: '资源与渲染参数',
  position: '位置',
  rotation: '旋转',
  scale: '缩放',
  playbackView: '播放视角',
  reactivity: '音乐响应',
  rendering: '渲染',
  textures: '纹理',
  runtimeControls: '当前运行参数',
  lightingMode: '光照模式',
  weatherMode: '天气模式',
  textPreset: '文字预设',
  lyricBrightness: '歌词亮度',
  lyricSpeed: '歌词速度',
  cubeIntensity: '场景强度',
  coverBackground: '封面背景',
  freeCubeStyle: '方块样式',
  freeCubeBackground: '柔光背景',
  cubeCount: '方块数量',
  particleCount: '星河粒子',
  planeParticleCount: '平面粒子',
  cubeParticleCount: '3D六面粒子',
  mirrorCount: '镜面数量',
  seamCount: '纵深接缝',
  reflectionMode: '反射方式',
  reflectionResolution: '反射分辨率',
  nodalMode: '节点模态',
  chladniDisplayMode: '克拉尼形态',
  faceCount: '3D面数',
  autoRotation: '自动旋转',
  sonicColumnCount: '低频音柱数量',
  sonicCoreColor: '中间音柱颜色',
  sonicOuterColor: '外围音柱颜色',
  sonicBrightness: 'Sonic 亮度',
  sonicExposure: 'Sonic 曝光',
  sonicColumnHeight: '音柱高度',
  sonicFov: '广角视野',
  sonicSmoothing: '升降丝滑度'
});

function diyPresetConfigLabel(key) {
  if (key === 'coverMotionAmplitude') return '粒子律动';
  return DIY_PRESET_CONFIG_LABELS[key] || key;
}

function builtinDiyPresetConfiguration() {
  const preset = state.diyPreset === 'sandbox-scene' ? 'lyric' : state.diyPreset;
  const names = {
    lyric: '无场景',
    cube: '动感魔方',
    'free-cubes': '自由方块',
    'void-prism': '虚空棱镜',
    topography: 'Sonic Terrain',
    chladni: '克拉尼',
    'rain-glass': '雨天玻璃',
    'cover-particles': '粒子封面',
    book: '书页歌词',
    wallpaper: '壁纸模式'
  };
  const runtimeControls = {};
  if (preset === 'cube') {
    runtimeControls.cubeIntensity = state.cubeIntensity;
  } else if (preset === 'free-cubes') {
    const diagnostics = freeCubeRuntimeSnapshot();
    runtimeControls.freeCubeStyle = state.freeCube.mode === 'heart' ? '心动' : '自由漂浮';
    runtimeControls.freeCubeBackground = !!state.freeCube.backgroundEnabled;
    runtimeControls.cubeCount = diagnostics.cubeCount || (MOBILE_RENDER_TARGET ? 1100 : 1800);
    runtimeControls.particleCount = diagnostics.particleCount || (MOBILE_RENDER_TARGET ? 760 : 1400);
  } else if (preset === 'void-prism') {
    const diagnostics = voidPrismRuntimeSnapshot();
    runtimeControls.mirrorCount = diagnostics.mirrorCount || 4;
    runtimeControls.seamCount = diagnostics.seamCount || 4;
    runtimeControls.reflectionMode = 'Metal012 镜面精抛 · 高清反射 · 8K源材质';
    runtimeControls.reflectionResolution = diagnostics.reflectionResolution || [];
  } else if (preset === 'topography') {
    const settings = normalizeSonicSettings(state.sonicTopography.settings);
    const colors = resolvedSonicTopographyColors();
    runtimeControls.sonicColumnCount = SONIC_BASS_COLUMN_CLUSTER.count;
    runtimeControls.sonicCoreColor = settings.coreColor || `跟随封面 · ${colors.core}`;
    runtimeControls.sonicOuterColor = settings.outerColor || `跟随封面 · ${colors.outer}`;
    runtimeControls.sonicBrightness = `${Math.round(settings.brightness * 100)}%`;
    runtimeControls.sonicExposure = `${settings.exposure > 0 ? '+' : ''}${settings.exposure.toFixed(2)} EV`;
    runtimeControls.sonicColumnHeight = `${Math.round(settings.columnHeight * 100)}%`;
    runtimeControls.sonicFov = `${Math.round(settings.fov)}°`;
    runtimeControls.sonicSmoothing = `${Math.round(settings.smoothing * 100)}%`;
  } else if (preset === 'chladni') {
    const diagnostics = chladniRuntimeSnapshot();
    runtimeControls.chladniDisplayMode = state.chladni.mode === 'plane' ? '平面' : '3D六面';
    runtimeControls.faceCount = state.chladni.mode === 'plane' ? 1 : 6;
    runtimeControls.planeParticleCount = diagnostics.planeParticleCount || (MOBILE_RENDER_TARGET ? 100000 : 500000);
    runtimeControls.cubeParticleCount = diagnostics.cubeParticleCount || (MOBILE_RENDER_TARGET ? 120000 : 300000);
    runtimeControls.nodalMode = `${diagnostics.modeFrom?.join(' × ') || '2 × 3'} → ${diagnostics.modeTo?.join(' × ') || '3 × 5'}`;
    runtimeControls.autoRotation = diagnostics.autoRotation !== false;
  } else if (preset === 'cover-particles') {
    runtimeControls.coverBackground = !!state.coverParticle.backgroundEnabled;
    runtimeControls.coverMotionAmplitude = `${coverParticleMotionPercent()}%`;
    runtimeControls.particleCount = state.coverParticle.particles.length || (
      reducedMotion ? 192 * 192 : MOBILE_RENDER_TARGET ? 224 * 224 : 256 * 256
    );
  } else if (['lyric', 'rain-glass', 'book'].includes(preset)) {
    runtimeControls.textPreset = state.textPreset;
    runtimeControls.lyricBrightness = state.lyricBrightness;
    runtimeControls.lyricSpeed = state.lyricSpeed;
  }
  return {
    id: preset,
    name: names[preset] || preset,
    presetType: 'built-in',
    scene: preset,
    ...(Object.keys(runtimeControls).length ? { runtimeControls } : {})
  };
}

function isStormOceanPreset(preset) {
  return !!preset && (
    preset.id === 'preset-storm-ocean-horizon'
    || preset.sceneItems?.some((item) => (
      window.FeStormOceanRuntime?.isProfile?.(item.component?.asset?.reactivity) === true
    ))
  );
}

function activeDiyScenePreset() {
  if (state.diyPreset !== 'sandbox-scene' || !state.sandbox.playbackPresetId) return null;
  return state.sandbox.presets.find((preset) => (
    String(preset.id) === String(state.sandbox.playbackPresetId)
  )) || null;
}

function syncDiyPresetAdjustmentVisibility() {
  const activeScenePreset = activeDiyScenePreset();
  const stormOcean = isStormOceanPreset(activeScenePreset);
  if (els.diyCoverParticleControl) {
    els.diyCoverParticleControl.hidden = state.diyPreset !== 'cover-particles';
  }
  if (els.diyCubeIntensityControl) {
    els.diyCubeIntensityControl.hidden = state.diyPreset !== 'cube';
  }
  if (els.sonicPresetControls) {
    els.sonicPresetControls.hidden = state.diyPreset !== 'topography';
  }
  if (els.freeCubePresetControls) {
    els.freeCubePresetControls.hidden = !isFreeCubePreset();
  }
  if (els.chladniPresetControls) {
    els.chladniPresetControls.hidden = !isChladniPreset();
  }
  if (els.stormPresetLightingQuickControls) {
    els.stormPresetLightingQuickControls.hidden = !stormOcean;
    els.stormPresetLightingQuickControls.dataset.stormPresetId = stormOcean ? activeScenePreset.id : '';
  }
}

function selectedDiyPresetConfiguration() {
  const preset = activeDiyScenePreset();
  if (!preset) return builtinDiyPresetConfiguration();
  const stormOcean = isStormOceanPreset(preset);
  return {
    ...preset,
    ...(stormOcean ? {
      runtimeControls: {
        lightingMode: state.sandbox.stormLightingMode,
        weatherMode: state.sandbox.stormWeatherMode
      }
    } : {})
  };
}

function formatDiyPresetConfigValue(value) {
  if (value === null) return 'null';
  if (value === true) return '是';
  if (value === false) return '否';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(5)));
  return String(value);
}

function appendDiyPresetConfigNode(parent, key, value, depth = 0, visited = new WeakSet()) {
  if (value === undefined || typeof value === 'function') return;
  const objectValue = value !== null && typeof value === 'object';
  if (!objectValue) {
    const row = document.createElement('div');
    row.className = 'diy-selected-preset-config-row';
    const label = document.createElement('span');
    label.textContent = diyPresetConfigLabel(key);
    label.title = key;
    const output = document.createElement('span');
    output.textContent = formatDiyPresetConfigValue(value);
    row.append(label, output);
    parent.appendChild(row);
    return;
  }

  if (visited.has(value)) {
    appendDiyPresetConfigNode(parent, key, '[循环引用]', depth, visited);
    return;
  }
  visited.add(value);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item])
    : Object.entries(value);
  const details = document.createElement('details');
  details.className = 'diy-selected-preset-config-group';
  details.open = depth < 1;
  const summary = document.createElement('summary');
  summary.textContent = `${diyPresetConfigLabel(key)} · ${entries.length}`;
  summary.title = key;
  const content = document.createElement('div');
  content.className = 'diy-selected-preset-config-group-content';
  if (!entries.length) {
    const empty = document.createElement('span');
    empty.className = 'diy-selected-preset-config-empty';
    empty.textContent = Array.isArray(value) ? '[]' : '{}';
    content.appendChild(empty);
  } else {
    entries.forEach(([entryKey, entryValue]) => {
      appendDiyPresetConfigNode(content, entryKey, entryValue, depth + 1, visited);
    });
  }
  details.append(summary, content);
  parent.appendChild(details);
  visited.delete(value);
}

function renderDiySelectedPresetConfig() {
  if (!els.diySelectedPresetConfigList) return;
  if (els.diySelectedPresetConfig?.hidden) {
    clearElement(els.diySelectedPresetConfigList);
    return;
  }
  const configuration = selectedDiyPresetConfiguration();
  const sceneCount = Array.isArray(configuration.sceneItems) ? configuration.sceneItems.length : 0;
  if (els.diySelectedPresetConfigTitle) {
    els.diySelectedPresetConfigTitle.textContent = safeText(configuration.name, '当前预设配置');
  }
  if (els.diySelectedPresetConfigMeta) {
    els.diySelectedPresetConfigMeta.textContent = sceneCount
      ? `${sceneCount} 个组件 · 完整声明参数`
      : '当前生效参数';
  }
  clearElement(els.diySelectedPresetConfigList);
  Object.entries(configuration).forEach(([key, value]) => {
    appendDiyPresetConfigNode(els.diySelectedPresetConfigList, key, value);
  });
}

function selectDiyScenePreset(id) {
  const preset = state.sandbox.presets.find((item) => String(item.id) === String(id));
  if (!preset) return;
  state.sandbox.selectedPresetId = preset.id;
  syncSandboxPlaybackSurface();
  renderDiySelectedPresetConfig();
}

function renderDiySandboxPresets() {
  if (!els.diySandboxPresetGroup || !els.diySandboxPresetList) return;
  if (els.diyScenePresetList) {
    els.diyScenePresetList.querySelectorAll('[data-diy-featured-preset]').forEach((button) => button.remove());
  }
  const presets = state.sandbox.presets
    .filter((preset) => preset.presetType === 'scene' && preset.sceneItems.length)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  const featuredPresets = presets.filter((preset) => (
    preset.libraryPlacement === 'desktop-scene' || preset.id === 'preset-storm-ocean-horizon'
  ));
  const personalPresets = presets.filter((preset) => !featuredPresets.includes(preset));
  if (els.diyScenePresetList) {
    const featuredFragment = document.createDocumentFragment();
    featuredPresets.forEach((preset) => {
      const button = document.createElement('button');
      button.className = 'diy-preset-card is-featured-scene-preset';
      button.type = 'button';
      button.dataset.diyFeaturedPreset = preset.id;
      button.dataset.diySandboxPreset = preset.id;
      button.setAttribute('aria-label', `进入本地场景预设 ${preset.name}`);
      const name = document.createElement('strong');
      name.textContent = preset.name;
      const meta = document.createElement('small');
      meta.textContent = window.FeStormOceanRuntime?.isProfile?.(preset.sceneItems[0]?.component?.asset?.reactivity)
        ? '实时海浪 · 光照可切换'
        : '本地 3D 场景';
      button.append(name, meta);
      featuredFragment.appendChild(button);
    });
    els.diyScenePresetList.appendChild(featuredFragment);
  }

  clearElement(els.diySandboxPresetList);
  const fragment = document.createDocumentFragment();
  personalPresets.forEach((preset) => {
    const card = document.createElement('article');
    card.className = 'diy-preset-card is-sandbox-preset';
    card.dataset.diyPresetCard = preset.id;
    card.style.setProperty('--component-color', preset.sceneItems[0]?.component?.color || '#83e4ff');
    const sourceLabel = ({ codex: 'Codex', client: '我的预设', market: '市场下载' })[preset.source] || '我的预设';
    const updatedAt = Number(preset.updatedAt || preset.createdAt || 0);
    card.setAttribute('aria-label', `场景预设 ${preset.name}，${sourceLabel}，${preset.sceneItems.length} 个组件`);
    const visual = document.createElement('span');
    visual.className = 'diy-preset-thumbnail';
    const previewUrl = sandboxAssetUrl(preset.sceneItems[0]?.component?.asset?.previewUrl);
    if (previewUrl) {
      visual.classList.add('has-image');
      visual.style.backgroundImage = `linear-gradient(180deg, transparent 52%, rgba(1, 6, 8, 0.78)), url("${previewUrl.replace(/"/g, '%22')}")`;
    }
    const copy = document.createElement('span');
    copy.className = 'diy-preset-copy';
    const name = document.createElement('strong');
    name.textContent = preset.name;
    const meta = document.createElement('small');
    const dateLabel = updatedAt ? new Date(updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
    meta.textContent = `${sourceLabel} · ${preset.sceneItems.length} 个组件${dateLabel ? ` · ${dateLabel}` : ''}`;
    copy.appendChild(name);
    copy.appendChild(meta);
    const enter = document.createElement('button');
    enter.className = 'diy-preset-enter-button';
    enter.type = 'button';
    enter.dataset.diySandboxPreset = preset.id;
    enter.textContent = '进入';
    enter.setAttribute('aria-label', `进入预设 ${preset.name}`);
    card.appendChild(visual);
    card.appendChild(copy);
    card.appendChild(enter);
    fragment.appendChild(card);
  });
  els.diySandboxPresetList.appendChild(fragment);
  els.diySandboxPresetGroup.hidden = personalPresets.length === 0;
  setDiySandboxPresetGroupExpanded(state.sandbox.presetGroupExpanded && personalPresets.length > 0);
  syncDiyPresetAdjustmentVisibility();
  syncSandboxPlaybackSurface();
  renderDiySelectedPresetConfig();
}

function enterDiyScenePresetPlayback(id) {
  const preset = state.sandbox.presets.find((item) => item.id === id);
  if (!preset) return;
  state.sandbox.selectedPresetId = preset.id;
  if (preset.presetType === 'playback' && preset.playbackPreset) {
    enterPresetPlaybackPage(preset.playbackPreset);
    return;
  }
  if (state.sandbox.open) setSandboxOpen(false);
  state.sandbox.playbackPresetId = preset.id;
  state.sandbox.playbackAssetReady = false;
  state.sandbox.playbackAssetFailed = false;
  const playbackAsset = preset.sceneItems[0]?.component?.asset || {};
  if (window.FeStormOceanRuntime?.isProfile?.(playbackAsset.reactivity)) {
    state.sandbox.stormLightingMode = 'sunset';
    state.sandbox.stormWeatherMode = 'auto';
  }
  const playbackView = playbackAsset.playbackView || {};
  state.sandbox.yaw = Number.isFinite(Number(playbackView.yaw)) ? Number(playbackView.yaw) : state.sandbox.yaw;
  state.sandbox.pitch = Number.isFinite(Number(playbackView.pitch)) ? Number(playbackView.pitch) : state.sandbox.pitch;
  state.sandbox.distance = clamp(Number(playbackView.distance) || state.sandbox.distance, 5.5, 18);
  updateSandboxCamera();
  state.sandbox.playbackPreviewUrl = sandboxAssetUrl(playbackAsset.backgroundUrl || playbackAsset.previewUrl);
  state.sandbox.playbackKeepBackground = !!playbackAsset.backgroundUrl;
  applySandboxScenePreset(preset, { persistDraft: false });
  updateSandboxCamera();
  setDiyOpen(false);
  setDiyPreset('sandbox-scene');
  enterPlaybackPage();
}

function setDiyPreset(preset) {
  const wasBookPreset = state.diyPreset === 'book';
  state.diyPreset = normalizeDiyPreset(preset);
  if (state.diyPreset !== 'sandbox-scene') state.sandbox.selectedPresetId = '';
  if (state.diyPreset !== 'wallpaper') state.scenePreset = state.diyPreset;
  if (els.diySceneNonePreset) els.diySceneNonePreset.classList.toggle('is-active', state.diyPreset === 'lyric');
  if (els.diyCubePreset) els.diyCubePreset.classList.toggle('is-active', state.diyPreset === 'cube');
  if (els.diyFreeCubePreset) els.diyFreeCubePreset.classList.toggle('is-active', isFreeCubePreset());
  if (els.diyVoidPrismPreset) els.diyVoidPrismPreset.classList.toggle('is-active', isVoidPrismPreset());
  if (els.diyTopographyPreset) els.diyTopographyPreset.classList.toggle('is-active', state.diyPreset === 'topography');
  if (els.diyChladniPreset) els.diyChladniPreset.classList.toggle('is-active', isChladniPreset());
  if (els.diyRainGlassPreset) els.diyRainGlassPreset.classList.toggle('is-active', isRainGlassPreset());
  if (els.diyCoverParticlesPreset) els.diyCoverParticlesPreset.classList.toggle('is-active', isCoverParticlePreset());
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.classList.toggle('is-active', state.diyPreset === 'book');
  if (els.diyPresetPage) els.diyPresetPage.dataset.activePreset = state.diyPreset;
  if (els.playbackLyricScene) els.playbackLyricScene.classList.toggle('is-rain-glass-text', isRainGlassPreset() && state.textPreset === 'depth');
  if (els.appShell) els.appShell.classList.toggle('has-rain-glass-scene', isRainGlassPreset());
  if (!isRainGlassPreset()) clearRainGlassOverlay();
  updateDynamicCubeVisibility();
  updateFreeCubeVisibility();
  updateVoidPrismVisibility();
  updateChladniVisibility();
  updateChladniTextTransform();
  updateSonicTopographyVisibility();
  updateCoverParticleVisibility();
  updateWallpaperVisibility();
  if (state.diyPreset === 'book' && state.textPreset !== 'book') {
    state.lastSelectableTextPreset = selectableTextPreset(state.textPreset);
    setTextPreset('book');
  } else if (wasBookPreset && state.diyPreset !== 'book' && state.textPreset === 'book') {
    setTextPreset(state.lastSelectableTextPreset);
  }
  updateTextPresetAvailability();
  updateLyricDiyVars();
  updateWallpaperDiyVars();
  syncDiyPresetAdjustmentVisibility();
  renderDiySelectedPresetConfig();
  applyPresetUpscaler({ force: true });
}

function setTextPreset(preset) {
  const nextPreset = preset === 'book' ? 'book' : selectableTextPreset(preset);
  if (state.diyPreset === 'book' && nextPreset !== 'book') {
    updateTextPresetAvailability();
    return;
  }
  state.textPreset = nextPreset;
  if (state.textPreset !== 'book' && state.textPreset !== 'none') {
    state.lastSelectableTextPreset = state.textPreset;
  }
  syncTextPresetButtons();
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.classList.toggle('is-active', state.diyPreset === 'book');
  if (els.diyPresetPage) els.diyPresetPage.dataset.activeTextPreset = state.textPreset;
  if (els.diyTextPage) els.diyTextPage.dataset.activeTextPreset = state.textPreset;
  if (els.playbackLyricScene) {
    els.playbackLyricScene.classList.toggle('is-depth-single-text', state.textPreset === 'depth' && !isRainGlassPreset());
    els.playbackLyricScene.classList.toggle('is-flow-text', state.textPreset === 'flow');
    els.playbackLyricScene.classList.toggle('is-book-effect-text', state.textPreset === 'book-effect');
    els.playbackLyricScene.classList.toggle('is-focus-echo-text', state.textPreset === 'focus-echo');
    els.playbackLyricScene.classList.toggle('is-book-text', state.textPreset === 'book');
    els.playbackLyricScene.classList.toggle('is-rain-glass-text', isRainGlassPreset() && state.textPreset === 'depth');
    els.playbackLyricScene.dataset.textPreset = state.textPreset;
  }
  if (els.appShell) els.appShell.classList.toggle('has-book-lyric-text', state.textPreset === 'book');
  if (els.appShell) els.appShell.classList.toggle('has-rain-glass-scene', isRainGlassPreset());
  applyTextFontPreference();
  applyLyricPalette(state.playbackVisual.palette || fallbackLyricPalette());
  syncPlaybackLyricVisibility();
  if (els.bookLyricStage) {
    els.bookLyricStage.setAttribute('aria-hidden', state.textPreset === 'book' ? 'false' : 'true');
  }
  resetLyricFrameSync();
  triggerFocusEchoTransition();
  updateTextPresetAvailability();
  updateBookEffectTextTransform();
  updateChladniTextTransform();
  syncBlurLyricComponent();
  if (state.textPreset === 'book') {
    resetBookLyricScrollState();
    renderBookLyricLines(true);
    syncPlaybackLyricToCurrentTime();
  } else {
    state.lyricBookCurrentLine = null;
    resetBookLyricScrollState();
  }
  renderDiySelectedPresetConfig();
  requestOrbFrame();
}

function syncBlurLyricComponent(text = state.lyricDisplayText) {
  if (!els.playbackLyricScene || !els.blurLyricMount) return;
  const enabled = false;
  els.playbackLyricScene.classList.toggle('has-blur-lyrics', enabled);
  if (!enabled) return;
  const controller = window.FEBlurLyrics;
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
  if (els.diyQuickMenu) els.diyQuickMenu.setAttribute('aria-hidden', String(!state.diyOpen));
  clearDiyAutoHideTimer();
  if (state.diyOpen) {
    setDiySandboxPresetGroupExpanded(false);
    setDiyPeek(true);
    setDiyCardOpen(false);
    void refreshSandboxPresets({ silent: true, migrateLocal: false });
  } else {
    if (state.diyPageTransitionTimer) {
      window.clearTimeout(state.diyPageTransitionTimer);
      state.diyPageTransitionTimer = 0;
    }
    els.diySidebar?.classList.remove('is-diy-page-exiting', 'is-diy-page-entering', 'is-rotating');
    state.diyCardDrag = null;
    setDiyCardOpen(false);
    setDiyPeek(false);
  }
  syncPlaybackCardPanelState();
}

function sandboxId(prefix = 'sandbox') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSandboxColor(value) {
  const color = safeText(value, '#83e4ff').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#83e4ff';
}

function normalizeSandboxComponent(source = {}, options = {}) {
  const dimensions = source.dimensions && typeof source.dimensions === 'object' ? source.dimensions : {};
  const category = ['3d', '2d', 'particle'].includes(source.category) ? source.category : '3d';
  const primitives = {
    '3d': ['sphere', 'box', 'torus', 'cone', 'gltf'],
    '2d': ['plane', 'disc', 'ring-2d'],
    particle: ['particle-field', 'particle-ring', 'particle-fountain', 'spark-cloud']
  };
  const fallbackPrimitive = category === '2d' ? 'plane' : category === 'particle' ? 'particle-field' : 'sphere';
  const primitive = primitives[category].includes(source.primitive) ? source.primitive : fallbackPrimitive;
  const motion = ['music', 'spin', 'float', 'none'].includes(source.motion) ? source.motion : 'music';
  const beatMode = ['scale', 'bounce', 'wave'].includes(source.beatMode) ? source.beatMode : 'scale';
  const musicBand = ['bass', 'energy', 'treble'].includes(source.musicBand) ? source.musicBand : 'bass';
  return {
    id: safeText(source.id, options.id || sandboxId('component')),
    name: safeText(source.name, '新建组件').trim().slice(0, 24) || '新建组件',
    category,
    primitive,
    color: normalizeSandboxColor(source.color),
    dimensions: {
      x: clamp(Number(dimensions.x) || 1.2, 0.2, 4),
      y: clamp(Number(dimensions.y) || 1.2, 0.2, 4),
      z: clamp(Number(dimensions.z) || 1.2, 0.2, 4)
    },
    rotation360: source.rotation360 !== false,
    interaction: source.interaction === 'locked' ? 'locked' : 'drag',
    motion,
    beatMode,
    musicBand,
    amplitude: clamp(Number(source.amplitude) || 0, 0, 100),
    speed: clamp(Number(source.speed) || 1, 0.2, 2.4),
    particleCount: clamp(Math.round(Number(source.particleCount) || 160), 8, 2000),
    opacity: clamp(Number(source.opacity) || 0.92, 0.05, 1),
    asset: source.asset && typeof source.asset === 'object' ? { ...source.asset } : {},
    source: safeText(source.source, options.source || 'generated')
  };
}

function loadSandboxComponents() {
  let stored = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SANDBOX_COMPONENTS_KEY) || '[]');
    if (Array.isArray(parsed)) stored = parsed.map((component) => normalizeSandboxComponent(component));
  } catch (error) {
    stored = [];
  }
  const builtIn = SANDBOX_DEFAULT_COMPONENTS.map((component) => normalizeSandboxComponent(component));
  const builtInIds = new Set(builtIn.map((component) => component.id));
  return [...builtIn, ...stored.filter((component) => !builtInIds.has(component.id))];
}

function saveSandboxComponents() {
  try {
    const generated = state.sandbox.components
      .filter((component) => component.source !== 'built-in')
      .map(sandboxComponentForLocalCache);
    window.localStorage.setItem(SANDBOX_COMPONENTS_KEY, JSON.stringify(generated));
  } catch (error) {
    toast('组件库保存失败');
  }
}

function mergeSandboxComponents(components = []) {
  const builtIn = SANDBOX_DEFAULT_COMPONENTS.map((component) => normalizeSandboxComponent(component));
  const byId = new Map(builtIn.map((component) => [component.id, component]));
  components.map((component) => normalizeSandboxComponent(component)).forEach((component) => byId.set(component.id, component));
  state.sandbox.components = Array.from(byId.values());
  saveSandboxComponents();
  renderSandboxLibrary();
}

async function loadBundledSceneLibrary() {
  let payload = null;
  for (const url of ['/data/android-bundled-library.json', '/data/storm-ocean-preset.json']) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('application/json')) continue;
      const candidate = await response.json();
      if (Array.isArray(candidate.components) || Array.isArray(candidate.presets)) {
        payload = candidate;
        break;
      }
    } catch (error) {
      // Try the smaller built-in preset fallback when the generated library is unavailable.
    }
  }
  if (!payload) {
    document.documentElement.dataset.bundledLibrary = 'unavailable';
    return null;
  }
  try {
    const bundledComponents = Array.isArray(payload.components) ? payload.components : [];
    const localComponents = state.sandbox.components.filter((component) => component.source !== 'built-in');
    mergeSandboxComponents([...bundledComponents, ...localComponents]);

    const presetById = new Map();
    (Array.isArray(payload.presets) ? payload.presets : [])
      .map(normalizeSandboxPreset)
      .filter((preset) => !REMOVED_SANDBOX_PRESET_IDS.has(preset.id))
      .forEach((preset) => presetById.set(preset.id, preset));
    state.sandbox.presets
      .map(normalizeSandboxPreset)
      .filter((preset) => !REMOVED_SANDBOX_PRESET_IDS.has(preset.id))
      .forEach((preset) => presetById.set(preset.id, preset));
    state.sandbox.presets = Array.from(presetById.values());
    state.sandbox.presetFolder = ANDROID_CLIENT ? '安卓 APK 本地预设' : '本地场景预设';
    saveSandboxPresets();
    renderSandboxPresets();
    document.documentElement.dataset.bundledLibrary = 'ready';
    return payload;
  } catch (error) {
    document.documentElement.dataset.bundledLibrary = 'unavailable';
    return null;
  }
}

async function refreshSandboxComponents(options = {}) {
  try {
    const response = await apiJson('/api/sandbox/components');
    const serverComponents = Array.isArray(response.components) ? response.components : [];
    const localComponents = state.sandbox.components.filter((component) => component.source !== 'built-in');
    const serverIds = new Set(serverComponents.map((component) => component.id));
    mergeSandboxComponents([...serverComponents, ...localComponents.filter((component) => !serverIds.has(component.id))]);
    if (!options.silent) setSandboxStageStatus(`${state.sandbox.components.length} 个组件已从组件文件夹同步`);
    return state.sandbox.components;
  } catch (error) {
    if (!options.silent) setSandboxStageStatus(`组件文件夹同步失败：${error.message || '服务不可用'}`);
    return state.sandbox.components;
  }
}

async function persistSandboxComponent(component, options = {}) {
  const source = normalizeSandboxComponent(component, { source: options.source || component?.source || 'client' });
  try {
    const response = await apiJson('/api/sandbox/components', {
      method: 'POST',
      body: JSON.stringify({ component: source })
    });
    const saved = normalizeSandboxComponent(response.component || source);
    mergeSandboxComponents(Array.isArray(response.components) ? response.components : [
      saved,
      ...state.sandbox.components.filter((item) => item.id !== saved.id)
    ]);
    return saved;
  } catch (error) {
    const byId = new Map(state.sandbox.components.map((item) => [item.id, item]));
    byId.set(source.id, source);
    mergeSandboxComponents(Array.from(byId.values()));
    if (!options.quiet) toast(error.message || '组件已暂存本机，等待组件文件夹可用后同步');
    return source;
  }
}

function normalizeSandboxSceneItem(source = {}) {
  const component = normalizeSandboxComponent(source.component || source);
  const position = source.position && typeof source.position === 'object' ? source.position : {};
  const rotation = source.rotation && typeof source.rotation === 'object' ? source.rotation : {};
  const scale = source.scale && typeof source.scale === 'object' ? source.scale : {};
  const preserveAuthoredPlayback = component.primitive === 'gltf'
    && component.asset?.playbackView?.preserveAuthoredScale === true;
  return {
    id: safeText(source.id, sandboxId('scene-item')),
    component,
    position: {
      x: clamp(Number(position.x) || 0, preserveAuthoredPlayback ? -600 : -5.2, preserveAuthoredPlayback ? 600 : 5.2),
      y: clamp(Number(position.y) || 0, preserveAuthoredPlayback ? -100 : 0, preserveAuthoredPlayback ? 100 : 8),
      z: clamp(Number(position.z) || 0, preserveAuthoredPlayback ? -1000 : -4.2, preserveAuthoredPlayback ? 1000 : 4.2)
    },
    rotation: {
      x: Number(rotation.x) || 0,
      y: Number(rotation.y) || Number(source.rotationY) || 0,
      z: Number(rotation.z) || 0
    },
    scale: {
      x: clamp(Number(scale.x) || 1, 0.05, 20),
      y: clamp(Number(scale.y) || 1, 0.05, 20),
      z: clamp(Number(scale.z) || 1, 0.05, 20)
    }
  };
}

function normalizeSandboxPreset(source = {}) {
  const sceneItems = Array.isArray(source.sceneItems) ? source.sceneItems.map(normalizeSandboxSceneItem) : [];
  return {
    schema: safeText(source.schema, 'fe-monster.scene-preset/v1'),
    id: safeText(source.id, sandboxId('preset')),
    name: safeText(source.name, '未命名场景').trim().slice(0, 32) || '未命名场景',
    presetType: source.presetType === 'playback' ? 'playback' : 'scene',
    playbackPreset: safeText(source.playbackPreset, ''),
    libraryPlacement: safeText(source.libraryPlacement, ''),
    source: safeText(source.source, 'client'),
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Number(source.createdAt) || Date.now(),
    sceneItems
  };
}

function loadSandboxPresets() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SANDBOX_PRESETS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeSandboxPreset).filter((preset) => !REMOVED_SANDBOX_PRESET_IDS.has(preset.id))
      : [];
  } catch (error) {
    return [];
  }
}

function saveSandboxPresets() {
  try {
    window.localStorage.setItem(SANDBOX_PRESETS_KEY, JSON.stringify(state.sandbox.presets.map(sandboxPresetForLocalCache)));
  } catch (error) {
    toast('客户端预设保存失败');
  }
}

function sandboxComponentForLocalCache(component = {}) {
  const asset = component.asset && typeof component.asset === 'object' ? { ...component.asset } : {};
  delete asset.files;
  delete asset.fallbackSceneItems;
  return { ...component, asset };
}

function sandboxSceneItemForLocalCache(item = {}) {
  return { ...item, component: sandboxComponentForLocalCache(item.component || {}) };
}

function sandboxPresetForLocalCache(preset = {}) {
  return {
    ...preset,
    sceneItems: Array.isArray(preset.sceneItems) ? preset.sceneItems.map(sandboxSceneItemForLocalCache) : []
  };
}

async function refreshSandboxPresets(options = {}) {
  try {
    let response = await apiJson('/api/sandbox/presets');
    if (response?.ok === false) throw new Error(response.error || '预设服务不可用');
    const bundledPresets = state.sandbox.presets.filter((preset) => preset.libraryPlacement === 'desktop-scene');
    const serverIds = new Set(Array.isArray(response.presets) ? response.presets.map((preset) => preset.id) : []);
    const legacyPresets = options.migrateLocal === false ? [] : state.sandbox.presets.filter((preset) => (
      preset.presetType === 'scene'
      && preset.source !== 'built-in'
      && !REMOVED_SANDBOX_PRESET_IDS.has(preset.id)
      && !serverIds.has(preset.id)
    ));
    for (const legacyPreset of legacyPresets) {
      response = await apiJson('/api/sandbox/presets', {
        method: 'POST',
        body: JSON.stringify({ preset: legacyPreset })
      });
      if (response?.ok === false) throw new Error(response.error || '预设服务不可用');
    }
    const presetById = new Map(bundledPresets.map((preset) => [preset.id, normalizeSandboxPreset(preset)]));
    (Array.isArray(response.presets) ? response.presets : [])
      .map(normalizeSandboxPreset)
      .filter((preset) => !REMOVED_SANDBOX_PRESET_IDS.has(preset.id))
      .forEach((preset) => presetById.set(preset.id, preset));
    const presets = Array.from(presetById.values());
    state.sandbox.presets = presets;
    state.sandbox.presetFolder = safeText(response.folder, '');
    saveSandboxPresets();
    renderSandboxPresets();
    if (!options.silent && els.sandboxSaveStatus) {
      els.sandboxSaveStatus.textContent = `${presets.length} 个预设已从客户端文件夹同步`;
    }
    return presets;
  } catch (error) {
    if (!options.silent) setSandboxStageStatus(`预设文件夹同步失败：${error.message || '服务不可用'}`);
    renderSandboxPresets();
    return state.sandbox.presets;
  }
}

function persistSandboxDraft() {
  window.clearTimeout(state.sandbox.draftSaveTimer);
  state.sandbox.draftSaveTimer = 0;
  try {
    window.localStorage.setItem(SANDBOX_DRAFT_KEY, JSON.stringify({
      sceneName: state.sandbox.sceneName,
      sceneItems: state.sandbox.sceneItems.map(sandboxSceneItemForLocalCache)
    }));
    if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = '草稿已保存在本机';
  } catch (error) {
    if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = '草稿保存失败';
  }
}

function saveSandboxDraft(options = {}) {
  window.clearTimeout(state.sandbox.draftSaveTimer);
  if (options.immediate) {
    persistSandboxDraft();
    return;
  }
  if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = '正在保存草稿…';
  state.sandbox.draftSaveTimer = window.setTimeout(persistSandboxDraft, 180);
}

function restoreSandboxDraft() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SANDBOX_DRAFT_KEY) || '{}');
    if (parsed && typeof parsed === 'object') {
      state.sandbox.sceneName = safeText(parsed.sceneName, state.sandbox.sceneName).slice(0, 32);
      state.sandbox.sceneItems = Array.isArray(parsed.sceneItems) ? parsed.sceneItems.map(normalizeSandboxSceneItem) : [];
    }
  } catch (error) {
    state.sandbox.sceneItems = [];
  }
  if (els.sandboxSceneName) els.sandboxSceneName.value = state.sandbox.sceneName;
}

function sandboxPrimitiveLabel(primitive) {
  return ({
    sphere: '球体', box: '立方体', torus: '圆环', cone: '锥体',
    gltf: 'Blender 3D 场景',
    plane: '2D 光幕', disc: '2D 圆片', 'ring-2d': '2D 圆环',
    'particle-field': '粒子场', 'particle-ring': '粒子环',
    'particle-fountain': '粒子喷泉', 'spark-cloud': '火花云'
  })[primitive] || '组件';
}

function sandboxMotionLabel(component) {
  if (component.motion === 'music') {
    const beat = ({ scale: '缩放律动', bounce: '上下弹跳', wave: '波纹呼吸' })[component.beatMode] || '缩放律动';
    return `跟随音乐 / ${beat}`;
  }
  return ({ spin: '持续旋转', float: '轻柔悬浮', none: '无动效' })[component.motion] || '无动效';
}

function setSandboxTab(tab) {
  state.sandbox.tab = tab === 'generator' ? 'generator' : 'library';
  const library = state.sandbox.tab === 'library';
  if (els.sandboxLibraryTab) {
    els.sandboxLibraryTab.classList.toggle('is-active', library);
    els.sandboxLibraryTab.setAttribute('aria-selected', String(library));
  }
  if (els.sandboxGeneratorTab) {
    els.sandboxGeneratorTab.classList.toggle('is-active', !library);
    els.sandboxGeneratorTab.setAttribute('aria-selected', String(!library));
  }
  if (els.sandboxLibraryPanel) els.sandboxLibraryPanel.hidden = !library;
  if (els.sandboxGeneratorPanel) els.sandboxGeneratorPanel.hidden = library;
  if (!library) {
    window.requestAnimationFrame(() => {
      resizeSandboxPreview();
      rebuildSandboxPreview();
      state.sandbox.resizePending = true;
      requestSandboxRender();
    });
  }
}

function renderSandboxLibrary() {
  if (!els.sandboxLibraryGrid) return;
  clearElement(els.sandboxLibraryGrid);
  const queryText = safeText(els.sandboxLibrarySearch && els.sandboxLibrarySearch.value, '').trim().toLowerCase();
  const components = state.sandbox.components.filter((component) => {
    if (!queryText) return true;
    return `${component.name} ${component.category} ${sandboxPrimitiveLabel(component.primitive)} ${sandboxMotionLabel(component)}`.toLowerCase().includes(queryText);
  });
  const fragment = document.createDocumentFragment();
  components.forEach((component) => {
    const card = document.createElement('article');
    card.className = 'sandbox-component-card';
    card.draggable = true;
    card.dataset.componentId = component.id;
    card.dataset.primitive = component.primitive;
    card.dataset.category = component.category;
    card.classList.add(`is-${component.category}`);
    card.style.setProperty('--component-color', component.color);
    card.classList.toggle('is-selected', state.sandbox.selectedLibraryId === component.id);
    card.setAttribute('aria-label', `${component.name} 组件`);

    const select = document.createElement('button');
    select.className = 'sandbox-component-select';
    select.type = 'button';
    select.setAttribute('aria-label', `选择组件 ${component.name}`);

    const visual = document.createElement('span');
    visual.className = 'sandbox-component-visual';
    const assetPreviewUrl = sandboxAssetUrl(component.asset?.previewUrl);
    if (assetPreviewUrl) {
      visual.classList.add('has-asset-preview');
      visual.style.backgroundImage = `linear-gradient(180deg, transparent 58%, rgba(1, 6, 8, 0.68)), url("${assetPreviewUrl.replace(/"/g, '%22')}")`;
    }
    const copy = document.createElement('span');
    copy.className = 'sandbox-component-card-copy';
    const name = document.createElement('strong');
    name.textContent = component.name;
    const meta = document.createElement('small');
    meta.textContent = `${sandboxPrimitiveLabel(component.primitive)} / ${sandboxMotionLabel(component)}`;
    copy.appendChild(name);
    copy.appendChild(meta);
    const add = document.createElement('button');
    add.className = 'sandbox-component-add';
    add.type = 'button';
    add.dataset.addSandboxComponent = component.id;
    add.textContent = '加入场景';
    add.setAttribute('aria-label', `把 ${component.name} 加入场景`);

    select.appendChild(visual);
    select.appendChild(copy);
    card.appendChild(select);
    card.appendChild(add);
    fragment.appendChild(card);
  });
  els.sandboxLibraryGrid.appendChild(fragment);
  if (els.sandboxLibraryEmpty) els.sandboxLibraryEmpty.hidden = components.length > 0;
  if (els.sandboxLibraryCount) els.sandboxLibraryCount.textContent = `${state.sandbox.components.length} 个可用组件`;
}

function sandboxSceneItemById(id) {
  return state.sandbox.sceneItems.find((item) => item.id === id) || null;
}

function sandboxComponentById(id) {
  return state.sandbox.components.find((component) => component.id === id) || null;
}

function setSandboxStageStatus(message) {
  if (els.sandboxStageStatus) els.sandboxStageStatus.textContent = safeText(message, '场景就绪');
}

function renderSandboxSceneList() {
  if (!els.sandboxSceneList) return;
  clearElement(els.sandboxSceneList);
  if (!state.sandbox.sceneItems.length) {
    const empty = document.createElement('div');
    empty.className = 'sandbox-list-empty';
    empty.textContent = '画布中还没有组件';
    els.sandboxSceneList.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    state.sandbox.sceneItems.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'sandbox-scene-item';
      row.classList.toggle('is-selected', item.id === state.sandbox.selectedId);
      row.style.setProperty('--component-color', item.component.color);

      const select = document.createElement('button');
      select.type = 'button';
      select.dataset.sceneItemId = item.id;
      select.setAttribute('aria-label', `选择 ${item.component.name}`);
      const swatch = document.createElement('span');
      swatch.className = 'sandbox-item-swatch';
      const copy = document.createElement('span');
      copy.className = 'sandbox-item-copy';
      const name = document.createElement('strong');
      name.textContent = item.component.name;
      const meta = document.createElement('small');
      const interaction = item.component.interaction === 'drag' ? '可拖拽' : '位置已锁定';
      meta.textContent = `${interaction} · Y ${item.position.y.toFixed(1)}`;
      copy.appendChild(name);
      copy.appendChild(meta);
      select.appendChild(swatch);
      select.appendChild(copy);

      const edit = document.createElement('button');
      edit.className = 'sandbox-item-action';
      edit.type = 'button';
      edit.dataset.editSceneItem = item.id;
      edit.textContent = '编辑';
      row.appendChild(select);
      row.appendChild(edit);
      fragment.appendChild(row);
    });
    els.sandboxSceneList.appendChild(fragment);
  }
  const count = state.sandbox.sceneItems.length;
  if (els.sandboxSceneComponentCount) els.sandboxSceneComponentCount.textContent = String(count);
  if (els.sandboxObjectCount) els.sandboxObjectCount.textContent = `${count} 个组件`;
  if (els.sandboxStage) els.sandboxStage.classList.toggle('has-items', count > 0);
  if (els.sandboxDuplicateButton) els.sandboxDuplicateButton.disabled = !state.sandbox.selectedId;
  if (els.sandboxDeleteButton) els.sandboxDeleteButton.disabled = !state.sandbox.selectedId;
  if (els.sandboxClearButton) els.sandboxClearButton.disabled = count === 0;
}

function renderSandboxPresets() {
  if (!els.sandboxPresetList) return;
  clearElement(els.sandboxPresetList);
  if (!state.sandbox.presets.length) {
    const empty = document.createElement('div');
    empty.className = 'sandbox-list-empty';
    empty.textContent = '保存后的场景会显示在这里';
    els.sandboxPresetList.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    state.sandbox.presets.forEach((preset) => {
      const row = document.createElement('div');
      row.className = 'sandbox-preset-item';
      row.style.setProperty('--component-color', preset.sceneItems[0]?.component?.color || '#83e4ff');
      const load = document.createElement('button');
      load.type = 'button';
      load.dataset.sandboxPresetId = preset.id;
      load.setAttribute('aria-label', `载入场景 ${preset.name}`);
      const swatch = document.createElement('span');
      swatch.className = 'sandbox-item-swatch';
      const copy = document.createElement('span');
      copy.className = 'sandbox-item-copy';
      const name = document.createElement('strong');
      name.textContent = preset.name;
      const meta = document.createElement('small');
      const sourceLabel = ({ 'built-in': '内置', codex: 'Codex', client: '客户端', market: '市场' })[preset.source] || '客户端';
      const typeLabel = preset.presetType === 'playback' ? '播放效果' : `${preset.sceneItems.length} 个组件`;
      meta.textContent = `${sourceLabel} · ${typeLabel} · ${new Date(preset.updatedAt).toLocaleDateString('zh-CN')}`;
      copy.appendChild(name);
      copy.appendChild(meta);
      load.appendChild(swatch);
      load.appendChild(copy);
      const actions = document.createElement('span');
      actions.className = 'sandbox-preset-actions';
      if (!['built-in', 'market'].includes(preset.source)) {
        const publish = document.createElement('button');
        publish.className = 'sandbox-item-action';
        publish.type = 'button';
        publish.dataset.publishSandboxPreset = preset.id;
        publish.textContent = '上传';
        actions.appendChild(publish);
      }
      if (preset.presetType === 'scene' && preset.sceneItems.length) {
        const saveComponents = document.createElement('button');
        saveComponents.className = 'sandbox-item-action';
        saveComponents.type = 'button';
        saveComponents.dataset.savePresetComponents = preset.id;
        saveComponents.textContent = '组件';
        actions.appendChild(saveComponents);
      }
      const remove = document.createElement('button');
      remove.className = 'sandbox-item-action';
      remove.type = 'button';
      remove.dataset.deleteSandboxPreset = preset.id;
      remove.textContent = '删除';
      actions.appendChild(remove);
      row.appendChild(load);
      row.appendChild(actions);
      fragment.appendChild(row);
    });
    els.sandboxPresetList.appendChild(fragment);
  }
  if (els.sandboxPresetCount) els.sandboxPresetCount.textContent = String(state.sandbox.presets.length);
  renderDiySandboxPresets();
}

function sandboxGeometry(THREE, primitive) {
  if (primitive === 'box') return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  if (primitive === 'torus') return new THREE.TorusGeometry(0.52, 0.16, 12, 40);
  if (primitive === 'cone') return new THREE.ConeGeometry(0.52, 1, 24, 2);
  if (primitive === 'plane') return new THREE.PlaneGeometry(1, 1, 2, 2);
  if (primitive === 'disc') return new THREE.CircleGeometry(0.5, 40);
  if (primitive === 'ring-2d') return new THREE.RingGeometry(0.31, 0.5, 40, 2);
  return new THREE.SphereGeometry(0.5, 32, 20);
}

function sandboxParticleGeometry(THREE, component, renderCount = component.particleCount) {
  const count = clamp(Math.round(renderCount), 8, 2000);
  const positions = new Float32Array(count * 3);
  const primitive = component.primitive;
  for (let index = 0; index < count; index += 1) {
    const t = count <= 1 ? 0 : index / (count - 1);
    const angle = t * Math.PI * 18 + Math.sin(index * 12.9898) * 1.7;
    let x = 0;
    let y = 0;
    let z = 0;
    if (primitive === 'particle-ring') {
      const radius = 0.38 + 0.1 * Math.sin(index * 2.41);
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = Math.sin(index * 4.17) * 0.12;
    } else if (primitive === 'particle-fountain') {
      y = t - 0.5;
      const radius = Math.sin(t * Math.PI) * (0.12 + (index % 11) / 70);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else if (primitive === 'spark-cloud') {
      const radius = 0.16 + ((index * 37) % 101) / 260;
      x = Math.cos(angle) * radius;
      y = Math.sin(index * 1.73) * 0.34;
      z = Math.sin(angle) * radius;
    } else {
      x = (((index * 53) % 197) / 196) - 0.5;
      y = (((index * 97) % 193) / 192) - 0.5;
      z = (((index * 149) % 191) / 190) - 0.5;
    }
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function sandboxMaterial(THREE, component) {
  if (component.category === 'particle') {
    return new THREE.PointsMaterial({
      color: component.color,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: component.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }
  const material = new THREE.MeshStandardMaterial({
    color: component.color,
    emissive: component.color,
    emissiveIntensity: component.category === '2d' ? 0.32 : 0.08,
    metalness: component.category === '2d' ? 0.04 : 0.32,
    roughness: component.category === '2d' ? 0.38 : 0.24,
    transparent: true,
    opacity: component.opacity,
    side: component.category === '2d' ? THREE.DoubleSide : THREE.FrontSide
  });
  return material;
}

function createSandboxObject(THREE, component, particleCount) {
  if (component.primitive === 'gltf') {
    const group = new THREE.Group();
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: component.color, transparent: true, opacity: 0.34, wireframe: true })
    );
    placeholder.userData.sandboxPlaceholder = true;
    group.add(placeholder);
    return group;
  }
  if (component.category === 'particle') {
    return new THREE.Points(sandboxParticleGeometry(THREE, component, particleCount), sandboxMaterial(THREE, component));
  }
  return new THREE.Mesh(sandboxGeometry(THREE, component.primitive), sandboxMaterial(THREE, component));
}

function sandboxParticleBudget() {
  if (RENDER_PROFILE.tier === 'high') return 1800;
  if (RENDER_PROFILE.tier === 'economy') return 620;
  return 1100;
}

function sandboxParticleCountForItem(item) {
  const particleItems = state.sandbox.sceneItems.filter((entry) => entry.component.category === 'particle');
  const share = Math.max(48, Math.floor(sandboxParticleBudget() / Math.max(1, particleItems.length)));
  return Math.min(item.component.particleCount, share);
}

function rebalanceSandboxParticles() {
  state.sandbox.sceneItems
    .filter((item) => item.component.category === 'particle')
    .forEach((item) => {
      const mesh = state.sandbox.meshes.get(item.id);
      const count = sandboxParticleCountForItem(item);
      if (!mesh || mesh.userData.renderParticleCount !== count) rebuildSandboxMesh(item);
    });
}

function disposeSandboxMesh(mesh) {
  if (!mesh) return;
  window.FeStormOceanRuntime?.dispose?.(mesh.userData?.stormOceanRuntime);
  if (mesh.userData.assetMixer) {
    mesh.userData.assetMixer.stopAllAction();
    mesh.userData.assetMixer = null;
  }
  const materials = new Set();
  mesh.traverse((child) => {
    if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
    (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
      if (material) materials.add(material);
    });
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
    });
    if (typeof material.dispose === 'function') material.dispose();
  });
  if (mesh.parent) mesh.parent.remove(mesh);
}

function sandboxAssetUrl(value) {
  try {
    const resolved = new URL(safeText(value, ''), window.location.origin);
    if (resolved.origin !== window.location.origin) return '';
    const pathname = resolved.pathname;
    const bundledAsset = pathname.startsWith('/bundled-assets/');
    const stormAsset = pathname.startsWith('/assets/storm-ocean/');
    const sandboxApiAsset = pathname === '/api/sandbox/assets';
    if ((!bundledAsset && !stormAsset && !sandboxApiAsset) || /%2f|%5c/i.test(pathname)) return '';
    return `${resolved.pathname}${resolved.search}`;
  } catch (error) {
    return '';
  }
}

let sandboxGltfLoaderPromise = null;

function ensureSandboxGltfLoader() {
  if (window.THREE?.GLTFLoader) return Promise.resolve(window.THREE.GLTFLoader);
  if (sandboxGltfLoaderPromise) return sandboxGltfLoaderPromise;
  sandboxGltfLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/GLTFLoader.r128.js?v=20260712-ui-performance-audit';
    script.async = true;
    script.dataset.sandboxGltfLoader = 'true';
    script.addEventListener('load', () => {
      if (window.THREE?.GLTFLoader) resolve(window.THREE.GLTFLoader);
      else reject(new Error('GLTFLoader 未正确初始化'));
    }, { once: true });
    script.addEventListener('error', () => {
      sandboxGltfLoaderPromise = null;
      script.remove();
      reject(new Error('GLTFLoader 加载失败'));
    }, { once: true });
    document.head.appendChild(script);
  });
  return sandboxGltfLoaderPromise;
}

function loadSandboxGltf(item, group) {
  const THREE = window.THREE;
  const modelUrl = sandboxAssetUrl(item.component.asset?.modelUrl);
  const assetReactivity = item.component.asset?.reactivity || {};
  const stormAsset = window.FeStormOceanRuntime?.isProfile?.(assetReactivity) === true;
  if (!THREE || !modelUrl) {
    group.userData.assetError = true;
    if (state.sandbox.playbackPresetId) {
      state.sandbox.playbackAssetReady = false;
      state.sandbox.playbackAssetFailed = true;
      syncSandboxPlaybackAssetState();
    }
    setSandboxStageStatus(`${item.component.name} 的 Blender 模型地址不可用，已显示占位预览`);
    return;
  }
  group.userData.assetLoading = true;
  ensureSandboxGltfLoader().then((Loader) => {
    if (state.sandbox.meshes.get(item.id) !== group) return;
    const loader = new Loader();
    if (stormAsset && typeof loader.parse === 'function') {
      const nativeParse = loader.parse.bind(loader);
      loader.parse = (...args) => {
        const nativeCreateImageBitmap = window.createImageBitmap;
        try {
          window.createImageBitmap = undefined;
          return nativeParse(...args);
        } finally {
          window.createImageBitmap = nativeCreateImageBitmap;
        }
      };
    }
    loader.load(modelUrl, (gltf) => {
    if (state.sandbox.meshes.get(item.id) !== group) return;
    const root = gltf.scene || (Array.isArray(gltf.scenes) ? gltf.scenes[0] : null);
    if (!root) {
      group.userData.assetLoading = false;
      group.userData.assetError = true;
      if (state.sandbox.playbackPresetId) {
        state.sandbox.playbackAssetReady = false;
        state.sandbox.playbackAssetFailed = true;
        syncSandboxPlaybackAssetState();
      }
      return;
    }
    if (stormAsset) {
      root.traverse((child) => {
        const childName = safeText(child.name, '');
        if (child.isLight || childName === 'StormClouds_HorizonBackdrop' || /^StormClouds_.*_Puff_/i.test(childName)) {
          child.visible = false;
        }
      });
    }
    let bounds;
    if (stormAsset) {
      bounds = new THREE.Box3();
      root.traverse((child) => {
        if (child.isMesh && /^StormOcean_(Surface|Near|Far)/i.test(safeText(child.name, ''))) {
          bounds.expandByObject(child);
        }
      });
      if (bounds.isEmpty()) bounds.setFromObject(root);
    } else {
      bounds = new THREE.Box3().setFromObject(root);
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const largest = Math.max(size.x, size.y, size.z, 0.0001);
    const displayScale = clamp(Number(item.component.asset?.displayScale) || 1, 0.5, 4);
    const preserveAuthoredPlayback = sandboxPlaybackActive()
      && (stormAsset || item.component.asset?.playbackView?.preserveAuthoredScale === true);
    const fit = preserveAuthoredPlayback ? 1 : displayScale / largest;
    if (!preserveAuthoredPlayback) {
      root.position.sub(center).multiplyScalar(fit);
      root.scale.multiplyScalar(fit);
    }
    root.traverse((child) => {
      child.userData.sceneItemId = item.id;
      if (child.isMesh) {
        const detailMesh = /DeepParticle|Barnacle|Kelp_|RuinFish_|HazePlane|LightShaft/i.test(safeText(child.name, ''));
        const stormOceanSurface = stormAsset && /^StormOcean_(Surface|Near|Far)/i.test(safeText(child.name, ''));
        child.castShadow = !detailMesh && !stormOceanSurface;
        child.receiveShadow = !detailMesh && !stormOceanSurface;
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
          if (!material) return;
          if (material.name === 'Interactive Oxidized Titanium') {
            material.color?.set(0x02090e);
            material.emissive?.set(0x061c26);
            material.emissiveIntensity = 0.12;
            material.metalness = 0.90;
            material.roughness = 0.24;
          } else if (material.name === 'Interactive Wet Obsidian') {
            material.color?.set(0x000306);
            material.emissive?.set(0x062432);
            material.emissiveIntensity = 0.10;
            material.metalness = 0.78;
            material.roughness = 0.16;
          } else if (material.name === 'Liquid Glass Shell') {
            material.color?.set(0x02080c);
            material.opacity = Math.min(material.opacity, 0.16);
            material.transparent = true;
            material.metalness = 0.18;
            material.roughness = 0.10;
          }
          material.userData.sandboxBaseOpacity = material.opacity * item.component.opacity;
          if ('emissiveIntensity' in material) {
            material.userData.sandboxBaseEmissiveIntensity = material.emissiveIntensity;
          }
          material.transparent = material.transparent || item.component.opacity < 1;
          material.opacity = material.userData.sandboxBaseOpacity;
        });
      }
    });
    root.traverse((child) => {
      child.userData.sandboxBasePosition = child.position.clone();
      child.userData.sandboxBaseRotation = child.rotation.clone();
      child.userData.sandboxBaseScale = child.scale.clone();
    });
    if (stormAsset) {
      group.userData.stormOceanRuntime = window.FeStormOceanRuntime.prepare(root, THREE, {
        ...assetReactivity,
        maxAnisotropy: state.sandbox.renderer?.capabilities?.getMaxAnisotropy?.() || 4
      });
      window.FeStormOceanRuntime.setLightingMode?.(
        group.userData.stormOceanRuntime,
        state.sandbox.stormLightingMode
      );
      window.FeStormOceanRuntime.setThunderstormMode?.(
        group.userData.stormOceanRuntime,
        state.sandbox.stormWeatherMode
      );
      window.FeStormOceanRuntime.configureScene(state.sandbox.scene3d, state.sandbox.renderer, THREE, assetReactivity);
    }
    const reactiveNodes = {
      core: null,
      rings: [],
      wave: null,
      particles: null,
      emitters: []
    };
    const reactiveMaterials = new Set();
    root.traverse((child) => {
      const name = safeText(child.name, '');
      if (name === 'BassCore') reactiveNodes.core = child;
      if (/^BassRing_(Inner|Middle|Outer)$/.test(name)) {
        reactiveNodes.rings.push({
          node: child,
          layer: name.endsWith('Inner') ? 1 : name.endsWith('Middle') ? 0.72 : 0.48,
          direction: name.endsWith('Middle') ? -1 : 1
        });
      }
      if (name === 'BassPressureWave') reactiveNodes.wave = child;
      if (name === 'DeepParticles') reactiveNodes.particles = child;
      if (name.startsWith('BassCore_')) {
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
          const materialName = safeText(material?.name, '');
          if (material && /Electric Cyan|Liquid Glass|Refraction|Emission/i.test(materialName)) {
            reactiveMaterials.add(material);
          }
        });
      }
    });
    reactiveNodes.emitters = Array.from(reactiveMaterials);
    group.children.filter((child) => child.userData.sandboxPlaceholder).forEach(disposeSandboxMesh);
    group.add(root);
    group.userData.assetRoot = root;
    group.userData.assetReactiveNodes = reactiveNodes;
    if (!stormAsset && Array.isArray(gltf.animations) && gltf.animations.length && THREE.AnimationMixer) {
      const mixer = new THREE.AnimationMixer(root);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      group.userData.assetMixer = mixer;
      group.userData.assetMixerUpdatedAt = performance.now();
    }
    group.userData.assetLoading = false;
    group.userData.assetLoaded = true;
    if (state.sandbox.playbackPresetId) {
      state.sandbox.playbackAssetReady = true;
      state.sandbox.playbackAssetFailed = false;
      syncSandboxPlaybackAssetState();
    }
    applySandboxSelectionStyle();
    setSandboxStageStatus(`${item.component.name} 已从 Blender 成品直接导入场景`);
    requestSandboxRender();
    }, undefined, (error) => {
      if (state.sandbox.meshes.get(item.id) !== group) return;
      group.userData.assetLoading = false;
      group.userData.assetError = true;
      console.error('[sandbox-gltf] Blender scene import failed', modelUrl, error);
      if (state.sandbox.playbackPresetId) {
        state.sandbox.playbackAssetReady = false;
        state.sandbox.playbackAssetFailed = true;
        syncSandboxPlaybackAssetState();
      }
      setSandboxStageStatus(`${item.component.name} 导入失败：${safeText(error?.message, '模型文件无法读取')}`);
    });
  }).catch((error) => {
    if (state.sandbox.meshes.get(item.id) !== group) return;
    group.userData.assetLoading = false;
    group.userData.assetError = true;
    if (state.sandbox.playbackPresetId) {
      state.sandbox.playbackAssetReady = false;
      state.sandbox.playbackAssetFailed = true;
      syncSandboxPlaybackAssetState();
    }
    setSandboxStageStatus(`${item.component.name} 导入失败：${safeText(error?.message, '模型加载器不可用')}`);
  });
}

function buildSandboxMesh(item) {
  if (!window.THREE || !state.sandbox.sceneGroup) return null;
  const THREE = window.THREE;
  const renderParticleCount = item.component.category === 'particle' ? sandboxParticleCountForItem(item) : 0;
  const mesh = createSandboxObject(THREE, item.component, renderParticleCount);
  mesh.userData.sceneItemId = item.id;
  mesh.userData.category = item.component.category;
  mesh.userData.baseOpacity = item.component.opacity;
  mesh.userData.renderParticleCount = renderParticleCount;
  mesh.position.set(item.position.x, item.position.y + item.component.dimensions.y * item.scale.y / 2, item.position.z);
  mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
  mesh.castShadow = item.component.category === '3d';
  mesh.receiveShadow = item.component.category === '3d';
  state.sandbox.sceneGroup.add(mesh);
  state.sandbox.meshes.set(item.id, mesh);
  if (item.component.primitive === 'gltf') loadSandboxGltf(item, mesh);
  applySandboxSelectionStyle();
  requestSandboxRender();
  return mesh;
}

function rebuildSandboxMesh(item) {
  const previous = state.sandbox.meshes.get(item.id);
  if (previous) disposeSandboxMesh(previous);
  state.sandbox.meshes.delete(item.id);
  return buildSandboxMesh(item);
}

function rebuildSandboxSceneMeshes() {
  state.sandbox.meshes.forEach(disposeSandboxMesh);
  state.sandbox.meshes.clear();
  state.sandbox.sceneItems.forEach(buildSandboxMesh);
  applySandboxSelectionStyle();
}

function applySandboxSelectionStyle() {
  state.sandbox.meshes.forEach((mesh, id) => {
    mesh.traverse((child) => {
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
        if (!material) return;
        if ('emissiveIntensity' in material) {
          const importedBase = Number(material.userData?.sandboxBaseEmissiveIntensity);
          const baseEmission = Number.isFinite(importedBase)
            ? importedBase
            : (mesh.userData.category === '2d' ? 0.32 : 0.08);
          material.emissiveIntensity = id === state.sandbox.selectedId ? Math.max(0.42, baseEmission) : baseEmission;
        }
        const baseOpacity = Number(material.userData?.sandboxBaseOpacity) || mesh.userData.baseOpacity || 0.92;
        material.opacity = id === state.sandbox.selectedId ? Math.min(1, baseOpacity + 0.08) : baseOpacity;
      });
    });
  });
  requestSandboxRender();
}

function updateSandboxCamera() {
  const sandbox = state.sandbox;
  if (!sandbox.camera || !sandbox.cameraTarget) return;
  const playbackAsset = sandboxPlaybackActive()
    ? sandbox.sceneItems[0]?.component?.asset
    : null;
  const playbackView = playbackAsset?.playbackView || {};
  const stormOcean = window.FeStormOceanRuntime?.isProfile?.(playbackAsset?.reactivity) === true;
  const targetX = Number.isFinite(Number(playbackView.targetX)) ? Number(playbackView.targetX) : 0;
  const targetY = Number.isFinite(Number(playbackView.targetY)) ? Number(playbackView.targetY) : 0.8;
  const targetZ = Number.isFinite(Number(playbackView.targetZ)) ? Number(playbackView.targetZ) : 0;
  const nextFov = clamp(Number(playbackView.fov) || 42, 32, 72);
  const nextNear = clamp(Number(playbackView.near) || 0.1, 0.04, 1);
  const nextFar = clamp(Number(playbackView.far) || (stormOcean ? 6000 : 100), 100, 9000);
  if (sandbox.camera.fov !== nextFov || sandbox.camera.near !== nextNear || sandbox.camera.far !== nextFar) {
    sandbox.camera.fov = nextFov;
    sandbox.camera.near = nextNear;
    sandbox.camera.far = nextFar;
    sandbox.camera.updateProjectionMatrix();
  }
  sandbox.camera.up.set(0, 1, 0);
  sandbox.cameraTarget.set(targetX, targetY, targetZ);
  const horizontal = Math.cos(sandbox.pitch) * sandbox.distance;
  const hasAuthoredCamera = Number.isFinite(Number(playbackView.cameraZ));
  if (hasAuthoredCamera) {
    sandbox.camera.position.set(
      Number(playbackView.cameraX) || 0,
      Number(playbackView.cameraY) || 0,
      Number(playbackView.cameraZ)
    );
  } else {
    sandbox.camera.position.set(
      Math.sin(sandbox.yaw) * horizontal,
      Math.sin(sandbox.pitch) * sandbox.distance + 1.4,
      Math.cos(sandbox.yaw) * horizontal
    );
  }
  sandbox.camera.lookAt(sandbox.cameraTarget);
  requestSandboxRender();
}

function resetSandboxView() {
  state.sandbox.yaw = 0.68;
  state.sandbox.pitch = 0.72;
  state.sandbox.distance = 10.5;
  updateSandboxCamera();
  setSandboxStageStatus('视角已重置');
}

function sandboxPlaybackActive() {
  return !!(state.playbackPage && state.sandbox.playbackPresetId && !state.sandbox.open);
}

function sandboxRendererActive() {
  return state.sandbox.open || sandboxPlaybackActive();
}

function activeStormOceanSceneItem() {
  return state.sandbox.sceneItems.find((item) => (
    window.FeStormOceanRuntime?.isProfile?.(item.component?.asset?.reactivity) === true
  )) || null;
}

function activeStormOceanRuntime() {
  const oceanItem = activeStormOceanSceneItem();
  return oceanItem ? state.sandbox.meshes.get(oceanItem.id)?.userData?.stormOceanRuntime || null : null;
}

function syncStormLightingControls(stormOcean) {
  if (els.stormLightingControls) {
    els.stormLightingControls.hidden = !stormOcean || !sandboxPlaybackActive();
  }
  [els.stormLightingControls, els.stormPresetLightingQuickControls].forEach((container) => {
    container?.querySelectorAll('[data-storm-lighting-mode]').forEach((button) => {
      const active = button.dataset.stormLightingMode === state.sandbox.stormLightingMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    container?.querySelectorAll('[data-storm-weather-mode]').forEach((button) => {
      const active = button.dataset.stormWeatherMode === 'thunderstorm'
        && state.sandbox.stormWeatherMode === 'on';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  });
}

function setStormLightingMode(mode) {
  const normalizedMode = ['day', 'sunset', 'evening'].includes(mode) ? mode : 'realtime';
  state.sandbox.stormLightingMode = normalizedMode;
  window.FeStormOceanRuntime?.setLightingMode?.(activeStormOceanRuntime(), normalizedMode);
  syncStormLightingControls(true);
  renderDiySelectedPresetConfig();
  requestSandboxRender();
}

function setStormThunderstormMode(mode) {
  const normalizedMode = mode === 'on' ? 'on' : 'auto';
  state.sandbox.stormWeatherMode = normalizedMode;
  window.FeStormOceanRuntime?.setThunderstormMode?.(activeStormOceanRuntime(), normalizedMode);
  syncStormLightingControls(true);
  renderDiySelectedPresetConfig();
  requestSandboxRender();
}

function syncSandboxPlaybackAssetState() {
  if (!els.sandboxPlaybackScene) return;
  const stormOcean = !!activeStormOceanSceneItem();
  const liveStormReady = stormOcean && state.sandbox.playbackAssetReady;
  els.sandboxPlaybackScene.classList.toggle('is-model-ready', state.sandbox.playbackAssetReady);
  els.sandboxPlaybackScene.classList.toggle('is-model-failed', state.sandbox.playbackAssetFailed);
  els.sandboxPlaybackScene.classList.toggle(
    'has-persistent-background',
    state.sandbox.playbackKeepBackground && !liveStormReady
  );
  els.sandboxPlaybackScene.classList.toggle('is-storm-ocean', stormOcean);
  syncStormLightingControls(stormOcean);
  if (els.sandboxPlaybackFallback) {
    const previewUrl = state.sandbox.playbackPreviewUrl;
    const overlay = stormOcean
      ? 'linear-gradient(rgba(1, 5, 8, 0.015), rgba(1, 5, 8, 0.16))'
      : 'linear-gradient(rgba(1, 7, 10, 0.12), rgba(1, 7, 10, 0.46))';
    els.sandboxPlaybackFallback.style.backgroundImage = previewUrl
      ? `${overlay}, url("${previewUrl.replace(/"/g, '%22')}")`
      : '';
  }
  if (els.sandboxPlaybackStatus) {
    els.sandboxPlaybackStatus.textContent = state.sandbox.playbackAssetFailed
      ? '实时 3D 不可用，正在显示 Blender 成品预览'
      : state.sandbox.playbackAssetReady
        ? '实时动态场景已就绪'
        : '正在载入实时 3D';
  }
}

function syncSandboxRendererBackground() {
  const renderer = state.sandbox.renderer;
  const scene3d = state.sandbox.scene3d;
  if (!renderer || !scene3d || !window.THREE) return;
  applySandboxRenderClarity();
  const stormOceanItem = activeStormOceanSceneItem();
  const playbackAsset = sandboxPlaybackActive()
    ? (stormOceanItem?.component?.asset || state.sandbox.sceneItems[0]?.component?.asset)
    : null;
  const reactivity = playbackAsset?.reactivity || stormOceanItem?.component?.asset?.reactivity;
  const stormOcean = !!stormOceanItem;
  const transparentPlayback = sandboxPlaybackActive() && state.sandbox.playbackKeepBackground && !stormOcean;
  if (stormOcean) {
    renderer.setClearColor(0x020609, transparentPlayback ? 0 : 1);
    scene3d.background = transparentPlayback ? null : new window.THREE.Color(0x050b10);
    window.FeStormOceanRuntime.configureScene(scene3d, renderer, window.THREE, reactivity);
    scene3d.traverse((child) => {
      if (child.name === 'SandboxHemisphere') child.intensity = 0;
      if (child.name === 'SandboxKey') {
        child.intensity = 0;
        child.castShadow = !MOBILE_RENDER_TARGET;
        if (!MOBILE_RENDER_TARGET && child.shadow?.mapSize && child.shadow.mapSize.width !== 2048) {
          child.shadow.map?.dispose?.();
          child.shadow.map = null;
          child.shadow.mapSize.set(2048, 2048);
        }
      }
      if (child.name === 'SandboxCyanRim') child.intensity = 0;
      if (child.name === 'SandboxRustRim') child.intensity = 0;
    });
    return;
  }
  renderer.setClearColor(0x030708, transparentPlayback ? 0 : 1);
  const playback = sandboxPlaybackActive();
  renderer.toneMappingExposure = playback ? 0.86 : 1;
  if (state.sandbox.defaultEnvironment) scene3d.environment = state.sandbox.defaultEnvironment;
  scene3d.background = transparentPlayback ? null : new window.THREE.Color(playback ? 0x031923 : 0x030708);
  scene3d.fog = playback
    ? new window.THREE.FogExp2(0x062633, 0.065)
    : new window.THREE.Fog(0x030708, 10, 24);
  scene3d.traverse((child) => {
    if (child.name === 'StormCycleHemisphere' || child.name === 'StormCycleSun') child.intensity = 0;
    if (child.name === 'SandboxHemisphere') child.intensity = playback ? 0.48 : 1.08;
    if (child.name === 'SandboxKey') child.intensity = playback ? 1.15 : 1.7;
    if (child.name === 'SandboxCyanRim') child.intensity = playback ? 1.85 : 1.35;
    if (child.name === 'SandboxRustRim') child.intensity = playback ? 1.20 : 0.28;
  });
}

function createSandboxEnvironmentMap(THREE) {
  if (!THREE?.CubeTexture || typeof document === 'undefined') return null;
  const faces = [
    ['#071b24', '#1593af'], ['#06151d', '#0b4558'],
    ['#1b6275', '#06131b'], ['#02090e', '#061c26'],
    ['#0b3140', '#b55b2b'], ['#04121a', '#0b5268']
  ].map(([start, end]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 64, 64);
    gradient.addColorStop(0, start);
    gradient.addColorStop(1, end);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return canvas;
  });
  const texture = new THREE.CubeTexture(faces);
  if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

function syncSandboxPlaybackSurface() {
  const active = sandboxPlaybackActive();
  if (els.sandboxPlaybackScene) els.sandboxPlaybackScene.hidden = !active;
  if (els.appShell) els.appShell.classList.toggle('has-sandbox-playback-scene', active);
  if (els.sandboxCanvas) {
    const target = active ? els.sandboxPlaybackScene : els.sandboxStage;
    if (target && els.sandboxCanvas.parentElement !== target) target.prepend(els.sandboxCanvas);
  }
  state.sandbox.editorHelpers.forEach((helper) => { helper.visible = state.sandbox.open; });
  syncSandboxPlaybackAssetState();
  if (els.diyScenePresetList) {
    els.diyScenePresetList.querySelectorAll('[data-diy-featured-preset]').forEach((button) => {
      button.classList.toggle('is-active', active && button.dataset.diySandboxPreset === state.sandbox.playbackPresetId);
      const selected = button.dataset.diySandboxPreset === state.sandbox.selectedPresetId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  if (els.diySandboxPresetList) {
    els.diySandboxPresetList.querySelectorAll('[data-diy-preset-card]').forEach((card) => {
      card.classList.toggle('is-active', active && card.dataset.diyPresetCard === state.sandbox.playbackPresetId);
      const selected = card.dataset.diyPresetCard === state.sandbox.selectedPresetId;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-current', String(selected));
    });
  }
  state.sandbox.resizePending = true;
  if (active) {
    try {
      initSandboxRenderer();
      syncSandboxRendererBackground();
      startSandboxRendering();
    } catch (error) {
      state.sandbox.playbackAssetReady = false;
      state.sandbox.playbackAssetFailed = true;
      syncSandboxPlaybackAssetState();
      setSandboxStageStatus(`实时 3D 初始化失败：${safeText(error?.message, 'WebGL 不可用')}`);
    }
  } else if (!state.sandbox.open) {
    stopSandboxRendering();
  }
  syncSandboxRendererBackground();
}

function initSandboxRenderer() {
  if (state.sandbox.renderer || !window.THREE || !els.sandboxCanvas) return;
  const THREE = window.THREE;
  const renderer = createDirectX11Renderer(THREE, {
    canvas: els.sandboxCanvas,
    antialias: !MOBILE_RENDER_TARGET && RENDER_PROFILE.tier !== 'economy',
    alpha: true
  });
  renderer.setClearColor(0x030708, 1);
  renderer.setPixelRatio(sandboxRenderPixelRatio());
  renderer.shadowMap.enabled = !MOBILE_RENDER_TARGET;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const renderQuality = window.FeRenderQuality?.create?.(renderer, {
    THREE,
    mode: 'native',
    initialScale: 1,
    minScale: 0.5,
    maxScale: 1,
    targetFrameMs: state.renderClarity.targetFrameMs,
    sharpness: 0.28
  }) || null;

  const scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x030708);
  scene3d.fog = new THREE.Fog(0x030708, 10, 24);
  scene3d.environment = createSandboxEnvironmentMap(THREE);
  state.sandbox.defaultEnvironment = scene3d.environment;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const group = new THREE.Group();
  scene3d.add(group);

  const grid = new THREE.GridHelper(14, 28, 0x4a8494, 0x18323a);
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  scene3d.add(grid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x061014, roughness: 0.84, metalness: 0.08, transparent: true, opacity: 0.72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene3d.add(floor);
  state.sandbox.editorHelpers = [grid, floor];
  state.sandbox.editorHelpers.forEach((helper) => { helper.visible = state.sandbox.open; });

  const hemisphere = new THREE.HemisphereLight(0xdff8ff, 0x071216, 1.08);
  hemisphere.name = 'SandboxHemisphere';
  scene3d.add(hemisphere);
  const key = new THREE.DirectionalLight(0xb8efff, 1.7);
  key.name = 'SandboxKey';
  key.position.set(5, 9, 4);
  key.castShadow = !MOBILE_RENDER_TARGET;
  const sandboxShadowSize = RENDER_PROFILE.tier === 'high' ? 768 : MOBILE_RENDER_TARGET ? 256 : 512;
  key.shadow.mapSize.set(sandboxShadowSize, sandboxShadowSize);
  scene3d.add(key);
  const rim = new THREE.PointLight(0x83e4ff, 1.35, 18);
  rim.name = 'SandboxCyanRim';
  rim.position.set(-5, 4, -3);
  scene3d.add(rim);
  const rustRim = new THREE.PointLight(0xd66a2e, 0.28, 16);
  rustRim.name = 'SandboxRustRim';
  rustRim.position.set(4.5, 2.4, 2.8);
  scene3d.add(rustRim);

  state.sandbox.renderer = renderer;
  state.sandbox.renderQuality = renderQuality;
  applySandboxRenderClarity(true);
  state.clientRuntime.renderCapabilities.diagnostics = renderQuality?.getDiagnostics?.() || null;
  syncRenderTechnologyStatus();
  state.sandbox.scene3d = scene3d;
  state.sandbox.camera = camera;
  state.sandbox.cameraTarget = new THREE.Vector3(0, 0.8, 0);
  state.sandbox.sceneGroup = group;
  state.sandbox.raycaster = new THREE.Raycaster();
  state.sandbox.raycaster.params.Points.threshold = 0.18;
  state.sandbox.pointer = new THREE.Vector2();
  state.sandbox.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  syncSandboxRendererBackground();
  if ('ResizeObserver' in window && !state.sandbox.resizeObserver) {
    state.sandbox.resizeObserver = new ResizeObserver(() => {
      state.sandbox.resizePending = true;
      requestSandboxRender();
    });
    state.sandbox.resizeObserver.observe(els.sandboxStage);
    if (els.sandboxPlaybackScene) state.sandbox.resizeObserver.observe(els.sandboxPlaybackScene);
  }
  updateSandboxCamera();
  state.sandbox.resizePending = true;
  resizeSandboxRenderer();
  rebuildSandboxSceneMeshes();
}

function initSandboxPreviewRenderer() {
  if (state.sandbox.previewRenderer || !window.THREE || !els.sandboxComponentPreview) return;
  const THREE = window.THREE;
  const renderer = createDirectX11Renderer(THREE, {
    canvas: els.sandboxComponentPreview,
    antialias: true,
    alpha: true
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(Number(window.devicePixelRatio) || 1, 1.5));
  const scene3d = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(3.2, 2.4, 4.2);
  camera.lookAt(0, 0.25, 0);
  scene3d.add(new THREE.HemisphereLight(0xe9fbff, 0x071216, 1.3));
  const key = new THREE.DirectionalLight(0xb8efff, 1.8);
  key.position.set(4, 5, 4);
  scene3d.add(key);
  const rim = new THREE.PointLight(0x83e4ff, 1.2, 10);
  rim.position.set(-3, 1, -2);
  scene3d.add(rim);
  state.sandbox.previewRenderer = renderer;
  state.sandbox.previewScene = scene3d;
  state.sandbox.previewCamera = camera;
  if ('ResizeObserver' in window && state.sandbox.resizeObserver && els.sandboxComponentPreview) {
    state.sandbox.resizeObserver.observe(els.sandboxComponentPreview);
  }
  state.sandbox.resizePending = true;
  resizeSandboxPreview();
  rebuildSandboxPreview();
}

function resizeSandboxRenderer() {
  const renderer = state.sandbox.renderer;
  const camera = state.sandbox.camera;
  const host = sandboxPlaybackActive() ? els.sandboxPlaybackScene : els.sandboxStage;
  if (!renderer || !camera || !host) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (width < 2 || height < 2) return;
  const canvas = renderer.domElement;
  const targetWidth = Math.floor(width * renderer.getPixelRatio());
  const targetHeight = Math.floor(height * renderer.getPixelRatio());
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  state.sandbox.renderQuality?.resize?.(width, height, renderer.getPixelRatio());
}

function resizeSandboxPreview() {
  const renderer = state.sandbox.previewRenderer;
  const camera = state.sandbox.previewCamera;
  if (!renderer || !camera || !els.sandboxComponentPreview) return;
  const width = els.sandboxComponentPreview.clientWidth;
  const height = els.sandboxComponentPreview.clientHeight;
  if (width < 2 || height < 2) return;
  const targetWidth = Math.floor(width * renderer.getPixelRatio());
  const targetHeight = Math.floor(height * renderer.getPixelRatio());
  if (renderer.domElement.width !== targetWidth || renderer.domElement.height !== targetHeight) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function readSandboxComponentForm() {
  return normalizeSandboxComponent({
    name: els.sandboxComponentName?.value,
    category: els.sandboxCategory?.value,
    primitive: els.sandboxPrimitive?.value,
    color: els.sandboxComponentColor?.value,
    dimensions: {
      x: els.sandboxWidth?.value,
      y: els.sandboxHeight?.value,
      z: els.sandboxDepth?.value
    },
    rotation360: !!els.sandboxRotationToggle?.checked,
    interaction: els.sandboxInteraction?.value,
    motion: els.sandboxMotion?.value,
    beatMode: els.sandboxBeatMode?.value,
    musicBand: els.sandboxMusicBand?.value,
    amplitude: els.sandboxAmplitude?.value,
    speed: Number(els.sandboxSpeed?.value || 100) / 100,
    particleCount: els.sandboxParticleCount?.value,
    opacity: Number(els.sandboxOpacity?.value || 92) / 100,
    source: 'generated'
  });
}

function syncSandboxPrimitiveOptions(category, selectedPrimitive = '') {
  if (!els.sandboxPrimitive) return;
  const groups = {
    '3d': [['sphere', '球体'], ['box', '立方体'], ['torus', '圆环'], ['cone', '锥体'], ...(selectedPrimitive === 'gltf' ? [['gltf', 'Blender 3D 场景']] : [])],
    '2d': [['plane', '2D 光幕'], ['disc', '2D 圆片'], ['ring-2d', '2D 圆环']],
    particle: [['particle-field', '粒子场'], ['particle-ring', '粒子环'], ['particle-fountain', '粒子喷泉'], ['spark-cloud', '火花云']]
  };
  const choices = groups[category] || groups['3d'];
  const nextValue = choices.some(([value]) => value === selectedPrimitive) ? selectedPrimitive : choices[0][0];
  clearElement(els.sandboxPrimitive);
  choices.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    els.sandboxPrimitive.appendChild(option);
  });
  els.sandboxPrimitive.value = nextValue;
}

function writeSandboxTransformForm(item = null) {
  const position = item?.position || { x: 0, y: 0, z: 0 };
  if (els.sandboxPositionX) els.sandboxPositionX.value = Number(position.x).toFixed(1);
  if (els.sandboxPositionY) els.sandboxPositionY.value = Number(position.y).toFixed(1);
  if (els.sandboxPositionZ) els.sandboxPositionZ.value = Number(position.z).toFixed(1);
}

function writeSandboxComponentForm(component, item = null) {
  const normalized = normalizeSandboxComponent(component);
  if (els.sandboxComponentName) els.sandboxComponentName.value = normalized.name;
  if (els.sandboxCategory) els.sandboxCategory.value = normalized.category;
  syncSandboxPrimitiveOptions(normalized.category, normalized.primitive);
  if (els.sandboxPrimitive) els.sandboxPrimitive.value = normalized.primitive;
  if (els.sandboxComponentColor) els.sandboxComponentColor.value = normalized.color;
  if (els.sandboxWidth) els.sandboxWidth.value = normalized.dimensions.x.toFixed(1);
  if (els.sandboxHeight) els.sandboxHeight.value = normalized.dimensions.y.toFixed(1);
  if (els.sandboxDepth) els.sandboxDepth.value = normalized.dimensions.z.toFixed(1);
  if (els.sandboxRotationToggle) els.sandboxRotationToggle.checked = normalized.rotation360;
  if (els.sandboxInteraction) els.sandboxInteraction.value = normalized.interaction;
  if (els.sandboxMotion) els.sandboxMotion.value = normalized.motion;
  if (els.sandboxBeatMode) els.sandboxBeatMode.value = normalized.beatMode;
  if (els.sandboxMusicBand) els.sandboxMusicBand.value = normalized.musicBand;
  if (els.sandboxAmplitude) els.sandboxAmplitude.value = String(normalized.amplitude);
  if (els.sandboxSpeed) els.sandboxSpeed.value = String(Math.round(normalized.speed * 100));
  if (els.sandboxParticleCount) els.sandboxParticleCount.value = String(normalized.particleCount);
  if (els.sandboxOpacity) els.sandboxOpacity.value = String(Math.round(normalized.opacity * 100));
  [
    els.sandboxAmplitude,
    els.sandboxSpeed,
    els.sandboxParticleCount,
    els.sandboxOpacity
  ].forEach(syncElasticRangeVisual);
  writeSandboxTransformForm(item);
  syncSandboxFormPresentation();
  if (state.sandbox.tab === 'generator') rebuildSandboxPreview();
}

function syncSandboxFormPresentation() {
  const component = readSandboxComponentForm();
  if (els.sandboxComponentColorValue) els.sandboxComponentColorValue.textContent = component.color.toUpperCase();
  if (els.sandboxAmplitudeValue) els.sandboxAmplitudeValue.textContent = `${Math.round(component.amplitude)}%`;
  if (els.sandboxSpeedValue) els.sandboxSpeedValue.textContent = `${component.speed.toFixed(1)}×`;
  if (els.sandboxPreviewName) els.sandboxPreviewName.textContent = component.name;
  if (els.sandboxMusicControls) els.sandboxMusicControls.classList.toggle('is-disabled', component.motion !== 'music');
  if (els.sandboxParticleControls) els.sandboxParticleControls.hidden = component.category !== 'particle';
}

function rebuildSandboxPreview() {
  initSandboxPreviewRenderer();
  const sandbox = state.sandbox;
  if (!sandbox.previewScene || !window.THREE) return;
  if (sandbox.previewMesh) disposeSandboxMesh(sandbox.previewMesh);
  const component = readSandboxComponentForm();
  const THREE = window.THREE;
  const mesh = createSandboxObject(THREE, component, Math.min(component.particleCount, 360));
  const scaleMax = Math.max(component.dimensions.x, component.dimensions.y, component.dimensions.z, 1);
  const fit = 1.55 / scaleMax;
  mesh.scale.set(component.dimensions.x * fit, component.dimensions.y * fit, component.dimensions.z * fit);
  sandbox.previewScene.add(mesh);
  sandbox.previewMesh = mesh;
  requestSandboxRender();
}

function updateSelectedSandboxItemFromForm() {
  syncSandboxFormPresentation();
  rebuildSandboxPreview();
  const item = sandboxSceneItemById(state.sandbox.selectedId);
  if (!item) return;
  const next = readSandboxComponentForm();
  item.component = {
    ...next,
    id: item.component.id,
    asset: next.primitive === 'gltf' ? item.component.asset : next.asset,
    source: item.component.source
  };
  item.position.x = clamp(Number(els.sandboxPositionX?.value) || 0, -5.2, 5.2);
  item.position.y = clamp(Number(els.sandboxPositionY?.value) || 0, 0, 8);
  item.position.z = clamp(Number(els.sandboxPositionZ?.value) || 0, -4.2, 4.2);
  rebuildSandboxMesh(item);
  rebalanceSandboxParticles();
  renderSandboxSceneList();
  saveSandboxDraft();
}

function sandboxAudioSignal(component, now) {
  const band = component.musicBand === 'treble'
    ? Math.max(state.visual.treble || 0, state.visual.presence || 0)
    : component.musicBand === 'energy'
      ? state.visual.energy || 0
      : state.visual.bass || 0;
  if (!els.audio || !els.audio.paused) return clamp(band, 0, 1);
  return reducedMotion ? 0.12 : 0.12 + (Math.sin(now * component.speed * 0.0024) + 1) * 0.08;
}

function animateSandboxWaveFollower(item, mesh, now, waveFollower) {
  const sampler = window.FeStormOceanRuntime?.sampleWaveFrame;
  if (typeof sampler !== 'function' || !waveFollower) return false;
  const oceanItem = state.sandbox.sceneItems.find((candidate) => (
    window.FeStormOceanRuntime?.isProfile?.(candidate.component.asset?.reactivity) === true
  ));
  const oceanMesh = oceanItem ? state.sandbox.meshes.get(oceanItem.id) : null;
  const oceanRuntime = oceanMesh?.userData?.stormOceanRuntime;
  if (!oceanItem || !oceanMesh || !oceanRuntime) return false;

  const scaleX = Math.max(0.0001, Math.abs(Number(oceanMesh.scale.x) || 1));
  const scaleY = Math.max(0.0001, Math.abs(Number(oceanMesh.scale.y) || 1));
  const scaleZ = Math.max(0.0001, Math.abs(Number(oceanMesh.scale.z) || 1));
  const localX = (mesh.position.x - oceanMesh.position.x) / scaleX;
  const localZ = (mesh.position.z - oceanMesh.position.z) / scaleZ;
  const seconds = Number(oceanRuntime.currentTime) || Math.max(0, Number(now) || 0) / 1000;
  const smoothBass = clamp(Number(oceanRuntime.currentBass) || 0, 0, 1);
  const sample = sampler(
    localX,
    localZ,
    seconds,
    smoothBass,
    oceanItem.component.asset?.reactivity || {},
    clamp(Number(waveFollower.sampleStep) || 1.2, 0.2, 4),
    clamp(Number(oceanRuntime.thunderstormIntensity) || 0, 0, 1)
  );
  if (!sample || !Number.isFinite(sample.height)) return false;

  const heading = item.rotation.y + (Number(waveFollower.headingOffset) || 0);
  const cosHeading = Math.cos(heading);
  const sinHeading = Math.sin(heading);
  const longitudinalSlope = sample.slopeX * cosHeading - sample.slopeZ * sinHeading;
  const beamSlope = sample.slopeX * sinHeading + sample.slopeZ * cosHeading;
  const maxTilt = clamp(Number(waveFollower.maxTiltDegrees) || 10, 2, 18) * Math.PI / 180;
  const targetPitch = clamp(
    Math.atan(longitudinalSlope) * clamp(Number(waveFollower.pitchScale) || 0.72, 0, 1.5),
    -maxTilt,
    maxTilt
  );
  const targetRoll = clamp(
    -Math.atan(beamSlope) * clamp(Number(waveFollower.rollScale) || 0.9, 0, 1.5),
    -maxTilt,
    maxTilt
  );
  const playbackView = item.component.asset?.playbackView || {};
  const waterlineOffset = clamp(Number(waveFollower.waterlineOffset) || 0, -20, 20);
  const heaveScale = clamp(Number(waveFollower.heaveScale) || 1, 0, 2);
  const targetY = item.position.y
    + (Number(playbackView.offsetY) || 0)
    + waterlineOffset
    + sample.height * scaleY * heaveScale;
  const previous = mesh.userData.stormWaveFollower || {
    lastTime: now,
    y: targetY,
    pitch: targetPitch,
    roll: targetRoll
  };
  const dt = clamp((now - previous.lastTime) / 1000, 1 / 240, 0.1);
  const heaveResponse = clamp(Number(waveFollower.heaveResponse) || 2.8, 0.5, 12);
  const tiltResponse = clamp(Number(waveFollower.tiltResponse) || 2.2, 0.5, 12);
  const heaveBlend = 1 - Math.exp(-heaveResponse * dt);
  const tiltBlend = 1 - Math.exp(-tiltResponse * dt);
  previous.y += (targetY - previous.y) * heaveBlend;
  previous.pitch += (targetPitch - previous.pitch) * tiltBlend;
  previous.roll += (targetRoll - previous.roll) * tiltBlend;
  previous.lastTime = now;
  mesh.userData.stormWaveFollower = previous;
  mesh.position.y = previous.y;
  mesh.rotation.x = item.rotation.x + previous.roll;
  mesh.rotation.y = heading;
  mesh.rotation.z = item.rotation.z + previous.pitch;
  return true;
}

function sandboxSceneItemRuntimeSnapshot(itemId) {
  const mesh = state.sandbox.meshes.get(safeText(itemId, ''));
  const THREE = window.THREE;
  const loaded = Boolean(mesh?.userData?.assetLoaded && mesh?.userData?.assetRoot);
  const stormRuntime = mesh?.userData?.stormOceanRuntime;
  const stormSkyShader = stormRuntime?.skyDome?.material?.fragmentShader || '';
  const thunderstormConfig = stormRuntime?.config?.thunderstorm || {};
  const sunsetSeagullsConfig = stormRuntime?.config?.sunsetSeagulls || {};
  const seagullFlock = stormRuntime?.seagullFlock;
  let boundsSize = [];
  if (loaded && THREE?.Box3 && THREE?.Vector3) {
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    boundsSize = [size.x, size.y, size.z].map((value) => Number(value.toFixed(4)));
  }
  return {
    loaded,
    loading: Boolean(mesh?.userData?.assetLoading),
    failed: Boolean(mesh?.userData?.assetError),
    boundsSize,
    position: mesh ? [mesh.position.x, mesh.position.y, mesh.position.z] : [],
    rotation: mesh ? [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z] : [],
    waveFollowerActive: Boolean(mesh?.userData?.stormWaveFollower),
    stormOcean: stormRuntime ? {
      runtimeVersion: window.FeStormOceanRuntime?.runtimeVersion || '',
      cyclesEnvironment: window.FeStormOceanRuntime?.cyclesEnvironmentDiagnostics?.() || {},
      materialCount: stormRuntime.oceanMaterials?.length || 0,
      compiledMaterialCount: stormRuntime.oceanMaterials?.filter((material) => material.userData?.stormOceanShader).length || 0,
      waterTextureResolution: Number(stormRuntime.waterTextures?.textureState?.resolution) || 0,
      waterTextureRequestedResolution: Number(stormRuntime.waterTextures?.textureState?.requestedResolution) || 0,
      waterTextureMaximumSize: Number(stormRuntime.waterTextures?.textureState?.maximumTextureSize) || 0,
      waterTextureUsingFallback: stormRuntime.waterTextures?.textureState?.usingFallback === true,
      waterTextureFallbackReason: stormRuntime.waterTextures?.textureState?.fallbackReason || '',
      waterNormalImageWidth: Number(
        stormRuntime.waterTextures?.normalMap?.image?.naturalWidth
        || stormRuntime.waterTextures?.normalMap?.image?.width
      ) || 0,
      waterRoughnessImageWidth: Number(
        stormRuntime.waterTextures?.roughnessMap?.image?.naturalWidth
        || stormRuntime.waterTextures?.roughnessMap?.image?.width
      ) || 0,
      radianceShoulderCompiled: stormRuntime.oceanMaterials?.some((material) => (
        material.userData?.stormOceanShader?.fragmentShader?.includes('stormReflectionShoulder')
        && material.userData?.stormOceanShader?.fragmentShader?.includes('stormSceneRefraction')
      )) || false,
      sceneColorRefractionReady: Number(stormRuntime.uniforms?.sceneRefractionReady?.value) > 0.5,
      sceneColorRefractionTarget: [
        Number(stormRuntime.refractionTarget?.width) || 0,
        Number(stormRuntime.refractionTarget?.height) || 0
      ],
      surfaceDetailCompiled: stormRuntime.oceanMaterials?.some((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        return fragmentShader.includes('stormMesoRipple')
          && fragmentShader.includes('stormUltraCapillaryLace')
          && fragmentShader.includes('stormFacetGrain')
          && fragmentShader.includes('stormCrossMesoDetail')
          && fragmentShader.includes('stormWeatherFine')
          && fragmentShader.includes('stormSurfaceDetailV8')
          && fragmentShader.includes('stormNaturalCapillaryV8');
      }) || false,
      surfaceDetailV8Compiled: stormRuntime.oceanMaterials?.every((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        return fragmentShader.includes('stormSurfaceDetailV8')
          && fragmentShader.includes('stormNaturalCapillaryV8')
          && fragmentShader.includes('stormWaterNeutralSky');
      }) || false,
      clearWaterOpticsCompiled: stormRuntime.oceanMaterials?.every((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        return fragmentShader.includes('stormWaterAbsorption')
          && fragmentShader.includes('stormDirectSpecularV3')
          && fragmentShader.includes('stormReflectionWeight');
      }) || false,
      skyReflectionCoupledCompiled: stormRuntime.oceanMaterials?.every((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        return fragmentShader.includes('stormReflectedSkyFbmV3')
          && fragmentShader.includes('inverseTransformDirection(rayDirection, viewMatrix)');
      }) || false,
      normalDerivativeAaCompiled: stormRuntime.oceanMaterials?.every((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        return fragmentShader.includes('stormSecondaryNormalV3')
          && fragmentShader.includes('stormNormalDerivativeVarianceV3');
      }) || false,
      weatherMode: stormRuntime.thunderstormMode || 'auto',
      thunderstormActive: Number(stormRuntime.thunderstormIntensity) > 0.04,
      thunderstormSource: stormRuntime.thunderstormSource || 'none',
      thunderstormIntensity: Number((stormRuntime.thunderstormIntensity || 0).toFixed(4)),
      cloudCoverage: Number(thunderstormConfig.clouds?.coverage) || 0,
      cloudConvergenceDirectionCount: Number(thunderstormConfig.clouds?.convergenceDirections) || 0,
      lightningEnabled: thunderstormConfig.lightning?.mode === 'seeded-random-cloud-to-ocean',
      lightningFlash: Number((stormRuntime.lightningFlash || 0).toFixed(4)),
      lightningStrikeCount: Number(stormRuntime.lightningStrikeCount) || 0,
      lastLightningTarget: stormRuntime.lastLightningTarget || [],
      lightningTargetSurface: 'ocean',
      lightningInternalGlowColor: thunderstormConfig.lightning?.internalGlowColor || '',
      thunderstormWaveGain: Number(thunderstormConfig.bassWaveGain) || 1,
      thunderstormSkyCompiled: stormSkyShader.includes('lightningBolt')
        && stormSkyShader.includes('internalGlow')
        && stormSkyShader.includes('uStormThunderFlow'),
      thunderstormWaterCompiled: stormRuntime.oceanMaterials?.some((material) => {
        const fragmentShader = material.userData?.stormOceanShader?.fragmentShader || '';
        const vertexShader = material.userData?.stormOceanShader?.vertexShader || '';
        return fragmentShader.includes('stormLightningWaterMask')
          && fragmentShader.includes('uStormThunder')
          && vertexShader.includes('stormThunderBassGain');
      }) || false,
      seagullEnabled: sunsetSeagullsConfig.enabled !== false && Boolean(seagullFlock),
      seagullPhase: sunsetSeagullsConfig.phase || 'sunset',
      seagullPhaseEligible: seagullFlock?.phaseEligible === true,
      seagullScheduleState: seagullFlock?.scheduleState || 'unavailable',
      seagullGroupVisible: seagullFlock?.group?.visible === true,
      seagullVisibleCount: Number(seagullFlock?.visibleCount) || 0,
      seagullTargetCount: Number(seagullFlock?.count) || 0,
      seagullFlockIntensity: Number((seagullFlock?.visibility || 0).toFixed(4)),
      seagullRenderBatches: Number(seagullFlock?.renderBatches) || 0,
      seagullRenderer: sunsetSeagullsConfig.renderer || '',
      seagullMotionModel: sunsetSeagullsConfig.motionModel || '',
      seagullPoseRevision: Number(seagullFlock?.poseRevision) || 0,
      seagullPoseChecksum: Number((seagullFlock?.poseChecksum || 0).toFixed(5)),
      seagullPositions: (seagullFlock?.poses || []).map((position) => [...position]),
      seagullWingAngles: [...(seagullFlock?.wingAngles || [])]
    } : null
  };
}

function sandboxComponentRuntimeSnapshot(componentId) {
  const item = state.sandbox.sceneItems.find((candidate) => candidate.component.id === safeText(componentId, ''));
  return item
    ? { sceneItemId: item.id, ...sandboxSceneItemRuntimeSnapshot(item.id) }
    : { sceneItemId: '', loaded: false, loading: false, failed: false, boundsSize: [], position: [], rotation: [], waveFollowerActive: false };
}

function triggerSandboxStormLightning(componentId, strikeIndex) {
  const item = state.sandbox.sceneItems.find((candidate) => candidate.component.id === safeText(componentId, ''));
  const runtime = item ? state.sandbox.meshes.get(item.id)?.userData?.stormOceanRuntime : null;
  return window.FeStormOceanRuntime?.triggerLightning?.(runtime, strikeIndex) || null;
}

function previewSandboxSunsetSeagulls(componentId, enabled = true) {
  const item = state.sandbox.sceneItems.find((candidate) => candidate.component.id === safeText(componentId, ''));
  const runtime = item ? state.sandbox.meshes.get(item.id)?.userData?.stormOceanRuntime : null;
  return window.FeStormOceanRuntime?.setSeagullPreview?.(runtime, enabled === true) || false;
}

window.FeSandboxDiagnostics = Object.freeze({
  sceneItem: sandboxSceneItemRuntimeSnapshot,
  component: sandboxComponentRuntimeSnapshot,
  triggerStormLightning: triggerSandboxStormLightning,
  previewSunsetSeagulls: previewSandboxSunsetSeagulls,
  freeCube: freeCubeRuntimeSnapshot,
  voidPrism: voidPrismRuntimeSnapshot,
  chladni: chladniRuntimeSnapshot,
  previewFreeCubeBass,
  clearFreeCubeBassPreview
});

function animateSandboxGltfReactivity(item, mesh, now, signal) {
  const root = mesh.userData.assetRoot;
  const asset = item.component.asset || {};
  if (!root) return;
  if (asset.waveFollower && animateSandboxWaveFollower(item, mesh, now, asset.waveFollower)) return;
  const nodes = mesh.userData.assetReactiveNodes;
  const reactivity = asset.reactivity;
  if (!reactivity) return;
  if (window.FeStormOceanRuntime?.isProfile?.(reactivity)) {
    const playing = !!els.audio && !els.audio.paused;
    const lowFrequencyDrive = clamp(
      Number(state.visual.lowFrequencyAmplitude)
        || Number(state.visualBridge.lowFrequencyAmplitude)
        || 0,
      0,
      1
    );
    window.FeStormOceanRuntime.update(
      mesh.userData.stormOceanRuntime,
      now,
      playing ? lowFrequencyDrive : 0,
      playing
    );
    return;
  }
  if (!nodes || reactivity.profile !== 'bass-pulse-core-v1') return;
  const coreScale = clamp(Number(reactivity.coreScale) || 0.12, 0, 0.3);
  const ringCompression = clamp(Number(reactivity.ringCompression) || 0.055, 0, 0.18);
  const waveExpansion = clamp(Number(reactivity.waveExpansion) || 0.22, 0, 0.6);
  const rotationSpeed = clamp(Number(reactivity.rotationSpeed) || 0.12, 0, 1);
  const emissionBoost = clamp(Number(reactivity.emissionBoost) || 1.35, 0, 6);
  const lightSignal = Math.pow(clamp(signal, 0, 1), 0.78);
  const coreBaseScale = nodes.core?.userData?.sandboxBaseScale;
  if (coreBaseScale) nodes.core.scale.copy(coreBaseScale).multiplyScalar(1 + signal * coreScale);
  nodes.rings.forEach(({ node, layer, direction }) => {
    const baseScale = node.userData.sandboxBaseScale;
    const baseRotation = node.userData.sandboxBaseRotation;
    if (!baseScale || !baseRotation) return;
    node.scale.copy(baseScale).multiplyScalar(1 - signal * ringCompression * layer);
    node.rotation.copy(baseRotation);
    node.rotation.y += now * 0.00008 * rotationSpeed * direction;
  });
  const waveBaseScale = nodes.wave?.userData?.sandboxBaseScale;
  if (waveBaseScale) nodes.wave.scale.copy(waveBaseScale).multiplyScalar(1 + signal * waveExpansion);
  const particlesBaseScale = nodes.particles?.userData?.sandboxBaseScale;
  if (particlesBaseScale) nodes.particles.scale.copy(particlesBaseScale).multiplyScalar(1 + signal * 0.025);
  nodes.emitters.forEach((material) => {
    const base = Number(material?.userData?.sandboxBaseEmissiveIntensity);
    if (Number.isFinite(base)) material.emissiveIntensity = base * (1 + lightSignal * emissionBoost);
  });
}

function animateSandboxMesh(item, mesh, now) {
  const component = item.component;
  const dims = component.dimensions;
  const amplitude = component.amplitude / 100;
  const reactiveProfile = component.asset?.reactivity?.profile;
  const rotateWhole = component.rotation360 && reactiveProfile !== 'bass-pulse-core-v1' && reactiveProfile !== 'storm-ocean-v1';
  let scale = 1;
  let lift = 0;
  let musicSignal = 0;
  if (!reducedMotion && mesh.userData.assetMixer) {
    const lastMixerAt = Number(mesh.userData.assetMixerUpdatedAt) || now;
    mesh.userData.assetMixer.update(clamp((now - lastMixerAt) / 1000, 0, 0.12));
    mesh.userData.assetMixerUpdatedAt = now;
  }
  mesh.rotation.x = item.rotation.x;
  mesh.rotation.z = item.rotation.z;
  mesh.rotation.y = item.rotation.y;
  if (!reducedMotion) {
    if (component.motion === 'music') {
      const signal = sandboxAudioSignal(component, now);
      musicSignal = signal;
      if (component.beatMode === 'scale') scale = 1 + signal * amplitude * 0.48;
      if (component.beatMode === 'bounce') lift = signal * amplitude * 1.7;
      if (component.beatMode === 'wave') scale = 1 + (0.5 + Math.sin(now * component.speed * 0.004) * 0.5) * amplitude * (0.16 + signal * 0.22);
      if (rotateWhole) mesh.rotation.y = item.rotation.y + now * component.speed * 0.00025;
    } else if (component.motion === 'spin' && rotateWhole) {
      mesh.rotation.y = item.rotation.y + now * component.speed * 0.0005;
    } else if (component.motion === 'float') {
      lift = Math.sin(now * component.speed * 0.0022 + item.position.x) * (0.12 + amplitude * 0.34);
      if (rotateWhole) mesh.rotation.y = item.rotation.y + now * component.speed * 0.00012;
    }
  }
  const playbackGltf = component.primitive === 'gltf' && sandboxPlaybackActive();
  if (playbackGltf) {
    const playbackView = component.asset?.playbackView || {};
    const sceneScale = clamp(Number(playbackView.sceneScale) || 1, 0.4, 3);
    const sceneScaleX = clamp(Number(playbackView.sceneScaleX) || sceneScale, 0.4, 6);
    const sceneScaleY = clamp(Number(playbackView.sceneScaleY) || sceneScale, 0.4, 6);
    const sceneScaleZ = clamp(Number(playbackView.sceneScaleZ) || sceneScale, 0.4, 6);
    mesh.scale.set(item.scale.x * sceneScaleX * scale, item.scale.y * sceneScaleY * scale, item.scale.z * sceneScaleZ * scale);
    mesh.position.set(
      item.position.x + (Number(playbackView.offsetX) || 0),
      item.position.y + (Number(playbackView.offsetY) || 0) + lift,
      item.position.z + (Number(playbackView.offsetZ) || 0)
    );
  } else {
    mesh.scale.set(dims.x * item.scale.x * scale, dims.y * item.scale.y * scale, dims.z * item.scale.z * scale);
    mesh.position.set(item.position.x, item.position.y + dims.y * item.scale.y * scale / 2 + lift, item.position.z);
  }
  if (component.primitive === 'gltf') animateSandboxGltfReactivity(item, mesh, now, musicSignal);
}

function sandboxFrameInterval() {
  return 0;
}

function sandboxHasContinuousMotion(previewComponent = null) {
  if (!sandboxRendererActive() || document.hidden) return false;
  if (!reducedMotion && state.sandbox.sceneItems.some((item) => item.component.motion !== 'none')) return true;
  return !!(!reducedMotion && previewComponent && (previewComponent.motion !== 'none' || previewComponent.rotation360));
}

function requestSandboxRender() {
  const sandbox = state.sandbox;
  sandbox.renderRequested = true;
  if (sandboxRendererActive() && !sandbox.animationFrame) {
    sandbox.animationFrame = window.requestAnimationFrame(renderSandboxFrame);
  }
}

function renderSandboxFrame(now = performance.now()) {
  const sandbox = state.sandbox;
  sandbox.animationFrame = 0;
  if (!sandboxRendererActive()) return;

  const previewActive = sandbox.open && sandbox.tab === 'generator' && !!sandbox.previewMesh;
  const elapsed = now - sandbox.lastFrameAt;
  const frameStep = sandbox.lastFrameAt ? clamp(elapsed / 20, 0.05, 2.5) : 1;
  const previewComponent = previewActive ? readSandboxComponentForm() : null;
  const continuous = sandboxHasContinuousMotion(previewComponent);
  if (!sandbox.renderRequested && elapsed < sandboxFrameInterval()) {
    if (continuous) sandbox.animationFrame = window.requestAnimationFrame(renderSandboxFrame);
    return;
  }

  if (sandbox.resizePending) {
    resizeSandboxRenderer();
    if (previewActive) resizeSandboxPreview();
    sandbox.resizePending = false;
  }
  sandbox.sceneItems.forEach((item) => {
    const mesh = sandbox.meshes.get(item.id);
    if (mesh) animateSandboxMesh(item, mesh, now);
  });
  if (previewActive && previewComponent) {
    if (!reducedMotion && previewComponent.rotation360) sandbox.previewMesh.rotation.y += 0.008 * previewComponent.speed * frameStep;
    const pulse = previewComponent.motion === 'music' && !reducedMotion
      ? 1 + sandboxAudioSignal(previewComponent, now) * previewComponent.amplitude / 480
      : 1;
    const maxDimension = Math.max(previewComponent.dimensions.x, previewComponent.dimensions.y, previewComponent.dimensions.z, 1);
    const fit = 1.55 / maxDimension;
    sandbox.previewMesh.scale.set(
      previewComponent.dimensions.x * fit * pulse,
      previewComponent.dimensions.y * fit * pulse,
      previewComponent.dimensions.z * fit * pulse
    );
  }
  if (sandbox.renderer && sandbox.scene3d && sandbox.camera) {
    window.FeStormOceanRuntime?.captureRefraction?.(sandbox.scene3d, sandbox.renderer, sandbox.camera, now);
    if (sandbox.renderQuality) sandbox.renderQuality.render(sandbox.scene3d, sandbox.camera, now);
    else sandbox.renderer.render(sandbox.scene3d, sandbox.camera);
    if (now - sandbox.lastRenderQualityStatusAt > 1000) {
      sandbox.lastRenderQualityStatusAt = now;
      state.clientRuntime.renderCapabilities.diagnostics = sandbox.renderQuality?.getDiagnostics?.() || null;
      syncRenderTechnologyStatus();
    }
  }
  if (previewActive && sandbox.previewRenderer && sandbox.previewScene && sandbox.previewCamera) {
    sandbox.previewRenderer.render(sandbox.previewScene, sandbox.previewCamera);
  }
  observeRenderClarityFrame(now);
  sandbox.lastFrameAt = now;
  sandbox.renderRequested = false;
  if (continuous) sandbox.animationFrame = window.requestAnimationFrame(renderSandboxFrame);
}

function startSandboxRendering() {
  requestSandboxRender();
}

function stopSandboxRendering() {
  if (state.sandbox.animationFrame) window.cancelAnimationFrame(state.sandbox.animationFrame);
  state.sandbox.animationFrame = 0;
  state.sandbox.renderRequested = false;
}

function selectSandboxItem(id, options = {}) {
  const item = sandboxSceneItemById(id);
  state.sandbox.selectedId = item ? item.id : '';
  applySandboxSelectionStyle();
  renderSandboxSceneList();
  if (item && options.syncForm !== false) writeSandboxComponentForm(item.component, item);
  if (item && options.edit) setSandboxTab('generator');
  setSandboxStageStatus(item ? `已选择：${item.component.name}` : '场景就绪');
}

function sandboxGroundPoint(clientX, clientY) {
  const sandbox = state.sandbox;
  if (!sandbox.raycaster || !sandbox.camera || !sandbox.groundPlane || !els.sandboxCanvas || !window.THREE) return null;
  const rect = els.sandboxCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  sandbox.pointer.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  sandbox.raycaster.setFromCamera(sandbox.pointer, sandbox.camera);
  const point = new window.THREE.Vector3();
  return sandbox.raycaster.ray.intersectPlane(sandbox.groundPlane, point) ? point : null;
}

function sandboxHitItem(clientX, clientY) {
  const sandbox = state.sandbox;
  if (!sandbox.raycaster || !sandbox.camera || !els.sandboxCanvas) return null;
  const rect = els.sandboxCanvas.getBoundingClientRect();
  sandbox.pointer.set(
    ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
  );
  sandbox.raycaster.setFromCamera(sandbox.pointer, sandbox.camera);
  const hits = sandbox.raycaster.intersectObjects(Array.from(sandbox.meshes.values()), true);
  let target = hits[0]?.object || null;
  while (target && !target.userData?.sceneItemId) target = target.parent;
  const id = target?.userData?.sceneItemId;
  return id ? sandboxSceneItemById(id) : null;
}

function addSandboxComponentToScene(component, point = null) {
  if (!component) return null;
  const offset = state.sandbox.sceneItems.length * 0.38;
  const item = normalizeSandboxSceneItem({
    id: sandboxId('scene-item'),
    component: normalizeSandboxComponent(component),
    position: {
      x: point ? point.x : clamp(-1.2 + offset, -3.4, 3.4),
      y: 0,
      z: point ? point.z : clamp(0.4 - offset * 0.34, -2.8, 2.8)
    }
  });
  state.sandbox.sceneItems.push(item);
  buildSandboxMesh(item);
  rebalanceSandboxParticles();
  selectSandboxItem(item.id);
  saveSandboxDraft();
  renderSandboxSceneList();
  setSandboxStageStatus(`${item.component.name} 已加入场景`);
  return item;
}

function duplicateSelectedSandboxItem() {
  const item = sandboxSceneItemById(state.sandbox.selectedId);
  if (!item) return;
  const duplicate = normalizeSandboxSceneItem({
    component: item.component,
    position: { x: item.position.x + 0.55, y: item.position.y, z: item.position.z + 0.55 },
    rotation: item.rotation,
    scale: item.scale
  });
  state.sandbox.sceneItems.push(duplicate);
  buildSandboxMesh(duplicate);
  rebalanceSandboxParticles();
  selectSandboxItem(duplicate.id);
  saveSandboxDraft();
}

function deleteSelectedSandboxItem() {
  const id = state.sandbox.selectedId;
  if (!id) return;
  const mesh = state.sandbox.meshes.get(id);
  if (mesh) disposeSandboxMesh(mesh);
  state.sandbox.meshes.delete(id);
  state.sandbox.sceneItems = state.sandbox.sceneItems.filter((item) => item.id !== id);
  rebalanceSandboxParticles();
  requestSandboxRender();
  state.sandbox.selectedId = '';
  renderSandboxSceneList();
  saveSandboxDraft();
  setSandboxStageStatus('组件已删除');
}

function clearSandboxScene() {
  state.sandbox.meshes.forEach(disposeSandboxMesh);
  state.sandbox.meshes.clear();
  state.sandbox.sceneItems = [];
  state.sandbox.selectedId = '';
  renderSandboxSceneList();
  requestSandboxRender();
  saveSandboxDraft();
  setSandboxStageStatus('场景已清空');
}

async function saveSandboxPreset() {
  if (state.sandbox.codexDraft) {
    return commitCodexDraft();
  }
  const name = safeText(els.sandboxSceneName?.value, state.sandbox.sceneName).trim().slice(0, 32) || '未命名场景';
  state.sandbox.sceneName = name;
  const preset = normalizeSandboxPreset({
    id: sandboxId('preset'),
    name,
    createdAt: Date.now(),
    sceneItems: state.sandbox.sceneItems
  });
  if (els.sandboxSavePresetButton) els.sandboxSavePresetButton.disabled = true;
  try {
    const response = await apiJson('/api/sandbox/presets', {
      method: 'POST',
      body: JSON.stringify({ preset })
    });
    state.sandbox.presets = Array.isArray(response.presets) ? response.presets.map(normalizeSandboxPreset) : state.sandbox.presets;
    state.sandbox.presetFolder = safeText(response.folder, state.sandbox.presetFolder);
    saveSandboxPresets();
    saveSandboxDraft();
    renderSandboxPresets();
    if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = `已写入预设文件夹：${name}`;
    toast('场景已保存到客户端预设文件夹');
  } catch (error) {
    setSandboxStageStatus(`保存失败：${error.message || '预设服务不可用'}`);
    toast('预设文件夹保存失败');
  } finally {
    if (els.sandboxSavePresetButton) els.sandboxSavePresetButton.disabled = false;
  }
}

function applySandboxScenePreset(preset, options = {}) {
  if (!preset) return false;
  state.sandbox.codexDraft = null;
  setSandboxCodexDecisionsVisible(false);
  state.sandbox.sceneName = preset.name;
  state.sandbox.sceneItems = preset.sceneItems.map((item) => normalizeSandboxSceneItem({
    ...item,
    id: sandboxId('scene-item')
  }));
  state.sandbox.selectedId = '';
  if (els.sandboxSceneName) els.sandboxSceneName.value = preset.name;
  rebuildSandboxSceneMeshes();
  renderSandboxSceneList();
  if (options.persistDraft !== false) saveSandboxDraft();
  setSandboxStageStatus(`已载入：${preset.name}`);
  requestSandboxRender();
  return true;
}

function loadSandboxPreset(id) {
  const preset = state.sandbox.presets.find((item) => item.id === id);
  if (!preset) return;
  if (preset.presetType === 'playback' && preset.playbackPreset) {
    setSandboxOpen(false);
    enterPresetPlaybackPage(preset.playbackPreset);
    return;
  }
  state.sandbox.playbackPresetId = '';
  applySandboxScenePreset(preset);
}

async function deleteSandboxPreset(id) {
  try {
    const response = await apiJson('/api/sandbox/presets/delete', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
    state.sandbox.presets = Array.isArray(response.presets) ? response.presets.map(normalizeSandboxPreset) : [];
    saveSandboxPresets();
    renderSandboxPresets();
    toast(response.deleted ? '预设已从客户端文件夹删除' : '预设文件不存在');
  } catch (error) {
    setSandboxStageStatus(`删除失败：${error.message || '预设服务不可用'}`);
  }
}

function renderSandboxPipeline(plan = [], mode = '') {
  if (!els.sandboxPipeline || !els.sandboxPipelineList) return;
  els.sandboxPipeline.hidden = false;
  clearElement(els.sandboxPipelineList);
  if (els.sandboxPipelineMode) els.sandboxPipelineMode.textContent = safeText(mode, '计划已生成');
  const fragment = document.createDocumentFragment();
  plan.forEach((step, index) => {
    const row = document.createElement('div');
    row.className = 'sandbox-pipeline-step';
    const status = safeText(step.status, step.qualityScore !== undefined ? 'complete' : 'ready');
    row.classList.toggle('is-active', status === 'running' || status === 'ready');
    row.classList.toggle('is-complete', status === 'complete');
    row.classList.toggle('is-warning', status === 'waiting' || status === 'unavailable');
    const number = document.createElement('span');
    number.className = 'sandbox-pipeline-step-index';
    number.textContent = status === 'complete' ? '✓' : String(index + 1);
    const copy = document.createElement('span');
    copy.className = 'sandbox-pipeline-step-copy';
    const title = document.createElement('strong');
    title.textContent = safeText(step.title || step.name, '处理组件');
    const skill = document.createElement('small');
    skill.textContent = safeText(step.skill || step.approach || step.feasibility, '通用处理');
    const label = document.createElement('span');
    label.textContent = ({ complete: '完成', running: '处理中', ready: '待执行', waiting: '待接入', unavailable: '未配置' })[status] || '待执行';
    copy.appendChild(title);
    copy.appendChild(skill);
    row.appendChild(number);
    row.appendChild(copy);
    row.appendChild(label);
    fragment.appendChild(row);
  });
  els.sandboxPipelineList.appendChild(fragment);
}

function fallbackSandboxPlan() {
  return [
    { title: '解析组件规格', skill: '参数建模', status: 'complete' },
    { title: '生成 Codex 执行计划', skill: 'Codex 适配器', status: 'unavailable' },
    { title: '编排材质与动效', skill: '动效与音频响应', status: 'ready' },
    { title: 'Blender 渲染与导出', skill: 'Blender 适配器', status: 'unavailable' },
    { title: '创建客户端 3D 预览', skill: 'Three.js', status: 'complete' }
  ];
}

function renderSandboxCodexChat() {
  if (!els.sandboxCodexChatMessages) return;
  clearElement(els.sandboxCodexChatMessages);
  if (!state.sandbox.codexConversation.length) {
    const empty = document.createElement('p');
    empty.className = 'sandbox-codex-chat-empty';
    empty.textContent = '直接描述场景，或上传 2D 参考图后发送。Codex 会保留本次对话上下文。';
    els.sandboxCodexChatMessages.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.sandbox.codexConversation.forEach((message) => {
    const item = document.createElement('article');
    const isUser = message.role === 'user';
    item.className = `sandbox-codex-message${isUser ? ' is-user' : ''}`;
    const author = document.createElement('strong');
    author.textContent = isUser ? '你' : 'CODEX';
    const content = document.createElement('p');
    content.textContent = safeText(message.content, '');
    item.appendChild(author);
    item.appendChild(content);
    fragment.appendChild(item);
  });
  els.sandboxCodexChatMessages.appendChild(fragment);
  els.sandboxCodexChatMessages.scrollTop = els.sandboxCodexChatMessages.scrollHeight;
}

function appendSandboxCodexMessage(role, content) {
  const text = safeText(content, '').trim();
  if (!text) return;
  state.sandbox.codexConversation.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text });
  if (state.sandbox.codexConversation.length > 24) state.sandbox.codexConversation.splice(0, state.sandbox.codexConversation.length - 24);
  renderSandboxCodexChat();
}

function sandboxCodexConversationPayload() {
  return state.sandbox.codexConversation.slice(-12).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: safeText(message.content, '').slice(0, 700)
  }));
}

function sandboxCodexReply(response = {}) {
  const parts = [safeText(response.summary || response.message, 'Codex 暂未返回说明')];
  const questions = Array.isArray(response.questions) ? response.questions.filter(Boolean) : [];
  if (questions.length) parts.push(`我还需要确认：${questions.join('；')}`);
  if (response.selectedPlan) parts.push(`当前选择：${safeText(response.selectedPlan, '')}`);
  return parts.join('\n');
}

async function sendSandboxCodexMessage() {
  if (state.sandbox.generationRunning) return;
  const instruction = safeText(els.sandboxCodexPrompt?.value, '').trim();
  const referenceImage = state.sandbox.codexDraft && !state.sandbox.referenceImagePending
    ? ''
    : state.sandbox.referenceImage;
  const hasReferenceImage = !!referenceImage;
  if (!instruction && !hasReferenceImage) {
    toast('请先输入消息或上传一张 2D 参考图');
    return;
  }
  appendSandboxCodexMessage('user', instruction || '我上传了一张 2D 参考图，请直接据此创建 3D 效果。');
  if (els.sandboxCodexPrompt) els.sandboxCodexPrompt.value = '';
  const options = {
    instruction,
    referenceImage,
    conversation: sandboxCodexConversationPayload(),
    fromChat: true
  };
  if (state.sandbox.codexDraft) {
    await reworkCodexDraft('improve', options);
  } else {
    await generateSandboxComponent(options);
  }
}

function renderSandboxCodexResponse(response = {}) {
  if (!els.sandboxCodexResponse) return;
  clearElement(els.sandboxCodexResponse);
  els.sandboxCodexResponse.hidden = false;
  const title = document.createElement('strong');
  const status = safeText(response.status, 'failed');
  title.textContent = status === 'preview_ready' ? 'Codex 成品预览已就绪'
    : status === 'saved' ? 'Codex 成品已保存到预设文件夹'
      : status === 'needs_clarification' ? 'Codex 需要你补充信息'
        : 'Codex 暂未完成';
  const summary = document.createElement('p');
  summary.textContent = safeText(response.summary || response.message, '暂无说明');
  els.sandboxCodexResponse.appendChild(title);
  els.sandboxCodexResponse.appendChild(summary);

  const questions = Array.isArray(response.questions) ? response.questions : [];
  if (questions.length) {
    const list = document.createElement('ol');
    questions.forEach((question) => {
      const item = document.createElement('li');
      item.textContent = safeText(question, '请补充需求');
      list.appendChild(item);
    });
    els.sandboxCodexResponse.appendChild(list);
  }
  if (response.selectedPlan) {
    const selected = document.createElement('small');
    selected.textContent = `最终方案：${safeText(response.selectedPlan, '')}`;
    els.sandboxCodexResponse.appendChild(selected);
  }
  const skills = Array.isArray(response.matchedSkills) ? response.matchedSkills.filter(Boolean) : [];
  if (skills.length) {
    const matched = document.createElement('small');
    matched.textContent = `调用能力：${skills.join('、')}`;
    els.sandboxCodexResponse.appendChild(matched);
  }
  const comparison = response.comparison && typeof response.comparison === 'object' ? response.comparison : {};
  const baseline = safeText(comparison.baselinePlan, '').trim();
  const improvements = Array.isArray(comparison.improvements) ? comparison.improvements.filter(Boolean) : [];
  if (baseline || improvements.length) {
    const comparisonCopy = document.createElement('small');
    comparisonCopy.textContent = baseline ? `与旧方案对比：${baseline}` : '本次为首个方案';
    els.sandboxCodexResponse.appendChild(comparisonCopy);
    if (improvements.length) {
      const list = document.createElement('ol');
      improvements.forEach((improvement) => {
        const item = document.createElement('li');
        item.textContent = safeText(improvement, '已调整方案细节');
        list.appendChild(item);
      });
      els.sandboxCodexResponse.appendChild(list);
    }
  }
}

function importCodexPresetComponents(preset) {
  if (!preset || !Array.isArray(preset.sceneItems)) return [];
  const byId = new Map(state.sandbox.components.map((component) => [component.id, component]));
  const imported = [];
  preset.sceneItems.forEach((item) => {
    const component = normalizeSandboxComponent({ ...item.component, source: 'codex' });
    byId.set(component.id, component);
    imported.push(component);
  });
  state.sandbox.components = Array.from(byId.values());
  saveSandboxComponents();
  renderSandboxLibrary();
  return imported;
}

async function syncCodexPresetComponents(preset) {
  const imported = importCodexPresetComponents(preset);
  for (const component of imported) {
    await persistSandboxComponent(component, { source: 'codex', quiet: true });
  }
  return imported;
}

async function saveSandboxComponent() {
  const component = readSandboxComponentForm();
  const saved = await persistSandboxComponent(component, { source: 'client' });
  state.sandbox.selectedLibraryId = saved.id;
  renderSandboxLibrary();
  setSandboxStageStatus(`${saved.name} 已保存到组件文件夹并显示在组件库`);
  toast('组件已保存到组件库');
  return saved;
}

function marketTagsForComponent(component = {}) {
  const tags = [component.category === 'particle' ? '粒子' : component.category === '2d' ? '2D' : '3D'];
  if (component.motion === 'music') tags.push('音乐响应');
  if (component.rotation360) tags.push('360°');
  return tags;
}

async function publishSandboxComponent() {
  const component = await saveSandboxComponent();
  const profile = state.community.profile || {};
  try {
    const payload = await apiJson('/api/component-market/upload', {
      method: 'POST',
      body: JSON.stringify({
        componentId: component.id,
        title: component.name,
        description: `${sandboxPrimitiveLabel(component.primitive)} · ${sandboxMotionLabel(component)}`,
        tags: marketTagsForComponent(component),
        author: { id: safeText(profile.feId, ''), name: communityProfileDisplayName() }
      })
    });
    toast(`${component.name} 已上传到创作市场`);
    if (state.community.profileOpen) refreshPresetMarket().catch(() => {});
    return payload.item;
  } catch (error) {
    toast(error.message || '上传组件失败');
    return null;
  }
}

async function savePresetComponentsToLibrary(id) {
  const preset = state.sandbox.presets.find((item) => item.id === id);
  if (!preset || !preset.sceneItems.length) return;
  const unique = new Map();
  preset.sceneItems.forEach((item) => {
    const component = normalizeSandboxComponent(item.component, { source: 'client' });
    unique.set(component.id, component);
  });
  const saved = [];
  for (const component of unique.values()) saved.push(await persistSandboxComponent(component, { source: 'client', quiet: true }));
  setSandboxStageStatus(`${preset.name} 的 ${saved.length} 个组件已保存到组件库`);
  toast(`已将 ${saved.length} 个组件加入组件库`);
}

function setSandboxCodexBusy(busy) {
  state.sandbox.generationRunning = !!busy;
  [
    els.sandboxGenerateButton,
    els.sandboxCommitCodexButton,
    els.sandboxImproveCodexButton,
    els.sandboxRedoCodexButton
  ].filter(Boolean).forEach((button) => {
    button.disabled = !!busy;
  });
}

function setSandboxCodexDecisionsVisible(visible) {
  if (els.sandboxCodexDecisions) els.sandboxCodexDecisions.hidden = !visible;
}

function applyCodexDraftPreview(response) {
  const draftId = safeText(response.draftId, '').trim();
  if (!draftId || !response.preset) return false;
  const preset = normalizeSandboxPreset(response.preset);
  state.sandbox.codexDraft = { draftId, preset, response };
  state.sandbox.referenceImagePending = false;
  state.sandbox.sceneName = preset.name;
  state.sandbox.sceneItems = preset.sceneItems.map((item) => normalizeSandboxSceneItem({
    ...item,
    id: sandboxId('scene-item')
  }));
  state.sandbox.selectedId = '';
  if (els.sandboxSceneName) els.sandboxSceneName.value = preset.name;
  importCodexPresetComponents(preset);
  syncCodexPresetComponents(preset).catch(() => {});
  rebuildSandboxSceneMeshes();
  renderSandboxSceneList();
  setSandboxCodexDecisionsVisible(true);
  setSandboxStageStatus(`${preset.name} 已载入成品预览，尚未保存到预设文件夹`);
  return true;
}

function renderSandboxCodexPipeline(response) {
  const plans = Array.isArray(response.plans) ? response.plans : [];
  const status = safeText(response.status, 'failed');
  const mode = status === 'preview_ready' ? '成品预览待确认'
    : status === 'saved' ? '已写入客户端预设'
      : status === 'needs_clarification' ? '等待用户回复'
        : '生成未完成';
  renderSandboxPipeline(plans.length ? plans : [
    {
      title: status === 'needs_clarification' ? '等待补充需求' : 'Codex 未生成方案',
      skill: safeText(response.message || response.summary, '请检查服务状态'),
      status: status === 'needs_clarification' ? 'waiting' : 'unavailable'
    }
  ], mode);
}

function applySavedCodexPreset(response) {
  if (!response.preset) return false;
  const preset = normalizeSandboxPreset(response.preset);
  state.sandbox.presets = Array.isArray(response.presets) ? response.presets.map(normalizeSandboxPreset) : [
    preset,
    ...state.sandbox.presets.filter((item) => item.id !== preset.id)
  ];
  state.sandbox.presetFolder = safeText(response.presetFolder, state.sandbox.presetFolder);
  importCodexPresetComponents(preset);
  syncCodexPresetComponents(preset).catch(() => {});
  saveSandboxPresets();
  renderSandboxPresets();
  state.sandbox.codexDraft = null;
  setSandboxCodexDecisionsVisible(false);
  loadSandboxPreset(preset.id);
  setSandboxStageStatus(`${preset.name} 已由 Codex 写入客户端预设文件夹`);
  toast('Codex 成品已保存，可在预设与组件库中继续使用');
  return true;
}

async function generateSandboxComponent(options = {}) {
  if (state.sandbox.generationRunning) return;
  const component = readSandboxComponentForm();
  const instruction = typeof options.instruction === 'string'
    ? options.instruction.trim()
    : safeText(els.sandboxCodexPrompt?.value, '').trim();
  const referenceImage = typeof options.referenceImage === 'string'
    ? options.referenceImage
    : state.sandbox.referenceImagePending ? state.sandbox.referenceImage : '';
  const conversation = Array.isArray(options.conversation)
    ? options.conversation
    : sandboxCodexConversationPayload();
  state.sandbox.codexDraft = null;
  setSandboxCodexDecisionsVisible(false);
  setSandboxCodexBusy(true);
  renderSandboxPipeline([
    { title: '正在发送组件规格', skill: '服务端接收', status: 'running' }
  ], '正在提交');
  let response = null;
  try {
    response = await apiJson('/api/sandbox/generate', {
      method: 'POST',
      body: JSON.stringify({
        sceneName: safeText(els.sandboxSceneName?.value, state.sandbox.sceneName),
        instruction,
        referenceImage,
        specification: component,
        conversation
      })
    });
  } catch (error) {
    response = {
      ok: false,
      status: 'failed',
      message: error.message || '服务端 Codex 接口不可用'
    };
  }
  renderSandboxCodexResponse(response);
  appendSandboxCodexMessage('assistant', sandboxCodexReply(response));
  renderSandboxCodexPipeline(response);

  if (response.status === 'preview_ready' && applyCodexDraftPreview(response)) {
    toast('Codex 成品预览已载入，请选择保存、改进或重做');
  } else if (response.status === 'needs_clarification') {
    setSandboxStageStatus('请回答 Codex 的问题后再次发送');
  } else {
    setSandboxStageStatus(safeText(response.message, 'Codex 未完成生成'));
  }
  setSandboxCodexBusy(false);
}

async function commitCodexDraft() {
  const draft = state.sandbox.codexDraft;
  if (!draft?.draftId || state.sandbox.generationRunning) return;
  setSandboxCodexBusy(true);
  let response;
  try {
    response = await apiJson('/api/sandbox/codex/commit', {
      method: 'POST',
      body: JSON.stringify({ draftId: draft.draftId })
    });
  } catch (error) {
    response = { ok: false, status: 'failed', message: error.message || '保存成品失败' };
  }
  renderSandboxCodexResponse(response);
  appendSandboxCodexMessage('assistant', sandboxCodexReply(response));
  renderSandboxCodexPipeline(response);
  if (response.status === 'saved' && applySavedCodexPreset(response)) {
    if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = 'Codex 成品已写入预设文件夹';
  } else if (response.status !== 'saved') {
    setSandboxStageStatus(safeText(response.message, 'Codex 成品未能保存'));
  }
  setSandboxCodexBusy(false);
}

async function reworkCodexDraft(mode, options = {}) {
  const draft = state.sandbox.codexDraft;
  if (!draft?.draftId || state.sandbox.generationRunning) {
    toast('请先生成一个 Codex 成品预览');
    return;
  }
  const revisionMode = mode === 'improve' ? 'improve' : 'redo';
  const instruction = typeof options.instruction === 'string'
    ? options.instruction.trim()
    : revisionMode === 'improve' ? safeText(els.sandboxRevisionPrompt?.value, '').trim() : '';
  const referenceImage = typeof options.referenceImage === 'string'
    ? options.referenceImage
    : state.sandbox.referenceImagePending ? state.sandbox.referenceImage : '';
  if (!options.fromChat) {
    const userMessage = instruction || (revisionMode === 'redo'
      ? '没有新增要求，请生成一个可与当前方案对比的更优新方案。'
      : '我想改进当前方案。');
    appendSandboxCodexMessage('user', userMessage);
  }
  const conversation = Array.isArray(options.conversation)
    ? options.conversation
    : sandboxCodexConversationPayload();
  setSandboxCodexBusy(true);
  renderSandboxPipeline([
    { title: revisionMode === 'improve' ? '正在按要求改进方案' : '正在重做并比较旧方案', skill: 'Codex 修订', status: 'running' }
  ], '正在生成新方案');
  let response;
  try {
    response = await apiJson('/api/sandbox/codex/rework', {
      method: 'POST',
      body: JSON.stringify({
        draftId: draft.draftId,
        mode: revisionMode,
        instruction,
        referenceImage,
        sceneName: safeText(els.sandboxSceneName?.value, state.sandbox.sceneName),
        specification: readSandboxComponentForm(),
        conversation
      })
    });
  } catch (error) {
    response = { ok: false, status: 'failed', message: error.message || 'Codex 改进失败' };
  }
  renderSandboxCodexResponse(response);
  appendSandboxCodexMessage('assistant', sandboxCodexReply(response));
  renderSandboxCodexPipeline(response);
  if (response.status === 'preview_ready' && applyCodexDraftPreview(response)) {
    if (els.sandboxRevisionPrompt) els.sandboxRevisionPrompt.value = '';
    toast(revisionMode === 'improve' ? '已生成改进版成品预览' : '已生成新方案，可与上一版对比');
  } else if (response.status === 'needs_clarification') {
    setSandboxCodexDecisionsVisible(true);
    setSandboxStageStatus('请补充改进要求后再次提交');
  } else {
    setSandboxCodexDecisionsVisible(true);
    setSandboxStageStatus(safeText(response.message, 'Codex 未完成改进'));
  }
  setSandboxCodexBusy(false);
}

function setSandboxOpen(open) {
  state.sandbox.open = !!open;
  if (els.sandboxPage) els.sandboxPage.hidden = !state.sandbox.open;
  if (els.appShell) els.appShell.classList.toggle('is-sandbox-page', state.sandbox.open);
  if (els.sandboxModeButton) {
    els.sandboxModeButton.setAttribute('aria-pressed', String(state.sandbox.open));
    els.sandboxModeButton.setAttribute('aria-label', state.sandbox.open ? '退出沙盒模式' : '进入沙盒模式');
  }
  syncSandboxPlaybackSurface();
  applyPresetUpscaler({ force: true });
  if (state.sandbox.open) {
    if (state.diyOpen) setDiyOpen(false);
    renderSandboxLibrary();
    renderSandboxSceneList();
    renderSandboxPresets();
    renderSandboxCodexChat();
    refreshSandboxComponents({ silent: true });
    refreshSandboxPresets({ silent: true });
    window.requestAnimationFrame(() => {
      initSandboxRenderer();
      resizeSandboxRenderer();
      state.sandbox.resizePending = true;
      state.sandbox.lastFrameAt = 0;
      startSandboxRendering();
    });
  } else {
    if (!sandboxPlaybackActive()) stopSandboxRendering();
    saveSandboxDraft({ immediate: true });
    requestOrbFrame();
  }
}

function beginSandboxCanvasPointer(event) {
  if (!state.sandbox.open || event.button !== 0) return;
  const item = sandboxHitItem(event.clientX, event.clientY);
  if (item) {
    selectSandboxItem(item.id);
    if (item.component.interaction === 'drag') {
      state.sandbox.dragPointerId = event.pointerId;
      state.sandbox.draggedItemId = item.id;
      setSandboxStageStatus(`拖动中：${item.component.name}`);
    }
  } else {
    selectSandboxItem('');
    state.sandbox.orbitPointerId = event.pointerId;
    state.sandbox.orbitLastX = event.clientX;
    state.sandbox.orbitLastY = event.clientY;
  }
  if (els.sandboxCanvas && typeof els.sandboxCanvas.setPointerCapture === 'function') {
    try { els.sandboxCanvas.setPointerCapture(event.pointerId); } catch (error) {}
  }
  event.preventDefault();
}

function moveSandboxCanvasPointer(event) {
  if (event.pointerId === state.sandbox.dragPointerId && state.sandbox.draggedItemId) {
    const point = sandboxGroundPoint(event.clientX, event.clientY);
    const item = sandboxSceneItemById(state.sandbox.draggedItemId);
    if (point && item) {
      item.position.x = clamp(point.x, -5.2, 5.2);
      item.position.z = clamp(point.z, -4.2, 4.2);
      requestSandboxRender();
    }
    event.preventDefault();
    return;
  }
  if (event.pointerId === state.sandbox.orbitPointerId) {
    const dx = event.clientX - state.sandbox.orbitLastX;
    const dy = event.clientY - state.sandbox.orbitLastY;
    state.sandbox.orbitLastX = event.clientX;
    state.sandbox.orbitLastY = event.clientY;
    state.sandbox.yaw -= dx * 0.007;
    state.sandbox.pitch = clamp(state.sandbox.pitch + dy * 0.005, 0.18, 1.22);
    updateSandboxCamera();
    event.preventDefault();
  }
}

function endSandboxCanvasPointer(event) {
  if (event.pointerId === state.sandbox.dragPointerId) {
    const dragged = sandboxSceneItemById(state.sandbox.draggedItemId);
    state.sandbox.dragPointerId = null;
    state.sandbox.draggedItemId = '';
    if (dragged && dragged.id === state.sandbox.selectedId) writeSandboxTransformForm(dragged);
    saveSandboxDraft();
    renderSandboxSceneList();
    setSandboxStageStatus('组件位置已更新');
  }
  if (event.pointerId === state.sandbox.orbitPointerId) {
    state.sandbox.orbitPointerId = null;
    setSandboxStageStatus('视角已更新');
  }
}

function bindSandboxEvents() {
  if (!els.sandboxModeButton) return;
  els.sandboxModeButton.addEventListener('click', () => setSandboxOpen(!state.sandbox.open));
  if (els.sandboxLibraryTab) els.sandboxLibraryTab.addEventListener('click', () => setSandboxTab('library'));
  if (els.sandboxGeneratorTab) els.sandboxGeneratorTab.addEventListener('click', () => setSandboxTab('generator'));
  if (els.sandboxLibrarySearch) els.sandboxLibrarySearch.addEventListener('input', renderSandboxLibrary);
  if (els.sandboxSceneName) {
    els.sandboxSceneName.addEventListener('input', () => {
      state.sandbox.sceneName = els.sandboxSceneName.value.slice(0, 32);
      if (els.sandboxSaveStatus) els.sandboxSaveStatus.textContent = '名称已修改';
      saveSandboxDraft();
    });
  }
  if (els.sandboxLibraryGrid) {
    els.sandboxLibraryGrid.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.sandbox-component-card');
      if (!card || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-fe-sandbox-component', card.dataset.componentId || '');
      event.dataTransfer.setData('text/plain', card.dataset.componentId || '');
    });
    els.sandboxLibraryGrid.addEventListener('click', (event) => {
      const addButton = event.target.closest('[data-add-sandbox-component]');
      if (addButton) {
        addSandboxComponentToScene(sandboxComponentById(addButton.dataset.addSandboxComponent));
        return;
      }
      const card = event.target.closest('.sandbox-component-card');
      if (!card) return;
      const component = sandboxComponentById(card.dataset.componentId);
      if (!component) return;
      state.sandbox.selectedLibraryId = component.id;
      writeSandboxComponentForm(component);
      els.sandboxLibraryGrid.querySelectorAll('.sandbox-component-card').forEach((item) => {
        item.classList.toggle('is-selected', item.dataset.componentId === component.id);
      });
    });
    els.sandboxLibraryGrid.addEventListener('dblclick', (event) => {
      if (event.target.closest('[data-add-sandbox-component]')) return;
      const card = event.target.closest('.sandbox-component-card');
      if (!card) return;
      addSandboxComponentToScene(sandboxComponentById(card.dataset.componentId));
    });
  }
  if (els.sandboxStage) {
    els.sandboxStage.addEventListener('dragenter', (event) => {
      event.preventDefault();
      els.sandboxStage.classList.add('is-drop-target');
    });
    els.sandboxStage.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      els.sandboxStage.classList.add('is-drop-target');
    });
    els.sandboxStage.addEventListener('dragleave', (event) => {
      if (!els.sandboxStage.contains(event.relatedTarget)) els.sandboxStage.classList.remove('is-drop-target');
    });
    els.sandboxStage.addEventListener('drop', (event) => {
      event.preventDefault();
      els.sandboxStage.classList.remove('is-drop-target');
      const id = event.dataTransfer?.getData('application/x-fe-sandbox-component') || event.dataTransfer?.getData('text/plain');
      const point = sandboxGroundPoint(event.clientX, event.clientY);
      addSandboxComponentToScene(sandboxComponentById(id), point);
    });
  }
  if (els.sandboxCanvas) {
    els.sandboxCanvas.addEventListener('pointerdown', beginSandboxCanvasPointer);
    els.sandboxCanvas.addEventListener('pointermove', moveSandboxCanvasPointer);
    els.sandboxCanvas.addEventListener('pointerup', endSandboxCanvasPointer);
    els.sandboxCanvas.addEventListener('pointercancel', endSandboxCanvasPointer);
    els.sandboxCanvas.addEventListener('wheel', (event) => {
      const selected = sandboxSceneItemById(state.sandbox.selectedId);
      if (event.altKey && selected) {
        selected.position.y = clamp(selected.position.y + (event.deltaY < 0 ? 0.1 : -0.1), 0, 8);
        writeSandboxTransformForm(selected);
        renderSandboxSceneList();
        saveSandboxDraft();
        setSandboxStageStatus(`堆叠高度 Y：${selected.position.y.toFixed(1)}`);
        event.preventDefault();
        return;
      }
      state.sandbox.distance = clamp(state.sandbox.distance + event.deltaY * 0.012, 5.4, 18);
      updateSandboxCamera();
      event.preventDefault();
    }, { passive: false });
  }
  if (els.sandboxSceneList) {
    els.sandboxSceneList.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-scene-item]');
      if (edit) {
        selectSandboxItem(edit.dataset.editSceneItem, { edit: true });
        return;
      }
      const select = event.target.closest('[data-scene-item-id]');
      if (select) selectSandboxItem(select.dataset.sceneItemId);
    });
  }
  if (els.sandboxPresetList) {
    els.sandboxPresetList.addEventListener('click', (event) => {
      const saveComponents = event.target.closest('[data-save-preset-components]');
      if (saveComponents) {
        savePresetComponentsToLibrary(saveComponents.dataset.savePresetComponents);
        return;
      }
      const publish = event.target.closest('[data-publish-sandbox-preset]');
      if (publish) {
        publishSandboxPreset(publish.dataset.publishSandboxPreset);
        return;
      }
      const remove = event.target.closest('[data-delete-sandbox-preset]');
      if (remove) {
        deleteSandboxPreset(remove.dataset.deleteSandboxPreset);
        return;
      }
      const load = event.target.closest('[data-sandbox-preset-id]');
      if (load) loadSandboxPreset(load.dataset.sandboxPresetId);
    });
  }
  if (els.sandboxCategory) {
    els.sandboxCategory.addEventListener('change', () => {
      syncSandboxPrimitiveOptions(els.sandboxCategory.value);
      updateSelectedSandboxItemFromForm();
    });
  }
  if (els.sandboxReferenceImage) {
    els.sandboxReferenceImage.addEventListener('change', () => {
      const file = els.sandboxReferenceImage.files?.[0];
      state.sandbox.referenceImage = '';
      state.sandbox.referenceImagePending = false;
      if (!file) {
        if (els.sandboxReferenceImageName) els.sandboxReferenceImageName.textContent = '未选择图片 · 最大 12 MB';
        return;
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
        els.sandboxReferenceImage.value = '';
        if (els.sandboxReferenceImageName) els.sandboxReferenceImageName.textContent = '图片无效：仅支持 PNG、JPEG、WebP，最大 12 MB';
        toast('参考图格式或大小不符合要求');
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        state.sandbox.referenceImage = typeof reader.result === 'string' ? reader.result : '';
        state.sandbox.referenceImagePending = !!state.sandbox.referenceImage;
        if (els.sandboxReferenceImageName) els.sandboxReferenceImageName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
      });
      reader.addEventListener('error', () => {
        if (els.sandboxReferenceImageName) els.sandboxReferenceImageName.textContent = '图片读取失败，请重新选择';
      });
      reader.readAsDataURL(file);
    });
  }
  const formControls = [
    els.sandboxComponentName,
    els.sandboxPrimitive,
    els.sandboxComponentColor,
    els.sandboxWidth,
    els.sandboxHeight,
    els.sandboxDepth,
    els.sandboxPositionX,
    els.sandboxPositionY,
    els.sandboxPositionZ,
    els.sandboxRotationToggle,
    els.sandboxInteraction,
    els.sandboxMotion,
    els.sandboxBeatMode,
    els.sandboxMusicBand,
    els.sandboxAmplitude,
    els.sandboxSpeed,
    els.sandboxParticleCount,
    els.sandboxOpacity
  ].filter(Boolean);
  formControls.forEach((control) => {
    control.addEventListener('input', updateSelectedSandboxItemFromForm);
    control.addEventListener('change', updateSelectedSandboxItemFromForm);
  });
  if (els.sandboxResetViewButton) els.sandboxResetViewButton.addEventListener('click', resetSandboxView);
  if (els.sandboxSavePresetButton) els.sandboxSavePresetButton.addEventListener('click', saveSandboxPreset);
  if (els.sandboxDuplicateButton) els.sandboxDuplicateButton.addEventListener('click', duplicateSelectedSandboxItem);
  if (els.sandboxDeleteButton) els.sandboxDeleteButton.addEventListener('click', deleteSelectedSandboxItem);
  if (els.sandboxClearButton) els.sandboxClearButton.addEventListener('click', clearSandboxScene);
  if (els.sandboxSaveComponentButton) els.sandboxSaveComponentButton.addEventListener('click', saveSandboxComponent);
  if (els.sandboxPublishComponentButton) els.sandboxPublishComponentButton.addEventListener('click', publishSandboxComponent);
  if (els.sandboxGenerateButton) els.sandboxGenerateButton.addEventListener('click', sendSandboxCodexMessage);
  if (els.sandboxCodexPrompt) {
    els.sandboxCodexPrompt.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      sendSandboxCodexMessage();
    });
  }
  if (els.sandboxCommitCodexButton) els.sandboxCommitCodexButton.addEventListener('click', commitCodexDraft);
  if (els.sandboxImproveCodexButton) els.sandboxImproveCodexButton.addEventListener('click', () => reworkCodexDraft('improve'));
  if (els.sandboxRedoCodexButton) els.sandboxRedoCodexButton.addEventListener('click', () => reworkCodexDraft('redo'));
  document.addEventListener('keydown', (event) => {
    if (!state.sandbox.open || isEditableShortcutTarget(event.target)) return;
    if (event.key === 'Escape') setSandboxOpen(false);
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.sandbox.selectedId) deleteSelectedSandboxItem();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveSandboxDraft({ immediate: true });
      if (state.orb.animationFrame) window.cancelAnimationFrame(state.orb.animationFrame);
      state.orb.animationFrame = 0;
      stopSandboxRendering();
      return;
    }
    requestOrbFrame();
    if (sandboxRendererActive()) {
      state.sandbox.lastFrameAt = 0;
      requestSandboxRender();
    }
  });
  window.addEventListener('beforeunload', persistSandboxDraft);
}

function updateDiySidebarFromPointer(event) {
  if (!state.diyCardOpen || !event || state.diyCardDrag || !els.diySidebar) return;
  const bounds = els.diySidebar.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x = clamp((event.clientX - (bounds.left + bounds.width / 2)) / Math.max(bounds.width, 1), -1, 1);
  const y = clamp((event.clientY - (bounds.top + bounds.height / 2)) / Math.max(bounds.height, 1), -1, 1);
  els.diySidebar.style.setProperty('--diy-card-hover-yaw', `${x * 6}deg`);
  els.diySidebar.style.setProperty('--diy-card-hover-pitch', `${y * -4}deg`);
}

function updateDiyCardRotation() {
  if (!els.diySidebar) return;
  els.diySidebar.style.setProperty('--diy-card-yaw', `${state.diyCardYaw}deg`);
  els.diySidebar.style.setProperty('--diy-card-pitch', `${state.diyCardPitch}deg`);
}

function beginDiyCardRotation(event) {
  if (!state.diyCardOpen || event.button !== 0 || !els.diySidebar) return;
  if (!(event.target instanceof Element) || !event.target.closest('.diy-sidebar-head') || event.target.closest('button')) return;
  state.diyCardDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    yaw: state.diyCardYaw,
    pitch: state.diyCardPitch
  };
  els.diySidebar.style.setProperty('--diy-card-hover-yaw', '0deg');
  els.diySidebar.style.setProperty('--diy-card-hover-pitch', '0deg');
  els.diySidebar.classList.add('is-rotating');
  els.diySidebar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveDiyCardRotation(event) {
  const drag = state.diyCardDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.diyCardYaw = drag.yaw + (event.clientX - drag.startX) * 0.72;
  state.diyCardPitch = clamp(drag.pitch - (event.clientY - drag.startY) * 0.28, -18, 18);
  updateDiyCardRotation();
}

function endDiyCardRotation(event) {
  const drag = state.diyCardDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.diyCardDrag = null;
  els.diySidebar?.classList.remove('is-rotating');
  els.diySidebar?.releasePointerCapture?.(event.pointerId);
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
  scheduleQishuiPlaybackLyricLayout();
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
  updateQualityButton(song);
  renderQishuiPlaybackCard(song);
  syncElasticRangeVisuals();
}

function updatePlayState() {
  const playing = !els.audio.paused && !!els.audio.src;
  els.playButton.classList.toggle('is-playing', playing);
  els.playButton.title = playing ? '暂停' : '播放';
  els.playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
  els.dockStatus.textContent = playing ? 'PLAYING' : 'READY';
  els.dockStatus.classList.toggle('playing', playing);
  if (els.playbackLyricScene) els.playbackLyricScene.classList.toggle('is-playing', playing);
  updateQishuiPlaybackPlayState(playing);
  if (isPlaybackClockRunning()) playCoverParticleEngine();
  else pauseCoverParticleEngine();
}

async function refreshPlayerState() {
  if (document.hidden) return;
  if (state.localQueueActive && isLocalSong(state.currentSong)) {
    const position = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
    const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : Number(state.currentSong.duration) || 0;
    state.currentSong = { ...state.currentSong, position, duration, playing: !els.audio.paused && !els.audio.ended };
    updatePlayerClock(position, duration, !els.audio.paused && !els.audio.ended);
    renderCurrent(state.currentSong);
    return;
  }
  const seekRevision = state.qishuiPlaybackCard.seekRequestId;
  const data = await apiJson('/api/player/state');
  const sameSong = !data.song?.id
    || !state.currentSong?.id
    || String(data.song.id) === String(state.currentSong.id);
  const preserveSeek = sameSong && (
    state.qishuiPlaybackCard.progressDragging
    || state.qishuiPlaybackCard.seekPending
    || seekRevision !== state.qishuiPlaybackCard.seekRequestId
  );
  state.localQueueActive = false;
  state.queue = Array.isArray(data.queue) ? data.queue : [];
  state.queueIndex = Number.isInteger(data.queueIndex) ? data.queueIndex : -1;
  const playerPosition = Number(data.position);
  const playerDuration = Number(data.duration);
  const playerPlaying = data.playing === true && data.paused !== true;
  const pendingSeekTarget = state.qishuiPlaybackCard.pendingSeekTarget;
  const pendingTarget = pendingSeekTarget == null ? Number.NaN : Number(pendingSeekTarget);
  const preservedPosition = Number.isFinite(pendingTarget)
    ? pendingTarget
    : estimatedPlayerClockTime(Number(state.currentSong?.position) || 0);
  const effectivePosition = preserveSeek ? preservedPosition : playerPosition;
  if (!preserveSeek && Number.isFinite(playerPosition)) {
    updatePlayerClock(playerPosition, Number.isFinite(playerDuration) ? playerDuration : 0, playerPlaying);
  }
  if (playerPlaying) requestOrbFrame();
  if (data.song && data.song.id) {
    state.currentSong = {
      ...data.song,
      playing: playerPlaying,
      ...(Number.isFinite(effectivePosition) ? { position: Math.max(0, effectivePosition) } : {}),
      ...(Number.isFinite(playerDuration) && playerDuration > 0 ? { duration: Math.max(0, playerDuration) } : {})
    };
  } else if (state.currentSong && Number.isFinite(effectivePosition)) {
    state.currentSong = {
      ...state.currentSong,
      playing: playerPlaying,
      position: Math.max(0, effectivePosition),
      ...(Number.isFinite(playerDuration) && playerDuration > 0 ? { duration: Math.max(0, playerDuration) } : {})
    };
  }
  state.playerUrl = data.url || state.playerUrl;
  if (data.quality) {
    const provider = playbackQualityProvider(data.song || state.currentSong);
    state.playbackQuality = preferredPlaybackQuality(provider, safeText(data.quality, state.playbackQuality));
  }
  els.volumeRange.value = Math.round((Number(data.volume) || 0.8) * 100);
  syncElasticRangeVisual(els.volumeRange);
  els.volumeLabel.textContent = `${els.volumeRange.value}%`;
  if (Number.isFinite(effectivePosition)) {
    if (els.audio && els.audio.src) {
      if (!preserveSeek) setAudioPlaybackPosition(effectivePosition);
      syncPlaybackLyricToCurrentTime();
    } else {
      renderManualProgress(effectivePosition, Number.isFinite(playerDuration) ? playerDuration : 0);
    }
  }
  renderCurrent();
}

function applyAudioBridgePayload(audio = {}) {
  const energy = Number(audio.energy) || 0;
  const lowFrequency = clamp(Number(audio.lowFrequencyAmplitude) || Number(audio.bass) || 0, 0, 1);
  state.visualBridge.energy = energy;
  state.visualBridge.bass = Number(audio.bass) || lowFrequency;
  state.visualBridge.lowFrequencyAmplitude = lowFrequency;
  writeLowFrequencyBands(state.visualBridge.lowFrequencyBands, audio.lowFrequencyBands, lowFrequency);
  state.visualBridge.beat = Number(audio.beat) || 0;
  state.visualBridge.mid = Number(audio.mid) || clamp(energy * 0.48, 0, 1);
  state.visualBridge.treble = Number(audio.treble) || clamp(energy * 0.28, 0, 1);
  state.visualBridge.source = safeText(audio.source, '');
  state.visualBridge.sampleRate = Number(audio.sampleRate) || 0;
  applyBridgeVisual();
}

async function refreshNativeAudioSample() {
  if (document.hidden) return;
  if (!state.clientRuntime.nativeAudioActive || !state.clientRuntime.settings.xAudio2) return;
  try {
    const data = await apiJson('/api/audio/sample');
    applyAudioBridgePayload(data || {});
  } catch (error) {
    // Native sampling is optional; Web Audio or the bridge fallback can keep visuals alive.
  }
}

async function refreshVisualBridge() {
  if (document.hidden) return;
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
    const shouldSeek = Math.abs(current - target) >= tolerance;
    if (shouldSeek) els.audio.currentTime = target;
    syncPlaybackLyricAtTime(shouldSeek ? target : currentPlaybackLyricTime(target));
  } catch (error) {
  }
}

function renderManualProgress(position = 0, duration = 0) {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const safePosition = Math.max(0, Math.min(Number(position) || 0, safeDuration || Number(position) || 0));
  els.progressRange.value = safeDuration > 0 ? Math.round((safePosition / safeDuration) * 1000) : 0;
  syncElasticRangeVisual(els.progressRange);
  const currentTimeLabel = formatTime(safePosition);
  const totalTimeLabel = formatTime(safeDuration || (state.currentSong && state.currentSong.duration) || 0);
  if (els.currentTime.textContent !== currentTimeLabel) els.currentTime.textContent = currentTimeLabel;
  if (els.totalTime.textContent !== totalTimeLabel) els.totalTime.textContent = totalTimeLabel;
  updateQishuiPlaybackProgress(safePosition, safeDuration);
  syncPlaybackLyricAtTime(safePosition);
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

async function loadLocalSong(song, options = {}) {
  if (!isLocalSong(song)) throw new Error('本地歌曲文件已失效，请重新导入');
  const targetPosition = Number(options.position ?? song.position) || 0;
  const requestedDuration = Number(song.duration) || 0;
  state.localQueueActive = true;
  state.playerUrl = song.localUrl;
  state.currentSong = { ...song, duration: requestedDuration, position: targetPosition };
  if (els.audio.src !== song.localUrl) els.audio.src = song.localUrl;
  els.audio.volume = Number(els.volumeRange.value) / 100;
  if (targetPosition > 0) {
    const applyPosition = () => setAudioPlaybackPosition(targetPosition, 0.25);
    if (els.audio.readyState >= 1) applyPosition();
    else els.audio.addEventListener('loadedmetadata', applyPosition, { once: true });
  }
  resetSpectrumForSong(state.currentSong);
  renderCurrent(state.currentSong);
  if (options.autoplay === false) els.audio.pause();
  else await els.audio.play();
  ensureAudioAnalysis();
  updateProgress();
  updatePlayState();
  return true;
}

async function loadSong(song, options = {}) {
  try {
    if (isLocalSong(song)) return await loadLocalSong(song, options);
    state.localQueueActive = false;
    const provider = playbackQualityProvider(song);
    const quality = normalizePlaybackQuality(
      provider,
      options.quality || preferredPlaybackQuality(provider, state.playbackQuality)
    );
    state.playbackQuality = quality;
    const data = await apiJson(`/api/player/load?${songParams(song, { quality })}`);
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
    state.playbackQuality = safeText(data.quality, quality);
    state.playerUrl = data.url;
    els.audio.src = data.url;
    els.audio.volume = Number(els.volumeRange.value) / 100;
    const targetPosition = Number(options.position ?? song.position) || 0;
    if (targetPosition > 0) {
      await apiJson(`/api/player/seek?${query({ position: Math.round(targetPosition) })}`).catch(() => {});
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
  state.queueIndex = index;
  const loaded = await loadSong(song);
  if (loaded && !isLocalSong(song)) await refreshPlayerState();
}

async function transport(path) {
  if (state.localQueueActive) {
    if (!state.queue.length) {
      toast('本地歌单暂无歌曲');
      return;
    }
    const offset = path.endsWith('/previous') ? -1 : 1;
    const current = Number.isInteger(state.queueIndex) ? state.queueIndex : -1;
    const index = (current + offset + state.queue.length) % state.queue.length;
    await playQueueIndex(index);
    updateShelfCurrentSong();
    return;
  }
  try {
    const data = await apiJson(path);
    if (!data.playable || !data.url) {
      toast(data.error || '队列里没有可播放歌曲');
      await refreshPlayerState();
      return;
    }
    state.currentSong = data.song || state.currentSong;
    state.playerUrl = data.url;
    if (data.quality) state.playbackQuality = safeText(data.quality, state.playbackQuality);
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
  if (state.localQueueActive && isLocalSong(state.currentSong)) {
    if (els.audio.paused) {
      try {
        await els.audio.play();
        ensureAudioAnalysis();
      } catch (error) {
        toast(error.message || '本地歌曲无法播放');
      }
    } else {
      els.audio.pause();
    }
    updatePlayState();
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
  syncElasticRangeVisual(els.progressRange);
  els.currentTime.textContent = formatTime(current);
  els.totalTime.textContent = formatTime(duration || (state.currentSong && state.currentSong.duration) || 0);
  syncPlaybackLyricAtTime(current);
  updateQishuiPlaybackProgress(current, duration);
}

function clearShelfPressTimer() {
  if (!state.shelfPressTimer) return;
  window.clearTimeout(state.shelfPressTimer);
  state.shelfPressTimer = 0;
}

function shelfPointerTargetIsInteractive(event) {
  return !!event.target.closest('.playlist-shelf-hide, .playlist-local-add, .shelf-song-button');
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
    setSongFocus(state.songFocusIndex + direction * steps, { focus: false });
  });
}

function playbackBack() {
  if (state.playlistSongPageOpen) {
    closePlaylistShelf();
    return;
  }
  if (state.playbackPlaylistPickerOpen) {
    setPlaybackPlaylistPickerOpen(false);
    return;
  }
  if (state.playbackPage) enterWallpaperHome();
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
  if (target.closest('.runtime-settings-panel, .recording-dialog, .netease-login-dialog, .community-card, .community-message-dialog, .community-message-bubbles, .community-broadcast-toast, .listen-mini, .playlist-song-page, .orb-playlists, .player-dock, .diy-sidebar, .search-suggestions, .favorite-library')) {
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

function isEditableShortcutTarget(target) {
  return !!(target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'));
}

function dismissTopUiLayer() {
  if (state.playlistFavorite.open) setPlaylistFavoriteOpen(false);
  else if (state.qualityMenuOpen) setDockQualityMenuOpen(false);
  else if (els.searchSuggestions && !els.searchSuggestions.hidden) setSearchSuggestionsOpen(false);
  else if (state.favoriteLibrary.open) setFavoriteLibraryOpen(false);
  else if (els.recordingDialog && !els.recordingDialog.hidden) closeRecordingDialog();
  else if (els.communityProfileDialog && !els.communityProfileDialog.hidden) setCommunityProfileOpen(false);
  else if (els.communityMessageDialog && !els.communityMessageDialog.hidden) setCommunityMessageOpen(false);
  else if (!els.loginDialog.hidden) closeLoginDialog();
  else if (state.runtimeSettingsOpen) setRuntimeSettingsOpen(false);
  else if (state.sandbox.open) setSandboxOpen(false);
  else if (state.diyOpen) setDiyOpen(false);
  else if (state.playbackPage && state.playbackChrome.communityVisible) setPlaybackChromeVisibility({ communityVisible: false });
  else if (state.playbackPage) playbackBack();
  else if (!els.playlistShelf.hidden) hidePlaylistShelf();
  else return false;
  return true;
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
  if (els.communityBroadcastButton) {
    els.communityBroadcastButton.addEventListener('click', (event) => {
      if (state.playbackPage) showCommunityPageFromPlayback();
      openCommunityBroadcast();
      event.preventDefault();
      event.stopPropagation();
    });
  }
  if (els.communityMarketButton) {
    els.communityMarketButton.addEventListener('click', (event) => {
      if (state.playbackPage) showCommunityPageFromPlayback();
      setCommunityCardCollapsed(false);
      setCommunityProfileOpen(true, 'market');
      event.preventDefault();
      event.stopPropagation();
    });
  }
  if (els.communityBroadcastToast) {
    els.communityBroadcastToast.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.communityBroadcastToast.addEventListener('click', (event) => {
      if (!event.target.closest('[data-community-broadcast-action="close"]')) return;
      event.preventDefault();
      hideCommunityBroadcastToast();
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
  if (els.communityProfileMarketTab) els.communityProfileMarketTab.addEventListener('click', () => setCommunityProfilePage('market'));
  if (els.communityProfileClose) els.communityProfileClose.addEventListener('click', () => setCommunityProfileOpen(false));
  if (els.communityProfileSave) els.communityProfileSave.addEventListener('click', saveCommunityProfileBio);
  if (els.communityMarketRefresh) els.communityMarketRefresh.addEventListener('click', () => refreshPresetMarket().catch(() => {}));
  if (els.communityMarketSearch) {
    els.communityMarketSearch.addEventListener('input', () => {
      state.community.marketQuery = els.communityMarketSearch.value.trim().slice(0, 64);
      schedulePresetMarketRefresh();
    });
  }
  if (els.communityMarketList) {
    els.communityMarketList.addEventListener('click', (event) => {
      const preview = event.target.closest('[data-preview-market-item]');
      if (preview) {
        previewMarketItem(preview.dataset.previewMarketItem);
        return;
      }
      const download = event.target.closest('[data-download-market-item]');
      if (download) downloadMarketItem(download.dataset.downloadMarketItem);
    });
  }
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
  els.homeButton.addEventListener('click', enterWallpaperHome);
  els.diyButton.addEventListener('click', () => setDiyOpen(!state.diyOpen));
  els.diyCloseButton.addEventListener('click', () => setDiyCardOpen(false));
  if (els.diySandboxPresetToggle) {
    els.diySandboxPresetToggle.addEventListener('click', () => {
      setDiySandboxPresetGroupExpanded(!state.sandbox.presetGroupExpanded);
    });
  }
  if (els.stormLightingControls) {
    els.stormLightingControls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-storm-lighting-mode], [data-storm-weather-mode]');
      if (!button || !els.stormLightingControls.contains(button)) return;
      if (button.dataset.stormWeatherMode === 'thunderstorm') {
        setStormThunderstormMode(state.sandbox.stormWeatherMode === 'on' ? 'auto' : 'on');
      } else {
        setStormLightingMode(button.dataset.stormLightingMode);
      }
    });
  }
  if (els.stormPresetLightingQuickControls) {
    els.stormPresetLightingQuickControls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-storm-lighting-mode], [data-storm-weather-mode]');
      if (!button || !els.stormPresetLightingQuickControls.contains(button)) return;
      if (!isStormOceanPreset(activeDiyScenePreset())) return;
      if (button.dataset.stormWeatherMode === 'thunderstorm') {
        setStormThunderstormMode(state.sandbox.stormWeatherMode === 'on' ? 'auto' : 'on');
      } else {
        setStormLightingMode(button.dataset.stormLightingMode);
      }
      event.preventDefault();
      event.stopPropagation();
    });
  }
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
    els.diySidebar.addEventListener('pointerdown', beginDiyCardRotation);
    els.diySidebar.addEventListener('pointermove', moveDiyCardRotation);
    els.diySidebar.addEventListener('pointerup', endDiyCardRotation);
    els.diySidebar.addEventListener('pointercancel', endDiyCardRotation);
    els.diySidebar.addEventListener('lostpointercapture', endDiyCardRotation);
    els.diySidebar.addEventListener('click', (event) => {
      const sandboxPreset = event.target && event.target.closest ? event.target.closest('[data-diy-sandbox-preset]') : null;
      if (sandboxPreset && els.diySidebar.contains(sandboxPreset) && !sandboxPreset.disabled) {
        enterDiyScenePresetPlayback(sandboxPreset.dataset.diySandboxPreset);
        return;
      }
      const sandboxPresetCard = event.target && event.target.closest ? event.target.closest('[data-diy-preset-card]') : null;
      if (sandboxPresetCard && els.diySidebar.contains(sandboxPresetCard)) {
        selectDiyScenePreset(sandboxPresetCard.dataset.diyPresetCard);
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest('[data-text-preset]') : null;
      if (!button || !els.diySidebar.contains(button) || button.disabled) return;
      setTextPreset(button.dataset.textPreset);
    });
  }
  if (els.textPaletteAutoButton) {
    els.textPaletteAutoButton.addEventListener('click', () => setTextPalettePreference('auto'));
  }
  if (els.textFontSelect) {
    els.textFontSelect.addEventListener('change', () => setTextFontPreference(els.textFontSelect.value));
  }
  if (els.textPaletteResetButton) {
    els.textPaletteResetButton.addEventListener('click', () => setTextPalettePreference('auto'));
  }
  if (els.textPaletteControl) {
    els.textPaletteControl.querySelectorAll('[data-text-palette-color]').forEach((button) => {
      button.addEventListener('click', () => {
        setTextPalettePreference('manual', button.dataset.textPaletteColor);
      });
    });
  }
  if (els.textPaletteCustomInput) {
    els.textPaletteCustomInput.addEventListener('input', () => {
      setTextPalettePreference('manual', els.textPaletteCustomInput.value);
    });
  }
  if (els.playbackLyricPaletteAutoButton) {
    els.playbackLyricPaletteAutoButton.addEventListener(
      'click',
      () => setPlaybackLyricPalettePreference('auto')
    );
  }
  if (els.playbackLyricPaletteResetButton) {
    els.playbackLyricPaletteResetButton.addEventListener(
      'click',
      () => setPlaybackLyricPalettePreference('auto')
    );
  }
  if (els.playbackLyricPaletteControl) {
    els.playbackLyricPaletteControl
      .querySelectorAll('[data-playback-lyric-palette-color]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          setPlaybackLyricPalettePreference(
            'manual',
            button.dataset.playbackLyricPaletteColor
          );
        });
      });
  }
  if (els.playbackLyricPaletteCustomInput) {
    els.playbackLyricPaletteCustomInput.addEventListener('input', () => {
      setPlaybackLyricPalettePreference('manual', els.playbackLyricPaletteCustomInput.value);
    });
  }
  window.addEventListener('pointerup', endDiyCardRotation);
  window.addEventListener('pointercancel', endDiyCardRotation);
  updateDiyCardRotation();
  if (els.diyBookLyricPreset) els.diyBookLyricPreset.addEventListener('click', () => enterPresetPlaybackPage('book'));
  if (els.bookLyricList) {
    els.bookLyricList.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.bookLyricList.addEventListener('click', (event) => {
      if (state.bookLyricTransform.suppressClick) {
        state.bookLyricTransform.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const line = event.target && event.target.closest ? event.target.closest('.book-lyric-line') : null;
      if (!line || !els.bookLyricList.contains(line)) return;
      seekToBookLyric(line.dataset.bookLyricTime);
    });
  }
  if (els.qishuiPlaybackLyricPage) {
    els.qishuiPlaybackLyricPage.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.qishuiPlaybackLyricPage.addEventListener('click', (event) => {
      const line = event.target && event.target.closest
        ? event.target.closest('.qishui-playback-lyric-line')
        : null;
      if (!line || !els.qishuiPlaybackLyricPage.contains(line)) return;
      seekToBookLyric(line.dataset.bookLyricTime);
    });
  }
  if (els.bookLyricPage) {
    els.bookLyricPage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !beginBookLyricGesture(event)) return;
      if (els.stage && typeof els.stage.setPointerCapture === 'function') {
        try { els.stage.setPointerCapture(event.pointerId); } catch (error) {}
      }
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
  if (els.diySceneNonePreset) els.diySceneNonePreset.addEventListener('click', () => enterPresetPlaybackPage('lyric'));
  if (els.diyCubePreset) els.diyCubePreset.addEventListener('click', () => enterPresetPlaybackPage('cube'));
  if (els.diyFreeCubePreset) els.diyFreeCubePreset.addEventListener('click', () => enterPresetPlaybackPage('free-cubes'));
  if (els.diyVoidPrismPreset) els.diyVoidPrismPreset.addEventListener('click', () => enterPresetPlaybackPage('void-prism'));
  if (els.diyTopographyPreset) els.diyTopographyPreset.addEventListener('click', () => enterPresetPlaybackPage('topography'));
  if (els.diyChladniPreset) els.diyChladniPreset.addEventListener('click', () => enterPresetPlaybackPage('chladni'));
  if (els.diyRainGlassPreset) els.diyRainGlassPreset.addEventListener('click', () => enterPresetPlaybackPage('rain-glass'));
  if (els.diyCoverParticlesPreset) els.diyCoverParticlesPreset.addEventListener('click', () => enterPresetPlaybackPage('cover-particles'));
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
    renderDiySelectedPresetConfig();
  });
  els.lyricSpeedRange.addEventListener('input', () => {
    state.lyricSpeed = clamp(Number(els.lyricSpeedRange.value) / 100, 0.6, 1.8);
    updateLyricDiyVars();
    renderDiySelectedPresetConfig();
  });
  if (els.cubeIntensityRange) {
    els.cubeIntensityRange.addEventListener('input', () => {
      state.cubeIntensity = clamp(Number(els.cubeIntensityRange.value) / 100, 0.4, 1.8);
      updateLyricDiyVars();
      renderDiySelectedPresetConfig();
    });
  }
  if (els.sonicCoreColorInput) {
    els.sonicCoreColorInput.addEventListener('input', () => {
      state.sonicTopography.settings.coreColor = els.sonicCoreColorInput.value;
      applySonicTopographySettings();
    });
  }
  if (els.sonicOuterColorInput) {
    els.sonicOuterColorInput.addEventListener('input', () => {
      state.sonicTopography.settings.outerColor = els.sonicOuterColorInput.value;
      applySonicTopographySettings();
    });
  }
  if (els.sonicFollowCoverButton) {
    els.sonicFollowCoverButton.addEventListener('click', () => {
      state.sonicTopography.settings.coreColor = null;
      state.sonicTopography.settings.outerColor = null;
      applySonicTopographySettings();
    });
  }
  if (els.sonicBrightnessRange) {
    els.sonicBrightnessRange.addEventListener('input', () => {
      state.sonicTopography.settings.brightness = Number(els.sonicBrightnessRange.value) / 100;
      applySonicTopographySettings();
    });
  }
  if (els.sonicExposureRange) {
    els.sonicExposureRange.addEventListener('input', () => {
      state.sonicTopography.settings.exposure = Number(els.sonicExposureRange.value) / 100;
      applySonicTopographySettings();
    });
  }
  if (els.sonicColumnHeightRange) {
    els.sonicColumnHeightRange.addEventListener('input', () => {
      state.sonicTopography.settings.columnHeight = Number(els.sonicColumnHeightRange.value) / 100;
      applySonicTopographySettings();
    });
  }
  if (els.sonicFovRange) {
    els.sonicFovRange.addEventListener('input', () => {
      state.sonicTopography.settings.fov = Number(els.sonicFovRange.value);
      applySonicTopographySettings();
    });
  }
  if (els.sonicSmoothingRange) {
    els.sonicSmoothingRange.addEventListener('input', () => {
      state.sonicTopography.settings.smoothing = Number(els.sonicSmoothingRange.value) / 100;
      applySonicTopographySettings();
    });
  }
  if (els.freeCubeHeartButton) {
    els.freeCubeHeartButton.addEventListener('click', toggleFreeCubeHeart);
  }
  if (els.freeCubeBackgroundButton) {
    els.freeCubeBackgroundButton.addEventListener('click', () => {
      setFreeCubeBackground(!state.freeCube.backgroundEnabled);
    });
  }
  if (els.chladniPlaneButton) {
    els.chladniPlaneButton.addEventListener('click', () => setChladniMode('plane'));
  }
  if (els.chladniCubeButton) {
    els.chladniCubeButton.addEventListener('click', () => setChladniMode('cube'));
  }
  if (els.diyCoverParticleBackgroundToggle) {
    els.diyCoverParticleBackgroundToggle.addEventListener('change', () => {
      state.coverParticle.backgroundEnabled = !!els.diyCoverParticleBackgroundToggle.checked;
      updateCoverParticleBackgroundMode();
      renderDiySelectedPresetConfig();
    });
  }
  if (els.diyCoverParticleMotionRange) {
    els.diyCoverParticleMotionRange.addEventListener('input', () => {
      state.coverParticle.motionAmplitude = clamp(Number(els.diyCoverParticleMotionRange.value) / 100, 0, 2);
      updateCoverParticleBackgroundMode();
      renderDiySelectedPresetConfig();
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
  if (els.renderClarityAutoToggle) {
    els.renderClarityAutoToggle.addEventListener('change', () => {
      setRenderClarityAuto(els.renderClarityAutoToggle.checked);
    });
  }
  if (els.renderClarityRange) {
    els.renderClarityRange.addEventListener('input', () => {
      setRenderClarityManualPercent(els.renderClarityRange.value);
    });
    els.renderClarityRange.addEventListener('change', () => {
      if (!state.renderClarity.auto) toast(`清晰度已设为 ${state.renderClarity.manualPercent}%`);
    });
  }
  if (els.presetFsrToggle) {
    els.presetFsrToggle.addEventListener('change', () => setPresetFsrEnabled(els.presetFsrToggle.checked));
  }
  if (els.presetFsrVersion) {
    els.presetFsrVersion.addEventListener('change', () => setPresetFsrVersion(els.presetFsrVersion.value));
  }
  if (els.presetFsrMode) {
    els.presetFsrMode.addEventListener('change', () => setPresetFsrMode(els.presetFsrMode.value));
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
  if (els.qishuiPhoneInput) {
    els.qishuiPhoneInput.addEventListener('input', () => {
      els.qishuiPhoneInput.value = qishuiPhoneValue();
    });
  }
  if (els.qishuiCodeInput) {
    els.qishuiCodeInput.addEventListener('input', () => {
      els.qishuiCodeInput.value = qishuiCodeValue();
    });
  }
  if (els.qishuiSendCodeButton) els.qishuiSendCodeButton.addEventListener('click', sendQishuiPhoneCode);
  if (els.qishuiGuestButton) els.qishuiGuestButton.addEventListener('click', enterQishuiGuestMode);
  if (els.qishuiPhoneLogin) els.qishuiPhoneLogin.addEventListener('submit', verifyQishuiPhoneLogin);
  if (els.musicApiImportButton && els.musicApiImportInput) {
    els.musicApiImportButton.addEventListener('click', () => els.musicApiImportInput.click());
    els.musicApiImportInput.addEventListener('change', () => importMusicApiFile(els.musicApiImportInput.files?.[0]));
  }
  if (els.androidQrSaveButton) els.androidQrSaveButton.addEventListener('click', saveAndroidLoginQr);
  if (els.androidMusicAppButton) els.androidMusicAppButton.addEventListener('click', openAndroidMusicApp);
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
    if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
    if (state.playbackPage && (event.key === 'b' || event.key === 'B' || event.code === 'KeyB')) {
      event.preventDefault();
      setPlaybackControlsHidden(!state.playbackChrome.controlsHidden);
      return;
    }
    if ((event.key === ',' || event.key === '，' || event.code === 'Comma') && state.playbackPage) {
      event.preventDefault();
      toggleCommunityPageFromPlayback();
      return;
    }
    if (event.key !== 'Escape') return;
    dismissTopUiLayer();
  });
  window.addEventListener('fe-monster-android-back', (event) => {
    if (dismissTopUiLayer()) event.preventDefault();
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
  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.dock-quality-button, .dock-quality-menu, .qishui-playback-quality, .qishui-playback-quality-menu')) return;
    setDockQualityMenuOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!state.playbackPage || !state.playbackChrome.communityVisible) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('.community-card, .community-broadcast-toast')) return;
    setPlaybackChromeVisibility({ communityVisible: false });
  });
  document.addEventListener('pointerdown', beginWindowDragGesture, true);
  document.addEventListener('pointermove', moveWindowDragGesture, true);
  document.addEventListener('pointerup', endWindowDragGesture, true);
  document.addEventListener('pointercancel', endWindowDragGesture, true);
  document.addEventListener('click', suppressWindowDragClick, true);
  els.playlistCards.addEventListener('pointerdown', (event) => event.stopPropagation());
  if (els.localPlaylistInput) {
    els.localPlaylistInput.addEventListener('change', () => {
      importLocalAudioFiles(els.localPlaylistInput.files)
        .catch((error) => toast(error.message || '本地歌曲导入失败'))
        .finally(() => {
          els.localPlaylistInput.value = '';
        });
    });
  }
  if (els.playlistLocalAddButton) {
    els.playlistLocalAddButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.localPlaylistInput?.click();
    });
  }
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
  if (els.qishuiPlaybackPreviousButton) {
    els.qishuiPlaybackPreviousButton.addEventListener('click', () => switchQishuiPlaybackTrack(-1));
  }
  if (els.qishuiPlaybackPlayButton) els.qishuiPlaybackPlayButton.addEventListener('click', togglePlay);
  if (els.qishuiPlaybackNextButton) {
    els.qishuiPlaybackNextButton.addEventListener('click', () => switchQishuiPlaybackTrack(1));
  }
  if (els.qishuiPlaybackScaleToggle) {
    els.qishuiPlaybackScaleToggle.addEventListener('click', toggleQishuiPlaybackExpanded);
  }
  if (els.qishuiPlaybackVisibilityToggle) {
    els.qishuiPlaybackVisibilityToggle.addEventListener('click', toggleQishuiPlaybackHidden);
  }
  if (els.qishuiPlaybackTools) els.qishuiPlaybackTools.addEventListener('click', handlePlaybackCardTool);
  if (els.qishuiPlaybackCard) {
    els.qishuiPlaybackCard.addEventListener('wheel', handleQishuiPlaybackWheel, { passive: false });
  }
  if (els.qishuiPlaybackProgressRange) {
    els.qishuiPlaybackProgressRange.addEventListener('pointerdown', () => {
      if (!els.qishuiPlaybackProgressRange.disabled) {
        state.qishuiPlaybackCard.progressDragging = true;
      }
    });
    els.qishuiPlaybackProgressRange.addEventListener('input', previewQishuiPlaybackSeek);
    els.qishuiPlaybackProgressRange.addEventListener('change', commitQishuiPlaybackSeek);
    els.qishuiPlaybackProgressRange.addEventListener('pointerup', commitQishuiPlaybackSeek);
    els.qishuiPlaybackProgressRange.addEventListener('pointercancel', commitQishuiPlaybackSeek);
    els.qishuiPlaybackProgressRange.addEventListener('blur', commitQishuiPlaybackSeek);
  }
  if (els.qishuiPlaybackCover) {
    els.qishuiPlaybackCover.addEventListener('error', handleQishuiPlaybackImageError);
  }
  if (els.qishuiPlaybackBackdrop) {
    els.qishuiPlaybackBackdrop.addEventListener('error', handleQishuiPlaybackImageError);
  }
  if (els.qishuiPlaybackAccountAvatarImage) {
    els.qishuiPlaybackAccountAvatarImage.addEventListener('error', handleQishuiPlaybackAccountAvatarError);
  }
  if (els.qishuiPlaybackPhone) {
    els.qishuiPlaybackPhone.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
  els.prevButton.addEventListener('click', () => transport('/api/player/previous'));
  els.nextButton.addEventListener('click', () => transport('/api/player/next'));
  if (els.dockQualityButton) {
    els.dockQualityButton.addEventListener('click', (event) => {
      setDockQualityMenuOpen(!state.qualityMenuOpen);
      event.stopPropagation();
    });
  }
  if (els.dockQualityMenu) {
    els.dockQualityMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.dockQualityMenu.addEventListener('click', (event) => {
      const button = event.target.closest('.dock-quality-option');
      if (!button) return;
      selectPlaybackQuality(button.dataset.quality);
    });
  }
  if (els.qishuiPlaybackQuality) {
    els.qishuiPlaybackQuality.addEventListener('click', (event) => {
      setDockQualityMenuOpen(!state.qualityMenuOpen);
      event.stopPropagation();
    });
  }
  if (els.qishuiPlaybackQualityMenu) {
    els.qishuiPlaybackQualityMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
    els.qishuiPlaybackQualityMenu.addEventListener('click', (event) => {
      const button = event.target.closest('.dock-quality-option');
      if (!button) return;
      selectPlaybackQuality(button.dataset.quality);
    });
  }
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
  window.addEventListener('pointermove', scheduleUiPointerUpdates, { passive: true });
  window.addEventListener('pointerleave', () => {
    cancelUiPointerUpdates();
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
  window.addEventListener('beforeunload', revokeLocalObjectUrls, { once: true });
  window.addEventListener('pageshow', () => scheduleUserPlaylistsRefresh(160), { passive: true });
  window.addEventListener('resize', () => {
    syncPlaybackCardPanelState();
    scheduleWallpaperAutoSize();
    resetBookLyricScrollState();
    scheduleBookLyricFit();
    scheduleQishuiPlaybackLyricLayout();
    setListenMiniPosition();
    setCommunityFloatingPanelPosition('message');
    setCommunityFloatingPanelPosition('profile');
    if (els.recordingDialog && !els.recordingDialog.hidden) setRecordingMiniPosition();
    if (els.playlistShelf.hidden || state.playbackPage || !state.activePlaylistId) return;
    const activeCard = els.playlistCards.querySelector(`.orb-playlist-card[data-playlist-id="${CSS.escape(String(state.activePlaylistId))}"]`);
    positionShelfNearCard(activeCard);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.renderClarity.lastFrameAt = 0;
      stopCommunityEventStream(false);
      return;
    }
    resetRenderClaritySampling(renderClaritySceneKey(), 30);
    refreshPlayerState().catch(() => {});
    refreshVisualBridge();
    refreshNativeAudioSample();
    refreshLoginStatus();
    scheduleUserPlaylistsRefresh(160);
    scheduleCommunityRefresh(220);
    ensureCommunityEventStream();
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
    if (!state.localQueueActive) {
      apiJson(`/api/player/seek?${query({ position: Math.round(els.audio.currentTime || 0) })}`).catch(() => {});
    }
    if (state.community.activeSession) reportCommunityListening(true).catch(() => {});
  });

  els.volumeRange.addEventListener('input', () => {
    const volume = Number(els.volumeRange.value) / 100;
    els.audio.volume = volume;
    els.volumeLabel.textContent = `${els.volumeRange.value}%`;
    if (!state.localQueueActive) apiJson(`/api/player/volume?${query({ value: volume.toFixed(2) })}`).catch(() => {});
  });

  els.audio.addEventListener('timeupdate', updateProgress);
  els.audio.addEventListener('durationchange', updateProgress);
  els.audio.addEventListener('seeking', updateProgress);
  els.audio.addEventListener('seeked', updateProgress);
  els.audio.addEventListener('loadedmetadata', () => {
    const pendingAudioSeekTarget = state.qishuiPlaybackCard.pendingAudioSeekTarget;
    if (pendingAudioSeekTarget != null && Number.isFinite(Number(pendingAudioSeekTarget))) {
      setAudioPlaybackPosition(Number(pendingAudioSeekTarget), 0.05);
      state.qishuiPlaybackCard.pendingAudioSeekTarget = null;
    }
    if (state.localQueueActive && isLocalSong(state.currentSong) && Number.isFinite(els.audio.duration)) {
      const duration = Math.max(0, els.audio.duration);
      state.currentSong.duration = duration;
      const localSong = state.localPlaylistSongs.find((song) => song.id === state.currentSong.id);
      if (localSong) localSong.duration = duration;
      document.querySelectorAll('.shelf-song-button').forEach((button) => {
        if (button.dataset.songId !== state.currentSong.id) return;
        const label = button.querySelector('.shelf-song-duration');
        if (label) label.textContent = formatTime(duration);
      });
    }
    resetSpectrumForSong(state.currentSong);
    updateProgress();
  });
  els.audio.addEventListener('play', () => {
    ensureAudioAnalysis();
    state.community.lastListenReportAt = performance.now();
    updatePlayState();
    requestOrbFrame();
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
  els.audio.addEventListener('error', () => {
    const extension = isLocalSong(state.currentSong) ? localAudioExtension(state.currentSong.fileName) : '';
    toast(extension
      ? `当前播放引擎无法解码 ${extension.toUpperCase()} 音频`
      : '本地客户端无法播放当前音频源');
  });
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
    if (state.playbackPage && beginChladniTextGesture(event)) {
      captureStagePointer(event.pointerId);
      event.preventDefault();
      return;
    }
    if (state.playbackPage && beginBookEffectTextGesture(event)) {
      captureStagePointer(event.pointerId);
      event.preventDefault();
      return;
    }
    if (state.playbackPage && beginBookLyricGesture(event)) {
      captureStagePointer(event.pointerId);
      event.preventDefault();
      return;
    }
    if (state.playbackPage && isChladniPreset()) {
      event.preventDefault();
      return;
    }
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
    captureStagePointer(event.pointerId);
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
    if (moveChladniTextGesture(event)) {
      event.preventDefault();
      return;
    }
    if (moveBookEffectTextGesture(event)) {
      event.preventDefault();
      return;
    }
    if (moveBookLyricGesture(event)) {
      event.preventDefault();
      return;
    }
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
    if (endChladniTextGesture(event)) {
      releaseStagePointer(event.pointerId);
      return;
    }
    if (endBookEffectTextGesture(event)) {
      releaseStagePointer(event.pointerId);
      return;
    }
    if (endBookLyricGesture(event)) {
      releaseStagePointer(event.pointerId);
      return;
    }
    if (state.playbackVisual.dragging && event.pointerId === state.playbackVisual.pointerId) {
      const moved = Math.hypot(
        event.clientX - (state.playbackVisual.pressX || event.clientX),
        event.clientY - (state.playbackVisual.pressY || event.clientY)
      );
      const held = performance.now() - (state.playbackVisual.pressStartedAt || performance.now());
      if (isSonicTopographyPreset() && (moved < 14 || held > 560)) {
        addSonicTopographyPointerRipple(event);
      }
      state.playbackVisual.dragging = false;
      state.playbackVisual.pointerId = null;
      els.stage.classList.remove('is-dragging');
      releaseStagePointer(event.pointerId);
      return;
    }
    if (!state.orb.dragging || event.pointerId !== state.orb.pointerId) return;
    state.orb.dragging = false;
    state.orb.pointerId = null;
    els.stage.classList.remove('is-dragging');
    releaseStagePointer(event.pointerId);
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
    if (state.textPreset === 'book-effect' && state.diyPreset !== 'book') {
      if (!isBookEffectTextPointInside(event, 28)) resetBookEffectTextTransform();
      event.preventDefault();
      return;
    }
    resetPlaybackView();
  });
  els.stage.addEventListener('wheel', (event) => {
    if (event.target.closest('.playlist-song-page, .playlist-shelf, .orb-playlists, button, input, textarea, select')) return;
    if (scaleChladniTextFromWheel(event)) {
      event.preventDefault();
      return;
    }
    updateStageZoom(event.deltaY);
    event.preventDefault();
  }, { passive: false });
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

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.getAttribute('src') === src);
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      if (!existing) removeElement(script);
      reject(new Error(`Unable to load ${src}`));
    }, { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

function ensureTsParticlesBundle() {
  if (window.tsParticles) return Promise.resolve(window.tsParticles);
  if (state.coverParticle.bundlePromise) return state.coverParticle.bundlePromise;
  const sources = [
    '../node_modules/@tsparticles/slim/tsparticles.slim.bundle.min.js',
    '/node_modules/@tsparticles/slim/tsparticles.slim.bundle.min.js',
    'node_modules/@tsparticles/slim/tsparticles.slim.bundle.min.js'
  ];
  const trySource = (index = 0) => {
    if (index >= sources.length) return Promise.reject(new Error('tsParticles bundle not found'));
    return loadScriptOnce(sources[index])
      .then(() => (window.tsParticles ? window.tsParticles : Promise.reject(new Error('tsParticles not registered'))))
      .catch(() => trySource(index + 1));
  };
  state.coverParticle.bundlePromise = trySource().catch((error) => {
    state.coverParticle.bundlePromise = null;
    throw error;
  });
  return state.coverParticle.bundlePromise;
}

function coverParticleEngineOptions() {
  const palette = state.coverParticle.palette || fallbackLyricPalette(state.currentSong);
  return {
    fullScreen: { enable: false },
    fpsLimit: 1000,
    detectRetina: true,
    background: { color: 'transparent' },
    particles: {
      number: {
        value: reducedMotion ? 32 : 64,
        density: { enable: true, width: 960, height: 640 }
      },
      color: {
        value: [
          rgbHexValue(palette.primary),
          rgbHexValue(palette.glow),
          rgbHexValue(palette.highlight)
        ]
      },
      opacity: { value: { min: 0.08, max: 0.24 } },
      size: { value: { min: 0.45, max: 1.35 } },
      links: { enable: false },
      move: {
        enable: true,
        speed: { min: 0.08, max: 0.28 },
        direction: 'none',
        outModes: { default: 'bounce' }
      }
    },
    interactivity: {
      events: {
        onHover: { enable: true, mode: 'repulse' },
        resize: true
      },
      modes: {
        repulse: { distance: 132, duration: 0.4 }
      }
    }
  };
}

function ensureCoverParticleEngine() {
  if (!els.coverParticleEngine || !coverParticlePresetVisible()) return Promise.resolve(null);
  const cover = state.coverParticle;
  if (cover.engineContainer) return Promise.resolve(cover.engineContainer);
  if (cover.enginePromise) return cover.enginePromise;
  const pending = ensureTsParticlesBundle()
    .then((engine) => {
      if (!coverParticlePresetVisible() || cover.engineContainer || !engine || typeof engine.load !== 'function') {
        return cover.engineContainer;
      }
      return engine.load({
        id: 'coverParticleEngine',
        options: coverParticleEngineOptions()
      });
    })
    .then((container) => {
      if (container && container !== cover.engineContainer) {
        cover.engineContainer = container;
        cover.enginePlaying = false;
      }
      if (container && (!cover.engineVisible || !coverParticlePresetVisible())) pauseCoverParticleEngine(true);
      return container;
    })
    .catch(() => null);
  cover.enginePromise = pending;
  pending.finally(() => {
    if (cover.enginePromise === pending) cover.enginePromise = null;
  });
  return pending;
}

function coverParticleFallbackColor(index, radius) {
  const palette = state.coverParticle.palette || fallbackLyricPalette(state.currentSong);
  const colors = [palette.primary, palette.glow, palette.highlight, palette.depth];
  const source = colors[index % colors.length] || { r: 255, g: 255, b: 255 };
  const lift = 0.68 + (1 - radius) * 0.34;
  return {
    r: clamp(source.r * lift, 0, 255),
    g: clamp(source.g * lift, 0, 255),
    b: clamp(source.b * lift, 0, 255)
  };
}

function coverParticleDisplayChannel(value) {
  const normalized = clamp(Number(value) / 255, 0, 1);
  const lifted = Math.pow(normalized, 0.92);
  return Math.round(clamp((lifted - 0.5) * 1.18 + 0.5, 0, 1) * 255);
}

function coverParticleNoise(x, y, salt = 0) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function buildCoverParticleSamples(width, height, dpr) {
  const image = state.coverParticle.image;
  const sampleSize = reducedMotion ? 192 : MOBILE_RENDER_TARGET ? 224 : 256;
  const step = 1;
  const signature = `${state.coverParticle.imageSignature}|${sampleSize}|${step}`;
  if (signature === state.coverParticle.sampleSignature && state.coverParticle.particles.length) return;

  let data = null;
  if (image && image.complete && image.naturalWidth) {
    const sample = document.createElement('canvas');
    sample.width = sampleSize;
    sample.height = sampleSize;
    const context = sample.getContext('2d', { willReadFrequently: true });
    try {
      context.clearRect(0, 0, sampleSize, sampleSize);
      const imageAspect = image.naturalWidth / Math.max(1, image.naturalHeight);
      const drawWidth = imageAspect >= 1 ? sampleSize : sampleSize * imageAspect;
      const drawHeight = imageAspect >= 1 ? sampleSize / imageAspect : sampleSize;
      context.drawImage(
        image,
        (sampleSize - drawWidth) / 2,
        (sampleSize - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      data = context.getImageData(0, 0, sampleSize, sampleSize).data;
    } catch (error) {
      data = null;
    }
  }

  const particles = [];
  const luminanceAt = data
    ? (sampleX, sampleY) => {
        const clampedX = Math.max(0, Math.min(sampleSize - 1, sampleX));
        const clampedY = Math.max(0, Math.min(sampleSize - 1, sampleY));
        const offset = (clampedY * sampleSize + clampedX) * 4;
        const alpha = data[offset + 3] / 255;
        return (
          data[offset] * 0.2126
          + data[offset + 1] * 0.7152
          + data[offset + 2] * 0.0722
        ) / 255 * alpha;
      }
    : null;
  let index = 0;
  for (let y = 0; y < sampleSize; y += step) {
    for (let x = 0; x < sampleSize; x += step) {
      const nx = (x / (sampleSize - 1)) * 2 - 1;
      const ny = (y / (sampleSize - 1)) * 2 - 1;
      const radius = clamp(Math.hypot(nx, ny) / Math.SQRT2, 0, 1);
      const px = nx * 0.64;
      const py = ny * 0.64;
      let color = coverParticleFallbackColor(index, radius);
      let alpha = 0.9;
      let depth = (coverParticleNoise(x, y, 1) - 0.5) * 0.046;
      if (data) {
        const offset = (y * sampleSize + x) * 4;
        alpha = data[offset + 3] / 255;
        if (alpha <= 0.05) continue;
        color = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
        const centerLuma = luminanceAt(x, y);
        const crossLuma = (
          luminanceAt(x - 1, y)
          + luminanceAt(x + 1, y)
          + luminanceAt(x, y - 1)
          + luminanceAt(x, y + 1)
        ) * 0.1;
        const diagonalLuma = (
          luminanceAt(x - 1, y - 1)
          + luminanceAt(x + 1, y - 1)
          + luminanceAt(x - 1, y + 1)
          + luminanceAt(x + 1, y + 1)
        ) * 0.05;
        const smoothLuma = centerLuma * 0.4 + crossLuma + diagonalLuma;
        const reliefLuma = clamp(smoothLuma * 0.68 + centerLuma * 0.32, 0, 1);
        depth = Math.pow(reliefLuma, 1.42) * 0.14 - 0.04;
      }
      const relief = clamp((depth + 0.04) / 0.14, 0, 1);
      const gradientX = data ? luminanceAt(x + 1, y) - luminanceAt(x - 1, y) : 0;
      const gradientY = data ? luminanceAt(x, y + 1) - luminanceAt(x, y - 1) : 0;
      const gradientLength = Math.hypot(gradientX, gradientY) || 1;
      const radialLength = Math.hypot(px, py) || 1;
      const noiseAngle = coverParticleNoise(x, y, 2) * Math.PI * 2;
      let driftX = gradientX / gradientLength * 0.58 + px / radialLength * 0.28 + Math.cos(noiseAngle) * 0.14;
      let driftY = gradientY / gradientLength * 0.58 + py / radialLength * 0.28 + Math.sin(noiseAngle) * 0.14;
      const driftLength = Math.hypot(driftX, driftY) || 1;
      driftX /= driftLength;
      driftY /= driftLength;
      const driftMagnitude = 0.009 + relief * 0.005 + coverParticleNoise(x, y, 3) * 0.004;
      const sheetPhase = px * 7.6
        + py * 5.1
        + Math.sin((px - py) * 3.8) * 0.58
        + (coverParticleNoise(x, y, 4) - 0.5) * 0.18;
      particles.push({
        x: px,
        y: py,
        z: depth,
        rgb: `${coverParticleDisplayChannel(color.r)}, ${coverParticleDisplayChannel(color.g)}, ${coverParticleDisplayChannel(color.b)}`,
        r: color.r / 255,
        g: color.g / 255,
        b: color.b / 255,
        alpha,
        size: 0.82 + coverParticleNoise(x, y, 5) * 0.12,
        wavePhase: sheetPhase,
        waveStrength: 0.54 + relief * 0.66 + coverParticleNoise(x, y, 6) * 0.12,
        lowCyclePhase: coverParticleNoise(x, y, 7) * Math.PI * 2,
        lowCycleRate: (coverParticleNoise(x, y, 8) < 0.5 ? -1 : 1)
          * (0.58 + coverParticleNoise(x, y, 9) * 0.68),
        bumpDriftX: driftX * driftMagnitude,
        bumpDriftY: driftY * driftMagnitude
      });
      index += 1;
    }
  }
  state.coverParticle.particles = particles;
  state.coverParticle.sampleSignature = signature;
}

function syncCoverParticleCanvas(width, height, dpr) {
  const canvas = els.coverParticleCanvas;
  if (!canvas) return null;
  const cssWidth = Math.max(1, Math.round(els.coverParticleRig && els.coverParticleRig.clientWidth ? els.coverParticleRig.clientWidth : width / dpr));
  const cssHeight = Math.max(1, Math.round(els.coverParticleRig && els.coverParticleRig.clientHeight ? els.coverParticleRig.clientHeight : height / dpr));
  const renderWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const renderHeight = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
    canvas.width = renderWidth;
    canvas.height = renderHeight;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  return {
    canvas,
    cssWidth,
    cssHeight,
    width: renderWidth,
    height: renderHeight
  };
}

function coverParticleGpuMaterial(THREE) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      uAudioActive: { value: 0 },
      uYawCos: { value: 1 },
      uYawSin: { value: 0 },
      uPitchCos: { value: 1 },
      uPitchSin: { value: 0 },
      uCoverSize: { value: 1 },
      uCoverPixelSize: { value: 1 },
      uMotionScale: { value: 1 },
      uMouseActive: { value: 0 },
      uMouseLimit: { value: 1 },
      uMousePullBase: { value: 0 },
      uMinPointSize: { value: 1 }
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aAlpha;
      attribute float aSize;
      attribute float aWavePhase;
      attribute float aWaveStrength;
      attribute float aLowCyclePhase;
      attribute float aLowCycleRate;
      attribute vec2 aDrift;
      uniform vec2 uResolution;
      uniform vec2 uCenter;
      uniform vec2 uMouse;
      uniform float uTime;
      uniform float uBass;
      uniform float uEnergy;
      uniform float uBeat;
      uniform float uAudioActive;
      uniform float uYawCos;
      uniform float uYawSin;
      uniform float uPitchCos;
      uniform float uPitchSin;
      uniform float uCoverSize;
      uniform float uCoverPixelSize;
      uniform float uMotionScale;
      uniform float uMouseActive;
      uniform float uMouseLimit;
      uniform float uMousePullBase;
      uniform float uMinPointSize;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vBump;
      varying float vInteraction;
      varying float vRelief;

      void main() {
        float relief = clamp((position.z + 0.04) / 0.14, 0.0, 1.0);
        float sheetTime = uTime * (0.68 + uBass * 0.54 + uBeat * 0.12);
        float waveA = sin(sheetTime + aWavePhase);
        float waveB = sin(sheetTime * 0.73 + aWavePhase * 1.31 + position.x * 5.2);
        float waveC = sin(sheetTime * 1.17 - aWavePhase * 0.89 + position.y * 6.6);
        float radialWave = sin(length(position.xy) * 14.0 - sheetTime * 1.28 + aWavePhase * 0.18);
        float lowDrive = clamp(uBass * 0.82 + uEnergy * 0.22, 0.0, 1.25);
        float baseNaturalWave = waveA * 0.42 + waveB * 0.28 + waveC * 0.20 + radialWave * 0.10;
        float segmentProgress = clamp((position.x + 0.64) / 1.28, 0.0, 1.0);
        float lowSegmentWave = sin(segmentProgress * 6.28318530718 * ${COVER_PARTICLE_LOW_WAVE_SEGMENTS}.0 + position.y * 0.65 - sheetTime * 0.56);
        float lowSegmentMix = clamp(lowDrive * 0.72, 0.0, 0.68);
        float randomParticleCycle = sin(sheetTime * aLowCycleRate + aLowCyclePhase);
        float randomCycleMix = clamp(uBass * 1.08, 0.0, 0.78);
        float lowFrequencyWave = mix(lowSegmentWave, randomParticleCycle, randomCycleMix);
        float naturalWave = mix(baseNaturalWave, lowFrequencyWave, lowSegmentMix);
        float beatDrive = clamp(uBeat, 0.0, 1.4);
        float waveDepth = uAudioActive * naturalWave * (0.010 + lowDrive * 0.014 + beatDrive * 0.004) * aWaveStrength * uMotionScale;
        float motionAmount = abs(waveDepth) * 8.0;
        float lateralWave = uAudioActive * naturalWave * (0.12 + lowDrive * 0.08) * uMotionScale;
        vec3 source = vec3(position.xy, position.z * uAudioActive)
          + vec3(aDrift * lateralWave, waveDepth);

        float rotatedX = source.x * uYawCos + source.z * uYawSin;
        float rotatedZ = -source.x * uYawSin + source.z * uYawCos;
        float rotatedY = source.y * uPitchCos - rotatedZ * uPitchSin;
        float pointZ = source.y * uPitchSin + rotatedZ * uPitchCos;
        float perspective = 1.24 / (1.24 - pointZ * 0.54);
        vec2 point = uCenter + vec2(rotatedX, rotatedY) * uCoverSize * perspective;

        float interaction = 0.0;
        if (uMouseActive > 0.5) {
          vec2 delta = point - uMouse;
          float distance = length(delta);
          if (distance < uMouseLimit) {
            interaction = 1.0 - distance / uMouseLimit;
            float pull = interaction * interaction * uMousePullBase;
            if (distance > 0.001) point -= delta / distance * pull;
          }
        }

        float depth = clamp((pointZ + 0.9) / 1.8, 0.0, 1.0);
        gl_PointSize = max(
          uMinPointSize,
          uCoverPixelSize * aSize * (1.0 + motionAmount * 0.08 + interaction * 0.08 + uBass * 0.012) * perspective
        );
        vec2 clip = vec2(point.x / uResolution.x * 2.0 - 1.0, 1.0 - point.y / uResolution.y * 2.0);
        float clipDepth = clamp(-pointZ * 0.72, -0.94, 0.94);
        gl_Position = vec4(clip, clipDepth, 1.0);

        vColor = aColor;
        vAlpha = clamp((0.86 + depth * 0.12 + motionAmount * 0.03 + interaction * 0.08 + uEnergy * 0.035) * aAlpha, 0.52, 1.0);
        vBump = motionAmount;
        vInteraction = interaction;
        vRelief = relief;
      }
    `,
    fragmentShader: `
      precision mediump float;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vBump;
      varying float vInteraction;
      varying float vRelief;

      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float dist = dot(p, p);
        float core = 1.0 - smoothstep(0.12, 0.22, dist);
        float halo = 1.0 - smoothstep(0.20, 0.25, dist);
        float mask = clamp(core + halo * 0.14, 0.0, 1.0);
        if (mask < 0.02) discard;
        float reliefLight = mix(0.94, 1.16, vRelief);
        vec3 liftedColor = pow(max(vColor, vec3(0.002)), vec3(0.92));
        float colorLuma = dot(liftedColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 vividColor = max(mix(vec3(colorLuma), liftedColor, 1.12), vec3(0.014));
        vec3 displayColor = clamp((vividColor - vec3(0.5)) * 1.18 + vec3(0.5), 0.0, 1.0);
        vec3 color = displayColor * (reliefLight + halo * 0.1 + vBump * 0.08 + vInteraction * 0.08);
        gl_FragColor = vec4(color, vAlpha * mask);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: true
  });
}

function ensureCoverParticleGpu(frame) {
  const cover = state.coverParticle;
  if (cover.gpuFailed || !window.THREE || !frame || !frame.canvas) return false;
  const THREE = window.THREE;
  try {
    if (!cover.gpuRenderer) {
      const renderer = createDirectX11Renderer(THREE, {
        canvas: frame.canvas,
        antialias: false
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(1);
      renderer.autoClear = true;
      cover.gpuRenderer = renderer;
      cover.gpuWidth = 0;
      cover.gpuHeight = 0;
      cover.gpuScene = new THREE.Scene();
      cover.gpuCamera = new THREE.Camera();
      cover.gpuMaterial = coverParticleGpuMaterial(THREE);
    }
    return true;
  } catch (error) {
    cover.gpuFailed = true;
    return false;
  }
}

function rebuildCoverParticleGpuGeometry() {
  const cover = state.coverParticle;
  const particles = cover.particles;
  if (!cover.gpuRenderer || !cover.gpuScene || !cover.gpuMaterial || !particles.length) return false;
  if (cover.gpuSignature === cover.sampleSignature && cover.gpuPoints) return true;
  const THREE = window.THREE;
  if (!THREE) return false;

  if (cover.gpuPoints) {
    cover.gpuScene.remove(cover.gpuPoints);
    cover.gpuPoints = null;
  }
  if (cover.gpuGeometry) {
    cover.gpuGeometry.dispose();
    cover.gpuGeometry = null;
  }

  const count = particles.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const wavePhases = new Float32Array(count);
  const waveStrengths = new Float32Array(count);
  const lowCyclePhases = new Float32Array(count);
  const lowCycleRates = new Float32Array(count);
  const drifts = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const particle = particles[index];
    const p3 = index * 3;
    const p2 = index * 2;
    positions[p3] = particle.x;
    positions[p3 + 1] = particle.y;
    positions[p3 + 2] = particle.z;
    colors[p3] = particle.r;
    colors[p3 + 1] = particle.g;
    colors[p3 + 2] = particle.b;
    alphas[index] = particle.alpha;
    sizes[index] = particle.size;
    wavePhases[index] = particle.wavePhase;
    waveStrengths[index] = particle.waveStrength;
    lowCyclePhases[index] = particle.lowCyclePhase;
    lowCycleRates[index] = particle.lowCycleRate;
    drifts[p2] = particle.bumpDriftX;
    drifts[p2 + 1] = particle.bumpDriftY;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aWavePhase', new THREE.BufferAttribute(wavePhases, 1));
  geometry.setAttribute('aWaveStrength', new THREE.BufferAttribute(waveStrengths, 1));
  geometry.setAttribute('aLowCyclePhase', new THREE.BufferAttribute(lowCyclePhases, 1));
  geometry.setAttribute('aLowCycleRate', new THREE.BufferAttribute(lowCycleRates, 1));
  geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 2));

  const points = new THREE.Points(geometry, cover.gpuMaterial);
  cover.gpuScene.add(points);
  cover.gpuGeometry = geometry;
  cover.gpuPoints = points;
  cover.gpuSignature = cover.sampleSignature;
  return true;
}

function coverParticlePointSize(coverSize, particleCount) {
  return coverSize / Math.max(1, Math.sqrt(Math.max(1, particleCount)));
}

function drawCoverParticleSceneGpu(frame, width, height, dpr, now, t, audioActive, wholePulse) {
  if (!ensureCoverParticleGpu(frame) || !rebuildCoverParticleGpuGeometry()) return false;
  const cover = state.coverParticle;
  const renderer = cover.gpuRenderer;
  const material = cover.gpuMaterial;
  const uniforms = material.uniforms;
  if (cover.gpuWidth !== width || cover.gpuHeight !== height) {
    renderer.setSize(width, height, false);
    cover.gpuWidth = width;
    cover.gpuHeight = height;
  }

  const zoom = clamp(state.playbackVisual.zoom || 1, 0.58, 2.35);
  const wholeScale = 1 + wholePulse * 0.04;
  const coverSize = Math.min(width, height) * 0.76 * zoom * wholeScale;
  const coverPixelSize = coverParticlePointSize(coverSize, cover.particles.length);
  const mouseActive = state.orb.mouseActive && now - state.orb.lastMouseAt < 1600;
  const coverYaw = state.playbackVisual.yaw - PLAYBACK_REST_YAW;
  const coverPitch = state.playbackVisual.pitch - PLAYBACK_REST_PITCH;

  uniforms.uResolution.value.set(width, height);
  uniforms.uCenter.value.set(width * 0.5, height * (0.48 - wholePulse * 0.008));
  uniforms.uMouse.value.set(state.playbackVisual.mouseX * width, state.playbackVisual.mouseY * height);
  uniforms.uTime.value = t;
  uniforms.uBass.value = audioActive ? cover.bass : 0;
  uniforms.uEnergy.value = audioActive ? cover.energy : 0;
  uniforms.uBeat.value = audioActive ? cover.beat : 0;
  uniforms.uAudioActive.value = audioActive ? 1 : 0;
  uniforms.uYawCos.value = Math.cos(coverYaw);
  uniforms.uYawSin.value = Math.sin(coverYaw);
  uniforms.uPitchCos.value = Math.cos(coverPitch);
  uniforms.uPitchSin.value = Math.sin(coverPitch);
  uniforms.uCoverSize.value = coverSize;
  uniforms.uCoverPixelSize.value = coverPixelSize;
  uniforms.uMotionScale.value = coverParticleMotionScale();
  uniforms.uMouseActive.value = mouseActive ? 1 : 0;
  uniforms.uMouseLimit.value = 132 * dpr;
  uniforms.uMousePullBase.value = (16 + cover.energy * 28) * dpr;
  uniforms.uMinPointSize.value = 0.42 * dpr;

  renderer.render(cover.gpuScene, cover.gpuCamera);
  return true;
}

function drawCoverParticleScene(width, height, dpr) {
  const frame = syncCoverParticleCanvas(width, height, dpr);
  if (!frame) return;
  width = frame.width;
  height = frame.height;
  buildCoverParticleSamples(width, height, dpr);
  updatePlaybackQuality(state.playbackVisual);

  const cover = state.coverParticle;
  const particles = cover.particles;
  const particleLimit = Math.min(
    particles.length,
    Math.max(reducedMotion ? 14000 : 76000, Math.floor(particles.length * (state.playbackVisual.quality || 1)))
  );
  const now = performance.now();
  const t = now / 1000;
  const audioActive = isPlaybackClockRunning();
  const audioBass = audioActive
    ? clamp(Math.max(Number(state.visual.lowFrequencyAmplitude) || 0, state.visual.bass || 0), 0, 1.25)
    : 0;
  const audioEnergy = audioActive
    ? clamp(Number(state.visual.energy) || 0, 0, 1)
    : 0;
  const audioBeat = audioActive ? clamp(Number(state.visual.beat) || 0, 0, 1.4) : 0;
  const frameStep = state.playbackVisual.frameStep || 1;
  const envelopeStepMs = Math.max(1, frameStep * RENDER_PROFILE.targetFrameMs);
  const bassRate = 1 - Math.exp(-envelopeStepMs / (audioBass > cover.bass ? 60 : 340));
  const energyRate = 1 - Math.exp(-envelopeStepMs / (audioEnergy > cover.energy ? 85 : 380));
  const beatRate = 1 - Math.exp(-envelopeStepMs / (audioBeat > cover.beat ? 50 : 320));
  cover.bass += (audioBass - cover.bass) * bassRate;
  cover.energy += (audioEnergy - cover.energy) * energyRate;
  cover.beat += (audioBeat - cover.beat) * beatRate;
  const wholePulse = audioActive
    ? clamp(Math.pow(cover.bass, 1.1) * 0.88 + cover.beat * 0.12, 0, 1.15)
    : 0;

  if (drawCoverParticleSceneGpu(frame, width, height, dpr, now, t, audioActive, wholePulse)) return;

  const context = frame.canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const cx = width * 0.5;
  const cy = height * (0.48 - wholePulse * 0.008);
  const zoom = clamp(state.playbackVisual.zoom || 1, 0.58, 2.35);
  const coverSize = Math.min(width, height) * 0.76 * zoom * (1 + wholePulse * 0.04);
  const coverPixelSize = coverParticlePointSize(coverSize, particles.length);
  const mouseX = state.playbackVisual.mouseX * width;
  const mouseY = state.playbackVisual.mouseY * height;
  const mouseActive = state.orb.mouseActive && now - state.orb.lastMouseAt < 1600;
  const coverYaw = state.playbackVisual.yaw - PLAYBACK_REST_YAW;
  const coverPitch = state.playbackVisual.pitch - PLAYBACK_REST_PITCH;
  const yawCos = Math.cos(coverYaw);
  const yawSin = Math.sin(coverYaw);
  const pitchCos = Math.cos(coverPitch);
  const pitchSin = Math.sin(coverPitch);
  const motionScale = coverParticleMotionScale();
  const bass = audioActive ? cover.bass : 0;
  const energy = audioActive ? cover.energy : 0;
  const beat = audioActive ? cover.beat : 0;
  const mouseLimit = 132 * dpr;
  const mouseLimitSq = mouseLimit * mouseLimit;
  const mousePullBase = (16 + cover.energy * 28) * dpr;
  const sheetTime = t * (0.68 + bass * 0.54 + beat * 0.12);
  const drawAllParticles = particleLimit >= particles.length;
  const sampleScale = drawAllParticles ? 1 : particles.length / particleLimit;

  const glow = context.createRadialGradient(cx, cy, coverSize * 0.08, cx, cy, coverSize * 0.82);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.04 + bass * 0.035})`);
  glow.addColorStop(0.42, `rgba(177, 237, 255, ${0.026 + energy * 0.028})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = 'source-over';
  context.imageSmoothingEnabled = false;
  context.shadowBlur = 0;
  let coverParticleShadowActive = false;
  for (let drawIndex = 0; drawIndex < particleLimit; drawIndex += 1) {
    const sampleIndex = drawAllParticles
      ? drawIndex
      : Math.floor(drawIndex * sampleScale);
    const particle = particles[sampleIndex];
    const waveA = Math.sin(sheetTime + particle.wavePhase);
    const waveB = Math.sin(sheetTime * 0.73 + particle.wavePhase * 1.31 + particle.x * 5.2);
    const waveC = Math.sin(sheetTime * 1.17 - particle.wavePhase * 0.89 + particle.y * 6.6);
    const radialWave = Math.sin(Math.hypot(particle.x, particle.y) * 14 - sheetTime * 1.28 + particle.wavePhase * 0.18);
    const lowDrive = clamp(bass * 0.82 + energy * 0.22, 0, 1.25);
    const baseNaturalWave = waveA * 0.42 + waveB * 0.28 + waveC * 0.2 + radialWave * 0.1;
    const segmentProgress = clamp((particle.x + 0.64) / 1.28, 0, 1);
    const lowSegmentWave = Math.sin(
      segmentProgress * Math.PI * 2 * COVER_PARTICLE_LOW_WAVE_SEGMENTS
        + particle.y * 0.65
        - sheetTime * 0.56
    );
    const lowSegmentMix = clamp(lowDrive * 0.72, 0, 0.68);
    const randomParticleCycle = Math.sin(sheetTime * particle.lowCycleRate + particle.lowCyclePhase);
    const randomCycleMix = clamp(bass * 1.08, 0, 0.78);
    const lowFrequencyWave = lowSegmentWave * (1 - randomCycleMix) + randomParticleCycle * randomCycleMix;
    const naturalWave = baseNaturalWave * (1 - lowSegmentMix) + lowFrequencyWave * lowSegmentMix;
    const audioGate = audioActive ? 1 : 0;
    const waveDepth = audioGate * naturalWave * (0.01 + lowDrive * 0.014 + beat * 0.004) * particle.waveStrength * motionScale;
    const motionAmount = Math.abs(waveDepth) * 8;
    const lateralWave = audioGate * naturalWave * (0.12 + lowDrive * 0.08) * motionScale;
    const sourceX = particle.x + particle.bumpDriftX * lateralWave;
    const sourceY = particle.y + particle.bumpDriftY * lateralWave;
    const sourceZ = particle.z * (audioActive ? 1 : 0)
      + waveDepth;
    const rotatedX = sourceX * yawCos + sourceZ * yawSin;
    const rotatedZ = -sourceX * yawSin + sourceZ * yawCos;
    const rotatedY = sourceY * pitchCos - rotatedZ * pitchSin;
    const pointZ = sourceY * pitchSin + rotatedZ * pitchCos;
    const perspective = 1.24 / (1.24 - pointZ * 0.54);
    let x = cx + rotatedX * coverSize * perspective;
    let y = cy + rotatedY * coverSize * perspective;
    let interaction = 0;
    if (mouseActive) {
      const dx = x - mouseX;
      const dy = y - mouseY;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < mouseLimitSq) {
        const distance = Math.sqrt(distanceSq);
        interaction = 1 - distance / mouseLimit;
        const pull = interaction * interaction * mousePullBase;
        const pullScale = distance > 0.001 ? pull / distance : 0;
        x -= dx * pullScale;
        y -= dy * pullScale;
      }
    }
    let depth = (pointZ + 0.9) / 1.8;
    if (depth < 0) depth = 0;
    else if (depth > 1) depth = 1;
    let size = coverPixelSize * particle.size * (1 + motionAmount * 0.08 + interaction * 0.08 + bass * 0.012) * perspective;
    const minSize = 0.42 * dpr;
    if (size < minSize) size = minSize;
    let alpha = (0.86 + depth * 0.12 + motionAmount * 0.03 + interaction * 0.08 + energy * 0.035) * particle.alpha;
    if (alpha < 0.52) alpha = 0.52;
    else if (alpha > 1) alpha = 1;
    if (mouseActive) {
      const shadowActive = interaction > 0.28;
      if (shadowActive) {
        coverParticleShadowActive = true;
        context.shadowBlur = (0.45 + interaction * 2.2) * dpr;
        context.shadowColor = `rgba(${particle.rgb}, ${alpha * 0.12})`;
      } else if (coverParticleShadowActive) {
        coverParticleShadowActive = false;
        context.shadowBlur = 0;
      }
    }
    context.fillStyle = `rgba(${particle.rgb}, ${alpha})`;
    context.fillRect(x - size / 2, y - size / 2, size, size);
  }
  context.restore();
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
  const now = performance.now();
  const simulationStep = playbackPresetsUseNativeRefresh() && visual.lastMotionAt
    ? clamp((now - visual.lastMotionAt) / RENDER_PROFILE.targetFrameMs, 0.05, 2)
    : 1;
  visual.lastMotionAt = now;
  visual.frameStep = simulationStep;
  const centralLyricsNeedFrame = textLyricsEnabled() && state.textPreset !== 'book';
  const cardLyricsNeedFrame = playbackCardLyricsVisible();
  if ((centralLyricsNeedFrame || cardLyricsNeedFrame) && state.lyricLines.length) {
    syncPlaybackLyricAnimationFrame();
  }
  if (!visual.dragging && !state.orb.reducedMotion) {
    visual.yaw += visual.velocityYaw * simulationStep;
    visual.pitch += visual.velocityPitch * simulationStep;
    visual.velocityYaw *= Math.pow(0.91, simulationStep);
    visual.velocityPitch *= Math.pow(0.91, simulationStep);
  }
  visual.yaw = wrapRadians(visual.yaw);
  visual.pitch = wrapRadians(visual.pitch);
  updatePlaybackSceneTransform();

  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.08 : 0.48);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.06 : 0.38);
  const lowFrequency = Math.max(Number(state.visual.lowFrequencyAmplitude) || 0, bass);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0.04 : 0.32);
  const targetPulse = els.audio.paused ? 0.08 : clamp(energy * 0.42 + bass * 0.28 + beat * 0.48, 0.08, 1.18);
  const responseBase = clamp(0.08 * state.lyricSpeed, 0.045, 0.24);
  const response = 1 - Math.pow(1 - responseBase, simulationStep);
  visual.lyricPulse += (targetPulse - visual.lyricPulse) * response;
  const t = now / 1000;
  const bassJump = els.audio.paused ? 0 : clamp(lowFrequency * 0.95 + beat * 0.58 + visual.lyricPulse * 0.18, 0, 1.45);
  const bounce = els.audio.paused
    ? 0
    : Math.sin(t * (2.2 + state.lyricSpeed * 0.72)) * 2.4 - bassJump * 16;
  const zoom = clamp(visual.zoom || 1, 0.58, 2.35);
  const scale = (1 + visual.lyricPulse * 0.026 + bassJump * 0.05) * zoom;
  const glowSize = Math.round(1 + bassJump * 8);
  const glowAlpha = clamp(bassJump * 0.42, 0, 0.48);
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-pulse', visual.lyricPulse.toFixed(3));
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-bounce', `${bounce.toFixed(2)}px`);
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-scale', scale.toFixed(3));
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-heart', bassJump.toFixed(3));
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-jump-glow-size', `${glowSize}px`);
  setStylePropertyIfChanged(els.playbackLyricScene, '--lyric-jump-glow-alpha', glowAlpha.toFixed(3));
  setStylePropertyIfChanged(
    els.playbackLyricScene,
    '--lyric-glow-size',
    `${Math.round(4 + visual.lyricPulse * 4 + bassJump * 7)}px`
  );
  updateDynamicCubeMotion();
  updateFreeCubeMotion();
  updateVoidPrismMotion();
  updateChladniMotion();
  updateSonicTopographyMotion();
}

function resetRainGlassDrop(drop, width, height, dpr, fromTop = true, moving = true) {
  const roll = Math.random();
  let radiusCss = 0.7 + Math.random() * 1.3;
  if (roll > 0.94) radiusCss = 8.2 + Math.random() * 7.6;
  else if (roll > 0.68) radiusCss = 3.1 + Math.random() * 5.4;
  else if (roll > 0.2) radiusCss = 1.35 + Math.random() * 2.4;

  const radius = radiusCss * dpr;
  drop.x = Math.random() * width;
  drop.y = fromTop ? -(radius * 3 + Math.random() * height * 0.22) : Math.random() * height;
  drop.radius = radius;
  drop.rx = Math.max(0.6 * dpr, radius * (0.78 + Math.random() * 0.48));
  drop.ry = Math.max(0.6 * dpr, radius * (0.78 + Math.random() * 0.5));
  drop.speed = moving ? (0.28 + Math.random() * 0.82) * dpr * (1 + radiusCss / 18) : 0;
  drop.alpha = moving ? 0.7 + Math.random() * 0.24 : 0.5 + Math.random() * 0.34;
  drop.rim = 0.62 + Math.random() * 0.32;
  drop.phase = Math.random() * Math.PI * 2;
  drop.wobble = 0.18 + Math.random() * 0.42;
  drop.drift = moving ? (0.08 + Math.random() * 0.32) * dpr : 0;
  drop.tail = moving && radiusCss > 3.2 ? (8 + Math.random() * 26) * dpr : 0;
  drop.angle = (Math.random() - 0.5) * 0.22;
  drop.slide = moving;
  return drop;
}

function rainGlassDropTargets(width, height, dpr) {
  const cssArea = (width / dpr) * (height / dpr);
  return {
    staticDrops: Math.round(clamp(cssArea / (reducedMotion ? 3200 : 1650), reducedMotion ? 160 : 280, reducedMotion ? 340 : 760)),
    movingDrops: Math.round(clamp(cssArea / (reducedMotion ? 56000 : 31000), reducedMotion ? 8 : 18, reducedMotion ? 24 : 72))
  };
}

function ensureRainGlassScene(width, height, dpr) {
  const scene = state.rainGlassScene;
  const targets = rainGlassDropTargets(width, height, dpr);
  const resized = scene.width !== width || scene.height !== height || Math.abs(scene.dpr - dpr) > 0.01;
  if (!Array.isArray(scene.staticDrops)) scene.staticDrops = [];
  if (resized || scene.drops.length !== targets.movingDrops) {
    scene.width = width;
    scene.height = height;
    scene.dpr = dpr;
    scene.drops = Array.from({ length: targets.movingDrops }, () => resetRainGlassDrop({}, width, height, dpr, false, true));
  }
  if (resized || scene.staticDrops.length !== targets.staticDrops) {
    scene.staticDrops = Array.from({ length: targets.staticDrops }, () => resetRainGlassDrop({}, width, height, dpr, false, false));
    scene.staticLayerReady = false;
  }
  if (scene.specks.length) scene.specks = [];
  if (resized) scene.staticLayerReady = false;
  return scene;
}

function rainGlassBackgroundImage() {
  const scene = state.rainGlassScene;
  if (scene.backgroundImage) return scene.backgroundImage;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    scene.backgroundReady = true;
  };
  image.src = 'assets/rain-glass-blender-bg.png?v=20260707-round-drops';
  scene.backgroundImage = image;
  return image;
}

function drawCoverImage(context, image, width, height, alpha = 1) {
  if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * ratio;
  const drawHeight = image.naturalHeight * ratio;
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
  return true;
}

function drawRainGlassBackground(context, width, height, dpr, t, audio) {
  let gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#edf0f1');
  gradient.addColorStop(0.36, '#d7dcde');
  gradient.addColorStop(0.68, '#f3f5f5');
  gradient.addColorStop(1, '#c5cdd1');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const blenderGlass = rainGlassBackgroundImage();
  if (drawCoverImage(context, blenderGlass, width, height, 0.9)) {
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = 'rgba(255, 255, 255, 0.16)';
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  context.save();
  context.globalCompositeOperation = 'multiply';
  gradient = context.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.45, Math.max(width, height) * 0.74);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.68, 'rgba(174, 184, 188, 0.04)');
  gradient.addColorStop(1, 'rgba(54, 63, 68, 0.16)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.globalCompositeOperation = 'screen';
  const cloudyLight = context.createRadialGradient(
    width * (0.24 + Math.sin(t * 0.045) * 0.012),
    height * 0.18,
    0,
    width * 0.22,
    height * 0.18,
    Math.max(width, height) * 0.48
  );
  cloudyLight.addColorStop(0, `rgba(255, 255, 255, ${0.22 + audio.high * 0.025})`);
  cloudyLight.addColorStop(0.56, 'rgba(255, 255, 255, 0.08)');
  cloudyLight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = cloudyLight;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawRainGlassLyricSpecks(context, scene, width, height, dpr, t, audio) {
  const cx = width / 2;
  const cy = height * 0.48;
  context.save();
  context.globalCompositeOperation = 'screen';
  scene.specks.forEach((speck) => {
    const angle = speck.angle + t * speck.speed;
    const rx = (220 + speck.radius * 310) * dpr;
    const ry = (42 + speck.radius * 74) * dpr;
    const x = cx + Math.cos(angle) * rx + Math.sin(t * 0.28 + speck.phase) * 10 * dpr;
    const y = cy + Math.sin(angle * 1.2 + speck.phase) * ry + Math.cos(t * 0.24 + speck.phase) * 5 * dpr;
    const pulse = 0.7 + Math.sin(t * 1.1 + speck.phase) * 0.3;
    const alpha = clamp((speck.alpha + audio.high * 0.12) * pulse, 0.06, 0.58);
    const size = speck.size * (0.86 + audio.energy * 0.26) * dpr;
    context.fillStyle = `rgba(126, 210, 255, ${alpha})`;
    context.shadowBlur = 7 * dpr;
    context.shadowColor = `rgba(82, 186, 255, ${alpha * 0.42})`;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawRainGlassDropBead(context, drop, x, y, dpr, t, alphaScale = 1) {
  const sway = Math.sin(t * drop.wobble + drop.phase) * 0.018;
  const rx = Math.max(0.55 * dpr, drop.rx * (1 + sway));
  const ry = Math.max(0.55 * dpr, drop.ry * (1 - sway * 0.8));
  const radius = Math.max(rx, ry);
  const alpha = clamp(drop.alpha * alphaScale, 0.04, 0.96);
  const angle = drop.angle + Math.sin(t * 0.18 + drop.phase) * 0.026;

  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalCompositeOperation = 'source-over';
  context.shadowBlur = 0;

  context.fillStyle = `rgba(1, 3, 4, ${alpha * drop.rim * 0.72})`;
  context.beginPath();
  context.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, Math.PI * 2);
  context.fill();

  let gradient = context.createRadialGradient(
    -rx * 0.34,
    -ry * 0.36,
    Math.max(0.12 * dpr, radius * 0.06),
    0,
    0,
    radius * 1.18
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.88})`);
  gradient.addColorStop(0.22, `rgba(235, 241, 242, ${alpha * 0.52})`);
  gradient.addColorStop(0.62, `rgba(151, 161, 165, ${alpha * 0.22})`);
  gradient.addColorStop(0.86, `rgba(19, 25, 28, ${alpha * 0.18})`);
  gradient.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.03})`);
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(0, 0, rx * 0.84, ry * 0.84, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = `rgba(0, 0, 0, ${alpha * drop.rim * 0.52})`;
  context.lineWidth = Math.max(0.65 * dpr, radius * 0.095);
  context.beginPath();
  context.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.46})`;
  context.lineWidth = Math.max(0.5 * dpr, radius * 0.07);
  context.beginPath();
  context.ellipse(0, ry * 0.05, rx * 0.68, ry * 0.56, 0, Math.PI * 0.08, Math.PI * 0.92);
  context.stroke();

  context.globalCompositeOperation = 'screen';
  context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.74})`;
  context.beginPath();
  context.ellipse(
    -rx * 0.32,
    -ry * 0.32,
    Math.max(0.34 * dpr, rx * 0.15),
    Math.max(0.18 * dpr, ry * 0.06),
    -0.42,
    0,
    Math.PI * 2
  );
  context.fill();

  if (radius > 3.2 * dpr) {
    context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.42})`;
    context.beginPath();
    context.ellipse(rx * 0.2, -ry * 0.2, rx * 0.05, ry * 0.03, -0.25, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawRainGlassStaticLayer(context, scene, width, height, dpr) {
  if (!scene.staticCanvas) scene.staticCanvas = document.createElement('canvas');
  const layer = scene.staticCanvas;
  if (layer.width !== width || layer.height !== height) {
    layer.width = width;
    layer.height = height;
    scene.staticLayerReady = false;
  }
  if (!scene.staticLayerReady) {
    const layerContext = layer.getContext('2d');
    layerContext.clearRect(0, 0, width, height);
    scene.staticDrops.forEach((drop) => drawRainGlassDropBead(layerContext, drop, drop.x, drop.y, dpr, 0, 1));
    scene.staticLayerReady = true;
  }
  context.drawImage(layer, 0, 0);
}

function drawRainGlassDrop(context, drop, width, height, dpr, t, dt, audio) {
  const sway = Math.sin(t * drop.wobble + drop.phase);
  drop.y += drop.speed * dt * (0.82 + audio.energy * 0.1);
  drop.x += sway * 0.012 * dpr * dt;
  if (drop.y - drop.ry > height + 26 * dpr) resetRainGlassDrop(drop, width, height, dpr, true, true);

  const x = drop.x + sway * drop.drift;
  const y = drop.y;
  if (drop.tail > 0) {
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.lineCap = 'round';
    context.lineWidth = Math.max(0.5 * dpr, drop.rx * 0.14);
    const gradient = context.createLinearGradient(x, y - drop.tail, x, y);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.46, `rgba(18, 23, 25, ${drop.alpha * 0.08})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${drop.alpha * 0.18})`);
    context.strokeStyle = gradient;
    context.beginPath();
    context.moveTo(x - sway * 2 * dpr, y - drop.tail);
    context.quadraticCurveTo(x + sway * 5 * dpr, y - drop.tail * 0.45, x, y - drop.ry * 0.25);
    context.stroke();
    context.restore();
  }

  drawRainGlassDropBead(context, drop, x, y, dpr, t, 1);
}

function clearRainGlassOverlay() {
  const canvas = els.rainGlassCanvas;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (context) context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
}

function drawRainGlassOverlay(scene, width, height, dpr, t, dt, audio) {
  const canvas = els.rainGlassCanvas;
  if (!canvas) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.save();
  context.fillStyle = 'rgba(247, 250, 250, 0.026)';
  context.fillRect(0, 0, width, height);
  const sheen = context.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  sheen.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.76, 'rgba(210, 218, 220, 0.04)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0.07)');
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);
  context.restore();
  drawRainGlassStaticLayer(context, scene, width, height, dpr);
  scene.drops.forEach((drop) => drawRainGlassDrop(context, drop, width, height, dpr, t, dt, audio));
}

function syncRainGlassOverlaySize(width, height) {
  const canvas = els.rainGlassCanvas;
  if (!canvas) return;
  canvas.style.width = `${Math.max(1, Math.round(width / (state.rainGlassScene.dpr || 1)))}px`;
  canvas.style.height = `${Math.max(1, Math.round(height / (state.rainGlassScene.dpr || 1)))}px`;
}

function drawRainGlassScene(context, width, height, dpr) {
  const scene = ensureRainGlassScene(width, height, dpr);
  const now = performance.now();
  const t = now / 1000;
  const dt = scene.lastFrameAt ? clamp((now - scene.lastFrameAt) / 16.67, 0.35, 2.4) : 1;
  scene.lastFrameAt = now;
  const audio = {
    bass: Math.max(state.visual.bass, els.audio.paused ? 0.08 : 0.34),
    high: Math.max(state.visual.presence || state.visual.high || 0, els.audio.paused ? 0.04 : 0.18),
    energy: Math.max(state.visual.energy, els.audio.paused ? 0.12 : 0.42)
  };

  drawRainGlassBackground(context, width, height, dpr, t, audio);
  syncRainGlassOverlaySize(width, height);
  drawRainGlassOverlay(scene, width, height, dpr, t, dt, audio);
}

function drawPlaybackParticles(context, rect, dpr, width, height) {
  const sandboxSceneOwnsFrame = sandboxPlaybackActive();
  if (!sandboxSceneOwnsFrame) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
  }
  updatePlaybackSceneMotion();
  if (sandboxSceneOwnsFrame || isFreeCubePreset()) return;
  if (state.textPreset === 'book') return;
  if (isSonicTopographyPreset()) return;
  if (isCoverParticlePreset()) {
    drawCoverParticleScene(width, height, dpr);
    return;
  }
  if (isRainGlassPreset()) {
    drawRainGlassScene(context, width, height, dpr);
    return;
  }

  const visual = state.playbackVisual;
  updatePlaybackQuality(visual);
  const t = performance.now() / 1000;
  const frameStep = visual.frameStep || 1;
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
    particle.y -= (0.00055 + particle.speed * 0.00082) * speed * (1 + energy * 0.55) * (height / 720) * frameStep;
    particle.x += Math.sin(t * 0.62 + particle.phase) * 0.00065 * speed * frameStep;
    particle.z += Math.cos(t * 0.42 + particle.drift) * 0.0005 * speed * frameStep;
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
  if (!RENDER_PROFILE.ambientStreaks) {
    state.orb.ambientStreaks = [];
    return;
  }
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

function requestOrbFrame() {
  const bootCoveringStage = !!(els.bootScreen && !els.bootScreen.hidden && !bootVisual.entering);
  if (document.hidden || (MOBILE_RENDER_TARGET && bootCoveringStage) || state.sandbox.open || state.orb.animationFrame) return;
  state.orb.animationFrame = window.requestAnimationFrame(drawOrb);
}

function coveredPlaybackCanvasKey() {
  if (!state.playbackPage) return '';
  if (state.diyPreset === 'wallpaper') return 'wallpaper';
  if (sandboxPlaybackActive()) return 'sandbox';
  if (isFreeCubePreset()) return 'free-cubes';
  if (isVoidPrismPreset()) return 'void-prism';
  if (isChladniPreset()) return 'chladni';
  if (isSonicTopographyPreset()) return 'topography';
  if (state.textPreset === 'book') return 'book';
  return '';
}

function clearCoveredPlaybackCanvas(canvas, key) {
  if (!canvas || state.orb.coveredCanvasKey === key) return;
  state.orb.coveredCanvasKey = key;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = renderPixelRatio('playback');
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.clearRect(0, 0, width, height);
}

function drawOrb(now = performance.now()) {
  state.orb.animationFrame = 0;
  if (document.hidden || state.sandbox.open) return;
  syncBookLyricFrame();
  const frameInterval = playbackPresetsUseNativeRefresh()
    ? 0
    : state.orb.dragging ? 16 : RENDER_PROFILE.targetFrameMs;
  if (state.orb.lastPaintAt && now - state.orb.lastPaintAt < frameInterval) {
    requestOrbFrame();
    return;
  }
  state.orb.lastPaintAt = now;
  observeRenderClarityFrame(now);
  const sampleSpectrum = !playbackPresetsUseNativeRefresh()
    || !state.orb.lastSpectrumAt
    || now - state.orb.lastSpectrumAt >= RENDER_PROFILE.targetFrameMs;
  if (sampleSpectrum) {
    state.orb.lastSpectrumAt = now;
    updateAudioSpectrum();
  }
  const canvas = els.canvas;
  const coveredCanvasKey = coveredPlaybackCanvasKey();
  if (coveredCanvasKey) {
    const needsContinuousPlaybackMotion = coveredCanvasKey !== 'wallpaper'
      || textLyricsEnabled()
      || (playbackCardLyricsVisible() && state.lyricLines.length && isPlaybackClockRunning());
    if (needsContinuousPlaybackMotion) updatePlaybackSceneMotion();
    clearCoveredPlaybackCanvas(canvas, coveredCanvasKey);
    state.orb.lastFrameTime = 0;
    if (needsContinuousPlaybackMotion) requestOrbFrame();
    return;
  }
  state.orb.coveredCanvasKey = '';
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
    requestOrbFrame();
    return;
  }

  if (!state.particles.length) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    state.orb.lastFrameTime = 0;
    return;
  }

  updateOrbMotion();
  updateOrbQuality();

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
  ambient.addColorStop(0.46, 'rgba(255, 255, 255, 0.028)');
  ambient.addColorStop(0.68, 'rgba(255, 255, 255, 0.064)');
  ambient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = ambient;
  context.fillRect(0, 0, width, height);

  const voidGradient = context.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius * 0.58);
  voidGradient.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
  voidGradient.addColorStop(0.62, 'rgba(0, 0, 0, 0.62)');
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
          * (0.24 + depth * 0.66 + rim * 0.42)
          * hollow
          * outerFade
          * (0.9 + Math.sin(t * 1.2 + p.phase) * 0.12)
          + interaction * 0.34,
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
    const shouldGlow = RENDER_PROFILE.orbGlow && (p.seed < 0.2 || p.interaction > 0.12);
    context.shadowBlur = shouldGlow ? (2.2 + p.depth * 5.4 + p.interaction * 9) * dpr : 0;
    context.shadowColor = shouldGlow ? `rgba(255, 255, 255, ${alpha * 0.26})` : 'transparent';

    if (p.kind === 'shard') {
      const length = p.shardLength * (0.55 + p.rim * 0.78 + p.interaction * 0.38) * dpr;
      const angle = p.shardAngle + Math.sin(t * 0.32 + p.seed * 12) * 0.28;
      const dx = Math.cos(angle) * length;
      const dy = Math.sin(angle) * length;
      context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.48})`;
      context.lineWidth = Math.max(0.46 * dpr, p.size * 0.34);
      context.beginPath();
      context.moveTo(p.x - dx * 0.5, p.y - dy * 0.5);
      context.lineTo(p.x + dx * 0.5, p.y + dy * 0.5);
      context.stroke();
      continue;
    }

    const core = Math.max(0.34 * dpr, p.size * (p.kind === 'dust' ? 0.34 : 0.58));
    if (p.kind !== 'dust' && (p.rim > 0.45 || p.depth > 0.52 || p.interaction > 0.12)) {
      context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.13})`;
      context.beginPath();
      context.arc(p.x, p.y, core * (2.4 + p.interaction * 1.8), 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = `rgba(244, 248, 250, ${alpha * (p.kind === 'dust' ? 0.58 : 0.96)})`;
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

  requestOrbFrame();
}

function syncElasticRangeVisual(input) {
  if (!input || !input.matches?.('input[type="range"]')) return;
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const range = Number.isFinite(max - min) && max > min ? max - min : 1;
  const progress = clamp(((value - min) / range) * 100, 0, 100);
  input.style.setProperty('--elastic-range-progress', `${progress}%`);
}

function syncElasticRangeVisuals(root = document) {
  root.querySelectorAll?.('input[type="range"]').forEach(syncElasticRangeVisual);
}

function initElasticRangeVisuals() {
  syncElasticRangeVisuals();
  document.addEventListener('input', (event) => {
    syncElasticRangeVisual(event.target);
  }, { passive: true });
}

async function init() {
  initBootScreen();
  initGlassSurfaces();
  initWallpaperAutoSizeObserver();
  initRenderCapabilityBridge();
  applyRuntimeDataset();
  loadWallpaperPrefs();
  applySonicTopographySettings({ persist: false, sync: true, renderConfig: false });
  restoreSandboxDraft();
  await loadBundledSceneLibrary();
  bindEvents();
  bindSandboxEvents();
  bindOrbEvents();
  initElasticRangeVisuals();
  initPlaybackParticles();
  initRenderClarity();
  enterWallpaperHome();
  updateLyricDiyVars();
  initializeTextFontOptions();
  applyTextFontPreference();
  syncTextPaletteControls();
  syncPlaybackLyricPaletteControls();
  updateWallpaperDiyVars();
  updateBookLyricTransform();
  updateBookLyricArtist();
  resetPlaybackView();
  renderCurrent();
  renderSandboxLibrary();
  renderSandboxSceneList();
  renderSandboxPresets();
  syncSandboxFormPresentation();
  setCommunityCardCollapsed(state.community.cardCollapsed);
  renderCommunityBroadcastButton();
  els.audio.volume = Number(els.volumeRange.value) / 100;
  await Promise.allSettled([refreshClientRuntime(), refreshMusicApiProviders({ silent: true }), refreshPlayerState(), refreshVisualBridge(), refreshNativeAudioSample(), refreshLoginStatus(), refreshUserPlaylists(), refreshSandboxPresets({ silent: true })]);
  window.setInterval(refreshNativeAudioSample, MOBILE_RENDER_TARGET ? 120 : 50);
  window.setInterval(refreshVisualBridge, 1000);
  window.setInterval(() => refreshPlayerState().catch(() => {}), 5000);
  window.setInterval(refreshUserPlaylists, 30000);
  window.setInterval(() => refreshCommunityState(state.activeProvider).catch(() => {}), 15000);
  window.setInterval(() => refreshCommunityListenState().catch(() => {}), 5000);
  window.setInterval(() => reportCommunityListening(false).catch(() => {}), 5000);
  requestOrbFrame();
}

function scheduleButtonGlowEnhancement() {
  if (MOBILE_RENDER_TARGET || reducedMotion || RENDER_PROFILE.tier === 'economy') return;
  const load = () => import('./border-glow-buttons.js?v=20260712-ui-performance-audit').catch(() => {});
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(load, { timeout: 2400 });
  } else {
    window.setTimeout(load, 1200);
  }
}

init()
  .then(scheduleButtonGlowEnhancement)
  .catch((error) => toast(error.message));
