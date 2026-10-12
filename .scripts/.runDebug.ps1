#requires -Version 7.0
param(
    [Alias('h')][switch]$Help,
    # Run the native (opencode) flavor: in-process TUI, no launcher or resident server.
    [Alias('n')][switch]$Native,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$AppLaunchArgs
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.runDebug.ps1 [-Native] [OpenCode arguments...]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile
$env:OPENCODE_INSTANCE = 'debug'
if (-not $env:OPENCODE_LOG_LEVEL) { $env:OPENCODE_LOG_LEVEL = 'DEBUG' }
$env:OC_FLAVOR = if ($Native) { 'native' } else { 'oc' }
$bunArgs = [Collections.Generic.List[string]]::new()
$bunArgs.Add('dev')
$bunArgs.Add('.')
# Bun dev runs under bun.exe, so oc's executable-name launch default does not apply; ask for it.
if (-not $Native -and -not $AppLaunchArgs) { $bunArgs.Add('oc'); $bunArgs.Add('launch') }
foreach ($arg in @($AppLaunchArgs)) { if ($null -ne $arg) { $bunArgs.Add($arg) } }
runNativeCommand -FilePath bun -ArgumentList $bunArgs.ToArray() -Name 'OpenCode debug development run'
closeOut 0
