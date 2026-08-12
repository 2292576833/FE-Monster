param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [ValidateRange(100, 10000)]
  [int]$MaxLaunchMilliseconds = 600
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$launcherPath = Join-Path $rootPath 'scripts\launch-fe-monster.ps1'
$noConsoleProcessPath = Join-Path $rootPath 'scripts\windows-no-console-process.ps1'
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$probeRoot = Join-Path $tempBase ('fe-monster-launcher-no-args-' + [Guid]::NewGuid().ToString('N'))
$probeRoot = [System.IO.Path]::GetFullPath($probeRoot)
$launcherProcess = $null

if (!$probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe launcher probe directory: $probeRoot"
}
if (!(Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "Launcher is missing: $launcherPath"
}
if (!(Test-Path -LiteralPath $noConsoleProcessPath -PathType Leaf)) {
  throw "No-console process helper is missing: $noConsoleProcessPath"
}

try {
  $probeOut = Join-Path $probeRoot 'out'
  $probeHostDir = Join-Path $probeRoot 'native\windows\build\winforms'
  $probeScriptsDir = Join-Path $probeRoot 'scripts'
  New-Item -ItemType Directory -Path $probeOut -Force | Out-Null
  New-Item -ItemType Directory -Path $probeHostDir -Force | Out-Null
  New-Item -ItemType Directory -Path $probeScriptsDir -Force | Out-Null
  New-Item -ItemType File -Path (Join-Path $probeOut 'fe-monster-java.jar') -Force | Out-Null
  $probeLauncher = Join-Path $probeScriptsDir 'launch-fe-monster.ps1'
  Copy-Item -LiteralPath $launcherPath -Destination $probeLauncher
  Copy-Item `
    -LiteralPath $noConsoleProcessPath `
    -Destination (Join-Path $probeScriptsDir 'windows-no-console-process.ps1')
  Copy-Item `
    -LiteralPath (Join-Path $Env:SystemRoot 'System32\whoami.exe') `
    -Destination (Join-Path $probeHostDir 'FE Monster.exe')

  $quotedLauncher = '"' + ($probeLauncher -replace '"', '\"') + '"'
  $launcherArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedLauncher"
  $launchClock = [Diagnostics.Stopwatch]::StartNew()
  $launcherProcess = Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList $launcherArguments `
    -WindowStyle Hidden `
    -PassThru

  $launchLog = Join-Path $probeOut 'launch.log'
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  $logText = ''
  while ([DateTime]::UtcNow -lt $deadline) {
    $launcherProcess.Refresh()
    if (Test-Path -LiteralPath $launchLog -PathType Leaf) {
      $logText = Get-Content -LiteralPath $launchLog -Raw
      if ($logText -match 'host started' -or $logText -match 'Launch failed:') {
        break
      }
    }
    if ($launcherProcess.HasExited) { break }
    Start-Sleep -Milliseconds 50
  }

  if ($logText -notmatch 'host started') {
    if ($logText -match 'Launch failed:\s*(.+)') {
      throw "Source launcher rejected an empty client-argument list: $($Matches[1].Trim())"
    }
    throw 'Source launcher did not start its host within five seconds.'
  }
  $launchMilliseconds = [int][Math]::Round($launchClock.Elapsed.TotalMilliseconds)
  if ($launchMilliseconds -gt $MaxLaunchMilliseconds) {
    throw "Source launcher took ${launchMilliseconds}ms to delegate to an existing host; budget is ${MaxLaunchMilliseconds}ms."
  }

  Write-Output "Source launcher no-args regression: OK (${launchMilliseconds}ms)"
} finally {
  if ($null -ne $launcherProcess) {
    try {
      $launcherProcess.Refresh()
      if (!$launcherProcess.HasExited) {
        Stop-Process -Id $launcherProcess.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
    $launcherProcess.Dispose()
  }
  if ($probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $probeRoot -PathType Container)) {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
