param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [ValidateSet('Ready', 'Installing', 'Failed')]
  [string]$State = 'Ready',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FeMonsterSetupCaptureNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
}
'@

$configuration = if ($State -eq 'Ready') { 'Release' } else { 'Debug' }
$exe = Join-Path $Root "native\windows\setup\bin\$configuration\net8.0-windows\win-x64\FE-Monster-Setup.exe"
if (!(Test-Path -LiteralPath $exe -PathType Leaf)) {
  throw "Build the Release setup project before capture: $exe"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $Root ('.tmp\setup-ui-' + $State.ToLowerInvariant() + '.png')
}
$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$installDir = Join-Path $Root '.tmp\setup-ui-capture-install'
$arguments = @('--install-dir', $installDir, '--no-launch')
if ($State -ne 'Ready') { $arguments += @('--ui-preview', $State) }
$process = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
try {
  $deadline = (Get-Date).AddSeconds(15)
  do {
    Start-Sleep -Milliseconds 100
    $process.Refresh()
    $handle = $process.MainWindowHandle
  } while ($handle -eq [IntPtr]::Zero -and !$process.HasExited -and (Get-Date) -lt $deadline)
  if ($handle -eq [IntPtr]::Zero) { throw 'Setup window did not appear.' }

  [FeMonsterSetupCaptureNative]::SetForegroundWindow($handle) | Out-Null
  Start-Sleep -Milliseconds 350

  if ($State -eq 'Failed') {
    $rootElement = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $failureText = [string]([char]0x5b89) + [char]0x88c5 + [char]0x5305 + [char]0x6821 + [char]0x9a8c + [char]0x5931 + [char]0x8d25
    $retryCondition = [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $failureText,
      [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
    )
    $deadline = (Get-Date).AddSeconds(20)
    do {
      Start-Sleep -Milliseconds 150
      $elements = $rootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
      )
      $failedState = $null
      for ($i = 0; $i -lt $elements.Count; $i += 1) {
        if ($elements.Item($i).Current.Name.StartsWith($failureText, [StringComparison]::Ordinal)) {
          $failedState = $elements.Item($i)
          break
        }
      }
    } while ($null -eq $failedState -and !$process.HasExited -and (Get-Date) -lt $deadline)
    if ($null -eq $failedState) { throw 'Setup did not reach its visible recoverable failure state.' }
    Start-Sleep -Milliseconds 350
  }

  $rootElement = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
  $primaryButtonName = if ($State -eq 'Failed') {
    [string]([char]0x5b89) + [char]0x88c5 + ' FE Monster'
  } else {
    [string]([char]0x5b89) + [char]0x88c5 + ' FE Monster'
  }
  $primaryButtonCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $primaryButtonName
  )
  $primaryButton = $rootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $primaryButtonCondition
  )
  if ($null -eq $primaryButton -or $primaryButton.Current.IsOffscreen) {
    throw 'Primary setup action is clipped or unavailable.'
  }
  $closeName = [string]([char]0x5173) + [char]0x95ed + [char]0x5b89 + [char]0x88c5 + [char]0x7a0b + [char]0x5e8f
  $closeCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $closeName
  )
  $closeButton = $rootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $closeCondition
  )
  if ($null -eq $closeButton -or $closeButton.Current.IsOffscreen) {
    throw 'Close action is clipped or unavailable.'
  }

  $rect = New-Object FeMonsterSetupCaptureNative+RECT
  if (![FeMonsterSetupCaptureNative]::GetWindowRect($handle, [ref]$rect)) {
    throw 'Could not read setup window bounds.'
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 640 -or $height -lt 520) { throw "Unexpected setup window size: ${width}x${height}" }

  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $hdc = $graphics.GetHdc()
      try {
        if (![FeMonsterSetupCaptureNative]::PrintWindow($handle, $hdc, 2)) {
          throw 'PrintWindow could not capture the setup window.'
        }
      } finally {
        $graphics.ReleaseHdc($hdc)
      }
    } finally {
      $graphics.Dispose()
    }
    $bitmap.Save($outputFullPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }

  [pscustomobject]@{
    state = $State.ToLowerInvariant()
    screenshot = $outputFullPath
    width = $width
    height = $height
  } | ConvertTo-Json -Compress
} finally {
  if (!$process.HasExited) {
    $process.CloseMainWindow() | Out-Null
    if (!$process.WaitForExit(3000)) { $process.Kill($true) }
  }
  $process.Dispose()
}
