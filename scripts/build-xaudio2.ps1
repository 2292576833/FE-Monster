param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$source = Join-Path $rootPath 'native\windows\fe_monster_xaudio2.cpp'
$buildDir = Join-Path $rootPath 'native\windows\build'
$output = Join-Path $buildDir 'fe-monster-xaudio2.dll'

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if ($null -eq $cl) {
  Write-Host 'cl.exe was not found. Run this from a Visual Studio Developer PowerShell, or install Visual Studio Build Tools with the Windows SDK.'
  exit 1
}

$javac = Get-Command javac.exe -ErrorAction SilentlyContinue
if ($null -eq $javac -and [string]::IsNullOrWhiteSpace($Env:JAVA_HOME)) {
  Write-Host 'javac.exe or JAVA_HOME is required for JNI headers.'
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Env:JAVA_HOME)) {
  $javaHome = Split-Path -Parent (Split-Path -Parent $javac.Source)
} else {
  $javaHome = $Env:JAVA_HOME
}

$jniInclude = Join-Path $javaHome 'include'
$jniWinInclude = Join-Path $jniInclude 'win32'
if (!(Test-Path $jniInclude) -or !(Test-Path $jniWinInclude)) {
  Write-Host "JNI headers were not found under $javaHome."
  exit 1
}

if (!(Test-Path $buildDir)) {
  New-Item -ItemType Directory -Path $buildDir | Out-Null
}

& $cl.Source `
  /nologo `
  /std:c++17 `
  /EHsc `
  /LD `
  /I "$jniInclude" `
  /I "$jniWinInclude" `
  "$source" `
  /link `
  /OUT:"$output" `
  ole32.lib `
  uuid.lib `
  xaudio2.lib

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Built $output"
