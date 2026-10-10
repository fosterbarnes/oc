#requires -Version 7.0
# Non-interactive push for the agent-push skill: -Context prints what the agent needs to write
# buildNotes.txt; the default mode validates it, runs prePush.ps1 and push.ps1 quietly, then reports.
param([switch]$Context)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
Set-Location -LiteralPath $repoRoot
$current = requireVersion
$tagWord = requireVersionTag
& git diff --quiet HEAD -- $buildNotes 2>$null
$notesChanged = $LASTEXITCODE -ne 0

if ($Context) {
    Write-Host "branch: $(git branch --show-current)  version: $current $tagWord"
    Write-Host "line 1: v$current $tagWord"
    Write-Host '--- status'
    git status --short 2>$null
    Write-Host '--- new buildNotes.md lines'
    git diff -U0 HEAD -- buildNotes.md 2>$null | Where-Object { $_ -match '^\+(?!\+\+)' } | ForEach-Object { $_.Substring(1) }
    Write-Host '--- last 10 subjects'
    git log -10 --format=%s
    Write-Host '--- last commit message (style sample)'
    git log -1 --format=%B
    if ($notesChanged) { Write-Host 'WARN: buildNotes.txt already changed since HEAD; overwrite it.' }
    return
}

# Fail on a bad message before the slow checks run.
if (-not $notesChanged) { throw 'buildNotes.txt is unchanged since the last commit; write the new message first.' }
$lines = @([IO.File]::ReadAllLines($buildNotes))
if ($lines[0].Trim() -ne "v$current $tagWord") { throw "buildNotes.txt line 1 must be v$current $tagWord." }
if ($lines.Count -lt 3 -or $lines[1].Trim() -or -not ($lines[2..($lines.Count - 1)] -join '').Trim()) {
    throw 'buildNotes.txt needs line 1, one blank line, then a non-empty body.'
}

# Run each script in-process (closeOut is a no-op when not the -File entry); print the tail only on failure.
foreach ($step in 'prePush', 'push') {
    $log = [Collections.Generic.List[string]]::new()
    try { & "$PSScriptRoot\$step.ps1" *>&1 | ForEach-Object { $log.Add("$_") } }
    catch {
        $log | Select-Object -Last 40
        throw "$step.ps1 failed: $_"
    }
    Write-Host "$step.ps1 passed."
}

Set-Location -LiteralPath $repoRoot
Write-Host "--- pushed $(git log -1 --format=%h) to origin/$(git branch --show-current)"
git show -s --format=%B HEAD
git show --name-status --format= HEAD
