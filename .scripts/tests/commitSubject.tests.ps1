#requires -Version 7.0
# Checks assertCommitSubject (agentPush.ps1 line 1 rule) against good and bad subjects. No git, no files.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\scriptHelper.ps1"

$prefix = 'v0.2.278 fooBar'
$pass = @(
    "$prefix [patch > image preview opt-in]"
    "$prefix [fix > OpenAI refusal text; deps. > Bun 1.4.2]"
    "$prefix [misc. > gitattributes line endings]"
)
$fail = @(
    'v0.2.277 fooBar [fix > x y]'
    $prefix
    "$prefix [bug > x y]"
    "$prefix [Fix > x y]"
    "$prefix [feat > x y]"
    "$prefix [fix: x y]"
    "$prefix [fix | x y]"
    "$prefix [fix > x y.]"
    "$prefix [fix >  x y]"
    "$prefix [fix > a>b]"
    "$prefix [fix > a b; patch > c d; docs > e f]"
    "$prefix [fix > a b; fix > c d]"
    "$prefix [feat. > a b; misc. > c d]"
    "$prefix [fix > a $([char]0x2014) b]"
    "$prefix [fix > $('x' * 50)]"
)

foreach ($subject in $pass) { assertCommitSubject $subject $prefix }
foreach ($subject in $fail) {
    $threw = $false
    try { assertCommitSubject $subject $prefix } catch { $threw = $true }
    if (-not $threw) { throw "Accepted a bad subject: $subject" }
}
Write-Host "Commit subject checks passed ($($pass.Count) good, $($fail.Count) bad)."
