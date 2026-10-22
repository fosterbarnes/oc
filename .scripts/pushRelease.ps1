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
$tag = "v$maintenanceVersion"
$title = "$projectName $tag $tagWord"
$assets = @(Get-ChildItem -LiteralPath $distFolder -Recurse -File | Where-Object { $_.Extension -in '.zip', '.gz' })
if (-not $assets) { throw "No release archives found under $distFolder. Run build.ps1 -Release first." }
$installers = @(Get-ChildItem -LiteralPath $installerOutput -File -Filter '*.exe' -ErrorAction SilentlyContinue)
if (-not $installers) { throw "No installers found in $installerOutput. Run buildInstaller.ps1 first." }
if ($DryRun) {
    Write-Host "Dry run: release title '$title'"
    foreach ($asset in $assets) {
        Write-Host "Dry run: $($asset.Name) -> $(renameReleaseAsset $asset.Name $maintenanceVersion $tagWord)"
    }
    foreach ($installer in $installers) {
        Write-Host "Dry run: $($installer.Name) (not renamed)"
    }
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
    runNativeCommand git @('tag', $tag) 'git tag'
    runNativeCommand git @('push', 'origin', "refs/tags/$tag") 'git push tag'
    runNativeCommand gh (@('release', 'create', $tag, '--title', $title, '--repo', $ghRepo) + @($staged) + @($installers.FullName)) 'gh release create'
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
closeOut 3
