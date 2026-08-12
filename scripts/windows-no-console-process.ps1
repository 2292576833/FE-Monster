function ConvertTo-WindowsProcessArgument {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) { return '""' }
  return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Write-NoConsoleProcessOutput {
  param([Parameter(Mandatory = $true)][object]$Result)

  if (![string]::IsNullOrWhiteSpace($Result.StandardOutput)) {
    Write-Host $Result.StandardOutput.TrimEnd()
  }
  if (![string]::IsNullOrWhiteSpace($Result.StandardError)) {
    Write-Host $Result.StandardError.TrimEnd()
  }
}

function Invoke-NoConsoleProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = '',
    [switch]$Wait,
    [switch]$CaptureOutput,
    [string]$LogPath = '',
    [Diagnostics.ProcessWindowStyle]$WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
  )

  if ($CaptureOutput -and !$Wait) {
    throw 'CaptureOutput requires Wait so redirected pipes are drained safely.'
  }

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = $WindowStyle
  if (![string]::IsNullOrWhiteSpace($WorkingDirectory)) {
    $startInfo.WorkingDirectory = $WorkingDirectory
  }
  if ($ArgumentList.Count -gt 0) {
    $startInfo.Arguments = ($ArgumentList | ForEach-Object {
      ConvertTo-WindowsProcessArgument $_
    }) -join ' '
  }
  if ($CaptureOutput) {
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (!$process.Start()) {
      throw "Process could not be created: $FilePath"
    }
    if (!$Wait) { return $process }

    $stdoutTask = if ($CaptureOutput) { $process.StandardOutput.ReadToEndAsync() } else { $null }
    $stderrTask = if ($CaptureOutput) { $process.StandardError.ReadToEndAsync() } else { $null }
    $process.WaitForExit()
    $stdout = if ($null -eq $stdoutTask) { '' } else { $stdoutTask.GetAwaiter().GetResult() }
    $stderr = if ($null -eq $stderrTask) { '' } else { $stderrTask.GetAwaiter().GetResult() }
    $result = [pscustomobject]@{
      ExitCode = $process.ExitCode
      StandardOutput = $stdout
      StandardError = $stderr
    }

    if (![string]::IsNullOrWhiteSpace($LogPath)) {
      $logDirectory = Split-Path -Parent $LogPath
      if (![string]::IsNullOrWhiteSpace($logDirectory) -and
          !(Test-Path -LiteralPath $logDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
      }
      $logLines = [Collections.Generic.List[string]]::new()
      $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
      $logLines.Add(('[{0}] {1} exited with code {2}' -f `
        $timestamp, $FilePath, $result.ExitCode)) | Out-Null
      if (![string]::IsNullOrWhiteSpace($stdout)) {
        $logLines.Add("stdout:`r`n$($stdout.TrimEnd())") | Out-Null
      }
      if (![string]::IsNullOrWhiteSpace($stderr)) {
        $logLines.Add("stderr:`r`n$($stderr.TrimEnd())") | Out-Null
      }
      Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value $logLines
    }
    return $result
  } catch {
    $process.Dispose()
    throw
  } finally {
    if ($Wait) { $process.Dispose() }
  }
}
