param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ObrSourceDir = '',
  [ValidateSet('Debug', 'Release', 'RelWithDebInfo')]
  [string]$Configuration = 'Release',
  [switch]$SkipProbe
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$nativeSourceDir = Join-Path $rootPath 'native\windows'
$runtimeOutputDir = Join-Path $nativeSourceDir 'build'
$obrRevision = '478dc7c752d5eccae534635139ff0253eee3a14a'
$obrRepository = 'https://github.com/google/obr.git'
$nativeAudioBuildManifestName = 'native-audio-build.json'

function Get-TextSha256 {
  param([Parameter(Mandatory)][string]$Value)

  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Resolve-FirstCommandPath {
  param(
    [Parameter(Mandatory)]
    [string]$Name,
    [string[]]$Candidates = @()
  )
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }
  foreach ($candidate in $Candidates) {
    if (![string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "$Name was not found."
}

$vsWhereCandidates = @(
  (Join-Path ${Env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe')
)
$vsWhere = $vsWhereCandidates | Where-Object {
  ![string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_ -PathType Leaf)
} | Select-Object -First 1

$vsInstall = ''
$vsMajorVersion = 0
if ($vsWhere) {
  $vsInstall = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
  $vsMajorText = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property catalog_productLineVersion).Trim()
  if (![string]::IsNullOrWhiteSpace($vsMajorText)) {
    $vsMajorVersion = [int]$vsMajorText
  }
}
if ([string]::IsNullOrWhiteSpace($vsInstall) -and ![string]::IsNullOrWhiteSpace($Env:FE_VS_INSTALL)) {
  if (!(Test-Path -LiteralPath $Env:FE_VS_INSTALL -PathType Container)) {
    throw "FE_VS_INSTALL does not point to a Visual Studio installation directory: $($Env:FE_VS_INSTALL)"
  }
  $vsInstall = (Resolve-Path -LiteralPath $Env:FE_VS_INSTALL).Path
}
if ($vsMajorVersion -ge 18) {
  $cmakeGenerator = 'Visual Studio 18 2026'
} else {
  $cmakeGenerator = 'Visual Studio 17 2022'
}
$buildToolsetVersion = if ($vsMajorVersion -gt 0) { $vsMajorVersion } else { 17 }
$cmakeBuildDir = Join-Path $nativeSourceDir ".cmake-build-xaudio2-vs$buildToolsetVersion"
$stagingOutputDir = Join-Path $cmakeBuildDir 'runtime'

$cmakeCandidates = @()
if (![string]::IsNullOrWhiteSpace($vsInstall)) {
  $cmakeCandidates += Join-Path $vsInstall 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
}
$cmake = Resolve-FirstCommandPath -Name 'cmake.exe' -Candidates $cmakeCandidates
$git = Resolve-FirstCommandPath -Name 'git.exe'
$workspaceCargoHome = Join-Path $rootPath '.tools\cargo'
$workspaceRustupHome = Join-Path $rootPath '.tools\rustup'
$workspaceCargo = Join-Path $workspaceCargoHome 'bin\cargo.exe'
$cargo = Resolve-FirstCommandPath -Name 'cargo.exe' -Candidates @(
  $workspaceCargo
)
if ((Test-Path -LiteralPath $workspaceCargo -PathType Leaf) -and
    ([IO.Path]::GetFullPath($cargo) -eq [IO.Path]::GetFullPath($workspaceCargo))) {
  $env:CARGO_HOME = $workspaceCargoHome
  $env:RUSTUP_HOME = $workspaceRustupHome
}

if ([string]::IsNullOrWhiteSpace($Env:JAVA_HOME)) {
  $javac = Resolve-FirstCommandPath -Name 'javac.exe'
  $jdkRoot = Split-Path -Parent (Split-Path -Parent $javac)
} else {
  $jdkRoot = (Resolve-Path -LiteralPath $Env:JAVA_HOME).Path
}
$jniInclude = Join-Path $jdkRoot 'include'
$jniWindowsInclude = Join-Path $jniInclude 'win32'
if (!(Test-Path -LiteralPath (Join-Path $jniInclude 'jni.h') -PathType Leaf) -or
    !(Test-Path -LiteralPath (Join-Path $jniWindowsInclude 'jni_md.h') -PathType Leaf)) {
  throw "JNI headers were not found under $jdkRoot."
}

if ([string]::IsNullOrWhiteSpace($ObrSourceDir)) {
  $temporaryRoot = Join-Path $rootPath '.tmp'
  if (!(Test-Path -LiteralPath $temporaryRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  }
  $ObrSourceDir = Join-Path $temporaryRoot "google-obr-native-$($obrRevision.Substring(0, 12))"
  if (!(Test-Path -LiteralPath (Join-Path $ObrSourceDir '.git') -PathType Container)) {
    if (Test-Path -LiteralPath $ObrSourceDir) {
      throw "The intended OBR checkout path exists but is not a Git checkout: $ObrSourceDir"
    }
    & $git clone --filter=blob:none --no-checkout $obrRepository $ObrSourceDir
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $git -C $ObrSourceDir checkout --detach $obrRevision
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
} else {
  $ObrSourceDir = (Resolve-Path -LiteralPath $ObrSourceDir).Path
}

$resolvedObrRevision = (& $git -C $ObrSourceDir rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedObrRevision -ne $obrRevision) {
  throw "Google OBR must be checked out at pinned revision $obrRevision (found $resolvedObrRevision)."
}
if (!(Test-Path -LiteralPath (Join-Path $ObrSourceDir 'obr\renderer\obr_impl.cc') -PathType Leaf)) {
  throw "The Google OBR source checkout is incomplete: $ObrSourceDir"
}

foreach ($directory in @($cmakeBuildDir, $stagingOutputDir, $runtimeOutputDir)) {
  if (!(Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }
}

$rustManifest = Join-Path $rootPath 'native\rust-audio-upmix\Cargo.toml'
$rustLock = Join-Path $rootPath 'native\rust-audio-upmix\Cargo.lock'
if (!(Test-Path -LiteralPath $rustManifest -PathType Leaf) -or
    !(Test-Path -LiteralPath $rustLock -PathType Leaf)) {
  throw "The Rust surround-upmix crate or lockfile is missing."
}
$rustBuildExitCode = 0
Push-Location (Split-Path -Parent $rustManifest)
try {
  # Cargo discovers .cargo/config.toml from the working directory hierarchy.
  & $cargo build --manifest-path $rustManifest --release --locked
  $rustBuildExitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($rustBuildExitCode -ne 0) { exit $rustBuildExitCode }
$rustUpmixDll = Join-Path $rootPath 'native\rust-audio-upmix\target\release\fe_monster_upmix.dll'
if (!(Test-Path -LiteralPath $rustUpmixDll -PathType Leaf)) {
  throw "The Rust OxiMedia upmix DLL was not produced: $rustUpmixDll"
}

$configureArguments = @(
  '-S', $nativeSourceDir,
  '-B', $cmakeBuildDir,
  '-G', $cmakeGenerator,
  '-A', 'x64',
  "-DOBR_SOURCE_DIR=$ObrSourceDir",
  "-DFE_JNI_INCLUDE_DIR=$jniInclude",
  "-DFE_JNI_WINDOWS_INCLUDE_DIR=$jniWindowsInclude",
  "-DFE_RUNTIME_OUTPUT_DIR=$stagingOutputDir"
)
if (![string]::IsNullOrWhiteSpace($vsInstall)) {
  $configureArguments += "-DCMAKE_GENERATOR_INSTANCE=$vsInstall"
}

& $cmake @configureArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $cmake --build $cmakeBuildDir --config $Configuration --target fe_monster_xaudio2 fe_audio_probe --parallel
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$stagedDll = Join-Path $stagingOutputDir 'fe-monster-xaudio2.dll'
$stagedRustUpmixDll = Join-Path $stagingOutputDir 'fe_monster_upmix.dll'
$probe = Join-Path $stagingOutputDir 'fe_audio_probe.exe'
if (!(Test-Path -LiteralPath $stagedDll -PathType Leaf)) {
  throw "The native audio DLL was not produced: $stagedDll"
}
if (!(Test-Path -LiteralPath $probe -PathType Leaf)) {
  throw "The native audio probe was not produced: $probe"
}
Copy-Item -LiteralPath $rustUpmixDll -Destination $stagedRustUpmixDll -Force
if (!(Test-Path -LiteralPath $stagedRustUpmixDll -PathType Leaf)) {
  throw "The Rust surround upmixer was not staged: $stagedRustUpmixDll"
}

$licenseDir = Join-Path $stagingOutputDir 'licenses\google-obr'
if (!(Test-Path -LiteralPath $licenseDir -PathType Container)) {
  New-Item -ItemType Directory -Path $licenseDir -Force | Out-Null
}
Copy-Item -LiteralPath (Join-Path $ObrSourceDir 'LICENSE') -Destination (Join-Path $licenseDir 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $ObrSourceDir 'PATENTS') -Destination (Join-Path $licenseDir 'PATENTS') -Force
$oximediaLicenseDir = Join-Path $stagingOutputDir 'licenses\oximedia-audiopost'
if (!(Test-Path -LiteralPath $oximediaLicenseDir -PathType Container)) {
  New-Item -ItemType Directory -Path $oximediaLicenseDir -Force | Out-Null
}
Copy-Item `
  -LiteralPath (Join-Path $rootPath 'native\rust-audio-upmix\THIRD-PARTY-NOTICES.md') `
  -Destination (Join-Path $oximediaLicenseDir 'THIRD-PARTY-NOTICES.md') `
  -Force
Copy-Item `
  -LiteralPath (Join-Path $rootPath 'native\rust-audio-upmix\APACHE-2.0.txt') `
  -Destination (Join-Path $oximediaLicenseDir 'APACHE-2.0.txt') `
  -Force

# This manifest is created only after both artifacts have been produced and
# staged by the same invocation. The installer verifies both hashes and the
# pair hash before it accepts build/ or build-next/, preventing a locked or
# partially copied DLL from being combined with a different native build.
$xaudioSha256 = (Get-FileHash -LiteralPath $stagedDll -Algorithm SHA256).Hash.ToLowerInvariant()
$upmixSha256 = (Get-FileHash -LiteralPath $stagedRustUpmixDll -Algorithm SHA256).Hash.ToLowerInvariant()
$pairMaterial = "fe-monster-xaudio2.dll=$xaudioSha256`nfe_monster_upmix.dll=$upmixSha256"
$nativeAudioBuildManifest = [ordered]@{
  schemaVersion = 1
  buildId = ([Guid]::NewGuid().ToString('D')).ToLowerInvariant()
  createdAtUtc = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
  architecture = 'x64'
  configuration = $Configuration
  obrRevision = $obrRevision
  rustPackage = 'oximedia-audiopost 0.2.0 (locked)'
  xaudio2Sha256 = $xaudioSha256
  upmixSha256 = $upmixSha256
  pairSha256 = Get-TextSha256 -Value $pairMaterial
}
$stagedBuildManifest = Join-Path $stagingOutputDir $nativeAudioBuildManifestName
$manifestJson = $nativeAudioBuildManifest | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText(
  $stagedBuildManifest,
  $manifestJson + [Environment]::NewLine,
  [Text.UTF8Encoding]::new($false)
)

if (!$SkipProbe) {
  & $probe
  if ($LASTEXITCODE -ne 0) {
    throw "fe_audio_probe failed with exit code $LASTEXITCODE."
  }
}

$installedDll = Join-Path $runtimeOutputDir 'fe-monster-xaudio2.dll'
$installedRustUpmixDll = Join-Path $runtimeOutputDir 'fe_monster_upmix.dll'
$installedBuildManifest = Join-Path $runtimeOutputDir $nativeAudioBuildManifestName
try {
  Copy-Item -LiteralPath $stagedDll -Destination $installedDll -Force -ErrorAction Stop
  Copy-Item -LiteralPath $stagedRustUpmixDll -Destination $installedRustUpmixDll -Force -ErrorAction Stop
  Copy-Item -LiteralPath $stagedBuildManifest -Destination $installedBuildManifest -Force -ErrorAction Stop
  $verifiedRuntime = @($installedDll, $installedRustUpmixDll, $installedBuildManifest)
} catch {
  # Windows locks an in-use image file. Keep a complete side-by-side runtime
  # so the next client launch can pick up the verified build without stopping
  # the user's currently playing session or requiring another compilation.
  $nextRuntimeDir = Join-Path $nativeSourceDir 'build-next'
  if (!(Test-Path -LiteralPath $nextRuntimeDir -PathType Container)) {
    New-Item -ItemType Directory -Path $nextRuntimeDir -Force | Out-Null
  }
  $nextDll = Join-Path $nextRuntimeDir 'fe-monster-xaudio2.dll'
  $nextRustUpmixDll = Join-Path $nextRuntimeDir 'fe_monster_upmix.dll'
  $nextBuildManifest = Join-Path $nextRuntimeDir $nativeAudioBuildManifestName
  Copy-Item -LiteralPath $stagedDll -Destination $nextDll -Force
  Copy-Item -LiteralPath $stagedRustUpmixDll -Destination $nextRustUpmixDll -Force
  Copy-Item -LiteralPath $stagedBuildManifest -Destination $nextBuildManifest -Force
  $verifiedRuntime = @($nextDll, $nextRustUpmixDll, $nextBuildManifest)
  Write-Warning "The running app is using the installed native audio DLL. The verified replacement is ready for the next launch under $nextRuntimeDir."
}

Write-Host "Built $($verifiedRuntime -join ', ')"
Write-Host "Rust upmix: oximedia-audiopost 0.2.0 (locked)"
Write-Host "Verified Google OBR revision $obrRevision through $probe"
