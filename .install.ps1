#requires -Version 7.0
param(
    [Alias('b')][switch]$Build,
    [switch]$Oc,
    [switch]$Native,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.install.ps1 [-b] [-Oc | -Native]'; return }
$flavor = @{ Oc = $Oc; Native = $Native }
$installer = Join-Path $PSScriptRoot '.scripts\install.ps1'
if ($Build) {
    & $installer @flavor
    return
}
& $installer -NoBuild @flavor
