#requires -Version 7.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\scriptHelper.ps1"
Set-Location -LiteralPath $repoRoot

if (-not (Get-Command scc -ErrorAction SilentlyContinue)) {
    throw 'scc is not on PATH. Install scc, then re-run.'
}
$content = [IO.File]::ReadAllText($readme)
$pattern = '(?<=\[)[\d,]+(?=\]\(scc\.txt\))'
if ([regex]::Matches($content, $pattern).Count -ne 1) {
    throw 'README.md must contain exactly one [number](scc.txt) link.'
}
$tablePattern = '(?s)(?<=<!-- code-count:start -->).*?(?=<!-- code-count:end -->)'
if ([regex]::Matches($content, $tablePattern).Count -ne 1) {
    throw 'README.md must contain exactly one code-count:start/end marker pair.'
}

# Count maintained source, tests, and scripts; omit generated clients and the upstream checkout.
$output = & scc . --include-ext ts,tsx,js,mjs,cjs,css,html,astro,sql,ps1,sh,go,nix `
    --exclude-dir UPSTREAM,node_modules,dist,ts-dist,generated,generated-effect,gen `
    --no-size --no-complexity --no-cocomo --ci --sort name `
    --format-multi 'json:stdout,tabular:scc.txt'
if ($LASTEXITCODE) { throw "scc failed (exit $LASTEXITCODE)." }
$languages = @($output -join "`n" | ConvertFrom-Json)
$total = ($languages | Measure-Object -Property Code -Sum).Sum
if ($total -le 0) { throw 'scc returned no code lines.' }
$number = $total.ToString('N0', [cultureinfo]::InvariantCulture)
$newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
$columns = @('Count', 'Lines', 'Blank', 'Comment', 'Code')
$rows = @(
    '| Language | Files | Lines | Blanks | Comments | Code |'
    '|---|---:|---:|---:|---:|---:|'
    $languages | ForEach-Object {
        $language = $_
        '| {0} | {1} |' -f $language.Name, (($columns | ForEach-Object {
            $language.$_.ToString('N0', [cultureinfo]::InvariantCulture)
        }) -join ' | ')
    }
    '| **Total** | {0} |' -f (($columns | ForEach-Object {
        '**{0}**' -f ($languages | Measure-Object -Property $_ -Sum).Sum.ToString('N0', [cultureinfo]::InvariantCulture)
    }) -join ' | ')
)
$updated = [regex]::Replace($content, $pattern, $number)
$updated = [regex]::Replace($updated, $tablePattern, "$newline$newline$($rows -join $newline)$newline$newline")
if ($updated -ne $content) { [IO.File]::WriteAllText($readme, $updated) }
Write-Host "$number lines of code; README table and scc.txt refreshed."
