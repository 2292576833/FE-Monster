param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Source = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'branding\fe-monster-logo-front-master.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rootPath = (Resolve-Path $Root).Path
$sourcePath = (Resolve-Path $Source).Path
$iosProjectRoot = Get-ChildItem -LiteralPath $rootPath -Directory |
  Where-Object {
    $_.Name -like 'FE moster iOS*' -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'project.yml'))
  } |
  Select-Object -First 1

if ($null -eq $iosProjectRoot) {
  throw 'The iOS project directory was not found.'
}

$macProjectRoot = Get-ChildItem -LiteralPath $rootPath -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'Build\build-macos.sh') } |
  Select-Object -First 1

if ($null -eq $macProjectRoot) {
  throw 'The macOS project directory was not found.'
}

function Export-SquarePng {
  param(
    [System.Drawing.Image]$Image,
    [string]$Path,
    [int]$Size
  )

  $directory = Split-Path -Parent $Path
  if (!(Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $bitmap = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(8, 10, 12))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.DrawImage(
        $Image,
        [System.Drawing.Rectangle]::new(0, 0, $Size, $Size),
        0,
        0,
        $Image.Width,
        $Image.Height,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $graphics.Dispose()
    }

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  if ($sourceImage.Width -ne $sourceImage.Height) {
    throw "Logo master must be square: $sourcePath"
  }

  $targets = @(
    @{ Path = 'native\windows\assets\fe-monster.png'; Size = 256 },
    @{ Path = 'web\assets\fe-monster-app-icon.png'; Size = 512 },
    @{ Path = 'web\assets\fe-monster-favicon.png'; Size = 64 },
    @{ Path = 'download-site\public\media\logo.png'; Size = 512 },
    @{ Path = 'android\app\src\main\res\mipmap-mdpi\ic_launcher.png'; Size = 48 },
    @{ Path = 'android\app\src\main\res\mipmap-hdpi\ic_launcher.png'; Size = 72 },
    @{ Path = 'android\app\src\main\res\mipmap-xhdpi\ic_launcher.png'; Size = 96 },
    @{ Path = 'android\app\src\main\res\mipmap-xxhdpi\ic_launcher.png'; Size = 144 },
    @{ Path = 'android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png'; Size = 192 }
  )

  foreach ($target in $targets) {
    $targetPath = Join-Path $rootPath $target.Path
    Export-SquarePng -Image $sourceImage -Path $targetPath -Size $target.Size
    Write-Host "Created $($target.Size)x$($target.Size): $targetPath"
  }

  $iosIconPath = Join-Path $iosProjectRoot.FullName 'App\Resources\Assets.xcassets\AppIcon.appiconset\FE-Monster-AppIcon-1024.png'
  Export-SquarePng -Image $sourceImage -Path $iosIconPath -Size 1024
  Write-Host "Created 1024x1024: $iosIconPath"

  $macIconsetPath = Join-Path $macProjectRoot.FullName 'Build\AppIcon.iconset'
  foreach ($macTarget in @(
    @{ Name = 'icon_16x16.png'; Size = 16 },
    @{ Name = 'icon_16x16@2x.png'; Size = 32 },
    @{ Name = 'icon_32x32.png'; Size = 32 },
    @{ Name = 'icon_32x32@2x.png'; Size = 64 },
    @{ Name = 'icon_128x128.png'; Size = 128 },
    @{ Name = 'icon_128x128@2x.png'; Size = 256 },
    @{ Name = 'icon_256x256.png'; Size = 256 },
    @{ Name = 'icon_256x256@2x.png'; Size = 512 },
    @{ Name = 'icon_512x512.png'; Size = 512 },
    @{ Name = 'icon_512x512@2x.png'; Size = 1024 }
  )) {
    $macIconPath = Join-Path $macIconsetPath $macTarget.Name
    Export-SquarePng -Image $sourceImage -Path $macIconPath -Size $macTarget.Size
    Write-Host "Created macOS $($macTarget.Size)x$($macTarget.Size): $macIconPath"
  }
} finally {
  $sourceImage.Dispose()
}

& (Join-Path $PSScriptRoot 'build-windows-icon.ps1') -Root $rootPath
