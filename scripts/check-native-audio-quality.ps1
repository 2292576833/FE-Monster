param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ObrSourceDir = '',
  [ValidateSet('Release', 'RelWithDebInfo')]
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$qualitySource = Join-Path $rootPath 'scripts\fixtures\native-audio-quality'
$nativeRoot = Join-Path $rootPath 'native\windows'
$rustRoot = Join-Path $rootPath 'native\rust-audio-upmix'
$obrRevision = '478dc7c752d5eccae534635139ff0253eee3a14a'

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

$vsWhere = Join-Path ${Env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path -LiteralPath $vsWhere -PathType Leaf)) { throw 'vswhere.exe was not found.' }
$vsInstall = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
$vsMajorText = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property catalog_productLineVersion).Trim()
$vsMajor = if ($vsMajorText) { [int]$vsMajorText } else { 17 }
$generator = if ($vsMajor -ge 18) { 'Visual Studio 18 2026' } else { 'Visual Studio 17 2022' }
$cmake = Resolve-FirstCommandPath -Name 'cmake.exe' -Candidates @(
  (Join-Path $vsInstall 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe')
)
$cargo = Resolve-FirstCommandPath -Name 'cargo.exe' -Candidates @(
  (Join-Path $rootPath '.tools\cargo\bin\cargo.exe')
)
$workspaceCargo = Join-Path $rootPath '.tools\cargo\bin\cargo.exe'
if ((Test-Path -LiteralPath $workspaceCargo -PathType Leaf) -and
    ([IO.Path]::GetFullPath($cargo) -eq [IO.Path]::GetFullPath($workspaceCargo))) {
  $Env:CARGO_HOME = Join-Path $rootPath '.tools\cargo'
  $Env:RUSTUP_HOME = Join-Path $rootPath '.tools\rustup'
}

if (!$ObrSourceDir) {
  $ObrSourceDir = Join-Path $rootPath ".tmp\google-obr-native-$($obrRevision.Substring(0, 12))"
}
if (!(Test-Path -LiteralPath (Join-Path $ObrSourceDir 'obr\renderer\obr_impl.cc') -PathType Leaf)) {
  throw "Pinned Google OBR checkout is missing: $ObrSourceDir"
}
$resolvedRevision = (& git -C $ObrSourceDir rev-parse HEAD).Trim()
if ($resolvedRevision -ne $obrRevision) {
  throw "Google OBR revision mismatch: expected $obrRevision, found $resolvedRevision"
}

if (!$Env:JAVA_HOME) {
  $javac = Resolve-FirstCommandPath -Name 'javac.exe'
  $jdkRoot = Split-Path -Parent (Split-Path -Parent $javac)
} else {
  $jdkRoot = (Resolve-Path -LiteralPath $Env:JAVA_HOME).Path
}
$jniInclude = Join-Path $jdkRoot 'include'
$jniWindowsInclude = Join-Path $jniInclude 'win32'

$testTemp = Join-Path $rootPath '.tmp\native-audio-quality-temp'
$buildDir = Join-Path $nativeRoot ".cmake-build-audio-quality-vs$vsMajor"
$runtimeDir = Join-Path $buildDir 'runtime'
foreach ($directory in @($testTemp, $buildDir, $runtimeDir)) {
  if (!(Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
}
$Env:TEMP = $testTemp
$Env:TMP = $testTemp

Push-Location $rustRoot
try {
  & $cargo build --release --locked
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
$rustDll = Join-Path $rustRoot 'target\release\fe_monster_upmix.dll'
if (!(Test-Path -LiteralPath $rustDll -PathType Leaf)) {
  throw "Rust audio DLL was not produced: $rustDll"
}

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
  "-DFE_RUNTIME_OUTPUT_DIR=$runtimeDir"
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
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $cmake --build $buildDir --config $Configuration --target fe_audio_quality_probe --parallel
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$probe = Join-Path $runtimeDir 'fe_audio_quality_probe.exe'
if (!(Test-Path -LiteralPath $probe -PathType Leaf)) {
  throw "Native audio quality probe was not produced: $probe"
}
$previousRustDll = $Env:FE_MONSTER_RUST_UPMIX_DLL
try {
  $Env:FE_MONSTER_RUST_UPMIX_DLL = $rustDll
  & $probe
  $probeExit = $LASTEXITCODE
} finally {
  $Env:FE_MONSTER_RUST_UPMIX_DLL = $previousRustDll
}
exit $probeExit
