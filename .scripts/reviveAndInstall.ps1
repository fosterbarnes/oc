. "$PSScriptRoot\scriptHelper.ps1"
$ocExe = "$installDir\oc.exe"
# Build while oc is still running; downtime is only shutdown, copy, and relaunch.
& "$PSScriptRoot\build.ps1"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& $ocExe --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$PSScriptRoot\install.ps1" -NoBuild @args
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Start the resident server alongside WezTerm; occ waits on the same startServer lock instead of spawning its own.
Start-Process $ocExe -ArgumentList 'oc', 'server', 'start' -WindowStyle Hidden
Invoke-Item -LiteralPath $occShortcut
