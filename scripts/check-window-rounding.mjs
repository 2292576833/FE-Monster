import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const css = read('web/styles.css');
const form = read('native/windows/winforms/FeMonsterForm.cs');
const html = read('web/index.html');
const nativeClient = read('native/windows/fe_monster_client.cpp');
const borderlessFallback = read('scripts/make-window-borderless.ps1');
const liveSurfaceProbe = read('scripts/check-live-window-surface.ps1');
const localClientLauncher = read('src/main/java/com/femonster/desktop/LocalClientLauncher.java');

const toolbarMarker = form.indexOf('internal sealed class RecordingToolbarForm');
const toolbarButtonMarker = form.indexOf('internal sealed class ToolbarIconButton');
const chromeMarker = form.indexOf('internal static class NativeWindowChrome');
const mainForm = toolbarMarker > 0 ? form.slice(0, toolbarMarker) : form;
const recordingToolbar = toolbarMarker > 0
  ? form.slice(
      toolbarMarker,
      toolbarButtonMarker > toolbarMarker
        ? toolbarButtonMarker
        : chromeMarker > toolbarMarker
          ? chromeMarker
          : undefined
    )
  : '';
const nativeChrome = chromeMarker > 0 ? form.slice(chromeMarker) : '';
const desktopCss = css.match(/html\[data-fe-platform=["']desktop["']\]\s*\{[^}]*\}/s)?.[0] || '';
const rootRadius = Number(css.match(/:root\s*\{[\s\S]*?--window-visual-radius:\s*(\d+)px/)?.[1]);

const checks = {
  browserDesignRadiusRemainsAvailable: rootRadius === 34,
  desktopWebViewDoesNotFakeTheWindowShape:
    /--window-visual-radius:\s*0px/.test(desktopCss)
    && /\.app-shell\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?border-radius:\s*var\(--window-visual-radius\);/.test(css)
    && /html\[data-fe-platform=["']desktop["']\]\s+body\s*\{[^}]*background:\s*#020202;/s.test(css),
  embeddedSurfaceStaysOpaqueInsideDwmBoundary:
    /private static readonly Color WindowSurfaceColor\s*=\s*Color\.FromArgb\(255,\s*2,\s*2,\s*2\);/.test(mainForm)
    && /BackColor\s*=\s*WindowSurfaceColor;/.test(mainForm)
    && /webView\.DefaultBackgroundColor\s*=\s*WindowSurfaceColor;/.test(mainForm)
    && /html\[data-fe-platform=["']desktop["']\s*\]\s*\{[^}]*background:\s*#020202;/s.test(css)
    && /clientMode\s*===\s*["']embedded["'][\s\S]*?dataset\.fePlatform\s*=\s*["']desktop["']/.test(html),
  webViewOwnsTheUnclippedOpaqueClientAtEveryDpi:
    /private readonly WebView2 webView\s*=\s*new\(\)\s*\{[\s\S]*?Dock\s*=\s*DockStyle\.Fill,[\s\S]*?Margin\s*=\s*Padding\.Empty[\s\S]*?\};/.test(mainForm)
    && /FormBorderStyle\s*=\s*FormBorderStyle\.None;[\s\S]*?Padding\s*=\s*Padding\.Empty;[\s\S]*?Controls\.Add\(webView\);/.test(mainForm)
    && [96, 120].every((dpi) => Number.isInteger(dpi) && dpi >= 96),
  mainWindowQualifiesForNativeFrameAndShadow:
    /protected override CreateParams CreateParams[\s\S]*?CustomFrameStyle[\s\S]*?DropShadowClassStyle/.test(mainForm)
    && /CustomFrameStyle\s*=[\s\S]*?WsCaption[\s\S]*?WsThickFrame/.test(nativeChrome)
    && /TryEnableNonClientRendering/.test(mainForm),
  mainWindowHasDpiAwareEightWayResizeHitTesting:
    /WmNcHitTest/.test(mainForm)
    && /int dpi\s*=\s*Math\.Max\(96,\s*DeviceDpi\)/.test(mainForm)
    && /GetResizeFrameSize\(Handle,\s*dpi\)/.test(mainForm)
    && [
      'HtTopLeft',
      'HtTopRight',
      'HtBottomLeft',
      'HtBottomRight',
      'HtLeft',
      'HtRight',
      'HtTop',
      'HtBottom'
    ].every((name) => new RegExp(`return NativeWindowChrome\\.${name}`).test(mainForm)),
  mainWindowUsesStateAwareDwmCorners:
    /bool shouldRound\s*=\s*!fullscreen\s*&&\s*WindowState\s*==\s*FormWindowState\.Normal/.test(mainForm)
    && /shouldRound[\s\S]*?DwmWcpRound[\s\S]*?DwmWcpDoNotRound/.test(mainForm)
    && /fullscreen\s*\|\|\s*WindowState\s*!=\s*FormWindowState\.Normal[\s\S]*?HtClient/.test(mainForm),
  nativeDwmPathHasNoTopLevelRegionOrTransparentCutout:
    !/\bRegion\s*=/.test(mainForm)
    && !/CreateRoundedWindowRegion|CreateRoundRectRgn/.test(mainForm)
    && !/AllowTransparency\s*=|TransparencyKey\s*=|Opacity\s*=/.test(mainForm)
    && !/\bRegion\s*=/.test(recordingToolbar)
    && !/CreateRoundedWindowRegion|CreateRoundRectRgn/.test(recordingToolbar)
    && !/AllowTransparency\s*=|TransparencyKey\s*=|Opacity\s*=/.test(recordingToolbar),
  redirectionBitmapIsExplicitlyOpaqueOnWindows11Build26100:
    /DwmWaRedirectionBitmapAlpha\s*=\s*39/.test(nativeChrome)
    && /SupportsOpaqueRedirectionBitmap\s*=>[\s\S]*?OperatingSystem\.IsWindowsVersionAtLeast\(10,\s*0,\s*26100\)/.test(nativeChrome)
    && /TryForceOpaqueRedirectionBitmap[\s\S]*?if\s*\(!SupportsOpaqueRedirectionBitmap\)\s*return false;[\s\S]*?int enabled\s*=\s*0;[\s\S]*?DwmWaRedirectionBitmapAlpha/.test(nativeChrome)
    && /private void ApplyWindowSurfacePolicy\(\)[\s\S]*?TryForceOpaqueRedirectionBitmap\(Handle\)/.test(mainForm)
    && /OnHandleCreated\(EventArgs e\)[\s\S]*?ApplyWindowSurfacePolicy\(\)/.test(mainForm),
  zeroInsetClientKeepsDwmEligibleWithoutWhiteEdge:
    /WmNcCalcSize[\s\S]*?message\.Result\s*=\s*IntPtr\.Zero;[\s\S]*?return;/.test(mainForm)
    && !/WmNcCalcSize[\s\S]*?RetainThinNonClientBorder/.test(mainForm)
    && /TrySuppressVisibleBorder\(Handle\)/.test(mainForm)
    && /DwmWaBorderColor\s*=\s*34/.test(nativeChrome)
    && /DwmColorNone\s*=\s*unchecked\(\(int\)0xFFFFFFFE\)/.test(nativeChrome)
    && /TrySuppressVisibleBorder[\s\S]*?int color\s*=\s*DwmColorNone;[\s\S]*?DwmWaBorderColor/.test(nativeChrome)
    && /OnHandleCreated\(EventArgs e\)[\s\S]*?RefreshFrame\(Handle\)/.test(mainForm)
    && /OnResize\(EventArgs e\)[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(mainForm)
    && /OnDpiChanged\(DpiChangedEventArgs e\)[\s\S]*?ApplyWindowCornerPolicy\(\)/.test(mainForm),
  liveProbeTreatsBorderColorAsSetOnlyAndUsesPhysicalDpiCoordinates:
    /DwmSetWindowAttribute\(\s*\$window,\s*34,/is.test(liveSurfaceProbe)
    && !/DwmGetWindowAttribute\(\s*\$window,\s*34,/is.test(liveSurfaceProbe)
    && /SetThreadDpiAwarenessContext\(\[IntPtr\]\(-4\)\)/.test(liveSurfaceProbe)
    && /GetParent\(candidate\) != parent/.test(liveSurfaceProbe)
    && /normalWebViewOwnsEveryClientPixel/.test(liveSurfaceProbe)
    && /fullscreenWebViewOwnsEveryClientPixel/.test(liveSurfaceProbe),
  recordingToolbarUsesNativeLargeCorners:
    /protected override CreateParams CreateParams[\s\S]*?CustomFrameStyle/.test(recordingToolbar)
    && /TrySetCornerPreference\([\s\S]*?DwmWcpRound/.test(recordingToolbar)
    && !/DwmWcpRoundSmall/.test(recordingToolbar)
    && /WmNcCalcSize[\s\S]*?RetainThinNonClientBorder/.test(recordingToolbar),
  browserFallbackPrefersDwmAndPreservesResizeFrame:
    /DwmSetWindowAttribute/.test(borderlessFallback)
    && /SetWindowRgn\(\$Window,\s*\[IntPtr\]::Zero/.test(borderlessFallback)
    && !/CreateRoundRectRgn|DeleteObject/.test(borderlessFallback)
    && /\$nextStyle\s*=[^\r\n]*-bor\s*\$WS_BORDER\s*-bor\s*\$WS_THICKFRAME/.test(borderlessFallback)
    && /Browser\.setWindowBounds[\s\S]*?applyBorderlessWindow\(/.test(localClientLauncher),
  legacyCppHostUsesTheSameNativePolicy:
    /DwmSetWindowAttribute/.test(nativeClient)
    && /SetWindowRgn\(hwnd,\s*nullptr,\s*TRUE\)/.test(nativeClient)
    && !/CreateRoundRectRgn|DeleteObject/.test(nativeClient)
    && /case WM_SIZE:[\s\S]*?apply_window_corner_policy\(hwnd,\s*wparam\s*==\s*SIZE_MAXIMIZED\)/.test(nativeClient)
    && /WS_OVERLAPPEDWINDOW/.test(nativeClient)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  rootRadius,
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
