param(
  [string]$ImagePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$workspaceRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ImagePath)) {
  $artifactDir = Join-Path $workspaceRoot 'artifacts'
  $latestAudit = Get-ChildItem -LiteralPath $artifactDir -Filter 'storm-ocean-fresnel-audit-*.png' -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (!$latestAudit) {
    throw "No storm-ocean-fresnel-audit-*.png screenshot was found in $artifactDir."
  }
  $ImagePath = $latestAudit.FullName
}

function Get-Quantile {
  param(
    [double[]]$Values,
    [double]$Fraction
  )

  $index = [Math]::Min($Values.Count - 1, [int][Math]::Floor($Values.Count * $Fraction))
  return $Values[$index]
}

function Get-Luminance {
  param([System.Drawing.Color]$Pixel)

  return (0.2126 * $Pixel.R + 0.7152 * $Pixel.G + 0.0722 * $Pixel.B) / 255.0
}

$resolved = (Resolve-Path -LiteralPath $ImagePath).Path
$image = [System.Drawing.Bitmap]::FromFile($resolved)
$luminance = [System.Collections.Generic.List[double]]::new()
$chromaSamples = [System.Collections.Generic.List[double]]::new()
$sampleStep = [int][Math]::Max(2, [Math]::Round($image.Height / 225.0))

# Stay inside the foreground water: this excludes the window's rounded edge,
# lyrics, the DIY panel, and the media cards at the sides.
$startX = [int][Math]::Floor($image.Width * 0.10)
$endX = [int][Math]::Ceiling($image.Width * 0.90)
$startY = [int][Math]::Floor($image.Height * 0.76)
$endY = [int][Math]::Floor($image.Height * 0.94)
$textureOffsets = [ordered]@{
  fine = [int][Math]::Max(2, [Math]::Round($image.Height * 0.004))
  medium = [int][Math]::Max(4, [Math]::Round($image.Height * 0.012))
  coarse = [int][Math]::Max(8, [Math]::Round($image.Height * 0.028))
}
$textureTotals = @{ fine = 0.0; medium = 0.0; coarse = 0.0 }
$textureCounts = @{ fine = 0; medium = 0; coarse = 0 }
$totalChroma = 0.0

try {
  for ($y = $startY; $y -lt $endY; $y += $sampleStep) {
    for ($x = $startX; $x -lt $endX; $x += $sampleStep) {
      $pixel = $image.GetPixel($x, $y)
      $value = Get-Luminance $pixel
      $red = $pixel.R / 255.0
      $green = $pixel.G / 255.0
      $blue = $pixel.B / 255.0
      $chroma = [Math]::Max($red, [Math]::Max($green, $blue)) - [Math]::Min($red, [Math]::Min($green, $blue))
      $luminance.Add($value)
      $chromaSamples.Add($chroma)
      $totalChroma += $chroma

      foreach ($scale in $textureOffsets.Keys) {
        $offset = $textureOffsets[$scale]
        if ($x + $offset -lt $endX) {
          $textureTotals[$scale] += [Math]::Abs($value - (Get-Luminance $image.GetPixel($x + $offset, $y)))
          $textureCounts[$scale] += 1
        }
        if ($y + $offset -lt $endY) {
          $textureTotals[$scale] += [Math]::Abs($value - (Get-Luminance $image.GetPixel($x, $y + $offset)))
          $textureCounts[$scale] += 1
        }
      }
    }
  }

  if ($luminance.Count -eq 0) {
    throw 'The near-water analysis region did not contain any samples.'
  }

  $sorted = [double[]]($luminance.ToArray() | Sort-Object)
  $p10 = Get-Quantile $sorted 0.10
  $median = Get-Quantile $sorted 0.50
  $p90 = Get-Quantile $sorted 0.90
  $p95 = Get-Quantile $sorted 0.95
  $p99 = Get-Quantile $sorted 0.99
  $highlightContrast = $p95 / [Math]::Max(0.001, $median)
  $specularPeakContrast = $p99 / [Math]::Max(0.001, $median)
  $relativeHighlightThreshold = [Math]::Min(1.0, [Math]::Max($median + 0.01, $median * 1.18))
  $highlight = 0
  $neutralHighlight = 0
  $highlightChroma = 0.0

  for ($y = $startY; $y -lt $endY; $y += $sampleStep) {
    for ($x = $startX; $x -lt $endX; $x += $sampleStep) {
      $pixel = $image.GetPixel($x, $y)
      $value = Get-Luminance $pixel
      if ($value -lt $relativeHighlightThreshold) { continue }
      $red = $pixel.R / 255.0
      $green = $pixel.G / 255.0
      $blue = $pixel.B / 255.0
      $chroma = [Math]::Max($red, [Math]::Max($green, $blue)) - [Math]::Min($red, [Math]::Min($green, $blue))
      $highlight += 1
      $highlightChroma += $chroma
      if ($chroma -lt 0.06) { $neutralHighlight += 1 }
    }
  }

  $oceanMeanChroma = $totalChroma / $luminance.Count
  $plasticChromaCeiling = [Math]::Min(0.13, [Math]::Max(0.08, $oceanMeanChroma * 1.15))
  $plasticMask = [bool[]]::new($luminance.Count)
  $transmissionWindow = 0
  $plasticFilm = 0
  for ($index = 0; $index -lt $luminance.Count; $index += 1) {
    $sampleLuminance = $luminance[$index]
    $sampleChroma = $chromaSamples[$index]
    if ($sampleLuminance -ge $median * 1.10 `
        -and $sampleLuminance -le $p95 * 1.05 `
        -and $sampleChroma -le $plasticChromaCeiling) {
      $plasticMask[$index] = $true
      $plasticFilm += 1
    }
    if ($sampleLuminance -le $median * 0.95 -and $sampleChroma -ge 0.13) {
      $transmissionWindow += 1
    }
  }

  $sampleColumns = [int][Math]::Ceiling(($endX - $startX) / [double]$sampleStep)
  $sampleRows = [int][Math]::Ceiling(($endY - $startY) / [double]$sampleStep)
  $visited = [bool[]]::new($luminance.Count)
  $largestPlasticComponent = 0
  for ($index = 0; $index -lt $plasticMask.Count; $index += 1) {
    if (!$plasticMask[$index] -or $visited[$index]) { continue }
    $queue = [System.Collections.Generic.Queue[int]]::new()
    $queue.Enqueue($index)
    $visited[$index] = $true
    $componentSize = 0
    while ($queue.Count -gt 0) {
      $current = $queue.Dequeue()
      $componentSize += 1
      $currentX = $current % $sampleColumns
      $currentY = [int][Math]::Floor($current / $sampleColumns)
      for ($deltaY = -1; $deltaY -le 1; $deltaY += 1) {
        for ($deltaX = -1; $deltaX -le 1; $deltaX += 1) {
          if ($deltaX -eq 0 -and $deltaY -eq 0) { continue }
          $neighborX = $currentX + $deltaX
          $neighborY = $currentY + $deltaY
          if ($neighborX -lt 0 -or $neighborX -ge $sampleColumns -or $neighborY -lt 0 -or $neighborY -ge $sampleRows) { continue }
          $neighbor = $neighborY * $sampleColumns + $neighborX
          if ($neighbor -ge $plasticMask.Count -or !$plasticMask[$neighbor] -or $visited[$neighbor]) { continue }
          $visited[$neighbor] = $true
          $queue.Enqueue($neighbor)
        }
      }
    }
    $largestPlasticComponent = [Math]::Max($largestPlasticComponent, $componentSize)
  }
} finally {
  $image.Dispose()
}

$textureEnergy = [ordered]@{}
foreach ($scale in $textureOffsets.Keys) {
  $rawEnergy = $textureTotals[$scale] / [Math]::Max(1, $textureCounts[$scale])
  $textureEnergy[$scale] = [Math]::Round($rawEnergy / [Math]::Max(0.05, $median), 4)
}
$multiScaleTextureEnergy = ($textureEnergy.fine + $textureEnergy.medium + $textureEnergy.coarse) / 3.0
$waterColumnDepthVariation = 1.0 - ($p10 / [Math]::Max(0.001, $median))
$highlightCoveragePercent = 100 * $highlight / $luminance.Count
$plasticFilmCoveragePercent = 100 * $plasticFilm / $luminance.Count
$largestPlasticFilmComponentPercent = 100 * $largestPlasticComponent / $luminance.Count
$transmissionWindowCoveragePercent = 100 * $transmissionWindow / $luminance.Count
$passes = $median -ge 0.15 `
  -and $median -le 0.35 `
  -and $highlightContrast -ge 1.20 `
  -and $highlightContrast -le 4.0 `
  -and $specularPeakContrast -ge 1.30 `
  -and $specularPeakContrast -le 5.0 `
  -and $multiScaleTextureEnergy -ge 0.025 `
  -and $waterColumnDepthVariation -ge 0.18 `
  -and $highlightCoveragePercent -ge 2.0 `
  -and $highlightCoveragePercent -le 22.0 `
  -and $plasticFilmCoveragePercent -le 12.0 `
  -and $largestPlasticFilmComponentPercent -le 3.0 `
  -and $transmissionWindowCoveragePercent -ge 8.0

$result = [ordered]@{
  image = $resolved
  analysisRegion = [ordered]@{
    x = $startX
    y = $startY
    width = $endX - $startX
    height = $endY - $startY
  }
  oceanSamples = $luminance.Count
  nearWaterClarity = [Math]::Round($median, 4)
  nearWaterMedianLuminance = [Math]::Round($median, 4)
  p10Luminance = [Math]::Round($p10, 4)
  p90Luminance = [Math]::Round($p90, 4)
  p95Luminance = [Math]::Round($p95, 4)
  p99Luminance = [Math]::Round($p99, 4)
  highlightContrast = [Math]::Round($highlightContrast, 2)
  specularPeakContrast = [Math]::Round($specularPeakContrast, 2)
  relativeHighlightThreshold = [Math]::Round($relativeHighlightThreshold, 4)
  highlightCoveragePercent = [Math]::Round($highlightCoveragePercent, 2)
  neutralHighlightPercent = [Math]::Round(100 * $neutralHighlight / $luminance.Count, 2)
  highlightMeanChroma = if ($highlight) { [Math]::Round($highlightChroma / $highlight, 4) } else { 0 }
  oceanMeanChroma = [Math]::Round($oceanMeanChroma, 4)
  plasticChromaCeiling = [Math]::Round($plasticChromaCeiling, 4)
  plasticFilmCoveragePercent = [Math]::Round($plasticFilmCoveragePercent, 2)
  largestPlasticFilmComponentPercent = [Math]::Round($largestPlasticFilmComponentPercent, 2)
  transmissionWindowCoveragePercent = [Math]::Round($transmissionWindowCoveragePercent, 2)
  waterColumnDepthVariation = [Math]::Round($waterColumnDepthVariation, 4)
  textureEnergyByScale = $textureEnergy
  multiScaleTextureEnergy = [Math]::Round($multiScaleTextureEnergy, 4)
  ok = $passes
}

$result | ConvertTo-Json -Depth 4

if (!$passes) {
  throw ('Ocean material audit failed: clarity={0:N4}, highlightContrast={1:N2}, specularPeakContrast={2:N2}, plasticFilm={3:N2}%, largestPlasticFilm={4:N2}%, transmissionWindows={5:N2}%, waterColumnDepthVariation={6:N4}, multiScaleTextureEnergy={7:N4}.' -f $median, $highlightContrast, $specularPeakContrast, $plasticFilmCoveragePercent, $largestPlasticFilmComponentPercent, $transmissionWindowCoveragePercent, $waterColumnDepthVariation, $multiScaleTextureEnergy)
}
