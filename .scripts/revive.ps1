#requires -Version 7.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
$ocExe = "$installDir\oc.exe"
if (-not (Test-Path -LiteralPath $ocExe -PathType Leaf)) { throw "Missing $ocExe." }
if (-not (Test-Path -LiteralPath $occShortcut -PathType Leaf)) { throw "Missing $occShortcut." }
& $ocExe --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Start the resident server alongside WezTerm; occ waits on the same startServer lock instead of spawning its own.
Start-Process -FilePath $ocExe -ArgumentList 'oc', 'server', 'start' -WindowStyle Hidden
Invoke-Item -LiteralPath $occShortcut
