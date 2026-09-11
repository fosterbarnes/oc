#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host 'updateUpstream.ps1'
    return
}

. "$PSScriptRoot\scriptHelper.ps1"

# Custom fork: upstream is refreshed in its isolated checkout, never in this parent.
$upstreamRepo = Join-Path $repoRoot 'UPSTREAM\opencode'
if (-not (Test-Path -LiteralPath (Join-Path $upstreamRepo '.git'))) {
    throw "Upstream checkout not found: $upstreamRepo"
}

$status = & git -C $upstreamRepo status --porcelain
if ($LASTEXITCODE) { throw 'Unable to inspect the upstream checkout.' }
if ($status) { throw 'Upstream checkout has local changes; refusing to update it.' }

$trackingRef = (& git -C $upstreamRepo rev-parse --abbrev-ref --symbolic-full-name '@{u}').Trim()
if ($LASTEXITCODE -or [string]::IsNullOrWhiteSpace($trackingRef)) {
    throw 'Upstream checkout has no configured tracking branch.'
}

$trackingParts = $trackingRef -split '/', 2
if ($trackingParts.Length -ne 2) { throw "Invalid upstream tracking ref: $trackingRef" }

runNativeCommand git @('-C', $upstreamRepo, 'fetch', $trackingParts[0]) 'Upstream fetch'
runNativeCommand git @('-C', $upstreamRepo, 'merge', '--ff-only', $trackingRef) 'Upstream fast-forward'

Write-Host "Updated $upstreamRepo from $trackingRef. Parent custom source was not modified."
closeOut 3
