param(
  [int]$Port = 3000,
  [string]$Bind = '0.0.0.0',
  [string]$ServerRoot = '',
  [int]$CommunityPort = 3020,
  [string]$CommunityBind = '0.0.0.0',
  [string]$CodexModel = $Env:FE_SANDBOX_CODEX_MODEL,
  [string]$SandboxApiKey = $Env:FE_SANDBOX_API_KEY,
  [string]$BlenderPath = $Env:FE_BLENDER_PATH
)

$ErrorActionPreference = 'Stop'
$rootPath = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $rootPath 'build.cmd'
$jarPath = Join-Path $rootPath 'out\fe-monster-java.jar'
$communityScript = Join-Path $PSScriptRoot 'start-community-server.ps1'

function Set-OptionalEnvironmentValue {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
    return
  }
  Set-Item "Env:$Name" $Value.Trim()
}

function Test-CommunityHealth {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$CommunityPort/health" `
      -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
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

function Ensure-AndroidFirewallRule {
  if ($Bind -eq '127.0.0.1' -or $Bind -eq 'localhost' -or $Bind -eq '::1') { return }
  if (!(Test-IsAdmin)) {
    Write-Warning "Java is listening on ${Bind}:$Port. Run this script as administrator once to auto-open Windows Firewall for phones on the LAN."
    return
  }

  try {
    $ruleName = "FE Monster Android Server $Port"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($null -eq $existing) {
      New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Domain,Private,Public `
        -ErrorAction Stop | Out-Null
    } else {
      Set-NetFirewallRule `
        -InputObject $existing `
        -Enabled True `
        -Action Allow `
        -Profile Domain,Private,Public `
        -ErrorAction Stop | Out-Null
    }
  } catch {
    Write-Warning "Could not configure Windows Firewall for port ${Port}: $($_.Exception.Message)"
  }
}

function Get-LanIpv4Addresses {
  try {
    $physicalInterfaceIndexes = @(
      Get-NetAdapter -Physical -ErrorAction Stop |
        Where-Object { $_.Status -eq 'Up' } |
        Select-Object -ExpandProperty ifIndex
    )
    $addresses = @(
      Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object {
          $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
          $_.AddressState -ne 'Duplicate' -and
          $_.AddressState -ne 'Tentative'
        }
    )
    if ($physicalInterfaceIndexes.Count -gt 0) {
      $physicalAddresses = @($addresses | Where-Object { $physicalInterfaceIndexes -contains $_.InterfaceIndex })
      if ($physicalAddresses.Count -gt 0) { $addresses = $physicalAddresses }
    }
    return @($addresses | Select-Object -ExpandProperty IPAddress -Unique)
  } catch {
    try {
      return @(
        [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
          Where-Object {
            $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
            $_.IPAddressToString -notmatch '^(127\.|169\.254\.)'
          } |
          ForEach-Object { $_.IPAddressToString } |
          Select-Object -Unique
      )
    } catch {
      return @()
    }
  }
}

if (!(Test-Path $communityScript)) {
  Write-Error "Missing community server launcher: $communityScript"
  exit 1
}

Set-OptionalEnvironmentValue 'FE_SANDBOX_CODEX_MODEL' $CodexModel
Set-OptionalEnvironmentValue 'FE_SANDBOX_API_KEY' $SandboxApiKey
Set-OptionalEnvironmentValue 'FE_BLENDER_PATH' $BlenderPath
$Env:FE_MONSTER_COMMUNITY_URL = "http://127.0.0.1:$CommunityPort"

Write-Host "== Starting FE Monster community, sandbox and Codex service"
& $communityScript `
  -Root $rootPath `
  -ServerRoot $ServerRoot `
  -Port $CommunityPort `
  -HostAddress $CommunityBind
if ($LASTEXITCODE -ne 0) {
  Write-Error "Community server launcher failed with exit code $LASTEXITCODE."
  exit $LASTEXITCODE
}
if (!(Test-CommunityHealth)) {
  Write-Error "Community, sandbox and Codex service is not healthy at http://127.0.0.1:$CommunityPort/health."
  exit 1
}
Write-Host "Community health check passed: http://127.0.0.1:$CommunityPort/health"

Write-Host "== Building FE Monster Java service"
& $buildScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (!(Test-Path $jarPath)) {
  throw "Missing Java jar: $jarPath"
}

$Env:FE_MONSTER_BIND = $Bind
$Env:FE_MONSTER_PORT = [string]$Port

Ensure-AndroidFirewallRule

Write-Host "== Starting FE Monster for Android"
Write-Host "Bind: $Bind"
Write-Host "Port: $Port"
if ($Bind -eq '127.0.0.1' -or $Bind -eq 'localhost' -or $Bind -eq '::1') {
  Write-Warning 'The Java service is bound to loopback, so a physical phone cannot connect. Use -Bind 0.0.0.0 for LAN access.'
} else {
  $lanAddresses = @(Get-LanIpv4Addresses)
  if ($lanAddresses.Count -eq 0) {
    Write-Warning "No LAN IPv4 address was detected. In the Android app enter http://<this-PC-LAN-IP>:$Port"
  } else {
    Write-Host 'Enter one of these server URLs in the Android app (phone and PC must share a LAN):'
    foreach ($address in $lanAddresses) {
      Write-Host "  http://${address}:$Port"
    }
  }
}
& java -jar $jarPath --server
if ($LASTEXITCODE -ne 0) {
  Write-Error "FE Monster Java service exited with code $LASTEXITCODE."
  exit $LASTEXITCODE
}
