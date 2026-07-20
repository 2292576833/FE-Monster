param(
  [string]$InstallDir = (Join-Path $Env:LOCALAPPDATA 'FE Monster'),
  [switch]$NoLaunch,
  [switch]$NoShortcuts,
  [switch]$SkipSystemNodeInstall,
  [switch]$NoRegistration,
  [switch]$NoPopup
)

$ErrorActionPreference = 'Stop'
$setupRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadZip = Join-Path $setupRoot 'FE-Monster-Payload.zip'
$installPath = [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InstallDir))
$outDir = Join-Path $installPath 'out'
$installLog = Join-Path $outDir 'install.log'
$appVersion = '1.1.0'

function Write-Log {
  param([string]$Message)
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -Encoding UTF8 -Path $installLog -Value $line
}

function Resolve-FullPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Unsafe install directory: $Path"
  }
  return [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path)).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
}

function Assert-SafeInstallPath {
  param([string]$Path)
  $full = Resolve-FullPath $Path
  $root = [System.IO.Path]::GetPathRoot($full).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $windows = Resolve-FullPath ([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows))
  $system = Resolve-FullPath ([Environment]::SystemDirectory)
  if (
    [string]::IsNullOrWhiteSpace($full) -or
    [string]::Equals($full, $root, [StringComparison]::OrdinalIgnoreCase) -or
    [string]::Equals($full, $windows, [StringComparison]::OrdinalIgnoreCase) -or
    [string]::Equals($full, $system, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "Unsafe install directory: $full"
  }
  return $full
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

function Quote-Arg {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Install-WingetPackage {
  param(
    [string]$Name,
    [string]$Id
  )

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($null -eq $winget) {
    Write-Log "winget is not available; cannot install $Name automatically."
    return $false
  }

  Write-Log "Installing $Name ($Id)..."
  & $winget.Source install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
  return $LASTEXITCODE -eq 0
}

function Try-InstallSystemNode {
  if ($SkipSystemNodeInstall) { return }
  $systemNode = Find-Exe 'node.exe' @(
    (Join-Path $Env:ProgramFiles 'nodejs'),
    (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
  )
  if (![string]::IsNullOrWhiteSpace($systemNode)) {
    Write-Log "System Node.js found: $systemNode"
    return
  }

  if (Install-WingetPackage 'Node.js LTS' 'OpenJS.NodeJS.LTS') {
    Write-Log 'System Node.js installed.'
  } else {
    Write-Log 'System Node.js was not installed; bundled node.exe will be used.'
  }
}

function Get-StableInstalledComputerId {
  $dataPath = Join-Path $installPath 'data'
  $machineFile = Join-Path $dataPath 'machine-id.txt'
  $guid = ''
  try {
    $line = reg query 'HKLM\SOFTWARE\Microsoft\Cryptography' /v MachineGuid 2>$null | Select-String 'MachineGuid' | Select-Object -First 1
    if ($null -ne $line) { $guid = (($line.ToString() -split '\s+') | Select-Object -Last 1) }
  } catch {
  }

  $seed = ''
  $prefix = 'pc-'
  if (![string]::IsNullOrWhiteSpace($guid) -and $guid.Trim().ToLowerInvariant() -match '^[a-f0-9-]{16,64}$') {
    $seed = $guid.Trim().ToLowerInvariant()
    $prefix = 'win-'
  } elseif (Test-Path $machineFile) {
    $cached = (Get-Content -Raw -LiteralPath $machineFile).Trim()
    if ($cached -match '^[A-Za-z0-9_-]{16,128}$') { return $cached }
  } else {
    $seed = '{0}|{1}' -f $Env:COMPUTERNAME, $Env:USERNAME
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($seed)
    $hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    return $prefix + $hash.Substring(0, 32)
  } finally {
    $sha.Dispose()
  }
}

function Write-InstalledComputerId {
  $dataPath = Join-Path $installPath 'data'
  $machineFile = Join-Path $dataPath 'machine-id.txt'
  $computerId = Get-StableInstalledComputerId
  if ([string]::IsNullOrWhiteSpace($computerId)) { return }
  if (!(Test-Path $dataPath)) { New-Item -ItemType Directory -Path $dataPath -Force | Out-Null }
  Set-Content -Encoding UTF8 -Path $machineFile -Value $computerId
  Write-Log 'Installed computer ID is ready.'
}

function Remove-KnownAppFiles {
  param([string]$Target)

  $targetFull = Assert-SafeInstallPath $Target
  $dirs = @('web', 'scripts', 'src', 'components', 'node_modules', 'native', 'out', 'runtime', 'community-server')
  foreach ($dir in $dirs) {
    $path = [System.IO.Path]::GetFullPath((Join-Path $targetFull $dir))
    if (!$path.StartsWith($targetFull, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe delete path: $path" }
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  }

  $files = @(
    'run.cmd',
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
  )
  foreach ($file in $files) {
    $path = [System.IO.Path]::GetFullPath((Join-Path $targetFull $file))
    if (!$path.StartsWith($targetFull, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe delete path: $path" }
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
  }
}

function Copy-Payload {
  if (!(Test-Path $payloadZip)) { throw "Payload zip not found: $payloadZip" }

  $installSafe = Assert-SafeInstallPath $installPath
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('fm-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  try {
    Write-Log 'Extracting FE Monster package...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($payloadZip, $tempRoot)
    $sourceRoot = Join-Path $tempRoot 'FE Monster'
    if (!(Test-Path $sourceRoot)) { throw "Payload root not found in zip." }

    if (!(Test-Path $installSafe)) { New-Item -ItemType Directory -Path $installSafe | Out-Null }
    $stopScript = Join-Path $sourceRoot 'scripts\stop-stale-fe-monster.ps1'
    if (!(Test-Path $stopScript)) { $stopScript = Join-Path $installSafe 'scripts\stop-stale-fe-monster.ps1' }
    if (Test-Path $stopScript) {
      & powershell.exe -NoProfile -File $stopScript -Root $installSafe *> (Join-Path $outDir 'stop-before-install.log')
    }

    Remove-KnownAppFiles $installSafe
    Write-Log "Copying files to $installSafe..."
    & robocopy.exe $sourceRoot $installSafe /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
  } finally {
    try {
      if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
    } catch {
    }
  }
}

function New-Shortcut {
  param(
    [string]$Path,
    [string]$TargetPath,
    [string]$Arguments = '',
    [string]$WorkingDirectory = '',
    [string]$IconLocation = ''
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  if (![string]::IsNullOrWhiteSpace($WorkingDirectory)) { $shortcut.WorkingDirectory = $WorkingDirectory }
  if (![string]::IsNullOrWhiteSpace($IconLocation)) { $shortcut.IconLocation = $IconLocation }
  $shortcut.Save()
}

function Install-Shortcuts {
  $startMenu = Join-Path $Env:APPDATA 'Microsoft\Windows\Start Menu\Programs\FE Monster'
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $vbs = Join-Path $installPath 'FE Monster.vbs'
  $icon = Join-Path $installPath 'native\windows\build\winforms\fe-monster-client.exe'
  New-Item -ItemType Directory -Path $startMenu -Force | Out-Null

  New-Shortcut `
    -Path (Join-Path $startMenu 'FE Monster.lnk') `
    -TargetPath 'wscript.exe' `
    -Arguments ('"{0}"' -f $vbs) `
    -WorkingDirectory $installPath `
    -IconLocation $icon

  New-Shortcut `
    -Path (Join-Path $desktop 'FE Monster.lnk') `
    -TargetPath 'wscript.exe' `
    -Arguments ('"{0}"' -f $vbs) `
    -WorkingDirectory $installPath `
    -IconLocation $icon

  $uninstallScript = Join-Path $installPath 'scripts\uninstall-fe-monster.ps1'
  if (Test-Path $uninstallScript) {
    New-Shortcut `
      -Path (Join-Path $startMenu 'Uninstall FE Monster.lnk') `
      -TargetPath 'powershell.exe' `
      -Arguments ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Root "{1}"' -f $uninstallScript, $installPath) `
      -WorkingDirectory $installPath `
      -IconLocation $icon
  }
}

function Register-Uninstaller {
  $uninstallScript = Join-Path $installPath 'scripts\uninstall-fe-monster.ps1'
  if (!(Test-Path $uninstallScript)) {
    Write-Log 'Uninstaller script was not found; skipping uninstall registration.'
    return
  }

  $keyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FE Monster'
  $icon = Join-Path $installPath 'native\windows\build\winforms\fe-monster-client.exe'
  $uninstallArgs = '-NoProfile -ExecutionPolicy Bypass -File {0} -Root {1}' -f (Quote-Arg $uninstallScript), (Quote-Arg $installPath)
  $quietArgs = $uninstallArgs + ' -Quiet'

  New-Item -Path $keyPath -Force | Out-Null
  Set-ItemProperty -Path $keyPath -Name 'DisplayName' -Value 'FE Monster'
  Set-ItemProperty -Path $keyPath -Name 'DisplayVersion' -Value $appVersion
  Set-ItemProperty -Path $keyPath -Name 'Publisher' -Value 'FE Monster'
  Set-ItemProperty -Path $keyPath -Name 'DisplayIcon' -Value $icon
  Set-ItemProperty -Path $keyPath -Name 'InstallLocation' -Value $installPath
  Set-ItemProperty -Path $keyPath -Name 'UninstallString' -Value ('powershell.exe ' + $uninstallArgs)
  Set-ItemProperty -Path $keyPath -Name 'QuietUninstallString' -Value ('powershell.exe ' + $quietArgs)
  New-ItemProperty -Path $keyPath -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $keyPath -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null
  Write-Log 'Uninstaller registered.'
}

function Install-UpdateAgent {
  $script = Join-Path $installPath 'scripts\install-update-agent.ps1'
  if (!(Test-Path $script)) {
    Write-Log 'Update agent installer was not found; skipping background update agent.'
    return
  }

  Write-Log 'Registering FE Monster update agent...'
  & powershell.exe -NoProfile -File $script -Root $installPath -StartNow *> (Join-Path $outDir 'install-update-agent.log')
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Update agent registration failed. See $outDir\install-update-agent.log"
  } else {
    Write-Log 'Update agent registered.'
  }
}

function Invoke-RuntimeCheck {
  $script = Join-Path $installPath 'scripts\ensure-runtime-dependencies.ps1'
  if (!(Test-Path $script)) { throw "Missing dependency checker: $script" }

  Write-Log 'Checking and installing runtime dependencies...'
  & powershell.exe -NoProfile -File $script -Root $installPath -InstallMissing *> (Join-Path $outDir 'install-dependencies.log')
  if ($LASTEXITCODE -ne 0) {
    throw "Runtime dependency check failed. See $outDir\install-dependencies.log"
  }
}

function Assert-RequiredFiles {
  $required = @(
    'FE Monster.vbs',
    'run.cmd',
    'out\fe-monster-java.jar',
    'web\index.html',
    'scripts\launch-fe-monster.ps1',
    'scripts\uninstall-fe-monster.ps1',
    'scripts\start-ncm-api.ps1',
    'scripts\start-qq-api.ps1',
    'scripts\start-kugou-api.ps1',
    'node_modules\NeteaseCloudMusicApi',
    'node_modules\@sansenjian\qq-music-api\dist\cli.js',
    'node_modules\kugoumusicapi\app.js',
    'runtime\python\python.exe',
    'runtime\python-site-packages\cv2',
    'runtime\python-site-packages\mediapipe',
    'runtime\python-site-packages\pyautogui',
    'runtime\python-site-packages\pygrabber',
    'native\windows\build\winforms\fe-monster-client.exe',
    'native\windows\build\fe-monster-xaudio2.dll'
  )

  foreach ($relative in $required) {
    $path = Join-Path $installPath $relative
    if (!(Test-Path $path)) { throw "Installed file is missing: $relative" }
  }
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$Seconds = 15
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $request = [System.Net.HttpWebRequest]::Create($Url)
      $request.Method = 'GET'
      $request.Timeout = 3000
      $request.ReadWriteTimeout = 3000
      $response = $request.GetResponse()
      try {
        $statusCode = [int]$response.StatusCode
        if ($statusCode -ge 200 -and $statusCode -lt 500) { return $true }
      } finally {
        $response.Close()
      }
    } catch {
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Test-MusicApis {
  $services = @(
    @{ Script = 'start-ncm-api.ps1'; Port = 3010; Probe = '/login/status' },
    @{ Script = 'start-qq-api.ps1'; Port = 3011; Probe = '/getHotkey' },
    @{ Script = 'start-kugou-api.ps1'; Port = 3012; Probe = '/search/hot' }
  )

  foreach ($service in $services) {
    $script = Join-Path $installPath ('scripts\' + $service.Script)
    Write-Log ("Starting music API {0} on port {1}..." -f $service.Script, $service.Port)
    $argumentLine = @(
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-File',
      (Quote-Arg $script),
      '-Root',
      (Quote-Arg $installPath),
      '-Port',
      [string]$service.Port
    ) -join ' '
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'powershell.exe'
    $startInfo.Arguments = $argumentLine
    $startInfo.WorkingDirectory = $installPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false
    $process = [System.Diagnostics.Process]::Start($startInfo)
    if ($null -eq $process) { throw "Could not start $($service.Script)" }
    if (!$process.WaitForExit(45000)) {
      try { $process.Kill() } catch {}
      throw "Music API startup timed out: $($service.Script)"
    }
    if ($process.ExitCode -ne 0) {
      throw "Music API did not become ready: $($service.Script). See $outDir"
    }

    $url = 'http://127.0.0.1:{0}{1}' -f $service.Port, $service.Probe
    if (!(Wait-HttpOk $url 8)) { throw "Music API health check failed: $url" }
  }
}

function Get-FreeLocalPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), 0)
  $listener.Start()
  try {
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Find-InstalledJavaRuntime {
  $javaRuntimeScript = Join-Path $installPath 'scripts\java-runtime.ps1'
  if (Test-Path $javaRuntimeScript) {
    . $javaRuntimeScript
    $java = Find-JavaRuntime -Root $installPath -MinimumMajor 26 -PreferWindowless
    if (![string]::IsNullOrWhiteSpace($java)) { return $java }
  }

  $java = Find-Exe 'javaw.exe' @(
    (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
    (Join-Path $Env:ProgramFiles 'Java'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Java')
  )
  if ([string]::IsNullOrWhiteSpace($java)) {
    $java = Find-Exe 'java.exe' @(
      (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
      (Join-Path $Env:ProgramFiles 'Java'),
      (Join-Path ${Env:ProgramFiles(x86)} 'Java')
    )
  }
  return $java
}

function Test-JavaServer {
  $java = Find-InstalledJavaRuntime
  if ([string]::IsNullOrWhiteSpace($java)) { throw 'Java 26 was not found after dependency installation.' }

  $port = Get-FreeLocalPort
  $jar = Join-Path $installPath 'out\fe-monster-java.jar'
  $previous = @{
    FE_MONSTER_PORT = $Env:FE_MONSTER_PORT
    FE_NETEASE_BASE_URL = $Env:FE_NETEASE_BASE_URL
    FE_QQ_BASE_URL = $Env:FE_QQ_BASE_URL
    FE_KUGOU_BASE_URL = $Env:FE_KUGOU_BASE_URL
  }
  $Env:FE_MONSTER_PORT = [string]$port
  $Env:FE_NETEASE_BASE_URL = 'http://127.0.0.1:3010'
  $Env:FE_QQ_BASE_URL = 'http://127.0.0.1:3011'
  $Env:FE_KUGOU_BASE_URL = 'http://127.0.0.1:3012'

  $process = $null
  try {
    Write-Log "Validating Java backend on temporary port $port..."
    $javaArgs = @('--enable-native-access=ALL-UNNAMED', '-jar', (Quote-Arg $jar), '--server') -join ' '
    $process = Start-Process -FilePath $java -ArgumentList $javaArgs -WorkingDirectory $installPath -WindowStyle Hidden -PassThru
    $url = "http://127.0.0.1:$port/api/app/version"
    if (!(Wait-HttpOk $url 20)) { throw "Java backend did not answer: $url" }
    try {
      $quit = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/app/quit")
      $quit.Timeout = 2000
      $quit.GetResponse().Close()
    } catch {}
    Start-Sleep -Milliseconds 500
  } finally {
    foreach ($entry in $previous.GetEnumerator()) {
      if ($null -eq $entry.Value) { Remove-Item "Env:$($entry.Key)" -ErrorAction SilentlyContinue } else { Set-Item "Env:$($entry.Key)" $entry.Value }
    }
    if ($null -ne $process -and !$process.HasExited) {
      Stop-Process -Id $process.Id -Force
    }
  }
}

try {
  Write-Log 'FE Monster setup started.'
  Copy-Payload
  Write-InstalledComputerId
  Try-InstallSystemNode
  Invoke-RuntimeCheck
  Assert-RequiredFiles
  Test-MusicApis
  Test-JavaServer
  if (!$NoRegistration) {
    Register-Uninstaller
    if (!$NoShortcuts) {
      Install-Shortcuts
    }
    Install-UpdateAgent
  }
  Write-Log 'FE Monster setup completed.'

  if (!$NoLaunch) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f (Join-Path $installPath 'FE Monster.vbs')) -WindowStyle Hidden
    Write-Log 'FE Monster launched.'
  }
} catch {
  $message = $_.Exception.Message
  Write-Log "Setup failed: $message"
  if (!$NoPopup) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $shell.Popup("FE Monster setup failed.`n$message`nSee $installLog", 30, 'FE Monster Setup', 16) | Out-Null
    } catch {
    }
  }
  exit 1
}
