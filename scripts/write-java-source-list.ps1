param(
  [Parameter(Mandatory)]
  [string]$OutputPath,
  [Parameter(Mandatory)]
  [string]$SourceRoot,
  [string]$OptionalSourceRoot = ''
)

$ErrorActionPreference = 'Stop'
$roots = New-Object System.Collections.Generic.List[string]
foreach ($candidate in @($SourceRoot, $OptionalSourceRoot)) {
  if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $roots.Add((Resolve-Path -LiteralPath $candidate).Path) | Out-Null
  }
}
if ($roots.Count -eq 0) {
  throw 'No Java source roots were found.'
}

$lines = Get-ChildItem -LiteralPath $roots.ToArray() -Recurse -Filter '*.java' -File |
  Sort-Object -Property FullName |
  ForEach-Object { '"' + $_.FullName.Replace('\', '/') + '"' }
if (@($lines).Count -eq 0) {
  throw 'No Java source files were found.'
}

$parent = Split-Path -Parent ([System.IO.Path]::GetFullPath($OutputPath))
if (!(Test-Path -LiteralPath $parent -PathType Container)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
[System.IO.File]::WriteAllLines(
  [System.IO.Path]::GetFullPath($OutputPath),
  [string[]]$lines,
  [System.Text.UTF8Encoding]::new($false)
)
