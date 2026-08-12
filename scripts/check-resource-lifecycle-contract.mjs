import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const liquidEther = fs.readFileSync(path.join(root, 'web', 'liquid-ether-switches.js'), 'utf8');
const rhythmGame = fs.readFileSync(path.join(root, 'web', 'rhythm-game.js'), 'utf8');

function functionBody(name) {
  const signature = `function ${name}(`;
  const start = app.indexOf(signature);
  if (start < 0) return '';
  const opening = app.indexOf('{', start + signature.length);
  if (opening < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = opening; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  return '';
}

const disposeCover = functionBody('disposeCoverParticleResources');
const coverVisibility = functionBody('updateCoverParticleVisibility');
const sceneWallpaper = functionBody('syncSceneWallpaperSurface');
const setCoverWallpaper = functionBody('setCoverParticleWallpaper');
const releaseCoverWallpaperCanvas = functionBody('releaseCoverParticleWallpaperCanvas');
const clearRain = functionBody('clearRainGlassOverlay');
const returnHome = functionBody('returnHomePage');
const syncRealtime = functionBody('syncRealtimePolling');
const clearRealtime = functionBody('clearRealtimePolling');
const cancelRecovery = functionBody('cancelStalledAudioPlaybackRecovery');
const togglePlay = functionBody('togglePlay');
const audioContextTransition = functionBody('setAudioAnalysisContextRunning');
const resumeAnalysis = functionBody('resumeAudioAnalysis');
const suspendAnalysis = functionBody('suspendAudioAnalysis');
const coverMotionEnvelope = functionBody('updateCoverParticleMotionEnvelope');
const coverContinuousFrame = functionBody('coverParticleNeedsContinuousFrame');
const drawOrb = functionBody('drawOrb');
const wallpaperLiveRefresh = functionBody('sceneWallpaperLiveRefreshActive');
const backgroundPolling = functionBody('startBackgroundPolling');
const boundedCache = functionBody('setBoundedCacheValue');
const resetRecordingPreview = functionBody('resetRecordingPreview');
const closeRecordingDialog = functionBody('closeRecordingDialog');
const liquidInitialiseStart = liquidEther.indexOf('function initialise()');
const liquidInitialiseEnd = liquidEther.indexOf('window.FeLiquidEtherSwitches', liquidInitialiseStart);
const liquidInitialise = liquidInitialiseStart >= 0 && liquidInitialiseEnd > liquidInitialiseStart
  ? liquidEther.slice(liquidInitialiseStart, liquidInitialiseEnd)
  : '';

const checks = {
  inactiveCoverParticleGpuIsDisposed:
    /gpuGeometry\?\.dispose/.test(disposeCover)
    && /gpuMaterial\?\.dispose/.test(disposeCover)
    && /gpuRenderer\?\.dispose/.test(disposeCover)
    && /cover\.gpuRenderer\s*=\s*null/.test(disposeCover),
  inactiveCoverParticleHeapIsReleased:
    /cover\.particles\s*=\s*\[\]/.test(disposeCover)
    && /cover\.sampleSignature\s*=\s*['"]['"]/.test(disposeCover)
    && /canvas\.width\s*=\s*1/.test(disposeCover)
    && /disposeCoverParticleResources\s*\(\s*\)/.test(coverVisibility),
  hiddenCoverWallpaperDoesNotDecode:
    /coverParticlePresetVisible\s*\(\)/.test(sceneWallpaper)
    && /setCoverParticleWallpaper\s*\(\s*\{\s*enabled:\s*false\s*\}\s*\)/s.test(sceneWallpaper),
  coverWallpaperPendingLoadIsIdempotent:
    /wallpaperSignature\s*===\s*signature/.test(setCoverWallpaper)
    && /wallpaperImage\s*\|\|\s*state\.coverParticle\.wallpaperVideo/.test(setCoverWallpaper)
    && /wallpaperImage\s*=\s*image/.test(setCoverWallpaper),
  disabledCoverWallpaperBackingStoreIsReleased:
    /releaseCoverParticleWallpaperCanvas\s*\(\)/.test(setCoverWallpaper)
    && /canvas\.width\s*=\s*1/.test(releaseCoverWallpaperCanvas)
    && /canvas\.height\s*=\s*1/.test(releaseCoverWallpaperCanvas),
  rainGlassBackingStoresShrinkOnExit:
    /canvas\.width\s*=\s*1/.test(clearRain)
    && /canvas\.height\s*=\s*1/.test(clearRain)
    && /scene\.staticCanvas\s*=\s*null/.test(clearRain)
    && /scene\.drops\s*=\s*\[\]/.test(clearRain)
    && /scene\.backgroundImage\s*=\s*null/.test(clearRain)
    && /clearRainGlassOverlay\s*\(\)/.test(returnHome),
  realtimePollingExistsOnlyDuringPlayback:
    /clearRealtimePolling\s*\(\)/.test(syncRealtime)
    && /realtimePollingActive\s*\(\)/.test(syncRealtime)
    && /setInterval/.test(syncRealtime)
    && /clearInterval/.test(clearRealtime)
    && /nativeAudioActive/.test(syncRealtime)
    && /spatial\.graph\?\.nativeStream/.test(syncRealtime)
    && /audioPlaybackContinuity\.playingIntent/.test(syncRealtime),
  userPauseInvalidatesInFlightRecovery:
    /sourceGeneration\s*\+=\s*1/.test(cancelRecovery)
    && /playingIntent\s*=\s*false/.test(cancelRecovery)
    && /cancelStalledAudioPlaybackRecovery\s*\(\)/.test(togglePlay),
  pausedWebAudioGraphIsSuspended:
    /contextTransition/.test(audioContextTransition)
    && /context\.suspend\s*\(\)/.test(audioContextTransition)
    && /setAudioAnalysisContextRunning\s*\(\s*true\s*\)/.test(resumeAnalysis)
    && /setAudioAnalysisContextRunning\s*\(\s*false\s*\)/.test(suspendAnalysis)
    && /suspendAudioAnalysis\s*\(\)/.test(app),
  bootDefersDecorativeWebgl:
    /addEventListener\("fe-main-entered",\s*startWhenInteractive/.test(liquidEther)
    && /let\s+initialised\s*=\s*false/.test(liquidEther),
  idleCoverParticleRenderingStops:
    /cover\.energy\s*=\s*0/.test(coverMotionEnvelope)
    && /cover\.motionGate\s*=\s*0/.test(coverMotionEnvelope)
    && /isCoverParticlePreset/.test(coverContinuousFrame)
    && /coverParticleNeedsContinuousFrame\(now\)/.test(drawOrb),
  staticCoverParticleGpuFramesAreReused:
    /gpuRenderSignature/.test(app)
    && /if\s*\(cover\.gpuRenderSignature\s*===\s*staticSignature\)\s*return true/.test(app),
  wallpaperEngineScanTracksVisibleSource:
    /activeWallpaperEnginePreset/.test(wallpaperLiveRefresh)
    && /browsingWallpaperEngine/.test(wallpaperLiveRefresh)
    && !/SCENE_WALLPAPER_PRESETS\.some/.test(wallpaperLiveRefresh),
  communitySseAvoidsDuplicateFullPolling:
    /!state\.community\.eventConnected/.test(backgroundPolling)
    && /state\.community\.activeSession/.test(backgroundPolling),
  decorativeWebglIsCreatedOnFirstInteraction:
    /if\s*\(!webglAvailable\)\s*initialiseRenderer\(\)/.test(liquidEther)
    && !/initialiseRenderer\(\)/.test(liquidInitialise),
  longRunningLookupCachesAreBounded:
    /while\s*\(cache\.size\s*>\s*limit\)/.test(boundedCache)
    && /SEARCH_SUGGESTION_CACHE_LIMIT\s*=\s*64/.test(app)
    && /QISHUI_GUEST_MATCH_CACHE_LIMIT\s*=\s*128/.test(app),
  closedRecordingPreviewReleasesDecodedMedia:
    /recordingPreview\.pause\s*\(\s*\)/.test(resetRecordingPreview)
    && /recordingPreview\.removeAttribute\s*\(\s*['"]src['"]\s*\)/.test(resetRecordingPreview)
    && /recordingPreview\.load\s*\(\s*\)/.test(resetRecordingPreview)
    && /resetRecordingPreview\s*\(\s*\)/.test(closeRecordingDialog),
  rhythmGameReleasesHiddenMediaAndCanvas:
    /function\s+releaseBackgroundMedia\s*\(/.test(rhythmGame)
    && /backgroundVideo\.removeAttribute\('src'\)/.test(rhythmGame)
    && /function\s+releaseCanvasBackingStore\s*\(/.test(rhythmGame)
    && /els\.canvas\.width\s*=\s*1/.test(rhythmGame)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
