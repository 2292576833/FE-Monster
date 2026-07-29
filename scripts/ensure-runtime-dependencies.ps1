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
$preferredJavaMajor = if (Get-Variable -Name PreferredJavaMajor -Scope Script -ErrorAction SilentlyContinue) { [int]$Script:PreferredJavaMajor } else { 17 }

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
  $selfContainedClient = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
  $selfContainedCore = Join-Path $rootPath 'native\windows\build\winforms\coreclr.dll'
  if ((Test-Path -LiteralPath $selfContainedClient -PathType Leaf) -and
      (Test-Path -LiteralPath $selfContainedCore -PathType Leaf)) {
    return $true
  }
  $dotnet = Find-Exe 'dotnet.exe' @((Join-Path $Env:ProgramFiles 'dotnet'), (Join-Path ${Env:ProgramFiles(x86)} 'dotnet'))
  if ([string]::IsNullOrWhiteSpace($dotnet)) { return $false }
  $runtimes = (& $dotnet --list-runtimes) 2>$null
  return [bool]($runtimes | Where-Object { $_ -match '^Microsoft\.WindowsDesktop\.App\s+8\.' })
}

function Test-WebView2Runtime {
  $runtimeClientId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  $registryPaths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeClientId",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeClientId",
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeClientId"
  )
  foreach ($path in $registryPaths) {
    $properties = Get-ItemProperty -LiteralPath $path -Name 'pv' -ErrorAction SilentlyContinue
    $version = if ($null -eq $properties) { '' } else { [string]$properties.pv }
    if (![string]::IsNullOrWhiteSpace($version)) {
      $parsedVersion = $null
      if ([version]::TryParse($version, [ref]$parsedVersion) -and
          $parsedVersion -gt [version]'0.0.0.0') {
        return $true
      }
    }
  }
  return $false
}

function Test-Node {
  return -not [string]::IsNullOrWhiteSpace((Find-Exe 'node.exe' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))))
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

function Test-MicrosoftSignedExecutable {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    Write-Host "Authenticode validation failed for $(Split-Path -Leaf $Path): $($signature.Status)"
    return $false
  }
  $subject = if ($null -eq $signature.SignerCertificate) { '' } else { [string]$signature.SignerCertificate.Subject }
  if ($subject -notmatch '(?i)(^|,\s*)O=Microsoft Corporation(,|$)') {
    Write-Host "Unexpected signer for $(Split-Path -Leaf $Path): $subject"
    return $false
  }
  return $true
}

function Invoke-WebView2RuntimeInstaller {
  param(
    [string]$InstallerPath,
    [string]$Label
  )

  if (!(Test-MicrosoftSignedExecutable $InstallerPath)) { return $false }
  Write-Host "Installing Microsoft Edge WebView2 Runtime from $Label..."
  try {
    $process = Start-Process `
      -FilePath $InstallerPath `
      -ArgumentList @('/silent', '/install') `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
  } catch {
    Write-Host "WebView2 installer could not start: $($_.Exception.Message)"
    return $false
  }
  if ($process.ExitCode -notin @(0, 3010)) {
    Write-Host "WebView2 installer failed with exit code $($process.ExitCode)."
    return $false
  }
  if ($process.ExitCode -eq 3010) {
    Write-Host 'WebView2 installer requested a restart; setup will continue only if the Runtime is already detectable.'
  }

  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    if (Test-WebView2Runtime) { return $true }
    Start-Sleep -Seconds 1
  }
  Write-Host 'WebView2 installer completed, but the Runtime was not detected.'
  return $false
}

function Install-WebView2Bootstrapper {
  $downloadRoot = Join-Path $rootPath 'out\runtime-installers'
  $installerPath = Join-Path $downloadRoot 'MicrosoftEdgeWebview2Setup.exe'
  $temporaryPath = "$installerPath.download.$PID"
  $downloadUrl = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'

  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
  if (!(Test-MicrosoftSignedExecutable $installerPath)) {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
    Write-Host 'Downloading the official Microsoft WebView2 Evergreen Bootstrapper...'
    $downloaded = $false
    for ($attempt = 1; $attempt -le 3 -and !$downloaded; $attempt += 1) {
      Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
      try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $temporaryPath -TimeoutSec 300
        $download = Get-Item -LiteralPath $temporaryPath
        if ($download.Length -lt 512KB) {
          throw "Downloaded bootstrapper is unexpectedly small ($($download.Length) bytes)."
        }
        if (!(Test-MicrosoftSignedExecutable $temporaryPath)) {
          throw 'Downloaded bootstrapper did not pass Microsoft Authenticode validation.'
        }
        Move-Item -LiteralPath $temporaryPath -Destination $installerPath -Force
        $downloaded = $true
      } catch {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        Write-Host "WebView2 bootstrapper download attempt $attempt failed: $($_.Exception.Message)"
        if ($attempt -lt 3) { Start-Sleep -Seconds ([math]::Pow(2, $attempt)) }
      }
    }
    if (!$downloaded) {
      return $false
    }
  }

  return Invoke-WebView2RuntimeInstaller $installerPath 'the Microsoft bootstrapper'
}

function Ensure-WebView2Runtime {
  $label = 'Microsoft Edge WebView2 Runtime'
  if (Test-WebView2Runtime) {
    Write-Host "${label}: OK"
    return
  }

  if ($InstallMissing) {
    $bundledInstaller = Join-Path $rootPath 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
    if ((Test-Path -LiteralPath $bundledInstaller -PathType Leaf) -and
        (Invoke-WebView2RuntimeInstaller $bundledInstaller 'the bundled offline x64 installer')) {
      Write-Host "${label}: installed from bundled offline runtime"
      return
    }

    if ((Install-WingetPackage $label 'Microsoft.EdgeWebView2Runtime') -and (Test-WebView2Runtime)) {
      Write-Host "${label}: installed with winget"
      return
    }

    if (Install-WebView2Bootstrapper) {
      Write-Host "${label}: installed with the Microsoft bootstrapper"
      return
    }
  }

  Write-Host "${label}: missing"
  $missing.Add($label) | Out-Null
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
  $javaLabel = "Java $preferredJavaMajor+"
  if (Test-JavaRuntime) {
    Write-Host "${javaLabel}: OK"
    return
  }

  if ($InstallMissing) {
    if (Install-WingetPackage $javaLabel 'EclipseAdoptium.Temurin.17.JRE') {
      if (Get-Command Update-JavaRuntimeEnvironment -ErrorAction SilentlyContinue) {
        Update-JavaRuntimeEnvironment
      }
      if (Test-JavaRuntime) {
        Write-Host "${javaLabel}: installed"
        return
      }
      Write-Host "$javaLabel winget finished, but Java is still not visible; trying local runtime."
    }

    if (Get-Command Install-LocalJavaRuntime -ErrorAction SilentlyContinue) {
      $downloadRoot = Join-Path $rootPath 'out\runtime-installers'
      if (Install-LocalJavaRuntime -Root $rootPath -DownloadRoot $downloadRoot) {
        if (Test-JavaRuntime) {
          Write-Host "${javaLabel}: local runtime installed"
          return
        }
      }
    }
  }

  Write-Host "${javaLabel}: missing"
  $missing.Add($javaLabel) | Out-Null
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
Ensure-Dependency '.NET Desktop Runtime 8 (or bundled self-contained client)' { Test-DotNetDesktop8 } 'Microsoft.DotNet.DesktopRuntime.8'
Ensure-WebView2Runtime
Ensure-Dependency 'Node.js LTS' { Test-Node } 'OpenJS.NodeJS.LTS'
Ensure-GesturePythonRuntime

if ($missing.Count -gt 0) {
  Write-Host ('Missing dependencies: ' + ($missing -join ', '))
  exit 1
}

Write-Host 'Runtime dependencies: OK'
