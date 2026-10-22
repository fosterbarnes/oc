#requires -Version 7.0
param(
    [Alias('h')][switch]$Help,
    # Run the native (opencode) flavor: in-process TUI, no launcher or resident server.
    [Alias('n')][switch]$Native,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$AppLaunchArgs
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.run.ps1 [-Native] [OpenCode arguments...]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile
$env:OC_FLAVOR = if ($Native) { 'native' } else { 'oc' }
$bunArgs = [Collections.Generic.List[string]]::new()
$bunArgs.Add('dev')
$bunArgs.Add('.')
# Bun dev runs under bun.exe, so oc's executable-name launch default does not apply; ask for it.
if (-not $Native -and -not $AppLaunchArgs) { $bunArgs.Add('oc'); $bunArgs.Add('launch') }
foreach ($arg in @($AppLaunchArgs)) { if ($null -ne $arg) { $bunArgs.Add($arg) } }
# -Console: the TUI owns the keyboard, so r / q are read after it exits.
runLoop -Name 'oc' -Console { runNativeCommand -FilePath bun -ArgumentList $bunArgs.ToArray() -Name 'OpenCode development run' }
closeOut 0
