if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(544)) {
    launch 'C:\Users\user\Documents\GitHub\oc\.scripts\safeShutdown.exe'; waitFor safeShutdown -e; exit
}
Start-Process pwsh "-NoLogo -w Hidden -File `"$PSCommandPath`"" -Verb RunAs -WindowStyle Hidden -Wait
Invoke-Item C:\Users\user\Desktop\occ.lnk