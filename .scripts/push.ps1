#requires -Version 7.0
param([Alias('f')][switch]$Force, [Parameter(Position = 0)][string]$Message)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"

$subject = if ($Message) { $Message.Trim() } else { (Read-Host 'Commit message').Trim() }
if (-not $subject) { throw 'A commit message is required.' }
$branch = ((& git branch --show-current) | Out-String).Trim()
if ($LASTEXITCODE -or -not $branch) { throw 'Could not determine a non-detached current branch.' }
# Leave .version/version to incrementMaintenancePatch. Do not stage the isolated upstream checkout.
runNativeCommand git @('add', '-A', '--', '.', ':(exclude)UPSTREAM') 'git add'
runNativeCommand git @('commit', '-m', $subject) 'git commit'
$pushArgs = @('push', 'origin', $branch)
if ($Force) { $pushArgs += '--force' }
runNativeCommand git $pushArgs 'git push'
closeOut 3
