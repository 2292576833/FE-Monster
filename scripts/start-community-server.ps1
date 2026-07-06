param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ServerRoot = '',
  [int]$Port = 3020,
  [string]$HostAddress = $Env:FE_MONSTER_COMMUNITY_HOST
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$outDir = Join-Path $rootPath 'out'
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if ([string]::IsNullOrWhiteSpace($HostAddress)) { $HostAddress = '0.0.0.0' }

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

function Resolve-ServerRoot {
  if (![string]::IsNullOrWhiteSpace($ServerRoot) -and (Test-Path (Join-Path $ServerRoot 'server.js'))) {
    return (Resolve-Path $ServerRoot).Path
  }
  if (![string]::IsNullOrWhiteSpace($Env:FE_MONSTER_COMMUNITY_SERVER_DIR) -and (Test-Path (Join-Path $Env:FE_MONSTER_COMMUNITY_SERVER_DIR 'server.js'))) {
    return (Resolve-Path $Env:FE_MONSTER_COMMUNITY_SERVER_DIR).Path
  }

  $bundled = Join-Path $rootPath 'community-server'
  if (Test-Path (Join-Path $bundled 'server.js')) { return (Resolve-Path $bundled).Path }

  $sibling = Join-Path (Split-Path -Parent $rootPath) 'FE moster server'
  if (Test-Path (Join-Path $sibling 'server.js')) { return (Resolve-Path $sibling).Path }

  return ''
}

function Test-CommunityServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-IsAdmin {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Ensure-FirewallRule {
  if ($HostAddress -eq '127.0.0.1' -or $HostAddress -eq 'localhost') { return }
  if (!(Test-IsAdmin)) {
    Write-Host "FE Monster community server is listening on ${HostAddress}:$Port. Run as administrator once to auto-open Windows Firewall."
    return
  }

  try {
    $ruleName = 'FE Monster Community Server'
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
      Where-Object { $_.Enabled -eq 'True' } |
      Select-Object -First 1
    if ($null -eq $existing) {
      New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Domain,Private,Public `
        -ErrorAction SilentlyContinue | Out-Null
    } else {
      Set-NetFirewallRule -InputObject $existing -Enabled True -Action Allow -Profile Domain,Private,Public -ErrorAction SilentlyContinue | Out-Null
    }
  } catch {
  }
}

if (Test-CommunityServer) {
  Write-Host "FE Monster community server already running on port $Port."
  exit 0
}

$serverPath = Resolve-ServerRoot
if ([string]::IsNullOrWhiteSpace($serverPath)) {
  Write-Host 'FE Monster community server directory was not found.'
  exit 0
}

$node = Find-Exe 'node.exe' @(
  (Join-Path $rootPath 'runtime\node'),
  (Join-Path $Env:ProgramFiles 'nodejs'),
  (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
)

if ([string]::IsNullOrWhiteSpace($node)) {
  Write-Host 'Node.js was not found; community server was not started.'
  exit 0
}

$runLogId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$outLogFile = Join-Path $outDir "community-server-$runLogId.out.log"
$errLogFile = Join-Path $outDir "community-server-$runLogId.err.log"
$previousPort = $Env:PORT
$previousCommunityHost = $Env:FE_MONSTER_COMMUNITY_HOST
$Env:PORT = [string]$Port
$Env:FE_MONSTER_COMMUNITY_HOST = $HostAddress

Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$(Join-Path $serverPath 'server.js')`"") `
  -WorkingDirectory $serverPath `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLogFile `
  -RedirectStandardError $errLogFile | Out-Null

if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $Env:PORT = $previousPort }
if ($null -eq $previousCommunityHost) { Remove-Item Env:FE_MONSTER_COMMUNITY_HOST -ErrorAction SilentlyContinue } else { $Env:FE_MONSTER_COMMUNITY_HOST = $previousCommunityHost }

for ($i = 0; $i -lt 14; $i += 1) {
  Start-Sleep -Milliseconds 500
  if (Test-CommunityServer) {
    Ensure-FirewallRule
    Write-Host "FE Monster community server started on ${HostAddress}:$Port."
    exit 0
  }
}

Write-Host "FE Monster community server did not become ready on port $Port. See $errLogFile"
exit 1
