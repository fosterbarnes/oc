#requires -Version 7.0
param([Alias('h')][switch]$Help, [switch]$Release, [switch]$SkipInstall, [switch]$Oc, [switch]$Native)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'build.ps1 [-Release] [-SkipInstall] [-Oc | -Native]'; return }
if ($Oc -and $Native) { throw 'Use -Oc or -Native, not both.' }
# -Oc/-Native keep the other variant's old files in dist, which a release would then ship.
if ($Release -and ($Oc -or $Native)) { throw '-Release builds both binaries; drop -Oc/-Native.' }
. "$PSScriptRoot\scriptHelper.ps1"
requireBunForCompile

# Default: oc.exe + native opencode.exe. -Oc: oc only. -Native: opencode.exe only.
$buildArgs = @($buildScript, '--single')
if ($Release) { $env:OPENCODE_RELEASE = '1' }
if ($Oc) { $buildArgs += '--oc-only' }
if ($Native) { $buildArgs += '--native-only' }
if ($SkipInstall) { $buildArgs += '--skip-install' }
runNativeCommand bun (@('run') + $buildArgs) 'OpenCode build'
closeOut 3
