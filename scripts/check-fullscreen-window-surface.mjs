import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const form = read('native/windows/winforms/FeMonsterForm.cs');
const css = read('web/styles.css');
const toolbarMarker = form.indexOf('internal sealed class RecordingToolbarForm');
const chromeMarker = form.indexOf('internal static class NativeWindowChrome');
const mainForm = toolbarMarker > 0 ? form.slice(0, toolbarMarker) : form;
const nativeChrome = chromeMarker > 0 ? form.slice(chromeMarker) : '';

const dpiCases = [96, 120, 144].map((dpi) => ({
  dpi,
  scale: dpi / 96,
  expectedClientInset: 0,
  sampledTopRows: Math.ceil(dpi / 96),
  expectedBrightPixels: 0
}));

const checks = {
  mainClientOwnsEveryWindowPixelAtEveryDpi:
    /message\.Msg\s*==\s*NativeWindowChrome\.WmNcCalcSize[\s\S]*?message\.Result\s*=\s*IntPtr\.Zero;[\s\S]*?return;/.test(mainForm)
    && !/RetainThinNonClientBorder\s*\(/.test(mainForm),
  windows11BorderDrawingIsExplicitlySuppressed:
    /TrySuppressVisibleBorder\s*\(Handle\)/.test(mainForm)
    && /DwmWaBorderColor\s*=\s*34/.test(nativeChrome)
    && /DwmColorNone\s*=\s*unchecked\(\(int\)0xFFFFFFFE\)/.test(nativeChrome),
  customFrameIsCommittedAfterHandleCreation:
    /OnHandleCreated\(EventArgs e\)[\s\S]*?RefreshFrame\s*\(Handle\)/.test(mainForm)
    && /SetWindowPos[\s\S]*?SwpFrameChanged/.test(nativeChrome),
  surfacePolicyIsReplayedAfterResizeMaximizeAndDpiChanges:
    /private void ApplyWindowSurfacePolicy\([\s\S]*?TrySuppressVisibleBorder\(Handle\)/.test(mainForm)
    && /OnResize\(EventArgs e\)[\s\S]*?ApplyWindowSurfacePolicy\(\)/.test(mainForm)
    && /OnDpiChanged\(DpiChangedEventArgs e\)[\s\S]*?cachedResizeFrameDpi\s*=\s*0;[\s\S]*?ApplyWindowSurfacePolicy\(\)/.test(mainForm),
  fullscreenTransitionsCommitTheFrameBeforeAndAfterBoundsChange:
    /private void SetFullscreen\(bool enabled\)[\s\S]*?fullscreen\s*=\s*true;[\s\S]*?ApplyWindowSurfacePolicy\(\);[\s\S]*?RefreshFrame\s*\(Handle\)[\s\S]*?Bounds\s*=\s*Screen\.FromControl\(this\)\.Bounds/.test(mainForm)
    && /private void SetFullscreen\(bool enabled\)[\s\S]*?fullscreen\s*=\s*false;[\s\S]*?ApplyWindowSurfacePolicy\(\);[\s\S]*?RefreshFrame\s*\(Handle\)/.test(mainForm),
  webViewAndFormHaveNoLayoutInset:
    /new\(\)\s*\{[\s\S]{0,160}?Dock\s*=\s*DockStyle\.Fill[\s\S]{0,160}?Margin\s*=\s*Padding\.Empty/.test(mainForm)
    && /FormBorderStyle\s*=\s*FormBorderStyle\.None;[\s\S]{0,220}?Padding\s*=\s*Padding\.Empty;/.test(mainForm),
  embeddedDocumentFillsItsOpaqueSurface:
    /html\[data-fe-client=["']embedded["']\][\s\S]{0,280}?background:\s*#020202;/.test(css)
    && /html\[data-fe-client=["']embedded["']\]\s+body[\s\S]{0,280}?height:\s*100%;/.test(css)
    && /html\[data-fe-client=["']embedded["']\]\s+\.app-shell[\s\S]{0,220}?width:\s*100%;[\s\S]{0,120}?height:\s*100%;/.test(css),
  dpiMatrixHasNoPhysicalOrLogicalGap:
    dpiCases.every(({ expectedClientInset, sampledTopRows, expectedBrightPixels }) =>
      expectedClientInset === 0
      && sampledTopRows >= 1
      && expectedBrightPixels === 0)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  dpiCases,
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
