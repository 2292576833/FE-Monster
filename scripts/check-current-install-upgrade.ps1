param(
  [string]$SetupExe = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'dist\FE-Monster-Setup-2.1.0-Offline.exe'),
  [string]$InstallDir = (Join-Path $Env:LOCALAPPDATA 'FE Monster'),
  [string]$PayloadRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'out\installer\work\payload\FE Monster')
)

$ErrorActionPreference = 'Stop'
$setup = (Resolve-Path -LiteralPath $SetupExe).Path
$install = [IO.Path]::GetFullPath($InstallDir)
$payload = (Resolve-Path -LiteralPath $PayloadRoot).Path
$programCanary = Join-Path $install 'obsolete-program-upgrade-canary.tmp'
$dataCanary = Join-Path $install 'data\upgrade-user-canary.tmp'
$credential = Join-Path $install 'data\community-device-credentials.json'
$qqAuth = Join-Path $install 'data\qq-auth.json'

foreach ($required in @($setup, $install, $credential, $qqAuth)) {
  if (!(Test-Path -LiteralPath $required)) { throw "Required upgrade input is missing: $required" }
}

$installPrefix = $install.TrimEnd('\') + '\'
$running = @(
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ![string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -and
      ([string]$_.ExecutablePath).StartsWith($installPrefix, [StringComparison]::OrdinalIgnoreCase)
    }
)
if ($running.Count -gt 0) {
  throw "Installed FE Monster has $($running.Count) running process(es)."
}

$credentialBefore = (Get-FileHash -LiteralPath $credential -Algorithm SHA256).Hash
$qqBefore = (Get-FileHash -LiteralPath $qqAuth -Algorithm SHA256).Hash
Set-Content -LiteralPath $programCanary -Encoding ASCII -Value 'obsolete program residue'
Set-Content -LiteralPath $dataCanary -Encoding ASCII -Value 'preserve across upgrade'

try {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $setup
  $info.Arguments = '--quiet --install-dir "' + $install + '" --no-launch -SkipSystemNodeInstall'
  $info.WorkingDirectory = Split-Path -Parent $setup
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  if (!$process.Start()) { throw 'Setup did not start.' }
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  $process.WaitForExit()
  $exitCode = $process.ExitCode
  $process.Dispose()
  if ($exitCode -ne 0) { throw "Setup returned $exitCode." }

  $installedExe = Join-Path $install 'native\windows\build\winforms\FE Monster.exe'
  $payloadExe = Join-Path $payload 'native\windows\build\winforms\FE Monster.exe'
  $uninstall = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FE Monster').UninstallString
  $checks = [ordered]@{
    setupExitCode = $exitCode -eq 0
    obsoleteProgramRemoved = !(Test-Path -LiteralPath $programCanary)
    userDataPreserved = (Test-Path -LiteralPath $dataCanary) -and
      ((Get-Content -LiteralPath $dataCanary -Raw).Trim() -eq 'preserve across upgrade')
    deviceCredentialPreserved = (Get-FileHash -LiteralPath $credential -Algorithm SHA256).Hash -eq $credentialBefore
    qqAuthPreserved = (Get-FileHash -LiteralPath $qqAuth -Algorithm SHA256).Hash -eq $qqBefore
    installedBinaryMatchesPayload = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $payloadExe -Algorithm SHA256).Hash
    registeredUninstallKeepsUserData = [string]$uninstall -like '*-KeepUserData*'
  }
  $failures = @($checks.GetEnumerator() | Where-Object { !$_.Value } | ForEach-Object { $_.Key })
  [pscustomobject]@{
    pass = $failures.Count -eq 0
    checks = $checks
    failures = $failures
  } | ConvertTo-Json -Depth 4
  if ($failures.Count -gt 0) { exit 2 }
} finally {
  Remove-Item -LiteralPath $dataCanary -Force -ErrorAction SilentlyContinue
}
