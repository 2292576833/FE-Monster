param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$dependencyRoot = Join-Path $rootPath 'third_party\java\local-memory'
$receiptPath = Join-Path $dependencyRoot 'dependencies.json'
$libPath = Join-Path $dependencyRoot 'lib'
$checker = Join-Path $rootPath 'scripts\check-local-memory-dependencies.ps1'
$expectedReceiptSha256 = '10e41804f6b4af8a4b92770454e20175db98216ffebbb8feccac346f83555e49'

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

if (!(Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
  throw 'The pinned local-memory dependency receipt is missing.'
}
$actualReceiptSha256 = Get-LocalMemoryNormalizedTextSha256 -Path $receiptPath
if (![string]::Equals($actualReceiptSha256, $expectedReceiptSha256, [StringComparison]::Ordinal)) {
  throw 'The pinned local-memory dependency receipt failed its integrity check before network access.'
}
$receipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
$artifacts = @($receipt.artifacts)
if ([int]$receipt.schemaVersion -ne 1 -or $artifacts.Count -ne 3) {
  throw 'The local-memory dependency receipt has an unsupported shape.'
}

New-Item -ItemType Directory -Path $libPath -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

foreach ($artifact in $artifacts) {
  $fileName = [string]$artifact.file
  $url = [string]$artifact.url
  $expectedHash = ([string]$artifact.sha256).ToLowerInvariant()
  $invalidArtifact = ($fileName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{1,159}\.jar$') `
    -or ($url -notmatch '^https://') `
    -or ($expectedHash -notmatch '^[a-f0-9]{64}$')
  if ($invalidArtifact) {
    throw 'The local-memory dependency receipt contains an invalid artifact.'
  }
  $destination = Join-Path $libPath $fileName
  if (Test-Path -LiteralPath $destination) {
    $existingHash = Get-LocalMemorySha256 -Path $destination
    if (![string]::Equals($existingHash, $expectedHash, [StringComparison]::Ordinal)) {
      throw "Refusing to overwrite a mismatched vendored dependency: $fileName"
    }
    Write-Host "Verified existing $fileName"
    continue
  }

  $download = $destination + '.download'
  if (Test-Path -LiteralPath $download) {
    Remove-Item -LiteralPath $download -Force
  }
  try {
    Write-Host "Downloading pinned dependency $fileName"
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $download
    $downloadHash = Get-LocalMemorySha256 -Path $download
    if (![string]::Equals($downloadHash, $expectedHash, [StringComparison]::Ordinal)) {
      throw "Downloaded dependency integrity check failed: $fileName"
    }
    Move-Item -LiteralPath $download -Destination $destination
  } finally {
    if (Test-Path -LiteralPath $download) {
      Remove-Item -LiteralPath $download -Force
    }
  }
}

& $checker -Root $rootPath
