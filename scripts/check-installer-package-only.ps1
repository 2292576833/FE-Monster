$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$builder = Join-Path $projectRoot 'scripts\build-installer.ps1'
$source = Get-Content -Raw -LiteralPath $builder
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($builder, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer builder has syntax errors.' }
$checks = 0

function Assert-Condition([bool]$Condition, [string]$Message) {
  if (!$Condition) { throw $Message }
  $script:checks++
}
function Assert-Rejected([scriptblock]$Block, [string]$Expected) {
  $rejected = $false
  try { & $Block } catch {
    if (!$_.Exception.Message.Contains($Expected)) { throw }
    $rejected = $true
  }
  Assert-Condition $rejected ('Expected rejection: ' + $Expected)
}

$guards = @($ast.EndBlock.Statements | Where-Object {
  $_ -is [Management.Automation.Language.IfStatementAst] -and
  $_.Extent.Text.StartsWith('if ($PackageOnly -and ($StageOnly -or $ReusePayloadZip))')
})
Assert-Condition ($guards.Count -eq 1) 'Package-only mode compatibility guard is missing.'
$guard = [scriptblock]::Create($guards[0].Extent.Text)
$PackageOnly = $true
$StageOnly = $true
$ReusePayloadZip = $false
Assert-Rejected $guard '-PackageOnly cannot be combined'
$StageOnly = $false
$ReusePayloadZip = $true
Assert-Rejected $guard '-PackageOnly cannot be combined'
$PackageOnly = $false
& $guard
$ReusePayloadZip = $false

$overrideGuards = @($ast.EndBlock.Statements | Where-Object {
  $_ -is [Management.Automation.Language.IfStatementAst] -and
  $_.Extent.Text.Contains("throw '-PackageOnly must use the workspace community URL")
})
Assert-Condition ($overrideGuards.Count -eq 1) 'Package-only release override guard is missing.'
$PackageOnly = $true
$CommunityServerUrl = 'https://community.example.test/community'
$CommunityServerTlsPins = ''
Assert-Rejected ([scriptblock]::Create($overrideGuards[0].Extent.Text)) '-PackageOnly must use'

foreach ($name in @('ConvertTo-NormalizedCommunityTlsPins', 'Stage-CommunityServerConfiguration')) {
  $definitions = @($ast.EndBlock.Statements | Where-Object {
    $_ -is [Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq $name
  })
  if ($definitions.Count -ne 1) { throw "Missing build function: $name" }
  . ([scriptblock]::Create($definitions[0].Extent.Text))
}

# Only synthetic fixtures are written. The health function is deliberately
# fail-closed, so a normal release must stop before staging its configuration.
$rootPath = Join-Path $projectRoot ('tmp\package-only-policy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $rootPath 'data') -Force | Out-Null
$expectedUrl = 'https://community.example.test/community'
$expectedPin = 'sha256:' + ('A' * 64)
[IO.File]::WriteAllText((Join-Path $rootPath 'data\community-server-url.txt'), $expectedUrl)
[IO.File]::WriteAllText((Join-Path $rootPath 'data\community-server-tls-pin.txt'), $expectedPin)
$script:urlChecks = 0
$script:healthChecks = 0
function Assert-PublicCommunityServerUrl([string]$Value) {
  $script:urlChecks++
  if ($Value -cne $expectedUrl) { throw 'Unexpected fixture URL.' }
  return $Value
}
function Assert-CommunityServerHealth([string]$CommunityBaseUrl, [string[]]$TlsPins) {
  $script:healthChecks++
  throw 'fixture-health-required'
}
$CommunityServerUrl = ''
$CommunityServerTlsPins = ''
$SkipDeveloperCommunityHealthCheck = $false
$PackageOnly = $true
$payloadRoot = Join-Path $rootPath 'local-payload'
Stage-CommunityServerConfiguration
Assert-Condition ($script:urlChecks -eq 1 -and $script:healthChecks -eq 0) 'Local packaging skipped URL validation or unexpectedly ran the live probe.'
Assert-Condition ((Get-Content -Raw (Join-Path $payloadRoot 'data\community-server-url.txt')) -ceq $expectedUrl) 'Local package changed the configured public URL.'
Assert-Condition ((Get-Content -Raw (Join-Path $payloadRoot 'data\community-server-tls-pin.txt')).Trim() -ceq $expectedPin) 'Local package changed the certificate pin.'

$PackageOnly = $false
$payloadRoot = Join-Path $rootPath 'release-payload'
Assert-Rejected { Stage-CommunityServerConfiguration } 'fixture-health-required'
Assert-Condition ($script:healthChecks -eq 1 -and !(Test-Path -LiteralPath $payloadRoot)) 'Normal release bypassed failed community health verification.'
Assert-Condition ($source.Contains('publicationRequiresCommunityHealthCheck = [bool]$PackageOnly')) 'Local package diagnostics do not disclose deferred verification.'
Assert-Condition ($source.Contains("Join-Path `$outputPath 'package-only'")) 'Default local package output is not separated from release output.'
[ordered]@{ passed = $true; checks = $checks; fixtureRoot = $rootPath } | ConvertTo-Json
