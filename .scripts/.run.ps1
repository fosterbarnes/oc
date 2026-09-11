#requires -Version 7.0
param([Alias('h')][switch]$Help, [Parameter(ValueFromRemainingArguments = $true)][string[]]$AppLaunchArgs)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.run.ps1 [OpenCode arguments...]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile
$bunArgs = [Collections.Generic.List[string]]::new()
$bunArgs.Add('dev')
$bunArgs.Add('.')
foreach ($arg in @($AppLaunchArgs)) { if ($null -ne $arg) { $bunArgs.Add($arg) } }
runNativeCommand -FilePath bun -ArgumentList $bunArgs.ToArray() -Name 'OpenCode development run'
closeOut 0
