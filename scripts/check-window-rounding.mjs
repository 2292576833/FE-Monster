import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const css = read('web/styles.css');
const form = read('native/windows/winforms/FeMonsterForm.cs');
const html = read('web/index.html');

const cssRadius = Number(css.match(/--window-visual-radius:\s*(\d+)px/)?.[1]);
const checks = {
  browserRoundedDesignTokenPreserved: cssRadius === 34,
  nativeWindowUsesLargeDpiAwareRounding: /DWMWCP_ROUND\s*=\s*2/.test(form)
    && /var preference = DWMWCP_ROUND;/.test(form)
    && /WINDOW_VISUAL_RADIUS_DIP\s*=\s*34/.test(form)
    && /DeviceDpi\s*\/\s*96f/.test(form)
    && /CreateRoundedWindowRegion/.test(form)
    && /Region\s*=\s*nextRegion/.test(form),
  nativeRoundingTracksDpiAndResize: /OnResize\(EventArgs e\)[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(form)
    && /OnDpiChanged\(DpiChangedEventArgs e\)[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(form),
  fullscreenReappliesNativeCornerPolicy: /fullscreen = true;[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(form)
    && /fullscreen = false;[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(form),
  dwmRoundingIsExplicitlyEnabled: /DWMWA_WINDOW_CORNER_PREFERENCE/.test(form)
    && /DwmSetWindowAttribute/.test(form)
    && /DWMWCP_ROUND/.test(form),
  webSurfaceStillClipsAtRoundedBoundary: /\.app-shell\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?border-radius:\s*var\(--window-visual-radius\);/.test(css)
    && /--window-visual-radius:\s*34px;/.test(css),
  embeddedClientClipsToLargeRadius: /clientMode\s*===\s*['"]embedded['"][\s\S]*?dataset\.fePlatform\s*=\s*['"]desktop['"]/.test(html)
    && /html\[data-fe-platform=['"]desktop['"]\]\s*\{[\s\S]*?--window-visual-radius:\s*34px;/.test(css),
  embeddedSurfaceIsFullyOpaqueInsideDwmBoundary: /webView\.DefaultBackgroundColor\s*=\s*Color\.FromArgb\(255,\s*2,\s*2,\s*2\);/.test(form)
    && /html\[data-fe-platform=['"]desktop['"]\]\s*\{[\s\S]*?background:\s*#020202;/.test(css)
    && /html\[data-fe-platform=['"]desktop['"]\]\s+body\s*\{[\s\S]*?background:\s*#020202;/.test(css)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  pass: failures.length === 0,
  cssRadius,
  checks,
  failures
}, null, 2));
if (failures.length) process.exitCode = 1;
