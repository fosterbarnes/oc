#requires -Version 7.0
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
# The Bun workspace lives in src; docs, agent files, and scripts stay at the repo root.
$srcRoot = "$repoRoot\src"
$projectName = 'opencode'
$buildScript = "$srcRoot\packages\opencode\script\build.ts"
$distFolder = "$srcRoot\packages\opencode\dist"
$versionFolder = "$srcRoot\.version"
$version = "$versionFolder\version"
$readme = "$repoRoot\README.md"
$buildNotes = "$repoRoot\buildNotes.txt"
$ghRepo = 'fosterbarnes/oc'

function runNativeCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$Name
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE) { throw "$Name failed (exit $LASTEXITCODE)." }
}

function getBunVersion {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw 'bun is not on PATH. Install Bun, then re-run.'
    }
    $value = (& bun --version 2>$null | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($value)) { throw 'bun --version returned nothing.' }
    $value.Trim()
}

function testBunHasFfiFix {
    param([Parameter(Mandatory)][string]$Version)
    if ($Version -eq '1.4.0') { return $false }
    if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)') { throw "Unrecognized bun version: $Version" }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
    if ($major -gt 1) { return $true }
    if ($major -lt 1) { return $false }
    if ($minor -gt 4) { return $true }
    if ($minor -lt 4) { return $false }
    if ($patch -ge 1) { return $true }
    return $Version.StartsWith('1.4.0-')
}

function requireBunForCompile {
    # An empty BUN_INSTALL (e.g. a blank HKCU\Environment value reloaded by WezTerm) makes `bun install` spin forever
    if ((Test-Path Env:BUN_INSTALL) -and -not $env:BUN_INSTALL) {
        Write-Host 'Clearing empty BUN_INSTALL for this build.'
        Remove-Item Env:BUN_INSTALL
    }
    $version = getBunVersion
    if (testBunHasFfiFix $version) {
        Write-Host "Bun $version (Windows TUI FFI segfault fix present)"
        return
    }
    Write-Host "Bun $version is stable 1.4.0 or older. That pin segfaults the Windows OpenCode TUI (oven-sh/bun#39829 / #40302). Upgrading to canary so this compile embeds a fixed runtime."
    runNativeCommand bun @('upgrade', '--canary') 'bun upgrade --canary'
    $version = getBunVersion
    if (-not (testBunHasFfiFix $version)) {
        throw "Bun is still $version after canary upgrade. Do not compile OpenCode until bun is 1.4.1+, or a 1.4.0-canary built after 2026-08-21."
    }
    Write-Host "Bun $version"
}

function assertExternalInstall {
    param(
        [Parameter(Mandatory)][string]$BuildCommand,
        [Parameter(Mandatory)][string]$InstallCommand
    )
    $hostPid = 0
    if (-not [int]::TryParse($env:OPENCODE_PID, [ref]$hostPid)) { return }
    $hostProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $hostPid" -ErrorAction SilentlyContinue
    if (-not $hostProcess) { return }
    $hostName = [IO.Path]::GetFileNameWithoutExtension([string]$hostProcess.Name).ToLowerInvariant()
    if ($hostName -notin @('opencode', 'oc', 'occ', 'ocdebug', 'ocbug', 'oc-debug')) { return }
    throw @"
Refusing to install from an active OpenCode process. The installer stops OpenCode before replacing its binaries.

Safe agent action:
  $BuildCommand

After the build completes, exit OpenCode and run this from a fresh PowerShell:
  $InstallCommand
"@
}

function requireVersion {
    if (-not (Test-Path -LiteralPath $version)) {
        New-Item -ItemType Directory -LiteralPath $versionFolder -Force | Out-Null
        [IO.File]::WriteAllText($version, "0.0.1`n")
    }
    $contents = [IO.File]::ReadAllText($version).Trim()
    if ($contents -notmatch '^\d+\.\d+\.\d+$') {
        throw "Invalid $version`: expected one version in X.Y.Z format"
    }
    $contents
}

# Maintenance version is X.Y.Z. Upstream sync increments the patch.
function incrementMaintenancePatch {
    $current = requireVersion
    $parts = $current.Split('.')
    $next = '{0}.{1}.{2}' -f $parts[0], $parts[1], ([int]$parts[2] + 1)
    [IO.File]::WriteAllText($version, "$next`n")
    Write-Host "Maintenance version $current -> $next"
    $next
}

function writeClearedLine {
    param([Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][int]$PadWidth, [switch]$NoNewline)
    Write-Host "`r$Text$(' ' * [Math]::Max(0, $PadWidth - $Text.Length))" -NoNewline:$NoNewline
}

$weztermExe = (Get-Command wezterm.exe -ErrorAction SilentlyContinue)?.Source

function closeOut {
    param([int]$Seconds = 5)
    $caller = $MyInvocation.PSCommandPath
    if ([string]::IsNullOrWhiteSpace($caller)) { return }
    $argv = [Environment]::GetCommandLineArgs()
    $fileArg = $null
    for ($i = 0; $i -lt $argv.Length; $i++) {
        if ("$($argv[$i])" -match '^(?i)-File$|^(?i)-f$') {
            if ($i + 1 -lt $argv.Length) { $fileArg = $argv[$i + 1] }
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($fileArg)) { return }
    try {
        $fileFull = [IO.Path]::GetFullPath($fileArg)
        $callerFull = [IO.Path]::GetFullPath($caller)
    } catch { return }
    if (-not [string]::Equals($fileFull, $callerFull, [StringComparison]::OrdinalIgnoreCase)) { return }
    if ($Seconds -lt 0) { $Seconds = 0 }
    if ($Seconds -gt 0) {
        $pad = "closing after $Seconds seconds..."
        foreach ($n in $Seconds..1) {
            writeClearedLine -Text "closing after $n seconds..." -PadWidth $pad.Length -NoNewline
            Start-Sleep -Seconds 1
        }
        writeClearedLine -Text 'closing...' -PadWidth $pad.Length
    }
    try {
        if ($env:SCRIPT_OWN_PANE -and $env:WEZTERM_PANE -and $weztermExe) {
            & $weztermExe @('cli', 'kill-pane', '--pane-id', $env:WEZTERM_PANE)
        }
    } catch { }
    [Environment]::Exit(0)
}

Set-Location -LiteralPath $srcRoot
