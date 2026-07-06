param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$WebView2Sdk = $Env:WEBVIEW2_SDK_DIR
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$source = Join-Path $rootPath 'native\windows\fe_monster_client.cpp'
$buildDir = Join-Path $rootPath 'native\windows\build'
$output = Join-Path $buildDir 'fe-monster-client.exe'
$defaultSdk = Join-Path $rootPath 'native\windows\packages\Microsoft.Web.WebView2.1.0.4022.49'

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if ($null -eq $cl) {
  Write-Host 'cl.exe was not found. Run this from a Visual Studio Developer PowerShell, or install Visual Studio Build Tools with the Windows SDK.'
  exit 1
}

if ([string]::IsNullOrWhiteSpace($WebView2Sdk) -and (Test-Path $defaultSdk)) {
  $WebView2Sdk = $defaultSdk
}

if ([string]::IsNullOrWhiteSpace($WebView2Sdk)) {
  Write-Host 'WEBVIEW2_SDK_DIR is required. It should point to the Microsoft.Web.WebView2 NuGet package root.'
  exit 1
}

$include = Join-Path $WebView2Sdk 'build\native\include'
$lib = Join-Path $WebView2Sdk 'build\native\x64\WebView2LoaderStatic.lib'
if (!(Test-Path $include) -or !(Test-Path $lib)) {
  Write-Host "WebView2 SDK include/lib were not found under $WebView2Sdk."
  exit 1
}

if (!(Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

& $cl.Source `
  /nologo `
  /std:c++17 `
  /EHsc `
  /DUNICODE `
  /D_UNICODE `
  /I "$include" `
  "$source" `
  /link `
  /SUBSYSTEM:WINDOWS `
  /OUT:"$output" `
  "$lib" `
  user32.lib `
  ole32.lib `
  advapi32.lib `
  shell32.lib

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Built $output"
