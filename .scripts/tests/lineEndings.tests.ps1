#requires -Version 7.0
# Checks setLineEndings against a throwaway repo; it never touches this checkout's git state.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\scriptHelper.ps1"

function assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$before = (Get-Location).Path
$temp = Join-Path ([IO.Path]::GetTempPath()) "lineEndingsCheck-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Set-Location -LiteralPath $temp
    $repoRoot = $temp
    runNativeCommand git @('init', '-q') 'git init'
    [IO.File]::WriteAllText("$temp/.gitattributes", "* text=auto eol=crlf`n*.sh text eol=lf`nhook text eol=lf`n")
    [IO.File]::WriteAllText("$temp/hook", "#!/bin/sh`nset -e`n")
    [IO.File]::WriteAllText("$temp/notes.txt", "one`n")
    runNativeCommand git @('add', '.') 'git add'
    runNativeCommand git @('-c', 'user.name=check', '-c', 'user.email=check@local', 'commit', '-q', '-m', 'init') 'git commit'

    # A CRLF copy of an LF-pinned file reads as unmodified to git (as after an rsync from Windows).
    [IO.File]::WriteAllText("$temp/hook", "#!/bin/sh`r`nset -e`r`n")
    [IO.File]::WriteAllText("$temp/notes.txt", "one`ntwo`n")
    [IO.File]::WriteAllText("$temp/new.sh", "#!/bin/sh`r`necho hi`n")
    [IO.File]::WriteAllText("$temp/new.txt", "a`nb`n")
    setLineEndings

    assert ([IO.File]::ReadAllText("$temp/hook") -ceq "#!/bin/sh`nset -e`n") 'A tracked eol=lf file with CRLF must become LF.'
    assert ([IO.File]::ReadAllText("$temp/new.sh") -ceq "#!/bin/sh`necho hi`n") 'An untracked eol=lf file must become LF.'
    assert ([IO.File]::ReadAllText("$temp/notes.txt") -ceq "one`r`ntwo`r`n") 'A modified text file must become CRLF.'
    assert ([IO.File]::ReadAllText("$temp/new.txt") -ceq "a`r`nb`r`n") 'An untracked text file must become CRLF.'
} finally {
    Set-Location -LiteralPath $before
    Remove-Item -LiteralPath $temp -Recurse -Force
}
if (Test-Path -LiteralPath $temp) { throw "Cleanup failed: $temp" }
Write-Host 'lineEndings checks passed.'
