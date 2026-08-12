[CmdletBinding()]
param(
  [string]$Root = '',
  [string]$Url = 'http://127.0.0.1:3000/?client=embedded'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$rootPath = (Resolve-Path $Root).Path
$clientPath = (Resolve-Path (Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe')).Path

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class FeLiveWindowRoundingProbe
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

    [DllImport("user32.dll")]
    public static extern int GetWindowRgn(IntPtr hwnd, IntPtr region);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hwnd, StringBuilder value, int maxCount);

    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateRectRgn(int left, int top, int right, int bottom);

    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr value);
}
'@

function New-PointLParam {
  param(
    [int]$X,
    [int]$Y
  )

  $packedPoint = (([long]$Y -band 0xffffL) -shl 16) -bor ([long]$X -band 0xffffL)
  return [IntPtr]$packedPoint
}

$client = Start-Process -FilePath $clientPath -ArgumentList '--url', $Url -PassThru
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 150
    $client.Refresh()
  } while (
    $client.MainWindowHandle -eq 0 -and
    -not $client.HasExited -and
    [DateTime]::UtcNow -lt $deadline
  )

  if ($client.HasExited) {
    throw "Client exited before creating a window (exit code $($client.ExitCode))."
  }
  if ($client.MainWindowHandle -eq 0) {
    throw 'Client did not create a main window within 20 seconds.'
  }

  $windowHandle = [IntPtr]$client.MainWindowHandle
  $cornerPreference = -1
  $dwmResult = [FeLiveWindowRoundingProbe]::DwmGetWindowAttribute(
    $windowHandle,
    33,
    [ref]$cornerPreference,
    4
  )

  $region = [FeLiveWindowRoundingProbe]::CreateRectRgn(0, 0, 1, 1)
  try {
    $regionType = [FeLiveWindowRoundingProbe]::GetWindowRgn($windowHandle, $region)
  } finally {
    [void][FeLiveWindowRoundingProbe]::DeleteObject($region)
  }

  $windowStyle = [FeLiveWindowRoundingProbe]::GetWindowLongPtr($windowHandle, -16).ToInt64()
  $bounds = New-Object FeLiveWindowRoundingProbe+RECT
  [void][FeLiveWindowRoundingProbe]::GetWindowRect($windowHandle, [ref]$bounds)

  $className = New-Object System.Text.StringBuilder 256
  [void][FeLiveWindowRoundingProbe]::GetClassName(
    $windowHandle,
    $className,
    $className.Capacity
  )

  $topLeftHit = [FeLiveWindowRoundingProbe]::SendMessage(
    $windowHandle,
    0x84,
    [IntPtr]::Zero,
    (New-PointLParam -X ($bounds.Left + 2) -Y ($bounds.Top + 2))
  ).ToInt64()
  $topRightHit = [FeLiveWindowRoundingProbe]::SendMessage(
    $windowHandle,
    0x84,
    [IntPtr]::Zero,
    (New-PointLParam -X ($bounds.Right - 2) -Y ($bounds.Top + 2))
  ).ToInt64()
  $bottomLeftHit = [FeLiveWindowRoundingProbe]::SendMessage(
    $windowHandle,
    0x84,
    [IntPtr]::Zero,
    (New-PointLParam -X ($bounds.Left + 2) -Y ($bounds.Bottom - 2))
  ).ToInt64()
  $bottomRightHit = [FeLiveWindowRoundingProbe]::SendMessage(
    $windowHandle,
    0x84,
    [IntPtr]::Zero,
    (New-PointLParam -X ($bounds.Right - 2) -Y ($bounds.Bottom - 2))
  ).ToInt64()

  $checks = [ordered]@{
    visible = [FeLiveWindowRoundingProbe]::IsWindowVisible($windowHandle)
    winFormsWindow = $className.ToString() -like 'WindowsForms10.Window.*'
    dwmLargeRound = $dwmResult -eq 0 -and $cornerPreference -eq 2
    noManualWindowRegion = $regionType -eq 0
    captionStylePreserved = ($windowStyle -band 0x00C00000L) -ne 0
    thickFramePreserved = ($windowStyle -band 0x00040000L) -ne 0
    topLeftResizeHit = $topLeftHit -eq 13
    topRightResizeHit = $topRightHit -eq 14
    bottomLeftResizeHit = $bottomLeftHit -eq 16
    bottomRightResizeHit = $bottomRightHit -eq 17
  }

  $failures = @(
    $checks.GetEnumerator() |
      Where-Object { -not $_.Value } |
      ForEach-Object { $_.Key }
  )

  $result = [ordered]@{
    pass = $failures.Count -eq 0
    processId = $client.Id
    windowHandle = ('0x{0:X}' -f $windowHandle.ToInt64())
    windowClass = $className.ToString()
    cornerPreference = $cornerPreference
    regionType = $regionType
    windowStyle = ('0x{0:X}' -f $windowStyle)
    hitTest = [ordered]@{
      topLeft = $topLeftHit
      topRight = $topRightHit
      bottomLeft = $bottomLeftHit
      bottomRight = $bottomRightHit
    }
    checks = $checks
    failures = $failures
  }

  $result | ConvertTo-Json -Depth 5
  if (-not $result.pass) {
    exit 1
  }
} finally {
  if ($null -ne $client -and -not $client.HasExited) {
    Stop-Process -Id $client.Id -Force
  }
}
