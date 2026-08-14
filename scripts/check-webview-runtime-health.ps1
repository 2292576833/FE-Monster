param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$dependencyScript = Join-Path $rootPath 'scripts\ensure-runtime-dependencies.ps1'
$source = Get-Content -Raw -LiteralPath $dependencyScript
$start = $source.IndexOf('function Test-WebView2Runtime')
$end = $source.IndexOf('function Test-Node')
if ($start -lt 0 -or $end -le $start) {
  throw 'Could not isolate the production WebView2 runtime health check.'
}

. ([scriptblock]::Create($source.Substring($start, $end - $start)))

$script:fixturePv = '151.0.4129.78'
$script:fixtureLocation = 'C:\Fixture\EdgeWebView\Application'
$script:fixtureSecondaryLocation = ''
$script:fixtureExecutablePresent = $false
$script:fixtureExecutableVersion = '151.0.4129.78'
$script:fixtureLaunchMode = 'success'
$script:fixtureStandaloneExitCode = 13
$script:fixtureEmbeddedExitCode = 0
$script:fixtureLaunchCount = 0
$script:fixtureStopCount = 0
$script:lastProbeFilePath = ''

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
  if ($LiteralPath -like 'HKLM:*EdgeUpdate*' -and
      ![string]::IsNullOrWhiteSpace($script:fixtureSecondaryLocation)) {
    return [pscustomobject]@{
      pv = $script:fixturePv
      location = $script:fixtureSecondaryLocation
    }
  }
  return $null
}

function Test-Path {
  param(
    [string]$LiteralPath,
    [object]$PathType
  )
  return $script:fixtureExecutablePresent
}

function Get-Item {
  param([string]$LiteralPath)
  return [pscustomobject]@{
    Length = 4MB
    VersionInfo = [pscustomobject]@{ ProductVersion = $script:fixtureExecutableVersion }
  }
}

function Start-Process {
  param(
    [string]$FilePath,
    [object[]]$ArgumentList,
    [object]$WindowStyle,
    [switch]$PassThru
  )
  $script:fixtureLaunchCount += 1
  $script:lastProbeFilePath = $FilePath
  if ($script:fixtureLaunchMode -eq 'throw') {
    throw 'fixture executable could not start'
  }
  $isEmbeddedProbe = $ArgumentList -contains '--embedded-browser-webview=1'
  $isSecondaryRuntime = ![string]::IsNullOrWhiteSpace($script:fixtureSecondaryLocation) -and
    $FilePath.StartsWith($script:fixtureSecondaryLocation, [StringComparison]::OrdinalIgnoreCase)
  $exitCode = if ($isEmbeddedProbe) {
    if ($isSecondaryRuntime) { 0 } else { $script:fixtureEmbeddedExitCode }
  } else {
    $script:fixtureStandaloneExitCode
  }
  $process = [pscustomobject]@{ ExitCode = $exitCode; Id = 4242 }
  $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
    param([int]$Milliseconds)
    return $script:fixtureLaunchMode -ne 'timeout'
  }
  return $process
}

function Stop-Process {
  param(
    [int]$Id,
    [switch]$Force,
    [object]$ErrorAction
  )
  $script:fixtureStopCount += 1
}

if (Test-WebView2Runtime) {
  throw 'RED: a registry-only WebView2 version was accepted although its runtime executable is missing.'
}

$script:fixtureExecutablePresent = $true
$script:fixtureExecutableVersion = '150.0.0.0'
if (Test-WebView2Runtime) {
  throw 'RED: a WebView2 executable whose file version disagrees with the registered runtime was accepted.'
}

$script:fixtureExecutableVersion = $script:fixturePv
$script:fixtureLaunchMode = 'throw'
if (Test-WebView2Runtime) {
  throw 'RED: an inaccessible WebView2 executable was accepted although its health probe could not start.'
}

$script:fixtureLaunchMode = 'success'
$script:fixtureEmbeddedExitCode = 13
if (Test-WebView2Runtime) {
  throw 'RED: a WebView2 executable whose embedded-runtime health probe failed was accepted.'
}

$script:fixtureLaunchMode = 'timeout'
if (Test-WebView2Runtime) {
  throw 'RED: a WebView2 executable whose health probe never completed was accepted.'
}
if ($script:fixtureStopCount -lt 1) {
  throw 'A timed-out WebView2 health probe was not stopped.'
}

$script:fixtureLaunchMode = 'success'
$script:fixtureEmbeddedExitCode = 0
if (!(Test-WebView2Runtime)) {
  throw 'A registered, version-matched, launchable WebView2 runtime was rejected instead of using an embedded-runtime probe.'
}
if ($script:fixtureLaunchCount -lt 2) {
  throw 'The WebView2 runtime executable launch probe was not exercised.'
}

$script:fixtureLocation = ''
$script:fixtureSecondaryLocation = ''
$standardRuntimeLocation = Join-Path ${Env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'
if (!(Test-WebView2Runtime)) {
  throw 'RED: a healthy WebView2 runtime in its standard location was rejected when the optional registry location value was absent.'
}
if (!$script:lastProbeFilePath.StartsWith(
    $standardRuntimeLocation,
    [StringComparison]::OrdinalIgnoreCase
)) {
  throw 'WebView2 did not probe the standard machine-level runtime location.'
}

$script:fixtureLocation = 'C:\Fixture\EdgeWebView\Application'
$script:fixtureEmbeddedExitCode = 13
$script:fixtureSecondaryLocation = 'C:\Fixture\HealthyEdgeWebView\Application'
if (!(Test-WebView2Runtime)) {
  throw 'RED: a stale first WebView2 registry entry prevented detection of a later healthy registered runtime.'
}

Write-Host 'WebView2 runtime health: OK'
