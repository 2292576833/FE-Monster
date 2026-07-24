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
    && /updateWallpaperVisibility[\s\S]*unloadWallpaperWebFrame/.test(app),
  sceneUsesNativeActivation:
    /wallpaper\.kind\s*===\s*['"]scene['"]/.test(app)
    && /\/api\/wallpapers\/activate/.test(app)
    && /previewUrl/.test(app),
  activationEndpoint:
    /["']\/api\/wallpapers\/activate["']/.test(routes)
    && /wallpapers\.activate/.test(routes),
  safeEngineCommand:
    /Map<String,\s*Object>\s+activate\s*\(/.test(service)
    && /ProcessBuilder/.test(service)
    && /openWallpaper/.test(service)
    && /projectJson/.test(service),
  frameStyling:
    /\.wallpaper-media--web/.test(styles)
    && /border:\s*0/.test(styles)
};

console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);
