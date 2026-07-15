param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$Port = 3012
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$apiScript = Join-Path $rootPath 'scripts\kugou-api-server.cjs'
$apiPackageScript = Join-Path $rootPath 'node_modules\kugoumusicapi\app.js'
$dependencyHelper = Join-Path $rootPath 'scripts\ensure-music-api-dependencies.ps1'
$outDir = Join-Path $rootPath 'out'
$runLogId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$outLogFile = Join-Path $outDir "kugou-api-$runLogId.out.log"
$errLogFile = Join-Path $outDir "kugou-api-$runLogId.err.log"

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

function Test-KugouApi {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/search/hot" -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Ensure-ApiDependencies {
  $node = Resolve-Node
  if (![string]::IsNullOrWhiteSpace($node) -and (Test-Path $apiScript) -and (Test-Path $apiPackageScript)) {
    return $true
  }
  if (!(Test-Path $dependencyHelper)) {
    return $false
  }
  & powershell.exe -NoProfile -File $dependencyHelper -Root $rootPath -RequiredPath @(
    'scripts\kugou-api-server.cjs',
    'node_modules\kugoumusicapi\app.js'
  ) -InstallMissing
  return $LASTEXITCODE -eq 0
}

if (Test-KugouApi) {
  Write-Host "Kugou Music API already running on port $Port."
  exit 0
}

if (!(Test-Path $apiScript) -or !(Test-Path $apiPackageScript)) {
  if (!(Ensure-ApiDependencies)) {
    Write-Host "Kugou Music API is not installed and could not be installed automatically."
    exit 1
  }
}

$node = Resolve-Node
if ([string]::IsNullOrWhiteSpace($node)) {
  if (!(Ensure-ApiDependencies)) {
    Write-Host "Node.js was not found; cannot auto-start Kugou Music API."
    exit 1
  }
  $node = Resolve-Node
  if ([string]::IsNullOrWhiteSpace($node)) {
    Write-Host "Node.js was not found; cannot auto-start Kugou Music API."
    exit 1
  }
}

if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

$previousPort = $Env:PORT
$Env:PORT = [string]$Port

Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$apiScript`"", "--port=$Port") `
  -WorkingDirectory $rootPath `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLogFile `
  -RedirectStandardError $errLogFile | Out-Null

if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $Env:PORT = $previousPort }

for ($i = 0; $i -lt 18; $i += 1) {
  Start-Sleep -Milliseconds 500
  if (Test-KugouApi) {
    Write-Host "Kugou Music API started on port $Port."
    exit 0
  }
}

Write-Host "Kugou Music API did not become ready on port $Port. See $errLogFile"
exit 1
