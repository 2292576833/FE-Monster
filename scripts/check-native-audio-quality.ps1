param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ObrSourceDir = '',
  [ValidateSet('Release', 'RelWithDebInfo')]
  [string]$Configuration = 'Release',
  [string]$RuntimeDirectory = ''
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$qualitySource = Join-Path $rootPath 'scripts\fixtures\native-audio-quality'
$nativeRoot = Join-Path $rootPath 'native\windows'
$obrRevision = '478dc7c752d5eccae534635139ff0253eee3a14a'
$nativeAudioBuildManifestName = 'native-audio-build.json'

function Resolve-FirstCommandPath {
  param([string]$Name, [string[]]$Candidates = @())
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "$Name was not found."
}

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

function Get-NativeAudioCandidateMetadata {
  param([Parameter(Mandatory)][string]$Directory)

  if (!(Test-Path -LiteralPath $Directory -PathType Container)) {
    throw "Native audio runtime directory is missing: $Directory"
  }
  $resolvedDirectory = (Resolve-Path -LiteralPath $Directory).Path
  $xaudioDll = Join-Path $resolvedDirectory 'fe-monster-xaudio2.dll'
  $rustDll = Join-Path $resolvedDirectory 'fe_monster_upmix.dll'
  $manifestPath = Join-Path $resolvedDirectory $nativeAudioBuildManifestName
  foreach ($required in @($xaudioDll, $rustDll, $manifestPath)) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Native audio production pair is incomplete: $required"
    }
  }
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    throw "Native audio build manifest is invalid: $manifestPath ($($_.Exception.Message))"
  }
  try {
    $createdAtUtc = [DateTimeOffset]::Parse(
      [string]$manifest.createdAtUtc,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
    ).UtcDateTime
  } catch {
    throw "Native audio build manifest has an invalid UTC timestamp: $manifestPath"
  }
  return [pscustomobject]@{
    Path = $resolvedDirectory
    XaudioDll = $xaudioDll
    RustDll = $rustDll
    ManifestPath = $manifestPath
    Manifest = $manifest
    CreatedAtUtc = $createdAtUtc
  }
}

function Test-NativeAudioRuntimeFilesComplete {
  param([Parameter(Mandatory)][string]$Directory)

  if (!(Test-Path -LiteralPath $Directory -PathType Container)) {
    return $false
  }
  foreach ($fileName in @(
    'fe-monster-xaudio2.dll',
    'fe_monster_upmix.dll',
    $nativeAudioBuildManifestName
  )) {
    if (!(Test-Path -LiteralPath (Join-Path $Directory $fileName) -PathType Leaf)) {
      return $false
    }
  }
  return $true
}

function Assert-NativeAudioRuntimePair {
  param([Parameter(Mandatory)][string]$Directory)

  $candidate = Get-NativeAudioCandidateMetadata -Directory $Directory
  $manifest = $candidate.Manifest
  if ([int]$manifest.schemaVersion -ne 1) {
    throw "Unsupported native audio build manifest schema: $($manifest.schemaVersion)"
  }
  $buildId = [string]$manifest.buildId
  if ($buildId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
    throw "Native audio build manifest has an invalid build ID: $buildId"
  }
  if ([string]$manifest.architecture -cne 'x64') {
    throw "Native audio build manifest is not x64: $($manifest.architecture)"
  }
  if ([string]$manifest.configuration -cne $Configuration) {
    throw "Native audio build manifest configuration mismatch: expected $Configuration, found $($manifest.configuration)"
  }
  if ([string]$manifest.obrRevision -cne $obrRevision) {
    throw "Native audio build manifest has an unexpected Google OBR revision: $($manifest.obrRevision)"
  }
  if ([string]$manifest.rustPackage -cne 'oximedia-audiopost 0.2.0 (locked)') {
    throw "Native audio build manifest has an unexpected Rust package: $($manifest.rustPackage)"
  }
  foreach ($hashName in @('xaudio2Sha256', 'upmixSha256', 'pairSha256')) {
    if ([string]$manifest.$hashName -cnotmatch '^[0-9a-f]{64}$') {
      throw "Native audio build manifest has an invalid $hashName value."
    }
  }

  $xaudioSha256 = (Get-FileHash -LiteralPath $candidate.XaudioDll -Algorithm SHA256).Hash.ToLowerInvariant()
  $upmixSha256 = (Get-FileHash -LiteralPath $candidate.RustDll -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($xaudioSha256 -cne [string]$manifest.xaudio2Sha256) {
    throw "Native audio XAudio2 DLL does not match build $buildId."
  }
  if ($upmixSha256 -cne [string]$manifest.upmixSha256) {
    throw "Native audio Rust DLL does not match build $buildId."
  }
  $pairMaterial = "fe-monster-xaudio2.dll=$xaudioSha256`nfe_monster_upmix.dll=$upmixSha256"
  $pairSha256 = Get-TextSha256 -Value $pairMaterial
  if ($pairSha256 -cne [string]$manifest.pairSha256) {
    throw "Native audio pair digest does not match build $buildId."
  }

  $rustTimestamp = (Get-Item -LiteralPath $candidate.RustDll).LastWriteTimeUtc
  $xaudioTimestamp = (Get-Item -LiteralPath $candidate.XaudioDll).LastWriteTimeUtc
  $manifestTimestamp = (Get-Item -LiteralPath $candidate.ManifestPath).LastWriteTimeUtc
  if ($rustTimestamp -ge $xaudioTimestamp) {
    throw "Native audio pair timestamp order is invalid: Rust must be older than XAudio ($rustTimestamp >= $xaudioTimestamp)."
  }
  if ($xaudioTimestamp -ge $manifestTimestamp) {
    throw "Native audio pair timestamp order is invalid: XAudio must be older than manifest ($xaudioTimestamp >= $manifestTimestamp)."
  }

  $candidate | Add-Member -NotePropertyName BuildId -NotePropertyValue $buildId
  $candidate | Add-Member -NotePropertyName XaudioSha256 -NotePropertyValue $xaudioSha256
  $candidate | Add-Member -NotePropertyName UpmixSha256 -NotePropertyValue $upmixSha256
  $candidate | Add-Member -NotePropertyName PairSha256 -NotePropertyValue $pairSha256
  $candidate | Add-Member -NotePropertyName RustTimestamp -NotePropertyValue $rustTimestamp
  $candidate | Add-Member -NotePropertyName XaudioTimestamp -NotePropertyValue $xaudioTimestamp
  $candidate | Add-Member -NotePropertyName ManifestTimestamp -NotePropertyValue $manifestTimestamp
  return $candidate
}

function Resolve-NativeAudioRuntimePair {
  if (![string]::IsNullOrWhiteSpace($RuntimeDirectory)) {
    return Assert-NativeAudioRuntimePair -Directory $RuntimeDirectory
  }

  $candidates = @(
    (Join-Path $rootPath 'native\windows\build'),
    (Join-Path $rootPath 'native\windows\build-next')
  )
  $completeCandidates = foreach ($candidatePath in $candidates) {
    if (!(Test-NativeAudioRuntimeFilesComplete -Directory $candidatePath)) {
      Write-Warning "Ignoring incomplete native audio runtime '$candidatePath': directory or production pair triad is missing."
      continue
    }
    # Once all three files exist, every metadata error is authoritative. A
    # corrupt newer manifest must fail closed rather than reveal an older pair.
    Get-NativeAudioCandidateMetadata -Directory $candidatePath
  }
  $selected = $completeCandidates |
    Sort-Object CreatedAtUtc -Descending |
    Select-Object -First 1
  if ($null -eq $selected) {
    throw 'No complete manifested native audio runtime was found under build or build-next.'
  }
  return Assert-NativeAudioRuntimePair -Directory $selected.Path
}

# Select and fully validate the final production pair before compiling either
# verification executable. A newer complete but stale/corrupt pair fails
# closed instead of silently switching to an older runtime.
$productionPair = Resolve-NativeAudioRuntimePair
$xaudioDll = $productionPair.XaudioDll
$rustDll = $productionPair.RustDll

$vsWhere = Join-Path ${Env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $vsWhere -PathType Leaf)) { throw 'vswhere.exe was not found.' }
$vsInstall = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
$vsMajorText = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property catalog_productLineVersion).Trim()
$vsMajor = if ($vsMajorText) { [int]$vsMajorText } else { 17 }
$generator = if ($vsMajor -ge 18) { 'Visual Studio 18 2026' } else { 'Visual Studio 17 2022' }
$cmake = Resolve-FirstCommandPath -Name 'cmake.exe' -Candidates @(
  (Join-Path $vsInstall 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe')
)
$git = Resolve-FirstCommandPath -Name 'git.exe'

if (!$ObrSourceDir) {
  $ObrSourceDir = Join-Path $rootPath ".tmp\google-obr-native-$($obrRevision.Substring(0, 12))"
}
if (!(Test-Path -LiteralPath (Join-Path $ObrSourceDir 'obr\renderer\obr_impl.cc') -PathType Leaf)) {
  throw "Pinned Google OBR checkout is missing: $ObrSourceDir"
}
$resolvedRevision = (& $git -C $ObrSourceDir rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $resolvedRevision -ne $obrRevision) {
  throw "Google OBR revision mismatch: expected $obrRevision, found $resolvedRevision"
}

# The desktop may retain a legacy JAVA_HOME for compatibility. Resolve the
# active javac first so this Java 17 probe uses the same toolchain as the
# repository's other contract checks.
$javac = Resolve-FirstCommandPath -Name 'javac.exe'
$jdkRoot = Split-Path -Parent (Split-Path -Parent $javac)
$java = Join-Path $jdkRoot 'bin\java.exe'
foreach ($javaTool in @($javac, $java)) {
  if (!(Test-Path -LiteralPath $javaTool -PathType Leaf)) {
    throw "Java verification tool is missing: $javaTool"
  }
}
$jniInclude = Join-Path $jdkRoot 'include'
$jniWindowsInclude = Join-Path $jniInclude 'win32'

$baseTemp = if ([string]::IsNullOrWhiteSpace($Env:TEMP)) {
  Join-Path $rootPath '.tmp'
} else {
  $Env:TEMP
}
$testTemp = Join-Path $baseTemp 'fe-native-audio-quality'
$buildDir = Join-Path $nativeRoot ".cmake-build-audio-quality-vs$vsMajor"
$probeRuntimeDir = Join-Path $buildDir 'runtime'
$javaClassesDir = Join-Path $buildDir 'java-live-pair-classes'
$liveDataDir = Join-Path $testTemp 'live-data'
foreach ($directory in @($testTemp, $buildDir, $probeRuntimeDir, $javaClassesDir, $liveDataDir)) {
  if (!(Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
}

$previousTemp = $Env:TEMP
$previousTmp = $Env:TMP
$previousXaudioDll = $Env:FE_MONSTER_XAUDIO2_DLL
$previousRustDll = $Env:FE_MONSTER_RUST_UPMIX_DLL
$previousRoot = $Env:FE_MONSTER_ROOT
$previousWebRoot = $Env:FE_MONSTER_WEB_ROOT
$previousDataDir = $Env:FE_MONSTER_DATA_DIR
try {
  $Env:TEMP = $testTemp
  $Env:TMP = $testTemp

  $configure = @(
    '-S', $qualitySource,
    '-B', $buildDir,
    '-G', $generator,
    '-A', 'x64',
    "-DCMAKE_GENERATOR_INSTANCE=$vsInstall",
    "-DFE_REPO_ROOT=$rootPath",
    "-DOBR_SOURCE_DIR=$ObrSourceDir",
    "-DFE_JNI_INCLUDE_DIR=$jniInclude",
    "-DFE_JNI_WINDOWS_INCLUDE_DIR=$jniWindowsInclude",
    "-DFE_RUNTIME_OUTPUT_DIR=$probeRuntimeDir"
  )

  $existingDeps = Join-Path $nativeRoot ".cmake-build-xaudio2-vs$vsMajor\_deps"
  $depMappings = @{
    'ABSL' = 'absl-src'
    'EIGEN' = 'eigen-src'
    'PFFFT_SOURCE' = 'pffft_source-src'
  }
  foreach ($entry in $depMappings.GetEnumerator()) {
    $sourcePath = Join-Path $existingDeps $entry.Value
    if (Test-Path -LiteralPath $sourcePath -PathType Container) {
      $configure += "-DFETCHCONTENT_SOURCE_DIR_$($entry.Key)=$sourcePath"
    }
  }

  & $cmake @configure
  if ($LASTEXITCODE -ne 0) { throw "Native audio quality configure failed with exit code $LASTEXITCODE." }
  & $cmake --build $buildDir --config $Configuration --target fe_audio_quality_probe --parallel
  if ($LASTEXITCODE -ne 0) { throw "Native audio quality build failed with exit code $LASTEXITCODE." }

  $probe = Join-Path $probeRuntimeDir 'fe_audio_quality_probe.exe'
  if (!(Test-Path -LiteralPath $probe -PathType Leaf)) {
    throw "Native audio quality probe was not produced: $probe"
  }

  & $javac -encoding UTF-8 --release 17 -d $javaClassesDir `
    (Join-Path $rootPath 'src\main\java\com\femonster\core\ProjectPaths.java') `
    (Join-Path $rootPath 'src\main\java\com\femonster\core\NativeAudioEngine.java') `
    (Join-Path $rootPath 'src\test\java\com\femonster\core\NativeAudioChannelRouterLiveProbe.java')
  if ($LASTEXITCODE -ne 0) { throw "Live native audio pair probe compilation failed with exit code $LASTEXITCODE." }

  $Env:FE_MONSTER_ROOT = $rootPath
  $Env:FE_MONSTER_WEB_ROOT = Join-Path $rootPath 'web'
  $Env:FE_MONSTER_DATA_DIR = $liveDataDir
  $Env:FE_MONSTER_XAUDIO2_DLL = $xaudioDll
  $Env:FE_MONSTER_RUST_UPMIX_DLL = $rustDll
  & $java -cp $javaClassesDir com.femonster.core.NativeAudioChannelRouterLiveProbe
  if ($LASTEXITCODE -ne 0) { throw "Live native audio production-pair probe failed with exit code $LASTEXITCODE." }

  & $probe
  if ($LASTEXITCODE -ne 0) { throw "Native audio quality probe failed with exit code $LASTEXITCODE." }

  Write-Host "Selected native audio runtime: $($productionPair.Path)"
  Write-Host "Native audio build ID: $($productionPair.BuildId)"
  Write-Host "XAudio SHA-256: $($productionPair.XaudioSha256)"
  Write-Host "Rust SHA-256: $($productionPair.UpmixSha256)"
  Write-Host "Pair SHA-256: $($productionPair.PairSha256)"
  Write-Host "Timestamp order: Rust $($productionPair.RustTimestamp.ToString('o')) < XAudio $($productionPair.XaudioTimestamp.ToString('o')) < manifest $($productionPair.ManifestTimestamp.ToString('o'))"
  Write-Host 'Live JNI production-pair probe: passed (stream remained muted)'
} finally {
  $Env:TEMP = $previousTemp
  $Env:TMP = $previousTmp
  $Env:FE_MONSTER_XAUDIO2_DLL = $previousXaudioDll
  $Env:FE_MONSTER_RUST_UPMIX_DLL = $previousRustDll
  $Env:FE_MONSTER_ROOT = $previousRoot
  $Env:FE_MONSTER_WEB_ROOT = $previousWebRoot
  $Env:FE_MONSTER_DATA_DIR = $previousDataDir
}
