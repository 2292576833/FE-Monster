param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Version = '1.0.4022.49'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$packageRoot = Join-Path $rootPath 'native\windows\packages'
$packageDir = Join-Path $packageRoot "Microsoft.Web.WebView2.$Version"
$nupkg = Join-Path $packageRoot "Microsoft.Web.WebView2.$Version.nupkg"
$zip = Join-Path $packageRoot "Microsoft.Web.WebView2.$Version.zip"

if (!(Test-Path $packageRoot)) {
  New-Item -ItemType Directory -Path $packageRoot | Out-Null
}

if (!(Test-Path $packageDir)) {
  Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$Version" `
    -OutFile $nupkg
  Copy-Item -LiteralPath $nupkg -Destination $zip -Force
  Expand-Archive -LiteralPath $zip -DestinationPath $packageDir -Force
  Remove-Item -LiteralPath $zip -Force
}

$staticLib = Join-Path $packageDir 'build\native\x64\WebView2LoaderStatic.lib'
if (!(Test-Path $staticLib)) {
  Write-Host "WebView2LoaderStatic.lib was not found under $packageDir."
  exit 1
}

Write-Host "Installed Microsoft.Web.WebView2 $Version"
Write-Host $staticLib
