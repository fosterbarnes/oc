#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$scripts = Split-Path $PSScriptRoot -Parent

foreach ($name in 'build.ps1', 'install.ps1', 'scriptHelper.ps1') {
    $tokens = $null
    $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $scripts $name), [ref]$tokens, [ref]$errors
    )
    if ($errors.Count) { throw "$name parse failed: $($errors -join '; ')" }
    if ($name -eq 'install.ps1') {
        $debugSource = $ast.FindAll({
            param($node)
            $node -is [Management.Automation.Language.VariableExpressionAst] -and
                $node.VariablePath.UserPath -eq 'debugBinary'
        }, $true)
        if ($debugSource.Count) { throw 'Installer still references a removed debug build artifact.' }
    }
    if ($name -eq 'build.ps1' -and $ast.Extent.Text.Contains('--with-debug')) {
        throw 'Build wrapper still passes the removed debug flag.'
    }
    # The ocdebug flavor is gone; build and install scripts must not stop, back up, or name it.
    if ($ast.Extent.Text -match 'ocdebug') { throw "$name still references the removed ocdebug flavor." }
}
'Revive cleanup checks passed: script syntax, removed debug references.'
