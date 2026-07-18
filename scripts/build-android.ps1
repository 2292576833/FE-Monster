param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Debug'
)

$ErrorActionPreference = 'Stop'
$rootPath = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $rootPath 'android'

if (!(Test-Path $androidRoot)) {
  throw "Android project was not found: $androidRoot"
}

function Resolve-JavaHome {
  $candidates = @(
    'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot',
    'E:\java26',
    $Env:JAVA_HOME
  )
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $java = Join-Path $candidate 'bin\java.exe'
    if (Test-Path $java) { return $candidate }
  }
  return $null
}

$sdkRoot = $Env:ANDROID_HOME
if ([string]::IsNullOrWhiteSpace($sdkRoot)) {
  $sdkRoot = $Env:ANDROID_SDK_ROOT
}
if ([string]::IsNullOrWhiteSpace($sdkRoot) -and (Test-Path 'E:\Android\Sdk')) {
  $sdkRoot = 'E:\Android\Sdk'
}

if ([string]::IsNullOrWhiteSpace($sdkRoot) -or !(Test-Path $sdkRoot)) {
  throw 'Android SDK was not found. Install Android Studio, then set ANDROID_HOME or ANDROID_SDK_ROOT.'
}

$javaHome = Resolve-JavaHome
if ([string]::IsNullOrWhiteSpace($javaHome)) {
  throw 'JDK 17+ was not found. Install JDK 17 or Java 26, then rerun the Android build.'
}

$Env:JAVA_HOME = $javaHome
$Env:ANDROID_HOME = $sdkRoot
$Env:ANDROID_SDK_ROOT = $sdkRoot
$Env:Path = (Join-Path $javaHome 'bin') + ';' + (Join-Path $sdkRoot 'platform-tools') + ';' + $Env:Path

$gradleWrapper = Join-Path $androidRoot 'gradlew.bat'
$bundledGradle = 'E:\Gradle\gradle-8.9\bin\gradle.bat'
$gradle = if (Test-Path $gradleWrapper) {
  $gradleWrapper
} elseif (Test-Path $bundledGradle) {
  $bundledGradle
} else {
  (Get-Command gradle -ErrorAction SilentlyContinue).Source
}
if ([string]::IsNullOrWhiteSpace($gradle)) {
  throw 'Gradle was not found. Install Android Studio/Gradle or add a Gradle wrapper under android/.'
}

$localProperties = Join-Path $androidRoot 'local.properties'
$escapedSdkRoot = $sdkRoot -replace '\\', '/'
Set-Content -Encoding ASCII -Path $localProperties -Value "sdk.dir=$escapedSdkRoot"

$task = if ($Configuration -eq 'Release') { ':app:assembleRelease' } else { ':app:assembleDebug' }
$apkSource = if ($Configuration -eq 'Release') {
  Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
} else {
  Join-Path $androidRoot 'app\build\outputs\apk\debug\app-debug.apk'
}
if (Test-Path -LiteralPath $apkSource -PathType Leaf) {
  Remove-Item -LiteralPath $apkSource -Force
}

Push-Location $androidRoot
try {
  & $gradle $task
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

if ($Configuration -eq 'Debug') {
  $distDirectory = Join-Path $rootPath 'dist'
  $apkDestination = Join-Path $distDirectory 'FE-Monster-Android-1.0.7-local-debug.apk'
  if (!(Test-Path $apkSource)) {
    throw "Android build succeeded but the APK was not found: $apkSource"
  }
  if (!(Test-Path $distDirectory)) { New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null }
  Copy-Item -LiteralPath $apkSource -Destination $apkDestination -Force
  Write-Host "Local Android APK: $apkDestination"
}
