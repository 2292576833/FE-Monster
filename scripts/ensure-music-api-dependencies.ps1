param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string[]]$RequiredPath = @(),
  [switch]$InstallMissing
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$outDir = Join-Path $rootPath 'out'
$dependencyLog = Join-Path $outDir 'dependency-check.log'
$lockFile = Join-Path $outDir 'music-api-dependencies.lock'

function Find-Exe {
  param(
    [string]$Name,
    [string[]]$Roots = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }

  foreach ($root in $Roots) {
    if ([string]::IsNullOrWhiteSpace($root) -or !(Test-Path $root)) { continue }
    $match = Get-ChildItem -Path $root -Recurse -Filter $Name -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($null -ne $match) { return $match.FullName }
  }
  return ''
}

function Test-Node {
  return -not [string]::IsNullOrWhiteSpace((Find-Exe 'node.exe' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))))
}

function Test-RequiredPaths {
  foreach ($relative in $RequiredPath) {
    if ([string]::IsNullOrWhiteSpace($relative)) { continue }
    if (!(Test-Path (Join-Path $rootPath $relative))) { return $false }
  }
  return $true
}

function Invoke-RuntimeDependencyCheck {
  $dependencyScript = Join-Path $rootPath 'scripts\ensure-runtime-dependencies.ps1'
  if (!(Test-Path $dependencyScript)) {
    Write-Host "Dependency checker is missing: $dependencyScript"
    return $false
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dependencyScript -Root $rootPath -InstallMissing *> $dependencyLog
  return $LASTEXITCODE -eq 0
}

if ((Test-Node) -and (Test-RequiredPaths)) {
  exit 0
}

if (!$InstallMissing) {
  Write-Host 'Music API dependencies are missing.'
  exit 1
}

if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$lock = $null
$deadline = (Get-Date).AddMinutes(10)
while ($null -eq $lock) {
  try {
    $lock = [System.IO.File]::Open($lockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  } catch {
    if ((Get-Date) -gt $deadline) {
      Write-Host "Timed out waiting for music API dependency installation lock."
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}

try {
  if ((Test-Node) -and (Test-RequiredPaths)) {
    exit 0
  }

  if (!(Invoke-RuntimeDependencyCheck)) {
    Write-Host "Runtime dependency installation failed. See $dependencyLog"
    exit 1
  }

  if ((Test-Node) -and (Test-RequiredPaths)) {
    exit 0
  }

  Write-Host "Music API dependencies are still missing after installation. See $dependencyLog"
  exit 1
} finally {
  if ($null -ne $lock) {
    $lock.Close()
  }
}
