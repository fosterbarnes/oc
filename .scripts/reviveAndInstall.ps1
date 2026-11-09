. "$PSScriptRoot\scriptHelper.ps1"
$ocExe = Join-Path $installDir "oc$exeSuffix"
# Build while oc is still running; downtime is only shutdown, copy, and relaunch.
& "$PSScriptRoot\build.ps1"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& $ocExe --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$PSScriptRoot\install.ps1" -NoBuild @args
if ($LASTEXITCODE) { exit $LASTEXITCODE }
startOcWindow
