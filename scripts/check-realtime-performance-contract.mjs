import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
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
  && /submitSpatialPcm\(\s*session,\s*encodedBlock,\s*framesPerTransportBlock\s*\)/s.test(apiRoutes)
  && /submitSpatialPcm\(long session, ByteBuffer pcm, int frames\)/.test(nativeAudioEngine)
  && /nativeSubmitSpatialPcmDirect\(pcm, frames\)/.test(nativeAudioEngine)
  && /GetDirectBufferAddress\s*\(/.test(nativeBridge);
const nativeSpectrumAvoidsBoxedFloatLists =
  /private\s+static\s+float\[\]\s+lowFrequencyBands/.test(nativeAudioEngine)
  && /float\[\]\s+lowFrequencyBands/.test(nativeAudioEngine)
  && /value\s+instanceof\s+float\[\]\s+array/.test(simpleJson)
  && !/List<Float>\s+lowFrequencyBands/.test(nativeAudioEngine);

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
  nativeSpectrumAvoidsBoxedFloatLists
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
    }
  },
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
