param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ClientArgs = @()
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$outDir = Join-Path $rootPath 'out'
$logFile = Join-Path $outDir 'launch.log'
$dependencyCacheFile = Join-Path $outDir 'dependency-cache.json'
$launchRunId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$javaRuntimeScript = Join-Path $PSScriptRoot 'java-runtime.ps1'
if (Test-Path $javaRuntimeScript) {
  . $javaRuntimeScript
}

function Write-Log {
  param([string]$Message)
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  Add-Content -Encoding UTF8 -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Show-ErrorPopup {
  param([string]$Message)
  try {
    $shell = New-Object -ComObject WScript.Shell
    $shell.Popup($Message, 20, 'FE Monster', 16) | Out-Null
  } catch {
  }
}

function Quote-Arg {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  return '"' + ($Value -replace '"', '\"') + '"'
}

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

function Test-DependencyCache {
  if (!(Test-Path $dependencyCacheFile)) { return $false }

  try {
    $cache = Get-Content -Raw -Path $dependencyCacheFile | ConvertFrom-Json
    if ($cache.version -ne 2) { return $false }
    if (![string]::Equals([string]$cache.machine, [string]$Env:COMPUTERNAME, [StringComparison]::OrdinalIgnoreCase)) { return $false }
    if (![string]::Equals([string]$cache.root, $rootPath, [StringComparison]::OrdinalIgnoreCase)) { return $false }

    $validatedAt = [datetime]::Parse([string]$cache.validatedAt)
    if (((Get-Date) - $validatedAt) -gt [timespan]::FromHours(12)) { return $false }

    foreach ($relative in @(
      'scripts\netease-api-server.cjs',
      'scripts\kugou-api-server.cjs',
      'node_modules\NeteaseCloudMusicApi',
      'node_modules\@sansenjian\qq-music-api\dist\cli.js',
      'node_modules\kugoumusicapi\app.js'
    )) {
      if (!(Test-Path (Join-Path $rootPath $relative))) { return $false }
    }

    if ([string]::IsNullOrWhiteSpace((Find-Exe 'node.exe' @((Join-Path $rootPath 'runtime\node'), (Join-Path $Env:ProgramFiles 'nodejs'), (Join-Path ${Env:ProgramFiles(x86)} 'nodejs'))))) {
      return $false
    }

    if (Get-Command Find-JavaRuntime -ErrorAction SilentlyContinue) {
      if ([string]::IsNullOrWhiteSpace((Find-JavaRuntime -Root $rootPath -PreferWindowless))) { return $false }
    }

    return $true
  } catch {
    return $false
  }
}

function Save-DependencyCache {
  if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  [pscustomobject]@{
    version = 2
    machine = $Env:COMPUTERNAME
    root = $rootPath
    validatedAt = (Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $dependencyCacheFile
}

function Resolve-RunJar {
  $stableJar = Join-Path $outDir 'fe-monster-java.jar'
  if (Test-Path $stableJar) { return (Resolve-Path $stableJar).Path }

  $latest = Get-ChildItem -Path $outDir -Filter 'fe-monster-java-*.jar' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -ne $latest) { return $latest.FullName }

  return ''
}

function Resolve-CommunityBaseUrl {
  if (![string]::IsNullOrWhiteSpace($Env:FE_MONSTER_COMMUNITY_URL)) {
    return $Env:FE_MONSTER_COMMUNITY_URL.Trim().Trim([char]0xFEFF).Trim().TrimEnd('/')
  }
  $configFile = Join-Path $rootPath 'data\community-server-url.txt'
  if (Test-Path $configFile) {
    try {
      return (Get-Content -LiteralPath $configFile -Raw).Trim().Trim([char]0xFEFF).Trim().TrimEnd('/')
    } catch {
      return ''
    }
  }
  return ''
}

try {
  Write-Log 'Launch requested.'

  if (Test-DependencyCache) {
    Write-Log 'Dependency cache is valid; skipping full dependency check.'
  } else {
    $dependencyScript = Join-Path $rootPath 'scripts\ensure-runtime-dependencies.ps1'
    $dependencyLog = Join-Path $outDir 'dependency-check.log'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dependencyScript -Root $rootPath -InstallMissing *> $dependencyLog
    if ($LASTEXITCODE -ne 0) {
      $message = "Dependencies are missing and could not be installed automatically. See $outDir\dependency-check.log"
      Write-Log $message
      Show-ErrorPopup $message
      exit 1
    }
    Save-DependencyCache
  }

  $stopScript = Join-Path $rootPath 'scripts\stop-stale-fe-monster.ps1'
  $stopLog = Join-Path $outDir 'stop-stale.log'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript -Root $rootPath *> $stopLog

  $communityBaseUrl = Resolve-CommunityBaseUrl
  if ([string]::IsNullOrWhiteSpace($communityBaseUrl)) {
    Write-Log 'Community server is not configured; client will wait for community settings.'
  } else {
    Write-Log "Using community server: $communityBaseUrl"
  }

  $jar = Resolve-RunJar
  if ([string]::IsNullOrWhiteSpace($jar)) {
    $buildScript = Join-Path $rootPath 'build.cmd'
    $buildLog = Join-Path $outDir 'build-on-launch.log'
    Write-Log 'No runtime jar found; building once.'
    & cmd.exe /c "`"$buildScript`"" *> $buildLog
    if ($LASTEXITCODE -ne 0) {
      $message = "Build failed. See $outDir\build-on-launch.log"
      Write-Log $message
      Show-ErrorPopup $message
      exit $LASTEXITCODE
    }
    $jar = Resolve-RunJar
  }

  if ([string]::IsNullOrWhiteSpace($jar)) {
    $message = 'FE Monster Java jar was not found.'
    Write-Log $message
    Show-ErrorPopup $message
    exit 1
  }

  $apiProcesses = @()
  foreach ($apiScript in @('start-ncm-api.ps1', 'start-qq-api.ps1', 'start-kugou-api.ps1')) {
    $path = Join-Path $rootPath "scripts\$apiScript"
    if (Test-Path $path) {
      $port = if ($apiScript -eq 'start-ncm-api.ps1') { 3010 } elseif ($apiScript -eq 'start-qq-api.ps1') { 3011 } else { 3012 }
      $logPrefix = $apiScript -replace '\.ps1$', ''
      $apiOutLog = Join-Path $outDir "$logPrefix-$launchRunId.launch.out.log"
      $apiErrLog = Join-Path $outDir "$logPrefix-$launchRunId.launch.err.log"
      $argumentLine = @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        (Quote-Arg $path),
        '-Root',
        (Quote-Arg $rootPath),
        '-Port',
        [string]$port
      ) -join ' '
      $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WorkingDirectory $rootPath -WindowStyle Hidden -RedirectStandardOutput $apiOutLog -RedirectStandardError $apiErrLog -PassThru
      $apiProcesses += [pscustomobject]@{
        Script = $apiScript
        Port = $port
        Process = $process
        OutLog = $apiOutLog
        ErrLog = $apiErrLog
      }
    }
  }

  foreach ($api in $apiProcesses) {
    if (!$api.Process.WaitForExit(45000)) {
      try { $api.Process.Kill() } catch {}
      Write-Log "$($api.Script) startup timed out on port $($api.Port). See $($api.ErrLog)"
      continue
    }
    if ($api.Process.ExitCode -eq 0) {
      Write-Log "$($api.Script) is ready on port $($api.Port)."
    } else {
      Write-Log "$($api.Script) did not become ready on port $($api.Port). See $($api.ErrLog)"
    }
  }

  if (Get-Command Find-JavaRuntime -ErrorAction SilentlyContinue) {
    $javaExe = Find-JavaRuntime -Root $rootPath -MinimumMajor 26 -PreferWindowless
  } else {
    $javaExe = Find-Exe 'javaw.exe' @(
      (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
      (Join-Path $Env:ProgramFiles 'Java'),
      (Join-Path ${Env:ProgramFiles(x86)} 'Java')
    )
    if ([string]::IsNullOrWhiteSpace($javaExe)) {
      $javaExe = Find-Exe 'java.exe' @(
        (Join-Path $Env:ProgramFiles 'Eclipse Adoptium'),
        (Join-Path $Env:ProgramFiles 'Java'),
        (Join-Path ${Env:ProgramFiles(x86)} 'Java')
      )
    }
  }
  if ([string]::IsNullOrWhiteSpace($javaExe)) {
    $message = 'Java 26 was not found after dependency check.'
    Write-Log $message
    Show-ErrorPopup $message
    exit 1
  }

  $argumentLine = (@('--enable-native-access=ALL-UNNAMED', '-jar', $jar) + $ClientArgs | ForEach-Object { Quote-Arg $_ }) -join ' '
  Write-Log "Starting $javaExe $argumentLine"
  Start-Process -FilePath $javaExe -ArgumentList $argumentLine -WorkingDirectory $rootPath -WindowStyle Hidden | Out-Null
} catch {
  $message = $_.Exception.Message
  Write-Log "Launch failed: $message"
  Show-ErrorPopup "FE Monster failed to start. $message"
  exit 1
}
