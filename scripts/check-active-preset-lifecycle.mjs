import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

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

const ensureRuntime = functionBody('ensureActivePresetRuntime');
const ensureRuntimeScript = functionBody('ensurePresetRuntime');
const setPreset = functionBody('setDiyPreset');
const disposeCover = functionBody('disposeCoverParticleResources');
const updateCoverImage = functionBody('updateCoverParticleImage');
const renderWallpapers = functionBody('renderWallpaperList');
const releaseWallpaper = functionBody('releaseWallpaperMedia');
const wallpaperVisibility = functionBody('updateWallpaperVisibility');
const sceneMotion = functionBody('updatePlaybackSceneMotion');

const eagerRuntimeScripts = [
  'storm-ocean-runtime.js',
  'free-cube-runtime.js',
  'void-prism-runtime.js',
  'chladni-runtime.js'
];

const checks = {
  inactiveRuntimeScriptsAreNotEagerLoaded:
    eagerRuntimeScripts.every((source) => !html.includes(`<script src="${source}`)),
  activeRuntimeUsesSingleFlightLoader:
    /PRESET_RUNTIME_SOURCES/.test(app)
    && /presetRuntimePromises\.has/.test(ensureRuntimeScript)
    && /loadScriptOnce/.test(ensureRuntimeScript)
    && /presetRuntimeActivationToken/.test(ensureRuntime),
  hiddenPlaybackDoesNotFetchPresetRuntime:
    /!runtimeKey\s*\|\|\s*!state\.playbackPage/.test(ensureRuntime),
  playbackEntryLoadsOnlyCurrentRuntime:
    /function\s+enterPlaybackPage\(\)[\s\S]*?ensureActivePresetRuntime\(state\.diyPreset,\s*activationToken\)/.test(app),
  staleRuntimeActivationCannotMount:
    /const\s+activationToken\s*=\s*\+\+presetRuntimeActivationToken/.test(app)
    && /activationToken\s*!==\s*presetRuntimeActivationToken[\s\S]{0,120}state\.diyPreset\s*!==\s*preset/.test(app),
  inactiveCoverDoesNotDecodeSongArt:
    /coverParticlePresetVisible\s*\(\s*\)/.test(updateCoverImage),
  coverSongArtIsReleasedOnExit:
    /cover\.image\.onload\s*=\s*null/.test(disposeCover)
    && /cover\.image\.onerror\s*=\s*null/.test(disposeCover)
    && /cover\.image\s*=\s*null/.test(disposeCover)
    && /cover\.imageSignature\s*=\s*['"]['"]/.test(disposeCover),
  wallpaperCatalogDoesNotLoadHiddenFullMedia:
    /wallpaperPresetVisible\s*\(\s*\)/.test(renderWallpapers)
    && /applyWallpaperMedia\s*\(\s*active\s*\)/.test(renderWallpapers),
  wallpaperMediaIsFullyReleasedOnExit:
    /wallpaperImage\.removeAttribute\s*\(\s*['"]src['"]\s*\)/.test(releaseWallpaper)
    && /wallpaperVideo\.removeAttribute\s*\(\s*['"]src['"]\s*\)/.test(releaseWallpaper)
    && /wallpaperVideo\.load\s*\(\s*\)/.test(releaseWallpaper)
    && /unloadWallpaperWebFrame\s*\(\s*\)/.test(releaseWallpaper)
    && /releaseWallpaperMedia\s*\(\s*\)/.test(wallpaperVisibility),
  frameLoopDispatchesOnlyCurrentPreset:
    /switch\s*\(\s*state\.diyPreset\s*\)/.test(sceneMotion)
    && !/updateDynamicCubeMotion\s*\(\s*\)\s*;\s*updateFreeCubeMotion/s.test(sceneMotion)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
