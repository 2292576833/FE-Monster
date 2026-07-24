$ErrorActionPreference = "Stop"

$executable = Join-Path $PSScriptRoot "qishui-api-plugin.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Qishui API plugin executable is missing."
}

& $executable @args
exit $LASTEXITCODE
