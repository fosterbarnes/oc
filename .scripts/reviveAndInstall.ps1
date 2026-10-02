# Build while oc is still running; downtime is only shutdown, copy, and relaunch.
& "$PSScriptRoot\build.ps1"
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& 'C:\Users\user\Apps\opencode\oc.exe' --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& "$PSScriptRoot\install.ps1" -NoBuild @args
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Start the resident server alongside WezTerm; occ waits on the same startServer lock instead of spawning its own.
Start-Process 'C:\Users\user\Apps\opencode\oc.exe' -ArgumentList 'oc', 'server', 'start' -WindowStyle Hidden
Invoke-Item C:\Users\user\Desktop\occ.lnk
