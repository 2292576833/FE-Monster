import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const app = read('web/app.js');
const desktopLyrics = read('web/desktop-lyrics.html');
const launcher = read('src/main/java/com/femonster/desktop/LocalClientLauncher.java');
const clientOptions = read('native/windows/winforms/ClientOptions.cs');
const nativeClient = read('native/windows/fe_monster_client.cpp');
const borderlessScript = read('scripts/make-window-borderless.ps1');

const result = {
  foregroundUsesNativeRefresh: /function playbackPresetsUseNativeRefresh\(\)\s*\{\s*return !document\.hidden;\s*\}/s.test(app),
  sandboxHasNoFrameInterval: /function sandboxFrameInterval\(\)\s*\{\s*return 0;\s*\}/s.test(app),
  coverParticlesHaveNoPracticalSoftwareCap: /fpsLimit:\s*1000/.test(app)
    && !/fpsLimit:\s*reducedMotion/.test(app),
  playbackLyricsUseNativeFrameClock: /function drawOrb\([\s\S]*?syncBookLyricFrame\(\);[\s\S]*?const frameInterval = playbackPresetsUseNativeRefresh\(\)\s*\?\s*0/s.test(app),
  playbackCardLyricsAvoidFullListFrameWrites: app.includes('list.__qishuiPlaybackLyricLines')
    && app.includes('const updateStart = previousIndexIsValid'),
  desktopLyricsHaveNoActiveFrameInterval: /function frameIntervalMs\(\)\s*\{\s*return 0;\s*\}/s.test(desktopLyrics),
  hiddenPageProtectionRemains: app.includes('if (document.hidden || state.sandbox.open) return;')
    && app.includes('if (document.hidden) {'),
  renderQualityTargetRemainsEnabled: app.includes('targetFrameMs: state.renderClarity.targetFrameMs'),
  javaLauncherUses1600x900: launcher.includes('DEFAULT_WINDOW_WIDTH = 1600')
    && launcher.includes('DEFAULT_WINDOW_HEIGHT = 900'),
  winFormsFallbackUses1600x900: clientOptions.includes('GetInt(values, "--width", 1600)')
    && clientOptions.includes('GetInt(values, "--height", 900)'),
  nativeFallbackUses1600x900: nativeClient.includes('L"--width", 1600')
    && nativeClient.includes('L"--height", 900'),
  borderlessFallbackUses1600x900: /\[int\]\$Width = 1600/.test(borderlessScript)
    && /\[int\]\$Height = 900/.test(borderlessScript)
};

result.ok = Object.values(result).every(Boolean);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
