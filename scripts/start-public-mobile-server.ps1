param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ServerRoot = '',
  [int]$GatewayPort = 3000,
  [int]$CommunityPort = 3020,
  [int]$PublicPort = 3099,
  [int]$DownloadPort = 3080,
  [string]$DownloadSiteRoot = (Join-Path $Root 'download-site'),
  [string]$DownloadUrl = 'https://fe-monster-download-201.affront-loony-6o.chatgpt.site/',
  [string]$DownloadTunnelUrl = 'https://www.h3ef5461b.nyat.app:57374/',
  [string]$AccessKeyFile = (Join-Path $Env:LOCALAPPDATA 'FE Monster\public-access.key')
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$outDir = Join-Path $rootPath 'out'
$jarPath = Join-Path $outDir 'fe-monster-java.jar'
$communityScript = Join-Path $PSScriptRoot 'start-community-server.ps1'
$publicProxyScript = Join-Path $PSScriptRoot 'public-mobile-proxy.js'
$downloadSiteScript = Join-Path $PSScriptRoot 'start-download-site.ps1'
$buildScript = Join-Path $rootPath 'build.cmd'

if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Test-HttpEndpoint {
  param([string]$Uri)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Resolve-JavaExecutable {
  $command = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  foreach ($candidate in @(
    'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe',
    'E:\java26\bin\java.exe'
  )) {
    if (Test-Path $candidate) { return $candidate }
  }
  return ''
}

function Resolve-NodeExecutable {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }
  foreach ($candidate in @(
    (Join-Path $rootPath 'runtime\node\node.exe'),
    'C:\Program Files\nodejs\node.exe'
  )) {
    if (Test-Path $candidate) { return $candidate }
  }
  return ''
}

function Stop-StalePublicProxy {
  param([int]$Port)

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.Name -ne 'node.exe') { continue }
    if ($process.CommandLine -notlike "*$publicProxyScript*") { continue }
    Stop-Process -Id $listener.OwningProcess -Force
    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
      Start-Sleep -Milliseconds 100
      if (!(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { break }
    }
  }
}

function Resolve-PublicAccessKey {
  $existing = if (Test-Path $AccessKeyFile) { (Get-Content -Raw $AccessKeyFile).Trim() } else { '' }
  if ($existing.Length -ge 32) { return $existing }

  $directory = Split-Path -Parent $AccessKeyFile
  if (!(Test-Path $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
  $bytes = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $created = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
  Set-Content -LiteralPath $AccessKeyFile -Value $created -Encoding ASCII -NoNewline
  return $created
}

& $communityScript `
  -Root $rootPath `
  -ServerRoot $ServerRoot `
  -Port $CommunityPort `
  -HostAddress '0.0.0.0'
if ($LASTEXITCODE -ne 0 -or !(Test-HttpEndpoint "http://127.0.0.1:$CommunityPort/health")) {
  throw "FE Monster community/sandbox service did not become ready on port $CommunityPort."
}

if (!(Test-Path $jarPath)) {
  & $buildScript
  if ($LASTEXITCODE -ne 0 -or !(Test-Path $jarPath)) {
    throw "FE Monster Java gateway build failed: $jarPath"
  }
}

if (!(Test-HttpEndpoint "http://127.0.0.1:$GatewayPort/")) {
  $java = Resolve-JavaExecutable
  if ([string]::IsNullOrWhiteSpace($java)) { throw 'Java runtime was not found.' }

  $Env:FE_MONSTER_BIND = '0.0.0.0'
  $Env:FE_MONSTER_PORT = [string]$GatewayPort
  $Env:FE_MONSTER_COMMUNITY_URL = "http://127.0.0.1:$CommunityPort"
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdout = Join-Path $outDir "public-mobile-java-$stamp.out.log"
  $stderr = Join-Path $outDir "public-mobile-java-$stamp.err.log"

  Start-Process `
    -FilePath $java `
    -ArgumentList @('-jar', "`"$jarPath`"", '--server') `
    -WorkingDirectory $rootPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-HttpEndpoint "http://127.0.0.1:$GatewayPort/") {
      $ready = $true
      break
    }
  }
  if (!$ready) { throw "FE Monster Java gateway did not become ready on port $GatewayPort." }
}

$node = Resolve-NodeExecutable
if ([string]::IsNullOrWhiteSpace($node)) { throw 'Node.js runtime was not found.' }

if (!(Test-HttpEndpoint "http://127.0.0.1:$DownloadPort/")) {
  & $downloadSiteScript -Root $rootPath -DownloadSiteRoot $DownloadSiteRoot -Port $DownloadPort
  if ($LASTEXITCODE -ne 0) { throw "FE Monster download site failed to start on port $DownloadPort." }
}

$publicAccessKey = Resolve-PublicAccessKey
if (Test-HttpEndpoint "http://127.0.0.1:$PublicPort/health") {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$PublicPort/" -MaximumRedirection 0 -TimeoutSec 3
    $currentRedirect = [string]$response.Headers.Location
  } catch {
    $currentRedirect = if ($null -ne $_.Exception.Response) {
      [string]$_.Exception.Response.Headers.Location
    } else {
      ''
    }
  }
  if ($currentRedirect -ne $DownloadUrl) { Stop-StalePublicProxy -Port $PublicPort }
}

if (!(Test-HttpEndpoint "http://127.0.0.1:$PublicPort/health")) {
  if (!(Test-Path $publicProxyScript)) { throw "Public mobile proxy was not found: $publicProxyScript" }

  $Env:FE_MONSTER_PUBLIC_ACCESS_KEY = $publicAccessKey
  $Env:FE_MONSTER_PUBLIC_PROXY_PORT = [string]$PublicPort
  $Env:FE_MONSTER_PUBLIC_UPSTREAM_PORT = [string]$GatewayPort
  # The legacy frp-boy endpoint uses SakuraFrp's self-signed certificate. If a
  # visitor elects to continue past that warning, send them to the separately
  # provisioned download tunnel whose public certificate is trusted instead of
  # making the redirect depend on a particular Cloudflare egress decision.
  $Env:FE_MONSTER_PUBLIC_DOWNLOAD_URL = $DownloadTunnelUrl
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdout = Join-Path $outDir "public-mobile-proxy-$stamp.out.log"
  $stderr = Join-Path $outDir "public-mobile-proxy-$stamp.err.log"

  Start-Process `
    -FilePath $node `
    -ArgumentList @("`"$publicProxyScript`"") `
    -WorkingDirectory $rootPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Test-HttpEndpoint "http://127.0.0.1:$PublicPort/health") {
      $ready = $true
      break
    }
  }
  if (!$ready) { throw "FE Monster public mobile proxy did not become ready on port $PublicPort." }
}

try {
  $tunnelService = Get-Service -Name 'SakuraFrpService' -ErrorAction Stop
  if ($tunnelService.Status -ne 'Running') { Start-Service -Name 'SakuraFrpService' -ErrorAction Stop }
} catch {
  Write-Warning "SakuraFrp service is not running: $($_.Exception.Message)"
}

Write-Host 'FE Monster public mobile services are ready.'
Write-Host 'Community/mobile tunnel: https://frp-boy.com:53981/community'
Write-Host "Official public download page: $DownloadUrl"
Write-Host "Trusted download tunnel: $DownloadTunnelUrl -> 127.0.0.1:$DownloadPort"
Write-Host "Protected local proxy: 127.0.0.1:$PublicPort"
