import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('web/app.js');
const html = read('web/index.html');
const styles = read('web/styles.css');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const service = read('src/main/java/com/femonster/core/WallpaperService.java');

const checks = {
  webFrameExists:
    /id="wallpaperWebFrame"/.test(html)
    && /sandbox="[^"]*allow-scripts[^"]*"/.test(html),
  webWallpaperUsesEntry:
    /wallpaperKind\s*===\s*['"]web['"]/.test(app)
    && /wallpaper\??\.entryUrl/.test(app)
    && /wallpaperWebFrame/.test(app),
  webFrameUnloadsWhenHidden:
    /function\s+unloadWallpaperWebFrame/.test(app)
    && (
      /updateWallpaperVisibility[\s\S]*unloadWallpaperWebFrame/.test(app)
      || (
        /updateWallpaperVisibility[\s\S]{0,900}releaseWallpaperMedia/.test(app)
        && /function\s+releaseWallpaperMedia[\s\S]{0,900}unloadWallpaperWebFrame/.test(app)
      )
    ),
  sceneUsesNativeActivation:
    /wallpaper\.kind\s*===\s*['"]scene['"]/.test(app)
    && /\/api\/wallpapers\/activate/.test(app)
    && /previewUrl/.test(app),
  activationEndpoint:
    /["']\/api\/wallpapers\/activate["']/.test(routes)
    && /wallpapers\.activate/.test(routes)
    && /requireLocalWallpaperControl\(exchange\)/.test(routes),
  importedWallpaperIsBoundedAndSameOrigin:
    /if\s*\(\s*["']\/api\/wallpapers\/import["']\.equals\(path\)\s*\)[\s\S]{0,420}requireLocalWallpaperControl\(exchange\)/.test(routes)
    && /WallpaperService\.MAX_IMPORT_BYTES/.test(routes)
    && /MAX_IMPORT_BYTES\s*=\s*512L\s*\*\s*1024L\s*\*\s*1024L/.test(service)
    && /read\s*>\s*MAX_IMPORT_BYTES\s*-\s*total/.test(service),
  sceneInventoryEndpoint:
    /["']\/api\/wallpapers\/scene["']/.test(routes)
    && /wallpapers\.sceneInventory/.test(routes)
    && /intParam\(query,\s*["']offset["'],\s*0,\s*0,\s*16_384\)/.test(routes)
    && /sceneInventoryUrl/.test(service),
  safeEngineCommand:
    /Map<String,\s*Object>\s+activate\s*\(/.test(service)
    && /ProcessBuilder/.test(service)
    && /openWallpaper/.test(service)
    && /project\.launchFile\(\)\.toString\(\)/.test(service),
  frameStyling:
    /\.wallpaper-media--web/.test(styles)
    && /border:\s*0/.test(styles)
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);
