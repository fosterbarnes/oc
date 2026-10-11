#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'prePush.ps1'; return }
. "$PSScriptRoot\scriptHelper.ps1"
runNativeCommand bun @('turbo', 'typecheck') 'typecheck'
runNativeCommand bun @('packages/tui/script/keybindDocs.ts', '--check') 'keybind docs check'
& "$PSScriptRoot\countCode.ps1"
setCrlf
Write-Host 'Pre-push checks passed. No commit or push was performed.'
closeOut 3
