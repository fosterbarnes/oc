#requires -Version 7.0
param(
    [Alias('b')][switch]$Build,
    [Alias('d')][switch]$DebugInstance,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.install.ps1 [-b] [-d]'; return }
$installer = if ($DebugInstance) { Join-Path $PSScriptRoot '.scripts\installDebug.ps1' } else { Join-Path $PSScriptRoot '.scripts\install.ps1' }
if ($Build) {
    & $installer
    return
}
& $installer -NoBuild
