#requires -Version 7.0
param(
    [Alias('b')][switch]$Build,
    [Alias('d')][switch]$DebugInstance,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.install.ps1 [-b] [-d]'; return }
. "$PSScriptRoot\.scripts\scriptHelper.ps1"

$repoRoot = $PSScriptRoot
$installFolder = 'C:\Users\user\Apps\opencode'
$exeName = if ($DebugInstance) { 'oc-debug.exe' } else { 'opencode.exe' }
$installPath = "$installFolder\$exeName"
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant()
$binary = "$repoRoot\packages\opencode\dist\opencode-windows-$architecture\bin\opencode.exe"
$helper = "$repoRoot\packages\opencode\dist\opencode-windows-$architecture\bin\opencode-process-tree.exe"
$helperInstallPath = "$installFolder\opencode-process-tree.exe"

Set-Location -LiteralPath $repoRoot
if ($Build) {
    & bun run packages\opencode\script\build.ts --single
    if ($LASTEXITCODE) { throw "OpenCode build failed (exit $LASTEXITCODE)." }
}
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built executable not found: $binary. Run .install.ps1 -b first."
}
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
    throw "Built helper not found: $helper. Run .install.ps1 -b first. Helper is produced by packages/core/native/windows/build.ps1 -Architecture $architecture -Output <path>."
}
New-Item -ItemType Directory -LiteralPath $installFolder -Force | Out-Null
$processNames = if ($DebugInstance) { @('oc-debug') } else { @('opencode', 'oc', 'occ', 'opencode-process-tree') }
@($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue }) |
    Stop-Process -Force -ErrorAction SilentlyContinue
$deadline = (Get-Date).AddSeconds(30)
while (@($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })) {
    if ((Get-Date) -gt $deadline) { throw 'OpenCode processes are still running after Stop-Process.' }
    Start-Sleep -Milliseconds 200
}
try {
    Copy-Item -LiteralPath $binary -Destination $installPath -Force
} catch {
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        throw "Install failed: $exeName is in use. Stop that process and retry."
    }
    throw
}
if (-not $DebugInstance) {
    try {
        Copy-Item -LiteralPath $helper -Destination $helperInstallPath -Force
    } catch {
        if ($_.Exception.Message -match 'being used by another process|cannot access') {
            throw "Install failed: opencode-process-tree.exe is in use. Stop OpenCode and retry."
        }
        throw
    }
}
if (-not (Test-Path -LiteralPath $helperInstallPath -PathType Leaf)) {
    throw "Installed helper not found: $helperInstallPath"
}
Write-Host "Installed $installPath and $helperInstallPath"
try {
    & $helperInstallPath --version | Out-Null
} catch {
    throw "Installed helper version check failed: $helperInstallPath"
}
& $installPath oc config get | Out-Null
if ($DebugInstance) {
    Write-Host 'Isolated debug instance: oc-debug oc server start / oc-debug oc launch (port 4097, data opencode-debug). Production opencode.exe was left running.'
}
closeOut 3
