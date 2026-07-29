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

. (Join-Path $rootPath 'scripts\java-runtime.ps1')
$jdkHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
if ([string]::IsNullOrWhiteSpace($jdkHome)) {
  throw 'A complete Windows x64 JDK 17+ (javac, jar, jdeps and jlink) is required.'
}
$javac = Join-Path $jdkHome 'bin\javac.exe'
$jarTool = Join-Path $jdkHome 'bin\jar.exe'

if (Test-Path -LiteralPath $classesDir) {
  Remove-Item -LiteralPath $classesDir -Recurse -Force
}
New-Item -ItemType Directory -Path $classesDir -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $sourcesFile) -Force | Out-Null

& powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File (Join-Path $rootPath 'scripts\write-java-source-list.ps1') `
  -OutputPath $sourcesFile `
  -SourceRoot (Join-Path $rootPath 'src\main\java') `
  -OptionalSourceRoot (Join-Path $rootPath 'src\community-proprietary\java')
if ($LASTEXITCODE -ne 0) {
  throw "Java source-list generation failed with exit code $LASTEXITCODE"
}

Write-Host "Using JDK: $jdkHome"
& $javac `
  '-J-Dfile.encoding=UTF-8' `
  '-encoding' 'UTF-8' `
  '--release' '17' `
  '-d' $classesDir `
  "@$sourcesFile"
if ($LASTEXITCODE -ne 0) {
  throw "javac failed with exit code $LASTEXITCODE"
}

& $jarTool `
  '--create' `
  '--file' $runJar `
  '--main-class' 'com.femonster.FeMonsterJavaApp' `
  '-C' $classesDir '.'
if ($LASTEXITCODE -ne 0) {
  throw "jar failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath $runJar -Destination $stableJar -Force
[System.IO.File]::WriteAllText(
  $runJarFile,
  $runJar + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Built $runJar"
