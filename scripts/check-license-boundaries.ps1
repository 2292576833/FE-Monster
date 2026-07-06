param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$CommunityServerRoot = (Join-Path (Split-Path -Parent $Root) 'FE moster server')
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$errors = [System.Collections.Generic.List[string]]::new()

function Add-BoundaryError {
  param([string]$Message)
  $errors.Add($Message) | Out-Null
}

function Test-FileContains {
  param(
    [string]$Path,
    [string]$Pattern
  )
  if (!(Test-Path $Path)) { return $false }
  return (Get-Content -Raw -Path $Path) -match $Pattern
}

$rootLicense = Join-Path $rootPath 'LICENSE'
if (!(Test-FileContains $rootLicense 'MIT License')) {
  Add-BoundaryError 'Root LICENSE must be MIT for the open client fallback boundary.'
}

$communityLicense = Join-Path $rootPath 'LICENSES\COMMUNITY-PROPRIETARY.txt'
if (!(Test-FileContains $communityLicense 'FE Monster Community Proprietary License')) {
  Add-BoundaryError 'Community proprietary license file is missing or invalid.'
}

$openLeakFiles = @(
  'src\main\java\com\femonster\core\CommunityService.java',
  'src\main\java\com\femonster\core\CommunityModuleBridge.java'
)
foreach ($relative in $openLeakFiles) {
  $path = Join-Path $rootPath $relative
  if (Test-Path $path) {
    Add-BoundaryError "Community implementation must stay outside the open source root: $relative"
  }
}

$proprietaryRequiredFiles = @(
  'src\community-proprietary\java\com\femonster\core\CommunityService.java',
  'src\community-proprietary\java\com\femonster\core\CommunityModuleBridge.java',
  'src\community-proprietary\LICENSE'
)
foreach ($relative in $proprietaryRequiredFiles) {
  $path = Join-Path $rootPath $relative
  if (!(Test-Path $path)) {
    Add-BoundaryError "Missing proprietary community boundary file: $relative"
  }
}

$pluginDir = Join-Path $rootPath 'plugins\community'
if (Test-Path $pluginDir) {
  $sourceExtensions = @('.java', '.js', '.ts', '.tsx', '.jsx', '.ps1', '.cmd', '.bat', '.py', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs')
  $sourceFiles = Get-ChildItem -Path $pluginDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $sourceExtensions -contains $_.Extension.ToLowerInvariant() }
  foreach ($file in $sourceFiles) {
    Add-BoundaryError "plugins/community is for closed binaries only, not source files: $($file.FullName)"
  }
}

if (Test-Path $CommunityServerRoot) {
  $serverLicense = Join-Path $CommunityServerRoot 'LICENSE'
  if (!(Test-FileContains $serverLicense 'FE Monster Community Proprietary License')) {
    Add-BoundaryError "Community server must carry the proprietary license: $serverLicense"
  }

  $serverPackage = Join-Path $CommunityServerRoot 'package.json'
  if (Test-Path $serverPackage) {
    $packageText = Get-Content -Raw -Path $serverPackage
    if ($packageText -notmatch '"private"\s*:\s*true') {
      Add-BoundaryError 'Community server package.json must remain private.'
    }
    if ($packageText -notmatch '"license"\s*:\s*"UNLICENSED"') {
      Add-BoundaryError 'Community server package.json must use license UNLICENSED.'
    }
  }
}

if ($errors.Count -gt 0) {
  Write-Host 'Community license boundary check failed:'
  foreach ($errorMessage in $errors) {
    Write-Host " - $errorMessage"
  }
  exit 1
}

Write-Host 'Community license boundary check passed.'
