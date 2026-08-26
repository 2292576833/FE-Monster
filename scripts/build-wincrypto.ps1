param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$source = Join-Path $rootPath 'native\windows\fe_monster_wincrypto.cpp'
$outputDirectory = Join-Path $rootPath 'native\windows\build'
$output = Join-Path $outputDirectory 'fe-monster-wincrypto.dll'
$publishToken = [guid]::NewGuid().ToString('N')
$temporaryOutput = $output + ".$publishToken.next"
$backupOutput = $output + ".$publishToken.previous"

. (Join-Path $rootPath 'scripts\windows-no-console-process.ps1')
. (Join-Path $rootPath 'scripts\java-runtime.ps1')

if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
  throw 'WINCRYPTO_SOURCE_MISSING'
}

$jdkHome = Find-JavaDevelopmentKit -Root $rootPath -MinimumMajor 17
if ([string]::IsNullOrWhiteSpace($jdkHome)) {
  throw 'JDK_17_REQUIRED'
}
$jniInclude = Join-Path $jdkHome 'include'
$jniWindowsInclude = Join-Path $jniInclude 'win32'
if (!(Test-Path -LiteralPath (Join-Path $jniInclude 'jni.h') -PathType Leaf) -or
    !(Test-Path -LiteralPath (Join-Path $jniWindowsInclude 'jni_md.h') -PathType Leaf)) {
  throw 'JNI_HEADERS_MISSING'
}
Write-Host "Using JDK: $jdkHome"

$vsInstall = ''
if (![string]::IsNullOrWhiteSpace($Env:FE_VS_INSTALL)) {
  if (!(Test-Path -LiteralPath $Env:FE_VS_INSTALL -PathType Container)) {
    throw 'VISUAL_STUDIO_NOT_FOUND'
  }
  $vsInstall = (Resolve-Path -LiteralPath $Env:FE_VS_INSTALL).Path
} else {
  $vsWhere = Join-Path ${Env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path -LiteralPath $vsWhere -PathType Leaf) {
    $vsInstall = (& $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
  }
}
if ([string]::IsNullOrWhiteSpace($vsInstall)) {
  throw 'VISUAL_STUDIO_NOT_FOUND'
}

$msvcRoot = Get-ChildItem -LiteralPath (Join-Path $vsInstall 'VC\Tools\MSVC') -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\Hostx64\x64\cl.exe') -PathType Leaf } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if ($null -eq $msvcRoot) {
  throw 'MSVC_X64_COMPILER_NOT_FOUND'
}
$clPath = Join-Path $msvcRoot.FullName 'bin\Hostx64\x64\cl.exe'
$msvcInclude = Join-Path $msvcRoot.FullName 'include'
$msvcLib = Join-Path $msvcRoot.FullName 'lib\x64'

$windowsSdkRoot = if (![string]::IsNullOrWhiteSpace($Env:FE_WINDOWS_SDK_ROOT)) {
  $Env:FE_WINDOWS_SDK_ROOT
} else {
  Join-Path ${Env:ProgramFiles(x86)} 'Windows Kits\10'
}
$windowsSdkVersion = Get-ChildItem -LiteralPath (Join-Path $windowsSdkRoot 'Include') -Directory -ErrorAction SilentlyContinue |
  Where-Object {
    (Test-Path -LiteralPath (Join-Path $_.FullName 'um\windows.h') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $windowsSdkRoot ("Lib\$($_.Name)\um\x64\crypt32.lib")) -PathType Leaf)
  } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1
if ($null -eq $windowsSdkVersion) {
  throw 'WINDOWS_SDK_X64_NOT_FOUND'
}
$sdkIncludeRoot = $windowsSdkVersion.FullName
$sdkLibRoot = Join-Path $windowsSdkRoot ("Lib\$($windowsSdkVersion.Name)")

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('fe-monster-wincrypto-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$stagedDll = Join-Path $temporaryRoot 'fe-monster-wincrypto.dll'
$objectFile = Join-Path $temporaryRoot 'fe_monster_wincrypto.obj'
$pdbFile = Join-Path $temporaryRoot 'fe-monster-wincrypto.pdb'
$importLibrary = Join-Path $temporaryRoot 'fe-monster-wincrypto.lib'

try {
  $compile = Invoke-NoConsoleProcess `
    -FilePath $clPath `
    -ArgumentList @(
      '/nologo',
      '/LD',
      '/MT',
      '/O2',
      '/std:c++17',
      '/EHsc',
      '/W4',
      '/GS',
      '/sdl',
      '/utf-8',
      '/DUNICODE',
      '/D_UNICODE',
      '/DNOMINMAX',
      '/DWIN32_LEAN_AND_MEAN',
      "/I$msvcInclude",
      "/I$(Join-Path $sdkIncludeRoot 'ucrt')",
      "/I$(Join-Path $sdkIncludeRoot 'shared')",
      "/I$(Join-Path $sdkIncludeRoot 'um')",
      "/I$(Join-Path $sdkIncludeRoot 'winrt')",
      "/I$jniInclude",
      "/I$jniWindowsInclude",
      "/Fo$objectFile",
      $source,
      '/link',
      '/NOLOGO',
      '/DLL',
      '/MACHINE:X64',
      '/INCREMENTAL:NO',
      '/DYNAMICBASE',
      '/NXCOMPAT',
      '/HIGHENTROPYVA',
      "/OUT:$stagedDll",
      "/PDB:$pdbFile",
      "/IMPLIB:$importLibrary",
      "/LIBPATH:$msvcLib",
      "/LIBPATH:$(Join-Path $sdkLibRoot 'ucrt\x64')",
      "/LIBPATH:$(Join-Path $sdkLibRoot 'um\x64')",
      'crypt32.lib',
      'bcrypt.lib'
    ) `
    -Wait `
    -CaptureOutput
  Write-NoConsoleProcessOutput $compile
  if ($compile.ExitCode -ne 0 -or !(Test-Path -LiteralPath $stagedDll -PathType Leaf)) {
    throw 'WINCRYPTO_BUILD_FAILED'
  }
  Copy-Item -LiteralPath $stagedDll -Destination $temporaryOutput -Force
  if (Test-Path -LiteralPath $output -PathType Leaf) {
    if (Test-Path -LiteralPath $backupOutput) {
      Remove-Item -LiteralPath $backupOutput -Force
    }
    [IO.File]::Replace($temporaryOutput, $output, $backupOutput, $true)
    Remove-Item -LiteralPath $backupOutput -Force
  } else {
    [IO.File]::Move($temporaryOutput, $output)
  }
} finally {
  if (Test-Path -LiteralPath $temporaryOutput) {
    Remove-Item -LiteralPath $temporaryOutput -Force
  }
  if (Test-Path -LiteralPath $backupOutput) {
    Remove-Item -LiteralPath $backupOutput -Force
  }
  $resolvedTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedStaging = [IO.Path]::GetFullPath($temporaryRoot)
  if ($resolvedStaging.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedStaging -PathType Container)) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}

Write-Host "Built $output"
