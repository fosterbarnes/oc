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
# Fail on an existing tag before anything is staged or built into a release (local, then origin).
$localTag = "$(& git rev-parse -q --verify "refs/tags/$tag")".Trim()
if ($LASTEXITCODE -gt 1) { throw "git rev-parse failed (exit $LASTEXITCODE)." }
if ($localTag) { throw "Tag $tag already exists locally ($localTag). Bump the version with bumpVersion.ps1 or delete the tag if it was never published." }
$remoteTag = "$(& git ls-remote --tags origin $tag)".Trim()
if ($LASTEXITCODE) { throw "git ls-remote --tags origin failed (exit $LASTEXITCODE)." }
if ($remoteTag) { throw "Tag $tag already exists on origin ($remoteTag). Bump the version with bumpVersion.ps1." }
# Binaries must come from the commit being tagged. The build bakes `util/sourceTree` (the git tree
# of the working tree, untracked files included), so a dirty tree cannot be compared with HEAD.
$status = @(& git status --porcelain)
if ($LASTEXITCODE) { throw "git status failed (exit $LASTEXITCODE)." }
if ($status) { throw "Working tree is not clean; commit or stash first (the release binaries must be built from the tagged commit):`n$($status -join "`n")" }
$headTree = "$(& git rev-parse 'HEAD^{tree}')".Trim()
if ($LASTEXITCODE -or -not $headTree) { throw "git rev-parse HEAD^{tree} failed (exit $LASTEXITCODE)." }
# The archives /update downloads (core/src/util/ocRelease.ts `asset`): both Windows zips are
# required; macOS zips ship when a Mac release build copied them into .release.
$assets = @(foreach ($name in 'opencode-windows-x64.zip', 'opencode-native-windows-x64.zip') {
    $file = Join-Path $releaseFolder $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $file. Run build.ps1 -Release first." }
    Get-Item -LiteralPath $file
}) + @(Get-ChildItem -LiteralPath $releaseFolder -File |
    Where-Object Name -match '^opencode(-native)?-darwin-(arm64|x64)\.zip$')
if (-not ($assets | Where-Object Name -match '-darwin-')) {
    Write-Warning "No macOS zips in ${releaseFolder}: this release ships WITHOUT macOS builds, and /update on a Mac finds nothing. Copy opencode-darwin-<arch>.zip and opencode-native-darwin-<arch>.zip from a Mac build.ps1 -Release (they live in .release, not dist) to include them."
}
# Run every binary this host can execute (installer inputs in dist, and each zip's contents) with the
# hidden --source-tree flag and require the tagged commit's tree. Zips for another OS cannot run here.
$checkRoot = Join-Path ([IO.Path]::GetTempPath()) ("opencode-tree-" + [Guid]::NewGuid().ToString('N'))
try {
    $systemTar = if ($IsWindows) { Join-Path $env:SystemRoot 'System32' 'tar.exe' } else { '/usr/bin/tar' }
    $targets = @($ocDistBinary, $nativeDistBinary) + @(foreach ($asset in $assets) {
        if ($asset.Name -notmatch "-$([regex]::Escape($distPlatform))\.zip$") {
            Write-Warning "$($asset.Name) is for another OS and was not checked against the tagged commit."
            continue
        }
        $extracted = Join-Path $checkRoot $asset.BaseName
        New-Item -ItemType Directory -Path $extracted -Force | Out-Null
        runNativeCommand $systemTar @('-xf', $asset.FullName, '-C', $extracted) "tar -xf $($asset.Name)"
        Get-ChildItem -LiteralPath $extracted -File | Where-Object Name -match '^(oc|opencode)(\.exe)?$' | Select-Object -First 1 -ExpandProperty FullName
    })
    foreach ($exe in $targets) {
        $reportedTree = "$(& $exe --source-tree)".Trim()
        if ($LASTEXITCODE) { throw "$exe --source-tree failed (exit $LASTEXITCODE)." }
        if (-not $reportedTree) { throw "$exe reports no source fingerprint (built outside git). Rebuild with build.ps1 -Release." }
        if ($reportedTree -ne $headTree) { throw "$exe was built from tree $reportedTree, not the tagged commit's $headTree. Rebuild with build.ps1 -Release on a clean checkout of this commit." }
    }
} finally {
    Remove-Item -LiteralPath $checkRoot -Recurse -Force -ErrorAction SilentlyContinue
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
