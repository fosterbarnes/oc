param([int]$RootId, [string]$Created, [switch]$Cleanup, [switch]$StopRootOnly)
$ErrorActionPreference = 'Stop'
$root = Get-CimInstance Win32_Process -Filter "ProcessId=$RootId"
if (-not $root) { throw 'Owned root exited; cannot prove current descendants' }
if ($Created -and $root.CreationDate.ToFileTimeUtc().ToString() -ne $Created) { throw 'Owned root identity changed' }
$all = @(Get-CimInstance Win32_Process)
$tree = @($root)
for ($i = 0; $i -lt $tree.Count; $i++) {
    $parent = $tree[$i]
    $tree += @($all | Where-Object { $_.ParentProcessId -eq $parent.ProcessId -and $_.CreationDate -ge $parent.CreationDate })
}
if ($StopRootOnly) {
    $live = Get-CimInstance Win32_Process -Filter "ProcessId=$RootId"
    if (-not $live) { throw 'Owned root already exited' }
    if ($Created -and $live.CreationDate.ToFileTimeUtc().ToString() -ne $Created) { throw 'Owned root identity changed' }
    $stopped = Stop-Process -Id $RootId -Force -PassThru
    if ($stopped -and -not $stopped.WaitForExit(10000)) { throw "Owned root did not exit: $RootId" }
    if (Get-CimInstance Win32_Process -Filter "ProcessId=$RootId") {
        $again = Get-CimInstance Win32_Process -Filter "ProcessId=$RootId"
        if ($again -and $again.CreationDate -eq $live.CreationDate) { throw "Owned root survived: $RootId" }
    }
    'root stopped'
    exit
}
if ($Cleanup) {
    [array]::Reverse($tree)
    foreach ($item in $tree) {
        $live = Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ProcessId)"
        if (-not $live) { continue }
        if ($live.CreationDate -ne $item.CreationDate) { throw "Identity changed: $($item.ProcessId)" }
        try {
            $stopped = Stop-Process -Id $item.ProcessId -Force -PassThru
            if ($stopped -and -not $stopped.WaitForExit(10000)) { throw "Owned process did not exit: $($item.ProcessId)" }
        } catch {
            if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw }
            if (Get-CimInstance Win32_Process -Filter "ProcessId=$($item.ProcessId)") { throw }
        }
    }
    @($tree | ForEach-Object {
        $live = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.ProcessId)"
        if ($live -and $live.CreationDate -eq $_.CreationDate) { throw "Owned process survived: $($_.ProcessId)" }
    })
    'cleanup verified'
    exit
}
@($tree | ForEach-Object {
    [pscustomobject]@{
        pid = $_.ProcessId
        parent = $_.ParentProcessId
        created = $_.CreationDate.ToFileTimeUtc().ToString()
        name = $_.Name
        command = $_.CommandLine
        cpuSeconds = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000000
        privateMB = [double]$_.PrivatePageCount / 1MB
        writeBytes = [double]$_.WriteTransferCount
        timeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
}) | ConvertTo-Json -Depth 4 -Compress
