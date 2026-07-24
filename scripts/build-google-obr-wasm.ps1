param(
    [string]$EmsdkRoot = $env:EMSDK,
    [string]$ObrSource = "",
    [string]$CMakeExe = "",
    [string]$NinjaExe = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bridgeSource = Join-Path $projectRoot "native\google-obr-wasm"
$buildRoot = Join-Path $projectRoot ".tmp\google-obr-wasm-build"
$defaultObrSource = Join-Path $projectRoot ".tmp\google-obr-source"
$outputRoot = Join-Path $projectRoot "web\vendor\google-obr"
$pinnedRevision = (Get-Content -LiteralPath (Join-Path $bridgeSource "REVISION") -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($ObrSource)) {
    $ObrSource = $defaultObrSource
}

if (-not (Test-Path -LiteralPath (Join-Path $ObrSource "obr\renderer\obr_impl.cc"))) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $ObrSource) -Force | Out-Null
    & git clone https://github.com/google/obr.git $ObrSource
    if ($LASTEXITCODE -ne 0) { throw "Unable to clone official google/obr source." }
}

& git -C $ObrSource fetch --depth 1 origin $pinnedRevision
if ($LASTEXITCODE -ne 0) { throw "Unable to fetch pinned google/obr revision." }
& git -C $ObrSource checkout --detach $pinnedRevision
if ($LASTEXITCODE -ne 0) { throw "Unable to check out pinned google/obr revision." }
$actualRevision = (& git -C $ObrSource rev-parse HEAD).Trim()
if ($actualRevision -ne $pinnedRevision) {
    throw "Official OBR revision mismatch: expected $pinnedRevision, got $actualRevision"
}

if ([string]::IsNullOrWhiteSpace($EmsdkRoot)) {
    throw "Pass -EmsdkRoot or set EMSDK to an Emscripten SDK containing emcmake.bat."
}
$emcmake = Join-Path $EmsdkRoot "upstream\emscripten\emcmake.bat"
if (-not (Test-Path -LiteralPath $emcmake)) {
    throw "emcmake.bat was not found under $EmsdkRoot"
}
$emsdkPython = Get-ChildItem -LiteralPath (Join-Path $EmsdkRoot "python") -Recurse -Filter "python.exe" |
    Select-Object -First 1 -ExpandProperty FullName
$emsdkNode = Get-ChildItem -LiteralPath (Join-Path $EmsdkRoot "node") -Recurse -Filter "node.exe" |
    Select-Object -First 1 -ExpandProperty FullName
if ([string]::IsNullOrWhiteSpace($emsdkPython) -or -not (Test-Path -LiteralPath $emsdkPython)) {
    throw "The Emscripten SDK Python runtime was not found under $EmsdkRoot"
}
if ([string]::IsNullOrWhiteSpace($emsdkNode) -or -not (Test-Path -LiteralPath $emsdkNode)) {
    throw "The Emscripten SDK Node runtime was not found under $EmsdkRoot"
}
$env:EMSDK = $EmsdkRoot
$env:EM_CONFIG = Join-Path $EmsdkRoot ".emscripten"
$env:EMSDK_PYTHON = $emsdkPython
$env:EMSDK_NODE = $emsdkNode
$env:PATH = "$(Join-Path $EmsdkRoot 'upstream\emscripten');$EmsdkRoot;$env:PATH"

if ([string]::IsNullOrWhiteSpace($CMakeExe)) {
    $resolvedCMake = Get-Command cmake -ErrorAction SilentlyContinue
    if ($resolvedCMake) { $CMakeExe = $resolvedCMake.Source }
}
if ([string]::IsNullOrWhiteSpace($NinjaExe)) {
    $resolvedNinja = Get-Command ninja -ErrorAction SilentlyContinue
    if ($resolvedNinja) { $NinjaExe = $resolvedNinja.Source }
}
if (-not (Test-Path -LiteralPath $CMakeExe)) {
    throw "CMake 3.28+ is required. Pass its full path through -CMakeExe."
}
if (-not (Test-Path -LiteralPath $NinjaExe)) {
    throw "Ninja is required. Pass its full path through -NinjaExe."
}

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$ninjaDirectory = Split-Path -Parent $NinjaExe
$env:PATH = "$ninjaDirectory;$env:PATH"
$obrSourceForCMake = $ObrSource.Replace("\", "/")

& $emcmake $CMakeExe `
    --fresh `
    -S $bridgeSource `
    -B $buildRoot `
    -G Ninja `
    "-DCMAKE_MAKE_PROGRAM=$NinjaExe" `
    "-DOBR_SOURCE_DIR=$obrSourceForCMake" `
    "-DCMAKE_BUILD_TYPE=Release"
if ($LASTEXITCODE -ne 0) { throw "Google OBR WebAssembly configure failed." }

& $CMakeExe --build $buildRoot --target obr_official --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw "Google OBR WebAssembly build failed." }

$generatedModule = Join-Path $buildRoot "obr-official.js"
if (-not (Test-Path -LiteralPath $generatedModule)) {
    throw "Expected OBR module was not generated: $generatedModule"
}

Copy-Item -LiteralPath $generatedModule -Destination (Join-Path $outputRoot "obr-official.js") -Force
Copy-Item -LiteralPath (Join-Path $ObrSource "LICENSE") -Destination (Join-Path $outputRoot "LICENSE") -Force
Copy-Item -LiteralPath (Join-Path $ObrSource "PATENTS") -Destination (Join-Path $outputRoot "PATENTS") -Force
Copy-Item -LiteralPath (Join-Path $bridgeSource "REVISION") -Destination (Join-Path $outputRoot "REVISION") -Force
Copy-Item -LiteralPath (Join-Path $buildRoot "_deps\absl-src\LICENSE") -Destination (Join-Path $outputRoot "ABSEIL-LICENSE") -Force
Copy-Item -LiteralPath (Join-Path $buildRoot "_deps\eigen-src\COPYING.MPL2") -Destination (Join-Path $outputRoot "EIGEN-COPYING.MPL2") -Force
Copy-Item -LiteralPath (Join-Path $buildRoot "_deps\eigen-src\COPYING.BSD") -Destination (Join-Path $outputRoot "EIGEN-COPYING.BSD") -Force
Copy-Item -LiteralPath (Join-Path $buildRoot "_deps\eigen-src\COPYING.README") -Destination (Join-Path $outputRoot "EIGEN-COPYING.README") -Force
Copy-Item -LiteralPath (Join-Path $bridgeSource "licenses\PFFFT-LICENSE.txt") -Destination (Join-Path $outputRoot "PFFFT-LICENSE") -Force

$moduleSize = (Get-Item -LiteralPath (Join-Path $outputRoot "obr-official.js")).Length
Write-Host "Official Google OBR WebAssembly runtime built successfully."
Write-Host "Revision: $actualRevision"
Write-Host "Module: $outputRoot\obr-official.js ($moduleSize bytes)"
