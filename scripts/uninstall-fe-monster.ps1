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

function Assert-SafeInstallRoot {
  param([string]$Path)
  $full = Resolve-FullPath $Path
  $root = [System.IO.Path]::GetPathRoot($full).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $windows = Resolve-FullPath ([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows))
  $system = Resolve-FullPath ([Environment]::SystemDirectory)
  if (
    [string]::IsNullOrWhiteSpace($full) -or
    [string]::Equals($full, $root, [StringComparison]::OrdinalIgnoreCase) -or
    [string]::Equals($full, $windows, [StringComparison]::OrdinalIgnoreCase) -or
    [string]::Equals($full, $system, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "Unsafe uninstall directory: $full"
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

function Stop-UpdateAgentProcess {
  param([string]$Path)
  $needle = $Path.ToLowerInvariant()
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      ([string]$_.CommandLine).ToLowerInvariant().Contains($needle) -and
      ([string]$_.CommandLine).ToLowerInvariant().Contains('fe-monster-update-agent.ps1')
    } |
    ForEach-Object {
      try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
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

$targetRoot = Assert-SafeInstallRoot $Root
if (!(Confirm-Uninstall $targetRoot)) {
  Write-Host 'FE Monster uninstall cancelled.'
  exit 0
}

$stopScript = Join-Path $targetRoot 'scripts\stop-stale-fe-monster.ps1'
if (Test-Path $stopScript) {
  & powershell.exe -NoProfile -File $stopScript -Root $targetRoot
}

Stop-UpdateAgentProcess $targetRoot
Remove-UpdateAgent
Remove-Shortcuts
Remove-UninstallRegistration

$dataPath = Join-Path $targetRoot 'data'
$dataBackup = ''
if ($KeepUserData -and (Test-Path $dataPath)) {
  $dataBackup = Join-Path ([System.IO.Path]::GetTempPath()) ('fe-monster-data-' + [guid]::NewGuid().ToString('N'))
  Move-Item -LiteralPath $dataPath -Destination $dataBackup -Force
}

Set-Location ([System.IO.Path]::GetTempPath())
Remove-Item -LiteralPath $targetRoot -Recurse -Force

if ($KeepUserData -and !(Test-Path $targetRoot)) {
  New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
  if (![string]::IsNullOrWhiteSpace($dataBackup) -and (Test-Path $dataBackup)) {
    Move-Item -LiteralPath $dataBackup -Destination $dataPath -Force
  }
}

Write-Host 'FE Monster has been uninstalled.'
