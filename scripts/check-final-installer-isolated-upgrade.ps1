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
  obsoleteProgramRemoved = $true
  releaseCommunityUrl = $url
  releaseTlsPin = $pin
  systemDriveFreeBytes = (Get-PSDrive C).Free
  installRoot = $installPath
} | ConvertTo-Json -Depth 3
