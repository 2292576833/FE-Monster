param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$PayloadRoot = '',
  [ValidateSet('Any', 'Online', 'Offline')]
  [string]$WebView2Mode = 'Any'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]

function Read-Source {
  param([string]$RelativePath)
  $path = Join-Path $rootPath $RelativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    $failures.Add("missing source file: $RelativePath") | Out-Null
    return ''
  }
  return Get-Content -LiteralPath $path -Raw
}

function Assert-SourceMatch {
  param(
    [string]$Name,
    [string]$Source,
    [string]$Pattern
  )
  if ($Source -notmatch $Pattern) {
    $failures.Add($Name) | Out-Null
  }
}

function Assert-SourceNotMatch {
  param(
    [string]$Name,
    [string]$Source,
    [string]$Pattern
  )
  if ($Source -match $Pattern) {
    $failures.Add($Name) | Out-Null
  }
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

function Test-DistributableCommunityUrl {
  param([string]$Value)

  $configuredUrl = $Value.Trim().TrimStart([char]0xFEFF).Trim()
  if ([string]::IsNullOrWhiteSpace($configuredUrl)) { return $false }

  [Uri]$uri = $null
  if (
    ![Uri]::TryCreate($configuredUrl, [UriKind]::Absolute, [ref]$uri) -or
    $uri.Scheme -ne [Uri]::UriSchemeHttps -or
    [string]::IsNullOrWhiteSpace($uri.Host)
  ) {
    return $false
  }
  if (
    ![string]::IsNullOrWhiteSpace($uri.UserInfo) -or
    ![string]::IsNullOrWhiteSpace($uri.Query) -or
    ![string]::IsNullOrWhiteSpace($uri.Fragment)
  ) {
    return $false
  }

  $hostName = $uri.DnsSafeHost.TrimEnd('.')
  if ($uri.IsLoopback -or $hostName.Equals('localhost', [StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  [Net.IPAddress]$address = $null
  if ([Net.IPAddress]::TryParse($hostName, [ref]$address)) {
    if ($address.IsIPv4MappedToIPv6) { $address = $address.MapToIPv4() }
    if ([Net.IPAddress]::IsLoopback($address)) { return $false }
    if ($address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
      $bytes = $address.GetAddressBytes()
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
    } elseif ($address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetworkV6) {
      if ($address.IsIPv6LinkLocal -or $address.IsIPv6SiteLocal -or $address.IsIPv6Multicast) {
        return $false
      }
      $bytes = $address.GetAddressBytes()
      if (($bytes[0] -band 0xFE) -eq 0xFC) { return $false }
      if ($bytes[0] -eq 0x20 -and $bytes[1] -eq 0x01 -and $bytes[2] -eq 0x0D -and $bytes[3] -eq 0xB8) {
        return $false
      }
    } else {
      return $false
    }
  }

  return $true
}

foreach ($communityUrlCase in @(
  [pscustomobject]@{ Value = 'https://community.example.test/community'; Expected = $true },
  [pscustomobject]@{ Value = 'http://community.example.test/community'; Expected = $false },
  [pscustomobject]@{ Value = 'https://127.0.0.1:3020'; Expected = $false },
  [pscustomobject]@{ Value = 'https://10.0.0.2/community'; Expected = $false },
  [pscustomobject]@{ Value = 'https://192.168.1.10/community'; Expected = $false },
  [pscustomobject]@{ Value = 'https://192.0.2.15/community'; Expected = $false },
  [pscustomobject]@{ Value = 'https://user:secret@community.example.test/community'; Expected = $false },
  [pscustomobject]@{ Value = 'https://community.example.test/community?token=secret'; Expected = $false }
)) {
  $actual = Test-DistributableCommunityUrl $communityUrlCase.Value
  if ($actual -ne $communityUrlCase.Expected) {
    $failures.Add(
      "distributable community URL policy for '$($communityUrlCase.Value)' was $actual, expected $($communityUrlCase.Expected)"
    ) | Out-Null
  }
}

$buildInstaller = Read-Source 'scripts\build-installer.ps1'
$packageJson = Read-Source 'package.json'
$javaBuild = Read-Source 'build.cmd'
$javaBuilder = Read-Source 'scripts\build-java.ps1'
$installer = Read-Source 'scripts\install-fe-monster.ps1'
$uninstaller = Read-Source 'scripts\uninstall-fe-monster.ps1'
$updateAgentInstaller = Read-Source 'scripts\install-update-agent.ps1'
$dependencies = Read-Source 'scripts\ensure-runtime-dependencies.ps1'
$launcher = Read-Source 'scripts\launch-fe-monster.ps1'
$stopper = Read-Source 'scripts\stop-stale-fe-monster.ps1'
$setupProgram = Read-Source 'native\windows\setup\Program.cs'
$setupProject = Read-Source 'native\windows\setup\FeMonsterSetup.csproj'
$clientProgram = Read-Source 'native\windows\winforms\Program.cs'
$clientForm = Read-Source 'native\windows\winforms\FeMonsterForm.cs'
$clientProject = Read-Source 'native\windows\winforms\FeMonsterClient.WinForms.csproj'
$webClient = Read-Source 'web\app.js'
$cmake = Read-Source 'native\windows\CMakeLists.txt'
$cargoConfig = Read-Source 'native\rust-audio-upmix\.cargo\config.toml'
$nativeBuild = Read-Source 'scripts\build-xaudio2.ps1'
$clientManifest = Read-Source 'native\windows\winforms\app.manifest'
$setupManifest = Read-Source 'native\windows\setup\app.manifest'
$machineIdentity = Read-Source 'src\main\java\com\femonster\core\MachineIdentityService.java'
$apiRoutes = Read-Source 'src\main\java\com\femonster\api\ApiRoutes.java'
$updateAgent = Read-Source 'scripts\fe-monster-update-agent.ps1'

$releaseVersion = ''
try {
  $releaseVersion = [string](ConvertFrom-Json $packageJson).version
} catch {
  $failures.Add('package.json contains invalid JSON') | Out-Null
}
if ($releaseVersion -ne '2.0.1') {
  $failures.Add("Windows installer release version must be 2.0.1, got '$releaseVersion'") | Out-Null
}
if ($releaseVersion -match '^\d+\.\d+\.\d+$') {
  $releasePattern = [Regex]::Escape($releaseVersion)
  Assert-SourceMatch 'setup project version matches package.json' $setupProject "<Version>$releasePattern</Version>"
  Assert-SourceMatch 'client project version matches package.json' $clientProject "<Version>$releasePattern</Version>"
  Assert-SourceMatch 'setup manifest version matches package.json' $setupManifest "assemblyIdentity version=`"$releasePattern\.0`""
  Assert-SourceMatch 'client manifest version matches package.json' $clientManifest "assemblyIdentity version=`"$releasePattern\.0`""
  Assert-SourceMatch 'installed script version matches package.json' $installer "appVersion\s*=\s*'$releasePattern'"
  Assert-SourceMatch 'update agent version matches package.json' $updateAgent "return\s+'$releasePattern'"
  Assert-SourceMatch 'machine identity version matches package.json' $machineIdentity "return\s+`"$releasePattern`""
  Assert-SourceMatch 'API version matches package.json' $apiRoutes "body\.put\(`"version`",\s*`"$releasePattern`"\)"
} else {
  $failures.Add("package.json contains an invalid release version: '$releaseVersion'") | Out-Null
}

Assert-SourceMatch 'setup is pinned to win-x64' $setupProject '<RuntimeIdentifier>win-x64</RuntimeIdentifier>'
Assert-SourceMatch 'setup declares a Windows compatibility manifest' $setupProject '<ApplicationManifest>app\.manifest</ApplicationManifest>'
Assert-SourceMatch 'setup declares Windows 10 1809 as its minimum build' $setupProgram 'MinimumWindowsBuild\s*=\s*17763'
Assert-SourceMatch 'setup checks the minimum Windows release' $setupProgram 'IsWindowsVersionAtLeast\s*\(\s*10\s*,\s*0\s*,\s*MinimumWindowsBuild'
Assert-SourceMatch 'setup rejects a non-x64 process' $setupProgram 'ProcessArchitecture\s*!=\s*Architecture\.X64'
Assert-SourceMatch 'setup verifies its payload SHA-256 before extraction' $setupProgram 'SHA256|Sha256'
Assert-SourceMatch 'setup has a writable temporary-directory fallback' $setupProgram 'LocalApplicationData.*Temp|Temp.*LocalApplicationData'
Assert-SourceMatch 'setup temp fallback stays outside the default install root' $setupProgram '"FE Monster Setup",\s*"Temp"'
Assert-SourceMatch 'setup can extract on the selected installation drive when system temp is constrained' $setupProgram 'CreateWritableTempRoot\(preferredInstallDir,\s*exePath\)'
Assert-SourceMatch 'setup validates the target boundary before creating target-local temp files' $setupProgram 'ValidateInstallDirectoryBoundary\(installDir\)[\s\S]{0,180}ExtractBundle\(exePath,\s*installDir\)'
Assert-SourceMatch 'setup computes temp space from bundle and unpacked payload metadata' $setupProgram 'InspectBundleSpaceRequirements'
Assert-SourceMatch 'setup cleans a partially extracted temporary bundle after failure' $setupProgram 'ExtractBundle[\s\S]{0,2400}catch[\s\S]{0,180}Directory\.Delete\(tempRoot,\s*true\)'
Assert-SourceMatch 'setup rejects user-data roots as installation targets' $setupProgram 'ValidateDedicatedInstallDirectory'
Assert-SourceMatch 'setup diagnostics stay outside the default install root' $setupProgram '"FE Monster Setup",\s*"logs"'
Assert-SourceMatch 'setup passes an external live session log to PowerShell' $setupProgram '"-LogPath"'
Assert-SourceMatch 'setup places session logs on the selected drive when Local AppData is elsewhere' $setupProgram 'CreateInstallerSessionLogPath\(installDir\)|CreateInstallerSessionLogPath\(options\.InstallDir\)'
Assert-SourceMatch 'setup has a selected-drive session-log fallback' $setupProgram '\.fe-monster-setup-state.*logs'
Assert-SourceMatch 'setup accepts only explicitly marked retained user state for reinstall' $setupProgram '\.fe-monster-user-data'
Assert-SourceMatch 'setup installation-space preflight includes preserved user state' $setupProgram 'GetPreservedUserStateBytes'
Assert-SourceMatch 'setup reuses a registered existing installation directory' $setupProgram 'GetRegisteredInstallDir[\s\S]{0,1800}InstallLocation'
Assert-SourceMatch 'setup refuses to kill an installation during the upgrade transaction' $setupProgram 'OnFormClosing[\s\S]{0,600}e\.Cancel\s*=\s*true'
Assert-SourceNotMatch 'setup does not force-kill its transactional installer' $setupProgram 'installProcess\.Kill'

Assert-SourceMatch 'client is pinned to win-x64' $clientProject '<RuntimeIdentifier>win-x64</RuntimeIdentifier>'
Assert-SourceMatch 'client is self-contained' $clientProject '<SelfContained>true</SelfContained>'
Assert-SourceMatch 'client executable is named FE Monster' $clientProject '<AssemblyName>FE Monster</AssemblyName>'
Assert-SourceMatch 'client declares a Windows compatibility manifest' $clientProject '<ApplicationManifest>app\.manifest</ApplicationManifest>'
Assert-SourceMatch 'new host isolates its WebView2 data from legacy clients' $clientForm 'profileFolder[\s\S]{0,180}"DesktopHostV2"[\s\S]{0,500}"WebView2"[\s\S]{0,100}profileFolder'
Assert-SourceMatch 'desktop-pet native tests isolate WebView2 storage under the temporary directory' $clientForm 'testStorageKey[\s\S]{0,500}Path\.GetTempPath\(\)'
Assert-SourceMatch 'client owns the Java backend child process' $clientProgram '--server'
Assert-SourceMatch 'client resolves its executable installation before environment or working-directory overrides' $clientProgram 'AddExecutableRootCandidates\(candidates\)[\s\S]{0,500}FE_MONSTER_ROOT[\s\S]{0,300}Environment\.CurrentDirectory'
Assert-SourceMatch 'client pins backend resource root to the resolved executable installation' $clientProgram 'startInfo\.Environment\["FE_MONSTER_ROOT"\]\s*=\s*root'
Assert-SourceMatch 'client pins backend web root to the resolved executable installation' $clientProgram 'startInfo\.Environment\["FE_MONSTER_WEB_ROOT"\]\s*=\s*Path\.Combine\(root,\s*"web"\)'
Assert-SourceMatch 'client resolves one stable per-user data root across install locations and restarts' $clientProgram 'dataDirectory\s*=\s*ResolveStableDataDirectory\(root\)'
Assert-SourceMatch 'client passes the stable data root to every backend restart' $clientProgram 'startInfo\.Environment\["FE_MONSTER_DATA_DIR"\]\s*=\s*dataDirectory'
Assert-SourceMatch 'client logs the Java child process id for CPU attribution' $clientProgram 'backend.*ProcessId|ProcessId.*backend'
Assert-SourceMatch 'client prefers an explainably named backend process' $clientProgram 'FE Monster Backend\.exe'
Assert-SourceMatch 'hidden single instance has an activation channel' $clientProgram 'UserActivationRequestName|ListenForActivation'
Assert-SourceMatch 'desktop-pet native tests use an isolated single-instance scope' $clientProgram 'DesktopPetTestInstanceScope[\s\S]{0,900}FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH'
Assert-SourceMatch 'client owns a system-tray icon' $clientForm 'new\s+NotifyIcon|NotifyIcon\s*\{'
Assert-SourceMatch 'tray icon is labeled FE Monster' $clientForm 'Text\s*=\s*"FE Monster"'
Assert-SourceMatch 'tray menu can show the main window' $clientForm 'ShowMainWindow'
Assert-SourceMatch 'tray menu can hide the main window' $clientForm 'HideMainWindow'
Assert-SourceMatch 'tray menu can exit the application' $clientForm 'trayMenu\.Items\.Add\([^\r\n]+Close\(\)'
Assert-SourceMatch 'minimize sends the client to the system tray' $clientForm 'case\s+"minimize"[\s\S]{0,120}HideMainWindow'
Assert-SourceMatch 'tray icon is removed during shutdown' $clientForm 'trayIcon\.Visible\s*=\s*false'
Assert-SourceMatch 'tray icon resources are disposed during shutdown' $clientForm 'trayIcon\.Dispose\s*\('
Assert-SourceMatch 'tray icon has a high-contrast generated glyph' $clientForm 'CreateHighContrastTrayIcon'
Assert-SourceMatch 'tray resources are disposed even outside FormClosing' $clientForm 'override\s+void\s+Dispose\s*\(\s*bool'
Assert-SourceMatch 'embedded quit routes to the native host' $webClient "'quit'[\s\S]{0,120}'exit'[\s\S]{0,120}'close'"

Assert-SourceNotMatch 'installer must not default to D drive' $installer "Test-Path\s+-LiteralPath\s+'D:\\\\'"
Assert-SourceNotMatch 'Java build must not depend on a developer D drive' $javaBuild 'D:\\java'
Assert-SourceMatch 'Java build delegates to the version-checked PowerShell builder' $javaBuild 'build-java\.ps1'
Assert-SourceMatch 'Java builder requires a complete JDK 17 or newer' $javaBuilder 'MinimumMajor\s+17'
Assert-SourceNotMatch 'production launcher must not force preview native-access flags' $clientProgram '--enable-native-access'
Assert-SourceNotMatch 'installed backend must not force preview native-access flags' $installer '--enable-native-access'
Assert-SourceMatch 'installer accepts a payload pre-extracted by the .NET setup host' $installer '\[string\]\$PayloadRoot'
Assert-SourceMatch 'installer builds the bundled Netease API plugin' $buildInstaller "music-api-plugins\\netease\\build\.ps1"
Assert-SourceMatch 'installer stages the bundled Netease API plugin' $buildInstaller 'FE-Monster-Netease-API-Plugin-4\.32\.0\.zip'
Assert-SourceMatch 'installer builds the bundled QQ API plugin' $buildInstaller "music-api-plugins\\qq\\build\.ps1"
Assert-SourceMatch 'installer stages the bundled QQ API plugin' $buildInstaller 'FE-Monster-QQ-API-Plugin-2\.4\.1\.zip'
Assert-SourceMatch 'installer writes pre-commit diagnostics outside the install root' $installer "FE Monster Setup"
Assert-SourceMatch 'installer uses a cross-process mutation lock' $installer 'Enter-InstallMutationLock'
Assert-SourceMatch 'installer verifies the installed payload manifest' $installer 'payload-integrity\.json'
Assert-SourceMatch `
  'installer snapshots release-controlled community configuration before preserving user data' `
  $installer `
  'Get-ReleaseControlledCommunityConfigurationSnapshot'
Assert-SourceMatch `
  'installer restores release-controlled community configuration after preserving user data' `
  $installer `
  'Restore-ReleaseControlledCommunityConfiguration[\s\S]{0,260}releaseCommunityConfigurationSnapshot'
foreach ($desktopPetRuntime in @(
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
  'web\pet-assistant.css',
  'web\pet-companion-p2.js',
  'web\pet-companion-p2.css',
  'web\creative-community.js',
  'web\assets\fe-monster-pet-mascot.png',
  'web\assets\fe-monster-pet-mascot-chroma.png',
  'native\windows\build\winforms\FE Monster.dll',
  'native\windows\build\winforms\FE Monster.deps.json',
  'native\windows\build\winforms\FE Monster.runtimeconfig.json'
)) {
  $desktopPetPattern = [regex]::Escape($desktopPetRuntime)
  Assert-SourceMatch "build protects required desktop-pet runtime $desktopPetRuntime" $buildInstaller $desktopPetPattern
  Assert-SourceMatch "installer verifies required desktop-pet runtime $desktopPetRuntime" $installer $desktopPetPattern
}
foreach ($releaseCriticalFile in @(
  'scripts\install-fe-monster.ps1',
  'scripts\ensure-runtime-dependencies.ps1',
  'scripts\java-runtime.ps1',
  'data\community-server-url.txt',
  'data\community-server-tls-pin.txt'
)) {
  $releaseCriticalPattern = [regex]::Escape($releaseCriticalFile)
  Assert-SourceMatch "build hashes release-critical file $releaseCriticalFile" $buildInstaller $releaseCriticalPattern
  Assert-SourceMatch "installer requires release-critical file $releaseCriticalFile" $installer $releaseCriticalPattern
}
Assert-SourceMatch 'installer records stale-process cleanup diagnostics' $installer 'stop-before-install\.log'
Assert-SourceMatch 'installer protects system and user-data roots' $installer 'Get-ProtectedInstallDirectories'
Assert-SourceMatch 'installer rejects unrelated non-empty target directories' $installer 'Test-ExistingFeMonsterInstall'
Assert-SourceMatch 'installer rechecks path boundaries without rejecting its own session log' $installer 'Assert-SafeInstallBoundary'
Assert-SourceMatch 'installer recognizes only explicitly marked retained user state' $installer '\.fe-monster-user-data'
Assert-SourceMatch 'installer direct-run space preflight includes preserved user state' $installer 'Assert-InstallDriveSpace'
Assert-SourceMatch 'installer direct-run temporary work prefers the installation drive' $installer 'function\s+New-WritableTempDirectory[\s\S]{0,180}Split-Path\s+-Parent\s+\$installPath'
Assert-SourceMatch 'installer direct-run logs can stay off a full system drive' $installer 'preferredSessionLogDirectory[\s\S]{0,800}targetStateRoot'
Assert-SourceMatch 'installer does not traverse retained-state junctions' $installer '/XJ'
Assert-SourceMatch 'installer preserves stale-process cleanup diagnostics in staged output' $installer "stageOutDir[\s\S]{0,180}stop-before-install\.log"
Assert-SourceMatch 'installer aborts when stale processes cannot be stopped' $installer '\$LASTEXITCODE\s+-ne\s+0'
Assert-SourceMatch 'installer preserves WebView2 login state across default-path upgrades' $installer "'data',\s*'WebView2',\s*'logs'"
Assert-SourceMatch 'installer preserves the public mobile access key across upgrades' $installer "'public-access\.key'"
Assert-SourceMatch 'installer preserves an existing stable machine identity' $installer 'machineFile[\s\S]{0,180}return\s+\$cached'
Assert-SourceMatch 'backend health probe uses isolated temporary user data' $installer 'FE_MONSTER_DATA_DIR\s*=\s*\$probeDataDir'
Assert-SourceMatch 'installer stages an upgrade before replacing the current version' $installer 'Staged payload'
Assert-SourceMatch 'installer can roll back a failed upgrade' $installer 'Restore-UpgradeTransaction'
Assert-SourceMatch 'installer commits core files before optional shell integration' $installer 'Complete-UpgradeTransaction[\s\S]{0,700}Register-Uninstaller'
Assert-SourceMatch 'installer treats shortcut policy failures as non-fatal after core commit' $installer 'Core installation succeeded, but one or more shortcuts could not be created'
Assert-SourceMatch 'shortcuts launch the named main executable directly' $installer 'TargetPath\s+\$mainExecutable'
Assert-SourceMatch 'post-install launch uses the named main executable' $installer 'Start-Process\s+-FilePath\s+\$mainExecutable'
Assert-SourceMatch 'uninstaller protects system and user-data roots' $uninstaller 'Get-ProtectedInstallDirectories'
Assert-SourceMatch 'uninstaller requires a recognized FE Monster installation root' $uninstaller 'Test-FeMonsterInstallRoot'
Assert-SourceMatch 'uninstaller aborts when stale processes cannot be stopped' $uninstaller '\$LASTEXITCODE\s+-ne\s+0'
Assert-SourceMatch 'uninstaller quarantines the app before deleting it' $uninstaller '\.fm-uninstall-'
Assert-SourceMatch 'uninstaller rolls back before removing external registration' $uninstaller 'Uninstall was rolled back before shortcuts or registration were removed'
Assert-SourceMatch 'uninstaller never presents a partially deleted directory as a rollback' $uninstaller 'Never rename it back after recursive deletion starts'
Assert-SourceMatch 'uninstaller preserves all user-owned runtime state when requested' $uninstaller "'data',\s*'WebView2',\s*'logs',\s*'public-access\.key'"
Assert-SourceMatch 'uninstaller marks retained user state for safe reinstallation' $uninstaller '\.fe-monster-user-data'
Assert-SourceMatch 'uninstaller shares the install mutation lock' $uninstaller 'Enter-InstallMutationLock'
Assert-SourceNotMatch 'uninstaller does not use loose command-line substring process killing' $uninstaller 'Stop-UpdateAgentProcess'
Assert-SourceMatch 'registered uninstall preserves login and device identity for reinstall' $installer '\$uninstallArgs\s*=\s*[^\r\n]+-KeepUserData'
Assert-SourceMatch 'Start menu uninstall preserves login and device identity for reinstall' $installer "Uninstall FE Monster\.lnk[\s\S]{0,500}-KeepUserData"
Assert-SourceMatch 'scheduled update agent bypasses the default Restricted execution policy' $updateAgentInstaller "New-ScheduledTaskAction[\s\S]{0,220}-ExecutionPolicy Bypass"
Assert-SourceMatch 'startup update-agent fallback bypasses the default Restricted execution policy' $updateAgentInstaller "shell\.Run[\s\S]{0,220}-ExecutionPolicy Bypass"
Assert-SourceMatch 'immediate update-agent launch bypasses the default Restricted execution policy' $updateAgentInstaller "'-ExecutionPolicy',[\s\S]{0,80}'Bypass'"
Assert-SourceMatch 'WebView2 detection uses the documented Runtime client id' $dependencies 'F3017226-FE2A-4295-8BDF-00C3A9A7E4C5'
Assert-SourceNotMatch 'WebView2 detection does not use the obsolete client id' $dependencies 'F1E7F4DF-BE0C-4A6B-AE2B-AAB7222E7D3E'
Assert-SourceMatch 'WebView2 pv is parsed as a real positive version' $dependencies '\[version\]::TryParse[\s\S]{0,180}0\.0\.0\.0'
Assert-SourceNotMatch 'WebView2 detection does not trust loose executable leftovers' $dependencies "Get-ChildItem[\s\S]{0,120}msedgewebview2\.exe"
Assert-SourceMatch 'runtime check prefers the bundled offline WebView2 installer' $dependencies 'MicrosoftEdgeWebView2RuntimeInstallerX64\.exe'
Assert-SourceMatch 'runtime check validates Microsoft Authenticode before execution' $dependencies 'Test-MicrosoftSignedExecutable'
Assert-SourceMatch 'runtime check retains the official online bootstrapper fallback' $dependencies 'LinkId=2124703'
Assert-SourceMatch 'runtime bootstrapper download retries transient failures' $dependencies 'attempt\s*=\s*1;[\s\S]{0,100}attempt\s*-le\s*3'
Assert-SourceMatch 'WebView2 reboot-required result is surfaced and rechecked' $dependencies 'ExitCode\s*-eq\s*3010[\s\S]{0,180}Runtime is already detectable'
Assert-SourceMatch 'WebView2 network failure recommends the complete offline installer' $dependencies 'FE-Monster-Setup-2\.0\.1-Offline\.exe'

Assert-SourceMatch 'launcher delegates to the named main executable' $launcher "FE Monster\.exe"
Assert-SourceNotMatch 'launcher does not directly start javaw' $launcher 'Start-Process\s+-FilePath\s+\$javaExe'
Assert-SourceMatch 'source launcher builds a missing Java backend' $launcher 'build-java\.ps1'
Assert-SourceMatch 'source launcher builds a missing Windows host' $launcher 'build-winforms-client\.ps1'
Assert-SourceMatch 'source launcher forwards client arguments through the no-console process helper' $launcher 'Invoke-NoConsoleProcess[\s\S]{0,260}-ArgumentList\s+\$ClientArgs'
Assert-SourceMatch 'stale-process cleanup recognizes the named main process' $stopper "fe monster\.exe"
Assert-SourceMatch 'stale-process cleanup recognizes legacy FE Monster install paths' $stopper 'Test-FeMonsterPath'
Assert-SourceMatch 'PowerShell cleanup parses the actual File argument' $stopper 'Get-PowerShellFileArgument'
Assert-SourceMatch 'PowerShell cleanup never treats Command text as a launch argument' $stopper "Text after -Command is script content"
Assert-SourceMatch 'stale-process cleanup recognizes active update appliers' $stopper 'apply-client-update\.ps1'
Assert-SourceMatch 'stale-process cleanup recognizes downloaded update setup hosts' $stopper 'fe-monster-setup-\*\.exe'
Assert-SourceMatch 'stale-process cleanup fails closed when a process remains' $stopper 'exit\s+2'
Assert-SourceMatch 'stale-process cleanup accepts a not-yet-created clean install target' $stopper 'GetFullPath\([\s\S]{0,120}ExpandEnvironmentVariables\(\$Root\)'
Assert-SourceNotMatch 'stale-process cleanup does not require a clean install target to exist' $stopper 'Resolve-Path\s+\$Root'

Assert-SourceMatch 'build stages a bundled Java runtime' $buildInstaller 'Stage-JavaRuntime'
Assert-SourceNotMatch 'published payload does not expose the console-only run.cmd entry' $buildInstaller "'run\.cmd'"
Assert-SourceNotMatch 'installed runtime does not require the console-only run.cmd entry' $installer 'function\s+Assert-RequiredFiles[\s\S]{0,260}''run\.cmd'''
Assert-SourceMatch 'build rejects the unsupported no-Node payload mode' $buildInstaller "NoNodeBundle[\s\S]{0,160}not supported"
Assert-SourceMatch 'external server-authored scene data is explicit opt-in' $buildInstaller 'FE_MONSTER_BUNDLED_SCENE_SERVER_ROOT'
Assert-SourceNotMatch 'build does not implicitly package an adjacent scene server' $buildInstaller 'Split-Path -Parent \$rootPath\) ''FE moster server'''
Assert-SourceMatch 'build validates embedded GLB images before dropping duplicate source textures' $buildInstaller 'Assert-GlbImagesAreEmbedded[\s\S]+embeddedStormTextures'
Assert-SourceNotMatch 'build does not copy component development sources wholesale' $buildInstaller "foreach\s*\(\$dir\s+in\s+@\('web',\s*'components'"
foreach ($runtimeComponent in @('GlassSurface.css', 'BorderGlow.css', 'BlurText.runtime.js', 'BorderGlow.runtime.js')) {
  Assert-SourceMatch "build stages runtime component asset $runtimeComponent" $buildInstaller ([regex]::Escape($runtimeComponent))
}
Assert-SourceMatch 'build removes .NET diagnostics and XML documentation from the staged client' $buildInstaller "'createdump\.exe'[\s\S]{0,260}'mscordbi\.dll'"
Assert-SourceMatch 'sidecar build emits a mode-specific bundle name consumed by setup' $buildInstaller 'setupBundleOutput\s*=\s*Join-Path\s+\$outputPath\s+"FE-Monster-Setup\$installerFlavorSuffix-Bundle\.zip"'
Assert-SourceMatch 'build stages the official offline WebView2 x64 installer' $buildInstaller 'Stage-WebView2RuntimeInstaller'
Assert-SourceMatch 'build defaults to the smaller online WebView2 installer mode' $buildInstaller "WebView2Mode\s*=\s*'Online'"
Assert-SourceMatch 'build exposes a complete offline WebView2 installer mode' $buildInstaller "ValidateSet\('Online',\s*'Offline'\)"
Assert-SourceMatch 'build downloads the WebView2 x64 standalone installer from the official link' $buildInstaller 'LinkId=2124701'
Assert-SourceMatch 'build validates the WebView2 installer Microsoft signature' $buildInstaller 'Assert-MicrosoftSignedExecutable'
Assert-SourceMatch 'payload integrity manifest hashes the WebView2 offline installer' $buildInstaller "New-PayloadIntegrityManifest[\s\S]+runtime\\installers\\MicrosoftEdgeWebView2RuntimeInstallerX64\.exe"
Assert-SourceMatch 'reused payload zip is checked against the selected WebView2 mode' $buildInstaller 'hasOfflineWebView2[\s\S]{0,500}includeOfflineWebView2'
Assert-SourceMatch 'build cleanup is isolated from installer smoke/output artifacts' $buildInstaller "out\\installer\\work"
Assert-SourceMatch 'build validates PE x64 architecture' $buildInstaller 'Get-PeMachine'
Assert-SourceMatch 'build creates a payload integrity manifest' $buildInstaller 'payload-integrity\.json'
Assert-SourceMatch 'build emits Authenticode diagnostics' $buildInstaller 'Get-AuthenticodeSignature'
Assert-SourceMatch 'build emits a distributable SHA-256 checksum' $buildInstaller '\.sha256'
Assert-SourceMatch 'build stages community configuration through an explicit policy' $buildInstaller 'function\s+Stage-CommunityServerConfiguration'
Assert-SourceMatch 'developer community configuration rejects non-HTTPS release URLs' $buildInstaller 'Developer community server URL must use HTTPS'
Assert-SourceMatch 'community configuration policy rejects loopback IP addresses' $buildInstaller 'IPAddress\]::IsLoopback'
Assert-SourceMatch 'build exposes an explicit release community server URL' $buildInstaller '\[string\]\$CommunityServerUrl\s*=\s*\$Env:FE_MONSTER_RELEASE_COMMUNITY_URL'
Assert-SourceMatch 'explicit release community URL takes priority over developer data' $buildInstaller 'function\s+Stage-CommunityServerConfiguration[\s\S]{0,260}\$CommunityServerUrl[\s\S]{0,1800}return[\s\S]{0,220}community-server-url\.txt'
Assert-SourceMatch 'explicit release community URL requires HTTPS' $buildInstaller 'Assert-PublicCommunityServerUrl[\s\S]{0,700}UriSchemeHttps'
Assert-SourceMatch 'explicit release community host addresses are resolved' $buildInstaller 'function\s+Resolve-CommunityServerAddresses[\s\S]{0,700}GetHostAddresses'
Assert-SourceMatch 'explicit release community URL rejects non-public addresses' $buildInstaller 'Test-IsPublicCommunityAddress'
Assert-SourceMatch 'explicit release community URL is health checked before staging' $buildInstaller "Assert-CommunityServerHealth[\s\S]{0,700}'/health'"
Assert-SourceMatch 'explicit release health check requires the community service identity' $buildInstaller "serviceProperty[\s\S]{0,180}'fe-monster-community'"
Assert-SourceMatch 'build exposes explicit release community TLS pins' $buildInstaller '\[string\]\$CommunityServerTlsPins\s*=\s*\$Env:FE_MONSTER_RELEASE_COMMUNITY_TLS_PINS'
Assert-SourceMatch 'explicit release TLS pins are limited to two leaf fingerprints' $buildInstaller 'Community server TLS pins must contain one or two SHA-256 leaf certificate fingerprints'
Assert-SourceMatch 'explicit release TLS pins require an explicit HTTPS URL' $buildInstaller 'CommunityServerTlsPins can only be used with an explicit HTTPS -CommunityServerUrl'
Assert-SourceMatch 'pinned health probe hashes the complete leaf certificate' $buildInstaller 'ComputeHash\(leaf\.RawData\)'
Assert-SourceMatch 'pinned health probe rejects certificates outside their validity window' $buildInstaller 'NotBefore\.ToUniversalTime\(\)[\s\S]{0,180}NotAfter\.ToUniversalTime\(\)'
Assert-SourceMatch 'pinned health probe requires an exact configured fingerprint' $buildInstaller 'allowedPins\.Contains\(fingerprint\.ToString\(\)\)'
Assert-SourceMatch 'pinned health probe still rejects hostname mismatches' $buildInstaller 'RemoteCertificateNameMismatch'
Assert-SourceNotMatch 'pinned health probe has no unconditional trust callback' $buildInstaller 'ServerCertificateValidationCallback[\s\S]{0,1800}return\s+true\s*;'
Assert-SourceMatch 'release without a pin uses the system-trusted HTTPS request path' $buildInstaller 'if\s*\(@\(\$TlsPins\)\.Count\s+-gt\s+0\)[\s\S]{0,500}else\s*\{[\s\S]{0,180}Invoke-RestMethod'
Assert-SourceMatch 'normalized public TLS pins are staged beside the community URL' $buildInstaller 'community-server-tls-pin\.txt[\s\S]{0,260}sha256:\$_'
Assert-SourceMatch 'developer HTTPS fallback reads its local TLS pin file' $buildInstaller 'communityPinFile[\s\S]{0,520}Get-Content\s+-LiteralPath\s+\$communityPinFile\s+-Raw'
Assert-SourceMatch 'developer HTTPS fallback validates service health with normalized pins' $buildInstaller 'Staged validated developer community HTTPS configuration'
Assert-SourceNotMatch 'installer build does not hard-code a machine certificate fingerprint' $buildInstaller '(?i)sha256:[0-9a-f]{64}'
Assert-SourceMatch 'explicit release settings cannot silently reuse an unvalidated payload' $buildInstaller 'Explicit community release settings cannot be combined with -ReusePayloadZip'
Assert-SourceMatch 'payload zip community configuration is validated through a dedicated policy' $buildInstaller 'function\s+Assert-PayloadZipCommunityConfiguration'
Assert-SourceMatch 'reused payload zip is checked before it can be bundled' $buildInstaller 'if\s*\(\$ReusePayloadZip\)[\s\S]{0,320}Assert-PayloadZipCommunityConfiguration\s+\$payloadZip'
Assert-SourceMatch 'every final payload zip is checked before plugin and setup validation' $buildInstaller 'Assert-PayloadZipCommunityConfiguration\s+\$payloadZip[\s\S]{0,120}Assert-PluginOnlyPayloadZip'
Assert-SourceNotMatch 'installer build does not read Sakura tunnel secret material' $buildInstaller 'SakuraFrpService|frp-(?:boy|few)\.com\.key|pet-secrets\.json'
Assert-SourceMatch 'payload staging applies the community configuration policy' $buildInstaller 'Stage-BundledSceneLibrary[\s\S]{0,160}Stage-CommunityServerConfiguration'

$communityUrlPolicyCheck = Join-Path $rootPath 'scripts\check-installer-community-url-policy.ps1'
if (!(Test-Path -LiteralPath $communityUrlPolicyCheck -PathType Leaf)) {
  $failures.Add('installer community URL policy regression check is missing') | Out-Null
} else {
  try {
    & $communityUrlPolicyCheck -Root $rootPath
  } catch {
    $failures.Add("installer community URL policy regression check failed: $($_.Exception.Message)") | Out-Null
  }
}

Assert-SourceMatch 'MSVC native targets use the static CRT' $cmake 'CMAKE_MSVC_RUNTIME_LIBRARY.*MultiThreaded'
Assert-SourceMatch 'Abseil uses the same static CRT as the native targets' $cmake 'ABSL_MSVC_STATIC_RUNTIME\s+ON'
Assert-SourceMatch 'Rust native DLL uses the static CRT' $cargoConfig 'crt-static'
Assert-SourceMatch 'Rust build loads the crate-local static-CRT config' $nativeBuild 'Push-Location\s+\(Split-Path\s+-Parent\s+\$rustManifest\)'

if (![string]::IsNullOrWhiteSpace($PayloadRoot)) {
  $payloadPath = (Resolve-Path -LiteralPath $PayloadRoot).Path
  $manifestPath = Join-Path $payloadPath 'payload-integrity.json'
  if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $failures.Add('staged payload manifest is missing') | Out-Null
  } else {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($entry in @($manifest.files)) {
      $relative = ([string]$entry.path).Replace('/', '\')
      $path = Join-Path $payloadPath $relative
      if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("staged payload file is missing: $relative") | Out-Null
        continue
      }
      $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
        $failures.Add("staged payload hash mismatch: $relative") | Out-Null
      }
      if ($entry.peMachine -and (Get-PeMachine $path) -ne [int]$entry.peMachine) {
        $failures.Add("staged payload PE architecture mismatch: $relative") | Out-Null
      }
    }
    foreach ($sourceMatchedRelative in @(
      'scripts\install-fe-monster.ps1',
      'scripts\ensure-runtime-dependencies.ps1',
      'scripts\java-runtime.ps1',
      'web\community-reward-runtime.js',
      'web\community-reward-runtime.css'
    )) {
      $sourcePath = Join-Path $rootPath $sourceMatchedRelative
      $payloadFilePath = Join-Path $payloadPath $sourceMatchedRelative
      $manifestEntry = @($manifest.files | Where-Object {
        ([string]$_.path).Replace('/', '\') -eq $sourceMatchedRelative
      }) | Select-Object -First 1
      if ($null -eq $manifestEntry) {
        $failures.Add("release-critical file is absent from payload manifest: $sourceMatchedRelative") | Out-Null
        continue
      }
      if (!(Test-Path -LiteralPath $sourcePath -PathType Leaf) -or
          !(Test-Path -LiteralPath $payloadFilePath -PathType Leaf)) {
        $failures.Add("source/payload release-critical file is missing: $sourceMatchedRelative") | Out-Null
        continue
      }
      $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
      $payloadHash = (Get-FileHash -LiteralPath $payloadFilePath -Algorithm SHA256).Hash
      if ($sourceHash -ne $payloadHash) {
        $failures.Add("source/payload hash mismatch: $sourceMatchedRelative") | Out-Null
      }
    }
  }

  $componentPath = Join-Path $payloadPath 'components'
  $expectedRuntimeComponents = @(@(
    'BorderGlow.css',
    'BorderGlow.runtime.js',
    'BlurText.runtime.js',
    'GlassSurface.css'
  ) | Sort-Object)
  $actualRuntimeComponents = if (Test-Path -LiteralPath $componentPath -PathType Container) {
    @(Get-ChildItem -LiteralPath $componentPath -Recurse -File -Force | ForEach-Object {
      $_.FullName.Substring($componentPath.Length).TrimStart('\').Replace('\', '/')
    } | Sort-Object)
  } else {
    @()
  }
  if (($actualRuntimeComponents -join '|') -ne ($expectedRuntimeComponents -join '|')) {
    $failures.Add("staged runtime component set is unexpected: $($actualRuntimeComponents -join ', ')") | Out-Null
  }

  $duplicateStormTextures = Join-Path $payloadPath 'web\bundled-assets\1dec0986-a81d-4847-af22-93d1976b5f2d\blender-output\textures'
  if (Test-Path -LiteralPath $duplicateStormTextures) {
    $failures.Add('staged payload still contains storm textures already embedded in its GLB files') | Out-Null
  }

  $stagedCommunityUrl = Join-Path $payloadPath 'data\community-server-url.txt'
  if (Test-Path -LiteralPath $stagedCommunityUrl -PathType Leaf) {
    $stagedCommunityUrlValue = Get-Content -LiteralPath $stagedCommunityUrl -Raw
    if (!(Test-DistributableCommunityUrl $stagedCommunityUrlValue)) {
      $failures.Add('staged payload contains an invalid or local-only community server URL') | Out-Null
    }
  }

  $stagedCommunityTlsPins = Join-Path $payloadPath 'data\community-server-tls-pin.txt'
  if (Test-Path -LiteralPath $stagedCommunityTlsPins -PathType Leaf) {
    [Uri]$stagedCommunityUri = $null
    $hasPinnedHttpsUrl =
      (Test-Path -LiteralPath $stagedCommunityUrl -PathType Leaf) -and
      [Uri]::TryCreate($stagedCommunityUrlValue.Trim(), [UriKind]::Absolute, [ref]$stagedCommunityUri) -and
      $stagedCommunityUri.Scheme -eq [Uri]::UriSchemeHttps
    if (!$hasPinnedHttpsUrl) {
      $failures.Add('staged public TLS pins do not have a corresponding HTTPS community URL') | Out-Null
    }

    $pinLines = @(Get-Content -LiteralPath $stagedCommunityTlsPins | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
    if ($pinLines.Count -lt 1 -or $pinLines.Count -gt 2) {
      $failures.Add('staged public TLS pin file must contain one or two fingerprints') | Out-Null
    } elseif (@($pinLines | Select-Object -Unique).Count -ne $pinLines.Count) {
      $failures.Add('staged public TLS pin file contains duplicate fingerprints') | Out-Null
    } else {
      foreach ($pinLine in $pinLines) {
        if ($pinLine -cnotmatch '^sha256:[A-F0-9]{64}$') {
          $failures.Add('staged public TLS pin file is not in normalized leaf SHA-256 format') | Out-Null
          break
        }
      }
    }
  }

  $forbiddenSecretNames = @(
    'public-access.key',
    'frp-boy.com.key',
    'frp-few.com.key',
    'pet-secrets.json',
    'frpc.ini',
    'frpc.toml',
    'frpc.yaml',
    'frpc.yml',
    'frpc.json'
  )
  $stagedSecret = Get-ChildItem -LiteralPath $payloadPath -Recurse -File -Force |
    Where-Object {
      $_.Name -in $forbiddenSecretNames -or
      $_.Name -match '(?i)^sakura.*\.(?:key|pem|pfx|p12|json|ya?ml|toml|ini)$'
    } |
    Select-Object -First 1
  if ($null -ne $stagedSecret) {
    $relativeSecretPath = $stagedSecret.FullName.Substring($payloadPath.Length).TrimStart('\')
    $failures.Add("staged payload contains tunnel/API secret material: $relativeSecretPath") | Out-Null
  }

  $stagedDataRoot = Join-Path $payloadPath 'data'
  if (Test-Path -LiteralPath $stagedDataRoot -PathType Container) {
    $stagedUserState = Get-ChildItem -LiteralPath $stagedDataRoot -Recurse -File -Force |
      Where-Object {
        $_.Name -match '(?i)(?:^community-device-credentials\.json$|^machine-id\.txt$|^client-preferences\.json$|^.+-auth\.json$|^session\.json$)' -or
        $_.FullName -match '(?i)[\\/]official-browser-login[\\/]'
      } |
      Select-Object -First 1
    if ($null -ne $stagedUserState) {
      $relativeUserStatePath = $stagedUserState.FullName.Substring($payloadPath.Length).TrimStart('\')
      $failures.Add("staged payload contains developer login or device state: $relativeUserStatePath") | Out-Null
    }
  }

  $offlineWebView2 = Join-Path $payloadPath 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
  if ($WebView2Mode -eq 'Offline' -and !(Test-Path -LiteralPath $offlineWebView2 -PathType Leaf)) {
    $failures.Add('offline staged payload is missing the WebView2 standalone runtime') | Out-Null
  }
  if ($WebView2Mode -eq 'Online' -and (Test-Path -LiteralPath $offlineWebView2 -PathType Leaf)) {
    $failures.Add('online staged payload still contains the 194 MiB WebView2 standalone runtime') | Out-Null
  }

  $winformsPath = Join-Path $payloadPath 'native\windows\build\winforms'
  foreach ($developmentFile in @(
    'createdump.exe',
    'FE Monster.pdb',
    'Microsoft.Web.WebView2.Core.xml',
    'Microsoft.Web.WebView2.WinForms.xml',
    'mscordaccore.dll',
    'mscordaccore_amd64_amd64_8.0.2826.26413.dll',
    'mscordbi.dll'
  )) {
    if (Test-Path -LiteralPath (Join-Path $winformsPath $developmentFile) -PathType Leaf) {
      $failures.Add("staged WinForms client still contains development/diagnostic file: $developmentFile") | Out-Null
    }
  }
}

if ($failures.Count -gt 0) {
  Write-Host 'Windows installer contract: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Windows installer contract: OK'
