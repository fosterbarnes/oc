[CmdletBinding()]
param(
    [Alias('b', 'nb')]
    [switch]$NoBuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binary = Join-Path $repoRoot 'packages\opencode\dist\opencode-windows-x64\bin\opencode.exe'
$runtime = Join-Path $repoRoot 'packages\opencode\dist\opencode-windows-x64\bin\agentify-runtime'
$cursorRuntime = Join-Path $repoRoot 'packages\opencode\dist\opencode-windows-x64\bin\cursor-runtime'

# Custom fork: installation builds the current binary by default; -NoBuild is the opt-out.
if (-not $NoBuild) {
    try {
        $buildArgs = if ($SkipInstall) { @('-SkipInstall') } else { @() }
        & (Join-Path $PSScriptRoot 'build.ps1') @buildArgs
    } catch {
        return
    }
}

if (!(Test-Path -LiteralPath $binary)) {
    throw "Built binary not found: $binary. Run build.ps1 first."
}
if (!(Test-Path -LiteralPath $runtime -PathType Container)) {
    throw "Packaged Agentify runtime not found: $runtime. Run build.ps1 first."
}
if (!(Test-Path -LiteralPath $cursorRuntime -PathType Container)) {
    throw "Packaged Cursor runtime not found: $cursorRuntime. Run build.ps1 first."
}

$installDir = 'C:\Users\user\Apps\opencode'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$destination = Join-Path $installDir 'opencode.exe'
$obsoleteAliases = @('oc.exe', 'occ.exe')
$processNames = @('opencode', 'oc', 'occ')
$running = @($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })
if ($running) {
    Write-Host 'Stopping running opencode.exe processes...'
    $running | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds(30)
    while (@($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })) {
        if ((Get-Date) -gt $deadline) { throw 'opencode.exe is still running after Stop-Process.' }
        Start-Sleep -Milliseconds 200
    }
}
try {
    Copy-Item -LiteralPath $binary -Destination $destination -Force
    Copy-Item -LiteralPath $runtime -Destination $installDir -Recurse -Force
    Copy-Item -LiteralPath $cursorRuntime -Destination $installDir -Recurse -Force
    foreach ($alias in $obsoleteAliases) {
        $aliasPath = Join-Path $installDir $alias
        if (Test-Path -LiteralPath $aliasPath) { Remove-Item -LiteralPath $aliasPath -Force }
    }
} catch {
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        Write-Host 'Install failed. Target OpenCode.exe is in use.' -ForegroundColor Red
        exit 1
    }
    throw
}

& (Join-Path $installDir 'opencode.exe') --version
& (Join-Path $installDir 'opencode.exe') oc config get | Out-Null
