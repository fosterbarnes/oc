#requires -Version 7.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
$ocExe = Join-Path $installDir "oc$exeSuffix"
if (-not (Test-Path -LiteralPath $ocExe -PathType Leaf)) { throw "Missing $ocExe." }
if ($IsWindows -and -not (Test-Path -LiteralPath $occShortcut -PathType Leaf)) { throw "Missing $occShortcut." }
& $ocExe --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
startOcWindow
