param(
  [string]$Root = (Join-Path $PSScriptRoot '..')
)

$ErrorActionPreference = 'Stop'
$source = Join-Path (Resolve-Path -LiteralPath $Root).Path 'scripts\stop-stale-fe-monster.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Process cleanup source did not parse.' }
# Import only predicates; no process enumeration or termination is permitted here.
foreach ($function in @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false))) {
  if ($function.Name -eq 'Get-FeMonsterProcesses') { continue }
  . ([scriptblock]::Create($function.Extent.Text))
}
$rootPath = 'E:\release fixture\FE Monster'
$rootNeedle = $rootPath.ToLowerInvariant()
$SkipJava = $false
$SkipClient = $false
$SkipNode = $false
$cases = @(
  @{ Label = 'target client'; Name = 'FE Monster.exe'; Executable = "$rootPath\native\windows\build\winforms\FE Monster.exe"; Command = '"' + $rootPath + '\native\windows\build\winforms\FE Monster.exe"'; Expected = $true },
  @{ Label = 'target Java'; Name = 'javaw.exe'; Executable = 'C:\Java\bin\javaw.exe'; Command = 'javaw.exe -jar "' + $rootPath + '\out\fe-monster-java.jar" --server'; Expected = $true },
  @{ Label = 'target immutable Java'; Name = 'javaw.exe'; Executable = 'C:\Java\bin\javaw.exe'; Command = 'javaw.exe -jar "' + $rootPath + '\out\fe-monster-java-12345-67890.jar" --server'; Expected = $true },
  @{ Label = 'lookalike jar elsewhere in target'; Name = 'javaw.exe'; Executable = 'C:\Java\bin\javaw.exe'; Command = 'javaw.exe -jar "' + $rootPath + '\plugins\fe-monster-java.jar"'; Expected = $false },
  @{ Label = 'target WebView'; Name = 'msedgewebview2.exe'; Executable = 'C:\Edge\msedgewebview2.exe'; Command = 'msedgewebview2.exe --user-data-dir="' + $rootPath + '\WebView2\DesktopHostV2"'; Expected = $true },
  @{ Label = 'target update agent'; Name = 'powershell.exe'; Executable = 'C:\Windows\powershell.exe'; Command = 'powershell.exe -File "' + $rootPath + '\scripts\fe-monster-update-agent.ps1"'; Expected = $true },
  @{ Label = 'another installed client'; Name = 'FE Monster.exe'; Executable = 'C:\Users\Example\AppData\Local\FE Monster\native\windows\build\winforms\FE Monster.exe'; Command = '"C:\Users\Example\AppData\Local\FE Monster\native\windows\build\winforms\FE Monster.exe"'; Expected = $false },
  @{ Label = 'another installed Java'; Name = 'javaw.exe'; Executable = 'C:\Java\bin\javaw.exe'; Command = 'javaw.exe -jar "C:\Users\Example\AppData\Local\FE Monster\out\fe-monster-java.jar"'; Expected = $false },
  @{ Label = 'similar target prefix'; Name = 'FE Monster.exe'; Executable = "$rootPath-old\FE Monster.exe"; Command = '"' + $rootPath + '-old\FE Monster.exe"'; Expected = $false },
  @{ Label = 'similar Java root prefix'; Name = 'javaw.exe'; Executable = 'C:\Java\bin\javaw.exe'; Command = 'javaw.exe -jar "' + $rootPath + '-old\out\fe-monster-java.jar"'; Expected = $false },
  @{ Label = 'normalized path outside target'; Name = 'FE Monster.exe'; Executable = "$rootPath\..\Other\FE Monster.exe"; Command = '"' + $rootPath + '\..\Other\FE Monster.exe"'; Expected = $false },
  @{ Label = 'target mentioned as script text'; Name = 'powershell.exe'; Executable = 'C:\Windows\powershell.exe'; Command = 'powershell.exe -Command "Write-Host ''' + $rootPath + '\scripts\fe-monster-update-agent.ps1''"'; Expected = $false },
  @{ Label = 'foreign update script with target argument'; Name = 'powershell.exe'; Executable = 'C:\Windows\powershell.exe'; Command = 'powershell.exe -File "C:\Other\FE Monster\scripts\fe-monster-update-agent.ps1" -Log "' + $rootPath + '\log.txt"'; Expected = $false },
  @{ Label = 'foreign WebView'; Name = 'msedgewebview2.exe'; Executable = 'C:\Edge\msedgewebview2.exe'; Command = 'msedgewebview2.exe --user-data-dir="C:\Other\FE Monster\WebView2\DesktopHostV2"'; Expected = $false },
  @{ Label = 'target Node'; Name = 'node.exe'; Executable = "$rootPath\runtime\node\node.exe"; Command = 'node.exe "' + $rootPath + '\scripts\netease-api-server.cjs"'; Expected = $true },
  @{ Label = 'target Node with stable external data'; Name = 'node.exe'; Executable = "$rootPath\runtime\node\node.exe"; Command = 'node.exe "C:\Users\Example\AppData\Local\FE Monster\data\music-api\packages\server.cjs"'; Expected = $true },
  @{ Label = 'foreign Node with target log argument'; Name = 'node.exe'; Executable = 'C:\Other\FE Monster\runtime\node\node.exe'; Command = 'node.exe "C:\Other\FE Monster\scripts\netease-api-server.cjs" --log "' + $rootPath + '\log.txt"'; Expected = $false },
  @{ Label = 'target Python'; Name = 'pythonw.exe'; Executable = "$rootPath\runtime\python\pythonw.exe"; Command = 'pythonw.exe companion.py'; Expected = $true }
)
$failures = [Collections.Generic.List[string]]::new()
foreach ($case in $cases) {
  $process = [pscustomobject]@{ Name = $case.Name; ExecutablePath = $case.Executable; CommandLine = $case.Command }
  $actual = Test-FeMonsterProcess $process
  if ($actual -ne $case.Expected) { $failures.Add("$($case.Label): expected $($case.Expected), got $actual") }
}
$rootPath = (Get-Location).Path
$driveRelative = [IO.Path]::GetPathRoot($rootPath).TrimEnd('\') + 'out\fe-monster-java.jar'
if (Test-FeMonsterPath $driveRelative) { $failures.Add('Drive-relative paths must not use the cleanup process working directory.') }
if (Test-FeMonsterPath '\out\fe-monster-java.jar') { $failures.Add('Root-relative paths must not use the cleanup process current drive.') }
if ($failures.Count -gt 0) { throw ($failures -join "`n") }
Write-Host "Process cleanup target isolation: OK ($($cases.Count) simulated processes; no processes stopped)."
