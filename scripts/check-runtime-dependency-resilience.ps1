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
  function Start-Process { return [pscustomobject]@{ ExitCode = 1 } }
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

# A network-less machine must get a specific, actionable WebView2 recovery
# message instead of an opaque dependency failure.  The offline installer is
# the deterministic fallback for computers where winget and the bootstrapper
# are both unavailable.
if ($dependencySource -notmatch 'download or request[\s\S]{0,300}FE-Monster-Setup-[\s\S]{0,120}-Offline\.exe') {
  $failures.Add('WebView2 network failure does not explain the offline-installer fallback') | Out-Null
}

if ($failures.Count -gt 0) {
  Write-Host 'Runtime dependency resilience: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Runtime dependency resilience: OK'
