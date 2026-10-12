#requires -Version 7.0
param(
    [Alias('b')][switch]$Build,
    [Alias('d')][switch]$DebugInstance,
    [switch]$Oc,
    [switch]$Native,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.install.ps1 [-b] [-d] [-Oc | -Native]'; return }
if ($DebugInstance) {
    $installer = Join-Path $PSScriptRoot '.scripts\installDebug.ps1'
    if ($Build) { & $installer } else { & $installer -NoBuild }
    return
}
$flavor = @{ Oc = $Oc; Native = $Native }
$installer = Join-Path $PSScriptRoot '.scripts\install.ps1'
if ($Build) {
    & $installer @flavor
    return
}
& $installer -NoBuild @flavor
