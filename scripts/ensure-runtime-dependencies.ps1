param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$InstallMissing
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$missing = New-Object System.Collections.Generic.List[string]
$javaRuntimeScript = Join-Path $PSScriptRoot 'java-runtime.ps1'
if (Test-Path $javaRuntimeScript) {
  . $javaRuntimeScript
}
$preferredJavaMajor = if (Get-Variable -Name PreferredJavaMajor -Scope Script -ErrorAction SilentlyContinue) { [int]$Script:PreferredJavaMajor } else { 26 }

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

function Test-JavaRuntime {
  if (Get-Command Find-JavaRuntime -ErrorAction SilentlyContinue) {
    return -not [string]::IsNullOrWhiteSpace((Find-JavaRuntime -Root $rootPath -MinimumMajor $preferredJavaMajor))
  }

  $java = Find-Exe 'java.exe' @(
    (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
    (Join-Path $Env:ProgramFiles 'Java'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Java')
  )
  if ([string]::IsNullOrWhiteSpace($java)) { return $false }
  $javaCommand = '"' + $java + '" -version 2>&1'
  $text = (& cmd.exe /d /c $javaCommand) | Out-String
  $match = [regex]::Match($text, '"(?<first>\d+)(?:\.(?<second>\d+))?')
  if (!$match.Success) { return $false }
  $first = [int]$match.Groups['first'].Value
  $major = if ($first -eq 1 -and $match.Groups['second'].Success) { [int]$match.Groups['second'].Value } else { $first }
  return $major -ge $preferredJavaMajor
}

function Test-DotNetDesktop8 {
  $dotnet = Find-Exe 'dotnet.exe' @((Join-Path $Env:ProgramFiles 'dotnet'), (Join-Path ${Env:ProgramFiles(x86)} 'dotnet'))
  if ([string]::IsNullOrWhiteSpace($dotnet)) { return $false }
  $runtimes = (& $dotnet --list-runtimes) 2>$null
  return [bool]($runtimes | Where-Object { $_ -match '^Microsoft\.WindowsDesktop\.App\s+8\.' })
}

function Test-WebView2Runtime {
  $roots = @(
    (Join-Path ${Env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'),
    (Join-Path $Env:ProgramFiles 'Microsoft\EdgeWebView\Application'),
    (Join-Path $Env:LOCALAPPDATA 'Microsoft\EdgeWebView\Application')
  )
  foreach ($root in $roots) {
    if (Test-Path $root) {
      $exe = Get-ChildItem -Path $root -Recurse -Filter 'msedgewebview2.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($null -ne $exe) { return $true }
    }
  }

  $registryPaths = @(
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1E7F4DF-BE0C-4A6B-AE2B-AAB7222E7D3E}',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F1E7F4DF-BE0C-4A6B-AE2B-AAB7222E7D3E}',
    'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F1E7F4DF-BE0C-4A6B-AE2B-AAB7222E7D3E}'
  )
  foreach ($path in $registryPaths) {
    if (Test-Path $path) { return $true }
  }
  return $false
}

function Test-Node {
  return -not [string]::IsNullOrWhiteSpace((Find-Exe 'node.exe' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))))
}

function Find-Npm {
  return Find-Exe 'npm.cmd' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))
}

function Find-Pnpm {
  return Find-Exe 'pnpm.cmd' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))
}

function Find-Corepack {
  return Find-Exe 'corepack.cmd' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))
}

function Install-WingetPackage {
  param(
    [string]$Name,
    [string]$Id
  )

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($null -eq $winget) {
    Write-Host "winget is not available; cannot install $Name automatically."
    return $false
  }

  Write-Host "Installing $Name ($Id)..."
  & $winget.Source install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
  return $LASTEXITCODE -eq 0
}

function Ensure-Dependency {
  param(
    [string]$Name,
    [scriptblock]$Test,
    [string]$WingetId
  )

  if (& $Test) {
    Write-Host "${Name}: OK"
    return
  }

  if ($InstallMissing -and (Install-WingetPackage $Name $WingetId) -and (& $Test)) {
    Write-Host "${Name}: installed"
    return
  }

  Write-Host "${Name}: missing"
  $missing.Add($Name) | Out-Null
}

function Ensure-JavaRuntime {
  if (Test-JavaRuntime) {
    Write-Host 'Java 26: OK'
    return
  }

  if ($InstallMissing) {
    if (Install-WingetPackage 'Java 26' 'EclipseAdoptium.Temurin.26.JDK') {
      if (Get-Command Update-JavaRuntimeEnvironment -ErrorAction SilentlyContinue) {
        Update-JavaRuntimeEnvironment
      }
      if (Test-JavaRuntime) {
        Write-Host 'Java 26: installed'
        return
      }
      Write-Host 'Java 26 winget finished, but Java is still not visible; trying local runtime.'
    }

    if (Get-Command Install-LocalJavaRuntime -ErrorAction SilentlyContinue) {
      $downloadRoot = Join-Path $rootPath 'out\runtime-installers'
      if (Install-LocalJavaRuntime -Root $rootPath -DownloadRoot $downloadRoot) {
        if (Test-JavaRuntime) {
          Write-Host 'Java 26: local runtime installed'
          return
        }
      }
    }
  }

  Write-Host 'Java 26: missing'
  $missing.Add('Java 26') | Out-Null
}

function Test-NodeModules {
  $required = @(
    'node_modules\NeteaseCloudMusicApi',
    'node_modules\@sansenjian\qq-music-api',
    'node_modules\kugoumusicapi'
  )
  foreach ($relative in $required) {
    if (!(Test-Path (Join-Path $rootPath $relative))) { return $false }
  }
  return $true
}

function Ensure-NodeModules {
  if (Test-NodeModules) {
    Write-Host 'Node packages: OK'
    return
  }

  if (!$InstallMissing) {
    Write-Host 'Node packages: missing'
    $missing.Add('Node packages') | Out-Null
    return
  }

  Ensure-Dependency 'Git' { -not [string]::IsNullOrWhiteSpace((Find-Exe 'git.exe' @((Join-Path $Env:ProgramFiles 'Git')))) } 'Git.Git'
  $npm = Find-Npm
  if ([string]::IsNullOrWhiteSpace($npm)) {
    Write-Host 'npm: missing'
    $missing.Add('npm') | Out-Null
    return
  }

  Write-Host 'Installing music API Node packages...'
  $runtimeInstallRoot = Join-Path $outDir 'runtime-node-modules'
  if (Test-Path $runtimeInstallRoot) { Remove-Item -LiteralPath $runtimeInstallRoot -Recurse -Force }
  New-Item -ItemType Directory -Path $runtimeInstallRoot | Out-Null
  Set-Content -Encoding UTF8 -Path (Join-Path $runtimeInstallRoot 'package.json') -Value @'
{
  "private": true,
  "dependencies": {
    "@sansenjian/qq-music-api": "^2.4.0",
    "NeteaseCloudMusicApi": "^4.32.0",
    "kugoumusicapi": "https://codeload.github.com/MakcRe/KuGouMusicApi/tar.gz/283f1e97b110726b208a64b486a657c0fc0a6126"
  }
}
'@

  Push-Location $runtimeInstallRoot
  try {
    & $npm install --omit=dev --no-audit --no-fund --no-package-lock
    if ($LASTEXITCODE -ne 0) { $missing.Add('Node packages') | Out-Null; return }
  } finally {
    Pop-Location
  }

  if (Test-Path (Join-Path $rootPath 'node_modules')) {
    Remove-Item -LiteralPath (Join-Path $rootPath 'node_modules') -Recurse -Force
  }
  & robocopy.exe (Join-Path $runtimeInstallRoot 'node_modules') (Join-Path $rootPath 'node_modules') /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    $missing.Add('Node packages') | Out-Null
    return
  }

  if (!(Test-NodeModules)) {
    $missing.Add('Node packages') | Out-Null
  }
}

function Test-GesturePythonRuntime {
  $python = Join-Path $rootPath 'runtime\python\python.exe'
  $sitePackages = Join-Path $rootPath 'runtime\python-site-packages'
  if (!(Test-Path $python) -or !(Test-Path $sitePackages)) { return $false }

  $previousPythonPath = $Env:PYTHONPATH
  $previousNoUserSite = $Env:PYTHONNOUSERSITE
  try {
    $Env:PYTHONPATH = $sitePackages
    $Env:PYTHONNOUSERSITE = '1'
    & $python -c "import cv2, mediapipe, pyautogui, pygrabber" *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    if ($null -eq $previousPythonPath) { Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue } else { $Env:PYTHONPATH = $previousPythonPath }
    if ($null -eq $previousNoUserSite) { Remove-Item Env:\PYTHONNOUSERSITE -ErrorAction SilentlyContinue } else { $Env:PYTHONNOUSERSITE = $previousNoUserSite }
  }
}

function Test-GesturePythonImports {
  param(
    [string]$PythonExe,
    [string]$SitePackages = ''
  )

  if ([string]::IsNullOrWhiteSpace($PythonExe) -or !(Test-Path $PythonExe)) { return $false }
  $previousPythonPath = $Env:PYTHONPATH
  $previousNoUserSite = $Env:PYTHONNOUSERSITE
  try {
    if (![string]::IsNullOrWhiteSpace($SitePackages)) { $Env:PYTHONPATH = $SitePackages }
    $Env:PYTHONNOUSERSITE = '1'
    & $PythonExe -c "import cv2, mediapipe, pyautogui, pygrabber" *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    if ($null -eq $previousPythonPath) { Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue } else { $Env:PYTHONPATH = $previousPythonPath }
    if ($null -eq $previousNoUserSite) { Remove-Item Env:\PYTHONNOUSERSITE -ErrorAction SilentlyContinue } else { $Env:PYTHONNOUSERSITE = $previousNoUserSite }
  }
}

function Copy-DirectoryWithRobocopy {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludeDirs = @()
  )

  if (!(Test-Path $Source)) { return $false }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $args = @($Source, $Destination, '/E', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  if ($ExcludeDirs.Count -gt 0) {
    $args += '/XD'
    $args += $ExcludeDirs
  }
  & robocopy.exe @args | Out-Null
  return $LASTEXITCODE -le 7
}

function Sync-GesturePythonRuntimeFromVenv {
  $venvRoot = Join-Path $rootPath '.venv-gesture'
  $venvPython = Join-Path $venvRoot 'Scripts\python.exe'
  $sitePackagesSource = Join-Path $venvRoot 'Lib\site-packages'
  if (!(Test-GesturePythonImports $venvPython) -or !(Test-Path $sitePackagesSource)) { return $false }

  $pythonHome = (& $venvPython -c "import sys; print(sys.base_prefix)") | Select-Object -First 1
  $pythonHome = [string]$pythonHome
  if ([string]::IsNullOrWhiteSpace($pythonHome) -or !(Test-Path $pythonHome)) { return $false }

  $pythonDest = Join-Path $rootPath 'runtime\python'
  $sitePackagesDest = Join-Path $rootPath 'runtime\python-site-packages'
  $baseSitePackages = Join-Path $pythonHome 'Lib\site-packages'

  if (!(Copy-DirectoryWithRobocopy $pythonHome $pythonDest @($baseSitePackages))) { return $false }
  if (!(Copy-DirectoryWithRobocopy $sitePackagesSource $sitePackagesDest)) { return $false }

  return Test-GesturePythonRuntime
}

function Ensure-GesturePythonRuntime {
  if (Test-GesturePythonRuntime) {
    Write-Host 'Gesture Python runtime (OpenCV / MediaPipe / PyAutoGUI): OK'
    return
  }

  if (Sync-GesturePythonRuntimeFromVenv) {
    Write-Host 'Gesture Python runtime (OpenCV / MediaPipe / PyAutoGUI): repaired from .venv-gesture'
    return
  }

  Write-Host 'Gesture Python runtime (OpenCV / MediaPipe / PyAutoGUI): missing'
  $missing.Add('Gesture Python runtime (OpenCV / MediaPipe / PyAutoGUI)') | Out-Null
}

Ensure-JavaRuntime
Ensure-Dependency '.NET Desktop Runtime 8' { Test-DotNetDesktop8 } 'Microsoft.DotNet.DesktopRuntime.8'
Ensure-Dependency 'Microsoft Edge WebView2 Runtime' { Test-WebView2Runtime } 'Microsoft.EdgeWebView2Runtime'
Ensure-Dependency 'Node.js LTS' { Test-Node } 'OpenJS.NodeJS.LTS'
Ensure-NodeModules
Ensure-GesturePythonRuntime

if ($missing.Count -gt 0) {
  Write-Host ('Missing dependencies: ' + ($missing -join ', '))
  exit 1
}

Write-Host 'Runtime dependencies: OK'
