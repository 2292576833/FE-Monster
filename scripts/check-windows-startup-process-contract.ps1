param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = [Collections.Generic.List[string]]::new()

function Read-Source {
  param([string]$RelativePath)
  $path = Join-Path $rootPath $RelativePath
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    $failures.Add("missing startup source: $RelativePath")
    return ''
  }
  return Get-Content -Raw -LiteralPath $path
}

function Require-Match {
  param([string]$Name, [string]$Source, [string]$Pattern)
  if ($Source -notmatch $Pattern) { $failures.Add($Name) }
}

function Require-NoMatch {
  param([string]$Name, [string]$Source, [string]$Pattern)
  if ($Source -match $Pattern) { $failures.Add($Name) }
}

$program = Read-Source 'native\windows\winforms\Program.cs'
$project = Read-Source 'native\windows\winforms\FeMonsterClient.WinForms.csproj'
$legacyClient = Read-Source 'native\windows\fe_monster_client.cpp'
$legacyClientBuilder = Read-Source 'scripts\build-native-client.ps1'
$setup = Read-Source 'native\windows\setup\Program.cs'
$launcher = Read-Source 'scripts\launch-fe-monster.ps1'
$noConsoleProcess = Read-Source 'scripts\windows-no-console-process.ps1'
$javaRuntime = Read-Source 'scripts\java-runtime.ps1'
$javaBuilder = Read-Source 'scripts\build-java.ps1'
$clientBuilder = Read-Source 'scripts\build-winforms-client.ps1'
$installerBuilder = Read-Source 'scripts\build-installer.ps1'
$sourceVbs = Read-Source 'FE Monster.vbs'
$sourceCmd = Read-Source 'run.cmd'
$installer = Read-Source 'scripts\install-fe-monster.ps1'
$musicApiConfig = Read-Source 'src\main\java\com\femonster\music\MusicApiConfigService.java'
$browserLogin = Read-Source 'src\main\java\com\femonster\core\OfficialBrowserLoginService.java'
$neteaseClient = Read-Source 'src\main\java\com\femonster\netease\NeteaseClient.java'
$genericMusicClient = Read-Source 'src\main\java\com\femonster\music\GenericMusicClient.java'
$communityService = Read-Source 'src\community-proprietary\java\com\femonster\core\CommunityService.java'
$apiRoutes = Read-Source 'src\main\java\com\femonster\api\ApiRoutes.java'
$audioStreamProxy = Read-Source 'src\main\java\com\femonster\api\AudioStreamProxy.java'

Require-Match 'desktop host must be a GUI-subsystem WinExe' $project '<OutputType>WinExe</OutputType>'
Require-Match 'legacy native client must use the GUI wWinMain entry point' $legacyClient '\bwWinMain\s*\('
Require-Match 'legacy native client build must select the Windows GUI subsystem' $legacyClientBuilder '/SUBSYSTEM:WINDOWS'
Require-Match 'backend launch must disable shell execution and console creation' $program 'ProcessStartInfo\s+startInfo[\s\S]{0,360}UseShellExecute\s*=\s*false[\s\S]{0,160}CreateNoWindow\s*=\s*true'
Require-Match 'backend stdout and stderr must remain redirected to diagnostics' $program 'ProcessStartInfo\s+startInfo[\s\S]{0,520}RedirectStandardOutput\s*=\s*true[\s\S]{0,160}RedirectStandardError\s*=\s*true'
Require-Match 'Java release metadata must be checked before spawning a version probe' $program 'TryReadJavaReleaseMajorVersion\s*\([\s\S]{0,220}ReadJavaMajorVersion\s*\('
Require-Match 'backend readiness polling must use a short startup interval' $program 'WaitUntilReady[\s\S]{0,1800}Thread\.Sleep\((?:[1-7]?\d)\)'
Require-Match 'setup PowerShell must use CREATE_NO_WINDOW semantics' $setup 'FileName\s*=\s*"powershell\.exe"[\s\S]{0,220}UseShellExecute\s*=\s*false[\s\S]{0,100}CreateNoWindow\s*=\s*true'

Require-Match 'shared process helper must disable shell execution and console creation' $noConsoleProcess 'UseShellExecute\s*=\s*\$false[\s\S]{0,160}CreateNoWindow\s*=\s*\$true'
Require-Match 'shared process helper must preserve stdout diagnostics' $noConsoleProcess 'RedirectStandardOutput\s*=\s*\$true'
Require-Match 'shared process helper must preserve stderr diagnostics' $noConsoleProcess 'RedirectStandardError\s*=\s*\$true'
Require-NoMatch 'Java runtime version detection must not create a cmd.exe console' $javaRuntime '&\s*cmd\.exe'
Require-Match 'Java runtime version detection must use the no-console helper' $javaRuntime 'Get-JavaMajorVersion[\s\S]{0,900}Invoke-NoConsoleProcess'
Require-NoMatch 'automatic Java builds must not invoke console tools directly' $javaBuilder '(?m)^\s*&\s+(?:powershell\.exe|\$javac|\$jarTool)\b'
Require-Match 'automatic Java builds must use the no-console helper' $javaBuilder 'Invoke-NoConsoleProcess'
Require-NoMatch 'automatic WinForms builds must not invoke console tools directly' $clientBuilder '(?m)^\s*(?:&\s+\$dotnetExe|powershell(?:\.exe)?\s+-NoProfile)\b'
Require-Match 'automatic WinForms builds must use the no-console helper' $clientBuilder 'Invoke-NoConsoleProcess'

Require-Match 'source VBS must directly show the existing GUI host' $sourceVbs 'FileExists\(mainExecutable\)[\s\S]{0,300}shell\.Run\s+Quote\(mainExecutable\)\s*&\s*args\s*,\s*1\s*,\s*False'
Require-Match 'source CMD must directly launch the existing GUI host' $sourceCmd 'set\s+MAIN=[^\r\n]+[\s\S]{0,320}start\s+""\s+"%MAIN%"'
Require-Match 'VBS PowerShell fallback must explicitly request a hidden window' $sourceVbs 'powershell\.exe\s+-NoProfile\s+-NonInteractive\s+-WindowStyle\s+Hidden'
Require-NoMatch 'source launcher must not keep PowerShell alive with a fixed 750ms sleep' $launcher 'Start-Sleep\s+-Milliseconds\s+750'
Require-Match 'missing-Java build fallback must use CREATE_NO_WINDOW semantics' $launcher 'Invoke-NoConsoleProcess[\s\S]{0,260}\$javaBuilder'
Require-Match 'missing-host build fallback must use CREATE_NO_WINDOW semantics' $launcher 'Invoke-NoConsoleProcess[\s\S]{0,260}\$clientBuilder'
Require-Match 'GUI host handoff must use CREATE_NO_WINDOW semantics without hiding the app window' $launcher 'Invoke-NoConsoleProcess[\s\S]{0,260}\$mainExecutable[\s\S]{0,260}-WindowStyle\s+Normal'
Require-Match 'automatic build diagnostics must remain logged' $launcher 'launch-build\.log'
Require-NoMatch 'installed payload must not expose the console-only run.cmd entry' $installerBuilder 'function\s+Stage-Payload[\s\S]{0,500}''run\.cmd'''
Require-Match 'installer Java validation must use CREATE_NO_WINDOW semantics' $installer 'Test-JavaServer[\s\S]{0,2600}ProcessStartInfo[\s\S]{0,500}CreateNoWindow\s*=\s*\$true'
Require-Match 'installer shortcuts must target the GUI executable' $installer 'Install-Shortcuts[\s\S]{0,800}-TargetPath\s+\$mainExecutable'
Require-NoMatch 'music API HTTP client must not initialize on the startup path' $musicApiConfig 'private\s+final\s+HttpClient\s+http\s*=\s*HttpClient\.newBuilder'
Require-Match 'music API HTTP client must initialize lazily on first network use' $musicApiConfig 'class\s+HttpClientHolder[\s\S]{0,320}HttpClient\.newBuilder'
Require-NoMatch 'browser-login HTTP client must not initialize on the startup path' $browserLogin 'this\.http\s*=\s*HttpClient\.newBuilder'
Require-Match 'browser-login HTTP client must initialize lazily on first login poll' $browserLogin 'class\s+HttpClientHolder[\s\S]{0,320}HttpClient\.newBuilder'
Require-NoMatch 'Netease HTTP client must not initialize on the startup path' $neteaseClient 'this\.client\s*=\s*HttpClient\.newBuilder'
Require-Match 'Netease HTTP client must initialize lazily on first API request' $neteaseClient 'class\s+HttpClientHolder[\s\S]{0,320}HttpClient\.newBuilder'
Require-NoMatch 'provider HTTP clients must not initialize on the startup path' $genericMusicClient 'this\.client\s*=\s*HttpClient\.newBuilder'
Require-Match 'provider HTTP clients must initialize lazily per provider' $genericMusicClient 'HttpClient\s+httpClient\s*\(\)[\s\S]{0,700}HttpClient\.newBuilder'
Require-NoMatch 'community HTTP client must not initialize on the startup path' $communityService 'this\.http\s*=\s*createHttpClient'
Require-Match 'community HTTP client must initialize lazily on first server request' $communityService 'HttpClient\s+httpClient\s*\(\)[\s\S]{0,700}createHttpClient'
Require-NoMatch 'cover HTTP client must not initialize while routes register' $apiRoutes 'coverClient\s*=\s*HttpClient\.newBuilder'
Require-Match 'cover HTTP client must initialize lazily on first cover request' $apiRoutes 'class\s+CoverHttpClientHolder[\s\S]{0,320}HttpClient\.newBuilder'
Require-NoMatch 'audio proxy HTTP client must not initialize in its default constructor' $audioStreamProxy 'AudioStreamProxy\s*\(\s*\)\s*\{\s*this\s*\(\s*HttpClient\.newBuilder'
Require-Match 'audio proxy HTTP client must initialize lazily on first stream request' $audioStreamProxy 'HttpClient\s+httpClient\s*\(\)[\s\S]{0,700}HttpClient\.newBuilder'

if ($failures.Count -gt 0) {
  Write-Host 'Windows startup process contract: FAILED'
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Windows startup process contract: OK (GUI entries direct; child consoles suppressed; cold probes bounded).'
