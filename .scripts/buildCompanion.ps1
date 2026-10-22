#requires -Version 7.0
[CmdletBinding()]
param([Alias('h')][switch]$Help, [switch]$Publish)

$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Host @'
Usage: buildCompanion.ps1 [-Publish] [-h]

Builds the ocSetup companion window.
  (default)  Incremental Debug build into .installer\ocSetup\bin\dev for .runCompanion.ps1.
             Closes a running dev copy first: it locks the build output.
  -Publish   Self-contained single-file publish into .installer\publish for buildInstaller.ps1.
'@
    return
}
. "$PSScriptRoot\scriptHelper.ps1"

if ($Publish) {
    # The setup ships the whole publish folder, so start it empty: no stale files from older publishes.
    if (Test-Path -LiteralPath $companionPublish) {
        Remove-Item -LiteralPath $companionPublish -Recurse -Force
        if (Test-Path -LiteralPath $companionPublish) { throw "Could not clear $companionPublish" }
    }
    # No inner compression or native self-extract: Inno already compresses, and both would cost every
    # ocSetup start (decompression) or the first one (extraction to %TEMP%\.net). The WPF native DLLs
    # sit next to ocSetup.exe instead.
    runNativeCommand dotnet @(
        'publish', $companionProject, '-c', 'Release', '-r', 'win-x64', '-o', $companionPublish,
        '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:DebugType=none'
    ) 'dotnet publish ocSetup'
} else {
    $running = @(Get-Process ocSetup -ErrorAction SilentlyContinue | Where-Object Path -eq $companionDevExe)
    if ($running) {
        $running | Stop-Process -Force
        $running | Wait-Process
    }
    runNativeCommand dotnet @('build', $companionProject, '-c', 'Debug', '-o', (Split-Path $companionDevExe)) 'dotnet build ocSetup'
}

closeOut 3
