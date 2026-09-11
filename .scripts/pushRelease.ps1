#requires -Version 7.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"

$maintenanceVersion = requireVersion
$tag = "v$maintenanceVersion"
$assets = @(Get-ChildItem -LiteralPath $distFolder -Recurse -File | Where-Object { $_.Extension -in '.zip', '.gz' })
if (-not $assets) { throw "No release archives found under $distFolder. Run build.ps1 -Release first." }
runNativeCommand git @('tag', '-f', $tag) 'git tag'
runNativeCommand git @('push', 'origin', "refs/tags/$tag", '--force') 'git push tag'
runNativeCommand gh (@('release', 'create', $tag, '--title', "$projectName $tag", '--repo', $ghRepo) + @($assets.FullName)) 'gh release create'
closeOut 3
