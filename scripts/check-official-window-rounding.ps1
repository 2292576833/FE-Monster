[CmdletBinding()]
param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
$rootPath = (Resolve-Path $Root).Path
$expectedExecutable = (Resolve-Path (Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe')).Path
$legacyExecutable = Join-Path $rootPath 'native\windows\build\fe-monster-client.exe'
$expectedVersion = [string](Get-Content -Raw (Join-Path $rootPath 'package.json') | ConvertFrom-Json).version

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class FeOfficialWindowRoundingProbe
{
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

    [DllImport("user32.dll")]
    public static extern int GetWindowRgn(IntPtr hwnd, IntPtr region);

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

$allClients = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'FE Monster.exe' })
$officialClients = @($allClients | Where-Object { $_.ExecutablePath -ieq $expectedExecutable })
$legacyClients = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'fe-monster-client.exe' })
$visibleLegacyClients = @($legacyClients | Where-Object {
  if ($_.ExecutablePath -ine $legacyExecutable) { return $false }
  $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  return $null -ne $process -and $process.MainWindowHandle -ne 0 -and
    [FeOfficialWindowRoundingProbe]::IsWindowVisible($process.MainWindowHandle)
})

if ($officialClients.Count -ne 1) {
  $result = [ordered]@{
    pass = $false
    failures = @("expected exactly one official WinForms client, found $($officialClients.Count)")
    expectedExecutable = $expectedExecutable
    clients = @($allClients | Select-Object ProcessId, ExecutablePath, CommandLine)
  }
  $result | ConvertTo-Json -Depth 5
  exit 1
}

$client = $officialClients[0]
$runtimeProcess = Get-Process -Id $client.ProcessId -ErrorAction Stop
$parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($client.ParentProcessId)" -ErrorAction SilentlyContinue
$backend = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ParentProcessId -eq $client.ProcessId -and
    $_.Name -in @('FE Monster Backend.exe', 'javaw.exe', 'java.exe') -and
    $_.CommandLine -match [regex]::Escape((Join-Path $rootPath 'out\fe-monster-java.jar'))
  } |
  Select-Object -First 1
$windowHandle = [IntPtr]$runtimeProcess.MainWindowHandle
$className = New-Object System.Text.StringBuilder 256
[void][FeOfficialWindowRoundingProbe]::GetClassName($windowHandle, $className, $className.Capacity)

$cornerPreference = -1
$dwmResult = if ($windowHandle -ne [IntPtr]::Zero) {
  [FeOfficialWindowRoundingProbe]::DwmGetWindowAttribute($windowHandle, 33, [ref]$cornerPreference, 4)
} else {
  -1
}

$regionType = -1
if ($windowHandle -ne [IntPtr]::Zero) {
  $probeRegion = [FeOfficialWindowRoundingProbe]::CreateRectRgn(0, 0, 1, 1)
  try {
    $regionType = [FeOfficialWindowRoundingProbe]::GetWindowRgn($windowHandle, $probeRegion)
  } finally {
    [void][FeOfficialWindowRoundingProbe]::DeleteObject($probeRegion)
  }
}

$processTreePath = Join-Path $rootPath 'out\process-tree.json'
$processTree = if (Test-Path -LiteralPath $processTreePath) {
  Get-Content -LiteralPath $processTreePath -Raw | ConvertFrom-Json
} else {
  $null
}
$clientUrl = if ($null -ne $processTree -and $processTree.port) {
  "http://127.0.0.1:$($processTree.port)/?client=embedded"
} else {
  ''
}
$pageTitle = ''
$pageHasAppShell = $false
if (-not [string]::IsNullOrWhiteSpace($clientUrl)) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $clientUrl -TimeoutSec 3
    $pageTitle = [regex]::Match($response.Content, '<title>(.*?)</title>').Groups[1].Value
    $pageHasAppShell = $response.Content -match 'class="app-shell"'
  } catch {
  }
}

$fileVersion = (Get-Item $expectedExecutable).VersionInfo.FileVersion
$checks = [ordered]@{
  officialExecutable = $client.ExecutablePath -ieq $expectedExecutable
  officialVersion = $fileVersion -like "$expectedVersion.*"
  launchedWithEmbeddedUrl = $clientUrl -match '^http://127\.0\.0\.1:\d+/\?client=embedded(?:&|$)'
  officialPageLoaded = $pageTitle -eq 'FE Monster Java' -and $pageHasAppShell
  namedMainProcess = $client.Name -ieq 'FE Monster.exe'
  javaBackendChild = $null -ne $backend
  visibleWindow = $windowHandle -ne [IntPtr]::Zero -and
    [FeOfficialWindowRoundingProbe]::IsWindowVisible($windowHandle)
  winFormsWindowClass = $className.ToString() -like 'WindowsForms10.Window.*'
  dwmNativeRoundingEnabled = $dwmResult -eq 0 -and $cornerPreference -eq 2
  largeManualWindowRegion = $regionType -gt 0
  noVisibleLegacyClient = $visibleLegacyClients.Count -eq 0
}

$failures = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
$result = [ordered]@{
  pass = $failures.Count -eq 0
  processId = $client.ProcessId
  executablePath = $client.ExecutablePath
  fileVersion = $fileVersion
  parentProcessId = $client.ParentProcessId
  parentName = $parent.Name
  backendProcessId = $backend.ProcessId
  clientUrl = $clientUrl
  pageTitle = $pageTitle
  windowHandle = ('0x{0:X}' -f $windowHandle.ToInt64())
  windowClass = $className.ToString()
  dwmResult = $dwmResult
  cornerPreference = $cornerPreference
  regionType = $regionType
  checks = $checks
  failures = $failures
}

$result | ConvertTo-Json -Depth 5
if (-not $result.pass) { exit 1 }
