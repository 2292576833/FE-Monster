$ErrorActionPreference = "Stop"

$pluginVersion = "2.0.7"
$upstreamVersion = "1.5.1"
$upstreamCommit = "283f1e97b110726b208a64b486a657c0fc0a6126"

$pluginRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot "..\.."))
$upstreamRoot = Join-Path $repositoryRoot "node_modules\kugoumusicapi"
$fallbackUpstreamRoot = Join-Path $repositoryRoot "node_modules\.ignored_kugoumusicapi"
$temporaryUpstreamJunction = $false
$buildRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot ".build"))
$packageRoot = Join-Path $buildRoot "package"
$outputDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "dist\plugins"))
$outputPath = Join-Path $outputDirectory "FE-Monster-Kugou-API-Plugin-$pluginVersion.zip"

if (-not $buildRoot.StartsWith("$pluginRoot\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a build directory outside the Kugou plugin source."
}
if (-not (Test-Path -LiteralPath (Join-Path $upstreamRoot "package.json"))) {
  if (-not (Test-Path -LiteralPath (Join-Path $fallbackUpstreamRoot "package.json"))) {
    throw "Local kugoumusicapi source is missing. Expected node_modules\kugoumusicapi or node_modules\.ignored_kugoumusicapi."
  }
  New-Item -ItemType Junction -Path $upstreamRoot -Target $fallbackUpstreamRoot | Out-Null
  $temporaryUpstreamJunction = $true
}

try {
  $metadata = Get-Content -LiteralPath (Join-Path $upstreamRoot "package.json") -Raw | ConvertFrom-Json
  if ($metadata.version -ne $upstreamVersion) {
    throw "Expected kugoumusicapi $upstreamVersion, got $($metadata.version)."
  }

  Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $packageRoot, $outputDirectory -Force | Out-Null

  $entryPath = Join-Path $pluginRoot "src\server-entry.cjs"
  $bundlePath = Join-Path $packageRoot "server.cjs"
  & npx.cmd --yes --package esbuild@0.28.1 esbuild $entryPath `
    --bundle `
    --platform=node `
    --format=cjs `
    --target=node18 `
    --legal-comments=eof `
    "--outfile=$bundlePath"
  if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed to bundle the Kugou API plugin."
  }

  foreach ($name in @("music-api-package.json", "LICENSE", "THIRD-PARTY-NOTICES.md", "README.md")) {
    Copy-Item -LiteralPath (Join-Path $pluginRoot $name) -Destination $packageRoot
  }

  $bundleBytes = (Get-Item -LiteralPath $bundlePath).Length
  if ($bundleBytes -gt 16MB) {
    throw "server.cjs exceeds FE Monster's 16 MiB per-entry limit."
  }

  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $outputPath -CompressionLevel Optimal

  $zip = [IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryCount = $zip.Entries.Count
    $expandedBytes = ($zip.Entries | Measure-Object -Property Length -Sum).Sum
    $largestEntry = ($zip.Entries | Sort-Object Length -Descending | Select-Object -First 1)
  } finally {
    $zip.Dispose()
  }

  $zipBytes = (Get-Item -LiteralPath $outputPath).Length
  if ($zipBytes -gt 25MB) { throw "Kugou API plugin ZIP exceeds FE Monster's 25 MiB package limit." }
  if ($entryCount -gt 256) { throw "Kugou API plugin ZIP exceeds FE Monster's 256-entry limit." }
  if ($expandedBytes -gt 100MB) { throw "Kugou API plugin exceeds FE Monster's 100 MiB extracted limit." }
  if ($largestEntry.Length -gt 16MB) { throw "Kugou API plugin contains an entry over 16 MiB." }

  $result = [pscustomobject]@{
    Output = $outputPath
    PluginVersion = $pluginVersion
    UpstreamVersion = $upstreamVersion
    UpstreamCommit = $upstreamCommit
    ZipBytes = $zipBytes
    BundleBytes = $bundleBytes
    ExpandedBytes = $expandedBytes
    EntryCount = $entryCount
    LargestEntry = $largestEntry.FullName
    LargestEntryBytes = $largestEntry.Length
    Sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
  }

  Remove-Item -LiteralPath $buildRoot -Recurse -Force
} finally {
  if ($temporaryUpstreamJunction -and (Test-Path -LiteralPath $upstreamRoot)) {
    $junction = Get-Item -LiteralPath $upstreamRoot -Force
    $junctionTarget = @($junction.Target) | Select-Object -First 1
    $target = [IO.Path]::GetFullPath([string]$junctionTarget)
    if ($junction.LinkType -ne "Junction" -or
        -not $target.Equals([IO.Path]::GetFullPath($fallbackUpstreamRoot), [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an unexpected path at $upstreamRoot."
    }
    [IO.Directory]::Delete($upstreamRoot, $false)
  }
}
$result

