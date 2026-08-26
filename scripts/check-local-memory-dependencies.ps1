param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$dependencyRoot = Join-Path $rootPath 'third_party\java\local-memory'
$receiptPath = Join-Path $dependencyRoot 'dependencies.json'
$libPath = Join-Path $dependencyRoot 'lib'

function Get-LocalMemorySha256 {
  param([string]$Path)
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      return -join ($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-LocalMemoryNormalizedTextSha256 {
  param([string]$Path)
  $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $normalized = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($normalized)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($algorithm.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
  } finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
    $algorithm.Dispose()
  }
}

$expected = @(
  [pscustomobject]@{
    coordinate = 'org.xerial:sqlite-jdbc:3.53.2.1:without-natives'
    file = 'sqlite-jdbc-3.53.2.1-without-natives.jar'
    url = 'https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-without-natives.jar'
    sha256 = '4baeeb32cfb8ac3e5922e0fe50b8f78e4fe39d00f68824ce677a9477c686715b'
  },
  [pscustomobject]@{
    coordinate = 'org.xerial:sqlite-jdbc:3.53.2.1:natives-windows'
    file = 'sqlite-jdbc-3.53.2.1-natives-windows.jar'
    url = 'https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-natives-windows.jar'
    sha256 = '05c622ecd7337d96f7ccbd0599fee00cf62af81364fd188a848eb3469f4e17a2'
  },
  [pscustomobject]@{
    coordinate = 'org.slf4j:slf4j-api:1.7.36'
    file = 'slf4j-api-1.7.36.jar'
    url = 'https://repo.maven.apache.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar'
    sha256 = 'd3ef575e3e4979678dc01bf1dcce51021493b4d11fb7f1be8ad982877c16a1c0'
  }
)
$expectedLicenses = @(
  [pscustomobject]@{
    file = 'LICENSE-SQLITE-JDBC.txt'
    source = 'https://github.com/xerial/sqlite-jdbc/blob/3.53.2.1/LICENSE'
    sha256 = 'c978e501e690550f7e63203f501e68041f41d450cd7eb56ac7750e4ae2597885'
  },
  [pscustomobject]@{
    file = 'LICENSE-SLF4J.txt'
    source = 'https://github.com/qos-ch/slf4j/blob/v_1.7.36/LICENSE.txt'
    sha256 = 'c3c2680463d10ba992c002451e94f6018e4096d6d632334731a93cd97cb74aaa'
  }
)

if (!(Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
  throw 'The pinned local-memory dependency receipt is missing.'
}
if (!(Test-Path -LiteralPath $libPath -PathType Container)) {
  throw 'The vendored local-memory dependency directory is missing.'
}

$receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
$actualArtifacts = @($receipt.artifacts)
$actualLicenses = @($receipt.licenses)
if ([int]$receipt.schemaVersion -ne 1 -or $actualArtifacts.Count -ne $expected.Count -or $actualLicenses.Count -ne $expectedLicenses.Count) {
  throw 'The local-memory dependency receipt has an unsupported shape.'
}

for ($index = 0; $index -lt $expected.Count; $index += 1) {
  $actual = $actualArtifacts[$index]
  $pin = $expected[$index]
  foreach ($property in @('coordinate', 'file', 'url', 'sha256')) {
    if (![string]::Equals([string]$actual.$property, [string]$pin.$property, [StringComparison]::Ordinal)) {
      throw "The local-memory dependency receipt does not match the pinned $property at index $index."
    }
  }
}

for ($index = 0; $index -lt $expectedLicenses.Count; $index += 1) {
  $actual = $actualLicenses[$index]
  $pin = $expectedLicenses[$index]
  foreach ($property in @('file', 'source', 'sha256')) {
    if (![string]::Equals([string]$actual.$property, [string]$pin.$property, [StringComparison]::Ordinal)) {
      throw "The local-memory license receipt does not match the pinned $property at index $index."
    }
  }
  $licensePath = Join-Path $dependencyRoot $pin.file
  if (!(Test-Path -LiteralPath $licensePath -PathType Leaf)) {
    throw "The vendored license is missing: $($pin.file)"
  }
  $licenseHash = Get-LocalMemoryNormalizedTextSha256 -Path $licensePath
  if (![string]::Equals($licenseHash, $pin.sha256, [StringComparison]::Ordinal)) {
    throw "Vendored license integrity check failed: $($pin.file)"
  }
}

$expectedFiles = @($expected | ForEach-Object { $_.file } | Sort-Object)
$actualEntries = @(Get-ChildItem -LiteralPath $libPath -Force | Sort-Object Name)
if ($actualEntries.Count -ne $expectedFiles.Count) {
  throw 'The vendored local-memory dependency directory contains missing or unpinned entries.'
}
for ($index = 0; $index -lt $expectedFiles.Count; $index += 1) {
  if (!$actualEntries[$index].PSIsContainer -and $actualEntries[$index].Name -ceq $expectedFiles[$index]) { continue }
  throw 'The vendored local-memory dependency directory contains missing or unpinned entries.'
}

foreach ($artifact in $expected) {
  $artifactPath = Join-Path $libPath $artifact.file
  $actualHash = Get-LocalMemorySha256 -Path $artifactPath
  if (![string]::Equals($actualHash, $artifact.sha256, [StringComparison]::Ordinal)) {
    throw "Vendored dependency integrity check failed: $($artifact.file)"
  }
}

Write-Host 'PASS verified pinned local-memory dependencies'
