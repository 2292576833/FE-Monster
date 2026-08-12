param(
  [string]$Executable = '',
  [string]$WorkingDirectory = '',
  [int]$TimeoutSeconds = 35,
  [ValidateRange(0, 60000)]
  [int]$MaxMainWindowMilliseconds = 0,
  [switch]$Runtime
)

$ErrorActionPreference = 'Stop'
$rootPath = Split-Path -Parent $PSScriptRoot
$programPath = Join-Path $rootPath 'native\windows\winforms\Program.cs'
$program = Get-Content -Raw -LiteralPath $programPath

if ($program -match '\bnew\s+StartupForm\s*\(' -or $program -match '\bstartupForm\.Show\s*\(') {
  throw 'Normal startup still creates or shows the temporary StartupForm.'
}
if ($program -notmatch 'backend\s*=\s*BackendHost\.Start\s*\(\s*\)') {
  throw 'Normal startup no longer waits for BackendHost.Start().'
}
if ($program -notmatch 'catch\s*\(\s*Exception\s+error\s*\)[\s\S]{0,700}ShowStartupError\s*\(') {
  throw 'Backend startup failures no longer reach the existing startup error dialog.'
}
if ($program -notmatch 'backend\?\.Dispose\s*\(\s*\)') {
  throw 'The Java backend is no longer disposed when the native host exits.'
}

Write-Host 'Windows startup source contract: OK (no temporary startup form; backend wait and error dialog retained).'

if (!$Runtime -and [string]::IsNullOrWhiteSpace($Executable)) {
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Executable)) {
  $Executable = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
}
$executablePath = (Resolve-Path -LiteralPath $Executable).Path
if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) {
  $candidateRoot = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $executablePath) '..\..\..\..'))
  $WorkingDirectory = if (Test-Path -LiteralPath (Join-Path $candidateRoot 'web')) {
    $candidateRoot
  } else {
    Split-Path -Parent $executablePath
  }
}
$workingDirectoryPath = (Resolve-Path -LiteralPath $WorkingDirectory).Path

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class FeMonsterWindowProbe
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    private static string ReadText(IntPtr hWnd)
    {
        var buffer = new StringBuilder(1024);
        GetWindowText(hWnd, buffer, buffer.Capacity);
        return buffer.ToString();
    }

    private static string ReadClassName(IntPtr hWnd)
    {
        var buffer = new StringBuilder(256);
        GetClassName(hWnd, buffer, buffer.Capacity);
        return buffer.ToString();
    }

    public static string[] Snapshot(int[] processIds)
    {
        var ids = new HashSet<uint>();
        foreach (var processId in processIds) ids.Add((uint)processId);
        var rows = new List<string>();
        EnumWindows((hWnd, unused) => {
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            if (!ids.Contains(processId) || !IsWindowVisible(hWnd)) return true;
            Rect rect;
            GetWindowRect(hWnd, out rect);
            var texts = new List<string>();
            var topText = ReadText(hWnd);
            if (!String.IsNullOrWhiteSpace(topText)) texts.Add(topText);
            EnumChildWindows(hWnd, (child, childUnused) => {
                var childText = ReadText(child);
                if (!String.IsNullOrWhiteSpace(childText)) texts.Add(childText);
                return true;
            }, IntPtr.Zero);
            rows.Add(String.Join(" | ", new [] {
                processId.ToString(),
                ReadClassName(hWnd),
                (rect.Right - rect.Left).ToString(),
                (rect.Bottom - rect.Top).ToString(),
                String.Join(" ", texts)
            }));
            return true;
        }, IntPtr.Zero);
        return rows.ToArray();
    }
}
'@

function Get-ProcessFamilyIds {
  param([int]$RootProcessId)
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $ids = [Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootProcessId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $all) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
        $changed = $true
      }
    }
  }
  return @($ids)
}

$process = $null
$observedStartupWindow = $false
$observedConsoleWindow = $false
$observedMainWindow = $false
$mainWindowMilliseconds = -1
$observedRows = [Collections.Generic.HashSet[string]]::new()
try {
  $startupClock = [Diagnostics.Stopwatch]::StartNew()
  $process = Start-Process -FilePath $executablePath -WorkingDirectory $workingDirectoryPath -PassThru
  $deadline = (Get-Date).AddSeconds([Math]::Max(5, $TimeoutSeconds))
  do {
    Start-Sleep -Milliseconds 100
    $familyIds = @(Get-ProcessFamilyIds -RootProcessId $process.Id)
    foreach ($row in [FeMonsterWindowProbe]::Snapshot($familyIds)) {
      [void]$observedRows.Add($row)
      $parts = $row -split '\|', 5
      if ($parts.Count -lt 5) { continue }
      $className = $parts[1].Trim()
      $width = [int]$parts[2].Trim()
      $height = [int]$parts[3].Trim()
      $text = $parts[4]
      if ($className -in @('ConsoleWindowClass', 'CASCADIA_HOSTING_WINDOW_CLASS')) {
        $observedConsoleWindow = $true
      }
      if ($text -match 'Starting FE Monster local services') {
        $observedStartupWindow = $true
      }
      if ($text -match '\bFE Monster\b' -and $width -ge 640 -and $height -ge 480) {
        $observedMainWindow = $true
        if ($mainWindowMilliseconds -lt 0) {
          $mainWindowMilliseconds = [int][Math]::Round($startupClock.Elapsed.TotalMilliseconds)
        }
      }
    }
    if ($observedStartupWindow -or $observedMainWindow -or $process.HasExited) { break }
  } while ((Get-Date) -lt $deadline)

  if ($observedStartupWindow) {
    throw "Temporary startup window was observed while launching $executablePath."
  }
  if ($observedConsoleWindow) {
    throw "A visible console window was observed in the FE Monster startup process family."
  }
  if (!$observedMainWindow) {
    $exitNote = if ($process.HasExited) { " Process exited with code $($process.ExitCode)." } else { '' }
    throw "The FE Monster main window did not appear within $TimeoutSeconds seconds.$exitNote"
  }
  if ($MaxMainWindowMilliseconds -gt 0 -and $mainWindowMilliseconds -gt $MaxMainWindowMilliseconds) {
    throw "The FE Monster main window took ${mainWindowMilliseconds}ms to appear; budget is ${MaxMainWindowMilliseconds}ms."
  }
  Write-Host "Windows startup runtime contract: OK (main window ${mainWindowMilliseconds}ms; no temporary form or visible console)."
} finally {
  if ($null -ne $process) {
    $familyIds = @(Get-ProcessFamilyIds -RootProcessId $process.Id) | Sort-Object -Descending
    foreach ($processId in $familyIds) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
  if ($observedRows.Count -gt 0) {
    Write-Host 'Observed FE Monster windows:'
    $observedRows | Sort-Object | ForEach-Object { Write-Host "  $_" }
  }
}
