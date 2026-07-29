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

$buildInstaller = Read-Source 'scripts\build-installer.ps1'
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
Assert-SourceMatch 'setup accepts only explicitly marked retained user state for reinstall' $setupProgram '\.fe-monster-user-data'
Assert-SourceMatch 'setup installation-space preflight includes preserved user state' $setupProgram 'GetPreservedUserStateBytes'
Assert-SourceMatch 'setup refuses to kill an installation during the upgrade transaction' $setupProgram 'OnFormClosing[\s\S]{0,600}e\.Cancel\s*=\s*true'
Assert-SourceNotMatch 'setup does not force-kill its transactional installer' $setupProgram 'installProcess\.Kill'

Assert-SourceMatch 'client is pinned to win-x64' $clientProject '<RuntimeIdentifier>win-x64</RuntimeIdentifier>'
Assert-SourceMatch 'client is self-contained' $clientProject '<SelfContained>true</SelfContained>'
Assert-SourceMatch 'client executable is named FE Monster' $clientProject '<AssemblyName>FE Monster</AssemblyName>'
Assert-SourceMatch 'client declares a Windows compatibility manifest' $clientProject '<ApplicationManifest>app\.manifest</ApplicationManifest>'
Assert-SourceMatch 'new host isolates its WebView2 data from legacy clients' $clientForm 'WebView2"[\s\S]{0,100}"DesktopHostV2"'
Assert-SourceMatch 'client owns the Java backend child process' $clientProgram '--server'
Assert-SourceMatch 'client logs the Java child process id for CPU attribution' $clientProgram 'backend.*ProcessId|ProcessId.*backend'
Assert-SourceMatch 'client prefers an explainably named backend process' $clientProgram 'FE Monster Backend\.exe'
Assert-SourceMatch 'hidden single instance has an activation channel' $clientProgram 'UserActivationRequestName|ListenForActivation'
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
Assert-SourceMatch 'installer writes pre-commit diagnostics outside the install root' $installer "FE Monster Setup"
Assert-SourceMatch 'installer uses a cross-process mutation lock' $installer 'Enter-InstallMutationLock'
Assert-SourceMatch 'installer verifies the installed payload manifest' $installer 'payload-integrity\.json'
Assert-SourceMatch 'installer records stale-process cleanup diagnostics' $installer 'stop-before-install\.log'
Assert-SourceMatch 'installer protects system and user-data roots' $installer 'Get-ProtectedInstallDirectories'
Assert-SourceMatch 'installer rejects unrelated non-empty target directories' $installer 'Test-ExistingFeMonsterInstall'
Assert-SourceMatch 'installer rechecks path boundaries without rejecting its own session log' $installer 'Assert-SafeInstallBoundary'
Assert-SourceMatch 'installer recognizes only explicitly marked retained user state' $installer '\.fe-monster-user-data'
Assert-SourceMatch 'installer direct-run space preflight includes preserved user state' $installer 'Assert-InstallDriveSpace'
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

Assert-SourceMatch 'launcher delegates to the named main executable' $launcher "FE Monster\.exe"
Assert-SourceNotMatch 'launcher does not directly start javaw' $launcher 'Start-Process\s+-FilePath\s+\$javaExe'
Assert-SourceMatch 'source launcher builds a missing Java backend' $launcher 'build-java\.ps1'
Assert-SourceMatch 'source launcher builds a missing Windows host' $launcher 'build-winforms-client\.ps1'
Assert-SourceMatch 'stale-process cleanup recognizes the named main process' $stopper "fe monster\.exe"
Assert-SourceMatch 'stale-process cleanup recognizes legacy FE Monster install paths' $stopper 'Test-FeMonsterPath'
Assert-SourceMatch 'PowerShell cleanup parses the actual File argument' $stopper 'Get-PowerShellFileArgument'
Assert-SourceMatch 'PowerShell cleanup never treats Command text as a launch argument' $stopper "Text after -Command is script content"
Assert-SourceMatch 'stale-process cleanup recognizes active update appliers' $stopper 'apply-client-update\.ps1'
Assert-SourceMatch 'stale-process cleanup recognizes downloaded update setup hosts' $stopper 'fe-monster-setup-\*\.exe'
Assert-SourceMatch 'stale-process cleanup fails closed when a process remains' $stopper 'exit\s+2'

Assert-SourceMatch 'build stages a bundled Java runtime' $buildInstaller 'Stage-JavaRuntime'
Assert-SourceMatch 'build rejects the unsupported no-Node payload mode' $buildInstaller "NoNodeBundle[\s\S]{0,160}not supported"
Assert-SourceMatch 'external server-authored scene data is explicit opt-in' $buildInstaller 'FE_MONSTER_BUNDLED_SCENE_SERVER_ROOT'
Assert-SourceNotMatch 'build does not implicitly package an adjacent scene server' $buildInstaller 'Split-Path -Parent \$rootPath\) ''FE moster server'''
Assert-SourceMatch 'build validates embedded GLB images before dropping duplicate source textures' $buildInstaller 'Assert-GlbImagesAreEmbedded[\s\S]+embeddedStormTextures'
Assert-SourceNotMatch 'build does not copy component development sources wholesale' $buildInstaller "foreach\s*\(\$dir\s+in\s+@\('web',\s*'components'"
foreach ($runtimeComponent in @('GlassSurface.css', 'BorderGlow.css', 'BlurText.runtime.js', 'BorderGlow.runtime.js')) {
  Assert-SourceMatch "build stages runtime component asset $runtimeComponent" $buildInstaller ([regex]::Escape($runtimeComponent))
}
Assert-SourceMatch 'build removes Python type stubs and native development inputs' $buildInstaller "'\.c',\s*'\.h',\s*'\.hpp',\s*'\.lib',\s*'\.pxd',\s*'\.pyi',\s*'\.pyx'"
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

  $offlineWebView2 = Join-Path $payloadPath 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
  if ($WebView2Mode -eq 'Offline' -and !(Test-Path -LiteralPath $offlineWebView2 -PathType Leaf)) {
    $failures.Add('offline staged payload is missing the WebView2 standalone runtime') | Out-Null
  }
  if ($WebView2Mode -eq 'Online' -and (Test-Path -LiteralPath $offlineWebView2 -PathType Leaf)) {
    $failures.Add('online staged payload still contains the 194 MiB WebView2 standalone runtime') | Out-Null
  }

  $pythonPackagesPath = Join-Path $payloadPath 'runtime\python-site-packages'
  if (Test-Path -LiteralPath $pythonPackagesPath -PathType Container) {
    $developmentInput = Get-ChildItem -LiteralPath $pythonPackagesPath -Recurse -File -Force |
      Where-Object { $_.Extension -in @('.c', '.h', '.hpp', '.lib', '.pxd', '.pyi', '.pyx') } |
      Select-Object -First 1
    if ($null -ne $developmentInput) {
      $failures.Add("staged Python runtime still contains development input: $($developmentInput.FullName)") | Out-Null
    }
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
