#requires -Version 7.0
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
# The Bun workspace lives in src; docs, agent files, and scripts stay at the repo root.
$srcRoot = "$repoRoot\src"
$projectName = 'opencode'
$buildScript = "$srcRoot\packages\opencode\script\build.ts"
$distFolder = "$srcRoot\packages\opencode\dist"
$installerFolder = "$repoRoot\.installer"
$installerOutput = "$installerFolder\Output"
# Per-user install target for install.ps1, the revive scripts, and the Inno setup (.installer\oc.installer.iss).
$installDir = "$env:LOCALAPPDATA\Programs\oc"
$occShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'occ.lnk'
$versionFolder = "$srcRoot\.version"
$version = "$versionFolder\version"
$versionTag = "$versionFolder\versionTag"
$yapWords = "$repoRoot\.res\yapBot.json"
$readme = "$repoRoot\README.md"
$buildNotes = "$repoRoot\docs\buildNotes\buildNotes.txt"
$ghRepo = 'fosterbarnes/oc'
# Commit subject labels in decision order; AGENTS.md (buildNotes.txt section) defines each.
$commitLabels = 'sync', 'fix', 'feat.', 'patch', 'perf.', 'deps.', 'scripts', 'cleanup', 'docs', 'misc.'

function runNativeCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$Name
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE) { throw "$Name failed (exit $LASTEXITCODE)." }
}

# True when buildNotes.txt differs from HEAD or is not tracked yet. git diff --quiet exits 1 for
# a difference; any other nonzero exit is a git failure, not a changed file.
function testBuildNotesChanged {
    $tracked = @(& git ls-files -- $buildNotes)
    if ($LASTEXITCODE) { throw "git ls-files failed (exit $LASTEXITCODE)." }
    if (-not $tracked) { return $true }
    & git diff --quiet HEAD -- $buildNotes
    switch ($LASTEXITCODE) {
        0 { return $false }
        1 { return $true }
        default { throw "git diff failed (exit $LASTEXITCODE)." }
    }
}

# Converts bare LF to CRLF in modified and untracked files. Binary and non-UTF-8 files are left alone.
function setCrlf {
    $paths = git -C $repoRoot ls-files -m -o --exclude-standard
    if ($LASTEXITCODE) { throw "git ls-files failed (exit $LASTEXITCODE)." }
    $strictUtf8 = [Text.UTF8Encoding]::new($false, $true)
    $count = 0
    foreach ($path in $paths) {
        $full = Join-Path $repoRoot $path
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
        $bytes = [IO.File]::ReadAllBytes($full)
        if ([Array]::IndexOf($bytes, [byte]0) -ge 0) { continue }
        $bom = [byte[]]@()
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            $bom = [byte[]](0xEF, 0xBB, 0xBF)
        }
        try {
            $text = $strictUtf8.GetString($bytes, $bom.Length, $bytes.Length - $bom.Length)
        } catch {
            continue
        }
        $fixed = [regex]::Replace($text, '(?<!\r)\n', "`r`n")
        if ($fixed -ceq $text) { continue }
        $body = [Text.UTF8Encoding]::new($false).GetBytes($fixed)
        [IO.File]::WriteAllBytes($full, [byte[]]($bom + $body))
        $count++
    }
    if ($count) { Write-Host "Converted $count file(s) to CRLF." }
}

function getBunVersion {
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        throw 'bun is not on PATH. Install Bun, then re-run.'
    }
    $value = (& bun --version 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE) { throw "bun --version failed (exit $LASTEXITCODE)." }
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
    # `bun --version` carries no build date or revision, so no `1.4.0-*` suffix can be proven
    # newer than the 2026-08-21 canary with the FFI fix (bad pin was 34cbb9a40). Fail closed: only 1.4.1+ counts.
    return $false
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
    if ($hostName -notin @('opencode', 'oc', 'occ', 'ocdebug')) { return }
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
    $tag = newVersionTag
    Write-Host "Maintenance version $current -> $next ($tag)"
    $next
}

# AGENTS.md Revision: a push with code changes needs bumpVersion.ps1. Docs and notes alone do not.
# Returns the changed or untracked code paths when the version still matches HEAD, else nothing.
function getUnbumpedCodeChanges {
    $headVersion = (& git -C $repoRoot show HEAD:src/.version/version | Out-String).Trim()
    if ($LASTEXITCODE) { throw "git show HEAD version failed (exit $LASTEXITCODE)." }
    if ($headVersion -ne (requireVersion)) { return @() }
    $changed = @(& git -C $repoRoot diff --name-only HEAD)
    if ($LASTEXITCODE) { throw "git diff failed (exit $LASTEXITCODE)." }
    $changed += @(& git -C $repoRoot ls-files -o --exclude-standard)
    if ($LASTEXITCODE) { throw "git ls-files failed (exit $LASTEXITCODE)." }
    @($changed | Where-Object { $_ -notmatch '(^docs/|\.md$|^scc\.txt$|^UPSTREAM|^src/\.version/)' })
}

function newVersionTag { setVersionTag (getVersionTags 1) }

# Returns $Count distinct random camelCase two-word tags without writing anything.
function getVersionTags {
    param([int]$Count = 1)
    # The word list is private and gitignored; only the maintainer's clone has it.
    if (-not (Test-Path -LiteralPath $yapWords)) {
        throw "Missing word list $yapWords. It is private and not in the public repo, so version tags can only be generated by the maintainer."
    }
    $raw = Get-Content -LiteralPath $yapWords -Raw | ConvertFrom-Json
    $words = @($raw | Where-Object { $_ -match '^[A-Za-z]+$' })
    if (-not $words.Count) { throw "No usable words found in $yapWords." }
    $tags = [Collections.Generic.HashSet[string]]::new()
    while ($tags.Count -lt $Count) {
        $first = $words[[Security.Cryptography.RandomNumberGenerator]::GetInt32($words.Count)]
        $second = $words[[Security.Cryptography.RandomNumberGenerator]::GetInt32($words.Count)]
        [void]$tags.Add($first.ToLowerInvariant() + $second.Substring(0, 1).ToUpperInvariant() + $second.Substring(1).ToLowerInvariant())
    }
    @($tags)
}

function setVersionTag {
    param([Parameter(Mandatory)][string]$Tag)
    if ($Tag -cnotmatch '^[a-z]+[A-Z][a-z]*$') { throw "Invalid tag '$Tag': expected one camelCase two-word tag" }
    [IO.File]::WriteAllText($versionTag, "$Tag`n", [Text.UTF8Encoding]::new($false))
    $Tag
}

function requireVersionTag {
    if (-not (Test-Path -LiteralPath $versionTag)) {
        throw "Missing $versionTag`: run .scripts\bumpVersion.ps1 -RerollTag to generate one."
    }
    $contents = [IO.File]::ReadAllText($versionTag).Trim()
    if ($contents -notmatch '^[a-z]+[A-Z][a-z]*$') {
        throw "Invalid $versionTag`: expected one camelCase two-word tag"
    }
    $contents
}

# Throws unless $Subject is "<Prefix> [<label> > <summary>]", optionally "; <label> > <summary>".
# Summaries: no edge spaces, no trailing period, none of [ ] > ;. .NET regex is case-sensitive.
function assertCommitSubject {
    param([Parameter(Mandatory)][string]$Subject, [Parameter(Mandatory)][string]$Prefix)
    $labels = ($commitLabels | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $segment = "($labels) > [^\s\[\]>;](?:[^\[\]>;]*[^\s.\[\]>;])?"
    $match = [regex]::Match($Subject, "^$([regex]::Escape($Prefix)) \[$segment(?:; $segment)?\]$")
    if (-not $match.Success) {
        throw "Line 1 must be '$Prefix [<label> > <summary>]', optionally '; <label> > <summary>'. " +
            "Labels: $($commitLabels -join ' ')"
    }
    $first, $second = $match.Groups[1].Value, $match.Groups[2].Value
    if ($second -and $first -eq $second) { throw "Line 1 repeats label '$first'; merge the segments." }
    if ($second -and 'misc.' -in $first, $second) { throw "'misc.' must be the only segment." }
    if ($Subject -match '[^\x20-\x7E]') { throw 'Line 1 must be plain ASCII.' }
    if ($Subject.Length -gt 72) { throw "Line 1 is $($Subject.Length) characters; the limit is 72." }
}

function writeClearedLine {
    param([Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][int]$PadWidth, [switch]$NoNewline)
    Write-Host "`r$Text$(' ' * [Math]::Max(0, $PadWidth - $Text.Length))" -NoNewline:$NoNewline
}

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
    [Environment]::Exit(0)
}

Set-Location -LiteralPath $srcRoot
