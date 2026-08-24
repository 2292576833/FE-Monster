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
  [System.IO.File]::WriteAllText(
    (Join-Path $upgradeInstallDir '.fe-monster-upgrade-transaction.json'),
    '{"schemaVersion":1,"targetPath":"stale-before-first-rename","backupName":".fm-backup-dead0001"}',
    [System.Text.UTF8Encoding]::new($false)
  )
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
  if (Test-Path -LiteralPath (Join-Path $upgradeInstallDir '.fe-monster-upgrade-transaction.json')) {
    throw 'Upgrade rollback leaked its durable recovery marker into the restored installation.'
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

  # Reproduce a hard interruption between the two commit-point renames:
  # the previous installation has already moved to .fm-backup-*, while the
  # verified stage has not yet reached the registered installation path.
  $interruptedInstallDir = Join-Path $testRoot 'interrupted-upgrade-install'
  $interruptedBackupRoot = Join-Path $testRoot '.fm-backup-a11ce123'
  $interruptedPayloadRoot = Join-Path $testRoot 'interrupted-upgrade-payload'
  $interruptedLogPath = Join-Path $testRoot 'interrupted-upgrade.log'
  $interruptedLegacyJar = Join-Path $interruptedBackupRoot 'out\fe-monster-java.jar'
  $interruptedLegacyRun = Join-Path $interruptedBackupRoot 'run.cmd'
  $interruptedUserState = Join-Path $interruptedBackupRoot 'data\user-state.txt'
  $interruptedRecoveryMarker = Join-Path $interruptedBackupRoot '.fe-monster-upgrade-transaction.json'
  New-Item -ItemType Directory -Path (Split-Path -Parent $interruptedLegacyJar) -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path -Parent $interruptedUserState) -Force | Out-Null
  [System.IO.File]::WriteAllText($interruptedLegacyJar, 'legacy-jar', [System.Text.Encoding]::ASCII)
  [System.IO.File]::WriteAllText($interruptedLegacyRun, 'legacy-run', [System.Text.Encoding]::ASCII)
  [System.IO.File]::WriteAllText(
    $interruptedUserState,
    'hard-interruption-user-state',
    [System.Text.Encoding]::ASCII
  )
  [System.IO.File]::WriteAllText(
    $interruptedRecoveryMarker,
    ([ordered]@{
      schemaVersion = 1
      targetPath = [System.IO.Path]::GetFullPath($interruptedInstallDir)
      backupName = Split-Path -Leaf $interruptedBackupRoot
    } | ConvertTo-Json -Compress),
    [System.Text.UTF8Encoding]::new($false)
  )
  # The native Setup host creates and probes the requested directory before it
  # launches PowerShell, so the real restart arrives with an empty placeholder.
  New-Item -ItemType Directory -Path $interruptedInstallDir -Force | Out-Null
  New-TestPayload $interruptedPayloadRoot

  $interruptedExitCode = Invoke-TestInstall `
    $interruptedPayloadRoot `
    $interruptedInstallDir `
    $interruptedLogPath
  if ($interruptedExitCode -ne 1) {
    throw "Interrupted-upgrade fixture should fail after activation, but installer returned $interruptedExitCode."
  }
  $recoveredUserState = Join-Path $interruptedInstallDir 'data\user-state.txt'
  if (!(Test-Path -LiteralPath $recoveredUserState -PathType Leaf) -or
      (Get-Content -LiteralPath $recoveredUserState -Raw) -ne 'hard-interruption-user-state') {
    throw 'A hard-interrupted upgrade did not recover the previous user data before retrying.'
  }
  if (Test-Path -LiteralPath (Join-Path $interruptedInstallDir 'marker.txt')) {
    throw 'A hard-interrupted upgrade left the retry payload active instead of rolling back to recovered data.'
  }
  if (Test-Path -LiteralPath $interruptedBackupRoot) {
    throw 'The recovered hard-interruption backup remained orphaned beside the installation.'
  }
  if (Test-Path -LiteralPath (Join-Path $interruptedInstallDir '.fe-monster-upgrade-transaction.json')) {
    throw 'Hard-interruption recovery leaked its transaction marker into the restored installation.'
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

  $unrelatedInstallDir = Join-Path $testRoot 'unrelated-backup-install'
  $unrelatedBackupRoot = Join-Path $testRoot '.fm-backup-badc0ffe'
  $unrelatedPayloadRoot = Join-Path $testRoot 'unrelated-backup-payload'
  $unrelatedLogPath = Join-Path $testRoot 'unrelated-backup.log'
  New-Item -ItemType Directory -Path $unrelatedBackupRoot -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $unrelatedBackupRoot 'not-fe-monster.txt'),
    'unrelated-directory-must-not-move',
    [System.Text.Encoding]::ASCII
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $unrelatedBackupRoot '.fe-monster-upgrade-transaction.json'),
    ([ordered]@{
      schemaVersion = 1
      targetPath = [System.IO.Path]::GetFullPath($unrelatedInstallDir)
      backupName = Split-Path -Leaf $unrelatedBackupRoot
    } | ConvertTo-Json -Compress),
    [System.Text.UTF8Encoding]::new($false)
  )
  New-TestPayload $unrelatedPayloadRoot

  $unrelatedExitCode = Invoke-TestInstall `
    $unrelatedPayloadRoot `
    $unrelatedInstallDir `
    $unrelatedLogPath
  if ($unrelatedExitCode -ne 1) {
    throw "Unrelated-backup fixture should fail after activation, but installer returned $unrelatedExitCode."
  }
  $unrelatedSentinel = Join-Path $unrelatedBackupRoot 'not-fe-monster.txt'
  if (!(Test-Path -LiteralPath $unrelatedSentinel -PathType Leaf) -or
      (Get-Content -LiteralPath $unrelatedSentinel -Raw) -ne 'unrelated-directory-must-not-move') {
    throw 'Installer recovery consumed a .fm-backup-* directory that was not an FE Monster installation.'
  }
  if (!(Test-Path -LiteralPath (Join-Path $unrelatedInstallDir 'marker.txt') -PathType Leaf)) {
    throw 'The unrelated-backup fixture did not reach payload activation.'
  }

  $foreignInstallDir = Join-Path $testRoot 'foreign-target-install'
  $foreignBackupRoot = Join-Path $testRoot '.fm-backup-face0001'
  $foreignPayloadRoot = Join-Path $testRoot 'foreign-target-payload'
  $foreignLogPath = Join-Path $testRoot 'foreign-target.log'
  $foreignLegacyJar = Join-Path $foreignBackupRoot 'out\fe-monster-java.jar'
  New-Item -ItemType Directory -Path (Split-Path -Parent $foreignLegacyJar) -Force | Out-Null
  [System.IO.File]::WriteAllText($foreignLegacyJar, 'legacy-jar', [System.Text.Encoding]::ASCII)
  [System.IO.File]::WriteAllText(
    (Join-Path $foreignBackupRoot 'run.cmd'),
    'legacy-run',
    [System.Text.Encoding]::ASCII
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $foreignBackupRoot '.fe-monster-upgrade-transaction.json'),
    ([ordered]@{
      schemaVersion = 1
      targetPath = [System.IO.Path]::GetFullPath((Join-Path $testRoot 'different-install-target'))
      backupName = Split-Path -Leaf $foreignBackupRoot
    } | ConvertTo-Json -Compress),
    [System.Text.UTF8Encoding]::new($false)
  )
  New-TestPayload $foreignPayloadRoot
  $foreignExitCode = Invoke-TestInstall `
    $foreignPayloadRoot `
    $foreignInstallDir `
    $foreignLogPath
  if ($foreignExitCode -ne 1 -or
      !(Test-Path -LiteralPath (Join-Path $foreignInstallDir 'marker.txt') -PathType Leaf)) {
    throw 'A backup bound to another FE Monster target blocked the requested fresh installation.'
  }
  if (!(Test-Path -LiteralPath $foreignBackupRoot -PathType Container)) {
    throw 'Installer recovery consumed a valid FE Monster backup that was bound to another target.'
  }

  # If two structurally valid, target-bound backups exist, recovery cannot
  # safely guess which one is newest. It must leave both untouched.
  $ambiguousInstallDir = Join-Path $testRoot 'ambiguous-backup-install'
  $ambiguousPayloadRoot = Join-Path $testRoot 'ambiguous-backup-payload'
  $ambiguousLogPath = Join-Path $testRoot 'ambiguous-backup.log'
  $ambiguousBackupRoots = @(
    (Join-Path $testRoot '.fm-backup-cafe0001'),
    (Join-Path $testRoot '.fm-backup-cafe0002')
  )
  foreach ($ambiguousBackupRoot in $ambiguousBackupRoots) {
    $ambiguousJar = Join-Path $ambiguousBackupRoot 'out\fe-monster-java.jar'
    New-Item -ItemType Directory -Path (Split-Path -Parent $ambiguousJar) -Force | Out-Null
    [System.IO.File]::WriteAllText($ambiguousJar, 'legacy-jar', [System.Text.Encoding]::ASCII)
    [System.IO.File]::WriteAllText(
      (Join-Path $ambiguousBackupRoot 'run.cmd'),
      'legacy-run',
      [System.Text.Encoding]::ASCII
    )
    [System.IO.File]::WriteAllText(
      (Join-Path $ambiguousBackupRoot '.fe-monster-upgrade-transaction.json'),
      ([ordered]@{
        schemaVersion = 1
        targetPath = [System.IO.Path]::GetFullPath($ambiguousInstallDir)
        backupName = Split-Path -Leaf $ambiguousBackupRoot
      } | ConvertTo-Json -Compress),
      [System.Text.UTF8Encoding]::new($false)
    )
  }
  New-TestPayload $ambiguousPayloadRoot
  $ambiguousExitCode = Invoke-TestInstall `
    $ambiguousPayloadRoot `
    $ambiguousInstallDir `
    $ambiguousLogPath
  if ($ambiguousExitCode -ne 1) {
    throw "Ambiguous-backup fixture should fail closed, but installer returned $ambiguousExitCode."
  }
  if (Test-Path -LiteralPath $ambiguousInstallDir) {
    throw 'Ambiguous interrupted-upgrade recovery activated or restored an installation.'
  }
  if (!(Test-Path -LiteralPath $ambiguousPayloadRoot -PathType Container)) {
    throw 'Ambiguous interrupted-upgrade recovery consumed the pending payload.'
  }
  foreach ($ambiguousBackupRoot in $ambiguousBackupRoots) {
    if (!(Test-Path -LiteralPath $ambiguousBackupRoot -PathType Container)) {
      throw 'Ambiguous interrupted-upgrade recovery moved a backup instead of failing closed.'
    }
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
