& 'C:\Users\user\Apps\opencode\oc.exe' --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Start the resident server alongside WezTerm; occ waits on the same startServer lock instead of spawning its own.
Start-Process 'C:\Users\user\Apps\opencode\oc.exe' -ArgumentList 'oc', 'server', 'start' -WindowStyle Hidden
Invoke-Item C:\Users\user\Desktop\occ.lnk
