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
$communityTlsPinFile = Join-Path $dataDir 'community-server-tls-pin.txt'

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

function ConvertTo-NormalizedCommunityTlsPins {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
  $entries = @($Value -split '[,;\r\n]+' | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
  if ($entries.Count -lt 1 -or $entries.Count -gt 2) {
    throw 'Community server TLS pins must contain one or two SHA-256 leaf certificate fingerprints.'
  }

  $normalized = New-Object System.Collections.Generic.List[string]
  foreach ($entry in $entries) {
    $candidate = $entry.Trim()
    if ($candidate.StartsWith('sha256:', [StringComparison]::OrdinalIgnoreCase)) {
      $candidate = $candidate.Substring('sha256:'.Length)
    }
    $candidate = $candidate.Replace(':', '')
    if ($candidate -notmatch '^[A-Fa-f0-9]{64}$') {
      throw 'Community server TLS pins must be SHA-256 leaf certificate fingerprints.'
    }
    $candidate = $candidate.ToUpperInvariant()
    if (!$normalized.Contains($candidate)) { $normalized.Add($candidate) }
  }
  return @($normalized)
}

function Get-CommunityTlsPins {
  if (!(Test-Path -LiteralPath $communityTlsPinFile -PathType Leaf)) { return @() }
  return @(ConvertTo-NormalizedCommunityTlsPins (Get-Content -Raw -LiteralPath $communityTlsPinFile))
}

function Initialize-PinnedCommunityRequestType {
  if ($null -ne ('FeMonsterUpdateAgent.PinnedCommunityRequest' -as [type])) { return }

  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace FeMonsterUpdateAgent {
    public static class PinnedCommunityRequest {
        public static bool ValidateCertificate(
            X509Certificate certificate,
            string[] pins,
            SslPolicyErrors errors,
            DateTime utcNow
        ) {
            HashSet<string> allowedPins = new HashSet<string>(
                pins ?? new string[0],
                StringComparer.OrdinalIgnoreCase
            );
            if (certificate == null || allowedPins.Count == 0) return false;
            if ((errors & SslPolicyErrors.RemoteCertificateNameMismatch) != 0) return false;
            if ((errors & SslPolicyErrors.RemoteCertificateNotAvailable) != 0) return false;
            using (X509Certificate2 leaf = new X509Certificate2(certificate)) {
                if (utcNow < leaf.NotBefore.ToUniversalTime() || utcNow > leaf.NotAfter.ToUniversalTime()) {
                    return false;
                }
                using (SHA256 sha256 = SHA256.Create()) {
                    byte[] digest = sha256.ComputeHash(leaf.RawData);
                    StringBuilder fingerprint = new StringBuilder(digest.Length * 2);
                    foreach (byte value in digest) fingerprint.Append(value.ToString("X2"));
                    return allowedPins.Contains(fingerprint.ToString());
                }
            }
        }

        public static string Get(string url, string[] pins, int timeoutMilliseconds) {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.AllowAutoRedirect = false;
            request.Timeout = timeoutMilliseconds;
            request.ReadWriteTimeout = timeoutMilliseconds;
            request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
            request.UserAgent = "FE-Monster-Update-Agent/2.1.1";
            request.ServerCertificateValidationCallback = delegate(
                object sender,
                X509Certificate certificate,
                X509Chain chain,
                SslPolicyErrors errors
            ) {
                return ValidateCertificate(certificate, pins, errors, DateTime.UtcNow);
            };

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {
                int statusCode = (int)response.StatusCode;
                if (statusCode < 200 || statusCode >= 300) {
                    throw new WebException("Community update endpoint returned a non-success status.");
                }
                if (response.ContentLength > 1024 * 1024) {
                    throw new WebException("Community update response exceeded the size limit.");
                }
                using (Stream stream = response.GetResponseStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8, true)) {
                    string content = reader.ReadToEnd();
                    if (content.Length > 1024 * 1024) {
                        throw new WebException("Community update response exceeded the size limit.");
                    }
                    return content;
                }
            }
        }
    }
}
'@ | Out-Null
}

function Invoke-CommunityUpdateRequest {
  param([Parameter(Mandatory)][string]$Url)

  $uri = [Uri]$Url
  if ($uri.Scheme -eq [Uri]::UriSchemeHttps) {
    $pins = @(Get-CommunityTlsPins)
    if ($pins.Count -lt 1) {
      throw 'HTTPS community update checks require a release TLS pin.'
    }
    Initialize-PinnedCommunityRequestType
    $json = [FeMonsterUpdateAgent.PinnedCommunityRequest]::Get($uri.AbsoluteUri, $pins, 8000)
    return $json | ConvertFrom-Json
  }
  return Invoke-RestMethod -Uri $uri.AbsoluteUri -TimeoutSec 8
}

function Get-InstalledVersion {
  return '2.1.1'
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
      $payload = Invoke-CommunityUpdateRequest "$server/api/update/latest?$query"
      if ($payload.updateAvailable -and $payload.release -and $payload.release.autoInstall) {
        Invoke-AutoInstall $payload.release
      }
    }
  } catch {
  }
  Start-Sleep -Seconds ([math]::Max(20, $IntervalSeconds))
}
