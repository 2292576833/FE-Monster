[CmdletBinding()]
param(
  [string]$Root = '',
  [int]$ExpectedDpi = 0
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$rootPath = (Resolve-Path $Root).Path
$clientPath = (Resolve-Path (Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe')).Path
$fixturePath = (Resolve-Path (Join-Path $rootPath 'scripts\fixtures\window-surface-probe-server.mjs')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class FeWindowSurfaceProbe
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MONITORINFO
    {
        public int Size;
        public RECT Monitor;
        public RECT Work;
        public int Flags;
    }

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    [DllImport("dwmapi.dll")]
    public static extern int DwmFlush();

    public delegate bool EnumChildProc(IntPtr hwnd, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr parent, EnumChildProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(
        IntPtr hwnd,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags
    );

    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);

    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

    public static IntPtr FindLargestVisibleChild(IntPtr parent)
    {
        IntPtr largest = IntPtr.Zero;
        long largestArea = 0;
        EnumChildWindows(parent, (candidate, parameter) =>
        {
            if (GetParent(candidate) != parent) return true;
            if (!IsWindowVisible(candidate)) return true;
            RECT rect;
            if (!GetWindowRect(candidate, out rect)) return true;
            long width = Math.Max(0, rect.Right - rect.Left);
            long height = Math.Max(0, rect.Bottom - rect.Top);
            long area = width * height;
            if (area > largestArea)
            {
                largest = candidate;
                largestArea = area;
            }
            return true;
        }, IntPtr.Zero);
        return largest;
    }
}
'@

# PowerShell itself is usually system-DPI aware. Switch the probe thread to
# per-monitor-v2 so top-level WinForms and WebView2 child rectangles are read in
# the same physical coordinate space at both 100% and 125% scaling.
[void][FeWindowSurfaceProbe]::SetThreadDpiAwarenessContext([IntPtr](-4))

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Test-FixtureReady([int]$Port) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-WindowSurface([Diagnostics.Process]$Process) {
  $Process.Refresh()
  $window = [IntPtr]$Process.MainWindowHandle
  if ($window -eq [IntPtr]::Zero) { throw 'The client has no main window.' }

  $windowRect = New-Object FeWindowSurfaceProbe+RECT
  $clientRect = New-Object FeWindowSurfaceProbe+RECT
  [void][FeWindowSurfaceProbe]::GetWindowRect($window, [ref]$windowRect)
  [void][FeWindowSurfaceProbe]::GetClientRect($window, [ref]$clientRect)
  $clientOrigin = New-Object FeWindowSurfaceProbe+POINT
  [void][FeWindowSurfaceProbe]::ClientToScreen($window, [ref]$clientOrigin)

  $cornerPreference = -1
  $visibleFrameBorderThickness = -1
  $cornerResult = [FeWindowSurfaceProbe]::DwmGetWindowAttribute($window, 33, [ref]$cornerPreference, 4)
  # DWMWA_BORDER_COLOR (34) is set-only. Querying it does not verify that the
  # application wrote COLOR_NONE. The probe must never write COLOR_NONE itself,
  # because doing so would hide the exact bright-border regression it measures.
  # DWMWA_VISIBLE_FRAME_BORDER_THICKNESS (37) only describes the geometry.
  $visibleBorderResult = [FeWindowSurfaceProbe]::DwmGetWindowAttribute(
    $window,
    37,
    [ref]$visibleFrameBorderThickness,
    4
  )

  $monitor = [FeWindowSurfaceProbe]::MonitorFromWindow($window, 2)
  $monitorInfo = New-Object FeWindowSurfaceProbe+MONITORINFO
  $monitorInfo.Size = [Runtime.InteropServices.Marshal]::SizeOf($monitorInfo)
  [void][FeWindowSurfaceProbe]::GetMonitorInfo($monitor, [ref]$monitorInfo)

  $clientScreen = [ordered]@{
    left = $clientOrigin.X
    top = $clientOrigin.Y
    right = $clientOrigin.X + $clientRect.Right - $clientRect.Left
    bottom = $clientOrigin.Y + $clientRect.Bottom - $clientRect.Top
  }
  $largestChild = [FeWindowSurfaceProbe]::FindLargestVisibleChild($window)
  $childScreen = $null
  if ($largestChild -ne [IntPtr]::Zero) {
    $childRect = New-Object FeWindowSurfaceProbe+RECT
    if ([FeWindowSurfaceProbe]::GetWindowRect($largestChild, [ref]$childRect)) {
      $childScreen = [ordered]@{
        left = $childRect.Left
        top = $childRect.Top
        right = $childRect.Right
        bottom = $childRect.Bottom
      }
    }
  }
  $windowScreen = [ordered]@{
    left = $windowRect.Left
    top = $windowRect.Top
    right = $windowRect.Right
    bottom = $windowRect.Bottom
  }
  $monitorScreen = [ordered]@{
    left = $monitorInfo.Monitor.Left
    top = $monitorInfo.Monitor.Top
    right = $monitorInfo.Monitor.Right
    bottom = $monitorInfo.Monitor.Bottom
  }

  return [ordered]@{
    dpi = [FeWindowSurfaceProbe]::GetDpiForWindow($window)
    cornerResult = $cornerResult
    cornerPreference = $cornerPreference
    visibleBorderResult = $visibleBorderResult
    visibleFrameBorderThickness = $visibleFrameBorderThickness
    maximized = [FeWindowSurfaceProbe]::IsZoomed($window)
    window = $windowScreen
    client = $clientScreen
    largestVisibleChild = $childScreen
    monitor = $monitorScreen
    clientOwnsWindow =
      $clientScreen.left -eq $windowScreen.left -and
      $clientScreen.top -eq $windowScreen.top -and
      $clientScreen.right -eq $windowScreen.right -and
      $clientScreen.bottom -eq $windowScreen.bottom
    webViewOwnsClient =
      $null -ne $childScreen -and
      $childScreen.left -eq $clientScreen.left -and
      $childScreen.top -eq $clientScreen.top -and
      $childScreen.right -eq $clientScreen.right -and
      $childScreen.bottom -eq $clientScreen.bottom
    fillsMonitor =
      $windowScreen.left -eq $monitorScreen.left -and
      $windowScreen.top -eq $monitorScreen.top -and
      $windowScreen.right -eq $monitorScreen.right -and
      $windowScreen.bottom -eq $monitorScreen.bottom
  }
}

function Set-TestWhiteWindowBorder([IntPtr]$Window) {
  # Simulate a compositor/theme transition restoring the default bright frame.
  # A correct host replays COLOR_NONE on the following resize/state transition.
  $white = 0x00ffffff
  return [FeWindowSurfaceProbe]::DwmSetWindowAttribute(
    $Window,
    34,
    [ref]$white,
    4
  )
}

function Get-TopEdgeSample([object]$Surface) {
  Add-Type -AssemblyName System.Drawing
  $windowWidth = [int]$Surface.window.right - [int]$Surface.window.left
  $sampleWidth = [Math]::Max(1, [int][Math]::Floor($windowWidth * 0.6))
  $sampleLeft = [int]$Surface.window.left + [int][Math]::Floor(($windowWidth - $sampleWidth) / 2)
  $sampleTop = [Math]::Max([int]$Surface.window.top, [int]$Surface.monitor.top)
  $sampleHeight = 2
  $bitmap = New-Object Drawing.Bitmap $sampleWidth, $sampleHeight
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen(
      $sampleLeft,
      $sampleTop,
      0,
      0,
      $bitmap.Size,
      [Drawing.CopyPixelOperation]::SourceCopy
    )
    $brightPixels = 0
    $maximumChannel = 0
    for ($y = 0; $y -lt $sampleHeight; $y += 1) {
      for ($x = 0; $x -lt $sampleWidth; $x += 1) {
        $pixel = $bitmap.GetPixel($x, $y)
        $maximumChannel = [Math]::Max($maximumChannel, [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B)))
        if ($pixel.R -ge 210 -and $pixel.G -ge 210 -and $pixel.B -ge 210) {
          $brightPixels += 1
        }
      }
    }
    return [ordered]@{
      left = $sampleLeft
      top = $sampleTop
      width = $sampleWidth
      height = $sampleHeight
      brightPixels = $brightPixels
      maximumChannel = $maximumChannel
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Send-FixtureWindowCommand([int]$Port, [string]$Action) {
  Invoke-WebRequest `
    -UseBasicParsing `
    -Method Post `
    -Uri "http://127.0.0.1:$Port/command/$Action" `
    -TimeoutSec 2 |
    Out-Null
}

function Invoke-TestWindowTransition(
  [string]$Mode,
  [int]$Port,
  [Diagnostics.Process]$Process
) {
  $Process.Refresh()
  $window = [IntPtr]$Process.MainWindowHandle
  $injectionResult = Set-TestWhiteWindowBorder $window
  if ($injectionResult -ne 0) {
    throw "The DWM test border could not be set in $Mode mode (HRESULT $injectionResult)."
  }

  if ($Mode -eq 'normal') {
    $before = Get-WindowSurface $Process
    $width = [int]$before.window.right - [int]$before.window.left
    $height = [int]$before.window.bottom - [int]$before.window.top
    [void][FeWindowSurfaceProbe]::SetWindowPos(
      $window,
      [IntPtr]::Zero,
      0,
      0,
      $width + 8,
      $height + 4,
      0x0016
    )
  } elseif ($Mode -eq 'maximized') {
    [void][FeWindowSurfaceProbe]::ShowWindow($window, 3)
  } elseif ($Mode -eq 'fullscreen') {
    Send-FixtureWindowCommand $Port 'fullscreen'
  } else {
    throw "Unsupported window mode: $Mode"
  }

  [void][FeWindowSurfaceProbe]::SetForegroundWindow($window)
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  do {
    Start-Sleep -Milliseconds 80
    $surface = Get-WindowSurface $Process
    $settled = switch ($Mode) {
      'normal' { -not $surface.maximized -and -not $surface.fillsMonitor }
      'maximized' { $surface.maximized -and $surface.webViewOwnsClient }
      'fullscreen' { -not $surface.maximized -and $surface.fillsMonitor -and $surface.cornerPreference -eq 1 }
    }
  } while (-not $settled -and [DateTime]::UtcNow -lt $deadline)

  [void][FeWindowSurfaceProbe]::DwmFlush()
  Start-Sleep -Milliseconds 120
  $surface = Get-WindowSurface $Process
  $surface['testBorderInjectionResult'] = $injectionResult
  $surface['topEdge'] = Get-TopEdgeSample $surface
  return $surface
}

function Invoke-WindowModeProbe([string]$Mode) {
  $port = Get-FreePort
  $server = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @((('"' + $fixturePath + '"')), $port, $Mode) `
    -WorkingDirectory $rootPath `
    -WindowStyle Hidden `
    -PassThru
  $client = $null
  try {
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    while (-not (Test-FixtureReady $port)) {
      if ($server.HasExited) { throw "Fixture server exited in $Mode mode." }
      if ([DateTime]::UtcNow -ge $deadline) { throw "Fixture server timed out in $Mode mode." }
      Start-Sleep -Milliseconds 50
    }

    $client = Start-Process `
      -FilePath $clientPath `
      -ArgumentList @('--url', "http://127.0.0.1:$port/?client=embedded", '--width', '1200', '--height', '760') `
      -WorkingDirectory $rootPath `
      -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 100
      $client.Refresh()
      if ($client.HasExited) { throw "Client exited in $Mode mode." }
    } while ($client.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($client.MainWindowHandle -eq 0) { throw "Client window timed out in $Mode mode." }

    do {
      Start-Sleep -Milliseconds 100
      $surface = Get-WindowSurface $client
    } while (-not $surface.webViewOwnsClient -and [DateTime]::UtcNow -lt $deadline)
    if (-not $surface.webViewOwnsClient) {
      throw "WebView2 did not cover the client before the $Mode transition."
    }
    return Invoke-TestWindowTransition $Mode $port $client
  } finally {
    if ($null -ne $client -and -not $client.HasExited) {
      Stop-Process -Id $client.Id -Force
      [void]$client.WaitForExit(5000)
    }
    if (-not $server.HasExited) {
      Stop-Process -Id $server.Id -Force
      [void]$server.WaitForExit(5000)
    }
  }
}

$normal = Invoke-WindowModeProbe 'normal'
$maximized = Invoke-WindowModeProbe 'maximized'
$fullscreen = Invoke-WindowModeProbe 'fullscreen'
$checks = [ordered]@{
  normalClientOwnsEveryWindowPixel = $normal.clientOwnsWindow
  normalWebViewOwnsEveryClientPixel = $normal.webViewOwnsClient
  normalUsesLargeDwmCorners = $normal.cornerResult -eq 0 -and $normal.cornerPreference -eq 2
  normalTopEdgeRemainsDarkAfterResize = $normal.topEdge.brightPixels -eq 0
  normalVisibleFrameGeometryIsThin = $normal.visibleBorderResult -eq 0 -and $normal.visibleFrameBorderThickness -le 2
  maximizedStateWasExercised = $maximized.maximized
  maximizedClientOwnsEveryWindowPixel = $maximized.clientOwnsWindow
  maximizedWebViewOwnsEveryClientPixel = $maximized.webViewOwnsClient
  maximizedTopEdgeRemainsDark = $maximized.topEdge.brightPixels -eq 0
  fullscreenClientOwnsEveryWindowPixel = $fullscreen.clientOwnsWindow
  fullscreenWebViewOwnsEveryClientPixel = $fullscreen.webViewOwnsClient
  fullscreenFillsMonitor = $fullscreen.fillsMonitor
  fullscreenCornersAreDisabled = $fullscreen.cornerResult -eq 0 -and $fullscreen.cornerPreference -eq 1
  fullscreenTopEdgeRemainsDark = $fullscreen.topEdge.brightPixels -eq 0
  fullscreenVisibleFrameGeometryIsThin = $fullscreen.visibleBorderResult -eq 0 -and $fullscreen.visibleFrameBorderThickness -le 2
  expectedDpiObserved = $ExpectedDpi -le 0 -or (
    $normal.dpi -eq $ExpectedDpi -and
    $maximized.dpi -eq $ExpectedDpi -and
    $fullscreen.dpi -eq $ExpectedDpi
  )
}
$failures = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
$result = [ordered]@{
  pass = $failures.Count -eq 0
  normal = $normal
  maximized = $maximized
  fullscreen = $fullscreen
  checks = $checks
  failures = $failures
}
$result | ConvertTo-Json -Depth 8
if (-not $result.pass) { exit 1 }
