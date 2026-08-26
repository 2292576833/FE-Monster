param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$outDir = Join-Path $rootPath 'out'
$classesDir = Join-Path $outDir 'classes'
$stableJar = Join-Path $outDir 'fe-monster-java.jar'
$runJar = Join-Path $outDir ('fe-monster-java-{0}-{1}.jar' -f (Get-Random), (Get-Random))
$runJarFile = Join-Path $outDir 'run-jar.txt'
$sourcesFile = Join-Path $rootPath 'build\sources.txt'
$dependencyRoot = Join-Path $rootPath 'third_party\java\local-memory\lib'
$dependencyChecker = Join-Path $rootPath 'scripts\check-local-memory-dependencies.ps1'
$dependencyFiles = @(
  'sqlite-jdbc-3.53.2.1-without-natives.jar',
  'sqlite-jdbc-3.53.2.1-natives-windows.jar',
  'slf4j-api-1.7.36.jar'
)
$outLibDir = Join-Path $outDir 'lib'
$manifestFile = Join-Path $outDir 'fe-monster-java-manifest.mf'

. (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')
. (Join-Path $rootPath 'scripts\java-runtime.ps1')
$jdkHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
if ([string]::IsNullOrWhiteSpace($jdkHome)) {
  throw 'A complete Windows x64 JDK 17+ (javac, jar, jdeps and jlink) is required.'
}
$javac = Join-Path $jdkHome 'bin\javac.exe'
$jarTool = Join-Path $jdkHome 'bin\jar.exe'

& $dependencyChecker -Root $rootPath

if (Test-Path -LiteralPath $classesDir) {
  Remove-Item -LiteralPath $classesDir -Recurse -Force
}
New-Item -ItemType Directory -Path $classesDir -Force | Out-Null
if (Test-Path -LiteralPath $outLibDir) {
  Remove-Item -LiteralPath $outLibDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outLibDir -Force | Out-Null
foreach ($dependencyFile in $dependencyFiles) {
  Copy-Item -LiteralPath (Join-Path $dependencyRoot $dependencyFile) -Destination (Join-Path $outLibDir $dependencyFile)
}
New-Item -ItemType Directory -Path (Split-Path -Parent $sourcesFile) -Force | Out-Null

$powerShellExecutable = (Get-Command powershell.exe -ErrorAction Stop).Source
$sourceListResult = Invoke-NoConsoleProcess `
  -FilePath $powerShellExecutable `
  -ArgumentList @(
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    (Join-Path $rootPath 'scripts\write-java-source-list.ps1'),
    '-OutputPath',
    $sourcesFile,
    '-SourceRoot',
    (Join-Path $rootPath 'src\main\java'),
    '-OptionalSourceRoot',
    (Join-Path $rootPath 'src\community-proprietary\java')
  ) `
  -WorkingDirectory $rootPath `
  -Wait `
  -CaptureOutput
Write-NoConsoleProcessOutput $sourceListResult
if ($sourceListResult.ExitCode -ne 0) {
  throw "Java source-list generation failed with exit code $($sourceListResult.ExitCode)"
}

Write-Host "Using JDK: $jdkHome"
$compileClassPath = ($dependencyFiles | ForEach-Object { Join-Path $dependencyRoot $_ }) -join ';'
$javacResult = Invoke-NoConsoleProcess `
  -FilePath $javac `
  -ArgumentList @(
    '-J-Dfile.encoding=UTF-8',
    '-encoding',
    'UTF-8',
    '--release',
    '17',
    '-classpath',
    $compileClassPath,
    '-d',
    $classesDir,
    "@$sourcesFile"
  ) `
  -WorkingDirectory $rootPath `
  -Wait `
  -CaptureOutput
Write-NoConsoleProcessOutput $javacResult
if ($javacResult.ExitCode -ne 0) {
  throw "javac failed with exit code $($javacResult.ExitCode)"
}

$manifestClassPath = ($dependencyFiles | ForEach-Object { 'lib/' + $_ }) -join ' '
$manifestText = "Manifest-Version: 1.0`r`nMain-Class: com.femonster.FeMonsterJavaApp`r`nClass-Path: $manifestClassPath`r`n`r`n"
[System.IO.File]::WriteAllText($manifestFile, $manifestText, [System.Text.UTF8Encoding]::new($false))
$jarResult = Invoke-NoConsoleProcess `
  -FilePath $jarTool `
  -ArgumentList @(
    '--create',
    '--file',
    $runJar,
    '--manifest',
    $manifestFile,
    '-C',
    $classesDir,
    '.'
  ) `
  -WorkingDirectory $rootPath `
  -Wait `
  -CaptureOutput
Write-NoConsoleProcessOutput $jarResult
if (Test-Path -LiteralPath $manifestFile) {
  Remove-Item -LiteralPath $manifestFile -Force
}
if ($jarResult.ExitCode -ne 0) {
  throw "jar failed with exit code $($jarResult.ExitCode)"
}

Copy-Item -LiteralPath $runJar -Destination $stableJar -Force
[System.IO.File]::WriteAllText(
  $runJarFile,
  $runJar + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Built $runJar"
