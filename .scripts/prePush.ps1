#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'prePush.ps1'; return }
. "$PSScriptRoot\scriptHelper.ps1"
runNativeCommand bun @('turbo', 'typecheck') 'typecheck'
& "$PSScriptRoot\countCode.ps1"
Write-Host 'Pre-push checks passed. No commit or push was performed.'
closeOut 3
