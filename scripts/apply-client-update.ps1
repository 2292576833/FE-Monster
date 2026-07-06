param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [Parameter(Mandatory = $true)]
  [string]$DownloadUrl,
  [string]$Version = 'unknown',
  [Parameter(Mandatory = $true)]
  [string]$ProgressFile
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$progressPath = [System.IO.Path]::GetFullPath($ProgressFile)
$updatesDir = Join-Path $rootPath 'data\updates'

function Write-UpdateProgress {
  param(
    [string]$Status,
    [int]$Percent,
    [string]$Message
  )
  $parent = Split-Path -Parent $progressPath
  if (!(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [pscustomobject]@{
    ok = $true
    status = $Status
    percent = [math]::Max(0, [math]::Min(100, $Percent))
    message = $Message
    version = $Version
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 -Path $progressPath
}

function Get-DownloadFileName {
  try {
    $uri = [Uri]$DownloadUrl
    $name = [System.IO.Path]::GetFileName($uri.LocalPath)
    if (![string]::IsNullOrWhiteSpace($name)) { return $name }
  } catch {
  }
  return ('FE-Monster-Update-{0}.exe' -f ($Version -replace '[^A-Za-z0-9._-]', '_'))
}

function Download-WithProgress {
  param([string]$Target)
  Write-UpdateProgress 'downloading' 1 'Downloading update package'
  $request = [System.Net.HttpWebRequest]::Create($DownloadUrl)
  $request.Method = 'GET'
  $request.Timeout = 30000
  $response = $request.GetResponse()
  try {
    $total = [int64]$response.ContentLength
    $input = $response.GetResponseStream()
    $output = [System.IO.File]::Create($Target)
    try {
      $buffer = New-Object byte[] (1024 * 256)
      $readTotal = [int64]0
      while ($true) {
        $read = $input.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { break }
        $output.Write($buffer, 0, $read)
        $readTotal += $read
        if ($total -gt 0) {
          $percent = [int][math]::Min(89, [math]::Floor(($readTotal * 90.0) / $total))
          Write-UpdateProgress 'downloading' $percent ('Downloaded {0:N1} MB / {1:N1} MB' -f ($readTotal / 1MB), ($total / 1MB))
        }
      }
    } finally {
      $output.Dispose()
      if ($null -ne $input) { $input.Dispose() }
    }
  } finally {
    $response.Close()
  }
}

try {
  if (!(Test-Path $updatesDir)) { New-Item -ItemType Directory -Path $updatesDir -Force | Out-Null }
  $fileName = Get-DownloadFileName
  $target = Join-Path $updatesDir $fileName
  Download-WithProgress $target

  $extension = [System.IO.Path]::GetExtension($target).ToLowerInvariant()
  if ($extension -ne '.exe') {
    Write-UpdateProgress 'ready' 100 "Update package downloaded: $target"
    exit 0
  }

  Write-UpdateProgress 'installing' 92 'Starting installer; the client may close and restart'
  $args = @('--quiet', '-InstallDir', $rootPath)
  $process = Start-Process -FilePath $target -ArgumentList $args -WorkingDirectory $updatesDir -PassThru -WindowStyle Hidden
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Installer exit code $($process.ExitCode)"
  }
  Write-UpdateProgress 'completed' 100 'Update completed'
} catch {
  Write-UpdateProgress 'failed' 100 ($_.Exception.Message)
  exit 1
}
