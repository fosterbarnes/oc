#requires -Version 7.0
param([switch]$RerollTag)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"

if ($RerollTag) {
    $tag = newVersionTag
    Write-Host "Version tag $tag"
} else {
    incrementMaintenancePatch | Out-Null
}
closeOut 3
