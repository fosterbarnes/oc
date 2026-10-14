#requires -Version 7.0
param(
    [Alias('h')][switch]$Help,
    [Alias('n')][switch]$Native,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$AppLaunchArgs
)

throw 'ocdebug was retired. Use .scripts\.run.ps1 [-Native] for a development run.'
