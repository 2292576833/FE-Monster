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
  [string]$CommunityServerUrl = $Env:FE_MONSTER_RELEASE_COMMUNITY_URL,
  [string]$CommunityServerTlsPins = $Env:FE_MONSTER_RELEASE_COMMUNITY_TLS_PINS,
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
if (
  $ReusePayloadZip -and
  (![string]::IsNullOrWhiteSpace($CommunityServerUrl) -or
    ![string]::IsNullOrWhiteSpace($CommunityServerTlsPins))
) {
  throw 'Explicit community release settings cannot be combined with -ReusePayloadZip because the reused payload cannot be revalidated.'
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

  Invoke-Step 'Building bundled Netease API plugin' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'music-api-plugins\netease\build.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Netease API plugin build failed with exit code $LASTEXITCODE" }
  }

  Invoke-Step 'Building bundled QQ API plugin' {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'music-api-plugins\qq\build.ps1')
    if ($LASTEXITCODE -ne 0) { throw "QQ API plugin build failed with exit code $LASTEXITCODE" }
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
    --compress=2 `
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
  & $stagedJavaw -version
  if ($LASTEXITCODE -ne 0) {
    throw "Bundled Java windowless runtime failed its version probe with exit code $LASTEXITCODE"
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
    'web\cache-fingerprints.json',
    'web\app.js',
    'web\styles.css',
    'web\lyric-render-quality.css',
    'web\app-command.js',
    'web\playback-intelligence.js',
    'web\wallpaper-video-continuity.js',
    'web\pet-emotion-runtime.js',
    'web\pet-client-context.js',
    'web\pet-live-turn-controller.js',
    'web\pet-live-audio-worklet.js',
    'web\pet-live-telemetry.js',
    'web\pet-live-playout.js',
    'web\pet-live-stt-client.js',
    'web\pet-assistant.js',
    'web\fe-identity-card.js',
    'web\fe-identity-card.css',
    'web\pet-product-tour.js',
    'web\pet-product-tour.css',
    'web\community-reward-runtime.js',
    'web\community-reward-runtime.css',
    'web\pet-particle-orb.js',
    'web\pet-assistant.css',
    'web\pet-companion-p2.js',
    'web\pet-companion-p2.css',
    'web\creative-community.js',
    'web\assets\fe-monster-pet-mascot.png',
    'web\assets\fe-monster-pet-mascot-chroma.png',
    'scripts\install-fe-monster.ps1',
    'scripts\ensure-runtime-dependencies.ps1',
    'scripts\java-runtime.ps1',
    'data\community-server-url.txt',
    'data\community-server-tls-pin.txt',
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\FE Monster.dll',
    'native\windows\build\winforms\FE Monster.deps.json',
    'native\windows\build\winforms\FE Monster.runtimeconfig.json',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll',
    'plugins\music-api\FE-Monster-Netease-API-Plugin-4.32.0.zip',
    'plugins\music-api\FE-Monster-QQ-API-Plugin-2.4.1.zip',
    'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.7.zip',
    'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip'
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

function ConvertTo-NormalizedCommunityTlsPins {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
  $entries = @($Value -split '[,;\r\n]+' | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
  if ($entries.Count -lt 1 -or $entries.Count -gt 2) {
    throw 'Community server TLS pins must contain one or two SHA-256 leaf certificate fingerprints.'
  }

  $normalized = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $entries) {
    $candidate = $entry.Trim()
    if ($candidate.StartsWith('sha256:', [StringComparison]::OrdinalIgnoreCase)) {
      $candidate = $candidate.Substring('sha256:'.Length)
    }
    $candidate = $candidate.Replace(':', '')
    if ($candidate -notmatch '^[A-Fa-f0-9]{64}$') {
      throw 'Community server TLS pins must be SHA-256 leaf certificate fingerprints.'
    }
    $candidate = $candidate.ToUpperInvariant()
    if (!$normalized.Contains($candidate)) { $normalized.Add($candidate) }
  }
  return @($normalized)
}

function Initialize-CommunityHealthProbeType {
  if ($null -ne ('FeMonsterInstaller.CommunityHealthProbe' -as [type])) { return }

  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace FeMonsterInstaller {
    public static class CommunityHealthProbe {
        public static bool ValidateCertificate(
            X509Certificate certificate,
            string[] pins,
            SslPolicyErrors errors,
            DateTime utcNow
        ) {
            HashSet<string> allowedPins = new HashSet<string>(
                pins ?? new string[0],
                StringComparer.OrdinalIgnoreCase
            );
            if (certificate == null) return false;
            if ((errors & SslPolicyErrors.RemoteCertificateNameMismatch) != 0) return false;
            if ((errors & SslPolicyErrors.RemoteCertificateNotAvailable) != 0) return false;
            using (X509Certificate2 leaf = new X509Certificate2(certificate)) {
                if (utcNow < leaf.NotBefore.ToUniversalTime() || utcNow > leaf.NotAfter.ToUniversalTime()) {
                    return false;
                }
                using (SHA256 sha256 = SHA256.Create()) {
                    byte[] digest = sha256.ComputeHash(leaf.RawData);
                    StringBuilder fingerprint = new StringBuilder(digest.Length * 2);
                    foreach (byte value in digest) fingerprint.Append(value.ToString("X2"));
                    return allowedPins.Contains(fingerprint.ToString());
                }
            }
        }

        public static string Get(string url, string[] pins, int timeoutMilliseconds) {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.AllowAutoRedirect = false;
            request.Timeout = timeoutMilliseconds;
            request.ReadWriteTimeout = timeoutMilliseconds;
            request.ServerCertificateValidationCallback = delegate(
                object sender,
                X509Certificate certificate,
                X509Chain chain,
                SslPolicyErrors errors
            ) {
                return ValidateCertificate(certificate, pins, errors, DateTime.UtcNow);
            };

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {
                int statusCode = (int)response.StatusCode;
                if (statusCode < 200 || statusCode >= 300) {
                    throw new WebException("Community health endpoint returned a non-success status.");
                }
                using (Stream stream = response.GetResponseStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8, true)) {
                    return reader.ReadToEnd();
                }
            }
        }
    }
}
'@ | Out-Null
}

function Invoke-PinnedCommunityHealthRequest {
  param(
    [string]$HealthUrl,
    [string[]]$TlsPins
  )

  Initialize-CommunityHealthProbeType
  return [FeMonsterInstaller.CommunityHealthProbe]::Get($HealthUrl, $TlsPins, 8000)
}

function Test-IsPublicCommunityAddress {
  param([Net.IPAddress]$Address)

  if ($null -eq $Address) { return $false }
  if ($Address.IsIPv4MappedToIPv6) {
    return Test-IsPublicCommunityAddress $Address.MapToIPv4()
  }
  if (
    [Net.IPAddress]::IsLoopback($Address) -or
    $Address.Equals([Net.IPAddress]::Any) -or
    $Address.Equals([Net.IPAddress]::IPv6Any)
  ) {
    return $false
  }

  if ($Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
    $bytes = $Address.GetAddressBytes()
    if ($bytes[0] -in @(0, 10, 127)) { return $false }
    if ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127) { return $false }
    if ($bytes[0] -eq 169 -and $bytes[1] -eq 254) { return $false }
    if ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) { return $false }
    if ($bytes[0] -eq 192 -and $bytes[1] -eq 168) { return $false }
    if ($bytes[0] -eq 192 -and $bytes[1] -eq 0 -and $bytes[2] -in @(0, 2)) { return $false }
    if ($bytes[0] -eq 198 -and $bytes[1] -in @(18, 19)) { return $false }
    if ($bytes[0] -eq 198 -and $bytes[1] -eq 51 -and $bytes[2] -eq 100) { return $false }
    if ($bytes[0] -eq 203 -and $bytes[1] -eq 0 -and $bytes[2] -eq 113) { return $false }
    if ($bytes[0] -ge 224) { return $false }
    return $true
  }

  if ($Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetworkV6) {
    if ($Address.IsIPv6LinkLocal -or $Address.IsIPv6SiteLocal -or $Address.IsIPv6Multicast) {
      return $false
    }
    $bytes = $Address.GetAddressBytes()
    if (($bytes[0] -band 0xFE) -eq 0xFC) { return $false }
    if ($bytes[0] -eq 0x20 -and $bytes[1] -eq 0x01 -and $bytes[2] -eq 0x0D -and $bytes[3] -eq 0xB8) {
      return $false
    }
    return $true
  }

  return $false
}

function Resolve-CommunityServerAddresses {
  param([Uri]$Uri)

  $hostName = $Uri.DnsSafeHost.TrimEnd('.')
  [Net.IPAddress]$literalAddress = $null
  if ([Net.IPAddress]::TryParse($hostName, [ref]$literalAddress)) {
    return ,$literalAddress
  }

  try {
    $addresses = @([Net.Dns]::GetHostAddresses($hostName))
  } catch {
    throw "Release community server host '$hostName' could not be resolved."
  }
  if ($addresses.Count -eq 0) {
    throw "Release community server host '$hostName' did not resolve to an address."
  }
  return $addresses
}

function Assert-PublicCommunityServerUrl {
  param([string]$Value)

  $configuredUrl = $Value.Trim().TrimStart([char]0xFEFF).Trim()
  if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
    throw 'Release community server URL is empty.'
  }

  [Uri]$communityUri = $null
  if (
    ![Uri]::TryCreate($configuredUrl, [UriKind]::Absolute, [ref]$communityUri) -or
    $communityUri.Scheme -ne [Uri]::UriSchemeHttps -or
    [string]::IsNullOrWhiteSpace($communityUri.Host)
  ) {
    throw 'Release community server URL must be an absolute HTTPS URL.'
  }
  if (
    ![string]::IsNullOrWhiteSpace($communityUri.UserInfo) -or
    ![string]::IsNullOrWhiteSpace($communityUri.Query) -or
    ![string]::IsNullOrWhiteSpace($communityUri.Fragment)
  ) {
    throw 'Release community server URL cannot contain credentials, a query, or a fragment.'
  }

  $hostName = $communityUri.DnsSafeHost.TrimEnd('.')
  if ($communityUri.IsLoopback -or $hostName.Equals('localhost', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release community server URL cannot use a loopback host.'
  }

  $addresses = @(Resolve-CommunityServerAddresses $communityUri)
  foreach ($address in $addresses) {
    if (!(Test-IsPublicCommunityAddress $address)) {
      throw "Release community server host '$hostName' resolved to a non-public address."
    }
  }

  return $communityUri.GetLeftPart([UriPartial]::Path).TrimEnd('/')
}

function Assert-CommunityServerHealth {
  param(
    [string]$CommunityBaseUrl,
    [string[]]$TlsPins = @()
  )

  [Uri]$communityUri = $CommunityBaseUrl
  $healthUrl = $CommunityBaseUrl.TrimEnd('/') + '/health'
  $maximumAttempts = 5
  $lastFailure = ''
  for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
    try {
      if (@($TlsPins).Count -gt 0) {
        $healthJson = Invoke-PinnedCommunityHealthRequest -HealthUrl $healthUrl -TlsPins $TlsPins
        $health = $healthJson | ConvertFrom-Json
      } else {
        $health = Invoke-RestMethod `
          -Method Get `
          -Uri $healthUrl `
          -TimeoutSec 8 `
          -MaximumRedirection 0
      }

      $serviceProperty = if ($null -eq $health) { $null } else { $health.PSObject.Properties['service'] }
      if ($null -eq $serviceProperty -or [string]$serviceProperty.Value -cne 'fe-monster-community') {
        throw 'Unexpected community health service identity.'
      }
      return
    } catch {
      $lastFailure = $_.Exception.Message
      Write-Warning "Community health check attempt $attempt/$maximumAttempts failed: $lastFailure"
      if ($attempt -lt $maximumAttempts) {
        Start-Sleep -Milliseconds ([Math]::Min(8000, 500 * [Math]::Pow(2, $attempt - 1)))
      }
    }
  }
  throw "Release community health check failed for host '$($communityUri.DnsSafeHost)' after $maximumAttempts attempts. Last error: $lastFailure"
}

function Assert-PayloadZipCommunityConfiguration {
  param(
    [string]$ArchivePath,
    [switch]$SkipHealthCheck
  )

  if (!(Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw "Payload zip was not found: $ArchivePath"
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    $urlEntries = @($archive.Entries | Where-Object {
      $_.FullName.Replace('\', '/').TrimStart('/').Equals(
        'FE Monster/data/community-server-url.txt',
        [StringComparison]::OrdinalIgnoreCase
      )
    })
    if ($urlEntries.Count -ne 1) {
      throw 'Payload zip must contain exactly one community server URL configuration.'
    }
    if ($urlEntries[0].Length -gt 4096) {
      throw 'Payload community server URL configuration is unexpectedly large.'
    }
    $urlStream = $urlEntries[0].Open()
    $urlReader = [IO.StreamReader]::new($urlStream, [Text.Encoding]::UTF8, $true)
    try {
      $configuredUrl = $urlReader.ReadToEnd()
    } finally {
      $urlReader.Dispose()
      $urlStream.Dispose()
    }

    $pinEntries = @($archive.Entries | Where-Object {
      $_.FullName.Replace('\', '/').TrimStart('/').Equals(
        'FE Monster/data/community-server-tls-pin.txt',
        [StringComparison]::OrdinalIgnoreCase
      )
    })
    if ($pinEntries.Count -gt 1) {
      throw 'Payload zip contains duplicate community TLS pin configurations.'
    }
    $rawTlsPins = ''
    if ($pinEntries.Count -eq 1) {
      if ($pinEntries[0].Length -gt 4096) {
        throw 'Payload community TLS pin configuration is unexpectedly large.'
      }
      $pinStream = $pinEntries[0].Open()
      $pinReader = [IO.StreamReader]::new($pinStream, [Text.Encoding]::UTF8, $true)
      try {
        $rawTlsPins = $pinReader.ReadToEnd()
      } finally {
        $pinReader.Dispose()
        $pinStream.Dispose()
      }
    }
  } finally {
    $archive.Dispose()
  }

  $validatedCommunityUrl = Assert-PublicCommunityServerUrl $configuredUrl
  $normalizedTlsPins = @()
  if ($pinEntries.Count -eq 1) {
    if ([string]::IsNullOrWhiteSpace($rawTlsPins)) {
      throw 'Payload community TLS pin configuration is empty.'
    }
    $normalizedTlsPins = @(ConvertTo-NormalizedCommunityTlsPins $rawTlsPins)
    $expectedPinText = @($normalizedTlsPins | ForEach-Object { "sha256:$_" }) -join "`n"
    $actualPinText = $rawTlsPins.Trim().Replace("`r`n", "`n").Replace("`r", "`n")
    if ($actualPinText -cne $expectedPinText) {
      throw 'Payload community TLS pins are not in canonical normalized form.'
    }
  }

  if (!$SkipHealthCheck) {
    Assert-CommunityServerHealth -CommunityBaseUrl $validatedCommunityUrl -TlsPins $normalizedTlsPins
  }
  return $validatedCommunityUrl
}

function Stage-CommunityServerConfiguration {
  if (![string]::IsNullOrWhiteSpace($CommunityServerUrl)) {
    $validatedCommunityUrl = Assert-PublicCommunityServerUrl $CommunityServerUrl
    $normalizedTlsPins = @(ConvertTo-NormalizedCommunityTlsPins $CommunityServerTlsPins)
    Assert-CommunityServerHealth -CommunityBaseUrl $validatedCommunityUrl -TlsPins $normalizedTlsPins
    $destination = Join-Path $payloadRoot 'data\community-server-url.txt'
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    [IO.File]::WriteAllText(
      $destination,
      $validatedCommunityUrl,
      [Text.UTF8Encoding]::new($false)
    )
    if ($normalizedTlsPins.Count -gt 0) {
      $pinDestination = Join-Path $payloadRoot 'data\community-server-tls-pin.txt'
      $pinLines = @($normalizedTlsPins | ForEach-Object { "sha256:$_" })
      [IO.File]::WriteAllText(
        $pinDestination,
        ($pinLines -join [Environment]::NewLine),
        [Text.UTF8Encoding]::new($false)
      )
    }
    Write-Host 'Staged validated public community server URL.'
    return
  }

  if (![string]::IsNullOrWhiteSpace($CommunityServerTlsPins)) {
    throw '-CommunityServerTlsPins can only be used with an explicit HTTPS -CommunityServerUrl.'
  }

  $communityUrlFile = Join-Path $rootPath 'data\community-server-url.txt'
  if (!(Test-Path -LiteralPath $communityUrlFile -PathType Leaf)) { return }

  $rawCommunityUrl = Get-Content -LiteralPath $communityUrlFile -Raw
  $configuredCommunityUrl = $rawCommunityUrl.Trim().TrimStart([char]0xFEFF).Trim()
  if ([string]::IsNullOrWhiteSpace($configuredCommunityUrl)) { return }

  [Uri]$communityUri = $null
  $isAbsoluteUri = [Uri]::TryCreate(
    $configuredCommunityUrl,
    [UriKind]::Absolute,
    [ref]$communityUri
  )
  if (
    !$isAbsoluteUri -or
    ($communityUri.Scheme -ne [Uri]::UriSchemeHttp -and
      $communityUri.Scheme -ne [Uri]::UriSchemeHttps) -or
    [string]::IsNullOrWhiteSpace($communityUri.Host)
  ) {
    throw "Community server URL must be an absolute HTTP(S) URL: $configuredCommunityUrl"
  }

  $communityHost = $communityUri.DnsSafeHost.TrimEnd('.')
  $isLoopback =
    $communityUri.IsLoopback -or
    $communityHost.Equals('localhost', [StringComparison]::OrdinalIgnoreCase)

  [Net.IPAddress]$communityAddress = $null
  if ([Net.IPAddress]::TryParse($communityHost, [ref]$communityAddress)) {
    if ($communityAddress.IsIPv4MappedToIPv6) {
      $communityAddress = $communityAddress.MapToIPv4()
    }
    $isLoopback = $isLoopback -or [Net.IPAddress]::IsLoopback($communityAddress)
  }

  if ($isLoopback) {
    Write-Host "Skipping local-only community server URL in distributable payload: $configuredCommunityUrl"
    return
  }

  $communityPinFile = Join-Path $rootPath 'data\community-server-tls-pin.txt'
  if ($communityUri.Scheme -ne [Uri]::UriSchemeHttps) {
    throw 'Developer community server URL must use HTTPS before it can be staged in a distributable payload.'
  }

  $validatedCommunityUrl = Assert-PublicCommunityServerUrl $configuredCommunityUrl
  $normalizedTlsPins = @()
  if (Test-Path -LiteralPath $communityPinFile -PathType Leaf) {
    $normalizedTlsPins = @(
      ConvertTo-NormalizedCommunityTlsPins (Get-Content -LiteralPath $communityPinFile -Raw)
    )
  }
  Assert-CommunityServerHealth -CommunityBaseUrl $validatedCommunityUrl -TlsPins $normalizedTlsPins

  $destination = Join-Path $payloadRoot 'data\community-server-url.txt'
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  [IO.File]::WriteAllText(
    $destination,
    $validatedCommunityUrl,
    [Text.UTF8Encoding]::new($false)
  )
  if ($normalizedTlsPins.Count -gt 0) {
    $pinDestination = Join-Path $payloadRoot 'data\community-server-tls-pin.txt'
    $pinLines = @($normalizedTlsPins | ForEach-Object { "sha256:$_" })
    [IO.File]::WriteAllText(
      $pinDestination,
      ($pinLines -join [Environment]::NewLine),
      [Text.UTF8Encoding]::new($false)
    )
  }
  Write-Host 'Staged validated developer community HTTPS configuration.'
}

function Stage-Payload {
  Reset-Directory $workRoot
  New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $setupRoot -Force | Out-Null

  foreach ($file in @(
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

  $stagedScripts = Join-Path $payloadRoot 'scripts'
  $scriptsBeforeBytes = (
    Get-ChildItem -LiteralPath $stagedScripts -Recurse -File -Force |
      Measure-Object -Property Length -Sum
  ).Sum
  Get-ChildItem -LiteralPath $stagedScripts -File -Filter 'check-*' -Force |
    Remove-Item -Force
  foreach ($relativePath in @('fixtures', 'java')) {
    $developmentDirectory = Join-Path $stagedScripts $relativePath
    if (Test-Path -LiteralPath $developmentDirectory -PathType Container) {
      Remove-Item -LiteralPath $developmentDirectory -Recurse -Force
    }
  }
  Get-ChildItem -LiteralPath $stagedScripts -Recurse -Directory -Force |
    Where-Object { $_.Name -eq '__pycache__' } |
    Sort-Object -Property FullName -Descending |
    Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath $stagedScripts -Recurse -File -Force |
    Where-Object { $_.Extension -in @('.pyc', '.pyo') } |
    Remove-Item -Force
  $scriptsAfterBytes = (
    Get-ChildItem -LiteralPath $stagedScripts -Recurse -File -Force |
      Measure-Object -Property Length -Sum
  ).Sum
  $savedScriptMiB = [math]::Round(($scriptsBeforeBytes - $scriptsAfterBytes) / 1MB, 2)
  Write-Host "== Removed $savedScriptMiB MiB of build-time checks and fixtures from staged scripts"

  # This full source font is used only by repository checks. Runtime CSS loads
  # the subsetted WOFF2 and web TTF files that remain in the payload.
  $buildOnlyFont = Join-Path $payloadRoot 'web\fonts\awei-pixel\AaWeiWeiDianZhenTi.ttf'
  if (Test-Path -LiteralPath $buildOnlyFont -PathType Leaf) {
    Remove-Item -LiteralPath $buildOnlyFont -Force
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

  Stage-CommunityServerConfiguration

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
    (Join-Path $rootPath 'dist\plugins\FE-Monster-Netease-API-Plugin-4.32.0.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-Netease-API-Plugin-4.32.0.zip')
  Copy-File `
    (Join-Path $rootPath 'dist\plugins\FE-Monster-QQ-API-Plugin-2.4.1.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-QQ-API-Plugin-2.4.1.zip')
  Copy-File `
    (Join-Path $rootPath 'dist\plugins\FE-Monster-Kugou-API-Plugin-2.0.7.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.7.zip')
  Copy-File `
    (Join-Path $rootPath 'dist\plugins\FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip') `
    (Join-Path $payloadRoot 'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip')

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
    'web\cache-fingerprints.json',
    'web\app-command.js',
    'web\playback-intelligence.js',
    'web\wallpaper-video-continuity.js',
    'web\pet-emotion-runtime.js',
    'web\pet-client-context.js',
    'web\pet-live-turn-controller.js',
    'web\pet-live-audio-worklet.js',
    'web\pet-live-telemetry.js',
    'web\pet-live-playout.js',
    'web\pet-live-stt-client.js',
    'web\pet-assistant.js',
    'web\fe-identity-card.js',
    'web\fe-identity-card.css',
    'web\pet-product-tour.js',
    'web\pet-product-tour.css',
    'web\community-reward-runtime.js',
    'web\community-reward-runtime.css',
    'web\lyric-render-quality.css',
    'web\pet-particle-orb.js',
    'web\pet-assistant.css',
    'web\pet-companion-p2.js',
    'web\pet-companion-p2.css',
    'web\creative-community.js',
    'web\assets\fe-monster-pet-mascot.png',
    'web\assets\fe-monster-pet-mascot-chroma.png',
    'scripts\install-fe-monster.ps1',
    'scripts\ensure-runtime-dependencies.ps1',
    'scripts\java-runtime.ps1',
    'data\community-server-url.txt',
    'data\community-server-tls-pin.txt',
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\FE Monster.dll',
    'native\windows\build\winforms\FE Monster.deps.json',
    'native\windows\build\winforms\FE Monster.runtimeconfig.json',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll',
    'plugins\music-api\FE-Monster-Netease-API-Plugin-4.32.0.zip',
    'plugins\music-api\FE-Monster-QQ-API-Plugin-2.4.1.zip',
    'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.7.zip',
    'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip'
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
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-netease-api-plugin-4.32.0.zip')) {
      throw 'Payload is missing the bundled Netease 4.32.0 bootstrap package.'
    }
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-qq-api-plugin-2.4.1.zip')) {
      throw 'Payload is missing the bundled QQ 2.4.1 bootstrap package.'
    }
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-kugou-api-plugin-2.0.7.zip')) {
      throw 'Payload is missing the bundled Kugou 2.0.7 migration package.'
    }
    if (!($entries -contains 'fe monster/plugins/music-api/fe-monster-qishui-openapi-plugin-3.1.1.zip')) {
      throw 'Payload is missing the bundled Qishui OpenAPI 3.1.1 migration package.'
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

Invoke-Step 'Validating cross-computer runtime dependency resilience' {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'scripts\check-runtime-dependency-resilience.ps1') -Root $rootPath
  if ($LASTEXITCODE -ne 0) {
    throw "Runtime dependency resilience check failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step 'Validating camera hand-control removal' {
  & node (Join-Path $rootPath 'scripts\check-camera-hand-control-removed.mjs')
  if ($LASTEXITCODE -ne 0) {
    throw "Camera hand-control removal check failed with exit code $LASTEXITCODE"
  }
}

if (!$SkipBuild) {
  Build-App
}
if ($ReusePayloadZip) {
  if ($StageOnly) { throw '-StageOnly cannot be combined with -ReusePayloadZip.' }
  if (!(Test-Path $payloadZip)) { throw "Existing payload zip was not found: $payloadZip" }
  $null = Assert-PayloadZipCommunityConfiguration $payloadZip -SkipHealthCheck
} else {
  Stage-Payload
  & node `
    (Join-Path $rootPath 'scripts\check-camera-hand-control-removed.mjs') `
    --payload-root `
    $payloadRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Staged camera hand-control removal check failed with exit code $LASTEXITCODE"
  }
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
$null = Assert-PayloadZipCommunityConfiguration $payloadZip -SkipHealthCheck:(!$ReusePayloadZip)
Assert-PluginOnlyPayloadZip
New-SetupExe
Protect-AndDescribeInstaller

$size = [math]::Round((Get-Item $installerExe).Length / 1MB, 2)
Write-Host "Built installer: $installerExe ($size MB)"
if (Test-Path $setupBundleOutput) {
  $bundleSize = [math]::Round((Get-Item $setupBundleOutput).Length / 1MB, 2)
  Write-Host "Built setup bundle: $setupBundleOutput ($bundleSize MB)"
}
