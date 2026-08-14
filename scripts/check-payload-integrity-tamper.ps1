param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [Parameter(Mandatory = $true)]
  [string]$PayloadRoot
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$payloadPath = (Resolve-Path -LiteralPath $PayloadRoot).Path
$installer = Join-Path $rootPath 'scripts\install-fe-monster.ps1'
$manifestPath = Join-Path $payloadPath 'payload-integrity.json'
if (!(Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw "Installer integrity entry point is missing: $installer"
}
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Payload integrity manifest is missing: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$probeRelativePaths = @(
  'native/windows/build/winforms/Microsoft.Web.WebView2.Core.dll',
  'web/boot-lightfall-react.js'
)
$probeEntries = New-Object System.Collections.Generic.List[object]
foreach ($relative in $probeRelativePaths) {
  $entry = @($manifest.files | Where-Object {
    [string]::Equals(
      ([string]$_.path).Replace('\', '/'),
      $relative,
      [StringComparison]::Ordinal
    )
  }) | Select-Object -First 1
  if ($null -eq $entry) {
    throw "Full payload manifest does not cover ordinary integrity probe file: $relative"
  }
  $source = Join-Path $payloadPath $relative.Replace('/', '\')
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Ordinary integrity probe file is absent from payload: $relative"
  }
  $probeEntries.Add($entry) | Out-Null
}

$testParent = Join-Path $rootPath 'tmp\payload-integrity-tests'
$testRoot = Join-Path $testParent ([guid]::NewGuid().ToString('N'))

function New-IntegrityProbeFixture {
  param([string]$Name)

  $fixtureRoot = Join-Path $testRoot "$Name-payload"
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  foreach ($relative in $probeRelativePaths) {
    $source = Join-Path $payloadPath $relative.Replace('/', '\')
    $destination = Join-Path $fixtureRoot $relative.Replace('/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }

  $fixtureManifest = [ordered]@{
    schemaVersion = 1
    appVersion = [string]$manifest.appVersion
    architecture = 'x64'
    minimumWindowsBuild = [int]$manifest.minimumWindowsBuild
    maxRelativePathLength = [int](($probeRelativePaths | ForEach-Object { $_.Length } |
      Measure-Object -Maximum).Maximum)
    requiredInstallBytes = [long](($probeEntries | Measure-Object -Property length -Sum).Sum)
    files = @($probeEntries | ForEach-Object { $_ })
  }
  $fixtureManifest |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $fixtureRoot 'payload-integrity.json') -Encoding UTF8
  return $fixtureRoot
}

function Assert-InstallerRejectsFixture {
  param(
    [string]$Name,
    [string]$FixtureRoot,
    [string]$ExpectedFailure
  )

  $installRoot = Join-Path $testRoot "$Name-install"
  $logPath = Join-Path $testRoot "$Name-install.log"
  $output = & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $installer `
    -InstallDir $installRoot `
    -PayloadRoot $FixtureRoot `
    -LogPath $logPath `
    -NoLaunch `
    -NoShortcuts `
    -SkipSystemNodeInstall `
    -NoRegistration `
    -NoPopup `
    2>&1
  $exitCode = $LASTEXITCODE
  $diagnostic = (@($output) -join [Environment]::NewLine)
  if (Test-Path -LiteralPath $logPath -PathType Leaf) {
    $diagnostic += [Environment]::NewLine + (Get-Content -LiteralPath $logPath -Raw)
  }
  if ($exitCode -eq 0) {
    throw "$Name integrity probe was accepted unexpectedly."
  }
  if ($diagnostic.IndexOf($ExpectedFailure, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "$Name integrity probe failed for the wrong reason. Expected '$ExpectedFailure'. Diagnostic: $diagnostic"
  }
  if (Test-Path -LiteralPath $installRoot -PathType Container) {
    $installedFile = Get-ChildItem -LiteralPath $installRoot -Recurse -File -Force |
      Select-Object -First 1
    if ($null -ne $installedFile) {
      throw "$Name integrity probe wrote into the installation directory before rejecting the payload."
    }
  }
}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

  $missingFixture = New-IntegrityProbeFixture 'missing-js'
  Remove-Item -LiteralPath (
    Join-Path $missingFixture 'web\boot-lightfall-react.js'
  ) -Force
  Assert-InstallerRejectsFixture `
    -Name 'missing-js' `
    -FixtureRoot $missingFixture `
    -ExpectedFailure 'Installer payload is missing required file: web\boot-lightfall-react.js'

  $tamperedFixture = New-IntegrityProbeFixture 'tampered-dll'
  $tamperedDll = Join-Path $tamperedFixture 'native\windows\build\winforms\Microsoft.Web.WebView2.Core.dll'
  $bytes = [IO.File]::ReadAllBytes($tamperedDll)
  if ($bytes.Length -lt 1) { throw 'Ordinary DLL integrity probe file is empty.' }
  $bytes[0] = [byte]($bytes[0] -bxor 1)
  [IO.File]::WriteAllBytes($tamperedDll, $bytes)
  Assert-InstallerRejectsFixture `
    -Name 'tampered-dll' `
    -FixtureRoot $tamperedFixture `
    -ExpectedFailure 'Installer payload SHA-256 mismatch: native\windows\build\winforms\Microsoft.Web.WebView2.Core.dll'

  Write-Host 'Payload ordinary JS/DLL tamper checks: OK'
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
