param(
  [Parameter(Mandatory = $true)]
  [long]$TargetProcessId,
  [int]$Width = 1120,
  [int]$Height = 720,
  [int]$X = 120,
  [int]$Y = 80
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;

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
}
"@

$GWL_STYLE = -16
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$SWP_NOZORDER = 0x0004
$SWP_NOOWNERZORDER = 0x0200
$SWP_FRAMECHANGED = 0x0020
$SWP_SHOWWINDOW = 0x0040

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
    exit 0
  }
  Start-Sleep -Milliseconds 180
}

exit 0
