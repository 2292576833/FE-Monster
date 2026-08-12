param(
  [Parameter(Mandatory = $true)]
  [long]$TargetProcessId,
  [int]$Width = 1760,
  [int]$Height = 990,
  [int]$X = 120,
  [int]$Y = 80,
  [switch]$ShapeOnly,
  [switch]$Fullscreen
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;

public struct FeMonsterRect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
public struct FeMonsterMonitorInfo {
    public int Size;
    public FeMonsterRect Monitor;
    public FeMonsterRect Work;
    public int Flags;
}

public static class FeMonsterWin32 {
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
    public static extern bool GetWindowRect(IntPtr hWnd, out FeMonsterRect rect);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool GetMonitorInfo(IntPtr monitor, ref FeMonsterMonitorInfo info);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool SystemParametersInfo(uint action, uint parameter, ref FeMonsterRect value, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hWnd, int attribute, ref int value, int size);
}
"@

$GWL_STYLE = -16
$WS_BORDER = 0x00800000
$WS_DLGFRAME = 0x00400000
$WS_THICKFRAME = 0x00040000
$SWP_NOZORDER = 0x0004
$SWP_NOOWNERZORDER = 0x0200
$SWP_FRAMECHANGED = 0x0020
$SWP_SHOWWINDOW = 0x0040
$DWMWA_WINDOW_CORNER_PREFERENCE = 33
$DWMWCP_DONOTROUND = 1
$DWMWCP_ROUND = 2
$MONITOR_DEFAULTTONEAREST = 2
$SPI_GETWORKAREA = 48
$WINDOW_WORK_AREA_MARGIN = 24

function Get-FittedWindowBounds {
  param(
    [IntPtr]$Window,
    [int]$RequestedX,
    [int]$RequestedY,
    [int]$RequestedWidth,
    [int]$RequestedHeight
  )

  $work = [FeMonsterRect]::new()
  $monitor = [FeMonsterWin32]::MonitorFromWindow($Window, $MONITOR_DEFAULTTONEAREST)
  $info = [FeMonsterMonitorInfo]::new()
  $info.Size = [Runtime.InteropServices.Marshal]::SizeOf([type][FeMonsterMonitorInfo])
  $hasWorkArea = $monitor -ne [IntPtr]::Zero -and [FeMonsterWin32]::GetMonitorInfo($monitor, [ref]$info)
  if ($hasWorkArea) {
    $work = $info.Work
  } else {
    $hasWorkArea = [FeMonsterWin32]::SystemParametersInfo($SPI_GETWORKAREA, 0, [ref]$work, 0)
  }
  if (!$hasWorkArea) {
    return [pscustomobject]@{
      X = $RequestedX
      Y = $RequestedY
      Width = [Math]::Max(1, $RequestedWidth)
      Height = [Math]::Max(1, $RequestedHeight)
    }
  }

  $workingWidth = [Math]::Max(1, $work.Right - $work.Left)
  $workingHeight = [Math]::Max(1, $work.Bottom - $work.Top)
  $horizontalMargin = [int][Math]::Min($WINDOW_WORK_AREA_MARGIN, [Math]::Max(0, [Math]::Floor(($workingWidth - 1) / 2)))
  $verticalMargin = [int][Math]::Min($WINDOW_WORK_AREA_MARGIN, [Math]::Max(0, [Math]::Floor(($workingHeight - 1) / 2)))
  $safeLeft = [int]($work.Left + $horizontalMargin)
  $safeTop = [int]($work.Top + $verticalMargin)
  $safeWidth = [int][Math]::Max(1, $workingWidth - 2 * $horizontalMargin)
  $safeHeight = [int][Math]::Max(1, $workingHeight - 2 * $verticalMargin)
  $requestedWidth = [Math]::Max(1, $RequestedWidth)
  $requestedHeight = [Math]::Max(1, $RequestedHeight)
  $scale = [Math]::Min(
    1.0,
    [Math]::Min($safeWidth / [double]$requestedWidth, $safeHeight / [double]$requestedHeight)
  )
  $fittedWidth = [Math]::Max(1, [Math]::Min($safeWidth, [Math]::Floor($requestedWidth * $scale)))
  $fittedHeight = [Math]::Max(1, [Math]::Min($safeHeight, [Math]::Floor($requestedHeight * $scale)))
  $maximumX = $safeLeft + $safeWidth - $fittedWidth
  $maximumY = $safeTop + $safeHeight - $fittedHeight
  return [pscustomobject]@{
    X = [int][Math]::Max($safeLeft, [Math]::Min($RequestedX, $maximumX))
    Y = [int][Math]::Max($safeTop, [Math]::Min($RequestedY, $maximumY))
    Width = [int]$fittedWidth
    Height = [int]$fittedHeight
  }
}

function Set-NativeRoundedWindow {
  param(
    [IntPtr]$Window,
    [switch]$Fullscreen
  )

  try {
    $preference = if ($Fullscreen) { $DWMWCP_DONOTROUND } else { $DWMWCP_ROUND }
    [void][FeMonsterWin32]::DwmSetWindowAttribute(
      $Window,
      $DWMWA_WINDOW_CORNER_PREFERENCE,
      [ref]$preference,
      4
    )
  } catch {
  }

  [void][FeMonsterWin32]::SetWindowRgn($Window, [IntPtr]::Zero, $true)
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
      if (!$Fullscreen) {
        $currentBounds = [FeMonsterRect]::new()
        if ([FeMonsterWin32]::GetWindowRect($window, [ref]$currentBounds)) {
          $fitted = Get-FittedWindowBounds `
            -Window $window `
            -RequestedX $currentBounds.Left `
            -RequestedY $currentBounds.Top `
            -RequestedWidth ($currentBounds.Right - $currentBounds.Left) `
            -RequestedHeight ($currentBounds.Bottom - $currentBounds.Top)
          [void][FeMonsterWin32]::SetWindowPos(
            $window,
            [IntPtr]::Zero,
            $fitted.X,
            $fitted.Y,
            $fitted.Width,
            $fitted.Height,
            $SWP_NOZORDER -bor $SWP_NOOWNERZORDER -bor $SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW
          )
        }
      }
      Set-NativeRoundedWindow -Window $window -Fullscreen:$Fullscreen
      exit 0
    }
    $fitted = Get-FittedWindowBounds `
      -Window $window `
      -RequestedX $X `
      -RequestedY $Y `
      -RequestedWidth $Width `
      -RequestedHeight $Height
    $style = [FeMonsterWin32]::GetWindowLongPtr($window, $GWL_STYLE).ToInt64()
    $nextStyle = ($style -band (-bnot $WS_DLGFRAME)) -bor $WS_BORDER -bor $WS_THICKFRAME
    [void][FeMonsterWin32]::SetWindowLongPtr($window, $GWL_STYLE, [IntPtr]$nextStyle)
    [void][FeMonsterWin32]::SetWindowPos(
      $window,
      [IntPtr]::Zero,
      $fitted.X,
      $fitted.Y,
      $fitted.Width,
      $fitted.Height,
      $SWP_NOZORDER -bor $SWP_NOOWNERZORDER -bor $SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW
    )
    Set-NativeRoundedWindow -Window $window -Fullscreen:$Fullscreen
    exit 0
  }
  Start-Sleep -Milliseconds 180
}

exit 0
