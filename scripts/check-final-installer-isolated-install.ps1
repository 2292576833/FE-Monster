param(
  [string]$Root = '',
  [string]$WinFormsSourceDir = '',
  [Parameter(Mandatory = $true)]
  [string]$SetupExe,
  [Parameter(Mandatory = $true)]
  [string]$TestRoot,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedCacheToken,
  [string]$ExpectedCommunityUrl = 'https://frp-boy.com:53981/community',
  [string]$ExpectedTlsPin = 'sha256:9AA22F07CC585686AC23DC763D060E1B189CBFA5732E3DC182AEE35F85B4B758',
  [switch]$RequireSystemDriveFull
)

$ErrorActionPreference = 'Stop'
$scriptRoot = if (![string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $PSScriptRoot
} else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Join-Path $scriptRoot '..'
}
$rootPath = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $rootPath 'scripts\release-version.ps1')
$expectedAppVersion = (Get-FeMonsterReleaseVersion (Get-Content -Raw -LiteralPath (Join-Path $rootPath 'package.json') | ConvertFrom-Json)).DisplayVersion
$winFormsReferenceRoot = if ([string]::IsNullOrWhiteSpace($WinFormsSourceDir)) {
  Join-Path $rootPath 'native\windows\build\winforms'
} else {
  (Resolve-Path -LiteralPath $WinFormsSourceDir).Path
}
$referenceClient = Get-Item -LiteralPath (Join-Path $winFormsReferenceRoot 'FE Monster.exe')
if ([string]$referenceClient.VersionInfo.ProductVersion -cne $expectedAppVersion) {
  throw 'Reference client version does not match the release. Supply the exact -WinFormsSourceDir used for packaging.'
}
$setupPath = (Resolve-Path -LiteralPath $SetupExe).Path
$testPath = [IO.Path]::GetFullPath($TestRoot)
$installPath = Join-Path $testPath 'app'
$tempPath = Join-Path $testPath 'temp'
$systemDriveFreeBytes = [long](Get-PSDrive C).Free

if ($RequireSystemDriveFull -and $systemDriveFreeBytes -gt 1MB) {
  throw "C: has $systemDriveFreeBytes free bytes; this gate requires the zero-space system-drive fixture."
}
if ([string]::Equals(
    [IO.Path]::GetPathRoot($installPath),
    [IO.Path]::GetPathRoot($Env:SystemRoot),
    [StringComparison]::OrdinalIgnoreCase
)) {
  throw "The isolated install must target a non-system drive: $installPath"
}
if (Test-Path -LiteralPath $testPath) {
  throw "The isolated test root must not already exist: $testPath"
}
New-Item -ItemType Directory -Path $testPath -Force | Out-Null
New-Item -ItemType Directory -Path $tempPath -Force | Out-Null

$Env:TEMP = $tempPath
$Env:TMP = $tempPath
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $setupPath
$startInfo.Arguments = @(
  '--quiet',
  '--install-dir',
  ('"' + $installPath.Replace('"', '\"') + '"'),
  '--no-launch',
  '-NoShortcuts',
  '-SkipSystemNodeInstall',
  '-NoRegistration'
) -join ' '
$startInfo.WorkingDirectory = $testPath
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
if (!$process.Start()) { throw 'Bundled setup executable did not start.' }
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
if (!$process.WaitForExit(600000)) {
  try { $process.Kill() } catch {}
  throw 'Bundled setup executable timed out.'
}
[IO.File]::WriteAllText(
  (Join-Path $testPath 'setup-stdout.log'),
  $stdout.Result,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'setup-stderr.log'),
  $stderr.Result,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'setup-exit.txt'),
  [string]$process.ExitCode,
  [Text.UTF8Encoding]::new($false)
)
if ($process.ExitCode -ne 0) {
  throw "Bundled setup executable returned $($process.ExitCode): $($stderr.Result)"
}

$manifestPath = Join-Path $installPath 'payload-integrity.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'Installed payload integrity manifest is missing.'
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ([string]$manifest.appVersion -cne $expectedAppVersion) {
  throw "Installed payload reports version '$($manifest.appVersion)', expected '$expectedAppVersion'."
}
foreach ($entry in @($manifest.files)) {
  $relative = ([string]$entry.path).Replace('/', '\')
  $installedFile = Join-Path $installPath $relative
  if (!(Test-Path -LiteralPath $installedFile -PathType Leaf)) {
    throw "Installed manifest file is missing: $relative"
  }
  $item = Get-Item -LiteralPath $installedFile
  if ([long]$item.Length -ne [long]$entry.length) {
    throw "Installed manifest length mismatch: $relative"
  }
  $actualHash = (Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -cne ([string]$entry.sha256).ToLowerInvariant()) {
    throw "Installed manifest hash mismatch: $relative"
  }
}

$criticalRelativeFiles = @(
  'web\index.html',
  'web\cache-fingerprints.json',
  'web\app.js',
  'web\client-ai-service.js',
  'web\pet-affect-plan.js',
  'web\settings-center.js',
  'web\audio-mixer-ui.js',
  'web\audio-mixer-visuals.js',
  'web\local-memory-client.js',
  'web\pet-memory-recall.js',
  'web\pet-preference-policy.js',
  'web\pet-preference-memory.js',
  'web\app-parameter-registry.js',
  'web\lyric-highlight-particles.js',
  'web\runtime-module-loader.js',
  'web\app-command.js',
  'web\playback-intelligence.js',
  'web\companion-care-actions.js',
  'web\pet-assistant.js',
  'web\pet-assistant.css',
  'web\community-reward-runtime.js',
  'web\community-reward-runtime.css',
  'web\fe-identity-card.js',
  'web\fe-identity-card.css',
  'web\soundscape-runtime.js',
  'web\assets\soundscape-workshop\runtime.html',
  'web\assets\soundscape-workshop\bridge.js',
  'web\assets\soundscape-workshop\project.json',
  'web\assets\soundscape-workshop\preview.gif',
  'web\assets\soundscape-workshop\assets\index-CSU_B_T9.js',
  'web\assets\soundscape-workshop\assets\index-DgmMz9-g.css',
  'native\windows\build\winforms\FE Monster.exe',
  'out\fe-monster-java.jar',
  'out\lib\sqlite-jdbc-3.53.2.1-without-natives.jar',
  'out\lib\sqlite-jdbc-3.53.2.1-natives-windows.jar',
  'out\lib\slf4j-api-1.7.36.jar',
  'native\windows\build\fe-monster-xaudio2.dll',
  'native\windows\build\fe_monster_upmix.dll',
  'native\windows\build\native-audio-build.json',
  'native\windows\build\fe-monster-wincrypto.dll',
  'plugins\music-api\FE-Monster-Netease-API-Plugin-4.32.0.zip',
  'plugins\music-api\FE-Monster-QQ-API-Plugin-2.4.2.zip',
  'plugins\music-api\FE-Monster-Kugou-API-Plugin-2.0.8.zip',
  'plugins\music-api\FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip',
  'data\community-server-url.txt',
  'data\community-server-tls-pin.txt',
  'scripts\install-fe-monster.ps1',
  'scripts\ensure-runtime-dependencies.ps1',
  'scripts\java-runtime.ps1'
)
$criticalHashes = [ordered]@{}
$stagedPayloadRoot = Join-Path $rootPath 'out\installer\work\payload\FE Monster'
foreach ($relative in $criticalRelativeFiles) {
  $sourceFile = Join-Path $rootPath $relative
  if ($relative -ceq 'native\windows\build\winforms\FE Monster.exe') {
    $sourceFile = Join-Path $winFormsReferenceRoot 'FE Monster.exe'
  } elseif ($relative.StartsWith('plugins\music-api\', [StringComparison]::OrdinalIgnoreCase)) {
    $sourceFile = Join-Path (Join-Path $rootPath 'dist\plugins') (Split-Path -Leaf $relative)
  } elseif ($relative -in @(
      'native\windows\build\fe-monster-xaudio2.dll',
      'native\windows\build\fe_monster_upmix.dll',
      'native\windows\build\native-audio-build.json',
      'data\community-server-url.txt',
      'data\community-server-tls-pin.txt'
    )) {
    # The release selects the newest hash-verified native pair from build or
    # build-next. Compare against the exact staged selection, not always the
    # older canonical build directory. Release community configuration is
    # canonicalized while staging, so compare those exact normalized bytes too.
    $sourceFile = Join-Path $stagedPayloadRoot $relative
  }
  $installedFile = Join-Path $installPath $relative
  if (!(Test-Path -LiteralPath $sourceFile -PathType Leaf) -or
      !(Test-Path -LiteralPath $installedFile -PathType Leaf)) {
    throw "Source or installed release-critical file is missing: $relative"
  }
  $sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
  $installedHash = (Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash
  if ($sourceHash -cne $installedHash) {
    throw "Source-to-installed hash mismatch: $relative"
  }
  $criticalHashes[$relative] = $installedHash.ToLowerInvariant()
}

$installedIndex = Get-Content -Raw -LiteralPath (Join-Path $installPath 'web\index.html')
if ($installedIndex.IndexOf($ExpectedCacheToken, [StringComparison]::Ordinal) -lt 0) {
  throw "Installed index does not contain cache token $ExpectedCacheToken."
}
$communityUrl = (
  Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-url.txt')
).Trim()
$tlsPin = (
  Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-tls-pin.txt')
).Trim()
if ($communityUrl -cne $ExpectedCommunityUrl) {
  throw "Installed release community URL is incorrect: $communityUrl"
}
if ($communityUrl -match '(?i)localhost|127\.0\.0\.1|\[::1\]') {
  throw "Installed release community URL is loopback: $communityUrl"
}
if ($tlsPin -cne $ExpectedTlsPin) {
  throw "Installed release TLS pin is incorrect: $tlsPin"
}

$installedClient = Get-Item -LiteralPath (Join-Path $installPath 'native\windows\build\winforms\FE Monster.exe')
$installedClientVersion = [string]$installedClient.VersionInfo.ProductVersion
if (!$installedClientVersion.StartsWith($expectedAppVersion, [StringComparison]::Ordinal)) {
  throw "Installed client reports version '$installedClientVersion', expected '$expectedAppVersion'."
}
$setupProductVersion = [string](Get-Item -LiteralPath $setupPath).VersionInfo.ProductVersion
if (!$setupProductVersion.StartsWith($expectedAppVersion, [StringComparison]::Ordinal)) {
  throw "Setup reports version '$setupProductVersion', expected '$expectedAppVersion'."
}

$setupItem = Get-Item -LiteralPath $setupPath
$setupSignature = Get-AuthenticodeSignature -LiteralPath $setupPath
[pscustomobject]@{
  passed = $true
  setupPath = $setupItem.FullName
  setupLength = [long]$setupItem.Length
  setupSha256 = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  authenticode = [string]$setupSignature.Status
  firstInstallExit = $process.ExitCode
  systemDriveFreeBytes = $systemDriveFreeBytes
  installRoot = $installPath
  manifestFileCount = @($manifest.files).Count
  appVersion = $expectedAppVersion
  setupProductVersion = $setupProductVersion
  installedClientVersion = $installedClientVersion
  winFormsSourceDir = $winFormsReferenceRoot
  cacheToken = $ExpectedCacheToken
  communityUrl = $communityUrl
  tlsPin = $tlsPin
  criticalHashes = $criticalHashes
} | ConvertTo-Json -Depth 5
