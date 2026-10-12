#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$ocExe = 'C:\Users\user\Apps\opencode\oc.exe'
$shortcut = 'C:\Users\user\Desktop\occ.lnk'
if (-not (Test-Path -LiteralPath $ocExe -PathType Leaf)) { throw "Missing $ocExe." }
if (-not (Test-Path -LiteralPath $shortcut -PathType Leaf)) { throw "Missing $shortcut." }
& $ocExe --shutdown-all
if ($LASTEXITCODE) { exit $LASTEXITCODE }
# Start the resident server alongside WezTerm; occ waits on the same startServer lock instead of spawning its own.
Start-Process -FilePath $ocExe -ArgumentList 'oc', 'server', 'start' -WindowStyle Hidden
Invoke-Item -LiteralPath $shortcut
