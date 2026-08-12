param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$installer = Join-Path $rootPath 'scripts\install-fe-monster.ps1'
$setupProgram = Join-Path $rootPath 'native\windows\setup\Program.cs'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'fe-monster-fast-stage-' + [guid]::NewGuid().ToString('N')
)
$crossVolumeTestRoot = ''

function New-TestPayload {
  param([string]$Path)

  New-Item -ItemType Directory -Path $Path -Force | Out-Null
  $markerPath = Join-Path $Path 'marker.txt'
  [System.IO.File]::WriteAllText($markerPath, 'fast-stage-payload', [System.Text.Encoding]::ASCII)
  $marker = Get-Item -LiteralPath $markerPath
  $manifest = [ordered]@{
    schemaVersion = 1
    architecture = 'x64'
    minimumWindowsBuild = 0
    requiredInstallBytes = [long]$marker.Length
    files = @(
      [ordered]@{
        path = 'marker.txt'
        length = [long]$marker.Length
        sha256 = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    )
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Path 'payload-integrity.json') -Encoding UTF8
}

function Invoke-TestInstall {
  param(
    [string]$PayloadRoot,
    [string]$InstallDir,
    [string]$LogPath,
    [switch]$ConsumePayloadRoot
  )

  $outputPath = $LogPath + '.process.log'
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $installer,
    '-InstallDir', $InstallDir,
    '-PayloadRoot', $PayloadRoot,
    '-LogPath', $LogPath,
    '-NoLaunch',
    '-NoShortcuts',
    '-SkipSystemNodeInstall',
    '-NoRegistration',
    '-NoPopup'
  )
  if ($ConsumePayloadRoot) { $arguments += '-ConsumePayloadRoot' }
  & powershell.exe @arguments *> $outputPath
  return $LASTEXITCODE
}

try {
  $setupSource = Get-Content -LiteralPath $setupProgram -Raw
  if ($setupSource -notmatch 'ArgumentList\.Add\("-ConsumePayloadRoot"\)') {
    throw '.NET Setup does not explicitly mark its extracted PayloadRoot as installer-owned.'
  }

  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $invalidPayloadRoot = Join-Path $testRoot 'invalid-owned-payload'
  $invalidInstallDir = Join-Path $testRoot 'invalid-owned-install'
  $invalidLogPath = Join-Path $testRoot 'invalid-owned-install.log'
  New-TestPayload $invalidPayloadRoot
  [System.IO.File]::WriteAllText(
    (Join-Path $invalidPayloadRoot 'marker.txt'),
    'corrupted-after-manifest',
    [System.Text.Encoding]::ASCII
  )

  $invalidExitCode = Invoke-TestInstall $invalidPayloadRoot $invalidInstallDir $invalidLogPath -ConsumePayloadRoot
  if ($invalidExitCode -ne 1) {
    throw "Invalid-payload fixture should fail integrity validation, but installer returned $invalidExitCode."
  }
  if (!(Test-Path -LiteralPath $invalidPayloadRoot -PathType Container)) {
    throw 'Setup-owned PayloadRoot was consumed before its integrity check completed.'
  }
  if (Test-Path -LiteralPath $invalidInstallDir) {
    throw 'Invalid Setup-owned payload reached the installation target.'
  }

  $payloadRoot = Join-Path $testRoot 'owned-payload'
  $installDir = Join-Path $testRoot 'owned-install'
  $logPath = Join-Path $testRoot 'owned-install.log'
  New-TestPayload $payloadRoot

  $exitCode = Invoke-TestInstall $payloadRoot $installDir $logPath -ConsumePayloadRoot
  if ($exitCode -ne 1) {
    throw "Test fixture should stop after payload activation, but installer returned $exitCode."
  }
  if (Test-Path -LiteralPath $payloadRoot) {
    throw 'Setup-owned same-volume PayloadRoot was copied instead of consumed.'
  }
  if (!(Test-Path -LiteralPath (Join-Path $installDir 'marker.txt') -PathType Leaf)) {
    throw 'Setup-owned payload was not activated at the installation target.'
  }

  $manualPayloadRoot = Join-Path $testRoot 'manual-payload'
  $manualInstallDir = Join-Path $testRoot 'manual-install'
  $manualLogPath = Join-Path $testRoot 'manual-install.log'
  New-TestPayload $manualPayloadRoot

  $manualExitCode = Invoke-TestInstall $manualPayloadRoot $manualInstallDir $manualLogPath
  if ($manualExitCode -ne 1) {
    throw "Manual-payload fixture should stop after activation, but installer returned $manualExitCode."
  }
  if (!(Test-Path -LiteralPath $manualPayloadRoot -PathType Container)) {
    throw 'A manually supplied PayloadRoot was consumed without the ownership flag.'
  }
  if (!(Test-Path -LiteralPath (Join-Path $manualInstallDir 'marker.txt') -PathType Leaf)) {
    throw 'Manually supplied payload was not copied to the installation target.'
  }

  $lockedLogPayloadRoot = Join-Path $testRoot 'locked-log-payload'
  $lockedLogInstallDir = Join-Path $testRoot 'locked-log-install'
  $lockedLogPath = Join-Path $testRoot 'locked-log-install.log'
  $lockedLogReadyPath = Join-Path $testRoot 'locked-log.ready'
  New-TestPayload $lockedLogPayloadRoot
  [System.IO.File]::WriteAllText($lockedLogPath, 'existing log reader fixture', [System.Text.Encoding]::UTF8)
  $lockedLogJob = Start-Job -ScriptBlock {
    param($Path, $ReadyPath)
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::None
    )
    try {
      [System.IO.File]::WriteAllText($ReadyPath, 'ready', [System.Text.Encoding]::ASCII)
      Start-Sleep -Milliseconds 900
    } finally {
      $stream.Dispose()
    }
  } -ArgumentList $lockedLogPath, $lockedLogReadyPath
  try {
    $lockedLogDeadline = (Get-Date).AddSeconds(5)
    while (!(Test-Path -LiteralPath $lockedLogReadyPath) -and (Get-Date) -lt $lockedLogDeadline) {
      Start-Sleep -Milliseconds 25
    }
    if (!(Test-Path -LiteralPath $lockedLogReadyPath)) {
      throw 'Transient log-lock fixture did not acquire the installer log.'
    }
    $lockedLogExitCode = Invoke-TestInstall $lockedLogPayloadRoot $lockedLogInstallDir $lockedLogPath
  } finally {
    Wait-Job -Job $lockedLogJob -Timeout 5 | Out-Null
    Receive-Job -Job $lockedLogJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $lockedLogJob -Force -ErrorAction SilentlyContinue
  }
  if ($lockedLogExitCode -ne 1) {
    throw "Locked-log fixture should stop after payload activation, but installer returned $lockedLogExitCode."
  }
  if (!(Test-Path -LiteralPath (Join-Path $lockedLogInstallDir 'marker.txt') -PathType Leaf)) {
    throw 'A transient installer-log reader aborted the installation transaction.'
  }

  $unwritableStateRoot = Join-Path $testRoot 'unwritable-local-app-data'
  $fallbackLockPayloadRoot = Join-Path $testRoot 'fallback-lock-payload'
  $fallbackLockInstallDir = Join-Path $testRoot 'fallback-lock-install'
  $fallbackLockLogPath = Join-Path $testRoot 'fallback-lock-install.log'
  [System.IO.File]::WriteAllText($unwritableStateRoot, 'not a directory', [System.Text.Encoding]::ASCII)
  New-TestPayload $fallbackLockPayloadRoot
  $savedLocalAppData = $Env:LOCALAPPDATA
  try {
    $Env:LOCALAPPDATA = $unwritableStateRoot
    $fallbackLockExitCode = Invoke-TestInstall `
      $fallbackLockPayloadRoot `
      $fallbackLockInstallDir `
      $fallbackLockLogPath
  } finally {
    $Env:LOCALAPPDATA = $savedLocalAppData
  }
  if ($fallbackLockExitCode -ne 1) {
    throw "Fallback-lock fixture should stop after activation, but installer returned $fallbackLockExitCode."
  }
  if (!(Test-Path -LiteralPath (Join-Path $fallbackLockInstallDir 'marker.txt') -PathType Leaf)) {
    throw 'An unavailable LOCALAPPDATA setup-lock directory aborted the installation transaction.'
  }
  if (Test-Path -LiteralPath (Join-Path $testRoot '.fe-monster-setup-locks')) {
    throw 'Fallback setup lock directory was not cleaned up.'
  }

  $upgradeInstallDir = Join-Path $testRoot 'upgrade-install'
  $upgradePayloadRoot = Join-Path $testRoot 'upgrade-owned-payload'
  $upgradeMain = Join-Path $upgradeInstallDir 'native\windows\build\winforms\FE Monster.exe'
  $upgradeUserState = Join-Path $upgradeInstallDir 'data\user-state.txt'
  New-Item -ItemType Directory -Path (Split-Path -Parent $upgradeMain) -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path -Parent $upgradeUserState) -Force | Out-Null
  [System.IO.File]::WriteAllText($upgradeMain, '', [System.Text.Encoding]::ASCII)
  [System.IO.File]::WriteAllText(
    (Join-Path $upgradeInstallDir 'payload-integrity.json'),
    '{}',
    [System.Text.Encoding]::ASCII
  )
  [System.IO.File]::WriteAllText($upgradeUserState, 'old-user-state', [System.Text.Encoding]::ASCII)
  New-TestPayload $upgradePayloadRoot
  New-Item -ItemType Directory -Path (Join-Path $upgradePayloadRoot 'data') -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $upgradePayloadRoot 'data\user-state.txt'),
    'new-payload-default',
    [System.Text.Encoding]::ASCII
  )
  $upgradeLogPath = Join-Path $testRoot 'upgrade-install.log'

  $upgradeExitCode = Invoke-TestInstall $upgradePayloadRoot $upgradeInstallDir $upgradeLogPath -ConsumePayloadRoot
  if ($upgradeExitCode -ne 1) {
    throw "Upgrade fixture should fail after activation to exercise rollback, but installer returned $upgradeExitCode."
  }
  if (Test-Path -LiteralPath $upgradePayloadRoot) {
    throw 'Same-volume Setup-owned upgrade payload was not consumed.'
  }
  if ((Get-Content -LiteralPath $upgradeUserState -Raw) -ne 'old-user-state') {
    throw 'Upgrade rollback did not restore the previous user data.'
  }
  if (Test-Path -LiteralPath (Join-Path $upgradeInstallDir 'marker.txt')) {
    throw 'Upgrade rollback left the activated new payload in place.'
  }
  $upgradeLog = Get-Content -LiteralPath $upgradeLogPath -Raw
  if ($upgradeLog -notmatch 'Promoted verified Setup-owned payload' -or
      $upgradeLog -notmatch 'Preserving existing data user data' -or
      $upgradeLog -notmatch 'Installed computer ID is ready') {
    throw 'Fast-stage upgrade did not preserve user data or reach post-integrity activation before rollback.'
  }

  $payloadVolume = [System.IO.Path]::GetPathRoot($testRoot)
  $workspaceVolume = [System.IO.Path]::GetPathRoot($rootPath)
  if (![string]::Equals($payloadVolume, $workspaceVolume, [StringComparison]::OrdinalIgnoreCase)) {
    $crossVolumeTestRoot = Join-Path $rootPath ('.tmp\installer-fast-stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $crossVolumeTestRoot -Force | Out-Null
    $crossPayloadRoot = Join-Path $testRoot 'cross-volume-payload'
    $crossInstallDir = Join-Path $crossVolumeTestRoot 'install'
    $crossLogPath = Join-Path $testRoot 'cross-volume-install.log'
    New-TestPayload $crossPayloadRoot

    $crossExitCode = Invoke-TestInstall $crossPayloadRoot $crossInstallDir $crossLogPath -ConsumePayloadRoot
    if ($crossExitCode -ne 1) {
      throw "Cross-volume fixture should stop after activation, but installer returned $crossExitCode."
    }
    if (!(Test-Path -LiteralPath $crossPayloadRoot -PathType Container)) {
      throw 'Cross-volume owned PayloadRoot was consumed instead of using the copy fallback.'
    }
    if (!(Test-Path -LiteralPath (Join-Path $crossInstallDir 'marker.txt') -PathType Leaf)) {
      throw 'Cross-volume payload was not copied to the installation target.'
    }
  }

  $overlapInstallDir = Join-Path $testRoot 'overlap-install'
  $overlapPayloadRoot = Join-Path $overlapInstallDir 'setup-owned-payload'
  $overlapMain = Join-Path $overlapInstallDir 'native\windows\build\winforms\FE Monster.exe'
  New-Item -ItemType Directory -Path (Split-Path -Parent $overlapMain) -Force | Out-Null
  [System.IO.File]::WriteAllText($overlapMain, '', [System.Text.Encoding]::ASCII)
  [System.IO.File]::WriteAllText(
    (Join-Path $overlapInstallDir 'payload-integrity.json'),
    '{}',
    [System.Text.Encoding]::ASCII
  )
  New-TestPayload $overlapPayloadRoot
  $overlapLogPath = Join-Path $testRoot 'overlap-install.log'

  $overlapExitCode = Invoke-TestInstall $overlapPayloadRoot $overlapInstallDir $overlapLogPath -ConsumePayloadRoot
  if ($overlapExitCode -ne 1) {
    throw "Overlapping-path fixture should stop after activation, but installer returned $overlapExitCode."
  }
  if (!(Test-Path -LiteralPath $overlapPayloadRoot -PathType Container)) {
    throw 'An overlapping owned PayloadRoot was consumed despite failing the safe-boundary check.'
  }
  if ((Get-Content -LiteralPath $overlapLogPath -Raw) -notmatch 'Activated staged files') {
    throw 'Overlapping-path fixture did not exercise the staged upgrade and rollback path.'
  }
  if (@(Get-ChildItem -LiteralPath $testRoot -Directory -Filter '.fm-*' -Force).Count -ne 0) {
    throw 'Fast-stage fixtures left transaction stage or upgrade-backup directories behind.'
  }

  Write-Host 'Windows installer fast-stage contract: OK'
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (![string]::IsNullOrWhiteSpace($crossVolumeTestRoot) -and
      (Test-Path -LiteralPath $crossVolumeTestRoot)) {
    Remove-Item -LiteralPath $crossVolumeTestRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
