[CmdletBinding()]
param(
    [Alias('b', 'nb')]
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
assertExternalInstall -BuildCommand '.\.scripts\buildDebug.ps1' -InstallCommand '.\.scripts\installDebug.ps1 -NoBuild'
# Debug-only install: copies only ocdebug.exe, never touches opencode.exe, oc.exe, or occ.exe hard links.
$binary = "$distFolder\opencode-debug-windows-x64\bin\ocdebug.exe"

if (-not $NoBuild) {
    & (Join-Path $PSScriptRoot 'buildDebug.ps1')
}

if (!(Test-Path -LiteralPath $binary)) {
    throw "Built debug binary not found: $binary. Run buildDebug.ps1 first."
}

$installDir = 'C:\Users\user\Apps\opencode'
$debugDestination = Join-Path $installDir 'ocdebug.exe'

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
$running = @(Get-Process -Name 'ocdebug' -ErrorAction SilentlyContinue)
if ($running) {
    Write-Host 'Stopping running ocdebug.exe...'
    $running | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds(30)
    while (Get-Process -Name 'ocdebug' -ErrorAction SilentlyContinue) {
        if ((Get-Date) -gt $deadline) { throw 'ocdebug.exe is still running after Stop-Process.' }
        Start-Sleep -Milliseconds 200
    }
}
# Own prefix: install.ps1 prunes 'backup-*' to 3, and debug installs must not evict full production backups.
$backupDir = Join-Path $installDir ('debugBackup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backedUp = Test-Path -LiteralPath $debugDestination -PathType Leaf
if ($backedUp) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Copy-Item -LiteralPath $debugDestination -Destination (Join-Path $backupDir 'ocdebug.exe')
}
foreach ($old in @(Get-ChildItem -LiteralPath $installDir -Directory -Filter 'debugBackup-*' | Sort-Object Name -Descending | Select-Object -Skip 3)) {
    Remove-Item -LiteralPath $old.FullName -Recurse -Force
}

try {
    Copy-Item -LiteralPath $binary -Destination $debugDestination -Force
    if (!(Test-Path -LiteralPath $debugDestination -PathType Leaf)) {
        throw "Installed debug executable not found: $debugDestination"
    }
    & $debugDestination --version
    if ($LASTEXITCODE) { throw "ocdebug --version failed (exit $LASTEXITCODE)." }
    & $debugDestination oc config get | Out-Null
    if ($LASTEXITCODE) { throw "ocdebug config get failed (exit $LASTEXITCODE)." }
} catch {
    if ($backedUp) {
        Copy-Item -LiteralPath (Join-Path $backupDir 'ocdebug.exe') -Destination $debugDestination -Force
    }
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        Write-Host 'Install failed. Target ocdebug.exe is in use.' -ForegroundColor Red
        exit 1
    }
    throw
}
Write-Host "Installed $debugDestination (production opencode.exe was not replaced)."
