$ErrorActionPreference = "Stop"

$pluginRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot "..\.."))
$upstreamRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot ".tmp\music-lib"))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $pluginRoot ".build"))
$packageRoot = Join-Path $buildRoot "package"
$sourceRoot = Join-Path $buildRoot "source"
$adapterSource = Join-Path $sourceRoot "fe-monster-qishui-plugin"
$musicLibSource = Join-Path $sourceRoot "music-lib"
$qrSource = Join-Path $sourceRoot "go-qrcode"
$outputDirectory = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "dist\plugins"))
$outputPath = [IO.Path]::GetFullPath((Join-Path $outputDirectory "FE-Monster-Qishui-API-Plugin-1.0.0.zip"))
$sourceCommit = "7a864570e1ca8ccdb9d44bb57def626b53c33621"
$qrVersion = "v0.0.0-20200617195104-da1b6568686e"

if (-not $buildRoot.StartsWith("$pluginRoot\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a build directory outside the Qishui plugin source."
}
if (-not $outputPath.StartsWith("$outputDirectory\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside dist/plugins."
}
if (-not (Test-Path -LiteralPath (Join-Path $upstreamRoot ".git") -PathType Container)) {
  throw "Clone SolitudeKing/music-lib into .tmp/music-lib before building."
}
$actualCommit = (& git -c "safe.directory=$upstreamRoot" -C $upstreamRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $sourceCommit) {
  throw "Expected music-lib commit $sourceCommit, got $actualCommit."
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $packageRoot, $sourceRoot, $adapterSource, $musicLibSource, $qrSource, $outputDirectory -Force | Out-Null

$env:GOCACHE = Join-Path $buildRoot "go-cache"
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"

Push-Location $pluginRoot
try {
  & go mod download
  if ($LASTEXITCODE -ne 0) { throw "go mod download failed." }
  & go test ./...
  if ($LASTEXITCODE -ne 0) { throw "Qishui plugin tests failed." }
  & go build -trimpath -ldflags "-s -w -X main.sourceCommit=$sourceCommit" -o (Join-Path $packageRoot "qishui-api-plugin.exe") .
  if ($LASTEXITCODE -ne 0) { throw "Qishui plugin build failed." }
} finally {
  Pop-Location
}

foreach ($name in @("music-api-package.json", "start.ps1", "README.md", "THIRD-PARTY-NOTICES.md")) {
  Copy-Item -LiteralPath (Join-Path $pluginRoot $name) -Destination $packageRoot
}
Copy-Item -LiteralPath (Join-Path $upstreamRoot "LICENSE") -Destination (Join-Path $packageRoot "LICENSE-AGPL-3.0.txt")

$qrModuleDir = (& go list -m -f "{{.Dir}}" "github.com/skip2/go-qrcode@$qrVersion").Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $qrModuleDir -PathType Container)) {
  throw "Unable to locate go-qrcode source."
}
Copy-Item -LiteralPath (Join-Path $qrModuleDir "LICENSE") -Destination (Join-Path $packageRoot "LICENSE-go-qrcode.txt")

foreach ($name in @("main.go", "go.mod", "go.sum", "README.md", "THIRD-PARTY-NOTICES.md", "SOURCE-README.md", "build.ps1", "start.ps1", "music-api-package.json")) {
  Copy-Item -LiteralPath (Join-Path $pluginRoot $name) -Destination $adapterSource
}

$upstreamArchive = Join-Path $buildRoot "music-lib-source.zip"
& git -c "safe.directory=$upstreamRoot" -C $upstreamRoot archive --format=zip --output=$upstreamArchive $sourceCommit
if ($LASTEXITCODE -ne 0) { throw "Failed to archive music-lib corresponding source." }
Expand-Archive -LiteralPath $upstreamArchive -DestinationPath $musicLibSource -Force

Get-ChildItem -LiteralPath $qrModuleDir -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $qrSource -Recurse -Force
}

Push-Location $adapterSource
try {
  & go mod edit "-replace=github.com/SolitudeKing/music-lib=../music-lib"
  if ($LASTEXITCODE -ne 0) { throw "Failed to pin local music-lib corresponding source." }
  & go mod edit "-replace=github.com/skip2/go-qrcode=../go-qrcode"
  if ($LASTEXITCODE -ne 0) { throw "Failed to pin local go-qrcode corresponding source." }
} finally {
  Pop-Location
}

$sourceArchive = Join-Path $packageRoot "SOURCE.zip"
Compress-Archive -Path (Join-Path $sourceRoot "*") -DestinationPath $sourceArchive -CompressionLevel Optimal

$sourceBytes = (Get-Item -LiteralPath $sourceArchive).Length
if ($sourceBytes -gt 16MB) {
  throw "SOURCE.zip exceeds FE Monster's 16 MiB per-entry limit."
}

Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $outputPath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($outputPath)
try {
  $entries = @($archive.Entries)
  $expandedBytes = ($entries | Measure-Object -Property Length -Sum).Sum
  $largestEntry = $entries | Sort-Object Length -Descending | Select-Object -First 1
  if ($entries.Count -gt 256) { throw "Qishui API plugin ZIP exceeds 256 entries." }
  if ($expandedBytes -gt 100MB) { throw "Qishui API plugin ZIP exceeds the 100 MiB expanded limit." }
  if ($largestEntry.Length -gt 16MB) { throw "Qishui API plugin entry exceeds 16 MiB: $($largestEntry.FullName)" }
  if (-not ($entries | Where-Object FullName -eq "music-api-package.json")) { throw "Qishui API plugin manifest is missing." }
} finally {
  $archive.Dispose()
}

$zipBytes = (Get-Item -LiteralPath $outputPath).Length
if ($zipBytes -gt 25MB) {
  throw "Qishui API plugin ZIP exceeds FE Monster's 25 MiB package limit."
}

$result = [pscustomobject]@{
  Output = $outputPath
  ZipBytes = $zipBytes
  SourceBytes = $sourceBytes
  ZipSha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
  MusicLibCommit = $sourceCommit
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force
$result
