import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const form = read('native/windows/winforms/FeMonsterForm.cs');
const host = read('native/windows/winforms/DesktopPetHost.cs');
const project = read('native/windows/winforms/FeMonsterClient.WinForms.csproj');
const app = read('web/app.js');
const pet = read('web/pet-assistant.js');
const css = read('web/pet-assistant.css');
const html = read('web/index.html');

assert.match(form, /private readonly WebView2 webView = new\(\)/,
  'main WinForms host no longer owns the primary WebView2');
assert.match(host, /private readonly WebView2CompositionControl webView = new\(\)/,
  'desktop pet is not rendered by the WPF composition controller');
assert.match(host, /mainWebView\.CoreWebView2\?\.Environment[\s\S]*EnsureCoreWebView2Async\(environment\)/,
  'desktop pet does not share the main WebView2 profile/environment');
assert.match(form, /ResolveWebView2DataRoot\(\)[\s\S]*FE_MONSTER_DATA_DIR[\s\S]*Path\.Combine\([^;]*"WebView2"/,
  'main WebView2 profile must follow the explicit FE data root when Local AppData is full');
assert.match(host, /DesktopPetUrl\(appUrl\)[\s\S]*query\.Add\("client=desktop-pet"\)/,
  'desktop pet controller is not explicitly isolated in desktop-pet mode');
assert.match(host, /DefaultBackgroundColor\s*=\s*Color\.FromArgb\(0,\s*0,\s*0,\s*0\)/,
  'desktop pet WebView2 background is not transparent');
assert.match(host, /AllowsTransparency\s*=\s*true[\s\S]*Background\s*=\s*WpfMedia\.Brushes\.Transparent/,
  'desktop pet top-level WPF surface is not per-pixel transparent');
assert.doesNotMatch(host, /TransparencyKey\s*=|DwmExtendFrameIntoClientArea|dwmapi\.dll/,
  'desktop pet still relies on color-key or DWM glass transparency');
assert.match(project, /<UseWPF>true<\/UseWPF>[\s\S]*Microsoft\.Windows\.SDK\.NET\.dll[\s\S]*WinRT\.Runtime\.dll/,
  'offline publish does not include the WPF composition controller runtime references');
assert.doesNotMatch(host, /SolidBrush\(Color\.FromArgb\(2,\s*3,\s*4\)\)|FillRectangle\(hitSurface|FillEllipse\(\s*hitSurface/,
  'desktop pet paints an opaque black hit-test rectangle behind transparent WebView content');
assert.match(host, /MascotHaloOverscan\s*=\s*(?:[8-9]|[1-9]\d+)/,
  'desktop pet native surface has no safety margin for the particle self-emission halo');
assert.match(host, /BuildCharacterHitRegion[\s\S]*AddEllipse\(\s*-MascotHaloOverscan,\s*-MascotHaloOverscan,\s*MascotRenderSize\s*\+\s*MascotHaloOverscan\s*\*\s*2,\s*MascotRenderSize\s*\+\s*MascotHaloOverscan\s*\*\s*2\s*\)[\s\S]*UpdateInteractiveRegion[\s\S]*SetWindowRgn\(/,
  'desktop pet native hit target clips the particle-orb self-emission halo');
assert.doesNotMatch(host, /next\.Union\(\s*new Rectangle\(\s*mascotLeft\s*-\s*Dip\(MascotHaloOverscan\)/,
  'desktop pet halo safety margin must stay circular instead of exposing a large transparent rectangle');
assert.doesNotMatch(host, /BuildMascotHitRegion|fe-monster-pet-mascot\.png|GetPixel\(/,
  'desktop pet native region still depends on the removed mascot bitmap silhouette');
assert.match(host, /ClosedWidth\s*=\s*(?:2[7-9]\d|[3-9]\d{2,})/,
  'desktop pet native host is too narrow for the approved mascot artwork');
assert.match(host, /ClosedHeight\s*=\s*(?:3\d{2}|[4-9]\d{2,})/,
  'desktop pet native host is too short for the approved mascot artwork');
assert.match(css, /html\[data-fe-client="desktop-pet"\][\s\S]*?\.pet-assistant__character[\s\S]*?width:\s*(?:2[3-9]\d|[3-9]\d{2,})px[\s\S]*?height:\s*(?:2[3-9]\d|[3-9]\d{2,})px/,
  'desktop mode still renders the approved mascot as a tiny icon');
assert.match(host, /PositionRegistryPath[\s\S]*AnchorRight[\s\S]*AnchorBottom/,
  'desktop pet position is not persisted');
assert.match(host, /DisplaySettingsChanged[\s\S]*ClampToVisibleScreen/,
  'desktop pet position is not repaired after display changes');
assert.match(host, /HandleSourceInitialized[\s\S]*ApplyDpiGeometry[\s\S]*WM_DPICHANGED[\s\S]*ApplyDpiGeometry/,
  'desktop pet native bounds are not rebuilt for the initial monitor and cross-monitor DPI changes');
assert.match(host, /private int Dip\(int value\)[\s\S]*appliedDpi[\s\S]*BaseDpi/,
  'desktop pet native geometry has no shared DIP-to-physical-pixel conversion');
assert.match(host, /characterHitRegionDip\.Clone\(\)[\s\S]*scale\.Scale\(dpiScale, dpiScale\)[\s\S]*character\.Transform\(scale\)/,
  'desktop pet particle-orb hit mask is not scaled with the native window DPI');
assert.match(host, /DefaultPanelHitWidth\s*=\s*320[\s\S]*DefaultPanelHitHeight\s*=\s*148/,
  'desktop pet fallback panel region can still expose the removed full-height chat panel');
assert.match(host, /SetPanelOpen\([\s\S]*boundsCss[\s\S]*viewportCss[\s\S]*radiusCss[\s\S]*UnionCssRoundedRegion/,
  'desktop pet native panel region does not follow the web-provided rounded input-bubble geometry');
assert.doesNotMatch(host, /Math\.Min\(Dip\(390\)[\s\S]*Math\.Min\(Dip\(570\)/,
  'desktop pet still exposes the legacy 390x570 transparent panel hit target');
assert.doesNotMatch(host, /MouseDoubleClick\s*\+=|ShowMainRequested/,
  'native routed double-click still steals the mascot gesture from the WebView');
for (const edge of ['Left', 'Right', 'Top', 'Bottom']) {
  assert.match(host, new RegExp(`PetDockEdge\\.${edge}`), `desktop pet cannot dock to the ${edge.toLowerCase()} edge`);
}
assert.match(host, /DockToNearestEdge[\s\S]*CursorNearDockEdge[\s\S]*SetAutoHidden/,
  'desktop pet edge docking and proximity reveal are not wired');
assert.match(host, /EdgeRevealSize[\s\S]*animationTarget[\s\S]*HandleEdgeTimerTick/,
  'desktop pet edge hide does not animate');
assert.match(host, /key\.SetValue\("DockEdge"[\s\S]*key\.SetValue\("DockOffset"/,
  'desktop pet edge and offset are not persisted');
assert.doesNotMatch(host, /WS_EX_NOACTIVATE/,
  'desktop pet must accept focus for text and voice controls');
assert.doesNotMatch(host, /ShowWithoutActivation\s*=>\s*true/,
  'desktop pet is shown without activation, so its WebView cannot reliably receive click, drag, or keyboard input');
assert.match(host, /SetPanelOpen\([\s\S]*?bool open[\s\S]*?if \(open\)[\s\S]*?Activate\(\)[\s\S]*?webView\.Focus\(\)/,
  'opening desktop pet chat does not activate the native form and focus its WebView');

assert.match(form, /"fe-pet-desktop"/);
assert.match(form, /hostMode\s*=\s*"wpf-composition-surface"/);
assert.match(form, /case\s+"position-query"/,
  'native desktop host does not expose position queries');
assert.match(form, /case\s+"position-set"[\s\S]*GlideToAsync/,
  'native desktop host does not route smooth position changes');
assert.match(form, /bounds\s*=\s*desktopPetHost\.QueryBounds\(\)/,
  'native desktop responses do not return the resulting bounds');
assert.match(host, /Task\s+GlideToAsync\(/,
  'desktop pet has no asynchronous glide operation');
assert.match(host, /Math\.Clamp\(durationMs,\s*250,\s*1_200\)/,
  'desktop pet glide duration is not clamped to 250-1200 ms');
assert.match(host, /EaseInOutCubic/,
  'desktop pet glide does not use bounded easing');
assert.match(host, /MoveBy\([\s\S]*CancelGlide/,
  'dragging does not cancel an active programmatic glide');
assert.match(host, /WorkingArea[\s\S]*xPercent[\s\S]*yPercent[\s\S]*Math\.Clamp/,
  'desktop pet percentage positioning is not clamped to the selected work area');
assert.match(form, /case\s+"bubble"[\s\S]*desktopPetHost\.SetBubbleVisible\(/,
  'native desktop host does not accept transient bubble geometry from the web bridge');
assert.match(form, /case\s+"panel"[\s\S]*ReadObject\(root,\s*"bounds"\)[\s\S]*ReadObject\(root,\s*"viewport"\)[\s\S]*desktopPetHost\.SetPanelOpen\(/,
  'native desktop host does not accept the compact text-input bubble geometry');
assert.match(host, /SetBubbleVisible\(bool visible,[\s\S]*UpdateInteractiveRegion\(\)/,
  'desktop pet form does not update its interactive region when bubble visibility changes');
assert.match(host, /else if \(bubbleVisible[\s\S]*UnionCssRoundedRegion\([\s\S]*bubbleBoundsCss[\s\S]*bubbleViewportCss[\s\S]*bubbleRadiusCss/,
  'desktop pet native region does not union the visible rounded speech bubble');
assert.match(form, /显示桌宠/);
assert.match(form, /隐藏桌宠/);

for (const command of [
  'pet.mascot.visibility.query',
  'pet.mascot.visibility.set',
  'pet.desktop.mode.query',
  'pet.desktop.mode.set',
  'pet.desktop.visibility.set',
  'pet.desktop.show',
  'pet.desktop.hide',
  'pet.desktop.position.query',
  'pet.desktop.position.set',
  'pet.desktop.position.smart'
]) {
  assert.match(app, new RegExp(command.replaceAll('.', '\\.') ), `missing command ${command}`);
}
assert.match(app, /platform:\s*'browser'[\s\S]*桌面宠物模式仅支持 Windows 正式客户端/,
  'browser query does not explicitly report native desktop pet as unsupported');
assert.match(pet, /postNativeDesktopPet\('move'/,
  'desktop pet dragging does not move the native form');
assert.match(pet, /postNativeDesktopPet\('move-end'/,
  'desktop pet drag completion does not persist position');
assert.match(pet, /elements\.character\?\.addEventListener\('click',\s*scheduleCharacterSingleActivation\)/,
  'single-clicking the desktop mascot is not routed through the delayed live-conversation activation');
assert.match(pet, /function scheduleCharacterSingleActivation\([\s\S]*?activateCharacterSingle\([\s\S]*?CHARACTER_ACTIVATION_DELAY_MS/,
  'single-click activation does not preserve a double-click cancellation window');
assert.match(pet, /function activateCharacterSingle\([\s\S]*?toggleDeepSeekLiveConversation\(\)/,
  'single-clicking the desktop mascot does not toggle continuous live conversation');
assert.match(pet, /elements\.character\?\.addEventListener\('dblclick',\s*handleCharacterDoubleActivation\)/,
  'double-clicking the desktop mascot is not routed to the text bubble');
assert.match(pet, /function handleCharacterDoubleActivation\([\s\S]*?cancelCharacterActivation\(\)[\s\S]*?setPanelOpen/,
  'double-clicking the desktop mascot does not cancel live activation and open the compact text bubble');
assert.match(pet, /elements\.form\?\.addEventListener\('submit'[\s\S]*?sendText\(elements\.input\?\.value\)/,
  'desktop pet message submission is not connected to the server chat transport');
assert.match(pet, /addEventListener\('contextmenu'[\s\S]*setMascotVisible\(false\)/,
  'desktop pet cannot be hidden without an extra visible button');
assert.match(pet, /postNativeDesktopPet\('panel'/,
  'desktop pet panel does not resize the native host');
assert.match(pet, /postNativeDesktopPet\('bubble',[\s\S]*visible:[\s\S]*bounds:/,
  'desktop pet does not report the transient speech bubble bounds to the native host');
assert.match(pet, /new MutationObserver\([\s\S]*data-pet-proactive[\s\S]*data-pet-aside/,
  'companion asides can change the speech bubble without notifying the native region');
assert.match(pet, /if \(pet\.desktopMode && !next\)[\s\S]*postNativeDesktopPet\('bubble',[\s\S]*visible:\s*false/,
  'leaving desktop mode can leave a stale native speech-bubble hit region');
assert.match(pet, /visibility:\s*mascotVisibility/);
assert.match(pet, /setVisible:\s*setMascotVisible/);
assert.match(pet, /setDesktopMode/);
assert.match(css, /html\[data-fe-client="desktop-pet"\][\s\S]*background:\s*transparent\s*!important/);
assert.match(css, /body\s*>\s*:not\(#petAssistant\):not\(#petAssistantRestore\)/,
  'desktop mode does not isolate the pet UI');
assert.match(css, /\.pet-assistant__quick-actions\s*\{[\s\S]*?z-index:\s*4/,
  'quick actions can be covered by the mascot character hit target');
assert.match(css, /html\[data-fe-client="desktop-pet"\][^\{]*\.pet-assistant__quick-actions\s*\{[\s\S]*?display:\s*none\s*!important/,
  'desktop pet still shows redundant dock buttons');
assert.match(html, /id="petAssistantRestore"/,
  'browser mascot hide has no persistent recovery entry');

process.stdout.write('Native desktop pet contract checks passed.\n');
