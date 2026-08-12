param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$builderPath = Join-Path $rootPath 'scripts\build-installer.ps1'
$source = Get-Content -LiteralPath $builderPath -Raw
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput(
  $source,
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
  throw "build-installer.ps1 could not be parsed: $($parseErrors[0].Message)"
}

$requiredFunctions = @(
  'ConvertTo-NormalizedCommunityTlsPins',
  'Initialize-CommunityHealthProbeType',
  'Invoke-PinnedCommunityHealthRequest',
  'Test-IsPublicCommunityAddress',
  'Resolve-CommunityServerAddresses',
  'Assert-PublicCommunityServerUrl',
  'Assert-CommunityServerHealth',
  'Stage-CommunityServerConfiguration',
  'Assert-PayloadZipCommunityConfiguration'
)
foreach ($functionName in $requiredFunctions) {
  $functionAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq $functionName
  }, $true)
  if ($null -eq $functionAst) {
    throw "build-installer.ps1 does not define $functionName"
  }
  . ([scriptblock]::Create($functionAst.Extent.Text))
}

function Copy-File {
  param(
    [string]$Source,
    [string]$Destination
  )
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Assert-Throws {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  try {
    & $Action
  } catch {
    return
  }
  throw "expected '$Name' to fail"
}

$addressCases = @(
  [pscustomobject]@{ Value = '127.0.0.1'; Expected = $false },
  [pscustomobject]@{ Value = '10.1.2.3'; Expected = $false },
  [pscustomobject]@{ Value = '172.16.0.1'; Expected = $false },
  [pscustomobject]@{ Value = '192.168.1.1'; Expected = $false },
  [pscustomobject]@{ Value = '169.254.1.1'; Expected = $false },
  [pscustomobject]@{ Value = '100.64.0.1'; Expected = $false },
  [pscustomobject]@{ Value = '192.0.2.1'; Expected = $false },
  [pscustomobject]@{ Value = '198.18.0.1'; Expected = $false },
  [pscustomobject]@{ Value = '198.51.100.1'; Expected = $false },
  [pscustomobject]@{ Value = '203.0.113.1'; Expected = $false },
  [pscustomobject]@{ Value = '::1'; Expected = $false },
  [pscustomobject]@{ Value = '::ffff:10.1.2.3'; Expected = $false },
  [pscustomobject]@{ Value = 'fc00::1'; Expected = $false },
  [pscustomobject]@{ Value = 'fe80::1'; Expected = $false },
  [pscustomobject]@{ Value = '2001:db8::1'; Expected = $false },
  [pscustomobject]@{ Value = '93.184.216.34'; Expected = $true },
  [pscustomobject]@{ Value = '::ffff:93.184.216.34'; Expected = $true },
  [pscustomobject]@{ Value = '2606:4700:4700::1111'; Expected = $true }
)
foreach ($addressCase in $addressCases) {
  $actual = Test-IsPublicCommunityAddress ([Net.IPAddress]::Parse($addressCase.Value))
  if ($actual -ne $addressCase.Expected) {
    throw "public address policy for '$($addressCase.Value)' was $actual, expected $($addressCase.Expected)"
  }
}

# Exercise the production per-request TLS callback against an ephemeral self-signed
# HTTPS endpoint. A correct leaf pin must work; an incorrect pin must still fail.
if ($null -eq ('FeMonsterInstallerTests.OneShotHttpsServer' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading.Tasks;

namespace FeMonsterInstallerTests {
    public sealed class OneShotHttpsServer : IDisposable {
        private readonly TcpListener listener;
        private readonly X509Certificate2 certificate;
        private readonly string responseBody;
        private readonly Task worker;

        public int Port { get; private set; }
        public Exception Error { get; private set; }

        public OneShotHttpsServer(X509Certificate2 certificate, string responseBody) {
            this.certificate = certificate;
            this.responseBody = responseBody;
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            Port = ((IPEndPoint)listener.LocalEndpoint).Port;
            worker = Task.Run((Action)Serve);
        }

        private void Serve() {
            try {
                using (TcpClient client = listener.AcceptTcpClient())
                using (SslStream tls = new SslStream(client.GetStream(), false)) {
                    tls.AuthenticateAsServer(certificate, false, SslProtocols.Tls12, false);
                    using (StreamReader reader = new StreamReader(tls, Encoding.ASCII, false, 1024, true)) {
                        string line;
                        while ((line = reader.ReadLine()) != null && line.Length != 0) { }
                    }
                    byte[] body = Encoding.UTF8.GetBytes(responseBody);
                    byte[] header = Encoding.ASCII.GetBytes(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " +
                        body.Length + "\r\nConnection: close\r\n\r\n"
                    );
                    tls.Write(header, 0, header.Length);
                    tls.Write(body, 0, body.Length);
                    tls.Flush();
                }
            } catch (Exception error) {
                Error = error;
            } finally {
                listener.Stop();
            }
        }

        public void Dispose() {
            listener.Stop();
            try { worker.Wait(TimeSpan.FromSeconds(5)); } catch (AggregateException) { }
        }
    }
}
'@
}

Initialize-CommunityHealthProbeType
$fixtureRsa = [Security.Cryptography.RSA]::Create(2048)
$fixtureRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
  'CN=localhost',
  $fixtureRsa,
  [Security.Cryptography.HashAlgorithmName]::SHA256,
  [Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$fixtureSan = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$fixtureSan.AddDnsName('localhost')
$fixtureSan.AddIpAddress([Net.IPAddress]::Loopback)
$fixtureRequest.CertificateExtensions.Add($fixtureSan.Build())
$createdFixtureCertificate = $fixtureRequest.CreateSelfSigned(
  [DateTimeOffset]::UtcNow.AddMinutes(-5),
  [DateTimeOffset]::UtcNow.AddHours(1)
)
$fixtureCertificate = $createdFixtureCertificate
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $fixturePin = -join @($sha256.ComputeHash($fixtureCertificate.RawData) | ForEach-Object { $_.ToString('X2') })
} finally {
  $sha256.Dispose()
}

$fixtureNow = [DateTime]::UtcNow
$validFixtureAccepted = [FeMonsterInstaller.CommunityHealthProbe]::ValidateCertificate(
  $fixtureCertificate,
  @('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', $fixturePin),
  [Net.Security.SslPolicyErrors]::None,
  $fixtureNow
)
if (!$validFixtureAccepted) {
  throw 'correct leaf certificate pin was rejected'
}
$wrongPinAccepted = [FeMonsterInstaller.CommunityHealthProbe]::ValidateCertificate(
  $fixtureCertificate,
  @('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'),
  [Net.Security.SslPolicyErrors]::None,
  $fixtureNow
)
if ($wrongPinAccepted) {
  throw 'incorrect leaf certificate pin was accepted'
}
$nameMismatchAccepted = [FeMonsterInstaller.CommunityHealthProbe]::ValidateCertificate(
  $fixtureCertificate,
  @($fixturePin),
  [Net.Security.SslPolicyErrors]::RemoteCertificateNameMismatch,
  $fixtureNow
)
if ($nameMismatchAccepted) {
  throw 'certificate name mismatch was accepted'
}

$createdExpiredCertificate = $fixtureRequest.CreateSelfSigned(
  [DateTimeOffset]::UtcNow.AddHours(-2),
  [DateTimeOffset]::UtcNow.AddHours(-1)
)
$expiredFixtureCertificate = $createdExpiredCertificate
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $expiredFixturePin = -join @($sha256.ComputeHash($expiredFixtureCertificate.RawData) | ForEach-Object { $_.ToString('X2') })
} finally {
  $sha256.Dispose()
}
try {
  $expiredFixtureAccepted = [FeMonsterInstaller.CommunityHealthProbe]::ValidateCertificate(
    $expiredFixtureCertificate,
    @($expiredFixturePin),
    [Net.Security.SslPolicyErrors]::None,
    $fixtureNow
  )
  if ($expiredFixtureAccepted) {
    throw 'expired pinned leaf certificate was accepted'
  }
} finally {
  $expiredFixtureCertificate.Dispose()
  $fixtureCertificate.Dispose()
  $fixtureRsa.Dispose()
}

# Keep the policy regression deterministic and independent from public DNS/network state.
function Resolve-CommunityServerAddresses {
  param([Uri]$Uri)

  $hostName = $Uri.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
  [Net.IPAddress]$literalAddress = $null
  if ([Net.IPAddress]::TryParse($hostName, [ref]$literalAddress)) {
    return ,$literalAddress
  }
  if ($hostName -eq 'private.example.test') {
    return ,([Net.IPAddress]::Parse('10.0.0.2'))
  }
  return ,([Net.IPAddress]::Parse('93.184.216.34'))
}

$script:healthProbeCount = 0
function Invoke-RestMethod {
  param(
    [string]$Method,
    [object]$Uri,
    [int]$TimeoutSec,
    [int]$MaximumRedirection
  )

  $script:healthProbeCount += 1
  [Uri]$healthUri = $Uri
  switch ($healthUri.DnsSafeHost.ToLowerInvariant()) {
    'wrong-service.example.test' { return [pscustomobject]@{ service = 'another-service' } }
    'offline.example.test' { throw 'simulated connection failure' }
    'self-signed.example.test' { throw 'simulated untrusted self-signed certificate' }
    default { return [pscustomobject]@{ service = 'fe-monster-community' } }
  }
}

$script:pinnedProbeCount = 0
function Invoke-PinnedCommunityHealthRequest {
  param(
    [string]$HealthUrl,
    [string[]]$TlsPins
  )

  $script:pinnedProbeCount += 1
  foreach ($pin in @($TlsPins)) {
    if ($pin -cnotmatch '^[A-F0-9]{64}$') {
      throw 'health probe received a non-normalized TLS pin'
    }
  }
  [Uri]$healthUri = $HealthUrl
  if ($healthUri.DnsSafeHost -eq 'pinned-wrong-service.example.test') {
    return '{"service":"another-service"}'
  }
  return '{"service":"fe-monster-community"}'
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("fe-installer-community-url-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null

function Invoke-PolicyCase {
  param(
    [string]$Name,
    [string]$DeveloperValue,
    [string]$DeveloperTlsPins = '',
    [string]$ExplicitUrl = '',
    [string]$TlsPins = '',
    [bool]$ExpectedToStage = $false,
    [string]$ExpectedStagedValue = '',
    [string]$ExpectedPinFile = '',
    [switch]$ExpectFailure
  )

  $script:rootPath = Join-Path $fixtureRoot $Name
  $script:payloadRoot = Join-Path $script:rootPath 'payload'
  $script:CommunityServerUrl = $ExplicitUrl
  $script:CommunityServerTlsPins = $TlsPins
  $dataPath = Join-Path $script:rootPath 'data'
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  New-Item -ItemType Directory -Path $script:payloadRoot -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $dataPath 'community-server-url.txt'),
    $DeveloperValue,
    [System.Text.UTF8Encoding]::new($false)
  )
  if (![string]::IsNullOrWhiteSpace($DeveloperTlsPins)) {
    [System.IO.File]::WriteAllText(
      (Join-Path $dataPath 'community-server-tls-pin.txt'),
      $DeveloperTlsPins,
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  # These representative secret files must never be copied by URL staging.
  foreach ($secretName in @('public-access.key', 'frp-boy.com.key', 'pet-secrets.json')) {
    [System.IO.File]::WriteAllText(
      (Join-Path $dataPath $secretName),
      'fixture-secret-that-must-not-be-staged',
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  if ($ExpectFailure) {
    Assert-Throws $Name { Stage-CommunityServerConfiguration }
    if (Test-Path -LiteralPath (Join-Path $script:payloadRoot 'data\community-server-tls-pin.txt') -PathType Leaf) {
      throw "community URL policy case '$Name' staged a TLS pin after validation failed"
    }
    return
  }

  Stage-CommunityServerConfiguration
  $stagedPath = Join-Path $script:payloadRoot 'data\community-server-url.txt'
  $staged = Test-Path -LiteralPath $stagedPath -PathType Leaf
  if ($staged -ne $ExpectedToStage) {
    throw "community URL policy case '$Name' staged=$staged, expected=$ExpectedToStage"
  }
  if ($staged) {
    $actual = Get-Content -LiteralPath $stagedPath -Raw
    if ($actual -cne $ExpectedStagedValue) {
      throw "community URL policy case '$Name' staged '$actual', expected '$ExpectedStagedValue'"
    }
  }

  $stagedPinPath = Join-Path $script:payloadRoot 'data\community-server-tls-pin.txt'
  $stagedPin = Test-Path -LiteralPath $stagedPinPath -PathType Leaf
  $expectedPin = ![string]::IsNullOrWhiteSpace($ExpectedPinFile)
  if ($stagedPin -ne $expectedPin) {
    throw "community URL policy case '$Name' pin staged=$stagedPin, expected=$expectedPin"
  }
  if ($stagedPin) {
    $actualPinFile = Get-Content -LiteralPath $stagedPinPath -Raw
    if ($actualPinFile -cne $ExpectedPinFile) {
      throw "community URL policy case '$Name' staged an incorrectly normalized TLS pin file"
    }
  }

  foreach ($secretName in @('public-access.key', 'frp-boy.com.key', 'pet-secrets.json')) {
    if (Test-Path -LiteralPath (Join-Path $script:payloadRoot "data\$secretName") -PathType Leaf) {
      throw "community URL policy case '$Name' staged secret file '$secretName'"
    }
  }
}

function New-CommunityPayloadZipFixture {
  param(
    [string]$Name,
    [string]$Url = '',
    [string]$TlsPins = '',
    [switch]$OmitUrl
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zipPath = Join-Path $fixtureRoot "$Name.zip"
  $stream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
      if (!$OmitUrl) {
        $entry = $archive.CreateEntry('FE Monster/data/community-server-url.txt')
        $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
        try { $writer.Write($Url) } finally { $writer.Dispose() }
      }
      if (![string]::IsNullOrEmpty($TlsPins)) {
        $entry = $archive.CreateEntry('FE Monster/data/community-server-tls-pin.txt')
        $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
        try { $writer.Write($TlsPins) } finally { $writer.Dispose() }
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
  return $zipPath
}

try {
  $pinA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  $pinB = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
  $normalizedPinA = $pinA.ToUpperInvariant()
  $normalizedPinB = $pinB.ToUpperInvariant()

  Invoke-PolicyCase -Name 'ipv4-loopback' -DeveloperValue 'http://127.0.0.1:3020'
  Invoke-PolicyCase -Name 'ipv4-loopback-range' -DeveloperValue 'http://127.12.34.56:3020'
  Invoke-PolicyCase -Name 'localhost' -DeveloperValue 'http://LOCALHOST.:3020'
  Invoke-PolicyCase -Name 'ipv6-loopback' -DeveloperValue 'http://[::1]:3020'
  Invoke-PolicyCase -Name 'ipv4-mapped-loopback' -DeveloperValue 'http://[::ffff:127.0.0.1]:3020'
  Invoke-PolicyCase -Name 'remote-http' -DeveloperValue 'http://93.184.216.34:3020' -ExpectFailure
  Invoke-PolicyCase -Name 'remote-https' -DeveloperValue 'https://community.example.test:443/api' -ExpectedToStage $true -ExpectedStagedValue 'https://community.example.test/api'
  Invoke-PolicyCase `
    -Name 'developer-https-pin' `
    -DeveloperValue 'https://pinned-developer.example.test/base/' `
    -DeveloperTlsPins "sha256:$pinA" `
    -ExpectedToStage $true `
    -ExpectedStagedValue 'https://pinned-developer.example.test/base' `
    -ExpectedPinFile "sha256:$normalizedPinA"
  Invoke-PolicyCase `
    -Name 'developer-invalid-pin' `
    -DeveloperValue 'https://pinned-developer.example.test/base' `
    -DeveloperTlsPins 'sha256:not-a-fingerprint' `
    -ExpectFailure
  Invoke-PolicyCase `
    -Name 'developer-self-signed-without-pin' `
    -DeveloperValue 'https://self-signed.example.test/community' `
    -ExpectFailure
  Invoke-PolicyCase `
    -Name 'developer-private-https' `
    -DeveloperValue 'https://10.0.0.2/community' `
    -DeveloperTlsPins "sha256:$pinA" `
    -ExpectFailure

  Invoke-PolicyCase `
    -Name 'explicit-overrides-developer-file' `
    -DeveloperValue 'http://127.0.0.1:3020' `
    -ExplicitUrl 'https://community.example.test/base/' `
    -ExpectedToStage $true `
    -ExpectedStagedValue 'https://community.example.test/base'
  Invoke-PolicyCase `
    -Name 'explicit-single-pin' `
    -DeveloperValue 'https://ignored.example.test' `
    -ExplicitUrl 'https://pinned.example.test' `
    -TlsPins "sha256:$pinA" `
    -ExpectedToStage $true `
    -ExpectedStagedValue 'https://pinned.example.test' `
    -ExpectedPinFile "sha256:$normalizedPinA"
  Invoke-PolicyCase `
    -Name 'explicit-pin-rotation' `
    -DeveloperValue 'https://ignored.example.test' `
    -ExplicitUrl 'https://pinned-rotation.example.test' `
    -TlsPins "$pinA;$pinB" `
    -ExpectedToStage $true `
    -ExpectedStagedValue 'https://pinned-rotation.example.test' `
    -ExpectedPinFile ("sha256:$normalizedPinA" + [Environment]::NewLine + "sha256:$normalizedPinB")
  Invoke-PolicyCase -Name 'explicit-http' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'http://community.example.test' -ExpectFailure
  Invoke-PolicyCase -Name 'pin-without-explicit-url' -DeveloperValue 'https://developer.example.test' -TlsPins $pinA -ExpectFailure
  Invoke-PolicyCase -Name 'pin-with-http-url' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'http://community.example.test' -TlsPins $pinA -ExpectFailure
  Invoke-PolicyCase -Name 'invalid-pin' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://community.example.test' -TlsPins 'sha256:not-a-fingerprint' -ExpectFailure
  Invoke-PolicyCase -Name 'too-many-pins' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://community.example.test' -TlsPins "$pinA;$pinB;$pinA" -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-private-literal' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://10.0.0.2' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-private-dns' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://private.example.test' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-userinfo' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://user:password@community.example.test' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-query' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://community.example.test?token=secret' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-fragment' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://community.example.test/#fragment' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-wrong-service' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://wrong-service.example.test' -ExpectFailure
  Invoke-PolicyCase -Name 'explicit-offline' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://offline.example.test' -ExpectFailure
  Invoke-PolicyCase -Name 'pinned-wrong-service' -DeveloperValue 'https://ignored.example.test' -ExplicitUrl 'https://pinned-wrong-service.example.test' -TlsPins $pinA -ExpectFailure

  $validPinnedZip = New-CommunityPayloadZipFixture `
    -Name 'valid-pinned-payload' `
    -Url 'https://self-signed.example.test/community' `
    -TlsPins "sha256:$normalizedPinA"
  $null = Assert-PayloadZipCommunityConfiguration $validPinnedZip

  foreach ($invalidPayload in @(
    [pscustomobject]@{ Name = 'missing-url-payload'; Url = ''; OmitUrl = $true; Pins = '' },
    [pscustomobject]@{ Name = 'loopback-payload'; Url = 'https://127.0.0.1:3020'; OmitUrl = $false; Pins = "sha256:$normalizedPinA" },
    [pscustomobject]@{ Name = 'private-payload'; Url = 'https://10.0.0.2/community'; OmitUrl = $false; Pins = "sha256:$normalizedPinA" },
    [pscustomobject]@{ Name = 'http-payload'; Url = 'http://93.184.216.34:3020/community'; OmitUrl = $false; Pins = '' },
    [pscustomobject]@{ Name = 'self-signed-without-pin'; Url = 'https://self-signed.example.test/community'; OmitUrl = $false; Pins = '' },
    [pscustomobject]@{ Name = 'malformed-payload-pin'; Url = 'https://self-signed.example.test/community'; OmitUrl = $false; Pins = 'sha256:not-a-fingerprint' }
  )) {
    $invalidZip = New-CommunityPayloadZipFixture `
      -Name $invalidPayload.Name `
      -Url $invalidPayload.Url `
      -TlsPins $invalidPayload.Pins `
      -OmitUrl:$invalidPayload.OmitUrl
    Assert-Throws $invalidPayload.Name {
      Assert-PayloadZipCommunityConfiguration $invalidZip
    }
  }

  if ($script:healthProbeCount -ne 22) {
    throw "release community health probe ran $script:healthProbeCount times, expected 22 including retries"
  }
  if ($script:pinnedProbeCount -ne 9) {
    throw "pinned release community health probe ran $script:pinnedProbeCount times, expected 9 including retries"
  }
} finally {
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Installer community URL policy: OK'
