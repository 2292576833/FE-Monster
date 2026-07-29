param(
  [Parameter(Mandatory = $true)]
  [long]$TargetProcessId,
  [int]$Width = 1600,
  [int]$Height = 900,
  [int]$X = 120,
  [int]$Y = 80,
  [switch]$ShapeOnly,
  [switch]$Fullscreen
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class FeMonsterWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

    [DllImport("gdi32.dll", SetLastError = true)]
    public static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int widthEllipse, int heightEllipse);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hWnd, int attribute, ref int value, int size);
}
"@

$GWL_STYLE = -16
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$SWP_NOZORDER = 0x0004
$SWP_NOOWNERZORDER = 0x0200
$SWP_FRAMECHANGED = 0x0020
$SWP_SHOWWINDOW = 0x0040
$DWMWA_WINDOW_CORNER_PREFERENCE = 33
$DWMWCP_ROUND = 2
$WINDOW_VISUAL_RADIUS_DIP = 34

function Set-NativeRoundedWindow {
  param(
    [IntPtr]$Window,
    [int]$WindowWidth,
    [int]$WindowHeight
  )

  try {
    $preference = $DWMWCP_ROUND
    [void][FeMonsterWin32]::DwmSetWindowAttribute(
      $Window,
      $DWMWA_WINDOW_CORNER_PREFERENCE,
      [ref]$preference,
      4
    )
  } catch {
  }

  $dpi = 96
  try {
    $reportedDpi = [FeMonsterWin32]::GetDpiForWindow($Window)
    if ($reportedDpi -gt 0) { $dpi = [int]$reportedDpi }
  } catch {
  }
  $radius = [Math]::Max(1, [int][Math]::Round($WINDOW_VISUAL_RADIUS_DIP * $dpi / 96.0))
  $diameter = $radius * 2
  $region = [FeMonsterWin32]::CreateRoundRectRgn(0, 0, $WindowWidth + 1, $WindowHeight + 1, $diameter, $diameter)
  if ($region -eq [IntPtr]::Zero) { return }

  if ([FeMonsterWin32]::SetWindowRgn($Window, $region, $true) -eq 0) {
    [void][FeMonsterWin32]::DeleteObject($region)
  }
}

function Get-ProcessFamilyIds {
  param([long]$RootProcessId)

  $ids = New-Object System.Collections.Generic.HashSet[long]
  [void]$ids.Add($RootProcessId)

  for ($depth = 0; $depth -lt 4; $depth += 1) {
    $snapshot = @($ids)
    foreach ($id in $snapshot) {
      Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" | ForEach-Object {
        [void]$ids.Add([long]$_.ProcessId)
      }
    }
  }

  return @($ids)
}

function Find-MainWindow {
  param([long[]]$ProcessIds)

  $script:foundWindow = [IntPtr]::Zero
  [FeMonsterWin32]::EnumWindows({
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    if (-not [FeMonsterWin32]::IsWindowVisible($hWnd)) { return $true }
    [uint32]$windowPid = 0
    [void][FeMonsterWin32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
    if ($ProcessIds -contains [long]$windowPid) {
      $script:foundWindow = $hWnd
      return $false
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  return $script:foundWindow
}

for ($attempt = 0; $attempt -lt 24; $attempt += 1) {
  $ids = Get-ProcessFamilyIds -RootProcessId $TargetProcessId
  $window = Find-MainWindow -ProcessIds $ids
  if ($window -ne [IntPtr]::Zero) {
    if ($ShapeOnly) {
      if ($Fullscreen) {
        [void][FeMonsterWin32]::SetWindowRgn($window, [IntPtr]::Zero, $true)
      } else {
        $clientRect = New-Object FeMonsterWin32+RECT
        if ([FeMonsterWin32]::GetClientRect($window, [ref]$clientRect)) {
          $clientWidth = [Math]::Max(1, $clientRect.Right - $clientRect.Left)
          $clientHeight = [Math]::Max(1, $clientRect.Bottom - $clientRect.Top)
          Set-NativeRoundedWindow -Window $window -WindowWidth $clientWidth -WindowHeight $clientHeight
        }
      }
      exit 0
    }
    $style = [FeMonsterWin32]::GetWindowLongPtr($window, $GWL_STYLE).ToInt64()
    $borderMask = $WS_CAPTION -bor $WS_THICKFRAME
    $nextStyle = $style -band (-bnot $borderMask)
    [void][FeMonsterWin32]::SetWindowLongPtr($window, $GWL_STYLE, [IntPtr]$nextStyle)
    [void][FeMonsterWin32]::SetWindowPos(
      $window,
      [IntPtr]::Zero,
      $X,
      $Y,
      $Width,
      $Height,
      $SWP_NOZORDER -bor $SWP_NOOWNERZORDER -bor $SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW
    )
    Set-NativeRoundedWindow -Window $window -WindowWidth $Width -WindowHeight $Height
    exit 0
  }
  Start-Sleep -Milliseconds 180
}

exit 0
