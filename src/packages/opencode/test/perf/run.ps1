param([ValidateSet('all','M1','M2','M3','M4','M5','M6','P1','P2','P3','P4','P6','P7','P8','P9','P10','P11','cleanup')][string]$Metric = 'all')
# Runs one opt-in performance probe (see README.md). Prints the run directory; the full bun test
# output goes to rerun-<metric>-<time>.log beside the runs.
$ErrorActionPreference = 'Stop'
if ($Metric -eq 'M5') { 'M5 skipped: optional session-switch metric is not implemented.'; exit 0 }
$package = (Resolve-Path -LiteralPath "$PSScriptRoot\..\..").Path
$out = if ($env:OC_PERF_OUT) { $env:OC_PERF_OUT } else { 'C:\ocTestTmp\ocPerfRuns' }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$env:OC_PERF_PROBE = '1'
$env:OC_PERF_METRIC = $Metric
$env:OC_PERF_OUT = $out
$file = if ($Metric -eq 'cleanup') { './test/perf/cleanup.test.ts' } else { './test/perf/probe.test.ts' }
$log = "$out\rerun-$Metric-$(Get-Date -Format 'yyyyMMdd-HHmmssfff').log"
& bun --cwd $package test $file *> $log
$code = $LASTEXITCODE
if ($code -ne 0) { throw "Probe failed ($code). See $log" }
if ($Metric -eq 'cleanup') { "cleanup check passed. Log: $log"; exit 0 }
$run = (Get-Content -LiteralPath "$out\latest.txt" -Raw).Trim()
$run | Set-Content -LiteralPath "$out\$Metric-run.txt"
$run
