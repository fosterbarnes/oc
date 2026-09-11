#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'prePush.ps1'; return }
. "$PSScriptRoot\scriptHelper.ps1"
runNativeCommand bun @('run', 'lint') 'lint'
runNativeCommand bun @('turbo', 'typecheck') 'typecheck'
Write-Host 'Pre-push checks passed. No commit or push was performed.'
closeOut 3
