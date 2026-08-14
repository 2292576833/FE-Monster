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
    $properties = Get-ItemProperty -LiteralPath $path -Name @('pv', 'location') -ErrorAction SilentlyContinue
    $version = if ($null -eq $properties) { '' } else { [string]$properties.pv }
    if (![string]::IsNullOrWhiteSpace($version)) {
      $parsedVersion = $null
      if ([version]::TryParse($version, [ref]$parsedVersion) -and
          $parsedVersion -gt [version]'0.0.0.0') {
        $candidateLocations = New-Object System.Collections.Generic.List[string]
        $location = [string]$properties.location
        if (![string]::IsNullOrWhiteSpace($location)) {
          $candidateLocations.Add($location) | Out-Null
        }
        foreach ($standardLocation in @(
          (Join-Path ${Env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'),
          (Join-Path $Env:ProgramFiles 'Microsoft\EdgeWebView\Application'),
          (Join-Path $Env:LOCALAPPDATA 'Microsoft\EdgeWebView\Application')
        )) {
          if (!$candidateLocations.Contains($standardLocation)) {
            $candidateLocations.Add($standardLocation) | Out-Null
          }
        }
        foreach ($candidateLocation in $candidateLocations) {
          $runtimeExecutable = Join-Path `
            $candidateLocation `
            (Join-Path $parsedVersion.ToString() 'msedgewebview2.exe')
          if (Test-Path -LiteralPath $runtimeExecutable -PathType Leaf) {
            try {
              $runtimeFile = Get-Item -LiteralPath $runtimeExecutable
              $fileVersion = $null
              if ([version]::TryParse(
                  [string]$runtimeFile.VersionInfo.ProductVersion,
                  [ref]$fileVersion
              ) -and $fileVersion -eq $parsedVersion) {
                $probe = Start-Process `
                  -FilePath $runtimeExecutable `
                  -ArgumentList @('--embedded-browser-webview=1', '--version') `
                  -WindowStyle Hidden `
                  -PassThru
                if ($null -ne $probe -and $probe.WaitForExit(5000)) {
                  if ($probe.ExitCode -eq 0) { return $true }
                  continue
                }
                if ($null -ne $probe) {
                  try { Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue } catch {}
                }
              }
            } catch {
            }
          }
        }
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
  $bundledInstaller = Join-Path $rootPath 'runtime\installers\MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  $resolvedBundledInstaller = [IO.Path]::GetFullPath($bundledInstaller)

  # The complete offline setup verifies every staged file against
  # payload-integrity.json before this script runs. On a newly installed or
  # offline Windows computer, Authenticode chain building can still report
  # NotTrusted/UnknownError because the local root-certificate store is stale.
  # Revalidate the bundled installer's exact manifest hash here so that an
  # unavailable certificate service cannot make an otherwise valid offline
  # installation impossible. Downloaded executables still require a fully
  # valid Microsoft Authenticode result below.
  if ([string]::Equals(
      $resolvedPath,
      $resolvedBundledInstaller,
      [StringComparison]::OrdinalIgnoreCase
  )) {
    $manifestPath = Join-Path $rootPath 'payload-integrity.json'
    try {
      $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
      $relativePath = 'runtime/installers/MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
      $entry = @($manifest.files | Where-Object {
        [string]::Equals([string]$_.path, $relativePath, [StringComparison]::OrdinalIgnoreCase)
      }) | Select-Object -First 1
      if ($null -ne $entry -and
          [int64]$entry.length -eq (Get-Item -LiteralPath $Path).Length) {
        $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
        if ([string]::Equals(
            $actualHash,
            [string]$entry.sha256,
            [StringComparison]::OrdinalIgnoreCase
        )) {
          Write-Host 'Bundled WebView2 installer passed the activated payload integrity manifest.'
          return $true
        }
      }
      Write-Host 'Bundled WebView2 installer did not match payload-integrity.json.'
      return $false
    } catch {
      Write-Host "Bundled WebView2 integrity validation failed: $($_.Exception.Message)"
      return $false
    }
  }

  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
  } catch {
    Write-Host "Authenticode validation could not run for $(Split-Path -Leaf $Path): $($_.Exception.Message)"
    return $false
  }
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
  $acceptedExitCode = $process.ExitCode -in @(0, 3010)
  if ($process.ExitCode -eq 3010) {
    Write-Host 'WebView2 installer requested a restart; setup will continue only if the Runtime is already detectable.'
  }

  $detectionAttempts = if ($acceptedExitCode) { 30 } else { 5 }
  for ($attempt = 1; $attempt -le $detectionAttempts; $attempt += 1) {
    if (Test-WebView2Runtime) {
      if (!$acceptedExitCode) {
        Write-Host "WebView2 installer returned exit code $($process.ExitCode), but the Runtime is already detectable; accepting the installed state."
      }
      return $true
    }
    Start-Sleep -Seconds 1
  }
  if (!$acceptedExitCode) {
    Write-Host "WebView2 installer failed with exit code $($process.ExitCode), and the Runtime is not detectable."
    return $false
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
  Write-Host (
    'WebView2 could not be installed from the network. ' +
    'Connect this computer to the Internet and retry, or download or request ' +
    'FE-Monster-Setup-2.1.0-Offline.exe, which includes the signed WebView2 Runtime.'
  )
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

function Invoke-MandatoryDependencyStep {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  try {
    & $Action
  } catch {
    Write-Host "${Name}: check failed ($($_.Exception.Message))"
    if (!$missing.Contains($Name)) { $missing.Add($Name) | Out-Null }
  }
}

Invoke-MandatoryDependencyStep "Java $preferredJavaMajor+" { Ensure-JavaRuntime }
Invoke-MandatoryDependencyStep '.NET Desktop Runtime 8 (or bundled self-contained client)' {
  Ensure-Dependency '.NET Desktop Runtime 8 (or bundled self-contained client)' { Test-DotNetDesktop8 } 'Microsoft.DotNet.DesktopRuntime.8'
}
Invoke-MandatoryDependencyStep 'Microsoft Edge WebView2 Runtime' { Ensure-WebView2Runtime }
Invoke-MandatoryDependencyStep 'Node.js LTS' {
  Ensure-Dependency 'Node.js LTS' { Test-Node } 'OpenJS.NodeJS.LTS'
}

if ($missing.Count -gt 0) {
  Write-Host ('Missing dependencies: ' + ($missing -join ', '))
  exit 1
}
Write-Host 'Runtime dependencies: OK'
