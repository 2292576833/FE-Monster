[CmdletBinding()]
param(
  [string]$Root = '',
  [Parameter(Mandatory = $true)]
  [string]$SetupExe,
  [Parameter(Mandatory = $true)]
  [string]$TestRoot,
  [string]$ExpectedCommunityUrl = 'https://frp-boy.com:53981/community',
  [string]$ExpectedTlsPin = 'sha256:9AA22F07CC585686AC23DC763D060E1B189CBFA5732E3DC182AEE35F85B4B758'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-Utf8Bytes {
  param([string]$Text)
  return [Text.UTF8Encoding]::new($false).GetBytes($Text)
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ChildPath {
  param(
    [string]$Parent,
    [string]$Child
  )

  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  $childFull = [IO.Path]::GetFullPath($Child)
  $parentPrefix = $parentFull + [IO.Path]::DirectorySeparatorChar
  if (!$childFull.StartsWith($parentPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Fixture path escaped its isolated root: $childFull"
  }
  return $childFull
}

function Write-FixtureFile {
  param(
    [string]$FixtureRoot,
    [string]$RelativePath,
    [byte[]]$Bytes
  )

  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
    throw "Unsafe fixture relative path: $RelativePath"
  }
  $path = Assert-ChildPath -Parent $FixtureRoot -Child (Join-Path $FixtureRoot $RelativePath)
  $parent = Split-Path -Parent $path
  if (!(Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  [IO.File]::WriteAllBytes($path, $Bytes)
  return $path
}

$scriptRoot = if (![string]::IsNullOrWhiteSpace($PSScriptRoot)) {
  $PSScriptRoot
} else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Join-Path $scriptRoot '..'
}
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$packagePath = Join-Path $rootPath 'package.json'
if (!(Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw "Repository package.json was not found: $packagePath"
}
$expectedAppVersion = [string](Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($expectedAppVersion)) {
  throw 'Repository package.json does not contain an application version.'
}

$setupPath = (Resolve-Path -LiteralPath $SetupExe).Path
if (!(Test-Path -LiteralPath $setupPath -PathType Leaf)) {
  throw "Setup executable was not found: $setupPath"
}
$testPath = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\', '/')
$testDriveRoot = [IO.Path]::GetPathRoot($testPath)
if (![string]::Equals($testDriveRoot, 'E:\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "The legacy-upgrade fixture must use an explicit E: test root: $testPath"
}
if ([string]::Equals($testPath, $testDriveRoot.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
  throw "The E: drive root itself cannot be used as the test root: $testPath"
}
if (Test-Path -LiteralPath $testPath) {
  throw "The isolated legacy-upgrade test root must not already exist: $testPath"
}
$testAncestor = Split-Path -Parent $testPath
while (![string]::IsNullOrWhiteSpace($testAncestor) -and
       ![string]::Equals(
         $testAncestor.TrimEnd('\', '/'),
         $testDriveRoot.TrimEnd('\', '/'),
         [StringComparison]::OrdinalIgnoreCase
       )) {
  if (Test-Path -LiteralPath $testAncestor) {
    $ancestorInfo = Get-Item -LiteralPath $testAncestor -Force
    if (($ancestorInfo.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "The isolated test root cannot be created below a reparse point: $testAncestor"
    }
  }
  $nextAncestor = Split-Path -Parent $testAncestor
  if ([string]::Equals($nextAncestor, $testAncestor, [StringComparison]::OrdinalIgnoreCase)) { break }
  $testAncestor = $nextAncestor
}

$installPath = Assert-ChildPath -Parent $testPath -Child (Join-Path $testPath 'app')
$tempPath = Assert-ChildPath -Parent $testPath -Child (Join-Path $testPath 'temp')
$localAppDataPath = Assert-ChildPath -Parent $testPath -Child (Join-Path $testPath 'local-app-data')
$roamingAppDataPath = Assert-ChildPath -Parent $testPath -Child (Join-Path $testPath 'roaming-app-data')
$userProfilePath = Assert-ChildPath -Parent $testPath -Child (Join-Path $testPath 'user-profile')
foreach ($directory in @(
  $testPath,
  $installPath,
  $tempPath,
  $localAppDataPath,
  $roamingAppDataPath,
  $userProfilePath
)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

# This is the installation shape used by FE Monster 1.1.6 and earlier: the
# Java backend plus a VBS/CMD launcher, without the modern integrity manifest
# or WinForms host. The files are deliberately tiny fixtures, not executable
# user software.
$legacyProgramState = [ordered]@{
  'out\fe-monster-java.jar' = [Convert]::FromBase64String('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==')
  'FE Monster.vbs' = Get-Utf8Bytes @'
Set shell = CreateObject("WScript.Shell")
shell.Run "run.cmd", 0, False
'@
  'run.cmd' = Get-Utf8Bytes @'
@echo off
runtime\java\bin\javaw.exe -jar out\fe-monster-java.jar
'@
  'package.json' = Get-Utf8Bytes '{"name":"fe-monster","version":"1.1.6"}'
  'web\index.html' = Get-Utf8Bytes '<!doctype html><title>FE Monster 1.1.6 legacy fixture</title>'
  'web\legacy-only.js' = Get-Utf8Bytes 'window.FE_MONSTER_LEGACY_BUILD = "1.1.6";'
  'scripts\legacy-updater.ps1' = Get-Utf8Bytes "'legacy updater fixture'"
  'runtime\legacy-embedded-java.txt' = Get-Utf8Bytes 'legacy runtime residue'
  'out\legacy-only-state.bin' = [byte[]](0x46, 0x45, 0x01, 0x01, 0x06, 0xff)
  'legacy-1.1.6-program-residue.dll' = [byte[]](0x4d, 0x5a, 0x01, 0x01, 0x06, 0x00, 0xff)
}
$legacyProgramHashes = [ordered]@{}
foreach ($relativePath in $legacyProgramState.Keys) {
  $path = Write-FixtureFile `
    -FixtureRoot $installPath `
    -RelativePath $relativePath `
    -Bytes ([byte[]]$legacyProgramState[$relativePath])
  $legacyProgramHashes[$relativePath] = Get-Sha256 $path
}

if (!(Test-Path -LiteralPath (Join-Path $installPath 'out\fe-monster-java.jar') -PathType Leaf) -or
    (!(Test-Path -LiteralPath (Join-Path $installPath 'FE Monster.vbs') -PathType Leaf) -and
     !(Test-Path -LiteralPath (Join-Path $installPath 'run.cmd') -PathType Leaf))) {
  throw 'The legacy <=1.1.6 fixture does not have a recognized JAR plus launcher shape.'
}
if (Test-Path -LiteralPath (Join-Path $installPath 'payload-integrity.json')) {
  throw 'The legacy fixture unexpectedly contains a modern payload manifest.'
}
if (Test-Path -LiteralPath (Join-Path $installPath 'native\windows\build\winforms\FE Monster.exe')) {
  throw 'The legacy fixture unexpectedly contains the modern WinForms host.'
}

# Every seeded user-owned file is hashed before setup. The payload must retain
# the exact bytes. Only the release-controlled community URL and TLS pin are
# excluded because an upgrade must replace stale developer/server endpoints.
$preservedState = [ordered]@{
  'data\community-device-credentials.json' = Get-Utf8Bytes '{"schemaVersion":2,"deviceId":"legacy-device-001","privateKey":"dummy-private-key","registered":true}'
  'data\community-account-profiles.json' = Get-Utf8Bytes '{"schemaVersion":1,"profiles":{"qq:10001":{"feId":"12345678","nickname":"旧版用户"}}}'
  'data\community-account-profiles\qq-user.json' = Get-Utf8Bytes '{"feId":"12345678","nickname":"旧版目录型资料"}'
  'data\community-together-listening-report.json' = Get-Utf8Bytes '{"sessions":9,"totalSeconds":3600,"longestFriend":"87654321"}'
  'data\together-listening\history.json' = Get-Utf8Bytes '{"sessions":[{"id":"legacy-history-1","track":"dummy-song"}]}'
  'data\client-preferences.json' = Get-Utf8Bytes '{"schemaVersion":1,"revision":116,"theme":"legacy-user-theme","scene":"user-scene","volume":0.42}'
  'data\machine-id.txt' = Get-Utf8Bytes 'legacy-machine-id-001'
  'data\client-install-id.txt' = Get-Utf8Bytes 'legacy-install-id-001'
  'data\netease-auth.json' = Get-Utf8Bytes '{"provider":"netease","token":"dummy-netease-token","uid":"10001"}'
  'data\qq-auth.json' = Get-Utf8Bytes '{"provider":"qq","token":"dummy-qq-token","uin":"10001"}'
  'data\kugou-auth.json' = Get-Utf8Bytes '{"provider":"kugou","token":"dummy-kugou-token","userid":"10001"}'
  'data\qishui-auth.json' = Get-Utf8Bytes '{"provider":"qishui","token":"dummy-qishui-token","openId":"10001"}'
  'data\official-browser-login\netease\profile.json' = Get-Utf8Bytes '{"provider":"netease","cookie":"dummy-browser-cookie"}'
  'data\official-browser-login\qq\profile.json' = Get-Utf8Bytes '{"provider":"qq","cookie":"dummy-browser-cookie"}'
  'data\official-browser-login\kugou\profile.json' = Get-Utf8Bytes '{"provider":"kugou","cookie":"dummy-browser-cookie"}'
  'data\official-browser-login\qq\Default\Network\Cookies' = [byte[]](0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00, 0xff, 0x10)
  'data\pet-personalization\memory.json' = Get-Utf8Bytes '{"account":"qq:10001","memory":["dummy companion history"]}'
  'data\client-ai\state.json' = Get-Utf8Bytes '{"provider":"custom-openai-compatible","apiKey":"dummy-local-model-key","model":"dummy-model"}'
  'data\achievement-state.json' = Get-Utf8Bytes '{"unlocked":["legacy-achievement"],"points":116}'
  'data\runtime-settings.json' = Get-Utf8Bytes '{"language":"zh-CN","startMinimized":false}'
  'data\audio-mixer-state.json' = Get-Utf8Bytes '{"enabled":true,"preset":"legacy-user-preset","masterGain":0.8}'
  'data\audio-channel-router-state.json' = Get-Utf8Bytes '{"layout":"7.1","channels":{"L":1,"R":1}}'
  'data\player-state.json' = Get-Utf8Bytes '{"provider":"qq","songId":"dummy-song","positionMs":65432}'
  'data\music-api\providers.json' = Get-Utf8Bytes '{"providers":[{"id":"qq","enabled":true,"baseUrl":"http://127.0.0.1:3011"}]}'
  'data\wallpapers\user-import.bin' = [byte[]](0x00, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  'data\user-cursors\legacy-user-cursor.cur' = [byte[]](0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0xfe, 0xff)
  'data\update-progress\history.json' = Get-Utf8Bytes '{"lastSeenVersion":"1.1.6","dismissed":[]}'
  'data\community-server-url.txt.user-backup' = Get-Utf8Bytes 'https://user-owned-backup.invalid/community'
  'WebView2\Default\Local Storage\leveldb\000003.log' = [byte[]](0x4c, 0x45, 0x47, 0x41, 0x43, 0x59, 0x00, 0xff, 0x7f, 0x01)
  'WebView2\Default\Local Storage\leveldb\CURRENT' = Get-Utf8Bytes 'MANIFEST-000001'
  'WebView2\Local State' = Get-Utf8Bytes '{"legacyRootProfile":true,"profile":{"last_used":"Default"}}'
  'logs\legacy-user-diagnostic.log' = Get-Utf8Bytes "legacy log line 1`r`nlegacy log line 2`r`n"
  'logs\community-history.ndjson' = Get-Utf8Bytes "{\"event\":\"legacy-community-login\"}`n"
  'public-access.key' = Get-Utf8Bytes 'dummy-public-access-key-from-legacy-install'
}
$preservedHashes = [ordered]@{}
$preservedLengths = [ordered]@{}
foreach ($relativePath in $preservedState.Keys) {
  $path = Write-FixtureFile `
    -FixtureRoot $installPath `
    -RelativePath $relativePath `
    -Bytes ([byte[]]$preservedState[$relativePath])
  $preservedHashes[$relativePath] = Get-Sha256 $path
  $preservedLengths[$relativePath] = [long](Get-Item -LiteralPath $path).Length
}

$staleCommunityUrl = 'http://127.0.0.1:3020'
$staleTlsPin = 'sha256:' + ('A' * 64)
Write-FixtureFile `
  -FixtureRoot $installPath `
  -RelativePath 'data\community-server-url.txt' `
  -Bytes (Get-Utf8Bytes $staleCommunityUrl) | Out-Null
Write-FixtureFile `
  -FixtureRoot $installPath `
  -RelativePath 'data\community-server-tls-pin.txt' `
  -Bytes (Get-Utf8Bytes $staleTlsPin) | Out-Null

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
$startInfo.EnvironmentVariables['TEMP'] = $tempPath
$startInfo.EnvironmentVariables['TMP'] = $tempPath
$startInfo.EnvironmentVariables['LOCALAPPDATA'] = $localAppDataPath
$startInfo.EnvironmentVariables['APPDATA'] = $roamingAppDataPath
$startInfo.EnvironmentVariables['USERPROFILE'] = $userProfilePath

$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$stdoutText = ''
$stderrText = ''
$processStarted = $false
try {
  if (!$process.Start()) { throw 'Legacy-upgrade setup did not start.' }
  $processStarted = $true
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (!$process.WaitForExit(600000)) {
    try { $process.Kill() } catch {}
    throw 'Legacy-upgrade setup timed out after 10 minutes.'
  }
  $stdoutText = $stdoutTask.Result
  $stderrText = $stderrTask.Result
  $upgradeExit = $process.ExitCode
} finally {
  if ($processStarted -and !$process.HasExited) {
    try { $process.Kill() } catch {}
  }
  $process.Dispose()
}

[IO.File]::WriteAllText(
  (Join-Path $testPath 'legacy-upgrade-stdout.log'),
  $stdoutText,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'legacy-upgrade-stderr.log'),
  $stderrText,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'legacy-upgrade-exit.txt'),
  [string]$upgradeExit,
  [Text.UTF8Encoding]::new($false)
)
if ($upgradeExit -ne 0) {
  throw "Legacy-upgrade setup returned $upgradeExit. See $testPath\legacy-upgrade-stderr.log"
}

foreach ($relativePath in $preservedState.Keys) {
  $path = Join-Path $installPath $relativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Upgrade removed legacy user state: $relativePath"
  }
  $actualLength = [long](Get-Item -LiteralPath $path).Length
  if ($actualLength -ne [long]$preservedLengths[$relativePath]) {
    throw "Upgrade changed the length of legacy user state: $relativePath"
  }
  $actualHash = Get-Sha256 $path
  if ($actualHash -cne [string]$preservedHashes[$relativePath]) {
    throw "Upgrade changed the bytes of legacy user state: $relativePath"
  }
}

$communityUrl = (
  Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-url.txt')
).Trim()
$tlsPin = (
  Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-tls-pin.txt')
).Trim()
if ($communityUrl -cne $ExpectedCommunityUrl) {
  throw "Legacy upgrade did not restore the release community URL: $communityUrl"
}
if ($communityUrl -match '(?i)localhost|127\.0\.0\.1|\[::1\]') {
  throw "Legacy upgrade retained a loopback community URL: $communityUrl"
}
if ($tlsPin -cne $ExpectedTlsPin) {
  throw "Legacy upgrade did not restore the release TLS pin: $tlsPin"
}

$manifestPath = Join-Path $installPath 'payload-integrity.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'Legacy upgrade did not install the modern payload integrity manifest.'
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1) {
  throw "Installed payload manifest has unsupported schemaVersion '$($manifest.schemaVersion)'."
}
if ([string]$manifest.appVersion -cne $expectedAppVersion) {
  throw "Installed payload reports version '$($manifest.appVersion)', expected '$expectedAppVersion'."
}
if ([string]$manifest.architecture -cne 'x64') {
  throw "Installed payload reports architecture '$($manifest.architecture)', expected 'x64'."
}
$manifestEntries = @($manifest.files)
if ($manifestEntries.Count -eq 0) {
  throw 'Installed payload manifest contains no files.'
}

$manifestFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$installPrefix = $installPath.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
foreach ($entry in $manifestEntries) {
  $relativePath = ([string]$entry.path).Replace('/', '\')
  if ([string]::IsNullOrWhiteSpace($relativePath) -or [IO.Path]::IsPathRooted($relativePath)) {
    throw "Installed payload manifest contains an unsafe path: $relativePath"
  }
  if (!$manifestFiles.Add($relativePath)) {
    throw "Installed payload manifest contains a duplicate path: $relativePath"
  }
  $installedFile = [IO.Path]::GetFullPath((Join-Path $installPath $relativePath))
  if (!$installedFile.StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Installed payload manifest path escapes the install root: $relativePath"
  }
  if (!(Test-Path -LiteralPath $installedFile -PathType Leaf)) {
    throw "Installed manifest file is missing after legacy upgrade: $relativePath"
  }
  $actualLength = [long](Get-Item -LiteralPath $installedFile).Length
  if ($actualLength -ne [long]$entry.length) {
    throw "Installed manifest length mismatch after legacy upgrade: $relativePath"
  }
  $expectedHash = ([string]$entry.sha256).ToLowerInvariant()
  if ($expectedHash -notmatch '^[a-f0-9]{64}$') {
    throw "Installed payload manifest has an invalid SHA-256 for: $relativePath"
  }
  if ((Get-Sha256 $installedFile) -cne $expectedHash) {
    throw "Installed manifest hash mismatch after legacy upgrade: $relativePath"
  }
}

$requiredModernFiles = @(
  'FE Monster.vbs',
  'out\fe-monster-java.jar',
  'web\index.html',
  'web\app.js',
  'web\creative-community.js',
  'web\client-ai-service.js',
  'web\pet-assistant.js',
  'web\audio-mixer-ui.js',
  'runtime\java\bin\java.exe',
  'runtime\java\bin\javaw.exe',
  'runtime\java\bin\FE Monster Backend.exe',
  'runtime\node\node.exe',
  'native\windows\build\winforms\FE Monster.exe',
  'native\windows\build\winforms\FE Monster.dll',
  'native\windows\build\winforms\WebView2Loader.dll',
  'native\windows\build\fe-monster-xaudio2.dll',
  'native\windows\build\fe_monster_upmix.dll',
  'scripts\install-fe-monster.ps1',
  'scripts\ensure-runtime-dependencies.ps1',
  'scripts\java-runtime.ps1',
  'data\community-server-url.txt',
  'data\community-server-tls-pin.txt'
)
foreach ($relativePath in $requiredModernFiles) {
  if (!$manifestFiles.Contains($relativePath)) {
    throw "Modern payload manifest omitted a release-required file: $relativePath"
  }
  if (!(Test-Path -LiteralPath (Join-Path $installPath $relativePath) -PathType Leaf)) {
    throw "Modern payload omitted a release-required file: $relativePath"
  }
}

$releaseCriticalFiles = @(
  'web\index.html',
  'web\app.js',
  'web\creative-community.js',
  'web\client-ai-service.js',
  'web\pet-assistant.js',
  'web\audio-mixer-ui.js',
  'native\windows\build\winforms\FE Monster.exe',
  'native\windows\build\fe-monster-xaudio2.dll',
  'native\windows\build\fe_monster_upmix.dll',
  'out\fe-monster-java.jar',
  'scripts\install-fe-monster.ps1',
  'scripts\ensure-runtime-dependencies.ps1',
  'scripts\java-runtime.ps1'
)
$releaseCriticalHashes = [ordered]@{}
foreach ($relativePath in $releaseCriticalFiles) {
  $sourceFile = Join-Path $rootPath $relativePath
  $installedFile = Join-Path $installPath $relativePath
  if (!(Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
    throw "Repository release-critical file is missing: $relativePath"
  }
  $sourceHash = Get-Sha256 $sourceFile
  $installedHash = Get-Sha256 $installedFile
  if ($sourceHash -cne $installedHash) {
    throw "Repository-to-installed hash mismatch after legacy upgrade: $relativePath"
  }
  $releaseCriticalHashes[$relativePath] = $installedHash
}

foreach ($relativePath in $legacyProgramHashes.Keys) {
  $path = Join-Path $installPath $relativePath
  if ($manifestFiles.Contains($relativePath)) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Modern payload did not replace a legacy program file: $relativePath"
    }
    if ((Get-Sha256 $path) -ceq [string]$legacyProgramHashes[$relativePath]) {
      throw "Legacy program bytes survived instead of being replaced: $relativePath"
    }
  } elseif (Test-Path -LiteralPath $path) {
    throw "Obsolete legacy program residue survived the upgrade: $relativePath"
  }
}

$transactionMarker = Join-Path $installPath '.fe-monster-upgrade-transaction.json'
if (Test-Path -LiteralPath $transactionMarker) {
  throw 'Completed legacy upgrade retained its transaction marker.'
}
$unfinishedTransactionDirectories = @(
  Get-ChildItem -LiteralPath $testPath -Directory -Force -ErrorAction Stop |
    Where-Object { $_.Name -like '.fm-*' }
)
if ($unfinishedTransactionDirectories.Count -gt 0) {
  throw "Completed legacy upgrade retained transaction directories: $($unfinishedTransactionDirectories.Name -join ', ')"
}

$installedClient = Get-Item -LiteralPath (Join-Path $installPath 'native\windows\build\winforms\FE Monster.exe')
$installedClientVersion = [string]$installedClient.VersionInfo.ProductVersion
if (!$installedClientVersion.StartsWith($expectedAppVersion, [StringComparison]::Ordinal)) {
  throw "Installed client reports version '$installedClientVersion', expected '$expectedAppVersion'."
}
$setupItem = Get-Item -LiteralPath $setupPath
$setupProductVersion = [string]$setupItem.VersionInfo.ProductVersion
if (!$setupProductVersion.StartsWith($expectedAppVersion, [StringComparison]::Ordinal)) {
  throw "Setup reports version '$setupProductVersion', expected '$expectedAppVersion'."
}
$setupSignature = Get-AuthenticodeSignature -LiteralPath $setupPath

[pscustomobject]@{
  passed = $true
  fixture = 'FE Monster <=1.1.6 JAR plus VBS/CMD legacy shape'
  testRoot = $testPath
  installRoot = $installPath
  upgradeExit = $upgradeExit
  launchDisabled = $true
  registrationDisabled = $true
  shortcutsDisabled = $true
  systemNodeInstallDisabled = $true
  legacyProgramFilesReplacedOrRemoved = $legacyProgramHashes.Count
  preservedStateFiles = $preservedState.Count
  preservedStateBytes = [long](($preservedLengths.Values | Measure-Object -Sum).Sum)
  legacyWebViewRootLocalStoragePreserved = $true
  releaseCommunityUrl = $communityUrl
  releaseTlsPin = $tlsPin
  appVersion = $expectedAppVersion
  setupPath = $setupItem.FullName
  setupLength = [long]$setupItem.Length
  setupSha256 = Get-Sha256 $setupPath
  setupProductVersion = $setupProductVersion
  authenticode = [string]$setupSignature.Status
  installedClientVersion = $installedClientVersion
  manifestFileCount = $manifestEntries.Count
  releaseCriticalHashes = $releaseCriticalHashes
} | ConvertTo-Json -Depth 5
