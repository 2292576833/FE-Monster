param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Url = '',
  [switch]$Clear
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$dataDir = Join-Path $rootPath 'data'
$configFile = Join-Path $dataDir 'community-server-url.txt'

if ($Clear) {
  if (Test-Path $configFile) { Remove-Item -LiteralPath $configFile -Force }
  Write-Host 'FE Monster community server URL was cleared. Configure a server URL before using community features.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Url)) {
  Write-Host 'Usage: powershell -File scripts\set-community-server-url.ps1 -Url http://HOST-LAN-IP:3020'
  Write-Host 'Local IPv4 addresses on this machine:'
  [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
    ForEach-Object { Write-Host ("  http://{0}:3020" -f $_.ToString()) }
  exit 0
}

$normalized = $Url.Trim().Trim([char]0xFEFF).Trim().TrimEnd('/')
$uri = [Uri]$normalized
if ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') {
  throw 'Community server URL must start with http:// or https://'
}

if ([string]::IsNullOrWhiteSpace($uri.Host)) {
  throw 'Community server URL host is missing.'
}

if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configFile, $normalized, $utf8NoBom)
Write-Host "FE Monster community server URL set to $normalized"
