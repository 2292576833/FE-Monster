param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$agent = Join-Path $rootPath 'scripts\fe-monster-update-agent.ps1'
if (!(Test-Path $agent)) { throw "Update agent script was not found: $agent" }

$taskName = 'FE Monster Update Agent'
$registeredTask = $false
try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "{0}" -Root "{1}"' -f $agent, $rootPath)
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'FE Monster LAN update agent' -Force | Out-Null
  $registeredTask = $true
} catch {
  $startup = [Environment]::GetFolderPath('Startup')
  if ([string]::IsNullOrWhiteSpace($startup)) { throw }
  $vbs = Join-Path $startup 'FE Monster Update Agent.vbs'
  $escapedAgent = $agent.Replace('"', '""')
  $escapedRoot = $rootPath.Replace('"', '""')
  @(
    'Set shell = CreateObject("WScript.Shell")',
    ('shell.Run "powershell.exe -NoProfile -WindowStyle Hidden -File ""{0}"" -Root ""{1}""", 0, False' -f $escapedAgent, $escapedRoot)
  ) | Set-Content -Encoding ASCII -Path $vbs
}

if ($StartNow) {
  if ($registeredTask) {
    Start-ScheduledTask -TaskName $taskName
  } else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-File',
      $agent,
      '-Root',
      $rootPath
    ) -WorkingDirectory $rootPath -WindowStyle Hidden
  }
}

Write-Host "FE Monster update agent installed for current user."
