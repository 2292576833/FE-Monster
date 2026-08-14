param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$DownloadSiteRoot = (Join-Path $Root 'download-site'),
  [int]$Port = 3080
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$siteRoot = (Resolve-Path -LiteralPath $DownloadSiteRoot).Path
$outDir = Join-Path $rootPath 'out'
if (!(Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Test-DownloadSite {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 3
    return $response.StatusCode -eq 200 -and $response.Content -match 'FE-Monster-Setup-2\.1\.0\.exe'
  } catch {
    return $false
  }
}

if (Test-DownloadSite) {
  Write-Host "FE Monster download site is already ready on 127.0.0.1:$Port."
  exit 0
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($null -ne $nodeCommand) { $nodeCommand.Source } else { Join-Path $rootPath 'runtime\node\node.exe' }
$vinextCli = Join-Path $siteRoot 'node_modules\vinext\dist\cli.js'
$serverEntry = Join-Path $siteRoot 'dist\server\index.js'
if (!(Test-Path -LiteralPath $node)) { throw "Node.js runtime was not found: $node" }
if (!(Test-Path -LiteralPath $vinextCli)) { throw "Download site runtime was not found: $vinextCli" }
if (!(Test-Path -LiteralPath $serverEntry)) { throw "Download site production build was not found: $serverEntry" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$vinextCli`"", 'start', '--hostname', '127.0.0.1', '--port', [string]$Port) `
  -WorkingDirectory $siteRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $outDir "download-site-$stamp.out.log") `
  -RedirectStandardError (Join-Path $outDir "download-site-$stamp.err.log") | Out-Null

for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  if (Test-DownloadSite) {
    Write-Host "FE Monster download site is ready on 127.0.0.1:$Port."
    exit 0
  }
}

throw "FE Monster download site did not become ready on port $Port."
