param(
  [Parameter(Mandatory = $true)]
  [int]$RootProcessId,
  [ValidateSet('snapshot', 'click', 'drag', 'type', 'analyze-region')]
  [string]$Action = 'snapshot',
  [int]$X = 0,
  [int]$Y = 0,
  [int]$ToX = 0,
  [int]$ToY = 0,
  [string]$Text = '',
  [double]$PanelLeft = 0,
  [double]$PanelTop = 0,
  [double]$PanelRight = 0,
  [double]$PanelBottom = 0,
  [double]$PanelRadius = 0,
  [double]$CharacterLeft = 0,
  [double]$CharacterTop = 0,
  [double]$CharacterRight = 0,
  [double]$CharacterBottom = 0
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class FePetNativeInput
{
    public delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct Point { public int X, Y; }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")]
    public static extern uint GetDpiForSystem();
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateRectRgn(int left, int top, int right, int bottom);
    [DllImport("user32.dll")]
    public static extern int GetWindowRgn(IntPtr window, IntPtr region);
    [DllImport("gdi32.dll")]
    public static extern int GetRgnBox(IntPtr region, out Rect rect);
    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr value);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr window, StringBuilder value, int maxCount);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    public static extern IntPtr GetWindowLongPtr(IntPtr window, int index);

    public static string ClassName(IntPtr window)
    {
        var value = new StringBuilder(256);
        GetClassName(window, value, value.Capacity);
        return value.ToString();
    }

    public static string WindowText(IntPtr window)
    {
        var value = new StringBuilder(2048);
        GetWindowText(window, value, value.Capacity);
        return value.ToString();
    }

    public static string[] ChildWindowTexts(IntPtr window)
    {
        var values = new List<string>();
        EnumChildWindows(window, (child, unused) => {
            string text = WindowText(child);
            string className = ClassName(child);
            if (!String.IsNullOrWhiteSpace(text)) values.Add(className + ": " + text);
            return true;
        }, IntPtr.Zero);
        return values.ToArray();
    }

    public static uint OwnerProcessId(IntPtr window)
    {
        uint owner;
        GetWindowThreadProcessId(window, out owner);
        return owner;
    }

    public static uint LastOwnerProcessId { get; private set; }
    public static string LastTitle { get; private set; }

    public static IntPtr Find(int processId)
    {
        IntPtr match = IntPtr.Zero;
        EnumWindows((window, unused) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (processId <= 0 && !IsWindowVisible(window)) return true;
            var title = new StringBuilder(256);
            GetWindowText(window, title, title.Capacity);
            if (processId > 0 && owner != (uint)processId) return true;
            if (processId <= 0 && !String.Equals(title.ToString(), "FE Monster Desktop Pet", StringComparison.Ordinal)) return true;
            string currentTitle = title.ToString();
            if (match == IntPtr.Zero || String.Equals(currentTitle, "FE Monster Desktop Pet", StringComparison.Ordinal))
            {
                match = window;
                LastOwnerProcessId = owner;
                LastTitle = currentTitle;
            }
            return !String.Equals(currentTitle, "FE Monster Desktop Pet", StringComparison.Ordinal);
        }, IntPtr.Zero);
        return match;
    }

    public static string[] DescribeProcessWindows(int processId)
    {
        var values = new List<string>();
        EnumWindows((window, unused) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != (uint)processId) return true;
            Rect bounds;
            GetWindowRect(window, out bounds);
            values.Add(String.Format(
                "0x{0:X}|visible={1}|class={2}|title={3}|bounds={4},{5},{6},{7}",
                window.ToInt64(), IsWindowVisible(window), ClassName(window), WindowText(window),
                bounds.Left, bounds.Top, bounds.Right, bounds.Bottom
            ));
            return true;
        }, IntPtr.Zero);
        return values.ToArray();
    }
}
'@

# Win32 otherwise virtualizes another process's window coordinates to the
# PowerShell host's legacy 96-DPI coordinate space. The probe must report the
# desktop pet's real physical-pixel bounds.
[void][FePetNativeInput]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
Add-Type -AssemblyName System.Windows.Forms

$window = [FePetNativeInput]::Find($RootProcessId)
if ($window -eq [IntPtr]::Zero) {
  $window = [FePetNativeInput]::Find(0)
}
if ($window -eq [IntPtr]::Zero) {
  throw "FE Monster Desktop Pet window was not found for process $RootProcessId."
}

$bounds = New-Object FePetNativeInput+Rect
[void][FePetNativeInput]::GetWindowRect($window, [ref]$bounds)
$clientBounds = New-Object FePetNativeInput+Rect
[void][FePetNativeInput]::GetClientRect($window, [ref]$clientBounds)
$clientOrigin = New-Object FePetNativeInput+Point
$clientOrigin.X = 0
$clientOrigin.Y = 0
[void][FePetNativeInput]::ClientToScreen($window, [ref]$clientOrigin)
$regionHandle = [FePetNativeInput]::CreateRectRgn(0, 0, 0, 0)
$regionKind = [FePetNativeInput]::GetWindowRgn($window, $regionHandle)
$regionBounds = New-Object FePetNativeInput+Rect
[void][FePetNativeInput]::GetRgnBox($regionHandle, [ref]$regionBounds)
$nativeRegion = [System.Drawing.Region]::FromHrgn($regionHandle)
[void][FePetNativeInput]::DeleteObject($regionHandle)
$identityMatrix = New-Object System.Drawing.Drawing2D.Matrix
$regionArea = 0.0
foreach ($scan in $nativeRegion.GetRegionScans($identityMatrix)) {
  $regionArea += [double]$scan.Width * [double]$scan.Height
}
$identityMatrix.Dispose()
$regionAnalysis = $null

if ($Action -eq 'analyze-region') {
  $panelWidth = [Math]::Max(0.0, $PanelRight - $PanelLeft)
  $panelHeight = [Math]::Max(0.0, $PanelBottom - $PanelTop)
  $characterWidth = [Math]::Max(0.0, $CharacterRight - $CharacterLeft)
  $characterHeight = [Math]::Max(0.0, $CharacterBottom - $CharacterTop)

  $outside = $nativeRegion.Clone()
  $outside.Exclude([System.Drawing.RectangleF]::new($PanelLeft, $PanelTop, $panelWidth, $panelHeight))
  $outside.Exclude([System.Drawing.RectangleF]::new($CharacterLeft, $CharacterTop, $characterWidth, $characterHeight))

  $diameter = [Math]::Max(2.0, $PanelRadius * 2.0)
  $panelPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $panelPath.AddArc([single]$PanelLeft, [single]$PanelTop, [single]$diameter, [single]$diameter, 180, 90)
  $panelPath.AddArc([single]($PanelRight - $diameter), [single]$PanelTop, [single]$diameter, [single]$diameter, 270, 90)
  $panelPath.AddArc([single]($PanelRight - $diameter), [single]($PanelBottom - $diameter), [single]$diameter, [single]$diameter, 0, 90)
  $panelPath.AddArc([single]$PanelLeft, [single]($PanelBottom - $diameter), [single]$diameter, [single]$diameter, 90, 90)
  $panelPath.CloseFigure()
  $expectedPanel = [System.Drawing.Region]::new($panelPath)
  $missingPanel = $expectedPanel.Clone()
  $missingPanel.Exclude($nativeRegion)

  $analysisMatrix = New-Object System.Drawing.Drawing2D.Matrix
  $outsideArea = 0.0
  foreach ($scan in $outside.GetRegionScans($analysisMatrix)) {
    $outsideArea += [double]$scan.Width * [double]$scan.Height
  }
  $missingPanelArea = 0.0
  foreach ($scan in $missingPanel.GetRegionScans($analysisMatrix)) {
    $missingPanelArea += [double]$scan.Width * [double]$scan.Height
  }
  $analysisMatrix.Dispose()
  $outside.Dispose()
  $expectedPanel.Dispose()
  $missingPanel.Dispose()
  $panelPath.Dispose()
  $regionAnalysis = @{
    outsideVisibleBoundsArea = $outsideArea
    missingPanelArea = $missingPanelArea
    expectedPanelArea = $panelWidth * $panelHeight
  }
}
$hitWindow = [IntPtr]::Zero

function Invoke-PetMouseButton {
  param([bool]$Down)
  $flag = if ($Down) { 0x0002 } else { 0x0004 }
  [FePetNativeInput]::mouse_event($flag, 0, 0, 0, [UIntPtr]::Zero)
}

if ($Action -ne 'snapshot') {
  [void][FePetNativeInput]::SetForegroundWindow($window)
  [void][FePetNativeInput]::SetCursorPos($X, $Y)
  Start-Sleep -Milliseconds 80
  $hitPoint = New-Object FePetNativeInput+Point
  $hitPoint.X = $X
  $hitPoint.Y = $Y
  $hitWindow = [FePetNativeInput]::WindowFromPoint($hitPoint)
}

switch ($Action) {
  'click' {
    Invoke-PetMouseButton -Down $true
    Start-Sleep -Milliseconds 70
    Invoke-PetMouseButton -Down $false
  }
  'drag' {
    Invoke-PetMouseButton -Down $true
    1..10 | ForEach-Object {
      $progress = $_ / 10.0
      $nextX = [int][Math]::Round($X + (($ToX - $X) * $progress))
      $nextY = [int][Math]::Round($Y + (($ToY - $Y) * $progress))
      [void][FePetNativeInput]::SetCursorPos($nextX, $nextY)
      Start-Sleep -Milliseconds 25
    }
    Invoke-PetMouseButton -Down $false
  }
  'type' {
    Invoke-PetMouseButton -Down $true
    Invoke-PetMouseButton -Down $false
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait($Text)
  }
}

$hitRoot = if ($hitWindow -eq [IntPtr]::Zero) { [IntPtr]::Zero } else { [FePetNativeInput]::GetAncestor($hitWindow, 2) }
@{
  handle = ('0x{0:X}' -f $window.ToInt64())
  ownerProcessId = [FePetNativeInput]::LastOwnerProcessId
  processWindows = [FePetNativeInput]::DescribeProcessWindows($RootProcessId)
  title = [FePetNativeInput]::LastTitle
  childTexts = [FePetNativeInput]::ChildWindowTexts($window)
  visible = [FePetNativeInput]::IsWindowVisible($window)
  extendedStyle = ('0x{0:X}' -f [FePetNativeInput]::GetWindowLongPtr($window, -20).ToInt64())
  hitHandle = ('0x{0:X}' -f $hitWindow.ToInt64())
  hitRootHandle = ('0x{0:X}' -f $hitRoot.ToInt64())
  hitClass = if ($hitWindow -eq [IntPtr]::Zero) { '' } else { [FePetNativeInput]::ClassName($hitWindow) }
  hitOwnerProcessId = if ($hitWindow -eq [IntPtr]::Zero) { 0 } else { [FePetNativeInput]::OwnerProcessId($hitWindow) }
  left = $bounds.Left
  top = $bounds.Top
  right = $bounds.Right
  bottom = $bounds.Bottom
  width = $bounds.Right - $bounds.Left
  height = $bounds.Bottom - $bounds.Top
  clientLeft = $clientOrigin.X
  clientTop = $clientOrigin.Y
  clientRight = $clientOrigin.X + $clientBounds.Right - $clientBounds.Left
  clientBottom = $clientOrigin.Y + $clientBounds.Bottom - $clientBounds.Top
  clientWidth = $clientBounds.Right - $clientBounds.Left
  clientHeight = $clientBounds.Bottom - $clientBounds.Top
  systemDpi = [FePetNativeInput]::GetDpiForSystem()
  windowDpi = [FePetNativeInput]::GetDpiForWindow($window)
  regionKind = $regionKind
  regionLeft = $regionBounds.Left
  regionTop = $regionBounds.Top
  regionRight = $regionBounds.Right
  regionBottom = $regionBounds.Bottom
  regionArea = $regionArea
  regionAnalysis = $regionAnalysis
} | ConvertTo-Json -Compress

$nativeRegion.Dispose()
