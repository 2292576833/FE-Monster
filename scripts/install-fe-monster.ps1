param(
  [string]$InstallDir = (Join-Path $Env:LOCALAPPDATA 'FE Monster'),
  [string]$PayloadRoot = '',
  [switch]$ConsumePayloadRoot,
  [string]$LogPath = '',
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
$installedLog = Join-Path $outDir 'install.log'
$installerStateRoot = Join-Path $Env:LOCALAPPDATA 'FE Monster Setup'
$targetStateRoot = Join-Path (Split-Path -Parent $installPath) '.fe-monster-setup-state'
$preferredSessionLogDirectory = if (
  [string]::Equals(
    [System.IO.Path]::GetPathRoot($installerStateRoot),
    [System.IO.Path]::GetPathRoot($installPath),
    [StringComparison]::OrdinalIgnoreCase
  )
) {
  Join-Path $installerStateRoot 'logs'
} else {
  Join-Path $targetStateRoot 'logs'
}
$sessionLogDirectory = $preferredSessionLogDirectory
$defaultSessionLog = Join-Path $preferredSessionLogDirectory (
  'install-{0}-{1}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $PID
)
$installLog = if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $defaultSessionLog
} else {
  [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($LogPath))
}
$installPathPrefix = $installPath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if ($installLog.StartsWith($installPathPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Installer session logs must be stored outside the installation directory.'
}
$sessionLogDirectory = Split-Path -Parent $installLog
$dependencyLog = Join-Path $sessionLogDirectory ('dependencies-{0}.log' -f $PID)
$updateAgentLog = Join-Path $sessionLogDirectory ('update-agent-{0}.log' -f $PID)
$appVersion = '2.1.0'
$mainExecutable = Join-Path $installPath 'native\windows\build\winforms\FE Monster.exe'
$payloadIntegrityManifestName = 'payload-integrity.json'
$peMachineAmd64 = 0x8664
$upgradeBackupPath = ''
$newInstallActivated = $false
$sessionLogPublished = $false
$installMutationLock = $null

function Add-InstallerLogLine {
  param(
    [string]$Path,
    [string]$Line
  )

  $lastError = $null
  foreach ($attempt in 1..16) {
    $stream = $null
    $writer = $null
    try {
      $parent = Split-Path -Parent $Path
      if (!(Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }
      $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
      $stream = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Append,
        [System.IO.FileAccess]::Write,
        $share
      )
      $writer = [System.IO.StreamWriter]::new(
        $stream,
        [System.Text.UTF8Encoding]::new($false)
      )
      $writer.WriteLine($Line)
      $writer.Flush()
      return $true
    } catch [System.IO.IOException] {
      $lastError = $_.Exception
    } catch [System.UnauthorizedAccessException] {
      $lastError = $_.Exception
    } finally {
      # Closing a diagnostic stream can itself throw (for example when the
      # system drive becomes full after Flush).  Logging must never roll back
      # an otherwise valid installation transaction.
      try {
        if ($null -ne $writer) { $writer.Dispose() }
        elseif ($null -ne $stream) { $stream.Dispose() }
      } catch {
      }
    }
    Start-Sleep -Milliseconds ([Math]::Min(200, 25 * $attempt))
  }

  Write-Warning "Installer log is temporarily unavailable; setup will continue without this line. $($lastError.Message)"
  return $false
}

function Read-InstallerLogText {
  param([string]$Path)

  foreach ($attempt in 1..8) {
    $stream = $null
    $reader = $null
    try {
      if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return '' }
      $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
      $stream = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        $share
      )
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::UTF8,
        $true
      )
      return $reader.ReadToEnd()
    } catch [System.IO.IOException] {
    } catch [System.UnauthorizedAccessException] {
    } finally {
      try {
        if ($null -ne $reader) { $reader.Dispose() }
        elseif ($null -ne $stream) { $stream.Dispose() }
      } catch {
      }
    }
    Start-Sleep -Milliseconds (25 * $attempt)
  }
  return ''
}

function Write-Log {
  param([string]$Message)
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  $null = Add-InstallerLogLine -Path $installLog -Line $line
  if ($script:newInstallActivated -and $script:sessionLogPublished) {
    if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
    $null = Add-InstallerLogLine -Path $installedLog -Line $line
  }
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

function Enter-InstallMutationLock {
  param([string]$Path)

  $normalized = (Resolve-FullPath $Path).ToLowerInvariant()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalized)) |
      ForEach-Object { $_.ToString('x2') }) -join ''
  } finally {
    $sha.Dispose()
  }
  $lockName = $hash.Substring(0, 32) + '.lock'
  $installParent = Split-Path -Parent (Resolve-FullPath $Path)
  $lockDirectories = @(
    (Join-Path $Env:LOCALAPPDATA 'FE Monster Setup\Locks'),
    (Join-Path $installParent '.fe-monster-setup-locks')
  ) | Select-Object -Unique
  $lastError = $null
  foreach ($lockDirectory in $lockDirectories) {
    $stream = $null
    $lockPath = Join-Path $lockDirectory $lockName
    try {
      New-Item -ItemType Directory -Path $lockDirectory -Force | Out-Null
      $stream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
      )
      # Force a tiny real write. Opening an existing sparse/zero-length file
      # can succeed even after a volume has reached zero free bytes.
      $stream.SetLength(0)
      $probe = [System.Text.Encoding]::ASCII.GetBytes("FE Monster setup lock`n")
      $stream.Write($probe, 0, $probe.Length)
      $stream.Flush($true)
      return [pscustomobject]@{ Stream = $stream; Path = $lockPath }
    } catch {
      $lastError = $_.Exception
      if ($null -ne $stream) { try { $stream.Dispose() } catch {} }
    }
  }
  throw "Another FE Monster install, update, or uninstall is already changing $Path, or no writable setup lock directory is available. $($lastError.Message)"
}

function Exit-InstallMutationLock {
  param([object]$Lock)
  if ($null -eq $Lock) { return }
  try { $Lock.Stream.Dispose() } catch {}
  try { Remove-Item -LiteralPath $Lock.Path -Force -ErrorAction SilentlyContinue } catch {}
  try {
    $parent = Split-Path -Parent $Lock.Path
    if ((Split-Path -Leaf $parent) -eq '.fe-monster-setup-locks') {
      Remove-Item -LiteralPath $parent -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

function Test-PathSameOrAncestor {
  param(
    [string]$Candidate,
    [string]$ProtectedPath
  )

  if ([string]::IsNullOrWhiteSpace($ProtectedPath)) { return $false }
  $candidateFull = Resolve-FullPath $Candidate
  $protectedFull = Resolve-FullPath $ProtectedPath
  if ([string]::Equals($candidateFull, $protectedFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  $candidatePrefix = $candidateFull + [System.IO.Path]::DirectorySeparatorChar
  return $protectedFull.StartsWith($candidatePrefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ProtectedInstallDirectories {
  $paths = New-Object System.Collections.Generic.List[string]
  foreach ($specialFolder in @(
    [Environment+SpecialFolder]::Windows,
    [Environment+SpecialFolder]::System,
    [Environment+SpecialFolder]::ProgramFiles,
    [Environment+SpecialFolder]::ProgramFilesX86,
    [Environment+SpecialFolder]::CommonApplicationData,
    [Environment+SpecialFolder]::UserProfile,
    [Environment+SpecialFolder]::Desktop,
    [Environment+SpecialFolder]::MyDocuments,
    [Environment+SpecialFolder]::MyPictures,
    [Environment+SpecialFolder]::MyMusic,
    [Environment+SpecialFolder]::MyVideos,
    [Environment+SpecialFolder]::LocalApplicationData,
    [Environment+SpecialFolder]::ApplicationData,
    [Environment+SpecialFolder]::CommonDesktopDirectory,
    [Environment+SpecialFolder]::CommonDocuments,
    [Environment+SpecialFolder]::Programs,
    [Environment+SpecialFolder]::CommonPrograms,
    [Environment+SpecialFolder]::StartMenu,
    [Environment+SpecialFolder]::CommonStartMenu
  )) {
    $path = [Environment]::GetFolderPath($specialFolder)
    if (![string]::IsNullOrWhiteSpace($path)) { $paths.Add($path) | Out-Null }
  }

  if (![string]::IsNullOrWhiteSpace($Env:USERPROFILE)) {
    $paths.Add($Env:USERPROFILE) | Out-Null
    $paths.Add((Join-Path $Env:USERPROFILE 'Downloads')) | Out-Null
    $profileParent = Split-Path -Parent $Env:USERPROFILE
    if (![string]::IsNullOrWhiteSpace($profileParent)) { $paths.Add($profileParent) | Out-Null }
  }
  if (![string]::IsNullOrWhiteSpace($Env:OneDrive)) { $paths.Add($Env:OneDrive) | Out-Null }
  return @($paths | Select-Object -Unique)
}

function Test-ExistingFeMonsterInstall {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path -PathType Container)) { return $true }
  $firstEntry = Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop | Select-Object -First 1
  if ($null -eq $firstEntry) { return $true }

  $modernManifest = Join-Path $Path 'payload-integrity.json'
  $modernMain = Join-Path $Path 'native\windows\build\winforms\FE Monster.exe'
  if ((Test-Path -LiteralPath $modernManifest -PathType Leaf) -and
      (Test-Path -LiteralPath $modernMain -PathType Leaf)) {
    return $true
  }

  $legacyJar = Join-Path $Path 'out\fe-monster-java.jar'
  $legacyVbs = Join-Path $Path 'FE Monster.vbs'
  $legacyRun = Join-Path $Path 'run.cmd'
  if ((Test-Path -LiteralPath $legacyJar -PathType Leaf) -and
    ((Test-Path -LiteralPath $legacyVbs -PathType Leaf) -or
     (Test-Path -LiteralPath $legacyRun -PathType Leaf))) {
    return $true
  }

  $retainedMarker = Join-Path $Path '.fe-monster-user-data'
  if (!(Test-Path -LiteralPath $retainedMarker -PathType Leaf)) { return $false }
  if ((Get-Content -LiteralPath $retainedMarker -Raw).Trim() -ne 'schemaVersion=1') { return $false }
  foreach ($retainedDirectory in @('data', 'WebView2', 'logs')) {
    $retainedPath = Join-Path $Path $retainedDirectory
    if ((Test-Path -LiteralPath $retainedPath) -and
        !(Test-Path -LiteralPath $retainedPath -PathType Container)) {
      return $false
    }
  }
  $retainedKey = Join-Path $Path 'public-access.key'
  if ((Test-Path -LiteralPath $retainedKey) -and
      !(Test-Path -LiteralPath $retainedKey -PathType Leaf)) {
    return $false
  }
  $allowedRetainedEntries = @('data', 'WebView2', 'logs', 'public-access.key', '.fe-monster-user-data')
  foreach ($entry in @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop)) {
    if ($allowedRetainedEntries -notcontains $entry.Name) { return $false }
  }
  return $true
}

function Assert-SafeInstallPath {
  param([string]$Path)
  $full = Assert-SafeInstallBoundary $Path
  if (!(Test-ExistingFeMonsterInstall $full)) {
    throw "Unsafe install directory: $full already contains unrelated files. Choose an empty folder or an existing FE Monster installation."
  }
  return $full
}

function Assert-SafeInstallBoundary {
  param([string]$Path)
  $full = Resolve-FullPath $Path
  $root = [System.IO.Path]::GetPathRoot($full).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  if (
    [string]::IsNullOrWhiteSpace($full) -or
    [string]::Equals($full, $root, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "Unsafe install directory: $full"
  }
  foreach ($protectedPath in @(Get-ProtectedInstallDirectories)) {
    if (Test-PathSameOrAncestor $full $protectedPath) {
      throw "Unsafe install directory: $full is a system or user-data root. Choose a dedicated FE Monster folder."
    }
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

function Test-PayloadIntegrity {
  param(
    [string]$Root,
    [string]$Label
  )
  $manifestPath = Join-Path $Root $payloadIntegrityManifestName
  if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "$Label is missing $payloadIntegrityManifestName"
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.architecture -ne 'x64') {
    throw "$Label has an unsupported integrity manifest."
  }
  if ([int]$manifest.minimumWindowsBuild -gt [Environment]::OSVersion.Version.Build) {
    throw "$Label requires Windows build $($manifest.minimumWindowsBuild) or newer."
  }

  foreach ($entry in @($manifest.files)) {
    $relative = ([string]$entry.path).Replace('/', '\')
    $path = Join-Path $Root $relative
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "$Label is missing required file: $relative"
    }
    if ((Get-Item -LiteralPath $path).Length -ne [long]$entry.length) {
      throw "$Label file length mismatch: $relative"
    }
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne ([string]$entry.sha256).ToLowerInvariant()) {
      throw "$Label SHA-256 mismatch: $relative"
    }
    if ($null -ne $entry.peMachine -and [int]$entry.peMachine -ne 0) {
      $machine = Get-PeMachine $path
      if ($machine -ne [int]$entry.peMachine -or $machine -ne $peMachineAmd64) {
        throw "$Label contains a non-x64 PE image: $relative"
      }
    }
  }
  return $manifest
}

function Get-RetainedUserStateBytes {
  param([string]$Root)

  [long]$total = 0
  foreach ($relative in @('data', 'WebView2', 'logs')) {
    $directory = Join-Path $Root $relative
    if (!(Test-Path -LiteralPath $directory -PathType Container)) { continue }
    $pending = New-Object System.Collections.Generic.Stack[string]
    $pending.Push($directory)
    while ($pending.Count -gt 0) {
      $current = $pending.Pop()
      foreach ($entry in @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop)) {
        if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        if ($entry.PSIsContainer) {
          $pending.Push($entry.FullName)
        } else {
          $total += [long]$entry.Length
        }
      }
    }
  }
  $publicAccessKey = Join-Path $Root 'public-access.key'
  if (Test-Path -LiteralPath $publicAccessKey -PathType Leaf) {
    $total += [long](Get-Item -LiteralPath $publicAccessKey).Length
  }
  return $total
}

function Assert-InstallDriveSpace {
  param(
    [string]$Root,
    [long]$PayloadBytes
  )

  [long]$retainedBytes = Get-RetainedUserStateBytes $Root
  [long]$requiredBytes = $PayloadBytes + $retainedBytes + 256L * 1024L * 1024L
  $driveRoot = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Root))
  $drive = [System.IO.DriveInfo]::new($driveRoot)
  if ($drive.IsReady -and $drive.AvailableFreeSpace -lt $requiredBytes) {
    throw (
      'Not enough installation disk space on {0}. Required for payload, preserved user data, and safety margin: {1:N0} MiB; available: {2:N0} MiB.' -f
        $driveRoot,
        ($requiredBytes / 1MB),
        ($drive.AvailableFreeSpace / 1MB)
    )
  }
}

function New-WritableTempDirectory {
  $bases = @(
    (Split-Path -Parent $installPath),
    [System.IO.Path]::GetTempPath(),
    (Join-Path $Env:LOCALAPPDATA 'FE Monster Setup\Temp')
  ) | Select-Object -Unique
  foreach ($base in $bases) {
    if ([string]::IsNullOrWhiteSpace($base)) { continue }
    try {
      New-Item -ItemType Directory -Path $base -Force | Out-Null
      $candidate = Join-Path $base ('fm-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
      New-Item -ItemType Directory -Path $candidate -ErrorAction Stop | Out-Null
      $probe = Join-Path $candidate 'write.test'
      [System.IO.File]::WriteAllText($probe, 'ok')
      Remove-Item -LiteralPath $probe -Force
      return $candidate
    } catch {
    }
  }
  throw 'No writable temporary directory is available for FE Monster setup.'
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
  if (Test-Path -LiteralPath $machineFile -PathType Leaf) {
    $cached = (Get-Content -Raw -LiteralPath $machineFile).Trim()
    if ($cached -match '^[A-Za-z0-9_-]{16,128}$') { return $cached }
  }

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
  if ((Test-Path -LiteralPath $machineFile -PathType Leaf) -and
      (Get-Content -Raw -LiteralPath $machineFile).Trim() -eq $computerId) {
    Write-Log 'Installed computer ID is ready.'
    return
  }
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

function Test-CanAtomicallyConsumePayload {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$InstallTarget
  )

  if (!$ConsumePayloadRoot -or [string]::IsNullOrWhiteSpace($PayloadRoot)) { return $false }
  if (!(Test-Path -LiteralPath $Source -PathType Container) -or
      (Test-Path -LiteralPath $Destination)) {
    return $false
  }

  $sourceFull = Resolve-FullPath $Source
  $destinationFull = Resolve-FullPath $Destination
  $installFull = Resolve-FullPath $InstallTarget
  if ((Test-PathSameOrAncestor $sourceFull $destinationFull) -or
      (Test-PathSameOrAncestor $destinationFull $sourceFull) -or
      (Test-PathSameOrAncestor $sourceFull $installFull) -or
      (Test-PathSameOrAncestor $installFull $sourceFull)) {
    return $false
  }

  $sourceInfo = Get-Item -LiteralPath $sourceFull -Force
  if (($sourceInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    return $false
  }

  $sourceVolume = [System.IO.Path]::GetPathRoot($sourceFull)
  $destinationVolume = [System.IO.Path]::GetPathRoot($destinationFull)
  return [string]::Equals($sourceVolume, $destinationVolume, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ReleaseControlledCommunityConfigurationSnapshot {
  param([string]$StagedRoot)

  $snapshot = @()
  foreach ($name in @('community-server-url.txt', 'community-server-tls-pin.txt')) {
    $path = Join-Path $StagedRoot (Join-Path 'data' $name)
    $present = Test-Path -LiteralPath $path -PathType Leaf
    $snapshot += [pscustomobject]@{
      Name = $name
      Present = $present
      Bytes = if ($present) { [IO.File]::ReadAllBytes($path) } else { [byte[]]@() }
    }
  }
  return @($snapshot)
}

function Restore-ReleaseControlledCommunityConfiguration {
  param(
    [string]$StagedRoot,
    [object[]]$Snapshot
  )

  $stagedDataRoot = Join-Path $StagedRoot 'data'
  New-Item -ItemType Directory -Path $stagedDataRoot -Force | Out-Null
  foreach ($entry in @($Snapshot)) {
    $target = Join-Path $stagedDataRoot ([string]$entry.Name)
    if ([bool]$entry.Present) {
      [IO.File]::WriteAllBytes($target, [byte[]]$entry.Bytes)
    } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
      Remove-Item -LiteralPath $target -Force
    }
  }
}

function Copy-Payload {
  $installSafe = Assert-SafeInstallBoundary $installPath
  $tempRoot = ''
  $sourceRoot = ''
  $installParent = Split-Path -Parent $installSafe
  $stageRoot = Join-Path $installParent ('.fm-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  try {
    if (![string]::IsNullOrWhiteSpace($PayloadRoot)) {
      $sourceRoot = [System.IO.Path]::GetFullPath($PayloadRoot)
      if (!(Test-Path -LiteralPath $sourceRoot -PathType Container)) {
        throw "Pre-extracted payload root was not found: $sourceRoot"
      }
    } else {
      if (!(Test-Path $payloadZip)) { throw "Payload zip not found: $payloadZip" }
      $tempRoot = New-WritableTempDirectory
      Write-Log 'Extracting FE Monster package...'
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.ZipFile]::ExtractToDirectory($payloadZip, $tempRoot)
      $sourceRoot = Join-Path $tempRoot 'FE Monster'
      if (!(Test-Path $sourceRoot)) { throw 'Payload root not found in zip.' }
    }

    $payloadManifest = Test-PayloadIntegrity $sourceRoot 'Installer payload'
    Assert-InstallDriveSpace $installSafe ([long]$payloadManifest.requiredInstallBytes)
    if (Test-Path -LiteralPath $stageRoot) {
      Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
    Write-Log "Staging files under $stageRoot..."
    $movedToStage = $false
    if (Test-CanAtomicallyConsumePayload $sourceRoot $stageRoot $installSafe) {
      try {
        [System.IO.Directory]::Move($sourceRoot, $stageRoot)
        $sourceRoot = $stageRoot
        $movedToStage = $true
        Write-Log 'Promoted verified Setup-owned payload to the transaction stage without copying.'
      } catch {
        Write-Log "Atomic payload promotion was unavailable; falling back to robocopy: $($_.Exception.Message)"
      }
    }
    if (!$movedToStage) {
      New-Item -ItemType Directory -Path $stageRoot | Out-Null
      & robocopy.exe $sourceRoot $stageRoot /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -gt 7) { throw "staging robocopy failed with exit code $LASTEXITCODE" }
      Test-PayloadIntegrity $stageRoot 'Staged payload' | Out-Null
    }
    $releaseCommunityConfigurationSnapshot = @(
      Get-ReleaseControlledCommunityConfigurationSnapshot -StagedRoot $stageRoot
    )

    $stageOutDir = Join-Path $stageRoot 'out'
    New-Item -ItemType Directory -Path $stageOutDir -Force | Out-Null
    $stagedStopLog = Join-Path $stageOutDir 'stop-before-install.log'
    $stopScript = Join-Path $sourceRoot 'scripts\stop-stale-fe-monster.ps1'
    if (!(Test-Path $stopScript)) { $stopScript = Join-Path $installSafe 'scripts\stop-stale-fe-monster.ps1' }
    if (Test-Path $stopScript) {
      & powershell.exe -NoProfile -File $stopScript -Root $installSafe *> $stagedStopLog
      if ($LASTEXITCODE -ne 0) {
        $failureLog = Join-Path $sessionLogDirectory 'stop-before-install.log'
        New-Item -ItemType Directory -Path $sessionLogDirectory -Force | Out-Null
        Copy-Item -LiteralPath $stagedStopLog -Destination $failureLog -Force -ErrorAction SilentlyContinue
        throw "An existing FE Monster process is still using the installation. Close it and retry. See $failureLog"
      }
    }

    foreach ($userDirectory in @('data', 'WebView2', 'logs')) {
      $existingUserDirectory = Join-Path $installSafe $userDirectory
      if (!(Test-Path -LiteralPath $existingUserDirectory -PathType Container)) { continue }
      Write-Log "Preserving existing $userDirectory user data in the staged installation..."
      & robocopy.exe `
        $existingUserDirectory `
        (Join-Path $stageRoot $userDirectory) `
        /E /XJ /R:2 /W:1 /NFL /NDL /NJH /NJS /NP |
        Out-Null
      if ($LASTEXITCODE -gt 7) {
        throw "$userDirectory user-data robocopy failed with exit code $LASTEXITCODE"
      }
    }
    foreach ($userFile in @('public-access.key')) {
      $existingUserFile = Join-Path $installSafe $userFile
      if (Test-Path -LiteralPath $existingUserFile -PathType Leaf) {
        Copy-Item -LiteralPath $existingUserFile -Destination (Join-Path $stageRoot $userFile) -Force
      }
    }
    Restore-ReleaseControlledCommunityConfiguration `
      -StagedRoot $stageRoot `
      -Snapshot $releaseCommunityConfigurationSnapshot
    Write-Log 'Restored release-controlled community URL and TLS pin after preserving user data.'

    $stagedInstallLog = Join-Path $stageOutDir 'install.log'
    if (Test-Path -LiteralPath $installedLog -PathType Leaf) {
      Copy-Item -LiteralPath $installedLog -Destination $stagedInstallLog -Force
    }
    if (Test-Path -LiteralPath $installLog -PathType Leaf) {
      $sessionText = Read-InstallerLogText -Path $installLog
      if (![string]::IsNullOrWhiteSpace($sessionText)) {
        $null = Add-InstallerLogLine `
          -Path $stagedInstallLog `
          -Line $sessionText.TrimEnd("`r", "`n")
      }
    }
    $script:sessionLogPublished = $true

    if (Test-Path -LiteralPath $installSafe) {
      $script:upgradeBackupPath = Join-Path $installParent ('.fm-backup-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
      Move-Item -LiteralPath $installSafe -Destination $script:upgradeBackupPath -ErrorAction Stop
    }
    try {
      Move-Item -LiteralPath $stageRoot -Destination $installSafe -ErrorAction Stop
      $script:newInstallActivated = $true
    } catch {
      if (![string]::IsNullOrWhiteSpace($script:upgradeBackupPath) -and
          (Test-Path -LiteralPath $script:upgradeBackupPath) -and
          !(Test-Path -LiteralPath $installSafe)) {
        Move-Item -LiteralPath $script:upgradeBackupPath -Destination $installSafe -ErrorAction SilentlyContinue
        $script:upgradeBackupPath = ''
      }
      throw
    }

    Write-Log "Activated staged files at $installSafe."
    Test-PayloadIntegrity $installSafe 'Installed payload' | Out-Null
  } finally {
    try {
      if (![string]::IsNullOrWhiteSpace($tempRoot) -and (Test-Path $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
    try {
      if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
  }
}

function Complete-UpgradeTransaction {
  if ([string]::IsNullOrWhiteSpace($script:upgradeBackupPath)) { return }
  $backupToDelete = $script:upgradeBackupPath
  $script:upgradeBackupPath = ''
  $script:newInstallActivated = $false
  try {
    if (Test-Path -LiteralPath $backupToDelete) {
      Remove-Item -LiteralPath $backupToDelete -Recurse -Force -ErrorAction Stop
    }
  } catch {
    Write-Log "Installation succeeded, but the previous-version backup could not be removed: $backupToDelete"
  }
}

function Restore-UpgradeTransaction {
  if (!$script:newInstallActivated -or [string]::IsNullOrWhiteSpace($script:upgradeBackupPath)) { return }
  try {
    $stopScript = Join-Path $installPath 'scripts\stop-stale-fe-monster.ps1'
    if (Test-Path -LiteralPath $stopScript -PathType Leaf) {
      & powershell.exe -NoProfile -File $stopScript -Root $installPath *> $null
    }
    if (Test-Path -LiteralPath $installPath) {
      Remove-Item -LiteralPath $installPath -Recurse -Force
    }
    Move-Item -LiteralPath $script:upgradeBackupPath -Destination $installPath -Force
    $script:upgradeBackupPath = ''
    $script:newInstallActivated = $false
  } catch {
    try {
      $recoveryLog = Join-Path $Env:LOCALAPPDATA 'FE Monster Setup\logs\installer-recovery.log'
      New-Item -ItemType Directory -Path (Split-Path -Parent $recoveryLog) -Force | Out-Null
      Add-Content -LiteralPath $recoveryLog -Encoding UTF8 -Value (
        "[{0}] Automatic rollback failed. New={1}; backup={2}; error={3}" -f
          (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),
          $installPath,
          $script:upgradeBackupPath,
          $_.Exception.Message
      )
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
  $icon = $mainExecutable
  New-Item -ItemType Directory -Path $startMenu -Force | Out-Null

  New-Shortcut `
    -Path (Join-Path $startMenu 'FE Monster.lnk') `
    -TargetPath $mainExecutable `
    -WorkingDirectory $installPath `
    -IconLocation $icon

  New-Shortcut `
    -Path (Join-Path $desktop 'FE Monster.lnk') `
    -TargetPath $mainExecutable `
    -WorkingDirectory $installPath `
    -IconLocation $icon

  $uninstallScript = Join-Path $installPath 'scripts\uninstall-fe-monster.ps1'
  if (Test-Path $uninstallScript) {
    New-Shortcut `
      -Path (Join-Path $startMenu 'Uninstall FE Monster.lnk') `
      -TargetPath 'powershell.exe' `
      -Arguments ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Root "{1}" -KeepUserData' -f $uninstallScript, $installPath) `
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
  $icon = $mainExecutable
  $uninstallArgs = '-NoProfile -ExecutionPolicy Bypass -File {0} -Root {1} -KeepUserData' -f (Quote-Arg $uninstallScript), (Quote-Arg $installPath)
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
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Root $installPath -StartNow *> $updateAgentLog
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Update agent registration failed. See $updateAgentLog"
  } else {
    Write-Log 'Update agent registered.'
  }
}

function Invoke-RuntimeCheck {
  $script = Join-Path $installPath 'scripts\ensure-runtime-dependencies.ps1'
  if (!(Test-Path $script)) { throw "Missing dependency checker: $script" }

  Write-Log 'Checking and installing runtime dependencies...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Root $installPath -InstallMissing *> $dependencyLog
  if ($LASTEXITCODE -ne 0) {
    $dependencyTail = if (Test-Path -LiteralPath $dependencyLog -PathType Leaf) {
      @(Get-Content -LiteralPath $dependencyLog -ErrorAction SilentlyContinue |
        Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } |
        Select-Object -Last 12)
    } else {
      @()
    }
    foreach ($line in $dependencyTail) {
      $safeLine = ([string]$line).Trim()
      if ($safeLine.Length -gt 800) { $safeLine = $safeLine.Substring(0, 800) + '...' }
      Write-Log "Dependency detail: $safeLine"
    }
    $summary = @($dependencyTail | Where-Object {
      [string]$_ -match '(?i)missing|failed|not detectable|unavailable'
    }) | Select-Object -Last 1
    if ($null -ne $summary) {
      throw "Runtime dependency check failed: $(([string]$summary).Trim()). See $dependencyLog"
    }
    throw "Runtime dependency check failed. See $dependencyLog"
  }
}

function Assert-RequiredFiles {
  $required = @(
    'FE Monster.vbs',
    'out\fe-monster-java.jar',
    'web\index.html',
    'web\cache-fingerprints.json',
    'web\app.js',
    'web\styles.css',
    'web\lyric-render-quality.css',
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
    'web\pet-particle-orb.js',
    'web\pet-assistant.css',
    'web\pet-companion-p2.js',
    'web\pet-companion-p2.css',
    'web\creative-community.js',
    'web\assets\fe-monster-pet-mascot.png',
    'web\assets\fe-monster-pet-mascot-chroma.png',
    'scripts\launch-fe-monster.ps1',
    'scripts\uninstall-fe-monster.ps1',
    'scripts\install-fe-monster.ps1',
    'scripts\ensure-runtime-dependencies.ps1',
    'scripts\java-runtime.ps1',
    'data\community-server-url.txt',
    'data\community-server-tls-pin.txt',
    'runtime\java\bin\java.exe',
    'runtime\java\bin\javaw.exe',
    'runtime\java\bin\FE Monster Backend.exe',
    'runtime\node\node.exe',
    'native\windows\build\winforms\FE Monster.exe',
    'native\windows\build\winforms\FE Monster.dll',
    'native\windows\build\winforms\FE Monster.deps.json',
    'native\windows\build\winforms\FE Monster.runtimeconfig.json',
    'native\windows\build\winforms\WebView2Loader.dll',
    'native\windows\build\fe-monster-xaudio2.dll',
    'native\windows\build\fe_monster_upmix.dll',
    'payload-integrity.json'
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
    $java = Find-JavaRuntime -Root $installPath -MinimumMajor 17 -PreferWindowless
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
  if ([string]::IsNullOrWhiteSpace($java)) { throw 'Bundled Java 17+ was not found after installation.' }

  $port = Get-FreeLocalPort
  $jar = Join-Path $installPath 'out\fe-monster-java.jar'
  $probeRoot = New-WritableTempDirectory
  $probeDataDir = Join-Path $probeRoot 'data'
  New-Item -ItemType Directory -Path $probeDataDir -Force | Out-Null
  $previous = @{
    FE_MONSTER_PORT = $Env:FE_MONSTER_PORT
    FE_MUSIC_API_AUTOSTART = $Env:FE_MUSIC_API_AUTOSTART
    FE_MONSTER_DATA_DIR = $Env:FE_MONSTER_DATA_DIR
  }
  $Env:FE_MONSTER_PORT = [string]$port
  $Env:FE_MUSIC_API_AUTOSTART = '0'
  $Env:FE_MONSTER_DATA_DIR = $probeDataDir

  $process = $null
  try {
    Write-Log "Validating Java backend on temporary port $port..."
    $javaArgs = @('-jar', (Quote-Arg $jar), '--server') -join ' '
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $java
    $startInfo.Arguments = $javaArgs
    $startInfo.WorkingDirectory = $installPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    if ($null -eq $process) { throw 'Java backend validation process could not be created.' }
    $url = "http://127.0.0.1:$port/api/app/version"
    if (!(Wait-HttpOk $url 20)) {
      if (!$process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(2000)
      }
      $backendError = $process.StandardError.ReadToEnd().Trim()
      if (![string]::IsNullOrWhiteSpace($backendError)) {
        Write-Log "Java backend validation stderr: $backendError"
      }
      throw "Java backend did not answer: $url"
    }
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
    if ($null -ne $process) { $process.Dispose() }
    if (Test-Path -LiteralPath $probeRoot -PathType Container) {
      Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  $installPath = Assert-SafeInstallPath $installPath
  $installMutationLock = Enter-InstallMutationLock $installPath
  Write-Log 'FE Monster setup started.'
  Copy-Payload
  Write-InstalledComputerId
  Invoke-RuntimeCheck
  Assert-RequiredFiles
  Test-JavaServer
  Complete-UpgradeTransaction
  Write-Log 'FE Monster core installation completed.'

  if (!$NoRegistration) {
    try {
      Register-Uninstaller
    } catch {
      Write-Log "Core installation succeeded, but uninstall registration failed: $($_.Exception.Message)"
    }
    if (!$NoShortcuts) {
      try {
        Install-Shortcuts
      } catch {
        Write-Log "Core installation succeeded, but one or more shortcuts could not be created: $($_.Exception.Message)"
      }
    }
    try {
      Install-UpdateAgent
    } catch {
      Write-Log "Core installation succeeded, but the update agent could not be registered: $($_.Exception.Message)"
    }
  }
  Write-Log 'FE Monster setup completed.'

  if (!$NoLaunch) {
    try {
      Start-Process -FilePath $mainExecutable -WorkingDirectory $installPath
      Write-Log 'FE Monster launched.'
    } catch {
      Write-Log "Installation succeeded, but FE Monster could not be launched automatically: $($_.Exception.Message)"
    }
  }
} catch {
  $message = $_.Exception.Message
  Restore-UpgradeTransaction
  Write-Log "Setup failed: $message"
  if (!$NoPopup) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $shell.Popup("FE Monster setup failed.`n$message`nSee $installLog", 30, 'FE Monster Setup', 16) | Out-Null
    } catch {
    }
  }
  exit 1
} finally {
  Exit-InstallMutationLock $installMutationLock
}
