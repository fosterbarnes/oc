#requires -Version 7.0
# Runs native opencode.exe (a dist build, not installed) in its own WezTerm process on the real
# profile, so agents (/agentTest) and the user can drive the latest changes beside a running oc.
# One run at a time, recorded in C:\ocTestTmp\agentTest\current.json.
param(
    [Alias('h')][switch]$Help,
    [switch]$Start,
    [switch]$Screen,
    [switch]$Stop,
    [switch]$Build,
    [string]$Project,
    [string]$Exe
)
$ErrorActionPreference = 'Stop'
if ($Help) {
    Write-Host 'nativeTest.ps1 -Start [-Build] [-Project <dir>] [-Exe <path>] | -Screen | -Stop'
    return
}
if (@($Start, $Screen, $Stop).Where({ $_ }).Count -ne 1) { throw 'Use exactly one of -Start, -Screen, -Stop.' }
. "$PSScriptRoot\scriptHelper.ps1"

$runRoot = 'C:\ocTestTmp\agentTest'
$currentFile = "$runRoot\current.json"
$socketDir = "$env:USERPROFILE\.local\share\wezterm"
# Shared state the window can change: -Start copies it, -Stop puts back each changed file. A whole-file
# restore also reverts what the user's own oc wrote meanwhile. Not covered: prompt-history.jsonl and
# claude-code\sessions.json, which the user's oc appends to all the time.
$stateDir = "$runRoot\state"
$stateFiles = @(
    "$env:USERPROFILE\.local\state\opencode\model.json"
    "$env:USERPROFILE\.local\state\opencode\kv.json"
    "$env:USERPROFILE\.local\state\opencode\agent.json"
    "$env:USERPROFILE\.local\state\opencode\frecency.jsonl"
    "$env:USERPROFILE\.config\opencode\tui.json"
    "$env:USERPROFILE\.local\share\opencode\claude-code\account-pool.json"
)

function getProcess([int]$ProcessId) { Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" }

function readRun {
    if (-not (Test-Path -LiteralPath $currentFile)) { return $null }
    Get-Content -LiteralPath $currentFile -Raw | ConvertFrom-Json
}

# Identity, not just pid: a reused pid has a different CIM creation time.
function testRunAlive($run) {
    $live = getProcess $run.guiPid
    $live -and "$($live.CreationDate.ToFileTimeUtc())" -eq "$($run.created)"
}

# `wezterm cli` aimed only at the run's own GUI socket; --no-auto-start never spawns a mux server.
function invokeRunCli($run, [string[]]$CliArgs) {
    $env:WEZTERM_UNIX_SOCKET = $run.socket
    Remove-Item Env:WEZTERM_PANE -ErrorAction SilentlyContinue
    $out = & wezterm cli --no-auto-start @CliArgs
    if ($LASTEXITCODE) { throw "wezterm cli $($CliArgs[0]) failed (exit $LASTEXITCODE)." }
    $out
}

if ($Screen) {
    $run = readRun
    if (-not $run -or -not (testRunAlive $run)) { throw 'No native test is running.' }
    # Trailing padding is most of a raw grid read; drop it so readers get only the content.
    $lines = @(invokeRunCli $run @('get-text', '--pane-id', "$($run.paneId)") | ForEach-Object { $_.TrimEnd() })
    ($lines -join "`n") -replace '\n+$', ''
    return
}

if ($Stop) {
    $run = readRun
    if (-not $run) { Write-Host 'No native test is running.'; return }
    if (testRunAlive $run) {
        # Leaves first; each process is rechecked against its creation time right before it stops.
        $all = @(Get-CimInstance Win32_Process)
        $tree = @($all | Where-Object ProcessId -eq $run.guiPid)
        for ($i = 0; $i -lt $tree.Count; $i++) {
            $parent = $tree[$i]
            $tree += @($all | Where-Object { $_.ParentProcessId -eq $parent.ProcessId -and $_.CreationDate -ge $parent.CreationDate })
        }
        [array]::Reverse($tree)
        foreach ($item in $tree) {
            $live = getProcess $item.ProcessId
            if (-not $live -or $live.CreationDate -ne $item.CreationDate) { continue }
            try { Stop-Process -Id $item.ProcessId -Force } catch {
                if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw }
            }
        }
        $left = @($tree | Where-Object { $live = getProcess $_.ProcessId; $live -and $live.CreationDate -eq $_.CreationDate })
        if ($left) { throw "Still running after stop: $(($left | ForEach-Object { "$($_.Name) $($_.ProcessId)" }) -join ', ')" }
    }
    # WezTerm leaves its socket file behind when killed.
    Remove-Item -LiteralPath $run.socket -Force -ErrorAction SilentlyContinue
    $restored = foreach ($item in $run.state) {
        if ((Test-Path -LiteralPath $item.file) -and (Get-FileHash -LiteralPath $item.file).Hash -eq $item.hash) { continue }
        Copy-Item -LiteralPath "$stateDir\$(Split-Path $item.file -Leaf)" -Destination $item.file -Force
        if ((Get-FileHash -LiteralPath $item.file).Hash -ne $item.hash) { throw "Could not restore $($item.file)." }
        Split-Path $item.file -Leaf
    }
    if ($restored) { Write-Host "Restored $($restored -join ', ')." }
    Remove-Item -LiteralPath $stateDir -Recurse -Force -ErrorAction SilentlyContinue
    # Only a throwaway project -Start created; a -Project folder is the user's.
    if ($run.ownsProject) {
        Remove-Item -LiteralPath $run.project -Recurse -Force
        if (Test-Path -LiteralPath $run.project) { throw "Could not delete $($run.project)." }
    }
    Remove-Item -LiteralPath $currentFile -Force
    Write-Host "Stopped native test ($(if ($run.ownsProject) { 'deleted' } else { 'kept' }) $($run.project))."
    return
}

$run = readRun
if ($run -and (testRunAlive $run)) { throw "A native test is already running (wezterm-gui $($run.guiPid)). Run -Stop first." }
if ($run) {
    # A dead earlier run: drop its record and the throwaway project it made. Its state copies are too
    # old to restore safely, so they go too.
    if ($run.ownsProject) { Remove-Item -LiteralPath $run.project -Recurse -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $stateDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $currentFile -Force
}

if ($Build) {
    requireBunForCompile
    Push-Location "$srcRoot\packages\opencode"
    try { runNativeCommand bun @('run', $buildScript, '--single', '--native-only') 'Native build' }
    finally { Pop-Location }
}
if (-not $Exe) { $Exe = "$distFolder\opencode-native-windows-x64\bin\opencode.exe" }
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "Missing $Exe. Build it with -Build." }

$ownsProject = -not $Project
if ($ownsProject) {
    $Project = "$runRoot\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    New-Item -ItemType Directory -Path $Project | Out-Null
    runNativeCommand git @('-C', $Project, 'init', '-q') 'git init'
}
if (-not (Test-Path -LiteralPath $Project -PathType Container)) { throw "Missing project folder $Project." }

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$state = @($stateFiles | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
    Copy-Item -LiteralPath $_ -Destination $stateDir -Force
    [pscustomobject]@{ file = $_; hash = (Get-FileHash -LiteralPath $_).Hash }
})

# Start like a fresh WezTerm window: drop what this agent shell carries (oc, Claude Code, and the
# parent pane's WezTerm variables). WezTerm still overlays the user's registry environment.
Get-ChildItem Env: | Where-Object Name -match '^(OPENCODE|OC_|CLAUDE|WEZTERM_)|^(AGENT)$' |
    ForEach-Object { Remove-Item "Env:$($_.Name)" }

$quote = { param($value) '"' + $value + '"' }
$gui = Start-Process -FilePath 'wezterm-gui.exe' -PassThru -ArgumentList @(
    'start', '--always-new-process', '--cwd', (& $quote $Project), '--', (& $quote $Exe), (& $quote $Project)
)
$created = "$((getProcess $gui.Id).CreationDate.ToFileTimeUtc())"
$run = [pscustomobject]@{
    guiPid      = $gui.Id
    created     = $created
    socket      = "$socketDir\gui-sock-$($gui.Id)"
    paneId      = $null
    exe         = $Exe
    project     = $Project
    ownsProject = $ownsProject
    started     = (Get-Date).ToString('o')
    state       = $state
}
# Recorded before the wait, so -Stop can clean up a window that never listed a pane.
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
$run | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $currentFile
$deadline = (Get-Date).AddSeconds(30)
# Pane ids start at 0, so test for null.
while ($null -eq $run.paneId) {
    if (-not (testRunAlive $run)) { throw "wezterm-gui $($gui.Id) exited during startup." }
    if ((Get-Date) -gt $deadline) { throw "wezterm-gui $($gui.Id) never listed a pane; run -Stop to clean up." }
    Start-Sleep -Milliseconds 250
    if (-not (Test-Path -LiteralPath $run.socket)) { continue }
    $env:WEZTERM_UNIX_SOCKET = $run.socket
    $list = & wezterm cli --no-auto-start list --format json 2>$null
    if (-not $LASTEXITCODE -and $list) { $run.paneId = @(($list -join "`n") | ConvertFrom-Json)[0].pane_id }
}
$run | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $currentFile
$run | Select-Object -ExcludeProperty state | ConvertTo-Json
