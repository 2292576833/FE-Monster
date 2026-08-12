param(
  [string]$Root = '',
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ClientArgs = @()
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$outDir = Join-Path $rootPath 'out'
$logFile = Join-Path $outDir 'launch.log'
$buildLogFile = Join-Path $outDir 'launch-build.log'
$mainExecutable = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
$javaJar = Join-Path $rootPath 'out\fe-monster-java.jar'

function Write-Log {
  param([string]$Message)
  if (!(Test-Path -LiteralPath $outDir -PathType Container)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }
  Add-Content `
    -LiteralPath $logFile `
    -Encoding UTF8 `
    -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Show-VisibleError {
  param([string]$Message)
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    'FE Monster',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

try {
  . (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')
  Write-Log 'Legacy launcher delegated to the named FE Monster host.'

  if (!(Test-Path -LiteralPath $javaJar -PathType Leaf)) {
    $javaBuilder = Join-Path $rootPath 'scripts\build-java.ps1'
    Write-Log 'Java backend is missing; building it from source.'
    $javaBuild = Invoke-NoConsoleProcess `
      -FilePath (Get-Command powershell.exe -ErrorAction Stop).Source `
      -ArgumentList @(
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $javaBuilder,
        '-Root',
        $rootPath
      ) `
      -WorkingDirectory $rootPath `
      -Wait `
      -CaptureOutput `
      -LogPath $buildLogFile
    if ($javaBuild.ExitCode -ne 0 -or !(Test-Path -LiteralPath $javaJar -PathType Leaf)) {
      throw "FE Monster Java backend build failed with exit code $($javaBuild.ExitCode). See $buildLogFile"
    }
  }

  if (!(Test-Path -LiteralPath $mainExecutable -PathType Leaf)) {
    $clientBuilder = Join-Path $rootPath 'scripts\build-winforms-client.ps1'
    Write-Log 'Windows host is missing; building it from source.'
    $clientBuild = Invoke-NoConsoleProcess `
      -FilePath (Get-Command powershell.exe -ErrorAction Stop).Source `
      -ArgumentList @(
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $clientBuilder,
        '-Root',
        $rootPath
      ) `
      -WorkingDirectory $rootPath `
      -Wait `
      -CaptureOutput `
      -LogPath $buildLogFile
    if ($clientBuild.ExitCode -ne 0 -or !(Test-Path -LiteralPath $mainExecutable -PathType Leaf)) {
      throw "FE Monster Windows host build failed with exit code $($clientBuild.ExitCode). Install .NET SDK 8 and try again. See $buildLogFile"
    }
  }

  $process = Invoke-NoConsoleProcess `
    -FilePath $mainExecutable `
    -ArgumentList $ClientArgs `
    -WorkingDirectory $rootPath `
    -WindowStyle Normal
  $exitedDuringHandoff = $process.WaitForExit(50)
  if ($exitedDuringHandoff -and $process.ExitCode -ne 0) {
    throw "FE Monster exited during startup with code $($process.ExitCode). See $Env:LOCALAPPDATA\FE Monster\logs\startup.log"
  }
  Write-Log "FE Monster host started with process id $($process.Id)."
} catch {
  $message = $_.Exception.Message
  Write-Log "Launch failed: $message"
  Show-VisibleError "FE Monster failed to start.`n`n$message`n`nLaunch log:`n$logFile"
  exit 1
}
