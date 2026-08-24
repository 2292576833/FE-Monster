param(
  [Parameter(Mandatory = $true)]
  [string]$SetupExe,
  [Parameter(Mandatory = $true)]
  [string]$TestRoot,
  [string]$ExpectedCommunityUrl = 'https://frp-boy.com:53981/community',
  [string]$ExpectedTlsPin = 'sha256:9AA22F07CC585686AC23DC763D060E1B189CBFA5732E3DC182AEE35F85B4B758'
)

$ErrorActionPreference = 'Stop'
$setupPath = (Resolve-Path -LiteralPath $SetupExe).Path
$testPath = [IO.Path]::GetFullPath($TestRoot)
$installPath = Join-Path $testPath 'app'
$tempPath = Join-Path $testPath 'temp'
if (!(Test-Path -LiteralPath $installPath -PathType Container)) {
  throw "Existing isolated install was not found: $installPath"
}
New-Item -ItemType Directory -Path $tempPath -Force | Out-Null

$sentinel = Join-Path $installPath 'data\final5-upgrade-user-sentinel.txt'
$obsolete = Join-Path $installPath 'legacy-final5-program-residue.dll'
[IO.File]::WriteAllText($sentinel, 'preserve-final5-user-data', [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($obsolete, 'remove-on-upgrade', [Text.UTF8Encoding]::new($false))
$preservedState = [ordered]@{
  'data\community-device-credentials.json' = '{"deviceId":"upgrade-fixture","privateKey":"preserve-device-key"}'
  'data\client-preferences.json' = '{"schemaVersion":1,"theme":"preserve-user-theme","note":"保留用户设置"}'
  'data\netease-auth.json' = '{"provider":"netease","token":"preserve-netease"}'
  'data\qq-auth.json' = '{"provider":"qq","token":"preserve-qq"}'
  'data\kugou-auth.json' = '{"provider":"kugou","token":"preserve-kugou"}'
  'data\qishui-auth.json' = '{"provider":"qishui","token":"preserve-qishui"}'
  'data\machine-id.txt' = 'preserve-machine-id'
  'data\client-install-id.txt' = 'preserve-client-install-id'
  'data\official-browser-login\qq\profile.json' = '{"cookie":"preserve-browser-login"}'
  'data\community-account-profiles\qq-user.json' = '{"feId":"12345678","nickname":"preserve-profile"}'
  'data\together-listening\history.json' = '{"sessions":["preserve-history"]}'
  'data\pet-personalization\memory.json' = '{"memory":"preserve-pet-history"}'
  'data\client-ai\state.json' = '{"provider":"custom","apiKey":"preserve-local-model-config"}'
  'data\wallpapers\user-import.bin' = 'preserve-user-wallpaper-bytes'
  'WebView2\Default\Local Storage\leveldb\000003.log' = 'preserve-legacy-webview-local-storage'
  'WebView2\DesktopHostV2\Default\Local Storage\leveldb\000003.log' = 'preserve-current-webview-local-storage'
  'logs\user-diagnostic.log' = 'preserve-user-diagnostic-log'
  'public-access.key' = 'preserve-public-access-key'
}
$preservedHashes = @{}
foreach ($relativePath in $preservedState.Keys) {
  $path = Join-Path $installPath $relativePath
  $parent = Split-Path -Parent $path
  if (!(Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  [IO.File]::WriteAllText($path, [string]$preservedState[$relativePath], [Text.UTF8Encoding]::new($false))
  $preservedHashes[$relativePath] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}
[IO.File]::WriteAllText(
  (Join-Path $installPath 'data\community-server-url.txt'),
  'http://127.0.0.1:3020',
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $installPath 'data\community-server-tls-pin.txt'),
  ('sha256:' + ('A' * 64)),
  [Text.UTF8Encoding]::new($false)
)

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
if (!$process.Start()) { throw 'Upgrade setup did not start.' }
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
if (!$process.WaitForExit(600000)) {
  try { $process.Kill() } catch {}
  throw 'Upgrade setup timed out.'
}
[IO.File]::WriteAllText(
  (Join-Path $testPath 'upgrade-stdout.log'),
  $stdout.Result,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'upgrade-stderr.log'),
  $stderr.Result,
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $testPath 'upgrade-exit.txt'),
  [string]$process.ExitCode,
  [Text.UTF8Encoding]::new($false)
)
if ($process.ExitCode -ne 0) {
  throw "Upgrade setup returned $($process.ExitCode): $($stderr.Result)"
}
if ((Get-Content -Raw -LiteralPath $sentinel) -cne 'preserve-final5-user-data') {
  throw 'Upgrade did not preserve ordinary user data.'
}
if (Test-Path -LiteralPath $obsolete) {
  throw 'Upgrade retained obsolete program residue.'
}
foreach ($relativePath in $preservedState.Keys) {
  $path = Join-Path $installPath $relativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Upgrade removed preserved user state: $relativePath"
  }
  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actualHash -cne $preservedHashes[$relativePath]) {
    throw "Upgrade changed preserved user state: $relativePath"
  }
}
$url = (Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-url.txt')).Trim()
$pin = (Get-Content -Raw -LiteralPath (Join-Path $installPath 'data\community-server-tls-pin.txt')).Trim()
if ($url -cne $ExpectedCommunityUrl) {
  throw "Upgrade did not restore the release community URL: $url"
}
if ($pin -cne $ExpectedTlsPin) {
  throw "Upgrade did not restore the release TLS pin: $pin"
}

[pscustomobject]@{
  passed = $true
  upgradeExit = $process.ExitCode
  userDataPreserved = $true
  preservedStateFiles = $preservedState.Count
  obsoleteProgramRemoved = $true
  releaseCommunityUrl = $url
  releaseTlsPin = $pin
  systemDriveFreeBytes = (Get-PSDrive C).Free
  installRoot = $installPath
} | ConvertTo-Json -Depth 3
