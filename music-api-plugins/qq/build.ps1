$ErrorActionPreference = "Stop"

$qqRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $qqRoot "..\.."))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $qqRoot ".build"))
$runtimeRoot = Join-Path $buildRoot "runtime"
$packageRoot = Join-Path $buildRoot "package"
$outputDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "dist\plugins"))
$outputPath = [IO.Path]::GetFullPath((Join-Path $outputDirectory "FE-Monster-QQ-API-Plugin-2.4.1.zip"))

if (-not $buildRoot.StartsWith("$qqRoot\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a build directory outside the QQ plugin source."
}
if (-not $outputPath.StartsWith("$outputDirectory\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside dist/plugins."
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $runtimeRoot, $packageRoot, $outputDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $qqRoot "runtime-package.json") -Destination (Join-Path $runtimeRoot "package.json")

& npm.cmd install --prefix $runtimeRoot --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false --install-strategy=hoisted
if ($LASTEXITCODE -ne 0) {
  throw "npm failed to install the QQ Music API runtime."
}

$installedMetadata = Get-Content -LiteralPath (Join-Path $runtimeRoot "node_modules\@sansenjian\qq-music-api\package.json") -Raw | ConvertFrom-Json
if ($installedMetadata.version -ne "2.4.0") {
  throw "Expected @sansenjian/qq-music-api 2.4.0, got $($installedMetadata.version)."
}

& node (Join-Path $qqRoot "patch-runtime.cjs") $runtimeRoot
if ($LASTEXITCODE -ne 0) {
  throw "Failed to patch the QQ Music API private playlist extractor."
}

$upstreamRoot = Join-Path $runtimeRoot "node_modules\@sansenjian\qq-music-api"
foreach ($relativePath in @("docs-dist", "public", "README.md", "CHANGELOG.md")) {
  Remove-Item -LiteralPath (Join-Path $upstreamRoot $relativePath) -Recurse -Force -ErrorAction SilentlyContinue
}

$runtimeArchive = Join-Path $packageRoot "runtime.tgz"
& tar.exe -czf $runtimeArchive -C $runtimeRoot .
if ($LASTEXITCODE -ne 0) {
  throw "tar failed to create the QQ Music API runtime archive."
}

$runtimeBytes = (Get-Item -LiteralPath $runtimeArchive).Length
if ($runtimeBytes -gt 16MB) {
  throw "runtime.tgz exceeds FE Monster's 16 MiB per-entry limit."
}

$runtimeChecksum = (Get-FileHash -LiteralPath $runtimeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $packageRoot "runtime.sha256"), "$runtimeChecksum`n", [Text.UTF8Encoding]::new($false))

Copy-Item -LiteralPath (Join-Path $qqRoot "music-api-package.json") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $qqRoot "server.cjs") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $qqRoot "LICENSE") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $qqRoot "README.txt") -Destination $packageRoot
& node (Join-Path $qqRoot "generate-notices.cjs") $runtimeRoot (Join-Path $packageRoot "THIRD-PARTY-NOTICES.txt")
if ($LASTEXITCODE -ne 0) {
  throw "Failed to generate third-party notices."
}

Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $outputPath -CompressionLevel Optimal

$zipBytes = (Get-Item -LiteralPath $outputPath).Length
if ($zipBytes -gt 25MB) {
  throw "QQ API plugin ZIP exceeds FE Monster's 25 MiB package limit."
}

$zipChecksum = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
$checksumPath = "$outputPath.sha256"
$checksumLine = "$($zipChecksum.ToLowerInvariant())  $([IO.Path]::GetFileName($outputPath))`n"
[IO.File]::WriteAllText($checksumPath, $checksumLine, [Text.Encoding]::ASCII)
$result = [pscustomobject]@{
  Output = $outputPath
  ZipBytes = $zipBytes
  RuntimeBytes = $runtimeBytes
  RuntimeSha256 = $runtimeChecksum
  ZipSha256 = $zipChecksum
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force
$result
