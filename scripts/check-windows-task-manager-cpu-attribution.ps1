[CmdletBinding()]
param(
  [int]$MainProcessId = 0,
  [ValidateRange(500, 10000)]
  [int]$SampleMilliseconds = 1500,
  [switch]$LaunchIfMissing
)

$ErrorActionPreference = 'Stop'
$rootPath = Split-Path -Parent $PSScriptRoot
$sourceClient = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
$processTreePath = Join-Path $rootPath 'out\process-tree.json'
$startedProcess = $null

function Get-ProcessSnapshot {
  return @(Get-CimInstance Win32_Process -ErrorAction Stop)
}

function Get-SourceMainProcess {
  param([object[]]$Snapshot)

  if ($MainProcessId -gt 0) {
    return @($Snapshot | Where-Object { [int]$_.ProcessId -eq $MainProcessId } | Select-Object -First 1)
  }

  $resolvedSourceClient = if (Test-Path -LiteralPath $sourceClient -PathType Leaf) {
    [System.IO.Path]::GetFullPath($sourceClient)
  } else {
    ''
  }
  return @(
    $Snapshot |
      Where-Object {
        $_.Name -eq 'FE Monster.exe' -and
        (
          [string]::IsNullOrWhiteSpace($resolvedSourceClient) -or
          [string]::Equals(
            [string]$_.ExecutablePath,
            $resolvedSourceClient,
            [StringComparison]::OrdinalIgnoreCase
          )
        )
      } |
      Sort-Object CreationDate -Descending |
      Select-Object -First 1
  )
}

function Get-DescendantIds {
  param(
    [object[]]$Snapshot,
    [int]$RootProcessId
  )

  $ids = [Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootProcessId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($candidate in $Snapshot) {
      if (
        $ids.Contains([int]$candidate.ParentProcessId) -and
        $ids.Add([int]$candidate.ProcessId)
      ) {
        $changed = $true
      }
    }
  }
  return @($ids)
}

function Wait-ForProcessFamily {
  param([int]$RootProcessId)

  $deadline = [DateTime]::UtcNow.AddSeconds(35)
  while ([DateTime]::UtcNow -lt $deadline) {
    $snapshot = Get-ProcessSnapshot
    $ids = Get-DescendantIds -Snapshot $snapshot -RootProcessId $RootProcessId
    $backend = @(
      $snapshot |
        Where-Object {
          $ids -contains [int]$_.ProcessId -and
          [int]$_.ParentProcessId -eq $RootProcessId -and
          (
            $_.Name -in @('FE Monster Backend.exe', 'javaw.exe', 'java.exe') -or
            $_.CommandLine -like '*fe-monster-java.jar*'
          )
        }
    )
    $webViewBrowser = @(
      $snapshot |
        Where-Object {
          $_.Name -eq 'msedgewebview2.exe' -and
          [int]$_.ParentProcessId -eq $RootProcessId -and
          $_.CommandLine -like '*--embedded-browser-webview=1*'
        }
    )
    if ($backend.Count -gt 0 -and $webViewBrowser.Count -gt 0) {
      return @{
        Snapshot = $snapshot
        Ids = $ids
        Backend = $backend[0]
        WebViewBrowser = $webViewBrowser[0]
      }
    }

    if ($null -eq (Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue)) {
      throw "FE Monster exited before its backend and WebView2 process group became ready."
    }
    Start-Sleep -Milliseconds 250
  }
  throw "FE Monster did not expose a complete backend + WebView2 child process group within 35 seconds."
}

try {
  $snapshot = Get-ProcessSnapshot
  $main = @(Get-SourceMainProcess -Snapshot $snapshot)
  if ($main.Count -eq 0) {
    if (!$LaunchIfMissing) {
      throw "FE Monster is not running. Start it first or rerun with -LaunchIfMissing."
    }
    if (!(Test-Path -LiteralPath $sourceClient -PathType Leaf)) {
      throw "Source client was not found: $sourceClient"
    }

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $sourceClient
    $startInfo.WorkingDirectory = $rootPath
    $startInfo.UseShellExecute = $false
    $startInfo.Environment['FE_MONSTER_ROOT'] = $rootPath
    $startedProcess = [Diagnostics.Process]::Start($startInfo)
    if ($null -eq $startedProcess) {
      throw "FE Monster could not be launched."
    }
    $MainProcessId = $startedProcess.Id
    $snapshot = Get-ProcessSnapshot
    $main = @($snapshot | Where-Object { [int]$_.ProcessId -eq $MainProcessId })
  } else {
    $MainProcessId = [int]$main[0].ProcessId
  }

  $family = Wait-ForProcessFamily -RootProcessId $MainProcessId
  $snapshot = $family.Snapshot
  $familyIds = @($family.Ids)
  $byId = @{}
  foreach ($item in $snapshot) {
    $byId[[int]$item.ProcessId] = $item
  }

  $beforeCpu = @{}
  foreach ($processId in $familyIds) {
    $runtimeProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -ne $runtimeProcess) {
      $beforeCpu[$processId] = $runtimeProcess.TotalProcessorTime.TotalMilliseconds
      $runtimeProcess.Dispose()
    }
  }

  Start-Sleep -Milliseconds $SampleMilliseconds

  $mainCpuMilliseconds = 0.0
  $familyCpuMilliseconds = 0.0
  $members = @()
  foreach ($processId in $familyIds) {
    if (!$beforeCpu.ContainsKey($processId)) {
      continue
    }
    $runtimeProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $runtimeProcess) {
      continue
    }
    $delta = [Math]::Max(
      0,
      $runtimeProcess.TotalProcessorTime.TotalMilliseconds - [double]$beforeCpu[$processId]
    )
    $familyCpuMilliseconds += $delta
    if ($processId -eq $MainProcessId) {
      $mainCpuMilliseconds = $delta
    }
    $metadata = $byId[$processId]
    $members += [pscustomobject]@{
      name = [string]$metadata.Name
      processId = $processId
      parentProcessId = [int]$metadata.ParentProcessId
      sampledCpuMilliseconds = [Math]::Round($delta, 1)
    }
    $runtimeProcess.Dispose()
  }

  $logicalProcessors = [Environment]::ProcessorCount
  $normalizer = $SampleMilliseconds * $logicalProcessors
  $mainCpuPercent = [Math]::Round($mainCpuMilliseconds / $normalizer * 100, 3)
  $familyCpuPercent = [Math]::Round($familyCpuMilliseconds / $normalizer * 100, 3)
  $backend = $family.Backend
  $webViewBrowser = $family.WebViewBrowser

  $treeReportMatches = $false
  if (Test-Path -LiteralPath $processTreePath -PathType Leaf) {
    try {
      $treeReport = Get-Content -Raw -LiteralPath $processTreePath | ConvertFrom-Json
      $treeReportMatches =
        [int]$treeReport.mainProcessId -eq $MainProcessId -and
        [int]$treeReport.backendProcessId -eq [int]$backend.ProcessId
    } catch {
      $treeReportMatches = $false
    }
  }

  $result = [ordered]@{
    ok = $true
    mainProcessId = $MainProcessId
    backend = [ordered]@{
      name = [string]$backend.Name
      processId = [int]$backend.ProcessId
      directChildOfMain = [int]$backend.ParentProcessId -eq $MainProcessId
    }
    webView2 = [ordered]@{
      browserProcessId = [int]$webViewBrowser.ProcessId
      directChildOfMain = [int]$webViewBrowser.ParentProcessId -eq $MainProcessId
      processCount = @($members | Where-Object { $_.name -eq 'msedgewebview2.exe' }).Count
    }
    sample = [ordered]@{
      milliseconds = $SampleMilliseconds
      logicalProcessors = $logicalProcessors
      mainProcessCpuPercent = $mainCpuPercent
      completeProcessFamilyCpuPercent = $familyCpuPercent
      members = @($members | Sort-Object sampledCpuMilliseconds -Descending)
    }
    taskManager = [ordered]@{
      processesTabAttributionReady = $true
      detailsTabIsPerProcess = $true
      mainMayCorrectlyRoundToZero = $mainCpuPercent -lt 0.05 -and $familyCpuPercent -gt $mainCpuPercent
      processTreeDiagnosticMatches = $treeReportMatches
      guidance = 'Use Task Manager > Processes, sort by Name, and expand FE Monster. Details reports each process separately; WebView2 render/GPU CPU is not charged to FE Monster.exe there.'
    }
  }
  $result | ConvertTo-Json -Depth 8
} finally {
  if ($null -ne $startedProcess) {
    $cleanupSnapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $cleanupIds = @(Get-DescendantIds -Snapshot $cleanupSnapshot -RootProcessId $startedProcess.Id)
    Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
    foreach ($processId in $cleanupIds) {
      if ($processId -ne $startedProcess.Id) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
    $startedProcess.Dispose()
  }
}
