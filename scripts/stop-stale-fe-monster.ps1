param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$SkipJava,
  [switch]$SkipClient,
  [switch]$SkipNode
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path.TrimEnd('\')
$rootNeedle = $rootPath.ToLowerInvariant()

function Test-FeMonsterProcess {
  param([object]$Process)

  if (!$Process.CommandLine) { return $false }
  $name = ([string]$Process.Name).ToLowerInvariant()
  $command = ([string]$Process.CommandLine).ToLowerInvariant()
  if (!$command.Contains($rootNeedle)) { return $false }

  if (!$SkipJava -and $name -in @('java.exe', 'javaw.exe') -and $command.Contains('fe-monster-java')) {
    return $true
  }

  if (!$SkipClient -and $name -eq 'fe-monster-client.exe' -and $command.Contains('fe-monster-client.exe')) {
    return $true
  }

  if (!$SkipNode -and $name -eq 'node.exe') {
    return (
      $command.Contains('netease-api-server.cjs') -or
      $command.Contains('kugou-api-server.cjs') -or
      $command.Contains('@sansenjian\qq-music-api') -or
      $command.Contains('@sansenjian/qq-music-api') -or
      $command.Contains('qq-music-api\dist\cli.js') -or
      $command.Contains('qq-music-api/dist/cli.js')
    )
  }

  return $false
}

Get-CimInstance Win32_Process |
  Where-Object { Test-FeMonsterProcess $_ } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force
      Write-Host "Stopped stale FE Monster process $($_.ProcessId) ($($_.Name))."
    } catch {
      Write-Host "Could not stop FE Monster process $($_.ProcessId) ($($_.Name)): $($_.Exception.Message)"
    }
  }
