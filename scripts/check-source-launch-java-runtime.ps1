param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$mainExecutable = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
$processTreePath = Join-Path $rootPath 'out\process-tree.json'
$pathJava = Get-Command java.exe -ErrorAction SilentlyContinue
$pathJavaHome = if ($null -ne $pathJava) {
  Split-Path -Parent (Split-Path -Parent $pathJava.Source)
} else {
  ''
}
$compatibleJavaHome = @(
  $pathJavaHome,
  'E:\java26',
  'D:\java26',
  'C:\java26'
) | Where-Object {
  ![string]::IsNullOrWhiteSpace($_) -and
  (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe') -PathType Leaf)
} | Select-Object -First 1
$legacyJavaHome = @(
  'C:\Program Files\Eclipse Adoptium\jdk-8.0.492.9-hotspot',
  'C:\Program Files\Java\jre1.8.0_451',
  'C:\Program Files\Java\jdk1.8.0_451'
) | Where-Object {
  Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe') -PathType Leaf
} | Select-Object -First 1

if (!(Test-Path -LiteralPath $mainExecutable -PathType Leaf)) {
  throw "Source host is missing: $mainExecutable"
}
if ([string]::IsNullOrWhiteSpace($compatibleJavaHome)) {
  throw 'This regression requires a Java 17+ development/runtime installation.'
}
if ([string]::IsNullOrWhiteSpace($legacyJavaHome)) {
  throw 'This regression requires the installed Java 8 runtime that reproduced the source-start failure.'
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $mainExecutable
$startInfo.WorkingDirectory = $rootPath
$startInfo.UseShellExecute = $false
$startInfo.EnvironmentVariables['FE_MONSTER_ROOT'] = $rootPath
$startInfo.EnvironmentVariables['FE_JAVA26_HOME'] = ''
$startInfo.EnvironmentVariables['FE_JAVA_HOME'] = ''
$startInfo.EnvironmentVariables['FE_JAVA17_HOME'] = ''
$startInfo.EnvironmentVariables['JAVA_HOME'] = $legacyJavaHome
$startInfo.EnvironmentVariables['PATH'] = @(
  (Join-Path $compatibleJavaHome 'bin'),
  (Join-Path $legacyJavaHome 'bin'),
  (Join-Path $Env:SystemRoot 'System32')
) -join ';'

$mainProcess = $null
$backendProcessId = 0
$port = 0
try {
  $mainProcess = [System.Diagnostics.Process]::Start($startInfo)
  if ($null -eq $mainProcess) {
    throw 'The source FE Monster host did not create a process.'
  }

  $report = $null
  $deadline = [DateTime]::UtcNow.AddSeconds(12)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-Path -LiteralPath $processTreePath -PathType Leaf) {
      try {
        $candidate = Get-Content -LiteralPath $processTreePath -Raw | ConvertFrom-Json
        if ([int]$candidate.mainProcessId -eq $mainProcess.Id) {
          $report = $candidate
          break
        }
      } catch {
        # The host may be replacing the report while it is being read.
      }
    }
    Start-Sleep -Milliseconds 100
  }
  if ($null -eq $report) {
    throw "The source host did not write a process report for PID $($mainProcess.Id)."
  }

  $selectedJava = [System.IO.Path]::GetFullPath([string]$report.backendExecutable)
  $expectedJavaRoot = [System.IO.Path]::GetFullPath($compatibleJavaHome).TrimEnd('\') + '\'
  if (!$selectedJava.StartsWith($expectedJavaRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Source host selected an incompatible Java runtime: $selectedJava (expected PATH Java 17+ under $compatibleJavaHome while JAVA_HOME points to Java 8)."
  }

  $backendProcessId = [int]$report.backendProcessId
  $port = [int]$report.port
  $ready = $false
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest `
        -Uri "http://127.0.0.1:$port/api/app/version" `
        -UseBasicParsing `
        -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ready = $true
        break
      }
    } catch {
    }
    Start-Sleep -Milliseconds 150
  }
  if (!$ready) {
    throw "Source backend did not become ready on port $port."
  }

  Write-Output "Source launch Java runtime: OK ($selectedJava, port $port)"
} finally {
  if ($port -gt 0) {
    try {
      Invoke-WebRequest `
        -Uri "http://127.0.0.1:$port/api/app/quit" `
        -UseBasicParsing `
        -TimeoutSec 2 | Out-Null
    } catch {
    }
  }
  if ($null -ne $mainProcess) {
    try {
      if (!$mainProcess.HasExited) {
        Stop-Process -Id $mainProcess.Id -Force -ErrorAction SilentlyContinue
      }
    } catch {
    }
    $mainProcess.Dispose()
  }
  if ($backendProcessId -gt 0) {
    Start-Sleep -Milliseconds 400
    $backend = Get-CimInstance Win32_Process -Filter "ProcessId=$backendProcessId" -ErrorAction SilentlyContinue
    if ($null -ne $backend -and
        [string]$backend.CommandLine -like "*$rootPath*out\fe-monster-java.jar*") {
      Stop-Process -Id $backendProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}
