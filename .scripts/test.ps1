#requires -Version 7.0
[CmdletBinding()]
param(
    [string[]]$Package,
    [string]$File,
    [string]$Name,
    [ValidateSet('unit', 'providers', 'httpapi', 'typecheck', 'generated')]
    [string[]]$Category,
    [switch]$All,
    [switch]$List,
    [switch]$DryRun,
    [Alias('h')][switch]$Help
)
$ErrorActionPreference = 'Stop'

if ($Help -or (-not $Package -and -not $Category -and -not $All -and -not $List -and -not $File -and -not $Name)) {
    Write-Host @'
test.ps1 -Package schema [-File test/event.test.ts] [-Name 'test name regex']
test.ps1 -Category unit,providers | -All | -List
Add -DryRun to inspect commands without running them.
Categories: unit, providers, httpapi, typecheck, generated.
Generated checks rewrite output files and require those paths to be clean.
'@
    return
}

$root = Split-Path -Path $PSScriptRoot -Parent
$workspace = "$root/src"
# Keep this list aligned with the package suites you want to run locally.
$unit = @(
    'cli', 'client', 'codemode', 'console/app', 'console/core', 'console/function',
    'core', 'effect-drizzle-sqlite', 'function', 'http-recorder', 'httpapi-codegen',
    'llm', 'opencode', 'protocol', 'schema', 'sdk/js', 'session-ui', 'stats/core', 'tui', 'ui'
)
$providers = @{
    'cursor-runtime' = 'test/main.test.mjs'
}
$categories = @('unit', 'providers', 'httpapi', 'typecheck', 'generated')
if ($List) {
    Write-Host "Categories: $($categories -join ', ')"
    Write-Host "Unit packages: $($unit -join ', ')"
    Write-Host "Provider packages: $(($providers.Keys | Sort-Object) -join ', ')"
    return
}
if (($Package -and ($Category -or $All)) -or ($All -and $Category)) {
    throw 'Choose -Package, -Category, or -All, not a combination.'
}
if (($File -or $Name) -and (-not $Package -or $Package.Count -ne 1)) {
    throw '-File and -Name require exactly one -Package.'
}
foreach ($item in $Package) {
    if ($item -notin $unit -and -not $providers.ContainsKey($item)) {
        throw "Unknown package: $item. Use -List."
    }
}
$selectedCategories = if ($All) { $categories } else { @($Category) }
$selectedPackages = @(
    $Package
    if ('unit' -in $selectedCategories) { $unit }
    if ('providers' -in $selectedCategories) { $providers.Keys | Sort-Object }
) | Where-Object { $_ } | Select-Object -Unique

$checks = @(
    foreach ($item in $selectedPackages) {
        $directory = [IO.Path]::GetFullPath("$workspace/packages/$item")
        $testFile = if ($File) {
            $candidate = [IO.Path]::GetFullPath($File, $directory)
            if (-not $candidate.StartsWith("$directory$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::Ordinal)) {
                throw '-File must be inside the selected package.'
            }
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                throw "Test file does not exist: $candidate"
            }
            './' + [IO.Path]::GetRelativePath($directory, $candidate).Replace('\', '/')
        }
        $arguments = if ($providers.ContainsKey($item)) {
            @('--test')
            if ($Name) { '--test-name-pattern'; $Name }
            if ($testFile) { $testFile } else { $providers[$item] }
        } else {
            @('test', '--timeout', '30000', '--only-failures')
            if ($Name) { '--test-name-pattern'; $Name }
            if ($testFile) { $testFile }
        }
        [pscustomobject]@{
            Name = $item
            Category = if ($providers.ContainsKey($item)) { 'providers' } else { 'unit' }
            Directory = $directory
            Command = if ($providers.ContainsKey($item)) { 'node' } else { 'bun' }
            Arguments = @($arguments)
        }
    }
    if ('httpapi' -in $selectedCategories) {
        [pscustomobject]@{ Name = 'httpapi'; Category = 'httpapi'; Directory = "$workspace/packages/opencode"; Command = 'bun'; Arguments = @('run', 'test:httpapi') }
    }
    if ('typecheck' -in $selectedCategories) {
        [pscustomobject]@{ Name = 'typecheck'; Category = 'typecheck'; Directory = $workspace; Command = 'bun'; Arguments = @('run', 'typecheck', '--continue=always') }
    }
    if ('generated' -in $selectedCategories) {
        [pscustomobject]@{ Name = 'generated client'; Category = 'generated'; Directory = "$workspace/packages/client"; Command = 'bun'; Arguments = @('run', 'generate') }
        [pscustomobject]@{ Name = 'generated sdk'; Category = 'generated'; Directory = $workspace; Command = 'bun'; Arguments = @('packages/sdk/js/script/build.ts') }
        [pscustomobject]@{ Name = 'generated OpenAPI'; Category = 'generated'; Directory = $workspace; Command = 'bun'; Arguments = @('run', '--cwd', 'packages/opencode', 'dev', 'generate'); Output = "$workspace/packages/sdk/openapi.json" }
        [pscustomobject]@{ Name = 'format OpenAPI'; Category = 'generated'; Directory = $workspace; Command = 'bun'; Arguments = @('prettier', '--write', 'packages/sdk/openapi.json') }
        [pscustomobject]@{ Name = 'generated tracked files'; Category = 'generated'; Directory = $root; Command = 'git'; Arguments = @('diff', 'HEAD', '--exit-code', '--', 'src/packages/client/src/generated', 'src/packages/client/src/generated-effect', 'src/packages/sdk') }
        [pscustomobject]@{ Name = 'generated untracked files'; Category = 'generated'; Directory = $root; Command = 'git'; Arguments = @('ls-files', '--others', '--exclude-standard', '--', 'src/packages/client/src/generated', 'src/packages/client/src/generated-effect', 'src/packages/sdk'); RequireEmpty = $true }
    }
)
if ($DryRun) { return $checks }

foreach ($check in $checks) {
    if (-not (Test-Path -LiteralPath $check.Directory -PathType Container)) {
        throw "Missing check directory: $($check.Directory)"
    }
    if (-not (Get-Command $check.Command -ErrorAction SilentlyContinue)) {
        throw "$($check.Command) is not on PATH."
    }
}

$watcher = $env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER
$actions = $env:GITHUB_ACTIONS
Push-Location -LiteralPath $root
try {
    . "$PSScriptRoot/scriptHelper.ps1"
    Set-Location -LiteralPath $root
    if ('generated' -in $selectedCategories) {
        Write-Host 'Generated checks rewrite output files; any resulting changes will be left for inspection.'
        $dirty = & git status --porcelain --untracked-files=all -- src/packages/client/src/generated src/packages/client/src/generated-effect src/packages/sdk
        if ($LASTEXITCODE) { throw "Generated output preflight failed (exit $LASTEXITCODE)." }
        if ($dirty) { throw 'Generated output paths have local changes. Commit or move them before running generated checks.' }
    }
    foreach ($check in $checks) {
        Set-Location -LiteralPath $check.Directory
        Write-Host "Running $($check.Name) [$($check.Category)]"
        if ($check.Category -eq 'unit') {
            $env:GITHUB_ACTIONS = 'false'
            $env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = if ($IsWindows) { 'true' } else { 'false' }
        }
        $commandArguments = $check.Arguments
        if ($check.Output) {
            & $check.Command @commandArguments | Set-Content -LiteralPath $check.Output -Encoding utf8NoBOM
        } elseif ($check.RequireEmpty) {
            $unexpected = & $check.Command @commandArguments
            if ($LASTEXITCODE) { throw "$($check.Name) failed (exit $LASTEXITCODE)." }
            if ($unexpected) { throw "Generated untracked files found:`n$($unexpected -join "`n")" }
        } else {
            runNativeCommand $check.Command $commandArguments $check.Name
        }
        if ($LASTEXITCODE) { throw "$($check.Name) failed (exit $LASTEXITCODE)." }
        $env:GITHUB_ACTIONS = $actions
        $env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = $watcher
    }
    Write-Host "Passed $($checks.Count) local checks."
} finally {
    $env:GITHUB_ACTIONS = $actions
    $env:OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = $watcher
    Pop-Location
}
closeOut 0
