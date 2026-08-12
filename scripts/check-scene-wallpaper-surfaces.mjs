import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const app = read('web/app.js');
const html = read('web/index.html');
const styles = read('web/styles.css');
const chladni = read('web/chladni-runtime.js');
const wallpaperService = read('src/main/java/com/femonster/core/WallpaperService.java');

const syntax = ['web/app.js', 'web/chladni-runtime.js'].map((relativePath) => ({
  relativePath,
  result: spawnSync(process.execPath, ['--check', path.join(root, relativePath)], { encoding: 'utf8' })
}));

const checks = {
  syntax: syntax.every(({ result }) => result.status === 0),
  controlLayer:
    /id="scenePresetSettingsGroup"[\s\S]*id="sceneWallpaperControl"[\s\S]*data-scene-wallpaper-preset/.test(html)
    && /id="sceneWallpaperImportButton"/.test(html)
    && /id="sceneWallpaperImportInput"/.test(html)
    && /id="sceneWallpaperUseCurrentButton"/.test(html)
    && /id="sceneWallpaperRemoveButton"/.test(html)
    && /id="sceneWallpaperSelect"/.test(html)
    && /id="sceneWallpaperOpacityRange"/.test(html),
  perSceneControlHierarchy:
    /id="scenePresetSettingsGroup"[^>]*open[^>]*hidden/.test(html)
    && /id="scenePresetSettingsTitle"/.test(html)
    && /id="scenePresetSettingsMeta"/.test(html)
    && /function\s+syncScenePresetSettingsGroup/.test(app)
    && /syncScenePresetSettingsGroup\(stormOcean,\s*activeScenePreset\)/.test(app)
    && /scene-preset-settings__content\s*>\s*\.scene-wallpaper-control[\s\S]{0,100}order:\s*-20/.test(styles),
  independentPresetPersistence:
    /SCENE_WALLPAPER_PRESETS\s*=\s*Object\.freeze\(\[['"]cover-particles['"],\s*['"]topography['"],\s*['"]chladni['"]\]\)/.test(app)
    && /sceneWallpaperSettings/.test(app)
    && /fe-monster-scene-wallpaper-prefs/.test(app)
    && /enabled[\s\S]{0,180}wallpaperId[\s\S]{0,180}opacity/.test(app),
  softGlowFallback:
    /SCENE_WALLPAPER_SOFT_GLOW_ID/.test(app)
    && /value="soft-glow"[^>]*>[^<]*柔光背景/.test(html)
    && /function\s+selectSoftGlowBackground/.test(app)
    && /sceneWallpaperSelect\.value\s*===\s*SCENE_WALLPAPER_SOFT_GLOW_ID/.test(app),
  reusesWallpaperBackend:
    /function\s+importSceneWallpaperFiles[\s\S]*importWallpaperFiles\(/.test(app)
    && /\/api\/wallpapers\?/.test(app),
  safePreviewOnly:
    /function\s+sceneWallpaperTextureUrl[\s\S]*previewUrl/.test(app)
    && /wallpaper\?\.kind\s*===\s*['"]web['"][\s\S]*previewUrl/.test(app)
    && !/sceneWallpaper[\s\S]{0,160}iframe/i.test(html),
  coverConcaveCanvas:
    /id="coverParticleWallpaperCanvas"/.test(html)
    && /COVER_PARTICLE_WALLPAPER_SEGMENTS\s*=\s*(?:64|72|80|96)/.test(app)
    && /const curveAngle\s*=\s*0\.22/.test(app)
    && /destinationHeight\s*=\s*height \* \(1 - depth \* 0\.02\)/.test(app)
    && /drawCoverParticleWallpaper[\s\S]*drawImage/.test(app)
    && /cover-particle-wallpaper-canvas[\s\S]*z-index:\s*-/.test(styles),
  sonicCurvedSurface:
    /function\s+createSonicWallpaperSurface[\s\S]{0,220}PlaneGeometry\(2,\s*2,\s*80,\s*40\)/.test(app)
    && /function\s+fitSonicWallpaperSurface/.test(app)
    && /camera\.add\(wallpaperSurface\)/.test(app)
    && /camera-deep-concave-contain-dome/.test(app)
    && /const sideWrap\s*=\s*x \* x \* \(0\.26 \+ dome \* 0\.055\)/.test(app)
    && /const midRecline\s*=\s*-v \* 0\.075/.test(app)
    && /const topDome\s*=\s*dome \* dome \* 0\.18/.test(app)
    && /new THREE\.ShaderMaterial/.test(app)
    && /sampleBlurredCover/.test(app)
    && /bottomFeather\s*=\s*smoothstep\(0\.0,\s*0\.28,\s*vUv\.y\)/.test(app)
    && /uContainRegion/.test(app)
    && /uCoverScale/.test(app)
    && /userData\.bottomNdc\s*=\s*-0\.08/.test(app)
    && /userData\.topNdc\s*=\s*1\.08/.test(app)
    && /userData\.verticalCoverage\s*=\s*0\.58/.test(app)
    && /userData\.safeContentScale\s*=\s*0\.9/.test(app)
    && /distance \* 0\.25/.test(app)
    && /viewportAspect \* overscan \/ verticalCoverage/.test(app)
    && /texture\.repeat\.set\(1,\s*1\)/.test(app)
    && /texture\.offset\.set\(0,\s*0\)/.test(app)
    && /wallpaperSurface\.renderOrder\s*=\s*-/.test(app)
    && /function\s+setSonicWallpaperSurface[\s\S]{0,5000}background\.visible\s*=\s*true/.test(app)
    && /function\s+disposeSonicWallpaperSurface[\s\S]*background\.visible\s*=\s*true/.test(app),
  chladniSetWallpaperApi:
    /function\s+setWallpaper\(runtime/.test(chladni)
    && /function\s+createWallpaperSurface[\s\S]{0,220}PlaneGeometry\(2,\s*2,\s*64,\s*36\)/.test(chladni)
    && /function\s+fitWallpaperSurface/.test(chladni)
    && /camera\.add\(wallpaperMesh\)/.test(chladni)
    && /camera-concave-fullscreen/.test(chladni)
    && /x \* x \* 0\.075 \+ y \* y \* 0\.016/.test(chladni)
    && /distance \* 0\.26/.test(chladni)
    && /setWallpaper,/.test(chladni),
  bottomLayerContract:
    [app, chladni].every((source) => /depthTest:\s*false/.test(source) && /depthWrite:\s*false/.test(source))
    && /transparent:\s*true/.test(app)
    && /transparent:\s*true/.test(chladni),
  selectedWallpaperReplacesSoftGlow:
    /function\s+selectWallpaper[\s\S]*setSceneWallpaperForPreset\(\s*state\.scenePreset/.test(app)
    && /coverParticleScene\?*\.classList\.toggle\(['"]has-scene-wallpaper['"]/.test(app)
    && /chladniScene\?*\.classList\.toggle\(['"]has-scene-wallpaper['"]/.test(app)
    && /\.cover-particle-scene\.has-scene-wallpaper::before[\s\S]*opacity:\s*0/.test(styles)
    && /\.chladni-scene\.has-scene-wallpaper::before[\s\S]*opacity:\s*0/.test(styles),
  completeWallpaperThumbnails:
    /\.diy-wallpaper-thumb\s+(?:img|:is\([^)]*img)[\s\S]{0,240}object-fit:\s*contain/.test(styles)
    && /\.diy-wallpaper-item:hover[^{]*\.diy-wallpaper-thumb img[\s\S]{0,120}transform:\s*none/.test(styles),
  wallpaperEngineCatalogAndRuntime:
    /discoverWallpaperEngineRoots\(\)/.test(wallpaperService)
    && /steamapps\\\\workshop\\\\content\\\\431960/.test(wallpaperService)
    && /case\s+"web"[\s\S]*entryUrl/.test(wallpaperService)
    && /case\s+"scene"[\s\S]*requiresNativeEngine/.test(wallpaperService)
    && /function\s+setWallpaperSource[\s\S]*wallpaperRefreshButton\.hidden\s*=\s*false/.test(app)
    && /function\s+refreshWallpapers[\s\S]*requestedSource\s*===\s*['"]live['"]/.test(app)
    && /function\s+applyWallpaperMedia[\s\S]*wallpaperKind\s*===\s*['"]web['"][\s\S]*webEntryUrl/.test(app)
    && /function\s+selectWallpaper[\s\S]*activateNativeWallpaperScene/.test(app),
  textureLifecycle:
    /disposeSonicWallpaperSurface/.test(app)
    && /wallpaperTexture\?\.dispose\?\.\(\)/.test(app)
    && /disposeWallpaper\(runtime\)/.test(chladni)
    && /wallpaperTexture\?\.dispose\?\.\(\)/.test(chladni),
  controlEvents:
    /sceneWallpaperImportButton\.addEventListener\(['"]click['"]/.test(app)
    && /sceneWallpaperImportInput\.addEventListener\(['"]change['"]/.test(app)
    && /sceneWallpaperUseCurrentButton\.addEventListener\(['"]click['"]/.test(app)
    && /sceneWallpaperRemoveButton\.addEventListener\(['"]click['"]/.test(app)
    && /sceneWallpaperEnabledToggle\.addEventListener\(['"]change['"]/.test(app)
    && /sceneWallpaperSelect\.addEventListener\(['"]change['"]/.test(app)
    && /sceneWallpaperOpacityRange\.addEventListener\(['"]input['"]/.test(app),
  restoreAndPresetSwitchLifecycle:
    (app.match(/loadSceneWallpaperPrefs\(\)/g) || []).length >= 2
    && (app.match(/syncAllSceneWallpaperSurfaces\(\)/g) || []).length >= 2
    && /function\s+setDiyPreset[\s\S]*syncSceneWallpaperControl\(\)[\s\S]*syncSceneWallpaperSurface\(state\.diyPreset\)/.test(app)
    && /function\s+buildSonicTopography[\s\S]*syncSceneWallpaperSurface\(['"]topography['"]\)/.test(app)
    && /function\s+buildChladni[\s\S]*syncSceneWallpaperSurface\(['"]chladni['"]\)/.test(app),
  coverCanvasEfficientUpdates:
    /window\.addEventListener\(['"]resize['"][\s\S]*drawCoverParticleWallpaper\(\)/.test(app)
    && /scheduleCoverParticleWallpaperVideoFrame[\s\S]*requestVideoFrameCallback/.test(app)
    && !/function\s+drawCoverParticleScene\([^)]*\)\s*\{[^}]{0,320}drawCoverParticleWallpaper\(\)/.test(app)
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  ok: failed.length === 0,
  failed,
  checks,
  syntaxErrors: syntax
    .filter(({ result }) => result.status !== 0)
    .map(({ relativePath, result }) => ({ relativePath, stderr: result.stderr }))
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
