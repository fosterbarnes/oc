#requires -Version 7.0
#requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'

function stopResidents {
    param([switch]$InspectOnly)

    $stateRoot = if ($env:XDG_STATE_HOME) { $env:XDG_STATE_HOME } else { Join-Path $HOME '.local\state' }
    $servers = @('opencode', 'opencode-debug') | ForEach-Object {
        $folder = Join-Path $stateRoot $_
        $file = Join-Path $folder 'oc-server.json'
        if (-not (Test-Path -LiteralPath $file)) { return }
        $state = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        if (-not $state.pid -or -not (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) { return }
        if ($state.hostname -notin @('127.0.0.1', 'localhost', '::1')) {
            throw "Refusing non-loopback resident address for $_."
        }
        $secret = [IO.File]::ReadAllText((Join-Path $folder 'oc-server.secret')).Trim()
        $hostName = if ($state.hostname -eq '::1') { '[::1]' } else { $state.hostname }
        [pscustomobject]@{
            Pid = [int]$state.pid
            Url = "http://${hostName}:$($state.port)"
            Headers = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("opencode:$secret")) }
            Directories = @()
        }
    }

    foreach ($server in $servers) {
        $cursor = ''
        $directories = @()
        do {
            $response = Invoke-WebRequest "$($server.Url)/experimental/session?limit=100&archived=true$cursor" -Headers $server.Headers -TimeoutSec 10
            $directories += @($response.Content | ConvertFrom-Json | ForEach-Object { $_.directory })
            $next = $response.Headers['x-next-cursor']
            $cursor = if ($next) { '&cursor=' + [Uri]::EscapeDataString([string]$next[0]) } else { '' }
        } while ($cursor)
        $server.Directories = @($directories | Where-Object { $_ } | Sort-Object -Unique)
        foreach ($directory in $server.Directories) {
            $headers = $server.Headers + @{ 'x-opencode-directory' = [Uri]::EscapeDataString($directory) }
            $status = Invoke-RestMethod "$($server.Url)/session/status" -Headers $headers -TimeoutSec 10
            foreach ($entry in $status.PSObject.Properties) {
                if ($entry.Value.type -eq 'idle') { continue }
                if ($InspectOnly) { Write-Host "Active session $($entry.Name) in $directory"; continue }
                $null = Invoke-RestMethod "$($server.Url)/session/$($entry.Name)/abort" -Method Post -Headers $headers -TimeoutSec 30
            }
        }
    }
    if ($InspectOnly) { Write-Host "Inspected $(@($servers).Count) resident server(s)."; return }

    $deadline = (Get-Date).AddSeconds(30)
    do {
        $active = @(
            foreach ($server in $servers) {
                foreach ($directory in $server.Directories) {
                    $headers = $server.Headers + @{ 'x-opencode-directory' = [Uri]::EscapeDataString($directory) }
                    $status = Invoke-RestMethod "$($server.Url)/session/status" -Headers $headers -TimeoutSec 5
                    $status.PSObject.Properties | Where-Object { $_.Value.type -ne 'idle' }
                }
            }
        )
        if (-not $active) { break }
        if ((Get-Date) -ge $deadline) { throw 'Agent cancellation timed out.' }
        Start-Sleep -Milliseconds 200
    } while ($true)

    foreach ($server in $servers) {
        $null = Invoke-RestMethod "$($server.Url)/global/shutdown" -Method Post -Headers $server.Headers -TimeoutSec 30
        if (Get-Process -Id $server.Pid -ErrorAction SilentlyContinue) {
            Wait-Process -Id $server.Pid -Timeout 30 -ErrorAction Stop
        }
    }
}

$processNames = @('opencode.exe', 'opencode-debug.exe', 'oc.exe', 'occ.exe', 'ocdebug.exe', 'ocbug.exe', 'oc-debug.exe')
function getOpenCodeProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in $processNames -or
        ($_.Name -in @('bun.exe', 'node.exe') -and $_.CommandLine -match '(?i)(?:--cwd\s+[''\"]?(?:[^\s''\"]*[\\/])?packages[\\/]opencode|[\\/]packages[\\/]opencode[\\/]src[\\/]index\.ts)')
    }
}

if ($WhatIfPreference) {
    try { stopResidents -InspectOnly } catch { Write-Warning "Resident inspection failed: $_" }
    getOpenCodeProcesses | ForEach-Object { Write-Host "Would stop PID $($_.ProcessId): $($_.Name) $($_.CommandLine)" }
    return
}

try {
    stopResidents
} catch {
    Write-Warning "Graceful cancellation/shutdown failed; remaining OpenCode processes will be force-stopped: $_"
}

$deadline = (Get-Date).AddSeconds(10)
do {
    $running = @(getOpenCodeProcesses)
    if (-not $running) { break }
    foreach ($process in $running) {
        if ($PSCmdlet.ShouldProcess("$($process.Name) PID $($process.ProcessId)", 'Force stop')) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 200
} while ((Get-Date) -lt $deadline)

$remaining = @(getOpenCodeProcesses)
if ($remaining) {
    throw "Could not stop OpenCode processes: $(($remaining | ForEach-Object { "$($_.Name) PID $($_.ProcessId)" }) -join ', ')"
}
Write-Host 'All detected OpenCode processes have stopped.'
Get-Process -Name wezterm, wezterm-gui -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'WezTerm has stopped.'
