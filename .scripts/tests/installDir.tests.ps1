#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$startDir = Get-Location
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'scriptHelper.ps1')
Set-Location -LiteralPath $startDir

$default = "$env:LOCALAPPDATA\Programs\oc"
$root = Join-Path ([IO.Path]::GetTempPath()) "installDirTest-$PID"
$ocOnly = Join-Path $root 'ocOnly'
$first = Join-Path $root 'first'
$second = Join-Path $root 'second'
try {
    # ocOnly mimics the OpenShift CLI or a dist bin folder: oc.exe without the occ.exe link.
    New-Item -ItemType File -Force -Path "$ocOnly\oc.exe", "$first\oc.exe", "$first\occ.exe", "$second\oc.exe", "$second\occ.exe" | Out-Null
    $cases = @(
        @{ Path = "$ocOnly"; Expected = $default; Name = 'oc.exe without occ.exe' }
        @{ Path = "$ocOnly;`"$first\`""; Expected = $first; Name = 'quoted entry with trailing backslash' }
        @{ Path = "$second;$first"; Expected = $second; Name = 'first matching entry wins' }
        @{ Path = ";;$root\missing;"; Expected = $default; Name = 'empty and missing entries' }
    )
    foreach ($case in $cases) {
        $actual = resolveInstallDir $case.Path
        if ($actual -ne $case.Expected) { throw "$($case.Name): expected $($case.Expected), got $actual" }
    }
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $root) { throw "Cleanup failed: $root" }
}
'Install dir checks passed: occ.exe required, entry trimming, PATH order, default fallback.'
