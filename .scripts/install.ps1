[CmdletBinding()]
param(
    [Alias('b', 'nb')]
    [switch]$NoBuild,
    [switch]$SkipBunInstall,
    # Install one flavor only. Default installs oc (+ occ link, ocdebug) and native opencode.
    [switch]$Oc,
    [switch]$Native
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
assertExternalInstall -BuildCommand '.\.scripts\build.ps1' -InstallCommand '.\.scripts\install.ps1 -NoBuild'
if ($Oc -and $Native) { throw 'Use -Oc or -Native, not both.' }
$installOc = -not $Native
$installNative = -not $Oc
$ocBinary = "$distFolder\opencode-windows-x64\bin\oc.exe"
$nativeBinary = "$distFolder\opencode-native-windows-x64\bin\opencode.exe"
$debugBinary = "$distFolder\opencode-debug-windows-x64\bin\ocdebug.exe"
$cursorRuntime = "$distFolder\opencode-windows-x64\bin\cursor-runtime"
$processNames = @('opencode', 'oc', 'occ', 'ocdebug')
$running = @($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })
if ($running) {
    Write-Host 'Stopping running oc, opencode, and ocdebug processes...'
    $running | Stop-Process -Force
    $deadline = (Get-Date).AddSeconds(30)
    while (@($processNames | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue })) {
        if ((Get-Date) -gt $deadline) { throw 'oc, opencode, or ocdebug is still running after Stop-Process.' }
        Start-Sleep -Milliseconds 200
    }
}

if (-not $NoBuild) {
    $buildArgs = @()
    if ($SkipBunInstall) { $buildArgs += '-SkipInstall' }
    if ($Oc) { $buildArgs += '-Oc' }
    if ($Native) { $buildArgs += '-Native' }
    & (Join-Path $PSScriptRoot 'build.ps1') @buildArgs
}

$required = @()
if ($installOc) { $required += $ocBinary, $debugBinary }
if ($installNative) { $required += $nativeBinary }
foreach ($file in $required) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Built binary not found: $file. Run build.ps1 first." }
}
if ($installOc -and !(Test-Path -LiteralPath $cursorRuntime -PathType Container)) {
    throw "Packaged Cursor runtime not found: $cursorRuntime. Run build.ps1 first."
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$ocDestination = Join-Path $installDir 'oc.exe'
$occLink = Join-Path $installDir 'occ.exe'
$nativeDestination = Join-Path $installDir 'opencode.exe'
$debugDestination = Join-Path $installDir 'ocdebug.exe'
$obsoleteAliases = @('ocbug.exe', 'oc-debug.exe')

# Remove a name before writing it: copying onto a hard link also rewrites the file's other names
# (installs before the native split linked oc.exe and occ.exe to opencode.exe).
function replaceFile([string]$Source, [string]$Destination) {
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
    if (Test-Path -LiteralPath $Destination -PathType Leaf) { throw "Could not remove $Destination before install." }
    Copy-Item -LiteralPath $Source -Destination $Destination
}

# Timestamped rollback copy of the current install (U16). Only the newest 3 backups are kept.
$backupDir = Join-Path $installDir ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backupTargets = @($ocDestination, $occLink, $nativeDestination, $debugDestination)
$backedUp = @()
foreach ($target in $backupTargets) {
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
        Copy-Item -LiteralPath $target -Destination (Join-Path $backupDir ([IO.Path]::GetFileName($target)))
        $backedUp += $target
    }
}
foreach ($old in @(Get-ChildItem -LiteralPath $installDir -Directory -Filter 'backup-*' | Sort-Object Name -Descending | Select-Object -Skip 3)) {
    Remove-Item -LiteralPath $old.FullName -Recurse -Force
}

try {
    foreach ($alias in $obsoleteAliases) {
        $aliasPath = Join-Path $installDir $alias
        if (Test-Path -LiteralPath $aliasPath) { Remove-Item -LiteralPath $aliasPath -Force }
    }
    if ($installOc) {
        if (Test-Path -LiteralPath $occLink) { Remove-Item -LiteralPath $occLink -Force }
        if (Test-Path -LiteralPath $occLink -PathType Leaf) { throw "Could not remove $occLink before install." }
        replaceFile $ocBinary $ocDestination
        replaceFile $debugBinary $debugDestination
        Copy-Item -LiteralPath $cursorRuntime -Destination $installDir -Recurse -Force
        New-Item -ItemType HardLink -Path $occLink -Target $ocDestination -Force | Out-Null
        # Verify link identity with fsutil (hard-link count, not byte equality)
        $linkList = & fsutil hardlink list "$occLink" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "fsutil hardlink list failed for $occLink`: $linkList" }
        if (-not ($linkList -match '\\oc\.exe$')) { throw "Hard link verification failed: occ.exe not linked to $ocDestination" }
    }
    if ($installNative) { replaceFile $nativeBinary $nativeDestination }
    if (Test-Path -LiteralPath $nativeDestination) {
        $nativeLinks = @(& fsutil hardlink list "$nativeDestination" 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "fsutil hardlink list failed for $nativeDestination`: $nativeLinks" }
        if ($nativeLinks.Count -ne 1) { throw "opencode.exe still shares a file with: $($nativeLinks -join ', '). Run a full install." }
    }
} catch {
    foreach ($target in $backedUp) {
        $saved = Join-Path $backupDir ([IO.Path]::GetFileName($target))
        if (Test-Path -LiteralPath $saved -PathType Leaf) { Copy-Item -LiteralPath $saved -Destination $target -Force }
    }
    if ($backedUp -contains $occLink) {
        if (Test-Path -LiteralPath $occLink) { Remove-Item -LiteralPath $occLink -Force }
        New-Item -ItemType HardLink -Path $occLink -Target $ocDestination -Force | Out-Null
    }
    if ($_.Exception.Message -match 'being used by another process|cannot access') {
        Write-Host 'Install failed. A target executable is in use. Previous files were restored.' -ForegroundColor Red
        exit 1
    }
    throw
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
