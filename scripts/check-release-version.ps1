param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$builderSource = Get-Content -LiteralPath (Join-Path $rootPath 'scripts\build-installer.ps1') -Raw
$versionStart = $builderSource.IndexOf('$packageMetadata =')
$versionEnd = $builderSource.IndexOf('$includeOfflineWebView2 =', $versionStart)
if ($versionStart -lt 0 -or $versionEnd -lt 0) { throw 'Installer release initialization was not found.' }
$versionInitialization = [scriptblock]::Create($builderSource.Substring($versionStart, $versionEnd - $versionStart))
$checks = 0

function Get-BuildReleaseVersion {
  param([object]$Metadata)

  # Run only the builder's release initialization with an in-memory package.json.
  # This never stages files, launches the installer, or changes the registry.
  function Get-Content {
    param([string]$LiteralPath, [switch]$Raw)
    if ($LiteralPath -ne (Join-Path $rootPath 'package.json')) {
      throw "Unexpected read during release initialization: $LiteralPath"
    }
    return $Metadata | ConvertTo-Json -Compress
  }
  . $versionInitialization
  if ($appVersion -cne $releaseVersion.DisplayVersion) {
    throw 'Installer filename and manifest version must use the release display version.'
  }
  return $releaseVersion
}

foreach ($case in @(
  @{ Package = '2.2.3'; Display = '2.2.3'; Expected = '2.2.3'; Numeric = '2.2.3.0' },
  @{ Package = '2.2.2-beta'; Display = '2.2.2beta'; Expected = '2.2.2beta'; Numeric = '2.2.2.0' },
  @{ Package = '2.1.2'; Display = ''; Expected = '2.1.2'; Numeric = '2.1.2.0' },
  @{ Package = '2.2.2-beta'; Display = ''; Expected = '2.2.2-beta'; Numeric = '2.2.2.0' },
  @{ Package = '3.0.0-rc.2'; Display = '3.0.0rc.2'; Expected = '3.0.0rc.2'; Numeric = '3.0.0.0' },
  @{ Package = '0.0.1-alpha.1'; Display = '0.0.1-alpha.1'; Expected = '0.0.1-alpha.1'; Numeric = '0.0.1.0' }
)) {
  $actual = Get-BuildReleaseVersion ([pscustomobject]@{ version = $case.Package; displayVersion = $case.Display })
  if ($null -eq $actual -or $actual.PackageVersion -cne $case.Package -or
      $actual.DisplayVersion -cne $case.Expected -or $actual.WindowsVersion -cne $case.Numeric) {
    throw "Release mapping failed for '$($case.Package)': $($actual | ConvertTo-Json -Compress)"
  }
  $checks++
}

foreach ($case in @(
  @{ version = '2.2.2beta'; displayVersion = '2.2.2beta' },
  @{ version = '2.2.2-beta'; displayVersion = '2.2.3beta' },
  @{ version = '2.2.2-beta'; displayVersion = '2.2.2' },
  @{ version = '2.2.2-beta'; displayVersion = '../2.2.2beta' },
  @{ version = '02.2.2'; displayVersion = '' },
  @{ version = '2.2.2-beta.01'; displayVersion = '' },
  @{ version = '65535.2.2'; displayVersion = '' },
  @{ version = '2.2.2.0'; displayVersion = '' },
  @{ version = ''; displayVersion = '' }
)) {
  $rejected = $false
  try { $null = Get-BuildReleaseVersion ([pscustomobject]$case) } catch { $rejected = $true }
  if (!$rejected) { throw "Invalid release metadata was accepted: $($case | ConvertTo-Json -Compress)" }
  $checks++
}

$package = Get-Content -LiteralPath (Join-Path $rootPath 'package.json') -Raw | ConvertFrom-Json
$release = Get-BuildReleaseVersion $package
foreach ($relativePath in @(
  'native\windows\setup\FeMonsterSetup.csproj',
  'native\windows\winforms\FeMonsterClient.WinForms.csproj'
)) {
  [xml]$project = Get-Content -LiteralPath (Join-Path $rootPath $relativePath) -Raw
  $properties = $project.Project.PropertyGroup
  if ($properties.Version -cne $release.PackageVersion -or
      $properties.InformationalVersion -cne $release.DisplayVersion -or
      $properties.AssemblyVersion -cne $release.WindowsVersion -or
      $properties.FileVersion -cne $release.WindowsVersion) {
    throw "Windows project release metadata is inconsistent: $relativePath"
  }
  $checks++
}
foreach ($relativePath in @('native\windows\setup\app.manifest', 'native\windows\winforms\app.manifest')) {
  [xml]$manifest = Get-Content -LiteralPath (Join-Path $rootPath $relativePath) -Raw
  if ($manifest.assembly.assemblyIdentity.version -cne $release.WindowsVersion) {
    throw "Windows application manifest release metadata is inconsistent: $relativePath"
  }
  $checks++
}

$setupSource = Get-Content -LiteralPath (Join-Path $rootPath 'native\windows\setup\Program.cs') -Raw
$displayMethod = [regex]::Match($setupSource, '(?s)private static string DisplayProductVersion\(string productVersion\)\s*\{.*?\r?\n    \}')
if (!$displayMethod.Success) { throw 'Setup version display method was not found.' }
$displayCode = 'using System; public static class ReleaseDisplayProbe { ' +
  $displayMethod.Value.Replace('private static', 'public static').Replace('out Version? version', 'out version').
    Replace('if (!Version.TryParse', 'Version version; if (!Version.TryParse').
    Replace('return $"{version.Major}.{version.Minor}.{patch}";', 'return string.Format("{0}.{1}.{2}", version.Major, version.Minor, patch);') + ' }'
# Windows PowerShell 5.1 uses the older C# compiler; lower syntax only, preserving the method's behavior.
Add-Type -TypeDefinition $displayCode
foreach ($case in @(
  @{ Input = '2.2.3.0'; Expected = '2.2.3' },
  @{ Input = '2.2.2beta'; Expected = '2.2.2beta' },
  @{ Input = '2.2.2-beta'; Expected = '2.2.2-beta' },
  @{ Input = '2.2.2.0'; Expected = '2.2.2' }
)) {
  if ([ReleaseDisplayProbe]::DisplayProductVersion($case.Input) -cne $case.Expected) {
    throw "Setup UI changed the release label '$($case.Input)'."
  }
  $checks++
}
Write-Host "Release version mapping and Windows metadata: PASS ($checks checks)"
