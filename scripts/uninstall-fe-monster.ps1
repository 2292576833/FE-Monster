param(
  [string]$Root = (Join-Path $PSScriptRoot '..'),
  [switch]$Quiet,
  [switch]$KeepUserData
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Unsafe uninstall directory: $Path"
  }
  return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path)).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Enter-InstallMutationLock {
  param([string]$Path)

  $normalized = (Resolve-FullPath $Path).ToLowerInvariant()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalized)) |
      ForEach-Object { $_.ToString('x2') }) -join ''
  } finally {
    $sha.Dispose()
  }
  $lockDirectory = Join-Path $Env:LOCALAPPDATA 'FE Monster Setup\Locks'
  New-Item -ItemType Directory -Path $lockDirectory -Force | Out-Null
  $lockPath = Join-Path $lockDirectory ($hash.Substring(0, 32) + '.lock')
  try {
    $stream = [System.IO.File]::Open(
      $lockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
  } catch {
    throw "Another FE Monster install, update, or uninstall is already changing $Path"
  }
  return [pscustomobject]@{ Stream = $stream; Path = $lockPath }
}

function Exit-InstallMutationLock {
  param([object]$Lock)
  if ($null -eq $Lock) { return }
  try { $Lock.Stream.Dispose() } catch {}
  try { Remove-Item -LiteralPath $Lock.Path -Force -ErrorAction SilentlyContinue } catch {}
}

function Test-PathSameOrAncestor {
  param(
    [string]$Candidate,
    [string]$ProtectedPath
  )

  if ([string]::IsNullOrWhiteSpace($ProtectedPath)) { return $false }
  $candidateFull = Resolve-FullPath $Candidate
  $protectedFull = Resolve-FullPath $ProtectedPath
  if ([string]::Equals($candidateFull, $protectedFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  $candidatePrefix = $candidateFull + [System.IO.Path]::DirectorySeparatorChar
  return $protectedFull.StartsWith($candidatePrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ProtectedInstallDirectories {
  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($specialFolder in @(
    [Environment+SpecialFolder]::Windows,
    [Environment+SpecialFolder]::System,
    [Environment+SpecialFolder]::ProgramFiles,
    [Environment+SpecialFolder]::ProgramFilesX86,
    [Environment+SpecialFolder]::CommonApplicationData,
    [Environment+SpecialFolder]::UserProfile,
    [Environment+SpecialFolder]::Desktop,
    [Environment+SpecialFolder]::MyDocuments,
    [Environment+SpecialFolder]::MyPictures,
    [Environment+SpecialFolder]::MyMusic,
    [Environment+SpecialFolder]::MyVideos,
    [Environment+SpecialFolder]::LocalApplicationData,
    [Environment+SpecialFolder]::ApplicationData,
    [Environment+SpecialFolder]::CommonDesktopDirectory,
    [Environment+SpecialFolder]::CommonDocuments,
    [Environment+SpecialFolder]::Programs,
    [Environment+SpecialFolder]::CommonPrograms,
    [Environment+SpecialFolder]::StartMenu,
    [Environment+SpecialFolder]::CommonStartMenu
  )) {
    $path = [Environment]::GetFolderPath($specialFolder)
    if (![string]::IsNullOrWhiteSpace($path)) { $paths.Add($path) | Out-Null }
  }

  if (![string]::IsNullOrWhiteSpace($Env:USERPROFILE)) {
    $paths.Add($Env:USERPROFILE) | Out-Null
    $paths.Add((Join-Path $Env:USERPROFILE 'Downloads')) | Out-Null
    $profileParent = Split-Path -Parent $Env:USERPROFILE
    if (![string]::IsNullOrWhiteSpace($profileParent)) { $paths.Add($profileParent) | Out-Null }
  }
  if (![string]::IsNullOrWhiteSpace($Env:OneDrive)) { $paths.Add($Env:OneDrive) | Out-Null }
  return @($paths | Select-Object -Unique)
}

function Test-FeMonsterInstallRoot {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path -PathType Container)) { return $false }
  $modernManifest = Join-Path $Path 'payload-integrity.json'
  $modernMain = Join-Path $Path 'native\windows\build\winforms\FE Monster.exe'
  if ((Test-Path -LiteralPath $modernManifest -PathType Leaf) -and
      (Test-Path -LiteralPath $modernMain -PathType Leaf)) {
    return $true
  }

  $legacyJar = Join-Path $Path 'out\fe-monster-java.jar'
  $legacyVbs = Join-Path $Path 'FE Monster.vbs'
  $legacyRun = Join-Path $Path 'run.cmd'
  return (Test-Path -LiteralPath $legacyJar -PathType Leaf) -and
    ((Test-Path -LiteralPath $legacyVbs -PathType Leaf) -or
     (Test-Path -LiteralPath $legacyRun -PathType Leaf))
}

function Assert-SafeInstallRoot {
  param([string]$Path)
  $full = Resolve-FullPath $Path
  $root = [System.IO.Path]::GetPathRoot($full).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  if (
    [string]::IsNullOrWhiteSpace($full) -or
    [string]::Equals($full, $root, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "Unsafe uninstall directory: $full"
  }
  foreach ($protectedPath in @(Get-ProtectedInstallDirectories)) {
    if (Test-PathSameOrAncestor $full $protectedPath) {
      throw "Unsafe uninstall directory: $full is a system or user-data root."
    }
  }
  if (!(Test-FeMonsterInstallRoot $full)) {
    throw "Unsafe uninstall directory: $full is not a recognized FE Monster installation."
  }
  return $full
}

function Confirm-Uninstall {
  param([string]$Path)
  if ($Quiet) { return $true }
  try {
    $shell = New-Object -ComObject WScript.Shell
    $result = $shell.Popup("Uninstall FE Monster from:`n$Path", 0, 'FE Monster Uninstall', 4 + 32)
    return $result -eq 6
  } catch {
    $answer = Read-Host "Uninstall FE Monster from $Path ? [y/N]"
    return $answer -match '^(y|yes)$'
  }
}

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-UpdateAgent {
  Unregister-ScheduledTask -TaskName 'FE Monster Update Agent' -Confirm:$false -ErrorAction SilentlyContinue
  $startup = [Environment]::GetFolderPath('Startup')
  if (![string]::IsNullOrWhiteSpace($startup)) {
    Remove-IfExists (Join-Path $startup 'FE Monster Update Agent.vbs')
  }
}

function Remove-Shortcuts {
  $startMenu = Join-Path $Env:APPDATA 'Microsoft\Windows\Start Menu\Programs\FE Monster'
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  Remove-IfExists $startMenu
  if (![string]::IsNullOrWhiteSpace($desktop)) {
    Remove-IfExists (Join-Path $desktop 'FE Monster.lnk')
  }
}

function Remove-UninstallRegistration {
  Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FE Monster' -Recurse -Force -ErrorAction SilentlyContinue
}

function Move-RetainedUserState {
  param(
    [string]$SourceRoot,
    [string]$RetainedRoot
  )

  $movedAny = $false
  New-Item -ItemType Directory -Path $RetainedRoot -ErrorAction Stop | Out-Null
  foreach ($relative in @('data', 'WebView2', 'logs', 'public-access.key')) {
    $source = Join-Path $SourceRoot $relative
    if (!(Test-Path -LiteralPath $source)) { continue }
    Move-Item -LiteralPath $source -Destination (Join-Path $RetainedRoot $relative) -ErrorAction Stop
    $movedAny = $true
  }
  if ($movedAny) {
    Set-Content -LiteralPath (Join-Path $RetainedRoot '.fe-monster-user-data') -Encoding ASCII -Value 'schemaVersion=1'
  } else {
    Remove-Item -LiteralPath $RetainedRoot -Force -ErrorAction SilentlyContinue
  }
  return $movedAny
}

function Restore-RetainedStateForRollback {
  param(
    [string]$RetainedRoot,
    [string]$QuarantineRoot
  )

  if (!(Test-Path -LiteralPath $RetainedRoot -PathType Container)) { return }
  if (!(Test-Path -LiteralPath $QuarantineRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $QuarantineRoot -Force -ErrorAction Stop | Out-Null
  }
  foreach ($entry in @(Get-ChildItem -LiteralPath $RetainedRoot -Force -ErrorAction Stop)) {
    $destination = Join-Path $QuarantineRoot $entry.Name
    if (Test-Path -LiteralPath $destination) {
      throw "Rollback cannot overwrite retained user data at $destination"
    }
    Move-Item -LiteralPath $entry.FullName -Destination $destination -ErrorAction Stop
  }
  Remove-Item -LiteralPath $RetainedRoot -Force -ErrorAction SilentlyContinue
}

$targetRoot = Assert-SafeInstallRoot $Root
if (!(Confirm-Uninstall $targetRoot)) {
  Write-Host 'FE Monster uninstall cancelled.'
  exit 0
}

$installMutationLock = Enter-InstallMutationLock $targetRoot
try {
$stopScript = Join-Path $targetRoot 'scripts\stop-stale-fe-monster.ps1'
if (!(Test-Path -LiteralPath $stopScript -PathType Leaf)) {
  throw "Cannot safely uninstall because process cleanup is missing: $stopScript"
}
& powershell.exe -NoProfile -File $stopScript -Root $targetRoot
if ($LASTEXITCODE -ne 0) {
  throw "FE Monster is still running. Uninstall was aborted before changing files, shortcuts, or registration."
}

$targetParent = Split-Path -Parent $targetRoot
$transactionId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$quarantineRoot = Join-Path $targetParent ('.fm-uninstall-' + $transactionId)
$retainedRoot = Join-Path $targetParent ('.fm-userdata-' + $transactionId)
$rootWasRenamed = $false
$retainedStateMoved = $false

Set-Location ([System.IO.Path]::GetTempPath())
try {
  Move-Item -LiteralPath $targetRoot -Destination $quarantineRoot -ErrorAction Stop
  $rootWasRenamed = $true
  if ($KeepUserData) {
    $retainedStateMoved = Move-RetainedUserState $quarantineRoot $retainedRoot
  }
} catch {
  $uninstallError = $_
  try {
    if (Test-Path -LiteralPath $retainedRoot -PathType Container) {
      Restore-RetainedStateForRollback $retainedRoot $quarantineRoot
    }
    if ($rootWasRenamed -and
        (Test-Path -LiteralPath $quarantineRoot -PathType Container) -and
        !(Test-Path -LiteralPath $targetRoot)) {
      Move-Item -LiteralPath $quarantineRoot -Destination $targetRoot -ErrorAction Stop
    }
  } catch {
    throw (
      "Uninstall failed and automatic rollback also failed. Original error: {0}. " +
      "Preserve these recovery locations and retry after closing FE Monster: {1}; {2}. Rollback error: {3}"
    ) -f $uninstallError.Exception.Message, $quarantineRoot, $retainedRoot, $_.Exception.Message
  }
  throw "Uninstall was rolled back before shortcuts or registration were removed: $($uninstallError.Exception.Message)"
}

# Renaming the verified installation out of its registered path is the commit
# point. Never rename it back after recursive deletion starts because a failed
# recursive delete may already have removed part of the application.
Remove-UpdateAgent
Remove-Shortcuts
Remove-UninstallRegistration

$quarantineWarning = ''
try {
  Remove-Item -LiteralPath $quarantineRoot -Recurse -Force -ErrorAction Stop
} catch {
  $quarantineWarning = "Application files were unregistered, but locked leftovers remain at $quarantineRoot`: $($_.Exception.Message)"
  Write-Warning $quarantineWarning
}

$retainedStateWarning = ''
if ($retainedStateMoved -and (Test-Path -LiteralPath $retainedRoot -PathType Container)) {
  try {
    Move-Item -LiteralPath $retainedRoot -Destination $targetRoot -ErrorAction Stop
  } catch {
    $retainedStateWarning = "User data was preserved at $retainedRoot but could not be restored to $targetRoot`: $($_.Exception.Message)"
    Write-Warning $retainedStateWarning
  }
}

Write-Host 'FE Monster has been uninstalled.'
if ($KeepUserData -and [string]::IsNullOrWhiteSpace($retainedStateWarning)) {
  Write-Host "User data was preserved under $targetRoot."
}
if (![string]::IsNullOrWhiteSpace($quarantineWarning)) {
  Write-Host 'The leftover quarantine is no longer registered or launchable from FE Monster shortcuts.'
}
if (![string]::IsNullOrWhiteSpace($retainedStateWarning)) {
  throw $retainedStateWarning
}
} finally {
  Exit-InstallMutationLock $installMutationLock
}
