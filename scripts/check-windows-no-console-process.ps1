param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$helperPath = Join-Path $rootPath 'scripts\windows-no-console-process.ps1'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$probeRoot = [IO.Path]::GetFullPath((Join-Path $tempBase (
  'fe-monster-no-console-' + [Guid]::NewGuid().ToString('N')
)))

if (!$probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe no-console probe directory: $probeRoot"
}
if (!(Test-Path -LiteralPath $helperPath -PathType Leaf)) {
  throw "No-console process helper is missing: $helperPath"
}

try {
  New-Item -ItemType Directory -Path $probeRoot -Force | Out-Null
  $probeScript = Join-Path $probeRoot 'capture-arguments.ps1'
  $argumentOutput = Join-Path $probeRoot 'arguments.txt'
  $processLog = Join-Path $probeRoot 'process.log'
  Set-Content -LiteralPath $probeScript -Encoding UTF8 -Value @'
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ForwardedArguments = @()
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ConsoleProbe
{
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
}
"@

if ([ConsoleProbe]::GetConsoleWindow() -ne [IntPtr]::Zero) {
  [Console]::Error.WriteLine('probe unexpectedly owns a console window')
  exit 24
}

$encoded = @($ForwardedArguments | ForEach-Object {
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_))
})
[IO.File]::WriteAllLines(
  $Env:FE_MONSTER_ARGUMENT_PROBE,
  $encoded,
  [Text.UTF8Encoding]::new($false)
)
[Console]::Error.WriteLine('probe-stderr-preserved')
exit 23
'@

  . $helperPath
  $expectedArguments = @(
    'alpha',
    'two words',
    'quote"inside',
    'C:\trailing\',
    '歌词 清晰'
  )
  $previousProbePath = $Env:FE_MONSTER_ARGUMENT_PROBE
  $Env:FE_MONSTER_ARGUMENT_PROBE = $argumentOutput
  try {
    $powerShellExecutable = (Get-Command powershell.exe -ErrorAction Stop).Source
    $result = Invoke-NoConsoleProcess `
      -FilePath $powerShellExecutable `
      -ArgumentList (@(
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $probeScript
      ) + $expectedArguments) `
      -WorkingDirectory $probeRoot `
      -Wait `
      -CaptureOutput `
      -LogPath $processLog
  } finally {
    if ($null -eq $previousProbePath) {
      Remove-Item Env:FE_MONSTER_ARGUMENT_PROBE -ErrorAction SilentlyContinue
    } else {
      $Env:FE_MONSTER_ARGUMENT_PROBE = $previousProbePath
    }
  }

  if ($result.ExitCode -ne 23) {
    throw "No-console child returned $($result.ExitCode), expected 23. stderr: $($result.StandardError)"
  }
  if ($result.StandardError -notmatch 'probe-stderr-preserved') {
    throw 'No-console child stderr was not preserved.'
  }
  if (!(Test-Path -LiteralPath $argumentOutput -PathType Leaf)) {
    throw 'No-console child did not write the argument probe.'
  }
  $actualArguments = @(Get-Content -LiteralPath $argumentOutput | ForEach-Object {
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_))
  })
  if ($actualArguments.Count -ne $expectedArguments.Count) {
    throw "Argument count changed: expected $($expectedArguments.Count), got $($actualArguments.Count)."
  }
  for ($index = 0; $index -lt $expectedArguments.Count; $index += 1) {
    if ($actualArguments[$index] -cne $expectedArguments[$index]) {
      throw "Argument $index changed: expected '$($expectedArguments[$index])', got '$($actualArguments[$index])'."
    }
  }
  $logged = Get-Content -Raw -LiteralPath $processLog
  if ($logged -notmatch 'exited with code 23' -or $logged -notmatch 'probe-stderr-preserved') {
    throw 'No-console process diagnostics were not written to the requested log.'
  }

  Write-Output 'Windows no-console process regression: OK (no console; arguments, exit code, and stderr preserved).'
} finally {
  if ($probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $probeRoot -PathType Container)) {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
