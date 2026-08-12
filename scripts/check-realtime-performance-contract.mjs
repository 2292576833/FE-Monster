import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const renderQuality = readFileSync(path.join(root, 'web', 'render-quality.js'), 'utf8');
const stormOceanRuntime = readFileSync(path.join(root, 'web', 'storm-ocean-runtime.js'), 'utf8');
const liquidEtherSwitches = readFileSync(path.join(root, 'web', 'liquid-ether-switches.js'), 'utf8');
const pcmWorklet = readFileSync(
  path.join(root, 'web', 'vendor', 'native-spatial', 'native-pcm-worklet.js'),
  'utf8'
);
const apiRoutes = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'),
  'utf8'
);
const nativeAudioEngine = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java'),
  'utf8'
);
const musicApiConfigService = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'music', 'MusicApiConfigService.java'),
  'utf8'
);
const simpleJson = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'json', 'SimpleJson.java'),
  'utf8'
);
const nativeBridge = readFileSync(
  path.join(root, 'native', 'windows', 'fe_monster_xaudio2.cpp'),
  'utf8'
);
const nativePipeline = readFileSync(
  path.join(root, 'native', 'windows', 'audio', 'fe_audio_pipeline.cpp'),
  'utf8'
);
const javaApp = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'FeMonsterJavaApp.java'),
  'utf8'
);
const appContext = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'AppContext.java'),
  'utf8'
);
const providerRegistry = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'music', 'MusicProviderRegistry.java'),
  'utf8'
);
const windowsHost = readFileSync(
  path.join(root, 'native', 'windows', 'winforms', 'FeMonsterForm.cs'),
  'utf8'
);
const legacyWindowsHost = readFileSync(
  path.join(root, 'native', 'windows', 'fe_monster_client.cpp'),
  'utf8'
);
const windowsProgram = readFileSync(
  path.join(root, 'native', 'windows', 'winforms', 'Program.cs'),
  'utf8'
);
const localClientLauncher = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'desktop', 'LocalClientLauncher.java'),
  'utf8'
);

function functionBlock(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!match) return '';
  const openingParenthesis = source.indexOf('(', match.index);
  let parenthesisDepth = 0;
  let closingParenthesis = -1;
  for (let index = openingParenthesis; index < source.length; index += 1) {
    if (source[index] === '(') parenthesisDepth += 1;
    else if (source[index] === ')') {
      parenthesisDepth -= 1;
      if (parenthesisDepth === 0) {
        closingParenthesis = index;
        break;
      }
    }
  }
  const openingBrace = source.indexOf('{', closingParenthesis + 1);
  if (openingBrace < 0) return '';
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return '';
}

function numericMatch(source, pattern) {
  const match = pattern.exec(source);
  return match ? Number(match[1]) : Number.NaN;
}

const lyricHotPathNames = [
  'syncPlaybackLyricAnimationFrame',
  'syncPlaybackLyricAtTime',
  'updatePlaybackLyricAtTime',
  'findLyricIndexAtTime',
  'lyricProgressForLineAtTime',
  'setPlaybackLyricLine',
  'updateBookLyricLines',
  'qishuiPlaybackBookFrame',
  'updateQishuiPlaybackLyrics'
];
const lyricHotPath = Object.fromEntries(
  lyricHotPathNames.map((name) => [name, functionBlock(app, name)])
);
const qishuiLyricUpdate = lyricHotPath.updateQishuiPlaybackLyrics;
const qishuiStructuralStart = qishuiLyricUpdate.indexOf(
  'if (cardState.lyricBookIndex !== activeIndex)'
);
const qishuiSteadyStateStart = qishuiLyricUpdate.indexOf(
  'let current = cardState.lyricBookCurrentLine',
  qishuiStructuralStart
);
const qishuiStructuralTransforms = qishuiStructuralStart >= 0 && qishuiSteadyStateStart > qishuiStructuralStart
  ? qishuiLyricUpdate.slice(qishuiStructuralStart, qishuiSteadyStateStart)
  : '';
const qishuiSteadyState = qishuiSteadyStateStart >= 0
  ? qishuiLyricUpdate.slice(qishuiSteadyStateStart)
  : qishuiLyricUpdate;
const lyricTransformViolations = Object.entries(lyricHotPath)
  .filter(([name]) => name !== 'updateQishuiPlaybackLyrics')
  .flatMap(([name, source]) => [...source.matchAll(/\.(map|filter|sort)\s*\(/g)]
    .map((match) => `${name}.${match[1]}`));
const qishuiSteadyStateTransformViolations = [
  ...qishuiSteadyState.matchAll(/\.(map|filter|sort)\s*\(/g)
].map((match) => `updateQishuiPlaybackLyrics.${match[1]}`);
const qishuiStructuralTransformsAreGuarded = qishuiStructuralStart >= 0
  && qishuiSteadyStateStart > qishuiStructuralStart
  && /\.(?:map|filter)\s*\(/.test(qishuiStructuralTransforms)
  && qishuiSteadyStateTransformViolations.length === 0;

const nativeSampleRefresh = functionBlock(app, 'refreshNativeAudioSample');
const audioSpectrumUpdate = functionBlock(app, 'updateAudioSpectrum');
const audioBridgePayloadApply = functionBlock(app, 'applyAudioBridgePayload');
const bookLyricArtistUpdate = functionBlock(app, 'updateBookLyricArtist');
const multiRowControlSync = functionBlock(app, 'syncMultiRowLyricsControl');
const multiRowRender = functionBlock(app, 'renderMultiRowLyrics');
const nativeSampleApiIndex = nativeSampleRefresh.indexOf("apiJson('/api/audio/sample')");
const nativeSampleBeforeRequest = nativeSampleApiIndex >= 0
  ? nativeSampleRefresh.slice(0, nativeSampleApiIndex)
  : '';
const nativeSampleAfterRequest = nativeSampleApiIndex >= 0
  ? nativeSampleRefresh.slice(nativeSampleApiIndex)
  : '';
const nativeSampleGuardPattern = /(?:native\w*audio\w*sample\w*(?:request|pending|promise|inFlight)|(?:request|pending|promise|inFlight)\w*native\w*audio\w*sample)/i;
const nativeSampleGuardedBeforeRequest = nativeSampleGuardPattern.test(nativeSampleBeforeRequest)
  && /\bif\s*\(/.test(nativeSampleBeforeRequest);
const nativeSampleGuardReleased = /\bfinally\b/.test(nativeSampleAfterRequest)
  && nativeSampleGuardPattern.test(nativeSampleAfterRequest);

const wallpaperSave = functionBlock(app, 'saveWallpaperPrefs');
const sonicSave = functionBlock(app, 'saveSonicSettingsPreferences');
const visualSaveDebounceMs = numericMatch(
  app,
  /VISUAL_PREFERENCE_SAVE_DEBOUNCE_MS\s*=\s*(\d+)/
);
const wallpaperSaveIsDebounced = /clearTimeout\s*\(/.test(wallpaperSave)
  && /setTimeout\s*\(/.test(wallpaperSave)
  && /localStorage\.setItem\(WALLPAPER_PREFS_KEY/.test(wallpaperSave)
  && /VISUAL_PREFERENCE_SAVE_DEBOUNCE_MS/.test(wallpaperSave);
const sonicSaveIsDebounced = /clearTimeout\s*\(/.test(sonicSave)
  && /setTimeout\s*\(/.test(sonicSave)
  && /localStorage\.setItem\(SONIC_SETTINGS_PREFS_KEY/.test(sonicSave)
  && /(?:VISUAL_PREFERENCE_SAVE_DEBOUNCE_MS|SONIC_[A-Z_]*SAVE[A-Z_]*_MS|\b1[0-9]{2}\b)/.test(sonicSave);

const workletTransportFrames = numericMatch(
  pcmWorklet,
  /FE_NATIVE_PCM_TRANSPORT_FRAMES\s*=\s*(\d+)/
);
const javaTransportFrames = numericMatch(
  apiRoutes,
  /framesPerTransportBlock\s*=\s*(\d+)/
);
const nativeRenderFrames = numericMatch(
  nativePipeline,
  /kFramesPerRenderBlock\s*=\s*(\d+)/
);
const transportAndRenderAreDeliberatelyLayered = workletTransportFrames === 4096
  && javaTransportFrames === 4096
  && nativeRenderFrames === 256
  && /while\s*\(source_offset\s*<\s*frame_count\)/.test(nativePipeline)
  && /std::min\(\s*kFramesPerRenderBlock,\s*frame_count\s*-\s*source_offset\s*\)/s.test(nativePipeline)
  && /ObrImpl>[\s\S]{0,160}kFramesPerRenderBlock/.test(nativePipeline);
const transportUsesDirectJniBuffer = /ByteBuffer[\s\S]{0,120}allocateDirect\s*\(/.test(apiRoutes)
  && /submitSpatialPcm\(\s*session,\s*generation,\s*encodedBlock,\s*framesPerTransportBlock\s*\)/s.test(apiRoutes)
  && /submitSpatialPcm\(long session, long generation, ByteBuffer pcm, int frames\)/.test(nativeAudioEngine)
  && /nativeSubmitSpatialPcmDirect\(pcm, frames\)/.test(nativeAudioEngine)
  && /GetDirectBufferAddress\s*\(/.test(nativeBridge);
const nativeSpectrumAvoidsBoxedFloatLists =
  /private\s+static\s+float\[\]\s+lowFrequencyBands/.test(nativeAudioEngine)
  && /float\[\]\s+lowFrequencyBands/.test(nativeAudioEngine)
  && /value\s+instanceof\s+float\[\]\s+array/.test(simpleJson)
  && !/List<Float>\s+lowFrequencyBands/.test(nativeAudioEngine);
const jarArgumentIndex = windowsProgram.indexOf('startInfo.ArgumentList.Add("-jar")');
const initialHeapArgumentIndex = windowsProgram.indexOf('startInfo.ArgumentList.Add("-Xms64m")');
const maximumHeapArgumentIndex = windowsProgram.indexOf('startInfo.ArgumentList.Add("-Xmx512m")');
const windowsBrowserArgumentsIndex = windowsHost.indexOf('BuildBrowserArguments()');
const windowsBrowserArguments = windowsBrowserArgumentsIndex >= 0
  ? windowsHost.slice(windowsBrowserArgumentsIndex, windowsBrowserArgumentsIndex + 900)
  : '';
const localLaunchFlagsIndex = localClientLauncher.indexOf('launchFlags(Map<String, Object> settings)');
const localLaunchFlags = localLaunchFlagsIndex >= 0
  ? localClientLauncher.slice(localLaunchFlagsIndex, localLaunchFlagsIndex + 900)
  : '';
const softwareRendererSignature =
  'swiftshader|llvmpipe|lavapipe|software|microsoft basic render|warp|reference';
const heavyWebGLSceneBuilders = [
  'buildDynamicCube',
  'buildFreeCube',
  'buildVoidPrism',
  'buildChladni',
  'buildSonicTopography',
  'initSandboxRenderer',
  'initSandboxPreviewRenderer'
].map((name) => functionBlock(app, name));

const checks = {
  lyricHighlightHotPathFunctionsPresent:
    Object.values(lyricHotPath).every((source) => source.length > 0),
  lyricHighlightHotPathAvoidsMapFilterSort:
    lyricTransformViolations.length === 0
    && qishuiStructuralTransformsAreGuarded,
  nativeSampleRequestHasSingleFlightGuard:
    nativeSampleApiIndex >= 0
    && nativeSampleGuardedBeforeRequest
    && nativeSampleGuardReleased,
  nativeSpectrumAppliesOnlyWhenFreshPayloadArrives:
    /applyBridgeVisual\s*\(\s*\)/.test(audioBridgePayloadApply)
    && !/applyBridgeVisual\s*\(\s*\)/.test(
      audioSpectrumUpdate.slice(
        audioSpectrumUpdate.indexOf('if (state.clientRuntime.nativeAudioActive'),
        audioSpectrumUpdate.indexOf('if (!analysis.analyser')
      )
    ),
  lyricMetadataSkipsUnchangedDomWrites:
    /__bookLyricArtistText/.test(bookLyricArtistUpdate)
    && /hidden\s*!==\s*hidden/.test(bookLyricArtistUpdate)
    && /__multiRowControlSignature/.test(multiRowControlSync),
  multiRowSteadyStateReusesCurrentNodes:
    /list\.__multiRowCurrentLine/.test(multiRowRender)
    && /current\.__multiRowMain/.test(multiRowRender)
    && /current\.__multiRowTranslation/.test(multiRowRender),
  wallpaperPreferenceWritesAreDebounced:
    Number.isFinite(visualSaveDebounceMs)
    && visualSaveDebounceMs >= 100
    && visualSaveDebounceMs <= 500
    && wallpaperSaveIsDebounced,
  sonicPreferenceWritesAreDebounced:
    sonicSaveIsDebounced,
  nativePcmUses4096TransportAnd256RenderQuantum:
    transportAndRenderAreDeliberatelyLayered,
  nativePcmTransportUsesDirectJniBuffer:
    transportUsesDirectJniBuffer,
  nativeSpectrumAvoidsBoxedFloatLists,
  musicProviderSidecarsStartOnFirstUse:
    !/context\.musicApis\.startAutostart\s*\(\s*\)/.test(javaApp)
    && /Consumer<String>\s+providerAccess/.test(providerRegistry)
    && /PROVIDER_ACCESS_RECHECK_NANOS/.test(providerRegistry)
    && /providerAccessAt\.putIfAbsent\(id, now\)/.test(providerRegistry)
    && /providerAccessAt\.replace\(id, previous, now\)/.test(providerRegistry)
    && /now - previous < PROVIDER_ACCESS_RECHECK_NANOS/.test(providerRegistry)
    && /providerAccess\.accept\(id\)/.test(providerRegistry)
    && /musicApis\.awaitReady\(provider, Duration\.ofSeconds\(7\)\)/.test(appContext)
    && /public boolean awaitReady\(String provider, Duration timeout\)[\s\S]*?ensureStarted\(id\)/s.test(musicApiConfigService),
  musicProviderUiWorkWaitsForBootEntry:
    /servicesStarted:\s*false/.test(app)
    && /void\s+startInteractiveRuntime\s*\(\s*\)/.test(functionBlock(app, 'enterMainFromBoot'))
    && /if\s*\(\s*document\.hidden\s*\|\|\s*!bootVisual\.servicesStarted\s*\)\s*return/.test(
      functionBlock(app, 'startBackgroundPolling')
    )
    && !/refreshLoginStatus\s*\(\s*\)[\s\S]*refreshUserPlaylists\s*\(\s*\)/.test(
      functionBlock(app, 'init')
        .slice(functionBlock(app, 'init').indexOf('Promise.allSettled'))
    )
    && !/startInteractiveRuntime\s*\(\s*\)/.test(functionBlock(app, 'init')),
  desktopJavaHeapIsBounded:
    initialHeapArgumentIndex >= 0
    && maximumHeapArgumentIndex > initialHeapArgumentIndex
    && jarArgumentIndex > maximumHeapArgumentIndex,
  windowsRenderHostForcesAngleD3D11:
    /--enable-gpu-rasterization/.test(windowsBrowserArguments)
    && /--enable-accelerated-2d-canvas/.test(windowsBrowserArguments)
    && /--use-gl=angle/.test(windowsBrowserArguments)
    && /--use-angle=d3d11/.test(windowsBrowserArguments)
    && /--force_high_performance_gpu/.test(windowsBrowserArguments)
    && /--disable-software-rasterizer/.test(windowsBrowserArguments)
    && !/--force-high-performance-gpu/.test(windowsBrowserArguments)
    && !/--disable-gpu/.test(windowsBrowserArguments)
    && /--use-angle=d3d11/.test(localLaunchFlags)
    && /--force_high_performance_gpu/.test(localLaunchFlags)
    && /--disable-software-rasterizer/.test(localLaunchFlags)
    && !/--force-high-performance-gpu/.test(localLaunchFlags)
    && !/--disable-gpu/.test(localLaunchFlags)
    && /WebView2EnvironmentOptions/.test(legacyWindowsHost)
    && /--use-angle=d3d11/.test(legacyWindowsHost)
    && /--disable-software-rasterizer/.test(legacyWindowsHost),
  webRuntimeVerifiesHardwareD3D11:
    /function\s+directX11HardwareRendererActive\s*\(/.test(app)
    && /(?:direct3d11|d3d11)/i.test(functionBlock(app, 'directX11HardwareRendererActive'))
    && /function\s+syncGraphicsBackendStatus\s*\(/.test(app)
    && /dataset\.graphicsBackend/.test(functionBlock(app, 'syncGraphicsBackendStatus'))
    && /syncGraphicsBackendStatus\s*\(\s*\)/.test(functionBlock(app, 'captureWebGLContextInfo')),
  softwareRendererDetectionRejectsWarpAndLavapipe:
    app.includes(softwareRendererSignature)
    && renderQuality.includes(softwareRendererSignature)
    && stormOceanRuntime.includes(softwareRendererSignature),
  requestedD3D11FailsClosedBeforeHeavyWebGL:
    heavyWebGLSceneBuilders.every((source) => /heavyWebGLRenderingAllowed\s*\(\s*\)/.test(source))
    && /failIfMajorPerformanceCaveat:\s*true/.test(functionBlock(app, 'probeRequestedDirectX11Renderer'))
    && /failIfMajorPerformanceCaveat:[\s\S]{0,80}directX11Requested\s*\(\s*\)/.test(
      functionBlock(app, 'createDirectX11Renderer')
    )
    && /renderer\.dispose/.test(functionBlock(app, 'createDirectX11Renderer'))
    && /probeRequestedDirectX11Renderer\s*\(\s*\)/.test(functionBlock(app, 'init')),
  safeFallbackCapsManualClarity:
    /renderClaritySafetyCeiling\s*\(\s*\)/.test(functionBlock(app, 'effectiveRenderClarityPercent'))
    && /\.max\s*=\s*String\(renderClaritySafetyCeiling\s*\(\s*\)\)/.test(functionBlock(app, 'syncRenderClarityControls')),
  coverCanvasFallbackHasStrictWorkCaps:
    /COVER_PARTICLE_CPU_FALLBACK_MAX_PARTICLES\s*=\s*4096/.test(app)
    && /COVER_PARTICLE_CPU_FALLBACK_MAX_FPS\s*=\s*30/.test(app)
    && /fallbackLastFrameAt/.test(functionBlock(app, 'drawCoverParticleScene'))
    && /fallbackParticleLimit/.test(functionBlock(app, 'drawCoverParticleScene')),
  liquidEtherRequestsAndRequiresHighPerformanceGpu:
    /powerPreference:\s*["']high-performance["']/.test(liquidEtherSwitches)
    && /graphicsBackend\.hardwareD3D11\s*!==\s*true/.test(liquidEtherSwitches)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  checks,
  evidence: {
    lyricHotPathNames,
    lyricTransformViolations,
    qishuiSteadyStateTransformViolations,
    qishuiStructuralTransformsAreGuarded,
    nativeSample: {
      endpointPresent: nativeSampleApiIndex >= 0,
      guardBeforeRequest: nativeSampleGuardedBeforeRequest,
      guardReleasedInFinally: nativeSampleGuardReleased
    },
    persistence: {
      debounceMs: visualSaveDebounceMs,
      wallpaperSaveIsDebounced,
      sonicSaveIsDebounced
    },
    audioFrames: {
      workletTransport: workletTransportFrames,
      javaTransport: javaTransportFrames,
      nativeObrRender: nativeRenderFrames,
      directJni: transportUsesDirectJniBuffer,
      boxedSpectrumFloats: !nativeSpectrumAvoidsBoxedFloatLists
    },
    startup: {
      eagerMusicAutostart: /context\.musicApis\.startAutostart\s*\(\s*\)/.test(javaApp),
      initialHeapArgumentIndex,
      maximumHeapArgumentIndex,
      jarArgumentIndex
    },
    graphics: {
      windowsBrowserArgumentsPresent: windowsBrowserArguments.length > 0,
      localLaunchFlagsPresent: localLaunchFlags.length > 0,
      runtimeHardwareVerification: /function\s+directX11HardwareRendererActive\s*\(/.test(app)
    }
  },
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
