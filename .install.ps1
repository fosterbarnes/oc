#requires -Version 7.0
param([Alias('b')][switch]$Build, [Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host '.install.ps1 [-b]'; return }
. "$PSScriptRoot\.scripts\scriptHelper.ps1"

$repoRoot = $PSScriptRoot
$installFolder = 'C:\Users\user\Apps\opencode'
$installPath = "$installFolder\opencode.exe"
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant()
$binary = "$repoRoot\packages\opencode\dist\opencode-windows-$architecture\bin\opencode.exe"

Set-Location -LiteralPath $repoRoot
if ($Build) {
    & bun run packages\opencode\script\build.ts --single
    if ($LASTEXITCODE) { throw "OpenCode build failed (exit $LASTEXITCODE)." }
}
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built executable not found: $binary. Run .install.ps1 -b first."
}
New-Item -ItemType Directory -LiteralPath $installFolder -Force | Out-Null
Copy-Item -LiteralPath $binary -Destination $installPath -Force
Write-Host "Installed $installPath"
& $installPath oc config get | Out-Null
closeOut 3
