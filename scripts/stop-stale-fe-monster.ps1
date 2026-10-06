param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$SkipJava,
  [switch]$SkipClient,
  [switch]$SkipNode
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath(
  [Environment]::ExpandEnvironmentVariables($Root)
).TrimEnd('\', '/')
if ([string]::IsNullOrWhiteSpace($rootPath) -or
    [string]::Equals($rootPath, [System.IO.Path]::GetPathRoot($rootPath).TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe FE Monster root: $Root"
}

function Test-FeMonsterPath {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  try {
    $candidate = $Text.Replace('/', '\')
    # A drive-relative path belongs to the inspected process's working
    # directory, which cannot be inferred from the cleanup process.
    if ($candidate -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))') { return $false }
    $normalized = [IO.Path]::GetFullPath($candidate).TrimEnd('\')
    return $normalized.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Get-CommandLineTokens {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return @() }
  $tokens = New-Object System.Collections.Generic.List[string]
  foreach ($match in [regex]::Matches($CommandLine, '(?:[^\s"]+|"[^"]*")+')) {
    $tokens.Add($match.Value.Replace('"', '')) | Out-Null
  }
  return @($tokens)
}

function Get-PowerShellFileArgument {
  param([string]$CommandLine)

  $tokens = @(Get-CommandLineTokens $CommandLine)
  for ($index = 1; $index -lt $tokens.Count; $index += 1) {
    $token = ([string]$tokens[$index]).ToLowerInvariant()
    if ($token -in @('-command', '-c', '-encodedcommand', '-enc')) {
      # Text after -Command is script content, not process-launch arguments.
      return ''
    }
    if ($token -eq '-file') {
      if (($index + 1) -lt $tokens.Count) { return [string]$tokens[$index + 1] }
      return ''
    }
  }
  return ''
}

function Test-CommandInvokesScript {
  param(
    [string]$ProcessName,
    [string]$CommandLine,
    [string[]]$AllowedLeafNames
  )

  $scriptPath = ''
  if ($ProcessName -in @('powershell.exe', 'pwsh.exe')) {
    $scriptPath = Get-PowerShellFileArgument $CommandLine
  } elseif ($ProcessName -eq 'wscript.exe') {
    $tokens = @(Get-CommandLineTokens $CommandLine)
    if ($tokens.Count -ge 2) { $scriptPath = [string]$tokens[1] }
  }
  if ([string]::IsNullOrWhiteSpace($scriptPath)) { return $false }
  $leaf = [System.IO.Path]::GetFileName($scriptPath)
  return ($AllowedLeafNames -contains $leaf) -and (Test-FeMonsterPath $scriptPath)
}

function Test-FeMonsterProcess {
  param([object]$Process)

  if (!$Process.CommandLine) { return $false }
  $name = ([string]$Process.Name).ToLowerInvariant()
  $command = ([string]$Process.CommandLine).ToLowerInvariant()
  $executable = ([string]$Process.ExecutablePath).ToLowerInvariant()
  $tokens = @(Get-CommandLineTokens ([string]$Process.CommandLine))
  $targetExecutable = Test-FeMonsterPath $executable
  if ([string]::IsNullOrWhiteSpace($executable) -and $tokens.Count -gt 0) {
    $targetExecutable = Test-FeMonsterPath ([string]$tokens[0])
  }

  if (
    !$SkipJava -and
    $name -in @('java.exe', 'javaw.exe', 'fe monster backend.exe')
  ) {
    for ($index = 1; $index -lt ($tokens.Count - 1); $index += 1) {
      if ($tokens[$index] -eq '-jar') {
        $jar = [string]$tokens[$index + 1]
        if (!(Test-FeMonsterPath $jar)) { return $false }
        $jar = [IO.Path]::GetFullPath($jar)
        return [string]::Equals([IO.Path]::GetDirectoryName($jar), (Join-Path $rootPath 'out'), [StringComparison]::OrdinalIgnoreCase) -and
          ([IO.Path]::GetFileName($jar) -match '^fe-monster-java(?:-.+)?\.jar$')
      }
    }
    return $false
  }

  if (
    !$SkipClient -and
    $name -in @('fe monster.exe', 'fe-monster-client.exe') -and
    $targetExecutable
  ) {
    return $true
  }

  if (
    !$SkipClient -and
    $name -eq 'msedgewebview2.exe' -and
    $command.Contains('--user-data-dir=') -and
    $command.Contains('\webview2\')
  ) {
    foreach ($token in $tokens) {
      if ([string]$token -like '--user-data-dir=*') {
        return Test-FeMonsterPath ([string]$token).Substring('--user-data-dir='.Length)
      }
    }
    return $false
  }

  # Upgrade cleanup for releases that bundled a private Python runtime.
  # Match only an interpreter located below this FE Monster installation so
  # unrelated system/user Python processes can never be terminated here.
  if (
    !$SkipClient -and
    $name -in @('python.exe', 'pythonw.exe') -and
    $targetExecutable -and
    $executable.Contains('\runtime\python\')
  ) {
    return $true
  }

  if (
    !$SkipClient -and
    $name -in @('wscript.exe', 'powershell.exe', 'pwsh.exe') -and
    (Test-CommandInvokesScript `
      $name `
      ([string]$Process.CommandLine) `
      @('FE Monster.vbs', 'launch-fe-monster.ps1', 'fe-monster-update-agent.ps1', 'apply-client-update.ps1'))
  ) {
    return $true
  }

  if (
    !$SkipClient -and
    $name -like 'fe-monster-setup-*.exe' -and
    $targetExecutable -and
    $executable.Contains('\data\updates\')
  ) {
    return $true
  }

  if (!$SkipNode -and $name -eq 'node.exe') {
    $targetScript = $false
    for ($index = 1; $index -lt $tokens.Count; $index += 1) {
      $token = [string]$tokens[$index]
      if ($token.StartsWith('-')) { continue }
      $targetScript = Test-FeMonsterPath $token
      break
    }
    return (($targetScript -or $targetExecutable) -and (
      $command.Contains('netease-api-server.cjs') -or
      $command.Contains('kugou-api-server.cjs') -or
      $command.Contains('@sansenjian\qq-music-api') -or
      $command.Contains('@sansenjian/qq-music-api') -or
      $command.Contains('qq-music-api\dist\cli.js') -or
      $command.Contains('qq-music-api/dist/cli.js') -or
      $command.Contains('\data\music-api\packages\') -or
      $command.Contains('/data/music-api/packages/')
    ))
  }

  return $false
}

function Get-FeMonsterProcesses {
  return @(Get-CimInstance Win32_Process -ErrorAction Stop |
    Where-Object { Test-FeMonsterProcess $_ })
}

$targets = Get-FeMonsterProcesses
foreach ($target in $targets) {
  try {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped stale FE Monster process $($target.ProcessId) ($($target.Name))."
  } catch {
    Write-Host "Could not stop FE Monster process $($target.ProcessId) ($($target.Name)): $($_.Exception.Message)"
  }
}

$deadline = (Get-Date).AddSeconds(10)
do {
  $remaining = Get-FeMonsterProcesses
  if ($remaining.Count -eq 0) { break }
  foreach ($target in $remaining) {
    try {
      Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
    } catch {
    }
  }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

$remaining = Get-FeMonsterProcesses
if ($remaining.Count -gt 0) {
  $summary = $remaining | ForEach-Object { "$($_.Name) pid=$($_.ProcessId)" }
  Write-Error ("FE Monster processes are still using the installation: " + ($summary -join ', '))
  exit 2
}
