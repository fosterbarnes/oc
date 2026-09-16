#requires -Version 7.0
param(
    [Alias('h')][switch]$Help,
    [switch]$DryRun,
    [switch]$AllowDirtyParent,
    [switch]$OverwriteBackup,
    [switch]$SkipFetch,
    [switch]$SkipInstall,
    [switch]$SelfCheck,
    [string[]]$PreservePath = @()
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host @'
syncAndInstall.ps1
  Refresh isolated upstream, apply only confident upstream deltas to this custom
  fork, verify, then backup/stop/install the Windows executable.

  -DryRun              Classify and report; do not fetch, apply, stop, backup, or install.
  -AllowDirtyParent    Continue with a dirty parent worktree. Never bypasses overlap stops.
  -OverwriteBackup     Replace opencode.exe.bak in place instead of keeping the previous backup.
  -SkipFetch           Classify/apply against the current isolated checkout; do not fetch.
  -SkipInstall         Apply, verify, and build; do not stop processes, backup, or copy the exe.
  -PreservePath        Paths to leave unchanged even if classified as overlapping.
  -SelfCheck           Run the built-in classification fixture and exit.

Configurable paths are in the CONFIG block near the top of this script.
'@
    return
}

. "$PSScriptRoot\scriptHelper.ps1"

if (-not $SkipInstall -and -not $DryRun) {
    assertExternalInstall -BuildCommand '.\.scripts\build.ps1' -InstallCommand '.\.scripts\syncAndInstall.ps1'
}

# Custom fork: local install target and isolated upstream checkout for this parent.
$CONFIG = @{
    InstallDir     = 'C:\Users\user\Apps\opencode'
    ExeName        = 'opencode.exe'
    BackupSuffix   = '.bak'
    UpstreamRel    = 'UPSTREAM\opencode'
    UpstreamRemote = 'anomalyco/opencode'
    ParentRemote   = 'fosterbarnes/opencode'
    StateFile      = Join-Path $PSScriptRoot 'upstream-sync.state.json'
    DefaultBaselineSha = '5cd8e68fdd72b27818d26d168b9c7a06b359567e'
}

$upstreamRepo = Join-Path $repoRoot $CONFIG.UpstreamRel
$installPath = Join-Path $CONFIG.InstallDir $CONFIG.ExeName
$backupPath = $installPath + $CONFIG.BackupSuffix
$binary = Join-Path $repoRoot 'packages\opencode\dist\opencode-windows-x64\bin\opencode.exe'
$skipPathPrefixes = @('UPSTREAM/', '.git/', 'node_modules/', '.opencode/')

function Normalize-Rel {
    param([string]$Path)
    ($Path -replace '\\', '/').TrimStart('/')
}

function Test-SkippedPath {
    param([string]$Rel)
    foreach ($prefix in $skipPathPrefixes) {
        if ($Rel.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Get-GitLines {
    param([string]$Repo, [string[]]$GitArgs)
    $out = & git -C $Repo @GitArgs
    if ($LASTEXITCODE) { throw "git $($GitArgs -join ' ') failed in $Repo (exit $LASTEXITCODE)." }
    @($out | Where-Object { $_ -ne $null -and "$_" -ne '' })
}

function Get-ChangedPaths {
    param([string]$Repo, [string]$FromSha, [string]$ToSha)
    $paths = Get-GitLines $Repo @('diff', '--name-only', $FromSha, $ToSha)
    $paths | ForEach-Object { Normalize-Rel $_ } | Where-Object { $_ -and -not (Test-SkippedPath $_) }
}

function Convert-ToLf {
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [pscustomobject] -and $Value.Binary) { return $Value }
    return ([string]$Value).Replace("`r`n", "`n").Replace("`r", "`n")
}

function Get-BlobText {
    param([string]$Repo, [string]$Sha, [string]$Rel)
    & git -C $Repo cat-file -e "${Sha}:${Rel}" 2>$null
    if ($LASTEXITCODE) { return $null }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("oc-blob-" + [guid]::NewGuid().ToString('n'))
    $proc = Start-Process -FilePath 'git' -ArgumentList @('-C', $Repo, 'cat-file', 'blob', "${Sha}:${Rel}") -RedirectStandardOutput $tmp -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        return $null
    }
    $raw = [IO.File]::ReadAllBytes($tmp)
    Remove-Item -LiteralPath $tmp -Force
    if ($raw.Length -eq 0) { return '' }
    if ($raw -contains 0) { return [pscustomobject]@{ Binary = $true; Bytes = $raw } }
    return Convert-ToLf ([Text.Encoding]::UTF8.GetString($raw))
}

function Get-WorktreeText {
    param([string]$Root, [string]$Rel)
    $full = Join-Path $Root ($Rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $null }
    $raw = [IO.File]::ReadAllBytes($full)
    if ($raw.Length -eq 0) { return '' }
    if ($raw -contains 0) { return [pscustomobject]@{ Binary = $true; Bytes = $raw } }
    return Convert-ToLf ([Text.Encoding]::UTF8.GetString($raw))
}

function Test-SameContent {
    param($Left, $Right)
    if ($null -eq $Left -and $null -eq $Right) { return $true }
    if ($null -eq $Left -or $null -eq $Right) { return $false }
    $leftBin = $Left -is [pscustomobject] -and $Left.Binary
    $rightBin = $Right -is [pscustomobject] -and $Right.Binary
    if ($leftBin -or $rightBin) {
        if (-not $leftBin -or -not $rightBin) { return $false }
        if ($Left.Bytes.Length -ne $Right.Bytes.Length) { return $false }
        for ($i = 0; $i -lt $Left.Bytes.Length; $i++) {
            if ($Left.Bytes[$i] -ne $Right.Bytes[$i]) { return $false }
        }
        return $true
    }
    return [string]::Equals((Convert-ToLf $Left), (Convert-ToLf $Right), [StringComparison]::Ordinal)
}

function Write-TextFile {
    param([string]$Root, [string]$Rel, [string]$Text)
    $full = Join-Path $Root ($Rel -replace '/', '\')
    $dir = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $lf = Convert-ToLf $Text
    $useCrlf = $true
    if (Test-Path -LiteralPath $full -PathType Leaf) {
        $existing = [IO.File]::ReadAllBytes($full)
        $useCrlf = ($existing -contains 13)
    }
    $out = if ($useCrlf) { $lf.Replace("`n", "`r`n") } else { $lf }
    [IO.File]::WriteAllText($full, $out)
}

function Write-BytesFile {
    param([string]$Root, [string]$Rel, [byte[]]$Bytes)
    $full = Join-Path $Root ($Rel -replace '/', '\')
    $dir = Split-Path -Parent $full
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [IO.File]::WriteAllBytes($full, $Bytes)
}

function Merge-TextThreeWay {
    param([string]$Base, [string]$Ours, [string]$Theirs)
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("oc-sync-" + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $baseFile = Join-Path $tmp 'base'
        $oursFile = Join-Path $tmp 'ours'
        $theirsFile = Join-Path $tmp 'theirs'
        $enc = [Text.UTF8Encoding]::new($false)
        [IO.File]::WriteAllBytes($baseFile, $enc.GetBytes((Convert-ToLf $Base)))
        [IO.File]::WriteAllBytes($oursFile, $enc.GetBytes((Convert-ToLf $Ours)))
        [IO.File]::WriteAllBytes($theirsFile, $enc.GetBytes((Convert-ToLf $Theirs)))
        & git merge-file --diff3 $oursFile $baseFile $theirsFile | Out-Null
        $code = $LASTEXITCODE
        $merged = Convert-ToLf ([IO.File]::ReadAllText($oursFile))
        return [pscustomobject]@{ Text = $merged; Conflicts = $code }
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force
    }
}

function Read-State {
    if (Test-Path -LiteralPath $CONFIG.StateFile -PathType Leaf) {
        return Get-Content -LiteralPath $CONFIG.StateFile -Raw | ConvertFrom-Json
    }
    return [pscustomobject]@{
        baselineSha = $CONFIG.DefaultBaselineSha
        snapshotSha = '5e75e5e9901f0d178f425bfb47f1bd46cbe78a59'
    }
}

function Write-State {
    param([string]$Sha, [string]$SnapshotSha)
    $obj = [pscustomobject]@{
        baselineSha = $Sha
        snapshotSha = $SnapshotSha
        updatedAt   = (Get-Date).ToString('o')
        installDir  = $CONFIG.InstallDir
        exeName     = $CONFIG.ExeName
    }
    [IO.File]::WriteAllText($CONFIG.StateFile, ($obj | ConvertTo-Json))
}

function Classify-Trees {
    param(
        [string]$ParentRoot,
        [string]$UpstreamRoot,
        [string]$BaselineSha,
        [string]$UpstreamSha
    )
    $deltaPaths = @(Get-ChangedPaths $UpstreamRoot $BaselineSha $UpstreamSha)
    $parentTracked = Get-GitLines $ParentRoot @('ls-files') | ForEach-Object { Normalize-Rel $_ } | Where-Object { $_ -and -not (Test-SkippedPath $_) }
    $all = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($p in $deltaPaths) { [void]$all.Add($p) }

    $rows = [Collections.Generic.List[object]]::new()
    foreach ($rel in ($all | Sort-Object)) {
        $base = Get-BlobText $UpstreamRoot $BaselineSha $rel
        $up = Get-BlobText $UpstreamRoot $UpstreamSha $rel
        $parent = Get-WorktreeText $ParentRoot $rel
        if ($null -eq $parent -and $parentTracked -contains $rel) {
            $parent = Get-BlobText $ParentRoot 'HEAD' $rel
        }

        $row = [ordered]@{
            Path     = $rel
            Class    = 'unchanged'
            Action   = 'none'
            Reason   = ''
            Merged   = $null
            Binary   = $false
        }

        $parentMissing = $null -eq $parent
        $baseMissing = $null -eq $base
        $upMissing = $null -eq $up
        $parentBin = $parent -is [pscustomobject]
        $baseBin = $base -is [pscustomobject]
        $upBin = $up -is [pscustomobject]
        if ($parentBin -or $baseBin -or $upBin) { $row.Binary = $true }

        if ($baseMissing -and $upMissing) {
            $row.Class = 'parent-only'
            $row.Action = 'preserve'
            $row.Reason = 'not in the upstream delta'
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ((Test-SameContent $parent $up) -or ($parentMissing -and $upMissing)) {
            $row.Class = 'unchanged'
            $row.Action = 'none'
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ((Test-SameContent $parent $base) -and -not (Test-SameContent $base $up)) {
            $row.Class = 'upstream-only'
            if ($upMissing) {
                $row.Action = 'delete'
                $row.Reason = 'upstream deleted a file that still matches the baseline'
            } else {
                $row.Action = 'replace'
                $row.Reason = 'parent matches baseline; take refreshed upstream'
                $row.Merged = $up
            }
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ((Test-SameContent $up $base) -and -not (Test-SameContent $parent $base)) {
            $row.Class = 'custom'
            $row.Action = 'preserve'
            $row.Reason = 'upstream unchanged since baseline; keep custom parent'
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ($row.Binary) {
            $row.Class = 'ambiguous'
            $row.Action = 'stop'
            $row.Reason = 'binary overlap between custom parent and upstream'
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ($parentMissing -and -not $upMissing) {
            $row.Class = 'upstream-only'
            $row.Action = 'replace'
            $row.Reason = 'new upstream file absent from parent'
            $row.Merged = $up
            $rows.Add([pscustomobject]$row)
            continue
        }

        if ($upMissing -and -not $parentMissing) {
            $row.Class = 'ambiguous'
            $row.Action = 'stop'
            $row.Reason = 'upstream deleted a file the parent still customizes'
            $rows.Add([pscustomobject]$row)
            continue
        }

        $merged = Merge-TextThreeWay -Base ([string]$base) -Ours ([string]$parent) -Theirs ([string]$up)
        if ($merged.Conflicts -ne 0) {
            $row.Class = 'ambiguous'
            $row.Action = 'stop'
            $row.Reason = 'overlapping hunks; cannot separate custom and upstream changes'
        } else {
            $row.Class = 'merged'
            $row.Action = 'replace'
            $row.Reason = 'clean three-way merge'
            $row.Merged = $merged.Text
        }
        $rows.Add([pscustomobject]$row)
    }
    return $rows
}

function Write-Report {
    param($Rows)
    $groups = $Rows | Group-Object Class
    Write-Host 'Classification summary:'
    foreach ($g in $groups) {
        Write-Host ("  {0}: {1}" -f $g.Name, $g.Count)
    }
    $interesting = $Rows | Where-Object { $_.Class -ne 'unchanged' }
    foreach ($row in $interesting) {
        Write-Host ("[{0}] {1} ({2}) {3}" -f $row.Class, $row.Path, $row.Action, $row.Reason)
    }
}

function Invoke-SelfCheck {
    $root = Join-Path ([IO.Path]::GetTempPath()) ("oc-sync-fixture-" + [guid]::NewGuid().ToString('n'))
    $parent = Join-Path $root 'parent'
    $up = Join-Path $root 'up'
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    New-Item -ItemType Directory -Path $up -Force | Out-Null
    Push-Location -LiteralPath $up
    try {
        runNativeCommand git @('init') 'fixture git init'
        runNativeCommand git @('config', 'user.email', 'fixture@example.invalid') 'fixture email'
        runNativeCommand git @('config', 'user.name', 'fixture') 'fixture name'
        [IO.File]::WriteAllText((Join-Path $up 'upstream-only.txt'), "base-up`n")
        [IO.File]::WriteAllText((Join-Path $up 'custom.txt'), "shared`n")
        [IO.File]::WriteAllText((Join-Path $up 'crlf-match.txt'), "shared`n")
        [IO.File]::WriteAllText((Join-Path $up 'overlap.txt'), "line1`nbase`nline3`n")
        runNativeCommand git @('add', '.') 'fixture add base'
        runNativeCommand git @('commit', '-m', 'base') 'fixture commit base'
        $baseSha = (& git rev-parse HEAD).Trim()
        [IO.File]::WriteAllText((Join-Path $up 'upstream-only.txt'), "new-up`n")
        [IO.File]::WriteAllText((Join-Path $up 'overlap.txt'), "line1`nupstream`nline3`n")
        [IO.File]::WriteAllText((Join-Path $up 'added.txt'), "added`n")
        [IO.File]::WriteAllText((Join-Path $up 'crlf-match.txt'), "updated`n")
        runNativeCommand git @('add', '.') 'fixture add up'
        runNativeCommand git @('commit', '-m', 'up') 'fixture commit up'
        $upSha = (& git rev-parse HEAD).Trim()
    } finally {
        Pop-Location
    }
    Push-Location -LiteralPath $parent
    try {
        runNativeCommand git @('init') 'parent git init'
        runNativeCommand git @('config', 'user.email', 'fixture@example.invalid') 'parent email'
        runNativeCommand git @('config', 'user.name', 'fixture') 'parent name'
        [IO.File]::WriteAllText((Join-Path $parent 'upstream-only.txt'), "base-up`n")
        [IO.File]::WriteAllText((Join-Path $parent 'custom.txt'), "custom`n")
        [IO.File]::WriteAllText((Join-Path $parent 'overlap.txt'), "line1`ncustom`nline3`n")
        [IO.File]::WriteAllText((Join-Path $parent 'parent-only.txt'), "mine`n")
        [IO.File]::WriteAllText((Join-Path $parent 'crlf-match.txt'), "shared`r`n")
        runNativeCommand git @('add', '.') 'parent add'
        runNativeCommand git @('commit', '-m', 'parent') 'parent commit'
    } finally {
        Pop-Location
    }

    $rows = Classify-Trees -ParentRoot $parent -UpstreamRoot $up -BaselineSha $baseSha -UpstreamSha $upSha
    $byPath = @{}
    foreach ($r in $rows) { $byPath[$r.Path] = $r }
    if ($byPath['upstream-only.txt'].Class -ne 'upstream-only') { throw 'fixture: upstream-only.txt should be upstream-only' }
    if ($byPath.ContainsKey('custom.txt')) { throw 'fixture: custom.txt is not in the upstream delta and must not be rewritten' }
    if ($byPath.ContainsKey('parent-only.txt')) { throw 'fixture: parent-only.txt is not in the upstream delta and must not be rewritten' }
    if ($byPath['overlap.txt'].Class -ne 'ambiguous') { throw 'fixture: overlap.txt should be ambiguous' }
    if ($byPath['added.txt'].Class -ne 'upstream-only') { throw 'fixture: added.txt should be upstream-only' }
    if ($byPath['crlf-match.txt'].Class -ne 'upstream-only') { throw 'fixture: CRLF-identical parent must match baseline and take upstream' }
    $ambiguous = @($rows | Where-Object { $_.Class -eq 'ambiguous' })
    if ($ambiguous.Count -lt 1) { throw 'fixture: expected a stop on overlap' }
    Write-Host 'SelfCheck passed: upstream-only/new files apply; overlap stops; custom and parent-only files are left untouched.'
    Remove-Item -LiteralPath $root -Recurse -Force
}

if ($SelfCheck) {
    Invoke-SelfCheck
    return
}

function Assert-Tools {
    foreach ($name in @('git', 'bun', 'pwsh')) {
        if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
            throw "Required tool not found: $name"
        }
    }
}

function Assert-Checkouts {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) {
        throw "Parent checkout not found: $repoRoot"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $upstreamRepo '.git'))) {
        throw "Upstream checkout not found: $upstreamRepo"
    }
    Write-Host "Parent custom checkout: $repoRoot"
    Write-Host "Isolated upstream checkout: $upstreamRepo"
}

function Assert-Remotes {
    $parentUrl = (Get-GitLines $repoRoot @('remote', 'get-url', 'origin') | Select-Object -First 1)
    $upUrl = (Get-GitLines $upstreamRepo @('remote', 'get-url', 'origin') | Select-Object -First 1)
    if ($parentUrl -notmatch [regex]::Escape($CONFIG.ParentRemote)) {
        throw "Parent origin is not $($CONFIG.ParentRemote): $parentUrl"
    }
    if ($upUrl -notmatch [regex]::Escape($CONFIG.UpstreamRemote)) {
        throw "Upstream origin is not $($CONFIG.UpstreamRemote): $upUrl"
    }
    $upBranch = (& git -C $upstreamRepo rev-parse --abbrev-ref HEAD).Trim()
    if ($upBranch -ne 'dev') { throw "Upstream branch is '$upBranch', expected 'dev'." }
}

function Get-ParentDirty {
    Get-GitLines $repoRoot @('status', '--porcelain') | Where-Object { $_ -and $_ -notmatch '^\?\? UPSTREAM/' }
}

Assert-Tools
Assert-Checkouts
Assert-Remotes

$state = Read-State
$baselineSha = $state.baselineSha
if ([string]::IsNullOrWhiteSpace($baselineSha)) { $baselineSha = $CONFIG.DefaultBaselineSha }
Write-Host "Snapshot baseline SHA: $baselineSha"

$dirty = @(Get-ParentDirty)
if ($dirty.Count -gt 0) {
    Write-Host 'Parent worktree has local edits (not disposable generated files):'
    $dirty | ForEach-Object { Write-Host "  $_" }
    if (-not $AllowDirtyParent -and -not $DryRun) {
        throw 'Parent worktree is dirty. Re-run with -DryRun to classify, or -AllowDirtyParent after manual review. Ambiguous overlap still stops.'
    }
}

$upStatus = Get-GitLines $upstreamRepo @('status', '--porcelain')
if ($upStatus) { throw 'Upstream checkout has local changes; refusing to continue.' }

$currentUpSha = (& git -C $upstreamRepo rev-parse HEAD).Trim()
Write-Host "Current isolated upstream SHA: $currentUpSha"

function Invoke-PreservePaths {
    param($Rows)
    if (-not $PreservePath -or @($PreservePath).Count -eq 0) { return }
    $set = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($p in $PreservePath) { [void]$set.Add((Normalize-Rel $p)) }
    foreach ($row in $Rows) {
        if ($row.Action -eq 'stop' -and $set.Contains($row.Path)) {
            $row.Action = 'preserve'
            $row.Class = 'custom'
            $row.Reason = 'manually preserved (-PreservePath)'
        }
    }
}

if ($DryRun) {
    Write-Host 'Dry run: classifying against the current isolated checkout. No fetch, apply, stop, backup, or install.'
    $rows = Classify-Trees -ParentRoot $repoRoot -UpstreamRoot $upstreamRepo -BaselineSha $baselineSha -UpstreamSha $currentUpSha
    Invoke-PreservePaths $rows
    Write-Report $rows
    $stops = @($rows | Where-Object { $_.Action -eq 'stop' })
    if ($stops.Count -gt 0) {
        Write-Host ("Dry run would stop on {0} ambiguous path(s)." -f $stops.Count)
    } else {
        Write-Host 'Dry run found no ambiguous overlap. A live run could apply upstream-only deltas after fetch.'
    }
    return
}

if ($SkipFetch) {
    Write-Host 'SkipFetch: using the current isolated checkout (no fetch).'
    $newUpSha = $currentUpSha
} else {
    Write-Host 'Refreshing isolated upstream checkout only...'
    $trackingRef = (& git -C $upstreamRepo rev-parse --abbrev-ref --symbolic-full-name '@{u}').Trim()
    if ($LASTEXITCODE -or [string]::IsNullOrWhiteSpace($trackingRef)) {
        throw 'Upstream checkout has no configured tracking branch.'
    }
    $trackingParts = $trackingRef -split '/', 2
    if ($trackingParts.Length -ne 2) { throw "Invalid upstream tracking ref: $trackingRef" }
    runNativeCommand git @('-C', $upstreamRepo, 'fetch', $trackingParts[0]) 'Upstream fetch'
    runNativeCommand git @('-C', $upstreamRepo, 'merge', '--ff-only', $trackingRef) 'Upstream fast-forward'
    $newUpSha = (& git -C $upstreamRepo rev-parse HEAD).Trim()
    Write-Host "Upstream SHA $currentUpSha -> $newUpSha"
}

$rows = Classify-Trees -ParentRoot $repoRoot -UpstreamRoot $upstreamRepo -BaselineSha $baselineSha -UpstreamSha $newUpSha
Invoke-PreservePaths $rows
Write-Report $rows
$stops = @($rows | Where-Object { $_.Action -eq 'stop' })
if ($stops.Count -gt 0) {
    throw ("Refusing to modify parent source: {0} ambiguous path(s). Resolve overlap manually." -f $stops.Count)
}

$apply = @($rows | Where-Object { $_.Action -in @('replace', 'delete') })
foreach ($row in $apply) {
    $full = Join-Path $repoRoot ($row.Path -replace '/', '\')
    if ($row.Action -eq 'delete') {
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            Remove-Item -LiteralPath $full -Force
        }
        continue
    }
    if ($row.Binary -or ($row.Merged -is [pscustomobject])) {
        Write-BytesFile -Root $repoRoot -Rel $row.Path -Bytes $row.Merged.Bytes
    } else {
        Write-TextFile -Root $repoRoot -Rel $row.Path -Text ([string]$row.Merged)
    }
}
Write-Host ("Applied {0} upstream delta(s). Parent-only files and custom hunks were preserved. Changes are uncommitted." -f $apply.Count)

if ($newUpSha -ne $baselineSha) {
    incrementMaintenancePatch
}

Write-Host 'Verification: git diff --check'
$checkPaths = @($apply | ForEach-Object { $_.Path } | Where-Object { $_ -and $_ -notmatch '\.(mdx|md)$' })
if ($checkPaths.Count -gt 0) {
    runNativeCommand git (@('-C', $repoRoot, 'diff', '--check', '--') + $checkPaths) 'git diff --check applied paths'
} else {
    Write-Host 'Verification: git diff --check skipped (no applied paths).'
}

$changedPs1 = Get-GitLines $repoRoot @('diff', '--name-only', '--', '*.ps1', '.scripts/*.ps1')
foreach ($rel in $changedPs1) {
    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
    $full = Join-Path $repoRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    Write-Host "Verification: parse $rel"
    $parseErrors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($full, [ref]$null, [ref]$parseErrors)
    if ($parseErrors) { throw ("Parse failed for ${rel}:`n" + ($parseErrors | Out-String)) }
}

$packages = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($row in $apply) {
    $n = Normalize-Rel $row.Path
    if ($n -match '^packages/([^/]+)/') { [void]$packages.Add($Matches[1]) }
}
foreach ($pkg in ($packages | Sort-Object)) {
    $pkgDir = Join-Path $repoRoot "packages\$pkg"
    if (-not (Test-Path -LiteralPath (Join-Path $pkgDir 'package.json'))) { continue }
    $pkgJson = Get-Content -LiteralPath (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json
    if (-not $pkgJson.scripts -or -not $pkgJson.scripts.typecheck) {
        Write-Host "Verification: skip bun typecheck in packages\$pkg (no typecheck script)"
        continue
    }
    Write-Host "Verification: bun typecheck in packages\$pkg"
    Push-Location -LiteralPath $pkgDir
    try {
        runNativeCommand bun @('typecheck') "bun typecheck packages/$pkg"
    } finally {
        Pop-Location
    }
}

Write-Host 'Verification: Windows single executable build'
& (Join-Path $PSScriptRoot 'build.ps1')
if ($LASTEXITCODE) { throw "build.ps1 failed (exit $LASTEXITCODE)." }
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built executable not found: $binary"
}

if ($SkipInstall) {
    Write-State -Sha $newUpSha -SnapshotSha $state.snapshotSha
    Write-Host "SkipInstall: source applied from upstream $newUpSha. Built $binary. Did not stop processes, backup, or copy the exe. Source changes remain uncommitted."
    return
}

if (-not (Test-Path -LiteralPath $installPath -PathType Leaf)) {
    Write-Host "No existing install at $installPath; a backup will be skipped."
} else {
    Write-Host "Stopping system-wide opencode.exe processes..."
    Get-Process -Name 'opencode' -ErrorAction SilentlyContinue | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds(30)
    while (Get-Process -Name 'opencode' -ErrorAction SilentlyContinue) {
        if ((Get-Date) -gt $deadline) { throw 'opencode.exe is still running after Stop-Process.' }
        Start-Sleep -Milliseconds 200
    }
    $lockDeadline = (Get-Date).AddSeconds(30)
    while ($true) {
        try {
            $fs = [IO.File]::Open($installPath, 'Open', 'ReadWrite', 'None')
            $fs.Dispose()
            break
        } catch {
            if ((Get-Date) -gt $lockDeadline) { throw "Install target is still locked: $installPath" }
            Start-Sleep -Milliseconds 200
        }
    }
    if ((Test-Path -LiteralPath $backupPath -PathType Leaf) -and -not $OverwriteBackup) {
        $rotated = $backupPath + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss')
        Move-Item -LiteralPath $backupPath -Destination $rotated
        Write-Host "Kept previous backup as $rotated"
    }
    Copy-Item -LiteralPath $installPath -Destination $backupPath -Force
    Write-Host "Backup written: $backupPath"
}

New-Item -ItemType Directory -Path $CONFIG.InstallDir -Force | Out-Null
try {
    Copy-Item -LiteralPath $binary -Destination $installPath -Force
} catch {
    Write-Host "Install failed. Backup retained at $backupPath (if created)."
    throw
}

runNativeCommand $installPath @('--version') 'installed opencode --version'
Write-State -Sha $newUpSha -SnapshotSha $state.snapshotSha
Write-Host "Installed $installPath from upstream $newUpSha. Source changes remain uncommitted."
closeOut 3
