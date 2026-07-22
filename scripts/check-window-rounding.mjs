import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const css = read('web/styles.css');
const form = read('native/windows/winforms/FeMonsterForm.cs');

const cssRadius = Number(css.match(/--window-visual-radius:\s*(\d+)px/)?.[1]);
const nativeRadius = Number(form.match(/WINDOW_VISUAL_RADIUS\s*=\s*(\d+)/)?.[1]);
const checks = {
  radiusMatchesWebDesignToken: cssRadius === 34 && nativeRadius === cssRadius,
  nativeWindowIsPhysicallyClipped: /Region = new Region\(path\)/.test(form)
    && /RoundedRectPath\(new Rectangle\(Point\.Empty, ClientSize\), radius\)/.test(form),
  clippingTracksDpiAndResize: /WINDOW_VISUAL_RADIUS \* DeviceDpi \/ 96d/.test(form)
    && /OnResize\(EventArgs e\)[\s\S]*?ApplyRoundedCorners\(\)/.test(form)
    && /OnDpiChanged\(DpiChangedEventArgs e\)[\s\S]*?ApplyRoundedCorners\(\)/.test(form),
  fullscreenKeepsRoundedRegion: !/Region\s*=\s*null/.test(form)
    && !/IsHandleCreated \|\| fullscreen/.test(form),
  dwmRoundedFallbackPreserved: /DWMWA_WINDOW_CORNER_PREFERENCE/.test(form)
    && /DwmSetWindowAttribute/.test(form),
  webSurfaceStillClipsAtRoundedBoundary: /\.app-shell\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?border-radius:\s*var\(--window-visual-radius\);/.test(css)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  pass: failures.length === 0,
  cssRadius,
  nativeRadius,
  checks,
  failures
}, null, 2));
if (failures.length) process.exitCode = 1;
