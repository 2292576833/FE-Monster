import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const app = read('web/app.js');
const desktopLyrics = read('web/desktop-lyrics.html');
const pixelAdventure = read('web/pixel-login-adventure.js');
const rhythmGame = read('web/rhythm-game.js');
const cursorTrails = read('web/cursor-trails.js');
const fallbackBoot = read('web/boot-lightfall-apk.js');
const reactBoot = read('web/boot-lightfall-react.js');
const launcher = read('src/main/java/com/femonster/desktop/LocalClientLauncher.java');
const clientOptions = read('native/windows/winforms/ClientOptions.cs');
const nativeClient = read('native/windows/fe_monster_client.cpp');
const borderlessScript = read('scripts/make-window-borderless.ps1');
const expectedWindowWidth = 1760;
const expectedWindowHeight = 990;

const result = {
  nonPlaybackCanvasWorkUsesMeasuredDisplayBudget:
    /function orbFrameBudgetMs\(\)[\s\S]*?state\.renderClarity\.targetFrameMs/s.test(app)
    && /function orbFrameBudgetMs\(\)[\s\S]*?1000\s*\/\s*120/s.test(app)
    && /function consumeOrbFrameBudget\(now\)[\s\S]*?frameBudgetCarryMs/s.test(app)
    && /function drawOrb\(now = performance\.now\(\)\)[\s\S]*?consumeOrbFrameBudget\(now\)[\s\S]*?requestOrbFrame\(\);[\s\S]*?return;/s.test(app),
  playbackUiAndPresetsBypassSoftwareFrameCap:
    /function playbackFrameRateUncapped\(\)\s*\{\s*return state\.playbackPage\s*&&\s*isPlaybackClockRunning\(\);\s*\}/s.test(app)
    && /function consumeOrbFrameBudget\(now\)\s*\{\s*if \(playbackFrameRateUncapped\(\)\)[\s\S]*?frameBudgetCarryMs\s*=\s*0;\s*return true;[\s\S]*?const budgetMs = orbFrameBudgetMs\(\);/s.test(app)
    && /function updatePlaybackSceneMotion\(\)[\s\S]*?updateDynamicCubeMotion\(\);[\s\S]*?updateFreeCubeMotion\(\);[\s\S]*?updateVoidPrismMotion\(\);[\s\S]*?updateChladniMotion\(\);[\s\S]*?updateSonicTopographyMotion\(\);/s.test(app),
  bootCanvasStopsBehindLightfall:
    /function requestOrbFrame\(\)[\s\S]*?document\.hidden\s*\|\|\s*bootCoveringStage\s*\|\|/s.test(app),
  renderProfilesHaveNoFrameGaps: !/\b(?:cubeFrameGapMs|topographyFrameGapMs)\b/.test(app),
  sandboxHasNoFrameInterval: !/\bsandboxFrameInterval\b/.test(app),
  coverParticlesUseNativeAnimationClock: /fpsLimit:\s*Number\.POSITIVE_INFINITY/.test(app),
  playbackLyricsUseEveryPresentedFrame: /function drawOrb\([\s\S]*?consumeOrbFrameBudget\(now\)[\s\S]*?syncBookLyricFrame\(\);[\s\S]*?observeRenderClarityFrame\(now\);/s.test(app),
  spectrumGraphUsesEveryPresentedFrame:
    /function updateSpectrumUi\(\)[\s\S]*?if \(!state\.runtimeSettingsOpen\) return;[\s\S]*?if \(els\.lowFrequencyGraph\) drawLowFrequencyGraph\(lowFrequency\);/s.test(app),
  spectrumSamplingUsesEveryPresentedFrame: /function drawOrb\([\s\S]*?consumeOrbFrameBudget\(now\)[\s\S]*?updateAudioSpectrum\(\);[\s\S]*?const canvas = els\.canvas;/s.test(app),
  spectrumSmoothingIsRefreshRateIndependent: /const frameResponse = \(baseResponse\) => 1 - Math\.pow\(1 - baseResponse, responseScale\);/.test(app)
    && /silenceFrames \+= responseScale/.test(app),
  playbackCardLyricsAvoidFullListFrameWrites: app.includes('list.__qishuiPlaybackLyricLines')
    && app.includes('const updateStart = previousIndexIsValid'),
  desktopLyricsUseEveryAnimationFrame: !/\b(?:frameIntervalMs|normalizeFrameRate)\b/.test(desktopLyrics)
    && !/\bframeRate\s*:/.test(desktopLyrics),
  pixelAdventureUsesMeasured120FpsBudget: /GAME_TARGET_FPS\s*=\s*120/.test(pixelAdventure)
    && /game\.frameCarry\s*=\s*Math\.min/.test(pixelAdventure)
    && /game\.frameCarry\s*%\=\s*GAME_FRAME_BUDGET_MS/.test(pixelAdventure)
    && /update\(frameStep\)/.test(pixelAdventure),
  rhythmGameUsesMeasured120FpsBudget: /GAME_TARGET_FPS\s*=\s*120/.test(rhythmGame)
    && /game\.frameCarry\s*=\s*Math\.min/.test(rhythmGame)
    && /game\.frameCarry\s*%\=\s*GAME_FRAME_BUDGET_MS/.test(rhythmGame),
  cursorTrailsUseMeasured60FpsBudget: /TRAIL_TARGET_FPS\s*=\s*60/.test(cursorTrails)
    && /frameCarry\s*=\s*Math\.min/.test(cursorTrails)
    && /frameCarry\s*%\=\s*TRAIL_FRAME_BUDGET_MS/.test(cursorTrails),
  reactBootUsesMeasured60FpsBudget: /BOOT_TARGET_FPS\s*=\s*60/.test(reactBoot)
    && /frameCarryRef\.current\s*=\s*Math\.min/.test(reactBoot)
    && /frameCarryRef\.current\s*%\=\s*BOOT_FRAME_BUDGET_MS/.test(reactBoot)
    && /window\.setTimeout/.test(reactBoot)
    && /antialias:\s*false/.test(reactBoot)
    && /powerPreference:\s*'high-performance'/.test(reactBoot),
  reactBootRunsUntilExitWhileVisible:
    !/BOOT_ACTIVE_DURATION_MS/.test(reactBoot)
    && !/freezeToStaticCanvas/.test(reactBoot)
    && /scheduleFrame\s*\(\s*\)/.test(reactBoot)
    && /visibilitychange/.test(reactBoot)
    && /fe-lightfall-stop/.test(reactBoot),
  reactBootVerifiesHardwareD3D11BeforeAnimating:
    /publishBootGraphicsBackend\s*\(\s*gl,\s*canvas\s*\)/.test(reactBoot)
    && /direct3d11\|d3d11/.test(reactBoot)
    && /warp\|reference/.test(reactBoot)
    && /graphicsBackend\.requested\s*&&\s*!graphicsBackend\.hardwareD3D11/.test(reactBoot),
  fallbackBootUsesMeasured60FpsBudget: /BOOT_TARGET_FPS\s*=\s*60/.test(fallbackBoot)
    && /frameCarry\s*=\s*Math\.min/.test(fallbackBoot)
    && /frameCarry\s*%\=\s*BOOT_FRAME_BUDGET_MS/.test(fallbackBoot)
    && /window\.setTimeout/.test(fallbackBoot)
    && /if\s*\(document\.hidden\)/.test(fallbackBoot)
    && !/BOOT_ACTIVE_DURATION_MS/.test(fallbackBoot)
    && /fe-lightfall-stop/.test(fallbackBoot),
  highRefreshLyricScrollHasNoMinimumStep: /BOOK_LYRIC_SCROLL_MIN_STEP_SECONDS = 0;/.test(app),
  hiddenPageProtectionRemains: app.includes('if (document.hidden || bootCoveringStage || state.sandbox.open)')
    && app.includes('if (document.hidden) {'),
  renderQualityTargetRemainsEnabled: app.includes('targetFrameMs: state.renderClarity.targetFrameMs'),
  javaLauncherUsesExpandedWindow: launcher.includes(`DEFAULT_WINDOW_WIDTH = ${expectedWindowWidth}`)
    && launcher.includes(`DEFAULT_WINDOW_HEIGHT = ${expectedWindowHeight}`),
  winFormsFallbackUsesExpandedWindow: clientOptions.includes(`GetInt(values, "--width", ${expectedWindowWidth})`)
    && clientOptions.includes(`GetInt(values, "--height", ${expectedWindowHeight})`),
  nativeFallbackUsesExpandedWindow: nativeClient.includes(`L"--width", ${expectedWindowWidth}`)
    && nativeClient.includes(`L"--height", ${expectedWindowHeight}`),
  borderlessFallbackUsesExpandedWindow: new RegExp(`\\[int\\]\\$Width = ${expectedWindowWidth}`).test(borderlessScript)
    && new RegExp(`\\[int\\]\\$Height = ${expectedWindowHeight}`).test(borderlessScript),
  expandedWindowRetainsSixteenByNine:
    expectedWindowWidth * 9 === expectedWindowHeight * 16
    && expectedWindowWidth > 1600
    && expectedWindowHeight > 900
};

result.ok = Object.values(result).every(Boolean);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
