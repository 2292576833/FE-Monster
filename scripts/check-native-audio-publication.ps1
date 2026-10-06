param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
. (Join-Path $rootPath 'scripts\native-audio-artifacts.ps1')
. (Join-Path $rootPath 'scripts\java-build-artifacts.ps1')
. (Join-Path $rootPath 'scripts\java-runtime.ps1')
. (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')
$jarPath = Resolve-JavaRunJar -Root $rootPath
if ([string]::IsNullOrWhiteSpace($jarPath)) { throw 'Build the current Java sources before testing native publication.' }
$jdkHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
if ([string]::IsNullOrWhiteSpace($jdkHome)) { throw 'JDK 17+ is required.' }
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$probeRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ('fe-native-publication-' + [Guid]::NewGuid().ToString('N'))))
if (!$probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe native publication test directory.' }
$heldDll = $null

function Assert-Probe([bool]$Condition, [string]$Message) {
  if (!$Condition) { throw $Message }
}

function Write-ProbePair([string]$Directory, [string]$Version) {
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $Directory 'fe-monster-xaudio2.dll'), "fixture-xaudio-$Version")
  [IO.File]::WriteAllText((Join-Path $Directory 'fe_monster_upmix.dll'), "fixture-rust-$Version")
  $xaudioHash = (Get-FileHash -LiteralPath (Join-Path $Directory 'fe-monster-xaudio2.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
  $rustHash = (Get-FileHash -LiteralPath (Join-Path $Directory 'fe_monster_upmix.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    schemaVersion = 1; architecture = 'x64'; xaudio2Sha256 = $xaudioHash; upmixSha256 = $rustHash
    pairSha256 = Get-NativeAudioPairHash "fe-monster-xaudio2.dll=$xaudioHash`nfe_monster_upmix.dll=$rustHash"
  }
  [IO.File]::WriteAllText((Join-Path $Directory 'native-audio-build.json'), ($manifest | ConvertTo-Json))
}

function Assert-JavaResolution([string]$Expected) {
  $result = Invoke-NoConsoleProcess -FilePath (Join-Path $jdkHome 'bin\java.exe') `
    -ArgumentList @('-cp', "$probeRoot;$jarPath", 'NativePublicationProbe', $probeRoot, $Expected) `
    -WorkingDirectory $rootPath -Wait -CaptureOutput
  if ($result.ExitCode -ne 0) { throw "Production Java marker resolution failed: $($result.StandardError)" }
}

try {
  New-Item -ItemType Directory -Path $probeRoot | Out-Null
  $source = Join-Path $probeRoot 'source'
  Write-ProbePair $source 'one'
  $first = Publish-NativeAudioArtifactPair -Root $probeRoot -SourceDirectory $source
  Assert-Probe ((Resolve-NativeAudioRunDll -Root $probeRoot) -eq $first) 'The first published pair did not resolve.'
  $firstHash = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash
  $heldDll = [IO.File]::Open($first, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  Write-ProbePair $source 'two'
  $second = Publish-NativeAudioArtifactPair -Root $probeRoot -SourceDirectory $source
  Assert-Probe ($second -ne $first) 'Publication reused an existing DLL path.'
  Assert-Probe ((Resolve-NativeAudioRunDll -Root $probeRoot) -eq $second) 'The marker did not advance while the old DLL was locked.'
  Assert-Probe ((Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash -eq $firstHash) 'Publication altered a previous DLL.'
  $heldDll.Dispose()
  $heldDll = $null

  $probeJava = @'
import java.nio.file.*;
import com.femonster.core.*;
public class NativePublicationProbe {
  public static void main(String[] args) throws Exception {
    Path root = Path.of(args[0]);
    var constructor = ProjectPaths.class.getDeclaredConstructor(Path.class, Path.class, Path.class);
    constructor.setAccessible(true);
    ProjectPaths paths = constructor.newInstance(root, root.resolve("web"), root.resolve("data"));
    var method = NativeAudioEngine.class.getDeclaredMethod("resolvePublishedDll", ProjectPaths.class);
    method.setAccessible(true);
    Path actual = (Path) method.invoke(null, paths);
    Path expected = args[1].equals("NONE") ? null : Path.of(args[1]).toRealPath();
    if (!java.util.Objects.equals(actual, expected)) throw new AssertionError("Expected " + expected + " but got " + actual);
  }
}
'@
  $probeJavaPath = Join-Path $probeRoot 'NativePublicationProbe.java'
  [IO.File]::WriteAllText($probeJavaPath, $probeJava)
  $compile = Invoke-NoConsoleProcess -FilePath (Join-Path $jdkHome 'bin\javac.exe') `
    -ArgumentList @('--release', '17', '-cp', $jarPath, '-d', $probeRoot, $probeJavaPath) -WorkingDirectory $rootPath -Wait -CaptureOutput
  if ($compile.ExitCode -ne 0) { throw $compile.StandardError }
  Assert-JavaResolution $second

  $marker = Join-Path $probeRoot 'native\windows\run-audio.txt'
  foreach ($invalid in @((Join-Path $source 'fe-monster-xaudio2.dll'), "$second`n$first", (Join-Path (Split-Path -Parent $second) 'missing.dll'))) {
    [IO.File]::WriteAllText($marker, $invalid)
    Assert-Probe ([string]::IsNullOrWhiteSpace((Resolve-NativeAudioRunDll -Root $probeRoot))) 'An invalid publication marker was accepted.'
    Assert-JavaResolution 'NONE'
  }
  [IO.File]::WriteAllText($marker, $second)
  $tamperedRust = Join-Path (Split-Path -Parent $second) 'fe_monster_upmix.dll'
  [IO.File]::AppendAllText($tamperedRust, '-tampered')
  Assert-Probe ([string]::IsNullOrWhiteSpace((Resolve-NativeAudioRunDll -Root $probeRoot))) 'A mismatched native pair was accepted.'
  Assert-JavaResolution 'NONE'
  $rejected = $false
  try { Publish-NativeAudioArtifactPair -Root $probeRoot -SourceDirectory (Split-Path -Parent $second) | Out-Null }
  catch { $rejected = $true }
  Assert-Probe $rejected 'The publisher accepted DLL bytes that disagreed with their manifest.'
  Assert-Probe (([IO.File]::ReadAllText($marker)) -eq $second) 'A rejected publication modified the existing marker.'
  Write-Output 'Native audio publication regression: PASS (immutable locked-reader publication, PowerShell/production-Java resolution, invalid paths, hash mismatch).'
} finally {
  if ($null -ne $heldDll) { $heldDll.Dispose() }
  if ($probeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $probeRoot -PathType Container)) {
    Remove-Item -LiteralPath $probeRoot -Recurse -Force
  }
}
