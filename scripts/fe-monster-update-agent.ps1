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
  return '1.0.1-java26'
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
  if ($url -notmatch '^https?://') { return }
  if (!(Test-Path $progressDir)) { New-Item -ItemType Directory -Path $progressDir -Force | Out-Null }
  $progressFile = Join-Path $progressDir ('agent-' + ([guid]::NewGuid().ToString('N')) + '.json')
  $script = Join-Path $rootPath 'scripts\apply-client-update.ps1'
  if (!(Test-Path $script)) { return }
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
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
    '-ProgressFile',
    $progressFile
  ) -WorkingDirectory $rootPath -WindowStyle Hidden -PassThru
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
