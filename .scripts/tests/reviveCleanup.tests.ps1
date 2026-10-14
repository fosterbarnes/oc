#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$scripts = Split-Path $PSScriptRoot -Parent

foreach ($name in 'build.ps1', 'install.ps1', 'buildDebug.ps1', 'installDebug.ps1', '.runDebug.ps1', 'scriptHelper.ps1') {
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
}

# Retired entrypoints must fail before reaching any old build, process stop, or install logic.
foreach ($name in 'buildDebug.ps1', 'installDebug.ps1', '.runDebug.ps1') {
    $rejected = $false
    try { & (Join-Path $scripts $name) } catch {
        if ($_.Exception.Message -notlike 'ocdebug was retired.*') { throw }
        $rejected = $true
    }
    if (-not $rejected) { throw "$name did not reject its retired entrypoint." }
}
'Revive cleanup checks passed: script syntax, artifact references, retired entrypoints.'
