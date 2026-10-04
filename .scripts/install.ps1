[CmdletBinding()]
param(
    [Alias('b', 'nb')]
    [switch]$NoBuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
assertExternalInstall -BuildCommand '.\.scripts\build.ps1' -InstallCommand '.\.scripts\install.ps1 -NoBuild'
$binary = "$distFolder\opencode-windows-x64\bin\opencode.exe"
$debugBinary = "$distFolder\opencode-debug-windows-x64\bin\ocdebug.exe"
$runtime = "$distFolder\opencode-windows-x64\bin\agentify-runtime"
$cursorRuntime = "$distFolder\opencode-windows-x64\bin\cursor-runtime"
$processNames = @('opencode', 'oc', 'occ', 'ocdebug', 'ocbug')
$running = @($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })
if ($running) {
    Write-Host 'Stopping running opencode.exe and ocdebug.exe processes...'
    $running | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds(30)
    while (@($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })) {
        if ((Get-Date) -gt $deadline) { throw 'opencode.exe or ocdebug.exe is still running after Stop-Process.' }
        Start-Sleep -Milliseconds 200
    }
}

if (-not $NoBuild) {
    $buildArgs = if ($SkipInstall) { @('-SkipInstall') } else { @() }
    & (Join-Path $PSScriptRoot 'build.ps1') @buildArgs
}

if (!(Test-Path -LiteralPath $binary)) {
    throw "Built binary not found: $binary. Run build.ps1 first."
}
if (!(Test-Path -LiteralPath $debugBinary)) {
    throw "Debug binary not found: $debugBinary. Run build.ps1 first."
}
if (!(Test-Path -LiteralPath $runtime -PathType Container)) {
    throw "Packaged Agentify runtime not found: $runtime. Run build.ps1 first."
}
if (!(Test-Path -LiteralPath $cursorRuntime -PathType Container)) {
    throw "Packaged Cursor runtime not found: $cursorRuntime. Run build.ps1 first."
}

$installDir = 'C:\Users\user\Apps\opencode'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$destination = Join-Path $installDir 'opencode.exe'
$debugDestination = Join-Path $installDir 'ocdebug.exe'
$ocLink = Join-Path $installDir 'oc.exe'
$occLink = Join-Path $installDir 'occ.exe'
$obsoleteAliases = @('ocbug.exe', 'oc-debug.exe')
try {
    Copy-Item -LiteralPath $binary -Destination $destination -Force
    Copy-Item -LiteralPath $debugBinary -Destination $debugDestination -Force
    Copy-Item -LiteralPath $runtime -Destination $installDir -Recurse -Force
    Copy-Item -LiteralPath $cursorRuntime -Destination $installDir -Recurse -Force
    foreach ($alias in $obsoleteAliases) {
        $aliasPath = Join-Path $installDir $alias
        if (Test-Path -LiteralPath $aliasPath) { Remove-Item -LiteralPath $aliasPath -Force }
    }
    # Recreate hard links after every opencode.exe replacement
    foreach ($link in @($ocLink, $occLink)) {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
        New-Item -ItemType HardLink -Path $link -Target $destination -Force | Out-Null
    }
    # Verify link identity with fsutil (hard-link count, not byte equality)
    $hardLinkList = & fsutil hardlink list "$destination" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "fsutil hardlink list failed for $destination`: $hardLinkList" }
    foreach ($name in @('oc.exe', 'occ.exe')) {
        if (-not ($hardLinkList -match [regex]::Escape($name))) { throw "Hard link verification failed: $name not linked to $destination" }
    }
    foreach ($link in @($ocLink, $occLink)) {
        $linkList = & fsutil hardlink list "$link" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "fsutil hardlink list failed for $link`: $linkList" }
        if (-not ($linkList -match [regex]::Escape('opencode.exe'))) { throw "Hard link verification failed: opencode.exe not linked to $link" }
    }
} catch {
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        Write-Host 'Install failed. Target opencode.exe or ocdebug.exe is in use.' -ForegroundColor Red
        exit 1
    }
    throw
}

if (!(Test-Path -LiteralPath $debugDestination -PathType Leaf)) {
    throw "Installed debug executable not found: $debugDestination"
}

# Idempotent current-user PATH update
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $userPath) { $userPath = '' }
$normalized = $installDir.TrimEnd('\').ToLowerInvariant()
$hasPath = ($userPath -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() }) -contains $normalized
$currentPathHas = (($env:Path -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() }) -contains $normalized)
if (-not $hasPath) {
    $newUserPath = if (-not $userPath) { $installDir } elseif ($userPath.EndsWith(';')) { "$userPath$installDir" } else { "$userPath;$installDir" }
    [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
    Write-Host "Added $installDir to user PATH"
}
if (-not $currentPathHas) { $env:Path = "$installDir;$env:Path" }

