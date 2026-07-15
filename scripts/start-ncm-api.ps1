param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$Port = 3010
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$apiScript = Join-Path $rootPath 'scripts\netease-api-server.cjs'
$nodeModulesApi = Join-Path $rootPath 'node_modules\NeteaseCloudMusicApi'
$dependencyHelper = Join-Path $rootPath 'scripts\ensure-music-api-dependencies.ps1'
$outDir = Join-Path $rootPath 'out'
$runLogId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$outLogFile = Join-Path $outDir "netease-api-$runLogId.out.log"
$errLogFile = Join-Path $outDir "netease-api-$runLogId.err.log"

function Find-Exe {
  param(
    [string]$Name,
    [string[]]$Roots = @()
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) { return $command.Source }

  foreach ($root in $Roots) {
    if ([string]::IsNullOrWhiteSpace($root) -or !(Test-Path $root)) { continue }
    $match = Get-ChildItem -Path $root -Recurse -Filter $Name -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($null -ne $match) { return $match.FullName }
  }
  return ''
}

function Resolve-Node {
  return Find-Exe 'node.exe' @(
    (Join-Path $rootPath 'runtime\node'),
    (Join-Path $Env:ProgramFiles 'nodejs'),
    (Join-Path ${Env:ProgramFiles(x86)} 'nodejs')
  )
}

function Test-NcmApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/login/status" -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Ensure-ApiDependencies {
  $node = Resolve-Node
  if (![string]::IsNullOrWhiteSpace($node) -and (Test-Path $nodeModulesApi) -and (Test-Path $apiScript)) {
    return $true
  }
  if (!(Test-Path $dependencyHelper)) {
    return $false
  }
  & powershell.exe -NoProfile -File $dependencyHelper -Root $rootPath -RequiredPath @(
    'scripts\netease-api-server.cjs',
    'node_modules\NeteaseCloudMusicApi'
  ) -InstallMissing
  return $LASTEXITCODE -eq 0
}

if (Test-NcmApi) {
  Write-Host "NeteaseCloudMusicApi already running on port $Port."
  exit 0
}

if (!(Test-Path $nodeModulesApi) -or !(Test-Path $apiScript)) {
  if (!(Ensure-ApiDependencies)) {
    Write-Host "NeteaseCloudMusicApi is not installed and could not be installed automatically."
    exit 1
  }
}

$node = Resolve-Node
if ([string]::IsNullOrWhiteSpace($node)) {
  if (!(Ensure-ApiDependencies)) {
    Write-Host "Node.js was not found; cannot auto-start NeteaseCloudMusicApi."
    exit 1
  }
  $node = Resolve-Node
  if ([string]::IsNullOrWhiteSpace($node)) {
    Write-Host "Node.js was not found; cannot auto-start NeteaseCloudMusicApi."
    exit 1
  }
}

if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$previousPort = $Env:PORT
$previousHost = $Env:HOST
$Env:PORT = [string]$Port
$Env:HOST = '127.0.0.1'

Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$apiScript`"") `
  -WorkingDirectory $rootPath `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLogFile `
  -RedirectStandardError $errLogFile | Out-Null

if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $Env:PORT = $previousPort }
if ($null -eq $previousHost) { Remove-Item Env:HOST -ErrorAction SilentlyContinue } else { $Env:HOST = $previousHost }

for ($i = 0; $i -lt 18; $i += 1) {
  Start-Sleep -Milliseconds 500
  if (Test-NcmApi) {
    Write-Host "NeteaseCloudMusicApi started on port $Port."
    exit 0
  }
}

Write-Host "NeteaseCloudMusicApi did not become ready on port $Port. See $errLogFile"
exit 1
