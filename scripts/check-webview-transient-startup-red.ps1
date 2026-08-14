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
$fixturePath = (Resolve-Path -LiteralPath (Join-Path $rootPath 'scripts\fixtures\webview-transient-startup-server.mjs')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Read-AppendedLog([string]$Path, [long]$Offset) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    [void]$stream.Seek([Math]::Min($Offset, $stream.Length), [IO.SeekOrigin]::Begin)
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true, 4096, $true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } finally { $stream.Dispose() }
}

function Stop-OwnedTree([int]$RootId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $ids = New-Object Collections.Generic.List[int]
  $ids.Add($RootId)
  for ($index = 0; $index -lt $ids.Count; $index += 1) {
    foreach ($child in @($all | Where-Object { [int]$_.ParentProcessId -eq $ids[$index] })) {
      if (!$ids.Contains([int]$child.ProcessId)) { $ids.Add([int]$child.ProcessId) }
    }
  }
  # Stop the host first so its recovery loop cannot create a replacement
  # browser process while the already captured descendants are being removed.
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

$port = Get-FreePort
$marker = "transient-red-$PID-$([Guid]::NewGuid().ToString('N'))"
$url = "http://127.0.0.1:$port/?client=embedded&qa=$marker"
$testRegistryPath = "Software\FE Monster\DesktopPetTest\transient-red-$PID"
$testDataRoot = Join-Path ([IO.Path]::GetTempPath()) "FE Monster\Transient-$PID-$([Guid]::NewGuid().ToString('N'))\data"
$startupLog = Join-Path (Split-Path -Parent $testDataRoot) 'logs\startup.log'
$previousLogLength = if (Test-Path -LiteralPath $startupLog -PathType Leaf) { (Get-Item -LiteralPath $startupLog).Length } else { 0 }
$server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $fixturePath + '"'), $port, 2) -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
$client = $null
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  do {
    try { $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $status = $null }
    if ($server.HasExited) { throw 'transient startup fixture exited early' }
    if (!$status) { Start-Sleep -Milliseconds 80 }
  } while (!$status -and [DateTime]::UtcNow -lt $deadline)
  if (!$status) { throw 'transient startup fixture did not start' }

  $savedScope = $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH
  $savedDataRoot = $env:FE_MONSTER_DATA_DIR
  $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $testRegistryPath
  $env:FE_MONSTER_DATA_DIR = $testDataRoot
  try {
    $client = Start-Process -FilePath $clientPath -ArgumentList @('--url', $url, '--gpu', 'false', '--width', '920', '--height', '640') -WorkingDirectory $rootPath -PassThru
  } finally {
    $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $savedScope
    $env:FE_MONSTER_DATA_DIR = $savedDataRoot
  }

  $captured = ''
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 100
    $captured = Read-AppendedLog $startupLog $previousLogLength
    try { $liveStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $liveStatus = $null }
    $recovered = $liveStatus -and $liveStatus.pageAttempts -ge 3 -and $liveStatus.domReady -and !$client.HasExited
    $failed = $client.HasExited -or ($captured -match 'did not finish loading after bounded automatic recovery' -and $captured -match [regex]::Escape($marker))
  } while (!$recovered -and !$failed -and [DateTime]::UtcNow -lt $deadline)

  $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 2
  $exactFailure = $captured -match 'did not finish loading after an automatic retry' -and $captured -match [regex]::Escape($marker)
  if ($exactFailure -and $status.pageAttempts -eq 2) {
    $evidence = [pscustomobject]@{
      passed = $false
      reproduced = $true
      symptom = 'application page did not finish loading after an automatic retry'
      pageAttempts = $status.pageAttempts
      serverWouldRecoverOnAttempt = 3
      targetUrl = $url
    } | ConvertTo-Json -Compress
    throw "RED: FE Monster exits after two transient page failures even though the local page is healthy on attempt 3. evidence=$evidence"
  }
  if ($status.pageAttempts -ge 3 -and $status.domReady -and !$client.HasExited -and $captured -notmatch 'did not finish loading after bounded automatic recovery') {
    [pscustomobject]@{ passed = $true; recovered = $true; pageAttempts = $status.pageAttempts; targetUrl = $url } | ConvertTo-Json -Compress
    return
  }
  throw "Inconclusive transient-startup result: requests=$($status | ConvertTo-Json -Compress -Depth 5); log=$captured"
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
