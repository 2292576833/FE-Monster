param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$PayloadRoot = '',
  [switch]$SkipCleanInstall
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
if ([string]::IsNullOrWhiteSpace($PayloadRoot)) {
  $PayloadRoot = Join-Path $rootPath 'out\installer\work\payload\FE Monster'
}
$failures = [Collections.Generic.List[string]]::new()

function Add-Failure {
  param([string]$Message)
  [void]$failures.Add($Message)
}

function Read-RequiredText {
  param([string]$RelativePath)
  $path = Join-Path $rootPath $RelativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    Add-Failure "missing release source: $RelativePath"
    return ''
  }
  return Get-Content -LiteralPath $path -Raw
}

function Require-SourcePattern {
  param([string]$Label, [string]$Source, [string]$Pattern)
  if ($Source -notmatch $Pattern) { Add-Failure $Label }
}

function Get-PeMachine {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return 0 }
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $reader = [IO.BinaryReader]::new($stream)
    try {
      if ($reader.ReadUInt16() -ne 0x5A4D) { return 0 }
      $stream.Position = 0x3C
      $peOffset = $reader.ReadInt32()
      if ($peOffset -lt 0 -or $peOffset -gt ($stream.Length - 6)) { return 0 }
      $stream.Position = $peOffset
      if ($reader.ReadUInt32() -ne 0x00004550) { return 0 }
      return $reader.ReadUInt16()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$buildInstaller = Read-RequiredText 'scripts\build-installer.ps1'
$installerContract = Read-RequiredText 'scripts\check-windows-installer-contract.ps1'
$cleanInstall = Read-RequiredText 'scripts\check-windows-clean-install-runtime.ps1'

Require-SourcePattern `
  'installer build does not build the dedicated WinCrypto DLL before staging' `
  $buildInstaller `
  "Build-App[\s\S]*build-wincrypto\.ps1"
Require-SourcePattern `
  'jlink module set does not explicitly include java.sql' `
  $buildInstaller `
  "Stage-JavaRuntime[\s\S]{0,1800}'java\.sql'"

$receiptRelative = 'third_party\java\local-memory\dependencies.json'
$receiptPath = Join-Path $rootPath $receiptRelative
$receipt = $null
if (Test-Path -LiteralPath $receiptPath -PathType Leaf) {
  try { $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json }
  catch { Add-Failure 'local-memory dependency receipt is invalid JSON' }
} else {
  Add-Failure "missing dependency receipt: $receiptRelative"
}

$jarNames = @(
  'sqlite-jdbc-3.53.2.1-without-natives.jar',
  'sqlite-jdbc-3.53.2.1-natives-windows.jar',
  'slf4j-api-1.7.36.jar'
)
$licenseNames = @('LICENSE-SQLITE-JDBC.txt', 'LICENSE-SLF4J.txt')
$memoryPayloadPaths = @(
  'web/local-memory-client.js',
  'out/lib/sqlite-jdbc-3.53.2.1-without-natives.jar',
  'out/lib/sqlite-jdbc-3.53.2.1-natives-windows.jar',
  'out/lib/slf4j-api-1.7.36.jar',
  'native/windows/build/fe-monster-wincrypto.dll',
  'third_party/java/local-memory/dependencies.json',
  'third_party/java/local-memory/LICENSE-SQLITE-JDBC.txt',
  'third_party/java/local-memory/LICENSE-SLF4J.txt'
)
foreach ($relative in $memoryPayloadPaths) {
  $escaped = [regex]::Escape($relative.Replace('/', '\'))
  Require-SourcePattern "installer build does not require/stage $relative" $buildInstaller $escaped
  Require-SourcePattern "Windows installer contract does not cover $relative" $installerContract $escaped
}
Require-SourcePattern `
  'clean-install contract does not write an encrypted local-memory record' `
  $cleanInstall `
  '/api/local-memory/events'
Require-SourcePattern `
  'clean-install contract does not restart before reading local memory' `
  $cleanInstall `
  'memoryRestartVerified'
Require-SourcePattern `
  'clean-install contract does not scan persistent vault artifacts for the plaintext canary' `
  $cleanInstall `
  'memoryPlaintextScanPassed'

if ($null -ne $receipt) {
  $actualArtifactNames = @($receipt.artifacts | ForEach-Object { [string]$_.file } | Sort-Object)
  if (($actualArtifactNames -join '|') -cne (@($jarNames | Sort-Object) -join '|')) {
    Add-Failure "dependency receipt artifact set is unexpected: $($actualArtifactNames -join ', ')"
  }
  foreach ($artifact in @($receipt.artifacts)) {
    $source = Join-Path $rootPath ('out\lib\' + [string]$artifact.file)
    if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
      Add-Failure "built dependency is missing: out/lib/$($artifact.file)"
      continue
    }
    $actual = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne ([string]$artifact.sha256).ToLowerInvariant()) {
      Add-Failure "built dependency hash mismatch: out/lib/$($artifact.file)"
    }
  }
}

$payloadPath = $null
try { $payloadPath = (Resolve-Path -LiteralPath $PayloadRoot).Path }
catch { Add-Failure "staged payload is missing: $PayloadRoot" }

if ($null -ne $payloadPath) {
  $manifestPath = Join-Path $payloadPath 'payload-integrity.json'
  $manifest = $null
  if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json }
    catch { Add-Failure 'staged payload integrity manifest is invalid JSON' }
  } else {
    Add-Failure 'staged payload integrity manifest is missing'
  }

  foreach ($relative in $memoryPayloadPaths) {
    $file = Join-Path $payloadPath $relative.Replace('/', '\')
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
      Add-Failure "staged payload is missing $relative"
      continue
    }
    if ($null -ne $manifest) {
      $entry = @($manifest.files | Where-Object {
        ([string]$_.path).Replace('\', '/') -ceq $relative
      }) | Select-Object -First 1
      if ($null -eq $entry) {
        Add-Failure "payload integrity manifest is missing $relative"
      } else {
        $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -cne ([string]$entry.sha256).ToLowerInvariant()) {
          Add-Failure "payload integrity hash mismatch: $relative"
        }
      }
    }
  }

  if ($null -ne $receipt) {
    foreach ($artifact in @($receipt.artifacts)) {
      $staged = Join-Path $payloadPath ('out\lib\' + [string]$artifact.file)
      if (Test-Path -LiteralPath $staged -PathType Leaf) {
        $hash = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -cne ([string]$artifact.sha256).ToLowerInvariant()) {
          Add-Failure "staged dependency hash mismatch: out/lib/$($artifact.file)"
        }
      }
    }
    foreach ($license in @($receipt.licenses)) {
      $staged = Join-Path $payloadPath ('third_party\java\local-memory\' + [string]$license.file)
      if (Test-Path -LiteralPath $staged -PathType Leaf) {
        $hash = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -cne ([string]$license.sha256).ToLowerInvariant()) {
          Add-Failure "staged license hash mismatch: third_party/java/local-memory/$($license.file)"
        }
      }
    }
  }

  $winCrypto = Join-Path $payloadPath 'native\windows\build\fe-monster-wincrypto.dll'
  if ((Get-PeMachine $winCrypto) -ne 0x8664) {
    Add-Failure 'staged WinCrypto DLL is missing or is not AMD64'
  }

  $java = Join-Path $payloadPath 'runtime\java\bin\java.exe'
  if (Test-Path -LiteralPath $java -PathType Leaf) {
    $modules = & $java --list-modules 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-Failure 'bundled Java runtime failed --list-modules'
    } elseif (!(@($modules) | Where-Object { [string]$_ -match '^java\.sql@' })) {
      Add-Failure 'bundled Java runtime does not contain java.sql'
    }
  } else {
    Add-Failure 'bundled Java executable is missing'
  }
}

if ($failures.Count -gt 0) {
  Write-Host 'Local encrypted-memory release contract: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

$contractOutput = & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\check-windows-installer-contract.ps1') `
  -Root $rootPath `
  -PayloadRoot $payloadPath `
  -WebView2Mode Any 2>&1
if ($LASTEXITCODE -ne 0) {
  $contractOutput | ForEach-Object { Write-Host $_ }
  throw 'Windows installer contract failed during local-memory release verification.'
}
$contractOutput | ForEach-Object { Write-Host $_ }

if (!$SkipCleanInstall) {
  $cleanOutput = & powershell.exe -NoProfile -File (Join-Path $rootPath 'scripts\check-windows-clean-install-runtime.ps1') `
    -Root $rootPath `
    -PayloadRoot $payloadPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    $cleanOutput | ForEach-Object { Write-Host $_ }
    throw 'Clean-install encrypted-memory restart probe failed.'
  }
  $cleanOutput | ForEach-Object { Write-Host $_ }
}

Write-Host 'Local encrypted-memory release contract: OK'
