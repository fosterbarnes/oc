#requires -Version 7.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"

$current = [IO.File]::ReadAllText($version).Trim()
if ($current -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid version '$current' in $version." }
$content = [IO.File]::ReadAllText($readme)
$pattern = 'Current version: \[[^\]]*\]\([^)]*\)'
if ([regex]::Matches($content, $pattern).Count -ne 1) {
    throw 'README.md must contain exactly one "Current version: [...](...)" link.'
}
# Link to the branch history: the pushed commit's hash does not exist yet at pre-push time.
$line = "Current version: [v$current](https://github.com/fosterbarnes/oc/commits/main)"
$updated = [regex]::Replace($content, $pattern, $line)
if ($updated -ne $content) { [IO.File]::WriteAllText($readme, $updated) }
Write-Host "README version set to v$current."
