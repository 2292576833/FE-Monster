param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $rootPath 'scripts\java-build-artifacts.ps1')
. (Join-Path $rootPath 'scripts\java-runtime.ps1')
. (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')
$jdkHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
if ([string]::IsNullOrWhiteSpace($jdkHome)) { throw 'JDK 17+ is required for the live jar regression.' }
$java = Join-Path $jdkHome 'bin\java.exe'
$javac = Join-Path $jdkHome 'bin\javac.exe'
$jar = Join-Path $jdkHome 'bin\jar.exe'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$probeRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ('fe-live-jar-' + [Guid]::NewGuid().ToString('N'))))
if (!$probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe jar probe directory.' }
$process = $null
$lockedFile = $null

function Assert-Probe([bool]$Condition, [string]$Message) {
  if (!$Condition) { throw $Message }
}

function Invoke-ProbeTool([string]$Executable, [string[]]$ToolArguments) {
  $result = Invoke-NoConsoleProcess -FilePath $Executable -ArgumentList $ToolArguments -WorkingDirectory $probeRoot -Wait -CaptureOutput
  if ($result.ExitCode -ne 0) { throw "$Executable failed: $($result.StandardError) $($result.StandardOutput)" }
}

try {
  $probeOut = Join-Path $probeRoot 'out'
  New-Item -ItemType Directory -Path $probeOut -Force | Out-Null
  $mainSource = @'
import java.nio.file.*;
public class Main {
  public static void main(String[] args) throws Exception {
    Files.writeString(Path.of(args[0]), "ready");
    long deadline = System.nanoTime() + 15_000_000_000L;
    while (!Files.exists(Path.of(args[1]))) {
      if (System.nanoTime() > deadline) throw new IllegalStateException("release timed out");
      Thread.sleep(10);
    }
    try {
      Object version = Class.forName("Late").getMethod("version").invoke(null);
      Files.writeString(Path.of(args[2]), String.valueOf(version));
    } catch (Throwable error) {
      Files.writeString(Path.of(args[2]), error.toString());
      throw error;
    }
  }
}
'@
  foreach ($version in @('old', 'new')) {
    $sourceDir = Join-Path $probeRoot $version
    $classes = Join-Path $sourceDir 'classes'
    New-Item -ItemType Directory -Path $classes -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $sourceDir 'Main.java'), $mainSource)
    [IO.File]::WriteAllText((Join-Path $sourceDir 'Late.java'), "public class Late { public static String version() { return `"$version`"; } }")
    Invoke-ProbeTool $javac @('--release', '17', '-d', $classes, (Join-Path $sourceDir 'Main.java'), (Join-Path $sourceDir 'Late.java'))
    if ($version -eq 'new') {
      # Change ZIP entry ordering/offsets, as a normal larger rebuild would.
      [IO.File]::WriteAllText((Join-Path $classes 'AAAA-new-resource.txt'), ('changed offsets ' * 2000))
    }
    Invoke-ProbeTool $jar @('--create', '--file', (Join-Path $probeOut "fe-monster-java-$version.jar"), '--main-class', 'Main', '-C', $classes, '.')
  }
  $oldJar = Join-Path $probeOut 'fe-monster-java-old.jar'
  $newJar = Join-Path $probeOut 'fe-monster-java-new.jar'
  $stableJar = Join-Path $probeOut 'fe-monster-java.jar'
  $marker = Join-Path $probeOut 'run-jar.txt'
  $initial = Publish-JavaBuildArtifact -Root $probeRoot -RunJar $oldJar
  Assert-Probe $initial.StablePublished 'Initial stable jar was not published.'
  Assert-Probe ((Resolve-JavaRunJar -Root $probeRoot) -eq $oldJar) 'Initial immutable marker was not resolved.'

  $ready = Join-Path $probeRoot 'ready.txt'
  $release = Join-Path $probeRoot 'release.txt'
  $resultPath = Join-Path $probeRoot 'result.txt'
  $process = Invoke-NoConsoleProcess -FilePath $java -ArgumentList @('-jar', $stableJar, $ready, $release, $resultPath) -WorkingDirectory $probeRoot
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  while (!(Test-Path -LiteralPath $ready) -and [DateTime]::UtcNow -lt $deadline -and !$process.HasExited) { Start-Sleep -Milliseconds 20 }
  Assert-Probe (Test-Path -LiteralPath $ready) 'The JVM did not reach the delayed class-load boundary.'
  $published = Publish-JavaBuildArtifact -Root $probeRoot -RunJar $newJar
  Assert-Probe ((Resolve-JavaRunJar -Root $probeRoot) -eq $newJar) 'A running JVM must not prevent the new immutable marker from publishing.'
  [IO.File]::WriteAllText($release, 'go')
  Assert-Probe ($process.WaitForExit(8000)) 'The delayed class-load JVM did not exit.'
  Assert-Probe ($process.ExitCode -eq 0) 'The running JVM failed to load an old jar class after publication.'
  Assert-Probe (([IO.File]::ReadAllText($resultPath)) -eq 'old') 'Publication changed the class bytes observed by the already running JVM.'
  $process.Dispose()
  $process = $null

  # New launches use the marker even when stable replacement was denied.
  Invoke-ProbeTool $java @('-jar', (Resolve-JavaRunJar -Root $probeRoot), $ready, $release, $resultPath)
  Assert-Probe (([IO.File]::ReadAllText($resultPath)) -eq 'new') 'A new launch did not load the newest immutable artifact.'

  Publish-JavaBuildArtifact -Root $probeRoot -RunJar $oldJar | Out-Null
  $beforeHash = (Get-FileHash -LiteralPath $stableJar -Algorithm SHA256).Hash
  $lockedFile = [IO.File]::Open($stableJar, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $lockedPublication = Publish-JavaBuildArtifact -Root $probeRoot -RunJar $newJar -WarningAction SilentlyContinue
  Assert-Probe (!$lockedPublication.StablePublished) 'A delete-locked stable jar should be retained.'
  Assert-Probe ((Get-FileHash -LiteralPath $stableJar -Algorithm SHA256).Hash -eq $beforeHash) 'Locked stable jar bytes changed.'
  Assert-Probe ((Resolve-JavaRunJar -Root $probeRoot) -eq $newJar) 'Locked stable publication did not advance the immutable marker.'
  $lockedFile.Dispose()
  $lockedFile = $null

  Copy-Item -LiteralPath $oldJar -Destination (Join-Path $probeRoot 'fe-monster-java-outside.jar')
  foreach ($invalid in @($stableJar, (Join-Path $probeRoot 'fe-monster-java-outside.jar'), (Join-Path $probeOut 'fe-monster-java-missing.jar'), "$newJar`n$oldJar")) {
    [IO.File]::WriteAllText($marker, $invalid)
    Assert-Probe ([string]::IsNullOrWhiteSpace((Resolve-JavaRunJar -Root $probeRoot))) "Unsafe/missing marker was accepted: $invalid"
  }
  [IO.File]::WriteAllText($marker, 'out\fe-monster-java-new.jar')
  Assert-Probe ((Resolve-JavaRunJar -Root $probeRoot) -eq $newJar) 'A contained relative run marker should resolve.'
  Assert-Probe (@(Get-ChildItem -LiteralPath $probeOut -Filter '*.tmp').Count -eq 0) 'Publication left staging files behind.'
  Write-Output 'Live jar publication regression: PASS (running JVM delayed class load, immutable launch marker, locked stable fallback, marker validation).'
} finally {
  if ($null -ne $lockedFile) { $lockedFile.Dispose() }
  if ($null -ne $process) {
    try { if (!$process.HasExited) { $process.Kill(); $process.WaitForExit(2000) | Out-Null } } catch {}
    $process.Dispose()
  }
  if ($probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $probeRoot -PathType Container)) {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force
  }
}
