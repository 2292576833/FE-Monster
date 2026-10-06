param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$PayloadRoot = '',
  [string]$SetupExe = '',
  [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $rootPath 'scripts\release-version.ps1')
$expectedAppVersion = (Get-FeMonsterReleaseVersion (Get-Content -Raw -LiteralPath (Join-Path $rootPath 'package.json') | ConvertFrom-Json)).DisplayVersion
if ([string]::IsNullOrWhiteSpace($PayloadRoot)) {
  $PayloadRoot = Join-Path $rootPath 'out\installer\work\payload\FE Monster'
}
$payloadPath = (Resolve-Path -LiteralPath $PayloadRoot).Path
$installer = Join-Path $rootPath 'scripts\install-fe-monster.ps1'
$setupPath = if ([string]::IsNullOrWhiteSpace($SetupExe)) {
  ''
} else {
  (Resolve-Path -LiteralPath $SetupExe).Path
}
$setupAuthenticodeStatus = if ([string]::IsNullOrWhiteSpace($setupPath)) {
  'NotApplicable'
} else {
  [string](Get-AuthenticodeSignature -LiteralPath $setupPath).Status
}
if ($RequireSignature -and $setupAuthenticodeStatus -ne 'Valid') {
  throw "Bundled setup Authenticode signature is not valid: $setupAuthenticodeStatus"
}
$ripgrep = (Get-Command rg.exe -ErrorAction Stop).Source
$cleanInstallTempRoot = Join-Path $rootPath 'tmp\windows-clean-install-runtime'
New-Item -ItemType Directory -Path $cleanInstallTempRoot -Force | Out-Null
$Env:TEMP = $cleanInstallTempRoot
$Env:TMP = $cleanInstallTempRoot
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'fe-monster-clean-install-runtime-' + [guid]::NewGuid().ToString('N')
)
$installPath = Join-Path $testRoot 'app'
$probeDataDir = Join-Path $testRoot 'clean-data'
$installLog = Join-Path $testRoot 'install.log'
$backendLog = Join-Path $testRoot 'backend.log'
$backendProcess = $null
$memoryWriteVerified = $false
$memoryRestartVerified = $false
$memoryPlaintextScanPassed = $false
$savedEnvironment = @{}

function Save-EnvironmentValue {
  param([string]$Name)
  $savedEnvironment[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
}

function Restore-Environment {
  foreach ($entry in $savedEnvironment.GetEnumerator()) {
    if ($null -eq $entry.Value) {
      [Environment]::SetEnvironmentVariable($entry.Key, $null, 'Process')
    } else {
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
    }
  }
}

function Get-FreeLocalPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }
}

function Wait-Json {
  param([string]$Uri, [int]$Seconds = 20)
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try { return Invoke-RestMethod -UseBasicParsing -Uri $Uri -TimeoutSec 2 }
    catch { Start-Sleep -Milliseconds 150 }
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Uri"
}

function Wait-MusicService {
  param([string]$Uri, [int]$Seconds = 20)
  $deadline = (Get-Date).AddSeconds($Seconds)
  $lastStatus = $null
  do {
    try {
      $lastStatus = Invoke-RestMethod -UseBasicParsing -Uri $Uri -TimeoutSec 2
      if ($lastStatus.reachable) { return $lastStatus }
    } catch {}
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  $detail = if ($null -eq $lastStatus) { 'no status response' } else { $lastStatus | ConvertTo-Json -Compress -Depth 5 }
  throw "Timed out waiting for music provider service at $Uri ($detail)"
}

function Assert-File {
  param([string]$RelativePath)
  $path = Join-Path $installPath $RelativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Clean install is missing $RelativePath"
  }
  return $path
}

function Stop-TestProcesses {
  if ($null -ne $backendProcess -and !$backendProcess.HasExited) {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if (!(Test-Path -LiteralPath $installPath -PathType Container)) { return }
  $escapedRoot = [regex]::Escape($installPath)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ([string]$_.ExecutablePath) -like "$installPath*" -or
      ([string]$_.CommandLine) -match $escapedRoot
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Start-TestBackend {
  param(
    [string]$Java,
    [string]$Jar,
    [string]$InstallRoot,
    [int]$Port
  )

  $Env:FE_MONSTER_PORT = [string]$Port
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Java
  $startInfo.WorkingDirectory = $InstallRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Arguments = '-jar "' + $Jar.Replace('"', '\"') + '" --server'
  $script:backendProcess = [Diagnostics.Process]::new()
  $script:backendProcess.StartInfo = $startInfo
  if (!$script:backendProcess.Start()) { throw 'Installed Java backend process did not start.' }
  # Drain both streams asynchronously so provider output cannot fill an OS
  # pipe during the clean-install and restart checks.
  $script:backendProcess.BeginOutputReadLine()
  $script:backendProcess.BeginErrorReadLine()
  return "http://127.0.0.1:$Port"
}

function Stop-TestBackend {
  param([string]$BaseUrl)

  try {
    [void](Invoke-RestMethod -UseBasicParsing -Uri "$BaseUrl/api/app/quit" -TimeoutSec 2)
  } catch { }
  if ($null -ne $script:backendProcess) {
    [void]$script:backendProcess.WaitForExit(5000)
    if (!$script:backendProcess.HasExited) { throw 'Installed backend did not stop cleanly.' }
  }
}

function Invoke-CleanInstaller {
  param(
    [string]$InstallTarget,
    [string]$ProcessLog
  )

  $windowsPowerShell = Join-Path $Env:SystemRoot 'System32\WindowsPowerShell\v1.0'
  $powershell = Join-Path $windowsPowerShell 'powershell.exe'
  if ([string]::IsNullOrWhiteSpace($setupPath)) {
    & $powershell `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $installer `
      -InstallDir $InstallTarget `
      -PayloadRoot $payloadPath `
      -LogPath $installLog `
      -NoLaunch `
      -NoShortcuts `
      -SkipSystemNodeInstall `
      -NoRegistration `
      -NoPopup *> $ProcessLog
    return $LASTEXITCODE
  }

  # Windows PowerShell does not reliably wait for a GUI-subsystem executable
  # invoked with `&`. Use Process directly so the gate observes the setup
  # host's real exit code instead of a stale $LASTEXITCODE value.
  $setupInfo = [Diagnostics.ProcessStartInfo]::new()
  $setupInfo.FileName = $setupPath
  $setupInfo.Arguments = @(
    '--quiet',
    '--install-dir',
    ('"' + $InstallTarget.Replace('"', '\"') + '"'),
    '--no-launch',
    '-NoShortcuts',
    '-SkipSystemNodeInstall',
    '-NoRegistration'
  ) -join ' '
  $setupInfo.UseShellExecute = $false
  $setupInfo.CreateNoWindow = $true
  $setupInfo.RedirectStandardOutput = $true
  $setupInfo.RedirectStandardError = $true
  $setupProcess = [Diagnostics.Process]::new()
  $setupProcess.StartInfo = $setupInfo
  if (!$setupProcess.Start()) { throw 'Bundled setup executable did not start.' }
  $setupStdout = $setupProcess.StandardOutput.ReadToEndAsync()
  $setupStderr = $setupProcess.StandardError.ReadToEndAsync()
  $setupProcess.WaitForExit()
  $setupExitCode = $setupProcess.ExitCode
  $setupOutput = $setupStdout.Result + [Environment]::NewLine + $setupStderr.Result
  if ($setupExitCode -ne 0) {
    $sessionLogDirectory = Join-Path (Split-Path -Parent $InstallTarget) '.fe-monster-setup-state\logs'
    if (Test-Path -LiteralPath $sessionLogDirectory -PathType Container) {
      foreach ($sessionLog in Get-ChildItem -LiteralPath $sessionLogDirectory -File -Filter '*.log' | Sort-Object LastWriteTime) {
        $setupOutput += [Environment]::NewLine + '--- ' + $sessionLog.Name + ' ---' + [Environment]::NewLine +
          (Get-Content -Raw -LiteralPath $sessionLog.FullName)
      }
    }
  }
  [IO.File]::WriteAllText($ProcessLog, $setupOutput, [Text.UTF8Encoding]::new($false))
  $setupProcess.Dispose()
  return $setupExitCode
}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  foreach ($name in @(
    'PATH', 'JAVA_HOME', 'FE_JAVA_HOME', 'FE_JAVA26_HOME', 'FE_MONSTER_NODE',
    'FE_MONSTER_ROOT', 'FE_MONSTER_DATA_DIR',
    'FE_MONSTER_PORT', 'FE_MUSIC_API_AUTOSTART'
  )) { Save-EnvironmentValue $name }

  $windowsPowerShell = Join-Path $Env:SystemRoot 'System32\WindowsPowerShell\v1.0'
  $Env:PATH = @(
    (Join-Path $Env:SystemRoot 'System32'),
    $Env:SystemRoot,
    $windowsPowerShell
  ) -join ';'
  foreach ($name in @(
    'JAVA_HOME', 'FE_JAVA_HOME', 'FE_JAVA26_HOME', 'FE_MONSTER_NODE',
    'FE_MONSTER_ROOT', 'FE_MONSTER_DATA_DIR',
    'FE_MONSTER_PORT', 'FE_MUSIC_API_AUTOSTART'
  )) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }

  $installOutput = Join-Path $testRoot 'install-process.log'
  $installerExitCode = Invoke-CleanInstaller -InstallTarget $installPath -ProcessLog $installOutput
  if ($installerExitCode -ne 0) {
    $detail = if (Test-Path -LiteralPath $installOutput) { Get-Content -Raw -LiteralPath $installOutput } else { '' }
    $diagnostics = @(Get-ChildItem -LiteralPath $testRoot -File -Filter '*.log' -ErrorAction SilentlyContinue | ForEach-Object {
      "`n--- $($_.Name) ---`n" + (Get-Content -Raw -LiteralPath $_.FullName -ErrorAction SilentlyContinue)
    }) -join ''
    throw "Clean installer returned $installerExitCode.`n$detail$diagnostics"
  }

  $node = Assert-File 'runtime\node\node.exe'
  $java = Assert-File 'runtime\java\bin\java.exe'
  $jar = Assert-File 'out\fe-monster-java.jar'
  [void](Assert-File 'native\windows\build\winforms\FE Monster.exe')
  foreach ($desktopRuntime in @(
    'web\index.html',
    'web\cache-fingerprints.json',
    'web\app.js',
    'web\local-memory-client.js',
    'web\pet-memory-recall.js',
    'web\pet-preference-policy.js',
    'web\pet-preference-memory.js',
    'web\app-parameter-registry.js',
    'web\app-command.js',
    'web\playback-intelligence.js',
    'web\pet-assistant.js',
    'web\pet-particle-orb.js',
    'web\soundscape-runtime.js',
    'web\assets\soundscape-workshop\runtime.html',
    'web\assets\soundscape-workshop\bridge.js',
    'web\assets\soundscape-workshop\assets\index-CSU_B_T9.js',
    'web\assets\soundscape-workshop\assets\index-DgmMz9-g.css'
  )) {
    [void](Assert-File $desktopRuntime)
  }

  $nodePath = (& $node -p 'process.execPath').Trim()
  if ($LASTEXITCODE -ne 0 -or ![string]::Equals(
      [IO.Path]::GetFullPath($nodePath),
      [IO.Path]::GetFullPath($node),
      [StringComparison]::OrdinalIgnoreCase
  )) { throw 'Bundled Node.js did not execute from the clean installation.' }

  $javaProbeInfo = [Diagnostics.ProcessStartInfo]::new()
  $javaProbeInfo.FileName = $java
  $javaProbeInfo.Arguments = '-version'
  $javaProbeInfo.UseShellExecute = $false
  $javaProbeInfo.CreateNoWindow = $true
  $javaProbeInfo.RedirectStandardOutput = $true
  $javaProbeInfo.RedirectStandardError = $true
  $javaProbe = [Diagnostics.Process]::Start($javaProbeInfo)
  $javaProbe.WaitForExit()
  if ($javaProbe.ExitCode -ne 0) { throw 'Bundled Java runtime did not start.' }

  $expectedPlugins = [ordered]@{
    netease = '4.32.0'
    qq = '2.4.2'
    kugou = '2.0.8'
    qishui = '3.1.1'
  }
  foreach ($entry in $expectedPlugins.GetEnumerator()) {
    $pattern = "*-$($entry.Value).zip"
    $match = @(Get-ChildItem -LiteralPath (Join-Path $installPath 'plugins\music-api') -File -Filter $pattern)
    if ($match.Count -ne 1) { throw "Installed $($entry.Key) plugin version $($entry.Value) is missing or ambiguous." }
  }

  $communityUrlFile = Assert-File 'data\community-server-url.txt'
  $communityPinFile = Assert-File 'data\community-server-tls-pin.txt'
  [Uri]$communityUri = (Get-Content -Raw -LiteralPath $communityUrlFile).Trim()
  if ($communityUri.Scheme -ne 'https' -or $communityUri.IsLoopback) {
    throw 'Clean install does not contain a public HTTPS community endpoint.'
  }
  $pins = @(Get-Content -LiteralPath $communityPinFile | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
  if ($pins.Count -lt 1 -or @($pins | Where-Object { $_ -cnotmatch '^sha256:[A-F0-9]{64}$' }).Count -gt 0) {
    throw 'Clean install community TLS pin list is missing or invalid.'
  }

  $expectedCommunityUrlBytes = [IO.File]::ReadAllBytes($communityUrlFile)
  $expectedCommunityPinBytes = [IO.File]::ReadAllBytes($communityPinFile)
  $upgradeSentinel = Join-Path $installPath 'data\clean-install-upgrade-user-sentinel.txt'
  $obsoleteProgramResidue = Join-Path $installPath 'legacy-program-residue.dll'
  [IO.File]::WriteAllText(
    $upgradeSentinel,
    'preserve-user-data-across-upgrade',
    [Text.UTF8Encoding]::new($false)
  )
  [IO.File]::WriteAllText(
    $obsoleteProgramResidue,
    'old-program-file-must-not-survive-upgrade',
    [Text.UTF8Encoding]::new($false)
  )
  [IO.File]::WriteAllText(
    $communityUrlFile,
    'http://127.0.0.1:3020',
    [Text.UTF8Encoding]::new($false)
  )
  [IO.File]::WriteAllText(
    $communityPinFile,
    ('sha256:' + ('A' * 64)),
    [Text.UTF8Encoding]::new($false)
  )
  # Synthetic data in this test's GUID-scoped installation only. Verify the
  # same preservation contract in both staged-payload and final-EXE modes.
  $upgradeUserFixtures = [ordered]@{
    'data\community-device-credentials.json' = '{"deviceId":"upgrade-fixture","privateKey":"preserve-fixture-key"}'
    'data\client-preferences.json' = '{"schemaVersion":1,"theme":"preserve-user-theme"}'
    'data\netease-auth.json' = '{"provider":"netease","token":"preserve-fixture-netease"}'
    'data\qq-auth.json' = '{"provider":"qq","token":"preserve-fixture-qq"}'
    'data\kugou-auth.json' = '{"provider":"kugou","token":"preserve-fixture-kugou"}'
    'data\qishui-auth.json' = '{"provider":"qishui","token":"preserve-fixture-qishui"}'
    'data\playback-state.json' = '{"position":123.5,"trackId":"preserve-fixture-track"}'
    'data\playback-queue.json' = '{"tracks":["fixture-first","fixture-second"],"selectedIndex":1}'
    'data\official-browser-login\qq\profile.json' = '{"cookie":"preserve-fixture-browser-login"}'
    'data\community-account-profiles\qq-user.json' = '{"feId":"12345678","nickname":"preserve-fixture-profile"}'
    'data\together-listening\history.json' = '{"sessions":["preserve-fixture-history"]}'
    'data\pet-personalization\memory.json' = '{"memory":"preserve-fixture-pet-history"}'
    'data\client-ai\state.json' = '{"provider":"custom","apiKey":"preserve-fixture-local-config"}'
    'data\wallpapers\user-import.bin' = 'preserve-fixture-wallpaper-bytes'
    'WebView2\Default\Local Storage\leveldb\000003.log' = 'preserve-fixture-legacy-webview-storage'
    'WebView2\DesktopHostV2\Default\Local Storage\leveldb\000003.log' = 'preserve-fixture-current-webview-storage'
    'logs\user-diagnostic.log' = 'preserve-fixture-diagnostic-log'
    'public-access.key' = 'preserve-fixture-public-access-key'
  }
  $upgradeUserHashes = @{}
  foreach ($relativePath in $upgradeUserFixtures.Keys) {
    $fixturePath = Join-Path $installPath $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $fixturePath) -Force | Out-Null
    [IO.File]::WriteAllText($fixturePath, [string]$upgradeUserFixtures[$relativePath], [Text.UTF8Encoding]::new($false))
    $upgradeUserHashes[$relativePath] = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash
  }
  foreach ($relativePath in @('data\machine-id.txt', 'data\client-install-id.txt')) {
    $identityPath = Join-Path $installPath $relativePath
    if (Test-Path -LiteralPath $identityPath -PathType Leaf) {
      $upgradeUserHashes[$relativePath] = (Get-FileHash -LiteralPath $identityPath -Algorithm SHA256).Hash
    }
  }
  $upgradeOutput = Join-Path $testRoot 'upgrade-process.log'
  $upgradeExitCode = Invoke-CleanInstaller -InstallTarget $installPath -ProcessLog $upgradeOutput
  if ($upgradeExitCode -ne 0) {
    $upgradeDetail = if (Test-Path -LiteralPath $upgradeOutput) {
      Get-Content -Raw -LiteralPath $upgradeOutput
    } else { '' }
    throw "Clean upgrade installer returned $upgradeExitCode.`n$upgradeDetail"
  }
  if (!(Test-Path -LiteralPath $upgradeSentinel -PathType Leaf) -or
      (Get-Content -Raw -LiteralPath $upgradeSentinel) -cne 'preserve-user-data-across-upgrade') {
    throw 'Clean upgrade did not preserve ordinary user data.'
  }
  if (Test-Path -LiteralPath $obsoleteProgramResidue) {
    throw 'Clean upgrade retained an obsolete program file that is absent from the new payload.'
  }
  foreach ($relativePath in $upgradeUserHashes.Keys) {
    $preservedPath = Join-Path $installPath $relativePath
    if (!(Test-Path -LiteralPath $preservedPath -PathType Leaf) -or
        (Get-FileHash -LiteralPath $preservedPath -Algorithm SHA256).Hash -cne $upgradeUserHashes[$relativePath]) {
      throw "Clean upgrade changed or removed a user record: $relativePath"
    }
  }
  $actualCommunityUrlBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($communityUrlFile))
  $actualCommunityPinBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($communityPinFile))
  if ($actualCommunityUrlBase64 -cne [Convert]::ToBase64String($expectedCommunityUrlBytes)) {
    throw 'Clean upgrade allowed an old local community URL to overwrite the release URL.'
  }
  if ($actualCommunityPinBase64 -cne [Convert]::ToBase64String($expectedCommunityPinBytes)) {
    throw 'Clean upgrade allowed an old TLS pin to overwrite the release pin.'
  }

  # Runtime independence is determined by executable configuration and launch
  # scripts. Native release binaries can legitimately contain compile-time
  # __FILE__ strings used by third-party assertion messages; those strings are
  # not filesystem dependencies and must not make a clean-install probe fail.
  $workspaceTextGlobs = @(
    '*.ps1', '*.psm1', '*.cmd', '*.bat', '*.js', '*.mjs', '*.cjs', '*.json',
    '*.txt', '*.properties', '*.xml', '*.yml', '*.yaml', '*.toml', '*.ini',
    '*.html', '*.css', '*.md'
  )
  $workspaceScanArguments = @('-a', '-l', '-F') +
    @($workspaceTextGlobs | ForEach-Object { "--glob=$_" }) +
    @('--', $rootPath, $installPath)
  $workspaceLeak = & $ripgrep @workspaceScanArguments 2> $null | Select-Object -First 1
  if (![string]::IsNullOrWhiteSpace($workspaceLeak)) {
    throw "Clean install contains a developer workspace path: $workspaceLeak"
  }

  New-Item -ItemType Directory -Path $probeDataDir -Force | Out-Null
  $port = Get-FreeLocalPort
  $Env:FE_MONSTER_ROOT = $installPath
  $Env:FE_MONSTER_DATA_DIR = $probeDataDir
  $Env:FE_MONSTER_NODE = $node
  $Env:FE_MUSIC_API_AUTOSTART = '0'

  $baseUrl = Start-TestBackend -Java $java -Jar $jar -InstallRoot $installPath -Port $port
  $versionInfo = Wait-Json "$baseUrl/api/app/version" 25
  if ([string]$versionInfo.version -cne $expectedAppVersion) {
    throw "Installed backend reports version '$($versionInfo.version)', expected '$expectedAppVersion'."
  }

  $memoryHeaders = @{
    Origin = $baseUrl
    'Sec-Fetch-Site' = 'same-origin'
  }
  $memoryEventId = [guid]::NewGuid().ToString()
  $memoryConversationId = 'release-' + [guid]::NewGuid().ToString('N')
  $memoryTraceId = 'trace-' + [guid]::NewGuid().ToString('N')
  $memoryTurnId = 'turn-' + [guid]::NewGuid().ToString('N')
  $memoryOccurredAt = [DateTime]::UtcNow.ToString(
    "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
    [Globalization.CultureInfo]::InvariantCulture
  )
  $memoryCanary = 'FE_MEMORY_RELEASE_CANARY_' + [guid]::NewGuid().ToString('N')
  $memoryWriteBody = [ordered]@{
    provider = 'netease'
    event = [ordered]@{
      eventId = $memoryEventId
      stream = 'chat'
      type = 'chat.message'
      occurredAt = $memoryOccurredAt
      sourceSequence = 1
      payload = [ordered]@{
        messageId = $memoryEventId
        conversationId = $memoryConversationId
        traceId = $memoryTraceId
        turnId = $memoryTurnId
        role = 'user'
        text = $memoryCanary
        source = 'app'
        modelOrigin = 'local'
        timeAccuracy = 'exact'
        occurredAt = $memoryOccurredAt
        sourceSequence = 1
      }
    }
  } | ConvertTo-Json -Depth 8 -Compress
  $memoryWrite = Invoke-RestMethod `
    -UseBasicParsing `
    -Method Post `
    -Uri "$baseUrl/api/local-memory/events" `
    -Headers $memoryHeaders `
    -ContentType 'application/json; charset=utf-8' `
    -Body $memoryWriteBody `
    -TimeoutSec 20
  $memoryReceipt = @($memoryWrite.results | Where-Object { $_.eventId -eq $memoryEventId }) | Select-Object -First 1
  if (!$memoryWrite.ok -or $null -eq $memoryReceipt -or [string]::IsNullOrWhiteSpace([string]$memoryReceipt.recordedAt)) {
    throw 'Clean installed backend did not durably accept the encrypted-memory canary.'
  }
  $memoryWriteVerified = $true

  $configuration = Wait-Json "$baseUrl/api/music-apis" 10
  $providerStartupMilliseconds = [ordered]@{}
  foreach ($entry in $expectedPlugins.GetEnumerator()) {
    $provider = @($configuration.providers | Where-Object { $_.id -eq $entry.Key }) | Select-Object -First 1
    if ($null -eq $provider -or !$provider.configured -or $provider.version -ne $entry.Value -or $provider.source -ne 'imported-zip') {
      throw "Clean backend did not import $($entry.Key) $($entry.Value) from its bundled zip."
    }
    $activationStarted = [Diagnostics.Stopwatch]::StartNew()
    $activation = Invoke-RestMethod `
      -UseBasicParsing `
      -Method Post `
      -Uri "$baseUrl/api/app/interactive/activate" `
      -ContentType 'application/json; charset=utf-8' `
      -Body (@{ provider = $entry.Key } | ConvertTo-Json -Compress) `
      -TimeoutSec 15
    $service = Wait-MusicService "$baseUrl/api/$($entry.Key)/service/status" 20
    $activationStarted.Stop()
    $providerStartupMilliseconds[$entry.Key] = $activationStarted.ElapsedMilliseconds
    if (!$activation.musicProviderReady -and !$service.reachable) {
      throw "Installed $($entry.Key) plugin did not become ready."
    }
  }

  Stop-TestBackend -BaseUrl $baseUrl

  $restartPort = Get-FreeLocalPort
  $restartBaseUrl = Start-TestBackend -Java $java -Jar $jar -InstallRoot $installPath -Port $restartPort
  $restartVersion = Wait-Json "$restartBaseUrl/api/app/version" 25
  if ([string]$restartVersion.version -cne $expectedAppVersion) {
    throw 'Restarted installed backend did not report the expected version.'
  }
  $restartHeaders = @{
    Origin = $restartBaseUrl
    'Sec-Fetch-Site' = 'same-origin'
  }
  $encodedConversation = [Uri]::EscapeDataString($memoryConversationId)
  $memoryAfterRestart = Invoke-RestMethod `
    -UseBasicParsing `
    -Uri "$restartBaseUrl/api/local-memory/chats?provider=netease&conversation=$encodedConversation&types=chat.message&limit=10" `
    -Headers $restartHeaders `
    -TimeoutSec 20
  $reloaded = @($memoryAfterRestart.records | Where-Object { $_.eventId -eq $memoryEventId }) | Select-Object -First 1
  if (!$memoryAfterRestart.ok -or $null -eq $reloaded -or [string]$reloaded.payload.text -cne $memoryCanary) {
    throw 'Encrypted-memory canary was not recovered after an installed-backend restart.'
  }
  $memoryRestartVerified = $true
  Stop-TestBackend -BaseUrl $restartBaseUrl

  $memoryVaultRoot = Join-Path $probeDataDir 'local-ai-memory'
  if (!(Test-Path -LiteralPath $memoryVaultRoot -PathType Container)) {
    throw 'Clean installed backend did not create a local encrypted-memory vault.'
  }
  foreach ($vaultFileName in @('memory.db', 'vault-key.dpapi', 'vault-meta.json')) {
    if (@(Get-ChildItem -LiteralPath $memoryVaultRoot -Recurse -File -Filter $vaultFileName).Count -ne 1) {
      throw "Clean installed encrypted-memory vault has an unexpected $vaultFileName count."
    }
  }
  $plaintextLeak = & $ripgrep -a -l -F -- $memoryCanary $memoryVaultRoot 2> $null | Select-Object -First 1
  $plaintextScanExitCode = $LASTEXITCODE
  if ($plaintextScanExitCode -eq 0 -or ![string]::IsNullOrWhiteSpace([string]$plaintextLeak)) {
    throw "Encrypted-memory plaintext canary reached persistent vault artifact: $plaintextLeak"
  }
  if ($plaintextScanExitCode -ne 1) {
    throw "Encrypted-memory plaintext scan failed with ripgrep exit code $plaintextScanExitCode."
  }
  $memoryPlaintextScanPassed = $true

  [pscustomobject]@{
    passed = $true
    version = $expectedAppVersion
    installerMode = if ([string]::IsNullOrWhiteSpace($setupPath)) { 'staged-payload' } else { 'bundled-setup-exe' }
    setupAuthenticodeStatus = $setupAuthenticodeStatus
    installRootWasTemporary = $true
    globalRuntimesRemovedFromPath = $true
    bundledNode = $nodePath
    bundledJava = $java
    providers = @($expectedPlugins.GetEnumerator() | ForEach-Object { "$($_.Key)@$($_.Value)" })
    providerStartupMilliseconds = $providerStartupMilliseconds
    publicCommunityUrl = $communityUri.AbsoluteUri
    tlsPinCount = $pins.Count
    upgradePreservedUserData = $true
    upgradePreservedFileCount = $upgradeUserHashes.Count
    upgradeRemovedObsoleteProgramFiles = $true
    upgradeRestoredReleaseCommunityConfiguration = $true
    cleanDataDirectory = $true
    memoryWriteVerified = $memoryWriteVerified
    memoryRestartVerified = $memoryRestartVerified
    memoryPlaintextScanPassed = $memoryPlaintextScanPassed
  } | ConvertTo-Json -Depth 4
} finally {
  Stop-TestProcesses
  Restore-Environment
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedTestRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedTestRoot).StartsWith('fe-monster-clean-install-runtime-', [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedTestRoot -PathType Container)) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $resolvedTestRoot -PathType Container) {
      # NetEase contains nested node_modules paths beyond the legacy MAX_PATH
      # limit. Use the Win32 extended path only after the strict temp-prefix
      # boundary checks above have succeeded.
      $extendedTestRoot = if ($resolvedTestRoot.StartsWith('\\')) {
        '\\?\UNC\' + $resolvedTestRoot.Substring(2)
      } else {
        '\\?\' + $resolvedTestRoot
      }
      try { [IO.Directory]::Delete($extendedTestRoot, $true) } catch {
        Write-Warning "Clean-install probe directory could not be fully removed: $resolvedTestRoot"
      }
    }
  }
}
