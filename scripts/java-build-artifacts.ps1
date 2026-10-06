# Build outputs used by long-running Java processes must remain immutable.
# Replacing a pathname preserves an existing reader's file handle; copying over
# the same file corrupts the ZIP offsets cached by a running JVM.
function Resolve-JavaRunJar {
  param([Parameter(Mandatory = $true)][string]$Root)

  $rootPath = (Resolve-Path -LiteralPath $Root).Path
  $outPath = [IO.Path]::GetFullPath((Join-Path $rootPath 'out'))
  $marker = Join-Path $outPath 'run-jar.txt'
  if (!(Test-Path -LiteralPath $outPath -PathType Container) -or
      ((Get-Item -LiteralPath $outPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { return '' }
  if (!(Test-Path -LiteralPath $marker -PathType Leaf)) { return '' }
  try {
    $value = [IO.File]::ReadAllText($marker).Trim()
    if ([string]::IsNullOrWhiteSpace($value) -or $value.IndexOfAny([char[]]"`r`n") -ge 0) { return '' }
    $candidate = if ([IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $rootPath $value }
    $candidate = [IO.Path]::GetFullPath($candidate)
    # Only direct immutable build artifacts are eligible. Do not follow a
    # marker outside this workspace or back to the mutable compatibility name.
    if (![string]::Equals([IO.Path]::GetDirectoryName($candidate), $outPath, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($candidate) -notmatch '^fe-monster-java-.+\.jar$' -or
        !(Test-Path -LiteralPath $candidate -PathType Leaf)) { return '' }
    $item = Get-Item -LiteralPath $candidate
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return '' }
    return $item.FullName
  } catch {
    return ''
  }
}

function Publish-JavaBuildArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RunJar
  )

  $rootPath = (Resolve-Path -LiteralPath $Root).Path
  $outPath = [IO.Path]::GetFullPath((Join-Path $rootPath 'out'))
  $runPath = (Resolve-Path -LiteralPath $RunJar).Path
  if (![string]::Equals([IO.Path]::GetDirectoryName($runPath), $outPath, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($runPath) -notmatch '^fe-monster-java-.+\.jar$' -or
      !(Test-Path -LiteralPath $runPath -PathType Leaf) -or
      ((Get-Item -LiteralPath $outPath).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      ((Get-Item -LiteralPath $runPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Java run artifact must be an immutable jar directly inside the workspace out directory.'
  }
  $stablePath = Join-Path $outPath 'fe-monster-java.jar'
  $markerPath = Join-Path $outPath 'run-jar.txt'
  $token = [Guid]::NewGuid().ToString('N')
  $stagedJar = Join-Path $outPath ".fe-monster-java-$token.tmp"
  $stagedMarker = Join-Path $outPath ".run-jar-$token.tmp"
  $stablePublished = $false
  try {
    [IO.File]::Copy($runPath, $stagedJar, $false)
    try {
      if ([IO.File]::Exists($stablePath)) {
        [IO.File]::Replace($stagedJar, $stablePath, [NullString]::Value)
      } else {
        [IO.File]::Move($stagedJar, $stablePath)
      }
      $stablePublished = $true
    } catch [IO.IOException] {
      Write-Warning 'The stable Java jar could not be replaced (it may be in use). Its existing bytes were preserved; new launches will use the immutable build.'
    } catch [UnauthorizedAccessException] {
      Write-Warning 'The stable Java jar is locked or read-only. Its existing bytes were preserved; new launches will use the immutable build.'
    }
    [IO.File]::WriteAllText($stagedMarker, $runPath + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($markerPath)) {
      [IO.File]::Replace($stagedMarker, $markerPath, [NullString]::Value)
    } else {
      [IO.File]::Move($stagedMarker, $markerPath)
    }
    return [PSCustomObject]@{ RunJar = $runPath; StablePublished = $stablePublished }
  } finally {
    foreach ($temporaryPath in @($stagedJar, $stagedMarker)) {
      if ([IO.File]::Exists($temporaryPath)) { [IO.File]::Delete($temporaryPath) }
    }
  }
}
