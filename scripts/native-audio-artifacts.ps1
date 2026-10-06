function Get-NativeAudioPairHash {
  param([Parameter(Mandatory = $true)][string]$Text)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Assert-NativeAudioArtifactPair {
  param([Parameter(Mandatory = $true)][string]$Directory)
  $manifestPath = Join-Path $Directory 'native-audio-build.json'
  $xaudioPath = Join-Path $Directory 'fe-monster-xaudio2.dll'
  $rustPath = Join-Path $Directory 'fe_monster_upmix.dll'
  foreach ($required in @($manifestPath, $xaudioPath, $rustPath)) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Incomplete native audio pair: $required" }
  }
  if ((Get-Item -LiteralPath $manifestPath).Length -gt 65536) { throw 'Native audio build manifest is too large.' }
  $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.architecture -cne 'x64') { throw 'Unsupported native audio pair manifest.' }
  $xaudioHash = (Get-FileHash -LiteralPath $xaudioPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $rustHash = (Get-FileHash -LiteralPath $rustPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $pairHash = Get-NativeAudioPairHash "fe-monster-xaudio2.dll=$xaudioHash`nfe_monster_upmix.dll=$rustHash"
  if ($xaudioHash -cne [string]$manifest.xaudio2Sha256 -or $rustHash -cne [string]$manifest.upmixSha256 -or $pairHash -cne [string]$manifest.pairSha256) {
    throw 'Native audio DLL hashes do not match their build manifest.'
  }
  return $manifest
}

function Resolve-NativeAudioRunDll {
  param([Parameter(Mandatory = $true)][string]$Root)
  try {
    $rootPath = (Resolve-Path -LiteralPath $Root).Path
    $nativePath = Join-Path $rootPath 'native\windows'
    $buildsPath = [IO.Path]::GetFullPath((Join-Path $nativePath 'builds'))
    $marker = Join-Path $nativePath 'run-audio.txt'
    if (!(Test-Path -LiteralPath $marker -PathType Leaf)) { return '' }
    if ((Get-Item -LiteralPath $marker).Length -gt 8192) { return '' }
    $value = [IO.File]::ReadAllText($marker).Trim()
    if ([string]::IsNullOrWhiteSpace($value) -or $value.IndexOfAny([char[]]"`r`n") -ge 0) { return '' }
    $candidate = if ([IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $rootPath $value }
    $candidate = [IO.Path]::GetFullPath($candidate)
    $directory = [IO.Path]::GetDirectoryName($candidate)
    if ([IO.Path]::GetFileName($candidate) -cne 'fe-monster-xaudio2.dll' -or
        ![string]::Equals([IO.Path]::GetDirectoryName($directory), $buildsPath, [StringComparison]::OrdinalIgnoreCase)) { return '' }
    foreach ($entry in @((Join-Path $rootPath 'native'), $nativePath, $buildsPath, $directory, $candidate,
        (Join-Path $directory 'fe_monster_upmix.dll'), (Join-Path $directory 'native-audio-build.json'))) {
      if (!(Test-Path -LiteralPath $entry) -or ((Get-Item -LiteralPath $entry).Attributes -band [IO.FileAttributes]::ReparsePoint)) { return '' }
    }
    Assert-NativeAudioArtifactPair -Directory $directory | Out-Null
    return $candidate
  } catch { return '' }
}

function Publish-NativeAudioArtifactPair {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$SourceDirectory
  )
  Assert-NativeAudioArtifactPair -Directory $SourceDirectory | Out-Null
  $rootPath = (Resolve-Path -LiteralPath $Root).Path
  $nativePath = Join-Path $rootPath 'native\windows'
  $buildsPath = Join-Path $nativePath 'builds'
  New-Item -ItemType Directory -Path $buildsPath -Force | Out-Null
  foreach ($entry in @((Join-Path $rootPath 'native'), $nativePath, $buildsPath)) {
    if ((Get-Item -LiteralPath $entry).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Native audio publication cannot follow a redirected workspace directory.' }
  }
  $token = [Guid]::NewGuid().ToString('N')
  $directory = Join-Path $buildsPath $token
  New-Item -ItemType Directory -Path $directory | Out-Null
  foreach ($name in @('fe-monster-xaudio2.dll', 'fe_monster_upmix.dll', 'native-audio-build.json')) {
    [IO.File]::Copy((Join-Path $SourceDirectory $name), (Join-Path $directory $name), $false)
  }
  Assert-NativeAudioArtifactPair -Directory $directory | Out-Null
  $dll = Join-Path $directory 'fe-monster-xaudio2.dll'
  $marker = Join-Path $nativePath 'run-audio.txt'
  $stagedMarker = Join-Path $nativePath ".run-audio-$token.tmp"
  try {
    [IO.File]::WriteAllText($stagedMarker, $dll + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($marker)) { [IO.File]::Replace($stagedMarker, $marker, [NullString]::Value) }
    else { [IO.File]::Move($stagedMarker, $marker) }
  } finally {
    if ([IO.File]::Exists($stagedMarker)) { [IO.File]::Delete($stagedMarker) }
  }
  return $dll
}
