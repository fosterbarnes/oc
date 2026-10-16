param([Parameter(Mandatory)][string[]]$RunDirectory)
# Independent identity audit after a probe whose cleanup failed: lists every process recorded in
# the runs' results.json and *-samples.json that is still alive with the same CIM creation time.
$ErrorActionPreference = 'Stop'
$records = foreach ($dir in $RunDirectory) {
    $result = Get-Content -LiteralPath "$dir\results.json" -Raw | ConvertFrom-Json
    $result.topology
    $result.M6.processes
    foreach ($file in Get-ChildItem -LiteralPath $dir -Filter '*-samples.json') {
        $samples = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
        foreach ($sample in $samples) { foreach ($row in $sample) { $row } }
    }
}
$all = @(Get-CimInstance Win32_Process)
$left = @($records | Sort-Object pid,created -Unique | ForEach-Object {
    $record = $_
    $all | Where-Object { $_.ProcessId -eq $record.pid -and $_.CreationDate.ToFileTimeUtc().ToString() -eq $record.created } |
        ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; name = $_.Name; created = $_.CreationDate.ToFileTimeUtc().ToString() } }
})
"Owned processes left running: $($left.Count)"
if ($left.Count) { ConvertTo-Json -InputObject $left }
