param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
# Reproduce the read-only JAR handle held by a live JVM. Building the same
# pinned dependency version must neither delete nor rewrite that dependency.
$dependency = Join-Path $Root 'out\lib\slf4j-api-1.7.36.jar'
$before = (Get-FileHash -LiteralPath $dependency -Algorithm SHA256).Hash
$handle = [IO.File]::Open($dependency, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
  & (Join-Path $Root 'scripts\build-java.ps1') -Root $Root
  if ((Get-FileHash -LiteralPath $dependency -Algorithm SHA256).Hash -ne $before) {
    throw 'The live dependency changed during build.'
  }
  Write-Host 'PASS: Java build preserves identical dependencies held by a running backend.'
} finally { $handle.Dispose() }
