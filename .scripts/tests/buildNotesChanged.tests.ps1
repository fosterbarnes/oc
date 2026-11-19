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
    $buildNotes = Join-Path $temp 'buildNotes.txt'
    assert (-not (testBuildNotesChanged)) 'A missing buildNotes.txt is not changed.'
    [IO.File]::WriteAllText($buildNotes, "v1 tag`n`nbody")
    assert (testBuildNotesChanged) 'A message with no commits yet counts as changed.'
    [IO.File]::WriteAllText((Join-Path $temp 'other.txt'), 'x')
    runNativeCommand git @('add', 'other.txt') 'git add'
    runNativeCommand git @('-c', 'user.name=check', '-c', 'user.email=check@local', 'commit', '-q', '-m', 'v1 tag') 'git commit'

    assert (-not (testBuildNotesChanged)) 'Line 1 equal to the last subject is not changed.'
    [IO.File]::WriteAllText($buildNotes, "v2 tag`n`nbody")
    assert (testBuildNotesChanged) 'Line 1 different from the last subject counts as changed.'
    [IO.File]::WriteAllText($buildNotes, "`n`nbody")
    assert (-not (testBuildNotesChanged)) 'An empty line 1 is not changed.'
    Remove-Item -LiteralPath $buildNotes
    assert (-not (testBuildNotesChanged)) 'A missing buildNotes.txt is not changed.'

    [IO.File]::WriteAllText($buildNotes, "v3 tag`n`nbody")
    # A broken repository makes git fail; that must throw, not read as "changed".
    Remove-Item -LiteralPath (Join-Path $temp '.git' 'HEAD') -Force
    $failed = $false
    try { testBuildNotesChanged | Out-Null } catch { $failed = $_.Exception.Message -like '*failed (exit *' }
    assert $failed 'A git failure must throw with its exit code.'
} finally {
    Set-Location -LiteralPath $before
    Remove-Item -LiteralPath $temp -Recurse -Force
}
if (Test-Path -LiteralPath $temp) { throw "Cleanup failed: $temp" }
Write-Host 'buildNotes change checks passed.'
