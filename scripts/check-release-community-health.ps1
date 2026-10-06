param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$buildScript = Join-Path $rootPath 'scripts\build-installer.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($buildScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Installer build script has PowerShell syntax errors.' }

# Load only the installer's read-only health functions. Do not run the build
# entrypoint, stage files, start services, alter firewall rules or bypass TLS.
$functionNames = @(
  'ConvertTo-NormalizedCommunityTlsPins',
  'Initialize-CommunityHealthProbeType',
  'Invoke-PinnedCommunityHealthRequest',
  'Test-IsPublicCommunityAddress',
  'Resolve-CommunityServerAddresses',
  'Assert-PublicCommunityServerUrl',
  'Assert-CommunityServerHealth'
)
foreach ($name in $functionNames) {
  $definitions = @($ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq $name
  })
  if ($definitions.Count -ne 1) { throw "Installer health function is missing or ambiguous: $name" }
  . ([scriptblock]::Create($definitions[0].Extent.Text))
}

$url = Assert-PublicCommunityServerUrl (Get-Content -Raw -LiteralPath (Join-Path $rootPath 'data\community-server-url.txt'))
$pins = @(ConvertTo-NormalizedCommunityTlsPins (Get-Content -Raw -LiteralPath (Join-Path $rootPath 'data\community-server-tls-pin.txt')))
if ($pins.Count -lt 1) { throw 'Release health verification requires at least one configured certificate pin.' }
Assert-CommunityServerHealth -CommunityBaseUrl $url -TlsPins $pins
[ordered]@{
  passed = $true
  communityBaseUrl = $url
  expectedService = 'fe-monster-community'
  tlsPinCount = $pins.Count
  verifiedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json
