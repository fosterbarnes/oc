#requires -Version 7.0
param([Alias('h')][switch]$Help, [Parameter(ValueFromRemainingArguments = $true)][string[]]$AppLaunchArgs)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.runDebug.ps1 [OpenCode arguments...]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile
$env:OPENCODE_INSTANCE = 'debug'
if (-not $env:OPENCODE_LOG_LEVEL) { $env:OPENCODE_LOG_LEVEL = 'DEBUG' }
$bunArgs = [Collections.Generic.List[string]]::new()
$bunArgs.Add('dev')
$bunArgs.Add('.')
foreach ($arg in @($AppLaunchArgs)) { if ($null -ne $arg) { $bunArgs.Add($arg) } }
runNativeCommand -FilePath bun -ArgumentList $bunArgs.ToArray() -Name 'OpenCode debug development run'
closeOut 0
