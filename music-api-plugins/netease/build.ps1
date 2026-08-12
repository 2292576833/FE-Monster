param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'dist\plugins')
)

$ErrorActionPreference = 'Stop'
$sourceDirectory = $PSScriptRoot
$buildDirectory = Join-Path $sourceDirectory '.build'
$runtimeDirectory = Join-Path $buildDirectory 'runtime'
$packageDirectory = Join-Path $buildDirectory 'package'
$runtimeArchive = Join-Path $sourceDirectory 'runtime.tgz'
$metadataPath = Join-Path $sourceDirectory 'plugin-runtime.json'
$outputPath = Join-Path $OutputDirectory 'FE-Monster-Netease-API-Plugin-4.32.0.zip'

if (Test-Path -LiteralPath $buildDirectory) {
    Remove-Item -LiteralPath $buildDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $runtimeDirectory | Out-Null
New-Item -ItemType Directory -Path $packageDirectory | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceDirectory 'runtime-package.json') -Destination (Join-Path $runtimeDirectory 'package.json')
Push-Location $runtimeDirectory
try {
    npm install --omit=dev --ignore-scripts --no-audit --no-fund --save-exact
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if (Test-Path -LiteralPath $runtimeArchive) {
    Remove-Item -LiteralPath $runtimeArchive -Force
}
Push-Location $runtimeDirectory
try {
    & tar.exe -czf $runtimeArchive 'node_modules'
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$archiveHash = (Get-FileHash -LiteralPath $runtimeArchive -Algorithm SHA256).Hash
$metadata = [ordered]@{
    schema = 'fe-monster.plugin-runtime/v1'
    package = 'NeteaseCloudMusicApi'
    version = '4.32.0'
    archiveSha256 = $archiveHash
}
$metadataJson = $metadata | ConvertTo-Json
[System.IO.File]::WriteAllText($metadataPath, $metadataJson, [System.Text.UTF8Encoding]::new($false))

$packageFiles = @(
    'music-api-package.json',
    'server.cjs',
    'runtime.tgz',
    'plugin-runtime.json',
    'README.md',
    'THIRD_PARTY_NOTICES.md'
)
foreach ($file in $packageFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $file) -Destination (Join-Path $packageDirectory $file)
}
$sharedSafeLog = Join-Path (Split-Path -Parent $sourceDirectory) 'shared\safe-log.cjs'
if (!(Test-Path -LiteralPath $sharedSafeLog -PathType Leaf)) {
    throw "Shared music API log sanitizer is missing: $sharedSafeLog"
}
Copy-Item -LiteralPath $sharedSafeLog -Destination (Join-Path $packageDirectory 'safe-log.cjs')
Copy-Item -LiteralPath (Join-Path $runtimeDirectory 'node_modules\NeteaseCloudMusicApi\LICENSE') -Destination (Join-Path $packageDirectory 'NETEASE_API_LICENSE.txt')

if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
}
Compress-Archive -Path (Join-Path $packageDirectory '*') -DestinationPath $outputPath -CompressionLevel Optimal

$outputFile = Get-Item -LiteralPath $outputPath
$largestEntry = Get-Item -LiteralPath $runtimeArchive
if ($outputFile.Length -gt 25MB) {
    throw "Plugin ZIP exceeds the 25 MB import limit: $($outputFile.Length) bytes"
}
if ($largestEntry.Length -gt 16MB) {
    throw "runtime.tgz exceeds the 16 MB per-entry import limit: $($largestEntry.Length) bytes"
}

$outputHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
$checksumPath = "$outputPath.sha256"
$checksumLine = "$($outputHash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($outputPath))`n"
[System.IO.File]::WriteAllText($checksumPath, $checksumLine, [System.Text.Encoding]::ASCII)

$result = [ordered]@{
    path = $outputFile.FullName
    bytes = $outputFile.Length
    sha256 = $outputHash
    runtimeBytes = $largestEntry.Length
    runtimeSha256 = $archiveHash
} | ConvertTo-Json

$resolvedBuildDirectory = [System.IO.Path]::GetFullPath($buildDirectory)
$sourcePrefix = [System.IO.Path]::GetFullPath($sourceDirectory).TrimEnd('\') + '\'
if (-not $resolvedBuildDirectory.StartsWith($sourcePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean build directory outside the plugin source: $resolvedBuildDirectory"
}
Remove-Item -LiteralPath $resolvedBuildDirectory -Recurse -Force
foreach ($generatedSourceArtifact in @($runtimeArchive, $metadataPath)) {
    $resolvedArtifact = [System.IO.Path]::GetFullPath($generatedSourceArtifact)
    if (-not $resolvedArtifact.StartsWith($sourcePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean generated artifact outside the plugin source: $resolvedArtifact"
    }
    Remove-Item -LiteralPath $resolvedArtifact -Force
}

$result
