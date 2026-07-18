param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Reextract
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rootPath = (Resolve-Path $Root).Path
$assetDirectory = Join-Path $rootPath 'native\windows\assets'
$pngPath = Join-Path $assetDirectory 'fe-monster.png'
$icoPath = Join-Path $assetDirectory 'fe-monster.ico'
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)

function Read-LargestPngFrameFromIco {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 22 -or [BitConverter]::ToUInt16($bytes, 2) -ne 1) {
    throw "Invalid ICO file: $Path"
  }

  $count = [BitConverter]::ToUInt16($bytes, 4)
  $best = $null
  for ($index = 0; $index -lt $count; $index++) {
    $entryOffset = 6 + ($index * 16)
    if ($entryOffset + 16 -gt $bytes.Length) {
      throw "Truncated ICO directory: $Path"
    }

    $width = if ($bytes[$entryOffset] -eq 0) { 256 } else { [int]$bytes[$entryOffset] }
    $height = if ($bytes[$entryOffset + 1] -eq 0) { 256 } else { [int]$bytes[$entryOffset + 1] }
    $length = [BitConverter]::ToUInt32($bytes, $entryOffset + 8)
    $dataOffset = [BitConverter]::ToUInt32($bytes, $entryOffset + 12)
    $isPng = (
      $dataOffset + 8 -le $bytes.Length -and
      $bytes[$dataOffset] -eq 0x89 -and
      $bytes[$dataOffset + 1] -eq 0x50 -and
      $bytes[$dataOffset + 2] -eq 0x4E -and
      $bytes[$dataOffset + 3] -eq 0x47
    )
    if (!$isPng -or $dataOffset + $length -gt $bytes.Length) {
      continue
    }

    if ($null -eq $best -or ($width * $height) -gt ($best.Width * $best.Height)) {
      $best = [pscustomobject]@{
        Width = $width
        Height = $height
        Length = [int]$length
        Offset = [int]$dataOffset
      }
    }
  }

  if ($null -eq $best) {
    throw "The ICO does not contain a PNG frame: $Path"
  }

  $stream = [System.IO.MemoryStream]::new($bytes, $best.Offset, $best.Length, $false, $true)
  try {
    $decoded = [System.Drawing.Image]::FromStream($stream)
    try {
      return [System.Drawing.Bitmap]::new($decoded)
    } finally {
      $decoded.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function New-RoundedRectanglePath {
  param(
    [float]$Left,
    [float]$Top,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Left, $Top, $diameter, $diameter, 180, 90)
  $path.AddArc($Left + $Width - $diameter, $Top, $diameter, $diameter, 270, 90)
  $path.AddArc($Left + $Width - $diameter, $Top + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Left, $Top + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Remove-CheckerboardBackdrop {
  param([System.Drawing.Bitmap]$Source)

  $scale = 4
  $maskLarge = [System.Drawing.Bitmap]::new(
    $Source.Width * $scale,
    $Source.Height * $scale,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($maskLarge)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $left = [float]($Source.Width * 0.084 * $scale)
      $top = [float]($Source.Height * 0.078 * $scale)
      $width = [float]($Source.Width * 0.832 * $scale)
      $height = [float]($Source.Height * 0.832 * $scale)
      $radius = [float]($Source.Width * 0.164 * $scale)
      $path = New-RoundedRectanglePath -Left $left -Top $top -Width $width -Height $height -Radius $radius
      try {
        $graphics.FillPath([System.Drawing.Brushes]::White, $path)
      } finally {
        $path.Dispose()
      }
    } finally {
      $graphics.Dispose()
    }

    $mask = [System.Drawing.Bitmap]::new(
      $Source.Width,
      $Source.Height,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($mask)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage(
          $maskLarge,
          [System.Drawing.Rectangle]::new(0, 0, $mask.Width, $mask.Height),
          0,
          0,
          $maskLarge.Width,
          $maskLarge.Height,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }

      $result = [System.Drawing.Bitmap]::new(
        $Source.Width,
        $Source.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )
      for ($y = 0; $y -lt $Source.Height; $y++) {
        for ($x = 0; $x -lt $Source.Width; $x++) {
          $alpha = $mask.GetPixel($x, $y).A
          if ($alpha -eq 0) {
            $result.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
            continue
          }

          $color = $Source.GetPixel($x, $y)
          $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
        }
      }
      return $result
    } finally {
      $mask.Dispose()
    }
  } finally {
    $maskLarge.Dispose()
  }
}

function Convert-BitmapToPngBytes {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size
  )

  $frame = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($frame)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage(
        $Source,
        [System.Drawing.Rectangle]::new(0, 0, $Size, $Size),
        0,
        0,
        $Source.Width,
        $Source.Height,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $graphics.Dispose()
    }

    $stream = [System.IO.MemoryStream]::new()
    try {
      $frame.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return $stream.ToArray()
    } finally {
      $stream.Dispose()
    }
  } finally {
    $frame.Dispose()
  }
}

function Write-MultiSizeIco {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$Path,
    [int[]]$Sizes
  )

  $frames = [System.Collections.Generic.List[byte[]]]::new()
  foreach ($size in $Sizes) {
    [byte[]]$frame = Convert-BitmapToPngBytes -Source $Source -Size $size
    $frames.Add($frame)
  }
  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$frames.Count)

    $dataOffset = 6 + (16 * $frames.Count)
    for ($index = 0; $index -lt $frames.Count; $index++) {
      $size = $Sizes[$index]
      $dimensionByte = if ($size -eq 256) { [byte]0 } else { [byte]$size }
      $writer.Write($dimensionByte)
      $writer.Write($dimensionByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$frames[$index].Length)
      $writer.Write([uint32]$dataOffset)
      $dataOffset += $frames[$index].Length
    }

    foreach ($frame in $frames) {
      $writer.Write($frame)
    }
    [System.IO.File]::WriteAllBytes($Path, $stream.ToArray())
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

if ($Reextract -or !(Test-Path -LiteralPath $pngPath)) {
  if (!(Test-Path -LiteralPath $icoPath)) {
    throw "Source icon was not found: $icoPath"
  }

  $source = Read-LargestPngFrameFromIco -Path $icoPath
  try {
    $transparent = Remove-CheckerboardBackdrop -Source $source
    try {
      $transparent.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $transparent.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

$iconSource = [System.Drawing.Bitmap]::new($pngPath)
try {
  Write-MultiSizeIco -Source $iconSource -Path $icoPath -Sizes $iconSizes
} finally {
  $iconSource.Dispose()
}

Write-Host "Created transparent PNG: $pngPath"
Write-Host "Created Windows icon: $icoPath"
