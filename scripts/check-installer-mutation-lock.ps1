param(
  [string]$Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$sourcePath = Join-Path $rootPath 'scripts\install-fe-monster.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Installer source did not parse.' }
$functionSource = foreach ($name in @('Resolve-FullPath', 'Enter-InstallMutationLock', 'Exit-InstallMutationLock')) {
  $function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if ($null -eq $function) { throw "Missing installer helper: $name" }
  $function.Extent.Text
}
$helpers = $functionSource -join "`n"
$uninstallAst = [Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $rootPath 'scripts\uninstall-fe-monster.ps1'), [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw 'Uninstaller source did not parse.' }
$uninstallHelpers = (@('Resolve-FullPath', 'Enter-InstallMutationLock', 'Exit-InstallMutationLock') | ForEach-Object {
  $name = $_
  $function = $uninstallAst.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if ($null -eq $function) { throw "Missing uninstaller helper: $name" }
  $function.Extent.Text
}) -join "`n"
# Load only the lock helpers. Never execute the installer entry point.
. ([scriptblock]::Create($helpers))
$scratchParent = Join-Path $rootPath 'tmp'
$scratch = Join-Path $scratchParent ('installer-lock-check-' + [guid]::NewGuid().ToString('N'))
$savedLocalAppData = $Env:LOCALAPPDATA
$held = $null
$second = $null
$failures = [Collections.Generic.List[string]]::new()

function Assert-SecondProcessBlocked {
  param([string]$Target, [string]$StateRoot, [switch]$Uninstall)
  $targetLiteral = "'" + $Target.Replace("'", "''") + "'"
  $stateLiteral = "'" + $StateRoot.Replace("'", "''") + "'"
  $probeHelpers = if ($Uninstall) { $uninstallHelpers } else { $helpers }
  $probe = $probeHelpers + "`n" + @"
`$ErrorActionPreference = 'Stop'
`$ProgressPreference = 'SilentlyContinue'
`$Env:LOCALAPPDATA = $stateLiteral
try {
  `$lock = Enter-InstallMutationLock $targetLiteral
  Exit-InstallMutationLock `$lock
  exit 9
} catch {
  if (`$_.Exception.Message -notmatch 'Another FE Monster') { Write-Error `$_; exit 10 }
  exit 0
}
"@
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = Join-Path $Env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $start.Arguments = '-NoProfile -NonInteractive -EncodedCommand ' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($start)
  try {
    $errorText = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(15000)) { $process.Kill(); throw 'Lock-only child process timed out.' }
    if ($process.ExitCode -ne 0) {
      throw "A second installer process acquired the same target lock (exit $($process.ExitCode)). $($errorText.Result)"
    }
  } finally { $process.Dispose() }
}

function Assert-IndependentTargetRelease {
  param([string]$Target, [string]$StateRoot, [switch]$Uninstall)
  $targetLiteral = "'" + $Target.Replace("'", "''") + "'"
  $stateLiteral = "'" + $StateRoot.Replace("'", "''") + "'"
  $probeHelpers = if ($Uninstall) { $uninstallHelpers } else { $helpers }
  $probe = $probeHelpers + "`n" + @"
`$ErrorActionPreference = 'Stop'
`$ProgressPreference = 'SilentlyContinue'
`$Env:LOCALAPPDATA = $stateLiteral
`$first = Enter-InstallMutationLock $targetLiteral
`$second = Enter-InstallMutationLock ($targetLiteral + '-other')
try {
  Exit-InstallMutationLock `$first
  `$first = `$null
  `$blocked = `$false
  try { `$unexpected = Enter-InstallMutationLock ($targetLiteral + '-other') }
  catch { `$blocked = `$true }
  if (!`$blocked) { Exit-InstallMutationLock `$unexpected; throw 'Releasing one target unlocked another target.' }
} finally {
  Exit-InstallMutationLock `$first
  Exit-InstallMutationLock `$second
}
"@
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = Join-Path $Env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $start.Arguments = '-NoProfile -EncodedCommand ' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($start)
  try {
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(5000)) {
      $process.Kill()
      throw 'Releasing one target waited for input while another target still held its lock.'
    }
    if ($process.ExitCode -ne 0) { throw "Independent-target lock release failed: $($errors.Result)" }
    if ($output.Result -match '\[Y\]|\[A\]|\[N\]|Confirm') { throw 'Independent-target release prompted for confirmation.' }
  } finally { $process.Dispose() }
}

try {
  New-Item -ItemType Directory -Path $scratch -Force | Out-Null
  $Env:LOCALAPPDATA = Join-Path $scratch 'local-state'
  $target = Join-Path $scratch ('app ' + [char]0x4E2D + [char]0x6587)
  $held = Enter-InstallMutationLock $target
  $legacyLockPath = Join-Path (Join-Path $Env:LOCALAPPDATA 'FE Monster Setup\Locks') (Split-Path -Leaf $held.Path)
  try {
    $blocked = $false
    try { $second = Enter-InstallMutationLock $target } catch { $blocked = $_.Exception.Message -match 'Another FE Monster' }
    if (!$blocked) { $failures.Add('A held primary lock fell through to a different fallback lock.') }
  } finally { Exit-InstallMutationLock $second; $second = $null }
  try { Assert-SecondProcessBlocked $target $Env:LOCALAPPDATA } catch { $failures.Add($_.Exception.Message) }
  try { Assert-SecondProcessBlocked $target $Env:LOCALAPPDATA -Uninstall } catch { $failures.Add('Uninstall vs install: ' + $_.Exception.Message) }
  Exit-InstallMutationLock $held
  $held = $null

  # Older uninstallers hold only the historical per-user file. Setup must
  # reject that contention even though its new target-parent anchor is free.
  $legacyStream = [IO.File]::Open($legacyLockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $blocked = $false
    try { $second = Enter-InstallMutationLock $target } catch { $blocked = $_.Exception.Message -match 'Another FE Monster' }
    if (!$blocked) { $failures.Add('An older uninstaller primary lock was bypassed through the target anchor.') }
  } finally {
    Exit-InstallMutationLock $second
    $second = $null
    $legacyStream.Dispose()
  }

  # A file in place of LOCALAPPDATA makes the primary directory truly unusable.
  $unavailableState = Join-Path $scratch 'unavailable-state'
  New-Item -ItemType File -Path $unavailableState | Out-Null
  $Env:LOCALAPPDATA = $unavailableState
  $held = Enter-InstallMutationLock $target
  if (!$held.Path.StartsWith((Join-Path $scratch '.fe-monster-setup-locks'), [StringComparison]::OrdinalIgnoreCase)) {
    $failures.Add('An unavailable primary directory did not use the target-local fallback.')
  }
  try { Assert-SecondProcessBlocked $target $unavailableState } catch { $failures.Add($_.Exception.Message) }
  $recoveredState = Join-Path $scratch 'recovered-local-state'
  try { Assert-SecondProcessBlocked $target $recoveredState } catch { $failures.Add('Primary availability changed: ' + $_.Exception.Message) }
  try { Assert-SecondProcessBlocked $target $recoveredState -Uninstall } catch { $failures.Add('Uninstall vs fallback install: ' + $_.Exception.Message) }
  Exit-InstallMutationLock $held
  $held = $null

  # Exercise the reverse operation ordering without importing either entry point.
  $Env:LOCALAPPDATA = Join-Path $scratch 'local-state'
  $held = & ([scriptblock]::Create($uninstallHelpers + "`nEnter-InstallMutationLock '" + $target.Replace("'", "''") + "'"))
  try { Assert-SecondProcessBlocked $target $Env:LOCALAPPDATA } catch { $failures.Add('Install vs uninstall: ' + $_.Exception.Message) }
  Exit-InstallMutationLock $held
  $held = $null

  $held = Enter-InstallMutationLock $target
  Exit-InstallMutationLock $held
  $held = $null
  if ($failures.Count -gt 0) { throw ($failures -join "`n") }
  Assert-IndependentTargetRelease $target $Env:LOCALAPPDATA
  Assert-IndependentTargetRelease $target $Env:LOCALAPPDATA -Uninstall
  Write-Host 'Installer mutation lock: OK (legacy contention, unavailable/recovered primary, install/uninstall exclusion, Unicode path, reacquisition).'
} finally {
  Exit-InstallMutationLock $second
  Exit-InstallMutationLock $held
  $Env:LOCALAPPDATA = $savedLocalAppData
  $resolvedScratch = [IO.Path]::GetFullPath($scratch)
  $allowedPrefix = [IO.Path]::GetFullPath($scratchParent).TrimEnd('\') + '\'
  if (!$resolvedScratch.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      (Split-Path -Leaf $resolvedScratch) -notlike 'installer-lock-check-*') {
    throw "Unsafe lock fixture cleanup target: $resolvedScratch"
  }
  if (Test-Path -LiteralPath $resolvedScratch) {
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
  }
}
