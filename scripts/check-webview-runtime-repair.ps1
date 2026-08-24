param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$dependencyScript = Join-Path $rootPath 'scripts\ensure-runtime-dependencies.ps1'
$source = Get-Content -Raw -LiteralPath $dependencyScript
$start = $source.IndexOf('function Test-WebView2Runtime')
$end = $source.IndexOf('function Ensure-Dependency')
if ($start -lt 0 -or $end -le $start) {
  throw 'Could not isolate the production WebView2 dependency flow.'
}

. ([scriptblock]::Create($source.Substring($start, $end - $start)))

$script:fixturePv = '151.0.4129.78'
$script:fixtureLocation = 'C:\Fixture\EdgeWebView\Application'
$script:fixtureBootstrapperCalls = 0
$script:fixtureWingetCalls = 0
$InstallMissing = $true
$missing = New-Object System.Collections.Generic.List[string]

function Get-ItemProperty {
  param(
    [string]$LiteralPath,
    [string[]]$Name,
    [object]$ErrorAction
  )
  if ($LiteralPath -like 'HKLM:*WOW6432Node*') {
    return [pscustomobject]@{
      pv = $script:fixturePv
      location = $script:fixtureLocation
    }
  }
  return $null
}

function Test-Path {
  param(
    [string]$LiteralPath,
    [object]$PathType
  )
  # The registry still claims WebView2 is installed, but both its executable
  # and the large offline installer are absent in this online-package fixture.
  return $false
}

function Install-WingetPackage {
  param([string]$Name, [string]$Id)
  $script:fixtureWingetCalls += 1
  return $false
}

function Install-WebView2Bootstrapper {
  $script:fixtureBootstrapperCalls += 1
  return $true
}

Ensure-WebView2Runtime

if ($script:fixtureWingetCalls -ne 0) {
  throw 'A successful direct WebView2 bootstrap repair still invoked the optional winget fallback.'
}
if ($script:fixtureBootstrapperCalls -ne 1) {
  throw 'A damaged registered WebView2 runtime did not reach the official Microsoft bootstrapper first.'
}
if ($missing.Count -ne 0) {
  throw 'A successful Microsoft bootstrapper repair was still reported as a missing dependency.'
}

Write-Host 'WebView2 runtime repair: OK'
