[CmdletBinding()]
param(
    [Alias('b', 'nb')]
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binary = Join-Path $repoRoot 'packages\opencode\dist\opencode-windows-x64\bin\opencode.exe'

if (-not $NoBuild) {
    try {
        & (Join-Path $PSScriptRoot 'build.ps1') -SkipInstall
    } catch {
        return
    }
}

if (!(Test-Path -LiteralPath $binary)) {
    throw "Built binary not found: $binary. Run build.ps1 first."
}

$installDir = 'C:\Users\user\Apps\opencode'
$debugDestination = Join-Path $installDir 'ocdebug.exe'
$helperDestination = Join-Path $installDir 'opencode-process-tree.exe'
if (!(Test-Path -LiteralPath $helperDestination -PathType Leaf)) {
    throw "Production helper missing: $helperDestination. Run .scripts\install.ps1 once so ocdebug can reuse opencode-process-tree.exe."
}

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
try {
    Copy-Item -LiteralPath $binary -Destination $debugDestination -Force
} catch {
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        Write-Host 'Install failed. Target ocdebug.exe is in use.' -ForegroundColor Red
        exit 1
    }
    throw
}
if (!(Test-Path -LiteralPath $debugDestination -PathType Leaf)) {
    throw "Installed debug executable not found: $debugDestination"
}
& $debugDestination --version
& $debugDestination oc config get | Out-Null
Write-Host "Installed $debugDestination (production opencode.exe was not replaced)."
