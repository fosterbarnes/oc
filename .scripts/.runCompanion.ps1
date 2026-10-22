#requires -Version 7.0
[CmdletBinding()]
param(
    [Alias('h')][switch]$Help,
    [switch]$Fake,
    [string[]]$FailId = @(),
    [string]$OcExe,
    [switch]$Watch
)

$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Host @'
Usage: .runCompanion.ps1 [-Fake [-FailId <id>,...]] [-OcExe <path>] [-Watch] [-h]

Builds and opens the ocSetup companion window in dev mode (title ends "(dev)"). Dev mode never
creates or retargets shortcuts and never opens oc.
  (default)  Real dependency engine from source (bun). Install really installs.
  -Fake      Real table and scheduler, fake detection and installs. Nothing is installed.
  -FailId    With -Fake: these row ids fail (download for prefetched rows, install otherwise).
  -OcExe     Use a built oc.exe as the engine (e.g. src\packages\opencode\dist\...\oc.exe).
  -Watch     dotnet watch: C# edits hot-reload, XAML edits restart the window. Runs in the foreground.
While the window is open: r or up arrow rebuilds and reopens it, q closes it.
'@
    return
}
. "$PSScriptRoot\scriptHelper.ps1"

if ($OcExe -and $Fake) { throw '-OcExe and -Fake cannot be combined.' }
if ($FailId -and -not $Fake) { throw '-FailId needs -Fake.' }

if ($OcExe) {
    $engine = @((Resolve-Path -LiteralPath $OcExe).Path, 'oc', 'deps')
} else {
    # Full path: ocSetup checks that the engine exe exists.
    $bun = (Get-Command bun -ErrorAction Stop).Source
    $engine = @($bun, "$srcRoot\packages\tui\script\depsDev.ts")
}
if ($Fake) {
    $engine += '--fake'
    foreach ($id in $FailId) { $engine += '--fail', $id }
}
$fakeState = Join-Path ([IO.Path]::GetTempPath()) 'ocSetup-fake-state.json'
Write-Host "Engine: $($engine -join ' ')"

if ($Watch) {
    $env:DOTNET_WATCH_RESTART_ON_RUDE_EDIT = '1'
    runNativeCommand dotnet (@('watch', '--project', $companionProject, '--', '--dev') + $engine) 'dotnet watch ocSetup'
    return
}

# r = rebuild and reopen (buildCompanion.ps1 closes the running dev copy first).
runLoop -Name 'ocSetup' {
    # Each fake run starts from the scripted statuses, without earlier fake installs.
    if ($Fake -and (Test-Path -LiteralPath $fakeState)) {
        Remove-Item -LiteralPath $fakeState -Force
        if (Test-Path -LiteralPath $fakeState) { throw "Could not remove $fakeState" }
    }
    & "$PSScriptRoot\buildCompanion.ps1" | Out-Host
    # ArgumentList quotes each argument; Start-Process -ArgumentList does not.
    $startInfo = [Diagnostics.ProcessStartInfo]::new($companionDevExe)
    foreach ($arg in @('--dev') + $engine) { $startInfo.ArgumentList.Add($arg) }
    [Diagnostics.Process]::Start($startInfo)
}
closeOut 0
