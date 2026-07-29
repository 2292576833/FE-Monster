param(
  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist'),
  [switch]$SkipBuild,
  [switch]$NoNodeBundle,
  [switch]$ReusePayloadZip,
  [switch]$StageOnly,
  [switch]$EmbedPayload,
  [switch]$AllowEmbeddedPayload,
  [ValidateSet('Online', 'Offline')]
  [string]$WebView2Mode = 'Online',
  [string]$BundledSceneServerRoot = $Env:FE_MONSTER_BUNDLED_SCENE_SERVER_ROOT,
  [string]$SignCertificateThumbprint = $Env:FE_MONSTER_SIGN_CERTIFICATE_THUMBPRINT,
  [string]$TimestampUrl = $(if ([string]::IsNullOrWhiteSpace($Env:FE_MONSTER_SIGN_TIMESTAMP_URL)) { 'http://timestamp.digicert.com' } else { $Env:FE_MONSTER_SIGN_TIMESTAMP_URL }),
  [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageMetadata = Get-Content -LiteralPath (Join-Path $rootPath 'package.json') -Raw | ConvertFrom-Json
$appVersion = [string]$packageMetadata.version
if ($appVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "package.json contains an invalid release version: $appVersion"
}
$includeOfflineWebView2 = $WebView2Mode -eq 'Offline'
$installerFlavorSuffix = if ($includeOfflineWebView2) { '-Offline' } else { '' }
$outputPath = [System.IO.Path]::GetFullPath($OutputDir)
$workRoot = Join-Path $rootPath 'out\installer\work'
$payloadParent = Join-Path $workRoot 'payload'
$payloadRoot = Join-Path $payloadParent 'FE Monster'
$setupRoot = Join-Path $workRoot 'setup'
$payloadZip = Join-Path $setupRoot 'FE-Monster-Payload.zip'
$installerExe = Join-Path $outputPath "FE-Monster-Setup-$appVersion$installerFlavorSuffix.exe"
$setupBundleOutput = Join-Path $outputPath "FE-Monster-Setup$installerFlavorSuffix-Bundle.zip"
$setupProject = Join-Path $rootPath 'native\windows\setup\FeMonsterSetup.csproj'
$setupProjectDir = Split-Path -Parent $setupProject
$setupPayloadResource = Join-Path $setupProjectDir 'SetupPayload.zip'
$payloadIntegrityManifestName = 'payload-integrity.json'
$setupManifestName = 'setup-manifest.json'
$minimumWindowsBuild = 17763
$peMachineAmd64 = 0x8664
$webView2StandaloneUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124701'
$webView2StandaloneName = 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'

if (!$PSBoundParameters.ContainsKey('EmbedPayload')) {
  $EmbedPayload = $true
}
if ($NoNodeBundle) {
  throw '-NoNodeBundle is not supported: FE Monster requires bundled Node.js for imported music API plugins.'
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

function Assert-GlbImagesAreEmbedded {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
      if ($reader.ReadUInt32() -ne 0x46546C67) { throw "Not a binary glTF file: $Path" }
      if ($reader.ReadUInt32() -ne 2) { throw "Only glTF 2.0 can be staged: $Path" }
      [void]$reader.ReadUInt32()
      $jsonLength = $reader.ReadUInt32()
      if ($reader.ReadUInt32() -ne 0x4E4F534A) { throw "GLB has no JSON chunk: $Path" }
      $json = [System.Text.Encoding]::UTF8.GetString($reader.ReadBytes($jsonLength)).TrimEnd([char]0, [char]0x20)
      $document = $json | ConvertFrom-Json
      $externalImage = @($document.images) |
        Where-Object { $null -eq $_.bufferView -or ![string]::IsNullOrWhiteSpace([string]$_.uri) } |
        Select-Object -First 1
      if ($null -ne $externalImage) {
        throw "GLB contains an external image and still needs its source texture directory: $Path"
      }
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-FileSha256 {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-PeMachine {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return 0 }
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
      if ($reader.ReadUInt16() -ne 0x5A4D) { return 0 }
      $stream.Position = 0x3C
      $peOffset = $reader.ReadInt32()
      if ($peOffset -lt 0 -or $peOffset -gt ($stream.Length - 6)) { return 0 }
      $stream.Position = $peOffset
      if ($reader.ReadUInt32() -ne 0x00004550) { return 0 }
      return $reader.ReadUInt16()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-X64Pe {
  param(
    [string]$Path,
    [string]$Label
  )
  $machine = Get-PeMachine $Path
  if ($machine -ne $peMachineAmd64) {
    throw "$Label is not an x64 PE image (machine=0x$('{0:X4}' -f $machine)): $Path"
  }
}

function Assert-NoDynamicVcRuntime {
  param([string]$Path)
  $ascii = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($Path)).ToUpperInvariant()
  $imports = @('VCRUNTIME140.DLL', 'VCRUNTIME140_1.DLL', 'MSVCP140.DLL')
  $found = @($imports | Where-Object { $ascii.Contains($_) })
  if ($found.Count -gt 0) {
    throw "$(Split-Path -Leaf $Path) still depends on the Visual C++ redistributable: $($found -join ', '). Rebuild the native x64 targets with the static CRT."
  }
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
  $manifest = Join-Path $payloadRoot 'web\data\android-bundled-library.json'
  if ([string]::IsNullOrWhiteSpace($BundledSceneServerRoot)) {
    Write-Host '== Skipping external scene library (set FE_MONSTER_BUNDLED_SCENE_SERVER_ROOT to opt in)'
    $emptyLibrary = [ordered]@{
      schema = 'fe-monster.android-bundled-library/v1'
      generatedAt = 0
      components = @()
      presets = @()
    } | ConvertTo-Json -Depth 3 -Compress
    [System.IO.File]::WriteAllText($manifest, $emptyLibrary, [System.Text.UTF8Encoding]::new($false))
    return
  }

  $serverRoot = [System.IO.Path]::GetFullPath($BundledSceneServerRoot)
  $serverData = Join-Path $serverRoot 'data'
  if (!(Test-Path $preparer) -or !(Test-Path $serverData)) {
    throw "Explicit bundled scene library source was not found: $serverData"
  }

  Invoke-Step 'Bundling local scene presets and playback assets' {
    & powershell.exe -NoProfile -File $preparer `
      -Root $rootPath `
      -OutputDir (Join-Path $payloadRoot 'web') `
      -ServerRoot $serverRoot
    if ($LASTEXITCODE -ne 0) {
      throw "prepare-android-bundled-library.ps1 failed with exit code $LASTEXITCODE"
    }
    if (!(Test-Path $manifest)) {
      throw "Bundled scene library manifest was not produced: $manifest"
    }
  }
}

function Build-App {
  Invoke-Step 'Stopping stale FE Monster processes' {
    & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\stop-stale-fe-monster.ps1') -Root $rootPath
  }

  Invoke-Step 'Building bundled Kugou API plugin' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'music-api-plugins\kugou\build.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Kugou API plugin build failed with exit code $LASTEXITCODE" }
  }

  Invoke-Step 'Building bundled Qishui OpenAPI plugin' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'music-api-plugins\qishui\build.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Qishui OpenAPI plugin build failed with exit code $LASTEXITCODE" }
  }

  Invoke-Step 'Building Java jar' {
    & cmd.exe /c "`"$rootPath\build.cmd`""
    if ($LASTEXITCODE -ne 0) { throw "build.cmd failed with exit code $LASTEXITCODE" }
  }

  $xaudioDll = Join-Path $rootPath 'native\windows\build\fe-monster-xaudio2.dll'
  $upmixDll = Join-Path $rootPath 'native\windows\build\fe_monster_upmix.dll'
  $nativeNeedsRebuild = !(Test-Path $xaudioDll) -or !(Test-Path $upmixDll)
  if (!$nativeNeedsRebuild) {
    try {
      Assert-NoDynamicVcRuntime $xaudioDll
      Assert-NoDynamicVcRuntime $upmixDll
    } catch {
      Write-Host "== Native runtime needs a static-CRT rebuild: $($_.Exception.Message)"
      $nativeNeedsRebuild = $true
    }
  }
  if ($nativeNeedsRebuild) {
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

function Assert-MicrosoftSignedExecutable {
  param(
    [string]$Path,
    [string]$Label
  )

  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label was not found: $Path"
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "$Label has an invalid Authenticode signature ($($signature.Status)): $Path"
  }
  $subject = if ($null -eq $signature.SignerCertificate) { '' } else { [string]$signature.SignerCertificate.Subject }
  if ($subject -notmatch '(?i)(^|,\s*)O=Microsoft Corporation(,|$)') {
    throw "$Label has an unexpected signer '$subject': $Path"
  }
}

function Stage-JavaRuntime {
  $javaRuntimeScript = Join-Path $rootPath 'scripts\java-runtime.ps1'
  if (!(Test-Path -LiteralPath $javaRuntimeScript -PathType Leaf)) {
    throw "Java runtime helper was not found: $javaRuntimeScript"
  }
  . $javaRuntimeScript

  $javaHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
  if ([string]::IsNullOrWhiteSpace($javaHome)) {
    throw 'A Windows x64 JDK 17+ is required to build the bundled Java runtime.'
  }
  $jlink = Join-Path $javaHome 'bin\jlink.exe'
  $jdeps = Join-Path $javaHome 'bin\jdeps.exe'
  if (!(Test-Path -LiteralPath $jlink -PathType Leaf) -or !(Test-Path -LiteralPath $jdeps -PathType Leaf)) {
    throw "The selected Java installation is not a JDK with jlink/jdeps: $javaHome"
  }

  $jar = Join-Path $rootPath 'out\fe-monster-java.jar'
  if (!(Test-Path -LiteralPath $jar -PathType Leaf)) {
    throw "Java jar was not found before runtime staging: $jar"
  }
  $runtimeDestination = Join-Path $payloadRoot 'runtime\java'
  if (Test-Path -LiteralPath $runtimeDestination) {
    Remove-Item -LiteralPath $runtimeDestination -Recurse -Force
  }

  Write-Host "== Resolving Java modules from $javaHome"
  $moduleOutput = & $jdeps --ignore-missing-deps --multi-release 17 --print-module-deps $jar
  if ($LASTEXITCODE -ne 0) {
    throw "jdeps failed with exit code $LASTEXITCODE"
  }
  $modules = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($module in ((($moduleOutput | Out-String).Trim() -split ',') + @(
    'java.desktop',
    'java.net.http',
    'jdk.crypto.ec',
    'jdk.httpserver'
  ))) {
    $name = ([string]$module).Trim()
    if (![string]::IsNullOrWhiteSpace($name)) { $modules.Add($name) | Out-Null }
  }
  $moduleList = (@($modules) | Sort-Object) -join ','
  Write-Host "== Creating bundled Java runtime: $moduleList"
  & $jlink `
    --add-modules $moduleList `
    --strip-debug `
    --no-header-files `
    --no-man-pages `
    --output $runtimeDestination
  if ($LASTEXITCODE -ne 0) {
    throw "jlink failed with exit code $LASTEXITCODE"
  }

  $stagedJava = Join-Path $runtimeDestination 'bin\java.exe'
  $stagedJavaw = Join-Path $runtimeDestination 'bin\javaw.exe'
  $namedBackend = Join-Path $runtimeDestination 'bin\FE Monster Backend.exe'
  Assert-X64Pe $stagedJava 'Bundled Java runtime'
  Assert-X64Pe $stagedJavaw 'Bundled Java windowless runtime'
  Copy-Item -LiteralPath $stagedJavaw -Destination $namedBackend -Force
  Assert-X64Pe $namedBackend 'Named FE Monster Java backend'
  & $stagedJava -version
  if ($LASTEXITCODE -ne 0) {
    throw "Bundled Java runtime failed its version probe with exit code $LASTEXITCODE"
  }
  & $namedBackend -version
  if ($LASTEXITCODE -ne 0) {
    throw "Named FE Monster Java backend failed its version probe with exit code $LASTEXITCODE"
  }
}

function Stage-WebView2RuntimeInstaller {
  $cacheRoot = Join-Path $rootPath 'out\runtime-installers'
  $cachedInstaller = Join-Path $cacheRoot $webView2StandaloneName
  $temporaryInstaller = "$cachedInstaller.download.$PID"
  New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null

  $cachedInstallerIsValid = $false
  if (Test-Path -LiteralPath $cachedInstaller -PathType Leaf) {
    try {
      $cachedSize = (Get-Item -LiteralPath $cachedInstaller).Length
      if ($cachedSize -lt 100MB) {
        throw "cached file is unexpectedly small ($cachedSize bytes)"
      }
      Assert-MicrosoftSignedExecutable $cachedInstaller 'Cached WebView2 x64 standalone installer'
      $cachedInstallerIsValid = $true
    } catch {
      Write-Warning $_.Exception.Message
      Remove-Item -LiteralPath $cachedInstaller -Force -ErrorAction SilentlyContinue
    }
  }

  if (!$cachedInstallerIsValid) {
    Write-Host '== Downloading Microsoft WebView2 x64 offline runtime'
    $downloaded = $false
    $lastDownloadError = ''
    for ($attempt = 1; $attempt -le 3 -and !$downloaded; $attempt += 1) {
      Remove-Item -LiteralPath $temporaryInstaller -Force -ErrorAction SilentlyContinue
      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $bits = Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue
        if ($null -ne $bits) {
          Start-BitsTransfer `
            -Source $webView2StandaloneUrl `
            -Destination $temporaryInstaller `
            -DisplayName 'FE Monster WebView2 offline runtime'
        } else {
          Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $webView2StandaloneUrl `
            -OutFile $temporaryInstaller `
            -TimeoutSec 900
        }
        $downloadSize = (Get-Item -LiteralPath $temporaryInstaller).Length
        if ($downloadSize -lt 100MB) {
          throw "Downloaded WebView2 installer is unexpectedly small ($downloadSize bytes)."
        }
        Assert-MicrosoftSignedExecutable $temporaryInstaller 'Downloaded WebView2 x64 standalone installer'
        Move-Item -LiteralPath $temporaryInstaller -Destination $cachedInstaller -Force
        $downloaded = $true
      } catch {
        $lastDownloadError = $_.Exception.Message
        Remove-Item -LiteralPath $temporaryInstaller -Force -ErrorAction SilentlyContinue
        Write-Warning "WebView2 offline runtime download attempt $attempt failed: $lastDownloadError"
        if ($attempt -lt 3) { Start-Sleep -Seconds ([math]::Pow(2, $attempt)) }
      }
    }
    if (!$downloaded) {
      throw "Could not download a complete Microsoft WebView2 x64 offline runtime after 3 attempts: $lastDownloadError"
    }
  }

  $destination = Join-Path $payloadRoot "runtime\installers\$webView2StandaloneName"
  Copy-File $cachedInstaller $destination
  Assert-MicrosoftSignedExecutable $destination 'Staged WebView2 x64 standalone installer'
}

function New-PayloadIntegrityManifest {
  $relativeFiles = New-Object System.Collections.Generic.List[string]
  foreach ($relative in @(
    'out\fe-monster-java.jar',
    'web\index.html',
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'runtime\python\python.exe',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll',
    'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.1.zip',
    'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip'
  )) {
    $relativeFiles.Add($relative) | Out-Null
  }
  if ($includeOfflineWebView2) {
    $relativeFiles.Add('runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe') | Out-Null
  }
  if (!$NoNodeBundle) {
    $relativeFiles.Add('runtime\node\node.exe') | Out-Null
  }

  $entries = foreach ($relative in $relativeFiles) {
    $path = Join-Path $payloadRoot $relative
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Payload integrity source is missing: $relative"
    }
    $machine = Get-PeMachine $path
    # Microsoft's x64 WebView2 standalone package uses an x86 bootstrap stub
    # while installing only the x64 Runtime selected by its signed package.
    $isSignedWebView2Installer =
      $relative -eq 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
    if ($machine -ne 0 -and $machine -ne $peMachineAmd64 -and !$isSignedWebView2Installer) {
      throw "Payload contains a non-x64 PE image: $relative (machine=0x$('{0:X4}' -f $machine))"
    }
    [ordered]@{
      path = $relative.Replace('\', '/')
      length = (Get-Item -LiteralPath $path).Length
      sha256 = Get-FileSha256 $path
      peMachine = $(if ($machine -eq 0 -or $isSignedWebView2Installer) { $null } else { $machine })
    }
  }

  $allFiles = @(Get-ChildItem -LiteralPath $payloadRoot -Recurse -File -Force)
  $maxRelativePathLength = ($allFiles | ForEach-Object {
    $_.FullName.Substring($payloadRoot.Length).TrimStart('\').Length
  } | Measure-Object -Maximum).Maximum
  $requiredInstallBytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
  $manifest = [ordered]@{
    schemaVersion = 1
    appVersion = $appVersion
    architecture = 'x64'
    minimumWindowsBuild = $minimumWindowsBuild
    maxRelativePathLength = [int]$maxRelativePathLength
    requiredInstallBytes = [long]$requiredInstallBytes
    files = @($entries)
  }
  $manifest |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $payloadRoot $payloadIntegrityManifestName) -Encoding UTF8
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

  foreach ($dir in @('web', 'scripts', 'src')) {
    Copy-Dir (Join-Path $rootPath $dir) (Join-Path $payloadRoot $dir)
  }

  $stormAssetRoot = Join-Path $payloadRoot 'web\bundled-assets\1dec0986-a81d-4847-af22-93d1976b5f2d\blender-output'
  foreach ($glb in @('storm-ocean-horizon.glb', 'pirate-ship-storm.glb')) {
    Assert-GlbImagesAreEmbedded (Join-Path $stormAssetRoot $glb)
  }
  $embeddedStormTextures = Join-Path $stormAssetRoot 'textures'
  if (Test-Path -LiteralPath $embeddedStormTextures -PathType Container) {
    Remove-Item -LiteralPath $embeddedStormTextures -Recurse -Force
  }

  # The desktop page loads only these prebuilt component assets at runtime.
  # Keep source JSX and component demos in the repository, not in the installer.
  foreach ($component in @(
    'GlassSurface.css',
    'BorderGlow.css',
    'BlurText.runtime.js',
    'BorderGlow.runtime.js'
  )) {
    Copy-File `
      (Join-Path $rootPath "components\$component") `
      (Join-Path $payloadRoot "components\$component")
  }

  Stage-BundledSceneLibrary

  $communityUrlFile = Join-Path $rootPath 'data\community-server-url.txt'
  if (Test-Path $communityUrlFile) {
    Copy-File $communityUrlFile (Join-Path $payloadRoot 'data\community-server-url.txt')
  }

  Stage-GesturePythonRuntime
  Copy-File (Join-Path $rootPath 'out\fe-monster-java.jar') (Join-Path $payloadRoot 'out\fe-monster-java.jar')
  $nativeBuildSource = Join-Path $rootPath 'native\windows\build'
  $nativeBuildDestination = Join-Path $payloadRoot 'native\windows\build'
  Copy-File `
    (Join-Path $nativeBuildSource 'fe-monster-xaudio2.dll') `
    (Join-Path $nativeBuildDestination 'fe-monster-xaudio2.dll')
  Copy-File `
    (Join-Path $nativeBuildSource 'fe_monster_upmix.dll') `
    (Join-Path $nativeBuildDestination 'fe_monster_upmix.dll')
  $nativeLicenses = Join-Path $nativeBuildSource 'licenses'
  if (Test-Path -LiteralPath $nativeLicenses -PathType Container) {
    Copy-Dir $nativeLicenses (Join-Path $nativeBuildDestination 'licenses')
  }
  $winformsSource = Join-Path $nativeBuildSource 'winforms'
  Copy-DirExcept `
    $winformsSource `
    (Join-Path $nativeBuildDestination 'winforms') `
    @(
      (Join-Path $winformsSource 'FE Monster.exe.WebView2'),
      (Join-Path $winformsSource 'fe-monster-client.exe.WebView2')
    )
  foreach ($developmentFile in @(
    'createdump.exe',
    'FE Monster.pdb',
    'Microsoft.Web.WebView2.Core.xml',
    'Microsoft.Web.WebView2.WinForms.xml',
    'mscordaccore.dll',
    'mscordaccore_amd64_amd64_8.0.2826.26413.dll',
    'mscordbi.dll'
  )) {
    $stagedDevelopmentFile = Join-Path $nativeBuildDestination "winforms\$developmentFile"
    if (Test-Path -LiteralPath $stagedDevelopmentFile -PathType Leaf) {
      Remove-Item -LiteralPath $stagedDevelopmentFile -Force
    }
  }
  Copy-File `
    (Join-Path $rootPath 'dist\plugins\FE-Monster-Kugou-API-Plugin-2.0.1.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.1.zip')
  Copy-File `
    (Join-Path $rootPath 'dist\plugins\FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip')

  Stage-JavaRuntime
  if ($includeOfflineWebView2) {
    Stage-WebView2RuntimeInstaller
  } else {
    Write-Host '== Building slim installer; WebView2 will use winget or the signed Microsoft online bootstrapper when missing'
  }

  if (!$NoNodeBundle) {
    $node = Find-Exe 'node.exe' @(
      (Join-Path $Env:ProgramFiles 'nodejs'),
      (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
    )
    if ([string]::IsNullOrWhiteSpace($node)) {
      throw 'node.exe was not found. Install Node.js or rerun with -NoNodeBundle.'
    }
    Copy-File $node (Join-Path $payloadRoot 'runtime\node\node.exe')
    $stagedNode = Join-Path $payloadRoot 'runtime\node\node.exe'
    Assert-X64Pe $stagedNode 'Bundled Node.js runtime'
    $nodeArchitecture = (& $stagedNode -p 'process.arch').Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -ne 'x64') {
      throw "Bundled Node.js runtime is not usable as x64 (reported '$nodeArchitecture')."
    }
  }

  $requiredPayloadItems = @(
    'out\fe-monster-java.jar',
    'web\index.html',
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'runtime\python\python.exe',
    'runtime\python-site-packages\cv2',
    'runtime\python-site-packages\mediapipe',
    'runtime\python-site-packages\pyautogui',
    'runtime\python-site-packages\pygrabber',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll',
    'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.1.zip',
    'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.0.zip'
  )
  if ($includeOfflineWebView2) {
    $requiredPayloadItems += 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
  }
  foreach ($required in $requiredPayloadItems) {
    if (!(Test-Path (Join-Path $payloadRoot $required))) {
      throw "Payload is missing required item: $required"
    }
  }

  foreach ($nativeRelative in @(
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'runtime\python\python.exe',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll'
  )) {
    Assert-X64Pe (Join-Path $payloadRoot $nativeRelative) $nativeRelative
  }
  Assert-NoDynamicVcRuntime (Join-Path $payloadRoot 'native\windows\build\fe-monster-xaudio2.dll')
  Assert-NoDynamicVcRuntime (Join-Path $payloadRoot 'native\windows\build\fe_monster_upmix.dll')
  New-PayloadIntegrityManifest
}

function Test-GesturePythonImports {
  param([string]$PythonExe)
  if (!(Test-Path $PythonExe)) { return $false }
  & $PythonExe -B -c "import cv2, mediapipe, pyautogui, pygrabber; print('gesture-python-ok')"
  return $LASTEXITCODE -eq 0
}

function Remove-StagedGestureDevelopmentFiles {
  param(
    [string]$PythonDestination,
    [string]$SitePackagesDestination
  )

  $beforeBytes = @($PythonDestination, $SitePackagesDestination) |
    ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File -Force } |
    Measure-Object -Property Length -Sum

  foreach ($relativePath in @(
    'Lib\ensurepip',
    'Lib\idlelib',
    'Lib\lib2to3',
    'Lib\pydoc_data',
    'Lib\turtledemo',
    'include',
    'libs',
    'Scripts'
  )) {
    $target = Join-Path $PythonDestination $relativePath
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
  }

  foreach ($target in @(
    (Join-Path $SitePackagesDestination 'pip'),
    (Join-Path $SitePackagesDestination 'cv2\samples')
  )) {
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
  }
  Get-ChildItem -LiteralPath $SitePackagesDestination -Directory -Filter 'pip-*.dist-info' -Force |
    Remove-Item -Recurse -Force

  foreach ($scanRoot in @($PythonDestination, $SitePackagesDestination)) {
    Get-ChildItem -LiteralPath $scanRoot -Recurse -Directory -Force |
      Where-Object { $_.Name -eq '__pycache__' } |
      Sort-Object -Property FullName -Descending |
      Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $scanRoot -Recurse -File -Force |
      Where-Object { $_.Extension -in @('.pyc', '.pyo') } |
      Remove-Item -Force
  }
  Get-ChildItem -LiteralPath $SitePackagesDestination -Recurse -Directory -Force |
    Where-Object { $_.Name -in @('test', 'tests') } |
    Sort-Object -Property FullName -Descending |
    Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $SitePackagesDestination -Recurse -File -Force |
    Where-Object { $_.Extension -in @('.c', '.h', '.hpp', '.lib', '.pxd', '.pyi', '.pyx') } |
    Remove-Item -Force

  $afterBytes = @($PythonDestination, $SitePackagesDestination) |
    ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File -Force } |
    Measure-Object -Property Length -Sum
  $savedMiB = [math]::Round(($beforeBytes.Sum - $afterBytes.Sum) / 1MB, 2)
  Write-Host "== Removed $savedMiB MiB of Python caches, tests, package-manager and development files"
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
  Remove-StagedGestureDevelopmentFiles $pythonDest $sitePackagesDest

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

function Assert-PluginOnlyPayloadZip {
  if (!(Test-Path $payloadZip)) { throw "Payload zip was not found: $payloadZip" }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($payloadZip)
  try {
    $forbidden = @(
      'node_modules/neteasecloudmusicapi/',
      'node_modules/@sansenjian/qq-music-api/',
      'node_modules/kugoumusicapi/',
      'scripts/start-ncm-api.ps1',
      'scripts/start-qq-api.ps1',
      'scripts/start-kugou-api.ps1',
      'scripts/netease-api-server.cjs',
      'scripts/kugou-api-server.cjs',
      'scripts/ensure-music-api-dependencies.ps1'
    )
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/').ToLowerInvariant() })
    $blocked = @($entries | Where-Object {
      $name = $_
      @($forbidden | Where-Object { $name.Contains($_) }).Count -gt 0
    })
    if ($blocked.Count -gt 0) {
      throw "Payload still contains built-in music API implementations: $($blocked -join ', ')"
    }
    if (!$NoNodeBundle -and !($entries -contains 'fe monster/runtime/node/node.exe')) {
      throw 'Payload is missing runtime/node/node.exe required by imported Node API plugins.'
    }
    $hasOfflineWebView2 = $entries -contains 'fe monster/runtime/installers/microsoftedgewebview2runtimeinstallerx64.exe'
    if ($includeOfflineWebView2 -and !$hasOfflineWebView2) {
      throw 'Offline payload is missing the bundled Microsoft WebView2 x64 runtime.'
    }
    if (!$includeOfflineWebView2 -and $hasOfflineWebView2) {
      throw 'Online payload unexpectedly contains the 194 MiB WebView2 offline runtime.'
    }
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-kugou-api-plugin-2.0.1.zip')) {
      throw 'Payload is missing the bundled Kugou 2.0.1 migration package.'
    }
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-qishui-openapi-plugin-3.1.0.zip')) {
      throw 'Payload is missing the bundled Qishui OpenAPI 3.1.0 migration package.'
    }
  } finally {
    $archive.Dispose()
  }
}

function Find-SignTool {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  $kitRoot = Join-Path ${Env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (!(Test-Path -LiteralPath $kitRoot -PathType Container)) { return '' }
  $match = Get-ChildItem -LiteralPath $kitRoot -Recurse -Filter signtool.exe -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
    Sort-Object -Property FullName -Descending |
    Select-Object -First 1
  return $(if ($null -eq $match) { '' } else { $match.FullName })
}

function Protect-AndDescribeInstaller {
  if (![string]::IsNullOrWhiteSpace($SignCertificateThumbprint)) {
    $signTool = Find-SignTool
    if ([string]::IsNullOrWhiteSpace($signTool)) {
      throw 'A signing certificate was configured, but signtool.exe was not found in the Windows SDK.'
    }
    Write-Host '== Signing installer with SHA-256 and an RFC 3161 timestamp'
    & $signTool sign `
      /sha1 $SignCertificateThumbprint `
      /fd SHA256 `
      /tr $TimestampUrl `
      /td SHA256 `
      /v `
      $installerExe
    if ($LASTEXITCODE -ne 0) {
      throw "signtool failed with exit code $LASTEXITCODE"
    }
  }

  Assert-X64Pe $installerExe 'FE Monster setup'
  $signature = Get-AuthenticodeSignature -LiteralPath $installerExe
  $isSigned = $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid
  if (!$isSigned) {
    $message = "Installer Authenticode status is $($signature.Status). Unsigned builds can trigger SmartScreen or antivirus reputation checks."
    if ($RequireSignature) { throw $message }
    Write-Warning $message
  }

  $hash = Get-FileSha256 $installerExe
  $checksumPath = "$installerExe.sha256"
  Set-Content `
    -LiteralPath $checksumPath `
    -Encoding ASCII `
    -Value ("{0} *{1}" -f $hash, (Split-Path -Leaf $installerExe))

  $diagnosticPath = [System.IO.Path]::ChangeExtension($installerExe, '.diagnostics.json')
  [ordered]@{
    schemaVersion = 1
    app = 'FE Monster'
    appVersion = $appVersion
    webView2Mode = $WebView2Mode.ToLowerInvariant()
    architecture = 'x64'
    minimumWindows = "10.0.$minimumWindowsBuild"
    installer = Split-Path -Leaf $installerExe
    installerLength = (Get-Item -LiteralPath $installerExe).Length
    installerSha256 = $hash
    signatureStatus = [string]$signature.Status
    signer = $(if ($null -eq $signature.SignerCertificate) { '' } else { $signature.SignerCertificate.Subject })
    timestampCertificate = $(if ($null -eq $signature.TimeStamperCertificate) { '' } else { $signature.TimeStamperCertificate.Subject })
    smartScreenNote = 'SmartScreen reputation is external to the binary. Use an EV/OV code-signing certificate and preserve the timestamp.'
  } |
    ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath $diagnosticPath -Encoding UTF8

  Write-Host "Installer SHA-256: $hash"
  Write-Host "Installer diagnostics: $diagnosticPath"
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
  $payloadZipInfo = Get-Item -LiteralPath $payloadZip
  $payloadArchive = [System.IO.Compression.ZipFile]::OpenRead($payloadZip)
  try {
    $payloadManifestEntry = $payloadArchive.Entries |
      Where-Object { $_.FullName.Replace('\', '/').ToLowerInvariant() -eq "fe monster/$payloadIntegrityManifestName" } |
      Select-Object -First 1
    if ($null -eq $payloadManifestEntry) {
      throw "Payload archive is missing FE Monster/$payloadIntegrityManifestName"
    }
    $reader = [System.IO.StreamReader]::new($payloadManifestEntry.Open(), [System.Text.Encoding]::UTF8, $true)
    try {
      $payloadManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }
  } finally {
    $payloadArchive.Dispose()
  }
  [ordered]@{
    schemaVersion = 1
    appVersion = $appVersion
    webView2Mode = $WebView2Mode.ToLowerInvariant()
    architecture = 'x64'
    minimumWindowsBuild = $minimumWindowsBuild
    payloadFile = 'FE-Monster-Payload.zip'
    payloadLength = $payloadZipInfo.Length
    payloadSha256 = Get-FileSha256 $payloadZip
    maxRelativePathLength = [int]$payloadManifest.maxRelativePathLength
    requiredInstallBytes = [long]$payloadManifest.requiredInstallBytes
  } |
    ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $bundleRoot $setupManifestName) -Encoding UTF8

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
  & dotnet publish $setupProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:PublishReadyToRun=false -p:DebugType=None -p:DebugSymbols=false -o $publishDir
  if ($LASTEXITCODE -ne 0) { throw "dotnet publish setup failed with exit code $LASTEXITCODE" }

  $stub = Join-Path $publishDir 'FE-Monster-Setup.exe'
  if (!(Test-Path $stub)) { throw "Setup stub was not created: $stub" }
  Assert-X64Pe $stub 'Setup host'

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

Invoke-Step 'Validating Windows installer contract' {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'scripts\check-windows-installer-contract.ps1') -Root $rootPath -WebView2Mode $WebView2Mode
  if ($LASTEXITCODE -ne 0) {
    throw "Windows installer contract check failed with exit code $LASTEXITCODE"
  }
}

if (!$SkipBuild) {
  Build-App
}
if ($ReusePayloadZip) {
  if ($StageOnly) { throw '-StageOnly cannot be combined with -ReusePayloadZip.' }
  if (!(Test-Path $payloadZip)) { throw "Existing payload zip was not found: $payloadZip" }
} else {
  Stage-Payload
  if ($StageOnly) {
    & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File (Join-Path $rootPath 'scripts\check-windows-installer-contract.ps1') `
      -Root $rootPath `
      -WebView2Mode $WebView2Mode `
      -PayloadRoot $payloadRoot
    if ($LASTEXITCODE -ne 0) {
      throw "Staged payload validation failed with exit code $LASTEXITCODE"
    }
    Write-Host "Staged and validated Windows x64 payload: $payloadRoot"
    return
  }
  New-PayloadZip
}
Assert-PluginOnlyPayloadZip
New-SetupExe
Protect-AndDescribeInstaller

$size = [math]::Round((Get-Item $installerExe).Length / 1MB, 2)
Write-Host "Built installer: $installerExe ($size MB)"
if (Test-Path $setupBundleOutput) {
  $bundleSize = [math]::Round((Get-Item $setupBundleOutput).Length / 1MB, 2)
  Write-Host "Built setup bundle: $setupBundleOutput ($bundleSize MB)"
}
