$ErrorActionPreference = "Stop"

$pluginVersion = "3.1.0"
$pluginRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot "..\.."))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot ".build"))
$packageRoot = Join-Path $buildRoot "package"
$outputDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "dist\plugins"))
$outputPath = Join-Path $outputDirectory "FE-Monster-Qishui-OpenAPI-Plugin-$pluginVersion.zip"

if (-not $buildRoot.StartsWith("$pluginRoot\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a build directory outside the Qishui plugin source."
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $packageRoot, $outputDirectory -Force | Out-Null

try {
  Copy-Item -LiteralPath (Join-Path $pluginRoot "src\server.cjs") -Destination (Join-Path $packageRoot "server.cjs")
  foreach ($name in @("music-api-package.json", "LICENSE", "THIRD-PARTY-NOTICES.md", "README.md")) {
    Copy-Item -LiteralPath (Join-Path $pluginRoot $name) -Destination $packageRoot
  }

  $entryBytes = (Get-Item -LiteralPath (Join-Path $packageRoot "server.cjs")).Length
  if ($entryBytes -gt 16MB) {
    throw "server.cjs exceeds FE Monster's 16 MiB per-entry limit."
  }

  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $outputPath -CompressionLevel Optimal

  $zip = [IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $entryCount = $zip.Entries.Count
    $expandedBytes = ($zip.Entries | Measure-Object -Property Length -Sum).Sum
    $largestEntry = $zip.Entries | Sort-Object Length -Descending | Select-Object -First 1
  } finally {
    $zip.Dispose()
  }

  $zipBytes = (Get-Item -LiteralPath $outputPath).Length
  if ($zipBytes -gt 25MB) { throw "Qishui API plugin ZIP exceeds FE Monster's 25 MiB package limit." }
  if ($entryCount -gt 256) { throw "Qishui API plugin ZIP exceeds FE Monster's 256-entry limit." }
  if ($expandedBytes -gt 100MB) { throw "Qishui API plugin exceeds FE Monster's 100 MiB extracted limit." }
  if ($largestEntry.Length -gt 16MB) { throw "Qishui API plugin contains an entry over 16 MiB." }

  [pscustomobject]@{
    Output = $outputPath
    PluginVersion = $pluginVersion
    ZipBytes = $zipBytes
    EntryBytes = $entryBytes
    ExpandedBytes = $expandedBytes
    EntryCount = $entryCount
    LargestEntry = $largestEntry.FullName
    LargestEntryBytes = $largestEntry.Length
    Sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
  }
} finally {
  Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
}
