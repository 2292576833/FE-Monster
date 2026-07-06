$Script:PreferredJavaMajor = 26
$Script:MinimumJavaMajor = 17
$Script:TemurinJavaRuntimeUrl = "https://api.adoptium.net/v3/binary/latest/$Script:PreferredJavaMajor/ga/windows/x64/jre/hotspot/normal/eclipse"

function Update-JavaRuntimeEnvironment {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $processPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
  $pathParts = @($machinePath, $userPath, $processPath) | Where-Object { ![string]::IsNullOrWhiteSpace($_) }
  if ($pathParts.Count -gt 0) {
    $Env:Path = ($pathParts -join ';')
  }

  $machineJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
  $userJavaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
  if (![string]::IsNullOrWhiteSpace($machineJavaHome)) {
    $Env:JAVA_HOME = $machineJavaHome
  } elseif (![string]::IsNullOrWhiteSpace($userJavaHome)) {
    $Env:JAVA_HOME = $userJavaHome
  }
}

function Get-JavaRegistryHomes {
  $homes = New-Object System.Collections.Generic.List[string]
  $roots = @(
    'HKLM:\SOFTWARE\Eclipse Adoptium\JDK',
    'HKLM:\SOFTWARE\Eclipse Adoptium\JRE',
    'HKLM:\SOFTWARE\WOW6432Node\Eclipse Adoptium\JDK',
    'HKLM:\SOFTWARE\WOW6432Node\Eclipse Adoptium\JRE',
    'HKLM:\SOFTWARE\JavaSoft\JDK',
    'HKLM:\SOFTWARE\JavaSoft\Java Runtime Environment',
    'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\JDK',
    'HKLM:\SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment',
    'HKCU:\SOFTWARE\Eclipse Adoptium\JDK',
    'HKCU:\SOFTWARE\Eclipse Adoptium\JRE',
    'HKCU:\SOFTWARE\JavaSoft\JDK',
    'HKCU:\SOFTWARE\JavaSoft\Java Runtime Environment'
  )

  foreach ($root in $roots) {
    if (!(Test-Path $root)) { continue }
    $keys = @(Get-Item -Path $root -ErrorAction SilentlyContinue)
    $keys += @(Get-ChildItem -Path $root -ErrorAction SilentlyContinue)
    foreach ($key in $keys) {
      if ($null -eq $key) { continue }
      $candidateKeys = @(
        $key.PSPath,
        (Join-Path $key.PSPath 'MSI'),
        (Join-Path $key.PSPath 'hotspot\MSI')
      )
      foreach ($candidateKey in $candidateKeys) {
        if (!(Test-Path $candidateKey)) { continue }
        $properties = Get-ItemProperty -Path $candidateKey -ErrorAction SilentlyContinue
        if ($null -eq $properties) { continue }
        foreach ($name in @('Path', 'JavaHome', 'InstallationPath')) {
          $value = $properties.PSObject.Properties[$name]
          if ($null -ne $value -and ![string]::IsNullOrWhiteSpace([string]$value.Value)) {
            $homes.Add(([string]$value.Value).TrimEnd('\')) | Out-Null
          }
        }
      }
    }
  }

  return $homes.ToArray()
}

function Get-JavaSearchRoots {
  param([string]$Root = '')

  $roots = New-Object System.Collections.Generic.List[string]
  if (![string]::IsNullOrWhiteSpace($Root)) {
    $roots.Add((Join-Path $Root 'runtime\java')) | Out-Null
  }
  foreach ($explicitRoot in @(
    $Env:FE_JAVA26_HOME,
    $Env:FE_JAVA_HOME,
    'E:\java26',
    'D:\java26',
    'C:\java26'
  )) {
    if (![string]::IsNullOrWhiteSpace($explicitRoot)) {
      $roots.Add($explicitRoot.TrimEnd('\')) | Out-Null
    }
  }
  if (![string]::IsNullOrWhiteSpace($Env:JAVA_HOME)) {
    $roots.Add($Env:JAVA_HOME.TrimEnd('\')) | Out-Null
  }
  foreach ($registryHome in Get-JavaRegistryHomes) {
    if (![string]::IsNullOrWhiteSpace($registryHome)) { $roots.Add($registryHome.TrimEnd('\')) | Out-Null }
  }
  foreach ($root in @(
    (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
    (Join-Path $Env:ProgramFiles 'Java'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Eclipse Adoptium'),
    (Join-Path ${Env:ProgramFiles(x86)} 'Java')
  )) {
    if (![string]::IsNullOrWhiteSpace($root)) { $roots.Add($root) | Out-Null }
  }

  return $roots.ToArray() | Select-Object -Unique
}

function Add-JavaCandidate {
  param(
    [System.Collections.Generic.List[string]]$Candidates,
    [string]$Path
  )
  if ([string]::IsNullOrWhiteSpace($Path) -or !(Test-Path $Path)) { return }
  if (!($Candidates | Where-Object { [string]::Equals($_, $Path, [StringComparison]::OrdinalIgnoreCase) })) {
    $Candidates.Add($Path) | Out-Null
  }
}

function Get-JavaExecutableCandidates {
  param(
    [string]$Root = '',
    [switch]$PreferWindowless
  )

  $candidates = New-Object System.Collections.Generic.List[string]
  $names = if ($PreferWindowless) { @('javaw.exe', 'java.exe') } else { @('java.exe', 'javaw.exe') }

  foreach ($root in Get-JavaSearchRoots -Root $Root) {
    if ([string]::IsNullOrWhiteSpace($root) -or !(Test-Path $root)) { continue }
    foreach ($name in $names) {
      Add-JavaCandidate $candidates (Join-Path $root "bin\$name")
    }
    foreach ($name in $names) {
      $match = Get-ChildItem -Path $root -Recurse -Filter $name -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($null -ne $match) { Add-JavaCandidate $candidates $match.FullName }
    }
  }

  foreach ($name in $names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -ne $command) { Add-JavaCandidate $candidates $command.Source }
  }

  return $candidates.ToArray()
}

function Get-JavaMajorVersion {
  param([string]$JavaExe)

  if ([string]::IsNullOrWhiteSpace($JavaExe) -or !(Test-Path $JavaExe)) { return 0 }
  $probe = $JavaExe
  if ([string]::Equals((Split-Path -Leaf $JavaExe), 'javaw.exe', [StringComparison]::OrdinalIgnoreCase)) {
    $java = Join-Path (Split-Path -Parent $JavaExe) 'java.exe'
    if (Test-Path $java) { $probe = $java }
  }

  $command = '"' + $probe + '" -version 2>&1'
  $text = (& cmd.exe /d /c $command) | Out-String
  $match = [regex]::Match($text, '"(?<first>\d+)(?:\.(?<second>\d+))?')
  if (!$match.Success) { return 0 }
  $first = [int]$match.Groups['first'].Value
  if ($first -eq 1 -and $match.Groups['second'].Success) {
    return [int]$match.Groups['second'].Value
  }
  return $first
}

function Find-JavaRuntime {
  param(
    [string]$Root = '',
    [int]$MinimumMajor = $Script:MinimumJavaMajor,
    [switch]$PreferWindowless
  )

  Update-JavaRuntimeEnvironment
  $best = ''
  $bestMajor = 0
  foreach ($candidate in Get-JavaExecutableCandidates -Root $Root -PreferWindowless:$PreferWindowless) {
    $major = Get-JavaMajorVersion $candidate
    if ($major -ge $MinimumMajor -and $major -gt $bestMajor) {
      $best = $candidate
      $bestMajor = $major
    }
  }
  return $best
}

function Assert-JavaRuntimeTarget {
  param(
    [string]$Root,
    [string]$Target
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  $targetFull = [System.IO.Path]::GetFullPath($Target).TrimEnd('\')
  if ([string]::IsNullOrWhiteSpace($rootFull) -or !$targetFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe Java runtime target: $targetFull"
  }
  return $targetFull
}

function Install-LocalJavaRuntime {
  param(
    [string]$Root,
    [string]$DownloadRoot = (Join-Path ([System.IO.Path]::GetTempPath()) 'fe-monster-runtime'),
    [scriptblock]$Logger = $null,
    [switch]$Force
  )

  function Write-JavaRuntimeLog {
    param([string]$Message)
    if ($null -ne $Logger) {
      & $Logger $Message
    } else {
      Write-Host $Message
    }
  }

  if (!$Force) {
    $existing = Find-JavaRuntime -Root $Root
    if (![string]::IsNullOrWhiteSpace($existing)) {
      Write-JavaRuntimeLog "Java runtime found: $existing"
      return $true
    }
  }

  $target = Assert-JavaRuntimeTarget -Root $Root -Target (Join-Path $Root 'runtime\java')
  if (!(Test-Path $DownloadRoot)) { New-Item -ItemType Directory -Path $DownloadRoot -Force | Out-Null }
  $archive = Join-Path $DownloadRoot ("temurin-jre-$Script:PreferredJavaMajor.zip")
  $extractRoot = Join-Path $DownloadRoot ('java-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-JavaRuntimeLog "Downloading Java $Script:PreferredJavaMajor runtime from Eclipse Adoptium..."
    $previousProgressPreference = $ProgressPreference
    try {
      $ProgressPreference = 'SilentlyContinue'
      Invoke-WebRequest -Uri $Script:TemurinJavaRuntimeUrl -OutFile $archive -UseBasicParsing
    } finally {
      $ProgressPreference = $previousProgressPreference
    }
    if (!(Test-Path $archive) -or (Get-Item $archive).Length -lt 1000000) {
      throw 'Downloaded Java runtime archive is missing or too small.'
    }

    if (Test-Path $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $extractRoot | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force

    $javaHome = Get-ChildItem -Path $extractRoot -Directory -Recurse -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
      Select-Object -First 1
    if ($null -eq $javaHome) {
      throw 'Downloaded Java runtime did not contain bin\java.exe.'
    }

    if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Move-Item -LiteralPath $javaHome.FullName -Destination $target -Force

    $installed = Find-JavaRuntime -Root $Root
    if ([string]::IsNullOrWhiteSpace($installed)) {
      throw 'Installed local Java runtime could not be verified.'
    }
    Write-JavaRuntimeLog "Local Java runtime installed: $installed"
    return $true
  } catch {
    Write-JavaRuntimeLog ("Local Java runtime install failed: " + $_.Exception.Message)
    return $false
  } finally {
    try {
      if (Test-Path $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue }
    } catch {
    }
  }
}

function Install-LocalJava17Runtime {
  param(
    [string]$Root,
    [string]$DownloadRoot = (Join-Path ([System.IO.Path]::GetTempPath()) 'fe-monster-runtime'),
    [scriptblock]$Logger = $null,
    [switch]$Force
  )

  return Install-LocalJavaRuntime -Root $Root -DownloadRoot $DownloadRoot -Logger $Logger -Force:$Force
}
