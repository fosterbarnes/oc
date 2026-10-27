#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$runner = "$PSScriptRoot/../test.ps1"

function assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function assertRejected {
    param([hashtable]$Arguments, [string]$Message)
    try { & $runner @Arguments -DryRun | Out-Null } catch {
        assert ($_.Exception.Message -like "*$Message*") "Unexpected rejection: $_"
        return
    }
    throw "Expected rejection: $Message"
}

$before = (Get-Location).Path
$unit = @(& $runner -Category unit -DryRun)
assert ($unit.Count -gt 0) 'Unit category must select package suites.'
assert (@($unit | Where-Object Command -ne bun).Count -eq 0) 'Unit suites must use Bun.'
foreach ($check in $unit) {
    assert (Test-Path -LiteralPath $check.Directory -PathType Container) "Unit package is missing: $($check.Name)"
}
$providers = @(& $runner -Category providers -DryRun)
assert ($providers.Count -gt 0) 'Provider category must select the Cursor runtime.'
assert (@($providers | Where-Object Command -ne node).Count -eq 0) 'Providers must use Node.'
# Every package test folder must belong to a suite, so a new package cannot be silently skipped.
$suiteDirectories = @($unit + $providers | ForEach-Object Directory)
foreach ($testDirectory in Get-ChildItem -Path "$PSScriptRoot/../../src/packages/*/test", "$PSScriptRoot/../../src/packages/*/*/test" -Directory) {
    assert ($testDirectory.Parent.FullName -in $suiteDirectories) "No suite runs $($testDirectory.FullName)."
}
$generated = @(& $runner -Category generated -DryRun)
$all = @(& $runner -All -DryRun)
assert ($all.Count -eq $unit.Count + $providers.Count + 2 + $generated.Count) 'All must include package tests, HttpApi, typecheck, and generation steps.'
assert (@($all | Where-Object { $_.Name -eq 'httpapi' }).Count -eq 1) 'All must include HttpApi.'
assert (@($all | Where-Object { $_.Name -eq 'typecheck' }).Count -eq 1) 'All must include typecheck.'
assert (@(& $runner -Package core,core -DryRun).Count -eq 1) 'Duplicate selections must run once.'
assert (@(& $runner -Category unit,providers,unit -DryRun).Count -eq $unit.Count + $providers.Count) 'Categories must deduplicate.'

$filtered = @(& $runner -Package cursor-runtime -File test/main.test.mjs -Name '^forwardData preserves ordered data' -DryRun)
assert ($filtered.Count -eq 1) 'File selection must run one check.'
assert (($filtered[0].Arguments -join '|') -eq '--test|--test-name-pattern|^forwardData preserves ordered data|./test/main.test.mjs') 'Node filters must precede the exact file path.'
$bunFilter = @(& $runner -Package schema -File test/event.test.ts -Name 'event' -DryRun)
assert ($bunFilter[0].Arguments[-1] -eq './test/event.test.ts') 'Bun file selection must use an exact path.'
assert ($bunFilter[0].Arguments -contains '--test-name-pattern') 'Bun name filter is missing.'
assertRejected @{ Package = 'unknown' } 'Unknown package'
assertRejected @{ Package = 'schema'; Fiel = 'test/event.test.ts' } "parameter name 'Fiel'"
assertRejected @{ Package = 'core'; All = $true } 'not a combination'
assertRejected @{ File = 'test/main.test.mjs' } 'exactly one'
assertRejected @{ Package = @('core', 'schema'); Name = 'event' } 'exactly one'
assertRejected @{ Package = 'core'; File = '../schema/test/event.test.ts' } 'inside the selected package'
assertRejected @{ Package = 'core'; File = 'missing.test.ts' } 'does not exist'
assert ((Get-Location).Path -eq $before) 'Dry runs must not change the working directory.'

$watcher = $env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER
$actions = $env:GITHUB_ACTIONS
& $runner -Package cursor-runtime -File test/main.test.mjs -Name '^forwardData preserves ordered data'
assert ((Get-Location).Path -eq $before) 'Successful checks must restore the working directory.'
assert ($env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER -eq $watcher) 'Successful checks must restore watcher settings.'
assert ($env:GITHUB_ACTIONS -eq $actions) 'Successful checks must restore Actions settings.'

& $runner -Package schema -File test/event.test.ts
assert ((Get-Location).Path -eq $before) 'Bun checks must restore the working directory.'
assert ($env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER -eq $watcher) 'Bun checks must restore watcher settings.'
assert ($env:GITHUB_ACTIONS -eq $actions) 'Bun checks must restore Actions settings.'

# Create only our own marker, then prove generation refuses it without overwriting it.
$marker = "$PSScriptRoot/../../src/packages/sdk/runnerCheck-$([Guid]::NewGuid()).txt"
[IO.File]::WriteAllText($marker, 'local runner check')
try {
    $blocked = $false
    try { & $runner -Category generated } catch {
        assert ($_.Exception.Message -like '*output paths have local changes*') 'Generation must reject dirty outputs.'
        $blocked = $true
    }
    assert $blocked 'Generation must not start with dirty outputs.'
    assert ([IO.File]::ReadAllText($marker) -eq 'local runner check') 'Generation must preserve local edits.'
} finally {
    [IO.File]::Delete($marker)
}
assert ((Get-Location).Path -eq $before) 'Generation preflight must restore the working directory.'

# An invalid native regex proves runner errors propagate without executing a test body.
$rejected = $false
try {
    & $runner -Package cursor-runtime -File test/main.test.mjs -Name '['
} catch {
    assert ($_.Exception.Message -like '*failed (exit *') 'Native failure must include its exit code.'
    $rejected = $true
}
assert $rejected 'Native failure must fail the runner.'
assert ((Get-Location).Path -eq $before) 'Failed checks must restore the working directory.'
assert ($env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER -eq $watcher) 'Failed checks must restore watcher settings.'
assert ($env:GITHUB_ACTIONS -eq $actions) 'Failed checks must restore Actions settings.'
Write-Host 'Local runner checks passed.'
