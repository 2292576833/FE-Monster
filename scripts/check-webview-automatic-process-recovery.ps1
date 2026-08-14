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
$fixturePath = (Resolve-Path -LiteralPath (Join-Path $rootPath 'scripts\fixtures\webview-process-recovery-server.mjs')).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Get-DescendantProcesses([int]$ParentId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $byParent = @{}
  foreach ($process in $all) {
    $key = [int]$process.ParentProcessId
    if (!$byParent.ContainsKey($key)) { $byParent[$key] = New-Object Collections.Generic.List[object] }
    $byParent[$key].Add($process)
  }
  $result = New-Object Collections.Generic.List[object]
  $queue = New-Object Collections.Generic.Queue[int]
  $queue.Enqueue($ParentId)
  while ($queue.Count -gt 0) {
    $parent = $queue.Dequeue()
    if (!$byParent.ContainsKey($parent)) { continue }
    foreach ($child in $byParent[$parent]) {
      $result.Add($child)
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return $result.ToArray()
}

function Get-OwnedBrowserProcess([int]$ClientId) {
  $ownedIds = @((Get-DescendantProcesses $ClientId | ForEach-Object { [int]$_.ProcessId }))
  $owned = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction Stop | Where-Object {
    [string]$_.Name -ieq 'msedgewebview2.exe' -and
    [string]$_.CommandLine -notmatch '(?:^|\s)--type=' -and
    [string]$_.CommandLine -match '--embedded-browser-webview=1' -and
    ($ownedIds -contains [int]$_.ProcessId -or [int]$_.ParentProcessId -eq $ClientId)
  })
  return $owned | Select-Object -First 1
}

function Stop-OwnedTree([int]$RootId) {
  $ids = @(Get-DescendantProcesses $RootId | ForEach-Object { [int]$_.ProcessId })
  [array]::Reverse($ids)
  # Stop the host first so its recovery loop cannot create another browser
  # while the captured descendants are being terminated.
  Stop-Process -Id $RootId -Force -ErrorAction SilentlyContinue
  foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  foreach ($id in @($ids + $RootId)) {
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
$scopeToken = "process-recovery-$PID-$([Guid]::NewGuid().ToString('N'))"
$testRegistryPath = "Software\FE Monster\DesktopPetTest\pr-$PID"
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "FE Monster\$scopeToken"
$testDataRoot = Join-Path $testRoot 'data'
$url = "http://127.0.0.1:$port/?client=embedded&qa=$scopeToken"
$server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $fixturePath + '"'), $port) -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
$client = $null
$killedBrowser = $null
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  do {
    try { $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $status = $null }
    if ($server.HasExited) { throw 'process-recovery fixture exited early' }
    if (!$status) { Start-Sleep -Milliseconds 80 }
  } while (!$status -and [DateTime]::UtcNow -lt $deadline)
  if (!$status) { throw 'process-recovery fixture did not start' }

  $savedScope = $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH
  $savedDataRoot = $env:FE_MONSTER_DATA_DIR
  $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $testRegistryPath
  $env:FE_MONSTER_DATA_DIR = $testDataRoot
  try {
    $argumentString = '--url "{0}" --gpu false --width 920 --height 640' -f $url
    $client = Start-Process -FilePath $clientPath -ArgumentList $argumentString -WorkingDirectory $rootPath -PassThru
  } finally {
    $env:FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH = $savedScope
    $env:FE_MONSTER_DATA_DIR = $savedDataRoot
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(40)
  $browserCandidates = @()
  $browser = $null
  $status = $null
  do {
    Start-Sleep -Milliseconds 100
    $client.Refresh()
    if ($client.HasExited) { throw "client exited before its WebView2 browser process was available (exit $($client.ExitCode))" }
    try { $latestStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $latestStatus = $null }
    if ($null -ne $latestStatus) { $status = $latestStatus }
    $latestBrowser = Get-OwnedBrowserProcess $client.Id
    if ($null -ne $latestBrowser) { $browser = $latestBrowser }
    $browserCandidates = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue | Where-Object {
      [string]$_.CommandLine -notmatch '(?:^|\s)--type=' -and [string]$_.CommandLine -match '--embedded-browser-webview=1'
    } | ForEach-Object { [pscustomobject]@{ id = [int]$_.ProcessId; parentId = [int]$_.ParentProcessId; commandLine = [string]$_.CommandLine } })
  } while (($null -eq $browser -or $null -eq $status -or [int]$status.pageAttempts -lt 1) -and [DateTime]::UtcNow -lt $deadline)
  if ($null -eq $browser) { throw "an owned WebView2 browser process was not found; client=$($client.Id); candidates=$($browserCandidates | ConvertTo-Json -Compress -Depth 4)" }
  if ($null -eq $status -or [int]$status.pageAttempts -lt 1) { throw "the initial navigation was not observed before the process kill; client=$($client.Id); browser=$($browser.ProcessId); fixture=$($status | ConvertTo-Json -Compress -Depth 4)" }
  if ($status.domReady) { throw 'fixture became DOM-ready before the browser process kill' }

  $killedBrowser = [int]$browser.ProcessId
  Stop-Process -Id $killedBrowser -Force -ErrorAction Stop

  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  do {
    Start-Sleep -Milliseconds 150
    $client.Refresh()
    if ($client.HasExited) { break }
    try { $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/probe/status" -TimeoutSec 1 } catch { $status = $null }
    $replacement = Get-OwnedBrowserProcess $client.Id
  } while ((!$status.domReady -or $null -eq $replacement -or [int]$replacement.ProcessId -eq $killedBrowser) -and [DateTime]::UtcNow -lt $deadline)

  $logPath = Join-Path $testRoot 'logs\startup.log'
  $diagnosticTail = if (Test-Path -LiteralPath $logPath) { @(Get-Content -LiteralPath $logPath -Tail 50) -join "`n" } else { '' }
  if ($client.HasExited -or !$status.domReady -or $null -eq $replacement -or [int]$replacement.ProcessId -eq $killedBrowser) {
    $evidence = [ordered]@{
      passed = $false
      killedBrowserProcessId = $killedBrowser
      clientExited = $client.HasExited
      clientExitCode = if ($client.HasExited) { $client.ExitCode } else { $null }
      replacementBrowserProcessId = if ($null -ne $replacement) { [int]$replacement.ProcessId } else { $null }
      fixture = $status
      diagnostics = $diagnosticTail
    }
    throw "RED: FE Monster did not rebuild its WebView2 environment/controller after the owned browser process exited. evidence=$($evidence | ConvertTo-Json -Compress -Depth 6)"
  }

  [pscustomobject]@{
    passed = $true
    killedBrowserProcessId = $killedBrowser
    replacementBrowserProcessId = [int]$replacement.ProcessId
    pageAttempts = $status.pageAttempts
    domReady = $status.domReady
    marker = $status.page.marker
  } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $client) { Stop-OwnedTree $client.Id }
  if ($null -ne $server -and !$server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue; [void]$server.WaitForExit(5000) }
  if (Test-Path -LiteralPath $testRoot -PathType Container) { Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue }
  foreach ($profilePath in Get-TestProfilePaths $testRegistryPath) {
    if (Test-Path -LiteralPath $profilePath -PathType Container) { Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction SilentlyContinue }
  }
  Remove-Item -LiteralPath ("HKCU:\" + $testRegistryPath) -Recurse -Force -ErrorAction SilentlyContinue
}
