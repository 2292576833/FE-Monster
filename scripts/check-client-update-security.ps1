$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$updateScript = Join-Path $repoRoot 'scripts\apply-client-update.ps1'
$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = Join-Path $systemTemp ('fe-monster-update-security-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

function Get-UpdateFunction {
  param([string]$Name)
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($updateScript, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { throw "Update script parse failed: $($errors[0].Message)" }
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
  }, $true)
  if ($null -eq $function) { throw "Update function is missing: $Name" }
  $body = $function.Body.Extent.Text
  return [scriptblock]::Create($body.Substring(1, $body.Length - 2))
}

function Write-UpdateProgress {
  param([string]$Status, [int]$Percent, [string]$Message)
}

function Invoke-RejectionCase {
  param(
    [string]$Name,
    [string]$Root,
    [string]$DownloadUrl,
    [AllowEmptyString()][string]$Sha256,
    [string]$ExpectedMessage
  )

  $progressFile = Join-Path $testRoot ($Name + '.json')
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $updateScript,
    '-Root',
    $Root,
    '-DownloadUrl',
    $DownloadUrl,
    '-Version',
    'security-test',
    '-ProgressFile',
    $progressFile
  )
  if (![string]::IsNullOrEmpty($Sha256)) {
    $arguments += @('-Sha256', $Sha256)
  }

  & powershell.exe @arguments *> $null
  if ($LASTEXITCODE -eq 0) { throw "$Name unexpectedly succeeded" }
  if (!(Test-Path -LiteralPath $progressFile -PathType Leaf)) { throw "$Name did not write failure progress" }
  $progress = Get-Content -Raw -LiteralPath $progressFile | ConvertFrom-Json
  if ([string]$progress.status -ne 'failed') { throw "$Name did not report failed status" }
  if ([string]$progress.message -notmatch $ExpectedMessage) {
    throw "$Name reported '$($progress.message)' instead of /$ExpectedMessage/"
  }
}

try {
  $quoteArgument = Get-UpdateFunction 'ConvertTo-WindowsProcessArgument'
  $spacedArgument = & $quoteArgument 'E:\Program Files\FE Monster'
  if ($spacedArgument -cne '"E:\Program Files\FE Monster"') {
    throw "Space-containing install directory was quoted incorrectly: $spacedArgument"
  }
  $trailingSlashArgument = & $quoteArgument 'E:\FE Monster\'
  if ($trailingSlashArgument -cne '"E:\FE Monster\\"') {
    throw "Trailing slash was quoted incorrectly: $trailingSlashArgument"
  }

  $verifyAuthenticode = Get-UpdateFunction 'Assert-InstallerAuthenticode'
  $unsignedFixture = Join-Path $testRoot 'unsigned-fixture.exe'
  Add-Type -TypeDefinition @'
public static class FeMonsterUnsignedUpdateFixture {
    public static int Main() { return 0; }
}
'@ -OutputType ConsoleApplication -OutputAssembly $unsignedFixture
  $unsignedRequired = Join-Path $testRoot 'unsigned-required.exe'
  Copy-Item -LiteralPath $unsignedFixture -Destination $unsignedRequired
  $AuthenticodePolicy = 'RequireValid'
  $signatureRejected = $false
  try {
    & $verifyAuthenticode $unsignedRequired
  } catch {
    $signatureRejected = $_.Exception.Message -match 'Authenticode verification failed'
  }
  if (!$signatureRejected -or (Test-Path -LiteralPath $unsignedRequired)) {
    throw 'RequireValid did not reject and remove an unsigned installer'
  }

  $unsignedOptional = Join-Path $testRoot 'unsigned-optional.exe'
  Copy-Item -LiteralPath $unsignedFixture -Destination $unsignedOptional
  $AuthenticodePolicy = 'IfPresent'
  & $verifyAuthenticode $unsignedOptional
  if (!(Test-Path -LiteralPath $unsignedOptional -PathType Leaf)) {
    throw 'IfPresent unexpectedly rejected an unsigned development installer'
  }

  Invoke-RejectionCase `
    -Name 'missing-sha' `
    -Root $testRoot `
    -DownloadUrl 'https://127.0.0.1:9/FE-Monster-Setup.exe' `
    -Sha256 '' `
    -ExpectedMessage 'SHA-256 digest is required'

  Invoke-RejectionCase `
    -Name 'http-download' `
    -Root $testRoot `
    -DownloadUrl 'http://127.0.0.1:9/FE-Monster-Setup.exe' `
    -Sha256 ('a' * 64) `
    -ExpectedMessage 'must use HTTPS'

  Invoke-RejectionCase `
    -Name 'development-checkout' `
    -Root $repoRoot `
    -DownloadUrl 'https://127.0.0.1:9/FE-Monster-Setup.exe' `
    -Sha256 ('sha256:' + ('a' * 64)) `
    -ExpectedMessage 'development source checkout'

  Write-Output 'Client update security PASS'
} finally {
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedTestRoot.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolvedTestRoot).StartsWith('fe-monster-update-security-', [StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
