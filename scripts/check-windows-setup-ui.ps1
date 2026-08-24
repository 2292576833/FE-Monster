param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $Root 'native\windows\setup\Program.cs'
$manifestPath = Join-Path $Root 'native\windows\setup\app.manifest'
$failures = [System.Collections.Generic.List[string]]::new()

if (!(Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Missing setup source: $sourcePath"
}

$source = Get-Content -Raw -Encoding UTF8 -LiteralPath $sourcePath
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath
$installLocation = [string]([char]0x5b89) + [char]0x88c5 + [char]0x4f4d + [char]0x7f6e
$installProgress = [string]([char]0x5b89) + [char]0x88c5 + [char]0x8fdb + [char]0x5ea6
$installDetails = [string]([char]0x5b89) + [char]0x88c5 + [char]0x8be6 + [char]0x7ec6 + [char]0x4fe1 + [char]0x606f
$retryInstall = [string]([char]0x91cd) + [char]0x8bd5 + [char]0x5b89 + [char]0x88c5
$onlineBundle = [string]([char]0x5728) + [char]0x7ebf + [char]0x5b89 + [char]0x88c5 + [char]0x5305
$offlineBundle = [string]([char]0x79bb) + [char]0x7ebf + [char]0x5b89 + [char]0x88c5 + [char]0x5305
$showDetails = [string]([char]0x663e) + [char]0x793a + [char]0x5b89 + [char]0x88c5 + [char]0x8be6 + [char]0x60c5

function Assert-Match {
  param([string]$Name, [string]$Pattern, [string]$Text = $source)
  if ($Text -notmatch $Pattern) { $failures.Add($Name) | Out-Null }
}

function Assert-NotMatch {
  param([string]$Name, [string]$Pattern, [string]$Text = $source)
  if ($Text -match $Pattern) { $failures.Add($Name) | Out-Null }
}

Assert-Match "installer uses a white application surface" "BackColor\s*=\s*Color\.White"
Assert-NotMatch "installer no longer contains the legacy dark page surface" "Color\.FromArgb\(16,\s*20,\s*24\)"
Assert-Match "installer uses responsive table layout instead of fixed content coordinates" "TableLayoutPanel"
Assert-Match "installer uses DPI-aware automatic scaling" "AutoScaleMode\s*=\s*AutoScaleMode\.Dpi"
Assert-Match "installer shows its assembly product version" "Application\.ProductVersion"
Assert-Match "installer normalizes the visible version to three release components" "DisplayProductVersion\(Application\.ProductVersion\)"
Assert-Match "installer declares PerMonitorV2 DPI awareness" "<dpiAwareness[^>]*>PerMonitorV2</dpiAwareness>" $manifest
Assert-Match "installer Enter key invokes the primary action" "AcceptButton\s*=\s*installButton"
Assert-Match "installer Escape key invokes the close action" "CancelButton\s*=\s*closeButton"
Assert-Match "install path has an accessible name" ("AccessibleName\s*=\s*`"" + [Regex]::Escape($installLocation) + "`"")
Assert-Match "progress indicator has an accessible name" ("AccessibleName\s*=\s*`"" + [Regex]::Escape($installProgress) + "`"")
Assert-Match "install log has an accessible name" ("AccessibleName\s*=\s*`"" + [Regex]::Escape($installDetails) + "`"")
Assert-Match "installer exposes an explicit ready state" "SetupVisualState\.Ready"
Assert-Match "installer exposes an explicit installing state" "SetupVisualState\.Installing"
Assert-Match "installer exposes an explicit completed state" "SetupVisualState\.Completed"
Assert-Match "installer exposes an explicit failed state" "SetupVisualState\.Failed"
Assert-Match "failed state exposes a retry action" ("installButton\.Text\s*=\s*`"" + [Regex]::Escape($retryInstall) + "`"")
Assert-Match "installer displays online bundle status" ([Regex]::Escape($onlineBundle))
Assert-Match "installer displays offline bundle status" ([Regex]::Escape($offlineBundle))
Assert-Match "installer exposes installation details without forcing logs open" ("Text\s*=\s*`"" + [Regex]::Escape($showDetails) + "`"")
Assert-Match "installer preserves a high-contrast fallback" "SystemInformation\.HighContrast"
Assert-Match "installer provides visible keyboard focus cues" "DrawFocusRectangle"
Assert-NotMatch "installer does not contain the replacement character" "\uFFFD"

if ($failures.Count -gt 0) {
  Write-Host 'Windows setup UI contract: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Windows setup UI contract: OK'
