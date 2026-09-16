#requires -Version 7.0
param([Alias('h')][switch]$Help, [switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'buildDebug.ps1 [-SkipInstall]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile

$buildArgs = @($buildScript, '--single', '--debug-only')
if ($SkipInstall) { $buildArgs += '--skip-install' }
runNativeCommand bun (@('run') + $buildArgs) 'OpenCode debug build'
closeOut 3
