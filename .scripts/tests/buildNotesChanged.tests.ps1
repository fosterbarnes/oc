#requires -Version 7.0
# Checks testBuildNotesChanged against a throwaway repo; it never touches this checkout's git state.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\scriptHelper.ps1"

function assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$before = (Get-Location).Path
$temp = Join-Path ([IO.Path]::GetTempPath()) "buildNotesCheck-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Set-Location -LiteralPath $temp
    runNativeCommand git @('init', '-q') 'git init'
    $buildNotes = "$temp\buildNotes.txt"
    [IO.File]::WriteAllText("$temp\other.txt", 'x')
    runNativeCommand git @('add', 'other.txt') 'git add'
    runNativeCommand git @('-c', 'user.name=check', '-c', 'user.email=check@local', 'commit', '-q', '-m', 'init') 'git commit'

    assert (testBuildNotesChanged) 'A missing buildNotes.txt counts as changed (not tracked).'
    [IO.File]::WriteAllText($buildNotes, "v1 tag`n`nbody")
    assert (testBuildNotesChanged) 'An untracked buildNotes.txt counts as changed.'
    runNativeCommand git @('add', 'buildNotes.txt') 'git add'
    runNativeCommand git @('-c', 'user.name=check', '-c', 'user.email=check@local', 'commit', '-q', '-m', 'notes') 'git commit'
    assert (-not (testBuildNotesChanged)) 'A committed, unchanged buildNotes.txt is not changed.'
    [IO.File]::WriteAllText($buildNotes, "v2 tag`n`nbody")
    assert (testBuildNotesChanged) 'An edited buildNotes.txt counts as changed.'

    # A broken repository makes git fail; that must throw, not read as "changed".
    Remove-Item -LiteralPath "$temp\.git\HEAD" -Force
    $failed = $false
    try { testBuildNotesChanged | Out-Null } catch { $failed = $_.Exception.Message -like '*failed (exit *' }
    assert $failed 'A git failure must throw with its exit code.'
} finally {
    Set-Location -LiteralPath $before
    Remove-Item -LiteralPath $temp -Recurse -Force
}
if (Test-Path -LiteralPath $temp) { throw "Cleanup failed: $temp" }
Write-Host 'buildNotes change checks passed.'
