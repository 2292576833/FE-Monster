import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('web/index.html');
const css = read('web/styles.css');
const app = read('web/app.js');
const form = read('native/windows/winforms/FeMonsterForm.cs');
const hostPath = path.join(root, 'native', 'windows', 'winforms', 'DesktopSceneHost.cs');
const host = fs.existsSync(hostPath) ? fs.readFileSync(hostPath, 'utf8') : '';

const checks = {
  mappingToggleExists:
    /id="qishuiPlaybackDesktopToggle"/.test(html)
    && /aria-pressed="false"/.test(html),
  frontendPostsDedicatedNativeMessage:
    /type:\s*['"]fe-desktop-scene['"]/.test(app)
    && /desktopSceneSnapshot/.test(app),
  snapshotCarriesSceneAndTextState:
    /diyPreset/.test(app)
    && /textPreset/.test(app)
    && /sonicSettings/.test(app)
    && /sandboxPresetId/.test(app)
    && /textTransforms:\s*\{/.test(app),
  snapshotCarriesLiveLyrics:
    /lyricPlayback:\s*\{/.test(app)
    && /lines:\s*Array\.isArray\(state\.lyricLines\)/.test(app)
    && /displayText:\s*state\.lyricDisplayText/.test(app)
    && /bilingualLyricsEnabled:\s*state\.bilingualLyricsEnabled/.test(app),
  desktopClientAppliesSceneTextPreset:
    /enterDiyScenePresetPlayback\(sandboxPresetId\);\s*setTextPreset\(snapshot\.textPreset/.test(app),
  desktopClientUsesMappedPlaybackState:
    /async function refreshPlayerState\(\) {\s*if \(DESKTOP_SCENE_CLIENT\) return;/.test(app)
    && /updatePlayerClock\(/.test(app)
    && /setPlaybackLyricLine\(\s*lyricPlayback\.displayText/.test(app),
  liveLyricChangesPublishSnapshots:
    /if \(lineChanged \|\| subtitleChanged\) scheduleDesktopSceneSnapshot\(\)/.test(app)
    && /function updateBookEffectTextTransform\(\)[\s\S]*?scheduleDesktopSceneSnapshot\(\)/.test(app)
    && /function updateChladniTextTransform\(\)[\s\S]*?scheduleDesktopSceneSnapshot\(\)/.test(app),
  desktopClientReceivesLiveUpdates:
    /clientMode.*desktop-scene|DESKTOP_SCENE_CLIENT/.test(app)
    && /BroadcastChannel/.test(app)
    && /applyDesktopSceneSnapshot/.test(app),
  desktopClientOnlyShowsProjectionSurface:
    /data-fe-client/.test(html)
    && /html\[data-fe-client=['"]desktop-scene['"]\]/.test(css),
  mainWindowHandlesDesktopSceneMessage:
    /fe-desktop-scene/.test(form)
    && /DesktopSceneHost/.test(form),
  nativeHostUsesWorkerW:
    /class DesktopSceneHost/.test(host)
    && /WorkerW/.test(host)
    && /SHELLDLL_DefView/.test(host)
    && /SetParent/.test(host)
    && /0x052C/i.test(host),
  nativeHostIsClickThroughAndDisposable:
    /WS_EX_TRANSPARENT/.test(host)
    && /WS_EX_NOACTIVATE/.test(host)
    && /Dispose/.test(host)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
