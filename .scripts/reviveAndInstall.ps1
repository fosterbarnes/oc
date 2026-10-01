if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(544)) {
    launch 'C:\Users\user\Documents\GitHub\oc\.scripts\safeShutdown.exe'; waitFor safeShutdown -e; exit
}
Start-Process pwsh "-NoLogo -w Hidden -File `"$PSCommandPath`"" -Verb RunAs -WindowStyle Hidden -Wait
# pwshXer runs a temp copy of this script, so $PSScriptRoot is not .scripts
& 'C:\Users\user\Documents\GitHub\oc\.scripts\install.ps1' @args
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Invoke-Item C:\Users\user\Desktop\occ.lnk