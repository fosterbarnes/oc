#requires -Version 7.0
# Runs claudeTestFlow against the real Claude model. This spends the Claude plan usage of the
# account behind the `claude setup-token` token (cost figures are API-equivalent):
#   default   token check + steps 0-8, about $0.20-1.00
#   -Step7    token check + step 7 only, about $0.05-0.15
#   -CheckOnly one Haiku reply, about $0.01
# Run it after a `claude` CLI update or a Claude provider change, not every session. Fake-model
# and pane tests are free. It always asks you to type yes before spending; there is no switch to
# skip that, so an agent cannot start a run without you at the keyboard.
# The token comes from, in order: CLAUDE_CODE_OAUTH_TOKEN in this shell, the saved copy, the
# clipboard, a masked prompt. It never reaches the console or history, and wrapped pastes are
# rejoined. A token that passes is saved DPAPI-encrypted (readable only by this Windows user on
# this machine).
[CmdletBinding()]
param(
    [switch]$CheckOnly,   # check the token, do not run the flow
    [switch]$NewToken,    # ignore the shell variable and the saved copy
    [switch]$Forget,      # delete the saved copy and stop
    [switch]$Step7,       # run only step 7 (model switch + file deletion), a few cents
    [string]$Model,       # flow model (OC_REAL_MODEL_ID, default claude-sonnet-5-5)
    [string]$SwitchModel  # step 7 model (OC_REAL_SWITCH_MODEL_ID, default claude-haiku-5-5)
)
$ErrorActionPreference = 'Stop'
# Not scriptHelper.ps1: it moves the caller's shell into src for good.
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$store = "$env:LOCALAPPDATA\oc\claudeFlowToken"
$tokenPattern = '^sk-ant-oat\d+-[A-Za-z0-9_-]{40,}$'

function readToken {
    if (-not $NewToken -and $env:CLAUDE_CODE_OAUTH_TOKEN) { return $env:CLAUDE_CODE_OAUTH_TOKEN.Trim(), 'CLAUDE_CODE_OAUTH_TOKEN' }
    if (-not $NewToken -and (Test-Path -LiteralPath $store)) {
        return (Get-Content -LiteralPath $store | ConvertTo-SecureString | ConvertFrom-SecureString -AsPlainText), 'the saved copy'
    }
    # The token prints wrapped over two lines; the clipboard keeps both halves, Read-Host only one.
    $clip = (Get-Clipboard -Raw) -replace '\s', ''
    if ($clip -match $tokenPattern) {
        Set-Clipboard -Value ' '
        return $clip, 'the clipboard'
    }
    return ((Read-Host -MaskInput 'Copy the token, then press Enter (or paste it here as one line)') -replace '\s', ''), 'the prompt'
}

# Sets env vars for a block and puts the previous values (or absence) back afterward.
function withEnv([hashtable]$values, [scriptblock]$body) {
    $before = @{}
    foreach ($name in $values.Keys) {
        $before[$name] = [Environment]::GetEnvironmentVariable($name)
        [Environment]::SetEnvironmentVariable($name, $values[$name])
    }
    try { & $body }
    finally { foreach ($name in $before.Keys) { [Environment]::SetEnvironmentVariable($name, $before[$name]) } }
}

# One Haiku reply in a temp config dir: proves the token logs in, for about a cent.
function testToken([string]$value) {
    $dir = Join-Path ([IO.Path]::GetTempPath()) "ocTokenCheck-$PID"
    New-Item -ItemType Directory -Force $dir | Out-Null
    Push-Location $dir
    try {
        $lines = withEnv @{
            CLAUDE_CONFIG_DIR              = "$dir\claude"
            CLAUDE_CODE_OAUTH_TOKEN        = $value
            CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1'
            DISABLE_AUTOUPDATER            = '1'
        } { & $claude -p 'Reply with the single word OK.' --model claude-haiku-5-5 --max-turns 1 --output-format json 2>&1 }
    }
    finally {
        Pop-Location
        Remove-Item -LiteralPath $dir -Recurse -Force
    }
    $result = $lines | Where-Object { "$_".StartsWith('{') } | Select-Object -Last 1 | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $result) { return @{ ok = $false; message = ($lines -join ' ').Trim() } }
    return @{ ok = -not $result.is_error; message = $result.result; cost = [math]::Round([double]$result.total_cost_usd, 4) }
}

if ($Forget) {
    if (Test-Path -LiteralPath $store) { Remove-Item -LiteralPath $store -Force }
    if (Test-Path -LiteralPath $store) { throw "Could not delete $store." }
    Write-Host 'Saved token deleted.'
    return
}
# Inside a Claude session the CLAUDE_* variables would reach the child and change its auth.
if ($env:CLAUDECODE) { throw 'Run this from a plain PowerShell, not inside a Claude session.' }
$stray = 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY' | Where-Object { Test-Path "env:$_" }
if ($stray) { throw "Unset $($stray -join ', ') first: they override the token." }
$claude = (Get-Command claude -ErrorAction Stop).Source

$flowModel = if ($Model) { $Model } else { 'claude-sonnet-5-5' }
$switchModel = if ($SwitchModel) { $SwitchModel } else { 'claude-haiku-5-5' }
if ($CheckOnly) {
    $spendDesc = 'token check only (one Haiku reply), about $0.01'
} elseif ($Step7) {
    $spendDesc = "step 7 on $switchModel after a setup turn on $flowModel, about `$0.05-0.15"
} else {
    $spendDesc = "steps 0-8 on $flowModel, about `$0.20-1.00"
}
Write-Host "This spends real Claude plan usage: $spendDesc."
# No switch to skip: only a human typing yes can authorize spend.
$answer = Read-Host 'Type yes to continue'
if ($answer -ne 'yes') { throw 'Cancelled: nothing was spent.' }

$token, $source = readToken
if ($token -notmatch $tokenPattern) {
    throw "The token from $source does not look like a setup-token token (expected sk-ant-oat01-..., got $($token.Length) characters). Copy it again and re-run with -NewToken."
}
$check = testToken $token
if (-not $check.ok) {
    $hint = if ($source -eq 'the saved copy') { ' Re-run with -NewToken.' } else { '' }
    throw "Token from $source was rejected: $($check.message)$hint"
}
Write-Host "Token OK ($source, check cost `$$($check.cost))."
if ($source -ne 'the saved copy') {
    New-Item -ItemType Directory -Force (Split-Path $store) | Out-Null
    ConvertTo-SecureString $token -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $store
}
if ($CheckOnly) { return }

$values = @{ OC_REAL_MODEL = '1'; CLAUDE_CODE_OAUTH_TOKEN = $token }
if ($Model) { $values.OC_REAL_MODEL_ID = $Model }
if ($SwitchModel) { $values.OC_REAL_SWITCH_MODEL_ID = $SwitchModel }
if ($Step7) { $values.OC_REAL_ONLY = '7' }
$start = Get-Date
Push-Location "$repoRoot\src\packages\opencode"
try {
    withEnv $values { & bun test test/provider/claude-code/realModel.test.ts }
    if ($LASTEXITCODE) { throw "real-model flow failed (exit $LASTEXITCODE)." }
}
finally {
    Pop-Location
    # The test writes its report even when it fails; an older report is not this run's.
    $report = Get-ChildItem -LiteralPath $repoRoot -Filter 'claudeFlowReport-*.md' |
        Where-Object LastWriteTime -ge $start | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($report) { Write-Host "Report: $($report.FullName)" }
}
if (-not $report) { throw 'No report was written: the flow was skipped (is claude on PATH for bun?).' }
