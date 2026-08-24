$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$agentScript = Join-Path $repoRoot 'scripts\fe-monster-update-agent.ps1'
$source = Get-Content -Raw -LiteralPath $agentScript

function Get-AgentFunction {
  param([string]$Name)
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($agentScript, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { throw "Update agent parse failed: $($errors[0].Message)" }
  $function = $ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
  }, $true)
  if ($null -eq $function) { throw "Update agent function is missing: $Name" }
  $body = $function.Body.Extent.Text
  return [scriptblock]::Create($body.Substring(1, $body.Length - 2))
}

if ($source -notmatch "community-server-tls-pin\.txt") {
  throw 'Update agent does not read the release TLS pin file.'
}
if ($source -notmatch 'ServerCertificateValidationCallback') {
  throw 'Update agent does not install a per-request TLS certificate validator.'
}
if ($source -match 'Invoke-RestMethod\s+-Uri\s+"\$server/api/update/latest') {
  throw 'Update agent still performs the HTTPS update request without the pinned transport.'
}

$normalizePins = Get-AgentFunction 'ConvertTo-NormalizedCommunityTlsPins'
$normalized = @(& $normalizePins "sha256:f7:33:18:3a:b0:5d:68:13:d9:04:4a:a2:c8:27:1f:6e:66:fa:68:41:b6:10:1e:1f:ba:03:31:61:06:36:22:cc")
if ($normalized.Count -ne 1 -or $normalized[0] -cne 'F733183AB05D6813D9044AA2C8271F6E66FA6841B6101E1FBA033161063622CC') {
  throw 'Update agent did not normalize the SHA-256 TLS pin.'
}
$invalidRejected = $false
try {
  $null = & $normalizePins 'sha256:not-a-certificate-pin'
} catch {
  $invalidRejected = $_.Exception.Message -match 'SHA-256'
}
if (!$invalidRejected) { throw 'Update agent accepted an invalid TLS pin.' }

$typeMatch = [regex]::Match(
  $source,
  "(?s)Add-Type\s+-TypeDefinition\s+@'\r?\n(?<code>.*?)\r?\n'@\s*\|\s*Out-Null"
)
if (!$typeMatch.Success) { throw 'Update agent pinned HTTP helper source was not found.' }
Add-Type -TypeDefinition $typeMatch.Groups['code'].Value | Out-Null

$certificateBytes = [Convert]::FromBase64String(@'
MIIDCTCCAfGgAwIBAgIUO1OaZDDq+jQK66N9ruP/A5oeJ1MwDQYJKoZIhvcNAQELBQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgyNDA5MDU1OFoXDTM2MDgyMTA5MDU1OFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA13qRt0tMoMb4gUrW5NZwIphqPTwV5xAp/sybqFSYn+ETYJ8ZezEFUQHYgOUunktvIBMk8TKdzWElQ7C25ZXprkoR5BI1329Bxd7HOu31wEnt8J8AXreF8deP0+VaeqR7d5Z0KizRMMsTJENmwPx9ILigeskuIG753XwZk4GyUBSRieKAJQLc5LQy6A+Z2XZ21LZ3jDGKdjR7KZXX8fAJY94REPoQf3QnaVf1vUM0emn6WINuWeSMW4NNK84sFMkuUnqHXuveOIfVsP0J65eVADz/dumfPuOe0+0gNZ6b4MSovb7Aa1h7Y4ANYWPUYsj0KHH/J/kTwdhwW2O1evBSXwIDAQABo1MwUTAdBgNVHQ4EFgQUERUi183Wheu8/+pow8f6DQa/Nj8wHwYDVR0jBBgwFoAUERUi183Wheu8/+pow8f6DQa/Nj8wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEALm3zAWFPi+kI8yDGar78gXoZTRQC2s4IXKJ40DSgce/agR9zWQ7Qa+RlW0/+XOPrV8V1wIN6LYORKdXIwKWXo9So/sJW8CRpEf0wBMuyZd/obrSk+FvcynH8osUCoEupl5xKC+GYAF3WSG6H27aB9T49uCEDWBWWD8ZCJpNk5HtyYy8ElRgQ7N6q39X0Ci/paNkkwPttwwTXpePvkmQFo1fcDvzB9/7eUfojN6prPu5xBQXA7JjO5vvVj/O23W3vQ8TWyGsHh7H4QmukpBNooqyw7hx2QcE4gKFGtgev35W+rpBadSgYF3YAsLl+UE8spS7n15JKd9QfcAHaNIl2KA==
'@)
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateBytes)
try {
  $chainErrors = [Net.Security.SslPolicyErrors]::RemoteCertificateChainErrors
  $correctPin = @('F733183AB05D6813D9044AA2C8271F6E66FA6841B6101E1FBA033161063622CC')
  if (![FeMonsterUpdateAgent.PinnedCommunityRequest]::ValidateCertificate($certificate, $correctPin, $chainErrors, [DateTime]::UtcNow)) {
    throw 'Matching self-signed certificate pin was rejected.'
  }
  if ([FeMonsterUpdateAgent.PinnedCommunityRequest]::ValidateCertificate($certificate, @('A' * 64), $chainErrors, [DateTime]::UtcNow)) {
    throw 'Mismatched self-signed certificate pin was accepted.'
  }
  $nameMismatch = $chainErrors -bor [Net.Security.SslPolicyErrors]::RemoteCertificateNameMismatch
  if ([FeMonsterUpdateAgent.PinnedCommunityRequest]::ValidateCertificate($certificate, $correctPin, $nameMismatch, [DateTime]::UtcNow)) {
    throw 'Certificate name mismatch was accepted solely because the pin matched.'
  }
} finally {
  $certificate.Dispose()
}

Write-Output 'Update agent TLS pinning PASS'
