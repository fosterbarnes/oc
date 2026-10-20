# Stops every oc/opencode, Claude, ChatGPT, Codex, and Cursor process plus everything they started, and
# logs what was running so resource leaks can be traced. oc's /killall and /procReport copy this file to
# oc's data folder and run it in its own console (it stops the oc that launched it); the profile's killai
# function runs it directly. -ReportOnly writes the log and stops nothing.
param([switch]$ReportOnly, [switch]$Yes, [switch]$Pause)
$ErrorActionPreference = 'Stop'

$ROOT_NAME = '^(oc|occ|opencode.*|claude|chatgpt|codex.*|cursor.*)\.exe$'
# npm-installed CLIs and `bun run` dev copies of oc show up as node.exe/bun.exe.
$ROOT_COMMAND = '@anthropic-ai[\\/]claude-code|@openai[\\/]codex|cursor-agent|packages[\\/]opencode[\\/]src[\\/]index\.ts'
$OC_NAME = '^(oc|occ|opencode.*)\.exe$'
# oc's Claude provider passes --mcp-config from %TEMP%\opencode-claude-code-<oc server pid>.
$OWNER_DIR = 'opencode-claude-code-(\d+)'
$IDLE_CPU_MS = 20
$HANDLE_WARN = 10000

$logDir = Join-Path $env:LOCALAPPDATA 'oc\killall'
$null = New-Item -ItemType Directory -Force -Path $logDir
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir "killall-$stamp.log"
$jsonPath = Join-Path $logDir "killall-$stamp.json"

function Log([string]$line = '') { Add-Content -LiteralPath $logPath -Value $line; Write-Host $line }
function Detail([string]$line = '') { Add-Content -LiteralPath $logPath -Value $line }
function Finish([int]$code) {
    Write-Host "Log: $logPath"
    if ($Pause) { $null = Read-Host 'Press Enter to close' }
    exit $code
}

trap {
    Log "ERROR: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))"
    Finish 1
}

# Identity is PID plus creation time: Windows reuses PIDs, so every parent link and stop checks both.
function Snapshot {
    $map = @{}
    foreach ($p in Get-CimInstance Win32_Process) {
        $map[[int]$p.ProcessId] = [pscustomobject]@{
            pid = [int]$p.ProcessId
            parentPid = [int]$p.ParentProcessId
            name = $p.Name
            created = $p.CreationDate
            createdTicks = if ($p.CreationDate) { $p.CreationDate.ToFileTimeUtc() } else { 0 }
            executable = $p.ExecutablePath
            command = $p.CommandLine
            privateMB = [math]::Round($p.PrivatePageCount / 1MB)
            workingSetMB = [math]::Round($p.WorkingSetSize / 1MB)
            handles = [int]$p.HandleCount
            threads = [int]$p.ThreadCount
            cpuMs = [long](($p.KernelModeTime + $p.UserModeTime) / 10000)
            cpuDeltaMs = $null
            depth = 0
            tree = 0
            notes = [System.Collections.Generic.List[string]]::new()
            result = $null
        }
    }
    $map
}

function Memory {
    $m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
    [pscustomobject]@{
        commitGB = [math]::Round($m.CommittedBytes / 1GB, 1)
        limitGB = [math]::Round($m.CommitLimit / 1GB, 1)
        availableGB = [math]::Round($m.AvailableBytes / 1GB, 1)
        pagedPoolGB = [math]::Round($m.PoolPagedBytes / 1GB, 1)
        nonpagedPoolGB = [math]::Round($m.PoolNonpagedBytes / 1GB, 1)
    }
}

function ParentOf($p, $map) {
    $parent = $map[$p.parentPid]
    if (-not $parent -or $parent.pid -eq $p.pid -or $parent.createdTicks -gt $p.createdTicks) { return $null }
    $parent
}

function IsRoot($p) { $p.name -match $ROOT_NAME -or ($p.command -and $p.command -match $ROOT_COMMAND) }

function Age($p) {
    if (-not $p.created) { return '?' }
    $span = (Get-Date) - $p.created
    '{0}d {1:hh\:mm}' -f $span.Days, $span
}

function Format-Process($p) {
    $idle = if ($null -eq $p.cpuDeltaMs) { '' } elseif ($p.cpuDeltaMs -lt $IDLE_CPU_MS) { '  idle' } else { "  busy $($p.cpuDeltaMs) ms/2s" }
    $notes = if ($p.notes.Count) { '  [' + ($p.notes -join '; ') + ']' } else { '' }
    $result = if ($p.result) { "  -> $($p.result)" } else { '' }
    '{0}{1} {2}  ppid {3}  priv {4} MB  ws {5} MB  handles {6}  threads {7}  cpu {8:N0} s  age {9}{10}{11}{12}' -f `
    ('  ' * $p.depth), $p.name, $p.pid, $p.parentPid, $p.privateMB, $p.workingSetMB, $p.handles, $p.threads,
    ($p.cpuMs / 1000), (Age $p), $idle, $notes, $result
}

# .NET errors arrive wrapped in "Exception calling ..."; the inner message is the actual cause.
function Reason($record) {
    $inner = $record.Exception.InnerException
    if ($inner) { return $inner.Message }
    $record.Exception.Message
}

function Stop-Identity($p) {
    $target = Get-Process -Id $p.pid -ErrorAction Ignore
    if (-not $target) { return 'already exited' }
    # Holding the handle pins the PID; the CIM check after it proves it is still the same process.
    try { $null = $target.Handle } catch { return "failed: $(Reason $_)" }
    if ($target.HasExited) { return 'already exited' }
    $live = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.pid)"
    if (-not $live) { return 'already exited' }
    if ($live.CreationDate.ToFileTimeUtc() -ne $p.createdTicks) { return 'skipped: PID now belongs to another process' }
    try { $target.Kill() } catch {
        if ($target.HasExited) { return 'already exited' }
        return "failed: $(Reason $_)"
    }
    if (-not $target.WaitForExit(5000)) { return 'failed: still running after 5 s' }
    'stopped'
}

# --- Snapshot -----------------------------------------------------------------------------------

$memBefore = Memory
$before = Snapshot
$beforeAt = Get-Date
$children = @{}
foreach ($p in $before.Values) {
    $parent = ParentOf $p $before
    if (-not $parent) { continue }
    if (-not $children.ContainsKey($parent.pid)) { $children[$parent.pid] = [System.Collections.Generic.List[object]]::new() }
    $children[$parent.pid].Add($p)
}

# Keep this script, its console, and the shells above it up to the first oc/AI process, so the run
# can finish and write its log. Nothing below a kept process is walked into.
$keep = @{}
$stack = [System.Collections.Generic.Stack[object]]::new()
$stack.Push($before[$PID])
while ($stack.Count) {
    $p = $stack.Pop()
    $keep[$p.pid] = $true
    foreach ($c in $children[$p.pid]) { $stack.Push($c) }
}
$cursor = ParentOf $before[$PID] $before
while ($cursor -and -not (IsRoot $cursor)) {
    $keep[$cursor.pid] = $true
    $cursor = ParentOf $cursor $before
}

# Claude worker temp dirs whose oc server is gone name dead oc PIDs; children still pointing at
# such a PID were left behind by that oc (MCP servers and other helpers no name pattern catches).
$deadOwners = @{}
$tempDirs = @(Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'opencode-claude-code-*')
foreach ($dir in $tempDirs) {
    if ($dir.Name -notmatch "^$OWNER_DIR$") { continue }
    $owner = $before[[int]$Matches[1]]
    $alive = $owner -and $owner.name -match $OC_NAME -and $owner.created -le $dir.CreationTime
    if (-not $alive) { $deadOwners[[int]$Matches[1]] = $dir }
}

$members = @{}
$queue = [System.Collections.Generic.Queue[object]]::new()
foreach ($p in $before.Values) {
    if ($keep.ContainsKey($p.pid)) { continue }
    $dead = $deadOwners[$p.parentPid]
    $orphan = $dead -and -not (ParentOf $p $before) -and $p.created -ge $dead.CreationTime.AddMinutes(-1)
    if ($orphan) { $p.notes.Add("left behind by exited oc $($p.parentPid)") }
    if (-not ($orphan -or (IsRoot $p))) { continue }
    $members[$p.pid] = $p
    $queue.Enqueue($p)
}
while ($queue.Count) {
    $p = $queue.Dequeue()
    foreach ($c in $children[$p.pid]) {
        if ($keep.ContainsKey($c.pid) -or $members.ContainsKey($c.pid)) { continue }
        $members[$c.pid] = $c
        $queue.Enqueue($c)
    }
}

# Two seconds of CPU time tell idle workers from busy ones.
Start-Sleep -Seconds 2
$sample = Snapshot
$sampleMs = ((Get-Date) - $beforeAt).TotalMilliseconds
foreach ($p in $before.Values) {
    $later = $sample[$p.pid]
    if ($later -and $later.createdTicks -eq $p.createdTicks) { $p.cpuDeltaMs = $later.cpuMs - $p.cpuMs }
}

# Trees in parent-first order; a member whose parent is not a member starts a tree.
$ordered = [System.Collections.Generic.List[object]]::new()
function Walk($p, [int]$depth, [int]$tree) {
    $p.depth = $depth
    $p.tree = $tree
    $ordered.Add($p)
    foreach ($c in $children[$p.pid] | Sort-Object createdTicks) {
        if ($members.ContainsKey($c.pid)) { Walk $c ($depth + 1) $tree }
    }
}
$tops = @($members.Values | Where-Object { -not ((ParentOf $_ $before) -and $members.ContainsKey($_.parentPid)) } |
    Sort-Object createdTicks)
foreach ($top in $tops) { Walk $top 0 $top.pid }

# --- Findings -----------------------------------------------------------------------------------

$issues = [System.Collections.Generic.List[string]]::new()
$commitPct = [math]::Round(100 * $memBefore.commitGB / $memBefore.limitGB)
if ($commitPct -ge 80) { $issues.Add("Commit charge at $commitPct% of the limit: allocations start failing near 100%.") }

# Claude workers of an exited oc are reported with their owner below.
foreach ($top in $tops) {
    if ($top.notes.Count -or (ParentOf $top $before) -or $top.command -match $OWNER_DIR) { continue }
    $expected = if ($top.command -match '\bserve\b') { ' (normal for the oc server, which starts detached)' } else { '' }
    $top.notes.Add("parent $($top.parentPid) exited")
    $issues.Add("$($top.name) $($top.pid): parent $($top.parentPid) exited$expected.")
}

$servers = @($ordered | Where-Object { $_.name -match $OC_NAME -and $_.command -match '\bserve\b' })
if ($servers.Count -gt 1) { $issues.Add("$($servers.Count) oc servers running: $(($servers | ForEach-Object pid) -join ', ').") }

foreach ($p in $ordered) {
    $service = if ($before[$p.parentPid].name -eq 'services.exe') {
        Get-CimInstance Win32_Service -Filter "ProcessId=$($p.pid)" | Select-Object -First 1
    }
    if ($service) { $p.notes.Add("service $($service.Name)") }
    if ($p.handles -gt $HANDLE_WARN) { $issues.Add("$($p.name) $($p.pid) holds $($p.handles) handles.") }
}
foreach ($p in $ordered | Where-Object { $_.notes -match '^left behind' }) {
    $issues.Add("$($p.name) $($p.pid) ($($p.privateMB) MB): $($p.notes[0]).")
}

# Claude workers grouped by the oc server that owns them.
$workers = @($ordered | Where-Object { $_.name -eq 'claude.exe' -and $_.command -match $OWNER_DIR })
foreach ($w in $workers) {
    $null = $w.command -match $OWNER_DIR
    $w | Add-Member -NotePropertyName owner -NotePropertyValue ([int]$Matches[1])
    $resume = if ($w.command -match '--resume\s+(\S+)') { "resume $($Matches[1])" } else { 'new session' }
    $w.notes.Add("worker of oc $($w.owner), $resume")
    if ($deadOwners.ContainsKey($w.owner)) {
        $issues.Add("claude.exe $($w.pid) ($($w.privateMB) MB) belongs to oc $($w.owner), which exited.")
    }
}
$serverLines = foreach ($group in $workers | Group-Object owner) {
    $idle = @($group.Group | Where-Object { $null -ne $_.cpuDeltaMs -and $_.cpuDeltaMs -lt $IDLE_CPU_MS })
    $idleMB = ($idle | Measure-Object privateMB -Sum).Sum
    if ($idle.Count -ge 2) {
        $issues.Add("oc $($group.Name) keeps $($idle.Count) claude.exe workers that used no CPU in 2 s, holding " +
            "$idleMB MB (idleProcessTimeoutMs is off by default; the cap is 16 workers).")
    }
    'oc {0}: {1} claude.exe workers, {2} MB private, {3} idle ({4} MB)' -f $group.Name, $group.Count,
    ($group.Group | Measure-Object privateMB -Sum).Sum, $idle.Count, [int]$idleMB
}

$staleDirs = @($deadOwners.Values)
if ($staleDirs.Count) { $issues.Add("$($staleDirs.Count) Claude temp folders from exited oc servers: $($staleDirs.Name -join ', ').") }

# --- Report -------------------------------------------------------------------------------------

$os = Get-CimInstance Win32_OperatingSystem
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
$systemLog = Get-WinEvent -ListLog System
$oldest = Get-WinEvent -LogName System -MaxEvents 1 -Oldest
$shutdowns = try {
    @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41, 1001, 6008; StartTime = (Get-Date).AddDays(-30) })
} catch {
    if ($_.Exception.Message -notmatch 'No events were found') { throw }
    @()
}
$totalPrivate = ($ordered | Measure-Object privateMB -Sum).Sum
$totalWorkingSet = ($ordered | Measure-Object workingSetMB -Sum).Sum
$allPrivateGB = [math]::Round(($before.Values | Measure-Object privateMB -Sum).Sum / 1KB, 1)
# What commit holds besides process memory and kernel pools: shared memory, driver allocations, and the like.
$restGB = [math]::Max(0, [math]::Round($memBefore.commitGB - $allPrivateGB - $memBefore.pagedPoolGB - $memBefore.nonpagedPoolGB, 1))
$uptime = (Get-Date) - $os.LastBootUpTime
$cores = [Environment]::ProcessorCount

Log ("oc killall  {0:yyyy-MM-dd HH:mm:ss}  mode: {1}" -f (Get-Date), $(if ($ReportOnly) { 'report only' } else { 'stop' }))
Log ("Boot: {0:yyyy-MM-dd HH:mm} (up {1}d {2:hh\:mm})  elevated: {3}" -f $os.LastBootUpTime, $uptime.Days, $uptime,
    $(if ($elevated) { 'yes' } else { 'no (services and elevated processes cannot be stopped or fully read)' }))
Log ("Commit: {0} / {1} GB ({2}%)  available RAM: {3} GB" -f $memBefore.commitGB, $memBefore.limitGB, $commitPct, $memBefore.availableGB)
Log ("  all processes' private memory {0} GB, kernel paged pool {1} GB, nonpaged pool {2} GB, rest about {3} GB" -f
    $allPrivateGB, $memBefore.pagedPoolGB, $memBefore.nonpagedPoolGB, $restGB)
Log ("System log: {0} events, oldest {1:yyyy-MM-dd}; crash/unexpected shutdown events (41, 1001, 6008) in 30 days: {2}" -f
    $systemLog.RecordCount, $oldest.TimeCreated, $shutdowns.Count)
foreach ($e in $shutdowns) { Log ("  {0:yyyy-MM-dd HH:mm}  id {1}  {2}" -f $e.TimeCreated, $e.Id, $e.ProviderName) }
Log ("Targets: {0} processes in {1} trees, {2} MB private, {3} MB working set" -f $ordered.Count, $tops.Count, $totalPrivate, $totalWorkingSet)
Log

Log 'Top 15 by private memory (all processes, * = target)'
foreach ($p in $before.Values | Sort-Object privateMB -Descending | Select-Object -First 15) {
    $mark = if ($members.ContainsKey($p.pid)) { '*' } else { ' ' }
    Log ('{0} {1,7} MB  {2} {3}' -f $mark, $p.privateMB, $p.name, $p.pid)
}
Log

Log ("Top 10 by CPU over a {0:N1} s sample (% of all {1} logical cores, * = target)" -f ($sampleMs / 1000), $cores)
$busiest = $before.Values | Where-Object { $_.pid -ne 0 -and $_.cpuDeltaMs -gt 0 } |
    Sort-Object cpuDeltaMs -Descending | Select-Object -First 10
foreach ($p in $busiest) {
    $mark = if ($members.ContainsKey($p.pid)) { '*' } else { ' ' }
    Log ('{0} {1,6:N1}%  {2} {3}' -f $mark, (100 * $p.cpuDeltaMs / ($sampleMs * $cores)), $p.name, $p.pid)
}
Log

Log 'Claude workers by oc server'
if ($serverLines) { foreach ($line in $serverLines) { Log "  $line" } } else { Log '  none' }
Log

Log "Issues ($($issues.Count))"
foreach ($issue in $issues) { Log "  - $issue" }
Log

Detail 'Process trees (idle = under 20 ms CPU in a 2 s sample)'
foreach ($p in $ordered) {
    Detail (Format-Process $p)
    $command = if ($p.command) { $p.command } else { $p.executable }
    if ($command) { Detail ('{0}    {1}' -f ('  ' * $p.depth), $command) }
}
Detail
Detail "Kept (runs this script): $(($keep.Keys | ForEach-Object { "$($before[$_].name) $_" }) -join ', ')"
Detail

function Write-Json($extra) {
    $data = [ordered]@{
        time = Get-Date -Format o
        mode = $(if ($ReportOnly) { 'report' } else { 'stop' })
        memoryBefore = $memBefore
        allProcessesPrivateGB = $allPrivateGB
        issues = $issues
        processes = @($ordered | Select-Object pid, parentPid, tree, depth, name, executable, command, privateMB,
            workingSetMB, handles, threads, cpuMs, cpuDeltaMs, @{ n = 'created'; e = { $_.created.ToString('o') } },
            @{ n = 'notes'; e = { @($_.notes) } }, result)
    }
    foreach ($key in $extra.Keys) { $data[$key] = $extra[$key] }
    $data | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $jsonPath
}
Write-Json @{}

if ($ReportOnly) { Finish 0 }
if ($ordered.Count -eq 0) { Log 'Nothing to stop.'; Finish 0 }

if (-not $Yes) {
    $answer = Read-Host "Stop these $($ordered.Count) processes ($totalPrivate MB private)? Type yes"
    if ($answer -ne 'yes') { Log 'Cancelled: nothing stopped.'; Finish 0 }
}

# --- Stop ---------------------------------------------------------------------------------------

Detail 'Stop results (children first)'
foreach ($p in $ordered | Sort-Object depth -Descending -Stable) {
    $p.result = Stop-Identity $p
    $service = $p.notes -match '^service ' | Select-Object -First 1
    if ($service -and $p.result -like 'failed:*') { $p.result += " (stop it from an elevated PowerShell: Stop-Service $($service -replace '^service '))" }
    Detail "  $($p.name) $($p.pid): $($p.result)"
    if ($p.result -notin 'stopped', 'already exited') { Write-Host "  $($p.name) $($p.pid): $($p.result)" }
}

Start-Sleep -Seconds 3
$after = Snapshot
$memAfter = Memory
$survivors = @($ordered | Where-Object { $a = $after[$_.pid]; $a -and $a.createdTicks -eq $_.createdTicks })
$respawned = @($after.Values | Where-Object {
        $old = $before[$_.pid]
        (-not $old -or $old.createdTicks -ne $_.createdTicks) -and -not $keep.ContainsKey($_.pid) -and (IsRoot $_)
    })

Log
Log ('Stopped: {0}  already exited: {1}  failed or skipped: {2}' -f @($ordered | Where-Object result -eq 'stopped').Count,
    @($ordered | Where-Object result -eq 'already exited').Count,
    @($ordered | Where-Object { $_.result -notin 'stopped', 'already exited' }).Count)
Log ('Commit after: {0} / {1} GB ({2:N1} GB freed)  available RAM: {3} GB' -f $memAfter.commitGB, $memAfter.limitGB,
    ($memBefore.commitGB - $memAfter.commitGB), $memAfter.availableGB)
foreach ($p in $survivors) { Log "  Still running: $($p.name) $($p.pid)" }
foreach ($p in $respawned) { Log "  Started again: $($p.name) $($p.pid) (parent $($p.parentPid) $($after[$p.parentPid].name))" }

Write-Json @{
    memoryAfter = $memAfter
    survivors = @($survivors | ForEach-Object pid)
    respawned = @($respawned | Select-Object pid, parentPid, name, command)
}
Finish 0
