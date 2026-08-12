param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [Parameter(Mandatory = $true)]
  [string]$DownloadUrl,
  [string]$Version = 'unknown',
  [string]$Sha256 = '',
  [ValidateSet('IfPresent', 'RequireValid')]
  [string]$AuthenticodePolicy = $(if ($Env:FE_MONSTER_UPDATE_AUTHENTICODE_POLICY -eq 'RequireValid') { 'RequireValid' } else { 'IfPresent' }),
  [switch]$AllowDevelopmentInstall,
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

function Get-ValidatedHttpsUri {
  param(
    [string]$Value,
    [string]$Label = 'Update download URL'
  )
  try {
    $uri = [Uri]$Value
  } catch {
    throw "$Label is invalid"
  }
  if (!$uri.IsAbsoluteUri -or $uri.Scheme -ne 'https') {
    throw "$Label must use HTTPS"
  }
  return $uri
}

function Get-ExpectedSha256 {
  $expectedHash = $Sha256.Trim().ToLowerInvariant()
  if ($expectedHash.StartsWith('sha256:')) { $expectedHash = $expectedHash.Substring('sha256:'.Length) }
  if ([string]::IsNullOrWhiteSpace($expectedHash)) { throw 'Update SHA-256 digest is required' }
  if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'Invalid update SHA-256 digest' }
  return $expectedHash
}

function Download-WithProgress {
  param(
    [string]$Target,
    [Uri]$InitialUri,
    [string]$ExpectedSha256
  )
  Write-UpdateProgress 'downloading' 1 'Downloading update package'
  $currentUri = $InitialUri
  $response = $null
  for ($redirectCount = 0; $redirectCount -le 5; $redirectCount++) {
    $request = [System.Net.HttpWebRequest]::Create($currentUri)
    $request.Method = 'GET'
    $request.AllowAutoRedirect = $false
    $request.Timeout = 30000
    $request.ReadWriteTimeout = 30000
    $response = $request.GetResponse()
    $statusCode = [int]$response.StatusCode
    if ($statusCode -in @(301, 302, 303, 307, 308)) {
      $location = [string]$response.Headers['Location']
      $response.Close()
      $response = $null
      if ([string]::IsNullOrWhiteSpace($location)) { throw 'Update redirect did not include a destination' }
      if ($redirectCount -ge 5) { throw 'Update download exceeded the redirect limit' }
      $currentUri = Get-ValidatedHttpsUri ([Uri]::new($currentUri, $location).AbsoluteUri) 'Update redirect URL'
      continue
    }
    if ($statusCode -lt 200 -or $statusCode -ge 300) {
      $response.Close()
      $response = $null
      throw "Update download failed with HTTP status $statusCode"
    }
    break
  }
  if ($null -eq $response) { throw 'Update download did not return a package' }
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

  $actualHash = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
    throw 'Downloaded update failed SHA-256 verification'
  }
}

function Assert-InstallerAuthenticode {
  param([string]$Target)

  Write-UpdateProgress 'verifying' 90 'Verifying installer signature'
  $command = Get-Command Get-AuthenticodeSignature -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    if ($AuthenticodePolicy -eq 'RequireValid') {
      Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
      throw 'Authenticode verification is unavailable'
    }
    return
  }

  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $Target
  } catch {
    Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
    throw "Installer Authenticode verification could not run: $($_.Exception.Message)"
  }
  if ([string]$signature.Status -eq 'Valid') { return }
  if ($AuthenticodePolicy -eq 'IfPresent' -and [string]$signature.Status -eq 'NotSigned') { return }
  Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
  throw "Installer Authenticode verification failed: $($signature.Status)"
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

function Start-InstallerProcess {
  param([string]$Target)

  $arguments = @('--quiet', '-InstallDir', $rootPath)
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $Target
  $startInfo.WorkingDirectory = $updatesDir
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $argumentListProperty = $startInfo.PSObject.Properties['ArgumentList']
  if ($null -ne $argumentListProperty) {
    foreach ($argument in $arguments) { $startInfo.ArgumentList.Add($argument) }
  } else {
    $startInfo.Arguments = (@($arguments | ForEach-Object { ConvertTo-WindowsProcessArgument ([string]$_) }) -join ' ')
  }
  return [System.Diagnostics.Process]::Start($startInfo)
}

try {
  $downloadUri = Get-ValidatedHttpsUri $DownloadUrl
  $expectedHash = Get-ExpectedSha256
  if (!$AllowDevelopmentInstall -and (Test-Path -LiteralPath (Join-Path $rootPath '.git'))) {
    throw 'Refusing to execute an automatic update from a development source checkout'
  }
  if (!(Test-Path $updatesDir)) { New-Item -ItemType Directory -Path $updatesDir -Force | Out-Null }
  $fileName = Get-DownloadFileName
  $target = Join-Path $updatesDir $fileName
  Download-WithProgress $target $downloadUri $expectedHash

  $extension = [System.IO.Path]::GetExtension($target).ToLowerInvariant()
  if ($extension -ne '.exe') {
    Write-UpdateProgress 'ready' 100 "Update package downloaded: $target"
    exit 0
  }

  Assert-InstallerAuthenticode $target
  Write-UpdateProgress 'installing' 92 'Starting installer; the client may close and restart'
  $process = Start-InstallerProcess $target
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Installer exit code $($process.ExitCode)"
  }
  Write-UpdateProgress 'completed' 100 'Update completed'
} catch {
  Write-UpdateProgress 'failed' 100 ($_.Exception.Message)
  exit 1
}
