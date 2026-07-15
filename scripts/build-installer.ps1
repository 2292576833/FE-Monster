param(
  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist'),
  [switch]$SkipBuild,
  [switch]$NoNodeBundle,
  [switch]$ReusePayloadZip,
  [switch]$EmbedPayload,
  [switch]$AllowEmbeddedPayload
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputDir)
$workRoot = Join-Path $rootPath 'out\installer'
$payloadParent = Join-Path $workRoot 'payload'
$payloadRoot = Join-Path $payloadParent 'FE Monster'
$setupRoot = Join-Path $workRoot 'setup'
$payloadZip = Join-Path $setupRoot 'FE-Monster-Payload.zip'
$installerExe = Join-Path $outputPath 'FE-Monster-Setup.exe'
$setupBundleOutput = Join-Path $outputPath 'FE-Monster-Setup-Bundle.zip'
$setupProject = Join-Path $rootPath 'native\windows\setup\FeMonsterSetup.csproj'
$setupProjectDir = Split-Path -Parent $setupProject
$setupPayloadResource = Join-Path $setupProjectDir 'SetupPayload.zip'

if (!$PSBoundParameters.ContainsKey('EmbedPayload')) {
  $EmbedPayload = $true
}
if ($EmbedPayload -and !$AllowEmbeddedPayload) {
  Write-Warning 'Building a single-file installer with embedded payload as requested.'
}

function Assert-UnderRoot {
  param([string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  if (!$full.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside workspace: $full"
  }
  return $full
}

function Reset-Directory {
  param([string]$Path)
  $full = Assert-UnderRoot $Path
  if (Test-Path $full) { Remove-Item -LiteralPath $full -Recurse -Force }
  New-Item -ItemType Directory -Path $full | Out-Null
}

function Copy-Dir {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (!(Test-Path $Source)) { throw "Missing directory: $Source" }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  & robocopy.exe $Source $Destination /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed for $Source with exit code $LASTEXITCODE" }
}

function Copy-DirExcept {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludeDirs = @()
  )
  if (!(Test-Path $Source)) { throw "Missing directory: $Source" }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $args = @($Source, $Destination, '/E', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  if ($ExcludeDirs.Count -gt 0) {
    $args += '/XD'
    $args += $ExcludeDirs
  }
  & robocopy.exe @args | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed for $Source with exit code $LASTEXITCODE" }
}

function Copy-File {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (!(Test-Path $Source)) { throw "Missing file: $Source" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Open-FileForAppendWithRetry {
  param(
    [string]$Path,
    [int]$Attempts = 30,
    [int]$DelayMilliseconds = 500
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      return [System.IO.File]::Open($Path, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
    } catch {
      if ($attempt -eq $Attempts) { throw }
      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }
}

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

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Host "== $Name"
  & $Action
}

function Stage-BundledSceneLibrary {
  $preparer = Join-Path $rootPath 'scripts\prepare-android-bundled-library.ps1'
  $serverRoot = Join-Path (Split-Path -Parent $rootPath) 'FE moster server'
  $serverData = Join-Path $serverRoot 'data'
  if (!(Test-Path $preparer) -or !(Test-Path $serverData)) {
    Write-Warning 'Local scene library source was not found; the installer will omit server-authored offline presets.'
    return
  }

  Invoke-Step 'Bundling local scene presets and playback assets' {
    & powershell.exe -NoProfile -File $preparer `
      -Root $rootPath `
      -OutputDir (Join-Path $payloadRoot 'web') `
      -ServerRoot $serverRoot
    if ($LASTEXITCODE -ne 0) {
      throw "prepare-android-bundled-library.ps1 failed with exit code $LASTEXITCODE"
    }
    $manifest = Join-Path $payloadRoot 'web\data\android-bundled-library.json'
    if (!(Test-Path $manifest)) {
      throw "Bundled scene library manifest was not produced: $manifest"
    }
  }
}

function Build-App {
  Invoke-Step 'Stopping stale FE Monster processes' {
    & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\stop-stale-fe-monster.ps1') -Root $rootPath
  }

  Invoke-Step 'Building Java jar' {
    & cmd.exe /c "`"$rootPath\build.cmd`""
    if ($LASTEXITCODE -ne 0) { throw "build.cmd failed with exit code $LASTEXITCODE" }
  }

  $xaudioDll = Join-Path $rootPath 'native\windows\build\fe-monster-xaudio2.dll'
  if (!(Test-Path $xaudioDll)) {
    Invoke-Step 'Building XAudio2 bridge' {
      & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\build-xaudio2.ps1') -Root $rootPath
      if ($LASTEXITCODE -ne 0) { throw "build-xaudio2.ps1 failed with exit code $LASTEXITCODE" }
    }
  }

  Invoke-Step 'Building WinForms client' {
    & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\build-winforms-client.ps1') -Root $rootPath
    if ($LASTEXITCODE -ne 0) { throw "build-winforms-client.ps1 failed with exit code $LASTEXITCODE" }
  }
}

function Stage-Payload {
  Reset-Directory $workRoot
  New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $setupRoot -Force | Out-Null

  foreach ($file in @(
    'run.cmd',
    'FE Monster.vbs',
    'build.cmd',
    'clean.cmd',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'README.md',
    'LICENSE',
    'PRODUCT.md',
    'UPDATE.md',
    'PROJECT_STATUS.md',
    'NETEASE_LOGIN_PERSISTENCE.md',
    '使用说明.md'
  )) {
    $source = Join-Path $rootPath $file
    if (Test-Path $source) { Copy-File $source (Join-Path $payloadRoot $file) }
  }

  foreach ($dir in @('web', 'components', 'scripts', 'src')) {
    Copy-Dir (Join-Path $rootPath $dir) (Join-Path $payloadRoot $dir)
  }

  Stage-BundledSceneLibrary

  $communityUrlFile = Join-Path $rootPath 'data\community-server-url.txt'
  if (Test-Path $communityUrlFile) {
    Copy-File $communityUrlFile (Join-Path $payloadRoot 'data\community-server-url.txt')
  }

  Stage-RuntimeNodeModules
  Stage-GesturePythonRuntime
  Copy-File (Join-Path $rootPath 'out\fe-monster-java.jar') (Join-Path $payloadRoot 'out\fe-monster-java.jar')
  Copy-Dir (Join-Path $rootPath 'native\windows\build') (Join-Path $payloadRoot 'native\windows\build')

  if (!$NoNodeBundle) {
    $node = Find-Exe 'node.exe' @(
      (Join-Path $Env:ProgramFiles 'nodejs'),
      (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
    )
    if ([string]::IsNullOrWhiteSpace($node)) {
      throw 'node.exe was not found. Install Node.js or rerun with -NoNodeBundle.'
    }
    Copy-File $node (Join-Path $payloadRoot 'runtime\node\node.exe')
  }

  foreach ($required in @(
    'out\fe-monster-java.jar',
    'web\index.html',
    'node_modules\NeteaseCloudMusicApi',
    'node_modules\@sansenjian\qq-music-api\dist\cli.js',
    'node_modules\kugoumusicapi\app.js',
    'runtime\python\python.exe',
    'runtime\python-site-packages\cv2',
    'runtime\python-site-packages\mediapipe',
    'runtime\python-site-packages\pyautogui',
    'runtime\python-site-packages\pygrabber',
    'native\windows\build\winforms\fe-monster-client.exe',
    'native\windows\build\fe-monster-xaudio2.dll'
  )) {
    if (!(Test-Path (Join-Path $payloadRoot $required))) {
      throw "Payload is missing required item: $required"
    }
  }
}

function Stage-RuntimeNodeModules {
  $runtimeRoot = Join-Path $workRoot 'runtime-node-modules'
  Reset-Directory $runtimeRoot
  Set-Content -Encoding UTF8 -Path (Join-Path $runtimeRoot 'package.json') -Value @'
{
  "private": true,
  "dependencies": {
    "@sansenjian/qq-music-api": "^2.4.0",
    "NeteaseCloudMusicApi": "^4.32.0",
    "kugoumusicapi": "https://codeload.github.com/MakcRe/KuGouMusicApi/tar.gz/283f1e97b110726b208a64b486a657c0fc0a6126"
  }
}
'@

  $npm = Find-Exe 'npm.cmd' @(
    (Join-Path $Env:ProgramFiles 'nodejs'),
    (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
  )
  if ([string]::IsNullOrWhiteSpace($npm)) {
    throw 'npm.cmd was not found; cannot build runtime node_modules.'
  }

  Write-Host '== Installing runtime music API node_modules'
  Push-Location $runtimeRoot
  try {
    & $npm install --omit=dev --no-audit --no-fund --no-package-lock
    if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }

  Copy-Dir (Join-Path $runtimeRoot 'node_modules') (Join-Path $payloadRoot 'node_modules')
}

function Test-GesturePythonImports {
  param([string]$PythonExe)
  if (!(Test-Path $PythonExe)) { return $false }
  & $PythonExe -c "import cv2, mediapipe, pyautogui, pygrabber; print('gesture-python-ok')"
  return $LASTEXITCODE -eq 0
}

function Stage-GesturePythonRuntime {
  $venvRoot = Join-Path $rootPath '.venv-gesture'
  $venvPython = Join-Path $venvRoot 'Scripts\python.exe'
  $requirements = Join-Path $rootPath 'scripts\gesture-requirements.txt'
  if (!(Test-Path $venvPython)) {
    throw "Gesture Python venv was not found: $venvPython"
  }
  if (!(Test-Path $requirements)) {
    throw "Gesture requirements file was not found: $requirements"
  }

  Write-Host '== Validating gesture Python dependencies'
  if (!(Test-GesturePythonImports $venvPython)) {
    throw 'Gesture Python dependencies are missing. Run: .venv-gesture\Scripts\python.exe -m pip install -r scripts\gesture-requirements.txt'
  }

  $pythonHome = (& $venvPython -c "import sys; print(sys.base_prefix)") | Select-Object -First 1
  $pythonHome = [string]$pythonHome
  if ([string]::IsNullOrWhiteSpace($pythonHome) -or !(Test-Path $pythonHome)) {
    throw "Could not locate base Python runtime for gesture venv: $pythonHome"
  }

  $pythonDest = Join-Path $payloadRoot 'runtime\python'
  $sitePackagesSource = Join-Path $venvRoot 'Lib\site-packages'
  $sitePackagesDest = Join-Path $payloadRoot 'runtime\python-site-packages'
  if (!(Test-Path $sitePackagesSource)) {
    throw "Gesture site-packages were not found: $sitePackagesSource"
  }

  Write-Host '== Staging gesture Python runtime'
  Copy-DirExcept $pythonHome $pythonDest @((Join-Path $pythonHome 'Lib\site-packages'))
  Copy-Dir $sitePackagesSource $sitePackagesDest

  $stagedPython = Join-Path $pythonDest 'python.exe'
  $previousPythonPath = $Env:PYTHONPATH
  $previousNoUserSite = $Env:PYTHONNOUSERSITE
  try {
    $Env:PYTHONPATH = $sitePackagesDest
    $Env:PYTHONNOUSERSITE = '1'
    if (!(Test-GesturePythonImports $stagedPython)) {
      throw 'Staged gesture Python runtime cannot import OpenCV, MediaPipe, PyAutoGUI, and PyGrabber.'
    }
  } finally {
    if ($null -eq $previousPythonPath) { Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue } else { $Env:PYTHONPATH = $previousPythonPath }
    if ($null -eq $previousNoUserSite) { Remove-Item Env:\PYTHONNOUSERSITE -ErrorAction SilentlyContinue } else { $Env:PYTHONNOUSERSITE = $previousNoUserSite }
  }
}

function New-PayloadZip {
  if (Test-Path $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Write-Host '== Creating payload zip'
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $payloadParent,
    $payloadZip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )
}

function New-SetupExe {
  New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
  Copy-File (Join-Path $rootPath 'scripts\install-fe-monster.ps1') (Join-Path $setupRoot 'install-fe-monster.ps1')
  Set-Content -Encoding ASCII -Path (Join-Path $setupRoot 'install.cmd') -Value @'
@echo off
powershell.exe -NoProfile -File "%~dp0install-fe-monster.ps1"
if errorlevel 1 pause
'@

  $bundleRoot = Join-Path $workRoot 'setup-bundle'
  $bundleZip = Join-Path $workRoot 'FE-Monster-Setup-Bundle.zip'
  Reset-Directory $bundleRoot
  Copy-File (Join-Path $setupRoot 'install.cmd') (Join-Path $bundleRoot 'install.cmd')
  Copy-File (Join-Path $setupRoot 'install-fe-monster.ps1') (Join-Path $bundleRoot 'install-fe-monster.ps1')
  Copy-File $payloadZip (Join-Path $bundleRoot 'FE-Monster-Payload.zip')

  if (Test-Path $bundleZip) { Remove-Item -LiteralPath $bundleZip -Force }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Write-Host '== Creating setup bundle'
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $bundleRoot,
    $bundleZip,
    [System.IO.Compression.CompressionLevel]::NoCompression,
    $false
  )

  if (!(Test-Path $setupProject)) { throw "Setup project was not found: $setupProject" }
  if (Test-Path $setupPayloadResource) { Remove-Item -LiteralPath $setupPayloadResource -Force }
  if ($EmbedPayload) {
    Write-Host '== Embedding setup payload resource'
    Copy-Item -LiteralPath $bundleZip -Destination $setupPayloadResource -Force
  }
  $publishDir = Join-Path $workRoot 'setup-publish'
  if (Test-Path $publishDir) { Remove-Item -LiteralPath $publishDir -Recurse -Force }
  Write-Host '== Publishing setup stub'
  & dotnet publish $setupProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=false -p:PublishReadyToRun=false -p:DebugType=None -p:DebugSymbols=false -o $publishDir
  if ($LASTEXITCODE -ne 0) { throw "dotnet publish setup failed with exit code $LASTEXITCODE" }

  $stub = Join-Path $publishDir 'FE-Monster-Setup.exe'
  if (!(Test-Path $stub)) { throw "Setup stub was not created: $stub" }

  if ($EmbedPayload) {
    Copy-Item -LiteralPath $stub -Destination $installerExe -Force
    if (Test-Path $setupBundleOutput) { Remove-Item -LiteralPath $setupBundleOutput -Force }
  } else {
    Write-Host '== Using sidecar payload mode to reduce antivirus false positives'
    Copy-Item -LiteralPath $stub -Destination $installerExe -Force
    Copy-Item -LiteralPath $bundleZip -Destination $setupBundleOutput -Force
  }

  if (Test-Path $setupPayloadResource) { Remove-Item -LiteralPath $setupPayloadResource -Force }
}

if (!$SkipBuild) {
  Build-App
}
if ($ReusePayloadZip) {
  if (!(Test-Path $payloadZip)) { throw "Existing payload zip was not found: $payloadZip" }
} else {
  Stage-Payload
  New-PayloadZip
}
New-SetupExe

$size = [math]::Round((Get-Item $installerExe).Length / 1MB, 2)
Write-Host "Built installer: $installerExe ($size MB)"
if (Test-Path $setupBundleOutput) {
  $bundleSize = [math]::Round((Get-Item $setupBundleOutput).Length / 1MB, 2)
  Write-Host "Built setup bundle: $setupBundleOutput ($bundleSize MB)"
}
