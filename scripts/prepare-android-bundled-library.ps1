param(
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [Parameter(Mandatory = $true)]
  [string]$OutputDir,
  [string]$ServerRoot = ''
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path $Root).Path
$outputPath = (Resolve-Path $OutputDir).Path
if ([string]::IsNullOrWhiteSpace($ServerRoot)) {
  $ServerRoot = Join-Path (Split-Path -Parent $rootPath) 'FE moster server'
}
if (!(Test-Path (Join-Path $ServerRoot 'data'))) {
  Write-Host 'Android bundled library: server data folder not found; packaging built-in client assets only.'
  exit 0
}

$dataRoot = (Resolve-Path (Join-Path $ServerRoot 'data')).Path
$jobsRoot = Join-Path $dataRoot 'codex-preset-jobs'
$assetOutputRoot = Join-Path $outputPath 'bundled-assets'
$libraryOutput = Join-Path $outputPath 'data\android-bundled-library.json'
$copiedAssets = @{}

function Read-QueryValue {
  param([string]$Query, [string]$Name)
  foreach ($part in ($Query -split '&')) {
    $pair = $part -split '=', 2
    if ($pair.Count -eq 2 -and $pair[0] -eq $Name) {
      return [Uri]::UnescapeDataString(($pair[1] -replace '\+', ' '))
    }
  }
  return ''
}

function Convert-AssetUrl {
  param([string]$Value)
  if (!$Value.StartsWith('/api/sandbox/assets?')) { return $Value }
  $query = $Value.Substring($Value.IndexOf('?') + 1)
  $jobId = Read-QueryValue $query 'jobId'
  $relativeFile = (Read-QueryValue $query 'file') -replace '\\', '/'
  if ($jobId -notmatch '^[A-Za-z0-9-]{8,80}$' -or [string]::IsNullOrWhiteSpace($relativeFile)) { return $Value }
  if ($relativeFile -match '(^|/)\.\.(/|$)' -or $relativeFile.StartsWith('/')) { return $Value }

  $portableStormTexture = switch ([IO.Path]::GetFileName($relativeFile).ToLowerInvariant()) {
    'water-normal-spectral-8k.png' { 'water-normal-spectral-4k.png'; break }
    'water-normal-spectral-4k.png' { 'water-normal-spectral-4k.png'; break }
    'water-roughness-spectral-8k.png' { 'water-roughness-spectral-4k.png'; break }
    'water-roughness-spectral-4k.png' { 'water-roughness-spectral-4k.png'; break }
    default { '' }
  }
  if (![string]::IsNullOrWhiteSpace($portableStormTexture)) {
    return "/assets/storm-ocean/$portableStormTexture"
  }

  $extension = [IO.Path]::GetExtension($relativeFile).ToLowerInvariant()
  if ($extension -in @('.blend', '.blend1')) { return $Value }

  $jobRoot = Join-Path $jobsRoot $jobId
  $source = Join-Path $jobRoot ($relativeFile -replace '/', '\')
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { return $Value }
  $resolvedJob = (Resolve-Path $jobRoot).Path.TrimEnd('\') + '\'
  $resolvedSource = (Resolve-Path $source).Path
  if (!$resolvedSource.StartsWith($resolvedJob, [StringComparison]::OrdinalIgnoreCase)) { return $Value }

  $destination = Join-Path (Join-Path $assetOutputRoot $jobId) ($relativeFile -replace '/', '\')
  if (!$copiedAssets.ContainsKey($resolvedSource)) {
    $destinationDir = Split-Path -Parent $destination
    if (!(Test-Path $destinationDir)) { New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null }
    Copy-Item -LiteralPath $resolvedSource -Destination $destination -Force
    $copiedAssets[$resolvedSource] = $true
  }
  $encodedPath = (($relativeFile -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
  return "/bundled-assets/$jobId/$encodedPath"
}

function Convert-BundledValue {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [string]) { return Convert-AssetUrl $Value }
  if ($Value -is [System.Collections.IDictionary]) {
    foreach ($key in @($Value.Keys)) { $Value[$key] = Convert-BundledValue $Value[$key] }
    return $Value
  }
  if ($Value -is [System.Collections.IList]) {
    for ($index = 0; $index -lt $Value.Count; $index += 1) { $Value[$index] = Convert-BundledValue $Value[$index] }
    return $Value
  }
  if ($Value -is [pscustomobject]) {
    foreach ($property in @($Value.PSObject.Properties)) {
      $convertedValue = Convert-BundledValue $property.Value
      if ($property.Name -in @('sceneItems', 'fallbackSceneItems') -and
          $null -ne $convertedValue -and
          !($convertedValue -is [System.Collections.IList])) {
        $property.Value = [object[]]@($convertedValue)
      } else {
        $property.Value = $convertedValue
      }
    }
    return $Value
  }
  return $Value
}

function Read-JsonFolder {
  param([string]$Path)
  $items = @()
  if (!(Test-Path $Path)) { return $items }
  foreach ($file in (Get-ChildItem -LiteralPath $Path -File -Filter '*.json' | Sort-Object Name)) {
    try {
      $parsed = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $items += ,(Convert-BundledValue $parsed)
    } catch {
      Write-Warning "Skipping invalid bundled library file: $($file.FullName)"
    }
  }
  return $items
}

$components = @(Read-JsonFolder (Join-Path $dataRoot 'components'))
$presets = @(Read-JsonFolder (Join-Path $dataRoot 'presets'))
$payload = [ordered]@{
  schema = 'fe-monster.android-bundled-library/v1'
  generatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  components = $components
  presets = $presets
}
$libraryDirectory = Split-Path -Parent $libraryOutput
if (!(Test-Path $libraryDirectory)) { New-Item -ItemType Directory -Path $libraryDirectory -Force | Out-Null }
$json = $payload | ConvertTo-Json -Depth 100 -Compress
[IO.File]::WriteAllText($libraryOutput, $json, [Text.UTF8Encoding]::new($false))
Write-Host "Android bundled library: $($components.Count) components, $($presets.Count) presets, $($copiedAssets.Count) playback assets."
