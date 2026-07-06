param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$project = Join-Path $rootPath 'native\windows\winforms\FeMonsterClient.WinForms.csproj'
$packageRoot = Join-Path $rootPath 'native\windows\packages'
$publishDir = Join-Path $rootPath 'native\windows\build\winforms'

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
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'scripts\install-webview2-sdk.ps1') -Root $rootPath
}

$publishArgs = @(
  'publish',
  $project,
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'false',
  '-o',
  $publishDir,
  '--source',
  $packageRoot
)

& $dotnetExe @publishArgs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Built $publishDir\fe-monster-client.exe"
