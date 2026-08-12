[CmdletBinding()]
param(
  [ValidateRange(1, 20)]
  [int]$Iterations = 3,
  [ValidateRange(5, 60)]
  [int]$ExitTimeoutSeconds = 12,
  [ValidateRange(5, 90)]
  [int]$StartupTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$clientPath = Join-Path $rootPath 'native\windows\build\winforms\FE Monster.exe'
$temporaryRoot = Join-Path $rootPath '.tmp\process-exit-tests'

if (!(Test-Path -LiteralPath $clientPath -PathType Leaf)) {
  throw "FE Monster client was not found: $clientPath"
}

function Get-ProcessSnapshot {
  return @(Get-CimInstance Win32_Process -ErrorAction Stop)
}

function Get-DescendantIds {
  param(
    [object[]]$Snapshot,
    [int]$RootProcessId
  )

  $root = @($Snapshot | Where-Object { [int]$_.ProcessId -eq $RootProcessId } | Select-Object -First 1)
  if ($root.Count -eq 0) {
    return @($RootProcessId)
  }

  $ids = [Collections.Generic.HashSet[int]]::new()
  $createdAt = [Collections.Generic.Dictionary[int, DateTime]]::new()
  [void]$ids.Add($RootProcessId)
  $createdAt[$RootProcessId] = [DateTime]$root[0].CreationDate
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($candidate in $Snapshot) {
      $parentProcessId = [int]$candidate.ParentProcessId
      $processId = [int]$candidate.ProcessId
      if (
        $createdAt.ContainsKey($parentProcessId) -and
        [DateTime]$candidate.CreationDate -ge $createdAt[$parentProcessId] -and
        $ids.Add($processId)
      ) {
        $createdAt[$processId] = [DateTime]$candidate.CreationDate
        $changed = $true
      }
    }
  }
  return @($ids)
}

function Add-FamilyMembers {
  param(
    [Collections.Generic.Dictionary[int, string]]$Tracked,
    [object[]]$Snapshot,
    [int]$RootProcessId
  )

  foreach ($processId in @(Get-DescendantIds -Snapshot $Snapshot -RootProcessId $RootProcessId)) {
    $process = @($Snapshot | Where-Object { [int]$_.ProcessId -eq $processId } | Select-Object -First 1)
    if ($process.Count -gt 0 -and !$Tracked.ContainsKey($processId)) {
      $Tracked[$processId] = [string]$process[0].CreationDate
    }
  }
}

function Get-LiveTrackedMembers {
  param(
    [Collections.Generic.Dictionary[int, string]]$Tracked,
    [object[]]$Snapshot
  )

  return @(
    foreach ($candidate in $Snapshot) {
      $processId = [int]$candidate.ProcessId
      if (
        $Tracked.ContainsKey($processId) -and
        [string]::Equals(
          $Tracked[$processId],
          [string]$candidate.CreationDate,
          [StringComparison]::Ordinal
        )
      ) {
        $candidate
      }
    }
  )
}

function Wait-ForReadyClient {
  param(
    [Diagnostics.Process]$Client,
    [Collections.Generic.Dictionary[int, string]]$Tracked
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Client.HasExited) {
      throw "FE Monster exited during startup with code $($Client.ExitCode)."
    }

    $snapshot = Get-ProcessSnapshot
    Add-FamilyMembers -Tracked $Tracked -Snapshot $snapshot -RootProcessId $Client.Id
    $familyIds = @(Get-DescendantIds -Snapshot $snapshot -RootProcessId $Client.Id)
    $backendReady = @(
      $snapshot |
        Where-Object {
          $familyIds -contains [int]$_.ProcessId -and
          (
            $_.Name -in @('FE Monster Backend.exe', 'javaw.exe', 'java.exe') -or
            $_.CommandLine -like '*fe-monster-java.jar*'
          )
        }
    ).Count -gt 0

    $Client.Refresh()
    if ($backendReady -and $Client.MainWindowHandle -ne [IntPtr]::Zero) {
      return
    }
    Start-Sleep -Milliseconds 200
  }
  throw "FE Monster did not expose a ready backend and main window within $StartupTimeoutSeconds seconds."
}

function Stop-TrackedMembers {
  param([Collections.Generic.Dictionary[int, string]]$Tracked)

  $snapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $live = @(Get-LiveTrackedMembers -Tracked $Tracked -Snapshot $snapshot)
  foreach ($member in @($live | Sort-Object CreationDate -Descending)) {
    Stop-Process -Id ([int]$member.ProcessId) -Force -ErrorAction SilentlyContinue
  }
}

function Remove-TestDirectory {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path)) {
    return
  }
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
  if (!$resolvedPath.StartsWith($resolvedTemporaryRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a test directory outside $resolvedTemporaryRoot`: $resolvedPath"
  }
  Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

$failures = @()
for ($iteration = 1; $iteration -le $Iterations; $iteration += 1) {
  $scopeId = [Guid]::NewGuid().ToString('N')
  $testDirectory = Join-Path $temporaryRoot $scopeId
  $dataDirectory = Join-Path $testDirectory 'data'
  $registryPath = "Software\FE Monster\DesktopPetTest\ProcessExit-$scopeId"
  $tracked = [Collections.Generic.Dictionary[int, string]]::new()
  $client = $null

  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  try {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $clientPath
    $startInfo.WorkingDirectory = $rootPath
    $startInfo.UseShellExecute = $false
    $startInfo.Environment['FE_MONSTER_ROOT'] = $rootPath
    $startInfo.Environment['FE_MONSTER_DATA_DIR'] = $dataDirectory
    $startInfo.Environment['FE_MONSTER_DESKTOP_PET_TEST_REGISTRY_PATH'] = $registryPath
    $client = [Diagnostics.Process]::Start($startInfo)
    if ($null -eq $client) {
      throw 'FE Monster could not be launched.'
    }

    Wait-ForReadyClient -Client $client -Tracked $tracked
    $snapshot = Get-ProcessSnapshot
    Add-FamilyMembers -Tracked $tracked -Snapshot $snapshot -RootProcessId $client.Id

    $client.Refresh()
    if (!$client.CloseMainWindow()) {
      throw 'The main window did not accept WM_CLOSE.'
    }

    $deadline = [DateTime]::UtcNow.AddSeconds($ExitTimeoutSeconds)
    $remaining = @()
    do {
      $snapshot = Get-ProcessSnapshot
      if (!$client.HasExited) {
        Add-FamilyMembers -Tracked $tracked -Snapshot $snapshot -RootProcessId $client.Id
      }
      $remaining = @(Get-LiveTrackedMembers -Tracked $tracked -Snapshot $snapshot)
      if ($remaining.Count -eq 0) {
        break
      }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)

    if ($remaining.Count -gt 0) {
      $details = @(
        $remaining | ForEach-Object {
          [pscustomobject]@{
            name = [string]$_.Name
            processId = [int]$_.ProcessId
            parentProcessId = [int]$_.ParentProcessId
            creationDate = [string]$_.CreationDate
            commandLine = [string]$_.CommandLine
          }
        }
      )
      $failures += [pscustomobject]@{
        iteration = $iteration
        rootProcessId = $client.Id
        remaining = $details
      }
      Write-Warning "Iteration $iteration left $($remaining.Count) process(es) alive."
    } else {
      Write-Host "PASS iteration $iteration`: the complete FE Monster process family exited."
    }
  } finally {
    Stop-TrackedMembers -Tracked $tracked
    if ($null -ne $client) {
      $client.Dispose()
    }
    Remove-TestDirectory -Path $testDirectory
    $registryItem = "Registry::HKEY_CURRENT_USER\$registryPath"
    if (Test-Path -LiteralPath $registryItem) {
      Remove-Item -LiteralPath $registryItem -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($failures.Count -gt 0) {
  $failures | ConvertTo-Json -Depth 6
  throw "$($failures.Count) of $Iterations exit iteration(s) left FE Monster processes running."
}

Write-Host "PASS: all $Iterations exit iteration(s) released the complete FE Monster process family."
