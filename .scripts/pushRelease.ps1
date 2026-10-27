#requires -Version 7.0
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"

function renameReleaseAsset {
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$Version, [Parameter(Mandatory)][string]$TagWord)
    if ($Name -notmatch '^opencode-(.+)$') { throw "Unexpected archive name: $Name" }
    "opencode-v$Version-$TagWord-$($Matches[1])"
}

$maintenanceVersion = requireVersion
$tagWord = requireVersionTag
requireReleaseBuild
$tag = "v$maintenanceVersion"
$title = "$projectName $tag $tagWord"
# Exactly the two archives /update downloads (core/src/util/ocRelease.ts `asset`).
$assets = foreach ($name in 'opencode-windows-x64.zip', 'opencode-native-windows-x64.zip') {
    $file = Join-Path $distFolder $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file. Run build.ps1 -Release first." }
    Get-Item -LiteralPath $file
}
$installer = Join-Path $installerOutput "oc_v${maintenanceVersion}_windows-x64-setup.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Missing $installer. Run buildInstaller.ps1 first." }
# Release body (shown once after /update): commit messages since the previous oc release, or HEAD's
# alone for the first one. Asked from GitHub: local v* tags include upstream OpenCode's.
$previousTag = "$(& gh release list --repo $ghRepo --exclude-drafts --limit 1 --json tagName --jq '.[0].tagName // empty')".Trim()
if ($LASTEXITCODE) { throw "gh release list failed (exit $LASTEXITCODE)." }
$range = if ($previousTag) { "$previousTag..HEAD" } else { 'HEAD^!' }
$notes = (@(& git log --format=%B $range) -join "`n").Trim()
if ($LASTEXITCODE) { throw "git log failed (exit $LASTEXITCODE)." }
if (-not $notes) { throw "No commits in $range to release." }
if ($DryRun) {
    Write-Host "Dry run: release title '$title'"
    foreach ($asset in $assets) {
        Write-Host "Dry run: $($asset.Name) -> $(renameReleaseAsset $asset.Name $maintenanceVersion $tagWord)"
    }
    Write-Host "Dry run: $(Split-Path -Leaf $installer) (not renamed)"
    Write-Host "Dry run: notes from $range, $(@($notes -split "`n").Count) lines"
    return
}
$stage = Join-Path ([IO.Path]::GetTempPath()) ("opencode-release-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
    $staged = foreach ($asset in $assets) {
        $stagedName = renameReleaseAsset $asset.Name $maintenanceVersion $tagWord
        Copy-Item -LiteralPath $asset.FullName -Destination (Join-Path $stage $stagedName)
        Join-Path $stage $stagedName
    }
    $notesFile = Join-Path $stage 'notes.md'
    [IO.File]::WriteAllText($notesFile, "$notes`n", [Text.UTF8Encoding]::new($false))
    runNativeCommand git @('tag', $tag) 'git tag'
    runNativeCommand git @('push', 'origin', "refs/tags/$tag") 'git push tag'
    runNativeCommand gh (@('release', 'create', $tag, '--title', $title, '--notes-file', $notesFile, '--repo', $ghRepo) + @($staged) + $installer) 'gh release create'
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
closeOut 3
