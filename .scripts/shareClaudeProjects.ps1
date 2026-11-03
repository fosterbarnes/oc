#requires -Version 7.0
# One-time move to shared Claude Code transcripts: each extra login folder (~/.claudeN) gets its
# `projects` and `tasks` folders merged into ~/.claude, then replaced by a junction to them, so a
# chat's Claude conversation follows it to any account (oc `moveClaudeSessionAccount`).
# Dry run by default; -Apply moves files. Never overwrites: an item with a name collision is left
# as it is and reported. Close oc and every `claude` shell first: a running CLI holds its transcript.
param(
    [switch]$Apply,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) { Write-Host 'shareClaudeProjects.ps1 [-Apply]'; return }

$source = "$HOME\.claude"
$items = 'projects', 'tasks'
if ($Apply -and (Get-Process -Name claude -ErrorAction SilentlyContinue)) {
    throw 'A claude process is running. Close oc and every claude shell, then run again.'
}
$accounts = @(Get-ChildItem -LiteralPath $HOME -Directory -Force -Filter '.claude*' |
    Where-Object Name -Match '^\.claude([2-9]|[1-9]\d)$')
if (-not $accounts) { Write-Host 'No ~/.claudeN account folders found.'; return }

foreach ($item in $items) {
    $target = "$source\$item"
    if (Test-Path -LiteralPath $target -PathType Container) { continue }
    if ($Apply) { New-Item -ItemType Directory -Path $target | Out-Null }
    Write-Host "create $target"
}

foreach ($account in $accounts) {
    foreach ($item in $items) {
        $dir = Join-Path $account.FullName $item
        $target = "$source\$item"
        $label = "$($account.Name)\$item"
        $existing = Get-Item -LiteralPath $dir -Force -ErrorAction SilentlyContinue
        if ($existing.LinkType) {
            $state = if ($existing.Target -eq $target) { 'already shared' } else { "links elsewhere ($($existing.Target)), skipped" }
            Write-Host "$label $state"
            continue
        }
        if ($existing) {
            $files = @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force |
                ForEach-Object { [IO.Path]::GetRelativePath($dir, $_.FullName) })
            $collisions = @($files | Where-Object { Test-Path -LiteralPath (Join-Path $target $_) })
            if ($collisions) {
                Write-Host "$label skipped: $($collisions.Count) file(s) already exist in $target" -ForegroundColor Yellow
                $collisions | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
                continue
            }
            Write-Host "$label move $($files.Count) file(s) into $target"
            if (-not $Apply) { continue }
            foreach ($file in $files) {
                $destination = Join-Path $target $file
                New-Item -ItemType Directory -Force -Path (Split-Path -Path $destination -Parent) | Out-Null
                Move-Item -LiteralPath (Join-Path $dir $file) -Destination $destination
            }
            if (Get-ChildItem -LiteralPath $dir -Recurse -File -Force) { throw "$dir still has files after the move." }
            Remove-Item -LiteralPath $dir -Recurse -Force
            if (Test-Path -LiteralPath $dir) { throw "Could not remove the emptied $dir." }
        } else {
            Write-Host "$label link to $target"
            if (-not $Apply) { continue }
        }
        New-Item -ItemType Junction -Path $dir -Target $target | Out-Null
        if ((Get-Item -LiteralPath $dir -Force).LinkType -ne 'Junction') { throw "$dir is not a junction." }
        Write-Host "$label shared"
    }
}
if (-not $Apply) { Write-Host 'Dry run: nothing changed. Run with -Apply to move.' }
