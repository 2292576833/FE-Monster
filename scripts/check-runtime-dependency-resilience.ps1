param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$dependencyScript = Join-Path $rootPath 'scripts\ensure-runtime-dependencies.ps1'
$installerScript = Join-Path $rootPath 'scripts\install-fe-monster.ps1'
$failures = New-Object System.Collections.Generic.List[string]

if (!(Test-Path -LiteralPath $dependencyScript -PathType Leaf)) {
  throw "Runtime dependency checker is missing: $dependencyScript"
}
if (!(Test-Path -LiteralPath $installerScript -PathType Leaf)) {
  throw "Installer script is missing: $installerScript"
}

foreach ($webViewCheckName in @(
  'check-webview-runtime-health.ps1',
  'check-webview-runtime-repair.ps1'
)) {
  $webViewCheck = Join-Path $rootPath "scripts\$webViewCheckName"
  if (!(Test-Path -LiteralPath $webViewCheck -PathType Leaf)) {
    $failures.Add("WebView2 regression check is missing: $webViewCheckName") | Out-Null
    continue
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $webViewCheck -Root $rootPath
  if ($LASTEXITCODE -ne 0) {
    $failures.Add("WebView2 regression check failed: $webViewCheckName") | Out-Null
  }
}

# Isolate the production WebView2 installer function and mock the OS state in
# which the Microsoft installer returns a non-success code even though the
# Runtime is detectable immediately afterward. Detection must win over the
# installer's stale/ambiguous process exit code.
$dependencySource = Get-Content -Raw -LiteralPath $dependencyScript
$webViewStart = $dependencySource.IndexOf('function Test-MicrosoftSignedExecutable')
$webViewEnd = $dependencySource.IndexOf('function Install-WebView2Bootstrapper')
if ($webViewStart -lt 0 -or $webViewEnd -le $webViewStart) {
  $failures.Add('could not isolate the WebView2 runtime installer functions') | Out-Null
} else {
  . ([scriptblock]::Create($dependencySource.Substring($webViewStart, $webViewEnd - $webViewStart)))
  function Test-MicrosoftSignedExecutable { param([string]$Path) return $true }
  function Start-Process {
    $fixtureProcess = [pscustomobject]@{ ExitCode = 1; Id = 4242 }
    $fixtureProcess | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeoutMs) return $true }
    return $fixtureProcess
  }
  function Test-WebView2Runtime { return $true }

  $acceptedDetectedRuntime = Invoke-WebView2RuntimeInstaller `
    -InstallerPath 'fixture-webview2-installer.exe' `
    -Label 'the resilience fixture'
  if (!$acceptedDetectedRuntime) {
    $failures.Add('WebView2 detection after an ambiguous installer exit code is still rejected') | Out-Null
  }
}

$installerSource = Get-Content -Raw -LiteralPath $installerScript
if ($installerSource -notmatch 'Dependency detail:') {
  $failures.Add('installer UI log does not surface the concrete dependency-log tail') | Out-Null
}

# The online installer must solve WebView2 itself: use the signed Microsoft
# bootstrapper first (works without App Installer/winget), keep winget as a
# secondary network path, bound a stuck child installer, and never tell the
# user to replace this repair with a separate offline build.
$ensureWebViewStart = $dependencySource.IndexOf('function Ensure-WebView2Runtime')
$ensureWebViewEnd = $dependencySource.IndexOf('function Ensure-Dependency', $ensureWebViewStart)
if ($ensureWebViewStart -lt 0 -or $ensureWebViewEnd -le $ensureWebViewStart) {
  $failures.Add('could not isolate the online WebView2 dependency flow') | Out-Null
} else {
  $ensureWebViewSource = $dependencySource.Substring($ensureWebViewStart, $ensureWebViewEnd - $ensureWebViewStart)
  $bootstrapIndex = $ensureWebViewSource.IndexOf('Install-WebView2Bootstrapper')
  $wingetIndex = $ensureWebViewSource.IndexOf('Install-WingetPackage')
  if ($bootstrapIndex -lt 0 -or $wingetIndex -lt 0 -or $bootstrapIndex -gt $wingetIndex) {
    $failures.Add('online WebView2 bootstrapper is not attempted before the optional winget fallback') | Out-Null
  }
  if ($ensureWebViewSource -match '(?i)Offline\.exe') {
    $failures.Add('online WebView2 failure still redirects users to a different offline installer') | Out-Null
  }
}
if ($dependencySource -notmatch 'WaitForExit\(\$webView2InstallerTimeoutMs\)') {
  $failures.Add('WebView2 installer child process has no bounded wait timeout') | Out-Null
}
if ($dependencySource -notmatch 'https://developer\.microsoft\.com/[\s\S]{0,160}webview2') {
  $failures.Add('online WebView2 failure does not expose the official Microsoft recovery page') | Out-Null
}

# A broken or first-run App Installer can leave winget waiting forever on
# source initialization. The online setup must remain bounded even on that
# optional fallback path.
$wingetStart = $dependencySource.IndexOf('function Install-WingetPackage')
$wingetEnd = $dependencySource.IndexOf('function Test-MicrosoftSignedExecutable', $wingetStart)
if ($wingetStart -lt 0 -or $wingetEnd -le $wingetStart) {
  $failures.Add('could not isolate the optional winget fallback') | Out-Null
} else {
  . ([scriptblock]::Create($dependencySource.Substring($wingetStart, $wingetEnd - $wingetStart)))
  $script:wingetInstallerTimeoutMs = 75
  $script:fixtureWingetWaitTimeout = -1
  $script:fixtureWingetStopped = $false
  function Get-Command {
    param([string]$Name)
    if ($Name -eq 'winget.exe') { return [pscustomobject]@{ Source = 'fixture-winget.exe' } }
    return $null
  }
  function Start-Process {
    $fixtureProcess = [pscustomobject]@{ ExitCode = 0; Id = 4343 }
    $fixtureProcess | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
      param($timeoutMs)
      $script:fixtureWingetWaitTimeout = $timeoutMs
      return $false
    }
    return $fixtureProcess
  }
  function Stop-Process {
    param([int]$Id)
    if ($Id -eq 4343) { $script:fixtureWingetStopped = $true }
  }

  $wingetTimedOutSafely = Install-WingetPackage `
    -Name 'Microsoft Edge WebView2 Runtime' `
    -Id 'Microsoft.EdgeWebView2Runtime'
  if ($wingetTimedOutSafely -or
      $script:fixtureWingetWaitTimeout -ne $script:wingetInstallerTimeoutMs -or
      !$script:fixtureWingetStopped) {
    $failures.Add('a stuck winget fallback is not stopped after its bounded wait') | Out-Null
  }
}

if ($failures.Count -gt 0) {
  Write-Host 'Runtime dependency resilience: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Runtime dependency resilience: OK'
