#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'prePush.ps1'; return }
. "$PSScriptRoot\scriptHelper.ps1"
$unbumped = getUnbumpedCodeChanges
if ($unbumped) {
    throw "Code changed but the version is still $(requireVersion). Run .scripts\bumpVersion.ps1 first. Changed: $($unbumped -join ', ')"
}
runNativeCommand bun @('turbo', 'typecheck') 'typecheck'
runNativeCommand bun @('packages/tui/script/keybindDocs.ts', '--check') 'keybind docs check'
& "$PSScriptRoot\countCode.ps1"
& "$PSScriptRoot\readmeVersion.ps1"
setCrlf
Write-Host 'Pre-push checks passed. No commit or push was performed.'
closeOut 3
