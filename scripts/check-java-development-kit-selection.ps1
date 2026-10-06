param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\java-runtime.ps1')

function Assert-JdkSelection {
  param(
    [string]$Name,
    [object[]]$Candidates,
    [string]$Expected,
    [int]$MinimumMajor = 17
  )

  # Mock discovery, version probes and tool presence. No JDK is launched and
  # no machine, user or process environment settings are changed by this test.
  function Update-JavaRuntimeEnvironment { }
  function Get-JavaExecutableCandidates {
    param([string]$Root)
    foreach ($candidate in $Candidates) { Join-Path $candidate.Home 'bin\java.exe' }
  }
  function Get-JavaMajorVersion {
    param([string]$JavaExe)
    $match = $Candidates | Where-Object { (Join-Path $_.Home 'bin\java.exe') -eq $JavaExe } | Select-Object -First 1
    return $match.Major
  }
  function Test-Path {
    param([string]$LiteralPath, [string]$PathType)
    $jdkHome = Split-Path -Parent (Split-Path -Parent $LiteralPath)
    $match = $Candidates | Where-Object { $_.Home -eq $jdkHome } | Select-Object -First 1
    return $null -ne $match -and $match.Complete
  }

  $actual = Find-JavaDevelopmentKit -Root 'C:\fixture\workspace' -MinimumMajor $MinimumMajor
  if ($actual -cne $Expected) { throw "${Name}: expected '$Expected', got '$actual'." }
  Write-Host "PASS: $Name"
}

$explicit17 = [pscustomobject]@{ Home = 'C:\fixture\explicit-FE_JAVA_HOME'; Major = 17; Complete = $true }
$system17 = [pscustomobject]@{ Home = 'C:\fixture\system-jdk17'; Major = 17; Complete = $true }
$other17 = [pscustomobject]@{ Home = 'C:\fixture\another-jdk17'; Major = 17; Complete = $true }
$jdk21 = [pscustomobject]@{ Home = 'C:\fixture\jdk21'; Major = 21; Complete = $true }
$other21 = [pscustomobject]@{ Home = 'C:\fixture\another-jdk21'; Major = 21; Complete = $true }
$jdk26 = [pscustomobject]@{ Home = 'C:\fixture\jdk26'; Major = 26; Complete = $true }
$jdk11 = [pscustomobject]@{ Home = 'C:\fixture\jdk11'; Major = 11; Complete = $true }
$incomplete17 = [pscustomobject]@{ Home = 'C:\fixture\incomplete-jdk17'; Major = 17; Complete = $false }
$unrecognized = [pscustomobject]@{ Home = 'C:\fixture\invalid-java'; Major = 0; Complete = $true }

Assert-JdkSelection 'explicit complete JDK keeps candidate priority over the same major' @($explicit17, $system17) $explicit17.Home
Assert-JdkSelection 'first discovered complete JDK wins ties' @($system17, $other17) $system17.Home
Assert-JdkSelection 'lower compatible major replaces a higher major' @($jdk26, $jdk21, $system17) $system17.Home
Assert-JdkSelection 'higher major does not replace the compatible minimum' @($system17, $jdk21, $jdk26) $system17.Home
Assert-JdkSelection 'incomplete preferred JDK falls back to a complete same-major JDK' @($incomplete17, $system17) $system17.Home
Assert-JdkSelection 'unsupported and unrecognized Java are ignored' @($jdk11, $unrecognized, $system17) $system17.Home
Assert-JdkSelection 'custom minimum keeps stable priority at the lowest supported major' @($system17, $jdk26, $jdk21, $other21) $jdk21.Home 21
Assert-JdkSelection 'no complete supported JDK returns no selection' @($incomplete17, $jdk11, $unrecognized) ''
Assert-JdkSelection 'empty discovery returns no selection' @() ''

Write-Host 'Java development kit selection: PASS (9 cases)'
