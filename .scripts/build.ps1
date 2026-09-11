#requires -Version 7.0
param([Alias('h')][switch]$Help, [switch]$Release, [switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'build.ps1 [-Release] [-SkipInstall]'; return }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile

$buildArgs = @($buildScript, '--single')
if ($Release) { $env:OPENCODE_RELEASE = '1' }
if ($SkipInstall) { $buildArgs += '--skip-install' }
runNativeCommand bun (@('run') + $buildArgs) 'OpenCode build'
closeOut 3
