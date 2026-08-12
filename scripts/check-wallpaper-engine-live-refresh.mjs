import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const wallpaperService = readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'WallpaperService.java'),
  'utf8'
);

const checks = {
  refreshesOnlyWhenRelevant:
    /function\s+sceneWallpaperLiveRefreshActive\([\s\S]*SCENE_WALLPAPER_PRESETS/.test(app)
    && /document\.hidden/.test(app),
  usesSingleBoundedTimer:
    /let\s+sceneWallpaperLiveRefreshTimer\s*=\s*0/.test(app)
    && /SCENE_WALLPAPER_LIVE_REFRESH_MS\s*=\s*[4-9]\d{3}/.test(app)
    && /clearSceneWallpaperLiveRefresh/.test(app),
  forcesCatalogRefresh:
    /refreshSceneWallpaperCatalog\(\{\s*force:\s*true,\s*live:\s*true\s*\}\)/.test(app),
  reappliesEverySupportedSurface:
    /function\s+refreshSceneWallpaperCatalog[\s\S]*syncAllSceneWallpaperSurfaces\(\)/.test(app),
  startsForSupportedPreset:
    /function\s+syncSceneWallpaperControl[\s\S]*syncSceneWallpaperLiveRefresh\(\)/.test(app)
    || /function\s+setDiyPreset[\s\S]*syncSceneWallpaperLiveRefresh\(\)/.test(app),
  pausesWithPageLifecycle:
    /visibilitychange[\s\S]*syncSceneWallpaperLiveRefresh\(\)/.test(app)
    && /pagehide[\s\S]*clearSceneWallpaperLiveRefresh\(\)/.test(app),
  backendAvoidsUnchangedDeepRescan:
    /catalogFingerprint/.test(wallpaperService)
    && /if\s*\([^)]*fingerprint[^)]*cachedWallpaperEngineFingerprint/.test(wallpaperService),
  backendExposesRevision:
    /catalogRevision/.test(wallpaperService)
    && /body\.put\(["']catalogRevision["']/.test(wallpaperService),
  backendReadsCurrentWallpaperEngineSelection:
    /FE_WALLPAPER_ENGINE_CONFIG/.test(wallpaperService)
    && /selectedwallpapers/.test(wallpaperService)
    && /body\.put\(["']activeWallpaperId["']/.test(wallpaperService)
    && /item\.put\(["']active["'],\s*true\)/.test(wallpaperService),
  frontendCanFollowCurrentWallpaper:
    /SCENE_WALLPAPER_ENGINE_CURRENT_ID\s*=\s*['"]wallpaper-engine-current['"]/.test(app)
    && /followWallpaperEngine:\s*source\.followWallpaperEngine\s*===\s*true/.test(app)
    && /function\s+setSceneWallpaperFollowEngine/.test(app)
    && /setting\.followWallpaperEngine[\s\S]*state\.wallpaperEngineActiveId/.test(app),
  activeSelectionRefreshesSupportedSurfaces:
    /payload\.activeWallpaperId/.test(app)
    && /function\s+refreshSceneWallpaperCatalog[\s\S]*syncAllSceneWallpaperSurfaces\(\)/.test(app)
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ pass: failed.length === 0, checks, failed }, null, 2));
assert.deepEqual(failed, []);
