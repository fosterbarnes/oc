#requires -Version 7.0
param([Alias('h')][switch]$Help)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'prePush.ps1'; return }
. "$PSScriptRoot\scriptHelper.ps1"
runNativeCommand bun @('turbo', 'typecheck') 'typecheck'
runNativeCommand bun @('packages/tui/script/keybindDocs.ts', '--check') 'keybind docs check'
& "$PSScriptRoot\countCode.ps1"
& "$PSScriptRoot\readmeVersion.ps1"
# Keep the tracked OpenAPI spec in step with the server routes; the Prettier pass below formats it.
$openApi = @(& bun run --cwd "$srcRoot/packages/opencode" dev generate)
if ($LASTEXITCODE) { throw "OpenAPI generate failed (exit $LASTEXITCODE)." }
$openApi | Set-Content -LiteralPath "$srcRoot/packages/sdk/openapi.json" -Encoding utf8NoBOM
# Format changed files the way upstream's format workflow does, so src stays Prettier-clean.
$changed = @(git -C $srcRoot ls-files -m -o --exclude-standard)
if ($LASTEXITCODE) { throw "git ls-files failed (exit $LASTEXITCODE)." }
$changed = @($changed | Where-Object { Test-Path -LiteralPath (Join-Path $srcRoot $_) -PathType Leaf })
if ($changed) {
    Push-Location -LiteralPath $srcRoot
    try {
        # Batches keep each command line under the Windows 32K limit; large syncs change ~1,900 files.
        for ($i = 0; $i -lt $changed.Count; $i += 200) {
            $batch = $changed[$i..([Math]::Min($i + 199, $changed.Count - 1))]
            runNativeCommand bun (@('run', 'prettier', '--write', '--ignore-unknown', '--log-level', 'warn') + $batch) 'prettier'
        }
    }
    finally { Pop-Location }
}
setCrlf
Write-Host 'Pre-push checks passed. No commit or push was performed.'
closeOut 3
