[CmdletBinding()]
param(
  [string]$Root = '',
  [string]$ClientPath = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$clientPath = if ([string]::IsNullOrWhiteSpace($ClientPath)) {
  (Resolve-Path -LiteralPath (Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe')).Path
} else {
  (Resolve-Path -LiteralPath $ClientPath).Path
}
$fixturePath = (Resolve-Path -LiteralPath (Join-Path $rootPath 'scripts\fixtures\webview-software-fallback-server.mjs')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Get-DescendantProcessIds([int]$ParentId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $ids = New-Object Collections.Generic.List[int]
  $ids.Add($ParentId)
  for ($index = 0; $index -lt $ids.Count; $index += 1) {
    foreach ($child in @($all | Where-Object { [int]$_.ParentProcessId -eq $ids[$index] })) {
      if (!$ids.Contains([int]$child.ProcessId)) { $ids.Add([int]$child.ProcessId) }
    }
  }
  return $ids.ToArray()
}

function Stop-OwnedTree([int]$RootId) {
  $ids = @(Get-DescendantProcessIds $RootId)
  Stop-Process -Id $RootId -Force -ErrorAction SilentlyContinue
  for ($index = $ids.Count - 1; $index -ge 1; $index -= 1) {
    Stop-Process -Id $ids[$index] -Force -ErrorAction SilentlyContinue
  }
  foreach ($id in $ids) {
    try { [void](Get-Process -Id $id -ErrorAction Stop).WaitForExit(3000) } catch { }
  }
}

function Get-TestProfilePaths([string]$RegistryPath) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes("`n" + $RegistryPath))).Replace('-', '').Substring(0, 16)
  } finally { $sha.Dispose() }
  $profileRoot = Join-Path ([IO.Path]::GetTempPath()) 'FE Monster\WebView2'
  return @(
    (Join-Path $profileRoot "DesktopHostV2-Test-$hash"),
    (Join-Path $profileRoot "DesktopHostV2-Test-$hash-SoftwareRecovery")
  )
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FeSoftwareFallbackPixels {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref POINT point);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
'@

function Get-VisiblePixelDiversity([Diagnostics.Process]$Process) {
  Add-Type -AssemblyName System.Drawing
  $client = New-Object FeSoftwareFallbackPixels+RECT
  [void][FeSoftwareFallbackPixels]::GetClientRect($Process.MainWindowHandle, [ref]$client)
  $origin = New-Object FeSoftwareFallbackPixels+POINT
  [void][FeSoftwareFallbackPixels]::ClientToScreen($Process.MainWindowHandle, [ref]$origin)
  $width = [Math]::Max(1, $client.Right - $client.Left)
  $height = [Math]::Max(1, $client.Bottom - $client.Top)
  $bitmap = New-Object Drawing.Bitmap $width, $height
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, (New-Object Drawing.Size $width, $height), [Drawing.CopyPixelOperation]::SourceCopy)
    $colors = New-Object Collections.Generic.HashSet[string]
    foreach ($y in 0..7) { foreach ($x in 0..11) {
      $sampleX = [Math]::Min($width - 1, [Math]::Floor(($x + .5) * $width / 12))
      $sampleY = [Math]::Min($height - 1, [Math]::Floor(($y + .5) * $height / 8))
      $pixel = $bitmap.GetPixel([int]$sampleX, [int]$sampleY)
      [void]$colors.Add("$($pixel.R),$($pixel.G),$($pixel.B)")
    }}
    return $colors.Count
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

$port = Get-FreePort
$server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $fixturePath + '"'), $port, '--fail-first-navigation') -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
$client = $null
$status = $null
$testRegistryPath = "Software\FE Monster\DesktopPetTest\software-fallback-$PID"
$testDataRoot = Join-Path ([IO.Path]::GetTempPath()) "FE Monster\SoftwareFallback-$PID-$([Guid]::NewGuid().ToString('N'))\data"
$phase = 'fixture-start'
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  do {
    try { $fixture = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $fixture = $null }
    if ($server.HasExited) { throw 'software fallback fixture exited early' }
    if (!$fixture) { Start-Sleep -Milliseconds 80 }
  } while (!$fixture -and [DateTime]::UtcNow -lt $deadline)
  if (!$fixture) { throw 'software fallback fixture did not start' }

  $phase = 'client-start'
  $savedTestRegistryPath = $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH
  $savedDataRoot = $env:FE_MONSTER_DATA_DIR
  $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $testRegistryPath
  $env:FE_MONSTER_DATA_DIR = $testDataRoot
  try {
    $client = Start-Process -FilePath $clientPath -ArgumentList @(
      '--url', "http://127.0.0.1:$port/?client=embedded",
      '--gpu', 'false', '--width', '920', '--height', '640'
    ) -WorkingDirectory $rootPath -PassThru
  } finally {
    $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $savedTestRegistryPath
    $env:FE_MONSTER_DATA_DIR = $savedDataRoot
  }
  $phase = 'dom-ready'
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  do {
    Start-Sleep -Milliseconds 120
    $client.Refresh()
    if ($client.HasExited) { throw "software fallback client exited with $($client.ExitCode)" }
    try { $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $status = $null }
  } while ((!$status.domReady -or $client.MainWindowHandle -eq 0) -and [DateTime]::UtcNow -lt $deadline)
  if (!$status.domReady) { throw 'DOM ready was not observed with GPU disabled' }
  if ($client.MainWindowHandle -eq 0) { throw 'software fallback client window was not created' }
  $phase = 'visible-pixels'
  Start-Sleep -Milliseconds 500
  $diversity = Get-VisiblePixelDiversity $client
  if ($diversity -lt 2) { throw "software fallback rendered an empty surface (color count $diversity)" }
  if ($status.pageAttempts -lt 2) { throw "navigation recovery was not exercised (attempts $($status.pageAttempts))" }
  [pscustomobject]@{ passed = $true; gpuRequested = $false; domReady = $status.domReady; marker = $status.page.marker; navigationAttempts = $status.pageAttempts; visibleColorCount = $diversity } | ConvertTo-Json -Compress
} catch {
  $diagnostics = [ordered]@{
    phase = $phase
    clientId = if ($null -ne $client) { $client.Id } else { $null }
    clientExited = if ($null -ne $client) { $client.HasExited } else { $null }
    mainWindowHandle = if ($null -ne $client -and !$client.HasExited) { $client.MainWindowHandle } else { 0 }
    fixture = $status
  }
  if ($null -ne $client -and !$client.HasExited -and $client.MainWindowHandle -ne 0) {
    try { $diagnostics.visibleColorCount = Get-VisiblePixelDiversity $client } catch { $diagnostics.pixelError = $_.Exception.Message }
  }
  throw "software fallback probe failed during $phase at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message); evidence=$($diagnostics | ConvertTo-Json -Compress -Depth 5)"
} finally {
  if ($null -ne $client) { Stop-OwnedTree $client.Id }
  if ($null -ne $server -and !$server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue; [void]$server.WaitForExit(5000) }
  $testRoot = Split-Path -Parent $testDataRoot
  if (Test-Path -LiteralPath $testRoot -PathType Container) { Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue }
  foreach ($profilePath in Get-TestProfilePaths $testRegistryPath) {
    if (Test-Path -LiteralPath $profilePath -PathType Container) { Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Remove-Item -LiteralPath ("HKCU:\" + $testRegistryPath) -Recurse -Force -ErrorAction SilentlyContinue
}
