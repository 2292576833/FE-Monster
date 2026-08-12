param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$IntervalSeconds = 60
)

$ErrorActionPreference = 'SilentlyContinue'
$rootPath = (Resolve-Path $Root).Path
$dataDir = Join-Path $rootPath 'data'
$machineFile = Join-Path $dataDir 'machine-id.txt'
$lastAutoInstallFile = Join-Path $dataDir 'last-auto-update-version.txt'
$progressDir = Join-Path $dataDir 'update-progress'
$communityConfigFile = Join-Path $dataDir 'community-server-url.txt'

function Get-ComputerId {
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
    $computerId = $prefix + $hash.Substring(0, 32)
    if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
    Set-Content -Encoding UTF8 -Path $machineFile -Value $computerId
    return $computerId
  } finally {
    $sha.Dispose()
  }
}

function Get-CommunityUrl {
  if (Test-Path $communityConfigFile) {
    $url = (Get-Content -Raw -LiteralPath $communityConfigFile).Trim().TrimEnd('/')
    if ($url -match '^https?://') { return $url }
  }
  if ($Env:FE_MONSTER_COMMUNITY_URL -match '^https?://') { return $Env:FE_MONSTER_COMMUNITY_URL.Trim().TrimEnd('/') }
  return ''
}

function Get-InstalledVersion {
  return '2.0.1'
}

function ConvertTo-WindowsProcessArgument {
  param([AllowEmptyString()][string]$Argument)
  if ($Argument -notmatch '[\s"]') { return $Argument }

  $builder = New-Object System.Text.StringBuilder
  [void]$builder.Append('"')
  $slashes = 0
  foreach ($character in $Argument.ToCharArray()) {
    if ($character -eq [char]92) {
      $slashes++
      continue
    }
    if ($character -eq [char]34) {
      if ($slashes -gt 0) { [void]$builder.Append(('\' * ($slashes * 2))) }
      [void]$builder.Append('\"')
      $slashes = 0
      continue
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)) }
    [void]$builder.Append($character)
    $slashes = 0
  }
  if ($slashes -gt 0) { [void]$builder.Append(('\' * ($slashes * 2))) }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Start-ArgumentSafeProcess {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $FilePath
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $argumentListProperty = $startInfo.PSObject.Properties['ArgumentList']
  if ($null -ne $argumentListProperty) {
    foreach ($argument in $Arguments) { $startInfo.ArgumentList.Add($argument) }
  } else {
    $startInfo.Arguments = (@($Arguments | ForEach-Object { ConvertTo-WindowsProcessArgument ([string]$_) }) -join ' ')
  }
  return [System.Diagnostics.Process]::Start($startInfo)
}

function Invoke-AutoInstall {
  param([object]$Release)
  $version = [string]$Release.version
  if ([string]::IsNullOrWhiteSpace($version)) { return }
  if (Test-Path $lastAutoInstallFile) {
    $last = (Get-Content -Raw -LiteralPath $lastAutoInstallFile).Trim()
    if ($last -eq $version) { return }
  }
  $url = [string]$Release.downloadUrl
  $sha256 = ([string]$Release.sha256).Trim().ToLowerInvariant()
  if ($sha256.StartsWith('sha256:')) { $sha256 = $sha256.Substring('sha256:'.Length) }
  try {
    $uri = [Uri]$url
    if (!$uri.IsAbsoluteUri -or $uri.Scheme -ne 'https') { return }
  } catch {
    return
  }
  if ($sha256 -notmatch '^[0-9a-f]{64}$') { return }
  if (!(Test-Path $progressDir)) { New-Item -ItemType Directory -Path $progressDir -Force | Out-Null }
  $progressFile = Join-Path $progressDir ('agent-' + ([guid]::NewGuid().ToString('N')) + '.json')
  $script = Join-Path $rootPath 'scripts\apply-client-update.ps1'
  if (!(Test-Path $script)) { return }
  $process = Start-ArgumentSafeProcess -FilePath 'powershell.exe' -Arguments @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    $script,
    '-Root',
    $rootPath,
    '-DownloadUrl',
    $url,
    '-Version',
    $version,
    '-Sha256',
    $sha256,
    '-ProgressFile',
    $progressFile
  ) -WorkingDirectory $rootPath
  $process.WaitForExit()
  if ($process.ExitCode -eq 0) {
    Set-Content -Encoding UTF8 -Path $lastAutoInstallFile -Value $version
  }
}

if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
$computerId = Get-ComputerId

while ($true) {
  try {
    $server = Get-CommunityUrl
    if (![string]::IsNullOrWhiteSpace($server)) {
      $query = 'computerId={0}&installedVersion={1}' -f [Uri]::EscapeDataString($computerId), [Uri]::EscapeDataString((Get-InstalledVersion))
      $payload = Invoke-RestMethod -Uri "$server/api/update/latest?$query" -TimeoutSec 8
      if ($payload.updateAvailable -and $payload.release -and $payload.release.autoInstall) {
        Invoke-AutoInstall $payload.release
      }
    }
  } catch {
  }
  Start-Sleep -Seconds ([math]::Max(20, $IntervalSeconds))
}
