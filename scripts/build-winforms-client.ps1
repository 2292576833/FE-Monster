param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$project = Join-Path $rootPath 'native\windows\winforms\FeMonsterClient.WinForms.csproj'
$packageRoot = Join-Path $rootPath 'native\windows\packages'
$publishDir = Join-Path $rootPath 'native\windows\build\winforms'

. (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')

$dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
$dotnetExe = if ($null -eq $dotnet) { '' } else { $dotnet.Source }
if ([string]::IsNullOrWhiteSpace($dotnetExe)) {
  $defaultDotnet = Join-Path $Env:ProgramFiles 'dotnet\dotnet.exe'
  if (Test-Path $defaultDotnet) {
    $dotnetExe = $defaultDotnet
  }
}
if ([string]::IsNullOrWhiteSpace($dotnetExe)) {
  Write-Host '.NET SDK was not found. Install .NET SDK 8+ to build the WinForms WebView2 client.'
  exit 1
}

if (!(Test-Path $packageRoot)) {
  $powerShellExecutable = (Get-Command powershell.exe -ErrorAction Stop).Source
  $sdkResult = Invoke-NoConsoleProcess `
    -FilePath $powerShellExecutable `
    -ArgumentList @(
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      (Join-Path $rootPath 'scripts\install-webview2-sdk.ps1'),
      '-Root',
      $rootPath
    ) `
    -WorkingDirectory $rootPath `
    -Wait `
    -CaptureOutput
  Write-NoConsoleProcessOutput $sdkResult
  if ($sdkResult.ExitCode -ne 0) { exit $sdkResult.ExitCode }
}

$publishArgs = @(
  'publish',
  $project,
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'true',
  '-o',
  $publishDir,
  '--source',
  $packageRoot
)

if (Test-Path -LiteralPath $publishDir) {
  Remove-Item -LiteralPath $publishDir -Recurse -Force
}

$publishResult = Invoke-NoConsoleProcess `
  -FilePath $dotnetExe `
  -ArgumentList $publishArgs `
  -WorkingDirectory $rootPath `
  -Wait `
  -CaptureOutput
Write-NoConsoleProcessOutput $publishResult
if ($publishResult.ExitCode -ne 0) {
  exit $publishResult.ExitCode
}

Write-Host "Built $publishDir\FE Monster.exe"
